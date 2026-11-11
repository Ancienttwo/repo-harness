import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';

import tokens from '../../docs/design/operator-console/design-system/tokens.json';
import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import type { DevActivitySnapshotV2 } from '../../src/core/dev-activity/types';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';
import { cleanCommand } from '../../src/cli/commands/worktrees-actions';
import { decodeWorktreeCleanupRequest, worktreeDigestRow } from '../../src/core/operator/worktree-cleanup';
import { decodeWorktrees, unavailableWorktrees, WORKTREE_REASONS, type WorktreesSnapshot } from '../../src/core/public-projections/worktrees';
import { selectionDigest } from '../../src/effects/operator/worktree-cleanup';
import { createCleanupPlan, type CleanupObservation } from '../../src/effects/operator/worktree-cleanup-plan';
import { documentTitle, OPERATOR_BOARD_REPOSITORY_STORAGE_KEY, OperatorApp, type OperatorAppProps } from '../../src/operator-web/App';
import { evaluateBoardAttention } from '../../src/core/board/attention';
import { ADVISOR_TRANSCRIPT_LINE_WITHHELD, decodeAdvisorSeatSend, decodeAdvisorSeatTranscript } from '../../src/core/board/advisor-seat';
import { decodeBoard, type BoardV1 } from '../../src/core/board/board';
import { fetchBoard, fetchBoardParents, fetchBoardSeats, useBoard, useBoardParents, useBoardSeats, type BoardSeatsReader, type BoardParentsRead, type BoardParentsReader, type BoardParentsReason, type BoardRead, type BoardReader, type BoardReason, type BoardSubject } from '../../src/operator-web/board-view';
import board1474 from '../../src/operator-web/fixtures/board-1474.json';
import boardParents from '../../src/operator-web/fixtures/board-parents.json';
import boardSeats from '../../src/operator-web/fixtures/board-seats.json';
import { decodeBoardParents, decodeBoardSeats, joinBoardParents, type BoardParentsV1, type BoardSeatsV1 } from '../../src/core/board/parents';
import { designTokenStylesheet } from '../../src/operator-web/design-tokens';
import { OPERATOR_RAIL_STORAGE_KEY } from '../../src/operator-web/NavRail';
import { fetchExecution, fetchTaskMessages, itemOwner, type CiRepairsReader, type ExecutionReader, type TaskMessagesReader } from '../../src/operator-web/repository-reads';
import { fixtureProps, FIXTURE_NAMES, OFFICE_FIXTURE } from '../../src/operator-web/fixtures';
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
import { settingsStores } from '../../src/operator-web/fixtures/settings';
import { busyWorktrees, cleanupPlanFixture, degradedWorktrees } from '../../src/operator-web/fixtures/worktrees';
import { decodeAuthorizedCleanupRequest, decodeCleanupChoices, type CleanupChoice, type CleanupInvestigationStatus, type CleanupPlan } from '../../src/core/operator/worktree-cleanup-plan';
import { CLEANUP_INVESTIGATION_POLL_MS, type AuthorizedCleanupPost, type CleanupPlanPorts } from '../../src/operator-web/CleanupPlanReview';
import { cleanupPlanPorts } from '../../src/operator-web/worktrees';
import { OPERATOR_THEME_STORAGE_KEY, resolveThemeMode } from '../../src/operator-web/theme';
import { decodeOperatorRepositories, type OperatorRepositoriesV1 } from '../../src/core/operator/repositories';
import { fetchRepositories, useRepositories, type RepositoriesReader } from '../../src/operator-web/repositories';
import { boardLayout, boardPlace, boardRoom, DEFAULT_LOCATION, parseWorkspaceLocation, workspaceHash } from '../../src/operator-web/workspace-location';
import { DESK_STATES, ISSUE_FLOW_WORKER_LIMIT, type DeskState } from '../../src/core/board/desk';
import { activeParent, officeCard, officeRoom, useOfficeOverview } from '../../src/operator-web/board-office';
import { OFFICE_DOOR_POLICIES, OFFICE_PARENT, officeBoard, officeParents, officeSeats } from '../../src/operator-web/fixtures/office';
import { busyBotAccess, degradedBotAccess } from '../../src/operator-web/fixtures/bots';
import { officeSetupRows, type OfficeSetupReads, type OfficeSetupRowId, type OfficeSetupScope } from '../../src/operator-web/OfficeSetupChecklist';
import { translate, type OperatorTranslate } from '../../src/operator-web/i18n';
import { hcRepairCommands } from '../../src/operator-web/RuntimeBadges';
import { decodeBotAccessSnapshot, type BotAccessSnapshotV1 } from '../../src/core/operator/bot-access';
import { HC_MIN_VERSION } from '../../src/core/terminal/herdr-pin';
import { RH_LABEL } from '../../src/effects/terminal/herdr-core';
import { postBossCommand, type BossCommandPost, type BossCommandWrite } from '../../src/operator-web/office-boss';
import { fetchAdvisorTranscript, postAdvisorMessage, type AdvisorMessagePost, type AdvisorMessageWrite, type AdvisorTranscriptRead } from '../../src/operator-web/OfficeAdvisorDialog';
import { composeMiniRoom, composeRoom, deskVignette, sceneEffect, type SceneMiniRoom, type SceneRoom } from '../../src/operator-web/office-scene';
import { sceneAgent } from '../../src/operator-web/office-sprites';

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
    readBoardSeats: async () => ({ state: 'ok', seats: SEATS }),
    readBotAccess: async () => ({ state: 'unavailable', reason: 'bot_access_pending' }),
    readQuota: () => new Promise(() => {}),
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
const SEATS = decodeBoardSeats(boardSeats);
/**
 * The board of #1474 with exact card counts: `queue` queued and `ci` failing
 * pull requests, a plan with `limit` workers whose batch has `accepted`
 * accepted members, and a failed daily run (one A7 finding) for `needsYou`.
 */
function countedBoard({ queue = 0, ci = 0, accepted = 0, limit = null, needsYou = false }: { readonly queue?: number; readonly ci?: number; readonly accepted?: number; readonly limit?: number | null; readonly needsYou?: boolean }): BoardV1 {
  const template = BOARD.pull_requests.find(pr => pr.number === 1494)!;
  const done = { status: 'success', completed_at: BOARD.observed_at } as const;
  const members = Array.from({ length: accepted }, (_, index) => 1475 + index);
  return decodeBoard({
    ...BOARD, execution: { status: 'observed', terminals: [] },
    daily_run: { ...BOARD.daily_run, conclusion: needsYou ? 'failure' : 'success' },
    plan: limit === null ? { status: 'absent', truncated: false } : { status: 'observed', comment_url: 'https://github.com/plan', created_at: BOARD.observed_at, revision: 1,
      block: { protocol: 1, kind: 'repo-harness.plan', merge_order: [], holds: [], batches: [[...members, 1490]], seat_limits: { worker: limit } } },
    items: BOARD.items.filter(item => members.includes(item.number)).map(item => ({ ...item, pull_requests: [item.number + 1000] })),
    pull_requests: [
      ...members.map(number => ({ ...template, number: number + 1000, required_check: done, acceptance: { status: 'accepted', via: 'record', accepted_at: BOARD.observed_at, evidence_url: 'https://github.com/plan#accepted' } })),
      ...Array.from({ length: queue }, (_, index) => ({ ...template, number: 3000 + index, required_check: done })),
      ...Array.from({ length: ci }, (_, index) => ({ ...template, number: 4000 + index, required_check: { status: 'failure', completed_at: BOARD.observed_at } })),
    ],
  });
}
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

beforeEach(() => {
  // A run can cross midnight after NOW is set. The fixtures and the rendered day must read one day.
  setSystemTime(NOW);
  prefersDark = false;
  installDom();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  window.happyDOM.abort();
  setSystemTime();
});

describe('board data rules', () => {
  test('every development fixture passes the browser decoder', () => {
    for (const name of [...FIXTURE_NAMES, OFFICE_FIXTURE, ...OFFICE_DOOR_POLICIES.map(policy => `office-door-${policy}`)]) expect(() => fixtureProps(name)).not.toThrow();
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
    for (const hash of ['#board/repo/0', '#board/repo/1474/x', '#board//1474', '#board/repo/1474/1476/9']) expect(parseWorkspaceLocation(hash)).toEqual(DEFAULT_LOCATION);
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

  describe('quota attention', () => {
    const readFixture = (name: string) => fixtureProps(name).readQuota!(new AbortController().signal);
    const findings = () => rows('[data-quota-finding]').map(row => [row.getAttribute('data-quota-finding'), row.querySelector('[data-quota-chip]')!.getAttribute('data-quota-chip')]);
    const failure = () => document.querySelector('[data-quota-unavailable]')?.getAttribute('data-quota-unavailable') ?? null;

    test('every board shows one row per tight, exhausted or unknown account, and a failed read shows its reason with no row', async () => {
      const busyRead = await readFixture('busy');
      if (busyRead.state !== 'ok') throw new Error('the busy fixture reads a report');
      const chatgpt = busyRead.settings.accounts.find(account => account.account === 'chatgpt')!;
      const easy = { ...busyRead, settings: { ...busyRead.settings, accounts: [chatgpt, { ...chatgpt, account: 'claude' as const, state: 'surplus' as const }] } };
      const answers = [
        [busyRead, [['claude', 'tight']], null],
        [await readFixture('degraded'), [['claude', 'unknown'], ['chatgpt', 'exhausted']], null],
        [await readFixture('empty'), [], 'unreachable'],
        [easy, [], null],
      ] as const;
      for (const [answer, shown, failed] of answers) for (const layout of ['', 'office/']) {
        installDom(`http://127.0.0.1:4318/#board/${layout}${HARNESS_ID}/1474`);
        await mount(<OperatorApp {...props(busy(), { readQuota: async () => answer })} />);
        await settle();
        expect([layout, findings(), failure()]).toEqual([layout, shown as never, failed]);
        await act(async () => root?.unmount());
      }
    });

    test('a row shows the state, the reason or the window that set it, and only the tabs without a stage list it', async () => {
      boardAt();
      await mount(<OperatorApp {...props(busy(), { readQuota: () => readFixture('degraded') })} />);
      await settle();
      const row = (account: string) => rows(`[data-quota-finding="${account}"]`)[0]!;
      for (const part of ['Claude quota', 'no capture', 'Unknown']) expect(row('claude').textContent).toContain(part);
      for (const part of ['ChatGPT quota', 'secondary', '97% used', 'Exhausted']) expect(row('chatgpt').textContent).toContain(part);
      expect(row('chatgpt').querySelector('[data-quota-window="primary"]')).toBeNull();
      expect(rows('[data-board-tab="attention"]')[0]!.textContent).toBe('Waiting for you6');
      expect(document.querySelector('#board-attention')!.textContent).toBe('Waiting for you6');
      // The core findings do not change: quota rows carry no rule and stay outside `data-finding`.
      expect(rows('[data-finding]').map(finding => finding.getAttribute('data-finding'))).toEqual(['A1', 'A3', 'A7', 'R2']);
      await act(async () => rows('[data-board-tab="ready"]')[0]!.click());
      expect(findings()).toEqual([]);
      await act(async () => rows('[data-board-tab="attention"]')[0]!.click());
      expect(findings()).toHaveLength(2);
      const search = rows('input[type="search"]')[0]! as HTMLInputElement;
      await act(async () => {
        search.focus();
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(search, 'chatgpt');
        search.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'a', bubbles: true }) as unknown as Event);
      });
      expect(findings()).toEqual([['chatgpt', 'exhausted']]);
    });

    test('the board reads quota once when it opens and once per header Refresh; a failed Refresh drops the rows', async () => {
      const answers = [await readFixture('busy'), await readFixture('empty')];
      let reads = 0;
      boardAt();
      await mount(<OperatorApp {...props(busy(), { readQuota: async () => answers[reads++]! })} />);
      await settle();
      expect([reads, findings(), failure()]).toEqual([1, [['claude', 'tight']], null]);
      await act(async () => button('Refresh').click());
      await settle();
      expect([reads, findings(), failure()]).toEqual([2, [], 'unreachable']);
      expect(document.querySelector('[data-quota-unavailable]')!.textContent).toContain('Reason: the operator service returned no quota report. Refresh to read again.');
    });

    test('a running read stays the only read: a header Refresh or a page change starts no second read, and its result shows', async () => {
      const answer = await readFixture('busy');
      const refresh = () => act(async () => button('Refresh').click());
      const open = (workspace: string) => act(async () => document.querySelector<HTMLAnchorElement>(`.workspace-nav a[data-workspace="${workspace}"]`)!.click());
      const agents = '[data-quota-account="claude"]';
      const board = '[data-quota-finding="claude"]';
      const cases: readonly (readonly [string, string, () => Promise<void>, string])[] = [
        ['Agents, header Refresh', '#agents', refresh, agents],
        ['list board, header Refresh', `#board/${HARNESS_ID}/1474`, refresh, board],
        ['office room, header Refresh', `#board/office/${HARNESS_ID}/1474`, refresh, board],
        ['list board to Agents', `#board/${HARNESS_ID}/1474`, () => open('agents'), agents],
        ['Agents to Skills and back', '#agents', async () => { await open('skills'); await open('agents'); }, agents],
      ];
      for (const [name, hash, during, shown] of cases) {
        const settled: (() => void)[] = [];
        installDom(`http://127.0.0.1:4318/${hash}`);
        await mount(<OperatorApp {...props(busy(), { readQuota: () => new Promise(resolve => settled.push(() => resolve(answer))) })} />);
        await settle();
        await during();
        await settle();
        expect([name, settled.length, failure()]).toEqual([name, 1, null]);
        await act(async () => settled[0]!());
        await settle();
        expect([name, rows(shown).length, failure()]).toEqual([name, 1, null]);
        await refresh();
        await settle();
        expect([name, settled.length]).toEqual([name, 2]);
        await act(async () => root?.unmount());
      }
    });
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
      () => Response.json({ ...BOARD, protocol: 6 }),
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

  test('seats decode their own document and parent protocol 4 is refused', async () => {
    const original = globalThis.fetch;
    const requests: string[] = [];
    const answers = [Response.json({ state: 'pending' }, { status: 202 }), Response.json(SEATS), Response.json({ ...SEATS, protocol: 2 }), Response.json({ ...PARENTS, protocol: 4 })];
    globalThis.fetch = (async (url: unknown) => { requests.push(String(url)); return answers.shift()!; }) as typeof fetch;
    try {
      const signal = new AbortController().signal;
      expect(await fetchBoardSeats(HARNESS_ID, signal)).toEqual({ state: 'pending' });
      expect(await fetchBoardSeats(HARNESS_ID, signal)).toEqual({ state: 'ok', seats: SEATS });
      expect(await fetchBoardSeats(HARNESS_ID, signal)).toEqual({ state: 'unavailable', reason: 'parents_invalid' });
      expect(await fetchBoardParents(HARNESS_ID, signal)).toEqual({ state: 'unavailable', reason: 'parents_invalid' });
      expect(requests).toEqual([`/api/v1/repositories/${HARNESS_ID}/board/seats`, `/api/v1/repositories/${HARNESS_ID}/board/seats`, `/api/v1/repositories/${HARNESS_ID}/board/seats`, `/api/v1/repositories/${HARNESS_ID}/board/parents`]);
    } finally { globalThis.fetch = original; }
  });

  test('seats, board and parent facts poll each 3 s from the cached routes; only unreachable backs off', async () => {
    const subject: BoardSubject = { repository_id: HARNESS_ID, parent: 1474 };
    const repositories = [HARNESS_ID];
    const noBoard: BoardReader = async () => ({ state: 'unavailable', reason: 'unreachable' });
    const probes = {
      board: (reason: BoardReason) => {
        const read: BoardReader = async () => ({ state: 'unavailable', reason });
        return function Probe() { useBoard(read, subject, 0); return null; };
      },
      parents: (reason: BoardParentsReason) => {
        const read: BoardParentsReader = async () => ({ state: 'unavailable', reason });
        return function Probe() { useBoardParents(read, HARNESS_ID, 0); return null; };
      },
      seats: (reason: BoardParentsReason) => {
        const read: BoardSeatsReader = async () => ({ state: 'unavailable', reason });
        return function Probe() { useBoardSeats(read, HARNESS_ID, 0); return null; };
      },
      overview: (reason: BoardParentsReason) => {
        const read: BoardParentsReader = async () => ({ state: 'unavailable', reason });
        const readSeats = () => new Promise<never>(() => {});
        return function Probe() { useOfficeOverview(repositories, read, noBoard, 0, readSeats); return null; };
      },
      // One repository refuses each cycle; the other answers. The refusal is an answer, so the overview keeps its 3 s cycle.
      overviewOneRefuses: () => {
        const read: BoardParentsReader = async id => id === HARNESS_ID ? { state: 'unavailable', reason: 'parents_github_failed' } : { state: 'ok', list: PARENTS };
        const readSeats = () => new Promise<never>(() => {});
        return function Probe() { useOfficeOverview([HARNESS_ID, 'repo_second'], read, noBoard, 0, readSeats); return null; };
      },
      repositories: (read: RepositoriesReader) => function Probe() { useRepositories(read, undefined, 0); return null; },
      overviewBoard: (reason: BoardReason) => {
        const read: BoardReader = async () => ({ state: 'unavailable', reason });
        const readParents: BoardParentsReader = async () => ({ state: 'ok', list: PARENTS });
        const readSeats: BoardSeatsReader = async () => ({ state: 'ok', seats: SEATS });
        return function Probe() { useOfficeOverview(repositories, readParents, read, 0, readSeats); return null; };
      },
    };
    const original = globalThis.setTimeout;
    const delays: number[] = [];
    // Only the loop timer is held; React and the test helpers keep their short timers.
    globalThis.setTimeout = ((run: () => void, delay = 0) => {
      if (delay < 3000) return original(run, delay);
      delays.push(delay);
      return 0;
    }) as typeof setTimeout;
    try {
      for (const [Probe, delay] of [
        [probes.seats('parents_hc_failed'), 3000], [probes.seats('unreachable'), 6000],
        [probes.parents('parents_github_failed'), 3000], [probes.board('board_collect_failed'), 3000], [probes.overview('parents_hc_failed'), 3000], [probes.overviewOneRefuses(), 3000],
        [probes.parents('unreachable'), 6000], [probes.board('unreachable'), 6000], [probes.overview('unreachable'), 6000],
        // The registry list keeps its own 30 s interval.
        [probes.repositories(async () => ({ state: 'unavailable', reason: 'registry_unavailable' })), 30_000],
        [probes.repositories(async () => { throw new Error('operator_api_unavailable'); }), 60_000],
      ] as const) {
        delays.length = 0;
        await mount(<Probe />);
        await settle();
        expect(delays).toEqual([delay]);
        await act(async () => root?.unmount());
      }
      // The overview reads the board of each active parent on the same 3 s loop as its parents and seats.
      for (const [Probe, board] of [[probes.overviewBoard('board_pending'), 3000], [probes.overviewBoard('unreachable'), 6000]] as const) {
        delays.length = 0;
        await mount(<Probe />);
        await settle();
        expect([...delays].sort((left, right) => left - right)).toEqual([3000, 3000, board]);
        await act(async () => root?.unmount());
      }
    } finally { globalThis.setTimeout = original; }
  });

  test('the registry reader decodes the list with the core decoder and refuses any other shape', async () => {
    const valid = { protocol: 1, kind: 'operator_repositories', repositories: [{ repository_id: HARNESS_ID, display_name: 'repo-harness', access_mode: 'read_write' }], stale_registrations: 3 };
    const answers: (() => Response)[] = [
      () => Response.json(valid),
      () => Response.json({ ...valid, protocol: 2 }),
      () => Response.json({ ...valid, repositories: [{ ...valid.repositories[0], repo_root: '/Users/me/repo-harness' }] }),
      () => Response.json({ ...valid, repositories: [valid.repositories[0], valid.repositories[0]] }),
      () => Response.json({ error: { code: 'registry_unavailable', message: 'unreadable', next_action: 'retry' } }, { status: 503 }),
      () => new Response('bad gateway', { status: 502 }),
    ];
    const original = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (url: unknown) => { requests.push(String(url)); return answers[requests.length - 1]!(); }) as typeof fetch;
    try {
      const results: string[] = [];
      for (const _ of answers) {
        try {
          const read = await fetchRepositories(new AbortController().signal);
          results.push('state' in read ? `refused ${read.reason}` : `ok ${read.stale_registrations}`);
        }
        catch (error) { results.push((error as Error).message); }
      }
      expect(results).toEqual(['ok 3', 'repositories response is invalid', 'repositories response is invalid', 'repositories response is invalid', 'refused registry_unavailable', 'operator_api_unavailable']);
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

const HOME_URL = 'http://127.0.0.1:4318/#home';
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

describe('board office (#1755)', () => {
  const rows = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));
  type Terminal = BoardV1['execution'] extends infer E ? E extends { readonly terminals: readonly (infer T)[] } ? T : never : never;
  const seat = (address: string, seatName: string, issue: number | null, pr: number | null, status: string | null, state: 'live' | 'finished' = 'live'): Extract<Terminal, { readonly seat_status: 'observed' }> =>
    ({ address, name: address, agent: null, state, status, status_kind: null, status_msg: null, status_ms:null, turn: 0, branch: null, seat_status: 'observed', seat: seatName, issue, pr });
  const observedClaim = { status_kind: 'observed', url: 'https://github.com/Ancienttwo/repo-harness/issues/1478#issuecomment-1', created_at: '2026-11-02T21:00:00Z', status: 'draft PR open; claim remains active', pr: null, head_sha: null } as const;
  /** The recorded board of #1474 with edited pull requests, items and terminals. */
  const boardWith = ({ prs = {}, items = {}, terminals, plan }: {
    readonly prs?: Readonly<Record<number, Partial<BoardV1['pull_requests'][number]>>>;
    readonly items?: Readonly<Record<number, Partial<BoardV1['items'][number]>>>;
    readonly terminals?: readonly Terminal[];
    readonly plan?: BoardV1['plan'];
  }): BoardV1 => ({
    ...BOARD,
    pull_requests: BOARD.pull_requests.map(pr => ({ ...pr, ...prs[pr.number] })),
    items: BOARD.items.map(item => ({ ...item, ...items[item.number] })),
    execution: terminals === undefined ? BOARD.execution : { status: 'observed', terminals },
    plan: plan ?? BOARD.plan,
  });
  const PLAN: BoardV1['plan'] = {
    status: 'observed', comment_url: 'https://github.com/Ancienttwo/repo-harness/issues/1474#issuecomment-1', created_at: '2026-11-02T20:00:00Z', revision: 1,
    block: { protocol: 1, kind: 'repo-harness.plan', merge_order: [1475, 1476, 1479], holds: [{ issue: 1477, reason: 'waits for #1476' }], batches: [[1475, 1476]], seat_limits: { worker: 3 } },
  };
  /** The parent list that carries the terminals of a board: the seats of the room. */
  const seatsOf = (board: BoardV1): BoardSeatsV1 => ({ ...SEATS, seats: board.execution.status === 'observed' ? board.execution.terminals.map(terminal => ({ ...terminal, seat: terminal.seat_status === 'observed' ? terminal.seat : '', parent: '1474' })) : [] });
  const room = (board: BoardV1) => officeRoom(seatsOf(board), { board, attention: evaluateBoardAttention(board) });
  const officeAt = (path = '') => installDom(`http://127.0.0.1:4318/#board/office${path}`);

  test('each desk state rule, in order, from the board fields; the stage and the queue read the live seats and the open pull requests', () => {
    const board = boardWith({
      prs: {
        1499: { required_check: { status: 'failure', completed_at: '2026-11-02T21:00:00Z' } },
        1494: { required_check: { status: 'pending' } },
        1491: { acceptance: { status: 'not_accepted' } },
      },
      items: { 1478: { claim_status: observedClaim } },
      terminals: [
        seat('t1', 'worker', 1476, 1499, 'working'),
        seat('t2', 'worker', 1479, 1494, 'working'),
        seat('t3', 'worker', 1475, 1491, 'working'),
        seat('t4', 'worker', 1477, null, 'working'),
        seat('t5', 'worker', 1478, null, 'working'),
        seat('t6', 'worker', 1478, null, 'blocked'),
        seat('t7', 'worker', null, null, 'working'),
        // Left out: a finished worker, a seat-label gap and the two lead seats.
        seat('t8', 'worker', 1480, null, 'working', 'finished'),
        { address: 't9', name: null, agent: null, state: 'live', status: null, status_kind: null, status_msg: null, status_ms:null, turn: 0, branch: null, seat_status: 'unavailable', reason: 'seat_label_missing' },
        seat('t10', 'orchestrator', null, null, 'idle'),
        seat('t11', 'advisor', null, null, 'idle'),
      ],
    });
    const office = room(board);
    expect(office.desks.map(desk => [desk.address, desk.state, desk.drawerIssue, desk.title])).toEqual([
      ['t1', 'ci_failed', 1476, BOARD.items.find(item => item.number === 1476)!.title],
      ['t2', 'ci_pending', 1479, BOARD.items.find(item => item.number === 1479)!.title],
      ['t3', 'acceptance_queue', 1475, BOARD.items.find(item => item.number === 1475)!.title],
      ['t4', 'no_claim_status', 1477, BOARD.items.find(item => item.number === 1477)!.title],
      ['t5', 'coding', 1478, BOARD.items.find(item => item.number === 1478)!.title],
      ['t6', 'blocked', 1478, BOARD.items.find(item => item.number === 1478)!.title],
      ['t7', 'unknown', null, null],
    ]);
    expect([office.orchestrator?.address, office.advisor?.address]).toEqual(['t10', 't11']);
    // The queue is every open pull request with a passed check that is not accepted; a seat in it is the away desk.
    expect(office.queue.map(entry => [entry.pr, entry.issue])).toEqual([[1491, 1475]]);
    expect(office.desks.find(desk => desk.address === 't3')?.queued).toBe(1491);
    // A seat that names only a pull request takes the item that lists it, and that pull request's head branch only when no item lists it.
    const byPullRequest = room(boardWith({ terminals: [seat('t1', 'worker', null, 1491, null), seat('t2', 'worker', null, 4242, null)] })).desks;
    expect(byPullRequest.map(desk => [desk.state, desk.drawerIssue, desk.title])).toEqual([
      ['idle', 1475, BOARD.items.find(item => item.number === 1475)!.title], ['idle', null, null],
    ]);
    // The seat branch is the terminal's, with or without a pull request; the pull request head is not a second source.
    const branches = room(boardWith({ terminals: [{ ...seat('t1', 'worker', 1299, null, 'working'), branch: 'feat/1299-dsh-companion' }, seat('t2', 'worker', null, 1491, null)] })).desks;
    expect(branches.map(desk => desk.branch)).toEqual(['feat/1299-dsh-companion', null]);
  });

  test('without an observed plan: the issue-flow limit and no cart; with a plan the limit, the current batch and the holds come from the block; the tray holds what nobody works on', () => {
    const recorded = room(BOARD);
    expect(BOARD.plan.status).toBe('unavailable');
    expect([recorded.plan, recorded.limit, recorded.cart]).toEqual([{ status: 'none' }, ISSUE_FLOW_WORKER_LIMIT, null]);
    const worked = new Set(BOARD.items.filter(item => item.pull_requests.length > 0).map(item => item.number));
    expect(recorded.backlog.map(entry => entry.issue)).toEqual(BOARD.items.filter(item => item.state === 'open' && !worked.has(item.number) && ![1476, 1475].includes(item.number)).map(item => item.number));
    expect(recorded.desks.map(desk => [desk.address, desk.state])).toEqual([['t1', 'blocked'], ['t2', 'done']]);
    expect(recorded.orchestrator?.address).toBe('t3');
    expect(recorded.advisor).toBeNull();
    // The door counts the A1 findings only: an accepted, ready pull request that waits for a merge.
    const attention = evaluateBoardAttention(BOARD);
    const a1 = { rule: 'A1', route: 'orchestrator', issues: [], pull_requests: [1491], terminals: [], message: '' } as const;
    expect(attention.findings.filter(finding => finding.rule !== 'A1').length).toBeGreaterThan(0);
    expect(officeRoom(seatsOf(BOARD), { board: BOARD, attention: { ...attention, findings: attention.findings.filter(finding => finding.rule !== 'A1') } }).merge_waits).toBe(0);
    expect(officeRoom(seatsOf(BOARD), { board: BOARD, attention: { ...attention, findings: [a1, a1] } }).merge_waits).toBe(2);

    const planned = room(boardWith({ plan: PLAN }));
    expect(planned.plan).toEqual({ status: 'observed', created_at: '2026-11-02T20:00:00Z', revision: 1, merge_order: [1475, 1476, 1479], worker_limit: 3, batch: 2 });
    expect(planned.limit).toBe(3);
    // #1475's PR is accepted, #1476's is not: the cart has two places and one member.
    expect(planned.cart).toEqual({ size: 2, accepted: [1475] });
    expect(planned.holds).toEqual([{ issue: 1477, title: BOARD.items.find(item => item.number === 1477)!.title, reason: 'waits for #1476' }]);
    // A merged batch leaves the cart: the next batch with an unmerged member takes it.
    const merged = boardWith({ prs: Object.fromEntries(BOARD.pull_requests.map(pr => [pr.number, { state: 'merged' as const }])), plan: PLAN });
    expect(room(merged).cart).toBeNull();
  });

  test('the sample state equals the S0 mockup page: six workers, two away, two in the queue, three in the cart, three in the tray and the feed from server times', () => {
    const board = officeBoard(NOW);
    const sample = officeRoom(officeSeats(HARNESS_ID, NOW), { board, attention: evaluateBoardAttention(board) });
    expect(sample.desks.map(desk => [desk.state, desk.issue, desk.pr, desk.agent])).toEqual([
      ['coding', 1299, null, 'claude-code'], ['ci_pending', null, 1323, 'codex'], ['ci_failed', null, 1295, 'codex'],
      ['no_claim_status', 1305, null, 'claude-code'], ['acceptance_queue', 1300, 1324, 'claude-code'], ['acceptance_queue', 1321, 1321, 'codex'],
    ]);
    expect([sample.orchestrator?.agent, sample.advisor?.agent, sample.limit]).toEqual(['claude-code', 'codex', 6]);
    expect(sample.queue.map(entry => [entry.pr, entry.agent])).toEqual([[1324, 'claude-code'], [1321, 'codex']]);
    expect(sample.cart).toEqual({ size: 5, accepted: [1315, 1320, 1311] });
    expect([...sample.holds.map(hold => hold.issue), ...sample.backlog.map(entry => entry.issue)]).toEqual([1316, 1302, 1304]);
    expect(sample.feed.map(event => event.kind)).toEqual(['queued', 'accepted', 'ci_failed', 'plan', 'queued']);
    expect(sample.feed[1]).toMatchObject({ pr: 1311, carted: true });
    expect(activeParent(officeParents(HARNESS_ID, NOW), officeSeats(HARNESS_ID, NOW))).toBe(OFFICE_PARENT);
    expect(activeParent(officeParents('repo_1f2e3d4c5b6a7980', NOW), officeSeats('repo_1f2e3d4c5b6a7980', NOW))).toBeNull();
  });

  const SCENE_ROOM: SceneRoom = {
    name: 'repo-harness', parent: 1, lit: true, orchestrator: null, advisor: null, plan: null, limit: 8, desks: [], queue: [], cart: 0, tray: 0, mergeWait: null, mines: new Map(),
    text: { noParent: 'no parent', orchestrator: '', advisor: '', tray: '', cart: '', queue: '', seat: index => `Seat ${index + 1}`, free: 'free', roped: 'roped', mine: rule => rule, say: () => '' },
  };

  test('the avatar follows the hc agent word, and the scene keeps a desk for every seat: free to the limit, roped to 8, a new row past 8', () => {
    expect(['claude-code', 'codex', 'pi', 'grok', null].map(agent => sceneAgent(agent))).toEqual([
      { kind: 'claude', badge: 'CC' }, { kind: 'codex', badge: 'CX' }, { kind: 'other', badge: 'PI' }, { kind: 'other', badge: 'GR' }, { kind: 'unknown', badge: '?' },
    ]);
    const scene = (desks: number, limit: number) => {
      const input: SceneRoom = {
        ...SCENE_ROOM, limit,
        desks: Array.from({ length: desks }, (_, index) => ({ key: `desk:t${index}`, agent: sceneAgent('codex'), state: 'coding', number: `#${index}`, label: 'Coding' })),
      };
      const { height, deskLabels } = composeRoom(input, { frame: 0, night: false, advisorBusy: false, effect: null });
      return [height, deskLabels.filter(label => label.text === 'free').length, deskLabels.filter(label => label.text === 'roped').length, deskLabels.length];
    };
    for (const [desks, limit, expected] of [
      [0, 8, [240, 8, 0, 8]], [2, 3, [240, 1, 5, 8]], [7, 6, [240, 0, 1, 8]], [8, 6, [240, 0, 0, 8]], [9, 8, [292, 0, 3, 12]], [13, 8, [344, 0, 3, 16]],
    ] as const) expect(scene(desks, limit)).toEqual([...expected]);
  });

  test('the scene reads the parent, the plan and the queue from their own fields, and reduced motion stands the boss still', () => {
    const view = { frame: 0, night: false, advisorBusy: false, effect: null };
    const plan = { revision: null, order: [1], limit: 1, batch: 1 };
    for (const [parent, roomPlan, lit, label] of [
      [null, null, false, true], [null, null, true, true], [1, null, false, false], [1, plan, false, false], [1, null, true, false],
    ] as const) expect(composeRoom({ ...SCENE_ROOM, parent, plan: roomPlan, lit }, view).labels.some(entry => entry.text === 'no parent')).toBe(label);
    // The whiteboard title carries the revision; no revision keeps PLAN.
    const whiteboard = (revision: number | null) => composeRoom({ ...SCENE_ROOM, plan: { ...plan, revision } }, view).paths;
    expect(whiteboard(7)).not.toEqual(whiteboard(null));
    expect(whiteboard(7)).not.toEqual(whiteboard(8));
    // A pending board read writes READING, not NO PLAN.
    expect(composeRoom({ ...SCENE_ROOM, parent: 1, plan: 'reading' }, view).paths).not.toEqual(composeRoom({ ...SCENE_ROOM, parent: 1, plan: null }, view).paths);
    // Each policy has its own door, and no finding has no mark.
    const doors = ([null, 'on', 'off', 'unknown'] as const).map(mergeWait => JSON.stringify(composeRoom({ ...SCENE_ROOM, mergeWait }, view).paths));
    expect(new Set(doors).size).toBe(4);

    const queue = (count: number) => {
      const { hits, labels } = composeRoom({ ...SCENE_ROOM, queue: Array.from({ length: count }, (_, index) => ({ key: `queue:${index}`, agent: sceneAgent('codex'), pr: index })) }, view);
      return [hits.filter(hit => hit.key.startsWith('queue')).map(hit => hit.key), labels.find(entry => entry.text.startsWith('+'))?.text ?? null];
    };
    for (const [count, keys, more] of [
      [3, ['queue:0', 'queue:1', 'queue:2'], null], [4, ['queue', 'queue:0', 'queue:1', 'queue:2'], '+1'], [6, ['queue', 'queue:0', 'queue:1', 'queue:2'], '+3'],
    ] as const) expect(queue(count)).toEqual([[...keys], more]);

    for (const command of ['rage', 'carrot', 'mine', 'valve'] as const) {
      const at = (elapsed: number, still: boolean) => composeRoom(SCENE_ROOM, { ...view, effect: sceneEffect({ command, at: 1000 }, 1000 + elapsed, still) }).paths;
      expect(at(9000, true)).toEqual(at(0, true));
      expect(at(9000, false)).not.toEqual(at(0, false));
      expect(sceneEffect({ command, at: 1000 }, 16000, true)).toBeNull();
    }
    expect(sceneEffect(null, 1000, true)).toBeNull();
  });

  test('the switch is part of the location: list and office open the same subject, and the office overview reads each repository once', async () => {
    for (const [hash, item, place] of [
      ['#board/office', 'office', null],
      [`#board/office/${HARNESS_ID}/1474`, `office/${HARNESS_ID}/1474`, { repository_id: HARNESS_ID, parent: 1474, issue: null, layout: 'office' }],
      [`#board/office/${HARNESS_ID}/1474/1476`, `office/${HARNESS_ID}/1474/1476`, { repository_id: HARNESS_ID, parent: 1474, issue: 1476, layout: 'office' }],
      [`#board/${HARNESS_ID}/1474`, `${HARNESS_ID}/1474`, { repository_id: HARNESS_ID, parent: 1474, issue: null, layout: 'list' }],
    ] as const) {
      const location = parseWorkspaceLocation(hash);
      expect([location.item, boardPlace(location.item), workspaceHash(location)]).toEqual([item, place, hash]);
    }
    for (const hash of ['#board/office/repo', '#board/office/1474', '#board/office/office', `#board/office/${HARNESS_ID}/1474/1476/9`]) expect(parseWorkspaceLocation(hash)).toEqual(DEFAULT_LOCATION);
    // The room of a repository with no selected parent.
    const repositoryRoom = parseWorkspaceLocation(`#board/office/${HARNESS_ID}`);
    expect([boardRoom(repositoryRoom.item), boardPlace(repositoryRoom.item), boardLayout(repositoryRoom.item), workspaceHash(repositoryRoom)]).toEqual([HARNESS_ID, null, 'office', `#board/office/${HARNESS_ID}`]);

    const lists: string[] = [];
    await mount(<OperatorApp {...props(busy(), { readBoardParents: async (id) => { lists.push(id); return { state: 'ok', list: PARENTS }; } })} />);
    await settle();
    expect(rows('[data-board-layout]').map(button => [button.getAttribute('data-board-layout'), button.getAttribute('aria-pressed')])).toEqual([['office', 'false'], ['list', 'true']]);
    lists.length = 0;
    await act(async () => rows('[data-board-layout="office"]')[0]!.click());
    await settle();
    expect(window.location.hash).toBe('#board/office');
    expect(document.querySelector('[data-board-office]')?.getAttribute('data-board-office')).toBe('overview');
    // One read for each registered repository: the list read stops, or it would take the parents slot of the overview.
    expect(lists).toEqual(REGISTRY.repositories.map(row => row.repository_id));
    await act(async () => rows(`[data-office-card="room"][data-repository="${HARNESS_ID}"]`)[0]!.click());
    await settle();
    expect(window.location.hash).toBe(`#board/office/${HARNESS_ID}`);
    expect(document.querySelector('[data-board-office="room"]')?.getAttribute('data-board-parent')).toBe('1474');
    // A desk selects the side panel, and the panel title opens the Task drawer of its issue; the switch keeps the board and the drawer issue.
    await act(async () => rows('[data-desk="t2"]')[0]!.click());
    expect(window.location.hash).toBe(`#board/office/${HARNESS_ID}`);
    expect(document.querySelector('[data-office-panel] [data-command] code')?.textContent).toBe('gh pr checks 1491');
    await act(async () => rows('[data-desk="t1"]')[0]!.click());
    await act(async () => rows('[data-panel-issue="1476"]')[0]!.click());
    await settle();
    expect(window.location.hash).toBe(`#board/office/${HARNESS_ID}/1474/1476`);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('herdr-core 迁移 2');
    await key('Escape');
    expect(window.location.hash).toBe(`#board/office/${HARNESS_ID}/1474`);
    await act(async () => rows('[data-desk="t2"]')[0]!.click());
    await act(async () => rows('[data-panel-issue="1475"]')[0]!.click());
    expect(window.location.hash).toBe(`#board/office/${HARNESS_ID}/1474/1475`);
    await act(async () => rows('[data-board-layout="list"]')[0]!.click());
    await settle();
    expect(window.location.hash).toBe(`#board/${HARNESS_ID}/1474/1475`);
    expect(document.querySelector('[data-board-office]')).toBeNull();
    expect(document.querySelector('[data-board-parent]')?.getAttribute('data-board-parent')).toBe('1474');
  });

  const fiveRegistered = (ids: readonly string[]) => decodeOperatorRepositories({ protocol: 1, kind: 'operator_repositories', stale_registrations: 0, repositories: ids.map((id, index) => ({ repository_id: id, display_name: `service-${index + 1}`, access_mode: 'read_write' })) });
  test('the overview reads seats while parent facts wait; each facts loop is serial and boards name only active parents', async () => {
    officeAt();
    const ids = [HARNESS_ID, 'repo_2b3c4d5e6f708192', 'repo_3c4d5e6f70819203', 'repo_4d5e6f7081920314'];
    const [seated, idle, failed, last] = ids as [string, string, string, string];
    const five = fiveRegistered(ids);
    const parents = (id: string): BoardParentsRead => id === failed ? { state: 'unavailable', reason: 'parents_hc_failed' }
      : { state: 'ok', list: id === idle ? { ...PARENTS, parents: [] } : PARENTS };
    const waiting: { readonly read: string; readonly finish: () => void }[] = [];
    const delayed = <T,>(read: string, answer: T) => new Promise<T>(resolve => waiting.push({ read, finish: () => resolve(answer) }));
    const asked: string[] = [];
    await mount(<OperatorApp {...props(busy(), {
      initialRepositories: five, readRepositories: async () => five,
      readBoardSeats: async id => id === failed ? { state: 'unavailable', reason: 'parents_hc_failed' }
        : { state: 'ok', seats: { ...SEATS, seats: id === idle ? [] : SEATS.seats } },
      readBoardParents: id => delayed(`parents:${id}`, parents(id)),
      readBoard: async (subject) => { asked.push(`${subject.repository_id}:${subject.parent}`); return { state: 'unavailable', reason: 'board_pending' }; },
    })} />);
    await settle();
    expect(rows('[data-office-card="room"]')).toHaveLength(2);
    for (const read of [`parents:${seated}`, `parents:${idle}`, `parents:${failed}`, `parents:${last}`]) {
      await settle();
      expect(waiting.map(entry => entry.read)).toEqual([read]);
      await act(async () => waiting.shift()!.finish());
    }
    await settle();
    expect(waiting).toEqual([]);
    // Only the active parent of each repository with one is read.
    expect([...new Set(asked)]).toEqual([`${seated}:1474`, `${last}:1474`]);
    expect(rows('[data-office-card="loading"]')).toHaveLength(0);
    const refused = rows(`[data-office-card="failed"][data-repository="${failed}"][data-board-parents-reason="parents_hc_failed"]`);
    expect(refused).toHaveLength(1);
    expect(refused[0]!.tagName).toBe('DIV');
    const quiet = rows(`[data-office-card="idle"][data-repository="${idle}"]`)[0]!;
    expect(quiet.getAttribute('aria-label')).toContain('idle, no parent issue has a seat');
    expect(quiet.querySelector('.board-office__mini')?.hasAttribute('data-night')).toBe(true);
    await act(async () => quiet.click());
    expect(window.location.hash).toBe(`#board/office/${idle}`);
  });

  test('the overview keeps parent loading and failure distinct from a confirmed absent parent', async () => {
    for (const occupied of [true, false]) {
      officeAt();
      const one = fiveRegistered([HARNESS_ID]);
      let finish!: (read: BoardParentsRead) => void;
      let readParents = () => new Promise<BoardParentsRead>(resolve => { finish = resolve; });
      await mount(<OperatorApp {...props(busy(), {
        initialRepositories: one, readRepositories: async () => one,
        readBoardParents: () => readParents(),
        readBoardSeats: async () => ({ state: 'ok', seats: { ...SEATS, seats: occupied ? SEATS.seats : [] } }),
      })} />);
      await settle();
      const card = () => document.querySelector<HTMLElement>(`[data-office-card][data-repository="${HARNESS_ID}"]`)!;
      expect(card().textContent).toContain(translate('en', 'board.parents.loading.title'));
      expect(card().textContent).not.toMatch(/no parent/iu);
      expect(card().getAttribute('aria-label')).not.toMatch(/no parent/iu);
      await act(async () => finish({ state: 'unavailable', reason: 'parents_github_failed' }));
      await settle();
      expect(card().textContent).toContain(translate('en', 'board.reason.parents_github_failed'));
      expect(card().getAttribute('data-board-parents-reason')).toBe('parents_github_failed');
      expect(card().textContent).not.toMatch(/no parent/iu);
      expect(card().getAttribute('aria-label')).not.toMatch(/no parent/iu);
      readParents = async () => ({ state: 'ok', list: { ...PARENTS, parents: [] } });
      await act(async () => rows('button').find(element => element.textContent?.includes('Refresh'))!.click());
      await settle();
      expect(card().textContent).toMatch(/no parent/iu);
      expect(card().getAttribute('data-board-parents-reason')).toBeNull();
      await act(async () => root?.unmount()); root = null;
    }
  });

  test('the card and the office chips show only what the board of the active parent gives, with no chip for a missing value', async () => {
    officeAt();
    const parentless = { ...PARENTS, parents: [] };
    const idle = { ...PARENTS, parents: [] };
    const ok = (board: BoardV1): BoardRead => ({ state: 'ok', board });
    const cases: readonly { readonly id: string; readonly list: BoardParentsRead; readonly read: () => BoardRead; readonly chips: readonly string[]; readonly name?: string }[] = [
      { id: 'repo_1000000000000001', list: { state: 'ok', list: PARENTS }, read: () => ok(countedBoard({ limit: 8 })), chips: ['2/8'], name: 'parent #1474' },
      { id: 'repo_1000000000000002', list: { state: 'ok', list: PARENTS }, read: () => ok(countedBoard({ queue: 2, ci: 1 })), chips: ['worker 2 · no plan', 'queue 2', 'CI ✗ 1'] },
      { id: 'repo_1000000000000003', list: { state: 'ok', list: PARENTS }, read: () => ok(countedBoard({ queue: 1, ci: 1, accepted: 2, limit: 8, needsYou: true })), chips: ['needs you 1', '2/8', 'queue 1', 'CI ✗ 1', 'batch 2/6'] },
      { id: 'repo_1000000000000004', list: { state: 'ok', list: PARENTS }, read: () => ({ state: 'unavailable', reason: 'board_pending' }), chips: ['worker 2', 'board not read'] },
      { id: 'repo_1000000000000005', list: { state: 'ok', list: PARENTS }, read: () => ({ state: 'unavailable', reason: 'board_collect_failed' }), chips: ['worker 2', 'board: board_collect_failed'] },
      { id: 'repo_1000000000000006', list: { state: 'ok', list: PARENTS }, read: () => ({ state: 'unavailable', reason: 'unreachable' }), chips: ['worker 2', 'board: unreachable'] },
      { id: 'repo_1000000000000007', list: { state: 'ok', list: parentless }, read: () => { throw new Error('a repository with no active parent reads no board'); }, chips: ['worker 2'], name: 'no parent' },
      { id: 'repo_1000000000000008', list: { state: 'ok', list: idle }, read: () => { throw new Error('an idle repository reads no board'); }, chips: ['Idle'], name: 'No parent in progress' },
    ];
    const registry = fiveRegistered(cases.map(entry => entry.id));
    await mount(<OperatorApp {...props(busy(), {
      initialRepositories: registry, readRepositories: async () => registry,
      readBoardSeats: async id => ({ state: 'ok', seats: { ...SEATS, seats: id.endsWith('8') ? [] : SEATS.seats } }),
      readBoardParents: async id => cases.find(entry => entry.id === id)!.list,
      readBoard: async subject => cases.find(entry => entry.id === subject.repository_id)!.read(),
    })} />);
    await settle();
    for (const { id, chips, name } of cases) {
      const card = rows(`[data-repository="${id}"]`)[0]!;
      expect(Array.from(card.querySelectorAll('[data-office-chip]')).map(chip => chip.textContent)).toEqual([...chips]);
      if (name !== undefined) expect(card.querySelector('.board-office__card-name')?.textContent).toContain(name);
      expect(card.tagName).toBe('BUTTON');
    }
    // The card shows the observation time of its board; a parent with no board read shows none.
    expect(rows('[data-repository$="1"] [data-office-observed] time')[0]!.getAttribute('datetime')).toBe(BOARD.observed_at);
    expect(rows('[data-repository$="4"] [data-office-observed]')).toHaveLength(0);
    // Waiting for you first, then CI failed, then the lit rooms, then the idle rooms, each in registry order.
    expect(rows('[data-office-card]').map(card => card.getAttribute('data-repository')!.at(-1))).toEqual(['3', '2', '1', '4', '5', '6', '7', '8']);
    expect(rows('[data-repository$="3"]')[0]!.hasAttribute('data-waiting')).toBe(true);
    expect(rows('[data-office-total]').map(chip => chip.textContent)).toEqual(['rooms: 8', 'on seat: 14', 'queued for acceptance: 3', 'CI failed: 2', 'waiting for you: 1', 'rooms not read: 3']);
    expect(rows('[data-repository$="3"]')[0]!.getAttribute('aria-label')).toBe('service-3: needs you 1, 2/8, queue 1, CI ✗ 1, batch 2/6. Open the office.');
    expect(document.querySelector('.board-office__mascot')?.getAttribute('aria-label')).toBe('Boss (you): calm');
  });

  test('the sample cards equal their rooms: the limit, the stalled count and the current batch from each sample board', async () => {
    officeAt();
    await mount(<OperatorApp {...fixtureProps(OFFICE_FIXTURE)} />);
    await settle();
    const chips = (name: string) => Array.from(rows('[data-office-card]').find(card => card.querySelector('strong')?.textContent === name)!.querySelectorAll<HTMLElement>('[data-office-chip]')).map(chip => [chip.textContent, chip.getAttribute('data-tone')]);
    // The sample board of repo-harness has an A2 finding, and its room shows it too.
    expect(chips('repo-harness')).toEqual([['needs you 1', 'accent'], ['6/6 full', 'warn'], ['queue 2', 'warn'], ['CI ✗ 1', 'danger'], ['no status 1', 'warn'], ['batch 3/6', 'ok']]);
    expect(chips('aiphabee')).toEqual([['needs you 1', 'accent'], ['3/4', 'subtle'], ['CI ✗ 1', 'danger'], ['batch 2/6', 'ok']]);
    expect(chips('AstroZi')).toEqual([['3/3 full', 'warn'], ['queue 1', 'warn'], ['no status 1', 'warn']]);
    expect(chips('arch-context')).toEqual([['worker 1 · no plan', 'subtle']]);
  });

  test('the card is the room of its active parent: the same seats and board give the same desks and counts, in the card and in the room it opens', async () => {
    const planned = countedBoard({ queue: 1, ci: 1, accepted: 2, limit: 2, needsYou: true });
    const view = { kind: 'ready', parents: { kind: 'ready', list: PARENTS }, seats: SEATS, board: { state: 'ok', board: planned } } as const;
    const card = officeCard(view);
    expect(card.room).toEqual(officeRoom(SEATS, { board: planned, attention: evaluateBoardAttention(planned) }));
    expect(card.board).toEqual({ status: 'observed', observed_at: planned.observed_at, needs_you: 1, ci_failures: 1 });
    // With no board read, the card keeps the seat-only room.
    expect(officeCard({ ...view, board: { state: 'unavailable', reason: 'board_pending' } })).toMatchObject({ room: officeRoom(SEATS, null), board: { status: 'not_read' } });

    officeAt();
    const one = fiveRegistered([HARNESS_ID]);
    await mount(<OperatorApp {...props(busy(), {
      initialRepositories: one, readRepositories: async () => one,
      readBoardParents: async () => ({ state: 'ok', list: PARENTS }),
      readBoardSeats: async () => ({ state: 'ok', seats: SEATS }),
      readBoard: async () => ({ state: 'ok', board: planned }),
    })} />);
    await settle();
    const office = rows(`[data-office-card="room"][data-repository="${HARNESS_ID}"]`)[0]!;
    expect(Array.from(office.querySelectorAll('[data-office-chip]')).map(chip => chip.textContent)).toEqual(['needs you 1', '2/2 full', 'queue 1', 'CI ✗ 1', 'batch 2/6']);
    await act(async () => office.click());
    await settle();
    expect(document.querySelector('[data-seat-meter]')?.getAttribute('data-seat-meter')).toBe('2/2');
    expect(document.querySelector('.board-office__scene svg')?.getAttribute('aria-label')).toContain('2 worker desks, 1 pull requests in the acceptance queue');
  });

  test('a hidden tab drops every kept observation: with a parents read, a board read or no read in flight, the resumed cycle shows nothing old', async () => {
    const stale = 3;
    const fresh = 5;
    const totals = () => rows('[data-office-total]').map(chip => chip.textContent);
    for (const inFlight of ['parents', 'board', 'none'] as const) {
      officeAt();
      let visibility = 'visible';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
      const visible = async (value: string) => { visibility = value; await act(async () => document.dispatchEvent(new window.Event('visibilitychange') as unknown as Event)); };
      const one = fiveRegistered([HARNESS_ID]);
      let hold: 'parents' | 'board' | null = null;
      let queue = stale;
      const held: (() => void)[] = [];
      const gate = <T,>(read: 'parents' | 'board', answer: T) => (hold === read ? new Promise<T>(resolve => held.push(() => resolve(answer))) : Promise.resolve(answer));
      await mount(<OperatorApp {...props(busy(), {
        initialRepositories: one, readRepositories: async () => one,
        readBoardParents: () => gate('parents', { state: 'ok', list: PARENTS }),
        readBoard: () => gate('board', { state: 'ok', board: countedBoard({ queue }) } as const),
      })} />);
      await settle();
      expect(rows('[data-office-chip="queue"]').map(chip => chip.textContent)).toEqual([`queue ${stale}`]);
      if (inFlight !== 'none') {
        hold = inFlight;
        await act(async () => rows('button').find(element => element.textContent?.includes('Refresh'))!.click());
        await settle();
        expect(held).toHaveLength(1);
      }
      await visible('hidden');
      const unconfirmed = ['rooms: 1', 'on seat: 0', 'queued for acceptance: 0', 'CI failed: 0', 'waiting for you: 0', 'rooms not read: 1'];
      expect(rows('[data-office-card="loading"]')).toHaveLength(1);
      expect(totals()).toEqual(unconfirmed);
      // The aborted read answers late; its answer does not count.
      await act(async () => { held.splice(0).forEach(finish => finish()); });
      await settle();
      expect(totals()).toEqual(unconfirmed);
      queue = fresh;
      hold = 'parents';
      await visible('visible');
      await settle();
      expect(held).toHaveLength(1);
      expect(rows('[data-office-card="room"]')).toHaveLength(1);
      expect(totals()).toEqual(['rooms: 1', 'on seat: 2', 'queued for acceptance: 0', 'CI failed: 0', 'waiting for you: 0', 'rooms not read: 1']);
      hold = null;
      await act(async () => held.shift()!());
      await settle();
      expect(rows('[data-office-chip="queue"]').map(chip => chip.textContent)).toEqual([`queue ${fresh}`]);
      expect(totals()).toEqual(['rooms: 1', 'on seat: 2', `queued for acceptance: ${fresh}`, 'CI failed: 0', 'waiting for you: 0']);
      await act(async () => root?.unmount());
      root = null;
      window.happyDOM.abort();
    }
  });

  test('the sample leads equal the mockup: an empty seat stays empty, and an occupied seat with an unknown agent stays occupied', () => {
    const repository = fixtureProps(OFFICE_FIXTURE).initialRepositories!.repositories.find(row => row.display_name === 'arch-context')!.repository_id;
    const { room } = officeCard({ kind: 'ready', parents: { kind: 'ready', list: officeParents(repository, NOW) }, seats: officeSeats(repository, NOW), board: null });
    expect([room.orchestrator?.agent, room.advisor]).toEqual([null, null]);
    expect(room.orchestrator).not.toBeNull();
    const lead = (orchestrator: SceneMiniRoom['orchestrator']) => composeMiniRoom({ orchestrator, advisor: null, plan: false, needsYou: false, desks: [], limit: null, queue: 0, cart: 0, idle: false }, { frame: 0, night: false });
    expect(lead(sceneAgent(null))).not.toEqual(lead(null));
  });

  test('a mini room draws the seats and the summary it gets: lit screens, the door, the whiteboard and the grey idle room', () => {
    // The other-agent palette uses none of the three colours under test.
    const agent = sceneAgent('hermes');
    const base: SceneMiniRoom = { orchestrator: agent, advisor: agent, plan: true, needsYou: false, desks: [{ agent, state: 'coding' }], limit: null, queue: 0, cart: 0, idle: false };
    const colors = (room: SceneMiniRoom) => composeMiniRoom(room, { frame: 0, night: false }).map(path => path.color);
    expect(colors(base)).toContain('screen');
    expect(colors({ ...base, desks: [{ agent, state: 'idle' }] })).not.toContain('screen');
    expect(colors(base)).not.toContain('accent');
    expect(colors({ ...base, needsYou: true })).toContain('accent');
    // Each desk state of the mockup has its own desk, the worker limit ropes the empty desks, and the cart fills from the current batch.
    const looks = DESK_STATES.filter(state => state !== 'idle' && state !== 'unknown').map(state => JSON.stringify(composeMiniRoom({ ...base, desks: [{ agent, state }] }, { frame: 1, night: false })));
    expect(new Set([...looks, JSON.stringify(composeMiniRoom({ ...base, desks: [{ agent, state: 'idle' }] }, { frame: 1, night: false }))]).size).toBe(looks.length + 1);
    expect(colors({ ...base, desks: [{ agent, state: 'ci_failed' }] })).toContain('danger');
    expect(colors({ ...base, desks: [{ agent, state: 'no_claim_status' }] })).toContain('warnDk');
    expect(colors(base)).not.toContain('dangerDk');
    expect(colors({ ...base, limit: 8 })).not.toContain('dangerDk');
    expect(colors({ ...base, limit: 2 })).toContain('dangerDk');
    expect(colors(base)).not.toContain('ok');
    expect(colors({ ...base, cart: 3 })).toContain('ok');
    expect(composeMiniRoom({ ...base, cart: 6 }, { frame: 0, night: false })).not.toEqual(composeMiniRoom({ ...base, cart: 5 }, { frame: 0, night: false }));
    const paper = (room: SceneMiniRoom) => composeMiniRoom(room, { frame: 0, night: false }).find(path => path.color === 'paper')!.d;
    expect(paper({ ...base, plan: false })).not.toBe(paper(base));
    expect(colors({ ...base, orchestrator: null, advisor: null, desks: [], idle: true })).not.toContain('wall');
    // More figures than the zone holds still draw inside the 112x72 grid.
    expect(composeMiniRoom({ ...base, queue: 40 }, { frame: 0, night: false })).toEqual(composeMiniRoom({ ...base, queue: 4 }, { frame: 0, night: false }));
  });

  test('the Office is the landing page: an empty fragment and the logo open it; #home stays Home', async () => {
    expect(parseWorkspaceLocation('')).toEqual(DEFAULT_LOCATION);
    expect(parseWorkspaceLocation('#nope')).toEqual(DEFAULT_LOCATION);
    expect(workspaceHash(DEFAULT_LOCATION)).toBe('#board/office');
    expect(parseWorkspaceLocation('#home').workspace).toBe('home');
    installDom('http://127.0.0.1:4318/#home');
    await mount(<OperatorApp {...props(busy(), { readCiRepairs: async () => ({ state: 'ok', issues: [] }) })} />);
    expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe('home');
    await act(async () => document.querySelector<HTMLAnchorElement>('[data-nav-rail] a[href="#board/office"]')!.click());
    await settle();
    expect(document.querySelector('[data-board-office]')?.getAttribute('data-board-office')).toBe('overview');
    await act(async () => root?.unmount());
    root = null;
    window.happyDOM.abort();
    installDom('http://127.0.0.1:4318/');
    await mount(<OperatorApp {...props(busy())} />);
    await settle();
    expect(document.querySelector('[data-board-office]')?.getAttribute('data-board-office')).toBe('overview');
    expect(document.querySelector('.workspace-nav a[data-workspace="home"]')).not.toBeNull();
    expect(document.querySelector('.workspace-nav a[data-workspace="board"]')?.getAttribute('href')).toBe('#board');
  });

  test('the room draws the seats of the parent list and the plan gap from the board; the legend lists each desk state with its source rule', async () => {
    officeAt(`/${HARNESS_ID}/1474`);
    await mount(<OperatorApp {...props(busy())} />);
    await settle();
    const scene = document.querySelector('[data-board-office="room"] [role="img"]')!;
    expect(scene.getAttribute('aria-label')).toBe('Office of Ancienttwo/repo-harness #1474: 2 worker desks, 0 pull requests in the acceptance queue, no plan.');
    expect(document.querySelector('[data-plan]')?.getAttribute('data-plan')).toBe('none');
    expect(document.querySelector('[data-seat-meter]')?.getAttribute('data-seat-meter')).toBe('none');
    expect(rows('[data-desk]').map(desk => [desk.getAttribute('data-desk'), desk.getAttribute('aria-label')])).toEqual([['t1', '#1476 · Codex: Blocked'], ['t2', '#1475 · Claude Code: Done']]);
    expect(rows('[data-queue-pr]')).toHaveLength(0);
    expect(rows('[data-office-hit]').map(hit => hit.getAttribute('data-office-hit')).sort()).toEqual(['board', 'cart', 'door', 'orchestrator', 'tray']);
    expect(rows('[data-board-banner]').map(banner => banner.getAttribute('data-board-banner'))).toEqual(['plan', 'unevaluated']);
    // No advisor seat: no boss button.
    expect(rows('[data-boss]')).toHaveLength(0);

    await act(async () => rows('[data-board-legend]')[0]!.click());
    const legend = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(legend.getAttribute('aria-labelledby')).toBe('board-office-legend');
    expect(Array.from(legend.querySelectorAll('[data-legend-state]')).map(entry => [entry.getAttribute('data-legend-state'), entry.querySelector('strong')?.textContent, entry.querySelector('p')?.textContent])).toEqual([
      ['blocked', 'Blocked', 'The hc terminal of the seat reports blocked.'],
      ['error', 'Error', 'The hc terminal of the seat reports error.'],
      ['ci_failed', 'CI failed', 'The required check of the desk\'s pull request failed.'],
      ['ci_pending', 'Waiting for CI', 'The required check of the desk\'s pull request is running.'],
      ['acceptance_queue', 'In the acceptance queue', 'The pull request is open, its required check passed and it is not accepted.'],
      ['no_claim_status', 'No claim status', 'The issue has no claim status comment.'],
      ['coding', 'Coding', 'The hc terminal of the seat reports working.'],
      ['done', 'Done', 'The hc terminal of the seat reports done.'],
      ['idle', 'Idle', 'No rule above matches.'],
      ['unknown', 'Unknown desk', 'The seat names no issue and no pull request.'],
    ]);
    expect(Array.from(legend.querySelectorAll('[data-legend-state]')).map(entry => entry.getAttribute('data-legend-state'))).toEqual([...DESK_STATES]);
    await key('Escape');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test('an empty room keeps the plan unknown until parent facts establish that no parent is active', async () => {
    officeAt(`/${HARNESS_ID}`);
    let finish!: (read: BoardParentsRead) => void;
    let readParents = () => new Promise<BoardParentsRead>(resolve => { finish = resolve; });
    await mount(<OperatorApp {...props(busy(), {
      readBoardParents: () => readParents(),
      readBoardSeats: async () => ({ state: 'ok', seats: { ...SEATS, seats: [] } }),
    })} />);
    await settle();
    const state = () => document.querySelector('[data-setup-row="plan"]')?.getAttribute('data-setup-state');
    expect(state()).toBe('unknown');
    await act(async () => finish({ state: 'unavailable', reason: 'parents_github_failed' }));
    await settle();
    expect(state()).toBe('unknown');
    expect(document.querySelector('[data-setup-row="plan"]')?.textContent).toContain('parents_github_failed');
    readParents = async () => ({ state: 'ok', list: { ...PARENTS, parents: [] } });
    await act(async () => rows('button').find(element => element.textContent?.includes('Refresh'))!.click());
    await settle();
    expect(state()).toBe('optional');
  });

  test('a repository room shows seats while the parents read is pending', async () => {
    officeAt(`/${HARNESS_ID}`);
    let finish!: (read: BoardParentsRead) => void;
    const boards: number[] = [];
    await mount(<OperatorApp {...props(busy(), {
      readBoardParents: () => new Promise(resolve => { finish = resolve; }),
      readBoard: async subject => { boards.push(subject.parent); return { state: 'ok', board: BOARD }; },
    })} />);
    await settle();
    expect(rows('[data-desk]').map(desk => desk.getAttribute('data-desk'))).toEqual(['t1', 't2']);
    expect(boards).toEqual([]);
    await act(async () => finish({ state: 'ok', list: PARENTS }));
    await settle();
    expect(boards).toEqual([1474]);
    expect(rows('[data-desk]').map(desk => desk.getAttribute('data-desk'))).toEqual(['t1', 't2']);
  });

  test('the room draws its seats from the seats document while the board read is pending, and the board fills in the same room; the list layout waits and a failed read draws no room', async () => {
    const board = boardWith({
      plan: PLAN,
      prs: { 1499: { required_check: { status: 'failure', completed_at: '2026-11-02T21:00:00Z' } } },
      terminals: [seat('t1', 'worker', 1475, null, 'working'), seat('t2', 'worker', 1476, 1499, 'working'), seat('t3', 'orchestrator', null, null, 'idle')],
    });
    const pending: ((read: BoardRead) => void)[] = [];
    const readBoard: BoardReader = () => new Promise(resolve => { pending.push(resolve); });
    for (const path of [`/${HARNESS_ID}/1474`, `/${HARNESS_ID}`]) {
      officeAt(path);
      pending.length = 0;
      await mount(<OperatorApp {...props(busy(), { readBoard, readBoardSeats: async () => ({ state: 'ok', seats: seatsOf(board) }) })} />);
      await settle();
      expect(pending).toHaveLength(1);
      expect(document.querySelector('[data-board-office="room"]')?.getAttribute('data-board-parent')).toBe('1474');
      expect(rows('[data-desk]').map(desk => [desk.getAttribute('data-desk'), desk.getAttribute('aria-label')])).toEqual([['t1', '#1475 · Agent unknown: Coding'], ['t2', '#1476 · Agent unknown: Coding']]);
      expect(document.querySelector('[data-plan]')?.getAttribute('data-plan')).toBe('reading');
      expect(document.querySelector('[data-plan]')?.textContent).toBe('Reading the board');
      expect(document.querySelector('[data-feed-empty]')?.textContent).toBe('Reading the board');
      expect(document.querySelector('[data-board-office="room"] [role="img"]')?.getAttribute('aria-label')).toEndWith(', reading the board.');
      await act(async () => rows('[data-desk="t2"]')[0]!.click());
      await act(async () => pending[0]!({ state: 'ok', board }));
      await settle();
      expect(document.querySelector('[data-plan]')?.getAttribute('data-plan')).toBe('observed');
      expect(rows('[data-desk="t2"]')[0]!.getAttribute('aria-label')).toBe('#1476 · Agent unknown: CI failed');
      expect(rows('[data-desk="t2"]')[0]!.getAttribute('aria-pressed')).toBe('true');
      await act(async () => root?.unmount());
    }

    // A selected parent with no live seat: the pending read wins over the empty-room line.
    officeAt(`/${HARNESS_ID}/1474`);
    await mount(<OperatorApp {...props(busy(), { readBoard, readBoardSeats: async () => ({ state: 'ok', seats: { ...SEATS, seats: [] } }) })} />);
    await settle();
    expect(document.querySelector('[data-feed-empty]')?.textContent).toBe('Reading the board');
    await act(async () => root?.unmount());

    boardAt();
    pending.length = 0;
    await mount(<OperatorApp {...props(busy(), { readBoard })} />);
    await settle();
    expect(document.querySelector('[data-board-office="room"]')).toBeNull();
    expect(document.body.textContent).toContain('Reading the board of #1474 from GitHub and hc.');
    await act(async () => root?.unmount());

    officeAt(`/${HARNESS_ID}/1474`);
    await mount(<OperatorApp {...props(busy(), { readBoard: async () => ({ state: 'unavailable', reason: 'board_collect_failed' }) })} />);
    await settle();
    expect(document.querySelector('[data-board-reason]')?.getAttribute('data-board-reason')).toBe('board_collect_failed');
    expect(document.querySelector('[data-board-office="room"]')).toBeNull();
  });

  test('with an observed plan the header has the plan chip and the seat meter, and each hit fills the side panel', async () => {
    officeAt(`/${HARNESS_ID}/1474`);
    await mount(<OperatorApp {...props(busy(), { readBoard: async () => ({ state: 'ok', board: boardWith({ plan: PLAN }) }) })} />);
    await settle();
    expect(document.querySelector('[data-plan]')?.getAttribute('data-plan')).toBe('observed');
    expect(document.querySelector('[data-plan]')?.textContent).toBe('plan r1');
    expect(document.querySelector('[data-seat-meter]')?.getAttribute('data-seat-meter')).toBe('2/3');
    const panel = (hit: string) => {
      rows(`[data-office-hit="${hit}"]`)[0]!.click();
    };
    for (const [hit, eyebrow, text, command] of [
      ['cart', 'BATCH', 'Batch cart 1/6', 'repo-harness board --parent 1474'],
      ['tray', 'BACKLOG', '#1477Held: waits for #1476', 'repo-harness board --parent 1474'],
      ['door', 'MAIN', 'Next batch#1475', 'gh pr list --base main --state merged --limit 5'],
      ['board', 'ORCHESTRATOR', 'coordinator · integrator', 'repo-harness board --parent 1474'],
      ['board', 'ORCHESTRATOR', 'Planplan r1', 'repo-harness board --parent 1474'],
    ] as const) {
      await act(async () => panel(hit));
      const shown = document.querySelector('[data-office-panel]')!;
      expect(shown.getAttribute('data-office-panel')).toBe(eyebrow);
      expect(shown.textContent).toContain(text);
      expect(shown.querySelector('[data-command] code')?.textContent).toBe(command);
    }
    await act(async () => root?.unmount());

    // A truncated plan comment read has no revision: the chip keeps the age and the panel keeps its word.
    officeAt(`/${HARNESS_ID}/1474`);
    await mount(<OperatorApp {...props(busy(), { readBoard: async () => ({ state: 'ok', board: boardWith({ plan: { ...PLAN, revision: null } as BoardV1['plan'] }) }) })} />);
    await settle();
    expect(document.querySelector('[data-plan]')?.textContent).toStartWith('Plan · ');
    await act(async () => panel('board'));
    expect(document.querySelector('[data-office-panel]')?.textContent).toContain('PlanObserved');
  });

  test('the merge policy gives each door its meaning: the A1 finding draws the mark, and unknown never reads as off', async () => {
    const seen = new Map<string, string>();
    for (const [fixture, waits, state, mode] of [
      ['office', 0, 'The integrator merges', 'on'],
      ['office-door-on', 1, 'Waiting for the integrator', 'on'],
      ['office-door-off', 1, 'Waiting for your merge approval', 'off'],
      ['office-door-unknown', 1, 'Waiting for a merge; the policy was not read', 'unknown'],
    ] as const) {
      officeAt(`/${HARNESS_ID}`);
      await mount(<OperatorApp {...fixtureProps(fixture)} />);
      await settle();
      const door = rows('[data-office-hit="door"]')[0]!;
      expect(door.getAttribute('aria-label')).toBe(`${waits > 0 ? 'Main door: 1 accepted pull requests wait for a merge' : 'Main door: no pull request waits for a merge'}. ${state}`);
      await act(async () => door.click());
      const shown = document.querySelector('[data-office-panel]')!;
      expect(Array.from(shown.querySelectorAll('dl > div')).map(entry => entry.textContent)).toEqual([`State${state}`, `Merge modeacceptance_merge ${mode}`, `Waiting for a merge${waits}`, 'Next batch#1315 #1320 #1311']);
      seen.set(fixture, document.querySelector('[data-board-office="room"] [role="img"]')!.innerHTML);
      await act(async () => root?.unmount());
    }
    expect(new Set(seen.values()).size).toBe(4);

    // The seat branch reaches the panel, and a seat with no branch keeps the dash.
    officeAt(`/${HARNESS_ID}`);
    await mount(<OperatorApp {...fixtureProps(OFFICE_FIXTURE)} />);
    await settle();
    for (const [address, branch] of [['t10', 'feat/1299-dsh-companion'], ['t13', '—']] as const) {
      await act(async () => rows(`[data-desk="${address}"]`)[0]!.click());
      expect(document.querySelector('[data-office-panel]')?.textContent).toContain(`Branch${branch}`);
    }
  });

  test('the blocked, error and done desks have their own art, and the panel shows the hc word and the status message', async () => {
    const agent = sceneAgent('claude-code');
    const colors = (state: DeskState, frame: number) => deskVignette(state, agent, frame).paths.map(path => path.color);
    // The agent sprite holds `warn` too, so the blink compares the whole colour run with the idle desk.
    const warn = (state: DeskState, frame: number) => deskVignette(state, agent, frame).paths.find(path => path.color === 'warn')?.d;
    expect(warn('blocked', 0)).not.toBe(warn('idle', 0));
    expect(warn('blocked', 3)).toBe(warn('idle', 0));
    expect(colors('error', 0)).toContain('danger');
    expect(colors('done', 0)).toContain('ok');
    for (const color of ['danger', 'ok']) expect(colors('idle', 0)).not.toContain(color);
    expect(new Set(DESK_STATES.map(state => JSON.stringify(deskVignette(state, agent, 0).paths))).size).toBe(DESK_STATES.length);

    const list: BoardSeatsV1 = { ...SEATS, seats: [
      { ...seat('t1', 'worker', 9001, null, 'blocked'), status_msg: 'waits for a review', parent: null },
      { ...seat('t2', 'worker', 9002, null, 'error'), status_msg: 'push refused', parent: null },
      { ...seat('t3', 'worker', 9003, null, 'done'), parent: null },
      { ...seat('t4', 'worker', 9004, null, 'thinking'), parent: null },
      { ...seat('t5', 'worker', 9005, null, null), parent: null },
    ] };
    officeAt(`/${HARNESS_ID}`);
    await mount(<OperatorApp {...props(busy(), { readBoardSeats: async () => ({ state: 'ok', seats: list }) })} />);
    await settle();
    expect(rows('[data-desk]').map(desk => desk.getAttribute('aria-label'))).toEqual(['#9001 · Agent unknown: Blocked', '#9002 · Agent unknown: Error', '#9003 · Agent unknown: Done', '#9004 · Agent unknown: Idle', '#9005 · Agent unknown: Idle']);
    for (const [address, source, message] of [
      ['t1', 'blocked', 'waits for a review'], ['t2', 'error', 'push refused'], ['t3', 'done', null], ['t4', 'thinking', null], ['t5', 'unreported', null],
    ] as const) {
      await act(async () => rows(`[data-desk="${address}"]`)[0]!.click());
      const panel = document.querySelector('[data-office-panel]')!.textContent;
      expect(panel).toContain(`Datahc terminal status: ${source}`);
      if (message === null) expect(panel).not.toContain('Message');
      else expect(panel).toContain(`Message${message}`);
    }
  });

  test('every panel of a seat shows its status message: a queued desk, a queue row and the two stage seats', async () => {
    const queued = (worker: string | null, reviewer: string | null, orchestrator: string | null, advisor: string | null) => boardWith({
      prs: { 1491: { acceptance: { status: 'not_accepted' } } },
      terminals: [
        { ...seat('t1', 'worker', 1475, 1491, 'idle'), status_msg: worker }, { ...seat('t2', 'reviewer', null, 1491, 'working'), status_msg: reviewer },
        { ...seat('t3', 'orchestrator', null, null, 'blocked'), status_msg: orchestrator }, { ...seat('t4', 'advisor', null, null, 'idle'), status_msg: advisor },
      ],
    });
    const full = queued('migration limit to confirm', 'round 1 runs', 'waits for the owner', 'plan sent');
    const silent = queued(null, null, null, null);
    const onlyReviewer = queued(null, 'round 1 runs', null, null);
    // The room draws three queue entries; only a longer queue has the zone that lists every pull request.
    const crowded = { ...full, pull_requests: [...full.pull_requests, ...[9001, 9002, 9003].map(number => ({ ...full.pull_requests.find(pr => pr.number === 1491)!, number }))] };
    // Two seats with only an issue label, on different issues that list one queued pull request.
    const sharedPullRequest = boardWith({
      prs: { 1491: { acceptance: { status: 'not_accepted' } } }, items: { 1475: { pull_requests: [1491] }, 1476: { pull_requests: [1491] } },
      terminals: [{ ...seat('t1', 'worker', 1475, null, 'idle'), status_msg: 'first issue' }, { ...seat('t2', 'worker', 1476, null, 'idle'), status_msg: 'second issue' }],
    });
    // A seat on a linked issue that names another pull request keeps its own desk, so its message stays out of this queue entry.
    const otherPullRequest = boardWith({
      prs: { 1491: { acceptance: { status: 'not_accepted' } } },
      terminals: [{ ...seat('t1', 'worker', 1475, 1491, 'idle'), status_msg: 'queued' }, { ...seat('t2', 'worker', 1475, 1494, 'idle'), status_msg: 'elsewhere' }],
    });
    const desk = ['[data-queue-pr="1491"]'], queueRow = ['[data-office-hit="queue"]', '[data-panel-pick="queue:1491"]'];
    for (const [board, clicks, panel, shown, hidden] of [
      [sharedPullRequest, desk, 'WORKER · QUEUE', ['Message t1first issue', 'Message t2second issue'], []],
      [otherPullRequest, desk, 'WORKER · QUEUE', ['Message t1queued'], ['elsewhere']],
      [full, desk, 'WORKER · QUEUE', ['Message t1migration limit to confirm', 'Message t2round 1 runs'], []],
      [crowded, queueRow, 'WORKER · QUEUE', ['Message t1migration limit to confirm', 'Message t2round 1 runs'], []],
      [onlyReviewer, desk, 'WORKER · QUEUE', ['Message t2round 1 runs'], ['Message t1']],
      [silent, desk, 'WORKER · QUEUE', [], ['Message']],
      [full, ['[data-office-hit="orchestrator"]'], 'ORCHESTRATOR', ['Messagewaits for the owner'], []],
      [full, ['[data-office-hit="advisor"]'], 'ADVISOR', ['Messageplan sent'], []],
      [silent, ['[data-office-hit="orchestrator"]'], 'ORCHESTRATOR', [], ['Message']],
    ] as const) {
      officeAt(`/${HARNESS_ID}/1474`);
      await mount(<OperatorApp {...props(busy(), { readBoard: async () => ({ state: 'ok', board }), readBoardSeats: async () => ({ state: 'ok', seats: seatsOf(board) }) })} />);
      await settle();
      for (const click of clicks) await act(async () => rows(click)[0]!.click());
      const view = document.querySelector('[data-office-panel]')!;
      expect(view.getAttribute('data-office-panel')).toBe(panel);
      for (const text of shown) expect(view.textContent).toContain(text);
      for (const text of hidden) expect(view.textContent).not.toContain(text);
      await act(async () => root?.unmount());
    }
  });

  test('a repository room with no selected parent seats every live seat: the active parent gives the plan, an idle repository keeps its furnished desks', async () => {
    const seated: BoardSeatsV1 = {
      ...SEATS, seats: [
        { ...seat('t1', 'orchestrator', null, null, 'working'), agent: 'claude-code', parent: null },
        { ...seat('t2', 'advisor', null, null, 'idle'), agent: 'codex', parent: null },
        { ...seat('t3', 'worker', 9001, null, 'working'), agent: 'codex', parent: null },
        { ...seat('t4', 'worker', 1476, 1499, 'idle'), agent: 'pi', parent: '1474' },
        { address: 't5', name: null, agent: null, state: 'live', status: null, status_kind: null, status_msg: null, status_ms:null, turn: 0, branch: null, seat_status: 'unavailable', reason: 'seat_label_invalid', seat: '', parent: null },
      ],
    };
    const boards: number[] = [];
    officeAt(`/${HARNESS_ID}`);
    await mount(<OperatorApp {...props(busy(), {
      readBoard: async (subject) => { boards.push(subject.parent); return { state: 'ok', board: boardWith({ plan: PLAN }) }; },
      readBoardSeats: async () => ({ state: 'ok', seats: seated }),
    })} />);
    await settle();
    expect(boards).toEqual([joinBoardParents(PARENTS, SEATS).active_parent!]);
    expect(document.querySelector('[data-board-office="room"]')?.getAttribute('data-board-parent')).toBe('1474');
    expect(rows('[data-desk]').map(desk => desk.getAttribute('aria-label'))).toEqual(['#9001 · Codex: Coding', '#1476 · pi: Idle']);
    expect(rows('[data-boss]').map(button => button.getAttribute('data-boss'))).toEqual(['rage', 'carrot', 'mine', 'valve']);
    // The drawer resolves only items of the loaded board; a seat of another parent keeps its detail and command.
    for (const [address, issue, command] of [['t3', null, 'gh issue view 9001 --comments'], ['t4', '1476', 'gh pr checks 1499']] as const) {
      await act(async () => rows(`[data-desk="${address}"]`)[0]!.click());
      expect(document.querySelector('[data-panel-issue]')?.getAttribute('data-panel-issue') ?? null).toBe(issue);
      expect(document.querySelector('[data-office-panel] [data-command] code')?.textContent).toBe(command);
    }
    await act(async () => root?.unmount());

    const idle: BoardSeatsV1 = { ...SEATS, seats: [] };
    boards.length = 0;
    officeAt(`/${HARNESS_ID}`);
    await mount(<OperatorApp {...props(busy(), { readBoardSeats: async () => ({ state: 'ok', seats: idle }) })} />);
    await settle();
    expect(boards).toEqual([]);
    const empty = document.querySelector('[data-board-office="room"]')!;
    expect(empty.hasAttribute('data-board-parent')).toBe(false);
    expect(empty.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('no parent: 0 worker desks');
    expect(rows('.board-office__desk-label').map(label => label.textContent)).toEqual(Array.from({ length: 8 }, (_, index) => `Seat ${index + 1}Free desk`));
    expect(document.querySelector('.board-office__scene[data-night]')).not.toBeNull();
    expect(document.querySelector('[data-feed-empty]')?.textContent).toBe('No seat on duty');
    expect(document.querySelector('[data-office-panel] [data-command] code')?.textContent).toBe('repo-harness board --parent <n>');
    expect(rows('[data-boss]')).toHaveLength(0);
    // No board read the default branch: the door has no command to copy.
    await act(async () => rows('[data-office-hit="door"]')[0]!.click());
    expect(Array.from(document.querySelectorAll('[data-office-panel] dl > div')).slice(0, 2).map(entry => entry.textContent)).toEqual(['State—', 'Merge mode—']);
    expect(document.querySelector('[data-office-panel] [data-command]')).toBeNull();
    expect(document.querySelector('[data-office-panel] [data-command-gap]')?.textContent).toBe('Command unavailable: no board has read the default branch');
  });

  test('occupancy sets only the light: the parent sets the no-parent label and the plan sets the chip and the meter', async () => {
    const noSeat: BoardSeatsV1 = { ...SEATS, seats: [] };
    const loose = { ...noSeat, seats: [{ ...seat('t1', 'worker', 9001, null, 'working'), parent: null }] };
    for (const [path, list, plan, chip, tone, meter, label] of [
      [`/${HARNESS_ID}/1474`, noSeat, PLAN, 'observed', null, 'worker 0/3', false],
      [`/${HARNESS_ID}/1474`, noSeat, undefined, 'No plan', 'gap', 'worker 0 · no plan', false],
      [`/${HARNESS_ID}`, loose, undefined, 'No plan', null, 'worker 1 · no plan', true],
      [`/${HARNESS_ID}`, noSeat, undefined, 'Idle', null, '—', true],
    ] as const) {
      officeAt(path);
      await mount(<OperatorApp {...props(busy(), {
        readBoard: async () => ({ state: 'ok', board: boardWith({ plan }) }),
        readBoardSeats: async () => ({ state: 'ok', seats: list }),
      })} />);
      await settle();
      const shown = document.querySelector('[data-plan]')!;
      expect(chip === 'observed' ? shown.getAttribute('data-plan') : shown.textContent).toBe(chip);
      expect(shown.getAttribute('data-tone')).toBe(tone);
      expect(document.querySelector('.board-office__meter')?.textContent).toBe(meter);
      expect(rows('.board-office__scene-label').some(entry => entry.textContent === 'No parent in progress')).toBe(label);
      await act(async () => root?.unmount());
    }
  });

  test('a queue longer than the scene stays reachable: the zone lists every entry, and a hidden entry opens its panel and its drawer', async () => {
    const queued = BOARD.pull_requests[0]!;
    const board: BoardV1 = {
      ...BOARD, pull_requests: [5001, 5002, 5003, 5004].map(number => ({ ...queued, number, acceptance: { status: 'not_accepted' } })),
      items: BOARD.items.map(item => (item.number === 1478 ? { ...item, pull_requests: [5004] } : item)),
    };
    officeAt(`/${HARNESS_ID}/1474`);
    await mount(<OperatorApp {...props(busy(), { readBoard: async () => ({ state: 'ok', board }) })} />);
    await settle();
    await act(async () => rows('[data-office-hit="queue"]')[0]!.click());
    const shown = document.querySelector('[data-office-panel]')!;
    expect(shown.getAttribute('data-office-panel')).toBe('QUEUE');
    expect(Array.from(shown.querySelectorAll('dt')).map(term => term.textContent)).toEqual(['PR #5001', 'PR #5002', 'PR #5003', 'PR #5004']);
    expect(rows('[data-queue-pr]').map(hit => hit.getAttribute('data-queue-pr'))).toEqual(['5001', '5002', '5003']);
    expect(rows('[data-desk]').map(desk => desk.getAttribute('data-desk'))).not.toContain('5004');
    await act(async () => rows('[data-panel-pick="queue:5004"]')[0]!.click());
    const entry = document.querySelector('[data-office-panel]')!;
    const title = BOARD.items.find(item => item.number === 1478)!.title;
    expect(entry.getAttribute('data-office-panel')).toBe('WORKER · QUEUE');
    expect(entry.querySelector('h2')?.textContent).toBe(`PR #5004 ${title}`);
    expect(entry.querySelector('[data-command] code')?.textContent).toBe('gh pr view 5004');
    await act(async () => rows('[data-panel-issue="1478"]')[0]!.click());
    await settle();
    expect(window.location.hash).toBe(`#board/office/${HARNESS_ID}/1474/1478`);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(title);
  });

  const advisorList = (status: string | null): BoardSeatsV1 => ({ ...SEATS, seats: [...SEATS.seats, { ...seat('t9', 'advisor', null, null, status), parent: null }] });

  test('the boss buttons confirm, send only the command id and take the cooldown, the lock and the refusals from the server answers', async () => {
    const posts: BossCommandPost[] = [];
    const refused = (code: string, retry_after_seconds?: number): BossCommandWrite => ({ state: 'refused', status: 409, ...(retry_after_seconds === undefined ? {} : { retry_after_seconds }), error: { code, message: `server ${code}`, next_action: 'next' } });
    for (const [answer, notice, cooling] of [
      [{ state: 'sent' }, null, 'Stick 30:00'],
      [refused('boss_cooldown', 90), 'boss_cooldown', 'Stick 1:30'],
      [refused('advisor_turn_running'), 'advisor_turn_running', 'Stick'],
      [refused('advisor_turn_unknown'), 'advisor_turn_unknown', 'Stick'],
      [refused('repository_read_only'), 'repository_read_only', 'Stick'],
      [refused('audit_unavailable'), 'audit_unavailable', 'Stick'],
      [{ state: 'unreachable' }, 'unreachable', 'Stick'],
      [{ state: 'unreadable' }, 'unreadable', 'Stick'],
      [{ state: 'reload_required' }, null, 'Stick'],
    ] as const) {
      officeAt(`/${HARNESS_ID}/1474`);
      await mount(<OperatorApp {...props(busy(), {
        readBoardSeats: async () => ({ state: 'ok', seats: advisorList('idle') }),
        writeBossCommand: async (body) => { posts.push(body); return answer; },
      })} />);
      await settle();
      await act(async () => rows('[data-boss="rage"]')[0]!.click());
      const confirm = document.querySelector('[role="alertdialog"]')!;
      expect(confirm.textContent).toContain('【大棒】检查 parent #1474 下的执行席和审查席');
      expect(posts).toHaveLength(0);
      await act(async () => rows('[data-boss-confirm-send]')[0]!.click());
      await settle();
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();
      const { request_id, ...sent } = posts.pop()!;
      expect(request_id).toMatch(/^[0-9a-f-]{36}$/u);
      expect(sent).toEqual({ repository_id: HARNESS_ID, parent: 1474, command: 'rage' });
      expect(document.querySelector('[data-boss-notice]')?.getAttribute('data-boss-notice') ?? null).toBe(notice);
      expect(document.querySelector('[data-write-reload]') !== null).toBe(answer.state === 'reload_required');
      expect(document.querySelector('[data-boss="rage"] span')?.textContent).toMatch(new RegExp(`^${cooling === 'Stick' ? 'Stick$' : cooling.slice(0, -2)}`, 'u'));
      expect(document.querySelector('[data-boss="rage"]')?.getAttribute('aria-disabled')).toBe(String(cooling !== 'Stick'));
      await act(async () => root?.unmount());
    }
  });

  test('a cooldown notice counts its own command, and another parent starts with no timer or notice', async () => {
    officeAt(`/${HARNESS_ID}/1474`);
    await mount(<OperatorApp {...props(busy(), {
      readBoard: async () => ({ state: 'ok', board: BOARD }),
      readBoardSeats: async () => ({ state: 'ok', seats: advisorList('idle') }),
      writeBossCommand: async body => (body.command === 'carrot' ? { state: 'sent' } : { state: 'refused', status: 409, retry_after_seconds: 90, error: { code: 'boss_cooldown', message: '', next_action: '' } }),
    })} />);
    await settle();
    for (const command of ['carrot', 'rage']) {
      await act(async () => rows(`[data-boss="${command}"]`)[0]!.click());
      await act(async () => rows('[data-boss-confirm-send]')[0]!.click());
      await settle();
    }
    expect(document.querySelector('[data-boss="carrot"] span')?.textContent).toMatch(/^Carrot (?:60:0\d|59:\d\d)$/u);
    expect(document.querySelector('[data-boss-notice="boss_cooldown"]')?.textContent).toMatch(/\b1:(?:3[01]|2\d)\b/u);
    const other = PARENTS.parents.find(parent => parent.number !== 1474)!.number;
    await act(async () => { window.location.hash = `#board/office/${HARNESS_ID}/${other}`; window.dispatchEvent(new window.HashChangeEvent('hashchange')); });
    await settle();
    expect(document.querySelector('[data-board-office="room"]')?.getAttribute('data-board-parent')).toBe(String(other));
    expect(rows('[data-boss] span').map(label => label.textContent)).toEqual(['Stick', 'Carrot', 'Sweep', 'Valve']);
    expect(document.querySelector('[data-boss-notice]')).toBeNull();
  });

  test('reduced motion keeps the scene of an accepted command still while the cooldown runs', async () => {
    for (const reduce of [true, false]) {
      officeAt(`/${HARNESS_ID}/1474`);
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: (media: string) => ({ matches: media.includes('reduced-motion') && reduce, media, addEventListener() {}, removeEventListener() {} }) });
      await mount(<OperatorApp {...props(busy(), { readBoardSeats: async () => ({ state: 'ok', seats: advisorList('idle') }), writeBossCommand: async () => ({ state: 'sent' }) })} />);
      await settle();
      await act(async () => rows('[data-boss="rage"]')[0]!.click());
      await act(async () => rows('[data-boss-confirm-send]')[0]!.click());
      await settle();
      const scene = () => document.querySelector('[data-board-office="room"] [role="img"]')!.innerHTML;
      const first = scene();
      await act(async () => { await Bun.sleep(600); });
      expect(scene() === first).toBe(reduce);
      expect(document.querySelector('[data-boss="rage"] span')?.textContent).toMatch(/^Stick (?:30:0\d|29:\d\d)$/u);
      await act(async () => root?.unmount());
    }
  });

  test('the advisor status locks the boss buttons before any send: idle and done are open, working and blocked wait, any other status is unknown', async () => {
    for (const [status, disabled, label] of [
      ['idle', 'false', 'Stick'], ['done', 'false', 'Stick'],
      ['working', 'true', 'Stick · waiting for the advisor'], ['blocked', 'true', 'Stick · waiting for the advisor'],
      [null, 'true', 'Stick · advisor status unknown'], ['thinking', 'true', 'Stick · advisor status unknown'],
    ] as const) {
      const posts: BossCommandPost[] = [];
      officeAt(`/${HARNESS_ID}/1474`);
      await mount(<OperatorApp {...props(busy(), {
        readBoardSeats: async () => ({ state: 'ok', seats: advisorList(status) }),
        writeBossCommand: async (body) => { posts.push(body); return { state: 'sent' }; },
      })} />);
      await settle();
      const button = rows('[data-boss="rage"]')[0]!;
      expect([button.getAttribute('aria-disabled'), button.querySelector('span')?.textContent]).toEqual([disabled, label]);
      await act(async () => button.click());
      expect(document.querySelector('[role="alertdialog"]') !== null).toBe(disabled === 'false');
      expect(posts).toHaveLength(0);
      await act(async () => root?.unmount());
    }
  });

  test('the boss route client decodes the send, reads retry_after_seconds and keeps a typed refusal', async () => {
    const realFetch = globalThis.fetch;
    const body: BossCommandPost = { request_id: 'r1', repository_id: HARNESS_ID, parent: 1474, command: 'mine' };
    const answer = (status: number, value: unknown) => { globalThis.fetch = Object.assign(async () => new Response(JSON.stringify(value), { status }), { preconnect: realFetch.preconnect }); };
    try {
      answer(200, { protocol: 1, kind: 'repo-harness.advisor-seat-send', github_repository_id: 1, parent: 1474, terminal: 't4', started: true, turn: 3 });
      expect(await postBossCommand(body)).toEqual({ state: 'sent' });
      answer(200, { protocol: 1, kind: 'other' });
      expect(await postBossCommand(body)).toEqual({ state: 'unreadable' });
      const error = { code: 'boss_cooldown', message: 'Wait.', next_action: 'Retry.' };
      answer(409, { error, retry_after_seconds: 60 });
      expect(await postBossCommand(body)).toEqual({ state: 'refused', status: 409, error, retry_after_seconds: 60 });
      answer(409, { error: { ...error, code: 'advisor_turn_running' } });
      expect(await postBossCommand(body)).toEqual({ state: 'refused', status: 409, error: { ...error, code: 'advisor_turn_running' } });
      answer(403, { error: { ...error, code: 'write_token_invalid' } });
      expect(await postBossCommand(body)).toEqual({ state: 'reload_required' });
      answer(500, { nope: true });
      expect(await postBossCommand(body)).toEqual({ state: 'unreachable' });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  const readBack = (status: string | null, fields: Partial<{ readonly turn: number; readonly complete: boolean; readonly why: string | null; readonly lines: readonly string[] }> = {}): AdvisorTranscriptRead => ({
    state: 'ok',
    transcript: decodeAdvisorSeatTranscript({ protocol: 1, kind: 'repo-harness.advisor-seat-transcript', github_repository_id: 1, parent: 1474, terminal: 't9', status, status_kind: null, turn: 4, complete: true, why: null, lines: ['first', 'ghp_[REDACTED]'], ...fields }),
  });
  const delivered = (turn: number): AdvisorMessageWrite => ({ state: 'ok', value: decodeAdvisorSeatSend({ protocol: 1, kind: 'repo-harness.advisor-seat-send', github_repository_id: 1, parent: 1474, terminal: 't9', started: true, turn }) });
  const advisorRoom = async (overrides: Partial<OperatorAppProps>, list: BoardSeatsV1 = advisorList('idle')) => {
    officeAt(`/${HARNESS_ID}/1474`);
    await mount(<OperatorApp {...props(busy(), { readBoardSeats: async () => ({ state: 'ok', seats: list }), ...overrides })} />);
    await settle();
  };
  const openAdvisor = async () => {
    await act(async () => rows('[data-office-hit="advisor"]')[0]!.click());
    await settle();
  };
  const draftAdvisor = (text: string) => act(async () => {
    const field = document.querySelector<HTMLTextAreaElement>('[data-advisor-text]')!;
    // As in the parent filter test: react-dom watches a text field through focus and keyup here.
    field.focus();
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(field, text);
    field.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'a', bubbles: true }) as unknown as Event);
  });
  const sendAdvisor = async () => {
    await act(async () => rows('[data-advisor-send]')[0]!.click());
    await settle();
  };
  const dialogText = () => document.querySelector('[data-advisor-dialog]')?.textContent ?? null;
  const readBackText = () => document.querySelector('[data-advisor-readback]')?.textContent ?? null;

  test('the advisor seat opens the dialog with the read-back and sends each message once with a new request_id, then reads again', async () => {
    const reads: string[] = [];
    const posts: AdvisorMessagePost[] = [];
    await advisorRoom({
      readAdvisorTranscript: async (subject) => { reads.push(`${subject.repository_id}:${subject.parent}`); return readBack('idle', { turn: 3 + posts.length, lines: ['first', ...posts.flatMap(post => post.text.split('\n'))] }); },
      writeAdvisorMessage: async (body) => { posts.push(body); return delivered(3 + posts.length); },
    });
    expect(reads).toEqual([]);
    await openAdvisor();
    expect(reads).toEqual([`${HARNESS_ID}:1474`]);
    expect(document.querySelector('[data-advisor-dialog]')?.getAttribute('role')).toBe('dialog');
    expect(readBackText()).toBe('first');
    expect(document.querySelector('[data-advisor-seat]')?.textContent).toBe('hc t9 · Agent unknown · idle · turn 3');

    await sendAdvisor();
    expect(posts).toHaveLength(0);
    await draftAdvisor('  re-check the order\nof #1316  ');
    await sendAdvisor();
    await draftAdvisor('second');
    await sendAdvisor();
    expect(posts.map(({ repository_id, parent, text }) => ({ repository_id, parent, text }))).toEqual([
      { repository_id: HARNESS_ID, parent: 1474, text: 're-check the order\nof #1316' },
      { repository_id: HARNESS_ID, parent: 1474, text: 'second' },
    ]);
    expect(posts[0]!.request_id).not.toBe(posts[1]!.request_id);
    expect(reads).toHaveLength(3);
    expect(readBackText()).toBe('first\nre-check the order\nof #1316\nsecond');
    expect(document.querySelector('[data-advisor-sent]')?.textContent).toBe('Sent to t9 · turn 5');
    expect(document.querySelector<HTMLTextAreaElement>('[data-advisor-text]')?.value).toBe('');
  });

  test('each send refusal shows its own notice, keeps the text and never retries; an unconfirmed send asks for a read, not a resend', async () => {
    const refused = (code: string): AdvisorMessageWrite => ({ state: 'refused', status: 409, error: { code, message: `server ${code}.`, next_action: 'Server next.' } });
    const notSent = 'Nothing was sent.';
    const reread = 'before you send again';
    const text = 'The server refused the text: use at most 4000 characters';
    for (const [answer, notice, says, avoids] of [
      [refused('text_invalid'), 'text_invalid', text, reread],
      [refused('invalid_body'), 'invalid_body', text, reread],
      [refused('body_too_large'), 'body_too_large', text, reread],
      [refused('repository_read_only'), 'repository_read_only', 'read-only in the registry', reread],
      [refused('repository_not_found'), 'repository_not_found', 'No registered repository', reread],
      [refused('registry_unavailable'), 'registry_unavailable', 'registry could not be read', reread],
      [refused('github_unavailable'), 'github_unavailable', 'GitHub did not return', reread],
      [refused('hc_unavailable'), 'hc_unavailable', 'hc did not list', reread],
      [refused('advisor_seat_absent'), 'advisor_seat_absent', 'No live advisor seat', reread],
      [refused('advisor_seat_ambiguous'), 'advisor_seat_ambiguous', 'More than one live', reread],
      [refused('advisor_busy'), 'advisor_busy', 'Too many board reads', reread],
      [refused('audit_unavailable'), 'audit_unavailable', 'server audit_unavailable. Server next.', reread],
      [refused('reconcile_required'), 'reconcile_required', reread, notSent],
      [{ state: 'unreachable' }, 'unreachable', reread, notSent],
      [{ state: 'unreadable' }, 'unreadable', reread, notSent],
    ] as const) {
      const posts: AdvisorMessagePost[] = [];
      let reads = 0;
      await advisorRoom({
        readAdvisorTranscript: async () => { reads += 1; return readBack('idle'); },
        writeAdvisorMessage: async (body) => { posts.push(body); return answer; },
      });
      await openAdvisor();
      await draftAdvisor('hello');
      await sendAdvisor();
      const shown = document.querySelector(`[data-advisor-notice="${notice}"]`);
      expect(shown?.textContent).toContain(says);
      expect(shown?.textContent).not.toContain(avoids);
      if (avoids === reread) expect(shown?.textContent).toContain(notSent);
      expect([posts.length, reads, document.querySelector<HTMLTextAreaElement>('[data-advisor-text]')?.value]).toEqual([1, 2, 'hello']);
      expect(document.querySelector('[data-advisor-sent]')).toBeNull();
      await act(async () => root?.unmount());
    }

    await advisorRoom({ readAdvisorTranscript: async () => readBack('idle'), writeAdvisorMessage: async () => ({ state: 'reload_required' }) });
    await openAdvisor();
    await draftAdvisor('hello');
    await sendAdvisor();
    expect(document.querySelector('[data-advisor-dialog] [data-write-reload]')).not.toBeNull();
    expect(document.querySelector('[data-advisor-notice]')).toBeNull();
  });

  test('the read-back shows the decoder output as it is: a read failure names itself, and no text is added or removed', async () => {
    const refusedRead = (code: string): AdvisorTranscriptRead => ({ state: 'refused', error: { code, message: `server ${code}.`, next_action: 'Server next.' } });
    for (const [read, failure, says] of [
      [refusedRead('advisor_seat_absent'), 'advisor_seat_absent', 'No live advisor seat'],
      [refusedRead('advisor_read_failed'), 'advisor_read_failed', 'hc did not read'],
      [refusedRead('advisor_timeout'), 'advisor_timeout', 'did not finish in time'],
      [refusedRead('advisor_unavailable'), 'advisor_unavailable', 'did not return a result'],
      [refusedRead('advisor_invalid'), 'advisor_invalid', 'failed validation'],
      [refusedRead('invalid_request'), 'invalid_request', 'server invalid_request. Server next.'],
      [{ state: 'unreachable' }, 'unreachable', 'was not read'],
      [{ state: 'unreadable' }, 'unreadable', 'does not show it'],
    ] as const) {
      await advisorRoom({ readAdvisorTranscript: async () => read });
      await openAdvisor();
      expect(document.querySelector(`[data-advisor-read-failure="${failure}"]`)?.textContent).toContain(says);
      expect(document.querySelector('[data-advisor-turn]')).toBeNull();
      expect(document.querySelector('[data-advisor-seat]')?.textContent).toBe('Agent unknown');
      await act(async () => root?.unmount());
    }

    await advisorRoom({ readAdvisorTranscript: async () => readBack('idle', { complete: false, why: 'trimmed by hc', lines: ['ghp_[REDACTED]', ADVISOR_TRANSCRIPT_LINE_WITHHELD] }) });
    await openAdvisor();
    expect(readBackText()).toBe(`ghp_[REDACTED]\n${ADVISOR_TRANSCRIPT_LINE_WITHHELD}`);
    expect(document.querySelector('[data-advisor-incomplete]')?.textContent).toBe('hc says that part of this text may be missing. trimmed by hc');
    await act(async () => root?.unmount());

    await advisorRoom({ readAdvisorTranscript: async () => readBack('idle', { lines: [] }) });
    await openAdvisor();
    expect(document.querySelector('[data-advisor-empty]')).not.toBeNull();
    expect(readBackText()).toBeNull();
  });

  test('the dialog shows the turn from the status word and a busy turn does not lock the send', async () => {
    for (const [status, turn, chip, word] of [
      ['idle', 'over', 'Turn over', 'idle'], ['done', 'over', 'Turn over', 'done'],
      ['working', 'running', 'Running a turn', 'working'], ['blocked', 'running', 'Running a turn', 'blocked'],
      [null, 'unknown', 'Status unknown', '—'], ['thinking', 'unknown', 'Status unknown', 'thinking'],
    ] as const) {
      const posts: AdvisorMessagePost[] = [];
      await advisorRoom({ readAdvisorTranscript: async () => readBack(status), writeAdvisorMessage: async (body) => { posts.push(body); return delivered(5); } });
      await openAdvisor();
      const shown = document.querySelector(`[data-advisor-turn="${turn}"]`);
      expect(shown?.textContent).toBe(chip);
      expect(document.querySelector('[data-advisor-seat]')?.textContent).toBe(`hc t9 · Agent unknown · ${word} · turn 4`);
      await draftAdvisor('hello');
      expect(rows('[data-advisor-send]')[0]!.getAttribute('aria-disabled')).toBe('false');
      await sendAdvisor();
      expect(posts).toHaveLength(1);
      await act(async () => root?.unmount());
    }
  });

  test('the dialog needs an advisor and a parent, the white board does not open it, and a close waits for the answer of a send', async () => {
    const noParent = { ...advisorList('idle'), parents: [] };
    officeAt(`/${HARNESS_ID}`);
    await mount(<OperatorApp {...props(busy(), { readBoardParents: async () => ({ state: 'ok', list: { ...PARENTS, parents: [] } }), readBoardSeats: async () => ({ state: 'ok', seats: noParent }) })} />);
    await settle();
    await openAdvisor();
    expect(document.querySelector('[data-office-panel]')?.getAttribute('data-office-panel')).toBe('ADVISOR');
    expect([document.querySelector('[data-advisor-dialog]'), document.querySelector('[data-advisor-chat]')]).toEqual([null, null]);
    await act(async () => root?.unmount());

    let answer: (value: AdvisorMessageWrite) => void = () => {};
    await advisorRoom({
      readAdvisorTranscript: async () => readBack('idle'),
      writeAdvisorMessage: () => new Promise((resolve) => { answer = resolve; }),
      initialLocale: 'zh',
    });
    await act(async () => rows('[data-office-hit="board"]')[0]!.click());
    expect(document.querySelector('[data-advisor-dialog]')).toBeNull();
    await act(async () => rows('[data-advisor-chat]')[0]!.click());
    await settle();
    expect(dialogText()).toContain('这一轮已结束');
    await draftAdvisor('hello');
    await sendAdvisor();
    expect(rows('[data-advisor-send]')[0]!.textContent).toBe('发送中');
    await key('Escape');
    await act(async () => rows('[data-advisor-close]')[0]!.click());
    expect(document.querySelector('[data-advisor-dialog]')).not.toBeNull();
    await act(async () => answer({ state: 'refused', status: 409, error: { code: 'reconcile_required', message: 'm.', next_action: 'n.' } }));
    await settle();
    expect(document.querySelector('[data-advisor-notice="reconcile_required"]')?.textContent).toBe('发送没有得到确认，消息可能已经到达顾问席。再次发送前先读上面的回读。');
    await key('Escape');
    expect(document.querySelector('[data-advisor-dialog]')).toBeNull();
  });

  test('a pending send or read shows no old read-back or status, and the text box stays read-only during the send', async () => {
    const refusedWith = (code: string): AdvisorMessageWrite => ({ state: 'refused', status: 409, error: { code, message: 'm.', next_action: 'n.' } });
    const failedRead: AdvisorTranscriptRead = { state: 'refused', error: { code: 'advisor_timeout', message: 'm.', next_action: 'n.' } };
    const fresh = readBack('working', { turn: 5, lines: ['new'] });
    const pending = (waiting: string) => {
      expect([document.querySelector('[data-advisor-loading]')?.textContent, readBackText(), document.querySelector('[data-advisor-turn]'), document.querySelector('[data-advisor-seat]')?.textContent])
        .toEqual([waiting, null, null, 'Agent unknown']);
    };
    const field = () => document.querySelector<HTMLTextAreaElement>('[data-advisor-text]')!;
    for (const [answer, second, notice, text] of [
      [delivered(5), fresh, null, ''],
      [refusedWith('advisor_seat_absent'), fresh, 'advisor_seat_absent', 'hello'],
      [refusedWith('reconcile_required'), fresh, 'reconcile_required', 'hello'],
      [{ state: 'unreachable' }, fresh, 'unreachable', 'hello'],
      [{ state: 'unreadable' }, fresh, 'unreadable', 'hello'],
      [delivered(5), failedRead, null, ''],
      [refusedWith('reconcile_required'), failedRead, 'reconcile_required', 'hello'],
    ] as const) {
      const reads: ((value: AdvisorTranscriptRead) => void)[] = [];
      let answerSend: (value: AdvisorMessageWrite) => void = () => {};
      await advisorRoom({
        readAdvisorTranscript: () => new Promise((resolve) => { reads.push(resolve); }),
        writeAdvisorMessage: () => new Promise((resolve) => { answerSend = resolve; }),
      });
      await openAdvisor();
      pending('Reading the advisor terminal');
      await act(async () => reads[0]!(readBack('idle', { lines: ['old'] })));
      await settle();
      expect(readBackText()).toBe('old');
      await draftAdvisor('hello');
      await sendAdvisor();
      pending('Sending');
      expect([field().readOnly, reads.length]).toEqual([true, 1]);
      await act(async () => answerSend(answer));
      await settle();
      pending('Reading the advisor terminal');
      expect([field().readOnly, field().value, reads.length, document.querySelector('[data-advisor-notice]')?.getAttribute('data-advisor-notice') ?? null]).toEqual([false, text, 2, notice]);
      expect(rows('[data-advisor-send]')[0]!.getAttribute('aria-disabled')).toBe('true');
      await act(async () => reads[1]!(second));
      await settle();
      expect(document.querySelector('[data-advisor-loading]')).toBeNull();
      if (second === fresh) {
        expect([readBackText(), document.querySelector('[data-advisor-turn]')?.textContent]).toEqual(['new', 'Running a turn']);
      } else {
        expect([readBackText(), document.querySelector('[data-advisor-turn]'), document.querySelector('[data-advisor-seat]')?.textContent]).toEqual([null, null, 'Agent unknown']);
        expect(document.querySelector('[data-advisor-read-failure="advisor_timeout"]')).not.toBeNull();
      }
      await act(async () => root?.unmount());
    }

    const reads: { readonly resolve: (value: AdvisorTranscriptRead) => void; readonly signal: AbortSignal }[] = [];
    await advisorRoom({ readAdvisorTranscript: (_subject, signal) => new Promise((resolve) => { reads.push({ resolve, signal }); }) });
    await openAdvisor();
    await act(async () => rows('[data-advisor-close]')[0]!.click());
    expect([document.querySelector('[data-advisor-dialog]'), reads[0]!.signal.aborted]).toEqual([null, true]);
    await openAdvisor();
    await act(async () => reads[0]!.resolve(readBack('idle', { lines: ['old'] })));
    await settle();
    pending('Reading the advisor terminal');
    await act(async () => reads[1]!.resolve(fresh));
    await settle();
    expect(readBackText()).toBe('new');
  });

  test('the advisor route clients name the subject, decode the answer and keep a typed refusal', async () => {
    const realFetch = globalThis.fetch;
    const calls: { readonly url: string; readonly method: string | undefined }[] = [];
    const answer = (status: number, value: unknown) => {
      globalThis.fetch = Object.assign(async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), method: init?.method }); return new Response(JSON.stringify(value), { status }); }, { preconnect: realFetch.preconnect });
    };
    const subject = { repository_id: HARNESS_ID, parent: 1474 };
    const read = () => fetchAdvisorTranscript(subject, new AbortController().signal);
    const error = { code: 'advisor_seat_absent', message: 'Absent.', next_action: 'Start it.' };
    try {
      const body = { protocol: 1, kind: 'repo-harness.advisor-seat-transcript', github_repository_id: 1, parent: 1474, terminal: 't9', status: 'idle', status_kind: null, turn: 4, complete: true, why: null, lines: [] };
      answer(200, body);
      expect(await read()).toEqual({ state: 'ok', transcript: decodeAdvisorSeatTranscript(body) });
      expect(calls.at(-1)).toEqual({ url: `/api/v1/seats/advisor/transcript?repository_id=${HARNESS_ID}&parent=1474`, method: undefined });
      answer(200, { ...body, kind: 'other' });
      expect(await read()).toEqual({ state: 'unreadable' });
      answer(409, { error });
      expect(await read()).toEqual({ state: 'refused', error });
      answer(500, { nope: true });
      expect(await read()).toEqual({ state: 'unreachable' });
      globalThis.fetch = Object.assign(async () => { throw new TypeError('down'); }, { preconnect: realFetch.preconnect });
      expect(await read()).toEqual({ state: 'unreachable' });

      answer(200, { protocol: 1, kind: 'repo-harness.advisor-seat-send', github_repository_id: 1, parent: 1474, terminal: 't9', started: true, turn: 5 });
      expect(await postAdvisorMessage({ ...subject, request_id: 'r1', text: 'hello' })).toEqual(delivered(5));
      expect(calls.at(-1)).toEqual({ url: '/api/v1/seats/advisor/messages', method: 'POST' });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('排雷 marks only the desks that an R2 or R3 finding names', () => {
    const attention = evaluateBoardAttention(BOARD);
    const board = boardWith({ terminals: [seat('t1', 'worker', 1476, 1499, 'working'), seat('t2', 'worker', 1475, 1491, 'working'), seat('t3', 'worker', 1477, null, 'working')] });
    const finding = (rule: 'R2' | 'R3' | 'R1', pull_requests: readonly number[]) => ({ rule, route: 'advisor', issues: [], pull_requests, terminals: [], message: '' }) as const;
    const marks = officeRoom(seatsOf(board), { board, attention: { ...attention, findings: [finding('R1', [1491]), finding('R2', [1499]), finding('R3', [1491])] } }).mines;
    expect([...marks]).toEqual([['t1', 'R2'], ['t2', 'R3']]);
  });
});

describe('office setup checklist (#1788)', () => {
  const rows = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));
  const t: OperatorTranslate = (key, params) => translate('en', key, params);
  const THIS = 'repo_1a1a1a1a1a1a1a1a';
  const OTHER = 'repo_2b2b2b2b2b2b2b2b';
  const OVERVIEW: OfficeSetupScope = { kind: 'overview', rooms: [] };
  const EMPTY: BoardParentsV1 = { ...PARENTS, parents: [] };
  const inRoom = (scope: Partial<Extract<OfficeSetupScope, { kind: 'room' }>> = {}): OfficeSetupScope => ({ kind: 'room', repositoryId: THIS, parent: null, parents: { kind: 'ready', list: EMPTY }, seats: { kind: 'ready', seats: { ...SEATS, seats: [] } }, plan: 'no_parent', ...scope });
  const bots = (snapshot: BotAccessSnapshotV1): OfficeSetupReads['botAccess'] => ({ kind: 'ready', snapshot, refreshFailed: false });
  const READY = decodeBotAccessSnapshot(busyBotAccess(NOW));
  const github = (status: string, reason: string | null, name: string | null = null, id = THIS) =>
    ({ repository_id: id, display_name: id, github: name, default_branch: null, sources: [{ kind: 'github', status, reason, observed_at: null }] });
  const activity = (...repositories: readonly ReturnType<typeof github>[]): OfficeSetupReads['devActivity'] =>
    ({ kind: 'ready', refreshFailed: false, snapshot: decodeDevActivitySnapshot({ ...busy(), repositories, items: [], attention: [] }) });
  const registered = (...ids: readonly string[]): OfficeSetupReads['repositories'] =>
    ({ kind: 'ready', refreshFailed: false, list: decodeOperatorRepositories({ protocol: 1, kind: 'operator_repositories', stale_registrations: 0, repositories: ids.map(id => ({ repository_id: id, display_name: id, access_mode: 'read_write' })) }) });
  const reads = (overrides: Partial<OfficeSetupReads> = {}): OfficeSetupReads => ({ repositories: registered(THIS), devActivity: activity(github('ok', null, 'Ancienttwo/this')), botAccess: bots(READY), ...overrides });
  const row = (id: OfficeSetupRowId, input: OfficeSetupReads, scope: OfficeSetupScope = inRoom()) => officeSetupRows(input, scope, t).find(entry => entry.id === id)!;
  const stateAndCommands = (id: OfficeSetupRowId, input: OfficeSetupReads, scope?: OfficeSetupScope): readonly [string, readonly string[]] => { const { state, commands } = row(id, input, scope); return [state, commands]; };

  test('row 1 reads the bot-access hc section, and each state has the repair command of its source', () => {
    const hc = (section: BotAccessSnapshotV1['hc']) => reads({ botAccess: bots({ ...READY, hc: section }) });
    const cases: readonly (readonly [OfficeSetupReads, string, readonly string[]])[] = [
      [reads({ botAccess: { kind: 'loading' } }), 'unknown', ['hc server status']],
      [reads({ botAccess: { kind: 'unavailable', reason: 'bot_access_pending' } }), 'unknown', ['hc server status']],
      [reads({ botAccess: { kind: 'unavailable', reason: 'unreachable' } }), 'unknown', ['hc server status']],
      [hc({ state: 'unavailable', reason: 'hc_missing' }), 'missing', ['repo-harness update']],
      [hc({ state: 'unavailable', reason: 'hc_unreachable' }), 'failed', [hcRepairCommands(HC_MIN_VERSION)[1]]],
      [reads({ botAccess: bots(decodeBotAccessSnapshot(degradedBotAccess(NOW))) }), 'failed', [...hcRepairCommands(HC_MIN_VERSION)]],
      [hc({ ...READY.hc, terminals: { state: 'unavailable', reason: 'hc_terminals_failed' } } as BotAccessSnapshotV1['hc']), 'failed', ['hc server status']],
      [reads(), 'ok', ['hc server status']],
    ];
    for (const [input, state, commands] of cases) expect(stateAndCommands('hc', input)).toEqual([state, commands]);
  });

  test('row 2 reads the GitHub source: a failed gh read makes no claim about the login', () => {
    const cases: readonly (readonly [OfficeSetupReads['devActivity'], OfficeSetupScope, string])[] = [
      [{ kind: 'loading' }, OVERVIEW, 'unknown'],
      [activity(github('ok', null, 'o/r')), OVERVIEW, 'ok'],
      [activity(github('unavailable', 'github_truncated_merged', 'o/r')), OVERVIEW, 'ok'],
      [activity(github('unavailable', 'gh_failed'), github('ok', null, 'o/r', OTHER)), OVERVIEW, 'ok'],
      [activity(github('unavailable', 'gh_failed'), github('ok', null, 'o/r', OTHER)), inRoom(), 'failed'],
      [activity(github('unavailable', 'gh_not_installed')), OVERVIEW, 'missing'],
      [activity(github('unavailable', 'gh_timeout')), OVERVIEW, 'failed'],
      [{ kind: 'unreachable' }, OVERVIEW, 'unknown'],
      [activity(github('not_configured', 'no_github_remote')), OVERVIEW, 'unknown'],
      [activity(github('unavailable', 'git_remote_failed')), OVERVIEW, 'unknown'],
      [activity(github('not_configured', 'no_github_remote'), github('unavailable', 'git_remote_failed', null, OTHER)), OVERVIEW, 'unknown'],
    ];
    for (const [devActivity, scope, state] of cases) expect(stateAndCommands('gh', reads({ devActivity }), scope)).toEqual([state, ['gh auth status']]);
    const noRemote = 'No repository here has a GitHub remote';
    expect(row('gh', reads({ devActivity: activity(github('not_configured', 'no_github_remote')) }), OVERVIEW).detail).toContain(noRemote);
    const mixed = row('gh', reads({ devActivity: activity(github('not_configured', 'no_github_remote'), github('unavailable', 'git_remote_failed', null, OTHER)) }), OVERVIEW).detail;
    expect(mixed).not.toContain(noRemote);
    expect(mixed).toContain('git_remote_failed');
    expect(row('gh', reads({ devActivity: activity(github('unavailable', 'git_remote_failed')) }), OVERVIEW).detail).toContain('git_remote_failed');
    expect(row('gh', reads({ devActivity: { kind: 'unreachable' } }), OVERVIEW).detail).toBe(t('board.reason.unreachable'));
    const failed = row('gh', reads({ devActivity: activity(github('unavailable', 'gh_failed')) })).detail;
    expect(failed).toContain('gh_failed');
    expect(failed.toLowerCase()).not.toContain('log');
  });

  test('row 3 joins the registry with the GitHub source: only `not_configured` means no remote', () => {
    const ID = 'gh api repos/{owner}/{repo} --jq .id';
    const REMOTE = 'git remote add origin <url>';
    const INIT = 'repo-harness init';
    const SERVE = 'repo-harness operator serve';
    const noRemote = github('not_configured', 'no_github_remote');
    const cases: readonly (readonly [Partial<OfficeSetupReads>, OfficeSetupScope, string, string])[] = [
      [{ repositories: { kind: 'loading' } }, OVERVIEW, 'unknown', SERVE],
      [{ repositories: { kind: 'failed' } }, OVERVIEW, 'unknown', SERVE],
      [{ repositories: { kind: 'failed' } }, inRoom(), 'unknown', SERVE],
      [{ repositories: registered() }, OVERVIEW, 'missing', INIT],
      [{}, OVERVIEW, 'ok', ID],
      [{}, inRoom(), 'ok', ID],
      [{ repositories: registered(OTHER) }, inRoom(), 'missing', INIT],
      [{ devActivity: activity(noRemote) }, inRoom(), 'missing', REMOTE],
      [{ devActivity: activity(noRemote) }, OVERVIEW, 'missing', REMOTE],
      [{ devActivity: activity(github('unavailable', 'gh_failed')) }, inRoom(), 'unknown', ID],
      [{ devActivity: activity(github('unavailable', 'gh_failed')) }, OVERVIEW, 'unknown', ID],
      [{ devActivity: { kind: 'unreachable' } }, inRoom(), 'unknown', ID],
      [{ repositories: registered(THIS, OTHER), devActivity: activity(github('ok', null, 'o/r'), { ...noRemote, repository_id: OTHER }) }, OVERVIEW, 'partial', ID],
    ];
    for (const [input, scope, state, command] of cases) expect(stateAndCommands('repository', reads(input), scope)).toEqual([state, [command]]);
    const two = registered(THIS, OTHER);
    const details: readonly (readonly [Partial<OfficeSetupReads>, OfficeSetupScope, string])[] = [
      [{ repositories: two, devActivity: activity(github('unavailable', 'gh_failed'), { ...github('unavailable', 'gh_failed'), repository_id: OTHER }) }, OVERVIEW, 'Confirmed: 0 with a GitHub remote, 0 with none. Not known: 2 (gh_failed).'],
      [{ repositories: two, devActivity: activity(github('ok', null, 'o/r'), { ...github('unavailable', 'git_remote_failed'), repository_id: OTHER }) }, OVERVIEW, 'Confirmed: 1 with a GitHub remote, 0 with none. Not known: 1 (git_remote_failed).'],
      [{ repositories: two, devActivity: { kind: 'loading' } }, OVERVIEW, 'Confirmed: 0 with a GitHub remote, 0 with none. Not known: 2 (no read yet).'],
      [{ repositories: two, devActivity: { kind: 'unreachable' } }, OVERVIEW, 'Confirmed: 0 with a GitHub remote, 0 with none. Not known: 2 (unreachable).'],
      [{ devActivity: activity(github('unavailable', 'gh_failed')) }, inRoom(), 'Registered. The GitHub remote is not known (gh_failed).'],
    ];
    for (const [input, scope, detail] of details) expect(row('repository', reads(input), scope).detail).toBe(detail);
  });

  test('rows 4 and 5 use the reads of the page, with the seat commands of the issue and the label keys of RH_LABEL', () => {
    const SEAT_COMMANDS = ['repo-harness seats argv <seat> --repository-id <id>', `hc label <t> ${RH_LABEL.repository}=<id> ${RH_LABEL.seat}=<seat>`];
    const failedRoom = (reason: BoardParentsReason) => ({ view: { kind: 'failed', reason }, card: null }) as const;
    const loadingRoom = { view: { kind: 'loading' }, card: null } as const;
    const readyRoom = (list: BoardParentsV1, board: BoardRead | null = null, seats: BoardSeatsV1 = list === EMPTY ? { ...SEATS, seats: [] } : SEATS) => {
      const view = { kind: 'ready', parents: { kind: 'ready', list }, seats, board } as const;
      return { view, card: officeCard(view) };
    };
    const overview = (...rooms: Extract<OfficeSetupScope, { kind: 'overview' }>['rooms']): OfficeSetupScope => ({ kind: 'overview', rooms });
    const invalidLabel: BoardSeatsV1 = { ...SEATS, seats: [{ address: 't9', name: null, agent: null, state: 'live', status: null, status_kind: null, status_msg: null, status_ms:null, turn: 0, branch: null, seat_status: 'unavailable', reason: 'seat_label_invalid', seat: '', parent: null }] };
    const seatCases: readonly (readonly [OfficeSetupScope, string, string])[] = [
      [inRoom(), 'missing', 'No live terminal has a seat label.'],
      [inRoom({ seats: { kind: 'ready', seats: invalidLabel } }), 'failed', 'Terminal t9 has an invalid seat label.'],
      [inRoom({ seats: { kind: 'failed', reason: 'parents_hc_failed' } }), 'failed', t('board.reason.parents_hc_failed')],
      [inRoom({ seats: { kind: 'failed', reason: 'parents_github_failed' } }), 'unknown', t('board.reason.parents_github_failed')],
      [overview(), 'unknown', 'No repository was read, so no seat read ran.'],
      [overview(readyRoom(EMPTY)), 'missing', 'No live terminal has a seat label.'],
      [overview(readyRoom(EMPTY, null, invalidLabel)), 'failed', 'Terminal t9 has an invalid seat label.'],
      [overview(failedRoom('parents_hc_failed')), 'failed', t('board.reason.parents_hc_failed')],
      [overview(failedRoom('parents_invalid'), readyRoom(EMPTY)), 'unknown', t('board.reason.parents_invalid')],
      [overview(loadingRoom), 'unknown', 'The first read has not finished.'],
      [overview(readyRoom(PARENTS), readyRoom(EMPTY)), 'ok', '1 of 2 rooms have a live seat.'],
      [overview(readyRoom(PARENTS), failedRoom('parents_invalid')), 'ok', 'Rooms with a live seat: 1. Not known: 1 (parents_invalid).'],
      [overview(readyRoom(PARENTS), loadingRoom), 'ok', 'Rooms with a live seat: 1. Not known: 1 (no read yet).'],
    ];
    for (const [scope, state, detail] of seatCases) {
      expect(stateAndCommands('seats', reads(), scope)).toEqual([state, SEAT_COMMANDS]);
      expect(row('seats', reads(), scope).detail).toBe(detail);
    }
    const write = 'gh issue comment 7 --body-file <plan-file>';
    const read = 'repo-harness board --parent 7';
    const samplePlan = officeBoard(NOW).plan;
    const unavailable = { status: 'unavailable', comment_url: 'https://github.com/o/r/issues/7#issuecomment-1', reason: 'plan_invalid' } as const;
    const planCases: readonly (readonly [Parameters<typeof inRoom>[0], string, string])[] = [
      [{ parent: 7, plan: samplePlan }, 'ok', read],
      [{ parent: 7, plan: { status: 'absent', truncated: false } }, 'optional', write],
      [{ parent: 7, plan: { status: 'absent', truncated: true } }, 'unknown', read],
      [{ parent: 7, plan: unavailable }, 'unknown', read],
      [{ parent: 7, plan: 'unread', parents: { kind: 'failed', reason: 'parents_invalid' } }, 'unknown', read],
      [{ plan: 'no_parent' }, 'optional', 'gh issue comment <n> --body-file <plan-file>'],
    ];
    for (const [scope, state, command] of planCases) expect(stateAndCommands('plan', reads(), inRoom(scope))).toEqual([state, [command]]);
    expect(row('plan', reads(), inRoom({ parent: 7, plan: 'unread', parents: { kind: 'failed', reason: 'parents_invalid' } })).detail).toContain('parents_invalid');
    const anyRead = 'repo-harness board --parent <n>';
    const anyWrite = 'gh issue comment <n> --body-file <plan-file>';
    const planned = readyRoom(PARENTS, { state: 'ok', board: countedBoard({ limit: 3 }) });
    const planWords = (unknown: number, reason: string, count = 0) => `Plans confirmed: ${count}. Not known: ${unknown} (${reason}).`;
    const overviewPlans: readonly (readonly [OfficeSetupScope, string, string, string])[] = [
      [overview(), 'unknown', 'No repository was read, so no plan read ran.', anyRead],
      [overview(readyRoom(EMPTY)), 'optional', 'No parent has a live seat, so no plan was read.', anyWrite],
      [overview(planned, readyRoom(EMPTY)), 'ok', 'Active parents with a plan: 1.', anyRead],
      [overview(failedRoom('parents_invalid')), 'unknown', planWords(1, 'parents_invalid'), anyRead],
      [overview(loadingRoom), 'unknown', planWords(1, 'no read yet'), anyRead],
      [overview(readyRoom(PARENTS)), 'unknown', planWords(1, 'no read yet'), anyRead],
      [overview(readyRoom(PARENTS, { state: 'unavailable', reason: 'unreachable' })), 'unknown', planWords(1, 'unreachable'), anyRead],
      [overview(readyRoom(PARENTS, { state: 'unavailable', reason: 'board_pending' })), 'unknown', planWords(1, 'not_read'), anyRead],
      [overview(readyRoom(PARENTS, { state: 'unavailable', reason: 'board_collect_failed' })), 'unknown', planWords(1, 'board_collect_failed'), anyRead],
      [overview(readyRoom(PARENTS, { state: 'ok', board: countedBoard({}) })), 'unknown', planWords(1, 'plan_not_observed'), anyRead],
      [overview(planned, failedRoom('parents_invalid')), 'unknown', planWords(1, 'parents_invalid', 1), anyRead],
    ];
    for (const [scope, state, detail, command] of overviewPlans) {
      expect(stateAndCommands('plan', reads(), scope)).toEqual([state, [command]]);
      expect(row('plan', reads(), scope).detail).toBe(detail);
    }
  });

  test('a failed refresh keeps the last state and says so', () => {
    const oldActivity = { ...activity(github('ok', null, 'o/r')), refreshFailed: true } as OfficeSetupReads['devActivity'];
    const cases: readonly (readonly [OfficeSetupRowId, Partial<OfficeSetupReads>])[] = [
      ['hc', { botAccess: { ...bots(READY), refreshFailed: true } as OfficeSetupReads['botAccess'] }],
      ['gh', { devActivity: oldActivity }],
      ['repository', { devActivity: oldActivity }],
      ['repository', { repositories: { ...registered(THIS), refreshFailed: true } as OfficeSetupReads['repositories'] }],
    ];
    for (const [id, input] of cases) expect(row(id, reads(input)).detail).toContain('last refresh failed');
  });

  const openFixture = async (name: string, hash: string, overrides: Partial<OperatorAppProps> = {}) => {
    installDom(`http://127.0.0.1:4318/${hash}`);
    await mount(<OperatorApp {...fixtureProps(name)} initialLocale="en" {...overrides} />);
    await settle();
    await settle();
  };
  const setupRows = () => rows('[data-setup-row]').map(entry => [entry.getAttribute('data-setup-row'), entry.getAttribute('data-setup-state')]);

  test('the overview shows the checklist when no repository is registered, no room is lit, or row 1 or 2 fails', async () => {
    const cases: readonly (readonly [string, string, string, number])[] = [
      ['office-setup-hc', 'hc', 'missing', 8],
      ['office-setup-gh', 'gh', 'failed', 8],
      ['office-setup-repository', 'repository', 'missing', 0],
      ['office-setup-seats', 'seats', 'missing', 8],
    ];
    for (const [fixture, id, state, cards] of cases) {
      await openFixture(fixture, '#board/office');
      expect(rows('[data-office-setup]')).toHaveLength(1);
      expect(setupRows().map(([key]) => key)).toEqual(['hc', 'gh', 'repository', 'seats', 'plan']);
      expect(rows(`[data-setup-row="${id}"]`)[0]!.getAttribute('data-setup-state')).toBe(state);
      expect(rows('[data-office-card]')).toHaveLength(cards);
      await act(async () => root?.unmount());
    }
    await openFixture('office', '#board/office');
    expect(rows('[data-office-card]')).toHaveLength(8);
    expect(rows('[data-office-setup]')).toHaveLength(0);
  });

  test('a room shows the checklist when it is not lit or its parents read failed; a lit room and the list do not; the checklist only copies', async () => {
    await openFixture('office-setup-plan', `#board/office/${HARNESS_ID}/${OFFICE_PARENT}`);
    expect(document.querySelector('[data-board-office="room"]')).not.toBeNull();
    expect(setupRows()).toEqual([['hc', 'ok'], ['gh', 'ok'], ['repository', 'ok'], ['seats', 'missing'], ['plan', 'optional']]);
    expect(rows('[data-setup-row="plan"] code')[0]!.textContent).toBe(`gh issue comment ${OFFICE_PARENT} --body-file <plan-file>`);
    expect(rows('[data-office-setup] button').every(button => button.classList.contains('copy-value__button'))).toBe(true);
    await act(async () => root?.unmount());
    await openFixture('office', `#board/office/${HARNESS_ID}`, { readBoardSeats: async () => ({ state: 'unavailable', reason: 'parents_hc_failed' }) });
    expect(rows('[data-board-parents-reason="parents_hc_failed"] [data-office-setup]')).toHaveLength(1);
    expect(rows('[data-setup-row="seats"]')[0]!.getAttribute('data-setup-state')).toBe('failed');
    expect(rows('[data-setup-row="seats"]')[0]!.textContent).toContain('hc could not list the seat terminals');
    expect(rows('[data-setup-row="plan"]')[0]!.getAttribute('data-setup-state')).toBe('unknown');
    await act(async () => root?.unmount());
    await openFixture('office', `#board/office/${HARNESS_ID}`);
    expect(document.querySelector('[data-board-office="room"]')).not.toBeNull();
    expect(rows('[data-office-setup]')).toHaveLength(0);
    await act(async () => root?.unmount());
    await openFixture('office-setup-seats', '#board');
    expect(document.querySelector('[data-board-subject]')).not.toBeNull();
    expect(rows('[data-office-setup]')).toHaveLength(0);
  });
});

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
    expect(parseWorkspaceLocation('#worktrees/wt_0')).toEqual(DEFAULT_LOCATION);
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

  test('#1968 only the desktop shell gets open controls, on registered rows without a missing directory, and a click passes ids only', async () => {
    installDom(WORKTREES_URL);
    await mount(<OperatorApp {...props(busy())} />);
    expect(document.querySelectorAll('[data-open-worktree]')).toHaveLength(0);

    installDom(WORKTREES_URL);
    const requests: unknown[] = [];
    Object.assign(window, { repoHarnessDesktop: { openWorktree: async (request: unknown) => { requests.push(request); } } });
    const snapshot = rejudged({ 'repo-harness-wt-oar': { reasons: ['missing'] } });
    await mount(<OperatorApp {...props(busy(), { initialWorktrees: snapshot, readWorktrees: async () => snapshot })} />);
    const opens = (directory: string) => Array.from(worktreeRow(directory).querySelectorAll('[data-open-worktree]')).map(button => button.getAttribute('data-open-worktree'));
    for (const directory of ['repo-harness', 'feat-kanban-status', 'operator-site-csp']) expect(opens(directory)).toEqual(['terminal', 'editor']);
    expect(opens('repo-harness-wt-oar')).toEqual([]);
    expect(group('unassigned').querySelectorAll('[data-open-worktree]')).toHaveLength(0);
    const green = rowOf('feat-kanban-status');
    await act(async () => worktreeRow('feat-kanban-status').querySelector<HTMLButtonElement>('[data-open-worktree="editor"]')!.click());
    await act(async () => worktreeRow('feat-kanban-status').querySelector<HTMLButtonElement>('[data-open-worktree="terminal"]')!.click());
    expect(requests).toEqual([
      { repository_id: green.repository_id, worktree_id: green.id, target: 'editor' },
      { repository_id: green.repository_id, worktree_id: green.id, target: 'terminal' },
    ]);
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
/** The registered non-green rows the plan review can take: no primary checkout, no orphan. */
const REVIEWABLE = ['repo-harness-wt-kanban-redesign', 'repo-harness-wt-oar', 'codex-7f3a', 'repo-harness-wt-docs-cleanup', 'operator-site-csp'];
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
      // A registered non-green row can be checked for the plan review instead, and starts unchecked; the clean request carries only green ids (5-WT-P1).
      const reviewable = new Set(REVIEWABLE);
      for (const row of document.querySelectorAll<HTMLElement>('[data-worktree]')) {
        const box = row.querySelector<HTMLInputElement>('input[data-select]')!;
        const green = row.getAttribute('data-judgment') === 'green';
        const on = green || reviewable.has(row.querySelector('[data-directory]')!.textContent!);
        expect([box.disabled, box.checked]).toEqual([!on, green]);
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
    investigate: session => base.investigate(session),
    investigation: session => base.investigation(session),
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
  for (const directory of REVIEWABLE) await act(async () => checkbox(directory).click());
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
    expect(record.opened).toEqual([REVIEWABLE.map(directory => rowOf(directory).id)]);
    // Every item shows the choice, reason and evidence of the plan version, word for word.
    const shown = (directory: string) => {
      const block = planItem(directory).querySelector('[data-plan-advice]')!;
      return { recommendation: block.getAttribute('data-plan-advice'), reason: block.querySelector('[data-plan-advice-reason]')?.textContent,
        evidence: Array.from(block.querySelectorAll('[data-plan-evidence]'), line => line.textContent) };
    };
    for (const item of record.plan().items) {
      expect(shown(item.worktree.directory)).toEqual({ recommendation: item.advice.recommendation, reason: item.advice.reason, evidence: [...item.advice.evidence] });
    }
    expect(planItem('repo-harness-wt-oar').querySelector('[data-plan-advice] p')?.textContent).toBe('Plan advice: Keep. Waiting for the user to choose.');
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

  test('while the plan is made, the page shows the running request and its seconds; the line goes when the answer arrives', async () => {
    // The line counts real seconds, so this case needs a clock that runs.
    setSystemTime();
    const base = cleanupPlanFixture(NOW);
    const held: (() => void)[] = [];
    const hold = <T,>(answer: Promise<T>) => new Promise<T>(resolve => { held.push(() => void answer.then(resolve)); });
    const ports: CleanupPlanPorts = { ...base, open: ids => hold(base.open(ids)), choose: (session, choices) => hold(base.choose(session, choices)) };
    installDom(WORKTREES_URL);
    await mount(<OperatorApp {...props(busy(), { worktreeCleanupPlan: ports })} />);
    for (const directory of REVIEWABLE) await act(async () => checkbox(directory).click());
    await act(async () => document.querySelector<HTMLButtonElement>('[data-plan-review-open]')!.click());
    const building = () => document.querySelector('[role="status"][data-plan-building]');
    const answer = async () => { await act(async () => held.shift()!()); await until(() => building() === null); };
    // Pass 1: the line counts the seconds since the page sent the request.
    await until(() => building() !== null);
    expect(building()?.textContent).toBe(`The operator service makes the plan for ${REVIEWABLE.length} worktrees… 0 s`);
    await act(async () => { await Bun.sleep(1_100); });
    expect(building()?.textContent).toBe(`The operator service makes the plan for ${REVIEWABLE.length} worktrees… 1 s`);
    await answer();
    // Pass 2 shows the same line until the new plan version arrives.
    await option('repo-harness-wt-notes', 'delete');
    await act(async () => planButton('choose').click());
    expect(building()?.getAttribute('data-plan-building')).toBe('0');
    await answer();
    expect(planItem('repo-harness-wt-notes').querySelector('[data-plan-advice]')?.getAttribute('data-plan-advice')).toBe('delete');
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

  test('an investigation locks the plan while it runs, then loads the advised plan version with nothing authorized', async () => {
    const record = recordPlan();
    let polls = 0;
    const status = (state: CleanupInvestigationStatus['state'], plan: CleanupPlan | null, failure: CleanupInvestigationStatus['failure'] = null): CleanupInvestigationStatus =>
      ({ protocol: 1, kind: 'operator_worktree_cleanup_investigation', session_id: record.plan().session_id, job_id: 'e'.repeat(32), state,
        started_at: new Date(NOW).toISOString(), deadline_at: new Date(NOW + 1_200_000).toISOString(), failure, plan });
    let finished: () => CleanupInvestigationStatus = () => { throw new Error('set below'); };
    const ports: CleanupPlanPorts = { ...record.ports,
      investigate: async () => ({ state: 'investigation', status: status('running', null) }),
      investigation: async () => { polls++; return { state: 'investigation', status: finished() }; } };
    await openReview(ports);
    const notes = record.plan().items.find(item => item.worktree.directory === 'repo-harness-wt-notes')!;
    // The agent advises a delete with its own reason; the plan item binds it, as the server's createCleanupPlan does.
    const advised = await record.ports.choose(record.plan().session_id, record.plan().items.map(item => ({ id: item.worktree.id,
      recommendation: item === notes ? 'delete' as const : 'keep' as const, archive: { git: null, private: null } })));
    if (advised.state !== 'ready') throw new Error('the fixture plan is ready');
    finished = () => status('succeeded', advised.plan);
    const start = () => document.querySelector<HTMLButtonElement>('[data-plan-investigate]')!;
    const section = () => document.querySelector('[data-plan-investigation]')!;
    await act(async () => start().click());
    await until(() => section().getAttribute('data-plan-investigation') === 'running');
    // While the agent works, nothing on the plan can change or run.
    expect(start().disabled).toBe(true);
    expect(document.querySelectorAll('[data-plan-item] input:not(:disabled), [data-plan-item] select:not(:disabled)')).toHaveLength(0);
    await act(async () => { await Bun.sleep(CLEANUP_INVESTIGATION_POLL_MS + 200); });
    await until(() => section().getAttribute('data-plan-investigation') === 'succeeded');
    expect(polls).toBe(1);
    expect(section().textContent).toContain('Nothing is authorized: check each item.');
    const box = planItem('repo-harness-wt-notes').querySelector<HTMLInputElement>('[data-plan-authorize]')!;
    expect([box.checked, box.disabled, planButton('execute').getAttribute('data-plan-execute')]).toEqual([false, false, '0']);
    expect(planItem('repo-harness-wt-notes').querySelector('[data-plan-digest="plan"]')?.textContent).toBe(advised.plan.items.find(item => item.worktree.id === notes.worktree.id)!.plan_sha256);
    // The advised item shows the choice of the new plan version with its reason and evidence.
    const advice = planItem('repo-harness-wt-notes').querySelector('[data-plan-advice]')!;
    expect([advice.getAttribute('data-plan-advice'), advice.querySelector('[data-plan-advice-reason]')?.textContent,
      Array.from(advice.querySelectorAll('[data-plan-evidence]'), line => line.textContent)]).toEqual(['delete', notes.advice.reason, [...notes.advice.evidence]]);

    // A failed job and a start refusal each show their own text and leave the plan as it is.
    finished = () => status('failed', null, 'advice_invalid');
    await act(async () => start().click());
    await act(async () => { await Bun.sleep(CLEANUP_INVESTIGATION_POLL_MS + 200); });
    await until(() => section().getAttribute('data-plan-investigation') === 'failed');
    expect(section().querySelector('[data-plan-investigation-failure]')?.textContent).toBe('The investigation failed. The plan did not change. The agent answer does not fit the plan.');
    expect(planItem('repo-harness-wt-notes').querySelector('[data-plan-authorize]')).not.toBeNull();
  });

  // Sibling inputs of "the start answer does not say whether a job exists": no answer, an unreadable answer and a running refusal.
  for (const [name, answer] of [['no answer', { state: 'unreachable' }], ['an unreadable answer', { state: 'unreadable' }],
    ['a running refusal', { state: 'refused', status: 409, error: { code: 'investigation_running', message: 'running', next_action: 'wait' } }]] as const) {
    test(`after ${name} to the start, the page reads the job status and loads the plan it finished`, async () => {
      const record = recordPlan();
      let reads = 0;
      const ports: CleanupPlanPorts = { ...record.ports, investigate: async () => answer,
        investigation: async () => { reads++; return { state: 'investigation', status: { protocol: 1, kind: 'operator_worktree_cleanup_investigation',
          session_id: record.plan().session_id, job_id: 'e'.repeat(32), state: 'succeeded', started_at: new Date(NOW).toISOString(),
          deadline_at: new Date(NOW + 1_200_000).toISOString(), failure: null, plan: record.plan() } }; } };
      await openReview(ports);
      await act(async () => document.querySelector<HTMLButtonElement>('[data-plan-investigate]')!.click());
      await until(() => document.querySelector('[data-plan-investigation]')?.getAttribute('data-plan-investigation') === 'succeeded');
      expect(reads).toBe(1);
      expect(document.querySelector('[data-plan-investigation] [data-plan-failure]')).toBeNull();
    });
  }

  test('when the status read after a lost start finds no job, the page shows the start failure', async () => {
    const record = recordPlan();
    // The busy fixture's status read answers 404 investigation_not_found.
    await openReview({ ...record.ports, investigate: async () => ({ state: 'unreachable' }) });
    await act(async () => document.querySelector<HTMLButtonElement>('[data-plan-investigate]')!.click());
    await until(() => document.querySelector('[data-plan-investigation] [data-plan-failure]') !== null);
    expect(document.querySelector('[data-plan-investigation] [data-plan-failure]')?.getAttribute('data-plan-failure')).toBe('unreachable');
    expect(document.querySelector('[data-plan-investigation]')?.getAttribute('data-plan-investigation')).toBe('none');
  });

  test('a refused investigation start shows the typed refusal of the busy fixture', async () => {
    await openReview(recordPlan().ports);
    await act(async () => document.querySelector<HTMLButtonElement>('[data-plan-investigate]')!.click());
    await until(() => document.querySelector('[data-plan-investigation] [data-plan-failure]') !== null);
    expect(document.querySelector('[data-plan-investigation] [data-plan-failure]')?.getAttribute('data-plan-failure')).toBe('investigation_too_large');
    expect(document.querySelector('[data-plan-investigation]')?.textContent).toContain('The plan has too many worktrees for one investigation.');
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
      investigate: () => Promise.reject(new Error('not used')),
      investigation: () => Promise.reject(new Error('not used')),
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
      () => Response.json({ protocol: 1, kind: 'operator_worktree_cleanup_investigation', session_id: plan.session_id, job_id: 'e'.repeat(32), state: 'running',
        started_at: new Date(NOW).toISOString(), deadline_at: new Date(NOW + 1_200_000).toISOString(), failure: null }, { status: 202 }),
      () => Response.json({ error: { code: 'quota_unknown', message: 'refused', next_action: 'retry' } }, { status: 503 }),
      () => Response.json({ protocol: 1, kind: 'operator_worktree_cleanup_investigation', session_id: plan.session_id, job_id: 'e'.repeat(32), state: 'succeeded',
        started_at: new Date(NOW).toISOString(), deadline_at: new Date(NOW + 1_200_000).toISOString(), failure: null, plan }),
    ];
    const original = globalThis.fetch;
    const requests: { method: string; url: string; body: Record<string, unknown> }[] = [];
    globalThis.fetch = (async (url: unknown, options?: RequestInit) => {
      requests.push({ method: options?.method ?? 'GET', url: String(url), body: options?.body === undefined ? {} : JSON.parse(String(options.body)) });
      return answers[requests.length - 1]!();
    }) as typeof fetch;
    try {
      const execute = { request_id: crypto.randomUUID(), session_id: plan.session_id, ids: [id], expected_digest: 'a'.repeat(64), approvals: [] };
      const results = [await cleanupPlanPorts.open([id]), await cleanupPlanPorts.choose(plan.session_id, [{ id, recommendation: 'keep', archive: { git: null, private: null } }]),
        await cleanupPlanPorts.execute(execute), await cleanupPlanPorts.open([id]),
        await cleanupPlanPorts.investigate(plan.session_id), await cleanupPlanPorts.investigate(plan.session_id), await cleanupPlanPorts.investigation(plan.session_id)];
      // An execution result with no items fails its decoder: the request ran, so the page says unreadable, not unreachable.
      expect(results.map(result => result.state === 'refused' ? `refused ${result.status} ${result.error.code}` : result.state === 'investigation'
        ? `investigation ${result.status.state} ${result.status.plan === null ? 'no plan' : 'plan'}` : result.state)).toEqual(['ready', 'refused 409 choices_changed', 'unreadable', 'unreachable',
        'investigation running no plan', 'refused 503 quota_unknown', 'investigation succeeded plan']);
      expect(requests.map(request => `${request.method} ${request.url} ${Object.keys(request.body).sort().join(',')}`)).toEqual([
        'POST /api/v1/worktrees/cleanup/plan ids,request_id', 'POST /api/v1/worktrees/cleanup/plan choices,request_id,session_id',
        'POST /api/v1/worktrees/cleanup/execute approvals,expected_digest,ids,request_id,session_id', 'POST /api/v1/worktrees/cleanup/plan ids,request_id',
        'POST /api/v1/worktrees/cleanup/investigation request_id,session_id', 'POST /api/v1/worktrees/cleanup/investigation request_id,session_id',
        `GET /api/v1/worktrees/cleanup/investigation/${plan.session_id} `]);
      expect(requests[0]!.body.request_id).toMatch(UUID); expect(requests[0]!.body.request_id).not.toBe(requests[1]!.body.request_id);
    } finally { globalThis.fetch = original; }
  });

  test('plan rows start unchecked, a review takes 1 to 16 of them, and the review and the selection survive a page change', async () => {
    const base = trees(), yellow = rowOf('repo-harness-wt-oar');
    const extraRow = (index: number) => ({ ...yellow, id: `wt_${'9'.repeat(62)}${index.toString(16).padStart(2, '0')}`, directory: `repo-harness-wt-extra-${index}` });
    const withExtra = (count: number) => decodeWorktrees({ ...base, repositories: base.repositories.map((group, index) => index === 0
      ? { ...group, worktrees: [...group.worktrees, ...Array.from({ length: count }, (_, row) => extraRow(row))] } : group) });
    // 17 plan rows: one more than a review takes.
    let snapshot = withExtra(12);
    const record = recordPlan();
    installDom(WORKTREES_URL);
    await mount(<OperatorApp {...props(busy(), { initialWorktrees: snapshot, readWorktrees: async () => snapshot, worktreeCleanupPlan: record.ports })} />);
    await settle();
    const go = (workspace: string) => act(async () => document.querySelector<HTMLAnchorElement>(`.workspace-nav a[data-workspace="${workspace}"]`)!.click());
    const open = () => document.querySelector<HTMLButtonElement>('[data-plan-review-open]')!;
    const openState = () => [open().disabled, open().getAttribute('data-plan-review-open'), document.querySelector('[data-plan-limit]') !== null];
    const planRows = [...REVIEWABLE, ...Array.from({ length: 12 }, (_, index) => `repo-harness-wt-extra-${index}`)];
    const greenUnchanged = () => {
      for (const directory of GREEN) expect(checkbox(directory).checked).toBe(true);
      expect(cleanButton().textContent).toBe('Clean 3 selected');
    };
    for (const directory of planRows) expect([checkbox(directory).disabled, checkbox(directory).checked]).toEqual([false, false]);
    expect(openState()).toEqual([true, '0', false]);
    greenUnchanged();
    await act(async () => checkbox(planRows[0]!).click());
    expect(openState()).toEqual([false, '1', false]);
    for (const directory of planRows.slice(1, 16)) await act(async () => checkbox(directory).click());
    expect(openState()).toEqual([false, '16', false]);
    await act(async () => checkbox(planRows[16]!).click());
    expect(openState()).toEqual([true, '17', true]);
    await act(async () => checkbox(planRows[0]!).click());
    expect(openState()).toEqual([false, '16', false]);
    greenUnchanged();

    // A row the collector adds while the owner selects starts unchecked, and the selection survives a page change.
    snapshot = withExtra(13);
    await go('repositories');
    expect(document.querySelector('[data-worktrees-page]')!.closest('[hidden]')).not.toBeNull();
    await go('worktrees');
    await until(() => worktreeRow('repo-harness-wt-extra-12') !== undefined);
    expect(checkbox('repo-harness-wt-extra-12').checked).toBe(false);
    expect(planRows.map(directory => checkbox(directory).checked)).toEqual(planRows.map((_, index) => index > 0));
    expect(openState()).toEqual([false, '16', false]);
    greenUnchanged();

    await act(async () => open().click());
    await until(() => document.querySelector('[data-plan-review]')?.getAttribute('data-plan-review') === 'ready');
    const idOf = (directory: string) => snapshot.repositories.flatMap(group => group.worktrees).find(tree => tree.directory === directory)!.id;
    expect(record.opened.map(ids => [...ids].sort())).toEqual([planRows.slice(1).map(idOf).sort()]);
    // The open review survives a page change without a new plan.
    await go('repositories');
    await go('worktrees');
    await settle();
    expect(document.querySelector('[data-plan-review]')?.getAttribute('data-plan-review')).toBe('ready');
    expect(record.opened).toHaveLength(1);
    // Back restores the default selection: no plan row checked.
    await act(async () => document.querySelector<HTMLButtonElement>('[data-plan-back]')!.click());
    await settle();
    expect([...planRows, 'repo-harness-wt-extra-12'].some(directory => checkbox(directory).checked)).toBe(false);
    expect(openState()).toEqual([true, '0', false]);
    greenUnchanged();
  });

  describe('a write that gets 403 write_token_invalid after a restart', () => {
    const planClick = (name: 'choose' | 'execute') => act(async () => planButton(name).click());
    const deleteChosen = async () => {
      await option('repo-harness-wt-notes', 'delete');
      await planClick('choose');
    };
    const agentsPage = async (overrides: Partial<OperatorAppProps> = {}) => {
      const stores = settingsStores(NOW, 'busy');
      installDom('http://127.0.0.1:4318/#agents');
      await mount(<OperatorApp {...props(busy(), { readAgentsSettings: stores.agents.read, readSeatsSettings: stores.seats.read, readReportingLanguage: stores.reporting.read,
        readSetup: () => new Promise(() => {}), readQuota: () => new Promise(() => {}), ...overrides })} />);
      await settle();
    };
    const saveLocked = (section: string) => expect(document.querySelector<HTMLButtonElement>(`[data-save="${section}"]`)!.disabled).toBe(true);
    const fixture = (...ports: (keyof CleanupPlanPorts)[]): CleanupPlanPorts => ({ ...cleanupPlanFixture(NOW), ...Object.fromEntries(ports.map(port => [port, cleanupPlanPorts[port]])) });
    const TOKEN_ERROR = { code: 'write_token_invalid', message: 'The write token is missing or not valid.', next_action: 'Reload the operator page, then retry.' };
    const ORIGIN_ERROR = { code: 'origin_not_allowed', message: 'The request origin is not allowed.', next_action: 'Open the page from the operator service.' };
    /** Only a typed 403 with this code means a stale token. Every write shares one client, so one path proves each other answer. */
    const OTHER_ANSWERS = [
      ['a 401 with the code', 401, { error: TOKEN_ERROR }, { state: 'refused', status: 401, error: TOKEN_ERROR }],
      ['a 500 with the code', 500, { error: TOKEN_ERROR }, { state: 'refused', status: 500, error: TOKEN_ERROR }],
      ['a 403 with another code', 403, { error: ORIGIN_ERROR }, { state: 'refused', status: 403, error: ORIGIN_ERROR }],
      ['a 403 with no typed error', 403, {}, { state: 'unreachable' }],
    ] as const;
    const WRITES: readonly {
      readonly path: string; readonly name: string; readonly locale?: 'zh'; readonly send: (answers: unknown[]) => Promise<void>; readonly after?: () => void;
      readonly status?: number; readonly body?: unknown; readonly keeps?: unknown;
    }[] = [
      { name: 'agents settings', path: '/api/v1/settings/agents', after: () => saveLocked('agents'), send: async () => {
        await agentsPage();
        await act(async () => document.querySelector<HTMLButtonElement>('[data-runtime="codex"] [data-use="review"]')!.click());
        await act(async () => document.querySelector<HTMLButtonElement>('[data-save="agents"]')!.click());
      } },
      { name: 'seats settings', path: '/api/v1/settings/seats', after: () => saveLocked('seats'), send: async () => {
        await agentsPage();
        await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Allow gatekeeper"]')!.click());
        await act(async () => document.querySelector<HTMLButtonElement>('[data-save="seats"]')!.click());
      } },
      { name: 'one-click cleanup', path: CLEANUP_PATH, send: async () => {
        installDom(WORKTREES_URL);
        await mount(<OperatorApp {...props(busy())} />);
        await act(async () => cleanButton().click());
      } },
      { name: 'plan pass 1', path: '/api/v1/worktrees/cleanup/plan', locale: 'zh', send: async () => {
        installDom(WORKTREES_URL);
        await mount(<OperatorApp {...props(busy(), { worktreeCleanupPlan: fixture('open'), initialLocale: 'zh' })} />);
        for (const directory of REVIEWABLE) await act(async () => checkbox(directory).click());
        await act(async () => document.querySelector<HTMLButtonElement>('[data-plan-review-open]')!.click());
      } },
      { name: 'plan pass 2', path: '/api/v1/worktrees/cleanup/plan', send: async () => {
        await openReview(fixture('choose'));
        await deleteChosen();
      } },
      { name: 'plan execution', path: '/api/v1/worktrees/cleanup/execute', send: async () => {
        await openReview(fixture('execute'));
        await deleteChosen();
        await until(() => planItem('repo-harness-wt-notes').querySelector('[data-plan-authorize]') !== null);
        await act(async () => planItem('repo-harness-wt-notes').querySelector<HTMLInputElement>('[data-plan-authorize]')!.click());
        await planClick('execute');
      } },
      { name: 'investigation start', path: '/api/v1/worktrees/cleanup/investigation', send: async () => {
        // The real status port is connected: a refused start reads no status, because no job exists.
        await openReview(fixture('investigate', 'investigation'));
        await act(async () => document.querySelector<HTMLButtonElement>('[data-plan-investigate]')!.click());
      } },
      ...OTHER_ANSWERS.map(([name, status, body, keeps]) => ({ name, status, body, keeps, path: '/api/v1/worktrees/cleanup/plan', send: async (answers: unknown[]) => {
        await openReview({ ...cleanupPlanFixture(NOW), open: async ids => { const answer = await cleanupPlanPorts.open(ids); answers.push(answer); return answer; } });
      } })),
    ];
    const RELOAD_TEXT = {
      en: 'Reload this pageThe write token of this page is not valid, for example after the service restarted. Nothing was changed. Reload the page, then try again.',
      zh: '请刷新这个页面这个页面的写 token 无效，例如服务重启过。什么都没有改动。刷新整个页面，再操作一次。',
    };

    for (const write of WRITES) test(`${write.name}: ${write.keeps ? 'keeps its own result, not the reload state' : 'shows the one reload state, sends one request and offers no retry'}`, async () => {
      const original = globalThis.fetch;
      const requests: string[] = [];
      const answers: unknown[] = [];
      globalThis.fetch = (async (url: unknown, options?: RequestInit) => {
        requests.push(`${options?.method ?? 'GET'} ${String(url)}`);
        return Response.json(write.body ?? { error: TOKEN_ERROR }, { status: write.status ?? 403 });
      }) as typeof fetch;
      try {
        await write.send(answers);
        if (write.keeps) {
          await until(() => document.querySelector('[data-plan-failure]') !== null);
          expect(answers).toEqual([write.keeps]);
          expect(document.querySelector('[data-write-reload]')).toBeNull();
          expect(requests).toEqual([`POST ${write.path}`]);
          return;
        }
        await until(() => document.querySelector('[data-write-reload]') !== null);
        await settle();
        const banners = document.querySelectorAll('[data-write-reload]');
        expect(banners).toHaveLength(1);
        expect(banners[0]!.textContent).toBe(RELOAD_TEXT[write.locale ?? 'en']);
        expect(banners[0]!.querySelectorAll('button')).toHaveLength(0);
        expect(requests).toEqual([`POST ${write.path}`]);
        write.after?.();
      } finally { globalThis.fetch = original; }
    });
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
