import { buildEngineeringOverlaySnapshot, projectOrganizationAttention } from '../../src/core/engineers/engineering-overlay';
import { projectOperatorOrganizationSnapshot, decodeOperatorOrganizationSnapshot } from '../../src/core/operator/organization-snapshot';
import { OrganizationSummary } from '../../src/operator-web/OrganizationSummary';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';

import { projectOperatorWorkExchangeSnapshot } from '../../src/core/operator/collaboration-snapshot';
import type { CollaborativeWorkExchangeSnapshotV1 } from '../../src/core/collaboration/work-exchange';
import {
  CollaborationPane,
  fetchOperatorCollaborationSnapshot,
  fetchOperatorSnapshot,
  OperatorApp,
} from '../../src/operator-web/App';
import {
  changedCollaborationSnapshot,
  collaborationSnapshot,
  exchangeSnapshot as exchangeFixture,
  collaborationObservationFixture,
  degradedCollaborationSnapshot,
  fixtureTasks,
  offCollaborationSnapshot,
  stableSnapshot,
} from '../../src/operator-web/fixture';
import { translate } from '../../src/operator-web/i18n';
import {
  decodeOperatorCollaborationSnapshot,
  projectSnapshotViewState,
  type OperatorCollaborationSnapshotV2,
} from '../../src/operator-web/types';

let root: Root | null = null;
let window: Window;

/**
 * The persistent-pane layout, because that is the only layout in which the
 * collaboration surface is reachable without a selection. In the narrow layout
 * the detail pane is a modal that exists only for a selected task, so the "read
 * a repository's lanes" hint is correctly unreachable there.
 */
function installDom(): void {
  window = new Window({ url: 'http://127.0.0.1:4318/' });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({
      matches: true,
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

async function mount(node: React.ReactElement): Promise<void> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
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
  if (!(button instanceof window.HTMLElement)) throw new Error(`button not found: ${text}`);
  return button as unknown as HTMLButtonElement;
}

function paneText(): string {
  return document.querySelector('.collab-pane')?.textContent ?? '';
}

function render(snapshot: OperatorCollaborationSnapshotV2, locale: 'en' | 'zh' = 'en'): string {
  return renderToStaticMarkup(
    <OperatorApp
      initialState={projectSnapshotViewState(stableSnapshot)}
      initialLocale={locale}
      initialCollaboration={{ kind: 'ready', snapshot }}
    />,
  );
}

/**
 * A hand-built exchange snapshot, used only where the projection's *omissions*
 * are the subject. The served-payload redaction proof lives in
 * `tests/cli/operator-serve.test.ts` and runs against a real store; this one
 * exists so a field the collector produces can be shown to be dropped without
 * standing up four stores to produce it.
 */
function exchangeSnapshot(
  overrides: Partial<CollaborativeWorkExchangeSnapshotV1> = {},
): CollaborativeWorkExchangeSnapshotV1 {
  return {
    protocol: 1,
    kind: 'repo-harness-collaborative-work-exchange-snapshot',
    repository_id: 'repo_a5b76eee64af71c3',
    execution_offers: [],
    active_participants: [],
    threads: [],
    relevant_signals: [],
    open_handoffs: [],
    contribution_opportunities: [],
    source_snapshot_sha256: `sha256:${'a'.repeat(64)}`,
    unverified_execution_context_count: 0,
    snapshot_consistency: 'stable',
    snapshot_sha256: `sha256:${'b'.repeat(64)}`,
    ...overrides,
  } as CollaborativeWorkExchangeSnapshotV1;
}

beforeEach(() => {
  installDom();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  window.close();
});

describe('operator collaboration projection', () => {
  test('UX-operator-collaboration-v1-P2 drops the offer list and the document digest it belongs to', () => {
    const projected = projectOperatorWorkExchangeSnapshot({
      snapshot: exchangeSnapshot({
        execution_offers: [{
          offer: { sprint_path: 'plans/sprints/demo.sprint.md', offer_revision: `sha256:${'c'.repeat(64)}` },
          offer_revision: `sha256:${'c'.repeat(64)}`,
        }],
      } as unknown as Partial<CollaborativeWorkExchangeSnapshotV1>),
      mode: 'shadow',
      degraded_sources: [],
      changed_sources: [],
    });
    const serialized = JSON.stringify(projected);

    expect(serialized).not.toContain('execution_offers');
    expect(serialized).not.toContain('sprint_path');
    expect(serialized).not.toContain('offer_revision');
    expect(projected).not.toHaveProperty('snapshot_sha256');
    expect(projected.source_snapshot_sha256).toBe(`sha256:${'a'.repeat(64)}`);
  });

  test('reduces a proven execution context to its discriminant and keeps null distinct from none', () => {
    const projected = projectOperatorWorkExchangeSnapshot({
      snapshot: exchangeSnapshot({
        open_handoffs: [
          {
            handoff_id: '1'.repeat(64),
            handoff_sha256: `sha256:${'1'.repeat(64)}`,
            thread_key: 'lane',
            actor_lineage: 'module_engineerengineer:capability.runtime-harness.collaboration',
            trigger: 'budget_low',
            goal: 'proven',
            next_action_count: 0,
            open_hypothesis_count: 0,
            adoption_count: 0,
            created_at: '2026-08-30T09:00:00.000Z',
            execution_context: {
              kind: 'bound_task',
              task_id: '2'.repeat(64),
              task_revision: '3'.repeat(64),
              claim_id: '7c7c7c7c-7c7c-4c7c-8c7c-7c7c7c7c7c7c',
              lease_generation: 4,
              work_envelope_sha256: `sha256:${'4'.repeat(64)}`,
              task_freeze_receipt_sha256: `sha256:${'5'.repeat(64)}`,
            },
          },
          {
            handoff_id: '6'.repeat(64),
            handoff_sha256: `sha256:${'6'.repeat(64)}`,
            thread_key: 'lane',
            actor_lineage: 'module_engineerengineer:capability.runtime-harness.collaboration',
            trigger: 'budget_low',
            goal: 'declared none',
            next_action_count: 0,
            open_hypothesis_count: 0,
            adoption_count: 0,
            created_at: '2026-08-30T08:00:00.000Z',
            execution_context: { kind: 'none' },
          },
          {
            handoff_id: '7'.repeat(64),
            handoff_sha256: `sha256:${'7'.repeat(64)}`,
            thread_key: 'lane',
            actor_lineage: 'module_engineerengineer:capability.runtime-harness.collaboration',
            trigger: 'budget_low',
            goal: 'withheld',
            next_action_count: 0,
            open_hypothesis_count: 0,
            adoption_count: 0,
            created_at: '2026-08-30T07:00:00.000Z',
            execution_context: null,
          },
        ],
        unverified_execution_context_count: 1,
      } as unknown as Partial<CollaborativeWorkExchangeSnapshotV1>),
      mode: 'active',
      degraded_sources: [],
      changed_sources: [],
    });

    expect(projected.handoffs.map((handoff) => handoff.execution_context_kind))
      .toEqual(['bound_task', 'none', null]);
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('7c7c7c7c');
    expect(serialized).not.toContain('lease_generation');
    expect(serialized).not.toContain('task_freeze_receipt_sha256');
  });

  test('orders lanes by the hotspot score and discoveries by recorded time', () => {
    const projected = projectOperatorWorkExchangeSnapshot({
      snapshot: exchangeSnapshot({
        threads: [
          { thread_key: 'cool', hotspot_score: 12, signal_count: 1, distinct_contributor_count: 1, latest_signal_at: '2026-08-30T01:00:00.000Z', artifact_ref_count: 0, unadopted_handoff_count: 0, adoption_count: 0, cross_thread_reference_count: 0, recency_rank: 1, thread_sha256: `sha256:${'8'.repeat(64)}` },
          { thread_key: 'hot', hotspot_score: 90, signal_count: 4, distinct_contributor_count: 2, latest_signal_at: '2026-08-30T05:00:00.000Z', artifact_ref_count: 2, unadopted_handoff_count: 0, adoption_count: 0, cross_thread_reference_count: 0, recency_rank: 4, thread_sha256: `sha256:${'9'.repeat(64)}` },
        ],
        relevant_signals: [
          { signal_id: 'a'.repeat(64), signal_sha256: `sha256:${'a'.repeat(64)}`, thread_key: 'hot', actor_lineage: 'x', title: 'older', labels: [], artifact_ref_count: 0, created_at: '2026-08-30T01:00:00.000Z', superseded: false },
          { signal_id: 'b'.repeat(64), signal_sha256: `sha256:${'b'.repeat(64)}`, thread_key: 'hot', actor_lineage: 'x', title: 'newer', labels: [], artifact_ref_count: 0, created_at: '2026-08-30T05:00:00.000Z', superseded: false },
        ],
      } as unknown as Partial<CollaborativeWorkExchangeSnapshotV1>),
      mode: 'shadow',
      degraded_sources: [],
      changed_sources: [],
    });

    expect(projected.threads.map((thread) => thread.thread_key)).toEqual(['hot', 'cool']);
    expect(projected.signals.map((signal) => signal.title)).toEqual(['newer', 'older']);
  });

  test('the browser decoder accepts the projection and refuses a payload it cannot read', () => {
    expect(decodeOperatorCollaborationSnapshot(JSON.parse(JSON.stringify(collaborationSnapshot))))
      .toEqual(collaborationSnapshot);

    for (const broken of [
      { ...collaborationSnapshot, protocol: 1 },
      { ...collaborationSnapshot, mode: 'paused' },
      { ...collaborationSnapshot, degraded_sources: ['leases'] },
      { ...collaborationSnapshot, source_snapshot_sha256: 'a'.repeat(64) },
      {
        ...collaborationSnapshot,
        handoffs: [{ ...exchangeFixture.handoffs[0]!, execution_context_kind: 'merge' }],
      },
      { ...collaborationSnapshot, unverified_execution_context_count: -1 },
    ]) {
      expect(() => decodeOperatorCollaborationSnapshot(broken)).toThrow('Collaboration snapshot response is invalid');
    }
  });
});

describe('operator collaboration surface', () => {
  test('UX-operator-collaboration-v1-P3 shows lanes, discoveries, handoffs with adoption counts, hotspots and contributors', () => {
    const markup = render(collaborationSnapshot);

    expect(markup).toContain('Collaboration');
    expect(markup).toContain('mode shadow');
    expect(markup).toContain('Read only. Nothing in this section writes.');

    // Lanes, hottest first, with C2's own score.
    expect(markup).toContain('capability.runtime-harness.collaboration');
    expect(markup).toContain('hotspot 87');
    expect(markup).toContain('hotspot 44');
    expect(markup.indexOf('hotspot 87')).toBeLessThan(markup.indexOf('hotspot 44'));
    expect(markup).toContain('5 signals');
    expect(markup).toContain('2 contributors');

    // Discoveries.
    expect(markup).toContain('Double-read windows must overlap or stable is an overclaim');
    expect(markup).toContain('superseded');

    // Handoffs and their adoption counts.
    expect(markup).toContain('Prove cross-source stability for the exchange collection');
    expect(markup).toContain('adopted 2x');
    expect(markup).toContain('adopted 0x');
    expect(markup).toContain('from a task held under lease');

    // Contributors and their participation form.
    expect(markup).toContain('Contributors');
    expect(markup).toContain('module engineer');
    expect(markup).toContain('delegated worker');
    expect(markup).toContain('2 signals · 1 handoffs · 2 lanes');

    // The withheld context is stated, not silently rendered as no context.
    expect(markup).toContain('execution context withheld');
    expect(markup).toContain('1 execution contexts withheld');

    // Offers are named as absent rather than shown as an empty list.
    expect(markup).toContain('Execution offers are not on this board');
  });

  test('UX-operator-collaboration-v1-N3 keeps the collaboration surface free of any mutation affordance', () => {
    const markup = render(collaborationSnapshot);
    const pane = markup.slice(markup.indexOf('collab-pane'));

    for (const affordance of [
      'Post signal', 'Publish handoff', 'Adopt', 'Acquire', 'Grant', 'Merge', 'Approve', 'Takeover',
    ]) {
      expect(pane).not.toContain(affordance);
    }
    expect(pane).not.toContain('<button');
    expect(pane).not.toContain('<form');
    expect(pane).not.toContain('<textarea');
    expect(pane).not.toContain('data-write-action');
    // The board's one write is still declared, and it is still the task message.
    expect(markup).toContain('observe-only · one write: task message');
  });

  test('UX-operator-collaboration-v1-F1 states a degraded read instead of showing fewer lanes', () => {
    const markup = render(degradedCollaborationSnapshot);

    expect(markup).toContain('This view is incomplete');
    expect(markup).toContain('handoffs, adoptions');
    expect(markup).toContain('missing here, not absent from the repository');
    // The empty handoff list is still labelled, and the banner above it says why.
    expect(markup).toContain('No handoff is open.');
    expect(markup).toContain('role="alert"');
  });

  test('UX-operator-collaboration-v1-F2 states a changed-during-read collection', () => {
    const markup = render(changedCollaborationSnapshot);

    expect(markup).toContain('The collaboration store changed while it was read');
    expect(markup).toContain('signals');
    expect(markup).toContain('Re-observe before acting on them.');
  });

  test('renders collaboration mode as a closed consistency source in both locales', () => {
    const modeChanged = collaborationObservationFixture({ ...exchangeFixture, snapshot_consistency: 'changed_during_read', changed_sources: ['mode'] });

    expect(render(modeChanged, 'en')).toContain('collaboration mode');
    expect(render(modeChanged, 'zh')).toContain('协作模式');
  });

  test('UX-operator-collaboration-v1-F3 states an unreadable store instead of an empty one', () => {
    const markup = renderToStaticMarkup(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        initialCollaboration={{
          kind: 'failed',
          repository_id: 'repo_a5b76eee64af71c3',
          error: {
            code: 'collaboration_snapshot_unavailable',
            message: 'The collaboration store cannot be read.',
            next_action: 'Check the repository collaboration store, then refresh the board.',
          },
        }}
      />,
    );

    expect(markup).toContain('The collaboration store cannot be read');
    expect(markup).toContain('Check the repository collaboration store');
    expect(markup).not.toContain('No lane has a signal in this snapshot.');
    expect(markup).not.toContain('Nobody has published to this repository.');
  });

  test('renders a typed collaboration failure in the operator locale, not the server sentence', () => {
    const failed = {
      kind: 'failed',
      repository_id: 'repo_a5b76eee64af71c3',
      error: {
        code: 'collaboration_snapshot_timeout',
        message: 'The collaboration snapshot timed out.',
        next_action: 'Refresh the collaboration panel and retry.',
      },
    } as const;
    const chinese = renderToStaticMarkup(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="zh"
        initialCollaboration={failed}
      />,
    );

    expect(chinese).not.toContain('The collaboration snapshot timed out.');
    expect(chinese).not.toContain('Refresh the collaboration panel and retry.');
    expect(chinese).toContain('协作');
  });

  /**
   * The transport error catalogue is closed, but a server ahead of this bundle
   * could still name a code the dictionary does not carry. That sentence is
   * shown, and labelled as the server's own English rather than board copy.
   */
  test('labels an unknown error code as an untranslated server message', () => {
    const failed = {
      kind: 'failed',
      repository_id: 'repo_a5b76eee64af71c3',
      error: {
        code: 'collaboration_snapshot_from_a_newer_server',
        message: 'A newer server refused the read.',
        next_action: 'Upgrade the operator UI bundle.',
      },
    } as const;
    const chinese = renderToStaticMarkup(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="zh"
        initialCollaboration={failed}
      />,
    );

    expect(chinese).toContain('A newer server refused the read.');
    expect(chinese).toContain(translate('zh', 'error.untranslated'));
  });

  test('keeps "nothing read yet" and "read and empty" apart', () => {
    const idle = renderToStaticMarkup(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        initialCollaboration={{ kind: 'idle' }}
      />,
    );
    expect(idle).toContain('Select a task to read its repository collaboration lanes.');
    expect(idle).not.toContain('No lane has a signal in this snapshot.');

    const emptyStore = render(collaborationObservationFixture({
      ...exchangeFixture,
      threads: [],
      signals: [],
      handoffs: [],
      participants: [],
      opportunities: [],
      unverified_execution_context_count: 0,
    }));
    expect(emptyStore).toContain('No lane has a signal in this snapshot.');
    expect(emptyStore).toContain('Nobody has published to this repository.');
    expect(emptyStore).not.toContain('Select a task to read its repository collaboration lanes.');
  });

  test('says collaboration is off without pretending the store is empty', () => {
    const markup = render(offCollaborationSnapshot);

    expect(markup).toContain('Collaboration is switched off for this repository');
    expect(markup).toContain('mode off');
    expect(markup).toContain('Double-read windows must overlap or stable is an overclaim');
  });

  test('renders every new panel string in Chinese', () => {
    const markup = render(collaborationSnapshot, 'zh');

    expect(markup).toContain('协作');
    expect(markup).toContain('模式 影子');
    expect(markup).toContain('Lane');
    expect(markup).toContain('发现');
    expect(markup).toContain('未关闭的交接');
    expect(markup).toContain('参与者');
    expect(markup).toContain('被接 2 次');
    expect(markup).toContain('执行上下文被扣下');
    expect(markup).toContain('热度 87');
  });

  test('a lane list is one section and never becomes a control', () => {
    const markup = renderToStaticMarkup(
      <CollaborationPane
        state={{ kind: 'loading', repository_id: 'repo_a5b76eee64af71c3' }}
        t={(key) => key}
      />,
    );
    expect(markup).toContain('collab.loading');
    expect(markup).not.toContain('<button');
  });
});

describe('operator collaboration read', () => {
  test('UX-operator-collaboration-v1-P4 reads the selected repository before task selection and shares it across task details', async () => {
    const asked: string[] = [];
    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        fetchSnapshot={async () => stableSnapshot}
        fetchCollaboration={async (repositoryId) => {
          asked.push(repositoryId);
          return collaborationObservationFixture({ ...exchangeFixture, repository_id: repositoryId });
        }}
      />,
    );

    // The default selected repository is observed before any Task is opened.
    expect(asked).toEqual(['repo-harness']);
    expect(paneText()).toContain('repository repo-harness');

    await selectRepository('repo-console');
    await act(async () => buttonWithText(fixtureTasks.console.task_label).click());
    expect(asked).toEqual(['repo-harness', 'repo-console']);
    expect(paneText()).toContain('repository repo-console');
    expect(paneText()).toContain('hotspot 87');

    // An explicit board refresh also re-reads the selected repository, while
    // keeping the selection and avoiding reads for every other repository.
    await act(async () => buttonWithText('Refresh').click());
    expect(asked).toEqual(['repo-harness', 'repo-console', 'repo-console']);
    expect(paneText()).toContain('repository repo-console');

    // Selecting a task in another repository moves the scope.
    await selectRepository('repo-harness');
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect(asked).toEqual(['repo-harness', 'repo-console', 'repo-console', 'repo-harness']);
    expect(paneText()).toContain('repository repo-harness');
  });

  test('a failed collaboration read leaves the rest of the board working', async () => {
    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        fetchCollaboration={async () => {
          throw {
            code: 'collaboration_snapshot_unavailable',
            message: 'The collaboration store cannot be read.',
            next_action: 'Check the repository collaboration store, then refresh the board.',
          };
        }}
      />,
    );

    await selectRepository('repo-harness');
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect(paneText()).toContain('The collaboration store cannot be read');
    expect(paneText()).not.toContain('No lane has a signal in this snapshot.');
    // The task's own detail and the one write are untouched by the failure.
    expect(document.querySelector('.detail-pane')?.textContent)
      .toContain('The base branch moved after verification');
    expect(document.querySelector('.detail-pane [data-slot="composer"]')).not.toBeNull();
  });

  test('explicit board refresh retries a failed collaboration read without changing selection', async () => {
    const asked: string[] = [];
    let attempts = 0;
    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        fetchSnapshot={async () => stableSnapshot}
        fetchCollaboration={async (repositoryId) => {
          asked.push(repositoryId);
          attempts += 1;
          if (attempts === 1) {
            throw {
              code: 'collaboration_snapshot_unavailable',
              message: 'The collaboration store cannot be read.',
              next_action: 'Check the repository collaboration store, then refresh the board.',
            };
          }
          return collaborationObservationFixture({ ...exchangeFixture, repository_id: repositoryId, source_snapshot_sha256: `sha256:${'f'.repeat(64)}` });
        }}
      />,
    );

    await selectRepository('repo-harness');
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect(asked).toEqual(['repo-harness']);
    expect(paneText()).toContain('The collaboration store cannot be read');

    await act(async () => buttonWithText('Refresh').click());
    expect(asked).toEqual(['repo-harness', 'repo-harness']);
    expect(paneText()).toContain(`sha256:${'f'.repeat(64)}`);
    expect(document.querySelector('.detail-pane')?.textContent).toContain(fixtureTasks.blocked.task_label);
  });

  test('late collaboration responses cannot replace the repository selected later', async () => {
    const pending = new Map<string, Array<(snapshot: OperatorCollaborationSnapshotV2) => void>>();
    const fetchCollaboration = (repositoryId: string): Promise<OperatorCollaborationSnapshotV2> => new Promise((resolve) => {
      const requests = pending.get(repositoryId) ?? [];
      requests.push(resolve);
      pending.set(repositoryId, requests);
    });

    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        fetchCollaboration={fetchCollaboration}
      />,
    );
    await selectRepository('repo-console');
    await act(async () => buttonWithText(fixtureTasks.console.task_label).click());
    await selectRepository('repo-harness');
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect(paneText()).toContain('repository repo-harness');

    await act(async () => {
      pending.get('repo-console')?.[0]?.(collaborationObservationFixture({ ...exchangeFixture, repository_id: 'repo-console' }));
    });
    expect(paneText()).toContain('repository repo-harness');
    expect(paneText()).not.toContain('hotspot 87');

    await act(async () => {
      pending.get('repo-harness')?.at(-1)?.(collaborationObservationFixture({ ...exchangeFixture, repository_id: 'repo-harness' }));
    });
    expect(paneText()).toContain('repository repo-harness');
    expect(paneText()).toContain('hotspot 87');
  });

  test('aborts the obsolete collaboration request when selection moves to another repository', async () => {
    const requests: Array<{
      readonly repositoryId: string;
      readonly signal: AbortSignal;
      readonly resolve: (snapshot: OperatorCollaborationSnapshotV2) => void;
    }> = [];
    const fetchCollaboration = (repositoryId: string, signal: AbortSignal): Promise<OperatorCollaborationSnapshotV2> => new Promise((resolve, reject) => {
      requests.push({ repositoryId, signal, resolve });
      signal.addEventListener('abort', () => {
        const error = new Error('superseded');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });

    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        fetchCollaboration={fetchCollaboration}
      />,
    );
    await selectRepository('repo-console');
    await act(async () => buttonWithText(fixtureTasks.console.task_label).click());
    await selectRepository('repo-harness');
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());

    expect(requests.map((request) => request.repositoryId)).toEqual(['repo-harness', 'repo-console', 'repo-harness']);
    expect(requests[0]!.signal.aborted).toBe(true);
    expect(requests[1]!.signal.aborted).toBe(true);
    expect(requests[2]!.signal.aborted).toBe(false);
    expect(paneText()).toContain('repository repo-harness');
    expect(paneText()).not.toContain('The collaboration store cannot be read');
  });

  test('keeps the repository observation active when only the task is deselected', async () => {
    const observed: { signal: AbortSignal | null } = { signal: null };
    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        fetchCollaboration={async (_repositoryId, nextSignal) => {
          observed.signal = nextSignal;
          return new Promise<OperatorCollaborationSnapshotV2>(() => {});
        }}
      />,
    );
    await selectRepository('repo-harness');
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect(observed.signal?.aborted).toBe(false);

    const close = document.querySelector<HTMLButtonElement>('[aria-label="Close task details"]');
    if (!close) throw new Error('close button not found');
    await act(async () => close.click());

    expect(observed.signal?.aborted).toBe(false);
    expect(paneText()).toContain('Reading the collaboration store');
  });

  test('refresh supersedes a collaboration generation without showing an abort failure', async () => {
    const signals: AbortSignal[] = [];
    const fetchCollaboration = async (repositoryId: string, signal: AbortSignal): Promise<OperatorCollaborationSnapshotV2> => {
      signals.push(signal);
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('superseded');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
        if (signal.aborted) return;
        // Keep the current generation pending so the assertion exercises its
        // cancellation rather than completion order.
        void repositoryId;
        void resolve;
      });
    };
    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        fetchSnapshot={async () => stableSnapshot}
        fetchCollaboration={fetchCollaboration}
      />,
    );
    await selectRepository('repo-harness');
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect(signals).toHaveLength(1);

    await act(async () => buttonWithText('Refresh').click());

    expect(signals).toHaveLength(2);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
    expect(paneText()).toContain('Reading the collaboration store');
    expect(paneText()).not.toContain('The collaboration store cannot be read');
  });

  test('passes the collaboration generation signal to the production fetch transport', async () => {
    const originalFetch = globalThis.fetch;
    const observed: { signal: AbortSignal | null } = { signal: null };
    const controller = new AbortController();
    const fetchStub = async (
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      observed.signal = (init as RequestInit).signal as AbortSignal | null;
      return new Response(JSON.stringify(collaborationSnapshot), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    globalThis.fetch = fetchStub as unknown as typeof fetch;
    try {
      await expect(fetchOperatorCollaborationSnapshot(collaborationSnapshot.repository_id, controller.signal))
        .resolves.toEqual(collaborationSnapshot);
      expect(observed.signal).toBe(controller.signal);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('keeps Fleet validation copy separate from collaboration validation copy', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => new Response(JSON.stringify({ protocol: 2 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
      await expect(fetchOperatorSnapshot()).rejects.toMatchObject({
        code: 'operator_payload_invalid',
        message: 'Fleet snapshot response is invalid',
      });

      globalThis.fetch = (async () => new Response(JSON.stringify({
        ...collaborationSnapshot,
        protocol: 1,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
      await expect(fetchOperatorCollaborationSnapshot(collaborationSnapshot.repository_id)).rejects.toMatchObject({
        code: 'operator_collaboration_payload_invalid',
        message: 'Collaboration snapshot response is invalid',
        next_action: 'Check the repository collaboration store, then refresh the board.',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('rejects a structurally valid collaboration response for another repository', async () => {
    const requestedRepository = 'repo-harness';
    const otherRepository = 'repo-other';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify(collaborationObservationFixture({ ...exchangeFixture, repository_id: otherRepository })), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
    try {
      await expect(fetchOperatorCollaborationSnapshot(requestedRepository)).rejects.toMatchObject({
        code: 'collaboration_repository_mismatch',
        message: 'The collaboration response does not match the requested repository.',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    await mount(
      <OperatorApp
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialLocale="en"
        fetchCollaboration={async () => collaborationObservationFixture({ ...exchangeFixture, repository_id: otherRepository })}
      />,
    );
    await selectRepository('repo-harness');
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect(paneText()).toContain('does not match the requested repository');
    expect(paneText()).not.toContain('hotspot 87');
    expect(paneText()).not.toContain('Double-read windows must overlap');
  });
});

function organizationBoardFixture() {
  const hash = `sha256:${'a'.repeat(64)}`;
  const engineerId = 'engineer:capability.runtime-harness.collaboration';
  const overlay = buildEngineeringOverlaySnapshot({
    repository_id: 'repo_a5b76eee64af71c3', registry_revision: hash, observed_at: '2026-09-22T07:00:00.000Z', snapshot_consistency: 'stable',
    components: (['profiles', 'bindings', 'claims', 'messages', 'runtime_effects'] as const).map(component => ({ component, support: 'available', observation_before: hash, observation_after: hash })),
    engineers: [{ engineer_id: engineerId, capability_id: 'capability.runtime-harness.collaboration', engineer_contract_revision: hash,
      binding: { support: 'available', state: 'active', revision: hash, value: { binding_id: '11111111-1111-4111-8111-111111111111', binding_generation: 2, engineer_contract_revision: hash, provider: 'codex', provider_thread_id: 'private-thread', host_id: 'private-host', observation: 'unknown' } },
      active_claim: { support: 'available', revision: hash, value: { task_id: 'b'.repeat(64), task_revision: `sha256:${'c'.repeat(64)}`, claim_id: '22222222-2222-4222-8222-222222222222', lease_generation: 3, work_envelope_sha256: hash, worktree_path: '/private/worktree', branch: 'private-branch', unit_ref: 'private-unit', receipt_sha256: hash } },
      delegations: { support: 'unsupported', value: null }, memory: { support: 'unsupported', value: null },
      messages: { support: 'available', pending: 2, delivery_failed: 1, revision: hash },
      runtime_effects: { support: 'available', active: 1, reconciliation_required: 1, failed: 0, wake: { pending: 1, delivered: 0, failed: 0, reconciliation_required: 1 }, revision: hash },
    }],
  });
  return { overlay, attention: projectOrganizationAttention(overlay) };
}

describe('Organization observation boundary', () => {
  test('redacts private coordinates while preserving canonical owner, Claim and unknown observation', () => {
    const board = organizationBoardFixture();
    const view = projectOperatorOrganizationSnapshot(board.overlay, board.attention);
    const bytes = JSON.stringify(view);
    for (const privateValue of ['private-thread', 'private-host', '/private/worktree', 'private-branch', 'private-unit', 'provider_thread_id', 'host_id', 'worktree_path']) expect(bytes).not.toContain(privateValue);
    expect(view.attention).toEqual(board.attention);
    expect(view.engineers[0]?.active_claim.value).toMatchObject({ claim_id: '22222222-2222-4222-8222-222222222222', lease_generation: 3 });
    expect(view.engineers[0]?.binding.value?.observation).toBe('unknown');
    expect(decodeOperatorOrganizationSnapshot(JSON.parse(bytes), view.repository_id)).toEqual(view);
    for (const malformed of [
      { ...view, repository_id: 'repo_other' },
      { ...view, engineers: [...view.engineers, ...view.engineers] },
      { ...view, host_id: 'private-host' },
      { ...view, snapshot_consistency: 'degraded' },
      { ...view, engineers: [{ ...view.engineers[0], binding: { ...view.engineers[0]!.binding, value: { ...view.engineers[0]!.binding.value, host_id: 'private-host' } } }] },
      { ...view, engineers: Array.from({length:201}, () => view.engineers[0]) },
    ]) expect(() => decodeOperatorOrganizationSnapshot(malformed, view.repository_id)).toThrow();
  });

  test('refuses old transport and cross-source identity without hiding an explicitly unavailable exchange', async () => {
    const board = organizationBoardFixture();
    const view = projectOperatorOrganizationSnapshot(board.overlay, board.attention);
    const payload: OperatorCollaborationSnapshotV2 = { ...collaborationSnapshot, repository_id: view.repository_id,
      exchange: { status: 'unavailable', observed_at: view.observed_at, code: 'source_unavailable' },
      organization: { status: 'observed', observed_at: view.observed_at, snapshot: view } };
    expect(decodeOperatorCollaborationSnapshot(payload)).toEqual(payload);
    expect(() => decodeOperatorCollaborationSnapshot(exchangeFixture)).toThrow();
    expect(() => decodeOperatorCollaborationSnapshot({ ...payload, organization: { ...payload.organization, snapshot: { ...view, repository_id: 'repo_1111111111111111' } } })).toThrow();
    const markup = renderToStaticMarkup(<OrganizationSummary state={{kind:'ready', snapshot:payload}} repositoryId={view.repository_id} t={key => translate('en',key)} />);
    expect(markup).toContain('module_engineer');
    expect(markup).toContain('runtime_operator');
    expect(markup).toContain('unknown');
    expect(markup).toContain('does not prove execution is running');
    expect(markup).not.toContain('private-host');
    const stale = renderToStaticMarkup(<OrganizationSummary state={{kind:'ready', snapshot:payload}} repositoryId="repo_1111111111111111" t={key => translate('en',key)} />);
    expect(stale).not.toContain('engineer:capability.runtime-harness.collaboration');
    expect(stale).toContain('Reading the selected repository');
  });
});
