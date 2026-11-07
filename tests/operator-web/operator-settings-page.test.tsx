import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { AGENT_RUNTIME_CAPABILITIES, decodeAgentsSettings, type AgentsSettingsV1 } from '../../src/core/board/agents-settings';
import { isReviewRuntimeId } from '../../src/core/review/review-runtimes';
import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';
import { OperatorApp, type OperatorAppProps } from '../../src/operator-web/App';
import type { OperatorLocale } from '../../src/operator-web/i18n';
import { fixtureProps, FIXTURE_NAMES } from '../../src/operator-web/fixtures';
import { busyDevActivity } from '../../src/operator-web/fixtures/dev-activity';
import { agentsSettingsFixture, settingsStores } from '../../src/operator-web/fixtures/settings';
import type { SeatsSettingsRequestV1 } from '../../src/core/board/seats-settings';
import { registryOf } from '../../src/operator-web/fixtures';

const REGISTRY = registryOf(['repo-harness', 'repo-console']);
import {
  fetchAgentsSettings,
  postAgentsSettings,
  type AgentsSettingsPost,
  type AgentsSettingsRead,
  type AgentsSettingsWrite,
} from '../../src/operator-web/settings';
import type { DocumentationLanguage, LanguageRead, ReportingHost, ReportingPreset } from '../../src/operator-web/language-settings';
import { fetchQuota } from '../../src/operator-web/quota';
import { busyQuota } from '../../src/operator-web/fixtures/quota';

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
    initialLocale: locale, initialRepositories: REGISTRY, readRepositories: async () => REGISTRY,
    initialDevActivity: activity, fetchDevActivity: async () => activity,
    initialRuntimeOverlay: unavailableRuntimeOverlay(), readRuntimeStatus: async () => unavailableRuntimeOverlay(),
    readNotifyStatus: () => new Promise(() => {}),
    readAgentsSettings: route.read, writeAgentsSettings: route.write,
    // The setup check stays pending, so every runtime shows in the agent settings list below Hosts.
    readSetup: () => new Promise(() => {}), readSeatsSettings: () => new Promise(() => {}), readQuota: () => new Promise(() => {}),
  };
}

async function mount(appProps: OperatorAppProps, hash = '#agents'): Promise<void> {
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
const saveButton = () => document.querySelector<HTMLButtonElement>('[data-save="agents"]')!;
const seatsSave = () => document.querySelector<HTMLButtonElement>('[data-save="seats"]')!;
const result = () => document.querySelector<HTMLElement>('[data-save-result]');
const buttonWithText = (label: string) => all('button').find(button => button.textContent?.trim() === label)!;
const click = async (element: HTMLElement) => { await act(async () => element.click()); await settle(); };

beforeEach(() => installDom());
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  window.happyDOM.abort();
});

describe('agents page seats section', () => {
  /** The busy fixture's read; writes are recorded and answered as saved. */
  function seatsProps(posts: (SeatsSettingsRequestV1 & { readonly request_id: string })[]): OperatorAppProps {
    return {
      ...props(server(settings(), [])),
      readSeatsSettings: settingsStores(NOW, 'busy').seats.read,
      writeSeatsSettings: async (body) => { posts.push(body); return { state: 'saved', result: { config_revision: REVISION_B, changed_keys: ['seats.advisor.fleet'] } }; },
    };
  }
  const allow = (label: string) => document.querySelector<HTMLButtonElement>(`[aria-label="Allow ${label}"]`)!;
  const pane = (seat: string) => document.querySelector<HTMLButtonElement>(`[data-pane="${seat}"]`)!;
  const levels = () => [...document.querySelectorAll('[data-seat-card] [data-limit]')].map(node => node.getAttribute('data-limit'));

  test('the advisor cannot take a writable role, edit or GitHub writes; save sends the whole section and leaves running panes alone', async () => {
    const posts: (SeatsSettingsRequestV1 & { readonly request_id: string })[] = [];
    await mount(seatsProps(posts));
    expect(document.querySelector('[data-seat-card]')?.getAttribute('data-seat-card')).toBe('advisor');
    for (const label of ['fast-worker', 'deep-worker', 'Edit files', 'GitHub writes']) expect([label, allow(label).disabled]).toEqual([label, true]);
    // The levels are those of buildSeatLaunch (#1531): Claude advisor with shell on, tasks, edit and gh off.
    expect(levels()).toEqual(['common_commands', 'enforced', 'common_commands', 'named_types_only']);
    expect(document.querySelector('[data-seat-launch]')?.textContent).toContain('--argv "$(repo-harness seats argv advisor --repository-id <repository-id>)"');
    // The page shows no running pane count: the operator cannot read hc (#1413).
    expect(document.querySelector('[data-seats-page]')?.textContent).not.toMatch(/running \d|\d+ running/u);
    await click(allow('gatekeeper'));
    await click(seatsSave());
    expect(posts).toHaveLength(1);
    const { request_id, expected_revision, seats } = posts[0]!;
    expect(request_id).toMatch(UUID);
    expect(expected_revision).toMatch(/^sha256:/u);
    expect(seats.advisor.fleet).toEqual(['deep-reasoner', 'explorer', 'gatekeeper']);
    expect(Object.keys(seats)).toEqual(['orchestrator', 'advisor', 'worker']);
    expect(document.querySelector('[data-seats-saved]')?.textContent).toContain('Running panes do not change');

    await click(pane('orchestrator'));
    expect([allow('explorer').disabled, allow('fast-worker').disabled]).toEqual([false, true]);
    expect(allow('Edit files').disabled).toBe(true);
  });

  test('a stored advisor role outside the range can be switched off and saved, and cannot be switched back on', async () => {
    const posts: (SeatsSettingsRequestV1 & { readonly request_id: string })[] = [];
    const read = await settingsStores(NOW, 'busy').seats.read();
    if (read.state !== 'ok') throw new Error('fixture read failed');
    const stored = { ...read.settings, config: { ...read.settings.config, advisor: { ...read.settings.config.advisor, fleet: ['explorer', 'fast-worker'] } } };
    await mount({ ...seatsProps(posts), readSeatsSettings: async () => ({ state: 'ok', settings: stored }) });
    expect([allow('fast-worker').disabled, allow('fast-worker').getAttribute('aria-checked')]).toEqual([false, 'true']);
    await click(allow('fast-worker'));
    expect(allow('fast-worker').disabled).toBe(true);
    await click(seatsSave());
    expect(posts[0]!.seats.advisor.fleet).toEqual(['explorer']);
  });

  const choices = () => all('[data-seat-card] [role="group"][aria-label="Runtime"] button').map(button => button.textContent);
  const inPlace = (runtime: string) => document.querySelector<HTMLButtonElement>(`[data-runtime-enable="${runtime}"] [aria-label="Enable ${runtime}"]`);

  test('the runtime choice offers only enabled runtimes; Pi is enabled in place, saved under Hosts, then a seat moves to Pi and saves against the fixture server', async () => {
    const stores = settingsStores(NOW, 'busy');
    const posts: (SeatsSettingsRequestV1 & { readonly request_id: string })[] = [];
    await mount({ ...props(server(settings(), [])), readAgentsSettings: stores.agents.read, writeAgentsSettings: stores.agents.write,
      readSeatsSettings: stores.seats.read, writeSeatsSettings: async (body) => { posts.push(body); return stores.seats.write(body); } });
    expect(choices()).toEqual(['Claude Code', 'Codex']);
    // An edited seat draft before the Hosts save: it must move to the new revision, not meet a conflict.
    await click(allow('gatekeeper'));
    await click(inPlace('pi')!);
    // The in-place switch is the Hosts switch on the same draft; Pi is a choice only after the Hosts save.
    expect(toggle('pi')!.getAttribute('aria-checked')).toBe('true');
    expect(choices()).toEqual(['Claude Code', 'Codex']);
    await click(saveButton());
    await settle();
    expect(choices()).toEqual(['Claude Code', 'Codex', 'Pi']);
    expect(inPlace('pi')).toBeNull();
    expect(allow('gatekeeper').getAttribute('aria-checked')).toBe('true');
    // Codex: the sandbox blocks edit, but an MCP path stays open; tasks, gh and the fleet are instructions only.
    await click(buttonWithText('Codex'));
    expect(levels()).toEqual(['common_commands', 'instructions_only', 'instructions_only', 'instructions_only']);
    await click(buttonWithText('Pi'));
    expect(levels()).toEqual(['instructions_only', 'instructions_only', 'instructions_only']);
    expect(allow('explorer').disabled).toBe(true);
    expect((buttonWithText('max') as HTMLButtonElement).disabled).toBe(true);
    // An agents draft edited before the seats save moves to the seats revision the same way.
    await click(use('codex', 'review'));
    await click(seatsSave());
    await settle();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.seats.advisor).toMatchObject({ runtime: 'pi', model: null, effort: null, fleet: [] });
    expect(document.querySelector('[data-seats-saved]')).not.toBeNull();
    await click(saveButton());
    expect(result()?.getAttribute('data-save-result')).toBe('saved');
    const read = await stores.agents.read();
    expect(read.state === 'ok' && read.settings.config).toMatchObject({ enabled: ['claude', 'codex', 'pi'], uses: { review: ['claude'] } });
  });

  test('a seat on a runtime that is not enabled keeps Save off and shows the Hosts switch in place of the choice', async () => {
    const posts: (SeatsSettingsRequestV1 & { readonly request_id: string })[] = [];
    // degraded: agents.enabled is claude and gemini; the stored worker runs on codex.
    const stores = settingsStores(NOW, 'degraded');
    await mount({ ...props(server(settings(), [])), readAgentsSettings: stores.agents.read,
      readSeatsSettings: stores.seats.read, writeSeatsSettings: async (body) => { posts.push(body); return stores.seats.write(body); } });
    await click(pane('worker'));
    expect(choices()).toEqual(['Claude Code']);
    expect(inPlace('codex')!.getAttribute('aria-checked')).toBe('false');
    await click(allow('gatekeeper'));
    expect(seatsSave().disabled).toBe(true);
    await click(seatsSave());
    expect(posts).toHaveLength(0);
  });
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
    expect(document.querySelector('[data-save="agents"]')).toBeNull();
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
    expect(toggle('codex')!.disabled).toBe(false);
  });

  test.each(['en', 'zh'] as const)('the rail and the System page name the Agents page as the page that writes settings in %s', async locale => {
    await mount(props(server(settings(), []), locale), '#system');
    expect(document.querySelector('[data-operator-status]')?.textContent).toContain('read-only except Agents');
    expect(document.body.textContent).toContain(locale === 'en' ? 'It is read-only except the Agents page' : '除了 Agents 页和 Worktree 页，它是只读的。');
  });

  test.each([...FIXTURE_NAMES])('the %s fixture renders Hosts, Subagents, Seats and Quota in that order on the Agents page', async name => {
    await mount(fixtureProps(name));
    await settle();
    expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe('agents');
    expect(document.querySelector('.workspace-nav a[data-workspace="agents"]')?.getAttribute('aria-current')).toBe('page');
    // empty: the setup check has not finished, so the Subagents list waits for it.
    expect(all('main h2[id]').map(heading => heading.id).filter(id => ['setup-hosts-heading', 'setup-fleet-heading', 'agents-seats-heading', 'agents-quota-heading'].includes(id)))
      .toEqual(name === 'empty' ? ['setup-hosts-heading', 'agents-seats-heading', 'agents-quota-heading'] : ['setup-hosts-heading', 'setup-fleet-heading', 'agents-seats-heading', 'agents-quota-heading']);
    expect(document.querySelector('[data-agents-section="seats"] [data-seats-page]')).not.toBeNull();
  });
});

describe('language controls', () => {
  const host = (name: string, preset: ReportingHost['preset'], state = 'managed-current'): ReportingHost => ({ host: name, state, preset });
  const refused = (code: string, next_action: string) => ({ state: 'refused' as const, status: 409, error: { code, message: 'Server text.', next_action } });
  const pressed = (scope: string) => all('[data-language-option]', document.querySelector(scope)!).filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.dataset.languageOption);

  test('a recorded custom reporting preset shows as current, and picking a preset writes it and reads the hosts again', async () => {
    let hosts = [host('claude', 'custom'), host('codex', 'custom')];
    const writes: unknown[] = [];
    await mount({
      ...props(server(settings(), [])),
      readReportingLanguage: async (): Promise<LanguageRead<readonly ReportingHost[]>> => ({ state: 'ok', value: hosts }),
      writeReportingLanguage: async (preset: ReportingPreset, request_id: string) => {
        writes.push({ preset, request_id });
        hosts = hosts.map(entry => host(entry.host, preset));
        return { state: 'ok', value: { changed_hosts: ['claude', 'codex'] } };
      },
    });
    expect(pressed('[data-language-control="report"]')).toEqual([]);
    expect(document.querySelector('[data-language-current="custom"]')).not.toBeNull();
    expect(all('[data-language-host]').map(item => item.dataset.languageHost)).toEqual(['claude', 'codex']);
    await click(document.querySelector<HTMLElement>('[data-language-control="report"] [data-language-option="en"]')!);
    expect(writes).toEqual([{ preset: 'en', request_id: expect.stringMatching(UUID) }]);
    expect(document.querySelector('[data-language-control="report"] [data-save-result]')?.getAttribute('data-save-result')).toBe('saved');
    expect(pressed('[data-language-control="report"]')).toEqual(['en']);
    expect(document.querySelector('[data-language-current="custom"]')).toBeNull();
  });

  test('a refused reporting save names the host state and the route next action', async () => {
    const hosts = [host('claude', 'follow'), host('codex', null, 'unbalanced')];
    await mount({
      ...props(server(settings(), [])),
      readReportingLanguage: async (): Promise<LanguageRead<readonly ReportingHost[]>> => ({ state: 'ok', value: hosts }),
      writeReportingLanguage: async () => refused('report_language_refused', 'Repair the reported rules file or path, then save the reporting language again.'),
    });
    await click(document.querySelector<HTMLElement>('[data-language-control="report"] [data-language-option="zh-CN"]')!);
    expect(document.querySelector('[data-language-host="codex"]')?.getAttribute('data-language-host-state')).toBe('unbalanced');
    const banner = document.querySelector('[data-language-control="report"] [data-save-result="report_language_refused"]')!;
    expect(banner.textContent).toContain('Repair the file named in the host list');
  });

  test('the repository documentation language loads, saves and shows the init command for a missing policy', async () => {
    const writes: unknown[] = [];
    let stored: DocumentationLanguage = 'follow-user';
    await mount({
      ...props(server(settings(), [])),
      readDocumentationLanguage: id => async (): Promise<LanguageRead<DocumentationLanguage | null>> => (id === REGISTRY.repositories[1]!.repository_id
        ? { state: 'refused', error: { code: 'policy_missing', message: 'Server text.', next_action: 'repo-harness init' } } : { state: 'ok', value: stored }),
      writeDocumentationLanguage: id => async (language, request_id) => {
        writes.push({ id, language, request_id });
        stored = language;
        return { state: 'ok', value: { language } };
      },
    }, '#repositories');
    const first = REGISTRY.repositories[0]!.repository_id;
    const control = (id: string) => `[data-repository-language="${id}"]`;
    expect(pressed(control(first))).toEqual(['follow-user']);
    await click(document.querySelector<HTMLElement>(`${control(first)} [data-language-option="zh-CN"]`)!);
    expect(writes).toEqual([{ id: first, language: 'zh-CN', request_id: expect.stringMatching(UUID) }]);
    expect(pressed(control(first))).toEqual(['zh-CN']);
    const missing = document.querySelector(control(REGISTRY.repositories[1]!.repository_id))!;
    expect(missing.querySelector('[data-save-result="policy_missing"] [data-command] code')?.textContent).toBe('repo-harness init');
    expect(all('[data-language-option]', missing).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
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

  test('GET quota returns the served report; a busy or invalid refusal and no answer are unreachable; a body that fails the decoder is settings_invalid', async () => {
    const signal = new AbortController().signal;
    const report = busyQuota(NOW);
    const refusal = (code: string, status: number) => () => new Response(JSON.stringify({ error: { code, message: 'x', next_action: 'y' } }), { status });
    const cases: [() => Response, Awaited<ReturnType<typeof fetchQuota>>][] = [
      [() => new Response(JSON.stringify(report), { status: 200 }), { state: 'ok', settings: report }],
      [refusal('quota_busy', 503), { state: 'unavailable', reason: 'unreachable' }],
      [refusal('quota_invalid', 502), { state: 'unavailable', reason: 'unreachable' }],
      [() => { throw new TypeError('network'); }, { state: 'unavailable', reason: 'unreachable' }],
      [() => new Response(JSON.stringify({ ...report, protocol: 'repo-harness.quota.v0' }), { status: 200 }), { state: 'unavailable', reason: 'settings_invalid' }],
    ];
    for (const [respond, expected] of cases) {
      const { calls } = stub(respond);
      expect(await fetchQuota(signal)).toEqual(expected);
      expect(calls[0]!.url).toBe('/api/v1/quota');
    }
  });
});
