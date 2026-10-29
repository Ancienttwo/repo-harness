import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocCitationV1 } from '../core/operator/doc-citation';
import {
  decodeDocSessionRefusal,
  decodeOperatorDocSessionCommit,
  decodeOperatorDocSessionCreated,
  decodeOperatorDocSessionDetail,
  decodeOperatorDocSessionDiscard,
  decodeOperatorDocSessionMessage,
  decodeOperatorDocSessions,
  decodeOperatorDocSessionStop,
  type DocSessionAgentState,
  type DocSessionMessageWhen,
  type DocSessionOutcome,
  type DocSessionRefusalV1,
  type DocSessionSummaryV1,
  type OperatorDocSessionCommitV1,
  type OperatorDocSessionCreatedV1,
  type OperatorDocSessionDetailV1,
  type OperatorDocSessionDiscardV1,
  type OperatorDocSessionMessageV1,
  type OperatorDocSessionsV1,
  type OperatorDocSessionStopV1,
  type SessionKind,
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
import type { LocalizedApiError } from './fleet-api';
import { isOperatorMessageKey, type OperatorMessageKey, type OperatorTranslate } from './i18n';
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
export type DocSessionsRead = DocSessionRead<OperatorDocSessionsV1> | { readonly state: 'absent' };

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

export function docSessionsAnswer(response: Response): Promise<DocSessionsRead> {
  return answer(response, decodeOperatorDocSessions);
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

const SESSIONS_PATH = '/api/v1/sessions';
export const sessionPath = (sessionId: string, tail = ''): string => `${SESSIONS_PATH}/${encodeURIComponent(sessionId)}${tail}`;

export type DocSessionsReader = (signal: AbortSignal) => Promise<DocSessionsRead>;
export type DocSessionReader<T> = (sessionId: string, signal: AbortSignal) => Promise<DocSessionRead<T>>;
export type DocSessionDetailReader = DocSessionReader<OperatorDocSessionDetailV1>;
export type DocSessionDiffReader = DocSessionReader<OperatorDocSessionDiffV1>;
export type DocSessionLossReader = DocSessionReader<OperatorDocSessionLossV1>;
export type DocSessionEventsReader = (sessionId: string, after: string | null, signal: AbortSignal) => Promise<DocSessionRead<OperatorDocSessionEventsV1>>;

export async function fetchDocSessions(signal: AbortSignal): Promise<DocSessionsRead> {
  const response = await getJson(SESSIONS_PATH, signal);
  return response === null ? { state: 'unavailable', reason: 'unreachable' } : docSessionsAnswer(response);
}

export function fetchDocSessionDetail(sessionId: string, signal: AbortSignal): Promise<DocSessionRead<OperatorDocSessionDetailV1>> {
  return readSession(sessionPath(sessionId), value => decodeOperatorDocSessionDetail(value, sessionId), signal);
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

/** The write token travels in the HttpOnly cookie the page response set; the browser adds Origin and Sec-Fetch-Site. */
export async function postSession<T>(url: string, body: RequestId, decode: (value: unknown) => T): Promise<DocSessionWrite<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST', cache: 'no-store', credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { state: 'unreachable' };
  }
  return sessionWriteAnswer(response, decode);
}

export interface DocSessionCreateRequest {
  readonly kind: 'docs';
  readonly runtime: string;
  readonly repository_id: string;
  readonly citations: readonly DocCitationV1[];
  readonly instruction: string;
}
export interface DocSessionMessageRequest { readonly text: string; readonly when: DocSessionMessageWhen }
export interface DocSessionCommitRequest { readonly expected_head: string; readonly expected_diff_sha256: string; readonly message: string }
export interface DocSessionDiscardRequest { readonly expected_head: string; readonly expected_loss_sha256: string }

export type DocSessionCreateWriter = (body: DocSessionCreateRequest & RequestId) => Promise<DocSessionWrite<OperatorDocSessionCreatedV1>>;
export type DocSessionMessageWriter = (sessionId: string, body: DocSessionMessageRequest & RequestId) => Promise<DocSessionWrite<OperatorDocSessionMessageV1>>;
export type DocSessionStopWriter = (sessionId: string, body: RequestId) => Promise<DocSessionWrite<OperatorDocSessionStopV1>>;
export type DocSessionCommitWriter = (sessionId: string, body: DocSessionCommitRequest & RequestId) => Promise<DocSessionWrite<OperatorDocSessionCommitV1>>;
export type DocSessionDiscardWriter = (sessionId: string, body: DocSessionDiscardRequest & RequestId) => Promise<DocSessionWrite<OperatorDocSessionDiscardV1>>;

export function postDocSessionCreate(body: DocSessionCreateRequest & RequestId): Promise<DocSessionWrite<OperatorDocSessionCreatedV1>> {
  return postSession(SESSIONS_PATH, body, decodeOperatorDocSessionCreated);
}

export function postDocSessionMessage(sessionId: string, body: DocSessionMessageRequest & RequestId): Promise<DocSessionWrite<OperatorDocSessionMessageV1>> {
  return postSession(sessionPath(sessionId, '/messages'), body, value => decodeOperatorDocSessionMessage(value, sessionId));
}

export function postDocSessionStop(sessionId: string, body: RequestId): Promise<DocSessionWrite<OperatorDocSessionStopV1>> {
  return postSession(sessionPath(sessionId, '/stop'), body, value => decodeOperatorDocSessionStop(value, sessionId));
}

export function postDocSessionCommit(sessionId: string, body: DocSessionCommitRequest & RequestId): Promise<DocSessionWrite<OperatorDocSessionCommitV1>> {
  return postSession(sessionPath(sessionId, '/commit'), body, value => decodeOperatorDocSessionCommit(value, sessionId));
}

export function postDocSessionDiscard(sessionId: string, body: DocSessionDiscardRequest & RequestId): Promise<DocSessionWrite<OperatorDocSessionDiscardV1>> {
  return postSession(sessionPath(sessionId, '/discard'), body, value => decodeOperatorDocSessionDiscard(value, sessionId));
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
  | { readonly kind: 'ready'; readonly list: OperatorDocSessionsV1; readonly refreshFailed: boolean };

export interface DocSessions {
  readonly view: DocSessionsView;
  readonly reload: () => void;
}

export function useDocSessions(read: DocSessionsReader, generation: number): DocSessions {
  const [view, setView] = useState<DocSessionsView>({ kind: 'loading' });
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const result = await read(signal);
    if (signal.aborted) return false;
    if (result.state === 'ok') setView({ kind: 'ready', list: result.value, refreshFailed: false });
    else if (result.state === 'absent') setView({ kind: 'absent' });
    else setView(current => current.kind === 'ready' ? { ...current, refreshFailed: true } : { kind: 'unavailable', reason: result.reason });
    return result.state !== 'unavailable' || result.reason !== 'unreachable';
  }, [read]);
  const reload = useObservationRefresh(observe, JSON.stringify(['doc-sessions', generation]));
  return { view, reload };
}

/** The session kinds this server can start; none while the list is absent or unread. */
export function startableKinds(view: DocSessionsView): readonly SessionKind[] {
  return view.kind === 'ready' ? view.list.kinds : [];
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

export function useDocSessionDetail(read: DocSessionDetailReader, sessionId: string | null, generation: number) {
  return useSessionRead('doc-session-detail', read, sessionId, generation);
}

/** The visible session status: the outcome first, then the docs host lifecycle. The only place it is derived. */
export const DOC_SESSION_STATUSES = ['running', 'awaiting_review', 'pr_open', 'discarded', 'cleaned', 'failed'] as const;
export type DocSessionStatus = typeof DOC_SESSION_STATUSES[number];
const AGENT_STATUS: Readonly<Record<DocSessionAgentState, DocSessionStatus>> = {
  starting: 'running', running: 'running', idle: 'awaiting_review', stopped: 'awaiting_review', failed: 'failed',
};

export function docSessionStatus(agent: DocSessionAgentState, outcome: DocSessionOutcome | null): DocSessionStatus {
  return outcome ?? AGENT_STATUS[agent];
}

/** The newest cursor this browser showed for each session. */
export const OPERATOR_SESSION_SEEN_STORAGE_KEY = 'repo-harness:operator-session-seen';

function readSeen(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(OPERATOR_SESSION_SEEN_STORAGE_KEY) ?? '{}');
    if (!isObject(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && parseDocSessionCursor(entry[1]) !== null));
  } catch {
    return {};
  }
}

const newer = (cursor: string, than: string | undefined): boolean => {
  const next = parseDocSessionCursor(cursor);
  const seen = than === undefined ? null : parseDocSessionCursor(than);
  return next !== null && (seen === null || compareDocSessionCursor(next, seen) > 0);
};

/** Records that the page showed the session through `cursor`. The seen cursor only moves forward. */
export function markSessionSeen(sessionId: string, cursor: string): void {
  try {
    const seen = readSeen();
    if (!newer(cursor, seen[sessionId])) return;
    localStorage.setItem(OPERATOR_SESSION_SEEN_STORAGE_KEY, JSON.stringify({ ...seen, [sessionId]: cursor }));
  } catch { /* Browser storage is an optional UI preference. */ }
}

/** A session has unread events when its newest event is after the last one this browser showed. */
export function isSessionUnread(summary: Pick<DocSessionSummaryV1, 'session_id' | 'last_event'>): boolean {
  return summary.last_event !== null && newer(summary.last_event, readSeen()[summary.session_id]);
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
