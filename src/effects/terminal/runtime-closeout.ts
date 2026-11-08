import { assertProcessProof, assertSessionDirectory, assertCreated, classicRecordRetired, taskSessionDirectory, TASK_SESSIONS_PATH, sameSessionData, readStartIntent, readTaskAgent, readTaskBinding, readWorkspaceBinding, workspaceDirectory, processProofAlive,
  type CreatedTerminal, type HerdrCoreEndpoint, type HerdrTaskBinding, type StartIntent, type TaskPaneBinding, type TaskWorkspaceBinding } from './task-session-record';
import { taskBindingSha256 } from './task-session-admission';
import { ensureSessionDirectory, readSessionArtifact, writeSessionArtifact } from './task-session-io';
import { constants, closeSync, existsSync, fsyncSync, openSync, readdirSync, realpathSync, renameSync } from 'fs';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { isAbsolute, join } from 'path';
import { validateTaskClaimReference } from '../../core/review/authority-context';
import type { ProcessProof, TaskCleanupResult, TaskRequest, TaskResult } from '../../core/review/runner-port';
import { gitExecFileSync } from '../git/runner';
import { configuredGitBinary } from '../git/common-directory';
import { taskSessionKey } from '../git/repository-identity';
import { readWorktreeRecord, endWorktreeRecord } from '../git/worktree-record';
import { taskRepository, type TaskRepository } from '../git/task-repository';
import { withCallerLock } from '../locking/exclusive-directory-lock';
import { HerdrCoreError, RH_LABEL, RH_NOTIFY_LABELS, RH_ROLE, hcGet, hcKill, hcList, hcRm, hcSend, isHcAddress,
  type HcLabels, type HcTerminal, type HerdrCoreOptions } from './herdr-core';

/** The socket names the core. A caller terminal lends its identity only to its own core. */
export function validateHerdrCoreEndpoint(endpoint: HerdrCoreEndpoint): string {
  if (!endpoint || typeof endpoint !== 'object' || typeof endpoint.socket !== 'string' || !isAbsolute(endpoint.socket)
    || (endpoint.home !== undefined && (typeof endpoint.home !== 'string' || !isAbsolute(endpoint.home)))) throw new Error('herdr_core_endpoint_invalid');
  return endpoint.socket;
}
export function coreOptions(endpoint: HerdrCoreEndpoint): HerdrCoreOptions {
  const env: NodeJS.ProcessEnv = { ...process.env, HC_SOCKET: validateHerdrCoreEndpoint(endpoint) };
  if (env.HC_TERMINAL_SOCKET !== endpoint.socket) { delete env.HC_TERMINAL_ID; delete env.HC_TERMINAL_SOCKET; delete env.HC_SCOPE; }
  return { env };
}
function notFound(error: unknown): boolean { return error instanceof HerdrCoreError && error.kind === 'not_found'; }
const OWN_LABEL_KEYS: ReadonlySet<string> = new Set(Object.values(RH_LABEL));
/** Herdr.app adds its own keys (herdr.space, herdr.tab) to a terminal it shows, so identity reads only the repo-harness keys. */
export function ownLabels(labels: HcLabels): HcLabels {
  return Object.fromEntries(Object.entries(labels).filter(([key]) => OWN_LABEL_KEYS.has(key)));
}
/** The labels that `hc run` sets; they are the only identity a task-session terminal has besides its address and name. */
function sessionLabels(session: { repository_id: string; task: string; role: string; harness_kind: string }, intentId: string): HcLabels {
  return { [RH_LABEL.role]: RH_ROLE.taskSession, [RH_LABEL.task]: taskSessionKey(session.repository_id, session.task, session.role),
    [RH_LABEL.request]: intentId, [RH_LABEL.harness]: session.harness_kind, ...RH_NOTIFY_LABELS };
}
export function intentLabels(intent: StartIntent): HcLabels {
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
export function assertTerminalProcess(provider: ProcessProof, command: readonly string[]): void {
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

export function requestOutbox(binding: TaskPaneBinding, dir: string): string {
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
export function validateTaskResult(request: TaskRequest, value: unknown): TaskResult {
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

/** A process in the provider's group. `key` (pid, pgid, start time) survives exec; the command name does not. */
interface GroupProcess { pid: number; key: string; exited: boolean }
/** The processes in the group that the provider leads (#754). Windows has no process groups; hc ends the program's process tree there. */
function providerGroup(provider: ProcessProof): GroupProcess[] {
  if (process.platform === 'win32' || provider.identity.trim().split(/\s+/)[1] !== String(provider.pid)) return [];
  const group: GroupProcess[] = [];
  for (const row of execFileSync('ps', ['-A', '-o', 'pid=,pgid=,lstart=,stat='], { encoding: 'utf8' }).trim().split('\n')) {
    const fields = row.trim().split(/\s+/);
    if (fields[1] !== String(provider.pid)) continue;
    const stat = fields[7] ?? '';
    // Darwin E is a process in exit, as in processProofAlive.
    group.push({ pid: Number(fields[0]), key: fields.slice(0, 7).join(' '), exited: stat.startsWith('Z') || (process.platform === 'darwin' && stat.includes('E')) });
  }
  return group;
}
/** Live pids in the provider's group. Cleanup reports them and does not signal them: without a live leader they are unproven. */
function liveProviderGroup(provider: ProcessProof): number[] {
  return providerGroup(provider).filter(member => !member.exited).map(member => member.pid);
}
/**
 * hc 0.1.19 keeps a group member that ignores hangup alive after its terminal ends, so cleanup ends the group:
 * TERM, wait, KILL, wait. Members are recorded while the leader proof holds. A recorded member that still has
 * its key has stayed in the group since then, so the group id was not reused.
 */
async function endProviderGroup(provider: ProcessProof, members: GroupProcess[]): Promise<void> {
  const keys = new Set(members.map(member => member.key));
  const recordedAlive = () => providerGroup(provider).some(member => !member.exited && keys.has(member.key));
  for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
    // Residual: if every member exits after this check and the pid space wraps to this group id before the
    // signal, the signal reaches the new group. macOS has no group handle that closes this window.
    if (!recordedAlive()) return;
    try { process.kill(-provider.pid, signal); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    const deadline = Date.now() + 2000;
    while (recordedAlive() && Date.now() < deadline) await Bun.sleep(50);
  }
}
/** Ends a created terminal, confirms its program exit and ends the recorded members of the provider's group. */
async function endTerminal(endpoint: HerdrCoreEndpoint, address: string, provider: ProcessProof | null): Promise<boolean> {
  const options = coreOptions(endpoint);
  const members = provider && processProofAlive(provider) ? providerGroup(provider).filter(member => member.pid !== provider.pid) : [];
  if (hcKill(address, options).state !== 'finished') return false;
  const deadline = Date.now() + 5000;
  while (provider && processProofAlive(provider)) {
    if (Date.now() >= deadline) return false;
    await Bun.sleep(50);
  }
  hcRm(address, options);
  if (provider) await endProviderGroup(provider, members);
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
  const group = provider ? liveProviderGroup(provider) : [];
  if (group.length) return { status: 'cleanup_pending', pids: group, reason: 'provider_group_alive' };
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
    const group = liveProviderGroup(binding.provider);
    if (group.length) return { status: 'cleanup_pending', pids: group, reason: 'provider_group_alive' };
    return closed();
  });
}

export function closeTaskAgent(repoRoot: string, task: string, role: string): Promise<TaskCleanupResult> {
  return cleanupTaskAgent(repoRoot, task, role, 'close');
}
export function cancelTaskAgent(repoRoot: string, task: string, role: string): Promise<TaskCleanupResult> {
  return cleanupTaskAgent(repoRoot, task, role, 'cancel');
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
    const rolesRoot = join(repository.primary_root, TASK_SESSIONS_PATH);
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
