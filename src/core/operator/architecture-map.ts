// Public contract of the architecture base map (PRD G11). The map collector
// reads the committed model with `archctx export native`, the tracked text files
// of that commit with their line counts, their owners with `archctx resolve`, and
// the capability import counts with `archctx deps`. archctx owns ownership and
// dependency facts; this module only sums line counts along the model's
// `parent` chain and checks the shape. The strict decoder serves the server
// before it sends and the browser before it renders.

export const OPERATOR_ARCHITECTURE_MAP_SCHEMA = 'repo-harness.architecture-map.v1' as const;
export const OPERATOR_ARCHITECTURE_MAP_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/architecture\/map$/u;

/** Why a repository's map cannot be served. Each maps to one HTTP status in the route. */
export const ARCHITECTURE_MAP_UNAVAILABLE_REASONS = [
  'architecture_map_pending',
  'registry_unavailable',
  'repository_not_found',
  'model_unavailable',
  'architecture_map_invalid',
] as const;
export type ArchitectureMapUnavailableReason = typeof ARCHITECTURE_MAP_UNAVAILABLE_REASONS[number];

/** Why line counts are missing while the model itself is served. */
export const ARCHITECTURE_MAP_SIZE_REASONS = ['model_worktree_dirty', 'ownership_unavailable', 'git_read_failed'] as const;
export type ArchitectureMapSizeReason = typeof ARCHITECTURE_MAP_SIZE_REASONS[number];

/** Why import counts are missing. The collector never builds a CodeGraph index. */
export const ARCHITECTURE_MAP_DEPENDENCY_REASONS = ['model_worktree_dirty', 'code_facts_unavailable', 'code_facts_incomplete', 'code_facts_other_commit', 'dependencies_unavailable'] as const;
export type ArchitectureMapDependencyReason = typeof ARCHITECTURE_MAP_DEPENDENCY_REASONS[number];

export interface ArchitectureMapNodeV1 {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly status: string;
  /** The model's layer name; archctx 0.9.3 orders layers by name only. */
  readonly layer: string | null;
  readonly parent: string | null;
  readonly summary: string;
}

export interface ArchitectureMapRelationV1 {
  readonly id: string;
  readonly kind: string;
  readonly source: string;
  readonly target: string;
  readonly intent: string;
}

/** A node's tracked text files and their lines, its own and its descendants'. A node that owns no file is absent. */
export interface ArchitectureMapSizeV1 { readonly id: string; readonly files: number; readonly lines: number }
/** Imports from one capability into another, from `archctx deps`. */
export interface ArchitectureMapImportV1 { readonly source: string; readonly target: string; readonly imports: number }

export type ArchitectureMapSizesV1 =
  | { readonly state: 'ok'; readonly nodes: readonly ArchitectureMapSizeV1[] }
  | { readonly state: 'unavailable'; readonly reason: ArchitectureMapSizeReason };
export type ArchitectureMapDependenciesV1 =
  | { readonly state: 'ok'; readonly edges: readonly ArchitectureMapImportV1[] }
  | { readonly state: 'unavailable'; readonly reason: ArchitectureMapDependencyReason };

export interface ArchitectureMapV1 {
  readonly schema_version: typeof OPERATOR_ARCHITECTURE_MAP_SCHEMA;
  readonly repository_id: string;
  readonly commit: string;
  readonly collected_at: string;
  readonly nodes: readonly ArchitectureMapNodeV1[];
  readonly relations: readonly ArchitectureMapRelationV1[];
  readonly sizes: ArchitectureMapSizesV1;
  readonly dependencies: ArchitectureMapDependenciesV1;
}

type Check = (value: unknown) => boolean;
const text: Check = value => typeof value === 'string';
const nonEmpty: Check = value => typeof value === 'string' && value.length > 0 && value.length <= 4096;
const count: Check = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positive: Check = value => count(value) && (value as number) > 0;
const match = (pattern: RegExp): Check => value => text(value) && pattern.test(value as string);
const one = (...values: unknown[]): Check => value => values.includes(value);
const nullable = (check: Check): Check => value => value === null || check(value);
const list = (check: Check): Check => value => Array.isArray(value) && value.every(check);
const object = (fields: Record<string, Check>): Check => value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === Object.keys(fields).length
    && Object.entries(fields).every(([key, check]) => Object.hasOwn(record, key) && check(record[key]));
};

/** The model's own id and layer grammar (archcontext.node/v2). */
const ENTITY_ID = /^([a-z][a-z0-9]*(\.[a-z0-9][a-z0-9-]*)*::)?[a-z][a-z0-9]*(\.[a-z0-9][a-z0-9-]*)+$/u;
const LAYER = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u;
const KIND = /^[a-z][a-z0-9-]{0,63}$/u;
const id = match(ENTITY_ID);
const node = object({ id, kind: match(KIND), name: nonEmpty, status: match(KIND), layer: nullable(match(LAYER)), parent: nullable(id), summary: text });
const relation = object({ id, kind: match(KIND), source: id, target: id, intent: text });
const size = object({ id, files: positive, lines: count });
const imports = object({ source: id, target: id, imports: positive });
const reason = (values: readonly string[]): Check => object({ state: one('unavailable'), reason: one(...values) });
const map = object({
  schema_version: one(OPERATOR_ARCHITECTURE_MAP_SCHEMA),
  repository_id: match(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u),
  commit: match(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u),
  collected_at: match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u),
  nodes: list(node),
  relations: list(relation),
  sizes: value => object({ state: one('ok'), nodes: list(size) })(value) || reason(ARCHITECTURE_MAP_SIZE_REASONS)(value),
  dependencies: value => object({ state: one('ok'), edges: list(imports) })(value) || reason(ARCHITECTURE_MAP_DEPENDENCY_REASONS)(value),
});

function unique(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

/** The parent chain ends at a top-level node; a cycle, a self parent included, never does. */
function reachesRoot(id: string, nodes: ReadonlyMap<string, ArchitectureMapNodeV1>): boolean {
  const seen = new Set<string>();
  for (let cursor: string | null = id; cursor !== null; cursor = nodes.get(cursor)?.parent ?? null) {
    if (seen.has(cursor)) return false;
    seen.add(cursor);
  }
  return true;
}

/** Shape, identity and referential integrity. Every reference names a node of this map. */
export function decodeArchitectureMap(value: unknown): ArchitectureMapV1 {
  if (!map(value)) throw new Error('architecture_map_invalid');
  const result = value as ArchitectureMapV1;
  const nodes = new Map(result.nodes.map(entry => [entry.id, entry]));
  const capability = (nodeId: string) => nodes.get(nodeId)?.kind === 'capability';
  if (nodes.size !== result.nodes.length || !unique(result.relations.map(entry => entry.id))
    || result.nodes.some(entry => entry.parent !== null && !nodes.has(entry.parent)) || result.nodes.some(entry => !reachesRoot(entry.id, nodes))
    || result.relations.some(entry => !nodes.has(entry.source) || !nodes.has(entry.target))
    || (result.sizes.state === 'ok' && (!unique(result.sizes.nodes.map(entry => entry.id)) || result.sizes.nodes.some(entry => !nodes.has(entry.id))))
    || (result.dependencies.state === 'ok' && (!unique(result.dependencies.edges.map(entry => `${entry.source}\0${entry.target}`))
      || result.dependencies.edges.some(entry => entry.source === entry.target || !capability(entry.source) || !capability(entry.target))))) {
    throw new Error('architecture_map_invalid');
  }
  return result;
}

export type ArchitectureMapSizeInput =
  | {
    readonly state: 'ok';
    /** Lines of each tracked text file of the commit. */
    readonly lines: ReadonlyMap<string, number>;
    /** The deepest owning node of each path from `archctx resolve`; null when unowned or contested. */
    readonly owners: ReadonlyMap<string, string | null>;
  }
  | { readonly state: 'unavailable'; readonly reason: ArchitectureMapSizeReason };

export type ArchitectureMapDependencyInput =
  | { readonly state: 'ok'; readonly matrix: readonly { readonly from: string; readonly to: string; readonly imports: number }[] }
  | { readonly state: 'unavailable'; readonly reason: ArchitectureMapDependencyReason };

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/**
 * Builds the map. A file counts for its owner and every ancestor of the owner on
 * the model's `parent` chain, so a capability shows the lines of its components.
 * An owner that the model does not name fails the projection: the model and the
 * ownership answer then come from different model revisions.
 */
export function projectArchitectureMap(input: {
  readonly repository_id: string;
  readonly commit: string;
  readonly collected_at: string;
  readonly nodes: readonly ArchitectureMapNodeV1[];
  readonly relations: readonly ArchitectureMapRelationV1[];
  readonly sizes: ArchitectureMapSizeInput;
  readonly dependencies: ArchitectureMapDependencyInput;
}): ArchitectureMapV1 {
  const parents = new Map(input.nodes.map(entry => [entry.id, entry.parent]));
  let sizes: ArchitectureMapSizesV1 = input.sizes.state === 'ok' ? { state: 'ok', nodes: [] } : input.sizes;
  if (input.sizes.state === 'ok') {
    const totals = new Map<string, { files: number; lines: number }>();
    for (const [path, lines] of input.sizes.lines) {
      const owner = input.sizes.owners.get(path) ?? null;
      if (owner === null) continue;
      if (!parents.has(owner)) throw new Error('architecture_map_invalid');
      const seen = new Set<string>();
      for (let cursor: string | null = owner; cursor !== null && !seen.has(cursor); cursor = parents.get(cursor) ?? null) {
        seen.add(cursor);
        const total = totals.get(cursor) ?? { files: 0, lines: 0 };
        totals.set(cursor, { files: total.files + 1, lines: total.lines + lines });
      }
    }
    sizes = { state: 'ok', nodes: [...totals].map(([nodeId, total]) => ({ id: nodeId, ...total })).sort((a, b) => compare(a.id, b.id)) };
  }
  const dependencies: ArchitectureMapDependenciesV1 = input.dependencies.state === 'ok'
    ? {
      state: 'ok',
      edges: input.dependencies.matrix.filter(entry => entry.from !== entry.to && entry.imports > 0)
        .map(entry => ({ source: entry.from, target: entry.to, imports: entry.imports }))
        .sort((a, b) => compare(a.source, b.source) || compare(a.target, b.target)),
    }
    : input.dependencies;
  return decodeArchitectureMap({
    schema_version: OPERATOR_ARCHITECTURE_MAP_SCHEMA,
    repository_id: input.repository_id,
    commit: input.commit,
    collected_at: input.collected_at,
    nodes: [...input.nodes].sort((a, b) => compare(a.id, b.id)),
    relations: [...input.relations].sort((a, b) => compare(a.id, b.id)),
    sizes,
    dependencies,
  });
}
