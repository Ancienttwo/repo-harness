import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';

import {
  projectDevActivity,
  summarizeCiRollup,
  reviewStateOf,
  runtimeSourceHealth,
  type DevActivityRawPullRequest,
  type DevActivityRawRepository,
  type DevActivityRawWorktree,
  type DevActivityProjectionInput,
} from '../../src/core/dev-activity/projection';
import { decodeDevActivitySnapshot, unavailableDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import type { DevActivitySnapshotV2 } from '../../src/core/dev-activity/types';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';

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

function repo(overrides: Partial<DevActivityRawRepository> = {}): DevActivityRawRepository {
  return {
    repository_id: REPO, display_name: 'widgets', github: 'acme/widgets', default_branch: 'main',
    sources: [
      { kind: 'git', status: 'ok', reason: null, observed_at: iso(0) },
      { kind: 'github', status: 'ok', reason: null, observed_at: iso(0) },
    ],
    worktrees: [], pull_requests: [], ...overrides,
  };
}

function project(repository: DevActivityRawRepository): DevActivitySnapshotV2 {
  const input: DevActivityProjectionInput = { collected_at: iso(0), now_ms: NOW, unreadable_registrations: 2, repositories: [repository] };
  return projectDevActivity(input);
}

const itemFor = (snapshot: DevActivitySnapshotV2, branch: string) => snapshot.items.find(item => item.branch === branch)!;

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
    }));
    expect(itemFor(snapshot, 'feat/local')).toMatchObject({ column: 'building', hidden: null, column_since: null, pull_request: null,
      worktrees: [{ directory: 'wt-feat-local', dirty: true, ahead: 2, behind: 0 }] });
    expect(itemFor(snapshot, 'feat/draft')).toMatchObject({ column: 'building', column_since: iso(3 * DAY) });
    expect(itemFor(snapshot, 'feat/verify')).toMatchObject({ column: 'verifying', column_since: iso(3 * DAY) });
    expect(itemFor(snapshot, 'feat/ready')).toMatchObject({ column: 'ready_to_merge', pull_request: { ci: 'success', review: 'approved' } });
    expect(itemFor(snapshot, 'feat/shipped')).toMatchObject({ column: 'shipped', hidden: null, column_since: iso(DAY) });
    expect(snapshot.items.some(item => item.column === 'planned')).toBe(false);
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
});

describe('dev activity identity and join (§3.2)', () => {
  test('joins worktree and PR only on exact branch-name equality', () => {
    const snapshot = project(repo({
      worktrees: [worktree('feat/a'), worktree('Feat/A'), worktree('feat/a '), worktree('feat/a-2')],
      pull_requests: [pr('feat/a')],
    }));
    expect(snapshot.items.map(item => item.branch).filter(Boolean).sort()).toEqual(['Feat/A', 'feat/a', 'feat/a ', 'feat/a-2']);
    const exact = itemFor(snapshot, 'feat/a');
    expect(exact.worktrees).toHaveLength(1);
    expect(exact.pull_request?.number).toBeGreaterThan(0);
    expect(itemFor(snapshot, 'Feat/A').pull_request).toBeNull();
    expect(itemFor(snapshot, 'feat/a-2').pull_request).toBeNull();
  });

  test('excludes the default branch and detached worktrees', () => {
    const snapshot = project(repo({
      worktrees: [worktree('main'), worktree(null)],
      pull_requests: [pr('main')],
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
});

describe('dev activity attention queue (§3.4)', () => {
  test('collects GitHub merge asks, oldest first', () => {
    const snapshot = project(repo({
      pull_requests: [
        pr('feat/ready', { merge_state: 'CLEAN', created_at: iso(4 * DAY) }),
        pr('feat/hidden-ready', { merge_state: 'CLEAN', state: 'closed', closed_at: iso(DAY) }),
        pr('feat/ask', { merge_state: 'BLOCKED' }),
      ],
    }));
    expect(snapshot.attention.map(entry => [entry.kind, entry.waiting_since])).toEqual([
      ['ready_to_merge', iso(4 * DAY)],
    ]);
    expect(snapshot.attention.find(entry => entry.kind === 'ready_to_merge')!.url).toMatch(/^https:\/\/github\.com\//u);
    expect(JSON.stringify(snapshot)).not.toContain('/Users/');
  });
});

describe('dev activity attention kinds (G19)', () => {
  test('raises changes_requested, merge_conflict and checks_failed from review, merge_state and ci, longest wait first', () => {
    const snapshot = project(repo({
      pull_requests: [
        pr('feat/ci', { ci: 'failure', created_at: iso(2 * DAY) }),
        pr('feat/review', { review: 'changes_requested', created_at: iso(5 * DAY) }),
        pr('feat/conflict', { merge_state: 'DIRTY', created_at: iso(4 * DAY) }),
        pr('feat/ready', { merge_state: 'CLEAN', ci: 'success', review: 'approved', created_at: iso(3 * DAY) }),
        pr('feat/waiting', { ci: 'pending', created_at: iso(6 * DAY) }),
      ],
    }));
    expect(snapshot.attention.map(entry => [entry.kind, entry.waiting_since, itemFor(snapshot, entry.subject_id.split(':')[1]!).branch])).toEqual([
      ['changes_requested', iso(5 * DAY), 'feat/review'],
      ['merge_conflict', iso(4 * DAY), 'feat/conflict'],
      ['ready_to_merge', iso(3 * DAY), 'feat/ready'],
      ['checks_failed', iso(2 * DAY), 'feat/ci'],
    ]);
    for (const entry of snapshot.attention) expect(entry.url).toMatch(/^https:\/\/github\.com\//u);
    expect(decodeDevActivitySnapshot(JSON.parse(JSON.stringify(snapshot))).attention).toHaveLength(4);
  });

  test('one item raises one row; blockers outrank the merge ask', () => {
    const snapshot = project(repo({
      pull_requests: [
        pr('feat/all', { review: 'changes_requested', merge_state: 'DIRTY', ci: 'failure' }),
        pr('feat/conflict-ci', { merge_state: 'DIRTY', ci: 'failure' }),
        pr('feat/clean-red', { merge_state: 'CLEAN', ci: 'failure', review: 'approved' }),
      ],
    }));
    expect(Object.fromEntries(snapshot.attention.map(entry => [entry.subject_id.split(':')[1], entry.kind]))).toEqual({
      'feat/all': 'changes_requested', 'feat/conflict-ci': 'merge_conflict', 'feat/clean-red': 'checks_failed',
    });
    expect(snapshot.attention).toHaveLength(3);
  });

  test('drafts, closed PRs, merged PRs and PR-less branches raise nothing', () => {
    const snapshot = project(repo({
      worktrees: [worktree('feat/local')],
      pull_requests: [
        pr('feat/draft', { is_draft: true, ci: 'failure', review: 'changes_requested', merge_state: 'DIRTY' }),
        pr('feat/closed', { state: 'closed', closed_at: iso(DAY), review: 'changes_requested', merge_state: 'DIRTY' }),
        pr('feat/merged', { state: 'merged', merged_at: iso(DAY), closed_at: iso(DAY), review: 'changes_requested', merge_state: 'DIRTY' }),
      ],
    }));
    expect(snapshot.attention).toEqual([]);
  });

  test('breaks equal waits by kind then subject, and the decoder accepts the order', () => {
    const created_at = iso(DAY);
    const snapshot = project(repo({
      pull_requests: [
        pr('feat/b', { ci: 'failure', created_at }),
        pr('feat/a', { ci: 'failure', created_at }),
        pr('feat/c', { review: 'changes_requested', created_at }),
      ],
    }));
    expect(snapshot.attention.map(entry => `${entry.kind}:${entry.subject_id.split(':')[1]}`)).toEqual([
      'changes_requested:feat/c', 'checks_failed:feat/a', 'checks_failed:feat/b',
    ]);
    expect(() => decodeDevActivitySnapshot(JSON.parse(JSON.stringify(snapshot)))).not.toThrow();
  });
});

describe('dev activity public text and health', () => {
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

  test('masks absolute paths after any punctuation but keeps branch and ratio slashes', () => {
    const cases: [string, string][] = [
      ['failed [/home/alice/secret]', 'failed [[private path]]'],
      ['failed,/home/alice/secret', 'failed,[private path]'],
      ['path=/home/alice/secret', 'path=[private path]'],
      ['open ~/Projects/secret now', 'open ~[private path] now'],
      ['see <C:\\Users\\me>', 'see <[private path]>'],
      ['merge feat/x and and/or at 1/2 from ./rel', 'merge feat/x and and/or at 1/2 from ./rel'],
    ];
    for (const [title, expected] of cases) {
      const snapshot = project(repo({ display_name: title }));
      expect(snapshot.repositories[0]!.display_name).toBe(expected);
      expect(decodeDevActivitySnapshot(JSON.parse(JSON.stringify(snapshot))).repositories[0]!.display_name).toBe(expected);
    }
  });

  test('keeps Unicode branch names in worktree and PR cards', () => {
    for (const branch of ['修复/问题', 'café/issue', 'cafe\u0301/issue', 'δοκιμή/42', '分支１/修改', 'fix🔧/issue', 'fix👩‍💻/issue', 'fix❤️/issue']) {
      expect(execFileSync('git', ['check-ref-format', '--branch', branch], { encoding: 'utf8' }).trim()).toBe(branch);
      const snapshot = project(repo({ worktrees: [worktree(branch)], pull_requests: [pr(branch)] }));
      expect(snapshot.items).toHaveLength(1);
      expect(snapshot.items[0]!.branch).toBe(branch);
      expect(snapshot.items[0]!.worktrees).toHaveLength(1);
      expect(snapshot.items[0]!.pull_request).not.toBeNull();
      expect(decodeDevActivitySnapshot(JSON.parse(JSON.stringify(snapshot))).items[0]!.branch).toBe(branch);
    }
  });

  test('the decoder rejects a path after punctuation in a guarded field', () => {
    const snapshot = project(repo({ worktrees: [worktree('feat/plain')] }));
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.items[0].title = 'failed [/home/alice/secret]';
    expect(() => decodeDevActivitySnapshot(raw)).toThrow('dev activity projection invalid');
  });

  test('an unavailable or stale source makes the snapshot partial', () => {
    const snapshot = project(repo({ sources: [{ kind: 'github', status: 'unavailable', reason: 'gh_failed', observed_at: iso(0) }] }));
    expect(snapshot.status).toBe('partial');
    const configured = project(repo({ sources: [{ kind: 'runtime', status: 'not_configured', reason: 'runtime_not_configured', observed_at: null }] }));
    expect(configured.status).toBe('ready');
  });

  test('keeps global runtime source health without a task join', () => {
    const ready = { ...unavailableRuntimeOverlay(), status: 'ready' as const, observed_at: iso(1000) };
    expect(runtimeSourceHealth(null, NOW)).toMatchObject({ status: 'not_configured' });
    expect(runtimeSourceHealth(unavailableRuntimeOverlay(), NOW)).toMatchObject({ status: 'unavailable' });
    expect(runtimeSourceHealth(ready, NOW)).toMatchObject({ status: 'ok' });
    expect(runtimeSourceHealth({ ...ready, observed_at: iso(DAY) }, NOW)).toMatchObject({ status: 'stale' });
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
    ['retired v1 projection', v => { v.projection_version = 'repo-harness.dev-activity.v1'; }],
    ['retired ledger field', v => { v.items[0].ledger = null; }],
    ['retired agent field', v => { v.items[0].agent = null; }],
    ['retired runtime block field', v => { v.items[0].runtime_blocked = null; }],
    ['retired ledger source', v => { v.repositories[0].sources[0].kind = 'ledger'; }],
    ['retired owner attention', v => { v.attention[0].kind = 'ledger_waiting_owner'; }],
    ['retired runtime attention', v => { v.attention[0].kind = 'runtime_blocked'; }],
    ['retired branchless item', v => { v.items[0].branch = null; }],
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
    ['unsorted attention', v => { v.attention.push({ ...v.attention[0], waiting_since: '2000-01-01T00:00:00.000Z' }); }],
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
