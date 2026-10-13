import type { Json } from 'archctx-contracts';
import { ModuleReadError } from '../review/module-review-prompt';

/** The `kind` enum of archcontext.node/v2. A test checks it against the published schema. */
export const MODEL_NODE_KINDS = ['capability', 'module', 'component', 'interface', 'event', 'datastore', 'external-system', 'deployment'] as const;
export type ModelNodeKind = typeof MODEL_NODE_KINDS[number];

export interface ModuleState {
  model_valid: 'valid' | 'invalid' | 'unknown';
  generated_summary: 'fresh' | 'stale' | 'unknown';
  section3: 'present' | 'pending';
}
export interface ModelNode {
  id: string;
  kind: ModelNodeKind;
  name: string;
  status: string;
  summary: string;
  parent?: string;
  responsibilities?: string[];
  notes?: string[];
  source?: { include?: string[]; exclude?: string[]; entrypoints?: { id: string; path: string; symbols: { name: string; sinks: { id: string; path: string; symbol: string }[] }[] }[] };
  extensions?: { verification?: string[] };
}
export interface ModelRelation { id: string; kind: string; source: string; target: string; intent: string }
export type ModelFlow = { id: string; capabilityId: string; name: string } & (
  | { applicability: 'required'; participants: { id: string; nodeId: string }[]; steps: Json[]; outcomes: Json[] }
  | { applicability: 'not-applicable'; rationale: string }
);
type GraphRole = 'center' | 'child' | 'caller' | 'callee';
export type GraphNode = { id: string; kind: ModelNodeKind; name: string; role: GraphRole }
  | { id: string; kind: 'group'; role: 'caller' | 'callee'; count: number; members: { id: string; name: string }[] };
/** ArchContext reads every relation from source to target. */
export interface ModuleGraph {
  center: string;
  nodes: GraphNode[];
  edges: { source: string; target: string; intent: string; relation_kind: string; direction: 'directed' }[];
}
export interface LinkedModuleDoc { path: string; kind: 'contract' | 'plan'; status: string | null }
/** The declared source footprint. ArchContext owns the glob rules; this is a copy for readers. */
export interface SourceFootprint { include: string[]; exclude: string[] }
export interface ModuleComponent { id: string; kind: ModelNodeKind; name: string; summary: string; source: SourceFootprint }
export interface ModuleDetailV1 {
  schema_version: 'repo-harness.architecture-module.v1';
  commit: string;
  module: {
    id: string; name: string; status: string; summary: string; responsibilities: string[]; notes: string[];
    source: SourceFootprint; entrypoints: NonNullable<ModelNode['source']>['entrypoints']; verification: string[]; components: ModuleComponent[];
  };
  graph: ModuleGraph;
  flows: ModelFlow[];
  section3: string | null;
  linked_docs: LinkedModuleDoc[];
  state: ModuleState;
}
export interface ModuleIndexV1 {
  schema_version: 'repo-harness.architecture-modules.v1';
  commit: string;
  modules: { id: string; domain: string; name: string; status: string; components: number; state: ModuleState }[];
}

/**
 * Generated-summary freshness from one `architecture-projection check` result.
 * `complete` is false when the check failed for a reason that is not per node.
 */
export interface GeneratedSummaryFreshness {
  readonly commit: string;
  readonly staleNodeIds: ReadonlySet<string>;
  readonly complete: boolean;
}

/** Without a check result the state stays unknown. A listed node is stale. */
export function generatedSummaryState(freshness: GeneratedSummaryFreshness | null, id: string): ModuleState['generated_summary'] {
  if (freshness === null) return 'unknown';
  if (freshness.staleNodeIds.has(id)) return 'stale';
  return freshness.complete ? 'fresh' : 'unknown';
}

function markdownSection(text: string | null, heading: RegExp): string | null {
  if (text === null) return null;
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => heading.test(line));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^## /.test(line));
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
  return body || null;
}
export function section3FromMarkdown(text: string | null): string | null { return markdownSection(text, /^## 3\./); }
export function backlogFromMarkdown(text: string | null): string | null { return markdownSection(text, /^## Optimization Backlog\s*$/); }

function footprint(node: ModelNode): SourceFootprint {
  return { include: node.source?.include ?? [], exclude: node.source?.exclude ?? [] };
}

/** Parent is containment. Only explicit relations become edges. */
export function moduleGraph(center: string, nodes: readonly ModelNode[], relations: readonly ModelRelation[]): ModuleGraph {
  const local = new Set(nodes.filter(node => node.id === center || node.parent === center).map(node => node.id));
  const edges = relations.filter(relation => local.has(relation.source) || local.has(relation.target))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const roles = new Map<string, GraphRole>();
  for (const id of local) roles.set(id, id === center ? 'center' : 'child');
  for (const edge of edges) {
    if (!local.has(edge.source)) roles.set(edge.source, 'caller');
    if (!local.has(edge.target) && !roles.has(edge.target)) roles.set(edge.target, 'callee');
  }
  const projected: GraphNode[] = [...roles].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([id, role]) => {
    const node = byId.get(id);
    if (!node) throw new ModuleReadError('model_relation_target_invalid', id);
    return { id, name: node.name, kind: node.kind, role };
  });
  const remap = new Map<string, string>();
  for (const role of ['caller', 'callee'] as const) {
    const side = projected.filter(node => node.role === role);
    if (side.length <= 8) continue;
    const members = side.slice(8).map(node => ({ id: node.id, name: 'name' in node ? node.name : node.id }));
    const id = `group.${role}.${center}`;
    members.forEach(member => remap.set(member.id, id));
    projected.push({ id, kind: 'group', role, count: members.length, members });
  }
  return {
    center,
    nodes: projected.filter(node => !remap.has(node.id)),
    edges: edges.map(edge => ({ source: remap.get(edge.source) ?? edge.source, target: remap.get(edge.target) ?? edge.target,
      intent: edge.intent, relation_kind: edge.kind, direction: 'directed' as const })),
  };
}

export function moduleDetail(commit: string, node: ModelNode, nodes: readonly ModelNode[], relations: readonly ModelRelation[],
  flows: readonly ModelFlow[], section3: string | null, linkedDocs: LinkedModuleDoc[],
  state: Pick<ModuleState, 'model_valid' | 'generated_summary'>): ModuleDetailV1 {
  const graph = moduleGraph(node.id, nodes, relations);
  const local = new Set(nodes.filter(item => item.id === node.id || item.parent === node.id).map(item => item.id));
  const components = nodes.filter(item => item.parent === node.id).sort((a, b) => a.id.localeCompare(b.id, 'en'))
    .map(item => ({ id: item.id, kind: item.kind, name: item.name, summary: item.summary, source: footprint(item) }));
  return {
    schema_version: 'repo-harness.architecture-module.v1', commit,
    module: { id: node.id, name: node.name, status: node.status, summary: node.summary,
      responsibilities: node.responsibilities ?? [], notes: node.notes ?? [], source: footprint(node),
      entrypoints: node.source?.entrypoints ?? [], verification: node.extensions?.verification ?? [], components },
    graph, flows: flows.filter(flow => flow.capabilityId === node.id || (flow.applicability === 'required' && flow.participants.some(participant => local.has(participant.nodeId))))
      .sort((a, b) => a.id.localeCompare(b.id, 'en')),
    section3, linked_docs: linkedDocs,
    state: { ...state, section3: section3 ? 'present' : 'pending' },
  };
}
