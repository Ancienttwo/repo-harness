// Pure projection: collected Git and GitHub facts
// -> DevActivitySnapshotV2. See plans/plan-20261010-0320-operator-console-kumo.md
// §3.2 (identity), §3.3 (columns and authority table) and §3.4 (attention).
// Every value comes from exactly one authority. A value without one is null.

import { RUNTIME_STALE_AFTER_MS, type RuntimeOverlay } from '../operator/runtime-status';
import { isPublicDevActivityText, publicDevActivityText } from '../operator/public-text';
import { decodeDevActivitySnapshot } from './decode';
import {
  DEV_ACTIVITY_COLUMNS,
  DEV_ACTIVITY_PROJECTION,
  DEV_ACTIVITY_SHIPPED_WINDOW_MS,
  type DevActivityAttention,
  type DevActivityAttentionKind,
  type DevActivityCiState,
  type DevActivityColumn,
  type DevActivityHiddenReason,
  type DevActivityItem,
  type DevActivityPrState,
  type DevActivityPullRequest,
  type DevActivityRepository,
  type DevActivityReviewState,
  type DevActivitySnapshotV2,
  type DevActivitySourceHealth,
  type DevActivityWorktree,
} from './types';

export interface DevActivityRawWorktree extends DevActivityWorktree {
  /** Short branch name (`refs/heads/` removed); null for a detached HEAD. */
  branch: string | null;
}

export interface DevActivityRawPullRequest extends Omit<DevActivityPullRequest, 'state'> {
  state: DevActivityPrState;
  head_branch: string;
  created_at: string;
}

export interface DevActivityRawRepository {
  repository_id: string;
  display_name: string;
  github: string | null;
  default_branch: string | null;
  sources: DevActivitySourceHealth[];
  worktrees: DevActivityRawWorktree[];
  pull_requests: DevActivityRawPullRequest[];
}

export interface DevActivityProjectionInput {
  collected_at: string;
  now_ms: number;
  unreadable_registrations: number;
  repositories: DevActivityRawRepository[];
}

const FAILED_CONCLUSIONS = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE']);
const FAILED_STATES = new Set(['FAILURE', 'ERROR']);
const PENDING_STATES = new Set(['PENDING', 'EXPECTED']);

/**
 * Summarize GitHub `statusCheckRollup`. CheckRun entries carry status and
 * conclusion; StatusContext entries carry state. Neutral and skipped checks
 * count as passed. Any unrecognised entry shape throws: the caller marks the
 * GitHub source invalid instead of guessing.
 */
export function summarizeCiRollup(entries: unknown): DevActivityCiState {
  if (entries === null) return 'none';
  if (!Array.isArray(entries)) throw new Error('ci_rollup_invalid');
  if (entries.length === 0) return 'none';
  let failed = false;
  let pending = false;
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('ci_rollup_invalid');
    const entry = raw as Record<string, unknown>;
    if (entry.__typename === 'CheckRun') {
      if (typeof entry.status !== 'string') throw new Error('ci_rollup_invalid');
      if (entry.status !== 'COMPLETED') { pending = true; continue; }
      if (typeof entry.conclusion !== 'string') throw new Error('ci_rollup_invalid');
      if (FAILED_CONCLUSIONS.has(entry.conclusion)) failed = true;
    } else if (entry.__typename === 'StatusContext') {
      if (typeof entry.state !== 'string') throw new Error('ci_rollup_invalid');
      if (FAILED_STATES.has(entry.state)) failed = true;
      else if (PENDING_STATES.has(entry.state)) pending = true;
    } else {
      throw new Error('ci_rollup_invalid');
    }
  }
  return failed ? 'failure' : pending ? 'pending' : 'success';
}

export function reviewStateOf(decision: unknown): DevActivityReviewState {
  if (decision === null || decision === undefined || decision === '') return 'none';
  if (decision === 'APPROVED') return 'approved';
  if (decision === 'CHANGES_REQUESTED') return 'changes_requested';
  if (decision === 'REVIEW_REQUIRED') return 'review_required';
  throw new Error('review_decision_invalid');
}

const time = (value: string): number => Date.parse(value);
const latest = <T>(values: readonly T[], at: (value: T) => string | null): T | undefined =>
  [...values].sort((left, right) => (time(at(right) ?? '') || 0) - (time(at(left) ?? '') || 0))[0];

/** One PR per branch: the open one, else the latest merged, else the latest closed. */
function selectPullRequest(candidates: readonly DevActivityRawPullRequest[]): DevActivityRawPullRequest | null {
  const open = candidates.filter(pr => pr.state === 'open');
  if (open.length) return latest(open, pr => pr.created_at)!;
  const merged = candidates.filter(pr => pr.state === 'merged');
  if (merged.length) return latest(merged, pr => pr.merged_at)!;
  return latest(candidates, pr => pr.closed_at ?? pr.updated_at) ?? null;
}

interface Placement { column: DevActivityColumn; hidden: DevActivityHiddenReason | null; since: string | null }

/**
 * The exact shipped window. The collector's GitHub search date is a
 * day-granular superset, so a merged or closed PR outside the window is
 * treated as not collected.
 */
function insideWindow(pr: DevActivityRawPullRequest, nowMs: number): boolean {
  if (pr.state === 'open') return true;
  const at = pr.state === 'merged' ? pr.merged_at : pr.closed_at;
  return at !== null && nowMs - time(at) <= DEV_ACTIVITY_SHIPPED_WINDOW_MS;
}

/** §3.3 column table. The PR, when present, is the authority. */
function placeBranch(pr: DevActivityRawPullRequest | null): Placement {
  if (pr === null) return { column: 'building', hidden: null, since: null };
  if (pr.state === 'merged') return { column: 'shipped', hidden: null, since: pr.merged_at! };
  if (pr.state === 'closed') return { column: 'building', hidden: 'closed_unmerged', since: null };
  if (pr.is_draft) return { column: 'building', hidden: null, since: pr.created_at };
  return { column: pr.merge_state === 'CLEAN' ? 'ready_to_merge' : 'verifying', hidden: null, since: pr.created_at };
}

function publicPullRequest(pr: DevActivityRawPullRequest): DevActivityPullRequest {
  return {
    number: pr.number, title: pr.title, url: pr.url, state: pr.state, is_draft: pr.is_draft,
    base_branch: pr.base_branch, merge_state: pr.merge_state, ci: pr.ci, review: pr.review,
    updated_at: pr.updated_at, merged_at: pr.merged_at, closed_at: pr.closed_at,
    head_sha: pr.head_sha, changed_files: pr.changed_files,
  };
}

function projectRepositoryItems(repo: DevActivityRawRepository, input: DevActivityProjectionInput): DevActivityItem[] {
  const isWorkBranch = (branch: string | null): branch is string =>
    branch !== null && branch !== repo.default_branch && isPublicDevActivityText(branch);
  const pullRequests = repo.pull_requests.filter(pr => insideWindow(pr, input.now_ms));
  const branches = new Set<string>();
  for (const worktree of repo.worktrees) if (isWorkBranch(worktree.branch)) branches.add(worktree.branch);
  for (const pr of pullRequests) if (isWorkBranch(pr.head_branch)) branches.add(pr.head_branch);
  const items: DevActivityItem[] = [];
  for (const branch of [...branches].sort()) {
    const worktrees = repo.worktrees.filter(worktree => worktree.branch === branch);
    const pr = selectPullRequest(pullRequests.filter(candidate => candidate.head_branch === branch));
    const placement = placeBranch(pr);
    items.push({
      id: `${repo.repository_id}:${branch}`,
      repository_id: repo.repository_id,
      branch,
      title: pr ? pr.title : branch,
      column: placement.column,
      hidden: placement.hidden,
      column_since: placement.since,
      worktrees: worktrees.map(({ branch: _branch, ...worktree }) => worktree),
      pull_request: pr ? publicPullRequest(pr) : null,
      cleanup_pending: pr?.state === 'merged' && worktrees.length > 0,
    });
  }
  return items;
}

/**
 * The attention kind an item raises, or null. A blocked open PR outranks a
 * merge ask, so one item is one row; the kind order is the order of the
 * blockers a human clears first. A draft is still being worked on and raises
 * no row. The PR's `review`, `merge_state` and `ci` are the only inputs.
 */
function attentionKindOf(item: DevActivityItem): DevActivityAttentionKind | null {
  const pr = item.pull_request;
  if (item.hidden !== null || item.column_since === null || pr === null || pr.state !== 'open' || pr.is_draft) return null;
  if (pr.review === 'changes_requested') return 'changes_requested';
  if (pr.merge_state === 'DIRTY') return 'merge_conflict';
  if (pr.ci === 'failure') return 'checks_failed';
  return item.column === 'ready_to_merge' ? 'ready_to_merge' : null;
}

/** §3.4: the single "needs you" definition. One ask per item, longest wait first. */
function projectAttention(items: readonly DevActivityItem[]): DevActivityAttention[] {
  const attention: DevActivityAttention[] = [];
  for (const item of items) {
    const kind = attentionKindOf(item);
    if (kind === null) continue;
    attention.push({ kind, subject_id: item.id, repository_id: item.repository_id, summary: item.title,
      waiting_since: item.column_since!, url: item.pull_request!.url, command: null });
  }
  return attention.sort((left, right) => time(left.waiting_since) - time(right.waiting_since)
    || left.kind.localeCompare(right.kind) || left.subject_id.localeCompare(right.subject_id));
}

/** Runtime source health is one global observation, reported on every repository. */
export function runtimeSourceHealth(runtime: RuntimeOverlay | null, nowMs: number): DevActivitySourceHealth {
  if (runtime === null) return { kind: 'runtime', status: 'not_configured', reason: 'runtime_not_configured', observed_at: null };
  if (runtime.status !== 'ready' || runtime.observed_at === null) return { kind: 'runtime', status: 'unavailable', reason: 'runtime_unavailable', observed_at: runtime.observed_at };
  if (nowMs - time(runtime.observed_at) > RUNTIME_STALE_AFTER_MS) return { kind: 'runtime', status: 'stale', reason: 'runtime_stale', observed_at: runtime.observed_at };
  return { kind: 'runtime', status: 'ok', reason: null, observed_at: runtime.observed_at };
}

export function projectDevActivity(input: DevActivityProjectionInput): DevActivitySnapshotV2 {
  const columnOrder = (column: DevActivityColumn) => DEV_ACTIVITY_COLUMNS.indexOf(column);
  const items = input.repositories.flatMap(repo => projectRepositoryItems(repo, input))
    .sort((left, right) => left.repository_id.localeCompare(right.repository_id)
      || columnOrder(left.column) - columnOrder(right.column) || left.id.localeCompare(right.id));
  const repositories: DevActivityRepository[] = input.repositories.map(repo => ({
    repository_id: repo.repository_id, display_name: publicDevActivityText(repo.display_name), github: repo.github,
    default_branch: repo.default_branch, sources: repo.sources,
  }));
  const degraded = repositories.some(repo => repo.sources.some(source => source.status === 'unavailable' || source.status === 'stale'));
  return decodeDevActivitySnapshot({
    projection_version: DEV_ACTIVITY_PROJECTION,
    status: degraded ? 'partial' : 'ready',
    collected_at: input.collected_at,
    repositories,
    unreadable_registrations: input.unreadable_registrations,
    items,
    attention: projectAttention(items),
  });
}
