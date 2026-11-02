import { execFile, spawn, spawnSync, type ExecFileException, type SpawnSyncReturns } from 'child_process';
import { createInterface } from 'readline';

/**
 * herdr-core transport: typed `hc` CLI calls with `--json`, its event stream, and `herdr-app do` for pane
 * placement. Every call is scoped to repo-harness terminals: lists and streams need a repo-harness label
 * filter, and calls on one terminal need its `t<n>` address and a repo-harness label on it.
 * hc 0.1.16 reports no API generation in its CLI output; the shape validation below is the only guard.
 */
export const HERDR_CORE_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export type HerdrCoreProgram = 'hc' | 'herdr-app';
export type HerdrCoreErrorReason =
  | 'missing' | 'timeout' | 'failed' | 'invalid_response' | 'nested' | 'invalid_labels' | 'invalid_address' | 'unowned';

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
export interface HcStatus { readonly state: string; readonly app?: string; readonly kind?: string | null; readonly msg?: string }
export interface HcTerminalSummary { readonly address: string; readonly name: string | null; readonly state: 'live' | 'finished' }
export interface HcForeground { readonly pid: number; readonly name: string; readonly argv: readonly string[]; readonly cwd: string }
export interface HcTerminal extends HcTerminalSummary {
  readonly labels: HcLabels;
  readonly status: HcStatus | null;
  readonly turn: number;
  /** The program's pid (it leads its own process group), not the holder's. */
  readonly pid: number | null;
  /** What runs in the terminal now; null once it has finished. */
  readonly foreground: HcForeground | null;
  /** Why the program ended (`exited`, `killed`, ...) or is pending. */
  readonly reason: string | null;
}
export interface HcSendResult { readonly started: boolean | null; readonly turn: number }
export interface HcWaitResult { readonly ended: boolean; readonly reason: string; readonly turn: number; readonly status: HcStatus | null }
export type HcStreamItem =
  | { readonly type: 'snapshot'; readonly seq: number; readonly terminals: readonly HcTerminal[] }
  /** The subscriber fell behind: hc dropped events. Replace all state with these terminals; ignore later events whose seq is not above it. */
  | { readonly type: 'missed'; readonly seq: number; readonly terminals: readonly HcTerminal[] }
  /** A fact change. `data` is null for a `foreground` change when no process is in the foreground. */
  | { readonly type: 'event'; readonly seq: number; readonly terminal: string; readonly event: string; readonly data: Readonly<Record<string, unknown>> | null };
export interface HcEventStream { close(): void; readonly done: Promise<void> }

/** The Herdr.app commands that place panes; every other path goes through hc. */
export type HerdrAppPlacement = 'tab.new' | 'pane.split' | 'pane.close';

/** The repo-harness label keys; the only source for every surface that writes or filters hc labels. */
export const RH_LABEL = {
  role: 'repo-harness.role',
  task: 'repo-harness.task',
  request: 'repo-harness.request',
  repository: 'repo-harness.repository',
  harness: 'repo-harness.harness',
  notify: 'repo-harness.notify',
} as const;
/** `repo-harness.role` values. A surface that needs a new role adds it here. */
export const RH_ROLE = { notifyRelay: 'notify-relay', taskSession: 'task-session' } as const;
/** Terminals that carry this pair send blocked and done notices through the relay. */
export const RH_NOTIFY_LABELS: HcLabels = { [RH_LABEL.notify]: 'on' };
export const RH_NOTIFY_RELAY = { name: 'rh-notify-relay', labels: { [RH_LABEL.role]: RH_ROLE.notifyRelay } } as const;

const RH_PREFIX = 'repo-harness.';
const RH_KEYS: ReadonlySet<string> = new Set(Object.values(RH_LABEL));
const RH_ROLES: ReadonlySet<string> = new Set(Object.values(RH_ROLE));
const LABEL_KEY = /^[a-z][a-z0-9._-]{0,63}$/;
const LABEL_VALUE = /^[\x21-\x7e][\x20-\x7e]{0,255}$/;
/**
 * hc's own address for a terminal on this core (hc 0.1.16 terminals.rs `id_shaped`): `t`, then 1-9, then base-30
 * symbols, for example `t7` or `t1b`. A name can name a later terminal; this address never does, and no name has
 * this shape. Eight symbols cover hc's u32 id.
 */
const ADDRESS = /^t[1-9][0-9bcdfghjkmnpqrstvwxyz]{0,7}$/;

const invalidResponse = (detail: string) => new HerdrCoreError('hc', 'invalid_response', undefined, undefined, detail);

function environment(program: HerdrCoreProgram, options: HerdrCoreOptions): NodeJS.ProcessEnv {
  const env = options.env ?? process.env;
  // A classic Herdr pane inside an hc terminal (or the reverse) is a nested multiplexer.
  if (env.HC_TERMINAL_ID && env.HERDR_ENV === '1') throw new HerdrCoreError(program, 'nested', undefined, undefined, 'HC_TERMINAL_ID and HERDR_ENV=1 are both set');
  return env;
}

/** Every labeled write and filter carries a repo-harness key, so repo-harness never touches unlabeled terminals. */
function labelArgs(labels: HcLabels): string[] {
  const entries = Object.entries(labels);
  const invalid = (detail: string) => new HerdrCoreError('hc', 'invalid_labels', undefined, undefined, detail);
  if (!entries.some(([key]) => key.startsWith(RH_PREFIX))) throw invalid('at least one repo-harness label is required');
  for (const [key, value] of entries) {
    if (!LABEL_KEY.test(key) || typeof value !== 'string' || !LABEL_VALUE.test(value)) throw invalid(`invalid label ${JSON.stringify(key)}`);
    if (key.startsWith(RH_PREFIX) && !RH_KEYS.has(key)) throw invalid(`unknown repo-harness label ${JSON.stringify(key)}`);
    if (key === RH_LABEL.role && !RH_ROLES.has(value)) throw invalid(`unknown repo-harness role ${JSON.stringify(value)}`);
    if (key === RH_LABEL.notify && value !== 'on') throw invalid(`${RH_LABEL.notify} must be on`);
  }
  return entries.flatMap(([key, value]) => ['--label', `${key}=${value}`]);
}

function address(value: string): string {
  if (!ADDRESS.test(value)) throw new HerdrCoreError('hc', 'invalid_address', undefined, undefined, `${JSON.stringify(value)} is not a t<n> address`);
  return value;
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

function timeoutOf(options: HerdrCoreOptions): number {
  const timeout = options.timeoutMs ?? HERDR_CORE_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeout) || timeout < 1) throw new RangeError('herdr_core_invalid_timeout');
  return timeout;
}

/** One exit mapping for the sync and async calls, after a spawn error or timeout is ruled out. */
function settle(program: HerdrCoreProgram, status: number | null, signal: string | null, stdout: string, stderr: string): Record<string, unknown> {
  if (signal) throw new HerdrCoreError(program, 'failed', undefined, undefined, `ended by ${signal}`);
  // Without an error or a signal, Node always reports a numeric exit status.
  if (status !== 0) throw failure(program, status as number, program === 'hc' ? stderr : stdout);
  return parseObject(program, stdout);
}

function invoke(program: HerdrCoreProgram, args: readonly string[], options: HerdrCoreOptions): Record<string, unknown> {
  const env = environment(program, options);
  const result: SpawnSyncReturns<Buffer> = spawnSync(program, [...args], {
    env, timeout: timeoutOf(options), killSignal: 'SIGKILL', shell: false, maxBuffer: MAX_OUTPUT_BYTES, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw spawnError(program, result.error);
  return settle(program, result.status, result.signal, result.stdout.toString('utf8'), result.stderr.toString('utf8'));
}

async function invokeAsync(program: HerdrCoreProgram, args: readonly string[], options: HerdrCoreOptions): Promise<Record<string, unknown>> {
  const env = environment(program, options);
  const timeout = timeoutOf(options);
  const { error, stdout, stderr } = await new Promise<{ error: ExecFileException | null; stdout: string; stderr: string }>(resolve => {
    execFile(program, [...args], { env, timeout, killSignal: 'SIGKILL', shell: false, maxBuffer: MAX_OUTPUT_BYTES, encoding: 'utf8' },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }));
  });
  if (!error) return settle(program, 0, null, stdout, stderr);
  // A string code is a spawn or buffer error; `killed` without one is the timeout's SIGKILL.
  if (typeof error.code === 'string') throw spawnError(program, error as NodeJS.ErrnoException);
  if (error.killed) throw new HerdrCoreError(program, 'timeout');
  return settle(program, error.code ?? null, error.signal ?? null, stdout, stderr);
}

/** The one hc executor; it stays private so that every exported call keeps the repo-harness scope. */
function hc(subcommand: string, args: readonly string[], options: HerdrCoreOptions): Record<string, unknown> {
  return invoke('hc', [subcommand, '--json', ...args], options);
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isPid = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const orNull = <T>(valid: (value: unknown) => value is T) => (value: unknown): value is T | null => value === null || valid(value);

/** The one rule for a field that the hc schema does not require: absent is undefined, present must be valid. */
function optional<T>(record: Readonly<Record<string, unknown>>, key: string, valid: (value: unknown) => value is T, where: string): T | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!valid(value)) throw invalidResponse(`${where} has an invalid ${key}`);
  return value;
}

function isForeground(value: unknown): value is HcForeground {
  return isRecord(value) && isPid(value.pid) && isString(value.name) && isString(value.cwd)
    && Array.isArray(value.argv) && value.argv.every(isString);
}

function status(value: unknown, where: string): HcStatus | null {
  if (value === null) return null;
  if (!isRecord(value) || !isString(value.state)) throw invalidResponse(`${where} has an invalid status`);
  const app = optional(value, 'app', isString, `${where} status`);
  const kind = optional(value, 'kind', orNull(isString), `${where} status`);
  const msg = optional(value, 'msg', isString, `${where} status`);
  return { state: value.state, ...(app === undefined ? {} : { app }), ...(kind === undefined ? {} : { kind }), ...(msg === undefined ? {} : { msg }) };
}

function terminalSummary(value: unknown): HcTerminalSummary {
  if (!isRecord(value) || !isString(value.address) || (value.state !== 'live' && value.state !== 'finished')) {
    throw invalidResponse('terminal is missing address or state');
  }
  // `run` and `ls` rows omit the name of an unnamed terminal; `get` reports it as null.
  return { address: value.address, name: optional(value, 'name', orNull(isString), `terminal ${value.address}`) ?? null, state: value.state };
}

function terminal(value: unknown): HcTerminal {
  const summary = terminalSummary(value);
  const record = value as Record<string, unknown>;
  const where = `terminal ${summary.address}`;
  const { labels } = record;
  if (!isRecord(labels) || !Object.values(labels).every(isString)) throw invalidResponse(`${where} has invalid labels`);
  if (!Number.isSafeInteger(record.turn)) throw invalidResponse(`${where} has an invalid turn`);
  const current = optional(record, 'foreground', orNull(isForeground), where) ?? null;
  return {
    ...summary, labels: labels as HcLabels, status: status(record.status ?? null, where), turn: record.turn as number,
    pid: optional(record, 'pid', orNull(isPid), where) ?? null,
    foreground: current === null ? null : { pid: current.pid, name: current.name, argv: [...current.argv], cwd: current.cwd },
    reason: optional(record, 'reason', orNull(isString), where) ?? null,
  };
}

function ownedTerminal(value: unknown): HcTerminal {
  const result = terminal(value);
  if (!Object.keys(result.labels).some(key => RH_KEYS.has(key))) {
    throw new HerdrCoreError('hc', 'unowned', undefined, undefined, `terminal ${result.address} has no repo-harness label`);
  }
  return result;
}

/** `hc get`: one terminal by its `t<n>` address. A terminal without a repo-harness label is refused (`unowned`). */
export function hcGet(terminalAddress: string, options: HerdrCoreOptions = {}): HcTerminal {
  return ownedTerminal(hc('get', ['--', address(terminalAddress)], options));
}

/**
 * `hc run --bg`: start argv in a new terminal that carries `labels`. By default the caller's terminal is its
 * parent and the child ends with it; `noParent` starts it without a parent, so it outlives the caller.
 */
export function hcRun(input: {
  readonly argv: readonly [string, ...string[]]; readonly labels: HcLabels; readonly name?: string; readonly cwd?: string; readonly noParent?: boolean;
}, options: HerdrCoreOptions = {}): HcTerminalSummary {
  const args = ['--bg', ...labelArgs(input.labels)];
  if (input.name !== undefined) args.push('--name', input.name);
  if (input.cwd !== undefined) args.push('--cwd', input.cwd);
  if (input.noParent) args.push('--no-parent');
  return terminalSummary(hc('run', [...args, '--', ...input.argv], options));
}

/** `hc ls --label`: live terminals that carry every label. The filter must hold a repo-harness label. */
export function hcList(labels: HcLabels, options: HerdrCoreOptions = {}): HcTerminalSummary[] {
  return listResult(hc('ls', labelArgs(labels), options));
}

/** `hcList` without blocking the event loop, for long-running readers such as `operator serve`. */
export async function hcListAsync(labels: HcLabels, options: HerdrCoreOptions = {}): Promise<HcTerminalSummary[]> {
  return listResult(await invokeAsync('hc', ['ls', '--json', ...labelArgs(labels)], options));
}

function listResult(result: Record<string, unknown>): HcTerminalSummary[] {
  if (!Array.isArray(result.terminals)) throw invalidResponse('ls has no terminals array');
  return result.terminals.map(terminalSummary);
}

/**
 * `hc label`: set repo-harness labels on a terminal that `herdrAppDo('tab.new' | 'pane.split')` just created.
 * That terminal has no labels yet, so this is the one call that does not first require a repo-harness label;
 * use it only with the `t<n>` address that the placement returned.
 */
export function hcLabel(terminalAddress: string, labels: HcLabels, options: HerdrCoreOptions = {}): HcTerminal {
  const pairs = labelArgs(labels).filter((_, index) => index % 2 === 1);
  return ownedTerminal(hc('label', ['--', address(terminalAddress), ...pairs], options));
}

/** `hc send`: paste text into a repo-harness terminal and press Enter. hc refuses a blocked program (exit 9). */
export function hcSend(terminalAddress: string, text: string, options: HerdrCoreOptions = {}): HcSendResult {
  const target = hcGet(terminalAddress, options).address;
  const result = hc('send', ['--', target, text], options);
  if (!(result.started === null || typeof result.started === 'boolean') || !Number.isSafeInteger(result.turn)) {
    throw invalidResponse('send has an invalid started or turn');
  }
  return { started: result.started, turn: result.turn as number };
}

/** `hc read`: the screen plus `lines` of history of a repo-harness terminal, as text. */
export function hcRead(terminalAddress: string, lines = 0, options: HerdrCoreOptions = {}): string {
  if (!Number.isSafeInteger(lines) || lines < 0) throw new RangeError('herdr_core_invalid_lines');
  const target = hcGet(terminalAddress, options).address;
  const result = hc('read', ['--lines', String(lines), '--', target], options);
  if (!isString(result.text)) throw invalidResponse('read has no text');
  return result.text;
}

/**
 * `hc wait`: wait until a repo-harness terminal stops working, at most `seconds`. hc ends the wait itself
 * (`ended: false`, reason `timeout`); the process timeout is that wait plus the transport timeout.
 */
export function hcWait(terminalAddress: string, seconds: number, options: HerdrCoreOptions = {}): HcWaitResult {
  if (!Number.isSafeInteger(seconds) || seconds < 1) throw new RangeError('herdr_core_invalid_wait');
  const target = hcGet(terminalAddress, options).address;
  const result = hc('wait', ['--timeout', String(seconds), '--', target], { ...options, timeoutMs: seconds * 1000 + timeoutOf(options) });
  if (typeof result.ended !== 'boolean' || !isString(result.reason) || !Number.isSafeInteger(result.turn)) {
    throw invalidResponse('wait has an invalid ended, reason or turn');
  }
  return { ended: result.ended, reason: result.reason, turn: result.turn as number, status: status(result.status ?? null, `wait ${target}`) };
}

/** `hc kill`: end a repo-harness terminal's program (hangup, then escalate). Returns the terminal as hc observed it. */
export function hcKill(terminalAddress: string, options: HerdrCoreOptions = {}): HcTerminal {
  const target = hcGet(terminalAddress, options).address;
  return terminal(hc('kill', ['--', target], options));
}

/** `hc rm`: remove a finished repo-harness terminal. hc refuses a live one (kind `live`). Returns the removed address. */
export function hcRm(terminalAddress: string, options: HerdrCoreOptions = {}): string {
  const target = hcGet(terminalAddress, options).address;
  const result = hc('rm', ['--', target], options);
  if (!isString(result.removed)) throw invalidResponse('rm has no removed address');
  return result.removed;
}

/** One `hc events --json` line. A heartbeat (every 15 s by default) only proves the stream is alive: null. */
function streamItem(line: string): HcStreamItem | null {
  const value = parseObject('hc', line);
  if (Array.isArray(value.terminals) && Number.isSafeInteger(value.seq)) {
    return { type: 'snapshot', seq: value.seq as number, terminals: value.terminals.map(terminal) };
  }
  const params = value.params;
  if (!isRecord(params) || !Number.isSafeInteger(params.seq)) throw invalidResponse('event line has no params.seq');
  const seq = params.seq as number;
  if (value.method === 'heartbeat') return null;
  if (value.method === 'missed' && Array.isArray(params.terminals)) return { type: 'missed', seq, terminals: params.terminals.map(terminal) };
  if (value.method === 'event' && isString(params.terminal) && isString(params.type) && (params.data === null || isRecord(params.data))) {
    return { type: 'event', seq, terminal: params.terminal, event: params.type, data: params.data };
  }
  throw invalidResponse('event line is not a snapshot, heartbeat, missed or event');
}

/**
 * `hc events --json --label`: a snapshot of the labeled terminals, then each change, and a `missed` snapshot
 * when the subscriber fell behind. Heartbeats are consumed here and never reach `onItem`. The filter must hold a
 * repo-harness label. The stream has no command timeout. `done` resolves after `close()` or a clean exit. It
 * rejects with a HerdrCoreError, or with the error that `onItem` threw; either stops the hc child.
 */
export function hcEvents(labels: HcLabels, onItem: (item: HcStreamItem) => void, options: HerdrCoreOptions = {}): HcEventStream {
  const env = environment('hc', options);
  const child = spawn('hc', ['events', '--json', ...labelArgs(labels)], { env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  let closed = false, failed: unknown, stderr = '';
  const stop = (error?: unknown) => { failed ??= error; if (!closed) { closed = true; child.kill('SIGTERM'); } };
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk; });
  createInterface({ input: child.stdout }).on('line', line => {
    if (closed) return;
    try {
      const item = streamItem(line);
      if (item) onItem(item);
    } catch (error) { stop(error); }
  });
  const done = new Promise<void>((resolve, reject) => {
    child.once('error', error => { closed = true; reject(spawnError('hc', error)); });
    child.once('close', (code, signal) => {
      if (failed !== undefined) reject(failed);
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
