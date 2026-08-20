import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, type Stats } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  discoverWindowsProtectedHelperContract,
  resolveProtectedHelperPlatform,
  validateWindowsProtectedHelperContract,
  writeWindowsProtectedHelperContract,
  type ProtectedHelperFileAccess,
  type WindowsProtectedHelperContract,
} from '../../src/cli/runtime/protected-helper-platform';
import { protectedChildEnv } from '../../src/cli/runtime/helper-runner';

const GIT_ROOT = 'C:\\Program Files\\Git';
const CONTRACT: WindowsProtectedHelperContract = {
  protocol: 1,
  platform: 'win32',
  distribution: 'git-for-windows',
  git_root: GIT_ROOT,
  git_bin: `${GIT_ROOT}\\cmd\\git.exe`,
  bash_bin: `${GIT_ROOT}\\bin\\bash.exe`,
  posix_tools_dir: `${GIT_ROOT}\\usr\\bin`,
  system_tools_dir: 'C:\\Windows\\System32',
};

type FakePathKind = 'file' | 'directory' | 'symlink' | 'missing';

function fakeStats(kind: FakePathKind): Stats {
  return {
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'directory',
    isSymbolicLink: () => kind === 'symlink',
  } as Stats;
}

function access(overrides: Record<string, FakePathKind> = {}): ProtectedHelperFileAccess {
  const entries: Array<[string, FakePathKind]> = [
    [CONTRACT.git_root, 'directory'],
    [CONTRACT.git_bin, 'file'],
    [CONTRACT.bash_bin, 'file'],
    [CONTRACT.posix_tools_dir, 'directory'],
    [CONTRACT.system_tools_dir, 'directory'],
    [`${CONTRACT.system_tools_dir}\\taskkill.exe`, 'file'],
    ...Object.entries(overrides),
  ];
  const kinds = new Map(entries.map(([path, kind]) => [path.toLowerCase(), kind] as const));
  return {
    exists: (path) => (kinds.get(path.toLowerCase()) ?? 'missing') !== 'missing',
    lstat: (path) => fakeStats(kinds.get(path.toLowerCase()) ?? 'missing'),
    realpath: (path) => path,
    readFile: () => {
      throw new Error('not used');
    },
  };
}

describe('Windows protected-helper platform contract', () => {
  test('binds Git, Bash, and POSIX tools to one Git-for-Windows root', () => {
    expect(validateWindowsProtectedHelperContract(CONTRACT, access())).toEqual(CONTRACT);

    const runtime = resolveProtectedHelperPlatform({
      platform: 'win32',
      accountHome: 'C:\\Users\\Ada',
      bunExecutable: 'C:\\Users\\Ada\\.bun\\bin\\bun.exe',
      contract: CONTRACT,
      fileAccess: access(),
    });
    expect(runtime.pathDelimiter).toBe(';');
    expect(runtime.pathEntries).toContain(`${GIT_ROOT}\\usr\\bin`);
    expect(runtime.pathEntries).toContain('C:\\Windows\\System32');
    expect(runtime.tempDir).toBe('C:\\Users\\Ada\\AppData\\Local\\Temp');
    expect(runtime.systemRoot).toBe('C:\\Windows');
    expect(runtime.taskkillBin).toBe('C:\\Windows\\System32\\taskkill.exe');
    expect(runtime.pathEntries.indexOf(`${GIT_ROOT}\\cmd`)).toBeLessThan(
      runtime.pathEntries.indexOf('C:\\Users\\Ada\\.bun\\bin'),
    );
  });

  test('rejects cross-installation, symlinked, and extended contracts', () => {
    expect(() => validateWindowsProtectedHelperContract({
      ...CONTRACT,
      bash_bin: 'D:\\Tools\\Git\\bin\\bash.exe',
    }, access({ 'D:\\Tools\\Git\\bin\\bash.exe': 'file' }))).toThrow('Git-for-Windows root');

    expect(() => validateWindowsProtectedHelperContract(CONTRACT, access({
      [CONTRACT.bash_bin]: 'symlink',
    }))).toThrow('regular file');

    expect(() => validateWindowsProtectedHelperContract({ ...CONTRACT, fallback: 'PATH' }, access())).toThrow('unknown field');
  });

  test('sanitized child environment ignores caller binary and path overrides', () => {
    const runtime = resolveProtectedHelperPlatform({
      platform: 'win32',
      accountHome: 'C:\\Users\\Ada',
      bunExecutable: 'C:\\Users\\Ada\\.bun\\bin\\bun.exe',
      contract: CONTRACT,
      fileAccess: access(),
    });
    const env = protectedChildEnv({
      PATH: 'C:\\attacker',
      HOME: 'C:\\attacker-home',
      REPO_HARNESS_GIT_BIN: 'C:\\attacker\\git.exe',
      REPO_HARNESS_BASH_BIN: 'C:\\attacker\\bash.exe',
      BASH_ENV: 'C:\\attacker\\inject.sh',
      LANG: 'en_US.UTF-8',
    }, runtime);

    expect(env.PATH).not.toContain('attacker');
    expect(env.HOME).toBe('C:\\Users\\Ada');
    expect(env.REPO_HARNESS_GIT_BIN).toBe(CONTRACT.git_bin);
    expect(env.REPO_HARNESS_BASH_BIN).toBe(CONTRACT.bash_bin);
    expect(env.OS).toBe('Windows_NT');
    expect(env.SystemRoot).toBe('C:\\Windows');
    expect(env.TEMP).toBe('C:\\Users\\Ada\\AppData\\Local\\Temp');
    expect(env.BASH_ENV).toBeUndefined();
    expect(env.LANG).toBe('en_US.UTF-8');
  });

  test('discovers quoted install PATH entries once and rejects stale runtime state', () => {
    const discovered = discoverWindowsProtectedHelperContract({
      env: {
        PATH: `"${GIT_ROOT}\\cmd";${CONTRACT.system_tools_dir}`,
        PATHEXT: '.EXE',
        SystemRoot: 'C:\\Windows',
        WINDIR: 'C:\\Windows',
      },
      fileAccess: access(),
    });
    expect(discovered.git_root.toLowerCase()).toBe(CONTRACT.git_root.toLowerCase());
    expect(discovered.git_bin.toLowerCase()).toBe(CONTRACT.git_bin.toLowerCase());
    expect(discovered.system_tools_dir.toLowerCase()).toBe(CONTRACT.system_tools_dir.toLowerCase());

    expect(() => discoverWindowsProtectedHelperContract({
      env: {
        PATH: `"${GIT_ROOT}\\cmd";C:\\attacker\\System32`,
        SystemRoot: 'C:\\Windows',
      },
      fileAccess: access({
        'C:\\attacker\\System32\\taskkill.exe': 'file',
      }),
    })).toThrow('native System32');

    const configPath = 'C:\\Users\\Ada\\.repo-harness\\config.json';
    const staleAccess: ProtectedHelperFileAccess = {
      ...access({
        'C:\\Users\\Ada\\.repo-harness': 'directory',
        [configPath]: 'file',
      }),
      readFile: () => JSON.stringify({ protectedHelperRuntime: { ...CONTRACT, protocol: 2 } }),
    };
    expect(() => resolveProtectedHelperPlatform({
      platform: 'win32',
      accountHome: 'C:\\Users\\Ada',
      configPath,
      fileAccess: staleAccess,
    })).toThrow('protocol must be 1');

    expect(() => resolveProtectedHelperPlatform({
      platform: 'win32',
      accountHome: 'C:\\Users\\Ada',
      configPath: 'C:\\missing\\config.json',
      fileAccess: access(),
    })).toThrow('run repo-harness install or repo-harness update');

    expect(() => resolveProtectedHelperPlatform({
      platform: 'win32',
      accountHome: 'C:\\Users\\Ada',
      configPath,
      fileAccess: {
        ...access({
          'C:\\Users\\Ada\\.repo-harness': 'symlink',
          [configPath]: 'file',
        }),
        readFile: () => JSON.stringify({ protectedHelperRuntime: CONTRACT }),
      },
    })).toThrow('config directory must be a non-symlink directory');
  });

  test('persists the contract atomically without replacing sibling user config', () => {
    const home = mkdtempSync(join(tmpdir(), 'repo-harness-windows-platform-config-'));
    const configDir = join(home, '.repo-harness');
    const configPath = join(configDir, 'config.json');
    try {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(configPath, `${JSON.stringify({ brainRoot: 'D:\\brain' })}\n`);

      expect(writeWindowsProtectedHelperContract(CONTRACT, home).changed).toBe(true);
      const persisted = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(persisted.brainRoot).toBe('D:\\brain');
      expect(persisted.protectedHelperRuntime).toEqual(CONTRACT);
      expect(writeWindowsProtectedHelperContract(CONTRACT, home).changed).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('rejects a symlinked optional mingw tool directory instead of widening PATH', () => {
    const mingw = `${GIT_ROOT}\\mingw64\\bin`;
    expect(() => resolveProtectedHelperPlatform({
      platform: 'win32',
      accountHome: 'C:\\Users\\Ada',
      contract: CONTRACT,
      fileAccess: access({ [mingw]: 'symlink' }),
    })).toThrow('non-symlink directory');
  });
});
