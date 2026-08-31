import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { TASK_MESSAGE_BODY_MAX_BYTES } from '../../src/core/fleet/task-message';
import {
  asApiError,
  copyOperatorIdentifier,
  defaultCollapsedGroups,
  fetchOperatorSnapshot,
  groupWorklist,
  OperatorApp,
  primaryCause,
  TASK_MESSAGE_BODY_LIMIT_BYTES,
  type TaskMessageRequestV1,
  taskDisplayLabel,
  taskKey,
} from '../../src/operator-web/App';
import { collaborationSnapshot, degradedSnapshot, fixtureTasks, stableSnapshot } from '../../src/operator-web/fixture';
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

/** The browser decoder follows the write-route identity contract. */
function decodableSnapshot(snapshot: OperatorFleetSnapshotV1): OperatorFleetSnapshotV1 {
  return {
    ...snapshot,
    repositories: snapshot.repositories.map((repository) => ({
      ...repository,
      cards: repository.cards.map((card) => ({
        ...card,
        task_revision: card.task_id,
        claim_id: card.claim_id === null ? null : '123e4567-e89b-42d3-a456-426614174012',
      })),
    })),
  };
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

  test('collapses every group except the first non-empty group', () => {
    const groups = groupWorklist(stableSnapshot);
    expect(defaultCollapsedGroups(groups)).toEqual([
      'ready_to_merge', 'unreadable', 'unclassified', 'agent_working', 'external', 'done',
    ]);
    const withoutNeedsYou = groups.map((group) => group.id === 'needs_you'
      ? { ...group, cards: [], count: 0 }
      : group);
    expect(defaultCollapsedGroups(withoutNeedsYou)).not.toContain('ready_to_merge');
    expect(defaultCollapsedGroups(withoutNeedsYou)).toContain('needs_you');
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

  test('projects R1 runtime evidence without changing authoritative worklist grouping', async () => {
    const working = stableSnapshot.repositories[0].cards.find((card) => card.task_id === fixtureTasks.working.task_id)!;
    expect(groupWorklist(stableSnapshot).find((group) => group.id === 'agent_working')?.cards).toContain(working);

    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);
    await act(async () => buttonWithText('Agent working').click());
    const row = buttonWithText(fixtureTasks.working.task_label);
    expect(row.textContent).toContain('runtime unavailable');
    expect(row.textContent).toContain('reconciliation required');

    await act(async () => row.click());
    expect(paneText()).toContain('Delivery and runtime evidence');
    expect(paneText()).toContain(`sha256:${'9'.repeat(64)}`);
    expect(paneText()).toContain('adapter_unavailable');
  });

  test('keeps Agent Runtime effect-store failures distinct from Task Inbox failures in both locales', async () => {
    const runtimeEffectFailure: OperatorFleetSnapshotV1 = {
      ...degradedSnapshot,
      repositories: degradedSnapshot.repositories.map((repository) => repository.repository_id === 'repo-unreadable'
        ? {
          ...repository,
          error: {
            code: 'repo_runtime_effect_unreadable',
            message: 'repository Agent Runtime effect store is unavailable',
          },
        }
        : repository),
    };

    installDom(true);
    await mount(<OperatorApp initialState={projectSnapshotViewState(runtimeEffectFailure)} initialLocale="en" />);
    await act(async () => buttonWithText('Unreadable repos').click());
    const english = document.querySelector('.worklist')?.textContent ?? '';
    expect(english).toContain('Agent Runtime effect evidence is unavailable');
    expect(english).toContain('Reconcile runtime delivery evidence');
    expect(english).not.toContain('Task Inbox');

    await act(async () => buttonWithText('中').click());
    const chinese = document.querySelector('.worklist')?.textContent ?? '';
    expect(chinese).toContain('Agent Runtime effect 证据不可用');
    expect(chinese).toContain('reconcile runtime 投递证据');
    expect(chinese).not.toContain('Task Inbox');
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
    expect(document.body.style.overflow).toBe('hidden');

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
    expect(document.body.style.overflow).toBe('');
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
    expect(document.querySelector('.detail-pane [data-slot="composer"] .composer__toggle')?.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.composer__panel')).toBeNull();

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
    const malformed = structuredClone(decodableSnapshot(stableSnapshot)) as unknown as Record<string, unknown>;
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

  test('rejects protocol 2 rather than applying a browser compatibility path', () => {
    const stale = structuredClone(decodableSnapshot(stableSnapshot)) as unknown as Record<string, unknown>;
    stale.protocol = 2;
    expect(() => decodeOperatorFleetSnapshot(stale)).toThrow('Fleet snapshot response is invalid');
  });

  test('decodes the sprint task label and index and fails closed on a malformed one', () => {
    const decoded = decodeOperatorFleetSnapshot(decodableSnapshot(stableSnapshot));
    expect(decoded.repositories[0]?.cards[2]).toMatchObject({
      task_id: fixtureTasks.review.task_id,
      task_label: fixtureTasks.review.task_label,
      task_index: fixtureTasks.review.task_index,
    });

    const unlabelled = structuredClone(decodableSnapshot(stableSnapshot)) as unknown as Record<string, unknown>;
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
    const withExtras = structuredClone(decodableSnapshot(stableSnapshot)) as unknown as Record<string, unknown>;
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

    const degradedWithExtra = structuredClone(decodableSnapshot(degradedSnapshot)) as unknown as Record<string, unknown>;
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

  test('reveals a newly urgent first group while preserving an explicit collapse', async () => {
    const working = stableSnapshot.repositories[0]!.cards.find((card) => card.task_id === fixtureTasks.working.task_id)!;
    const lowerPriority = {
      ...stableSnapshot,
      repositories: [{ ...stableSnapshot.repositories[0]!, cards: [working] }],
      counts: { available: 0, working: 1, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0 },
    } satisfies OperatorFleetSnapshotV1;
    const urgent = { ...stableSnapshot, sequence: stableSnapshot.sequence + 1 };

    installDom(true);
    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(lowerPriority)}
        initialLocale="en"
        fetchSnapshot={async () => urgent}
      />,
    );
    expect(document.querySelector('[aria-label="Expand Needs you"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Collapse Agent working"]')).not.toBeNull();

    await act(async () => buttonWithText('Refresh').click());
    expect(document.querySelector('[aria-label="Collapse Needs you"]')).not.toBeNull();
    expect(buttonWithText(fixtureTasks.blocked.task_label)).not.toBeNull();

    // A direct collapse is an operator choice and survives the next snapshot.
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Collapse Needs you"]')?.click());
    expect(document.querySelector('[aria-label="Expand Needs you"]')).not.toBeNull();
    await act(async () => buttonWithText('Refresh').click());
    expect(document.querySelector('[aria-label="Expand Needs you"]')).not.toBeNull();
    expect(document.querySelector(`button.worklist-row`)).toBeNull();
  });

  test('keeps an explicitly expanded lower-priority group open when urgent work arrives', async () => {
    const working = stableSnapshot.repositories[0]!.cards.find((card) => card.task_id === fixtureTasks.working.task_id)!;
    const lowerPriority = {
      ...stableSnapshot,
      repositories: [{ ...stableSnapshot.repositories[0]!, cards: [working] }],
      counts: { available: 0, working: 1, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0 },
    } satisfies OperatorFleetSnapshotV1;
    const urgent = { ...stableSnapshot, sequence: stableSnapshot.sequence + 1 };

    installDom(true);
    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(lowerPriority)}
        initialLocale="en"
        fetchSnapshot={async () => urgent}
      />,
    );
    const agentHeader = document.querySelector<HTMLButtonElement>('[aria-label="Collapse Agent working"]');
    if (!agentHeader) throw new Error('agent working header not found');
    await act(async () => agentHeader.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Expand Agent working"]')?.click());
    await act(async () => buttonWithText('Refresh').click());

    expect(document.querySelector('[aria-label="Collapse Agent working"]')).not.toBeNull();
    expect(buttonWithText(fixtureTasks.working.task_label)).not.toBeNull();
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
    expect(text).toContain('observe-only · one write: task message');
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

    // The write accent marks the one write and nothing else: every rule that
    // paints with carrot must be a composer rule.
    const declarations = css.slice(css.indexOf('.operator-app {'));
    const carrotSelectors = declarations
      .split('}')
      .filter((rule) => rule.includes('var(--carrot-'))
      .map((rule) => rule.slice(0, rule.indexOf('{')).trim());
    expect(carrotSelectors.length).toBeGreaterThan(0);
    for (const selector of carrotSelectors) expect(selector.startsWith('.composer__')).toBe(true);
  });

  /**
   * The stylesheet guard above only covers rules that go through the carrot
   * token. Brand orange written as a literal in component source would bypass
   * it, so the same discipline is enforced against the sources themselves:
   * `marks.tsx` is brand identity art and may carry the brand orange; any other
   * component painting with it would be reusing the write accent as decoration.
   */
  test('keeps brand orange literals inside the brand art module', async () => {
    const BRAND_ORANGE = /#(?:E8742C|F2954A|C2571A|C2592C|A44721)\b/giu;
    const offenders: string[] = [];
    for await (const relative of new Bun.Glob('*.tsx').scan({ cwd: 'src/operator-web' })) {
      if (relative === 'marks.tsx') continue;
      const source = await Bun.file(`src/operator-web/${relative}`).text();
      const hits = source.match(BRAND_ORANGE);
      if (hits) offenders.push(`${relative}: ${hits.join(', ')}`);
    }
    expect(offenders).toEqual([]);

    // The whitelist is load-bearing only while the brand art actually uses it.
    expect((await Bun.file('src/operator-web/marks.tsx').text()).match(BRAND_ORANGE)?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('operator web task message composer', () => {
  const composerToggle = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('.composer__toggle')!;
  const composerPanel = (): Element | null => document.querySelector('.composer__panel');
  const sendButton = (): HTMLButtonElement => {
    const button = document.querySelector('[data-write-action="task-message"]');
    if (!(button instanceof window.HTMLButtonElement)) throw new Error('send button not found');
    return button as unknown as HTMLButtonElement;
  };

  /**
   * `react-dom` decides at import time whether the host supports the `input`
   * event, and in this test process there is no DOM yet, so it falls back to
   * its keyboard-driven change detection. A simulated edit therefore focuses
   * the field and ends on a key event; the value itself is written through the
   * prototype setter so React's own value tracker still sees the change.
   */
  async function typeMessage(text: string): Promise<void> {
    const textarea = document.querySelector('#composer-body') as unknown as HTMLTextAreaElement | null;
    if (textarea === null) throw new Error('composer textarea not found');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      textarea.dispatchEvent(new window.Event('focusin', { bubbles: true }) as unknown as Event);
      setter?.call(textarea, text);
      textarea.dispatchEvent(new window.Event('keyup', { bubbles: true }) as unknown as Event);
    });
  }

  async function openComposerFor(
    task: string,
    snapshot: OperatorFleetSnapshotV1 = stableSnapshot,
    props: Partial<React.ComponentProps<typeof OperatorApp>> = {},
  ): Promise<void> {
    installDom(true);
    await mount(
      <OperatorApp initialState={projectSnapshotViewState(snapshot)} initialLocale="en" {...props} />,
    );
    await act(async () => buttonWithText(task).click());
    await act(async () => composerToggle().click());
  }

  test('UX-operator-task-message-v1-P1 stays collapsed until asked and then states the untrusted contract', async () => {
    installDom(true);
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());

    expect(composerToggle().getAttribute('aria-expanded')).toBe('false');
    expect(composerToggle().textContent).toContain('Message current owner');
    expect(composerPanel()).toBeNull();

    await act(async () => composerToggle().click());
    const panel = composerPanel();
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('untrusted data');
    expect(panel?.textContent).toContain('may ignore it');
    expect(panel?.textContent).toContain('0 / 8192 bytes');
    expect(panel?.textContent).toContain('claim …-blocked · gen 3');
    expect(panel?.textContent).toContain('writes: task message only · no lease, no merge');
  });

  test('UX-operator-task-message-v1-P2 derives scope from the observed lease instead of offering a choice', async () => {
    await openComposerFor(fixtureTasks.blocked.task_label);
    expect(sendButton().textContent).toBe('Send to owner — claim …-blocked · gen 3');
    expect(composerPanel()?.textContent).not.toContain('waits for the next claimant');

    await act(async () => root?.unmount());
    root = null;

    await openComposerFor(fixtureTasks.available.task_label);
    expect(composerToggle().textContent).toContain('Queue message for next claimant');
    expect(sendButton().textContent).toBe('Send to the next claimant');
    expect(composerPanel()?.textContent).toContain('waits for the next claimant');
    expect(composerPanel()?.textContent).toContain('no current claim');
  });

  test('UX-operator-task-message-v1-N1 refuses the write on read_only, a torn card, and an unstable board', async () => {
    await openComposerFor(fixtureTasks.console.task_label);
    await typeMessage('please resume');
    expect(sendButton().disabled).toBe(true);
    expect(composerPanel()?.textContent).toContain('registered read only');

    await act(async () => root?.unmount());
    root = null;

    // A card that moved under the read, on a board whose own consistency is stable.
    const tornCard: OperatorFleetSnapshotV1 = {
      ...stableSnapshot,
      repositories: stableSnapshot.repositories.map((repository) => ({
        ...repository,
        cards: repository.cards.map((card) => (card.task_id === fixtureTasks.blocked.task_id
          ? { ...card, snapshot_consistency: 'changed_during_read' as const }
          : card)),
      })),
    };
    await openComposerFor(fixtureTasks.blocked.task_label, tornCard);
    await typeMessage('please resume');
    expect(sendButton().disabled).toBe(true);
    expect(composerPanel()?.textContent).toContain('changed while the snapshot was read');

    await act(async () => root?.unmount());
    root = null;

    await openComposerFor(fixtureTasks.blocked.task_label, degradedSnapshot);
    await typeMessage('please resume');
    expect(sendButton().disabled).toBe(true);
    expect(composerPanel()?.textContent).toContain('stale or degraded data');
  });

  test('UX-operator-task-message-v1-N2 counts UTF-8 bytes and blocks an empty or oversized body', async () => {
    await openComposerFor(fixtureTasks.blocked.task_label);
    expect(sendButton().disabled).toBe(true);
    expect(composerPanel()?.textContent).toContain('Write the message before sending it.');

    await typeMessage('检查一下 base');
    expect(sendButton().disabled).toBe(false);
    expect(composerPanel()?.textContent).toContain(`${new TextEncoder().encode('检查一下 base').byteLength} / 8192 bytes`);

    await typeMessage('x'.repeat(TASK_MESSAGE_BODY_MAX_BYTES + 1));
    expect(sendButton().disabled).toBe(true);
    expect(composerPanel()?.textContent).toContain('over the 8192 byte limit');
    expect(document.querySelector('.composer__bytes.is-over')).not.toBeNull();
  });

  test('UX-operator-task-message-v1-P3 sends once, refreshes, and keeps the draft plus the retry id on failure', async () => {
    const sent: Array<Record<string, unknown>> = [];
    let refreshes = 0;
    let failure: unknown = null;
    installDom(true);
    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        fetchSnapshot={async () => { refreshes += 1; return stableSnapshot; }}
        sendMessage={async (request) => {
          sent.push({ ...request });
          if (failure) throw failure;
        }}
      />,
    );
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    await act(async () => composerToggle().click());

    failure = { code: 'claim_mismatch', message: 'x', next_action: 'y' };
    await typeMessage('the base moved, rebase first');
    await act(async () => sendButton().click());
    expect(composerPanel()?.textContent).toContain('That session is gone');
    expect((document.querySelector('#composer-body') as unknown as HTMLTextAreaElement).value)
      .toBe('the base moved, rebase first');
    expect(refreshes).toBe(0);

    failure = null;
    await act(async () => sendButton().click());
    expect(sent.length).toBe(2);
    expect(sent[0]!.message_id).toBe(sent[1]!.message_id);
    expect(sent[1]).toMatchObject({
      repository_id: 'repo-harness',
      task_id: fixtureTasks.blocked.task_id,
      scope: 'claim',
      body: 'the base moved, rebase first',
      expected_task_revision: stableSnapshot.repositories[0]!.cards[5]!.task_revision,
      expected_claim_id: stableSnapshot.repositories[0]!.cards[5]!.claim_id,
      expected_generation: stableSnapshot.repositories[0]!.cards[5]!.generation,
    });
    expect(String(sent[1]!.message_id)).toMatch(/^[0-9a-f-]{36}$/u);
    expect(refreshes).toBe(1);
    expect(composerPanel()?.textContent).toContain('Sent. Waiting for the next snapshot.');
    expect((document.querySelector('#composer-body') as unknown as HTMLTextAreaElement).value).toBe('');

    // The spent id is never reused, and nothing about the send is persisted.
    await typeMessage('second message');
    await act(async () => sendButton().click());
    expect(sent[2]!.message_id).not.toBe(sent[1]!.message_id);
    expect(window.localStorage.getItem('repo-harness:operator-sent')).toBeNull();
  });

  test('keeps the draft fence bound to the rendered card across a refresh', async () => {
    const blocked = stableSnapshot.repositories[0]!.cards[5]!;
    const refreshed: OperatorFleetSnapshotV1 = {
      ...stableSnapshot,
      sequence: stableSnapshot.sequence + 1,
      repositories: stableSnapshot.repositories.map((repository) => ({
        ...repository,
        cards: repository.cards.map((card) => (card.task_id === blocked.task_id
          ? {
            ...card,
            task_revision: `${blocked.task_revision}-next`,
            claim_id: 'claim-replaced-by-refresh',
            generation: (blocked.generation ?? 0) + 1,
          }
          : card)),
      })),
    };
    const submitted: TaskMessageRequestV1[] = [];
    const collaboration = {
      // The injected reader is only here to keep this test about the task
      // composer; the repository binding itself is covered by collaboration tests.
      repository_id: 'repo-harness',
    };

    installDom(true);
    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        fetchSnapshot={async () => refreshed}
        fetchCollaboration={async () => ({
          ...collaborationSnapshot,
          ...collaboration,
        })}
        sendMessage={async (request) => {
          submitted.push(request);
          throw {
            code: 'task_revision_mismatch',
            message: 'The canonical task definition moved since the snapshot.',
            next_action: 'Refresh the board to re-observe the task, then retry.',
          };
        }}
      />,
    );
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    await act(async () => composerToggle().click());
    await typeMessage('send only to the observed owner');
    const originalFence = {
      expected_task_revision: blocked.task_revision,
      expected_claim_id: blocked.claim_id,
      expected_generation: blocked.generation,
    };

    await act(async () => buttonWithText('Refresh').click());
    expect(paneText()).toContain(`rev ${originalFence.expected_task_revision}`);
    expect(paneText()).not.toContain('claim …replaced');

    await act(async () => sendButton().click());
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({
      scope: 'claim',
      body: 'send only to the observed owner',
      ...originalFence,
    });
    expect(composerPanel()?.textContent).toContain('The canonical task definition moved since the snapshot.');
  });

  test('UX-operator-task-message-v1-P4 keeps the composer the only write affordance on the board', async () => {
    await openComposerFor(fixtureTasks.blocked.task_label);

    const writes = document.querySelectorAll('[data-write-action]');
    expect(writes.length).toBe(1);
    expect(writes[0]).toBe(sendButton() as unknown as Element);
    expect(document.querySelector('.worklist [data-write-action]')).toBeNull();
    expect(document.querySelector('.operator-statusbar [data-write-action]')).toBeNull();

    const text = document.body.textContent ?? '';
    for (const affordance of ['Approve', 'Merge now', 'Start agent', 'Acquire', 'Takeover', 'Abandon', 'Reopen']) {
      expect(text).not.toContain(affordance);
    }
  });

  test('translates the whole composer and mirrors the protocol body limit', async () => {
    expect(TASK_MESSAGE_BODY_LIMIT_BYTES).toBe(TASK_MESSAGE_BODY_MAX_BYTES);

    await openComposerFor(fixtureTasks.blocked.task_label);
    await act(async () => buttonWithText('中').click());

    const panel = composerPanel()?.textContent ?? '';
    expect(document.querySelector('.composer__toggle')?.textContent).toBe('给当前持有者发消息');
    expect(panel).toContain('不可信数据');
    expect(panel).toContain('字节');
    expect(panel).toContain('先把消息写出来再发');
    expect(sendButton().textContent).toBe('发给持有者 — claim …-blocked · gen 3');
    // Identity and the write boundary contract stay untranslated.
    expect(panel).toContain('claim …-blocked');
    expect(panel).toContain('writes: task message only · no lease, no merge');
  });
});
