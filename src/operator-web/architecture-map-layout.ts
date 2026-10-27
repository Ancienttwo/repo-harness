// Automatic layout of the architecture base map. A capability with components
// is a group that holds them on a grid; dagre then places the groups and every
// other top-level node, with each relation counted on its top-level ends. Box
// width follows the node's line count from the collector. This module computes
// positions only and adds no fact to the map.

import * as dagre from '@dagrejs/dagre';
import type { ArchitectureMapNodeV1, ArchitectureMapRelationV1, ArchitectureMapV1 } from '../core/operator/architecture-map';

export const MAP_NODE_HEIGHT = 48;
export const MAP_NODE_MIN_WIDTH = 160;
export const MAP_NODE_MAX_WIDTH = 280;
/** The title band of a group, above its components. */
export const MAP_GROUP_HEADER = 36;
const MAP_GROUP_PADDING = 12;
const MAP_GROUP_GAP = 12;

/** Relations between processes, hosts and data. The canvas draws them dashed; code relations stay solid. */
const DASHED_KINDS: ReadonlySet<string> = new Set(['spawns', 'runs-in', 'deployed-on', 'mounts', 'reads', 'writes', 'publishes', 'subscribes']);

export interface MapLayoutNode {
  readonly node: ArchitectureMapNodeV1;
  /** Top-left corner on the canvas. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** A capability that holds components. */
  readonly group: boolean;
  readonly size: { readonly files: number; readonly lines: number } | null;
}

export interface MapLayoutEdge {
  readonly relation: ArchitectureMapRelationV1;
  readonly dashed: boolean;
  /** Imports behind a capability-to-capability relation; null when `archctx deps` has no count for it. */
  readonly imports: number | null;
  readonly strokeWidth: number;
}

export interface MapLayout {
  /** Every model node once; a group comes before its components. */
  readonly nodes: readonly MapLayoutNode[];
  readonly edges: readonly MapLayoutEdge[];
  readonly width: number;
  readonly height: number;
}

interface Box { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export function layoutArchitectureMap(map: ArchitectureMapV1): MapLayout {
  const sizes = new Map(map.sizes.state === 'ok' ? map.sizes.nodes.map(size => [size.id, { files: size.files, lines: size.lines }]) : []);
  const members = new Map<string, ArchitectureMapNodeV1[]>();
  for (const node of map.nodes) if (node.parent !== null) members.set(node.parent, [...(members.get(node.parent) ?? []), node]);
  const leafLines = map.nodes.flatMap(node => members.has(node.id) ? [] : [sizes.get(node.id)?.lines ?? 0]);
  const maxLines = Math.max(1, ...leafLines);
  // Square root: the largest module would otherwise flatten every other box to the minimum.
  const width = (id: string): number => MAP_NODE_MIN_WIDTH
    + Math.round((MAP_NODE_MAX_WIDTH - MAP_NODE_MIN_WIDTH) * Math.sqrt((sizes.get(id)?.lines ?? 0) / maxLines));

  // Members sit on a near-square grid inside their group, in model order, at their own size, so a group may hold groups.
  // Each column is as wide as its widest member and each row as tall as its tallest. Sizes resolve from the leaves up.
  const inner = new Map<string, Box>();
  const sizeCache = new Map<string, { width: number; height: number }>();
  const sizeOf = (id: string): { width: number; height: number } => {
    const cached = sizeCache.get(id);
    if (cached) return cached;
    const nodes = members.get(id);
    if (!nodes) return { width: width(id), height: MAP_NODE_HEIGHT };
    const columns = Math.ceil(Math.sqrt(nodes.length));
    const rows = Math.ceil(nodes.length / columns);
    const own = nodes.map(node => sizeOf(node.id));
    const columnWidth = Array.from({ length: columns }, (_, column) => Math.max(0, ...own.filter((_, index) => index % columns === column).map(size => size.width)));
    const rowHeight = Array.from({ length: rows }, (_, row) => Math.max(0, ...own.slice(row * columns, (row + 1) * columns).map(size => size.height)));
    const offset = (sizes: readonly number[], index: number) => sizes.slice(0, index).reduce((sum, value) => sum + value + MAP_GROUP_GAP, 0);
    nodes.forEach((node, index) => {
      inner.set(node.id, { x: MAP_GROUP_PADDING + offset(columnWidth, index % columns), y: MAP_GROUP_HEADER + offset(rowHeight, Math.floor(index / columns)), ...own[index]! });
    });
    const size = {
      width: Math.max(MAP_NODE_MIN_WIDTH, columnWidth.reduce((sum, value) => sum + value, 0) + (columns - 1) * MAP_GROUP_GAP) + 2 * MAP_GROUP_PADDING,
      height: MAP_GROUP_HEADER + rowHeight.reduce((sum, value) => sum + value, 0) + (rows - 1) * MAP_GROUP_GAP + MAP_GROUP_PADDING,
    };
    sizeCache.set(id, size);
    return size;
  };

  const top = map.nodes.filter(node => node.parent === null);
  const parents = new Map(map.nodes.map(node => [node.id, node.parent]));
  // The decoder refuses parent cycles, so every chain ends at a top-level node.
  const rootOf = (id: string): string => { let cursor = id; while (parents.get(cursor)) cursor = parents.get(cursor)!; return cursor; };
  const owner = new Map(map.nodes.map(node => [node.id, rootOf(node.id)]));
  const graph = new dagre.graphlib.Graph();
  // A long relation adds one dummy node per rank it crosses; a small edge spacing keeps those from widening the map.
  graph.setGraph({ rankdir: 'TB', ranker: 'tight-tree', nodesep: 24, ranksep: 64, edgesep: 4, marginx: 24, marginy: 24 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of top) graph.setNode(node.id, sizeOf(node.id));
  for (const relation of map.relations) {
    const source = owner.get(relation.source)!;
    const target = owner.get(relation.target)!;
    if (source === target) continue;
    const existing = graph.edge(source, target) as { weight?: number } | undefined;
    graph.setEdge(source, target, { weight: (existing?.weight ?? 0) + 1 });
  }
  dagre.layout(graph);

  const placed = new Map<string, Box>();
  for (const node of top) {
    const center = graph.node(node.id) as { x: number; y: number; width: number; height: number };
    placed.set(node.id, { x: center.x - center.width / 2, y: center.y - center.height / 2, width: center.width, height: center.height });
  }
  // Parents before members at every depth: React Flow places a member relative to a parent it has already seen.
  const nodes: MapLayoutNode[] = [];
  const visit = (node: ArchitectureMapNodeV1, parent: Box | null) => {
    const own = parent === null ? placed.get(node.id)! : inner.get(node.id)!;
    const box = { x: (parent?.x ?? 0) + own.x, y: (parent?.y ?? 0) + own.y, width: own.width, height: own.height };
    nodes.push({ node, ...box, group: members.has(node.id), size: sizes.get(node.id) ?? null });
    for (const member of members.get(node.id) ?? []) visit(member, box);
  };
  for (const node of top) visit(node, null);

  const imports = new Map(map.dependencies.state === 'ok' ? map.dependencies.edges.map(edge => [`${edge.source}\n${edge.target}`, edge.imports]) : []);
  const maxImports = Math.max(1, ...imports.values());
  const edges = map.relations.map(relation => {
    const count = imports.get(`${relation.source}\n${relation.target}`) ?? null;
    return {
      relation,
      dashed: DASHED_KINDS.has(relation.kind),
      imports: count,
      strokeWidth: count === null ? 1 : 1 + Math.round(50 * Math.sqrt(count / maxImports)) / 10,
    };
  });

  const right = Math.max(0, ...nodes.map(node => node.x + node.width));
  const bottom = Math.max(0, ...nodes.map(node => node.y + node.height));
  return { nodes, edges, width: right, height: bottom };
}
