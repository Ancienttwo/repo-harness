import type { BoardClaimV1, BoardLeaseState, TaskState } from '../state/types';
import type { TaskOfferBlockerV1, TaskOfferExecutionReadiness, TaskOfferPlanProofV1 } from '../fleet/task-offer';

export const TASK_CONTEXT_MAX_BYTES = 256 * 1024;
export const TASK_CONTEXT_FAILURES = ['unavailable','task_not_found','stale','too_large','busy','timeout'] as const;
export type TaskContextFailure = typeof TASK_CONTEXT_FAILURES[number];
export interface OperatorTaskContextRequest {
  readonly repository_id: string;
  readonly task_id: string;
  readonly expected_task_revision: string | null;
}
export interface OperatorTaskContext {
  readonly protocol: 1;
  readonly kind: 'operator_task_context';
  readonly repository_id: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly canonical: { readonly target_ref: string; readonly commit: string; readonly sprint_path: string };
  readonly task: { readonly title: string; readonly mode: string; readonly acceptance: string; readonly state: TaskState };
  readonly execution: {
    readonly lease_state: BoardLeaseState;
    readonly claim: Pick<BoardClaimV1, 'claim_id' | 'generation' | 'state' | 'branch' | 'target_ref'> | null;
  };
  readonly offer: {
    readonly execution_readiness: TaskOfferExecutionReadiness;
    readonly blockers: readonly TaskOfferBlockerV1[];
    readonly offer_revision: string;
    readonly plan: (TaskOfferPlanProofV1 & { readonly basis: 'registered_worktree' }) | null;
  };
  readonly observation: { readonly observed_at: string; readonly board_revision: string; readonly authorization_revision: number; readonly consistency: 'observed' };
}
const digest = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/u.test(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^sha256:[0-9a-f]{64}$/u.test(v);
const uuid = (v: unknown): boolean => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(v);
const text = (v: unknown, max = 8192): v is string => typeof v === 'string' && new TextEncoder().encode(v).length <= max && !v.includes('\0');
const nonempty = (v: unknown, max = 1024): v is string => text(v,max) && v.length > 0;
const integer = (v: unknown, min = 0): boolean => Number.isSafeInteger(v) && (v as number) >= min;
const exact = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && Object.keys(v).every(k=>keys.includes(k));
const one = (v: unknown, choices: readonly unknown[]): boolean => choices.includes(v);
const relativePath = (v: unknown): v is string => nonempty(v) && !v.startsWith('/') && !v.includes('\\') && !v.includes(':') && !v.split('/').some(s=>s === '..' || s === '.' || s === '') && !/[\r\n]/u.test(v);
const leaseStates = ['available','reserving','bound','completing','reviewing','released','unknown'];
const persistedStates = ['reserving','bound','completing','reviewing','released'];
const blockerCodes = ['repo_read_only','repo_unavailable','canonical_unavailable','canonical_target_mismatch','row_not_pending','lease_unavailable','lease_unknown','snapshot_changed_during_read','mode_unsupported','plan_missing','plan_ambiguous','plan_not_approved','plan_source_mismatch','plan_not_projectable','contract_missing','contract_not_projectable'];
export function isTaskContextRequest(v: unknown): v is OperatorTaskContextRequest {
  if (!v || typeof v !== 'object') return false;
  const r = v as OperatorTaskContextRequest;
  return typeof r.repository_id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(r.repository_id) && digest(r.task_id)
    && (r.expected_task_revision === null || digest(r.expected_task_revision));
}
export function parseTaskContextRequest(repository_id: string, task_id: string, params: URLSearchParams): OperatorTaskContextRequest {
  if ([...params.keys()].some(k=>k !== 'task_revision') || params.getAll('task_revision').length > 1) throw new Error('Invalid task context request');
  const value = { repository_id, task_id, expected_task_revision:params.get('task_revision') };
  if (!isTaskContextRequest(value)) throw new Error('Invalid task context request');
  return value;
}
export function decodeOperatorTaskContext(value: unknown, request: OperatorTaskContextRequest): OperatorTaskContext {
  const invalid = (): never => { throw new Error('Invalid task context response'); };
  if (!isTaskContextRequest(request) || !exact(value,['protocol','kind','repository_id','task_id','task_revision','canonical','task','execution','offer','observation'])) return invalid();
  if (value.protocol !== 1 || value.kind !== 'operator_task_context' || value.repository_id !== request.repository_id || value.task_id !== request.task_id
    || !digest(value.task_revision) || (request.expected_task_revision !== null && value.task_revision !== request.expected_task_revision)) return invalid();
  const { canonical:c, task:t, execution:e, offer:o, observation:b } = value;
  if (!exact(c,['target_ref','commit','sprint_path']) || !nonempty(c.target_ref) || typeof c.commit !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(c.commit) || !relativePath(c.sprint_path)
    || !exact(t,['title','mode','acceptance','state']) || !nonempty(t.title,8192) || !text(t.mode,128) || !text(t.acceptance) || !one(t.state,['pending','done','missing','drifted'])
    || !exact(e,['lease_state','claim']) || !one(e.lease_state,leaseStates)) return invalid();
  if (e.claim !== null) {
    const a=e.claim;
    if (!exact(a,['claim_id','generation','state','branch','target_ref']) || !uuid(a.claim_id) || !integer(a.generation,1) || !one(a.state,persistedStates)
      || (a.branch !== null && !nonempty(a.branch)) || !nonempty(a.target_ref) || a.state !== e.lease_state) return invalid();
  } else if (!one(e.lease_state,['available','unknown'])) return invalid();
  if (!exact(o,['execution_readiness','blockers','offer_revision','plan']) || !one(o.execution_readiness,['execution_ready','planning_required','inline_ready','unsupported'])
    || !hash(o.offer_revision) || !Array.isArray(o.blockers) || o.blockers.length > blockerCodes.length) return invalid();
  const seen = new Set();
  for (const blocker of o.blockers) {
    if (!exact(blocker,['code','attention_owner']) || !one(blocker.code,blockerCodes) || !one(blocker.attention_owner,['agent','user','external']) || seen.has(blocker.code)) return invalid();
    seen.add(blocker.code);
  }
  if (o.plan !== null) {
    const p=o.plan;
    if (!exact(p,['plan_path','contract_path','source_ref','plan_sha256','contract_sha256','basis']) || p.basis !== 'registered_worktree' || !relativePath(p.plan_path) || !relativePath(p.contract_path)
      || !hash(p.plan_sha256) || !hash(p.contract_sha256) || p.source_ref !== `sprint:${c.sprint_path}#${t.title}`) return invalid();
  }
  if (!exact(b,['observed_at','board_revision','authorization_revision','consistency']) || !nonempty(b.observed_at,64) || !Number.isFinite(Date.parse(b.observed_at)) || !hash(b.board_revision)
    || !integer(b.authorization_revision) || b.consistency !== 'observed') return invalid();
  if (new TextEncoder().encode(JSON.stringify(value)).length > TASK_CONTEXT_MAX_BYTES) return invalid();
  return value as unknown as OperatorTaskContext;
}
