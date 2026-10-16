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
import { repositorySnapshot, repositoryObservationFixture, fixtureTasks, stableSnapshot } from '../../src/operator-web/fixture';
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

  test('refuses old transport and cross-source identity with independent source failures', async () => {
    const board = organizationBoardFixture();
    const view = projectOperatorOrganizationSnapshot(board.overlay, board.attention);
    const payload: OperatorRepositorySnapshotV1 = { ...repositorySnapshot, repository_id: view.repository_id,
      organization: { status: 'observed', observed_at: view.observed_at, snapshot: view } };
    expect(decodeOperatorRepositorySnapshot(payload)).toEqual(payload);
    expect(() => decodeOperatorRepositorySnapshot({ ...repositorySnapshot, protocol: 4 })).toThrow();
    expect(() => decodeOperatorRepositorySnapshot({ ...payload, organization: { ...payload.organization, snapshot: { ...view, repository_id: 'repo_1111111111111111' } } })).toThrow();
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

import { decisionInventoryFixture } from '../../src/operator-web/fixture';
import { DecisionSummary } from '../../src/operator-web/OrganizationSummary';

function decisionEnvelope(repositoryId: string, after: string | null = null): OperatorRepositorySnapshotV1 {
  const page = decisionInventoryFixture(repositoryId);
  const question = after === null ? 'First original question <img src=x onerror=alert(1)>' : 'Second original question';
  return { ...repositoryObservationFixture(repositoryId), decision_after: after,
    decisions: { status: 'observed', observed_at: '2026-09-22T00:00:00Z', snapshot: {
      ...page, query: { after, limit: 1 }, entries: [{ ...page.entries[0]!, question }],
      coverage: { ...page.coverage, complete: after !== null, reason: after === null ? 'output_limit' : 'complete', next_after: after === null ? 'a'.repeat(64) : null },
    } } };
}

describe('formal Human Decision observation UI', () => {
  test('renders plain text and partial coverage without an approval write or a fabricated global count', () => {
    const envelope = decisionEnvelope('repo-harness');
    const markup = renderToStaticMarkup(<DecisionSummary state={{ kind: 'ready', snapshot: envelope }} repositoryId="repo-harness" after={null} onPage={() => {}} t={key => translate('en', key)} />);
    expect(markup).toContain('&lt;img'); expect(markup).not.toContain('<img');
    expect(markup).toContain('not a repository-wide pending count');
    expect(markup).toContain('Decision owner: Human'); expect(markup).toContain('Next Decision page');
    expect(markup).not.toContain('>Approve<');
    const stale = renderToStaticMarkup(<DecisionSummary state={{ kind: 'ready', snapshot: envelope }} repositoryId="repo-harness" after={'a'.repeat(64)} onPage={() => {}} t={key => translate('zh', key)} />);
    expect(stale).not.toContain('First original question'); expect(stale).toContain('正在读取');
  });

  test('replaces pages, keeps task selection scope, and cancels late pages on refresh or repository change', async () => {
    const pending: Array<{ repositoryId: string; after: string | null; signal: AbortSignal; resolve: (snapshot: OperatorRepositorySnapshotV1) => void }> = [];
    await mount(<OperatorApp initialSnapshot={stableSnapshot} initialLocale="en" fetchSnapshot={async () => stableSnapshot}
      fetchRepositorySnapshot={(repositoryId, signal, after) => new Promise(resolve => pending.push({repositoryId, after, signal, resolve}))} />);
    const finish = async (index: number) => act(async () => { const request = pending[index]!; request.resolve(decisionEnvelope(request.repositoryId, request.after)); });
    const text = () => document.querySelector('.decision-summary')!.textContent!;
    expect(pending.map(p => p.after)).toEqual([null]);
    await finish(0);
    expect(text()).toContain('First original question'); expect(document.querySelector('.decision-summary img')).toBeNull();
    await act(async () => buttonWithText('Next Decision page').click());
    expect(text()).not.toContain('First original question');
    await finish(1); expect(text()).toContain('Second original question'); expect(text()).not.toContain('First original question');
    await act(async () => buttonWithText(fixtureTasks.blocked.task_label).click());
    expect(pending.length).toBe(2);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close task details"]')!.click());
    await act(async () => buttonWithText('Back to first page').click()); await finish(2);
    await act(async () => buttonWithText('Next Decision page').click());
    await act(async () => buttonWithText('Refresh').click());
    expect(pending[3]!.signal.aborted).toBe(true); expect(pending[4]!.after).toBeNull();
    await finish(3); expect(text()).not.toContain('Second original question');
    await finish(4); expect(text()).toContain('First original question');
    await act(async () => buttonWithText('Next Decision page').click());
    await selectRepository('repo-console');
    expect(pending[5]!.signal.aborted).toBe(true); expect(pending[6]!.after).toBeNull();
    await finish(5); expect(text()).not.toContain('Second original question');
    await finish(6); expect(text()).toContain('First original question');
    expect(document.querySelector('[data-write-action], textarea')).toBeNull();
  });

  test('fetch binds the exact cursor and rejects a stale first-page response', async () => {
    const originalFetch = globalThis.fetch;
    const cursor = 'a'.repeat(64);
    const urls: string[] = [];
    let payload = decisionEnvelope('repo-harness', cursor);
    globalThis.fetch = (async (url: unknown) => { urls.push(String(url)); return new Response(JSON.stringify(payload)); }) as typeof fetch;
    try {
      await expect(fetchOperatorRepositorySnapshot('repo-harness', undefined, cursor)).resolves.toEqual(payload);
      expect(urls).toEqual(['/api/v1/repositories/repo-harness/snapshot?decision_after=' + cursor]);
      payload = decisionEnvelope('repo-harness');
      await expect(fetchOperatorRepositorySnapshot('repo-harness', undefined, cursor)).rejects.toMatchObject({ code: 'repository_repository_mismatch' });
    } finally { globalThis.fetch = originalFetch; }
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
      await expect(fetchOperatorRepositorySnapshot(repositorySnapshot.repository_id, controller.signal)).rejects.toMatchObject({ code: 'repository_repository_mismatch' });
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
