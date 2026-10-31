import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { AGENT_RUNTIME_CAPABILITIES, decodeAgentsSettings, type AgentsSettingsV1 } from '../../src/core/operator/agents-settings';
import { isReviewRuntimeId } from '../../src/core/review/review-runtimes';
import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';
import { OperatorApp, type OperatorAppProps } from '../../src/operator-web/App';
import type { OperatorLocale } from '../../src/operator-web/i18n';
import { fixtureProps, FIXTURE_NAMES } from '../../src/operator-web/fixtures';
import { busyDevActivity } from '../../src/operator-web/fixtures/dev-activity';
import { agentsSettingsFixture } from '../../src/operator-web/fixtures/settings';
import { stableSnapshot } from '../../src/operator-web/fixture';
import {
  fetchAgentsSettings,
  postAgentsSettings,
  type AgentsSettingsPost,
  type AgentsSettingsRead,
  type AgentsSettingsWrite,
} from '../../src/operator-web/settings';

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
const REVISION_A = `sha256:${'a'.repeat(64)}`;
const REVISION_B = `sha256:${'b'.repeat(64)}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const entry = (id: string, installation: Record<string, unknown>, group = 'default') => ({
  id, group, installation, review_supported: isReviewRuntimeId(id), docs_supported: false, capabilities: AGENT_RUNTIME_CAPABILITIES,
});

/**
 * claude is on for review; codex and kimi are installed and off; grok is not installed. No runtime reports
 * docs support: the launch allowlist is empty, so the docs use and default are not offered (#1234).
 */
function settings(config: Partial<AgentsSettingsV1['config']> = {}, extra: readonly Record<string, unknown>[] = []): AgentsSettingsV1 {
  return decodeAgentsSettings({
    protocol: 1, kind: 'operator_agents_settings',
    config: { revision: REVISION_A, enabled: ['claude'], uses: { docs: [], review: ['claude'] }, default_docs: null, ...config },
    runtimes: {
      status: 'ready', reason: null, collected_at: new Date(NOW - 120_000).toISOString(),
      entries: [
        entry('claude', { kind: 'available', via: 'executable', version: '2.1.3' }),
        entry('codex', { kind: 'available', via: 'executable', version: '0.71.0' }),
        entry('grok', { kind: 'not_found' }),
        entry('kimi', { kind: 'available', via: 'executable', version: null }),
        entry('cursor', { kind: 'dependency_missing', package: '@cursor/sdk' }, 'host_dependency'),
        ...extra,
      ],
    },
  });
}

/** A route stand-in: reads return the current value, writes return the queued outcomes in order. */
function server(initial: AgentsSettingsV1, outcomes: AgentsSettingsWrite[]) {
  let current: AgentsSettingsRead = { state: 'ok', settings: initial };
  const posts: AgentsSettingsPost[] = [];
  let reads = 0;
  return {
    posts,
    reads: () => reads,
    set(next: AgentsSettingsRead) { current = next; },
    read: async (): Promise<AgentsSettingsRead> => { reads += 1; return current; },
    write: async (body: AgentsSettingsPost): Promise<AgentsSettingsWrite> => {
      posts.push(body);
      const outcome = outcomes.shift();
      if (!outcome) throw new Error('unexpected write');
      return outcome;
    },
  };
}

function props(route: ReturnType<typeof server>, locale: OperatorLocale = 'en'): OperatorAppProps {
  return {
    initialLocale: locale, initialSnapshot: stableSnapshot, fetchSnapshot: async () => stableSnapshot,
    initialDevActivity: activity, fetchDevActivity: async () => activity,
    initialRuntimeOverlay: unavailableRuntimeOverlay(), readRuntimeStatus: async () => unavailableRuntimeOverlay(),
    readNotifyStatus: () => new Promise(() => {}),
    readAgentsSettings: route.read, writeAgentsSettings: route.write,
  };
}

async function mount(appProps: OperatorAppProps, hash = '#settings'): Promise<void> {
  window.location.hash = hash;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<OperatorApp {...appProps} />));
  await settle();
}

const settle = () => act(async () => { for (let turn = 0; turn < 6; turn++) await Promise.resolve(); });
const all = (selector: string, scope: ParentNode = document) => Array.from(scope.querySelectorAll<HTMLElement>(selector));
const row = (id: string) => document.querySelector<HTMLElement>(`[data-runtime="${id}"]`)!;
const toggle = (id: string) => row(id).querySelector<HTMLButtonElement>(`[aria-label="Enable ${id}"], [aria-label="启用 ${id}"]`);
const use = (id: string, name: 'docs' | 'review') => row(id).querySelector<HTMLButtonElement>(`[data-use="${name}"]`)!;
const saveButton = () => document.querySelector<HTMLButtonElement>('[data-save]')!;
const result = () => document.querySelector<HTMLElement>('[data-save-result]');
const buttonWithText = (label: string) => all('button').find(button => button.textContent?.trim() === label)!;
const click = async (element: HTMLElement) => { await act(async () => element.click()); await settle(); };

beforeEach(() => installDom());
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  window.happyDOM.abort();
});

describe('settings page', () => {
  test('3-SET-P1 enabling codex for review sends one request and offers no docs use or default', async () => {
    const route = server(settings(), [{ state: 'saved', result: { config_revision: REVISION_B, changed_keys: ['agents.enabled', 'agents.uses.review'] } }]);
    await mount(props(route));
    expect(saveButton().disabled).toBe(true);
    // No runtime is docs-supported, so the docs use and the default docs control are absent.
    expect(all('[data-use="docs"]')).toEqual([]);
    expect(document.querySelector('[data-default-docs]')).toBeNull();
    await click(toggle('codex')!);
    await click(use('codex', 'review'));
    await click(saveButton());
    expect(route.posts).toHaveLength(1);
    const { request_id, ...body } = route.posts[0]!;
    expect(request_id).toMatch(UUID);
    expect(body).toEqual({ expected_revision: REVISION_A, changes: [{ runtime: 'codex', enabled: true, uses: ['review'] }] });
    expect(result()?.getAttribute('data-save-result')).toBe('saved');
    expect(result()?.textContent).toContain('2 settings changed');
    // Saved means nothing is left to send.
    expect(saveButton().disabled).toBe(true);
  });

  test('3-SET-N1 the form has no credential input, offers review only on supported runtimes, hides docs and gives no switch to an agent that is not installed', async () => {
    await mount(props(server(settings({ enabled: ['claude', 'codex', 'kimi'] }), [])));
    // The switches carry their own checkbox inputs; nothing takes typed text.
    expect(all('input').map(input => input.getAttribute('type')).filter(type => type !== 'radio' && type !== 'checkbox')).toEqual([]);
    expect(all('textarea, select, [contenteditable]')).toHaveLength(0);
    // The settings response reports no docs-supported runtime, so no row offers the docs use or the default.
    expect(all('[data-use="docs"]')).toEqual([]);
    expect(all('[data-default-docs]')).toEqual([]);
    expect(row('kimi').querySelector('[data-use-reasons]')?.textContent).toBe('Only claude, codex and pi can review.');
    await click(use('codex', 'review'));
    expect(use('codex', 'review').getAttribute('aria-pressed')).toBe('true');
    expect(row('codex').querySelector('[data-use-reasons]')).toBeNull();
    expect(use('claude', 'review').disabled).toBe(false);
    expect(use('kimi', 'review').disabled).toBe(true);
    expect(use('kimi', 'review').title).toBe('Only claude, codex and pi can review.');
    expect(toggle('grok')).toBeNull();
    expect(row('grok').textContent).toContain('No executable found');
    expect(row('cursor').closest('[data-runtime-group]')?.getAttribute('data-runtime-group')).toBe('settings-group-extra');
    expect(row('cursor').textContent).toContain('@cursor/sdk');
    expect(all('[data-capabilities]').map(line => line.textContent)).toEqual(['Every agent can stop a turn · steer depends on the session · withdrawing a queued message depends on the session']);
  });

  test('Pi review fixture offers the review use and saves it without changing the docs default', async () => {
    const route = server(settings({}, [entry('pi', { kind: 'available', via: 'bundled', version: null })]),
      [{ state: 'saved', result: { config_revision: REVISION_B, changed_keys: ['agents.enabled', 'agents.uses.review'] } }]);
    await mount(props(route));
    await click(toggle('pi')!);
    expect(use('pi', 'review').disabled).toBe(false);
    await click(use('pi', 'review')); await click(saveButton());
    expect(route.posts).toHaveLength(1);
    expect(route.posts[0]!.changes).toEqual([{ runtime: 'pi', enabled: true, uses: ['review'] }]);
    expect(route.posts[0]!.default_docs_runtime).toBeUndefined();
    expect(agentsSettingsFixture(NOW, 'busy').runtimes.entries.find(entry => entry.id === 'pi')?.review_supported).toBe(true);
  });

  test('3-SET-F1 a stale revision asks for a reload, sends nothing more, and the reload starts from the new section', async () => {
    const route = server(settings(), [{ state: 'refused', status: 409, error: { code: 'revision_conflict', message: 'The configuration changed after it was read.', next_action: 'Reload the settings, then apply your change again.' } }]);
    await mount(props(route));
    await click(use('claude', 'review'));
    await click(saveButton());
    expect(result()?.getAttribute('data-save-result')).toBe('revision_conflict');
    expect(result()?.textContent).toContain('The settings changed after this page read them. Nothing was saved.');
    expect(saveButton().disabled).toBe(true);
    expect(toggle('codex')!.disabled).toBe(true);
    route.set({ state: 'ok', settings: settings({ revision: REVISION_B, enabled: ['claude', 'codex'], uses: { docs: [], review: ['codex'] } }) });
    await click(buttonWithText('Reload settings'));
    expect(route.posts).toHaveLength(1);
    expect(result()).toBeNull();
    expect(use('claude', 'review').getAttribute('aria-pressed')).toBe('false');
    expect(use('codex', 'review').getAttribute('aria-pressed')).toBe('true');
  });

  test('3-SET-F2 an unwritable audit log shows the reason, and the retry sends the same request_id', async () => {
    const route = server(settings(), [
      { state: 'refused', status: 503, error: { code: 'audit_unavailable', message: 'The operator audit log is unavailable. Nothing was changed.', next_action: 'Check the operator audit log, then retry with the same request_id.' } },
      { state: 'saved', result: { config_revision: REVISION_B, changed_keys: ['agents.uses.review'] } },
    ]);
    await mount(props(route));
    await click(use('claude', 'review'));
    await click(saveButton());
    expect(result()?.getAttribute('data-save-result')).toBe('audit_unavailable');
    expect(result()?.textContent).toContain('The operator audit log cannot be written, so the change was not run.');
    await click(saveButton());
    expect(route.posts.map(post => post.request_id)).toEqual([route.posts[0]!.request_id, route.posts[0]!.request_id]);
    expect(result()?.getAttribute('data-save-result')).toBe('saved');
  });

  test('reconcile_required shows 待核对, locks the form and never resends; a reload unlocks it', async () => {
    const route = server(settings(), [{ state: 'refused', status: 409, error: { code: 'reconcile_required', message: 'The action may have run, but its result is not recorded.', next_action: 'Check the target state before you retry. Do not send the request again with a new request_id.' } }]);
    await mount(props(route, 'zh'));
    await click(use('claude', 'review'));
    await click(saveButton());
    expect(result()?.getAttribute('data-save-result')).toBe('reconcile_required');
    expect(result()?.textContent).toContain('待核对');
    expect(document.querySelectorAll('p p, p div')).toHaveLength(0);
    expect(saveButton().disabled).toBe(true);
    expect(use('claude', 'review').disabled).toBe(true);
    await click(saveButton());
    expect(route.posts).toHaveLength(1);
    await click(buttonWithText('重新加载设置'));
    expect(result()).toBeNull();
    expect(use('claude', 'review').disabled).toBe(false);
    expect(route.posts).toHaveLength(1);
  });

  test('an unanswered save resends the same request_id, and a changed draft gets a new one', async () => {
    const route = server(settings(), [{ state: 'unreachable' }, { state: 'unreachable' }, { state: 'unreachable' }]);
    await mount(props(route));
    await click(use('claude', 'review'));
    await click(saveButton());
    expect(result()?.getAttribute('data-save-result')).toBe('unreachable');
    await click(saveButton());
    // A different draft: turning the runtime off is not the review change the banner promised to resend.
    await click(toggle('claude')!);
    expect(result()).toBeNull();
    await click(saveButton());
    const [first, second, third] = route.posts.map(post => post.request_id);
    expect(second).toBe(first);
    expect(third).not.toBe(first);
    expect(route.posts[2]).toMatchObject({ changes: [{ runtime: 'claude', enabled: false, uses: [] }] });
  });

  test('a runtime that left the runtime list can only be turned off, and turning it off clears its uses', async () => {
    const route = server(settings({ enabled: ['claude', 'gemini'], uses: { docs: [], review: ['claude'] } }),
      [{ state: 'saved', result: { config_revision: REVISION_B, changed_keys: ['agents.enabled'] } }]);
    await mount(props(route));
    expect(row('gemini').closest('[data-runtime-group]')?.getAttribute('data-runtime-group')).toBe('settings-group-missing');
    expect(use('gemini', 'review').disabled).toBe(true);
    await click(toggle('gemini')!);
    expect(toggle('gemini')).toBeNull();
    await click(saveButton());
    expect(route.posts[0]).toMatchObject({ changes: [{ runtime: 'gemini', enabled: false, uses: [] }] });
    expect(route.posts[0]!.default_docs_runtime).toBeUndefined();
  });

  test('a newer read keeps the unsaved draft and warns that the settings changed elsewhere', async () => {
    const route = server(settings(), []);
    await mount(props(route));
    await click(use('claude', 'review'));
    route.set({ state: 'ok', settings: settings({ revision: REVISION_B, enabled: ['claude', 'codex'], uses: { docs: [], review: ['claude', 'codex'] } }) });
    await click(buttonWithText('Refresh'));
    expect(use('claude', 'review').getAttribute('aria-pressed')).toBe('false');
    expect(toggle('codex')!.getAttribute('aria-checked')).toBe('false');
    expect(result()?.getAttribute('data-save-result')).toBe('changed-elsewhere');
    await click(buttonWithText('Discard changes'));
    await click(buttonWithText('Refresh'));
    expect(result()).toBeNull();
    expect(use('codex', 'review').getAttribute('aria-pressed')).toBe('true');
  });

  test('without a finished probe or with an invalid section the page shows why and offers no form', async () => {
    const pending = decodeAgentsSettings({ ...settings(), runtimes: { status: 'unavailable', reason: 'collection_pending', collected_at: null, entries: [] } });
    await mount(props(server(pending, [])));
    expect(document.querySelector('[data-runtimes="collection_pending"]')).not.toBeNull();
    expect(document.querySelector('[data-save]')).toBeNull();
    expect(document.querySelector('[data-freshness-source="settings"]')?.textContent).toBe('Installed agents not detected yet');
    await act(async () => root?.unmount());
    root = null;
    const route = server(settings(), []);
    route.set({ state: 'unavailable', reason: 'config_invalid' });
    await mount(props(route));
    expect(document.querySelector('[data-settings-unavailable="config_invalid"]')?.textContent).toContain('~/.repo-harness/config.json');
    expect(document.querySelector('[data-runtime]')).toBeNull();
  });

  test('a stale probe still edits, with its age and the failed detection named', async () => {
    const route = server(agentsSettingsFixture(NOW, 'degraded'), []);
    await mount(props(route));
    expect(document.querySelector('[data-runtimes="stale"]')?.textContent).toContain('The last detection timed out.');
    expect(document.querySelector('[data-freshness-source="settings"]')?.getAttribute('data-freshness')).toBe('stale');
    expect(toggle('codex')!.disabled).toBe(false);
  });

  test.each(['en', 'zh'] as const)('the rail and the System page name Settings as the one page that writes in %s', async locale => {
    await mount(props(server(settings(), []), locale), '#system');
    expect(document.querySelector('[data-operator-status]')?.textContent).toContain('read-only except Settings');
    expect(document.body.textContent).toContain(locale === 'en' ? 'It is read-only except the Settings page' : '除了设置页和 Worktree 页，它是只读的。');
  });

  test.each([...FIXTURE_NAMES])('the %s fixture renders the page and reads only the settings route', async name => {
    await mount(fixtureProps(name));
    expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe('settings');
    expect(document.querySelector('.workspace-nav a[data-workspace="settings"]')?.getAttribute('aria-current')).toBe('page');
    expect(document.querySelector('[data-freshness-source="settings"]')).not.toBeNull();
  });
});

describe('settings transport', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  function stub(respond: () => Response | Promise<Response>): { calls: { url: string; init: RequestInit | undefined }[] } {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => { calls.push({ url: String(url), init }); return respond(); }) as typeof fetch;
    return { calls };
  }
  const body: AgentsSettingsPost = { request_id: '00000000-0000-4000-8000-000000000001', expected_revision: 'absent', changes: [{ runtime: 'codex', enabled: true, uses: [] }] };

  test('POST sends JSON with the same-origin cookie and maps every answer to one outcome', async () => {
    const { calls } = stub(() => new Response(JSON.stringify({ config_revision: REVISION_B, changed_keys: ['agents.enabled'] }), { status: 200 }));
    expect(await postAgentsSettings(body)).toEqual({ state: 'saved', result: { config_revision: REVISION_B, changed_keys: ['agents.enabled'] } });
    expect(calls[0]!.url).toBe('/api/v1/settings/agents');
    expect(calls[0]!.init).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual(body);

    stub(() => new Response(JSON.stringify({ error: { code: 'busy', message: 'Another write to this target is running.', next_action: 'Wait.' } }), { status: 503 }));
    expect(await postAgentsSettings(body)).toEqual({ state: 'refused', status: 503, error: { code: 'busy', message: 'Another write to this target is running.', next_action: 'Wait.' } });
    stub(() => new Response('bad gateway', { status: 502 }));
    expect(await postAgentsSettings(body)).toEqual({ state: 'unreachable' });
    stub(() => { throw new TypeError('network'); });
    expect(await postAgentsSettings(body)).toEqual({ state: 'unreachable' });
    stub(() => new Response(JSON.stringify({ config_revision: 'nope', changed_keys: [] }), { status: 200 }));
    expect(await postAgentsSettings(body)).toEqual({ state: 'unreadable' });
  });

  test('GET names an invalid section, a payload that fails the decoder, and an unreachable service', async () => {
    const signal = new AbortController().signal;
    stub(() => new Response(JSON.stringify({ error: { code: 'config_invalid', message: 'x', next_action: 'y' } }), { status: 503 }));
    expect(await fetchAgentsSettings(signal)).toEqual({ state: 'unavailable', reason: 'config_invalid' });
    stub(() => new Response(JSON.stringify({ protocol: 1 }), { status: 200 }));
    expect(await fetchAgentsSettings(signal)).toEqual({ state: 'unavailable', reason: 'settings_invalid' });
    stub(() => { throw new TypeError('network'); });
    expect(await fetchAgentsSettings(signal)).toEqual({ state: 'unavailable', reason: 'unreachable' });
  });
});
