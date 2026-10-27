import { describe, expect, test } from 'bun:test';
import { ArchitectureModelReader } from '../../src/effects/architecture/model-reader';
import { decodeArchitectureModuleIndex, decodeArchitectureModuleDetail, decodeArchitectureReviewPrompt } from '../../src/core/operator/architecture';
import { parseArchitectureRequest } from '../../src/core/operator/architecture';
import { MODULE_ID, MODULE_NODE, MODULE_FLOW, moduleRepository, fixtureWrite, fixtureCommit, fixtureGit, fixtureYaml } from '../helpers/module-repository';
import { readFileSync, realpathSync, rmSync } from 'node:fs';
import { decodeArchitectureMap, projectArchitectureMap, type ArchitectureMapNodeV1 } from '../../src/core/operator/architecture-map';
import { collectArchitectureMap, readCommitLineCounts } from '../../src/effects/operator/architecture-map-worker';
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
  const input = {
    repository_id: 'repo_0123456789abcdef', commit: 'c'.repeat(40), collected_at: '2026-10-27T09:00:00.000Z',
    nodes: [mapNode(OTHER, 'capability'), mapNode(PART, 'component', CAP), mapNode(CAP, 'capability')],
    relations: [{ id: 'relation.b', kind: 'calls', source: CAP, target: OTHER, intent: 'Gate.' }, { id: 'relation.a', kind: 'calls', source: CAP, target: PART, intent: 'Store.' }],
  };
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
    refused(copy => { copy.relations[0].target = 'capability.gone.node'; });
    refused(copy => { copy.sizes.nodes[0].id = 'capability.gone.node'; });
    refused(copy => { copy.sizes.nodes[0].files = 0; });
    refused(copy => { copy.dependencies.edges[0].target = PART; });
    refused(copy => { copy.dependencies.edges[0].target = CAP; });
    refused(copy => { copy.dependencies = { state: 'unavailable', reason: 'stale' }; });
    refused(copy => { copy.commit = 'HEAD'; });
  });

  test('the worker maps a committed model with git line counts, and imports fail closed without a CodeGraph index', () => {
    const root = realpathSync(moduleRepository());
    try {
      const commit = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
      expect(readCommitLineCounts(root, commit)?.get('src/module/read.ts')).toBe(1);
      const result = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T09:00:00.000Z');
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
      const dirty = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T09:00:00.000Z');
      expect(dirty.ok && [dirty.snapshot.sizes, dirty.snapshot.dependencies]).toEqual([
        { state: 'unavailable', reason: 'model_worktree_dirty' }, { state: 'unavailable', reason: 'model_worktree_dirty' }]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
