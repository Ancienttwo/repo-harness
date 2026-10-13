import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { decodeSetupSnapshot, unavailableSetupSnapshot } from '../../src/core/setup/decode';
import type { SetupSnapshotV1 } from '../../src/core/setup/types';
import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';
import { OperatorApp, type OperatorAppProps } from '../../src/operator-web/App';
import type { OperatorLocale } from '../../src/operator-web/i18n';
import { fixtureProps, FIXTURE_NAMES } from '../../src/operator-web/fixtures';
import { busyDevActivity } from '../../src/operator-web/fixtures/dev-activity';
import { degradedSetup, loadingSetup, readySetup } from '../../src/operator-web/fixtures/setup';
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

function props(setup: SetupSnapshotV1 | null, overrides: Partial<OperatorAppProps> = {}): OperatorAppProps {
  return {
    initialLocale: 'en', initialSnapshot: stableSnapshot, fetchSnapshot: async () => stableSnapshot,
    initialDevActivity: activity, fetchDevActivity: async () => activity,
    initialRuntimeOverlay: unavailableRuntimeOverlay(), readRuntimeStatus: async () => unavailableRuntimeOverlay(),
    readNotifyStatus: () => new Promise(() => {}), readPipelineBoard: () => new Promise(() => {}),
    ...(setup ? { initialSetup: setup, readSetup: async () => setup } : {}),
    ...overrides,
  };
}

async function mount(hash: string, appProps: OperatorAppProps): Promise<void> {
  window.location.hash = hash;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<OperatorApp {...appProps} />));
}

const page = () => document.querySelector<HTMLElement>('[data-setup-page]')!;
const text = (selector: string) => document.querySelector(selector)?.textContent ?? '';
const all = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));
const navLink = (workspace: string) => document.querySelector<HTMLAnchorElement>(`.workspace-nav a[data-workspace="${workspace}"]`)!;

beforeEach(() => installDom());
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  window.happyDOM.abort();
});

describe('setup fixtures', () => {
  test('every setup fixture passes the browser decoder and every named fixture carries one', () => {
    for (const snapshot of [readySetup(NOW), degradedSetup(NOW), loadingSetup()]) expect(() => decodeSetupSnapshot(snapshot)).not.toThrow();
    for (const name of FIXTURE_NAMES) expect(fixtureProps(name).initialSetup?.projection_version).toBe('repo-harness.setup.v1');
    expect(fixtureProps('busy').initialSetup?.status).toBe('ready');
    expect(fixtureProps('empty').initialSetup?.reason).toBe('collection_pending');
    expect(fixtureProps('degraded').initialSetup?.status).toBe('stale');
  });
});

describe('navigation', () => {
  test('setup pages have their own hash and refuse a parameter', () => {
    for (const workspace of ['agents', 'skills', 'hooks'] as const) {
      expect(parseWorkspaceLocation(`#${workspace}`)).toEqual({ workspace, module: null, item: null });
      expect(workspaceHash({ workspace, module: null, item: null })).toBe(`#${workspace}`);
      expect(parseWorkspaceLocation(`#${workspace}/extra`).workspace).toBe('board');
    }
  });

  test('the setup pages sit between Repositories and Architecture and route by hash', async () => {
    await mount('', props(readySetup(NOW)));
    for (const workspace of ['agents', 'skills', 'hooks']) {
      await act(async () => navLink(workspace).click());
      expect(window.location.hash).toBe(`#${workspace}`);
      expect(navLink(workspace).getAttribute('aria-current')).toBe('page');
      expect(page().getAttribute('data-setup-page')).toBe(workspace);
    }
  });

  test('on a phone, Skills, Hooks, Tools and Architecture sit behind More, which opens, routes and closes', async () => {
    await mount('', props(readySetup(NOW)));
    for (const workspace of ['skills', 'hooks', 'tools', 'architecture']) expect(navLink(workspace).closest('li')!.className).toContain('max-md:hidden');
    for (const workspace of ['board', 'repositories', 'agents', 'system']) expect(navLink(workspace).closest('li')!.className).not.toContain('max-md:hidden');
    const more = document.querySelector<HTMLButtonElement>('[data-nav-more] button')!;
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('#nav-more-menu')).toBeNull();
    await act(async () => more.click());
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(all('#nav-more-menu a').map(link => link.getAttribute('data-more-workspace'))).toEqual(['skills', 'hooks', 'tools', 'architecture']);
    await act(async () => document.querySelector<HTMLAnchorElement>('#nav-more-menu a[data-more-workspace="hooks"]')!.click());
    expect(window.location.hash).toBe('#hooks');
    expect(document.querySelector('#nav-more-menu')).toBeNull();
    await act(async () => more.click());
    await act(async () => { document.querySelector('#nav-more-menu a')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event); });
    expect(document.querySelector('#nav-more-menu')).toBeNull();
  });

  test('the setup result is read only while a setup page shows, once on each return', async () => {
    const snapshot = readySetup(NOW);
    let reads = 0;
    await mount('', props(null, { readSetup: async () => { reads++; return snapshot; } }));
    expect(reads).toBe(0);
    await act(async () => navLink('agents').click());
    expect(reads).toBe(1);
    await act(async () => navLink('skills').click());
    await act(async () => navLink('hooks').click());
    expect(reads).toBe(1);
    await act(async () => navLink('board').click());
    await act(async () => navLink('agents').click());
    expect(reads).toBe(2);
  });
});

describe('topbar freshness', () => {
  test('the one freshness line follows the page: setup check on setup pages, activity elsewhere', async () => {
    await mount('#agents', props(readySetup(NOW)));
    const line = () => document.querySelector('[data-freshness]')!;
    expect(line().getAttribute('data-freshness-source')).toBe('setup');
    expect(line().textContent).toBe('Setup check read 3m ago · 2 need attention');
    await act(async () => navLink('board').click());
    expect(line().hasAttribute('data-freshness-source')).toBe(false);
    expect(line().textContent).toContain('sources ok');
    await act(async () => navLink('hooks').click());
    expect(line().getAttribute('data-freshness-source')).toBe('setup');
  });

  test('stale, pending and failed setup reads say so in the line', async () => {
    const cases: readonly [SetupSnapshotV1, string, string][] = [
      [degradedSetup(NOW), 'stale', 'Showing setup check from 25m ago · last read failed · 5 need attention'],
      [loadingSetup(), 'pending', 'Reading configuration…'],
      [unavailableSetupSnapshot('setup_check_timeout'), 'failed', 'Setup check unavailable · setup check did not finish within 90 s'],
    ];
    for (const [snapshot, state, words] of cases) {
      await mount('#skills', props(snapshot));
      const line = document.querySelector('[data-freshness-source="setup"]')!;
      expect(line.getAttribute('data-freshness')).toBe(state);
      expect(line.textContent).toBe(words);
      await act(async () => root?.unmount());
      root = null; document.body.innerHTML = '';
    }
  });
});

describe('Agents page', () => {
  test('one status line, a copyable command per item, and one row per host', async () => {
    await mount('#agents', props(readySetup(NOW)));
    expect(page().getAttribute('data-setup-state')).toBe('ready');
    expect(text('[data-setup-attention]')).toBe('2 items need attention');
    expect(document.querySelector('[data-setup-attention]')!.getAttribute('data-setup-attention')).toBe('2');
    const checks = all('[data-check]');
    expect(checks.map(row => row.getAttribute('data-check'))).toEqual(['doctor.security-config', 'runtime.skills_cli']);
    expect(checks[0]!.querySelector('[data-command]')?.textContent).toContain('repo-harness security scan --json');
    expect(all('[data-host-row]').map(row => row.getAttribute('data-host-row'))).toEqual(['claude', 'codex', 'pi']);
    expect(text('[data-host-row="claude"] [data-host-sentence]')).toBe('Connected · 5/5 managed hooks');
    expect(text('[data-host-row="codex"]')).toContain('v0.162.0');
    expect(all('[data-fleet-role]')).toHaveLength(7);
    expect(text('[data-fleet-role="gatekeeper"] [data-host-cell="pi"]')).toContain('not reported');
  });

  test('the Pi row says setup check does not report it, never that Pi is not installed', async () => {
    for (const locale of ['en', 'zh'] as const satisfies readonly OperatorLocale[]) {
      await mount('#agents', props(readySetup(NOW), { initialLocale: locale }));
      const pi = document.querySelector('[data-host-row="pi"]')!;
      expect(pi.getAttribute('data-host-reported')).toBe('false');
      expect(pi.querySelector('[data-host-sentence]')!.textContent).toBe(locale === 'en'
        ? 'Setup check does not report Pi install status' : 'setup check 未报告 Pi 安装状态');
      expect(pi.textContent).not.toMatch(/not installed|未安装|missing|缺失/iu);
      expect(pi.querySelector('[data-dot]')!.getAttribute('data-dot')).toBe('neutral');
      await act(async () => root?.unmount());
      root = null; document.body.innerHTML = '';
    }
  });

  test('a stale read keeps its data, shows its age and reason, and lists failures first', async () => {
    await mount('#agents', props(degradedSetup(NOW)));
    expect(page().getAttribute('data-setup-state')).toBe('stale');
    expect(page().textContent).toContain('Showing configuration read 25m ago');
    expect(page().textContent).toContain('setup check did not finish within 90 s');
    // Three compact rows show first; the rest open on request, still failures first.
    expect(all('[data-check]').map(row => row.getAttribute('data-check-status'))).toEqual(['fail', 'fail', 'needs_agent']);
    const more = document.querySelector<HTMLButtonElement>('[data-checks-more]')!;
    expect(more.textContent).toBe('Show 2 more');
    await act(async () => more.click());
    expect(all('[data-check]').map(row => row.getAttribute('data-check-status'))).toEqual(['fail', 'fail', 'needs_agent', 'warn', 'warn']);
    expect(more.textContent).toBe('Show fewer');
    expect(text('[data-host-row="codex"] [data-host-sentence]')).toBe('Connected · 5/6 managed hooks · 3 projection mismatches');
    expect(text('[data-host-row="codex"] [data-host-mismatch-summary]')).toContain('SubagentStart · context · missing');
    expect(text('[data-host-row="codex"] [data-command]')).toContain('repo-harness install --host codex');
    expect(text('[data-host-row="claude"] [data-host-sentence]')).toBe('Connected · 5/5 managed hooks · projection not compared');
    expect(text('[data-fleet-role="gatekeeper"] [data-host-cell="codex"]')).toContain('missing');
    // A check without a command says so instead of inventing one.
    expect(text('[data-check="runtime.skills_cli"]')).toContain('No command · see details');
    // The multi-line detail opens below its row only on request.
    const row = document.querySelector('[data-check="doctor.skill-projection"]')!;
    expect(row.querySelector('pre')).toBeNull();
    await act(async () => row.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click());
    expect(row.querySelector('pre')?.textContent).toContain('codex repo-harness-ship: missing');
  });
});

describe('Skills page', () => {
  test('abnormal skills come first and each host cell uses setup check words', async () => {
    await mount('#skills', props(degradedSetup(NOW)));
    const rows = all('[data-skill]');
    const flags = rows.map(row => row.getAttribute('data-skill-abnormal'));
    expect(flags.slice(0, 4)).toEqual(['true', 'true', 'true', 'true']);
    expect(flags.slice(4).every(flag => flag === 'false')).toBe(true);
    expect(rows.slice(0, 4).map(row => row.getAttribute('data-skill'))).toEqual(['repo-harness-ship', 'obsidian-memory', 'herdr', 'think']);
    const state = (skill: string, host: string) => document.querySelector(`[data-skill="${skill}"] [data-host-cell="${host}"] [data-skill-state]`)!.getAttribute('data-skill-state');
    expect(state('repo-harness-ship', 'codex')).toBe('missing');
    expect(state('herdr', 'claude')).toBe('stale copy');
    expect(state('think', 'claude')).toBe('drift');
    expect(state('repo-harness-ship', 'pi')).toBe('not_expected');
    expect(state('repo-harness', 'claude')).toBe('ok link');
    expect(text('[data-skills-abnormal]')).toBe('4 need attention');
    expect(text('[data-skill="repo-harness-ship"]')).toContain('Validates finished worktrees');
    // The skill projection check that setup check flagged sits above the table with its command.
    expect(text('[data-setup-page="skills"] [data-check="doctor.skill-projection"] [data-command]')).toContain('repo-harness skills sync');
  });

  test('a ready read without a flagged projection check shows only the table', async () => {
    await mount('#skills', props(readySetup(NOW)));
    expect(document.querySelector('[data-check]')).toBeNull();
    expect(text('[data-skills-abnormal]')).toBe('All match their source');
    expect(all('[data-skill-abnormal="true"]')).toHaveLength(0);
  });

  test('no judged skills never reads as all-consistent; the flagged check explains it', async () => {
    const snapshot = readySetup(NOW);
    await mount('#skills', props({ ...snapshot, skills: [], checks: [{ id: 'doctor.skill-projection', status: 'fail', title: 'Host skills match their source and install ledger', detail: 'invalid skill catalog: [private path]', command: null }] }));
    expect(document.querySelector('[data-skills-abnormal]')).toBeNull();
    expect(page().textContent).not.toContain('All match their source');
    expect(text('[data-check="doctor.skill-projection"]')).toContain('No command · see details');
    expect(page().textContent).toContain('Setup check judged no skills.');
  });
});

describe('Hooks page', () => {
  test('routes group by event with per-host support, and mismatches list under their host', async () => {
    await mount('#hooks', props(degradedSetup(NOW)));
    expect(all('[data-hook-event]').map(row => row.getAttribute('data-hook-event'))).toEqual(['SessionStart', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'SubagentStart', 'Stop']);
    const subagent = document.querySelector('[data-hook-event="PreToolUse"] [data-route="subagent"]')!;
    expect(subagent.querySelector('[data-host-cell="codex"] [data-route-host]')!.getAttribute('data-route-host')).toBe('unsupported');
    expect(subagent.querySelector('[data-host-cell="pi"] [data-route-host]')!.getAttribute('data-route-host')).toBe('unsupported');
    expect(subagent.textContent).toContain('Agent');
    expect(text('[data-hook-event="SessionStart"] [data-route="default"]')).toContain('every tool');
    expect(all('[data-managed-host="codex"] [data-mismatch]').map(row => row.textContent)).toEqual([
      'SubagentStart · context · missing', 'Stop · default · timeout differs', 'PreToolUse · entry without a route id · unexpected entry',
    ]);
    expect(all('[data-managed-host="claude"] [data-mismatch]')).toHaveLength(0);
    expect(text('[data-managed-host="pi"]')).toContain('Setup check does not report Pi install status');
  });
});

describe('first read and failures', () => {
  test('before the first collection finishes each page says it is reading', async () => {
    for (const hash of ['#agents', '#skills', '#hooks']) {
      await mount(hash, props(loadingSetup()));
      expect(page().getAttribute('data-setup-state')).toBe('pending');
      expect(page().textContent).toContain('Reading configuration (about 20 s)');
      expect(all('[data-host-row], [data-skill], [data-route]')).toHaveLength(0);
      await act(async () => root?.unmount());
      root = null; document.body.innerHTML = '';
    }
  });

  test('a page shows the read as pending until the reader answers', async () => {
    await mount('#agents', props(null, { readSetup: () => new Promise(() => {}) }));
    expect(page().getAttribute('data-setup-state')).toBe('pending');
  });

  test('a failed collection names its reason and the command to run by hand', async () => {
    await mount('#skills', props(unavailableSetupSnapshot('setup_check_failed')));
    expect(page().getAttribute('data-setup-state')).toBe('failed');
    expect(page().getAttribute('data-setup-reason')).toBe('setup_check_failed');
    expect(page().textContent).toContain('Configuration could not be read');
    expect(page().textContent).toContain('setup check failed');
    expect(page().textContent).toContain('repo-harness setup check');
  });

  test('an unreachable service is a failure with the same command; a later refresh failure keeps data', async () => {
    await mount('#hooks', props(null, { readSetup: async () => { throw new Error('offline'); } }));
    expect(page().getAttribute('data-setup-state')).toBe('failed');
    expect(page().getAttribute('data-setup-reason')).toBe('unreachable');
    expect(page().textContent).toContain('the operator service did not answer');
    expect(page().textContent).toContain('repo-harness setup check');
    await act(async () => root?.unmount());
    root = null; document.body.innerHTML = '';

    await mount('#hooks', props(readySetup(NOW), { readSetup: async () => { throw new Error('offline'); } }));
    // The seeded snapshot shows; returning to the page reads, fails, and keeps it.
    await act(async () => navLink('board').click());
    await act(async () => navLink('hooks').click());
    expect(page().getAttribute('data-setup-state')).toBe('refresh-failed');
    expect(all('[data-route]').length).toBeGreaterThan(0);
  });
});

describe('Tools page', () => {
  const tools = () => document.querySelector<HTMLElement>('[data-tools-page]');
  const row = (id: string) => document.querySelector<HTMLButtonElement>(`[data-tool="${id}"] button`)!;
  const drawer = () => document.querySelector<HTMLElement>('[data-tool-drawer]');

  test('#tools lists the catalog; #tools/<id> opens a catalog entry; anything else is the Board', () => {
    expect(parseWorkspaceLocation('#tools')).toEqual({ workspace: 'tools', module: null, item: null });
    expect(parseWorkspaceLocation('#tools/codegraph')).toEqual({ workspace: 'tools', module: null, item: 'codegraph' });
    expect(workspaceHash({ workspace: 'tools', module: null, item: null })).toBe('#tools');
    expect(workspaceHash({ workspace: 'tools', module: null, item: 'codegraph' })).toBe('#tools/codegraph');
    for (const hash of ['#tools/CodeGraph', '#tools/code_graph', '#tools/%2e%2e', '#tools/not-in-catalog', '#tools/codegraph/extra', '#tools/']) {
      expect(parseWorkspaceLocation(hash)).toEqual({ workspace: 'board', module: null, item: null });
    }
  });

  test('Tools sits after Hooks in the nav and routes by hash without a setup read', async () => {
    let reads = 0;
    await mount('', props(null, { readSetup: async () => { reads++; return readySetup(NOW); } }));
    const order = all('.workspace-nav a[data-workspace]').map(link => link.getAttribute('data-workspace'));
    expect(order.indexOf('tools')).toBe(order.indexOf('hooks') + 1);
    await act(async () => navLink('tools').click());
    expect(window.location.hash).toBe('#tools');
    expect(navLink('tools').getAttribute('aria-current')).toBe('page');
    expect(tools()).not.toBeNull();
    expect(reads).toBe(0);
  });

  test('local tools and resources list with counts; no tool reads as installed', async () => {
    await mount('#tools', props(readySetup(NOW)));
    expect(all('[data-tool-group]').map(group => group.getAttribute('data-tool-group'))).toEqual(['local_tool', 'resource']);
    expect(text('#tools-local_tool-heading')).toBe('Local tools4');
    expect(text('#tools-resource-heading')).toBe('Recommended resources2');
    const status = Object.fromEntries(all('[data-tool]').map(item => [item.getAttribute('data-tool'), item.querySelector('[data-tool-status]')!.getAttribute('data-tool-status')]));
    expect(status).toEqual({ waza: 'unknown', codegraph: 'unknown', 'herdr-skill': 'unknown', 'hai-stack': 'na', shaders: 'na', 'awesome-design-md': 'na' });
    expect(text('[data-tool="hai-stack"] [data-tool-status]')).toBe('N/A');
    // hai-stack declares no SPDX license; the license cell says so.
    expect(text('[data-tool="hai-stack"]')).toContain('Unknown');
    expect(text('[data-tool="shaders"]')).toContain('MIT');
    // The only command on the page is the read-only detector report.
    expect(all('[data-command] code').map(code => code.textContent)).toEqual(['repo-harness run check-agent-tooling']);
  });

  test('a row opens its drawer with links and no install command; Escape closes and returns focus', async () => {
    await mount('#tools', props(readySetup(NOW)));
    row('codegraph').focus();
    await act(async () => row('codegraph').click());
    expect(window.location.hash).toBe('#tools/codegraph');
    expect(drawer()?.getAttribute('data-tool-drawer')).toBe('codegraph');
    expect(text('#tool-drawer-title')).toBe('CodeGraph');
    expect(drawer()!.querySelectorAll('[data-command]')).toHaveLength(0);
    const links = Array.from(drawer()!.querySelectorAll('a')).map(link => [link.getAttribute('href'), link.getAttribute('rel')]);
    expect(links).toEqual([
      ['https://github.com/colbymchenry/codegraph', 'noreferrer noopener'],
      ['https://github.com/Ancienttwo/repo-harness/blob/main/docs/reference-configs/external-tooling.md#codegraph', 'noreferrer noopener'],
    ]);
    await act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event); });
    expect(window.location.hash).toBe('#tools');
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(row('codegraph'));
  });

  test('a resource drawer says it is not detected; the summary follows the locale', async () => {
    await mount('#tools/awesome-design-md', props(readySetup(NOW), { initialLocale: 'zh' }));
    expect(drawer()?.getAttribute('data-tool-drawer')).toBe('awesome-design-md');
    expect(drawer()!.textContent).toContain('来自知名品牌设计系统的 DESIGN.md 文件');
    expect(text('[data-tool-status-reason]')).toBe('repo-harness 不安装、也不探测资源。');
    expect(navLink('tools').textContent).toBe('工具');
  });
});

test('setup pages carry no write, form or drag controls; buttons only copy', async () => {
  for (const hash of ['#agents', '#skills', '#hooks']) {
    await mount(hash, props(degradedSetup(NOW)));
    const main = document.querySelector('main')!;
    expect(main.querySelectorAll('form, input, select, textarea, [draggable="true"], [contenteditable]')).toHaveLength(0);
    // Buttons either copy a command or disclose more of what is already shown.
    const buttons = Array.from(main.querySelectorAll('button'));
    expect(buttons.every(button => button.getAttribute('aria-label')?.startsWith('Copy ') || button.hasAttribute('aria-expanded'))).toBe(true);
    await act(async () => root?.unmount());
    root = null; document.body.innerHTML = '';
  }
});
