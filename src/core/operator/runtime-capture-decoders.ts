import { RUNTIME_CAPTURE_MAX_FRAME_BYTES, RUNTIME_CAPTURE_MAX_OBSERVATIONS, runtimeCaptureId, runtimeCaptureTime, type NativeRuntimeObservation, type NativeRuntimeReason, type NativeRuntimeState } from './runtime-capture';

type ObjectValue = Record<string, unknown>;
function object(v: unknown): ObjectValue {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('runtime_capture_event_shape');
  return v as ObjectValue;
}
function nativeTime(value: unknown, multiplier: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value * multiplier > 8_640_000_000_000_000) throw new Error('runtime_capture_event_time');
  return runtimeCaptureTime(new Date(value * multiplier).toISOString());
}
function status(value: unknown): { state: NativeRuntimeState; reason: NativeRuntimeReason } {
  const v = object(value);
  if (v.type === 'notLoaded') return { state: 'unknown', reason: 'unknown' };
  if (v.type === 'idle') return { state: 'idle', reason: 'unknown' };
  if (v.type === 'systemError') return { state: 'error', reason: 'unknown' };
  if (v.type !== 'active' || !Array.isArray(v.activeFlags) || v.activeFlags.some(f => !['waitingOnApproval', 'waitingOnUserInput'].includes(f))) throw new Error('runtime_capture_event_status');
  if (v.activeFlags.includes('waitingOnApproval')) return { state: 'blocked', reason: 'permission' };
  if (v.activeFlags.includes('waitingOnUserInput')) return { state: 'blocked', reason: 'question' };
  return { state: 'working', reason: 'unknown' };
}
/** Tap only known server events. It never sends an RPC or retains event payloads. */
export class CodexRuntimeDecoder {
  private frame = new Uint8Array(RUNTIME_CAPTURE_MAX_FRAME_BYTES);
  private length = 0;
  private failed = false;
  private readonly sessions = new Map<string, NativeRuntimeObservation>();
  constructor(private readonly onChange: (observations: NativeRuntimeObservation[]) => void, private readonly onFailure: () => void) {}
  feed(bytes: Uint8Array, receivedAt: string): void {
    if (this.failed) return;
    try {
      runtimeCaptureTime(receivedAt);
      for (const byte of bytes) {
        if (byte === 10) {
          if (this.length) this.event(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(this.frame.subarray(0, this.length))), receivedAt);
          this.length = 0;
        } else {
          if (this.length === this.frame.length) throw new Error('runtime_capture_frame_limit');
          this.frame[this.length++] = byte;
        }
      }
    } catch { this.failed = true; this.length = 0; this.sessions.clear(); this.onFailure(); }
  }
  end(): void { if (!this.failed && this.length) { this.failed = true; this.length = 0; this.sessions.clear(); this.onFailure(); } }
  private event(value: unknown, receivedAt: string): void {
    const v = object(value);
    if (typeof v.method !== 'string') return; // Responses have no runtime meaning.
    const methods = ['thread/started', 'thread/status/changed', 'thread/closed', 'thread/deleted', 'turn/started', 'turn/completed', 'item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval', 'item/tool/requestUserInput', 'mcpServer/elicitation/request', 'error'];
    if (!methods.includes(v.method)) return;
    const p = object(v.params);
    let sessionId: string, turnId: string | null = null, changedAt: string | null = null;
    let next: { state: NativeRuntimeState; reason: NativeRuntimeReason };
    if (v.method === 'thread/started') {
      const thread = object(p.thread); sessionId = runtimeCaptureId(thread.id); next = status(thread.status);
    } else {
      sessionId = runtimeCaptureId(p.threadId);
      if (v.method === 'thread/closed' || v.method === 'thread/deleted') {
        if (this.sessions.delete(sessionId)) this.publish();
        return;
      }
      if (v.method === 'thread/status/changed') { next = status(p.status); turnId = this.sessions.get(sessionId)?.turn_id ?? null; }
      else if (v.method === 'turn/started' || v.method === 'turn/completed') {
        const turn = object(p.turn); turnId = runtimeCaptureId(turn.id);
        const states: Record<string, NativeRuntimeState> = { inProgress: 'working', completed: 'settled', interrupted: 'cancelled', failed: 'error' };
        if (typeof turn.status !== 'string' || !Object.hasOwn(states, turn.status) || (v.method === 'turn/started' && turn.status !== 'inProgress') || (v.method === 'turn/completed' && turn.status === 'inProgress')) throw new Error('runtime_capture_turn_status');
        next = { state: states[turn.status], reason: 'unknown' };
        changedAt = nativeTime(v.method === 'turn/started' ? turn.startedAt : turn.completedAt, 1000);
      } else if (v.method === 'error') {
        if (typeof p.willRetry !== 'boolean') throw new Error('runtime_capture_error_shape');
        if (p.willRetry) return;
        turnId = runtimeCaptureId(p.turnId); next = { state: 'error', reason: 'unknown' };
      } else {
        if (v.id === undefined || (typeof v.id !== 'string' && !Number.isSafeInteger(v.id))) throw new Error('runtime_capture_request_id');
        if (v.method === 'item/tool/requestUserInput') {
          if (typeof p.isBlocking !== 'boolean') throw new Error('runtime_capture_request_blocking');
          if (!p.isBlocking) return;
        }
        turnId = p.turnId === null && v.method === 'mcpServer/elicitation/request' ? null : runtimeCaptureId(p.turnId);
        next = { state: 'blocked', reason: v.method.endsWith('requestApproval') ? 'permission' : 'question' };
        changedAt = nativeTime(p.startedAtMs, 1);
      }
    }
    if (!this.sessions.has(sessionId) && this.sessions.size >= RUNTIME_CAPTURE_MAX_OBSERVATIONS) throw new Error('runtime_capture_observation_limit');
    this.sessions.set(sessionId, { scope: 'session', session_id: sessionId, turn_id: turnId, ...next, event_received_at: receivedAt, changed_at: changedAt });
    this.publish();
  }
  private publish(): void { this.onChange(Array.from(this.sessions.values(), o => ({ ...o }))); }
}

export const OSC7501_QUERY = '\x1b]7501;?\x1b\\';
const OSC_MAX_BYTES = 4096;
function rootOscState(body: string): { state: NativeRuntimeState | 'clear'; reason: NativeRuntimeReason } | null {
  const values = new Map<string, string>();
  for (const pair of body.split(':')) {
    const equal = pair.indexOf('=');
    if (equal < 1) continue;
    const key = pair.slice(0, equal).trim(), value = pair.slice(equal + 1).trim();
    if (key.length > 16) return null;
    // Root only. Never let a malformed child id overwrite the root record.
    if (key === 'id') return null;
    if (!/^[a-z]+$/.test(key) || !/^[A-Za-z0-9_.,+/=-]*$/.test(value)) continue;
    if ((key === 'app' && value.length > 32) || (key === 'id' && value.length > 128)) return null;
    if (key === 'msg' || key === 'title') {
      const encodedMax = key === 'msg' ? 2732 : 256, decodedMax = key === 'msg' ? 2048 : 192;
      if (value.length > encodedMax || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?|)?$/.test(value)) return null;
      const decoded = Buffer.from(value, 'base64');
      if (decoded.length > decodedMax) return null;
      try { if (/[\x00-\x1f\x7f-\x9f]/.test(new TextDecoder('utf-8', { fatal: true }).decode(decoded))) return null; } catch { return null; }
    }
    values.set(key, value);
  }
  const state = values.get('state');
  if (!state || !['idle', 'working', 'blocked', 'done', 'error', 'clear'].includes(state)) return null;
  const kind = values.get('kind');
  return { state: state === 'done' ? 'settled' : state as NativeRuntimeState | 'clear', reason: state === 'blocked' && kind && ['permission', 'question', 'auth'].includes(kind) ? kind as NativeRuntimeReason : 'unknown' };
}
/** Root-only OSC receiver. Unknown strings and every non-query byte stay unchanged. */
export class OscRuntimeDecoder {
  private mode: 'normal' | 'escape' | 'osc' | 'string' = 'normal';
  private pending: number[] = [];
  private escaped = false;
  private overflow = false;
  private current: NativeRuntimeObservation | null = null;
  constructor(private readonly onChange: (observations: NativeRuntimeObservation[]) => void, private readonly reply: () => void) {}
  feed(bytes: Uint8Array, receivedAt: string): Uint8Array {
    const output: number[] = [];
    for (const byte of bytes) {
      if (this.mode === 'normal') {
        if (byte === 27) { this.mode = 'escape'; this.pending = [byte]; }
        else output.push(byte);
      } else if (this.mode === 'escape') {
        if (byte === 93 || [80, 88, 94, 95].includes(byte)) { this.mode = byte === 93 ? 'osc' : 'string'; this.pending.push(byte); this.escaped = false; this.overflow = false; }
        else {
          output.push(...this.pending); this.pending = [];
          if (byte === 99) this.clear(receivedAt, true);
          if (byte === 27) { this.pending = [27]; this.mode = 'escape'; } else { output.push(byte); this.mode = 'normal'; }
        }
      } else {
        const terminated = this.escaped && byte === 92 || this.mode === 'osc' && byte === 7;
        if (this.overflow) output.push(byte);
        else this.pending.push(byte);
        if (!this.overflow && this.pending.length > OSC_MAX_BYTES) { output.push(...this.pending); this.pending = []; this.overflow = true; }
        if (terminated) {
          if (!this.overflow) {
            const frame = Uint8Array.from(this.pending);
            const body = new TextDecoder('utf-8', { fatal: false }).decode(frame.subarray(2, frame.length - (byte === 7 ? 1 : 2)));
            const query = this.mode === 'osc' && body === '7501;?';
            if (query) this.reply();
            else {
              output.push(...this.pending);
              if (this.mode === 'osc') this.osc(body, receivedAt);
            }
          }
          this.pending = []; this.mode = 'normal'; this.overflow = false; this.escaped = false;
        } else this.escaped = byte === 27;
      }
    }
    return Uint8Array.from(output);
  }
  end(receivedAt: string): Uint8Array {
    const remaining = Uint8Array.from(this.pending); this.pending = []; this.mode = 'normal'; this.clear(receivedAt, false); return remaining;
  }
  private osc(body: string, receivedAt: string): void {
    if (/^133;A(?:;.*)?$/.test(body)) { this.clear(receivedAt, false); return; }
    if (!body.startsWith('7501;')) return;
    const record = rootOscState(body.slice(5));
    if (!record) return;
    if (record.state === 'clear') { this.clear(receivedAt, true); return; }
    this.current = { scope: 'terminal', session_id: null, turn_id: null, state: record.state, reason: record.reason, event_received_at: runtimeCaptureTime(receivedAt), changed_at: null };
    this.onChange([{ ...this.current }]);
  }
  private clear(_receivedAt: string, all: boolean): void {
    if (this.current && (all || ['working', 'blocked'].includes(this.current.state))) { this.current = null; this.onChange([]); }
  }
}
