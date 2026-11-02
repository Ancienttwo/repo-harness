import { spawn, spawnSync, type SpawnSyncReturns } from 'child_process';
import { createInterface } from 'readline';

/** herdr-core transport: the `hc` CLI with `--json`, its event stream, and `herdr-app do` for pane placement. */
export const HERDR_CORE_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export type HerdrCoreProgram = 'hc' | 'herdr-app';
export type HerdrCoreErrorReason = 'missing' | 'timeout' | 'failed' | 'invalid_response' | 'nested' | 'invalid_labels';

export class HerdrCoreError extends Error {
  constructor(
    readonly program: HerdrCoreProgram,
    readonly reason: HerdrCoreErrorReason,
    /** The program's exit code, only for `failed`. */
    readonly exitCode?: number,
    /** hc's `error.kind` (for example `not_found`), when its stderr carried one. */
    readonly kind?: string,
    detail?: string,
  ) {
    super(`${program}_${reason}${exitCode === undefined ? '' : ` (exit ${exitCode})`}${detail ? `: ${detail}` : ''}`);
    this.name = 'HerdrCoreError';
  }
}

export interface HerdrCoreOptions {
  /** The environment for the child; `HC_SESSION` / `HC_SOCKET` select the core. Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}

export type HcLabels = Readonly<Record<string, string>>;
export interface HcStatus { readonly state: string; readonly app?: string; readonly kind?: string; readonly msg?: string }
export interface HcTerminalSummary { readonly address: string; readonly name: string | null; readonly state: 'live' | 'finished' }
export interface HcTerminal extends HcTerminalSummary {
  readonly labels: HcLabels;
  readonly status: HcStatus | null;
  readonly turn: number;
}
export type HcStreamItem =
  | { readonly type: 'snapshot'; readonly seq: number; readonly terminals: readonly HcTerminal[] }
  | { readonly type: 'event'; readonly seq: number; readonly terminal: string; readonly event: string; readonly data: Readonly<Record<string, unknown>> };
export interface HcEventStream { close(): void; readonly done: Promise<void> }

/** The Herdr.app commands that place panes; every other path goes through hc. */
export type HerdrAppPlacement = 'tab.new' | 'pane.split' | 'pane.close';

const LABEL_KEY = /^[a-z][a-z0-9._-]{0,63}$/;
const LABEL_VALUE = /^[\x21-\x7e][\x20-\x7e]{0,255}$/;

function environment(program: HerdrCoreProgram, options: HerdrCoreOptions): NodeJS.ProcessEnv {
  const env = options.env ?? process.env;
  // A classic Herdr pane inside an hc terminal (or the reverse) is a nested multiplexer.
  if (env.HC_TERMINAL_ID && env.HERDR_ENV === '1') throw new HerdrCoreError(program, 'nested', undefined, undefined, 'HC_TERMINAL_ID and HERDR_ENV=1 are both set');
  return env;
}

function labelArgs(labels: HcLabels): string[] {
  const entries = Object.entries(labels);
  if (!entries.length) throw new HerdrCoreError('hc', 'invalid_labels', undefined, undefined, 'at least one label is required');
  for (const [key, value] of entries) {
    if (!LABEL_KEY.test(key) || typeof value !== 'string' || !LABEL_VALUE.test(value)) {
      throw new HerdrCoreError('hc', 'invalid_labels', undefined, undefined, `invalid label ${JSON.stringify(key)}`);
    }
  }
  return entries.flatMap(([key, value]) => ['--label', `${key}=${value}`]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseObject(program: HerdrCoreProgram, text: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new HerdrCoreError(program, 'invalid_response', undefined, undefined, 'output is not JSON'); }
  if (!isRecord(value)) throw new HerdrCoreError(program, 'invalid_response', undefined, undefined, 'output is not a JSON object');
  return value;
}

/** hc reports `{error: {kind, message, hint}}` on stderr; Herdr.app reports `{error: "..."}` on stdout. */
function failure(program: HerdrCoreProgram, exitCode: number, output: string): HerdrCoreError {
  let value: unknown;
  try { value = JSON.parse(output); } catch { return new HerdrCoreError(program, 'failed', exitCode); }
  const error = isRecord(value) ? value.error : undefined;
  if (typeof error === 'string') return new HerdrCoreError(program, 'failed', exitCode, undefined, error);
  if (isRecord(error)) {
    return new HerdrCoreError(program, 'failed', exitCode,
      typeof error.kind === 'string' ? error.kind : undefined, typeof error.message === 'string' ? error.message : undefined);
  }
  return new HerdrCoreError(program, 'failed', exitCode);
}

function spawnError(program: HerdrCoreProgram, error: NodeJS.ErrnoException): HerdrCoreError {
  if (error.code === 'ENOENT') return new HerdrCoreError(program, 'missing', undefined, undefined, `${program} is not on PATH`);
  if (error.code === 'ETIMEDOUT') return new HerdrCoreError(program, 'timeout');
  return new HerdrCoreError(program, 'failed', undefined, undefined, error.code ?? error.message);
}

function invoke(program: HerdrCoreProgram, args: readonly string[], options: HerdrCoreOptions): Record<string, unknown> {
  const env = environment(program, options);
  const timeout = options.timeoutMs ?? HERDR_CORE_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeout) || timeout < 1) throw new RangeError('herdr_core_invalid_timeout');
  const result: SpawnSyncReturns<Buffer> = spawnSync(program, [...args], {
    env, timeout, killSignal: 'SIGKILL', shell: false, maxBuffer: MAX_OUTPUT_BYTES, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw spawnError(program, result.error);
  if (result.signal) throw new HerdrCoreError(program, 'failed', undefined, undefined, `ended by ${result.signal}`);
  const stdout = result.stdout.toString('utf8');
  if (result.status !== 0) throw failure(program, result.status ?? -1, program === 'hc' ? result.stderr.toString('utf8') : stdout);
  return parseObject(program, stdout);
}

/** Run one hc subcommand with `--json`; `args[0]` is the subcommand. Returns hc's JSON object. */
export function hcJson(args: readonly [string, ...string[]], options: HerdrCoreOptions = {}): Record<string, unknown> {
  return invoke('hc', [args[0], '--json', ...args.slice(1)], options);
}

function terminalSummary(value: unknown): HcTerminalSummary {
  if (!isRecord(value) || typeof value.address !== 'string' || !(value.name === null || typeof value.name === 'string')
    || (value.state !== 'live' && value.state !== 'finished')) {
    throw new HerdrCoreError('hc', 'invalid_response', undefined, undefined, 'terminal is missing address, name or state');
  }
  return { address: value.address, name: value.name, state: value.state };
}

function terminal(value: unknown): HcTerminal {
  const summary = terminalSummary(value);
  const record = value as Record<string, unknown>;
  const labels = record.labels, status = record.status;
  if (!isRecord(labels) || Object.values(labels).some(label => typeof label !== 'string')
    || !(status === null || (isRecord(status) && typeof status.state === 'string'))
    || !Number.isSafeInteger(record.turn)) {
    throw new HerdrCoreError('hc', 'invalid_response', undefined, undefined, `terminal ${summary.address} has invalid labels, status or turn`);
  }
  return { ...summary, labels: labels as HcLabels, status: status as HcStatus | null, turn: record.turn as number };
}

/** `hc run --bg`: start argv in a new terminal that carries `labels`. */
export function hcRun(input: { readonly argv: readonly [string, ...string[]]; readonly labels: HcLabels; readonly name?: string; readonly cwd?: string },
  options: HerdrCoreOptions = {}): HcTerminalSummary {
  const args = ['--bg', ...labelArgs(input.labels)];
  if (input.name !== undefined) args.push('--name', input.name);
  if (input.cwd !== undefined) args.push('--cwd', input.cwd);
  return terminalSummary(hcJson(['run', ...args, '--', ...input.argv], options));
}

/** `hc ls --label`: live terminals that carry every label. An empty filter is refused. */
export function hcList(labels: HcLabels, options: HerdrCoreOptions = {}): HcTerminalSummary[] {
  const result = hcJson(['ls', ...labelArgs(labels)], options);
  if (!Array.isArray(result.terminals)) throw new HerdrCoreError('hc', 'invalid_response', undefined, undefined, 'ls has no terminals array');
  return result.terminals.map(terminalSummary);
}

export function hcGet(address: string, options: HerdrCoreOptions = {}): HcTerminal {
  return terminal(hcJson(['get', '--', address], options));
}

/** `hc label`: set labels on an existing terminal, for example one that `herdr-app do tab.new` created. */
export function hcLabel(address: string, labels: HcLabels, options: HerdrCoreOptions = {}): HcTerminal {
  const pairs = labelArgs(labels).filter((_, index) => index % 2 === 1);
  return terminal(hcJson(['label', '--', address, ...pairs], options));
}

function streamItem(line: string): HcStreamItem {
  const value = parseObject('hc', line);
  if (Array.isArray(value.terminals) && Number.isSafeInteger(value.seq)) {
    return { type: 'snapshot', seq: value.seq as number, terminals: value.terminals.map(terminal) };
  }
  const params = value.params;
  if (value.method === 'event' && isRecord(params) && Number.isSafeInteger(params.seq) && typeof params.terminal === 'string'
    && typeof params.type === 'string' && isRecord(params.data)) {
    return { type: 'event', seq: params.seq as number, terminal: params.terminal, event: params.type, data: params.data };
  }
  throw new HerdrCoreError('hc', 'invalid_response', undefined, undefined, 'event line is neither a snapshot nor an event');
}

/**
 * `hc events --json --label`: a snapshot of the labeled terminals, then each change. The stream has no
 * command timeout. `done` resolves after `close()` or a clean exit and rejects with a HerdrCoreError.
 */
export function hcEvents(labels: HcLabels, onItem: (item: HcStreamItem) => void, options: HerdrCoreOptions = {}): HcEventStream {
  const env = environment('hc', options);
  const child = spawn('hc', ['events', '--json', ...labelArgs(labels)], { env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  let closed = false, failed: HerdrCoreError | undefined, stderr = '';
  const stop = (error?: HerdrCoreError) => { failed ??= error; if (!closed) { closed = true; child.kill('SIGTERM'); } };
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk; });
  createInterface({ input: child.stdout }).on('line', line => {
    if (closed) return;
    let item: HcStreamItem;
    try { item = streamItem(line); } catch (error) { stop(error as HerdrCoreError); return; }
    onItem(item);
  });
  const done = new Promise<void>((resolve, reject) => {
    child.once('error', error => { closed = true; reject(spawnError('hc', error)); });
    child.once('close', (code, signal) => {
      if (failed) reject(failed);
      else if (closed || code === 0) resolve();
      else reject(code === null ? new HerdrCoreError('hc', 'failed', undefined, undefined, `ended by ${signal}`) : failure('hc', code, stderr));
    });
  });
  return { close: () => stop(), done };
}

/** `herdr-app do <command> <json>`: place a tab or pane in the person's window. Returns the created IDs. */
export function herdrAppDo(command: HerdrAppPlacement, args: Readonly<Record<string, unknown>>, options: HerdrCoreOptions = {}): Record<string, unknown> {
  return invoke('herdr-app', ['do', command, JSON.stringify(args)], options);
}
