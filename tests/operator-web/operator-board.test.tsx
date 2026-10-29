import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';

import tokens from '../../docs/design/operator-console/design-system/tokens.json';
import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import type { DevActivitySnapshotV2 } from '../../src/core/dev-activity/types';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';
import { decodeWorktreeCleanupRequest, worktreeDigestRow } from '../../src/core/operator/worktree-cleanup';
import { decodeWorktrees, unavailableWorktrees, WORKTREE_REASONS, type WorktreesSnapshot } from '../../src/core/operator/worktrees';
import { selectionDigest } from '../../src/effects/operator/worktree-cleanup';
import { documentTitle, OperatorApp, type OperatorAppProps } from '../../src/operator-web/App';
import { designTokenStylesheet } from '../../src/operator-web/design-tokens';
import { filterItems, DEFAULT_BOARD_FILTERS, orderColumn } from '../../src/operator-web/dev-activity';
import { OPERATOR_RAIL_STORAGE_KEY } from '../../src/operator-web/NavRail';
import { fetchExecution, itemOwner, type CiRepairsReader, type ExecutionReader } from '../../src/operator-web/repository-reads';
import { fixtureProps, FIXTURE_NAMES } from '../../src/operator-web/fixtures';
import {
  busyDevActivity,
  busyExecution,
  busyRuntimeOverlay,
  degradedDevActivity,
  emptyDevActivity,
  emptyExecution,
  HARNESS_ID,
} from '../../src/operator-web/fixtures/dev-activity';
import { busyWorktrees, degradedWorktrees } from '../../src/operator-web/fixtures/worktrees';
import { OPERATOR_THEME_STORAGE_KEY, resolveThemeMode } from '../../src/operator-web/theme';
import { stableSnapshot } from '../../src/operator-web/fixture';
import { parseWorkspaceLocation, workspaceHash } from '../../src/operator-web/workspace-location';

let root: Root | null = null;
let window: Window;
let prefersDark = false;

function installDom(url = 'http://127.0.0.1:4318/#board'): void {
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
const busy = (): DevActivitySnapshotV2 => decodeDevActivitySnapshot(busyDevActivity(NOW));
const trees = (): WorktreesSnapshot => decodeWorktrees(busyWorktrees(NOW));
const MB = 1024 * 1024;

function props(activity: DevActivitySnapshotV2, overrides: Partial<OperatorAppProps> = {}): OperatorAppProps {
  const worktrees = trees();
  return {
    initialLocale: 'en', initialSnapshot: stableSnapshot, fetchSnapshot: async () => stableSnapshot,
    initialDevActivity: activity, fetchDevActivity: async () => activity,
    initialRuntimeOverlay: unavailableRuntimeOverlay(), readRuntimeStatus: async () => unavailableRuntimeOverlay(),
    readNotifyStatus: () => new Promise(() => {}),
    initialWorktrees: worktrees, readWorktrees: async () => worktrees,
    readExecution: async id => emptyExecution(id, NOW),
    ...overrides,
  };
}

type WorktreeRow = WorktreesSnapshot['repositories'][number]['worktrees'][number];

/** The busy worktrees with rows edited by directory; the decoder checks the result. */
function rejudged(edits: Readonly<Record<string, Partial<WorktreeRow>>>): WorktreesSnapshot {
  const base = busyWorktrees(NOW);
  return decodeWorktrees({ ...base, repositories: base.repositories.map(repository => ({
    ...repository, worktrees: repository.worktrees.map(tree => ({ ...tree, ...edits[tree.directory] })),
  })) });
}

/** The busy fixture's sessions: Codex on the console redesign, Claude Code on the pipeline observer, operator-site still collecting. */
const sessions: ExecutionReader = async id => busyExecution(id, NOW);
const followUp = () => document.querySelector<HTMLElement>('[role="dialog"] section[aria-labelledby="drawer-follow-up"]')!;
const drawerAt = (id: string) => installDom(`http://127.0.0.1:4318/#board/${encodeURIComponent(id)}`);

async function mount(element: React.ReactElement): Promise<void> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
}

/** Lets reads that resolve after the first render (CI repairs, the head commit) commit. */
const settle = () => act(async () => { for (let turn = 0; turn < 5; turn++) await Promise.resolve(); });
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
    expect(building[0]!.id).toBe(`${HARNESS_ID}:feat/runtime-capture-pi`);
    expect(building.at(-1)!.column_since).toBeNull();
  });

  test('the tab title carries the needs-you count and nothing when it is zero', () => {
    expect(documentTitle(3)).toBe('(3) repo-harness');
    expect(documentTitle(0)).toBe('repo-harness');
    expect(documentTitle(null)).toBe('repo-harness');
  });

  test('an item takes a verified session only from the same repository and branch', () => {
    const read = busyExecution(HARNESS_ID, NOW);
    const site = busy().repositories[1]!.repository_id;
    const executions = [{ repository_id: HARNESS_ID, ...read }, { repository_id: site, ...emptyExecution(site, NOW) }];
    expect(itemOwner(executions, { repository_id: HARNESS_ID, branch: 'feat/kanban-human-redesign' })).toMatchObject({ state: 'verified', tasks: [{ agent: 'codex', role: 'implementer' }] });
    expect(itemOwner(executions, { repository_id: site, branch: 'feat/kanban-human-redesign' })).toEqual({ state: 'none' });
    expect(itemOwner(executions, { repository_id: HARNESS_ID, branch: 'feat/kanban-human' })).toEqual({ state: 'none' });
    expect(itemOwner(null, { repository_id: HARNESS_ID, branch: 'feat/kanban-human-redesign' })).toEqual({ state: 'reading' });
  });

  test('the execution reader keeps each route refusal and maps any other answer to a reason, never to an empty view', async () => {
    const read = busyExecution(HARNESS_ID, NOW);
    if (read.state !== 'ok') throw new Error('the busy fixture serves repo-harness');
    const refusal = (code: string, status: number) => () => Response.json({ error: { code, message: 'refused', next_action: 'retry' } }, { status });
    const answers: (() => Response)[] = [
      () => Response.json(read.view),
      () => Response.json({ ...read.view, tasks: [{ ...read.view.tasks[0], branch: 'feat/x y' }] }),
      refusal('execution_state_pending', 503),
      refusal('repository_not_found', 404),
      refusal('execution_state_unavailable', 503),
      refusal('execution_state_invalid', 503),
      refusal('a_code_from_a_newer_server', 503),
      () => { throw new TypeError('connection refused'); },
    ];
    const original = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (url: unknown, options?: RequestInit) => {
      requests.push(`${options?.method ?? 'GET'} ${String(url)}`);
      return answers[requests.length - 1]!();
    }) as typeof fetch;
    try {
      const results = [];
      for (const _ of answers) results.push(await fetchExecution(HARNESS_ID, new AbortController().signal));
      expect(results.map(result => result.state === 'ok' ? result.view.tasks.length : result.reason)).toEqual([
        3, 'execution_state_invalid', 'execution_state_pending', 'repository_not_found', 'execution_state_unavailable', 'execution_state_invalid', 'unreachable', 'unreachable',
      ]);
      expect(new Set(requests)).toEqual(new Set([`GET /api/v1/repositories/${HARNESS_ID}/execution`]));
    } finally { globalThis.fetch = original; }
  });
});

describe('board page', () => {
  test('the needs-you count, the badge and the tab title are the same number', async () => {
    const snapshot = busy();
    await mount(<OperatorApp {...props(snapshot)} />);
    const count = snapshot.attention.length;
    expect(count).toBe(1);
    expect(document.querySelector('.needs-you')?.getAttribute('data-attention-count')).toBe(String(count));
    expect(document.querySelectorAll('[data-attention-kind]')).toHaveLength(count);
    expect(document.querySelector('[data-needs-you]')?.getAttribute('data-needs-you')).toBe(String(count));
    expect(document.title).toBe(`(${count}) repo-harness`);
    expect(document.querySelector('[data-attention-kind="ready_to_merge"] a[href^="https://github.com/"]')).not.toBeNull();
  });

  test('decodes and labels the changes_requested, merge_conflict and checks_failed rows', async () => {
    const base = busy();
    const [ready] = base.attention;
    const itemId = (branch: string) => `${HARNESS_ID}:${branch}`;
    const rows = [
      { ...ready!, kind: 'changes_requested' as const, subject_id: itemId('feat/pipeline-observer'), summary: 'Observe pipeline phases on the board', waiting_since: new Date(NOW - 3 * 3_600_000).toISOString() },
      { ...ready!, kind: 'merge_conflict' as const, subject_id: itemId('feat/kanban-human-redesign'), summary: 'Rebuild the operator console for humans', waiting_since: new Date(NOW - 2 * 3_600_000).toISOString() },
      { ...ready!, kind: 'checks_failed' as const, subject_id: itemId('feat/runtime-capture-pi'), summary: 'Capture Pi runtime status natively', waiting_since: new Date(NOW - 1 * 3_600_000).toISOString() },
      ready!,
    ];
    const snapshot = decodeDevActivitySnapshot(JSON.parse(JSON.stringify({ ...base, attention: rows })));
    for (const [locale, labels] of [['en', ['Changes requested', 'Conflicts with main', 'Checks failed']], ['zh', ['评审要求修改', '与 main 冲突', '检查失败']]] as const) {
      await mount(<OperatorApp {...props(snapshot, { initialLocale: locale })} />);
      expect(Array.from(document.querySelectorAll('[data-attention-kind]')).map(row => row.getAttribute('data-attention-kind')))
        .toEqual(['changes_requested', 'merge_conflict', 'checks_failed', 'ready_to_merge']);
      const text = document.querySelector('.needs-you')!.textContent!;
      for (const label of labels) expect(text).toContain(label);
      await act(async () => root?.unmount());
      root = null;
      document.body.innerHTML = '';
    }
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
    await act(async () => document.querySelector<HTMLButtonElement>('[data-repository-switch]')!.click());
    const menu = document.querySelector('[data-repository-switch] + [role="dialog"]')!;
    expect(menu.querySelectorAll('[data-switch-option]').length).toBeGreaterThan(1);
    expect(menu.textContent).not.toMatch(PRIVATE_LABEL);
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

  test('keeps all five columns, leaves Planned empty and folds Shipped to recent work', async () => {
    await mount(<OperatorApp {...props(busy())} />);
    expect(document.querySelectorAll('[data-board-column]')).toHaveLength(5);
    const planned = document.querySelector('[data-board-column="planned"]')!;
    expect(planned.querySelectorAll('[data-item-id]')).toHaveLength(0);
    expect(planned.textContent).toContain('Nothing here');
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
    expect(dialog.textContent).not.toContain('Evidence & gates');
    expect(dialog.textContent).toContain('Checks');
    expect(dialog.textContent).toContain('Review');
    expect(dialog.querySelector('details')?.hasAttribute('open')).toBe(false);
    await key('j');
    expect(window.location.hash).not.toBe(`#board/${encodeURIComponent(id)}`);
    await key('k');
    expect(window.location.hash).toBe(`#board/${encodeURIComponent(id)}`);
    await key('Escape');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(window.location.hash).toBe('#board');
  });

  test('shows native runtime blocks in the roster without assigning a card or drawer', async () => {
    const id = `${HARNESS_ID}:feat/runtime-capture-pi`;
    installDom(`http://127.0.0.1:4318/#board/${encodeURIComponent(id)}`);
    const runtime = busyRuntimeOverlay(NOW);
    await mount(<OperatorApp {...props(busy(), { initialRuntimeOverlay: runtime, readRuntimeStatus: async () => runtime })} />);
    const roster = document.querySelector('[data-roster-source="codex-implementer"]')!;
    expect(roster.textContent).toContain('Blocked');
    expect(roster.textContent).toContain('Permission needed');
    expect(roster.textContent).toContain('not linked to a task');
    expect(card(id).querySelector('[data-blocked]')).toBeNull();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('[data-blocked], [data-agent-source]')).toBeNull();
    expect(dialog.querySelector('#drawer-now')).toBeNull();
    expect(dialog.textContent).toContain('Capture Pi runtime status natively');
    expect(dialog.textContent).toContain('Pull request');
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

  test('1-TASK-P1 a verified session gives the owner row and a copyable pane, resume command and task id', async () => {
    drawerAt(`${HARNESS_ID}:feat/kanban-human-redesign`);
    const copied: string[] = [];
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { copied.push(value); } } });
    await mount(<OperatorApp {...props(busy(), { readExecution: sessions })} />);
    await settle();
    const owner = followUp().querySelector('[data-owner="verified"]')!;
    for (const part of ['Codex', 'verified', 'implementer', 'Read-only observation']) expect(owner.textContent).toContain(part);
    expect(owner.querySelector('[data-dot="active"]')).not.toBeNull();
    expect(followUp().textContent).toContain('w2:p1');
    expect(followUp().textContent).toContain('main · w2');
    expect(followUp().querySelector('[data-command] code')?.textContent).toBe('codex resume 0199a2b4-7c3e-7d10-9f00-3a5b6c7d8e9f');
    // 1-TASK-N1: copy buttons only; nothing here can reach the session.
    expect(followUp().querySelectorAll('input, textarea, select, form, [contenteditable], [data-write-action]')).toHaveLength(0);
    const buttons = Array.from(followUp().querySelectorAll('button'));
    expect(buttons.every(button => button.getAttribute('aria-label')?.startsWith('Copy '))).toBe(true);
    for (const button of buttons) await act(async () => button.click());
    expect(copied).toEqual(['w2:p1', 'codex resume 0199a2b4-7c3e-7d10-9f00-3a5b6c7d8e9f', 'kanban-redesign']);

    await act(async () => root?.unmount());
    root = null;
    drawerAt(`${HARNESS_ID}:feat/pipeline-observer`);
    await mount(<OperatorApp {...props(busy(), { initialLocale: 'zh', readExecution: sessions })} />);
    await settle();
    expect(followUp().querySelector('[data-owner="verified"]')?.textContent).toContain('Claude Code');
    expect(followUp().textContent).toContain('只读观测');
    expect(followUp().querySelector('[data-command] code')?.textContent).toBe('claude --resume 5f0c1e2a-0000-4000-8000-000000000001');
    // A terminal session has no Herdr pane to show.
    expect(followUp().textContent).not.toContain('Herdr pane');
    expect(followUp().textContent).toContain('pipeline-observer');
  });

  test('1-TASK-F1 without a verified session on the item branch the drawer says so, with no agent name and no command', async () => {
    // Dev Activity lists `feat/c++`, but the view leaves out a session whose branch is not public text.
    const base = busy();
    const plus = { id: `${HARNESS_ID}:feat/c++`, repository_id: HARNESS_ID, branch: 'feat/c++', title: 'Build on a branch with a plus sign', column: 'building',
      hidden: null, column_since: null, worktrees: [], pull_request: null };
    const snapshot = decodeDevActivitySnapshot(JSON.parse(JSON.stringify({ ...base, items: [...base.items, plus] })));
    // chore/oar-0-45: its session's provider exited, so the view has it only as unverified.
    for (const branch of ['chore/oar-0-45', 'feat/c++']) {
      drawerAt(`${HARNESS_ID}:${branch}`);
      await mount(<OperatorApp {...props(snapshot, { initialLocale: 'zh', readExecution: sessions })} />);
      await settle();
      const none = followUp().querySelector('[data-owner="none"]')!;
      expect(none.textContent).toBe('没有已验证的会话');
      expect(none.querySelector('[data-dot="unknown"]')).not.toBeNull();
      for (const name of ['Codex', 'Claude Code', 'implementer']) expect(followUp().textContent).not.toContain(name);
      expect(followUp().querySelectorAll('[data-command], button')).toHaveLength(0);
      await act(async () => root?.unmount());
      root = null;
    }
  });

  test('the drawer states a read in flight, a pending collection and an unreadable route, never as no session', async () => {
    const site = busy().repositories[1]!.repository_id;
    const states: [string, ExecutionReader, string, string][] = [
      [`${HARNESS_ID}:feat/kanban-human-redesign`, () => new Promise(() => {}), 'reading', 'Reading…'],
      [`${site}:fix/csp-header`, sessions, 'pending', 'Task execution state is not collected yet'],
      [`${HARNESS_ID}:feat/kanban-human-redesign`, async () => ({ state: 'unavailable', reason: 'execution_state_unavailable' }), 'unavailable',
        'Task execution state unavailable · The task session records could not be read'],
    ];
    for (const [id, readExecution, state, text] of states) {
      drawerAt(id);
      await mount(<OperatorApp {...props(busy(), { readExecution })} />);
      await settle();
      expect(followUp().querySelector(`[data-owner="${state}"]`)?.textContent).toBe(text);
      expect(followUp().querySelectorAll('[data-owner="none"], [data-owner="verified"], [data-command], button')).toHaveLength(0);
      // A card names no agent unless the route answered with a verified session.
      expect(card(id).querySelector('[data-agent]')).toBeNull();
      await act(async () => root?.unmount());
      root = null;
    }
  });

  test('a card names the agent of its verified session, and no other card names one', async () => {
    await mount(<OperatorApp {...props(busy(), { readExecution: sessions })} />);
    await settle();
    expect(card(`${HARNESS_ID}:feat/kanban-human-redesign`).querySelector('[data-agent="verified"]')?.textContent).toBe('Codex');
    expect(card(`${HARNESS_ID}:feat/pipeline-observer`).querySelector('[data-agent="verified"] [data-dot="active"]')).not.toBeNull();
    const named = cards().filter(element => element.querySelector('[data-agent]') !== null).map(element => element.getAttribute('data-item-id'));
    expect(named).toEqual([`${HARNESS_ID}:feat/kanban-human-redesign`, `${HARNESS_ID}:feat/pipeline-observer`]);
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

  test('G23 the cleanup signal comes only from green worktrees of the same repository and branch', async () => {
    const reclaimable = () => cards().filter(element => element.querySelector('[data-reclaimable]')).map(element => element.getAttribute('data-item-id')).sort();
    await mount(<OperatorApp {...props(busy())} />);
    // Green rows: feat/kanban-status and feat/pi-host in repo-harness, fix/footer in operator-site. Red, yellow and unassigned rows never join.
    const site = busy().repositories[1]!.repository_id;
    expect(reclaimable()).toEqual([`${HARNESS_ID}:feat/kanban-status`, `${HARNESS_ID}:feat/pi-host`, `${site}:fix/footer`].sort());
    expect(card(`${HARNESS_ID}:feat/kanban-status`).textContent).toContain('worktree left over');

    // The Dev Activity item still lists its worktree; a yellow verdict alone removes the signal.
    await act(async () => root?.unmount());
    const yellow = rejudged({ 'feat-kanban-status': { judgment: 'yellow', reasons: ['locked'] } });
    await mount(<OperatorApp {...props(busy(), { initialWorktrees: yellow, readWorktrees: async () => yellow })} />);
    expect(busy().items.find(item => item.id === `${HARNESS_ID}:feat/kanban-status`)!.worktrees).toHaveLength(1);
    expect(card(`${HARNESS_ID}:feat/kanban-status`).querySelector('[data-reclaimable]')).toBeNull();

    // A green row on the same branch name in another repository does not join.
    await act(async () => root?.unmount());
    const elsewhere = rejudged({ 'feat-kanban-status': { judgment: 'yellow', reasons: ['locked'] }, 'operator-site-wt-footer': { branch: 'feat/kanban-status' } });
    await mount(<OperatorApp {...props(busy(), { initialWorktrees: elsewhere, readWorktrees: async () => elsewhere })} />);
    expect(card(`${HARNESS_ID}:feat/kanban-status`).querySelector('[data-reclaimable]')).toBeNull();
    expect(card(`${site}:fix/footer`).querySelector('[data-reclaimable]')).toBeNull();
  });

  test('G23 without worktree data no card claims a cleanup', async () => {
    await mount(<OperatorApp {...props(busy(), { initialWorktrees: undefined, readWorktrees: async () => { throw new Error('down'); } })} />);
    await settle();
    expect(cards().length).toBeGreaterThan(5);
    expect(document.querySelectorAll('[data-reclaimable]')).toHaveLength(0);
    await act(async () => root?.unmount());
    await mount(<OperatorApp {...props(busy(), { initialWorktrees: unavailableWorktrees(), readWorktrees: async () => unavailableWorktrees() })} />);
    expect(document.querySelectorAll('[data-reclaimable]')).toHaveLength(0);
  });

  test('G23 the drawer names the green directories of its branch and nothing for a kept worktree', async () => {
    const id = `${HARNESS_ID}:feat/kanban-status`;
    installDom(`http://127.0.0.1:4318/#board/${encodeURIComponent(id)}`);
    await mount(<OperatorApp {...props(busy())} />);
    const note = document.querySelector('[role="dialog"] [data-reclaimable-worktrees]')!;
    expect(note.getAttribute('data-reclaimable-worktrees')).toBe('1');
    expect(note.textContent).toContain('(feat-kanban-status)');
    expect(note.querySelector('[data-command] code')?.textContent).toBe('git worktree list');
    await key('Escape');
    await act(async () => card(`${HARNESS_ID}:feat/kanban-human-redesign`).querySelector<HTMLButtonElement>('[data-card-open]')!.click());
    expect(document.querySelector('#item-drawer-title')?.textContent).toBe('Rebuild the operator console for humans');
    expect(document.querySelector('[role="dialog"] [data-reclaimable-worktrees]')).toBeNull();
  });
});

const HOME_URL = 'http://127.0.0.1:4318/';
const HEAD = '0123456789abcdef0123456789abcdef01234567';
const midnight = (() => { const day = new Date(NOW); day.setHours(0, 0, 0, 0); return day.getTime(); })();

/** The busy fixture with PR #607 merged today and every other merge before today, whatever the hour. */
function busyToday(): DevActivitySnapshotV2 {
  const snapshot = busy();
  return { ...snapshot, items: snapshot.items.map(item => {
    if (item.pull_request?.state !== 'merged') return item;
    const mergedAt = new Date(item.pull_request.number === 607 ? (midnight + NOW) / 2 : midnight - 60_000).toISOString();
    return { ...item, column_since: mergedAt, pull_request: { ...item.pull_request, merged_at: mergedAt, updated_at: mergedAt, closed_at: mergedAt } };
  }) };
}

/** Three attention rows, oldest first, as the projection sorts them. */
function waitingThree(): DevActivitySnapshotV2 {
  const base = busyToday();
  const [ready] = base.attention;
  const row = (kind: 'changes_requested' | 'merge_conflict', branch: string, summary: string, hours: number) =>
    ({ ...ready!, kind, subject_id: `${HARNESS_ID}:${branch}`, summary, waiting_since: new Date(NOW - hours * 3_600_000).toISOString(), url: null });
  return { ...base, attention: [
    row('changes_requested', 'feat/pipeline-observer', 'Observe pipeline phases on the board', 3),
    row('merge_conflict', 'feat/kanban-human-redesign', 'Rebuild the operator console for humans', 2),
    ready!,
  ] };
}

const noRepairs: CiRepairsReader = async () => ({ state: 'ok', issues: [] });
const todayRow = (id: string) => document.querySelector(`[data-today="${id}"]`)!;

describe('home page', () => {
  test('1-HOME-P1 greets with the waiting count and lists rows by wait with reason, repository, PR and an unknown agent', async () => {
    installDom(HOME_URL);
    const snapshot = waitingThree();
    await mount(<OperatorApp {...props(snapshot, { initialLocale: 'zh', readCiRepairs: noRepairs })} />);
    expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe('home');
    expect(document.querySelector('h1')?.textContent).toContain('有 3 件事等你处理');
    // C6: one pixel character per screen; the rail's carrot is the logo, not a character.
    expect(Array.from(document.querySelectorAll('[data-mascot]')).map(element => element.getAttribute('data-mascot'))).toEqual(['buddy-happy']);
    const rows =Array.from(document.querySelector('section[aria-labelledby="home-waiting"]')!.querySelectorAll('[data-attention-kind]'));
    expect(rows.map(row => row.getAttribute('data-attention-kind'))).toEqual(['changes_requested', 'merge_conflict', 'ready_to_merge']);
    for (const [row, reason, pr] of [[rows[0], '评审要求修改', 'PR #603'], [rows[1], '与 main 冲突', 'PR #608'], [rows[2], '可以合并', 'PR #602']] as const) {
      for (const part of [reason, 'repo-harness', pr, 'agent 未知']) expect(row!.textContent).toContain(part);
      expect(row!.querySelector('[data-agent="unknown"] [data-dot="unknown"]')).not.toBeNull();
    }
    await act(async () => rows[0]!.querySelector<HTMLAnchorElement>(`a[href="#board/${encodeURIComponent(snapshot.attention[0]!.subject_id)}"]`)!.click());
    expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe('board');
    expect(document.querySelector('#item-drawer-title')?.textContent).toBe('Observe pipeline phases on the board');
  });

  test('1-HOME-P1 a row whose item has a verified session names its agent; every other row stays agent unknown', async () => {
    installDom(HOME_URL);
    await mount(<OperatorApp {...props(waitingThree(), { initialLocale: 'zh', readCiRepairs: noRepairs, readExecution: sessions })} />);
    await settle();
    const agents = (group: string) => Array.from(document.querySelectorAll(`section[aria-labelledby="${group}"] [data-agent]`)).map(cell => cell.textContent);
    expect(agents('home-waiting')).toEqual(['Claude Code', 'Codex', 'agent 未知']);
    expect(document.querySelector('[data-attention-kind="changes_requested"] [data-agent="verified"] [data-dot="active"]')).not.toBeNull();
    // Continue: repo-harness has no session on its branch and operator-site is still collecting.
    const continuing = agents('home-continue');
    expect(continuing.length).toBeGreaterThan(0);
    expect(new Set(continuing)).toEqual(new Set(['agent 未知']));
  });

  test('1-HOME-N1 offers no document session input, agent picker or start button, and Continue lists tasks only', async () => {
    installDom(HOME_URL);
    const snapshot = busyToday();
    await mount(<OperatorApp {...props(snapshot, { readCiRepairs: noRepairs })} />);
    const home = document.querySelector('[data-home]')!;
    expect(home.querySelectorAll('input, textarea, select, form, [contenteditable]')).toHaveLength(0);
    // The only buttons on Home fold a list.
    expect(home.querySelectorAll('button:not([aria-expanded])')).toHaveLength(0);
    const continuing = Array.from(home.querySelectorAll('[data-continue-item]')).map(row => row.getAttribute('data-continue-item'));
    expect(continuing.length).toBeGreaterThan(0);
    for (const id of continuing) expect(['building', 'verifying']).toContain(snapshot.items.find(item => item.id === id)!.column);
    expect(continuing).not.toContain(snapshot.attention[0]!.subject_id);
  });

  test('1-HOME-P2 Today has merged, the three longest waits, failed checks and CI repair, each linked to the page that owns it', async () => {
    installDom(HOME_URL);
    const snapshot = waitingThree();
    const issue = { number: 1101, title: '[CI repair] daily full run failed', url: 'https://github.com/Ancienttwo/repo-harness/issues/1101' };
    const reads: string[] = [];
    await mount(<OperatorApp {...props(snapshot, { readCiRepairs: async id => {
      reads.push(id);
      return id === HARNESS_ID ? { state: 'ok', issues: [issue] } : { state: 'unavailable', reason: 'no_daily_run' };
    } })} />);
    await settle();
    expect(Array.from(document.querySelectorAll('[data-today]')).map(row => row.getAttribute('data-today'))).toEqual(['merged', 'longest', 'failed', 'repairs', 'reclaimable']);
    // Green: feat-kanban-status 612 MB, operator-site-wt-footer 210 MB, repo-harness-wt-pi-host unmeasured.
    expect(todayRow('reclaimable').getAttribute('data-state')).toBe('ready');
    expect(todayRow('reclaimable').textContent).toContain('822 MB · size unknown: 1');
    expect(todayRow('reclaimable').querySelector('a[href="#worktrees"]')).not.toBeNull();
    expect(todayRow('merged').textContent).toContain('PRs merged: 1');
    expect(Array.from(todayRow('longest').querySelectorAll('ul a')).map(link => link.getAttribute('href')))
      .toEqual(snapshot.attention.map(row => `#board/${encodeURIComponent(row.subject_id)}`));
    expect(todayRow('failed').textContent).toContain('Open PRs: 1');
    expect(todayRow('failed').querySelector('ul a')?.textContent).toBe('Rewrite billing copy');
    for (const id of ['merged', 'longest', 'failed']) expect(todayRow(id).querySelector('a[href="#board"]')).not.toBeNull();
    expect(todayRow('repairs').getAttribute('data-state')).toBe('ready');
    expect(todayRow('repairs').textContent).toContain('Open issues: 1');
    expect(todayRow('repairs').querySelector(`a[href="${issue.url}"]`)?.textContent).toContain('#1101');
    expect(todayRow('repairs').querySelector('[data-repairs-reason="no_daily_run"]')?.textContent).toContain('operator-site');
    // Only repositories with a GitHub remote are asked.
    expect(reads.sort()).toEqual(snapshot.repositories.filter(row => row.github !== null).map(row => row.repository_id).sort());
  });

  test('1-HOME-F1 a merged-PR query over the limit marks only Merged unavailable, with its reason and no count', async () => {
    installDom(HOME_URL);
    const base = busyToday();
    const snapshot: DevActivitySnapshotV2 = { ...base, repositories: base.repositories.map(row => row.repository_id !== HARNESS_ID ? row : {
      ...row, sources: row.sources.map(source => source.kind === 'github' ? { ...source, status: 'unavailable' as const, reason: 'github_truncated_merged' } : source),
    }) };
    await mount(<OperatorApp {...props(snapshot, { readCiRepairs: noRepairs })} />);
    await settle();
    expect(todayRow('merged').getAttribute('data-state')).toBe('unavailable');
    expect(todayRow('merged').textContent).toContain('Unavailable · more merged PRs than one query reads in repo-harness');
    expect(todayRow('merged').textContent).not.toContain('PRs merged');
    for (const id of ['longest', 'failed', 'repairs']) expect(todayRow(id).getAttribute('data-state')).toBe('ready');
    // Dropping merged PRs leaves open work complete, so no source banner claims GitHub failed.
    expect(document.querySelector('[data-source-banner]')).toBeNull();
  });

  test('1-WT-F1 reclaimable space on Home never counts an unmeasured size as 0 B and names a missing collection', async () => {
    installDom(HOME_URL);
    const unmeasured = rejudged({ 'feat-kanban-status': { size_bytes: null, size_observed_at: null }, 'operator-site-wt-footer': { judgment: 'yellow', reasons: ['locked'] } });
    await mount(<OperatorApp {...props(busyToday(), { readCiRepairs: noRepairs, initialWorktrees: unmeasured, readWorktrees: async () => unmeasured })} />);
    await settle();
    expect(todayRow('reclaimable').textContent).toContain('size unknown: 2');
    expect(todayRow('reclaimable').textContent).not.toContain('0 B');
    await act(async () => root?.unmount());
    root = null; document.body.innerHTML = '';

    await mount(<OperatorApp {...props(busyToday(), { readCiRepairs: noRepairs, initialWorktrees: unavailableWorktrees(), readWorktrees: async () => unavailableWorktrees() })} />);
    await settle();
    expect(todayRow('reclaimable').getAttribute('data-state')).toBe('unavailable');
    expect(todayRow('reclaimable').textContent).toContain('Unavailable');
    for (const id of ['merged', 'longest', 'failed']) expect(todayRow(id).getAttribute('data-state')).toBe('ready');
  });

  test('a failed GitHub source gets one banner with the source, the repository and the System page', async () => {
    installDom(HOME_URL);
    const base = busyToday();
    const snapshot: DevActivitySnapshotV2 = { ...base, repositories: base.repositories.map(row => row.github === null ? row : {
      ...row, sources: row.sources.map(source => source.kind === 'github' ? { ...source, status: 'unavailable' as const, reason: 'gh_auth_failed' } : source),
    }) };
    await mount(<OperatorApp {...props(snapshot, { readCiRepairs: noRepairs })} />);
    await settle();
    const banners = document.querySelectorAll('[data-source-banner]');
    expect(banners).toHaveLength(1);
    expect(banners[0]!.textContent).toContain('GitHub is unavailable for repo-harness · other failed sources: 1');
    expect(banners[0]!.querySelector('a[href="#system"]')).not.toBeNull();
    expect(document.querySelector('[data-mascot]')?.getAttribute('data-mascot')).toBe('cloud-off');
    // Every GitHub source failed, so the rows that read GitHub say so instead of showing 0.
    for (const id of ['merged', 'longest', 'failed']) expect(todayRow(id).getAttribute('data-state')).toBe('unavailable');
  });

  test('1-SHELL-F1 without the operator service Home states it with the serve command, not an empty page', async () => {
    installDom(HOME_URL);
    await mount(<OperatorApp {...props(busy(), { initialDevActivity: undefined, fetchDevActivity: async () => { throw new Error('down'); } })} />);
    await settle();
    expect(document.querySelector('[data-home]')).toBeNull();
    expect(document.querySelector('main')?.textContent).toContain('The operator service is not running');
    expect(document.querySelector('main')?.textContent).toContain('repo-harness operator serve');
    expect(document.querySelector('[data-operator-status]')?.getAttribute('data-operator-status')).toBe('unreachable');
  });
});

const WORKTREES_URL = 'http://127.0.0.1:4318/#worktrees';
const group = (id: string) => document.querySelector<HTMLElement>(`[data-worktree-group="${id}"]`)!;
const worktreeRow = (directory: string) => Array.from(document.querySelectorAll<HTMLElement>('[data-worktree]'))
  .find(row => row.querySelector('[data-directory]')?.textContent === directory)!;

describe('worktree page', () => {
  test('#worktrees is a Work page after Repositories and refuses a parameter', async () => {
    expect(parseWorkspaceLocation('#worktrees')).toEqual({ workspace: 'worktrees', module: null, item: null });
    expect(workspaceHash({ workspace: 'worktrees', module: null, item: null })).toBe('#worktrees');
    expect(parseWorkspaceLocation('#worktrees/wt_0').workspace).toBe('home');
    installDom(HOME_URL);
    await mount(<OperatorApp {...props(busy(), { readCiRepairs: noRepairs })} />);
    const work = Array.from(document.querySelectorAll('ul[aria-labelledby="nav-group-work"] a[data-workspace]')).map(link => link.getAttribute('data-workspace'));
    expect(work).toEqual(['board', 'repositories', 'worktrees']);
    await act(async () => document.querySelector<HTMLAnchorElement>('.workspace-nav a[data-workspace="worktrees"]')!.click());
    expect(window.location.hash).toBe('#worktrees');
    expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe('worktrees');
    expect(document.querySelector('.workspace-nav a[data-workspace="worktrees"]')?.getAttribute('aria-current')).toBe('page');
    expect(document.querySelector('[data-freshness]')?.getAttribute('data-freshness-source')).toBe('worktrees');
    expect(document.querySelector('[data-freshness]')?.textContent).toBe('Worktrees collected 2m ago');
  });

  test('1-WT-P1 groups by repository with a disk bar, judgment counts and each row\'s facts', async () => {
    installDom(WORKTREES_URL);
    await mount(<OperatorApp {...props(busy())} />);
    const site = busy().repositories[1]!.repository_id, docs = busy().repositories[2]!.repository_id;
    expect(Array.from(document.querySelectorAll('[data-worktree-group]')).map(section => section.getAttribute('data-worktree-group'))).toEqual([HARNESS_ID, site, docs, 'unassigned']);
    const harness = group(HARNESS_ID);
    expect(harness.querySelector('h2')?.textContent).toBe('repo-harness8');
    const counts = Object.fromEntries(Array.from(harness.querySelectorAll('[data-judgment-count]')).map(item => [item.getAttribute('data-judgment-count'), item.getAttribute('data-count')]));
    expect(counts).toEqual({ green: '2', yellow: '4', red: '2' });
    // The bar shares measured bytes only: green is the 612 MB row; pi-host has no size.
    const segments = Object.fromEntries(Array.from(harness.querySelectorAll('[data-disk-segment]')).map(item => [item.getAttribute('data-disk-segment'), Number(item.getAttribute('data-bytes'))]));
    expect(segments).toEqual({ green: 612 * MB, yellow: (380 + 96 + 254 + 41) * MB, red: (1843 + 702) * MB });
    expect(document.querySelector('[data-reclaimable]')?.getAttribute('data-reclaimable')).toBe(String(822 * MB));
    expect(document.querySelector('[data-reclaimable]')?.textContent).toBe('Reclaimable · 822 MB · size unknown: 1');

    const kept = worktreeRow('repo-harness-wt-kanban-redesign');
    expect(kept.getAttribute('data-judgment')).toBe('red');
    expect(Array.from(kept.querySelectorAll('[data-reason]')).map(item => item.getAttribute('data-reason'))).toEqual(['process_in_use', 'dirty', 'unpushed']);
    expect(kept.textContent).toContain('feat/kanban-human-redesign');
    expect(kept.querySelector('[data-source]')?.textContent).toBe('contract worktree');
    expect(kept.querySelector('[data-merge]')?.textContent).toBe('not merged');
    expect(kept.querySelector('[data-processes]')?.textContent).toContain('processes using it: 2');
    expect(kept.querySelector('[data-loss]')?.textContent).toBe('Would lose: unpushed commits: 3 · uncommitted files: 4');
    expect(kept.querySelector('[data-size]')?.textContent).toBe('702 MB');
    const record = kept.querySelector('details[data-record="open"]')!;
    expect(record.hasAttribute('open')).toBe(false);
    expect(record.querySelector('summary')?.textContent).toBe('Record · Rebuild the operator console for humans');
    expect(record.textContent).toContain('#608');

    const green = worktreeRow('feat-kanban-status');
    expect(green.querySelectorAll('[data-reason]')).toHaveLength(0);
    expect(green.querySelector('[data-merge]')?.textContent).toBe('merged on GitHub');
    expect(green.querySelector('[data-processes]')).toBeNull();
    expect(worktreeRow('repo-harness-wt-old-spike').querySelector('[data-record]')?.getAttribute('data-record')).toBe('none');
    expect(worktreeRow('repo-harness-wt-old-spike').textContent).toContain('no branch');
  });

  test('1-WT-P1 directories no repository can claim list under Unassigned with unknown occupancy and no repository id', async () => {
    installDom(WORKTREES_URL);
    await mount(<OperatorApp {...props(busy())} />);
    const unassigned = group('unassigned');
    expect(unassigned.querySelector('h2')?.textContent).toBe('Unassigned directories2');
    const orphan = worktreeRow('codex-91c2');
    expect(unassigned.contains(orphan)).toBe(true);
    expect(orphan.querySelector('[data-source]')?.textContent).toBe('Codex');
    expect(orphan.querySelector('[data-processes]')?.getAttribute('data-processes')).toBe('unknown');
    expect(orphan.querySelector('[data-loss]')?.textContent).toBe('Would lose: unpushed commits unknown · uncommitted files unknown · ignored entries unknown');
    expect(worktreeRow('mcp-ws-4410').querySelector('[data-size]')?.textContent).toBe('size unknown');
    expect(unassigned.textContent).not.toMatch(PRIVATE_LABEL);
  });

  test('1-WT-F1 a size du could not finish reads unknown with its last measurement and is never counted as 0 B', async () => {
    installDom(WORKTREES_URL);
    await mount(<OperatorApp {...props(busy())} />);
    const timedOut = worktreeRow('repo-harness-wt-pi-host');
    expect(timedOut.getAttribute('data-judgment')).toBe('green');
    expect(timedOut.querySelector('[data-size]')?.getAttribute('data-size')).toBe('unknown');
    expect(timedOut.querySelector('[data-size]')?.textContent).toBe('size unknown · last measured 3h ago');
    expect(group(HARNESS_ID).querySelector('[data-judgment-count="green"]')?.textContent).toContain('612 MB · size unknown: 1');
    expect(document.querySelector('main')?.textContent).not.toContain('0 B');
  });

  // 5.1 (#1024) adds the green-only cleanup, so checkboxes and the clean button are expected now; 5-WT-N1 below owns their rules.
  test('1-WT-N1 offers no agent control, shows no absolute path and gives no age as a reason', async () => {
    installDom(WORKTREES_URL);
    await mount(<OperatorApp {...props(busy())} />);
    await settle();
    const main = document.querySelector('main')!;
    expect(main.querySelectorAll('select, textarea, form, [draggable="true"], [contenteditable], [data-write-action]')).toHaveLength(0);
    for (const input of main.querySelectorAll('input')) expect(input.matches('input[type="checkbox"][data-select]')).toBe(true);
    for (const button of main.querySelectorAll('button')) expect(button.matches('[data-clean]') || button.closest('[data-command]') !== null).toBe(true);
    for (const word of ['Delete', 'Prune', 'Let the agent']) expect(main.textContent).not.toContain(word);
    for (const cell of main.querySelectorAll('[data-directory]')) expect(cell.textContent).not.toContain('/');
    expect(main.textContent).not.toMatch(/(?:^|[\s(])(?:\/(?:Users|home|tmp|private|var)\/|~\/)/u);
    const reasons = Array.from(main.querySelectorAll('[data-worktree] [data-reason]'));
    expect(reasons.length).toBeGreaterThan(0);
    for (const reason of reasons) {
      expect(WORKTREE_REASONS).toContain(reason.getAttribute('data-reason') as typeof WORKTREE_REASONS[number]);
      expect(reason.textContent).not.toMatch(/\bago\b|\bold\b|\bdays?\b|\bweeks?\b|\bhours?\b/u);
    }
  });

  test('pending, unreachable and partial collections each say so', async () => {
    installDom(WORKTREES_URL);
    await mount(<OperatorApp {...props(busy(), { initialWorktrees: unavailableWorktrees(), readWorktrees: async () => unavailableWorktrees() })} />);
    expect(document.querySelector('[data-worktrees-page]')?.getAttribute('data-worktrees-page')).toBe('pending');
    expect(document.querySelector('main')?.textContent).toContain('No worktree data yet');
    expect(document.querySelector('[data-freshness]')?.textContent).toBe('No worktree collection yet');
    await act(async () => root?.unmount());
    root = null; document.body.innerHTML = '';

    await mount(<OperatorApp {...props(busy(), { initialWorktrees: undefined, readWorktrees: async () => { throw new Error('down'); } })} />);
    await settle();
    expect(document.querySelector('[data-worktrees-page]')?.getAttribute('data-worktrees-page')).toBe('unreachable');
    expect(document.querySelector('main')?.textContent).toContain('repo-harness operator serve');
    expect(document.querySelector('[data-freshness]')?.getAttribute('data-freshness')).toBe('failed');
    await act(async () => root?.unmount());
    root = null; document.body.innerHTML = '';

    const degraded = decodeWorktrees(degradedWorktrees(NOW));
    await mount(<OperatorApp {...props(busy(), { initialWorktrees: degraded, readWorktrees: async () => degraded })} />);
    expect(document.querySelector('[data-worktrees-page]')?.getAttribute('data-worktrees-page')).toBe('partial');
    expect(document.querySelector('main')?.textContent).toContain('Some repositories could not be read');
    const site = busy().repositories[1]!.repository_id;
    expect(group(site).getAttribute('data-status')).toBe('unavailable');
    expect(group(site).textContent).toContain('The worktrees of this repository could not be read.');
    expect(document.querySelector('[data-worktree-group="unassigned"]')).toBeNull();
    expect(document.querySelector('[data-freshness]')?.textContent).toBe('Worktrees collected 5m ago · repos unreadable: 1');
  });

  test('the worktree cache is read only on Home, Board and Worktree, and a failed refresh keeps the last rows', async () => {
    installDom('http://127.0.0.1:4318/#repositories');
    const snapshot = trees();
    let reads = 0, fail = false;
    await mount(<OperatorApp {...props(busy(), { initialWorktrees: undefined, readWorktrees: async () => { reads++; if (fail) throw new Error('down'); return snapshot; } })} />);
    const go = (workspace: string) => act(async () => document.querySelector<HTMLAnchorElement>(`.workspace-nav a[data-workspace="${workspace}"]`)!.click());
    expect(reads).toBe(0);
    await go('worktrees');
    expect(reads).toBe(1);
    await go('repositories');
    expect(reads).toBe(1);
    fail = true;
    await go('worktrees');
    expect(reads).toBe(2);
    expect(document.querySelector('[data-worktrees-page]')?.getAttribute('data-worktrees-page')).toBe('refresh-failed');
    expect(document.querySelectorAll('[data-worktree]').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-freshness]')?.textContent).toBe('Refresh failed · showing worktrees from 2m ago');
  });
});

const CLEANUP_PATH = '/api/v1/worktrees/cleanup';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const GREEN = ['feat-kanban-status', 'repo-harness-wt-pi-host', 'operator-site-wt-footer'];
const rowOf = (directory: string) => [...trees().repositories.flatMap(repository => repository.worktrees), ...trees().unassigned].find(tree => tree.directory === directory)!;
const checkbox = (directory: string) => worktreeRow(directory).querySelector<HTMLInputElement>('input[data-select]')!;
const cleanButton = () => document.querySelector<HTMLButtonElement>('button[data-clean]')!;
const cleanupResult = () => document.querySelector<HTMLElement>('[data-cleanup-result]');
/** Waits on the page's own async work (crypto.subtle, the write, the reload) until `ready` holds. */
async function until(ready: () => boolean): Promise<void> {
  for (let turn = 0; turn < 50 && !ready(); turn++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(ready()).toBe(true);
}
/** The server's error envelope (write-run.ts) with the effect's own sentences (effects/operator/worktree-cleanup.ts). */
const REFUSAL_BODIES = {
  digest_changed: { status: 409, message: 'A selected worktree changed or is no longer listed. Nothing was removed.', next_action: 'Reload the worktree list, select again, then send a new request_id.' },
  in_use: { status: 422, message: 'A selected worktree is in use. Nothing was removed.', next_action: 'Stop the process or session that uses it, reload the list, then send a new request_id.' },
  not_approved: { status: 422, message: 'A selected worktree is not green. Nothing was removed.', next_action: 'Select only green worktrees. A non-green worktree needs a cleanup session.' },
  inventory_unavailable: { status: 503, message: 'The worktree inventory cannot be read. Nothing was removed.', next_action: 'Check the registered repositories, then send a new request_id.' },
  busy: { status: 503, message: 'Another write to this target is running.', next_action: 'Wait for the other write to finish, then retry with the same request_id.' },
} as const;
const refusalResponse = (code: keyof typeof REFUSAL_BODIES) => {
  const { status, message, next_action } = REFUSAL_BODIES[code];
  return Response.json({ error: { code, message, next_action } }, { status });
};

interface CleanupCall { readonly method: string; readonly url: string; readonly headers: Headers; readonly body: Record<string, unknown> }

/** Answers POST /api/v1/worktrees/cleanup in order through the real `postWorktreeCleanup` and its decoders. */
function serveCleanup(answers: (() => Response)[]): { readonly calls: CleanupCall[]; readonly restore: () => void } {
  const original = globalThis.fetch;
  const calls: CleanupCall[] = [];
  globalThis.fetch = (async (url: unknown, options?: RequestInit) => {
    if (String(url) !== CLEANUP_PATH) return new Response(null, { status: 404 });
    calls.push({ method: options?.method ?? 'GET', url: String(url), headers: new Headers(options?.headers), body: JSON.parse(String(options?.body)) as Record<string, unknown> });
    return answers[calls.length - 1]!();
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

describe('worktree cleanup (5.1)', () => {
  test('5-WT-P1 the checked green rows go out as ids and the server digest, and each item reports removed or skipped', async () => {
    installDom(WORKTREES_URL);
    const snapshot = trees();
    let reads = 0;
    const footer = rowOf('operator-site-wt-footer'), status = rowOf('feat-kanban-status'), piHost = rowOf('repo-harness-wt-pi-host');
    const server = serveCleanup([
      () => Response.json({ protocol: 1, kind: 'operator_worktree_cleanup', items: [
        { id: status.id, repository_id: status.repository_id, directory: status.directory, outcome: 'removed', reason: null },
        { id: footer.id, repository_id: footer.repository_id, directory: footer.directory, outcome: 'skipped', reason: 'process_in_use' },
      ] }),
      () => Response.json({ protocol: 1, kind: 'operator_worktree_cleanup', items: [
        { id: piHost.id, repository_id: piHost.repository_id, directory: piHost.directory, outcome: 'removed', reason: null },
        { id: footer.id, repository_id: footer.repository_id, directory: footer.directory, outcome: 'skipped', reason: 'changed' },
      ] }),
    ]);
    try {
      await mount(<OperatorApp {...props(busy(), { initialWorktrees: snapshot, readWorktrees: async () => { reads++; return snapshot; } })} />);
      for (const directory of GREEN) expect(checkbox(directory).checked).toBe(true);
      expect(cleanButton().textContent).toBe('Clean 3 selected');
      await act(async () => checkbox('repo-harness-wt-pi-host').click());
      expect(cleanButton().textContent).toBe('Clean 2 selected');

      const readsBefore = reads;
      await act(async () => cleanButton().click());
      await until(() => cleanupResult()?.getAttribute('data-cleanup-result') === 'cleaned');
      expect(server.calls).toHaveLength(1);
      const [first] = server.calls;
      expect([first!.method, first!.url, first!.headers.get('content-type')]).toEqual(['POST', CLEANUP_PATH, 'application/json']);
      expect(Object.keys(first!.body).sort()).toEqual(['expected_digest', 'ids', 'request_id']);
      const { request_id: firstId, ...request } = first!.body;
      expect(firstId).toMatch(UUID);
      // The server's own request decoder accepts the body, and the browser digest equals the server's.
      expect(decodeWorktreeCleanupRequest(request)).toEqual({ ids: [status.id, footer.id].sort(), expected_digest: selectionDigest([status, footer].map(worktreeDigestRow)) });
      expect(request.ids).toEqual([status.id, footer.id].sort());

      const result = cleanupResult()!;
      expect(result.querySelector('p')?.textContent).toBe('removed: 1 · skipped: 1');
      const items = Array.from(result.querySelectorAll('[data-cleanup-item]'));
      expect(items.map(item => [item.querySelector('code')?.textContent, item.getAttribute('data-outcome'), item.getAttribute('data-reason')]))
        .toEqual([['feat-kanban-status', 'removed', null], ['operator-site-wt-footer', 'skipped', 'process_in_use']]);
      expect(items[1]!.textContent).toContain('a process is using it');
      await until(() => reads > readsBefore);
      // The collector still lists the removed row until its next cycle; the page marks it and drops it from the selection.
      expect(worktreeRow('feat-kanban-status').querySelector('[data-removed]')).not.toBeNull();
      expect(checkbox('feat-kanban-status').disabled).toBe(true);
      expect(checkbox('feat-kanban-status').checked).toBe(false);
      expect(cleanButton().textContent).toBe('Clean 1 selected');

      await act(async () => checkbox('repo-harness-wt-pi-host').click());
      await act(async () => cleanButton().click());
      await until(() => server.calls.length === 2 && cleanupResult()?.textContent?.includes('it changed after the page read it') === true);
      const second = server.calls[1]!.body;
      expect(second.request_id).toMatch(UUID);
      expect(second.request_id).not.toBe(firstId);
      expect(second.ids).toEqual([piHost.id, footer.id].sort());
      expect(second.expected_digest).toBe(selectionDigest([piHost, footer].map(worktreeDigestRow)));
    } finally { server.restore(); }
  });

  test('5-WT-N1 yellow and red rows cannot be selected, and a 422 or 503 refusal states its code and removes nothing', async () => {
    installDom(WORKTREES_URL);
    const server = serveCleanup([() => refusalResponse('not_approved'), () => refusalResponse('in_use'), () => refusalResponse('inventory_unavailable'), () => refusalResponse('busy'),
      () => Response.json({ error: { code: 'a_code_from_a_newer_server', message: 'Server sentence.', next_action: 'Server next step.' } }, { status: 503 })]);
    try {
      await mount(<OperatorApp {...props(busy())} />);
      for (const row of document.querySelectorAll<HTMLElement>('[data-worktree]')) {
        const box = row.querySelector<HTMLInputElement>('input[data-select]')!;
        const green = row.getAttribute('data-judgment') === 'green';
        expect([box.disabled, box.checked]).toEqual([!green, green]);
      }
      const expected: [string, string][] = [
        ['not_approved', 'A selected worktree is not green. Nothing was removed.'],
        ['in_use', 'A selected worktree is in use. Nothing was removed.'],
        ['inventory_unavailable', 'The worktree inventory cannot be read. Nothing was removed.'],
        ['busy', 'Another worktree cleanup is running. Nothing was removed.'],
        ['a_code_from_a_newer_server', 'Server sentence.'],
      ];
      for (const [index, [code, message]] of expected.entries()) {
        await act(async () => cleanButton().click());
        await until(() => server.calls.length === index + 1 && cleanupResult()?.getAttribute('data-cleanup-result') === code);
        expect(cleanupResult()!.textContent).toContain(message);
        expect(cleanupResult()!.textContent).toContain(code);
        expect(cleanButton().disabled).toBe(false);
      }
      expect(cleanupResult()!.textContent).toContain('Message from the server:');
      expect(document.querySelectorAll('[data-removed]')).toHaveLength(0);
      expect(new Set(server.calls.map(call => (call.body.ids as string[]).join(',')))).toEqual(new Set([GREEN.map(directory => rowOf(directory).id).sort().join(',')]));
    } finally { server.restore(); }
  });

  test('5-WT-F1 a 409 digest_changed asks for a reload and a new selection, and nothing is marked removed', async () => {
    installDom(WORKTREES_URL);
    const snapshot = trees();
    let reads = 0;
    const server = serveCleanup([() => refusalResponse('digest_changed')]);
    try {
      await mount(<OperatorApp {...props(busy(), { initialWorktrees: snapshot, readWorktrees: async () => { reads++; return snapshot; } })} />);
      await act(async () => checkbox('operator-site-wt-footer').click());
      await act(async () => cleanButton().click());
      await until(() => cleanupResult()?.getAttribute('data-cleanup-result') === 'digest_changed');
      expect(cleanupResult()!.textContent).toContain('A selected worktree changed or is no longer listed. Nothing was removed.');
      expect(cleanupResult()!.textContent).toContain('Reload the list, then select again.');
      expect(document.querySelectorAll('[data-removed]')).toHaveLength(0);

      const readsBefore = reads;
      const reselect = Array.from(cleanupResult()!.querySelectorAll('button')).find(button => button.textContent === 'Reload and select again')!;
      await act(async () => reselect.click());
      await until(() => reads > readsBefore);
      expect(cleanupResult()).toBeNull();
      for (const directory of GREEN) expect(checkbox(directory).checked).toBe(true);
      expect(cleanButton().textContent).toBe('Clean 3 selected');
    } finally { server.restore(); }
  });

  test('C8 a green row copies its one-row clean command; yellow rows have none and red rows show only what occupies them', async () => {
    installDom(WORKTREES_URL);
    await mount(<OperatorApp {...props(busy())} />);
    await until(() => document.querySelectorAll('[data-clean-command]').length === GREEN.length);
    for (const directory of GREEN) {
      const row = rowOf(directory);
      const command = worktreeRow(directory).querySelector('[data-clean-command] [data-command]')!;
      expect(command.querySelector('code')?.textContent).toBe(`repo-harness worktrees clean --ids ${row.id} --expected-digest ${selectionDigest([worktreeDigestRow(row)])}`);
      expect(command.querySelector('button')?.getAttribute('aria-label') ?? command.querySelector('button')?.textContent).toContain('Copy');
    }
    for (const row of document.querySelectorAll<HTMLElement>('[data-worktree]:not([data-judgment="green"])')) expect(row.querySelector('[data-clean-command], [data-command]')).toBeNull();
    const kept = worktreeRow('repo-harness-wt-kanban-redesign');
    expect(kept.querySelector('[data-processes]')?.textContent).toContain('processes using it: 2');
    expect(kept.textContent).not.toContain('repo-harness worktrees clean');
  });
});

describe('side rail', () => {
  const rail = () => document.querySelector<HTMLElement>('[data-nav-rail]')!;
  const repositorySwitch = () => document.querySelector<HTMLButtonElement>('[data-repository-switch]')!;
  const go = (workspace: string) => act(async () => document.querySelector<HTMLAnchorElement>(`.workspace-nav a[data-workspace="${workspace}"]`)!.click());

  test('1-SHELL-P1 the switch sits under the logo; pages across repositories show All repositories, the task drawer its repository', async () => {
    const heads: string[] = [];
    await mount(<OperatorApp {...props(busy(), { readRepositoryHead: async id => { heads.push(id); return HEAD; } })} />);
    expect(rail().children[0]!.querySelector('img[src="/logos/repo-harness-carrot-mark-transparent.svg"]')).not.toBeNull();
    expect(rail().children[1]!.contains(repositorySwitch())).toBe(true);
    expect(repositorySwitch().getAttribute('data-repository-switch')).toBe('scope');
    expect(repositorySwitch().textContent).toContain('All repositories');
    expect(heads).toEqual([]);
    // C7: the language and theme toggles sit at the bottom of the rail beside the operator status.
    const bottom = rail().lastElementChild!;
    expect(bottom.getAttribute('data-operator-status')).toBe('ready');
    expect(bottom.querySelector('.locale-switch')).not.toBeNull();
    expect(bottom.querySelector('button[aria-label^="Theme:"]')).not.toBeNull();

    const id = `${HARNESS_ID}:feat/pipeline-observer`;
    await act(async () => card(id).querySelector<HTMLButtonElement>('[data-card-open]')!.click());
    await settle();
    expect(repositorySwitch().getAttribute('data-repository-switch')).toBe('current');
    expect(repositorySwitch().getAttribute('data-selected')).toBe(HARNESS_ID);
    const [owner] = busy().repositories[0]!.github!.split('/');
    expect(repositorySwitch().querySelector('[data-switch-detail]')?.textContent).toBe(`${owner} · main · ${HEAD.slice(0, 7)}`);
    expect(heads).toContain(HARNESS_ID);

    // Picking another repository from the drawer closes it and scopes the board.
    const site = busy().repositories[1]!.repository_id;
    await act(async () => repositorySwitch().click());
    await act(async () => document.querySelector<HTMLButtonElement>(`[data-switch-option="${site}"]`)!.click());
    expect(window.location.hash).toBe('#board');
    expect(document.querySelector('#item-drawer-title')).toBeNull();
    expect(repositorySwitch().getAttribute('data-repository-switch')).toBe('scope');
    expect(repositorySwitch().getAttribute('data-selected')).toBe(site);
    expect(cards().every(element => element.getAttribute('data-item-id')!.startsWith(`${site}:`))).toBe(true);

    await act(async () => root?.unmount());
    root = null;
    window.happyDOM.abort();
    installDom(HOME_URL);
    await mount(<OperatorApp {...props(busy(), { initialLocale: 'zh', readCiRepairs: noRepairs })} />);
    expect(Array.from(document.querySelectorAll('.workspace-nav [id^="nav-group-"]')).map(group => group.textContent)).toEqual(['工作', '接入', '观测']);
    expect(repositorySwitch().textContent).toContain('范围');
    expect(repositorySwitch().textContent).toContain('全部仓库');
  });

  test('1-SHELL-P2 architecture opens the 64 px icon bar, other pages open expanded, and each choice stays in this browser', async () => {
    await mount(<OperatorApp {...props(busy())} />);
    const toggle = () => act(async () => document.querySelector<HTMLButtonElement>('[data-rail-toggle]')!.click());
    expect(rail().getAttribute('data-nav-rail')).toBe('expanded');
    await go('architecture');
    expect(rail().getAttribute('data-nav-rail')).toBe('collapsed');
    expect(rail().className).toContain('rail:w-16');
    expect(document.querySelector('.workspace-nav a[data-workspace="board"]')?.getAttribute('title')).toBe('Board');
    await toggle();
    expect(rail().getAttribute('data-nav-rail')).toBe('expanded');
    expect(localStorage.getItem(`${OPERATOR_RAIL_STORAGE_KEY}:architecture`)).toBe('expanded');
    await go('board');
    expect(rail().getAttribute('data-nav-rail')).toBe('expanded');
    await toggle();
    expect(rail().getAttribute('data-nav-rail')).toBe('collapsed');
    expect(localStorage.getItem(`${OPERATOR_RAIL_STORAGE_KEY}:pages`)).toBe('collapsed');

    await act(async () => root?.unmount());
    root = null;
    await mount(<OperatorApp {...props(busy())} />);
    expect(rail().getAttribute('data-nav-rail')).toBe('collapsed');
    await go('architecture');
    expect(rail().getAttribute('data-nav-rail')).toBe('expanded');
  });
});

describe('theme', () => {
  test('Paper and Ink are projected from tokens.json for both modes, with no value restated', () => {
    const css = designTokenStylesheet();
    const [light, dark] = css.split(':root[data-mode="dark"]');
    const palette = new Map(tokens.color.tokens.flatMap(token => typeof token.value === 'string' ? [[token.name, token.value] as const] : []));
    const value = (raw: string) => palette.get(/^\{(.+)\}$/u.exec(raw)?.[1] ?? '') ?? raw;
    let themed = 0;
    for (const token of tokens.color.tokens) {
      if (typeof token.value === 'string') {
        expect(css).not.toContain(`--${token.name}:`);
        continue;
      }
      themed += 1;
      expect(light).toContain(`--${token.name}: ${value(token.value.light)};`);
      expect(dark).toContain(`--${token.name}: ${value(token.value.dark)};`);
    }
    expect(themed).toBeGreaterThan(40);
    for (const family of Object.keys(tokens.type.families)) expect(light).toContain(`--font-${family}: `);
    for (const group of tokens.type.groups) for (const style of group.styles) expect(css).toContain(`.type-${style.name} {`);
  });

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
    expect(markup).toContain('data-attention-count="1"');
  });
});
