import { deriveTaskRevision } from '../state/coordination-identity';

export const TASK_HISTORY_MAX_COMMITS = 64;
export const TASK_HISTORY_MAX_CARRIERS = 128;
export const TASK_HISTORY_MAX_BLOBS = 256;
export const TASK_HISTORY_MAX_BYTES = 2 * 1024 * 1024;
export const TASK_HISTORY_MAX_BLOB_BYTES = 256 * 1024;
export const TASK_HISTORY_DEADLINE_MS = 3000;
export const TASK_HISTORY_FAILURES = ['history_unavailable', 'history_ambiguous', 'unavailable', 'stale', 'too_large', 'timeout'] as const;
export type TaskHistoryFailure = typeof TASK_HISTORY_FAILURES[number];
export interface OperatorTaskHistoryRequest {
  readonly repository_id: string;
  readonly task_id: string;
  readonly expected_task_revision: string | null;
}
export interface OperatorTaskHistory {
  readonly protocol: 1;
  readonly kind: 'operator_task_history';
  readonly repository_id: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly task: { readonly title: string; readonly mode: string; readonly acceptance: string; readonly recorded_status: string };
  readonly source: { readonly target_ref: string; readonly target_commit: string; readonly commit: string; readonly sprint_path: string; readonly blob_sha256: string };
  readonly coverage: { readonly scope: 'canonical_first_parent'; readonly commits_examined: number; readonly blobs_examined: number };
  readonly observed_at: string;
}
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const oid = (v: unknown): v is string => typeof v === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(v);
const text = (v: unknown, max = 8192): v is string => typeof v === 'string' && !v.includes('\0') && new TextEncoder().encode(v).length <= max;
const exact = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const relativePath = (v: unknown): v is string => text(v,1024) && v.length > 0 && !v.startsWith('/') && !/[\\:\r\n]/u.test(v) && !v.split('/').some(p => !p || p === '.' || p === '..');
export function isTaskHistoryRequest(v: unknown): v is OperatorTaskHistoryRequest {
  return exact(v,['repository_id','task_id','expected_task_revision']) && typeof v.repository_id === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(v.repository_id) && digest(v.task_id)
    && (v.expected_task_revision === null || digest(v.expected_task_revision));
}
export function decodeOperatorTaskHistory(value: unknown, request: OperatorTaskHistoryRequest): OperatorTaskHistory {
  const invalid = (): never => { throw new Error('Invalid task history response'); };
  if (!isTaskHistoryRequest(request) || !exact(value,['protocol','kind','repository_id','task_id','task_revision','task','source','coverage','observed_at'])) return invalid();
  if (value.protocol !== 1 || value.kind !== 'operator_task_history' || value.repository_id !== request.repository_id || value.task_id !== request.task_id
    || !digest(value.task_revision) || (request.expected_task_revision !== null && request.expected_task_revision !== value.task_revision)) return invalid();
  const t=value.task,s=value.source,c=value.coverage;
  if (!exact(t,['title','mode','acceptance','recorded_status']) || !text(t.title) || !t.title || !text(t.mode,128) || !text(t.acceptance) || !text(t.recorded_status,128)
    || !exact(s,['target_ref','target_commit','commit','sprint_path','blob_sha256']) || !text(s.target_ref,1024) || !s.target_ref || s.target_ref.startsWith('-') || s.target_ref.startsWith('/')
    || !oid(s.target_commit) || !oid(s.commit) || !relativePath(s.sprint_path) || typeof s.blob_sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(s.blob_sha256)
    || !exact(c,['scope','commits_examined','blobs_examined']) || c.scope !== 'canonical_first_parent'
    || !Number.isSafeInteger(c.commits_examined) || (c.commits_examined as number) < 1 || (c.commits_examined as number) > TASK_HISTORY_MAX_COMMITS
    || !Number.isSafeInteger(c.blobs_examined) || (c.blobs_examined as number) < 1 || (c.blobs_examined as number) > TASK_HISTORY_MAX_BLOBS
    || !text(value.observed_at,128) || !Number.isFinite(Date.parse(value.observed_at))) return invalid();
  if (deriveTaskRevision({taskId:request.task_id,taskCell:t.title,modeCell:t.mode,acceptanceCell:t.acceptance}) !== value.task_revision) return invalid();
  return value as unknown as OperatorTaskHistory;
}
