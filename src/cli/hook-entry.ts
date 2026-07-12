#!/usr/bin/env bun
/**
 * Minimal hook-only CLI entrypoint for host adapters.
 *
 * Host hooks run after almost every tool call and may be invoked concurrently.
 * Keep this file self-contained so the hot hook path does not cold-load the
 * full commander CLI or non-hook command modules.
 */

import { runHook as runHookRuntime, type RunHookOptions, type RunHookResult } from './hook/runtime';
import { runPromptGuardDecideCli } from './commands/prompt-guard-decision';
import { runStateSnapshotCli } from './hook/state-snapshot';
import type { HookEvent, RouteId } from './hook/route-registry';
import { writeSync } from 'fs';

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
  const argv = process.argv.slice(2);
  if (argv[0] === 'minimal-change') {
    const { runMinimalChangeCli } = await import('./hook/minimal-change-cli');
    const result = runMinimalChangeCli(argv.slice(1));
    if (result.stdout) writeSync(1, result.stdout);
    if (result.stderr) writeSync(2, result.stderr);
    process.exit(result.exitCode);
  }

  if (argv[0] === 'review-rubric') {
    const { runReviewRubricCli } = await import('./hook/review-rubric');
    const result = runReviewRubricCli(argv.slice(1));
    if (result.stdout) writeSync(1, result.stdout);
    if (result.stderr) writeSync(2, result.stderr);
    process.exit(result.exitCode);
  }

  if (argv[0] === 'review-fingerprint') {
    const { runReviewFingerprintCli } = await import('./hook/diff-fingerprint');
    const result = runReviewFingerprintCli(argv.slice(1));
    if (result.stdout) writeSync(1, result.stdout);
    if (result.stderr) writeSync(2, result.stderr);
    process.exit(result.exitCode);
  }

  if (argv[0] === 'prompt-guard-decide') {
    console.log(runPromptGuardDecideCli());
    process.exit(0);
  }

  if (argv[0] === 'state-snapshot') {
    const result = runStateSnapshotCli(argv.slice(1));
    if (result.stdout) writeSync(1, result.stdout);
    if (result.stderr) writeSync(2, result.stderr);
    process.exit(result.exitCode);
  }

  const parsed = parseCliArgs(argv);
  if (!parsed) {
    writeSync(2, 'repo-harness-hook: usage: repo-harness-hook <event> --route <route>\n');
    process.exit(2);
  }
  const result = runHookEntry(parsed);
  process.exit(result.exitCode);
}
