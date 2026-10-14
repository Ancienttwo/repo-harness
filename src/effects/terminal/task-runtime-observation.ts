import type { AgentStatus, FailureClass, RejectionCode, RunningPhase, Session, TurnOutcome } from '@botiverse/oar';
import { reduceStatus, promptAndWait, type PromptRunOptions } from '@botiverse/oar/observe';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

export const OAR_OBSERVATION_PROTOCOL = 'repo-harness.oar-observation.v2';
export const OAR_OBSERVATION_MAX_BYTES = 16 * 1024;
export const OAR_OBSERVATION_REFRESH_MS = 1000;
const failureClasses: Record<FailureClass, true> = {
  auth: true, quota: true, rate_limited: true, billing: true, model_unavailable: true,
  input_too_large: true, invalid_request: true, overloaded: true, provider: true,
  runtime_exited: true, limit_reached: true, output_schema: true, unknown: true,
};
const rejectionCodes: Record<RejectionCode, true> = {
  busy: true, no_active_turn: true, not_queued: true, unsupported: true,
  runtime_exited: true, disposed: true, runtime_refused: true, error: true,
};
interface HostIdentity { pid: number; identity: string }
interface RequestIdentity { request_id: string; round: number }
export interface OarObservationSnapshot extends RequestIdentity {
  protocol: typeof OAR_OBSERVATION_PROTOCOL;
  host: HostIdentity;
  session_id: string;
  input_id: string;
  seq: number;
  status: AgentStatus['kind'];
  phase: RunningPhase | null;
  since_seq: number | null;
  last_event_at: number | null;
  outcome: TurnOutcome['kind'] | null;
  failure: FailureClass | null;
  control: 'accepted' | 'rejected' | null;
  rejection: RejectionCode | null;
}
export type OarObservationSink = (snapshot: OarObservationSnapshot) => void;
export function oarObservationFile(round: number): string { return `oar-observation-${round}.json`; }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('OAR_OBSERVATION_INVALID');
  return value as Record<string, unknown>;
}
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 1024; }
function keys(value: Record<string, unknown>, expected: string[]) {
  if (Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) throw new Error('OAR_OBSERVATION_INVALID');
}
function sequence(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= -1; }
function timestamp(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function validateSnapshot(value: unknown): asserts value is OarObservationSnapshot {
  const snapshot = object(value), host = object(snapshot.host);
  keys(snapshot, ['protocol', 'host', 'request_id', 'round', 'session_id', 'input_id', 'seq', 'status', 'phase', 'since_seq', 'last_event_at', 'outcome', 'failure', 'control', 'rejection']);
  keys(host, ['pid', 'identity']);
  if (snapshot.protocol !== OAR_OBSERVATION_PROTOCOL || !text(snapshot.session_id) || !text(snapshot.request_id)
    || snapshot.input_id !== snapshot.request_id || !Number.isSafeInteger(snapshot.round) || (snapshot.round as number) < 1
    || !Number.isSafeInteger(host.pid) || (host.pid as number) < 1 || !text(host.identity) || !sequence(snapshot.seq)
    || snapshot.last_event_at !== null && !timestamp(snapshot.last_event_at)) throw new Error('OAR_OBSERVATION_INVALID');
  if (snapshot.status === 'idle') {
    if (snapshot.phase !== null || snapshot.since_seq !== null) throw new Error('OAR_OBSERVATION_INVALID');
  } else if (snapshot.status === 'running') {
    if (!sequence(snapshot.since_seq) || snapshot.since_seq < 0 || snapshot.since_seq > snapshot.seq || !timestamp(snapshot.last_event_at)) throw new Error('OAR_OBSERVATION_INVALID');
    if (typeof snapshot.phase === 'string') {
      if (!['waiting_model', 'thinking', 'responding', 'compacting'].includes(snapshot.phase)) throw new Error('OAR_OBSERVATION_INVALID');
    } else {
      const phase = object(snapshot.phase);
      keys(phase, phase.writing === undefined ? ['tool', 'callId'] : ['tool', 'callId', 'writing']);
      if (!text(phase.tool) || !text(phase.callId) || phase.writing !== undefined && phase.writing !== true) throw new Error('OAR_OBSERVATION_INVALID');
    }
  } else throw new Error('OAR_OBSERVATION_INVALID');
  if (snapshot.control !== null && snapshot.control !== 'accepted' && snapshot.control !== 'rejected'
    || snapshot.rejection !== null && (!text(snapshot.rejection) || !Object.hasOwn(rejectionCodes, snapshot.rejection))
    || (snapshot.control === 'rejected') !== (snapshot.rejection !== null)
    || snapshot.outcome !== null && !['completed', 'aborted', 'failed'].includes(snapshot.outcome as string)
    || snapshot.outcome !== null && snapshot.control !== 'accepted'
    || snapshot.failure !== null && (!text(snapshot.failure) || !Object.hasOwn(failureClasses, snapshot.failure))
    || (snapshot.outcome === 'failed') !== (snapshot.failure !== null)) throw new Error('OAR_OBSERVATION_INVALID');
}

/** Closed observation fields only. TaskResult remains the completion authority. */
export function oarObservationView(snapshot: OarObservationSnapshot) {
  const { protocol: _protocol, host: _host, round: _round, ...view } = snapshot;
  return view;
}

/** Fold once in the owned host. Never copy the Session log into a capture. */
export async function promptWithOarObservation(session: Session, request: RequestIdentity, host: HostIdentity,
  input: string, options: PromptRunOptions, save: OarObservationSink) {
  const initial = session.status();
  let state = initial.value;
  const snapshot: OarObservationSnapshot = { protocol: OAR_OBSERVATION_PROTOCOL, request_id: request.request_id, round: request.round,
    host: { pid: host.pid, identity: host.identity }, session_id: session.id, input_id: request.request_id, seq: initial.seq,
    status: state.kind, phase: state.kind === 'running' ? state.phase : null,
    since_seq: state.kind === 'running' ? state.sinceSeq : null,
    last_event_at: state.kind === 'running' ? state.lastEventAt : null,
    outcome: null, failure: null, control: null, rejection: null };
  let promptId: string | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let captureFailed = false, captureError: unknown, disposal: Promise<void> | undefined;
  let lastPublishedAt = 0;
  const publish = () => {
    validateSnapshot(snapshot);
    // The sink uses this same pretty JSON format. Bound encoded bytes too.
    if (Buffer.byteLength(JSON.stringify(snapshot, null, 2)) > OAR_OBSERVATION_MAX_BYTES) throw new Error('OAR_OBSERVATION_LIMIT');
    save({ ...snapshot, host: { ...snapshot.host }, phase: typeof snapshot.phase === 'object' && snapshot.phase !== null ? { ...snapshot.phase } : snapshot.phase });
    lastPublishedAt = performance.now();
  };
  const fail = (error: unknown) => {
    if (captureFailed) return;
    // OAR swallows observer errors. Retain the error and await disposal below.
    captureFailed = true; captureError = error;
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    disposal = Promise.resolve().then(() => session.dispose());
    void disposal.catch(() => {});
  };
  const schedule = () => {
    timer = setTimeout(() => {
      timer = undefined;
      // Timers can wake early. Enforce the interval with the monotonic clock.
      if (performance.now() - lastPublishedAt < OAR_OBSERVATION_REFRESH_MS) { schedule(); return; }
      try { publish(); } catch (error) { fail(error); }
    }, Math.max(1, Math.ceil(lastPublishedAt + OAR_OBSERVATION_REFRESH_MS - performance.now())));
  };
  publish();
  const stop = session.rawEvents(record => {
    if (captureFailed) return;
    try {
      state = reduceStatus(state, record, session.id);
      snapshot.seq = record.seq;
      snapshot.status = state.kind;
      snapshot.phase = state.kind === 'running' ? state.phase : null;
      snapshot.since_seq = state.kind === 'running' ? state.sinceSeq : null;
      snapshot.last_event_at = state.kind === 'running' ? state.lastEventAt : record.receivedAt;
      if (record.kind === 'request' && record.sessionId === session.id && record.agentPath.length === 0
        && record.direction === 'toRuntime' && record.body.kind === 'prompt' && record.body.inputId === request.request_id) promptId = record.id;
      if (record.kind === 'response' && record.requestId === promptId && (record.body.kind === 'accepted' || record.body.kind === 'rejected')) {
        snapshot.control = record.body.kind;
        snapshot.rejection = record.body.kind === 'rejected' ? record.body.code : null;
      }
      if (timer === undefined) schedule();
    } catch (error) { fail(error); }
  }, { sessionId: session.id, afterSeq: initial.seq });
  try {
    const run = await promptAndWait(session, input, { ...options, inputId: request.request_id });
    // Only this input-scoped SDK result can set outcome. An old idle outcome
    // from the reused Session must never become this request's outcome.
    snapshot.control = run.result.kind;
    snapshot.rejection = run.kind === 'rejected' ? run.code : null;
    snapshot.outcome = run.kind === 'rejected' ? null : run.outcome.kind;
    snapshot.failure = run.kind !== 'rejected' && run.outcome.kind === 'failed' ? run.outcome.failure : null;
    return run;
  } finally {
    stop();
    if (timer !== undefined) clearTimeout(timer);
    if (captureFailed) { await disposal; throw captureError; }
    // Flush the final state even when the last event fell inside the interval.
    publish();
  }
}

/** Missing is unavailable. Unknown shapes, including v1 raw logs, fail closed. */
export function readOarObservation(path: string, request: RequestIdentity, host: HostIdentity) {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  let value: unknown;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > OAR_OBSERVATION_MAX_BYTES) throw new Error('OAR_OBSERVATION_LIMIT');
    const bytes = Buffer.alloc(OAR_OBSERVATION_MAX_BYTES + 1);
    let size = 0, count: number;
    while (size < bytes.length && (count = readSync(fd, bytes, size, bytes.length - size, null)) > 0) size += count;
    if (size > OAR_OBSERVATION_MAX_BYTES) throw new Error('OAR_OBSERVATION_LIMIT');
    value = JSON.parse(bytes.subarray(0, size).toString('utf8'));
  } finally { closeSync(fd); }
  validateSnapshot(value);
  if (value.request_id !== request.request_id || value.round !== request.round
    || value.host.pid !== host.pid || value.host.identity !== host.identity) throw new Error('OAR_OBSERVATION_IDENTITY_MISMATCH');
  return oarObservationView(value);
}
