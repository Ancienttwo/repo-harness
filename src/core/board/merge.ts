import type { BoardPullRequestV1, BoardV1 } from './board';
import { protocolComments, type BoardCommentPageV1 } from './source';

/**
 * `repo-harness board merge` eligibility. A GitHub comment is a record, never
 * an instruction: the orchestrator starts the command locally after a joint
 * decision for the batch, and the command reads the plan, acceptance and hold
 * records as data. A hold record only narrows what may merge.
 */
export const MERGE_HOLD_HEADER = 'repo-harness merge hold';
export const MERGE_HOLD_RELEASED_HEADER = 'repo-harness merge hold released';

export interface BoardMergeHoldRecordV1 {
  readonly comment_url: string;
  /** The `Issues:` line of a parent hold; null holds every item of the thread. Always null on an issue or a PR thread. */
  readonly issues: readonly number[] | null;
}

export type BoardMergeHoldV1 =
  | { readonly status: 'none' }
  | { readonly status: 'held'; readonly holds: readonly BoardMergeHoldRecordV1[] }
  /** The read is truncated and no release in it is strictly newer than its oldest comment: an omitted hold can still be in force. */
  | { readonly status: 'unknown'; readonly reason: 'comments_truncated' };

/**
 * Every hold of one thread stays in force until a strictly newer release on
 * that thread. A release with the same time as a hold does not end it, so an
 * unknown order fails closed. On a truncated read, every omitted comment is
 * at or before the oldest comment read, so only a release strictly after
 * that boundary ends the omitted holds. `scoped` reads the `Issues:` line
 * (the parent).
 */
export function readMergeHold(page: BoardCommentPageV1, scoped: boolean): BoardMergeHoldV1 {
  const released = protocolComments(page, MERGE_HOLD_RELEASED_HEADER).map(record => record.created_at).sort().at(-1) ?? null;
  const boundary = page.comments.map(comment => comment.created_at).sort()[0] ?? null;
  if (page.truncated && (released === null || boundary === null || released <= boundary)) return { status: 'unknown', reason: 'comments_truncated' };
  const holds = protocolComments(page, MERGE_HOLD_HEADER).filter(record => released === null || record.created_at >= released).map((record) => {
    const line = scoped ? record.body.replace(/\r\n/gu, '\n').split('\n').find(entry => entry.startsWith('Issues: ')) : undefined;
    const issues = line === undefined ? [] : [...line.matchAll(/#([1-9][0-9]*)/gu)].map(match => Number(match[1]));
    return Object.freeze({ comment_url: record.url, issues: issues.length === 0 ? null : Object.freeze(issues) });
  });
  return holds.length === 0 ? { status: 'none' } : { status: 'held', holds: Object.freeze(holds) };
}

export type BoardMergeRefusalV1 =
  | 'acceptance_merge_off'
  | 'plan_unavailable'
  | 'draft'
  | 'item_off_board'
  | 'held'
  | 'hold_unknown'
  | 'plan_hold'
  | 'not_in_merge_order'
  | 'merge_order'
  | 'not_accepted'
  | 'required_check'
  | 'not_ready';

export type BoardMergeDecisionV1 =
  | { readonly pr: number; readonly eligible: true }
  | { readonly pr: number; readonly eligible: false; readonly reason: BoardMergeRefusalV1; readonly detail: string };

/** The first hold in force for these items; the `Issues:` scope only exists on a parent hold. */
function covering(hold: BoardMergeHoldV1, items: readonly number[]): BoardMergeHoldRecordV1 | null {
  if (hold.status !== 'held') return null;
  return hold.holds.find(record => record.issues === null || items.some(item => record.issues!.includes(item))) ?? null;
}

/** The plan's refusal of a pull request, shared by `board merge` and `board review`: the plan is not observed, or it holds an issue that the pull request links. */
export function planRefusal(board: BoardV1, pr: BoardPullRequestV1): { readonly reason: 'plan_unavailable' | 'plan_hold'; readonly detail: string } | null {
  if (board.plan.status !== 'observed') return { reason: 'plan_unavailable', detail: `the plan is ${board.plan.status}` };
  const linked = new Set([...pr.closes, ...pr.refs]);
  const hold = board.plan.block.holds.find(entry => entry.issue !== board.parent.number && linked.has(entry.issue));
  return hold === undefined ? null : { reason: 'plan_hold', detail: `the plan holds #${hold.issue}: ${hold.reason}` };
}

function refusal(board: BoardV1, pr: BoardPullRequestV1): { readonly reason: BoardMergeRefusalV1; readonly detail: string } | null {
  if (board.acceptance_merge !== 'on') return { reason: 'acceptance_merge_off', detail: `publication.acceptance_merge is ${board.acceptance_merge} on ${board.default_branch}` };
  if (board.plan.status !== 'observed') return planRefusal(board, pr);
  if (pr.is_draft) return { reason: 'draft', detail: `#${pr.number} is a draft` };
  const onBoard = new Map(board.items.map(item => [item.number, item] as const));
  const linked = [...new Set([...pr.closes, ...pr.refs])].filter(number => number !== board.parent.number).sort((left, right) => left - right);
  // An issue outside the board has no observed state, holds or plan position, so it fails closed.
  const offBoard = linked.filter(number => !onBoard.has(number));
  if (offBoard.length > 0) return { reason: 'item_off_board', detail: `${offBoard.map(number => `#${number}`).join(' ')} not a sub-issue of #${board.parent.number}` };
  // A board PR always links an item of the parent (`linkedPullRequests`), so `items` is never empty.
  const items = linked;
  const holds = [
    { where: `parent #${board.parent.number}`, hold: board.merge_hold },
    ...items.map(number => ({ where: `issue #${number}`, hold: onBoard.get(number)!.merge_hold })),
    { where: `PR #${pr.number}`, hold: pr.merge_hold },
  ];
  for (const entry of holds) {
    const record = covering(entry.hold, items);
    if (record !== null) return { reason: 'held', detail: `merge hold on ${entry.where}: ${record.comment_url}` };
  }
  const unknown = holds.find(entry => entry.hold.status === 'unknown');
  if (unknown !== undefined) return { reason: 'hold_unknown', detail: `the comments of ${unknown.where} are truncated and hold no hold record` };
  const plan = board.plan.block;
  const planHold = planRefusal(board, pr);
  if (planHold !== null) return planHold;
  const unordered = items.filter(number => !plan.merge_order.includes(number));
  if (unordered.length > 0) return { reason: 'not_in_merge_order', detail: `${unordered.map(number => `#${number}`).join(' ')} not in the plan merge_order` };
  const last = Math.max(...items.map(number => plan.merge_order.indexOf(number)));
  // Every entry before each linked item must be closed. An earlier issue outside the board has no observed state, so it blocks like an open one.
  const earlier = plan.merge_order.slice(0, last).filter(number => onBoard.get(number)?.state !== 'closed');
  const own = earlier.find(number => pr.closes.includes(number));
  if (own !== undefined) return { reason: 'merge_order', detail: `earlier plan item #${own} is closed only by this PR; split the PR` };
  if (earlier.length > 0) return { reason: 'merge_order', detail: `earlier in merge_order and not closed: ${earlier.map(number => `#${number}`).join(' ')}` };
  // The provisional `tier_low` path needs an evidence check by a seat, so an unattended merge takes a record at every tier.
  // A record acceptance of a High head already needs two PASS rows, one cross-family; `sync` carries the record rows of the reviewed head to a proven merge-only sync (`acceptance` in board.ts).
  if (pr.acceptance.status !== 'accepted' || pr.acceptance.via === 'tier_low') {
    return { reason: 'not_accepted', detail: `#${pr.number} has no PASS acceptance record for ${pr.head_sha.slice(0, 9)} (${pr.acceptance.status === 'accepted' ? pr.acceptance.via : pr.acceptance.status})` };
  }
  if (pr.required_check.status !== 'success') return { reason: 'required_check', detail: `Required / CI is ${pr.required_check.status}` };
  if (pr.merge_readiness?.ready !== true) {
    return { reason: 'not_ready', detail: `readiness blockers: ${pr.merge_readiness?.blockers.map(blocker => blocker.code).join(', ') || 'none observed'}` };
  }
  return null;
}

/** One decision for each open pull request, in plan merge order when the plan is observed, else by number. */
export function boardMergeDecisions(board: BoardV1): BoardMergeDecisionV1[] {
  const order = board.plan.status === 'observed' ? board.plan.block.merge_order : [];
  const rank = (pr: BoardPullRequestV1): number => {
    const positions = [...pr.closes, ...pr.refs].map(number => order.indexOf(number)).filter(index => index >= 0);
    return positions.length === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...positions);
  };
  return board.pull_requests.filter(pr => pr.state === 'open')
    .sort((left, right) => rank(left) - rank(right) || left.number - right.number)
    .map((pr) => {
      const refused = refusal(board, pr);
      return refused === null ? { pr: pr.number, eligible: true } : { pr: pr.number, eligible: false, ...refused };
    });
}
