import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { decodeBotAccessSnapshot, type BotAccessSnapshotV1 } from '../../src/core/operator/bot-access';
import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';
import { OperatorApp, type OperatorAppProps } from '../../src/operator-web/App';
import { decodeSlackReviews, SLACK_REVIEW_REASONS, slackReviewsUnavailable, type SlackReviewsSnapshotV1 } from '../../src/core/operator/slack-review';
import { fetchBotAccess, fetchBotReviews, type BotAccessRead, type BotAccessReader, type BotReviewsRead, type BotReviewsReader } from '../../src/operator-web/bots';
import type { OperatorLocale } from '../../src/operator-web/i18n';
import { fixtureProps, FIXTURE_NAMES } from '../../src/operator-web/fixtures';
import { busyBotAccess, busyBotReviews, degradedBotAccess, degradedBotReviews } from '../../src/operator-web/fixtures/bots';
import { busyDevActivity } from '../../src/operator-web/fixtures/dev-activity';
import { registryOf } from '../../src/operator-web/fixtures';

const REGISTRY = registryOf(['repo-harness', 'repo-console']);
import { DEFAULT_LOCATION, parseWorkspaceLocation, workspaceHash } from '../../src/operator-web/workspace-location';

let root: Root | null = null;
let window: Window;

function installDom(url = 'http://127.0.0.1:4318/'): void {
  window = new Window({ url });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({ matches: false, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true }),
  });
  Object.assign(globalThis, {
    window, document: window.document, navigator: window.navigator, localStorage: window.localStorage,
    HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, Event: window.Event,
    MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true,
  });
}

const NOW = Date.now();
const activity = decodeDevActivitySnapshot(busyDevActivity(NOW));
const ok = (snapshot: BotAccessSnapshotV1): BotAccessRead => ({ state: 'ok', snapshot: decodeBotAccessSnapshot(snapshot) });
const serve = (read: BotAccessRead): BotAccessReader => async () => read;
const reviews = (snapshot: SlackReviewsSnapshotV1): BotReviewsReader => async () => ({ state: 'ok', snapshot: decodeSlackReviews(snapshot) });

/** A copy of a fixture with one change, typed loosely so a change can also break the contract. */
function edited(snapshot: BotAccessSnapshotV1, change: (raw: Record<string, any>) => void): BotAccessSnapshotV1 {
  const raw = structuredClone(snapshot) as unknown as Record<string, any>;
  change(raw);
  return raw as unknown as BotAccessSnapshotV1;
}

function props(readBotAccess: BotAccessReader, locale: OperatorLocale = 'en', readBotReviews: BotReviewsReader = reviews(busyBotReviews(NOW))): OperatorAppProps {
  return {
    initialLocale: locale, initialRepositories: REGISTRY, readRepositories: async () => REGISTRY,
    initialDevActivity: activity, fetchDevActivity: async () => activity,
    initialRuntimeOverlay: unavailableRuntimeOverlay(), readRuntimeStatus: async () => unavailableRuntimeOverlay(),
    readNotifyStatus: () => new Promise(() => {}),
    readBotAccess, readBotReviews,
  };
}

async function mount(hash: string, appProps: OperatorAppProps): Promise<void> {
  window.location.hash = hash;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<OperatorApp {...appProps} />));
  await settle();
}

async function remount(hash: string, appProps: OperatorAppProps): Promise<void> {
  await act(async () => root?.unmount());
  root = null;
  window.happyDOM.abort();
  installDom();
  await mount(hash, appProps);
}

/** Lets the Bot access read that resolves after the first render commit. */
const settle = () => act(async () => { for (let turn = 0; turn < 5; turn++) await Promise.resolve(); });
const page = () => document.querySelector<HTMLElement>('[data-bots-page]')!;
const section = (name: string) => document.querySelector<HTMLElement>(`[data-bots-section="${name}"]`)!;
const all = (selector: string, scope: ParentNode = document) => Array.from(scope.querySelectorAll<HTMLElement>(selector));
const HC_REPAIR = ['hc update --version 0.1.20', 'hc server restart'];
const commands = (scope: ParentNode = document) => all('[data-command] code', scope).map(code => code.textContent);
const freshness = () => document.querySelector<HTMLElement>('[data-freshness-source="bots"]');
const navLink = (workspace: string) => document.querySelector<HTMLAnchorElement>(`.workspace-nav a[data-workspace="${workspace}"]`)!;

beforeEach(() => installDom());
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  window.happyDOM.abort();
});

describe('bots fixtures', () => {
  test('every named fixture serves the Bots page through the browser decoder', async () => {
    const reads = await Promise.all(FIXTURE_NAMES.map(name => fixtureProps(name).readBotAccess!(new AbortController().signal)));
    const terminals = (read: BotAccessRead) => {
      if (read.state !== 'ok') return read.reason;
      const { hc } = read.snapshot;
      return hc.state !== 'ok' ? hc.reason : hc.terminals.state === 'ok' ? 'ok' : hc.terminals.reason;
    };
    expect(reads.map(terminals)).toEqual(['ok', 'bot_access_pending', 'hc_version_mismatch']);
    const reviewReads = await Promise.all(FIXTURE_NAMES.map(name => fixtureProps(name).readBotReviews!(new AbortController().signal)));
    expect(reviewReads.map(read => read.state === 'ok' ? [read.snapshot.reason, read.snapshot.threads.length] : read.reason)).toEqual([[null, 6], ['slack_pending', 0], ['slack_rate_limited', 6]]);
  });
});

describe('navigation', () => {
  test('#bots is the last Setup page and refuses a parameter', async () => {
    expect(parseWorkspaceLocation('#bots')).toEqual({ workspace: 'bots', module: null, item: null });
    expect(workspaceHash({ workspace: 'bots', module: null, item: null })).toBe('#bots');
    expect(parseWorkspaceLocation('#bots/hermes')).toEqual(DEFAULT_LOCATION);
    await mount('', props(serve(ok(busyBotAccess(NOW)))));
    const setup = all('[aria-labelledby="nav-group-setup"] a[data-workspace]').map(link => link.getAttribute('data-workspace'));
    expect(setup.at(-1)).toBe('bots');
    expect(setup.slice(setup.indexOf('hooks'), setup.indexOf('hooks') + 3)).toEqual(['hooks', 'cli', 'bots']);
    await act(async () => navLink('bots').click());
    expect(window.location.hash).toBe('#bots');
    expect(navLink('bots').getAttribute('aria-current')).toBe('page');
    expect(page()).not.toBeNull();
  });

  test('the Bot access snapshot is read only while the Bots or Board page shows, once on each return', async () => {
    let reads = 0;
    await mount('#home', props(async () => { reads++; return ok(busyBotAccess(NOW)); }));
    expect(reads).toBe(0);
    await act(async () => navLink('bots').click());
    await settle();
    expect(reads).toBe(1);
    expect(page().getAttribute('data-bots-page')).toBe('ready');
    await act(async () => navLink('system').click());
    expect(reads).toBe(1);
    await act(async () => navLink('bots').click());
    await settle();
    expect(reads).toBe(2);
    await act(async () => navLink('system').click());
    await act(async () => navLink('board').click());
    await settle();
    expect(reads).toBe(3);
  });
});

describe('Bots page', () => {
  test('1-BOTS-P1 one section per path; each repository names its mode and last call', async () => {
    await mount('#bots', props(serve(ok(busyBotAccess(NOW)))));
    expect(all('[data-bots-section]').map(element => element.getAttribute('data-bots-section'))).toEqual(['mcp', 'notify', 'hc', 'reviews']);
    const mcp = section('mcp');
    expect(mcp.querySelector('[data-mcp-status]')?.getAttribute('data-mcp-status')).toBe('ready_user');
    expect(commands(mcp)).toEqual([
      'repo-harness mcp access set --repo <repo-path> --mode read_only|read_write',
    ]);
    const repositories = all('[data-registry-repo]', mcp);
    expect(repositories.map(row => row.getAttribute('data-access-mode'))).toEqual(['read_write', 'read_only', 'read_only']);
    expect(repositories.map(row => row.querySelector('[data-last-call]')?.getAttribute('data-last-call'))).toEqual(['ok', 'blocked', 'missing']);
    expect(repositories.map(row => row.textContent)).toEqual([
      expect.stringMatching(/^repo-harnessread and writeLast callwrite_plan· ok· 12m ago ·Hermes$/u),
      expect.stringMatching(/^operator-siteread onlyLast callwrite_prd· blocked· 3h ago ·Unregistered$/u),
      'field-notesread onlyNo MCP calls recorded',
    ]);
  });

  test('1-BOTS-P1 notify lists every channel with its newest delivery; hc lists each task terminal with its status', async () => {
    await mount('#bots', props(serve(ok(busyBotAccess(NOW)))));
    const notify = section('notify');
    expect(notify.querySelector('[data-notify]')?.getAttribute('data-notify')).toBe('live');
    expect(all('[data-notify-channel]', notify).map(row => [row.getAttribute('data-notify-channel'), row.getAttribute('data-configured'), row.getAttribute('data-delivery')])).toEqual([
      ['webhook', 'true', 'succeeded'], ['slack', 'true', 'failed'], ['discord', 'false', 'missing'], ['telegram', 'false', 'missing'],
    ]);
    // An unconfigured channel with no delivery says only that.
    expect(notify.querySelector('[data-notify-channel="discord"]')?.textContent).toBe('Discordnot configured');
    expect(commands(notify)).toEqual([]);
    const hc = section('hc');
    expect(hc.querySelector('[data-hc-version]')?.textContent).toBe('hc 0.1.20 · compatible (needs 0.1.20 or later)');
    expect(hc.querySelector('[data-herdr-app]')?.textContent).toBe('Herdr.app · no version pin yet');
    const terminals = all('[data-hc-terminal]', hc);
    expect(terminals.map(row => [row.getAttribute('data-hc-terminal'), row.getAttribute('data-terminal-status')])).toEqual([
      ['t12', 'working'], ['t1b', 'blocked'], ['t7', 'unknown'],
    ]);
    expect(terminals[0]!.textContent).toBe('workingt12task-1f0c2a9e4b7d3c5a8e61');
    expect(commands(hc)).toEqual([]);
  });

  test('1-BOTS-F1 an hc core below the pin shows the expected and the actual version, the repair commands in order and no terminal state, never "not connected"', async () => {
    for (const [locale, words, repair, unavailable] of [
      ['zh', 'hc core 0.1.15 · 版本过低：需要 0.1.20 或更高，终端状态暂不可读', '如果 hc --version 低于 0.1.20，运行第一条命令，它会重启 core；否则运行第二条命令。', '暂不可读'],
      ['en', 'hc core 0.1.15 · too old: needs 0.1.20 or later. Terminal state is not read.', 'If hc --version is below 0.1.20, run the first command. It restarts the core. If not, run the second command.', 'not read'],
    ] as const) {
      await remount('#bots', props(serve(ok(degradedBotAccess(NOW))), locale));
      const hc = section('hc');
      expect(hc.querySelector('[data-hc-version="mismatch"]')?.textContent).toBe(words);
      expect(hc.querySelector('[data-hc-repair]')?.textContent).toBe(repair);
      expect(commands(hc)).toEqual(HC_REPAIR);
      expect(hc.textContent).toContain(unavailable);
      expect(all('[data-hc-terminal]', hc)).toEqual([]);
      expect(hc.textContent).not.toMatch(/没连上|未连接|not connected|找不到/iu);
    }
    // A missing hc is its own state, not a version mismatch.
    await remount('#bots', props(serve(ok({ ...busyBotAccess(NOW), hc: { state: 'unavailable', reason: 'hc_missing' } }))));
    expect(section('hc').querySelector('[data-hc]')?.textContent).toBe('hc was not found. Agents cannot be started.');
  });

  test('1-BOTS-N1 the fixtures show no token, passphrase, webhook URL or absolute path, and every control only copies a command', async () => {
    const attributes = (scope: Element) => [scope, ...scope.querySelectorAll('*')]
      .filter(element => element.namespaceURI === 'http://www.w3.org/1999/xhtml')
      .flatMap(element => Array.from(element.attributes).filter(attribute => attribute.name !== 'class').map(attribute => attribute.value));
    for (const [fixture, reviewFixture] of [[busyBotAccess, busyBotReviews], [degradedBotAccess, degradedBotReviews]] as const) {
      for (const locale of ['en', 'zh'] as const) {
        await remount('#bots', props(serve(ok(fixture(NOW))), locale, reviews(reviewFixture(NOW))));
        const scope = document.querySelector('main')!;
        // The one URL the page shows is a Dot review row's GitHub PR link.
        const prLinks = all('[data-review-thread] a[href]', scope).map(link => link.getAttribute('href'));
        expect(prLinks.length).toBeGreaterThan(0);
        expect(prLinks.every(href => /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/u.test(href ?? ''))).toBe(true);
        const shown = [scope.textContent ?? '', freshness()?.textContent ?? '', ...attributes(scope).filter(value => !prLinks.includes(value))].join('\n');
        expect(shown).not.toMatch(/[a-z][a-z0-9+.-]*:\/\//iu);
        expect(shown).not.toMatch(/(?:^|[\s"'(=])(?:~?\/[\w.-]|[A-Za-z]:\\)/u);
        expect(shown).not.toMatch(/passphrase|口令|token\s*[=:]|bearer\s+\S{8}/iu);
        expect(all('button', page()).every(button => button.classList.contains('copy-value__button'))).toBe(true);
        expect(page().querySelector('input, select, textarea, form, [contenteditable]')).toBeNull();
        // The hc repair commands of a core below the pin are the only commands outside repo-harness.
        expect(commands(page()).every(command => (command?.startsWith('repo-harness ') || HC_REPAIR.includes(command ?? '')) && !/--(?:webhook-url|webhook-key|slack-webhook-url|discord-webhook-url|telegram-bot-token)\b/u.test(command ?? ''))).toBe(true);
      }
    }
  });

  test('1-BOTS-N1 a response with any field outside the snapshot contract is refused, and none of its values render', async () => {
    const poison = (change: (raw: Record<string, any>) => void) => edited(busyBotAccess(NOW), change);
    const responses = [
      poison(raw => { raw.notify.status.webhook_url = 'https://hooks.slack.com/services/T000/B000/SECRET_HOOK'; }),
      poison(raw => { raw.mcp.doctor.passphrase = 'SECRET_PASSPHRASE'; }),
      poison(raw => { raw.hc.socket = '/private/tmp/hc-SECRET.sock'; }),
      poison(raw => { raw.hc.terminals.value[0].cwd = '/Users/someone/SECRET_REPO'; }),
      poison(raw => { raw.registry.repos[0].label = '/Users/someone/SECRET_REPO'; }),
    ];
    const original = globalThis.fetch;
    let next = 0;
    globalThis.fetch = (async () => Response.json(responses[next++ % responses.length])) as unknown as typeof fetch;
    try {
      for (const _ of responses) expect(await fetchBotAccess(new AbortController().signal)).toEqual({ state: 'unavailable', reason: 'bot_access_invalid' });
      next = 0;
      await remount('#bots', props(fetchBotAccess));
      expect(page().getAttribute('data-bots-page')).toBe('failed');
      expect(page().getAttribute('data-bots-reason')).toBe('bot_access_invalid');
      expect(document.body.innerHTML).not.toMatch(/SECRET|hooks\.slack\.com|\/Users\/someone/u);
    } finally { globalThis.fetch = original; }
  });

  test('degraded sections each say what failed: a failed mcp doctor gives its command, Bot unknown is not unregistered, and a stopped relay gives the one restart command', async () => {
    await mount('#bots', props(serve(ok(degradedBotAccess(NOW)))));
    const mcp = section('mcp');
    expect(mcp.querySelector('[data-mcp-status]')?.textContent).toBe('mcp doctor timed out.');
    expect(commands(mcp)).toEqual([
      'repo-harness mcp doctor',
      'repo-harness mcp access set --repo <repo-path> --mode read_only|read_write',
    ]);
    expect(all('[data-last-call]', mcp).map(call => call.getAttribute('data-last-call'))).toEqual(['audit_unreadable', 'failed']);
    expect(all('[data-last-call="failed"] [data-bot]', mcp).map(name => name.textContent)).toEqual(['Bot unknown']);
    const notify = section('notify');
    expect(notify.querySelector('[data-notify]')?.getAttribute('data-notify')).toBe('relay_stopped');
    expect(notify.querySelector('[data-notify]')?.textContent).toBe('Notifications are paused. Start the relay again in a terminal:');
    expect(commands(notify)).toEqual(['repo-harness herdr notify start']);
    expect(all('[data-notify-channel]', notify)).toEqual([]);

    // Without an install record the relay is not installed, so the command is install.
    const fresh = busyBotAccess(NOW);
    await remount('#bots', props(serve(ok({ ...fresh, notify: { state: 'unavailable', reason: 'notify_session_missing' } }))));
    expect(commands(section('notify'))).toEqual(['repo-harness herdr notify install']);
  });

  test('the first collection is a wait, a refused read names its reason, and a failed refresh keeps the last snapshot', async () => {
    await mount('#bots', props(serve({ state: 'unavailable', reason: 'bot_access_pending' })));
    expect(page().getAttribute('data-bots-page')).toBe('pending');
    expect(freshness()?.textContent).toContain('Reading Bot access…');

    await remount('#bots', props(serve({ state: 'unavailable', reason: 'bot_access_unavailable' })));
    expect(page().getAttribute('data-bots-page')).toBe('failed');
    expect(page().textContent).toContain('Restart repo-harness operator serve.');
    expect(freshness()?.getAttribute('data-freshness')).toBe('failed');

    const answers: BotAccessRead[] = [ok(busyBotAccess(NOW)), { state: 'unavailable', reason: 'unreachable' }];
    await remount('#bots', props(async () => answers.shift()!));
    expect(page().getAttribute('data-bots-page')).toBe('ready');
    expect(freshness()?.textContent).toMatch(/^Bot access collected \d+s ago$/u);
    await act(async () => all('.operator-header button').find(button => button.textContent === 'Refresh')!.click());
    await settle();
    expect(page().getAttribute('data-bots-page')).toBe('refresh-failed');
    expect(all('[data-bots-section]')).toHaveLength(4);
    expect(page().textContent).toContain('Refresh failed');
    expect(freshness()?.getAttribute('data-freshness')).toBe('refresh-failed');
  });
});

describe('Dot reviews', () => {
  test('one row per thread with PR link, short head, state, finding count and age; a row opens the result text', async () => {
    await mount('#bots', props(serve(ok(busyBotAccess(NOW)))));
    const rows = all('[data-review-thread]', section('reviews'));
    expect(rows.map(row => [row.getAttribute('data-review-state'), row.querySelector('a')?.textContent ?? null, row.querySelector('code')?.textContent ?? null,
      row.querySelector('[data-review-findings]')?.getAttribute('data-review-findings') ?? null])).toEqual([
      ['waiting', 'Ancienttwo/repo-harness#1450', '7c41e0a', null],
      ['acknowledged', 'Ancienttwo/repo-harness#1449', 'a3f9c2d', null],
      ['result', 'Ancienttwo/repo-harness#1440', '15dbb25', '1'],
      ['head_mismatch', 'Ancienttwo/repo-harness#1438', 'a3f9c2d', '0'],
      ['rejected', 'Ancienttwo/repo-harness#1436', '7c41e0a', null],
      ['request_invalid', null, null, null],
    ]);
    const result = rows[2]!;
    expect(result.querySelector('a')?.getAttribute('href')).toBe('https://github.com/Ancienttwo/repo-harness/pull/1440');
    expect(result.querySelector('summary')?.textContent).toMatch(/^result· 1 findingAncienttwo\/repo-harness#1440 *15dbb253h ago$/u);
    const details = result.querySelector('details')!;
    expect(details.open).toBe(false);
    await act(async () => result.querySelector<HTMLElement>('summary')!.click());
    expect(details.open).toBe(true);
    expect(result.querySelector('[data-review-text="shown"] pre')?.textContent).toContain('P2 docs/reference-configs/dot-review-protocol.md:41');
    expect(rows[4]!.querySelector('[data-review-text]')?.getAttribute('data-review-text')).toBe('text_withheld');
    expect(rows[5]!.querySelector('summary')?.textContent).toContain('No valid PR or head');
    expect(section('reviews').querySelector('[data-reviews-truncated]')).toBeNull();
  });

  test('each unavailable reason shows by name; a rate limit keeps the last threads marked stale', async () => {
    for (const reason of SLACK_REVIEW_REASONS.filter(reason => reason !== 'slack_rate_limited')) {
      await remount('#bots', props(serve(ok(busyBotAccess(NOW))), 'en', reviews(slackReviewsUnavailable(reason))));
      const reviewsSection = section('reviews');
      expect([reviewsSection.querySelector('[data-reviews]')?.getAttribute('data-reviews'), all('[data-review-thread]', reviewsSection).length]).toEqual([reason, 0]);
    }
    await remount('#bots', props(serve(ok(busyBotAccess(NOW))), 'zh', reviews(slackReviewsUnavailable('slack_bot_invalid'))));
    expect(section('reviews').textContent).toContain('有多个 Bot 带 Slack bot ID');
    await remount('#bots', props(serve(ok(busyBotAccess(NOW))), 'en', reviews(degradedBotReviews(NOW))));
    const stale = section('reviews');
    expect(stale.querySelector('[data-reviews]')?.getAttribute('data-reviews')).toBe('slack_rate_limited');
    expect(stale.querySelector('[data-reviews-stale]')?.textContent).toBe('Showing threads collected 7m ago.');
    expect(stale.querySelector('[data-reviews-truncated]')?.textContent).toContain('Incomplete list');
    expect(all('[data-review-thread]', stale)).toHaveLength(6);
    // A failed read of the route names its own reason and never hides the Bot access sections.
    for (const reason of ['bot_reviews_invalid', 'unreachable'] as const) {
      await remount('#bots', props(serve(ok(busyBotAccess(NOW))), 'en', async () => ({ state: 'unavailable', reason })));
      expect(section('reviews').querySelector('[data-reviews]')?.getAttribute('data-reviews')).toBe(reason);
      expect(all('[data-bots-section]')).toHaveLength(4);
    }
  });
});

describe('Bot access reader', () => {
  test('keeps each route refusal and maps any other answer to a reason, never to an empty page', async () => {
    const refusal = (code: string, status: number) => () => Response.json({ error: { code, message: 'refused', next_action: 'retry' } }, { status });
    const answers: (() => Response)[] = [
      () => Response.json(busyBotAccess(NOW)),
      refusal('bot_access_pending', 503),
      refusal('bot_access_unavailable', 503),
      refusal('bot_access_invalid', 503),
      refusal('invalid_request', 400),
      refusal('a_code_from_a_newer_server', 503),
      () => new Response('<html>proxy error</html>', { status: 502 }),
      () => { throw new TypeError('connection refused'); },
    ];
    const original = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (url: unknown, options?: RequestInit) => {
      requests.push(`${options?.method ?? 'GET'} ${String(url)}`);
      return answers[requests.length - 1]!();
    }) as unknown as typeof fetch;
    try {
      const results = [];
      for (const _ of answers) results.push(await fetchBotAccess(new AbortController().signal));
      expect(results.map(result => result.state === 'ok' ? result.snapshot.kind : result.reason)).toEqual([
        'operator_bot_access', 'bot_access_pending', 'bot_access_unavailable', 'bot_access_invalid', 'unreachable', 'unreachable', 'unreachable', 'unreachable',
      ]);
      expect(new Set(requests)).toEqual(new Set(['GET /api/v1/bot-access']));
    } finally { globalThis.fetch = original; }
  });
});

describe('Dot review reader', () => {
  test('decodes the snapshot strictly and maps any other answer to a read reason', async () => {
    const withText = (text: unknown) => { const raw = structuredClone(busyBotReviews(NOW)) as unknown as Record<string, any>; raw.threads[2].text = text; return raw; };
    const answers: (() => Response)[] = [
      () => Response.json(busyBotReviews(NOW)),
      () => Response.json(slackReviewsUnavailable('slack_auth_failed')),
      () => Response.json(withText({ state: 'shown', truncated: false, value: 'token xoxb-1234567890-abcdefghijkl' })),
      () => Response.json({ ...busyBotReviews(NOW), channel_id: 'C0SECRET' }),
      () => Response.json({ error: { code: 'bot_reviews_invalid', message: 'refused', next_action: 'retry' } }, { status: 503 }),
      () => Response.json({ error: { code: 'invalid_request', message: 'refused', next_action: 'retry' } }, { status: 400 }),
      () => { throw new TypeError('connection refused'); },
    ];
    const original = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (url: unknown, options?: RequestInit) => {
      requests.push(`${options?.method ?? 'GET'} ${String(url)}`);
      return answers[requests.length - 1]!();
    }) as unknown as typeof fetch;
    try {
      const results: BotReviewsRead[] = [];
      for (const _ of answers) results.push(await fetchBotReviews(new AbortController().signal));
      expect(results.map(result => result.state === 'ok' ? result.snapshot.reason ?? 'current' : result.reason)).toEqual([
        'current', 'slack_auth_failed', 'bot_reviews_invalid', 'bot_reviews_invalid', 'bot_reviews_invalid', 'unreachable', 'unreachable',
      ]);
      expect(new Set(requests)).toEqual(new Set(['GET /api/v1/bot-reviews']));
    } finally { globalThis.fetch = original; }
  });
});
