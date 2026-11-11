import { ACCEPTANCE_RECORD_HEADER, type BoardV1 } from './board';
import { planRefusal } from './merge';
import type { SeatRouteV1 } from './seat-routing';
import { modelFamily } from '../review/model-family';
import { claimStatusTarget, newestProtocolComment, parseAcceptanceRecord, parseClaimStatus, protocolComments, type BoardCommentPageV1, type BoardCommentV1 } from './source';

/**
 * Review start (#2002): which open pull requests need a review seat now, and which seats. It is a pure projection
 * of the board and of the start markers on each pull request. It writes nothing.
 *
 * A start marker is one `repo-harness review start` comment with `Subject: <head sha>` and `Seat: gatekeeper|reviewer`. It covers
 * that head for that seat until a `repo-harness review start status` comment with `Status: released` names it. The marker is the
 * one record that a seat started for a head, so a second run, or a seat that ended without a record, never starts a second seat
 * of the same role, and a seat that was not sent retries without restarting the other. A High head starts the gatekeeper, and the
 * Claude reviewer too while the board reports `claude_review: pending`. A Medium head starts the one seat of the other family than
 * the writer's: a non-Claude gatekeeper for a Claude writer, the Claude reviewer for any other known family. An unknown writer family
 * starts no seat, because no seat is sure to record `different-family`. A gatekeeper starts only when the effective gatekeeper (#2253)
 * has a known model family that is not the writer's, and is not Claude when the head needs a non-Claude gatekeeper.
 */
export const REVIEW_START_HEADER = 'repo-harness review start';
export const REVIEW_START_STATUS_HEADER = 'repo-harness review start status';

export type ReviewSkipReason = 'not_open' | 'draft' | 'ci_not_green' | 'accepted' | 'acceptance_unknown' | 'started' | 'writer_family_unknown' | 'review_family_unavailable' | 'plan_hold' | 'plan_unavailable';

export type ReviewSeat = 'gatekeeper' | 'reviewer';

export interface ReviewSeatStartV1 {
  readonly seat: ReviewSeat;
  /** The earlier head that this seat's own review finished; null gives the seat the whole diff. */
  readonly delta_from: string | null;
}

export type ReviewDecisionV1 =
  | { readonly pr: number; readonly action: 'start'; readonly head_ref: string; readonly head_sha: string; readonly tier: 'medium' | 'high'; readonly seats: readonly ReviewSeatStartV1[] }
  | { readonly pr: number; readonly action: 'skip'; readonly reason: ReviewSkipReason; readonly detail: string };

export interface ReviewInputV1 {
  readonly board: BoardV1;
  /** The comments of each open pull request of the board. */
  readonly comments: ReadonlyMap<number, BoardCommentPageV1>;
  /** `effectiveGatekeeper`: the seat that `seats argv gatekeeper` launches now, and its route line. */
  readonly gatekeeper: SeatRouteV1;
}

/** Why the effective gatekeeper cannot give this head its different-family review, or null when it can. */
function gatekeeperFamilyGap(gatekeeper: SeatRouteV1, writer: string | null, needsNonClaude: boolean): string | null {
  if (gatekeeper.id === null) return 'no gatekeeper seat can launch';
  const family = gatekeeper.seat.model === null ? null : modelFamily(gatekeeper.seat.model);
  if (family === null) return `the model ${gatekeeper.seat.model ?? 'default'} has no known family`;
  if (family === writer) return `the gatekeeper family ${family} is the writer family`;
  return needsNonClaude && family === 'anthropic' ? 'this head needs a non-Claude gatekeeper' : null;
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
    const refused = planRefusal(board, pr);
    if (refused !== null) return skip(refused.reason, refused.detail);
    if (pr.required_check.status !== 'success') return skip('ci_not_green', `Required / CI is ${pr.required_check.status}`);
    if (pr.acceptance.status === 'accepted') return skip('accepted', `an acceptance covers ${pr.head_sha}`);
    if (pr.acceptance.status === 'unknown') return skip('acceptance_unknown', pr.acceptance.reason);
    // An unknown tier is High: a pull request that no tier label covers still gets a review.
    const tier = pr.tier ?? 'high';
    if (tier === 'low') return skip('accepted', 'a Low pull request takes no review seat');
    if (tier === 'medium' && pr.writer_family === null) return skip('writer_family_unknown', 'no writer claim of the head branch has a Model line with a known family, so no seat is sure to be the other family');
    const page = input.comments.get(pr.number);
    if (page === undefined) return skip('started', 'the comments of the pull request were not read');
    if (page.truncated) return skip('started', 'older comments were not read, so a start marker cannot be ruled out');
    const required: readonly ReviewSeat[] = tier === 'medium' ? [pr.writer_family === 'anthropic' ? 'gatekeeper' : 'reviewer']
      : pr.claude_review === 'pending' ? ['gatekeeper', 'reviewer'] : ['gatekeeper'];
    const seats = required.filter(seat => !liveMarkers(page, seat).some(marker => field(marker, 'Subject') === pr.head_sha))
      .map((seat): ReviewSeatStartV1 => ({ seat, delta_from: deltaBase(page, pr.head_sha, seat) }));
    if (seats.length === 0) return skip('started', `a start marker of every required seat covers ${pr.head_sha}`);
    // The Claude reviewer supplies one of the two High reviews, or the writer of a Medium head is Claude, so the gatekeeper must not run Claude.
    const needsNonClaude = tier === 'medium' ? pr.writer_family === 'anthropic' : pr.claude_review !== 'not_required';
    const gap = seats.some(entry => entry.seat === 'gatekeeper') ? gatekeeperFamilyGap(input.gatekeeper, pr.writer_family, needsNonClaude) : null;
    if (gap !== null) return skip('review_family_unavailable', `${gap}; ${input.gatekeeper.line}`);
    return { pr: pr.number, action: 'start', head_ref: pr.head_ref, head_sha: pr.head_sha, tier, seats };
  });
}
