import { compareDocSessionCursor, isRepositoryRelativePath, parseDocSessionCursor, storedDocSessionText } from './doc-session-events';

/** Public session metadata. Private agent records, prompts and control paths never cross this boundary. */
export const DOC_SESSION_LIST_MAX = 200;
export const OPERATOR_SESSION_LIST_PATH = '/api/v1/sessions';
export const OPERATOR_SESSION_DETAIL_ROUTE = /^\/api\/v1\/sessions\/([0-9a-f]{32})$/u;
export const DOC_SESSION_VIEW_FAILURES = ['session_not_found', 'worktree_missing', 'worktree_changed', 'too_large', 'unavailable', 'busy', 'timeout'] as const;
export type DocSessionViewState = 'created' | 'starting' | 'running' | 'idle' | 'stopped' | 'failed';
export interface DocSessionSummary {
  readonly session_id: string;
  readonly title: string;
  readonly repository_id: string;
  readonly repository_name: string;
  readonly runtime: string;
  readonly state: DocSessionViewState;
  readonly created_at: string;
  readonly last_activity_at: string;
  readonly last_cursor: string | null;
  readonly unread: boolean;
}
export interface DocSessionListRequest { readonly seen: Readonly<Record<string, string>> }
export interface DocSessionDetailRequest { readonly session_id: string; readonly seen: string | null }
export interface DocSessionEventsRequest { readonly session_id: string; readonly after: string | null }
export interface OperatorDocSessionList {
  readonly protocol: 1;
  readonly kind: 'operator_docs_sessions';
  readonly kinds: readonly ['docs', 'worktree_cleanup'];
  readonly sessions: readonly DocSessionSummary[];
}
export interface OperatorDocSessionDetail {
  readonly protocol: 1;
  readonly kind: 'operator_docs_session';
  readonly session: DocSessionSummary;
  readonly branch: string;
  /** Directory name only. */
  readonly worktree: string;
  readonly head_commit: string;
  readonly base_commit: string;
  readonly epoch: number | null;
  readonly turn: 'running' | 'idle';
}

const SID = /^[0-9a-f]{32}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const STATES = new Set(['created', 'starting', 'running', 'idle', 'stopped', 'failed']);
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: readonly string[]): boolean => Object.keys(v).length === expected.length && expected.every(key => Object.hasOwn(v, key));
const cursor = (v: unknown): v is string => typeof v === 'string' && parseDocSessionCursor(v) !== null;
const timestamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const publicText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
  && !/[\u0000-\u001f\u007f]/u.test(v) && storedDocSessionText(v).text === v;

export function isDocSessionListRequest(v: unknown): v is DocSessionListRequest {
  return object(v) && keys(v, ['seen']) && object(v.seen) && Object.keys(v.seen).length <= DOC_SESSION_LIST_MAX
    && Object.entries(v.seen).every(([sid, value]) => SID.test(sid) && cursor(value));
}
export function isDocSessionDetailRequest(v: unknown): v is DocSessionDetailRequest {
  return object(v) && keys(v, ['session_id', 'seen']) && typeof v.session_id === 'string' && SID.test(v.session_id)
    && (v.seen === null || cursor(v.seen));
}
export function isDocSessionEventsRequest(v: unknown): v is DocSessionEventsRequest {
  return object(v) && keys(v, ['session_id', 'after']) && typeof v.session_id === 'string' && SID.test(v.session_id)
    && (v.after === null || cursor(v.after));
}

/** Missing client cursors mean not read yet. The server never persists browser read state. */
export function docSessionUnread(last: string | null, seen: string | null): boolean {
  return last !== null && (seen === null || compareDocSessionCursor(parseDocSessionCursor(last)!, parseDocSessionCursor(seen)!) > 0);
}

function summary(v: unknown, seen: string | null): DocSessionSummary {
  if (!object(v) || !keys(v, ['session_id', 'title', 'repository_id', 'repository_name', 'runtime', 'state', 'created_at', 'last_activity_at', 'last_cursor', 'unread'])
    || typeof v.session_id !== 'string' || !SID.test(v.session_id) || !publicText(v.title, 160)
    || typeof v.repository_id !== 'string' || !TOKEN.test(v.repository_id) || !publicText(v.repository_id, 128)
    || !publicText(v.repository_name, 160) || typeof v.runtime !== 'string' || !TOKEN.test(v.runtime) || !publicText(v.runtime, 128)
    || typeof v.state !== 'string' || !STATES.has(v.state) || !timestamp(v.created_at) || !timestamp(v.last_activity_at)
    || (v.last_cursor !== null && !cursor(v.last_cursor)) || v.unread !== docSessionUnread(v.last_cursor as string | null, seen)) throw new Error('doc session summary');
  return v as unknown as DocSessionSummary;
}

export function decodeOperatorDocSessionList(v: unknown, request: DocSessionListRequest): OperatorDocSessionList {
  if (!isDocSessionListRequest(request) || !object(v) || !keys(v, ['protocol', 'kind', 'kinds', 'sessions']) || v.protocol !== 1
    || v.kind !== 'operator_docs_sessions' || JSON.stringify(v.kinds) !== '["docs","worktree_cleanup"]' || !Array.isArray(v.sessions) || v.sessions.length > DOC_SESSION_LIST_MAX) throw new Error('doc session list');
  const sessions = v.sessions.map(item => summary(item, object(item) && typeof item.session_id === 'string' ? request.seen[item.session_id] ?? null : null));
  if (new Set(sessions.map(item => item.session_id)).size !== sessions.length) throw new Error('duplicate session');
  return { protocol: 1, kind: 'operator_docs_sessions', kinds: ['docs', 'worktree_cleanup'], sessions };
}

export function decodeOperatorDocSessionDetail(v: unknown, request: DocSessionDetailRequest): OperatorDocSessionDetail {
  if (!isDocSessionDetailRequest(request) || !object(v) || !keys(v, ['protocol', 'kind', 'session', 'branch', 'worktree', 'head_commit', 'base_commit', 'epoch', 'turn'])
    || v.protocol !== 1 || v.kind !== 'operator_docs_session' || v.branch !== `docs/${request.session_id.slice(0, 12)}`
    || !publicText(v.worktree, 512) || !isRepositoryRelativePath(v.worktree) || v.worktree.includes('/')
    || typeof v.head_commit !== 'string' || !OID.test(v.head_commit) || typeof v.base_commit !== 'string' || !OID.test(v.base_commit)
    || (v.epoch !== null && (!Number.isSafeInteger(v.epoch) || (v.epoch as number) < 1))
    || (v.turn !== 'running' && v.turn !== 'idle')) throw new Error('doc session detail');
  const session = summary(v.session, request.seen);
  if (session.session_id !== request.session_id) throw new Error('doc session identity');
  return { ...v, session } as unknown as OperatorDocSessionDetail;
}
