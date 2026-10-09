import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants as osConstants } from 'node:os';
import { type Readable, type Writable } from 'node:stream';
import { CodexRuntimeDecoder, OscRuntimeDecoder, OSC7501_QUERY } from '../../core/operator/runtime-capture-decoders';
import { RUNTIME_CAPTURE_PROTOCOL, runtimeCaptureId, type NativeRuntimeProvider, type RuntimeCaptureSnapshot } from '../../core/operator/runtime-capture';
import { RuntimeCaptureWriter } from './runtime-capture-writer';

export interface RuntimeCaptureOptions {
  provider: NativeRuntimeProvider;
  source_id: string;
  snapshot_path: string;
  argv: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}
export interface RuntimeCaptureIO { input: Readable; output: Writable; diagnostics: Writable }
const MAX_TRANSPORT_BYTES = 256 * 1024;
const INPUT_CHUNK_BYTES = 16 * 1024;

class CaptureCache {
  readonly snapshot: RuntimeCaptureSnapshot;
  private readonly writer: RuntimeCaptureWriter;
  private timer: ReturnType<typeof setInterval>;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private writerFailed = false;
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
    forceStop ??= setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); outputAbort.abort(); }, 2000);
  };
  const interrupt = () => stop('SIGINT'), terminate = () => stop('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  const decoder = new CodexRuntimeDecoder(observations => cache.observe(observations), () => cache.unavailable());
  const exited = new Promise<number>((resolve, reject) => { child.once('error', () => reject(new Error('runtime_capture_child_unavailable'))); child.once('exit', (code, signal) => resolve(exitCode(code, signal))); });
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
    io.input.unpipe(child.stdin); io.input.pause(); child.stdin.destroy();
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate);
    io.output.removeListener('error', onOutputError);
    io.input.removeListener('error', onInputError); child.stdin.removeListener('error', onChildInputError);
  }
}

async function capturePty(options: RuntimeCaptureOptions, io: RuntimeCaptureIO, cache: CaptureCache): Promise<number> {
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error('runtime_capture_pty_platform');
  let child: Bun.Subprocess | undefined, terminal: Bun.Terminal | undefined;
  let ended = false, pausedByCapture = false, outputBlocked = false, outputBytes = 0, inputBytes = 0;
  let forceStop: ReturnType<typeof setTimeout> | undefined;
  let fault: Error | null = null;
  const outputAbort = new AbortController();
  const outputQueue: Uint8Array[] = [], inputQueue: Uint8Array[] = [];
  let inputBusy = false;
  const signalChild = (signal: NodeJS.Signals) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    try { process.kill(child.pid, signal); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') fault ??= new Error('runtime_capture_signal_unavailable'); }
  };
  const stop = (signal: NodeJS.Signals) => {
    if (pausedByCapture && child) { signalChild('SIGCONT'); pausedByCapture = false; }
    signalChild(signal);
    forceStop ??= setTimeout(() => { signalChild('SIGKILL'); outputAbort.abort(); }, 2000);
  };
  const fail = () => { if (!fault) { fault = new Error('runtime_capture_transport_unavailable'); cache.disconnected(); stop('SIGTERM'); } };
  const pumpInput = () => {
    if (inputBusy || ended || !terminal || terminal.closed) return;
    const bytes = inputQueue.shift();
    if (!bytes) { if (!fault) io.input.resume(); return; }
    inputBusy = true;
    activeInputBytes = bytes.length;
    try { terminal.write(bytes); } catch { fail(); }
  };
  const enqueueInput = (bytes: Uint8Array) => {
    if (ended || fault) return;
    if (inputBytes + bytes.length > MAX_TRANSPORT_BYTES) { fail(); return; }
    io.input.pause(); inputBytes += bytes.length;
    for (let offset = 0; offset < bytes.length; offset += INPUT_CHUNK_BYTES) inputQueue.push(bytes.slice(offset, offset + INPUT_CHUNK_BYTES));
    pumpInput();
  };
  let activeInputBytes = 0;
  const drainInput = () => { inputBytes -= activeInputBytes; activeInputBytes = 0; inputBusy = false; pumpInput(); };
  // Bun accepts all bytes and calls drain after it flushes them. Send only one bounded chunk.
  const decoder = new OscRuntimeDecoder(observations => cache.observe(observations), () => enqueueInput(new TextEncoder().encode(OSC7501_QUERY)));
  const pumpOutput = () => {
    if (outputBlocked || fault) return;
    while (outputQueue.length) {
      const bytes = outputQueue.shift()!; outputBytes -= bytes.length;
      let writable: boolean;
      try { writable = io.output.write(bytes); } catch { fail(); return; }
      if (!writable) {
        outputBlocked = true;
        if (child && child.exitCode === null && !pausedByCapture) { signalChild('SIGSTOP'); pausedByCapture = true; }
        return;
      }
    }
  };
  const enqueueOutput = (bytes: Uint8Array) => {
    if (!bytes.length || fault) return;
    if (outputBytes + bytes.length > MAX_TRANSPORT_BYTES) { fail(); return; }
    outputQueue.push(bytes); outputBytes += bytes.length; pumpOutput();
  };
  const outputDrain = () => {
    outputBlocked = false; pumpOutput();
    if (!outputBlocked && pausedByCapture && child) { signalChild('SIGCONT'); pausedByCapture = false; }
  };
  const inputData = (bytes: Buffer) => enqueueInput(bytes);
  const inputEnd = () => { cache.disconnected(); stop('SIGTERM'); };
  const interrupt = () => stop('SIGINT'), terminate = () => stop('SIGTERM');
  const input = io.input as Readable & { isTTY?: boolean; isRaw?: boolean; setRawMode?: (raw: boolean) => void };
  const previousRaw = input.isRaw ?? false;
  const resize = () => terminal?.resize(process.stdout.columns || 80, process.stdout.rows || 24);
  io.output.on('drain', outputDrain); io.output.on('error', fail);
  io.input.on('data', inputData); io.input.on('end', inputEnd); io.input.on('error', fail);
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate); process.stdout.on('resize', resize);
  try {
    if (input.isTTY) input.setRawMode?.(true);
    child = Bun.spawn(options.argv, { cwd: options.cwd, env: options.env, terminal: {
      cols: process.stdout.columns || 80, rows: process.stdout.rows || 24,
      data(term, bytes) { terminal = term; enqueueOutput(decoder.feed(bytes, new Date().toISOString())); },
      drain(term) { terminal = term; drainInput(); },
      exit(_term, code) { if (code !== 0) fail(); ended = true; enqueueOutput(decoder.end(new Date().toISOString())); cache.disconnected(); },
    } });
    terminal = child.terminal;
    pumpInput();
    if (io.input.readableEnded) inputEnd();
    const code = await child.exited;
    ended = true;
    enqueueOutput(decoder.end(new Date().toISOString())); cache.disconnected();
    terminal?.close();
    // Wait for the real outer sink to consume the bounded tail.
    if (!fault && (outputBlocked || outputQueue.length)) await new Promise<void>((resolve, reject) => {
      const check = () => { if (!outputBlocked && !outputQueue.length) { cleanup(); resolve(); } };
      const bad = () => { cleanup(); reject(new Error('runtime_capture_output_unavailable')); };
      const cleanup = () => { io.output.removeListener('drain', check); io.output.removeListener('error', bad); outputAbort.signal.removeEventListener('abort', bad); };
      io.output.on('drain', check); io.output.once('error', bad); outputAbort.signal.addEventListener('abort', bad, { once: true });
      if (outputAbort.signal.aborted) bad(); else check();
    });
    if (fault) throw fault;
    await writeOutput(io.output, new Uint8Array(0), outputAbort.signal);
    return code;
  } catch { stop('SIGTERM'); throw new Error('runtime_capture_transport_unavailable'); }
  finally {
    ended = true; terminal?.close();
    if (child && child.exitCode === null && child.signalCode === null) { stop('SIGTERM'); await child.exited; }
    if (forceStop) clearTimeout(forceStop);
    io.input.pause(); io.input.removeListener('data', inputData); io.input.removeListener('end', inputEnd); io.input.removeListener('error', fail);
    io.output.removeListener('drain', outputDrain); io.output.removeListener('error', fail);
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate); process.stdout.removeListener('resize', resize);
    if (input.isTTY) input.setRawMode?.(previousRaw);
  }
}

/** Capture only this explicit child. No discovery, initialization, approval or task binding. */
export async function runRuntimeCapture(options: RuntimeCaptureOptions, io: RuntimeCaptureIO = { input: process.stdin, output: process.stdout, diagnostics: process.stderr }): Promise<number> {
  if (!['codex', 'claude', 'pi'].includes(options.provider) || !options.argv.length || options.argv.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('runtime_capture_arguments');
  const diagnostic = (code: string) => { io.diagnostics.write(`${JSON.stringify({ ok: false, error: code })}\n`); };
  const cache = new CaptureCache(options, diagnostic);
  try { return await (options.provider === 'codex' ? captureCodex(options, io, cache) : capturePty(options, io, cache)); }
  finally { cache.close(); }
}
