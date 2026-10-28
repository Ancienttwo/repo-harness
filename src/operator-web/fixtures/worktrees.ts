// Development fixtures for GET /api/v1/worktrees. Shapes follow
// src/core/operator/worktrees.ts; every fixture passes the same decoder the
// browser applies to served snapshots. Branches line up with the board fixture
// so its merged `feat/kanban-status` card joins a green worktree.
import { unavailableWorktrees, type WorktreeLifecycle, type WorktreeView, type WorktreesSnapshot } from '../../core/operator/worktrees';
import { HARNESS_ID } from './dev-activity';

const SITE_ID = 'repo_1f2e3d4c5b6a7980';
const DOCS_ID = 'repo_0a1b2c3d4e5f6071';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MB = 1024 * 1024;

function at(now: number, ago: number): string {
  return new Date(now - ago).toISOString();
}

type Row = Partial<WorktreeView> & Pick<WorktreeView, 'directory' | 'judgment'>;

/** `repositoryId` is null only for a directory with no Git pointer left, listed under `unassigned`. */
function tree(now: number, repositoryId: string | null, seed: string, row: Row): WorktreeView {
  return {
    id: `wt_${seed.repeat(64).slice(0, 64)}`, repository_id: repositoryId, branch: null, source: 'unknown', reasons: [],
    size_bytes: null, size_observed_at: null, process_count: 0, dirty_files: 0, ignored_entries: 0, unpushed_commits: 0,
    merge: 'unknown', record: null, ...row,
    ...(row.size_bytes !== undefined && row.size_bytes !== null && row.size_observed_at === undefined ? { size_observed_at: at(now, 20 * MINUTE) } : {}),
  };
}

function record(now: number, overrides: Partial<WorktreeLifecycle> & Pick<WorktreeLifecycle, 'creator' | 'purpose'>): WorktreeLifecycle {
  return { task_id: null, pull_request: null, created_at: at(now, 2 * DAY), ended_at: null, end_state: 'open', ...overrides };
}

/**
 * Every judgment and source, one size `du` could not finish, a leftover
 * directory git no longer lists, and two directories no repository can claim.
 */
export function busyWorktrees(now: number): WorktreesSnapshot {
  return {
    version: 1, status: 'ready', collected_at: at(now, 2 * MINUTE),
    repositories: [
      { repository_id: HARNESS_ID, display_name: 'repo-harness', status: 'ready', worktrees: [
        tree(now, HARNESS_ID, '0a', { directory: 'repo-harness', branch: 'main', source: 'manual', judgment: 'red', reasons: ['primary'], size_bytes: 1843 * MB, ignored_entries: 2210 }),
        tree(now, HARNESS_ID, '1b', { directory: 'feat-kanban-status', branch: 'feat/kanban-status', source: 'contract', judgment: 'green', merge: 'provider',
          size_bytes: 612 * MB, ignored_entries: 412, record: record(now, { creator: 'contract', purpose: 'Observe native agent status in Kanban', pull_request: 606 }) }),
        tree(now, HARNESS_ID, '2c', { directory: 'repo-harness-wt-pi-host', branch: 'feat/pi-host', source: 'portal', judgment: 'green', merge: 'ancestor',
          size_observed_at: at(now, 3 * HOUR), ignored_entries: 380 }),
        tree(now, HARNESS_ID, '3d', { directory: 'repo-harness-wt-kanban-redesign', branch: 'feat/kanban-human-redesign', source: 'contract', judgment: 'red',
          reasons: ['process_in_use', 'dirty', 'unpushed'], process_count: 2, dirty_files: 4, unpushed_commits: 3, merge: 'unmerged', size_bytes: 702 * MB,
          record: record(now, { creator: 'contract', purpose: 'Rebuild the operator console for humans', pull_request: 608, created_at: at(now, 3 * HOUR) }) }),
        tree(now, HARNESS_ID, '4e', { directory: 'repo-harness-wt-oar', branch: 'chore/oar-0-45', source: 'task', judgment: 'yellow', reasons: ['merge_unproven'],
          merge: 'unmerged', size_bytes: 380 * MB, record: record(now, { creator: 'task', purpose: 'Upgrade OAR to 0.45.1', task_id: 'task-602', pull_request: 602 }) }),
        tree(now, HARNESS_ID, '5f', { directory: 'repo-harness-wt-old-spike', source: 'unknown', judgment: 'yellow', reasons: ['unregistered', 'no_branch'],
          process_count: null, dirty_files: null, ignored_entries: null, unpushed_commits: null, size_bytes: 96 * MB }),
        tree(now, HARNESS_ID, '6a', { directory: 'codex-7f3a', branch: 'codex/fix-hooks', source: 'codex', judgment: 'yellow', reasons: ['outside_managed_root', 'dirty'],
          dirty_files: 2, merge: 'unmerged', size_bytes: 254 * MB }),
        tree(now, HARNESS_ID, '7b', { directory: 'repo-harness-wt-docs-cleanup', branch: 'docs/feynman', source: 'mcp', judgment: 'yellow', reasons: ['locked'],
          merge: 'ancestor', size_bytes: 41 * MB, record: record(now, { creator: 'mcp', purpose: 'Require Feynman reports', created_at: at(now, 3 * DAY), ended_at: at(now, DAY), end_state: 'closed' }) }),
      ] },
      { repository_id: SITE_ID, display_name: 'operator-site', status: 'ready', worktrees: [
        tree(now, SITE_ID, '8c', { directory: 'operator-site', branch: 'main', source: 'manual', judgment: 'red', reasons: ['primary'], size_bytes: 905 * MB }),
        tree(now, SITE_ID, '9d', { directory: 'operator-site-csp', branch: 'fix/csp-header', source: 'claude', judgment: 'red', reasons: ['dirty', 'unpushed'],
          dirty_files: 1, unpushed_commits: 2, merge: 'unmerged', size_bytes: 133 * MB }),
        tree(now, SITE_ID, 'ae', { directory: 'operator-site-wt-footer', branch: 'fix/footer', source: 'manual', judgment: 'green', merge: 'absorbed', size_bytes: 210 * MB }),
      ] },
      { repository_id: DOCS_ID, display_name: 'field-notes', status: 'ready', worktrees: [
        tree(now, DOCS_ID, 'bf', { directory: 'field-notes', branch: 'main', source: 'manual', judgment: 'red', reasons: ['primary'], size_bytes: 12 * MB }),
      ] },
    ],
    unassigned: [
      tree(now, null, 'c0', { directory: 'codex-91c2', source: 'codex', judgment: 'yellow', reasons: ['unregistered', 'outside_managed_root'],
        process_count: null, dirty_files: null, ignored_entries: null, unpushed_commits: null, size_bytes: 188 * MB }),
      tree(now, null, 'd1', { directory: 'mcp-ws-4410', source: 'mcp', judgment: 'yellow', reasons: ['unregistered'],
        process_count: null, dirty_files: null, ignored_entries: null, unpushed_commits: null }),
    ],
  };
}

/** The first collection has not finished. */
export function emptyWorktrees(): WorktreesSnapshot {
  return unavailableWorktrees();
}

/** One repository could not be read and every size probe timed out. */
export function degradedWorktrees(now: number): WorktreesSnapshot {
  return {
    version: 1, status: 'partial', collected_at: at(now, 5 * MINUTE),
    repositories: [
      { repository_id: HARNESS_ID, display_name: 'repo-harness', status: 'ready', worktrees: [
        tree(now, HARNESS_ID, '0a', { directory: 'repo-harness', branch: 'main', source: 'manual', judgment: 'red', reasons: ['primary'], process_count: null }),
        tree(now, HARNESS_ID, '3d', { directory: 'repo-harness-wt-kanban-redesign', branch: 'feat/kanban-human-redesign', source: 'contract', judgment: 'red',
          reasons: ['process_unknown', 'probe_failed'], process_count: null, dirty_files: null, unpushed_commits: null, ignored_entries: null, merge: 'unknown' }),
      ] },
      { repository_id: SITE_ID, display_name: 'operator-site', status: 'unavailable', worktrees: [] },
    ],
    unassigned: [],
  };
}
