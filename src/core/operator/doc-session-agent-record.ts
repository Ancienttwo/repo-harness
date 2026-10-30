import type { DocSessionFailureCategory } from './doc-session-events';

// Persisted host record contract, extracted from the G5 host for read consumers.
// This module neither creates a host nor establishes ownership of one.
export type DocSessionAgentState = 'starting' | 'running' | 'idle' | 'stopped' | 'failed';
export type DocSessionCredentialCleanup = 'removed' | 'absent' | 'cleanup_pending';

/** `<session>/agent.json`, mode 0600. Server state only; no route serves it. */
export interface DocSessionAgentRecord {
  readonly protocol: 1;
  readonly kind: 'docs_session_agent';
  readonly session_id: string;
  readonly epoch: number;
  readonly state: DocSessionAgentState;
  readonly failure: DocSessionFailureCategory | null;
  /** An error code, never a message with paths or text. */
  readonly reason: string | null;
  readonly updated_at: string;
  /** The model the runtime reported (D7); never in events. */
  readonly actual_model: string | null;
  readonly credential: DocSessionCredentialCleanup | null;
  /** `<os temp>/repo-harness-docs-host/<sid>`: profile, launcher, git link and the writable scratch. Null when it could not be planned. */
  readonly control: string | null;
  /** The error code of a failure record the server could not append to the event log; the log is kept as it is. */
  readonly events_error: string | null;
}
