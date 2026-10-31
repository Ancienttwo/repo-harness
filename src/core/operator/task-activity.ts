export const TASK_ACTIVITY_MAX_SCAN = 1000;
export const TASK_ACTIVITY_MAX_BYTES = 2 * 1024 * 1024;
export const TASK_ACTIVITY_MAX_OUTPUT_BYTES = 1024 * 1024;
export const TASK_ACTIVITY_DEADLINE_MS = 250;
export const TASK_ACTIVITY_FAILURES = ['unavailable', 'history_unavailable', 'busy', 'timeout'] as const;
export type TaskActivityFailure = typeof TASK_ACTIVITY_FAILURES[number];
export interface OperatorTaskActivityRequest {
  readonly repository_id: string;
  readonly task_id: string;
  readonly limit: number;
  readonly after: string | null;
  readonly message_id: string | null;
}
export interface TaskActivityCoverage {
  readonly scope: 'task' | 'message';
  readonly complete: boolean;
  readonly reason: 'page' | 'scan' | 'bytes' | 'deadline' | 'output' | null;
  readonly scanned: number;
  readonly bytes: number;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DIGEST = /^[0-9a-f]{64}$/u;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const integer = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const nullable = (v: unknown, valid: (v: unknown) => boolean): boolean => v === null || valid(v);
export function isTaskActivityRequest(value: unknown): value is OperatorTaskActivityRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as OperatorTaskActivityRequest;
  return typeof r.repository_id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(r.repository_id)
    && typeof r.task_id === 'string' && DIGEST.test(r.task_id) && integer(r.limit, 1) && r.limit <= 100
    && nullable(r.after, isUuid) && nullable(r.message_id, isUuid) && (r.message_id === null || (r.limit === 1 && r.after === null));
}
export function parseTaskActivityRequest(repository_id: string, task_id: string, params: URLSearchParams): OperatorTaskActivityRequest {
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length || keys.some(k => !['limit', 'after', 'message_id'].includes(k))
    || (params.has('message_id') && (params.has('limit') || params.has('after')))
    || (params.has('limit') && !/^[1-9][0-9]*$/u.test(params.get('limit')!))) throw new Error('Invalid activity request');
  const value = { repository_id, task_id, limit: params.has('message_id') ? 1 : Number(params.get('limit') ?? 50), after: params.get('after'), message_id: params.get('message_id') };
  if (!isTaskActivityRequest(value)) throw new Error('Invalid activity request');
  return value;
}
