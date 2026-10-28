import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpWorkspace } from '../helpers/repo-fixture';
import { installPiPackage, piPackagePresent, piUserPackageSources, runPi } from '../../src/cli/installer/pi-package';
import { readInstalledProfile, recordPiInstallOwnership, type ManagedInstallSurface } from '../../src/cli/installer/install-profile';
import { hostSkillRoot } from '../../src/effects/host-skill-roots';
import { checkPiHost } from '../../src/cli/commands/doctor';
import { dependencies } from '../../package.json';
import { runTransactionalRuntimeRefresh } from '../../src/cli/index';
import { recordInstallOwnership } from '../helpers/install-ownership';
import { runUserUninstall } from '../../src/cli/installer/uninstall';
import { bunGlobalPackageRoot } from '../../src/cli/installer/skill-projection';
import { piAgentDir } from '../../src/effects/pi-agent-dir';
import { configureRequiredHerdrSkill } from '../../src/cli/commands/herdr-skill';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');

function fixture(run: (f: ReturnType<typeof createFixture>) => void) {
  const root = tmpWorkspace('pi-install');
  try { run(createFixture(root)); } finally { rmSync(root, { recursive: true, force: true }); }
}

function createFixture(root: string) {
  const home = join(root, 'home');
  const bin = join(root, 'bin');
  const host = join(root, 'pi-host');
  const source = join(home, '.bun/install/global/node_modules/repo-harness');
  const write = (path: string, content: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };
  const env = { ...process.env, HOME: home, BUN_INSTALL: join(home, '.bun'), PI_CODING_AGENT_DIR: join(root, 'pi-config'),
    PATH: `${bin}:${process.env.PATH}`, PI_PACKAGE_DIR: undefined, PI_FIXTURE_ROOT: root, PI_FIXTURE_VERSION: '1.4.0', REPO_HARNESS_BUN_EXECUTABLE: join(bin, 'bun') };
  write(join(source, 'package.json'), JSON.stringify({ name: 'repo-harness', version: '0.0.0', dependencies, pi: { extensions: ['./extension.ts'] } }));
  symlinkSync(join(ROOT, 'node_modules'), join(source, 'node_modules'), 'dir');
  write(join(host, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '1.4.0', type: 'module', main: './dist/index.js' }));
  write(join(host, 'dist/index.js'), `import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function getPackageDir() { return process.env.PI_PACKAGE_DIR || fileURLToPath(new URL('../',import.meta.url)); }
let metadata={};
try { metadata=JSON.parse(readFileSync(getPackageDir()+'/package.json','utf8')); } catch(error) { if(error.code!=='ENOENT') throw error; }
export const VERSION=process.env.PI_PACKAGE_DIR ? metadata.version || '0.0.0' : process.env.PI_FIXTURE_VERSION || metadata.version || '0.0.0';
`);
  write(join(host, 'dist/core/tools/path-utils.js'), 'export function resolveToCwd(path) { return path; }');
  write(join(root, 'packages.json'), JSON.stringify(['npm:other-package']));
  write(join(env.PI_CODING_AGENT_DIR, 'settings.json'), '{"theme":"user","packages":["npm:other-package"]}\n');
  write(join(env.PI_CODING_AGENT_DIR, 'auth.json'), '{"fixture":true}\n');
  write(join(host, 'pi'), `#!${process.execPath}
import {appendFileSync,readFileSync,writeFileSync} from 'node:fs';
import {relative,resolve} from 'node:path';
const root=process.env.PI_FIXTURE_ROOT;
const agentDir=process.env.PI_CODING_AGENT_DIR.replace(/^~(?=$|[\\\\/])/,process.env.HOME);
const args=process.argv.slice(2);
appendFileSync(root+'/argv.jsonl', JSON.stringify(args)+'\\n');
const file=root+'/packages.json';
const entries=JSON.parse(readFileSync(file,'utf8'));
switch(args[0]) {
case '--version': console.log(process.env.PI_FIXTURE_VERSION); break;
case 'list':
  if(process.env.PI_FIXTURE_BAD_LIST==='1') { console.log('invalid'); break; }
  if(entries.length) { console.log('User packages:'); for(const p of entries) { console.log('  '+p); if(!p.startsWith('npm:')) console.log('    '+resolve(agentDir,p)); } }
  else console.log('No packages installed.');
  break;
case 'install':
  entries.push(relative(agentDir,args[1])); writeFileSync(file,JSON.stringify(entries));
  if(process.env.PI_FIXTURE_FAIL_INSTALL==='1') process.exit(1);
  break;
case 'remove':
  if(process.env.PI_FIXTURE_KEEP_ENTRY==='1') break;
  writeFileSync(file,JSON.stringify(entries.filter(p=>p.startsWith('npm:')||resolve(agentDir,p)!==resolve(args[1])))); break;
default: process.exit(99);
}
`);
  chmodSync(join(host, 'pi'), 0o755);
  mkdirSync(bin, { recursive: true });
  symlinkSync(process.execPath, join(bin, 'bun'));
  symlinkSync(join(host, 'pi'), join(bin, 'pi'));
  write(join(bin, 'herdr'), `#!${process.execPath}\nconsole.log('---\\nname: herdr\\n---\\nHERDR_ENV\\n\\n## Learn the current CLI\\n\\nUse herdr --help.');\n`);
  chmodSync(join(bin, 'herdr'), 0o755);
  write(join(home, '.bun/bin/repo-harness'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(home, '.bun/bin/repo-harness'), 0o755);
  const argv = () => existsSync(join(root, 'argv.jsonl')) ? readFileSync(join(root, 'argv.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as string[]) : [];
  const cli = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, env, encoding: 'utf8', timeout: 60_000 });
  return { root, home, env, source, host, write, argv, cli };
}

describe('Pi package and skill installation', () => {
  test('list parsing keeps the final user section and ignores output noise and project entries', () => {
    expect(piUserPackageSources('added 2 packages\n  unrelated install output\nUser packages:\n  old\nUser packages:\n  ../current\n    /absolute/current\ninstall notice\nProject packages:\n  ../project')).toEqual(['../current']);
    expect(() => piUserPackageSources('  ../unscoped')).toThrow('PI_PACKAGE_LIST_INVALID');
  });

  test('an explicit environment never borrows the parent Bun installation', () => fixture(f => {
    const previous = process.env.BUN_INSTALL;
    try {
      process.env.BUN_INSTALL = join(f.root, 'parent-bun');
      expect(bunGlobalPackageRoot({ HOME: f.home })).toBe(f.source);
      expect(bunGlobalPackageRoot({})).toBeNull();
      expect(bunGlobalPackageRoot({ USERPROFILE: f.home })).toBe(f.source);
      expect(bunGlobalPackageRoot()).toBe(join(f.root, 'parent-bun/install/global/node_modules/repo-harness'));
    } finally {
      if (previous === undefined) delete process.env.BUN_INSTALL; else process.env.BUN_INSTALL = previous;
    }
  }));

  test('tilde agent directories share package identity and skill projection paths', () => fixture(f => {
    const env = { ...f.env, PI_CODING_AGENT_DIR: '~/pi-agent' };
    const agent = join(f.home, 'pi-agent');
    expect(piAgentDir(f.home, env)).toBe(agent);
    expect(piAgentDir(f.home, { PI_CODING_AGENT_DIR: '~' })).toBe(f.home);
    expect(hostSkillRoot(f.home, 'pi', env)).toBe(join(agent, 'skills'));
    expect(installPiPackage(f.source, true, env).status).toBe('ok');
    expect(piPackagePresent(f.source, env)).toBe(true);
    expect(configureRequiredHerdrSkill('both', env).status).toBe('ok');
    expect(existsSync(join(agent, 'skills/herdr/SKILL.md'))).toBe(true);
    const invalid = configureRequiredHerdrSkill('both', { ...env, PI_CODING_AGENT_DIR: 'relative-agent' });
    expect(invalid).toMatchObject({ status: 'failed', detail: expect.stringContaining('non-canonical host skill root') });
  }));

  test('package identity compares real paths across a symlinked source', () => fixture(f => {
    const alias = join(f.root, 'package-alias');
    symlinkSync(f.source, alias, 'dir');
    f.write(join(f.root, 'packages.json'), JSON.stringify([relative(f.env.PI_CODING_AGENT_DIR, alias)]));
    expect(piPackagePresent(f.source, f.env)).toBe(true);
  }));
  test('relative Pi entry shape is recorded and detected after install', () => fixture(f => {
    expect(installPiPackage(f.source, true, f.env)).toMatchObject({ status: 'ok', created: true });
    const source = relative(f.env.PI_CODING_AGENT_DIR, f.source);
    expect(JSON.parse(readFileSync(join(f.root, 'packages.json'), 'utf8'))).toEqual(['npm:other-package', source]);
    expect(runPi(['list'], f.env)).toContain(`  ${source}\n    ${f.source}`);
    expect(piPackagePresent(f.source, f.env)).toBe(true);
  }));

  test('pre-existing relative Pi entry is present and is not installed again', () => fixture(f => {
    f.write(join(f.root, 'packages.json'), JSON.stringify(['npm:other-package', relative(f.env.PI_CODING_AGENT_DIR, f.source)]));
    expect(piPackagePresent(f.source, f.env)).toBe(true);
    expect(installPiPackage(f.source, true, f.env)).toMatchObject({ status: 'ok', created: false });
    expect(f.argv().some(args => args[0] === 'install')).toBe(false);
  }));
  const packageSurface = (source: string): ManagedInstallSurface => ({
    path: source, components: ['host-adapters'], authority: 'repo-harness-install-transaction', removal: 'managed-surfaces-only',
    type: 'pi-package', managed_marker: 'pi-package-source', content_hash: null, symlink_target: null,
  });

  test('unconfirmed removal keeps the Pi package ownership ledger for retry', () => fixture(f => {
    recordInstallOwnership([], f.env);
    expect(installPiPackage(f.source, true, f.env).created).toBe(true);
    recordPiInstallOwnership([packageSurface(f.source)], f.env);
    const result = runUserUninstall({ target: 'both', env: { ...f.env, PI_FIXTURE_KEEP_ENTRY: '1' } });
    expect(result.exitCode).toBe(1);
    expect(result.items.some(item => item.action === 'unresolved' && item.reason.includes('PI_PACKAGE_REMOVE_NOT_RECORDED'))).toBe(true);
    expect(readInstalledProfile(f.env)?.ownership_manifest).toContainEqual(packageSurface(f.source));
    expect(piPackagePresent(f.source, f.env)).toBe(true);
    expect(f.argv().filter(args => args[0] === 'remove')).toEqual([['remove', f.source]]);
  }));

  test('an unreadable package list preserves ownership instead of retiring the ledger', () => fixture(f => {
    recordInstallOwnership([], f.env);
    recordPiInstallOwnership([packageSurface(f.source)], f.env);
    expect(runUserUninstall({ target: 'both', env: { ...f.env, PI_FIXTURE_BAD_LIST: '1' } }).exitCode).toBe(1);
    expect(readInstalledProfile(f.env)?.ownership_manifest).toContainEqual(packageSurface(f.source));
  }));

  test('failed candidate handoff compensates the new entry recorded in the shared ledger', () => fixture(f => {
    recordInstallOwnership([], f.env);
    const result = runTransactionalRuntimeRefresh({ env: f.env }, () => {
      expect(installPiPackage(f.source, true, f.env).created).toBe(true);
      recordPiInstallOwnership([packageSurface(f.source)], f.env);
      return { exitCode: 1, steps: [], lines: [], stdout: '', stderr: 'candidate receipt failed' };
    });
    expect(result.exitCode).toBe(1);
    expect(piPackagePresent(f.source, f.env)).toBe(false);
    expect(readInstalledProfile(f.env)?.ownership_manifest).toEqual([]);
  }));

  test('uninstall skips missing Pi and retains its ownership for a later retry', () => fixture(f => {
    recordInstallOwnership([], f.env);
    expect(installPiPackage(f.source, true, f.env).created).toBe(true);
    recordPiInstallOwnership([packageSurface(f.source)], f.env);
    const result = runUserUninstall({ target: 'both', env: { ...f.env, PATH: '' } });
    expect(result.exitCode).toBe(0);
    expect(result.items).toContainEqual({ path: f.source, action: 'preserve', reason: 'pi not found on PATH; package removal skipped; ownership retained for retry' });
    expect(readInstalledProfile(f.env)?.ownership_manifest).toContainEqual(packageSurface(f.source));
    expect(f.argv().some(args => args[0] === 'remove')).toBe(false);
  }));

  test('dry-run, install, update and uninstall use Pi CLI ownership and preserve user files', () => fixture(f => {
    const settings = readFileSync(join(f.env.PI_CODING_AGENT_DIR, 'settings.json'));
    const auth = readFileSync(join(f.env.PI_CODING_AGENT_DIR, 'auth.json'));
    const dry = f.cli('install', '--profile', 'minimal', '--dry-run', '--json');
    expect(dry.status, dry.stderr).toBe(0);
    const plan = JSON.parse(dry.stdout);
    expect(plan.hosts).toEqual(['claude', 'codex', 'pi']);
    expect(plan.pi_package.command).toEqual(['pi', 'install', f.source]);
    expect(plan.skill_projections.some((p: { host: string; destination: string }) => p.host === 'pi' && p.destination === join(f.env.PI_CODING_AGENT_DIR, 'skills/repo-harness'))).toBe(true);
    expect(f.argv()).toEqual([]);
    const install = f.cli('install', '--profile', 'minimal', '--no-cli', '--no-external-skills', '--no-codegraph', '--json');
    expect(install.status, install.stderr + install.stdout).toBe(0);
    const owned = readInstalledProfile(f.env)!;
    expect(owned.ownership_manifest.some(s => s.type === 'pi-package' && s.path === f.source)).toBe(true);
    const piRoot = hostSkillRoot(f.home, 'pi', f.env);
    expect(owned.ownership_manifest.some(s => s.path === join(piRoot, 'repo-harness'))).toBe(true);
    expect(existsSync(join(piRoot, 'repo-harness/SKILL.md'))).toBe(true);
    f.write(join(piRoot, 'user-skill/SKILL.md'), '# user\n');
    const update = f.cli('update', '--no-cli', '--no-codegraph', '--json');
    expect(update.status, update.stderr + update.stdout).toBe(0);
    expect(f.argv().filter(args => args[0] === 'install')).toEqual([['install', f.source]]);
    const beforePreview = f.argv().filter(args => args[0] === 'remove').length;
    const preview = f.cli('uninstall', '--dry-run', '--json');
    expect(preview.status, preview.stderr + preview.stdout).toBe(0);
    expect(f.argv().filter(args => args[0] === 'remove')).toHaveLength(beforePreview);
    const uninstall = f.cli('uninstall', '--json');
    expect(uninstall.status, uninstall.stderr + uninstall.stdout).toBe(0);
    expect(f.argv().filter(args => args[0] === 'remove')).toEqual([['remove', f.source]]);
    expect(existsSync(join(piRoot, 'repo-harness'))).toBe(false);
    expect(readFileSync(join(piRoot, 'user-skill/SKILL.md'), 'utf8')).toBe('# user\n');
    expect(JSON.parse(readFileSync(join(f.root, 'packages.json'), 'utf8'))).toEqual(['npm:other-package']);
    expect(readFileSync(join(f.env.PI_CODING_AGENT_DIR, 'settings.json'))).toEqual(settings);
    expect(readFileSync(join(f.env.PI_CODING_AGENT_DIR, 'auth.json'))).toEqual(auth);
    expect(existsSync(join(f.source, 'package.json'))).toBe(true);
    expect(f.argv().every(args => !args.includes('--approve'))).toBe(true);
  }), 120_000);

  test('does not claim or duplicate a pre-existing entry; malformed list fails closed', () => fixture(f => {
    f.write(join(f.root, 'packages.json'), JSON.stringify([f.source, 'npm:other-package']));
    expect(installPiPackage(f.source, true, f.env)).toMatchObject({ status: 'ok', created: false });
    expect(f.argv()).toEqual([['list']]);
    expect(installPiPackage(f.source, true, { ...f.env, PI_FIXTURE_BAD_LIST: '1' })).toMatchObject({ status: 'failed', detail: 'PI_PACKAGE_LIST_INVALID' });
    expect(f.argv().some(args => args[0] === 'install')).toBe(false);
    expect(piUserPackageSources(`Project packages:\n  ${f.source}`)).toEqual([]);
  }));

  test('uninstall preserves a pre-existing Pi package and a changed owned skill', () => fixture(f => {
    f.write(join(f.root, 'packages.json'), JSON.stringify([f.source, 'npm:other-package']));
    const install = f.cli('install', '--profile', 'minimal', '--no-cli', '--no-external-skills', '--no-codegraph', '--json');
    expect(install.status, install.stderr + install.stdout).toBe(0);
    expect(readInstalledProfile(f.env)?.ownership_manifest.some(s => s.type === 'pi-package')).toBe(false);
    const skill = join(hostSkillRoot(f.home, 'pi', f.env), 'repo-harness-check');
    rmSync(skill);
    f.write(join(skill, 'SKILL.md'), '# user change\n');
    const uninstall = f.cli('uninstall', '--json');
    expect(uninstall.status).toBe(1);
    expect(readFileSync(join(skill, 'SKILL.md'), 'utf8')).toBe('# user change\n');
    expect(piPackagePresent(f.source, f.env)).toBe(true);
    expect(f.argv().some(args => args[0] === 'install' || args[0] === 'remove')).toBe(false);
  }));

  test('compensates a failed install after Pi has recorded its entry', () => fixture(f => {
    expect(installPiPackage(f.source, true, { ...f.env, PI_FIXTURE_FAIL_INSTALL: '1' }).status).toBe('failed');
    expect(piPackagePresent(f.source, f.env)).toBe(false);
    expect(f.argv().filter(args => args[0] === 'remove')).toEqual([['remove', f.source]]);
  }));

  test('missing Pi and unselected Pi skip without executing commands', () => fixture(f => {
    expect(installPiPackage(f.source, true, { ...f.env, PATH: '' })).toMatchObject({ status: 'skipped', detail: 'pi not found on PATH' });
    expect(installPiPackage(f.source, false, f.env).status).toBe('skipped');
    expect(f.argv()).toEqual([]);
    expect(hostSkillRoot(f.home, 'pi', {})).toBe(join(f.home, '.pi/agent/skills'));
  }));

  test('setup reports supported and unsupported versions, capability and package state', () => fixture(f => {
    expect(checkPiHost(f.env).map(c => [c.id, c.status])).toEqual([
      ['pi-path', 'ok'], ['pi-cli-version', 'ok'], ['pi-capability', 'ok'], ['pi-package', 'warn'],
    ]);
    expect(checkPiHost({ ...f.env, PI_FIXTURE_VERSION: '1.3.9' }).find(c => c.id === 'pi-cli-version')).toMatchObject({ status: 'fail', detail: expect.stringContaining('PI_HOST_UNSUPPORTED_VERSION') });
    expect(checkPiHost({ ...f.env, PI_FIXTURE_VERSION: '2.0.0' }).find(c => c.id === 'pi-cli-version')?.status).toBe('ok');
    expect(checkPiHost({ ...f.env, PI_FIXTURE_VERSION: '2.0.0-beta+build' }).find(c => c.id === 'pi-cli-version')).toMatchObject({ status: 'ok', version: '2.0.0-beta+build' });
    f.write(join(f.host, 'dist/core/tools/path-utils.js'), 'export const resolveToCwd = null;');
    expect(checkPiHost(f.env).find(c => c.id === 'pi-capability')).toMatchObject({ status: 'fail', capability: { state: 'unavailable', code: 'PI_HOST_PATH_RESOLVER_UNAVAILABLE' } });
    const empty = join(f.root, 'empty-package');
    mkdirSync(empty);
    expect(checkPiHost({ ...f.env, PI_PACKAGE_DIR: empty }).find(c => c.id === 'pi-capability')).toMatchObject({ status: 'fail', capability: { state: 'unavailable', code: 'PI_HOST_UNSUPPORTED_VERSION' } });
    f.write(join(empty, 'package.json'), JSON.stringify({ version: '1.4.0' }));
    expect(checkPiHost({ ...f.env, PI_PACKAGE_DIR: empty }).find(c => c.id === 'pi-capability')).toMatchObject({ status: 'fail', capability: { state: 'unavailable', code: 'PI_HOST_PATH_RESOLVER_UNAVAILABLE' } });
    f.write(join(empty, 'dist/core/tools/path-utils.js'), 'export function resolveToCwd(path) { return path; }');
    expect(checkPiHost({ ...f.env, PI_PACKAGE_DIR: empty }).find(c => c.id === 'pi-capability')).toMatchObject({ status: 'ok', capability: { state: 'ready' } });
    expect(checkPiHost({ ...f.env, PATH: '' }).every(c => c.status === 'na')).toBe(true);
  }));
});
