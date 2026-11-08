import { expect, test } from 'bun:test';
import { DispatchError, planDispatch } from '../src/core/board/dispatch';
import type { SeatAccountQuotas } from '../src/core/board/seat-routing';
import { DEFAULT_SEATS_CONFIG } from '../src/core/board/seats-settings';
import type { BoardCommentV1, BoardParentReadV1, BoardSubIssueReadV1 } from '../src/core/board/source';

const NORMAL: SeatAccountQuotas = {
  claude: { state: 'normal', remaining: 80, mode: 'normal' },
  chatgpt: { state: 'normal', remaining: 30, mode: 'normal' },
};
const comment = (body: string, created_at = '2026-11-09T10:00:00Z'): BoardCommentV1 =>
  ({ url: `https://example.test/${created_at}`, created_at, author_association: 'OWNER', body });
const planBody = (limit: number) => `repo-harness plan\n\n\`\`\`json\n${JSON.stringify({
  protocol: 1, kind: 'repo-harness.plan', merge_order: [1, 2, 3, 4, 5, 6, 7, 8], holds: [{ issue: 2, reason: 'owner first' }],
  batches: [], seat_limits: { worker: limit },
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
    parent: { number: 100, title: 'parent', url: '', state: 'open', labels: [], milestone: null, comments: { truncated: false, comments: [comment(planBody(limit))] } },
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
        comment('repo-harness issue claim status\nStatus: released', '2026-11-09T11:00:00Z')) }),
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

test('a live seat that carries the issue label blocks a second dispatch of it', () => {
  const plan = planDispatch({
    seats: DEFAULT_SEATS_CONFIG, quota: NORMAL, terminals: [{ state: 'live', labels: { seat: 'worker', issue: '1', parent: '100' } }],
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
