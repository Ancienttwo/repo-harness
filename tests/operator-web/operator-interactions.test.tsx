import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { asApiError, copyOperatorIdentifier, fetchOperatorSnapshot, OperatorApp } from '../../src/operator-web/App';
import { stableSnapshot } from '../../src/operator-web/fixture';
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

    const trigger = buttonWithText('task-review');
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

    await act(async () => buttonWithText('task-review').click());
    const expectedHead = '0123456789abcdef0123456789abcdef01234567';
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(expectedHead);

    for (const label of ['Copy Task identifier', 'Copy Publication identifier', 'Copy Head SHA']) {
      const copy = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
      if (!copy) throw new Error(`copy button not found: ${label}`);
      await act(async () => copy.click());
    }
    expect(copied).toEqual(['task-review', 'pub-task-review', expectedHead]);
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

  test('closes the drawer when refresh removes the selected task or changes its revision', async () => {
    const nextSnapshot = (revision: string | null): OperatorFleetSnapshotV1 => ({
      ...stableSnapshot,
      sequence: stableSnapshot.sequence + 1,
      repositories: stableSnapshot.repositories.map((repository) => ({
        ...repository,
        cards: repository.cards.flatMap((card) => {
          if (card.task_id !== 'task-review') return [card];
          if (revision === null) return [];
          return [{ ...card, task_revision: revision }];
        }),
      })),
    });

    for (const revision of [null, 'rev-task-review-next']) {
      const container = document.createElement('div');
      document.body.append(container);
      root = createRoot(container);
      await act(async () => root?.render(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} fetchSnapshot={async () => nextSnapshot(revision)} />));
      await act(async () => buttonWithText('task-review').click());
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
});
