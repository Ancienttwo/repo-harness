import { format } from 'node:util';
import { buildProgram } from '../../src/cli/index';
import type { Command } from 'commander';

/** The `spawnSync` fields CLI tests assert on, produced without a child process. */
export interface InProcessCliResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

const SETTLE_TIMEOUT_MS = 170_000;

function applyEnv(target: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    if (target[key] === undefined) delete process.env[key];
  }
  for (const [key, value] of Object.entries(target)) {
    if (value !== undefined) process.env[key] = value;
  }
}

function overrideExit(command: Command): void {
  command.exitOverride();
  for (const child of command.commands) overrideExit(child);
}

/**
 * Run the repo-harness CLI inside the test process instead of spawning `bun`.
 *
 * The process boundary carried four semantics this runner has to reproduce.
 *
 * `env` and `cwd` are replaced in place and restored afterwards, because the
 * command bodies read them through `process`: `resolveRepoRoot` resolves against
 * `process.cwd()`, and the oracle and Gitleaks child environments are built from
 * a `process.env` snapshot, so fixture binaries only observe a test's variables
 * if the live environment carries them.
 *
 * Commander's own exits (`--help`, unknown option, missing required option) are
 * converted to thrown `CommanderError`s by `exitOverride`, after the help or
 * error text has already been written.
 *
 * A command body's own exit is recorded rather than thrown: the single
 * `process.exit(2)` the `chatgpt` group can reach is the last statement of its
 * error funnel, and throwing from it would surface as an unhandled rejection
 * that Bun's test runner fails on, because the action handlers discard the work
 * promise (`void runChatgptAction(...)`).
 *
 * That discarded promise is also why completion needs its own barrier: commander
 * resolves `parseAsync` before the action finishes. Every `chatgpt` action ends
 * by writing its result to stdout or by reaching that error exit, and nothing
 * under `src/cli/chatgpt-browser/` writes to stdout, so the first stdout write or
 * the recorded exit marks the command as finished. Both are the action's
 * terminal statement, so by the time this function observes one, the remaining
 * synchronous work in that action has already run.
 */
export async function runCliInProcess(
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<InProcessCliResult> {
  const envSnapshot = { ...process.env };
  const requestedEnv = { ...env };
  const cwdSnapshot = process.cwd();
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalExit = process.exit;
  const originalConsole = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    error: console.error,
    warn: console.warn,
  };

  let stdout = '';
  let stderr = '';
  let exitCode: number | undefined;
  let settle: (() => void) | undefined;
  const finished = (): boolean => exitCode !== undefined || stdout.length > 0;
  const emitOut = (text: string): void => {
    stdout += text;
    if (finished()) settle?.();
  };
  const emitErr = (text: string): void => {
    stderr += text;
  };

  applyEnv(requestedEnv);
  process.chdir(cwd);
  process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    emitOut(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
    const callback = rest.find((value) => typeof value === 'function') as (() => void) | undefined;
    callback?.();
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    emitErr(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
    const callback = rest.find((value) => typeof value === 'function') as (() => void) | undefined;
    callback?.();
    return true;
  }) as typeof process.stderr.write;
  console.log = (...values: unknown[]) => emitOut(`${format(...values)}\n`);
  console.info = console.log;
  console.debug = console.log;
  console.error = (...values: unknown[]) => emitErr(`${format(...values)}\n`);
  console.warn = console.error;
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    settle?.();
  }) as typeof process.exit;

  try {
    const program = buildProgram();
    overrideExit(program);
    await program.parseAsync(['bun', 'repo-harness', ...args]);
    if (!finished()) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          settle = resolve;
          timer = setTimeout(
            () => reject(new Error(`in-process CLI did not finish: repo-harness ${args.join(' ')}`)),
            SETTLE_TIMEOUT_MS,
          );
        });
      } finally {
        if (timer) clearTimeout(timer);
        settle = undefined;
      }
    }
    return { status: exitCode ?? 0, stdout, stderr };
  } catch (error) {
    const failure = error as { exitCode?: number; message?: string };
    if (typeof failure.exitCode === 'number') return { status: failure.exitCode, stdout, stderr };
    if (failure.message) emitErr(`${failure.message}\n`);
    return { status: 1, stdout, stderr };
  } finally {
    process.exit = originalExit;
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.chdir(cwdSnapshot);
    applyEnv(envSnapshot);
  }
}
