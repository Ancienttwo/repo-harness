import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, Profiler, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { moduleDetail, moduleGraph, type ModelNode, type ModelRelation, type ModuleDetailV1, type ModuleIndexV1 } from '../../src/core/architecture/module-view';
import { buildModuleReviewPrompt, type ModuleReviewPromptV1 } from '../../src/core/review/module-review-prompt';
import { OperatorApp } from '../../src/operator-web/App';
import { ArchitectureWorkspace, reviewPromptCommand } from '../../src/operator-web/ArchitectureWorkspace';
import { ModuleGraph } from '../../src/operator-web/ModuleGraph';
import { collaborationSnapshot, stableSnapshot } from '../../src/operator-web/fixture';
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
    [{ path: 'tasks/contracts/pipeline.contract.md', kind: 'contract', status: 'Active' }, { path: 'plans/pipeline.md', kind: 'plan', status: null }], 'valid');
}

function promptFor(detail: ModuleDetailV1, shard: number): ModuleReviewPromptV1 {
  return buildModuleReviewPrompt({
    detail, package_version: '0.21.0', repository_id: 'repo_0123456789abcdef', input_cap_bytes: 2048, worktree_dirty_paths: [], dirty_content_sha256: null,
    model_sha256: 'a'.repeat(64), doc_sha256: null, sources: [], source_sections: {}, module_doc_path: 'docs/architecture/modules/pipeline.md',
    base: null, head: null, diff: null,
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

function workspace(props: Partial<Parameters<typeof ArchitectureWorkspace>[0]> = {}): ReactElement {
  return <ArchitectureWorkspace repositoryId={REPO} moduleId={null} onModule={() => {}} refreshGeneration={0} t={t} {...props} />;
}

describe('architecture module list', () => {
  test('groups modules by domain and shows three separate states, with unknown explicit', async () => {
    await mount(workspace());
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
    expect(edges.map(edge => edge.getAttribute('data-direction'))).toEqual(['directed', 'directed', 'directed', 'undirected']);
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
    expect(members.map(item => item.querySelector('code')?.textContent)).toEqual(graph.nodes.flatMap(item => item.kind === 'group' ? item.members.map(member => member.id) : []));
    expect(members).toHaveLength(4);
    expect(document.querySelectorAll('.module-graph__node')).toHaveLength(shown);
    await act(async () => members[0]!.querySelector('button')!.click());
    expect(selected).toEqual([members[0]!.querySelector('code')!.textContent!]);
  });
});

describe('workspace navigation', () => {
  const repositoryId = stableSnapshot.repositories[0]!.repository_id;
  function app(): ReactElement {
    return <OperatorApp initialSnapshot={stableSnapshot} initialLocale="en" initialCollaboration={{ kind: 'ready', snapshot: collaborationSnapshot }}
      readNotifyStatus={() => new Promise(() => {})} readPipelineBoard={() => new Promise(() => {})} fetchRepositoryObservation={() => new Promise(() => {})} />;
  }
  const link = (workspace: string) => document.querySelector<HTMLAnchorElement>(`.workspace-nav a[data-workspace="${workspace}"]`)!;

  test('names four sections, starts on the Board and keeps the repository page with its three tabs', async () => {
    await mount(app());
    expect([...document.querySelectorAll('.workspace-nav a')].map(item => item.textContent)).toEqual(['Board', 'Repositories', 'Architecture', 'System']);
    expect(link('board').getAttribute('aria-current')).toBe('page');
    expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe('board');
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
