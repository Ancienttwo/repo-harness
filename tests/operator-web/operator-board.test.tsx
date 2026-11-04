import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';

import tokens from '../../docs/design/operator-console/design-system/tokens.json';
import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import type { DevActivitySnapshotV2 } from '../../src/core/dev-activity/types';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';
import { cleanCommand } from '../../src/cli/commands/worktrees';
import { decodeWorktreeCleanupRequest, worktreeDigestRow } from '../../src/core/operator/worktree-cleanup';
import { decodeWorktrees, unavailableWorktrees, WORKTREE_REASONS, type WorktreesSnapshot } from '../../src/core/operator/worktrees';
import { selectionDigest } from '../../src/effects/operator/worktree-cleanup';
import { createCleanupPlan, type CleanupObservation } from '../../src/effects/operator/worktree-cleanup-plan';
import { documentTitle, OPERATOR_BOARD_REPOSITORY_STORAGE_KEY, OperatorApp, type OperatorAppProps } from '../../src/operator-web/App';
import { evaluateBoardAttention } from '../../src/core/board/attention';
import { decodeBoard, type BoardV1 } from '../../src/core/board/board';
import { fetchBoard, fetchBoardParents, type BoardParentsRead, type BoardSubject } from '../../src/operator-web/board-view';
import board1474 from '../../src/operator-web/fixtures/board-1474.json';
import boardParents from '../../src/operator-web/fixtures/board-parents.json';
import { decodeBoardParents } from '../../src/core/board/parents';
import { designTokenStylesheet } from '../../src/operator-web/design-tokens';
import { OPERATOR_RAIL_STORAGE_KEY } from '../../src/operator-web/NavRail';
import { fetchExecution, fetchTaskMessages, itemOwner, type CiRepairsReader, type ExecutionReader, type TaskMessagesReader } from '../../src/operator-web/repository-reads';
import { fixtureProps, FIXTURE_NAMES } from '../../src/operator-web/fixtures';
import {
  busyDevActivity,
  busyExecution,
  busyRuntimeOverlay,
  busyTaskMessages,
  degradedDevActivity,
  emptyDevActivity,
  emptyExecution,
  HARNESS_ID,
  INBOX_TASK,
} from '../../src/operator-web/fixtures/dev-activity';
import { busyWorktrees, cleanupPlanFixture, degradedWorktrees } from '../../src/operator-web/fixtures/worktrees';
import { decodeAuthorizedCleanupRequest, decodeCleanupChoices, type CleanupChoice, type CleanupPlan } from '../../src/core/operator/worktree-cleanup-plan';
import type { AuthorizedCleanupPost, CleanupPlanPorts } from '../../src/operator-web/CleanupPlanReview';
import { cleanupPlanPorts } from '../../src/operator-web/worktrees';
import { OPERATOR_THEME_STORAGE_KEY, resolveThemeMode } from '../../src/operator-web/theme';
import { decodeOperatorRepositories, type OperatorRepositoriesV1 } from '../../src/core/operator/repositories';
import { fetchRepositories } from '../../src/operator-web/repositories';
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
/** The registry rows of the busy Dev Activity repositories, in its order. */
const registry = (ids: readonly string[] = busy().repositories.map(row => row.repository_id), stale = 0): OperatorRepositoriesV1 => decodeOperatorRepositories({
  protocol: 1, kind: 'operator_repositories', stale_registrations: stale,
  repositories: ids.map(id => ({ repository_id: id, display_name: busy().repositories.find(row => row.repository_id === id)!.display_name, access_mode: 'read_write' })),
});
const REGISTRY = registry();
const trees = (): WorktreesSnapshot => decodeWorktrees(busyWorktrees(NOW));
const MB = 1024 * 1024;

function props(activity: DevActivitySnapshotV2, overrides: Partial<OperatorAppProps> = {}): OperatorAppProps {
  const worktrees = trees();
  return {
    initialLocale: 'en', initialRepositories: REGISTRY, readRepositories: async () => REGISTRY,
    initialDevActivity: activity, fetchDevActivity: async () => activity,
    initialRuntimeOverlay: unavailableRuntimeOverlay(), readRuntimeStatus: async () => unavailableRuntimeOverlay(),
    readNotifyStatus: () => new Promise(() => {}),
    initialWorktrees: worktrees, readWorktrees: async () => worktrees,
    readExecution: async id => emptyExecution(id, NOW),
    readTaskMessages: async request => busyTaskMessages(request, NOW),
    readBoard: async () => ({ state: 'ok', board: BOARD }),
    readBoardParents: async () => ({ state: 'ok', list: PARENTS }),
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
/** The busy sessions with one branch renamed, so a session binds to a pull request of the recorded board. */
const sessionsOn = (from: string, to: string): ExecutionReader => async id => JSON.parse(JSON.stringify(busyExecution(id, NOW)).replaceAll(`"branch":"${from}"`, `"branch":"${to}"`));
/** The board of #1474 projected from the recorded GitHub and hc reads (tests/fixtures/board). */
const BOARD = decodeBoard(board1474);
/** The parent list projected from the recorded GitHub and hc reads (tests/board.test.ts). */
const PARENTS = decodeBoardParents(boardParents);
const boardAt = (issue?: number) => installDom(`http://127.0.0.1:4318/#board/${HARNESS_ID}/1474${issue === undefined ? '' : `/${issue}`}`);
const followUp = () => document.querySelector<HTMLElement>('[role="dialog"] section[aria-labelledby="drawer-follow-up"]')!;

async function mount(element: React.ReactElement): Promise<void> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
}

/** Lets reads that resolve after the first render (CI repairs, the head commit) commit. */
const settle = () => act(async () => { for (let turn = 0; turn < 5; turn++) await Promise.resolve(); });
const key = (value: string) => act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true }) as unknown as Event); });
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
        4, 'execution_state_invalid', 'execution_state_pending', 'repository_not_found', 'execution_state_unavailable', 'execution_state_invalid', 'unreachable', 'unreachable',
      ]);
      expect(new Set(requests)).toEqual(new Set([`GET /api/v1/repositories/${HARNESS_ID}/execution`]));
    } finally { globalThis.fetch = original; }
  });
});

describe('board page', () => {
  const rows = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
  const button = (text: string) => rows('button').find(element => element.textContent?.includes(text))!;

  test('the board has no default subject: the list shows the open parents with progress and seats, the filter narrows it, and a row opens that board', async () => {
    const subjects: BoardSubject[] = [];
    const lists: string[] = [];
    await mount(<OperatorApp {...props(busy(), {
      readBoardParents: async (id) => { lists.push(id); return { state: 'ok', list: PARENTS }; },
      readBoard: async (subject) => { subjects.push(subject); return { state: 'ok', board: BOARD }; } })} />);
    await settle();
    expect(subjects).toEqual([]);
    expect(lists).toEqual([HARNESS_ID]);
    const list = document.querySelector('[data-board-subject]')!;
    expect(list.querySelector('select')?.value).toBe(HARNESS_ID);
    expect(list.querySelector('input:not([type="search"])')).toBeNull();
    // Live seats first: #1474 has three seat terminals, #1651 none.
    expect(rows('[data-board-parent-row]').map(row => [row.getAttribute('data-board-parent-row'), row.querySelector('[data-progress]')?.getAttribute('data-progress'), row.getAttribute('data-seats')]))
      .toEqual([['1474', '2/9', '3'], ['1651', '3/9', '0']]);
    for (const part of ['#1651', 'Post-0.25.4 wave', '3/9', 'No seats']) expect(rows('[data-board-parent-row="1651"]')[0]!.textContent).toContain(part);
    expect(rows('[data-board-parent-row="1474"]')[0]!.textContent).toContain('3 seats');
    const filter = list.querySelector<HTMLInputElement>('[data-board-parents-filter]')!;
    const type = (value: string) => act(async () => {
      // react-dom loads before this DOM exists, so it watches text inputs through focus and keyup, not the input event.
      filter.focus();
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(filter, value);
      filter.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'a', bubbles: true }) as unknown as Event);
    });
    for (const [query, shown] of [['#165', ['1651']], ['herdr-core', ['1474']], ['WAVE', ['1651']], ['', ['1474', '1651']]] as const) {
      await type(query);
      expect(rows('[data-board-parent-row]').map(row => row.getAttribute('data-board-parent-row'))).toEqual([...shown]);
    }
    await type('9999');
    expect(rows('[data-board-parent-row]')).toHaveLength(0);
    expect(list.textContent).toContain('No parent issue matches');
    await type('1474');
    await act(async () => rows('[data-board-parent-row="1474"] a')[0]!.click());
    await settle();
    expect(window.location.hash).toBe(`#board/${HARNESS_ID}/1474`);
    expect(subjects).toEqual([{ repository_id: HARNESS_ID, parent: 1474 }]);
    expect(document.querySelector('[data-board-parent]')?.getAttribute('data-board-parent')).toBe('1474');
    expect(localStorage.getItem(OPERATOR_BOARD_REPOSITORY_STORAGE_KEY)).toBe(HARNESS_ID);
    for (const hash of ['#board/repo/0', '#board/repo/1474/x', '#board//1474', '#board/repo/1474/1476/9']) expect(parseWorkspaceLocation(hash).workspace).toBe('home');
    expect(workspaceHash(parseWorkspaceLocation(`#board/${HARNESS_ID}/1474/1476`))).toBe(`#board/${HARNESS_ID}/1474/1476`);
  });

  test('a failed parent list read shows its named reason and the command, never an empty list', async () => {
    for (const reason of ['parents_github_failed', 'parents_hc_failed'] as const) {
      await mount(<OperatorApp {...props(busy(), { readBoardParents: async () => ({ state: 'unavailable', reason }) })} />);
      await settle();
      const refusal = document.querySelector('[data-board-parents-reason]')!;
      expect(refusal.getAttribute('data-board-parents-reason')).toBe(reason);
      expect(refusal.textContent).toContain('repo-harness board parents --json');
      expect(rows('[data-board-parent-row]')).toHaveLength(0);
      expect(document.body.textContent).not.toContain('No open parent issue');
      await act(async () => root?.unmount());
    }
    expect(document.body.textContent).toBe('');
  });

  test('waiting for you lists the core attention findings; in progress lists the other open items by stage', async () => {
    boardAt();
    await mount(<OperatorApp {...props(busy())} />);
    await settle();
    // The core rules on the recorded board of #1474; the console runs them and never classifies again.
    expect(rows('[data-finding]').map(row => row.getAttribute('data-finding'))).toEqual(evaluateBoardAttention(BOARD).findings.map(finding => finding.rule));
    expect(rows('[data-finding]').map(row => row.getAttribute('data-finding'))).toEqual(['A1', 'A3', 'A7', 'R2']);
    const ready = rows('[data-finding="A1"]')[0]!;
    for (const part of ['herdr-core 迁移 1', '#1491 is accepted and ready', 'feat/1475-hc-transport', 'PR #1491', 'Ready to merge', 'w1475', 'CI passed']) expect(ready.textContent).toContain(part);
    expect(ready.querySelector('a[href="https://github.com/Ancienttwo/repo-harness/pull/1491"]')).not.toBeNull();
    expect(rows('[data-finding="A3"]')[0]!.textContent).toContain('Draft #1499');
    // Rows show #1475 and #1476, so they are not in progress. R2 names pull requests only, so #1479 stays in progress.
    expect(rows('[data-item]').map(row => row.getAttribute('data-item'))).toEqual(['1477', '1478', '1479', '1480']);
    await act(async () => button('Show 3 more').click());
    expect(rows('[data-item]').map(row => row.getAttribute('data-item'))).toEqual(['1477', '1478', '1479', '1480', '1481', '1482', '1483']);
    expect(rows('[data-item="1479"]')[0]!.getAttribute('data-stage')).toBe('building');
    expect(rows('[data-board-tab]').map(tab => `${tab.getAttribute('data-board-tab')} ${tab.textContent}`))
      .toEqual(['all All9', 'attention Waiting for you4', 'building Building8', 'verifying Verifying0', 'ready Ready to merge1']);
    await act(async () => rows('[data-board-tab="ready"]')[0]!.click());
    expect(rows('[data-finding]').map(row => row.getAttribute('data-finding'))).toEqual(['A1']);
    expect(rows('[data-item]')).toHaveLength(0);
    // The plan comment of #1474 has no plan block, so R1 and R4 cannot run; the board says so and shows the rest.
    expect(rows('[data-board-banner]').map(banner => banner.getAttribute('data-board-banner'))).toEqual(['plan', 'unevaluated']);
    expect(document.body.textContent).not.toMatch(PRIVATE_LABEL);
    expect(document.querySelector('[data-freshness-source="board"]')?.getAttribute('data-freshness')).toBe('ok');
    expect(document.querySelectorAll('[draggable="true"], form, [data-write-action], textarea')).toHaveLength(0);
    const words = rows('button').map(element => element.textContent ?? '').join(' | ');
    for (const affordance of ['Approve', 'Merge now', 'Close PR', 'Start agent', 'Delete']) expect(words).not.toContain(affordance);
  });

  test('on a cold load the list reads the repository of the registry list that arrives after mount, without Dev Activity', async () => {
    let arrive: (list: OperatorRepositoriesV1) => void = () => {};
    const lists: string[] = [];
    await mount(<OperatorApp {...props(busy(), {
      initialDevActivity: undefined, fetchDevActivity: () => new Promise(() => {}),
      initialRepositories: undefined, readRepositories: () => new Promise(resolve => { arrive = resolve; }),
      readBoardParents: async (id) => { lists.push(id); return { state: 'ok', list: PARENTS }; } })} />);
    expect(document.querySelectorAll('[data-board-subject] option')).toHaveLength(0);
    expect(lists).toEqual([]);
    await act(async () => arrive(registry([HARNESS_ID])));
    await settle();
    expect(document.querySelectorAll('[data-board-subject] option')).toHaveLength(1);
    expect(lists).toEqual([HARNESS_ID]);
    expect(rows('[data-board-parent-row]')).toHaveLength(2);
  });

  test('a deep link opens the Task drawer; j/k move through the board order and Escape returns to the board', async () => {
    boardAt(1476);
    await mount(<OperatorApp {...props(busy(), { initialLocale: 'zh' })} />);
    await settle();
    expect(dialog()!.querySelector('#task-drawer-title')?.textContent).toBe('herdr-core 迁移 2｜sessions：任务会话改到 herdr-app 和 hc');
    expect(dialog()!.querySelector('[aria-current="step"]')?.getAttribute('data-step')).toBe('build');
    // The stage source panel follows the identifiers, as Task.dc.html orders it, and names the stage that the board fields give.
    const stageSource = dialog()!.querySelector('section[aria-labelledby="task-stage-source"]')!;
    expect(stageSource.querySelector('h3')?.textContent).toBe('阶段来源');
    expect(stageSource.previousElementSibling?.tagName).toBe('DL');
    expect(stageSource.querySelector('[data-stage-source]')?.getAttribute('data-stage-source')).toBe('building');
    expect(stageSource.querySelector('[data-stage-source]')?.textContent).toBe('Git + GitHub构建中');
    for (const part of ['席位卡住', 'feat/1476-sessions-herdr-core', '23627c4f5a71', '没有 CI', '未验收', 'w1476', 'blocked']) expect(dialog()!.textContent).toContain(part);
    expect(dialog()!.querySelector('[data-blocker="draft"]')?.textContent).toBe('PR 还是草稿');
    const claim = BOARD.items.find(item => item.number === 1476)!.claim_status;
    if (claim.status_kind !== 'observed') throw new Error('the recorded board has a claim status on #1476');
    expect(dialog()!.querySelector('[data-claim="observed"] a')?.getAttribute('href')).toBe(claim.url);
    // The merge command shows only for a pull request that core merge readiness calls ready.
    expect(dialog()!.querySelector('[data-command]')).toBeNull();
    await key('k');
    expect(window.location.hash).toBe(`#board/${HARNESS_ID}/1474/1475`);
    expect(dialog()!.querySelector('[data-merge-ready]')).not.toBeNull();
    expect(dialog()!.querySelector('[data-stage-source]')?.getAttribute('data-stage-source')).toBe('ready');
    expect(dialog()!.querySelector('[data-command] code')?.textContent).toBe('gh pr merge https://github.com/Ancienttwo/repo-harness/pull/1491 --squash');
    await key('j');
    expect(window.location.hash).toBe(`#board/${HARNESS_ID}/1474/1476`);
    await key('Escape');
    expect(dialog()).toBeNull();
    expect(window.location.hash).toBe(`#board/${HARNESS_ID}/1474`);

    await act(async () => root?.unmount());
    root = null;
    // #1477 has no pull request: closed without merged work is not shipped.
    boardAt(1477);
    const closed: BoardV1 = { ...BOARD, items: BOARD.items.map(item => item.number === 1477 ? { ...item, state: 'closed' } : item) };
    await mount(<OperatorApp {...props(busy(), { readBoard: async () => ({ state: 'ok', board: closed }) })} />);
    await settle();
    expect(dialog()!.textContent).toContain('Closed');
    expect(dialog()!.querySelector('[aria-current="step"]')).toBeNull();
    // Without a pull request the panel still names the stage; there are no identifiers before it.
    expect(dialog()!.querySelector('[data-stage-source]')?.textContent).toBe('Git + GitHubClosed');

    await act(async () => root?.unmount());
    root = null;
    boardAt(1503);
    await mount(<OperatorApp {...props(busy())} />);
    await settle();
    expect(dialog()?.querySelector('[data-task-missing]')?.textContent).toContain('#1503 is not on this board');
  });

  test('1-TASK-P1 a verified session on the pull request branch gives the follow-up commands, copy buttons only', async () => {
    boardAt(1476);
    const copied: string[] = [];
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { copied.push(value); } } });
    await mount(<OperatorApp {...props(busy(), { readExecution: sessionsOn('feat/kanban-human-redesign', 'feat/1476-sessions-herdr-core') })} />);
    await settle();
    const owner = followUp().querySelector('[data-owner="verified"]')!;
    for (const part of ['Codex', 'verified', 'implementer', 'Read-only observation']) expect(owner.textContent).toContain(part);
    const open = `herdr-app do terminal.keep '{"terminal":"t12"}'`;
    expect(Array.from(followUp().querySelectorAll('[data-command] code')).map(code => code.textContent)).toEqual([open, 'codex resume 0199a2b4-7c3e-7d10-9f00-3a5b6c7d8e9f']);
    // A long command wraps in full; it is never cut.
    for (const code of followUp().querySelectorAll('[data-command] code')) expect(code.className).not.toMatch(/truncate|nowrap/u);
    // 1-TASK-N1: copy buttons only; nothing here can reach the session.
    expect(followUp().querySelectorAll('input, textarea, select, form, [contenteditable], [data-write-action]')).toHaveLength(0);
    const buttons = Array.from(followUp().querySelectorAll('button'));
    expect(buttons.every(element => element.getAttribute('aria-label')?.startsWith('Copy '))).toBe(true);
    for (const element of buttons) await act(async () => element.click());
    expect(copied).toEqual(['t12', open, 'codex resume 0199a2b4-7c3e-7d10-9f00-3a5b6c7d8e9f', 'kanban-redesign']);

    await act(async () => root?.unmount());
    root = null;
    boardAt(1476);
    await mount(<OperatorApp {...props(busy(), { initialLocale: 'zh', readExecution: sessionsOn('feat/pipeline-observer', 'feat/1476-sessions-herdr-core') })} />);
    await settle();
    expect(followUp().querySelector('[data-owner="verified"]')?.textContent).toContain('Claude Code');
    expect(followUp().textContent).toContain('只读观测');
    // A terminal session has no Herdr pane: its one command is the resume command.
    expect(Array.from(followUp().querySelectorAll('[data-command] code')).map(code => code.textContent)).toEqual(['claude --resume 5f0c1e2a-0000-4000-8000-000000000001']);
  });

  test('1-TASK-F1 the follow-up states no session, a read in flight, a pending collection and an unreadable route, each as itself', async () => {
    const states: [number, ExecutionReader, string, string][] = [
      [1476, sessions, 'none', 'No verified session'],
      // #1477 has no pull request, so no branch can bind a session.
      [1477, sessionsOn('feat/kanban-human-redesign', 'feat/1476-sessions-herdr-core'), 'none', 'No verified session'],
      [1476, () => new Promise(() => {}), 'reading', 'Reading…'],
      [1476, async () => ({ state: 'unavailable', reason: 'execution_state_pending' }), 'pending', 'Task execution state is not collected yet'],
      [1476, async () => ({ state: 'unavailable', reason: 'execution_state_unavailable' }), 'unavailable', 'Task execution state unavailable · The task session records could not be read'],
    ];
    for (const [issue, readExecution, state, text] of states) {
      boardAt(issue);
      await mount(<OperatorApp {...props(busy(), { readExecution })} />);
      await settle();
      expect(followUp().querySelector(`[data-owner="${state}"]`)?.textContent).toBe(text);
      expect(followUp().querySelectorAll('[data-owner="verified"], [data-command], button')).toHaveLength(0);
      await act(async () => root?.unmount());
      root = null;
    }
  });

  test('the task inbox of a verified session lists its stored messages newest first, read-only; each read state is itself', async () => {
    const inbox = () => document.querySelector<HTMLElement>('[role="dialog"] section[aria-labelledby="task-inbox"]')!;
    boardAt(1475);
    await mount(<OperatorApp {...props(busy(), { readExecution: sessions })} />);
    await settle();
    // Task.dc.html orders the inbox after the follow-up.
    expect(inbox().previousElementSibling).toBe(followUp());
    expect(inbox().textContent).toContain('Read-only · delivered by the Bot');
    const rows = Array.from(inbox().querySelectorAll<HTMLElement>('li'));
    expect(rows.map(row => row.querySelector('[data-message]')?.firstElementChild?.textContent)).toEqual([
      'Merge #1490 first, then rebase this branch.', 'CI is green on the head. Ready for review?', 'The review notes are updated. Read item 2 first.']);
    expect(rows.map(row => row.querySelector('[data-message]')?.lastElementChild?.textContent)).toEqual([
      'hermes → Owner · 4m', 'rh-w-1475 → Orchestrator · 2h', 'codex-reviewer → Owner · 1d']);
    expect(rows.map(row => Array.from(row.querySelectorAll('[data-receipt]')).map(badge => `${badge.getAttribute('data-receipt')} ${badge.textContent}`)))
      .toEqual([['delivered Delivered'], ['none Not delivered'], ['acknowledged Acknowledged']]);
    expect(inbox().querySelectorAll('button, input, textarea, select, form, [contenteditable], [data-write-action]')).toHaveLength(0);
    expect(inbox().textContent).not.toMatch(PRIVATE_LABEL);

    const ok = busyTaskMessages({ repository_id: HARNESS_ID, task_id: INBOX_TASK }, NOW);
    if (ok.state !== 'ok') throw new Error('the busy fixture serves the inbox of #1475');
    const states: [TaskMessagesReader, string, string][] = [
      [() => new Promise(() => {}), 'reading', 'Reading…'],
      [async request => ({ state: 'ok', view: { ...ok.view, task_id: request.task_id, messages: [] } }), 'empty', 'No messages for this task.'],
      [async () => ({ state: 'ok', view: { ...ok.view, complete: false } }), 'incomplete', 'The read stopped at its limit: some stored messages are not shown.'],
      // A read that stopped before any entry is not an empty inbox.
      [async () => ({ state: 'ok', view: { ...ok.view, messages: [], complete: false } }), 'incomplete', 'The read stopped at its limit: some stored messages are not shown.'],
      [async () => ({ state: 'unavailable', reason: 'task_unverified' }), 'unavailable', 'Task inbox unavailable · The task has no verified session'],
    ];
    for (const [readTaskMessages, state, text] of states) {
      await act(async () => root?.unmount());
      boardAt(1475);
      await mount(<OperatorApp {...props(busy(), { readExecution: sessions, readTaskMessages })} />);
      await settle();
      expect(inbox().querySelector(`[data-inbox="${state}"]`)?.textContent).toBe(text);
      if (state !== 'empty') expect(inbox().querySelector('[data-inbox="empty"]')).toBeNull();
    }
    // No inbox task id, so no read and no section: no verified session on the branch, or a verified
    // session whose task id is not 64 hex (kanban-redesign), which has no inbox and matches no route.
    for (const [readExecution, owner] of [[sessions, 'none'], [sessionsOn('feat/kanban-human-redesign', 'feat/1476-sessions-herdr-core'), 'verified']] as const) {
      await act(async () => root?.unmount());
      const reads: string[] = [];
      boardAt(1476);
      await mount(<OperatorApp {...props(busy(), { readExecution, readTaskMessages: async request => { reads.push(request.task_id); return ok; } })} />);
      await settle();
      expect(followUp().querySelector(`[data-owner="${owner}"]`)).not.toBeNull();
      expect(document.querySelector('[role="dialog"] section[aria-labelledby="task-inbox"]')).toBeNull();
      expect(reads).toEqual([]);
    }
  });

  test('the task messages reader keeps both refusal forms and refuses a view for another task', async () => {
    const ok = busyTaskMessages({ repository_id: HARNESS_ID, task_id: INBOX_TASK }, NOW);
    if (ok.state !== 'ok') throw new Error('the busy fixture serves the inbox of #1475');
    // The fixture refuses as the server does: no route for a task id that is not 64 hex, no task outside the execution view.
    expect(busyTaskMessages({ repository_id: HARNESS_ID, task_id: 'kanban-redesign' }, NOW)).toEqual({ state: 'unavailable', reason: 'unreachable' });
    expect(busyTaskMessages({ repository_id: HARNESS_ID, task_id: '0'.repeat(64) }, NOW)).toEqual({ state: 'unavailable', reason: 'task_not_found' });
    const answers: (() => Response)[] = [
      () => Response.json(ok.view),
      () => Response.json({ ...ok.view, task_id: '0'.repeat(64) }),
      () => Response.json({ error: { code: 'task_not_found', message: 'refused', next_action: 'retry' } }, { status: 404 }),
      () => Response.json({ error: { code: 'task_unverified', message: 'refused', next_action: 'retry' } }, { status: 409 }),
      // A failure of the read process is a bare code.
      () => Response.json({ code: 'timeout' }, { status: 504 }),
      () => Response.json({ code: 'a_code_from_a_newer_server' }, { status: 503 }),
      () => { throw new TypeError('connection refused'); },
    ];
    const original = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (url: unknown) => { requests.push(String(url)); return answers[requests.length - 1]!(); }) as typeof fetch;
    try {
      const results = [];
      for (const _ of answers) results.push(await fetchTaskMessages({ repository_id: HARNESS_ID, task_id: INBOX_TASK }, new AbortController().signal));
      expect(results.map(result => result.state === 'ok' ? result.view.messages.length : result.reason)).toEqual([
        3, 'task_messages_invalid', 'task_not_found', 'task_unverified', 'timeout', 'unreachable', 'unreachable',
      ]);
      expect(new Set(requests)).toEqual(new Set([`/api/v1/repositories/${HARNESS_ID}/tasks/${INBOX_TASK}/messages`]));
    } finally { globalThis.fetch = original; }
  });

  test('a refusal names its reason and the command; a failed refresh keeps the last board; a lost source is one banner', async () => {
    boardAt();
    await mount(<OperatorApp {...props(busy(), { readBoard: async () => ({ state: 'unavailable', reason: 'board_collect_failed' }) })} />);
    await settle();
    expect(document.querySelector('[data-board-reason]')?.getAttribute('data-board-reason')).toBe('board_collect_failed');
    expect(document.querySelector('[data-board-reason]')?.textContent).toContain('repo-harness board --parent 1474 --json');
    expect(document.querySelector('[data-freshness-source="board"]')?.getAttribute('data-freshness')).toBe('failed');
    await act(async () => root?.unmount());

    let reads = 0;
    const degraded: BoardV1 = { ...BOARD, execution: { status: 'unavailable', reason: 'hc_unavailable' } };
    await mount(<OperatorApp {...props(busy(), { readBoard: async () => (reads++ === 0 ? { state: 'ok', board: degraded } : { state: 'unavailable', reason: 'board_timeout' }) })} />);
    await settle();
    expect(rows('[data-board-banner]').map(banner => banner.getAttribute('data-board-banner'))).toEqual(['execution', 'plan', 'unevaluated']);
    expect(rows('[data-seat]').every(cell => cell.getAttribute('data-seat') === 'none')).toBe(true);
    await act(async () => button('Refresh').click());
    await settle();
    expect(reads).toBe(2);
    expect(rows('[data-finding]').length).toBeGreaterThan(0);
    expect(rows('[data-board-banner]')[0]!.getAttribute('data-board-banner')).toBe('refresh');
    expect(rows('[data-board-banner]')[0]!.textContent).toContain('The board read did not finish in time.');
    expect(document.querySelector('[data-freshness-source="board"]')?.getAttribute('data-freshness')).toBe('refresh-failed');

    // A validation refusal drops the last board: no old readiness or merge command stays.
    await act(async () => root?.unmount());
    let protocolReads = 0;
    await mount(<OperatorApp {...props(busy(), { readBoard: async () => (protocolReads++ === 0 ? { state: 'ok', board: BOARD } : { state: 'unavailable', reason: 'board_invalid' }) })} />);
    await settle();
    expect(rows('[data-finding]').length).toBeGreaterThan(0);
    await act(async () => button('Refresh').click());
    await settle();
    expect(protocolReads).toBe(2);
    expect(document.querySelector('[data-board-reason]')?.getAttribute('data-board-reason')).toBe('board_invalid');
    expect(rows('[data-finding]')).toHaveLength(0);

    // Without seat terminals the banner names what is missing and the start command (#1695).
    await act(async () => root?.unmount());
    await mount(<OperatorApp {...props(busy(), { readBoard: async () => ({ state: 'ok', board: { ...BOARD, execution: { status: 'unavailable', reason: 'no_seat_terminals' } } }) })} />);
    await settle();
    expect(document.querySelector('[data-board-banner="execution"]')?.textContent).toContain('No hc terminal carries the seat labels of this parent, so the seat columns are empty. Start each seat with the start rows in herdr-notify.md: the argv of `repo-harness seats argv <seat> --repository-id <id>` labels its own terminal.');
  });

  test('the board reader decodes the body with the core decoder and keeps each route refusal; any other answer is unreachable', async () => {
    const refusal = (code: string, status: number) => () => Response.json({ error: { code, message: 'refused', next_action: 'retry' } }, { status });
    const answers: (() => Response)[] = [
      () => Response.json(BOARD),
      () => Response.json({ ...BOARD, protocol: 2 }),
      refusal('board_parent_invalid', 400),
      refusal('repository_not_found', 404),
      refusal('board_collect_failed', 503),
      refusal('board_timeout', 504),
      refusal('a_code_from_a_newer_server', 503),
      () => { throw new TypeError('connection refused'); },
    ];
    const original = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      requests.push(String(url));
      return answers[requests.length - 1]!();
    }) as typeof fetch;
    try {
      const results = [];
      for (const _ of answers) results.push(await fetchBoard({ repository_id: HARNESS_ID, parent: 1474 }, new AbortController().signal));
      expect(results.map(result => result.state === 'ok' ? result.board.parent.number : result.reason)).toEqual([
        1474, 'board_invalid', 'board_parent_invalid', 'repository_not_found', 'board_collect_failed', 'board_timeout', 'unreachable', 'unreachable',
      ]);
      expect(new Set(requests)).toEqual(new Set([`/api/v1/repositories/${HARNESS_ID}/board?parent=1474`]));
    } finally { globalThis.fetch = original; }
  });

  test('the parent list reader decodes the body with the core decoder and keeps each route refusal; any other answer is unreachable', async () => {
    const refusal = (code: string, status: number) => () => Response.json({ error: { code, message: 'refused', next_action: 'retry' } }, { status });
    const answers: (() => Response)[] = [
      () => Response.json(PARENTS),
      () => Response.json({ ...PARENTS, kind: 'repo-harness.board' }),
      refusal('parents_github_failed', 503),
      refusal('parents_hc_failed', 503),
      refusal('a_code_from_a_newer_server', 503),
      () => { throw new TypeError('connection refused'); },
    ];
    const original = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (url: unknown) => { requests.push(String(url)); return answers[requests.length - 1]!(); }) as typeof fetch;
    try {
      const results: BoardParentsRead[] = [];
      for (const _ of answers) results.push(await fetchBoardParents(HARNESS_ID, new AbortController().signal));
      expect(results.map(result => result.state === 'ok' ? result.list.parents.length : result.reason)).toEqual([
        2, 'parents_invalid', 'parents_github_failed', 'parents_hc_failed', 'unreachable', 'unreachable',
      ]);
      expect(new Set(requests)).toEqual(new Set([`/api/v1/repositories/${HARNESS_ID}/board/parents`]));
    } finally { globalThis.fetch = original; }
  });

  test('the registry reader decodes the list with the core decoder and refuses any other shape', async () => {
    const valid = { protocol: 1, kind: 'operator_repositories', repositories: [{ repository_id: HARNESS_ID, display_name: 'repo-harness', access_mode: 'read_write' }], stale_registrations: 3 };
    const answers: (() => Response)[] = [
      () => Response.json(valid),
      () => Response.json({ ...valid, protocol: 2 }),
      () => Response.json({ ...valid, repositories: [{ ...valid.repositories[0], repo_root: '/Users/me/repo-harness' }] }),
      () => Response.json({ ...valid, repositories: [valid.repositories[0], valid.repositories[0]] }),
      () => Response.json({ error: { code: 'registry_unavailable', message: 'unreadable', next_action: 'retry' } }, { status: 503 }),
    ];
    const original = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (url: unknown) => { requests.push(String(url)); return answers[requests.length - 1]!(); }) as typeof fetch;
    try {
      const results: string[] = [];
      for (const _ of answers) {
        try { results.push(`ok ${(await fetchRepositories(new AbortController().signal)).stale_registrations}`); }
        catch (error) { results.push((error as Error).message); }
      }
      expect(results).toEqual(['ok 3', 'repositories response is invalid', 'repositories response is invalid', 'repositories response is invalid', 'registry_unavailable']);
      expect(new Set(requests)).toEqual(new Set(['/api/v1/repositories']));
    } finally { globalThis.fetch = original; }
  });

  test('Repositories lists the registry rows with Dev Activity health; a row opens the board form of that repository', async () => {
    installDom('http://127.0.0.1:4318/#repositories');
    const site = busy().repositories[1]!.repository_id;
    const uncollected = 'repo_2b3c4d5e6f708192';
    const list = decodeOperatorRepositories({ protocol: 1, kind: 'operator_repositories', stale_registrations: 2489, repositories: [
      ...REGISTRY.repositories, { repository_id: uncollected, display_name: 'service-api', access_mode: 'read_only' },
      ...['a', 'b', 'c'].map(name => ({ repository_id: `repo_${name}`, display_name: `extra-${name}`, access_mode: 'read_write' })),
    ] });
    await mount(<OperatorApp {...props(decodeDevActivitySnapshot(degradedDevActivity(NOW)), { initialRepositories: list, readRepositories: async () => list })} />);
    const row = (id: string) => document.querySelector<HTMLButtonElement>(`[data-repository="${id}"]`);
    // Six rows show; the rest stay behind one toggle.
    expect(document.querySelectorAll('[data-repository]')).toHaveLength(6);
    await act(async () => document.querySelector<HTMLButtonElement>('[data-more-repositories]')!.click());
    expect(document.querySelectorAll('[data-repository]')).toHaveLength(7);
    expect(row(site)!.querySelector('[data-source-kind="github"]')?.getAttribute('data-source-status')).toBe('unavailable');
    expect(row(uncollected)!.querySelector('[data-not-collected]')?.textContent).toBe('not collected');
    expect(row(uncollected)!.querySelector('[data-access]')?.getAttribute('data-access')).toBe('read_only');
    // Registrations whose root is gone fold into one row; its commands show only when opened.
    const stale = document.querySelector('[data-stale-registrations]')!;
    expect(stale.getAttribute('data-stale-registrations')).toBe('2489');
    expect(stale.querySelector('[data-command]')).toBeNull();
    await act(async () => stale.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click());
    expect(Array.from(stale.querySelectorAll('[data-command] code')).map(code => code.textContent)).toEqual([
      'repo-harness fleet prune', 'repo-harness fleet prune --apply --expected-revision <digest>']);
    expect(stale.textContent).toContain('without a backup');
    await act(async () => row(site)!.click());
    expect(window.location.hash).toBe('#board');
    expect(document.querySelector<HTMLSelectElement>('[data-board-subject] select')?.value).toBe(site);
  });

  test('a failed registry refresh keeps the last rows and marks the list, apart from the Dev Activity line', async () => {
    installDom('http://127.0.0.1:4318/#repositories');
    let fail = false;
    const activity = busy();
    await mount(<OperatorApp {...props(activity, {
      initialRepositories: REGISTRY,
      readRepositories: async () => { if (fail) throw new Error('registry_unavailable'); return REGISTRY; },
    })} />);
    const marker = () => document.querySelector('[data-freshness-source="repositories"]');
    expect(marker()).toBeNull();
    fail = true;
    await act(async () => button('Refresh').click());
    await act(async () => {});
    expect(marker()?.getAttribute('data-freshness')).toBe('refresh-failed');
    expect(marker()?.textContent).toBe('Registry refresh failed · showing the last list');
    expect(document.querySelectorAll('[data-repository]')).toHaveLength(REGISTRY.repositories.length);
    expect(document.querySelector('.operator-header [data-freshness]')?.getAttribute('data-freshness')).toBe(activity.status);
  });

  test('a refresh that answers another protocol drops the last list instead of keeping it', async () => {
    installDom('http://127.0.0.1:4318/#repositories');
    let answer: unknown = REGISTRY;
    await mount(<OperatorApp {...props(busy(), { initialRepositories: REGISTRY, readRepositories: async () => decodeOperatorRepositories(answer) })} />);
    expect(document.querySelectorAll('[data-repository]')).toHaveLength(REGISTRY.repositories.length);
    answer = { ...REGISTRY, protocol: 2 };
    await act(async () => button('Refresh').click());
    await act(async () => {});
    expect(document.querySelectorAll('[data-repository]')).toHaveLength(0);
    expect(document.body.textContent).toContain('The repository registry cannot be read');
    expect(document.querySelector('[data-freshness-source="repositories"]')).toBeNull();
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
  test('the needs-you count, the badge and the tab title are the same number', async () => {
    installDom(HOME_URL);
    const snapshot = busy();
    await mount(<OperatorApp {...props(snapshot, { readCiRepairs: noRepairs })} />);
    const count = snapshot.attention.length;
    expect(count).toBe(1);
    expect(document.querySelectorAll('section[aria-labelledby="home-waiting"] [data-attention-kind]')).toHaveLength(count);
    expect(document.querySelector('[data-needs-you]')?.getAttribute('data-needs-you')).toBe(String(count));
    expect(document.title).toBe(`(${count}) repo-harness`);
  });

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
    // A Dev Activity row names no parent issue, so it opens the board subject form.
    await act(async () => rows[0]!.querySelector<HTMLAnchorElement>('a[href="#board"]')!.click());
    expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe('board');
    expect(document.querySelector('[data-board-subject]')).not.toBeNull();
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
      .toEqual(snapshot.attention.map(() => '#board'));
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
    expect(work).toEqual(['board', 'repositories', 'worktrees', 'docs']);
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
    // The plan review button opens the review; it removes nothing by itself.
    for (const button of main.querySelectorAll('button')) expect(button.matches('[data-clean], [data-plan-review-open]') || button.closest('[data-command]') !== null).toBe(true);
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

  test('the worktree cache is read only on Home and Worktree, and a failed refresh keeps the last rows', async () => {
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
      // A registered non-green row is checked for the plan review instead; the clean request carries only green ids (5-WT-P1).
      const reviewable = new Set(['repo-harness-wt-kanban-redesign', 'repo-harness-wt-oar', 'codex-7f3a', 'repo-harness-wt-docs-cleanup', 'operator-site-csp']);
      for (const row of document.querySelectorAll<HTMLElement>('[data-worktree]')) {
        const box = row.querySelector<HTMLInputElement>('input[data-select]')!;
        const on = row.getAttribute('data-judgment') === 'green' || reviewable.has(row.querySelector('[data-directory]')!.textContent!);
        expect([box.disabled, box.checked]).toEqual([!on, on]);
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
      // The CLI's own formatter is the authority for the command text.
      expect(command.querySelector('code')?.textContent).toBe(cleanCommand([row.id], selectionDigest([worktreeDigestRow(row)])));
      expect(command.querySelector('code')?.textContent).toBe(`repo-harness worktrees clean --ids ${row.id} --expected-digest ${selectionDigest([worktreeDigestRow(row)])}`);
      expect(command.querySelector('button')?.getAttribute('aria-label') ?? command.querySelector('button')?.textContent).toContain('Copy');
    }
    for (const row of document.querySelectorAll<HTMLElement>('[data-worktree]:not([data-judgment="green"])')) expect(row.querySelector('[data-clean-command], [data-command]')).toBeNull();
    const kept = worktreeRow('repo-harness-wt-kanban-redesign');
    expect(kept.querySelector('[data-processes]')?.textContent).toContain('processes using it: 2');
    expect(kept.textContent).not.toContain('repo-harness worktrees clean');
  });
});

/** The busy plan routes, recording what the page sends. */
function recordPlan(base: CleanupPlanPorts = cleanupPlanFixture(NOW)) {
  const opened: (readonly string[])[] = [], chosen: (readonly CleanupChoice[])[] = [], executed: AuthorizedCleanupPost[] = [];
  let plan: CleanupPlan | null = null;
  const keep = async (answer: Awaited<ReturnType<CleanupPlanPorts['open']>>) => { if (answer.state === 'ready') plan = answer.plan; return answer; };
  const ports: CleanupPlanPorts = {
    open: ids => { opened.push(ids); return base.open(ids).then(keep); },
    choose: (session, choices) => { chosen.push(choices); return base.choose(session, choices).then(keep); },
    execute: request => { executed.push(request); return base.execute(request); },
  };
  return { ports, opened, chosen, executed, plan: () => plan! };
}
const planItem = (directory: string) => Array.from(document.querySelectorAll<HTMLElement>('[data-plan-item]'))
  .find(row => row.querySelector('[data-directory]')?.textContent === directory)!;
const option = (directory: string, value: string) => act(async () => planItem(directory).querySelector<HTMLInputElement>(`[data-plan-option="${value}"]`)!.click());
async function destination(directory: string, path: string, value: string): Promise<void> {
  const select = planItem(directory).querySelector<HTMLElement>(`[data-plan-path="${path}"]`)!.querySelector('select')!;
  await act(async () => { select.value = value; select.dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event); });
}
const planButton = (name: 'choose' | 'execute') => document.querySelector<HTMLButtonElement>(`button[data-plan-${name}]`)!;
async function openReview(ports: CleanupPlanPorts): Promise<void> {
  installDom(WORKTREES_URL);
  await mount(<OperatorApp {...props(busy(), { worktreeCleanupPlan: ports })} />);
  await act(async () => document.querySelector<HTMLButtonElement>('[data-plan-review-open]')!.click());
  await until(() => document.querySelector('[data-plan-review]')?.getAttribute('data-plan-review') !== 'loading');
}
const EDITABLE = ['repo-harness-wt-oar', 'codex-7f3a', 'repo-harness-wt-docs-cleanup', 'repo-harness-wt-notes', 'repo-harness-wt-bench',
  'repo-harness-wt-i18n', 'repo-harness-wt-archctx', 'repo-harness-wt-ci-lane'];

describe('worktree cleanup plan review (#1720)', () => {
  test('pass 1 offers a choice only on eligible non-green items; pass 2 authorizes the shown digests and sends them', async () => {
    const record = recordPlan();
    await openReview(record.ports);
    expect(document.querySelector('[data-plan-review]')?.getAttribute('data-plan-review')).toBe('ready');
    // Pass 1 asks for the registered non-green rows of the list: no primary checkout, no orphan.
    expect(record.opened).toEqual([['repo-harness-wt-kanban-redesign', 'repo-harness-wt-oar', 'codex-7f3a', 'repo-harness-wt-docs-cleanup', 'operator-site-csp']
      .map(directory => rowOf(directory).id)]);
    // One item of each judgment; green keeps the one-click clean, red and an unread loss cannot be selected.
    expect(planItem('feat-kanban-status').querySelector('[data-plan-green]')).not.toBeNull();
    for (const directory of ['feat-kanban-status', 'repo-harness-wt-kanban-redesign', 'repo-harness-wt-old-spike']) {
      expect(planItem(directory).querySelectorAll('input, select')).toHaveLength(0);
    }
    expect(planItem('repo-harness-wt-kanban-redesign').querySelector('[data-plan-locked]')).not.toBeNull();
    expect(planItem('repo-harness-wt-old-spike').querySelector('[data-plan-loss]')?.getAttribute('data-plan-loss')).toBe('unknown');
    expect(Array.from(document.querySelectorAll('[data-plan-item][data-editable="true"] [data-directory]')).map(cell => cell.textContent)).toEqual(EDITABLE);
    expect(document.querySelectorAll('[data-plan-authorization]')).toHaveLength(0);
    expect([planButton('choose').disabled, planButton('execute').disabled]).toEqual([true, true]);
    // Commits need an archive, so Delete is disabled and says why.
    expect(planItem('repo-harness-wt-oar').querySelector<HTMLInputElement>('[data-plan-option="delete"]')!.disabled).toBe(true);
    expect(planItem('repo-harness-wt-oar').querySelector('[data-plan-note]')?.getAttribute('data-plan-note')).toBe('commitsNeedArchive');

    await option('codex-7f3a', 'archive_then_delete');
    expect(planItem('codex-7f3a').querySelector('[data-plan-note]')?.getAttribute('data-plan-note')).toBe('archiveEmpty');
    expect(planButton('choose').disabled).toBe(true);
    await destination('codex-7f3a', 'src/hooks/run.ts', 'git');
    await destination('codex-7f3a', '.env', 'private');
    // An ignored directory is not a file the archive accepts.
    expect(planItem('codex-7f3a').querySelector('[data-plan-path="node_modules/"]')).toBeNull();
    await option('repo-harness-wt-notes', 'delete');
    await act(async () => planButton('choose').click());
    await until(() => document.querySelectorAll('[data-plan-authorization]').length === 2);

    const codex = record.plan().items.find(item => item.worktree.directory === 'codex-7f3a')!;
    const notes = record.plan().items.find(item => item.worktree.directory === 'repo-harness-wt-notes')!;
    const slug = `codex-7f3a-${codex.worktree.id.slice(3, 11)}`, day = new Date(NOW).toISOString().slice(0, 10);
    expect(record.chosen).toHaveLength(1);
    // One choice per plan item: the server refuses a set that misses one.
    expect(decodeCleanupChoices(record.chosen[0])).toHaveLength(document.querySelectorAll('[data-plan-item]').length);
    expect(record.chosen[0]!.filter(choice => choice.recommendation !== 'keep')).toEqual([
      { id: codex.worktree.id, recommendation: 'archive_then_delete', archive: {
        git: { directory: `docs/archive/${day}-${slug}`, branch: `docs/archive-${slug}`, paths: ['src/hooks/run.ts'], include_commits: false },
        private: { directory: codex.worktree.repository_id!, paths: ['.env'] } } },
      { id: notes.worktree.id, recommendation: 'delete', archive: { git: null, private: null } },
    ]);
    for (const item of [codex, notes]) {
      const block = planItem(item.worktree.directory).querySelector('[data-plan-authorization]')!;
      expect([block.querySelector('[data-plan-digest="plan"]')?.textContent, block.querySelector('[data-plan-digest="loss"]')?.textContent]).toEqual([item.plan_sha256, item.loss_sha256!]);
    }

    // A choice the plan does not bind cannot be authorized until the plan is made again.
    await act(async () => planItem('repo-harness-wt-notes').querySelector<HTMLInputElement>('[data-plan-authorize]')!.click());
    await option('repo-harness-wt-notes', 'keep');
    expect(planItem('repo-harness-wt-notes').querySelector('[data-plan-authorization]')).toBeNull();
    expect(planItem('repo-harness-wt-notes').querySelector('[data-plan-stale]')).not.toBeNull();
    expect(planButton('execute').getAttribute('data-plan-execute')).toBe('0');
    await option('repo-harness-wt-notes', 'delete');
    await act(async () => planItem('codex-7f3a').querySelector<HTMLInputElement>('[data-plan-authorize]')!.click());
    expect(planButton('execute').getAttribute('data-plan-execute')).toBe('2');

    await act(async () => planButton('execute').click());
    await until(() => document.querySelector('[data-plan-result]') !== null);
    const { request_id: requestId, ...body } = record.executed[0]!;
    expect(requestId).toMatch(UUID);
    const rows = [codex, notes].sort((left, right) => left.worktree.id < right.worktree.id ? -1 : 1);
    // The server's request decoder accepts the body; each approval is the digest pair the item showed.
    expect(decodeAuthorizedCleanupRequest(body)).toEqual({
      session_id: record.plan().session_id, ids: rows.map(item => item.worktree.id),
      expected_digest: selectionDigest(rows.map(item => worktreeDigestRow(item.worktree))),
      approvals: rows.map(item => ({ id: item.worktree.id, loss_sha256: item.loss_sha256!, plan_sha256: item.plan_sha256 })),
    });
  });

  test('each execution reason shows its own message', async () => {
    const record = recordPlan();
    await openReview(record.ports);
    for (const directory of EDITABLE) await option(directory, 'archive_then_delete');
    // The fixture marks `.env` private-only, so it takes the private archive.
    for (const [directory, path, value] of [['codex-7f3a', '.env', 'private'], ['repo-harness-wt-notes', 'docs/release-notes.md', 'git'], ['repo-harness-wt-bench', 'bench/hooks.ts', 'git'],
      ['repo-harness-wt-i18n', 'src/operator-web/i18n/home.ts', 'git'], ['repo-harness-wt-ci-lane', 'scripts/check-ci.sh', 'git']] as const) await destination(directory, path, value);
    await option('repo-harness-wt-docs-cleanup', 'delete');
    await act(async () => planButton('choose').click());
    await until(() => document.querySelectorAll('[data-plan-authorize]').length === EDITABLE.length);
    for (const box of document.querySelectorAll<HTMLInputElement>('[data-plan-authorize]')) await act(async () => box.click());
    await act(async () => planButton('execute').click());
    await until(() => document.querySelector('[data-plan-result]') !== null);
    const messages = Object.fromEntries(Array.from(document.querySelectorAll('[data-plan-result-item]'))
      .map(item => [item.getAttribute('data-reason') ?? item.getAttribute('data-outcome'), item.querySelector('[data-plan-reason-text]')?.textContent ?? null]));
    expect(messages).toEqual({
      removed: null,
      in_use: 'A process or session uses it now. Nothing was removed.',
      not_approved: 'The server found no valid authorization for it. Nothing was removed.',
      loss_changed: 'Its contents changed after you authorized it. Nothing was removed.',
      plan_changed: 'The plan changed after you authorized it. Nothing was removed.',
      unavailable: 'Its state could not be read. Nothing was removed.',
      archive_failed: 'The archive could not be confirmed, so the worktree was kept. Check the archive branch before you try again.',
      removal_unproven: 'The removal could not be confirmed. Reload the list before you try again.',
    });
    expect(document.querySelector('[data-plan-result] p')?.textContent).toBe('removed: 1 · skipped: 5 · needs a check: 2');
    expect(document.querySelectorAll('[data-plan-item] input:not(:disabled), [data-plan-item] select:not(:disabled)')).toHaveLength(0);
  });

  test('only server-archivable paths get a destination, and the page\'s choice passes createCleanupPlan', async () => {
    const tree = rowOf('codex-7f3a'), session = 'd'.repeat(32);
    const file = { path: 'docs/guide.md', kind: 'file' as const, mode: 0o644, size: 5, sha256: 'd'.repeat(64), git_oid: 'e'.repeat(40) };
    // A changed file, an ignored file, a staged deletion, an empty directory, an unchanged tracked file,
    // a large index-only blob and a large index blob beside a small worktree file.
    const large = { mode: '100644', oid: 'f'.repeat(40), stage: 0, size: 16 * 1024 * 1024 + 1 };
    const observation: CleanupObservation = { worktree: tree, loss: { kind: 'registered', identity: { dev: 1, ino: 1, birthtime_ms: 1 }, branch: `refs/heads/${tree.branch}`,
      head_commit: 'c'.repeat(40), index: [{ ...large, path: 'docs/index-large.txt' }, { ...large, path: 'docs/staged-large.txt' }], commits: [], remote_refs: [], ignored: ['.env'],
      changed_paths: ['docs/guide.md', 'docs/index-large.txt', 'docs/removed.md', 'docs/staged-large.txt', 'empty'],
      files: [{ ...file, path: '.env' }, { ...file, path: 'README.md' }, file, { ...file, path: 'docs/index-large.txt' }, { ...file, path: 'empty', kind: 'directory', sha256: null, git_oid: null }] } };
    const keep = { recommendation: 'keep' as const, reason: 'Waiting for the user to choose.', evidence: ['judgment: yellow'], archive: { git: null, private: null } };
    let plan = createCleanupPlan(session, [{ observation, advice: keep }]);
    const ports: CleanupPlanPorts = {
      open: async () => ({ state: 'ready', plan }),
      // The server keeps its own reason and evidence and takes only the choice.
      choose: async (_session, choices) => {
        plan = createCleanupPlan(session, [{ observation, advice: { ...keep, recommendation: choices[0]!.recommendation, archive: choices[0]!.archive } }]);
        return { state: 'ready', plan };
      },
      execute: () => Promise.reject(new Error('not used')),
    };
    await openReview(ports);
    await option('codex-7f3a', 'archive_then_delete');
    expect(Array.from(planItem('codex-7f3a').querySelectorAll('[data-plan-path]')).map(row => row.getAttribute('data-plan-path')))
      .toEqual(['.env', 'docs/guide.md', 'docs/index-large.txt', 'docs/staged-large.txt']);
    expect(Array.from(planItem('codex-7f3a').querySelectorAll('[data-plan-loss-list="files"] li')).map(row => row.textContent))
      .toEqual(['docs/guide.md', 'docs/index-large.txt', 'docs/removed.md', 'docs/staged-large.txt', 'empty']);
    // Git storage refuses `.env` by name, so the page offers only Not archived or Private for it. Staging cannot read
    // the two large index blobs in any storage, so the page offers only Not archived for them.
    const offered = (path: string) => Array.from(planItem('codex-7f3a').querySelectorAll<HTMLOptionElement>(`[data-plan-path="${path}"] option`)).map(option => option.value);
    expect(offered('.env')).toEqual(['none', 'private']);
    for (const path of ['docs/index-large.txt', 'docs/staged-large.txt']) expect(offered(path)).toEqual(['none']);
    expect(offered('docs/guide.md')).toEqual(['none', 'git', 'private']);
    await destination('codex-7f3a', 'docs/guide.md', 'git');
    await destination('codex-7f3a', '.env', 'private');
    await act(async () => planButton('choose').click());
    await until(() => planItem('codex-7f3a').querySelector('[data-plan-authorization]') !== null);
    expect(plan.items[0]!.advice.archive).toMatchObject({ git: { paths: ['docs/guide.md'], include_commits: false }, private: { directory: tree.repository_id, paths: ['.env'] } });
    expect(planItem('codex-7f3a').querySelector('[data-plan-digest="plan"]')?.textContent).toBe(plan.items[0]!.plan_sha256);
  });

  test('the production ports post each pass and the execution to their routes, and keep each answer typed', async () => {
    const ready = await cleanupPlanFixture(NOW).open([]);
    if (ready.state !== 'ready') throw new Error('the busy fixture plan is ready');
    const plan = ready.plan, id = plan.items[3]!.worktree.id;
    const answers: (() => Response)[] = [
      () => Response.json(plan),
      () => Response.json({ error: { code: 'choices_changed', message: 'refused', next_action: 'retry' } }, { status: 409 }),
      () => Response.json({ protocol: 1, kind: 'operator_authorized_worktree_cleanup', session_id: plan.session_id, items: [] }),
      () => { throw new TypeError('connection refused'); },
    ];
    const original = globalThis.fetch;
    const requests: { method: string; url: string; body: Record<string, unknown> }[] = [];
    globalThis.fetch = (async (url: unknown, options?: RequestInit) => {
      requests.push({ method: options?.method ?? 'GET', url: String(url), body: JSON.parse(String(options?.body)) });
      return answers[requests.length - 1]!();
    }) as typeof fetch;
    try {
      const execute = { request_id: crypto.randomUUID(), session_id: plan.session_id, ids: [id], expected_digest: 'a'.repeat(64), approvals: [] };
      const results = [await cleanupPlanPorts.open([id]), await cleanupPlanPorts.choose(plan.session_id, [{ id, recommendation: 'keep', archive: { git: null, private: null } }]),
        await cleanupPlanPorts.execute(execute), await cleanupPlanPorts.open([id])];
      // An execution result with no items fails its decoder: the request ran, so the page says unreadable, not unreachable.
      expect(results.map(result => result.state === 'refused' ? `refused ${result.status} ${result.error.code}` : result.state)).toEqual(['ready', 'refused 409 choices_changed', 'unreadable', 'unreachable']);
      expect(requests.map(request => `${request.method} ${request.url} ${Object.keys(request.body).sort().join(',')}`)).toEqual([
        'POST /api/v1/worktrees/cleanup/plan ids,request_id', 'POST /api/v1/worktrees/cleanup/plan choices,request_id,session_id',
        'POST /api/v1/worktrees/cleanup/execute approvals,expected_digest,ids,request_id,session_id', 'POST /api/v1/worktrees/cleanup/plan ids,request_id']);
      expect(requests[0]!.body.request_id).toMatch(UUID); expect(requests[0]!.body.request_id).not.toBe(requests[1]!.body.request_id);
    } finally { globalThis.fetch = original; }
  });

  test('above the plan limit the user checks a batch, so every non-green row is reachable', async () => {
    const base = trees(), yellow = rowOf('repo-harness-wt-oar');
    const extra = Array.from({ length: 12 }, (_, index) => ({ ...yellow, id: `wt_${'9'.repeat(62)}${index.toString(16).padStart(2, '0')}`, directory: `repo-harness-wt-extra-${index}` }));
    const snapshot = decodeWorktrees({ ...base, repositories: base.repositories.map((group, index) => index === 0 ? { ...group, worktrees: [...group.worktrees, ...extra] } : group) });
    const record = recordPlan();
    installDom(WORKTREES_URL);
    await mount(<OperatorApp {...props(busy(), { initialWorktrees: snapshot, readWorktrees: async () => snapshot, worktreeCleanupPlan: record.ports })} />);
    await settle();
    const open = () => document.querySelector<HTMLButtonElement>('[data-plan-review-open]')!;
    expect([open().disabled, open().getAttribute('data-plan-review-open'), document.querySelector('[data-plan-limit]') !== null]).toEqual([true, '17', true]);
    const batch = async (cleared: string) => {
      await act(async () => checkbox(cleared).click());
      expect([open().disabled, open().getAttribute('data-plan-review-open'), document.querySelector('[data-plan-limit]') !== null]).toEqual([false, '16', false]);
      await act(async () => open().click());
      await until(() => document.querySelector('[data-plan-review]')?.getAttribute('data-plan-review') === 'ready');
      await act(async () => document.querySelector<HTMLButtonElement>('[data-plan-back]')!.click());
      await settle();
    };
    // Two batches of 16 reach all 17 rows; going back restores the full selection.
    await batch('repo-harness-wt-oar');
    await batch('codex-7f3a');
    expect(record.opened.map(ids => ids.length)).toEqual([16, 16]);
    expect([record.opened[0]!.includes(rowOf('repo-harness-wt-oar').id), record.opened[1]!.includes(rowOf('repo-harness-wt-oar').id)]).toEqual([false, true]);
    expect(new Set(record.opened.flat()).size).toBe(17);
  });

  test('a plan that does not arrive says so, sends no choice and can be asked again', async () => {
    const base = cleanupPlanFixture(NOW);
    let opens = 0;
    const record = recordPlan({ ...base, open: ids => ++opens === 1 ? Promise.reject(new Error('down')) : base.open(ids) });
    await openReview(record.ports);
    expect(document.querySelector('[data-plan-review]')?.getAttribute('data-plan-review')).toBe('failed');
    expect(document.querySelector('[data-plan-failure]')?.getAttribute('data-plan-failure')).toBe('unreachable');
    expect(document.querySelectorAll('[data-plan-item]')).toHaveLength(0);
    await act(async () => Array.from(document.querySelectorAll<HTMLButtonElement>('[data-plan-failure] button')).find(button => button.textContent === 'Try again')!.click());
    await until(() => document.querySelector('[data-plan-review]')?.getAttribute('data-plan-review') === 'ready');
    expect(document.querySelector('[data-plan-failure]')).toBeNull();
    expect(record.chosen).toHaveLength(0);
    await act(async () => document.querySelector<HTMLButtonElement>('[data-plan-back]')!.click());
    expect(document.querySelector('[data-worktrees-page]')).not.toBeNull();
  });
});

describe('side rail', () => {
  const rail = () => document.querySelector<HTMLElement>('[data-nav-rail]')!;
  const repositorySwitch = () => document.querySelector<HTMLButtonElement>('[data-repository-switch]')!;
  const go = (workspace: string) => act(async () => document.querySelector<HTMLAnchorElement>(`.workspace-nav a[data-workspace="${workspace}"]`)!.click());

  test('1-SHELL-P1 the switch sits under the logo; pages across repositories show All repositories, a board its repository', async () => {
    const heads: string[] = [];
    installDom(WORKTREES_URL);
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

    await act(async () => { window.location.hash = `#board/${HARNESS_ID}/1474`; window.dispatchEvent(new window.HashChangeEvent('hashchange')); });
    await settle();
    expect(repositorySwitch().getAttribute('data-repository-switch')).toBe('current');
    expect(repositorySwitch().getAttribute('data-selected')).toBe(HARNESS_ID);
    const [owner] = busy().repositories[0]!.github!.split('/');
    expect(repositorySwitch().querySelector('[data-switch-detail]')?.textContent).toBe(`${owner} · main · ${HEAD.slice(0, 7)}`);
    expect(heads).toContain(HARNESS_ID);

    // A board names one parent issue, so another repository opens the subject form with that repository chosen.
    const site = busy().repositories[1]!.repository_id;
    await act(async () => repositorySwitch().click());
    expect(document.querySelector('[data-repository-switch] + [role="dialog"]')!.textContent).not.toMatch(PRIVATE_LABEL);
    await act(async () => document.querySelector<HTMLButtonElement>(`[data-switch-option="${site}"]`)!.click());
    expect(window.location.hash).toBe('#board');
    expect(repositorySwitch().getAttribute('data-repository-switch')).toBe('current');
    expect(repositorySwitch().getAttribute('data-selected')).toBe('');
    expect(document.querySelector<HTMLSelectElement>('[data-board-subject] select')?.value).toBe(site);

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
    expect(markup).toContain('data-board-subject');
  });
});
