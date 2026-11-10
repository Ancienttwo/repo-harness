// The placed scene of an architecture view: boxes, point routes and label
// boxes in canvas pixels. The canvas shell draws it, `sceneSvg` writes it as a
// file and `sceneFindings` checks it, so the screen, the file and the check
// read one geometry. `placeLayered` places a free graph with dagre. This
// module has no React and no DOM.

import * as dagre from '@dagrejs/dagre';

export type Point = readonly [number, number];

export interface SceneBox {
  readonly id: string;
  /** The box that holds this box; null at the top level. */
  readonly parent: string | null;
  /** Top-left corner on the canvas. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The drawing class of the box in the SVG file. */
  readonly kind: string;
}

export interface SceneRoute {
  readonly id: string;
  /** The box ids of the two ends. */
  readonly source: string;
  readonly target: string;
  /** Two or more points; the first is on the source border and the last on the target border. */
  readonly points: readonly Point[];
  readonly arrows: { readonly start: boolean; readonly end: boolean };
  readonly kind: string;
  readonly dashed: boolean;
  /** Stroke width in px. */
  readonly width: number;
}

export interface SceneLabel {
  readonly text: string;
  /** Top-left corner of the label box. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The route that the label names; the label may sit on that route. */
  readonly route: string | null;
}

export interface PlacedScene {
  readonly boxes: readonly SceneBox[];
  readonly routes: readonly SceneRoute[];
  readonly labels: readonly SceneLabel[];
  readonly extent: { readonly width: number; readonly height: number };
}

/** The estimate of a label box: the checks have no font metrics. */
const LABEL_CHAR = 7;
const LABEL_HEIGHT = 16;
/** A detour runs over box corners grown by this many px on both axes. */
const DETOUR_GAP = 12;

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
const middle = (a: Point, b: Point): Point => [round2((a[0] + b[0]) / 2), round2((a[1] + b[1]) / 2)];
const coordinates = ([x, y]: Point) => `${x} ${y}`;

/**
 * The SVG path of a route: straight to the middle of the first segment, a quadratic curve through each inner
 * point to the middle of the next segment, and straight into the last point.
 */
export function routePath(points: readonly Point[]): string {
  const last = points.length - 1;
  if (last === 1) return `M${coordinates(points[0]!)} L${coordinates(points[1]!)}`;
  const parts = [`M${coordinates(points[0]!)}`, `L${coordinates(middle(points[0]!, points[1]!))}`];
  for (let index = 1; index < last; index++) parts.push(`Q${coordinates(points[index]!)} ${coordinates(middle(points[index]!, points[index + 1]!))}`);
  parts.push(`L${coordinates(points[last]!)}`);
  return parts.join(' ');
}

/** Points on each quadratic curve of the drawn geometry. */
const CURVE_STEPS = 16;

function quadratic(from: Point, control: Point, to: Point): Point[] {
  return Array.from({ length: CURVE_STEPS }, (_, index) => {
    const t = (index + 1) / CURVE_STEPS, u = 1 - t;
    return [u * u * from[0] + 2 * u * t * control[0] + t * t * to[0], u * u * from[1] + 2 * u * t * control[1] + t * t * to[1]] as const;
  });
}

/** The line that `routePath` draws, as a polyline: the straight ends and each curve in `CURVE_STEPS` points. */
export function routeGeometry(points: readonly Point[]): Point[] {
  const last = points.length - 1;
  if (last === 1) return [points[0]!, points[1]!];
  const line: Point[] = [points[0]!, middle(points[0]!, points[1]!)];
  for (let index = 1; index < last; index++) line.push(...quadratic(middle(points[index - 1]!, points[index]!), points[index]!, middle(points[index]!, points[index + 1]!)));
  line.push(points[last]!);
  return line;
}

const pairs = (line: readonly Point[]) => line.slice(1).map((point, index) => [line[index]!, point] as const);

/** The label box of `text` centred on `at`. */
export function labelAt(text: string, at: Point, route: string | null): SceneLabel {
  const width = text.length * LABEL_CHAR;
  return { text, x: round1(at[0] - width / 2), y: round1(at[1] - LABEL_HEIGHT / 2), width, height: LABEL_HEIGHT, route };
}

/** The point at half the length of a route's polyline. */
export function routeMiddle(points: readonly Point[]): Point {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index]![0], point[1] - points[index]![1]));
  let rest = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (const [index, length] of lengths.entries()) {
    if (rest <= length && length > 0) {
      const [a, b] = [points[index]!, points[index + 1]!];
      return [round1(a[0] + ((b[0] - a[0]) * rest) / length), round1(a[1] + ((b[1] - a[1]) * rest) / length)];
    }
    rest -= length;
  }
  return points[points.length - 1]!;
}

type Rect = Pick<SceneBox, 'x' | 'y' | 'width' | 'height'>;

/** The point where the ray from the centre of `box` toward `toward` leaves the box. */
export function borderPoint(box: Rect, toward: Point): Point {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const dx = toward[0] - cx, dy = toward[1] - cy;
  if (dx === 0 && dy === 0) return [round1(cx), round1(box.y)];
  const scale = Math.min(dx === 0 ? Infinity : box.width / 2 / Math.abs(dx), dy === 0 ? Infinity : box.height / 2 / Math.abs(dy));
  return [round1(cx + dx * scale), round1(cy + dy * scale)];
}

/** The part of segment a-b inside `rect` grown by `grow` px, as a parameter range, or null (Liang-Barsky). */
function clip(a: Point, b: Point, rect: Rect, grow: number): readonly [number, number] | null {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let low = 0, high = 1;
  const sides: readonly (readonly [number, number])[] = [
    [-dx, a[0] - (rect.x - grow)], [dx, rect.x + rect.width + grow - a[0]],
    [-dy, a[1] - (rect.y - grow)], [dy, rect.y + rect.height + grow - a[1]],
  ];
  for (const [p, q] of sides) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) low = Math.max(low, t); else high = Math.min(high, t);
    if (low > high) return null;
  }
  return [low, high];
}

/** Segment a-b passes through the inside of `rect`; touching or running along its border does not count. */
function enters(a: Point, b: Point, rect: Rect): boolean {
  const range = clip(a, b, rect, -0.5);
  return range !== null && (range[1] - range[0]) * Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.01;
}

/** Segment a-b touches `rect`, its border included. */
const touchesRect = (a: Point, b: Point, rect: Rect) => clip(a, b, rect, 0) !== null;

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const touchesBox = (a: Rect, b: Rect) => a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The corners of `box`, each `DETOUR_GAP` px outside it on both axes. */
const corners = (box: Rect): readonly Point[] => [
  [box.x - DETOUR_GAP, box.y - DETOUR_GAP], [box.x + box.width + DETOUR_GAP, box.y - DETOUR_GAP],
  [box.x - DETOUR_GAP, box.y + box.height + DETOUR_GAP], [box.x + box.width + DETOUR_GAP, box.y + box.height + DETOUR_GAP],
];

/** `point` lies inside `box`, more than 0.5 px from its border. */
const inside = (point: Point, box: Rect) => point[0] > box.x + 0.5 && point[0] < box.x + box.width - 0.5 && point[1] > box.y + 0.5 && point[1] < box.y + box.height - 0.5;

/**
 * The shortest path from `from` to `to` over the corners of every obstacle grown by `DETOUR_GAP`, where each step goes
 * through no obstacle; null when no such path exists. It is Dijkstra on a finite node set, so it ends.
 */
function shortestDetour(from: Point, to: Point, obstacles: readonly Rect[]): Point[] | null {
  const nodes: Point[] = [from, to, ...obstacles.flatMap(corners).filter(point => !obstacles.some(box => inside(point, box)))];
  const cost = nodes.map(() => Infinity);
  const previous = nodes.map(() => -1);
  const settled = nodes.map(() => false);
  cost[0] = 0;
  for (;;) {
    let next = -1;
    for (const [index, value] of cost.entries()) if (!settled[index] && value < Infinity && (next < 0 || value < cost[next]!)) next = index;
    if (next < 0) return null;
    if (next === 1) break;
    settled[next] = true;
    for (const [index, node] of nodes.entries()) {
      const value = cost[next]! + distance(nodes[next]!, node);
      if (!settled[index] && value < cost[index]! && !obstacles.some(box => enters(nodes[next]!, node, box))) { cost[index] = value; previous[index] = next; }
    }
  }
  const path: Point[] = [];
  for (let index = 1; index >= 0; index = previous[index]!) path.unshift(nodes[index]!);
  return path;
}

/** Replaces each straight segment that goes through an obstacle with its shortest detour; a segment with no detour stays, and the check reports it. */
function detour(points: readonly Point[], obstacles: readonly Rect[]): Point[] {
  return points.flatMap((point, index) => {
    const next = points[index + 1];
    if (next === undefined || !obstacles.some(box => enters(point, next, box))) return [point];
    return (shortestDetour(point, next, obstacles) ?? [point, next]).slice(0, -1);
  });
}

/** Removes each loop: when a point comes back, the points between its two visits go. The ends stay. */
function withoutRepeats(points: readonly Point[]): Point[] {
  const route: Point[] = [];
  for (const point of points) {
    const seen = route.findIndex(item => item[0] === point[0] && item[1] === point[1]);
    if (seen >= 0) route.length = seen;
    route.push(point);
  }
  return route;
}

/** The point `length` px from `from` toward `to`, at most a quarter of the way. */
function toward(from: Point, to: Point, length: number): Point {
  const share = Math.min(length / Math.max(distance(from, to), 0.01), 0.25);
  return [round1(from[0] + (to[0] - from[0]) * share), round1(from[1] + (to[1] - from[1]) * share)];
}

/**
 * The curve at an inner point cuts the corner between the two segment middles. When that curve enters a box, two
 * points on the segments close to the inner point make the curve hug the corner; a box that the straight segments
 * clear then stays clear. Each round halves the distance.
 */
function tighten(points: readonly Point[], obstacles: readonly Rect[]): Point[] {
  let route = [...points];
  for (let round = 0, length = 8; round < 6; round++, length /= 2) {
    const cuts = (index: number) => index > 0 && index < route.length - 1 && pairs([middle(route[index - 1]!, route[index]!),
      ...quadratic(middle(route[index - 1]!, route[index]!), route[index]!, middle(route[index]!, route[index + 1]!))]).some(([a, b]) => obstacles.some(box => enters(a, b, box)));
    if (!route.some((_, index) => cuts(index))) break;
    route = route.flatMap((point, index) => cuts(index) ? [toward(point, route[index - 1]!, length), point, toward(point, route[index + 1]!, length)] : [point]);
  }
  return route;
}

/**
 * Repairs a route so that the line `routePath` draws goes through none of `obstacles`: the shortest corner detour for
 * each straight segment that goes through one, then tighter curves, with no repeated point. The ends stay. A route
 * that still goes through a box stays so, and `sceneFindings` reports it.
 */
export function repairRoute(points: readonly Point[], obstacles: readonly Rect[]): Point[] {
  return withoutRepeats(tighten(detour(points, obstacles), obstacles));
}

/** The size of the canvas that holds every box and every route point, with `margin` px on the right and at the bottom. */
export function sceneExtent(boxes: readonly SceneBox[], routes: readonly SceneRoute[], margin: number): PlacedScene['extent'] {
  const points = routes.flatMap(route => route.points);
  return {
    width: Math.max(0, ...boxes.map(box => box.x + box.width), ...points.map(point => point[0])) + margin,
    height: Math.max(0, ...boxes.map(box => box.y + box.height), ...points.map(point => point[1])) + margin,
  };
}

export interface LayeredGraph {
  readonly nodes: readonly Omit<SceneBox, 'x' | 'y' | 'parent'>[];
  /** `weight`: dagre keeps a heavier edge shorter and straighter. */
  readonly edges: readonly (Omit<SceneRoute, 'points'> & { readonly weight: number })[];
  readonly nodesep: number;
  readonly ranksep: number;
  readonly margin: number;
}

/**
 * A free graph placed top to bottom by a dagre multigraph: every node is a top-level box, and every edge keeps its
 * own route from the dagre points, rounded to 0.1 px. `repair` false leaves a drawn route that goes through a third box.
 */
export function placeLayered(input: LayeredGraph, repair = true): PlacedScene {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: 'TB', nodesep: input.nodesep, ranksep: input.ranksep, marginx: input.margin, marginy: input.margin });
  for (const node of input.nodes) graph.setNode(node.id, { width: node.width, height: node.height });
  for (const edge of input.edges) graph.setEdge(edge.source, edge.target, { weight: edge.weight }, edge.id);
  dagre.layout(graph);
  const boxes = input.nodes.map((node): SceneBox => {
    const { x, y } = graph.node(node.id) as { x: number; y: number };
    return { id: node.id, parent: null, x: round1(x - node.width / 2), y: round1(y - node.height / 2), width: node.width, height: node.height, kind: node.kind };
  });
  const routes = input.edges.map(({ weight: _weight, ...edge }): SceneRoute => {
    const placed = (graph.edge(edge.source, edge.target, edge.id) as { points: readonly { x: number; y: number }[] }).points.map(({ x, y }): Point => [round1(x), round1(y)]);
    const obstacles = boxes.filter(box => box.id !== edge.source && box.id !== edge.target);
    return { ...edge, points: repair ? repairRoute(placed, obstacles) : placed };
  });
  return { boxes, routes, labels: [], extent: sceneExtent(boxes, routes, input.margin) };
}

export type SceneFinding =
  | { readonly kind: 'overlap'; readonly ids: readonly [string, string] }
  | { readonly kind: 'route-through-box'; readonly ids: readonly [string, string] }
  | { readonly kind: 'route-end'; readonly ids: readonly [string, string] }
  | { readonly kind: 'label'; readonly ids: readonly [string, string] }
  | { readonly kind: 'first-rank'; readonly ids: readonly string[] };

/** The first view of the scene: the canvas size and the viewport that the shell sets on it. */
export interface SceneView {
  readonly canvas: { readonly width: number; readonly height: number };
  readonly viewport: { readonly x: number; readonly y: number; readonly zoom: number };
}

/** How far `point` is from the border of `box`, inside or outside. */
function borderDistance(point: Point, box: Rect): number {
  const [x, y] = point;
  const dx = Math.max(box.x - x, 0, x - box.x - box.width);
  const dy = Math.max(box.y - y, 0, y - box.y - box.height);
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  return Math.min(x - box.x, box.x + box.width - x, y - box.y, box.y + box.height - y);
}

/**
 * The top-level boxes of the first rank: the boxes whose top is above the bottom of the topmost box. In a dagre
 * rank the boxes share one centre, so the tallest box of the first rank is the topmost box and no later box starts above its bottom.
 */
function firstRank(boxes: readonly SceneBox[]): SceneBox[] {
  const top = boxes.filter(box => box.parent === null);
  if (top.length === 0) return [];
  const topmost = top.reduce((best, box) => box.y < best.y ? box : best);
  return top.filter(box => box.y < topmost.y + topmost.height);
}

/**
 * The geometry check of a scene, on the line that `routePath` draws. It reports sibling boxes that overlap, a route
 * that goes through a box that is not an end or the ancestor of an end, a route end more than 1 px from its box border, a label box that touches a box or
 * another route, and, with `view`, a first view that cuts the first rank at the top or the bottom or shows none of its boxes whole.
 */
export function sceneFindings(scene: PlacedScene, view: SceneView | null = null): SceneFinding[] {
  const findings: SceneFinding[] = [];
  const byId = new Map(scene.boxes.map(box => [box.id, box]));
  for (const [index, a] of scene.boxes.entries()) {
    for (const b of scene.boxes.slice(index + 1)) if (a.parent === b.parent && overlaps(a, b)) findings.push({ kind: 'overlap', ids: [a.id, b.id] });
  }
  const lineage = (id: string) => { const ids = new Set<string>(); for (let cursor: string | null = id; cursor !== null; cursor = byId.get(cursor)?.parent ?? null) ids.add(cursor); return ids; };
  const drawn = new Map(scene.routes.map(route => [route.id, pairs(routeGeometry(route.points))]));
  const segments = (route: SceneRoute) => drawn.get(route.id)!;
  for (const route of scene.routes) {
    const allowed = new Set([...lineage(route.source), ...lineage(route.target)]);
    for (const box of scene.boxes) {
      if (!allowed.has(box.id) && segments(route).some(([a, b]) => enters(a, b, box))) findings.push({ kind: 'route-through-box', ids: [route.id, box.id] });
    }
    if (borderDistance(route.points[0]!, byId.get(route.source)!) > 1) findings.push({ kind: 'route-end', ids: [route.id, route.source] });
    if (borderDistance(route.points[route.points.length - 1]!, byId.get(route.target)!) > 1) findings.push({ kind: 'route-end', ids: [route.id, route.target] });
  }
  for (const label of scene.labels) {
    for (const box of scene.boxes) if (touchesBox(label, box)) findings.push({ kind: 'label', ids: [label.text, box.id] });
    for (const route of scene.routes) {
      if (route.id !== label.route && segments(route).some(([a, b]) => touchesRect(a, b, label))) findings.push({ kind: 'label', ids: [label.text, route.id] });
    }
  }
  if (view !== null) {
    const { canvas, viewport } = view;
    const shown = { x: -viewport.x / viewport.zoom, y: -viewport.y / viewport.zoom, width: canvas.width / viewport.zoom, height: canvas.height / viewport.zoom };
    const rank = firstRank(scene.boxes);
    const inside = (box: Rect) => box.x >= shown.x && box.y >= shown.y && box.x + box.width <= shown.x + shown.width && box.y + box.height <= shown.y + shown.height;
    const top = Math.min(...rank.map(box => box.y)), bottom = Math.max(...rank.map(box => box.y + box.height));
    if (rank.length > 0 && (top < shown.y || bottom > shown.y + shown.height || !rank.some(inside))) findings.push({ kind: 'first-rank', ids: rank.map(box => box.id) });
  }
  return findings;
}

/** The drawing classes of the file. A view adds a class here when it adds a box or route kind. */
const STYLE = [
  'text{font-family:system-ui,sans-serif;font-size:12px;fill:#1F2328}',
  '.box{fill:#F2F4F7;stroke:#D3D9E0}.frame{fill:#FFFFFF;stroke:#D3D9E0}.external{fill:#FFFFFF;stroke:#D3D9E0;stroke-dasharray:6 4}.member{fill:#FFFFFF;stroke:#D3D9E0}',
  '.writer{fill:#E4F2EA;stroke:#1F8A5B}.reader{fill:#FFFFFF;stroke:#8C96A3;stroke-dasharray:4 3}.point{fill:#E8EFFB;stroke:#2D5BB8}',
  '.title{font-size:13px;font-weight:600}.detail{fill:#5B6573}',
  '.route{fill:none;stroke:#5B6573}.route.dashed{stroke-dasharray:6 4}',
  '.label-box{fill:#FFFFFF}.label{font-family:ui-monospace,monospace;font-size:11px;fill:#1F2328}',
].join('');

const escape = (value: string) => value.replace(/[&<>"]/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);

/** The text lines of a box in the file: the first line is its title. A box lower than two lines holds one centred line. */
function boxText(box: SceneBox, lines: readonly string[]): string {
  if (box.height < 32) return lines.length === 0 ? '' : `<text class="title" x="${box.x + 8}" y="${box.y + box.height / 2 + 4}">${escape(lines[0]!)}</text>`;
  return lines.map((line, index) => `<text class="${index === 0 ? 'title' : 'detail'}" x="${box.x + 12}" y="${box.y + 20 + index * 16}">${escape(line)}</text>`).join('');
}

/**
 * The scene as a standalone SVG file, with no stylesheet of the console. A box draws its `lines`, clipped at the box;
 * a route is one path whose `d` is `routePath(points)`; a label draws on a white box.
 */
export function sceneSvg(scene: PlacedScene, lines: (box: SceneBox) => readonly string[]): string {
  const { width, height } = scene.extent;
  const parts: string[] = [];
  for (const [index, box] of scene.boxes.entries()) {
    parts.push(
      `<clipPath id="clip-${index}"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="10"/></clipPath>`,
      `<rect class="${box.kind}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="10"/>`,
      `<g clip-path="url(#clip-${index})">${boxText(box, lines(box))}</g>`,
    );
  }
  for (const route of scene.routes) {
    const markers = `${route.arrows.start ? ' marker-start="url(#arrow)"' : ''}${route.arrows.end ? ' marker-end="url(#arrow)"' : ''}`;
    parts.push(`<path class="route${route.dashed ? ' dashed' : ''}" stroke-width="${route.width}" d="${routePath(route.points)}"${markers}/>`);
  }
  for (const label of scene.labels) {
    parts.push(`<rect class="label-box" x="${label.x}" y="${label.y}" width="${label.width}" height="${label.height}" rx="3"/>`,
      `<text class="label" x="${label.x + label.width / 2}" y="${label.y + 12}" text-anchor="middle">${escape(label.text)}</text>`);
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<style>${STYLE}</style>`,
    '<defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="#5B6573"/></marker></defs>',
    `<rect width="${width}" height="${height}" fill="#FFFFFF"/>`,
    ...parts,
    '</svg>',
  ].join('\n');
}
