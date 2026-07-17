#!/usr/bin/env bun
import { closeSync, openSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';

type Result = {
  duration_ms: number;
  timed_out: boolean;
  exit_code: number;
  signal: NodeJS.Signals | null;
};

function usage(): never {
  process.stderr.write('Usage: run-bounded-verifier-command.ts --deadline-ms <epoch-ms> --log <path> --result <path> -- <command> [args...]\n');
  process.exit(2);
}

const argv = process.argv.slice(2);
const separator = argv.indexOf('--');
if (separator < 0 || separator === argv.length - 1) usage();

function option(name: string): string {
  const index = argv.slice(0, separator).indexOf(name);
  if (index < 0 || index + 1 >= separator) usage();
  return argv[index + 1];
}

const deadlineMs = Number(option('--deadline-ms'));
const logPath = option('--log');
const resultPath = option('--result');
const command = argv[separator + 1];
const args = argv.slice(separator + 2);
if (!Number.isFinite(deadlineMs)) usage();

// How long to keep re-polling process-group absence after a forced (deadline
// or signal) SIGKILL before giving up. SIGKILL delivery is not synchronous:
// the OS needs a moment to actually reap the group, so treating the instant
// the signal is *sent* as proof the group is gone lets a surviving
// descendant (this command was spawned `detached: true`, its own separate
// process group) outlive this wrapper undetected.
const FORCED_TERMINATION_CONFIRM_MS = 500;

const startedAt = Date.now();
let timedOut = false;
let terminating = false;
let forcedTerminationSent = false;
let forcedTerminationConfirmDeadlineMs = 0;
let forceTermination: Promise<void> | undefined;
const logFd = openSync(logPath, 'w');
const child = spawn(command, args, {
  detached: process.platform !== 'win32',
  stdio: ['ignore', logFd, logFd],
});

function terminate(signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    // The whole group already exited.
  }
}

function processGroupExists(): boolean {
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

async function waitForProcessGroupQuiescence(): Promise<void> {
  while (processGroupExists()) {
    // A forced SIGKILL was already sent; give the OS a bounded confirmation
    // window to actually reap the group instead of trusting
    // forcedTerminationSent alone (that flag flips the instant the signal is
    // *sent*, not once the group is actually gone). Only give up -- and
    // proceed as though quiescent -- once that window has elapsed too.
    if (forcedTerminationSent && Date.now() >= forcedTerminationConfirmDeadlineMs) return;
    await Bun.sleep(10);
  }
}

function beginTermination(): void {
  if (terminating) return;
  terminating = true;
  terminate('SIGTERM');
  forceTermination = new Promise((resolve) => {
    setTimeout(() => {
      // Address the original process group even when its leader already
      // exited; a TERM-resistant descendant may still own the group.
      terminate('SIGKILL');
      forcedTerminationSent = true;
      forcedTerminationConfirmDeadlineMs = Date.now() + FORCED_TERMINATION_CONFIRM_MS;
      resolve();
    }, 500);
  });
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    beginTermination();
  });
}

const remainingMs = Math.max(0, deadlineMs - Date.now());
const deadlineTimer = setTimeout(() => {
  timedOut = true;
  beginTermination();
}, remainingMs);

const leaderCompletion = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
  child.once('error', () => resolve({ code: 127, signal: null }));
  child.once('exit', (code, signal) => resolve({ code, signal }));
});
const completion = await leaderCompletion.then(async (result) => {
  await waitForProcessGroupQuiescence();
  return result;
});

clearTimeout(deadlineTimer);
if (forceTermination) await forceTermination;
closeSync(logFd);
const result: Result = {
  duration_ms: Date.now() - startedAt,
  timed_out: timedOut,
  exit_code: timedOut ? 124 : completion.code ?? 1,
  signal: completion.signal,
};
writeFileSync(resultPath, `${JSON.stringify(result)}\n`);
process.exit(result.exit_code);
