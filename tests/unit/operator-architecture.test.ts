import { describe, expect, test } from 'bun:test';
import { ArchitectureModelReader } from '../../src/effects/architecture/model-reader';
import { decodeArchitectureModuleIndex, decodeArchitectureModuleDetail, decodeArchitectureReviewPrompt } from '../../src/core/operator/architecture';
import { parseArchitectureRequest } from '../../src/core/operator/architecture';
import { MODULE_ID, MODULE_FLOW, moduleRepository, fixtureWrite, fixtureCommit } from '../helpers/module-repository';
import { rmSync } from 'node:fs';

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


test('all real module details pass including required flows, nested sinks and collapsed groups', () => {
  for (const module of reader.list().modules) expect(decodeArchitectureModuleDetail(reader.detail(module.id)).module.id).toBe(module.id);
  const collapsed = reader.detail('capability.runtime-harness.engineer-bindings');
  expect(collapsed.graph.nodes.some(node => node.kind === 'group')).toBe(true);
  const group = collapsed.graph.nodes.find(node => node.kind === 'group')!;
  expect(() => decodeArchitectureModuleDetail({ ...collapsed, graph: { ...collapsed.graph, nodes: collapsed.graph.nodes.map(node => node === group ? { ...node, count: 0 } : node) } })).toThrow('architecture_module_detail_invalid');
  const committedDiff = reader.reviewPrompt(id, { base: reader.commit, head: reader.commit });
  expect(decodeArchitectureReviewPrompt(committedDiff).mode).toBe('diff');
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
    fixtureWrite(root, MODULE_FLOW, Bun.YAML.stringify(flow)); fixtureCommit(root);
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
