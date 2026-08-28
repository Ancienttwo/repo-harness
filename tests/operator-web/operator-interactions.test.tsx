import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { asApiError, copyOperatorIdentifier, fetchOperatorSnapshot, OperatorApp } from '../../src/operator-web/App';
import { degradedSnapshot, fixtureTasks, stableSnapshot } from '../../src/operator-web/fixture';
import { decodeOperatorFleetSnapshot, projectSnapshotViewState, type OperatorFleetSnapshotV1 } from '../../src/operator-web/types';

let root: Root | null = null;
let window: Window;

function installDom(): void {
  window = new Window({ url: 'http://127.0.0.1:4318/' });
  Object.assign(globalThis, {
    window,
    document: window.document,
    navigator: window.navigator,
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

beforeEach(() => {
  installDom();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  window.close();
});

describe('operator web interactions', () => {
  test('drawer owns modal focus, traps Tab, closes on Escape, and restores the trigger', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} />));

    const trigger = buttonWithText(fixtureTasks.review.task_id);
    trigger.focus();
    await act(async () => trigger.click());

    const dialog = document.querySelector('[role="dialog"]');
    const close = document.querySelector<HTMLButtonElement>('.task-drawer [aria-label="Close task details"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('task-drawer-title');
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

  test('copies full task, publication, and head identifiers and keeps mobile selection on native buttons', async () => {
    const copied: string[] = [];
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => { copied.push(value); } },
    });
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} />));

    await act(async () => buttonWithText(fixtureTasks.review.task_id).click());
    const expectedHead = '0123456789abcdef0123456789abcdef01234567';
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(expectedHead);

    for (const label of ['Copy Task identifier', 'Copy Publication identifier', 'Copy Head SHA']) {
      const copy = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
      if (!copy) throw new Error(`copy button not found: ${label}`);
      await act(async () => copy.click());
    }
    expect(copied).toEqual([fixtureTasks.review.task_id, 'pub-review', expectedHead]);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Head SHA copied');

    const column = buttonWithText('Ready to merge');
    expect(column.getAttribute('role')).toBeNull();
    expect(column.getAttribute('aria-pressed')).toBe('false');
    await act(async () => column.click());
    expect(column.getAttribute('aria-pressed')).toBe('true');
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

    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} fetchSnapshot={async () => decodeOperatorFleetSnapshot(malformed)} />));
    await act(async () => buttonWithText('Refresh').click());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(document.querySelector('[data-state="stale"]')).not.toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Fleet snapshot response is invalid');
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

  test('closes the drawer when refresh removes the selected task or changes its revision', async () => {
    const nextSnapshot = (revision: string | null): OperatorFleetSnapshotV1 => ({
      ...stableSnapshot,
      sequence: stableSnapshot.sequence + 1,
      repositories: stableSnapshot.repositories.map((repository) => ({
        ...repository,
        cards: repository.cards.flatMap((card) => {
          if (card.task_id !== fixtureTasks.review.task_id) return [card];
          if (revision === null) return [];
          return [{ ...card, task_revision: revision }];
        }),
      })),
    });

    for (const revision of [null, 'rev-review-next']) {
      const container = document.createElement('div');
      document.body.append(container);
      root = createRoot(container);
      await act(async () => root?.render(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} fetchSnapshot={async () => nextSnapshot(revision)} />));
      await act(async () => buttonWithText(fixtureTasks.review.task_id).click());
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      await act(async () => buttonWithText('Refresh').click());
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      await act(async () => root?.unmount());
      root = null;
      container.remove();
    }
  });

  test('keeps the desktop drawer in a 248px rail plus fluid board plus 360px side column', async () => {
    const css = await Bun.file('src/operator-web/styles.css').text();
    expect(css).toContain('@media (min-width: 1101px)');
    expect(css).toContain('.operator-app.has-drawer { grid-template-columns: 248px minmax(0, 1fr) 360px; }');
    expect(css).toContain('.operator-app.has-drawer .drawer-scrim { display: none; }');
    expect(css).toContain('@media (max-width: 1100px)');
  });

  test('uses a non-modal complementary detail region on wide screens', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        media: '(min-width: 1101px)',
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => true,
      }),
    });
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} />));

    const trigger = buttonWithText(fixtureTasks.review.task_id);
    trigger.focus();
    await act(async () => trigger.click());

    const detail = document.querySelector('[role="complementary"]');
    expect(detail?.getAttribute('aria-modal')).toBeNull();
    expect(detail?.getAttribute('aria-labelledby')).toBe('task-drawer-title');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
