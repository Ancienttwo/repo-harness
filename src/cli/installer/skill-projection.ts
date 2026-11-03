import { existsSync, lstatSync, realpathSync } from 'fs';
import { join, resolve } from 'path';
import { facadesForSelection, hostSkillPlacements, type SkillSurfaceCatalog } from '../../core/skill-surface/catalog';
import { ownerEnabled, type PluginId } from '../../core/skill-surface/plugin-manifest';
import { hostSkillRoot, stagedSkillRoot, SKILL_HOSTS, type SkillHost } from '../../effects/host-skill-roots';

export function bunGlobalPackageRoot(env?: NodeJS.ProcessEnv): string | null {
  const selected = env === undefined ? process.env : env;
  const bunInstall = selected.BUN_INSTALL;
  const home = selected.HOME ?? selected.USERPROFILE;
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
 * The Pi skill root belongs to the `pi` plugin, so it is projected only with it.
 */
export function expectedSkillProjections(
  catalog: SkillSurfaceCatalog,
  sourceRoot: string,
  home: string,
  plugins: readonly PluginId[],
  env: NodeJS.ProcessEnv = process.env,
): readonly SkillProjection[] {
  const facades = new Set(facadesForSelection(catalog, plugins));
  const placements = hostSkillPlacements(catalog, plugins);
  return SKILL_HOSTS.filter(host => host !== 'pi' || plugins.includes('pi')).flatMap(host => {
    const names = new Set([...facades, ...placements[host]]);
    const root = hostSkillRoot(home, host, env);
    const projections: SkillProjection[] = [{ host, name: catalog.router, source: sourceRoot, staged: false,
      destination: join(root, catalog.router) }];
    for (const pkg of catalog.packages) {
      if (!pkg.hosts.includes(host)) continue;
      if (pkg.source !== null && names.has(pkg.name)) {
        projections.push({ host, name: pkg.name, source: join(sourceRoot, pkg.source), staged: false,
          destination: join(root, pkg.name) });
      } else if (pkg.provider === 'tw93/Waza' && !pkg.explicitOnly && ownerEnabled(pkg.owner, plugins)) {
        projections.push({ host, name: pkg.name, source: join(stagedSkillRoot(home), pkg.name), staged: true,
          destination: join(root, pkg.name) });
      }
    }
    return projections;
  });
}
