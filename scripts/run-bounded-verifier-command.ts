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

const startedAt = Date.now();
let timedOut = false;
let terminating = false;
let forceTimer: ReturnType<typeof setTimeout> | undefined;
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

function beginTermination(): void {
  if (terminating) return;
  terminating = true;
  terminate('SIGTERM');
  forceTimer = setTimeout(() => terminate('SIGKILL'), 500);
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

const completion = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
  child.once('error', () => resolve({ code: 127, signal: null }));
  child.once('exit', (code, signal) => resolve({ code, signal }));
});

clearTimeout(deadlineTimer);
if (forceTimer) clearTimeout(forceTimer);
closeSync(logFd);
const result: Result = {
  duration_ms: Date.now() - startedAt,
  timed_out: timedOut,
  exit_code: timedOut ? 124 : completion.code ?? 1,
  signal: completion.signal,
};
writeFileSync(resultPath, `${JSON.stringify(result)}\n`);
process.exit(result.exit_code);
