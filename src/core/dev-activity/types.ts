// Public contract for GET /api/v1/dev-activity. See
// plans/plan-20261010-0320-operator-console-kumo.md §3 for the authority table.
// Values that have no authority are null; consumers must not infer them.

import type { PullRequestFiles } from '../operator/pull-request-files';

export const DEV_ACTIVITY_PROJECTION = 'repo-harness.dev-activity.v2' as const;
export const DEV_ACTIVITY_SHIPPED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const DEV_ACTIVITY_COLUMNS = ['planned', 'building', 'verifying', 'ready_to_merge', 'shipped'] as const;
export type DevActivityColumn = typeof DEV_ACTIVITY_COLUMNS[number];

/**
 * Items hidden by default; the UI shows them only behind a filter. Merged and
 * closed PRs are collected only inside DEV_ACTIVITY_SHIPPED_WINDOW_MS, so an
 * older merge is not an item at all.
 */
export type DevActivityHiddenReason = 'closed_unmerged';

export type DevActivitySourceKind = 'git' | 'github' | 'runtime';
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
  /** Open PRs only: the head commit from gh; null when gh gave none. Null for merged and closed PRs. */
  head_sha: string | null;
  /** Open PRs only: every changed file, or why gh gave no complete list. Null for merged and closed PRs. */
  changed_files: PullRequestFiles | null;
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

export interface DevActivityItem {
  /** Stable id: `<repository_id>:<branch>`. */
  id: string;
  repository_id: string;
  branch: string;
  title: string;
  column: DevActivityColumn;
  hidden: DevActivityHiddenReason | null;
  /**
   * When the item entered its current column, from the authority for that
   * column: PR createdAt for open-PR columns (GitHub reports no ready or CLEAN
   * transition time), mergedAt for shipped,
   * null for a branch or worktree without a PR.
   */
  column_since: string | null;
  worktrees: DevActivityWorktree[];
  pull_request: DevActivityPullRequest | null;
  /** Merged PR whose worktree still exists. */
  cleanup_pending: boolean;
}

export const DEV_ACTIVITY_ATTENTION_KINDS = ['ready_to_merge', 'changes_requested', 'merge_conflict', 'checks_failed'] as const;
export type DevActivityAttentionKind = typeof DEV_ACTIVITY_ATTENTION_KINDS[number];

/**
 * GitHub source reason for a PR category (open, merged, closed) that returned
 * more rows than one query may carry. Only that category is dropped; the
 * other categories stay in the snapshot.
 */
export const DEV_ACTIVITY_TRUNCATED_REASON_PREFIX = 'github_truncated_';
export const isTruncatedDevActivityReason = (reason: string | null): boolean =>
  reason !== null && reason.startsWith(DEV_ACTIVITY_TRUNCATED_REASON_PREFIX);

export interface DevActivityAttention {
  kind: DevActivityAttentionKind;
  /** Item id. */
  subject_id: string;
  repository_id: string;
  summary: string;
  /**
   * PR createdAt for every kind: GitHub reports no time for a review decision,
   * merge state or check result. The longest wait comes first.
   */
  waiting_since: string;
  /** Link out (e.g. the PR) or null. */
  url: string | null;
  /** Copyable CLI command or null. The UI never executes it. */
  command: string | null;
}

export interface DevActivitySnapshotV2 {
  projection_version: typeof DEV_ACTIVITY_PROJECTION;
  status: 'ready' | 'partial' | 'unavailable';
  collected_at: string | null;
  repositories: DevActivityRepository[];
  /** Registry rows whose path is gone; shown folded with the prune command. */
  unreadable_registrations: number;
  items: DevActivityItem[];
  /**
   * One row per item, sorted by waiting_since ascending. Its length is the
   * single "needs you" count.
   */
  attention: DevActivityAttention[];
}
