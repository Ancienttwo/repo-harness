// Dot review threads (#1450). Pure projection of Slack `#bot-worker` messages
// into a closed snapshot, by the markers of `docs/reference-configs/dot-review-protocol.md`.
// The snapshot holds parsed fields and the dot's reply text only: no token,
// channel ID, local path or request text. Reply text that matches a secret rule
// is withheld, never echoed.

import { GITHUB_REPOSITORY } from '../board/github-repository';
import { decodeReaders } from '../evidence/decode-readers';
import { containsSecret } from '../security/secret-patterns';
import { isPublicDevActivityText, publicDevActivityText } from '../public-projections/public-text';

export const SLACK_REVIEW_REASONS = [
  'slack_pending',
  'slack_config_missing',
  'slack_config_invalid',
  'slack_bot_unregistered',
  'slack_bot_invalid',
  'slack_auth_failed',
  'slack_rate_limited',
  'slack_unavailable',
] as const;
/** Why the newest collection cycle has no current threads. */
export type SlackReviewReason = typeof SLACK_REVIEW_REASONS[number];

export const SLACK_REVIEW_STATES = ['waiting', 'acknowledged', 'result', 'rejected', 'head_mismatch', 'request_invalid'] as const;
export type SlackReviewState = typeof SLACK_REVIEW_STATES[number];

export const SLACK_REVIEW_TEXT_MAX_BYTES = 8 * 1024;
export const SLACK_REVIEW_MAX_THREADS = 200;

export type SlackReviewTextV1 =
  | { readonly state: 'none' }
  | { readonly state: 'shown'; readonly value: string; readonly truncated: boolean }
  | { readonly state: 'text_withheld' };

export interface SlackReviewThreadV1 {
  /** Slack ts of the request message; it names the thread. */
  readonly thread_ts: string;
  readonly requested_at: string;
  /** GitHub `owner/repo` and PR number from the request `pr` field; null only for `request_invalid`. */
  readonly repo: string | null;
  readonly pr: number | null;
  /** 40-character request head; null only for `request_invalid`. */
  readonly head: string | null;
  readonly state: SlackReviewState;
  /** Set only for `result` and `head_mismatch`. */
  readonly finding_count: number | null;
  /** Time of the dot reply that set the state; null when the dot has not replied. */
  readonly replied_at: string | null;
  /** The newest dot result or rejection text. */
  readonly text: SlackReviewTextV1;
}

/**
 * `reason: null` is a current collection. `stale: true` occurs only with
 * `slack_rate_limited`: the threads of the previous collection stay, marked stale.
 * Every other reason replaces older threads, so no old state shows as current.
 * `truncated: true` means the collection is incomplete: the 7-day history had
 * more than one page of messages, or a thread had more replies than the cap and
 * is left out, because a partial thread cannot show a current state.
 */
export interface SlackReviewsSnapshotV1 {
  readonly protocol: 1;
  readonly kind: 'operator_bot_reviews';
  readonly reason: SlackReviewReason | null;
  readonly stale: boolean;
  readonly truncated: boolean;
  readonly collected_at: string | null;
  readonly threads: readonly SlackReviewThreadV1[];
}

/** A Slack message as the collector decoded it from the Web API. */
export interface SlackMessage {
  readonly ts: string;
  readonly thread_ts: string | null;
  readonly user: string | null;
  readonly text: string;
  readonly reply_count: number;
}

export function slackReviewsUnavailable(reason: SlackReviewReason): SlackReviewsSnapshotV1 {
  return { protocol: 1, kind: 'operator_bot_reviews', reason, stale: false, truncated: false, collected_at: null, threads: [] };
}

const SLACK_TS = /^\d{1,12}\.\d{6}$/u;
const SLACK_USER_ID = /^[UW][A-Z0-9]{2,31}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const REQUEST_LINE = /^<@([UW][A-Z0-9]{2,31})(?:\|[^>]*)?> repo-harness review request$/u;
const PR_URL = /^https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/([1-9]\d{0,9})$/u;
const SLACK_LINK = /^<([^|>]+)(?:\|[^>]*)?>$/u;
const ACK_LINE = /^ack ([0-9a-f]{40})$/u;
const RESULT_LINE = /^repo-harness review result PR #([1-9]\d{0,9}) @ ([0-9a-f]{40}): (0|[1-9]\d{0,5}) findings$/u;
const REJECTED_LINE = /^repo-harness review rejected: \S/u;

export function isSlackUserId(value: string): boolean {
  return SLACK_USER_ID.test(value);
}

export function slackTsToIso(ts: string): string {
  const [seconds, micros] = ts.split('.');
  return new Date(Number(seconds) * 1000 + Math.floor(Number(micros) / 1000)).toISOString();
}

const firstLine = (text: string): string => text.split('\n', 1)[0]!;

interface ParsedRequest {
  readonly repo: string | null;
  readonly pr: number | null;
  readonly head: string | null;
}

/**
 * Null when the message is not a request to this dot. Fields stay null when
 * absent, repeated, malformed or secret-bearing; a secret value is never echoed.
 */
export function parseReviewRequest(text: string, dotUserId: string): ParsedRequest | null {
  const [first, ...rest] = text.split('\n');
  const mention = REQUEST_LINE.exec(first!);
  if (mention === null || mention[1] !== dotUserId) return null;
  const fields = new Map<string, string[]>();
  for (const line of rest) {
    const field = /^(pr|head): (.+)$/u.exec(line);
    if (field !== null) fields.set(field[1]!, [...fields.get(field[1]!) ?? [], field[2]!]);
  }
  const single = (key: string): string | null => {
    const values = fields.get(key);
    return values?.length === 1 ? values[0]! : null;
  };
  const prValue = single('pr');
  // Slack clients send a URL as link markup: `<https://…|label>`.
  const url = prValue === null ? null : SLACK_LINK.exec(prValue)?.[1] ?? prValue;
  const pr = url === null ? null : PR_URL.exec(url);
  const repo = pr !== null && GITHUB_REPOSITORY.test(pr[1]!) && !containsSecret(pr[1]!) ? pr[1]! : null;
  const head = single('head');
  return {
    repo,
    pr: repo === null ? null : Number(pr![2]),
    head: head !== null && SHA.test(head) ? head : null,
  };
}

type DotReply =
  | { readonly kind: 'ack' }
  | { readonly kind: 'result'; readonly pr: number; readonly head: string; readonly finding_count: number }
  | { readonly kind: 'rejected' };

function readDotReply(text: string): DotReply | null {
  const line = firstLine(text);
  if (ACK_LINE.test(line)) return { kind: 'ack' };
  const result = RESULT_LINE.exec(line);
  if (result !== null) return { kind: 'result', pr: Number(result[1]), head: result[2]!, finding_count: Number(result[3]) };
  if (REJECTED_LINE.test(line)) return { kind: 'rejected' };
  return null;
}

/** Slack escapes only these three characters in message text. */
const unescapeSlack = (text: string): string => text.replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&amp;/gu, '&');

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * A secret anywhere withholds the whole text; it is checked before the cap, so a
 * secret cut at the cap cannot leak a prefix. Local paths and URL tails become
 * `[private path]`, so no local path leaves the host. The cut value is checked
 * again: a cut can turn a safe text into a match (`API_KEY: null` → `API_KEY: nu`),
 * which the decoder would refuse.
 */
export function projectReviewText(raw: string): SlackReviewTextV1 {
  const unescaped = unescapeSlack(raw);
  if (containsSecret(unescaped)) return { state: 'text_withheld' };
  const text = publicDevActivityText(unescaped);
  const bytes = new TextEncoder().encode(text);
  const truncated = bytes.length > SLACK_REVIEW_TEXT_MAX_BYTES;
  const value = truncated ? new TextDecoder().decode(bytes.slice(0, SLACK_REVIEW_TEXT_MAX_BYTES)).replace(/\uFFFD+$/u, '') : text;
  // The value passes the snapshot decoder's text rule, or it is not shown.
  return containsSecret(value) || !isPublicDevActivityText(value) ? { state: 'text_withheld' } : { state: 'shown', value, truncated };
}

/**
 * One thread. The newest recognized dot reply sets the state; replies from
 * anyone else, dot replies without a marker and results for another PR are ignored.
 */
export function projectReviewThread(request: SlackMessage, replies: readonly SlackMessage[], dotUserId: string): SlackReviewThreadV1 | null {
  const parsed = parseReviewRequest(request.text, dotUserId);
  if (parsed === null) return null;
  const valid = parsed.repo !== null && parsed.head !== null;
  let state: SlackReviewState = valid ? 'waiting' : 'request_invalid';
  let findingCount: number | null = null;
  let repliedAt: string | null = null;
  let text: SlackReviewTextV1 = { state: 'none' };
  const dotReplies = replies
    .filter(reply => reply.ts !== request.ts && reply.user === dotUserId)
    .sort((a, b) => Number(a.ts) - Number(b.ts));
  for (const reply of dotReplies) {
    const read = readDotReply(reply.text);
    if (read === null || (read.kind === 'result' && read.pr !== parsed.pr)) continue;
    if (read.kind !== 'ack') text = projectReviewText(reply.text);
    if (!valid) continue;
    repliedAt = slackTsToIso(reply.ts);
    if (read.kind === 'ack') { state = 'acknowledged'; findingCount = null; }
    else if (read.kind === 'rejected') { state = 'rejected'; findingCount = null; }
    else { state = read.head === parsed.head ? 'result' : 'head_mismatch'; findingCount = read.finding_count; }
  }
  return {
    thread_ts: request.ts,
    requested_at: slackTsToIso(request.ts),
    repo: parsed.repo,
    pr: parsed.pr,
    head: parsed.head,
    state,
    finding_count: findingCount,
    replied_at: repliedAt,
    text,
  };
}

/** Top-level messages only: a thread reply or a channel broadcast of one is never a request. */
export function isTopLevel(message: SlackMessage): boolean {
  return message.thread_ts === null || message.thread_ts === message.ts;
}

/** Strict decode of a snapshot before it leaves the server. */
export function decodeSlackReviews(value: unknown): SlackReviewsSnapshotV1 {
  const fail = (what: string): never => { throw new Error(`bot_reviews_invalid: ${what}`); };
  const { obj, oneOf } = decodeReaders(fail);
  const time = (v: unknown, what: string): string => (typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v ? v : fail(what));
  const root = obj(value, ['protocol', 'kind', 'reason', 'stale', 'truncated', 'collected_at', 'threads'], 'snapshot');
  if (root.protocol !== 1 || root.kind !== 'operator_bot_reviews') fail('protocol');
  const reason = root.reason === null ? null : oneOf(root.reason, SLACK_REVIEW_REASONS, 'reason');
  if (typeof root.stale !== 'boolean') fail('stale');
  const stale = root.stale as boolean;
  if (typeof root.truncated !== 'boolean') fail('truncated');
  const truncated = root.truncated as boolean;
  const collectedAt = root.collected_at === null ? null : time(root.collected_at, 'collected_at');
  if (!Array.isArray(root.threads) || root.threads.length > SLACK_REVIEW_MAX_THREADS) fail('threads');
  if (stale && (reason !== 'slack_rate_limited' || collectedAt === null)) fail('stale without rate limit');
  if (reason === null && collectedAt === null) fail('current snapshot without collected_at');
  if (reason !== null && !stale && (collectedAt !== null || truncated || (root.threads as unknown[]).length > 0)) fail('unavailable snapshot with threads');
  const threads = (root.threads as unknown[]).map((item): SlackReviewThreadV1 => {
    const t = obj(item, ['thread_ts', 'requested_at', 'repo', 'pr', 'head', 'state', 'finding_count', 'replied_at', 'text'], 'thread');
    if (typeof t.thread_ts !== 'string' || !SLACK_TS.test(t.thread_ts)) fail('thread_ts');
    const state = oneOf(t.state, SLACK_REVIEW_STATES, 'state');
    const repo = t.repo === null ? null : typeof t.repo === 'string' && GITHUB_REPOSITORY.test(t.repo) && !containsSecret(t.repo) ? t.repo : fail('repo');
    const pr = t.pr === null ? null : Number.isSafeInteger(t.pr) && (t.pr as number) > 0 ? t.pr as number : fail('pr');
    const head = t.head === null ? null : typeof t.head === 'string' && SHA.test(t.head) ? t.head : fail('head');
    if ((repo === null) !== (pr === null)) fail('repo and pr');
    if (state !== 'request_invalid' && (repo === null || head === null)) fail('valid request fields');
    const counted = state === 'result' || state === 'head_mismatch';
    const findingCount = t.finding_count === null ? null : Number.isSafeInteger(t.finding_count) && (t.finding_count as number) >= 0 ? t.finding_count as number : fail('finding_count');
    if (counted !== (findingCount !== null)) fail('finding_count state');
    const repliedAt = t.replied_at === null ? null : time(t.replied_at, 'replied_at');
    if ((state === 'waiting' || state === 'request_invalid') !== (repliedAt === null)) fail('replied_at state');
    const text = decodeText(t.text, fail);
    return { thread_ts: t.thread_ts as string, requested_at: time(t.requested_at, 'requested_at'), repo, pr, head, state, finding_count: findingCount, replied_at: repliedAt, text };
  });
  return { protocol: 1, kind: 'operator_bot_reviews', reason, stale, truncated, collected_at: collectedAt, threads };
}

function decodeText(value: unknown, fail: (what: string) => never): SlackReviewTextV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('text');
  const text = value as Record<string, unknown>;
  const keys = Object.keys(text).sort().join(',');
  if (text.state === 'none' && keys === 'state') return { state: 'none' };
  if (text.state === 'text_withheld' && keys === 'state') return { state: 'text_withheld' };
  if (text.state === 'shown' && keys === 'state,truncated,value' && typeof text.value === 'string' && typeof text.truncated === 'boolean'
    && utf8Length(text.value) <= SLACK_REVIEW_TEXT_MAX_BYTES && !containsSecret(text.value) && isPublicDevActivityText(text.value)) {
    return { state: 'shown', value: text.value, truncated: text.truncated };
  }
  return fail('text');
}
