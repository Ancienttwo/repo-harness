import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerBot } from '../../src/effects/bot-registry';
import { readSlackReviewThreads, SLACK_REPLY_LIMIT, startSlackReviewCollector } from '../../src/effects/operator/slack-review-collector';
import { startOperatorServer } from '../../src/effects/operator/server';
import type { SlackReviewThreadV1 } from '../../src/core/operator/slack-review';

const TOKEN = 'xoxb-1111-2222-fixturetokenvalue';
const CHANNEL = 'C0C6C6FHHHT';
const DOT_BOT = 'B0C6243T2KH';
const DOT_USER = 'U0C6B8KFLHH';
const OWNER = 'U0CDWB4NMJP';
const HEAD = '15dbb25919598d0bd16c63f932f2207be9c20e99';
const OTHER_HEAD = 'a'.repeat(40);
const NOW = new Date('2026-11-03T00:00:00.000Z');

// Request text as Slack delivers it: the mention may carry a label and the PR URL is link markup.
const request = (lines: readonly string[], user = DOT_USER) => [`<@${user}|aimpactagent-dot> repo-harness review request`, ...lines, '*Sent using* Claude'].join('\n');
const fields = (pr: number, head = HEAD) => ['repo: Ancienttwo/repo-harness', `pr: <https://github.com/Ancienttwo/repo-harness/pull/${pr}|github.com/Ancienttwo/repo-harness/pull/${pr}>`, `head: ${head}`];
const RESULT_1440 = `repo-harness review result PR #1440 @ ${HEAD}: 1 findings\n\nP3 docs/reference-configs/dot-review-protocol.md:15 — mention order\nFailure: example -&gt; no match\nadvisory: no merge authority`;

type Message = { ts: string; user: string; text: string; thread_ts?: string; reply_count?: number };
const TOKEN_REPO = 'owner/xoxb-111111111111-222222222222-fixturetokenvalue';
const RESULT_HEADER = `repo-harness review result PR #1450 @ ${HEAD}: 0 findings\n`;
// 8194 bytes: the safe `API_KEY: null` becomes the secret-shaped `API_KEY: nu` at the 8 KiB cut.
const RESULT_CUT = `${RESULT_HEADER}${'x'.repeat(8192 - RESULT_HEADER.length - '\nAPI_KEY: nu'.length)}\nAPI_KEY: null`;
type Reply = (url: URL, signal?: AbortSignal) => Response | Promise<Response>;

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function home(options: { readonly config?: unknown; readonly mode?: number; readonly bots?: readonly string[] } = {}): NodeJS.ProcessEnv {
  const root = mkdtempSync(join(tmpdir(), 'rh-slack-review-'));
  roots.push(root);
  const env = { ...process.env, REPO_HARNESS_HOME: root };
  if (options.config !== null) {
    const path = join(root, 'slack.local.json');
    writeFileSync(path, JSON.stringify(options.config ?? { protocol: 1, token: TOKEN, channel_id: CHANNEL }));
    chmodSync(path, options.mode ?? 0o600);
  }
  (options.bots ?? [DOT_BOT]).forEach((slackBotId, index) => registerBot({ bot_id: `bot-${index}`, name: `Bot ${index}`, host: 'chatgpt', slack_bot_id: slackBotId }, env));
  return env;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A Slack Web API double: GET `https://slack.com/api/<method>?…` with a bearer token. */
function slack(history: readonly Message[], threads: Readonly<Record<string, readonly Message[]>>, override?: Reply) {
  const calls: { method: string; params: Record<string, string>; authorization: string | null }[] = [];
  const fetch = async (url: string, init: { readonly headers: Record<string, string>; readonly signal?: AbortSignal }) => {
    const parsed = new URL(url);
    calls.push({ method: parsed.pathname.replace('/api/', ''), params: Object.fromEntries(parsed.searchParams), authorization: init.headers.Authorization ?? null });
    if (override) return override(parsed, init.signal);
    switch (parsed.pathname) {
      case '/api/bots.info': return json({ ok: true, bot: { id: DOT_BOT, user_id: DOT_USER, name: 'aimpactagent-dot' } });
      case '/api/conversations.history': return json({ ok: true, messages: history, has_more: false });
      case '/api/conversations.replies': return json({ ok: true, messages: threads[parsed.searchParams.get('ts')!] ?? [] });
      default: return json({ ok: false, error: 'unknown_method' });
    }
  };
  return { fetch, calls };
}

async function reason(env: NodeJS.ProcessEnv, fetch: ReturnType<typeof slack>['fetch']): Promise<string> {
  const collector = startSlackReviewCollector({ env, fetch, now: () => NOW });
  await collector.settled();
  const snapshot = collector.read();
  await collector.close();
  return snapshot.reason ?? 'none';
}

describe('Dot review collector', () => {
  test('projects every thread state from the dot replies and lists only top-level dot requests', async () => {
    const thread = (ts: string, replies: readonly Message[]) => [{ ts, user: OWNER, text: 'request' }, ...replies.map(reply => ({ ...reply, thread_ts: ts }))];
    const history: Message[] = [
      { ts: '1793615218.236779', user: OWNER, text: request(fields(1440)), reply_count: 2 },
      { ts: '1793615100.000001', user: OWNER, text: request(fields(1441)) },
      { ts: '1793615100.000002', user: OWNER, text: request(fields(1442)), reply_count: 2 },
      { ts: '1793615100.000003', user: OWNER, text: request(fields(1443)), reply_count: 1 },
      { ts: '1793615100.000004', user: OWNER, text: request(fields(1444)), reply_count: 1 },
      { ts: '1793615100.000005', user: OWNER, text: request(fields(1445).slice(0, 2)), reply_count: 1 },
      { ts: '1793615100.000006', user: OWNER, text: request(fields(1446)), reply_count: 1 },
      // Not listed: a mention of another user, a message without the marker, a thread reply and its channel broadcast.
      { ts: '1793615100.000007', user: OWNER, text: request(fields(1447), 'U0C6B9Y1XR9') },
      { ts: '1793615100.000008', user: OWNER, text: `<@${DOT_USER}> please review\n${fields(1448).join('\n')}` },
      { ts: '1793615100.000009', user: OWNER, text: request(fields(1449)), thread_ts: '1793615100.000001' },
      { ts: '1793615100.000010', user: OWNER, text: request([`pr: https://github.com/${TOKEN_REPO}/pull/1`, `head: ${HEAD}`]) },
      { ts: '1793615100.000011', user: OWNER, text: request(fields(1450)), reply_count: 1 },
      { ts: '1793615100.000012', user: OWNER, text: request(fields(1451)), reply_count: 1 },
    ];
    const replies: Record<string, readonly Message[]> = {
      '1793615218.236779': thread('1793615218.236779', [
        { ts: '1793615675.340039', user: DOT_USER, text: `ack ${HEAD}` },
        { ts: '1793615818.279479', user: DOT_USER, text: RESULT_1440 },
      ]),
      '1793615100.000002': thread('1793615100.000002', [
        { ts: '1793615200.000001', user: DOT_USER, text: `ack ${HEAD}` },
        { ts: '1793615200.000002', user: OWNER, text: `repo-harness review result PR #1442 @ ${HEAD}: 0 findings` },
        // A result for another PR with the request head does not count.
        { ts: '1793615200.000007', user: DOT_USER, text: `repo-harness review result PR #999 @ ${HEAD}: 0 findings` },
      ]),
      '1793615100.000003': thread('1793615100.000003', [{ ts: '1793615200.000003', user: DOT_USER, text: 'repo-harness review rejected: the GitHub plugin cannot read the repository' }]),
      '1793615100.000004': thread('1793615100.000004', [{ ts: '1793615200.000004', user: DOT_USER, text: `repo-harness review result PR #1444 @ ${OTHER_HEAD}: 2 findings` }]),
      '1793615100.000005': thread('1793615100.000005', [{ ts: '1793615200.000005', user: DOT_USER, text: 'repo-harness review rejected: head is missing' }]),
      '1793615100.000012': thread('1793615100.000012', [{ ts: '1793615200.000012', user: DOT_USER, text: `repo-harness review result PR #1451 @ ${HEAD}: 1 findings\nP2 src/a.ts:1 — reads /Users/alice/private/customer/repo/src/a.ts:1, see <https://github.com/o/r/blob/x/src/a.ts#L1|L1>` }]),
      '1793615100.000011': thread('1793615100.000011', [{ ts: '1793615200.000011', user: DOT_USER, text: RESULT_CUT }]),
      '1793615100.000006': thread('1793615100.000006', [{ ts: '1793615200.000006', user: DOT_USER, text: `repo-harness review result PR #1446 @ ${HEAD}: 1 findings\nP1 a.ts:1 — token ${TOKEN} in a log` }]),
    };
    const { fetch, calls } = slack(history, replies);
    const { threads, truncated } = await readSlackReviewThreads({ env: home(), fetch, now: () => NOW });
    expect(truncated).toBe(false);

    const row = (pr: number | null, state: string) => threads.find(item => item.state === state && item.pr === pr);
    expect(threads.map(item => [item.pr, item.state, item.finding_count])).toEqual([
      [1440, 'result', 1],
      [1451, 'result', 1],
      [1450, 'result', 0],
      [null, 'request_invalid', null],
      [1446, 'result', 1],
      [1445, 'request_invalid', null],
      [1444, 'head_mismatch', 2],
      [1443, 'rejected', null],
      [1442, 'acknowledged', null],
      [1441, 'waiting', null],
    ]);
    expect(row(1440, 'result')).toEqual({
      thread_ts: '1793615218.236779', requested_at: '2026-11-02T10:26:58.236Z', repo: 'Ancienttwo/repo-harness', pr: 1440, head: HEAD,
      state: 'result', finding_count: 1, replied_at: '2026-11-02T10:36:58.279Z',
      text: { state: 'shown', value: RESULT_1440.replace('-&gt;', '->'), truncated: false },
    } satisfies SlackReviewThreadV1);
    expect(row(1446, 'result')!.text).toEqual({ state: 'text_withheld' });
    expect(row(1445, 'request_invalid')!.text).toEqual({ state: 'shown', value: 'repo-harness review rejected: head is missing', truncated: false });
    expect(row(1441, 'waiting')!.replied_at).toBeNull();
    expect(row(1450, 'result')!.text).toEqual({ state: 'text_withheld' });
    // Local paths and URL tails are masked; repository-relative paths stay.
    expect(row(1451, 'result')!.text).toEqual({ state: 'shown', truncated: false, value: `repo-harness review result PR #1451 @ ${HEAD}: 1 findings\nP2 src/a.ts:1 — reads [private path] see <https:[private path]>` });
    expect(row(null, 'request_invalid')).toMatchObject({ repo: null, pr: null, head: HEAD });
    expect(JSON.stringify(threads)).not.toContain('fixturetokenvalue');
    expect(JSON.stringify(threads)).not.toContain(TOKEN);
    expect(JSON.stringify(threads)).not.toContain(CHANNEL);

    // Only the three read methods, each with the bearer token; replies only for threads that have them.
    expect(new Set(calls.map(call => call.method))).toEqual(new Set(['bots.info', 'conversations.history', 'conversations.replies']));
    expect(calls.every(call => call.authorization === `Bearer ${TOKEN}`)).toBe(true);
    expect(calls.find(call => call.method === 'conversations.history')!.params).toEqual({ channel: CHANNEL, oldest: '1793059200.000000', limit: '200' });
    expect(calls.filter(call => call.method === 'conversations.replies').map(call => call.params.ts).sort()).toEqual(Object.keys(replies).sort());
  });

  test('names every unavailable reason and keeps the previous threads stale on a rate limit', async () => {
    const ok = slack([{ ts: '1793615100.000001', user: OWNER, text: request(fields(1441)) }], {});
    expect(await reason(home({ config: null }), ok.fetch)).toBe('slack_config_missing');
    expect(await reason(home({ mode: 0o644 }), ok.fetch)).toBe('slack_config_invalid');
    expect(await reason(home({ config: { protocol: 1, token: 'xoxp-1111-2222-usertoken', channel_id: CHANNEL } }), ok.fetch)).toBe('slack_config_invalid');
    expect(await reason(home({ bots: [] }), ok.fetch)).toBe('slack_bot_unregistered');
    expect(await reason(home({ bots: [DOT_BOT, 'B0C6C7MM78D'] }), ok.fetch)).toBe('slack_bot_invalid');
    expect(await reason(home(), slack([], {}, () => json({ ok: false, error: 'invalid_auth' })).fetch)).toBe('slack_auth_failed');
    expect(await reason(home(), slack([], {}, () => json({ ok: false, error: 'not_in_channel' })).fetch)).toBe('slack_auth_failed');
    expect(await reason(home(), slack([], {}, () => json({ ok: false, error: 'ratelimited' }, 500)).fetch)).toBe('slack_unavailable');
    expect(await reason(home(), slack([], {}, () => { throw new TypeError('fetch failed'); }).fetch)).toBe('slack_unavailable');
    expect(await reason(home(), slack([], {}, () => json({ ok: true }, 429)).fetch)).toBe('slack_rate_limited');
    expect(await reason(home(), ok.fetch)).toBe('none');

    // Later cycles answer 429: the first cycle's threads stay, marked stale.
    let cycle = 0;
    let secondCycle!: () => void;
    const secondStarted = new Promise<void>(resolve => { secondCycle = resolve; });
    const limited = slack([{ ts: '1793615100.000001', user: OWNER, text: request(fields(1441)) }], {}, (url) => {
      if (url.pathname === '/api/bots.info' && ++cycle >= 2) { secondCycle(); return json({}, 429); }
      return ok.fetch(url.toString(), { headers: {} });
    });
    const collector = startSlackReviewCollector({ env: home(), fetch: limited.fetch, now: () => NOW, interval_ms: 1 });
    expect(collector.read().reason).toBe('slack_pending');
    await secondStarted;
    await collector.settled();
    expect(collector.read()).toMatchObject({ reason: 'slack_rate_limited', stale: true, collected_at: NOW.toISOString(), threads: [{ pr: 1441, state: 'waiting' }] });

    // GET serves the cache through the strict decoder and accepts no query.
    const server = await startOperatorServer({ port: 0, read_bot_reviews: collector.read, env: home() });
    try {
      const response = await fetch(`${server.url}/api/v1/bot-reviews`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ protocol: 1, kind: 'operator_bot_reviews', reason: 'slack_rate_limited', stale: true });
      expect((await fetch(`${server.url}/api/v1/bot-reviews?channel=${CHANNEL}`)).status).toBe(400);
    } finally {
      await collector.close();
      await server.close();
    }
  });

  test('reads every reply page, and marks the snapshot truncated for more history or a thread past the reply cap', async () => {
    const page = (messages: readonly Message[], cursor?: string) => json({ ok: true, messages, has_more: cursor !== undefined, ...(cursor ? { response_metadata: { next_cursor: cursor } } : {}) });
    const parent = (ts: string): Message => ({ ts, user: OWNER, text: 'request', thread_ts: ts });
    const reply = (thread: string, index: number, text: string): Message => ({ ts: `1793615300.${String(index).padStart(6, '0')}`, user: DOT_USER, text, thread_ts: thread });
    const acks = Array.from({ length: SLACK_REPLY_LIMIT }, (_, index) => reply('1793615100.000002', index + 1, `ack ${HEAD}`));
    const { fetch, calls } = slack([], {}, (url) => {
      const ts = url.searchParams.get('ts')!;
      const cursor = url.searchParams.get('cursor');
      if (url.pathname === '/api/bots.info') return json({ ok: true, bot: { id: DOT_BOT, user_id: DOT_USER } });
      if (url.pathname === '/api/conversations.history') {
        return json({ ok: true, has_more: true, messages: [
          { ts: '1793615100.000001', user: OWNER, text: request(fields(1441)), reply_count: 2 },
          { ts: '1793615100.000002', user: OWNER, text: request(fields(1442)), reply_count: SLACK_REPLY_LIMIT + 1 },
        ] });
      }
      // Slack returns replies oldest first; the result is on the second page.
      if (ts === '1793615100.000001') return cursor === null ? page([parent(ts), reply(ts, 900, `ack ${HEAD}`)], 'p2') : page([parent(ts), reply(ts, 901, RESULT_1440.replace('#1440', '#1441'))]);
      return cursor === null ? page([parent(ts), ...acks], 'p2') : page([parent(ts), reply(ts, 902, `ack ${HEAD}`)]);
    });
    const collection = await readSlackReviewThreads({ env: home(), fetch, now: () => NOW });
    expect(collection.truncated).toBe(true);
    expect(collection.threads.map(item => [item.pr, item.state, item.finding_count])).toEqual([[1441, 'result', 1]]);
    expect(calls.filter(call => call.method === 'conversations.replies').map(call => [call.params.ts, call.params.cursor ?? 'first'])).toEqual([
      ['1793615100.000001', 'first'], ['1793615100.000001', 'p2'], ['1793615100.000002', 'first'], ['1793615100.000002', 'p2'],
    ]);
  });

  test('close aborts the request in flight and starts no further Slack request', async () => {
    let started!: () => void;
    const firstReplies = new Promise<void>(resolve => { started = resolve; });
    const ok = slack([
      { ts: '1793615100.000001', user: OWNER, text: request(fields(1441)), reply_count: 1 },
      { ts: '1793615100.000002', user: OWNER, text: request(fields(1442)), reply_count: 1 },
    ], {});
    const { fetch, calls } = slack([], {}, (url, signal) => {
      if (url.pathname !== '/api/conversations.replies') return ok.fetch(url.toString(), { headers: {} });
      started();
      return new Promise<Response>((_, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }));
    });
    const collector = startSlackReviewCollector({ env: home(), fetch, now: () => NOW });
    await firstReplies;
    await collector.close();
    expect(calls.map(call => call.method)).toEqual(['bots.info', 'conversations.history', 'conversations.replies']);
    expect(collector.read().reason).toBe('slack_pending');
  });
});
