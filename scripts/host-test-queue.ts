#!/usr/bin/env bun
// One host test queue for every worktree on this host. See
// src/effects/locking/host-test-queue.ts for the ordering and stale-holder rules.
import { spawn } from 'child_process';
import { constants } from 'os';
import {
  enterHostTestQueue,
  HOST_TEST_QUEUE_HOLDER_ENV,
  HOST_TEST_RUN_KINDS,
  readHostTestQueueState,
  type HostTestQueueEntry,
  type HostTestRunKind,
} from '../src/effects/locking/host-test-queue.ts';

const USAGE = 'Usage: bun scripts/host-test-queue.ts run --kind <release|full|affected> -- <command...>\n'
  + '       bun scripts/host-test-queue.ts status [--json]\n';

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

function runChild(command: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolveExit, rejectExit) => {
    const child = spawn(command[0]!, command.slice(1), { stdio: 'inherit', env });
    const forward = (signal: NodeJS.Signals) => child.kill(signal);
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    for (const signal of signals) process.on(signal, forward);
    child.on('error', rejectExit);
    child.on('exit', (code, signal) => {
      for (const name of signals) process.off(name, forward);
      resolveExit(code ?? 128 + (signal ? constants.signals[signal] : 1));
    });
  });
}

async function run(kind: HostTestRunKind, command: readonly string[]): Promise<number> {
  // A gate inside a queued run is already in the queue.
  if (process.env[HOST_TEST_QUEUE_HOLDER_ENV]) return runChild(command, process.env);
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
    return await runChild(command, { ...process.env, [HOST_TEST_QUEUE_HOLDER_ENV]: handle.token });
  } finally {
    handle.release();
  }
}

const [subcommand, ...rest] = process.argv.slice(2);
if (subcommand === 'status') {
  if (rest.length > 1 || (rest.length === 1 && rest[0] !== '--json')) usage();
  printStatus(rest[0] === '--json');
} else if (subcommand === 'run') {
  const divider = rest.indexOf('--');
  if (divider !== 2 || rest[0] !== '--kind' || !HOST_TEST_RUN_KINDS.includes(rest[1] as HostTestRunKind)) usage();
  const command = rest.slice(divider + 1);
  if (command.length === 0) usage();
  process.exitCode = await run(rest[1] as HostTestRunKind, command);
} else {
  usage();
}
