import type { ProviderEngineerSchedulingSnapshot, ProjectedProviderWorkPackage, ProviderDependencyObservation } from '../engineers/scheduling';
import { decodeAdmittedScheduling } from './organization-snapshot';
export const PLANNING_MAX_TASKS = 200;
export const PLANNING_MAX_REPOSITORIES = 8;
export const PLANNING_MAX_EDGES = 1000;
export const PLANNING_MAX_BYTES = 2 * 1024 * 1024;
export interface OperatorPlanningPackage extends ProjectedProviderWorkPackage { readonly dependencies: readonly ProviderDependencyObservation[] }
export interface OperatorPlanningGraph {
  readonly packages: readonly OperatorPlanningPackage[];
  readonly sources: readonly { readonly repository_id: string; readonly commit: string; readonly graph_path: string; readonly work_graph_revision: string }[];
}
export interface OperatorPlanningSnapshot {
  readonly protocol: 2;
  readonly kind: 'operator_planning_snapshot';
  readonly repository_id: string;
  readonly scheduling: ProviderEngineerSchedulingSnapshot;
  readonly graph: { readonly status: 'observed'; readonly snapshot: OperatorPlanningGraph }
    | { readonly status: 'unavailable'; readonly code: 'needs_provider_graph' | 'source_unavailable' };
  readonly observation: { readonly observed_at: string; readonly authorization_revision: number };
}
function bad(): never { throw new Error('Invalid scoped Planning snapshot'); }
function obj(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) bad();
  return value as Record<string, unknown>;
}
function text(value: unknown, pattern = /^[^\u0000-\u001f\u007f]{1,2048}$/): string { if (typeof value !== 'string' || !pattern.test(value)) bad(); return value; }
function array(value: unknown, maximum: number): unknown[] { if (!Array.isArray(value) || value.length > maximum) bad(); return value; }
const hash = (value: unknown) => text(value, /^sha256:[0-9a-f]{64}$/);
const repo = (value: unknown) => text(value, /^repo_[0-9a-f]{16}$/);
const packageId = (value: unknown) => text(value, /^[a-z0-9][a-z0-9-]{0,127}$/);
function path(value: unknown): string { const result = text(value); if (result.startsWith('/') || result.startsWith('-') || result.includes('\\') || result.split('/').some(part => !part || part === '.' || part === '..')) bad(); return result; }
function dependency(value: unknown, observation: boolean): Record<string, unknown> {
  const entry = obj(value, ['repository_id', 'work_package_id', 'required_state', 'acceptance_authority', ...(observation ? ['status', 'authority_revision'] : [])]);
  repo(entry.repository_id); packageId(entry.work_package_id);
  const kinds = { provider_closed: null, module_accepted: 'module_acceptance', publication_integrated: 'provider_integration', product_accepted: 'product_acceptance' } as const;
  if (typeof entry.required_state !== 'string' || !(entry.required_state in kinds)) bad();
  const required = kinds[entry.required_state as keyof typeof kinds];
  if (required === null) { if (entry.acceptance_authority !== null) bad(); }
  else { const authority = obj(entry.acceptance_authority, ['authority_kind', 'subject_ref', 'subject_revision']); if (authority.authority_kind !== required) bad(); path(authority.subject_ref); hash(authority.subject_revision); }
  if (observation) {
    if (!['satisfied', 'unsatisfied', 'authority_unavailable'].includes(entry.status as string)) bad();
    if (entry.status === 'authority_unavailable') { if (entry.authority_revision !== null) bad(); } else hash(entry.authority_revision);
  }
  return entry;
}
/** Transport validation only. Server readers prove graph bytes and dependency authority. */
export function decodeOperatorPlanningSnapshot(value: unknown, repositoryId: string): OperatorPlanningSnapshot {
  if (new TextEncoder().encode(JSON.stringify(value)).length > PLANNING_MAX_BYTES) bad();
  const input = obj(value, ['protocol', 'kind', 'repository_id', 'scheduling', 'graph', 'observation']);
  if (input.protocol !== 2 || input.kind !== 'operator_planning_snapshot' || input.repository_id !== repositoryId) bad();
  const scheduling = decodeAdmittedScheduling(input.scheduling, repositoryId);
  const observation = obj(input.observation, ['observed_at', 'authorization_revision']);
  if (!Number.isFinite(Date.parse(text(observation.observed_at))) || !Number.isSafeInteger(observation.authorization_revision) || (observation.authorization_revision as number) < 0) bad();
  const source = input.graph as Record<string, unknown>;
  if (source?.status === 'unavailable') {
    obj(source, ['status', 'code']); if (!['needs_provider_graph', 'source_unavailable'].includes(source.code as string)) bad();
  } else {
    obj(source, ['status', 'snapshot']); if (source.status !== 'observed') bad();
    const graph = obj(source.snapshot, ['packages', 'sources']);
    const repositories = new Set<string>();
    for (const raw of array(graph.sources, PLANNING_MAX_REPOSITORIES)) {
      const entry = obj(raw, ['repository_id', 'commit', 'graph_path', 'work_graph_revision']);
      const id = repo(entry.repository_id); if (repositories.has(id)) bad(); repositories.add(id);
      text(entry.commit, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/); path(entry.graph_path); hash(entry.work_graph_revision);
    }
    if (!repositories.has(repositoryId)) bad();
    let edges = 0; const ids = new Set<string>();
    for (const raw of array(graph.packages, PLANNING_MAX_TASKS)) {
      const item = obj(raw, ['work_package_id', 'task', 'primary_capability', 'depends_on', 'priority', 'concurrency', 'execution_surface', 'integration_group', 'required_acceptance', 'rollback_boundary', 'retry_policy', 'repository_id', 'work_package_revision', 'issue', 'dependencies']);
      const id = packageId(item.work_package_id); if (ids.has(id) || item.repository_id !== repositoryId) bad(); ids.add(id); hash(item.work_package_revision);
      const task = obj(item.task, ['provider_repository_id', 'issue_id']); text(task.provider_repository_id, /^[1-9][0-9]*$/); text(task.issue_id, /^[1-9][0-9]*$/);
      const joined = scheduling.tasks.find(taskRow => taskRow.provider_repository_id === task.provider_repository_id && taskRow.issue_id === task.issue_id);
      if (JSON.stringify(item.issue) !== JSON.stringify(joined?.issue ?? null)) bad();
      text(item.primary_capability, /^capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/);
      if (!Number.isSafeInteger(item.priority) || (item.priority as number) < 0 || (item.priority as number) > 100 || item.execution_surface !== 'admitted_session') bad();
      const concurrency = obj(item.concurrency, ['scope', 'key']); if (concurrency.scope !== 'repo') bad(); text(concurrency.key);
      if (item.integration_group !== null) text(item.integration_group);
      const policies = array(item.required_acceptance, 200); if (!policies.length) bad();
      for (const rawPolicy of policies) { const policy = obj(rawPolicy, ['gate', 'policy_id', 'policy_ref', 'policy_revision']); if (!['module', 'product'].includes(policy.gate as string)) bad(); text(policy.policy_id); path(policy.policy_ref); hash(policy.policy_revision); }
      const rollback = obj(item.rollback_boundary, ['kind', 'boundary_id', 'boundary_ref', 'boundary_revision']); if (rollback.kind !== 'work_package') bad(); text(rollback.boundary_id); path(rollback.boundary_ref); hash(rollback.boundary_revision);
      const retry = obj(item.retry_policy, ['max_automated_attempts', 'retryable_failure_classes', 'backoff', 'attention_after_seconds', 'revision_reset']);
      for (const name of ['max_automated_attempts', 'attention_after_seconds']) if (!Number.isSafeInteger(retry[name]) || (retry[name] as number) < 1) bad();
      for (const failure of array(retry.retryable_failure_classes, 3)) if (!['transient_failure', 'external_blocked', 'admission_changed'].includes(failure as string)) bad();
      const backoff = obj(retry.backoff, ['kind', 'initial_seconds', 'maximum_seconds']); if (!['fixed', 'exponential'].includes(backoff.kind as string) || !Number.isSafeInteger(backoff.initial_seconds) || !Number.isSafeInteger(backoff.maximum_seconds) || (backoff.initial_seconds as number) < 1 || (backoff.maximum_seconds as number) < (backoff.initial_seconds as number) || retry.revision_reset !== 'reset_on_work_package_revision') bad();
      const declared = array(item.depends_on, PLANNING_MAX_EDGES).map(raw => dependency(raw, false));
      const resolved = array(item.dependencies, PLANNING_MAX_EDGES).map(raw => dependency(raw, true)); edges += declared.length;
      if (edges > PLANNING_MAX_EDGES || declared.length !== resolved.length) bad();
      for (let index = 0; index < declared.length; index++) { const { status, authority_revision, ...binding } = resolved[index]!; if (JSON.stringify(binding) !== JSON.stringify(declared[index])) bad(); }
    }
  }
  return value as OperatorPlanningSnapshot;
}
