import { isTaskDiffRequest, type OperatorTaskDiffRequest } from './task-diff';
export const TASK_SESSIONS_MAX_ENTRIES = 200;
export const TASK_SESSIONS_MAX_BYTES = 512 * 1024;
export interface OperatorTaskSessionsRequest { readonly repository_id: string }
export interface OperatorTaskSession {
  readonly selector: OperatorTaskDiffRequest;
  readonly profile_selection: { readonly state: 'unassigned' } | { readonly state: 'selected'; readonly engineer_id: string; readonly engineer_contract_revision: string };
  readonly admission_sha256: string;
  readonly branch: string;
  readonly runtime: 'herdr' | 'terminal';
  readonly harness_kind: string;
}
export interface OperatorTaskSessions {
  readonly protocol: 1;
  readonly kind: 'operator_task_sessions';
  readonly repository_id: string;
  readonly observed_at: string;
  readonly sessions: readonly OperatorTaskSession[];
}
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => !!value && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
export function isTaskSessionsRequest(value: unknown): value is OperatorTaskSessionsRequest {
  return exact(value, ['repository_id']) && typeof value.repository_id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.repository_id);
}
export function decodeOperatorTaskSessions(value: unknown, request: OperatorTaskSessionsRequest): OperatorTaskSessions {
  const invalid = (): never => { throw new Error('Invalid task sessions response'); };
  if (!isTaskSessionsRequest(request) || !exact(value, ['protocol', 'kind', 'repository_id', 'observed_at', 'sessions'])
    || value.protocol !== 1 || value.kind !== 'operator_task_sessions' || value.repository_id !== request.repository_id
    || typeof value.observed_at !== 'string' || !Number.isFinite(Date.parse(value.observed_at))
    || !Array.isArray(value.sessions) || value.sessions.length > TASK_SESSIONS_MAX_ENTRIES
    || new TextEncoder().encode(JSON.stringify(value)).length > TASK_SESSIONS_MAX_BYTES) return invalid();
  const seen = new Set<string>();
  for (const session of value.sessions) {
    if (!exact(session, ['selector', 'admission_sha256', 'profile_selection', 'branch', 'runtime', 'harness_kind']) || !isTaskDiffRequest(session.selector)
      || typeof session.admission_sha256 !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(session.admission_sha256)
      || session.selector.repository_id !== request.repository_id || typeof session.branch !== 'string' || !session.branch || session.branch.length > 1024
      || !['herdr', 'terminal'].includes(session.runtime as string) || typeof session.harness_kind !== 'string' || !session.harness_kind || session.harness_kind.length > 128
      || seen.has(session.selector.session_binding_sha256)) return invalid();
    const profile = session.profile_selection;
    if (!(exact(profile, ['state']) && profile.state === 'unassigned')
      && !(exact(profile, ['state', 'engineer_id', 'engineer_contract_revision']) && profile.state === 'selected'
        && typeof profile.engineer_id === 'string' && profile.engineer_id.length > 0 && profile.engineer_id.length <= 2048
        && typeof profile.engineer_contract_revision === 'string' && /^sha256:[0-9a-f]{64}$/u.test(profile.engineer_contract_revision))) return invalid();
    seen.add(session.selector.session_binding_sha256);
  }
  return value as unknown as OperatorTaskSessions;
}
