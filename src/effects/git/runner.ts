import {
  execFileSync as execFileSyncRaw,
  spawn as spawnRaw,
  spawnSync as spawnSyncRaw,
  type ChildProcess,
  type ExecFileSyncOptions,
  type ExecFileSyncOptionsWithBufferEncoding,
  type ExecFileSyncOptionsWithStringEncoding,
  type SpawnOptions,
  type SpawnSyncOptions,
  type SpawnSyncOptionsWithBufferEncoding,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';
import {
  currentReadonlyObservation,
  observationExecFileSync,
  observationSpawnSync,
} from '../readonly-observation';

/**
 * Wall clock for a git call that does not set its own timeout.
 * Same bound as the shared process runner, so a forgotten deadline still
 * ends a hung git instead of waiting forever.
 */
export const DEFAULT_GIT_TIMEOUT_MS = 120_000;

/**
 * Variables that make git ignore the working directory when it selects the repository,
 * or take its refs, objects and config from another repository.
 */
export const REPOSITORY_SELECTING_GIT_ENV = [
  'GIT_DIR',
  'GIT_COMMON_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
] as const;

export function withoutRepositorySelectingGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const key of REPOSITORY_SELECTING_GIT_ENV) delete next[key];
  return next;
}

/** Provider tokens that gh, and the `gh auth git-credential` helper that git starts, read from the environment. */
const PROVIDER_TOKEN_ENV = new Set(['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']);

/** Subcommands that contact a remote, so git can start a credential helper that needs a provider token. */
const CREDENTIAL_GIT_COMMANDS = new Set(['fetch', 'pull', 'push', 'ls-remote', 'clone']);
/** Global options that select no mode and take no value. */
const GIT_GLOBAL_FLAGS = new Set([
  '-p', '--paginate', '-P', '--no-pager', '--bare', '--no-replace-objects', '--no-lazy-fetch', '--no-optional-locks',
  '--no-advice', '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs', '--icase-pathspecs',
]);
/** Global options that take the next argument as their value, or an attached `=value`. */
const VALUED_GIT_GLOBAL_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--attr-source']);

/**
 * Index of the subcommand git runs, or -1. Help, version and path modes, unknown
 * options and a valued option without its value give -1.
 */
function gitSubcommandIndex(args: readonly string[]): number {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (GIT_GLOBAL_FLAGS.has(arg)) continue;
    if (VALUED_GIT_GLOBAL_OPTIONS.has(arg)) {
      if (++index >= args.length) return -1;
      continue;
    }
    if (arg.startsWith('--') && arg.includes('=') && VALUED_GIT_GLOBAL_OPTIONS.has(arg.slice(0, arg.indexOf('=')))) continue;
    return arg.startsWith('-') ? -1 : index;
  }
  return -1;
}

/** git turns `<cmd> --help` into `git help <cmd>`, which starts the configured man viewer or browser. */
function isHelpArgument(arg: string): boolean {
  return arg === '--help' || arg === '-h' || arg.startsWith('--help=');
}

/** A copy of env without provider tokens. Names match without case, as Windows reads them. */
export function withoutProviderTokens(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !PROVIDER_TOKEN_ENV.has(key.toUpperCase())));
}

/**
 * Environment of one git child. Only a subcommand that contacts a remote keeps
 * the provider tokens; every other git process, and the hooks, merge drivers
 * and filters it starts, runs without them.
 */
export function gitChildEnv(args: readonly string[], env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv | undefined {
  const at = gitSubcommandIndex(args);
  if (at >= 0 && CREDENTIAL_GIT_COMMANDS.has(args[at]!) && !args.slice(at + 1).some(isHelpArgument)) return env;
  return withoutProviderTokens(env);
}

const REDACTED = '[redacted]';

/**
 * A shorter value is not a real provider token: it would corrupt ordinary output
 * (a one-letter value turns `status` into `st[redacted]tus`). GitHub tokens have 40 or more characters.
 */
export const MIN_PROVIDER_TOKEN_LENGTH = 8;

function hasProviderToken(env: NodeJS.ProcessEnv): boolean {
  return Object.entries(env).some(([key, value]) => PROVIDER_TOKEN_ENV.has(key.toUpperCase()) && value);
}

/**
 * Provider-token values in the env of one git child, longest first. Only a call whose child env keeps
 * a token reaches this check: a value that is too short, or that the marker contains, is malformed
 * authority, so the call fails closed.
 */
function providerTokenValues(env: NodeJS.ProcessEnv): string[] {
  const values = new Set<string>();
  for (const [key, value] of Object.entries(env)) {
    if (!PROVIDER_TOKEN_ENV.has(key.toUpperCase()) || !value) continue;
    if (value.length < MIN_PROVIDER_TOKEN_LENGTH || REDACTED.includes(value)) {
      throw new Error(`${key} is shorter than ${MIN_PROVIDER_TOKEN_LENGTH} characters or part of the redaction marker; git does not run with a malformed provider token`);
    }
    values.add(value);
  }
  return [...values].sort((left, right) => right.length - left.length);
}

/** The subcommand git runs, or an empty name. Runner messages name it and no argument value. */
function subcommandOf(args: readonly string[]): string {
  const at = gitSubcommandIndex(args);
  return at >= 0 ? args[at]! : '';
}

/** `spawnGit` and `runGit` cannot replace values in their output, so they refuse a call that keeps a token. */
export function refuseProviderToken(entry: string, args: readonly string[], childEnv: NodeJS.ProcessEnv | undefined): void {
  if (hasProviderToken(childEnv ?? process.env)) {
    throw new Error(`${entry} cannot replace provider-token values and the environment of git ${subcommandOf(args)} keeps one; use gitExecFileSync, gitSpawnSync or gitExecFile`);
  }
}

/** The option keys that the remote git callers pass. A call that keeps a token accepts no other key. */
const REMOTE_CALL_OPTION_KEYS = new Set(['cwd', 'env', 'gitBin', 'timeout', 'maxBuffer', 'encoding', 'input', 'killSignal', 'stdio']);

/**
 * A call that keeps a token needs stdout and stderr pipes that the runner reads and replaces.
 * Returns the caller's stdin setting unchanged; the runner sets stdout and stderr itself.
 */
function remoteStdio(stdio: ExecFileSyncOptions['stdio']): unknown {
  const streams = stdio === undefined || stdio === null || typeof stdio === 'string' ? [stdio, stdio, stdio] : stdio;
  for (const stream of [streams[1], streams[2]]) {
    if (stream !== undefined && stream !== null && stream !== 'pipe' && stream !== 'ignore') {
      throw new Error('a git call that keeps a provider token needs runner-owned stdout and stderr pipes; inherit, an fd number and a raw stream are refused');
    }
  }
  return streams[0];
}

function assertRemoteCallOptions(args: readonly string[], options: object): void {
  for (const key of Object.keys(options)) {
    if (!REMOTE_CALL_OPTION_KEYS.has(key)) {
      throw new Error(`git ${subcommandOf(args)} keeps a provider token and refuses the option "${key}"; a remote call takes only ${[...REMOTE_CALL_OPTION_KEYS].join(', ')}`);
    }
  }
}

function redactText(text: string, values: readonly string[], cut = false): string {
  const replaced = values.reduce((current, value) => current.split(value).join(REDACTED), text);
  // A cut inside a token leaves part of it that no value matches. Drop what the longest token could have left.
  return cut ? replaced.slice(0, Math.max(0, replaced.length - (values[0]!.length - 1))) : replaced;
}

/** Buffers are matched byte for byte (latin1), so binary git output outside a token stays intact. */
function redactOutput<T extends string | Buffer | null | undefined>(output: T, values: readonly string[], cut = false): T {
  if (typeof output === 'string') return redactText(output, values, cut) as T;
  if (!Buffer.isBuffer(output)) return output;
  const latin1 = (text: string) => Buffer.from(text).toString('latin1');
  const marked = Buffer.from(redactText(output.toString('latin1'), values.map(latin1), cut), 'latin1');
  return (marked.equals(output) ? output : marked) as T;
}

const outputLimitHit = (error: unknown): boolean => (error as NodeJS.ErrnoException | undefined)?.code === 'ENOBUFS';

type Encoding = BufferEncoding | 'buffer' | null | undefined;

/** The runner captures bytes and replaces values first; the caller encoding applies to the replaced bytes. */
function encoded<T>(output: T, encoding: Encoding): T | string {
  return Buffer.isBuffer(output) && typeof encoding === 'string' && encoding !== 'buffer' ? output.toString(encoding) : output;
}

/** A new error built from replaced fields only, so no field of the original (spawnargs, path, cmd) keeps a value. */
function rebuildError(error: unknown, values: readonly string[], encoding: Encoding): unknown {
  if (!(error instanceof Error)) return error;
  const cut = outputLimitHit(error);
  const rebuilt = new Error(redactText(error.message, values));
  rebuilt.name = error.name;
  const clean = (value: unknown, streamCut: boolean): unknown => {
    if (typeof value === 'string') return redactText(value, values);
    if (Buffer.isBuffer(value)) return encoded(redactOutput(value, values, streamCut), encoding);
    return Array.isArray(value) ? value.map(entry => clean(entry, streamCut)) : value;
  };
  for (const [key, value] of Object.entries(error)) {
    // Node sets `error.error = error`; an Error-valued field would carry the original with its unreplaced fields.
    if (value instanceof Error) continue;
    (rebuilt as unknown as Record<string, unknown>)[key] = clean(value, cut && (key === 'stdout' || key === 'stderr' || key === 'output'));
  }
  return rebuilt;
}

function redactSpawnResult<R extends SpawnSyncReturns<string | Buffer>>(result: R, values: readonly string[], encoding: Encoding): R {
  const cut = outputLimitHit(result.error);
  const replace = (output: string | Buffer | null) => encoded(redactOutput(output, values, cut), encoding);
  result.stdout = replace(result.stdout) as never;
  result.stderr = replace(result.stderr) as never;
  if (Array.isArray(result.output)) result.output = result.output.map(replace) as never;
  if (result.error) result.error = rebuildError(result.error, values, encoding) as Error;
  return result;
}

const GENERIC_GIT_NAMES = new Set(['git', 'git.exe']);

export function configuredGitBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env.REPO_HARNESS_GIT_BIN ?? 'git';
}

function configuredFrom(env: NodeJS.ProcessEnv | undefined, onlyOwn: boolean): string | undefined {
  if (!env) return undefined;
  if (onlyOwn && !Object.prototype.hasOwnProperty.call(env, 'REPO_HARNESS_GIT_BIN')) return undefined;
  const value = env.REPO_HARNESS_GIT_BIN?.trim();
  return value ? value : undefined;
}

/**
 * An explicit path wins. The bare name `git` does not: that is the call site
 * that used to ignore `REPO_HARNESS_GIT_BIN`. A child env that sets the
 * variable wins over the parent; a child env that omits it does not hide it.
 */
export function resolveGitExecutable(
  explicit?: string,
  env?: NodeJS.ProcessEnv,
  parent: NodeJS.ProcessEnv = process.env,
): string {
  const named = explicit?.trim();
  if (named && !GENERIC_GIT_NAMES.has(named.toLowerCase())) return named;
  return configuredFrom(env, true) ?? configuredFrom(parent, false) ?? named ?? 'git';
}

export function resolveGitTimeout(explicit: number | undefined): number {
  return explicit === undefined ? DEFAULT_GIT_TIMEOUT_MS : explicit;
}

type GitCallFields = { gitBin?: string; direct?: boolean };

function bindGit<T extends GitCallFields & { timeout?: number; env?: NodeJS.ProcessEnv }>(
  args: readonly string[],
  options: T,
): { bin: string; values: string[]; encoding: Encoding; options: Omit<T, 'gitBin' | 'direct'> & { timeout: number } } {
  const { gitBin, direct, timeout, env, ...rest } = options;
  // Observation policy allows the caller's git name. Re-entering it from the
  // observation executor would loop, so that executor sets direct.
  const observing = direct !== true && currentReadonlyObservation() !== undefined;
  const bin = observing ? (gitBin?.trim() || 'git') : resolveGitExecutable(gitBin, env);
  const childEnv = gitChildEnv(args, env);
  // The values to replace come from the env this child gets, once per call.
  const values = hasProviderToken(childEnv ?? process.env) ? providerTokenValues(childEnv ?? process.env) : [];
  const bound = (extra: object) => ({ ...rest, ...extra, env: childEnv, timeout: resolveGitTimeout(timeout) }) as Omit<T, 'gitBin' | 'direct'> & { timeout: number };
  const caller = options as ExecFileSyncOptions;
  if (values.length === 0) return { bin, values, encoding: undefined, options: bound({}) };
  assertRemoteCallOptions(args, options);
  // After the caller options, so no caller value can turn a stream, the encoding or the shell back on.
  const stdin = remoteStdio(caller.stdio);
  return { bin, values, encoding: caller.encoding, options: bound({ stdio: [stdin, 'pipe', 'pipe'], encoding: 'buffer', shell: false }) };
}

type GitExecStringOptions = ExecFileSyncOptionsWithStringEncoding & GitCallFields;
type GitExecBufferOptions = ExecFileSyncOptionsWithBufferEncoding & GitCallFields;
type GitExecOptions = ExecFileSyncOptions & GitCallFields;

export function gitExecFileSync(args: readonly string[], options: GitExecStringOptions): string;
export function gitExecFileSync(args: readonly string[], options?: GitExecBufferOptions): Buffer;
export function gitExecFileSync(args: readonly string[], options: GitExecOptions = {}): string | Buffer {
  const bound = bindGit(args, options);
  const argv = [...args];
  const run = (): string | Buffer => currentReadonlyObservation() !== undefined && options.direct !== true
    ? observationExecFileSync(bound.bin, argv, bound.options) as string | Buffer
    : execFileSyncRaw(bound.bin, argv, bound.options);
  if (bound.values.length === 0) return run();
  try {
    return encoded(redactOutput(run(), bound.values), bound.encoding);
  } catch (error) {
    throw rebuildError(error, bound.values, bound.encoding);
  }
}

type GitSpawnStringOptions = SpawnSyncOptionsWithStringEncoding & GitCallFields;
type GitSpawnBufferOptions = SpawnSyncOptionsWithBufferEncoding & GitCallFields;
type GitSpawnOptions = SpawnSyncOptions & GitCallFields;

export function gitSpawnSync(args: readonly string[], options: GitSpawnStringOptions): SpawnSyncReturns<string>;
export function gitSpawnSync(args: readonly string[], options?: GitSpawnBufferOptions): SpawnSyncReturns<Buffer>;
export function gitSpawnSync(args: readonly string[], options: GitSpawnOptions = {}): SpawnSyncReturns<string | Buffer> {
  const bound = bindGit(args, options);
  const argv = [...args];
  const run = (): SpawnSyncReturns<string | Buffer> => currentReadonlyObservation() !== undefined && options.direct !== true
    ? observationSpawnSync(bound.bin, argv, bound.options) as SpawnSyncReturns<string | Buffer>
    : spawnSyncRaw(bound.bin, argv, bound.options);
  if (bound.values.length === 0) return run();
  try {
    return redactSpawnResult(run(), bound.values, bound.encoding);
  } catch (error) {
    throw rebuildError(error, bound.values, bound.encoding);
  }
}

export function spawnGit(args: readonly string[], options: SpawnOptions & GitCallFields = {}): ChildProcess {
  const { gitBin, env, direct: _direct, ...rest } = options;
  const childEnv = gitChildEnv(args, env);
  refuseProviderToken('spawnGit', args, childEnv);
  return spawnRaw(resolveGitExecutable(gitBin, env), [...args], { ...rest, env: childEnv });
}

/** Wait after SIGTERM before a timed-out async git call sends SIGKILL. */
export const GIT_KILL_GRACE_MS = 1_000;
const GIT_OUTPUT_MAX_BYTES = 1024 * 1024;

/** Rejection of `gitExecFile`. `status` is the exit code; it is null after a signal, a timeout or a spawn failure. */
export class GitExecError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly signal: NodeJS.Signals | null,
    readonly timedOut: boolean,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'GitExecError';
  }
}

export interface GitExecAsyncOptions extends GitCallFields {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeout?: number;
}

/**
 * Asynchronous `gitExecFileSync` for an event-loop caller: same binary and
 * timeout resolution, stdin ignored, utf8 stdout. At the timeout it sends
 * SIGTERM, then SIGKILL after GIT_KILL_GRACE_MS. It settles only after the
 * child exited, and rejects with GitExecError on a non-zero exit, a signal,
 * the timeout, too much output or a spawn failure.
 */
export function gitExecFile(args: readonly string[], options: GitExecAsyncOptions = {}): Promise<string> {
  const { gitBin, env, cwd, timeout } = options;
  return new Promise((resolveOutput, reject) => {
    const childEnv = gitChildEnv(args, env);
    const values = hasProviderToken(childEnv ?? process.env) ? providerTokenValues(childEnv ?? process.env) : [];
    const child = spawnRaw(resolveGitExecutable(gitBin, env), [...args], { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let exited: { readonly code: number | null; readonly signal: NodeJS.Signals | null } | null = null;
    let timedOut = false;
    let overflow = false;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const terminate = () => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), GIT_KILL_GRACE_MS);
    };
    const finish = (spawnError?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(killTimer);
      child.stdout!.destroy();
      child.stderr!.destroy();
      const status = exited?.code ?? null;
      const signal = exited?.signal ?? null;
      const redactAll = (text: string, cut = false) => values.length > 0 ? redactText(text, values, cut) : text;
      const errorText = redactAll(Buffer.concat(stderr).toString('utf8'), overflow);
      const failure = (message: string, code: number | null, signalName: NodeJS.Signals | null, timeout: boolean, text: string) =>
        reject(new GitExecError(redactAll(message), code, signalName, timeout, text));
      if (spawnError) failure(`git ${subcommandOf(args)} could not start: ${spawnError.message}`, null, null, false, '');
      else if (timedOut) failure(`git ${subcommandOf(args)} timed out`, null, signal, true, errorText);
      else if (overflow) failure(`git ${subcommandOf(args)} output exceeded ${GIT_OUTPUT_MAX_BYTES} bytes`, null, signal, false, errorText);
      else if (status !== 0) failure(`git ${subcommandOf(args)} failed (${signal ?? `exit ${status}`})`, status, signal, false, errorText);
      else resolveOutput(redactAll(Buffer.concat(stdout).toString('utf8')));
    };
    const collect = (into: Buffer[]) => (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > GIT_OUTPUT_MAX_BYTES) {
        if (!overflow) { overflow = true; terminate(); }
        return;
      }
      into.push(chunk);
    };
    child.stdout!.on('data', collect(stdout));
    child.stderr!.on('data', collect(stderr));
    const deadline = setTimeout(() => {
      timedOut = true;
      // A process that exited but left its pipes open to a descendant has nothing left to kill.
      if (exited) finish();
      else terminate();
    }, resolveGitTimeout(timeout));
    child.on('error', (error) => { if (child.pid === undefined) finish(error); });
    child.on('exit', (code, signal) => {
      exited = { code, signal };
      if (timedOut || overflow) finish();
    });
    child.on('close', (code, signal) => {
      exited ??= { code, signal };
      finish();
    });
  });
}
