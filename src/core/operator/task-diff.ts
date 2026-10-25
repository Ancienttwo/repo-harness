/** Registry ID locates the repository; provider IDs and the explicit session
 * selector identify an existing admitted execution. None grants authority. */
export interface OperatorTaskDiffRequest {
  readonly repository_id: string;
  readonly provider_repository_id: string;
  readonly issue_id: string;
  readonly campaign_id: string;
  readonly task: string;
  readonly role: string;
  readonly claim_ref: string;
  readonly claim_revision: string;
  readonly grant_sha256: string;
  readonly policy_sha256: string;
  readonly actor_id: string;
  readonly session_binding_sha256: string;
}
export const TASK_DIFF_SELECTOR_KEYS = ['repository_id', 'provider_repository_id', 'issue_id', 'campaign_id', 'task', 'role',
  'claim_ref', 'claim_revision', 'grant_sha256', 'policy_sha256', 'actor_id', 'session_binding_sha256'] as const;
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => !!value && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
  && value.length <= 2048 && !/[\x00-\x1f\x7f]/u.test(value);
const digest = (value: unknown): boolean => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
function validSelector(value: Record<string, unknown>): boolean {
  return TASK_DIFF_SELECTOR_KEYS.every(key => text(value[key]))
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.repository_id as string)
    && /^[a-z][a-z0-9_-]{0,31}$/u.test(value.role as string)
    && ['claim_revision', 'grant_sha256', 'policy_sha256', 'session_binding_sha256'].every(key => digest(value[key]));
}
export function parseTaskDiffRequest(repository_id: string, params: URLSearchParams): OperatorTaskDiffRequest {
  const keys = [...params.keys()];
  if (keys.length !== TASK_DIFF_SELECTOR_KEYS.length - 1 || new Set(keys).size !== keys.length
    || keys.some(key => key === 'repository_id' || !(TASK_DIFF_SELECTOR_KEYS as readonly string[]).includes(key))) throw new Error('Invalid task diff selector');
  const value = { repository_id, ...Object.fromEntries(params) };
  if (!isTaskDiffRequest(value)) throw new Error('Invalid task diff selector');
  return value;
}
export const TASK_DIFF_MAX_BYTES = 512 * 1024;
export const TASK_DIFF_MAX_UNTRACKED = 1000;
/** `stale` includes a selected grant that was revoked or replaced. Provider
 * failures and invalid or unreadable source evidence remain `unavailable`. */
export const TASK_DIFF_FAILURES = ['unavailable', 'filters_unsupported', 'index_unsupported', 'stale', 'too_large', 'busy', 'timeout'] as const;
export type TaskDiffFailure = typeof TASK_DIFF_FAILURES[number];
export interface OperatorTaskDiff extends OperatorTaskDiffRequest {
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

export function isTaskDiffRequest(value: unknown): value is OperatorTaskDiffRequest {
  return exact(value, TASK_DIFF_SELECTOR_KEYS) && validSelector(value);
}

export function decodeOperatorTaskDiff(value: unknown, request: OperatorTaskDiffRequest): OperatorTaskDiff {
  const invalid = (): never => { throw new Error('Invalid task diff response'); };
  if (!isTaskDiffRequest(request) || !value || typeof value !== 'object' || !validSelector(value as Record<string, unknown>)) return invalid();
  const r = value as OperatorTaskDiff;
  if (TASK_DIFF_SELECTOR_KEYS.some(key => r[key] !== request[key])
    || r.protocol !== 2 || r.kind !== 'operator_task_diff'
    || typeof r.target_ref !== 'string' || !r.target_ref || r.target_ref.length > 1024
    || typeof r.branch !== 'string' || !r.branch || r.branch.length > 1024
    || typeof r.base_sha !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(r.base_sha)
    || typeof r.head_sha !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(r.head_sha)
    || typeof r.observed_at !== 'string' || !Number.isFinite(Date.parse(r.observed_at))
    || typeof r.patch !== 'string' || new TextEncoder().encode(r.patch).length > TASK_DIFF_MAX_BYTES
    || !Array.isArray(r.untracked_paths) || r.untracked_paths.length > TASK_DIFF_MAX_UNTRACKED
    || r.untracked_paths.some(p => typeof p !== 'string' || !p || p.startsWith('/') || p.includes('\0') || p.split('/').includes('..'))
    || new TextEncoder().encode(r.untracked_paths.join('\0')).length > TASK_DIFF_MAX_BYTES) return invalid();
  const keys = [...TASK_DIFF_SELECTOR_KEYS, 'protocol', 'kind', 'target_ref', 'branch', 'base_sha', 'head_sha', 'observed_at', 'patch', 'untracked_paths'];
  if (Object.keys(r).length !== keys.length || Object.keys(r).some(k => !keys.includes(k))) return invalid();
  return r;
}
