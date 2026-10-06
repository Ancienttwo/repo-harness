import { describe, expect, test } from 'bun:test';
import {
  buildDocsGraph, docsDocumentKind, docsTimestamp, type DocsDocument, type DocsGraphInput,
} from '../../src/core/docs/docs-graph';

const COMMIT = 'a'.repeat(40), BLOB = 'b'.repeat(40);
const NOW = '2026-10-06T12:00:00Z';
const doc = (path: string, headers = '', time: string | null = '2026-10-06T10:00:00Z'): DocsDocument => ({
  path, content: '# Fixture\n' + headers, blob_oid: BLOB,
  last_commit: time ? { commit: COMMIT, time } : null,
});
const graph = (documents: DocsDocument[], options: Partial<DocsGraphInput> = {}) => buildDocsGraph({ commit: COMMIT, now: NOW, documents, ...options });
const prd = 'plans/prds/child.prd.md', parent = 'plans/prds/parent.prd.md', sprint = 'plans/sprints/fixture.sprint.md';
const plan = 'plans/plan-fixture.md', contract = 'tasks/contracts/fixture.contract.md';

describe('Docs graph pure projection', () => {

  test('reads real repository preambles with historical prose and interleaved comments', () => {
    // These metadata forms occur at the source paths below in base 982d5de3.
    const campaign = 'plans/prds/20260902-2238-gpt-pro-seeded-repair-campaign.prd.md';
    const simplification = 'plans/prds/20260925-0436-harness-simplification.prd.md';
    const sources = [
      { ...doc(campaign), content: '# PRD: GPT Pro-Seeded Bounded Repair Campaign\n\n'
        + '> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04.\n\n'
        + '> **Status**: Approved\n> **Updated**: 2026-09-07 01:31\n> **Source Spec**: `docs/spec.md`\n\n## AI Quick-Read Card\n' },
      { ...doc(simplification), content: '# PRD: Harness Simplification\n\n'
        + '> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04.\n\n'
        + '> **Status**: Draft\n> **Updated**: 2026-09-25\n> **Source Spec**: `docs/spec.md`\n\n## AI Quick-Read Card\n' },
      { ...doc('docs/spec.md'), content: '# Product Spec\n\n'
        + 'Campaign execution moved to the existing Bot skills on 2026-10-04.\n\n'
        + '> **Status**: Approved\n> **Owner**: repo-harness maintainers\n\n## Global Architecture Projection\n' },
      doc(contract, `> **Status**: Active\n> **Plan**: ${plan}\n`
        + '> <!-- legal values: code-change | docs-only | ledger-closeout; omit for legacy passthrough -->\n'
        + '> **Capability ID**: capability.runtime-harness.docs\n'
        + '> **Review File**: `tasks/reviews/fixture.review.md`\n> **Notes File**: `tasks/notes/fixture.notes.md`\n'
        + '\n## Body example\n> **Notes File**: tasks/notes/body.notes.md\n'),
      doc(plan, '> **Status**: Executing'), doc('tasks/reviews/fixture.review.md'), doc('tasks/notes/fixture.notes.md'),
    ];
    const result = graph(sources, { capabilities: [{ id: 'capability.runtime-harness.docs', path: '.archcontext/model/nodes/capability.runtime-harness.docs.yaml', blob_oid: BLOB, last_commit: null }] });
    expect(result.nodes.find(node => node.id === campaign)).toMatchObject({ status: 'Approved', updated: '2026-09-07T01:31:00.000Z', updated_source: 'header' });
    expect(result.nodes.find(node => node.id === simplification)).toMatchObject({ status: 'Draft', updated: '2026-09-25T00:00:00.000Z', updated_source: 'header' });
    expect(result.nodes.find(node => node.id === 'docs/spec.md')?.status).toBe('Approved');
    expect(result.edges.filter(edge => edge.label === 'Source Spec')).toHaveLength(2);
    expect(result.edges.filter(edge => edge.header_node === contract).map(edge => edge.label).sort()).toEqual(['Capability ID', 'Notes File', 'Plan', 'Review File']);
    expect(result.issues).toEqual([]);
  });

  test('indexes the actual archive-writer contract, review, and notes names', () => {
    const paths = {
      contract: 'tasks/archive/contract-20260904-1852-operator-board-r1-presentation.md',
      review: 'tasks/archive/review-20260904-1852-operator-board-r1-presentation.md',
      notes: 'tasks/archive/notes-20260904-1852-operator-board-r1-presentation.md',
    };
    for (const kind of ['contract', 'review', 'notes'] as const) expect(docsDocumentKind(paths[kind])).toBe(kind);
    const documents = [
      { ...doc(paths.contract), content: '> **Archived**: 2026-09-04 18:52\n> **Lifecycle**: contract\n\n'
        + '# Task Contract: operator-board-r1-presentation\n\n> **Status**: Fulfilled\n'
        + '> <!-- legal values: code-change | docs-only -->\n'
        + `> **Review File**: ${paths.review}\n> **Notes File**: ${paths.notes}\n\n## Why\n` },
      doc(paths.review), doc(paths.notes),
    ];
    expect(graph(documents)).toMatchObject({ archived_count: 3, nodes: [], edges: [] });
    const all = graph(documents, { scope: 'all' });
    expect(all.nodes).toHaveLength(3);
    expect(all.nodes.find(node => node.id === paths.contract)?.status).toBe('Fulfilled');
    expect(all.edges.map(edge => edge.target).sort()).toEqual([paths.notes, paths.review]);
    expect(all.issues).toEqual([]);
    expect(docsDocumentKind('tasks/archive/todo-20260904-1852-operator-board-r1-presentation.md')).toBeNull();
  });

  test('indexes artifact kinds and keeps explicit multi-parent and cyclic edges', () => {
    const result = graph([
      doc(prd, `> **Parent PRD**: \`${parent}\`\n> **Depends On**: ${sprint}`),
      doc(parent), doc(sprint, `> **Child PRD A (Active)**: \`${prd}\``),
      doc(plan, `> **Source PRD**: ${prd}\n> **Task Contract**: ${contract}\n> **Source Spec**: docs/spec.md`),
      doc(contract, `> **Plan**: ${plan}\n> **Review File**: tasks/reviews/fixture.review.md\n> **Notes File**: tasks/notes/fixture.notes.md`),
      doc('tasks/reviews/fixture.review.md'), doc('tasks/notes/fixture.notes.md'), doc('docs/spec.md'),
    ]);
    expect(result.nodes.map(node => node.kind).sort()).toEqual(['contract', 'notes', 'plan', 'prd', 'prd', 'review', 'spec', 'sprint']);
    expect(result.edges.filter(edge => edge.target === prd).map(edge => edge.source).sort()).toEqual([parent, sprint]);
    expect(result.edges.find(edge => edge.label === 'Child PRD A (Active)')).toEqual({
      source: sprint, target: prd, label: 'Child PRD A (Active)', header_node: sprint,
      header: `> **Child PRD A (Active)**: \`${prd}\``, slot: 'A', declared_status: 'Active',
    });
    expect(result.edges.some(edge => edge.source === prd && edge.target === sprint)).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test('reports missing and disallowed targets without reading or exposing absolute paths', () => {
    const result = graph([doc(plan, '> **Task Contract**: tasks/contracts/missing.contract.md\n> **Source Spec**: ../../etc/passwd\n> **Notes File**: /tmp/private.md')]);
    expect(result.issues.filter(issue => issue.kind === 'broken_link')).toHaveLength(3);
    expect(result.edges).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('/tmp/private.md');
    expect(JSON.stringify(result)).not.toContain('../../etc/passwd');
    for (const path of ['plans/../secrets.md', 'plans//plan-a.md', 'plans/plan-a.md?secret=x', 'plans/%2e%2e/plan-a.md', 'plans\\plan-a.md', '/plans/plan-a.md']) expect(docsDocumentKind(path)).toBeNull();
  });

  test('reads only metadata and path dependency values, with no filename or prose inference', () => {
    const result = graph([
      doc(plan, `> **Depends On**: ME-2A; ${prd}\n\n## Example\n> **Task Contract**: ${contract}`),
      doc(prd), doc(contract),
    ]);
    expect(result.edges.map(edge => edge.label)).toEqual(['Depends On']);
    expect(result.edges[0]!.target).toBe(prd);
    expect(result.issues).toEqual([]);
  });


  test('excludes examples after indented Markdown headings and inside comments', () => {
    for (const indent of ['', ' ', '  ', '   ']) {
      const result = graph([doc(plan, `> **Status**: Draft\n\n${indent}## Example\n> **Task Contract**: ${contract}`), doc(contract)]);
      expect(result.edges).toEqual([]);
    }
    const commented = graph([doc(plan, `> <!--\n> **Task Contract**: ${contract}\n> -->\n> **Status**: Approved\n`), doc(contract)]);
    expect(commented.edges).toEqual([]);
    expect(commented.nodes.find(node => node.id === plan)?.status).toBe('Approved');
  });

  test('keeps ambiguous and malformed headers unknown rather than choosing a target', () => {
    const result = graph([
      doc(plan, `> **Task Contract**: ${contract}\n> **task contract**: tasks/contracts/other.contract.md\n> **Status**: Active\n> **Status**: Draft\n> **Child PRD A**: ${prd}\n> **Updated**: not-a-date`),
      doc(contract), doc(prd),
    ]);
    expect(result.edges).toEqual([]);
    expect(result.nodes.find(node => node.id === plan)?.status).toBeNull();
    expect(result.nodes.find(node => node.id === plan)?.updated).toBeNull();
    expect(result.unknowns.map(item => item.reason).sort()).toEqual(['ambiguous_header', 'ambiguous_header', 'invalid_child_label', 'invalid_header']);
  });

  test('separates relationship conflicts from contract-plan status conflicts', () => {
    const other = 'plans/plan-other.md';
    const result = graph([
      doc(plan, `> **Status**: Executing\n> **Task Contract**: ${contract}`),
      doc(contract, `> **Status**: Active\n> **Plan**: ${other}`), doc(other, '> **Status**: Approved'),
    ]);
    expect(result.issues.filter(issue => issue.kind === 'relationship_conflict')).toEqual([
      { kind: 'relationship_conflict', node: contract, target: plan, detail: 'contract_plan_relationship' },
    ]);
    expect(result.issues.filter(issue => issue.kind === 'status_conflict')).toEqual([
      { kind: 'status_conflict', node: contract, target: other, detail: 'The active contract points to a plan that is not executing.' },
    ]);
    expect(graph([doc(plan, '> **Status**: Executing'), doc(contract, `> **Status**: Active\n> **Plan**: ${plan}`)]).issues).toEqual([]);
  });

  test('compares child activation independently of approval and retains unknown activation', () => {
    for (const label of ['Deferred — Phase 2', 'Active']) {
      for (const childActivation of ['Deferred — Phase 2', 'Active — Phase 1', null, 'Approved']) {
        const result = graph([doc(sprint, `> **Child PRD B (${label})**: ${prd}`),
          doc(prd, '> **Status**: Approved' + (childActivation ? `\n> **Activation**: ${childActivation}` : ''))]);
        const explicit = childActivation?.startsWith('Active') || childActivation?.startsWith('Deferred');
        const conflict = explicit && label.startsWith('Deferred') !== childActivation!.startsWith('Deferred');
        expect(result.issues.filter(issue => issue.kind === 'status_conflict')).toHaveLength(conflict ? 1 : 0);
        expect(result.unknowns.filter(item => item.field === 'child_activation')).toHaveLength(explicit ? 0 : 1);
      }
    }
    expect(graph([doc(sprint, `> **Child PRD D (Approved — Phase 1)**: ${prd}`), doc(prd, '> **Activation**: Active')]).issues).toEqual([]);
  });

  test('uses explicit capability identities without making model edges', () => {
    const cap = { id: 'capability.runtime-harness.docs', path: '.archcontext/model/nodes/capability.runtime-harness.docs.yaml', blob_oid: BLOB, last_commit: null };
    const result = graph([doc(plan, `> **Capability ID**: ${cap.id}`)], { capabilities: [cap] });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]!.source).toBe(cap.id);
    expect(result.nodes.find(node => node.id === cap.id)?.source.path).toBe(cap.path);
    expect(graph([doc(plan, '> **Capability ID**: capability.runtime-harness.missing')]).issues[0]?.kind).toBe('broken_link');
    expect(() => graph([], { capabilities: [cap, cap] })).toThrow('duplicate');
  });

  test('uses Updated before commit time and has deterministic UTC and unknown handling', () => {
    const result = graph([
      doc(plan, '> **Updated**: 2026-10-05 12:30'), doc(prd, '', '2026-10-05T18:00:00+0800'),
      doc(parent, '', null), doc(contract, '> **Updated**: nonsense'),
    ]);
    expect(result.nodes.find(node => node.id === plan)).toMatchObject({ updated: '2026-10-05T12:30:00.000Z', updated_source: 'header' });
    expect(result.nodes.find(node => node.id === prd)).toMatchObject({ updated: '2026-10-05T10:00:00.000Z', updated_source: 'commit' });
    expect(result.nodes.find(node => node.id === parent)?.updated).toBeNull();
    expect(result.nodes.find(node => node.id === contract)?.updated).toBeNull();
    expect(docsTimestamp('2026-02-30')).toBeNull();
    expect(docsTimestamp('yesterday')).toBeNull();
    expect(docsTimestamp('2026-10-05')).toBe('2026-10-05T00:00:00.000Z');
  });

  test('evaluates exact stale boundaries, overrides, future time, and explicit waits', () => {
    const cases = [
      ['Executing', 23.999, null], ['Executing', 24, 'hint'], ['Executing', 72, 'escalated'],
      ['Active', 167.999, null], ['Active', 168, 'hint'], ['Draft', 1000, null],
      ['waiting-on-approval', 1000, null], ['waiting-on-external', 1000, null],
    ] as const;
    for (const [status, hours, severity] of cases) {
      const updated = new Date(Date.parse(NOW) - hours * 3_600_000).toISOString();
      const result = graph([doc(plan, `> **Status**: ${status}\n> **Updated**: ${updated}`)]);
      expect(result.issues.filter(issue => issue.kind === 'stale').map(issue => issue.severity)).toEqual(severity ? [severity] : []);
      if (status.startsWith('waiting')) expect(result.nodes[0]!.waiting_on).toBe(status.endsWith('approval') ? 'approval' : 'external');
    }
    const source = doc(plan, '> **Status**: Executing\n> **Updated**: 2026-10-06T10:00:00Z');
    expect(graph([source], { thresholds: { executing_hint_hours: 1, executing_escalated_hours: 2 } }).issues[0]?.severity).toBe('escalated');
    expect(graph([doc(plan, '> **Status**: Executing\n> **Updated**: 2026-10-07')]).unknowns).toContainEqual({ node: plan, field: 'freshness', reason: 'updated_in_future' });
    expect(() => graph([], { thresholds: { active_days: -1 } })).toThrow('thresholds');
    expect(() => graph([], { thresholds: { executing_hint_hours: 100 } })).toThrow('thresholds');
  });

  test('bounds all scope and never reports hidden or capped targets as missing', () => {
    const archived = 'plans/archive/plan-old.md';
    const documents = [doc(plan, `> **Plan**: ${archived}`), doc(archived), doc(prd)];
    const active = graph(documents);
    expect(active.archived_count).toBe(1);
    expect(active.nodes.map(node => node.id)).not.toContain(archived);
    expect(active.edges).toEqual([]);
    expect(active.issues).toEqual([]);
    const all = graph(documents, { scope: 'all', max_nodes: 1 });
    expect(all.nodes).toHaveLength(1);
    expect(all.observation.omitted_count).toBe(2);
    expect(all.issues).toEqual([]);
    expect(() => graph(documents, { max_nodes: 0 })).toThrow('input');
  });

  test('is deterministic over source order and keeps cyclic traversal bounded', () => {
    const documents = [doc(plan, `> **Depends On**: ${prd}`), doc(prd, `> **Depends On**: ${plan}`)];
    expect(JSON.stringify(graph(documents))).toBe(JSON.stringify(graph([...documents].reverse())));
    expect(graph(documents).edges).toHaveLength(2);
    expect(() => graph([documents[0]!, documents[0]!])).toThrow('duplicate');
  });
});
