#!/usr/bin/env bun
/**
 * Minimal hook-only CLI entrypoint for host adapters.
 *
 * Host hooks run after almost every tool call and may be invoked concurrently.
 * Keep this file self-contained so the hot hook path does not cold-load the
 * full commander CLI or non-hook command modules.
 */

import { runHook as runHookRuntime, type RunHookOptions, type RunHookResult } from './hook/runtime';
import type { HookEvent, RouteId } from './hook/route-registry';

export type RunHookEntryOptions = RunHookOptions;
export type RunHookEntryResult = RunHookResult;

export function runHookEntry(opts: RunHookEntryOptions): RunHookEntryResult {
  return runHookRuntime({ ...opts, commandName: 'repo-harness-hook' });
}

function parseCliArgs(argv: readonly string[]): { event: HookEvent; routeId: RouteId } | null {
  const event = argv[0] as HookEvent | undefined;
  const routeFlagIndex = argv.indexOf('--route');
  const routeId = routeFlagIndex >= 0 ? argv[routeFlagIndex + 1] : undefined;
  if (!event || !routeId) return null;
  return { event, routeId: routeId as RouteId };
}

if (import.meta.main) {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed) {
    process.stderr.write('repo-harness-hook: usage: repo-harness-hook <event> --route <route>\n');
    process.exit(2);
  }
  const result = runHookEntry(parsed);
  process.exit(result.exitCode);
}
