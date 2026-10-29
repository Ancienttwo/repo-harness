import { canonicalize } from '../evidence/canonical-json';
import type { JsonValue } from '../evidence/types';
import { isPublicWorktreeDirectory, WORKTREE_REASONS, type WorktreeView } from './worktrees';

/**
 * Wire shapes of the green worktree cleanup (slice 5.1): the request of
 * `POST /api/v1/worktrees/cleanup` and `repo-harness worktrees clean`, its
 * result, and the selection digest input. Pure, so the browser can import it.
 */

export const WORKTREE_CLEANUP_MAX_IDS = 16;
export const WORKTREE_CLEANUP_SKIP_REASONS = ['changed', 'busy', 'deadline', 'recovery_pending', 'removal_unproven'] as const;
export type WorktreeCleanupReason = typeof WORKTREE_REASONS[number] | typeof WORKTREE_CLEANUP_SKIP_REASONS[number];
const CLEANUP_REASONS: readonly string[] = [...WORKTREE_REASONS, ...WORKTREE_CLEANUP_SKIP_REASONS];
export const WORKTREE_ID = /^wt_[a-f0-9]{64}$/u;
export const DIGEST = /^[a-f0-9]{64}$/u;
const REPOSITORY_ID = /^repo_[a-f0-9]{16}$/u;

export interface WorktreeCleanupRequest {
  /** Sorted and unique, so a reordered retry has the same request binding. */
  readonly ids: readonly string[];
  readonly expected_digest: string;
}

/** The fields a selection digest binds. Sizes, process counts and times are not part of the decision. */
export type WorktreeDigestRow = Pick<WorktreeView, 'id' | 'repository_id' | 'branch' | 'judgment' | 'reasons' | 'merge' | 'dirty_files' | 'ignored_entries' | 'unpushed_commits'>;

export function worktreeDigestRow(view: WorktreeView): WorktreeDigestRow {
  return {
    id: view.id, repository_id: view.repository_id, branch: view.branch, judgment: view.judgment, reasons: [...view.reasons],
    merge: view.merge, dirty_files: view.dirty_files, ignored_entries: view.ignored_entries, unpushed_commits: view.unpushed_commits,
  };
}

/** The exact bytes that SHA-256 hashes into `expected_digest`. Rows are ordered by id. */
export function selectionDigestInput(rows: readonly WorktreeDigestRow[]): string {
  const items = [...rows].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return canonicalize({ version: 1, items: items as unknown as JsonValue });
}

/** Closed body without `request_id`. Approval fields belong to the cleanup session (5.2) and are refused here. */
export function decodeWorktreeCleanupRequest(fields: Readonly<Record<string, unknown>>): WorktreeCleanupRequest {
  if (Object.keys(fields).sort().join(',') !== 'expected_digest,ids') throw new Error('worktree_cleanup_request_invalid');
  const { ids, expected_digest: digest } = fields;
  if (typeof digest !== 'string' || !DIGEST.test(digest)) throw new Error('worktree_cleanup_request_invalid');
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > WORKTREE_CLEANUP_MAX_IDS) throw new Error('worktree_cleanup_request_invalid');
  if (!ids.every(id => typeof id === 'string' && WORKTREE_ID.test(id)) || new Set(ids).size !== ids.length) throw new Error('worktree_cleanup_request_invalid');
  return { ids: [...ids as string[]].sort(), expected_digest: digest };
}

export interface WorktreeCleanupItem {
  readonly id: string;
  readonly repository_id: string;
  readonly directory: string;
  readonly outcome: 'removed' | 'skipped' | 'failed';
  readonly reason: WorktreeCleanupReason | null;
}

export interface WorktreeCleanupResult {
  readonly protocol: 1;
  readonly kind: 'operator_worktree_cleanup';
  readonly items: readonly WorktreeCleanupItem[];
}

/** Exact public shape. No path, command or error text crosses this boundary. */
export function decodeWorktreeCleanupResult(value: unknown): WorktreeCleanupResult {
  const fail = (): never => { throw new Error('worktree_cleanup_result_invalid'); };
  const exact = (v: unknown, keys: string): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join(',') !== keys) return fail();
    return v as Record<string, unknown>;
  };
  const result = exact(value, 'items,kind,protocol');
  if (result.protocol !== 1 || result.kind !== 'operator_worktree_cleanup' || !Array.isArray(result.items)
    || result.items.length === 0 || result.items.length > WORKTREE_CLEANUP_MAX_IDS) fail();
  const ids = new Set<string>();
  for (const raw of result.items as unknown[]) {
    const item = exact(raw, 'directory,id,outcome,reason,repository_id');
    if (typeof item.id !== 'string' || !WORKTREE_ID.test(item.id) || ids.has(item.id)
      || typeof item.repository_id !== 'string' || !REPOSITORY_ID.test(item.repository_id)
      || !isPublicWorktreeDirectory(item.directory)
      || !['removed', 'skipped', 'failed'].includes(item.outcome as string)
      || (item.outcome === 'removed' ? item.reason !== null : typeof item.reason !== 'string' || !CLEANUP_REASONS.includes(item.reason))) fail();
    ids.add(item.id as string);
  }
  return value as WorktreeCleanupResult;
}
