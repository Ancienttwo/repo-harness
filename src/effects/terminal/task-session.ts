import { constants, closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { dirname, isAbsolute, join, relative } from 'path';
import { taskRepository, type TaskRepository } from './task-worktree';
import { canonicalize } from '../../core/evidence/canonical-json';
import { acquireExclusiveDirectoryLock, ExclusiveLockContentionError } from '../locking/exclusive-directory-lock';
import { herdrCommand, herdrMutation, herdrResult, spawnHerdr, validateHerdrEndpoint, type HerdrEndpoint } from './herdr';

export type ObjectOwnership = { disposition: 'created'; intent_id: string } | { disposition: 'attached' };
export interface ProcessProof { pid: number; identity: string }
export interface OwnedProcess extends ProcessProof { ownership: ObjectOwnership }
export interface TaskCapability { status: 'verified' | 'unverified' | 'unsupported'; evidence_ref: string | null }
export interface HarnessCapabilities { read_only: TaskCapability; resume: TaskCapability }
export interface TaskPaneBinding {
  protocol: 2;
  repository_id: string;
  execution_root: string;
  runtime: 'herdr';
  task: string;
  role: string;
  harness_kind: string;
  endpoint: HerdrEndpoint;
  pane_id: string;
  terminal_id: string;
  workspace_id: string;
  shell: ProcessProof;
  agent_name: string;
  ownership: ObjectOwnership;
  provider: OwnedProcess;
  host: ProcessProof | null;
  capabilities: HarnessCapabilities;
  max_requests: number;
}
export interface TaskAgentSpec {
  task: string;
  role: string;
  harness_kind: string;
  endpoint: HerdrEndpoint;
  parent_pane: string;
  args: string[];
  max_requests: number;
}
interface StartIntent { protocol: 2; repository: TaskRepository; intent_id: string; agent_name: string; spec: TaskAgentSpec }
interface CreatedPane { pane_id: string; terminal_id: string; intent_id: string }
export interface TaskRequest {
  protocol: 1;
  task: string;
  role: string;
  round: number;
  request_id: string;
  context_ref: string;
  source_ref: string;
  context_sha256: string;
  result_ref: string;
}
export interface TaskResult { request_id: string; context_sha256: string; value: unknown }

export function processIdentity(pid: number): string {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('task_agent_invalid_process');
  const identity = execFileSync('ps', ['-p', String(pid), '-o', 'pid=,pgid=,lstart=,comm='], { encoding: 'utf8' }).trim();
  if (!identity) throw new Error('task_agent_process_identity_lost');
  return identity;
}
export function readSessionArtifact<T>(path: string): T {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { return JSON.parse(readFileSync(fd, 'utf8')) as T; } finally { closeSync(fd); }
}
export function writeSessionArtifact(path: string, value: unknown, immutable = true): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
  try { if (immutable) linkSync(temporary, path); else renameSync(temporary, path); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
  const directory = openSync(dirname(path), constants.O_RDONLY);
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
function assertSessionDirectory(root: string, path: string): void {
  const segments = relative(root, path).split('/');
  if (segments.includes('..') || isAbsolute(relative(root, path))) throw new Error('task_agent_unsafe_directory');
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('task_agent_unsafe_directory');
  }
}
export function ensureSessionDirectory(root: string, path: string): void {
  const parts = relative(root, path).split('/');
  if (parts.includes('..') || isAbsolute(relative(root, path))) throw new Error('task_agent_unsafe_directory');
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try { mkdirSync(current, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    if (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink()) throw new Error('task_agent_unsafe_directory');
  }
}
export function assertCreated(ownership: ObjectOwnership): asserts ownership is Extract<ObjectOwnership, { disposition: 'created' }> {
  if (ownership?.disposition !== 'created' || typeof ownership.intent_id !== 'string' || !ownership.intent_id) {
    throw new Error('task_agent_attached_object_not_closeable');
  }
}
export function assertProcessProof(proof: ProcessProof): void {
  if (processIdentity(proof.pid) !== proof.identity) throw new Error('task_agent_process_identity_lost');
}
export function processProofAlive(proof: ProcessProof): boolean {
  try { process.kill(proof.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
  try { assertProcessProof(proof); }
  catch (error) {
    // Exit can occur between kill(0) and ps. Confirm absence; an extant reused
    // PID or a permission/inspection failure remains a hard identity refusal.
    try { process.kill(proof.pid, 0); } catch (gone) { if ((gone as NodeJS.ErrnoException).code === 'ESRCH') return false; throw gone; }
    throw error;
  }
  return true;
}
export function signalCreatedProcess(process: OwnedProcess, signal: NodeJS.Signals, group = false): void {
  assertCreated(process.ownership);
  if (!processProofAlive(process)) return;
  if (group) {
    const groupId = Number(execFileSync('ps', ['-p', String(process.pid), '-o', 'pgid='], { encoding: 'utf8' }).trim());
    if (groupId !== process.pid) throw new Error('task_agent_unowned_process_group');
  }
  globalThis.process.kill(group ? -process.pid : process.pid, signal);
}
export function harnessCapabilities(kind: string, fixtureEvidence?: string): HarnessCapabilities {
  if (fixtureEvidence && kind !== 'fixture') throw new Error('task_agent_real_harness_unverified');
  const capability: TaskCapability = fixtureEvidence
    ? { status: 'verified', evidence_ref: fixtureEvidence }
    : { status: 'unverified', evidence_ref: null };
  return { read_only: { ...capability }, resume: { ...capability } };
}
export async function waitSessionArtifact(path: string, deadline: number, check: () => void): Promise<void> {
  let nextCheck = 0;
  while (!existsSync(path)) {
    if (Date.now() >= nextCheck) { check(); nextCheck = Date.now() + 1000; }
    if (Date.now() >= deadline) throw new Error('task_agent_wait_timeout; delivery may be ambiguous; inspect the same request');
    await Bun.sleep(100);
  }
}
/** File artifacts, never a new process/session, own the monotonic round budget. */
export function nextSessionRound<T>(dir: string, maximum: number, subject: string,
  subjectOf: (request: T) => string, completionPrefix = 'accepted'): number {
  let round = 1;
  for (; round <= maximum && existsSync(join(dir, `request-${round}.json`)); round++) {
    const previous = readSessionArtifact<T>(join(dir, `request-${round}.json`));
    if (!existsSync(join(dir, `${completionPrefix}-${round}.json`))) throw new Error('task_agent_ambiguous_round');
    if (subjectOf(previous) === subject) throw new Error('task_agent_duplicate_subject');
  }
  if (round > maximum) throw new Error('task_agent_round_budget_exhausted');
  return round;
}
export function beginSessionRound(dir: string, round: number, identity: unknown): void {
  writeSessionArtifact(join(dir, `started-${round}.json`), identity);
}
export function saveSessionRoundResult(dir: string, round: number, result: unknown): void {
  if (!existsSync(join(dir, `started-${round}.json`))) throw new Error('task_agent_result_without_started_request');
  writeSessionArtifact(join(dir, `result-${round}.json`), result);
}

function info(endpoint: HerdrEndpoint, args: string[]): Record<string, any> { const r=herdrCommand(endpoint,args); try{return herdrResult(r);}catch(error){throw new Error(`${error}; ${args.slice(0,2).join(' ')}: ${r.stderr.toString()}`);} }
function mutate(endpoint: HerdrEndpoint, args: string[]): void { herdrMutation(herdrCommand(endpoint, args)); }
export function captureTaskPane(endpoint: HerdrEndpoint, pane: string, name: string, provider: ProcessProof,
  ownership: ObjectOwnership, host: ProcessProof | null = null): Pick<TaskPaneBinding, 'pane_id' | 'terminal_id' | 'workspace_id' | 'shell' | 'agent_name' | 'provider' | 'host' | 'ownership'> {
  const view = info(endpoint, ['pane', 'get', pane]).pane;
  const agent = info(endpoint, ['agent', 'get', name]).agent;
  if (view?.pane_id !== pane || typeof view.terminal_id !== 'string' || agent?.pane_id !== pane
    || agent.terminal_id !== view.terminal_id || agent.name !== name) throw new Error('task_agent_pane_identity_lost');
  const shellPid = info(endpoint, ['pane', 'process-info', '--pane', pane]).process_info?.shell_pid;
  const shell = { pid: shellPid, identity: processIdentity(shellPid) };
  if (typeof view.workspace_id !== 'string') throw new Error('task_agent_pane_identity_lost');
  assertProcessProof(provider);
  if (host) {
    assertProcessProof(host);
    const shell = info(endpoint, ['pane', 'process-info', '--pane', pane]).process_info?.shell_pid;
    const parent = Number(execFileSync('ps', ['-p', String(provider.pid), '-o', 'ppid='], { encoding: 'utf8' }).trim());
    if (shell !== host.pid || parent !== host.pid) throw new Error('task_agent_host_provider_mismatch');
  }
  return { pane_id: pane, terminal_id: view.terminal_id, workspace_id: view.workspace_id, shell, agent_name: name, provider: { ...provider, ownership }, host, ownership };
}
export function assertTaskBinding(binding: TaskPaneBinding, allowExitedProvider = false): void {
  if (binding.protocol !== 2 || binding.runtime !== 'herdr') throw new Error('task_agent_binding_invalid');
  const pane = info(binding.endpoint, ['pane', 'get', binding.pane_id]).pane;
  if (pane?.pane_id !== binding.pane_id || pane.terminal_id !== binding.terminal_id
    || pane.workspace_id !== binding.workspace_id) throw new Error('task_agent_pane_identity_lost');
  assertProcessProof(binding.shell);
  const providerAlive = processProofAlive(binding.provider);
  if (!providerAlive && !allowExitedProvider) throw new Error('task_agent_provider_exited');
  if (providerAlive) {
    const agent = info(binding.endpoint, ['agent', 'get', binding.agent_name]).agent;
    if (agent?.pane_id !== binding.pane_id || agent.terminal_id !== binding.terminal_id || agent.name !== binding.agent_name
      || agent.agent !== binding.harness_kind) throw new Error('task_agent_pane_identity_lost');
  } else {
    // After provider exit Herdr may clear the agent identity. This is an
    // explicit cleanup phase, never evidence that another occupant is owned.
    if (pane.name && pane.name !== binding.agent_name) throw new Error('task_agent_pane_identity_lost');
    const foreground = info(binding.endpoint, ['pane', 'process-info', '--pane', binding.pane_id]).process_info?.foreground_processes;
    if (!Array.isArray(foreground) || foreground.some(item => item.pid !== binding.shell.pid)) throw new Error('task_agent_pane_identity_lost');
  }
  if (binding.host) assertProcessProof(binding.host);
  else if (providerAlive) {
    const foreground = info(binding.endpoint, ['pane', 'process-info', '--pane', binding.pane_id]).process_info?.foreground_processes;
    if (!Array.isArray(foreground) || !foreground.some(item => item.pid === binding.provider.pid)) throw new Error('task_agent_provider_not_in_pane');
  }
}
interface TaskWorkspaceBinding {
  protocol: 1;
  repository: TaskRepository;
  endpoint: HerdrEndpoint;
  root_workspace_id: string;
  workspace_id: string;
  ownership: ObjectOwnership;
  root_pane: { pane_id: string; terminal_id: string; shell: ProcessProof; ownership: ObjectOwnership };
}
function workspaceDirectory(repository: TaskRepository): string {
  const key = createHash('sha256').update(JSON.stringify([repository.repository_id, repository.execution_root])).digest('hex');
  return join(repository.primary_root, '.ai/harness/runs/task-workspaces', key);
}
function assertWorkspace(binding: TaskWorkspaceBinding): void {
  const value = info(binding.endpoint, ['workspace', 'get', binding.workspace_id]).workspace;
  if (value?.workspace_id !== binding.workspace_id || value.worktree?.repo_key !== binding.repository.repository_id
    || value.worktree.checkout_path !== binding.repository.execution_root || value.worktree.repo_root !== binding.repository.primary_root) throw new Error('task_agent_workspace_identity_lost');
}
export async function registerTaskWorktree(repoRoot: string, endpoint: HerdrEndpoint, parentPane: string): Promise<TaskWorkspaceBinding> {
  validateHerdrEndpoint(endpoint);
  const repository = taskRepository(repoRoot); const dir = workspaceDirectory(repository);
  ensureSessionDirectory(repository.primary_root, dir);
  return locked(repository.primary_root, dir, async () => {
    const path = join(dir, 'binding.json');
    if (existsSync(join(dir, 'closed.json'))) throw new Error('task_agent_workspace_closed');
    if (existsSync(path)) {
      const binding = readSessionArtifact<TaskWorkspaceBinding>(path);
      if (!sameSessionData(binding.endpoint, endpoint)) throw new Error('task_agent_workspace_endpoint_changed');
      assertWorkspace(binding); return binding;
    }
    if (existsSync(join(dir, 'open-intent.json'))) throw new Error('task_agent_workspace_reconciliation_required');
    const parent = info(endpoint, ['pane', 'get', parentPane]).pane;
    if (typeof parent?.cwd !== 'string' || taskRepository(parent.cwd).repository_id !== repository.repository_id) throw new Error('task_agent_parent_repo_mismatch');
    let roots = info(endpoint, ['workspace', 'list']).workspaces;
    if (!Array.isArray(roots)) throw new Error('task_agent_workspace_response_invalid');
    let root = roots.find(item => item.worktree?.checkout_path === repository.primary_root && item.worktree?.repo_key === repository.repository_id);
    const intentId = randomUUID();
    writeSessionArtifact(join(dir, 'open-intent.json'), { intent_id: intentId, repository, endpoint, parent_pane: parentPane });
    if (!root) {
      const rootArgs = ['worktree', 'open', '--path', repository.primary_root, '--no-focus'];
      if (realpathSync(parent.cwd) === repository.primary_root) rootArgs.push('--workspace', parent.workspace_id);
      else rootArgs.push('--cwd', repository.primary_root);
      const opened = info(endpoint, rootArgs);
      root = opened.workspace;
      if (root?.worktree?.repo_key !== repository.repository_id) throw new Error('task_agent_root_workspace_mismatch');
    }
    // Primary/root is shared and always attached, including first discovery.
    const opened = repository.execution_root === repository.primary_root
      ? { workspace: root, root_pane: parent, already_open: true }
      : info(endpoint, ['worktree', 'open', '--workspace', root.workspace_id,
          '--path', repository.execution_root, '--no-focus']);
    if (typeof opened.already_open !== 'boolean' || typeof opened.root_pane?.pane_id !== 'string') throw new Error('task_agent_workspace_response_invalid');
    const ownership: ObjectOwnership = opened.already_open ? { disposition: 'attached' } : { disposition: 'created', intent_id: intentId };
    const pane = info(endpoint, ['pane', 'get', opened.root_pane.pane_id]).pane;
    const shellPid = info(endpoint, ['pane', 'process-info', '--pane', pane.pane_id]).process_info.shell_pid;
    const binding: TaskWorkspaceBinding = { protocol: 1, repository, endpoint, root_workspace_id: root.workspace_id,
      workspace_id: opened.workspace.workspace_id, ownership,
      root_pane: { pane_id: pane.pane_id, terminal_id: pane.terminal_id, shell: { pid: shellPid, identity: processIdentity(shellPid) }, ownership } };
    assertWorkspace(binding); writeSessionArtifact(path, binding); return binding;
  });
}
function validateSpec(spec: TaskAgentSpec): void {
  validateHerdrEndpoint(spec.endpoint); // Before directory, intent, pane, agent or lock creation.
  if (!spec.task?.trim() || !/^[a-z][a-z0-9_-]{0,31}$/.test(spec.role)
    || !spec.harness_kind?.trim() || !spec.parent_pane?.trim() || !Array.isArray(spec.args)
    || spec.args.some(arg => typeof arg !== 'string') || !Number.isSafeInteger(spec.max_requests) || spec.max_requests < 1 || spec.max_requests > 100) {
    throw new Error('task_agent_spec_invalid');
  }
}
export function taskSessionDirectory(root: string, task: string, role: string): string {
  const repository = taskRepository(root);
  const key = createHash('sha256').update(JSON.stringify([repository.repository_id, task, role])).digest('hex');
  return join(repository.primary_root, '.ai/harness/runs/task-agents', key);
}
async function locked<T>(root: string, dir: string, action: () => Promise<T>, contended?: () => void, waitTimeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + waitTimeoutMs;
  for (;;) {
    let lock;
    try { lock = acquireExclusiveDirectoryLock(root, relative(root, join(dir, 'caller.lock')), { waitTimeoutMs: 1, reclaimStaleOwner: true }); }
    catch (error) {
      if (!(error instanceof ExclusiveLockContentionError) || Date.now() >= deadline) throw error;
      contended?.(); await Bun.sleep(25); continue;
    }
    try { lock.assertOwned(); return await action(); } finally { lock.release(); }
  }
}
function bindStartedAgent(intent: StartIntent, pane: CreatedPane): TaskPaneBinding {
  const agent = info(intent.spec.endpoint, ['agent', 'get', intent.agent_name]).agent;
  if (agent?.pane_id !== pane.pane_id || agent.terminal_id !== pane.terminal_id || agent.agent !== intent.spec.harness_kind) {
    throw new Error('task_agent_start_identity_unknown');
  }
  const foreground = info(intent.spec.endpoint, ['pane', 'process-info', '--pane', pane.pane_id]).process_info?.foreground_processes;
  // Herdr supplies the process list. Ambiguous lists are refused, not guessed by name.
  if (!Array.isArray(foreground) || foreground.length !== 1 || !Number.isSafeInteger(foreground[0].pid)) throw new Error('task_agent_provider_identity_unknown');
  const ownership: ObjectOwnership = { disposition: 'created', intent_id: intent.intent_id };
  const provider = { pid: foreground[0].pid, identity: processIdentity(foreground[0].pid) };
  const proof = captureTaskPane(intent.spec.endpoint, pane.pane_id, intent.agent_name, provider, ownership);
  const binding: TaskPaneBinding = { protocol: 2, repository_id: intent.repository.repository_id, execution_root: intent.repository.execution_root, runtime: 'herdr', task: intent.spec.task, role: intent.spec.role,
    harness_kind: intent.spec.harness_kind, endpoint: intent.spec.endpoint, capabilities: harnessCapabilities(intent.spec.harness_kind),
    max_requests: intent.spec.max_requests, ...proof };
  assertTaskBinding(binding);
  return binding;
}
/** Existing intents only reconcile; they never repeat split or launch. */
function reconcile(dir: string, intent: StartIntent): TaskPaneBinding {
  if (!existsSync(join(dir, 'pane-created.json')) || !existsSync(join(dir, 'launch-intent.json')) || !existsSync(join(dir, 'provider-created.json'))) {
    const live = info(intent.spec.endpoint, ['pane', 'list']);
    writeSessionArtifact(join(dir, 'reconciliation.json'), { status: 'reconciliation_required', live }, false);
    throw new Error('task_agent_start_reconciliation_required');
  }
  const pane = readSessionArtifact<CreatedPane>(join(dir, 'pane-created.json'));
  if (pane.intent_id !== intent.intent_id) throw new Error('task_agent_start_identity_unknown');
  const launch = readSessionArtifact<{ intent_id: string }>(join(dir, 'launch-intent.json'));
  if (launch.intent_id !== intent.intent_id) throw new Error('task_agent_start_identity_unknown');
  const binding = readSessionArtifact<TaskPaneBinding>(join(dir, 'provider-created.json'));
  if (binding.task !== intent.spec.task || binding.role !== intent.spec.role || binding.pane_id !== pane.pane_id
    || binding.terminal_id !== pane.terminal_id || binding.agent_name !== intent.agent_name
    || binding.ownership.disposition !== 'created' || binding.ownership.intent_id !== intent.intent_id) throw new Error('task_agent_start_identity_unknown');
  assertTaskBinding(binding);
  writeSessionArtifact(join(dir, 'binding.json'), binding);
  return binding;
}
function sameSessionData(left: unknown, right: unknown): boolean {
  // Compare the JSON wire values, using the existing canonical key order.
  return canonicalize(JSON.parse(JSON.stringify(left))) === canonicalize(JSON.parse(JSON.stringify(right)));
}
export const TASK_AGENT_START_TIMEOUT_MS = 60_000;
export interface TaskStartEffects {
  /** Internal fixture/adapter seam, never exposed as CLI input or shell command. */
  start?: (endpoint: HerdrEndpoint, name: string, pane: string, kind: string, args: string[]) => Promise<void>;
  boundary?: (phase: 'intent' | 'split' | 'pane' | 'launched') => Promise<void>;
  contended?: () => void;
  /** Internal bounded readiness probe; public callers use the 60s default. */
  startTimeoutMs?: number;
}
export async function startTaskAgent(repoRoot: string, spec: TaskAgentSpec, effects: TaskStartEffects = {}): Promise<TaskPaneBinding> {
  spec = structuredClone(spec);
  validateSpec(spec);
  const startTimeoutMs = effects.startTimeoutMs ?? TASK_AGENT_START_TIMEOUT_MS;
  if (!Number.isSafeInteger(startTimeoutMs) || startTimeoutMs <= 3000 || startTimeoutMs > 300_000) throw new Error('task_agent_start_timeout_invalid');
  const repository = taskRepository(repoRoot); const root = repository.primary_root; const dir = taskSessionDirectory(root, spec.task, spec.role);
  ensureSessionDirectory(root, dir);
  return locked(root, dir, async () => {
    if (existsSync(join(dir, 'closed.json'))) throw new Error('task_agent_session_closed');
    if (existsSync(join(dir, 'binding.json'))) {
      const intent = readSessionArtifact<StartIntent>(join(dir, 'intent.json'));
      if (!sameSessionData(intent.spec, spec)) throw new Error('task_agent_spec_changed');
      const binding = readSessionArtifact<TaskPaneBinding>(join(dir, 'binding.json')); assertTaskBinding(binding); return binding;
    }
    if (existsSync(join(dir, 'intent.json'))) {
      const intent = readSessionArtifact<StartIntent>(join(dir, 'intent.json'));
      if (!sameSessionData(intent.spec, spec)) throw new Error('task_agent_spec_changed');
      return reconcile(dir, intent);
    }
    const intent: StartIntent = { protocol: 2, repository, intent_id: randomUUID(), agent_name: `task-${randomUUID().replaceAll('-', '').slice(0, 20)}`, spec };
    writeSessionArtifact(join(dir, 'intent.json'), intent);
    await effects.boundary?.('intent');
    const workspace = await registerTaskWorktree(repository.execution_root, spec.endpoint, spec.parent_pane);
    writeSessionArtifact(join(dir, 'split-intent.json'), { intent_id: intent.intent_id, workspace_id: workspace.workspace_id });
    const result = info(spec.endpoint, ['pane', 'split', '--pane', workspace.root_pane.pane_id, '--direction', 'right', '--cwd', repository.execution_root, '--no-focus']);
    if (typeof result.pane?.pane_id !== 'string' || typeof result.pane.terminal_id !== 'string') throw new Error('task_agent_split_response_invalid');
    await effects.boundary?.('split');
    const pane: CreatedPane = { pane_id: result.pane.pane_id, terminal_id: result.pane.terminal_id, intent_id: intent.intent_id };
    writeSessionArtifact(join(dir, 'pane-created.json'), pane);
    await effects.boundary?.('pane');
    writeSessionArtifact(join(dir, 'launch-intent.json'), { intent_id: intent.intent_id });
    try {
      if (effects.start) await effects.start(spec.endpoint, intent.agent_name, pane.pane_id, spec.harness_kind, spec.args);
      else herdrMutation(herdrCommand(spec.endpoint, ['agent', 'start', intent.agent_name, '--kind', spec.harness_kind,
        '--pane', pane.pane_id, '--timeout', String(startTimeoutMs), '--', ...spec.args], 'herdr', spawnHerdr, startTimeoutMs + 5000));
    } catch (error) {
      writeSessionArtifact(join(dir, 'launch-unknown.json'), { intent_id: intent.intent_id, error: String(error) });
      throw new Error('task_agent_ambiguous_launch; inspect or cancel the same start; never replay');
    }
    const binding = bindStartedAgent(intent, pane);
    writeSessionArtifact(join(dir, 'provider-created.json'), binding);
    await effects.boundary?.('launched');
    assertTaskBinding(binding);
    writeSessionArtifact(join(dir, 'binding.json'), binding);
    return binding;
  }, effects.contended, startTimeoutMs + 10_000).catch(error => {
    if (error instanceof ExclusiveLockContentionError) throw new Error('task_agent_start_in_progress');
    throw error;
  });
}
export function readTaskAgent(repoRoot: string, task: string, role: string): { dir: string; binding: TaskPaneBinding } {
  const repository = taskRepository(repoRoot); const root = repository.primary_root; const dir = taskSessionDirectory(root, task, role);
  assertSessionDirectory(root, dir);
  const binding = readSessionArtifact<TaskPaneBinding>(join(dir, 'binding.json'));
  if (binding.task !== task || binding.role !== role || binding.protocol !== 2 || binding.repository_id !== repository.repository_id || binding.runtime !== 'herdr') throw new Error('task_agent_binding_invalid');
  if (!Number.isSafeInteger(binding.max_requests) || binding.max_requests < 1 || binding.max_requests > 100) throw new Error('task_agent_binding_invalid');
  for (const capability of Object.values(binding.capabilities)) {
    if (!['verified', 'unverified', 'unsupported'].includes(capability.status)
      || (capability.status === 'verified' && (binding.harness_kind !== 'fixture' || !capability.evidence_ref))) throw new Error('task_agent_capability_invalid');
  }
  if (binding.ownership.disposition === 'created') {
    const intent = readSessionArtifact<StartIntent>(join(dir, 'intent.json'));
    const pane = readSessionArtifact<CreatedPane>(join(dir, 'pane-created.json'));
    if (!sameSessionData(intent.spec.endpoint, binding.endpoint) || intent.spec.task !== binding.task
      || intent.spec.role !== binding.role || intent.spec.harness_kind !== binding.harness_kind || intent.spec.max_requests !== binding.max_requests) throw new Error('task_agent_binding_invalid');
    if (intent.intent_id !== binding.ownership.intent_id || pane.intent_id !== intent.intent_id
      || pane.pane_id !== binding.pane_id || pane.terminal_id !== binding.terminal_id) throw new Error('task_agent_pane_identity_lost');
    if (binding.provider.ownership.disposition === 'created' && binding.provider.ownership.intent_id !== intent.intent_id) throw new Error('task_agent_binding_invalid');
    const provider = readSessionArtifact<TaskPaneBinding>(join(dir, 'provider-created.json')).provider;
    if (provider.pid !== binding.provider.pid || provider.identity !== binding.provider.identity) throw new Error('task_agent_process_identity_lost');
  }
  return { dir, binding };
}
export function readTaskRequestResult(root: string, dir: string, request: TaskRequest): TaskResult | null {
  const path = join(dir, `result-${request.round}.json`);
  if (request.protocol !== 1 || request.result_ref !== path) throw new Error('task_agent_result_ref_mismatch');
  if (!existsSync(path)) return null;
  const result = readSessionArtifact<TaskResult>(path);
  if (result.request_id !== request.request_id || result.context_sha256 !== request.context_sha256 || !Object.hasOwn(result, 'value')) throw new Error('task_agent_result_identity_mismatch');
  return result;
}
export async function sendTaskRequest(repoRoot: string, task: string, role: string, contextRef: string): Promise<TaskRequest> {
  const repository = taskRepository(repoRoot); const root = repository.primary_root; const { dir, binding } = readTaskAgent(root, task, role);
  return locked(root, dir, async () => {
    assertTaskBinding(binding);
    if (existsSync(join(dir, 'closed.json'))) throw new Error('task_agent_session_closed');
    const contextPath = realpathSync(join(repository.execution_root, contextRef));
    if (isAbsolute(contextRef) || relative(repository.execution_root, contextPath).split('/').includes('..') || !lstatSync(contextPath).isFile()) throw new Error('task_agent_context_ref_unsafe');
    const bytes = readFileSync(contextPath);
    if (bytes.length > 10 * 1024 * 1024) throw new Error('task_agent_context_too_large');
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const round = nextSessionRound<TaskRequest>(dir, binding.max_requests, digest, prior => { if (!readTaskRequestResult(root, dir, prior)) throw new Error('task_agent_ambiguous_round'); return prior.context_sha256; }, 'result');
    const request: TaskRequest = { protocol: 1, task, role, round, request_id: randomUUID(), context_ref: join(dir, `context-${round}.json`), source_ref: contextPath,
      context_sha256: digest, result_ref: join(dir, `result-${round}.json`) };
    const requestPath = join(dir, `request-${round}.json`);
    writeSessionArtifact(requestPath, request);
    writeSessionArtifact(join(dir, `context-${round}.json`), { content });
    beginSessionRound(dir, round, { request_id: request.request_id, provider: binding.provider });
    // Once this marker exists, a crash/nonzero/timeout can mean input was sent.
    // Inspect the same request/result files. Never replay it or allocate a fresh one.
    try {
      mutate(binding.endpoint, ['agent', 'prompt', binding.agent_name, `Read task request ${requestPath}; write its result only to ${request.result_ref}.`]);
      writeSessionArtifact(join(dir, `delivery-${round}.json`), { request_id: request.request_id, state: 'accepted' });
    } catch (error) {
      writeSessionArtifact(join(dir, `delivery-${round}.json`), { request_id: request.request_id, state: 'unknown', error: String(error) });
      throw new Error('task_agent_delivery_unknown; inspect the same request/result before further action');
    }
    return request;
  });
}
async function stopCreatedProcess(proof: OwnedProcess, guard: () => void): Promise<boolean> {
  assertCreated(proof.ownership);
  for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
    if (!processProofAlive(proof)) return true;
    guard(); // Re-prove pane/process identity immediately before escalation.
    signalCreatedProcess(proof, signal, true);
    const deadline = Date.now() + 5000;
    while (processProofAlive(proof) && Date.now() < deadline) await Bun.sleep(50);
  }
  return !processProofAlive(proof);
}
export interface TaskCleanupResult { status: 'closed' | 'cleanup_pending'; pids: number[]; reason?: string }
interface UnboundCleanupReceipt { intent_id: string; pane_id: string; terminal_id: string; pids: number[] }
function processRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return true;
    throw error;
  }
}
function startPanePresent(endpoint: HerdrEndpoint, pane: CreatedPane): boolean {
  const panes = info(endpoint, ['pane', 'list']).panes;
  if (!Array.isArray(panes)) throw new Error('task_agent_cleanup_unknown');
  const present = panes.find(item => item.pane_id === pane.pane_id);
  if (!present) return false;
  const observed = info(endpoint, ['pane', 'get', pane.pane_id]).pane;
  if (observed?.pane_id !== pane.pane_id || observed.terminal_id !== pane.terminal_id) throw new Error('task_agent_pane_identity_lost');
  return true;
}
async function closeUnboundTaskStart(dir: string, task: string, role: string, mode: 'close' | 'cancel'): Promise<TaskCleanupResult> {
  const intent = readSessionArtifact<StartIntent>(join(dir, 'intent.json'));
  if (intent.protocol !== 2 || intent.spec.task !== task || intent.spec.role !== role || !intent.intent_id) throw new Error('task_agent_start_identity_unknown');
  if (existsSync(join(dir, 'closed.json'))) return { status: 'closed', pids: [] };
  const finish = () => {
    writeSessionArtifact(join(dir, 'closed.json'), { task, role, intent_id: intent.intent_id, termination: 'unbound-start-cleanup', disposition: mode === 'cancel' ? 'cancelled' : 'incomplete_start' });
    return { status: 'closed' as const, pids: [] };
  };
  if (!existsSync(join(dir, 'pane-created.json'))) {
    if (existsSync(join(dir, 'split-intent.json'))) return { status: 'cleanup_pending', pids: [], reason: 'split_outcome_unrecorded' };
    return finish();
  }
  const pane = readSessionArtifact<CreatedPane>(join(dir, 'pane-created.json'));
  if (pane.intent_id !== intent.intent_id) throw new Error('task_agent_start_identity_unknown');
  if (existsSync(join(dir, 'provider-created.json'))) {
    const proof = readSessionArtifact<TaskPaneBinding>(join(dir, 'provider-created.json'));
    assertCreated(proof.provider.ownership);
    if (proof.provider.ownership.intent_id !== intent.intent_id || proof.pane_id !== pane.pane_id || proof.terminal_id !== pane.terminal_id) throw new Error('task_agent_start_identity_unknown');
    const stopped = await stopCreatedProcess(proof.provider, () => {
      if (startPanePresent(intent.spec.endpoint, pane)) assertTaskBinding(proof);
      else assertProcessProof(proof.provider); // Reparenting doesn't change birth/executable identity.
    });
    if (!stopped) return { status: 'cleanup_pending', pids: [proof.provider.pid] };
  }
  const receiptPath = join(dir, 'unbound-cleanup.json');
  let receipt: UnboundCleanupReceipt;
  if (existsSync(receiptPath)) {
    receipt = readSessionArtifact<UnboundCleanupReceipt>(receiptPath);
    if (receipt.intent_id !== intent.intent_id || receipt.pane_id !== pane.pane_id || receipt.terminal_id !== pane.terminal_id) throw new Error('task_agent_start_identity_unknown');
  } else {
    const present = startPanePresent(intent.spec.endpoint, pane);
    if (!present && existsSync(join(dir, 'launch-intent.json')) && !existsSync(join(dir, 'provider-created.json'))) return { status: 'cleanup_pending', pids: [], reason: 'pane_absent_pid_unobserved' };
    let pids: number[] = [];
    if (present) {
      const foreground = info(intent.spec.endpoint, ['pane', 'process-info', '--pane', pane.pane_id]).process_info?.foreground_processes;
      if (!Array.isArray(foreground) || foreground.some(item => !Number.isSafeInteger(item.pid) || item.pid < 1)) throw new Error('task_agent_cleanup_unknown');
      pids = [...new Set<number>(foreground.map(item => item.pid))];
    }
    receipt = { intent_id: intent.intent_id, pane_id: pane.pane_id, terminal_id: pane.terminal_id, pids };
    writeSessionArtifact(receiptPath, receipt); // Durable before any pane close.
  }
  if (!Array.isArray(receipt.pids) || receipt.pids.some(pid => !Number.isSafeInteger(pid) || pid < 1)) throw new Error('task_agent_cleanup_unknown');
  try {
    if (startPanePresent(intent.spec.endpoint, pane)) mutate(intent.spec.endpoint, ['pane', 'close', pane.pane_id]);
    const deadline = Date.now() + 5000;
    for (;;) {
      const pids = receipt.pids.filter(processRunning);
      const present = startPanePresent(intent.spec.endpoint, pane);
      if (!present && pids.length === 0) return finish();
      if (Date.now() >= deadline) return { status: 'cleanup_pending', pids };
      // No signal is sent to an unbound PID: only the created container is closed.
      await Bun.sleep(50);
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'task_agent_pane_identity_lost') throw error;
    // A lost response is not proof that the pane was closed; retain the receipt.
    return { status: 'cleanup_pending', pids: receipt.pids.filter(processRunning) };
  }
}
async function cleanupTaskAgent(repoRoot: string, task: string, role: string, mode: 'close' | 'cancel'): Promise<TaskCleanupResult> {
  const repository = taskRepository(repoRoot); const root = repository.primary_root; const dir = taskSessionDirectory(root, task, role);
  assertSessionDirectory(root, dir);
  return locked<TaskCleanupResult>(root, dir, async () => {
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
    if (closing && processProofAlive(binding.provider)) assertTaskBinding(binding);
    if (!closing) {
      assertTaskBinding(binding, true);
      writeSessionArtifact(join(dir, 'close-intent.json'), { task, role, provider: binding.provider, mode });
    }
    if (!await stopCreatedProcess(binding.provider, () => assertTaskBinding(binding))) return { status: 'cleanup_pending', pids: [binding.provider.pid] };
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (!processProofAlive(binding.provider)) {
          const panes = info(binding.endpoint, ['pane', 'list', '--workspace', binding.workspace_id]).panes;
          if (!Array.isArray(panes)) throw new Error('task_agent_cleanup_unknown');
          const pane = panes.find(item => item.pane_id === binding.pane_id);
          if (pane) {
            if (pane.terminal_id !== binding.terminal_id) throw new Error('task_agent_pane_identity_lost');
            assertProcessProof(binding.shell);
            const foreground = info(binding.endpoint, ['pane', 'process-info', '--pane', binding.pane_id]).process_info?.foreground_processes;
            if (!Array.isArray(foreground) || foreground.some(item => item.pid !== binding.shell.pid)) throw new Error('task_agent_cleanup_unknown');
            mutate(binding.endpoint, ['pane', 'close', binding.pane_id]);
          }
          writeSessionArtifact(join(dir, 'closed.json'), { task, role, provider: binding.provider, disposition: mode === 'cancel' ? 'cancelled' : 'completed' }); return { status: 'closed', pids: [] };
      }
      await Bun.sleep(50);
    }
    return { status: 'cleanup_pending', pids: [binding.provider.pid] };
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
    if (existsSync(join(dir, 'unbound-cleanup.json'))) {
      const receipt = readSessionArtifact<UnboundCleanupReceipt>(join(dir, 'unbound-cleanup.json'));
      return { status: 'cleanup_pending', task, role, pids: receipt.pids.filter(processRunning) };
    }
    return { status: existsSync(join(dir, 'intent.json')) ? 'reconciliation_required' : 'absent', task, role };
  }
  const { binding } = readTaskAgent(root, task, role);
  if (existsSync(join(dir, 'closed.json'))) return { status: 'closed', task, role, binding };
  let error: string | null = null;
  try { assertTaskBinding(binding); } catch (caught) { error = String(caught); }
  const requests = [];
  for (let round = 1; round <= binding.max_requests && existsSync(join(dir, `request-${round}.json`)); round++) {
    const request = readSessionArtifact<TaskRequest>(join(dir, `request-${round}.json`));
    requests.push({ round, request_id: request.request_id, result_saved: readTaskRequestResult(root, dir, request) !== null });
  }
  return { status: error ? 'interrupted' : requests.some(item => !item.result_saved) ? 'pending' : 'idle', task, role, binding, requests, error };
}

/** Git publication/dirty/merge checks remain the caller's authority. */
export async function cleanupTaskWorktree(repoRoot: string, checkoutPath: string, dryRun = false): Promise<TaskCleanupResult | { status: 'not_registered'; pids: number[] }> {
  const repository = taskRepository(repoRoot);
  const expected = { ...repository, execution_root: checkoutPath };
  const dir = workspaceDirectory(expected);
  if (!existsSync(dir)) return { status: 'not_registered', pids: [] };
  assertSessionDirectory(repository.primary_root, dir);
  return locked(repository.primary_root, dir, async () => {
    if (existsSync(join(dir, 'closed.json'))) return { status: 'closed', pids: [] };
    if (!existsSync(join(dir, 'binding.json'))) return { status: 'cleanup_pending', pids: [] };
    const workspace = readSessionArtifact<TaskWorkspaceBinding>(join(dir, 'binding.json'));
    if (workspace.repository.repository_id !== repository.repository_id || workspace.repository.execution_root !== checkoutPath) throw new Error('task_agent_workspace_identity_lost');
    const rolesRoot = join(repository.primary_root, '.ai/harness/runs/task-agents');
    if (existsSync(rolesRoot)) {
      assertSessionDirectory(repository.primary_root, rolesRoot);
      for (const entry of readdirSync(rolesRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('task_agent_unsafe_directory');
        const roleDir = join(rolesRoot, entry.name);
        if (!existsSync(join(roleDir, 'intent.json'))) continue;
        const intent = readSessionArtifact<StartIntent>(join(roleDir, 'intent.json'));
        if (intent.repository.repository_id !== repository.repository_id || intent.repository.execution_root !== checkoutPath) continue;
        if (existsSync(join(roleDir, 'closed.json'))) continue;
        if (dryRun) return { status: 'cleanup_pending', pids: existsSync(join(roleDir, 'binding.json')) ? [readSessionArtifact<TaskPaneBinding>(join(roleDir, 'binding.json')).provider.pid] : [] };
        const result = await closeTaskAgent(repository.primary_root, intent.spec.task, intent.spec.role);
        if (result.status !== 'closed') return result;
      }
    }
    const spaces = info(workspace.endpoint, ['workspace', 'list']).workspaces;
    if (!Array.isArray(spaces)) throw new Error('task_agent_workspace_response_invalid');
    if (!spaces.some(item => item.workspace_id === workspace.workspace_id)) {
      if (!dryRun) writeSessionArtifact(join(dir, 'closed.json'), { repository_id: repository.repository_id, checkout: checkoutPath });
      return { status: 'closed', pids: [] };
    }
    assertWorkspace(workspace);
    if (workspace.ownership.disposition !== 'created') return { status: 'cleanup_pending', pids: [] };
    const panes = info(workspace.endpoint, ['pane', 'list', '--workspace', workspace.workspace_id]).panes;
    if (!Array.isArray(panes)) throw new Error('task_agent_workspace_response_invalid');
    if (panes.some(pane => pane.pane_id !== workspace.root_pane.pane_id)) return { status: 'cleanup_pending', pids: [] };
    if (panes.length) {
      const pane = panes[0];
      if (pane.terminal_id !== workspace.root_pane.terminal_id || pane.agent) return { status: 'cleanup_pending', pids: [] };
      assertProcessProof(workspace.root_pane.shell);
      const foreground = info(workspace.endpoint, ['pane', 'process-info', '--pane', pane.pane_id]).process_info.foreground_processes;
      if (!Array.isArray(foreground) || foreground.some(item => item.pid !== workspace.root_pane.shell.pid)) return { status: 'cleanup_pending', pids: [] };
    }
    if (!dryRun) {
      // Closing a workspace never removes Git checkouts. Never worktree remove.
      mutate(workspace.endpoint, ['workspace', 'close', workspace.workspace_id]);
      const readback = info(workspace.endpoint, ['workspace', 'list']).workspaces;
      if (!Array.isArray(readback) || readback.some(item => item.workspace_id === workspace.workspace_id)) return { status: 'cleanup_pending', pids: [] };
      writeSessionArtifact(join(dir, 'closed.json'), { repository_id: repository.repository_id, checkout: checkoutPath });
    }
    return { status: 'closed', pids: [] };
  });
}
