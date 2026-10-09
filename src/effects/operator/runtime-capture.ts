import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants as osConstants } from 'node:os';
import { type Readable, type Writable } from 'node:stream';
import { CodexRuntimeDecoder } from '../../core/operator/runtime-capture-decoders';
import { RUNTIME_CAPTURE_PROTOCOL, runtimeCaptureId, type NativeRuntimeProvider, type RuntimeCaptureSnapshot } from '../../core/operator/runtime-capture';
import { captureRuntimePty, prepareRuntimePty } from './runtime-capture-pty';
import { RuntimeCaptureWriter, runtimeCaptureUid } from './runtime-capture-writer';

export interface RuntimeCaptureOptions {
  provider: NativeRuntimeProvider;
  source_id: string;
  snapshot_path: string;
  argv: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}
export interface RuntimeCaptureIO { input: Readable; output: Writable; diagnostics: Writable }
const OUTPUT_RETIREMENT_MS = 2000;

class CaptureCache {
  readonly snapshot: RuntimeCaptureSnapshot;
  private readonly writer: RuntimeCaptureWriter;
  private timer: ReturnType<typeof setInterval>;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private writerFailed = false;
  private transportFailed = false;
  constructor(options: RuntimeCaptureOptions, private readonly diagnostic: (code: string) => void) {
    this.snapshot = { protocol: RUNTIME_CAPTURE_PROTOCOL, source_id: runtimeCaptureId(options.source_id), generation: randomUUID(), sequence: 0, provider: options.provider, format: options.provider === 'codex' ? 'codex-app-server' : 'osc7501', capture_status: 'connected', heartbeat_at: new Date().toISOString(), observations: [] };
    this.writer = new RuntimeCaptureWriter(options.snapshot_path, this.snapshot);
    this.timer = setInterval(() => this.flush(), 1000);
  }
  observe(observations: RuntimeCaptureSnapshot['observations']): void {
    if (this.snapshot.capture_status === 'unavailable') return;
    this.snapshot.observations = observations; this.schedule();
  }
  unavailable(): void { this.snapshot.capture_status = 'unavailable'; this.snapshot.observations = []; this.diagnostic('runtime_capture_observation_unavailable'); this.schedule(); }
  transportIncomplete(): void {
    if (this.transportFailed) return; this.transportFailed = true;
    this.snapshot.capture_status = 'unavailable'; this.snapshot.observations = [];
    this.diagnostic('runtime_capture_transport_incomplete'); this.schedule();
  }
  disconnected(): void { if (this.snapshot.capture_status !== 'unavailable') this.snapshot.capture_status = 'disconnected'; this.schedule(); }
  close(): void { clearInterval(this.timer); this.disconnected(); this.flush(); }
  private schedule(): void { if (!this.pending && !this.writerFailed) this.pending = setTimeout(() => this.flush(), 0); }
  private flush(): void {
    if (this.pending) { clearTimeout(this.pending); this.pending = null; }
    if (this.writerFailed) return;
    try {
      this.snapshot.heartbeat_at = new Date().toISOString(); this.snapshot.sequence++;
      this.writer.write(this.snapshot);
    } catch { this.writerFailed = true; this.snapshot.capture_status = 'unavailable'; this.diagnostic('runtime_capture_snapshot_unavailable'); }
  }
}
function exitCode(code: number | null, signal: string | null): number {
  return code ?? (signal ? 128 + (osConstants.signals[signal as keyof typeof osConstants.signals] ?? 1) : 1);
}
function writeOutput(output: Writable, bytes: Uint8Array, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error | null) => {
      if (settled) return; settled = true; signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(new Error('runtime_capture_output_interrupted'));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    try { output.write(bytes, finish); } catch { finish(new Error('runtime_capture_output_unavailable')); }
  });
}

async function captureCodex(options: RuntimeCaptureOptions, io: RuntimeCaptureIO, cache: CaptureCache): Promise<number> {
  // stderr bypasses the tap. Capture cannot mistake diagnostics for JSON-RPC.
  const child = spawn(options.argv[0], options.argv.slice(1), { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'inherit'] });
  let forceStop: ReturnType<typeof setTimeout> | undefined;
  const outputAbort = new AbortController();
  const stop = (signal: NodeJS.Signals) => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    retireOutput();
  };
  const retireOutput = () => { forceStop ??= setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    outputAbort.abort();
  }, OUTPUT_RETIREMENT_MS); };
  const abortOutput = () => { cache.transportIncomplete(); child.stdout.destroy(); };
  outputAbort.signal.addEventListener('abort', abortOutput, { once: true });
  const interrupt = () => stop('SIGINT'), terminate = () => stop('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  const decoder = new CodexRuntimeDecoder(observations => cache.observe(observations), () => cache.unavailable());
  const exited = new Promise<number>((resolve, reject) => { child.once('error', () => reject(new Error('runtime_capture_child_unavailable'))); child.once('exit', (code, signal) => { cache.disconnected(); retireOutput(); resolve(exitCode(code, signal)); }); });
  let inputError: Error | null = null;
  const onOutputError = () => stop('SIGTERM');
  io.output.on('error', onOutputError);
  const onInputError = () => { inputError = new Error('runtime_capture_input_unavailable'); stop('SIGTERM'); };
  const onChildInputError = (error: NodeJS.ErrnoException) => { if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') onInputError(); };
  io.input.on('error', onInputError); child.stdin.on('error', onChildInputError);
  io.input.pipe(child.stdin);
  const output = (async () => {
    try {
      for await (const chunk of child.stdout) {
        const bytes = chunk as Buffer;
        decoder.feed(bytes, new Date().toISOString());
        await writeOutput(io.output, bytes, outputAbort.signal);
      }
      if (outputAbort.signal.aborted) throw new Error('runtime_capture_output_incomplete');
      decoder.end(); cache.disconnected();
    } catch { stop('SIGTERM'); throw new Error('runtime_capture_output_unavailable'); }
  })();
  // Observe failures immediately, even while the other side is waiting for I/O.
  output.catch(() => {}); exited.catch(() => {});
  try {
    const [code] = await Promise.all([exited, output]);
    if (inputError) throw inputError;
    return code;
  } finally {
    stop('SIGTERM'); await exited.catch(() => {}); if (forceStop) clearTimeout(forceStop);
    io.input.unpipe(child.stdin); io.input.pause(); child.stdin.destroy(); child.stdout.destroy();
    outputAbort.signal.removeEventListener('abort', abortOutput);
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate);
    io.output.removeListener('error', onOutputError);
    io.input.removeListener('error', onInputError); child.stdin.removeListener('error', onChildInputError);
  }
}

/** Capture only this explicit child. No discovery, initialization, approval or task binding. */
export async function runRuntimeCapture(options: RuntimeCaptureOptions, io: RuntimeCaptureIO = { input: process.stdin, output: process.stdout, diagnostics: process.stderr }): Promise<number> {
  runtimeCaptureUid(); // Refuse unsupported ownership before snapshot creation or child spawn.
  if (!['codex', 'claude', 'pi'].includes(options.provider) || !options.argv.length || options.argv.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('runtime_capture_arguments');
  const pty = options.provider === 'codex' ? null : await prepareRuntimePty(options);
  const diagnostic = (code: string) => { io.diagnostics.write(`${JSON.stringify({ ok: false, error: code })}\n`); };
  const cache = new CaptureCache(options, diagnostic);
  try { return await (options.provider === 'codex' ? captureCodex(options, io, cache) : captureRuntimePty(options, io, cache, pty!)); }
  catch (error) { cache.transportIncomplete(); throw error; }
  finally { cache.close(); }
}
