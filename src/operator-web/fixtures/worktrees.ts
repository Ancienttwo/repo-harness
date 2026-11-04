// Development fixtures for GET /api/v1/worktrees. Shapes follow
// src/core/operator/worktrees.ts; every fixture passes the same decoder the
// browser applies to served snapshots. Branches line up with the board fixture
// so its merged `feat/kanban-status` card joins a green worktree.
import { decodeWorktreeCleanupResult } from '../../core/operator/worktree-cleanup';
import {
  cleanupPlanDigestInput, decodeAuthorizedCleanupRequest, decodeCleanupChoices, decodeCleanupExecutionResult, decodeCleanupPlan,
  type CleanupExecutionItem, type CleanupLossSummary, type CleanupPlan, type CleanupPlanItem, type CleanupReason,
} from '../../core/operator/worktree-cleanup-plan';
import { unavailableWorktrees, type WorktreeLifecycle, type WorktreeView, type WorktreesSnapshot } from '../../core/operator/worktrees';
import type { WorktreeCleanupWriter } from '../worktrees';
import type { CleanupPlanPorts } from '../CleanupPlanReview';
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

/** Removes every requested row but the last of several, which a process took after the page read it. */
export function worktreeCleanupFixture(snapshot: WorktreesSnapshot): WorktreeCleanupWriter {
  const rows = new Map(snapshot.repositories.flatMap(repository => repository.worktrees).map(row => [row.id, row]));
  return body => Promise.resolve({ state: 'cleaned', result: decodeWorktreeCleanupResult({
    protocol: 1, kind: 'operator_worktree_cleanup',
    items: body.ids.map((id, index) => {
      const row = rows.get(id)!;
      const skipped = body.ids.length > 1 && index === body.ids.length - 1;
      return { id, repository_id: row.repository_id, directory: row.directory, outcome: skipped ? 'skipped' : 'removed', reason: skipped ? 'process_in_use' : null };
    }),
  }) });
}

const PLAN_SESSION = '7c1e9a40b2d35f6e8a9c0b1d2e3f4a5b';

async function sha256(input: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)));
  return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** plan_sha256 hashes the core digest input, as the server does. */
async function planItem(item: Omit<CleanupPlanItem, 'plan_sha256'>): Promise<CleanupPlanItem> {
  return { ...item, plan_sha256: await sha256(cleanupPlanDigestInput(PLAN_SESSION, item)) };
}

/**
 * Pass 1 of the busy cleanup plan: one item of each judgment, a loss nobody
 * could read, and eight items the user can choose for. The loss digest is a
 * stand-in, because only the server reads raw contents.
 */
async function firstPlan(now: number): Promise<CleanupPlan> {
  const busy = busyWorktrees(now).repositories.flatMap(repository => repository.worktrees);
  const row = (directory: string) => busy.find(tree => tree.directory === directory)!;
  const extra = (seed: string, directory: string, branch: string, dirty: number) => tree(now, HARNESS_ID, seed, {
    directory, branch, source: 'contract', judgment: 'yellow', reasons: ['dirty'], dirty_files: dirty, merge: 'unmerged', size_bytes: 64 * MB });
  const commits = (count: number) => Array.from({ length: count }, (_, index) => String(index + 1).repeat(40));
  // `archivable` is what the server lists: a staged deletion and an ignored directory have no bytes to archive.
  const loss = (archivable: string[], files: string[], ignored: string[] = [], commitCount = 0): CleanupLossSummary =>
    ({ files, ignored, commits: commits(commitCount), archivable });
  const rows: { readonly tree: WorktreeView; readonly loss: CleanupLossSummary | null }[] = [
    { tree: row('feat-kanban-status'), loss: loss([], []) },
    { tree: row('repo-harness-wt-kanban-redesign'), loss: loss(['src/operator-web/BoardPage.tsx'], ['src/operator-web/BoardPage.tsx'], [], 3) },
    { tree: row('repo-harness-wt-old-spike'), loss: null },
    { tree: row('repo-harness-wt-oar'), loss: loss([], [], [], 2) },
    { tree: row('codex-7f3a'), loss: loss(['.env', 'docs/hooks.md', 'src/hooks/run.ts'], ['docs/hooks.md', 'docs/old-hooks.md', 'src/hooks/run.ts'], ['.env', 'node_modules/']) },
    { tree: row('repo-harness-wt-docs-cleanup'), loss: loss([], []) },
    { tree: extra('e2', 'repo-harness-wt-notes', 'docs/release-notes', 1), loss: loss(['docs/release-notes.md'], ['docs/release-notes.md']) },
    { tree: extra('f3', 'repo-harness-wt-bench', 'perf/bench-hooks', 2), loss: loss(['bench/README.md', 'bench/hooks.ts', 'bench/out.json'], ['bench/README.md', 'bench/hooks.ts'], ['bench/out.json']) },
    { tree: extra('a4', 'repo-harness-wt-i18n', 'feat/i18n-split', 1), loss: loss(['src/operator-web/i18n/home.ts'], ['src/operator-web/i18n/home.ts']) },
    { tree: extra('b5', 'repo-harness-wt-archctx', 'fix/archctx-pin', 1), loss: loss(['package.json'], ['package.json'], [], 1) },
    { tree: extra('c6', 'repo-harness-wt-ci-lane', 'ci/affected-lane', 1), loss: loss(['scripts/check-ci.sh'], ['scripts/check-ci.sh']) },
  ];
  const items = await Promise.all(rows.map(async ({ tree: worktree, loss: summary }) => planItem({
    worktree, loss: summary,
    advice: worktree.judgment === 'green'
      ? { recommendation: 'delete', reason: 'Merged and clean.', evidence: ['merge: provider'], archive: { git: null, private: null } }
      : { recommendation: 'keep', reason: 'Waiting for the user to choose.', evidence: [`judgment: ${worktree.judgment}`, ...worktree.reasons], archive: { git: null, private: null } },
    loss_sha256: summary === null ? null : await sha256(`fixture loss ${worktree.id} ${JSON.stringify(summary)}`),
  })));
  return decodeCleanupPlan({ protocol: 1, kind: 'operator_worktree_cleanup_plan', session_id: PLAN_SESSION, items });
}

/** In order, the outcome given to each authorized id: one removal, then every reason once. */
const OUTCOMES: readonly [CleanupExecutionItem['outcome'], CleanupReason | null, CleanupExecutionItem['stage']][] = [
  ['removed', null, 'remove'], ['skipped', 'in_use', 'observe'], ['skipped', 'not_approved', 'observe'], ['skipped', 'loss_changed', 'observe'],
  ['skipped', 'plan_changed', 'observe'], ['skipped', 'unavailable', 'observe'], ['reconcile_required', 'archive_failed', 'archive_push'],
  ['reconcile_required', 'removal_unproven', 'remove'],
];

/** The plan routes for the busy fixture. Every answer passes the decoder that the routes will apply. */
export function cleanupPlanFixture(now: number): CleanupPlanPorts {
  let plan: Promise<CleanupPlan> | null = null;
  return {
    open: async () => ({ state: 'ready', plan: await (plan = firstPlan(now)) }),
    choose: async (sessionId, raw) => {
      const choices = decodeCleanupChoices(raw);
      const current = await plan!;
      if (sessionId !== current.session_id) throw new Error('fixture session changed');
      const items = await Promise.all(current.items.map(async ({ plan_sha256: _old, ...item }) => {
        const choice = choices.find(row => row.id === item.worktree.id);
        return planItem(choice ? { ...item, advice: { ...item.advice, recommendation: choice.recommendation, archive: choice.archive } } : item);
      }));
      const next = decodeCleanupPlan({ ...current, items });
      plan = Promise.resolve(next);
      return { state: 'ready', plan: next };
    },
    execute: async ({ request_id: _request, ...body }) => {
      const request = decodeAuthorizedCleanupRequest(body);
      const current = await plan!;
      return { state: 'done', result: decodeCleanupExecutionResult({
        protocol: 1, kind: 'operator_authorized_worktree_cleanup', session_id: request.session_id,
        items: request.ids.map((id, index) => {
          const [outcome, reason, stage] = OUTCOMES[index % OUTCOMES.length]!;
          const git = current.items.find(item => item.worktree.id === id)!.advice.archive.git;
          return { id, outcome, reason, stage, archive_pr: outcome === 'removed' && git !== null ? 'https://github.com/example/repo-harness/pull/1801' : null };
        }),
      }) };
    },
  };
}
