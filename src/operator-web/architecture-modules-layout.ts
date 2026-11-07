// Layout of the module map (the ArchModules artboard): the model's capabilities
// in their domain groups, with the external systems in rows above them. Domain
// groups fill two columns, the largest first, each on the shorter column. A
// capability's components, processes and namespaces are not on this map. Edge
// weights are archctx `deps` import counts summed per domain pair. This module
// computes positions only and adds no fact to the map.

import type { ArchitectureMapNodeV1, ArchitectureMapV1 } from '../core/operator/architecture-map';

export const MODULE_BOX_WIDTH = 200;
export const MODULE_BOX_HEIGHT = 64;
const MODULE_GAP = 8;
const DOMAIN_PADDING = 12;
const DOMAIN_HEADER = 30;
const DOMAIN_GAP = 48;
const DOMAIN_COLUMNS = 2;
const EXTERNAL_HEIGHT = 26;
const EXTERNAL_GAP = 10;
const MARGIN = 16;

export type DomainSide = 'top' | 'right' | 'bottom' | 'left';

export interface ModulesBox { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface ModulesDomain extends ModulesBox { readonly domain: string; readonly column: number }
export interface ModulesCapability extends ModulesBox { readonly node: ArchitectureMapNodeV1; readonly domain: string }
export interface ModulesExternal extends ModulesBox { readonly node: ArchitectureMapNodeV1 }

/** One edge per domain pair, both directions summed; `source` is the first domain in draw order. */
export interface ModulesDomainEdge {
  readonly source: string;
  readonly target: string;
  readonly imports: number;
  readonly strokeWidth: number;
  readonly sourceSide: DomainSide;
  readonly targetSide: DomainSide;
}

export interface ModulesLayout {
  readonly externals: readonly ModulesExternal[];
  /** Draw order: the most capabilities first, then by name. */
  readonly domains: readonly ModulesDomain[];
  readonly capabilities: readonly ModulesCapability[];
  /** Empty when `archctx deps` has no counts. */
  readonly edges: readonly ModulesDomainEdge[];
  readonly width: number;
  readonly height: number;
}

/** Width of an external-system pill: its name at about 7 px per character in 11.5 px type. */
const externalWidth = (name: string) => 24 + 7 * name.length;

export function layoutModules(map: Pick<ArchitectureMapV1, 'nodes' | 'dependencies'>): ModulesLayout {
  // The decoder gives every capability a domain.
  const members = new Map<string, ArchitectureMapNodeV1[]>();
  for (const node of map.nodes) if (node.kind === 'capability') members.set(node.domain!, [...(members.get(node.domain!) ?? []), node]);
  const order = [...members.keys()].sort((a, b) => members.get(b)!.length - members.get(a)!.length || a.localeCompare(b));
  const sized = order.map(domain => {
    const count = members.get(domain)!.length;
    const columns = count === 1 ? 1 : count <= 4 ? 2 : 3;
    const rows = Math.ceil(count / columns);
    return {
      domain, columns,
      width: columns * MODULE_BOX_WIDTH + (columns - 1) * MODULE_GAP + 2 * DOMAIN_PADDING,
      height: DOMAIN_HEADER + rows * MODULE_BOX_HEIGHT + (rows - 1) * MODULE_GAP + DOMAIN_PADDING,
    };
  });
  const placedColumns = Array.from({ length: DOMAIN_COLUMNS }, () => ({ height: 0, width: 0, items: [] as typeof sized }));
  for (const item of sized) {
    const column = placedColumns.reduce((best, entry) => (entry.height < best.height ? entry : best));
    column.items.push(item);
    column.height += (column.items.length > 1 ? DOMAIN_GAP : 0) + item.height;
    column.width = Math.max(column.width, item.width);
  }
  const contentWidth = placedColumns.reduce((sum, column) => sum + column.width, 0) + (DOMAIN_COLUMNS - 1) * DOMAIN_GAP;

  // External systems: rows of pills no wider than the domain columns.
  const externals: ModulesExternal[] = [];
  let cursorX = MARGIN, cursorY = MARGIN;
  for (const node of map.nodes.filter(entry => entry.kind === 'external-system')) {
    const width = externalWidth(node.name);
    if (cursorX > MARGIN && cursorX + width > MARGIN + Math.max(contentWidth, width)) { cursorX = MARGIN; cursorY += EXTERNAL_HEIGHT + EXTERNAL_GAP; }
    externals.push({ node, x: cursorX, y: cursorY, width, height: EXTERNAL_HEIGHT });
    cursorX += width + EXTERNAL_GAP;
  }
  const top = externals.length === 0 ? MARGIN : cursorY + EXTERNAL_HEIGHT + DOMAIN_GAP;

  const domains: ModulesDomain[] = [];
  const capabilities: ModulesCapability[] = [];
  let left = MARGIN;
  placedColumns.forEach((column, columnIndex) => {
    let y = top;
    for (const item of column.items) {
      domains.push({ domain: item.domain, column: columnIndex, x: left, y, width: item.width, height: item.height });
      members.get(item.domain)!.forEach((node, index) => {
        capabilities.push({
          node, domain: item.domain, width: MODULE_BOX_WIDTH, height: MODULE_BOX_HEIGHT,
          x: left + DOMAIN_PADDING + (index % item.columns) * (MODULE_BOX_WIDTH + MODULE_GAP),
          y: y + DOMAIN_HEADER + Math.floor(index / item.columns) * (MODULE_BOX_HEIGHT + MODULE_GAP),
        });
      });
      y += item.height + DOMAIN_GAP;
    }
    left += column.width + DOMAIN_GAP;
  });
  domains.sort((a, b) => order.indexOf(a.domain) - order.indexOf(b.domain));

  const domainOf = new Map(capabilities.map(item => [item.node.id, item.domain]));
  const sums = new Map<string, number>();
  if (map.dependencies.state === 'ok') {
    for (const edge of map.dependencies.edges) {
      const ends = [domainOf.get(edge.source), domainOf.get(edge.target)];
      if (ends[0] === undefined || ends[1] === undefined || ends[0] === ends[1]) continue;
      const key = ends.sort((a, b) => order.indexOf(a!) - order.indexOf(b!)).join('\n');
      sums.set(key, (sums.get(key) ?? 0) + edge.imports);
    }
  }
  const maxImports = Math.max(1, ...sums.values());
  const box = new Map(domains.map(item => [item.domain, item]));
  const edges = [...sums].map(([key, imports]): ModulesDomainEdge => {
    const [source, target] = key.split('\n') as [string, string];
    const a = box.get(source)!, b = box.get(target)!;
    const [sourceSide, targetSide] = sides(a, b);
    return { source, target, imports, strokeWidth: 1 + Math.round(50 * Math.sqrt(imports / maxImports)) / 10, sourceSide, targetSide };
  });

  const boxes: ModulesBox[] = [...externals, ...domains];
  return {
    externals, domains, capabilities, edges,
    width: Math.max(0, ...boxes.map(item => item.x + item.width)) + MARGIN,
    height: Math.max(0, ...boxes.map(item => item.y + item.height)) + MARGIN,
  };
}

/**
 * The sides an edge leaves and enters by. Across columns it joins the facing sides; in one
 * column it joins adjacent groups top to bottom, and arcs round the outer side past a group between them.
 */
function sides(a: ModulesDomain, b: ModulesDomain): [DomainSide, DomainSide] {
  if (a.column !== b.column) return a.column < b.column ? ['right', 'left'] : ['left', 'right'];
  const [upper, lower] = a.y < b.y ? [a, b] : [b, a];
  if (lower.y - (upper.y + upper.height) <= DOMAIN_GAP) return a === upper ? ['bottom', 'top'] : ['top', 'bottom'];
  const outer: DomainSide = a.column === 0 ? 'left' : 'right';
  return [outer, outer];
}
