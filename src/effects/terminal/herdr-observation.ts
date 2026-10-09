import { createConnection, type Socket } from 'node:net';
import { randomUUID, createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { runtimeInteger, runtimeTime } from '../../core/operator/runtime-status';
import type { ProgramStatusV1 } from '../operator/runtime-status';

/** Schema source revision. Reported version fields do not attest this commit. */
export const HERDR_OBSERVATION_REVISION = 'add5f99a8351e66464f9abec0920778303f0e885';
export const HERDR_OBSERVATION_VERSION = '0.9.3';
export const HERDR_OBSERVATION_PROTOCOL = 22;
const MAX_FRAME_BYTES = 1024 * 1024;
export interface HerdrObservationEndpoint { socket_path: string; deadline_ms: number }
export type HerdrJson = Record<string, unknown>;
export function herdrObject(value: unknown): HerdrJson {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('herdr_observation_shape');
  return value as HerdrJson;
}
export function validateObservationEndpoint(endpoint: HerdrObservationEndpoint): void {
  if (!isAbsolute(endpoint.socket_path) || endpoint.socket_path.includes('\0') || Buffer.byteLength(endpoint.socket_path) > (process.platform === 'darwin' ? 103 : 107) || !Number.isSafeInteger(endpoint.deadline_ms) || endpoint.deadline_ms < 1 || endpoint.deadline_ms > 10_000 || !['linux','darwin'].includes(process.platform)) throw new Error('herdr_observation_endpoint');
}
export function verifyHerdrVersion(value: HerdrJson): void {
  if (value.version !== HERDR_OBSERVATION_VERSION || value.protocol !== HERDR_OBSERVATION_PROTOCOL) throw new Error('herdr_observation_version');
}
/** Terminal facts only. OSC has no dispatch identity or cancellation state. */
export type HerdrProgramStatus = Omit<ProgramStatusV1, 'identity'> & { source_epoch: number };
export function herdrProgramStatus(value: unknown): HerdrProgramStatus {
  const v = herdrObject(value);
  if (Object.keys(v).sort().join() !== 'record,revision,source,source_epoch,updated_at_ms' || v.source !== 'osc7501') throw new Error('herdr_program_status_shape');
  const revision = runtimeInteger(v.revision), source_epoch = runtimeInteger(v.source_epoch), updated = runtimeInteger(v.updated_at_ms);
  if (updated > 8_640_000_000_000_000) throw new Error('herdr_program_status_time');
  const changed_at = runtimeTime(new Date(updated).toISOString());
  if (v.record === null) return { protocol: 'repo-harness.program-status.v1', revision, source_epoch, changed_at, state: 'clear', reason: 'unknown' };
  const record = herdrObject(v.record);
  if (Object.keys(record).some(key => !['state','kind','app','progress'].includes(key)) || !['idle','working','blocked','done','error'].includes(record.state as string) ||
      (record.kind !== undefined && !['permission','question','auth'].includes(record.kind as string)) ||
      (record.kind !== undefined && record.state !== 'blocked') ||
      (record.app !== undefined && (typeof record.app !== 'string' || !/^[A-Za-z0-9_.+-]{1,32}$/.test(record.app))) ||
      (record.progress !== undefined && (!['working','blocked'].includes(record.state as string) || !Number.isInteger(record.progress) || (record.progress as number) < 0 || (record.progress as number) > 100))) throw new Error('herdr_program_status_record');
  return { protocol: 'repo-harness.program-status.v1', revision, source_epoch, changed_at,
    state: record.state === 'done' ? 'settled' : record.state as HerdrProgramStatus['state'], reason: record.kind as HerdrProgramStatus['reason'] ?? 'unknown' };
}
export function herdrAgentSessionKey(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const v = herdrObject(value);
  if (Object.keys(v).sort().join() !== ['agent','kind','source','value'].join() || !['id','path'].includes(v.kind as string) ||
    typeof v.source !== 'string' || v.source.length > 160 || typeof v.agent !== 'string' || v.agent.length > 160 || typeof v.value !== 'string' || !v.value || v.value.length > (v.kind === 'path' ? 4096 : 512)) throw new Error('herdr_observation_session');
  return 'sha256:' + createHash('sha256').update(JSON.stringify({ source: v.source, agent: v.agent, kind: v.kind, value: v.value })).digest('hex');
}
/** Each connection owns its frame buffer; subscriptions do not share a sequence with snapshots. */
function connection(endpoint: HerdrObservationEndpoint, onFrame: (value: HerdrJson) => void, onFailure: (code: string) => void): Socket {
  validateObservationEndpoint(endpoint);
  const socket = createConnection(endpoint.socket_path);
  let buffer = Buffer.alloc(0), failed = false;
  const fail = () => { if (!failed) { failed = true; onFailure('herdr_observation_transport'); } socket.destroy(); };
  socket.on('data', (chunk: Buffer) => {
    try {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const end = buffer.indexOf(10);
        if (end < 0) break;
        if (end > MAX_FRAME_BYTES) throw new Error('frame_limit');
        const line = buffer.subarray(0, end); buffer = buffer.subarray(end + 1);
        const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line));
        onFrame(herdrObject(value));
      }
      if (buffer.length > MAX_FRAME_BYTES) throw new Error('frame_limit');
    } catch { fail(); }
  });
  socket.on('error', fail);
  socket.on('close', fail);
  return socket;
}
function response(frame: HerdrJson, id: string): HerdrJson {
  if (frame.id !== id) throw new Error('herdr_observation_response_id');
  if (frame.error !== undefined) throw new Error(herdrObject(frame.error).code === 'events_lost' ? 'events_lost' : 'herdr_observation_rejected');
  if (Object.keys(frame).sort().join() !== 'id,result') throw new Error('herdr_observation_response');
  return herdrObject(frame.result);
}
export function requestHerdrObservation(endpoint: HerdrObservationEndpoint, method: 'ping' | 'session.snapshot', signal?: AbortSignal): Promise<HerdrJson> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const id = randomUUID();
    const finish = (error?: Error, value?: HerdrJson) => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort); socket.destroy();
      if (error) reject(error); else resolve(value!);
    };
    const socket = connection(endpoint, frame => { try { finish(undefined, response(frame, id)); } catch (error) { finish(error as Error); } }, code => finish(new Error(code)));
    const abort = () => finish(new Error('herdr_observation_aborted'));
    const timer = setTimeout(() => finish(new Error('herdr_observation_timeout')), endpoint.deadline_ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    socket.once('connect', () => socket.write(JSON.stringify({ id, method, params: {} }) + '\n'));
  });
}
export function subscribeHerdrObservation(endpoint: HerdrObservationEndpoint, subscriptions: readonly HerdrJson[],
  onEvent: (event: string) => void, onClose: (code: string) => void, signal?: AbortSignal): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const id = randomUUID(); let acknowledged = false, closed = false;
    const stop = () => { closed = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); socket.destroy(); };
    const fail = (code: string) => {
      if (closed) return; stop();
      if (!acknowledged) reject(new Error(code)); else onClose(code);
    };
    const socket = connection(endpoint, frame => {
      try {
        if (!acknowledged || frame.error !== undefined) {
          const result = response(frame, id);
          if (result.type !== 'subscription_started') throw new Error('herdr_observation_subscription');
          acknowledged = true; clearTimeout(timer); resolve(stop); return;
        }
        // Official EventKind is snake_case; agent-status SubscriptionEventKind is dotted.
        if (typeof frame.event !== 'string' || frame.data === undefined) throw new Error('herdr_observation_event');
        onEvent(frame.event);
      } catch (error) { fail((error as Error).message); }
    }, fail);
    const abort = () => fail('herdr_observation_aborted');
    const timer = setTimeout(() => fail('herdr_observation_timeout'), endpoint.deadline_ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    socket.once('connect', () => socket.write(JSON.stringify({ id, method: 'events.subscribe', params: { subscriptions } }) + '\n'));
  });
}
