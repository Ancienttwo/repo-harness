import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';

import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import type { DevActivitySnapshotV1 } from '../../src/core/dev-activity/types';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';
import { documentTitle, OperatorApp, type OperatorAppProps } from '../../src/operator-web/App';
import { filterItems, DEFAULT_BOARD_FILTERS, orderColumn } from '../../src/operator-web/dev-activity';
import { fixtureProps, FIXTURE_NAMES } from '../../src/operator-web/fixtures';
import { busyDevActivity, busyRuntimeOverlay, degradedDevActivity, emptyDevActivity, HARNESS_ID } from '../../src/operator-web/fixtures/dev-activity';
import { OPERATOR_THEME_STORAGE_KEY, resolveThemeMode } from '../../src/operator-web/theme';
import { stableSnapshot } from '../../src/operator-web/fixture';

let root: Root | null = null;
let window: Window;
let prefersDark = false;

function installDom(url = 'http://127.0.0.1:4318/'): void {
  window = new Window({ url });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({
      matches: media.includes('dark') ? prefersDark : false,
      media, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
      dispatchEvent: () => true,
    }),
  });
  Object.assign(globalThis, {
    window, document: window.document, navigator: window.navigator, localStorage: window.localStorage,
    HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, Event: window.Event,
    MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true,
  });
}

const NOW = Date.now();
const busy = (): DevActivitySnapshotV1 => decodeDevActivitySnapshot(busyDevActivity(NOW));

function props(activity: DevActivitySnapshotV1, overrides: Partial<OperatorAppProps> = {}): OperatorAppProps {
  return {
    initialLocale: 'en', initialSnapshot: stableSnapshot, fetchSnapshot: async () => stableSnapshot,
    initialDevActivity: activity, fetchDevActivity: async () => activity,
    initialRuntimeOverlay: unavailableRuntimeOverlay(), readRuntimeStatus: async () => unavailableRuntimeOverlay(),
    readNotifyStatus: () => new Promise(() => {}), readPipelineBoard: () => new Promise(() => {}),
    fetchRepositoryObservation: () => new Promise(() => {}),
    ...overrides,
  };
}

async function mount(element: React.ReactElement): Promise<void> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
}

const key = (value: string) => act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true }) as unknown as Event); });
const cards = () => Array.from(document.querySelectorAll<HTMLElement>('[data-board-column] [data-item-id]'));
const card = (id: string) => cards().find(element => element.getAttribute('data-item-id') === id)!;
const PRIVATE_LABEL = /repo_[0-9a-f]{16}|sha256:/u;

beforeEach(() => { prefersDark = false; installDom(); });
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  window.happyDOM.abort();
});

describe('board data rules', () => {
  test('every development fixture passes the browser decoder', () => {
    for (const name of FIXTURE_NAMES) expect(() => fixtureProps(name)).not.toThrow();
    expect(() => fixtureProps('nope')).toThrow('unknown operator fixture');
    expect(degradedDevActivity(NOW).unreadable_registrations).toBe(2489);
    expect(emptyDevActivity(NOW).items).toHaveLength(0);
    expect(busyRuntimeOverlay(NOW).native_sources).toHaveLength(3);
  });

  test('closed PRs stay hidden until asked for, and shipped work reads newest first', () => {
    const snapshot = busy();
    const closed = snapshot.items.find(item => item.hidden === 'closed_unmerged')!;
    expect(filterItems(snapshot, DEFAULT_BOARD_FILTERS).map(item => item.id)).not.toContain(closed.id);
    expect(filterItems(snapshot, { ...DEFAULT_BOARD_FILTERS, showClosed: true }).map(item => item.id)).toContain(closed.id);
    const shipped = orderColumn('shipped', snapshot.items.filter(item => item.column === 'shipped'));
    const times = shipped.map(item => Date.parse(item.pull_request!.merged_at!));
    expect(times).toEqual([...times].sort((left, right) => right - left));
    const building = orderColumn('building', filterItems(snapshot, DEFAULT_BOARD_FILTERS).filter(item => item.column === 'building'));
    expect(building[0]!.runtime_blocked).not.toBeNull();
  });

  test('the tab title carries the needs-you count and nothing when it is zero', () => {
    expect(documentTitle(3)).toBe('(3) repo-harness');
    expect(documentTitle(0)).toBe('repo-harness');
    expect(documentTitle(null)).toBe('repo-harness');
  });
});

describe('board page', () => {
  test('the needs-you count, the badge and the tab title are the same number', async () => {
    const snapshot = busy();
    await mount(<OperatorApp {...props(snapshot)} />);
    const count = snapshot.attention.length;
    expect(count).toBe(3);
    expect(document.querySelector('.needs-you')?.getAttribute('data-attention-count')).toBe(String(count));
    expect(document.querySelectorAll('[data-attention-kind]')).toHaveLength(count);
    expect(document.querySelector('[data-needs-you]')?.getAttribute('data-needs-you')).toBe(String(count));
    expect(document.title).toBe(`(${count}) repo-harness`);
    // A decision request is acted on with a copied command, a PR with a link out.
    const decision = document.querySelector('[data-attention-kind="human_request"]')!;
    expect(decision.querySelector('[data-command]')?.textContent).toContain('repo-harness verified-context read --kind decision');
    expect(document.querySelector('[data-attention-kind="ready_to_merge"] a[href^="https://github.com/"]')).not.toBeNull();
  });

  test('cards and rows lead with human labels, never registry ids or digests', async () => {
    await mount(<OperatorApp {...props(busy(), { initialRuntimeOverlay: busyRuntimeOverlay(NOW), readRuntimeStatus: async () => busyRuntimeOverlay(NOW) })} />);
    expect(cards().length).toBeGreaterThan(5);
    for (const element of cards()) {
      expect(element.querySelector('[data-card-open]')!.textContent).not.toMatch(PRIVATE_LABEL);
      expect(element.textContent).not.toMatch(PRIVATE_LABEL);
    }
    for (const row of document.querySelectorAll('[data-attention-kind]')) expect(row.textContent).not.toMatch(PRIVATE_LABEL);
    expect(document.querySelector('[data-roster="connected"]')?.textContent).not.toMatch(PRIVATE_LABEL);
    expect(document.querySelector('.board-repo-filter')?.textContent).not.toMatch(PRIVATE_LABEL);
  });

  test('offers no drag, write or form control anywhere on the board', async () => {
    await mount(<OperatorApp {...props(busy())} />);
    expect(document.querySelectorAll('[draggable="true"], form, [data-write-action], textarea')).toHaveLength(0);
    const inputs = Array.from(document.querySelectorAll('input')).map(input => input.getAttribute('type') ?? 'text');
    expect(inputs.every(type => type === 'search' || type === 'checkbox')).toBe(true);
    const words = Array.from(document.querySelectorAll('button')).map(button => button.textContent ?? '').join(' | ');
    for (const affordance of ['Approve', 'Merge now', 'Merge', 'Close PR', 'Start agent', 'Delete', 'Prune']) expect(words).not.toContain(affordance);
  });

  test('a merged or closed PR shows no checks state, and an open PR is aged from its creation', async () => {
    await mount(<OperatorApp {...props(busy())} />);
    for (const element of cards().filter(entry => entry.getAttribute('data-column') === 'shipped')) {
      expect(element.querySelector('[data-ci]')).toBeNull();
      expect(element.textContent).toContain('merged');
    }
    expect(card(`${HARNESS_ID}:chore/oar-0-45`).textContent).toContain('PR opened 50m ago');
    expect(card(`${HARNESS_ID}:chore/oar-0-45`).querySelector('[data-ci="success"]')).not.toBeNull();
  });

  test('marks a blocked card with its reason and folds Shipped to recent work', async () => {
    await mount(<OperatorApp {...props(busy())} />);
    const blocked = card(`${HARNESS_ID}:feat/runtime-capture-pi`);
    expect(blocked.hasAttribute('data-blocked')).toBe(true);
    expect(blocked.querySelector('[data-blocked]')?.textContent).toContain('Blocked: Permission needed');
    const shipped = document.querySelector('[data-board-column="shipped"]')!;
    expect(shipped.querySelector('[data-column-count]')?.textContent).toBe('8');
    expect(shipped.querySelectorAll('[data-item-id]')).toHaveLength(6);
    const more = Array.from(shipped.querySelectorAll('button')).find(button => button.textContent === 'Show 2 more')!;
    await act(async () => more.click());
    expect(shipped.querySelectorAll('[data-item-id]')).toHaveLength(8);
  });

  test('opens a card in a drawer with a deep link, moves with j/k and closes on Escape', async () => {
    const snapshot = busy();
    await mount(<OperatorApp {...props(snapshot)} />);
    const id = `${HARNESS_ID}:feat/pipeline-observer`;
    await act(async () => card(id).querySelector<HTMLButtonElement>('[data-card-open]')!.click());
    expect(window.location.hash).toBe(`#board/${encodeURIComponent(id)}`);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('#item-drawer-title')?.textContent).toBe('Observe pipeline phases on the board');
    // Evidence & gates appears only because this item is joined to a ledger record.
    expect(dialog.textContent).toContain('Evidence & gates');
    expect(dialog.querySelector('details')?.hasAttribute('open')).toBe(false);
    await key('j');
    expect(window.location.hash).not.toBe(`#board/${encodeURIComponent(id)}`);
    await key('k');
    expect(window.location.hash).toBe(`#board/${encodeURIComponent(id)}`);
    await key('Escape');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(window.location.hash).toBe('#board');
  });

  test('the drawer states a block once, in plain words, with the agent on one line', async () => {
    const id = `${HARNESS_ID}:feat/runtime-capture-pi`;
    installDom(`http://127.0.0.1:4318/#board/${encodeURIComponent(id)}`);
    await mount(<OperatorApp {...props(busy())} />);
    const now = document.querySelector('[role="dialog"] section')!;
    expect(now.querySelectorAll('[data-blocked]')).toHaveLength(1);
    expect(now.querySelector('[data-blocked]')?.textContent).toBe('Blocked · Permission needed · 26m');
    // The runtime_blocked attention row would repeat the block line.
    expect(now.querySelector('[data-attention-kind="runtime_blocked"]')).toBeNull();
    expect(now.querySelector('[data-agent-source="runtime"]')?.textContent).toContain('Codex · implementer · Blocked · seen 26m ago');
    for (const jargon of ['Reported by', 'Observation', 'agent status', 'Current observation']) expect(now.textContent).not.toContain(jargon);
  });

  test('a long command wraps in full and Copy copies all of it', async () => {
    const copied: string[] = [];
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { copied.push(value); } } });
    await mount(<OperatorApp {...props(decodeDevActivitySnapshot(emptyDevActivity(NOW)))} />);
    const line = document.querySelector('[data-roster="not-connected"] [data-command]')!;
    const command = 'repo-harness operator serve --runtime-status-config <absolute-path>';
    expect(line.querySelector('code')?.textContent).toBe(command);
    expect(line.querySelector('code')?.className).not.toContain('truncate');
    expect(line.querySelector('code')?.className).not.toContain('nowrap');
    await act(async () => line.querySelector<HTMLButtonElement>('button')!.click());
    expect(copied).toEqual([command]);
  });

  test('a deep link opens the drawer on load; a vanished item says so', async () => {
    const id = `${HARNESS_ID}:chore/oar-0-45`;
    installDom(`http://127.0.0.1:4318/#board/${encodeURIComponent(id)}`);
    await mount(<OperatorApp {...props(busy())} />);
    expect(document.querySelector('#item-drawer-title')?.textContent).toBe('Upgrade OAR to 0.45.1');
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('Evidence & gates');
    await act(async () => root?.unmount());
    installDom(`http://127.0.0.1:4318/#board/${encodeURIComponent(`${HARNESS_ID}:gone`)}`);
    await mount(<OperatorApp {...props(busy())} />);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('This item is no longer on the board');
  });

  test('states an empty queue and an unconnected agent source in one line each, with the command', async () => {
    await mount(<OperatorApp {...props(decodeDevActivitySnapshot(emptyDevActivity(NOW)))} />);
    expect(document.querySelector('.needs-you')?.textContent).toContain('Nothing is waiting on you.');
    expect(document.title).toBe('repo-harness');
    const roster = document.querySelector('[data-roster="not-connected"]')!;
    expect(roster.querySelector('[data-command]')?.textContent).toContain('repo-harness operator serve --runtime-status-config');
    expect(document.body.textContent).toContain('No work in flight');
  });

  test('a failed refresh keeps the last board and says how old it is', async () => {
    const snapshot = busy();
    let reads = 0;
    await mount(<OperatorApp {...props(snapshot, { fetchDevActivity: async () => { reads++; throw new Error('down'); } })} />);
    const before = cards().length;
    await act(async () => Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Refresh'))!.click());
    expect(reads).toBe(1);
    expect(cards()).toHaveLength(before);
    expect(document.body.textContent).toContain('Refresh failed');
    expect(document.querySelector('[data-freshness]')?.textContent).toContain('showing data from');
  });

  test('stale registrations fold into one row with the preview command', async () => {
    installDom('http://127.0.0.1:4318/#repositories');
    await mount(<OperatorApp {...props(decodeDevActivitySnapshot(degradedDevActivity(NOW)))} />);
    const stale = document.querySelector('[data-stale-registrations]')!;
    expect(stale.getAttribute('data-stale-registrations')).toBe('2489');
    expect(stale.querySelector('[data-command]')?.textContent).toContain('repo-harness fleet prune');
    expect(stale.textContent).toContain('without a backup');
    expect(document.querySelectorAll('[data-repository]')).toHaveLength(2);
    expect(document.querySelector('[data-source-kind="github"]')?.getAttribute('data-source-status')).toBe('unavailable');
  });
});

describe('theme', () => {
  test('follows the system, cycles light → dark → system, and persists the choice', async () => {
    expect(resolveThemeMode('system', true)).toBe('dark');
    expect(resolveThemeMode('light', true)).toBe('light');
    prefersDark = true;
    installDom();
    await mount(<OperatorApp {...props(busy())} />);
    const html = document.documentElement;
    expect(html.getAttribute('data-mode')).toBe('dark');
    const toggle = () => act(async () => document.querySelector<HTMLButtonElement>('button[aria-label^="Theme:"]')!.click());
    await toggle();
    expect(html.getAttribute('data-mode')).toBe('light');
    expect(localStorage.getItem(OPERATOR_THEME_STORAGE_KEY)).toBe('light');
    await toggle();
    expect(html.getAttribute('data-mode')).toBe('dark');
    await toggle();
    expect(html.getAttribute('data-mode')).toBe('dark');
    expect(localStorage.getItem(OPERATOR_THEME_STORAGE_KEY)).toBeNull();
  });

  test('blocked storage still renders and toggles', async () => {
    installDom();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    try {
      await mount(<OperatorApp {...props(busy())} />);
      await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label^="Theme:"]')!.click());
      expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: window.localStorage });
    }
  });

  test('server renders the board without touching browser globals', () => {
    delete (globalThis as { window?: unknown }).window;
    const markup = renderToStaticMarkup(<OperatorApp {...props(busy())} initialPlace={{ workspace: 'board', module: null, item: null }} />);
    expect(markup).toContain('data-workspace="board"');
    expect(markup).toContain('data-attention-count="3"');
  });
});
