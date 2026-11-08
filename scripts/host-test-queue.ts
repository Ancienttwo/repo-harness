#!/usr/bin/env bun
// One host test queue for every worktree on this host. See
// src/effects/locking/host-test-queue.ts for the ordering and stale-holder rules.
import { spawn } from 'child_process';
import { constants } from 'os';
import {
  enterHostTestQueue,
  HOST_TEST_QUEUE_HOLDER_ENV,
  HOST_TEST_RUN_KINDS,
  isHostTestQueueHolder,
  readHostTestQueueState,
  type HostTestQueueHandle,
  type HostTestQueueEntry,
  type HostTestRunKind,
} from '../src/effects/locking/host-test-queue.ts';

const USAGE = 'Usage: bun scripts/host-test-queue.ts run --kind <release|full|affected> -- <command...>\n'
  + '       bun scripts/host-test-queue.ts status [--json]\n'
  + '       bun scripts/host-test-queue.ts held   (exit 0 inside a queued run)\n';
const SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
// A group that ignores SIGTERM this long after its leader exits gets SIGKILL.
const GROUP_TERM_GRACE_MS = 10_000;

function usage(): never {
  process.stderr.write(USAGE);
  process.exit(2);
}

function describe(entry: HostTestQueueEntry | null, pid: number): string {
  if (entry === null) return `pid ${pid}`;
  return `pid ${entry.pid} ${entry.kind} in ${entry.cwd}: ${entry.command.join(' ')}`;
}

function printStatus(json: boolean): void {
  const state = readHostTestQueueState();
  if (json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    return;
  }
  const holder = state.holder;
  process.stdout.write(holder === null
    ? 'holder: none\n'
    : `holder: ${describe(holder.entry, holder.pid)} (${holder.liveness}) since ${holder.entry?.acquiredAt ?? 'unknown'}\n`);
  for (const [index, entry] of state.waiting.entries()) {
    process.stdout.write(`waiting ${index + 1}: ${describe(entry, entry.pid)} (${entry.liveness}) since ${entry.enqueuedAt}\n`);
  }
}

function exitStatus(code: number | null, signal: NodeJS.Signals | null): number {
  return code ?? 128 + (signal ? constants.signals[signal] : 1);
}

/** Runs a command inside a queued run: it already owns the host. */
function runNested(command: readonly string[]): Promise<number> {
  return new Promise((resolveExit, rejectExit) => {
    const child = spawn(command[0]!, command.slice(1), { stdio: 'inherit' });
    const forward = (signal: NodeJS.Signals) => child.kill(signal);
    for (const signal of SIGNALS) process.on(signal, forward);
    child.on('error', rejectExit);
    child.on('exit', (code, signal) => {
      for (const name of SIGNALS) process.off(name, forward);
      resolveExit(exitStatus(code, signal));
    });
  });
}

function signalGroup(pgid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-pgid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

/** Stops the rest of the group after its leader exits, so no test outlives the lock. */
async function drainGroup(pgid: number): Promise<void> {
  if (!signalGroup(pgid, 'SIGTERM')) return;
  const deadline = Date.now() + GROUP_TERM_GRACE_MS;
  while (signalGroup(pgid, 0)) {
    if (Date.now() >= deadline) signalGroup(pgid, 'SIGKILL');
    await Bun.sleep(100);
  }
}

/**
 * Runs the queued command in its own process group. The lock records the
 * group, signals go to the whole group, and the lock is released only after
 * every member has exited.
 */
function runQueued(command: readonly string[], handle: HostTestQueueHandle): Promise<number> {
  const env = { ...process.env, [HOST_TEST_QUEUE_HOLDER_ENV]: handle.token };
  // Windows has no POSIX process groups; there the lock follows this wrapper.
  const grouped = process.platform !== 'win32';
  return new Promise((resolveExit, rejectExit) => {
    const child = spawn(command[0]!, command.slice(1), { stdio: 'inherit', env, detached: grouped });
    const pgid = grouped ? child.pid : undefined;
    if (pgid !== undefined) handle.recordGroup(pgid);
    const forward = (signal: NodeJS.Signals) => {
      if (pgid === undefined) child.kill(signal);
      else signalGroup(pgid, signal);
    };
    for (const signal of SIGNALS) process.on(signal, forward);
    child.on('error', rejectExit);
    child.on('exit', (code, signal) => {
      const status = exitStatus(code, signal);
      void (pgid === undefined ? Promise.resolve() : drainGroup(pgid)).then(() => {
        for (const name of SIGNALS) process.off(name, forward);
        resolveExit(status);
      }, rejectExit);
    });
  });
}

async function run(kind: HostTestRunKind, command: readonly string[]): Promise<number> {
  if (isHostTestQueueHolder()) return runNested(command);
  const handle = await enterHostTestQueue({ kind, cwd: process.cwd(), command }, {
    onWait(state, position) {
      const holder = state.holder === null ? 'none' : describe(state.holder.entry, state.holder.pid);
      process.stderr.write(`[host-test-queue] waiting: ${position} run(s) ahead; holder ${holder}\n`);
    },
    onStaleReclaim(lockPath) {
      process.stderr.write(`[host-test-queue] freed the lock of a dead holder: ${lockPath}\n`);
    },
  });
  // A waiter or holder killed by a signal leaves its ticket; others prune it as dead.
  process.on('exit', () => handle.release());
  try {
    return await runQueued(command, handle);
  } finally {
    handle.release();
  }
}

const [subcommand, ...rest] = process.argv.slice(2);
if (subcommand === 'status') {
  if (rest.length > 1 || (rest.length === 1 && rest[0] !== '--json')) usage();
  printStatus(rest[0] === '--json');
} else if (subcommand === 'held') {
  if (rest.length > 0) usage();
  process.exitCode = isHostTestQueueHolder() ? 0 : 1;
} else if (subcommand === 'run') {
  const divider = rest.indexOf('--');
  if (divider !== 2 || rest[0] !== '--kind' || !HOST_TEST_RUN_KINDS.includes(rest[1] as HostTestRunKind)) usage();
  const command = rest.slice(divider + 1);
  if (command.length === 0) usage();
  process.exitCode = await run(rest[1] as HostTestRunKind, command);
} else {
  usage();
}
