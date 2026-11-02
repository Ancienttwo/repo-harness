import { assertSessionDirectory, assertCreated, classicRecordRetired, taskSessionDirectory, sameSessionData, readStartIntent, readTaskAgent, readTaskBinding, readWorkspaceBinding, workspaceDirectory,
  type CreatedTerminal, type HerdrCoreEndpoint, type HerdrTaskAgentSpec, type HerdrTaskBinding, type ObjectOwnership, type StartIntent,
  type TaskPaneBinding, type TaskWorkspaceBinding, type TerminalStartIntent, type TerminalTaskBinding } from './task-session-record';
import { observeTaskSessionAdmission, taskBindingSha256 } from './task-session-admission';
import { ensureSessionDirectory, nextSessionRound, processIdentity, readSessionArtifact, writeSessionArtifact, writeSessionBytes } from './task-session-io';
import { constants, closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, renameSync } from 'fs';
import { execFileSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { isAbsolute, join, relative } from 'path';
import type { TaskSessionAuthority } from '../admission/admission-source';
import { validateTaskClaimReference } from '../../core/review/authority-context';
import type { ProcessProof, TaskCleanupResult, TaskPrePromptInbox, TaskRequest, TaskResult, TaskSessionAdmission, TerminalHostSpec } from '../../core/review/runner-port';
import { gitExecFileSync } from '../git/runner';
import { configuredGitBinary } from '../git/common-directory';
import { taskSessionKey } from '../git/repository-identity';
import { recordWorktree, readWorktreeRecord, endWorktreeRecord } from '../git/worktree-record';
import { taskRepository, type TaskRepository } from '../git/task-repository';
import { ExclusiveLockContentionError, withCallerLock } from '../locking/exclusive-directory-lock';
import { HerdrCoreError, RH_LABEL, RH_NOTIFY_LABELS, RH_ROLE, hcGet, hcKill, hcList, hcRm, hcRun, hcSend, isHcAddress,
  type HcLabels, type HcTerminal, type HerdrCoreOptions } from './herdr-core';
import { oarObservationFile, readOarObservation } from './task-runtime-observation';

function recheckTaskAdmission(repoRoot: string, binding: Pick<TaskPaneBinding, 'task' | 'role' | 'harness_kind' | 'runtime' | 'task_admission'>,
  authority?: TaskSessionAuthority): TaskSessionAdmission | undefined {
  if (!binding.task_admission && !authority) return undefined; // Generic runtime use has no task admission.
  if (!binding.task_admission || !authority) throw new Error('task_agent_admission_required');
  const current = observeTaskSessionAdmission(repoRoot, binding, binding.runtime, authority);
  if (!sameSessionData(current.identity, binding.task_admission.identity)) throw new Error('task_agent_admission_changed');
  return current;
}

export function assertProcessProof(proof: ProcessProof): void {
  if (processIdentity(proof.pid) !== proof.identity) throw new Error('task_agent_process_identity_lost');
}
export function processProofAlive(proof: ProcessProof): boolean {
  try { process.kill(proof.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
  try {
    let identityError: unknown;
    try { assertProcessProof(proof); } catch (error) { identityError = error; }
    // Read exit state after identity: macOS can discard argv before the parent
    // reaps, while Linux zombies may keep comm unchanged. Never relax a live proof.
    let snapshot: string[];
    try {
      snapshot = execFileSync('ps', ['-p', String(proof.pid), '-o', 'pid=,pgid=,lstart=,stat='], { encoding: 'utf8' }).trim().split(/\s+/);
    } catch (error) { throw identityError ?? error; }
    const recorded = proof.identity.split(/\s+/);
    const stat = snapshot[7] ?? '';
    if (snapshot.length < 8 || snapshot[0] !== String(proof.pid) || snapshot.slice(0, 7).join(' ') !== recorded.slice(0, 7).join(' ')) {
      throw new Error('task_agent_process_identity_lost');
    }
    // Darwin E was observed as ?E+ during real Codex shutdown (before Z).
    if (stat.startsWith('Z') || (process.platform === 'darwin' && stat.includes('E'))) return false;
    if (identityError) throw identityError;
  } catch (error) {
    // Exit can occur between kill(0) and ps. Confirm absence; an extant reused
    // PID or a permission/inspection failure remains a hard identity refusal.
    try { process.kill(proof.pid, 0); } catch (gone) { if ((gone as NodeJS.ErrnoException).code === 'ESRCH') return false; throw gone; }
    throw error;
  }
  return true;
}
export function beginSessionRound(dir: string, round: number, identity: unknown): void {
  writeSessionArtifact(join(dir, `started-${round}.json`), identity);
}
export function saveSessionRoundResult(dir: string, round: number, result: unknown): void {
  if (!existsSync(join(dir, `started-${round}.json`))) throw new Error('task_agent_result_without_started_request');
  writeSessionArtifact(join(dir, `result-${round}.json`), result);
}

/** The socket names the core. A caller terminal lends its identity only to its own core. */
export function validateHerdrCoreEndpoint(endpoint: HerdrCoreEndpoint): string {
  if (!endpoint || typeof endpoint !== 'object' || typeof endpoint.socket !== 'string' || !isAbsolute(endpoint.socket)
    || (endpoint.home !== undefined && (typeof endpoint.home !== 'string' || !isAbsolute(endpoint.home)))) throw new Error('herdr_core_endpoint_invalid');
  return endpoint.socket;
}
function coreOptions(endpoint: HerdrCoreEndpoint): HerdrCoreOptions {
  const env: NodeJS.ProcessEnv = { ...process.env, HC_SOCKET: validateHerdrCoreEndpoint(endpoint) };
  if (env.HC_TERMINAL_SOCKET !== endpoint.socket) { delete env.HC_TERMINAL_ID; delete env.HC_TERMINAL_SOCKET; delete env.HC_SCOPE; }
  return { env };
}
function notFound(error: unknown): boolean { return error instanceof HerdrCoreError && error.kind === 'not_found'; }
const OWN_LABEL_KEYS: ReadonlySet<string> = new Set(Object.values(RH_LABEL));
/** Herdr.app adds its own keys (herdr.space, herdr.tab) to a terminal it shows, so identity reads only the repo-harness keys. */
function ownLabels(labels: HcLabels): HcLabels {
  return Object.fromEntries(Object.entries(labels).filter(([key]) => OWN_LABEL_KEYS.has(key)));
}
/** The labels that `hc run` sets; they are the only identity a task-session terminal has besides its address and name. */
function sessionLabels(session: { repository_id: string; task: string; role: string; harness_kind: string }, intentId: string): HcLabels {
  return { [RH_LABEL.role]: RH_ROLE.taskSession, [RH_LABEL.task]: taskSessionKey(session.repository_id, session.task, session.role),
    [RH_LABEL.request]: intentId, [RH_LABEL.harness]: session.harness_kind, ...RH_NOTIFY_LABELS };
}
function intentLabels(intent: StartIntent): HcLabels {
  return sessionLabels({ ...intent.spec, repository_id: intent.repository.repository_id }, intent.intent_id);
}
/** The bound terminal by address, name, labels and program pid; null after it was removed. */
function readBoundTerminal(binding: HerdrTaskBinding): HcTerminal | null {
  assertCreated(binding.ownership);
  let terminal: HcTerminal;
  try { terminal = hcGet(binding.terminal_id, coreOptions(binding.endpoint)); }
  catch (error) { if (notFound(error)) return null; throw error; }
  if (terminal.address !== binding.terminal_id || terminal.name !== binding.terminal_name || terminal.pid !== binding.provider.pid
    || !sameSessionData(ownLabels(terminal.labels), sessionLabels(binding, binding.ownership.intent_id))) throw new Error('task_agent_terminal_identity_lost');
  return terminal;
}
function assertTerminalProcess(provider: ProcessProof, command: readonly string[]): void {
  assertProcessProof(provider);
  // A UTF-8 locale keeps darwin ps from escaping non-ASCII argv bytes.
  const args = execFileSync('ps', ['-ww', '-p', String(provider.pid), '-o', 'args='], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'en_US.UTF-8' } }).trim();
  if (args !== command.join(' ')) throw new Error('task_agent_terminal_host_command_mismatch');
}
export function assertTaskBinding(binding: TaskPaneBinding, allowExitedProvider = false): void {
  if (binding.protocol !== 2) throw new Error('task_agent_binding_invalid');
  if (binding.task_admission) {
    const identity = binding.task_admission.identity;
    validateTaskClaimReference(identity.claim);
    if (identity.task !== binding.task || identity.role !== binding.role || identity.runtime !== binding.runtime
      || identity.harness_kind !== binding.harness_kind || identity.execution_root !== binding.execution_root) throw new Error('task_agent_admission_changed');
  }
  if (binding.runtime === 'terminal') {
    assertCreated(binding.ownership);
    if (processProofAlive(binding.provider)) assertTerminalProcess(binding.provider, binding.command);
    else if (!allowExitedProvider) throw new Error('task_agent_provider_exited');
    return;
  }
  if (binding.runtime !== 'herdr-core') throw new Error('task_agent_binding_invalid');
  // Read the terminal before the process: an exit between the two reads is an exit, never a lost identity.
  const terminal = readBoundTerminal(binding);
  if (!processProofAlive(binding.provider)) {
    if (!allowExitedProvider) throw new Error('task_agent_provider_exited');
    return;
  }
  if (terminal?.state !== 'live') throw new Error('task_agent_terminal_identity_lost');
}
function archiveWorkspaceIncarnation(dir: string, reason: string): void {
  const history = join(dir, 'history', randomUUID());
  ensureSessionDirectory(dir, history);
  writeSessionArtifact(join(history, 'archived.json'), { reason });
  for (const name of ['binding.json', 'closed.json']) {
    const path = join(dir, name);
    if (existsSync(path)) renameSync(path, join(history, name));
  }
  for (const path of [history, dir]) {
    const fd = openSync(path, constants.O_RDONLY);
    try { fsyncSync(fd); } finally { closeSync(fd); }
  }
}
/** Records the hc addressing of a checkout. hc has no workspace, so registration creates nothing in the core. */
export async function registerTaskWorktree(repoRoot: string, endpoint: HerdrCoreEndpoint, guard?: () => void): Promise<TaskWorkspaceBinding> {
  guard?.();
  validateHerdrCoreEndpoint(endpoint);
  const repository = taskRepository(repoRoot); const dir = workspaceDirectory(repository);
  ensureSessionDirectory(repository.primary_root, dir);
  return withCallerLock(repository.primary_root, dir, async () => {
    guard?.();
    const path = join(dir, 'binding.json');
    if (existsSync(join(dir, 'open-intent.json'))) classicRecordRetired(join(dir, 'open-intent.json'));
    const closed = existsSync(join(dir, 'closed.json'));
    if (existsSync(path)) {
      const binding = readWorkspaceBinding(path);
      if (!closed) {
        if (!sameSessionData(binding.endpoint, endpoint)) throw new Error('task_agent_workspace_endpoint_changed');
        return binding;
      }
    }
    if (closed) archiveWorkspaceIncarnation(dir, 'closed_incarnation');
    const binding: TaskWorkspaceBinding = { protocol: 2, repository, endpoint };
    writeSessionArtifact(path, binding); return binding;
  });
}
function validateSpec(spec: HerdrTaskAgentSpec): void {
  validateHerdrCoreEndpoint(spec.endpoint); // Before directory, intent, terminal or lock creation.
  // A parent field is the retired request shape (#1474 decision 4); its saved intent would refuse its own cleanup.
  if (Object.hasOwn(spec, 'parent_terminal') || Object.hasOwn(spec, 'parent_pane')) classicRecordRetired('start request');
  if (!spec.task?.trim() || !/^[a-z][a-z0-9_-]{0,31}$/.test(spec.role)
    || !spec.harness_kind?.trim() || !Array.isArray(spec.args)
    || spec.args.some(arg => typeof arg !== 'string') || !Number.isSafeInteger(spec.max_requests) || spec.max_requests < 1 || spec.max_requests > 100) {
    throw new Error('task_agent_spec_invalid');
  }
}
function bindStartedAgent(intent: StartIntent, created: CreatedTerminal): HerdrTaskBinding {
  const terminal = hcGet(created.terminal_id, coreOptions(intent.spec.endpoint));
  if (terminal.address !== created.terminal_id || terminal.name !== intent.terminal_name
    || !sameSessionData(ownLabels(terminal.labels), intentLabels(intent))) throw new Error('task_agent_start_identity_unknown');
  // The terminal's program is the provider and leads its own process group.
  if (terminal.state !== 'live' || terminal.pid === null) throw new Error('task_agent_provider_identity_unknown');
  const ownership: ObjectOwnership = { disposition: 'created', intent_id: intent.intent_id };
  const provider = { pid: terminal.pid, identity: processIdentity(terminal.pid), ownership };
  const binding: HerdrTaskBinding = { protocol: 2, repository_id: intent.repository.repository_id, execution_root: intent.repository.execution_root,
    runtime: 'herdr-core', task: intent.spec.task, role: intent.spec.role, harness_kind: intent.spec.harness_kind, endpoint: intent.spec.endpoint,
    max_requests: intent.spec.max_requests, terminal_id: created.terminal_id, terminal_name: created.terminal_name, provider, ownership,
    ...(intent.task_admission ? { task_admission: intent.task_admission } : {}) };
  assertTaskBinding(binding);
  return binding;
}
/** Existing intents only reconcile; they never repeat a launch. */
function reconcile(dir: string, intent: StartIntent): HerdrTaskBinding {
  if (!existsSync(join(dir, 'terminal-created.json')) || !existsSync(join(dir, 'launch-intent.json')) || !existsSync(join(dir, 'provider-created.json'))) {
    const live = existsSync(join(dir, 'launch-intent.json')) ? hcList(intentLabels(intent), coreOptions(intent.spec.endpoint)) : [];
    writeSessionArtifact(join(dir, 'reconciliation.json'), { status: 'reconciliation_required', live }, false);
    throw new Error('task_agent_start_reconciliation_required');
  }
  const created = readSessionArtifact<CreatedTerminal>(join(dir, 'terminal-created.json'));
  if (created.intent_id !== intent.intent_id) throw new Error('task_agent_start_identity_unknown');
  const launch = readSessionArtifact<{ intent_id: string }>(join(dir, 'launch-intent.json'));
  if (launch.intent_id !== intent.intent_id) throw new Error('task_agent_start_identity_unknown');
  const binding = readSessionArtifact<HerdrTaskBinding>(join(dir, 'provider-created.json'));
  if (!sameSessionData(binding.task_admission ?? null, intent.task_admission ?? null)
    || binding.task !== intent.spec.task || binding.role !== intent.spec.role || binding.terminal_id !== created.terminal_id
    || binding.terminal_name !== intent.terminal_name || binding.ownership.disposition !== 'created' || binding.ownership.intent_id !== intent.intent_id) throw new Error('task_agent_start_identity_unknown');
  assertTaskBinding(binding);
  writeSessionArtifact(join(dir, 'binding.json'), binding);
  return binding;
}
/** A contending starter waits this long for the lock holder, which can wait up to 50 s for its host to be ready. */
const TASK_START_LOCK_WAIT_MS = 70_000;
export interface TaskStartEffects {
  /** The program of the new terminal. It is an internal seam, never CLI input. */
  argv: readonly [string, ...string[]];
  /** Resolves once the program in the new terminal is ready for requests. */
  ready: (terminal: string) => Promise<void>;
  boundary?: (phase: 'intent' | 'created' | 'launched') => Promise<void>;
  contended?: () => void;
  /** Trusted caller fence checked after lock waits and before side effects. */
  guard?: () => void;
  taskAuthority?: TaskSessionAuthority;
}
export async function startTaskAgent(repoRoot: string, spec: HerdrTaskAgentSpec, effects: TaskStartEffects): Promise<HerdrTaskBinding> {
  effects.guard?.();
  spec = structuredClone(spec);
  validateSpec(spec);
  const repository = taskRepository(repoRoot); const root = repository.primary_root; const dir = taskSessionDirectory(root, spec.task, spec.role);
  const taskAdmission = effects.taskAuthority ? observeTaskSessionAdmission(repoRoot, spec, 'herdr-core', effects.taskAuthority) : undefined;
  const recheck = () => { effects.guard?.(); recheckTaskAdmission(repoRoot,
    { ...spec, runtime: 'herdr-core', task_admission: taskAdmission }, effects.taskAuthority); };
  recheck();
  ensureSessionDirectory(root, dir);
  return withCallerLock(root, dir, async () => {
    recheck();
    if (existsSync(join(dir, 'closed.json'))) throw new Error('task_agent_session_closed');
    if (existsSync(join(dir, 'binding.json'))) {
      const intent = readStartIntent(join(dir, 'intent.json'));
      if (intent.runtime !== 'herdr-core' || !sameSessionData(intent.spec, spec)) throw new Error('task_agent_spec_changed');
      const binding = readTaskBinding(join(dir, 'binding.json'));
      if (binding.runtime !== 'herdr-core') throw new Error('task_agent_spec_changed');
      recheckTaskAdmission(repoRoot, binding, effects.taskAuthority);
      assertTaskBinding(binding); return binding;
    }
    if (existsSync(join(dir, 'intent.json'))) {
      const intent = readStartIntent(join(dir, 'intent.json'));
      if (intent.runtime !== 'herdr-core' || !sameSessionData(intent.spec, spec)) throw new Error('task_agent_spec_changed');
      recheckTaskAdmission(repoRoot, { ...intent.spec, runtime: 'herdr-core', task_admission: intent.task_admission }, effects.taskAuthority);
      return reconcile(dir, intent);
    }
    if (repository.execution_root !== repository.primary_root) {
      recordWorktree(repository.primary_root, repository.execution_root, { creator: 'task', purpose: 'task agent', task_id: spec.task });
    }
    await registerTaskWorktree(repository.execution_root, spec.endpoint, recheck);
    recheck();
    const intent: StartIntent = { protocol: 2, runtime: 'herdr-core', repository, intent_id: randomUUID(),
      terminal_name: `task-${randomUUID().replaceAll('-', '').slice(0, 20)}`, spec, ...(taskAdmission ? { task_admission: taskAdmission } : {}) };
    writeSessionArtifact(join(dir, 'intent.json'), intent);
    await effects.boundary?.('intent');
    recheck();
    // Once this marker exists, a failed or lost launch may still have created a terminal; its labels find it.
    writeSessionArtifact(join(dir, 'launch-intent.json'), { intent_id: intent.intent_id });
    let created: CreatedTerminal;
    try {
      // No parent: the session ends only through close or cancel, and hc types no notes into the caller.
      const terminal = hcRun({ argv: effects.argv, labels: intentLabels(intent), name: intent.terminal_name,
        cwd: repository.execution_root, noParent: true }, coreOptions(spec.endpoint));
      created = { intent_id: intent.intent_id, terminal_id: terminal.address, terminal_name: intent.terminal_name };
      writeSessionArtifact(join(dir, 'terminal-created.json'), created);
      await effects.boundary?.('created');
      recheck();
      await effects.ready(created.terminal_id);
      recheck();
    } catch (error) {
      writeSessionArtifact(join(dir, 'launch-unknown.json'), { intent_id: intent.intent_id, error: String(error) });
      throw new Error('task_agent_ambiguous_launch; inspect or cancel the same start; never replay');
    }
    const binding = bindStartedAgent(intent, created);
    writeSessionArtifact(join(dir, 'provider-created.json'), binding);
    await effects.boundary?.('launched');
    recheck();
    assertTaskBinding(binding);
    writeSessionArtifact(join(dir, 'binding.json'), binding);
    return binding;
  }, effects.contended, TASK_START_LOCK_WAIT_MS).catch(error => {
    if (error instanceof ExclusiveLockContentionError) throw new Error('task_agent_start_in_progress');
    throw error;
  });
}

/** Internal fixed application-host seam; never exposed as CLI/MCP command input.
 * The execution owner is the foreground host. Native children are OAR-owned,
 * and must be disposed before the existing task-agent pane cleanup is invoked.
 */
function assertApplicationHostCommand(command: readonly string[]): void {
  const bundle = join(import.meta.dir, '../../../dist/oar-review-host.js');
  if (command.length !== 4 || !isAbsolute(command[0]!) || command[1] !== '--disable-sigusr1'
    || !existsSync(bundle) || command[2] !== realpathSync(bundle) || !isAbsolute(command[3]!)
    || command.some(arg => /[\r\n]/.test(arg))) throw new Error('task_agent_application_host_command_invalid');
}
/** The process readback joins argv with spaces, so an argument must not contain one. */
export function assertTerminalHostCommand(command: readonly string[]): void {
  assertApplicationHostCommand(command);
  if (command.some(arg => /\s/.test(arg))) throw new Error('task_agent_terminal_host_path_whitespace');
}
export async function startTaskApplicationHost(repoRoot: string, spec: HerdrTaskAgentSpec,
  command: readonly string[], ready: () => Promise<void>, guard?: () => void, taskAuthority?: TaskSessionAuthority): Promise<HerdrTaskBinding> {
  if (spec.args.length !== 0) throw new Error('task_agent_application_host_command_invalid');
  assertApplicationHostCommand(command);
  return startTaskAgent(repoRoot, spec, { guard, taskAuthority, argv: command as [string, ...string[]], ready: async () => {
    guard?.();
    await ready();
    guard?.();
  } });
}

/** Binds a host that an operator terminal started from `command`. The owner
 * never launches it. `launched` returns the process the domain host reported,
 * or null while nothing was launched; then the caller asks the operator to run
 * the same command. The intent fixes that command; a later bind never changes it. */
export async function bindTerminalApplicationHost(repoRoot: string, spec: TerminalHostSpec, command: readonly string[],
  launched: () => Promise<ProcessProof | null>, taskAuthority?: TaskSessionAuthority): Promise<TaskPaneBinding | null> {
  spec = { task: spec.task, role: spec.role, harness_kind: spec.harness_kind, max_requests: spec.max_requests };
  if (!spec.task?.trim() || !/^[a-z][a-z0-9_-]{0,31}$/.test(spec.role) || !spec.harness_kind?.trim()
    || !Number.isSafeInteger(spec.max_requests) || spec.max_requests < 1 || spec.max_requests > 100) throw new Error('task_agent_spec_invalid');
  assertTerminalHostCommand(command);
  const repository = taskRepository(repoRoot); const root = repository.primary_root; const dir = taskSessionDirectory(root, spec.task, spec.role);
  const taskAdmission = taskAuthority ? observeTaskSessionAdmission(repoRoot, spec, 'terminal', taskAuthority) : undefined;
  const recheck = () => recheckTaskAdmission(repoRoot, { ...spec, runtime: 'terminal', task_admission: taskAdmission }, taskAuthority);
  recheck();
  ensureSessionDirectory(root, dir);
  return withCallerLock(root, dir, async () => {
    recheck();
    if (existsSync(join(dir, 'closed.json'))) throw new Error('task_agent_session_closed');
    let intent: TerminalStartIntent;
    if (existsSync(join(dir, 'intent.json'))) {
      intent = readSessionArtifact<TerminalStartIntent>(join(dir, 'intent.json'));
      if (intent.runtime !== 'terminal' || !sameSessionData(intent.spec, spec) || !sameSessionData(intent.command, command)) throw new Error('task_agent_spec_changed');
    } else {
      intent = { ...(taskAdmission ? { task_admission: taskAdmission } : {}), protocol: 2, runtime: 'terminal', repository, intent_id: randomUUID(), spec, command: [...command] };
      writeSessionArtifact(join(dir, 'intent.json'), intent);
    }
    recheckTaskAdmission(repoRoot, { ...intent.spec, runtime: 'terminal', task_admission: intent.task_admission }, taskAuthority);
    if (existsSync(join(dir, 'binding.json'))) {
      const binding = readTaskAgent(root, spec.task, spec.role).binding;
      recheckTaskAdmission(repoRoot, binding, taskAuthority);
      assertTaskBinding(binding); return binding;
    }
    const reported = await launched();
    recheck();
    if (reported === null) return null;
    const ownership: ObjectOwnership = { disposition: 'created', intent_id: intent.intent_id };
    const provider = { pid: reported.pid, identity: reported.identity };
    assertTerminalProcess(provider, command);
    const binding: TerminalTaskBinding = { protocol: 2, repository_id: repository.repository_id, execution_root: repository.execution_root,
      runtime: 'terminal', task: spec.task, role: spec.role, harness_kind: spec.harness_kind, command: [...command],
      ownership, provider: { ...provider, ownership }, max_requests: spec.max_requests, ...(intent.task_admission ? { task_admission: intent.task_admission } : {}) };
    writeSessionArtifact(join(dir, 'provider-created.json'), binding);
    writeSessionArtifact(join(dir, 'binding.json'), binding);
    return binding;
  });
}

function requestOutbox(binding: TaskPaneBinding, dir: string): string {
  return join(binding.execution_root, '.ai/harness/runs/task-agent-outbox', dir.split('/').pop()!);
}
function assertTaskRequest(root: string, dir: string, request: TaskRequest): { binding: TaskPaneBinding; outbox: string } {
  const { binding, dir: expectedDir } = readTaskAgent(root, request.task, request.role);
  const outbox = requestOutbox(binding, dir);
  if (request.protocol !== 2 || dir !== expectedDir || !Number.isSafeInteger(request.round) || request.round < 1
    || !sameSessionData(readSessionArtifact<TaskRequest>(join(dir, `request-${request.round}.json`)), request)
    || request.result_ref !== join(outbox, `result-${request.round}.json`)
    || request.context_ref !== join(outbox, `context-${request.round}.txt`)) throw new Error('task_agent_result_ref_mismatch');
  if (binding.task_admission) {
    if (request.session_binding_sha256 !== taskBindingSha256(binding) || !request.task_admission
      || !sameSessionData(request.task_admission.identity, binding.task_admission.identity)) throw new Error('task_agent_request_admission_mismatch');
  } else if (request.task_admission || request.session_binding_sha256) throw new Error('task_agent_request_admission_mismatch');
  assertSessionDirectory(binding.execution_root, outbox);
  return { binding, outbox };
}
function validateTaskResult(request: TaskRequest, value: unknown): TaskResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('task_agent_result_identity_mismatch');
  const result = value as TaskResult;
  if (Object.keys(result).sort().join(',') !== 'context_sha256,request_id,value'
    || result.request_id !== request.request_id || result.context_sha256 !== request.context_sha256) throw new Error('task_agent_result_identity_mismatch');
  return result;
}
export function readTaskRequestResult(root: string, dir: string, request: TaskRequest): TaskResult | null {
  assertTaskRequest(root, dir, request);
  if (!existsSync(request.result_ref)) return null;
  let value: unknown;
  try { value = readSessionArtifact(request.result_ref); }
  catch (error) { if (error instanceof SyntaxError) return null; throw error; }
  return validateTaskResult(request, value);
}
/** The owner validates the transport result before immutable primary ingestion. */
export async function collectTaskResult(repoRoot: string, task: string, role: string, round: number, guard?: () => void, taskAuthority?: TaskSessionAuthority): Promise<TaskResult | null> {
  guard?.();
  const repository = taskRepository(repoRoot);
  const { dir, binding } = readTaskAgent(repoRoot, task, role);
  recheckTaskAdmission(repoRoot, binding, taskAuthority);
  if (!Number.isSafeInteger(round) || round < 1) throw new Error('task_agent_round_invalid');
  return withCallerLock(repository.primary_root, dir, async () => {
    guard?.();
    const request = readSessionArtifact<TaskRequest>(join(dir, `request-${round}.json`));
    const current = recheckTaskAdmission(repoRoot, binding, taskAuthority);
    if (current && !sameSessionData(request.task_admission?.approval ?? null, current.approval)) throw new Error('task_agent_request_context_changed');
    const result = readTaskRequestResult(repoRoot, dir, request);
    if (!result) return null;
    const path = join(dir, `collected-${round}.json`);
    if (existsSync(path)) {
      const previous = validateTaskResult(request, readSessionArtifact(path));
      if (!sameSessionData(previous, result)) throw new Error('task_agent_result_conflict');
      return previous;
    }
    guard?.();
    const final = recheckTaskAdmission(repoRoot, binding, taskAuthority);
    if (final && !sameSessionData(request.task_admission?.approval ?? null, final.approval)) throw new Error('task_agent_request_context_changed');
    writeSessionArtifact(path, result);
    return result;
  });
}
export async function sendTaskRequest(repoRoot: string, task: string, role: string, contextRef: string, contextPolicy: 'repeatable' | 'changed_only', applicationDelivery: (request: TaskRequest) => Promise<void>,
  /** Internal fixture barrier. It is never accepted from CLI or PM input. */
  publicationBoundary?: (request: TaskRequest) => Promise<void>, guard?: () => void, taskAuthority?: TaskSessionAuthority,
  preparePrePrompt?: (request: TaskRequest) => TaskPrePromptInbox): Promise<TaskRequest> {
  const repository = taskRepository(repoRoot); const root = repository.primary_root; const { dir, binding } = readTaskAgent(root, task, role);
  const current = recheckTaskAdmission(repoRoot, binding, taskAuthority);
  const recheck = () => {
    guard?.();
    const observed = recheckTaskAdmission(repoRoot, binding, taskAuthority);
    if (current && !sameSessionData(observed?.approval ?? null, current.approval)) throw new Error('task_agent_request_context_changed');
  };
  return withCallerLock(root, dir, async () => {
    recheck();
    if (!['repeatable', 'changed_only'].includes(contextPolicy)) throw new Error('task_agent_context_policy_invalid');
    assertTaskBinding(binding);
    if (existsSync(join(dir, 'closed.json'))) throw new Error('task_agent_session_closed');
    const contextPath = realpathSync(join(repository.execution_root, contextRef));
    if (isAbsolute(contextRef) || relative(repository.execution_root, contextPath).split('/').includes('..') || !lstatSync(contextPath).isFile()) throw new Error('task_agent_context_ref_unsafe');
    const bytes = readFileSync(contextPath);
    if (bytes.length > 10 * 1024 * 1024) throw new Error('task_agent_context_too_large');
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const round = nextSessionRound<TaskRequest>(dir, binding.max_requests, digest, prior => {
      if (!readTaskRequestResult(root, dir, prior)) throw new Error('task_agent_ambiguous_round');
      return contextPolicy === 'changed_only' ? prior.context_sha256 : '';
    }, 'started');
    const outbox = requestOutbox(binding, dir);
    ensureSessionDirectory(binding.execution_root, outbox);
    const request: TaskRequest = { ...(current ? { task_admission: current, session_binding_sha256: taskBindingSha256(binding) } : {}), protocol: 2, task, role, round, request_id: randomUUID(),
      context_ref: join(outbox, `context-${round}.txt`), source_ref: contextPath,
      context_sha256: digest, result_ref: join(outbox, `result-${round}.json`),
      result_contract: { required_fields: ['request_id', 'context_sha256', 'value'], atomic_write: 'temp_rename' } };
    if (preparePrePrompt) {
      // An unpublished preparation keeps its exact request identity and budget.
      const draftPath = join(dir, `request-draft-${round}.json`);
      if (existsSync(draftPath)) {
        const draft = readSessionArtifact<TaskRequest>(draftPath);
        if (draft.task !== request.task || draft.role !== request.role || draft.round !== round
          || draft.context_sha256 !== request.context_sha256 || draft.source_ref !== request.source_ref
          || draft.session_binding_sha256 !== request.session_binding_sha256
          || !sameSessionData(draft.task_admission, request.task_admission)) throw new Error('task_agent_request_context_changed');
        Object.assign(request, draft);
      } else writeSessionArtifact(draftPath, request);
      request.pre_prompt_inbox = preparePrePrompt(request);
      recheck();
    }
    const requestPath = join(dir, `request-${round}.json`);
    recheck();
    writeSessionArtifact(requestPath, request);
    if (publicationBoundary) await publicationBoundary(request);
    recheck();
    writeSessionBytes(request.context_ref, content);
    beginSessionRound(dir, round, { request_id: request.request_id, provider: binding.provider });
    // Once this marker exists, a crash/nonzero/timeout can mean input was sent.
    // Inspect the same request/result files. Never replay it or allocate a fresh one.
    try {
      await applicationDelivery(request);
    } catch (error) {
      writeSessionArtifact(join(dir, `delivery-${round}.json`), { request_id: request.request_id, state: 'unknown', error: String(error) });
      throw new Error('task_agent_delivery_unknown; inspect the same request/result before further action');
    }
    // Successful transport ACK is a durable fact. A later authority denial
    // refuses further work, but must not turn accepted delivery into unknown.
    writeSessionArtifact(join(dir, `delivery-${round}.json`), { request_id: request.request_id, state: 'accepted' });
    recheck();
    return request;
  });
}
export interface WorktreeMergeNotice {
  pr: number;
  merge_sha: string;
  worktree: string;
  branch: string;
}
export interface WorktreeMergeNotification {
  status: 'notified' | 'already_notified' | 'owner_gone' | 'retained';
  reason?: string;
}
/** The caller owns merge readback. A notice carries no publication or deletion grant. */
export async function notifyTaskWorktreeMerged(repoRoot: string, owner: string,
  notice: WorktreeMergeNotice): Promise<WorktreeMergeNotification> {
  // The owner is an hc terminal address (t7, t1b). A classic pane id is refused here.
  if (!isHcAddress(owner) || !Number.isSafeInteger(notice.pr) || notice.pr < 1
    || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(notice.merge_sha)) {
    throw new Error('worktree_merge_notice_invalid');
  }
  const repository = taskRepository(repoRoot), execution = taskRepository(notice.worktree);
  if (repository.repository_id !== execution.repository_id || notice.worktree !== execution.execution_root
    || execution.execution_root === repository.primary_root
    || gitExecFileSync(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: notice.worktree, encoding: 'utf8' }).trim() !== notice.branch) {
    throw new Error('worktree_merge_notice_owner_mismatch');
  }
  const dir = workspaceDirectory(execution);
  assertSessionDirectory(repository.primary_root, dir);
  return withCallerLock(repository.primary_root, dir, async () => {
    const receipt = join(dir, `merge-notice-${notice.pr}-${notice.merge_sha}.json`);
    if (existsSync(receipt)) {
      const previous = readSessionArtifact<{ notice: WorktreeMergeNotice; owner: string; state: string }>(receipt);
      if (!sameSessionData(previous.notice, notice) || previous.owner !== owner) throw new Error('worktree_merge_notice_changed');
      return previous.state === 'accepted' ? { status: 'already_notified' }
        : { status: 'retained', reason: 'delivery_unknown; inspect the same terminal before further action; never replay' };
    }
    if (existsSync(join(dir, 'closed.json'))) return { status: 'owner_gone', reason: 'workspace_closed' };
    const binding = readWorkspaceBinding(join(dir, 'binding.json'));
    if (!sameSessionData(binding.repository, execution)) throw new Error('worktree_merge_notice_owner_mismatch');
    const options = coreOptions(binding.endpoint);
    try {
      let terminal: HcTerminal;
      try { terminal = hcGet(owner, options); }
      catch (error) {
        if (notFound(error)) return { status: 'owner_gone', reason: 'agent_exited' };
        // Only repo-harness terminals are addressable; an unlabeled owner gets the notice by hand.
        if (error instanceof HerdrCoreError && error.reason === 'unowned') return { status: 'retained', reason: 'owner_unowned' };
        throw error;
      }
      if (terminal.state !== 'live' || !terminal.foreground) return { status: 'owner_gone', reason: 'agent_exited' };
      if (realpathSync(terminal.foreground.cwd) !== execution.execution_root) throw new Error('task_agent_terminal_identity_lost');
    } catch (error) { return { status: 'retained', reason: String(error) }; }
    const message = [
      'Post-merge worktree closeout. Confirmed merge readback:', JSON.stringify(notice),
      'Inspect tracked changes, untracked files and commits not in the merged PR. Gitignored files do not count as content.',
      'Keep and report remaining content, locks or unknown state. Do not auto-commit or push.',
      'For a merged, clean, unlocked worktree, hand closeout to the orchestrator in the primary checkout.',
      'Acknowledge that inspection is complete, then exit the agent. The orchestrator must confirm agent exit and remove its dispatch-owned terminal under existing authority.',
      'The orchestrator must use existing runtime cleanup and exact branch/path removal to release the binding and active-worktree marker and remove the worktree and branch. Keep and report attached or unknown runtime state.',
      'This notice grants no new merge, push or deletion authority. Report the closeout result.',
    ].join('\n');
    // A timeout can follow accepted input. Record the attempt before transport and never replay it.
    writeSessionArtifact(receipt, { notice, owner, state: 'submitting' });
    try { hcSend(owner, message, options); }
    catch (error) { return { status: 'retained', reason: `delivery_unknown; inspect the same terminal; never replay: ${String(error)}` }; }
    writeSessionArtifact(receipt, { notice, owner, state: 'accepted' }, false);
    return { status: 'notified' };
  });
}

/** Ends a created terminal and confirms its program exit. hc kill ends the whole program group. */
async function endTerminal(endpoint: HerdrCoreEndpoint, address: string, provider: ProcessProof | null): Promise<boolean> {
  const options = coreOptions(endpoint);
  if (hcKill(address, options).state !== 'finished') return false;
  const deadline = Date.now() + 5000;
  while (provider && processProofAlive(provider)) {
    if (Date.now() >= deadline) return false;
    await Bun.sleep(50);
  }
  hcRm(address, options);
  return true;
}
async function closeUnboundTaskStart(dir: string, task: string, role: string, mode: 'close' | 'cancel'): Promise<TaskCleanupResult> {
  const intent = readStartIntent(join(dir, 'intent.json'));
  if (intent.protocol !== 2 || intent.spec.task !== task || intent.spec.role !== role || !intent.intent_id) throw new Error('task_agent_start_identity_unknown');
  if (existsSync(join(dir, 'closed.json'))) return { status: 'closed', pids: [] };
  const finish = () => {
    writeSessionArtifact(join(dir, 'closed.json'), { task, role, intent_id: intent.intent_id, termination: 'unbound-start-cleanup', disposition: mode === 'cancel' ? 'cancelled' : 'incomplete_start' });
    return { status: 'closed' as const, pids: [] };
  };
  // No terminal or process was created here. The domain proves its host's disposal first.
  if (intent.runtime === 'terminal' || !existsSync(join(dir, 'launch-intent.json'))) return finish();
  // A launch creates at most one terminal with the intent's labels, whether or not it was recorded.
  const options = coreOptions(intent.spec.endpoint);
  const recorded = existsSync(join(dir, 'terminal-created.json')) ? readSessionArtifact<CreatedTerminal>(join(dir, 'terminal-created.json')) : null;
  if (recorded && recorded.intent_id !== intent.intent_id) throw new Error('task_agent_start_identity_unknown');
  // `all` also finds a finished terminal whose run receipt was lost.
  const found = hcList(intentLabels(intent), { ...options, all: true });
  if (found.length > 1 || found.some(item => item.name !== intent.terminal_name || (recorded && item.address !== recorded.terminal_id))) throw new Error('task_agent_start_identity_unknown');
  const provider = existsSync(join(dir, 'provider-created.json')) ? readSessionArtifact<HerdrTaskBinding>(join(dir, 'provider-created.json')).provider : null;
  const address = found[0]?.address ?? recorded?.terminal_id;
  let terminal: HcTerminal | null = null;
  if (address) try { terminal = hcGet(address, options); } catch (error) { if (!notFound(error)) throw error; }
  if (terminal) {
    // Remove a terminal only while it still has this start's identity.
    if (terminal.name !== intent.terminal_name || !sameSessionData(ownLabels(terminal.labels), intentLabels(intent))
      || (provider && terminal.pid !== provider.pid)) throw new Error('task_agent_terminal_identity_lost');
    if (terminal.state === 'live') {
      if (!await endTerminal(intent.spec.endpoint, terminal.address, provider)) return { status: 'cleanup_pending', pids: provider ? [provider.pid] : [] };
    } else hcRm(terminal.address, options);
  }
  if (provider && processProofAlive(provider)) return { status: 'cleanup_pending', pids: [provider.pid], reason: 'terminal_absent' };
  return finish();
}
async function cleanupTaskAgent(repoRoot: string, task: string, role: string, mode: 'close' | 'cancel'): Promise<TaskCleanupResult> {
  const repository = taskRepository(repoRoot); const root = repository.primary_root; const dir = taskSessionDirectory(root, task, role);
  assertSessionDirectory(root, dir);
  return withCallerLock<TaskCleanupResult>(root, dir, async () => {
    if (!existsSync(join(dir, 'binding.json'))) return closeUnboundTaskStart(dir, task, role, mode);
    const { binding } = readTaskAgent(root, task, role);
    assertCreated(binding.ownership); assertCreated(binding.provider.ownership);
    if (existsSync(join(dir, 'closed.json'))) return { status: 'closed', pids: [] };
    if (mode === 'close') {
      for (let round = 1; round <= binding.max_requests && existsSync(join(dir, `request-${round}.json`)); round++) {
        const request = readSessionArtifact<TaskRequest>(join(dir, `request-${round}.json`));
        if (!readTaskRequestResult(root, dir, request)) throw new Error('task_agent_pending_request; use explicit cancel');
      }
    }
    const closing = existsSync(join(dir, 'close-intent.json'));
    if (closing && processProofAlive(binding.provider)) assertTaskBinding(binding, true);
    if (!closing) {
      assertTaskBinding(binding, true);
      writeSessionArtifact(join(dir, 'close-intent.json'), { task, role, provider: binding.provider, mode });
    }
    const closed = () => {
      writeSessionArtifact(join(dir, 'closed.json'), { task, role, provider: binding.provider, disposition: mode === 'cancel' ? 'cancelled' : 'completed' });
      return { status: 'closed' as const, pids: [] };
    };
    if (binding.runtime === 'terminal') {
      // The operator terminal owns this process; cleanup never signals it.
      if (processProofAlive(binding.provider)) return { status: 'cleanup_pending', pids: [binding.provider.pid], reason: 'terminal_host_alive' };
      return closed();
    }
    // A removed terminal after a confirmed exit is a cleanup that ended before closed.json.
    if (readBoundTerminal(binding)) {
      if (!await endTerminal(binding.endpoint, binding.terminal_id, binding.provider)) return { status: 'cleanup_pending', pids: [binding.provider.pid] };
    } else if (processProofAlive(binding.provider)) return { status: 'cleanup_pending', pids: [binding.provider.pid], reason: 'terminal_absent' };
    return closed();
  });
}

export function closeTaskAgent(repoRoot: string, task: string, role: string): Promise<TaskCleanupResult> {
  return cleanupTaskAgent(repoRoot, task, role, 'close');
}
export function cancelTaskAgent(repoRoot: string, task: string, role: string): Promise<TaskCleanupResult> {
  return cleanupTaskAgent(repoRoot, task, role, 'cancel');
}

export function taskAgentStatus(repoRoot: string, task: string, role: string) {
  const repository = taskRepository(repoRoot); const root = repository.primary_root; const dir = taskSessionDirectory(root, task, role);
  try { assertSessionDirectory(root, dir); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'absent', task, role }; throw error; }
  if (!existsSync(join(dir, 'binding.json'))) {
    if (existsSync(join(dir, 'closed.json'))) return { status: 'closed', task, role };
    if (!existsSync(join(dir, 'intent.json'))) return { status: 'absent', task, role };
    const intent = readStartIntent(join(dir, 'intent.json'));
    return { status: intent.runtime === 'terminal' ? 'launch_pending' : 'reconciliation_required', task, role };
  }
  const { binding } = readTaskAgent(root, task, role);
  if (existsSync(join(dir, 'closed.json'))) return { status: 'closed', task, role, binding };
  let error: string | null = null;
  try { assertTaskBinding(binding); } catch (caught) { error = String(caught); }
  const requests = [];
  for (let round = 1; round <= binding.max_requests && existsSync(join(dir, `request-${round}.json`)); round++) {
    const request = readSessionArtifact<TaskRequest>(join(dir, `request-${round}.json`));
    requests.push({ round, request_id: request.request_id, result_saved: readTaskRequestResult(root, dir, request) !== null,
      runtime_observation: readOarObservation(join(dir, oarObservationFile(round)), request, binding.provider) });
  }
  return { status: error ? 'interrupted' : requests.some(item => !item.result_saved) ? 'pending' : 'idle', task, role, binding, requests, error };
}

/** Git publication/dirty/merge checks remain the caller's authority. */
export async function cleanupTaskWorktree(repoRoot: string, checkoutPath: string, dryRun = false, gitBin = configuredGitBinary()): Promise<TaskCleanupResult | { status: 'not_registered'; pids: number[] }> {
  const repository = taskRepository(repoRoot, gitBin);
  const expected = { ...repository, execution_root: checkoutPath };
  const dir = workspaceDirectory(expected);
  if (!existsSync(dir)) return { status: 'not_registered', pids: [] };
  assertSessionDirectory(repository.primary_root, dir);
  return withCallerLock(repository.primary_root, dir, async () => {
    if (existsSync(join(dir, 'closed.json'))) return { status: 'closed', pids: [] };
    if (existsSync(join(dir, 'open-intent.json'))) classicRecordRetired(join(dir, 'open-intent.json'));
    if (!existsSync(join(dir, 'binding.json'))) return { status: 'not_registered', pids: [] };
    const workspace = readWorkspaceBinding(join(dir, 'binding.json'));
    if (workspace.repository.repository_id !== repository.repository_id || workspace.repository.execution_root !== checkoutPath) throw new Error('task_agent_workspace_identity_lost');
    const rolesRoot = join(repository.primary_root, '.ai/harness/runs/task-agents');
    if (existsSync(rolesRoot)) {
      assertSessionDirectory(repository.primary_root, rolesRoot);
      for (const entry of readdirSync(rolesRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('task_agent_unsafe_directory');
        const roleDir = join(rolesRoot, entry.name);
        if (!existsSync(join(roleDir, 'intent.json'))) continue;
        // Only this checkout's roles are validated, so a retired record elsewhere does not block it.
        const owner = readSessionArtifact<{ repository?: Partial<TaskRepository> }>(join(roleDir, 'intent.json')).repository;
        if (owner?.repository_id !== repository.repository_id || owner?.execution_root !== checkoutPath) continue;
        if (existsSync(join(roleDir, 'closed.json'))) continue;
        const intent = readStartIntent(join(roleDir, 'intent.json'));
        if (dryRun) return { status: 'cleanup_pending', reason: 'active_roles', pids: existsSync(join(roleDir, 'binding.json')) ? [readTaskBinding(join(roleDir, 'binding.json')).provider.pid] : [] };
        const result = await closeTaskAgent(repository.primary_root, intent.spec.task, intent.spec.role);
        if (result.status !== 'closed') return { ...result, reason: result.reason ?? 'foreground_unproven' };
      }
    }
    if (!dryRun) {
      writeSessionArtifact(join(dir, 'closed.json'), { repository_id: repository.repository_id, checkout: checkoutPath });
      endWorktreeRecord(repository.repository_id, readWorktreeRecord(repository.repository_id, checkoutPath), 'closed');
    }
    return { status: 'closed', pids: [] };
  });
}
