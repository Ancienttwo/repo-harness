import { runUserUninstall } from '../installer/uninstall';
/**
 * `repo-harness install|uninstall --target codex|claude|both --location global`
 *
 * Resolves --target to AgentTarget list for install. Uninstall restores
 * owned user configuration. Idempotent: re-run with no diff returns
 * `action: 'unchanged'` or `action: 'not-found'` (verified by
 * tests/cli/install.test.ts).
 *
 * Target/location matrix:
 *   - codex + global → writes ~/.codex/hooks.json
 *   - claude + global → writes ~/.claude/settings.json
 *   - both + global   → codex + claude
 */

import type { Location } from '../installer/types';
import { ALL_TARGETS, getTarget, listTargetIds } from '../installer/targets/registry';
import type { InstallProfile } from '../installer/install-profile';

export type InstallTargetSpec = 'codex' | 'claude' | 'both';

export interface InstallCommandOptions {
  target: InstallTargetSpec;
  location: Location;
  profile?: InstallProfile;
}

export interface UninstallCommandOptions {
  target: InstallTargetSpec;
  location: Location;
  dryRun?: boolean;
  recoverInterrupted?: boolean;
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
  if (opts.location !== 'global') {
    return { exitCode: 2, lines: [`repo-harness install: invalid --location "${opts.location}" (expected: global)`] };
  }
  const targets = resolveTargets(opts.target);
  const lines: string[] = [];
  let exitCode = 0;

  for (const target of targets) {
    try {
      const result = target.install(opts.location, { profile: opts.profile });
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

export function runUninstall(opts: UninstallCommandOptions): InstallCommandResult {
  if (opts.location !== 'global') {
    return { exitCode: 2, lines: [`repo-harness uninstall: invalid --location "${opts.location}" (expected: global)`] };
  }
  return runUserUninstall(opts);
}
