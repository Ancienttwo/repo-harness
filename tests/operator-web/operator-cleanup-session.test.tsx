import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import type { OperatorDocSessionsV1, DocSessionRefusalV1 } from '../../src/core/operator/doc-session-api';
import { WORKTREE_CLEANUP_MAX_IDS } from '../../src/core/operator/worktree-cleanup';
import {
  decodeOperatorCleanupPlan,
  decodeOperatorCleanupSessionResult,
  type CleanupSessionRequestV1,
  type OperatorCleanupPlanV1,
} from '../../src/core/operator/worktree-cleanup-plan';
import { decodeWorktrees, type WorktreesSnapshot } from '../../src/core/operator/worktrees';
import { agentsSettingsFixture } from '../../src/operator-web/fixtures/settings';
import { CleanupSessionPage } from '../../src/operator-web/CleanupSessionPage';
import { cleanupSessionRequest, type CleanupSessionCreateWriter } from '../../src/operator-web/cleanup-session';
import type { DocSessions, DocSessionWrite, RequestId } from '../../src/operator-web/doc-sessions';
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

const click = (element: Element) => act(async () => { (element as HTMLElement).click(); });
const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const one = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const checkbox = (id: string) => one(`[data-select="${id}"]`) as HTMLInputElement;
const button = () => one('[data-authorize] button') as HTMLButtonElement;
/** The request is built from a digest first, so the answer lands a few turns after the click. */
const approve = async () => { await click(button()); await settle(); };

const now = Date.now();
const snapshot: WorktreesSnapshot = decodeWorktrees(busyWorktrees(now));
const worktrees: WorktreesView = { kind: 'ready', snapshot, refreshFailed: false };
const rowOf = (directory: string) => allWorktrees(snapshot).find(row => row.directory === directory)!;
const GREEN = [rowOf('feat-kanban-status').id, rowOf('operator-site-wt-footer').id];
const OAR = rowOf('repo-harness-wt-oar').id;
const DOCS = rowOf('repo-harness-wt-docs-cleanup').id;
const RED = rowOf('repo-harness-wt-kanban-redesign').id;

async function busyPlan(): Promise<OperatorCleanupPlanV1> {
  const read = await fixtureProps('busy').readCleanupPlan!(CLEANUP_SESSION, new AbortController().signal);
  if (read.state !== 'ok') throw new Error(`plan ${read.state}`);
  return read.value;
}

const docSessions: DocSessions = {
  view: { kind: 'ready', refreshFailed: false, list: { protocol: 1, kind: 'operator_docs_sessions', kinds: ['docs', 'worktree_cleanup'], sessions: [], observed_at: new Date(now).toISOString() } as OperatorDocSessionsV1 },
  reload() {},
};

const resultBody = (archive: unknown, items: readonly [string, 'removed' | 'skipped' | 'failed', string | null][]) => decodeOperatorCleanupSessionResult({
  protocol: 1, kind: 'operator_worktree_cleanup_session', session_id: CLEANUP_SESSION, archive,
  items: items.map(([id, outcome, reason]) => {
    const row = allWorktrees(snapshot).find(entry => entry.id === id)!;
    return { id, repository_id: row.repository_id, directory: row.directory, outcome, reason };
  }),
}, CLEANUP_SESSION);
const PULL = { number: 1210, url: 'https://github.com/Ancienttwo/repo-harness/pull/1210' };
const ARCHIVED = { state: 'done', failed_step: null, pull_request: PULL };
const NO_ARCHIVE = { state: 'not_needed', failed_step: null, pull_request: null };

type Answer = DocSessionWrite<ReturnType<typeof resultBody>>;

/** Mounts the page against the busy fixture plan; `answers` are served in order, one per approval request. */
async function mountPage(plan: OperatorCleanupPlanV1, answers: readonly Answer[] = [], view: WorktreesView = worktrees) {
  const requests: (CleanupSessionRequestV1 & RequestId)[] = [];
  let reloads = 0;
  const container = await render(
    <CleanupSessionPage sessionId={CLEANUP_SESSION} readEvents={fixtureProps('busy').readDocSessionEvents!}
      readPlan={async () => ({ state: 'ok', value: plan })}
      writeCleanup={async (body) => { requests.push(body); return answers[requests.length - 1] ?? { state: 'unreachable' }; }}
      worktrees={view} reloadWorktrees={() => { reloads += 1; }} generation={0} t={t} />,
  );
  return { container, requests, reloads: () => reloads };
}

describe('worktree cleanup session page', () => {
  test('5-WTC-P1: green defaults checked, yellow unchecked, each yellow item shows its advice, evidence, loss and archive; approving sends the exact request', async () => {
    const plan = await busyPlan();
    const { requests } = await mountPage(plan, [{ state: 'ok', result: resultBody(ARCHIVED, [...GREEN, OAR].map(id => [id, 'removed', null] as const)) }]);

    expect(all('[data-plan-group]').map(group => [group.dataset.planGroup, group.dataset.count])).toEqual([['green', '2'], ['yellow', '2'], ['red', '1']]);
    expect(GREEN.map(id => checkbox(id).checked)).toEqual([true, true]);
    expect([OAR, DOCS].map(id => checkbox(id).checked)).toEqual([false, false]);
    expect(button().textContent).toBe('Approve and run 2');

    const oar = one(`[data-plan-item="${OAR}"]`);
    expect(oar.querySelector('[data-advice]')?.getAttribute('data-advice')).toBe('archive_then_delete');
    expect(oar.textContent).toContain('Agent advice: Archive, then delete');
    expect(oar.querySelector('[data-reason-text]')?.textContent).toContain('PR #602 was closed without a merge');
    expect([...oar.querySelectorAll('[data-evidence] li')].map(li => li.textContent)).toEqual(['PR #602 closed, not merged', 'docs/notes/oar-0-45.md is only on this branch']);
    expect(oar.querySelector('[data-loss]')?.textContent).toBe('Would lose: nothing');
    expect(oar.querySelector('[data-archive]')?.textContent).toBe('Archive branch docs/archive-oar-0-45, with a Draft PR');
    expect(one(`[data-plan-item="${DOCS}"] [data-advice]`).getAttribute('data-advice')).toBe('delete');

    // Green only: the archive steps do not apply. Checking the archived item adds them, and the count follows.
    expect(one('[data-steps]').dataset.steps).toBe('remove');
    await click(checkbox(OAR));
    expect(button().textContent).toBe('Approve and run 3');
    expect(one('[data-steps]').dataset.steps).toBe('commit,push,pull_request,remove');
    expect(one('[data-frees]').textContent).toContain('GB');
    // Before and after: the unchecked bars are drawn from the same rows, and the after bar is shorter.
    const widths = ['before', 'after'].map(which => parseFloat(one(`[data-disk="${which}"] [data-disk-bar]`).style.width));
    expect(widths[0]).toBe(100);
    expect(widths[1]).toBeLessThan(widths[0]!);

    await approve();
    expect(requests.length).toBe(1);
    const { request_id, ...body } = requests[0]!;
    expect(request_id).toMatch(/^[0-9a-f-]{36}$/u);
    const ids = [...GREEN, OAR].sort();
    expect(body).toEqual({
      session_id: CLEANUP_SESSION, ids,
      expected_digest: await selectionDigest(allWorktrees(snapshot).filter(row => ids.includes(row.id))),
      approvals: [{ id: OAR, loss_sha256: plan.items.find(item => item.id === OAR)!.loss_sha256, plan_sha256: plan.plan_sha256! }],
    });
    // Ids and digests only: no directory, no path, no red id.
    const wire = JSON.stringify(requests[0]);
    expect(wire).not.toMatch(/repo-harness-wt|feat-kanban|docs\/archive/u);
    expect(wire).not.toContain(RED);

    expect(one('[data-archive-state="done"] a').getAttribute('href')).toBe(PULL.url);
    expect(all('[data-item-outcome="removed"]').length).toBe(3);
    // A removed item cannot be checked again, and nothing is left to approve.
    expect(checkbox(OAR).disabled).toBe(true);
    expect(button().disabled).toBe(true);
  });

  test('5-WTC-N1: the record shows only categories while the agent investigates; a red item has no checkbox; the agent has no archive or delete control', async () => {
    const plan = await busyPlan();
    const investigating = decodeOperatorCleanupPlan({ ...plan, agent: 'running', state: 'investigating', plan_sha256: null, items: [] }, CLEANUP_SESSION);
    await mountPage(investigating);
    expect(one('[data-investigating]')).toBeTruthy();
    expect(all('input[type="checkbox"]').length).toBe(0);
    expect(document.querySelector('[data-authorize]')).toBeNull();
    expect(document.querySelector('[data-plan-group]')).toBeNull();
    expect(one('[data-conversation] [data-message="agent"]').textContent).toContain('Codex');

    await click(one('[data-tool-fold] button'));
    expect(all('[data-tool]').map(tool => tool.dataset.tool)).toEqual(['command', 'read']);
    const record = one('[data-session-record]').textContent!;
    expect(record).toContain('Run');
    expect(record).not.toMatch(/git |--porcelain|\/Users\/|\/tmp\//u);

    await act(async () => root?.unmount());
    root = null;
    await mountPage(plan);
    const red = one(`[data-plan-item="${RED}"]`);
    expect(red.querySelector('input')).toBeNull();
    expect(red.querySelector('[data-loss]')).toBeNull();
    expect(one('[data-plan-group="red"]').textContent).toContain('In use');
    // Three groups of items hold two, two and no checkboxes; only the sender is a button.
    expect(all('input[type="checkbox"]').length).toBe(4);
    expect(all('button').map(item => item.textContent).filter(text => /archive|delete|remove/iu.test(text ?? '') && !/^Approve and run/u.test(text ?? ''))).toEqual([]);
  });

  test('5-WTC-F1: an item whose loss changed is skipped and marked, stays unchecked, and the rest run', async () => {
    const plan = await busyPlan();
    const { requests } = await mountPage(plan, [{ state: 'ok', result: resultBody(ARCHIVED, [
      [GREEN[0]!, 'removed', null], [GREEN[1]!, 'removed', null], [OAR, 'skipped', 'reapproval_required'],
    ]) }]);
    await click(checkbox(OAR));
    await approve();
    expect(requests[0]!.approvals.map(approval => approval.id)).toEqual([OAR]);

    const oar = one(`[data-plan-item="${OAR}"]`);
    expect(oar.querySelector('[data-item-outcome]')?.getAttribute('data-reason')).toBe('reapproval_required');
    expect(oar.querySelector('[data-reapprove]')?.textContent).toBe('Approve again');
    expect(checkbox(OAR).checked).toBe(false);
    expect(checkbox(OAR).disabled).toBe(false);
    expect(GREEN.map(id => one(`[data-plan-item="${id}"] [data-item-outcome]`).dataset.itemOutcome)).toEqual(['removed', 'removed']);
    expect(button().disabled).toBe(true);
    // Approving it again is a new choice on the same plan.
    await click(checkbox(OAR));
    expect(button().textContent).toBe('Approve and run 1');
  });

  test('5-WTC-F2: a failed archive names the step, keeps the archived worktree, and retries as a new request', async () => {
    const plan = await busyPlan();
    const failed = { state: 'failed', failed_step: 'push', pull_request: null };
    const { requests } = await mountPage(plan, [
      { state: 'ok', result: resultBody(failed, [[GREEN[0]!, 'removed', null], [GREEN[1]!, 'removed', null], [OAR, 'skipped', 'archive_failed']]) },
      { state: 'ok', result: resultBody(ARCHIVED, [[OAR, 'removed', null]]) },
    ]);
    await click(checkbox(OAR));
    await approve();

    const banner = one('[data-archive-state="failed"]');
    expect(banner.dataset.failedStep).toBe('push');
    expect(banner.textContent).toContain('Archiving stopped at: Push. No archived worktree was removed.');
    expect(one(`[data-plan-item="${OAR}"] [data-item-outcome]`).dataset.reason).toBe('archive_failed');
    expect(document.querySelector('[data-archive-state="done"]')).toBeNull();
    // The archived worktree stays checked, so the retry carries the same approval.
    expect(checkbox(OAR).checked).toBe(true);

    await click([...banner.querySelectorAll('button')].find(item => item.textContent === 'Retry')!);
    await settle();
    expect(requests.length).toBe(2);
    expect(requests[1]!.ids).toEqual([OAR]);
    expect(requests[1]!.approvals).toEqual(requests[0]!.approvals);
    expect(requests[1]!.request_id).not.toBe(requests[0]!.request_id);
    expect(one('[data-archive-state="done"] a').getAttribute('href')).toBe(PULL.url);
    expect(document.querySelector('[data-archive-state="failed"]')).toBeNull();
    expect(one(`[data-plan-item="${OAR}"] [data-item-outcome]`).dataset.itemOutcome).toBe('removed');
  });

  test('an advice to keep can still be checked, and says the agent advised keeping it', async () => {
    const plan = await busyPlan();
    const keep = decodeOperatorCleanupPlan({ ...plan, items: plan.items.map(item => item.id === DOCS ? { ...item, advice: 'keep', reason: 'A teammate still uses the lock.' } : item) }, CLEANUP_SESSION);
    const { requests } = await mountPage(keep, [{ state: 'ok', result: resultBody(NO_ARCHIVE, [...GREEN, DOCS].map(id => [id, 'removed', null] as const)) }]);
    const item = one(`[data-plan-item="${DOCS}"]`);
    expect(item.querySelector('[data-advice-keep]')?.textContent).toBe('The agent advised keeping this one. You can still check it to remove it.');
    expect(checkbox(DOCS).checked).toBe(false);
    await click(checkbox(DOCS));
    await approve();
    expect(requests[0]!.approvals.map(approval => approval.id)).toEqual([DOCS]);
    // No archive item is selected, so the page claims no Draft PR.
    expect(document.querySelector('[data-archive-state]')).toBeNull();
  });

  test('the plan and the live collector must agree: a plan-yellow item that the rows mark red is not selectable and is never sent', async () => {
    const plan = await busyPlan();
    const judged = (judgment: 'red' | 'green'): WorktreesSnapshot => {
      const change = (row: WorktreesSnapshot['unassigned'][number]) => row.id === DOCS ? { ...row, judgment, reasons: judgment === 'red' ? ['dirty' as const] : [] } : row;
      return { ...snapshot, repositories: snapshot.repositories.map(repository => ({ ...repository, worktrees: repository.worktrees.map(change) })), unassigned: snapshot.unassigned.map(change) };
    };
    const turnedRed = judged('red');

    // The builder refuses an item the live rows do not judge as the plan did, in both directions.
    await expect(cleanupSessionRequest(plan, [DOCS], turnedRed)).rejects.toThrow();
    await expect(cleanupSessionRequest(plan, [DOCS], judged('green'))).rejects.toThrow();
    await expect(cleanupSessionRequest(plan, [DOCS], snapshot)).resolves.toMatchObject({ ids: [DOCS] });

    const { requests } = await mountPage(plan, [{ state: 'ok', result: resultBody(NO_ARCHIVE, GREEN.map(id => [id, 'removed', null] as const)) }], { kind: 'ready', snapshot: turnedRed, refreshFailed: false });
    expect([checkbox(DOCS).disabled, checkbox(DOCS).checked]).toEqual([true, false]);
    await click(checkbox(DOCS));
    await approve();
    expect(requests.length).toBe(1);
    expect(requests[0]!.ids).toEqual([...GREEN].sort());
    expect(requests[0]!.ids).not.toContain(DOCS);
    expect(requests[0]!.approvals).toEqual([]);
  });

  test('the button is off at zero and above the id limit', async () => {
    const plan = await busyPlan();
    const { requests } = await mountPage(plan);
    for (const id of GREEN) await click(checkbox(id));
    expect([button().textContent, button().disabled]).toEqual(['Approve and run 0', true]);
    await act(async () => root?.unmount());
    root = null;

    // More green items than one request may carry; the collector lists each of them.
    const extra = Array.from({ length: WORKTREE_CLEANUP_MAX_IDS - 1 }, (_, index) => ({ ...rowOf('feat-kanban-status'), id: `wt_${(index + 1).toString(16).padStart(64, '0')}`, directory: `extra-${index}` }));
    const crowded: WorktreesView = { kind: 'ready', refreshFailed: false, snapshot: { ...snapshot, unassigned: [...snapshot.unassigned, ...extra] } };
    const many = decodeOperatorCleanupPlan({
      ...plan, items: [...plan.items, ...extra.map(row => ({ ...plan.items[0]!, id: row.id, directory: row.directory }))],
    }, CLEANUP_SESSION);
    await mountPage(many, [], crowded);
    expect(all('[data-plan-item][data-judgment="green"] input:checked').length).toBe(WORKTREE_CLEANUP_MAX_IDS + 1);
    expect([button().textContent, button().disabled]).toEqual([`Approve and run ${WORKTREE_CLEANUP_MAX_IDS + 1}`, true]);
    expect(one('[data-clean-limit]').textContent).toContain(String(WORKTREE_CLEANUP_MAX_IDS));
    expect(requests.length).toBe(0);
  });

  test('a refusal shows its reason and action, and reselect reads again and restores the defaults', async () => {
    const plan = await busyPlan();
    const refusal = (code: string): Answer => ({ state: 'refused', status: 409, refusal: { code, message: `${code} server text`, next_action: `${code} server action`, paths: [] } satisfies DocSessionRefusalV1 });
    const codes = ['digest_changed', 'loss_changed', 'not_approved', 'in_use'] as const;
    const { requests, reloads } = await mountPage(plan, codes.map(refusal));
    for (const code of codes) {
      await approve();
      const banner = one(`[data-cleanup-result="${code}"]`);
      expect(banner.textContent).toContain(t(`worktrees.error.${code}.message`));
      expect(banner.textContent).toContain(t(`worktrees.error.${code}.action`));
      expect(banner.textContent).not.toContain('server text');
      expect(document.querySelector('[data-cleanup-result="answered"]')).toBeNull();
      expect(all('[data-item-outcome]').length).toBe(0);
    }
    expect(requests.length).toBe(4);
    const before = reloads();
    await click(one('[data-cleanup-result] button'));
    expect(reloads()).toBeGreaterThan(before);
    expect(document.querySelector('[data-cleanup-result]')).toBeNull();
  });

  test('an unanswered request claims no success', async () => {
    const plan = await busyPlan();
    await mountPage(plan, [{ state: 'unreachable' }, { state: 'unreadable' }]);
    await approve();
    expect(one('[data-cleanup-result="unreachable"]').textContent).toContain(t('worktrees.unreachable'));
    expect(all('[data-item-outcome]').length).toBe(0);
    await approve();
    expect(one('[data-cleanup-result="unreadable"]').textContent).toContain(t('worktrees.unreadable'));
    expect(all('[data-item-outcome]').length).toBe(0);
  });

  test('the approval is off while the collector rows are unavailable', async () => {
    const plan = await busyPlan();
    const mounted = await render(
      <CleanupSessionPage sessionId={CLEANUP_SESSION} readEvents={fixtureProps('busy').readDocSessionEvents!}
        readPlan={async () => ({ state: 'ok', value: plan })} writeCleanup={async () => ({ state: 'unreachable' })}
        worktrees={{ kind: 'unreachable' }} reloadWorktrees={() => {}} generation={0} t={t} />,
    );
    expect(mounted.querySelector('[data-worktrees-unavailable]')).toBeTruthy();
    expect(button().disabled).toBe(true);
  });
});

describe('the Worktree page entry', () => {
  const settingsRead = (change: (settings: ReturnType<typeof agentsSettingsFixture>) => ReturnType<typeof agentsSettingsFixture> = settings => settings): AgentsSettingsReader =>
    async () => ({ state: 'ok', settings: change(agentsSettingsFixture(now, 'busy')) });
  const sessions = (kinds: readonly ('docs' | 'worktree_cleanup')[]): DocSessions => ({
    view: { kind: 'ready', refreshFailed: false, list: { ...(docSessions.view as { list: OperatorDocSessionsV1 }).list, kinds } }, reload() {},
  });

  function Page({ view = worktrees, kinds, read = settingsRead(), start, opened }: {
    readonly view?: WorktreesView; readonly kinds: readonly ('docs' | 'worktree_cleanup')[]; readonly read?: AgentsSettingsReader;
    readonly start?: CleanupSessionCreateWriter; readonly opened: WorkspaceLocation[];
  }) {
    const cleanup = useWorktreeCleanup(view.kind === 'ready' ? view.snapshot : null, async () => ({ state: 'unreachable' }), () => {});
    return <WorktreesPage view={view} cleanup={cleanup} now={now} t={t} docSessions={sessions(kinds)} readAgentsSettings={read}
      startCleanupSession={start ?? (async () => ({ state: 'unreachable' }))} onOpen={next => opened.push(next)} />;
  }
  const entry = () => document.querySelector<HTMLElement>('[data-cleanup-entry]');
  const created: CleanupSessionCreateWriter = async () => ({ state: 'ok', result: { protocol: 1, kind: 'operator_worktree_cleanup_session_created', session_id: CLEANUP_SESSION } });

  test('is hidden unless the server starts worktree_cleanup sessions and a yellow row exists', async () => {
    const opened: WorkspaceLocation[] = [];
    await render(<Page kinds={['docs']} opened={opened} />);
    expect(entry()).toBeNull();
    await act(async () => root?.unmount());
    root = null;
    const onlyGreen: WorktreesSnapshot = { ...snapshot, repositories: snapshot.repositories.map(repository => ({ ...repository, worktrees: repository.worktrees.filter(row => row.judgment !== 'yellow') })), unassigned: [] };
    await render(<Page kinds={['docs', 'worktree_cleanup']} view={{ kind: 'ready', snapshot: onlyGreen, refreshFailed: false }} opened={opened} />);
    expect(entry()).toBeNull();
    // The green cleanup stays.
    expect(document.querySelector('[data-clean]')).toBeTruthy();
  });

  test('starts with the default docs agent and opens the new session', async () => {
    const opened: WorkspaceLocation[] = [];
    const bodies: unknown[] = [];
    await render(<Page kinds={['docs', 'worktree_cleanup']} opened={opened} start={async (body) => { bodies.push(body); return created(body); }} />);
    expect(entry()?.dataset.cleanupEntry).toBe('start');
    expect(entry()?.textContent).toBe('Ask an agent to clean up');
    await click(entry()!);
    expect(bodies).toEqual([{ kind: 'worktree_cleanup', runtime: 'codex', request_id: expect.any(String) }]);
    expect(opened).toEqual([{ workspace: 'cleanup', module: null, item: CLEANUP_SESSION }]);
  });

  test('takes the only docs agent without a default, and links to settings when the choice is open', async () => {
    const opened: WorkspaceLocation[] = [];
    const bodies: { runtime: string }[] = [];
    const start: CleanupSessionCreateWriter = async (body) => { bodies.push(body); return created(body); };
    const only = settingsRead(settings => ({ ...settings, config: { ...settings.config, default_docs: null } }));
    await render(<Page kinds={['worktree_cleanup']} read={only} start={start} opened={opened} />);
    await click(entry()!);
    expect(bodies.map(body => body.runtime)).toEqual(['codex']);
    await act(async () => root?.unmount());
    root = null;

    const open = settingsRead(settings => ({ ...settings, config: { ...settings.config, default_docs: null, enabled: ['claude', 'codex'], uses: { ...settings.config.uses, docs: ['claude', 'codex'] } } }));
    await render(<Page kinds={['worktree_cleanup']} read={open} start={start} opened={opened} />);
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
    const refused: CleanupSessionCreateWriter = async () => ({ state: 'refused', status: 422, refusal: { code: 'runtime_not_enabled', message: 'server text', next_action: 'server action', paths: [] } });
    await render(<Page kinds={['worktree_cleanup']} start={refused} opened={opened} />);
    await click(entry()!);
    const failure = one('[data-cleanup-entry-failure]');
    expect(failure.dataset.cleanupEntryFailure).toBe('runtime_not_enabled');
    expect(failure.textContent).toContain(t('docSession.error.runtime_not_enabled.message'));
    expect(failure.textContent).not.toContain('server text');
    expect(opened).toEqual([]);
    await act(async () => root?.unmount());
    root = null;

    await render(<Page kinds={['worktree_cleanup']} read={async () => ({ state: 'unavailable', reason: 'unreachable' })} opened={opened} />);
    expect(entry()?.dataset.cleanupEntry).toBe('settings-unavailable');
    expect(document.querySelector('[data-cleanup-entry="start"]')).toBeNull();
  });
});
