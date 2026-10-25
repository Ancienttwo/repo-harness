import { type AdmittedSessionSelector, isAdmittedSessionSelector, SESSION_SELECTOR_KEYS, SESSION_OBSERVATION_MAX_BYTES, validSessionSelectorFields } from '../sessions/session-selector';

export function parseTaskDiffRequest(repository_id: string, params: URLSearchParams): AdmittedSessionSelector {
  const keys = [...params.keys()];
  if (keys.length !== SESSION_SELECTOR_KEYS.length - 1 || new Set(keys).size !== keys.length
    || keys.some(key => key === 'repository_id' || !(SESSION_SELECTOR_KEYS as readonly string[]).includes(key))) throw new Error('Invalid task diff selector');
  const value = { repository_id, ...Object.fromEntries(params) };
  if (!isAdmittedSessionSelector(value)) throw new Error('Invalid task diff selector');
  return value;
}
export const TASK_DIFF_MAX_UNTRACKED = 1000;
export interface OperatorTaskDiff extends AdmittedSessionSelector {
  readonly protocol: 2;
  readonly kind: 'operator_task_diff';
  readonly target_ref: string;
  readonly branch: string;
  readonly base_sha: string;
  readonly head_sha: string;
  readonly observed_at: string;
  readonly patch: string;
  readonly untracked_paths: readonly string[];
}

export function decodeOperatorTaskDiff(value: unknown, request: AdmittedSessionSelector): OperatorTaskDiff {
  const invalid = (): never => { throw new Error('Invalid task diff response'); };
  if (!isAdmittedSessionSelector(request) || !value || typeof value !== 'object' || !validSessionSelectorFields(value as Record<string, unknown>)) return invalid();
  const r = value as OperatorTaskDiff;
  if (SESSION_SELECTOR_KEYS.some(key => r[key] !== request[key])
    || r.protocol !== 2 || r.kind !== 'operator_task_diff'
    || typeof r.target_ref !== 'string' || !r.target_ref || r.target_ref.length > 1024
    || typeof r.branch !== 'string' || !r.branch || r.branch.length > 1024
    || typeof r.base_sha !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(r.base_sha)
    || typeof r.head_sha !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(r.head_sha)
    || typeof r.observed_at !== 'string' || !Number.isFinite(Date.parse(r.observed_at))
    || typeof r.patch !== 'string' || new TextEncoder().encode(r.patch).length > SESSION_OBSERVATION_MAX_BYTES
    || !Array.isArray(r.untracked_paths) || r.untracked_paths.length > TASK_DIFF_MAX_UNTRACKED
    || r.untracked_paths.some(p => typeof p !== 'string' || !p || p.startsWith('/') || p.includes('\0') || p.split('/').includes('..'))
    || new TextEncoder().encode(r.untracked_paths.join('\0')).length > SESSION_OBSERVATION_MAX_BYTES) return invalid();
  const keys = [...SESSION_SELECTOR_KEYS, 'protocol', 'kind', 'target_ref', 'branch', 'base_sha', 'head_sha', 'observed_at', 'patch', 'untracked_paths'];
  if (Object.keys(r).length !== keys.length || Object.keys(r).some(k => !keys.includes(k))) return invalid();
  return r;
}
