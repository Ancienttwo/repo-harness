import { describe, expect, test } from 'bun:test';
import { ArchitectureModelReader } from '../../src/effects/architecture/model-reader';
import { decodeArchitectureModuleIndex, decodeArchitectureModuleDetail, decodeArchitectureReviewPrompt } from '../../src/core/operator/architecture';
import { parseArchitectureRequest } from '../../src/core/operator/architecture';
import { MODULE_ID, MODULE_NODE, MODULE_FLOW, moduleRepository, fixtureWrite, fixtureCommit, fixtureGit, fixtureYaml } from '../helpers/module-repository';
import { readFileSync, realpathSync, rmSync } from 'node:fs';
import {
  architectureModelDelta,
  architecturePullRequestsSource,
  decodeArchitectureMap,
  decodeArchitecturePullRequestsSource,
  projectArchitectureMap,
  projectTestCoverage,
  withTestCoverage,
  type ArchitectureMapLayersInput,
  type ArchitectureMapNodeV1,
  type ArchitecturePullRequestsSource,
} from '../../src/core/operator/architecture-map';
import type { DevActivitySnapshotV2 } from '../../src/core/dev-activity/types';
import type { TestsSnapshotV1 } from '../../src/core/operator/tests';
import { collectArchitectureMap, localMidnight, readCommitLineCounts, recheckCheckout, recheckLayers } from '../../src/effects/operator/architecture-map-worker';
import { join } from 'node:path';

const reader = new ArchitectureModelReader(import.meta.dir + '/../..');
const id = reader.list().modules[0].id;
const fixtures = [
  [decodeArchitectureModuleIndex, reader.list()],
  [decodeArchitectureModuleDetail, reader.detail(id)],
  [decodeArchitectureReviewPrompt, reader.reviewPrompt(id)],
] as const;

describe('operator architecture decoders', () => {
  for (const [decode, fixture] of fixtures) {
    test(`${fixture.schema_version} accepts Phase A output and rejects every missing or extra field`, () => {
      expect(decode(fixture)).toEqual(fixture);
      const visit = (value: unknown, replace: (value: unknown) => unknown): void => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) { value.forEach((item, i) => visit(item, changed => replace(value.map((v, j) => i === j ? changed : v)))); return; }
        const record = value as Record<string, unknown>;
        expect(() => decode(replace({ ...record, private_field: '/private/root' }))).toThrow();
        for (const key of Object.keys(record)) {
          const missing = { ...record }; delete missing[key];
          expect(() => decode(replace(missing))).toThrow();
          visit(record[key], changed => replace({ ...record, [key]: changed }));
        }
      };
      visit(fixture, value => value);
      for (const value of [null, [], {}, { ...fixture, commit: '--output=/tmp/out' }]) expect(() => decode(value)).toThrow();
    });
  }
  test('rejects bad prompt identity and shard range', () => {
    const packet = reader.reviewPrompt(id);
    expect(() => decodeArchitectureReviewPrompt({ ...packet, mode: 'diff' })).toThrow();
    expect(() => decodeArchitectureReviewPrompt({ ...packet, shard: { ...packet.shard, index: packet.shard.count + 1 } })).toThrow();
  });
});


test('all real module details pass including required flows and nested sinks', () => {
  for (const module of reader.list().modules) expect(decodeArchitectureModuleDetail(reader.detail(module.id)).module.id).toBe(module.id);
  const committedDiff = reader.reviewPrompt(id, { base: reader.commit, head: reader.commit });
  expect(decodeArchitectureReviewPrompt(committedDiff).mode).toBe('diff');
});

test('a committed module with nine callees collapses overflow and rejects an empty group', () => {
  const root = moduleRepository();
  try {
    const template = JSON.parse(readFileSync(join(root, MODULE_NODE), 'utf8'));
    for (let index = 0; index < 9; index++) {
      const peer = `capability.test.peer-${index}`;
      const sourcePath = `src/peer-${index}.ts`;
      fixtureWrite(root, `.archcontext/model/nodes/${peer}.yaml`, fixtureYaml({
        ...template, id: peer, name: `Peer ${index}`, source: { include: [sourcePath] },
      }));
      fixtureWrite(root, sourcePath, 'export const read = () => 1;\n');
      fixtureWrite(root, `.archcontext/model/relations/relation.module.peer-${index}.yaml`, fixtureYaml({
        schemaVersion: 'archcontext.relation/v1', id: `relation.module.peer-${index}`, kind: 'calls',
        source: MODULE_ID, target: peer, intent: 'Read peer facts.',
      }));
    }
    fixtureCommit(root);
    const collapsed = new ArchitectureModelReader(root).detail(MODULE_ID);
    expect(decodeArchitectureModuleDetail(collapsed)).toEqual(collapsed);
    expect(collapsed.graph.nodes.some(node => node.kind === 'group')).toBe(true);
    const group = collapsed.graph.nodes.find(node => node.kind === 'group')!;
    expect(group).toMatchObject({ kind: 'group', count: 1, members: [{ id: 'capability.test.peer-8', name: 'Peer 8' }] });
    expect(() => decodeArchitectureModuleDetail({ ...collapsed, graph: { ...collapsed.graph, nodes: collapsed.graph.nodes.map(node => node === group ? { ...node, count: 0 } : node) } })).toThrow('architecture_module_detail_invalid');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unsafe paths, identity, enums, hashes and numbers with explicit failure codes', () => {
  const detail = reader.detail(id), prompt = reader.reviewPrompt(id), index = reader.list();
  for (const value of ['/private/root', '../secret', 'a/../b', 'a//b', 'a/', 'a\\b', 'C:/private', 'a\u0000b']) {
    expect(() => decodeArchitectureReviewPrompt({ ...prompt, sources: [{ ...prompt.sources[0], path: value }] })).toThrow('architecture_review_prompt_invalid');
    expect(() => decodeArchitectureModuleDetail({ ...detail, linked_docs: [{ path: value, kind: 'plan', status: null }] })).toThrow('architecture_module_detail_invalid');
    expect(() => decodeArchitectureReviewPrompt({ ...prompt, worktree_dirty_paths: [value], dirty_content_sha256: 'a'.repeat(64) })).toThrow('architecture_review_prompt_invalid');
  }
  for (const value of ['A'.repeat(64), 'a'.repeat(6), '--ext-diff', null]) expect(() => decodeArchitectureReviewPrompt({ ...prompt, digest: value })).toThrow('architecture_review_prompt_invalid');
  for (const value of [-1, 1.5, '1', Infinity]) expect(() => decodeArchitectureModuleIndex({ ...index, modules: [{ ...index.modules[0], components: value }] })).toThrow('architecture_module_index_invalid');
  expect(() => decodeArchitectureReviewPrompt({ ...prompt, repository_id: '/private/repo' })).toThrow('architecture_review_prompt_invalid');
  expect(() => decodeArchitectureModuleDetail({ ...detail, state: { ...detail.state, section3: 'made-up' } })).toThrow('architecture_module_detail_invalid');
  expect(() => decodeArchitectureReviewPrompt({ ...prompt, mode: 'diff', base: '--output=file', head: prompt.commit })).toThrow('architecture_review_prompt_invalid');
});

test('request parser uses closed query fields and mode-specific full SHA inputs', () => {
  const path = '/api/v1/repositories/repo_0123456789abcdef/architecture/modules';
  expect(parseArchitectureRequest(new URL('http://localhost' + path))).toEqual({ kind: 'architecture_modules', repository_id: 'repo_0123456789abcdef' });
  expect(parseArchitectureRequest(new URL('http://localhost' + path + '/' + id + '/review-prompt?shard=1'))).toMatchObject({ kind: 'architecture_review_prompt', shard: 1 });
  expect(() => parseArchitectureRequest(new URL('http://localhost' + path + '?mode=module'))).toThrow('invalid_request');
  expect(parseArchitectureRequest(new URL('http://localhost' + path + '/bad-cap'))).toBeNull();
});


test('decodes both flow branches, linked documents and dirty content from committed fixtures', () => {
  const root = moduleRepository();
  try {
    let source = new ArchitectureModelReader(root);
    const required = source.detail(MODULE_ID);
    expect(required.flows[0].applicability).toBe('required');
    expect(decodeArchitectureModuleDetail(required).linked_docs.length).toBeGreaterThan(0);
    const step = (required.flows[0] as Extract<typeof required.flows[number], { applicability: 'required' }>).steps[0] as Record<string, unknown>;
    expect(() => decodeArchitectureModuleDetail({ ...required, flows: [{ ...required.flows[0], steps: [{ ...step, evidence: { private: 'leak' } }] }] })).toThrow('architecture_module_detail_invalid');
    const flow = { schemaVersion: 'archcontext.flow/v1', id: 'flow.module.primary', capabilityId: MODULE_ID, name: 'No external interaction', applicability: 'not-applicable', rationale: 'This module has no external calls.' };
    fixtureWrite(root, MODULE_FLOW, fixtureYaml(flow)); fixtureCommit(root);
    source = new ArchitectureModelReader(root);
    const excluded = source.detail(MODULE_ID);
    expect(decodeArchitectureModuleDetail(excluded).flows[0].applicability).toBe('not-applicable');
    expect(() => decodeArchitectureModuleDetail({ ...excluded, flows: [{ ...excluded.flows[0], participants: [] }] })).toThrow('architecture_module_detail_invalid');
    fixtureWrite(root, 'src/module/read.ts', 'dirty fixture content');
    const dirty = source.reviewPrompt(MODULE_ID);
    expect(decodeArchitectureReviewPrompt(dirty).worktree_dirty_paths).toEqual(['src/module/read.ts']);
    const unsafeEntrypoint = { ...excluded.module.entrypoints![0], path: '/private/root' };
    expect(() => decodeArchitectureModuleDetail({ ...excluded, module: { ...excluded.module, entrypoints: [unsafeEntrypoint] } })).toThrow('architecture_module_detail_invalid');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { containsSecret } from '../../src/core/security/secret-patterns';
test('URL credential detection keeps normal query names and empty values safe', () => {
  for (const query of ['token=fake', 'key=fake', 'auth=fake', 'code=fake', 'sig=fake', 'signature=fake']) {
    expect(containsSecret('https://example.invalid/?' + query)).toBe(true);
  }
  for (const query of ['page=1', 'token=', 'monkey=fake', 'code_format=json', 'authorship=public']) {
    expect(containsSecret('https://example.invalid/?' + query)).toBe(false);
  }
  expect(containsSecret('tokens: null')).toBe(false);
});


test('accepts new model node kinds and reserves group for aggregate nodes', () => {
  const detail = reader.detail(id);
  const withKind = (kind: unknown) => ({ ...detail, graph: { ...detail.graph, nodes: detail.graph.nodes.map(node => node.id === id ? { ...node, kind } : node) } });
  expect(decodeArchitectureModuleDetail(withKind('future-node-kind')).graph.nodes.find(node => node.id === id)?.kind).toBe('future-node-kind');
  for (const kind of ['', 'group', null, 7]) expect(() => decodeArchitectureModuleDetail(withKind(kind))).toThrow('architecture_module_detail_invalid');
});

describe('architecture map', () => {
  const CAP = 'capability.pipeline.ledger';
  const PART = 'component.pipeline.store';
  const OTHER = 'capability.review.gate';
  const mapNode = (nodeId: string, kind: string, parent: string | null = null): ArchitectureMapNodeV1 =>
    ({ id: nodeId, kind, name: nodeId, status: 'active', layer: 'core', parent, summary: `${nodeId} summary` });
  const layers: ArchitectureMapLayersInput = {
    changes: {
      state: 'ok', since: '2026-10-27T00:00:00.000Z', base: 'b'.repeat(40), commits: 2,
      files: new Map([['src/store.ts', { added: 3, deleted: 1 }], ['src/ledger.ts', { added: 1, deleted: 0 }], ['README.md', { added: 2, deleted: 2 }]]),
      owners: new Map<string, string | null>([['src/store.ts', PART], ['src/ledger.ts', CAP], ['README.md', null]]),
      model: { state: 'ok', nodes_added: [PART], nodes_removed: ['component.pipeline.gone'], nodes_changed: [], relations_added: ['relation.a'], relations_removed: [], relations_changed: [] },
    },
    pull_requests: {
      state: 'ok', observed_at: '2026-10-27T08:59:00.000Z',
      pull_requests: [
        { number: 7, title: 'Store rows', url: 'https://github.com/acme/widgets/pull/7', head_sha: 'e'.repeat(40), changed_files: { state: 'ok', paths: ['README.md', 'src/store.ts'] } },
        { number: 8, title: 'Big change', url: 'https://github.com/acme/widgets/pull/8', head_sha: 'f'.repeat(40), changed_files: { state: 'unavailable', reason: 'files_truncated' } },
        { number: 9, title: 'No head', url: 'https://github.com/acme/widgets/pull/9', head_sha: null, changed_files: { state: 'ok', paths: ['src/ledger.ts'] } },
      ],
      owners: new Map<string, string | null>([['README.md', null], ['src/store.ts', PART]]),
    },
    violations: {
      debt: { state: 'ok', items: [{ kind: 'unowned-path', nodes: [], paths: ['src/orphan.ts'] }, { kind: 'ambiguous-owner', nodes: [CAP, OTHER], paths: ['docs/shared.md'] }] },
      anchors: { state: 'ok', citations: 5, nodes: [{ id: CAP, findings: 2 }] },
      dependencies: { state: 'ok', edges: [{ source: OTHER, target: CAP, imports: 2 }] },
    },
    tests: { state: 'unavailable', reason: 'tests_pending' },
  };
  const input = {
    repository_id: 'repo_0123456789abcdef', commit: 'c'.repeat(40), collected_at: '2026-10-27T09:00:00.000Z', layers,
    nodes: [mapNode(OTHER, 'capability'), mapNode(PART, 'component', CAP), mapNode(CAP, 'capability')],
    relations: [{ id: 'relation.b', kind: 'calls', source: CAP, target: OTHER, intent: 'Gate.' }, { id: 'relation.a', kind: 'calls', source: CAP, target: PART, intent: 'Store.' }],
  };
  const pending: ArchitecturePullRequestsSource = { state: 'unavailable', reason: 'dev_activity_pending' };
  const projected = () => projectArchitectureMap({
    ...input,
    sizes: { state: 'ok', lines: new Map([['src/store.ts', 30], ['src/ledger.ts', 12], ['README.md', 5], ['src/gate.ts', 0]]),
      owners: new Map<string, string | null>([['src/store.ts', PART], ['src/ledger.ts', CAP], ['README.md', null], ['src/gate.ts', OTHER]]) },
    dependencies: { state: 'ok', matrix: [{ from: CAP, to: OTHER, imports: 4 }, { from: OTHER, to: CAP, imports: 0 }, { from: CAP, to: CAP, imports: 9 }] },
  });

  test('a file counts for its owner and every ancestor; unowned files, self imports and zero counts are left out', () => {
    const map = projected();
    expect(map.sizes).toEqual({ state: 'ok', nodes: [{ id: CAP, files: 2, lines: 42 }, { id: OTHER, files: 1, lines: 0 }, { id: PART, files: 1, lines: 30 }] });
    expect(map.dependencies).toEqual({ state: 'ok', edges: [{ source: CAP, target: OTHER, imports: 4 }] });
    expect(map.nodes.map(entry => entry.id)).toEqual([CAP, OTHER, PART]);
    expect(map.relations.map(entry => entry.id)).toEqual(['relation.a', 'relation.b']);
    expect(decodeArchitectureMap(JSON.parse(JSON.stringify(map)))).toEqual(map);
  });

  test('an owner the model does not name fails the projection; an unavailable source passes through with its reason', () => {
    expect(() => projectArchitectureMap({ ...input, sizes: { state: 'ok', lines: new Map([['src/x.ts', 1]]), owners: new Map([['src/x.ts', 'capability.gone.node']]) },
      dependencies: { state: 'unavailable', reason: 'code_facts_unavailable' } })).toThrow('architecture_map_invalid');
    const map = projectArchitectureMap({ ...input, sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'code_facts_other_commit' } });
    expect([map.sizes, map.dependencies]).toEqual([{ state: 'unavailable', reason: 'model_worktree_dirty' }, { state: 'unavailable', reason: 'code_facts_other_commit' }]);
  });

  test('the decoder refuses extra fields, broken references and imports that do not join two capabilities', () => {
    const map = JSON.parse(JSON.stringify(projected()));
    const refused = (change: (copy: typeof map) => void) => {
      const copy = JSON.parse(JSON.stringify(map));
      change(copy);
      expect(() => decodeArchitectureMap(copy)).toThrow('architecture_map_invalid');
    };
    refused(copy => { copy.extra = 1; });
    refused(copy => { copy.nodes[0].path = '/Users/someone/repo'; });
    refused(copy => { copy.nodes.push(copy.nodes[0]); });
    refused(copy => { copy.nodes[2].parent = 'capability.gone.node'; });
    refused(copy => { copy.nodes[0].parent = PART; });
    refused(copy => { copy.nodes[1].summary = 'Reads /opt/company/private.env'; });
    refused(copy => { copy.nodes[1].name = 'C:\\Users\\someone\\secret'; });
    refused(copy => { copy.relations[0].intent = 'Write [/home/someone/.ssh/key]'; });
    refused(copy => { copy.relations[0].target = 'capability.gone.node'; });
    refused(copy => { copy.sizes.nodes[0].id = 'capability.gone.node'; });
    refused(copy => { copy.sizes.nodes[0].files = 0; });
    refused(copy => { copy.dependencies.edges[0].target = PART; });
    refused(copy => { copy.dependencies.edges[0].target = CAP; });
    refused(copy => { copy.dependencies = { state: 'unavailable', reason: 'stale' }; });
    refused(copy => { copy.commit = 'HEAD'; });
  });

  test('model prose never carries an absolute path, and a dirty source tree withholds import counts', () => {
    const root = realpathSync(moduleRepository());
    try {
      const nodeText = readFileSync(join(root, MODULE_NODE), 'utf8');
      expect(nodeText).toContain('Read a committed module.');
      fixtureWrite(root, MODULE_NODE, nodeText.replace('Read a committed module.', 'Reads /opt/company/private.env'));
      fixtureCommit(root);
      const result = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T09:00:00.000Z', '2026-10-27T00:00:00.000Z', pending);
      if (!result.ok) throw new Error('worker failed');
      expect(result.snapshot.nodes.find(entry => entry.id === MODULE_ID)?.summary).toBe('Reads [private path]');
      expect(JSON.stringify(result.snapshot)).not.toContain('/opt/');
      expect(result.snapshot.dependencies).toEqual({ state: 'unavailable', reason: 'code_facts_unavailable' });
      // The CodeGraph index covers the working tree, so an uncommitted source edit withholds import counts; line counts stay.
      fixtureWrite(root, 'src/module/read.ts', 'export const read = () => 2;\nexport const more = 1;\n');
      const edited = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T09:00:00.000Z', '2026-10-27T00:00:00.000Z', pending);
      expect(edited.ok && [edited.snapshot.sizes.state, edited.snapshot.dependencies]).toEqual(['ok', { state: 'unavailable', reason: 'code_facts_worktree_dirty' }]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('a checkout or edit between the two checks of a cycle drops the counts it can reach', () => {
    const commit = 'c'.repeat(40);
    const clean = { head: commit, modelClean: true, treeClean: true };
    const read = { sizes: { state: 'ok', lines: new Map(), owners: new Map() }, dependencies: { state: 'ok', matrix: [] } } as const;
    const changed = { state: 'unavailable', reason: 'checkout_changed' } as const;
    expect(recheckCheckout(commit, clean, clean, read)).toEqual(read);
    expect(recheckCheckout(commit, clean, { ...clean, head: 'd'.repeat(40) }, read)).toEqual({ sizes: changed, dependencies: changed });
    expect(recheckCheckout(commit, { ...clean, head: null }, clean, read)).toEqual({ sizes: changed, dependencies: changed });
    expect(recheckCheckout(commit, clean, { ...clean, modelClean: false, treeClean: false }, read)).toEqual({ sizes: changed, dependencies: changed });
    expect(recheckCheckout(commit, clean, { ...clean, treeClean: false }, read)).toEqual({ sizes: read.sizes, dependencies: changed });
    expect(recheckCheckout(commit, clean, { ...clean, treeClean: null }, read)).toEqual({ sizes: read.sizes, dependencies: changed });
    // An unavailable source keeps its own reason.
    const dirty = { sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'code_facts_worktree_dirty' } } as const;
    expect(recheckCheckout(commit, clean, { ...clean, head: 'd'.repeat(40) }, dirty)).toEqual(dirty);
  });

  test('the worker maps a committed model with git line counts, and imports fail closed without a CodeGraph index', () => {
    const root = realpathSync(moduleRepository());
    try {
      const commit = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
      expect(readCommitLineCounts(root, commit)?.get('src/module/read.ts')).toBe(1);
      const result = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T09:00:00.000Z', '2026-10-27T00:00:00.000Z', pending);
      if (!result.ok) throw new Error('worker failed');
      const map = result.snapshot;
      expect(map.commit).toBe(commit);
      expect(map.nodes.map(entry => [entry.id, entry.parent])).toEqual([[MODULE_ID, null], ['component.module.core', MODULE_ID]]);
      expect(map.relations.map(entry => entry.id)).toEqual(['relation.module.core']);
      expect(map.sizes).toEqual({ state: 'ok', nodes: [{ id: MODULE_ID, files: 2, lines: 2 }] });
      expect(map.dependencies.state).toBe('unavailable');
      expect(JSON.stringify(map)).not.toContain(root);
      // `archctx resolve` reads the worktree model, so an edited model hides the line counts.
      fixtureWrite(root, '.archcontext/model/nodes/component.module.extra.yaml', fixtureYaml({ schemaVersion: 'archcontext.node/v2', id: 'component.module.extra', kind: 'component', name: 'Extra', status: 'active', summary: 'Extra.', parent: MODULE_ID }));
      const dirty = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T09:00:00.000Z', '2026-10-27T00:00:00.000Z', pending);
      expect(dirty.ok && [dirty.snapshot.sizes, dirty.snapshot.dependencies]).toEqual([
        { state: 'unavailable', reason: 'model_worktree_dirty' }, { state: 'unavailable', reason: 'model_worktree_dirty' }]);
      expect(dirty.ok && [dirty.snapshot.layers.changes, dirty.snapshot.layers.violations.debt]).toEqual([
        { state: 'unavailable', reason: 'model_worktree_dirty' }, { state: 'unavailable', reason: 'model_worktree_dirty' }]);
      // A PR source passes through with its own reason; the PR owners would read the edited model, so a ready source is withheld.
      expect(dirty.ok && dirty.snapshot.layers.pull_requests).toEqual({ state: 'unavailable', reason: 'dev_activity_pending' });
      const dirtyPrs = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T09:00:00.000Z', '2026-10-27T00:00:00.000Z',
        { state: 'ok', observed_at: '2026-10-27T08:59:00.000Z', pull_requests: [] });
      expect(dirtyPrs.ok && dirtyPrs.snapshot.layers.pull_requests).toEqual({ state: 'unavailable', reason: 'model_worktree_dirty' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('today\'s changes sum along the parent chain, the model delta compares entities by id, and an unknown owner drops only that layer', () => {
    const map = projected();
    expect(map.layers.changes).toEqual({
      state: 'ok', since: '2026-10-27T00:00:00.000Z', base: 'b'.repeat(40), commits: 2, files: 3, unowned_files: 1,
      nodes: [{ id: CAP, files: 2, added: 4, deleted: 1 }, { id: PART, files: 1, added: 3, deleted: 1 }],
      model: (layers.changes as Extract<ArchitectureMapLayersInput['changes'], { state: 'ok' }>).model,
      flow_steps: { state: 'unavailable', reason: 'change_impact_not_exported' },
    });
    // Parts with no read-only source in archctx 0.9.3 or on main carry a fixed reason.
    expect([map.layers.decisions, map.layers.violations.flows, map.layers.violations.layer_direction]).toEqual([
      { state: 'unavailable', reason: 'decisions_not_exported' },
      { state: 'unavailable', reason: 'flows_check_writes_index' }, { state: 'unavailable', reason: 'layer_order_not_released' }]);
    // archctx may report a stale anchor with no path; that is a valid debt item, not a broken map.
    const anchorOnly = projectArchitectureMap({ ...input, sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'model_worktree_dirty' },
      layers: { ...layers, violations: { ...layers.violations, debt: { state: 'ok', items: [{ kind: 'stale-anchor', nodes: [PART], paths: [] }] } } } });
    expect(anchorOnly.layers.violations.debt).toEqual({ state: 'ok', items: [{ kind: 'stale-anchor', nodes: [PART], paths: [] }] });
    expect(architectureModelDelta(
      { nodes: [{ id: 'a', summary: 'one' }, { id: 'b' }], relations: [{ id: 'r', intent: 'x' }] },
      { nodes: [{ id: 'a', summary: 'two' }, { id: 'c' }], relations: [{ id: 'r', intent: 'x' }] },
    )).toEqual({ nodes_added: ['c'], nodes_removed: ['b'], nodes_changed: ['a'], relations_added: [], relations_removed: [], relations_changed: [] });
    const changes = layers.changes.state === 'ok' ? layers.changes : null;
    const unknown = projectArchitectureMap({
      ...input, sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'model_worktree_dirty' },
      layers: { ...layers, changes: { ...changes!, owners: new Map([['src/store.ts', 'capability.gone.node']]) } },
    });
    expect(unknown.layers.changes).toEqual({ state: 'unavailable', reason: 'ownership_unavailable' });
    expect(unknown.layers.violations.debt.state).toBe('ok');
  });

  test('test coverage counts each projected file once per capability by its daily result', () => {
    const file = (name: string, capabilities: string[]) => ({ file: `tests/${name}.test.ts`, capabilities: capabilities.map(capability => ({ id: capability, via: ['import' as const] })), command: `bun run test:files tests/${name}.test.ts --timeout 60000 --max-concurrency 1` });
    const cases = (...results: ('passed' | 'failed' | 'skipped')[]) => results.map((result, index) => ({ suite: null, name: `case ${index}`, result, duration_ms: 1 }));
    const snapshot: TestsSnapshotV1 = {
      protocol: 1, kind: 'operator_tests', repository_id: 'repo_0123456789abcdef', collected_at: '2026-10-27T09:00:00.000Z',
      run: { id: 41, attempt: 1, head_sha: 'd'.repeat(40), created_at: '2026-10-27T03:00:00Z', conclusion: 'failure', channel: 'daily_full' },
      projection: { state: 'ok', files: [file('both', [CAP, OTHER]), file('pass', [CAP]), file('skip', [CAP]), file('missing', [CAP])] },
      results: { state: 'ok', files: [
        { file: 'tests/both.test.ts', duration_ms: 3, cases: cases('passed', 'failed') },
        { file: 'tests/pass.test.ts', duration_ms: 1, cases: cases('passed', 'skipped') },
        { file: 'tests/skip.test.ts', duration_ms: 1, cases: cases('skipped') },
      ] },
      repairs: { state: 'unavailable', reason: 'repairs_unavailable' },
    };
    const nodes = projected().nodes;
    const run = { id: 41, head_sha: 'd'.repeat(40), created_at: '2026-10-27T03:00:00Z' };
    expect(projectTestCoverage(nodes, { state: 'ready', snapshot })).toEqual({ state: 'ok', run, results: 'ok', capabilities: [
      { id: CAP, files: 4, passed: 1, failed: 1, skipped: 1, no_result: 1 }, { id: OTHER, files: 1, passed: 0, failed: 1, skipped: 0, no_result: 0 }] });
    // Without JUnit reports no file counts as passed.
    expect(projectTestCoverage(nodes, { state: 'ready', snapshot: { ...snapshot, results: { state: 'unavailable', reason: 'junit_missing' } } })).toEqual({ state: 'ok', run, results: 'junit_missing', capabilities: [
      { id: CAP, files: 4, passed: 0, failed: 0, skipped: 0, no_result: 4 }, { id: OTHER, files: 1, passed: 0, failed: 0, skipped: 0, no_result: 1 }] });
    expect(projectTestCoverage(nodes, { state: 'ready', snapshot: { ...snapshot, projection: { state: 'ok', files: [file('part', [PART])] } } })).toEqual({ state: 'unavailable', reason: 'tests_model_mismatch' });
    expect(projectTestCoverage(nodes, { state: 'ready', snapshot: { ...snapshot, projection: { state: 'unavailable', reason: 'projection_missing' } } })).toEqual({ state: 'unavailable', reason: 'projection_missing' });
    expect(projectTestCoverage(nodes, { state: 'unavailable', reason: 'no_daily_run' })).toEqual({ state: 'unavailable', reason: 'no_daily_run' });
    expect(withTestCoverage(projected(), { state: 'ready', snapshot }).layers.tests.state).toBe('ok');
  });

  test('PR impact rolls each open PR\'s files up the parent chain at its head; a PR with no head or no complete list keeps its reason', () => {
    expect(projected().layers.pull_requests).toEqual({
      state: 'ok', observed_at: '2026-10-27T08:59:00.000Z',
      pull_requests: [
        { number: 7, title: 'Store rows', url: 'https://github.com/acme/widgets/pull/7', head_sha: 'e'.repeat(40),
          impact: { state: 'ok', files: 2, unowned_files: 1, nodes: [{ id: CAP, files: 1 }, { id: PART, files: 1 }] } },
        { number: 8, title: 'Big change', url: 'https://github.com/acme/widgets/pull/8', head_sha: 'f'.repeat(40), impact: { state: 'unavailable', reason: 'files_truncated' } },
        { number: 9, title: 'No head', url: 'https://github.com/acme/widgets/pull/9', head_sha: null, impact: { state: 'unavailable', reason: 'head_missing' } },
      ],
      flow_steps: { state: 'unavailable', reason: 'change_impact_not_exported' },
    });
    const prs = layers.pull_requests.state === 'ok' ? layers.pull_requests : null;
    const unknown = projectArchitectureMap({ ...input, sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'model_worktree_dirty' },
      layers: { ...layers, pull_requests: { ...prs!, owners: new Map([['src/store.ts', 'capability.gone.node']]) } } });
    expect(unknown.layers.pull_requests).toEqual({ state: 'unavailable', reason: 'ownership_unavailable' });
    expect(unknown.layers.changes.state).toBe('ok');
  });

  test('the PR source takes only open PRs of a repository whose GitHub read is ok, and masks private paths in titles', () => {
    const REPO = 'repo_0123456789abcdef';
    const at = '2026-10-27T08:59:00.000Z';
    const pull = (number: number, state: 'open' | 'merged', title = `PR ${number}`) => ({
      number, title, url: `https://github.com/acme/widgets/pull/${number}`, state, is_draft: false, base_branch: 'main', merge_state: 'BLOCKED',
      ci: state === 'open' ? 'pending' as const : null, review: 'none' as const, updated_at: at, merged_at: state === 'merged' ? at : null, closed_at: state === 'merged' ? at : null,
      head_sha: state === 'open' ? 'a'.repeat(40) : null, changed_files: state === 'open' ? { state: 'ok' as const, paths: ['src/store.ts'] } : null,
    });
    const item = (repositoryId: string, branch: string, pr: ReturnType<typeof pull>) => ({
      id: `${repositoryId}:${branch}`, repository_id: repositoryId, branch, title: pr.title, column: 'verifying' as const, hidden: null,
      column_since: at, worktrees: [], pull_request: pr, cleanup_pending: false,
    });
    const snapshot = (github: 'ok' | 'unavailable'): DevActivitySnapshotV2 => ({
      projection_version: 'repo-harness.dev-activity.v2', status: 'ready', collected_at: at, unreadable_registrations: 0, attention: [],
      repositories: [{ repository_id: REPO, display_name: 'widgets', github: 'acme/widgets', default_branch: 'main',
        sources: [{ kind: 'github', status: github, reason: github === 'ok' ? null : 'gh_failed', observed_at: at }] }],
      items: [item(REPO, 'feat/b', pull(12, 'open', 'Read /Users/someone/notes')), item(REPO, 'feat/a', pull(11, 'open')), item(REPO, 'feat/old', pull(10, 'merged')),
        item('repo_fedcba9876543210', 'feat/x', pull(13, 'open'))],
    });
    const source = architecturePullRequestsSource(snapshot('ok'), REPO);
    expect(source).toEqual({ state: 'ok', observed_at: at, pull_requests: [
      { number: 11, title: 'PR 11', url: 'https://github.com/acme/widgets/pull/11', head_sha: 'a'.repeat(40), changed_files: { state: 'ok', paths: ['src/store.ts'] } },
      { number: 12, title: 'Read [private path]', url: 'https://github.com/acme/widgets/pull/12', head_sha: 'a'.repeat(40), changed_files: { state: 'ok', paths: ['src/store.ts'] } },
    ] });
    expect(decodeArchitecturePullRequestsSource(JSON.parse(JSON.stringify(source)))).toEqual(source);
    expect(architecturePullRequestsSource(snapshot('unavailable'), REPO)).toEqual({ state: 'unavailable', reason: 'dev_activity_unavailable' });
    expect(architecturePullRequestsSource({ ...snapshot('ok'), collected_at: null }, REPO)).toEqual({ state: 'unavailable', reason: 'dev_activity_pending' });
    expect(architecturePullRequestsSource(snapshot('ok'), 'repo_1111111111111111')).toEqual({ state: 'unavailable', reason: 'dev_activity_unavailable' });
    const bad = JSON.parse(JSON.stringify(source));
    bad.pull_requests[0].changed_files.paths = ['/Users/someone/repo/src/store.ts'];
    expect(() => decodeArchitecturePullRequestsSource(bad)).toThrow('architecture_pull_requests_invalid');
  });

  test('the decoder refuses layer facts that name unknown nodes, private or escaping paths, or inconsistent counts', () => {
    const map = JSON.parse(JSON.stringify(projected()));
    map.layers.tests = { state: 'ok', run: { id: 41, head_sha: 'd'.repeat(40), created_at: '2026-10-27T03:00:00Z' }, results: 'ok', capabilities: [{ id: CAP, files: 2, passed: 1, failed: 1, skipped: 0, no_result: 0 }] };
    expect(decodeArchitectureMap(map)).toEqual(map);
    const refused = (change: (copy: typeof map) => void) => {
      const copy = JSON.parse(JSON.stringify(map));
      change(copy);
      expect(() => decodeArchitectureMap(copy)).toThrow('architecture_map_invalid');
    };
    refused(copy => { copy.layers.extra = { state: 'unavailable', reason: 'tests_pending' }; });
    refused(copy => { copy.layers.changes.nodes[0].id = 'capability.gone.node'; });
    refused(copy => { copy.layers.changes.unowned_files = 4; });
    refused(copy => { copy.layers.changes.model.nodes_removed = [CAP]; });
    refused(copy => { copy.layers.changes.model.relations_added = ['relation.gone']; });
    refused(copy => { copy.layers.violations.debt.items[0].paths = ['/Users/someone/repo/src/orphan.ts']; });
    refused(copy => { copy.layers.violations.debt.items[0].paths = ['src/../../outside.ts']; });
    refused(copy => { copy.layers.violations.debt.items[0].kind = 'undeclared-dependency'; });
    refused(copy => { copy.layers.violations.flows = { state: 'unavailable', reason: 'code_facts_unavailable' }; });
    refused(copy => { copy.layers.violations.debt.items[1].nodes = [CAP, CAP]; });
    refused(copy => { delete copy.layers.violations.layer_direction; });
    refused(copy => { delete copy.layers.changes.flow_steps; });
    refused(copy => { copy.layers.violations.anchors.nodes[0].id = 'capability.gone.node'; });
    refused(copy => { copy.layers.violations.dependencies.edges[0].target = OTHER; });
    refused(copy => { copy.layers.tests.capabilities[0].files = 3; });
    refused(copy => { copy.layers.tests.capabilities[0].id = PART; });
    refused(copy => { copy.layers.pull_requests = { state: 'ok', pulls: [] }; });
    refused(copy => { copy.layers.pull_requests.pull_requests[1].number = 7; });
    refused(copy => { copy.layers.pull_requests.pull_requests[0].head_sha = null; });
    refused(copy => { copy.layers.pull_requests.pull_requests[1].head_sha = null; });
    refused(copy => { copy.layers.pull_requests.pull_requests[0].impact.nodes[0].id = 'capability.gone.node'; });
    refused(copy => { copy.layers.pull_requests.pull_requests[0].impact.unowned_files = 3; });
    refused(copy => { copy.layers.pull_requests.pull_requests[0].title = 'Fix /Users/someone/secret'; });
    refused(copy => { copy.layers.pull_requests.pull_requests[0].url = 'https://example.invalid/pull/7'; });
    refused(copy => { delete copy.layers.pull_requests.flow_steps; });
    refused(copy => { copy.layers.decisions = { state: 'unavailable', reason: 'code_facts_unavailable' }; });
    refused(copy => { copy.schema_version = 'repo-harness.architecture-map.v1'; });
  });

  test('a checkout or edit during a cycle drops today\'s changes when the model moved and each violation check when the tree moved', () => {
    const commit = 'c'.repeat(40);
    const clean = { head: commit, modelClean: true, treeClean: true };
    const read = { changes: layers.changes, pull_requests: layers.pull_requests, violations: layers.violations };
    const changed = { state: 'unavailable', reason: 'checkout_changed' } as const;
    const allChanged = { debt: changed, anchors: changed, dependencies: changed };
    expect(recheckLayers(commit, clean, clean, read)).toEqual(read);
    expect(recheckLayers(commit, clean, { ...clean, head: 'd'.repeat(40) }, read)).toEqual({ changes: changed, pull_requests: changed, violations: allChanged });
    expect(recheckLayers(commit, clean, { ...clean, treeClean: false }, read)).toEqual({ changes: read.changes, pull_requests: read.pull_requests, violations: allChanged });
    expect(recheckLayers(commit, clean, { ...clean, modelClean: false, treeClean: false }, read)).toEqual({ changes: changed, pull_requests: changed, violations: allChanged });
    expect(localMidnight(new Date(2026, 9, 27, 18, 30))).toBe(new Date(2026, 9, 27).toISOString());
  });

  test('the worker reads today\'s first-parent changes with their owners and the model delta against the base commit', () => {
    const root = realpathSync(moduleRepository());
    const dated = (date: string, step: () => void) => {
      process.env.GIT_AUTHOR_DATE = date;
      process.env.GIT_COMMITTER_DATE = date;
      try { step(); } finally { delete process.env.GIT_AUTHOR_DATE; delete process.env.GIT_COMMITTER_DATE; }
    };
    try {
      dated('2026-10-20T00:00:00Z', () => fixtureGit(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--amend', '--no-edit', '--quiet']));
      const base = fixtureGit(root, ['rev-parse', 'HEAD']);
      dated('2026-10-27T12:00:00Z', () => {
        fixtureWrite(root, MODULE_NODE, readFileSync(join(root, MODULE_NODE), 'utf8').replace('Read a committed module.', 'Read a module.'));
        fixtureWrite(root, 'src/module/read.ts', 'export const read = () => 2;\nexport const more = 1;\n');
        fixtureCommit(root);
      });
      const head = 'a'.repeat(40);
      const source: ArchitecturePullRequestsSource = { state: 'ok', observed_at: '2026-10-27T12:59:00.000Z', pull_requests: [
        { number: 5, title: 'Read more', url: 'https://github.com/acme/module/pull/5', head_sha: head, changed_files: { state: 'ok', paths: ['docs/notes.md', 'src/module/read.ts'] } }] };
      const result = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T13:00:00.000Z', '2026-10-27T00:00:00.000Z', source);
      if (!result.ok) throw new Error('worker failed');
      expect(result.snapshot.layers.pull_requests).toEqual({ state: 'ok', observed_at: '2026-10-27T12:59:00.000Z', pull_requests: [
        { number: 5, title: 'Read more', url: 'https://github.com/acme/module/pull/5', head_sha: head, impact: { state: 'ok', files: 2, unowned_files: 1, nodes: [{ id: MODULE_ID, files: 1 }] } }],
        flow_steps: { state: 'unavailable', reason: 'change_impact_not_exported' } });
      expect(result.snapshot.layers.changes).toEqual({
        state: 'ok', since: '2026-10-27T00:00:00.000Z', base, commits: 1, files: 2, unowned_files: 1,
        nodes: [{ id: MODULE_ID, files: 1, added: 2, deleted: 1 }],
        model: { state: 'ok', nodes_added: [], nodes_removed: [], nodes_changed: [MODULE_ID], relations_added: [], relations_removed: [], relations_changed: [] },
        flow_steps: { state: 'unavailable', reason: 'change_impact_not_exported' },
      });
      // The fixture has no CodeGraph index: each check that reads it says so; nothing is filled in, and no check syncs an index.
      expect(result.snapshot.layers.violations.anchors).toEqual({ state: 'unavailable', reason: 'code_facts_unavailable' });
      expect(result.snapshot.layers.violations.flows).toEqual({ state: 'unavailable', reason: 'flows_check_writes_index' });
      expect(result.snapshot.layers.violations.dependencies).toEqual({ state: 'unavailable', reason: 'code_facts_unavailable' });
      // A window that holds the whole history has no base commit.
      const all = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T13:00:00.000Z', '2026-10-19T00:00:00.000Z', pending);
      expect(all.ok && all.snapshot.layers.changes).toEqual({ state: 'unavailable', reason: 'history_starts_today' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
