// Layout of the layer map (the ArchLayers artboard): one band for each layer of
// the model's declared order, top layer first, with one box for the layer's
// nodes and its label box on the left. The selected layer's model relations to
// other layers run in lanes: outgoing in the right gutter, incoming in the left
// one, one lane for each layer pair and edge class. Line counts are the nodes'
// own lines (a node's total minus its children's totals) summed by layer. The
// layout returns the shared placed scene and adds no fact to the map.

import type { ArchitectureMapNodeV1, ArchitectureMapV1 } from '../core/operator/architecture-map';
import { DASHED_KINDS } from './architecture-map-layout';
import type { PlacedScene, SceneBox, SceneRoute } from './architecture-scene';

export const LAYER_BOX_WIDTH = 656;
export const LAYER_BOX_HEIGHT = 56;
const LAYER_GAP = 40;
const LABEL_WIDTH = 96;
const LANE_GAP = 12;
const MARGIN = 24;

/** One member node with its own files and lines; null counts when the map has no sizes. */
export interface LayerMember { readonly node: ArchitectureMapNodeV1; readonly files: number | null; readonly lines: number | null }

export interface LayerBand {
  readonly layer: string;
  /** The layer's place in the model's order: `L0` is the top. */
  readonly index: number;
  /** Most own lines first, then by name. */
  readonly members: readonly LayerMember[];
  readonly files: number | null;
  readonly lines: number | null;
  /** The layer box. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The model relations from one layer into another of one edge class. */
export interface LayerLane {
  readonly source: string;
  readonly target: string;
  readonly dashed: boolean;
  readonly relations: readonly string[];
  /** The relations' distinct `protocol` values, in relation order. */
  readonly protocols: readonly string[];
  /** The selected layer's outgoing lanes run right of the boxes, its incoming lanes left. */
  readonly side: 'right' | 'left';
  /** Its points: box side, lane, lane, box side; the arrow is at the last point. */
  readonly route: SceneRoute;
}

export interface LayersLayout {
  readonly bands: readonly LayerBand[];
  /** The lanes of one layer; empty for `null`. */
  readonly lanes: (layer: string | null) => readonly LayerLane[];
  /** The bands with the lanes of one layer. The size does not change with the layer, so the boxes never move. */
  readonly scene: (layer: string | null) => PlacedScene;
}

/** The box id of a band's label; a band's own box has the layer as its id. */
export const bandLabelId = (layer: string) => `label:${layer}`;

const byLines = (a: LayerMember, b: LayerMember) => (b.lines ?? 0) - (a.lines ?? 0) || a.node.name.localeCompare(b.node.name);

/** The layer map of a model with a declared layer order. The decoder gives every node layer a place in `order`. */
export function layoutLayers(map: Pick<ArchitectureMapV1, 'nodes' | 'relations' | 'sizes'>, order: readonly string[]): LayersLayout {
  const totals = new Map(map.sizes.state === 'ok' ? map.sizes.nodes.map(entry => [entry.id, entry]) : []);
  const children = new Map<string, string[]>();
  for (const node of map.nodes) if (node.parent !== null) children.set(node.parent, [...(children.get(node.parent) ?? []), node.id]);
  const own = (id: string, key: 'files' | 'lines'): number | null => map.sizes.state === 'ok'
    ? (totals.get(id)?.[key] ?? 0) - (children.get(id) ?? []).reduce((sum, child) => sum + (totals.get(child)?.[key] ?? 0), 0)
    : null;
  const layerOf = new Map(map.nodes.map(node => [node.id, node.layer]));

  // Every lane of every layer pair, so the gutters fit the layer with the most lanes and the boxes never move.
  const groups = new Map<string, { source: string; target: string; dashed: boolean; relations: string[]; protocols: string[] }>();
  for (const relation of map.relations) {
    const source = layerOf.get(relation.source), target = layerOf.get(relation.target);
    if (source == null || target == null || source === target) continue;
    const dashed = DASHED_KINDS.has(relation.kind);
    const key = `${source}\n${target}\n${dashed}`;
    const group = groups.get(key) ?? { source, target, dashed, relations: [], protocols: [] };
    group.relations.push(relation.id);
    if (relation.protocol !== null && !group.protocols.includes(relation.protocol)) group.protocols.push(relation.protocol);
    groups.set(key, group);
  }
  const rank = new Map(order.map((layer, index) => [layer, index]));
  const lanesOf = (layer: string, side: 'right' | 'left') => [...groups.values()]
    .filter(group => (side === 'right' ? group.source : group.target) === layer)
    .sort((a, b) => rank.get(side === 'right' ? a.target : a.source)! - rank.get(side === 'right' ? b.target : b.source)! || Number(a.dashed) - Number(b.dashed));
  const gutter = (side: 'right' | 'left') => LANE_GAP * (1 + Math.max(0, ...order.map(layer => lanesOf(layer, side).length)));
  const left = MARGIN + LABEL_WIDTH + gutter('left');
  const right = left + LAYER_BOX_WIDTH;

  const bands = order.map((layer, index): LayerBand => {
    const members = map.nodes.filter(node => node.layer === layer).map(node => ({ node, files: own(node.id, 'files'), lines: own(node.id, 'lines') })).sort(byLines);
    const sum = (key: 'files' | 'lines') => map.sizes.state === 'ok' ? members.reduce((total, member) => total + member[key]!, 0) : null;
    return { layer, index, members, files: sum('files'), lines: sum('lines'), x: left, y: MARGIN + index * (LAYER_BOX_HEIGHT + LAYER_GAP), width: LAYER_BOX_WIDTH, height: LAYER_BOX_HEIGHT };
  });
  const band = new Map(bands.map(item => [item.layer, item]));

  const lanes = (layer: string | null): LayerLane[] => {
    if (layer === null || !band.has(layer)) return [];
    return (['right', 'left'] as const).flatMap(side => {
      const list = lanesOf(layer, side);
      const edge = side === 'right' ? right : left;
      const step = side === 'right' ? LANE_GAP : -LANE_GAP;
      // The lanes at the selected box spread along its side; at each other box, the lanes that reach it spread along its side.
      const at = (item: LayerBand, slot: number, count: number) => item.y + (item.height * (slot + 1)) / (count + 1);
      const others = list.map(group => (side === 'right' ? group.target : group.source));
      return list.map((group, slot): LayerLane => {
        const other = others[slot]!;
        const mine = at(band.get(layer)!, slot, list.length);
        const theirs = at(band.get(other)!, others.slice(0, slot).filter(item => item === other).length, others.filter(item => item === other).length);
        const x = edge + step * (slot + 1);
        const [from, to] = side === 'right' ? [mine, theirs] : [theirs, mine];
        const route: SceneRoute = {
          id: `lane:${group.source}->${group.target}:${group.dashed ? 'runtime' : 'code'}`, source: group.source, target: group.target,
          points: [[edge, from], [x, from], [x, to], [edge, to]], arrows: { start: false, end: true }, kind: 'lane', dashed: group.dashed, width: 1.5,
        };
        return { ...group, side, route };
      });
    });
  };

  // A label box ends where the left gutter starts, so the incoming lanes pass no label.
  const boxes = bands.flatMap((item): SceneBox[] => [
    { id: bandLabelId(item.layer), parent: null, x: MARGIN, y: item.y, width: LABEL_WIDTH, height: item.height, kind: 'band' },
    { id: item.layer, parent: null, x: item.x, y: item.y, width: item.width, height: item.height, kind: item.members.length === 0 ? 'external' : 'box' },
  ]);
  const extent = { width: right + gutter('right') + MARGIN, height: MARGIN * 2 + order.length * LAYER_BOX_HEIGHT + Math.max(0, order.length - 1) * LAYER_GAP };
  const scene = (layer: string | null): PlacedScene => ({
    boxes: boxes.map(box => box.id === layer ? { ...box, kind: `${box.kind} selected` } : box),
    routes: lanes(layer).map(lane => lane.route), labels: [], extent,
  });
  return { bands, lanes, scene };
}

/** "14.2k" for 14 200 lines. */
export const compactLines = (lines: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(lines).toLowerCase();
