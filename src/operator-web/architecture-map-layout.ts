// Automatic layout of the architecture base map. A capability with components
// is a group that holds them on a grid; dagre then places the groups and every
// other top-level node, with each relation counted on its top-level ends. With
// the model's layer order, each top-level node sits in its own layer's band,
// the first layer at the top. Box width follows the node's line count from the
// collector. This module computes positions only and adds no fact to the map.
// A history milestone has no sizes, layer order or imports, so those inputs are optional.

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
export const DASHED_KINDS: ReadonlySet<string> = new Set(['spawns', 'runs-in', 'deployed-on', 'mounts', 'reads', 'writes', 'publishes', 'subscribes']);

/** The node and relation fields that the layout and the canvases read. */
export type MapLayoutInputNode = Pick<ArchitectureMapNodeV1, 'id' | 'kind' | 'name' | 'layer' | 'parent'>;
export type MapLayoutInputRelation = Pick<ArchitectureMapRelationV1, 'id' | 'kind' | 'source' | 'target'>;
export interface MapLayoutInput {
  readonly nodes: readonly MapLayoutInputNode[];
  readonly relations: readonly MapLayoutInputRelation[];
  readonly sizes?: ArchitectureMapV1['sizes'];
  readonly layer_order?: ArchitectureMapV1['layer_order'];
  readonly dependencies?: ArchitectureMapV1['dependencies'];
}

export interface MapLayoutNode {
  readonly node: MapLayoutInputNode;
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
  readonly relation: MapLayoutInputRelation;
  readonly dashed: boolean;
  /** Imports behind a capability-to-capability relation; null when `archctx deps` has no count for it. */
  readonly imports: number | null;
  readonly strokeWidth: number;
}

/** The rows of one layer: the top-level nodes of that layer, and their members. */
export interface MapLayoutBand {
  /** null: top-level nodes that the model gives no layer. */
  readonly layer: string | null;
  /** Left edge of the band's leftmost node. */
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

export interface MapLayout {
  /** Every model node once; a group comes before its components. */
  readonly nodes: readonly MapLayoutNode[];
  readonly edges: readonly MapLayoutEdge[];
  /** Top to bottom in the layer order; empty when the map has no layer order. */
  readonly bands: readonly MapLayoutBand[];
  readonly width: number;
  readonly height: number;
}

interface Box { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export function layoutArchitectureMap(map: MapLayoutInput): MapLayout {
  const sizes = new Map(map.sizes?.state === 'ok' ? map.sizes.nodes.map(size => [size.id, { files: size.files, lines: size.lines }]) : []);
  const members = new Map<string, MapLayoutInputNode[]>();
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
  // Band of each top-level node: its layer's position in the order; the model's unlayered nodes go below the last layer.
  const order = map.layer_order?.state === 'ok' ? map.layer_order.layers : null;
  const band = new Map(order === null ? [] : top.map(node => [node.id, node.layer === null ? order.length : order.indexOf(node.layer)]));
  const used = [...new Set(band.values())].sort((a, b) => a - b);
  // A zero-size anchor above each band and one below the last: every node of a band ranks below its anchor and above the next.
  // The anchors leave one empty rank between two bands.
  const anchor = (index: number) => `\0band:${index}`;
  used.forEach((value, index) => {
    graph.setNode(anchor(index), { width: 0, height: 0 });
    if (index === used.length - 1) graph.setNode(anchor(index + 1), { width: 0, height: 0 });
    for (const node of top) {
      if (band.get(node.id) !== value) continue;
      graph.setEdge(anchor(index), node.id, { weight: 1, minlen: 1 });
      graph.setEdge(node.id, anchor(index + 1), { weight: 1, minlen: 1 });
    }
  });
  for (const relation of map.relations) {
    let source = owner.get(relation.source)!;
    let target = owner.get(relation.target)!;
    if (source === target) continue;
    // A relation against the layer order still pulls its ends together; it points down so the bands stay acyclic.
    if (order !== null && band.get(source)! > band.get(target)!) [source, target] = [target, source];
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
  const visit = (node: MapLayoutInputNode, parent: Box | null) => {
    const own = parent === null ? placed.get(node.id)! : inner.get(node.id)!;
    const box = { x: (parent?.x ?? 0) + own.x, y: (parent?.y ?? 0) + own.y, width: own.width, height: own.height };
    nodes.push({ node, ...box, group: members.has(node.id), size: sizes.get(node.id) ?? null });
    for (const member of members.get(node.id) ?? []) visit(member, box);
  };
  for (const node of top) visit(node, null);

  const imports = new Map(map.dependencies?.state === 'ok' ? map.dependencies.edges.map(edge => [`${edge.source}\n${edge.target}`, edge.imports]) : []);
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

  const bands = used.map(value => {
    const rows = top.filter(node => band.get(node.id) === value).map(node => placed.get(node.id)!);
    const y = Math.min(...rows.map(box => box.y));
    return { layer: order![value] ?? null, x: Math.min(...rows.map(box => box.x)), y, height: Math.max(...rows.map(box => box.y + box.height)) - y };
  });

  const right = Math.max(0, ...nodes.map(node => node.x + node.width));
  const bottom = Math.max(0, ...nodes.map(node => node.y + node.height));
  return { nodes, edges, bands, width: right, height: bottom };
}
