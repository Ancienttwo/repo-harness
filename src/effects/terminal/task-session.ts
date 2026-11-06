import { assertSessionDirectory, classicRecordRetired, taskSessionDirectory, sameSessionData, readStartIntent, readTaskAgent, readTaskBinding,
  type CreatedTerminal, type HerdrTaskAgentSpec, type HerdrTaskBinding, type ObjectOwnership, type StartIntent,
  type TaskPaneBinding, type TerminalStartIntent, type TerminalTaskBinding } from './task-session-record';
import { observeTaskSessionAdmission, taskBindingSha256 } from './task-session-admission';
import { ensureSessionDirectory, nextSessionRound, processIdentity, readSessionArtifact, writeSessionArtifact, writeSessionBytes } from './task-session-io';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { isAbsolute, join, relative } from 'path';
import type { TaskSessionAuthority } from '../admission/admission-source';
import type { ProcessProof, TaskPrePromptInbox, TaskRequest, TaskResult, TaskSessionAdmission, TerminalHostSpec } from '../../core/review/runner-port';
import { recordWorktree } from '../git/worktree-record';
import { taskRepository } from '../git/task-repository';
import { ExclusiveLockContentionError, withCallerLock } from '../locking/exclusive-directory-lock';
import { hcGet, hcList, hcRun } from './herdr-core';
import { assertTaskBinding, assertTerminalProcess, coreOptions, intentLabels, ownLabels, readTaskRequestResult, registerTaskWorktree, requestOutbox, validateTaskResult, validateHerdrCoreEndpoint } from './runtime-closeout';
import { oarObservationFile, readOarObservation } from './task-runtime-observation';

function recheckTaskAdmission(repoRoot: string, binding: Pick<TaskPaneBinding, 'task' | 'role' | 'harness_kind' | 'runtime' | 'task_admission'>,
  authority?: TaskSessionAuthority): TaskSessionAdmission | undefined {
  if (!binding.task_admission && !authority) return undefined; // Generic runtime use has no task admission.
  if (!binding.task_admission || !authority) throw new Error('task_agent_admission_required');
  const current = observeTaskSessionAdmission(repoRoot, binding, binding.runtime, authority);
  if (!sameSessionData(current.identity, binding.task_admission.identity)) throw new Error('task_agent_admission_changed');
  return current;
}

export function beginSessionRound(dir: string, round: number, identity: unknown): void {
  writeSessionArtifact(join(dir, `started-${round}.json`), identity);
}
export function saveSessionRoundResult(dir: string, round: number, result: unknown): void {
  if (!existsSync(join(dir, `started-${round}.json`))) throw new Error('task_agent_result_without_started_request');
  writeSessionArtifact(join(dir, `result-${round}.json`), result);
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
