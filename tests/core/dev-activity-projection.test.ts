import { describe, expect, test } from 'bun:test';

import {
  projectDevActivity,
  summarizeCiRollup,
  reviewStateOf,
  type DevActivityRawLedgerRecord,
  type DevActivityRawPullRequest,
  type DevActivityRawRepository,
  type DevActivityRawWorktree,
  type DevActivityProjectionInput,
} from '../../src/core/dev-activity/projection';
import { decodeDevActivitySnapshot, unavailableDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import type { DevActivitySnapshotV1 } from '../../src/core/dev-activity/types';
import { unavailableRuntimeOverlay, type RuntimeBadge, type RuntimeIdentity, type RuntimeOverlay } from '../../src/core/operator/runtime-status';

const NOW = Date.parse('2026-10-10T12:00:00.000Z');
const REPO = 'repo_0123456789abcdef';
const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(NOW - offsetMs).toISOString();

function worktree(branch: string | null, overrides: Partial<DevActivityRawWorktree> = {}): DevActivityRawWorktree {
  return { directory: `wt-${branch ?? 'detached'}`.replaceAll('/', '-'), branch, head_sha: 'a'.repeat(40), dirty: false, ahead: null, behind: null, ...overrides };
}

let prNumber = 1;
function pr(head: string, overrides: Partial<DevActivityRawPullRequest> = {}): DevActivityRawPullRequest {
  const number = prNumber++;
  return {
    number, title: `PR ${head}`, url: `https://github.com/acme/widgets/pull/${number}`, state: 'open', is_draft: false,
    head_branch: head, base_branch: 'main', merge_state: 'BLOCKED', ci: (overrides.state ?? 'open') === 'open' ? 'pending' : null,
    review: 'review_required', created_at: iso(3 * DAY), updated_at: iso(DAY), merged_at: null, closed_at: null, ...overrides,
  };
}

function ledger(overrides: Partial<DevActivityRawLedgerRecord> = {}): DevActivityRawLedgerRecord {
  return {
    record_id: 'task-1', source_host: 'host-a', runtime_repository_id: `sha256:${'f'.repeat(64)}`, task: 'task-1', state_version: 3,
    branch: null, title: 'Ledger task', phase: 'plan', phase_since: iso(2 * DAY), blocked_return_to: null, owner_bot: 'unassigned',
    blocked: null, waiting_owner: false, updated_at: iso(DAY), runs: [], ...overrides,
  };
}

function repo(overrides: Partial<DevActivityRawRepository> = {}): DevActivityRawRepository {
  return {
    repository_id: REPO, display_name: 'widgets', github: 'acme/widgets', default_branch: 'main',
    sources: [
      { kind: 'git', status: 'ok', reason: null, observed_at: iso(0) },
      { kind: 'github', status: 'ok', reason: null, observed_at: iso(0) },
    ],
    worktrees: [], pull_requests: [], ledger: [], human_requests: [], ...overrides,
  };
}

function project(repository: DevActivityRawRepository, runtime: RuntimeOverlay | null = null): DevActivitySnapshotV1 {
  const input: DevActivityProjectionInput = { collected_at: iso(0), now_ms: NOW, unreadable_registrations: 2, repositories: [repository], runtime };
  return projectDevActivity(input);
}

const itemFor = (snapshot: DevActivitySnapshotV1, branch: string) => snapshot.items.find(item => item.branch === branch)!;

function identity(overrides: Partial<RuntimeIdentity> = {}): RuntimeIdentity {
  return {
    source_host: 'host-a', repository_id: `sha256:${'f'.repeat(64)}`, task: 'task-1', role: 'implementer', round: 1, pipeline_state_version: 3,
    request_id: 'req-1', context_sha256: 'ctx', runtime_session: 'rs', attempt: 1, generation: 'gen', source_epoch: 1, herdr_session: 'hs',
    terminal_id: 'term', pane_id: 'pane', agent_session: 'agent', ...overrides,
  };
}

function overlay(badges: RuntimeBadge[], observedAt = iso(1000)): RuntimeOverlay {
  return { ...unavailableRuntimeOverlay(1), status: 'ready', observed_at: observedAt, badges };
}

describe('dev activity column rules (§3.3)', () => {
  test('places each work item by its Git/GitHub authority', () => {
    const snapshot = project(repo({
      worktrees: [worktree('feat/local', { dirty: true, ahead: 2, behind: 0 })],
      pull_requests: [
        pr('feat/draft', { is_draft: true }),
        pr('feat/verify', { merge_state: 'BLOCKED' }),
        pr('feat/ready', { merge_state: 'CLEAN', ci: 'success', review: 'approved' }),
        pr('feat/shipped', { state: 'merged', merged_at: iso(DAY), closed_at: iso(DAY), merge_state: 'UNKNOWN' }),
      ],
      ledger: [ledger({ phase: 'plan-review' })],
    }));
    expect(itemFor(snapshot, 'feat/local')).toMatchObject({ column: 'building', hidden: null, column_since: null, pull_request: null,
      worktrees: [{ directory: 'wt-feat-local', dirty: true, ahead: 2, behind: 0 }] });
    expect(itemFor(snapshot, 'feat/draft')).toMatchObject({ column: 'building', column_since: iso(3 * DAY) });
    expect(itemFor(snapshot, 'feat/verify')).toMatchObject({ column: 'verifying', column_since: iso(3 * DAY) });
    expect(itemFor(snapshot, 'feat/ready')).toMatchObject({ column: 'ready_to_merge', pull_request: { ci: 'success', review: 'approved' } });
    expect(itemFor(snapshot, 'feat/shipped')).toMatchObject({ column: 'shipped', hidden: null, column_since: iso(DAY) });
    const planned = snapshot.items.find(item => item.branch === null)!;
    expect(planned).toMatchObject({ id: `${REPO}:ledger:task-1`, column: 'planned', column_since: iso(2 * DAY), title: 'Ledger task' });
    expect(snapshot.status).toBe('ready');
    expect(snapshot.unreadable_registrations).toBe(2);
  });

  test('hides closed-unmerged PRs and drops merged or closed PRs outside the 7-day window', () => {
    const snapshot = project(repo({
      worktrees: [worktree('feat/old-local')],
      pull_requests: [
        pr('feat/closed', { state: 'closed', closed_at: iso(DAY) }),
        pr('feat/old', { state: 'merged', merged_at: iso(8 * DAY), closed_at: iso(8 * DAY) }),
        pr('feat/old-closed', { state: 'closed', closed_at: iso(8 * DAY) }),
        pr('feat/old-local', { state: 'merged', merged_at: iso(8 * DAY), closed_at: iso(8 * DAY) }),
        pr('feat/edge', { state: 'merged', merged_at: iso(7 * DAY - 1000), closed_at: iso(7 * DAY) }),
      ],
    }));
    expect(itemFor(snapshot, 'feat/closed')).toMatchObject({ column: 'building', hidden: 'closed_unmerged', pull_request: { ci: null } });
    expect(itemFor(snapshot, 'feat/old')).toBeUndefined();
    expect(itemFor(snapshot, 'feat/old-closed')).toBeUndefined();
    expect(itemFor(snapshot, 'feat/old-local')).toMatchObject({ column: 'building', hidden: null, pull_request: null, cleanup_pending: false });
    expect(itemFor(snapshot, 'feat/edge')).toMatchObject({ column: 'shipped', hidden: null, pull_request: { ci: null } });
  });

  test('a merged PR with a remaining worktree is pending cleanup', () => {
    const snapshot = project(repo({
      worktrees: [worktree('feat/done')],
      pull_requests: [pr('feat/done', { state: 'merged', merged_at: iso(DAY), closed_at: iso(DAY) })],
    }));
    expect(itemFor(snapshot, 'feat/done')).toMatchObject({ column: 'shipped', cleanup_pending: true });
  });

  test('ledger phase is a badge only and never moves the column', () => {
    const snapshot = project(repo({
      pull_requests: [pr('feat/x', { merge_state: 'BLOCKED' })],
      ledger: [ledger({ branch: 'feat/x', phase: 'merge-ask', waiting_owner: true })],
    }));
    expect(itemFor(snapshot, 'feat/x')).toMatchObject({ column: 'verifying', ledger: { phase: 'merge-ask', waiting_owner: true } });
  });
});

describe('dev activity identity and join (§3.2)', () => {
  test('joins worktree, PR and ledger only on exact branch-name equality', () => {
    const snapshot = project(repo({
      worktrees: [worktree('feat/a'), worktree('Feat/A'), worktree('feat/a-2')],
      pull_requests: [pr('feat/a')],
      ledger: [ledger({ branch: 'feat/a ', record_id: 'r-space' }), ledger({ branch: 'feat/a', record_id: 'r-exact', updated_at: iso(0) })],
    }));
    expect(snapshot.items.map(item => item.branch).filter(Boolean).sort()).toEqual(['Feat/A', 'feat/a', 'feat/a ', 'feat/a-2']);
    const exact = itemFor(snapshot, 'feat/a');
    expect(exact.worktrees).toHaveLength(1);
    expect(exact.pull_request?.number).toBeGreaterThan(0);
    expect(exact.ledger?.record_id).toBe('r-exact');
    expect(itemFor(snapshot, 'Feat/A').pull_request).toBeNull();
    expect(itemFor(snapshot, 'feat/a-2').pull_request).toBeNull();
  });

  test('excludes the default branch from worktrees, PRs and ledger', () => {
    const snapshot = project(repo({
      worktrees: [worktree('main'), worktree(null)],
      pull_requests: [pr('main')],
      ledger: [ledger({ branch: 'main', phase: 'implement' })],
    }));
    expect(snapshot.items).toEqual([]);
  });

  test('prefers the open PR when a branch has several', () => {
    const snapshot = project(repo({
      pull_requests: [
        pr('feat/re', { state: 'closed', closed_at: iso(5 * DAY) }),
        pr('feat/re', { state: 'open', title: 'Second attempt' }),
      ],
    }));
    expect(itemFor(snapshot, 'feat/re')).toMatchObject({ title: 'Second attempt', hidden: null });
  });

  test('terminal ledger records without a Git or GitHub fact create no card', () => {
    const snapshot = project(repo({ ledger: [ledger({ phase: 'merged' }), ledger({ phase: 'abandoned', branch: 'feat/gone' })] }));
    expect(snapshot.items).toEqual([]);
  });
});

describe('dev activity agent identity (N3)', () => {
  test('unknown agent stays null; branch prefix and PR author are never used', () => {
    const snapshot = project(repo({ worktrees: [worktree('codex/release-1')], pull_requests: [pr('codex/release-1')] }));
    expect(itemFor(snapshot, 'codex/release-1').agent).toBeNull();
  });

  test('the ledger owner names the agent; the unassigned sentinel does not', () => {
    const snapshot = project(repo({ ledger: [
      ledger({ branch: 'feat/owned', owner_bot: 'codex-bot', record_id: 'a' }),
      ledger({ branch: 'feat/none', owner_bot: 'unassigned', record_id: 'b' }),
    ] }));
    expect(itemFor(snapshot, 'feat/owned').agent).toEqual({ label: 'codex-bot', source: 'ledger', runtime_state: null, runtime_freshness: null, changed_at: null });
    expect(itemFor(snapshot, 'feat/none').agent).toBeNull();
  });

  test('a verified runtime badge binds only through the exact ledger key and current run', () => {
    const record = ledger({ branch: 'feat/rt', owner_bot: 'codex-bot', runs: [{ role: 'implementer', round: 1 }] });
    const bound: RuntimeBadge = { identity: identity(), revision: 1, state: 'working', reason: 'unknown', changed_at: iso(5000), source: 'program-v1', badge: 'working', freshness: 'fresh' };
    const foreign: RuntimeBadge = { ...bound, identity: identity({ task: 'other' }) };
    expect(itemFor(project(repo({ ledger: [record] }), overlay([bound])), 'feat/rt').agent)
      .toEqual({ label: 'implementer', source: 'runtime', runtime_state: 'working', runtime_freshness: 'fresh', changed_at: iso(5000) });
    expect(itemFor(project(repo({ ledger: [record] }), overlay([foreign])), 'feat/rt').agent?.source).toBe('ledger');
    const staleRound: RuntimeBadge = { ...bound, identity: identity({ round: 1 }) };
    const laterRun = { ...record, runs: [{ role: 'implementer', round: 1 }, { role: 'implementer', round: 2 }] };
    expect(itemFor(project(repo({ ledger: [laterRun] }), overlay([staleRound])), 'feat/rt').agent?.source).toBe('ledger');
  });
});

describe('dev activity attention queue (§3.4)', () => {
  test('collects four sources and sorts oldest first', () => {
    const record = ledger({ branch: 'feat/blocked', runs: [{ role: 'implementer', round: 1 }] });
    const blocked: RuntimeBadge = { identity: identity(), revision: 2, state: 'blocked', reason: 'permission', changed_at: iso(DAY), source: 'program-v1', badge: 'blocked', freshness: 'fresh' };
    const snapshot = project(repo({
      pull_requests: [
        pr('feat/ready', { merge_state: 'CLEAN', created_at: iso(4 * DAY) }),
        pr('feat/hidden-ready', { merge_state: 'CLEAN', state: 'closed', closed_at: iso(DAY) }),
        pr('feat/ask', { merge_state: 'BLOCKED' }),
      ],
      ledger: [record, ledger({ branch: 'feat/ask', phase: 'merge-ask', phase_since: iso(2 * DAY), waiting_owner: true, record_id: 'ask' })],
      human_requests: [{ decision_id: '123e4567-e89b-42d3-a456-426614174012', question: 'Ship /Users/me/secret now?', first_observed_at: iso(3 * DAY) }],
    }), overlay([blocked]));
    expect(snapshot.attention.map(entry => [entry.kind, entry.waiting_since])).toEqual([
      ['ready_to_merge', iso(4 * DAY)],
      ['human_request', iso(3 * DAY)],
      ['ledger_waiting_owner', iso(2 * DAY)],
      ['runtime_blocked', iso(DAY)],
    ]);
    const human = snapshot.attention.find(entry => entry.kind === 'human_request')!;
    expect(human.summary).toBe('Ship [private path] now?');
    expect(human.command).toBe('repo-harness verified-context read --kind decision --id 123e4567-e89b-42d3-a456-426614174012');
    expect(snapshot.attention.find(entry => entry.kind === 'ready_to_merge')!.url).toMatch(/^https:\/\/github\.com\//u);
    expect(itemFor(snapshot, 'feat/blocked').runtime_blocked).toEqual({ reason: 'permission', since: iso(DAY) });
  });

  test('a ready-to-merge item with a merge-ask ledger record is one ask', () => {
    const snapshot = project(repo({
      pull_requests: [pr('feat/both', { merge_state: 'CLEAN' })],
      ledger: [ledger({ branch: 'feat/both', phase: 'merge-ask', waiting_owner: true })],
    }));
    expect(snapshot.attention.map(entry => entry.kind)).toEqual(['ready_to_merge']);
  });

  test('stale runtime blocks stay off the queue', () => {
    const record = ledger({ branch: 'feat/blocked', runs: [{ role: 'implementer', round: 1 }] });
    const stale: RuntimeBadge = { identity: identity(), revision: 2, state: 'blocked', reason: 'question', changed_at: iso(DAY), source: 'program-v1', badge: 'blocked', freshness: 'stale' };
    const snapshot = project(repo({ ledger: [record] }), overlay([stale]));
    expect(itemFor(snapshot, 'feat/blocked').runtime_blocked).toBeNull();
    expect(snapshot.attention).toEqual([]);
  });
});

describe('dev activity public text and health', () => {
  test('masks absolute paths in ledger titles and blocked reasons', () => {
    const snapshot = project(repo({
      ledger: [ledger({ title: 'fix: default to /tmp and C:\\temp', blocked: { reason: 'see /Users/me/log.txt', since: iso(DAY) } })],
    }));
    const item = snapshot.items[0]!;
    expect(item.title).toBe('fix: default to [private path] and [private path]');
    expect(item.ledger?.blocked?.reason).toBe('see [private path]');
    expect(JSON.stringify(snapshot)).not.toContain('/Users/');
  });

  test('shows a PR title verbatim through projection and decode', () => {
    const title = 'drop the /start double header';
    const snapshot = project(repo({
      pull_requests: [pr('feat/start', { title, merge_state: 'CLEAN', ci: 'success', review: 'approved' })],
    }));
    const item = itemFor(snapshot, 'feat/start');
    expect(item.title).toBe(title);
    expect(item.pull_request?.title).toBe(title);
    const decoded = decodeDevActivitySnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(decoded.items[0]!.title).toBe(title);
    expect(decoded.items[0]!.pull_request?.title).toBe(title);
    expect(decoded.attention.find(entry => entry.kind === 'ready_to_merge')?.summary).toBe(title);
  });

  test('still masks a path in a ledger-only title', () => {
    const snapshot = project(repo({ ledger: [ledger({ title: 'edit /Users/me/x now' })] }));
    expect(snapshot.items[0]!.title).toBe('edit [private path] now');
    expect(JSON.stringify(snapshot)).not.toContain('/Users/');
  });

  test('an unavailable or stale source makes the snapshot partial', () => {
    const snapshot = project(repo({ sources: [{ kind: 'github', status: 'unavailable', reason: 'gh_failed', observed_at: iso(0) }] }));
    expect(snapshot.status).toBe('partial');
    const configured = project(repo({ sources: [{ kind: 'runtime', status: 'not_configured', reason: 'runtime_not_configured', observed_at: null }] }));
    expect(configured.status).toBe('ready');
  });

  test('summarizes CI rollups and review decisions without guessing', () => {
    expect(summarizeCiRollup(null)).toBe('none');
    expect(summarizeCiRollup([])).toBe('none');
    expect(summarizeCiRollup([{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }, { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SKIPPED' }])).toBe('success');
    expect(summarizeCiRollup([{ __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: '' }])).toBe('pending');
    expect(summarizeCiRollup([{ __typename: 'StatusContext', state: 'PENDING' }, { __typename: 'StatusContext', state: 'ERROR' }])).toBe('failure');
    expect(() => summarizeCiRollup([{ __typename: 'Mystery' }])).toThrow();
    expect(reviewStateOf('')).toBe('none');
    expect(reviewStateOf('CHANGES_REQUESTED')).toBe('changes_requested');
    expect(() => reviewStateOf('MAYBE')).toThrow();
  });
});

describe('dev activity decoder', () => {
  const valid = () => JSON.parse(JSON.stringify(project(repo({
    worktrees: [worktree('feat/a')],
    pull_requests: [pr('feat/a', { merge_state: 'CLEAN' })],
  })))) as any;

  test('accepts a projected snapshot and the unavailable snapshot', () => {
    expect(decodeDevActivitySnapshot(valid()).items).toHaveLength(1);
    expect(decodeDevActivitySnapshot(unavailableDevActivitySnapshot()).status).toBe('unavailable');
  });

  const rejections: [string, (value: any) => void][] = [
    ['unknown top-level field', v => { v.extra = 1; }],
    ['missing field', v => { delete v.attention; }],
    ['wrong projection version', v => { v.projection_version = 'repo-harness.dev-activity.v0'; }],
    ['unknown item field', v => { v.items[0].path = 'x'; }],
    ['absolute path in a non-PR title', v => { v.items[0].pull_request = null; v.items[0].title = 'see /Users/me/repo'; }],
    ['absolute path in display_name', v => { v.repositories[0].display_name = 'see /Users/me/repo'; }],
    ['windows path in worktree', v => { v.items[0].worktrees[0].directory = 'C:\\work'; }],
    ['worktree directory with separator', v => { v.items[0].worktrees[0].directory = 'a/b'; }],
    ['non-GitHub url', v => { v.items[0].pull_request.url = 'https://evil.example/pull/1'; }],
    ['bad column', v => { v.items[0].column = 'done'; }],
    ['retired hidden reason', v => { v.items[0].hidden = 'shipped_outside_window'; }],
    ['open PR without CI', v => { v.items[0].pull_request.ci = null; }],
    ['merged PR with CI', v => { Object.assign(v.items[0].pull_request, { state: 'merged', merged_at: v.items[0].pull_request.updated_at }); }],
    ['bad repository id', v => { v.repositories[0].repository_id = 'repo-x'; }],
    ['item for unknown repository', v => { v.items[0].repository_id = 'repo_ffffffffffffffff'; }],
    ['free-text source reason', v => { v.repositories[0].sources[0].reason = 'fatal: not a git repository'; }],
    ['unsorted attention', v => { v.attention.push({ ...v.attention[0], kind: 'runtime_blocked', waiting_since: '2000-01-01T00:00:00.000Z' }); }],
    ['attention without its item', v => { v.attention[0].subject_id = `${REPO}:nope`; }],
    ['unavailable with data', v => { v.status = 'unavailable'; }],
    ['bad time', v => { v.items[0].column_since = 'yesterday'; }],
  ];
  for (const [name, mutate] of rejections) {
    test(`rejects ${name}`, () => {
      const value = valid();
      mutate(value);
      expect(() => decodeDevActivitySnapshot(value)).toThrow();
    });
  }
});
