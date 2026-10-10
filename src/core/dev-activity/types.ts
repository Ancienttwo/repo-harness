// Public contract for GET /api/v1/dev-activity. See
// plans/plan-20261010-0320-operator-console-kumo.md §3 for the authority table.
// Values that have no authority are null; consumers must not infer them.

export const DEV_ACTIVITY_PROJECTION = 'repo-harness.dev-activity.v1' as const;
export const DEV_ACTIVITY_SHIPPED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const DEV_ACTIVITY_COLUMNS = ['planned', 'building', 'verifying', 'ready_to_merge', 'shipped'] as const;
export type DevActivityColumn = typeof DEV_ACTIVITY_COLUMNS[number];

/**
 * Items hidden by default; the UI shows them only behind a filter. Merged and
 * closed PRs are collected only inside DEV_ACTIVITY_SHIPPED_WINDOW_MS, so an
 * older merge is not an item at all.
 */
export type DevActivityHiddenReason = 'closed_unmerged';

/** `decisions` is the open Human request inventory (§3.4 source 3). */
export type DevActivitySourceKind = 'git' | 'github' | 'ledger' | 'runtime' | 'decisions';
export type DevActivitySourceStatus = 'ok' | 'unavailable' | 'stale' | 'not_configured';

export interface DevActivitySourceHealth {
  kind: DevActivitySourceKind;
  status: DevActivitySourceStatus;
  /** Fixed reason code, never free text from a subprocess. */
  reason: string | null;
  observed_at: string | null;
}

export interface DevActivityRepository {
  /** Fleet registry id (`repo_` + 16 hex). */
  repository_id: string;
  display_name: string;
  /** `owner/name` when a GitHub remote exists, else null. */
  github: string | null;
  default_branch: string | null;
  sources: DevActivitySourceHealth[];
}

export type DevActivityCiState = 'success' | 'failure' | 'pending' | 'none';
export type DevActivityReviewState = 'approved' | 'changes_requested' | 'review_required' | 'none';
export type DevActivityPrState = 'open' | 'merged' | 'closed';

export interface DevActivityPullRequest {
  number: number;
  title: string;
  url: string;
  state: DevActivityPrState;
  is_draft: boolean;
  base_branch: string;
  /** GitHub mergeStateStatus, verbatim (e.g. CLEAN, BLOCKED, DIRTY, UNKNOWN). */
  merge_state: string;
  /** Collected for open PRs only; null for merged and closed PRs. */
  ci: DevActivityCiState | null;
  review: DevActivityReviewState;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

export interface DevActivityWorktree {
  /** Directory basename only; never an absolute path. */
  directory: string;
  head_sha: string;
  dirty: boolean;
  /** Relative to the upstream branch; null when there is no upstream. */
  ahead: number | null;
  behind: number | null;
}

export interface DevActivityLedgerFacts {
  record_id: string;
  phase: string;
  phase_since: string;
  /** From ledger `owner_bot`; null when absent. */
  owner: string | null;
  blocked: { reason: string; since: string } | null;
  waiting_owner: boolean;
}

export interface DevActivityAgentFacts {
  /** Who: ledger owner or a verified runtime binding. Never inferred. */
  label: string;
  source: 'ledger' | 'runtime';
  /** Runtime overlay state label; null when no verified runtime binding. */
  runtime_state: string | null;
  runtime_freshness: 'fresh' | 'stale' | 'disconnected' | null;
  changed_at: string | null;
}

export interface DevActivityItem {
  /** Stable id: `<repository_id>:<branch>` or `<repository_id>:ledger:<record_id>`. */
  id: string;
  repository_id: string;
  branch: string | null;
  title: string;
  column: DevActivityColumn;
  hidden: DevActivityHiddenReason | null;
  /**
   * When the item entered its current column, from the authority for that
   * column: PR createdAt for open-PR columns (GitHub reports no ready or CLEAN
   * transition time), mergedAt for shipped, ledger phase_since for planned,
   * null for a branch or worktree without a PR.
   */
  column_since: string | null;
  worktrees: DevActivityWorktree[];
  pull_request: DevActivityPullRequest | null;
  ledger: DevActivityLedgerFacts | null;
  agent: DevActivityAgentFacts | null;
  /** Runtime-observed block, only when the observation is fresh. */
  runtime_blocked: { reason: string; since: string } | null;
  /** Merged PR whose worktree still exists. */
  cleanup_pending: boolean;
}

export type DevActivityAttentionKind = 'ready_to_merge' | 'ledger_waiting_owner' | 'human_request' | 'runtime_blocked';

export interface DevActivityAttention {
  kind: DevActivityAttentionKind;
  /** Item id, or the human request id for `human_request`. */
  subject_id: string;
  repository_id: string;
  summary: string;
  /**
   * From the authority for the kind: PR createdAt (ready_to_merge), ledger
   * phase_since (ledger_waiting_owner), runtime changed_at or observation time
   * (runtime_blocked). Decision records carry no timestamp, so for
   * `human_request` this is when the collector first observed the open request.
   */
  waiting_since: string;
  /** Link out (e.g. the PR) or null. */
  url: string | null;
  /** Copyable CLI command or null. The UI never executes it. */
  command: string | null;
}

export interface DevActivitySnapshotV1 {
  projection_version: typeof DEV_ACTIVITY_PROJECTION;
  status: 'ready' | 'partial' | 'unavailable';
  collected_at: string | null;
  repositories: DevActivityRepository[];
  /** Registry rows whose path is gone; shown folded with the prune command. */
  unreadable_registrations: number;
  items: DevActivityItem[];
  /** Sorted by waiting_since ascending. Its length is the single "needs you" count. */
  attention: DevActivityAttention[];
}
