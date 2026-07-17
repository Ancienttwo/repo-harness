#!/usr/bin/env bun
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Writable } from 'stream';
import { acquireExpensiveRunLock } from './expensive-run-lock';

export const PROCESS_SUPERVISOR_TERMINATION_GRACE_MS = 500;
const PROCESS_GROUP_LAUNCHER = join(import.meta.dir, 'process-group-launcher.ts');

// Set when an exception interrupts TERM/grace/KILL cleanup before the target
// process group's absence can be confirmed. Mirrors PRESERVE_EXPENSIVE_RUN_LOCK
// in run-harness-profile-benchmark.ts: `supervise()` must never release the
// expensive-run lock while this is true, or a still-live group could overlap
// a new contender's work.
let preserveExpensiveRunLock = false;

interface SupervisorOptions {
  readonly metadataPath: string;
  readonly parentPid: number;
  readonly timeoutMs: number;
  readonly captureBytes: number;
  readonly stdio: 'pipe' | 'inherit' | 'ignore';
  readonly expensiveLockCwd: string | null;
  readonly gitBin: string | null;
  readonly command: string;
  readonly args: readonly string[];
}

interface SupervisorResult {
  readonly status: number;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly interruptedBy: NodeJS.Signals | null;
  readonly parentLost: boolean;
  readonly spawnError: string;
  readonly completed: boolean;
  readonly processGroupPid: number | null;
}

interface Completion {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly error: Error | null;
}

interface LauncherResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly spawnError: string;
}

function usage(): never {
  process.stderr.write(
    'Usage: process-supervisor.ts --metadata <path> --parent-pid <pid> --timeout-ms <ms> '
    + '--capture-bytes <bytes> --stdio pipe|inherit|ignore '
    + '[--expensive-lock-cwd <path> --git-bin <path>] -- <command> [args...]\n',
  );
  process.exit(2);
}

function publishResult(path: string, result: SupervisorResult): void {
  writeFileSync(path, `${JSON.stringify(result)}\n`, { mode: 0o600 });
}

function publishedProcessGroupPid(path: string): number | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { processGroupPid?: unknown };
    return Number.isSafeInteger(parsed.processGroupPid) && (parsed.processGroupPid as number) > 0
      ? parsed.processGroupPid as number
      : null;
  } catch {
    return null;
  }
}

function readLauncherResult(path: string): LauncherResult | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as {
      code?: unknown;
      signal?: unknown;
      spawnError?: unknown;
    };
    if ((parsed.code !== null && !Number.isInteger(parsed.code))
      || (parsed.signal !== null && typeof parsed.signal !== 'string')
      || typeof parsed.spawnError !== 'string') return null;
    return parsed as LauncherResult;
  } catch {
    return null;
  }
}

function parseArgs(argv: readonly string[]): SupervisorOptions {
  const separator = argv.indexOf('--');
  if (separator < 0 || separator === argv.length - 1) usage();
  const options = argv.slice(0, separator);
  const value = (name: string): string => {
    const index = options.indexOf(name);
    if (index < 0 || index === options.length - 1) usage();
    return options[index + 1];
  };
  const optionalValue = (name: string): string | null => {
    const index = options.indexOf(name);
    if (index < 0) return null;
    if (index === options.length - 1) usage();
    return options[index + 1];
  };
  const timeoutMs = Number(value('--timeout-ms'));
  const parentPid = Number(value('--parent-pid'));
  const captureBytes = Number(value('--capture-bytes'));
  const stdio = value('--stdio');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) usage();
  if (!Number.isSafeInteger(parentPid) || parentPid < 1) usage();
  if (!Number.isSafeInteger(captureBytes) || captureBytes < 1) usage();
  if (stdio !== 'pipe' && stdio !== 'inherit' && stdio !== 'ignore') usage();
  const expensiveLockCwd = optionalValue('--expensive-lock-cwd');
  const gitBin = optionalValue('--git-bin');
  if ((expensiveLockCwd === null) !== (gitBin === null)) usage();
  return {
    metadataPath: value('--metadata'),
    parentPid,
    timeoutMs,
    captureBytes,
    stdio,
    expensiveLockCwd,
    gitBin,
    command: argv[separator + 1],
    args: argv.slice(separator + 2),
  };
}

function parentIsAlive(parentPid: number): boolean {
  if (process.ppid !== parentPid) return false;
  try {
    process.kill(parentPid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function processGroupExists(child: ChildProcess): boolean {
  if (!child.pid || process.platform === 'win32') return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    throw error;
  }
}

async function waitForProcessGroupQuiescence(
  child: ChildProcess,
  cleanupComplete: () => boolean,
): Promise<void> {
  while (!cleanupComplete() && processGroupExists(child)) await Bun.sleep(10);
}

function signalExitCode(signal: NodeJS.Signals): number {
  switch (signal) {
    case 'SIGHUP': return 129;
    case 'SIGINT': return 130;
    case 'SIGTERM': return 143;
    default: return 1;
  }
}

function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/pid', String(child.pid), '/T', ...(signal === 'SIGKILL' ? ['/F'] : [])], {
      stdio: 'ignore',
      windowsHide: true,
    });
    // A spawn-level failure (e.g. taskkill.exe unreachable) means termination
    // was never even attempted; that must not be swallowed like an
    // already-exited target. taskkill's own exit status cannot reliably
    // distinguish "already gone" from "failed to kill the tree" without
    // parsing localized output, so it is intentionally not treated as proof of
    // success here; whether the group is actually gone is decided
    // independently by the caller's post-signal confirmation.
    if (result.error) throw result.error;
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

function collectBounded(
  stream: NodeJS.ReadableStream | null,
  limit: number,
): Promise<Buffer> {
  if (stream === null) return Promise.resolve(Buffer.alloc(0));
  const chunks: Buffer[] = [];
  let retained = 0;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    stream.on('data', (value: Buffer | string) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const remaining = limit - retained;
      if (remaining > 0) {
        const selected = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining);
        chunks.push(selected);
        retained += selected.length;
      }
    });
    stream.once('error', fail);
    stream.once('end', finish);
    // A failed spawn closes its pipe handles without necessarily emitting end.
    stream.once('close', finish);
  });
}

async function superviseTarget(options: SupervisorOptions): Promise<number> {
  if (!parentIsAlive(options.parentPid)) throw new Error('helper caller exited before supervised process start');
  const launcherResultPath = `${options.metadataPath}.launcher.json`;
  const child = spawn(process.execPath, [
    PROCESS_GROUP_LAUNCHER,
    '--result', launcherResultPath,
    '--command', options.command,
    ...options.args,
  ], {
    detached: process.platform !== 'win32',
    stdio: [options.stdio === 'inherit' ? 'inherit' : 'ignore', options.stdio, options.stdio, 'pipe'],
  });
  const startBarrier = child.stdio[3];
  if (!child.pid || !(startBarrier instanceof Writable)) {
    throw new Error('process group launcher did not expose a start barrier');
  }
  const stdout = collectBounded(child.stdout, options.captureBytes);
  const stderr = collectBounded(child.stderr, options.captureBytes);
  const completion = new Promise<Completion>((resolve) => {
    let settled = false;
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      resolve({ code: 1, signal: null, error });
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      resolve({ code, signal, error: null });
    });
  });
  publishResult(options.metadataPath, {
    status: 1,
    signal: null,
    timedOut: false,
    interruptedBy: null,
    parentLost: false,
    spawnError: 'process supervisor did not publish a completion receipt',
    completed: false,
    processGroupPid: child.pid,
  });
  startBarrier.end('start\n');
  let cleanupComplete = false;
  const processGroupCompletion = completion.then(async (result) => {
    await waitForProcessGroupQuiescence(child, () => cleanupComplete);
    return result;
  });
  const output = Promise.all([stdout, stderr]);
  const fullCompletion = processGroupCompletion.then(async (result) => {
    await output;
    return result;
  });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let interruptResolve: ((signal: NodeJS.Signals) => void) | undefined;
  const interrupted = new Promise<NodeJS.Signals>((resolve) => {
    interruptResolve = resolve;
  });
  const handlers = new Map<NodeJS.Signals, () => void>();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    const handler = (): void => interruptResolve?.(signal);
    handlers.set(signal, handler);
    // Keep the handler installed throughout cleanup. A repeated signal during
    // grace must not restore the default action and kill the supervisor before
    // it can send SIGKILL to TERM-resistant descendants.
    process.on(signal, handler);
  }

  let parentLostResolve: (() => void) | undefined;
  const parentLost = new Promise<'parent-lost'>((resolve) => {
    parentLostResolve = () => resolve('parent-lost');
  });
  const parentWatch = setInterval(() => {
    if (!parentIsAlive(options.parentPid)) parentLostResolve?.();
  }, 25);

  const timedOut = new Promise<'timeout'>((resolve) => {
    timeoutId = setTimeout(() => resolve('timeout'), options.timeoutMs);
  });

  let outcome: 'completed' | 'timeout' | NodeJS.Signals | 'parent-lost';
  let didTimeOut = false;
  let interruptedBy: NodeJS.Signals | null = null;
  let didLoseParent = false;
  try {
    outcome = await Promise.race([
      fullCompletion.then(() => 'completed' as const),
      timedOut,
      interrupted,
      parentLost,
    ]);

    if (outcome !== 'completed') {
      didTimeOut = outcome === 'timeout';
      didLoseParent = outcome === 'parent-lost';
      interruptedBy = outcome === 'timeout' || outcome === 'parent-lost' ? null : outcome;
      signalProcessGroup(child, 'SIGTERM');
      // Always wait the complete grace period and address the original group
      // with SIGKILL. The leader may exit before a TERM-resistant descendant.
      await Bun.sleep(PROCESS_SUPERVISOR_TERMINATION_GRACE_MS);
      signalProcessGroup(child, 'SIGKILL');
      await waitForProcessGroupQuiescence(child, () => false);
      cleanupComplete = true;
      // If an adversarial descendant escaped the original process group while
      // retaining inherited pipes, do not let it keep this supervisor alive.
      child.stdout?.destroy();
      child.stderr?.destroy();
    }
  } catch (error) {
    // A stream error or an unexpected signal failure interrupted cleanup
    // before the process group's absence could be confirmed. Force one more
    // best-effort sweep; if absence still cannot be proven, the caller must
    // not release the expensive-run lock, or a live group could overlap a
    // new contender's work.
    try {
      signalProcessGroup(child, 'SIGKILL');
    } catch {
      // Best effort only; confirmation below decides the lock's fate.
    }
    // processGroupExists() hardcodes `false` on win32 (required so the
    // *normal*, non-exceptional completion wait does not deadlock: Windows
    // has no negative-PGID existence probe to poll instead). That `false` is
    // an absence of evidence, not evidence of absence -- trusting it here
    // would let this exact sweep "confirm" a group Windows was never able to
    // observe in the first place. Once cleanup has already been interrupted
    // by an exception, Windows can never prove the group is gone, so always
    // preserve the lock on that platform instead of polling a check that is
    // structurally unable to say anything but false.
    let confirmedAbsent = false;
    if (process.platform !== 'win32') {
      const sweepDeadlineMs = Date.now() + PROCESS_SUPERVISOR_TERMINATION_GRACE_MS;
      try {
        while (Date.now() < sweepDeadlineMs) {
          if (!processGroupExists(child)) {
            confirmedAbsent = true;
            break;
          }
          await Bun.sleep(10);
        }
      } catch {
        confirmedAbsent = false;
      }
    }
    if (!confirmedAbsent) preserveExpensiveRunLock = true;
    throw error;
  }

  const completed = await completion;
  if (outcome === 'completed') cleanupComplete = true;
  if (timeoutId) clearTimeout(timeoutId);
  clearInterval(parentWatch);
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  const [capturedStdout, capturedStderr] = await output;
  if (options.stdio === 'pipe') {
    if (capturedStdout.length > 0) process.stdout.write(capturedStdout);
    if (capturedStderr.length > 0) process.stderr.write(capturedStderr);
  }

  const launcherResult = readLauncherResult(launcherResultPath);
  const status = didTimeOut
    ? 1
    : didLoseParent
      ? 1
      : interruptedBy !== null
      ? signalExitCode(interruptedBy)
      : launcherResult?.code ?? completed.code ?? 1;
  const result: SupervisorResult = {
    status,
    signal: launcherResult?.signal ?? completed.signal,
    timedOut: didTimeOut,
    interruptedBy,
    parentLost: didLoseParent,
    spawnError: completed.error?.message
      ?? launcherResult?.spawnError
      ?? (outcome === 'completed' ? 'process group launcher did not publish a result' : ''),
    completed: true,
    processGroupPid: child.pid ?? null,
  };
  publishResult(options.metadataPath, result);
  return status;
}

async function supervise(options: SupervisorOptions): Promise<number> {
  const deadlineMs = Date.now() + options.timeoutMs;
  if (!parentIsAlive(options.parentPid)) throw new Error('helper caller exited before lock acquisition');
  const expensiveLock = options.expensiveLockCwd === null
    ? null
    : acquireExpensiveRunLock(options.expensiveLockCwd, options.gitBin!);
  try {
    if (!parentIsAlive(options.parentPid)) throw new Error('helper caller exited during lock acquisition');
    expensiveLock?.assertOwned();
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs < 1) {
      publishResult(options.metadataPath, {
        status: 1,
        signal: null,
        timedOut: true,
        interruptedBy: null,
        parentLost: false,
        spawnError: 'helper timeout elapsed before supervised process start',
        completed: true,
        processGroupPid: null,
      });
      return 1;
    }
    return await superviseTarget({ ...options, timeoutMs: remainingMs });
  } finally {
    // Never release while a superviseTarget() exception left the process
    // group's fate unconfirmed (see preserveExpensiveRunLock above): the
    // token intentionally remains for manual recovery instead of reopening
    // the lane onto a possibly-still-live group.
    if (!preserveExpensiveRunLock) expensiveLock?.release();
  }
}

if (import.meta.main) {
  const options = parseArgs(process.argv.slice(2));
  try {
    process.exitCode = await supervise(options);
  } catch (error) {
    const processGroupPid = publishedProcessGroupPid(options.metadataPath);
    const result: SupervisorResult = {
      status: 1,
      signal: null,
      timedOut: false,
      interruptedBy: null,
      parentLost: false,
      spawnError: error instanceof Error ? error.message : String(error),
      completed: processGroupPid === null,
      processGroupPid,
    };
    try {
      publishResult(options.metadataPath, result);
    } catch {
      // The parent reports a missing supervisor receipt if this also fails.
    }
    process.exitCode = 1;
  }
}
