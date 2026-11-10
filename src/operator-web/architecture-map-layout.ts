// Layout of a History milestone shape as one placed scene. A node with members
// is a group that holds them on a grid, in input order, at their own size, so a
// group may hold groups. `placeLayered` places each top-level node that a route
// joins; the top-level nodes that no route joins sit on a near-square grid
// below them, so they do not all fall into the first rank. Routes run between
// top-level owners only: the relations of one directed owner pair with one
// kind are one route, and a relation inside one owner has no route. This module
// computes positions only and adds no fact to the map.

import type { ArchitectureMapNodeV1, ArchitectureMapRelationV1 } from '../core/operator/architecture-map';
import { placeLayered, sceneExtent, type PlacedScene, type SceneBox, type SceneRoute } from './architecture-scene';

export const MAP_NODE_HEIGHT = 48;
export const MAP_NODE_WIDTH = 160;
/** The title band of a group, above its members. */
export const MAP_GROUP_HEADER = 36;
const MAP_GROUP_PADDING = 12;
const MAP_GROUP_GAP = 12;
const MAP_NODE_SEP = 24;
const MAP_RANK_SEP = 64;
const MAP_MARGIN = 24;
/** The route kind that History draws dashed: a relation that the milestone removed. */
const DASHED_KIND = 'removed';

/** Relations between processes, hosts and data. The canvas draws them dashed; code relations stay solid. */
export const DASHED_KINDS: ReadonlySet<string> = new Set(['spawns', 'runs-in', 'deployed-on', 'mounts', 'reads', 'writes', 'publishes', 'subscribes']);

/** The node and relation fields that the layout reads. A relation's `kind` becomes the kind of its route. */
export type MapLayoutInputNode = Pick<ArchitectureMapNodeV1, 'id' | 'kind' | 'name' | 'parent'>;
export type MapLayoutInputRelation = Pick<ArchitectureMapRelationV1, 'id' | 'kind' | 'source' | 'target'>;
export interface MapLayoutInput {
  readonly nodes: readonly MapLayoutInputNode[];
  readonly relations: readonly MapLayoutInputRelation[];
}

/**
 * Boxes: every input node once, by its id; a group (kind `frame`) comes before its members, a node with no members has kind `box`.
 * Routes: one per directed top-level owner pair and relation kind, with an arrow at the target.
 */
export interface MapLayout {
  readonly scene: PlacedScene;
  /** The relation ids behind each route. */
  readonly relations: ReadonlyMap<string, readonly string[]>;
}

interface Size { readonly width: number; readonly height: number }

/**
 * A near-square grid of boxes in input order, with its top-left corner at 0,0.
 * Each column is as wide as its widest box and each row as tall as its tallest.
 */
function grid(own: readonly Size[], gap: number): { readonly cells: readonly { x: number; y: number }[]; readonly width: number; readonly height: number } {
  const columns = Math.ceil(Math.sqrt(own.length));
  const rows = Math.ceil(own.length / columns);
  const columnWidth = Array.from({ length: columns }, (_, column) => Math.max(0, ...own.filter((_, index) => index % columns === column).map(size => size.width)));
  const rowHeight = Array.from({ length: rows }, (_, row) => Math.max(0, ...own.slice(row * columns, (row + 1) * columns).map(size => size.height)));
  const offset = (sizes: readonly number[], index: number) => sizes.slice(0, index).reduce((sum, value) => sum + value + gap, 0);
  return {
    cells: own.map((_, index) => ({ x: offset(columnWidth, index % columns), y: offset(rowHeight, Math.floor(index / columns)) })),
    width: columnWidth.reduce((sum, value) => sum + value, 0) + (columns - 1) * gap,
    height: rowHeight.reduce((sum, value) => sum + value, 0) + (rows - 1) * gap,
  };
}

export function layoutArchitectureMap(map: MapLayoutInput): MapLayout {
  const members = new Map<string, MapLayoutInputNode[]>();
  for (const node of map.nodes) if (node.parent !== null) members.set(node.parent, [...(members.get(node.parent) ?? []), node]);

  // Sizes resolve from the leaves up; each member keeps its offset inside its group.
  const inner = new Map<string, { x: number; y: number }>();
  const sizes = new Map<string, Size>();
  const sizeOf = (id: string): Size => {
    const cached = sizes.get(id);
    if (cached) return cached;
    const nodes = members.get(id);
    let size: Size = { width: MAP_NODE_WIDTH, height: MAP_NODE_HEIGHT };
    if (nodes) {
      const own = nodes.map(node => sizeOf(node.id));
      const cells = grid(own, MAP_GROUP_GAP);
      nodes.forEach((node, index) => inner.set(node.id, { x: MAP_GROUP_PADDING + cells.cells[index]!.x, y: MAP_GROUP_HEADER + cells.cells[index]!.y }));
      size = { width: Math.max(MAP_NODE_WIDTH, cells.width) + 2 * MAP_GROUP_PADDING, height: MAP_GROUP_HEADER + cells.height + MAP_GROUP_PADDING };
    }
    sizes.set(id, size);
    return size;
  };

  const parents = new Map(map.nodes.map(node => [node.id, node.parent]));
  // The decoder refuses parent cycles, so every chain ends at a top-level node.
  const ownerOf = (id: string): string => { let cursor = id; while (parents.get(cursor)) cursor = parents.get(cursor)!; return cursor; };
  const pairs = new Map<string, { readonly source: string; readonly target: string; readonly kind: string; readonly relations: string[] }>();
  for (const relation of map.relations) {
    const [source, target] = [ownerOf(relation.source), ownerOf(relation.target)];
    if (source === target) continue;
    const id = `${relation.kind}:${source}->${target}`;
    if (!pairs.has(id)) pairs.set(id, { source, target, kind: relation.kind, relations: [] });
    pairs.get(id)!.relations.push(relation.id);
  }
  const top = map.nodes.filter(node => node.parent === null);
  const linked = new Set([...pairs.values()].flatMap(pair => [pair.source, pair.target]));
  const kindOf = (id: string) => members.has(id) ? 'frame' : 'box';
  const placed = placeLayered({
    nodes: top.filter(node => linked.has(node.id)).map(node => ({ id: node.id, kind: kindOf(node.id), ...sizeOf(node.id) })),
    edges: [...pairs].map(([id, pair]) => ({
      id, source: pair.source, target: pair.target, kind: pair.kind, arrows: { start: false, end: true },
      dashed: pair.kind === DASHED_KIND, width: pair.kind === 'relation' ? 1.5 : 2, weight: pair.relations.length,
    })),
    nodesep: MAP_NODE_SEP, ranksep: MAP_RANK_SEP, margin: MAP_MARGIN,
  });

  const loose = top.filter(node => !linked.has(node.id));
  const looseTop = placed.boxes.length === 0 ? MAP_MARGIN : Math.max(...placed.boxes.map(box => box.y + box.height)) + MAP_RANK_SEP;
  const looseSizes = loose.map(node => sizeOf(node.id));
  const looseBoxes = grid(looseSizes, MAP_NODE_SEP).cells.map((cell, index): SceneBox => ({
    id: loose[index]!.id, parent: null, x: MAP_MARGIN + cell.x, y: looseTop + cell.y, ...looseSizes[index]!, kind: kindOf(loose[index]!.id),
  }));
  const topBoxes = new Map([...placed.boxes, ...looseBoxes].map(box => [box.id, box]));

  // Parents before members at every depth: the canvas places a member relative to a parent that it has already seen.
  const boxes: SceneBox[] = [];
  const visit = (node: MapLayoutInputNode, parent: SceneBox | null) => {
    const offset = inner.get(node.id);
    const box = parent === null ? topBoxes.get(node.id)!
      : { id: node.id, parent: parent.id, x: parent.x + offset!.x, y: parent.y + offset!.y, ...sizeOf(node.id), kind: kindOf(node.id) };
    boxes.push(box);
    for (const member of members.get(node.id) ?? []) visit(member, box);
  };
  for (const node of top) visit(node, null);

  const routes: readonly SceneRoute[] = placed.routes;
  return {
    scene: { boxes, routes, labels: [], extent: sceneExtent(boxes, routes, MAP_MARGIN) },
    relations: new Map([...pairs].map(([id, pair]) => [id, pair.relations])),
  };
}
