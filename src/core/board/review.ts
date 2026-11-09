import { ACCEPTANCE_RECORD_HEADER, type BoardPullRequestV1, type BoardV1 } from './board';
import { claimStatusTarget, newestProtocolComment, parseAcceptanceRecord, parseClaimStatus, protocolComments, type BoardCommentPageV1, type BoardCommentV1 } from './source';

/**
 * Review start (#2002): which open pull requests need a review seat now, and which seats. It is a pure projection
 * of the board and of the start markers on each pull request. It writes nothing.
 *
 * A start marker is one `repo-harness review start` comment with `Subject: <head sha>`. It covers that head until a
 * `repo-harness review start status` comment with `Status: released` names it. The marker is the one record that a
 * gatekeeper seat started for a head, so a second run, or a seat that ended without a record, never starts a second seat.
 * The runner starts the gatekeeper only. A High pull request from a Codex-family or unknown writer also needs a Claude
 * review; the runner reports `second_reviewer_required` and the orchestrator starts that seat (#2025 automates it).
 */
export const REVIEW_START_HEADER = 'repo-harness review start';
export const REVIEW_START_STATUS_HEADER = 'repo-harness review start status';

export type ReviewSkipReason = 'not_open' | 'draft' | 'ci_not_green' | 'accepted' | 'acceptance_unknown' | 'started';

export type ReviewDecisionV1 =
  | { readonly pr: number; readonly action: 'start'; readonly head_ref: string; readonly head_sha: string; readonly tier: 'medium' | 'high'; readonly second_reviewer_required: boolean; readonly delta_from: string | null; readonly reason: string }
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

/** The live markers: those that no `released` status names. */
function liveMarkers(page: BoardCommentPageV1): BoardCommentV1[] {
  const released = new Set(protocolComments(page, REVIEW_START_STATUS_HEADER)
    .filter(comment => parseClaimStatus(comment)?.status.startsWith('released') === true)
    .map(claimStatusTarget));
  return protocolComments(page, REVIEW_START_HEADER).filter(comment => !released.has(comment.url));
}

/**
 * The newest earlier head that a live marker started and that has an acceptance row from a known non-Claude reviewer. The runner
 * starts the gatekeeper, and the Claude reviewer's row is not evidence that the gatekeeper finished. A start without such a
 * row gives no base, so the review then covers the whole diff.
 */
function deltaBase(page: BoardCommentPageV1, head: string): string | null {
  const recorded = new Set(protocolComments(page, ACCEPTANCE_RECORD_HEADER).flatMap(record => parseAcceptanceRecord(record) ?? []).filter(row => row.harness !== null && row.harness !== 'claude').map(row => row.subject_sha));
  const earlier = liveMarkers(page).filter(marker => field(marker, 'Subject') !== head && recorded.has(field(marker, 'Subject') ?? ''));
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
    if (liveMarkers(page).some(marker => field(marker, 'Subject') === pr.head_sha)) return skip('started', `a start marker covers ${pr.head_sha}`);
    const delta = deltaBase(page, pr.head_sha);
    return {
      pr: pr.number, action: 'start', head_ref: pr.head_ref, head_sha: pr.head_sha, tier, second_reviewer_required: pr.claude_review === 'pending', delta_from: delta,
      reason: delta === null ? 'full review' : `delta review since ${delta}`,
    };
  });
}
