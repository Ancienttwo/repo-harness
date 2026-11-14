import { spawnSync } from 'child_process';
import { lstatSync, readFileSync } from 'fs';
import {
  patchRightLines,
  renderAcceptanceClaim,
  renderAcceptanceRecord,
  reviewPayloadFromReceipt,
  validateReviewPublishReceipt,
  type ReviewDiffLines,
  type ReviewPublishReceipt,
} from '../../core/review/review-publish';
import { errorMessage } from '../../core/evidence/error-message';

export type ReviewPublishErrorCode =
  | 'review_receipt_invalid'
  | 'review_subject_stale'
  | 'review_publish_conflict'
  | 'review_publish_partial'
  | 'review_publish_unknown'
  | 'review_publish_provider_unavailable'
  | 'review_publish_failed';

/** A publish failure carries its exit code and the URLs that already exist. */
export class ReviewPublishError extends Error {
  readonly exitCode: number;
  constructor(readonly code: ReviewPublishErrorCode, message: string, exitCode: number,
    readonly posted: readonly string[] = [], readonly details?: unknown) {
    super(message);
    this.name = 'ReviewPublishError';
    this.exitCode = exitCode;
  }
}

export interface ReviewPublishResult {
  readonly ok: true;
  readonly pr: number;
  readonly head_sha: string;
  readonly round: number;
  readonly claim_url: string;
  readonly review_url: string;
  readonly record_url: string;
  readonly threads: number;
}

export interface ReviewPublishGhResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error;
}

export type ReviewPublishGhRunner = (args: readonly string[], input?: string) => ReviewPublishGhResult;

export interface ReviewPublishInput {
  readonly repoRoot: string;
  readonly prNumber: number;
  /** Rule 1 stops a review at round 5; a later round needs this owner decision comment. */
  readonly ownerRecord?: string;
  readonly ghBin?: string;
  /** Test seam. Production runs the configured gh binary. */
  readonly ghRunner?: ReviewPublishGhRunner;
}

const MAX_RECEIPT_BYTES = 1024 * 1024;
const GH_TIMEOUT_MS = 30_000;
const GH_MAX_BUFFER = 4 * 1024 * 1024;
const PAGE_SIZE = 100;
const MAX_PAGES = 30;
const PR_FIELDS = 'number,headRefOid,url,closingIssuesReferences';
const HARD_STOP_ROUND = 5;
const OWNER_RECORD_PATTERN = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/(pull|issues)\/([0-9]+)#issuecomment-[0-9]+$/;

function readReceipt(path: string): ReviewPublishReceipt {
  let bytes: Buffer;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RECEIPT_BYTES) {
      throw new Error('receipt must be a regular file of at most 1 MiB');
    }
    bytes = readFileSync(path);
  } catch (error) {
    throw new ReviewPublishError('review_receipt_invalid', 'review receipt is unreadable: ' + errorMessage(error), 2);
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new ReviewPublishError('review_receipt_invalid', 'review receipt is not valid JSON: ' + errorMessage(error), 2);
  }
  return parseReceipt(value);
}

/** The one receipt validator; `review publish` and `review collect` both end here. */
export function parseReceipt(value: unknown): ReviewPublishReceipt {
  try {
    return validateReviewPublishReceipt(value);
  } catch (error) {
    throw new ReviewPublishError('review_receipt_invalid', errorMessage(error), 2);
  }
}

function createGhRunner(repoRoot: string, ghBin?: string): ReviewPublishGhRunner {
  const bin = ghBin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh';
  return (args, input) => {
    const result = spawnSync(bin, [...args], {
      cwd: repoRoot,
      env: { ...process.env, GH_HOST: 'github.com' },
      input,
      encoding: 'utf8',
      timeout: GH_TIMEOUT_MS,
      maxBuffer: GH_MAX_BUFFER,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', ...(result.error ? { error: result.error } : {}) };
  };
}

/**
 * A mutation ended without a confirmed provider answer. GitHub may have
 * accepted it, so the caller must report an unknown outcome, keep the URLs it
 * already confirmed, and require inspection before any retry.
 */
class GhMutationUnknownError extends Error {
  constructor(message: string, readonly cause?: unknown, readonly confirmedUrl?: string) {
    super(message);
    this.name = 'GhMutationUnknownError';
  }
}

/** A mutation returned a provider error, so it was confirmed not to post. */
class GhMutationRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GhMutationRejectedError';
  }
}

function ghJson(
  run: ReviewPublishGhRunner,
  args: readonly string[],
  input?: string,
  options: { readonly mutation?: boolean } = {},
): Record<string, unknown> {
  const result = run(args, input);
  if (result.error || result.status === null) {
    const detail = result.error?.message ?? 'request ended without a provider status';
    const message = 'gh ' + args.join(' ') + ' outcome is unknown: ' + detail;
    if (options.mutation) throw new GhMutationUnknownError(message, result.error);
    throw new Error('gh ' + args.join(' ') + ' failed: ' + detail);
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || 'exit ' + String(result.status);
    const message = 'gh ' + args.join(' ') + ' failed: ' + detail;
    if (options.mutation) {
      // Only a provider 4xx answer confirms that the write was refused. A
      // transport failure (EOF), a 5xx, or an exit without an HTTP status may
      // follow an accepted POST, so it stays unknown and is never retried.
      const status = /\bHTTP (\d{3})\b/.exec(result.stderr)?.[1];
      const httpStatus = status === undefined ? null : Number(status);
      if (httpStatus === null || httpStatus < 400 || httpStatus >= 500) throw new GhMutationUnknownError(message);
      throw new GhMutationRejectedError(message);
    }
    throw new Error(message);
  }
  let value: unknown;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    const message = 'gh ' + args.join(' ') + ' returned invalid JSON';
    if (options.mutation) throw new GhMutationUnknownError(message);
    throw new Error(message);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    const message = 'gh ' + args.join(' ') + ' returned a non-object';
    if (options.mutation) throw new GhMutationUnknownError(message);
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

interface PullRequestHead {
  readonly slug: string;
  readonly headSha: string;
  /** `owner/repo#number` of every issue the PR closes; the repository can differ from the PR's. */
  readonly closingIssues: readonly string[];
}

function prHead(run: ReviewPublishGhRunner, prNumber: number): PullRequestHead {
  const value = ghJson(run, ['pr', 'view', String(prNumber), '--json', PR_FIELDS]);
  if (value.number !== prNumber) throw new Error('gh pr view returned PR ' + String(value.number) + ' for ' + prNumber);
  if (typeof value.headRefOid !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value.headRefOid)) throw new Error('gh pr view returned an invalid head SHA');
  if (typeof value.url !== 'string') throw new Error('gh pr view returned no URL');
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/([0-9]+)$/.exec(value.url);
  if (!match || Number(match[2]) !== prNumber) throw new Error('gh pr view returned a URL that does not match the requested PR');
  const closing = value.closingIssuesReferences;
  if (!Array.isArray(closing)) throw new Error('gh pr view returned invalid closing issue references');
  const closingIssues = closing.map((entry) => {
    const issue = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/issues\/([0-9]+)$/.exec(typeof entry?.url === 'string' ? entry.url : '');
    if (issue === null) throw new Error('gh pr view returned a closing issue reference without a valid URL');
    return issue[1] + '#' + issue[2];
  });
  return { slug: match[1]!, headSha: value.headRefOid, closingIssues };
}

/** Read every page of a list endpoint; a read that ends early or exceeds the page cap fails. */
function ghPages(run: ReviewPublishGhRunner, endpoint: string): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const args = ['api', endpoint + '?per_page=' + PAGE_SIZE + '&page=' + page, '--hostname', 'github.com'];
    const result = run(args);
    if (result.error || result.status !== 0) {
      throw new Error('gh ' + args.join(' ') + ' failed: ' + (result.error?.message ?? (result.stderr.trim() || 'exit ' + String(result.status))));
    }
    const value: unknown = JSON.parse(result.stdout);
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'object' || entry === null)) throw new Error('gh ' + args.join(' ') + ' returned a non-list');
    items.push(...(value as Record<string, unknown>[]));
    if (value.length < PAGE_SIZE) return items;
  }
  throw new Error(endpoint + ' lists more than ' + MAX_PAGES * PAGE_SIZE + ' entries');
}

function prDiffLines(run: ReviewPublishGhRunner, slug: string, prNumber: number): ReviewDiffLines {
  const lines = new Map<string, ReadonlySet<number>>();
  for (const file of ghPages(run, 'repos/' + slug + '/pulls/' + prNumber + '/files')) {
    if (typeof file.filename !== 'string') throw new Error('provider listed a changed file without a name');
    lines.set(file.filename, patchRightLines(typeof file.patch === 'string' ? file.patch : undefined));
  }
  return lines;
}

/**
 * The URL of this reviewer's acceptance claim already on the PR for this
 * subject and round, or null. A High round has two reviews of one subject
 * (`acceptor.md` section 2.2), so the agent is part of the claim identity:
 * another agent posts its own claim. A claim of the same agent, subject and
 * round with other fields (tier) is a conflict: a second claim would be
 * ambiguous and an overwrite is not allowed.
 */
function existingClaimUrl(run: ReviewPublishGhRunner, slug: string, prNumber: number, receipt: ReviewPublishReceipt, body: string): string | null {
  const identity = ['Round: ' + receipt.round, 'Subject: ' + receipt.subject_sha, body.split('\n').find((line) => line.startsWith('Agent: '))!];
  const claims = ghPages(run, 'repos/' + slug + '/issues/' + prNumber + '/comments').filter((comment) =>
    typeof comment.body === 'string' && comment.body.startsWith('repo-harness acceptance claim\n')
    && identity.every((line) => (comment.body as string).split('\n').includes(line)));
  const conflict = claims.find((comment) => comment.body !== body);
  if (conflict !== undefined) {
    throw new ReviewPublishError('review_publish_conflict',
      'the PR already has an acceptance claim for subject ' + receipt.subject_sha + ' round ' + receipt.round + ' with other fields; nothing was posted: '
      + String(conflict.html_url), 2);
  }
  return claims.length === 0 ? null : postedUrl(claims[0]!, slug, prNumber, false);
}

function postedUrl(value: Record<string, unknown>, slug: string, prNumber: number, review: boolean): string {
  const url = value.html_url;
  const pattern = review
    ? new RegExp('^https://github\\.com/' + slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/pull/' + prNumber + '#pullrequestreview-[0-9]+$')
    : new RegExp('^https://github\\.com/' + slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/(?:pull|issues)/' + prNumber + '#.+$');
  if (typeof url !== 'string' || !pattern.test(url)) throw new Error('provider returned no stable ' + (review ? 'review' : 'comment') + ' URL');
  return url;
}

function postComment(run: ReviewPublishGhRunner, slug: string, prNumber: number, body: string): string {
  const value = ghJson(run, ['api', 'repos/' + slug + '/issues/' + prNumber + '/comments', '--hostname', 'github.com', '--method', 'POST', '--input', '-'],
    JSON.stringify({ body }), { mutation: true });
  try {
    return postedUrl(value, slug, prNumber, false);
  } catch (error) {
    throw new GhMutationUnknownError(errorMessage(error), error);
  }
}

function postReview(run: ReviewPublishGhRunner, slug: string, prNumber: number, headSha: string, receipt: ReviewPublishReceipt, diffLines: ReviewDiffLines): { readonly url: string; readonly threads: number } {
  const rendered = reviewPayloadFromReceipt(receipt, diffLines);
  const payload = {
    commit_id: headSha,
    event: 'COMMENT',
    body: rendered.body,
    ...(rendered.comments.length ? { comments: rendered.comments } : {}),
  };
  const value = ghJson(run, ['api', 'repos/' + slug + '/pulls/' + prNumber + '/reviews', '--hostname', 'github.com', '--method', 'POST', '--input', '-'], JSON.stringify(payload), { mutation: true });
  let reviewUrl: string;
  try {
    reviewUrl = postedUrl(value, slug, prNumber, true);
  } catch (error) {
    throw new GhMutationUnknownError(errorMessage(error), error);
  }
  try {
    if (value.commit_id !== headSha) throw new Error('provider review does not bind the requested head SHA');
    if (value.state !== 'COMMENTED') throw new Error('provider review state is ' + String(value.state) + ', not COMMENTED');
  } catch (error) {
    // The provider returned a stable review URL, so a review exists even though
    // its binding is wrong. Keep that URL for inspection instead of discarding it.
    throw new GhMutationUnknownError(errorMessage(error), error, reviewUrl);
  }
  return { url: reviewUrl, threads: rendered.comments.length };
}

/**
 * Round above the hard stop needs the owner's decision comment on this PR or
 * on an issue the PR closes. The round cap itself stays the receipt's rule.
 */
function checkOwnerRecord(ownerRecord: string | undefined, round: number, pr: PullRequestHead, prNumber: number): void {
  if (round <= HARD_STOP_ROUND) {
    if (ownerRecord !== undefined) throw new ReviewPublishError('review_receipt_invalid', '--owner-record applies only to a round above ' + HARD_STOP_ROUND, 2);
    return;
  }
  if (ownerRecord === undefined) {
    throw new ReviewPublishError('review_receipt_invalid', 'round must be an integer from 1 to ' + HARD_STOP_ROUND + ' unless --owner-record names the owner decision comment', 2);
  }
  const match = OWNER_RECORD_PATTERN.exec(ownerRecord);
  const onThisTarget = match !== null && match[1] === pr.slug
    && (match[2] === 'pull' ? Number(match[3]) === prNumber : pr.closingIssues.includes(match[1] + '#' + match[3]));
  if (!onThisTarget) {
    throw new ReviewPublishError('review_receipt_invalid', '--owner-record must be a comment URL on PR ' + prNumber + ' or an issue it closes in ' + pr.slug, 2);
  }
}

function partial(message: string, posted: readonly string[], cause?: unknown): ReviewPublishError {
  return new ReviewPublishError('review_publish_partial', message, 5, [...posted], cause === undefined ? undefined : { cause: errorMessage(cause) });
}

/** A POST may have reached GitHub; never retry without inspecting the PR first. */
function unknownOutcome(message: string, posted: readonly string[], cause?: unknown): ReviewPublishError {
  return new ReviewPublishError('review_publish_unknown', message, 5, [...posted], {
    inspect_required: true,
    ...(cause === undefined ? {} : { cause: errorMessage(cause) }),
  });
}

export function publishReview(input: ReviewPublishInput & { readonly receiptPath: string }): ReviewPublishResult {
  return publishReceipt(input, readReceipt(input.receiptPath));
}

export function publishReceipt(input: ReviewPublishInput, receipt: ReviewPublishReceipt): ReviewPublishResult {
  if (!Number.isSafeInteger(input.prNumber) || input.prNumber < 1) {
    throw new ReviewPublishError('review_receipt_invalid', 'review publish requires a positive PR number', 2);
  }
  const run = input.ghRunner ?? createGhRunner(input.repoRoot, input.ghBin);
  let pr: PullRequestHead;
  try {
    pr = prHead(run, input.prNumber);
  } catch (error) {
    throw new ReviewPublishError('review_publish_provider_unavailable', errorMessage(error), 1);
  }
  if (receipt.subject_sha !== pr.headSha.toLowerCase()) {
    throw new ReviewPublishError('review_subject_stale',
      'review receipt subject ' + receipt.subject_sha + ' is not the PR head ' + pr.headSha + '; nothing was posted', 2);
  }
  checkOwnerRecord(input.ownerRecord, receipt.round, pr, input.prNumber);
  const claimBody = renderAcceptanceClaim(receipt, input.ownerRecord);
  let diffLines: ReviewDiffLines;
  let existingClaim: string | null;
  try {
    diffLines = prDiffLines(run, pr.slug, input.prNumber);
    existingClaim = existingClaimUrl(run, pr.slug, input.prNumber, receipt, claimBody);
  } catch (error) {
    if (error instanceof ReviewPublishError) throw error;
    throw new ReviewPublishError('review_publish_provider_unavailable', 'nothing was posted: ' + errorMessage(error), 1);
  }
  const posted: string[] = [];
  const confirmHead = (stage: string): void => {
    let current: PullRequestHead;
    try {
      current = prHead(run, input.prNumber);
    } catch (error) {
      throw partial('the PR head could not be re-read before the ' + stage + '; inspection is required: ' + errorMessage(error), posted, error);
    }
    if (current.slug !== pr.slug || current.headSha.toLowerCase() !== receipt.subject_sha) {
      throw partial('the PR head moved from ' + pr.headSha + ' to ' + current.headSha + ' before the ' + stage
        + '; receipt subject ' + receipt.subject_sha + ' was not published to the ' + stage + '; inspection is required', posted);
    }
  };
  let claimUrl: string;
  try {
    claimUrl = existingClaim ?? postComment(run, pr.slug, input.prNumber, claimBody);
  } catch (error) {
    if (error instanceof GhMutationUnknownError) {
      if (error.confirmedUrl !== undefined) posted.push(error.confirmedUrl);
      throw unknownOutcome('the acceptance claim POST outcome is unknown; inspection is required before any retry: ' + errorMessage(error), posted, error);
    }
    throw new ReviewPublishError('review_publish_failed', 'acceptance claim was not posted: ' + errorMessage(error), 1, posted);
  }
  posted.push(claimUrl);
  confirmHead('review');
  let reviewUrl: string;
  let threads: number;
  try {
    ({ url: reviewUrl, threads } = postReview(run, pr.slug, input.prNumber, pr.headSha, receipt, diffLines));
  } catch (error) {
    if (error instanceof GhMutationUnknownError) {
      if (error.confirmedUrl !== undefined && !posted.includes(error.confirmedUrl)) posted.push(error.confirmedUrl);
      throw unknownOutcome('the acceptance review POST outcome is unknown; inspection is required before any retry: ' + errorMessage(error), posted, error);
    }
    throw partial('acceptance review was not posted after the claim: ' + errorMessage(error), posted, error);
  }
  posted.push(reviewUrl);
  confirmHead('record');
  let recordUrl: string;
  try {
    recordUrl = postComment(run, pr.slug, input.prNumber, renderAcceptanceRecord(receipt, claimUrl, input.ownerRecord));
  } catch (error) {
    if (error instanceof GhMutationUnknownError) {
      if (error.confirmedUrl !== undefined) posted.push(error.confirmedUrl);
      throw unknownOutcome('the acceptance record POST outcome is unknown; inspection is required before any retry: ' + errorMessage(error), posted, error);
    }
    throw partial('acceptance record was not posted after the review: ' + errorMessage(error), posted, error);
  }
  return Object.freeze({
    ok: true as const,
    pr: input.prNumber,
    head_sha: pr.headSha,
    round: receipt.round,
    claim_url: claimUrl,
    review_url: reviewUrl,
    record_url: recordUrl,
    threads,
  });
}
