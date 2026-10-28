import { existsSync, lstatSync, realpathSync } from 'fs';
import { join, resolve } from 'path';
import { facadesForProfile, hostSkillPlacements, SKILL_SURFACE_HOSTS, type SkillSurfaceCatalog, type SkillSurfaceProfile } from '../../core/skill-surface/catalog';
import { hostSkillRoot, stagedSkillRoot, type SkillHost } from '../../effects/host-skill-roots';

export function bunGlobalPackageRoot(env?: NodeJS.ProcessEnv): string | null {
  const bunInstall = env?.BUN_INSTALL ?? process.env.BUN_INSTALL;
  const home = env?.HOME ?? process.env.HOME ?? process.env.USERPROFILE;
  const bunRoot = bunInstall ? resolve(bunInstall) : home ? join(resolve(home), ".bun") : null;
  return bunRoot ? join(bunRoot, "install", "global", "node_modules", "repo-harness") : null;
}

export function isBunGlobalPackageSource(sourceRoot: string, env?: NodeJS.ProcessEnv): boolean {
  const globalPackageRoot = bunGlobalPackageRoot(env);
  if (globalPackageRoot === null) return false;
  if (resolve(sourceRoot) === globalPackageRoot) return true;
  try {
    return realpathSync(join(sourceRoot, "package.json")) === realpathSync(join(globalPackageRoot, "package.json"));
  } catch (_error) {
    return false;
  }
}

/** Accept relative and absolute links only when they reach the declared skill. */
export function skillLinkMatches(destination: string, source: string): boolean {
  try {
    return lstatSync(destination).isSymbolicLink()
      && existsSync(join(source, 'SKILL.md'))
      && realpathSync(destination) === realpathSync(source);
  } catch {
    return false;
  }
}

export interface SkillProjection {
  readonly host: SkillHost;
  readonly name: string;
  readonly source: string;
  readonly destination: string;
  readonly staged: boolean;
}

/**
 * The catalog owns selection. Install ownership and doctor share these paths.
 * PR-A covers Waza staging only. Mermaid retains transaction ownership and
 * stays outside this diagnostic. The Waza provider matches its runtime group.
 * Pi has no staged entries: Pi reads the staging root itself, and a host copy
 * would load the same skill twice.
 */
export function expectedSkillProjections(
  catalog: SkillSurfaceCatalog,
  sourceRoot: string,
  home: string,
  profile: SkillSurfaceProfile,
  env: Readonly<Record<string, string | undefined>>,
): readonly SkillProjection[] {
  const facades = new Set(facadesForProfile(catalog, profile));
  const placements = hostSkillPlacements(catalog, profile);
  return SKILL_SURFACE_HOSTS.flatMap(host => {
    const names = new Set([...facades, ...placements[host]]);
    const root = hostSkillRoot(home, host, env);
    const projections: SkillProjection[] = [{ host, name: catalog.router, source: sourceRoot, staged: false,
      destination: join(root, catalog.router) }];
    for (const pkg of catalog.packages) {
      if (!pkg.hosts.includes(host)) continue;
      if (pkg.source !== null && names.has(pkg.name)) {
        projections.push({ host, name: pkg.name, source: join(sourceRoot, pkg.source), staged: false,
          destination: join(root, pkg.name) });
      } else if (pkg.provider === 'tw93/Waza' && pkg.profiles.includes(profile)) {
        projections.push({ host, name: pkg.name, source: join(stagedSkillRoot(home), pkg.name), staged: true,
          destination: join(root, pkg.name) });
      }
    }
    return projections;
  });
}
