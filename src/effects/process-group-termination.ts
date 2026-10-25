import { spawnSync } from 'child_process';

const PROCESS_GROUP_POLL_MS = 10;
const SYNCHRONOUS_SLEEP_CELL = new Int32Array(new SharedArrayBuffer(4));

export interface TerminateProcessGroupOptions {
  /** First signal sent to the group. SIGKILL skips the grace period. */
  readonly initialSignal?: NodeJS.Signals;
  /** How long to wait for absence after SIGKILL. Defaults to the grace period. */
  readonly confirmMs?: number;
  readonly taskkillBin?: string;
  /** Runs immediately before SIGKILL. A throw stops the escalation. */
  readonly beforeForce?: () => void;
}

export interface ProcessGroupTermination {
  /**
   * POSIX: the process group no longer exists. Windows: a `taskkill /T` pass
   * succeeded and the tree root no longer runs.
   */
  readonly confirmed: boolean;
  /** The group outlived the grace period and received SIGKILL. */
  readonly forced: boolean;
}

export function taskkillAttemptSucceeded(result: { readonly status: number | null; readonly error?: Error }): boolean {
  if (result.error) throw result.error;
  return result.status === 0;
}

/** POSIX process-group probe. Permission errors cannot prove absence. */
export function processGroupExists(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    throw error;
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    throw error;
  }
}

/**
 * Send one signal to a POSIX process group, or to a Windows process tree with
 * `taskkill /T` (`/F` for SIGKILL). Returns false only when taskkill reports failure.
 */
export function signalProcessGroup(pgid: number, signal: NodeJS.Signals, taskkillBin?: string): boolean {
  if (process.platform === 'win32') {
    return taskkillAttemptSucceeded(spawnSync(taskkillBin ?? 'taskkill', ['/pid', String(pgid), '/T', ...(signal === 'SIGKILL' ? ['/F'] : [])], {
      stdio: 'ignore',
      windowsHide: true,
    }));
  }
  try {
    process.kill(-pgid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
  return true;
}

// Each yielded value is a wait in milliseconds; the drivers below differ only in how they wait.
function* terminationSequence(
  pgid: number,
  graceMs: number,
  options: TerminateProcessGroupOptions,
): Generator<number, ProcessGroupTermination, void> {
  const windows = process.platform === 'win32';
  // Windows has no group probe. Once the root exits, taskkill /T cannot reach its tree.
  const present = (): boolean => (windows ? processExists(pgid) : processGroupExists(pgid));
  // An absent group is never signalled: its PGID may already name another group.
  if (!present()) return { confirmed: !windows, forced: false };
  const initialSignal = options.initialSignal ?? 'SIGTERM';
  let delivered = signalProcessGroup(pgid, initialSignal, options.taskkillBin);
  let forced = initialSignal === 'SIGKILL';
  if (!forced) {
    // The leader may exit before a TERM-resistant descendant, so the grace
    // period ends on group absence, not on leader exit.
    const graceDeadline = Date.now() + graceMs;
    while (present() && Date.now() < graceDeadline) yield Math.min(PROCESS_GROUP_POLL_MS, graceDeadline - Date.now());
    if (present()) {
      options.beforeForce?.();
      forced = true;
      delivered = signalProcessGroup(pgid, 'SIGKILL', options.taskkillBin) || delivered;
    }
  }
  const confirmDeadline = Date.now() + (options.confirmMs ?? graceMs);
  while (present() && Date.now() < confirmDeadline) yield Math.min(PROCESS_GROUP_POLL_MS, confirmDeadline - Date.now());
  return { confirmed: !present() && (!windows || delivered), forced };
}

/** SIGTERM the group, wait up to `graceMs` for it to exit, SIGKILL it, then confirm its absence. */
export async function terminateProcessGroup(
  pgid: number,
  graceMs: number,
  options: TerminateProcessGroupOptions = {},
): Promise<ProcessGroupTermination> {
  const steps = terminationSequence(pgid, graceMs, options);
  for (let step = steps.next(); ; step = steps.next()) {
    if (step.done) return step.value;
    await Bun.sleep(step.value);
  }
}

/** Blocking form of {@link terminateProcessGroup} for synchronous callers. */
export function terminateProcessGroupSync(
  pgid: number,
  graceMs: number,
  options: TerminateProcessGroupOptions = {},
): ProcessGroupTermination {
  const steps = terminationSequence(pgid, graceMs, options);
  for (let step = steps.next(); ; step = steps.next()) {
    if (step.done) return step.value;
    Atomics.wait(SYNCHRONOUS_SLEEP_CELL, 0, 0, step.value);
  }
}
