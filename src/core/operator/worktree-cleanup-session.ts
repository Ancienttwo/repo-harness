import { WORKTREE_CLEANUP_MAX_IDS } from './worktree-cleanup';
import { isDocsHostRuntimeId } from './docs-host-runtimes';
import { decodeCleanupPlan, type CleanupPlan } from './worktree-cleanup-plan';

export const OPERATOR_CLEANUP_PLAN_ROUTE = /^\/api\/v1\/sessions\/([0-9a-f]{32})\/plan$/u;
const SID = /^[0-9a-f]{32}$/u;
export interface CleanupSessionCreate { readonly kind: 'worktree_cleanup'; readonly runtime: string; readonly ids?: readonly string[] }
/** Creation selects the server inventory. It accepts no paths, advice or deletion permission. */
export function decodeCleanupSessionCreate(value: Readonly<Record<string, unknown>>): CleanupSessionCreate {
  if (!['kind,runtime', 'ids,kind,runtime'].includes(Object.keys(value).sort().join(',')) || value.kind !== 'worktree_cleanup' || typeof value.runtime !== 'string' || !isDocsHostRuntimeId(value.runtime)) throw new Error('cleanup_session_request_invalid');
  if (value.ids !== undefined && (!Array.isArray(value.ids) || !value.ids.length || value.ids.length > WORKTREE_CLEANUP_MAX_IDS || new Set(value.ids).size !== value.ids.length || !value.ids.every(id => typeof id === 'string' && /^wt_[0-9a-f]{64}$/u.test(id)))) throw new Error('cleanup_session_ids_invalid');
  return { kind: 'worktree_cleanup', runtime: value.runtime, ...(value.ids === undefined ? {} : { ids: [...value.ids as string[]].sort() }) };
}
export interface CleanupSessionRecord {
  readonly protocol: 1;
  readonly kind: 'worktree_cleanup';
  readonly session_id: string;
  readonly state: 'created';
  readonly created_at: string;
  readonly repository_id: string;
  readonly runtime: string;
  /** Server-selected primary checkout, read-only to this runtime. */
  readonly worktree: string;
  readonly instruction: string;
}
export function decodeCleanupSessionRecord(value: unknown): CleanupSessionRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('cleanup_session_record_invalid');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'created_at,instruction,kind,protocol,repository_id,runtime,session_id,state,worktree'
    || v.protocol !== 1 || v.kind !== 'worktree_cleanup' || v.state !== 'created' || typeof v.session_id !== 'string' || !SID.test(v.session_id)
    || typeof v.repository_id !== 'string' || !/^repo_[0-9a-f]{16}$/u.test(v.repository_id) || typeof v.runtime !== 'string' || !isDocsHostRuntimeId(v.runtime)
    || typeof v.worktree !== 'string' || !v.worktree.startsWith('/') || /[\0\r\n]/u.test(v.worktree)
    || typeof v.instruction !== 'string' || !v.instruction || v.instruction.length > 8000
    || typeof v.created_at !== 'string' || !Number.isFinite(Date.parse(v.created_at))) throw new Error('cleanup_session_record_invalid');
  return v as unknown as CleanupSessionRecord;
}
export interface CleanupPlanPreview {
  readonly protocol: 1;
  readonly kind: 'operator_worktree_cleanup_preview';
  readonly session_id: string;
  readonly runtime: string;
  readonly state: 'investigating' | 'ready' | 'unavailable';
  readonly agent: 'starting' | 'running' | 'idle' | 'stopped' | 'failed' | null;
  readonly observed_at: string;
  readonly plan: CleanupPlan | null;
  readonly execution: { readonly enabled: false; readonly code: 'cleanup_execution_unavailable' };
}
export function decodeCleanupPlanPreview(value: unknown, request: { readonly session_id: string }): CleanupPlanPreview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('cleanup_preview_invalid');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'agent,execution,kind,observed_at,plan,protocol,runtime,session_id,state'
    || v.protocol !== 1 || v.kind !== 'operator_worktree_cleanup_preview' || v.session_id !== request.session_id || !SID.test(request.session_id)
    || typeof v.runtime !== 'string' || !isDocsHostRuntimeId(v.runtime) || !['investigating', 'ready', 'unavailable'].includes(v.state as string)
    || v.agent !== null && !['starting', 'running', 'idle', 'stopped', 'failed'].includes(v.agent as string)
    || typeof v.observed_at !== 'string' || !Number.isFinite(Date.parse(v.observed_at))
    || !v.execution || typeof v.execution !== 'object' || Array.isArray(v.execution) || Object.keys(v.execution).sort().join(',') !== 'code,enabled' || (v.execution as Record<string, unknown>).enabled !== false || (v.execution as Record<string, unknown>).code !== 'cleanup_execution_unavailable') throw new Error('cleanup_preview_invalid');
  if (v.plan !== null && decodeCleanupPlan(v.plan).session_id !== request.session_id) throw new Error('cleanup_plan_identity');
  if ((v.state === 'ready') !== (v.plan !== null)) throw new Error('cleanup_plan_state');
  return v as unknown as CleanupPlanPreview;
}
