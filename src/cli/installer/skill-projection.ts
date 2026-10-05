import { existsSync, lstatSync, realpathSync } from 'fs';
import { join, resolve } from 'path';
import { facadesForProfile, hostSkillPlacements, type SkillSurfaceCatalog, type SkillSurfaceProfile } from '../../core/skill-surface/catalog';

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
  readonly host: 'claude' | 'codex';
  readonly name: string;
  readonly source: string;
  readonly destination: string;
  readonly staged: boolean;
}

/** The catalog owns selection. Install ownership and doctor share these paths. */
export function expectedSkillProjections(
  catalog: SkillSurfaceCatalog,
  sourceRoot: string,
  home: string,
  profile: SkillSurfaceProfile,
): readonly SkillProjection[] {
  const facades = new Set(facadesForProfile(catalog, profile));
  const placements = hostSkillPlacements(catalog, profile);
  return (['claude', 'codex'] as const).flatMap(host => {
    const names = new Set([...facades, ...placements[host]]);
    const projections: SkillProjection[] = [{ host, name: catalog.router, source: sourceRoot, staged: false,
      destination: join(home, `.${host}`, 'skills', catalog.router) }];
    for (const pkg of catalog.packages) {
      if (!pkg.hosts.includes(host)) continue;
      if (pkg.source !== null && names.has(pkg.name)) {
        projections.push({ host, name: pkg.name, source: join(sourceRoot, pkg.source), staged: false,
          destination: join(home, `.${host}`, 'skills', pkg.name) });
      } else if (pkg.provider === 'tw93/Waza' && pkg.profiles.includes(profile)) {
        projections.push({ host, name: pkg.name, source: join(home, '.agents', 'skills', pkg.name), staged: true,
          destination: join(home, `.${host}`, 'skills', pkg.name) });
      }
    }
    return projections;
  });
}
