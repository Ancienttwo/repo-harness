// What each architecture map layer lights on the base map. The values are the
// collector's own facts; this module only decides which node each one marks.

import type { ArchctxRefusalV1, ArchitectureImpactTruncationV1, ArchitectureImpactV1, ArchitectureMapImportV1, ArchitectureMapV1 } from '../core/operator/architecture-map';

export const MAP_LAYERS = ['changes', 'violations', 'pull_requests', 'tests', 'decisions'] as const;
export type MapLayerId = typeof MAP_LAYERS[number];

/**
 * `change`: the node changed today, or in the chosen PR; `danger`: a violation or a failed test;
 * `success`: every test file passed; `muted`: tests without a result, a node that archctx says depends on a
 * changed node, or a node that decisions apply to.
 */
export type MapMarkTone = 'change' | 'danger' | 'success' | 'muted';
export interface MapMark { readonly tone: MapMarkTone; readonly label: string }

export interface MapLayerView {
  /** False when the collector has no data for any part of the layer. */
  readonly available: boolean;
  readonly marks: ReadonlyMap<string, MapMark>;
  /** Nodes that hold a mark or contain one; the canvas dims the rest while the layer has data. */
  readonly lit: ReadonlySet<string>;
  /** Imports that archctx marks undeclared, drawn over the model's relations. */
  readonly edges: readonly ArchitectureMapImportV1[];
}

const EMPTY: MapLayerView = { available: false, marks: new Map(), lit: new Set(), edges: [] };

function withAncestors(map: ArchitectureMapV1, marked: Iterable<string>): Set<string> {
  const parents = new Map(map.nodes.map(node => [node.id, node.parent]));
  const lit = new Set<string>();
  for (const id of marked) {
    for (let cursor: string | null = id; cursor !== null && !lit.has(cursor); cursor = parents.get(cursor) ?? null) lit.add(cursor);
  }
  return lit;
}

/** archctx's error code, with its reason code when it gives one. */
export function archctxCode(refusal: ArchctxRefusalV1): string {
  return refusal.reason_code === null ? refusal.code : `${refusal.code} ${refusal.reason_code}`;
}

/** Violations per node: debt items, unprovable flow proofs, stale doc citations, undeclared imports. */
export function violationCounts(map: ArchitectureMapV1): Map<string, number> {
  const { debt, flows, anchors, dependencies } = map.layers.violations;
  const counts = new Map<string, number>();
  const add = (id: string, count: number) => counts.set(id, (counts.get(id) ?? 0) + count);
  if (debt.state === 'ok') for (const item of debt.items) for (const id of item.nodes) add(id, 1);
  if (flows.state === 'ok') for (const entry of flows.unprovable) add(entry.id, 1);
  if (anchors.state === 'ok') for (const entry of anchors.nodes) add(entry.id, entry.findings);
  if (dependencies.state === 'ok') for (const edge of dependencies.edges) add(edge.source, 1);
  return counts;
}

/** The open PR the PR impact layer shows first: the lowest number with impact data. */
export function firstImpactPullRequest(map: ArchitectureMapV1): number | null {
  const { pull_requests: pullRequests } = map.layers;
  return pullRequests.state === 'ok' ? pullRequests.pull_requests.find(entry => entry.impact.state === 'ok')?.number ?? null : null;
}

/** Line counts of the changed paths that archctx gives `nodeId`; `unknown` counts the paths it could not count. */
export function impactLines(impact: ArchitectureImpactV1, nodeId: string): { readonly added: number; readonly deleted: number; readonly unknown: number } {
  let added = 0, deleted = 0, unknown = 0;
  for (const path of impact.paths) {
    if (!path.owners.includes(nodeId)) continue;
    if (path.added === null || path.deleted === null) unknown += 1;
    else { added += path.added; deleted += path.deleted; }
  }
  return { added, deleted, unknown };
}

/** The changed nodes that archctx says `nodeId` depends on. */
export function impactTargets(impact: ArchitectureImpactV1, nodeId: string): string[] {
  return impact.dependents.filter(entry => entry.id === nodeId).map(entry => entry.touched);
}

/** The parts archctx cut at its limits, in a fixed order. */
export function truncatedParts(truncated: ArchitectureImpactTruncationV1): (keyof ArchitectureImpactTruncationV1)[] {
  return (['paths', 'nodes', 'relations', 'flow_steps', 'dependents', 'model'] as const).filter(part => truncated[part]);
}

/** Each node archctx says the change touches, and each other node that archctx says depends on one. */
function impactMarks(impact: ArchitectureImpactV1, label: (entry: ArchitectureImpactV1['nodes'][number]) => string): Map<string, MapMark> {
  const marks = new Map<string, MapMark>(impact.nodes.map(entry => [entry.id, { tone: 'change', label: label(entry) }]));
  for (const entry of impact.dependents) if (!marks.has(entry.id)) marks.set(entry.id, { tone: 'muted', label: '↳' });
  return marks;
}

/** `pullRequest` picks the PR that the PR impact layer marks; the other layers ignore it. */
export function mapLayerView(map: ArchitectureMapV1, layer: MapLayerId, pullRequest: number | null = null): MapLayerView {
  const view = (marks: Map<string, MapMark>, edges: readonly ArchitectureMapImportV1[] = []): MapLayerView =>
    ({ available: true, marks, lit: withAncestors(map, marks.keys()), edges });
  if (layer === 'changes') {
    const { changes } = map.layers;
    if (changes.state !== 'ok') return EMPTY;
    return view(impactMarks(changes, entry => {
      const lines = impactLines(changes, entry.id);
      return `+${lines.added} −${lines.deleted}${lines.unknown > 0 ? ' ?' : ''}`;
    }));
  }
  if (layer === 'violations') {
    const parts = Object.values(map.layers.violations);
    if (parts.every(part => part.state !== 'ok')) return EMPTY;
    const { dependencies } = map.layers.violations;
    return view(new Map([...violationCounts(map)].map(([id, count]) => [id, { tone: 'danger', label: String(count) }])), dependencies.state === 'ok' ? dependencies.edges : []);
  }
  if (layer === 'tests') {
    const { tests } = map.layers;
    if (tests.state !== 'ok') return EMPTY;
    return view(new Map(tests.capabilities.map(entry => [entry.id, {
      tone: entry.failed > 0 ? 'danger' : entry.passed > 0 && entry.passed + entry.skipped === entry.files ? 'success' : 'muted',
      label: `${entry.passed}/${entry.files}`,
    }])));
  }
  if (layer === 'pull_requests') {
    const { pull_requests: pullRequests } = map.layers;
    const impact = pullRequests.state === 'ok' ? pullRequests.pull_requests.find(entry => entry.number === pullRequest)?.impact : undefined;
    if (impact?.state !== 'ok') return EMPTY;
    return view(impactMarks(impact, entry => String(entry.files)));
  }
  const decisions = new Map<string, number>();
  for (const item of map.layers.decisions.items) for (const id of item.applies_to) decisions.set(id, (decisions.get(id) ?? 0) + 1);
  return view(new Map([...decisions].map(([id, count]) => [id, { tone: 'muted', label: String(count) }])));
}
