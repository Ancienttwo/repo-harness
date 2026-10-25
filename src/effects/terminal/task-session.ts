import { processIdentity, readSessionArtifact, writeSessionArtifact, writeSessionBytes } from './task-session-io';
export { processIdentity, readSessionArtifact, writeSessionArtifact } from './task-session-io';
import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync } from 'fs';
import { execFileSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { isAbsolute, join, relative } from 'path';
import { loadEngineerProfile } from '../profiles/profile-store';
import { observeActiveReviewAdmission } from '../admission/issue-goal';
import type { ReviewAdmissionSource } from '../admission/admission-source';
import { gitExecFileSync } from '../git/runner';
import { readWorktreeTopology } from '../git/worktree-topology';
import { configuredGitBinary } from '../git/common-directory';
import { taskSessionKey, taskWorkspaceKey } from '../git/repository-identity';
import { taskRepository, type TaskRepository } from '../git/task-repository';
import { canonicalize } from '../../core/evidence/canonical-json';
import { acquireExclusiveDirectoryLock, ExclusiveLockContentionError } from '../locking/exclusive-directory-lock';
import { terminateProcessGroup } from '../process-group-termination';
import { herdrCommand, herdrMutation, herdrResult, validateHerdrEndpoint, type HerdrEndpoint } from './herdr';
import { oarObservationFile, readOarObservation } from './task-runtime-observation';

export type ObjectOwnership = { disposition: 'created'; intent_id: string } | { disposition: 'attached' };
export interface ProcessProof { pid: number; identity: string }
export interface OwnedProcess extends ProcessProof { ownership: ObjectOwnership }
/** Upstream coordination provenance. This is not an authorization credential. */
export interface TaskClaimReference { reference: string; revision: string }
export interface TaskEngineerProfile { engineer_id: string; engineer_contract_revision: string }
export interface TaskSessionAuthority { source: ReviewAdmissionSource; claim: TaskClaimReference; engineer_profile?: TaskEngineerProfile }
/** Explicit descriptive selection, validated against the canonical profile; not authorization. */
export function validateTaskEngineerProfile(repoRoot: string, selection: TaskEngineerProfile | undefined): TaskEngineerProfile | undefined {
  if (selection === undefined) return undefined;
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)
    || Object.keys(selection).length !== 2 || !Object.keys(selection).every(key => key === 'engineer_id' || key === 'engineer_contract_revision')
    || typeof selection.engineer_id !== 'string' || !selection.engineer_id
    || typeof selection.engineer_contract_revision !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(selection.engineer_contract_revision)) throw new Error('task_agent_engineer_profile_invalid');
  const resolved = loadEngineerProfile(repoRoot, selection.engineer_id);
  if (resolved.engineer_contract_revision !== selection.engineer_contract_revision) throw new Error('task_agent_engineer_profile_stale');
  return { engineer_id: resolved.profile.engineer_id, engineer_contract_revision: resolved.engineer_contract_revision };
}
export interface TaskSessionAdmission {
  identity: {
    repository_id: string; issue_id: string; campaign_id: string; campaign_sha256: string;
    execution_actor: string; claim: TaskClaimReference; engineer_profile?: TaskEngineerProfile;
    source_root: string; execution_root: string; branch: string | null; task: string; role: string;
    harness_kind: string; runtime: 'herdr' | 'terminal';
  };
  approval: { admission_sha256: string; grant_sha256: string; revision: number; goal_revision: string; scope_sha256: string };
  /** A normal commit does not change task ownership or reset request budgets. */
  head_revision: string;
}
export function validateTaskClaimReference(claim: TaskClaimReference): TaskClaimReference {
  if (!claim || typeof claim.reference !== 'string' || !claim.reference.trim() || /[\x00-\x1f\x7f]/.test(claim.reference)
    || typeof claim.revision !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(claim.revision)
    || Object.keys(claim).length !== 2 || !Object.keys(claim).every(key => key === 'reference' || key === 'revision')) throw new Error('task_agent_claim_invalid');
  return { reference: claim.reference, revision: claim.revision };
}

/** Observe the existing approval; do not create a second claim or task state. */
export function observeTaskSessionAdmission(repoRoot: string, spec: Pick<TaskAgentSpec, 'task' | 'role' | 'harness_kind'>,
  runtime: 'herdr' | 'terminal', authority: TaskSessionAuthority): TaskSessionAdmission {
  const claim = validateTaskClaimReference(authority.claim);
  const execution = taskRepository(repoRoot), owner = taskRepository(authority.source.repoRoot);
  if (execution.repository_id !== owner.repository_id) throw new Error('task_agent_admission_repository_mismatch');
  const topology = readWorktreeTopology(execution.execution_root).worktrees;
  for (const root of [owner.execution_root, execution.execution_root]) {
    if (!topology.some(entry => { try { return !entry.prunable && realpathSync(entry.path) === root; } catch { return false; } })) {
      throw new Error('task_agent_admission_repository_mismatch');
    }
  }
  const engineer = validateTaskEngineerProfile(owner.execution_root, authority.engineer_profile);
  const active = observeActiveReviewAdmission(authority.source), admitted = active.admission;
  let branch: string | null = null;
  try { branch = gitExecFileSync(['symbolic-ref', '--quiet', 'HEAD'], { cwd: execution.execution_root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (error) { if ((error as { status?: number }).status !== 1) throw error; }
  const head = gitExecFileSync(['rev-parse', 'HEAD'], { cwd: execution.execution_root, encoding: 'utf8' }).trim();
  return {
    identity: { repository_id: admitted.repository_id, issue_id: admitted.issue_id,
      campaign_id: admitted.campaign_id, campaign_sha256: admitted.campaign_sha256, execution_actor: admitted.actor_id,
      ...(engineer ? { engineer_profile: engineer } : {}), claim, source_root: owner.execution_root, execution_root: execution.execution_root, branch, task: spec.task, role: spec.role,
      harness_kind: spec.harness_kind, runtime },
    approval: { admission_sha256: admitted.admission_sha256, grant_sha256: active.grant_sha256, revision: active.revision,
      goal_revision: admitted.goal.revision, scope_sha256: sessionDigest(admitted.allowed_paths) },
    head_revision: head,
  };
}
function sessionDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalize(JSON.parse(JSON.stringify(value)))).digest('hex')}`;
}
function recheckTaskAdmission(repoRoot: string, binding: Pick<TaskPaneBinding, 'task' | 'role' | 'harness_kind' | 'runtime' | 'task_admission'>,
  authority?: TaskSessionAuthority): TaskSessionAdmission | undefined {
  if (!binding.task_admission && !authority) return undefined; // Generic runtime use has no task admission.
  if (!binding.task_admission || !authority) throw new Error('task_agent_admission_required');
  const current = observeTaskSessionAdmission(repoRoot, binding, binding.runtime, authority);
  if (!sameSessionData(current.identity, binding.task_admission.identity)) throw new Error('task_agent_admission_changed');
  return current;
}

interface TaskBindingCommon {
  protocol: 2;
  repository_id: string;
  execution_root: string;
  task: string;
  role: string;
  harness_kind: string;
  ownership: ObjectOwnership;
  provider: OwnedProcess;
  max_requests: number;
  task_admission?: TaskSessionAdmission;
}
export interface HerdrTaskBinding extends TaskBindingCommon {
  runtime: 'herdr';
  endpoint: HerdrEndpoint;
  pane_id: string;
  terminal_id: string;
  workspace_id: string;
  shell: ProcessProof;
  agent_name: string;
}
/** An application host that an operator terminal (the Claude app) started
 * from the exact owner command. The terminal stays with the operator: no pane
 * identity, history or signal authority exists for it. */
export interface TerminalTaskBinding extends TaskBindingCommon {
  runtime: 'terminal';
  command: string[];
}
export type TaskPaneBinding = HerdrTaskBinding | TerminalTaskBinding;
export interface TaskAgentSpec {
  task: string;
  role: string;
  harness_kind: string;
  endpoint: HerdrEndpoint;
  parent_pane: string;
  args: string[];
  max_requests: number;
}
export type TerminalHostSpec = Pick<TaskAgentSpec, 'task' | 'role' | 'harness_kind' | 'max_requests'>;
interface StartIntent { task_admission?: TaskSessionAdmission; protocol: 2; repository: TaskRepository; intent_id: string; agent_name: string; spec: TaskAgentSpec; runtime?: never }
interface TerminalStartIntent { task_admission?: TaskSessionAdmission; protocol: 2; runtime: 'terminal'; repository: TaskRepository; intent_id: string; spec: TerminalHostSpec; command: string[] }
interface CreatedPane { pane_id: string; terminal_id: string; intent_id: string }
export type TaskPrePromptInbox = { status: 'bound'; path: string; sha256: string } | { status: 'unsupported'; reason: 'historical_task_label' };
export interface TaskRequest {
  pre_prompt_inbox?: TaskPrePromptInbox;
  task_admission?: TaskSessionAdmission;
  session_binding_sha256?: string;
  protocol: 2;
  result_contract: { required_fields: string[]; atomic_write: 'temp_rename' };
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
/** False when the created process exited; a live process must still lead its own group. */
function createdProcessGroupAlive(process: OwnedProcess): boolean {
  assertCreated(process.ownership);
  if (!processProofAlive(process)) return false;
  try {
    const groupId = Number(execFileSync('ps', ['-p', String(process.pid), '-o', 'pgid='], { encoding: 'utf8' }).trim());
    if (groupId !== process.pid) throw new Error('task_agent_unowned_process_group');
    return true;
  } catch (error) {
    // The process can exit after the liveness proof above. Only a confirmed
    // exit of the same process is success; a live or reused PID still refuses.
    if (processProofAlive(process)) throw error;
    return false;
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

function info(endpoint: HerdrEndpoint, args: string[]): Record<string, any> {
  const result = herdrCommand(endpoint, args);
  try { return herdrResult(result); }
  catch (error) {
    throw new Error(`${error}; ${args.slice(0, 2).join(' ')}: ${result.stderr?.toString() ?? result.error?.message ?? ''}`);
  }
}
function mutate(endpoint: HerdrEndpoint, args: string[]): void { herdrMutation(herdrCommand(endpoint, args)); }
export function captureTaskPane(endpoint: HerdrEndpoint, pane: string, name: string, provider: ProcessProof,
  ownership: ObjectOwnership): Pick<HerdrTaskBinding, 'pane_id' | 'terminal_id' | 'workspace_id' | 'shell' | 'agent_name' | 'provider' | 'ownership'> {
  const view = info(endpoint, ['pane', 'get', pane]).pane;
  const agent = info(endpoint, ['agent', 'get', name]).agent;
  if (view?.pane_id !== pane || typeof view.terminal_id !== 'string' || agent?.pane_id !== pane
    || agent.terminal_id !== view.terminal_id || agent.name !== name) throw new Error('task_agent_pane_identity_lost');
  const shellPid = info(endpoint, ['pane', 'process-info', '--pane', pane]).process_info?.shell_pid;
  const shell = { pid: shellPid, identity: processIdentity(shellPid) };
  if (typeof view.workspace_id !== 'string') throw new Error('task_agent_pane_identity_lost');
  assertProcessProof(provider);
  return { pane_id: pane, terminal_id: view.terminal_id, workspace_id: view.workspace_id, shell, agent_name: name, provider: { ...provider, ownership }, ownership };
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
  if (binding.runtime !== 'herdr') throw new Error('task_agent_binding_invalid');
  const pane = info(binding.endpoint, ['pane', 'get', binding.pane_id]).pane;
  if (pane?.pane_id !== binding.pane_id || pane.terminal_id !== binding.terminal_id
    || pane.workspace_id !== binding.workspace_id) throw new Error('task_agent_pane_identity_lost');
  assertProcessProof(binding.shell);
  let providerAlive = processProofAlive(binding.provider);
  if (!providerAlive && !allowExitedProvider) throw new Error('task_agent_provider_exited');
  if (providerAlive) {
    try {
      const agent = info(binding.endpoint, ['agent', 'get', binding.agent_name]).agent;
      if (agent?.pane_id !== binding.pane_id || agent.terminal_id !== binding.terminal_id || agent.name !== binding.agent_name
        || agent.agent !== binding.harness_kind) throw new Error('task_agent_pane_identity_lost');
      const foreground = info(binding.endpoint, ['pane', 'process-info', '--pane', binding.pane_id]).process_info?.foreground_processes;
      if (!Array.isArray(foreground) || !foreground.some(item => item.pid === binding.provider.pid)) throw new Error('task_agent_provider_not_in_pane');
    } catch (error) {
      // A normal exit after the liveness read makes Herdr drop the agent and
      // its foreground entry. Where exit is allowed, only a confirmed exit of
      // the same process moves to the exited checks; anything else refuses.
      if (!allowExitedProvider || processProofAlive(binding.provider)) throw error;
      providerAlive = false;
    }
  }
  if (!providerAlive) {
    // After provider exit Herdr may clear the agent identity. This is an
    // explicit cleanup phase, never evidence that another occupant is owned.
    if (pane.name && pane.name !== binding.agent_name) throw new Error('task_agent_pane_identity_lost');
    const foreground = info(binding.endpoint, ['pane', 'process-info', '--pane', binding.pane_id]).process_info?.foreground_processes;
    if (!Array.isArray(foreground) || foreground.some(item => item.pid !== binding.shell.pid)) throw new Error('task_agent_pane_identity_lost');
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
  return join(repository.primary_root, '.ai/harness/runs/task-workspaces', taskWorkspaceKey(repository.repository_id, repository.execution_root));
}
/** The session sweep cannot close an open runtime or contact Herdr. */
export function taskWorktreeRuntimeClosed(repository: TaskRepository): boolean {
  const dir = workspaceDirectory(repository);
  try { lstatSync(dir); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; }
  assertSessionDirectory(repository.primary_root, dir);
  if (!existsSync(join(dir, 'closed.json'))) return false;
  const closed = readSessionArtifact<{ repository_id: string; checkout: string }>(join(dir, 'closed.json'));
  return closed.repository_id === repository.repository_id && closed.checkout === repository.execution_root;
}
function assertWorkspace(binding: TaskWorkspaceBinding): void {
  const value = info(binding.endpoint, ['workspace', 'get', binding.workspace_id]).workspace;
  if (value?.workspace_id !== binding.workspace_id || value.worktree?.repo_key !== binding.repository.repository_id
    || value.worktree.checkout_path !== binding.repository.execution_root || value.worktree.repo_root !== binding.repository.primary_root) throw new Error('task_agent_workspace_identity_lost');
}
function workspaceReadback(endpoint: HerdrEndpoint): Record<string, any>[] {
  const spaces = info(endpoint, ['workspace', 'list']).workspaces;
  if (!Array.isArray(spaces)) throw new Error('task_agent_workspace_response_invalid');
  return spaces;
}
function checkoutWorkspace(spaces: Record<string, any>[], repository: TaskRepository) {
  const matches = spaces.filter(item => item.worktree?.repo_key === repository.repository_id
    && item.worktree?.checkout_path === repository.execution_root && item.worktree?.repo_root === repository.primary_root);
  if (matches.length > 1) throw new Error('task_agent_workspace_identity_ambiguous');
  return matches[0];
}
function archiveWorkspaceIncarnation(dir: string, reason: string): void {
  const history = join(dir, 'history', randomUUID());
  ensureSessionDirectory(dir, history);
  writeSessionArtifact(join(history, 'archived.json'), { reason });
  for (const name of ['open-intent.json', 'binding.json', 'closed.json']) {
    const path = join(dir, name);
    if (existsSync(path)) renameSync(path, join(history, name));
  }
  for (const path of [history, dir]) {
    const fd = openSync(path, constants.O_RDONLY);
    try { fsyncSync(fd); } finally { closeSync(fd); }
  }
}
function workspaceBinding(repository: TaskRepository, endpoint: HerdrEndpoint, rootId: string,
  workspaceId: string, paneId: string, ownership: ObjectOwnership): TaskWorkspaceBinding {
  const pane = info(endpoint, ['pane', 'get', paneId]).pane;
  const shellPid = info(endpoint, ['pane', 'process-info', '--pane', paneId]).process_info.shell_pid;
  const binding: TaskWorkspaceBinding = { protocol: 1, repository, endpoint, root_workspace_id: rootId,
    workspace_id: workspaceId, ownership,
    root_pane: { pane_id: pane.pane_id, terminal_id: pane.terminal_id,
      shell: { pid: shellPid, identity: processIdentity(shellPid) }, ownership } };
  assertWorkspace(binding);
  return binding;
}
function attachWorkspace(repository: TaskRepository, endpoint: HerdrEndpoint, space: Record<string, any>, spaces: Record<string, any>[]): TaskWorkspaceBinding {
  const primary = spaces.find(item => item.worktree?.checkout_path === repository.primary_root
    && item.worktree?.repo_key === repository.repository_id);
  const panes = info(endpoint, ['pane', 'list', '--workspace', space.workspace_id]).panes;
  if (!primary || !Array.isArray(panes) || !panes[0]?.pane_id) throw new Error('task_agent_workspace_response_invalid');
  return workspaceBinding(repository, endpoint, primary.workspace_id, space.workspace_id, panes[0].pane_id, { disposition: 'attached' });
}
export async function registerTaskWorktree(repoRoot: string, endpoint: HerdrEndpoint, parentPane: string, guard?: () => void): Promise<TaskWorkspaceBinding> {
  guard?.();
  validateHerdrEndpoint(endpoint);
  const repository = taskRepository(repoRoot); const dir = workspaceDirectory(repository);
  ensureSessionDirectory(repository.primary_root, dir);
  return locked(repository.primary_root, dir, async () => {
    guard?.();
    const path = join(dir, 'binding.json');
    const spaces = workspaceReadback(endpoint);
    const existing = checkoutWorkspace(spaces, repository);
    const closed = existsSync(join(dir, 'closed.json'));
    if (existsSync(path)) {
      const binding = readSessionArtifact<TaskWorkspaceBinding>(path);
      if (!sameSessionData(binding.endpoint, endpoint)) throw new Error('task_agent_workspace_endpoint_changed');
      if (!closed && existing?.workspace_id === binding.workspace_id) {
        assertWorkspace(binding); return binding;
      }
      archiveWorkspaceIncarnation(dir, closed ? 'closed_incarnation' : 'workspace_disappeared_or_replaced');
      if (existing) {
        const attached = attachWorkspace(repository, endpoint, existing, spaces);
        writeSessionArtifact(path, attached); return attached;
      }
    } else if (existsSync(join(dir, 'open-intent.json')) || closed) {
      if (existsSync(join(dir, 'open-intent.json'))) {
        const intent = readSessionArtifact<{endpoint: HerdrEndpoint}>(join(dir, 'open-intent.json'));
        if (!sameSessionData(intent.endpoint, endpoint)) throw new Error('task_agent_workspace_endpoint_changed');
      }
      archiveWorkspaceIncarnation(dir, existing ? 'open_outcome_attached' : 'open_outcome_absent');
      if (existing) {
        const attached = attachWorkspace(repository, endpoint, existing, spaces);
        writeSessionArtifact(path, attached); return attached;
      }
    }
    const parent = info(endpoint, ['pane', 'get', parentPane]).pane;
    if (typeof parent?.cwd !== 'string' || taskRepository(parent.cwd).repository_id !== repository.repository_id) throw new Error('task_agent_parent_repo_mismatch');
    const roots = spaces;
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
    const binding = workspaceBinding(repository, endpoint, root.workspace_id, opened.workspace.workspace_id, opened.root_pane.pane_id, ownership);
    writeSessionArtifact(path, binding); return binding;
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
  return join(repository.primary_root, '.ai/harness/runs/task-agents', taskSessionKey(repository.repository_id, task, role));
}
export async function locked<T>(root: string, dir: string, action: () => Promise<T>, contended?: () => void, waitTimeoutMs = 10_000): Promise<T> {
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
function bindStartedAgent(intent: StartIntent, pane: CreatedPane): HerdrTaskBinding {
  const agent = info(intent.spec.endpoint, ['agent', 'get', intent.agent_name]).agent;
  if (agent?.pane_id !== pane.pane_id || agent.terminal_id !== pane.terminal_id || agent.agent !== intent.spec.harness_kind) {
    throw new Error('task_agent_start_identity_unknown');
  }
  const processInfo = info(intent.spec.endpoint, ['pane', 'process-info', '--pane', pane.pane_id]).process_info;
  const foreground = processInfo?.foreground_processes;
  const leader = processInfo?.foreground_process_group_id;
  // Herdr lists the whole foreground process group, so provider children can
  // appear beside the provider. The provider leads that group and is never the
  // pane shell; createdProcessGroupAlive relies on the same leader rule. Anything
  // else is refused, not guessed by name or list position.
  if (!Array.isArray(foreground) || !Number.isSafeInteger(leader) || leader < 1 || !Number.isSafeInteger(processInfo.shell_pid)
    || leader === processInfo.shell_pid || foreground.filter(item => item?.pid === leader).length !== 1) throw new Error('task_agent_provider_identity_unknown');
  const ownership: ObjectOwnership = { disposition: 'created', intent_id: intent.intent_id };
  const provider = { pid: leader, identity: processIdentity(leader) };
  const proof = captureTaskPane(intent.spec.endpoint, pane.pane_id, intent.agent_name, provider, ownership);
  const binding: HerdrTaskBinding = { protocol: 2, repository_id: intent.repository.repository_id, execution_root: intent.repository.execution_root, runtime: 'herdr', task: intent.spec.task, role: intent.spec.role,
    harness_kind: intent.spec.harness_kind, endpoint: intent.spec.endpoint,
    max_requests: intent.spec.max_requests, ...proof, ...(intent.task_admission ? { task_admission: intent.task_admission } : {}) };
  assertTaskBinding(binding);
  return binding;
}
/** Existing intents only reconcile; they never repeat split or launch. */
function reconcile(dir: string, intent: StartIntent): HerdrTaskBinding {
  if (!existsSync(join(dir, 'pane-created.json')) || !existsSync(join(dir, 'launch-intent.json')) || !existsSync(join(dir, 'provider-created.json'))) {
    const live = info(intent.spec.endpoint, ['pane', 'list']);
    writeSessionArtifact(join(dir, 'reconciliation.json'), { status: 'reconciliation_required', live }, false);
    throw new Error('task_agent_start_reconciliation_required');
  }
  const pane = readSessionArtifact<CreatedPane>(join(dir, 'pane-created.json'));
  if (pane.intent_id !== intent.intent_id) throw new Error('task_agent_start_identity_unknown');
  const launch = readSessionArtifact<{ intent_id: string }>(join(dir, 'launch-intent.json'));
  if (launch.intent_id !== intent.intent_id) throw new Error('task_agent_start_identity_unknown');
  const binding = readSessionArtifact<HerdrTaskBinding>(join(dir, 'provider-created.json'));
  if (!sameSessionData(binding.task_admission ?? null, intent.task_admission ?? null)
    || binding.task !== intent.spec.task || binding.role !== intent.spec.role || binding.pane_id !== pane.pane_id
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
/** A contending starter waits this long for the lock holder, which can wait up to 50 s for its host to be ready. */
const TASK_START_LOCK_WAIT_MS = 70_000;
export interface TaskStartEffects {
  /** Launches the host in the new pane and names the agent. It is an internal seam, never CLI input. */
  start: (endpoint: HerdrEndpoint, name: string, pane: string, kind: string, args: string[]) => Promise<void>;
  boundary?: (phase: 'intent' | 'split' | 'pane' | 'launched') => Promise<void>;
  contended?: () => void;
  /** Trusted caller fence checked after lock waits and before side effects. */
  guard?: () => void;
  taskAuthority?: TaskSessionAuthority;
}
export async function startTaskAgent(repoRoot: string, spec: TaskAgentSpec, effects: TaskStartEffects): Promise<HerdrTaskBinding> {
  effects.guard?.();
  spec = structuredClone(spec);
  validateSpec(spec);
  const repository = taskRepository(repoRoot); const root = repository.primary_root; const dir = taskSessionDirectory(root, spec.task, spec.role);
  const taskAdmission = effects.taskAuthority ? observeTaskSessionAdmission(repoRoot, spec, 'herdr', effects.taskAuthority) : undefined;
  const recheck = () => { effects.guard?.(); recheckTaskAdmission(repoRoot,
    { ...spec, runtime: 'herdr', task_admission: taskAdmission }, effects.taskAuthority); };
  recheck();
  ensureSessionDirectory(root, dir);
  return locked(root, dir, async () => {
    recheck();
    if (existsSync(join(dir, 'closed.json'))) throw new Error('task_agent_session_closed');
    if (existsSync(join(dir, 'binding.json'))) {
      const intent = readSessionArtifact<StartIntent>(join(dir, 'intent.json'));
      if (!sameSessionData(intent.spec, spec)) throw new Error('task_agent_spec_changed');
      const binding = readSessionArtifact<TaskPaneBinding>(join(dir, 'binding.json'));
      if (binding.runtime !== 'herdr') throw new Error('task_agent_spec_changed');
      recheckTaskAdmission(repoRoot, binding, effects.taskAuthority);
      assertTaskBinding(binding); return binding;
    }
    if (existsSync(join(dir, 'intent.json'))) {
      const intent = readSessionArtifact<StartIntent>(join(dir, 'intent.json'));
      if (!sameSessionData(intent.spec, spec)) throw new Error('task_agent_spec_changed');
      recheckTaskAdmission(repoRoot, { ...intent.spec, runtime: 'herdr', task_admission: intent.task_admission }, effects.taskAuthority);
      return reconcile(dir, intent);
    }
    const workspace = await registerTaskWorktree(repository.execution_root, spec.endpoint, spec.parent_pane, recheck);
    recheck();
    const intent: StartIntent = { protocol: 2, repository, intent_id: randomUUID(), agent_name: `task-${randomUUID().replaceAll('-', '').slice(0, 20)}`, spec, ...(taskAdmission ? { task_admission: taskAdmission } : {}) };
    writeSessionArtifact(join(dir, 'intent.json'), intent);
    await effects.boundary?.('intent');
    recheck();
    writeSessionArtifact(join(dir, 'split-intent.json'), { intent_id: intent.intent_id, workspace_id: workspace.workspace_id });
    const result = info(spec.endpoint, ['pane', 'split', '--pane', workspace.root_pane.pane_id, '--direction', 'right', '--cwd', repository.execution_root, '--no-focus']);
    if (typeof result.pane?.pane_id !== 'string' || typeof result.pane.terminal_id !== 'string') throw new Error('task_agent_split_response_invalid');
    await effects.boundary?.('split');
    recheck();
    const pane: CreatedPane = { pane_id: result.pane.pane_id, terminal_id: result.pane.terminal_id, intent_id: intent.intent_id };
    writeSessionArtifact(join(dir, 'pane-created.json'), pane);
    await effects.boundary?.('pane');
    recheck();
    writeSessionArtifact(join(dir, 'launch-intent.json'), { intent_id: intent.intent_id });
    try {
      await effects.start(spec.endpoint, intent.agent_name, pane.pane_id, spec.harness_kind, spec.args);
      recheck();
    } catch (error) {
      writeSessionArtifact(join(dir, 'launch-unknown.json'), { intent_id: intent.intent_id, error: String(error) });
      throw new Error('task_agent_ambiguous_launch; inspect or cancel the same start; never replay');
    }
    const binding = bindStartedAgent(intent, pane);
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
export async function startTaskApplicationHost(repoRoot: string, spec: TaskAgentSpec,
  command: readonly string[], ready: () => Promise<void>, guard?: () => void, taskAuthority?: TaskSessionAuthority): Promise<HerdrTaskBinding> {
  if (spec.args.length !== 0) throw new Error('task_agent_application_host_command_invalid');
  assertApplicationHostCommand(command);
  return startTaskAgent(repoRoot, spec, { guard, taskAuthority, start: async (endpoint, name, pane, kind) => {
    guard?.();
    mutate(endpoint, ['pane', 'run', pane, ...command]);
    await ready();
    guard?.();
    mutate(endpoint, ['pane', 'report-agent', pane, '--source', 'repo-harness', '--agent', kind, '--state', 'working', '--seq', '1']);
    mutate(endpoint, ['pane', 'report-agent', pane, '--source', 'repo-harness', '--agent', kind, '--state', 'idle', '--seq', '2']);
    mutate(endpoint, ['agent', 'rename', pane, name]);
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
  return locked(root, dir, async () => {
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

export function readTaskAgent(repoRoot: string, task: string, role: string): { dir: string; binding: TaskPaneBinding } {
  const repository = taskRepository(repoRoot); const root = repository.primary_root; const dir = taskSessionDirectory(root, task, role);
  assertSessionDirectory(root, dir);
  const binding = readSessionArtifact<TaskPaneBinding>(join(dir, 'binding.json'));
  if (binding.task !== task || binding.role !== role || binding.protocol !== 2 || binding.repository_id !== repository.repository_id
    || !['herdr', 'terminal'].includes(binding.runtime)) throw new Error('task_agent_binding_invalid');
  if (!Number.isSafeInteger(binding.max_requests) || binding.max_requests < 1 || binding.max_requests > 100) throw new Error('task_agent_binding_invalid');
  if (binding.runtime === 'terminal') {
    assertCreated(binding.ownership);
    const intent = readSessionArtifact<TerminalStartIntent>(join(dir, 'intent.json'));
    const created = readSessionArtifact<TerminalTaskBinding>(join(dir, 'provider-created.json'));
    if (!sameSessionData(intent.task_admission ?? null, binding.task_admission ?? null) || intent.runtime !== 'terminal' || intent.intent_id !== binding.ownership.intent_id || !sameSessionData(intent.command, binding.command)
      || intent.spec.task !== binding.task || intent.spec.role !== binding.role || intent.spec.harness_kind !== binding.harness_kind
      || intent.spec.max_requests !== binding.max_requests || !sameSessionData(created, binding)) throw new Error('task_agent_binding_invalid');
  } else if (binding.ownership.disposition === 'created') {
    const intent = readSessionArtifact<StartIntent>(join(dir, 'intent.json'));
    const pane = readSessionArtifact<CreatedPane>(join(dir, 'pane-created.json'));
    if (!sameSessionData(intent.task_admission ?? null, binding.task_admission ?? null) || !sameSessionData(intent.spec.endpoint, binding.endpoint) || intent.spec.task !== binding.task
      || intent.spec.role !== binding.role || intent.spec.harness_kind !== binding.harness_kind || intent.spec.max_requests !== binding.max_requests) throw new Error('task_agent_binding_invalid');
    if (intent.intent_id !== binding.ownership.intent_id || pane.intent_id !== intent.intent_id
      || pane.pane_id !== binding.pane_id || pane.terminal_id !== binding.terminal_id) throw new Error('task_agent_pane_identity_lost');
    if (binding.provider.ownership.disposition === 'created' && binding.provider.ownership.intent_id !== intent.intent_id) throw new Error('task_agent_binding_invalid');
    const provider = readSessionArtifact<TaskPaneBinding>(join(dir, 'provider-created.json')).provider;
    if (provider.pid !== binding.provider.pid || provider.identity !== binding.provider.identity) throw new Error('task_agent_process_identity_lost');
  }
  return { dir, binding };
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
    if (request.session_binding_sha256 !== sessionDigest(binding) || !request.task_admission
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
  return locked(repository.primary_root, dir, async () => {
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
  return locked(root, dir, async () => {
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
    const request: TaskRequest = { ...(current ? { task_admission: current, session_binding_sha256: sessionDigest(binding) } : {}), protocol: 2, task, role, round, request_id: randomUUID(),
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
async function stopCreatedProcess(proof: OwnedProcess, guard: () => void): Promise<boolean> {
  assertCreated(proof.ownership);
  if (!processProofAlive(proof)) return true;
  // Re-prove pane/process identity before each signal. The guard must allow a
  // provider exit after the check above; createdProcessGroupAlive makes the
  // single alive decision before the first signal.
  guard();
  if (!createdProcessGroupAlive(proof)) return true;
  // The provider leads the group, so its children exit with it even when the
  // provider exits on SIGTERM first.
  const termination = await terminateProcessGroup(proof.pid, 5000, { confirmMs: 5000, beforeForce: guard });
  return termination.confirmed && !processProofAlive(proof);
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
  const intent = readSessionArtifact<StartIntent | TerminalStartIntent>(join(dir, 'intent.json'));
  if (intent.protocol !== 2 || intent.spec.task !== task || intent.spec.role !== role || !intent.intent_id) throw new Error('task_agent_start_identity_unknown');
  if (existsSync(join(dir, 'closed.json'))) return { status: 'closed', pids: [] };
  const finish = () => {
    writeSessionArtifact(join(dir, 'closed.json'), { task, role, intent_id: intent.intent_id, termination: 'unbound-start-cleanup', disposition: mode === 'cancel' ? 'cancelled' : 'incomplete_start' });
    return { status: 'closed' as const, pids: [] };
  };
  // No container or process was created here. The domain proves its host's disposal first.
  if (intent.runtime === 'terminal') return finish();
  if (!existsSync(join(dir, 'pane-created.json'))) {
    if (existsSync(join(dir, 'split-intent.json'))) return { status: 'cleanup_pending', pids: [], reason: 'split_outcome_unrecorded' };
    return finish();
  }
  const pane = readSessionArtifact<CreatedPane>(join(dir, 'pane-created.json'));
  if (pane.intent_id !== intent.intent_id) throw new Error('task_agent_start_identity_unknown');
  if (existsSync(join(dir, 'provider-created.json'))) {
    const proof = readSessionArtifact<HerdrTaskBinding>(join(dir, 'provider-created.json'));
    assertCreated(proof.provider.ownership);
    if (proof.provider.ownership.intent_id !== intent.intent_id || proof.pane_id !== pane.pane_id || proof.terminal_id !== pane.terminal_id) throw new Error('task_agent_start_identity_unknown');
    const stopped = await stopCreatedProcess(proof.provider, () => {
      if (startPanePresent(intent.spec.endpoint, pane)) assertTaskBinding(proof, true);
      // Reparenting doesn't change birth/executable identity. A reused PID still
      // throws; a confirmed exit is left to createdProcessGroupAlive.
      else processProofAlive(proof.provider);
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
    if (closing && processProofAlive(binding.provider)) assertTaskBinding(binding, true);
    if (!closing) {
      assertTaskBinding(binding, true);
      writeSessionArtifact(join(dir, 'close-intent.json'), { task, role, provider: binding.provider, mode });
    }
    if (binding.runtime === 'terminal') {
      // The operator terminal owns this process; cleanup never signals it.
      if (processProofAlive(binding.provider)) return { status: 'cleanup_pending', pids: [binding.provider.pid], reason: 'terminal_host_alive' };
      writeSessionArtifact(join(dir, 'closed.json'), { task, role, provider: binding.provider, disposition: mode === 'cancel' ? 'cancelled' : 'completed' });
      return { status: 'closed', pids: [] };
    }
    if (!await stopCreatedProcess(binding.provider, () => assertTaskBinding(binding, true))) return { status: 'cleanup_pending', pids: [binding.provider.pid] };
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
    if (!existsSync(join(dir, 'intent.json'))) return { status: 'absent', task, role };
    const intent = readSessionArtifact<StartIntent | TerminalStartIntent>(join(dir, 'intent.json'));
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
  return locked(repository.primary_root, dir, async () => {
    if (existsSync(join(dir, 'closed.json'))) return { status: 'closed', pids: [] };
    if (!existsSync(join(dir, 'binding.json'))) {
      if (!existsSync(join(dir, 'open-intent.json'))) return { status: 'not_registered', pids: [] };
      const intent = readSessionArtifact<{repository: TaskRepository; endpoint: HerdrEndpoint}>(join(dir, 'open-intent.json'));
      if (!sameSessionData(intent.repository, expected)) throw new Error('task_agent_workspace_identity_lost');
      const spaces = workspaceReadback(intent.endpoint);
      const existing = checkoutWorkspace(spaces, expected);
      if (!existing) {
        if (!dryRun) writeSessionArtifact(join(dir, 'closed.json'), { repository_id: repository.repository_id, checkout: checkoutPath });
        return { status: 'closed', pids: [] };
      }
      if (dryRun) return { status: 'cleanup_pending', pids: [], reason: 'workspace_attached' };
      writeSessionArtifact(join(dir, 'binding.json'), attachWorkspace(expected, intent.endpoint, existing, spaces));
    }
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
        if (dryRun) return { status: 'cleanup_pending', reason: 'active_roles', pids: existsSync(join(roleDir, 'binding.json')) ? [readSessionArtifact<TaskPaneBinding>(join(roleDir, 'binding.json')).provider.pid] : [] };
        const result = await closeTaskAgent(repository.primary_root, intent.spec.task, intent.spec.role);
        if (result.status !== 'closed') return { ...result, reason: result.reason ?? 'foreground_unproven' };
      }
    }
    const spaces = info(workspace.endpoint, ['workspace', 'list']).workspaces;
    if (!Array.isArray(spaces)) throw new Error('task_agent_workspace_response_invalid');
    if (!spaces.some(item => item.workspace_id === workspace.workspace_id)) {
      if (!dryRun) writeSessionArtifact(join(dir, 'closed.json'), { repository_id: repository.repository_id, checkout: checkoutPath });
      return { status: 'closed', pids: [] };
    }
    assertWorkspace(workspace);
    if (workspace.ownership.disposition !== 'created') return { status: 'cleanup_pending', pids: [], reason: 'workspace_attached' };
    const panes = info(workspace.endpoint, ['pane', 'list', '--workspace', workspace.workspace_id]).panes;
    if (!Array.isArray(panes)) throw new Error('task_agent_workspace_response_invalid');
    if (panes.some(pane => pane.pane_id !== workspace.root_pane.pane_id)) return { status: 'cleanup_pending', pids: [], reason: 'extra_panes' };
    if (panes.length) {
      const pane = panes[0];
      if (pane.terminal_id !== workspace.root_pane.terminal_id || pane.agent) return { status: 'cleanup_pending', pids: [], reason: 'pane_identity' };
      try { assertProcessProof(workspace.root_pane.shell); }
      catch { return { status: 'cleanup_pending', pids: [], reason: 'pane_identity' }; }
      const foreground = info(workspace.endpoint, ['pane', 'process-info', '--pane', pane.pane_id]).process_info.foreground_processes;
      if (!Array.isArray(foreground) || foreground.some(item => item.pid !== workspace.root_pane.shell.pid)) return { status: 'cleanup_pending', pids: [], reason: 'foreground_unproven' };
    }
    if (!dryRun) {
      // Closing a workspace never removes Git checkouts. Never worktree remove.
      mutate(workspace.endpoint, ['workspace', 'close', workspace.workspace_id]);
      const readback = info(workspace.endpoint, ['workspace', 'list']).workspaces;
      if (!Array.isArray(readback) || readback.some(item => item.workspace_id === workspace.workspace_id)) return { status: 'cleanup_pending', pids: [], reason: 'readback_failed' };
      writeSessionArtifact(join(dir, 'closed.json'), { repository_id: repository.repository_id, checkout: checkoutPath });
    }
    return { status: 'closed', pids: [] };
  });
}
