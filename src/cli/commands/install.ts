/**
 * `agentic-dev install --target codex|claude|both --location global|local`
 *
 * Resolves --target to AgentTarget list, calls target.install(loc, opts)
 * for each, prints WriteResult lines. Idempotent: re-run with no diff
 * returns `action: 'unchanged'` (verified by tests/cli/install.test.ts).
 *
 * Target/location matrix:
 *   - codex + global → writes ~/.codex/hooks.json
 *   - codex + local  → exit 2 (Codex has no project-local hook concept)
 *   - claude + global → writes ~/.claude/settings.json
 *   - claude + local  → writes <cwd>/.claude/settings.json (Phase 1C concern)
 *   - both + global   → codex + claude
 *   - both + local    → codex skipped silently, claude installed
 */

import type { Location } from '../installer/types';
import { ALL_TARGETS, getTarget, listTargetIds } from '../installer/targets/registry';

export type InstallTargetSpec = 'codex' | 'claude' | 'both';

export interface InstallCommandOptions {
  target: InstallTargetSpec;
  location: Location;
}

export interface InstallCommandResult {
  exitCode: number;
  lines: string[];
}

function resolveTargets(spec: InstallTargetSpec) {
  if (spec === 'both') return [...ALL_TARGETS];
  const t = getTarget(spec);
  if (!t) {
    throw new Error(
      `repo-harness install: unknown --target "${spec}" (known: ${listTargetIds().join(', ')}, both)`,
    );
  }
  return [t];
}

export function runInstall(opts: InstallCommandOptions): InstallCommandResult {
  const targets = resolveTargets(opts.target);
  const lines: string[] = [];
  let exitCode = 0;

  for (const target of targets) {
    if (!target.supportsLocation(opts.location)) {
      if (opts.target === 'both') {
        lines.push(`[${target.id}] skipped: --location ${opts.location} not supported`);
        continue;
      }
      lines.push(`[${target.id}] error: --location ${opts.location} not supported`);
      exitCode = 2;
      continue;
    }
    try {
      const result = target.install(opts.location, {});
      for (const file of result.files) {
        lines.push(`[${target.id}] ${file.action}: ${file.path}`);
      }
      for (const note of result.notes ?? []) {
        lines.push(`[${target.id}] note: ${note}`);
      }
    } catch (err) {
      lines.push(`[${target.id}] error: ${(err as Error).message}`);
      if (exitCode === 0) exitCode = 1;
    }
  }

  return { exitCode, lines };
}
