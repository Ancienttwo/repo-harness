import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { DocCitationV1 } from '../core/operator/doc-citation';
import {
  decodeDocSessionRefusal,
  decodeOperatorDocSessionCreated,
  decodeOperatorDocSessionMessage,
  decodeOperatorDocSessionStop,
  docSessionFinalizeRefusal,
  type DocSessionMessageWhen,
  type DocSessionRefusalV1,
  type OperatorDocSessionCreatedV1,
  type OperatorDocSessionMessageV1,
  type OperatorDocSessionStopV1,
} from '../core/operator/doc-session-api';
import {
  decodeOperatorDocSessionDiff,
  decodeOperatorDocSessionLoss,
  DOC_SESSION_READ_FAILURES,
  type DocSessionReadFailure,
  type OperatorDocSessionDiffV1,
  type OperatorDocSessionLossV1,
} from '../core/operator/doc-session-changes';
import {
  compareDocSessionCursor,
  decodeOperatorDocSessionEvents,
  DOC_SESSION_POLL_MS,
  parseDocSessionCursor,
  type DocSessionActivity,
  type DocSessionEventV1,
  type OperatorDocSessionEventsV1,
} from '../core/operator/doc-session-events';
import { decodeDocSessionFinalizationView, type DocSessionFinalizationView } from '../core/operator/doc-session-finalization-view';
import {
  decodeDocSessionCommit,
  decodeDocSessionDiscard,
  type DocSessionCommitInput,
  type DocSessionDiscardInput,
} from '../core/operator/doc-session-finalize';
import {
  decodeOperatorDocSessionDetail,
  decodeOperatorDocSessionList,
  DOC_SESSION_LIST_MAX,
  OPERATOR_SESSION_LIST_PATH,
  type DocSessionDetailRequest,
  type DocSessionListRequest,
  type DocSessionViewState,
  type OperatorDocSessionDetail,
  type OperatorDocSessionList,
} from '../core/operator/doc-session-views';
import type { LocalizedApiError } from './fleet-api';
import { isOperatorMessageKey, type OperatorMessageKey, type OperatorTranslate } from './i18n';
import type { DotTone } from './ui';
import { RETRY_SAME_REQUEST } from './settings';
import { useObservationRefresh } from './useObservationRefresh';

/**
 * Browser side of the doc session routes. The list route is the one
 * availability authority: a server without it answers 404 `not_found`, or 405
 * `method_not_allowed` while only the create POST is mounted on the same path;
 * the list read is then `absent`, and every session control stays hidden.
 */

/** Codes the session reads send in their bare `{code}` body. */
const READ_CODES: readonly string[] = [...DOC_SESSION_READ_FAILURES, 'invalid_cursor', 'events_unavailable'];
/** `unreadable`: a 200 whose body failed the decoder. `unreachable`: no answer, or a code this bundle does not know. */
export type DocSessionReadReason = DocSessionReadFailure | 'invalid_cursor' | 'events_unavailable' | 'unreadable' | 'unreachable';
export const DOC_SESSION_READ_REASONS: readonly DocSessionReadReason[] = [...READ_CODES as DocSessionReadReason[], 'unreadable', 'unreachable'];
export type DocSessionRead<T> = { readonly state: 'ok'; readonly value: T } | { readonly state: 'unavailable'; readonly reason: DocSessionReadReason };
export type DocSessionsRead = DocSessionRead<OperatorDocSessionList> | { readonly state: 'absent' };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The code of a bare `{code}` body or of the `{error:{code}}` envelope that an unknown route sends. */
function bodyCode(body: unknown): string | null {
  if (!isObject(body)) return null;
  if (typeof body.code === 'string') return body.code;
  return isObject(body.error) && typeof body.error.code === 'string' ? body.error.code : null;
}

async function answer<T>(response: Response, decode: (value: unknown) => T): Promise<DocSessionRead<T> | { readonly state: 'absent' }> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = bodyCode(body);
    if ((response.status === 404 && code === 'not_found') || (response.status === 405 && code === 'method_not_allowed')) return { state: 'absent' };
    return { state: 'unavailable', reason: code !== null && READ_CODES.includes(code) ? code as DocSessionReadReason : 'unreachable' };
  }
  try { return { state: 'ok', value: decode(body) }; } catch { return { state: 'unavailable', reason: 'unreadable' }; }
}

/** One session read answer. Only the list route turns a missing route into `absent`. */
export async function sessionReadAnswer<T>(response: Response, decode: (value: unknown) => T): Promise<DocSessionRead<T>> {
  const read = await answer(response, decode);
  return read.state === 'absent' ? { state: 'unavailable', reason: 'unreachable' } : read;
}

/** The list answer, decoded against the request that was sent: the server's `unread` must follow from its `seen`. */
export function docSessionsAnswer(response: Response, request: DocSessionListRequest): Promise<DocSessionsRead> {
  return answer(response, value => decodeOperatorDocSessionList(value, request));
}

async function getJson(url: string, signal: AbortSignal): Promise<Response | null> {
  try {
    return await fetch(url, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    return null;
  }
}

export async function readSession<T>(url: string, decode: (value: unknown) => T, signal: AbortSignal): Promise<DocSessionRead<T>> {
  const response = await getJson(url, signal);
  return response === null ? { state: 'unavailable', reason: 'unreachable' } : sessionReadAnswer(response, decode);
}

export const sessionPath = (sessionId: string, tail = ''): string => `${OPERATOR_SESSION_LIST_PATH}/${encodeURIComponent(sessionId)}${tail}`;

export type DocSessionsReader = (request: DocSessionListRequest, signal: AbortSignal) => Promise<DocSessionsRead>;
export type DocSessionReader<T> = (sessionId: string, signal: AbortSignal) => Promise<DocSessionRead<T>>;
export type DocSessionDetailReader = (request: DocSessionDetailRequest, signal: AbortSignal) => Promise<DocSessionRead<OperatorDocSessionDetail>>;
export type DocSessionDiffReader = DocSessionReader<OperatorDocSessionDiffV1>;
export type DocSessionLossReader = DocSessionReader<OperatorDocSessionLossV1>;
export type DocSessionFinalizationReader = DocSessionReader<DocSessionFinalizationView>;
export type DocSessionEventsReader = (sessionId: string, after: string | null, signal: AbortSignal) => Promise<DocSessionRead<OperatorDocSessionEventsV1>>;

/** `GET /api/v1/sessions?seen=<JSON object>`: the server marks each session unread against the cursor this browser showed. */
export async function fetchDocSessions(request: DocSessionListRequest, signal: AbortSignal): Promise<DocSessionsRead> {
  const response = await getJson(`${OPERATOR_SESSION_LIST_PATH}?${new URLSearchParams({ seen: JSON.stringify(request.seen) })}`, signal);
  return response === null ? { state: 'unavailable', reason: 'unreachable' } : docSessionsAnswer(response, request);
}

/** `GET /api/v1/sessions/<sid>`, with `?seen=<cursor>` once this browser showed the session. */
export function fetchDocSessionDetail(request: DocSessionDetailRequest, signal: AbortSignal): Promise<DocSessionRead<OperatorDocSessionDetail>> {
  const query = request.seen === null ? '' : `?${new URLSearchParams({ seen: request.seen })}`;
  return readSession(sessionPath(request.session_id, query), value => decodeOperatorDocSessionDetail(value, request), signal);
}

export function fetchDocSessionEvents(sessionId: string, after: string | null, signal: AbortSignal): Promise<DocSessionRead<OperatorDocSessionEventsV1>> {
  const query = after === null ? '' : `?${new URLSearchParams({ after })}`;
  return readSession(sessionPath(sessionId, `/events${query}`), value => decodeOperatorDocSessionEvents(value, sessionId, after), signal);
}

export function fetchDocSessionDiff(sessionId: string, signal: AbortSignal): Promise<DocSessionRead<OperatorDocSessionDiffV1>> {
  return readSession(sessionPath(sessionId, '/diff'), value => decodeOperatorDocSessionDiff(value, { session_id: sessionId }), signal);
}

export function fetchDocSessionLoss(sessionId: string, signal: AbortSignal): Promise<DocSessionRead<OperatorDocSessionLossV1>> {
  return readSession(sessionPath(sessionId, '/loss'), value => decodeOperatorDocSessionLoss(value, { session_id: sessionId }), signal);
}

/** The only source of delivery progress and of the Draft PR link. */
export function fetchDocSessionFinalization(sessionId: string, signal: AbortSignal): Promise<DocSessionRead<DocSessionFinalizationView>> {
  return readSession(sessionPath(sessionId, '/finalization'), value => decodeDocSessionFinalizationView(value, { session_id: sessionId }), signal);
}

export type DocSessionCommitStage = 'prepared' | 'committed' | 'pushed' | 'creating_pr' | 'pr_failed' | 'complete';
export type DocSessionDiscardStage = 'removing' | 'removed' | 'complete';
/** The saved journal progress; `decodeDocSessionFinalizationView` admitted exactly these shapes. */
export type DocSessionProgress =
  | { readonly operation: 'commit'; readonly stage: DocSessionCommitStage; readonly commit: string; readonly pushed: boolean; readonly pr: { readonly number: number; readonly url: string } | null }
  | { readonly operation: 'discard'; readonly stage: DocSessionDiscardStage };

export function docSessionProgress(view: DocSessionFinalizationView): DocSessionProgress | null {
  return view.progress as unknown as DocSessionProgress | null;
}

export interface RequestId { readonly request_id: string }

/**
 * `unreachable`: no typed answer arrived, so the request may or may not have
 * run; resending the same request_id replays its recorded result.
 * `unreadable`: a 2xx whose body failed the decoder; the write ran.
 */
export type DocSessionWrite<T> =
  | { readonly state: 'ok'; readonly result: T }
  | { readonly state: 'refused'; readonly status: number; readonly refusal: DocSessionRefusalV1 }
  | { readonly state: 'unreachable' }
  | { readonly state: 'unreadable' };

export async function sessionWriteAnswer<T>(response: Response, decode: (value: unknown) => T): Promise<DocSessionWrite<T>> {
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) {
    try { return { state: 'ok', result: decode(payload) }; } catch { return { state: 'unreadable' }; }
  }
  const refusal = decodeDocSessionRefusal(payload);
  return refusal === null ? { state: 'unreachable' } : { state: 'refused', status: response.status, refusal };
}

/**
 * A commit or discard answer. A 2xx body is not page state: the page reads the
 * progress from `/finalization` after every answer. A refusal or a 503 outcome
 * names the code and next step.
 */
export async function finalizeWriteAnswer(response: Response): Promise<DocSessionWrite<null>> {
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return { state: 'ok', result: null };
  const refusal = docSessionFinalizeRefusal(payload);
  return refusal === null ? { state: 'unreachable' } : { state: 'refused', status: response.status, refusal };
}

/** The write token travels in the HttpOnly cookie the page response set; the browser adds Origin and Sec-Fetch-Site. */
async function post(url: string, body: RequestId): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: 'POST', cache: 'no-store', credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

export async function postSession<T>(url: string, body: RequestId, decode: (value: unknown) => T): Promise<DocSessionWrite<T>> {
  const response = await post(url, body);
  return response === null ? { state: 'unreachable' } : sessionWriteAnswer(response, decode);
}

async function postFinalize(url: string, body: RequestId): Promise<DocSessionWrite<null>> {
  const response = await post(url, body);
  return response === null ? { state: 'unreachable' } : finalizeWriteAnswer(response);
}

export interface DocSessionCreateRequest {
  readonly kind: 'docs';
  readonly runtime: string;
  readonly repository_id: string;
  readonly citations: readonly DocCitationV1[];
  readonly instruction: string;
}
export interface DocSessionMessageRequest { readonly text: string; readonly when: DocSessionMessageWhen }

export type DocSessionCreateWriter = (body: DocSessionCreateRequest & RequestId) => Promise<DocSessionWrite<OperatorDocSessionCreatedV1>>;
export type DocSessionMessageWriter = (sessionId: string, body: DocSessionMessageRequest & RequestId) => Promise<DocSessionWrite<OperatorDocSessionMessageV1>>;
export type DocSessionStopWriter = (sessionId: string, body: RequestId) => Promise<DocSessionWrite<OperatorDocSessionStopV1>>;
export type DocSessionCommitWriter = (sessionId: string, body: DocSessionCommitInput & RequestId) => Promise<DocSessionWrite<null>>;
export type DocSessionDiscardWriter = (sessionId: string, body: DocSessionDiscardInput & RequestId) => Promise<DocSessionWrite<null>>;

export function postDocSessionCreate(body: DocSessionCreateRequest & RequestId): Promise<DocSessionWrite<OperatorDocSessionCreatedV1>> {
  return postSession(OPERATOR_SESSION_LIST_PATH, body, decodeOperatorDocSessionCreated);
}

export function postDocSessionMessage(sessionId: string, body: DocSessionMessageRequest & RequestId): Promise<DocSessionWrite<OperatorDocSessionMessageV1>> {
  return postSession(sessionPath(sessionId, '/messages'), body, value => decodeOperatorDocSessionMessage(value, sessionId));
}

export function postDocSessionStop(sessionId: string, body: RequestId): Promise<DocSessionWrite<OperatorDocSessionStopV1>> {
  return postSession(sessionPath(sessionId, '/stop'), body, value => decodeOperatorDocSessionStop(value, sessionId));
}

export function postDocSessionCommit(sessionId: string, body: DocSessionCommitInput & RequestId): Promise<DocSessionWrite<null>> {
  return postFinalize(sessionPath(sessionId, '/commit'), body);
}

export function postDocSessionDiscard(sessionId: string, body: DocSessionDiscardInput & RequestId): Promise<DocSessionWrite<null>> {
  return postFinalize(sessionPath(sessionId, '/discard'), body);
}

/** After these outcomes a resend of the same body keeps its request_id, as the settings form does. */
export function keepsRequestId(outcome: DocSessionWrite<unknown>): boolean {
  return outcome.state === 'unreachable' || outcome.state === 'unreadable'
    || (outcome.state === 'refused' && RETRY_SAME_REQUEST.has(outcome.refusal.code));
}

export type SessionWriteState<T> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'answered'; readonly outcome: DocSessionWrite<T> };

export interface SessionWrite<B, T> {
  readonly state: SessionWriteState<T>;
  /** Sends `body` with a request_id; null when a send is already running. */
  readonly submit: (body: B) => Promise<DocSessionWrite<T> | null>;
  readonly reset: () => void;
}

/**
 * One write control. `send` binds the target session; a new `send` starts a
 * new request binding. Each submit gets a new request_id unless it resends
 * the exact body of the last send after `keepsRequestId`.
 */
export function useSessionWrite<B extends object, T>(send: (body: B & RequestId) => Promise<DocSessionWrite<T>>): SessionWrite<B, T> {
  const [state, setState] = useState<SessionWriteState<T>>({ kind: 'idle' });
  const pending = useRef<{ readonly body: string; readonly id: string } | null>(null);
  const sending = useRef(false);
  useEffect(() => { pending.current = null; }, [send]);
  const submit = useCallback(async (body: B): Promise<DocSessionWrite<T> | null> => {
    if (sending.current) return null;
    sending.current = true;
    const key = JSON.stringify(body);
    const id = pending.current?.body === key ? pending.current.id : crypto.randomUUID();
    pending.current = { body: key, id };
    setState({ kind: 'sending' });
    // A writer that throws gave no typed answer, the same as a lost connection.
    const outcome = await send({ ...body, request_id: id }).catch((): DocSessionWrite<T> => ({ state: 'unreachable' }));
    if (!keepsRequestId(outcome)) pending.current = null;
    sending.current = false;
    setState({ kind: 'answered', outcome });
    return outcome;
  }, [send]);
  const reset = useCallback(() => setState({ kind: 'idle' }), []);
  return { state, submit, reset };
}

/** A failed refresh keeps the last list and says so; a missing list route is `absent`, never an empty list. */
export type DocSessionsView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'unavailable'; readonly reason: DocSessionReadReason }
  | { readonly kind: 'ready'; readonly list: OperatorDocSessionList; readonly refreshFailed: boolean };

export interface DocSessions {
  readonly view: DocSessionsView;
  readonly reload: () => void;
}

export function useDocSessions(read: DocSessionsReader, generation: number): DocSessions {
  const [view, setView] = useState<DocSessionsView>({ kind: 'loading' });
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const result = await read(docSessionListRequest(), signal);
    if (signal.aborted) return false;
    if (result.state === 'ok') {
      keepSeenFor(result.value.sessions.map(session => session.session_id));
      setView({ kind: 'ready', list: result.value, refreshFailed: false });
    } else if (result.state === 'absent') setView({ kind: 'absent' });
    else setView(current => current.kind === 'ready' ? { ...current, refreshFailed: true } : { kind: 'unavailable', reason: result.reason });
    return result.state !== 'unavailable' || result.reason !== 'unreachable';
  }, [read]);
  const reload = useObservationRefresh(observe, JSON.stringify(['doc-sessions', generation]));
  return { view, reload };
}

/** The list route answered, so this server serves sessions. */
export const docSessionsLive = (view: DocSessionsView): boolean => view.kind === 'ready';

/**
 * Why a list read failed, when the failure shows that the session routes exist. `unreachable` is no answer
 * or an unknown code, so it says nothing about the routes and the session controls stay hidden.
 */
export function listFailure(view: DocSessionsView): DocSessionReadReason | null {
  return view.kind === 'unavailable' && view.reason !== 'unreachable' ? view.reason : null;
}

/**
 * Whether the doc session start controls show: on a server whose list answers. While the list cannot be
 * read for a typed reason, the composer stays and says why, and starts nothing.
 */
export function docSessionStartState(view: DocSessionsView): { readonly show: boolean; readonly failure: DocSessionReadReason | null } {
  const failure = listFailure(view);
  return { show: failure !== null || docSessionsLive(view), failure };
}

/** One read of one session, re-read every 30 s and on `reload`; null until it settles. */
export function useSessionRead<T>(name: string, read: DocSessionReader<T>, sessionId: string | null, generation: number): {
  readonly read: DocSessionRead<T> | null; readonly reload: () => void;
} {
  const [state, setState] = useState<{ readonly id: string; readonly read: DocSessionRead<T> } | null>(null);
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    if (sessionId === null) return false;
    const result = await read(sessionId, signal);
    if (signal.aborted) return false;
    setState({ id: sessionId, read: result });
    return result.state === 'ok' || result.reason !== 'unreachable';
  }, [read, sessionId]);
  const reload = useObservationRefresh(observe, JSON.stringify([name, sessionId, generation]), { enabled: sessionId !== null });
  return { read: state !== null && state.id === sessionId ? state.read : null, reload };
}

/** The detail read sends the cursor this browser last showed and decodes against it. */
export function useDocSessionDetail(read: DocSessionDetailReader, sessionId: string | null, generation: number) {
  const bySession = useCallback((id: string, signal: AbortSignal) => read(docSessionDetailRequest(id), signal), [read]);
  return useSessionRead('doc-session-detail', bySession, sessionId, generation);
}

/**
 * The visible session status, and the only place it is derived: finalization progress first, then the
 * docs host state. A commit or discard that has not completed leaves the status to the host state.
 */
export const DOC_SESSION_STATUSES = ['running', 'awaiting_review', 'pr_open', 'discarded', 'failed'] as const;
export type DocSessionStatus = typeof DOC_SESSION_STATUSES[number];
const STATE_STATUS: Readonly<Record<DocSessionViewState, DocSessionStatus>> = {
  created: 'running', starting: 'running', running: 'running', idle: 'awaiting_review', stopped: 'awaiting_review', failed: 'failed',
};

export function docSessionStatus(state: DocSessionViewState, progress: DocSessionProgress | null): DocSessionStatus {
  if (progress?.stage === 'complete') return progress.operation === 'commit' ? 'pr_open' : 'discarded';
  return STATE_STATUS[state];
}

export const DOC_SESSION_STATUS_TONE: Readonly<Record<DocSessionStatus, DotTone>> = {
  running: 'active', awaiting_review: 'accent', pr_open: 'ok', discarded: 'neutral', failed: 'danger',
};

/** The runtime's display name; an id with no translation shows as the id. */
export function docSessionRuntimeName(runtime: string, t: OperatorTranslate): string {
  const key = `setup.host.${runtime}`;
  return isOperatorMessageKey(key) ? t(key) : runtime;
}

/** The newest cursor this browser showed for each session. The server computes `unread` from it and never stores it. */
export const OPERATOR_SESSION_SEEN_STORAGE_KEY = 'repo-harness:operator-session-seen';
const SID = /^[0-9a-f]{32}$/u;

function readSeen(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(OPERATOR_SESSION_SEEN_STORAGE_KEY) ?? '{}');
    if (!isObject(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] =>
      SID.test(entry[0]) && typeof entry[1] === 'string' && parseDocSessionCursor(entry[1]) !== null));
  } catch {
    return {};
  }
}

function writeSeen(seen: Readonly<Record<string, string>>): void {
  try { localStorage.setItem(OPERATOR_SESSION_SEEN_STORAGE_KEY, JSON.stringify(seen)); } catch { /* Browser storage is an optional UI preference. */ }
}

/** The list request: every stored cursor, within the server's bound. */
export function docSessionListRequest(): DocSessionListRequest {
  return { seen: Object.fromEntries(Object.entries(readSeen()).slice(0, DOC_SESSION_LIST_MAX)) };
}

export function docSessionDetailRequest(sessionId: string): DocSessionDetailRequest {
  return { session_id: sessionId, seen: readSeen()[sessionId] ?? null };
}

/** Drops cursors of sessions the server no longer lists, so the request stays within its bound. */
function keepSeenFor(ids: readonly string[]): void {
  const seen = readSeen();
  const listed = new Set(ids);
  if (Object.keys(seen).every(id => listed.has(id))) return;
  writeSeen(Object.fromEntries(Object.entries(seen).filter(([id]) => listed.has(id))));
}

/** Records that the page showed the session through `cursor`. The seen cursor only moves forward. */
export function markSessionSeen(sessionId: string, cursor: string): void {
  const next = parseDocSessionCursor(cursor);
  if (next === null) return;
  const seen = readSeen();
  const before = seen[sessionId] === undefined ? null : parseDocSessionCursor(seen[sessionId]!);
  if (before !== null && compareDocSessionCursor(next, before) <= 0) return;
  writeSeen({ ...seen, [sessionId]: cursor });
}

/**
 * The first commit and the first discard request of each session. Once the
 * server saved a finalization, a retry must send that request unchanged, so
 * the browser keeps it until the progress reads `complete`. A reload without it
 * cannot resume: the page never builds a new body for a resume.
 */
export const OPERATOR_SESSION_FINALIZE_STORAGE_KEY = 'repo-harness:operator-session-finalize';
export type DocSessionFinalizeOperation = 'commit' | 'discard';

function readFinalize(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(OPERATOR_SESSION_FINALIZE_STORAGE_KEY) ?? '{}');
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

export function storedFinalizeRequest(sessionId: string, operation: 'commit'): DocSessionCommitInput | null;
export function storedFinalizeRequest(sessionId: string, operation: 'discard'): DocSessionDiscardInput | null;
export function storedFinalizeRequest(sessionId: string, operation: DocSessionFinalizeOperation): DocSessionCommitInput | DocSessionDiscardInput | null {
  const entry = readFinalize()[sessionId];
  const body = isObject(entry) ? entry[operation] : undefined;
  if (!isObject(body)) return null;
  // The server's own closed decoders: a stored body that fails them is no request.
  try { return operation === 'commit' ? decodeDocSessionCommit(body) : decodeDocSessionDiscard(body); } catch { return null; }
}

/** Keeps the request before it is sent. A browser that cannot store it still sends it; a reload then cannot resume. */
export function storeFinalizeRequest(sessionId: string, operation: 'commit', body: DocSessionCommitInput): void;
export function storeFinalizeRequest(sessionId: string, operation: 'discard', body: DocSessionDiscardInput): void;
export function storeFinalizeRequest(sessionId: string, operation: DocSessionFinalizeOperation, body: DocSessionCommitInput | DocSessionDiscardInput): void {
  const all = readFinalize();
  const entry = isObject(all[sessionId]) ? all[sessionId] as Record<string, unknown> : {};
  try { localStorage.setItem(OPERATOR_SESSION_FINALIZE_STORAGE_KEY, JSON.stringify({ ...all, [sessionId]: { ...entry, [operation]: body } })); }
  catch { /* See above. */ }
}

/**
 * Refusals that the server throws before it saves the request (PR #1173,
 * `commitLocked` and `discardLocked` ahead of `saveState`, and the `turn_active`
 * and `busy` checks ahead of both). Only on the first send of a body do they
 * prove nothing was saved: once a request may be saved, the same checks also
 * answer a retry.
 */
const UNSAVED_REFUSALS: Readonly<Record<DocSessionFinalizeOperation, ReadonlySet<string>>> = {
  commit: new Set(['diff_changed', 'head_history_unsupported', 'no_changes', 'path_outside_scope', 'generated_region', 'branch_pushed', 'turn_active', 'busy']),
  discard: new Set(['loss_changed', 'turn_active', 'branch_pushed', 'worktree_in_use', 'busy']),
};

export function refusalSavedNothing(operation: DocSessionFinalizeOperation, outcome: DocSessionWrite<unknown>): boolean {
  return outcome.state === 'refused' && UNSAVED_REFUSALS[operation].has(outcome.refusal.code);
}

/** Drops the stored first request of one operation, after the server is known to have saved nothing. */
export function forgetFinalizeRequest(sessionId: string, operation: DocSessionFinalizeOperation): void {
  const all = readFinalize();
  const entry = all[sessionId];
  if (!isObject(entry) || !Object.hasOwn(entry, operation)) return;
  const { [operation]: _, ...rest } = entry;
  try { localStorage.setItem(OPERATOR_SESSION_FINALIZE_STORAGE_KEY, JSON.stringify({ ...all, [sessionId]: rest })); } catch { /* Nothing more to keep. */ }
}

/**
 * The stored first request of one operation. While it exists the server may
 * have saved it, and every later request of the session must carry the same
 * fields. It is released after a first-send refusal that saved nothing, or when
 * a `/finalization` read taken after an answer shows no progress.
 */
export function useFinalizeBinding(sessionId: string, operation: DocSessionFinalizeOperation, read: DocSessionRead<unknown> | null, noProgress: boolean) {
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const latest = useRef(read);
  latest.current = read;
  const waiting = useRef<{ readonly read: DocSessionRead<unknown> | null } | null>(null);
  useEffect(() => {
    if (waiting.current === null || read === waiting.current.read || read?.state !== 'ok') return;
    waiting.current = null;
    if (noProgress) { forgetFinalizeRequest(sessionId, operation); redraw(); }
  }, [read, noProgress, sessionId, operation]);
  const release = useCallback(() => { waiting.current = null; forgetFinalizeRequest(sessionId, operation); redraw(); }, [sessionId, operation]);
  /** An answer left the request open: the next successful `/finalization` read decides. */
  const awaitRead = useCallback(() => { waiting.current = { read: latest.current }; }, []);
  return { release, awaitRead };
}

export function forgetFinalizeRequests(sessionId: string): void {
  const all = readFinalize();
  if (!Object.hasOwn(all, sessionId)) return;
  const { [sessionId]: _, ...rest } = all;
  try { localStorage.setItem(OPERATOR_SESSION_FINALIZE_STORAGE_KEY, JSON.stringify(rest)); } catch { /* Nothing more to keep. */ }
}

/** Refusal copy is keyed by code; a code this bundle does not know shows the server's own sentence. */
export function localizeDocSessionRefusal(refusal: DocSessionRefusalV1, t: OperatorTranslate): LocalizedApiError {
  const message = `docSession.error.${refusal.code}.message`;
  const action = `docSession.error.${refusal.code}.action`;
  return isOperatorMessageKey(message) && isOperatorMessageKey(action)
    ? { message: t(message), next_action: t(action), localized: true }
    : { message: refusal.message, next_action: refusal.next_action, localized: false };
}

export function docSessionReadText(reason: DocSessionReadReason, t: OperatorTranslate): { readonly message: string; readonly next_action: string } {
  return { message: t(`docSession.error.${reason}.message` as OperatorMessageKey), next_action: t(`docSession.error.${reason}.action` as OperatorMessageKey) };
}

/** Starts a timer and returns its cancel. Injected by tests. */
export type PollTimer = (ms: number, run: () => void) => () => void;
const browserTimer: PollTimer = (ms, run) => {
  const id = setTimeout(run, ms);
  return () => clearTimeout(id);
};

/** One read; it resolves the delay before the next read, 0 to read again at once. */
export type PollStep = (signal: AbortSignal) => Promise<number>;

export interface Poll {
  readonly stop: () => void;
  /** Aborts the read in flight and waits until `resume`. */
  readonly pause: () => void;
  readonly resume: () => void;
  /** Reads at once, or right after the read in flight. */
  readonly now: () => void;
}

/** Owns only the read loop: one read at a time, the next one after the delay its step returns. */
export function startPoll(step: PollStep, { timer = browserTimer, paused = false }: { readonly timer?: PollTimer; readonly paused?: boolean } = {}): Poll {
  let stopped = false, held = paused, queued = false;
  let active: AbortController | null = null;
  let cancel: (() => void) | null = null;
  const halt = () => {
    active?.abort(); active = null;
    cancel?.(); cancel = null;
    queued = false;
  };
  const run = () => {
    cancel = null;
    if (stopped || held || active) return;
    const own = new AbortController();
    active = own;
    void step(own.signal).catch(() => DOC_SESSION_POLL_MS.idle).then(delay => {
      if (active !== own) return;
      active = null;
      if (stopped || held) return;
      if (delay === 0 || queued) { queued = false; run(); } else cancel = timer(delay, run);
    });
  };
  run();
  return {
    stop: () => { stopped = true; halt(); },
    pause: () => { held = true; halt(); },
    resume: () => { if (stopped || !held) return; held = false; run(); },
    now: () => {
      if (stopped || held) return;
      if (active) { queued = true; return; }
      cancel?.();
      run();
    },
  };
}

/** Runs `step` while the page is visible, like `useObservationRefresh`; a new step restarts the loop. */
export function usePoll(step: PollStep | null): () => void {
  const pollRef = useRef<Poll | null>(null);
  useEffect(() => {
    if (step === null) return;
    const hidden = () => document.visibilityState === 'hidden';
    const poll = startPoll(step, { paused: hidden() });
    pollRef.current = poll;
    const changed = () => { if (hidden()) poll.pause(); else poll.resume(); };
    document.addEventListener('visibilitychange', changed);
    return () => {
      poll.stop();
      document.removeEventListener('visibilitychange', changed);
      if (pollRef.current === poll) pollRef.current = null;
    };
  }, [step]);
  return useCallback(() => pollRef.current?.now(), []);
}

export interface DocSessionEventsView {
  readonly events: readonly DocSessionEventV1[];
  /** The `after` of the next read: the newest event received, or null. */
  readonly cursor: string | null;
  /** Null until the first page arrives. */
  readonly activity: DocSessionActivity | null;
  /** Why the last read failed; the events already shown stay. */
  readonly failure: DocSessionReadReason | null;
}

export const NO_DOC_SESSION_EVENTS: DocSessionEventsView = Object.freeze({ events: [], cursor: null, activity: null, failure: null });

/** Events in cursor order without duplicates; an epoch after a host restart sorts after the one before. */
export function mergeDocSessionEvents(current: readonly DocSessionEventV1[], page: readonly DocSessionEventV1[]): readonly DocSessionEventV1[] {
  if (page.length === 0) return current;
  const last = current.at(-1);
  if (last === undefined || compareDocSessionCursor(page[0]!, last) > 0) return [...current, ...page];
  const merged = [...current, ...page].sort(compareDocSessionCursor);
  return merged.filter((event, index) => index === 0 || compareDocSessionCursor(event, merged[index - 1]!) !== 0);
}

/**
 * The events read loop of one session: it follows `next_cursor` at once while
 * a page is not complete, then waits the poll interval of the page's activity.
 * A failed read keeps the events and retries at the idle interval.
 */
export function docSessionEventsStep(read: DocSessionEventsReader, sessionId: string, publish: (view: DocSessionEventsView) => void): PollStep {
  let view = NO_DOC_SESSION_EVENTS;
  return async (signal) => {
    const result = await read(sessionId, view.cursor, signal);
    if (signal.aborted) return 0;
    if (result.state === 'unavailable') {
      view = { ...view, failure: result.reason };
      publish(view);
      return DOC_SESSION_POLL_MS.idle;
    }
    const page = result.value;
    view = { events: mergeDocSessionEvents(view.events, page.events), cursor: page.next_cursor ?? view.cursor, activity: page.activity, failure: null };
    publish(view);
    return page.complete ? DOC_SESSION_POLL_MS[page.activity] : 0;
  };
}

export function useDocSessionEvents(read: DocSessionEventsReader, sessionId: string | null): DocSessionEventsView {
  const [state, setState] = useState<{ readonly id: string; readonly view: DocSessionEventsView } | null>(null);
  const step = useMemo(() => sessionId === null ? null : docSessionEventsStep(read, sessionId, view => setState({ id: sessionId, view })), [read, sessionId]);
  usePoll(step);
  return state !== null && state.id === sessionId ? state.view : NO_DOC_SESSION_EVENTS;
}
