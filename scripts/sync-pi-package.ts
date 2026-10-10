import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillSurfaceCatalog } from '../src/core/skill-surface/catalog';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = parseSkillSurfaceCatalog(readFileSync(join(root, 'assets/skill-commands/manifest.json'), 'utf8'), { declared: true });
if (manifest.status !== 'valid') throw new Error(JSON.stringify(manifest.diagnostics));
const skills = manifest.catalog.packages.filter(pkg => pkg.hosts.includes('pi') && pkg.source !== null
  && pkg.profiles.includes('minimal') && (pkg.kind === 'router' || pkg.kind === 'facade'))
  .map(pkg => pkg.source === '.' ? './SKILL.md' : `./${pkg.source}`);
if (!skills.length) throw new Error('PI_PACKAGE_HAS_NO_SKILLS');
for (const source of skills) {
  if (!existsSync(join(root, source, source.endsWith('.md') ? '' : 'SKILL.md'))) throw new Error(`PI_PACKAGE_SKILL_MISSING: ${source}`);
}
const path = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(path, 'utf8'));
const projection = { extensions: ['./src/pi/extension.ts'], skills };
if (process.argv.includes('--write')) {
  pkg.pi = projection;
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
} else if (process.argv.includes('--check')) {
  if (JSON.stringify(pkg.pi) !== JSON.stringify(projection)) throw new Error('PI_PACKAGE_DRIFT: run bun run sync:pi-package');
} else {
  throw new Error('Usage: bun scripts/sync-pi-package.ts --check|--write');
}
console.log(`Pi package projection: ${skills.length} skills`);
