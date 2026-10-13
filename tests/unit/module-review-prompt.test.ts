import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ArchitectureModelReader } from '../../src/effects/architecture/model-reader';
import { MODEL_NODE_KINDS, generatedSummaryState, moduleGraph, section3FromMarkdown, type ModelNode } from '../../src/core/architecture/module-view';
import { decodeDocsAnchorsReport, decodeProjectionCheckFreshness } from '../../src/core/architecture/projection';
import { decodeArchitectureModuleDetail, decodeArchitectureReviewPrompt } from '../../src/core/operator/architecture';
import nodeSchema from 'archctx-contracts/schemas/repo/architecture-node.schema.json';
import { projectionResultReceiptDigest } from 'archctx-contracts';
import { sha256 } from '../../src/core/review/module-review-prompt';
import type { JsonValue } from '../../src/core/evidence/types';
import { canonicalize } from '../../src/core/evidence/canonical-json';
import { containsSecret } from '../../src/core/security/secret-patterns';
import { MODULE_DOC, MODULE_FLOW, MODULE_ID, MODULE_NODE, fixtureCommit, fixtureGit, fixtureWrite, fixtureYaml, moduleRepository, projectionCheckResult } from '../helpers/module-repository';

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
  test('binds staged blob identity separately from the same worktree bytes', () => {
    const root = repo(), path = 'src/module/read.ts';
    const reader = new ArchitectureModelReader(root), commit = reader.commit;
    const observe = (staged: string) => {
      fixtureWrite(root, path, staged); fixtureGit(root, ['add', '--', path]);
      const index = fixtureGit(root, ['rev-parse', `:${path}`]);
      fixtureWrite(root, path, 'fixed worktree bytes');
      expect(fixtureGit(root, ['status', '--porcelain=v1', '--', path])).toBe(`MM ${path}`);
      return { index, packet: reader.reviewPrompt(MODULE_ID) };
    };
    const first = observe('staged first'), second = observe('staged second');
    expect(first.index).not.toBe(second.index);
    expect(second.packet.commit).toBe(commit);
    expect(second.packet.worktree_dirty_paths).toEqual(first.packet.worktree_dirty_paths);
    expect(second.packet.dirty_content_sha256).not.toBe(first.packet.dirty_content_sha256);
    expect(second.packet.digest).not.toBe(first.packet.digest);
    expect(second.packet.model_sha256).toBe(first.packet.model_sha256);
    expect(second.packet.doc_sha256).toBe(first.packet.doc_sha256);
    for (const packet of [first.packet, second.packet]) {
      expect(packet.prompt).not.toContain('staged first'); expect(packet.prompt).not.toContain('staged second');
      expect(packet.prompt).not.toContain('fixed worktree bytes');
    }
    expect(reader.reviewPrompt(MODULE_ID)).toEqual(second.packet);
  });
  test('binds staged modes and keeps unmerged stage objects distinct', () => {
    const root = repo(), path = 'src/module/read.ts', reader = new ArchitectureModelReader(root);
    fixtureWrite(root, path, 'fixed worktree bytes');
    fixtureGit(root, ['update-index', '--chmod=+x', '--', path]);
    const executable = reader.reviewPrompt(MODULE_ID);
    fixtureGit(root, ['update-index', '--chmod=-x', '--', path]);
    const regular = reader.reviewPrompt(MODULE_ID);
    expect(executable.worktree_dirty_paths).toEqual(regular.worktree_dirty_paths);
    expect(executable.dirty_content_sha256).not.toBe(regular.dirty_content_sha256);
    expect(executable.digest).not.toBe(regular.digest);
    const base = fixtureGit(root, ['rev-parse', `HEAD:${path}`]);
    fixtureWrite(root, path, 'staged side one');
    const first = fixtureGit(root, ['hash-object', '-w', '--', path]);
    fixtureWrite(root, path, 'staged side two');
    const second = fixtureGit(root, ['hash-object', '-w', '--', path]);
    fixtureWrite(root, path, 'fixed worktree bytes');
    const observeConflict = (theirs: string) => {
      const result = Bun.spawnSync(['git', 'update-index', '--index-info'], {
        cwd: root, stdin: Buffer.from(`0 ${'0'.repeat(40)}\t${path}\n100644 ${base} 1\t${path}\n100644 ${first} 2\t${path}\n100644 ${theirs} 3\t${path}\n`),
      });
      expect(result.exitCode).toBe(0);
      expect(fixtureGit(root, ['ls-files', '--unmerged', '--', path]).split('\n')).toHaveLength(3);
      return reader.reviewPrompt(MODULE_ID);
    };
    const conflict = observeConflict(second), changed = observeConflict(base);
    expect(changed.worktree_dirty_paths).toEqual(conflict.worktree_dirty_paths);
    expect(changed.dirty_content_sha256).not.toBe(conflict.dirty_content_sha256);
    expect(changed.digest).not.toBe(conflict.digest);
    expect(changed.prompt).not.toContain('fixed worktree bytes');
    expect(changed.prompt).not.toContain('staged side');
  });
  test('reads real staged renames with arrow text and quoted UTF-8 names', () => {
    for (const target of ['src/module/name -> arrow.ts', 'src/module/新 "文件" -> arrow.ts']) {
      const root = repo(), source = 'src/module/read.ts';
      fixtureGit(root, ['mv', '--', source, target]);
      const packet = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID);
      expect(packet.worktree_dirty_paths).toEqual([source, target].sort());
      expect(packet.dirty_content_sha256).not.toBeNull();
      expect(new ArchitectureModelReader(root).reviewPrompt(MODULE_ID)).toEqual(packet);
    }
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
    ...Array.from({ length: 10 }, (_, i) => ({ id: `capability.test.caller${i}`, name: `Caller ${i}`, kind: 'capability' as const, status: 'active', summary: '' }))];
  const graph = moduleGraph(MODULE_ID, nodes, nodes.slice(2).map((node, i) => ({ id: `relation.${i}`, source: node.id, target: MODULE_ID, kind: i ? 'calls' : 'depends-on', intent: 'Call' })));
  expect(graph.nodes.filter(node => node.role === 'caller' && node.kind !== 'group')).toHaveLength(8);
  expect(graph.nodes.find(node => node.kind === 'group')).toMatchObject({ count: 2, id: `group.caller.${MODULE_ID}` });
  expect(graph.edges.some(edge => edge.source === 'component.child' || edge.target === 'component.child')).toBe(false);
  // ArchContext reads every relation from source to target, `depends-on` included.
  expect(graph.edges.every(edge => edge.direction === 'directed')).toBe(true);
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

function moduleNode(root: string): Record<string, unknown> & { source: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(root, MODULE_NODE), 'utf8'));
}
const anchorsReport = (findingPath = 'src/module/read.ts') => ({
  schemaVersion: 'archcontext.docs-anchors/v1', profile: 'repo-harness/v1', codeGraph: { availability: 'unavailable', reasonCode: 'index-missing' },
  summary: { nodes: 2, documents: 1, citations: 3, findings: 2, unchecked: 0, byKind: { 'line-moved': 0, 'line-out-of-range': 1, 'missing-path': 1, 'missing-symbol': 0 } },
  nodes: [
    { nodeId: 'capability.other.module', citationCount: 1, findings: [{ kind: 'missing-path', origin: { kind: 'node-summary' }, citation: { text: 'gone/other.ts', path: 'gone/other.ts' } }], unchecked: [] },
    { nodeId: MODULE_ID, documentPath: MODULE_DOC, citationCount: 2,
      findings: [{ kind: 'line-out-of-range', origin: { kind: 'document', path: MODULE_DOC, line: 5 }, citation: { text: `${findingPath}:99`, path: findingPath, line: 99 }, lineCount: 1 }], unchecked: [] },
  ],
});

describe('issue 677 architecture readers', () => {
  test('node kinds follow the published archcontext.node/v2 enum', () => {
    expect(nodeSchema.properties.kind.enum).toEqual([...MODEL_NODE_KINDS]);
  });

  test('generated_summary comes from a projection check for HEAD and stays unknown without one', () => {
    const root = repo(), reader = new ArchitectureModelReader(root);
    expect(reader.list().modules[0].state.generated_summary).toBe('unknown');
    const stale = decodeProjectionCheckFreshness(projectionCheckResult(reader.commit, [MODULE_ID]));
    const fresh = decodeProjectionCheckFreshness(projectionCheckResult(reader.commit, []));
    expect(reader.list({ freshness: stale }).modules[0].state.generated_summary).toBe('stale');
    expect(reader.detail(MODULE_ID, { freshness: fresh }).state.generated_summary).toBe('fresh');
    expect(reader.reviewPrompt(MODULE_ID, { freshness: stale }).prompt).toContain('"generated_summary":"stale"');
    expect(reader.reviewPrompt(MODULE_ID).prompt).toContain('"generated_summary":"unknown"');
    // A check that failed for a reason that is not per node proves no node fresh.
    const incomplete = decodeProjectionCheckFreshness(projectionCheckResult(reader.commit, [], ['projection-manifest-missing']));
    expect(generatedSummaryState(incomplete, MODULE_ID)).toBe('unknown');
    // A result without freshness keeps a valid receipt digest, so only the missing field fails.
    const { freshness: _freshness, receiptDigest: _digest, ...withoutFreshness } = projectionCheckResult(reader.commit, []);
    expect(() => decodeProjectionCheckFreshness({ ...withoutFreshness, receiptDigest: projectionResultReceiptDigest(withoutFreshness) })).toThrow('no freshness');
    // An uncommitted model edit keeps HEAD, so the check still applies; a new commit does not.
    const node = moduleNode(root); node.summary = 'Uncommitted summary.'; fixtureWrite(root, MODULE_NODE, fixtureYaml(node));
    expect(new ArchitectureModelReader(root).list({ freshness: stale }).modules[0].state.generated_summary).toBe('stale');
    fixtureCommit(root);
    expect(() => new ArchitectureModelReader(root).list({ freshness: stale })).toThrow('projection_check_commit_mismatch');
  });

  test('the prompt carries notes, source footprint, components and an optional backlog; uncommitted text stays out', () => {
    const root = repo();
    const node = moduleNode(root);
    node.notes = ['Readers never write.'];
    node.source.exclude = ['src/module/generated/**'];
    fixtureWrite(root, MODULE_NODE, fixtureYaml(node));
    const reader = new ArchitectureModelReader(root);
    expect(reader.reviewPrompt(MODULE_ID).prompt).not.toContain('\n\nBACKLOG\n');
    fixtureWrite(root, MODULE_DOC, '## 3. Decisions\nKeep one model authority.\n\n## 4. History\nOld.\n\n## Optimization Backlog\n- Split the committed reader.\n');
    fixtureCommit(root);
    const next = new ArchitectureModelReader(root), detail = next.detail(MODULE_ID);
    expect(detail.module.notes).toEqual(['Readers never write.']);
    expect(detail.module.source).toEqual({ include: ['src/module/**'], exclude: ['src/module/generated/**'] });
    expect(detail.module.components).toEqual([{ id: 'component.module.core', kind: 'component', name: 'Module Core', summary: 'Project facts.', source: { include: [], exclude: [] } }]);
    expect(decodeArchitectureModuleDetail(detail)).toEqual(detail);
    const packet = next.reviewPrompt(MODULE_ID);
    expect(packet.prompt).toContain('\n\nBACKLOG\n- Split the committed reader.');
    expect(packet.prompt).toContain('Readers never write.'); expect(packet.prompt).toContain('src/module/generated/**'); expect(packet.prompt).toContain('Project facts.');
    expect(packet.prompt).not.toContain('Old.');
    fixtureWrite(root, MODULE_DOC, '## Optimization Backlog\n- Uncommitted backlog item.\n');
    const dirty = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID);
    expect(dirty.prompt).toContain('Split the committed reader.'); expect(dirty.prompt).not.toContain('Uncommitted backlog item.');
    expect(dirty.worktree_dirty_paths).toEqual([MODULE_DOC]);
  });

  test('a docs anchors report adds the module stale citations only', () => {
    const root = repo(), reader = new ArchitectureModelReader(root);
    const report = decodeDocsAnchorsReport(anchorsReport());
    const plain = reader.reviewPrompt(MODULE_ID);
    expect(plain.prompt).not.toContain('\n\nSTALE CITATIONS\n'); expect(plain.sources.map(source => source.path)).not.toContain('anchors');
    const packet = reader.reviewPrompt(MODULE_ID, { anchors: report });
    expect(packet.prompt).toContain('\n\nSTALE CITATIONS\n'); expect(packet.prompt).toContain('src/module/read.ts:99');
    expect(packet.prompt).not.toContain('gone/other.ts');
    expect(packet.sources.find(source => source.path === 'anchors')).toMatchObject({ class: 'optional', disposition: 'included' });
    expect(packet.digest).not.toBe(plain.digest);
    expect(decodeArchitectureReviewPrompt(packet)).toEqual(packet);
    expect(reader.reviewPrompt(MODULE_ID, { anchors: decodeDocsAnchorsReport(anchorsReport('src/module/core.ts')) }).digest).not.toBe(packet.digest);
    expect(() => decodeDocsAnchorsReport({ ...anchorsReport(), summary: { ...anchorsReport().summary, findings: 5 } })).toThrow('docs anchors report invalid');
    // Uncommitted document edits do not change the report the caller supplied.
    fixtureWrite(root, MODULE_DOC, '## 3. Decisions\nDirty.\n');
    const dirty = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID, { anchors: report });
    expect(dirty.prompt).toContain('src/module/read.ts:99'); expect(dirty.worktree_dirty_paths).toEqual([MODULE_DOC]);
  });

  test('every schema node kind is accepted and relations stay directed', () => {
    const root = repo();
    fixtureWrite(root, '.archcontext/model/nodes/interface.module.api.yaml', fixtureYaml({ schemaVersion: 'archcontext.node/v2', id: 'interface.module.api', kind: 'interface', name: 'Module API', status: 'active', summary: 'Public read API.' }));
    fixtureWrite(root, '.archcontext/model/relations/relation.module.api.yaml', fixtureYaml({ schemaVersion: 'archcontext.relation/v1', id: 'relation.module.api', kind: 'implements', source: 'component.module.core', target: 'interface.module.api', intent: 'Serve the API.' }));
    fixtureCommit(root);
    const reader = new ArchitectureModelReader(root);
    expect(reader.list().modules[0].state.model_valid).toBe('valid');
    const detail = reader.detail(MODULE_ID);
    expect(detail.graph.nodes.find(node => node.id === 'interface.module.api')).toMatchObject({ kind: 'interface', role: 'callee' });
    expect(detail.graph.edges.find(edge => edge.relation_kind === 'implements')).toMatchObject({ source: 'component.module.core', target: 'interface.module.api', direction: 'directed' });
    expect(decodeArchitectureModuleDetail(detail)).toEqual(detail);
    expect(reader.reviewPrompt(MODULE_ID).prompt).toContain('interface.module.api');
    // An uncommitted node of another kind is reported as dirty model work, not read.
    fixtureWrite(root, '.archcontext/model/nodes/event.module.read.yaml', fixtureYaml({ schemaVersion: 'archcontext.node/v2', id: 'event.module.read', kind: 'event', name: 'Read', status: 'active', summary: 'Read event.' }));
    const dirty = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID);
    expect(dirty.worktree_dirty_paths).toEqual(['.archcontext/model/nodes/event.module.read.yaml']);
    expect(dirty.prompt).not.toContain('Read event.');
  });

  test('unrelated plan names do not block reads; a linked unsafe name fails closed', () => {
    const root = repo();
    fixtureWrite(root, 'plans/plan-a\\b.md', '> **Status**: Draft\n');
    fixtureCommit(root);
    const reader = new ArchitectureModelReader(root);
    expect(reader.list().modules[0].state.model_valid).toBe('valid');
    expect(reader.reviewPrompt(MODULE_ID).capability_id).toBe(MODULE_ID);
    expect(reader.detail(MODULE_ID).linked_docs.map(doc => doc.path)).toEqual(['plans/plan-test.md', 'tasks/contracts/test.contract.md']);
    fixtureWrite(root, 'plans/plan-c\\d.md', `> **Capability ID**: ${MODULE_ID}\n> **Status**: Draft\n`);
    expect(new ArchitectureModelReader(root).detail(MODULE_ID).linked_docs).toHaveLength(2);
    fixtureCommit(root);
    expect(() => new ArchitectureModelReader(root).detail(MODULE_ID)).toThrow('path_invalid');
  });

  test('the dirty scope covers the model directory; an uncommitted capability has its own error', () => {
    const root = repo(), next = 'capability.test.next';
    const node = { ...moduleNode(root), id: next, name: 'Next Module' };
    fixtureWrite(root, '.archcontext/model/nodes/capability.test.next.yaml', fixtureYaml(node));
    const reader = new ArchitectureModelReader(root);
    expect(reader.list().modules.map(module => module.id)).toEqual([MODULE_ID]);
    expect(() => reader.reviewPrompt(next)).toThrow('capability_uncommitted');
    expect(() => reader.reviewPrompt('capability.test.absent')).toThrow('capability_not_found');
    expect(reader.reviewPrompt(MODULE_ID).worktree_dirty_paths).toEqual(['.archcontext/model/nodes/capability.test.next.yaml']);
    fixtureCommit(root);
    const committed = new ArchitectureModelReader(root);
    expect(committed.list().modules.map(module => module.id)).toEqual([MODULE_ID, next]);
    expect(committed.reviewPrompt(next).capability_id).toBe(next);
  });

  test('the review diff keeps the changed paths that archctx resolve assigns to the module', () => {
    const root = repo();
    const node = moduleNode(root); node.source.exclude = ['src/module/generated/**'];
    fixtureWrite(root, MODULE_NODE, fixtureYaml(node));
    fixtureWrite(root, '.archcontext/model/nodes/component.module.extra.yaml', fixtureYaml({ schemaVersion: 'archcontext.node/v2', id: 'component.module.extra', kind: 'component', name: 'Extra', status: 'active', summary: 'Extra glob.', parent: MODULE_ID, source: { include: ['lib/extra/**'] } }));
    fixtureWrite(root, 'lib/extra/y.ts', 'export const y = 1;\n'); fixtureWrite(root, 'src/module/generated/x.ts', 'export const x = 1;\n');
    const base = fixtureCommit(root);
    fixtureWrite(root, 'src/module/read.ts', 'export const read = () => 2;\n'); fixtureWrite(root, 'lib/extra/y.ts', 'export const y = 2; // COMPONENT GLOB\n');
    fixtureWrite(root, 'src/module/generated/x.ts', 'export const x = 2; // EXCLUDED\n'); fixtureWrite(root, 'unrelated.ts', 'OUTSIDE DIFF\n');
    const head = fixtureCommit(root);
    const packet = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID, { base, head });
    expect(packet.prompt).toContain('export const read = () => 2;'); expect(packet.prompt).toContain('COMPONENT GLOB');
    expect(packet.prompt).not.toContain('EXCLUDED'); expect(packet.prompt).not.toContain('OUTSIDE DIFF');
    // Uncommitted edits never enter the diff between two commits.
    fixtureWrite(root, 'lib/extra/y.ts', 'UNCOMMITTED EDIT\n');
    const dirty = new ArchitectureModelReader(root).reviewPrompt(MODULE_ID, { base, head });
    expect(dirty.prompt).toContain('COMPONENT GLOB'); expect(dirty.prompt).not.toContain('UNCOMMITTED EDIT');
    // A diff with no owned path is empty, never the whole repository.
    fixtureWrite(root, 'lib/extra/y.ts', 'export const y = 2; // COMPONENT GLOB\n');
    fixtureWrite(root, 'unrelated.ts', 'ONLY UNRELATED\n');
    const unrelated = fixtureCommit(root);
    expect(new ArchitectureModelReader(root).reviewPrompt(MODULE_ID, { base: head, head: unrelated }).prompt).not.toContain('ONLY UNRELATED');
  });
});
