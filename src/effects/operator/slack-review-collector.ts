// Background Dot review collector (#1450). It runs only in the `operator serve`
// process on a timer; GET bot_reviews reads its cache and calls no Slack method.
// It reads the Slack Web API only: the app has no write scope and nothing here
// posts. The bot token is read from `slack.local.json` each cycle and stays in
// this process; the cache holds only the projected snapshot.

import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  isSlackUserId,
  isTopLevel,
  projectReviewThread,
  parseReviewRequest,
  slackReviewsUnavailable,
  type SlackMessage,
  type SlackReviewReason,
  type SlackReviewsSnapshotV1,
  type SlackReviewThreadV1,
} from '../../core/operator/slack-review';
import { BotRegistryError, readBotRegistry } from '../bot-registry';
import { repoHarnessHome } from '../repo-harness-home';

export const SLACK_REVIEW_INTERVAL_MS = 60_000;
export const SLACK_REQUEST_TIMEOUT_MS = 20_000;
export const SLACK_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60_000;
export const SLACK_HISTORY_LIMIT = 200;
/** Replies read per thread. A longer thread is left out and the snapshot is marked truncated. */
export const SLACK_REPLY_LIMIT = 200;
/** Bounds the cursor walk of one thread, so a cursor that never ends cannot hold a cycle. */
const SLACK_REPLY_PAGES = 10;
export const SLACK_CONFIG_FILE = 'slack.local.json';
const SLACK_API = 'https://slack.com/api/';
const CONFIG_MAX_BYTES = 4 * 1024;
const BOT_TOKEN = /^xoxb-[A-Za-z0-9-]{10,}$/u;
const CHANNEL_ID = /^[CG][A-Z0-9]{2,31}$/u;
const SLACK_TS = /^\d{1,12}\.\d{6}$/u;
const AUTH_ERRORS = new Set(['invalid_auth', 'not_in_channel']);

class SlackReviewError extends Error {
  constructor(readonly reason: SlackReviewReason) {
    super(reason);
    this.name = 'SlackReviewError';
  }
}

interface SlackConfig {
  readonly token: string;
  readonly channel_id: string;
}

/** `{ "protocol": 1, "token": "xoxb-…", "channel_id": "C…" }`, a regular file with mode 0600. No other source. */
async function readSlackConfig(env: NodeJS.ProcessEnv | undefined): Promise<SlackConfig> {
  const path = join(repoHarnessHome(env), SLACK_CONFIG_FILE);
  let text: string;
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size > CONFIG_MAX_BYTES) throw new SlackReviewError('slack_config_invalid');
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof SlackReviewError) throw error;
    throw new SlackReviewError((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'slack_config_missing' : 'slack_config_invalid');
  }
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new SlackReviewError('slack_config_invalid'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SlackReviewError('slack_config_invalid');
  const config = value as Record<string, unknown>;
  if (Object.keys(config).sort().join(',') !== 'channel_id,protocol,token' || config.protocol !== 1
    || typeof config.token !== 'string' || !BOT_TOKEN.test(config.token)
    || typeof config.channel_id !== 'string' || !CHANNEL_ID.test(config.channel_id)) {
    throw new SlackReviewError('slack_config_invalid');
  }
  return { token: config.token, channel_id: config.channel_id };
}

/** The dot is the one registered Bot with a `slack_bot_id`; an ambiguous registry names no Bot. */
function readDotBotId(env: NodeJS.ProcessEnv | undefined): string {
  let bots;
  try { bots = readBotRegistry(env); }
  catch (error) {
    if (error instanceof BotRegistryError) throw new SlackReviewError('slack_bot_invalid');
    throw error;
  }
  const slackBots = bots.filter(bot => bot.slack_bot_id !== null);
  if (slackBots.length === 0) throw new SlackReviewError('slack_bot_unregistered');
  if (slackBots.length > 1) throw new SlackReviewError('slack_bot_invalid');
  return slackBots[0]!.slack_bot_id!;
}

type SlackFetch = (url: string, init: { readonly headers: Record<string, string>; readonly signal: AbortSignal }) => Promise<Response>;

interface SlackSession {
  readonly fetch: SlackFetch;
  readonly token: string;
  /** Aborted when the collector closes; no request starts after that. */
  readonly signal: AbortSignal;
}

async function callSlack(session: SlackSession, method: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    session.signal.throwIfAborted();
    response = await session.fetch(`${SLACK_API}${method}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${session.token}` },
      signal: AbortSignal.any([session.signal, AbortSignal.timeout(SLACK_REQUEST_TIMEOUT_MS)]),
    });
  } catch {
    throw new SlackReviewError('slack_unavailable');
  }
  if (response.status === 429) throw new SlackReviewError('slack_rate_limited');
  if (!response.ok) throw new SlackReviewError('slack_unavailable');
  let body: unknown;
  try { body = await response.json(); } catch { throw new SlackReviewError('slack_unavailable'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SlackReviewError('slack_unavailable');
  const record = body as Record<string, unknown>;
  if (record.ok !== true) throw new SlackReviewError(typeof record.error === 'string' && AUTH_ERRORS.has(record.error) ? 'slack_auth_failed' : 'slack_unavailable');
  return record;
}

/** A message without text cannot be a request or a dot reply, so it is left out. A malformed ts fails the response. */
function decodeMessages(body: Record<string, unknown>): SlackMessage[] {
  if (!Array.isArray(body.messages)) throw new SlackReviewError('slack_unavailable');
  const messages: SlackMessage[] = [];
  for (const item of body.messages as unknown[]) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new SlackReviewError('slack_unavailable');
    const message = item as Record<string, unknown>;
    if (typeof message.ts !== 'string' || !SLACK_TS.test(message.ts)) throw new SlackReviewError('slack_unavailable');
    if (typeof message.text !== 'string') continue;
    messages.push({
      ts: message.ts,
      thread_ts: typeof message.thread_ts === 'string' ? message.thread_ts : null,
      user: typeof message.user === 'string' ? message.user : null,
      text: message.text,
      // Slack omits reply_count on a message that has no thread.
      reply_count: Number.isSafeInteger(message.reply_count) ? message.reply_count as number : 0,
    });
  }
  return messages;
}

const nextCursor = (body: Record<string, unknown>): string => {
  const cursor = (body.response_metadata as Record<string, unknown> | undefined)?.next_cursor;
  return typeof cursor === 'string' ? cursor : '';
};

/** Every reply of one thread, or null when it has more than SLACK_REPLY_LIMIT replies. */
async function readReplies(session: SlackSession, channel: string, ts: string): Promise<SlackMessage[] | null> {
  const replies: SlackMessage[] = [];
  let cursor = '';
  for (let page = 0; page < SLACK_REPLY_PAGES; page += 1) {
    const body = await callSlack(session, 'conversations.replies', {
      channel, ts, limit: String(SLACK_REPLY_LIMIT), ...(cursor === '' ? {} : { cursor }),
    });
    // Each page repeats the parent message first.
    replies.push(...decodeMessages(body).filter(message => message.ts !== ts));
    if (replies.length > SLACK_REPLY_LIMIT) return null;
    cursor = nextCursor(body);
    if (cursor === '') return replies;
  }
  return null;
}

export interface SlackReviewReadInput {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetch?: SlackFetch;
  readonly now?: () => Date;
  readonly signal?: AbortSignal;
}

export interface SlackReviewCollection {
  readonly threads: readonly SlackReviewThreadV1[];
  readonly truncated: boolean;
}

/**
 * One collection: config, dot identity, `bots.info`, one `conversations.history`
 * page, then every `conversations.replies` page of each request thread.
 */
export async function readSlackReviewThreads(input: SlackReviewReadInput = {}): Promise<SlackReviewCollection> {
  const config = await readSlackConfig(input.env);
  const dotBotId = readDotBotId(input.env);
  const session: SlackSession = { fetch: input.fetch ?? fetch, token: config.token, signal: input.signal ?? new AbortController().signal };
  const info = await callSlack(session, 'bots.info', { bot: dotBotId });
  const bot = info.bot as Record<string, unknown> | undefined;
  if (typeof bot?.user_id !== 'string' || !isSlackUserId(bot.user_id)) throw new SlackReviewError('slack_unavailable');
  const dotUserId = bot.user_id;
  const oldest = ((input.now?.() ?? new Date()).getTime() - SLACK_HISTORY_WINDOW_MS) / 1000;
  const history = await callSlack(session, 'conversations.history', {
    channel: config.channel_id, oldest: oldest.toFixed(6), limit: String(SLACK_HISTORY_LIMIT),
  });
  let truncated = history.has_more === true;
  const requests = decodeMessages(history).filter(message => isTopLevel(message) && parseReviewRequest(message.text, dotUserId) !== null);
  const threads: SlackReviewThreadV1[] = [];
  for (const request of requests) {
    const replies = request.reply_count > 0 ? await readReplies(session, config.channel_id, request.ts) : [];
    if (replies === null) { truncated = true; continue; }
    const thread = projectReviewThread(request, replies, dotUserId);
    if (thread !== null) threads.push(thread);
  }
  return { threads: threads.sort((a, b) => Number(b.thread_ts) - Number(a.thread_ts)), truncated };
}

export interface SlackReviewCollectorOptions extends SlackReviewReadInput {
  readonly interval_ms?: number;
}

export interface SlackReviewCollectorHandle {
  /** Cache read only; never starts work. */
  readonly read: () => SlackReviewsSnapshotV1;
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/**
 * Collect at start, then every interval after the previous cycle settles. Cycles never overlap.
 * A rate limit keeps the previous threads, marked stale; every other failure replaces them.
 */
export function startSlackReviewCollector(options: SlackReviewCollectorOptions = {}): SlackReviewCollectorHandle {
  let cache: SlackReviewsSnapshotV1 = slackReviewsUnavailable('slack_pending');
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;
  const abort = new AbortController();
  const cycle = (): Promise<void> => {
    inflight = readSlackReviewThreads({ ...options, signal: abort.signal })
      .then(({ threads, truncated }) => {
        if (!closed) cache = { protocol: 1, kind: 'operator_bot_reviews', reason: null, stale: false, truncated, collected_at: (options.now?.() ?? new Date()).toISOString(), threads };
      }, (error: unknown) => {
        if (closed) return;
        const reason = error instanceof SlackReviewError ? error.reason : 'slack_unavailable';
        cache = reason === 'slack_rate_limited' && cache.collected_at !== null
          ? { ...cache, reason, stale: true }
          : slackReviewsUnavailable(reason);
      })
      .finally(() => {
        inflight = null;
        if (closed) return;
        timer = setTimeout(() => { void cycle(); }, options.interval_ms ?? SLACK_REVIEW_INTERVAL_MS);
        timer.unref?.();
      });
    return inflight;
  };
  void cycle();
  return Object.freeze({
    read: () => cache,
    settled: () => inflight ?? Promise.resolve(),
    close: async () => {
      closed = true;
      clearTimeout(timer);
      abort.abort();
      await inflight;
    },
  });
}
