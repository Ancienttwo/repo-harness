import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { act, Profiler, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { isGroupNode, moduleDetail, moduleGraph, type ModelNode, type ModelRelation, type ModuleDetailV1, type ModuleIndexV1 } from '../../src/core/architecture/module-view';
import { buildModuleReviewPrompt, type ModuleReviewPromptV1 } from '../../src/core/review/module-review-prompt';
import { OperatorApp } from '../../src/operator-web/App';
import { ArchitectureWorkspace, reviewPromptCommand, type ArchitectureSource } from '../../src/operator-web/ArchitectureWorkspace';
import { fetchArchitectureMap, type ArchitectureMapRead, type ArchitectureMapReader } from '../../src/operator-web/ArchitectureMap';
import { layoutArchitectureMap } from '../../src/operator-web/architecture-map-layout';
import { layoutModules } from '../../src/operator-web/architecture-modules-layout';
import { layoutLayers } from '../../src/operator-web/architecture-layers-layout';
import {
  architectureViolationCommand, decodeArchitectureMap, flowSteps, projectArchitectureMap,
  type ArchitectureFlowSelectorV1, type ArchitectureLayerOrderV1, type ArchitectureMapFlowV1, type ArchitectureMapLayersInput, type ArchitectureMapNodeV1,
  type ArchitectureMapRelationV1, type ArchitectureMapV1,
} from '../../src/core/operator/architecture-map';
import { runtimePlacement } from '../../src/operator-web/architecture-runtime';
import { layoutSequence } from '../../src/operator-web/architecture-sequence-layout';
import { defaultTopologyBase, layoutTopology, type TopologyBase } from '../../src/operator-web/architecture-topology-layout';
import { repairRoute, routePath, sceneBounds, sceneFindings, sceneSvg, textWidth, type PlacedScene, type SceneBox } from '../../src/operator-web/architecture-scene';
import { contentBox, firstViewport } from '../../src/operator-web/architecture-map-parts';
import recordedMap from '../../src/operator-web/fixtures/architecture-map.json';
import type { ArchitectureHistory as HistoryPage } from 'archctx-contracts';
import { historyLayoutInput, historyShape, skippedMilestones, type ValidMilestone } from '../../src/operator-web/ArchitectureHistory';
// Three real `archctx history --ref dd9ccef3 --offset N --limit M --json` pages of this repository.
import historyPages from '../fixtures/architecture-history/repo-harness-pages.json';
import { ModuleGraph } from '../../src/operator-web/ModuleGraph';
import { registryOf } from '../../src/operator-web/fixtures';

const REGISTRY = registryOf(['repo-harness', 'repo-console']);
import { translate } from '../../src/operator-web/i18n';

const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate('en', key, values);
const REPO = 'repo-fixture';
const CENTER = 'capability.workflow-engine.pipeline';
const CALLER = 'capability.public-surface.root-router';
const COMMIT = 'c'.repeat(40);

const node = (id: string, kind: 'capability' | 'component', parent?: string): ModelNode =>
  ({ id, kind, name: id.split('.').slice(-2).join(' '), status: 'active', summary: `${id} summary`, ...(parent ? { parent } : {}) });
const relation = (id: string, kind: string, source: string, target: string): ModelRelation => ({ id, kind, source, target, intent: `${id} intent` });

const nodes: ModelNode[] = [
  { ...node(CENTER, 'capability'), responsibilities: ['Own the pipeline ledger.'], extensions: { verification: ['bun test tests/pipeline.test.ts'] },
    source: { entrypoints: [{ id: 'entrypoint.pipeline', path: 'src/cli/commands/pipeline.ts', symbols: [{ name: 'runPipeline', sinks: [{ id: 'sink.pipeline', path: 'src/core/pipeline/ledger.ts', symbol: 'appendRun' }] }] }] } },
  node('component.pipeline.ledger', 'component', CENTER),
  node(CALLER, 'capability'),
  node('component.review.store', 'component'),
  node('capability.verification.evals', 'capability'),
];
const relations: ModelRelation[] = [
  relation('relation.a-own', 'calls', CENTER, 'component.pipeline.ledger'),
  relation('relation.b-router', 'calls', CALLER, CENTER),
  relation('relation.c-store', 'calls', 'component.pipeline.ledger', 'component.review.store'),
  relation('relation.d-evals', 'shares-schema', CENTER, 'capability.verification.evals'),
];

function detailFor(id = CENTER, section3: string | null = 'Decision text.\n**not bold** <script>alert(1)</script>'): ModuleDetailV1 {
  const center = nodes.find(item => item.id === id) ?? node(id, 'capability');
  return moduleDetail(COMMIT, center, nodes.some(item => item.id === id) ? nodes : [...nodes, center], relations, [], section3,
    [{ path: 'tasks/contracts/pipeline.contract.md', kind: 'contract', status: 'Active' }, { path: 'plans/pipeline.md', kind: 'plan', status: null }],
    { model_valid: 'valid', generated_summary: 'unknown' });
}

function promptFor(detail: ModuleDetailV1, shard: number): ModuleReviewPromptV1 {
  return buildModuleReviewPrompt({
    detail, package_version: '0.21.0', repository_id: 'repo_0123456789abcdef', input_cap_bytes: 2048, worktree_dirty_paths: [], dirty_content_sha256: null,
    model_sha256: 'a'.repeat(64), doc_sha256: null, sources: [], source_sections: {}, module_doc_path: 'docs/architecture/modules/pipeline.md',
    base: null, head: null, diff: null, backlog: null, stale_citations: null,
  }, shard);
}

const index: ModuleIndexV1 = {
  schema_version: 'repo-harness.architecture-modules.v1', commit: COMMIT,
  modules: [
    { id: CALLER, domain: 'public-surface', name: 'Root Router', status: 'active', components: 1, state: { model_valid: 'valid', generated_summary: 'unknown', section3: 'present' } },
    { id: CENTER, domain: 'workflow-engine', name: 'Pipeline', status: 'active', components: 1, state: { model_valid: 'invalid', generated_summary: 'unknown', section3: 'pending' } },
    { id: 'capability.workflow-engine.review', domain: 'workflow-engine', name: 'Review', status: 'active', components: 2, state: { model_valid: 'unknown', generated_summary: 'fresh', section3: 'present' } },
  ],
};

interface Call { readonly path: string; readonly ifNoneMatch: string | null }
let calls: Call[] = [];
let respond: (path: string, call: Call) => Response;
const realFetch = globalThis.fetch;

function json(body: unknown, status = 200, etag?: string): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...(etag ? { ETag: etag } : {}) } });
}

/** Serves the fixed architecture contract; anything else is unavailable. */
function serveArchitecture(path: string): Response {
  const url = new URL(path, 'http://127.0.0.1:4318');
  const base = `/api/v1/repositories/${REPO}/architecture/modules`;
  if (url.pathname === base) return json(index, 200, '"index-1"');
  const match = url.pathname.slice(base.length + 1).match(/^(capability\.[a-z0-9.-]+?)(\/review-prompt)?$/u);
  if (!url.pathname.startsWith(`${base}/`) || !match) return json({ code: 'unavailable' }, 503);
  return match[2] ? json(promptFor(detailFor(match[1]), Number(url.searchParams.get('shard')))) : json(detailFor(match[1]), 200, `"detail-${match[1]}"`);
}

let root: Root | null = null;
let window: Window;
let copied: string[] = [];

beforeEach(() => {
  window = new Window({ url: 'http://127.0.0.1:4318/' });
  copied = [];
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { copied.push(value); } } });
  Object.assign(globalThis, {
    window, document: window.document, navigator: window.navigator, localStorage: window.localStorage,
    HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, Event: window.Event,
    MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true,
  });
  calls = [];
  respond = serveArchitecture;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input);
    const call = { path, ifNoneMatch: new Headers(init?.headers).get('If-None-Match') };
    calls.push(call);
    return respond(path, call);
  }) as typeof fetch;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  globalThis.fetch = realFetch;
  await window.happyDOM.close();
});

async function settle(): Promise<void> {
  await act(async () => { for (let turn = 0; turn < 6; turn++) await new Promise(resolve => setTimeout(resolve, 0)); });
}

async function mount(element: ReactElement): Promise<void> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  await settle();
}

const pendingMap: ArchitectureMapReader = async () => ({ state: 'unavailable', reason: 'architecture_map_pending' });

function workspace(props: Partial<Parameters<typeof ArchitectureWorkspace>[0]> = {}): ReactElement {
  return <ArchitectureWorkspace repositoryId={REPO} github={null} moduleId={null} onModule={() => {}} onSource={() => {}} refreshGeneration={0} readMap={pendingMap} t={t} {...props} />;
}

/** The workspace opens on the map; the module list is the second view. */
async function openModules(): Promise<void> {
  await act(async () => document.querySelector<HTMLButtonElement>('#architecture-tab-modules')!.click());
  await settle();
}

describe('architecture module list', () => {
  test('groups modules by domain and shows three separate states, with unknown explicit', async () => {
    await mount(workspace());
    await openModules();
    const domains = [...document.querySelectorAll('.module-domain')];
    expect(domains.map(item => item.getAttribute('data-domain'))).toEqual(['public-surface', 'workflow-engine']);
    expect(domains.map(item => item.querySelectorAll('.module-row').length)).toEqual([1, 2]);
    for (const row of document.querySelectorAll('.module-row')) {
      expect([...row.querySelectorAll('[data-state-kind]')].map(item => item.getAttribute('data-state-kind'))).toEqual(['model_valid', 'generated_summary', 'section3']);
    }
    const states = (id: string) => [...document.querySelectorAll(`[data-module-id="${id}"] [data-state-kind]`)].map(item => item.textContent);
    expect(states(CALLER)).toEqual(['Model: valid', 'Generated summary: unknown', '§3: present']);
    expect(states(CENTER)).toEqual(['Model: invalid', 'Generated summary: unknown', '§3: pending']);
    expect(states('capability.workflow-engine.review')).toEqual(['Model: unknown', 'Generated summary: fresh', '§3: present']);
    const unknown = [...document.querySelectorAll('[data-state-value="unknown"]')];
    expect(unknown).toHaveLength(3);
    for (const item of unknown) expect(item.className).toContain('tone-unknown');
    expect(document.body.textContent?.toLowerCase()).not.toContain('synced');
  });

  test('shows the route failure code and keeps the last result after a failed refresh', async () => {
    respond = () => json({ code: 'repository_not_found' }, 404);
    await mount(workspace());
    await openModules();
    expect(document.querySelector('[role="alert"]')?.getAttribute('data-error-code')).toBe('repository_not_found');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('repository_not_found');

    respond = serveArchitecture;
    await act(async () => root?.render(workspace({ refreshGeneration: 1 })));
    await settle();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    respond = () => json({ code: 'busy' }, 503);
    await act(async () => root?.render(workspace({ refreshGeneration: 2 })));
    await settle();
    expect(document.querySelectorAll('.module-row')).toHaveLength(3);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('The last result stays on screen. The refresh failed: busy');
  });

  test('a 304 answer keeps the shown state and commits no render', async () => {
    let commits = 0;
    const tree = (generation: number) => <Profiler id="architecture" onRender={() => { commits++; }}>{workspace({ refreshGeneration: generation })}</Profiler>;
    await mount(tree(0));
    await openModules();
    expect(calls).toEqual([{ path: `/api/v1/repositories/${REPO}/architecture/modules`, ifNoneMatch: null }]);
    const before = document.querySelector('.architecture-workspace')?.innerHTML;
    respond = (_path, call) => call.ifNoneMatch === '"index-1"' ? new Response(null, { status: 304 }) : json({ code: 'unexpected' }, 500);
    const committed = commits;
    await act(async () => root?.render(tree(1)));
    await settle();
    expect(calls[1]).toEqual({ path: `/api/v1/repositories/${REPO}/architecture/modules`, ifNoneMatch: '"index-1"' });
    // One commit for the new prop; the 304 itself adds none.
    expect(commits).toBe(committed + 1);
    expect(document.querySelector('.architecture-workspace')?.innerHTML).toBe(before);
  });

  test('a failed read of another path drops the old ETag, so returning does not wait on a 304', async () => {
    await mount(workspace());
    await openModules();
    expect(document.querySelectorAll('.module-row')).toHaveLength(3);
    respond = path => path.includes('/repo-other/') ? json({ code: 'busy' }, 503) : serveArchitecture(path);
    await act(async () => root?.render(workspace({ repositoryId: 'repo-other' })));
    await settle();
    expect(document.querySelector('[role="alert"]')?.getAttribute('data-error-code')).toBe('busy');
    respond = (path, call) => call.ifNoneMatch === '"index-1"' ? new Response(null, { status: 304 }) : serveArchitecture(path);
    await act(async () => root?.render(workspace()));
    await settle();
    expect(calls.at(-1)).toEqual({ path: `/api/v1/repositories/${REPO}/architecture/modules`, ifNoneMatch: null });
    expect(document.querySelectorAll('.module-row')).toHaveLength(3);
  });
});

describe('architecture module page', () => {
  test('renders facts, raw §3 text, linked docs and a copy command equal to the CLI command', async () => {
    await mount(workspace({ moduleId: CENTER }));
    const page = document.querySelector('.module-page')!;
    expect(page.textContent).toContain('Own the pipeline ledger.');
    expect(page.textContent).toContain('src/cli/commands/pipeline.ts');
    expect(page.textContent).toContain('src/core/pipeline/ledger.ts');
    expect(page.textContent).toContain('bun test tests/pipeline.test.ts');
    const section3 = document.querySelector('pre.module-section3')!;
    expect(section3.textContent).toBe(detailFor().section3!);
    expect(section3.querySelector('*')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(page.querySelector('.module-docs')?.textContent).toContain('tasks/contracts/pipeline.contract.md');
    expect(page.querySelector('.module-docs')?.textContent).toContain('plans/pipeline.md');
    expect(page.querySelector('.module-docs')?.textContent).toContain('unknown');

    const prompt = promptFor(detailFor(), 1);
    expect(prompt.shard.count).toBeGreaterThan(1);
    expect(document.querySelector('.review-prompt__digest')?.textContent).toBe(prompt.digest);
    expect(document.querySelector('.review-prompt')?.textContent).toContain(`Total ${prompt.budget.used_bytes} bytes · 2048 bytes per shard`);
    const command = document.querySelector('[data-bot-command]')?.textContent;
    expect(command).toBe(`repo-harness module review-prompt ${CENTER} --shard 1`);
    const copy = document.querySelector<HTMLButtonElement>('.review-prompt__command button')!;
    await act(async () => copy.click());
    expect(copied).toEqual([command!]);
    await act(async () => document.querySelector<HTMLButtonElement>('.review-prompt__actions button')!.click());
    expect(copied[1]).toBe(prompt.prompt);

    const select = document.querySelector<HTMLSelectElement>('#review-prompt-shard')!;
    await act(async () => { select.value = '2'; select.dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event); });
    await settle();
    expect(calls.at(-1)?.path).toBe(`/api/v1/repositories/${REPO}/architecture/modules/${CENTER}/review-prompt?shard=2`);
    expect(document.querySelector('[data-bot-command]')?.textContent).toBe(`repo-harness module review-prompt ${CENTER} --shard 2`);
    expect(document.querySelector('.review-prompt__text pre')?.textContent).toBe(promptFor(detailFor(), 2).prompt);
  });

  test('a diff prompt names both revisions in the Bot command', () => {
    expect(reviewPromptCommand({ capability_id: CENTER, shard: { index: 2, count: 3, bytes: 1 }, mode: 'diff', base: 'a'.repeat(40), head: 'b'.repeat(40) }))
      .toBe(`repo-harness module review-prompt ${CENTER} --shard 2 --base ${'a'.repeat(40)} --head ${'b'.repeat(40)}`);
  });

  test('section 3 pending is stated, not left blank', async () => {
    respond = path => path.endsWith(CENTER) ? json(detailFor(CENTER, null)) : serveArchitecture(path);
    await mount(workspace({ moduleId: CENTER }));
    expect(document.querySelector('pre.module-section3')).toBeNull();
    expect(document.querySelector('.module-page')?.textContent).toContain('§3 pending');
  });
});

describe('one-hop module graph', () => {
  test('draws arrows only for directed edges and keeps child components inside the center frame', async () => {
    const graph = moduleGraph(CENTER, nodes, relations);
    await mount(<ModuleGraph graph={graph} onSelect={() => {}} t={t} />);
    const edges = [...document.querySelectorAll('.module-graph__edge')];
    expect(edges).toHaveLength(relations.length);
    for (const edge of edges) {
      const path = edge.querySelector('path')!;
      if (edge.getAttribute('data-direction') === 'directed') {
        expect(path.getAttribute('marker-end')).toMatch(/^url\(#.+-arrow\)$/u);
        expect(path.getAttribute('stroke-dasharray')).toBeNull();
        expect(edge.querySelector('text')).toBeNull();
      } else {
        expect(path.getAttribute('marker-end')).toBeNull();
        expect(path.getAttribute('stroke-dasharray')).toBe('5 4');
        expect(edge.querySelector('text')?.textContent).toBe('shares-schema');
      }
    }
    // ArchContext reads every relation from source to target, `shares-schema` included.
    expect(edges.map(edge => edge.getAttribute('data-direction'))).toEqual(['directed', 'directed', 'directed', 'directed']);
    const box = (id: string) => {
      const rect = document.querySelector(`[data-node-id="${id}"] rect`)!;
      return ['x', 'y', 'width', 'height'].map(name => Number(rect.getAttribute(name)));
    };
    const [cx, cy, cw, ch] = box(CENTER), [x, y, w, h] = box('component.pipeline.ledger');
    expect(x! > cx! && y! > cy! && x! + w! <= cx! + cw! && y! + h! <= cy! + ch!).toBe(true);
    const [callerX] = box(CALLER), [calleeX] = box('component.review.store');
    expect(callerX! < cx! && calleeX! > cx! + cw!).toBe(true);
  });

  test('recenters on a capability neighbor by click and keyboard; components are not targets', async () => {
    const selected: string[] = [];
    await mount(<ModuleGraph graph={moduleGraph(CENTER, nodes, relations)} onSelect={id => selected.push(id)} t={t} />);
    const caller = document.querySelector(`[data-node-id="${CALLER}"]`)!;
    expect(caller.getAttribute('role')).toBe('button');
    expect(caller.getAttribute('tabindex')).toBe('0');
    await act(async () => caller.dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    const evals = document.querySelector('[data-node-id="capability.verification.evals"]')!;
    await act(async () => evals.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }) as unknown as Event));
    expect(selected).toEqual([CALLER, 'capability.verification.evals']);
    expect(document.querySelector('[data-node-id="component.review.store"]')?.getAttribute('role')).toBeNull();
    expect(document.querySelector('[data-node-id="component.pipeline.ledger"]')?.getAttribute('role')).toBeNull();
  });

  test('a side with more than eight neighbors collapses to one node that expands to a list', async () => {
    const callers = Array.from({ length: 11 }, (_, index) => node(`capability.public-surface.caller-${String(index).padStart(2, '0')}`, 'capability'));
    const graph = moduleGraph(CENTER, [...nodes, ...callers], [...relations, ...callers.map(item => relation(`relation.z-${item.id}`, 'calls', item.id, CENTER))]);
    const selected: string[] = [];
    await mount(<ModuleGraph graph={graph} onSelect={id => selected.push(id)} t={t} />);
    const shown = document.querySelectorAll('.module-graph__node').length;
    expect(document.querySelectorAll('[data-node-role="caller"]:not(.module-graph__node--group)')).toHaveLength(8);
    const group = document.querySelector<SVGGElement>('.module-graph__node--group')!;
    expect(group.textContent).toBe('4 more');
    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.module-graph__group')).toBeNull();
    await act(async () => group.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }) as unknown as Event));
    expect(group.getAttribute('aria-expanded')).toBe('true');
    const members = [...document.querySelectorAll('.module-graph__group li')];
    expect(members.map(item => item.querySelector('code')?.textContent)).toEqual(graph.nodes.flatMap(item => isGroupNode(item) ? item.members.map(member => member.id) : []));
    expect(members).toHaveLength(4);
    expect(document.querySelectorAll('.module-graph__node')).toHaveLength(shown);
    await act(async () => members[0]!.querySelector('button')!.click());
    expect(selected).toEqual([members[0]!.querySelector('code')!.textContent!]);
  });
});

describe('architecture map', () => {
  const PART = 'component.pipeline.ledger';
  const EXTERNAL = 'external.git';
  const mapNode = (id: string, kind: string, parent: string | null = null) => ({ id, kind, name: `Name ${id}`, status: 'active', layer: 'core', parent, summary: `${id} summary`,
    domain: kind === 'capability' ? id.split('.')[1]! : null, namespace: kind === 'namespace' ? { type: 'host' } as const : null,
    mount: kind === 'mount' ? { source: null, target: null, mode: 'ro', order: 0 } as const : null });
  const mapRelation = (id: string, kind: string, source: string, target: string) => ({ id, kind, source, target, intent: `${id} intent`, protocol: null });
  const noCodeFacts = { state: 'unavailable', reason: 'code_facts_unavailable' } as const;
  const whole = { paths: false, nodes: false, relations: false, flow_steps: false, dependents: false, model: false } as const;
  const noCodeFactSteps = { status: 'unknown', reason_codes: ['ref-code-facts-unavailable'], items: null } as const;
  const undeclaredLayers = { state: 'unavailable', reason: 'model_layers_undeclared' } as const;
  const coreOnly = { state: 'ok', layers: ['core'] } as const;
  const noLayers: ArchitectureMapLayersInput = {
    changes: { state: 'unavailable', reason: 'archctx_error', code: 'AC_SCHEMA_INVALID', reason_code: 'native-context-model-invalid' },
    pull_requests: { state: 'unavailable', reason: 'dev_activity_pending' },
    violations: { debt: noCodeFacts, flows: { state: 'unavailable', reason: 'archctx_error', code: 'AC_SCHEMA_INVALID', reason_code: 'native-document-marker-invalid' },
      anchors: noCodeFacts, dependencies: noCodeFacts, layer_direction: undeclaredLayers },
    tests: { state: 'unavailable', reason: 'tests_pending' },
    decisions: { state: 'ok', items: [] },
  };
  const mapLayers: ArchitectureMapLayersInput = {
    // archctx impact as the map carries it: it gives the dependents (one `calls` hop) and cut the path list at its limit.
    changes: { state: 'ok', since: '2026-10-27T00:00:00.000Z', base: 'b'.repeat(40), commits: [{ sha: 'c'.repeat(40), subject: 'Ledger rows', nodes: [PART] }], model: [],
      paths: [{ path: 'assets/ledger.png', added: null, deleted: null, owners: [PART], reason_codes: ['binary-diff'] },
        { path: 'src/ledger.ts', added: 5, deleted: 2, owners: [PART], reason_codes: [] }],
      unowned_paths: [], nodes: [{ id: PART, files: 2 }], dependents: [{ id: CENTER, touched: PART, relations: ['relation.a-own'] }],
      dependency_coverage: 'partial', flow_steps: noCodeFactSteps, truncated: { ...whole, paths: true } },
    pull_requests: { state: 'unavailable', reason: 'dev_activity_unavailable' },
    violations: {
      debt: { state: 'ok', items: [{ kind: 'unowned-path', nodes: [], paths: ['src/orphan.ts'] }, { kind: 'stale-anchor', nodes: [PART], paths: [] }] },
      flows: { state: 'ok', selectors: 2, proven: 1, unproven: 1, used_unproven: 1, unprovable: [{ id: CENTER, diagnostics: 1 }], evidence: [] },
      anchors: noCodeFacts,
      dependencies: { state: 'ok', edges: [{ source: CENTER, target: CALLER, imports: 3 }] },
      layer_direction: undeclaredLayers,
    },
    tests: { state: 'ok', run: { id: 41, head_sha: 'd'.repeat(40), created_at: '2026-10-27T03:00:00Z' }, results: 'ok', capabilities: [
      { id: CALLER, files: 2, passed: 1, failed: 0, skipped: 0, no_result: 1 }, { id: CENTER, files: 2, passed: 1, failed: 1, skipped: 0, no_result: 0 }] },
    decisions: { state: 'ok', items: [
      { id: 'ADR-0001-router', title: 'Route through one router', status: 'accepted', decided_at: null, applies_to: [CALLER], supersedes: [], path: 'docs/adr/ADR-0001-router.md' },
      { id: 'ADR-0002-naming', title: 'Name things plainly', status: null, decided_at: null, applies_to: [], supersedes: [], path: 'docs/adr/ADR-0002-naming.md' },
    ] },
  };
  function mapFor(available = true, layers: ArchitectureMapLayersInput = mapLayers, layerOrder: ArchitectureLayerOrderV1 = coreOnly): ArchitectureMapV1 {
    return projectArchitectureMap({
      repository_id: REPO, commit: COMMIT, head_ref: 'main', archctx_version: '0.11.2', collected_at: '2026-10-27T09:00:00.000Z', layer_order: layerOrder,
      nodes: [mapNode(CENTER, 'capability'), mapNode(PART, 'component', CENTER), mapNode(CALLER, 'capability'), mapNode(EXTERNAL, 'external-system')],
      relations: [mapRelation('relation.a-own', 'calls', CENTER, PART), mapRelation('relation.b-router', 'calls', CALLER, CENTER), mapRelation('relation.c-git', 'reads', PART, EXTERNAL)], flows: [], flow_evidence: [],
      sizes: available ? { state: 'ok', lines: new Map([['src/ledger.ts', 900], ['src/router.ts', 100]]), owners: new Map([['src/ledger.ts', PART], ['src/router.ts', CALLER]]) }
        : { state: 'unavailable', reason: 'model_worktree_dirty' },
      // archctx reports an undeclared import only for a `deps` edge, so the undeclared CENTER → CALLER import is in the matrix too.
      dependencies: available ? { state: 'ok', matrix: [{ from: CALLER, to: CENTER, imports: 7 }, { from: CENTER, to: CALLER, imports: 3 }] } : { state: 'unavailable', reason: 'code_facts_other_commit' },
      layers,
    });
  }
  const reader = (read: ArchitectureMapRead): ArchitectureMapReader => async () => read;

  beforeEach(() => {
    // React Flow measures its viewport and nodes.
    Object.assign(globalThis, {
      ResizeObserver: window.ResizeObserver, SVGElement: window.SVGElement, DOMMatrixReadOnly: window.DOMMatrixReadOnly,
      requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    });
  });

  test('the map is the default view: capabilities in domain groups, external systems, one directed route per domain pair with imports; selecting a node lists its relations with import counts', async () => {
    const opened: (string | null)[] = [];
    const sources: unknown[] = [];
    await mount(workspace({ readMap: reader({ state: 'ok', map: mapFor() }), onModule: id => opened.push(id), onSource: source => sources.push(source) }));
    expect(document.querySelector('#architecture-tab-map')?.getAttribute('aria-selected')).toBe('true');
    expect(calls).toEqual([]);
    const canvas = document.querySelector('.architecture-map')!;
    expect([canvas.getAttribute('data-node-count'), canvas.getAttribute('data-relation-count'), canvas.getAttribute('data-edge-count')]).toEqual(['4', '3', '2']);
    // The capabilities sit in their domain groups beside the external system; a component is not on this map.
    expect([...document.querySelectorAll('.react-flow__node')].map(item => item.getAttribute('data-id')).sort())
      .toEqual([CALLER, CENTER, EXTERNAL, 'domain:public-surface', 'domain:workflow-engine'].sort());
    expect([...document.querySelectorAll('.architecture-modules__domain > b')].map(item => item.textContent)).toEqual(['public-surface', 'workflow-engine']);
    expect(document.querySelector(`.react-flow__node[data-id="${CENTER}"] .architecture-modules__size`)?.textContent).toBe('900 · 1');
    // The canvas draws the placed routes: one domain route for each direction of the imports, and the route of the git read.
    const small = layoutModules(mapFor());
    expect(small.edges.map(edge => [edge.source, edge.target, edge.imports])).toEqual([['public-surface', 'workflow-engine', 7], ['workflow-engine', 'public-surface', 3]]);
    expect([...document.querySelectorAll('.react-flow__edge-route .react-flow__edge-path')].map(path => path.getAttribute('d'))).toEqual(small.scene.routes.map(route => routePath(route.points)));
    // The recorded map: one route with an arrow at its target for each of the 22 directed domain pairs with imports; more imports draw wider.
    const recorded = decodeArchitectureMap(recordedMap);
    const real = layoutModules(recorded);
    const routes = real.scene.routes.filter(route => route.kind === 'imports');
    expect([real.edges.length, routes.length, routes.every(route => route.arrows.end && !route.arrows.start)]).toEqual([22, 22, true]);
    const imports = new Map(real.edges.map(edge => [edge.id, edge.imports]));
    for (const a of routes) for (const b of routes) if (imports.get(a.id)! > imports.get(b.id)!) expect(a.width).toBeGreaterThan(b.width);
    expect(sceneFindings(real.scene)).toEqual([]);
    // Every capability once, inside its domain box.
    const boxes = new Map(real.scene.boxes.map(box => [box.id, box]));
    expect(real.scene.boxes.filter(box => box.kind === 'box').map(box => box.id).sort()).toEqual(recorded.nodes.filter(node => node.kind === 'capability').map(node => node.id).sort());
    for (const box of real.scene.boxes.filter(item => item.parent !== null)) {
      const frame = boxes.get(box.parent!)!;
      expect(box.x >= frame.x && box.y >= frame.y && box.x + box.width <= frame.x + frame.width && box.y + box.height <= frame.y + frame.height).toBe(true);
    }
    // The header row gets the map's commit, collection time, branch and archctx version.
    expect(sources.at(-1)).toEqual({ commit: COMMIT, map: { collectedAt: '2026-10-27T09:00:00.000Z', headRef: 'main', archctxVersion: '0.11.2' } });
    // The base map has every source, so the side panel states no gap. The flow steps that archctx
    // reports as unknown concern only the sequence map, so the module map does not state them.
    expect(document.querySelectorAll('[data-map-side] > .architecture-map__gap')).toHaveLength(0);
    expect(document.querySelector('[data-layer-summary="changes"] .architecture-map__gap')).toBeNull();

    await act(async () => document.querySelector(`.react-flow__node[data-id="${CALLER}"]`)!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
    const inspector = document.querySelector('.architecture-map__inspector')!;
    expect(inspector.getAttribute('data-node-id')).toBe(CALLER);
    expect([...inspector.querySelectorAll('[data-relation-id]')].map(item => item.textContent)).toEqual([`out Name ${CENTER} · calls · 7 imports`]);
    expect(inspector.textContent).toContain('100 lines in 1 files');
    await act(async () => [...inspector.querySelectorAll('button')].find(item => item.textContent === 'Open module')!.click());
    expect(opened).toEqual([CALLER]);
    // The group's relation to its own member has no line on the canvas, but the inspector lists it.
    await act(async () => document.querySelector(`.react-flow__node[data-id="${CENTER}"]`)!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
    expect([...document.querySelectorAll('.architecture-map__inspector [data-relation-id]')].map(item => item.getAttribute('data-relation-id'))).toContain('relation.a-own');
  });

  test('a selected card on the recorded map lights its in and out neighbours, dims the rest, adds no route, and lists each relation with direction and imports', async () => {
    const OPERATOR = 'capability.runtime-harness.operator';
    await mount(workspace({ readMap: reader({ state: 'ok', map: decodeArchitectureMap(recordedMap) }) }));
    const edges = () => document.querySelectorAll('.react-flow__edge').length;
    const before = edges();
    expect(before).toBe(layoutModules(decodeArchitectureMap(recordedMap)).scene.routes.length);
    await act(async () => document.querySelector(`.react-flow__node[data-id="${OPERATOR}"]`)!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
    const card = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"] > div`)!;
    expect([card('capability.organization.board').getAttribute('data-neighbour'), card('capability.verification.evals-checks').getAttribute('data-neighbour'),
      card('capability.organization.board').hasAttribute('data-dimmed'), card('capability.public-surface.adoption').hasAttribute('data-dimmed')]).toEqual(['out', 'both', false, true]);
    expect(edges()).toBe(before);
    // Each state reads on screen: a glyph badge whose accessible name and hover give the direction, and a legend row for each state.
    const badge = (id: string) => card(id).querySelector('[data-badge="neighbour"]')!;
    expect([[badge('capability.organization.board').textContent, badge('capability.organization.board').getAttribute('aria-label')],
      [badge('capability.verification.evals-checks').textContent, badge('capability.verification.evals-checks').getAttribute('title')]])
      .toEqual([['→', 'Used by the selected module'], ['⇄', 'Uses the selected module and is used by it']]);
    const legendText = () => document.querySelector('.architecture-map__legend')?.textContent ?? '';
    // A narrow screen hides the canvas legend, so the same state rows also show below the canvas.
    const narrowText = () => document.querySelector('[data-narrow-legend]')?.textContent ?? '';
    for (const words of ['Used by the selection', 'Uses the selection', 'Uses it and is used by it']) expect([legendText(), narrowText()].every(text => text.includes(words))).toBe(true);
    // A route joins domains, so the selected card lights the routes of its domain; each route names its ends and imports.
    const route = (id: string) => document.querySelector(`.react-flow__edge[data-id="${id}"]`)!;
    expect([route('imports:verification->runtime-harness').classList.contains('is-active'), route('imports:verification->workflow-engine').classList.contains('is-dim'),
      route('imports:verification->runtime-harness').getAttribute('aria-label')]).toEqual([true, true, 'verification imports runtime-harness: 626 imports']);
    // One row for each model relation, with its direction, the other end (and the card that holds it), the kind and the imports between the two capabilities.
    const rows = [...document.querySelectorAll('.architecture-map__inspector [data-relation-id]')].map(item => item.textContent);
    for (const row of ['out Board · depends-on · 12 imports', 'out CI Report Core (Evals And Checks) · depends-on · 7 imports', 'in Evals And Checks · depends-on · 291 imports']) expect(rows).toContain(row);
    // The violations lens: an undeclared import inside one domain has no route, so it marks its two cards with the direction.
    await act(async () => document.querySelector<HTMLButtonElement>('.architecture-layers [data-layer="violations"]')!.click());
    await settle();
    const marks = Object.fromEntries([...document.querySelectorAll('.architecture-modules__box[data-undeclared]')].map(item => [item.closest('.react-flow__node')!.getAttribute('data-id'), item.getAttribute('data-undeclared')]));
    expect(marks).toEqual({
      'capability.runtime-harness.operator': 'both', 'capability.runtime-harness.architecture': 'in', 'capability.runtime-harness.refactor-program': 'out',
      'capability.runtime-harness.task-agent-host': 'out', 'capability.runtime-harness.global-runtime-reconciliation': 'in',
      'capability.workflow-engine.execution-primitives': 'out', 'capability.workflow-engine.workflow-state': 'in',
    });
    for (const [id, state] of Object.entries(marks as Record<string, string>)) expect(card(id).querySelector('[data-badge="undeclared"]')?.getAttribute('data-state')).toBe(state);
    for (const words of ['Undeclared import: imports', 'Undeclared import: imported', 'Undeclared import: both ways']) expect([legendText(), narrowText()].every(text => text.includes(words))).toBe(true);
    expect(card('capability.runtime-harness.architecture').querySelector('[data-badge="undeclared"]')?.getAttribute('aria-label')).toBe('A module of its domain imports it with no declared relation');
    // With a card selected, a lens route keeps its class (CSS keeps it readable) and names the undeclared import.
    expect([route('imports:verification->runtime-harness').classList.contains('architecture-map__edge--undeclared'), route('imports:verification->runtime-harness').getAttribute('aria-label')])
      .toEqual([true, 'Undeclared import: verification imports runtime-harness']);
    expect(edges()).toBe(before);
  });

  test('a missing line or import source is stated with its reason, and a failed read names its state and next step', async () => {
    await mount(workspace({ readMap: reader({ state: 'ok', map: mapFor(false) }) }));
    // Only the base-map gaps, in the side panel; the open layer's flow-step gap belongs to the sequence map.
    expect([...document.querySelectorAll('[data-map-side] > .architecture-map__gap')].map(item => item.getAttribute('data-reason'))).toEqual(['model_worktree_dirty', 'code_facts_other_commit']);
    expect(document.querySelector('.architecture-map__legend')?.textContent).not.toContain('imports');
    // Only the Layers view draws the layer order, so a model without ordered layers states no gap on the other base maps.
    await act(async () => root?.render(workspace({ readMap: reader({ state: 'ok', map: mapFor(true, mapLayers, undeclaredLayers) }) })));
    await settle();
    const sideGaps = () => [...document.querySelectorAll('[data-map-side] > .architecture-map__gap')].map(item => [item.getAttribute('data-gap'), item.getAttribute('data-reason')]);
    expect(sideGaps()).toEqual([]);
    for (const view of ['sequence', 'topology']) {
      await act(async () => document.querySelector<HTMLButtonElement>(`#architecture-tab-${view}`)!.click());
      await settle();
      expect(sideGaps()).toEqual([]);
    }
    await act(async () => document.querySelector<HTMLButtonElement>('#architecture-tab-map')!.click());
    await settle();
    // Each reason names its state and its next step; archctx's codes stay visible; a pending map is a status, not an alert.
    for (const [read, role, message, next] of [
      [{ state: 'unavailable', reason: 'architecture_map_pending' }, 'status', 'The server has not collected the architecture map yet.', 'The page reads the map again on its own.'],
      [{ state: 'unavailable', reason: 'registry_unavailable' }, 'alert', 'The repository registry is unreadable.', 'Run `repo-harness fleet prune` to show the registry error.'],
      [{ state: 'unavailable', reason: 'repository_not_found' }, 'alert', 'No registered repository has this id.', 'Adopt the repository with `repo-harness init`, then refresh the board.'],
      [{ state: 'unavailable', reason: 'model_unavailable' }, 'alert', 'The committed architecture model could not be read, and archctx gave no error code.', 'Check that the registered path is a git checkout with a commit. `repo-harness fleet prune` lists registrations whose path is gone.'],
      [{ state: 'unavailable', reason: 'archctx_error', code: 'AC_MODEL_ADOPTION_REQUIRED', reason_code: 'native-context-model-missing' }, 'alert',
        'archctx refused to read the committed architecture model: AC_MODEL_ADOPTION_REQUIRED native-context-model-missing.', 'Run `archctx export native --ref HEAD --json` in the repository. The archctx error gives its action and details.'],
      [{ state: 'unavailable', reason: 'architecture_map_invalid' }, 'alert', 'The architecture map failed validation.', 'Retry. If the error stays, restart `repo-harness operator serve`.'],
      [{ state: 'unavailable', reason: 'architecture_map_failed' }, 'alert', 'The map process read the committed model, then failed.', 'Wait for the next collection in 5 minutes. If the error stays, restart `repo-harness operator serve`.'],
      [{ state: 'unavailable', reason: 'architecture_map_timeout' }, 'alert', 'The map process passed its time limit.', 'Wait for the next collection in 5 minutes. If the error stays, check that git and archctx answer in the repository.'],
      [{ state: 'unavailable', reason: 'architecture_map_process_failed' }, 'alert', 'The map process did not start or gave no result.', 'Wait for the next collection in 5 minutes. If the error stays, restart `repo-harness operator serve`.'],
      [{ state: 'unavailable', reason: 'unreachable' }, 'alert', 'The operator API gave no typed answer.', 'Check that `repo-harness operator serve` runs, then retry.'],
    ] as const) {
      await act(async () => root?.render(workspace({ repositoryId: `repo-${read.reason}`, readMap: reader(read) })));
      await settle();
      const notice = document.querySelector(`.architecture-map-view > [role="${role}"]`);
      expect([notice?.getAttribute('data-error-code'), notice?.getAttribute('data-code'), [...notice?.children ?? []].map(line => line.textContent)])
        .toEqual([read.reason, read.reason === 'archctx_error' ? 'AC_MODEL_ADOPTION_REQUIRED native-context-model-missing' : null, [message, next]]);
      expect(document.querySelector('.architecture-map')).toBeNull();
    }
    // A failed refresh keeps the last map and says so before the reason.
    await act(async () => root?.render(workspace({ readMap: reader({ state: 'ok', map: mapFor() }) })));
    await settle();
    await act(async () => root?.render(workspace({ readMap: reader({ state: 'unavailable', reason: 'architecture_map_timeout' }), refreshGeneration: 1 })));
    await settle();
    expect([...document.querySelector('.architecture-map-view > [role="alert"]')?.children ?? []].map(line => line.textContent)[0]).toBe('The last map stays on screen. The refresh failed.');
    expect(document.querySelector('.architecture-map')).not.toBeNull();
    // The route's refusal body carries archctx's codes to the page.
    respond = () => json({ error: { code: 'archctx_error', message: 'm', next_action: 'n' }, archctx: { code: 'AC_SCHEMA_INVALID', reason_code: 'native-document-marker-invalid' } }, 503);
    expect(await fetchArchitectureMap('repo-a', new AbortController().signal))
      .toEqual({ state: 'unavailable', reason: 'archctx_error', code: 'AC_SCHEMA_INVALID', reason_code: 'native-document-marker-invalid' });
  });

  test('a pending map is read again 30 s later; only an unreachable route backs off to 60 s', async () => {
    const originalSet = globalThis.setTimeout;
    const delays: number[] = [];
    globalThis.setTimeout = ((run: () => void, delay = 0) => {
      if (delay < 30_000) return originalSet(run, delay);
      delays.push(delay);
      return 0;
    }) as unknown as typeof setTimeout;
    try {
      for (const [read, delay] of [[{ state: 'unavailable', reason: 'architecture_map_pending' }, 30_000], [{ state: 'unavailable', reason: 'unreachable' }, 60_000]] as const) {
        delays.length = 0;
        await act(async () => root?.unmount());
        await mount(workspace({ repositoryId: `repo-${read.reason}`, readMap: reader(read) }));
        expect(delays).toEqual([delay]);
      }
    } finally {
      globalThis.setTimeout = originalSet;
    }
  });

  test('the map opens on today\'s changes, and each layer marks nodes from the collector\'s facts or states its reason', async () => {
    await mount(workspace({ readMap: reader({ state: 'ok', map: mapFor() }) }));
    const box = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"] > div`)!;
    const layerButton = (layer: string) => document.querySelector<HTMLButtonElement>(`.architecture-layers [data-layer="${layer}"]`)!;
    const choose = async (layer: string) => { await act(async () => layerButton(layer).click()); await settle(); };
    const slot = (id: string, layer: string) => box(id).querySelector(`[data-slot="${layer}"]`)?.textContent;
    const gaps = () => [...document.querySelectorAll('.architecture-map__gap')].map(item => `${item.getAttribute('data-gap')}:${item.getAttribute('data-reason')}`);
    const notes = () => [...document.querySelectorAll('.architecture-map__note')].map(item => `${item.getAttribute('data-note')}:${item.getAttribute('data-reason')}`);

    expect(document.querySelector('.architecture-layers [aria-pressed="true"]')?.getAttribute('data-layer')).toBe('changes');
    expect([...document.querySelectorAll('.architecture-layers button')].map(item => `${item.getAttribute('data-layer')}:${item.getAttribute('data-state')}`))
      .toEqual(['changes:ok', 'violations:ok', 'pull_requests:unavailable', 'tests:ok', 'decisions:ok']);
    // Each chip with data counts what its layer covers.
    expect([...document.querySelectorAll('.architecture-layers button')].map(item => item.querySelector('.architecture-layers__count')?.textContent ?? null))
      .toEqual(['1 module · 1 commit', '4', null, '2 / 2', '2 decisions']);
    // The changed component marks its capability with the commits that touch it; archctx cut the paths, so that count is a lower bound.
    // Every card keeps the same five slots; a count of commits is neutral, and its hover says it in words.
    expect([slot(CENTER, 'changes'), slot(CALLER, 'changes'), box(CENTER).hasAttribute('data-alert'), box(CENTER).getAttribute('title')]).toEqual(['1+', '', false, '1 commit today · 3 violations · 2 test files: 1 passed, 1 failed, 0 skipped, 0 no result']);
    expect(box(CENTER).querySelector('.architecture-modules__slots')?.children).toHaveLength(5);
    expect(document.querySelector('[data-layer-summary="changes"]')?.textContent).toContain('≥2 files changed in 1 commit, ≥0 without an owner');
    expect([gaps(), notes()]).toEqual([[], ['changes.truncated:paths']]);
    // The sequence map states the flow steps that archctx cannot tie to the change, in its side panel.
    await act(async () => document.querySelector<HTMLButtonElement>('#architecture-tab-sequence')!.click());
    await settle();
    expect([...document.querySelectorAll('[data-map-side] .architecture-map__gap')].map(item => `${item.getAttribute('data-gap')}:${item.getAttribute('data-reason')}`)).toEqual(['changes.flow_steps:ref-code-facts-unavailable']);
    await act(async () => document.querySelector<HTMLButtonElement>('#architecture-tab-map')!.click());
    await settle();
    expect(document.querySelector('[data-note="changes.truncated"]')?.textContent).toBe('archctx stopped at its limits for changed paths. File and line counts are lower bounds.');
    await act(async () => box(CENTER).dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
    expect(document.querySelector('[data-module-commits]')?.textContent).toBe('ccccccc Ledger rows');
    // The selected card and its declared relations one hop away stay at full opacity; the rest dims.
    const dimmed = () => [CENTER, CALLER, EXTERNAL].filter(id => document.querySelector(`.react-flow__node[data-id="${id}"] [data-dimmed]`) !== null);
    expect(dimmed()).toEqual([]);

    await choose('violations');
    // The stale anchor on the component, the unprovable flow and the undeclared import: three items on the capability.
    // Only the active layer's slot carries color: the card and its violations slot are danger, the changes slot is neutral.
    expect([box(CENTER).getAttribute('data-alert'), slot(CENTER, 'violations'), slot(CALLER, 'violations'), box(CENTER).querySelector('[data-slot="violations"]')?.getAttribute('data-tone'), box(CENTER).querySelector('[data-slot="changes"]')?.getAttribute('data-tone')])
      .toEqual(['danger', '3', '', 'danger', null]);
    expect(document.querySelector('[data-layer-summary="violations"]')?.textContent).toContain('src/orphan.ts');
    expect(document.querySelector('[data-layer-summary="violations"]')?.textContent).toContain('Flow proofs: 1 of 2 selectors proven; 1 capabilities cannot prove their flow.');
    expect(gaps()).toEqual(['violations.anchors:code_facts_unavailable']);
    expect(notes()).toEqual(['violations.layer_direction:model_layers_undeclared']);
    expect(document.querySelector('.architecture-map__legend')?.textContent).toContain('Undeclared import');
    // The lens marks the domain route that carries the undeclared import, and the route keeps its arrow at the target.
    const undeclared = [...document.querySelectorAll('.react-flow__edge.architecture-map__edge--undeclared')];
    expect([undeclared.map(edge => edge.getAttribute('data-id')), undeclared[0]?.querySelector('.react-flow__edge-path')?.hasAttribute('marker-end')]).toEqual([['imports:workflow-engine->public-surface'], true]);

    await choose('tests');
    // A failing file shows ✕ and a file without a result shows ?; only the failure turns the card danger.
    expect([box(CENTER).getAttribute('data-alert'), slot(CENTER, 'tests'), box(CALLER).getAttribute('data-alert'), slot(CALLER, 'tests')]).toEqual(['danger', '1✕', null, '?']);
    expect(document.querySelector('[data-module-tests]')?.textContent).toBe('2 test files: 1 passed, 1 failed, 0 skipped, 0 no result');

    await choose('pull_requests');
    expect([gaps(), notes()]).toEqual([['pull_requests:dev_activity_unavailable'], []]);
    expect([...document.querySelectorAll('[data-slot="pull_requests"]')].filter(item => item.textContent !== '')).toHaveLength(0);
    await choose('decisions');
    expect([gaps(), notes()]).toEqual([[], []]);
    expect(document.querySelector('[data-layer-summary="decisions"]')?.textContent).toBe('2 decisions; 1 apply to model nodes.Decisions that apply to no node (1)Name things plainly · docs/adr/ADR-0002-naming.md');
    expect([box(CALLER).hasAttribute('data-alert'), slot(CALLER, 'decisions'), slot(CENTER, 'decisions')]).toEqual([false, '1', '']);
    await act(async () => box(CALLER).dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
    expect(document.querySelector('[data-module-decisions]')?.textContent).toBe('Route through one router (accepted) · docs/adr/ADR-0001-router.md');
    expect(dimmed()).toEqual([EXTERNAL]);

    // The violations chip counts each item once; a capability's mark counts each item that names one of its nodes once.
    const onlyDebt = (nodes: string[]): ArchitectureMapLayersInput => ({ ...mapLayers, violations: {
      debt: { state: 'ok', items: [{ kind: nodes.length === 0 ? 'unowned-path' : 'ambiguous-owner', nodes, paths: ['src/shared.ts'] }] },
      flows: noCodeFacts, anchors: noCodeFacts, dependencies: noCodeFacts, layer_direction: undeclaredLayers } });
    const debtRows: [string[], [string, string | null][]][] = [
      [[], [[CENTER, null], [CALLER, null]]],
      [[PART, CALLER], [[CENTER, '1'], [CALLER, '1']]],
      [[CENTER, PART], [[CENTER, '1'], [CALLER, null]]],
    ];
    for (const [nodes, marks] of debtRows) {
      await act(async () => root?.render(workspace({ repositoryId: `repo-debt-${nodes.join('-')}`, readMap: reader({ state: 'ok', map: mapFor(true, onlyDebt(nodes)) }) })));
      await settle();
      await choose('violations');
      expect([nodes, document.querySelector('.architecture-layers [data-layer="violations"] .architecture-layers__count')?.textContent,
        marks.map(([id]) => [id, slot(id, 'violations') || null])]).toEqual([nodes, '1', marks]);
    }
  });

  test('PR impact marks the nodes the chosen PR changes and the nodes that depend on them, and a PR without a complete list says why', async () => {
    const head = 'e'.repeat(40);
    const map = mapFor(true, { ...mapLayers, pull_requests: {
      state: 'ok', observed_at: '2026-10-27T08:59:00.000Z',
      pull_requests: [
        { number: 21, title: 'Ledger rows', url: 'https://github.com/acme/widgets/pull/21', head_sha: head, impact: {
          state: 'ok',
          paths: [{ path: 'README.md', added: null, deleted: null, owners: [], reason_codes: ['paths-only'] },
            { path: 'src/ledger.ts', added: null, deleted: null, owners: [PART], reason_codes: ['paths-only'] }],
          unowned_paths: ['README.md'], nodes: [{ id: PART, files: 1 }], dependents: [{ id: CENTER, touched: PART, relations: ['relation.a-own'] }],
          dependency_coverage: 'complete', flow_steps: { status: 'unknown', reason_codes: ['line-impact-unavailable', 'ref-code-facts-unavailable'], items: null }, truncated: whole,
        } },
        { number: 22, title: 'Big rewrite', url: 'https://github.com/acme/widgets/pull/22', head_sha: 'f'.repeat(40), impact: { state: 'unavailable', reason: 'files_truncated' } },
        { number: 23, title: 'Odd path', url: 'https://github.com/acme/widgets/pull/23', head_sha: 'a'.repeat(40),
          impact: { state: 'unavailable', reason: 'archctx_error', code: 'AC_SCHEMA_INVALID', reason_code: 'native-context-arguments-invalid' } },
      ],
    } });
    await mount(workspace({ readMap: reader({ state: 'ok', map }) }));
    const box = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"] > div`)!;
    const prSlot = (id: string) => box(id).querySelector('[data-slot="pull_requests"]')?.textContent;
    const gaps = () => [...document.querySelectorAll('.architecture-map__gap')].map(item => `${item.getAttribute('data-gap')}:${item.getAttribute('data-reason')}`);
    const notes = () => [...document.querySelectorAll('.architecture-map__note')].map(item => `${item.getAttribute('data-note')}:${item.getAttribute('data-reason')}`);
    await act(async () => document.querySelector<HTMLButtonElement>('.architecture-layers [data-layer="pull_requests"]')!.click());
    await settle();

    expect(document.querySelector('.architecture-layers [data-layer="pull_requests"]')?.getAttribute('data-state')).toBe('ok');
    // The side panel remounts with the base map, so each step reads the select again.
    const select = () => document.querySelector<HTMLSelectElement>('[data-layer-summary="pull_requests"] select')!;
    expect([select().value, [...select().options].map(option => option.textContent)]).toEqual(['21', ['#21 Ledger rows', '#22 Big rewrite', '#23 Odd path']]);
    const summary = document.querySelector('[data-pull-request="21"]')!.textContent;
    expect(summary).toContain(head.slice(0, 12));
    expect(summary).toContain('2 files changed in 1 node, 1 without an owner');
    // The PR slot counts the open PRs whose impact touches the capability, and the card turns info; the caller is only a dependent.
    expect([box(CENTER).getAttribute('data-alert'), prSlot(CENTER), prSlot(CALLER), box(CENTER).getAttribute('title')?.includes('1 open PR touches it: #21')]).toEqual(['info', '1', '', true]);
    expect(document.querySelector('.architecture-layers [data-layer="pull_requests"] .architecture-layers__count')?.textContent).toBe('#21 · 1 module');
    expect([gaps(), notes()]).toEqual([[], []]);
    await act(async () => document.querySelector<HTMLButtonElement>('#architecture-tab-sequence')!.click());
    await settle();
    expect([gaps(), notes()]).toEqual([['pull_request.flow_steps:line-impact-unavailable ref-code-facts-unavailable'], ['sequence.flows:flows_undeclared']]);
    await act(async () => document.querySelector<HTMLButtonElement>('#architecture-tab-map')!.click());
    await settle();
    await act(async () => box(CENTER).dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
    expect(document.querySelector('[data-module-impact="21"]')?.textContent).toBe('Changes 1 file here.');


    await act(async () => {
      select().value = '22';
      select().dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event);
    });
    await settle();
    expect(gaps()).toEqual(['pull_request:files_truncated']);
    // The slot counts every open PR whose impact touches the module, so choosing a PR without impact leaves it.
    expect(prSlot(CENTER)).toBe('1');

    await act(async () => {
      select().value = '23';
      select().dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event);
    });
    await settle();
    const refused = document.querySelector('.architecture-map__gap[data-gap="pull_request"]')!;
    expect([refused.getAttribute('data-reason'), refused.getAttribute('data-code'), refused.textContent]).toEqual(['archctx_error', 'AC_SCHEMA_INVALID native-context-arguments-invalid',
      'No impact for this pull request: archctx impact refused with AC_SCHEMA_INVALID native-context-arguments-invalid.']);

    // A capability counts each changed path that one of its nodes owns once, also a path with two owners in it; cut paths make the count a lower bound.
    const owned = (path: string, owners: string[]) => ({ path, added: null, deleted: null, owners, reason_codes: ['paths-only'] });
    const fileRows: [ReturnType<typeof owned>[], boolean, string][] = [
      [[owned('src/ledger.ts', [PART])], false, '1 file'],
      [[owned('src/ledger.ts', [PART, CENTER])], false, '1 file'],
      [[owned('src/ledger.ts', [PART]), owned('src/pipeline.ts', [CENTER])], true, '≥2 files'],
    ];
    for (const [paths, cut, files] of fileRows) {
      const rowMap = mapFor(true, { ...mapLayers, pull_requests: { state: 'ok', observed_at: '2026-10-27T08:59:00.000Z', pull_requests: [
        { number: 21, title: 'Ledger rows', url: 'https://github.com/acme/widgets/pull/21', head_sha: head, impact: {
          state: 'ok', paths, unowned_paths: [], nodes: [...new Set(paths.flatMap(path => path.owners))].map(id => ({ id, files: paths.filter(path => path.owners.includes(id)).length })),
          dependents: [], dependency_coverage: 'complete', flow_steps: { status: 'known', reason_codes: [], items: [] }, truncated: { ...whole, paths: cut },
        } }] } });
      await act(async () => root?.render(workspace({ repositoryId: `repo-files-${paths.length}-${cut}`, readMap: reader({ state: 'ok', map: rowMap }) })));
      await settle();
      await act(async () => document.querySelector<HTMLButtonElement>('.architecture-layers [data-layer="pull_requests"]')!.click());
      await settle();
      await act(async () => box(CENTER).dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
      await settle();
      expect([prSlot(CENTER), document.querySelector('[data-module-impact="21"]')?.textContent])
        .toEqual(['1', `Changes ${files} here.`]);
    }
  });

  test('a layer with data that marks no node dims no node', async () => {
    // A day without a change, a PR that touches no node, no violation, no test result per capability, no decision that applies to a node.
    const emptyImpact = { paths: [], unowned_paths: [], nodes: [], dependents: [], dependency_coverage: 'complete', flow_steps: noCodeFactSteps, truncated: whole } as const;
    const unlit: ArchitectureMapLayersInput = {
      changes: { state: 'ok', since: '2026-10-27T00:00:00.000Z', base: 'b'.repeat(40), commits: [], model: [], ...emptyImpact },
      pull_requests: { state: 'ok', observed_at: '2026-10-27T08:59:00.000Z', pull_requests: [
        { number: 21, title: 'Docs', url: 'https://github.com/acme/widgets/pull/21', head_sha: 'e'.repeat(40), impact: { state: 'ok', ...emptyImpact } }] },
      violations: { debt: { state: 'ok', items: [] }, flows: { state: 'ok', selectors: 0, proven: 0, unproven: 0, used_unproven: 0, unprovable: [], evidence: [] },
        anchors: noCodeFacts, dependencies: { state: 'ok', edges: [] }, layer_direction: undeclaredLayers },
      tests: { state: 'ok', run: { id: 41, head_sha: 'd'.repeat(40), created_at: '2026-10-27T03:00:00Z' }, results: 'ok', capabilities: [] },
      decisions: mapLayers.decisions.state === 'ok' ? { state: 'ok', items: mapLayers.decisions.items.filter(item => item.applies_to.length === 0) } : mapLayers.decisions,
    };
    await mount(workspace({ readMap: reader({ state: 'ok', map: mapFor(true, unlit) }) }));
    const seen: [string, string | null, number][] = [];
    for (const button of document.querySelectorAll<HTMLButtonElement>('.architecture-layers button')) {
      await act(async () => button.click());
      await settle();
      seen.push([button.getAttribute('data-layer')!, button.getAttribute('data-state'), [...document.querySelectorAll('.architecture-modules__slot')].filter(item => item.textContent !== '').length]);
    }
    expect(seen).toEqual(['changes', 'violations', 'pull_requests', 'tests', 'decisions'].map(layer => [layer, 'ok', 0]));

    // Today's changes may mark a node that they removed from the model: that mark lights no map node.
    // A mark on a current component fills the changes slot of its capability only.
    const GONE = 'capability.gone';
    const changed = (ids: string[]): ArchitectureMapLayersInput => ({ ...unlit, changes: {
      state: 'ok', since: '2026-10-27T00:00:00.000Z', base: 'b'.repeat(40), commits: [{ sha: 'c'.repeat(40), subject: 'Ledger rows', nodes: ids }],
      model: ids.includes(GONE) ? [{ kind: 'nodes', id: GONE, change: 'removed', fields: [] }] : [],
      ...emptyImpact, paths: ids.map(id => ({ path: `src/${id}.ts`, added: 1, deleted: 0, owners: [id], reason_codes: [] })), nodes: ids.map(id => ({ id, files: 1 })),
    } });
    const lit: [string[], string[], boolean][] = [];
    for (const ids of [[GONE], [GONE, PART], [PART]]) {
      await act(async () => root?.render(workspace({ repositoryId: `repo-${ids.join('-')}`, readMap: reader({ state: 'ok', map: mapFor(true, changed(ids)) }) })));
      await settle();
      await act(async () => document.querySelector<HTMLButtonElement>('.architecture-layers [data-layer="changes"]')!.click());
      await settle();
      lit.push([ids, [...document.querySelectorAll('[data-slot="changes"]')].filter(item => item.textContent !== '').map(item => item.closest('.react-flow__node')!.getAttribute('data-id')!).sort(),
        document.querySelector('[data-layer-summary="changes"]')!.textContent!.includes('Model: 0 nodes added, 1 removed')]);
    }
    // The last column: the layer summary still counts the removed node.
    expect(lit).toEqual([[[GONE], [], true], [[GONE, PART], [CENTER], true], [[PART], [CENTER], false]]);
  });

  test('a layer without data is still listed and says why', async () => {
    await mount(workspace({ readMap: reader({ state: 'ok', map: projectArchitectureMap({ ...mapFor(), sizes: { state: 'unavailable', reason: 'model_worktree_dirty' },
      dependencies: { state: 'unavailable', reason: 'model_worktree_dirty' }, layers: noLayers }) }) }));
    const changes = document.querySelector('.architecture-map__gap[data-gap="changes"]')!;
    expect([changes.getAttribute('data-reason'), changes.getAttribute('data-code')]).toEqual(['archctx_error', 'AC_SCHEMA_INVALID native-context-model-invalid']);
    // Decisions come from the model export, so that layer always has data, even with no decision.
    expect([...document.querySelectorAll('.architecture-layers [data-state="unavailable"]')].map(item => item.getAttribute('data-layer'))).toEqual(['changes', 'violations', 'pull_requests', 'tests']);
    expect(document.querySelectorAll('.architecture-modules__box[data-alert]')).toHaveLength(0);
    // An archctx refusal shows archctx's own code.
    await act(async () => document.querySelector<HTMLButtonElement>('.architecture-layers [data-layer="violations"]')!.click());
    await settle();
    const flows = document.querySelector('.architecture-map__gap[data-gap="violations.flows"]')!;
    expect([flows.getAttribute('data-reason'), flows.getAttribute('data-code'), flows.textContent]).toEqual(['archctx_error', 'AC_SCHEMA_INVALID native-document-marker-invalid',
      'Flow proofs: unknown, archctx refused with AC_SCHEMA_INVALID native-document-marker-invalid']);
  });
});

describe('sequence and topology base maps', () => {
  const PART = 'component.pipeline.ledger';
  const EXTERNAL = 'external.git';
  const SERVER = 'process.operator-server';
  const CLI = 'process.cli';
  const HOST = 'namespace.host.developer';
  const FLOW = 'flow.pipeline.ledger';
  const mapNode = (id: string, kind: string, parent: string | null = null) => ({ id, kind, name: `Name ${id}`, status: 'active', layer: 'core', parent, summary: `${id} summary`,
    domain: kind === 'capability' ? id.split('.')[1]! : null, namespace: kind === 'namespace' ? { type: 'host' } as const : null,
    mount: kind === 'mount' ? { source: null, target: null, mode: 'ro', order: 0 } as const : null });
  const mapRelation = (id: string, kind: string, source: string, target: string) => ({ id, kind, source, target, intent: `${id} intent`, protocol: null });
  const selector = (name: string): ArchitectureFlowSelectorV1 => ({ entrypoint: `entrypoint.pipeline.${name}`, source_symbol: name, sink: `sink.pipeline.${name}` });
  const step = (id: string, from: string, to: string, name: string) => ({ id, from, to, label: `Step ${id}`, evidence: selector(name) });
  const flow: ArchitectureMapFlowV1 = {
    id: FLOW, capability: CENTER, name: 'Append a ledger row', applicability: 'required',
    participants: [{ id: 'router', node: CALLER }, { id: 'pipe', node: CENTER }, { id: 'ledger', node: PART }, { id: 'git', node: EXTERNAL }],
    steps: [step('route', 'router', 'pipe', 'route'), step('append', 'pipe', 'ledger', 'append')],
    outcomes: [
      { id: 'kept', kind: 'success', label: 'Row kept', steps: [step('commit', 'ledger', 'git', 'commit')], terminal: { participant: 'pipe', label: 'Done' } },
      { id: 'refused', kind: 'error', label: 'Row refused', steps: [step('refuse', 'ledger', 'pipe', 'refuse')], terminal: { participant: 'router', label: 'Stop' } },
    ],
  };
  const noCodeFacts = { state: 'unavailable', reason: 'code_facts_unavailable' } as const;
  const whole = { paths: false, nodes: false, relations: false, flow_steps: false, dependents: false, model: false } as const;
  const layers: ArchitectureMapLayersInput = {
    changes: { state: 'ok', since: '2026-10-27T00:00:00.000Z', base: 'b'.repeat(40), commits: [{ sha: 'c'.repeat(40), subject: 'Ledger rows', nodes: [PART] }], model: [],
      paths: [{ path: 'src/ledger.ts', added: 5, deleted: 2, owners: [PART], reason_codes: [] }], unowned_paths: [], nodes: [{ id: PART, files: 1 }],
      dependents: [{ id: CENTER, touched: PART, relations: ['relation.a-own'] }], dependency_coverage: 'complete',
      flow_steps: { status: 'known', reason_codes: [], items: [{ flow: FLOW, step: 'append', outcome: null, reason_codes: [] }] }, truncated: whole },
    pull_requests: { state: 'ok', observed_at: '2026-10-27T08:59:00.000Z', pull_requests: [
      { number: 21, title: 'Ledger rows', url: 'https://github.com/acme/widgets/pull/21', head_sha: 'e'.repeat(40), impact: {
        state: 'ok', paths: [{ path: 'src/ledger.ts', added: null, deleted: null, owners: [PART], reason_codes: ['paths-only'] }], unowned_paths: [],
        nodes: [{ id: PART, files: 1 }], dependents: [], dependency_coverage: 'complete',
        flow_steps: { status: 'known', reason_codes: [], items: [{ flow: FLOW, step: 'commit', outcome: 'kept', reason_codes: [] }] }, truncated: whole,
      } },
    ] },
    violations: {
      debt: { state: 'ok', items: [] },
      flows: { state: 'ok', selectors: 4, proven: 1, unproven: 1, used_unproven: 1, unprovable: [{ id: CENTER, diagnostics: 2 }],
        evidence: [{ ...selector('route'), status: 'proven', call_sites: [{ path: 'src/router.ts', line: 12 }, { path: 'src/router-entry.ts', line: null }] },
          { ...selector('append'), status: 'no-direct-call', call_sites: [] }] },
      anchors: noCodeFacts,
      dependencies: { state: 'ok', edges: [{ source: CENTER, target: CALLER, imports: 3 }] },
      layer_direction: { state: 'unavailable', reason: 'model_layers_undeclared' },
    },
    tests: { state: 'ok', run: { id: 41, head_sha: 'd'.repeat(40), created_at: '2026-10-27T03:00:00Z' }, results: 'ok', capabilities: [
      { id: CALLER, files: 1, passed: 1, failed: 0, skipped: 0, no_result: 0 }, { id: CENTER, files: 2, passed: 1, failed: 1, skipped: 0, no_result: 0 }] },
    decisions: { state: 'ok', items: [{ id: 'ADR-0001-ledger', title: 'Keep one ledger', status: 'accepted', decided_at: null, applies_to: [CENTER], supersedes: [], path: 'docs/adr/ADR-0001-ledger.md' }] },
  };
  function runtimeMap(change: { layers?: ArchitectureMapLayersInput; flows?: ArchitectureMapFlowV1[]; nodes?: readonly ArchitectureMapNodeV1[]; relations?: readonly ArchitectureMapRelationV1[] } = {}): ArchitectureMapV1 {
    return projectArchitectureMap({
      repository_id: REPO, commit: COMMIT, head_ref: 'main', archctx_version: '0.11.2', collected_at: '2026-10-27T09:00:00.000Z', layer_order: { state: 'ok', layers: ['core'] },
      nodes: change.nodes ?? [mapNode(CENTER, 'capability'), mapNode(PART, 'component', CENTER), mapNode(CALLER, 'capability'), mapNode(EXTERNAL, 'external-system'),
        mapNode(SERVER, 'process'), mapNode(CLI, 'process'), mapNode(HOST, 'namespace')],
      relations: change.relations ?? [mapRelation('relation.a-own', 'calls', CENTER, PART), mapRelation('relation.b-router', 'calls', CALLER, CENTER),
        mapRelation('relation.c-git', 'reads', PART, EXTERNAL), mapRelation('relation.d-deploy', 'deployed-on', CENTER, SERVER),
        mapRelation('relation.e-runs', 'runs-in', SERVER, HOST), mapRelation('relation.f-runs', 'runs-in', CLI, HOST), mapRelation('relation.g-spawns', 'spawns', CLI, SERVER)],
      flows: change.flows ?? [flow, { id: 'flow.router.none', capability: CALLER, name: 'No router flow', applicability: 'not-applicable', rationale: 'The router makes no call.' }],
      // Declared code names the default flow's selectors only.
      flow_evidence: change.flows !== undefined ? [] : [{ ...selector('route'), node: CALLER, source_path: 'src/router.ts', sink_path: 'src/pipeline.ts', sink_symbol: 'route' },
        { ...selector('append'), node: CENTER, source_path: 'src/pipeline.ts', sink_path: null, sink_symbol: 'append' }],
      sizes: { state: 'ok', lines: new Map([['src/ledger.ts', 900], ['src/router.ts', 100]]), owners: new Map([['src/ledger.ts', PART], ['src/router.ts', CALLER]]) },
      dependencies: { state: 'ok', matrix: [{ from: CALLER, to: CENTER, imports: 7 }] },
      layers: change.layers ?? layers,
    });
  }
  const reader = (map: ArchitectureMapV1): ArchitectureMapReader => async () => ({ state: 'ok', map });
  const click = async (selector: string) => {
    await act(async () => document.querySelector(selector)!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
  };
  const tab = async (id: string) => { await act(async () => document.querySelector<HTMLButtonElement>(`#architecture-tab-${id}`)!.click()); await settle(); };
  const segment = async (base: string) => click(`[data-topology-base="${base}"]`);
  const chooseLayer = async (layer: string) => { await act(async () => document.querySelector<HTMLButtonElement>(`.architecture-layers [data-layer="${layer}"]`)!.click()); await settle(); };
  const notes = () => [...document.querySelectorAll('.architecture-map__note')].map(item => `${item.getAttribute('data-note')}:${item.getAttribute('data-reason')}`);
  const inspector = () => document.querySelector('.architecture-map__inspector')!;

  beforeEach(() => {
    Object.assign(globalThis, {
      ResizeObserver: window.ResizeObserver, SVGElement: window.SVGElement, DOMMatrixReadOnly: window.DOMMatrixReadOnly,
      requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    });
  });

  test('a participant runs in its nearest deployed process, and each process box holds its headers in a row; rows follow the model with one fragment per outcome; the recorded flows pass the scene check with whole labels', () => {
    const map = runtimeMap();
    const place = runtimePlacement(map);
    expect([CALLER, CENTER, PART, EXTERNAL, SERVER].map(place)).toEqual([
      { kind: 'unknown', reason: 'deployment_undeclared' }, { kind: 'process', process: SERVER }, { kind: 'process', process: SERVER }, { kind: 'external' }, { kind: 'process', process: SERVER }]);
    const twice = runtimeMap({ relations: [...runtimeMap().relations, mapRelation('relation.h-deploy', 'deployed-on', CENTER, CLI)] });
    expect(runtimePlacement(twice)(PART)).toEqual({ kind: 'unknown', reason: 'deployment_ambiguous' });
    const unmarked = { tone: () => null, status: () => null };
    const named = (names: (node: string) => string) => ({ process: (where: { kind: string }) => `Process ${where.kind}`, participant: (participant: { node: string }) => names(participant.node) });
    // Each text holder is as wide as its text at the shared estimate with a 12 px pad on each side, and the file holds every box and label.
    const fits = (scene: PlacedScene, lines: (box: SceneBox) => readonly string[]) => {
      const { width, height } = scene.extent;
      const inside = (item: { x: number; y: number; width: number; height: number }) => item.x >= 0 && item.y >= 0 && item.x + item.width <= width && item.y + item.height <= height;
      return [...scene.boxes.filter(box => !inside(box) || lines(box).some(line => textWidth(line, 'title') + 24 > box.width)).map(box => box.id),
        ...scene.labels.filter(label => !inside(label) || label.width !== textWidth(label.text, 'label')).map(label => label.text)];
    };
    // The ledger is listed after the router but shares the pipe's process, so it sits next to the pipe.
    const reordered = { ...flow, participants: [flow.participants[1]!, flow.participants[0]!, flow.participants[3]!, flow.participants[2]!] };
    const { scene } = layoutSequence(reordered, place, unmarked, named(node => `Name ${node}`));
    const box = new Map(scene.boxes.map(item => [item.id, item]));
    const headers = scene.boxes.filter(item => item.id.startsWith('participant:'));
    expect(scene.boxes.filter(item => item.parent === null && item.id.startsWith('box:')).map(item => [item.id, headers.filter(header => header.parent === item.id).map(header => header.id)])).toEqual([
      [`box:process:${SERVER}`, ['participant:pipe', 'participant:ledger']], ['box:unknown:deployment_undeclared', ['participant:router']], ['box:external', ['participant:git']]]);
    for (const [index, header] of headers.entries()) {
      const holder = box.get(header.parent!)!;
      expect(header.x > holder.x && header.x + header.width < holder.x + holder.width && header.y + header.height < holder.y + holder.height).toBe(true);
      if (index > 0) expect(header.x > headers[index - 1]!.x + headers[index - 1]!.width).toBe(true);
    }
    expect(scene.routes.map(route => route.id)).toEqual(['message::route', 'message::append', 'message:kept:commit', 'message:refused:refuse']);
    for (const [index, route] of scene.routes.slice(1).entries()) expect(route.points[0]![1] > scene.routes[index]!.points[0]![1]).toBe(true);
    // A fragment is a band above its rows that spans the columns its outcome names: the kept rows reach git, the refused rows end at the router.
    const lifeline = (id: string) => box.get(`lifeline:${id}`)!.x;
    const [kept, refused] = [box.get('fragment:kept')!, box.get('fragment:refused')!];
    expect([kept.kind, refused.kind, kept.y + kept.height < box.get('terminal:kept')!.y, kept.y + kept.height < scene.routes[2]!.points[0]![1], box.get('terminal:kept')!.kind])
      .toEqual(['fragment success', 'fragment error', true, true, 'terminal success']);
    expect([kept, refused].map(band => [band.x < lifeline('pipe'), band.x + band.width > lifeline('git')])).toEqual([[true, true], [true, false]]);
    expect(sceneFindings(scene)).toEqual([]);

    // Wide text: a CJK message label, a self message on the last participant, a long participant name, and long band and terminal labels. Every box
    // grows to its text, the scene check finds nothing, and the file keeps each whole text inside its view box.
    const cjk = (text: string) => text.repeat(4);
    const [route, append] = flow.steps;
    const [keptOutcome, refusedOutcome] = flow.outcomes;
    const wide = { ...flow,
      steps: [{ ...route!, label: cjk('流水线先校验请求和账本状态') }, { ...append!, from: 'git', to: 'git', label: 'WRITE THE WHOLE MEMBER ROW BEFORE ANY OTHER WRITER MOVES' }],
      outcomes: [
        { ...keptOutcome!, label: cjk('账本行已保存并提交到 git'), terminal: { participant: 'git', label: 'WROTE THE COMMITTED LEDGER ROW AND RETURNED ITS SHA TO THE MAIN WINDOW' } },
        { ...refusedOutcome!, label: 'Row refused because the ledger rejected the append for a known reason', terminal: { participant: 'router', label: '停止：返回拒绝原因和账本代码给路由器' } },
      ] };
    const wideNames = (node: string) => node === CENTER ? 'Pipeline Workflow Engine Capability With Many Many Words' : node === CALLER ? '路由器：根路由在流水线之前选择处理程序' : `Name ${node}`;
    const wideLayout = layoutSequence(wide, place, unmarked, named(wideNames));
    const wideSvg = sceneSvg(wideLayout.scene, wideLayout.lines);
    const texts = [...wideLayout.scene.boxes.flatMap(box => wideLayout.lines(box)), ...wideLayout.scene.labels.map(label => label.text)];
    expect([sceneFindings(wideLayout.scene), fits(wideLayout.scene, wideLayout.lines), texts.length, texts.filter(item => !wideSvg.includes(`>${item}</text>`))])
      .toEqual([[], [], 3 + 4 + 2 + 2 + 4, []]);
    // The self message's label lies right of every lifeline; the bounds that the extent, the first view and Fit read hold every box, label and route point.
    const bounds = sceneBounds(wideLayout.scene);
    const held = (x: number, y: number, width = 0, height = 0) => x >= bounds.x && y >= bounds.y && x + width <= bounds.x + bounds.width && y + height <= bounds.y + bounds.height;
    const selfLabel = wideLayout.scene.labels.find(label => label.route === 'message::append')!;
    expect([selfLabel.x > Math.max(...wideLayout.scene.boxes.filter(box => box.kind === 'lifeline').map(box => box.x + box.width)),
      [...wideLayout.scene.boxes, ...wideLayout.scene.labels].every(item => held(item.x, item.y, item.width, item.height)),
      wideLayout.scene.routes.every(route => route.points.every(([x, y]) => held(x, y))), wideLayout.scene.extent.width === bounds.x + bounds.width + 16]).toEqual([true, true, true, true]);

    // The recorded map: every flow passes the scene check, labels included; each label is its step's whole label, each box fits its text, and the
    // file draws one path for each message with the route's path. The other base maps write the same files as on main 2418cd6fc.
    const recorded = decodeArchitectureMap(recordedMap);
    const placed = runtimePlacement(recorded);
    const flows = recorded.flows.flatMap(entry => entry.applicability === 'required' ? [entry] : []);
    const results = flows.map(entry => {
      const layout = layoutSequence(entry, placed, unmarked, named(node => recorded.nodes.find(item => item.id === node)!.name));
      const paths = [...sceneSvg(layout.scene, () => []).matchAll(/<path class="route[^"]*" stroke-width="[^"]*" d="([^"]*)"/gu)].map(match => match[1]);
      return { findings: sceneFindings(layout.scene), whole: layout.scene.labels.every(label => label.text === layout.messages.get(label.route!)!.step.label) && fits(layout.scene, layout.lines).length === 0,
        paths: JSON.stringify(paths) === JSON.stringify(layout.scene.routes.map(route => routePath(route.points))) && paths.length === flowSteps(entry).length };
    });
    expect([flows.length, results.filter(result => result.findings.length > 0 || !result.whole || !result.paths)]).toEqual([31, []]);
    const order = recorded.layer_order.state === 'ok' ? recorded.layer_order.layers : [];
    const others = [layoutModules(recorded).scene, layoutLayers(recorded, order).scene('effects'), layoutTopology(recorded, placed, 'process', true).scene].map(item => sceneSvg(item, entry => [entry.id]));
    expect(createHash('sha256').update(others.join('\n')).digest('hex')).toBe('fb0fe8f77b02a5c4351424b2b0166960e774a2c625c4ef36ccd1fda8bebe28ac');
  });

  test('topology segments: processes hold deployed code and draw lifted relations; namespaces frame their mounts in order with a reader or writer tone; mounters list mounts in order', () => {
    const map = runtimeMap();
    const processes = layoutTopology(map, runtimePlacement(map), 'process', true);
    const box = new Map(processes.boxes.map(item => [item.node.id, item]));
    const parent = (layout: { readonly scene: { readonly boxes: readonly { readonly id: string; readonly parent: string | null }[] } }, id: string) => layout.scene.boxes.find(item => item.id === id)!.parent;
    // Process boxes and external systems only; the namespace and its runs-in relations belong to the namespace segment.
    expect(processes.boxes.map(item => item.node.id).sort()).toEqual([CLI, EXTERNAL, SERVER].sort());
    expect([parent(processes, SERVER), box.get(SERVER)!.members.map(member => member.id)]).toEqual([null, [CENTER]]);
    // The spawn joins two processes; the ledger's read of git is drawn from its process; the router runs in no process.
    expect(processes.edges.map(edge => [edge.source, edge.target, edge.kind, edge.dashed, edge.relations, edge.protocols])).toEqual([
      [SERVER, EXTERNAL, 'io', true, ['relation.c-git'], []], [CLI, SERVER, 'spawns', true, ['relation.g-spawns'], []]]);
    expect(processes.unplaced).toEqual(['relation.b-router']);

    // CLI mounts the cache (order 1) and the config (order 0); a deprecated store sits in the host frame; the host reaches a second namespace over ssh.
    const mount = (id: string, order: number, status = 'active') => ({ ...mapNode(id, 'mount'), status, mount: { source: order === 0 ? null : `src/${id}`, target: `mnt/${id}`, mode: 'rw', order } as const });
    const mounted = runtimeMap({
      nodes: [...runtimeMap().nodes, mount('mount.cache', 1), mount('mount.config', 0), mount('mount.old', 2, 'deprecated'), mapNode('namespace.remote', 'namespace')],
      relations: [...runtimeMap().relations.map(relation => relation.kind === 'spawns' ? { ...relation, protocol: 'stdio' } : relation),
        mapRelation('relation.m-cache', 'mounts', CLI, 'mount.cache'), mapRelation('relation.m-config', 'mounts', CLI, 'mount.config'), mapRelation('relation.m-old', 'mounts', HOST, 'mount.old'),
        mapRelation('relation.w-cache', 'writes', PART, 'mount.cache'), mapRelation('relation.r-cache', 'reads', CALLER, 'mount.cache'), mapRelation('relation.r-old', 'reads', CALLER, 'mount.old'),
        { ...mapRelation('relation.s-remote', 'calls', HOST, 'namespace.remote'), protocol: 'ssh' }],
    });
    expect(layoutTopology(mounted, runtimePlacement(mounted), 'process', true).edges.find(edge => edge.kind === 'spawns')?.protocols).toEqual(['stdio']);
    // Legacy off with a deprecated node in each place that another node names: a namespace parent (with a grandparent and at the top),
    // a mount's home namespace and mounter, and a process with deployed code.
    const deprecated = (node: ArchitectureMapNodeV1): ArchitectureMapNodeV1 => ({ ...node, status: 'deprecated' });
    const hidden = runtimeMap({
      nodes: [...runtimeMap().nodes, deprecated(mapNode('namespace.old', 'namespace', HOST)), mapNode('namespace.child', 'namespace', 'namespace.old'),
        deprecated(mapNode('namespace.gone', 'namespace')), mapNode('namespace.orphan', 'namespace', 'namespace.gone'),
        mount('mount.kept', 0), deprecated(mapNode('process.old', 'process'))],
      relations: [...runtimeMap().relations, mapRelation('relation.m-kept', 'mounts', 'namespace.old', 'mount.kept'),
        mapRelation('relation.p-deploy', 'deployed-on', PART, 'process.old'), mapRelation('relation.p-runs', 'runs-in', 'process.old', HOST)],
    });
    const cases: readonly { readonly name: string; readonly map: ArchitectureMapV1; readonly base: TopologyBase; readonly legacy: boolean; readonly expected: unknown }[] = [
      { name: 'hidden namespace parents', map: hidden, base: 'namespace', legacy: false, expected: {
        boxes: [[HOST, null, true, null], ['mount.kept', HOST, false, 'point'], ['namespace.child', HOST, false, null], ['namespace.orphan', null, false, null]], edges: [], members: [] } },
      { name: 'hidden mounter', map: hidden, base: 'mount', legacy: false, expected: { boxes: [], edges: [], members: [] } },
      // The ledger runs in the hidden process, so its read of git has no box and is not unplaced; the router's call into the pipe still is.
      { name: 'hidden process', map: hidden, base: 'process', legacy: false, expected: {
        boxes: [[EXTERNAL, null, false, null], [CLI, null, false, null], [SERVER, null, false, null]], edges: [[CLI, SERVER, 'spawns', []]], members: [[SERVER, [CENTER]]] } },
      { name: 'namespace frames', map: mounted, base: 'namespace', legacy: true, expected: {
        boxes: [[HOST, null, true, null], ['mount.config', HOST, false, 'point'], ['mount.cache', HOST, false, 'writer'], ['mount.old', HOST, false, 'reader'], ['namespace.remote', null, false, null]],
        edges: [[HOST, 'namespace.remote', 'calls', ['ssh']]], members: [] } },
      { name: 'legacy off', map: mounted, base: 'namespace', legacy: false, expected: {
        boxes: [[HOST, null, true, null], ['mount.config', HOST, false, 'point'], ['mount.cache', HOST, false, 'writer'], ['namespace.remote', null, false, null]],
        edges: [[HOST, 'namespace.remote', 'calls', ['ssh']]], members: [] } },
      // Mounters follow the model's node order.
      { name: 'mounters', map: mounted, base: 'mount', legacy: true, expected: {
        boxes: [[HOST, null, false, null], [CLI, null, false, null]], edges: [], members: [[HOST, ['mount.old']], [CLI, ['mount.config', 'mount.cache']]] } },
      { name: 'no mount', map, base: 'mount', legacy: true, expected: { boxes: [], edges: [], members: [] } },
    ];
    for (const entry of cases) {
      const layout = layoutTopology(entry.map, runtimePlacement(entry.map), entry.base, entry.legacy);
      const actual: unknown = {
        boxes: layout.boxes.map(item => [item.node.id, parent(layout, item.node.id), item.group, item.tone]),
        edges: layout.edges.map(edge => [edge.source, edge.target, edge.kind, edge.protocols]),
        members: layout.boxes.filter(item => item.members.length > 0).map(item => [item.node.id, item.members.map(member => member.id)]),
      };
      expect([entry.name, actual]).toEqual([entry.name, entry.expected]);
      // Each box of the SVG file clips its text with its own clip path.
      const svg = sceneSvg(layout.scene, item => [item.id]);
      expect([entry.name, [...svg.matchAll(/clip-path="url\(#(clip-\d+)\)"/gu)].map(match => match[1])])
        .toEqual([entry.name, [...svg.matchAll(/<clipPath id="(clip-\d+)"/gu)].map(match => match[1])]);
      expect(new Set([...svg.matchAll(/<clipPath id="(clip-\d+)"/gu)].map(match => match[1])).size).toBe(layout.scene.boxes.length);
    }
    expect(layoutTopology(hidden, runtimePlacement(hidden), 'process', false).unplaced).toEqual(['relation.b-router']);
    // A frame encloses its mounts, and the mounts stack in mount order.
    const frames = new Map(layoutTopology(mounted, runtimePlacement(mounted), 'namespace', true).scene.boxes.map(item => [item.id, item]));
    const inside = (inner: string, outer: string) => {
      const a = frames.get(inner)!, b = frames.get(outer)!;
      return a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
    };
    expect([inside('mount.config', HOST), inside('mount.cache', HOST), inside('namespace.remote', HOST), frames.get('mount.config')!.y < frames.get('mount.cache')!.y]).toEqual([true, true, false, true]);
  });

  test('the process topology on the recorded map: dagre routes with the corner repair pass the scene check, the file draws each route path, and the check finds each defect kind', () => {
    expect([routePath([[0, 0], [10, 0]]), routePath([[0, 0], [0, 10], [10, 10]])]).toEqual(['M0 0 L10 0', 'M0 0 L0 5 Q0 10 5 10 L10 10']);
    const recorded = decodeArchitectureMap(recordedMap);
    const scene = (repair: boolean) => layoutTopology(recorded, runtimePlacement(recorded), 'process', true, repair).scene;
    const repaired = scene(true);
    const canvas = { width: 1200, height: 760 };
    expect(sceneFindings(repaired, { canvas, viewport: firstViewport(contentBox(repaired.boxes), canvas) })).toEqual([]);
    // Without the repair, some dagre routes go through a third box.
    expect(sceneFindings(scene(false)).filter(finding => finding.kind === 'route-through-box').length).toBeGreaterThan(0);
    expect(repaired.routes.every(route => route.points.length >= 2)).toBe(true);
    // The CLI spawns the supervisor and calls its code: two routes between the same two boxes.
    const between = repaired.routes.filter(route => route.source === 'process.cli' && route.target === 'process.process-supervisor');
    expect([between.length, JSON.stringify(between[0]!.points) !== JSON.stringify(between[1]!.points)]).toEqual([2, true]);
    const svg = sceneSvg(repaired, box => [box.id]);
    expect([...svg.matchAll(/<path class="route[^"]*" stroke-width="[^"]*" d="([^"]*)"/gu)].map(match => match[1])).toEqual(repaired.routes.map(route => routePath(route.points)));

    // Overlapping siblings, a route through a third box, a route end off its border, a label on another route, and a first view below the first rank.
    const box = (id: string, x: number, y: number) => ({ id, parent: null, x, y, width: 100, height: 40, kind: 'box' });
    const route = (id: string, source: string, target: string, points: readonly (readonly [number, number])[]) => ({ id, source, target, points, arrows: { start: false, end: true }, kind: 'code', dashed: false, width: 1.5 });
    const broken = {
      boxes: [box('a', 0, 0), box('b', 50, 20), box('c', 0, 200), box('d', 0, 100)],
      routes: [route('a-c', 'a', 'c', [[50, 40], [50, 200]]), route('c-d', 'c', 'd', [[300, 300], [50, 140]])],
      labels: [{ text: 'http', x: 30, y: 150, width: 28, height: 16, route: 'c-d' }],
      extent: { width: 400, height: 400 },
    };
    expect(sceneFindings(broken, { canvas: { width: 400, height: 400 }, viewport: { x: 0, y: -300, zoom: 1 } })).toEqual([
      { kind: 'overlap', ids: ['a', 'b'] },
      { kind: 'route-through-box', ids: ['a-c', 'd'] },
      { kind: 'route-end', ids: ['c-d', 'c'] },
      { kind: 'label', ids: ['http', 'a-c'] },
      { kind: 'first-rank', ids: ['a', 'b'] },
    ]);
    // The check and the repair read the drawn curve: the straight segments clear the probe box, the curve through (12.5, 87.5) does not.
    const curve = route('curve', 'a', 'c', [[0, 0], [0, 100], [100, 100]]);
    const probe = { boxes: [box('a', -50, -40), box('c', 100, 80), { ...box('probe', 10, 85), width: 8, height: 8 }], routes: [curve], labels: [], extent: { width: 300, height: 300 } };
    expect(sceneFindings(probe)).toEqual([{ kind: 'route-through-box', ids: ['curve', 'probe'] }]);
    // The repair keeps the ends, repeats no point and clears every obstacle: the drawn curve here and a straight route between two boxes that one corner detour cannot clear.
    const repairs = [
      { name: 'curve', points: curve.points, ends: [box('a', -50, -40), box('c', 100, 80)], obstacles: [probe.boxes[2]!] },
      { name: 'two boxes', points: [[20, 110], [500, 110]] as const, ends: [{ ...box('a', 0, 100), width: 20, height: 20 }, { ...box('c', 500, 100), width: 20, height: 20 }],
        obstacles: [{ ...box('low', 62, 113), width: 35, height: 51 }, { ...box('high', 97, 30), width: 53, height: 106 }] },
    ];
    for (const entry of repairs) {
      const points = repairRoute(entry.points, entry.obstacles);
      const scene = { boxes: [...entry.ends, ...entry.obstacles], routes: [{ ...curve, points }], labels: [], extent: { width: 600, height: 300 } };
      expect([entry.name, sceneFindings(scene), points[0], points.at(-1), new Set(points.map(point => point.join())).size])
        .toEqual([entry.name, [], entry.points[0], entry.points.at(-1), points.length]);
    }
    // Three stacked mounts in one namespace: the route from the first to the third clears the middle one.
    const stacked = runtimeMap({
      nodes: [...runtimeMap().nodes, ...['a', 'b', 'c'].map((id, order) => ({ ...mapNode(`mount.${id}`, 'mount'), mount: { source: null, target: `mnt/${id}`, mode: 'rw', order } as const }))],
      relations: [...runtimeMap().relations, ...['a', 'b', 'c'].map(id => mapRelation(`relation.m-${id}`, 'mounts', HOST, `mount.${id}`)), mapRelation('relation.a-c', 'calls', 'mount.a', 'mount.c')],
    });
    const namespaces = (repair: boolean) => sceneFindings(layoutTopology(stacked, runtimePlacement(stacked), 'namespace', true, repair).scene);
    expect([namespaces(false), namespaces(true)]).toEqual([[{ kind: 'route-through-box', ids: ['topology:mount.a\nmount.c\ncalls', 'mount.b'] }], []]);
  });

  test('the first view centres content that fits and opens a wide map or an unsized canvas at 85% on its top-left corner; the topology opens on a segment with boxes', () => {
    const close = (view: { x: number; y: number; zoom: number }) => [view.x, view.y, view.zoom].map(value => Math.round(value * 1000) / 1000);
    expect(close(firstViewport({ x: 0, y: 0, width: 1000, height: 500 }, { width: 1200, height: 800 }))).toEqual([100, 102, 1]);
    expect(close(firstViewport({ x: 40, y: 16, width: 3000, height: 900 }, { width: 1200, height: 800 }))).toEqual([-10, 10.4, 0.85]);
    expect(close(firstViewport({ x: 24, y: 24, width: 800, height: 600 }, { width: 0, height: 0 }))).toEqual([3.6, 3.6, 0.85]);
    // The recorded map has one namespace and fourteen processes; two namespaces win; a map without runtime nodes keeps the namespace segment.
    const flat = runtimeMap({ nodes: runtimeMap().nodes.filter(node => !['process', 'namespace'].includes(node.kind)), relations: runtimeMap().relations.filter(relation => !['runs-in', 'deployed-on', 'spawns'].includes(relation.kind)) });
    expect([decodeArchitectureMap(recordedMap), runtimeMap({ nodes: [...runtimeMap().nodes, mapNode('namespace.remote', 'namespace')] }), flat].map(defaultTopologyBase))
      .toEqual(['process', 'namespace', 'namespace']);
  });

  test('the tabs follow the design order and the layer stays when the base map changes', async () => {
    await mount(workspace({ readMap: reader(runtimeMap()) }));
    // The module map tab counts capabilities and the sequence tab counts flows.
    expect([...document.querySelectorAll('.architecture-tabs [role="tab"]')].map(item => [item.firstChild?.textContent, item.querySelector('.architecture-tabs__count')?.textContent ?? null]))
      .toEqual([['Modules', '2'], ['Layers', null], ['Sequence', '2'], ['Topology', null], ['Module list', null], ['History', null]]);
    await chooseLayer('violations');
    await tab('sequence');
    expect(document.querySelector('#architecture-tab-sequence')?.getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('.architecture-layers [aria-pressed="true"]')?.getAttribute('data-layer')).toBe('violations');
    await tab('topology');
    expect(document.querySelector('.architecture-layers [aria-pressed="true"]')?.getAttribute('data-layer')).toBe('violations');
  });

  test('the layers map draws the declared layer order with own lines; the selected layer has lanes, size bars and its layer-direction violations; a missing order or check says why', async () => {
    // CALLER (cli) calls CENTER (core) over http; PART, inside CENTER, reads git; git calls CALLER, against the order. web holds no node; the server has no layer.
    type Direction = ArchitectureMapLayersInput['violations']['layer_direction'];
    const layered = (direction: Direction, order: ArchitectureLayerOrderV1 = { state: 'ok', layers: ['cli', 'web', 'core', 'external'] }) => projectArchitectureMap({
      repository_id: REPO, commit: COMMIT, head_ref: 'main', archctx_version: '0.11.2', collected_at: '2026-10-27T09:00:00.000Z', layer_order: order,
      nodes: [{ ...mapNode(CALLER, 'capability'), layer: 'cli' }, mapNode(CENTER, 'capability'), mapNode(PART, 'component', CENTER),
        { ...mapNode(EXTERNAL, 'external-system'), layer: 'external' }, { ...mapNode(SERVER, 'process'), layer: null }],
      relations: [mapRelation('relation.a-own', 'calls', CENTER, PART), { ...mapRelation('relation.b-router', 'calls', CALLER, CENTER), protocol: 'http' },
        mapRelation('relation.c-git', 'reads', PART, EXTERNAL), mapRelation('relation.d-up', 'calls', EXTERNAL, CALLER)],
      flows: [flow], flow_evidence: runtimeMap().flow_evidence,
      sizes: { state: 'ok', lines: new Map([['src/ledger.ts', 900], ['src/pipeline.ts', 50], ['src/router.ts', 100]]),
        owners: new Map([['src/ledger.ts', PART], ['src/pipeline.ts', CENTER], ['src/router.ts', CALLER]]) },
      dependencies: { state: 'ok', matrix: [] },
      layers: { ...layers, violations: { ...layers.violations, layer_direction: direction } },
    });
    const checked: Direction = { state: 'ok', imports: 40, edges: [
      { source: CENTER, target: CALLER, source_layer: 'core', target_layer: 'cli', imports: 2 }, { source: PART, target: CALLER, source_layer: 'core', target_layer: 'cli', imports: 1 }] };
    const map = layered(checked);
    const layout = layoutLayers(map, ['cli', 'web', 'core', 'external']);
    // CENTER's 950 lines include PART's 900, so core owns 50 + 900 and lists PART first.
    expect(layout.bands.map(band => [band.layer, band.index, band.members.map(member => member.node.id), band.files, band.lines])).toEqual([
      ['cli', 0, [CALLER], 1, 100], ['web', 1, [], 0, 0], ['core', 2, [PART, CENTER], 2, 950], ['external', 3, [EXTERNAL], 0, 0]]);
    for (const [index, band] of layout.bands.slice(1).entries()) expect(layout.bands[index]!.y + layout.bands[index]!.height < band.y).toBe(true);
    // Out of core: the dashed git read in the right gutter; into core: the http call in the left one. The relation inside core has no lane.
    const lanes = layout.lanes('core');
    expect([layout.lanes(null), lanes.map(lane => [lane.source, lane.target, lane.dashed, lane.side, lane.protocols, lane.relations])]).toEqual([[], [
      ['core', 'external', true, 'right', [], ['relation.c-git']], ['cli', 'core', false, 'left', ['http'], ['relation.b-router']]]]);
    const bands = new Map(layout.bands.map(band => [band.layer, band]));
    const within = (layer: string, y: number) => y > bands.get(layer)!.y && y < bands.get(layer)!.y + bands.get(layer)!.height;
    const { x: left, width } = layout.bands[0]!;
    expect(lanes.filter(({ source, target, side, route: { points } }) => !within(source, points[0]![1]) || !within(target, points[3]![1])
      || (side === 'right' ? points[1]![0] <= left + width : points[1]![0] >= left))).toEqual([]);
    // The recorded map of this repository: every declared layer is a band, and the bands' own lines add up to the top-level nodes' totals.
    const recorded = decodeArchitectureMap(recordedMap);
    const order = recorded.layer_order.state === 'ok' ? recorded.layer_order.layers : [];
    const real = layoutLayers(recorded, order);
    const tops = new Set(recorded.nodes.filter(node => node.parent === null).map(node => node.id));
    const totals = recorded.sizes.state === 'ok' ? recorded.sizes.nodes.filter(entry => tops.has(entry.id)).reduce((sum, entry) => sum + entry.lines, 0) : null;
    expect([real.bands.map(band => band.layer), real.lanes('effects').length]).toEqual([[...order], 19]);
    expect(real.bands.reduce((sum, band) => sum + band.lines!, 0)).toBe(totals!);
    // The lane points of all 96 lanes, hashed from the lane layout on main 6b7e7af67 before the scene: the routes keep them.
    const points = order.map(layer => real.scene(layer).routes.map(route => route.points));
    expect([points.flat().length, createHash('sha256').update(JSON.stringify(points)).digest('hex')]).toEqual([96, '31381ae6fa137a76de6902bdccc585a0f6e6422eb6b3cb053d9b062206a7ab5f']);
    // With each row selected, the scene check finds nothing, and the file draws one path for each lane with the route's path.
    expect(order.flatMap(layer => sceneFindings(real.scene(layer)))).toEqual([]);
    const effects = real.scene('effects');
    expect([...sceneSvg(effects, () => []).matchAll(/<path class="route[^"]*" stroke-width="[^"]*" d="([^"]*)"/gu)].map(match => match[1])).toEqual(effects.routes.map(route => routePath(route.points)));

    const files: { name: string; blob: Blob }[] = [];
    const { createObjectURL, revokeObjectURL } = URL;
    const blobs = new Map<string, Blob>();
    URL.createObjectURL = (blob: Blob) => { const url = `blob:test/${blobs.size}`; blobs.set(url, blob); return url; };
    URL.revokeObjectURL = () => {};
    const anchor = window.HTMLAnchorElement.prototype;
    const { click: anchorClick } = anchor;
    anchor.click = function (this: HTMLAnchorElement) { files.push({ name: this.download, blob: blobs.get(this.href)! }); };
    try {
      await mount(workspace({ readMap: reader(map) }));
      await tab('layers');
      // The provenance line and the export replace the lens chips; no layer is selected, so no lane is drawn.
      expect([document.querySelector('[data-layers-provenance]')?.textContent, document.querySelector('.architecture-layers'), document.querySelector('.architecture-map')?.getAttribute('data-lane-count')])
        .toEqual(['Layer order and layer-direction rules from archctx 0.11.2', null, '0']);
      expect([...document.querySelectorAll('.architecture-layermap__band')].map(item => item.textContent)).toEqual(['L0 cli', 'L1 web', 'L2 core', 'L3 external']);
      expect([document.querySelector('.react-flow__node[data-id="core"] .architecture-layermap__lines')?.textContent, notes()]).toEqual(['950', ['layers.unlayered:node_layer_undeclared']]);
      await click('.react-flow__node[data-id="core"]');
      expect([inspector().getAttribute('data-layer-id'), document.querySelector('.architecture-map')?.getAttribute('data-lane-count'), inspector().querySelector('[data-layer-size]')?.textContent])
        .toEqual(['core', '2', '950 lines in 2 files']);
      // Size bars by own lines; the two violating node pairs sum into one layer pair.
      expect([...inspector().querySelectorAll('[data-size-row]')].map(item => item.getAttribute('data-size-row'))).toEqual([PART, CENTER]);
      expect([...inspector().querySelectorAll('[data-pair]')].map(item => item.textContent)).toEqual(['core → cli3Violation']);
      expect(inspector().querySelector('[data-layer-checked]')?.textContent).toBe('archctx checked 40 imports against the layer order.');
      // The inspector lists each lane with its direction and protocol; the route names the protocol too, and the canvas draws no label.
      expect([...inspector().querySelectorAll('[data-lane]')].map(item => `${item.getAttribute('data-direction')}:${item.textContent}`)).toEqual(['out: out external', 'in: in cli · http']);
      expect([...document.querySelectorAll('.react-flow__edge')].map(item => item.getAttribute('aria-label'))).toEqual(['core → external', 'cli → core · http']);
      await click('[data-layers-export]');
      const svg = await files[0]!.blob.text();
      expect([files.map(file => file.name), files[0]!.blob.type, svg.includes('<rect class="box selected"'), svg.includes('>L2 core</text>'), svg.includes('>http<')])
        .toEqual([['layers-ccccccc.svg'], 'image/svg+xml', true, true, false]);
      expect([...svg.matchAll(/<path class="route[^"]*" stroke-width="[^"]*" d="([^"]*)"/gu)].map(match => match[1])).toEqual(layout.scene('core').routes.map(route => routePath(route.points)));

      // A model without the layer-direction constraint keeps the map and says why the check is missing; a model without ordered layers has no map.
      await act(async () => root?.render(workspace({ readMap: reader(layered({ state: 'unavailable', reason: 'layer_direction_undeclared' })) })));
      await settle();
      await click('.react-flow__node[data-id="core"]');
      expect(inspector().querySelector('[data-gap="layer_direction"]')?.getAttribute('data-reason')).toBe('layer_direction_undeclared');
      const undeclared = { state: 'unavailable', reason: 'model_layers_undeclared' } as const;
      await act(async () => root?.render(workspace({ readMap: reader(layered(undeclared, undeclared)) })));
      await settle();
      expect([document.querySelector('.react-flow'), document.querySelector('[data-gap="layer_order"]')?.getAttribute('data-reason')]).toEqual([null, 'model_layers_undeclared']);
    } finally {
      Object.assign(URL, { createObjectURL, revokeObjectURL });
      anchor.click = anchorClick;
    }
  });

  test('2-ARCH-P2 on the module map: a capability shows its domain, size, violations with their source, PR impact with the flow step, and the command that lists them', async () => {
    await mount(workspace({ readMap: reader(runtimeMap()) }));
    await click(`.react-flow__node[data-id="${CENTER}"]`);
    expect(inspector().getAttribute('data-node-id')).toBe(CENTER);
    expect([inspector().querySelector('[data-module-domain]')?.textContent, inspector().querySelector('[data-node-size]')?.textContent]).toEqual(['workflow-engine', '900 lines in 1 files']);
    expect([...inspector().querySelectorAll('[data-relation-id]')].map(item => item.textContent)).toContain(`in Name ${CALLER} · calls · 7 imports`);
    expect([...inspector().querySelectorAll('[data-layer-facts="violations"] > li')].map(item => item.textContent)).toEqual([
      'Flow proof cannot be proven (2 diagnostics)flows check',
      // The flow's steps joined to archctx's proof by selector: route is proven and the outcome steps have no proof, so only append is listed.
      'Flow "Append a ledger row", step 2 (Step append): archctx reports no-direct-call.flows check',
      `Imports Name ${CALLER} with no declared relation (3 imports)deps`]);
    expect([...inspector().querySelectorAll('[data-fix-command]')].map(item => item.textContent)).toEqual([architectureViolationCommand('flows'), architectureViolationCommand('dependencies')]);
    expect(architectureViolationCommand('flows')).toBe('archctx flows check --no-sync --json');
    // The PR changes the capability's component, and its flow step ends there: the third step, the first of an outcome.
    expect([...inspector().querySelectorAll('[data-module-impact="21"] > li')].map(item => item.textContent))
      .toEqual(['Changes 1 file here.', 'Reaches step 3 of the flow "Append a ledger row".']);
  });

  test('a node lists each stale doc citation with its origin and location; the violations count and summary count the findings', async () => {
    const anchors = { state: 'ok', citations: 3, nodes: [{ id: CALLER, findings: [
      { kind: 'line-moved', origin: 'document', path: 'docs/architecture/modules/public-surface/root-router.md', line: 12, citation: 'src/router.ts:40' },
      { kind: 'missing-symbol', origin: 'node-summary', path: null, line: null, citation: 'route' },
    ] }] } as const;
    await mount(workspace({ readMap: reader(runtimeMap({ layers: { ...layers, violations: { ...layers.violations, anchors } } })) }));
    await chooseLayer('violations');
    expect(document.querySelector('[data-layer-summary="violations"]')?.textContent).toContain('Doc citations: 2 of 3 out of date.');
    await click(`.react-flow__node[data-id="${CALLER}"]`);
    expect([...inspector().querySelectorAll('[data-layer-facts="violations"] > li')].map(item => item.textContent)).toEqual([
      'Out-of-date citation in the doc: src/router.ts:40 (line-moved)docs/architecture/modules/public-surface/root-router.md:12docs anchors',
      'Out-of-date citation in the node summary: route (missing-symbol)docs anchors',
    ]);
  });

  test('2-ARCH-P2 on the sequence map: a message shows its declared code, archctx proof, related PR, dependency edges and the proof command; unknown parts say why', async () => {
    await mount(workspace({ readMap: reader(runtimeMap()) }));
    await tab('sequence');
    expect(document.querySelector('[data-view="sequence"]')?.getAttribute('data-flow')).toBe(FLOW);
    expect(document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform).toContain('scale(0.85)');
    expect([...document.querySelectorAll('.architecture-sequence__box')].map(item => [item.getAttribute('data-placement'), item.textContent])).toEqual([
      ['unknown', 'Process unknown'], ['process', `Name ${SERVER}`], ['external', 'External systems']]);
    expect(document.querySelector('.architecture-sequence__box[data-placement="unknown"]')?.getAttribute('data-reason')).toBe(t('architecture.runtime.deployment_undeclared'));
    // The first outcome opens the alt and the next one is an else, in model order; the colour follows the outcome kind.
    expect([...document.querySelectorAll('.architecture-sequence__fragment')].map(item => [item.getAttribute('data-kind'), item.querySelector('.mono-value')?.textContent]))
      .toEqual([['success', 'alt'], ['error', 'else']]);
    expect([...document.querySelectorAll('.architecture-sequence__terminal')].map(item => [item.getAttribute('data-kind'), item.textContent])).toEqual([['success', 'Done'], ['error', 'Stop']]);
    // Each message is a route with its whole label; today's changes reach the append step.
    const message = (id: string) => document.querySelector(`.react-flow__edge[data-id="message:${id}"]`)!;
    expect([...document.querySelectorAll('.react-flow__edge')].map(item => [item.getAttribute('data-id'), item.getAttribute('aria-label')]))
      .toEqual(flowSteps(flow).map(({ outcome, step }) => [`message:${outcome ?? ''}:${step.id}`, step.label]));
    expect([message(':append').classList.contains('architecture-map__edge--message-change'), message(':route').classList.contains('architecture-map__edge--message')]).toEqual([true, true]);

    await click('.react-flow__edge[data-id="message::route"]');
    expect(message(':route').classList.contains('selected')).toBe(true);
    expect(inspector().getAttribute('data-step-id')).toBe(':route');
    expect(inspector().querySelector('[data-step-title]')?.textContent).toBe(`Name ${CALLER} → Name ${CENTER}`);
    expect(inspector().querySelector('[data-step-evidence]')?.textContent).toBe('src/router.ts route→ src/pipeline.ts route');
    expect(inspector().querySelector('[data-step-proof]')?.getAttribute('data-step-proof')).toBe('proven');
    expect([...inspector().querySelectorAll('[data-call-sites] li')].map(item => item.textContent)).toEqual(['src/router.ts:12', 'src/router-entry.ts']);
    expect([...inspector().querySelectorAll('[data-node-size]')].map(item => item.textContent)).toEqual([' · 100 lines in 1 files', ' · 900 lines in 1 files']);
    expect([...inspector().querySelectorAll('[data-relation-id]')].map(item => item.textContent)).toEqual([`calls Name ${CALLER} → Name ${CENTER} · 7 imports`]);
    expect(inspector().querySelectorAll('[data-fix-command]')).toHaveLength(0);

    await click('.react-flow__edge[data-id="message::append"]');
    expect(inspector().querySelector('[data-path-withheld]')?.textContent).toBe('path withheld (it fails the public-path check)');
    expect(inspector().querySelector('[data-step-proof]')?.textContent).toBe('Not proven: archctx reports no-direct-call.');
    expect(inspector().querySelector('[data-call-sites]')).toBeNull();
    expect(inspector().querySelector('[data-step-today]')).not.toBeNull();
    expect(inspector().querySelector('[data-fix-command="flows"]')?.textContent).toBe('archctx flows check --no-sync --json');

    await click('.react-flow__edge[data-id="message:kept:commit"]');
    expect(inspector().querySelector('[data-gap="evidence"]')?.getAttribute('data-reason')).toBe('selector_undeclared');
    expect(inspector().querySelector('[data-step-proof]')?.getAttribute('data-step-proof')).toBe('missing');
    expect(inspector().querySelector('[data-related-prs]')?.textContent).toBe('#21 Ledger rows');

    await click('.react-flow__node[data-id="participant:router"]');
    expect([inspector().getAttribute('data-node-id'), inspector().querySelector('[data-runtime]')?.textContent]).toEqual([CALLER, `Runs in: ${t('architecture.runtime.deployment_undeclared')}`]);
    // A header click after a message click selects the header: the message's deselect does not clear it. The header lights its messages.
    expect([message('kept:commit').classList.contains('selected'), message(':route').classList.contains('is-active'), message(':append').classList.contains('is-dim')]).toEqual([false, true, true]);
    await click('.react-flow__edge[data-id="message::route"]');
    expect([inspector().getAttribute('data-step-id'), inspector().hasAttribute('data-node-id')]).toEqual([':route', false]);
    await click('.react-flow__node[data-id="participant:ledger"]');
    expect(inspector().querySelector('[data-runtime]')?.textContent).toBe(`Runs in: Name ${SERVER}`);
    // The side panel lists the flows in model order; today's changes reach a step of the first one.
    const flows = () => [...document.querySelectorAll('.architecture-sequence__flow-list button')].map(item => [item.textContent, item.getAttribute('aria-pressed'), item.hasAttribute('data-lit')]);
    expect(flows()).toEqual([['1Append a ledger row', 'true', true], ['2No router flow', 'false', false]]);
    // A not-applicable flow states its rationale instead of a diagram, and has nothing to export.
    await click('[data-flow-id="flow.router.none"]');
    expect([notes(), flows()[1]![1], document.querySelector<HTMLButtonElement>('[data-sequence-export]')?.disabled])
      .toEqual([expect.arrayContaining(['sequence.not_applicable:flow_not_applicable']), 'true', true]);

    // The flow list stays one mounted control across each kind of flow change, so focus and its scroll position stay;
    // a selection belongs to its flow and does not come back on a return.
    const second = { ...flow, id: 'flow.pipeline.second', name: 'Second ledger flow' };
    await act(async () => root?.render(workspace({ repositoryId: 'repo-three-flows', readMap: reader(runtimeMap({ flows: [flow, second, runtimeMap().flows[1]!],
      // Custom flows declare no code, so the map carries no proof either.
      layers: { ...layers, violations: { ...layers.violations, flows: noCodeFacts } } })) })));
    await settle();
    await tab('sequence');
    await click(`[data-flow-id="${FLOW}"]`);
    await click('.react-flow__edge[data-id="message::route"]');
    const list = document.querySelector<HTMLElement>('.architecture-sequence__flow-list')!;
    for (const [target, view] of [[second.id, 'diagram'], ['flow.router.none', 'note'], [FLOW, 'diagram']] as const) {
      const button = list.querySelector<HTMLButtonElement>(`[data-flow-id="${target}"]`)!;
      list.scrollTop = 40;
      button.focus();
      await click(`[data-flow-id="${target}"]`);
      expect([document.querySelector('[data-view="sequence"]')?.getAttribute('data-flow'), document.querySelector('.architecture-map__canvas') === null ? 'note' : 'diagram',
        list.isConnected, list.scrollTop, button.isConnected, document.activeElement === button, button.getAttribute('aria-pressed'), inspector().hasAttribute('data-step-id')])
        .toEqual([target, view, true, 40, true, true, 'true', false]);
    }
  });

  test('the lens row counts the steps that have code evidence and exports the flow on screen as one SVG file', async () => {
    const files: { name: string; blob: Blob }[] = [];
    const { createObjectURL, revokeObjectURL } = URL;
    const blobs = new Map<string, Blob>();
    URL.createObjectURL = (blob: Blob) => { const url = `blob:test/${blobs.size}`; blobs.set(url, blob); return url; };
    URL.revokeObjectURL = () => {};
    const anchor = window.HTMLAnchorElement.prototype;
    const { click: anchorClick } = anchor;
    anchor.click = function (this: HTMLAnchorElement) { files.push({ name: this.download, blob: blobs.get(this.href)! }); };
    try {
      await mount(workspace({ readMap: reader(runtimeMap()) }));
      await tab('sequence');
      // Declared code names the route and append selectors; the outcome steps have none.
      expect(document.querySelector('[data-sequence-summary]')?.textContent).toBe('2 flows from the model; 2 of 4 steps have code evidence');
      await click('[data-sequence-export]');
      const svg = await files[0]!.blob.text();
      // The file draws the scene on screen: one path for each message with the path of its route on the canvas, each whole label, the bands, terminals and boxes.
      const drawn = [...document.querySelectorAll('.react-flow__edge-route .react-flow__edge-path')].map(path => path.getAttribute('d')!);
      expect([files.map(file => file.name), files[0]!.blob.type, drawn.length, [...svg.matchAll(/<path class="route" stroke-width="1.5" d="([^"]*)"/gu)].map(match => match[1])])
        .toEqual([[`${FLOW}.svg`], 'image/svg+xml', 4, drawn]);
      expect([...flowSteps(flow).map(({ step }) => `>${step.label}</text>`), `>Name ${CALLER}</text>`, '>alt Row kept</text>', '>else Row refused</text>', '>Done</text>', '>Stop</text>',
        '>Process unknown</text>', '<rect class="lifeline"', '<rect class="fragment success"', '<rect class="terminal error"', '.lifeline{', '.fragment.error{'].filter(text => !svg.includes(text))).toEqual([]);
    } finally {
      Object.assign(URL, { createObjectURL, revokeObjectURL });
      anchor.click = anchorClick;
    }
  });

  test('each layer on the sequence map marks steps or participants from the collector, or says what it cannot mark', async () => {
    await mount(workspace({ readMap: reader(runtimeMap()) }));
    await tab('sequence');
    const message = (id: string) => document.querySelector(`.react-flow__edge[data-id="message:${id}"]`)!;
    const tone = (id: string) => ['change', 'danger'].find(kind => message(id).classList.contains(`architecture-map__edge--message-${kind}`)) ?? null;
    const header = (id: string) => document.querySelector(`.react-flow__node[data-id="participant:${id}"] .architecture-sequence__header`)!;
    expect([header('ledger').getAttribute('data-tone'), header('pipe').getAttribute('data-tone'), header('router').hasAttribute('data-quiet')]).toEqual(['change', 'muted', true]);
    await chooseLayer('violations');
    // An unproven step names archctx's status in its label.
    expect([tone(':append'), message(':append').querySelector('.react-flow__edge-text')?.textContent, tone(':route')])
      .toEqual(['danger', `${flow.steps[1]!.label} · no-direct-call`, null]);
    // The layer summary keeps its own note; the sequence map adds why it draws no import edge.
    expect(notes()).toEqual(['violations.layer_direction:model_layers_undeclared', 'sequence.violations:imports_on_module_map']);
    await chooseLayer('pull_requests');
    expect([tone('kept:commit'), tone(':append')]).toEqual(['change', null]);
    await chooseLayer('tests');
    expect([notes(), header('pipe').getAttribute('data-tone'), header('router').getAttribute('data-tone')]).toEqual([['sequence.tests:tests_by_capability'], 'danger', 'success']);
    await chooseLayer('decisions');
    expect([notes(), header('pipe').getAttribute('data-tone')]).toEqual([['sequence.decisions:decisions_by_node'], 'muted']);

    // Without a flows check answer each step proof is unknown with archctx's reason, and the read command stays.
    await act(async () => root?.render(workspace({ repositoryId: 'repo-proofless', readMap: reader(runtimeMap({ layers: { ...layers, violations: { ...layers.violations, flows: noCodeFacts } } })) })));
    await settle();
    await tab('sequence');
    await click('.react-flow__edge[data-id="message::route"]');
    expect(inspector().querySelector('[data-gap="proof"]')?.getAttribute('data-reason')).toBe('code_facts_unavailable');
    expect(inspector().querySelector('[data-fix-command="flows"]')).not.toBeNull();
    // A model without flows has no sequence map, and says so.
    await act(async () => root?.render(workspace({ repositoryId: 'repo-flowless', readMap: reader(runtimeMap({ flows: [], layers: { ...layers, changes: { ...layers.changes, flow_steps: { status: 'unknown', reason_codes: ['ref-code-facts-unavailable'], items: null } } as ArchitectureMapLayersInput['changes'],
      pull_requests: { state: 'unavailable', reason: 'dev_activity_pending' }, violations: { ...layers.violations, flows: noCodeFacts } } })) })));
    await settle();
    await tab('sequence');
    expect(notes()).toEqual(['sequence.flows:flows_undeclared']);
  });

  test('2-ARCH-P2 on the topology map: a deployed node shows its size, edges, violations and command; layers light boxes and unplaced parts say why', async () => {
    await mount(workspace({ readMap: reader(runtimeMap()) }));
    await tab('topology');
    const box = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"] > div`)!;
    // The model has two processes and one namespace, so the artboard opens on the process segment.
    expect(document.querySelector('[data-topology-base][aria-pressed="true"]')?.getAttribute('data-topology-base')).toBe('process');
    const canvas = () => document.querySelector('[data-view="topology"]')!;
    expect([canvas().getAttribute('data-base'), canvas().getAttribute('data-node-count'), canvas().getAttribute('data-edge-count')]).toEqual(['process', '3', '2']);
    expect(document.querySelector(`.react-flow__node[data-id="${SERVER}/${CENTER}"]`)?.classList.contains('react-flow__node-member')).toBe(true);
    expect(document.querySelector(`.react-flow__node[data-id="${EXTERNAL}"] .architecture-topology__box`)?.getAttribute('data-kind')).toBe('external-system');
    expect(notes()).toEqual(['topology.unplaced:deployment_undeclared']);
    // The canvas draws each route from its scene points, not between the node handles.
    const routes = layoutTopology(runtimeMap(), runtimePlacement(runtimeMap()), 'process', true).scene.routes;
    expect([...document.querySelectorAll('.react-flow__edge-route .react-flow__edge-path')].map(path => path.getAttribute('d'))).toEqual(routes.map(route => routePath(route.points)));
    // The first view comes from the bounding box of every box and the canvas size that React Flow reports.
    // happy-dom lays out no element, so React Flow reports its fallback size, 500 × 500.
    const view = firstViewport(contentBox(layoutTopology(runtimeMap(), runtimePlacement(runtimeMap()), 'process', true).scene.boxes), { width: 500, height: 500 });
    expect(document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform).toBe(`translate(${view.x}px,${view.y}px) scale(${view.zoom})`);
    // The host frame holds no mount and is lit through the server that runs in it; no node is deprecated.
    await segment('namespace');
    expect([box(HOST).querySelector('[data-namespace-empty]')?.textContent, box(HOST).hasAttribute('data-quiet')]).toEqual(['No mount', false]);
    const legacy = document.querySelector<HTMLButtonElement>('[data-topology-legacy]')!;
    expect([legacy.disabled, legacy.getAttribute('aria-pressed'), legacy.textContent]).toEqual([true, 'true', 'Legacy stores0']);
    await segment('process');
    expect(document.querySelector('[data-note="topology.unplaced"]')?.textContent).toContain(`calls Name ${CALLER} → Name ${CENTER}`);
    // Today the ledger changed: its capability and the process it runs in are lit; the CLI is not.
    expect([box(`${SERVER}/${CENTER}`).getAttribute('data-tone'), box(SERVER).hasAttribute('data-quiet'), box(CLI).hasAttribute('data-quiet')]).toEqual(['muted', false, true]);

    await click(`.react-flow__node[data-id="${SERVER}/${CENTER}"]`);
    expect(inspector().getAttribute('data-node-id')).toBe(CENTER);
    expect(inspector().querySelector('[data-node-size]')?.textContent).toBe('900 lines in 1 files');
    expect(inspector().querySelector('[data-runtime]')?.textContent).toBe(`Runs in: Name ${SERVER}`);
    expect(inspector().querySelector('[data-layer-facts="violations"]')?.textContent).toContain('Flow proof cannot be proven (2 diagnostics)');
    expect([...inspector().querySelectorAll('[data-fix-command]')].map(item => item.getAttribute('data-fix-command'))).toEqual(['flows', 'dependencies']);
    await click(`.react-flow__node[data-id="${SERVER}"]`);
    expect([inspector().querySelector('[data-runs-in]')?.textContent, inspector().querySelector('[data-deployed]')?.textContent]).toEqual([`In: Name ${HOST}`, `Name ${CENTER} · 900 lines in 1 files`]);
    // The selection stays across every view tab and goes with a segment change, so going back does not bring it back.
    for (const other of ['sequence', 'modules', 'history']) {
      await tab(other);
      await tab('topology');
      expect([other, inspector().getAttribute('data-node-id')]).toEqual([other, SERVER]);
    }
    // Another repository and back while Sequence shows: the selection goes, whatever tab shows when the repository changes.
    await tab('sequence');
    for (const repositoryId of ['repo-other', REPO]) {
      await act(async () => root?.render(workspace({ repositoryId, readMap: reader(runtimeMap()) })));
      await settle();
    }
    await tab('topology');
    expect(inspector().getAttribute('data-node-id')).toBeNull();
    await click(`.react-flow__node[data-id="${SERVER}"]`);
    await segment('namespace');
    await segment('process');
    expect(inspector().getAttribute('data-node-id')).toBeNull();
    await click(`.react-flow__node[data-id="${SERVER}"]`);

    await chooseLayer('tests');
    expect(notes()).toEqual(['topology.unplaced_marks:deployment_undeclared', 'topology.unplaced:deployment_undeclared']);
    await chooseLayer('violations');
    expect(notes()).toContain('topology.violations:imports_on_module_map');
    // The model declares no mount, so the mount segment is its empty state.
    await segment('mount');
    expect(notes()).toContain('topology.mounts:mount_undeclared');
    // A model without processes, namespaces or mounts has no topology map.
    await act(async () => root?.render(workspace({ repositoryId: 'repo-flat', readMap: reader(runtimeMap({ nodes: [mapNode(CENTER, 'capability'), mapNode(PART, 'component', CENTER), mapNode(CALLER, 'capability'), mapNode(EXTERNAL, 'external-system')],
      relations: [mapRelation('relation.a-own', 'calls', CENTER, PART), mapRelation('relation.b-router', 'calls', CALLER, CENTER), mapRelation('relation.c-git', 'reads', PART, EXTERNAL)] })) })));
    await settle();
    await tab('topology');
    expect(notes()).toContain('topology.empty:topology_undeclared');
  });

  test('a namespace frame holds its mounts with tone, fields and writers; the legacy switch hides a deprecated mount; a node deployed on two processes is one canvas node per process with one inspector', async () => {
    const map = runtimeMap({ nodes: [...runtimeMap().nodes, mapNode('mount.cache', 'mount'), { ...mapNode('mount.old', 'mount'), status: 'deprecated' }],
      relations: [...runtimeMap().relations, mapRelation('relation.h-deploy', 'deployed-on', CENTER, CLI), mapRelation('relation.i-mount', 'mounts', HOST, 'mount.cache'),
        mapRelation('relation.j-mount', 'mounts', HOST, 'mount.old'), mapRelation('relation.k-write', 'writes', PART, 'mount.cache')] });
    await mount(workspace({ readMap: reader(map) }));
    await tab('topology');
    // A namespace box carries the source and target handles that React Flow attaches a route to.
    expect([...document.querySelectorAll(`.react-flow__node[data-id="${HOST}"] .react-flow__handle`)].map(item => item.classList.contains('source') ? 'source' : 'target').sort()).toEqual(['source', 'target']);
    expect(['mount.cache', 'mount.old'].map(id => document.querySelector(`.react-flow__node[data-id="${id}"] [data-mount-tone]`)?.getAttribute('data-mount-tone'))).toEqual(['writer', 'point']);
    await click('.react-flow__node[data-id="mount.cache"]');
    expect([inspector().querySelector('[data-mount-fields]')?.textContent, inspector().querySelector('[data-writers]')?.textContent])
      .toEqual([`Order0Source → targetmasked → maskedModeroMounted byName ${HOST}`, `Name ${PART}`]);
    const legacy = () => document.querySelector<HTMLButtonElement>('[data-topology-legacy]')!;
    expect([legacy().disabled, legacy().textContent]).toEqual([false, 'Legacy stores1']);
    await click('[data-topology-legacy]');
    expect([legacy().getAttribute('aria-pressed'), document.querySelector('.react-flow__node[data-id="mount.old"]'), document.querySelector('.react-flow__node[data-id="mount.cache"]') !== null]).toEqual(['false', null, true]);

    await segment('process');
    const members = [...document.querySelectorAll('.react-flow__node-member')].map(item => item.getAttribute('data-id'));
    expect(members.sort()).toEqual([`${CLI}/${CENTER}`, `${SERVER}/${CENTER}`]);
    for (const process of [SERVER, CLI]) {
      await click(`.react-flow__node[data-id="${process}/${CENTER}"]`);
      expect([inspector().getAttribute('data-node-id'), document.querySelectorAll('.architecture-topology__member[data-selected]').length]).toEqual([CENTER, 2]);
      expect(inspector().querySelector('[data-runtime]')).toBeNull();
    }
  });
});

describe('architecture history', () => {
  const page = (name: keyof typeof historyPages) => historyPages[name] as unknown as HistoryPage;
  const milestone = (history: HistoryPage, prefix: string) => history.milestones.find(item => item.rev.startsWith(prefix)) as ValidMilestone;

  test('#820 draws its two removed capabilities from the base milestone; #1125 marks only the capabilities that own its new components', () => {
    const removal = page('removal');
    const pr820 = historyShape(removal.milestones, milestone(removal, 'd02a082f'));
    expect([...pr820.nodes].filter(([, diff]) => diff !== 'inside')).toEqual([
      ['capability.runtime-harness.delegated-runs', 'removed'], ['capability.runtime-harness.pm-dispatch', 'removed'],
    ]);
    expect(pr820.input.nodes.filter(node => pr820.nodes.get(node.id) === 'removed').map(node => node.parent)).toEqual(['domain:runtime-harness', 'domain:runtime-harness']);
    expect([...pr820.edges.values()].filter(diff => diff === 'removed')).toHaveLength(17);

    const inside = page('inside');
    const pr1125 = milestone(inside, '98199c44');
    const shape = historyShape(inside.milestones, pr1125);
    expect(new Set(shape.nodes.values())).toEqual(new Set(['inside']));
    expect(shape.nodes.size).toBe(new Set(pr1125.delta.added.map(item => item.capability)).size);
    expect(shape.edges.size).toBe(0);
  });

  test('each recorded milestone is one placed scene with no finding; routes run between top-level owners, one per owner pair and change', () => {
    for (const name of Object.keys(historyPages) as (keyof typeof historyPages)[]) {
      const history = page(name);
      for (const item of history.milestones) {
        if (item.error) continue;
        const shape = historyShape(history.milestones, item);
        const input = historyLayoutInput(shape, shape.edges);
        const { scene, relations } = layoutArchitectureMap(input);
        expect([item.rev, sceneFindings(scene)]).toEqual([item.rev, []]);
        expect(scene.boxes.map(box => box.id).sort()).toEqual(input.nodes.map(node => node.id).sort());
        const parents = new Map(input.nodes.map(node => [node.id, node.parent]));
        const owner = (id: string): string => parents.get(id) ?? id;
        const top = new Set(scene.boxes.filter(box => box.parent === null).map(box => box.id));
        expect(scene.routes.every(route => top.has(route.source) && top.has(route.target) && route.source !== route.target)).toBe(true);
        // Every relation between two owners is behind exactly the route of its owner pair and change; a relation inside one owner has none.
        const expected = input.relations.filter(relation => owner(relation.source) !== owner(relation.target))
          .map(relation => `${relation.kind}:${owner(relation.source)}->${owner(relation.target)} ${relation.id}`).sort();
        expect([...relations].flatMap(([id, ids]) => ids.map(relation => `${id} ${relation}`)).sort()).toEqual(expected);
        expect(scene.routes.map(route => [route.kind, route.dashed])).toEqual([...relations.keys()].map(id => [id.split(':')[0], id.startsWith('removed:')]));
      }
    }
  });

  test('the newest page shows first, an error milestone shows only its code, the base across it is named, and an older page pins the first head', async () => {
    // archctx pages run oldest first: a one-milestone read gives the head and the total (50), then the newest page.
    const gap = page('gap');
    const removal = page('removal');
    const paths: string[] = [];
    const sources: (ArchitectureSource | null)[] = [];
    respond = path => {
      paths.push(path);
      return json(new URL(path, 'http://127.0.0.1').searchParams.get('offset') === '0' && paths.length > 2 ? removal : gap, 200, '"history-1"');
    };
    await mount(workspace({ onSource: source => sources.push(source) }));
    await act(async () => document.querySelector<HTMLButtonElement>('#architecture-tab-history')!.click());
    await settle();
    expect(paths).toEqual([
      `/api/v1/repositories/${REPO}/architecture/history?offset=0&limit=1`,
      `/api/v1/repositories/${REPO}/architecture/history?offset=25&limit=25&ref=${gap.head}`,
    ]);
    expect([...document.querySelectorAll('li[data-milestone-rev]')].map(item => [item.getAttribute('data-milestone-rev'), item.getAttribute('aria-selected')]))
      .toEqual([...gap.milestones].reverse().map((item, index) => [item.rev, String(index === 0)]));
    expect(sources.at(-1)).toEqual({ head: gap.head, read: 3, total: 50 });
    expect(document.querySelector('#architecture-tab-history .architecture-tabs__count')?.textContent).toBe('50');
    const pick = async (prefix: string) => {
      await act(async () => document.querySelector<HTMLElement>(`li[data-milestone-rev^="${prefix}"]`)!.click());
      await settle();
    };
    // The workspace store keeps a History selection of the shown milestone across a tab change; another milestone drops it.
    const inspected = () => document.querySelector('.architecture-history__inspector')?.getAttribute('data-node-id');
    const opened = inspected();
    const other = [...document.querySelectorAll('.architecture-history__node')].map(item => item.getAttribute('data-node-id')!).find(id => id !== opened)!;
    await act(async () => document.querySelector(`.react-flow__node[data-id="${other}"]`)!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
    for (const tab of ['#architecture-tab-modules', '#architecture-tab-history']) {
      await act(async () => document.querySelector<HTMLButtonElement>(tab)!.click());
      await settle();
    }
    expect(inspected()).toBe(other);
    await pick('06a42cf1');
    await pick('c17d3b51');
    expect(inspected()).toBe(opened);
    // The oldest milestone read compares with a base that is not read yet: no gap count is made up.
    await pick('06a42cf1');
    expect(document.querySelector('.architecture-history__caption')?.textContent).toBe('c4a2cd0 → 06a42cf · the base is not read yet');
    expect(document.querySelector('li[data-milestone-rev^="06a42cf1"] [data-tone="gap"]')).toBeNull();
    await pick('827a2e47');
    expect(document.querySelector('[data-gap="milestone"]')?.getAttribute('data-code')).toBe('history-model-invalid');
    expect(document.querySelector('.architecture-history__canvas-error code')?.textContent).toBe('history-model-invalid');
    expect(document.querySelector('.architecture-history__canvas .react-flow')).toBeNull();
    await pick('c17d3b51');
    expect(skippedMilestones(gap.milestones, milestone(gap, 'c17d3b51'))).toBe(1);
    expect(document.querySelector('[data-base-rev]')?.getAttribute('data-base-rev')).toBe(milestone(gap, '06a42cf1').rev);
    expect(document.querySelector('[data-gap="skipped"]')?.getAttribute('data-count')).toBe('1');

    await act(async () => document.querySelector<HTMLButtonElement>('.architecture-history__load')!.click());
    await settle();
    expect(paths.at(-1)).toBe(`/api/v1/repositories/${REPO}/architecture/history?offset=0&limit=25&ref=${gap.head}`);
    expect([...document.querySelectorAll('li[data-milestone-rev]')].map(item => item.getAttribute('data-milestone-rev')))
      .toEqual([...removal.milestones, ...gap.milestones].reverse().map(item => item.rev));
    expect(sources.at(-1)).toEqual({ head: gap.head, read: 5, total: 50 });
    expect(document.querySelector('.architecture-history__load')).toBeNull();

    // The inspector opens on the first capability the delta removes; its name and its removed relations come from the base milestone.
    await pick('d02a082f');
    const inspector = document.querySelector('.architecture-history__inspector')!;
    expect(inspector.getAttribute('data-node-id')).toBe('capability.runtime-harness.delegated-runs');
    expect(inspector.querySelector('[data-diff="removed"]')?.textContent).toBe('This milestone removed it. The name comes from the base milestone 1761db9.');
    expect(inspector.querySelectorAll('li[data-diff="removed"]')).toHaveLength(5);
    // Four removed components: two belong to the removed capabilities, so only engineer-scheduling and task-fleet count as changed inside.
    expect(document.querySelector('li[data-milestone-rev^="d02a082f"] [data-tone="inside"]')?.textContent).toBe('•2');
    // The canvas draws each route of the placed scene; the removed relations between owners keep the removed class.
    const shape = historyShape([...removal.milestones, ...gap.milestones], milestone(removal, 'd02a082f'));
    const { scene } = layoutArchitectureMap(historyLayoutInput(shape, shape.edges));
    const edges = [...document.querySelectorAll('.architecture-history__stage .react-flow__edge')];
    expect(edges.map(edge => [edge.getAttribute('data-id'), edge.querySelector('.react-flow__edge-path')?.getAttribute('d')])).toEqual(scene.routes.map(route => [route.id, routePath(route.points)]));
    expect(edges.filter(edge => edge.classList.contains('architecture-map__edge--removed')).map(edge => edge.getAttribute('data-id')))
      .toEqual(['removed:domain:organization->domain:workflow-engine', 'removed:domain:runtime-harness->domain:organization', 'removed:domain:runtime-harness->domain:workflow-engine']);

  });

  // cx1735-r1-inspector-drops-removed-relations: the relation list comes from the delta, not from the drawn shape.
  // Each row reads one milestone whose base is not read, so a capability removed against that base is not drawn.
  test.each<{ name: string; page: keyof typeof historyPages; rev: string; node: string; rows: [string, string[]][] }>([
    { name: 'removed relations to undrawn capabilities only', page: 'removal', rev: 'd02a082f', node: 'capability.runtime-harness.evidence-ledger',
      rows: [['removed', ['capability.runtime-harness.delegated-runs']], ['removed', ['capability.runtime-harness.pm-dispatch']]] },
    { name: 'removed relations between drawn capabilities and to undrawn ones', page: 'removal', rev: 'd02a082f', node: 'capability.organization.task-fleet',
      rows: [['removed', []], ['removed', ['capability.runtime-harness.delegated-runs']], ['removed', []], ['removed', ['capability.runtime-harness.pm-dispatch']]] },
    { name: 'an added relation', page: 'inside', rev: '49f7ba6f', node: 'capability.runtime-harness.task-agent-host', rows: [['added', []]] },
  ])('with an unread base the inspector lists every relation change of the node: $name', async ({ page: name, rev, node, rows }) => {
    const only = { ...page(name), milestones: [milestone(page(name), rev)] };
    respond = () => json(only, 200, '"history-1"');
    await mount(workspace());
    await act(async () => document.querySelector<HTMLButtonElement>('#architecture-tab-history')!.click());
    await settle();
    await act(async () => document.querySelector(`.react-flow__node[data-id="${node}"]`)!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
    const inspector = document.querySelector('.architecture-history__inspector')!;
    expect(inspector.getAttribute('data-node-id')).toBe(node);
    // An undrawn endpoint shows as its archctx id.
    expect([...inspector.querySelectorAll('li[data-diff]')].map(item => [item.getAttribute('data-diff'), [...item.querySelectorAll('code')].map(code => code.textContent)]))
      .toEqual(rows);
  });

  test('a shallow clone shows only the archctx code and the repair command, with no timeline', async () => {
    respond = () => json({ code: 'history_shallow_repository' }, 422);
    await mount(workspace());
    await act(async () => document.querySelector<HTMLButtonElement>('#architecture-tab-history')!.click());
    await settle();
    expect(document.querySelector('.architecture-history__whole-error')?.getAttribute('data-error-code')).toBe('history_shallow_repository');
    expect(document.querySelector('[data-command] code')?.textContent).toBe('git fetch --unshallow');
    expect(document.querySelector('li[data-milestone-rev]')).toBeNull();
  });
});

describe('workspace navigation', () => {
  const repositoryId = REGISTRY.repositories[0]!.repository_id;
  function app(readArchitectureMap?: ArchitectureMapReader): ReactElement {
    return <OperatorApp initialRepositories={REGISTRY} readRepositories={async () => REGISTRY} initialLocale="en"
      readNotifyStatus={() => new Promise(() => {})} {...(readArchitectureMap ? { readArchitectureMap } : {})} />;
  }
  const link = (workspace: string) => document.querySelector<HTMLAnchorElement>(`.workspace-nav a[data-workspace="${workspace}"]`)!;

  test('names Home and thirteen sections in three groups, starts on the Office', async () => {
    await mount(app());
    expect([...document.querySelectorAll('.workspace-nav a')].map(item => item.textContent)).toEqual(['Home', 'Board', 'Repositories', 'Worktrees', 'Docs', 'Agents', 'Skills', 'Hooks', 'CLI', 'Bots', 'Architecture', 'Tests', 'System', 'Tools']);
    expect([...document.querySelectorAll('.workspace-nav [id^="nav-group-"]')].map(item => item.textContent)).toEqual(['Work', 'Setup', 'Observe']);
    expect(link('board').getAttribute('aria-current')).toBe('page');
    expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe('board');
    for (const workspace of ['repositories', 'system']) {
      await act(async () => link(workspace).click());
      expect(window.location.hash).toBe(`#${workspace}`);
      expect(link(workspace).getAttribute('aria-current')).toBe('page');
      expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe(workspace);
    }
    await act(async () => link('board').click());
    expect(window.location.hash).toBe('#board');
    expect(document.querySelectorAll('#view-tab-attention')).toHaveLength(0);
  });

  test('loads Architecture on demand and keeps the module in the hash when a neighbor recenters', async () => {
    respond = path => serveArchitecture(path.replace(`/repositories/${repositoryId}/`, `/repositories/${REPO}/`));
    await mount(app());
    expect(calls.some(call => call.path.includes('/architecture/'))).toBe(false);
    await act(async () => link('architecture').click());
    await settle();
    await openModules();
    expect(window.location.hash).toBe('#architecture');
    // The header row holds the page title once and the commit of the module list on screen.
    expect(document.querySelector('.operator-crumb')?.textContent).toBe('Observe/Architecture');
    expect([...document.querySelectorAll('main h1, main h2')].map(item => item.textContent)).not.toContain('Architecture');
    expect(document.querySelector('.operator-header [data-freshness-source="architecture"]')?.textContent).toBe(`Committed model · ${COMMIT.slice(0, 7)}`);
    expect(calls.at(-1)?.path).toBe(`/api/v1/repositories/${repositoryId}/architecture/modules`);
    await act(async () => document.querySelector<HTMLButtonElement>(`[data-module-id="${CENTER}"] button`)!.click());
    await settle();
    expect(window.location.hash).toBe(`#architecture/${CENTER}`);
    expect(document.querySelector('#module-page-title')?.textContent).toBe(detailFor().module.name);
    await act(async () => document.querySelector(`[data-node-id="${CALLER}"]`)!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
    expect(window.location.hash).toBe(`#architecture/${CALLER}`);
    expect(calls.some(call => call.path === `/api/v1/repositories/${repositoryId}/architecture/modules/${CALLER}`)).toBe(true);
    expect(document.querySelector('#module-page-title')?.textContent).toBe(detailFor(CALLER).module.name);

    // The header names a map only while that map is on screen. A base map that opens again after
    // History, the module list or a module page shows no map until its read answers, so the header
    // has no map source while the read is pending or unavailable.
    Object.assign(globalThis, {
      ResizeObserver: window.ResizeObserver, SVGElement: window.SVGElement, DOMMatrixReadOnly: window.DOMMatrixReadOnly,
      requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    });
    const recorded = decodeArchitectureMap(recordedMap);
    const source = () => document.querySelector('.operator-header [data-freshness-source="architecture"]')?.textContent ?? null;
    const away: Record<string, () => Promise<void>> = {
      history: async () => { await act(async () => document.querySelector<HTMLButtonElement>('#architecture-tab-history')!.click()); await settle(); },
      modules: openModules,
      detail: async () => {
        await act(async () => { window.history.pushState(null, '', `#architecture/${CENTER}`); window.dispatchEvent(new window.Event('hashchange')); });
        await settle();
      },
    };
    const back: Record<string, () => Promise<void>> = {
      history: async () => { await act(async () => document.querySelector<HTMLButtonElement>('#architecture-tab-map')!.click()); await settle(); },
      modules: async () => { await act(async () => document.querySelector<HTMLButtonElement>('#architecture-tab-map')!.click()); await settle(); },
      detail: async () => { await act(async () => [...document.querySelectorAll('button')].find(item => item.textContent === 'All modules')!.click()); await settle(); },
    };
    const pending: ArchitectureMapRead | null = null;
    for (const [view, later] of [['history', pending], ['modules', { state: 'unavailable', reason: 'architecture_map_timeout' }], ['detail', pending]] as const) {
      await act(async () => root?.unmount());
      window.history.pushState(null, '', '#architecture');
      let next: ArchitectureMapRead | null = { state: 'ok', map: recorded };
      await mount(app(async () => next ?? new Promise<ArchitectureMapRead>(() => {})));
      expect([view, source()]).toEqual([view, expect.stringMatching(new RegExp(`^Map collected .+ · ${recorded.commit.slice(0, 7)} · ${recorded.head_ref} · archctx ${recorded.archctx_version}$`))]);
      next = later;
      await away[view]!();
      expect([view, source()]).toEqual([view, view === 'history' ? null : `Committed model · ${COMMIT.slice(0, 7)}`]);
      await back[view]!();
      expect([view, document.querySelector('.react-flow'), source()]).toEqual([view, null, null]);
    }
    // A map of a detached HEAD names no branch.
    await act(async () => root?.unmount());
    await mount(app(async () => ({ state: 'ok', map: { ...recorded, head_ref: null } })));
    expect(source()).toMatch(new RegExp(` · ${recorded.commit.slice(0, 7)} · detached HEAD · archctx ${recorded.archctx_version}$`));
  });
});

test('operator web sources render text only and never set inner HTML', async () => {
  const offenders: string[] = [];
  let scanned = 0;
  for await (const relative of new Bun.Glob('**/*.{ts,tsx}').scan({ cwd: 'src/operator-web' })) {
    scanned++;
    if ((await Bun.file(`src/operator-web/${relative}`).text()).includes('dangerouslySetInnerHTML')) offenders.push(relative);
  }
  expect(scanned).toBeGreaterThan(10);
  expect(offenders).toEqual([]);
});
