import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, Profiler, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { isGroupNode, moduleDetail, moduleGraph, type ModelNode, type ModelRelation, type ModuleDetailV1, type ModuleIndexV1 } from '../../src/core/architecture/module-view';
import { buildModuleReviewPrompt, type ModuleReviewPromptV1 } from '../../src/core/review/module-review-prompt';
import { OperatorApp } from '../../src/operator-web/App';
import { ArchitectureWorkspace, reviewPromptCommand } from '../../src/operator-web/ArchitectureWorkspace';
import type { ArchitectureMapRead, ArchitectureMapReader } from '../../src/operator-web/ArchitectureMap';
import { layoutArchitectureMap, MAP_NODE_MIN_WIDTH, type MapLayoutNode } from '../../src/operator-web/architecture-map-layout';
import {
  architectureViolationCommand, decodeArchitectureMap, projectArchitectureMap,
  type ArchitectureFlowSelectorV1, type ArchitectureLayerOrderV1, type ArchitectureMapFlowV1, type ArchitectureMapLayersInput, type ArchitectureMapNodeV1,
  type ArchitectureMapRelationV1, type ArchitectureMapV1,
} from '../../src/core/operator/architecture-map';
import { runtimePlacement } from '../../src/operator-web/architecture-runtime';
import { layoutSequence } from '../../src/operator-web/architecture-sequence-layout';
import { layoutTopology } from '../../src/operator-web/architecture-topology-layout';
import recordedMap from '../../src/operator-web/fixtures/architecture-map.json';
import { ModuleGraph } from '../../src/operator-web/ModuleGraph';
import { repositorySnapshot, stableSnapshot } from '../../src/operator-web/fixture';
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
  return <ArchitectureWorkspace repositoryId={REPO} moduleId={null} onModule={() => {}} refreshGeneration={0} readMap={pendingMap} t={t} {...props} />;
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
  const mapNode = (id: string, kind: string, parent: string | null = null) => ({ id, kind, name: `Name ${id}`, status: 'active', layer: 'core', parent, summary: `${id} summary` });
  const mapRelation = (id: string, kind: string, source: string, target: string) => ({ id, kind, source, target, intent: `${id} intent` });
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
    changes: { state: 'ok', since: '2026-10-27T00:00:00.000Z', base: 'b'.repeat(40), commits: 1, model: [],
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
      repository_id: REPO, commit: COMMIT, collected_at: '2026-10-27T09:00:00.000Z', layer_order: layerOrder,
      nodes: [mapNode(CENTER, 'capability'), mapNode(PART, 'component', CENTER), mapNode(CALLER, 'capability'), mapNode(EXTERNAL, 'external-system')],
      relations: [mapRelation('relation.a-own', 'calls', CENTER, PART), mapRelation('relation.b-router', 'calls', CALLER, CENTER), mapRelation('relation.c-git', 'reads', PART, EXTERNAL)], flows: [], flow_evidence: [],
      sizes: available ? { state: 'ok', lines: new Map([['src/ledger.ts', 900], ['src/router.ts', 100]]), owners: new Map([['src/ledger.ts', PART], ['src/router.ts', CALLER]]) }
        : { state: 'unavailable', reason: 'model_worktree_dirty' },
      dependencies: available ? { state: 'ok', matrix: [{ from: CALLER, to: CENTER, imports: 7 }] } : { state: 'unavailable', reason: 'code_facts_other_commit' },
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

  test('every model node is placed once, members inside their group, siblings apart, nested groups and the recorded map included', () => {
    const overlaps = (a: MapLayoutNode, b: MapLayoutNode) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    // Three namespace levels, with a relation that ends on the deepest one.
    const nested = projectArchitectureMap({
      repository_id: REPO, commit: COMMIT, collected_at: '2026-10-27T09:00:00.000Z',
      nodes: [mapNode('namespace.a', 'namespace'), mapNode('namespace.a-b', 'namespace', 'namespace.a'), mapNode('namespace.a-b-c', 'namespace', 'namespace.a-b'),
        mapNode('namespace.a-d', 'namespace', 'namespace.a'), mapNode('process.p', 'process')],
      relations: [mapRelation('relation.p-runs', 'runs-in', 'process.p', 'namespace.a-b-c')], flows: [], flow_evidence: [],
      sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'model_worktree_dirty' }, layers: noLayers,
      layer_order: undeclaredLayers,
    });
    for (const map of [mapFor(), nested, decodeArchitectureMap(recordedMap)]) {
      const layout = layoutArchitectureMap(map);
      expect(layout.nodes.map(item => item.node.id).sort()).toEqual(map.nodes.map(node => node.id).sort());
      const placed = new Map(layout.nodes.map(item => [item.node.id, item]));
      for (const item of layout.nodes) {
        if (item.node.parent === null) continue;
        const group = placed.get(item.node.parent)!;
        expect(group.group).toBe(true);
        expect(item.x >= group.x && item.y >= group.y && item.x + item.width <= group.x + group.width && item.y + item.height <= group.y + group.height).toBe(true);
      }
      const siblings = new Map<string | null, MapLayoutNode[]>();
      for (const item of layout.nodes) siblings.set(item.node.parent, [...(siblings.get(item.node.parent) ?? []), item]);
      for (const group of siblings.values()) for (const [index, a] of group.entries()) for (const b of group.slice(index + 1)) expect(overlaps(a, b)).toBe(false);
      // React Flow places a member relative to a parent that comes earlier in the list.
      for (const [index, item] of layout.nodes.entries()) {
        if (item.node.parent !== null) expect(layout.nodes.findIndex(other => other.node.id === item.node.parent)).toBeLessThan(index);
      }
      expect(layout.edges.map(edge => edge.relation.id)).toEqual(map.relations.map(relation => relation.id));
    }
  });

  test('box width follows lines, I/O relations are dashed, and only a capability pair with imports is weighted', () => {
    const layout = layoutArchitectureMap(mapFor());
    const width = (id: string) => layout.nodes.find(item => item.node.id === id)!.width;
    expect(width(PART)).toBeGreaterThan(width(CALLER));
    expect(width(EXTERNAL)).toBe(MAP_NODE_MIN_WIDTH);
    const edges = new Map(layout.edges.map(edge => [edge.relation.id, edge]));
    expect(edges.get('relation.c-git')!.dashed).toBe(true);
    expect(edges.get('relation.a-own')!.dashed).toBe(false);
    expect(edges.get('relation.b-router')).toMatchObject({ imports: 7, strokeWidth: 6 });
    expect(edges.get('relation.a-own')).toMatchObject({ imports: null, strokeWidth: 1 });
    const bare = layoutArchitectureMap(mapFor(false));
    expect(bare.nodes.every(item => item.size === null && (item.group || item.width === MAP_NODE_MIN_WIDTH))).toBe(true);
    expect(bare.edges.every(edge => edge.imports === null)).toBe(true);
  });

  test('with a layer order each layer is one band, top to bottom, and a relation against the order keeps the bands; without one there is no band', () => {
    const below = (upper: { y: number; height: number }, lower: { y: number }) => upper.y + upper.height < lower.y;
    // CALLER (cli) calls CENTER (core); the git read points from core to external; the extra relation points up, against the order.
    const ordered = projectArchitectureMap({
      repository_id: REPO, commit: COMMIT, collected_at: '2026-10-27T09:00:00.000Z',
      nodes: [{ ...mapNode(CENTER, 'capability'), layer: 'core' }, { ...mapNode(PART, 'component', CENTER), layer: 'core' }, { ...mapNode(CALLER, 'capability'), layer: 'cli' },
        { ...mapNode(EXTERNAL, 'external-system'), layer: 'external' }, { ...mapNode('process.loose', 'process'), layer: null }],
      relations: [mapRelation('relation.b-router', 'calls', CALLER, CENTER), mapRelation('relation.c-git', 'reads', PART, EXTERNAL), mapRelation('relation.d-up', 'calls', EXTERNAL, CALLER)], flows: [], flow_evidence: [],
      sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'model_worktree_dirty' }, layers: noLayers,
      layer_order: { state: 'ok', layers: ['cli', 'web', 'core', 'external'] },
    });
    const layout = layoutArchitectureMap(ordered);
    // A declared layer with no node has no band; the model's unlayered nodes take the last band.
    expect(layout.bands.map(band => band.layer)).toEqual(['cli', 'core', 'external', null]);
    for (const [index, band] of layout.bands.slice(1).entries()) expect(below(layout.bands[index]!, band)).toBe(true);
    const box = new Map(layout.nodes.map(item => [item.node.id, item]));
    for (const item of layout.nodes.filter(entry => entry.node.parent === null)) {
      const band = layout.bands.find(entry => entry.layer === item.node.layer)!;
      expect(item.y >= band.y && item.y + item.height <= band.y + band.height).toBe(true);
    }
    expect(below(box.get(CALLER)!, box.get(CENTER)!) && below(box.get(CENTER)!, box.get(EXTERNAL)!) && below(box.get(EXTERNAL)!, box.get('process.loose')!)).toBe(true);
    expect(layoutArchitectureMap(mapFor(true, mapLayers, undeclaredLayers)).bands).toEqual([]);

    // The recorded map of this repository: its bands follow the model's order, and top-level boxes do not overlap.
    const recorded = decodeArchitectureMap(recordedMap);
    const real = layoutArchitectureMap(recorded);
    const used = new Set(recorded.nodes.filter(node => node.parent === null).map(node => node.layer));
    expect(recorded.layer_order.state === 'ok' && real.bands.map(band => band.layer)).toEqual(recorded.layer_order.state === 'ok' ? recorded.layer_order.layers.filter(layer => used.has(layer)) : []);
    for (const [index, band] of real.bands.slice(1).entries()) expect(below(real.bands[index]!, band)).toBe(true);
  });

  test('the map is the default view and selecting a node lists its relations with import counts', async () => {
    const opened: (string | null)[] = [];
    await mount(workspace({ readMap: reader({ state: 'ok', map: mapFor() }), onModule: id => opened.push(id) }));
    expect(document.querySelector('#architecture-tab-map')?.getAttribute('aria-selected')).toBe('true');
    expect(calls).toEqual([]);
    const canvas = document.querySelector('.architecture-map')!;
    expect([canvas.getAttribute('data-node-count'), canvas.getAttribute('data-relation-count')]).toEqual(['4', '3']);
    expect([...document.querySelectorAll('.react-flow__node')].map(item => item.getAttribute('data-id')).sort()).toEqual([CALLER, CENTER, PART, EXTERNAL].sort());
    expect(document.querySelector(`.react-flow__node[data-id="${PART}"]`)?.textContent).toContain('900 lines');
    // Every node is in the model's one declared layer, so the canvas draws one labelled band.
    expect([...document.querySelectorAll('.architecture-map__band')].map(item => item.textContent)).toEqual(['core']);
    // A banded map opens at a readable zoom on its top band, not fitted to the whole map.
    expect(document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform).toContain('scale(0.85)');
    expect(document.querySelector('.architecture-map-view')?.textContent).toContain(COMMIT);
    // The base map has every source, so it states no gap. A part of the open layer that archctx
    // reports as unknown is stated inside that layer's summary, not as a base-map gap.
    expect(document.querySelectorAll('.architecture-map-view > .architecture-map__gap')).toHaveLength(0);
    expect(document.querySelector('[data-layer-summary="changes"] .architecture-map__gap')?.getAttribute('data-reason')).toBe('ref-code-facts-unavailable');

    await act(async () => document.querySelector(`.react-flow__node[data-id="${CALLER}"]`)!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
    const inspector = document.querySelector('.architecture-map__inspector')!;
    expect(inspector.getAttribute('data-node-id')).toBe(CALLER);
    expect([...inspector.querySelectorAll('[data-relation-id]')].map(item => item.textContent)).toEqual([`calls Name ${CENTER} · 7 imports`]);
    expect(inspector.textContent).toContain('100 lines in 1 files');
    await act(async () => [...inspector.querySelectorAll('button')].find(item => item.textContent === 'Open module')!.click());
    expect(opened).toEqual([CALLER]);
  });

  test('a missing line or import source is stated with its reason, and a failed read shows its code', async () => {
    await mount(workspace({ readMap: reader({ state: 'ok', map: mapFor(false) }) }));
    // Only the base-map gaps; the open layer's own flow-step gap stays in its summary.
    expect([...document.querySelectorAll('.architecture-map-view > .architecture-map__gap')].map(item => item.getAttribute('data-reason'))).toEqual(['model_worktree_dirty', 'code_facts_other_commit']);
    expect(document.querySelector('.architecture-map__legend')?.textContent).not.toContain('imports');
    // A model without ordered layers keeps the unbanded layout and states why.
    await act(async () => root?.render(workspace({ readMap: reader({ state: 'ok', map: mapFor(true, mapLayers, undeclaredLayers) }) })));
    await settle();
    expect([...document.querySelectorAll('.architecture-map-view > .architecture-map__gap')].map(item => [item.getAttribute('data-gap'), item.getAttribute('data-reason')])).toEqual([['layer_order', 'model_layers_undeclared']]);
    expect(document.querySelectorAll('.architecture-map__band')).toHaveLength(0);
    await act(async () => root?.render(workspace({ repositoryId: 'repo-other', readMap: reader({ state: 'unavailable', reason: 'model_unavailable' }) })));
    await settle();
    expect(document.querySelector('[role="alert"]')?.getAttribute('data-error-code')).toBe('model_unavailable');
    expect(document.querySelector('.architecture-map')).toBeNull();
  });

  test('the map opens on today\'s changes, and each layer marks nodes from the collector\'s facts or states its reason', async () => {
    await mount(workspace({ readMap: reader({ state: 'ok', map: mapFor() }) }));
    const box = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"] > div`)!;
    const layerButton = (layer: string) => document.querySelector<HTMLButtonElement>(`.architecture-layers [data-layer="${layer}"]`)!;
    const choose = async (layer: string) => { await act(async () => layerButton(layer).click()); await settle(); };
    const gaps = () => [...document.querySelectorAll('.architecture-map__gap')].map(item => `${item.getAttribute('data-gap')}:${item.getAttribute('data-reason')}`);
    const notes = () => [...document.querySelectorAll('.architecture-map__note')].map(item => `${item.getAttribute('data-note')}:${item.getAttribute('data-reason')}`);

    expect(document.querySelector('.architecture-layers [aria-pressed="true"]')?.getAttribute('data-layer')).toBe('changes');
    expect([...document.querySelectorAll('.architecture-layers button')].map(item => `${item.getAttribute('data-layer')}:${item.getAttribute('data-state')}`))
      .toEqual(['changes:ok', 'violations:ok', 'pull_requests:unavailable', 'tests:ok', 'decisions:ok']);
    // One file has no line count, so the label says the sum is partial.
    expect([box(PART).getAttribute('data-tone'), box(PART).querySelector('.architecture-map__mark')?.textContent]).toEqual(['change', '+5 −2 ?']);
    // archctx says the group depends on the changed component; nodes with nothing on the layer fade.
    expect([box(CENTER).getAttribute('data-tone'), box(CALLER).hasAttribute('data-quiet'), box(EXTERNAL).hasAttribute('data-quiet')]).toEqual(['muted', true, true]);
    expect(document.querySelector('[data-layer-summary="changes"]')?.textContent).toContain('≥2 files changed in 1 commit, ≥0 without an owner');
    expect([gaps(), notes()]).toEqual([['changes.flow_steps:ref-code-facts-unavailable'], ['changes.truncated:paths']]);
    expect(document.querySelector('[data-note="changes.truncated"]')?.textContent).toBe('archctx stopped at its limits for changed paths. File and line counts are lower bounds.');
    await act(async () => box(PART).dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
    expect(document.querySelector('[data-layer-facts="changes"]')?.textContent).toBe('2 files changed, +5 −2 lines (1 without a line count)assets/ledger.pngsrc/ledger.ts');

    await choose('violations');
    expect([box(PART).getAttribute('data-tone'), box(CENTER).getAttribute('data-tone'), box(CALLER).hasAttribute('data-quiet')]).toEqual(['danger', 'danger', true]);
    expect(document.querySelector('[data-layer-summary="violations"]')?.textContent).toContain('src/orphan.ts');
    expect(document.querySelector('[data-layer-summary="violations"]')?.textContent).toContain('Flow proofs: 1 of 2 selectors proven; 1 capabilities cannot prove their flow.');
    expect(gaps()).toEqual(['violations.anchors:code_facts_unavailable']);
    expect(notes()).toEqual(['violations.layer_direction:model_layers_undeclared']);
    expect(document.querySelector('.architecture-map__legend')?.textContent).toContain('Undeclared import');

    await choose('tests');
    expect([box(CENTER).getAttribute('data-tone'), box(CALLER).getAttribute('data-tone')]).toEqual(['danger', 'muted']);
    await act(async () => box(CENTER).dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
    expect(document.querySelector('[data-layer-facts="tests"]')?.textContent).toBe('2 test files: 1 passed, 1 failed, 0 skipped, 0 no result');

    await choose('pull_requests');
    expect([gaps(), notes()]).toEqual([['pull_requests:dev_activity_unavailable'], []]);
    expect(document.querySelectorAll('[data-tone], [data-quiet]')).toHaveLength(0);
    await choose('decisions');
    expect([gaps(), notes()]).toEqual([[], []]);
    expect(document.querySelector('[data-layer-summary="decisions"]')?.textContent).toBe('2 decisions; 1 apply to model nodes.Decisions that apply to no node (1)Name things plainly · docs/adr/ADR-0002-naming.md');
    expect([box(CALLER).getAttribute('data-tone'), box(CALLER).querySelector('.architecture-map__mark')?.textContent, box(EXTERNAL).hasAttribute('data-quiet')]).toEqual(['muted', '1', true]);
    await act(async () => box(CALLER).dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
    expect(document.querySelector('[data-layer-facts="decisions"]')?.textContent).toBe('Route through one router (accepted)docs/adr/ADR-0001-router.md');
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
    const gaps = () => [...document.querySelectorAll('.architecture-map__gap')].map(item => `${item.getAttribute('data-gap')}:${item.getAttribute('data-reason')}`);
    const notes = () => [...document.querySelectorAll('.architecture-map__note')].map(item => `${item.getAttribute('data-note')}:${item.getAttribute('data-reason')}`);
    await act(async () => document.querySelector<HTMLButtonElement>('.architecture-layers [data-layer="pull_requests"]')!.click());
    await settle();

    expect(document.querySelector('.architecture-layers [data-layer="pull_requests"]')?.getAttribute('data-state')).toBe('ok');
    const select = document.querySelector<HTMLSelectElement>('[data-layer-summary="pull_requests"] select')!;
    expect([select.value, [...select.options].map(option => option.textContent)]).toEqual(['21', ['#21 Ledger rows', '#22 Big rewrite', '#23 Odd path']]);
    const summary = document.querySelector('[data-pull-request="21"]')!.textContent;
    expect(summary).toContain(head.slice(0, 12));
    expect(summary).toContain('2 files changed in 1 node, 1 without an owner');
    // archctx marks only the changed component and the group that calls it; the caller is two hops away.
    const mark = (id: string) => [box(id).getAttribute('data-tone'), box(id).querySelector('.architecture-map__mark')?.textContent ?? null];
    expect([PART, CENTER].map(mark)).toEqual([['change', '1'], ['muted', '↳']]);
    expect([box(CALLER).hasAttribute('data-quiet'), box(EXTERNAL).hasAttribute('data-quiet')]).toEqual([true, true]);
    expect([gaps(), notes()]).toEqual([['pull_request.flow_steps:line-impact-unavailable ref-code-facts-unavailable'], []]);
    await act(async () => box(CENTER).dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    await settle();
    expect(document.querySelector('[data-layer-facts="pull_requests"]')?.textContent).toBe(`Depends on changed Name ${PART}`);

    await act(async () => {
      select.value = '22';
      select.dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event);
    });
    await settle();
    expect(gaps()).toEqual(['pull_request:files_truncated']);
    expect(document.querySelectorAll('[data-tone], [data-quiet]')).toHaveLength(0);

    await act(async () => {
      select.value = '23';
      select.dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event);
    });
    await settle();
    const refused = document.querySelector('.architecture-map__gap[data-gap="pull_request"]')!;
    expect([refused.getAttribute('data-reason'), refused.getAttribute('data-code'), refused.textContent]).toEqual(['archctx_error', 'AC_SCHEMA_INVALID native-context-arguments-invalid',
      'No impact for this pull request: archctx impact refused with AC_SCHEMA_INVALID native-context-arguments-invalid.']);
  });

  test('a layer without data is still listed and says why', async () => {
    await mount(workspace({ readMap: reader({ state: 'ok', map: projectArchitectureMap({ ...mapFor(), sizes: { state: 'unavailable', reason: 'model_worktree_dirty' },
      dependencies: { state: 'unavailable', reason: 'model_worktree_dirty' }, layers: noLayers }) }) }));
    const changes = document.querySelector('.architecture-map__gap[data-gap="changes"]')!;
    expect([changes.getAttribute('data-reason'), changes.getAttribute('data-code')]).toEqual(['archctx_error', 'AC_SCHEMA_INVALID native-context-model-invalid']);
    // Decisions come from the model export, so that layer always has data, even with no decision.
    expect([...document.querySelectorAll('.architecture-layers [data-state="unavailable"]')].map(item => item.getAttribute('data-layer'))).toEqual(['changes', 'violations', 'pull_requests', 'tests']);
    expect(document.querySelectorAll('[data-quiet]')).toHaveLength(0);
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
  const mapNode = (id: string, kind: string, parent: string | null = null) => ({ id, kind, name: `Name ${id}`, status: 'active', layer: 'core', parent, summary: `${id} summary` });
  const mapRelation = (id: string, kind: string, source: string, target: string) => ({ id, kind, source, target, intent: `${id} intent` });
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
    changes: { state: 'ok', since: '2026-10-27T00:00:00.000Z', base: 'b'.repeat(40), commits: 1, model: [],
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
      repository_id: REPO, commit: COMMIT, collected_at: '2026-10-27T09:00:00.000Z', layer_order: { state: 'ok', layers: ['core'] },
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
  const chooseLayer = async (layer: string) => { await act(async () => document.querySelector<HTMLButtonElement>(`.architecture-layers [data-layer="${layer}"]`)!.click()); await settle(); };
  const notes = () => [...document.querySelectorAll('.architecture-map__note')].map(item => `${item.getAttribute('data-note')}:${item.getAttribute('data-reason')}`);
  const inspector = () => document.querySelector('.architecture-map__inspector')!;

  beforeEach(() => {
    Object.assign(globalThis, {
      ResizeObserver: window.ResizeObserver, SVGElement: window.SVGElement, DOMMatrixReadOnly: window.DOMMatrixReadOnly,
      requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    });
  });

  test('a participant runs in its nearest deployed process, and each process box is contiguous; rows follow the model with one fragment per outcome', () => {
    const map = runtimeMap();
    const place = runtimePlacement(map);
    expect([CALLER, CENTER, PART, EXTERNAL, SERVER].map(place)).toEqual([
      { kind: 'unknown', reason: 'deployment_undeclared' }, { kind: 'process', process: SERVER }, { kind: 'process', process: SERVER }, { kind: 'external' }, { kind: 'process', process: SERVER }]);
    const twice = runtimeMap({ relations: [...runtimeMap().relations, mapRelation('relation.h-deploy', 'deployed-on', CENTER, CLI)] });
    expect(runtimePlacement(twice)(PART)).toEqual({ kind: 'unknown', reason: 'deployment_ambiguous' });
    // The ledger is listed after the router but shares the pipe's process, so it sits next to the pipe.
    const reordered = { ...flow, participants: [flow.participants[1]!, flow.participants[0]!, flow.participants[3]!, flow.participants[2]!] };
    const layout = layoutSequence(reordered, place);
    expect(layout.boxes.map(box => [box.key, box.participants])).toEqual([[`process:${SERVER}`, ['pipe', 'ledger']], ['unknown:deployment_undeclared', ['router']], ['external', ['git']]]);
    expect(layout.columns.map(column => column.participant.id)).toEqual(['pipe', 'ledger', 'router', 'git']);
    for (const [index, column] of layout.columns.entries()) {
      const box = layout.boxes.find(entry => entry.key === column.box)!;
      expect(column.x > box.x && column.x < box.x + box.width).toBe(true);
      if (index > 0) expect(column.x > layout.columns[index - 1]!.x).toBe(true);
    }
    expect(layout.messages.map(message => `${message.outcome ?? ''}:${message.step.id}`)).toEqual([':route', ':append', 'kept:commit', 'refused:refuse']);
    for (const [index, message] of layout.messages.slice(1).entries()) expect(message.y > layout.messages[index]!.y).toBe(true);
    const kept = layout.fragments[0]!;
    const commit = layout.messages[2]!;
    expect([layout.fragments.map(fragment => fragment.outcome.kind), commit.y > kept.y && commit.y < kept.y + kept.height, layout.terminals.map(entry => entry.participant)])
      .toEqual([['success', 'error'], true, ['pipe', 'router']]);
  });

  test('topology boxes nest by namespace, a deployed node sits in its process, and a relation is drawn between boxes or counted as unplaced', () => {
    const map = runtimeMap();
    const layout = layoutTopology(map, runtimePlacement(map));
    const box = new Map(layout.boxes.map(item => [item.node.id, item]));
    // Every topology node once, code nodes not as boxes; a namespace comes before what it holds.
    expect(layout.boxes.map(item => item.node.id).sort()).toEqual([CLI, EXTERNAL, HOST, SERVER].sort());
    expect(layout.boxes.findIndex(item => item.node.id === HOST)).toBeLessThan(Math.min(...[SERVER, CLI].map(id => layout.boxes.findIndex(item => item.node.id === id))));
    const inside = (inner: string, outer: string) => {
      const a = box.get(inner)!, b = box.get(outer)!;
      return a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
    };
    expect([inside(SERVER, HOST), inside(CLI, HOST), inside(EXTERNAL, HOST), box.get(HOST)!.group, box.get(SERVER)!.parent]).toEqual([true, true, false, true, HOST]);
    expect(box.get(SERVER)!.members.map(member => member.id)).toEqual([CENTER]);
    // The spawn joins two processes; the ledger's read of git is drawn from its process; the router runs in no process.
    expect(layout.edges.map(edge => [edge.source, edge.target, edge.kind, edge.dashed, edge.relations])).toEqual([
      [SERVER, EXTERNAL, 'io', true, ['relation.c-git']], [CLI, SERVER, 'spawns', true, ['relation.g-spawns']]]);
    expect([layout.unplaced, layout.stacked]).toEqual([['relation.b-router'], []]);
    // Two mounts of one process: the map has no mount order, so the layout names the mounter.
    const mounted = runtimeMap({ nodes: [...runtimeMap().nodes, mapNode('mount.a', 'mount'), mapNode('mount.b', 'mount')],
      relations: [...runtimeMap().relations, mapRelation('relation.m-a', 'mounts', CLI, 'mount.a'), mapRelation('relation.m-b', 'mounts', CLI, 'mount.b')] });
    const stacked = layoutTopology(mounted, runtimePlacement(mounted));
    expect([stacked.stacked, stacked.boxes.find(item => item.node.id === 'mount.a')?.parent]).toEqual([[CLI], HOST]);
  });

  test('the tabs follow the design order and the layer stays when the base map changes', async () => {
    await mount(workspace({ readMap: reader(runtimeMap()) }));
    expect([...document.querySelectorAll('.architecture-tabs [role="tab"]')].map(item => item.textContent)).toEqual(['Modules', 'Sequence', 'Topology', 'Module list']);
    await chooseLayer('violations');
    await tab('sequence');
    expect(document.querySelector('#architecture-tab-sequence')?.getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('.architecture-layers [aria-pressed="true"]')?.getAttribute('data-layer')).toBe('violations');
    await tab('topology');
    expect(document.querySelector('.architecture-layers [aria-pressed="true"]')?.getAttribute('data-layer')).toBe('violations');
  });

  test('2-ARCH-P2 on the module map, which holds the layered view: a node shows its size, dependency edges, violations and the command that lists them', async () => {
    await mount(workspace({ readMap: reader(runtimeMap()) }));
    await click(`.react-flow__node[data-id="${CENTER}"]`);
    expect(inspector().getAttribute('data-node-id')).toBe(CENTER);
    expect(inspector().querySelector('[data-node-size]')?.textContent).toBe('900 lines in 1 files');
    expect([...inspector().querySelectorAll('[data-relation-id]')].map(item => item.textContent)).toContain(`calls Name ${CALLER} · 7 imports`);
    expect(inspector().querySelector('[data-layer-facts="violations"]')?.textContent).toContain(`Imports Name ${CALLER} with no declared relation (3 imports)`);
    expect([...inspector().querySelectorAll('[data-fix-command]')].map(item => item.textContent)).toEqual([architectureViolationCommand('flows'), architectureViolationCommand('dependencies')]);
    expect(architectureViolationCommand('flows')).toBe('archctx flows check --no-sync --json');
    await click(`.react-flow__node[data-id="${PART}"]`);
    expect(inspector().querySelector('[data-related-prs]')?.textContent).toBe('#21 Ledger rows · changes 1 file');
  });

  test('2-ARCH-P2 on the sequence map: a message shows its declared code, archctx proof, related PR, dependency edges and the proof command; unknown parts say why', async () => {
    await mount(workspace({ readMap: reader(runtimeMap()) }));
    await tab('sequence');
    expect(document.querySelector('[data-view="sequence"]')?.getAttribute('data-flow')).toBe(FLOW);
    expect(document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform).toContain('scale(0.85)');
    expect([...document.querySelectorAll('.architecture-sequence__box')].map(item => [item.getAttribute('data-placement'), item.textContent])).toEqual([
      ['unknown', 'Process unknown'], ['process', `Name ${SERVER}`], ['external', 'External systems']]);
    expect(document.querySelector('.architecture-sequence__box[data-placement="unknown"]')?.getAttribute('data-reason')).toBe(t('architecture.runtime.deployment_undeclared'));
    expect([...document.querySelectorAll('.architecture-sequence__fragment')].map(item => item.getAttribute('data-kind'))).toEqual(['success', 'error']);
    // Today's changes reach the append step.
    const message = (id: string) => document.querySelector(`.react-flow__node[data-id="message:${id}"] .architecture-sequence__message`)!;
    expect([message(':append').getAttribute('data-tone'), message(':route').hasAttribute('data-tone')]).toEqual(['change', false]);

    await click('.react-flow__node[data-id="message::route"]');
    expect(message(':route').hasAttribute('data-selected')).toBe(true);
    expect(inspector().getAttribute('data-step-id')).toBe(':route');
    expect(inspector().querySelector('[data-step-evidence]')?.textContent).toBe('src/router.ts route→ src/pipeline.ts route');
    expect(inspector().querySelector('[data-step-proof]')?.getAttribute('data-step-proof')).toBe('proven');
    expect([...inspector().querySelectorAll('[data-call-sites] li')].map(item => item.textContent)).toEqual(['src/router.ts:12', 'src/router-entry.ts']);
    expect([...inspector().querySelectorAll('[data-node-size]')].map(item => item.textContent)).toEqual([' · 100 lines in 1 files', ' · 900 lines in 1 files']);
    expect([...inspector().querySelectorAll('[data-relation-id]')].map(item => item.textContent)).toEqual([`calls Name ${CALLER} → Name ${CENTER} · 7 imports`]);
    expect(inspector().querySelectorAll('[data-fix-command]')).toHaveLength(0);

    await click('.react-flow__node[data-id="message::append"]');
    expect(inspector().querySelector('[data-path-withheld]')?.textContent).toBe('path withheld (it fails the public-path check)');
    expect(inspector().querySelector('[data-step-proof]')?.textContent).toBe('Not proven: archctx reports no-direct-call.');
    expect(inspector().querySelector('[data-call-sites]')).toBeNull();
    expect(inspector().querySelector('[data-step-today]')).not.toBeNull();
    expect(inspector().querySelector('[data-fix-command="flows"]')?.textContent).toBe('archctx flows check --no-sync --json');

    await click('.react-flow__node[data-id="message:kept:commit"]');
    expect(inspector().querySelector('[data-gap="evidence"]')?.getAttribute('data-reason')).toBe('selector_undeclared');
    expect(inspector().querySelector('[data-step-proof]')?.getAttribute('data-step-proof')).toBe('missing');
    expect(inspector().querySelector('[data-related-prs]')?.textContent).toBe('#21 Ledger rows');

    await click('.react-flow__node[data-id="participant:router"]');
    expect([inspector().getAttribute('data-node-id'), inspector().querySelector('[data-runtime]')?.textContent]).toEqual([CALLER, `Runs in: ${t('architecture.runtime.deployment_undeclared')}`]);
    await click('.react-flow__node[data-id="participant:ledger"]');
    expect(inspector().querySelector('[data-runtime]')?.textContent).toBe(`Runs in: Name ${SERVER}`);
    // A not-applicable flow states its rationale instead of a diagram.
    await act(async () => {
      const select = document.querySelector<HTMLSelectElement>('.architecture-sequence select')!;
      select.value = 'flow.router.none';
      select.dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event);
    });
    await settle();
    expect(notes()).toContain('sequence.not_applicable:flow_not_applicable');
  });

  test('each layer on the sequence map marks steps or participants from the collector, or says what it cannot mark', async () => {
    await mount(workspace({ readMap: reader(runtimeMap()) }));
    await tab('sequence');
    const message = (id: string) => document.querySelector(`.react-flow__node[data-id="message:${id}"] .architecture-sequence__message`)!;
    const header = (id: string) => document.querySelector(`.react-flow__node[data-id="participant:${id}"] .architecture-sequence__header`)!;
    expect([header('ledger').getAttribute('data-tone'), header('pipe').getAttribute('data-tone'), header('router').hasAttribute('data-quiet')]).toEqual(['change', 'muted', true]);
    await chooseLayer('violations');
    expect([message(':append').getAttribute('data-tone'), message(':append').querySelector('.architecture-map__mark')?.textContent, message(':route').hasAttribute('data-tone')]).toEqual(['danger', 'no-direct-call', false]);
    // The layer summary keeps its own note; the sequence map adds why it draws no import edge.
    expect(notes()).toEqual(['violations.layer_direction:model_layers_undeclared', 'sequence.violations:imports_on_module_map']);
    await chooseLayer('pull_requests');
    expect([message('kept:commit').getAttribute('data-tone'), message(':append').hasAttribute('data-tone')]).toEqual(['change', false]);
    await chooseLayer('tests');
    expect([notes(), header('pipe').getAttribute('data-tone'), header('router').getAttribute('data-tone')]).toEqual([['sequence.tests:tests_by_capability'], 'danger', 'success']);
    await chooseLayer('decisions');
    expect([notes(), header('pipe').getAttribute('data-tone')]).toEqual([['sequence.decisions:decisions_by_node'], 'muted']);

    // Without a flows check answer each step proof is unknown with archctx's reason, and the read command stays.
    await act(async () => root?.render(workspace({ repositoryId: 'repo-proofless', readMap: reader(runtimeMap({ layers: { ...layers, violations: { ...layers.violations, flows: noCodeFacts } } })) })));
    await settle();
    await tab('sequence');
    await click('.react-flow__node[data-id="message::route"]');
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
    const canvas = document.querySelector('[data-view="topology"]')!;
    expect([canvas.getAttribute('data-node-count'), canvas.getAttribute('data-edge-count')]).toEqual(['4', '2']);
    expect(document.querySelector(`.react-flow__node[data-id="${SERVER}/${CENTER}"]`)?.classList.contains('react-flow__node-member')).toBe(true);
    expect(document.querySelector(`.react-flow__node[data-id="${EXTERNAL}"] .architecture-topology__box`)?.getAttribute('data-kind')).toBe('external-system');
    expect(notes()).toEqual(['topology.unplaced:deployment_undeclared']);
    // The map opens at the module map's readable zoom on its first runtime box, not fitted to the whole map.
    const host = layoutTopology(runtimeMap(), runtimePlacement(runtimeMap())).boxes.find(item => item.node.id === HOST)!;
    expect(document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform).toBe(`translate(${-(host.x - 24) * 0.85}px,${-(host.y - 24) * 0.85}px) scale(0.85)`);
    expect(document.querySelector('[data-note="topology.unplaced"]')?.textContent).toContain(`calls Name ${CALLER} → Name ${CENTER}`);
    // Today the ledger changed: its capability and the process it runs in are lit; the CLI is not.
    const box = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"] > div`)!;
    expect([box(`${SERVER}/${CENTER}`).getAttribute('data-tone'), box(SERVER).hasAttribute('data-quiet'), box(CLI).hasAttribute('data-quiet'), box(HOST).hasAttribute('data-quiet')]).toEqual(['muted', false, true, false]);

    await click(`.react-flow__node[data-id="${SERVER}/${CENTER}"]`);
    expect(inspector().getAttribute('data-node-id')).toBe(CENTER);
    expect(inspector().querySelector('[data-node-size]')?.textContent).toBe('900 lines in 1 files');
    expect(inspector().querySelector('[data-runtime]')?.textContent).toBe(`Runs in: Name ${SERVER}`);
    expect(inspector().querySelector('[data-layer-facts="violations"]')?.textContent).toContain('Flow proof cannot be proven (2 diagnostics)');
    expect([...inspector().querySelectorAll('[data-fix-command]')].map(item => item.getAttribute('data-fix-command'))).toEqual(['flows', 'dependencies']);
    await click(`.react-flow__node[data-id="${SERVER}"]`);
    expect([inspector().querySelector('[data-runs-in]')?.textContent, inspector().querySelector('[data-deployed]')?.textContent]).toEqual([`In: Name ${HOST}`, `Name ${CENTER} · 900 lines in 1 files`]);

    await chooseLayer('tests');
    expect(notes()).toEqual(['topology.unplaced_marks:deployment_undeclared', 'topology.unplaced:deployment_undeclared']);
    await chooseLayer('violations');
    expect(notes()).toContain('topology.violations:imports_on_module_map');
    // A model without processes, namespaces or mounts has no topology map.
    await act(async () => root?.render(workspace({ repositoryId: 'repo-flat', readMap: reader(runtimeMap({ nodes: [mapNode(CENTER, 'capability'), mapNode(PART, 'component', CENTER), mapNode(CALLER, 'capability'), mapNode(EXTERNAL, 'external-system')],
      relations: [mapRelation('relation.a-own', 'calls', CENTER, PART), mapRelation('relation.b-router', 'calls', CALLER, CENTER), mapRelation('relation.c-git', 'reads', PART, EXTERNAL)] })) })));
    await settle();
    await tab('topology');
    expect(notes()).toContain('topology.empty:topology_undeclared');
  });

  test('a namespace that mounts gets routing handles for its edge, and a node deployed on two processes is one canvas node per process with one inspector', async () => {
    const map = runtimeMap({ nodes: [...runtimeMap().nodes, mapNode('mount.cache', 'mount')],
      relations: [...runtimeMap().relations, mapRelation('relation.h-deploy', 'deployed-on', CENTER, CLI), mapRelation('relation.i-mount', 'mounts', HOST, 'mount.cache')] });
    expect(layoutTopology(map, runtimePlacement(map)).edges.map(edge => [edge.source, edge.target, edge.kind])).toContainEqual([HOST, 'mount.cache', 'mounts']);
    await mount(workspace({ readMap: reader(map) }));
    await tab('topology');
    // In happy-dom React Flow draws no edge, so the handles that the namespace edge routes through stand for it.
    expect([...document.querySelectorAll(`.react-flow__node[data-id="${HOST}"] .react-flow__handle`)].map(item => item.classList.contains('source') ? 'source' : 'target').sort()).toEqual(['source', 'target']);
    const members = [...document.querySelectorAll('.react-flow__node-member')].map(item => item.getAttribute('data-id'));
    expect(members.sort()).toEqual([`${CLI}/${CENTER}`, `${SERVER}/${CENTER}`]);
    for (const process of [SERVER, CLI]) {
      await click(`.react-flow__node[data-id="${process}/${CENTER}"]`);
      expect([inspector().getAttribute('data-node-id'), document.querySelectorAll('.architecture-topology__member[data-selected]').length]).toEqual([CENTER, 2]);
      expect(inspector().querySelector('[data-runtime]')).toBeNull();
    }
  });
});

describe('workspace navigation', () => {
  const repositoryId = stableSnapshot.repositories[0]!.repository_id;
  function app(): ReactElement {
    return <OperatorApp initialSnapshot={stableSnapshot} initialLocale="en" initialRepositorySnapshot={{ kind: 'ready', snapshot: repositorySnapshot }}
      readNotifyStatus={() => new Promise(() => {})} />;
  }
  const link = (workspace: string) => document.querySelector<HTMLAnchorElement>(`.workspace-nav a[data-workspace="${workspace}"]`)!;

  test('names Home, twelve sections in three groups and Settings at the foot, starts on Home and keeps the repository page with its three tabs', async () => {
    await mount(app());
    expect([...document.querySelectorAll('.workspace-nav a')].map(item => item.textContent)).toEqual(['Home', 'Board', 'Repositories', 'Worktrees', 'Agents', 'Skills', 'Hooks', 'CLI', 'Bots', 'Architecture', 'Tests', 'System', 'Tools', 'Settings']);
    expect([...document.querySelectorAll('.workspace-nav [id^="nav-group-"]')].map(item => item.textContent)).toEqual(['Work', 'Setup', 'Observe']);
    expect(link('home').getAttribute('aria-current')).toBe('page');
    expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe('home');
    for (const workspace of ['repositories', 'system']) {
      await act(async () => link(workspace).click());
      expect(window.location.hash).toBe(`#${workspace}`);
      expect(link(workspace).getAttribute('aria-current')).toBe('page');
      expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe(workspace);
    }
    await act(async () => {
      window.location.hash = '#repository';
      window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    });
    expect(link('repositories').getAttribute('aria-current')).toBe('page');
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(3);
    await act(async () => link('board').click());
    expect(window.location.hash).toBe('#board');
    expect(document.querySelectorAll('#view-tab-organization')).toHaveLength(0);
  });

  test('loads Architecture on demand and keeps the module in the hash when a neighbor recenters', async () => {
    respond = path => serveArchitecture(path.replace(`/repositories/${repositoryId}/`, `/repositories/${REPO}/`));
    await mount(app());
    expect(calls.some(call => call.path.includes('/architecture/'))).toBe(false);
    await act(async () => link('architecture').click());
    await settle();
    await openModules();
    expect(window.location.hash).toBe('#architecture');
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
