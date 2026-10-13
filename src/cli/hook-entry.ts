#!/usr/bin/env bun
/**
 * Minimal hook-only CLI entrypoint for host adapters.
 *
 * Host hooks run after almost every tool call and may be invoked concurrently.
 * Keep this file self-contained so the hot hook path does not cold-load the
 * full commander CLI or non-hook command modules.
 */

import { readFileSync } from 'fs';
import { HOOK_COMMAND_NAME, runHook } from './hook/runtime';
import type { HookEvent, RouteId } from './hook/route-registry';
import { writeAllSync } from './runtime/write-all-sync';
import { PROCESS_GROUP_LAUNCHER_FLAG, runProcessGroupLauncherCli } from '../effects/process-group-launcher';
import { PROCESS_SUPERVISOR_FLAG, runProcessSupervisorCli } from '../effects/process-supervisor';

export { runHook };

function parseCliArgs(argv: readonly string[]): { event: HookEvent; routeId: RouteId } | null {
  if (argv.length !== 3 || argv[1] !== '--route' || !argv[0] || !argv[2]) return null;
  return { event: argv[0] as HookEvent, routeId: argv[2] as RouteId };
}

/** The one hook dispatch path, shared by `repo-harness-hook` and `repo-harness hook`. */
export function runHookCli(argv: readonly string[]): number {
  const parsed = parseCliArgs(argv);
  if (!parsed) {
    writeAllSync(2, `${HOOK_COMMAND_NAME}: usage: ${HOOK_COMMAND_NAME} <event> --route <route>\n`);
    return 2;
  }
  let input: Buffer | undefined;
  try {
    input = readFileSync(0);
  } catch {
    input = undefined;
  }
  return runHook({ ...parsed, input }).exitCode;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv[0] === PROCESS_SUPERVISOR_FLAG) {
    process.exit(await runProcessSupervisorCli(argv.slice(1)));
  }

  if (argv[0] === PROCESS_GROUP_LAUNCHER_FLAG) {
    process.exit(await runProcessGroupLauncherCli(argv.slice(1)));
  }

  if (argv[0] === 'state-snapshot') {
    const { runStateSnapshotCli } = await import('./hook/state-snapshot');
    const result = runStateSnapshotCli(argv.slice(1));
    if (result.stdout) writeAllSync(1, result.stdout);
    if (result.stderr) writeAllSync(2, result.stderr);
    process.exit(result.exitCode);
  }

  process.exit(runHookCli(argv));
}
