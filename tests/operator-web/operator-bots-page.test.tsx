import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { decodeBotAccessSnapshot, type BotAccessSnapshotV1, type OAuthClientProjection } from '../../src/core/operator/bot-access';
import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';
import { OperatorApp, type OperatorAppProps } from '../../src/operator-web/App';
import { fetchBotAccess, tokenLife, type BotAccessRead, type BotAccessReader } from '../../src/operator-web/bots';
import type { OperatorLocale } from '../../src/operator-web/i18n';
import { fixtureProps, FIXTURE_NAMES } from '../../src/operator-web/fixtures';
import { busyBotAccess, degradedBotAccess, EXECUTOR_CLIENT, HERMES_CLIENT } from '../../src/operator-web/fixtures/bots';
import { busyDevActivity } from '../../src/operator-web/fixtures/dev-activity';
import { stableSnapshot } from '../../src/operator-web/fixture';
import { parseWorkspaceLocation, workspaceHash } from '../../src/operator-web/workspace-location';

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

/** A copy of a fixture with one change, typed loosely so a change can also break the contract. */
function edited(snapshot: BotAccessSnapshotV1, change: (raw: Record<string, any>) => void): BotAccessSnapshotV1 {
  const raw = structuredClone(snapshot) as unknown as Record<string, any>;
  change(raw);
  return raw as unknown as BotAccessSnapshotV1;
}

function props(readBotAccess: BotAccessReader, locale: OperatorLocale = 'en'): OperatorAppProps {
  return {
    initialLocale: locale, initialSnapshot: stableSnapshot, fetchSnapshot: async () => stableSnapshot,
    initialDevActivity: activity, fetchDevActivity: async () => activity,
    initialRuntimeOverlay: unavailableRuntimeOverlay(), readRuntimeStatus: async () => unavailableRuntimeOverlay(),
    readNotifyStatus: () => new Promise(() => {}),
    readBotAccess,
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
    const panes = (read: BotAccessRead) => {
      if (read.state !== 'ok') return read.reason;
      const { herdr } = read.snapshot;
      return herdr.state !== 'ok' ? herdr.reason : herdr.snapshot.state === 'ok' ? 'ok' : herdr.snapshot.reason;
    };
    expect(reads.map(panes)).toEqual(['ok', 'bot_access_pending', 'herdr_version_mismatch']);
  });
});

describe('navigation', () => {
  test('#bots is the last Setup page and refuses a parameter', async () => {
    expect(parseWorkspaceLocation('#bots')).toEqual({ workspace: 'bots', module: null, item: null });
    expect(workspaceHash({ workspace: 'bots', module: null, item: null })).toBe('#bots');
    expect(parseWorkspaceLocation('#bots/hermes').workspace).toBe('home');
    await mount('', props(serve(ok(busyBotAccess(NOW)))));
    const setup = all('[aria-labelledby="nav-group-setup"] a[data-workspace]').map(link => link.getAttribute('data-workspace'));
    expect(setup.at(-1)).toBe('bots');
    expect(setup.slice(setup.indexOf('hooks'), setup.indexOf('hooks') + 3)).toEqual(['hooks', 'cli', 'bots']);
    await act(async () => navLink('bots').click());
    expect(window.location.hash).toBe('#bots');
    expect(navLink('bots').getAttribute('aria-current')).toBe('page');
    expect(page()).not.toBeNull();
  });

  test('the Bot access snapshot is read only while the Bots page shows, once on each return', async () => {
    let reads = 0;
    await mount('', props(async () => { reads++; return ok(busyBotAccess(NOW)); }));
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
  });
});

describe('Bots page', () => {
  test('1-BOTS-P1 one section per path; each MCP client names its Bot, profile and token days, each repository its mode and last call', async () => {
    await mount('#bots', props(serve(ok(busyBotAccess(NOW)))));
    expect(all('[data-bots-section]').map(element => element.getAttribute('data-bots-section'))).toEqual(['mcp', 'notify', 'herdr']);
    const mcp = section('mcp');
    expect(mcp.querySelector('[data-mcp-status]')?.getAttribute('data-mcp-status')).toBe('ready_user');
    const clients = all('[data-oauth-client]', mcp);
    expect(clients.map(row => row.getAttribute('data-oauth-client'))).toEqual([HERMES_CLIENT, EXECUTOR_CLIENT, 'c0ffee00-1234-4abc-9def-0123456789ab']);
    expect(clients.map(row => row.querySelector('[data-bot]')?.textContent)).toEqual(['Hermes', 'Unregistered', 'Unregistered']);
    expect(clients.map(row => row.querySelector('[data-token]')?.textContent)).toEqual(['token 21d left', 'token 1d left', 'no live token']);
    expect(clients[0]!.textContent).toContain('planner');
    expect(clients[1]!.textContent).toContain('executor');
    expect(commands(mcp)).toEqual([
      `repo-harness mcp clients revoke ${HERMES_CLIENT}`,
      `repo-harness mcp clients revoke ${EXECUTOR_CLIENT}`,
      'repo-harness mcp clients revoke c0ffee00-1234-4abc-9def-0123456789ab',
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

  test('1-BOTS-P1 notify lists every channel with its newest delivery; herdr lists each agent pane with its Bot', async () => {
    await mount('#bots', props(serve(ok(busyBotAccess(NOW)))));
    const notify = section('notify');
    expect(notify.querySelector('[data-notify]')?.getAttribute('data-notify')).toBe('enabled');
    expect(all('[data-notify-channel]', notify).map(row => [row.getAttribute('data-notify-channel'), row.getAttribute('data-configured'), row.getAttribute('data-delivery')])).toEqual([
      ['webhook', 'true', 'succeeded'], ['slack', 'true', 'failed'], ['discord', 'false', 'missing'], ['telegram', 'false', 'missing'],
    ]);
    // An unconfigured channel with no delivery says only that.
    expect(notify.querySelector('[data-notify-channel="discord"]')?.textContent).toBe('Discordnot configured');
    expect(commands(notify)).toEqual([]);
    const herdr = section('herdr');
    expect(herdr.querySelector('[data-herdr-server]')?.textContent).toBe('Server running · session main');
    expect(herdr.querySelector('[data-herdr-version]')?.textContent).toBe('Version 0.9.5, as expected');
    expect(herdr.textContent).toContain('2 workspaces · 5 tabs · 7 panes');
    const agents = all('[data-herdr-agent]', herdr);
    expect(agents.map(row => [row.getAttribute('data-herdr-agent'), row.getAttribute('data-agent-status'), row.querySelector('[data-bot]')?.textContent])).toEqual([
      ['w1:p1', 'idle', 'Hermes'], ['w2:p1', 'working', 'Unregistered'], ['w2:p2', 'blocked', 'Unregistered'],
    ]);
    expect(agents[1]!.textContent).toContain('Codex');
    expect(commands(herdr)).toEqual([]);
  });

  test('1-BOTS-F1 a newer local herdr shows the expected and the actual version and marks pane state unavailable, never "not connected"', async () => {
    for (const [locale, words, unavailable] of [
      ['zh', '期望 0.9.5（schema 2ecf19a9），实际 0.9.3', '不可用'],
      ['en', 'Expected 0.9.5 (schema 2ecf19a9), actual 0.9.3', 'unavailable'],
    ] as const) {
      await remount('#bots', props(serve(ok(degradedBotAccess(NOW))), locale));
      const herdr = section('herdr');
      expect(herdr.querySelector('[data-herdr-server]')?.getAttribute('data-herdr-server')).toBe('running');
      expect(herdr.querySelector('[data-herdr-version="mismatch"]')?.textContent).toBe(words);
      expect(herdr.querySelector('[data-herdr-panes="herdr_version_mismatch"]')?.textContent).toContain(unavailable);
      expect(herdr.textContent).not.toMatch(/没连上|未连接|not connected/iu);
    }
    // Equal version names with another protocol carry the protocols, so the two sides never read the same.
    const protocolOnly = edited(degradedBotAccess(NOW), raw => { raw.herdr.status.value.server.version.actual = { version: '0.9.5', protocol: 23 }; });
    await remount('#bots', props(serve(ok(protocolOnly))));
    expect(section('herdr').querySelector('[data-herdr-version="mismatch"]')?.textContent).toBe('Expected 0.9.5 protocol 22 (schema 2ecf19a9), actual 0.9.5 protocol 23');
  });

  test('1-BOTS-N1 the fixtures show no token, passphrase, webhook URL or absolute path, and every control only copies a command', async () => {
    const attributes = (scope: Element) => [scope, ...scope.querySelectorAll('*')]
      .filter(element => element.namespaceURI === 'http://www.w3.org/1999/xhtml')
      .flatMap(element => Array.from(element.attributes).filter(attribute => attribute.name !== 'class').map(attribute => attribute.value));
    for (const fixture of [busyBotAccess, degradedBotAccess]) {
      for (const locale of ['en', 'zh'] as const) {
        await remount('#bots', props(serve(ok(fixture(NOW))), locale));
        const scope = document.querySelector('main')!;
        const shown = [scope.textContent ?? '', freshness()?.textContent ?? '', ...attributes(scope)].join('\n');
        expect(shown).not.toMatch(/[a-z][a-z0-9+.-]*:\/\//iu);
        expect(shown).not.toMatch(/(?:^|[\s"'(=])(?:~?\/[\w.-]|[A-Za-z]:\\)/u);
        expect(shown).not.toMatch(/passphrase|口令|token\s*[=:]|bearer\s+\S{8}/iu);
        expect(all('button', page()).every(button => button.classList.contains('copy-value__button'))).toBe(true);
        expect(page().querySelector('input, select, textarea, form, [contenteditable]')).toBeNull();
        expect(commands(page()).every(command => command?.startsWith('repo-harness ') && !/--(?:webhook-url|webhook-key|slack-webhook-url|discord-webhook-url|telegram-bot-token)\b/u.test(command))).toBe(true);
      }
    }
  });

  test('1-BOTS-N1 a response with any field outside the snapshot contract is refused, and none of its values render', async () => {
    const poison = (change: (raw: Record<string, any>) => void) => edited(busyBotAccess(NOW), change);
    const responses = [
      poison(raw => { raw.oauth.clients[0].access_token = 'rh_at_SECRET_ACCESS'; }),
      poison(raw => { raw.notify.status.webhook_url = 'https://hooks.slack.com/services/T000/B000/SECRET_HOOK'; }),
      poison(raw => { raw.mcp.doctor.passphrase = 'SECRET_PASSPHRASE'; }),
      poison(raw => { raw.herdr.socket = '/private/tmp/herdr-SECRET.sock'; }),
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

  test('degraded sections each say what failed: a failed mcp doctor gives its command, Bot unknown is not unregistered, and a disabled plugin gives the install command for its session', async () => {
    await mount('#bots', props(serve(ok(degradedBotAccess(NOW)))));
    const mcp = section('mcp');
    expect(mcp.querySelector('[data-mcp-status]')?.textContent).toBe('mcp doctor timed out.');
    expect(commands(mcp)).toEqual([
      'repo-harness mcp doctor',
      `repo-harness mcp clients revoke ${EXECUTOR_CLIENT}`,
      'repo-harness mcp access set --repo <repo-path> --mode read_only|read_write',
    ]);
    expect(all('[data-oauth-client] [data-bot]', mcp).map(name => [name.getAttribute('data-bot'), name.textContent])).toEqual([['unknown', 'Bot unknown']]);
    expect(mcp.textContent).toContain('Unreadable client records, not listed: 1');
    expect(all('[data-last-call]', mcp).map(call => call.getAttribute('data-last-call'))).toEqual(['audit_unreadable', 'failed']);
    expect(all('[data-last-call="failed"] [data-bot]', mcp).map(name => name.textContent)).toEqual(['Bot unknown']);
    const notify = section('notify');
    expect(notify.querySelector('[data-notify]')?.textContent).toBe('Notify plugin is off (install link: linked, plugin: disabled)');
    expect(commands(notify)).toEqual(['repo-harness herdr notify install --session main']);

    // Without an install record the session is unknown, so the command keeps its placeholder.
    const fresh = busyBotAccess(NOW);
    await remount('#bots', props(serve(ok({ ...fresh, herdr: { state: 'unavailable', reason: 'notify_session_missing' }, notify: { state: 'unavailable', reason: 'notify_session_missing' } }))));
    expect(commands(section('notify'))).toEqual(['repo-harness herdr notify install --session <session>']);
    expect(commands(section('herdr'))).toEqual(['repo-harness herdr notify install --session <session>']);
    expect(section('herdr').querySelector('[data-herdr-server]')?.getAttribute('data-herdr-server')).toBe('notify_session_missing');
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
    expect(all('[data-bots-section]')).toHaveLength(3);
    expect(page().textContent).toContain('Refresh failed');
    expect(freshness()?.getAttribute('data-freshness')).toBe('refresh-failed');
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

  test('token days count whole days of the last live grant; a client without a profile holds no live token', () => {
    const client = (profiles: readonly string[], expires: number | null): OAuthClientProjection => ({
      client_id: HERMES_CLIENT, bot: { state: 'unregistered' }, issued_at: null, profiles, expires_at: expires === null ? null : new Date(expires).toISOString(),
    });
    expect(tokenLife(client([], NOW + 86_400_000), NOW)).toEqual({ kind: 'none' });
    expect(tokenLife(client(['planner'], null), NOW)).toEqual({ kind: 'unknown' });
    expect(tokenLife(client(['planner'], NOW - 1), NOW)).toEqual({ kind: 'expired' });
    expect(tokenLife(client(['planner'], NOW + 86_399_999), NOW)).toEqual({ kind: 'days', days: 0 });
    expect(tokenLife(client(['planner'], NOW + 30 * 86_400_000), NOW)).toEqual({ kind: 'days', days: 30 });
  });
});
