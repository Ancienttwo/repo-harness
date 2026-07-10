import { existsSync, lstatSync, readFileSync } from 'fs';
import { dirname, extname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { runProcess as runBoundedProcess } from '../../effects/process-runner';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const PACKAGE_HELPERS_ROOT = join(PACKAGE_ROOT, 'assets', 'templates', 'helpers');
const PACKAGE_CONTRACT = join(PACKAGE_ROOT, 'assets', 'workflow-contract.v1.json');

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

function resolveHelperRuntime(env: NodeJS.ProcessEnv): HelperRuntime {
  const sourceRoot = env.REPO_HARNESS_SOURCE_ROOT?.trim();
  if (sourceRoot) {
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

function resolveHelperFileName(helper: string, files: readonly string[]): string | null {
  if (extname(helper)) return files.includes(helper) ? helper : null;
  return files.find((fileName) => helperId(fileName) === helper) ?? null;
}

function resolveRepoRoot(cwd: string, env: NodeJS.ProcessEnv): string {
  const result = runBoundedProcess('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
    env,
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
  const repoRoot = resolveRepoRoot(cwd, env);
  const runtime = resolveHelperRuntime(env);
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
  const command = resolved.fileName.endsWith('.sh') ? 'bash' : process.execPath;
  const child = runBoundedProcess(command, [resolved.path, ...args], {
    cwd: resolved.repoRoot,
    env: {
      ...env,
      REPO_HARNESS_HELPER_SOURCE_PATH: resolved.path,
      REPO_HARNESS_TARGET_REPO_ROOT: resolved.repoRoot,
    },
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
