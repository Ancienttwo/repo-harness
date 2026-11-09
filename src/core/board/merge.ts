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

export type BoardMergeHoldV1 =
  | { readonly status: 'none' }
  /** `issues`: the `Issues:` line of a parent hold; null holds every item of the thread. */
  | { readonly status: 'held'; readonly comment_url: string; readonly issues: readonly number[] | null }
  /** The read is truncated and its newest comments hold no hold record: an older hold can still be in force. */
  | { readonly status: 'unknown'; readonly reason: 'comments_truncated' };

/** The newest hold or release record of one thread decides; a release ends every hold of that thread. */
export function readMergeHold(page: BoardCommentPageV1): BoardMergeHoldV1 {
  const records = [...protocolComments(page, MERGE_HOLD_HEADER), ...protocolComments(page, MERGE_HOLD_RELEASED_HEADER)];
  const newest = records.reduce<(typeof records)[number] | null>((latest, record) => (latest === null || record.created_at >= latest.created_at ? record : latest), null);
  if (newest === null) return page.truncated ? { status: 'unknown', reason: 'comments_truncated' } : { status: 'none' };
  if (newest.body.replace(/\r\n/gu, '\n').split('\n', 1)[0]!.trim() === MERGE_HOLD_RELEASED_HEADER) return { status: 'none' };
  const line = newest.body.replace(/\r\n/gu, '\n').split('\n').find(entry => entry.startsWith('Issues: '));
  const issues = line === undefined ? null : [...line.matchAll(/#([1-9][0-9]*)/gu)].map(match => Number(match[1]));
  return { status: 'held', comment_url: newest.url, issues: issues === null || issues.length === 0 ? null : Object.freeze(issues) };
}

export type BoardMergeRefusalV1 =
  | 'acceptance_merge_off'
  | 'plan_unavailable'
  | 'draft'
  | 'no_item'
  | 'held'
  | 'hold_unknown'
  | 'plan_hold'
  | 'not_in_merge_order'
  | 'merge_order'
  | 'not_accepted'
  | 'claude_review_pending'
  | 'required_check'
  | 'not_ready';

export type BoardMergeDecisionV1 =
  | { readonly pr: number; readonly eligible: true }
  | { readonly pr: number; readonly eligible: false; readonly reason: BoardMergeRefusalV1; readonly detail: string };

function covers(hold: BoardMergeHoldV1, items: readonly number[]): boolean {
  return hold.status === 'held' && (hold.issues === null || items.some(item => hold.issues!.includes(item)));
}

function refusal(board: BoardV1, pr: BoardPullRequestV1): { readonly reason: BoardMergeRefusalV1; readonly detail: string } | null {
  if (board.acceptance_merge !== 'on') return { reason: 'acceptance_merge_off', detail: `publication.acceptance_merge is ${board.acceptance_merge} on ${board.default_branch}` };
  if (board.plan.status !== 'observed') return { reason: 'plan_unavailable', detail: `the plan is ${board.plan.status}` };
  if (pr.is_draft) return { reason: 'draft', detail: `#${pr.number} is a draft` };
  const onBoard = new Map(board.items.map(item => [item.number, item] as const));
  const items = [...new Set([...pr.closes, ...pr.refs])].filter(number => onBoard.has(number)).sort((left, right) => left - right);
  if (items.length === 0) return { reason: 'no_item', detail: `#${pr.number} closes or refs no item of #${board.parent.number}` };
  const holds = [
    { where: `parent #${board.parent.number}`, hold: board.merge_hold },
    ...items.map(number => ({ where: `issue #${number}`, hold: onBoard.get(number)!.merge_hold })),
    { where: `PR #${pr.number}`, hold: pr.merge_hold },
  ];
  const held = holds.find(entry => covers(entry.hold, items));
  if (held !== undefined && held.hold.status === 'held') return { reason: 'held', detail: `merge hold on ${held.where}: ${held.hold.comment_url}` };
  const unknown = holds.find(entry => entry.hold.status === 'unknown');
  if (unknown !== undefined) return { reason: 'hold_unknown', detail: `the comments of ${unknown.where} are truncated and hold no hold record` };
  const plan = board.plan.block;
  const planHold = plan.holds.find(hold => items.includes(hold.issue));
  if (planHold !== undefined) return { reason: 'plan_hold', detail: `the plan holds #${planHold.issue}: ${planHold.reason}` };
  const unordered = items.filter(number => !plan.merge_order.includes(number));
  if (unordered.length > 0) return { reason: 'not_in_merge_order', detail: `${unordered.map(number => `#${number}`).join(' ')} not in the plan merge_order` };
  const first = Math.min(...items.map(number => plan.merge_order.indexOf(number)));
  // An earlier issue outside the board has no observed state, so it blocks like an open one.
  const earlier = plan.merge_order.slice(0, first).filter(number => onBoard.get(number)?.state !== 'closed');
  if (earlier.length > 0) return { reason: 'merge_order', detail: `earlier in merge_order and not closed: ${earlier.map(number => `#${number}`).join(' ')}` };
  // The provisional `tier_low` path needs an evidence check by a seat, so an unattended merge takes a record at every tier.
  if (pr.acceptance.status !== 'accepted' || pr.acceptance.via !== 'record') {
    return { reason: 'not_accepted', detail: `#${pr.number} has no PASS acceptance record for ${pr.head_sha.slice(0, 9)} (${pr.acceptance.status === 'accepted' ? pr.acceptance.via : pr.acceptance.status})` };
  }
  if (pr.claude_review === 'pending') return { reason: 'claude_review_pending', detail: `#${pr.number} needs a Claude review row for ${pr.head_sha.slice(0, 9)}` };
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
