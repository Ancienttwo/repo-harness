import type { AgentStatus, RawEvent, Session } from '@botiverse/oar';
import { reduceStatus, promptAndWait, type PromptRunOptions } from '@botiverse/oar/observe';
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';

export const OAR_OBSERVATION_PROTOCOL = 'repo-harness.oar-observation.v1';
export const OAR_OBSERVATION_MAX_BYTES = 64 * 1024 * 1024;
interface HostIdentity { pid: number; identity: string }
interface RequestIdentity { request_id: string; round: number }
export interface OarObservationSnapshot extends RequestIdentity {
  protocol: typeof OAR_OBSERVATION_PROTOCOL;
  host: HostIdentity;
  session_id: string;
  initial_seq: number;
  initial_status: AgentStatus;
  records: RawEvent[];
}
export type OarObservationSink = (snapshot: OarObservationSnapshot) => void;
export function oarObservationFile(round: number): string { return `oar-observation-${round}.json`; }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('OAR_OBSERVATION_INVALID');
  return value as Record<string, unknown>;
}
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function validateStatus(value: unknown): asserts value is AgentStatus {
  const state = object(value);
  if (state.kind === 'idle') {
    if (state.lastTurnOutcome !== undefined) {
      const outcome = object(state.lastTurnOutcome);
      if (!['completed', 'aborted', 'failed'].includes(outcome.kind as string)
        || outcome.kind === 'failed' && !nonempty(outcome.failure)) throw new Error('OAR_OBSERVATION_INVALID');
    }
  } else if (state.kind === 'running') {
    if (!Number.isSafeInteger(state.sinceSeq) || !Number.isFinite(state.lastEventAt)) throw new Error('OAR_OBSERVATION_INVALID');
    if (typeof state.phase === 'string') {
      if (!['waiting_model', 'thinking', 'responding', 'compacting'].includes(state.phase)) throw new Error('OAR_OBSERVATION_INVALID');
    } else {
      const phase = object(state.phase);
      if (!nonempty(phase.tool) || !nonempty(phase.callId) || phase.writing !== undefined && phase.writing !== true) throw new Error('OAR_OBSERVATION_INVALID');
    }
  } else throw new Error('OAR_OBSERVATION_INVALID');
}
function validateRecord(value: unknown, seq: number): asserts value is RawEvent {
  const record = object(value), body = object(record.body);
  if (record.seq !== seq || !nonempty(record.sessionId) || !Number.isFinite(record.receivedAt)
    || !Array.isArray(record.agentPath) || !record.agentPath.every(item => typeof item === 'string')) throw new Error('OAR_OBSERVATION_INVALID');
  if (record.kind === 'frame') {
    if (!nonempty(body.type) || !Object.hasOwn(body, 'native') || !Array.isArray(body.events)
      || body.events.some(event => !nonempty(object(event).kind))) throw new Error('OAR_OBSERVATION_INVALID');
  } else if (record.kind === 'request') {
    if (!nonempty(record.id) || !['toRuntime', 'toApp'].includes(record.direction as string)
      || !['prompt', 'steer', 'queue', 'withdraw', 'abort', 'dispose', 'native'].includes(body.kind as string)) throw new Error('OAR_OBSERVATION_INVALID');
    if (['prompt', 'steer', 'queue'].includes(body.kind as string) && typeof body.input !== 'string') throw new Error('OAR_OBSERVATION_INVALID');
  } else if (record.kind === 'response') {
    if (typeof record.requestId !== 'string' || !['accepted', 'rejected', 'answered', 'exited'].includes(body.kind as string)
      || body.kind === 'rejected' && (!nonempty(body.code) || typeof body.reason !== 'string')) throw new Error('OAR_OBSERVATION_INVALID');
  } else throw new Error('OAR_OBSERVATION_INVALID');
}

/** Replay the SDK checkpoint and exact records with the SDK's own reducer. */
export function replayOarStatus(snapshot: OarObservationSnapshot): AgentStatus {
  const state = snapshot.records.reduce((status, record) => reduceStatus(status, record, snapshot.session_id), snapshot.initial_status);
  validateStatus(state);
  return state;
}
/** Public projection excludes prompts, native payloads, error prose and model claims. */
export function oarObservationView(snapshot: OarObservationSnapshot) {
  const status = replayOarStatus(snapshot);
  const prompt = snapshot.records.find(record => record.kind === 'request' && record.sessionId === snapshot.session_id
    && record.agentPath.length === 0 && record.direction === 'toRuntime' && record.body.kind === 'prompt'
    && record.body.inputId === snapshot.request_id);
  const response = prompt?.kind === 'request' ? snapshot.records.find(record => record.kind === 'response' && record.requestId === prompt.id) : undefined;
  return {
    session_id: snapshot.session_id, request_id: snapshot.request_id, input_id: snapshot.request_id,
    seq: snapshot.records.at(-1)?.seq ?? snapshot.initial_seq,
    status: status.kind,
    phase: status.kind === 'running' ? status.phase : null,
    outcome: status.kind === 'idle' ? status.lastTurnOutcome?.kind ?? null : null,
    failure: status.kind === 'idle' && status.lastTurnOutcome?.kind === 'failed' ? status.lastTurnOutcome.failure : null,
    control: response?.kind === 'response' ? response.body.kind : null,
    rejection: response?.kind === 'response' && response.body.kind === 'rejected' ? response.body.code : null,
  };
}

/** One request capture shared by the two fixed hosts. No new runtime parser. */
export async function promptWithOarObservation(session: Session, request: RequestIdentity, host: HostIdentity,
  input: string, options: PromptRunOptions, save: OarObservationSink) {
  if (!nonempty(request.request_id) || !Number.isSafeInteger(request.round) || request.round < 1) throw new Error('OAR_OBSERVATION_INVALID');
  const initial = session.status();
  const snapshot: OarObservationSnapshot = { protocol: OAR_OBSERVATION_PROTOCOL, request_id: request.request_id, round: request.round,
    host: { pid: host.pid, identity: host.identity },
    session_id: session.id, initial_seq: initial.seq, initial_status: initial.value, records: [] };
  let state = initial.value, lastView = '';
  let promptId: string | undefined, control: string | null = null;
  let captureFailed = false, captureError: unknown, disposal: Promise<void> | undefined;
  const publish = () => {
    if (Buffer.byteLength(JSON.stringify(snapshot)) > OAR_OBSERVATION_MAX_BYTES) throw new Error('OAR_OBSERVATION_LIMIT');
    save({ ...snapshot, records: [...snapshot.records] });
  };
  publish();
  const stop = session.rawEvents(record => {
    snapshot.records.push(record);
    state = reduceStatus(state, record, session.id);
    if (record.kind === 'request' && record.sessionId === session.id && record.agentPath.length === 0
      && record.direction === 'toRuntime' && record.body.kind === 'prompt' && record.body.inputId === request.request_id) promptId = record.id;
    if (record.kind === 'response' && record.requestId === promptId) control = record.body.kind;
    // Text deltas change sequence and time, but not the phase/control projection.
    const view = JSON.stringify({ kind: state.kind, phase: state.kind === 'running' ? state.phase : null,
      outcome: state.kind === 'idle' ? state.lastTurnOutcome?.kind : null,
      failure: state.kind === 'idle' && state.lastTurnOutcome?.kind === 'failed' ? state.lastTurnOutcome.failure : null, control });
    if (!captureFailed && view !== lastView) {
      try { publish(); lastView = view; }
      catch (error) {
        // OAR deliberately swallows observer errors. Keep the failure and stop
        // this Session instead of silently returning a successful capture.
        captureFailed = true; captureError = error;
        disposal = Promise.resolve().then(() => session.dispose());
        void disposal.catch(() => {}); // The finally path awaits the same stop.
      }
    }
  }, { sessionId: session.id, afterSeq: initial.seq });
  try { return await promptAndWait(session, input, { ...options, inputId: request.request_id }); }
  finally {
    stop();
    if (captureFailed) { await disposal; throw captureError; }
    publish();
  }
}

/** An absent capture is unavailable; invalid or mismatched captures are errors. */
export function readOarObservation(path: string, request: RequestIdentity, host: HostIdentity) {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  let value: unknown;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > OAR_OBSERVATION_MAX_BYTES) throw new Error('OAR_OBSERVATION_LIMIT');
    value = JSON.parse(readFileSync(fd, 'utf8'));
  } finally { closeSync(fd); }
  const snapshot = object(value), identity = object(snapshot.host);
  if (snapshot.protocol !== OAR_OBSERVATION_PROTOCOL || !nonempty(snapshot.session_id)
    || !Number.isSafeInteger(snapshot.initial_seq) || (snapshot.initial_seq as number) < -1
    || !Array.isArray(snapshot.records)) throw new Error('OAR_OBSERVATION_INVALID');
  if (snapshot.request_id !== request.request_id || snapshot.round !== request.round
    || identity.pid !== host.pid || identity.identity !== host.identity) throw new Error('OAR_OBSERVATION_IDENTITY_MISMATCH');
  validateStatus(snapshot.initial_status);
  snapshot.records.forEach((record, index) => validateRecord(record, (snapshot.initial_seq as number) + index + 1));
  if (snapshot.records.some(record => record.kind === 'request' && record.direction === 'toRuntime'
    && record.body.kind === 'prompt' && record.body.inputId === request.request_id
    && (record.sessionId !== snapshot.session_id || record.agentPath.length !== 0))) throw new Error('OAR_OBSERVATION_IDENTITY_MISMATCH');
  return oarObservationView(value as OarObservationSnapshot);
}
