/** A derived capture cache. These fields do not contain task acceptance evidence. */
export const RUNTIME_CAPTURE_PROTOCOL = 'repo-harness.runtime-capture.v1' as const;
export const RUNTIME_CAPTURE_MAX_BYTES = 256 * 1024;
export const RUNTIME_CAPTURE_MAX_FRAME_BYTES = 256 * 1024;
export const RUNTIME_CAPTURE_MAX_OBSERVATIONS = 64;
export const RUNTIME_CAPTURE_MAX_ID_LENGTH = 160;
export type NativeRuntimeProvider = 'codex' | 'claude' | 'pi';
export type NativeRuntimeState = 'unknown' | 'idle' | 'working' | 'blocked' | 'settled' | 'error' | 'cancelled';
export type NativeRuntimeReason = 'permission' | 'question' | 'auth' | 'unknown';
export interface NativeRuntimeObservation {
  scope: 'session' | 'terminal';
  session_id: string | null;
  turn_id: string | null;
  state: NativeRuntimeState;
  reason: NativeRuntimeReason;
  event_received_at: string;
  changed_at: string | null;
}
export interface RuntimeCaptureSnapshot {
  protocol: typeof RUNTIME_CAPTURE_PROTOCOL;
  source_id: string;
  generation: string;
  sequence: number;
  provider: NativeRuntimeProvider;
  format: 'codex-app-server' | 'osc7501';
  capture_status: 'connected' | 'disconnected' | 'unavailable';
  heartbeat_at: string;
  observations: NativeRuntimeObservation[];
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('runtime_capture_shape');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]): void {
  if (Object.keys(value).sort().join(',') !== expected.sort().join(',')) throw new Error('runtime_capture_fields');
}
export function runtimeCaptureId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:+-]{1,160}$/.test(value)) throw new Error('runtime_capture_id');
  return value;
}
export function runtimeCaptureTime(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('runtime_capture_time');
  return value;
}
export function decodeNativeRuntimeObservation(value: unknown): NativeRuntimeObservation {
  const v = object(value);
  keys(v, ['scope', 'session_id', 'turn_id', 'state', 'reason', 'event_received_at', 'changed_at']);
  if (!['session', 'terminal'].includes(v.scope as string) || !['unknown', 'idle', 'working', 'blocked', 'settled', 'error', 'cancelled'].includes(v.state as string) || !['permission', 'question', 'auth', 'unknown'].includes(v.reason as string) || (v.state !== 'blocked' && v.reason !== 'unknown')) throw new Error('runtime_capture_observation');
  if (v.scope === 'terminal' && (v.session_id !== null || v.turn_id !== null)) throw new Error('runtime_capture_terminal_identity');
  if (v.scope === 'session' && v.session_id === null) throw new Error('runtime_capture_session_identity');
  return { scope: v.scope as NativeRuntimeObservation['scope'], session_id: v.session_id === null ? null : runtimeCaptureId(v.session_id), turn_id: v.turn_id === null ? null : runtimeCaptureId(v.turn_id), state: v.state as NativeRuntimeState, reason: v.reason as NativeRuntimeReason, event_received_at: runtimeCaptureTime(v.event_received_at), changed_at: v.changed_at === null ? null : runtimeCaptureTime(v.changed_at) };
}
export function decodeRuntimeCaptureSnapshot(value: unknown): RuntimeCaptureSnapshot {
  const v = object(value);
  keys(v, ['protocol', 'source_id', 'generation', 'sequence', 'provider', 'format', 'capture_status', 'heartbeat_at', 'observations']);
  if (v.protocol !== RUNTIME_CAPTURE_PROTOCOL || !['codex', 'claude', 'pi'].includes(v.provider as string) || (v.provider === 'codex' ? v.format !== 'codex-app-server' : v.format !== 'osc7501') || !['connected', 'disconnected', 'unavailable'].includes(v.capture_status as string)) throw new Error('runtime_capture_protocol');
  if (typeof v.generation !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.generation) || !Number.isSafeInteger(v.sequence) || (v.sequence as number) < 0) throw new Error('runtime_capture_sequence');
  if (!Array.isArray(v.observations) || v.observations.length > RUNTIME_CAPTURE_MAX_OBSERVATIONS) throw new Error('runtime_capture_limit');
  const observations = v.observations.map(decodeNativeRuntimeObservation);
  if (observations.some(o => o.scope !== (v.provider === 'codex' ? 'session' : 'terminal')) || (v.provider !== 'codex' && observations.length > 1) || new Set(observations.map(o => o.session_id)).size !== observations.length) throw new Error('runtime_capture_identity');
  const snapshot: RuntimeCaptureSnapshot = { protocol: RUNTIME_CAPTURE_PROTOCOL, source_id: runtimeCaptureId(v.source_id), generation: v.generation.toLowerCase(), sequence: v.sequence as number, provider: v.provider as NativeRuntimeProvider, format: v.format as RuntimeCaptureSnapshot['format'], capture_status: v.capture_status as RuntimeCaptureSnapshot['capture_status'], heartbeat_at: runtimeCaptureTime(v.heartbeat_at), observations };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > RUNTIME_CAPTURE_MAX_BYTES) throw new Error('runtime_capture_limit');
  return snapshot;
}
