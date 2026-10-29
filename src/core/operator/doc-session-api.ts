import { isAgentRuntimeId } from './agents-settings';
import { isRepositoryRelativePath } from './doc-session-events';

/**
 * Wire shapes of the doc session routes the page uses besides diff, loss and
 * events: create (#1021), list and detail (#1146), messages and stop (#1146,
 * #1021), commit and discard (#1023). The PRD「写入 API」fixes the request
 * fields and failure codes; the response bodies here are the contract the
 * server routes answer. Pure, so the page can import the decoders.
 *
 * The session status has two independent sources. `agent` is the docs host
 * lifecycle; `outcome` is what the server did with the worktree. The page
 * derives the visible status from both and stores neither.
 */

export const DOC_SESSION_AGENT_STATES = ['starting', 'running', 'idle', 'stopped', 'failed'] as const;
export type DocSessionAgentState = typeof DOC_SESSION_AGENT_STATES[number];
export const DOC_SESSION_OUTCOMES = ['pr_open', 'discarded', 'cleaned'] as const;
export type DocSessionOutcome = typeof DOC_SESSION_OUTCOMES[number];
export const DOC_SESSION_MESSAGE_WHEN = ['after_turn', 'now'] as const;
export type DocSessionMessageWhen = typeof DOC_SESSION_MESSAGE_WHEN[number];
export const DOC_SESSION_LANDED = ['prompted', 'queued', 'steered'] as const;
export type DocSessionLanded = typeof DOC_SESSION_LANDED[number];
export const DOC_SESSION_DELIVERY_STEPS = ['commit', 'push', 'pull_request'] as const;
export type DocSessionDeliveryStep = typeof DOC_SESSION_DELIVERY_STEPS[number];
export const DOC_SESSION_STEP_STATES = ['done', 'failed', 'pending'] as const;
export type DocSessionStepState = typeof DOC_SESSION_STEP_STATES[number];

/** Refusal codes of the session write routes (PRD「写入 API」and the create route). */
export const DOC_SESSION_WRITE_REFUSALS = [
  'citation_stale', 'path_outside_scope', 'generated_region', 'docs_isolation_unverified', 'runtime_not_enabled',
  'platform_unsupported', 'repository_not_found', 'worktree_exists', 'steer_unsupported', 'session_closed',
  'no_active_turn', 'diff_changed', 'turn_active', 'loss_changed', 'branch_pushed', 'request_mismatch', 'busy',
] as const;
export type DocSessionWriteRefusal = typeof DOC_SESSION_WRITE_REFUSALS[number];
/** Only these refusals name files; the page lists them (`4-DSES-F1`). */
export const DOC_SESSION_PATH_REFUSALS = ['path_outside_scope', 'generated_region'] as const;

export const DOC_SESSION_TITLE_MAX = 120;
export const DOC_SESSION_MESSAGE_MAX = 8_000;
export const DOC_SESSION_COMMIT_MESSAGE_MAX = 500;
/** Limits of the create request, which the server enforces and the start form respects. */
export const DOC_SESSION_MAX_CITATIONS = 16;
export const DOC_SESSION_MAX_INSTRUCTION = 8_000;
/**
 * The most lines one citation names. Each relocation candidate is hashed, so
 * the cap bounds the work of one check. It lives here, not beside the node
 * hash in `doc-citation.ts`, so the page that builds citations can import it.
 */
export const DOC_CITATION_MAX_LINES = 500;

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
  readonly citations: readonly DocSessionCitationView[];
}

export interface DocSessionSummaryV1 {
  readonly session_id: string;
  readonly title: string;
  readonly repository_id: string;
  readonly runtime: string;
  readonly agent: DocSessionAgentState;
  readonly outcome: DocSessionOutcome | null;
  readonly last_activity_at: string;
  /** Cursor of the newest event; the page compares it with the last cursor it showed to mark unread. */
  readonly last_event: string | null;
}

export const SESSION_KINDS = ['docs', 'worktree_cleanup'] as const;
export type SessionKind = typeof SESSION_KINDS[number];

/** `GET /api/v1/sessions`: the doc sessions, newest activity first. */
export interface OperatorDocSessionsV1 {
  readonly protocol: 1;
  readonly kind: 'operator_docs_sessions';
  /** Session kinds this server can start. The page shows a start control only for a listed kind. */
  readonly kinds: readonly SessionKind[];
  readonly sessions: readonly DocSessionSummaryV1[];
  readonly observed_at: string;
}

export interface DocSessionDeliveryV1 {
  readonly steps: readonly { readonly step: DocSessionDeliveryStep; readonly state: DocSessionStepState }[];
  readonly commit: string | null;
  readonly pull_request: { readonly number: number; readonly url: string } | null;
}

/** `GET /api/v1/sessions/{sid}`. */
export interface OperatorDocSessionDetailV1 extends Omit<DocSessionSummaryV1, 'last_event'> {
  readonly protocol: 1;
  readonly kind: 'operator_docs_session_detail';
  readonly branch: string;
  readonly worktree: string;
  readonly base_commit: string;
  /** Whether the runtime can take a message into the running turn; `unsupported` disables「插入本轮」(`4-DSES-P2`). */
  readonly steer: 'supported' | 'unsupported';
  readonly citations: readonly DocSessionCitationView[];
  /** Null until the first commit request; then each step, so a retry resumes where it stopped (`4-DSES-F2`). */
  readonly delivery: DocSessionDeliveryV1 | null;
  readonly observed_at: string;
}

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

/** 200 also when a later step failed: `delivery` says which step stopped. */
export interface OperatorDocSessionCommitV1 {
  readonly protocol: 1;
  readonly kind: 'operator_docs_session_commit';
  readonly session_id: string;
  readonly delivery: DocSessionDeliveryV1;
}

export interface OperatorDocSessionDiscardV1 {
  readonly protocol: 1;
  readonly kind: 'operator_docs_session_discard';
  readonly session_id: string;
  readonly outcome: 'discarded';
}

/** A write refusal: `{error:{code,message,next_action}}`, plus `paths` for the path refusals only. */
export interface DocSessionRefusalV1 {
  readonly code: string;
  readonly message: string;
  readonly next_action: string;
  readonly paths: readonly string[];
}

export const DOC_SESSION_ID = /^[0-9a-f]{32}$/u;
const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const CURSOR = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;
const WORKTREE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/u;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/u;
const PULL_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/u;

const fail = (what: string): never => { throw new Error(`doc session ${what}`); };
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function exact(value: unknown, keys: readonly string[], what: string): Record<string, unknown> {
  if (!isObject(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(what);
  return value as Record<string, unknown>;
}
const one = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === 'string' && (values as readonly string[]).includes(value);
const timestamp = (value: unknown): boolean => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const text = (value: unknown, max: number): boolean => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const line = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;

function header(value: unknown, keys: readonly string[], kind: string, sessionId?: string): Record<string, unknown> {
  const record = exact(value, keys, kind);
  if (record.protocol !== 1 || record.kind !== kind || typeof record.session_id !== 'string' || !DOC_SESSION_ID.test(record.session_id)
    || (sessionId !== undefined && record.session_id !== sessionId)) fail(kind);
  return record;
}

function decodeCitations(value: unknown): void {
  if (!Array.isArray(value) || value.length > DOC_SESSION_MAX_CITATIONS) fail('citations');
  for (const raw of value as unknown[]) {
    const citation = exact(raw, ['end_line', 'path', 'relocated', 'start_line'], 'citation');
    if (!isRepositoryRelativePath(citation.path) || !line(citation.start_line) || !line(citation.end_line)
      || citation.end_line < citation.start_line || typeof citation.relocated !== 'boolean') fail('citation');
  }
}

function decodeSummaryFields(record: Record<string, unknown>): void {
  if (!text(record.title, DOC_SESSION_TITLE_MAX) || typeof record.repository_id !== 'string' || !REPOSITORY_ID.test(record.repository_id)
    || !isAgentRuntimeId(record.runtime) || !one(record.agent, DOC_SESSION_AGENT_STATES)
    || !(record.outcome === null || one(record.outcome, DOC_SESSION_OUTCOMES)) || !timestamp(record.last_activity_at)) fail('summary');
}

function decodeDelivery(value: unknown): void {
  const delivery = exact(value, ['commit', 'pull_request', 'steps'], 'delivery');
  if (!Array.isArray(delivery.steps) || delivery.steps.length !== DOC_SESSION_DELIVERY_STEPS.length) fail('delivery');
  (delivery.steps as unknown[]).forEach((raw, index) => {
    const step = exact(raw, ['state', 'step'], 'delivery step');
    if (step.step !== DOC_SESSION_DELIVERY_STEPS[index] || !one(step.state, DOC_SESSION_STEP_STATES)) fail('delivery step');
  });
  if (!(delivery.commit === null || (typeof delivery.commit === 'string' && OID.test(delivery.commit)))) fail('delivery');
  if (delivery.pull_request !== null) {
    const pull = exact(delivery.pull_request, ['number', 'url'], 'pull request');
    if (!Number.isSafeInteger(pull.number) || (pull.number as number) < 1 || typeof pull.url !== 'string'
      || !PULL_URL.test(pull.url) || !pull.url.endsWith(`/pull/${pull.number}`)) fail('pull request');
  }
}

export function decodeOperatorDocSessionCreated(value: unknown): OperatorDocSessionCreatedV1 {
  const record = header(value, ['base_commit', 'branch', 'citations', 'kind', 'protocol', 'repository_id', 'runtime', 'session_id', 'state', 'worktree'], 'operator_docs_session');
  if (record.state !== 'created' || typeof record.repository_id !== 'string' || !REPOSITORY_ID.test(record.repository_id)
    || !isAgentRuntimeId(record.runtime) || typeof record.branch !== 'string' || !BRANCH.test(record.branch)
    || typeof record.worktree !== 'string' || !WORKTREE.test(record.worktree) || typeof record.base_commit !== 'string' || !OID.test(record.base_commit)) fail('created');
  decodeCitations(record.citations);
  return value as OperatorDocSessionCreatedV1;
}

export function decodeOperatorDocSessions(value: unknown): OperatorDocSessionsV1 {
  const record = exact(value, ['kind', 'kinds', 'observed_at', 'protocol', 'sessions'], 'operator_docs_sessions');
  if (record.protocol !== 1 || record.kind !== 'operator_docs_sessions' || !timestamp(record.observed_at) || !Array.isArray(record.sessions)
    || !Array.isArray(record.kinds) || !record.kinds.every(kind => one(kind, SESSION_KINDS)) || new Set(record.kinds).size !== record.kinds.length) fail('sessions');
  const ids = new Set<string>();
  for (const raw of record.sessions as unknown[]) {
    const summary = exact(raw, ['agent', 'last_activity_at', 'last_event', 'outcome', 'repository_id', 'runtime', 'session_id', 'title'], 'summary');
    if (typeof summary.session_id !== 'string' || !DOC_SESSION_ID.test(summary.session_id) || ids.has(summary.session_id)
      || !(summary.last_event === null || (typeof summary.last_event === 'string' && CURSOR.test(summary.last_event)))) fail('summary');
    decodeSummaryFields(summary);
    ids.add(summary.session_id as string);
  }
  return value as OperatorDocSessionsV1;
}

export function decodeOperatorDocSessionDetail(value: unknown, sessionId: string): OperatorDocSessionDetailV1 {
  const record = header(value, ['agent', 'base_commit', 'branch', 'citations', 'delivery', 'kind', 'last_activity_at', 'observed_at', 'outcome',
    'protocol', 'repository_id', 'runtime', 'session_id', 'steer', 'title', 'worktree'], 'operator_docs_session_detail', sessionId);
  decodeSummaryFields(record);
  if (typeof record.branch !== 'string' || !BRANCH.test(record.branch) || typeof record.worktree !== 'string' || !WORKTREE.test(record.worktree)
    || typeof record.base_commit !== 'string' || !OID.test(record.base_commit) || !one(record.steer, ['supported', 'unsupported'] as const)
    || !timestamp(record.observed_at)) fail('detail');
  decodeCitations(record.citations);
  if (record.delivery !== null) decodeDelivery(record.delivery);
  return value as OperatorDocSessionDetailV1;
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

export function decodeOperatorDocSessionCommit(value: unknown, sessionId: string): OperatorDocSessionCommitV1 {
  const record = header(value, ['delivery', 'kind', 'protocol', 'session_id'], 'operator_docs_session_commit', sessionId);
  decodeDelivery(record.delivery);
  return value as OperatorDocSessionCommitV1;
}

export function decodeOperatorDocSessionDiscard(value: unknown, sessionId: string): OperatorDocSessionDiscardV1 {
  const record = header(value, ['kind', 'outcome', 'protocol', 'session_id'], 'operator_docs_session_discard', sessionId);
  if (record.outcome !== 'discarded') fail('discard');
  return value as OperatorDocSessionDiscardV1;
}

/** Returns null when the body is not a typed refusal, so the caller reports the request as unanswered. */
export function decodeDocSessionRefusal(value: unknown): DocSessionRefusalV1 | null {
  if (!isObject(value) || Object.keys(value).join(',') !== 'error') return null;
  const error = value.error;
  if (!isObject(error) || typeof error.code !== 'string' || typeof error.message !== 'string' || typeof error.next_action !== 'string') return null;
  const keys = Object.keys(error).sort().join(',');
  if (keys === 'code,message,next_action') return { code: error.code, message: error.message, next_action: error.next_action, paths: [] };
  if (keys !== 'code,message,next_action,paths' || !one(error.code, DOC_SESSION_PATH_REFUSALS) || !Array.isArray(error.paths)
    || error.paths.length === 0 || !error.paths.every(isRepositoryRelativePath)) return null;
  return { code: error.code, message: error.message, next_action: error.next_action, paths: [...error.paths as string[]] };
}
