export const SESSION_OBSERVATION_MAX_BYTES = 512 * 1024;
/** `stale` includes a selected grant that was revoked or replaced. Provider
 * failures and invalid or unreadable source evidence remain `unavailable`. */
export const SESSION_OBSERVATION_FAILURES = ['unavailable', 'filters_unsupported', 'index_unsupported', 'stale', 'too_large', 'busy', 'timeout'] as const;
export type SessionObservationFailure = typeof SESSION_OBSERVATION_FAILURES[number];
