import { expect, test } from 'bun:test';
import { DispatchError, planDispatch, type DispatchPlanV1 } from '../src/core/board/dispatch';
import { executeDispatch, type DispatchPorts } from '../src/effects/board/dispatch';
import { withSeatLine } from '../src/core/board/seat-line';
import { HerdrCoreError } from '../src/effects/terminal/herdr-core';
import type { SeatAccountQuotas } from '../src/core/board/seat-routing';
import { DEFAULT_SEATS_CONFIG } from '../src/core/board/seats-settings';
import type { BoardCommentV1, BoardParentReadV1, BoardSubIssueReadV1 } from '../src/core/board/source';

const NORMAL: SeatAccountQuotas = {
  claude: { state: 'normal', remaining: 80, mode: 'normal' },
  chatgpt: { state: 'normal', remaining: 30, mode: 'normal', credits: 'off' },
};
const comment = (body: string, created_at = '2026-11-09T10:00:00Z'): BoardCommentV1 =>
  ({ url: `https://example.test/${created_at}`, created_at, author_association: 'OWNER', body });
const coordinator = comment('repo-harness issue claim\nStatus: active\nRole: coordinator', '2026-11-09T09:00:00Z');
const planBody = (limit: number) => `repo-harness plan\n\n\`\`\`json\n${JSON.stringify({
  protocol: 2, kind: 'repo-harness.plan', merge_order: [1, 2, 3, 4, 5, 6, 7, 8], holds: [{ issue: 2, reason: 'owner first' }],
  seat_limits: { worker: limit },
})}\n\`\`\``;

function issue(number: number, extra: Partial<BoardSubIssueReadV1> = {}): BoardSubIssueReadV1 {
  return {
    number, title: `issue ${number}`, url: '', state: 'open', labels: ['route:important_deep'], milestone: null,
    comments: { truncated: false, comments: [] }, blocked_by: [], pull_request_candidates: [], ...extra,
  };
}
const withComments = (...comments: BoardCommentV1[]) => ({ comments: { truncated: false, comments } });

function read(subIssues: BoardSubIssueReadV1[], limit = 4): BoardParentReadV1 {
  return {
    repository: { database_id: 1, name_with_owner: 'o/r', default_branch: 'main' },
    parent: { number: 100, title: 'parent', url: '', state: 'open', labels: [], milestone: null, comments: { truncated: false, comments: [coordinator, comment(planBody(limit))] } },
    sub_issues: subIssues, repair_candidates: [],
  };
}
const reasons = (plan: ReturnType<typeof planDispatch>) => plan.decisions.map(d => d.action === 'skip' ? `${d.issue}:${d.reason}` : `${d.issue}:dispatch`);

test('a ready issue dispatches to its route seat; every other state is skipped with its reason', () => {
  const plan = planDispatch({
    seats: DEFAULT_SEATS_CONFIG, quota: NORMAL, terminals: [],
    parent: read([
      issue(1),
      issue(2),
      issue(3, { blocked_by: [{ number: 9, state: 'open' }] }),
      issue(4, withComments(comment('repo-harness issue claim\nStatus: active'))),
      issue(5, { labels: [] }),
      issue(6, { state: 'closed' }),
      // A released claim frees the issue; a closed blocker no longer blocks.
      issue(7, { blocked_by: [{ number: 9, state: 'closed' }], ...withComments(
        comment('repo-harness issue claim\nStatus: active', '2026-11-09T10:00:00Z'),
        comment('repo-harness issue claim status\nClaim: https://example.test/2026-11-09T10:00:00Z\nStatus: released', '2026-11-09T11:00:00Z')) }),
    ]),
  });
  expect(reasons(plan)).toEqual(['1:dispatch', '2:held', '3:blocked', '4:claimed', '5:kind_label_invalid', '6:closed', '7:dispatch', '8:not_sub_issue']);
  expect(plan.decisions[0]).toMatchObject({ seat: 'worker-important', route_class: 'important_deep' });
});

test('the worker limit counts live seats of the parent and stops further dispatch', () => {
  const live = (issueNumber: string) => ({ state: 'live' as const, labels: { seat: 'worker', issue: issueNumber, parent: '100' } });
  const plan = planDispatch({
    seats: DEFAULT_SEATS_CONFIG, quota: NORMAL, terminals: [live('50'), live('51'), { state: 'finished', labels: { seat: 'worker', issue: '52', parent: '100' } }],
    parent: read([issue(1), issue(3), issue(4)], 3),
  });
  expect(plan.live_workers).toBe(2);
  expect(reasons(plan).slice(0, 4)).toEqual(['1:dispatch', '2:not_sub_issue', '3:over_limit', '4:over_limit']);
});

test('a live seat that carries the issue label blocks a second dispatch, with or without the parent label', () => {
  const plan = planDispatch({
    seats: DEFAULT_SEATS_CONFIG, quota: NORMAL, terminals: [{ state: 'live', labels: { seat: 'worker', issue: '1' } }],
    parent: read([issue(1)]),
  });
  expect(reasons(plan)[0]).toBe('1:claimed');
});

test('work that touches credentials never routes to a Pi seat', () => {
  const saving: SeatAccountQuotas = { ...NORMAL, claude: { state: 'normal', remaining: 5, mode: 'saving' } };
  const parent = (labels: string[]) => read([issue(1, { labels })]);
  const plain = planDispatch({ seats: DEFAULT_SEATS_CONFIG, quota: saving, terminals: [], parent: parent(['route:important_deep']) });
  const secret = planDispatch({ seats: DEFAULT_SEATS_CONFIG, quota: saving, terminals: [], parent: parent(['route:important_deep', 'touches:credentials']) });
  expect(plain.decisions[0]).toMatchObject({ action: 'dispatch', seat: 'worker-light' });
  expect(secret.decisions[0]).toMatchObject({ action: 'skip', reason: 'no_route' });
});

test('a parent without a plan comment fails closed', () => {
  const parent = read([issue(1)]);
  expect(() => planDispatch({ seats: DEFAULT_SEATS_CONFIG, quota: NORMAL, terminals: [], parent: { ...parent, parent: { ...parent.parent, comments: { truncated: false, comments: [] } } } }))
    .toThrow(DispatchError);
});

test('a closing status counts only for the claim it names, also within the same second', () => {
  const claimA = comment('repo-harness issue claim\nStatus: active', '2026-11-09T10:00:00Z');
  const claimB = comment('repo-harness issue claim\nStatus: active', '2026-11-09T11:00:00Z');
  const released = (claim: BoardCommentV1, at: string) => comment(`repo-harness issue claim status\nClaim: ${claim.url}\nStatus: released`, at);
  const [delayed, tie, own] = [
    // A late release of claim A arrives after claim B.
    issue(1, withComments(claimA, claimB, released(claimA, '2026-11-09T12:00:00Z'))),
    // The release of claim A carries the timestamp of claim B.
    issue(1, withComments(claimA, claimB, released(claimA, '2026-11-09T11:00:00Z'))),
    issue(1, withComments(claimA, claimB, released(claimB, '2026-11-09T11:00:00Z'))),
  ].map(sub => reasons(planDispatch({ seats: DEFAULT_SEATS_CONFIG, quota: NORMAL, terminals: [], parent: read([sub]) }))[0]);
  expect([delayed, tie, own]).toEqual(['1:claimed', '1:claimed', '1:dispatch']);
});

test('zero or several route labels, and an unknown route class, skip the issue', () => {
  const plan = planDispatch({
    seats: DEFAULT_SEATS_CONFIG, quota: NORMAL, terminals: [],
    parent: read([issue(1, { labels: [] }), issue(3, { labels: ['route:simple_fast', 'route:frontend'] }), issue(4, { labels: ['route:urgent'] })]),
  });
  expect(reasons(plan).filter((_, index) => index !== 1).slice(0, 3)).toEqual(['1:kind_label_invalid', '3:kind_label_invalid', '4:kind_label_invalid']);
});

function ports(overrides: Partial<DispatchPorts> = {}) {
  const calls: string[] = [];
  const base: DispatchPorts = {
    startWorktree: issueNumber => { calls.push(`worktree ${issueNumber}`); return { path: `/tmp/wt-${issueNumber}`, branch: `feat/${issueNumber}` }; },
    comment: (issueNumber, body) => { calls.push(`comment ${issueNumber}: ${body.split('\n')[0]} ${body.split('\n').find(line => line.startsWith('Status:'))}`); return `https://example.test/claim-${issueNumber}`; },
    openTab: args => { calls.push(`tab ${String(args.folder)}`); },
    launch: async () => ({ argv: ['agent'], tab: 'tab-name', runtime: 'claude' }),
    ...overrides,
  };
  return { calls, base };
}
const context = { repositoryId: '9', parent: 100, space: 's1', dry_run: false, model: (): string | null => 'claude-sonnet-5-5' };
const planOf = (labels: string[]): DispatchPlanV1 => planDispatch({ seats: DEFAULT_SEATS_CONFIG, quota: NORMAL, terminals: [], parent: read([issue(1, { labels })]) });

test('execute starts the worktree, posts the claim, then opens the tab; a dry run writes nothing', async () => {
  const run = ports();
  const started = await executeDispatch(planOf(['route:important_deep']), context, run.base);
  expect(started.map(entry => entry.claim_url)).toEqual(['https://example.test/claim-1']);
  expect(run.calls).toEqual(['worktree 1', 'comment 1: repo-harness issue claim Status: active', 'tab /tmp/wt-1']);
  const dry = ports();
  expect(await executeDispatch(planOf(['route:important_deep']), { ...context, dry_run: true }, dry.base)).toEqual([]);
  expect(dry.calls).toEqual([]);
});

test('dispatch writes the earliest active coordinator claim URL', async () => {
  const parent = read([issue(1)]);
  const newer = comment('repo-harness issue claim\nStatus: active\nRole: coordinator', '2026-11-09T11:00:00Z');
  const released = comment('repo-harness issue claim\nStatus: active\nRole: coordinator', '2026-11-09T12:00:00Z');
  const status = comment(`repo-harness issue claim status\nClaim: ${released.url}\nStatus: released`, '2026-11-09T13:00:00Z');
  const plan = planDispatch({ seats: DEFAULT_SEATS_CONFIG, quota: NORMAL, terminals: [], parent: { ...parent, parent: { ...parent.parent, comments: { truncated: false, comments: [...parent.parent.comments.comments, newer, released, status] } } } });
  let body = '';
  const run = ports({ comment: (_issue, text) => { body = text; return 'claim'; } });
  await executeDispatch(plan, context, run.base);
  expect(body).toContain(`\nCoordinator: ${coordinator.url}\n`);
});

test('the claim names the model from the context; a seat with no model writes no Model line', async () => {
  const bodies: string[] = [];
  const run = ports({ comment: (_issue, text) => { bodies.push(text); return 'claim'; } });
  await executeDispatch(planOf(['route:important_deep']), context, run.base);
  await executeDispatch(planOf(['route:important_deep']), { ...context, model: () => null }, run.base);
  expect(bodies.map(body => body.split('\n').filter(line => line.startsWith('Model: ')))).toEqual([['Model: claude-sonnet-5-5'], []]);
});

test('dispatch refuses before any writes without an active coordinator claim', async () => {
  const parent = read([issue(1)]);
  const status = comment(`repo-harness issue claim status\nClaim: ${coordinator.url}\nStatus: released`);
  const plan = planDispatch({ seats: DEFAULT_SEATS_CONFIG, quota: NORMAL, terminals: [], parent: { ...parent, parent: { ...parent.parent, comments: { truncated: false, comments: [...parent.parent.comments.comments, status] } } } });
  const run = ports();
  await expect(executeDispatch(plan, context, run.base)).rejects.toThrow(/no active coordinator claim/);
  expect(run.calls).toEqual([]);
});

test('a released successor does not reactivate its predecessor; dry run reports truncated comments', async () => {
  const parent = read([issue(1)]);
  const successor = comment(`repo-harness issue claim\nStatus: active\nRole: coordinator\nPrior claim: ${coordinator.url}`, '2026-11-09T11:00:00Z');
  const status = comment(`repo-harness issue claim status\nClaim: ${successor.url}\nStatus: released`, '2026-11-09T12:00:00Z');
  const plan = planDispatch({ seats: DEFAULT_SEATS_CONFIG, quota: NORMAL, terminals: [], parent: { ...parent, parent: { ...parent.parent, comments: { truncated: true, comments: [...parent.parent.comments.comments, successor, status] } } } });
  const run = ports();
  for (const dry_run of [false, true]) {
    await expect(executeDispatch(plan, { ...context, dry_run }, run.base)).rejects.toThrow(/no active coordinator claim.*older parent comments were not read/);
  }
  expect(run.calls).toEqual([]);
});

test('coordinator ties use comment IDs and a handoff selects the successor', () => {
  const parent = read([issue(1)]);
  const first = { ...coordinator, url: 'https://github.com/o/r/issues/100#issuecomment-9' };
  const second = { ...coordinator, url: 'https://github.com/o/r/issues/100#issuecomment-10' };
  const selected = (claims: BoardCommentV1[]) => planDispatch({ seats: DEFAULT_SEATS_CONFIG, quota: NORMAL, terminals: [], parent: { ...parent, parent: { ...parent.parent, comments: { truncated: false, comments: [comment(planBody(4)), ...claims] } } } }).coordinator;
  expect(selected([second, first])).toBe(first.url);
  expect(selected([first, { ...second, body: `${second.body}\nPrior claim: ${first.url}` }])).toBe(second.url);
});

test('a tab failure before the request releases the claim; an ambiguous one keeps it and reports launch_unknown', async () => {
  const fail = (reason: 'missing' | 'timeout') => ports({ openTab: () => { throw new HerdrCoreError('herdr-app', reason); } });
  const before = fail('missing');
  await expect(executeDispatch(planOf(['route:important_deep']), context, before.base)).rejects.toBeInstanceOf(HerdrCoreError);
  expect(before.calls.at(-1)).toBe('comment 1: repo-harness issue claim status Status: released');
  const ambiguous = fail('timeout');
  await expect(executeDispatch(planOf(['route:important_deep']), context, ambiguous.base)).rejects.toThrow(/launch_unknown for #1/);
  expect(ambiguous.calls.some(call => call.includes('released'))).toBe(false);
});

test('a credentials issue whose launch resolves to Pi starts no claim and no tab', async () => {
  const run = ports({ launch: async () => ({ argv: ['agent'], tab: null, runtime: 'pi' }) });
  await expect(executeDispatch(planOf(['route:important_deep', 'touches:credentials']), context, run.base)).rejects.toThrow(/Pi seat/);
  expect(run.calls).toEqual(['worktree 1']);
});

test('a seat comment gets the Seat line only when the seat env and the hc address are both set', () => {
  expect(withSeatLine('body', { REPO_HARNESS_SEAT: 'advisor', HC_TERMINAL_ID: 't5' })).toBe('body\nSeat: advisor t5');
  expect(withSeatLine('body', { REPO_HARNESS_SEAT: 'advisor' })).toBe('body');
  expect(withSeatLine('body', { HC_TERMINAL_ID: 't5' })).toBe('body');
});
