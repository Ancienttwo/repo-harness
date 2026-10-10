import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, symlinkSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillSurfaceCatalog } from '../../core/skill-surface/catalog';

const NAME = 'repo-harness-strategy';
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
/** Explicit host projection only. It does not configure or read any project. */
export function projectStrategySkill(opts: { action: 'install' | 'uninstall'; target?: string; dryRun?: boolean; home?: string }) {
  const target = opts.target ?? 'both';
  if (!['codex', 'claude', 'both'].includes(target)) throw new Error('Invalid Skill target');
  const catalog = parseSkillSurfaceCatalog(readFileSync(join(PACKAGE_ROOT, 'assets/skill-commands/manifest.json'), 'utf8'));
  if (catalog.status !== 'valid') throw new Error('Invalid Skill catalog');
  const pkg = catalog.catalog.packages.find(p => p.name === NAME);
  if (!pkg?.source || pkg.profiles.length || pkg.discoverability !== 'explicit-setup') throw new Error('Strategy Skill must remain explicit');
  const source = realpathSync(join(PACKAGE_ROOT, pkg.source));
  if (!lstatSync(join(source, 'SKILL.md')).isFile()) throw new Error('Missing strategy Skill');
  const home = realpathSync(opts.home ?? process.env.HOME ?? homedir());
  const hosts = target === 'both' ? ['codex', 'claude'] : [target];
  const projections = hosts.map(host => {
    const parents = [join(home, `.${host}`), join(home, `.${host}`, 'skills')];
    for (const parent of parents) if (existsSync(parent) && (!lstatSync(parent).isDirectory() || lstatSync(parent).isSymbolicLink())) throw new Error('Refusing unsafe Skill parent');
    const destination = join(parents[1]!, NAME);
    let present = false;
    try {
      const stat = lstatSync(destination); present = true;
      if (!stat.isSymbolicLink() || resolve(dirname(destination), readlinkSync(destination)) !== source) throw new Error('Refusing unowned Skill destination');
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    return { destination, present };
  });
  const changed: string[] = [];
  if (!opts.dryRun) {
    try {
      for (const p of projections) {
        if (opts.action === 'install' && !p.present) {
          mkdirSync(dirname(p.destination), { recursive: true });
          symlinkSync(source, p.destination, process.platform === 'win32' ? 'junction' : 'dir'); changed.push(p.destination);
        } else if (opts.action === 'uninstall' && p.present) { unlinkSync(p.destination); changed.push(p.destination); }
      }
    } catch (error) {
      for (const path of changed.reverse()) {
        if (opts.action === 'install') unlinkSync(path);
        else symlinkSync(source, path, process.platform === 'win32' ? 'junction' : 'dir');
      }
      throw error;
    }
  }
  return { action: opts.action, dryRun: !!opts.dryRun, changed, projections };
}
