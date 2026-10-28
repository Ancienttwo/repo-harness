import { basename } from 'node:path';
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

const GENERIC_GIT_NAMES = new Set(['git', 'git.exe']);

export function configuredGitBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env.REPO_HARNESS_GIT_BIN ?? 'git';
}

export function isGitExecutableName(command: string): boolean {
  return GENERIC_GIT_NAMES.has(basename(command).toLowerCase());
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
  options: T,
): { bin: string; options: Omit<T, 'gitBin' | 'direct'> & { timeout: number } } {
  const { gitBin, direct, timeout, env, ...rest } = options;
  // Observation policy allows the caller's git name. Re-entering it from the
  // observation executor would loop, so that executor sets direct.
  const observing = direct !== true && currentReadonlyObservation() !== undefined;
  const bin = observing ? (gitBin?.trim() || 'git') : resolveGitExecutable(gitBin, env);
  return {
    bin,
    options: { ...rest, env, timeout: resolveGitTimeout(timeout) } as Omit<T, 'gitBin' | 'direct'> & { timeout: number },
  };
}

type GitExecStringOptions = ExecFileSyncOptionsWithStringEncoding & GitCallFields;
type GitExecBufferOptions = ExecFileSyncOptionsWithBufferEncoding & GitCallFields;
type GitExecOptions = ExecFileSyncOptions & GitCallFields;

export function gitExecFileSync(args: readonly string[], options: GitExecStringOptions): string;
export function gitExecFileSync(args: readonly string[], options?: GitExecBufferOptions): Buffer;
export function gitExecFileSync(args: readonly string[], options: GitExecOptions = {}): string | Buffer {
  const bound = bindGit(options);
  const argv = [...args];
  if (currentReadonlyObservation() !== undefined && options.direct !== true) {
    return observationExecFileSync(bound.bin, argv, bound.options) as string | Buffer;
  }
  return execFileSyncRaw(bound.bin, argv, bound.options);
}

type GitSpawnStringOptions = SpawnSyncOptionsWithStringEncoding & GitCallFields;
type GitSpawnBufferOptions = SpawnSyncOptionsWithBufferEncoding & GitCallFields;
type GitSpawnOptions = SpawnSyncOptions & GitCallFields;

export function gitSpawnSync(args: readonly string[], options: GitSpawnStringOptions): SpawnSyncReturns<string>;
export function gitSpawnSync(args: readonly string[], options?: GitSpawnBufferOptions): SpawnSyncReturns<Buffer>;
export function gitSpawnSync(args: readonly string[], options: GitSpawnOptions = {}): SpawnSyncReturns<string | Buffer> {
  const bound = bindGit(options);
  const argv = [...args];
  if (currentReadonlyObservation() !== undefined && options.direct !== true) {
    return observationSpawnSync(bound.bin, argv, bound.options) as SpawnSyncReturns<string | Buffer>;
  }
  return spawnSyncRaw(bound.bin, argv, bound.options);
}

export function spawnGit(args: readonly string[], options: SpawnOptions & GitCallFields = {}): ChildProcess {
  const { gitBin, env, direct: _direct, ...rest } = options;
  return spawnRaw(resolveGitExecutable(gitBin, env), [...args], { ...rest, env });
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
    const child = spawnRaw(resolveGitExecutable(gitBin, env), [...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
      const errorText = Buffer.concat(stderr).toString('utf8');
      const status = exited?.code ?? null;
      const signal = exited?.signal ?? null;
      if (spawnError) reject(new GitExecError(`git ${args[0] ?? ''} could not start: ${spawnError.message}`, null, null, false, ''));
      else if (timedOut) reject(new GitExecError(`git ${args[0] ?? ''} timed out`, null, signal, true, errorText));
      else if (overflow) reject(new GitExecError(`git ${args[0] ?? ''} output exceeded ${GIT_OUTPUT_MAX_BYTES} bytes`, null, signal, false, errorText));
      else if (status !== 0) reject(new GitExecError(`git ${args[0] ?? ''} failed (${signal ?? `exit ${status}`})`, status, signal, false, errorText));
      else resolveOutput(Buffer.concat(stdout).toString('utf8'));
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
