// Layout of the topology base map: the model's namespaces, processes, mounts
// and external systems. A namespace holds its sub-namespaces (`parent`) and
// the processes that run in it (`runs-in`); archctx guarantees one namespace
// per process and one mounter per mount. A process lists the code nodes that
// are `deployed-on` it. A model relation between nodes of two different boxes
// is drawn between those boxes; the edge number counts the model relations
// behind it. dagre places the boxes. This module adds no fact to the map.

import * as dagre from '@dagrejs/dagre';
import type { ArchitectureMapNodeV1, ArchitectureMapV1 } from '../core/operator/architecture-map';
import { DASHED_KINDS } from './architecture-map-layout';
import type { RuntimePlacement } from './architecture-runtime';

export const TOPOLOGY_KINDS: ReadonlySet<string> = new Set(['namespace', 'process', 'mount', 'external-system']);
export const TOPOLOGY_BOX_WIDTH = 220;
export const TOPOLOGY_BOX_HEADER = 44;
export const TOPOLOGY_MEMBER = 26;
const NAMESPACE_TITLE = 32;
const NAMESPACE_PADDING = 16;
/** Relations that the boxes themselves show: containment and deployment. */
const CONTAINMENT: ReadonlySet<string> = new Set(['runs-in', 'deployed-on']);

export interface TopologyBox {
  readonly node: ArchitectureMapNodeV1;
  /** The namespace that holds this box; null at the top level. */
  readonly parent: string | null;
  /** Code nodes deployed on a process, in model order; empty for other kinds. */
  readonly members: readonly ArchitectureMapNodeV1[];
  /** A namespace that holds other boxes. */
  readonly group: boolean;
  /** Top-left corner on the canvas. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TopologyEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: string;
  readonly dashed: boolean;
  /** The model relations behind the edge. */
  readonly relations: readonly string[];
}

export interface TopologyLayout {
  /** Every topology node once; a namespace comes before the boxes it holds. */
  readonly boxes: readonly TopologyBox[];
  readonly edges: readonly TopologyEdge[];
  /** Relations with one end on a code node that no process runs. */
  readonly unplaced: readonly string[];
  /** Mounters with two or more mounts: the map does not carry the mount order. */
  readonly stacked: readonly string[];
  readonly width: number;
  readonly height: number;
}

interface Box { x: number; y: number; width: number; height: number }

export function layoutTopology(map: ArchitectureMapV1, placement: (nodeId: string) => RuntimePlacement): TopologyLayout {
  const byId = new Map(map.nodes.map(node => [node.id, node]));
  const topology = map.nodes.filter(node => TOPOLOGY_KINDS.has(node.kind));
  const isTopology = (id: string) => TOPOLOGY_KINDS.has(byId.get(id)?.kind ?? '');
  const container = new Map<string, string>();
  for (const node of topology) if (node.kind === 'namespace' && node.parent !== null && byId.get(node.parent)?.kind === 'namespace') container.set(node.id, node.parent);
  const members = new Map<string, ArchitectureMapNodeV1[]>();
  const mounts = new Map<string, string[]>();
  for (const relation of map.relations) {
    if (relation.kind === 'runs-in' && byId.get(relation.source)?.kind === 'process' && byId.get(relation.target)?.kind === 'namespace') container.set(relation.source, relation.target);
    if (relation.kind === 'deployed-on' && byId.get(relation.target)?.kind === 'process' && !isTopology(relation.source)) {
      members.set(relation.target, [...(members.get(relation.target) ?? []), byId.get(relation.source)!]);
    }
    if (relation.kind === 'mounts' && byId.get(relation.target)?.kind === 'mount') mounts.set(relation.source, [...(mounts.get(relation.source) ?? []), relation.target]);
  }
  for (const [mounter, targets] of mounts) {
    const home = byId.get(mounter)?.kind === 'namespace' ? mounter : container.get(mounter);
    if (home !== undefined) for (const mount of targets) container.set(mount, home);
  }
  const groups = new Set([...container.values()]);

  // Each other relation is drawn between the boxes of its ends; a relation inside one box is not drawn.
  const end = (id: string): string | null => {
    if (isTopology(id)) return id;
    const where = placement(id);
    return where.kind === 'process' ? where.process : null;
  };
  const edges = new Map<string, TopologyEdge>();
  const unplaced: string[] = [];
  for (const relation of map.relations) {
    if (CONTAINMENT.has(relation.kind)) continue;
    const source = end(relation.source);
    const target = end(relation.target);
    if (source === null || target === null) {
      if (source !== null || target !== null) unplaced.push(relation.id);
      continue;
    }
    if (source === target) continue;
    const dashed = DASHED_KINDS.has(relation.kind);
    const lifted = !(isTopology(relation.source) && isTopology(relation.target));
    const key = `${source}\n${target}\n${lifted ? (dashed ? 'io' : 'code') : relation.kind}`;
    const existing = edges.get(key);
    edges.set(key, existing ? { ...existing, relations: [...existing.relations, relation.id] }
      : { id: `topology:${key}`, source, target, kind: lifted ? (dashed ? 'io' : 'code') : relation.kind, dashed, relations: [relation.id] });
  }

  const graph = new dagre.graphlib.Graph({ compound: true });
  graph.setGraph({ rankdir: 'TB', nodesep: 32, ranksep: 72, marginx: 24, marginy: 24 });
  graph.setDefaultEdgeLabel(() => ({}));
  const size = (node: ArchitectureMapNodeV1) => ({
    width: TOPOLOGY_BOX_WIDTH,
    height: TOPOLOGY_BOX_HEADER + (members.get(node.id)?.length ?? 0) * TOPOLOGY_MEMBER + ((members.get(node.id)?.length ?? 0) > 0 ? 8 : 0),
  });
  for (const node of topology) graph.setNode(node.id, groups.has(node.id) ? {} : size(node));
  for (const [child, parent] of container) graph.setParent(child, parent);
  // dagre cannot route an edge that ends on a cluster; such an edge is drawn but does not rank.
  for (const edge of edges.values()) if (!groups.has(edge.source) && !groups.has(edge.target)) graph.setEdge(edge.source, edge.target, { weight: edge.relations.length });
  dagre.layout(graph);

  const placed = new Map<string, Box>();
  for (const node of topology) {
    if (groups.has(node.id)) continue;
    const center = graph.node(node.id) as { x: number; y: number; width: number; height: number };
    placed.set(node.id, { x: center.x - center.width / 2, y: center.y - center.height / 2, width: center.width, height: center.height });
  }
  // A namespace encloses the boxes it holds with a title band above them; inner namespaces first.
  const depth = (id: string): number => { let count = 0; for (let cursor = container.get(id); cursor !== undefined; cursor = container.get(cursor)) count++; return count; };
  for (const id of [...groups].sort((a, b) => depth(b) - depth(a))) {
    const inner = [...container].filter(([, parent]) => parent === id).map(([child]) => placed.get(child)!).filter(Boolean);
    const left = Math.min(...inner.map(box => box.x)) - NAMESPACE_PADDING;
    const top = Math.min(...inner.map(box => box.y)) - NAMESPACE_PADDING - NAMESPACE_TITLE;
    placed.set(id, {
      x: left, y: top,
      width: Math.max(...inner.map(box => box.x + box.width)) + NAMESPACE_PADDING - left,
      height: Math.max(...inner.map(box => box.y + box.height)) + NAMESPACE_PADDING - top,
    });
  }
  // Shift so the title band of the outermost namespace stays on the canvas.
  const shiftX = Math.min(0, ...[...placed.values()].map(box => box.x - 24));
  const shiftY = Math.min(0, ...[...placed.values()].map(box => box.y - 24));
  const boxes: TopologyBox[] = [];
  const visit = (node: ArchitectureMapNodeV1) => {
    const box = placed.get(node.id)!;
    boxes.push({ node, parent: container.get(node.id) ?? null, members: members.get(node.id) ?? [], group: groups.has(node.id), ...box, x: box.x - shiftX, y: box.y - shiftY });
    for (const child of topology.filter(entry => container.get(entry.id) === node.id)) visit(child);
  };
  for (const node of topology.filter(entry => !container.has(entry.id))) visit(node);
  return {
    boxes,
    edges: [...edges.values()],
    unplaced,
    stacked: [...mounts].filter(([, targets]) => targets.length > 1).map(([mounter]) => mounter),
    width: Math.max(0, ...boxes.map(box => box.x + box.width)),
    height: Math.max(0, ...boxes.map(box => box.y + box.height)),
  };
}
