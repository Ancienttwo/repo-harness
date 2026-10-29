import { isAgentRuntimeId } from './agents-settings';
import { DOC_SESSION_AGENT_STATES, DOC_SESSION_ID, PULL_URL, type DocSessionAgentState } from './doc-session-api';
import { DIGEST, WORKTREE_CLEANUP_MAX_IDS, WORKTREE_CLEANUP_SKIP_REASONS, WORKTREE_ID, type WorktreeCleanupRequest } from './worktree-cleanup';
import { isPublicWorktreeDirectory, WORKTREE_REASONS, type WorktreeView } from './worktrees';

/**
 * Wire shapes of the worktree cleanup session (slice 5.2, #1025): the plan the
 * agent hands in, the approval request, and the per-item result. The PRD
 * 「Worktree 管理」and the design doc `5-WTC` scenarios fix the behavior; these
 * bodies are the contract the server routes answer. Pure, so the page can
 * import the decoders.
 *
 * The browser sends stable ids and digests only. An approval binds the loss
 * digest the user saw and the plan digest, so a changed item is skipped and
 * asks for a new approval (`5-WTC-F1`).
 */

export const CLEANUP_PLAN_ADVICE = ['delete', 'archive_then_delete', 'keep'] as const;
export type CleanupPlanAdvice = typeof CLEANUP_PLAN_ADVICE[number];
export const CLEANUP_PLAN_STATES = ['investigating', 'ready', 'executing', 'done'] as const;
export type CleanupPlanState = typeof CLEANUP_PLAN_STATES[number];
export const CLEANUP_ARCHIVE_STEPS = ['commit', 'push', 'pull_request'] as const;
export type CleanupArchiveStep = typeof CLEANUP_ARCHIVE_STEPS[number];
/** Skip reasons a session cleanup adds to the green cleanup reasons. */
export const CLEANUP_SESSION_SKIP_REASONS = ['reapproval_required', 'archive_failed', 'not_approved', 'in_use'] as const;
export const CLEANUP_PLAN_EVIDENCE_MAX = 8;
export const CLEANUP_PLAN_TEXT_MAX = 500;

export interface CleanupPlanItemV1 {
  readonly id: string;
  readonly repository_id: string;
  readonly directory: string;
  readonly branch: string | null;
  readonly judgment: WorktreeView['judgment'];
  /** The agent's advice for a yellow item; null for green (rule-based) and red (no delete entry). */
  readonly advice: CleanupPlanAdvice | null;
  /** Redacted agent text; null when advice is null. */
  readonly reason: string | null;
  readonly evidence: readonly string[];
  readonly loss: { readonly unpushed_commits: number; readonly dirty_files: number; readonly ignored_entries: number };
  readonly loss_sha256: string;
  /** Where kept content goes: the `docs/archive-<slug>` branch and, for credential files, a private directory name. */
  readonly archive: { readonly branch: string | null; readonly private_directory: string | null } | null;
}

/** `POST /api/v1/sessions` with `kind: worktree_cleanup`: 201 and the new session id. */
export interface OperatorCleanupSessionCreatedV1 {
  readonly protocol: 1;
  readonly kind: 'operator_worktree_cleanup_session_created';
  readonly session_id: string;
}

/** `GET /api/v1/sessions/{sid}/plan`. `plan_sha256` is null until the agent hands in the plan. */
export interface OperatorCleanupPlanV1 {
  readonly protocol: 1;
  readonly kind: 'operator_worktree_cleanup_plan';
  readonly session_id: string;
  /** The runtime that works the session; the record names it as the agent. */
  readonly runtime: string;
  readonly agent: DocSessionAgentState;
  readonly state: CleanupPlanState;
  readonly plan_sha256: string | null;
  readonly items: readonly CleanupPlanItemV1[];
  readonly observed_at: string;
}

export interface CleanupApprovalV1 {
  readonly id: string;
  readonly loss_sha256: string;
  readonly plan_sha256: string;
}

/** `POST /api/v1/worktrees/cleanup` from a cleanup session, without `request_id`. Green ids carry no approval. */
export interface CleanupSessionRequestV1 extends WorktreeCleanupRequest {
  readonly session_id: string;
  readonly approvals: readonly CleanupApprovalV1[];
}

export type CleanupSessionReason = typeof WORKTREE_REASONS[number] | typeof WORKTREE_CLEANUP_SKIP_REASONS[number] | typeof CLEANUP_SESSION_SKIP_REASONS[number];

export interface CleanupSessionItemV1 {
  readonly id: string;
  readonly repository_id: string;
  readonly directory: string;
  readonly outcome: 'removed' | 'skipped' | 'failed';
  readonly reason: CleanupSessionReason | null;
}

/** The archive runs before any delete; `failed` names the step, and no archived worktree is removed (`5-WTC-F2`). */
export interface CleanupArchiveV1 {
  readonly state: 'not_needed' | 'done' | 'failed';
  readonly failed_step: CleanupArchiveStep | null;
  readonly pull_request: { readonly number: number; readonly url: string } | null;
}

export interface OperatorCleanupSessionResultV1 {
  readonly protocol: 1;
  readonly kind: 'operator_worktree_cleanup_session';
  readonly session_id: string;
  readonly archive: CleanupArchiveV1;
  readonly items: readonly CleanupSessionItemV1[];
}

const REPOSITORY_ID = /^repo_[a-f0-9]{16}$/u;
const ARCHIVE_BRANCH = /^docs\/archive-[a-z0-9][a-z0-9-]{0,99}$/u;
const REASONS: readonly string[] = [...WORKTREE_REASONS, ...WORKTREE_CLEANUP_SKIP_REASONS, ...CLEANUP_SESSION_SKIP_REASONS];

const fail = (what: string): never => { throw new Error(`cleanup plan ${what}`); };
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function exact(value: unknown, keys: readonly string[], what: string): Record<string, unknown> {
  if (!isObject(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(what);
  return value as Record<string, unknown>;
}
const one = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === 'string' && (values as readonly string[]).includes(value);
const timestamp = (value: unknown): boolean => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= CLEANUP_PLAN_TEXT_MAX;
const count = (value: unknown): boolean => Number.isSafeInteger(value) && (value as number) >= 0;

function decodePlanItem(raw: unknown): CleanupPlanItemV1 {
  const item = exact(raw, ['advice', 'archive', 'branch', 'directory', 'evidence', 'id', 'judgment', 'loss', 'loss_sha256', 'reason', 'repository_id'], 'item');
  if (typeof item.id !== 'string' || !WORKTREE_ID.test(item.id) || typeof item.repository_id !== 'string' || !REPOSITORY_ID.test(item.repository_id)
    || !isPublicWorktreeDirectory(item.directory) || !(item.branch === null || text(item.branch)) || !one(item.judgment, ['green', 'yellow', 'red'] as const)
    || typeof item.loss_sha256 !== 'string' || !DIGEST.test(item.loss_sha256)) fail('item');
  // Only a yellow item carries the agent's advice; green follows the sweep rule and red has no delete entry.
  if (item.judgment === 'yellow' ? !one(item.advice, CLEANUP_PLAN_ADVICE) || !text(item.reason) : item.advice !== null || item.reason !== null) fail('item advice');
  if (!Array.isArray(item.evidence) || item.evidence.length > CLEANUP_PLAN_EVIDENCE_MAX || !item.evidence.every(text)) fail('item evidence');
  const loss = exact(item.loss, ['dirty_files', 'ignored_entries', 'unpushed_commits'], 'item loss');
  if (!count(loss.dirty_files) || !count(loss.ignored_entries) || !count(loss.unpushed_commits)) fail('item loss');
  if (item.archive !== null) {
    const archive = exact(item.archive, ['branch', 'private_directory'], 'item archive');
    if (!(archive.branch === null || (typeof archive.branch === 'string' && ARCHIVE_BRANCH.test(archive.branch)))
      || !(archive.private_directory === null || isPublicWorktreeDirectory(archive.private_directory))
      || (archive.branch === null && archive.private_directory === null) || item.advice !== 'archive_then_delete') fail('item archive');
  } else if (item.advice === 'archive_then_delete') fail('item archive');
  return item as unknown as CleanupPlanItemV1;
}

export function decodeOperatorCleanupSessionCreated(value: unknown): OperatorCleanupSessionCreatedV1 {
  const created = exact(value, ['kind', 'protocol', 'session_id'], 'created');
  if (created.protocol !== 1 || created.kind !== 'operator_worktree_cleanup_session_created'
    || typeof created.session_id !== 'string' || !DOC_SESSION_ID.test(created.session_id)) fail('created');
  return value as OperatorCleanupSessionCreatedV1;
}

export function decodeOperatorCleanupPlan(value: unknown, sessionId: string): OperatorCleanupPlanV1 {
  const plan = exact(value, ['agent', 'items', 'kind', 'observed_at', 'plan_sha256', 'protocol', 'runtime', 'session_id', 'state'], 'plan');
  if (plan.protocol !== 1 || plan.kind !== 'operator_worktree_cleanup_plan' || plan.session_id !== sessionId || !DOC_SESSION_ID.test(sessionId)
    || !isAgentRuntimeId(plan.runtime) || !one(plan.agent, DOC_SESSION_AGENT_STATES) || !one(plan.state, CLEANUP_PLAN_STATES) || !timestamp(plan.observed_at)
    || !(plan.plan_sha256 === null || (typeof plan.plan_sha256 === 'string' && DIGEST.test(plan.plan_sha256)))
    || (plan.state === 'investigating') !== (plan.plan_sha256 === null) || !Array.isArray(plan.items)) fail('plan');
  const ids = new Set<string>();
  for (const raw of plan.items as unknown[]) {
    const item = decodePlanItem(raw);
    if (ids.has(item.id)) fail('item');
    ids.add(item.id);
  }
  return value as OperatorCleanupPlanV1;
}

export function decodeOperatorCleanupSessionResult(value: unknown, sessionId: string): OperatorCleanupSessionResultV1 {
  const result = exact(value, ['archive', 'items', 'kind', 'protocol', 'session_id'], 'result');
  if (result.protocol !== 1 || result.kind !== 'operator_worktree_cleanup_session' || result.session_id !== sessionId
    || !Array.isArray(result.items) || result.items.length === 0 || result.items.length > WORKTREE_CLEANUP_MAX_IDS) fail('result');
  const archive = exact(result.archive, ['failed_step', 'pull_request', 'state'], 'archive');
  if (!one(archive.state, ['not_needed', 'done', 'failed'] as const)
    || (archive.state === 'failed') !== one(archive.failed_step, CLEANUP_ARCHIVE_STEPS)
    || (archive.state !== 'failed' && archive.failed_step !== null)) fail('archive');
  if (archive.pull_request !== null) {
    const pull = exact(archive.pull_request, ['number', 'url'], 'archive pull request');
    if (archive.state === 'not_needed' || !Number.isSafeInteger(pull.number) || (pull.number as number) < 1 || typeof pull.url !== 'string'
      || !PULL_URL.test(pull.url) || !pull.url.endsWith(`/pull/${pull.number}`)) fail('archive pull request');
  } else if (archive.state === 'done') fail('archive pull request');
  const ids = new Set<string>();
  for (const raw of result.items as unknown[]) {
    const item = exact(raw, ['directory', 'id', 'outcome', 'reason', 'repository_id'], 'result item');
    if (typeof item.id !== 'string' || !WORKTREE_ID.test(item.id) || ids.has(item.id) || typeof item.repository_id !== 'string'
      || !REPOSITORY_ID.test(item.repository_id) || !isPublicWorktreeDirectory(item.directory) || !one(item.outcome, ['removed', 'skipped', 'failed'] as const)
      || (item.outcome === 'removed' ? item.reason !== null : !one(item.reason, REASONS))) fail('result item');
    ids.add(item.id as string);
  }
  return value as OperatorCleanupSessionResultV1;
}
