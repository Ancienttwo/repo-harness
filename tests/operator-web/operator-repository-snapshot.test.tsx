import { buildEngineeringOverlaySnapshot, projectOrganizationAttention } from '../../src/core/engineers/engineering-overlay';
import { projectOperatorOrganizationSnapshot, decodeOperatorOrganizationSnapshot } from '../../src/core/operator/organization-snapshot';
import { OrganizationSummary } from '../../src/operator-web/OrganizationSummary';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';

import { OperatorApp } from '../../src/operator-web/App';
import { fetchOperatorRepositorySnapshot } from '../../src/operator-web/fleet-api';
import { repositorySnapshot, repositoryObservationFixture, fixtureTasks, planningObservationFixture, taskContextFixture, taskActivityFixture, stableSnapshot } from '../../src/operator-web/fixture';
import { translate } from '../../src/operator-web/i18n';
import {
  decodeOperatorRepositorySnapshot,
  type OperatorRepositorySnapshotV1,
} from '../../src/operator-web/types';

let root: Root | null = null;
let window: Window;

function installDom(): void {
  window = new Window({ url: 'http://127.0.0.1:4318/#repository' });
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

beforeEach(() => {
  installDom();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  window.close();
});

function organizationBoardFixture(repositoryId = 'repo_a5b76eee64af71c3') {
  const hash = `sha256:${'a'.repeat(64)}`;
  const engineerId = 'engineer:capability.runtime-harness.collaboration';
  const overlay = buildEngineeringOverlaySnapshot({
    repository_id: repositoryId, registry_revision: hash, observed_at: '2026-09-22T07:00:00.000Z', snapshot_consistency: 'stable',
    components: (['profiles', 'bindings', 'claims', 'runtime_effects'] as const).map(component => ({ component, support: 'available', observation_before: hash, observation_after: hash })),
    engineers: [{ engineer_id: engineerId, capability_id: 'capability.runtime-harness.collaboration', engineer_contract_revision: hash,
      binding: { support: 'available', state: 'active', revision: hash, value: { binding_id: '11111111-1111-4111-8111-111111111111', binding_generation: 2, engineer_contract_revision: hash, provider: 'codex', provider_thread_id: 'private-thread', host_id: 'private-host', observation: 'unknown' } },
      active_claim: { support: 'available', revision: hash, value: { task_id: 'b'.repeat(64), task_revision: `sha256:${'c'.repeat(64)}`, claim_id: '22222222-2222-4222-8222-222222222222', lease_generation: 3, work_envelope_sha256: hash, worktree_path: '/private/worktree', branch: 'private-branch', unit_ref: 'private-unit', receipt_sha256: hash } },
      delegations: { support: 'unsupported', value: null }, memory: { support: 'unsupported', value: null },
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

  test('refuses old transport and cross-source identity with independent source failures', async () => {
    const board = organizationBoardFixture();
    const view = projectOperatorOrganizationSnapshot(board.overlay, board.attention);
    const payload: OperatorRepositorySnapshotV1 = { ...repositorySnapshot, repository_id: view.repository_id,
      organization: { status: 'observed', observed_at: view.observed_at, snapshot: view } };
    expect(decodeOperatorRepositorySnapshot(payload)).toEqual(payload);
    expect(() => decodeOperatorRepositorySnapshot({ ...repositorySnapshot, protocol: 4 })).toThrow();
    expect(() => decodeOperatorRepositorySnapshot({ ...payload, organization: { ...payload.organization, snapshot: { ...view, repository_id: 'repo_1111111111111111' } } })).toThrow();
    const markup = renderToStaticMarkup(<OrganizationSummary state={{kind:'ready', snapshot:payload}} repositoryId={view.repository_id} t={key => translate('en',key)} />);
    expect(markup).toContain('runtime_operator');
    expect(markup).toContain('unknown');
    expect(markup).toContain('does not prove execution is running');
    expect(markup).not.toContain('private-host');
    const stale = renderToStaticMarkup(<OrganizationSummary state={{kind:'ready', snapshot:payload}} repositoryId="repo_1111111111111111" t={key => translate('en',key)} />);
    expect(stale).not.toContain('engineer:capability.runtime-harness.collaboration');
    expect(stale).toContain('Reading the selected repository');
  });
});

describe('repository snapshot transport', () => {
  test('preserves abort and uncached read semantics and rejects a different repository', async () => {
    const original = globalThis.fetch;
    const controller = new AbortController();
    let payload = repositorySnapshot;
    globalThis.fetch = (async (url, options) => {
      expect(String(url)).toBe(`/api/v1/repositories/${repositorySnapshot.repository_id}/snapshot`);
      expect(options?.signal).toBe(controller.signal);
      expect(options?.cache).toBe('no-store');
      return Response.json(payload);
    }) as typeof fetch;
    try {
      expect(await fetchOperatorRepositorySnapshot(repositorySnapshot.repository_id, controller.signal)).toEqual(payload);
      payload = repositoryObservationFixture('other-repository');
      await expect(fetchOperatorRepositorySnapshot(repositorySnapshot.repository_id, controller.signal)).rejects.toMatchObject({ code: 'repository_mismatch' });
    } finally { globalThis.fetch = original; }
  });

  test('uses the repository validation error for malformed responses', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ ...repositorySnapshot, protocol: 4 })) as unknown as typeof fetch;
    try {
      await expect(fetchOperatorRepositorySnapshot(repositorySnapshot.repository_id)).rejects.toMatchObject({ code: 'operator_repository_payload_invalid' });
    } finally { globalThis.fetch = original; }
  });
});


describe('repository snapshot failure recovery', () => {
  test('keeps task details usable after failure and retries all observation sources without losing selection', async () => {
    const snapshot = { ...stableSnapshot, repositories: stableSnapshot.repositories.map((repository, index) =>
      index === 0 ? { ...repository, repository_id: 'repo_a5b76eee64af71c3' } : repository) };
    const repository = snapshot.repositories[0]!;
    const planning = planningObservationFixture(repository.repository_id, repository.cards);
    const board = organizationBoardFixture(repository.repository_id);
    const organization = projectOperatorOrganizationSnapshot(board.overlay, board.attention);
    const recovered: OperatorRepositorySnapshotV1 = {
      ...repositoryObservationFixture(repository.repository_id),
      planning: { status: 'observed', observed_at: planning.observation.observed_at, snapshot: planning },
      organization: { status: 'observed', observed_at: organization.observed_at, snapshot: organization },
    };
    const asked: string[] = [];
    await mount(<OperatorApp initialSnapshot={snapshot} initialLocale="en"
      fetchSnapshot={async () => snapshot}
      readTaskContext={async request => taskContextFixture(request)}
      readTaskActivity={async request => taskActivityFixture(request)}
      fetchRepositorySnapshot={async repositoryId => {
        asked.push(repositoryId);
        if (asked.length === 1) throw { code: 'repository_snapshot_unavailable', message: 'Repository sources are unavailable.', next_action: 'Refresh.' };
        return recovered;
      }} />);
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    const detail = () => document.querySelector('.detail-pane')!;
    expect(asked).toEqual([repository.repository_id]);
    expect(document.querySelector('.organization-summary')?.textContent).toContain(translate('en', 'org.sourceUnavailable'));
    expect(detail().textContent).toContain('The base branch moved after verification');
    expect(detail().querySelector('[data-slot="composer"]')).toBeNull();
    const selectedSearch = window.location.search;
    const tab = (name: string) => act(async () => document.querySelector<HTMLButtonElement>(`#view-tab-${name}`)!.click());
    await tab('planning');
    expect(document.querySelector('.planning-view')?.textContent).toContain(translate('en', 'planning.unavailable'));
    await tab('organization');
    await act(async () => buttonWithText('Refresh').click());
    expect(asked).toEqual([repository.repository_id, repository.repository_id]);
    expect(window.location.search).toBe(selectedSearch);
    expect(detail().querySelector('#detail-pane-title')?.textContent).toBe(fixtureTasks.blocked.task_label);
    expect(document.querySelector('.organization-summary')?.textContent).toContain(organization.engineers[0]!.engineer_id);
    await tab('planning');
    expect(document.querySelector(`[data-planning-task="${fixtureTasks.blocked.task_id}"]`)).not.toBeNull();
    expect(window.location.search).toBe(selectedSearch);
    expect(detail().querySelector('#detail-pane-title')?.textContent).toBe(fixtureTasks.blocked.task_label);
  });
});
