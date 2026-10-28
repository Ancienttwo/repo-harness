// Public contract of the architecture base map and its layers (PRD G11, G22).
// The map collector reads the committed model with `archctx export native`, the
// tracked text files of that commit with their line counts, their owners with
// `archctx resolve`, and the capability import counts with `archctx deps`.
// The layers come from the same cycle: git history since local midnight,
// `archctx debt` and `docs anchors`, the open PRs' changed files from the
// Dev Activity cache with their owners from `archctx resolve`, and the tests
// collector's cache. archctx owns ownership, dependency, flow and anchor facts; this module
// only sums counts along the model's `parent` chain and checks the shape. The
// strict decoder serves the server before it sends and the browser before it
// renders.

import { DEV_ACTIVITY_PR_FILES_REASONS, type DevActivityPrFiles, type DevActivitySnapshotV2 } from '../dev-activity/types';
import { isPublicDevActivityText, isPublicRepoPath, publicDevActivityText } from './public-text';
import { TESTS_UNAVAILABLE_REASONS, type TestsSnapshotV1, type TestsUnavailableReason } from './tests';

export const OPERATOR_ARCHITECTURE_MAP_SCHEMA = 'repo-harness.architecture-map.v2' as const;
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
export const ARCHITECTURE_MAP_SIZE_REASONS = ['model_worktree_dirty', 'checkout_changed', 'ownership_unavailable', 'git_read_failed'] as const;
export type ArchitectureMapSizeReason = typeof ARCHITECTURE_MAP_SIZE_REASONS[number];

/**
 * Why import counts are missing. The collector never builds a CodeGraph index.
 * The index covers the working tree, so it describes the commit only while the
 * whole tree is clean: `code_facts_worktree_dirty` otherwise.
 */
export const ARCHITECTURE_MAP_DEPENDENCY_REASONS = ['model_worktree_dirty', 'checkout_changed', 'code_facts_worktree_dirty', 'code_facts_unavailable', 'code_facts_incomplete', 'code_facts_other_commit', 'dependencies_unavailable'] as const;
export type ArchitectureMapDependencyReason = typeof ARCHITECTURE_MAP_DEPENDENCY_REASONS[number];

/** Today's changes resolve owners like line counts do; a first-parent history that starts after midnight has no base commit. */
export const ARCHITECTURE_CHANGE_REASONS = [...ARCHITECTURE_MAP_SIZE_REASONS, 'history_starts_today'] as const;
export type ArchitectureChangeReason = typeof ARCHITECTURE_CHANGE_REASONS[number];
/** `export native` failed at the base commit, for example before the model existed. */
export const ARCHITECTURE_MODEL_DELTA_REASONS = ['model_base_unavailable'] as const;
export type ArchitectureModelDeltaReason = typeof ARCHITECTURE_MODEL_DELTA_REASONS[number];
/** Each violation check reads the worktree model and the CodeGraph index, as import counts do. */
export const ARCHITECTURE_VIOLATION_REASONS = [...ARCHITECTURE_MAP_DEPENDENCY_REASONS, 'archctx_failed'] as const;
export type ArchitectureViolationReason = typeof ARCHITECTURE_VIOLATION_REASONS[number];
/** The tests collector's own reasons, a projection gap, or a projection that names a capability the map does not have. */
export const ARCHITECTURE_TEST_REASONS = [...TESTS_UNAVAILABLE_REASONS, 'projection_missing', 'projection_invalid', 'tests_model_mismatch'] as const;
export type ArchitectureTestReason = typeof ARCHITECTURE_TEST_REASONS[number];
/** The Dev Activity cache has not collected yet, or has no complete GitHub read for the repository; owners resolve like line counts do. */
export const ARCHITECTURE_PR_LAYER_REASONS = [...ARCHITECTURE_MAP_SIZE_REASONS, 'dev_activity_pending', 'dev_activity_unavailable'] as const;
export type ArchitecturePullRequestsReason = typeof ARCHITECTURE_PR_LAYER_REASONS[number];
/** One open PR without impact: gh gave no head commit, or no complete file list. */
export const ARCHITECTURE_PR_REASONS = ['head_missing', ...DEV_ACTIVITY_PR_FILES_REASONS] as const;
export type ArchitecturePullRequestReason = typeof ARCHITECTURE_PR_REASONS[number];
/** archctx exports the decisions with their `appliesTo` nodes; the collector does not read them yet. */
export const ARCHITECTURE_DECISION_REASON = 'decisions_not_exported' as const;
/** `archctx impact` reads the flow steps a change reaches; the collector does not call it yet. */
export const ARCHITECTURE_FLOW_STEP_REASON = 'change_impact_not_exported' as const;
/** `archctx flows check` runs `codegraph sync` unless it is given `--no-sync`; the collector runs neither. */
export const ARCHITECTURE_FLOWS_REASON = 'flows_check_writes_index' as const;
/** archctx orders layers; the collector does not evaluate the layer direction rule yet. */
export const ARCHITECTURE_LAYER_DIRECTION_REASON = 'layer_order_not_released' as const;
/** The debt kinds that `archctx debt` reports itself; it defers dependency, flow and practice checks. A stale anchor may name no path. */
export const ARCHITECTURE_DEBT_KINDS = ['unowned-path', 'ambiguous-owner', 'stale-anchor'] as const;
export type ArchitectureDebtKind = typeof ARCHITECTURE_DEBT_KINDS[number];

export interface ArchitectureMapNodeV1 {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly status: string;
  /** The model's layer name; the map shows it as a node attribute and does not order by layer. */
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

type Gap<Reason extends string> = { readonly state: 'unavailable'; readonly reason: Reason };
type Section<Fields, Reason extends string> = ({ readonly state: 'ok' } & Fields) | Gap<Reason>;

/** Changed files and lines of one node, its own and its descendants'. A node with no changed file is absent. */
export interface ArchitectureChangeV1 { readonly id: string; readonly files: number; readonly added: number; readonly deleted: number }
/** Model entities whose committed content differs between the base and the map commit. */
export interface ArchitectureModelDeltaV1 {
  readonly nodes_added: readonly string[];
  readonly nodes_removed: readonly string[];
  readonly nodes_changed: readonly string[];
  readonly relations_added: readonly string[];
  readonly relations_removed: readonly string[];
  readonly relations_changed: readonly string[];
}
export type ArchitectureChangesLayerV1 = Section<{
  /** Local midnight of the collector host, as an instant. */
  readonly since: string;
  /** The newest first-parent commit before `since`; the diff runs from it to the map commit. */
  readonly base: string;
  readonly commits: number;
  readonly files: number;
  /** Changed files that no node owns, or that two nodes contest. */
  readonly unowned_files: number;
  readonly nodes: readonly ArchitectureChangeV1[];
  readonly model: Section<ArchitectureModelDeltaV1, ArchitectureModelDeltaReason>;
  /** Which flow steps the changes reach. */
  readonly flow_steps: Gap<typeof ARCHITECTURE_FLOW_STEP_REASON>;
}, ArchitectureChangeReason>;

export interface ArchitectureDebtItemV1 { readonly kind: ArchitectureDebtKind; readonly nodes: readonly string[]; readonly paths: readonly string[] }
export interface ArchitectureViolationsLayerV1 {
  /** `archctx debt`: unowned and contested paths, stale model anchors. */
  readonly debt: Section<{ readonly items: readonly ArchitectureDebtItemV1[] }, ArchitectureViolationReason>;
  /** Flow proofs: `archctx flows check` would sync (write) the user's CodeGraph index. */
  readonly flows: Gap<typeof ARCHITECTURE_FLOWS_REASON>;
  /** `archctx docs anchors`: citations in human-written module docs that no longer match the code. */
  readonly anchors: Section<{ readonly citations: number; readonly nodes: readonly { readonly id: string; readonly findings: number }[] }, ArchitectureViolationReason>;
  /** `archctx deps` rows that archctx marks undeclared: imports with no model relation behind them. */
  readonly dependencies: Section<{ readonly edges: readonly ArchitectureMapImportV1[] }, ArchitectureViolationReason>;
  /** Imports against the layer order. */
  readonly layer_direction: Gap<typeof ARCHITECTURE_LAYER_DIRECTION_REASON>;
}

/** Test files of one capability by their result in the daily run. `no_result`: the run has no report for the file. */
export interface ArchitectureTestCoverageV1 {
  readonly id: string;
  readonly files: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly no_result: number;
}
export type ArchitectureTestsLayerV1 = Section<{
  readonly run: { readonly id: number; readonly head_sha: string; readonly created_at: string };
  readonly results: 'ok' | 'junit_missing' | 'junit_invalid';
  readonly capabilities: readonly ArchitectureTestCoverageV1[];
}, ArchitectureTestReason>;

/** Changed files of one open PR at its head, rolled up like today's changes, with owners from the map commit's model. */
export interface ArchitecturePullRequestImpactV1 {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  /** The head commit gh reported; the files are the PR's diff at this head. */
  readonly head_sha: string | null;
  readonly impact: Section<{
    readonly files: number;
    /** Changed files that no node owns, or that two nodes contest. */
    readonly unowned_files: number;
    readonly nodes: readonly { readonly id: string; readonly files: number }[];
  }, ArchitecturePullRequestReason>;
}
export type ArchitecturePullRequestsLayerV1 = Section<{
  /** When the Dev Activity collector read the PRs from GitHub. */
  readonly observed_at: string;
  readonly pull_requests: readonly ArchitecturePullRequestImpactV1[];
  /** Which flow steps each PR reaches. */
  readonly flow_steps: Gap<typeof ARCHITECTURE_FLOW_STEP_REASON>;
}, ArchitecturePullRequestsReason>;

export interface ArchitectureMapLayersV1 {
  readonly changes: ArchitectureChangesLayerV1;
  readonly violations: ArchitectureViolationsLayerV1;
  readonly pull_requests: ArchitecturePullRequestsLayerV1;
  readonly tests: ArchitectureTestsLayerV1;
  readonly decisions: Gap<typeof ARCHITECTURE_DECISION_REASON>;
}

export interface ArchitectureMapV1 {
  readonly schema_version: typeof OPERATOR_ARCHITECTURE_MAP_SCHEMA;
  readonly repository_id: string;
  readonly commit: string;
  readonly collected_at: string;
  readonly nodes: readonly ArchitectureMapNodeV1[];
  readonly relations: readonly ArchitectureMapRelationV1[];
  readonly sizes: ArchitectureMapSizesV1;
  readonly dependencies: ArchitectureMapDependenciesV1;
  readonly layers: ArchitectureMapLayersV1;
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
// Model prose is free text; an absolute path in it never leaves the host.
const prose = (check: Check): Check => value => check(value) && isPublicDevActivityText(value as string);
const node = object({ id, kind: match(KIND), name: prose(nonEmpty), status: match(KIND), layer: nullable(match(LAYER)), parent: nullable(id), summary: prose(text) });
const relation = object({ id, kind: match(KIND), source: id, target: id, intent: prose(text) });
const size = object({ id, files: positive, lines: count });
const imports = object({ source: id, target: id, imports: positive });
const reason = (values: readonly string[]): Check => object({ state: one('unavailable'), reason: one(...values) });
const section = (fields: Record<string, Check>, reasons: readonly string[]): Check => value => object({ state: one('ok'), ...fields })(value) || reason(reasons)(value);
const commit = match(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const instant = match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u);
const ids = list(id);
/** A repository-relative path: no root, drive or `..` segment, and nothing the private-path guard masks. */
const repoPath: Check = value => text(value) && isPublicRepoPath(value as string);
const changes = section({
  since: instant, base: commit, commits: count, files: count, unowned_files: count,
  nodes: list(object({ id, files: positive, added: count, deleted: count })),
  model: section({ nodes_added: ids, nodes_removed: ids, nodes_changed: ids, relations_added: ids, relations_removed: ids, relations_changed: ids }, ARCHITECTURE_MODEL_DELTA_REASONS),
  flow_steps: reason([ARCHITECTURE_FLOW_STEP_REASON]),
}, ARCHITECTURE_CHANGE_REASONS);
const violations = object({
  debt: section({ items: list(object({ kind: one(...ARCHITECTURE_DEBT_KINDS), nodes: ids, paths: list(repoPath) })) }, ARCHITECTURE_VIOLATION_REASONS),
  flows: reason([ARCHITECTURE_FLOWS_REASON]),
  anchors: section({ citations: count, nodes: list(object({ id, findings: positive })) }, ARCHITECTURE_VIOLATION_REASONS),
  dependencies: section({ edges: list(imports) }, ARCHITECTURE_VIOLATION_REASONS),
  layer_direction: reason([ARCHITECTURE_LAYER_DIRECTION_REASON]),
});
const tests = section({
  run: object({ id: positive, head_sha: commit, created_at: instant }),
  results: one('ok', 'junit_missing', 'junit_invalid'),
  capabilities: list(object({ id, files: positive, passed: count, failed: count, skipped: count, no_result: count })),
}, ARCHITECTURE_TEST_REASONS);
const pullUrl = match(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9]\d*$/u);
const pullRequests = section({
  observed_at: instant,
  pull_requests: list(object({
    number: positive, title: prose(nonEmpty), url: pullUrl, head_sha: nullable(commit),
    impact: section({ files: count, unowned_files: count, nodes: list(object({ id, files: positive })) }, ARCHITECTURE_PR_REASONS),
  })),
  flow_steps: reason([ARCHITECTURE_FLOW_STEP_REASON]),
}, ARCHITECTURE_PR_LAYER_REASONS);
const map = object({
  schema_version: one(OPERATOR_ARCHITECTURE_MAP_SCHEMA),
  repository_id: match(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u),
  commit,
  collected_at: instant,
  nodes: list(node),
  relations: list(relation),
  sizes: section({ nodes: list(size) }, ARCHITECTURE_MAP_SIZE_REASONS),
  dependencies: section({ edges: list(imports) }, ARCHITECTURE_MAP_DEPENDENCY_REASONS),
  layers: object({ changes, violations, pull_requests: pullRequests, tests, decisions: reason([ARCHITECTURE_DECISION_REASON]) }),
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

/** Shape, identity and referential integrity. Every reference names a node of this map, except a removed model entity. */
export function decodeArchitectureMap(value: unknown): ArchitectureMapV1 {
  if (!map(value)) throw new Error('architecture_map_invalid');
  const result = value as ArchitectureMapV1;
  const nodes = new Map(result.nodes.map(entry => [entry.id, entry]));
  const relations = new Set(result.relations.map(entry => entry.id));
  const capability = (nodeId: string) => nodes.get(nodeId)?.kind === 'capability';
  // Each list names each node once, and only nodes of this map.
  const known = (entries: readonly string[], exists: (entry: string) => boolean = entry => nodes.has(entry)) => unique(entries) && entries.every(exists);
  const importEdges = (edges: readonly ArchitectureMapImportV1[]) => unique(edges.map(entry => `${entry.source}\0${entry.target}`))
    && edges.every(entry => entry.source !== entry.target && capability(entry.source) && capability(entry.target));
  const { changes, violations, pull_requests: pulls, tests } = result.layers;
  const delta = changes.state === 'ok' && changes.model.state === 'ok' ? changes.model : null;
  if (nodes.size !== result.nodes.length || relations.size !== result.relations.length
    || result.nodes.some(entry => entry.parent !== null && !nodes.has(entry.parent)) || result.nodes.some(entry => !reachesRoot(entry.id, nodes))
    || result.relations.some(entry => !nodes.has(entry.source) || !nodes.has(entry.target))
    || (result.sizes.state === 'ok' && !known(result.sizes.nodes.map(entry => entry.id)))
    || (result.dependencies.state === 'ok' && !importEdges(result.dependencies.edges))
    || (changes.state === 'ok' && (!known(changes.nodes.map(entry => entry.id)) || changes.unowned_files > changes.files))
    || (delta !== null && (!known([...delta.nodes_added, ...delta.nodes_changed]) || !known(delta.nodes_removed, entry => !nodes.has(entry))
      || !known([...delta.relations_added, ...delta.relations_changed], entry => relations.has(entry)) || !known(delta.relations_removed, entry => !relations.has(entry))))
    || (violations.debt.state === 'ok' && violations.debt.items.some(item => !known(item.nodes) || !unique(item.paths)))
    || (violations.anchors.state === 'ok' && !known(violations.anchors.nodes.map(entry => entry.id)))
    || (violations.dependencies.state === 'ok' && !importEdges(violations.dependencies.edges))
    || (pulls.state === 'ok' && (!unique(pulls.pull_requests.map(entry => String(entry.number))) || pulls.pull_requests.some(entry => entry.impact.state === 'ok'
      ? entry.head_sha === null || !known(entry.impact.nodes.map(item => item.id)) || entry.impact.unowned_files > entry.impact.files
      : (entry.head_sha === null) !== (entry.impact.reason === 'head_missing'))))
    || (tests.state === 'ok' && (!known(tests.capabilities.map(entry => entry.id), capability)
      || tests.capabilities.some(entry => entry.files !== entry.passed + entry.failed + entry.skipped + entry.no_result)))) {
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

export type ArchitectureChangesInput =
  | {
    readonly state: 'ok';
    readonly since: string;
    readonly base: string;
    readonly commits: number;
    /** Added and deleted lines of each changed path from `git diff --numstat`; 0 for a binary file. */
    readonly files: ReadonlyMap<string, { readonly added: number; readonly deleted: number }>;
    /** The deepest owning node of each changed path from `archctx resolve`; null when unowned or contested. */
    readonly owners: ReadonlyMap<string, string | null>;
    readonly model: Section<ArchitectureModelDeltaV1, ArchitectureModelDeltaReason>;
  }
  | Gap<ArchitectureChangeReason>;

/** One open PR as the Dev Activity cache holds it; the title is masked like model prose. */
export interface ArchitecturePullRequestSourceV1 {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly head_sha: string | null;
  readonly changed_files: DevActivityPrFiles;
}

/** The open PRs of one repository from the Dev Activity cache; the collector hands it to the map child. */
export type ArchitecturePullRequestsSource =
  | { readonly state: 'ok'; readonly observed_at: string; readonly pull_requests: readonly ArchitecturePullRequestSourceV1[] }
  | Gap<'dev_activity_pending' | 'dev_activity_unavailable'>;

export type ArchitecturePullRequestsInput =
  | (Extract<ArchitecturePullRequestsSource, { state: 'ok' }> & {
    /** The deepest owning node of each changed path from `archctx resolve`; null when unowned or contested. */
    readonly owners: ReadonlyMap<string, string | null>;
  })
  | Gap<ArchitecturePullRequestsReason>;

/**
 * The open PRs of one repository as the board shows them: the user's own PRs
 * (`--author @me`), one per work branch, so a PR from the default branch or a
 * second open PR on one branch is not listed. A repository whose GitHub read is
 * not `ok` has no PR list the map can call complete.
 */
export function architecturePullRequestsSource(snapshot: DevActivitySnapshotV2, repositoryId: string): ArchitecturePullRequestsSource {
  if (snapshot.collected_at === null) return { state: 'unavailable', reason: 'dev_activity_pending' };
  const github = snapshot.repositories.find(entry => entry.repository_id === repositoryId)?.sources.find(source => source.kind === 'github');
  if (github?.status !== 'ok' || github.observed_at === null) return { state: 'unavailable', reason: 'dev_activity_unavailable' };
  const pullRequests = snapshot.items.flatMap(item => (item.repository_id === repositoryId && item.pull_request?.state === 'open' && item.pull_request.changed_files !== null
    ? [{ ...item.pull_request, changed_files: item.pull_request.changed_files }] : []));
  return {
    state: 'ok',
    observed_at: github.observed_at,
    pull_requests: pullRequests.sort((a, b) => a.number - b.number).map(pr => ({
      number: pr.number, title: publicDevActivityText(pr.title), url: pr.url, head_sha: pr.head_sha, changed_files: pr.changed_files,
    })),
  };
}

const pullRequestsSource = section({
  observed_at: instant,
  pull_requests: list(object({
    number: positive, title: prose(nonEmpty), url: pullUrl, head_sha: nullable(commit),
    changed_files: section({ paths: list(repoPath) }, DEV_ACTIVITY_PR_FILES_REASONS),
  })),
}, ['dev_activity_pending', 'dev_activity_unavailable']);

/** The map child reads the source from a file the collector wrote; the same shape check applies. */
export function decodeArchitecturePullRequestsSource(value: unknown): ArchitecturePullRequestsSource {
  if (!pullRequestsSource(value)) throw new Error('architecture_pull_requests_invalid');
  return value as ArchitecturePullRequestsSource;
}

export interface ArchitectureMapLayersInput {
  readonly changes: ArchitectureChangesInput;
  readonly pull_requests: ArchitecturePullRequestsInput;
  /** The violation checks the collector runs; the projection adds the parts that have no source. */
  readonly violations: Pick<ArchitectureViolationsLayerV1, 'debt' | 'anchors' | 'dependencies'>;
  readonly tests: ArchitectureTestsLayerV1;
}

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
const byId = <T extends { readonly id: string }>(entries: readonly T[]): T[] => [...entries].sort((a, b) => compare(a.id, b.id));
const byEdge = <T extends { readonly source: string; readonly target: string }>(entries: readonly T[]): T[] =>
  [...entries].sort((a, b) => compare(a.source, b.source) || compare(a.target, b.target));

/**
 * Adds each owned path's counts to its owner and every ancestor on the model's
 * `parent` chain, so a capability shows the counts of its components. An owner
 * the model does not name returns null: the model and the ownership answer then
 * come from different model revisions.
 */
function rollUp<Counts extends Record<string, number>>(
  parents: ReadonlyMap<string, string | null>,
  entries: Iterable<readonly [string | null, Counts]>,
): Map<string, Counts> | null {
  const totals = new Map<string, Counts>();
  for (const [owner, counts] of entries) {
    if (owner === null) continue;
    if (!parents.has(owner)) return null;
    // The decoder refuses parent cycles later; this walk must still end on one.
    const seen = new Set<string>();
    for (let cursor: string | null = owner; cursor !== null && !seen.has(cursor); cursor = parents.get(cursor) ?? null) {
      seen.add(cursor);
      const total = totals.get(cursor);
      totals.set(cursor, Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, (total?.[key] ?? 0) + value])) as Counts);
    }
  }
  return totals;
}

function projectChanges(parents: ReadonlyMap<string, string | null>, input: ArchitectureChangesInput): ArchitectureChangesLayerV1 {
  if (input.state === 'unavailable') return input;
  const owner = (path: string) => input.owners.get(path) ?? null;
  const totals = rollUp(parents, [...input.files].map(([path, lines]) => [owner(path), { files: 1, ...lines }] as const));
  if (totals === null) return { state: 'unavailable', reason: 'ownership_unavailable' };
  return {
    state: 'ok', since: input.since, base: input.base, commits: input.commits, files: input.files.size,
    unowned_files: [...input.files.keys()].filter(path => owner(path) === null).length,
    nodes: byId([...totals].map(([id, total]) => ({ id, ...total }))),
    model: input.model,
    flow_steps: { state: 'unavailable', reason: ARCHITECTURE_FLOW_STEP_REASON },
  };
}

/** Each open PR's changed files per node. An owner the model does not name drops the layer to `ownership_unavailable`. */
function projectPullRequests(parents: ReadonlyMap<string, string | null>, input: ArchitecturePullRequestsInput): ArchitecturePullRequestsLayerV1 {
  if (input.state === 'unavailable') return input;
  const owner = (path: string) => input.owners.get(path) ?? null;
  const pullRequests: ArchitecturePullRequestImpactV1[] = [];
  for (const pr of input.pull_requests) {
    const { changed_files: files } = pr;
    let impact: ArchitecturePullRequestImpactV1['impact'];
    if (pr.head_sha === null) impact = { state: 'unavailable', reason: 'head_missing' };
    else if (files.state === 'unavailable') impact = files;
    else {
      const totals = rollUp(parents, files.paths.map(path => [owner(path), { files: 1 }] as const));
      if (totals === null) return { state: 'unavailable', reason: 'ownership_unavailable' };
      impact = {
        state: 'ok', files: files.paths.length, unowned_files: files.paths.filter(path => owner(path) === null).length,
        nodes: byId([...totals].map(([id, total]) => ({ id, ...total }))),
      };
    }
    pullRequests.push({ number: pr.number, title: pr.title, url: pr.url, head_sha: pr.head_sha, impact });
  }
  return { state: 'ok', observed_at: input.observed_at, pull_requests: pullRequests, flow_steps: { state: 'unavailable', reason: ARCHITECTURE_FLOW_STEP_REASON } };
}

/**
 * Model entities added, removed or changed between two committed models, by id.
 * Each entity compares as a whole, so a changed field of any kind counts.
 */
export function architectureModelDelta(
  base: { readonly nodes: readonly unknown[]; readonly relations: readonly unknown[] },
  head: { readonly nodes: readonly unknown[]; readonly relations: readonly unknown[] },
): ArchitectureModelDeltaV1 {
  const entities = (values: readonly unknown[]) => new Map(values.map(value => {
    const entity = value as { readonly id?: unknown } | null;
    if (typeof entity?.id !== 'string') throw new Error('architecture_map_invalid');
    return [entity.id, JSON.stringify(entity)] as const;
  }));
  const diff = (before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>) => ({
    added: [...after.keys()].filter(key => !before.has(key)).sort(compare),
    removed: [...before.keys()].filter(key => !after.has(key)).sort(compare),
    changed: [...after.keys()].filter(key => before.has(key) && before.get(key) !== after.get(key)).sort(compare),
  });
  const nodes = diff(entities(base.nodes), entities(head.nodes));
  const relations = diff(entities(base.relations), entities(head.relations));
  return {
    nodes_added: nodes.added, nodes_removed: nodes.removed, nodes_changed: nodes.changed,
    relations_added: relations.added, relations_removed: relations.removed, relations_changed: relations.changed,
  };
}

/** The tests collector's cache for one repository, as `tests-collector.ts` holds it. */
export type ArchitectureTestsSource =
  | { readonly state: 'ready'; readonly snapshot: TestsSnapshotV1 }
  | { readonly state: 'unavailable'; readonly reason: TestsUnavailableReason };

/**
 * Test files per capability from the daily run's projection, by result. A file
 * counts once for each capability it reaches, by import or by the capability's
 * declared verification. Without a JUnit report every file is `no_result`.
 */
export function projectTestCoverage(nodes: readonly ArchitectureMapNodeV1[], source: ArchitectureTestsSource): ArchitectureTestsLayerV1 {
  if (source.state === 'unavailable') return source;
  const { run, projection, results } = source.snapshot;
  if (projection.state === 'unavailable') return projection;
  const capabilities = new Set(nodes.filter(node => node.kind === 'capability').map(node => node.id));
  if (projection.files.some(file => file.capabilities.some(link => !capabilities.has(link.id)))) return { state: 'unavailable', reason: 'tests_model_mismatch' };
  const outcome = new Map(results.state === 'ok' ? results.files.map(file => [file.file,
    file.cases.some(entry => entry.result === 'failed') ? 'failed' as const
      : file.cases.some(entry => entry.result === 'passed') ? 'passed' as const
        : file.cases.length > 0 ? 'skipped' as const : 'no_result' as const]) : []);
  const totals = new Map<string, ArchitectureTestCoverageV1>();
  for (const file of projection.files) {
    const result = outcome.get(file.file) ?? 'no_result';
    for (const link of file.capabilities) {
      const total = totals.get(link.id) ?? { id: link.id, files: 0, passed: 0, failed: 0, skipped: 0, no_result: 0 };
      totals.set(link.id, { ...total, files: total.files + 1, [result]: total[result] + 1 });
    }
  }
  return {
    state: 'ok',
    run: { id: run.id, head_sha: run.head_sha, created_at: run.created_at },
    results: results.state === 'ok' ? 'ok' : results.reason,
    capabilities: byId([...totals.values()]),
  };
}

/** The map with the tests layer read from the tests collector's cache. */
export function withTestCoverage(map: ArchitectureMapV1, source: ArchitectureTestsSource): ArchitectureMapV1 {
  return decodeArchitectureMap({ ...map, layers: { ...map.layers, tests: projectTestCoverage(map.nodes, source) } });
}

/**
 * Builds the map. Line counts and today's changes sum along the `parent` chain.
 * An owner of a line count that the model does not name fails the projection;
 * the same mismatch in today's changes drops that layer to `ownership_unavailable`.
 */
export function projectArchitectureMap(input: {
  readonly repository_id: string;
  readonly commit: string;
  readonly collected_at: string;
  readonly nodes: readonly ArchitectureMapNodeV1[];
  readonly relations: readonly ArchitectureMapRelationV1[];
  readonly sizes: ArchitectureMapSizeInput;
  readonly dependencies: ArchitectureMapDependencyInput;
  readonly layers: ArchitectureMapLayersInput;
}): ArchitectureMapV1 {
  const parents = new Map(input.nodes.map(entry => [entry.id, entry.parent]));
  let sizes: ArchitectureMapSizesV1 = input.sizes.state === 'ok' ? { state: 'ok', nodes: [] } : input.sizes;
  if (input.sizes.state === 'ok') {
    const { owners } = input.sizes;
    const totals = rollUp(parents, [...input.sizes.lines].map(([path, lines]) => [owners.get(path) ?? null, { files: 1, lines }] as const));
    if (totals === null) throw new Error('architecture_map_invalid');
    sizes = { state: 'ok', nodes: byId([...totals].map(([id, total]) => ({ id, ...total }))) };
  }
  const dependencies: ArchitectureMapDependenciesV1 = input.dependencies.state === 'ok'
    ? {
      state: 'ok',
      edges: byEdge(input.dependencies.matrix.filter(entry => entry.from !== entry.to && entry.imports > 0)
        .map(entry => ({ source: entry.from, target: entry.to, imports: entry.imports }))),
    }
    : input.dependencies;
  const { violations } = input.layers;
  return decodeArchitectureMap({
    schema_version: OPERATOR_ARCHITECTURE_MAP_SCHEMA,
    repository_id: input.repository_id,
    commit: input.commit,
    collected_at: input.collected_at,
    nodes: byId(input.nodes),
    relations: byId(input.relations),
    sizes,
    dependencies,
    layers: {
      changes: projectChanges(parents, input.layers.changes),
      violations: {
        debt: violations.debt,
        flows: { state: 'unavailable', reason: ARCHITECTURE_FLOWS_REASON },
        anchors: violations.anchors.state === 'ok' ? { ...violations.anchors, nodes: byId(violations.anchors.nodes) } : violations.anchors,
        dependencies: violations.dependencies.state === 'ok' ? { state: 'ok', edges: byEdge(violations.dependencies.edges) } : violations.dependencies,
        layer_direction: { state: 'unavailable', reason: ARCHITECTURE_LAYER_DIRECTION_REASON },
      },
      pull_requests: projectPullRequests(parents, input.layers.pull_requests),
      tests: input.layers.tests,
      decisions: { state: 'unavailable', reason: ARCHITECTURE_DECISION_REASON },
    },
  });
}

