import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { copyOperatorIdentifier, OperatorApp } from '../../src/operator-web/App';
import { stableSnapshot } from '../../src/operator-web/fixture';
import { projectSnapshotViewState } from '../../src/operator-web/types';

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
});
