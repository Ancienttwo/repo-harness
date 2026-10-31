import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { decodeCleanupPlanPreview, type CleanupPlanPreview } from '../../src/core/operator/doc-session-api';
import { WORKTREE_CLEANUP_MAX_IDS } from '../../src/core/operator/worktree-cleanup';
import { cleanupSelection, type CleanupPlan, type CleanupPlanItem } from '../../src/core/operator/worktree-cleanup-plan';
import { decodeWorktrees, type WorktreesSnapshot } from '../../src/core/operator/worktrees';
import { agentsSettingsFixture } from '../../src/operator-web/fixtures/settings';
import { CleanupSessionPage } from '../../src/operator-web/CleanupSessionPage';
import { cleanupPlanDelay, cleanupSessionRequest, type CleanupPlanReader, type CleanupSessionCreateWriter } from '../../src/operator-web/cleanup-session';
import type { DocSessions, DocSessionsView } from '../../src/operator-web/doc-sessions';
import { fixtureProps } from '../../src/operator-web/fixtures';
import { CLEANUP_SESSION } from '../../src/operator-web/fixtures/doc-sessions';
import { busyWorktrees } from '../../src/operator-web/fixtures/worktrees';
import { translate } from '../../src/operator-web/i18n';
import type { AgentsSettingsReader } from '../../src/operator-web/settings';
import type { WorkspaceLocation } from '../../src/operator-web/workspace-location';
import { allWorktrees, selectionDigest, useWorktreeCleanup, type WorktreesView } from '../../src/operator-web/worktrees';
import { WorktreesPage } from '../../src/operator-web/WorktreesPage';

mock.module('mermaid', () => ({ default: { initialize: () => {}, render: async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }) } }));

let root: Root | null = null;
let window: Window;

beforeEach(() => {
  window = new Window({ url: 'http://127.0.0.1:4318/' });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({ matches: false, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true }),
  });
  Object.assign(globalThis, {
    window, document: window.document, navigator: window.navigator, localStorage: window.localStorage,
    HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, Event: window.Event, Range: window.Range,
    MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true,
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  await window.happyDOM.close();
});

const settle = () => act(async () => { for (let turn = 0; turn < 10; turn++) await new Promise(resolve => setTimeout(resolve, 0)); });
const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);

async function render(node: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  await settle();
  return container;
}
const unmount = async () => { await act(async () => root?.unmount()); root = null; };

const click = (element: Element) => act(async () => { (element as HTMLElement).click(); });
const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const one = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const checkbox = (id: string) => one(`[data-select="${id}"]`) as HTMLInputElement;

const now = Date.now();
const snapshot: WorktreesSnapshot = decodeWorktrees(busyWorktrees(now));
const worktrees: WorktreesView = { kind: 'ready', snapshot, refreshFailed: false };
const rowOf = (directory: string) => allWorktrees(snapshot).find(row => row.directory === directory)!;
const GREEN = [rowOf('feat-kanban-status').id, rowOf('operator-site-wt-footer').id];
const OAR = rowOf('repo-harness-wt-oar').id;
const DOCS = rowOf('repo-harness-wt-docs-cleanup').id;
const RED = rowOf('repo-harness-wt-kanban-redesign').id;

async function busyPreview(): Promise<CleanupPlanPreview> {
  const read = await fixtureProps('busy').readCleanupPlan!(CLEANUP_SESSION, new AbortController().signal);
  if (read.state !== 'ok') throw new Error(`plan ${read.state}`);
  return read.value;
}
const planOf = (preview: CleanupPlanPreview): CleanupPlan => preview.plan!;
const itemOf = (plan: CleanupPlan, id: string): CleanupPlanItem => plan.items.find(item => item.worktree.id === id)!;
/** A preview changed the way the server could answer, decoded again so the test holds only wire-valid shapes. */
const changed = (preview: CleanupPlanPreview, change: Partial<Record<keyof CleanupPlanPreview, unknown>>): CleanupPlanPreview =>
  decodeCleanupPlanPreview({ ...preview, ...change }, { session_id: CLEANUP_SESSION });

async function mountPage(preview: CleanupPlanPreview | null, readPlan?: CleanupPlanReader) {
  return render(
    <CleanupSessionPage sessionId={CLEANUP_SESSION} readEvents={fixtureProps('busy').readDocSessionEvents!}
      readPlan={readPlan ?? (async () => ({ state: 'ok', value: preview! }))} generation={0} t={t} />,
  );
}

describe('worktree cleanup session page', () => {
  test('5-WTC-P1: the plan groups by judgment; each item shows its advice, reason, evidence, loss and archive; the checkboxes are the server selection', async () => {
    const preview = await busyPreview();
    const plan = planOf(preview);
    await mountPage(preview);

    expect(all('[data-plan-group]').map(group => [group.dataset.planGroup, group.dataset.count])).toEqual([['green', '2'], ['yellow', '2'], ['red', '1']]);
    // Each checkbox shows `cleanupSelection`: green starts checked, yellow unchecked.
    for (const item of plan.items.filter(entry => entry.worktree.judgment !== 'red')) {
      expect(checkbox(item.worktree.id).checked).toBe(cleanupSelection(item).selected_by_default);
    }
    expect(GREEN.map(id => checkbox(id).checked)).toEqual([true, true]);
    expect([OAR, DOCS].map(id => checkbox(id).checked)).toEqual([false, false]);

    const oar = one(`[data-plan-item="${OAR}"]`);
    expect(oar.querySelector('[data-advice]')?.getAttribute('data-advice')).toBe('archive_then_delete');
    expect(oar.textContent).toContain('Agent advice: Archive, then delete');
    expect(oar.querySelector('[data-reason-text]')?.textContent).toContain('PR #602 was closed without a merge');
    expect([...oar.querySelectorAll('[data-evidence] li')].map(li => li.textContent)).toEqual(['PR #602 closed, not merged', 'docs/notes/oar-0-45.md is only on this branch']);
    expect([...oar.querySelectorAll('[data-loss="files"] li')].map(li => li.textContent)).toEqual(['docs/notes/oar-0-45.md']);
    expect([...oar.querySelectorAll('[data-loss="ignored"] li')].map(li => li.textContent)).toEqual(['node_modules/']);
    expect([...oar.querySelectorAll('[data-loss="commits"] li')].map(li => li.textContent)).toEqual([itemOf(plan, OAR).loss!.commits[0]!.slice(0, 12)]);
    expect(oar.querySelector('[data-archive-git]')?.textContent).toBe('Archive to docs/archive/2026-10-30-oar-0-45 on branch docs/archive-oar-0-45, with a Draft PR');
    const docs = one(`[data-plan-item="${DOCS}"]`);
    expect(docs.querySelector('[data-advice]')?.getAttribute('data-advice')).toBe('delete');
    expect(docs.querySelector('[data-loss]')?.textContent).toBe('Would lose: nothing');
    expect(docs.querySelector('[data-archive]')).toBeNull();

    // Before and after are drawn from the plan rows; the selected green rows go.
    expect(one('[data-frees]').textContent).toContain('Frees');
    const widths = ['before', 'after'].map(which => parseFloat(one(`[data-disk="${which}"] [data-disk-bar]`).style.width));
    expect(widths[0]).toBe(100);
    expect(widths[1]).toBeLessThan(widths[0]!);
  });

  test('5-WTC-P1: while the server runs no cleanup from the plan, the selection is fixed, it says why, and no control removes anything', async () => {
    const preview = await busyPreview();
    expect(preview.execution).toEqual({ enabled: false, code: 'cleanup_execution_unavailable' });
    await mountPage(preview);
    const banner = one('[data-execution]');
    expect(banner.dataset.execution).toBe('cleanup_execution_unavailable');
    expect(banner.textContent).toContain(t('cleanupSession.execution.cleanup_execution_unavailable.message'));
    expect(banner.textContent).toContain(t('cleanupSession.execution.cleanup_execution_unavailable.action'));
    expect(all('input[type="checkbox"]').map(box => (box as HTMLInputElement).disabled)).toEqual([true, true, true, true]);
    // A click on a fixed checkbox changes nothing.
    await click(checkbox(OAR));
    expect(checkbox(OAR).checked).toBe(false);
    expect(document.querySelector('[data-authorize]')).toBeNull();
    expect(all('button').map(item => item.textContent).filter(text => /archive|delete|remove|approve|run/iu.test(text ?? ''))).toEqual([]);
  });

  test('5-WTC-N1: the record shows only categories while the agent investigates; a red item has no checkbox and no loss', async () => {
    const preview = await busyPreview();
    const investigating = changed(preview, { state: 'investigating', agent: 'running', plan: null });
    expect(cleanupPlanDelay(investigating)).toBeLessThan(cleanupPlanDelay(preview));
    await mountPage(investigating);
    expect(one('[data-investigating]')).toBeTruthy();
    expect(all('input[type="checkbox"]').length).toBe(0);
    expect(document.querySelector('[data-plan-group]')).toBeNull();
    expect(document.querySelector('[data-execution]')).toBeNull();
    expect(one('[data-conversation] [data-message="agent"]').textContent).toContain('Codex');

    await click(one('[data-tool-fold] button'));
    await settle();
    expect(all('[data-tool]').map(tool => tool.dataset.tool)).toEqual(['command', 'read']);
    const record = one('[data-session-record]').textContent!;
    expect(record).toContain('Run');
    expect(record).not.toMatch(/git |--porcelain|\/Users\/|\/tmp\//u);

    await unmount();
    await mountPage(preview);
    const red = one(`[data-plan-item="${RED}"]`);
    expect(red.querySelector('input')).toBeNull();
    expect(red.querySelector('[data-loss]')).toBeNull();
    expect(red.querySelector('[data-advice]')?.getAttribute('data-advice')).toBe('keep');
    expect(one('[data-plan-group="red"]').textContent).toContain('In use');
    // Green and yellow hold two checkboxes each; red holds none.
    expect(all('input[type="checkbox"]').length).toBe(4);
  });

  test('a plan the agent could not complete removes nothing, and a failed plan read names its source', async () => {
    const preview = await busyPreview();
    await mountPage(changed(preview, { state: 'unavailable', agent: null, plan: null }));
    expect(one('[data-plan-unavailable]').textContent).toContain(t('cleanupSession.planUnavailable'));
    expect(document.querySelector('[data-plan-group]')).toBeNull();
    await unmount();

    await mountPage(null, async () => ({ state: 'unavailable', reason: 'session_not_found' }));
    expect(one('[data-session-failure]').dataset.sessionFailure).toBe('session_not_found');
    expect(one('[data-session-failure]').textContent).toContain(t('cleanupSession.source.plan'));
    expect(document.querySelector('[data-plan-group]')).toBeNull();
  });
});

describe('the cleanup approval request', () => {
  test('5-WTC-F1: green ids carry no approval, a yellow id carries its item digests, and the digest covers the plan rows', async () => {
    const plan = planOf(await busyPreview());
    const request = await cleanupSessionRequest(plan, [OAR, ...GREEN, OAR], snapshot);
    const ids = [...GREEN, OAR].sort();
    expect(request).toEqual({
      session_id: CLEANUP_SESSION, ids,
      expected_digest: await selectionDigest(ids.map(id => itemOf(plan, id).worktree)),
      approvals: [{ id: OAR, loss_sha256: itemOf(plan, OAR).loss_sha256!, plan_sha256: itemOf(plan, OAR).plan_sha256 }],
    });
    // Ids and digests only: no directory, no path, no red id.
    const wire = JSON.stringify(request);
    expect(wire).not.toMatch(/repo-harness-wt|feat-kanban|docs\/archive/u);
    expect(wire).not.toContain(RED);
  });

  test('5-WTC-F2: a red id, an id outside the plan, and a selection at zero or above the id limit are refused before any request', async () => {
    const plan = planOf(await busyPreview());
    await expect(cleanupSessionRequest(plan, [RED], snapshot)).rejects.toThrow('red');
    await expect(cleanupSessionRequest(plan, [`wt_${'0'.repeat(64)}`], snapshot)).rejects.toThrow('not in the plan');
    await expect(cleanupSessionRequest(plan, [], snapshot)).rejects.toThrow('size');
    const many = Array.from({ length: WORKTREE_CLEANUP_MAX_IDS + 1 }, (_, index) => `wt_${(index + 1).toString(16).padStart(64, '0')}`);
    await expect(cleanupSessionRequest(plan, many, snapshot)).rejects.toThrow('size');
    // A yellow item whose loss the server did not observe has no digest to approve.
    const unobserved: CleanupPlan = { ...plan, items: plan.items.map(item => item.worktree.id === DOCS ? { ...item, loss: null, loss_sha256: null } : item) };
    await expect(cleanupSessionRequest(unobserved, [DOCS], snapshot)).rejects.toThrow('no observed loss');
    // An item the plan's own selection policy leaves unchecked is refused: advice to keep, or a process still running in it.
    const keep: CleanupPlan = { ...plan, items: plan.items.map(item => item.worktree.id === GREEN[0] ? { ...item, advice: { ...item.advice, recommendation: 'keep' as const } } : item) };
    await expect(cleanupSessionRequest(keep, [GREEN[0]!], snapshot)).rejects.toThrow('not selectable');
    const running: CleanupPlan = { ...plan, items: plan.items.map(item => item.worktree.id === GREEN[0] ? { ...item, worktree: { ...item.worktree, process_count: 1 } } : item) };
    expect(cleanupSelection(itemOf(running, GREEN[0]!)).selectable).toBe(false);
    await expect(cleanupSessionRequest(running, [GREEN[0]!], snapshot)).rejects.toThrow('not selectable');
  });

  test('the plan and the live collector must agree: an item the rows judge otherwise is refused, in both directions', async () => {
    const plan = planOf(await busyPreview());
    const judged = (judgment: 'red' | 'green'): WorktreesSnapshot => {
      const change = (row: WorktreesSnapshot['unassigned'][number]) => row.id === DOCS ? { ...row, judgment, reasons: judgment === 'red' ? ['dirty' as const] : [] } : row;
      return { ...snapshot, repositories: snapshot.repositories.map(repository => ({ ...repository, worktrees: repository.worktrees.map(change) })), unassigned: snapshot.unassigned.map(change) };
    };
    await expect(cleanupSessionRequest(plan, [DOCS], judged('red'))).rejects.toThrow();
    await expect(cleanupSessionRequest(plan, [DOCS], judged('green'))).rejects.toThrow();
    const gone: WorktreesSnapshot = { ...snapshot, repositories: snapshot.repositories.map(repository => ({ ...repository, worktrees: repository.worktrees.filter(row => row.id !== DOCS) })),
      unassigned: snapshot.unassigned.filter(row => row.id !== DOCS) };
    await expect(cleanupSessionRequest(plan, [DOCS], gone)).rejects.toThrow('not in the worktree list');
    await expect(cleanupSessionRequest(plan, [DOCS], snapshot)).resolves.toMatchObject({ ids: [DOCS] });
  });
});

describe('the Worktree page entry', () => {
  const settingsRead = (change: (settings: ReturnType<typeof agentsSettingsFixture>) => ReturnType<typeof agentsSettingsFixture> = settings => settings): AgentsSettingsReader =>
    async () => ({ state: 'ok', settings: change(agentsSettingsFixture(now, 'busy')) });
  const READY: DocSessionsView = { kind: 'ready', refreshFailed: false, list: { protocol: 1, kind: 'operator_docs_sessions', sessions: [] } };

  function Page({ view = worktrees, sessions = READY, read = settingsRead(), start, opened }: {
    readonly view?: WorktreesView; readonly sessions?: DocSessionsView; readonly read?: AgentsSettingsReader;
    readonly start?: CleanupSessionCreateWriter; readonly opened: WorkspaceLocation[];
  }) {
    const cleanup = useWorktreeCleanup(view.kind === 'ready' ? view.snapshot : null, async () => ({ state: 'unreachable' }), () => {});
    const docSessions: DocSessions = { view: sessions, reload() {} };
    return <WorktreesPage view={view} cleanup={cleanup} now={now} t={t} docSessions={docSessions} readAgentsSettings={read}
      startCleanupSession={start ?? (async () => ({ state: 'unreachable' }))} onOpen={next => opened.push(next)} />;
  }
  const entry = () => document.querySelector<HTMLElement>('[data-cleanup-entry]');
  const created: CleanupSessionCreateWriter = async () => ({ state: 'ok', result: { protocol: 1, kind: 'operator_worktree_cleanup_session_created', session_id: CLEANUP_SESSION } });

  test('is hidden unless the session list answered and a yellow row exists', async () => {
    const opened: WorkspaceLocation[] = [];
    for (const sessions of [{ kind: 'absent' }, { kind: 'loading' }, { kind: 'unavailable', reason: 'timeout' }] as const) {
      await render(<Page sessions={sessions} opened={opened} />);
      expect(entry()).toBeNull();
      await unmount();
    }
    const onlyGreen: WorktreesSnapshot = { ...snapshot, repositories: snapshot.repositories.map(repository => ({ ...repository, worktrees: repository.worktrees.filter(row => row.judgment !== 'yellow') })), unassigned: [] };
    await render(<Page view={{ kind: 'ready', snapshot: onlyGreen, refreshFailed: false }} opened={opened} />);
    expect(entry()).toBeNull();
    // The green cleanup stays.
    expect(document.querySelector('[data-clean]')).toBeTruthy();
  });

  test('starts with the default docs agent and opens the new session', async () => {
    const opened: WorkspaceLocation[] = [];
    const bodies: unknown[] = [];
    await render(<Page opened={opened} start={async (body) => { bodies.push(body); return created(body); }} />);
    expect(entry()?.dataset.cleanupEntry).toBe('start');
    expect(entry()?.textContent).toBe('Ask an agent to clean up');
    await click(entry()!);
    await settle();
    expect(bodies).toEqual([{ kind: 'worktree_cleanup', runtime: 'codex', request_id: expect.any(String) }]);
    expect(opened).toEqual([{ workspace: 'cleanup', module: null, item: CLEANUP_SESSION }]);
  });

  test('takes the only docs agent without a default, and links to settings when the choice is open', async () => {
    const opened: WorkspaceLocation[] = [];
    const bodies: { runtime: string }[] = [];
    const start: CleanupSessionCreateWriter = async (body) => { bodies.push(body); return created(body); };
    const only = settingsRead(settings => ({ ...settings, config: { ...settings.config, default_docs: null } }));
    await render(<Page read={only} start={start} opened={opened} />);
    await click(entry()!);
    await settle();
    expect(bodies.map(body => body.runtime)).toEqual(['codex']);
    await unmount();

    const open = settingsRead(settings => ({ ...settings, config: { ...settings.config, default_docs: null, enabled: ['claude', 'codex'], uses: { ...settings.config.uses, docs: ['claude', 'codex'] } } }));
    await render(<Page read={open} start={start} opened={opened} />);
    expect(entry()?.dataset.cleanupEntry).toBe('setup');
    expect(document.querySelector('[data-cleanup-entry="start"]')).toBeNull();
    const link = entry()!.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('#settings');
    await click(link);
    expect(opened.at(-1)).toEqual({ workspace: 'settings', module: null, item: null });
    expect(bodies.length).toBe(1);
  });

  test('a refused start shows the localized reason and opens nothing; an unreadable setting starts nothing', async () => {
    const opened: WorkspaceLocation[] = [];
    const refused: CleanupSessionCreateWriter = async () => ({ state: 'refused', status: 422, refusal: { code: 'runtime_not_enabled', message: 'server text', next_action: 'server action', files: [] } });
    await render(<Page start={refused} opened={opened} />);
    await click(entry()!);
    await settle();
    const failure = one('[data-cleanup-entry-failure]');
    expect(failure.dataset.cleanupEntryFailure).toBe('runtime_not_enabled');
    expect(failure.textContent).toContain(t('docSession.error.runtime_not_enabled.message'));
    expect(failure.textContent).not.toContain('server text');
    expect(opened).toEqual([]);
    await unmount();

    await render(<Page read={async () => ({ state: 'unavailable', reason: 'unreachable' })} opened={opened} />);
    expect(entry()?.dataset.cleanupEntry).toBe('settings-unavailable');
    expect(document.querySelector('[data-cleanup-entry="start"]')).toBeNull();
  });
});
