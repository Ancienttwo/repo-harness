import { accessSync, constants, existsSync, readFileSync, realpathSync, statSync } from 'fs';
import { delimiter, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { runProcess, type ProcessRunResult } from '../../effects/process-runner';

/**
 * Pi package lifecycle. Pi owns its settings: repo-harness changes the
 * package entry only through `pi install` and `pi remove`, never writes Pi's
 * settings, auth or trust files, and never passes `--approve`.
 */
export const PI_CODING_AGENT_PACKAGE = '@earendil-works/pi-coding-agent';
export const PI_PACKAGE_STEP = 'install Pi package';

const PI_COMMAND_TIMEOUT_MS = 60_000;
const PI_PROBE_TIMEOUT_MS = 30_000;
const PI_COMPAT_MODULE = fileURLToPath(new URL('../../pi/compat.ts', import.meta.url));

type PiEnv = NodeJS.ProcessEnv;

/** The first executable `pi` on the PATH of `env`. */
export function findPiExecutable(env: PiEnv): string | null {
  for (const directory of (env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, 'pi');
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep scanning PATH.
    }
  }
  return null;
}

/** The Pi package root: the nearest package.json above the real `pi` bin that names the Pi package. */
export function resolvePiPackageDir(piBin: string): string | null {
  let directory = dirname(realpathSync(piBin));
  for (;;) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest)) {
      try {
        if ((JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown }).name === PI_CODING_AGENT_PACKAGE) return directory;
      } catch {
        // A malformed manifest is not the Pi package; keep walking up.
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function runPi(piBin: string, args: readonly string[], env: PiEnv): ProcessRunResult {
  return runProcess(piBin, args, { env, inheritEnv: false, timeoutMs: PI_COMMAND_TIMEOUT_MS });
}

function failure(result: ProcessRunResult): string {
  return (result.stderr || result.error || result.stdout).trim() || `exit ${result.status}`;
}

export function readPiVersion(piBin: string, env: PiEnv): string | null {
  const result = runPi(piBin, ['--version'], env);
  const version = result.stdout.trim();
  return result.ok && version ? version : null;
}

/**
 * `pi list` prints `User packages:`, then per package a 2-space source line
 * and a 4-space line with the resolved path. Pi identifies a local package by
 * that resolved path, so the parser keeps only those lines.
 */
export function parsePiUserPackagePaths(stdout: string): string[] {
  const paths: string[] = [];
  let userSection = false;
  for (const line of stdout.split('\n')) {
    if (/^\S/.test(line)) {
      userSection = line.trim() === 'User packages:';
      continue;
    }
    const installed = /^ {4}(\S.*)$/.exec(line.trimEnd());
    if (userSection && installed) paths.push(installed[1]!);
  }
  return paths;
}

export type PiPackageList =
  | { readonly ok: true; readonly paths: readonly string[] }
  | { readonly ok: false; readonly error: string };

export function listPiUserPackages(piBin: string, env: PiEnv): PiPackageList {
  const result = runPi(piBin, ['list'], env);
  return result.ok ? { ok: true, paths: parsePiUserPackagePaths(result.stdout) } : { ok: false, error: failure(result) };
}

/** The package path that Pi records for the installed repo-harness package root. */
export function piPackageSource(packageRoot: string): string {
  return resolve(packageRoot);
}

export type PiPackagePlan =
  | { readonly step: typeof PI_PACKAGE_STEP; readonly action: 'install'; readonly source: string; readonly command: readonly string[] }
  | { readonly step: typeof PI_PACKAGE_STEP; readonly action: 'skip'; readonly reason: string };

export interface PiPackagePlanInput {
  readonly target: 'codex' | 'claude' | 'both';
  readonly hostAdapters: boolean;
  readonly packageRoot: string;
  readonly env: PiEnv;
}

/**
 * The Pi package is the Pi host adapter. It follows the all-hosts target and
 * the host-adapter switch; install has no separate Pi target.
 */
export function planPiPackageInstall(input: PiPackagePlanInput): PiPackagePlan {
  const skip = (reason: string): PiPackagePlan => ({ step: PI_PACKAGE_STEP, action: 'skip', reason });
  if (!input.hostAdapters) return skip('disabled');
  if (input.target !== 'both') return skip(`target ${input.target} excludes Pi; Pi follows --target both`);
  const pi = findPiExecutable(input.env);
  if (pi === null) return skip('pi not found on PATH');
  const source = piPackageSource(input.packageRoot);
  return { step: PI_PACKAGE_STEP, action: 'install', source, command: [pi, 'install', source] };
}

export interface PiPackageStep {
  readonly step: typeof PI_PACKAGE_STEP;
  readonly status: 'ok' | 'skipped' | 'failed';
  readonly detail: string;
  readonly command?: string[];
  readonly stdout?: string;
  readonly stderr?: string;
}

/** `pi install` is idempotent for a local path, so install and update run it each time. */
export function applyPiPackagePlan(plan: PiPackagePlan, env: PiEnv): PiPackageStep {
  if (plan.action === 'skip') return { step: PI_PACKAGE_STEP, status: 'skipped', detail: plan.reason };
  const [pi, ...args] = plan.command;
  const result = runPi(pi!, args, env);
  return {
    step: PI_PACKAGE_STEP,
    status: result.ok ? 'ok' : 'failed',
    detail: result.ok ? `pi package source=${plan.source}` : `pi install failed for ${plan.source}: ${failure(result)}`,
    command: [...result.command],
    stdout: result.stdout,
    stderr: result.stderr || result.error,
  };
}

export type PiPackageRemoval =
  | { readonly action: 'none' }
  | { readonly action: 'remove'; readonly pi: string; readonly source: string }
  | { readonly action: 'unresolved'; readonly source: string; readonly reason: string };

/** Only the entry whose resolved path is this package root; other Pi packages stay. */
export function planPiPackageRemoval(packageRoot: string, env: PiEnv): PiPackageRemoval {
  const pi = findPiExecutable(env);
  if (pi === null) return { action: 'none' };
  const source = piPackageSource(packageRoot);
  const listed = listPiUserPackages(pi, env);
  if (!listed.ok) return { action: 'unresolved', source, reason: `pi list failed: ${listed.error}` };
  return listed.paths.includes(source) ? { action: 'remove', pi, source } : { action: 'none' };
}

/** Null on success, otherwise the failure text. */
export function removePiPackage(removal: Extract<PiPackageRemoval, { action: 'remove' }>, env: PiEnv): string | null {
  const result = runPi(removal.pi, ['remove', removal.source], env);
  return result.ok ? null : failure(result);
}

export type PiCapabilityProbe = { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * Runs `probePiHost` from src/pi/compat.ts in a child Bun process. The probe
 * imports a private Pi module; the child keeps that import out of this
 * process and lets the synchronous setup check read the async result.
 */
export function probePiCapability(version: string, packageDir: string, env: PiEnv): PiCapabilityProbe {
  const script = [
    'const { probePiHost } = await import(process.argv[1]);',
    'const result = await probePiHost(process.argv[2], process.argv[3]);',
    'console.log(JSON.stringify(result.ok ? { ok: true } : { ok: false, message: result.message }));',
  ].join('\n');
  const result = runProcess(process.execPath, ['-e', script, PI_COMPAT_MODULE, version, packageDir], {
    env, inheritEnv: false, timeoutMs: PI_PROBE_TIMEOUT_MS,
  });
  if (!result.ok) return { ok: false, message: `capability probe failed: ${failure(result)}` };
  try {
    const parsed = JSON.parse(result.stdout.trim()) as { ok?: unknown; message?: unknown };
    if (parsed.ok === true) return { ok: true };
    if (parsed.ok === false && typeof parsed.message === 'string') return { ok: false, message: parsed.message };
  } catch {
    // Reported below.
  }
  return { ok: false, message: `capability probe returned invalid output: ${result.stdout.trim()}` };
}

export type PiHostReport =
  | { readonly status: 'absent' }
  | {
    readonly status: 'present';
    readonly pi: string;
    readonly version: string | null;
    readonly packageDir: string | null;
    /** Null when the version or the package directory is unknown. */
    readonly probe: PiCapabilityProbe | null;
    readonly source: string;
    readonly packages: PiPackageList;
  };

/** Read-only Pi facts for the setup check. */
export function inspectPiHost(packageRoot: string, env: PiEnv): PiHostReport {
  const pi = findPiExecutable(env);
  if (pi === null) return { status: 'absent' };
  const version = readPiVersion(pi, env);
  const packageDir = resolvePiPackageDir(pi);
  return {
    status: 'present',
    pi,
    version,
    packageDir,
    probe: version !== null && packageDir !== null ? probePiCapability(version, packageDir, env) : null,
    source: piPackageSource(packageRoot),
    packages: listPiUserPackages(pi, env),
  };
}
