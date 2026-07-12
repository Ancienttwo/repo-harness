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
import { writeAllSync } from './runtime/write-all-sync';

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
    if (result.stdout) writeAllSync(1, result.stdout);
    if (result.stderr) writeAllSync(2, result.stderr);
    process.exit(result.exitCode);
  }

  if (argv[0] === 'review-rubric') {
    const { runReviewRubricCli } = await import('./hook/review-rubric');
    const result = runReviewRubricCli(argv.slice(1));
    if (result.stdout) writeAllSync(1, result.stdout);
    if (result.stderr) writeAllSync(2, result.stderr);
    process.exit(result.exitCode);
  }

  if (argv[0] === 'review-fingerprint') {
    const { runReviewFingerprintCli } = await import('./hook/diff-fingerprint');
    const result = runReviewFingerprintCli(argv.slice(1));
    if (result.stdout) writeAllSync(1, result.stdout);
    if (result.stderr) writeAllSync(2, result.stderr);
    process.exit(result.exitCode);
  }

  if (argv[0] === 'prompt-guard-decide') {
    const { runPromptGuardDecideCli } = await import('./commands/prompt-guard-decision');
    console.log(runPromptGuardDecideCli());
    process.exit(0);
  }

  if (argv[0] === 'prompt-route') {
    const { readFileSync } = await import('fs');
    const { routePromptExplicitFirst } = await import('./hook/prompt-router');
    let prompt = '';
    try {
      const input = readFileSync(0, 'utf-8').trim();
      if (input.startsWith('{')) {
        const parsed = JSON.parse(input) as { prompt?: unknown };
        if (typeof parsed.prompt === 'string') prompt = parsed.prompt;
      }
    } catch {
      // Malformed prompt input bypasses advisory routing. Deterministic edit
      // guards remain the safety authority.
    }
    const route = routePromptExplicitFirst(prompt, {
      hasActiveTask: process.env.PROMPT_ROUTE_ACTIVE_TASK === '1',
    });
    writeAllSync(1, `${JSON.stringify(route)}\n`);
    process.exit(0);
  }

  if (argv[0] === 'circuit-breaker-record') {
    const { readFileSync } = await import('fs');
    const { recordCircuitAttempt } = await import('./hook/circuit-breaker');
    try {
      const attempt = JSON.parse(readFileSync(0, 'utf-8'));
      writeAllSync(1, `${JSON.stringify(recordCircuitAttempt(process.cwd(), attempt))}\n`);
      process.exit(0);
    } catch (error) {
      writeAllSync(2, `circuit-breaker-record: ${(error as Error).message}\n`);
      process.exit(2);
    }
  }

  if (argv[0] === 'state-snapshot') {
    const { runStateSnapshotCli } = await import('./hook/state-snapshot');
    const result = runStateSnapshotCli(argv.slice(1));
    if (result.stdout) writeAllSync(1, result.stdout);
    if (result.stderr) writeAllSync(2, result.stderr);
    process.exit(result.exitCode);
  }

  const parsed = parseCliArgs(argv);
  if (!parsed) {
    writeAllSync(2, 'repo-harness-hook: usage: repo-harness-hook <event> --route <route>\n');
    process.exit(2);
  }
  const { readFileSync } = await import('fs');
  let input: Buffer | undefined;
  try {
    input = readFileSync(0);
  } catch {
    input = undefined;
  }
  const result = runHookEntry({ ...parsed, input });
  process.exit(result.exitCode);
}
