/** Registry ID locates the repository; provider IDs and the explicit session
 * selector identify an existing admitted execution. None grants authority. */
export interface AdmittedSessionSelector {
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
export const SESSION_SELECTOR_KEYS = ['repository_id', 'provider_repository_id', 'issue_id', 'campaign_id', 'task', 'role',
  'claim_ref', 'claim_revision', 'grant_sha256', 'policy_sha256', 'actor_id', 'session_binding_sha256'] as const;
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => !!value && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
  && value.length <= 2048 && !/[\x00-\x1f\x7f]/u.test(value);
const digest = (value: unknown): boolean => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
export function validSessionSelectorFields(value: Record<string, unknown>): boolean {
  return SESSION_SELECTOR_KEYS.every(key => text(value[key]))
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.repository_id as string)
    && /^[a-z][a-z0-9_-]{0,31}$/u.test(value.role as string)
    && ['claim_revision', 'grant_sha256', 'policy_sha256', 'session_binding_sha256'].every(key => digest(value[key]));
}
export const SESSION_OBSERVATION_MAX_BYTES = 512 * 1024;
/** `stale` includes a selected grant that was revoked or replaced. Provider
 * failures and invalid or unreadable source evidence remain `unavailable`. */
export const SESSION_OBSERVATION_FAILURES = ['unavailable', 'filters_unsupported', 'index_unsupported', 'stale', 'too_large', 'busy', 'timeout'] as const;
export type SessionObservationFailure = typeof SESSION_OBSERVATION_FAILURES[number];
export function isAdmittedSessionSelector(value: unknown): value is AdmittedSessionSelector {
  return exact(value, SESSION_SELECTOR_KEYS) && validSessionSelectorFields(value);
}

