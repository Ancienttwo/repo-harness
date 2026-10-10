// Pure projection: collected Git, GitHub, ledger, runtime and Decision facts
// -> DevActivitySnapshotV1. See plans/plan-20261010-0320-operator-console-kumo.md
// §3.2 (identity), §3.3 (columns and authority table) and §3.4 (attention).
// Every value comes from exactly one authority. A value without one is null.

import { RUNTIME_STALE_AFTER_MS, type RuntimeBadge, type RuntimeOverlay } from '../operator/runtime-status';
import { decodeDevActivitySnapshot } from './decode';
import {
  DEV_ACTIVITY_COLUMNS,
  DEV_ACTIVITY_PROJECTION,
  DEV_ACTIVITY_SHIPPED_WINDOW_MS,
  type DevActivityAgentFacts,
  type DevActivityAttention,
  type DevActivityCiState,
  type DevActivityColumn,
  type DevActivityHiddenReason,
  type DevActivityItem,
  type DevActivityLedgerFacts,
  type DevActivityPrState,
  type DevActivityPullRequest,
  type DevActivityRepository,
  type DevActivityReviewState,
  type DevActivitySnapshotV1,
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

export interface DevActivityRawLedgerRecord {
  record_id: string;
  /** Runtime join key: ledger source_host. */
  source_host: string;
  /** Runtime join key: sha256 digest of the ledger repository_id. */
  runtime_repository_id: string;
  task: string;
  state_version: number;
  branch: string | null;
  title: string;
  phase: string;
  phase_since: string;
  /** Ledger `blocked.return_to`, used only to place a branchless blocked record. */
  blocked_return_to: string | null;
  owner_bot: string;
  blocked: { reason: string; since: string } | null;
  waiting_owner: boolean;
  updated_at: string;
  /** Current projected runs; a runtime badge must name one of them. */
  runs: { role: string; round: number }[];
}

export interface DevActivityRawHumanRequest {
  decision_id: string;
  question: string;
  first_observed_at: string;
}

export interface DevActivityRawRepository {
  repository_id: string;
  display_name: string;
  github: string | null;
  default_branch: string | null;
  sources: DevActivitySourceHealth[];
  worktrees: DevActivityRawWorktree[];
  pull_requests: DevActivityRawPullRequest[];
  ledger: DevActivityRawLedgerRecord[];
  human_requests: DevActivityRawHumanRequest[];
}

export interface DevActivityProjectionInput {
  collected_at: string;
  now_ms: number;
  unreadable_registrations: number;
  repositories: DevActivityRawRepository[];
  /** Null when no runtime source is configured. */
  runtime: RuntimeOverlay | null;
}

/** The ledger's creation sentinel for "no owner". It is not an agent name. */
const LEDGER_UNASSIGNED_OWNER = 'unassigned';
const PLANNING_PHASES: readonly string[] = ['plan', 'plan-review'];
const TERMINAL_PHASES: readonly string[] = ['merged', 'cleanup', 'abandoned'];

/** Mask absolute-path-looking spans in free text. Paths never leave the host. */
export function publicDevActivityText(value: string): string {
  return value.replace(/(^|[\s("'=:])(?:\/[^\s"')]+|[A-Za-z]:[\\/][^\s"')]+)/gu, (_match, prefix: string) => `${prefix}[private path]`);
}

/** True when the value would pass the snapshot decoder's private-path guard. */
export function isPublicDevActivityText(value: string): boolean {
  return !/(?:^|[\s("'=:])\/\S+|[A-Za-z]:[\\/]/u.test(value);
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

/** Branchless ledger records. Terminal phases have no Git or GitHub fact to place them. */
function placeLedgerOnly(record: DevActivityRawLedgerRecord): Placement | null {
  if (TERMINAL_PHASES.includes(record.phase)) return null;
  const effective = record.phase === 'blocked' ? record.blocked_return_to : record.phase;
  if (effective !== null && PLANNING_PHASES.includes(effective)) return { column: 'planned', hidden: null, since: record.phase_since };
  return { column: 'building', hidden: null, since: null };
}

function ledgerFacts(record: DevActivityRawLedgerRecord): DevActivityLedgerFacts {
  return {
    record_id: publicDevActivityText(record.record_id),
    phase: record.phase,
    phase_since: record.phase_since,
    owner: record.owner_bot === LEDGER_UNASSIGNED_OWNER ? null : publicDevActivityText(record.owner_bot),
    blocked: record.blocked ? { reason: publicDevActivityText(record.blocked.reason), since: record.blocked.since } : null,
    waiting_owner: record.waiting_owner,
  };
}

/** Exact verified binding only (same rule as the Pipeline card overlay). Ambiguity claims nothing. */
function runtimeBadgeFor(record: DevActivityRawLedgerRecord, runtime: RuntimeOverlay | null): RuntimeBadge | null {
  if (runtime === null || runtime.status !== 'ready') return null;
  const matches = runtime.badges.filter(badge => badge.identity.source_host === record.source_host
    && badge.identity.repository_id === record.runtime_repository_id
    && badge.identity.task === record.task
    && badge.identity.pipeline_state_version === record.state_version
    && record.runs.some(run => run.role === badge.identity.role && run.round === badge.identity.round)
    && !record.runs.some(run => run.role === badge.identity.role && run.round > badge.identity.round));
  const unique = matches.filter(badge => matches.filter(other => other.identity.role === badge.identity.role
    && other.identity.round === badge.identity.round).length === 1);
  if (unique.length === 0) return null;
  return [...unique].sort((left, right) => Number(right.state === 'blocked') - Number(left.state === 'blocked')
    || left.identity.role.localeCompare(right.identity.role))[0]!;
}

function agentFacts(record: DevActivityRawLedgerRecord | null, badge: RuntimeBadge | null): DevActivityAgentFacts | null {
  if (badge !== null) {
    return { label: badge.identity.role, source: 'runtime', runtime_state: badge.state, runtime_freshness: badge.freshness, changed_at: badge.changed_at };
  }
  if (record !== null && record.owner_bot !== LEDGER_UNASSIGNED_OWNER) {
    return { label: publicDevActivityText(record.owner_bot), source: 'ledger', runtime_state: null, runtime_freshness: null, changed_at: null };
  }
  return null;
}

function runtimeBlocked(badge: RuntimeBadge | null, runtime: RuntimeOverlay | null): DevActivityItem['runtime_blocked'] {
  if (badge === null || badge.state !== 'blocked' || badge.freshness !== 'fresh') return null;
  const since = badge.changed_at ?? runtime?.observed_at ?? null;
  return since === null ? null : { reason: badge.reason, since };
}

function publicPullRequest(pr: DevActivityRawPullRequest): DevActivityPullRequest {
  return {
    number: pr.number, title: pr.title, url: pr.url, state: pr.state, is_draft: pr.is_draft,
    base_branch: pr.base_branch, merge_state: pr.merge_state, ci: pr.ci, review: pr.review,
    updated_at: pr.updated_at, merged_at: pr.merged_at, closed_at: pr.closed_at,
  };
}

function projectRepositoryItems(repo: DevActivityRawRepository, input: DevActivityProjectionInput): DevActivityItem[] {
  const isWorkBranch = (branch: string | null): branch is string =>
    branch !== null && branch !== repo.default_branch && isPublicDevActivityText(branch);
  const pullRequests = repo.pull_requests.filter(pr => insideWindow(pr, input.now_ms));
  const branches = new Set<string>();
  for (const worktree of repo.worktrees) if (isWorkBranch(worktree.branch)) branches.add(worktree.branch);
  for (const pr of pullRequests) if (isWorkBranch(pr.head_branch)) branches.add(pr.head_branch);
  // A ledger branch joins an existing item, or names a branch neither Git nor
  // GitHub listed. Terminal records cannot create a card on their own.
  const ledgerByBranch = new Map<string, DevActivityRawLedgerRecord>();
  for (const record of repo.ledger) {
    if (!isWorkBranch(record.branch)) continue;
    const current = ledgerByBranch.get(record.branch);
    if (!current || time(record.updated_at) > time(current.updated_at)) ledgerByBranch.set(record.branch, record);
  }
  for (const [branch, record] of ledgerByBranch) if (!TERMINAL_PHASES.includes(record.phase)) branches.add(branch);

  const items: DevActivityItem[] = [];
  for (const branch of [...branches].sort()) {
    const worktrees = repo.worktrees.filter(worktree => worktree.branch === branch);
    const pr = selectPullRequest(pullRequests.filter(candidate => candidate.head_branch === branch));
    const record = ledgerByBranch.get(branch) ?? null;
    const placement = placeBranch(pr);
    const badge = record ? runtimeBadgeFor(record, input.runtime) : null;
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
      ledger: record ? ledgerFacts(record) : null,
      agent: agentFacts(record, badge),
      runtime_blocked: runtimeBlocked(badge, input.runtime),
      cleanup_pending: pr?.state === 'merged' && worktrees.length > 0,
    });
  }
  for (const record of repo.ledger) {
    if (record.branch !== null) continue;
    const placement = placeLedgerOnly(record);
    if (placement === null) continue;
    const badge = runtimeBadgeFor(record, input.runtime);
    items.push({
      id: `${repo.repository_id}:ledger:${publicDevActivityText(record.record_id)}`,
      repository_id: repo.repository_id,
      branch: null,
      title: publicDevActivityText(record.title),
      column: placement.column,
      hidden: placement.hidden,
      column_since: placement.since,
      worktrees: [],
      pull_request: null,
      ledger: ledgerFacts(record),
      agent: agentFacts(record, badge),
      runtime_blocked: runtimeBlocked(badge, input.runtime),
      cleanup_pending: false,
    });
  }
  return items;
}

/** §3.4: the single "needs you" definition. One merge ask per item. */
function projectAttention(items: readonly DevActivityItem[], repositories: readonly DevActivityRawRepository[]): DevActivityAttention[] {
  const attention: DevActivityAttention[] = [];
  for (const item of items) {
    const prUrl = item.pull_request?.url ?? null;
    if (item.column === 'ready_to_merge' && item.hidden === null && item.column_since !== null) {
      attention.push({ kind: 'ready_to_merge', subject_id: item.id, repository_id: item.repository_id, summary: item.title,
        waiting_since: item.column_since, url: prUrl, command: null });
    } else if (item.ledger?.waiting_owner) {
      attention.push({ kind: 'ledger_waiting_owner', subject_id: item.id, repository_id: item.repository_id, summary: item.title,
        waiting_since: item.ledger.phase_since, url: prUrl, command: null });
    }
    if (item.runtime_blocked !== null) {
      attention.push({ kind: 'runtime_blocked', subject_id: item.id, repository_id: item.repository_id, summary: item.title,
        waiting_since: item.runtime_blocked.since, url: prUrl, command: null });
    }
  }
  for (const repo of repositories) {
    for (const request of repo.human_requests) {
      attention.push({ kind: 'human_request', subject_id: request.decision_id, repository_id: repo.repository_id,
        summary: publicDevActivityText(request.question), waiting_since: request.first_observed_at, url: null,
        command: `repo-harness verified-context read --kind decision --id ${request.decision_id}` });
    }
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

export function projectDevActivity(input: DevActivityProjectionInput): DevActivitySnapshotV1 {
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
    attention: projectAttention(items, input.repositories),
  });
}
