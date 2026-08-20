import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
  type Stats,
} from 'fs';
import { userInfo } from 'os';
import { dirname, isAbsolute, join, win32 } from 'path';
import { dlopen, FFIType, ptr } from 'bun:ffi';

export const WINDOWS_PROTECTED_HELPER_CONFIG_KEY = 'protectedHelperRuntime';

export function windowsProtectedHelperConfigPath(home = userInfo().homedir): string {
  return join(home, '.repo-harness', 'config.json');
}

export interface WindowsProtectedHelperContract {
  protocol: 1;
  platform: 'win32';
  distribution: 'git-for-windows';
  git_root: string;
  git_bin: string;
  bash_bin: string;
  posix_tools_dir: string;
  system_tools_dir: string;
  temp_dir: string;
}

export interface ProtectedHelperPlatform {
  platform: NodeJS.Platform;
  accountHome: string;
  accountUsername: string;
  gitBin: string;
  bashBin: string;
  bunExecutable: string;
  taskkillBin?: string;
  pathEntries: readonly string[];
  pathDelimiter: ':' | ';';
  tempDir: string;
  systemRoot?: string;
}

export interface ProtectedHelperFileAccess {
  exists(path: string): boolean;
  lstat(path: string): Stats;
  realpath(path: string): string;
  readFile(path: string): string;
}

const DEFAULT_FILE_ACCESS: ProtectedHelperFileAccess = {
  exists: existsSync,
  lstat: lstatSync,
  realpath: realpathSync,
  readFile: (path) => readFileSync(path, 'utf-8'),
};

type ResolveOptions = {
  platform?: NodeJS.Platform;
  accountHome?: string;
  accountUsername?: string;
  bunExecutable?: string;
  configPath?: string;
  contract?: WindowsProtectedHelperContract;
  fileAccess?: ProtectedHelperFileAccess;
  nativeSystemToolsDirectory?: string;
  nativeTempDirectory?: string;
};

type DiscoverOptions = {
  env?: NodeJS.ProcessEnv;
  fileAccess?: ProtectedHelperFileAccess;
  nativeSystemToolsDirectory?: string;
  nativeTempDirectory?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  const unknown = actual.filter((key) => !wanted.includes(key));
  const missing = wanted.filter((key) => !actual.includes(key));
  if (unknown.length > 0) throw new Error(`${label} contains unknown field: ${unknown.join(', ')}`);
  if (missing.length > 0) throw new Error(`${label} is missing field: ${missing.join(', ')}`);
}

function requireWindowsAbsolute(value: unknown, label: string): string {
  if (typeof value !== 'string' || !win32.isAbsolute(value)) {
    throw new Error(`Windows protected-helper ${label} must be an absolute Windows path`);
  }
  return win32.normalize(value);
}

function requireRegularFile(path: string, label: string, access: ProtectedHelperFileAccess): string {
  if (!access.exists(path)) throw new Error(`Windows protected-helper ${label} is missing: ${path}`);
  const source = access.lstat(path);
  if (source.isSymbolicLink() || !source.isFile()) {
    throw new Error(`Windows protected-helper ${label} must be a non-symlink regular file: ${path}`);
  }
  const actual = access.realpath(path);
  const target = access.lstat(actual);
  if (target.isSymbolicLink() || !target.isFile()) {
    throw new Error(`Windows protected-helper ${label} must resolve to a regular file: ${path}`);
  }
  return win32.normalize(actual);
}

function requireDirectory(path: string, label: string, access: ProtectedHelperFileAccess): string {
  if (!access.exists(path)) throw new Error(`Windows protected-helper ${label} is missing: ${path}`);
  const source = access.lstat(path);
  if (source.isSymbolicLink() || !source.isDirectory()) {
    throw new Error(`Windows protected-helper ${label} must be a non-symlink directory: ${path}`);
  }
  const actual = access.realpath(path);
  const target = access.lstat(actual);
  if (target.isSymbolicLink() || !target.isDirectory()) {
    throw new Error(`Windows protected-helper ${label} must resolve to a directory: ${path}`);
  }
  return win32.normalize(actual);
}

function sameWindowsPath(left: string, right: string): boolean {
  return win32.normalize(left).toLowerCase() === win32.normalize(right).toLowerCase();
}

function pathInsideWindowsRoot(path: string, root: string): boolean {
  const relative = win32.relative(root, path);
  return relative === '' || (!relative.startsWith('..') && !win32.isAbsolute(relative));
}

export function nativeWindowsSystemToolsDirectory(): string {
  if (process.platform !== 'win32') {
    throw new Error('native Windows system directory is unavailable on this platform');
  }
  const kernel32 = dlopen('kernel32.dll', {
    GetSystemDirectoryW: {
      args: [FFIType.ptr, FFIType.u32],
      returns: FFIType.u32,
    },
  });
  try {
    const buffer = new Uint16Array(32_768);
    const length = kernel32.symbols.GetSystemDirectoryW(ptr(buffer), buffer.length);
    if (!Number.isSafeInteger(length) || length < 1 || length >= buffer.length) {
      throw new Error('GetSystemDirectoryW did not return a usable native system directory');
    }
    return win32.normalize(Buffer.from(buffer.buffer, 0, length * 2).toString('utf16le'));
  } finally {
    kernel32.close();
  }
}

export function validateWindowsProtectedHelperContract(
  raw: unknown,
  access: ProtectedHelperFileAccess = DEFAULT_FILE_ACCESS,
  nativeSystemToolsDirectory?: string,
  nativeTempDirectory?: string,
): WindowsProtectedHelperContract {
  if (!isRecord(raw)) throw new Error('Windows protected-helper contract must be an object');
  exactKeys(raw, [
    'protocol',
    'platform',
    'distribution',
    'git_root',
    'git_bin',
    'bash_bin',
    'posix_tools_dir',
    'system_tools_dir',
    'temp_dir',
  ], 'Windows protected-helper contract');
  if (raw.protocol !== 1) throw new Error('Windows protected-helper contract protocol must be 1');
  if (raw.platform !== 'win32') throw new Error('Windows protected-helper contract platform must be win32');
  if (raw.distribution !== 'git-for-windows') {
    throw new Error('Windows protected-helper contract distribution must be git-for-windows');
  }

  const requestedRoot = requireWindowsAbsolute(raw.git_root, 'git_root');
  const requestedGit = requireWindowsAbsolute(raw.git_bin, 'git_bin');
  const requestedBash = requireWindowsAbsolute(raw.bash_bin, 'bash_bin');
  const requestedPosixTools = requireWindowsAbsolute(raw.posix_tools_dir, 'posix_tools_dir');
  const requestedSystemTools = requireWindowsAbsolute(raw.system_tools_dir, 'system_tools_dir');
  const requestedTemp = requireWindowsAbsolute(raw.temp_dir, 'temp_dir');
  const gitRoot = requireDirectory(requestedRoot, 'git_root', access);
  const gitBin = requireRegularFile(requestedGit, 'git_bin', access);
  const bashBin = requireRegularFile(requestedBash, 'bash_bin', access);
  const posixToolsDir = requireDirectory(requestedPosixTools, 'posix_tools_dir', access);
  const systemToolsDir = requireDirectory(requestedSystemTools, 'system_tools_dir', access);
  const tempDir = requireDirectory(requestedTemp, 'temp_dir', access);
  requireRegularFile(win32.join(systemToolsDir, 'taskkill.exe'), 'taskkill.exe', access);

  for (const [label, path] of [
    ['git_bin', gitBin],
    ['bash_bin', bashBin],
    ['posix_tools_dir', posixToolsDir],
  ] as const) {
    if (!pathInsideWindowsRoot(path, gitRoot)) {
      throw new Error(`Windows protected-helper ${label} must stay inside the Git-for-Windows root`);
    }
  }
  if (!sameWindowsPath(bashBin, win32.join(gitRoot, 'bin', 'bash.exe'))) {
    throw new Error('Windows protected-helper bash_bin must be Git-for-Windows bin\\bash.exe');
  }
  if (!sameWindowsPath(posixToolsDir, win32.join(gitRoot, 'usr', 'bin'))) {
    throw new Error('Windows protected-helper posix_tools_dir must be Git-for-Windows usr\\bin');
  }
  const gitRelative = win32.relative(gitRoot, gitBin).toLowerCase();
  if (gitRelative !== 'cmd\\git.exe' && gitRelative !== 'bin\\git.exe') {
    throw new Error('Windows protected-helper git_bin must be Git-for-Windows cmd\\git.exe or bin\\git.exe');
  }
  if (pathInsideWindowsRoot(systemToolsDir, gitRoot)) {
    throw new Error('Windows protected-helper system_tools_dir must stay outside the Git-for-Windows root');
  }
  if (win32.basename(systemToolsDir).toLowerCase() !== 'system32') {
    throw new Error('Windows protected-helper system_tools_dir must be the native System32 directory');
  }
  if (nativeSystemToolsDirectory !== undefined) {
    const expectedSystemTools = requireDirectory(
      requireWindowsAbsolute(nativeSystemToolsDirectory, 'native system directory'),
      'native system directory',
      access,
    );
    if (!sameWindowsPath(systemToolsDir, expectedSystemTools)) {
      throw new Error('Windows protected-helper system_tools_dir does not match the OS native system directory');
    }
  }
  if (nativeTempDirectory !== undefined) {
    const expectedTemp = requireDirectory(
      requireWindowsAbsolute(nativeTempDirectory, 'native temp directory'),
      'native temp directory',
      access,
    );
    if (!sameWindowsPath(tempDir, expectedTemp)) {
      throw new Error('Windows protected-helper temp_dir does not match the OS account temp directory');
    }
  }

  return {
    protocol: 1,
    platform: 'win32',
    distribution: 'git-for-windows',
    git_root: gitRoot,
    git_bin: gitBin,
    bash_bin: bashBin,
    posix_tools_dir: posixToolsDir,
    system_tools_dir: systemToolsDir,
    temp_dir: tempDir,
  };
}

function readWindowsContract(
  configPath: string,
  access: ProtectedHelperFileAccess,
  nativeSystemToolsDirectory: string,
  nativeTempDirectory?: string,
): WindowsProtectedHelperContract {
  if (!access.exists(configPath)) {
    throw new Error(`Windows protected-helper platform contract is missing: ${configPath}; run repo-harness install or repo-harness update`);
  }
  const configDirectory = win32.dirname(configPath);
  const parent = access.lstat(configDirectory);
  if (parent.isSymbolicLink() || !parent.isDirectory()) {
    throw new Error(`Windows protected-helper config directory must be a non-symlink directory: ${configDirectory}`);
  }
  const source = access.lstat(configPath);
  if (source.isSymbolicLink() || !source.isFile()) {
    throw new Error(`Windows protected-helper config must be a non-symlink regular file: ${configPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(access.readFile(access.realpath(configPath)));
  } catch (error) {
    throw new Error(`Windows protected-helper config is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(parsed)) throw new Error('Windows protected-helper config root must be an object');
  if (!(WINDOWS_PROTECTED_HELPER_CONFIG_KEY in parsed)) {
    throw new Error(`Windows protected-helper platform contract is missing from ${configPath}; run repo-harness install or repo-harness update`);
  }
  return validateWindowsProtectedHelperContract(
    parsed[WINDOWS_PROTECTED_HELPER_CONFIG_KEY],
    access,
    nativeSystemToolsDirectory,
    nativeTempDirectory,
  );
}

function fixedPosixExecutable(label: string, candidates: readonly string[], access: ProtectedHelperFileAccess): string {
  for (const candidate of candidates) {
    if (!isAbsolute(candidate) || !access.exists(candidate)) continue;
    const stat = access.lstat(candidate);
    if (!stat.isSymbolicLink() && stat.isFile() && (stat.mode & 0o111) !== 0) return access.realpath(candidate);
  }
  throw new Error(`required system executable is unavailable: ${label}`);
}

export function resolveProtectedHelperPlatform(options: ResolveOptions = {}): ProtectedHelperPlatform {
  const platform = options.platform ?? process.platform;
  const access = options.fileAccess ?? DEFAULT_FILE_ACCESS;
  const account = userInfo();
  const accountHome = options.accountHome ?? account.homedir;
  const accountUsername = options.accountUsername ?? account.username;
  const bunExecutable = options.bunExecutable ?? process.execPath;
  if (platform !== 'win32') {
    const gitBin = fixedPosixExecutable('git', ['/usr/bin/git', '/bin/git'], access);
    const bashBin = fixedPosixExecutable('bash', ['/bin/bash'], access);
    return {
      platform,
      accountHome,
      accountUsername,
      gitBin,
      bashBin,
      bunExecutable,
      pathEntries: [dirname(bunExecutable), '/usr/bin', '/bin', '/usr/sbin', '/sbin'],
      pathDelimiter: ':',
      tempDir: '/tmp',
    };
  }

  const configPath = options.configPath ?? win32.join(accountHome, '.repo-harness', 'config.json');
  const nativeSystemTools = options.nativeSystemToolsDirectory ?? nativeWindowsSystemToolsDirectory();
  const contract = options.contract
    ? validateWindowsProtectedHelperContract(options.contract, access, nativeSystemTools, options.nativeTempDirectory)
    : readWindowsContract(configPath, access, nativeSystemTools, options.nativeTempDirectory);
  const optionalMingw = win32.join(contract.git_root, 'mingw64', 'bin');
  const mingwEntries = access.exists(optionalMingw)
    ? [requireDirectory(optionalMingw, 'mingw64 tools directory', access)]
    : [];
  const pathEntries = [
    win32.dirname(contract.git_bin),
    win32.dirname(contract.bash_bin),
    contract.posix_tools_dir,
    ...mingwEntries,
    win32.dirname(bunExecutable),
    contract.system_tools_dir,
  ];
  return {
    platform,
    accountHome,
    accountUsername,
    gitBin: contract.git_bin,
    bashBin: contract.bash_bin,
    bunExecutable,
    taskkillBin: win32.join(contract.system_tools_dir, 'taskkill.exe'),
    pathEntries: [...new Map(pathEntries.map((entry) => [win32.normalize(entry).toLowerCase(), entry])).values()],
    pathDelimiter: ';',
    tempDir: contract.temp_dir,
    systemRoot: win32.dirname(contract.system_tools_dir),
  };
}

function executableFromPath(name: string, env: NodeJS.ProcessEnv, access: ProtectedHelperFileAccess): string {
  const path = env.PATH ?? '';
  for (const rawDirectory of path.split(';').filter(Boolean)) {
    const directory = rawDirectory.replace(/^"(.*)"$/, '$1');
    const candidate = win32.join(directory, `${name}.exe`);
    if (!access.exists(candidate)) continue;
    const stat = access.lstat(candidate);
    if (stat.isSymbolicLink() || !stat.isFile()) continue;
    return access.realpath(candidate);
  }
  throw new Error(`Windows protected-helper install could not resolve ${name}.exe from the trusted install PATH`);
}

export function discoverWindowsProtectedHelperContract(options: DiscoverOptions = {}): WindowsProtectedHelperContract {
  const env = options.env ?? process.env;
  const access = options.fileAccess ?? DEFAULT_FILE_ACCESS;
  const gitBin = executableFromPath('git', env, access);
  const gitParent = win32.basename(win32.dirname(gitBin)).toLowerCase();
  if (gitParent !== 'cmd' && gitParent !== 'bin') {
    throw new Error(`Windows protected-helper install requires Git for Windows cmd\\git.exe or bin\\git.exe (found ${gitBin})`);
  }
  const gitRoot = win32.dirname(win32.dirname(gitBin));
  const nativeSystemTools = options.nativeSystemToolsDirectory ?? nativeWindowsSystemToolsDirectory();
  const requestedTemp = options.nativeTempDirectory ?? env.TEMP?.trim();
  if (!requestedTemp) {
    throw new Error('Windows protected-helper install requires an absolute TEMP directory');
  }
  const nativeTemp = requireDirectory(
    requireWindowsAbsolute(requestedTemp, 'native temp directory'),
    'native temp directory',
    access,
  );
  const taskkill = executableFromPath('taskkill', env, access);
  if (!sameWindowsPath(taskkill, win32.join(nativeSystemTools, 'taskkill.exe'))) {
    throw new Error('Windows protected-helper install requires PATH taskkill.exe to come from native System32');
  }
  return validateWindowsProtectedHelperContract({
    protocol: 1,
    platform: 'win32',
    distribution: 'git-for-windows',
    git_root: gitRoot,
    git_bin: gitBin,
    bash_bin: win32.join(gitRoot, 'bin', 'bash.exe'),
    posix_tools_dir: win32.join(gitRoot, 'usr', 'bin'),
    system_tools_dir: nativeSystemTools,
    temp_dir: nativeTemp,
  }, access, nativeSystemTools, nativeTemp);
}

export function protectedHelperRuntimeEnv(runtime: ProtectedHelperPlatform): NodeJS.ProcessEnv {
  return {
    HOME: runtime.accountHome,
    USER: runtime.accountUsername,
    LOGNAME: runtime.accountUsername,
    ...(runtime.platform === 'win32' ? {
      OS: 'Windows_NT',
      USERPROFILE: runtime.accountHome,
      USERNAME: runtime.accountUsername,
      SystemRoot: runtime.systemRoot,
      WINDIR: runtime.systemRoot,
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
      TEMP: runtime.tempDir,
      TMP: runtime.tempDir,
    } : {}),
    PATH: runtime.pathEntries.join(runtime.pathDelimiter),
    TMPDIR: runtime.tempDir,
    REPO_HARNESS_BASH_BIN: runtime.bashBin,
    REPO_HARNESS_GIT_BIN: runtime.gitBin,
    REPO_HARNESS_BUN_BIN: runtime.bunExecutable,
    REPO_HARNESS_PROTECTED_PATH: runtime.pathEntries.join(runtime.pathDelimiter),
    REPO_HARNESS_PROTECTED_TMPDIR: runtime.tempDir,
  };
}

export function writeWindowsProtectedHelperContract(
  contract: WindowsProtectedHelperContract,
  home = userInfo().homedir,
): { path: string; changed: boolean } {
  const configPath = windowsProtectedHelperConfigPath(home);
  const configDirectory = dirname(configPath);
  let current: Record<string, unknown> = {};
  if (existsSync(configDirectory)) {
    const stat = lstatSync(configDirectory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`repo-harness user config directory must be a non-symlink directory: ${configDirectory}`);
    }
  }
  if (existsSync(configPath)) {
    const stat = lstatSync(configPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`repo-harness user config must be a non-symlink regular file: ${configPath}`);
    }
    const parsed = JSON.parse(readFileSync(realpathSync(configPath), 'utf-8')) as unknown;
    if (!isRecord(parsed)) throw new Error(`repo-harness user config root must be an object: ${configPath}`);
    current = parsed;
  }
  const previous = current[WINDOWS_PROTECTED_HELPER_CONFIG_KEY];
  if (JSON.stringify(previous) === JSON.stringify(contract)) return { path: configPath, changed: false };
  mkdirSync(configDirectory, { recursive: true });
  const temporary = `${configPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify({ ...current, [WINDOWS_PROTECTED_HELPER_CONFIG_KEY]: contract }, null, 2)}\n`, {
      encoding: 'utf-8',
      mode: 0o600,
    });
    chmodSync(temporary, 0o600);
    renameSync(temporary, configPath);
  } finally {
    rmSync(temporary, { force: true });
  }
  return { path: configPath, changed: true };
}
