// What each architecture map layer lights on the base map. The values are the
// collector's own facts; this module only decides which node each one marks.

import type { ArchitectureMapImportV1, ArchitectureMapV1 } from '../core/operator/architecture-map';

export const MAP_LAYERS = ['changes', 'violations', 'pull_requests', 'tests', 'decisions'] as const;
export type MapLayerId = typeof MAP_LAYERS[number];

/** `change`: the node changed today; `danger`: a violation or a failed test; `success`: every test file passed; `muted`: tests without a result. */
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

/** Violations per node: debt items, stale doc citations, undeclared imports. */
export function violationCounts(map: ArchitectureMapV1): Map<string, number> {
  const { debt, anchors, dependencies } = map.layers.violations;
  const counts = new Map<string, number>();
  const add = (id: string, count: number) => counts.set(id, (counts.get(id) ?? 0) + count);
  if (debt.state === 'ok') for (const item of debt.items) for (const id of item.nodes) add(id, 1);
  if (anchors.state === 'ok') for (const entry of anchors.nodes) add(entry.id, entry.findings);
  if (dependencies.state === 'ok') for (const edge of dependencies.edges) add(edge.source, 1);
  return counts;
}

export function mapLayerView(map: ArchitectureMapV1, layer: MapLayerId): MapLayerView {
  const view = (marks: Map<string, MapMark>, edges: readonly ArchitectureMapImportV1[] = []): MapLayerView =>
    ({ available: true, marks, lit: withAncestors(map, marks.keys()), edges });
  if (layer === 'changes') {
    const { changes } = map.layers;
    if (changes.state !== 'ok') return EMPTY;
    return view(new Map(changes.nodes.map(entry => [entry.id, { tone: 'change', label: `+${entry.added} −${entry.deleted}` }])));
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
  // Pull request impact and decisions have no source yet; the contract allows only their reason.
  return EMPTY;
}
