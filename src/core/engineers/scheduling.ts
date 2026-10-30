import type { AdmittedTaskSession, AdmittedTaskSessions } from '../sessions/task-sessions';
import type { ExternalSourceProjectionV1 } from '../external-sources/projection';
import type { ProviderIssueObservationV1 } from '../external-sources/issue-observation';
import { validateRequiredPullRequest, type RequiredPullRequestV2 } from '../integration/product-acceptance';
import { canonicalEngineerJson, engineerSha256 } from './profile-binding';

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const REPOSITORY_ID = /^repo_[0-9a-f]{16}$/u;
const WORK_PACKAGE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/u;
const CAPABILITY_ID = /^capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const ENGINEER_ID = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_TOKEN = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const OPAQUE = /^[^\u0000-\u001f\u007f]{1,512}$/u;

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

export interface WorkPackageDefinitionV1 {
  readonly work_package_id: string;
  readonly primary_capability: string;
  readonly depends_on: readonly WorkPackageDependencyV1[];
  readonly priority: number;
  readonly concurrency: { readonly scope: 'repo'; readonly key: string };
  readonly integration_group: string | null;
  readonly required_acceptance: readonly WorkPackageAcceptancePolicyV1[];
  readonly rollback_boundary: WorkPackageRollbackBoundaryV1;
  readonly retry_policy: WorkPackageRetryPolicyV1;
}

export type DependencyObservationStatus = 'satisfied' | 'unsatisfied' | 'authority_unavailable';

export type EngineerSchedulingErrorCode =
  | 'provider_scheduling_invalid'
  | 'provider_work_graph_missing'
  | 'work_graph_invalid'
  | 'work_graph_reference_mismatch'
  | 'engineer_offer_stale';

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

/** The scheduler selects a profile explicitly. Actor identity is never a profile selector. */
export interface EngineerSchedulingProfile {
  readonly engineer_id: string;
  readonly capability_id: string;
  readonly engineer_contract_revision: string;
}
export type AdmittedEngineerSelection =
  | { readonly state: 'unassigned' }
  | { readonly state: 'selected' | 'profile_missing' | 'profile_revision_changed'; readonly engineer_id: string; readonly engineer_contract_revision: string };
export interface AdmittedEngineerSession {
  readonly session: AdmittedTaskSession;
  readonly selection: AdmittedEngineerSelection;
}
export interface ProviderEngineerTask {
  readonly provider_repository_id: string;
  readonly issue_id: string;
  readonly issue: ProviderIssueObservationV1 | null;
  readonly sessions: readonly AdmittedEngineerSession[];
}
export interface ProviderEngineerSchedulingSnapshot {
  readonly protocol: 2;
  readonly kind: 'provider_engineer_scheduling';
  readonly repository_id: string;
  readonly profiles: readonly EngineerSchedulingProfile[];
  readonly tasks: readonly ProviderEngineerTask[];
  readonly source_revision: string;
}
/** Observational join only: provider status and admission evidence do not grant acquisition. */
export function projectProviderEngineerScheduling(input: {
  readonly repository_id: string;
  readonly issues: ExternalSourceProjectionV1;
  readonly sessions: AdmittedTaskSessions;
  readonly profiles: readonly EngineerSchedulingProfile[];
}): ProviderEngineerSchedulingSnapshot {
  if (input.issues.registered_repository_id !== input.repository_id || input.sessions.repository_id !== input.repository_id) {
    throw new EngineerSchedulingError('provider_scheduling_invalid', 'provider scheduling repository mismatch');
  }
  const profiles = [...input.profiles].sort((a, b) => a.engineer_id.localeCompare(b.engineer_id));
  if (new Set(profiles.map(profile => profile.engineer_id)).size !== profiles.length) {
    throw new EngineerSchedulingError('provider_scheduling_invalid', 'duplicate engineer profile');
  }
  const key = (repository: string, issue: string) => JSON.stringify([repository, issue]);
  const tasks = new Map<string, { provider_repository_id: string; issue_id: string; issue: ProviderIssueObservationV1 | null; sessions: AdmittedEngineerSession[] }>();
  for (const entry of input.issues.issues) {
    tasks.set(key(entry.provider_repository_id, entry.provider_issue_id), {
      provider_repository_id: entry.provider_repository_id, issue_id: entry.provider_issue_id,
      issue: entry.latest_observation, sessions: [],
    });
  }
  for (const session of input.sessions.sessions) {
    const selector = session.selector;
    if (selector.repository_id !== input.repository_id) throw new EngineerSchedulingError('provider_scheduling_invalid', 'session repository mismatch');
    const identity = key(selector.provider_repository_id, selector.issue_id);
    if (!tasks.has(identity)) tasks.set(identity, { provider_repository_id: selector.provider_repository_id, issue_id: selector.issue_id, issue: null, sessions: [] });
    const task = tasks.get(identity)!;
    const selected = session.profile_selection;
    let selection: AdmittedEngineerSelection = { state: 'unassigned' };
    if (selected.state === 'selected') {
      const profile = profiles.find(item => item.engineer_id === selected.engineer_id);
      selection = { engineer_id: selected.engineer_id, engineer_contract_revision: selected.engineer_contract_revision,
        state: !profile ? 'profile_missing' : profile.engineer_contract_revision !== selected.engineer_contract_revision ? 'profile_revision_changed' : 'selected' };
    }
    task.sessions.push({ session, selection });
    tasks.set(identity, task);
  }
  const rows = [...tasks.values()].sort((a, b) => key(a.provider_repository_id, a.issue_id).localeCompare(key(b.provider_repository_id, b.issue_id)))
    .map(task => ({ ...task, sessions: task.sessions.sort((a, b) => a.session.selector.session_binding_sha256.localeCompare(b.session.selector.session_binding_sha256)) }));
  const basis = { protocol: 2 as const, kind: 'provider_engineer_scheduling' as const, repository_id: input.repository_id, profiles, tasks: rows };
  return Object.freeze({ ...basis, source_revision: engineerSha256(canonicalEngineerJson(basis)) });
}

export type ProviderDependencyState = Exclude<WorkPackageDependencyState, 'canonical_done'> | 'provider_closed';
export interface ProviderWorkPackageDependency extends Omit<WorkPackageDependencyV1, 'required_state'> {
  readonly required_state: ProviderDependencyState;
}
export interface ProviderRetryPolicy extends Omit<WorkPackageRetryPolicyV1, 'retryable_failure_classes'> { readonly retryable_failure_classes: readonly ('transient_failure' | 'external_blocked' | 'admission_changed')[] }
export interface ProviderWorkPackageDefinition extends Omit<WorkPackageDefinitionV1, 'depends_on' | 'retry_policy'> {
  readonly retry_policy: ProviderRetryPolicy;
  readonly execution_surface: 'admitted_session';
  readonly task: { readonly provider_repository_id: string; readonly issue_id: string };
  readonly depends_on: readonly ProviderWorkPackageDependency[];
}
export interface ProviderWorkGraphV2 {
  readonly protocol: 2;
  readonly kind: 'repo-harness-provider-work-graph';
  readonly repository_id: string;
  readonly work_packages: readonly ProviderWorkPackageDefinition[];
}
export interface ProjectedProviderWorkPackage extends ProviderWorkPackageDefinition {
  readonly repository_id: string;
  readonly work_package_revision: string;
  readonly issue: ProviderIssueObservationV1 | null;
}
export interface ProjectedProviderWorkGraph {
  readonly protocol: 2;
  readonly kind: 'repo-harness-provider-work-graph';
  readonly repository_id: string;
  readonly graph_path: string;
  readonly commit: string;
  readonly work_graph_revision: string;
  readonly work_packages: readonly ProjectedProviderWorkPackage[];
}
export interface ProviderDependencyObservation extends ProviderWorkPackageDependency {
  readonly status: DependencyObservationStatus;
  readonly authority_revision: string | null;
}
function parseProviderDependency(value: unknown, index: number): ProviderWorkPackageDependency {
  const label = `depends_on[${index}]`, input = record(value, label);
  exact(input, ['repository_id', 'work_package_id', 'required_state', 'acceptance_authority'], label);
  const state = input.required_state;
  if (state !== 'provider_closed' && state !== 'module_accepted' && state !== 'publication_integrated' && state !== 'product_accepted') invalid(`${label}.required_state is invalid`);
  return { repository_id: string(input.repository_id, `${label}.repository_id`, REPOSITORY_ID),
    work_package_id: string(input.work_package_id, `${label}.work_package_id`, WORK_PACKAGE_ID), required_state: state,
    acceptance_authority: parseDependencyAuthority(input.acceptance_authority, state === 'provider_closed' ? null : DEPENDENCY_AUTHORITY_KIND_BY_STATE[state], `${label}.acceptance_authority`) };
}

function parseProviderWorkPackage(value: unknown, index: number): ProviderWorkPackageDefinition {
  const input = record(value, `work_packages[${index}]`);
  exact(input, [
    'work_package_id', 'task', 'primary_capability', 'depends_on', 'priority',
    'concurrency', 'execution_surface', 'integration_group', 'required_acceptance',
    'rollback_boundary', 'retry_policy',
  ], `work_packages[${index}]`);
  if (!Array.isArray(input.depends_on)) invalid(`work_packages[${index}].depends_on must be an array`);
  if (!Array.isArray(input.required_acceptance) || input.required_acceptance.length === 0) {
    invalid(`work_packages[${index}].required_acceptance must be a non-empty array`);
  }
  const task = record(input.task, 'task');
  exact(task, ['provider_repository_id', 'issue_id'], 'task');
  const concurrency = record(input.concurrency, `work_packages[${index}].concurrency`);
  exact(concurrency, ['scope', 'key'], `work_packages[${index}].concurrency`);
  if (concurrency.scope !== 'repo') invalid(`work_packages[${index}].concurrency.scope is unsupported`);
  if (input.execution_surface !== 'admitted_session') invalid(`work_packages[${index}].execution_surface is invalid`);
  const dependencies = input.depends_on.map(parseProviderDependency);
  const dependencyKeys = dependencies.map((entry) => `${entry.repository_id}:${entry.work_package_id}`);
  if (new Set(dependencyKeys).size !== dependencyKeys.length) invalid(`work_packages[${index}].depends_on contains duplicates`);
  const policies = input.required_acceptance.map(parsePolicy);
  const policyKeys = policies.map((entry) => `${entry.gate}:${entry.policy_id}`);
  if (new Set(policyKeys).size !== policyKeys.length) invalid(`work_packages[${index}].required_acceptance contains duplicates`);
  return Object.freeze({
    work_package_id: string(input.work_package_id, `work_packages[${index}].work_package_id`, WORK_PACKAGE_ID),
    task: Object.freeze({ provider_repository_id: string(task.provider_repository_id, 'task.provider_repository_id', /^[1-9][0-9]*$/), issue_id: string(task.issue_id, 'task.issue_id', /^[1-9][0-9]*$/) }),
    primary_capability: string(input.primary_capability, `work_packages[${index}].primary_capability`, CAPABILITY_ID),
    depends_on: Object.freeze(dependencies),
    priority: integer(input.priority, `work_packages[${index}].priority`, 0, 100),
    concurrency: Object.freeze({ scope: 'repo', key: string(concurrency.key, `work_packages[${index}].concurrency.key`, SAFE_TOKEN) }),
    execution_surface: 'admitted_session',
    integration_group: input.integration_group === null
      ? null
      : string(input.integration_group, `work_packages[${index}].integration_group`, SAFE_TOKEN),
    required_acceptance: Object.freeze(policies),
    rollback_boundary: parseRollback(input.rollback_boundary),
    retry_policy: validateProviderRetryPolicy(input.retry_policy, index),
  });
}

export function validateProviderWorkGraph(value: unknown): ProviderWorkGraphV2 {
  const input = record(value, 'provider work graph');
  exact(input, ['protocol', 'kind', 'repository_id', 'work_packages'], 'provider work graph');
  if (input.protocol !== 2 || input.kind !== 'repo-harness-provider-work-graph' || !Array.isArray(input.work_packages) || input.work_packages.length > 200) invalid('authored V2 provider work graph required');
  const packages = input.work_packages.map(parseProviderWorkPackage);
  if (new Set(packages.map(item => item.work_package_id)).size !== packages.length
    || new Set(packages.map(item => JSON.stringify(item.task))).size !== packages.length) invalid('duplicate provider work package identity');
  return { protocol: 2, kind: 'repo-harness-provider-work-graph', repository_id: string(input.repository_id, 'repository_id', REPOSITORY_ID), work_packages: packages };
}
export function projectProviderWorkGraph(value: unknown, issues: ExternalSourceProjectionV1, source: { commit: string; graph_path: string }): ProjectedProviderWorkGraph {
  const graph = validateProviderWorkGraph(value);
  if (issues.registered_repository_id !== graph.repository_id) invalid('provider graph repository mismatch');
  const commit = string(source.commit, 'commit', /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
  const graphPath = safeRepoPath(source.graph_path, 'graph_path', '.json');
  return { protocol: 2, kind: graph.kind, repository_id: graph.repository_id, commit, graph_path: graphPath,
    work_graph_revision: engineerSha256(canonicalEngineerJson(graph)), work_packages: graph.work_packages.map(item => ({ ...item,
      repository_id: graph.repository_id, work_package_revision: engineerSha256(canonicalEngineerJson(item)),
      issue: issues.issues.find(issue => issue.provider_repository_id === item.task.provider_repository_id && issue.provider_issue_id === item.task.issue_id)?.latest_observation ?? null,
    })) };
}
export function validateProviderWorkGraphTopology(graphs: readonly ProjectedProviderWorkGraph[]): void {
  const packages = new Map<string, ProjectedProviderWorkPackage>(graphs.flatMap(graph => graph.work_packages.map(item => [`${item.repository_id}:${item.work_package_id}`, item] as const)));
  const active = new Set<string>(), done = new Set<string>();
  const visit = (key: string): void => {
    if (active.has(key)) invalid('provider work graph dependency cycle');
    if (done.has(key)) return;
    const item = packages.get(key);
    if (!item) invalid(`provider work package dependency missing: ${key}`);
    active.add(key);
    for (const dependency of item.depends_on) visit(`${dependency.repository_id}:${dependency.work_package_id}`);
    active.delete(key); done.add(key);
  };
  for (const key of packages.keys()) visit(key);
}

export interface ProviderIntegrationDependencyReferenceV3 {
  readonly protocol: 3;
  readonly provider_repository_id: string;
  readonly issue_id: string;
  readonly final_head_sha: string;
  readonly final_tree_sha: string;
  readonly required_pull_requests: readonly RequiredPullRequestV2[];
  readonly product: { readonly projection_sha256: string; readonly approved_prd_ref: string; readonly approved_prd_sha256: string; readonly review_authority: ModuleAcceptanceReferenceV1 } | null;
}

export function validateProviderIntegrationDependencyReference(value: unknown): ProviderIntegrationDependencyReferenceV3 {
  const label = 'integration dependency reference';
  const input = record(value, label);
  exact(input, ['protocol', 'provider_repository_id', 'issue_id', 'final_head_sha', 'final_tree_sha', 'required_pull_requests', 'product'], label);
  if (input.protocol !== 3) invalid(`${label}.protocol must be 3`);
  if (!Array.isArray(input.required_pull_requests) || input.required_pull_requests.length === 0) invalid(`${label}.required_pull_requests must be non-empty`);
  const selected = input.required_pull_requests.map(validateRequiredPullRequest);
  if (new Set(selected.map(pr => `${pr.provider_repository_id}:${pr.pr_number}`)).size !== selected.length) invalid(`${label} contains duplicate PRs`);
  let product: ProviderIntegrationDependencyReferenceV3['product'] = null;
  if (input.product !== null) {
    const item = record(input.product, `${label}.product`);
    exact(item, ['projection_sha256', 'approved_prd_ref', 'approved_prd_sha256', 'review_authority'], `${label}.product`);
    product = Object.freeze({ review_authority: validateModuleAcceptanceReference(item.review_authority), projection_sha256: string(item.projection_sha256, 'projection_sha256', DIGEST),
      approved_prd_ref: safeRepoPath(item.approved_prd_ref, 'approved_prd_ref'), approved_prd_sha256: string(item.approved_prd_sha256, 'approved_prd_sha256', DIGEST) });
  }
  return Object.freeze({ protocol: 3, provider_repository_id: string(input.provider_repository_id, 'provider_repository_id', /^[1-9][0-9]*$/),
    issue_id: string(input.issue_id, 'issue_id', /^[1-9][0-9]*$/),
    final_head_sha: string(input.final_head_sha, 'final_head_sha', /^[0-9a-f]{40}$/),
    final_tree_sha: string(input.final_tree_sha, 'final_tree_sha', /^[0-9a-f]{40}$/),
    required_pull_requests: Object.freeze(selected), product });
}

export function validateProviderRetryPolicy(value: unknown, index = 0): ProviderRetryPolicy {
  const label = `work_packages[${index}].retry_policy`; const input = record(value, label);
  exact(input, ['max_automated_attempts', 'retryable_failure_classes', 'backoff', 'attention_after_seconds', 'revision_reset'], label);
  if (!Array.isArray(input.retryable_failure_classes) || input.retryable_failure_classes.length === 0) invalid(`${label}.retryable_failure_classes must be a non-empty array`);
  const classes = input.retryable_failure_classes.map((value, classIndex) => {
    if (!['transient_failure', 'external_blocked', 'admission_changed'].includes(String(value))) invalid(`${label}.retryable_failure_classes[${classIndex}] is invalid`);
    return value as ProviderRetryPolicy['retryable_failure_classes'][number];
  });
  if (new Set(classes).size !== classes.length) invalid(`${label}.retryable_failure_classes contains duplicates`);
  const backoff = record(input.backoff, `${label}.backoff`); exact(backoff, ['kind', 'initial_seconds', 'maximum_seconds'], `${label}.backoff`);
  if (backoff.kind !== 'fixed' && backoff.kind !== 'exponential') invalid(`${label}.backoff.kind is invalid`);
  const initial = integer(backoff.initial_seconds, `${label}.backoff.initial_seconds`, 1, 86_400);
  const maximum = integer(backoff.maximum_seconds, `${label}.backoff.maximum_seconds`, initial, 604_800);
  if (input.revision_reset !== 'reset_on_work_package_revision') invalid(`${label}.revision_reset is invalid`);
  return Object.freeze({ max_automated_attempts: integer(input.max_automated_attempts, `${label}.max_automated_attempts`, 1, 100), retryable_failure_classes: Object.freeze(classes), backoff: Object.freeze({ kind: backoff.kind, initial_seconds: initial, maximum_seconds: maximum }), attention_after_seconds: integer(input.attention_after_seconds, `${label}.attention_after_seconds`, 1, 2_592_000), revision_reset: 'reset_on_work_package_revision' });
}

export type ProviderEngineerOfferBlocker = 'provider_unavailable' | 'provider_closed' | 'provider_ineligible'
  | 'profile_unassigned' | 'profile_revision_changed' | 'capability_mismatch' | 'dependency_not_ready'
  | 'dependency_authority_unavailable' | 'session_conflict';
export interface ProviderEngineerOffer {
  readonly provider_repository_id: string;
  readonly issue_id: string;
  readonly source_revision: string | null;
  readonly eligible: boolean;
  readonly blockers: readonly ProviderEngineerOfferBlocker[];
}
export interface ProviderEngineerOffersV2 {
  readonly protocol: 2;
  readonly kind: 'provider_engineer_offers';
  readonly repository_id: string;
  readonly engineer_id: string;
  readonly engineer_contract_revision: string;
  readonly session_binding_sha256: string;
  readonly authorization_revision: number;
  readonly planning_revision: string;
  readonly offers: readonly ProviderEngineerOffer[];
  readonly snapshot_revision: string;
}
export function buildProviderEngineerOffers(input: Omit<ProviderEngineerOffersV2, 'protocol' | 'kind' | 'snapshot_revision'>): ProviderEngineerOffersV2 {
  const basis = { protocol: 2 as const, kind: 'provider_engineer_offers' as const, ...input };
  return validateProviderEngineerOffers({ ...basis, snapshot_revision: engineerSha256(canonicalEngineerJson(basis)) });
}
export function validateProviderEngineerOffers(value: unknown): ProviderEngineerOffersV2 {
  const input = record(value, 'provider engineer offers');
  exact(input, ['protocol', 'kind', 'repository_id', 'engineer_id', 'engineer_contract_revision', 'session_binding_sha256', 'authorization_revision', 'planning_revision', 'offers', 'snapshot_revision'], 'provider engineer offers');
  if (input.protocol !== 2 || input.kind !== 'provider_engineer_offers' || !Array.isArray(input.offers) || input.offers.length > 200) invalid('provider engineer offers protocol or rows invalid');
  const allowed: readonly ProviderEngineerOfferBlocker[] = ['provider_unavailable', 'provider_closed', 'provider_ineligible', 'profile_unassigned', 'profile_revision_changed', 'capability_mismatch', 'dependency_not_ready', 'dependency_authority_unavailable', 'session_conflict'];
  const seen = new Set<string>();
  const offers = input.offers.map(raw => {
    const item = record(raw, 'provider offer'); exact(item, ['provider_repository_id', 'issue_id', 'source_revision', 'eligible', 'blockers'], 'provider offer');
    const repository = string(item.provider_repository_id, 'provider_repository_id', /^[1-9][0-9]*$/), issue = string(item.issue_id, 'issue_id', /^[1-9][0-9]*$/);
    const key = `${repository}:${issue}`; if (seen.has(key)) invalid('duplicate provider offer'); seen.add(key);
    if (!Array.isArray(item.blockers) || item.blockers.some(blocker => !allowed.includes(blocker)) || new Set(item.blockers).size !== item.blockers.length) invalid('provider offer blockers invalid');
    if (typeof item.eligible !== 'boolean' || item.eligible !== (item.blockers.length === 0)) invalid('provider offer eligibility disagrees with blockers');
    const revision = item.source_revision === null ? null : string(item.source_revision, 'source_revision', DIGEST);
    if (revision === null && !item.blockers.includes('provider_unavailable')) invalid('missing provider observation cannot be eligible');
    return { provider_repository_id: repository, issue_id: issue, source_revision: revision, eligible: item.eligible, blockers: item.blockers as ProviderEngineerOfferBlocker[] };
  });
  const basis = { protocol: 2 as const, kind: 'provider_engineer_offers' as const,
    repository_id: string(input.repository_id, 'repository_id', REPOSITORY_ID), engineer_id: string(input.engineer_id, 'engineer_id', ENGINEER_ID),
    engineer_contract_revision: string(input.engineer_contract_revision, 'engineer_contract_revision', DIGEST),
    session_binding_sha256: string(input.session_binding_sha256, 'session_binding_sha256', DIGEST),
    authorization_revision: integer(input.authorization_revision, 'authorization_revision', 0, Number.MAX_SAFE_INTEGER), planning_revision: string(input.planning_revision, 'planning_revision', DIGEST), offers };
  const revision = string(input.snapshot_revision, 'snapshot_revision', DIGEST);
  if (revision !== engineerSha256(canonicalEngineerJson(basis))) invalid('provider offer snapshot digest changed');
  return Object.freeze({ ...basis, snapshot_revision: revision });
}
