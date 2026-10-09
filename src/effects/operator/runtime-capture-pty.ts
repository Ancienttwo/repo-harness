import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Readable, Writable } from 'node:stream';
import { OscRuntimeDecoder, OSC7501_QUERY } from '../../core/operator/runtime-capture-decoders';
import type { NativeRuntimeObservation } from '../../core/operator/runtime-capture';
import type { RuntimeCaptureIO, RuntimeCaptureOptions } from './runtime-capture';

export const RUNTIME_CAPTURE_PYTHON_UNAVAILABLE = 'runtime_capture_python_unavailable' as const;
const HELPER = fileURLToPath(new URL('./runtime-capture-pty.py', import.meta.url));
const LIMIT = 256 * 1024;
const ERROR_CODES = new Set(['pty_setup_failed', 'child_spawn_failed', 'control_protocol_invalid', 'input_transport_failed', 'output_transport_failed', 'control_transport_failed', 'child_wait_failed', 'transport_incomplete']);
export interface PreparedRuntimePty { python: string }
interface CaptureCache {
  observe(observations: NativeRuntimeObservation[]): void;
  disconnected(): void;
  transportIncomplete(): void;
}
/** Validate the actual interpreter before a provider or snapshot can exist. */
export async function prepareRuntimePty(options: RuntimeCaptureOptions): Promise<PreparedRuntimePty> {
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error(RUNTIME_CAPTURE_PYTHON_UNAVAILABLE);
  const python = Bun.which('python3', { PATH: options.env?.PATH ?? process.env.PATH });
  if (!python) throw new Error(RUNTIME_CAPTURE_PYTHON_UNAVAILABLE);
  await new Promise<void>((resolve, reject) => {
    execFile(python, ['-I', '-S', '-u', HELPER, '--check'], { cwd: options.cwd, env: options.env, timeout: 2000, maxBuffer: 1024, killSignal: 'SIGKILL' }, (error, stdout, stderr) => {
      try {
        if (error || stderr) throw new Error('check_failed');
        const value = JSON.parse(stdout);
        if (!value || Object.keys(value).sort().join() !== 'ok,protocol' || value.protocol !== 1 || value.ok !== true) throw new Error('check_failed');
        resolve();
      } catch { reject(new Error(RUNTIME_CAPTURE_PYTHON_UNAVAILABLE)); }
    });
  });
  return { python };
}
function write(bytes: Uint8Array, stream: Writable, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error | null) => {
      if (settled) return; settled = true; signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(new Error('runtime_capture_transport_unavailable'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    try { stream.write(bytes, finish); } catch { finish(new Error('runtime_capture_transport_unavailable')); }
  });
}
function dimensions(): { cols: number; rows: number } {
  return { cols: Math.min(1000, Math.max(1, process.stdout.columns || 80)), rows: Math.min(1000, Math.max(1, process.stdout.rows || 24)) };
}
/** One owned relay. Python alone manages the provider PID and its fixed PTY buffers. */
export async function captureRuntimePty(options: RuntimeCaptureOptions, io: RuntimeCaptureIO, cache: CaptureCache, prepared: PreparedRuntimePty): Promise<number> {
  const size = dimensions();
  const child = spawn(prepared.python, ['-I', '-S', '-u', HELPER, '--cols', String(size.cols), '--rows', String(size.rows), '--', ...options.argv], { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'inherit', 'pipe', 'pipe'] });
  const commands = child.stdio[3] as Writable, events = child.stdio[4] as Readable;
  const abort = new AbortController();
  let retirement: ReturnType<typeof setTimeout> | undefined, forceStop: ReturnType<typeof setTimeout> | undefined;
  let providerExit: number | null = null, complete = false, failure: Error | null = null;
  let controlBusy = false, pendingResize: ReturnType<typeof dimensions> | null = null, pendingStop: 'SIGINT' | 'SIGTERM' | null = null;
  const fail = () => {
    if (failure) return; failure = new Error('runtime_capture_transport_unavailable'); cache.transportIncomplete();
    abort.abort(); child.stdout!.destroy(); events.destroy();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    if (forceStop) clearTimeout(forceStop);
    forceStop = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 5000);
  };
  const retire = () => { retirement ??= setTimeout(fail, 2000); };
  const pumpControl = () => {
    if (controlBusy || failure) return;
    const command = pendingStop ? { type: 'stop', signal: pendingStop } : pendingResize ? { type: 'resize', ...pendingResize } : null;
    if (!command) return;
    if (pendingStop) pendingStop = null; else pendingResize = null;
    controlBusy = true;
    commands.write(JSON.stringify(command) + '\n', error => { controlBusy = false; if (error) fail(); else pumpControl(); });
  };
  const stop = (signal: 'SIGINT' | 'SIGTERM') => {
    pendingStop = signal; pumpControl();
    forceStop ??= setTimeout(() => { fail(); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 5000);
  };
  const interrupt = () => stop('SIGINT'), terminate = () => stop('SIGTERM');
  const resize = () => { pendingResize = dimensions(); pumpControl(); };
  const onInputError = () => fail(), onOutputError = () => fail();
  const input = io.input as Readable & { isTTY?: boolean; isRaw?: boolean; setRawMode?: (raw: boolean) => void };
  const previousRaw = input.isRaw ?? false;
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate); process.stdout.on('resize', resize);
  io.input.on('error', onInputError); io.output.on('error', onOutputError); child.stdin!.on('error', fail); commands.on('error', fail);
  const exited = new Promise<void>((resolve, reject) => {
    child.once('error', () => { fail(); reject(new Error('runtime_capture_transport_unavailable')); });
    child.once('exit', (code, signal) => { retire(); if (code !== 0 || signal) { fail(); reject(new Error('runtime_capture_transport_unavailable')); } else resolve(); });
  });
  const control = (async () => {
    let frame = Buffer.alloc(0);
    try {
      for await (const raw of events) {
        const bytes = raw as Buffer;
        for (const byte of bytes) {
          if (byte !== 10) {
            if (frame.length >= 1024) throw new Error('control_limit');
            frame = Buffer.concat([frame, Buffer.of(byte)]); continue;
          }
          const event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(frame)); frame = Buffer.alloc(0);
          if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('control_shape');
          const fields = Object.keys(event).sort().join();
          if (event.type === 'child_exit' && fields === 'code,type' && providerExit === null && !complete && Number.isInteger(event.code) && event.code >= 0 && event.code <= 255) {
            providerExit = event.code; cache.disconnected(); retire();
          } else if (event.type === 'complete' && fields === 'input_peak,output_peak,type' && providerExit !== null && !complete && [event.input_peak, event.output_peak].every(n => Number.isSafeInteger(n) && n >= 0 && n <= LIMIT)) complete = true;
          else if (event.type === 'error' && fields === 'code,type' && ERROR_CODES.has(event.code)) throw new Error('helper_error');
          else throw new Error('control_protocol');
        }
      }
      if (frame.length || providerExit === null || !complete) throw new Error('control_incomplete');
    } catch { fail(); throw new Error('runtime_capture_transport_unavailable'); }
  })();
  const output = (async () => {
    let replies = 0;
    const decoder = new OscRuntimeDecoder(observations => cache.observe(observations), () => { replies++; });
    try {
      for await (const raw of child.stdout!) {
        replies = 0; const bytes = decoder.feed(raw as Buffer, new Date().toISOString());
        if (replies) {
          const response = Buffer.from(OSC7501_QUERY.repeat(replies));
          if (response.length > LIMIT) throw new Error('reply_limit');
          await write(response, child.stdin!, abort.signal);
        }
        if (bytes.length) await write(bytes, io.output, abort.signal);
      }
      const tail = decoder.end(new Date().toISOString());
      if (tail.length) await write(tail, io.output, abort.signal);
      await write(new Uint8Array(0), io.output, abort.signal);
      if (abort.signal.aborted) throw new Error('output_incomplete');
    } catch { fail(); throw new Error('runtime_capture_transport_unavailable'); }
  })();
  // Attach handlers before any source can reject while another side waits.
  exited.catch(() => {}); control.catch(() => {}); output.catch(() => {});
  try {
    if (input.isTTY) input.setRawMode?.(true);
    io.input.pipe(child.stdin!);
    await Promise.all([exited, control, output]);
    if (failure || providerExit === null || !complete) throw new Error('runtime_capture_transport_unavailable');
    return providerExit;
  } finally {
    io.input.unpipe(child.stdin!); io.input.pause(); child.stdin!.destroy(); child.stdout!.destroy(); events.destroy(); commands.destroy();
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); forceStop ??= setTimeout(() => child.kill('SIGKILL'), 5000); }
    await exited.catch(() => {});
    if (retirement) clearTimeout(retirement); if (forceStop) clearTimeout(forceStop);
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate); process.stdout.removeListener('resize', resize);
    io.input.removeListener('error', onInputError); io.output.removeListener('error', onOutputError);
    child.stdin!.removeListener('error', fail); commands.removeListener('error', fail);
    if (input.isTTY) input.setRawMode?.(previousRaw);
  }
}
