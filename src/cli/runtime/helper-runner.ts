import { existsSync, lstatSync, readFileSync, realpathSync } from 'fs';
import { dirname, extname, isAbsolute, join, resolve } from 'path';
import { userInfo } from 'os';
import { fileURLToPath } from 'url';
import { runProcess as runBoundedProcess } from '../../effects/process-runner';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const PACKAGE_HELPERS_ROOT = join(PACKAGE_ROOT, 'assets', 'templates', 'helpers');
const PACKAGE_CONTRACT = join(PACKAGE_ROOT, 'assets', 'workflow-contract.v1.json');
const PACKAGE_WORKFLOW_STATE = join(PACKAGE_ROOT, 'assets', 'hooks', 'lib', 'workflow-state.sh');
const PROTECTED_HELPERS = new Set(['contract-worktree', 'ship-worktrees', 'merge-gate']);

function fixedSystemExecutable(label: string, candidates: readonly string[]): string {
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const stat = lstatSync(candidate);
    if (!stat.isSymbolicLink() && stat.isFile() && (stat.mode & 0o111) !== 0) return candidate;
  }
  throw new Error(`required system executable is unavailable: ${label}`);
}

function systemBash(): string {
  return fixedSystemExecutable('bash', ['/bin/bash']);
}

function systemGit(): string {
  return fixedSystemExecutable('git', ['/usr/bin/git', '/bin/git']);
}

function optionalHostExecutable(candidates: readonly string[]): string | undefined {
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const actual = realpathSync(candidate);
    const stat = lstatSync(actual);
    if (stat.isFile() && (stat.mode & 0o111) !== 0) return actual;
  }
  return undefined;
}

const HOST_GH = optionalHostExecutable([
  '/opt/homebrew/bin/gh',
  '/usr/local/bin/gh',
  '/usr/bin/gh',
  '/home/linuxbrew/.linuxbrew/bin/gh',
]);

function protectedPath(): string {
  return [...new Set([
    dirname(process.execPath),
    ...(HOST_GH ? [dirname(HOST_GH)] : []),
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ])].join(':');
}

function copyAllowedEnv(source: NodeJS.ProcessEnv, target: NodeJS.ProcessEnv, keys: readonly string[]): void {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) target[key] = value;
  }
}

function protectedChildEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const account = userInfo();
  const env: NodeJS.ProcessEnv = {
    HOME: account.homedir,
    USER: account.username,
    LOGNAME: account.username,
    PATH: protectedPath(),
    TMPDIR: '/tmp',
  };
  copyAllowedEnv(source, env, [
    'LANG',
    'LC_ALL',
    'TERM',
    'CI',
    'NO_COLOR',
    'FORCE_COLOR',
    'HOOK_HOST',
  ]);
  return env;
}

export type HelperSource = 'source' | 'package';

export interface ResolvedHelper {
  id: string;
  fileName: string;
  path: string;
  source: HelperSource;
  repoRoot: string;
}

export interface RunHelperOptions {
  helper: string;
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: 'inherit' | 'pipe' | 'ignore';
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface RunHelperResult {
  exitCode: number;
  reason: 'missing-helper' | 'spawn-error' | 'timeout' | 'ok';
  helper: string;
  resolved?: ResolvedHelper;
  stdout?: string;
  stderr?: string;
}

export interface HelperDescriptor {
  id: string;
  description: string;
}

function helperId(fileName: string): string {
  const ext = extname(fileName);
  return ext ? fileName.slice(0, -ext.length) : fileName;
}

type HelperRuntime = {
  contractPath: string;
  helpersRoot: string;
  source: HelperSource;
};

function helperContractError(contractPath: string, detail: string): Error {
  return new Error(`invalid helper contract at ${contractPath}: ${detail}`);
}

function readContractHelpers(contractPath: string): string[] {
  let source: string;
  try {
    source = readFileSync(contractPath, 'utf-8');
  } catch {
    throw new Error(`helper contract not found: ${contractPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw helperContractError(contractPath, `malformed JSON: ${message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw helperContractError(contractPath, 'root must be an object');
  }
  const helpers = (parsed as { helpers?: unknown }).helpers;
  if (typeof helpers !== 'object' || helpers === null || Array.isArray(helpers)) {
    throw helperContractError(contractPath, 'helpers must be an object');
  }
  const scripts = (helpers as { scripts?: unknown }).scripts;
  if (!Array.isArray(scripts) || scripts.length === 0) {
    throw helperContractError(contractPath, 'helpers.scripts must be a non-empty array');
  }

  const fileNames = new Set<string>();
  const ids = new Set<string>();
  for (const entry of scripts) {
    if (
      typeof entry !== 'string' ||
      entry.length === 0 ||
      entry.includes('/') ||
      entry.includes('\\') ||
      !['.sh', '.ts'].includes(extname(entry))
    ) {
      throw helperContractError(contractPath, `helpers.scripts contains unsafe helper name ${JSON.stringify(entry)}`);
    }
    if (fileNames.has(entry)) {
      throw helperContractError(contractPath, `duplicate helper file ${JSON.stringify(entry)}`);
    }
    fileNames.add(entry);

    const id = helperId(entry);
    if (!id) {
      throw helperContractError(contractPath, `helpers.scripts contains empty helper id ${JSON.stringify(entry)}`);
    }
    if (ids.has(id)) {
      throw helperContractError(contractPath, `duplicate helper id ${JSON.stringify(id)}`);
    }
    ids.add(id);
  }

  return [...fileNames];
}

function readContractHelperDescriptions(
  contractPath: string,
  fileNames: readonly string[],
): Record<string, string> {
  let source: string;
  try {
    source = readFileSync(contractPath, 'utf-8');
  } catch {
    throw new Error(`helper contract not found: ${contractPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw helperContractError(contractPath, `malformed JSON: ${message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw helperContractError(contractPath, 'root must be an object');
  }
  const helpers = (parsed as { helpers?: unknown }).helpers;
  if (typeof helpers !== 'object' || helpers === null || Array.isArray(helpers)) {
    throw helperContractError(contractPath, 'helpers must be an object');
  }
  const descriptions = (helpers as { descriptions?: unknown }).descriptions;
  if (typeof descriptions !== 'object' || descriptions === null || Array.isArray(descriptions)) {
    throw helperContractError(contractPath, 'helpers.descriptions must be an object');
  }

  const ids = fileNames.map(helperId);
  const idSet = new Set(ids);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(descriptions as Record<string, unknown>)) {
    if (!idSet.has(key)) {
      throw helperContractError(contractPath, `helpers.descriptions has unknown helper id ${JSON.stringify(key)}`);
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw helperContractError(contractPath, `helpers.descriptions.${key} must be a non-empty string`);
    }
    result[key] = value;
  }

  for (const id of ids) {
    if (!(id in result)) {
      throw helperContractError(contractPath, `helpers.descriptions is missing entry for helper id ${JSON.stringify(id)}`);
    }
  }

  return result;
}

function isProtectedHelper(helper: string): boolean {
  return PROTECTED_HELPERS.has(helperId(helper));
}

function resolveHelperRuntime(env: NodeJS.ProcessEnv, allowSourceOverride = true): HelperRuntime {
  const sourceRoot = env.REPO_HARNESS_SOURCE_ROOT?.trim();
  if (sourceRoot && allowSourceOverride) {
    if (!isAbsolute(sourceRoot)) {
      throw new Error('REPO_HARNESS_SOURCE_ROOT must be an absolute path');
    }
    return {
      contractPath: join(sourceRoot, 'assets', 'workflow-contract.v1.json'),
      helpersRoot: join(sourceRoot, 'scripts'),
      source: 'source',
    };
  }

  return {
    contractPath: PACKAGE_CONTRACT,
    helpersRoot: PACKAGE_HELPERS_ROOT,
    source: 'package',
  };
}

export function listHelperFiles(env: NodeJS.ProcessEnv = process.env): string[] {
  const runtime = resolveHelperRuntime(env);
  return readContractHelpers(runtime.contractPath);
}

export function listHelperIds(env: NodeJS.ProcessEnv = process.env): string[] {
  return listHelperFiles(env).map(helperId);
}

export function listHelpers(env: NodeJS.ProcessEnv = process.env): HelperDescriptor[] {
  const runtime = resolveHelperRuntime(env);
  const fileNames = readContractHelpers(runtime.contractPath);
  const descriptions = readContractHelperDescriptions(runtime.contractPath, fileNames);
  return fileNames.map((fileName) => {
    const id = helperId(fileName);
    return { id, description: descriptions[id] };
  });
}

function resolveHelperFileName(helper: string, files: readonly string[]): string | null {
  if (extname(helper)) return files.includes(helper) ? helper : null;
  return files.find((fileName) => helperId(fileName) === helper) ?? null;
}

function resolveRepoRoot(cwd: string, env: NodeJS.ProcessEnv, protectedHelper: boolean): string {
  const result = runBoundedProcess(protectedHelper ? systemGit() : 'git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
    env: protectedHelper ? protectedChildEnv(env) : env,
    inheritEnv: !protectedHelper,
    timeoutMs: 5000,
  });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : cwd;
}

function resolveFromDir(
  fileName: string,
  dir: string,
  source: HelperSource,
  repoRoot: string,
): ResolvedHelper {
  const filePath = join(dir, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`contract helper is missing from ${source} runtime: ${filePath}`);
  }
  const stat = lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`contract helper is not a regular file: ${filePath}`);
  }
  return { id: helperId(fileName), fileName, path: filePath, source, repoRoot };
}

export function resolveHelper(helper: string, cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): ResolvedHelper | null {
  const protectedHelper = isProtectedHelper(helper);
  const repoRoot = resolveRepoRoot(cwd, env, protectedHelper);
  const runtime = resolveHelperRuntime(env, !protectedHelper);
  const fileName = resolveHelperFileName(helper, readContractHelpers(runtime.contractPath));
  if (!fileName) return null;

  return resolveFromDir(fileName, runtime.helpersRoot, runtime.source, repoRoot);
}

export function runHelper(opts: RunHelperOptions): RunHelperResult {
  const cwd = opts.cwd ?? process.cwd();
  const env = { ...process.env, ...(opts.env ?? {}) };
  const resolved = resolveHelper(opts.helper, cwd, env);
  if (!resolved) {
    return {
      exitCode: 2,
      reason: 'missing-helper',
      helper: opts.helper,
      stderr: `repo-harness run: unknown helper "${opts.helper}"`,
    };
  }

  const args = [...(opts.args ?? [])];
  const protectedHelper = isProtectedHelper(opts.helper);
  const trustedBash = protectedHelper ? systemBash() : 'bash';
  const trustedGit = protectedHelper ? systemGit() : 'git';
  const command = resolved.fileName.endsWith('.sh') ? trustedBash : process.execPath;
  const childEnv: NodeJS.ProcessEnv = {
    ...(protectedHelper ? protectedChildEnv(env) : env),
    REPO_HARNESS_HELPER_SOURCE_PATH: resolved.path,
    REPO_HARNESS_TARGET_REPO_ROOT: resolved.repoRoot,
  };
  if (protectedHelper) {
    childEnv.REPO_HARNESS_BASH_BIN = trustedBash;
    childEnv.REPO_HARNESS_GIT_BIN = trustedGit;
    childEnv.REPO_HARNESS_BUN_BIN = process.execPath;
    childEnv.REPO_HARNESS_WORKFLOW_STATE_LIB = resolveFromDir(
      'workflow-state.sh',
      dirname(PACKAGE_WORKFLOW_STATE),
      'package',
      resolved.repoRoot,
    ).path;
    if (HOST_GH) childEnv.REPO_HARNESS_GH_BIN = HOST_GH;
    else delete childEnv.REPO_HARNESS_GH_BIN;
  }
  const child = runBoundedProcess(command, [resolved.path, ...args], {
    cwd: resolved.repoRoot,
    env: childEnv,
    inheritEnv: !protectedHelper,
    stdio: opts.stdio ?? 'inherit',
    timeoutMs: opts.timeoutMs,
    maxOutputBytes: opts.maxOutputBytes,
  });

  if (child.error) {
    return {
      exitCode: 1,
      reason: child.timedOut ? 'timeout' : 'spawn-error',
      helper: opts.helper,
      resolved,
      stderr: child.stderr || child.error,
    };
  }

  return {
    exitCode: child.status ?? 1,
    reason: 'ok',
    helper: opts.helper,
    resolved,
    stdout: child.stdout || undefined,
    stderr: child.stderr || undefined,
  };
}
