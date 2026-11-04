// Layout of the topology base map (the ArchTopology artboard). It has three
// segments, each read from the model on the map:
// - processes: the process boxes with the code nodes `deployed-on` them, and
//   the external systems. A model relation between nodes of two different
//   boxes is drawn between those boxes.
// - namespaces: the namespace frames, sub-namespaces nested by `parent`. A
//   frame holds the mounts that the namespace, or a process that `runs-in`
//   it, mounts, in `mount.order`. archctx guarantees one namespace per process
//   and one mounter per mount.
// - mounts: one box for each mounter that lists its mounts in `mount.order`.
// dagre places the process boxes; the other segments are columns. This module
// adds no fact to the map.

import * as dagre from '@dagrejs/dagre';
import type { ArchitectureMapNodeV1, ArchitectureMapV1 } from '../core/operator/architecture-map';
import { DASHED_KINDS } from './architecture-map-layout';
import type { RuntimePlacement } from './architecture-runtime';

export type TopologyBase = 'process' | 'namespace' | 'mount';
export const TOPOLOGY_BASES: readonly TopologyBase[] = ['process', 'namespace', 'mount'];
/** The node kinds that the topology map draws as boxes in one of its segments. */
export const TOPOLOGY_KINDS: ReadonlySet<string> = new Set(['namespace', 'process', 'mount', 'external-system']);
const TOPOLOGY_BOX_WIDTH = 220;
export const TOPOLOGY_BOX_HEADER = 44;
export const TOPOLOGY_MEMBER = 26;
const TOPOLOGY_MOUNT_HEIGHT = 72;
const NAMESPACE_TITLE = 32;
const NAMESPACE_PADDING = 16;
const NAMESPACE_GAP = 12;
const COLUMN_GAP = 72;
const MOUNTER_WIDTH = 320;
const MOUNTER_GAP = 32;
const MARGIN = 24;
/** Relations that the boxes themselves show: containment, deployment and mounting. */
const CONTAINMENT: ReadonlySet<string> = new Set(['runs-in', 'deployed-on', 'mounts']);

/** `writer`: a `writes` relation goes into the mount; `reader`: only `reads` relations do; `point`: neither. */
export type MountTone = 'writer' | 'reader' | 'point';

export interface TopologyBox {
  readonly node: ArchitectureMapNodeV1;
  /** The namespace that holds this box; null at the top level. */
  readonly parent: string | null;
  /** Process segment: the code nodes deployed on the process. Mount segment: the mounter's mounts in `mount.order`. */
  readonly members: readonly ArchitectureMapNodeV1[];
  /** A namespace frame that holds other boxes. */
  readonly group: boolean;
  /** Namespace segment: the tone of a mount box; null for other boxes. */
  readonly tone: MountTone | null;
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
  /** The distinct `protocol` values of those relations, in model order. */
  readonly protocols: readonly string[];
}

export interface TopologyLayout {
  readonly base: TopologyBase;
  /** Every box once; a namespace comes before the boxes it holds. */
  readonly boxes: readonly TopologyBox[];
  readonly edges: readonly TopologyEdge[];
  /** Process segment: relations with one end on a code node that no process runs. */
  readonly unplaced: readonly string[];
  readonly width: number;
  readonly height: number;
}

interface Box { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/** Which nodes a segment may draw: `legacy` false leaves out the `deprecated` nodes and the relations that touch them. */
type Visible = (nodeId: string) => boolean;
const touches = (visible: Visible, relation: { readonly source: string; readonly target: string }) => visible(relation.source) && visible(relation.target);

/**
 * One segment of the topology map. The layout reads the whole map and leaves the hidden nodes out itself, so a
 * kept node never names a removed parent: a box whose namespace is hidden goes into the nearest shown namespace.
 */
export function layoutTopology(map: ArchitectureMapV1, placement: (nodeId: string) => RuntimePlacement, base: TopologyBase, legacy: boolean): TopologyLayout {
  const deprecated = new Set(legacy ? [] : map.nodes.filter(node => node.status === 'deprecated').map(node => node.id));
  const visible: Visible = id => !deprecated.has(id);
  if (base === 'process') return layoutProcesses(map, placement, visible);
  if (base === 'namespace') return layoutNamespaces(map, visible);
  return layoutMounters(map, visible);
}

/** The namespace that a process runs in, or null when the model names none. */
export function processNamespace(map: Pick<ArchitectureMapV1, 'nodes' | 'relations'>, processId: string): string | null {
  const kinds = new Map(map.nodes.map(node => [node.id, node.kind]));
  return map.relations.find(relation => relation.kind === 'runs-in' && relation.source === processId && kinds.get(relation.target) === 'namespace')?.target ?? null;
}

function edgeOf(id: string, source: string, target: string, kind: string, dashed: boolean): TopologyEdge {
  return { id, source, target, kind, dashed, relations: [], protocols: [] };
}

function addRelation(edge: TopologyEdge, relation: ArchitectureMapV1['relations'][number]): TopologyEdge {
  return {
    ...edge, relations: [...edge.relations, relation.id],
    protocols: relation.protocol === null || edge.protocols.includes(relation.protocol) ? edge.protocols : [...edge.protocols, relation.protocol],
  };
}

function layoutProcesses(map: ArchitectureMapV1, placement: (nodeId: string) => RuntimePlacement, visible: Visible): TopologyLayout {
  const byId = new Map(map.nodes.map(node => [node.id, node]));
  const boxes = map.nodes.filter(node => (node.kind === 'process' || node.kind === 'external-system') && visible(node.id));
  const isBox = (id: string) => { const kind = byId.get(id)?.kind; return kind === 'process' || kind === 'external-system'; };
  const members = new Map<string, ArchitectureMapNodeV1[]>();
  for (const relation of map.relations) {
    if (relation.kind === 'deployed-on' && touches(visible, relation) && byId.get(relation.target)?.kind === 'process' && !TOPOLOGY_KINDS.has(byId.get(relation.source)!.kind)) {
      members.set(relation.target, [...(members.get(relation.target) ?? []), byId.get(relation.source)!]);
    }
  }
  // Each other relation is drawn between the boxes of its ends; a relation inside one box is not drawn.
  // A relation with an end on a namespace or a mount belongs to the namespace segment.
  const end = (id: string): string | null => {
    if (isBox(id)) return id;
    const where = placement(id);
    return where.kind === 'process' ? where.process : null;
  };
  const edges = new Map<string, TopologyEdge>();
  const unplaced: string[] = [];
  for (const relation of map.relations) {
    if (CONTAINMENT.has(relation.kind) || !touches(visible, relation)) continue;
    if ([relation.source, relation.target].some(id => { const kind = byId.get(id)!.kind; return kind === 'namespace' || kind === 'mount'; })) continue;
    const source = end(relation.source);
    const target = end(relation.target);
    // An end that runs in a hidden process has no box while the legacy switch is off; the relation is not unplaced.
    if ((source !== null && !visible(source)) || (target !== null && !visible(target))) continue;
    if (source === null || target === null) {
      if (source !== null || target !== null) unplaced.push(relation.id);
      continue;
    }
    if (source === target) continue;
    const dashed = DASHED_KINDS.has(relation.kind);
    const lifted = !(isBox(relation.source) && isBox(relation.target));
    const kind = lifted ? (dashed ? 'io' : 'code') : relation.kind;
    const key = `${source}\n${target}\n${kind}`;
    edges.set(key, addRelation(edges.get(key) ?? edgeOf(`topology:${key}`, source, target, kind, dashed), relation));
  }

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'TB', nodesep: 32, ranksep: 72, marginx: MARGIN, marginy: MARGIN });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of boxes) {
    const count = members.get(node.id)?.length ?? 0;
    graph.setNode(node.id, { width: TOPOLOGY_BOX_WIDTH, height: TOPOLOGY_BOX_HEADER + count * TOPOLOGY_MEMBER + (count > 0 ? 8 : 0) });
  }
  for (const edge of edges.values()) graph.setEdge(edge.source, edge.target, { weight: edge.relations.length });
  dagre.layout(graph);
  const placed = boxes.map((node): TopologyBox => {
    const center = graph.node(node.id) as { x: number; y: number; width: number; height: number };
    return { node, parent: null, members: members.get(node.id) ?? [], group: false, tone: null, x: center.x - center.width / 2, y: center.y - center.height / 2, width: center.width, height: center.height };
  });
  return { base: 'process', boxes: placed, edges: [...edges.values()], unplaced, ...extent(placed) };
}

/** Mounts in `mount.order`; the decoder sets `mount` on every mount node. */
const byOrder = (a: ArchitectureMapNodeV1, b: ArchitectureMapNodeV1) => a.mount!.order - b.mount!.order;

function layoutNamespaces(map: ArchitectureMapV1, visible: Visible): TopologyLayout {
  const byId = new Map(map.nodes.map(node => [node.id, node]));
  const kind = (id: string) => byId.get(id)!.kind;
  const shown = map.nodes.filter(node => (node.kind === 'namespace' || node.kind === 'mount') && visible(node.id));
  // The nearest shown namespace at or above `id` on the namespace parent chain.
  const frame = (id: string | null): string | null => {
    let cursor = id;
    while (cursor !== null && kind(cursor) === 'namespace' && !visible(cursor)) cursor = byId.get(cursor)!.parent;
    return cursor !== null && kind(cursor) === 'namespace' ? cursor : null;
  };
  const container = new Map<string, string>();
  for (const node of shown) {
    const home = node.kind === 'namespace' ? frame(node.parent) : null;
    if (home !== null) container.set(node.id, home);
  }
  for (const relation of map.relations) {
    if (relation.kind !== 'mounts' || kind(relation.target) !== 'mount' || !visible(relation.target)) continue;
    const home = frame(kind(relation.source) === 'namespace' ? relation.source : kind(relation.source) === 'process' ? processNamespace(map, relation.source) : null);
    if (home !== null) container.set(relation.target, home);
  }
  const tone = new Map<string, MountTone>();
  for (const relation of map.relations) {
    if (kind(relation.target) !== 'mount' || !touches(visible, relation)) continue;
    if (relation.kind === 'writes') tone.set(relation.target, 'writer');
    else if (relation.kind === 'reads' && tone.get(relation.target) !== 'writer') tone.set(relation.target, 'reader');
  }
  const isShown = (id: string) => { const value = kind(id); return (value === 'namespace' || value === 'mount') && visible(id); };
  const edges = new Map<string, TopologyEdge>();
  for (const relation of map.relations) {
    if (CONTAINMENT.has(relation.kind) || !isShown(relation.source) || !isShown(relation.target) || relation.source === relation.target) continue;
    const key = `${relation.source}\n${relation.target}\n${relation.kind}`;
    edges.set(key, addRelation(edges.get(key) ?? edgeOf(`topology:${key}`, relation.source, relation.target, relation.kind, DASHED_KINDS.has(relation.kind)), relation));
  }

  // A frame stacks its mounts in `mount.order`, then its sub-namespaces; top-level frames and loose mounts are columns.
  const children = (id: string | undefined) => [
    ...shown.filter(node => node.kind === 'mount' && container.get(node.id) === id).sort(byOrder),
    ...shown.filter(node => node.kind === 'namespace' && container.get(node.id) === id),
  ];
  const boxes: TopologyBox[] = [];
  const place = (node: ArchitectureMapNodeV1, x: number, y: number): Box => {
    const parent = container.get(node.id) ?? null;
    if (node.kind === 'mount') {
      boxes.push({ node, parent, members: [], group: false, tone: tone.get(node.id) ?? 'point', x, y, width: TOPOLOGY_BOX_WIDTH, height: TOPOLOGY_MOUNT_HEIGHT });
      return { x, y, width: TOPOLOGY_BOX_WIDTH, height: TOPOLOGY_MOUNT_HEIGHT };
    }
    const index = boxes.length;
    const inner = children(node.id);
    let bottom = y + NAMESPACE_TITLE + NAMESPACE_PADDING;
    let width = TOPOLOGY_BOX_WIDTH;
    for (const child of inner) {
      const box = place(child, x + NAMESPACE_PADDING, bottom);
      bottom = box.y + box.height + NAMESPACE_GAP;
      width = Math.max(width, box.width);
    }
    // An empty frame keeps one row for its empty-state line.
    const height = inner.length === 0 ? NAMESPACE_TITLE + TOPOLOGY_MEMBER + NAMESPACE_PADDING : bottom - NAMESPACE_GAP + NAMESPACE_PADDING - y;
    boxes.splice(index, 0, { node, parent, members: [], group: inner.length > 0, tone: null, x, y, width: width + 2 * NAMESPACE_PADDING, height });
    return { x, y, width: width + 2 * NAMESPACE_PADDING, height };
  };
  let x = MARGIN;
  for (const node of children(undefined)) x += place(node, x, MARGIN).width + COLUMN_GAP;
  return { base: 'namespace', boxes, edges: [...edges.values()], unplaced: [], ...extent(boxes) };
}

/** A hidden mounter takes its mounts out of this segment; the namespace segment still shows them. */
function layoutMounters(map: ArchitectureMapV1, visible: Visible): TopologyLayout {
  const byId = new Map(map.nodes.map(node => [node.id, node]));
  const mounts = new Map<string, ArchitectureMapNodeV1[]>();
  for (const relation of map.relations) {
    if (relation.kind === 'mounts' && touches(visible, relation) && byId.get(relation.target)?.kind === 'mount') mounts.set(relation.source, [...(mounts.get(relation.source) ?? []), byId.get(relation.target)!]);
  }
  let x = MARGIN;
  const boxes = map.nodes.filter(node => mounts.has(node.id)).map((node): TopologyBox => {
    const members = [...mounts.get(node.id)!].sort(byOrder);
    const box: TopologyBox = { node, parent: null, members, group: false, tone: null, x, y: MARGIN, width: MOUNTER_WIDTH, height: TOPOLOGY_BOX_HEADER + members.length * TOPOLOGY_MEMBER + 8 };
    x += MOUNTER_WIDTH + MOUNTER_GAP;
    return box;
  });
  return { base: 'mount', boxes, edges: [], unplaced: [], ...extent(boxes) };
}

function extent(boxes: readonly TopologyBox[]): { width: number; height: number } {
  return { width: Math.max(0, ...boxes.map(box => box.x + box.width)) + MARGIN, height: Math.max(0, ...boxes.map(box => box.y + box.height)) + MARGIN };
}

export interface TopologySvgText {
  /** The second line of a box: its kind, namespace type or deployed count. */
  readonly detail: (box: TopologyBox) => string;
  /** One member row: a deployed code node or a mount. */
  readonly member: (box: TopologyBox, member: ArchitectureMapNodeV1) => string;
}

const STYLE = [
  'text{font-family:system-ui,sans-serif;font-size:12px;fill:#1F2328}',
  '.box{fill:#F2F4F7;stroke:#D3D9E0}.frame{fill:#FFFFFF;stroke:#D3D9E0}.external{fill:#FFFFFF;stroke:#D3D9E0;stroke-dasharray:6 4}',
  '.writer{fill:#E4F2EA;stroke:#1F8A5B}.reader{fill:#FFFFFF;stroke:#8C96A3;stroke-dasharray:4 3}.point{fill:#E8EFFB;stroke:#2D5BB8}',
  '.title{font-size:13px;font-weight:600}.detail{fill:#5B6573}',
  '.edge{fill:none;stroke:#5B6573;stroke-width:1.5}.edge.dashed{stroke-dasharray:6 4}.protocol{font-size:11px;fill:#5B6573}',
].join('');

const escape = (value: string) => value.replace(/[&<>"]/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);

/** One segment of the topology map as a standalone SVG file. An edge is a straight line between its box centres. */
export function topologySvg(layout: TopologyLayout, text: TopologySvgText): string {
  const parts: string[] = [];
  const centre = new Map(layout.boxes.map(box => [box.node.id, [box.x + box.width / 2, box.y + box.height / 2] as const]));
  for (const [index, box] of layout.boxes.entries()) {
    const style = box.tone ?? (box.node.kind === 'namespace' ? 'frame' : box.node.kind === 'external-system' ? 'external' : 'box');
    parts.push(
      `<clipPath id="clip-${index}"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="10"/></clipPath>`,
      `<rect class="${style}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="10"/>`,
      `<g clip-path="url(#clip-${index})"><text class="title" x="${box.x + 12}" y="${box.y + 20}">${escape(box.node.name)}</text>`
        + `<text class="detail" x="${box.x + 12}" y="${box.y + 36}">${escape(text.detail(box))}</text>`
        + box.members.map((member, index) => `<text x="${box.x + 12}" y="${box.y + TOPOLOGY_BOX_HEADER + 16 + index * TOPOLOGY_MEMBER}">${escape(text.member(box, member))}</text>`).join('')
        + '</g>',
    );
  }
  for (const edge of layout.edges) {
    const [x1, y1] = centre.get(edge.source)!, [x2, y2] = centre.get(edge.target)!;
    parts.push(`<path class="edge${edge.dashed ? ' dashed' : ''}" d="M${x1} ${y1} L${x2} ${y2}" marker-end="url(#arrow)"/>`);
    if (edge.protocols.length > 0) parts.push(`<text class="protocol" x="${(x1 + x2) / 2 + 4}" y="${(y1 + y2) / 2 - 4}">${escape(edge.protocols.join(' · '))}</text>`);
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`,
    `<style>${STYLE}</style>`,
    '<defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="#5B6573"/></marker></defs>',
    `<rect width="${layout.width}" height="${layout.height}" fill="#FFFFFF"/>`,
    ...parts,
    '</svg>',
  ].join('\n');
}
