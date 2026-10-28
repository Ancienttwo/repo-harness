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
import { decodeArchitectureMap, projectArchitectureMap, type ArchitectureMapLayersInput, type ArchitectureMapV1 } from '../../src/core/operator/architecture-map';
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
      flows: { state: 'ok', selectors: 2, proven: 1, unproven: 1, used_unproven: 1, unprovable: [{ id: CENTER, diagnostics: 1 }] },
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
  function mapFor(available = true, layers: ArchitectureMapLayersInput = mapLayers): ArchitectureMapV1 {
    return projectArchitectureMap({
      repository_id: REPO, commit: COMMIT, collected_at: '2026-10-27T09:00:00.000Z',
      nodes: [mapNode(CENTER, 'capability'), mapNode(PART, 'component', CENTER), mapNode(CALLER, 'capability'), mapNode(EXTERNAL, 'external-system')],
      relations: [mapRelation('relation.a-own', 'calls', CENTER, PART), mapRelation('relation.b-router', 'calls', CALLER, CENTER), mapRelation('relation.c-git', 'reads', PART, EXTERNAL)],
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
      relations: [mapRelation('relation.p-runs', 'runs-in', 'process.p', 'namespace.a-b-c')],
      sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'model_worktree_dirty' }, layers: noLayers,
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

  test('the map is the default view and selecting a node lists its relations with import counts', async () => {
    const opened: (string | null)[] = [];
    await mount(workspace({ readMap: reader({ state: 'ok', map: mapFor() }), onModule: id => opened.push(id) }));
    expect(document.querySelector('#architecture-tab-map')?.getAttribute('aria-selected')).toBe('true');
    expect(calls).toEqual([]);
    const canvas = document.querySelector('.architecture-map')!;
    expect([canvas.getAttribute('data-node-count'), canvas.getAttribute('data-relation-count')]).toEqual(['4', '3']);
    expect([...document.querySelectorAll('.react-flow__node')].map(item => item.getAttribute('data-id')).sort()).toEqual([CALLER, CENTER, PART, EXTERNAL].sort());
    expect(document.querySelector(`.react-flow__node[data-id="${PART}"]`)?.textContent).toContain('900 lines');
    expect(document.querySelector('.architecture-map-view')?.textContent).toContain(COMMIT);
    expect(document.querySelectorAll('.architecture-map__gap')).toHaveLength(0);

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
    expect([...document.querySelectorAll('.architecture-map__gap')].map(item => item.getAttribute('data-reason'))).toEqual(['model_worktree_dirty', 'code_facts_other_commit']);
    expect(document.querySelector('.architecture-map__legend')?.textContent).not.toContain('imports');
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
    expect(document.querySelector('[data-layer-summary="changes"]')?.textContent).toContain('2 files changed in 1 commits');
    expect([gaps(), notes()]).toEqual([['changes.flow_steps:ref-code-facts-unavailable'], ['changes.truncated:paths']]);
    expect(document.querySelector('[data-note="changes.truncated"]')?.textContent).toBe('archctx stopped at its limits for paths; these counts are lower bounds.');
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
    expect(summary).toContain('2 files changed in 1 nodes, 1 without an owner');
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

describe('workspace navigation', () => {
  const repositoryId = stableSnapshot.repositories[0]!.repository_id;
  function app(): ReactElement {
    return <OperatorApp initialSnapshot={stableSnapshot} initialLocale="en" initialRepositorySnapshot={{ kind: 'ready', snapshot: repositorySnapshot }}
      readNotifyStatus={() => new Promise(() => {})} />;
  }
  const link = (workspace: string) => document.querySelector<HTMLAnchorElement>(`.workspace-nav a[data-workspace="${workspace}"]`)!;

  test('names Home, ten sections in three groups and Settings at the foot, starts on Home and keeps the repository page with its three tabs', async () => {
    await mount(app());
    expect([...document.querySelectorAll('.workspace-nav a')].map(item => item.textContent)).toEqual(['Home', 'Board', 'Repositories', 'Agents', 'Skills', 'Hooks', 'CLI', 'Bots', 'Architecture', 'System', 'Tools', 'Settings']);
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
