#!/usr/bin/env bun
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

interface Completion {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly error: Error | null;
}

interface LauncherOptions {
  readonly resultPath: string;
  readonly command: string;
  readonly args: readonly string[];
}

interface LauncherResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly spawnError: string;
}

function usage(): never {
  process.stderr.write('Usage: process-group-launcher.ts --result <path> --command <command> [args...]\n');
  process.exit(2);
}

function parseArgs(argv: readonly string[]): LauncherOptions {
  if (argv[0] !== '--result' || !argv[1] || argv[2] !== '--command' || !argv[3]) usage();
  return { resultPath: argv[1], command: argv[3], args: argv.slice(4) };
}

function publishResult(path: string, result: LauncherResult): void {
  writeFileSync(path, `${JSON.stringify(result)}\n`, { mode: 0o600 });
}

async function waitForSupervisorRelease(): Promise<void> {
  for await (const chunk of Bun.file(3).stream()) {
    if (Buffer.byteLength(chunk) > 0) return;
  }
  throw new Error('process supervisor exited before releasing the target start barrier');
}

async function launch(options: LauncherOptions): Promise<number> {
  await waitForSupervisorRelease();
  const child = spawn(options.command, [...options.args], { stdio: 'inherit' });
  const completion = await new Promise<Completion>((resolve) => {
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
  publishResult(options.resultPath, {
    code: completion.code,
    signal: completion.signal,
    spawnError: completion.error?.message ?? '',
  });
  if (completion.error) return 1;
  if (completion.signal) process.kill(process.pid, completion.signal);
  return completion.code ?? 1;
}

if (import.meta.main) {
  const options = parseArgs(process.argv.slice(2));
  try {
    process.exitCode = await launch(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      publishResult(options.resultPath, { code: 1, signal: null, spawnError: message });
    } catch {
      // The supervisor reports a missing launcher result if this also fails.
    }
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
