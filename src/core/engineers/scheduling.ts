import { validateRequiredPullRequest, type RequiredPullRequestV2 } from '../integration/product-acceptance';
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

export type WorkPackageDependencyAuthorityKind = 'module_acceptance' | 'product_acceptance' | 'provider_integration';

/**
 * A dependency edge that requires an acceptance verdict must name the exact
 * authority subject. `required_acceptance` carries policy documents, not
 * receipt subjects, so it cannot select one AcceptanceReceipt or one ME-4C
 * product projection. This closed reference is validated against the same
 * canonical commit as the target Work Graph before any authority is read.
 * For module acceptance, subject_ref names a JSON ModuleAcceptanceReferenceV1
 * locator. Its committed bytes select a protected grant; they do not grant it.
 */
export interface WorkPackageDependencyAuthorityRefV1 {
  readonly authority_kind: WorkPackageDependencyAuthorityKind;
  readonly subject_ref: string;
  readonly subject_revision: string;
}

/** A committed locator, never an approval or acceptance verdict. Effects must
 * observe its issue and authenticate its protected grant before using it. */
export interface ModuleAcceptanceReferenceV1 {
  readonly protocol: 1;
  readonly provider_repository_id: string;
  readonly issue_id: string;
  readonly campaign_id: string;
  readonly admission_sha256: string;
  readonly grant_sha256: string;
  readonly policy_sha256: string;
  readonly actor_id: string;
}

export function validateModuleAcceptanceReference(value: unknown): ModuleAcceptanceReferenceV1 {
  const label = 'module acceptance reference';
  const input = record(value, label);
  exact(input, ['protocol', 'provider_repository_id', 'issue_id', 'campaign_id', 'admission_sha256', 'grant_sha256', 'policy_sha256', 'actor_id'], label);
  if (input.protocol !== 1) invalid(`${label}.protocol must be 1`);
  return Object.freeze({ protocol: 1,
    provider_repository_id: string(input.provider_repository_id, `${label}.provider_repository_id`, OPAQUE),
    issue_id: string(input.issue_id, `${label}.issue_id`, OPAQUE),
    campaign_id: string(input.campaign_id, `${label}.campaign_id`, OPAQUE),
    admission_sha256: string(input.admission_sha256, `${label}.admission_sha256`, DIGEST),
    grant_sha256: string(input.grant_sha256, `${label}.grant_sha256`, DIGEST),
    policy_sha256: string(input.policy_sha256, `${label}.policy_sha256`, DIGEST),
    actor_id: string(input.actor_id, `${label}.actor_id`, OPAQUE),
  });
}

/** Committed selection only; provider and acceptance effects establish proof. */
export interface IntegrationDependencyReferenceV2 {
  readonly protocol: 2;
  readonly task_id: string;
  readonly task_revision: string;
  readonly final_head_sha: string;
  readonly final_tree_sha: string;
  readonly required_pull_requests: readonly RequiredPullRequestV2[];
  readonly product: { readonly projection_sha256: string; readonly approved_prd_ref: string; readonly approved_prd_sha256: string; readonly review_authority: ModuleAcceptanceReferenceV1 } | null;
}

export function validateIntegrationDependencyReference(value: unknown): IntegrationDependencyReferenceV2 {
  const label = 'integration dependency reference';
  const input = record(value, label);
  exact(input, ['protocol', 'task_id', 'task_revision', 'final_head_sha', 'final_tree_sha', 'required_pull_requests', 'product'], label);
  if (input.protocol !== 2) invalid(`${label}.protocol must be 2`);
  if (!Array.isArray(input.required_pull_requests) || input.required_pull_requests.length === 0) invalid(`${label}.required_pull_requests must be non-empty`);
  const selected = input.required_pull_requests.map(validateRequiredPullRequest);
  if (new Set(selected.map(pr => `${pr.provider_repository_id}:${pr.pr_number}`)).size !== selected.length) invalid(`${label} contains duplicate PRs`);
  let product: IntegrationDependencyReferenceV2['product'] = null;
  if (input.product !== null) {
    const item = record(input.product, `${label}.product`);
    exact(item, ['projection_sha256', 'approved_prd_ref', 'approved_prd_sha256', 'review_authority'], `${label}.product`);
    product = Object.freeze({ review_authority: validateModuleAcceptanceReference(item.review_authority), projection_sha256: string(item.projection_sha256, 'projection_sha256', DIGEST),
      approved_prd_ref: safeRepoPath(item.approved_prd_ref, 'approved_prd_ref'), approved_prd_sha256: string(item.approved_prd_sha256, 'approved_prd_sha256', DIGEST) });
  }
  return Object.freeze({ protocol: 2, task_id: string(input.task_id, 'task_id', /^[0-9a-f]{64}$/),
    task_revision: string(input.task_revision, 'task_revision', /^[0-9a-f]{64}$/),
    final_head_sha: string(input.final_head_sha, 'final_head_sha', /^[0-9a-f]{40}$/),
    final_tree_sha: string(input.final_tree_sha, 'final_tree_sha', /^[0-9a-f]{40}$/),
    required_pull_requests: Object.freeze(selected), product });
}

export interface WorkPackageDependencyV1 {
  readonly repository_id: string;
  readonly work_package_id: string;
  readonly required_state: WorkPackageDependencyState;
  readonly acceptance_authority: WorkPackageDependencyAuthorityRefV1 | null;
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
export type AutomationFailureClass = 'transient_failure' | 'external_blocked' | 'lease_lost';
export interface WorkPackageRetryPolicyV1 {
  readonly max_automated_attempts: number;
  readonly retryable_failure_classes: readonly AutomationFailureClass[];
  readonly backoff: { readonly kind: 'fixed' | 'exponential'; readonly initial_seconds: number; readonly maximum_seconds: number };
  readonly attention_after_seconds: number;
  readonly revision_reset: 'reset_on_work_package_revision';
}

// Offer documents keep these outcome and retry fields. Attempt persistence is retired.
const ENGINEER_OFFER_OUTCOMES = Object.freeze([
  'started', 'completed', 'not_reproducible', 'user_blocked', 'external_blocked',
  'transient_failure', 'permanent_failure', 'lease_lost', 'cancelled', 'reconciliation_required',
] as const);
export type EngineerOfferOutcome = typeof ENGINEER_OFFER_OUTCOMES[number];
export type RetryEligibilityState =
  | 'eligible' | 'retry_backoff' | 'retry_exhausted' | 'retry_forbidden'
  | 'reconciliation_required' | 'authority_unavailable';
export interface RetryEligibilityObservationV1 {
  readonly state: RetryEligibilityState;
  readonly attempt_count: number;
  readonly last_outcome: EngineerOfferOutcome | null;
  readonly next_eligible_at: string | null;
  readonly eligible_since: string | null;
  readonly attention_owner: 'none' | 'user' | 'operator';
  readonly starvation_attention: boolean;
  readonly authority_revision: string;
}

export interface WorkPackageDefinitionV1 {
  readonly work_package_id: string;
  /**
   * The canonical Sprint row's persisted `ID` cell. This is the join key, and
   * it is deliberately not the Task cell text: a title clarification used to
   * make the carrier stop mapping its own Work Package.
   */
  readonly task_id: string;
  readonly primary_capability: string;
  readonly depends_on: readonly WorkPackageDependencyV1[];
  readonly priority: number;
  readonly concurrency: { readonly scope: 'repo'; readonly key: string };
  readonly execution_surface: 'contract';
  readonly integration_group: string | null;
  readonly required_acceptance: readonly WorkPackageAcceptancePolicyV1[];
  readonly rollback_boundary: WorkPackageRollbackBoundaryV1;
  readonly retry_policy: WorkPackageRetryPolicyV1;
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
  /** Display projection of the Task cell; never a join key. */
  readonly task_ref: string;
  readonly status: string;
  readonly row_order: number;
}

export interface ProjectedWorkPackageV1 extends WorkPackageDefinitionV1 {
  readonly repository_id: string;
  readonly sprint_path: string;
  readonly work_package_revision: string;
  /** Derived display text read out of the joined canonical row. */
  readonly task_ref: string;
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
  | 'active_claim_limit'
  | 'retry_backoff'
  | 'retry_exhausted'
  | 'retry_forbidden'
  | 'attempt_reconciliation_required'
  | 'attempt_authority_unavailable';

export interface EngineerOfferExclusionV1 {
  readonly repository_id: string;
  readonly work_package_id: string;
  readonly engineer_id: string;
  readonly blockers: readonly EngineerOfferBlockerCode[];
  readonly attempt_count: number;
  readonly last_outcome: EngineerOfferOutcome | null;
  readonly next_eligible_at: string | null;
  readonly blocker_owner: 'none' | 'user' | 'operator';
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
  readonly retry_policy: WorkPackageRetryPolicyV1;
  readonly retry_revision: string;
  readonly eligible_since: string;
  readonly attempt_count: number;
  readonly last_outcome: EngineerOfferOutcome | null;
  readonly next_eligible_at: string | null;
  readonly blocker_owner: 'none' | 'user' | 'operator';
  readonly starvation_attention: boolean;
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

const DEPENDENCY_AUTHORITY_KIND_BY_STATE: Readonly<Record<WorkPackageDependencyState, WorkPackageDependencyAuthorityKind | null>> = Object.freeze({
  canonical_done: null,
  module_accepted: 'module_acceptance',
  publication_integrated: 'provider_integration',
  product_accepted: 'product_acceptance',
});

export const WORK_PACKAGE_DEPENDENCY_STATES: readonly WorkPackageDependencyState[] = Object.freeze(
  Object.keys(DEPENDENCY_AUTHORITY_KIND_BY_STATE).sort() as WorkPackageDependencyState[],
);

export function dependencyAuthorityKindForState(state: WorkPackageDependencyState): WorkPackageDependencyAuthorityKind | null {
  return DEPENDENCY_AUTHORITY_KIND_BY_STATE[state];
}

function parseDependencyAuthority(
  value: unknown,
  required: WorkPackageDependencyAuthorityKind | null,
  label: string,
): WorkPackageDependencyAuthorityRefV1 | null {
  if (value === null) {
    if (required !== null) invalid(`${label} requires an ${required} authority reference`);
    return null;
  }
  if (required === null) invalid(`${label} must be null for this required_state`);
  const input = record(value, label);
  exact(input, ['authority_kind', 'subject_ref', 'subject_revision'], label);
  if (input.authority_kind !== required) invalid(`${label}.authority_kind must be ${required}`);
  return Object.freeze({
    authority_kind: required,
    subject_ref: safeRepoPath(input.subject_ref, `${label}.subject_ref`),
    subject_revision: string(input.subject_revision, `${label}.subject_revision`, DIGEST),
  });
}

function parseDependency(value: unknown, index: number): WorkPackageDependencyV1 {
  const input = record(value, `depends_on[${index}]`);
  exact(input, ['repository_id', 'work_package_id', 'required_state', 'acceptance_authority'], `depends_on[${index}]`);
  if (!WORK_PACKAGE_DEPENDENCY_STATES.includes(String(input.required_state) as WorkPackageDependencyState)) {
    invalid(`depends_on[${index}].required_state is invalid`);
  }
  const requiredState = input.required_state as WorkPackageDependencyState;
  return Object.freeze({
    repository_id: string(input.repository_id, `depends_on[${index}].repository_id`, REPOSITORY_ID),
    work_package_id: string(input.work_package_id, `depends_on[${index}].work_package_id`, WORK_PACKAGE_ID),
    required_state: requiredState,
    acceptance_authority: parseDependencyAuthority(
      input.acceptance_authority,
      DEPENDENCY_AUTHORITY_KIND_BY_STATE[requiredState],
      `depends_on[${index}].acceptance_authority`,
    ),
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

export function validateWorkPackageRetryPolicy(value: unknown, index = 0): WorkPackageRetryPolicyV1 {
  const label = `work_packages[${index}].retry_policy`; const input = record(value, label);
  exact(input, ['max_automated_attempts', 'retryable_failure_classes', 'backoff', 'attention_after_seconds', 'revision_reset'], label);
  if (!Array.isArray(input.retryable_failure_classes) || input.retryable_failure_classes.length === 0) invalid(`${label}.retryable_failure_classes must be a non-empty array`);
  const classes = input.retryable_failure_classes.map((value, classIndex) => {
    if (!['transient_failure', 'external_blocked', 'lease_lost'].includes(String(value))) invalid(`${label}.retryable_failure_classes[${classIndex}] is invalid`);
    return value as AutomationFailureClass;
  });
  if (new Set(classes).size !== classes.length) invalid(`${label}.retryable_failure_classes contains duplicates`);
  const backoff = record(input.backoff, `${label}.backoff`); exact(backoff, ['kind', 'initial_seconds', 'maximum_seconds'], `${label}.backoff`);
  if (backoff.kind !== 'fixed' && backoff.kind !== 'exponential') invalid(`${label}.backoff.kind is invalid`);
  const initial = integer(backoff.initial_seconds, `${label}.backoff.initial_seconds`, 1, 86_400);
  const maximum = integer(backoff.maximum_seconds, `${label}.backoff.maximum_seconds`, initial, 604_800);
  if (input.revision_reset !== 'reset_on_work_package_revision') invalid(`${label}.revision_reset is invalid`);
  return Object.freeze({ max_automated_attempts: integer(input.max_automated_attempts, `${label}.max_automated_attempts`, 1, 100), retryable_failure_classes: Object.freeze(classes), backoff: Object.freeze({ kind: backoff.kind, initial_seconds: initial, maximum_seconds: maximum }), attention_after_seconds: integer(input.attention_after_seconds, `${label}.attention_after_seconds`, 1, 2_592_000), revision_reset: 'reset_on_work_package_revision' });
}

function parseWorkPackage(value: unknown, index: number): WorkPackageDefinitionV1 {
  const input = record(value, `work_packages[${index}]`);
  exact(input, [
    'work_package_id', 'task_id', 'primary_capability', 'depends_on', 'priority',
    'concurrency', 'execution_surface', 'integration_group', 'required_acceptance',
    'rollback_boundary', 'retry_policy',
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
    task_id: string(input.task_id, `work_packages[${index}].task_id`, TASK_ID),
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
    retry_policy: validateWorkPackageRetryPolicy(input.retry_policy, index),
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
  if (new Set(workPackages.map((entry) => entry.task_id)).size !== workPackages.length) invalid('work graph contains duplicate task_id');
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
  const byId = new Map(tasks.map((task) => [task.task_id, task]));
  const projected = graph.work_packages.map((definition) => {
    const task = byId.get(definition.task_id);
    if (!task) invalid(`work package ${definition.work_package_id} task_id is absent from canonical Sprint`);
    return Object.freeze({
      ...definition,
      repository_id: graph.repository_id,
      sprint_path: graph.sprint_path,
      work_package_revision: workPackageRevision(definition),
      task_ref: task.task_ref,
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

export function validateEngineerOffer(value: unknown): EngineerOfferV1 {
  const input = record(value, 'Engineer offer');
  exact(input, [
    'protocol', 'kind', 'repository_id', 'sprint_path', 'work_package_id',
    'work_package_revision', 'work_graph_revision', 'task_id', 'task_revision',
    'primary_capability', 'priority', 'dependency_state', 'dependency_revision',
    'concurrency_scope', 'concurrency_key', 'concurrency_revision', 'engineer_id',
    'engineer_contract_revision', 'binding_id', 'binding_generation',
    'fleet_offer_revision', 'authorization_revision', 'retry_policy', 'retry_revision', 'eligible_since',
    'attempt_count', 'last_outcome', 'next_eligible_at', 'blocker_owner', 'starvation_attention', 'offer_revision',
  ], 'Engineer offer');
  if (input.protocol !== ENGINEER_OFFER_PROTOCOL || input.kind !== ENGINEER_OFFER_KIND
    || input.dependency_state !== 'ready' || input.concurrency_scope !== 'repo') {
    invalid('Engineer offer protocol or closed state is invalid');
  }
  const blockerOwner: EngineerOfferV1['blocker_owner'] = input.blocker_owner === 'none' || input.blocker_owner === 'user' || input.blocker_owner === 'operator' ? input.blocker_owner : invalid('blocker_owner is invalid');
  const lastOutcome = input.last_outcome === null || ENGINEER_OFFER_OUTCOMES.includes(input.last_outcome as EngineerOfferOutcome) ? input.last_outcome as EngineerOfferOutcome | null : invalid('last_outcome is invalid');
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
    retry_policy: validateWorkPackageRetryPolicy(input.retry_policy),
    retry_revision: string(input.retry_revision, 'retry_revision', DIGEST),
    eligible_since: string(input.eligible_since, 'eligible_since', OPAQUE),
    attempt_count: integer(input.attempt_count, 'attempt_count', 0, 100),
    last_outcome: lastOutcome,
    next_eligible_at: input.next_eligible_at === null ? null : string(input.next_eligible_at, 'next_eligible_at', OPAQUE),
    blocker_owner: blockerOwner,
    starvation_attention: input.starvation_attention === true ? true : input.starvation_attention === false ? false : invalid('starvation_attention is invalid'),
  };
  const revision = string(input.offer_revision, 'offer_revision', DIGEST);
  if (revision !== engineerSha256(canonicalEngineerJson(basis))) invalid('Engineer offer revision is invalid');
  return Object.freeze({ ...basis, offer_revision: revision });
}

/** The whole-document authority check. `validateEngineerOffer` proves one
 * offer; this proves the document a consumer was handed is the exact document
 * the offer authority produced: closed key set, every offer and exclusion
 * valid and owned by this document, and a `snapshot_revision` that recomputes
 * over the given arrays. Order is covered because the digest is taken over the
 * arrays as given, so a reordered or edited document fails here rather than
 * being trusted downstream. */
export function validateEngineerOffersDocument(value: unknown): EngineerOffersV1 {
  const input = record(value, 'Engineer offers document');
  exact(input, [
    'protocol', 'kind', 'repository_id', 'engineer_id', 'lane',
    'work_graph_revision', 'snapshot_revision', 'offers', 'exclusions',
  ], 'Engineer offers document');
  if (input.protocol !== ENGINEER_OFFER_PROTOCOL || input.kind !== ENGINEER_OFFERS_KIND) {
    invalid('Engineer offers document protocol or kind is invalid');
  }
  if (input.lane !== 'generic-v1' && input.lane !== 'engineering-v2' && input.lane !== 'unclassified') {
    invalid('Engineer offers document lane is invalid');
  }
  if (input.work_graph_revision !== null) string(input.work_graph_revision, 'work_graph_revision', DIGEST);
  if (!Array.isArray(input.offers) || !Array.isArray(input.exclusions)) invalid('Engineer offers document collections are invalid');
  const repositoryId = string(input.repository_id, 'repository_id', REPOSITORY_ID);
  const engineerId = string(input.engineer_id, 'engineer_id', ENGINEER_ID);
  const offers = (input.offers as readonly unknown[]).map((entry) => {
    const offer = validateEngineerOffer(entry);
    if (offer.repository_id !== repositoryId || offer.engineer_id !== engineerId) {
      invalid('Engineer offer does not belong to this offers document');
    }
    if (input.work_graph_revision !== null && offer.work_graph_revision !== input.work_graph_revision) {
      invalid('Engineer offer names another work graph revision');
    }
    return offer;
  });
  const exclusions = (input.exclusions as readonly unknown[]).map((entry) => {
    const item = record(entry, 'exclusion');
    exact(item, ['repository_id', 'work_package_id', 'engineer_id', 'blockers', 'attempt_count', 'last_outcome', 'next_eligible_at', 'blocker_owner'], 'exclusion');
    if (!Array.isArray(item.blockers)) invalid('exclusion.blockers is invalid');
    const blockers = (item.blockers as readonly unknown[]).map((code) => {
      if (!['profile_capability_mismatch', 'binding_inactive', 'fleet_offer_unavailable', 'dependency_not_ready',
        'dependency_authority_unavailable', 'concurrency_unavailable', 'active_claim_limit', 'retry_backoff',
        'retry_exhausted', 'retry_forbidden', 'attempt_reconciliation_required', 'attempt_authority_unavailable'].includes(String(code))) {
        invalid('exclusion.blockers contains an invalid code');
      }
      return code as EngineerOfferBlockerCode;
    });
    if (new Set(blockers).size !== blockers.length) invalid('exclusion.blockers repeats a code');
    if (string(item.repository_id, 'exclusion.repository_id', REPOSITORY_ID) !== repositoryId
      || string(item.engineer_id, 'exclusion.engineer_id', ENGINEER_ID) !== engineerId) {
      invalid('exclusion does not belong to this offers document');
    }
    return Object.freeze({
      repository_id: repositoryId,
      work_package_id: string(item.work_package_id, 'exclusion.work_package_id', WORK_PACKAGE_ID),
      engineer_id: engineerId,
      blockers: Object.freeze(blockers),
      attempt_count: integer(item.attempt_count, 'exclusion.attempt_count', 0, 100),
      last_outcome: item.last_outcome === null || ENGINEER_OFFER_OUTCOMES.includes(item.last_outcome as EngineerOfferOutcome) ? item.last_outcome as EngineerOfferOutcome | null : invalid('exclusion.last_outcome is invalid'),
      next_eligible_at: item.next_eligible_at === null ? null : string(item.next_eligible_at, 'exclusion.next_eligible_at', OPAQUE),
      blocker_owner: item.blocker_owner === 'none' || item.blocker_owner === 'user' || item.blocker_owner === 'operator' ? item.blocker_owner : invalid('exclusion.blocker_owner is invalid'),
    });
  });
  const basis = {
    protocol: ENGINEER_OFFER_PROTOCOL,
    kind: ENGINEER_OFFERS_KIND,
    repository_id: repositoryId,
    engineer_id: engineerId,
    lane: input.lane as WorkGraphLane | 'unclassified',
    work_graph_revision: input.work_graph_revision as string | null,
    offers,
    exclusions,
  };
  const revision = string(input.snapshot_revision, 'snapshot_revision', DIGEST);
  if (revision !== engineerSha256(canonicalEngineerJson(basis))) invalid('Engineer offers snapshot revision is invalid');
  return Object.freeze({ ...basis, offers: Object.freeze(offers), exclusions: Object.freeze(exclusions), snapshot_revision: revision });
}
