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
  OPERATOR_REPOSITORY_STORAGE_KEY,
  primaryCause,
  TASK_MESSAGE_BODY_LIMIT_BYTES,
  type TaskMessageRequestV1,
  taskDisplayLabel,
  taskKey,
} from '../../src/operator-web/App';
import {
  collaborationSnapshot,
  degradedSnapshot,
  fixtureTasks,
  leaseStateSnapshot,
  preparationSnapshot,
  stableSnapshot,
} from '../../src/operator-web/fixture';
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
  const lockQueues = new Map<string, Promise<unknown>>();
  Object.defineProperty(window.navigator, 'locks', {
    configurable: true,
    value: {
      request: (name: string, callback: () => unknown) => {
        const result = (lockQueues.get(name) ?? Promise.resolve()).then(callback);
        lockQueues.set(name, result.catch(() => undefined));
        return result;
      },
    },
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

async function selectRepository(id: string): Promise<void> {
  const select = document.querySelector<HTMLSelectElement>('.repository-switch select');
  if (!select) throw new Error('repository selector missing');
  await act(async () => { select.value = id; select.dispatchEvent(new Event('change', { bubbles: true })); });
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

/**
 * The contrast guard reads the shipped stylesheet rather than a copy of its
 * hex values, so a token edit that drops the write control below AA fails here
 * instead of only in a browser.
 */
function cssVariables(css: string): ReadonlyMap<string, string> {
  const start = css.indexOf(':root {');
  const block = css.slice(start, css.indexOf('\n}', start));
  const variables = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/gu)) variables.set(name, value.trim());
  return variables;
}

function cssDeclarations(css: string, selector: string): ReadonlyMap<string, string> {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const match = css.match(new RegExp(String.raw`(?:^|\n)${escaped}\s*\{([^}]*)\}`, 'u'));
  if (!match) throw new Error(`selector not found: ${selector}`);
  const declarations = new Map<string, string>();
  for (const [, property, value] of match[1]!.matchAll(/([\w-]+):\s*([^;]+);/gu)) {
    declarations.set(property.trim(), value.trim());
  }
  return declarations;
}

function resolveCssColor(value: string, variables: ReadonlyMap<string, string>): string {
  let resolved = value.trim();
  for (let hops = 0; resolved.startsWith('var(') && hops < 8; hops += 1) {
    const name = resolved.slice(4, resolved.indexOf(')')).trim();
    const next = variables.get(name);
    if (next === undefined) throw new Error(`unresolved css variable: ${name}`);
    resolved = next.trim();
  }
  if (!/^#[0-9a-f]{6}$/iu.test(resolved)) throw new Error(`not a hex colour: ${resolved}`);
  return resolved;
}

function relativeLuminance(hex: string): number {
  const channel = (raw: number): number => {
    const value = raw / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(Number.parseInt(hex.slice(1, 3), 16))
    + 0.7152 * channel(Number.parseInt(hex.slice(3, 5), 16))
    + 0.0722 * channel(Number.parseInt(hex.slice(5, 7), 16));
}

function contrastRatio(foreground: string, background: string): number {
  const left = relativeLuminance(foreground);
  const right = relativeLuminance(background);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

function filterChipCount(label: string): number {
  const chip = Array.from(document.querySelectorAll('.worklist__filters button'))
    .find((candidate) => candidate.textContent?.startsWith(label));
  if (!chip) throw new Error(`filter chip not found: ${label}`);
  return Number(chip.querySelector('span')?.textContent);
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
      'preparation',
      'available',
      'claimed',
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
    expect(byId.claimed).toEqual([fixtureTasks.working.task_id]);
    expect(byId.done).toEqual([fixtureTasks.done.task_id]);

    const externalUnclassified = {
      ...stableSnapshot,
      repositories: [{
        ...stableSnapshot.repositories[0],
        cards: [{ ...stableSnapshot.repositories[0].cards[2], placement: { kind: 'unclassified', reason: 'state_unmapped' } }],
      }],
    } as OperatorFleetSnapshotV1;
    const regrouped = groupWorklist(externalUnclassified);
    expect(regrouped.find((group) => group.id === 'unclassified')?.count).toBe(1);
    expect(regrouped.find((group) => group.id === 'external')?.count).toBe(0);
  });

  test('collapses every group except the first non-empty group', () => {
    const groups = groupWorklist(stableSnapshot);
    expect(defaultCollapsedGroups(groups)).toEqual([
      'ready_to_merge', 'unreadable', 'unclassified', 'preparation', 'available', 'claimed', 'external', 'done',
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
  test('repository switch scopes counts and detail, persists across reload and refuses a removed selection', async () => {
    installDom(true);
    let next = stableSnapshot;
    await mount(<OperatorApp initialSnapshot={stableSnapshot} initialLocale="en" fetchSnapshot={async () => next} />);
    expect(filterChipCount('All')).toBe(stableSnapshot.repositories[0]!.cards.length);
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect(paneText()).toContain(fixtureTasks.blocked.task_label);
    await selectRepository('repo-console');
    expect(paneText()).not.toContain(fixtureTasks.blocked.task_label);
    expect(filterChipCount('All')).toBe(stableSnapshot.repositories[1]!.cards.length);
    expect(document.querySelector('.worklist')?.textContent).not.toContain(fixtureTasks.blocked.task_label);
    expect(window.localStorage.getItem(OPERATOR_REPOSITORY_STORAGE_KEY)).toBe('repo-console');
    await act(async () => root?.unmount()); root = null;
    await mount(<OperatorApp initialSnapshot={stableSnapshot} initialLocale="en" fetchSnapshot={async () => next} />);
    expect(document.querySelector<HTMLSelectElement>('.repository-switch select')?.value).toBe('repo-console');
    await act(async () => buttonWithText('Refresh').click());
    expect(filterChipCount('All')).toBe(stableSnapshot.repositories[1]!.cards.length);
    next = { ...stableSnapshot, repositories: [stableSnapshot.repositories[0]!] };
    await act(async () => buttonWithText('Refresh').click());
    expect(document.querySelector('.worklist')).toBeNull();
    expect(document.querySelector<HTMLSelectElement>('.repository-switch select')?.value).toBe('');
    expect(document.querySelector('main')?.textContent).toContain('Select repository');
  });

  test('duplicate display names remain distinguishable and names never become request identities', async () => {
    const snapshot = { ...stableSnapshot, repositories: stableSnapshot.repositories.map(repo => ({ ...repo, display_name: 'shared-name' })) };
    await mount(<OperatorApp initialSnapshot={snapshot} initialLocale="en" />);
    const options = Array.from(document.querySelectorAll<HTMLOptionElement>('.repository-switch option')).filter(option => option.value);
    expect(options.map(option => option.textContent?.trim())).toEqual(['shared-name · repo-harness', 'shared-name · repo-console']);
    await selectRepository('repo-console');
    expect(filterChipCount('All')).toBe(snapshot.repositories[1]!.cards.length);
  });

  test('renders the plain-language cause with its raw code and expands a collapsed group on demand', async () => {
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);

    const worklist = document.querySelector('.worklist')?.textContent ?? '';
    expect(worklist).toContain('The base branch moved after verification');
    expect(worklist).toContain('base_moved_since_verification');
    expect(worklist).not.toContain('no progress');
    expect(worklist).not.toContain(fixtureTasks.review.task_label);

    await act(async () => buttonWithText('External').click());
    expect(document.querySelector('.worklist')?.textContent).toContain(fixtureTasks.review.task_label);
  });

  test('projects R1 runtime evidence without changing authoritative worklist grouping', async () => {
    const working = stableSnapshot.repositories[0].cards.find((card) => card.task_id === fixtureTasks.working.task_id)!;
    expect(groupWorklist(stableSnapshot).find((group) => group.id === 'claimed')?.cards).toContain(working);

    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);
    await act(async () => buttonWithText('Claimed / under review').click());
    const row = buttonWithText(fixtureTasks.working.task_label);
    expect(row.textContent).toContain('runtime unavailable');
    expect(row.textContent).toContain('reconciliation required');

    await act(async () => row.click());
    expect(paneText()).toContain('Message delivery evidence');
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
    await selectRepository('repo-unreadable');
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
    expect(document.activeElement).toBe(focusable[0]);

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
    await selectRepository('repo-console');
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
    expect(Array.from(document.querySelectorAll('[role="alert"]')).some((alert) => alert.textContent?.includes('Fleet snapshot response is invalid'))).toBe(true);
    expect(document.querySelector('.statusbar-fact--age.is-stale')).not.toBeNull();
  });

  test('rejects protocol 2 rather than applying a browser compatibility path', () => {
    const stale = structuredClone(stableSnapshot) as unknown as Record<string, unknown>;
    stale.protocol = 2;
    expect(() => decodeOperatorFleetSnapshot(stale)).toThrow('Fleet snapshot response is invalid');
  });

  test('decodes the sprint task label and index and fails closed on a malformed one', () => {
    const decoded = decodeOperatorFleetSnapshot(stableSnapshot);
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

  test('reveals a newly urgent first group while preserving an explicit collapse', async () => {
    const working = stableSnapshot.repositories[0]!.cards.find((card) => card.task_id === fixtureTasks.working.task_id)!;
    const lowerPriority = {
      ...stableSnapshot,
      repositories: [{ ...stableSnapshot.repositories[0]!, cards: [working] }],
      counts: { available: 0, working: 1, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0, unclassified: 0, preparation: 0, alternate_workflow: 0, isolated_execution: 0, known_tasks: 1 },
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
    expect(document.querySelector('[aria-label="Collapse Claimed / under review"]')).not.toBeNull();

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
      counts: { available: 0, working: 1, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0, unclassified: 0, preparation: 0, alternate_workflow: 0, isolated_execution: 0, known_tasks: 1 },
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
    const agentHeader = document.querySelector<HTMLButtonElement>('[aria-label="Collapse Claimed / under review"]');
    if (!agentHeader) throw new Error('agent working header not found');
    await act(async () => agentHeader.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Expand Claimed / under review"]')?.click());
    await act(async () => buttonWithText('Refresh').click());

    expect(document.querySelector('[aria-label="Collapse Claimed / under review"]')).not.toBeNull();
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

  test('keeps overview secondary and opens the same modal with focus restoration on wide layouts', async () => {
    installDom(true);
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);
    expect(document.querySelector('[role="complementary"]')).toBeNull();
    expect(document.querySelector('.detail-pane')).toBeNull();
    const overview = document.querySelector<HTMLDetailsElement>('.repository-overview');
    expect(overview?.open).toBe(false);
    expect(overview?.textContent).toContain('Tasks by repository and stage');
    expect(overview?.textContent).toContain('Repository health');
    expect(document.querySelectorAll('.stage-matrix tbody tr')).toHaveLength(1);
    const trigger = buttonWithText(fixtureTasks.blocked.task_label);
    trigger.focus();
    await act(async () => trigger.click());
    const pane = document.querySelector('[role="dialog"]');
    const close = document.querySelector<HTMLButtonElement>('.detail-pane [aria-label="Close task details"]');
    expect(pane?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(close);
    expect(document.body.style.overflow).toBe('hidden');
    await act(async () => close?.click());
    expect(document.querySelector('.detail-pane')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('');
  });

  test('attention carries a text encoding, not only a color', async () => {
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);

    const row = buttonWithText(fixtureTasks.blocked.task_label);
    expect(row.textContent).toContain('you attention');
    expect(row.querySelectorAll('[aria-hidden="true"]:not(svg)').length).toBe(0);
  });

  test('holds the layout, stale treatment, motion, and type-size contracts in one stylesheet', async () => {
    const css = await Bun.file('src/operator-web/styles.css').text();

    expect(css).toContain('.operator-main { display: block; flex: 1; }');
    expect(css).toContain('width: min(720px, 100vw)');
    expect(css).toContain('.operator-app[data-state="stale"] .operator-content { filter: saturate(.55); }');
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

  test('keeps the one write control at WCAG AA in default, hover, focus, and disabled states', async () => {
    const css = await Bun.file('src/operator-web/styles.css').text();
    const variables = cssVariables(css);
    const base = cssDeclarations(css, '.composer__send');
    const hover = cssDeclarations(css, '.composer__send:hover:not(:disabled)');
    const disabled = cssDeclarations(css, '.composer__send:disabled');

    const baseForeground = resolveCssColor(base.get('color')!, variables);
    const baseBackground = resolveCssColor(base.get('background')!, variables);

    // A translucent disabled state composites the control against whatever is
    // behind it, which is how a 4.5:1 pair silently becomes a 2.5:1 one.
    expect(disabled.get('opacity')).toBe('1');
    // Focus draws a ring outside the control instead of repainting it, so the
    // focused pair is the default pair.
    expect(cssDeclarations(css, 'button:focus-visible, a:focus-visible').has('background')).toBe(false);

    const states = [
      ['default', baseForeground, baseBackground],
      ['hover', resolveCssColor(hover.get('color') ?? base.get('color')!, variables), resolveCssColor(hover.get('background')!, variables)],
      ['focus', baseForeground, baseBackground],
      ['disabled', resolveCssColor(disabled.get('color')!, variables), resolveCssColor(disabled.get('background')!, variables)],
    ] as const;
    for (const [state, foreground, background] of states) {
      expect({ state, meetsAA: contrastRatio(foreground, background) >= 4.5 }).toEqual({ state, meetsAA: true });
    }
  });

  test('counts cards in the All filter and repositories in the unreadable filter', async () => {
    installDom(true);
    await mount(<OperatorApp initialState={projectSnapshotViewState(degradedSnapshot)} initialLocale="en" />);

    const cards = degradedSnapshot.repositories[0]!.cards.length;
    const unreadable = degradedSnapshot.repositories.filter((repository) => repository.status === 'unreadable').length;
    expect(cards).toBeGreaterThan(0);
    expect(unreadable).toBeGreaterThan(0);

    // The All chip used to sum repositories into the card total, so a fleet
    // with many unreadable repositories reported hundreds of phantom tasks.
    expect(filterChipCount('All')).toBe(cards);
    expect(filterChipCount('Unreadable repos')).toBe(0);
    await selectRepository('repo-unreadable');
    expect(filterChipCount('All')).toBe(0);
    expect(filterChipCount('Unreadable repos')).toBe(unreadable);
    expect(document.querySelector('.operator-statusbar [data-fact="repositories"]')?.textContent)
      .toContain(`${degradedSnapshot.counts.unreadable} unreadable`);
  });

  test('keeps an unreadable repository visible on a board that carries no cards', async () => {
    const unreadableOnly = {
      ...degradedSnapshot,
      repositories: degradedSnapshot.repositories.filter((repository) => repository.status === 'unreadable'),
      counts: { available: 0, working: 0, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 1, unclassified: 0, preparation: 0, alternate_workflow: 0, isolated_execution: 0, known_tasks: 0 },
    } as OperatorFleetSnapshotV1;

    installDom(true);
    await mount(<OperatorApp initialState={projectSnapshotViewState(unreadableOnly)} initialLocale="en" />);

    expect(filterChipCount('All')).toBe(0);
    expect(document.querySelector('.worklist')?.textContent).toContain('repo-unreadable');
    expect(document.querySelector('.empty-inline')).toBeNull();
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
  /** The claim short id the composer prints is the tail of the real UUID. */
  const blockedClaim = fixtureTasks.blocked.claim_id.slice(-8);
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
    const repository = snapshot.repositories.find((repo) => repo.cards.some((card) => card.task_label === task));
    if (!repository) throw new Error('fixture task missing');
    await selectRepository(repository.repository_id);
    await act(async () => buttonWithText(task).click());
    await act(async () => composerToggle().click());
  }

  test('wide modal survives resize and IME cancellation without replacing draft or retry identity', async () => {
    await openComposerFor(fixtureTasks.blocked.task_label);
    const textarea = document.querySelector<HTMLTextAreaElement>('#composer-body')!;
    textarea.focus();
    await act(async () => textarea.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }) as unknown as Event));
    expect(document.querySelector('#composer-body')).toBe(textarea);
    await typeMessage('保留中文草稿');
    const card = stableSnapshot.repositories[0]!.cards.find(value => value.task_id === fixtureTasks.blocked.task_id)!;
    const key = `repo-harness:task-message-draft:v1:${taskKey(card)}`;
    const before = window.localStorage.getItem(key);
    textarea.focus();
    await act(async () => window.dispatchEvent(new window.Event('resize')));
    expect(document.querySelector('#composer-body')).toBe(textarea);
    expect(document.activeElement).toBe(textarea);
    expect(window.localStorage.getItem(key)).toBe(before);
    await act(async () => textarea.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event));
    expect(document.querySelector('#composer-body')).toBe(textarea);
    expect(textarea.value).toBe('保留中文草稿');
  });

  test('restores a draft after remount with the original retry identity and stale fence', async () => {
    const requests: TaskMessageRequestV1[] = [];
    const props = {
      initialLocale: 'en' as const,
      sendMessage: async (request: TaskMessageRequestV1) => {
        requests.push(request);
        if (requests.length === 1) throw new Error('response lost');
      },
    };
    await openComposerFor(fixtureTasks.blocked.task_label, stableSnapshot, props);
    await typeMessage('检查 original owner');
    await act(async () => sendButton().click());
    await act(async () => root?.unmount());
    root = null;

    const newer: OperatorFleetSnapshotV1 = {
      ...stableSnapshot,
      repositories: stableSnapshot.repositories.map((repository) => ({
        ...repository,
        cards: repository.cards.map((card) => ({
          ...card,
          task_revision: 'c'.repeat(64),
          claim_id: '00000000-0000-4000-8000-000000000001',
          generation: 99,
        })),
      })),
    };
    await mount(<OperatorApp initialState={projectSnapshotViewState(newer)} {...props} />);
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect((document.querySelector('#composer-body') as HTMLTextAreaElement | null)?.value)
      .toBe('检查 original owner');
    expect(requests).toHaveLength(1);
    await act(async () => sendButton().click());
    expect(requests[1]).toEqual(requests[0]);

    await act(async () => root?.unmount());
    root = null;
    await mount(<OperatorApp initialState={projectSnapshotViewState(newer)} {...props} />);
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect(composerToggle().getAttribute('aria-expanded')).toBe('false');
    await act(async () => composerToggle().click());
    expect((document.querySelector('#composer-body') as HTMLTextAreaElement).value).toBe('');
  });

  test('a delayed acknowledgement preserves a newer draft saved after remount', async () => {
    let acknowledge!: () => void;
    const submitted: TaskMessageRequestV1[] = [];
    await openComposerFor(fixtureTasks.blocked.task_label, stableSnapshot, {
      sendMessage: async (request) => {
        submitted.push(request);
        await new Promise<void>((resolve) => { acknowledge = resolve; });
      },
    });
    await typeMessage('sent from the first composer');
    await act(async () => sendButton().click());
    await act(async () => root?.unmount());
    root = null;
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    await typeMessage('newer unsent text');
    await act(async () => acknowledge());
    await act(async () => root?.unmount());
    root = null;
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect((document.querySelector('#composer-body') as HTMLTextAreaElement | null)?.value).toBe('newer unsent text');
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.body).toBe('sent from the first composer');
  });

  test('keeps saved text when cross-tab storage locking is unavailable', async () => {
    await openComposerFor(fixtureTasks.blocked.task_label);
    await typeMessage('saved before locking became unavailable');
    const card = stableSnapshot.repositories[0]!.cards.find((entry) => entry.task_id === fixtureTasks.blocked.task_id)!;
    const key = `repo-harness:task-message-draft:v1:${taskKey(card)}`;
    const saved = window.localStorage.getItem(key);
    Object.defineProperty(window.navigator, 'locks', { configurable: true, value: undefined });
    await typeMessage('still available in the editor');
    expect(window.localStorage.getItem(key)).toBe(saved);
    expect(composerPanel()?.textContent).toContain('Draft recovery could not be updated');
  });

  test('isolates drafts by repository and task, and removes explicitly emptied text', async () => {
    await openComposerFor(fixtureTasks.blocked.task_label);
    await typeMessage('keep in this repository and task');
    const original = stableSnapshot.repositories[0]!.cards.find((card) => card.task_id === fixtureTasks.blocked.task_id)!;
    const key = `repo-harness:task-message-draft:v1:${taskKey(original)}`;
    const saved = window.localStorage.getItem(key);
    expect(saved).not.toBeNull();

    for (const differentRepository of [false, true]) {
      await act(async () => root?.unmount());
      root = null;
      const snapshot = differentRepository ? {
        ...stableSnapshot,
        repositories: stableSnapshot.repositories.map((repository) => ({
          ...repository,
          repository_id: `${repository.repository_id}-other`,
          cards: repository.cards.map((card) => ({ ...card, repository_id: `${card.repository_id}-other` })),
        })),
      } : stableSnapshot;
      await mount(<OperatorApp initialState={projectSnapshotViewState(snapshot)} initialLocale="en" />);
      await selectRepository(snapshot.repositories[0]!.repository_id);
      await act(async () => buttonWithText(differentRepository ? fixtureTasks.blocked.task_label : fixtureTasks.available.task_label).click());
      expect(composerToggle().getAttribute('aria-expanded')).toBe('false');
      await act(async () => composerToggle().click());
      expect((document.querySelector('#composer-body') as HTMLTextAreaElement).value).toBe('');
      expect(window.localStorage.getItem(key)).toBe(saved);
    }

    await act(async () => root?.unmount());
    root = null;
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);
    await selectRepository('repo-harness');
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect((document.querySelector('#composer-body') as HTMLTextAreaElement).value).toBe('keep in this repository and task');
    await typeMessage('');
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  test('refuses malformed saved identity instead of rebuilding it from the current card', async () => {
    const card = stableSnapshot.repositories[0]!.cards.find((entry) => entry.task_id === fixtureTasks.blocked.task_id)!;
    const key = `repo-harness:task-message-draft:v1:${taskKey(card)}`;
    const fence = { expected_task_revision: card.task_revision, expected_claim_id: card.claim_id, expected_generation: card.generation };
    for (const saved of [
      '{broken',
      JSON.stringify({ body: 'missing identity' }),
      JSON.stringify({ body: 'incoherent fence', message_id: 'saved-id', fence: { ...fence, expected_claim_id: null } }),
      JSON.stringify({ body: 'unexpected field', message_id: 'saved-id', fence: { ...fence, repository_id: 'different-repository' } }),
    ]) {
      window.localStorage.setItem(key, saved);
      let sent = false;
      await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" sendMessage={async () => { sent = true; }} />);
      await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
      expect(composerPanel()?.textContent).toContain('saved draft could not be restored');
      expect((document.querySelector('#composer-body') as HTMLTextAreaElement).value).toBe('');
      expect(sendButton().disabled).toBe(true);
      expect(sent).toBe(false);
      expect(window.localStorage.getItem(key)).toBe(saved);
      await act(async () => root?.unmount());
      root = null;
    }
  });

  test('reports storage failures while keeping the in-memory message usable', async () => {
    const requests: TaskMessageRequestV1[] = [];
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('storage denied'); },
    });
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" sendMessage={async (request) => { requests.push(request); }} />);
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect(composerPanel()?.textContent).toContain('saved draft could not be restored');
    await typeMessage('still send this message');
    expect(composerPanel()?.textContent).toContain('Draft recovery could not be updated');
    expect((document.querySelector('#composer-body') as HTMLTextAreaElement).value).toBe('still send this message');
    await act(async () => sendButton().click());
    expect(requests).toHaveLength(1);
    expect(requests[0]!.body).toBe('still send this message');
    expect(composerPanel()?.textContent).toContain('Draft recovery could not be updated');
  });

  test('coalesces a post-send refresh behind an in-flight Fleet snapshot without overlap', async () => {
    const pending: Array<{
      readonly resolve: (snapshot: OperatorFleetSnapshotV1) => void;
      readonly reject: (error: unknown) => void;
    }> = [];
    let calls = 0;
    let active = 0;
    let maxActive = 0;
    const fetchSnapshot = (): Promise<OperatorFleetSnapshotV1> => new Promise((resolve, reject) => {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      pending.push({
        resolve: (snapshot) => {
          active -= 1;
          resolve(snapshot);
        },
        reject: (error) => {
          active -= 1;
          reject(error);
        },
      });
    });
    const postMessageSnapshot: OperatorFleetSnapshotV1 = {
      ...stableSnapshot,
      sequence: stableSnapshot.sequence + 2,
      repositories: stableSnapshot.repositories.map((repository) => ({
        ...repository,
        cards: repository.cards.map((card) => card.task_id === fixtureTasks.blocked.task_id
          ? { ...card, inbox: { ...card.inbox, unread_count: card.inbox.unread_count + 1 } }
          : card),
      })),
    };

    await openComposerFor(fixtureTasks.blocked.task_label, stableSnapshot, {
      fetchSnapshot,
      initialCollaboration: { kind: 'idle' },
      sendMessage: async () => {},
    });
    await typeMessage('send while the board is refreshing');
    await act(async () => buttonWithText('Refresh').click());
    expect(calls).toBe(1);

    await act(async () => sendButton().click());
    expect(calls).toBe(1);
    expect(maxActive).toBe(1);

    await act(async () => pending[0]!.resolve(stableSnapshot));
    expect(calls).toBe(2);
    expect(maxActive).toBe(1);

    await act(async () => pending[1]!.resolve(postMessageSnapshot));
    expect(calls).toBe(2);
    expect(maxActive).toBe(1);
    expect(document.querySelector('[data-fact="sequence"]')?.textContent).toContain(String(postMessageSnapshot.sequence));
    expect(paneText()).toContain('1 unread');
  });

  test('runs the one queued recovery read after the in-flight Fleet request fails', async () => {
    const pending: Array<{
      readonly resolve: (snapshot: OperatorFleetSnapshotV1) => void;
      readonly reject: (error: unknown) => void;
    }> = [];
    let calls = 0;
    const fetchSnapshot = (): Promise<OperatorFleetSnapshotV1> => new Promise((resolve, reject) => {
      calls += 1;
      pending.push({ resolve, reject });
    });

    await openComposerFor(fixtureTasks.blocked.task_label, stableSnapshot, {
      fetchSnapshot,
      initialCollaboration: { kind: 'idle' },
      sendMessage: async () => {},
    });
    await typeMessage('send through a failed observation');
    await act(async () => buttonWithText('Refresh').click());
    await act(async () => sendButton().click());
    expect(calls).toBe(1);

    await act(async () => pending[0]!.reject(new Error('Fleet provider is offline')));
    expect(calls).toBe(2);
    await act(async () => pending[1]!.resolve(stableSnapshot));
    expect(calls).toBe(2);
    expect(document.querySelector('[data-state="stable"]')).not.toBeNull();
  });

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
    expect(panel?.textContent).toContain(`claim …${blockedClaim} · gen 3`);
    expect(panel?.textContent).toContain('writes: task message only · no lease, no merge');
  });

  test('UX-operator-task-message-v1-P2 derives scope from the observed lease instead of offering a choice', async () => {
    await openComposerFor(fixtureTasks.blocked.task_label);
    expect(sendButton().textContent).toBe(`Send to owner — claim …${blockedClaim} · gen 3`);
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

  test('does not render the task-message composer for a completed task', async () => {
    installDom(true);
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);

    await act(async () => buttonWithText('Done').click());
    await act(async () => buttonWithText(fixtureTasks.done.task_label).click());

    expect(document.querySelector('.detail-pane [data-slot="composer"]')).toBeNull();
    expect(document.querySelector('[data-write-action="task-message"]')).toBeNull();
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

  test('UX-operator-task-message-v1-P3 retries an ambiguous send with its exact draft identity', async () => {
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

    failure = new Error('the connection closed before the result arrived');
    await typeMessage('the base moved, rebase first');
    await act(async () => sendButton().click());
    expect(composerPanel()?.textContent).toContain('The send outcome is unknown');
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

  test('keeps the exact draft when a 2xx response has no bound acknowledgment', async () => {
    const originalFetch = globalThis.fetch;
    let refreshes = 0;
    globalThis.fetch = (async () => new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
    try {
      await openComposerFor(fixtureTasks.blocked.task_label, stableSnapshot, {
        fetchSnapshot: async () => { refreshes += 1; return stableSnapshot; },
      });
      await typeMessage('retain until the exact acknowledgment arrives');
      await act(async () => sendButton().click());

      expect((document.querySelector('#composer-body') as unknown as HTMLTextAreaElement).value)
        .toBe('retain until the exact acknowledgment arrives');
      expect(composerPanel()?.textContent).toContain('acknowledgment is invalid');
      expect(refreshes).toBe(0);
      expect(sendButton().disabled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('rotates a conflicting message id only after the operator explicitly asks', async () => {
    const submitted: TaskMessageRequestV1[] = [];
    let conflict = true;
    await openComposerFor(fixtureTasks.blocked.task_label, stableSnapshot, {
      sendMessage: async (request) => {
        submitted.push(request);
        if (conflict) {
          throw {
            code: 'message_id_conflict',
            message: 'A different message already used this message id.',
            next_action: 'Compose the message again so it gets a new id.',
          };
        }
      },
    });
    await typeMessage('use the next available message id');
    await act(async () => sendButton().click());

    expect(sendButton().disabled).toBe(true);
    expect(composerPanel()?.textContent).toContain('Start with a new message ID');
    const conflictingId = submitted[0]!.message_id;

    conflict = false;
    await act(async () => buttonWithText('Start with a new message ID').click());
    expect(sendButton().disabled).toBe(false);
    expect((document.querySelector('#composer-body') as unknown as HTMLTextAreaElement).value)
      .toBe('use the next available message id');

    await act(async () => sendButton().click());
    expect(submitted).toHaveLength(2);
    expect(submitted[1]!.message_id).not.toBe(conflictingId);
    expect(submitted[1]).toMatchObject({
      body: 'use the next available message id',
      expected_task_revision: submitted[0]!.expected_task_revision,
      expected_claim_id: submitted[0]!.expected_claim_id,
      expected_generation: submitted[0]!.expected_generation,
    });
  });

  test('rebinds a stale draft only through an explicit current-snapshot action', async () => {
    const initialCard = stableSnapshot.repositories[0]!.cards.find((card) => card.task_id === fixtureTasks.blocked.task_id)!;
    const reboundSnapshot: OperatorFleetSnapshotV1 = {
      ...stableSnapshot,
      sequence: stableSnapshot.sequence + 1,
      repositories: stableSnapshot.repositories.map((repository) => ({
        ...repository,
        cards: repository.cards.map((card) => card.task_id === initialCard.task_id
          ? {
            ...card,
            task_revision: `${initialCard.task_revision}-next`,
            claim_id: 'claim-current-owner',
            generation: (initialCard.generation ?? 0) + 1,
          }
          : card),
      })),
    };
    const submitted: TaskMessageRequestV1[] = [];
    await openComposerFor(fixtureTasks.blocked.task_label, stableSnapshot, {
      fetchSnapshot: async () => reboundSnapshot,
      sendMessage: async (request) => {
        submitted.push(request);
        if (submitted.length === 1) {
          throw {
            code: 'claim_mismatch',
            message: 'The task owner changed while the message was being sent.',
            next_action: 'Refresh the board to re-observe the task, then retry.',
          };
        }
      },
    });
    await typeMessage('send only if the current owner still needs this');
    await act(async () => sendButton().click());

    expect(sendButton().disabled).toBe(true);
    expect(composerPanel()?.textContent).toContain('Rebind to current snapshot');
    const originalId = submitted[0]!.message_id;
    expect(buttonWithText('Rebind to current snapshot').disabled).toBe(true);

    await act(async () => buttonWithText('Refresh').click());
    expect(paneText()).toContain(`rev ${initialCard.task_revision}`);
    await act(async () => buttonWithText('Rebind to current snapshot').click());

    const saved = JSON.parse(window.localStorage.getItem(`repo-harness:task-message-draft:v1:${taskKey(initialCard)}`)!);
    expect(saved.message_id).not.toBe(originalId);
    expect(saved.fence).toEqual({
      expected_task_revision: `${initialCard.task_revision}-next`,
      expected_claim_id: 'claim-current-owner',
      expected_generation: (initialCard.generation ?? 0) + 1,
    });

    expect(sendButton().disabled).toBe(false);
    expect((document.querySelector('#composer-body') as unknown as HTMLTextAreaElement).value)
      .toBe('send only if the current owner still needs this');
    await act(async () => sendButton().click());
    expect(submitted).toHaveLength(2);
    expect(submitted[1]).toMatchObject({
      expected_task_revision: `${initialCard.task_revision}-next`,
      expected_claim_id: 'claim-current-owner',
      expected_generation: (initialCard.generation ?? 0) + 1,
    });
    expect(submitted[1]!.message_id).not.toBe(originalId);
  });

  test('treats canonical source staleness as requiring a newer stable snapshot', async () => {
    const refreshed = { ...stableSnapshot, sequence: stableSnapshot.sequence + 1 };
    let attempts = 0;
    await openComposerFor(fixtureTasks.blocked.task_label, stableSnapshot, {
      fetchSnapshot: async () => refreshed,
      sendMessage: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw {
            code: 'canonical_source_stale',
            message: 'The canonical source changed while the message was being sent.',
            next_action: 'Refresh the board to re-observe the task, then retry.',
          };
        }
      },
    });
    await typeMessage('bind only after canonical source refresh');
    await act(async () => sendButton().click());

    const rebind = buttonWithText('Rebind to current snapshot');
    expect(rebind.disabled).toBe(true);
    await act(async () => buttonWithText('Refresh').click());
    expect(buttonWithText('Rebind to current snapshot').disabled).toBe(false);
  });

  test('disables stale-draft rebind when the refreshed board is degraded', async () => {
    await openComposerFor(fixtureTasks.blocked.task_label, stableSnapshot, {
      fetchSnapshot: async () => degradedSnapshot,
      sendMessage: async () => {
        throw {
          code: 'task_revision_mismatch',
          message: 'The canonical task definition moved since the snapshot.',
          next_action: 'Refresh the board to re-observe the task, then retry.',
        };
      },
    });
    await typeMessage('wait for a stable board');
    await act(async () => sendButton().click());
    await act(async () => buttonWithText('Refresh').click());

    const rebind = buttonWithText('Rebind to current snapshot');
    expect(rebind.disabled).toBe(true);
    expect(sendButton().disabled).toBe(true);
  });

  test('blocks writes from an impossible injected unreadable repository payload', async () => {
    const repository = stableSnapshot.repositories[0]!;
    const impossible: OperatorFleetSnapshotV1 = {
      ...stableSnapshot,
      snapshot_consistency: 'stable',
      repositories: [{
        ...repository,
        status: 'unreadable',
        snapshot_consistency: 'stable',
        error: { code: 'repo_unreadable', message: 'repository authority cannot be read' },
      }],
    };

    await openComposerFor(fixtureTasks.blocked.task_label, impossible);
    await typeMessage('must never reach the write boundary');
    expect(sendButton().disabled).toBe(true);
    expect(composerPanel()?.textContent).toContain('stale or degraded data');
  });

  test('clears a successful draft and freezes the next message against the latest card', async () => {
    const initialCard = stableSnapshot.repositories[0]!.cards.find((card) => card.task_id === fixtureTasks.blocked.task_id)!;
    const refreshedSnapshot: OperatorFleetSnapshotV1 = {
      ...stableSnapshot,
      sequence: stableSnapshot.sequence + 1,
      repositories: stableSnapshot.repositories.map((repository) => ({
        ...repository,
        cards: repository.cards.map((card) => card.task_id === initialCard.task_id
          ? { ...card, task_revision: `${initialCard.task_revision}-after-send` }
          : card),
      })),
    };
    const submitted: TaskMessageRequestV1[] = [];
    await openComposerFor(fixtureTasks.blocked.task_label, stableSnapshot, {
      fetchSnapshot: async () => refreshedSnapshot,
      sendMessage: async (request) => { submitted.push(request); },
    });
    await typeMessage('first message');
    await act(async () => sendButton().click());
    expect((document.querySelector('#composer-body') as unknown as HTMLTextAreaElement).value).toBe('');

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await typeMessage('second message');
    await act(async () => sendButton().click());

    expect(submitted).toHaveLength(2);
    expect(submitted[1]!.message_id).not.toBe(submitted[0]!.message_id);
    expect(submitted[1]).toMatchObject({
      body: 'second message',
      expected_task_revision: `${initialCard.task_revision}-after-send`,
    });
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

  test('Escape inside the composer keeps a non-empty draft and stays the close key everywhere else', async () => {
    await openComposerFor(fixtureTasks.blocked.task_label);
    await typeMessage('the base moved, rebase first');
    const textarea = document.querySelector('#composer-body') as unknown as HTMLTextAreaElement;

    // Escape is the IME candidate-cancel key. Closing the drawer on it would
    // unmount the composer and take the draft and its message id with it.
    await act(async () => {
      textarea.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event);
    });
    expect(composerPanel()).not.toBeNull();
    expect((document.querySelector('#composer-body') as unknown as HTMLTextAreaElement).value)
      .toBe('the base moved, rebase first');

    await act(async () => {
      document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event);
    });
    expect(composerPanel()).toBeNull();
  });

  test('Escape from an empty composer still closes the pane', async () => {
    await openComposerFor(fixtureTasks.blocked.task_label);
    const textarea = document.querySelector('#composer-body') as unknown as HTMLTextAreaElement;

    await act(async () => {
      textarea.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event);
    });
    expect(composerPanel()).toBeNull();
    expect(document.querySelector('.detail-pane [data-slot="composer"]')).toBeNull();
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
    expect(sendButton().textContent).toBe(`发给持有者 — claim …${blockedClaim} · gen 3`);
    // Identity and the write boundary contract stay untranslated.
    expect(panel).toContain(`claim …${blockedClaim}`);
    // The write boundary is board copy, not identity, so it follows the locale.
    expect(panel).toContain('只写任务消息');
    expect(panel).not.toContain('writes: task message only · no lease, no merge');
  });
});

describe('operator web composer target truth', () => {
  const composerToggle = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('.composer__toggle')!;
  const composerPanel = (): Element | null => document.querySelector('.composer__panel');
  const sendButton = (): HTMLButtonElement => {
    const button = document.querySelector('[data-write-action="task-message"]');
    if (!(button instanceof window.HTMLButtonElement)) throw new Error('send button not found');
    return button as unknown as HTMLButtonElement;
  };

  /**
   * The server accepts claim-scoped delivery only for a `bound` lease, so a task
   * held under any other state still queues on the task. The scope is therefore
   * correct and the copy was not: the board claimed nobody held a task whose
   * claim it was printing two panels higher.
   */
  const heldCases = [
    { task: fixtureTasks.reserving, group: 'Claimed / under review', lease: 'reserving', zhLease: '预留中' },
    { task: fixtureTasks.completing, group: 'Claimed / under review', lease: 'completing', zhLease: '收尾中' },
    { task: fixtureTasks.reviewing, group: 'Claimed / under review', lease: 'reviewing', zhLease: '审查中' },
    { task: fixtureTasks.reviewingUnpublished, group: 'Unclassified', lease: 'reviewing', zhLease: '审查中' },
    { task: fixtureTasks.leaseUnknown, group: 'Unclassified', lease: 'unknown', zhLease: '未知' },
  ] as const;

  async function openLeaseStateComposer(
    label: string,
    group: string,
    props: Partial<React.ComponentProps<typeof OperatorApp>> = {},
  ): Promise<void> {
    installDom(true);
    await mount(
      <OperatorApp initialState={projectSnapshotViewState(leaseStateSnapshot)} initialLocale="en" {...props} />,
    );
    await act(async () => buttonWithText(group).click());
    await act(async () => buttonWithText(label).click());
    await act(async () => composerToggle().click());
  }

  test.each([...heldCases])('names the $lease holder instead of claiming the task is unheld', async (entry) => {
    const claim = entry.task.claim_id.slice(-8);
    await openLeaseStateComposer(entry.task.task_label, entry.group);

    const panel = composerPanel()?.textContent ?? '';
    expect(panel).toContain(`…${claim}`);
    expect(panel).toContain('gen 3');
    expect(panel).toContain(entry.lease);
    expect(composerToggle().textContent).toContain(`…${claim}`);
    expect(sendButton().textContent).toContain(`…${claim}`);

    expect(panel).not.toContain('Nobody holds this task now');
    expect(panel).not.toContain('no current claim');
    expect(composerToggle().textContent).not.toContain('Queue message for next claimant');
    expect(sendButton().textContent).not.toBe('Send to the next claimant');
  });

  test.each([...heldCases])('names the $lease holder in Chinese too', async (entry) => {
    const claim = entry.task.claim_id.slice(-8);
    await openLeaseStateComposer(entry.task.task_label, entry.group);
    await act(async () => buttonWithText('中').click());

    const panel = composerPanel()?.textContent ?? '';
    expect(panel).toContain(`…${claim}`);
    expect(panel).toContain(entry.zhLease);
    expect(panel).not.toContain('Nobody holds this task now');
    expect(panel).not.toContain('waits for the next claimant');
  });

  test('keeps the envelope task-scoped while naming the holder', async () => {
    const submitted: TaskMessageRequestV1[] = [];
    const entry = heldCases[0];
    const healthy = { ...leaseStateSnapshot, snapshot_consistency: 'stable' as const,
      repositories: [{ ...leaseStateSnapshot.repositories[0]!, snapshot_consistency: 'stable' as const,
        cards: leaseStateSnapshot.repositories[0]!.cards.filter(card => card.task_id === entry.task.task_id) }],
      counts: { ...leaseStateSnapshot.counts, working: 1, in_review: 0, unclassified: 0, known_tasks: 1 },
    };
    await openLeaseStateComposer(entry.task.task_label, entry.group, {
      initialState: projectSnapshotViewState(decodeOperatorFleetSnapshot(healthy)),
      sendMessage: async (request) => { submitted.push(request); },
    });

    const textarea = document.querySelector('#composer-body') as unknown as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      textarea.dispatchEvent(new window.Event('focusin', { bubbles: true }) as unknown as Event);
      setter?.call(textarea, 'the reservation never bound');
      textarea.dispatchEvent(new window.Event('keyup', { bubbles: true }) as unknown as Event);
    });
    await act(async () => sendButton().click());

    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({
      scope: 'task',
      expected_claim_id: null,
      expected_generation: null,
      expected_task_revision: entry.task.task_revision,
    });
  });

  test('still says nobody holds an unheld task', async () => {
    installDom(true);
    await mount(<OperatorApp initialState={projectSnapshotViewState(stableSnapshot)} initialLocale="en" />);
    await act(async () => buttonWithText(fixtureTasks.available.task_label).click());
    await act(async () => composerToggle().click());

    const panel = composerPanel()?.textContent ?? '';
    expect(panel).toContain('waits for the next claimant');
    expect(panel).toContain('no current claim');
    expect(sendButton().textContent).toBe('Send to the next claimant');
  });
});


describe('notification evidence detail', () => {
  const working = stableSnapshot.repositories[0]!.cards.find(card => card.task_id === fixtureTasks.working.task_id)!;
  const observation = working.inbox.delivery_evidence!.latest!;
  test.each([
    ['stopped', 'Notification stopped'], ['superseded', 'Notification superseded'],
  ] as const)('renders %s without an active delivery claim and copies its source observation', async (state, label) => {
    const snapshot: OperatorFleetSnapshotV1 = { ...stableSnapshot, repositories: [{ ...stableSnapshot.repositories[0]!, cards: [{ ...working,
      inbox: { ...working.inbox, delivery_state: 'pending', delivery_evidence: { candidate_count: 1, latest: { ...observation, effect_state: state } } },
    }] }] };
    await mount(<OperatorApp initialState={projectSnapshotViewState(snapshot)} initialLocale="en" />);
    await act(async () => buttonWithText(fixtureTasks.working.task_label).click());
    const section = document.querySelector('[aria-labelledby="detail-delivery-heading"]')!;
    expect(section.textContent).toContain(label);
    expect(section.textContent).not.toContain('pending');
    expect(section.textContent).toContain('not worker activity or completion');
    const details = section.querySelector('details')!;
    expect(details.open).toBe(false);
    await act(async () => details.querySelector('summary')!.click());
    expect(section.querySelector('time')?.getAttribute('datetime')).toBe(observation.observed_at);
    let copied = '';
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { copied = text; } } });
    const copyButtons = details.querySelectorAll('button');
    await act(async () => (copyButtons[copyButtons.length - 1] as HTMLButtonElement).click());
    expect(copied).toBe(observation.observation_sha256);
  });
  test.each([
    ['no claim', null, { candidate_count: 0, latest: null }, null, 'No current Claim.'],
    ['empty', working.claim_id, { candidate_count: 0, latest: null }, null, 'No notification records'],
    ['multiple', working.claim_id, { candidate_count: 2, latest: null }, null, '2 notification records'],
    ['unavailable', working.claim_id, null, { code: 'repo_runtime_effect_unreadable' as const, message: 'unavailable' }, 'Delivery evidence is unavailable'],
  ] as const)('distinguishes %s', async (_name, claimId, evidence, error, expected) => {
    const snapshot: OperatorFleetSnapshotV1 = { ...stableSnapshot, repositories: [{ ...stableSnapshot.repositories[0]!, cards: [{ ...working,
      claim_id: claimId, generation: claimId === null ? null : working.generation, error,
      inbox: { ...working.inbox, delivery_evidence: evidence },
    }] }] };
    await mount(<OperatorApp initialState={projectSnapshotViewState(snapshot)} initialLocale="en" />);
    await act(async () => buttonWithText(fixtureTasks.working.task_label).click());
    expect(paneText()).toContain(expected);
  });
});


describe('preparation and available work', () => {
  test('keeps healthy preparation and inline work out of claimed execution', async () => {
    const groups = groupWorklist(preparationSnapshot);
    expect(groups.find(group => group.id === 'claimed')!.count).toBe(0);
    expect(groups.find(group => group.id === 'preparation')!.cards.map(card => card.task_id)).toEqual([fixtureTasks.console.task_id, fixtureTasks.changed.task_id]);
    expect(groups.find(group => group.id === 'available')!.cards.map(card => card.task_id)).toEqual([fixtureTasks.available.task_id]);
    await mount(<OperatorApp initialSnapshot={preparationSnapshot} initialLocale="en" />);
    expect(document.querySelector('[data-state]')?.getAttribute('data-state')).toBe('stable');
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    const detail = document.querySelector('.detail-pane')?.textContent ?? '';
    expect(detail).toContain('Acquisition readiness reasons');
    expect(detail).toContain('Plan awaits approval');
    expect(detail).toContain('plan_not_approved');
    expect(detail).not.toContain('No blocker, no stalled feedback');
    await act(async () => buttonWithText('中').click());
    expect(document.querySelector('.detail-pane')?.textContent).toContain('计划等待批准');
  });
});

describe('scoped automation homepage observations', () => {
  test('switches only the selected scope and discards an aborted late response', async () => {
    const { repositoryObservationFixture } = await import('../../src/operator-web/fixture');
    const pending: { id: string; signal: AbortSignal; resolve: (value: ReturnType<typeof repositoryObservationFixture>) => void }[] = [];
    await mount(<OperatorApp initialSnapshot={stableSnapshot} initialLocale="en"
      fetchRepositoryObservation={(id, signal) => new Promise((resolve) => pending.push({ id, signal, resolve }))} />);
    expect(pending.map((row) => row.id)).toEqual(['repo-harness']);
    await selectRepository('repo-console');
    expect(pending[0]!.signal.aborted).toBe(true);
    expect(pending.map((row) => row.id)).toEqual(['repo-harness', 'repo-console']);
    await act(async () => pending[1]!.resolve(repositoryObservationFixture('repo-console')));
    const summary = () => document.querySelector('.automation-summary')!;
    expect(summary().textContent).toContain('repo-console');
    await act(async () => pending[0]!.resolve(repositoryObservationFixture('repo-harness')));
    expect(summary().textContent).not.toContain('repo-harness');
    expect(summary().getAttribute('data-observation-status')).toBe('ready');
    await act(async () => root?.unmount()); root = null;
    expect(pending[1]!.signal.aborted).toBe(true);
  });

  test('refresh supersedes an in-flight response and accepts a current service epoch reset', async () => {
    const { repositoryObservationFixture } = await import('../../src/operator-web/fixture');
    const pending: { signal: AbortSignal; resolve: (value: ReturnType<typeof repositoryObservationFixture>) => void }[] = [];
    await mount(<OperatorApp initialSnapshot={stableSnapshot} initialLocale="en" fetchSnapshot={async () => stableSnapshot}
      fetchRepositoryObservation={(_id, signal) => new Promise((resolve) => pending.push({ signal, resolve }))} />);
    await act(async () => buttonWithText('Refresh').click());
    expect(pending).toHaveLength(2);
    expect(pending[0]!.signal.aborted).toBe(true);
    const next = repositoryObservationFixture();
    await act(async () => pending[1]!.resolve({ ...next, generation: 1,
      service_epoch: '00000000-0000-4000-8000-000000000002', snapshot: { ...next.snapshot, sequence: 1 } }));
    await act(async () => pending[0]!.resolve(next));
    expect(document.querySelector('.automation-summary')?.textContent).toContain('00000000-0000-4000-8000-000000000002');
    expect(document.querySelector('.automation-summary')?.textContent).not.toContain('00000000-0000-4000-8000-000000000001');
  });

  test('rejects a wrong scope and labels retained evidence when a refresh fails', async () => {
    const { repositoryObservationFixture } = await import('../../src/operator-web/fixture');
    let request = 0;
    await mount(<OperatorApp initialSnapshot={stableSnapshot} initialLocale="en" fetchSnapshot={async () => stableSnapshot}
      fetchRepositoryObservation={async () => {
        request += 1;
        if (request === 1) return repositoryObservationFixture();
        if (request === 2) return repositoryObservationFixture('repo-console');
        throw new Error('private diagnostic must not be rendered');
      }} />);
    await act(async () => buttonWithText('Refresh').click());
    expect(document.querySelector('.automation-summary')?.getAttribute('data-observation-status')).toBe('failed');
    expect(document.querySelector('.automation-summary')?.textContent).toContain('Previous observation');
    expect(document.querySelector('.automation-summary')?.textContent).not.toContain('repo-console');
    await act(async () => buttonWithText('Refresh').click());
    expect(document.querySelector('.automation-summary')?.textContent).not.toContain('private diagnostic');
    expect(document.querySelector('.automation-summary')?.textContent).toContain('Read failed');
  });
});


test('does not relabel a regressed generation in the same service epoch as current', async () => {
  const { repositoryObservationFixture } = await import('../../src/operator-web/fixture');
  let calls = 0;
  await mount(<OperatorApp initialSnapshot={stableSnapshot} initialLocale="en" fetchSnapshot={async () => stableSnapshot}
    fetchRepositoryObservation={async () => {
      const value = repositoryObservationFixture();
      return calls++ === 0 ? value : { ...value, generation: 1, snapshot: { ...value.snapshot, sequence: 1 } };
    }} />);
  await act(async () => buttonWithText('Refresh').click());
  expect(document.querySelector('.automation-summary')?.getAttribute('data-observation-status')).toBe('failed');
  expect(document.querySelector('.automation-summary')?.textContent).toContain('Previous observation');
});

describe('task detail original evidence', () => {
  const task = fixtureTasks.working;
  const evidenceProps = () => ({ repositoryId: 'repo-harness', taskId: task.task_id, revision: task.task_revision, generation: 0, t: ((key: never, args: never) => translate('en', key, args)) as import('../../src/operator-web/i18n').OperatorTranslate });

  test('shows original context, recipient ACK and recorded actor without interpreting adoption; exact reply and parent lookup', async () => {
    const { TaskEvidence } = await import('../../src/operator-web/TaskEvidence');
    const { taskContextFixture, taskActivityFixture } = await import('../../src/operator-web/fixture');
    const requests: import('../../src/core/operator/task-activity').OperatorTaskActivityRequest[] = [];
    await mount(<TaskEvidence {...evidenceProps()} readContext={async request => taskContextFixture(request)} readActivity={async request => { requests.push(request); return taskActivityFixture(request); }} />);
    expect(document.body.textContent).toContain(task.task_label);
    expect(document.body.textContent).toContain('acknowledged');
    expect(document.body.textContent).toContain('recorded_claim_actor');
    expect(document.body.textContent).toContain('do not prove adoption');
    expect(requests[0]).toEqual({ repository_id: 'repo-harness', task_id: task.task_id, limit: 50, after: null, message_id: null });
    await act(async () => buttonWithText('Read reply message').click());
    expect(requests.at(-1)?.limit).toBe(1);
    expect(requests.at(-1)?.message_id).toBe('22222222-2222-4222-8222-222222222222');
    expect(document.querySelectorAll('.task-evidence__message')).toHaveLength(1);
    await act(async () => buttonWithText('Read parent message').click());
    expect(requests.at(-1)?.message_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(document.body.textContent).not.toContain('The boundary is preserved; inspect');
    await act(async () => buttonWithText('Return to first page').click());
    expect(document.querySelectorAll('.task-evidence__message')).toHaveLength(2);
  });

  test('rejects wrong context scope independently and renders empty untrusted bodies as text', async () => {
    const { TaskEvidence } = await import('../../src/operator-web/TaskEvidence');
    const { taskContextFixture, taskActivityFixture } = await import('../../src/operator-web/fixture');
    await mount(<TaskEvidence {...evidenceProps()} readContext={async request => ({ ...taskContextFixture(request), repository_id: 'wrong' })} readActivity={async request => {
      const value = taskActivityFixture(request);
      return { ...value, entries: value.entries.map((entry, index) => ({ ...entry, event: { ...entry.event, body: index === 0 ? '<img src=x onerror=alert(1)>' : '' } })) };
    }} />);
    expect(document.querySelector('.task-evidence__context')?.textContent).toContain('Evidence unavailable');
    expect(document.querySelector('.task-evidence__activity')?.textContent).toContain('(Empty message body)');
    expect(document.querySelector('.task-evidence__activity')?.textContent).toContain('<img src=x');
    expect(document.querySelector('.task-evidence img')).toBeNull();
    expect(document.querySelector('.task-evidence__context')?.textContent).not.toContain(task.task_label);
  });

  test('cancels both sources on task revision switch and ignores late replies from transports ignoring abort', async () => {
    const { TaskEvidence } = await import('../../src/operator-web/TaskEvidence');
    const { taskContextFixture, taskActivityFixture } = await import('../../src/operator-web/fixture');
    const contexts: { request: import('../../src/core/operator/task-context').OperatorTaskContextRequest; signal: AbortSignal; resolve: (value: import('../../src/core/operator/task-context').OperatorTaskContext) => void }[] = [];
    const activities: { request: import('../../src/core/operator/task-activity').OperatorTaskActivityRequest; signal: AbortSignal; resolve: (value: import('../../src/core/operator/task-activity').OperatorTaskActivity) => void }[] = [];
    const readContext: import('../../src/operator-web/TaskEvidence').TaskContextReader = (request, signal) => new Promise(resolve => contexts.push({ request, signal, resolve }));
    const readActivity: import('../../src/operator-web/TaskEvidence').TaskActivityReader = (request, signal) => new Promise(resolve => activities.push({ request, signal, resolve }));
    await mount(<TaskEvidence {...evidenceProps()} readContext={readContext} readActivity={readActivity} />);
    await act(async () => root?.render(<TaskEvidence {...evidenceProps()} revision={'c'.repeat(64)} readContext={readContext} readActivity={readActivity} />));
    expect(contexts[0].signal.aborted).toBe(true);
    expect(activities[0].signal.aborted).toBe(true);
    expect(contexts[1].request.expected_task_revision).toBe('c'.repeat(64));
    await act(async () => { contexts[0].resolve(taskContextFixture(contexts[0].request)); activities[0].resolve(taskActivityFixture(activities[0].request)); });
    expect(document.body.textContent).not.toContain(task.task_label);
    expect(document.querySelectorAll('.task-evidence__message')).toHaveLength(0);
    await act(async () => { contexts[1].resolve(taskContextFixture(contexts[1].request)); activities[1].resolve(taskActivityFixture(activities[1].request)); });
    expect(document.body.textContent).toContain(task.task_label);
    await act(async () => root?.unmount()); root = null;
    expect(contexts[1].signal.aborted).toBe(true);
    expect(activities[1].signal.aborted).toBe(true);
  });

  test('refresh failure retains only labelled historical evidence and hides raw diagnostics', async () => {
    const { TaskEvidence } = await import('../../src/operator-web/TaskEvidence');
    const { taskContextFixture, taskActivityFixture } = await import('../../src/operator-web/fixture');
    let fail = false;
    const readContext: import('../../src/operator-web/TaskEvidence').TaskContextReader = async request => { if (fail) throw new Error('/private/secret'); return taskContextFixture(request); };
    const readActivity: import('../../src/operator-web/TaskEvidence').TaskActivityReader = async request => { if (fail) throw new Error('timeout'); return taskActivityFixture(request); };
    await mount(<TaskEvidence {...evidenceProps()} readContext={readContext} readActivity={readActivity} />);
    fail = true;
    await act(async () => root?.render(<TaskEvidence {...evidenceProps()} generation={1} readContext={readContext} readActivity={readActivity} />));
    expect(document.querySelectorAll('.task-evidence__historical')).toHaveLength(2);
    expect(document.body.textContent).toContain(task.task_label);
    expect(document.body.textContent).not.toContain('/private/secret');
    expect(document.body.textContent).toContain('timeout');
  });

  test('replaces a full bounded page and preserves partial coverage instead of accumulating history', async () => {
    const { TaskEvidence } = await import('../../src/operator-web/TaskEvidence');
    const { taskContextFixture, taskActivityFixture } = await import('../../src/operator-web/fixture');
    const requests: import('../../src/core/operator/task-activity').OperatorTaskActivityRequest[] = [];
    const readActivity: import('../../src/operator-web/TaskEvidence').TaskActivityReader = async request => {
      requests.push(request);
      const value = taskActivityFixture({ ...request, after: null });
      const entry = { ...value.entries[0], receipts: [], replies: [] };
      const entries = Array.from({ length: 50 }, (_, i) => ({ ...entry, event: { ...entry.event, message_id: `${String(i + 1).padStart(8, '0')}-1111-4111-8111-111111111111`, body: `page-one-${i}` } }));
      return request.after === null ? { ...value, entries, coverage: { ...value.coverage, complete: false, reason: 'page', scanned: 50 }, next_cursor: entries[49].event.message_id } : { ...value, after: request.after, entries: [], coverage: { ...value.coverage, complete: false, reason: 'scan' }, next_cursor: null };
    };
    await mount(<TaskEvidence {...evidenceProps()} readContext={async request => taskContextFixture(request)} readActivity={readActivity} />);
    expect(document.querySelectorAll('.task-evidence__message')).toHaveLength(50);
    expect(document.body.textContent).toContain('Partial history');
    await act(async () => buttonWithText('Next page').click());
    expect(requests[1].after).toBe('00000050-1111-4111-8111-111111111111');
    expect(document.querySelectorAll('.task-evidence__message')).toHaveLength(0);
    expect(document.body.textContent).not.toContain('page-one');
    expect(document.body.textContent).toContain('scan');
    expect(document.body.textContent).not.toContain('Next page');
  });
});

test('OperatorApp selects, refreshes and cancels exact task evidence without a message write', async () => {
  const { taskContextFixture, taskActivityFixture } = await import('../../src/operator-web/fixture');
  const contexts: { request: import('../../src/core/operator/task-context').OperatorTaskContextRequest; signal: AbortSignal }[] = [];
  const activities: { request: import('../../src/core/operator/task-activity').OperatorTaskActivityRequest; signal: AbortSignal }[] = [];
  let writes = 0;
  await mount(<OperatorApp initialSnapshot={stableSnapshot} initialLocale="zh" fetchSnapshot={async () => stableSnapshot} sendMessage={async () => { writes += 1; }}
    readTaskContext={async (request, signal) => { contexts.push({ request, signal }); return taskContextFixture(request); }}
    readTaskActivity={async (request, signal) => { activities.push({ request, signal }); return taskActivityFixture(request); }} />);
  expect(contexts).toHaveLength(0);
  expect(activities).toHaveLength(0);
  await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
  expect(document.querySelector('.task-evidence')?.textContent).toContain('Steer 与回复历史');
  expect(contexts[0].request).toEqual({ repository_id: 'repo-harness', task_id: fixtureTasks.blocked.task_id, expected_task_revision: fixtureTasks.blocked.task_revision });
  await act(async () => buttonWithText('刷新').click());
  expect(contexts).toHaveLength(2);
  expect(activities).toHaveLength(2);
  expect(contexts[0].signal.aborted).toBe(true);
  await selectRepository('repo-console');
  expect(contexts[1].signal.aborted).toBe(true);
  expect(activities[1].signal.aborted).toBe(true);
  expect(document.querySelector('.task-evidence')).toBeNull();
  expect(writes).toBe(0);
});
