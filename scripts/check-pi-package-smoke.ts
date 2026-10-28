import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const work = mkdtempSync(join(tmpdir(), 'pi-package-smoke-'));
const home = join(work, 'home');
mkdirSync(home);
const env = { ...process.env, HOME: home, npm_config_cache: join(work, 'npm-cache') };
function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8' });
  assert.equal(result.status, 0, `${command}: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}
try {
  assert.ok(existsSync(join(root, 'dist/hook-entry.js')), 'Run bun run build:hook-bundle first.');
  const [pack] = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', work]));
  const files = new Set<string>(pack.files.map((file: { path: string }) => file.path));
  const required = ['package.json', 'src/pi/extension.ts', 'src/pi/hook-bridge.ts', 'src/pi/compat.ts',
    'src/cli/hook/hook-protocol.ts', 'dist/hook-entry.js'];
  for (const file of required) assert.ok(files.has(file), `Missing tarball file: ${file}`);
  run('tar', ['-xzf', join(work, pack.filename), '-C', work]);
  const packageRoot = join(work, 'package');
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.pi.extensions, ['./src/pi/extension.ts']);
  assert.equal(manifest.pi.skills, undefined, 'Pi skills must use the owned projection.');
  assert.equal(manifest.peerDependencies['@earendil-works/pi-coding-agent'], '*');
  assert.equal(manifest.peerDependenciesMeta['@earendil-works/pi-coding-agent'].optional, true);
  for (const file of required) assert.ok(readFileSync(join(packageRoot, file)).equals(readFileSync(join(root, file))), `Tarball drift: ${file}`);
  const hookSha = createHash('sha256').update(readFileSync(join(packageRoot, 'dist/hook-entry.js'))).digest('hex');
  console.log(JSON.stringify({ result: 'pass', package: `${manifest.name}@${manifest.version}`, requiredFiles: required,
    extension: manifest.pi.extensions[0], hookSha256: hookSha, tarballSha512: pack.integrity }));
} finally {
  rmSync(work, { recursive: true, force: true });
}
