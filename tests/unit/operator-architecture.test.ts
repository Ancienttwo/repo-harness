import { describe, expect, test } from 'bun:test';
import { ArchitectureModelReader } from '../../src/effects/architecture/model-reader';
import { decodeArchitectureModuleIndex, decodeArchitectureModuleDetail, decodeArchitectureReviewPrompt } from '../../src/core/operator/architecture';
import { parseArchitectureRequest } from '../../src/core/operator/architecture';
import { MODULE_ID, MODULE_NODE, MODULE_FLOW, moduleRepository, fixtureWrite, fixtureCommit, fixtureGit, fixtureYaml } from '../helpers/module-repository';
import { readFileSync, realpathSync, rmSync } from 'node:fs';
import {
  archctxRefusal,
  decodeArchitectureMap,
  decodeArchitecturePullRequestsSource,
  projectArchitectureMap,
  projectTestCoverage,
  withTestCoverage,
  type ArchitectureFlowEvidenceV1,
  type ArchitectureFlowSelectorV1,
  type ArchitectureImpactV1,
  type ArchitectureMapFlowV1,
  type ArchitectureMapLayersInput,
  type ArchitectureMapNodeV1,
  type ArchitecturePullRequestsSource,
} from '../../src/core/operator/architecture-map';
import type { DevActivitySnapshotV2 } from '../../src/core/dev-activity/types';
import { architecturePullRequestsSource } from '../../src/core/dev-activity/architecture';
import type { TestsSnapshotV1 } from '../../src/core/operator/tests';
import { collectArchitectureMap, flowProofSection, layerDirectionSection, localMidnight, readCommitLineCounts, recheckCheckout, recheckLayers } from '../../src/effects/operator/architecture-map-worker';
import { decodeConstraintEvaluation, decodeFlowSelectorCheck } from '../../src/core/architecture/projection';
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
  const GONE = 'component.pipeline.gone';
  const FLOW = 'flow.pipeline.ledger';
  // Two selectors: the model declares the first; no node declares the second.
  const WRITE: ArchitectureFlowSelectorV1 = { entrypoint: 'entrypoint.pipeline.write', source_symbol: 'write', sink: 'sink.pipeline.store' };
  const DENY: ArchitectureFlowSelectorV1 = { entrypoint: 'entrypoint.review.deny', source_symbol: 'deny', sink: 'sink.review.reply' };
  const flows: ArchitectureMapFlowV1[] = [
    { id: 'flow.review.gate', capability: OTHER, name: 'Gate reviews', applicability: 'not-applicable', rationale: 'The gate makes no call.' },
    {
      id: FLOW, capability: CAP, name: 'Write a ledger row', applicability: 'required',
      participants: [{ id: 'ledger', node: CAP }, { id: 'store', node: PART }, { id: 'gate', node: OTHER }],
      steps: [{ id: 'store', from: 'ledger', to: 'store', label: 'Store the row', evidence: WRITE }],
      outcomes: [
        { id: 'stored', kind: 'success', label: 'Stored', steps: [{ id: 'ack', from: 'store', to: 'ledger', label: 'Acknowledge', evidence: WRITE }], terminal: { participant: 'ledger', label: 'Row kept' } },
        { id: 'refused', kind: 'error', label: 'Refused', steps: [{ id: 'deny', from: 'gate', to: 'ledger', label: 'Deny the row', evidence: DENY }], terminal: { participant: 'ledger', label: 'Row dropped' } },
      ],
    },
  ];
  const flowEvidence: ArchitectureFlowEvidenceV1[] = [{ ...WRITE, node: CAP, source_path: 'src/ledger.ts', sink_path: 'src/store.ts', sink_symbol: 'put' }];
  const mapNode = (nodeId: string, kind: string, parent: string | null = null): ArchitectureMapNodeV1 =>
    ({ id: nodeId, kind, name: nodeId, status: 'active', layer: 'core', parent, summary: `${nodeId} summary` });
  const whole = { paths: false, nodes: false, relations: false, flow_steps: false, dependents: false, model: false } as const;
  // Map-layer values in the shape `architectureImpact` gives them; the worker tests below read real archctx answers.
  const todayImpact: ArchitectureImpactV1 = {
    paths: [
      { path: 'README.md', added: 2, deleted: 2, owners: [], reason_codes: [] },
      { path: 'assets/logo.png', added: null, deleted: null, owners: [PART], reason_codes: ['binary-diff'] },
      // A deleted path keeps the owner it had at the base, here a node the change removed.
      { path: 'src/gone.ts', added: 0, deleted: 4, owners: [GONE], reason_codes: [] },
      { path: 'src/ledger.ts', added: 1, deleted: 0, owners: [CAP], reason_codes: [] },
      { path: 'src/store.ts', added: 3, deleted: 1, owners: [PART], reason_codes: [] },
    ],
    unowned_paths: ['README.md'],
    nodes: [{ id: CAP, files: 1 }, { id: GONE, files: 1 }, { id: PART, files: 2 }],
    dependents: [{ id: CAP, touched: PART, relations: ['relation.a'] }],
    dependency_coverage: 'complete',
    flow_steps: { status: 'known', reason_codes: [], items: [{ flow: 'flow.pipeline.ledger', step: 'store', outcome: null, reason_codes: ['head-lines-changed'] }] },
    truncated: whole,
  };
  const prImpact: ArchitectureImpactV1 = {
    paths: [
      { path: 'README.md', added: null, deleted: null, owners: [], reason_codes: ['paths-only'] },
      { path: 'src/store.ts', added: null, deleted: null, owners: [PART], reason_codes: ['paths-only'] },
    ],
    unowned_paths: ['README.md'],
    nodes: [{ id: PART, files: 1 }],
    dependents: [{ id: CAP, touched: PART, relations: ['relation.a'] }],
    dependency_coverage: 'complete',
    flow_steps: { status: 'unknown', reason_codes: ['line-impact-unavailable', 'ref-code-facts-unavailable'], items: null },
    truncated: whole,
  };
  const layers: ArchitectureMapLayersInput = {
    changes: {
      state: 'ok', since: '2026-10-27T00:00:00.000Z', base: 'b'.repeat(40), commits: 2,
      model: [
        { kind: 'flows', id: 'flow.pipeline.ledger', change: 'changed', fields: ['steps'] },
        { kind: 'nodes', id: GONE, change: 'removed', fields: ['id', 'kind', 'name'] },
        { kind: 'nodes', id: PART, change: 'added', fields: ['id', 'kind', 'name'] },
        { kind: 'relations', id: 'relation.a', change: 'added', fields: ['id', 'source', 'target'] },
      ],
      ...todayImpact,
    },
    pull_requests: {
      state: 'ok', observed_at: '2026-10-27T08:59:00.000Z',
      pull_requests: [
        { number: 7, title: 'Store rows', url: 'https://github.com/acme/widgets/pull/7', head_sha: 'e'.repeat(40), impact: { state: 'ok', ...prImpact } },
        { number: 8, title: 'Big change', url: 'https://github.com/acme/widgets/pull/8', head_sha: 'f'.repeat(40), impact: { state: 'unavailable', reason: 'files_truncated' } },
        { number: 9, title: 'No head', url: 'https://github.com/acme/widgets/pull/9', head_sha: null, impact: { state: 'unavailable', reason: 'head_missing' } },
        { number: 10, title: 'Odd path', url: 'https://github.com/acme/widgets/pull/10', head_sha: 'a'.repeat(40),
          impact: { state: 'unavailable', reason: 'archctx_error', code: 'AC_SCHEMA_INVALID', reason_code: 'native-context-arguments-invalid' } },
      ],
    },
    violations: {
      debt: { state: 'ok', items: [{ kind: 'unowned-path', nodes: [], paths: ['src/orphan.ts'] }, { kind: 'ambiguous-owner', nodes: [CAP, OTHER], paths: ['docs/shared.md'] }] },
      flows: { state: 'ok', selectors: 3, proven: 1, unproven: 2, used_unproven: 1, unprovable: [{ id: OTHER, diagnostics: 1 }, { id: CAP, diagnostics: 2 }],
        evidence: [{ ...WRITE, status: 'proven' }, { ...DENY, status: 'no-direct-call' }] },
      anchors: { state: 'ok', citations: 5, nodes: [{ id: CAP, findings: 2 }] },
      dependencies: { state: 'ok', edges: [{ source: OTHER, target: CAP, imports: 2 }] },
      // Every fixture node is in `core`, so no pair can import against the order.
      layer_direction: { state: 'ok', imports: 12, edges: [] },
    },
    tests: { state: 'unavailable', reason: 'tests_pending' },
    decisions: { state: 'ok', items: [
      { id: 'ADR-0002-gate', title: 'Gate reviews', status: null, decided_at: null, applies_to: [OTHER], supersedes: ['ADR-0001-ledger'], path: 'docs/adr/ADR-0002-gate.md' },
      { id: 'ADR-0001-ledger', title: 'Keep one ledger', status: 'accepted', decided_at: '2026-10-01', applies_to: [CAP, PART], supersedes: [], path: 'docs/adr/ADR-0001-ledger.md' },
    ] },
  };
  const input = {
    repository_id: 'repo_0123456789abcdef', commit: 'c'.repeat(40), collected_at: '2026-10-27T09:00:00.000Z', layers,
    layer_order: { state: 'ok', layers: ['cli', 'core'] } as const,
    nodes: [mapNode(OTHER, 'capability'), mapNode(PART, 'component', CAP), mapNode(CAP, 'capability')],
    relations: [{ id: 'relation.b', kind: 'calls', source: CAP, target: OTHER, intent: 'Gate.' }, { id: 'relation.a', kind: 'calls', source: CAP, target: PART, intent: 'Store.' }],
    flows, flow_evidence: flowEvidence,
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
    // The layer order is archctx's `model.layers`: non-empty, unique, and it names every node layer.
    refused(copy => { copy.layer_order.layers = []; });
    refused(copy => { copy.layer_order.layers = ['core', 'core']; });
    refused(copy => { copy.layer_order.layers = ['cli']; });
    refused(copy => { copy.layer_order.layers = ['Core']; });
    refused(copy => { copy.layer_order = { state: 'unavailable', reason: 'layer_order_not_read' }; });
    refused(copy => { delete copy.layer_order; });
    // Without an order there is no layer-direction answer either.
    const unordered = { state: 'unavailable', reason: 'model_layers_undeclared' };
    expect(decodeArchitectureMap({ ...map, layer_order: unordered, layers: { ...map.layers, violations: { ...map.layers.violations, layer_direction: unordered } } }).layer_order.state).toBe('unavailable');
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

  test('the worker maps a committed model with git line counts and its decisions, and imports fail closed without a CodeGraph index', () => {
    const root = realpathSync(moduleRepository());
    try {
      fixtureWrite(root, 'docs/adr/ADR-0001-committed-reads.md', `---\nschemaVersion: archcontext.adr/v1\ntitle: Read committed modules\nstatus: accepted\nappliesTo:\n  - ${MODULE_ID}\n---\n\n# ADR-0001\n`);
      fixtureCommit(root);
      const commit = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
      expect(readCommitLineCounts(root, commit)?.get('src/module/read.ts')).toBe(1);
      const result = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T09:00:00.000Z', '2026-10-27T00:00:00.000Z', pending);
      if (!result.ok) throw new Error('worker failed');
      const map = result.snapshot;
      expect(map.commit).toBe(commit);
      expect(map.nodes.map(entry => [entry.id, entry.parent])).toEqual([[MODULE_ID, null], ['component.module.core', MODULE_ID]]);
      expect(map.relations.map(entry => entry.id)).toEqual(['relation.module.core']);
      // The flow and the code its step selector names come from the same export.
      const read = { id: 'read', from: 'module', to: 'core', label: 'Read facts', evidence: { entrypoint: 'entrypoint.module.read', source_symbol: 'read', sink: 'sink.module.core' } };
      expect(map.flows).toEqual([{ id: 'flow.module.primary', capability: MODULE_ID, name: 'Read module facts', applicability: 'required',
        participants: [{ id: 'module', node: MODULE_ID }, { id: 'core', node: 'component.module.core' }], steps: [read],
        outcomes: (['success', 'error'] as const).map(kind => ({ id: kind, kind, label: kind, steps: [read], terminal: { participant: 'module', label: kind } })) }]);
      expect(map.flow_evidence).toEqual([{ ...read.evidence, node: MODULE_ID, source_path: 'src/module/read.ts', sink_path: 'src/module/core.ts', sink_symbol: 'project' }]);
      expect(map.sizes).toEqual({ state: 'ok', nodes: [{ id: MODULE_ID, files: 2, lines: 2 }] });
      expect(map.dependencies.state).toBe('unavailable');
      // The decisions come from the same `export native` as the model; the fixture declares no ordered layers.
      expect(map.layers.decisions).toEqual({ state: 'ok', items: [{ id: 'ADR-0001-committed-reads', title: 'Read committed modules', status: 'accepted', decided_at: null,
        applies_to: [MODULE_ID], supersedes: [], path: 'docs/adr/ADR-0001-committed-reads.md' }] });
      expect(map.layers.violations.layer_direction).toEqual({ state: 'unavailable', reason: 'model_layers_undeclared' });
      expect(map.layer_order).toEqual({ state: 'unavailable', reason: 'model_layers_undeclared' });
      expect(JSON.stringify(map)).not.toContain(root);
      // Today's changes need a base before today and one commit inside the window.
      baseBeforeToday(root);
      dated('2026-10-27T12:00:00Z', () => {
        fixtureWrite(root, 'src/module/read.ts', 'export const read = () => 2;\n');
        fixtureCommit(root);
      });
      // `archctx resolve` reads the worktree model, so an edited model hides the line counts.
      fixtureWrite(root, '.archcontext/model/nodes/component.module.extra.yaml', fixtureYaml({ schemaVersion: 'archcontext.node/v2', id: 'component.module.extra', kind: 'component', name: 'Extra', status: 'active', summary: 'Extra.', parent: MODULE_ID }));
      const dirty = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T09:00:00.000Z', '2026-10-27T00:00:00.000Z', pending);
      expect(dirty.ok && [dirty.snapshot.sizes, dirty.snapshot.dependencies]).toEqual([
        { state: 'unavailable', reason: 'model_worktree_dirty' }, { state: 'unavailable', reason: 'model_worktree_dirty' }]);
      // Today's changes read only commits, so the edited model does not withhold them.
      expect(dirty.ok && [dirty.snapshot.layers.changes.state, dirty.snapshot.layers.violations.debt]).toEqual([
        'ok', { state: 'unavailable', reason: 'model_worktree_dirty' }]);
      // A PR source passes through with its own reason; the PR owners would read the edited model, so a ready source is withheld.
      expect(dirty.ok && dirty.snapshot.layers.pull_requests).toEqual({ state: 'unavailable', reason: 'dev_activity_pending' });
      const dirtyPrs = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T09:00:00.000Z', '2026-10-27T00:00:00.000Z',
        { state: 'ok', observed_at: '2026-10-27T08:59:00.000Z', pull_requests: [] });
      expect(dirtyPrs.ok && dirtyPrs.snapshot.layers.pull_requests).toEqual({ state: 'unavailable', reason: 'model_worktree_dirty' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('a declared step path that the public-path guard refuses is withheld, and the rest of the flow stays', () => {
    const root = realpathSync(moduleRepository());
    try {
      const node = JSON.parse(readFileSync(join(root, MODULE_NODE), 'utf8'));
      node.source.include = ['src/module/**', 'app/**'];
      node.source.entrypoints[0].path = 'app/(group)/read.ts';
      fixtureWrite(root, MODULE_NODE, fixtureYaml(node));
      fixtureWrite(root, 'app/(group)/read.ts', 'export const read = () => 1;\n');
      fixtureCommit(root);
      const result = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T09:00:00.000Z', '2026-10-27T00:00:00.000Z', pending);
      if (!result.ok) throw new Error('worker failed');
      expect(result.snapshot.flow_evidence).toEqual([{ entrypoint: 'entrypoint.module.read', source_symbol: 'read', sink: 'sink.module.core', node: MODULE_ID,
        source_path: null, sink_path: 'src/module/core.ts', sink_symbol: 'project' }]);
      expect(result.snapshot.flows.map(entry => entry.id)).toEqual(['flow.module.primary']);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('the worker takes the layer order from archctx\'s export of the committed manifest, and archctx refuses a node layer outside it', () => {
    const root = realpathSync(moduleRepository());
    try {
      const manifest = '.archcontext/manifest.yaml';
      const declared = fixtureYaml({ schemaVersion: 'archcontext.manifest/v1', model: { layout: 'split', root: '.archcontext/model', layers: ['entry', 'core'] }, runtime: { contextBudgetBytes: 12288 } });
      fixtureWrite(root, manifest, declared);
      fixtureCommit(root);
      const result = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T09:00:00.000Z', '2026-10-27T00:00:00.000Z', pending);
      if (!result.ok) throw new Error('worker failed');
      expect(result.snapshot.layer_order).toEqual({ state: 'ok', layers: ['entry', 'core'] });
      // The model declares layers but no layer-direction constraint, so there is nothing to check.
      expect(result.snapshot.layers.violations.layer_direction).toEqual({ state: 'unavailable', reason: 'layer_direction_undeclared' });
      // A committed layer-direction constraint runs `archctx constraints check`; the fixture has no CodeGraph index.
      fixtureWrite(root, '.archcontext/model/constraints/constraint.module.layer-direction.yaml', fixtureYaml({
        schemaVersion: 'archcontext.constraint/v1', id: 'constraint.module.layer-direction', name: 'Layer direction', severity: 'warning',
        scope: {}, rule: { type: 'layer-direction' }, rationale: 'Entry may import core; core may not import entry.',
      }));
      fixtureCommit(root);
      const constrained = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T09:00:00.000Z', '2026-10-27T00:00:00.000Z', pending);
      expect(constrained.ok && constrained.snapshot.layers.violations.layer_direction).toEqual({ state: 'unavailable', reason: 'code_facts_unavailable' });
      const core = '.archcontext/model/nodes/component.module.core.yaml';
      fixtureWrite(root, core, fixtureYaml({ ...JSON.parse(readFileSync(join(root, core), 'utf8')), layer: 'web' }));
      fixtureCommit(root);
      expect(collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T09:00:00.000Z', '2026-10-27T00:00:00.000Z', pending)).toEqual({ id: 'repo_0123456789abcdef', ok: false, reason: 'model_unavailable' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('today\'s changes carry archctx\'s impact as given, and an answer that names a node the map lacks drops only that layer', () => {
    const map = projected();
    // No local roll-up, owner choice or model diff: the layer is archctx's answer.
    expect(map.layers.changes).toEqual(layers.changes);
    // Decisions and flow proofs pass through sorted by id; layer direction keeps the collector's answer.
    expect(map.layers.decisions.items.map(item => item.id)).toEqual(['ADR-0001-ledger', 'ADR-0002-gate']);
    expect(map.layers.violations.flows).toEqual({ state: 'ok', selectors: 3, proven: 1, unproven: 2, used_unproven: 1, unprovable: [{ id: CAP, diagnostics: 2 }, { id: OTHER, diagnostics: 1 }],
      evidence: [{ ...WRITE, status: 'proven' }, { ...DENY, status: 'no-direct-call' }] });
    expect(map.layers.violations.layer_direction).toEqual({ state: 'ok', imports: 12, edges: [] });
    // archctx may report a stale anchor with no path; that is a valid debt item, not a broken map.
    const anchorOnly = projectArchitectureMap({ ...input, sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'model_worktree_dirty' },
      layers: { ...layers, violations: { ...layers.violations, debt: { state: 'ok', items: [{ kind: 'stale-anchor', nodes: [PART], paths: [] }] } } } });
    expect(anchorOnly.layers.violations.debt).toEqual({ state: 'ok', items: [{ kind: 'stale-anchor', nodes: [PART], paths: [] }] });
    const changes = layers.changes.state === 'ok' ? layers.changes : null;
    const withChanges = (value: ArchitectureMapLayersInput['changes']) => projectArchitectureMap({
      ...input, sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'model_worktree_dirty' },
      layers: { ...layers, changes: value },
    });
    const failed = { state: 'unavailable', reason: 'archctx_failed' } as const;
    // A removed node owns a path only while the model change says the change removed it.
    expect(withChanges({ ...changes!, model: changes!.model.filter(entry => entry.id !== GONE) }).layers.changes).toEqual(failed);
    expect(withChanges({ ...changes!, dependents: [{ id: OTHER, touched: CAP, relations: ['relation.gone'] }] }).layers.changes).toEqual(failed);
    const unknown = withChanges({ ...changes!, paths: changes!.paths.map(entry => (entry.path === 'src/store.ts' ? { ...entry, owners: ['capability.gone.node'] } : entry)) });
    expect(unknown.layers.changes).toEqual(failed);
    expect(unknown.layers.violations.debt.state).toBe('ok');
    // A valid answer with a path that the public-path guard refuses keeps its own reason, not archctx's.
    for (const path of ['app/(marketing)/page.tsx', 'app/[slug]/page.tsx']) {
      const notPublic = withChanges({ ...changes!, paths: [...changes!.paths, { path, added: 1, deleted: 0, owners: [], reason_codes: [] }], unowned_paths: [...changes!.unowned_paths, path] });
      expect(notPublic.layers.changes).toEqual({ state: 'unavailable', reason: 'path_not_public' });
      expect(notPublic.layers.violations.debt.state).toBe('ok');
    }
    // A path the guard refuses next to a broken owner is still a broken answer.
    expect(withChanges({ ...changes!, paths: [...changes!.paths, { path: 'app/[slug]/page.tsx', added: 1, deleted: 0, owners: ['capability.gone.node'], reason_codes: [] }] }).layers.changes).toEqual(failed);
    // archctx's own refusal passes through with its codes.
    const refused = withChanges({ state: 'unavailable', reason: 'archctx_error', code: 'AC_SCHEMA_INVALID', reason_code: 'native-context-model-invalid' });
    expect(decodeArchitectureMap(JSON.parse(JSON.stringify(refused))).layers.changes)
      .toEqual({ state: 'unavailable', reason: 'archctx_error', code: 'AC_SCHEMA_INVALID', reason_code: 'native-context-model-invalid' });
  });

  test('an archctx refusal keeps archctx\'s codes as opaque tokens of the archctx shape', () => {
    const refusal = archctxRefusal('AC_SCHEMA_INVALID', 'native-document-marker-invalid');
    expect(refusal).toEqual({ state: 'unavailable', reason: 'archctx_error', code: 'AC_SCHEMA_INVALID', reason_code: 'native-document-marker-invalid' });
    expect(archctxRefusal('AC_PRECONDITION_FAILED', undefined)).toEqual({ state: 'unavailable', reason: 'archctx_error', code: 'AC_PRECONDITION_FAILED', reason_code: null });
    for (const [code, reasonCode] of [['schema invalid', null], [7, null], ['AC_SCHEMA_INVALID', 'Bad Reason'], ['AC_SCHEMA_INVALID', 3]] as const) expect(archctxRefusal(code, reasonCode)).toBeNull();
    const map = projectArchitectureMap({ ...input, sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'model_worktree_dirty' },
      layers: { ...layers, violations: { ...layers.violations, flows: refusal! } } });
    expect(decodeArchitectureMap(JSON.parse(JSON.stringify(map))).layers.violations.flows).toEqual(refusal!);
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

  test('PR impact carries archctx\'s answer for each open PR; a PR with no head, no complete list or an archctx refusal keeps its reason', () => {
    expect(projected().layers.pull_requests).toEqual(layers.pull_requests);
    const prs = layers.pull_requests.state === 'ok' ? layers.pull_requests : null;
    // A PR answer that names a node the map lacks drops only that PR to `archctx_failed`.
    const unknown = projectArchitectureMap({ ...input, sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'model_worktree_dirty' },
      layers: { ...layers, pull_requests: { ...prs!, pull_requests: prs!.pull_requests.map(pr => (pr.number === 7 ? { ...pr, impact: { state: 'ok', ...prImpact, nodes: [{ id: 'capability.gone.node', files: 1 }] } } : pr)) } } });
    expect(unknown.layers.pull_requests.state === 'ok' && unknown.layers.pull_requests.pull_requests.map(pr => [pr.number, pr.impact.state === 'unavailable' ? pr.impact.reason : 'ok']))
      .toEqual([[7, 'archctx_failed'], [8, 'files_truncated'], [9, 'head_missing'], [10, 'archctx_error']]);
    expect(unknown.layers.changes.state).toBe('ok');
    // A valid PR answer with a path that the public-path guard refuses keeps its own reason.
    const notPublic = projectArchitectureMap({ ...input, sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'model_worktree_dirty' },
      layers: { ...layers, pull_requests: { ...prs!, pull_requests: prs!.pull_requests.map(pr => (pr.number === 7
        ? { ...pr, impact: { state: 'ok', ...prImpact, paths: [...prImpact.paths, { path: 'app/(marketing)/page.tsx', added: null, deleted: null, owners: [], reason_codes: [] }], unowned_paths: [...prImpact.unowned_paths, 'app/(marketing)/page.tsx'] } }
        : pr)) } } });
    expect(notPublic.layers.pull_requests.state === 'ok' && notPublic.layers.pull_requests.pull_requests.map(pr => [pr.number, pr.impact.state === 'unavailable' ? pr.impact.reason : 'ok']))
      .toEqual([[7, 'path_not_public'], [8, 'files_truncated'], [9, 'head_missing'], [10, 'archctx_error']]);
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
      column_since: at, worktrees: [], pull_request: pr,
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
    refused(copy => { copy.layers.changes.unowned_paths = []; });
    refused(copy => { copy.layers.changes.model[2].change = 'removed'; });
    refused(copy => { copy.layers.changes.model[3].id = 'relation.gone'; });
    refused(copy => { copy.layers.changes.model[0].kind = 'decisions'; });
    refused(copy => { copy.layers.changes.paths[0].path = '/Users/someone/repo/README.md'; });
    refused(copy => { copy.layers.changes.paths[1].reason_codes = ['Binary Diff']; });
    refused(copy => { copy.layers.changes.flow_steps.reason_codes = ['impact-truncated']; });
    refused(copy => { copy.layers.changes.dependents[0].relations = []; });
    refused(copy => { delete copy.layers.changes.truncated.paths; });
    refused(copy => { copy.layers.violations.debt.items[0].paths = ['/Users/someone/repo/src/orphan.ts']; });
    refused(copy => { copy.layers.violations.debt.items[0].paths = ['src/../../outside.ts']; });
    refused(copy => { copy.layers.violations.debt.items[0].kind = 'undeclared-dependency'; });
    refused(copy => { copy.layers.violations.flows.unprovable[0].id = PART; });
    refused(copy => { copy.layers.violations.flows = { state: 'unavailable', reason: 'archctx_error', code: 'schema invalid', reason_code: null }; });
    refused(copy => { copy.layers.violations.flows = { state: 'unavailable', reason: 'archctx_error', code: 'AC_SCHEMA_INVALID', reason_code: 'Not_Kebab' }; });
    refused(copy => { copy.layers.violations.layer_direction = { state: 'unavailable', reason: 'layer_order_not_released' }; });
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
    refused(copy => { copy.layers.pull_requests.pull_requests[0].impact.unowned_paths = ['src/store.ts']; });
    refused(copy => { copy.layers.pull_requests.pull_requests[0].impact.dependents[0].touched = 'capability.gone.node'; });
    refused(copy => { copy.layers.pull_requests.pull_requests[3].impact.code = 'not a code'; });
    refused(copy => { copy.layers.pull_requests.pull_requests[0].title = 'Fix /Users/someone/secret'; });
    refused(copy => { copy.layers.pull_requests.pull_requests[0].url = 'https://example.invalid/pull/7'; });
    refused(copy => { copy.layers.pull_requests.flow_steps = { state: 'unavailable', reason: 'change_impact_not_exported' }; });
    refused(copy => { copy.layers.decisions = { state: 'unavailable', reason: 'code_facts_unavailable' }; });
    refused(copy => { copy.layers.decisions.items[0].applies_to = ['capability.gone.node']; });
    refused(copy => { copy.layers.decisions.items[1].id = copy.layers.decisions.items[0].id; });
    refused(copy => { copy.layers.decisions.items[0].title = 'Read /Users/someone/secret'; });
    refused(copy => { copy.layers.decisions.items[0].path = '/Users/someone/repo/docs/adr/ADR-0001-ledger.md'; });
    refused(copy => { copy.schema_version = 'repo-harness.architecture-map.v2'; });
    refused(copy => { copy.schema_version = 'repo-harness.architecture-map.v3'; });
    refused(copy => { copy.schema_version = 'repo-harness.architecture-map.v4'; });
    refused(copy => { copy.schema_version = 'repo-harness.architecture-map.v5'; });
    refused(copy => { copy.layers.violations.layer_direction = { state: 'unavailable', reason: 'layer_direction_not_read' }; });
  });

  test('flows, their declared code and archctx\'s step proofs pass through by id and selector, and the decoder refuses a flow that names what the map lacks', () => {
    const map = projected();
    expect(map.flows.map(entry => entry.id)).toEqual([FLOW, 'flow.review.gate']);
    expect(map.flows[0]).toEqual(flows[1]);
    expect(map.flow_evidence).toEqual(flowEvidence);
    const copy = JSON.parse(JSON.stringify(map));
    expect(decodeArchitectureMap(copy)).toEqual(map);
    const refused = (change: (value: typeof copy) => void) => {
      const value = JSON.parse(JSON.stringify(copy));
      change(value);
      expect(() => decodeArchitectureMap(value)).toThrow('architecture_map_invalid');
    };
    refused(value => { delete value.flows; });
    refused(value => { value.flows[0].participants[1].node = 'component.pipeline.ghost'; });
    refused(value => { value.flows[0].participants.push(value.flows[0].participants[0]); });
    refused(value => { value.flows[0].steps[0].to = 'ghost'; });
    refused(value => { value.flows[0].outcomes[1].steps[0].from = 'ghost'; });
    refused(value => { value.flows[0].outcomes[0].terminal.participant = 'ghost'; });
    refused(value => { value.flows[0].outcomes[0].kind = 'partial'; });
    refused(value => { value.flows[0].outcomes.push(value.flows[0].outcomes[0]); });
    refused(value => { value.flows[0].steps.push(value.flows[0].steps[0]); });
    refused(value => { value.flows[0].capability = PART; });
    refused(value => { value.flows[1].id = FLOW; });
    refused(value => { value.flows[1].participants = []; });
    refused(value => { value.flows[0].steps[0].label = 'Write /Users/someone/ledger.db'; });
    refused(value => { value.flows[0].steps[0].evidence.extra = 'x'; });
    // Declared code: once per selector, for a selector a step names, from a node of the map, at a public path or null.
    refused(value => { value.flow_evidence.push(value.flow_evidence[0]); });
    refused(value => { value.flow_evidence[0].sink = 'sink.pipeline.other'; });
    refused(value => { value.flow_evidence[0].node = 'capability.gone.node'; });
    refused(value => { value.flow_evidence[0].source_path = '/Users/someone/repo/src/ledger.ts'; });
    refused(value => { value.flow_evidence[0].sink_path = 'app/[slug]/page.tsx'; });
    expect(decodeArchitectureMap({ ...copy, flow_evidence: [{ ...copy.flow_evidence[0], source_path: null, sink_path: null }] }).flow_evidence[0]?.source_path).toBeNull();
    // archctx's status is an opaque token; each proof names a step selector once.
    refused(value => { value.layers.violations.flows.evidence[0].status = 'Proven'; });
    refused(value => { value.layers.violations.flows.evidence.push(value.layers.violations.flows.evidence[0]); });
    refused(value => { value.layers.violations.flows.evidence[0].entrypoint = 'entrypoint.pipeline.other'; });
    // A flow change names a flow of the map, and a step that today's change reaches is a step of that flow.
    refused(value => { value.layers.changes.model[0].change = 'removed'; });
    refused(value => { value.layers.changes.flow_steps.items[0].step = 'ghost'; });
    refused(value => { value.layers.changes.flow_steps.items[0].outcome = 'stored'; });
    expect(decodeArchitectureMap({ ...copy, layers: { ...copy.layers, changes: { ...copy.layers.changes,
      flow_steps: { status: 'known', reason_codes: [], items: [{ flow: FLOW, step: 'deny', outcome: 'refused', reason_codes: [] }] } } } }).layers.changes.state).toBe('ok');
  });

  test('an impact answer that names a flow step the model lacks drops only that layer or that PR', () => {
    const changes = layers.changes.state === 'ok' ? layers.changes : null;
    const prs = layers.pull_requests.state === 'ok' ? layers.pull_requests : null;
    const ghost = { status: 'known' as const, reason_codes: [], items: [{ flow: FLOW, step: 'ghost', outcome: null, reason_codes: [] }] };
    const map = projectArchitectureMap({
      ...input, sizes: { state: 'unavailable', reason: 'model_worktree_dirty' }, dependencies: { state: 'unavailable', reason: 'model_worktree_dirty' },
      layers: { ...layers, changes: { ...changes!, flow_steps: ghost },
        pull_requests: { ...prs!, pull_requests: prs!.pull_requests.map(pr => (pr.number === 7 ? { ...pr, impact: { state: 'ok', ...prImpact, flow_steps: ghost } } : pr)) } },
    });
    expect(map.layers.changes).toEqual({ state: 'unavailable', reason: 'archctx_failed' });
    expect(map.layers.pull_requests.state === 'ok' && map.layers.pull_requests.pull_requests.map(pr => pr.impact.state === 'unavailable' ? pr.impact.reason : 'ok'))
      .toEqual(['archctx_failed', 'files_truncated', 'head_missing', 'archctx_error']);
    expect(map.flows.length).toBe(2);
  });

  test('a flows check report keeps archctx\'s status for each selector a flow step names', () => {
    const selector = (entrypointId: string, sourceSymbol: string, sinkId: string, status: string, flowSteps: { flowId: string; stepId: string }[]) => ({
      nodeId: CAP, entrypointId, sourcePath: 'src/ledger.ts', sourceSymbol, sinkId, sinkPath: 'src/store.ts', sinkSymbol: 'put', status,
      callSites: [], referenceSites: [], rejectedBuiltinCallSites: [], flowSteps,
    });
    const report = (fields: Record<string, unknown> = {}) => decodeFlowSelectorCheck({
      schemaVersion: 'archcontext.flow-selector-check/v1', ok: false, codeGraph: { availability: 'ready', version: '1.6.2' },
      summary: { selectors: 3, proven: 1, unproven: 2, usedUnproven: 1 },
      selectors: [
        selector(WRITE.entrypoint, WRITE.source_symbol, WRITE.sink, 'proven', [{ flowId: FLOW, stepId: 'store' }]),
        selector(DENY.entrypoint, DENY.source_symbol, DENY.sink, 'no-direct-call', [{ flowId: FLOW, stepId: 'deny' }]),
        selector('entrypoint.pipeline.read', 'read', 'sink.pipeline.store', 'only-references', []),
      ],
      capabilities: [{ capabilityId: CAP, p2Status: 'unprovable', diagnostics: [{ code: 'flow-step-unproven', flowId: FLOW, stepId: 'deny', detail: 'No direct call.' }] }],
      ...fields,
    });
    const steps = new Set([WRITE, DENY].map(entry => `${entry.entrypoint}\0${entry.source_symbol}\0${entry.sink}`));
    expect(flowProofSection(report(), new Set([CAP]), steps)).toEqual({
      state: 'ok', selectors: 3, proven: 1, unproven: 2, used_unproven: 1, unprovable: [{ id: CAP, diagnostics: 1 }],
      evidence: [{ ...WRITE, status: 'proven' }, { ...DENY, status: 'no-direct-call' }],
    });
    const failed = { state: 'unavailable', reason: 'archctx_failed' } as const;
    expect(flowProofSection(report(), new Set([OTHER]), steps)).toEqual(failed);
    const twice = report();
    expect(flowProofSection({ ...twice, selectors: [...twice.selectors, twice.selectors[0]!] }, new Set([CAP]), steps)).toEqual(failed);
    expect(flowProofSection(report({ codeGraph: { availability: 'unavailable', version: '1.6.2' } }), new Set([CAP]), steps)).toEqual({ state: 'unavailable', reason: 'code_facts_unavailable' });
  });

  test('the layer-direction layer names map nodes in their own layers, and only imports up the layer order', () => {
    const map = JSON.parse(JSON.stringify(projected()));
    // `cli` is above `core`: an import from a `core` node into a `cli` node goes against the order.
    map.nodes.find((entry: ArchitectureMapNodeV1) => entry.id === OTHER).layer = 'cli';
    map.layers.violations.layer_direction = { state: 'ok', imports: 12, edges: [{ source: CAP, target: OTHER, source_layer: 'core', target_layer: 'cli', imports: 2 }] };
    expect(decodeArchitectureMap(map)).toEqual(map);
    const refused = (change: (copy: typeof map) => void) => {
      const copy = JSON.parse(JSON.stringify(map));
      change(copy);
      expect(() => decodeArchitectureMap(copy)).toThrow('architecture_map_invalid');
    };
    refused(copy => { copy.layers.violations.layer_direction.edges[0].target = 'capability.gone.node'; });
    refused(copy => { copy.layers.violations.layer_direction.edges[0].target_layer = 'core'; });
    refused(copy => { copy.layers.violations.layer_direction.edges[0].source_layer = 'cli'; });
    refused(copy => { copy.layers.violations.layer_direction.edges[0] = { source: OTHER, target: CAP, source_layer: 'cli', target_layer: 'core', imports: 2 }; });
    refused(copy => { copy.layers.violations.layer_direction.edges.push(copy.layers.violations.layer_direction.edges[0]); });
    refused(copy => { copy.layers.violations.layer_direction.edges[0].imports = 0; });
    refused(copy => { copy.layer_order = { state: 'unavailable', reason: 'model_layers_undeclared' }; });
    // A model with no ordered layers, or no layer-direction constraint, is a fixed note, not a failed read.
    for (const reason of ['model_layers_undeclared', 'layer_direction_undeclared', 'layer_endpoint_unclassified'] as const) {
      expect(decodeArchitectureMap({ ...map, layers: { ...map.layers, violations: { ...map.layers.violations, layer_direction: { state: 'unavailable', reason } } } })
        .layers.violations.layer_direction).toEqual({ state: 'unavailable', reason });
    }
  });

  test('a constraints check report becomes one edge per owner pair for the layer-direction constraints only', () => {
    const LAYER = 'constraint.architecture.layer-direction';
    const violation = (fromPath: string, constraintId = LAYER) => ({
      constraintId, fromPath, toPath: 'src/cli/index.ts', fromNode: CAP, toNode: OTHER, fromLayer: 'core', toLayer: 'cli', severity: 'warning' as const,
    });
    const report = (fields: Record<string, unknown> = {}) => decodeConstraintEvaluation({
      schemaVersion: 'archcontext.dependency-constraint-evaluation/v1', status: 'violated', coverage: 'complete', reasonCodes: [],
      constraintIds: [LAYER, 'constraint.architecture.no-ui'], importEdgeCount: 40, unresolvedImports: [],
      violations: [violation('src/core/a.ts'), violation('src/core/b.ts'),
        { ...violation('src/core/c.ts', 'constraint.architecture.no-ui'), fromLayer: undefined, toLayer: undefined }],
      ...fields,
    });
    const known = new Set([CAP, OTHER, PART]);
    const layered = new Set([LAYER]);
    expect(layerDirectionSection(report(), layered, known)).toEqual({ state: 'ok', imports: 40,
      edges: [{ source: CAP, target: OTHER, source_layer: 'core', target_layer: 'cli', imports: 2 }] });
    const failed = { state: 'unavailable', reason: 'archctx_failed' } as const;
    expect(layerDirectionSection(report({ constraintIds: ['constraint.architecture.no-ui'] }), layered, known)).toEqual(failed);
    expect(layerDirectionSection(report(), layered, new Set([CAP]))).toEqual(failed);
    expect(layerDirectionSection(report({ violations: [{ ...violation('src/core/a.ts'), toLayer: undefined }] }), layered, known)).toEqual(failed);
    // An undetermined answer keeps archctx's cause.
    const undetermined = (reasonCodes: string[]) => layerDirectionSection(report({ status: 'undetermined', coverage: 'partial', reasonCodes, violations: [] }), layered, known);
    expect(undetermined(['layer-endpoint-unclassified'])).toEqual({ state: 'unavailable', reason: 'layer_endpoint_unclassified' });
    expect(undetermined(['code-facts-stale'])).toEqual({ state: 'unavailable', reason: 'code_facts_unavailable' });
    expect(undetermined(['unresolved-import'])).toEqual({ state: 'unavailable', reason: 'code_facts_incomplete' });
    expect(() => report({ status: 'unknown' })).toThrow('archctx constraints check status is invalid');
    expect(() => report({ reasonCodes: ['not-a-code'] })).toThrow('archctx constraints check reason codes are invalid');
  });

  test('a checkout or edit during a cycle drops PR impact when the model moved and each violation check when the tree moved', () => {
    const commit = 'c'.repeat(40);
    const clean = { head: commit, modelClean: true, treeClean: true };
    // Today's changes read only commits, so the recheck does not take them.
    const read = { pull_requests: layers.pull_requests, violations: layers.violations };
    const changed = { state: 'unavailable', reason: 'checkout_changed' } as const;
    // Flow proofs and the layer-direction check read the CodeGraph index like the other checks.
    const allChanged = { debt: changed, flows: changed, anchors: changed, dependencies: changed, layer_direction: changed };
    expect(recheckLayers(commit, clean, clean, read)).toEqual(read);
    expect(recheckLayers(commit, clean, { ...clean, head: 'd'.repeat(40) }, read)).toEqual({ pull_requests: changed, violations: allChanged });
    expect(recheckLayers(commit, clean, { ...clean, treeClean: false }, read)).toEqual({ pull_requests: read.pull_requests, violations: allChanged });
    expect(recheckLayers(commit, clean, { ...clean, modelClean: false, treeClean: false }, read)).toEqual({ pull_requests: changed, violations: allChanged });
    expect(localMidnight(new Date(2026, 9, 27, 18, 30))).toBe(new Date(2026, 9, 27).toISOString());
  });

  const dated = (date: string, step: () => void) => {
    process.env.GIT_AUTHOR_DATE = date;
    process.env.GIT_COMMITTER_DATE = date;
    try { step(); } finally { delete process.env.GIT_AUTHOR_DATE; delete process.env.GIT_COMMITTER_DATE; }
  };
  /** Moves the fixture's only commit before today's window, so it is the base of today's changes. */
  const baseBeforeToday = (root: string) => {
    dated('2026-10-20T00:00:00Z', () => fixtureGit(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--amend', '--no-edit', '--quiet']));
    return fixtureGit(root, ['rev-parse', 'HEAD']);
  };

  test('the worker reads today\'s first-parent changes and each open PR\'s impact from archctx impact', () => {
    const root = realpathSync(moduleRepository());
    try {
      const base = baseBeforeToday(root);
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
      // `--paths-from` has no line counts; the owners come from the map commit's model.
      expect(result.snapshot.layers.pull_requests).toEqual({ state: 'ok', observed_at: '2026-10-27T12:59:00.000Z', pull_requests: [
        { number: 5, title: 'Read more', url: 'https://github.com/acme/module/pull/5', head_sha: head, impact: {
          state: 'ok',
          paths: [{ path: 'docs/notes.md', added: null, deleted: null, owners: [], reason_codes: ['paths-only'] },
            { path: 'src/module/read.ts', added: null, deleted: null, owners: [MODULE_ID], reason_codes: ['paths-only'] }],
          unowned_paths: ['docs/notes.md'], nodes: [{ id: MODULE_ID, files: 1 }], dependents: [], dependency_coverage: 'complete',
          flow_steps: { status: 'unknown', reason_codes: ['line-impact-unavailable', 'ref-code-facts-unavailable'], items: null }, truncated: whole,
        } }] });
      // The model file is not in any node's footprint; the fixture has no CodeGraph index, so flow steps stay unknown.
      expect(result.snapshot.layers.changes).toEqual({
        state: 'ok', since: '2026-10-27T00:00:00.000Z', base, commits: 1,
        model: [{ kind: 'nodes', id: MODULE_ID, change: 'changed', fields: ['summary'] }],
        paths: [{ path: MODULE_NODE, added: 1, deleted: 1, owners: [], reason_codes: [] },
          { path: 'src/module/read.ts', added: 2, deleted: 1, owners: [MODULE_ID], reason_codes: [] }],
        unowned_paths: [MODULE_NODE], nodes: [{ id: MODULE_ID, files: 1 }], dependents: [], dependency_coverage: 'complete',
        flow_steps: { status: 'unknown', reason_codes: ['ref-code-facts-unavailable'], items: null }, truncated: whole,
      });
      // The fixture has no CodeGraph index: each check that reads it says so; nothing is filled in, and no check syncs an index.
      expect(result.snapshot.layers.violations.anchors).toEqual({ state: 'unavailable', reason: 'code_facts_unavailable' });
      expect(result.snapshot.layers.violations.flows).toEqual({ state: 'unavailable', reason: 'code_facts_unavailable' });
      expect(result.snapshot.layers.violations.dependencies).toEqual({ state: 'unavailable', reason: 'code_facts_unavailable' });
      // A window that holds the whole history has no base commit.
      const all = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T13:00:00.000Z', '2026-10-19T00:00:00.000Z', pending);
      expect(all.ok && all.snapshot.layers.changes).toEqual({ state: 'unavailable', reason: 'history_starts_today' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('a PR impact deadline leaves the other map layers intact', () => {
    const root = realpathSync(moduleRepository());
    try {
      baseBeforeToday(root);
      const source: ArchitecturePullRequestsSource = {
        state: 'ok', observed_at: '2026-10-27T12:59:00.000Z',
        pull_requests: Array.from({ length: 3 }, (_, index) => ({
          number: index + 1, title: 'Read more', url: `https://github.com/acme/module/pull/${index + 1}`,
          head_sha: 'a'.repeat(40), changed_files: { state: 'ok', paths: ['src/module/read.ts'] },
        })),
      };
      const baseline = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T13:00:00.000Z', '2026-10-27T00:00:00.000Z', pending);
      const bounded = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T13:00:00.000Z', '2026-10-27T00:00:00.000Z', source, 1);
      if (!baseline.ok || !bounded.ok) throw new Error('worker failed');
      const pulls = bounded.snapshot.layers.pull_requests;
      expect(pulls.state === 'ok' && pulls.pull_requests.map(pr => pr.impact)).toEqual(
        source.pull_requests.map(() => ({ state: 'unavailable', reason: 'archctx_failed' })),
      );
      expect(decodeArchitectureMap(bounded.snapshot)).toEqual(bounded.snapshot);
      expect({ ...bounded.snapshot, layers: { ...bounded.snapshot.layers, pull_requests: baseline.snapshot.layers.pull_requests } }).toEqual(baseline.snapshot);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('an archctx refusal of the base commit leaves today\'s changes without data and keeps archctx\'s codes; the map stays', () => {
    const root = realpathSync(moduleRepository());
    try {
      // The base commit holds a node that fails the model schema; today's commit removes it.
      const broken = '.archcontext/model/nodes/component.module.broken.yaml';
      fixtureWrite(root, broken, fixtureYaml({ schemaVersion: 'archcontext.node/v2', id: 'component.module.broken' }));
      fixtureGit(root, ['add', '.']);
      baseBeforeToday(root);
      dated('2026-10-27T12:00:00Z', () => { rmSync(join(root, broken)); fixtureCommit(root); });
      const result = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T13:00:00.000Z', '2026-10-27T00:00:00.000Z', pending);
      if (!result.ok) throw new Error('worker failed');
      expect(result.snapshot.layers.changes).toEqual({ state: 'unavailable', reason: 'archctx_error', code: 'AC_SCHEMA_INVALID', reason_code: 'native-context-model-invalid' });
      expect(result.snapshot.sizes.state).toBe('ok');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('archctx impact stops at 1000 changed paths and the map says which parts it cut', () => {
    const root = realpathSync(moduleRepository());
    try {
      baseBeforeToday(root);
      dated('2026-10-27T12:00:00Z', () => {
        for (let index = 0; index < 1001; index++) fixtureWrite(root, `src/module/generated/file-${String(index).padStart(4, '0')}.ts`, `export const value = ${index};\n`);
        fixtureCommit(root);
      });
      const result = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T13:00:00.000Z', '2026-10-27T00:00:00.000Z', pending);
      if (!result.ok || result.snapshot.layers.changes.state !== 'ok') throw new Error('worker failed');
      const { changes } = result.snapshot.layers;
      expect([changes.paths.length, changes.paths.at(-1)?.path, changes.nodes]).toEqual([1000, 'src/module/generated/file-0999.ts', [{ id: MODULE_ID, files: 1000 }]]);
      expect([changes.truncated, changes.dependency_coverage, changes.flow_steps.reason_codes]).toEqual([
        { paths: true, nodes: false, relations: false, flow_steps: false, dependents: false, model: false }, 'partial', ['impact-truncated', 'ref-code-facts-unavailable']]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('a committed path that the public-path guard refuses leaves the layer or the PR with its own reason, not archctx\'s', () => {
    const root = realpathSync(moduleRepository());
    try {
      baseBeforeToday(root);
      dated('2026-10-27T12:00:00Z', () => {
        fixtureWrite(root, 'app/(group)/page.tsx', 'export default function Page() { return null; }\n');
        fixtureCommit(root);
      });
      const source: ArchitecturePullRequestsSource = { state: 'ok', observed_at: '2026-10-27T12:59:00.000Z', pull_requests: [
        { number: 6, title: 'Group page', url: 'https://github.com/acme/module/pull/6', head_sha: 'b'.repeat(40), changed_files: { state: 'ok', paths: ['app/(group)/page.tsx'] } }] };
      const result = collectArchitectureMap('repo_0123456789abcdef', root, '2026-10-27T13:00:00.000Z', '2026-10-27T00:00:00.000Z', source);
      if (!result.ok) throw new Error('worker failed');
      expect(result.snapshot.layers.changes).toEqual({ state: 'unavailable', reason: 'path_not_public' });
      const pulls = result.snapshot.layers.pull_requests;
      expect(pulls.state === 'ok' && pulls.pull_requests.map(pr => pr.impact)).toEqual([{ state: 'unavailable', reason: 'path_not_public' }]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
