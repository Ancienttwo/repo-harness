import { decodeOperatorTaskContext, isOperatorTaskCanonical, type OperatorTaskContext } from './task-context';
import type { OperatorCollaborationSourceObservation } from './collaboration-snapshot';
import type { ProjectedWorkPackageV1, WorkPackageDependencyObservationV1 } from '../engineers/scheduling';

export const PLANNING_MAX_TASKS = 200;
export const PLANNING_MAX_REPOSITORIES = 8;
export const PLANNING_MAX_EDGES = 1000;
export const PLANNING_MAX_BYTES = 2 * 1024 * 1024;
export interface OperatorPlanningPackage extends Pick<ProjectedWorkPackageV1,
  'work_package_id' | 'work_package_revision' | 'task_id' | 'task_revision' | 'primary_capability' | 'required_acceptance' | 'rollback_boundary'> {
  readonly dependencies: readonly WorkPackageDependencyObservationV1[];
}
export interface OperatorPlanningGraph {
  readonly lane: 'unclassified' | 'generic-v1' | 'engineering-v2';
  readonly work_graph_revision: string | null;
  readonly packages: readonly OperatorPlanningPackage[];
  readonly sources: readonly { readonly repository_id: string; readonly commit: string; readonly work_graph_revision: string }[];
}
export interface OperatorPlanningSnapshot {
  readonly protocol: 1;
  readonly kind: 'operator_planning_snapshot';
  readonly repository_id: string;
  readonly canonical: OperatorTaskContext['canonical'] | null;
  readonly tasks: readonly OperatorTaskContext[];
  readonly graph: OperatorCollaborationSourceObservation<OperatorPlanningGraph>;
  readonly observation: { readonly observed_at: string; readonly authorization_revision: number; readonly board_revision: string | null };
}

/** This decoder validates transport shape and joins. Canonical references,
 * topology and dependency verdicts remain under their existing server owners. */
export function decodeOperatorPlanningSnapshot(value: unknown, repositoryId: string): OperatorPlanningSnapshot {
  const bad = (): never => { throw new Error('Invalid scoped Planning snapshot'); };
  const obj = (v: unknown, keys: readonly string[]): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k))) return bad();
    return v as Record<string, unknown>;
  };
  const str = (v: unknown, regex: RegExp): string => typeof v === 'string' && regex.test(v) ? v : bad();
  const hash = (v: unknown) => str(v, /^sha256:[0-9a-f]{64}$/u);
  const oid = (v: unknown) => str(v, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
  const text = (v: unknown) => str(v, /^[^\u0000-\u001f\u007f]{1,512}$/u);
  const repo = (v: unknown) => str(v, /^repo_[0-9a-f]{16}$/u);
  const wp = (v: unknown) => str(v, /^[a-z0-9][a-z0-9-]{0,127}$/u);
  const path = (v: unknown) => { const s = text(v); if (s.startsWith('/') || s.startsWith('-') || s.includes('\\') || s.split('/').some(p => p === '' || p === '.' || p === '..')) return bad(); return s; };
  const instant = (v: unknown) => { const s = text(v); if (!Number.isFinite(Date.parse(s))) return bad(); return s; };
  const array = (v: unknown, max: number): unknown[] => Array.isArray(v) && v.length <= max ? v : bad();
  if (new TextEncoder().encode(JSON.stringify(value)).length > PLANNING_MAX_BYTES) return bad();
  const v = obj(value, ['protocol','kind','repository_id','canonical','tasks','graph','observation']);
  if (v.protocol !== 1 || v.kind !== 'operator_planning_snapshot' || v.repository_id !== repositoryId) return bad();
  const o = obj(v.observation, ['observed_at','authorization_revision','board_revision']);
  instant(o.observed_at);
  if (!Number.isSafeInteger(o.authorization_revision) || (o.authorization_revision as number) < 0) return bad();
  let canonical: OperatorTaskContext['canonical'] | null = null;
  if (v.canonical !== null) {
    if (!isOperatorTaskCanonical(v.canonical)) return bad();
    canonical = v.canonical;
    hash(o.board_revision);
  } else if (o.board_revision !== null) return bad();
  const ids = new Map<string, OperatorTaskContext>();
  const tasks = array(v.tasks, PLANNING_MAX_TASKS).map(raw => {
    if (!raw || typeof raw !== 'object') return bad();
    const r = raw as Record<string, unknown>;
    const task = decodeOperatorTaskContext(raw, { repository_id:repositoryId,task_id:r.task_id as string,expected_task_revision:null });
    if (!canonical || (task.canonical.target_ref !== canonical.target_ref || task.canonical.commit !== canonical.commit || task.canonical.sprint_path !== canonical.sprint_path) || task.task.state === 'missing' || ids.has(task.task_id)
      || task.observation.authorization_revision !== o.authorization_revision || task.observation.board_revision !== o.board_revision || task.observation.observed_at !== o.observed_at) return bad();
    ids.set(task.task_id,task); return task;
  });
  const source = v.graph as Record<string, unknown>;
  if (!source || typeof source !== 'object') return bad();
  instant(source.observed_at);
  if (source.observed_at !== o.observed_at) return bad();
  if (source.status === 'unavailable') {
    obj(source,['status','observed_at','code']); if (source.code !== 'source_unavailable') return bad();
  } else {
    obj(source,['status','observed_at','snapshot']); if (source.status !== 'observed') return bad();
    const g = obj(source.snapshot,['lane','work_graph_revision','packages','sources']);
    if (!['unclassified','generic-v1','engineering-v2'].includes(g.lane as string)) return bad();
    const packages = array(g.packages,PLANNING_MAX_TASKS), sources = array(g.sources,PLANNING_MAX_REPOSITORIES);
    const seenSources = new Set<string>();
    for (const raw of sources) {
      const r = obj(raw,['repository_id','commit','work_graph_revision']);repo(r.repository_id);oid(r.commit);hash(r.work_graph_revision);
      if (seenSources.has(r.repository_id as string)) return bad();seenSources.add(r.repository_id as string);
      if (r.repository_id === repositoryId && (r.commit !== canonical?.commit || r.work_graph_revision !== g.work_graph_revision)) return bad();
    }
    if (g.lane === 'unclassified') { if (g.work_graph_revision !== null || packages.length || sources.length) return bad(); }
    else { hash(g.work_graph_revision); if (!canonical || !seenSources.has(repositoryId) || g.lane === 'generic-v1' && packages.length) return bad(); }
    const packageIds = new Set<string>(), taskIds = new Set<string>(); let edgeCount = 0;
    for (const raw of packages) {
      const p = obj(raw,['work_package_id','work_package_revision','task_id','task_revision','primary_capability','required_acceptance','rollback_boundary','dependencies']);
      wp(p.work_package_id);hash(p.work_package_revision);str(p.primary_capability,/^capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u);
      const task = ids.get(p.task_id as string);
      if (!task || task.task_revision !== p.task_revision || packageIds.has(p.work_package_id as string) || taskIds.has(task.task_id)) return bad();
      packageIds.add(p.work_package_id as string); taskIds.add(task.task_id);
      for (const rawPolicy of array(p.required_acceptance,100)) {
        const policy = obj(rawPolicy,['gate','policy_id','policy_ref','policy_revision']);
        if (policy.gate !== 'module' && policy.gate !== 'product') return bad();
        str(policy.policy_id,/^[a-z0-9][a-z0-9._:-]{0,127}$/u);path(policy.policy_ref);hash(policy.policy_revision);
      }
      const r = obj(p.rollback_boundary,['kind','boundary_id','boundary_ref','boundary_revision']);
      if (r.kind !== 'work_package') return bad();text(r.boundary_id);path(r.boundary_ref);hash(r.boundary_revision);
      const edges = array(p.dependencies,PLANNING_MAX_EDGES); edgeCount += edges.length;
      if (edgeCount > PLANNING_MAX_EDGES) return bad();
      const seenEdges = new Set<string>();
      for (const rawEdge of edges) {
        const e = obj(rawEdge,['repository_id','work_package_id','required_state','acceptance_authority','status','authority_revision']);
        repo(e.repository_id);wp(e.work_package_id);
        const key = JSON.stringify([e.repository_id,e.work_package_id,e.required_state]);
        if (seenEdges.has(key) || !seenSources.has(e.repository_id as string)) return bad();seenEdges.add(key);
        if (!['canonical_done','module_accepted','publication_integrated','product_accepted'].includes(e.required_state as string) || !['satisfied','unsatisfied','authority_unavailable'].includes(e.status as string)) return bad();
        if (e.status === 'authority_unavailable') { if (e.authority_revision !== null) return bad(); } else hash(e.authority_revision);
        const required = e.required_state === 'module_accepted' ? 'module_acceptance' : e.required_state === 'product_accepted' ? 'product_acceptance' : null;
        if (required === null) { if (e.acceptance_authority !== null) return bad(); }
        else { const a = obj(e.acceptance_authority,['authority_kind','subject_ref','subject_revision']);if (a.authority_kind !== required) return bad();path(a.subject_ref);hash(a.subject_revision); }
      }
    }
  }
  return { ...(value as OperatorPlanningSnapshot), canonical, tasks };
}
