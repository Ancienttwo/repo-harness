import { canonicalEngineerJson, engineerSha256 } from './profile-binding';

export const WORK_GRAPH_PROTOCOL = 1 as const;
export const WORK_GRAPH_KIND = 'repo-harness-work-graph' as const;
export const ENGINEER_OFFER_PROTOCOL = 1 as const;
export const ENGINEER_OFFER_KIND = 'repo-harness-engineer-offer' as const;
export const ENGINEER_OFFERS_KIND = 'repo-harness-engineer-offers' as const;

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const REPOSITORY_ID = /^repo_[0-9a-f]{16}$/u;
const WORK_PACKAGE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/u;
const CAPABILITY_ID = /^capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const ENGINEER_ID = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const TASK_ID = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_TOKEN = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const OPAQUE = /^[^\u0000-\u001f\u007f]{1,512}$/u;

export type WorkGraphLane = 'generic-v1' | 'engineering-v2';
export type WorkPackageDependencyState =
  | 'canonical_done'
  | 'module_accepted'
  | 'publication_integrated'
  | 'product_accepted';

export interface WorkPackageDependencyV1 {
  readonly repository_id: string;
  readonly work_package_id: string;
  readonly required_state: WorkPackageDependencyState;
}

export interface WorkPackageAcceptancePolicyV1 {
  readonly gate: 'module' | 'product';
  readonly policy_id: string;
  readonly policy_ref: string;
  readonly policy_revision: string;
}

export interface WorkPackageRollbackBoundaryV1 {
  readonly kind: 'work_package';
  readonly boundary_id: string;
  readonly boundary_ref: string;
  readonly boundary_revision: string;
}

export interface WorkPackageDefinitionV1 {
  readonly work_package_id: string;
  readonly task_ref: string;
  readonly primary_capability: string;
  readonly depends_on: readonly WorkPackageDependencyV1[];
  readonly priority: number;
  readonly concurrency: { readonly scope: 'repo'; readonly key: string };
  readonly execution_surface: 'contract';
  readonly integration_group: string | null;
  readonly required_acceptance: readonly WorkPackageAcceptancePolicyV1[];
  readonly rollback_boundary: WorkPackageRollbackBoundaryV1;
}

export interface WorkGraphV1 {
  readonly protocol: typeof WORK_GRAPH_PROTOCOL;
  readonly kind: typeof WORK_GRAPH_KIND;
  readonly repository_id: string;
  readonly sprint_path: string;
  readonly lane: WorkGraphLane;
  readonly work_packages: readonly WorkPackageDefinitionV1[];
}

export interface SchedulingCanonicalTask {
  readonly task_id: string;
  readonly task_revision: string;
  readonly task_ref: string;
  readonly status: string;
  readonly row_order: number;
}

export interface ProjectedWorkPackageV1 extends WorkPackageDefinitionV1 {
  readonly repository_id: string;
  readonly sprint_path: string;
  readonly work_package_revision: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly task_status: string;
  readonly row_order: number;
}

export interface ProjectedWorkGraphV1 {
  readonly protocol: typeof WORK_GRAPH_PROTOCOL;
  readonly kind: typeof WORK_GRAPH_KIND;
  readonly repository_id: string;
  readonly sprint_path: string;
  readonly lane: WorkGraphLane;
  readonly work_graph_revision: string;
  readonly work_packages: readonly ProjectedWorkPackageV1[];
}

export type DependencyObservationStatus = 'satisfied' | 'unsatisfied' | 'authority_unavailable';

export interface WorkPackageDependencyObservationV1 extends WorkPackageDependencyV1 {
  readonly status: DependencyObservationStatus;
  readonly authority_revision: string | null;
}

export type EngineerOfferBlockerCode =
  | 'profile_capability_mismatch'
  | 'binding_inactive'
  | 'fleet_offer_unavailable'
  | 'dependency_not_ready'
  | 'dependency_authority_unavailable'
  | 'concurrency_unavailable'
  | 'active_claim_limit';

export interface EngineerOfferExclusionV1 {
  readonly repository_id: string;
  readonly work_package_id: string;
  readonly engineer_id: string;
  readonly blockers: readonly EngineerOfferBlockerCode[];
}

export interface EngineerOfferV1 {
  readonly protocol: typeof ENGINEER_OFFER_PROTOCOL;
  readonly kind: typeof ENGINEER_OFFER_KIND;
  readonly repository_id: string;
  readonly sprint_path: string;
  readonly work_package_id: string;
  readonly work_package_revision: string;
  readonly work_graph_revision: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly primary_capability: string;
  readonly priority: number;
  readonly dependency_state: 'ready';
  readonly dependency_revision: string;
  readonly concurrency_scope: 'repo';
  readonly concurrency_key: string;
  readonly concurrency_revision: string;
  readonly engineer_id: string;
  readonly engineer_contract_revision: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly fleet_offer_revision: string;
  readonly authorization_revision: number;
  readonly offer_revision: string;
}

export interface EngineerOffersV1 {
  readonly protocol: typeof ENGINEER_OFFER_PROTOCOL;
  readonly kind: typeof ENGINEER_OFFERS_KIND;
  readonly repository_id: string;
  readonly engineer_id: string;
  readonly lane: WorkGraphLane | 'unclassified';
  readonly work_graph_revision: string | null;
  readonly snapshot_revision: string;
  readonly offers: readonly EngineerOfferV1[];
  readonly exclusions: readonly EngineerOfferExclusionV1[];
}

export type EngineerSchedulingErrorCode =
  | 'work_graph_invalid'
  | 'work_graph_unclassified'
  | 'work_graph_reference_mismatch'
  | 'engineer_offer_stale'
  | 'engineer_concurrency_unavailable';

export class EngineerSchedulingError extends Error {
  constructor(readonly code: EngineerSchedulingErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'EngineerSchedulingError';
  }
}

type RecordValue = Record<string, unknown>;

function invalid(message: string): never {
  throw new EngineerSchedulingError('work_graph_invalid', message);
}

function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as RecordValue;
}

function exact(value: RecordValue, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid(`${label} keys are invalid`);
  }
}

function string(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) invalid(`${field} is invalid`);
  return value;
}

function integer(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    invalid(`${field} is invalid`);
  }
  return value as number;
}

function safeRepoPath(value: unknown, field: string, suffix?: string): string {
  const path = string(value, field, OPAQUE);
  if (path.startsWith('/') || path.startsWith('-') || path.includes('\\')
    || path.split('/').some((part) => part.length === 0 || part === '.' || part === '..')) {
    invalid(`${field} is unsafe`);
  }
  if (suffix !== undefined && !path.endsWith(suffix)) invalid(`${field} must end with ${suffix}`);
  return path;
}

function parseDependency(value: unknown, index: number): WorkPackageDependencyV1 {
  const input = record(value, `depends_on[${index}]`);
  exact(input, ['repository_id', 'work_package_id', 'required_state'], `depends_on[${index}]`);
  if (!['canonical_done', 'module_accepted', 'publication_integrated', 'product_accepted'].includes(String(input.required_state))) {
    invalid(`depends_on[${index}].required_state is invalid`);
  }
  return Object.freeze({
    repository_id: string(input.repository_id, `depends_on[${index}].repository_id`, REPOSITORY_ID),
    work_package_id: string(input.work_package_id, `depends_on[${index}].work_package_id`, WORK_PACKAGE_ID),
    required_state: input.required_state as WorkPackageDependencyState,
  });
}

function parsePolicy(value: unknown, index: number): WorkPackageAcceptancePolicyV1 {
  const input = record(value, `required_acceptance[${index}]`);
  exact(input, ['gate', 'policy_id', 'policy_ref', 'policy_revision'], `required_acceptance[${index}]`);
  if (input.gate !== 'module' && input.gate !== 'product') invalid(`required_acceptance[${index}].gate is invalid`);
  return Object.freeze({
    gate: input.gate,
    policy_id: string(input.policy_id, `required_acceptance[${index}].policy_id`, SAFE_TOKEN),
    policy_ref: safeRepoPath(input.policy_ref, `required_acceptance[${index}].policy_ref`),
    policy_revision: string(input.policy_revision, `required_acceptance[${index}].policy_revision`, DIGEST),
  });
}

function parseRollback(value: unknown): WorkPackageRollbackBoundaryV1 {
  const input = record(value, 'rollback_boundary');
  exact(input, ['kind', 'boundary_id', 'boundary_ref', 'boundary_revision'], 'rollback_boundary');
  if (input.kind !== 'work_package') invalid('rollback_boundary.kind is invalid');
  return Object.freeze({
    kind: 'work_package',
    boundary_id: string(input.boundary_id, 'rollback_boundary.boundary_id', OPAQUE),
    boundary_ref: safeRepoPath(input.boundary_ref, 'rollback_boundary.boundary_ref'),
    boundary_revision: string(input.boundary_revision, 'rollback_boundary.boundary_revision', DIGEST),
  });
}

function parseWorkPackage(value: unknown, index: number): WorkPackageDefinitionV1 {
  const input = record(value, `work_packages[${index}]`);
  exact(input, [
    'work_package_id', 'task_ref', 'primary_capability', 'depends_on', 'priority',
    'concurrency', 'execution_surface', 'integration_group', 'required_acceptance',
    'rollback_boundary',
  ], `work_packages[${index}]`);
  if (!Array.isArray(input.depends_on)) invalid(`work_packages[${index}].depends_on must be an array`);
  if (!Array.isArray(input.required_acceptance) || input.required_acceptance.length === 0) {
    invalid(`work_packages[${index}].required_acceptance must be a non-empty array`);
  }
  const concurrency = record(input.concurrency, `work_packages[${index}].concurrency`);
  exact(concurrency, ['scope', 'key'], `work_packages[${index}].concurrency`);
  if (concurrency.scope !== 'repo') invalid(`work_packages[${index}].concurrency.scope is unsupported`);
  if (input.execution_surface !== 'contract') invalid(`work_packages[${index}].execution_surface is invalid`);
  const dependencies = input.depends_on.map(parseDependency);
  const dependencyKeys = dependencies.map((entry) => `${entry.repository_id}:${entry.work_package_id}`);
  if (new Set(dependencyKeys).size !== dependencyKeys.length) invalid(`work_packages[${index}].depends_on contains duplicates`);
  const policies = input.required_acceptance.map(parsePolicy);
  const policyKeys = policies.map((entry) => `${entry.gate}:${entry.policy_id}`);
  if (new Set(policyKeys).size !== policyKeys.length) invalid(`work_packages[${index}].required_acceptance contains duplicates`);
  return Object.freeze({
    work_package_id: string(input.work_package_id, `work_packages[${index}].work_package_id`, WORK_PACKAGE_ID),
    task_ref: string(input.task_ref, `work_packages[${index}].task_ref`, OPAQUE),
    primary_capability: string(input.primary_capability, `work_packages[${index}].primary_capability`, CAPABILITY_ID),
    depends_on: Object.freeze(dependencies),
    priority: integer(input.priority, `work_packages[${index}].priority`, 0, 100),
    concurrency: Object.freeze({ scope: 'repo', key: string(concurrency.key, `work_packages[${index}].concurrency.key`, SAFE_TOKEN) }),
    execution_surface: 'contract',
    integration_group: input.integration_group === null
      ? null
      : string(input.integration_group, `work_packages[${index}].integration_group`, SAFE_TOKEN),
    required_acceptance: Object.freeze(policies),
    rollback_boundary: parseRollback(input.rollback_boundary),
  });
}

export function validateWorkPackageDefinition(value: unknown): WorkPackageDefinitionV1 {
  return parseWorkPackage(value, 0);
}

export function schedulingCarrierPath(sprintPath: string): string {
  const safe = safeRepoPath(sprintPath, 'sprint_path', '.sprint.md');
  return `${safe.slice(0, -'.sprint.md'.length)}.work-graph.v1.json`;
}

export function validateWorkGraph(value: unknown): WorkGraphV1 {
  const input = record(value, 'work graph');
  exact(input, ['protocol', 'kind', 'repository_id', 'sprint_path', 'lane', 'work_packages'], 'work graph');
  if (input.protocol !== WORK_GRAPH_PROTOCOL || input.kind !== WORK_GRAPH_KIND) invalid('work graph protocol or kind is invalid');
  if (input.lane !== 'generic-v1' && input.lane !== 'engineering-v2') invalid('work graph lane is invalid');
  if (!Array.isArray(input.work_packages)) invalid('work_packages must be an array');
  const sprintPath = safeRepoPath(input.sprint_path, 'sprint_path', '.sprint.md');
  const workPackages = input.work_packages.map(parseWorkPackage);
  if (new Set(workPackages.map((entry) => entry.work_package_id)).size !== workPackages.length) invalid('work graph contains duplicate work_package_id');
  if (new Set(workPackages.map((entry) => entry.task_ref)).size !== workPackages.length) invalid('work graph contains duplicate task_ref');
  if (input.lane === 'generic-v1' && workPackages.length !== 0) invalid('generic-v1 work graph must contain zero work packages');
  if (input.lane === 'engineering-v2' && workPackages.length === 0) invalid('engineering-v2 work graph must contain work packages');
  return Object.freeze({
    protocol: WORK_GRAPH_PROTOCOL,
    kind: WORK_GRAPH_KIND,
    repository_id: string(input.repository_id, 'repository_id', REPOSITORY_ID),
    sprint_path: sprintPath,
    lane: input.lane,
    work_packages: Object.freeze(workPackages),
  });
}

export function workPackageRevision(definition: WorkPackageDefinitionV1): string {
  return engineerSha256(canonicalEngineerJson(validateWorkPackageDefinition(definition)));
}

export function projectWorkGraph(
  inputGraph: WorkGraphV1,
  tasksInput: readonly SchedulingCanonicalTask[],
): ProjectedWorkGraphV1 {
  const graph = validateWorkGraph(inputGraph);
  const tasks = [...tasksInput];
  for (const task of tasks) {
    if (!TASK_ID.test(task.task_id) || !TASK_ID.test(task.task_revision) || !OPAQUE.test(task.task_ref)
      || !Number.isSafeInteger(task.row_order) || task.row_order < 1) invalid('canonical task projection is invalid');
  }
  if (new Set(tasks.map((task) => task.task_ref)).size !== tasks.length) invalid('canonical Sprint contains duplicate Task cells');
  if (new Set(tasks.map((task) => task.task_id)).size !== tasks.length) invalid('canonical Sprint contains duplicate task_id');
  if (new Set(tasks.map((task) => task.row_order)).size !== tasks.length) invalid('canonical Sprint contains duplicate row_order');
  if (graph.lane === 'generic-v1') {
    return Object.freeze({
      protocol: WORK_GRAPH_PROTOCOL,
      kind: WORK_GRAPH_KIND,
      repository_id: graph.repository_id,
      sprint_path: graph.sprint_path,
      lane: graph.lane,
      work_graph_revision: engineerSha256(canonicalEngineerJson(graph)),
      work_packages: Object.freeze([]),
    });
  }
  if (graph.work_packages.length !== tasks.length) invalid('engineering-v2 work graph must cover every canonical Sprint row');
  const byRef = new Map(tasks.map((task) => [task.task_ref, task]));
  const projected = graph.work_packages.map((definition) => {
    const task = byRef.get(definition.task_ref);
    if (!task) invalid(`work package ${definition.work_package_id} task_ref is absent from canonical Sprint`);
    return Object.freeze({
      ...definition,
      repository_id: graph.repository_id,
      sprint_path: graph.sprint_path,
      work_package_revision: workPackageRevision(definition),
      task_id: task.task_id,
      task_revision: task.task_revision,
      task_status: task.status,
      row_order: task.row_order,
    });
  }).sort((left, right) => left.work_package_id.localeCompare(right.work_package_id));
  const workGraphRevision = engineerSha256(canonicalEngineerJson({
    protocol: WORK_GRAPH_PROTOCOL,
    kind: WORK_GRAPH_KIND,
    repository_id: graph.repository_id,
    sprint_path: graph.sprint_path,
    lane: graph.lane,
    work_packages: projected.map((entry) => ({
      work_package_id: entry.work_package_id,
      work_package_revision: entry.work_package_revision,
      task_id: entry.task_id,
      task_revision: entry.task_revision,
    })),
  }));
  return Object.freeze({
    protocol: WORK_GRAPH_PROTOCOL,
    kind: WORK_GRAPH_KIND,
    repository_id: graph.repository_id,
    sprint_path: graph.sprint_path,
    lane: graph.lane,
    work_graph_revision: workGraphRevision,
    work_packages: Object.freeze(projected),
  });
}

function packageKey(repositoryId: string, workPackageId: string): string {
  return `${repositoryId}:${workPackageId}`;
}

export function validateWorkGraphTopology(graphs: readonly ProjectedWorkGraphV1[]): void {
  const packages = new Map<string, ProjectedWorkPackageV1>();
  for (const graph of graphs) {
    for (const item of graph.work_packages) {
      const key = packageKey(item.repository_id, item.work_package_id);
      if (packages.has(key)) invalid(`duplicate Work Package identity ${key}`);
      packages.set(key, item);
    }
  }
  for (const [key, item] of packages) {
    for (const dependency of item.depends_on) {
      const dependencyKey = packageKey(dependency.repository_id, dependency.work_package_id);
      if (!packages.has(dependencyKey)) invalid(`Work Package ${key} depends on missing ${dependencyKey}`);
      if (dependencyKey === key) invalid(`Work Package ${key} depends on itself`);
    }
  }
  const state = new Map<string, 'visiting' | 'visited'>();
  const visit = (key: string, trail: readonly string[]): void => {
    const current = state.get(key);
    if (current === 'visited') return;
    if (current === 'visiting') invalid(`work graph cycle detected: ${[...trail, key].join(' -> ')}`);
    state.set(key, 'visiting');
    const item = packages.get(key)!;
    for (const dependency of item.depends_on) {
      visit(packageKey(dependency.repository_id, dependency.work_package_id), [...trail, key]);
    }
    state.set(key, 'visited');
  };
  for (const key of [...packages.keys()].sort()) visit(key, []);
}

export interface EngineerOfferCandidateInput {
  readonly graph: ProjectedWorkGraphV1;
  readonly work_package: ProjectedWorkPackageV1;
  readonly engineer: {
    readonly engineer_id: string;
    readonly capability_id: string;
    readonly engineer_contract_revision: string;
    readonly max_active_claims: number;
  };
  readonly binding: {
    readonly state: 'active' | 'retired' | 'unbound';
    readonly binding_id: string | null;
    readonly binding_generation: number;
  };
  readonly fleet_offer: {
    readonly execution_readiness: string;
    readonly snapshot_consistency: string;
    readonly task_id: string;
    readonly task_revision: string;
    readonly offer_revision: string;
    readonly authorization_revision: number;
  } | null;
  readonly dependencies: readonly WorkPackageDependencyObservationV1[];
  readonly concurrency_available: boolean;
  readonly concurrency_revision: string;
  readonly active_claims: number;
}

export type EngineerOfferCandidateResult =
  | { readonly eligible: true; readonly offer: EngineerOfferV1 }
  | { readonly eligible: false; readonly exclusion: EngineerOfferExclusionV1 };

function uniqueBlockers(values: readonly EngineerOfferBlockerCode[]): readonly EngineerOfferBlockerCode[] {
  return Object.freeze([...new Set(values)]);
}

export function buildEngineerOfferCandidate(input: EngineerOfferCandidateInput): EngineerOfferCandidateResult {
  const blockers: EngineerOfferBlockerCode[] = [];
  const item = input.work_package;
  if (!ENGINEER_ID.test(input.engineer.engineer_id) || !CAPABILITY_ID.test(input.engineer.capability_id)
    || !DIGEST.test(input.engineer.engineer_contract_revision)) invalid('Engineer offer profile input is invalid');
  if (!Number.isSafeInteger(input.engineer.max_active_claims) || input.engineer.max_active_claims < 1
    || !Number.isSafeInteger(input.active_claims) || input.active_claims < 0) invalid('Engineer offer claim counts are invalid');
  if (typeof input.concurrency_available !== 'boolean' || !DIGEST.test(input.concurrency_revision)) {
    invalid('Engineer offer concurrency input is invalid');
  }
  const graphItem = input.graph.work_packages.find((entry) => entry.work_package_id === item.work_package_id);
  if (!graphItem || graphItem.repository_id !== item.repository_id || graphItem.sprint_path !== item.sprint_path
    || graphItem.work_package_revision !== item.work_package_revision || graphItem.task_id !== item.task_id
    || graphItem.task_revision !== item.task_revision || input.graph.repository_id !== item.repository_id
    || input.graph.sprint_path !== item.sprint_path || !DIGEST.test(input.graph.work_graph_revision)) {
    invalid('Engineer offer Work Package is not an exact member of the projected graph');
  }
  if (input.dependencies.length !== item.depends_on.length || input.dependencies.some((entry, index) => {
    const expected = item.depends_on[index];
    if (!expected || entry.repository_id !== expected.repository_id
      || entry.work_package_id !== expected.work_package_id || entry.required_state !== expected.required_state) return true;
    if (!['satisfied', 'unsatisfied', 'authority_unavailable'].includes(entry.status)) return true;
    return entry.status === 'authority_unavailable'
      ? entry.authority_revision !== null
      : typeof entry.authority_revision !== 'string' || !DIGEST.test(entry.authority_revision);
  })) invalid('Engineer offer dependency observations do not match the Work Package');
  if (!Number.isSafeInteger(input.binding.binding_generation) || input.binding.binding_generation < 0
    || (input.binding.state === 'active'
      && (input.binding.binding_generation < 1 || input.binding.binding_id === null || !UUID.test(input.binding.binding_id)))) {
    invalid('Engineer offer Binding input is invalid');
  }
  if (input.fleet_offer && (!TASK_ID.test(input.fleet_offer.task_id)
    || !TASK_ID.test(input.fleet_offer.task_revision) || !DIGEST.test(input.fleet_offer.offer_revision)
    || !Number.isSafeInteger(input.fleet_offer.authorization_revision) || input.fleet_offer.authorization_revision < 0)) {
    invalid('Engineer offer Fleet input is invalid');
  }
  if (item.primary_capability !== input.engineer.capability_id) blockers.push('profile_capability_mismatch');
  if (input.binding.state !== 'active' || input.binding.binding_id === null) blockers.push('binding_inactive');
  if (!input.fleet_offer || input.fleet_offer.execution_readiness !== 'execution_ready'
    || input.fleet_offer.snapshot_consistency !== 'stable'
    || input.fleet_offer.task_id !== item.task_id
    || input.fleet_offer.task_revision !== item.task_revision) blockers.push('fleet_offer_unavailable');
  if (input.dependencies.some((entry) => entry.status === 'authority_unavailable')) blockers.push('dependency_authority_unavailable');
  if (input.dependencies.some((entry) => entry.status === 'unsatisfied')) blockers.push('dependency_not_ready');
  if (!input.concurrency_available) blockers.push('concurrency_unavailable');
  if (input.active_claims >= input.engineer.max_active_claims) blockers.push('active_claim_limit');
  if (blockers.length > 0 || !input.fleet_offer || input.binding.binding_id === null) {
    return Object.freeze({
      eligible: false,
      exclusion: Object.freeze({
        repository_id: item.repository_id,
        work_package_id: item.work_package_id,
        engineer_id: input.engineer.engineer_id,
        blockers: uniqueBlockers(blockers),
      }),
    });
  }
  const dependencyRevision = engineerSha256(canonicalEngineerJson(input.dependencies));
  const basis = {
    protocol: ENGINEER_OFFER_PROTOCOL,
    kind: ENGINEER_OFFER_KIND,
    repository_id: item.repository_id,
    sprint_path: item.sprint_path,
    work_package_id: item.work_package_id,
    work_package_revision: item.work_package_revision,
    work_graph_revision: input.graph.work_graph_revision,
    task_id: item.task_id,
    task_revision: item.task_revision,
    primary_capability: item.primary_capability,
    priority: item.priority,
    dependency_state: 'ready' as const,
    dependency_revision: dependencyRevision,
    concurrency_scope: 'repo' as const,
    concurrency_key: item.concurrency.key,
    concurrency_revision: input.concurrency_revision,
    engineer_id: input.engineer.engineer_id,
    engineer_contract_revision: input.engineer.engineer_contract_revision,
    binding_id: input.binding.binding_id,
    binding_generation: input.binding.binding_generation,
    fleet_offer_revision: input.fleet_offer.offer_revision,
    authorization_revision: input.fleet_offer.authorization_revision,
  };
  return Object.freeze({
    eligible: true,
    offer: Object.freeze({ ...basis, offer_revision: engineerSha256(canonicalEngineerJson(basis)) }),
  });
}

export function validateEngineerOffer(value: unknown): EngineerOfferV1 {
  const input = record(value, 'Engineer offer');
  exact(input, [
    'protocol', 'kind', 'repository_id', 'sprint_path', 'work_package_id',
    'work_package_revision', 'work_graph_revision', 'task_id', 'task_revision',
    'primary_capability', 'priority', 'dependency_state', 'dependency_revision',
    'concurrency_scope', 'concurrency_key', 'concurrency_revision', 'engineer_id',
    'engineer_contract_revision', 'binding_id', 'binding_generation',
    'fleet_offer_revision', 'authorization_revision', 'offer_revision',
  ], 'Engineer offer');
  if (input.protocol !== ENGINEER_OFFER_PROTOCOL || input.kind !== ENGINEER_OFFER_KIND
    || input.dependency_state !== 'ready' || input.concurrency_scope !== 'repo') {
    invalid('Engineer offer protocol or closed state is invalid');
  }
  const basis = {
    protocol: ENGINEER_OFFER_PROTOCOL,
    kind: ENGINEER_OFFER_KIND,
    repository_id: string(input.repository_id, 'repository_id', REPOSITORY_ID),
    sprint_path: safeRepoPath(input.sprint_path, 'sprint_path', '.sprint.md'),
    work_package_id: string(input.work_package_id, 'work_package_id', WORK_PACKAGE_ID),
    work_package_revision: string(input.work_package_revision, 'work_package_revision', DIGEST),
    work_graph_revision: string(input.work_graph_revision, 'work_graph_revision', DIGEST),
    task_id: string(input.task_id, 'task_id', TASK_ID),
    task_revision: string(input.task_revision, 'task_revision', TASK_ID),
    primary_capability: string(input.primary_capability, 'primary_capability', CAPABILITY_ID),
    priority: integer(input.priority, 'priority', 0, 100),
    dependency_state: 'ready' as const,
    dependency_revision: string(input.dependency_revision, 'dependency_revision', DIGEST),
    concurrency_scope: 'repo' as const,
    concurrency_key: string(input.concurrency_key, 'concurrency_key', SAFE_TOKEN),
    concurrency_revision: string(input.concurrency_revision, 'concurrency_revision', DIGEST),
    engineer_id: string(input.engineer_id, 'engineer_id', ENGINEER_ID),
    engineer_contract_revision: string(input.engineer_contract_revision, 'engineer_contract_revision', DIGEST),
    binding_id: string(input.binding_id, 'binding_id', UUID),
    binding_generation: integer(input.binding_generation, 'binding_generation', 1, Number.MAX_SAFE_INTEGER),
    fleet_offer_revision: string(input.fleet_offer_revision, 'fleet_offer_revision', DIGEST),
    authorization_revision: integer(input.authorization_revision, 'authorization_revision', 0, Number.MAX_SAFE_INTEGER),
  };
  const revision = string(input.offer_revision, 'offer_revision', DIGEST);
  if (revision !== engineerSha256(canonicalEngineerJson(basis))) invalid('Engineer offer revision is invalid');
  return Object.freeze({ ...basis, offer_revision: revision });
}

export function buildEngineerOffersDocument(input: {
  readonly repository_id: string;
  readonly engineer_id: string;
  readonly lane: WorkGraphLane | 'unclassified';
  readonly work_graph_revision: string | null;
  readonly candidates: readonly EngineerOfferCandidateResult[];
}): EngineerOffersV1 {
  const offers = input.candidates
    .filter((candidate): candidate is Extract<EngineerOfferCandidateResult, { eligible: true }> => candidate.eligible)
    .map((candidate) => validateEngineerOffer(candidate.offer))
    .sort((left, right) => right.priority - left.priority
      || left.work_package_id.localeCompare(right.work_package_id)
      || left.offer_revision.localeCompare(right.offer_revision));
  const exclusions = input.candidates
    .filter((candidate): candidate is Extract<EngineerOfferCandidateResult, { eligible: false }> => !candidate.eligible)
    .map((candidate) => candidate.exclusion)
    .sort((left, right) => left.work_package_id.localeCompare(right.work_package_id));
  const basis = {
    protocol: ENGINEER_OFFER_PROTOCOL,
    kind: ENGINEER_OFFERS_KIND,
    repository_id: string(input.repository_id, 'repository_id', REPOSITORY_ID),
    engineer_id: string(input.engineer_id, 'engineer_id', ENGINEER_ID),
    lane: input.lane,
    work_graph_revision: input.work_graph_revision,
    offers,
    exclusions,
  };
  return Object.freeze({
    ...basis,
    offers: Object.freeze(offers),
    exclusions: Object.freeze(exclusions),
    snapshot_revision: engineerSha256(canonicalEngineerJson(basis)),
  });
}
