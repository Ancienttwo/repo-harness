// One setup snapshot from the `repo-harness setup check` builder. This module
// runs in the collector's child process (setup-check-child.ts), never in the
// `operator serve` event loop: the builder is synchronous and spawns its own
// probes. It reads only the builder result, the skill catalog that the skill
// projection check reads, the route registry, and the packaged agent fleet.
// It never runs the fleet install script and never reads credential files.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skillProjectionSourceRoot } from './doctor';
import { buildSetupCheck, type SetupCheckBuild } from './init-hook';
import { HOOK_EVENT_TELEMETRY_PATH, HOOK_EVENT_TELEMETRY_PROTOCOL } from '../hook/event-telemetry';
import { ROUTES } from '../hook/route-registry';
import { resolveRepoRoot } from '../hook/runtime';
import { PROFILE_COMPONENTS } from '../installer/install-profile';
import { projectSetupSnapshot, type SetupRawFleetRole } from '../../core/setup/projection';
import type { SetupHookUsage, SetupSnapshotV2 } from '../../core/setup/types';
import { parseSkillSurfaceCatalog } from '../../core/skill-surface/catalog';
import { readHookUsage } from '../../effects/setup/hook-usage';
import { parseFrontmatter } from '../../effects/terminal/task-role-profiles';

/** The packaged fleet source, the same package-relative path the tooling check reads. */
export const SETUP_FLEET_SOURCE_DIR = fileURLToPath(new URL('../../../agents/fleet/', import.meta.url));

export function readFleetRoles(directory: string = SETUP_FLEET_SOURCE_DIR): SetupRawFleetRole[] {
  return readdirSync(directory)
    .filter(file => file.endsWith('.md'))
    .sort()
    .flatMap((file) => {
      const role = parseFrontmatter(readFileSync(join(directory, file), 'utf8'));
      return role === null ? [] : [{ name: role.name, description: role.description, model: role.model, effort: role.effort }];
    });
}

/** Catalog summaries from the package root the skill projection check reads. Empty when the catalog is unreadable. */
function skillSummaries(env: NodeJS.ProcessEnv): Map<string, string> {
  try {
    const manifest = readFileSync(join(skillProjectionSourceRoot(env), 'assets', 'skill-commands', 'manifest.json'), 'utf8');
    const catalog = parseSkillSurfaceCatalog(manifest, { declared: true, profileComponents: PROFILE_COMPONENTS });
    return catalog.status === 'valid' ? new Map(catalog.catalog.packages.map(pkg => [pkg.name, pkg.summary])) : new Map();
  } catch {
    return new Map();
  }
}

export function projectSetupBuild(build: SetupCheckBuild, options: {
  readonly env: NodeJS.ProcessEnv;
  readonly collected_at: string;
  readonly fleet_dir?: string;
  readonly hook_usage?: SetupHookUsage | null;
}): SetupSnapshotV2 {
  const doctorCheck = (id: string) => build.doctor.checks.find(check => check.id === id);
  const codexVersion = doctorCheck('codex-cli-version')?.version;
  const piVersion = doctorCheck('pi-cli-version')?.version;
  const tools = build.tooling?.tools as Record<string, { hosts?: unknown }> | undefined;
  return projectSetupSnapshot({
    collected_at: options.collected_at,
    setup_status: build.report.status,
    summary: build.report.summary,
    checks: build.report.checks,
    check_commands: new Map([...build.check_actions].map(([checkId, action]) => [checkId, action.command])),
    adapters: build.status.targets,
    cli_versions: { ...(codexVersion === undefined ? {} : { codex: codexVersion }), ...(piVersion === undefined ? {} : { pi: piVersion }) },
    skill_rows: doctorCheck('skill-projection')?.skills ?? null,
    skill_summaries: skillSummaries(options.env),
    routes: ROUTES,
    fleet_roles: readFleetRoles(options.fleet_dir),
    fleet_hosts: tools?.agent_fleet?.hosts ?? null,
    hook_usage: options.hook_usage ?? null,
  });
}

/** Hook usage of the repository that contains `cwd`; null outside a repository or when a log is unreadable. */
function hookUsageAt(cwd: string, nowMs: number): SetupHookUsage | null {
  const repoRoot = resolveRepoRoot(cwd);
  if (repoRoot === null) return null;
  try {
    return readHookUsage(repoRoot, { path: HOOK_EVENT_TELEMETRY_PATH, protocol: HOOK_EVENT_TELEMETRY_PROTOCOL }, ROUTES, nowMs);
  } catch {
    return null;
  }
}

/** Run the setup check builder exactly as `repo-harness setup check --target both` does (no --check-updates). */
export function collectSetupSnapshotNow(options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly now?: () => number } = {}): SetupSnapshotV2 {
  const env = options.env ?? process.env;
  const build = buildSetupCheck({ cwd: options.cwd, target: 'both', checkUpdates: false });
  const now = (options.now ?? Date.now)();
  return projectSetupBuild(build, { env, collected_at: new Date(now).toISOString(), hook_usage: hookUsageAt(options.cwd ?? process.cwd(), now) });
}
