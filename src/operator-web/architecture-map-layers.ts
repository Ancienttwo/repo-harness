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
  /** The layer lights at least one node of the map. False when the collector has no data for any part of the layer, or its data marks no current node. */
  readonly available: boolean;
  /** Every mark, also one on a node that today's changes removed from the model. */
  readonly marks: ReadonlyMap<string, MapMark>;
  /** Map nodes that hold a mark or contain one; the canvas dims the rest only while `available` is true, so a layer that lights nothing dims nothing. */
  readonly lit: ReadonlySet<string>;
  /** Imports that archctx marks undeclared, drawn over the model's relations. */
  readonly edges: readonly ArchitectureMapImportV1[];
}

const EMPTY: MapLayerView = { available: false, marks: new Map(), lit: new Set(), edges: [] };

/** The marked map nodes and their groups. A mark on a removed node has no node on the map, so it lights nothing. */
function withAncestors(map: ArchitectureMapV1, marked: Iterable<string>): Set<string> {
  const parents = new Map(map.nodes.map(node => [node.id, node.parent]));
  const lit = new Set<string>();
  for (const id of marked) {
    if (!parents.has(id)) continue;
    for (let cursor: string | null = id; cursor !== null && !lit.has(cursor); cursor = parents.get(cursor)!) lit.add(cursor);
  }
  return lit;
}

/** archctx's error code, with its reason code when it gives one. */
export function archctxCode(refusal: ArchctxRefusalV1): string {
  return refusal.reason_code === null ? refusal.code : `${refusal.code} ${refusal.reason_code}`;
}

/** Violations per node: debt items, unprovable flow proofs, stale doc citations, undeclared imports, imports against the layer order. */
export function violationCounts(map: ArchitectureMapV1): Map<string, number> {
  const { debt, flows, anchors, dependencies, layer_direction: layerDirection } = map.layers.violations;
  const counts = new Map<string, number>();
  const add = (id: string, count: number) => counts.set(id, (counts.get(id) ?? 0) + count);
  if (debt.state === 'ok') for (const item of debt.items) for (const id of item.nodes) add(id, 1);
  if (flows.state === 'ok') for (const entry of flows.unprovable) add(entry.id, 1);
  if (anchors.state === 'ok') for (const entry of anchors.nodes) add(entry.id, entry.findings.length);
  if (dependencies.state === 'ok') for (const edge of dependencies.edges) add(edge.source, 1);
  if (layerDirection.state === 'ok') for (const edge of layerDirection.edges) add(edge.source, 1);
  return counts;
}

/** The violation items of the map, each once: debt items, unprovable capabilities, stale citations, undeclared imports, imports against the layer order. */
export function violationItems(map: ArchitectureMapV1): number {
  const { debt, flows, anchors, dependencies, layer_direction: layerDirection } = map.layers.violations;
  return (debt.state === 'ok' ? debt.items.length : 0)
    + (flows.state === 'ok' ? flows.unprovable.length : 0)
    + (anchors.state === 'ok' ? anchors.nodes.reduce((sum, entry) => sum + entry.findings.length, 0) : 0)
    + (dependencies.state === 'ok' ? dependencies.edges.length : 0)
    + (layerDirection.state === 'ok' ? layerDirection.edges.length : 0);
}

/** The changed paths of `impact` that a node of `ids` owns, each once. */
export function impactPaths(impact: ArchitectureImpactV1, ids: ReadonlySet<string>): number {
  return impact.paths.filter(path => path.owners.some(id => ids.has(id))).length;
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

/** Each node inside a capability, the capability included, mapped to that capability. Other nodes have no entry. */
export function capabilityOwners(map: ArchitectureMapV1): Map<string, string> {
  const nodes = new Map(map.nodes.map(node => [node.id, node]));
  const owners = new Map<string, string>();
  for (const node of map.nodes) {
    for (let cursor: typeof node | undefined = node; cursor !== undefined; cursor = cursor.parent === null ? undefined : nodes.get(cursor.parent)) {
      if (cursor.kind === 'capability') { owners.set(node.id, cursor.id); break; }
    }
  }
  return owners;
}

/**
 * A capability's mark on the module map. `count`: commits today, violations, files in the PR or decisions;
 * null for a dependent or a test result. `atLeast`: archctx cut the changed paths at its limit, so the count is a lower bound.
 */
export interface ModuleMark { readonly tone: MapMarkTone; readonly count: number | null; readonly atLeast: boolean }
export interface ModulesLayerView {
  readonly available: boolean;
  readonly marks: ReadonlyMap<string, ModuleMark>;
  readonly edges: readonly ArchitectureMapImportV1[];
}

const NO_MODULES: ModulesLayerView = { available: false, marks: new Map(), edges: [] };

/**
 * What the active layer marks on the module map, which draws only capabilities: a fact on a
 * component marks the capability that holds it. A fact on a removed node or on a node outside
 * every capability marks nothing.
 */
export function modulesLayerView(map: ArchitectureMapV1, layer: MapLayerId, pullRequest: number | null = null): ModulesLayerView {
  const owners = capabilityOwners(map);
  const view = (marks: Map<string, ModuleMark>, edges: readonly ArchitectureMapImportV1[] = []): ModulesLayerView => ({ available: marks.size > 0, marks, edges });
  // Sums `count` per capability.
  const sum = (entries: Iterable<readonly [string, number]>, tone: MapMarkTone): Map<string, ModuleMark> => {
    const marks = new Map<string, ModuleMark>();
    for (const [id, count] of entries) {
      const owner = owners.get(id);
      if (owner !== undefined) marks.set(owner, { tone, count: (marks.get(owner)?.count ?? 0) + count, atLeast: false });
    }
    return marks;
  };
  const withDependents = (marks: Map<string, ModuleMark>, impact: ArchitectureImpactV1) => {
    for (const entry of impact.dependents) {
      const owner = owners.get(entry.id);
      if (owner !== undefined && !marks.has(owner)) marks.set(owner, { tone: 'muted', count: null, atLeast: false });
    }
    return marks;
  };
  if (layer === 'changes') {
    const { changes } = map.layers;
    if (changes.state !== 'ok') return NO_MODULES;
    // A commit names the owners of the paths it changed; with cut paths, that list is a lower bound.
    const commits = sum(changes.commits.flatMap(commit => [...new Set(commit.nodes.flatMap(id => owners.get(id) ?? []))].map(id => [id, 1] as const)), 'change');
    const marks = new Map(changes.nodes.flatMap(entry => owners.get(entry.id) ?? []).map((id): [string, ModuleMark] =>
      [id, { tone: 'change', count: commits.get(id)?.count ?? 0, atLeast: changes.truncated.paths }]));
    return view(withDependents(marks, changes));
  }
  // An item that names two nodes of one capability counts once for it.
  const once = (items: readonly { readonly ids: readonly string[]; readonly count: number }[]) =>
    items.flatMap(item => [...new Set(item.ids.flatMap(id => owners.get(id) ?? []))].map(id => [id, item.count] as const));
  if (layer === 'violations') {
    const { debt, flows, anchors, dependencies, layer_direction: layerDirection } = map.layers.violations;
    if (Object.values(map.layers.violations).every(part => part.state !== 'ok')) return NO_MODULES;
    const edges = dependencies.state === 'ok' ? dependencies.edges.filter(edge => owners.get(edge.source) === edge.source && owners.get(edge.target) === edge.target) : [];
    return view(sum(once([
      ...(debt.state === 'ok' ? debt.items.map(item => ({ ids: item.nodes, count: 1 })) : []),
      ...(flows.state === 'ok' ? flows.unprovable.map(entry => ({ ids: [entry.id], count: 1 })) : []),
      ...(anchors.state === 'ok' ? anchors.nodes.map(entry => ({ ids: [entry.id], count: entry.findings.length })) : []),
      ...(dependencies.state === 'ok' ? dependencies.edges.map(edge => ({ ids: [edge.source], count: 1 })) : []),
      ...(layerDirection.state === 'ok' ? layerDirection.edges.map(edge => ({ ids: [edge.source], count: 1 })) : []),
    ]), 'danger'), edges);
  }
  if (layer === 'tests') {
    const { tests } = map.layers;
    if (tests.state !== 'ok') return NO_MODULES;
    return view(new Map(tests.capabilities.map(entry => [entry.id, {
      tone: entry.failed > 0 ? 'danger' : entry.passed > 0 && entry.passed + entry.skipped === entry.files ? 'success' : 'muted', count: null, atLeast: false,
    }])));
  }
  if (layer === 'pull_requests') {
    const { pull_requests: pullRequests } = map.layers;
    const impact = pullRequests.state === 'ok' ? pullRequests.pull_requests.find(entry => entry.number === pullRequest)?.impact : undefined;
    if (impact?.state !== 'ok') return NO_MODULES;
    // A path with two owners in one capability is one file of it.
    const files = new Map<string, number>();
    for (const path of impact.paths) for (const id of new Set(path.owners.flatMap(owner => owners.get(owner) ?? []))) files.set(id, (files.get(id) ?? 0) + 1);
    const marks = new Map(impact.nodes.flatMap(entry => owners.get(entry.id) ?? []).map((id): [string, ModuleMark] =>
      [id, { tone: 'change', count: files.get(id) ?? 0, atLeast: impact.truncated.paths }]));
    return view(withDependents(marks, impact));
  }
  return view(sum(once(map.layers.decisions.items.map(item => ({ ids: item.applies_to, count: 1 }))), 'muted'));
}

/** `pullRequest` picks the PR that the PR impact layer marks; the other layers ignore it. */
export function mapLayerView(map: ArchitectureMapV1, layer: MapLayerId, pullRequest: number | null = null): MapLayerView {
  const view = (marks: Map<string, MapMark>, edges: readonly ArchitectureMapImportV1[] = []): MapLayerView => {
    const lit = withAncestors(map, marks.keys());
    return { available: lit.size > 0, marks, lit, edges };
  };
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
