import { execFile, spawn, spawnSync, type ExecFileException, type SpawnSyncReturns } from 'child_process';
import { createInterface } from 'readline';
import type { AttentionHostFailureV1, AttentionHostPortsV1, AttentionWatcherV1 } from '../../core/board/attention-delivery';
import type { BoardHostPortsV1 } from '../../core/board/board';
import { NOTIFY_SECRET_KEYS } from '../../core/decision/notify-secret-keys';

/**
 * herdr-core transport: typed `hc` CLI calls with `--json`, its event stream, and `herdr-app do` for pane
 * placement. Every call is scoped to repo-harness terminals: lists and streams need a repo-harness label
 * filter, and calls on one terminal need its `t<n>` address and a repo-harness label on it.
 * hc (floor 0.1.17) reports no API generation in its CLI output; the shape validation below is the only guard.
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
  /** The environment for the child; `HC_SESSION` / `HC_SOCKET` select the core. Defaults to `process.env`. The notify secret keys never reach the child. */
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
  /** When the status word last changed, ms since the epoch; absent when hc omits it (schema default null). */
  readonly status_ms?: number | null;
  readonly turn: number;
  /** The program's pid (it leads its own process group), not the holder's. */
  readonly pid: number | null;
  /** What runs in the terminal now; null once it has finished. */
  readonly foreground: HcForeground | null;
  /** Why the program ended (`exited`, `killed`, ...) or is pending. */
  readonly reason: string | null;
}
export interface HcSendResult { readonly started: boolean | null; readonly turn: number }
/** `complete` is false when part of the asked text may be missing; `why` names the reason (`working`, `blocked`, `error`). */
export interface HcReadResult { readonly text: string; readonly complete: boolean; readonly why: string | null }
export interface HcWaitResult { readonly ended: boolean; readonly reason: string; readonly turn: number; readonly status: HcStatus | null }
export type HcStreamItem =
  | { readonly type: 'snapshot'; readonly seq: number; readonly terminals: readonly HcTerminal[] }
  /** The subscriber fell behind: hc dropped events. Replace all state with these terminals; ignore later events whose seq is not above it. */
  | { readonly type: 'missed'; readonly seq: number; readonly terminals: readonly HcTerminal[] }
  /** A fact change. `data` is null for a `foreground` change when no process is in the foreground. */
  | { readonly type: 'event'; readonly seq: number; readonly terminal: string; readonly event: string; readonly data: Readonly<Record<string, unknown>> | null };
export interface HcEventStream { close(): void; readonly done: Promise<void> }
/** `hc server status`: the core that answers. `core.id` is permanent until the core state is wiped. */
export interface HcServerStatus {
  readonly version: string; readonly core: { readonly id: string; readonly name: string }; readonly live: number; readonly finished: number;
}

/**
 * The Herdr.app commands that place panes; every other path goes through hc. `terminal.keep` gives a running
 * terminal without a pane a pane in the person's window (a new tab, or `place` "right" / "down").
 */
export type HerdrAppPlacement = 'tab.new' | 'pane.split' | 'pane.close' | 'terminal.keep';

/** The repo-harness label keys; the only source for every surface that writes or filters hc labels. */
export const RH_LABEL = {
  role: 'repo-harness.role',
  task: 'repo-harness.task',
  request: 'repo-harness.request',
  repository: 'repo-harness.repository',
  harness: 'repo-harness.harness',
  notify: 'repo-harness.notify',
  /** Seat labels, written at seat launch (#1473) and read by the board (#1505). */
  seat: 'repo-harness.seat',
  issue: 'repo-harness.issue',
  pr: 'repo-harness.pr',
  parent: 'repo-harness.parent',
  /** A resident repo-harness program that is not a seat (#1509). */
  service: 'repo-harness.service',
} as const;
/** `repo-harness.role` values. A surface that needs a new role adds it here. */
export const RH_ROLE = { notifyRelay: 'notify-relay', taskSession: 'task-session' } as const;
/** Terminals that carry this pair send blocked and done notices through the relay. */
export const RH_NOTIFY_LABELS: HcLabels = { [RH_LABEL.notify]: 'on' };
export const RH_NOTIFY_RELAY = { name: 'rh-notify-relay', labels: { [RH_LABEL.role]: RH_ROLE.notifyRelay } } as const;
/** The terminals of the attention watcher (#1509) carry this pair, with the repository and parent labels of their board. */
export const RH_ATTENTION_SERVICE_LABELS: HcLabels = { [RH_LABEL.service]: 'attention' };

const RH_PREFIX = 'repo-harness.';
const RH_KEYS: ReadonlySet<string> = new Set(Object.values(RH_LABEL));
const RH_ROLES: ReadonlySet<string> = new Set(Object.values(RH_ROLE));
const LABEL_KEY = /^[a-z][a-z0-9._-]{0,63}$/;
const LABEL_VALUE = /^[\x21-\x7e][\x20-\x7e]{0,255}$/;
/**
 * hc's own address for a terminal on this core (hc terminals.rs `id_shaped`, floor 0.1.17): `t`, then 1-9, then base-30
 * symbols, for example `t7` or `t1b`. A name can name a later terminal; this address never does, and no name has
 * this shape. hc ids are u32, so an address has at most seven symbols.
 */
const ADDRESS = /^t[1-9][0-9bcdfghjkmnpqrstvwxyz]{0,6}$/;

/** True when `value` has hc's terminal address shape (see ADDRESS). */
export function isHcAddress(value: string): boolean {
  return ADDRESS.test(value);
}

const invalidResponse = (detail: string) => new HerdrCoreError('hc', 'invalid_response', undefined, undefined, detail);

function environment(program: HerdrCoreProgram, options: HerdrCoreOptions): NodeJS.ProcessEnv {
  const env = options.env ?? process.env;
  // A classic Herdr pane inside an hc terminal (or the reverse) is a nested multiplexer.
  if (env.HC_TERMINAL_ID && env.HERDR_ENV === '1') throw new HerdrCoreError(program, 'nested', undefined, undefined, 'HC_TERMINAL_ID and HERDR_ENV=1 are both set');
  // A call can start a stopped core. The core keeps this environment and gives it to every terminal it starts later.
  const child = { ...env };
  for (const key of NOTIFY_SECRET_KEYS) delete child[key];
  return child;
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
    if (key === RH_LABEL.service && value !== 'attention') throw invalid(`unknown repo-harness service ${JSON.stringify(value)}`);
  }
  return entries.flatMap(([key, value]) => ['--label', `${key}=${value}`]);
}

function address(value: string): string {
  if (!isHcAddress(value)) throw new HerdrCoreError('hc', 'invalid_address', undefined, undefined, `${JSON.stringify(value)} is not a t<n> address`);
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

function run(program: HerdrCoreProgram, args: readonly string[], options: HerdrCoreOptions): SpawnSyncReturns<Buffer> {
  const env = environment(program, options);
  const result: SpawnSyncReturns<Buffer> = spawnSync(program, [...args], {
    env, timeout: timeoutOf(options), killSignal: 'SIGKILL', shell: false, maxBuffer: MAX_OUTPUT_BYTES, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw spawnError(program, result.error);
  return result;
}
function invoke(program: HerdrCoreProgram, args: readonly string[], options: HerdrCoreOptions): Record<string, unknown> {
  const result = run(program, args, options);
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
const isMs = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
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
  const statusMs = optional(record, 'status_ms', orNull(isMs), where);
  return {
    ...summary, labels: labels as HcLabels, status: status(record.status ?? null, where),
    ...(statusMs === undefined ? {} : { status_ms: statusMs }), turn: record.turn as number,
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

/** `hc --version`: the installed client version (`hc 0.1.17`). It reads no core and no terminal. */
export function hcVersion(options: HerdrCoreOptions = {}): string {
  const result = run('hc', ['--version'], options);
  if (result.signal || result.status !== 0) throw new HerdrCoreError('hc', 'failed', result.status ?? undefined);
  const match = /^hc ([0-9]+\.[0-9]+\.[0-9]+)\s*$/u.exec(result.stdout.toString('utf8'));
  if (!match) throw invalidResponse('version output is not "hc x.y.z"');
  return match[1]!;
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

export interface HcListOptions extends HerdrCoreOptions {
  /** `--all`: finished terminals too, not only live ones. */
  readonly all?: boolean;
}

function listArgs(labels: HcLabels, options: HcListOptions): string[] {
  return [...labelArgs(labels), ...(options.all ? ['--all'] : [])];
}

/** `hc ls --label`: terminals that carry every label, live only unless `all`. The filter must hold a repo-harness label. */
export function hcList(labels: HcLabels, options: HcListOptions = {}): HcTerminalSummary[] {
  return listResult(hc('ls', listArgs(labels, options), options));
}

/** `hcList` without blocking the event loop, for long-running readers such as `operator serve`. */
export async function hcListAsync(labels: HcLabels, options: HcListOptions = {}): Promise<HcTerminalSummary[]> {
  return listResult(await invokeAsync('hc', ['ls', '--json', ...listArgs(labels, options)], options));
}

function listResult(result: Record<string, unknown>): HcTerminalSummary[] {
  if (!Array.isArray(result.terminals)) throw invalidResponse('ls has no terminals array');
  return result.terminals.map(terminalSummary);
}

const VERSION = /^[0-9]{1,9}\.[0-9]{1,9}\.[0-9]{1,9}$/u;
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/**
 * `hc server status` without blocking the event loop: the version and identity of the core that answers. It reads
 * no terminal. Like every hc call, it starts the core when it is stopped.
 */
export async function hcServerStatusAsync(options: HerdrCoreOptions = {}): Promise<HcServerStatus> {
  const result = await invokeAsync('hc', ['server', 'status', '--json'], options);
  const { core } = result;
  if (!isString(result.version) || !VERSION.test(result.version)) throw invalidResponse('server status has an invalid version');
  if (!isRecord(core) || !isString(core.id) || !core.id || !isString(core.name)) throw invalidResponse('server status has an invalid core');
  if (!isCount(result.live) || !isCount(result.finished)) throw invalidResponse('server status has invalid terminal counts');
  return { version: result.version, core: { id: core.id, name: core.name }, live: result.live, finished: result.finished };
}

/** The `k=v` arguments of `hc label`, checked with the label rules. */
export function hcLabelPairs(labels: HcLabels): string[] {
  return labelArgs(labels).filter((_, index) => index % 2 === 1);
}

/**
 * `hc label`: set repo-harness labels on a terminal that `herdrAppDo('tab.new' | 'pane.split')` just created.
 * That terminal has no labels yet, so this is the one call that does not first require a repo-harness label;
 * use it only with the `t<n>` address that the placement returned.
 */
export function hcLabel(terminalAddress: string, labels: HcLabels, options: HerdrCoreOptions = {}): HcTerminal {
  return ownedTerminal(hc('label', ['--', address(terminalAddress), ...hcLabelPairs(labels)], options));
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

/** `hc read`: the screen plus `lines` of history of a repo-harness terminal, and whether the text is complete. */
export function hcRead(terminalAddress: string, lines = 0, options: HerdrCoreOptions = {}): HcReadResult {
  if (!Number.isSafeInteger(lines) || lines < 0) throw new RangeError('herdr_core_invalid_lines');
  const target = hcGet(terminalAddress, options).address;
  const result = hc('read', ['--lines', String(lines), '--', target], options);
  if (!isString(result.text) || typeof result.complete !== 'boolean') throw invalidResponse('read has an invalid text or complete');
  return { text: result.text, complete: result.complete, why: optional(result, 'why', orNull(isString), `read ${target}`) ?? null };
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
  if (value.method === 'event' && isString(params.terminal) && isString(params.type)
    && (isRecord(params.data) || (params.data === null && params.type === 'foreground'))) {
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

/** The argv of `herdr-app do <command> <json>`: the one source for the call below and for a command the console shows to copy. */
export function herdrAppCommand(command: HerdrAppPlacement, args: Readonly<Record<string, unknown>>): readonly ['herdr-app', 'do', HerdrAppPlacement, string] {
  return ['herdr-app', 'do', command, JSON.stringify(args)];
}

/** `herdr-app do <command> <json>`: place a tab or pane in the person's window. Returns the created IDs. */
export function herdrAppDo(command: HerdrAppPlacement, args: Readonly<Record<string, unknown>>, options: HerdrCoreOptions = {}): Record<string, unknown> {
  const [program, ...rest] = herdrAppCommand(command, args);
  return invoke(program, rest, options);
}

/** The board host port (#1505): seat terminals of one parent issue by its parent label, and the hc version. */
export function boardHostPorts(options: HerdrCoreOptions = {}): BoardHostPortsV1 {
  const unavailable = (error: unknown) => {
    if (error instanceof HerdrCoreError) return { status: 'unavailable', reason: `hc_${error.reason}` } as const;
    throw error;
  };
  return {
    seatTerminals: (repositoryId, parent) => {
      try {
        // A watcher terminal (#1509) carries the repository and parent labels too, but it is a program, not a seat.
        const terminals = hcList({ [RH_LABEL.repository]: repositoryId, [RH_LABEL.parent]: String(parent) }, options)
          .map(({ address }) => hcGet(address, options))
          .filter(terminal => terminal.labels[RH_LABEL.service] === undefined)
          .map((terminal) => {
            const label = (key: string) => terminal.labels[key];
            return {
              address: terminal.address, name: terminal.name, state: terminal.state, status: terminal.status?.state ?? null,
              status_kind: terminal.status?.kind ?? null, status_ms: terminal.status_ms ?? null, turn: terminal.turn,
              labels: { seat: label(RH_LABEL.seat), issue: label(RH_LABEL.issue), pr: label(RH_LABEL.pr) },
            };
          });
        return { status: 'observed', terminals };
      } catch (error) {
        return unavailable(error);
      }
    },
    hcVersion: () => {
      try {
        return { status: 'observed', version: hcVersion(options) };
      } catch (error) {
        return unavailable(error);
      }
    },
  };
}

/** The attention watcher host port (#1509): watcher terminals by the service label, and send and wait on seat terminals. */
export function attentionHostPorts(options: HerdrCoreOptions = {}): AttentionHostPortsV1 {
  const failed = (error: unknown): AttentionHostFailureV1 => {
    if (error instanceof HerdrCoreError) return { status: 'failed', reason: `hc_${error.reason}`, detail: error.message };
    throw error;
  };
  const scoped = (scope: { readonly repository: number; readonly parent: number }): HcLabels =>
    ({ ...RH_ATTENTION_SERVICE_LABELS, [RH_LABEL.repository]: String(scope.repository), [RH_LABEL.parent]: String(scope.parent) });
  const watcher = (terminal: HcTerminal): AttentionWatcherV1 => ({
    address: terminal.address, state: terminal.state,
    repository: terminal.labels[RH_LABEL.repository] ?? null, parent: terminal.labels[RH_LABEL.parent] ?? null,
  });
  return {
    ownTerminal: () => {
      const address = (options.env ?? process.env).HC_TERMINAL_ID;
      if (address === undefined || address === '') return { status: 'failed', reason: 'not_watcher', detail: 'HC_TERMINAL_ID is not set' };
      try {
        const terminal = hcGet(address, options);
        if (terminal.labels[RH_LABEL.service] !== RH_ATTENTION_SERVICE_LABELS[RH_LABEL.service]) {
          return { status: 'failed', reason: 'not_watcher', detail: `terminal ${terminal.address} has no attention service label` };
        }
        return { status: 'observed', ...watcher(terminal) };
      } catch (error) { return failed(error); }
    },
    watchers: (scope) => {
      try {
        const rows = hcList(scope === undefined ? RH_ATTENTION_SERVICE_LABELS : scoped(scope), { ...options, all: true });
        return { status: 'observed', watchers: rows.map(({ address }) => watcher(hcGet(address, options))) };
      } catch (error) { return failed(error); }
    },
    startWatcher: (scope, cwd, argv) => {
      try {
        return { status: 'started', address: hcRun({ argv: [...argv], labels: scoped(scope), cwd, noParent: true }, options).address };
      } catch (error) { return failed(error); }
    },
    send: (terminal, text) => {
      try { hcSend(terminal, text, options); return { status: 'sent' }; } catch (error) { return failed(error); }
    },
    state: (terminal) => {
      try { return { status: 'observed', state: hcGet(terminal, options).status?.state ?? null }; } catch (error) { return failed(error); }
    },
    wait: (terminal, seconds) => {
      try {
        const result = hcWait(terminal, seconds, options);
        return { status: 'observed', ended: result.ended, reason: result.reason, state: result.status?.state ?? null };
      } catch (error) { return failed(error); }
    },
  };
}

