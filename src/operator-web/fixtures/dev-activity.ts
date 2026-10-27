// Development-only board fixtures. Loaded by `?fixture=<name>` under the Vite
// dev server and never emitted into the production bundle.
import { DEV_ACTIVITY_PROJECTION, type DevActivityAttention, type DevActivityItem, type DevActivityPullRequest, type DevActivityRepository, type DevActivitySnapshotV2, type DevActivitySourceHealth, type DevActivityWorktree } from '../../core/dev-activity/types';
import { decodeTaskExecutionView } from '../../core/operator/execution-state';
import type { NativeRuntimeSourceSummary, RuntimeOverlay } from '../../core/operator/runtime-status';
import { unavailableRuntimeOverlay } from '../../core/operator/runtime-status';
import type { ExecutionRead } from '../repository-reads';

/** The repo-harness registration shares its id with the repository snapshot fixture. */
export const HARNESS_ID = 'repo_a5b76eee64af71c3';
const SITE_ID = 'repo_1f2e3d4c5b6a7980';
const DOCS_ID = 'repo_0a1b2c3d4e5f6071';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function at(now: number, ago: number): string {
  return new Date(now - ago).toISOString();
}

function sha(seed: string): string {
  return seed.repeat(40).slice(0, 40);
}

function source(kind: DevActivitySourceHealth['kind'], status: DevActivitySourceHealth['status'], observedAt: string | null, reason: string | null = null): DevActivitySourceHealth {
  return { kind, status, reason, observed_at: observedAt };
}

function healthy(now: number, overrides: Partial<Record<DevActivitySourceHealth['kind'], DevActivitySourceHealth>> = {}): DevActivitySourceHealth[] {
  const seen = at(now, 40_000);
  const base: DevActivitySourceHealth[] = [source('git', 'ok', seen), source('github', 'ok', seen), source('runtime', 'ok', seen)];
  return base.map(row => overrides[row.kind] ?? row);
}

function worktree(directory: string, seed: string, overrides: Partial<DevActivityWorktree> = {}): DevActivityWorktree {
  return { directory, head_sha: sha(seed), dirty: false, ahead: 0, behind: 0, ...overrides };
}

function pull(now: number, slug: string, number: number, title: string, overrides: Partial<DevActivityPullRequest> = {}): DevActivityPullRequest {
  return {
    number, title, url: `https://github.com/${slug}/pull/${number}`, state: 'open', is_draft: false, base_branch: 'main',
    merge_state: 'BLOCKED', ci: 'pending', review: 'review_required', updated_at: at(now, 20 * MINUTE), merged_at: null, closed_at: null,
    // Only the open query reads the head and the changed files.
    head_sha: (overrides.state ?? 'open') === 'open' ? sha(String(number)) : null,
    changed_files: (overrides.state ?? 'open') === 'open' ? { state: 'ok', paths: ['README.md'] } : null,
    ...overrides,
  };
}

function item(repositoryId: string, key: string, overrides: Partial<DevActivityItem> & Pick<DevActivityItem, 'title' | 'column'>): DevActivityItem {
  return {
    id: `${repositoryId}:${key}`, repository_id: repositoryId, branch: key, hidden: null, column_since: null,
    worktrees: [], pull_request: null, cleanup_pending: false,
    ...overrides,
  };
}

function merged(now: number, repositoryId: string, slug: string, number: number, branch: string, title: string, agoMs: number, cleanup = false): DevActivityItem {
  const mergedAt = at(now, agoMs);
  return item(repositoryId, branch, {
    title, column: 'shipped', column_since: mergedAt, cleanup_pending: cleanup,
    worktrees: cleanup ? [worktree(branch.replace(/\//gu, '-'), 'c3', { ahead: null, behind: null })] : [],
    pull_request: pull(now, slug, number, title, { state: 'merged', ci: null, review: 'approved', merge_state: 'UNKNOWN', updated_at: mergedAt, merged_at: mergedAt, closed_at: mergedAt }),
  });
}

/** Git/GitHub work, one attention row and one pending cleanup. Planned stays empty. */
export function busyDevActivity(now: number): DevActivitySnapshotV2 {
  const harness = 'Ancienttwo/repo-harness', site = 'acme/operator-site';
  const repositories: DevActivityRepository[] = [
    { repository_id: HARNESS_ID, display_name: 'repo-harness', github: harness, default_branch: 'main', sources: healthy(now) },
    { repository_id: SITE_ID, display_name: 'operator-site', github: site, default_branch: 'main',
      sources: healthy(now) },
    { repository_id: DOCS_ID, display_name: 'field-notes', github: null, default_branch: 'main',
      sources: healthy(now, { github: source('github', 'not_configured', null, 'no_github_remote') }) },
  ];
  const items: DevActivityItem[] = [
    item(HARNESS_ID, 'feat/kanban-human-redesign', {
      title: 'Rebuild the operator console for humans', column: 'building', column_since: at(now, 3 * HOUR),
      worktrees: [worktree('repo-harness-wt-kanban-redesign', 'a1', { dirty: true, ahead: 3 })],
      pull_request: pull(now, harness, 608, 'Rebuild the operator console for humans', { is_draft: true, ci: 'pending', review: 'none',
        changed_files: { state: 'ok', paths: ['src/operator-web/App.tsx', 'src/operator-web/NavRail.tsx', 'src/operator-web/app.css', 'tests/operator-web/operator-ui.test.tsx'] } }),
    }),
    item(HARNESS_ID, 'feat/runtime-capture-pi', {
      title: 'Capture Pi runtime status natively', column: 'building', column_since: at(now, 9 * HOUR),
      worktrees: [worktree('repo-harness-wt-pi-capture', 'b2', { ahead: 5, behind: 2 })],
      pull_request: pull(now, harness, 604, 'Capture Pi runtime status natively', { is_draft: true, ci: 'success', review: 'none',
        changed_files: { state: 'unavailable', reason: 'files_truncated' } }),
    }),
    item(SITE_ID, 'fix/csp-header', {
      title: 'fix/csp-header', column: 'building', worktrees: [worktree('operator-site-csp', 'd4', { dirty: true, ahead: null, behind: null })],
    }),
    item(SITE_ID, 'feat/old-landing', {
      title: 'Try a darker landing page', column: 'building', hidden: 'closed_unmerged',
      pull_request: pull(now, site, 80, 'Try a darker landing page', { state: 'closed', ci: null, review: 'none', merge_state: 'UNKNOWN', closed_at: at(now, 3 * DAY) }),
    }),
    item(HARNESS_ID, 'feat/pipeline-observer', {
      title: 'Observe pipeline phases on the board', column: 'verifying', column_since: at(now, 20 * HOUR),
      worktrees: [worktree('repo-harness-wt-pipeline', 'e5', { ahead: 1 })],
      pull_request: pull(now, harness, 603, 'Observe pipeline phases on the board', { ci: 'success', review: 'review_required',
        changed_files: { state: 'ok', paths: ['src/core/dev-activity/projection.ts', 'src/effects/dev-activity/collector.ts', 'tests/core/dev-activity-projection.test.ts'] } }),
    }),
    item(SITE_ID, 'feat/billing-copy', {
      title: 'Rewrite billing copy', column: 'verifying', column_since: at(now, 2 * DAY + 3 * HOUR),
      pull_request: pull(now, site, 87, 'Rewrite billing copy', { ci: 'failure', review: 'changes_requested' }),
    }),
    item(HARNESS_ID, 'chore/oar-0-45', {
      title: 'Upgrade OAR to 0.45.1', column: 'ready_to_merge', column_since: at(now, 50 * MINUTE),
      worktrees: [worktree('repo-harness-wt-oar', 'f6', { ahead: 2 })],
      pull_request: pull(now, harness, 602, 'Upgrade OAR to 0.45.1', { ci: 'success', review: 'approved', merge_state: 'CLEAN',
        changed_files: { state: 'ok', paths: ['bun.lock', 'docs/reference-configs/external-tooling.md', 'package.json'] } }),
    }),
    merged(now, HARNESS_ID, harness, 607, 'feat/pi-host', 'Add native Pi host support', 3 * HOUR),
    merged(now, HARNESS_ID, harness, 606, 'feat/kanban-status', 'Observe native agent status in Kanban', 9 * HOUR, true),
    merged(now, HARNESS_ID, harness, 605, 'docs/feynman', 'Require Feynman reports', DAY + 2 * HOUR),
    merged(now, SITE_ID, site, 86, 'fix/footer', 'Fix the footer links', DAY + 6 * HOUR),
    merged(now, HARNESS_ID, harness, 600, 'feat/worktrees-tmp', 'Default worktrees to a temp directory', 2 * DAY),
    merged(now, SITE_ID, site, 84, 'feat/status-page', 'Add a status page', 3 * DAY),
    merged(now, HARNESS_ID, harness, 598, 'chore/oar-0-37', 'Upgrade OAR to 0.37.0', 4 * DAY),
    merged(now, HARNESS_ID, harness, 597, 'fix/notify-retry', 'Retry notify delivery once', 6 * DAY),
  ];
  const attention: DevActivityAttention[] = [
    { kind: 'ready_to_merge', subject_id: `${HARNESS_ID}:chore/oar-0-45`, repository_id: HARNESS_ID, summary: 'Upgrade OAR to 0.45.1',
      waiting_since: at(now, 50 * MINUTE), url: `https://github.com/${harness}/pull/602`, command: null },
  ];
  return { projection_version: DEV_ACTIVITY_PROJECTION, status: 'ready', collected_at: at(now, 40_000), repositories, unreadable_registrations: 0, items, attention };
}

function executionView(repositoryId: string, now: number, tasks: readonly unknown[], unlisted: number): ExecutionRead {
  return { state: 'ok', view: decodeTaskExecutionView({
    protocol: 1, kind: 'operator_task_execution', repository_id: repositoryId, observed_at: at(now, 20_000), tasks, unlisted_tasks: unlisted,
  }) };
}

/**
 * The execution route beside the busy board. repo-harness: Codex in a Herdr
 * pane on the console redesign, Claude Code in a terminal on the pipeline
 * observer, a session whose provider exited, and one session left out because
 * its branch is not public text. operator-site has no first collection yet.
 */
export function busyExecution(repositoryId: string, now: number): ExecutionRead {
  if (repositoryId === SITE_ID) return { state: 'unavailable', reason: 'execution_state_pending' };
  if (repositoryId !== HARNESS_ID) return executionView(repositoryId, now, [], 0);
  return executionView(repositoryId, now, [
    { state: 'verified', task: 'kanban-redesign', role: 'implementer', issue_id: '608', branch: 'feat/kanban-human-redesign', agent: 'codex', runtime: 'herdr',
      follow_up: { task_id: 'kanban-redesign', resume: { host: 'codex', command: 'codex resume 0199a2b4-7c3e-7d10-9f00-3a5b6c7d8e9f' },
        herdr_pane: { session: 'main', workspace_id: 'w2', pane_id: 'w2:p1', agent_name: 'implementer' } } },
    { state: 'verified', task: 'pipeline-observer', role: 'deep-reasoner', issue_id: '603', branch: 'feat/pipeline-observer', agent: 'claude', runtime: 'terminal',
      follow_up: { task_id: 'pipeline-observer', resume: { host: 'claude', command: 'claude --resume 5f0c1e2a-0000-4000-8000-000000000001' }, herdr_pane: null } },
    { state: 'unverified', task: 'oar-0-45', role: 'implementer', reason: 'provider_exited', follow_up: { task_id: 'oar-0-45', resume: null, herdr_pane: null } },
  ], 1);
}

/** Repositories registered, no task session. */
export function emptyExecution(repositoryId: string, now: number): ExecutionRead {
  return executionView(repositoryId, now, [], 0);
}

/** Repositories registered, nothing in flight. */
export function emptyDevActivity(now: number): DevActivitySnapshotV2 {
  return {
    projection_version: DEV_ACTIVITY_PROJECTION, status: 'ready', collected_at: at(now, 30_000),
    repositories: [{ repository_id: HARNESS_ID, display_name: 'repo-harness', github: 'Ancienttwo/repo-harness', default_branch: 'main',
      sources: healthy(now, { runtime: source('runtime', 'not_configured', null, 'runtime_not_configured') }) }],
    unreadable_registrations: 0, items: [], attention: [],
  };
}

/** GitHub unreadable, runtime not configured, thousands of stale registrations. */
export function degradedDevActivity(now: number): DevActivitySnapshotV2 {
  const sources = (seen: string) => [
    source('git', 'ok', seen), source('github', 'unavailable', at(now, 3 * HOUR), 'gh_auth_failed'),
    source('runtime', 'not_configured', null, 'runtime_not_configured'),
  ];
  const seen = at(now, 5 * MINUTE);
  return {
    projection_version: DEV_ACTIVITY_PROJECTION, status: 'partial', collected_at: seen,
    repositories: [
      { repository_id: HARNESS_ID, display_name: 'repo-harness', github: 'Ancienttwo/repo-harness', default_branch: 'main', sources: sources(seen) },
      { repository_id: SITE_ID, display_name: 'operator-site', github: 'acme/operator-site', default_branch: 'main', sources: sources(seen) },
    ],
    unreadable_registrations: 2489,
    items: [
      item(HARNESS_ID, 'feat/kanban-human-redesign', { title: 'feat/kanban-human-redesign', column: 'building',
        worktrees: [worktree('repo-harness-wt-kanban-redesign', 'a1', { dirty: true, ahead: 3 })] }),
      item(SITE_ID, 'fix/csp-header', { title: 'fix/csp-header', column: 'building',
        worktrees: [worktree('operator-site-csp', 'd4', { ahead: null, behind: null })] }),
    ],
    attention: [],
  };
}

function nativeSource(now: number, overrides: Partial<NativeRuntimeSourceSummary> & Pick<NativeRuntimeSourceSummary, 'source_id' | 'provider'>): NativeRuntimeSourceSummary {
  return {
    generation: '12345678-1234-4234-8234-123456789012', capture_status: 'connected', heartbeat_at: at(now, 20_000), freshness: 'fresh',
    observations: [], ...overrides,
  };
}

/** Three native capture sources: one working, one blocked, one disconnected. */
export function busyRuntimeOverlay(now: number): RuntimeOverlay {
  return {
    ...unavailableRuntimeOverlay(), status: 'ready', observed_at: at(now, 20_000),
    native_sources: [
      nativeSource(now, { source_id: 'claude-frontend', provider: 'claude',
        observations: [{ scope: 'terminal', session_id: null, turn_id: null, state: 'working', reason: 'unknown', event_received_at: at(now, 2 * MINUTE), changed_at: at(now, 2 * MINUTE) }] }),
      nativeSource(now, { source_id: 'codex-implementer', provider: 'codex',
        observations: [{ scope: 'session', session_id: 'thread-604', turn_id: 'turn-12', state: 'blocked', reason: 'permission', event_received_at: at(now, 26 * MINUTE), changed_at: at(now, 26 * MINUTE) }] }),
      nativeSource(now, { source_id: 'pi-reviewer', provider: 'pi', capture_status: 'disconnected', heartbeat_at: at(now, 14 * MINUTE), freshness: 'disconnected',
        observations: [{ scope: 'terminal', session_id: null, turn_id: null, state: 'idle', reason: 'unknown', event_received_at: at(now, 15 * MINUTE), changed_at: at(now, 15 * MINUTE) }] }),
    ],
  };
}
