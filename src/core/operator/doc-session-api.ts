import { isAgentRuntimeId } from './agents-settings';
import { isDocsHostRuntimeId } from './docs-host-runtimes';
import { isRepositoryRelativePath } from './doc-session-events';
import { decodeCleanupPlan, type CleanupPlan } from './worktree-cleanup-plan';

/**
 * Session wire shapes that no core module on main defines yet. Main owns the
 * list, detail, events, diff, loss and finalization reads and the commit and
 * discard request bodies. Each section below mirrors one draft PR exactly and
 * goes when that PR merges: import its module instead. Pure, so the page can
 * import the decoders.
 */

export const DOC_SESSION_ID = /^[0-9a-f]{32}$/u;
/** Limits of the create request, which the server enforces and the start form respects. */
export const DOC_SESSION_MAX_CITATIONS = 16;
export const DOC_SESSION_MAX_INSTRUCTION = 8_000;
/**
 * The most lines one citation names. Each relocation candidate is hashed, so
 * the cap bounds the work of one check. It lives here, not beside the node
 * hash in `doc-citation.ts`, so the page that builds citations can import it.
 */
export const DOC_CITATION_MAX_LINES = 500;
export const DOC_SESSION_COMMIT_MESSAGE_MAX = 500;

const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const WORKTREE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/u;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/u;

const fail = (what: string): never => { throw new Error(`doc session ${what}`); };
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function exact(value: unknown, keys: readonly string[], what: string): Record<string, unknown> {
  if (!isObject(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(what);
  return value as Record<string, unknown>;
}
const one = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === 'string' && (values as readonly string[]).includes(value);
const line = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;

function header(value: unknown, keys: readonly string[], kind: string, sessionId?: string): Record<string, unknown> {
  const record = exact(value, keys, kind);
  if (record.protocol !== 1 || record.kind !== kind || typeof record.session_id !== 'string' || !DOC_SESSION_ID.test(record.session_id)
    || (sessionId !== undefined && record.session_id !== sessionId)) fail(kind);
  return record;
}

// Create: the 201 body of `POST /api/v1/sessions` with `kind: docs`, with the
// agent state that PR #1149 adds after it starts the session's agent.

export const DOC_SESSION_AGENT_STATES = ['starting', 'running', 'idle', 'stopped', 'failed'] as const;
export type DocSessionAgentState = typeof DOC_SESSION_AGENT_STATES[number];

export interface DocSessionCitationView {
  readonly path: string;
  readonly start_line: number;
  readonly end_line: number;
  /** The server moved the range because the cited text sits elsewhere at the session base (`4-DOCS-F1`). */
  readonly relocated: boolean;
}

export interface OperatorDocSessionCreatedV1 {
  readonly protocol: 1;
  readonly kind: 'operator_docs_session';
  readonly session_id: string;
  readonly state: 'created';
  readonly repository_id: string;
  readonly runtime: string;
  readonly branch: string;
  /** Directory name only. */
  readonly worktree: string;
  readonly base_commit: string;
  /** Only this answer names the verified citations; no read returns them. */
  readonly citations: readonly DocSessionCitationView[];
  readonly agent: DocSessionAgentState;
}

function decodeCitations(value: unknown): void {
  if (!Array.isArray(value) || value.length > DOC_SESSION_MAX_CITATIONS) fail('citations');
  for (const raw of value as unknown[]) {
    const citation = exact(raw, ['end_line', 'path', 'relocated', 'start_line'], 'citation');
    if (!isRepositoryRelativePath(citation.path) || !line(citation.start_line) || !line(citation.end_line)
      || citation.end_line < citation.start_line || typeof citation.relocated !== 'boolean') fail('citation');
  }
}

export function decodeOperatorDocSessionCreated(value: unknown): OperatorDocSessionCreatedV1 {
  const record = header(value, ['agent', 'base_commit', 'branch', 'citations', 'kind', 'protocol', 'repository_id', 'runtime', 'session_id', 'state', 'worktree'], 'operator_docs_session');
  if (record.state !== 'created' || typeof record.repository_id !== 'string' || !REPOSITORY_ID.test(record.repository_id)
    || !isAgentRuntimeId(record.runtime) || typeof record.branch !== 'string' || !BRANCH.test(record.branch)
    || typeof record.worktree !== 'string' || !WORKTREE.test(record.worktree) || typeof record.base_commit !== 'string' || !OID.test(record.base_commit)
    || !one(record.agent, DOC_SESSION_AGENT_STATES)) fail('created');
  decodeCitations(record.citations);
  return value as OperatorDocSessionCreatedV1;
}

// Messages and stop: the 202 bodies of PR #1165.

export const DOC_SESSION_MESSAGE_WHEN = ['after_turn', 'now'] as const;
export type DocSessionMessageWhen = typeof DOC_SESSION_MESSAGE_WHEN[number];
export const DOC_SESSION_LANDED = ['prompted', 'queued', 'steered'] as const;
export type DocSessionLanded = typeof DOC_SESSION_LANDED[number];
/** The server counts the message text in UTF-8 bytes. */
export const DOC_SESSION_MESSAGE_MAX_BYTES = 16_384;

export interface OperatorDocSessionMessageV1 {
  readonly protocol: 1;
  readonly kind: 'operator_docs_session_message';
  readonly session_id: string;
  readonly landed: DocSessionLanded;
}

export interface OperatorDocSessionStopV1 {
  readonly protocol: 1;
  readonly kind: 'operator_docs_session_stop';
  readonly session_id: string;
  readonly result: 'aborting';
}

export function decodeOperatorDocSessionMessage(value: unknown, sessionId: string): OperatorDocSessionMessageV1 {
  const record = header(value, ['kind', 'landed', 'protocol', 'session_id'], 'operator_docs_session_message', sessionId);
  if (!one(record.landed, DOC_SESSION_LANDED)) fail('message');
  return value as OperatorDocSessionMessageV1;
}

export function decodeOperatorDocSessionStop(value: unknown, sessionId: string): OperatorDocSessionStopV1 {
  const record = header(value, ['kind', 'protocol', 'result', 'session_id'], 'operator_docs_session_stop', sessionId);
  if (record.result !== 'aborting') fail('stop');
  return value as OperatorDocSessionStopV1;
}

// Write refusals: `{error:{code,message,next_action}}`, plus `files` for the
// scope refusals of the commit route (PR #1173).

/** Refusal codes of the session write routes that the page has copy for. */
export const DOC_SESSION_WRITE_REFUSALS = [
  'citation_stale', 'docs_isolation_unverified', 'runtime_not_enabled', 'platform_unsupported', 'repository_not_found', 'worktree_exists',
  'steer_unsupported', 'session_closed', 'busy', 'message_refused', 'no_active_turn', 'agent_unanswered', 'stop_refused',
  'path_outside_scope', 'generated_region', 'diff_changed', 'no_changes', 'head_history_unsupported', 'head_changed', 'remote_changed',
  'branch_pushed', 'finalization_conflict', 'worktree_in_use', 'turn_active', 'loss_changed', 'finalize_state_too_large',
  'step_audit_incomplete', 'pr_create_failed', 'pr_outcome_unknown', 'discard_reconcile_required', 'finalize_step_failed',
] as const;
/** Only these refusals name files; the page lists them (`4-DSES-F1`). */
export const DOC_SESSION_PATH_REFUSALS = ['path_outside_scope', 'generated_region'] as const;

export interface DocSessionRefusalV1 {
  readonly code: string;
  readonly message: string;
  readonly next_action: string;
  readonly files: readonly string[];
}

/** Returns null when the body is not a typed refusal, so the caller reports the request as unanswered. */
export function decodeDocSessionRefusal(value: unknown): DocSessionRefusalV1 | null {
  if (!isObject(value) || Object.keys(value).join(',') !== 'error') return null;
  const error = value.error;
  if (!isObject(error) || typeof error.code !== 'string' || typeof error.message !== 'string' || typeof error.next_action !== 'string') return null;
  const keys = Object.keys(error).sort().join(',');
  if (keys === 'code,message,next_action') return { code: error.code, message: error.message, next_action: error.next_action, files: [] };
  if (keys !== 'code,files,message,next_action' || !one(error.code, DOC_SESSION_PATH_REFUSALS) || !Array.isArray(error.files)
    || error.files.length === 0 || !error.files.every(isRepositoryRelativePath)) return null;
  return { code: error.code, message: error.message, next_action: error.next_action, files: [...error.files as string[]] };
}

/**
 * The error of a commit or discard answer (PR #1173). A refusal is the
 * envelope above. A 503 is the saved finalize outcome with an `error` beside
 * it: the step that did not finish. Only the error is read here; the page reads
 * the progress from `/finalization`.
 */
export function docSessionFinalizeRefusal(value: unknown): DocSessionRefusalV1 | null {
  if (isObject(value) && value.kind === 'operator_docs_session_finalize' && value.protocol === 1 && Object.hasOwn(value, 'error')) {
    return decodeDocSessionRefusal({ error: value.error });
  }
  return decodeDocSessionRefusal(value);
}

// Worktree cleanup session: create and the plan read of PR #1186.

export interface CleanupSessionCreateV1 { readonly kind: 'worktree_cleanup'; readonly runtime: string }

export interface OperatorCleanupSessionCreatedV1 {
  readonly protocol: 1;
  readonly kind: 'operator_worktree_cleanup_session_created';
  readonly session_id: string;
}

export function decodeOperatorCleanupSessionCreated(value: unknown): OperatorCleanupSessionCreatedV1 {
  header(value, ['kind', 'protocol', 'session_id'], 'operator_worktree_cleanup_session_created');
  return value as OperatorCleanupSessionCreatedV1;
}

export interface CleanupPlanPreview {
  readonly protocol: 1;
  readonly kind: 'operator_worktree_cleanup_preview';
  readonly session_id: string;
  readonly runtime: string;
  readonly state: 'investigating' | 'ready' | 'unavailable';
  readonly agent: DocSessionAgentState | null;
  readonly observed_at: string;
  readonly plan: CleanupPlan | null;
  /** The server declares that it shows the plan but runs no cleanup from it. */
  readonly execution: { readonly enabled: false; readonly code: 'cleanup_execution_unavailable' };
}

export function decodeCleanupPlanPreview(value: unknown, request: { readonly session_id: string }): CleanupPlanPreview {
  const v = exact(value, ['agent', 'execution', 'kind', 'observed_at', 'plan', 'protocol', 'runtime', 'session_id', 'state'], 'cleanup preview');
  if (v.protocol !== 1 || v.kind !== 'operator_worktree_cleanup_preview' || v.session_id !== request.session_id || !DOC_SESSION_ID.test(request.session_id)
    || typeof v.runtime !== 'string' || !isDocsHostRuntimeId(v.runtime) || !one(v.state, ['investigating', 'ready', 'unavailable'] as const)
    || (v.agent !== null && !one(v.agent, DOC_SESSION_AGENT_STATES))
    || typeof v.observed_at !== 'string' || !Number.isFinite(Date.parse(v.observed_at))) fail('cleanup preview');
  const execution = exact(v.execution, ['code', 'enabled'], 'cleanup execution');
  if (execution.enabled !== false || execution.code !== 'cleanup_execution_unavailable') fail('cleanup execution');
  if (v.plan !== null && decodeCleanupPlan(v.plan).session_id !== request.session_id) fail('cleanup plan identity');
  if ((v.state === 'ready') !== (v.plan !== null)) fail('cleanup plan state');
  return value as CleanupPlanPreview;
}
