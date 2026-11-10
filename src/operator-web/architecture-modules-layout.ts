// Layout of the module map (the ArchModules artboard) as one placed scene. Each
// domain is one dagre node, sized by the grid of its capability cards, and the
// cards sit inside it. Each directed domain pair with archctx `deps` imports is
// one route placed by dagre; its width follows the import count. The external
// systems fill rows below the domain graph, each with one route for each
// direction of its declared relations to a domain. A
// capability's components, processes and namespaces are not on this map. This
// module adds no fact to the map.

import type { ArchitectureMapNodeV1, ArchitectureMapV1 } from '../core/operator/architecture-map';
import { capabilityOwners } from './architecture-map-layers';
import { borderPoint, placeLayered, repairRoute, sceneExtent, type PlacedScene, type Point, type SceneBox, type SceneRoute } from './architecture-scene';

const MODULE_BOX_WIDTH = 200;
const MODULE_BOX_HEIGHT = 64;
const MODULE_GAP = 8;
const DOMAIN_PADDING = 12;
const DOMAIN_HEADER = 30;
const EXTERNAL_HEIGHT = 26;
const EXTERNAL_GAP = 16;
const EXTERNAL_ROW_GAP = 24;
const EXTERNAL_TOP_GAP = 72;
const MARGIN = 24;
const EXTERNAL_ROUTE_WIDTH = 1;

/** The scene id of a domain box. Model ids hold no `:`. */
export const domainId = (domain: string) => `domain:${domain}`;

/** One directed domain pair with imports: `source` imports `target`. */
export interface ModulesDomainEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly imports: number;
}

export interface ModulesLayout {
  /** Draw order: the most capabilities first, then by name. */
  readonly domains: readonly string[];
  readonly capabilities: readonly ArchitectureMapNodeV1[];
  readonly externals: readonly ArchitectureMapNodeV1[];
  /** Empty when `archctx deps` has no counts. */
  readonly edges: readonly ModulesDomainEdge[];
  /**
   * Boxes: each domain (`domainId`), its capability cards (the capability id, parent the domain) and each external system.
   * Routes: each domain edge (kind `imports`, an arrow at the target) and each external route (kind `relation`).
   */
  readonly scene: PlacedScene;
}

/** Width of an external-system box: its name at about 7 px per character in 11.5 px type. */
const externalWidth = (name: string) => 24 + 7 * name.length;

/** Stroke width from 1 px to 6 px by the square root of the share of the largest import count, so a larger count draws wider. */
const importWidth = (imports: number, most: number) => Math.round((1 + 5 * Math.sqrt(imports / most)) * 100) / 100;

const columnsOf = (count: number) => count === 1 ? 1 : count <= 4 ? 2 : 3;

export function layoutModules(map: ArchitectureMapV1): ModulesLayout {
  // The decoder gives every capability a domain.
  const members = new Map<string, ArchitectureMapNodeV1[]>();
  for (const node of map.nodes) if (node.kind === 'capability') members.set(node.domain!, [...(members.get(node.domain!) ?? []), node]);
  const domains = [...members.keys()].sort((a, b) => members.get(b)!.length - members.get(a)!.length || a.localeCompare(b));
  const externals = map.nodes.filter(node => node.kind === 'external-system');
  const domainOf = new Map([...members].flatMap(([domain, nodes]) => nodes.map(node => [node.id, domain] as const)));

  const sums = new Map<string, number>();
  if (map.dependencies.state === 'ok') {
    for (const edge of map.dependencies.edges) {
      const [source, target] = [domainOf.get(edge.source), domainOf.get(edge.target)];
      if (source === undefined || target === undefined || source === target) continue;
      const key = `${source}\n${target}`;
      sums.set(key, (sums.get(key) ?? 0) + edge.imports);
    }
  }
  const edges = [...sums].map(([key, imports]): ModulesDomainEdge => {
    const [source, target] = key.split('\n') as [string, string];
    return { id: `imports:${source}->${target}`, source, target, imports };
  });
  const most = Math.max(1, ...sums.values());

  // A relation end goes to the domain of the capability that holds it, or stays an external system; other ends have no box here.
  const owners = capabilityOwners(map);
  const isExternal = new Set(externals.map(node => node.id));
  const end = (id: string) => { const owner = owners.get(id); return owner !== undefined ? domainId(domainOf.get(owner)!) : isExternal.has(id) ? id : null; };
  const externalPairs = new Set<string>();
  for (const relation of map.relations) {
    const [source, target] = [end(relation.source), end(relation.target)];
    if (source !== null && target !== null && source !== target && (isExternal.has(source) || isExternal.has(target))) externalPairs.add(`${source}\n${target}`);
  }

  const size = (domain: string) => {
    const count = members.get(domain)!.length, columns = columnsOf(count), rows = Math.ceil(count / columns);
    return { width: columns * MODULE_BOX_WIDTH + (columns - 1) * MODULE_GAP + 2 * DOMAIN_PADDING, height: DOMAIN_HEADER + rows * MODULE_BOX_HEIGHT + (rows - 1) * MODULE_GAP + DOMAIN_PADDING };
  };
  const route = (id: string, source: string, target: string, kind: string, width: number): Omit<SceneRoute, 'points'> =>
    ({ id, source, target, arrows: { start: false, end: true }, kind, dashed: false, width });
  const placed = placeLayered({
    nodes: domains.map(domain => ({ id: domainId(domain), kind: 'frame', ...size(domain) })),
    edges: edges.map(edge => ({ ...route(edge.id, domainId(edge.source), domainId(edge.target), 'imports', importWidth(edge.imports, most)), weight: edge.imports })),
    nodesep: 48, ranksep: 72, margin: MARGIN,
  });
  // The external systems fill rows below the domain graph, no wider than it, so they do not widen the map.
  const graphWidth = Math.max(0, ...placed.boxes.map(box => box.x + box.width));
  const outside: SceneBox[] = [];
  let cursorX = MARGIN, cursorY = Math.max(0, ...placed.boxes.map(box => box.y + box.height)) + EXTERNAL_TOP_GAP;
  for (const node of externals) {
    const width = externalWidth(node.name);
    if (cursorX > MARGIN && cursorX + width > graphWidth) { cursorX = MARGIN; cursorY += EXTERNAL_HEIGHT + EXTERNAL_ROW_GAP; }
    outside.push({ id: node.id, parent: null, x: cursorX, y: cursorY, width, height: EXTERNAL_HEIGHT, kind: 'external' });
    cursorX += width + EXTERNAL_GAP;
  }
  const top = [...placed.boxes, ...outside];
  const byId = new Map(top.map(box => [box.id, box]));
  const centre = (box: SceneBox): Point => [box.x + box.width / 2, box.y + box.height / 2];
  // An external route runs straight between the facing borders and takes the shortest detour round each box in its way.
  const externalRoutes = [...externalPairs].map((key): SceneRoute => {
    const [source, target] = key.split('\n') as [string, string];
    const [from, to] = [byId.get(source)!, byId.get(target)!];
    const points = repairRoute([borderPoint(from, centre(to)), borderPoint(to, centre(from))], top.filter(box => box !== from && box !== to));
    return { ...route(`relation:${source}->${target}`, source, target, 'relation', EXTERNAL_ROUTE_WIDTH), points };
  });
  const routes = [...placed.routes, ...externalRoutes];

  const cards = domains.flatMap(domain => {
    const frame = byId.get(domainId(domain))!, columns = columnsOf(members.get(domain)!.length);
    return members.get(domain)!.map((node, index): SceneBox => ({
      id: node.id, parent: frame.id, kind: 'box', width: MODULE_BOX_WIDTH, height: MODULE_BOX_HEIGHT,
      x: frame.x + DOMAIN_PADDING + (index % columns) * (MODULE_BOX_WIDTH + MODULE_GAP),
      y: frame.y + DOMAIN_HEADER + Math.floor(index / columns) * (MODULE_BOX_HEIGHT + MODULE_GAP),
    }));
  });
  // A card follows its frame, so the shell can give each child a position inside its parent.
  const boxes = top.flatMap(box => [box, ...cards.filter(card => card.parent === box.id)]);
  return {
    domains, capabilities: domains.flatMap(domain => members.get(domain)!), externals, edges,
    scene: { boxes, routes, labels: [], extent: sceneExtent(boxes, routes, MARGIN) },
  };
}

/** How a card takes part in an undeclared import inside its own domain: it imports (`out`), it is imported (`in`), or both. */
export type UndeclaredEnd = 'out' | 'in' | 'both';

/**
 * The undeclared imports (capability pairs) on the scene. An import between two domains marks its domain route, which keeps
 * its direction. An import inside one domain has no route, so it marks the two cards with their direction.
 */
export function markUndeclared(layout: ModulesLayout, imports: readonly { readonly source: string; readonly target: string }[]): { readonly scene: PlacedScene; readonly cards: ReadonlyMap<string, UndeclaredEnd> } {
  const domainOf = new Map(layout.capabilities.map(node => [node.id, node.domain!]));
  const routes = new Set<string>();
  const cards = new Map<string, UndeclaredEnd>();
  const mark = (id: string, end: 'out' | 'in') => cards.set(id, cards.has(id) && cards.get(id) !== end ? 'both' : end);
  for (const edge of imports) {
    const [source, target] = [domainOf.get(edge.source)!, domainOf.get(edge.target)!];
    if (source !== target) routes.add(`imports:${source}->${target}`);
    else { mark(edge.source, 'out'); mark(edge.target, 'in'); }
  }
  const scene = routes.size === 0 ? layout.scene
    : { ...layout.scene, routes: layout.scene.routes.map(route => routes.has(route.id) ? { ...route, kind: 'undeclared', dashed: true } : route) };
  return { scene, cards };
}
