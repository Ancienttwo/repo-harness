import { ACCEPTANCE_RECORD_HEADER, type BoardPullRequestV1, type BoardV1 } from './board';
import { claimStatusTarget, newestProtocolComment, parseAcceptanceRecord, parseClaimStatus, protocolComments, type BoardCommentPageV1, type BoardCommentV1 } from './source';

/**
 * Review start (#2002): which open pull requests need a review seat now, and which seats. It is a pure projection
 * of the board and of the start markers on each pull request. It writes nothing.
 *
 * A start marker is one `repo-harness review start` comment with `Subject: <head sha>` and `Seat: gatekeeper|reviewer`. It covers
 * that head for that seat until a `repo-harness review start status` comment with `Status: released` names it. The marker is the
 * one record that a seat started for a head, so a second run, or a seat that ended without a record, never starts a second seat
 * of the same role, and a seat that was not sent retries without restarting the other. The gatekeeper always starts; the
 * Claude reviewer starts too while the board reports `claude_review: pending`.
 */
export const REVIEW_START_HEADER = 'repo-harness review start';
export const REVIEW_START_STATUS_HEADER = 'repo-harness review start status';

export type ReviewSkipReason = 'not_open' | 'draft' | 'ci_not_green' | 'accepted' | 'acceptance_unknown' | 'started';

export type ReviewSeat = 'gatekeeper' | 'reviewer';

export interface ReviewSeatStartV1 {
  readonly seat: ReviewSeat;
  /** The earlier head that this seat's own review finished; null gives the seat the whole diff. */
  readonly delta_from: string | null;
}

export type ReviewDecisionV1 =
  | { readonly pr: number; readonly action: 'start'; readonly head_ref: string; readonly head_sha: string; readonly tier: 'medium' | 'high'; readonly seats: readonly ReviewSeatStartV1[];
      /** The board accepts the head only with a named non-Claude PASS and a Claude verdict, so its gatekeeper must not run Claude. */
      readonly needs_non_claude_gatekeeper: boolean }
  | { readonly pr: number; readonly action: 'skip'; readonly reason: ReviewSkipReason; readonly detail: string };

export interface ReviewInputV1 {
  readonly board: BoardV1;
  /** The comments of each open pull request of the board. */
  readonly comments: ReadonlyMap<number, BoardCommentPageV1>;
}

const field = (comment: BoardCommentV1, name: string): string | null => {
  const line = comment.body.replace(/\r\n/gu, '\n').split('\n').find(entry => entry.startsWith(`${name}: `));
  return line === undefined ? null : line.slice(name.length + 2).trim();
};

/** The live markers of one seat: those that no `released` status names. */
function liveMarkers(page: BoardCommentPageV1, seat: ReviewSeat): BoardCommentV1[] {
  const released = new Set(protocolComments(page, REVIEW_START_STATUS_HEADER)
    .filter(comment => parseClaimStatus(comment)?.status.startsWith('released') === true)
    .map(claimStatusTarget));
  return protocolComments(page, REVIEW_START_HEADER).filter(comment => field(comment, 'Seat') === seat && !released.has(comment.url));
}

/**
 * The newest earlier head that a live marker of this seat started and that has an acceptance row of this seat's reviewer family:
 * a Claude row for the reviewer, a known non-Claude row for the gatekeeper. A start without such a row gives no base, so that
 * seat reviews the whole diff, whatever the other seat finished.
 */
function deltaBase(page: BoardCommentPageV1, head: string, seat: ReviewSeat): string | null {
  const own = (harness: string | null): boolean => (seat === 'reviewer' ? harness === 'claude' : harness !== null && harness !== 'claude');
  const recorded = new Set(protocolComments(page, ACCEPTANCE_RECORD_HEADER).flatMap(record => parseAcceptanceRecord(record) ?? []).filter(row => own(row.harness)).map(row => row.subject_sha));
  const earlier = liveMarkers(page, seat).filter(marker => field(marker, 'Subject') !== head && recorded.has(field(marker, 'Subject') ?? ''));
  const newest = earlier.length === 0 ? null : newestProtocolComment({ ...page, comments: earlier }, REVIEW_START_HEADER);
  return newest === null ? null : field(newest, 'Subject');
}

export function planReview(input: ReviewInputV1): readonly ReviewDecisionV1[] {
  const { board } = input;
  return board.pull_requests.map((pr): ReviewDecisionV1 => {
    const skip = (reason: ReviewSkipReason, detail: string): ReviewDecisionV1 => ({ pr: pr.number, action: 'skip', reason, detail });
    if (pr.state !== 'open') return skip('not_open', `the pull request is ${pr.state}`);
    if (pr.is_draft) return skip('draft', 'the pull request is a draft');
    if (pr.required_check.status !== 'success') return skip('ci_not_green', `Required / CI is ${pr.required_check.status}`);
    if (pr.acceptance.status === 'accepted') return skip('accepted', `an acceptance covers ${pr.head_sha}`);
    if (pr.acceptance.status === 'unknown') return skip('acceptance_unknown', pr.acceptance.reason);
    // An unknown tier is High: a pull request that no tier label covers still gets a review.
    const tier = pr.tier ?? 'high';
    if (tier === 'low') return skip('accepted', 'a Low pull request takes no review seat');
    const page = input.comments.get(pr.number);
    if (page === undefined) return skip('started', 'the comments of the pull request were not read');
    if (page.truncated) return skip('started', 'older comments were not read, so a start marker cannot be ruled out');
    const required: readonly ReviewSeat[] = pr.claude_review === 'pending' ? ['gatekeeper', 'reviewer'] : ['gatekeeper'];
    const seats = required.filter(seat => !liveMarkers(page, seat).some(marker => field(marker, 'Subject') === pr.head_sha))
      .map((seat): ReviewSeatStartV1 => ({ seat, delta_from: deltaBase(page, pr.head_sha, seat) }));
    if (seats.length === 0) return skip('started', `a start marker of every required seat covers ${pr.head_sha}`);
    return { pr: pr.number, action: 'start', head_ref: pr.head_ref, head_sha: pr.head_sha, tier, seats, needs_non_claude_gatekeeper: pr.claude_review !== 'not_required' };
  });
}
