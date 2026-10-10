// Development-only board fixtures. Loaded by `?fixture=<name>` under the Vite
// dev server and never emitted into the production bundle.
import { DEV_ACTIVITY_PROJECTION, type DevActivityAttention, type DevActivityItem, type DevActivityPullRequest, type DevActivityRepository, type DevActivitySnapshotV1, type DevActivitySourceHealth, type DevActivityWorktree } from '../../core/dev-activity/types';
import type { NativeRuntimeSourceSummary, RuntimeOverlay } from '../../core/operator/runtime-status';
import { unavailableRuntimeOverlay } from '../../core/operator/runtime-status';

/** The repo-harness registration shares its id with the collaboration fixture. */
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
  const base: DevActivitySourceHealth[] = [source('git', 'ok', seen), source('github', 'ok', seen), source('ledger', 'ok', seen), source('runtime', 'ok', seen), source('decisions', 'ok', seen)];
  return base.map(row => overrides[row.kind] ?? row);
}

function worktree(directory: string, seed: string, overrides: Partial<DevActivityWorktree> = {}): DevActivityWorktree {
  return { directory, head_sha: sha(seed), dirty: false, ahead: 0, behind: 0, ...overrides };
}

function pull(now: number, slug: string, number: number, title: string, overrides: Partial<DevActivityPullRequest> = {}): DevActivityPullRequest {
  return {
    number, title, url: `https://github.com/${slug}/pull/${number}`, state: 'open', is_draft: false, base_branch: 'main',
    merge_state: 'BLOCKED', ci: 'pending', review: 'review_required', updated_at: at(now, 20 * MINUTE), merged_at: null, closed_at: null,
    ...overrides,
  };
}

function item(repositoryId: string, key: string, overrides: Partial<DevActivityItem> & Pick<DevActivityItem, 'title' | 'column'>): DevActivityItem {
  return {
    id: `${repositoryId}:${key}`, repository_id: repositoryId, branch: key.startsWith('ledger:') ? null : key, hidden: null, column_since: null,
    worktrees: [], pull_request: null, ledger: null, agent: null, runtime_blocked: null, cleanup_pending: false,
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

/** Every column populated, three attention rows, one blocked, one cleanup pending, one ledger-joined card. */
export function busyDevActivity(now: number): DevActivitySnapshotV1 {
  const harness = 'Ancienttwo/repo-harness', site = 'acme/operator-site';
  const repositories: DevActivityRepository[] = [
    { repository_id: HARNESS_ID, display_name: 'repo-harness', github: harness, default_branch: 'main', sources: healthy(now) },
    { repository_id: SITE_ID, display_name: 'operator-site', github: site, default_branch: 'main',
      sources: healthy(now, { ledger: source('ledger', 'not_configured', null, 'ledger_not_configured') }) },
    { repository_id: DOCS_ID, display_name: 'field-notes', github: null, default_branch: 'main',
      sources: healthy(now, { github: source('github', 'not_configured', null, 'no_github_remote'), ledger: source('ledger', 'not_configured', null, 'ledger_not_configured') }) },
  ];
  const blockedSince = at(now, 26 * MINUTE);
  const items: DevActivityItem[] = [
    item(HARNESS_ID, 'ledger:pl-0012', {
      title: 'Fold the shipped column to recent work', column: 'planned', column_since: at(now, 5 * HOUR),
      ledger: { record_id: 'pl-0012', phase: 'plan', phase_since: at(now, 5 * HOUR), owner: null, blocked: null, waiting_owner: false },
    }),
    item(SITE_ID, 'ledger:pl-0003', {
      title: 'Plan the pricing page refresh', column: 'planned', column_since: at(now, 2 * DAY),
      ledger: { record_id: 'pl-0003', phase: 'plan-review', phase_since: at(now, 2 * DAY), owner: 'codex', blocked: null, waiting_owner: false },
      agent: { label: 'codex', source: 'ledger', runtime_state: null, runtime_freshness: null, changed_at: null },
    }),
    item(HARNESS_ID, 'feat/kanban-human-redesign', {
      title: 'Rebuild the operator console for humans', column: 'building', column_since: at(now, 3 * HOUR),
      worktrees: [worktree('repo-harness-wt-kanban-redesign', 'a1', { dirty: true, ahead: 3 })],
      pull_request: pull(now, harness, 608, 'Rebuild the operator console for humans', { is_draft: true, ci: 'pending', review: 'none' }),
      agent: { label: 'Claude · frontend worker', source: 'runtime', runtime_state: 'working', runtime_freshness: 'fresh', changed_at: at(now, 2 * MINUTE) },
    }),
    item(HARNESS_ID, 'feat/runtime-capture-pi', {
      title: 'Capture Pi runtime status natively', column: 'building', column_since: at(now, 9 * HOUR),
      worktrees: [worktree('repo-harness-wt-pi-capture', 'b2', { ahead: 5, behind: 2 })],
      pull_request: pull(now, harness, 604, 'Capture Pi runtime status natively', { is_draft: true, ci: 'success', review: 'none' }),
      agent: { label: 'Codex · implementer', source: 'runtime', runtime_state: 'blocked', runtime_freshness: 'fresh', changed_at: blockedSince },
      runtime_blocked: { reason: 'permission', since: blockedSince },
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
      pull_request: pull(now, harness, 603, 'Observe pipeline phases on the board', { ci: 'success', review: 'review_required' }),
      ledger: { record_id: 'pl-0009', phase: 'cross-review', phase_since: at(now, 7 * HOUR), owner: 'codex', blocked: null, waiting_owner: false },
      agent: { label: 'codex', source: 'ledger', runtime_state: null, runtime_freshness: null, changed_at: null },
    }),
    item(SITE_ID, 'feat/billing-copy', {
      title: 'Rewrite billing copy', column: 'verifying', column_since: at(now, 2 * DAY + 3 * HOUR),
      pull_request: pull(now, site, 87, 'Rewrite billing copy', { ci: 'failure', review: 'changes_requested' }),
    }),
    item(HARNESS_ID, 'chore/oar-0-45', {
      title: 'Upgrade OAR to 0.45.1', column: 'ready_to_merge', column_since: at(now, 50 * MINUTE),
      worktrees: [worktree('repo-harness-wt-oar', 'f6', { ahead: 2 })],
      pull_request: pull(now, harness, 602, 'Upgrade OAR to 0.45.1', { ci: 'success', review: 'approved', merge_state: 'CLEAN' }),
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
    { kind: 'human_request', subject_id: 'dec-7f3a', repository_id: HARNESS_ID, summary: 'Ship the Kumo console behind a flag or replace the old UI outright?',
      waiting_since: at(now, 4 * HOUR), url: null, command: 'repo-harness verified-context read --kind decision --id dec-7f3a' },
    { kind: 'ready_to_merge', subject_id: `${HARNESS_ID}:chore/oar-0-45`, repository_id: HARNESS_ID, summary: 'Upgrade OAR to 0.45.1',
      waiting_since: at(now, 50 * MINUTE), url: `https://github.com/${harness}/pull/602`, command: null },
    { kind: 'runtime_blocked', subject_id: `${HARNESS_ID}:feat/runtime-capture-pi`, repository_id: HARNESS_ID, summary: 'Capture Pi runtime status natively',
      waiting_since: blockedSince, url: `https://github.com/${harness}/pull/604`, command: null },
  ];
  return { projection_version: DEV_ACTIVITY_PROJECTION, status: 'ready', collected_at: at(now, 40_000), repositories, unreadable_registrations: 0, items, attention };
}

/** Repositories registered, nothing in flight. */
export function emptyDevActivity(now: number): DevActivitySnapshotV1 {
  return {
    projection_version: DEV_ACTIVITY_PROJECTION, status: 'ready', collected_at: at(now, 30_000),
    repositories: [{ repository_id: HARNESS_ID, display_name: 'repo-harness', github: 'Ancienttwo/repo-harness', default_branch: 'main',
      sources: healthy(now, { runtime: source('runtime', 'not_configured', null, 'runtime_not_configured') }) }],
    unreadable_registrations: 0, items: [], attention: [],
  };
}

/** GitHub and the ledger unreadable, runtime not configured, thousands of stale registrations. */
export function degradedDevActivity(now: number): DevActivitySnapshotV1 {
  const sources = (seen: string) => [
    source('git', 'ok', seen), source('github', 'unavailable', at(now, 3 * HOUR), 'gh_auth_failed'),
    source('ledger', 'unavailable', null, 'ledger_unreadable'), source('runtime', 'not_configured', null, 'runtime_not_configured'),
    source('decisions', 'stale', at(now, 2 * HOUR), 'decisions_stale'),
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
