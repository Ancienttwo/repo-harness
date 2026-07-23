/**
 * `repo-harness status` — read-only summary of CLI install state + route coverage.
 *
 * Reports per-host install detection (target.detect), managed-entry count vs
 * expected, route registry summary, and current repo opt-in marker presence.
 * No mutations.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ALL_TARGETS } from '../installer/targets/registry';
import { ROUTES, routesForHost } from '../hook/route-registry';
import {
  buildManagedHooks,
  isManagedEntry,
  type HookHost,
  type HooksByEvent,
} from '../installer/managed-entries';
import { readJsonOrEmpty } from '../installer/shared';
import type { Location } from '../installer/types';
import {
  installProfileStatePath,
  readInstalledProfile,
  type InstallComponent,
  type InstallProfile,
  readLegacyInstalledProfileForMigration,
} from '../installer/install-profile';

function packageVersion(): string {
  const packagePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'package.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf-8')) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.trim()) return parsed.version;
  } catch {
    // Keep --version usable even when package metadata is unavailable in a partial install.
  }
  return '0.0.0-unknown';
}

export const CLI_VERSION = packageVersion();

const OPT_IN_MARKER = '.ai/harness/workflow-contract.json';

export interface StatusReport {
  cli: { version: string };
  targets: Array<{
    id: string;
    displayName: string;
    location: Location;
    installed: boolean;
    alreadyConfigured: boolean;
    configPath?: string;
    managedEntryCount: number;
    expectedEntryCount: number;
  }>;
  repo: {
    inGitRepo: boolean;
    repoRoot?: string;
    optIn: boolean;
    optInMarker: string;
  };
  routes: { total: number; byEvent: Record<string, number> };
  installedProfile:
    | { recorded: true; profile: InstallProfile; components: readonly InstallComponent[] }
    | { recorded: false }
    // install-state.json exists but normal protocol-2 validation rejected it.
    // A valid protocol-1 file is explicitly migratable; malformed legacy or
    // current state is not, and must not receive a migration command that is
    // guaranteed to fail.
    | {
        recorded: 'invalid';
        kind: 'legacy_protocol' | 'corrupt_current';
        error: string;
        path: string;
      };
}

function resolveRepoRoot(cwd: string): string | null {
  try {
    const out = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

function countManagedEntries(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  try {
    const data = readJsonOrEmpty<{ hooks?: HooksByEvent }>(filePath);
    let count = 0;
    for (const entries of Object.values(data.hooks ?? {})) {
      count += (entries ?? []).filter(isManagedEntry).length;
    }
    return count;
  } catch {
    return 0;
  }
}

function expectedManagedEntryCount(
  host: HookHost,
  installedProfile: StatusReport['installedProfile'],
): number {
  if (installedProfile.recorded !== true) return routesForHost(host).length;
  return Object.values(buildManagedHooks(host, installedProfile.profile))
    .reduce((count, entries) => count + entries.length, 0);
}

function readInstalledProfileForStatus(): StatusReport['installedProfile'] {
  const statePath = installProfileStatePath();
  try {
    const state = readInstalledProfile();
    if (!state) return { recorded: false };
    if (!Array.isArray(state.components)) {
      return {
        recorded: 'invalid',
        kind: 'corrupt_current',
        error: `installed profile state has a malformed components field (expected an array): ${statePath}`,
        path: statePath,
      };
    }
    return { recorded: true, profile: state.profile, components: state.components };
  } catch (error) {
    let kind: 'legacy_protocol' | 'corrupt_current' = 'corrupt_current';
    try {
      readLegacyInstalledProfileForMigration();
      kind = 'legacy_protocol';
    } catch {
      // Only a fully valid protocol-1 state is migratable. Malformed JSON,
      // malformed legacy state, and invalid protocol-2 state stay diagnostic.
    }
    return { recorded: 'invalid', kind, error: (error as Error).message, path: statePath };
  }
}

export function runStatus(cwd: string = process.cwd()): StatusReport {
  const byEvent: Record<string, number> = {};
  for (const r of ROUTES) {
    byEvent[r.event] = (byEvent[r.event] ?? 0) + 1;
  }

  const installedProfile = readInstalledProfileForStatus();
  const targets: StatusReport['targets'] = [];
  for (const target of ALL_TARGETS) {
    if (!target.supportsLocation('global')) continue;
    const expectedEntryCount = expectedManagedEntryCount(target.id, installedProfile);
    const det = target.detect('global');
    const managedEntryCount = det.configPath ? countManagedEntries(det.configPath) : 0;
    targets.push({
      id: target.id,
      displayName: target.displayName,
      location: 'global',
      installed: det.installed,
      alreadyConfigured: det.alreadyConfigured,
      configPath: det.configPath,
      managedEntryCount,
      expectedEntryCount,
    });
  }

  const repoRoot = resolveRepoRoot(cwd);
  const repo: StatusReport['repo'] = {
    inGitRepo: repoRoot !== null,
    optInMarker: OPT_IN_MARKER,
    optIn: false,
  };
  if (repoRoot) {
    repo.repoRoot = repoRoot;
    repo.optIn = fs.existsSync(path.join(repoRoot, OPT_IN_MARKER));
  }

  return {
    cli: { version: CLI_VERSION },
    targets,
    repo,
    routes: { total: ROUTES.length, byEvent },
    installedProfile,
  };
}

export function formatStatus(report: StatusReport, asJson = false): string {
  if (asJson) return JSON.stringify(report, null, 2);
  const lines: string[] = [];
  lines.push(`repo-harness ${report.cli.version}`);
  lines.push('');
  lines.push('Hosts:');
  for (const t of report.targets) {
    let status: string;
    if (!t.installed) status = 'host not detected';
    else if (!t.alreadyConfigured) status = 'host present, repo-harness not installed';
    else status = `${t.managedEntryCount}/${t.expectedEntryCount} managed entries`;
    lines.push(`  ${t.id} (${t.location}): ${status}`);
    if (t.configPath) lines.push(`    ${t.configPath}`);
  }
  lines.push('');
  lines.push('Routes:');
  lines.push(`  ${report.routes.total} total`);
  for (const [event, count] of Object.entries(report.routes.byEvent)) {
    lines.push(`    ${event}: ${count}`);
  }
  lines.push('');
  lines.push('Installed profile:');
  if (report.installedProfile.recorded === true) {
    lines.push(`  profile: ${report.installedProfile.profile}`);
    lines.push(`  components: ${report.installedProfile.components.join(', ') || '(none)'}`);
  } else if (report.installedProfile.recorded === 'invalid') {
    lines.push(`  (invalid): ${report.installedProfile.error}`);
  } else {
    lines.push('  (not recorded)');
  }
  lines.push('');
  lines.push('Current repo:');
  if (report.repo.inGitRepo) {
    lines.push(`  git root: ${report.repo.repoRoot}`);
    lines.push(`  opt-in (${report.repo.optInMarker}): ${report.repo.optIn ? 'yes' : 'no'}`);
  } else {
    lines.push('  not in a git repo');
  }
  return lines.join('\n');
}
