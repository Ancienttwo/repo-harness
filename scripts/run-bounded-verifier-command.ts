#!/usr/bin/env bun
import { constants, closeSync, fstatSync, ftruncateSync, openSync, writeFileSync, writeSync } from 'fs';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { processGroupExists, terminateProcessGroup } from '../src/effects/process-group-termination';

type Result = {
  started: boolean;
  termination_cause: 'completed' | 'deadline' | 'cancelled' | 'output_error';
  output_sha256?: { stdout: string; stderr: string };
  output_complete?: boolean;
  duration_ms: number;
  timed_out: boolean;
  exit_code: number;
  signal: NodeJS.Signals | null;
  process_group_quiescence: { scope: 'posix_process_group' | 'unsupported'; state: 'quiescent' | 'active' | 'unknown' };
};

function usage(): never {
  process.stderr.write('Usage: run-bounded-verifier-command.ts --deadline-ms <epoch-ms> --log <path> [--stderr-log <path>] --result <path> -- <command> [args...]\n');
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
const stderrPath = argv.slice(0, separator).includes('--stderr-log') ? option('--stderr-log') : null;
const outputLimit = argv.slice(0, separator).includes('--max-output-bytes') ? Number(option('--max-output-bytes')) : null;
if (outputLimit !== null && (!Number.isSafeInteger(outputLimit) || outputLimit < 1 || stderrPath === null)) usage();
const command = argv[separator + 1];
const args = argv.slice(separator + 2);
if (!Number.isFinite(deadlineMs)) usage();

const TERMINATION_GRACE_MS = 500;
// How long to keep re-polling process-group absence after a forced (deadline
// or signal) SIGKILL before giving up. SIGKILL delivery is not synchronous:
// the OS needs a moment to actually reap the group, so treating the instant
// the signal is *sent* as proof the group is gone lets a surviving
// descendant (this command was spawned `detached: true`, its own separate
// process group) outlive this wrapper undetected.
const FORCED_TERMINATION_CONFIRM_MS = 500;

// A verification command must observe the project's real behaviour in a clean
// environment. The package-dispatched helper mechanism injects `REPO_HARNESS_*`
// wiring (helper source path, target repo root, trusted tool binaries) into its
// child, and that set inherits all the way down verify-sprint -> verify-contract
// -> a nested test run, where it can silently override a fixture's own repo
// root or tool resolution. Strip the whole prefix -- not a curated subset --
// so harness-internal wiring never reaches the command under verification.
// This runner reads no `REPO_HARNESS_*` variable itself.
function scrubHarnessEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const scrubbed: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('REPO_HARNESS_')) continue;
    scrubbed[key] = value;
  }
  return scrubbed;
}

const startedAt = Date.now();
let timedOut = false;
let cancellationSignal: NodeJS.Signals | null = null;
let terminating = false;
let terminationSettled = false;
let termination: Promise<void> | undefined;
function openLog(path: string): number {
  // Nonblocking open prevents a FIFO from trapping the supervisor before its timers exist.
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('supervisor log must be a regular file');
    ftruncateSync(fd, 0);
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}
let logFd: number;
let stderrFd: number;
try {
  logFd = openLog(logPath);
  try { stderrFd = stderrPath === null ? logFd : openLog(stderrPath); }
  catch (error) { closeSync(logFd); throw error; }
} catch (error) {
  const result: Result = { started: false, termination_cause: 'output_error', output_complete: false,
    duration_ms: Date.now() - startedAt, timed_out: false, exit_code: 1, signal: null,
    process_group_quiescence: { scope: 'unsupported', state: 'unknown' } };
  writeFileSync(resultPath, `${JSON.stringify(result)}\n`, { flag: 'wx', mode: 0o600 });
  process.exit(1);
}
// Refusal happens at the actual spawn boundary, including time spent opening logs.
if (Date.now() >= deadlineMs) {
  closeSync(logFd);
  if (stderrFd !== logFd) closeSync(stderrFd);
  const emptyHash = `sha256:${createHash('sha256').digest('hex')}`;
  const result: Result = { ...(stderrPath !== null ? { output_complete: true, output_sha256: { stdout: emptyHash, stderr: emptyHash } } : {}), started: false, termination_cause: 'deadline', duration_ms: Date.now() - startedAt,
    timed_out: true, exit_code: 124, signal: null,
    process_group_quiescence: { scope: 'unsupported', state: 'unknown' } };
  writeFileSync(resultPath, `${JSON.stringify(result)}\n`, { flag: 'wx', mode: 0o600 });
  process.exit(124);
}
function groupActive(): boolean {
  if (!child.pid || process.platform === 'win32') return false;
  return processGroupExists(child.pid);
}

async function waitForProcessGroupQuiescence(): Promise<void> {
  while (groupActive()) {
    // A forced SIGKILL is not proof that the group is gone: the OS needs a
    // moment to reap it. Give up -- and proceed as though quiescent -- only
    // once termination has spent its bounded confirmation window too.
    if (terminationSettled) return;
    await Bun.sleep(10);
  }
}

let cleanupDeadlineMs: number | null = null;
let notifyTermination: (() => void) | undefined;
const terminationStarted = new Promise<void>(resolve => { notifyTermination = resolve; });

function beginTermination(): void {
  if (terminating) return;
  terminating = true;
  cleanupDeadlineMs = Date.now() + TERMINATION_GRACE_MS + FORCED_TERMINATION_CONFIRM_MS;
  notifyTermination?.();
  const pid = child.pid;
  termination = (pid === undefined
    ? Promise.resolve()
    : terminateProcessGroup(pid, TERMINATION_GRACE_MS, { confirmMs: FORCED_TERMINATION_CONFIRM_MS }).then(() => undefined, () => {
      // The result's process_group_quiescence probe reports a group that survived.
    }))
    .finally(() => { terminationSettled = true; });
}

// Install cancellation handlers before the command can report readiness.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    cancellationSignal ??= signal;
    beginTermination();
  });
}

const child = spawn(command, args, {
  detached: process.platform !== 'win32',
  stdio: stderrPath === null ? ['ignore', logFd, stderrFd] : ['ignore', 'pipe', 'pipe'],
  env: scrubHarnessEnv(process.env),
});

let outputClosed = false;
const closed = new Promise<void>(resolve => child.once('close', () => { outputClosed = true; resolve(); }));
const leaderCompletion = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
  child.once('error', () => resolve({ code: 127, signal: null }));
  child.once('exit', (code, signal) => resolve({ code, signal }));
});

const stdoutHash = createHash('sha256');
const stderrHash = createHash('sha256');
let outputError = false;
let outputBytes = 0;
if (stderrPath !== null) {
  for (const [stream, fd, hash] of [[child.stdout!, logFd, stdoutHash], [child.stderr!, stderrFd, stderrHash]] as const) {
    stream.on('data', (bytes: Buffer) => {
      outputBytes += bytes.length;
      if (outputLimit !== null && outputBytes > outputLimit) { outputError = true; beginTermination(); return; }
      hash.update(bytes);
      try { let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset); }
      catch { outputError = true; beginTermination(); }
    });
    stream.on('error', () => { outputError = true; beginTermination(); });
  }
}

const remainingMs = Math.max(0, deadlineMs - Date.now());
const deadlineTimer = setTimeout(() => {
  timedOut = true;
  beginTermination();
}, remainingMs);

const completion = await leaderCompletion.then(async (result) => {
  await waitForProcessGroupQuiescence();
  return result;
});

if (stderrPath !== null && !outputClosed) {
  while (!outputClosed) {
    const drainDeadline = Math.min(deadlineMs, cleanupDeadlineMs ?? deadlineMs);
    if (Date.now() >= drainDeadline) break;
    let streamTimer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([closed, ...(cleanupDeadlineMs === null ? [terminationStarted] : []),
      new Promise<void>(resolve => { streamTimer = setTimeout(resolve, Math.max(0, drainDeadline - Date.now())); })]);
    if (streamTimer) clearTimeout(streamTimer);
  }
  if (!outputClosed) {
    if (Date.now() >= deadlineMs) timedOut = true;
    outputError = true; child.stdout?.destroy(); child.stderr?.destroy(); beginTermination();
  }
}
clearTimeout(deadlineTimer);
if (termination) await termination;
closeSync(logFd);
if (stderrFd !== logFd) closeSync(stderrFd);
const result: Result = {
  started: child.pid !== undefined,
  termination_cause: cancellationSignal ? 'cancelled' : timedOut ? 'deadline' : outputError ? 'output_error' : 'completed',
  ...(stderrPath !== null ? { output_sha256: { stdout: `sha256:${stdoutHash.digest('hex')}`, stderr: `sha256:${stderrHash.digest('hex')}` }, output_complete: outputClosed && !outputError } : {}),
  duration_ms: Date.now() - startedAt,
  timed_out: timedOut,
  exit_code: cancellationSignal ? ({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }[cancellationSignal as 'SIGINT' | 'SIGTERM' | 'SIGHUP']) : timedOut ? 124 : outputError ? 1 : completion.code ?? 1,
  signal: cancellationSignal ?? completion.signal,
  process_group_quiescence: process.platform === 'win32' || !child.pid
    ? { scope: 'unsupported', state: 'unknown' }
    : { scope: 'posix_process_group', state: groupActive() ? 'active' : 'quiescent' },
};
writeFileSync(resultPath, `${JSON.stringify(result)}\n`, { flag: 'wx', mode: 0o600 });
process.exit(result.exit_code);
