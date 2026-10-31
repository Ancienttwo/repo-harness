import { spawnSync } from 'child_process';
import { lstatSync, readFileSync } from 'fs';
import {
  blockingFindings,
  renderAcceptanceClaim,
  renderAcceptanceRecord,
  reviewPayloadFromReceipt,
  validateReviewPublishReceipt,
  type ReviewPublishReceipt,
} from '../../core/review/review-publish';

export type ReviewPublishErrorCode =
  | 'review_receipt_invalid'
  | 'review_subject_stale'
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
  readonly receiptPath: string;
  readonly ghBin?: string;
  /** Test seam. Production runs the configured gh binary. */
  readonly ghRunner?: ReviewPublishGhRunner;
}

const MAX_RECEIPT_BYTES = 1024 * 1024;
const GH_TIMEOUT_MS = 30_000;
const GH_MAX_BUFFER = 4 * 1024 * 1024;
const PR_FIELDS = 'number,headRefOid,url';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
}

function prHead(run: ReviewPublishGhRunner, prNumber: number): PullRequestHead {
  const value = ghJson(run, ['pr', 'view', String(prNumber), '--json', PR_FIELDS]);
  if (value.number !== prNumber) throw new Error('gh pr view returned PR ' + String(value.number) + ' for ' + prNumber);
  if (typeof value.headRefOid !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value.headRefOid)) throw new Error('gh pr view returned an invalid head SHA');
  if (typeof value.url !== 'string') throw new Error('gh pr view returned no URL');
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/([0-9]+)$/.exec(value.url);
  if (!match || Number(match[2]) !== prNumber) throw new Error('gh pr view returned a URL that does not match the requested PR');
  return { slug: match[1]!, headSha: value.headRefOid };
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

function postReview(run: ReviewPublishGhRunner, slug: string, prNumber: number, headSha: string, receipt: ReviewPublishReceipt): string {
  const rendered = reviewPayloadFromReceipt(receipt);
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
  return reviewUrl;
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

export function publishReview(input: ReviewPublishInput): ReviewPublishResult {
  if (!Number.isSafeInteger(input.prNumber) || input.prNumber < 1) {
    throw new ReviewPublishError('review_receipt_invalid', 'review publish requires a positive PR number', 2);
  }
  const receipt = readReceipt(input.receiptPath);
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
    claimUrl = postComment(run, pr.slug, input.prNumber, renderAcceptanceClaim(receipt));
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
  try {
    reviewUrl = postReview(run, pr.slug, input.prNumber, pr.headSha, receipt);
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
    recordUrl = postComment(run, pr.slug, input.prNumber, renderAcceptanceRecord(receipt, claimUrl));
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
    threads: blockingFindings(receipt).length,
  });
}
