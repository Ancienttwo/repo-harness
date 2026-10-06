import type { ModuleDetailV1, ModuleIndexV1, ModuleState } from '../core/architecture/module-view';
import type { ModuleReviewPromptV1 } from '../core/review/module-review-prompt';

/**
 * Temporary shim for the core decoders in `src/core/operator/architecture.ts`.
 * The api lane owns that file. Integration replaces this import with the core
 * one; the three exported names and signatures are the same.
 */
type Shape = Record<string, unknown>;
const fail = (kind: string): never => { throw new Error(`architecture_${kind}_invalid`); };
const record = (value: unknown, kind: string): Shape => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Shape : fail(kind);
const text = (value: unknown, kind: string): string => typeof value === 'string' ? value : fail(kind);
const texts = (value: unknown, kind: string): string[] => Array.isArray(value) ? value.map(item => text(item, kind)) : fail(kind);
const list = (value: unknown, kind: string): unknown[] => Array.isArray(value) ? value : fail(kind);
const count = (value: unknown, kind: string): number => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : fail(kind);
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], kind: string): T => allowed.includes(value as T) ? value as T : fail(kind);

function state(value: unknown, kind: string): ModuleState {
  const item = record(value, kind);
  return {
    model_valid: oneOf(item.model_valid, ['valid', 'invalid', 'unknown'], kind),
    generated_summary: oneOf(item.generated_summary, ['fresh', 'stale', 'unknown'], kind),
    section3: oneOf(item.section3, ['present', 'pending'], kind),
  };
}

export function decodeArchitectureModuleIndex(value: unknown): ModuleIndexV1 {
  const item = record(value, 'modules');
  if (item.schema_version !== 'repo-harness.architecture-modules.v1') fail('modules');
  for (const module of list(item.modules, 'modules')) {
    const row = record(module, 'modules');
    for (const key of ['id', 'domain', 'name', 'status']) text(row[key], 'modules');
    count(row.components, 'modules'); state(row.state, 'modules');
  }
  text(item.commit, 'modules');
  return item as unknown as ModuleIndexV1;
}

export function decodeArchitectureModuleDetail(value: unknown): ModuleDetailV1 {
  const item = record(value, 'module');
  if (item.schema_version !== 'repo-harness.architecture-module.v1') fail('module');
  text(item.commit, 'module');
  const module = record(item.module, 'module');
  for (const key of ['id', 'name', 'status', 'summary']) text(module[key], 'module');
  texts(module.responsibilities, 'module'); texts(module.verification, 'module');
  for (const entry of list(module.entrypoints, 'module')) {
    const entrypoint = record(entry, 'module');
    text(entrypoint.path, 'module');
    for (const symbol of list(entrypoint.symbols, 'module')) {
      const named = record(symbol, 'module');
      text(named.name, 'module');
      for (const sink of list(named.sinks, 'module')) { const target = record(sink, 'module'); text(target.path, 'module'); text(target.symbol, 'module'); }
    }
  }
  const graph = record(item.graph, 'module');
  text(graph.center, 'module');
  for (const node of list(graph.nodes, 'module')) {
    const entry = record(node, 'module');
    text(entry.id, 'module');
    if (entry.kind === 'group') {
      oneOf(entry.role, ['caller', 'callee'], 'module'); count(entry.count, 'module');
      for (const member of list(entry.members, 'module')) { const named = record(member, 'module'); text(named.id, 'module'); text(named.name, 'module'); }
    } else {
      oneOf(entry.kind, ['capability', 'component'], 'module'); oneOf(entry.role, ['center', 'child', 'caller', 'callee'], 'module'); text(entry.name, 'module');
    }
  }
  for (const edge of list(graph.edges, 'module')) {
    const entry = record(edge, 'module');
    for (const key of ['source', 'target', 'intent', 'relation_kind']) text(entry[key], 'module');
    oneOf(entry.direction, ['directed', 'undirected'], 'module');
  }
  for (const flow of list(item.flows, 'module')) {
    const entry = record(flow, 'module');
    text(entry.id, 'module'); text(entry.name, 'module');
    if (entry.applicability === 'required') { list(entry.steps, 'module'); list(entry.outcomes, 'module'); }
    else if (entry.applicability === 'not-applicable') text(entry.rationale, 'module');
    else fail('module');
  }
  if (item.section3 !== null) text(item.section3, 'module');
  for (const doc of list(item.linked_docs, 'module')) {
    const entry = record(doc, 'module');
    text(entry.path, 'module'); oneOf(entry.kind, ['contract', 'plan'], 'module');
    if (entry.status !== null) text(entry.status, 'module');
  }
  state(item.state, 'module');
  return item as unknown as ModuleDetailV1;
}

export function decodeArchitectureReviewPrompt(value: unknown): ModuleReviewPromptV1 {
  const item = record(value, 'review_prompt');
  if (item.schema_version !== 'repo-harness.module-review-prompt.v1') fail('review_prompt');
  for (const key of ['capability_id', 'prompt', 'digest']) text(item[key], 'review_prompt');
  oneOf(item.mode, ['module', 'diff'], 'review_prompt');
  if (item.mode === 'diff') { text(item.base, 'review_prompt'); text(item.head, 'review_prompt'); }
  const budget = record(item.budget, 'review_prompt');
  count(budget.input_cap_bytes, 'review_prompt'); count(budget.used_bytes, 'review_prompt');
  texts(budget.omitted_sections, 'review_prompt');
  if (typeof budget.incomplete !== 'boolean') fail('review_prompt');
  const shard = record(item.shard, 'review_prompt');
  const index = count(shard.index, 'review_prompt');
  if (index < 1 || count(shard.count, 'review_prompt') < index) fail('review_prompt');
  return item as unknown as ModuleReviewPromptV1;
}
