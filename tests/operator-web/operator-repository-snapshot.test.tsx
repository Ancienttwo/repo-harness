import { buildAdmittedEngineeringOverlay, projectAdmittedOrganizationAttention } from '../../src/core/engineers/engineering-overlay';
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
  const hash = `sha256:${'a'.repeat(64)}`, engineerId = 'engineer:capability.runtime-harness.collaboration';
  const profile = { engineer_id: engineerId, capability_id: 'capability.runtime-harness.collaboration', engineer_contract_revision: hash };
  const selector = { repository_id: repositoryId, provider_repository_id: '123', issue_id: '456', campaign_id: 'review', task: 'review-task', role: 'deep-reasoner',
    claim_ref: 'https://github.com/acme/widgets/issues/1#issuecomment-2', claim_revision: hash, grant_sha256: hash, policy_sha256: hash,
    actor_id: 'upstream-actor', session_binding_sha256: `sha256:${'b'.repeat(64)}` };
  const selected = { state: 'selected' as const, engineer_id: engineerId, engineer_contract_revision: hash };
  const session = { selector, admission_sha256: hash, profile_selection: selected, branch: 'review-branch', runtime: 'terminal' as const, harness_kind: 'codex' };
  const scheduling = { protocol: 2 as const, kind: 'provider_engineer_scheduling' as const, repository_id: repositoryId,
    profiles: [profile], source_revision: hash, tasks: [{ provider_repository_id: '123', issue_id: '456', issue: null, sessions: [
      { session, selection: selected },
      { session: { ...session, selector: { ...selector, task: 'unassigned-task', session_binding_sha256: `sha256:${'c'.repeat(64)}` }, profile_selection: { state: 'unassigned' as const } }, selection: { state: 'unassigned' as const } },
    ] }] };
  const overlay = buildAdmittedEngineeringOverlay({ repository_id: repositoryId, registry_revision: hash, observed_at: '2026-09-22T07:00:00.000Z', snapshot_consistency: 'stable',
    scheduling, components: [{ component: 'scheduling', support: 'available', observation_before: hash, observation_after: hash }],
    runtime_effects: { support: 'available', engineers: [{ engineer_id: engineerId, effects: { support: 'available', active: 1, reconciliation_required: 1, failed: 0,
      wake: { pending: 1, delivered: 0, failed: 0, reconciliation_required: 1 }, revision: hash } }] } });
  return { overlay, attention: projectAdmittedOrganizationAttention(overlay) };
}

describe('Organization observation boundary', () => {
  test('preserves provider issue and explicit profile/session identities without private runtime coordinates', () => {
    const board = organizationBoardFixture();
    const view = projectOperatorOrganizationSnapshot(board.overlay, board.attention), repositoryId = view.overlay.repository_id;
    const bytes = JSON.stringify(view);
    for (const privateValue of ['private-thread', 'private-host', '/private/worktree', 'provider_thread_id', 'host_id', 'worktree_path', 'source_root']) expect(bytes).not.toContain(privateValue);
    expect(view.organization_attention).toEqual(board.attention);
    expect(view.overlay.scheduling!.tasks[0]!.sessions[0]!.selection.state).toBe('selected');
    expect(view.overlay.scheduling!.tasks[0]!.sessions[1]!.selection.state).toBe('unassigned');
    expect(decodeOperatorOrganizationSnapshot(JSON.parse(bytes), repositoryId)).toEqual(view);
    const scheduling = view.overlay.scheduling!;
    for (const malformed of [
      { ...view, overlay: { ...view.overlay, repository_id: 'repo_other' } },
      { ...view, overlay: { ...view.overlay, scheduling: { ...scheduling, profiles: [...scheduling.profiles, ...scheduling.profiles] } } },
      { ...view, host_id: 'private-host' },
      { ...view, overlay: { ...view.overlay, snapshot_consistency: 'degraded' } },
      { ...view, overlay: { ...view.overlay, scheduling: { ...scheduling, tasks: scheduling.tasks.map(task => ({ ...task, sessions: task.sessions.map(row => ({ ...row, session: { ...row.session, host_id: 'private-host' } })) })) } } },
      { ...view, overlay: { ...view.overlay, scheduling: { ...scheduling, profiles: Array.from({length:201}, () => scheduling.profiles[0]) } } },
    ]) expect(() => decodeOperatorOrganizationSnapshot(malformed, repositoryId)).toThrow();
  });

  test('refuses old transport and cross-source identity with independent source failures', async () => {
    const board = organizationBoardFixture(), view = projectOperatorOrganizationSnapshot(board.overlay, board.attention);
    const repositoryId = view.overlay.repository_id;
    const payload: OperatorRepositorySnapshotV1 = { ...repositorySnapshot, repository_id: repositoryId,
      organization: { status: 'observed', observed_at: view.overlay.observed_at, snapshot: view } };
    expect(decodeOperatorRepositorySnapshot(payload)).toEqual(payload);
    expect(() => decodeOperatorRepositorySnapshot({ ...repositorySnapshot, protocol: 4 })).toThrow();
    expect(() => decodeOperatorRepositorySnapshot({ ...payload, organization: { ...payload.organization, snapshot: { ...view, overlay: { ...view.overlay, repository_id: 'repo_1111111111111111' } } } })).toThrow();
    const markup = renderToStaticMarkup(<OrganizationSummary state={{kind:'ready', snapshot:payload}} repositoryId={repositoryId} t={key => translate('en',key)} />);
    expect(markup).toContain('maintainer'); expect(markup).toContain('profile_unassigned');
    expect(markup).toContain('does not prove execution is running'); expect(markup).not.toContain('private-host');
    const stale = renderToStaticMarkup(<OrganizationSummary state={{kind:'ready', snapshot:payload}} repositoryId="repo_1111111111111111" t={key => translate('en',key)} />);
    expect(stale).not.toContain('engineer:capability.runtime-harness.collaboration'); expect(stale).toContain('Reading the selected repository');
  });

  test('session inspection is explicit and filtering profiles does not assign an unassigned actor', async () => {
    const board = organizationBoardFixture(), view = projectOperatorOrganizationSnapshot(board.overlay, board.attention);
    const payload: OperatorRepositorySnapshotV1 = { ...repositorySnapshot, repository_id: view.overlay.repository_id,
      organization: { status: 'observed', observed_at: view.overlay.observed_at, snapshot: view } };
    await mount(<OrganizationSummary state={{kind:'ready', snapshot:payload}} repositoryId={view.overlay.repository_id} t={key => translate('en',key)} />);
    expect(document.querySelector('.organization-session')).toBeNull();
    const selects = document.querySelectorAll('select');
    await act(async () => { selects[1]!.value = `sha256:${'c'.repeat(64)}`; selects[1]!.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(document.querySelector('.organization-session')?.textContent).toContain('unassigned');
    await act(async () => { selects[0]!.value = view.overlay.scheduling!.profiles[0]!.engineer_id; selects[0]!.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(document.querySelector('.organization-session')).toBeNull();
    expect(document.querySelectorAll('select')[1]!.querySelectorAll('option')).toHaveLength(2);
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
      organization: { status: 'observed', observed_at: organization.overlay.observed_at, snapshot: organization },
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
    expect(document.querySelector('.organization-summary')?.textContent).toContain(organization.overlay.scheduling!.profiles[0]!.engineer_id);
    await tab('planning');
    expect(document.querySelector(`[data-planning-task="1001:${2000 + fixtureTasks.blocked.task_index}"]`)).not.toBeNull();
    expect(window.location.search).toBe(selectedSearch);
    expect(detail().querySelector('#detail-pane-title')?.textContent).toBe(fixtureTasks.blocked.task_label);
  });
});

test('Planning preserves authored provider graph dependencies and explicit session choices', async () => {
  const {PlanningView}=await import('../../src/operator-web/PlanningView');
  const {readFileSync}=await import('node:fs');
  const repository=stableSnapshot.repositories[0]!;
  const planning=planningObservationFixture(repository.repository_id,repository.cards);
  const task=planning.scheduling.tasks.find(row=>row.sessions.length>0)!;
  const definition=JSON.parse(readFileSync(new URL('../fixtures/provider-work-graph-v2/graph.json',import.meta.url),'utf8')).work_packages[0];
  const edge={repository_id:repository.repository_id,work_package_id:'dependency',required_state:'provider_closed' as const,acceptance_authority:null};
  const graph={packages:[{...definition,repository_id:repository.repository_id,task:{provider_repository_id:task.provider_repository_id,issue_id:task.issue_id},issue:task.issue,
    work_package_revision:'sha256:'+'f'.repeat(64),depends_on:[edge],dependencies:[{...edge,status:'unsatisfied' as const,authority_revision:'sha256:'+'e'.repeat(64)}]}],
    sources:[{repository_id:repository.repository_id,commit:'a'.repeat(40),graph_path:'.ai/harness/work-graph.v2.json',work_graph_revision:'sha256:'+'d'.repeat(64)}]};
  const observed={...planning,graph:{status:'observed' as const,snapshot:graph}};
  const {decodeOperatorPlanningSnapshot}=await import('../../src/core/operator/planning-snapshot');
  expect(decodeOperatorPlanningSnapshot(observed,repository.repository_id)).toEqual(observed);
  const selected: string[]=[];
  await mount(<PlanningView state={{kind:'ready',snapshot:{...repositoryObservationFixture(repository.repository_id),planning:{status:'observed',observed_at:planning.observation.observed_at,snapshot:observed}}}}
    repositoryId={repository.repository_id} cards={repository.cards} onSelect={card=>selected.push(card.execution?.selector.session_binding_sha256 ?? 'unassigned')} t={key=>translate('en',key)} />);
  expect(document.body.textContent).toContain('provider_closed');expect(document.body.textContent).toContain('unsatisfied');
  expect(document.body.textContent).toContain('affected-checks');expect(document.body.textContent).toContain('.ai/harness/work-graph.v2.json');
  expect(selected).toEqual([]);
  const item=document.querySelector(`[data-planning-task="${task.provider_repository_id}:${task.issue_id}"]`)!;
  await act(async()=>item.querySelector<HTMLButtonElement>('button')!.click());
  expect(selected).toEqual([task.sessions[0]!.session.selector.session_binding_sha256]);
});
