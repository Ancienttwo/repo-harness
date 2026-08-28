import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import {
  asApiError,
  copyOperatorIdentifier,
  fetchOperatorSnapshot,
  groupWorklist,
  OperatorApp,
  primaryCause,
  taskDisplayLabel,
  taskKey,
} from '../../src/operator-web/App';
import { degradedSnapshot, fixtureTasks, stableSnapshot } from '../../src/operator-web/fixture';
import {
  localeFromNavigatorLanguage,
  OPERATOR_LOCALE_STORAGE_KEY,
  readStoredLocale,
  relativeAge,
  resolveInitialLocale,
  translate,
  writeStoredLocale,
} from '../../src/operator-web/i18n';
import {
  decodeOperatorFleetSnapshot,
  projectSnapshotViewState,
  type OperatorFleetSnapshotV1,
} from '../../src/operator-web/types';

let root: Root | null = null;
let window: Window;

/**
 * `matchMedia` is stubbed rather than driven by a viewport size so the modal and
 * the persistent-pane layouts are both asserted deterministically.
 */
function installDom(wide = false): void {
  window = new Window({ url: 'http://127.0.0.1:4318/' });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({
      matches: wide,
      media,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => true,
    }),
  });
  Object.assign(globalThis, {
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
}

function buttonWithText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!(button instanceof window.HTMLButtonElement)) throw new Error(`button not found: ${text}`);
  return button as unknown as HTMLButtonElement;
}

async function mount(node: React.ReactElement): Promise<void> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
}

function paneText(): string {
  return document.querySelector('.detail-pane')?.textContent ?? '';
}

beforeEach(() => {
  installDom();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  window.close();
});

describe('operator web worklist projection', () => {
  test('assigns groups by who must act and keeps unclassified out of a collapsed group', () => {
    const groups = groupWorklist(stableSnapshot);
    const byId = Object.fromEntries(groups.map((group) => [group.id, group.cards.map((card) => card.task_id)]));

    expect(groups.map((group) => group.id)).toEqual([
      'needs_you',
      'ready_to_merge',
      'unreadable',
      'unclassified',
      'agent_working',
      'external',
      'done',
    ]);
    expect(byId.needs_you).toEqual([
      fixtureTasks.console.task_id,
      fixtureTasks.available.task_id,
      fixtureTasks.blocked.task_id,
    ]);
    expect(byId.ready_to_merge).toEqual([fixtureTasks.ready.task_id]);
    expect(byId.external).toEqual([fixtureTasks.review.task_id]);
    expect(byId.agent_working).toEqual([fixtureTasks.working.task_id]);
    expect(byId.done).toEqual([fixtureTasks.done.task_id]);

    const externalUnclassified = {
      ...stableSnapshot,
      repositories: [{
        ...stableSnapshot.repositories[0],
        cards: [{ ...stableSnapshot.repositories[0].cards[2], column: null }],
      }],
    } as OperatorFleetSnapshotV1;
    const regrouped = groupWorklist(externalUnclassified);
    expect(regrouped.find((group) => group.id === 'unclassified')?.count).toBe(1);
    expect(regrouped.find((group) => group.id === 'external')?.count).toBe(0);
  });

  test('sorts a group by repository then task index, with unindexed rows last', () => {
    const [needsYou] = groupWorklist(stableSnapshot);
    expect(needsYou.cards.map((card) => [card.repository_id, card.task_index])).toEqual([
      ['repo-console', fixtureTasks.console.task_index],
      ['repo-harness', fixtureTasks.available.task_index],
      ['repo-harness', fixtureTasks.blocked.task_index],
    ]);

    const unindexed = { ...stableSnapshot.repositories[0].cards[0], task_index: null };
    const sorted = groupWorklist({
      ...stableSnapshot,
      repositories: [{ ...stableSnapshot.repositories[0], cards: [unindexed, stableSnapshot.repositories[0].cards[5]] }],
    } as OperatorFleetSnapshotV1);
    expect(sorted[0].cards.map((card) => card.task_index)).toEqual([fixtureTasks.blocked.task_index, null]);
  });

  test('ranks one cause per row: user blocker, then stalled feedback, then external, then unread', () => {
    const cards = stableSnapshot.repositories[0].cards;
    const blocked = cards[5];
    const review = cards[2];
    const [consoleCard] = stableSnapshot.repositories[1].cards;

    expect(primaryCause(blocked)).toEqual({
      kind: 'blocker',
      blocker: { code: 'base_moved_since_verification', attention_owner: 'user' },
    });
    expect(primaryCause(consoleCard)).toEqual({ kind: 'no_progress' });
    expect(primaryCause(review)).toEqual({
      kind: 'blocker',
      blocker: { code: 'provider_unavailable', attention_owner: 'external' },
    });
    expect(primaryCause(cards[0])).toEqual({ kind: 'unread', count: 1 });
    expect(primaryCause(cards[4])).toBeNull();
  });

  test('falls back to a 12 character task id when the sprint row carries no label', () => {
    const labelled = taskDisplayLabel(stableSnapshot.repositories[0].cards[0]);
    const unlabelled = taskDisplayLabel({ ...stableSnapshot.repositories[0].cards[0], task_label: null });

    expect(labelled).toEqual({ text: fixtureTasks.available.task_label, isLabel: true });
    expect(unlabelled).toEqual({ text: fixtureTasks.available.task_id.slice(0, 12), isLabel: false });
    expect(unlabelled.text.length).toBe(12);
  });

  test('selection identity ignores the task revision', () => {
    const card = stableSnapshot.repositories[0].cards[0];
    expect(taskKey(card)).toBe(`repo-harness:${fixtureTasks.available.task_id}`);
    expect(taskKey({ ...card, task_revision: 'rev-next' })).toBe(taskKey(card));
  });
});

describe('operator web interactions', () => {
  test('renders the plain-language cause with its raw code and expands a collapsed group on demand', async () => {
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);

    const worklist = document.querySelector('.worklist')?.textContent ?? '';
    expect(worklist).toContain('The base branch moved after verification');
    expect(worklist).toContain('base_moved_since_verification');
    expect(worklist).toContain('no progress');
    expect(worklist).not.toContain(fixtureTasks.review.task_label);

    await act(async () => buttonWithText('External').click());
    expect(document.querySelector('.worklist')?.textContent).toContain(fixtureTasks.review.task_label);
  });

  test('pane owns modal focus, traps Tab, closes on Escape, and restores the trigger', async () => {
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);

    const trigger = buttonWithText(fixtureTasks.blocked.task_label);
    trigger.focus();
    await act(async () => trigger.click());

    const dialog = document.querySelector('[role="dialog"]');
    const close = document.querySelector<HTMLButtonElement>('.detail-pane [aria-label="Close task details"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('detail-pane-title');
    expect(document.activeElement).toBe(close);

    const focusable = Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []);
    const last = focusable.at(-1);
    last?.focus();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }) as unknown as Event);
    expect(document.activeElement).toBe(close);

    await act(async () => {
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event);
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test('detail pane shows every blocker, the no-progress flag, and its repair actions as text', async () => {
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);

    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    const blockedPane = paneText();
    expect(blockedPane).toContain('The base branch moved after verification');
    expect(blockedPane).toContain('base_moved_since_verification');
    expect(blockedPane).toContain('Checks are still running');
    expect(blockedPane).toContain('checks_pending');
    expect(blockedPane).toContain('you owns this');
    expect(blockedPane).toContain('external owns this');
    expect(document.querySelector('.detail-pane [data-slot="composer"]')?.textContent).toBe('');

    const close = document.querySelector<HTMLButtonElement>('.detail-pane [aria-label="Close task details"]');
    if (!close) throw new Error('close button not found');
    await act(async () => close.click());
    await act(async () => buttonWithText(fixtureTasks.console.task_label).click());
    const consolePane = paneText();
    expect(consolePane).toContain('Feedback reports no progress');
    expect(consolePane).toContain('Resume with the same owner.');
    expect(consolePane).toContain('Take the task over explicitly.');
    expect(document.querySelectorAll('.repair-list button').length).toBe(0);
  });

  test('copies full task, publication, and head identifiers', async () => {
    const copied: string[] = [];
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => { copied.push(value); } },
    });
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);

    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    const expectedHead = '0123456789abcdef0123456789abcdef01234567';
    expect(paneText()).toContain(expectedHead);

    for (const label of ['Copy task id', 'Copy publication', 'Copy head sha']) {
      const copy = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
      if (!copy) throw new Error(`copy button not found: ${label}`);
      await act(async () => copy.click());
    }
    expect(copied).toEqual([fixtureTasks.blocked.task_id, 'pub-blocked', expectedHead]);
    expect(paneText()).toContain('head sha copied');
  });

  test('clipboard failure is explicit and fail-closed', async () => {
    expect(await copyOperatorIdentifier('task-1', null)).toBe(false);
    expect(await copyOperatorIdentifier('task-1', { writeText: async () => { throw new Error('denied'); } })).toBe(false);
  });

  test('preserves typed 503 direct and envelope errors without semantic guessing', async () => {
    const direct = {
      code: 'operator_api_unavailable',
      message: 'Fleet provider is offline',
      next_action: 'Start the provider, then retry.',
    } as const;
    expect(asApiError(direct)).toBe(direct);
    expect(asApiError({ error: direct })).toBe(direct);
    expect(asApiError({ message: 'not a typed API error' }).code).toBe('operator_api_unavailable');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: direct }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
    try {
      await expect(fetchOperatorSnapshot()).rejects.toMatchObject(direct);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('rejects malformed nested payloads before they reach React rendering', async () => {
    const malformed = structuredClone(stableSnapshot) as unknown as Record<string, unknown>;
    const repositories = malformed.repositories as Array<Record<string, unknown>>;
    const cards = repositories[0].cards as Array<Record<string, unknown>>;
    const feedback = cards[0].feedback as Record<string, unknown>;
    feedback.pending_count = 'one';
    expect(() => decodeOperatorFleetSnapshot(malformed)).toThrow('Fleet snapshot response is invalid');

    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        fetchSnapshot={async () => decodeOperatorFleetSnapshot(malformed)}
      />,
    );
    await act(async () => buttonWithText('Refresh').click());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(document.querySelector('[data-state="stale"]')).not.toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Fleet snapshot response is invalid');
    expect(document.querySelector('.statusbar-fact--age.is-stale')).not.toBeNull();
  });

  test('decodes the sprint task label and index and fails closed on a malformed one', () => {
    const decoded = decodeOperatorFleetSnapshot(structuredClone(stableSnapshot));
    expect(decoded.repositories[0]?.cards[2]).toMatchObject({
      task_id: fixtureTasks.review.task_id,
      task_label: fixtureTasks.review.task_label,
      task_index: fixtureTasks.review.task_index,
    });

    const unlabelled = structuredClone(stableSnapshot) as unknown as Record<string, unknown>;
    const unlabelledCards = ((unlabelled.repositories as Array<Record<string, unknown>>)[0].cards as Array<Record<string, unknown>>);
    unlabelledCards[2].task_label = null;
    unlabelledCards[2].task_index = null;
    expect(decodeOperatorFleetSnapshot(unlabelled).repositories[0]?.cards[2]).toMatchObject({
      task_label: null,
      task_index: null,
    });

    for (const mutate of [
      (cards: Array<Record<string, unknown>>) => { cards[2].task_label = ''; },
      (cards: Array<Record<string, unknown>>) => { cards[2].task_label = 7; },
      (cards: Array<Record<string, unknown>>) => { delete cards[2].task_label; },
      (cards: Array<Record<string, unknown>>) => { cards[2].task_index = '3'; },
      (cards: Array<Record<string, unknown>>) => { cards[2].task_index = 1.5; },
    ]) {
      const malformed = structuredClone(stableSnapshot) as unknown as Record<string, unknown>;
      mutate(((malformed.repositories as Array<Record<string, unknown>>)[0].cards as Array<Record<string, unknown>>));
      expect(() => decodeOperatorFleetSnapshot(malformed)).toThrow('Fleet snapshot response is invalid');
    }
  });

  test('reconstructs a closed browser payload and rejects malformed digest and Git OID fields', () => {
    const withExtras = structuredClone(stableSnapshot) as unknown as Record<string, unknown>;
    const repositories = withExtras.repositories as Array<Record<string, unknown>>;
    const cards = repositories[0].cards as Array<Record<string, unknown>>;
    const readiness = cards[2].merge_readiness as Record<string, unknown>;
    const blockers = readiness.blockers as Array<Record<string, unknown>>;
    const counts = withExtras.counts as Record<string, unknown>;
    const feedback = cards[2].feedback as Record<string, unknown>;
    const inbox = cards[2].inbox as Record<string, unknown>;
    withExtras.future_secret = 'root-secret';
    repositories[0].future_secret = 'repository-secret';
    cards[2].future_secret = 'card-secret';
    readiness.future_secret = 'readiness-secret';
    blockers[0].future_secret = 'blocker-secret';
    counts.future_secret = 'counts-secret';
    feedback.future_secret = 'feedback-secret';
    inbox.future_secret = 'inbox-secret';

    const decoded = decodeOperatorFleetSnapshot(withExtras);
    expect(JSON.stringify(decoded)).not.toContain('future_secret');
    expect(decoded).not.toBe(withExtras);
    expect(decoded.repositories[0]).not.toBe(repositories[0]);
    expect(decoded.repositories[0]?.cards[2]).not.toBe(cards[2]);

    const degradedWithExtra = structuredClone(degradedSnapshot) as unknown as Record<string, unknown>;
    const degradedRepositories = degradedWithExtra.repositories as Array<Record<string, unknown>>;
    (degradedRepositories.at(-1)?.error as Record<string, unknown>).future_secret = 'error-secret';
    expect(JSON.stringify(decodeOperatorFleetSnapshot(degradedWithExtra))).not.toContain('error-secret');

    for (const mutate of [
      (payload: Record<string, unknown>) => { payload.registry_revision = 'registry-not-a-digest'; },
      (payload: Record<string, unknown>) => {
        const nestedCards = ((payload.repositories as Array<Record<string, unknown>>)[0].cards as Array<Record<string, unknown>>);
        nestedCards[2].head_sha = 'not-a-git-oid';
      },
      (payload: Record<string, unknown>) => {
        const nestedCards = ((payload.repositories as Array<Record<string, unknown>>)[0].cards as Array<Record<string, unknown>>);
        (nestedCards[2].merge_readiness as Record<string, unknown>).expected_base_sha = 'short';
      },
    ]) {
      const malformed = structuredClone(stableSnapshot) as unknown as Record<string, unknown>;
      mutate(malformed);
      expect(() => decodeOperatorFleetSnapshot(malformed)).toThrow('Fleet snapshot response is invalid');
    }
  });

  test('a new task revision keeps the pane open and says so; a removed task closes it', async () => {
    const nextSnapshot = (revision: string | null): OperatorFleetSnapshotV1 => ({
      ...stableSnapshot,
      sequence: stableSnapshot.sequence + 1,
      repositories: stableSnapshot.repositories.map((repository) => ({
        ...repository,
        cards: repository.cards.flatMap((card) => {
          if (card.task_id !== fixtureTasks.blocked.task_id) return [card];
          if (revision === null) return [];
          return [{ ...card, task_revision: revision }];
        }),
      })),
    });

    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        fetchSnapshot={async () => nextSnapshot('rev-blocked-next')}
      />,
    );
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    await act(async () => buttonWithText('Refresh').click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(paneText()).toContain('Task definition changed since last snapshot');
    expect(paneText()).toContain('rev-blocked-next');
    await act(async () => root?.unmount());
    root = null;

    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        fetchSnapshot={async () => nextSnapshot(null)}
      />,
    );
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => buttonWithText('Refresh').click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test('defaults to English, switches to Chinese, and remembers the choice', async () => {
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} />);

    expect(document.querySelector('.operator-app')?.getAttribute('data-locale')).toBe('en');
    expect(document.body.textContent).toContain('Worklist');
    expect(document.body.textContent).toContain('Needs you');

    await act(async () => buttonWithText('中').click());
    const text = document.body.textContent ?? '';
    expect(document.querySelector('.operator-app')?.getAttribute('data-locale')).toBe('zh');
    expect(text).toContain('工作队列');
    expect(text).toContain('需要你');
    expect(text).toContain('验证之后 base 分支动过');
    expect(text).not.toContain('Needs you');
    expect(window.localStorage.getItem(OPERATOR_LOCALE_STORAGE_KEY)).toBe('zh');

    // Identity, provider vocabulary, and the read-only contract are never translated.
    expect(text).toContain(fixtureTasks.blocked.task_label);
    expect(text).toContain('base_moved_since_verification');
    expect(text).toContain('repo-harness');
    expect(text).toContain('read-only / localhost');
  });

  test('locale resolution prefers the stored choice and fails closed to English', () => {
    expect(localeFromNavigatorLanguage('zh-CN')).toBe('zh');
    expect(localeFromNavigatorLanguage('ZH')).toBe('zh');
    expect(localeFromNavigatorLanguage('fr-FR')).toBeNull();
    expect(localeFromNavigatorLanguage(null)).toBeNull();
    expect(resolveInitialLocale({ stored: null, language: 'zh-Hant' })).toBe('zh');
    expect(resolveInitialLocale({ stored: 'en', language: 'zh-CN' })).toBe('en');
    expect(resolveInitialLocale({ stored: null, language: 'fr-FR' })).toBe('en');
    expect(resolveInitialLocale({ stored: null, language: null })).toBe('en');

    const throwing = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    } as unknown as Storage;
    expect(readStoredLocale(throwing)).toBeNull();
    expect(() => writeStoredLocale('zh', throwing)).not.toThrow();
    expect(readStoredLocale({ getItem: () => 'kl' } as unknown as Storage)).toBeNull();
  });

  test('reports data age in both locales from observed_at alone', () => {
    const observed = '2026-08-24T01:10:00.000Z';
    const base = Date.parse(observed);
    expect(relativeAge(observed, base + 30_000)).toEqual({ key: 'age.seconds', count: 30 });
    expect(relativeAge(observed, base + 120_000)).toEqual({ key: 'age.minutes', count: 2 });
    expect(relativeAge(observed, base + 7_200_000)).toEqual({ key: 'age.hours', count: 2 });
    expect(relativeAge(observed, base + 172_800_000)).toEqual({ key: 'age.days', count: 2 });
    expect(relativeAge('not-a-date', base)).toBeNull();
    expect(translate('en', 'status.observedAgo', { age: '2m' })).toBe('observed 2m ago');
    expect(translate('zh', 'status.observedAgo', { age: '2 分钟' })).toBe('2 分钟前读到的快照');
  });

  test('keeps a persistent complementary pane on wide layouts and a fleet overview until a task is picked', async () => {
    installDom(true);
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);

    const overview = document.querySelector('[role="complementary"]');
    expect(overview?.getAttribute('aria-modal')).toBeNull();
    expect(overview?.getAttribute('aria-labelledby')).toBe('detail-pane-title');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(paneText()).toContain('Fleet overview');
    expect(paneText()).toContain('Tasks by repository and stage');
    expect(paneText()).toContain('Repository health');
    expect(paneText()).toContain('read only');
    expect(document.querySelectorAll('.stage-matrix tbody tr').length).toBe(stableSnapshot.repositories.length);

    const trigger = buttonWithText(fixtureTasks.blocked.task_label);
    trigger.focus();
    await act(async () => trigger.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(paneText()).toContain(fixtureTasks.blocked.task_label);
    expect(trigger.getAttribute('aria-current')).toBe('true');
  });

  test('attention carries a text encoding, not only a color', async () => {
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);

    const row = buttonWithText(fixtureTasks.blocked.task_label);
    expect(row.textContent).toContain('you attention');
    expect(row.querySelectorAll('[aria-hidden="true"]:not(svg)').length).toBe(0);
  });

  test('holds the layout, stale treatment, motion, and type-size contracts in one stylesheet', async () => {
    const css = await Bun.file('src/operator-web/styles.css').text();

    expect(css).toContain('.operator-main { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr); flex: 1; align-items: start; }');
    expect(css).toContain('.operator-app[data-state="stale"] .operator-main { filter: saturate(.55); }');
    expect(css).toContain('@media (max-width: 900px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).not.toContain('@media (max-width: 1100px)');

    const sizes = Array.from(css.matchAll(/font-size:\s*(\d+)px/gu), (match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);

    // The write accent stays reserved; nothing on this read-only board paints with it.
    const declarations = css.slice(css.indexOf('.operator-app {'));
    expect(declarations).not.toContain('var(--carrot-500)');
    expect(declarations).not.toContain('var(--carrot-600)');
  });
});
