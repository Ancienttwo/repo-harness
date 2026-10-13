import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { type Stats } from 'node:fs';
import { win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nativeWindowsSystemToolsDirectory,
  resolveTrustedGhExecutable,
  type ProtectedHelperFileAccess,
} from '../../src/effects/runtime/protected-helper-platform';

const GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';
const SYSTEM = 'C:\\Windows\\System32';
type Kind = 'file' | 'directory' | 'symlink';
function files(entries: Record<string, Kind>, redirected: Record<string, string> = {}): Pick<ProtectedHelperFileAccess, 'exists' | 'lstat' | 'realpath'> {
  return {
    exists: path => entries[path] !== undefined,
    lstat: path => ({
      mode: 0o600,
      isFile: () => entries[path] === 'file',
      isSymbolicLink: () => entries[path] === 'symlink',
      isDirectory: () => entries[path] === 'directory',
    }) as Stats,
    realpath: path => redirected[path] ?? path,
  };
}
const windows = { platform: 'win32' as const, nativeSystemToolsDirectory: SYSTEM };

test('Windows selects the fixed standard gh.exe without POSIX executable bits', () => {
  expect(resolveTrustedGhExecutable(files({ [GH]: 'file' }), windows)).toBe(GH);
  const driveGh = 'D:\\Program Files\\GitHub CLI\\gh.exe';
  expect(resolveTrustedGhExecutable(files({ [driveGh]: 'file' }), {
    ...windows, nativeSystemToolsDirectory: 'D:\\Windows\\System32',
  })).toBe(driveGh);
});

test('Windows missing gh refuses arbitrary user, PATH and POSIX installs', () => {
  const paths: string[] = [];
  const access = files({ 'C:\\attacker\\gh.exe': 'file', '/usr/bin/gh': 'file' });
  expect(resolveTrustedGhExecutable({ ...access, exists: path => { paths.push(path); return access.exists(path); } }, windows)).toBeUndefined();
  expect(paths).toEqual([GH]);
});

test.each(['directory', 'symlink'] as const)('Windows rejects a %s at the fixed executable path', kind => {
  expect(() => resolveTrustedGhExecutable(files({ [GH]: kind }), windows)).toThrow('non-symlink regular file');
});

test('Windows rejects redirected executable or ancestor junction targets', () => {
  const attacker = 'C:\\attacker\\gh.exe';
  expect(() => resolveTrustedGhExecutable(files({ [GH]: 'file', [attacker]: 'file' }, { [GH]: attacker }), windows))
    .toThrow('fixed host install path');
  expect(() => resolveTrustedGhExecutable(files({ [GH]: 'file', [attacker]: 'symlink' }, { [GH]: attacker }), windows))
    .toThrow('resolve to a regular file');
});

test.each(['relative\\System32', '\\\\server\\share\\Windows\\System32', '\\Windows\\System32'])(
  'Windows refuses a non-local or unqualified native system path: %s', nativeSystemToolsDirectory => {
    expect(() => resolveTrustedGhExecutable(files({ [GH]: 'file' }), { ...windows, nativeSystemToolsDirectory })).toThrow();
  },
);

test('Windows propagates unreadable file metadata without a caller fallback', () => {
  expect(() => resolveTrustedGhExecutable({ ...files({ [GH]: 'file' }), lstat: () => { throw Error('denied metadata'); } }, windows))
    .toThrow('denied metadata');
});

const nativeWindows = process.platform === 'win32' ? test : test.skip;

// TEMPORARY DIAGNOSTIC (#664): remove before the final commit.
nativeWindows('DIAG gh --version timing by environment variant', async () => {
  const platform = await import('../../src/effects/runtime/protected-helper-platform');
  const system = nativeWindowsSystemToolsDirectory();
  const bin = resolveTrustedGhExecutable()!;
  const evil = 'C:\\repo-harness-attacker';
  let production: NodeJS.ProcessEnv | undefined;
  try {
    const contract = platform.discoverWindowsProtectedHelperContract({ env: process.env });
    production = platform.protectedHelperRuntimeEnv(platform.resolveProtectedHelperPlatform({ contract }));
  } catch (error) { console.log('DIAG production env unavailable:', String(error)); }
  const variants: Record<string, NodeJS.ProcessEnv | undefined> = {
    real: { ...process.env },
    hostileAll: { ...process.env, PATH: evil, ProgramFiles: evil, SystemRoot: evil, WINDIR: evil },
    hostileSystemRoot: { ...process.env, SystemRoot: evil },
    hostileWindir: { ...process.env, WINDIR: evil },
    hostilePath: { ...process.env, PATH: evil },
    hostileProgramFiles: { ...process.env, ProgramFiles: evil },
    production,
  };
  console.log('DIAG bin', bin, 'system', system, 'productionKeys', production ? Object.keys(production).join(',') : 'none');
  for (let round = 1; round <= 3; round++) {
    for (const [name, env] of Object.entries(variants)) {
      if (!env) continue;
      const started = performance.now();
      const result = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 12000, env });
      const elapsed = Math.round(performance.now() - started);
      console.log(`DIAG round=${round} variant=${name} ms=${elapsed} status=${result.status} signal=${result.signal} error=${result.error?.message ?? ''} stdout=${JSON.stringify((result.stdout ?? '').slice(0, 40))} stderr=${JSON.stringify((result.stderr ?? '').slice(0, 300))}`);
    }
  }
  const debugStarted = performance.now();
  const debug = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 12000,
    env: { ...process.env, PATH: evil, ProgramFiles: evil, SystemRoot: evil, WINDIR: evil, GH_DEBUG: '1' } });
  console.log(`DIAG ghdebug hostile ms=${Math.round(performance.now() - debugStarted)} status=${debug.status} stderr=${JSON.stringify((debug.stderr ?? '').slice(0, 3000))}`);
  const child = (env: NodeJS.ProcessEnv) => {
    const started = performance.now();
    const result = spawnSync(process.execPath, ['-e', '0'], { encoding: 'utf8', timeout: 12000, env });
    return `${Math.round(performance.now() - started)}ms status=${result.status}`;
  };
  console.log('DIAG bun -e 0 real', child({ ...process.env }), 'hostile', child(variants.hostileAll!));
}, 400000);

nativeWindows('native Windows executes the preinstalled fixed gh with hostile caller environment', () => {
  const module = fileURLToPath(new URL('../../src/effects/runtime/protected-helper-platform.ts', import.meta.url));
  const code = `import {resolveTrustedGhExecutable} from ${JSON.stringify(module)};
import {spawnSync} from 'node:child_process';
const bin=resolveTrustedGhExecutable();
if(!bin) throw Error('fixed standard GitHub CLI installation unavailable');
const result=spawnSync(bin,['--version'],{encoding:'utf8',timeout:10000});
console.log(JSON.stringify({bin,status:result.status,stdout:result.stdout,stderr:result.stderr}));`;
  const child = spawnSync(process.execPath, ['-e', code], {
    encoding: 'utf8', timeout: 20000,
    env: { ...process.env, PATH: 'C:\\repo-harness-attacker',
      GH_BIN: 'C:\\repo-harness-attacker\\gh.exe', REPO_HARNESS_GH_BIN: 'C:\\repo-harness-attacker\\gh.exe',
      ProgramFiles: 'C:\\repo-harness-attacker', SystemRoot: 'C:\\repo-harness-attacker', WINDIR: 'C:\\repo-harness-attacker' },
  });
  expect(child.status, child.stderr).toBe(0);
  const observed = JSON.parse(child.stdout);
  const expected = win32.join(win32.parse(nativeWindowsSystemToolsDirectory()).root, 'Program Files', 'GitHub CLI', 'gh.exe');
  expect(observed.bin.toLowerCase()).toBe(expected.toLowerCase());
  expect(observed.status, observed.stderr).toBe(0);
  expect(observed.stdout).toMatch(/^gh version /);
});
