/**
 * Names shared by the DSH host plugin and its web client. This module has no
 * runtime imports, so the client bundle can use it without pulling in zod.
 */

export const GUARD_DENIED_ERROR_NAME = 'RepoHarnessGuardDenied';
export const GUARD_DENIED_ERROR_CODE = 'REPO_HARNESS_GUARD_DENIED';
export const GUARD_DENIALS_KEY = 'repo-harness-guard-denials';

export interface GuardDenial {
  readonly call_id: string;
  /** Null only when the log holds no `tool/call` for this result. */
  readonly tool: string | null;
  /** Null only when the logged failure carries no reason; this plugin always writes one. */
  readonly reason: string | null;
}
