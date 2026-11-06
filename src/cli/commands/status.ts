/**
 * `repo-harness status` — read-only summary of CLI install state + route coverage.
 *
 * Reports per-host install detection (target.detect), managed-entry count vs
 * expected, exact managed projection drift, route registry summary, and
 * current repo opt-in marker presence. No mutations.
 */

import * as fs from 'fs';
import { version as PACKAGE_VERSION } from '../../../package.json';
import { ALL_TARGETS } from '../installer/targets/registry';
import { ROUTES, routesForHost } from '../hook/route-registry';
import {
  compareManagedHookProjection,
  isManagedEntry,
  type HookHost,
  type HooksByEvent,
  type ManagedHookProjectionMismatch,
  type ManagedHookProjectionReport,
} from '../installer/managed-entries';
import { readJsonOrEmpty } from '../installer/shared';
import type { Location } from '../installer/types';
import { readInstallState } from '../installer/install-profile';
import {
  enabledPlugins,
  InstallStateError,
  installProfileStatePath,
  type InstallStateErrorCode,
} from '../installer/install-state';
import { selectionLabel, type PluginId, type PluginSelection } from '../../core/skill-surface/plugin-manifest';
import { architecturePort, isArchitectureUnavailable, type ArchitectureProjectionReadinessV1 } from '../../core/architecture/contracts';
import { globalArchitectureSectionPresent } from '../../effects/configuration/global-configuration';
import { WORKFLOW_CONTRACT_MARKER_PATH } from '../../core/adoption/minimum-harness-version';
import { gitExecFileSync } from '../../effects/git/runner';
import { isOptIn } from '../hook/runtime';

export const CLI_VERSION: string = PACKAGE_VERSION;

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
    /** Exact comparison of the repo-harness-owned projection, when inspected. */
    projection?: ManagedHookProjectionReport;
  }>;
  repo: {
    inGitRepo: boolean;
    repoRoot?: string;
    optIn: boolean;
    optInMarker: string;
  };
  routes: { total: number; byEvent: Record<string, number> };
  installState:
    | { recorded: true; core_version: string; plugins: readonly PluginId[]; selection: PluginSelection }
    | { recorded: false }
    // install-state.json exists but the strict protocol 3 reader rejected it.
    // The code says which next step applies: protocol 1 and protocol 2 need
    // the 0.25.x bridge releases, and anything else needs inspection.
    | {
        recorded: 'invalid';
        code: InstallStateErrorCode;
        error: string;
        path: string;
      };
  architectureProjection?: ArchitectureProjectionReadinessV1 | ArchitectureProjectionNotSelected | { error: string };
}

function resolveRepoRoot(cwd: string): string | null {
  try {
    const out = gitExecFileSync(['-C', cwd, 'rev-parse', '--show-toplevel'], {
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

function expectedManagedEntryCount(host: HookHost): number {
  return routesForHost(host).length;
}

export function inspectManagedProjection(
  filePath: string | undefined,
  host: HookHost,
): ManagedHookProjectionReport {
  if (!filePath || !fs.existsSync(filePath)) {
    return compareManagedHookProjection({}, host);
  }
  try {
    const data = readJsonOrEmpty<{ hooks?: unknown }>(filePath);
    return compareManagedHookProjection(data.hooks ?? {}, host);
  } catch {
    // Keep malformed host config fail-closed: an empty managed projection is
    // reported as drift, while the existing target diagnostics retain the
    // config path for repair.
    return compareManagedHookProjection({}, host);
  }
}

function formatProjectionValue(value: unknown): string {
  if (value === undefined) return '(missing)';
  if (typeof value === 'string') {
    return value.length > 160 ? `${value.slice(0, 157)}...` : value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatManagedHookProjectionMismatch(
  mismatch: ManagedHookProjectionMismatch,
): string {
  const route = mismatch.routeId ? `${mismatch.event}.${mismatch.routeId}` : mismatch.event;
  if (mismatch.kind === 'missing') return `${route} missing`;
  if (mismatch.kind === 'duplicate') return `${route} duplicate`;
  if (mismatch.kind === 'unexpected') return `${route} unexpected`;
  return `${route} ${mismatch.field} expected=${formatProjectionValue(mismatch.expected)} actual=${formatProjectionValue(mismatch.actual)}`;
}

/** The plugin is not selected: archctx does not run, and the host section, when present, stays inert. */
export interface ArchitectureProjectionNotSelected {
  selected: false;
  configured: boolean;
  configurationPath: string;
  next: string;
}

function architectureProjectionStatus(repoRoot: string): NonNullable<StatusReport['architectureProjection']> {
  const setup = architecturePort('setup');
  if (!isArchitectureUnavailable(setup)) return setup.readiness(repoRoot);
  if (setup.code !== 'ARCHITECTURE_PLUGIN_NOT_SELECTED') return { error: setup.message };
  const section = globalArchitectureSectionPresent();
  return { selected: false, configured: section.present, configurationPath: section.path, next: setup.message };
}

export function readInstallStateForStatus(): StatusReport['installState'] {
  try {
    const state = readInstallState();
    if (!state) return { recorded: false };
    return { recorded: true, core_version: state.core.version, plugins: enabledPlugins(state), selection: state.selection };
  } catch (error) {
    if (!(error instanceof InstallStateError)) throw error;
    return { recorded: 'invalid', code: error.code, error: error.message, path: installProfileStatePath() };
  }
}

export function runStatus(cwd: string = process.cwd()): StatusReport {
  const byEvent: Record<string, number> = {};
  for (const r of ROUTES) {
    byEvent[r.event] = (byEvent[r.event] ?? 0) + 1;
  }

  const installState = readInstallStateForStatus();
  const targets: StatusReport['targets'] = [];
  for (const target of ALL_TARGETS) {
    if (!target.supportsLocation('global')) continue;
    const expectedEntryCount = expectedManagedEntryCount(target.id);
    const det = target.detect('global');
    const managedEntryCount = det.configPath ? countManagedEntries(det.configPath) : 0;
    const projection = inspectManagedProjection(det.configPath, target.id);
    targets.push({
      id: target.id,
      displayName: target.displayName,
      location: 'global',
      installed: det.installed,
      alreadyConfigured: det.alreadyConfigured,
      configPath: det.configPath,
      managedEntryCount,
      expectedEntryCount,
      projection,
    });
  }

  const repoRoot = resolveRepoRoot(cwd);
  const repo: StatusReport['repo'] = {
    inGitRepo: repoRoot !== null,
    optInMarker: WORKFLOW_CONTRACT_MARKER_PATH,
    optIn: false,
  };
  if (repoRoot) {
    repo.repoRoot = repoRoot;
    repo.optIn = isOptIn(repoRoot);
  }

  let architectureProjection: StatusReport['architectureProjection'];
  if (repoRoot && repo.optIn) {
    try {
      architectureProjection = architectureProjectionStatus(repoRoot);
    } catch (error) {
      architectureProjection = { error: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    cli: { version: CLI_VERSION },
    targets,
    repo,
    routes: { total: ROUTES.length, byEvent },
    installState,
    ...(architectureProjection ? { architectureProjection } : {}),
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
    if (t.projection?.error) {
      status += `; projection check failed: ${t.projection.error}`;
    } else if (t.alreadyConfigured && t.projection?.status === 'drift' && t.projection.mismatches.length > 0) {
      status += `; projection drift: ${t.projection.mismatches.map(formatManagedHookProjectionMismatch).join('; ')}`;
    }
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
  lines.push('Install state:');
  if (report.installState.recorded === true) {
    lines.push(`  core: ${report.installState.core_version}`);
    lines.push(`  selection: ${selectionLabel(report.installState.selection)}`);
    lines.push(`  plugins: ${report.installState.plugins.join(', ') || '(none)'}`);
  } else if (report.installState.recorded === 'invalid') {
    lines.push(`  (${report.installState.code}): ${report.installState.error}`);
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
  if (report.architectureProjection) {
    lines.push('');
    lines.push('Architecture projection:');
    if ('error' in report.architectureProjection) lines.push(`  error: ${report.architectureProjection.error}`);
    else if ('selected' in report.architectureProjection) {
      lines.push(`  plugin: ${report.architectureProjection.configured ? `configured, not selected (${report.architectureProjection.configurationPath})` : 'not selected'}`);
      lines.push(`  next: ${report.architectureProjection.next}`);
    } else {
      lines.push(`  model authority: ${report.architectureProjection.modelAuthority.source} (${report.architectureProjection.modelAuthority.ready ? 'ready' : 'blocked'})`);
      lines.push(`  provider: ${report.architectureProjection.projectionProvider.provider} (${report.architectureProjection.projectionProvider.state})`);
      lines.push(`  code facts: ${report.architectureProjection.codeFacts.state}`);
      lines.push(`  apply: ${report.architectureProjection.apply.mode}`);
      if (report.architectureProjection.next) lines.push(`  next: ${report.architectureProjection.next}`);
    }
  }
  return lines.join('\n');
}
