// Public contract of the architecture base map and its layers (PRD G11, G22).
// The map collector reads the committed model and its decisions with `archctx
// export native`, the tracked text files of that commit with their line counts,
// their owners with `archctx resolve`, and the capability import counts with
// `archctx deps`. The layers come from the same cycle: `archctx impact` from the
// last commit before local midnight to the map commit, `archctx debt`, `docs
// anchors` and `flows check --no-sync`, `archctx impact --paths-from` for each
// open PR's changed files from the Dev Activity cache, and the tests collector's
// cache. archctx owns ownership, impact, dependency, flow, decision and anchor
// facts; this module only sums line counts along the model's `parent` chain and
// checks the shape. The strict decoder serves the server before it sends and the
// browser before it renders.

import type { RefImpactV1 } from 'archctx-contracts';
import { PULL_REQUEST_FILES_REASONS, type PullRequestFiles } from './pull-request-files';
import { isPublicDevActivityText, isPublicRepoPath } from './public-text';
import { TESTS_UNAVAILABLE_REASONS, type TestsSnapshotV1, type TestsUnavailableReason } from './tests';

export const OPERATOR_ARCHITECTURE_MAP_SCHEMA = 'repo-harness.architecture-map.v3' as const;
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

/**
 * Changed paths, owners, dependents and the model delta read only commits and
 * need no clean checkout. `flow_steps` uses the worktree CodeGraph index;
 * archctx reports unknown when its facts are missing or do not match the commit.
 * A first-parent history that starts after midnight has no base commit;
 * `archctx_failed`: archctx did not run, or its answer broke its contract or the map's grammar;
 * `path_not_public`: archctx's answer is valid, but a path in it fails the public-path guard.
 */
export const ARCHITECTURE_CHANGE_REASONS = ['git_read_failed', 'history_starts_today', 'archctx_failed', 'path_not_public'] as const;
export type ArchitectureChangeReason = typeof ARCHITECTURE_CHANGE_REASONS[number];
/** Each violation check reads the worktree model and the CodeGraph index, as import counts do. */
export const ARCHITECTURE_VIOLATION_REASONS = [...ARCHITECTURE_MAP_DEPENDENCY_REASONS, 'archctx_failed'] as const;
export type ArchitectureViolationReason = typeof ARCHITECTURE_VIOLATION_REASONS[number];
/** The tests collector's own reasons, a projection gap, or a projection that names a capability the map does not have. */
export const ARCHITECTURE_TEST_REASONS = [...TESTS_UNAVAILABLE_REASONS, 'projection_missing', 'projection_invalid', 'tests_model_mismatch'] as const;
export type ArchitectureTestReason = typeof ARCHITECTURE_TEST_REASONS[number];
/**
 * The Dev Activity cache has not collected yet, or has no complete GitHub read
 * for the repository. `archctx impact --paths-from` reads the worktree model,
 * so the model must be clean at the map commit.
 */
export const ARCHITECTURE_PR_LAYER_REASONS = ['model_worktree_dirty', 'checkout_changed', 'git_read_failed', 'dev_activity_pending', 'dev_activity_unavailable'] as const;
export type ArchitecturePullRequestsReason = typeof ARCHITECTURE_PR_LAYER_REASONS[number];
/** One open PR without impact: gh gave no head commit or no complete file list, archctx failed, or a path in its valid answer fails the public-path guard. */
export const ARCHITECTURE_PR_REASONS = ['head_missing', ...PULL_REQUEST_FILES_REASONS, 'archctx_failed', 'path_not_public'] as const;
export type ArchitecturePullRequestReason = typeof ARCHITECTURE_PR_REASONS[number];
/**
 * Why imports against the layer order are not shown: the model declares no
 * ordered `model.layers`, or it does and the collector does not read the
 * layer-direction constraint check.
 */
export const ARCHITECTURE_LAYER_DIRECTION_REASONS = ['model_layers_undeclared', 'layer_direction_not_read'] as const;
export type ArchitectureLayerDirectionReason = typeof ARCHITECTURE_LAYER_DIRECTION_REASONS[number];
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

/**
 * An archctx error envelope. archctx owns its error and reason codes; the map
 * carries them as opaque tokens and checks only their shape.
 */
export interface ArchctxRefusalV1 {
  readonly state: 'unavailable';
  readonly reason: 'archctx_error';
  /** The archctx error code, for example `AC_SCHEMA_INVALID`. */
  readonly code: string;
  /** The archctx reason code, a kebab-case token; null when archctx gives none. */
  readonly reason_code: string | null;
}
const ARCHCTX_CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/u;
const ARCHCTX_TOKEN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/** The refusal of an archctx error envelope; null when its codes do not have the archctx shape. */
export function archctxRefusal(code: unknown, reasonCode: unknown): ArchctxRefusalV1 | null {
  if (typeof code !== 'string' || !ARCHCTX_CODE.test(code)) return null;
  if (reasonCode !== undefined && reasonCode !== null && (typeof reasonCode !== 'string' || !ARCHCTX_TOKEN.test(reasonCode))) return null;
  return { state: 'unavailable', reason: 'archctx_error', code, reason_code: reasonCode ?? null };
}

/** One changed path from `archctx impact`. Its reason codes say why a line count is null or an owner is contested. */
export interface ArchitectureImpactPathV1 {
  readonly path: string;
  readonly added: number | null;
  readonly deleted: number | null;
  /** The owning nodes at the base and the head; more than one when the owner moved or is contested, none when unowned. */
  readonly owners: readonly string[];
  readonly reason_codes: readonly string[];
}
/** A flow step that the change reaches, with archctx's reason codes for it. */
export interface ArchitectureFlowStepV1 { readonly flow: string; readonly step: string; readonly outcome: string | null; readonly reason_codes: readonly string[] }
/** Parts of the answer that archctx cut at its own limits; a cut part is a lower bound. */
export interface ArchitectureImpactTruncationV1 {
  readonly paths: boolean;
  readonly nodes: boolean;
  readonly relations: boolean;
  readonly flow_steps: boolean;
  readonly dependents: boolean;
  readonly model: boolean;
}
/** One `archctx impact` answer as the map carries it. */
export interface ArchitectureImpactV1 {
  readonly paths: readonly ArchitectureImpactPathV1[];
  readonly unowned_paths: readonly string[];
  /** Each owner of a changed path and its changed path count. */
  readonly nodes: readonly { readonly id: string; readonly files: number }[];
  /** Nodes that reach a changed node through `calls` or `depends-on` relations of the head model, with the relations of one shortest path. */
  readonly dependents: readonly { readonly id: string; readonly touched: string; readonly relations: readonly string[] }[];
  readonly dependency_coverage: 'complete' | 'partial';
  /** `unknown` with archctx's reason codes when its code facts cannot tie a flow step to the change. */
  readonly flow_steps: { readonly status: 'known' | 'unknown'; readonly reason_codes: readonly string[]; readonly items: readonly ArchitectureFlowStepV1[] | null };
  readonly truncated: ArchitectureImpactTruncationV1;
}
/** One model entity whose committed record differs between the base and the map commit, with the fields that differ. */
export interface ArchitectureModelChangeV1 {
  readonly kind: 'nodes' | 'relations' | 'flows';
  readonly id: string;
  readonly change: 'added' | 'removed' | 'changed';
  readonly fields: readonly string[];
}
export type ArchitectureChangesLayerV1 = Section<{
  /** Local midnight of the collector host, as an instant. */
  readonly since: string;
  /** The newest first-parent commit before `since`; archctx compares it with the map commit. */
  readonly base: string;
  readonly commits: number;
  readonly model: readonly ArchitectureModelChangeV1[];
} & ArchitectureImpactV1, ArchitectureChangeReason> | ArchctxRefusalV1;

/** The map's form of an `archctx impact` answer. Field names change; no value is derived. */
export function architectureImpact(report: RefImpactV1): ArchitectureImpactV1 {
  const { touchedFlowSteps: steps, truncated } = report;
  return {
    paths: report.changedPaths.map(entry => ({ path: entry.path, added: entry.added, deleted: entry.deleted, owners: entry.owners, reason_codes: entry.reasonCodes })),
    unowned_paths: report.unownedPaths,
    nodes: report.touchedNodes.map(entry => ({ id: entry.nodeId, files: entry.pathCount })),
    dependents: report.dependents.map(entry => ({ id: entry.nodeId, touched: entry.touchedNodeId, relations: entry.relationIds })),
    dependency_coverage: report.dependencyCoverage.status,
    flow_steps: {
      status: steps.status, reason_codes: steps.reasonCodes,
      items: steps.items === null ? null : steps.items.map(item => ({ flow: item.flowId, step: item.stepId, outcome: item.outcomeId, reason_codes: item.reasonCodes })),
    },
    truncated: {
      paths: truncated.changedPaths, nodes: truncated.touchedNodes, relations: truncated.relations,
      flow_steps: truncated.flowSteps, dependents: truncated.dependents, model: truncated.modelDelta,
    },
  };
}

export interface ArchitectureDebtItemV1 { readonly kind: ArchitectureDebtKind; readonly nodes: readonly string[]; readonly paths: readonly string[] }
/** `archctx flows check --no-sync`: selector proof counts, and the capabilities whose P2 flow proof archctx calls unprovable. */
export interface ArchitectureFlowProofsV1 {
  readonly selectors: number;
  readonly proven: number;
  readonly unproven: number;
  /** Unproven selectors that a required-flow step names. */
  readonly used_unproven: number;
  readonly unprovable: readonly { readonly id: string; readonly diagnostics: number }[];
}
export interface ArchitectureViolationsLayerV1 {
  /** `archctx debt`: unowned and contested paths, stale model anchors. */
  readonly debt: Section<{ readonly items: readonly ArchitectureDebtItemV1[] }, ArchitectureViolationReason>;
  /** Flow proofs from the existing CodeGraph index; the check writes no index. */
  readonly flows: Section<ArchitectureFlowProofsV1, ArchitectureViolationReason> | ArchctxRefusalV1;
  /** `archctx docs anchors`: citations in human-written module docs that no longer match the code. */
  readonly anchors: Section<{ readonly citations: number; readonly nodes: readonly { readonly id: string; readonly findings: number }[] }, ArchitectureViolationReason>;
  /** `archctx deps` rows that archctx marks undeclared: imports with no model relation behind them. */
  readonly dependencies: Section<{ readonly edges: readonly ArchitectureMapImportV1[] }, ArchitectureViolationReason>;
  /** Imports against the layer order. */
  readonly layer_direction: Gap<ArchitectureLayerDirectionReason>;
}

/** One architecture decision record from `archctx export native`; free text is masked like model prose. */
export interface ArchitectureDecisionV1 {
  readonly id: string;
  readonly title: string;
  readonly status: string | null;
  readonly decided_at: string | null;
  /** Model nodes the decision applies to; archctx refuses an export that names an unknown node. */
  readonly applies_to: readonly string[];
  readonly supersedes: readonly string[];
  readonly path: string;
}
/** The decisions come from the same export as the model, so they have no gap of their own. */
export interface ArchitectureDecisionsLayerV1 { readonly state: 'ok'; readonly items: readonly ArchitectureDecisionV1[] }

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

/**
 * The `archctx impact --paths-from` answer for one open PR's changed files at
 * its head, with owners from the map commit's model. A path list has no line
 * counts and no model change.
 */
export interface ArchitecturePullRequestImpactV1 {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  /** The head commit gh reported; the files are the PR's diff at this head. */
  readonly head_sha: string | null;
  readonly impact: Section<ArchitectureImpactV1, ArchitecturePullRequestReason> | ArchctxRefusalV1;
}
export type ArchitecturePullRequestsLayerV1 = Section<{
  /** When the Dev Activity collector read the PRs from GitHub. */
  readonly observed_at: string;
  readonly pull_requests: readonly ArchitecturePullRequestImpactV1[];
}, ArchitecturePullRequestsReason>;

export interface ArchitectureMapLayersV1 {
  readonly changes: ArchitectureChangesLayerV1;
  readonly violations: ArchitectureViolationsLayerV1;
  readonly pull_requests: ArchitecturePullRequestsLayerV1;
  readonly tests: ArchitectureTestsLayerV1;
  readonly decisions: ArchitectureDecisionsLayerV1;
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
const refusal: Check = value => object({ state: one('unavailable'), reason: one('archctx_error'), code: match(ARCHCTX_CODE), reason_code: nullable(match(ARCHCTX_TOKEN)) })(value);
const commit = match(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const instant = match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u);
const ids = list(id);
/** A repository-relative path: no root, drive or `..` segment, and nothing the private-path guard masks. */
const repoPath: Check = value => text(value) && isPublicRepoPath(value as string);
const either = (...checks: Check[]): Check => value => checks.some(check => check(value));
// archctx reason codes are opaque kebab-case tokens; the map checks their shape, not a copy of archctx's list.
const tokens = list(match(ARCHCTX_TOKEN));
/** The flow schema's step and outcome id grammar. */
const localId = match(/^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/u);
const flag = one(true, false);
const impactFields = (path: Check) => ({
  paths: list(object({ path, added: nullable(count), deleted: nullable(count), owners: ids, reason_codes: tokens })),
  unowned_paths: list(path),
  nodes: list(object({ id, files: positive })),
  dependents: list(object({ id, touched: id, relations: ids })),
  dependency_coverage: one('complete', 'partial'),
  flow_steps: object({
    status: one('known', 'unknown'), reason_codes: tokens,
    items: nullable(list(object({ flow: id, step: localId, outcome: nullable(localId), reason_codes: tokens }))),
  }),
  truncated: object({ paths: flag, nodes: flag, relations: flag, flow_steps: flag, dependents: flag, model: flag }),
});
const modelChange = object({
  kind: one('nodes', 'relations', 'flows'), id, change: one('added', 'removed', 'changed'), fields: list(match(/^[A-Za-z][A-Za-z0-9_-]{0,127}$/u)),
});
/** `path` checks every changed path; the decoder uses `repoPath`, and a projection uses `text` to tell a path-guard refusal from a broken answer. */
const changesWith = (path: Check): Check => either(section({ since: instant, base: commit, commits: count, model: list(modelChange), ...impactFields(path) }, ARCHITECTURE_CHANGE_REASONS), refusal);
const pullRequestImpactWith = (path: Check): Check => either(section(impactFields(path), ARCHITECTURE_PR_REASONS), refusal);
const changes = changesWith(repoPath);
const pullRequestImpact = pullRequestImpactWith(repoPath);
const violations = object({
  debt: section({ items: list(object({ kind: one(...ARCHITECTURE_DEBT_KINDS), nodes: ids, paths: list(repoPath) })) }, ARCHITECTURE_VIOLATION_REASONS),
  flows: either(section({
    selectors: count, proven: count, unproven: count, used_unproven: count, unprovable: list(object({ id, diagnostics: count })),
  }, ARCHITECTURE_VIOLATION_REASONS), refusal),
  anchors: section({ citations: count, nodes: list(object({ id, findings: positive })) }, ARCHITECTURE_VIOLATION_REASONS),
  dependencies: section({ edges: list(imports) }, ARCHITECTURE_VIOLATION_REASONS),
  layer_direction: reason(ARCHITECTURE_LAYER_DIRECTION_REASONS),
});
const singleLine = prose(match(/^[^\r\n]{1,4096}$/u));
const decisions = object({
  state: one('ok'),
  items: list(object({
    id: singleLine, title: singleLine, status: nullable(singleLine), decided_at: nullable(singleLine),
    applies_to: ids, supersedes: list(singleLine), path: repoPath,
  })),
});
const tests = section({
  run: object({ id: positive, head_sha: commit, created_at: instant }),
  results: one('ok', 'junit_missing', 'junit_invalid'),
  capabilities: list(object({ id, files: positive, passed: count, failed: count, skipped: count, no_result: count })),
}, ARCHITECTURE_TEST_REASONS);
const pullUrl = match(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9]\d*$/u);
const pullRequests = section({
  observed_at: instant,
  pull_requests: list(object({ number: positive, title: prose(nonEmpty), url: pullUrl, head_sha: nullable(commit), impact: pullRequestImpact })),
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
  layers: object({ changes, violations, pull_requests: pullRequests, tests, decisions }),
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

interface MapIndex { readonly nodes: ReadonlySet<string>; readonly relations: ReadonlySet<string> }

/**
 * archctx's own consistency, and every id it names is a node or relation of the
 * map. `owner` also admits a node that today's changes removed: a deleted path
 * keeps its base owner.
 */
function impactValid(impact: ArchitectureImpactV1, index: MapIndex, owner: (id: string) => boolean): boolean {
  const unowned = impact.paths.filter(entry => entry.owners.length === 0).map(entry => entry.path);
  const { flow_steps: steps } = impact;
  return unique(impact.paths.map(entry => entry.path)) && impact.paths.every(entry => unique(entry.owners) && entry.owners.every(owner))
    && unowned.length === impact.unowned_paths.length && unowned.every((path, position) => path === impact.unowned_paths[position])
    && unique(impact.nodes.map(entry => entry.id)) && impact.nodes.every(entry => owner(entry.id))
    && impact.dependents.every(entry => index.nodes.has(entry.id) && owner(entry.touched) && entry.relations.length > 0 && entry.relations.every(relation => index.relations.has(relation)))
    && (steps.status === 'known' ? steps.reason_codes.length === 0 && steps.items !== null : steps.reason_codes.length > 0);
}

/** Today's changes: an added or changed node or relation is in the map, a removed one is not. Flows are not on the map. */
function changesValid(value: unknown, index: MapIndex, path: Check = repoPath): boolean {
  if (!(path === repoPath ? changes : changesWith(path))(value)) return false;
  const layer = value as ArchitectureChangesLayerV1;
  if (layer.state !== 'ok') return true;
  const removed = new Set(layer.model.filter(entry => entry.kind === 'nodes' && entry.change === 'removed').map(entry => entry.id));
  const present = (kind: 'nodes' | 'relations', has: ReadonlySet<string>) => layer.model.filter(entry => entry.kind === kind).every(entry => (entry.change === 'removed') !== has.has(entry.id));
  return unique(layer.model.map(entry => `${entry.kind}\0${entry.id}`)) && present('nodes', index.nodes) && present('relations', index.relations)
    && impactValid(layer, index, nodeId => index.nodes.has(nodeId) || removed.has(nodeId));
}

/** One PR's impact names only nodes of the map commit's model. */
function pullRequestImpactValid(value: unknown, index: MapIndex, path: Check = repoPath): boolean {
  if (!(path === repoPath ? pullRequestImpact : pullRequestImpactWith(path))(value)) return false;
  const impact = value as ArchitecturePullRequestImpactV1['impact'];
  return impact.state !== 'ok' || impactValid(impact, index, nodeId => index.nodes.has(nodeId));
}

/** Shape, identity and referential integrity. Every reference names a node of this map, except a removed model entity. */
export function decodeArchitectureMap(value: unknown): ArchitectureMapV1 {
  if (!map(value)) throw new Error('architecture_map_invalid');
  const result = value as ArchitectureMapV1;
  const nodes = new Map(result.nodes.map(entry => [entry.id, entry]));
  const relations = new Set(result.relations.map(entry => entry.id));
  const index: MapIndex = { nodes: new Set(nodes.keys()), relations };
  const capability = (nodeId: string) => nodes.get(nodeId)?.kind === 'capability';
  // Each list names each node once, and only nodes of this map.
  const known = (entries: readonly string[], exists: (entry: string) => boolean = entry => nodes.has(entry)) => unique(entries) && entries.every(exists);
  const importEdges = (edges: readonly ArchitectureMapImportV1[]) => unique(edges.map(entry => `${entry.source}\0${entry.target}`))
    && edges.every(entry => entry.source !== entry.target && capability(entry.source) && capability(entry.target));
  const { violations, pull_requests: pulls, tests, decisions: decided } = result.layers;
  if (nodes.size !== result.nodes.length || relations.size !== result.relations.length
    || result.nodes.some(entry => entry.parent !== null && !nodes.has(entry.parent)) || result.nodes.some(entry => !reachesRoot(entry.id, nodes))
    || result.relations.some(entry => !nodes.has(entry.source) || !nodes.has(entry.target))
    || (result.sizes.state === 'ok' && !known(result.sizes.nodes.map(entry => entry.id)))
    || (result.dependencies.state === 'ok' && !importEdges(result.dependencies.edges))
    || !changesValid(result.layers.changes, index)
    || (violations.debt.state === 'ok' && violations.debt.items.some(item => !known(item.nodes) || !unique(item.paths)))
    || (violations.flows.state === 'ok' && !known(violations.flows.unprovable.map(entry => entry.id), capability))
    || (violations.anchors.state === 'ok' && !known(violations.anchors.nodes.map(entry => entry.id)))
    || (violations.dependencies.state === 'ok' && !importEdges(violations.dependencies.edges))
    || (pulls.state === 'ok' && (!unique(pulls.pull_requests.map(entry => String(entry.number))) || pulls.pull_requests.some(entry => !pullRequestImpactValid(entry.impact, index)
      || (entry.impact.state === 'ok' ? entry.head_sha === null : (entry.head_sha === null) !== (entry.impact.reason === 'head_missing')))))
    || (tests.state === 'ok' && (!known(tests.capabilities.map(entry => entry.id), capability)
      || tests.capabilities.some(entry => entry.files !== entry.passed + entry.failed + entry.skipped + entry.no_result)))
    || !unique(decided.items.map(entry => entry.id)) || decided.items.some(entry => !known(entry.applies_to))) {
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

/** One open PR as the Dev Activity cache holds it; the title is masked like model prose. */
export interface ArchitecturePullRequestSourceV1 {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly head_sha: string | null;
  readonly changed_files: PullRequestFiles;
}

/** The open PRs of one repository from the Dev Activity cache; the collector hands it to the map child. */
export type ArchitecturePullRequestsSource =
  | { readonly state: 'ok'; readonly observed_at: string; readonly pull_requests: readonly ArchitecturePullRequestSourceV1[] }
  | Gap<'dev_activity_pending' | 'dev_activity_unavailable'>;

const pullRequestsSource = section({
  observed_at: instant,
  pull_requests: list(object({
    number: positive, title: prose(nonEmpty), url: pullUrl, head_sha: nullable(commit),
    changed_files: section({ paths: list(repoPath) }, PULL_REQUEST_FILES_REASONS),
  })),
}, ['dev_activity_pending', 'dev_activity_unavailable']);

/** The map child reads the source from a file the collector wrote; the same shape check applies. */
export function decodeArchitecturePullRequestsSource(value: unknown): ArchitecturePullRequestsSource {
  if (!pullRequestsSource(value)) throw new Error('architecture_pull_requests_invalid');
  return value as ArchitecturePullRequestsSource;
}

export interface ArchitectureMapLayersInput {
  readonly changes: ArchitectureChangesLayerV1;
  readonly pull_requests: ArchitecturePullRequestsLayerV1;
  readonly violations: ArchitectureViolationsLayerV1;
  readonly tests: ArchitectureTestsLayerV1;
  readonly decisions: ArchitectureDecisionsLayerV1;
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

const ARCHCTX_FAILED = { state: 'unavailable', reason: 'archctx_failed' } as const;
const PATH_NOT_PUBLIC = { state: 'unavailable', reason: 'path_not_public' } as const;

/**
 * The reason an impact answer cannot be shown: valid except for a path that the
 * public-path guard refuses is `path_not_public`; any other break is `archctx_failed`.
 */
function impactGap(valid: (path: Check) => boolean): typeof ARCHCTX_FAILED | typeof PATH_NOT_PUBLIC {
  return valid(text) ? PATH_NOT_PUBLIC : ARCHCTX_FAILED;
}

/** Each open PR keeps its impact only when it names nodes of the map; any other impact drops that PR to `archctx_failed`, or to `path_not_public` when only a path is refused. */
function projectPullRequests(layer: ArchitecturePullRequestsLayerV1, index: MapIndex): ArchitecturePullRequestsLayerV1 {
  if (layer.state === 'unavailable') return layer;
  return {
    ...layer,
    pull_requests: layer.pull_requests.map(pr => (pullRequestImpactValid(pr.impact, index) ? pr : { ...pr, impact: impactGap(path => pullRequestImpactValid(pr.impact, index, path)) })),
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
 * Builds the map. Line counts sum along the `parent` chain; an owner of a line
 * count that the model does not name fails the projection. An impact answer
 * that names a node or relation the model does not have drops today's changes,
 * or that PR's impact, to `archctx_failed`; one whose only fault is a path that
 * the public-path guard refuses drops to `path_not_public`.
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
  const index: MapIndex = { nodes: new Set(input.nodes.map(entry => entry.id)), relations: new Set(input.relations.map(entry => entry.id)) };
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
  const { violations, decisions } = input.layers;
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
      changes: changesValid(input.layers.changes, index) ? input.layers.changes : impactGap(path => changesValid(input.layers.changes, index, path)),
      violations: {
        debt: violations.debt,
        flows: violations.flows.state === 'ok' ? { ...violations.flows, unprovable: byId(violations.flows.unprovable) } : violations.flows,
        anchors: violations.anchors.state === 'ok' ? { ...violations.anchors, nodes: byId(violations.anchors.nodes) } : violations.anchors,
        dependencies: violations.dependencies.state === 'ok' ? { state: 'ok', edges: byEdge(violations.dependencies.edges) } : violations.dependencies,
        layer_direction: violations.layer_direction,
      },
      pull_requests: projectPullRequests(input.layers.pull_requests, index),
      tests: input.layers.tests,
      decisions: { state: 'ok', items: byId(decisions.items) },
    },
  });
}

