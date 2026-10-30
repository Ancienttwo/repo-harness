/** #1023 independent effects. HTTP/CLI and host coordination are separate owners. */
import { randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { JsonValue } from '../../core/evidence/types';
import type { DocSessionChange } from '../../core/operator/doc-session-changes';
import { isRepositoryRelativePath } from '../../core/operator/doc-session-events';
import type { DocSessionRecordV1 } from '../../core/operator/doc-session-record';
import {
  decodeDocSessionCommit, decodeDocSessionDiscard,
  type DocSessionCommitInput, type DocSessionDiscardInput, type DocSessionDraftPr,
  type DocSessionPublicationTarget, type DocSessionPrCreateResult,
} from '../../core/operator/doc-session-finalize';
import { createFileExclusiveDurably, syncDirectoryDurably } from '../atomic-append';
import { gitExecFileSync, configuredGitBinary, withoutRepositorySelectingGitEnv } from '../git/runner';
import { acquireExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { withWorktreeTopologyLockAsync, assertNoOwner, assertWorktreeBinding, entries } from '../state/coordination-worktree-topology';
import { occupiesWorktree, worktreeProcesses, type WorktreeProcess } from '../git/worktree-processes';
import {
  docSessionGitRunner, docSessionDiffSha256, docSessionLossSha256, observeDocSessionChanges,
  observeDocSessionLoss, readDocSessionDiff, resolveDocSession,
} from './doc-session-changes';
import { readDocSessionEvents, sessionDirectory } from './doc-session-events';
import { operatorAuditPath, prepareOperatorStateDir, readOperatorAuditRequest } from './write-audit';
import { OperatorWriteRefusal, parseOperatorRequestId, runOperatorWrite, type OperatorWriteOperation, type OperatorWriteResponse } from './write-run';

export interface DocSessionFinalizeDependencies {
  readonly env: NodeJS.ProcessEnv;
  /**
   * REQUIRED host adapter. Hold the same lifecycle exclusion used by messages/resume
   * until action settles. Refuse an active turn. Prove the host and descendants have
   * stopped; a stopped session must not be restarted. Missing/unknown proof refuses.
   * The macOS commit path accepts the owner-decided occupancy proof (2026-10-31);
   * discard never proceeds without the upstream cleanup capability. Never implement
   * this as merely reading events or returning action().
   */
  readonly with_quiesced_session: <T>(sessionId: string, action: () => Promise<T>, kind: 'commit' | 'discard') => Promise<T>;
  /** REQUIRED authoritative scope and architecture hand-edits check. Throw before
   * mutation, including for instruction files, generated targets and generated regions.
   * Run against this resolved worktree and these complete base-relative changes.
   */
  readonly validate_changes: (session: DocSessionRecordV1, changes: readonly DocSessionChange[]) => Promise<void>;
  /** Server-owned target selection; validate repository, remote and default base. */
  readonly publication_target: (session: DocSessionRecordV1) => Promise<DocSessionPublicationTarget>;
  /** Lookup all PR states by exact repository/head/base. Verify draft and head SHA.
   * Throw on unavailable/ambiguous results; null means a successful absence lookup. */
  readonly find_draft_pr: (target: DocSessionPublicationTarget, branch: string, commit: string) => Promise<DocSessionDraftPr | null>;
  /** `not_created` requires proof no PR was created. Network/timeout/parse failures
   * are `unknown`. Never retry an uncertain create without provider reconciliation. */
  readonly create_draft_pr: (target: DocSessionPublicationTarget, branch: string, commit: string, message: string) => Promise<DocSessionPrCreateResult>;
  /** Fixture seam for process inventory; production uses the fail-closed OS probe. */
  readonly processes?: (deadline: number) => readonly WorktreeProcess[] | null;
}

interface CommitState {
  protocol: 1;
  kind: 'commit';
  input: DocSessionCommitInput;
  commit: string;
  target: DocSessionPublicationTarget;
  remote_url: string;
  stage: 'prepared' | 'committed' | 'pushed' | 'creating_pr' | 'pr_failed' | 'complete';
  pr: DocSessionDraftPr | null;
  audit: StepAttempt | null;
}
interface DiscardState {
  protocol: 1;
  kind: 'discard';
  input: DocSessionDiscardInput;
  stage: 'removing' | 'removed' | 'complete';
  audit: StepAttempt | null;
}
type State = CommitState | DiscardState;
interface StepAttempt { step: string; request_id: string; previous_request_id: string | null }
const AUDIT_STEPS = ['commit', 'push', 'draft_pr', 'draft_pr_reconcile', 'discard_worktree', 'discard_branch'];
const JOURNAL_MAX_BYTES = 32_768;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const AUDIT_RECONCILE_ACTION = 'Reconcile the saved step request_id with the operator audit log. Do not retry publication until its result is established.';
const refusal = (code: string, status = 409) => new OperatorWriteRefusal(status, code, code, 'Read the session state before retrying with a new request_id.');
const auditIncomplete = () => new OperatorWriteRefusal(409, 'step_audit_incomplete', 'The saved step has no complete audit result.', AUDIT_RECONCILE_ACTION);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The policy adapter reports only safe relative paths to the caller. */
export class DocSessionScopeRefusal extends OperatorWriteRefusal {
  constructor(code: 'path_outside_scope' | 'generated_region', readonly files: readonly string[]) {
    super(422, code, code, 'Remove the refused changes and review the complete diff again.');
    if (files.length === 0 || files.length > 1000 || !files.every(isRepositoryRelativePath)) throw new Error('scope refusal paths invalid');
  }
}

/** Durable private journal; it is never inside the removable worktree. */
function readState(directory: string): State | null {
  let fd: number;
  try { fd = openSync(join(directory, 'finalize.json'), constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > JOURNAL_MAX_BYTES) throw new Error('finalize state invalid');
    const state = JSON.parse(readFileSync(fd, 'utf8')) as State;
    if (state.protocol !== 1) throw new Error('finalize state protocol');
    if (state.audit !== null && (!state.audit || !AUDIT_STEPS.includes(state.audit.step)
      || parseOperatorRequestId(state.audit.request_id) === null
      || (state.audit.previous_request_id !== null && parseOperatorRequestId(state.audit.previous_request_id) === null))) throw new Error('finalize audit identity');
    if (state.kind === 'commit') {
      decodeDocSessionCommit(state.input as unknown as Record<string, unknown>);
      validateTarget(state.target);
      if (!OID.test(state.commit) || typeof state.remote_url !== 'string' || !state.remote_url
        || !['prepared', 'committed', 'pushed', 'creating_pr', 'pr_failed', 'complete'].includes(state.stage)) throw new Error('finalize commit state');
      if (state.pr !== null) validatePr(state.pr, state.target);
      if ((state.stage === 'complete') !== (state.pr !== null)) throw new Error('finalize pr state');
    } else if (state.kind === 'discard') {
      decodeDocSessionDiscard(state.input as unknown as Record<string, unknown>);
      if (!['removing', 'removed', 'complete'].includes(state.stage)) throw new Error('finalize discard state');
    } else throw new Error('finalize state kind');
    return state;
  } finally { closeSync(fd); }
}
function saveState(directory: string, state: State): void {
  const bytes = encodeState(state);
  const temporary = join(directory, `finalize-${randomUUID()}.tmp`);
  createFileExclusiveDurably(temporary, bytes);
  renameSync(temporary, join(directory, 'finalize.json'));
  syncDirectoryDurably(directory);
}
function encodeState(state: State): Buffer {
  const bytes = Buffer.from(JSON.stringify(state) + '\n');
  if (bytes.length > JOURNAL_MAX_BYTES) throw refusal('finalize_state_too_large', 413);
  return bytes;
}
/** Reserve the largest later phase before writing any Git object or journal. */
function checkCommitCapacity(state: CommitState): void {
  const id = '00000000-0000-4000-8000-000000000000';
  encodeState({ ...state, commit: '0'.repeat(64), stage: 'creating_pr',
    pr: { number: Number.MAX_SAFE_INTEGER, url: `https://github.com/${state.target.repository}/pull/${Number.MAX_SAFE_INTEGER}` },
    audit: { step: 'discard_worktree_reconcile', request_id: id, previous_request_id: id },
  });
}
function validateTarget(target: DocSessionPublicationTarget): void {
  if (!target || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(target.remote)
    || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/u.test(target.repository)
    || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(target.base_branch)
    || target.base_branch.includes('..') || target.base_branch.includes('//') || target.base_branch.endsWith('.lock')) throw new Error('publication target invalid');
}
function validatePr(pr: DocSessionDraftPr, target: DocSessionPublicationTarget): void {
  if (!Number.isSafeInteger(pr.number) || pr.number < 1 || pr.url !== `https://github.com/${target.repository}/pull/${pr.number}`) throw new Error('draft pr identity invalid');
}
function git(env: NodeJS.ProcessEnv, cwd: string, args: string[], input?: string | Buffer, index?: string): string {
  return gitExecFileSync(['--no-pager', '-c', 'core.fsmonitor=false', ...args], {
    cwd, env: { ...withoutRepositorySelectingGitEnv(env), GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', ...(index ? { GIT_INDEX_FILE: index } : {}) },
    gitBin: configuredGitBinary(env), timeout: 30_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
function remoteUrl(env: NodeJS.ProcessEnv, worktree: string, target: DocSessionPublicationTarget): string {
  const urls = git(env, worktree, ['remote', 'get-url', '--push', '--all', target.remote]).split('\n');
  if (urls.length !== 1 || !urls[0] || urls[0].startsWith('-')) throw new Error('publication remote ambiguous');
  return urls[0];
}
function remoteHead(env: NodeJS.ProcessEnv, worktree: string, url: string, branch: string): string | null {
  const text = git(env, worktree, ['ls-remote', '--refs', '--', url, `refs/heads/${branch}`]);
  if (!text) return null;
  const rows = text.split('\n');
  const [oid, ref] = rows[0]!.split('\t');
  if (rows.length !== 1 || !OID.test(oid!) || ref !== `refs/heads/${branch}`) throw new Error('remote branch observation invalid');
  return oid!;
}
function outcome(state: State, code?: string): OperatorWriteResponse {
  return { status: code ? 503 : 200, body: {
    protocol: 1, kind: 'operator_docs_session_finalize', operation: state.kind, stage: state.stage,
    ...(state.kind === 'commit' ? { commit: state.commit, pushed: ['pushed', 'creating_pr', 'pr_failed', 'complete'].includes(state.stage), pr: state.pr as unknown as JsonValue } : {}),
    ...(code ? { error: { code, message: code, next_action: code === 'step_audit_incomplete' ? AUDIT_RECONCILE_ACTION : 'Retry the same session action with a new request_id and unchanged fields. An uncertain PR create needs reconciliation.' } } : {}),
  } };
}

/** Each externally visible step has its own global intent and result audit.
 * An absent result is not success, even when its side effect has happened. */
function observedStepAudit(sid: string, state: State, deps: DocSessionFinalizeDependencies): { completed: boolean; value: JsonValue } | null {
  if (state.audit === null) return null;
  const lock = acquireExclusiveDirectoryLock(prepareOperatorStateDir(deps.env), 'locks/audit', { waitTimeoutMs: 1000 });
  try {
    lock.assertOwned();
    const { intent, result } = readOperatorAuditRequest(operatorAuditPath(deps.env), state.audit.request_id);
    const body = result?.body as Record<string, JsonValue> | undefined;
    if (!intent || !result || intent.operation !== `docs_finalize_${state.audit.step}` || intent.target !== `docs_finalize_step:${sid}`
      || result.binding_sha256 !== intent.binding_sha256 || !body || body.step !== state.audit.step
      || typeof body.completed !== 'boolean' || result.status !== (body.completed ? 200 : 503)) throw auditIncomplete();
    return { completed: body.completed, value: body.value ?? null };
  } finally { lock.release(); }
}

async function auditedStep<T>(sid: string, step: string, deps: DocSessionFinalizeDependencies, directory: string, state: State, action: () => Promise<T>): Promise<T> {
  const previous = observedStepAudit(sid, state, deps);
  const knownNoPr = step === 'draft_pr' && previous?.value !== null && typeof previous?.value === 'object'
    && !Array.isArray(previous.value) && (previous.value as { readonly [key: string]: JsonValue }).state === 'not_created';
  if (state.audit?.step === step && previous?.completed && !knownNoPr) return previous.value as T;
  if (previous && !previous.completed && state.audit?.step !== step && step !== 'draft_pr_reconcile') throw auditIncomplete();
  state.audit = { step, request_id: randomUUID(), previous_request_id: state.audit?.request_id ?? null };
  saveState(directory, state);
  let result: T | undefined;
  let actionError: unknown;
  await runOperatorWrite(state.audit.request_id, {
    operation: `docs_finalize_${step}`, target: `docs_finalize_step:${sid}`,
    input: { session_id: sid, step, previous_request_id: state.audit.previous_request_id },
    execute: async (): Promise<OperatorWriteResponse> => {
      try { result = await action(); return { status: 200, body: { step, completed: true, value: (result ?? null) as JsonValue } }; }
      catch (error) { actionError = error; return { status: 503, body: { step, completed: false } }; }
    },
  }, deps.env);
  const recorded = observedStepAudit(sid, state, deps);
  if (!recorded?.completed) throw actionError ?? new Error('finalization step failed');
  return result as T;
}

/** Freeze a tree from the canonical observed blobs. A private index never changes
 * the user's staging area. Rehash every byte before writing the object. */
function prepareCommit(env: NodeJS.ProcessEnv, directory: string, session: DocSessionRecordV1, changes: readonly DocSessionChange[], input: DocSessionCommitInput): string {
  const index = join(directory, `index-${randomUUID()}`);
  try {
    git(env, session.worktree, ['read-tree', session.base_commit], undefined, index);
    for (const change of changes) {
      if (change.new_oid !== null) {
        const file = join(session.worktree, change.path);
        const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
        let bytes: Buffer;
        try { if (!fstatSync(fd).isFile()) throw refusal('diff_changed'); bytes = readFileSync(fd); } finally { closeSync(fd); }
        const oid = git(env, session.worktree, ['hash-object', '-w', '--stdin', `--path=${change.path}`], bytes);
        if (oid !== change.new_oid) throw refusal('diff_changed');
      }
      const mode = change.new_mode ?? '0';
      const oid = change.new_oid ?? '0'.repeat(input.expected_head.length);
      git(env, session.worktree, ['update-index', '-z', '--index-info'], `${mode} ${oid}\t${change.path}\0`, index);
    }
    const tree = git(env, session.worktree, ['write-tree'], undefined, index);
    return git(env, session.worktree, ['commit-tree', tree, '-p', input.expected_head], input.message + '\n');
  } finally {
    try { unlinkSync(index); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

async function commitLocked(sid: string, input: DocSessionCommitInput, deps: DocSessionFinalizeDependencies, directory: string): Promise<OperatorWriteResponse> {
  let state = readState(directory);
  if (state && (state.kind !== 'commit' || !same(state.input, input))) throw refusal('finalization_conflict');
  if (state) observedStepAudit(sid, state, deps);
  if (state?.kind === 'commit' && state.stage === 'complete') return outcome(state);
  const { record, worktree } = resolveDocSession(deps.env, sid);
  const runner = docSessionGitRunner(deps.env);
  if (!state) {
    // The docs host cannot write Git metadata. An externally created history
    // could contain out-of-scope bytes that the final tree no longer shows.
    // Do not publish that unreviewed ancestry from this first finalization.
    if (input.expected_head !== record.base_commit) throw refusal('head_history_unsupported');
    const diff = readDocSessionDiff(deps.env, sid);
    if (diff.head_commit !== input.expected_head || diff.diff_sha256 !== input.expected_diff_sha256) throw refusal('diff_changed');
    const changes = observeDocSessionChanges(runner, worktree, record.base_commit);
    if (docSessionDiffSha256(record.base_commit, changes) !== input.expected_diff_sha256) throw refusal('diff_changed');
    if (!changes.length) throw refusal('no_changes');
    await deps.validate_changes(record, changes);
    const target = await deps.publication_target(record); validateTarget(target);
    const url = remoteUrl(deps.env, worktree, target);
    if (remoteHead(deps.env, worktree, url, record.branch) !== null) throw refusal('branch_pushed');
    const prepared: CommitState = { protocol: 1, kind: 'commit', input, commit: '0'.repeat(64), target, remote_url: url, stage: 'prepared', pr: null, audit: null };
    checkCommitCapacity(prepared);
    const commit = prepareCommit(deps.env, directory, record, changes, input);
    const fresh = readDocSessionDiff(deps.env, sid);
    if (fresh.head_commit !== input.expected_head || fresh.diff_sha256 !== input.expected_diff_sha256) throw refusal('diff_changed');
    state = { ...prepared, commit };
    saveState(directory, state);
  }
  if (state.kind !== 'commit') throw refusal('finalization_conflict');
  try {
    if (remoteUrl(deps.env, worktree, state.target) !== state.remote_url) throw refusal('remote_changed');
    const head = git(deps.env, worktree, ['rev-parse', 'HEAD']);
    if (state.stage === 'prepared') {
      if (head === input.expected_head) {
        const diff = readDocSessionDiff(deps.env, sid);
        if (diff.diff_sha256 !== input.expected_diff_sha256) throw refusal('diff_changed');
        await deps.validate_changes(record, observeDocSessionChanges(runner, worktree, record.base_commit));
        await auditedStep(sid, 'commit', deps, directory, state, async () => {
          git(deps.env, worktree, ['update-ref', `refs/heads/${record.branch}`, state.commit, input.expected_head]);
        });
      } else if (head !== state.commit) throw refusal('head_changed');
      else await auditedStep(sid, 'commit', deps, directory, state, async () => {});
      state.stage = 'committed'; saveState(directory, state);
    } else if (head !== state.commit) throw refusal('head_changed');
    if (state.stage === 'committed') {
      const remote = remoteHead(deps.env, worktree, state.remote_url, record.branch);
      if (remote !== null && remote !== state.commit) throw refusal('remote_changed');
      await auditedStep(sid, 'push', deps, directory, state, async () => {
        if (remote === null) git(deps.env, worktree, ['push', '--porcelain', '--', state.remote_url, `${state.commit}:refs/heads/${record.branch}`]);
        if (remoteHead(deps.env, worktree, state.remote_url, record.branch) !== state.commit) throw new Error('push readback failed');
      });
      if (remoteHead(deps.env, worktree, state.remote_url, record.branch) !== state.commit) throw new Error('push readback failed');
      state.stage = 'pushed'; saveState(directory, state);
    }
    if (remoteHead(deps.env, worktree, state.remote_url, record.branch) !== state.commit) throw refusal('remote_changed');
    const existing = await deps.find_draft_pr(state.target, record.branch, state.commit);
    if (existing) {
      validatePr(existing, state.target);
      await auditedStep(sid, 'draft_pr_reconcile', deps, directory, state, async () => ({ number: existing.number, url: existing.url }));
      state.pr = existing; state.stage = 'complete'; saveState(directory, state); return outcome(state);
    }
    if (state.stage === 'creating_pr') return outcome(state, 'pr_outcome_unknown');
    state.stage = 'creating_pr'; saveState(directory, state);
    const created = await auditedStep(sid, 'draft_pr', deps, directory, state, async () => {
      const value = await deps.create_draft_pr(state.target, record.branch, state.commit, state.input.message);
      if (value.state === 'created') {
        validatePr(value.pr, state.target);
        return { state: 'created' as const, pr: { number: value.pr.number, url: value.pr.url } };
      }
      if (value.state !== 'not_created' && value.state !== 'unknown') throw new Error('PR outcome invalid');
      return { state: value.state };
    });
    if (created.state === 'created') {
      validatePr(created.pr, state.target); state.pr = created.pr; state.stage = 'complete';
    } else if (created.state === 'not_created') state.stage = 'pr_failed';
    saveState(directory, state);
    return outcome(state, state.stage === 'complete' ? undefined : state.stage === 'pr_failed' ? 'pr_create_failed' : 'pr_outcome_unknown');
  } catch (error) {
    if (error instanceof DocSessionScopeRefusal) throw error;
    // Publication can have happened. Do not label this an unapplied refusal.
    return outcome(state, error instanceof OperatorWriteRefusal ? error.code : 'finalize_step_failed');
  }
}

async function discardLocked(sid: string, input: DocSessionDiscardInput, deps: DocSessionFinalizeDependencies, directory: string): Promise<OperatorWriteResponse> {
  let state = readState(directory);
  if (state) {
    observedStepAudit(sid, state, deps);
    if (state.kind === 'commit') throw refusal(['pushed', 'creating_pr', 'pr_failed', 'complete'].includes(state.stage) ? 'branch_pushed' : 'finalization_conflict');
    if (!same(state.input, input)) throw refusal('finalization_conflict');
    if (state.stage === 'complete') return outcome(state);
    // Removal can be partial. Never resume deletion from an old authorization.
    return outcome(state, 'discard_reconcile_required');
  }
  const { record, worktree } = resolveDocSession(deps.env, sid);
  const repo = readRepoHarnessRegistryStrictSnapshot({ env: deps.env }).repos.find(item => item.id === record.repository_id)!;
  return withWorktreeTopologyLockAsync(repo.path, async () => {
    resolveDocSession(deps.env, sid);
    assertWorktreeBinding(repo.path, worktree, record.branch, { gitBin: configuredGitBinary(deps.env) });
    if (entries(repo.path, { gitBin: configuredGitBinary(deps.env) }).some(entry => entry.branch === `refs/heads/${record.branch}` && entry.path !== worktree)) throw refusal('worktree_in_use');
    assertNoOwner(repo.path, worktree, { gitBin: configuredGitBinary(deps.env) });
    const processes = (deps.processes ?? worktreeProcesses)(Date.now() + 5000);
    if (processes === null || occupiesWorktree(processes, worktree)) throw refusal('worktree_in_use');
    const target = await deps.publication_target(record); validateTarget(target);
    const url = remoteUrl(deps.env, worktree, target);
    const runner = docSessionGitRunner(deps.env);
    const loss = observeDocSessionLoss(runner, record, worktree);
    if (loss.pushed || remoteHead(deps.env, worktree, url, record.branch) !== null) throw refusal('branch_pushed');
    if (loss.head_commit !== input.expected_head || docSessionLossSha256(loss) !== input.expected_loss_sha256) throw refusal('loss_changed');
    // Last observation occurs in the topology and lifecycle critical sections.
    const fresh = observeDocSessionLoss(runner, record, worktree);
    if (docSessionLossSha256(fresh) !== input.expected_loss_sha256) throw refusal('loss_changed');
    state = { protocol: 1, kind: 'discard', input, stage: 'removing', audit: null }; saveState(directory, state);
    try {
      await auditedStep(sid, 'discard_worktree', deps, directory, state, async () => {
        git(deps.env, repo.path, ['worktree', 'remove', '--force', '--', worktree]);
      });
      state.stage = 'removed'; saveState(directory, state);
      if (entries(repo.path, { gitBin: configuredGitBinary(deps.env) }).some(entry => entry.branch === `refs/heads/${record.branch}`)) throw new Error('branch has another worktree');
      await auditedStep(sid, 'discard_branch', deps, directory, state, async () => {
        git(deps.env, repo.path, ['update-ref', '-d', `refs/heads/${record.branch}`, input.expected_head]);
      });
      state.stage = 'complete'; saveState(directory, state);
      return outcome(state);
    } catch { return outcome(state, 'discard_reconcile_required'); }
  }, { deadline: Date.now() + 30_000, gitBin: configuredGitBinary(deps.env) });
}

function operation(sid: string, kind: 'commit' | 'discard', input: DocSessionCommitInput | DocSessionDiscardInput, deps: DocSessionFinalizeDependencies): OperatorWriteOperation {
  if (!/^[0-9a-f]{32}$/u.test(sid)) throw new Error('finalize session id');
  return {
    operation: `docs_session_${kind}`, target: `docs_session:${sid}`, input: { session_id: sid, ...input },
    execute: async () => {
      const directory = sessionDirectory(deps.env, sid);
      // Also protects direct effect callers. No stale-owner auto-reclaim.
      const lock = acquireExclusiveDirectoryLock(directory, 'finalize.lock', { waitTimeoutMs: 50 });
      try {
        lock.assertOwned();
        return await deps.with_quiesced_session(sid, async () => {
          lock.assertOwned();
          if (readDocSessionEvents(deps.env, sid, null).activity === 'running') throw refusal('turn_active');
          return kind === 'commit' ? commitLocked(sid, input as DocSessionCommitInput, deps, directory) : discardLocked(sid, input as DocSessionDiscardInput, deps, directory);
        }, kind);
      } catch (error) {
        if (error instanceof DocSessionScopeRefusal) return {
          status: error.status, body: { error: { code: error.code, message: error.message, next_action: error.next_action, files: [...error.files] } },
        };
        throw error;
      } finally { lock.release(); }
    },
  };
}
/** Both callers MUST pass this operation through runOperatorWrite (intent/result audit). */
export function docSessionCommitOperation(sid: string, fields: Readonly<Record<string, unknown>>, deps: DocSessionFinalizeDependencies): OperatorWriteOperation {
  return operation(sid, 'commit', decodeDocSessionCommit(fields), deps);
}
export function docSessionDiscardOperation(sid: string, fields: Readonly<Record<string, unknown>>, deps: DocSessionFinalizeDependencies): OperatorWriteOperation {
  return operation(sid, 'discard', decodeDocSessionDiscard(fields), deps);
}

/** Safe detail-page projection. No target URL, filesystem path, or saved message
 * leaves the journal. Reading an atomic journal needs no mutation lock. */
export function readDocSessionFinalization(env: NodeJS.ProcessEnv, sid: string): JsonValue | null {
  const state = readState(sessionDirectory(env, sid));
  return state === null ? null : outcome(state).body;
}
