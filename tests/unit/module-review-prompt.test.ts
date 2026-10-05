import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ArchitectureModelReader } from '../../src/effects/architecture/model-reader';
import { moduleGraph, section3FromMarkdown, type ModelNode } from '../../src/core/architecture/module-view';
import { sha256 } from '../../src/core/review/module-review-prompt';
import type { JsonValue } from '../../src/core/evidence/types';
import { canonicalize } from '../../src/core/evidence/canonical-json';
import { containsSecret } from '../../src/core/security/secret-patterns';
import { MODULE_DOC, MODULE_FLOW, MODULE_ID, fixtureCommit, fixtureGit, fixtureWrite, moduleRepository } from '../helpers/module-repository';

const roots: string[] = [];
function repo(options: Parameters<typeof moduleRepository>[0] = {}): string { const root = moduleRepository(options); roots.push(root); return root; }
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });

describe('committed module review prompt', () => {
  test('reads schema-valid facts, real flow evidence, section 3 and document metadata deterministically', () => {
    const root = repo();
    const first = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID);
    const second = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID);
    expect(second).toEqual(first);
    expect(first.schema_version).toBe('repo-harness.module-review-prompt.v1');
    expect(first.prompt).toContain('sourceSymbol'); expect(first.prompt).toContain('Keep one model authority.');
    expect(first.prompt).not.toContain('Private plan body'); expect(first.prompt).not.toContain('Not part of section 3.');
    expect(first.prompt).not.toContain(root); expect(first.worktree_dirty_paths).toEqual([]); expect(first.dirty_content_sha256).toBeNull();
    expect(new ArchitectureModelReader(root).list().modules[0].state).toEqual({ model_valid: 'valid', generated_summary: 'unknown', section3: 'present' });
    const { shard, prompt, digest, ...metadata } = first;
    // JSON round trip gives the canonicalizer its JSON-value input contract.
    expect(digest).toBe(sha256(canonicalize(JSON.parse(JSON.stringify(metadata)) as JsonValue)));
    expect(shard.bytes).toBe(Buffer.byteLength(prompt));
  });
  test('fails on a missing capability; missing module doc and empty section 3 are pending', () => {
    const root = repo({ section3: '' });
    expect(() => new ArchitectureModelReader(root).reviewPrompt('capability.test.missing')).toThrow('capability_not_found');
    expect(new ArchitectureModelReader(root).reviewPrompt(MODULE_ID).prompt).toContain('§3 pending');
    fixtureGit(root, ['rm', MODULE_DOC]); fixtureCommit(root);
    const prompt = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID);
    expect(prompt.doc_sha256).toBeNull(); expect(prompt.prompt).toContain('§3 pending');
  });
  test('keeps dirty bytes out of prompt content and changes digest on same-path edits', () => {
    const root = repo(), clean = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID);
    fixtureWrite(root, MODULE_DOC, 'Dirty human content.\n'); fixtureWrite(root, 'src/module/new.ts', 'first');
    const dirty = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID);
    expect(dirty.worktree_dirty_paths).toEqual([MODULE_DOC, 'src/module/new.ts']);
    expect(dirty.prompt).toContain('Keep one model authority.'); expect(dirty.prompt).not.toContain('Dirty human content.');
    expect(dirty.digest).not.toBe(clean.digest); expect(dirty.dirty_content_sha256).not.toBeNull();
    fixtureWrite(root, 'src/module/new.ts', 'second');
    const next = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID);
    expect(next.worktree_dirty_paths).toEqual(dirty.worktree_dirty_paths); expect(next.digest).not.toBe(dirty.digest);
  });
  test('oversize UTF-8 content is complete across bounded shards with one digest and instructions only at the end', () => {
    const root = repo({ section3: '决策🙂'.repeat(5000), budget: 2000 }), reader = new ArchitectureModelReader(root);
    const first = reader.reviewPrompt(MODULE_ID), packets = Array.from({ length: first.shard.count }, (_, index) => reader.reviewPrompt(MODULE_ID, { shard: index + 1 }));
    expect(first.budget.incomplete).toBe(true); expect(first.budget.omitted_sections).toContain('section3');
    expect(packets.length).toBeGreaterThan(1);
    let full = '';
    for (const packet of packets) {
      expect(packet.digest).toBe(first.digest); expect(packet.budget).toEqual(first.budget);
      expect(packet.shard.bytes).toBeLessThanOrEqual(2000);
      expect(packet.prompt).toContain(`shard ${packet.shard.index}/${packets.length}`);
      const body = packet.prompt.slice(packet.prompt.indexOf('\n\n') + 2); full += body;
      if (packet.shard.index !== packets.length) expect(body).not.toContain('REVIEW INSTRUCTIONS');
    }
    expect(sha256(full)).toBe(first.full_prompt_sha256); expect(full).toContain('决策🙂'.repeat(5000));
    expect(first.budget.used_bytes).toBe(packets.reduce((bytes, packet) => bytes + packet.shard.bytes, 0));
    expect(() => reader.reviewPrompt(MODULE_ID, { shard: packets.length + 1 })).toThrow('shard_out_of_range');
  });
  test('every multi-shard boundary lists deferred sections, including instructions', () => {
    const root = repo({ section3: 'x'.repeat(560), budget: 2000 });
    const reader = new ArchitectureModelReader(root), first = reader.reviewPrompt(MODULE_ID);
    expect(first.shard.count).toBeGreaterThan(1);
    expect(first.budget.omitted_sections.length).toBeGreaterThan(0);
    expect(first.budget.omitted_sections).toContain('review_instructions');
    const last = reader.reviewPrompt(MODULE_ID, { shard: first.shard.count });
    expect(last.prompt).toContain('REVIEW INSTRUCTIONS'); expect(last.shard.bytes).toBeLessThanOrEqual(2000);
  });
  test('handles quoted UTF-8 dirty paths as content observations', () => {
    const root = repo(); fixtureWrite(root, 'src/module/新 文件.ts', 'new source');
    const prompt = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID);
    expect(prompt.worktree_dirty_paths).toEqual(['src/module/新 文件.ts']); expect(prompt.dirty_content_sha256).not.toBeNull();
  });
  test('rejects traversal, absolute includes and committed or worktree symlinks', () => {
    for (const include of ['../outside/**', '/tmp/outside/**']) expect(() => new ArchitectureModelReader(repo({ include }))).toThrow();
    const root = repo(); rmSync(join(root, 'src/module/read.ts')); symlinkSync('/tmp', join(root, 'src/module/read.ts'));
    expect(() => new ArchitectureModelReader(root)).toThrow('path_escape'); fixtureCommit(root);
    expect(() => new ArchitectureModelReader(root)).toThrow('path_escape');
  });
  test('rejects secrets in committed section 3 and diff but accepts tokens: null', () => {
    for (const section3 of ['sk-'+ 'A'.repeat(25), 'https://hooks.slack.com/services/TTEST/BTEST/fake-secret', 'https://user:pass@example.invalid/db']) {
      expect(() => new ArchitectureModelReader(repo({ section3 })).reviewPrompt(MODULE_ID)).toThrow('secret_detected');
    }
    const root = repo({ section3: 'tokens: null\nTOKEN: null\nSECRET: none\nPASSWORD: ""' });
    const reader = new ArchitectureModelReader(root), base = reader.commit;
    expect(reader.reviewPrompt(MODULE_ID).prompt).toContain('tokens: null');
    fixtureWrite(root, 'src/module/read.ts', '// ghp_'+'A'.repeat(25)); const head = fixtureCommit(root);
    expect(() => new ArchitectureModelReader(root).reviewPrompt(MODULE_ID, { base, head })).toThrow('secret_detected');
  });
  test('requires both diff refs and rejects option injection without creating an output file', () => {
    const root = repo(), reader = new ArchitectureModelReader(root);
    expect(() => reader.reviewPrompt(MODULE_ID, { base: 'HEAD' })).toThrow('diff_refs_required');
    expect(() => reader.reviewPrompt(MODULE_ID, { head: 'HEAD' })).toThrow('diff_refs_required');
    expect(() => reader.reviewPrompt(MODULE_ID, { base: 'HEAD', head: '--output=/tmp/rh-must-not-write' })).toThrow('revision_invalid');
    const packet = reader.reviewPrompt(MODULE_ID, { base: 'HEAD', head: 'HEAD' });
    expect(packet.mode).toBe('diff'); expect(packet.base).toBe(reader.commit); expect(packet.head).toBe(reader.commit);
  });
  test('shows invalid schema status and refuses to publish rejected flows', () => {
    const root = repo();
    const flow = Bun.YAML.parse(readFileSync(join(root, MODULE_FLOW), 'utf8')) as { id: string };
    flow.id = 'flow.Module.primary'; fixtureWrite(root, MODULE_FLOW, Bun.YAML.stringify(flow)); fixtureCommit(root);
    expect(new ArchitectureModelReader(root).list().modules[0].state.model_valid).toBe('invalid');
    expect(() => new ArchitectureModelReader(root).reviewPrompt(MODULE_ID)).toThrow(`model_invalid: ${MODULE_FLOW}`);
  });
  test('accepts first-segment hyphens from the published 0.6.2 flow schema', () => {
    const capabilityId = 'capability.test-suite.module';
    const flowId = 'flow.module-name.primary';
    const root = repo({ capabilityId, flowId }), reader = new ArchitectureModelReader(root);
    expect(reader.list().modules[0].state.model_valid).toBe('valid');
    expect(reader.detail(capabilityId).flows[0].id).toBe(flowId);
    const prompt = reader.reviewPrompt(capabilityId);
    expect(prompt.capability_id).toBe(capabilityId);
    expect(prompt.prompt).toContain(flowId);
    expect(new ArchitectureModelReader(root).reviewPrompt(capabilityId).digest).toBe(prompt.digest);
  });
  test('reads the schema-valid not-applicable flow branch and its reason', () => {
    const root = repo();
    fixtureWrite(root, MODULE_FLOW, Bun.YAML.stringify({ schemaVersion: 'archcontext.flow/v1', id: 'flow.module.primary',
      capabilityId: MODULE_ID, name: 'Optional flow', applicability: 'not-applicable', rationale: 'This module has no runtime flow.' }));
    fixtureCommit(root);
    const reader = new ArchitectureModelReader(root);
    expect(reader.list().modules[0].state.model_valid).toBe('valid');
    expect(reader.detail(MODULE_ID).flows).toEqual([{ id: 'flow.module.primary', capabilityId: MODULE_ID, name: 'Optional flow',
      applicability: 'not-applicable', rationale: 'This module has no runtime flow.' }]);
    expect(reader.reviewPrompt(MODULE_ID).prompt).toContain('This module has no runtime flow.');
  });
  test('refreshes HEAD and manifest budget in each new reader', () => {
    const root = repo(), before = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID);
    fixtureWrite(root, MODULE_DOC, '## 3. Decisions\nNew committed decision.\n');
    fixtureWrite(root, '.archcontext/manifest.yaml', 'runtime:\n  contextBudgetBytes: 3000\n'); fixtureCommit(root);
    const after = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID);
    expect(after.commit).not.toBe(before.commit); expect(after.budget.input_cap_bytes).toBe(3000); expect(after.prompt).toContain('New committed decision.');
  });
});

test('graph containment has no inferred calls and folds each side after eight neighbors', () => {
  const nodes: ModelNode[] = [{ id: MODULE_ID, name: 'Module', kind: 'capability', status: 'active', summary: '' },
    { id: 'component.child', parent: MODULE_ID, name: 'Child', kind: 'component', status: 'active', summary: '' },
    ...Array.from({ length: 10 }, (_, i) => ({ id: `capability.test.caller${i}`, name: `Caller ${i}`, kind: 'capability', status: 'active', summary: '' }))];
  const graph = moduleGraph(MODULE_ID, nodes, nodes.slice(2).map((node, i) => ({ id: `relation.${i}`, source: node.id, target: MODULE_ID, kind: i ? 'calls' : 'depends-on', intent: 'Call' })));
  expect(graph.nodes.filter(node => node.role === 'caller' && node.kind !== 'group')).toHaveLength(8);
  expect(graph.nodes.find(node => node.kind === 'group')).toMatchObject({ count: 2, id: `group.caller.${MODULE_ID}` });
  expect(graph.edges.some(edge => edge.source === 'component.child' || edge.target === 'component.child')).toBe(false);
  expect(graph.edges[0].direction).toBe('undirected');
  const ids = new Set(graph.nodes.map(node => node.id)); expect(graph.edges.every(edge => ids.has(edge.source) && ids.has(edge.target))).toBe(true);
});

test('section parser and narrowed secret rules preserve absent values', () => {
  expect(section3FromMarkdown('## 3. Decisions\n\n## 4. History\nData')).toBeNull();
  expect(containsSecret('tokens: null\nTOKEN: none\nAPI_KEY: ""')).toBe(false);
  expect(containsSecret('API_KEY=sample-secret')).toBe(true);
  expect(containsSecret('123456789:'+'a'.repeat(35))).toBe(true);
});

test('OpenAI prompt detection uses a token boundary without shrinking MCP redaction', () => {
  expect(containsSecret('bound-task-abcdefghijklmnopqrstuv')).toBe(false);
  expect(containsSecret('"sk-'+'A'.repeat(24)+'"')).toBe(true);
  expect(containsSecret('TOKEN=prefixsk-'+'A'.repeat(24))).toBe(true);
});
