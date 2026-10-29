import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { homedir } from 'node:os';
import { piAgentDir } from '../../effects/pi-agent-dir';
import { realPathOrResolved } from '../../effects/path-identity';

export function piExecutable(env: NodeJS.ProcessEnv = process.env): string | null {
  const extensions = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const directory of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(directory, `pi${extension}`);
      try {
        if (!statSync(candidate).isFile()) continue;
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch { /* Continue through PATH. */ }
    }
  }
  return null;
}

/** Package commands run at HOME so project settings cannot supply ownership. */
export function runPi(args: readonly string[], env: NodeJS.ProcessEnv = process.env): string {
  const executable = piExecutable(env);
  if (executable === null) throw new Error('pi not found on PATH');
  const result = spawnSync(executable, [...args], {
    cwd: env.HOME ?? env.USERPROFILE, env: { ...env, NO_COLOR: '1', FORCE_COLOR: '0' },
    encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) throw new Error(`pi ${args.join(' ')} failed: ${result.error?.message || result.stderr.trim() || `exit ${result.status}`}`);
  return stripVTControlCharacters(result.stdout).trim();
}

/** Pi 1.4 list prints sources at two spaces and resolved paths at four. */
export function piUserPackageSources(output: string): readonly string[] {
  if (output === 'No packages installed.') return [];
  const lines = output.split(/\r?\n/);
  const start = lines.lastIndexOf('User packages:');
  if (start < 0) {
    if (lines.includes('Project packages:')) return [];
    throw new Error('PI_PACKAGE_LIST_INVALID');
  }
  const nextHeader = lines.findIndex((line, index) => index > start && (line === 'User packages:' || line === 'Project packages:'));
  return lines.slice(start + 1, nextHeader < 0 ? undefined : nextHeader)
    .filter(line => /^  \S/.test(line))
    .map(line => line.slice(2).replace(/ \(filtered\)$/, ''));
}

export function piPackagePresent(source: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const sources = piUserPackageSources(runPi(['list'], env));
  if (sources.length === 0) return false;
  const expected = realPathOrResolved(source);
  const agentDir = piAgentDir(env.HOME ?? env.USERPROFILE ?? homedir(), env);
  return sources.some(entry => realPathOrResolved(resolve(agentDir, entry)) === expected);
}

export interface PiPackageStep {
  readonly step: 'install Pi package';
  readonly status: 'ok' | 'skipped' | 'failed';
  readonly detail: string;
  readonly command?: readonly string[];
  readonly source: string;
  readonly created: boolean;
}

export function planPiPackage(source: string, enabled: boolean, env: NodeJS.ProcessEnv = process.env): PiPackageStep {
  const base = { step: 'install Pi package' as const, source: resolve(source), created: false };
  if (!enabled) return { ...base, status: 'skipped', detail: 'Pi host not selected' };
  if (piExecutable(env) === null) return { ...base, status: 'skipped', detail: 'pi not found on PATH' };
  return { ...base, status: 'ok', detail: 'Pi will check the user package entry before installation', command: ['pi', 'install', base.source] };
}

/** Only a newly created entry grants removal authority. Existing entries stay unowned. */
export function installPiPackage(source: string, enabled: boolean, env: NodeJS.ProcessEnv = process.env): PiPackageStep {
  const plan = planPiPackage(source, enabled, env);
  if (plan.status === 'skipped') return plan;
  let attempted = false;
  try {
    if (piPackagePresent(plan.source, env)) return { ...plan, detail: 'Pi user package entry already present; no duplicate added' };
    const manifest = JSON.parse(readFileSync(join(plan.source, 'package.json'), 'utf8'));
    if (manifest.name !== 'repo-harness' || !Array.isArray(manifest.pi?.extensions) || manifest.pi.extensions.length === 0) {
      throw new Error('installed repo-harness package has no Pi extension declaration');
    }
    attempted = true;
    runPi(['install', plan.source], env);
    if (!piPackagePresent(plan.source, env)) throw new Error('PI_PACKAGE_INSTALL_NOT_RECORDED');
    return { ...plan, created: true, detail: 'Pi user package entry installed' };
  } catch (error) {
    let detail = (error as Error).message;
    if (attempted) {
      try { removePiPackage(plan.source, env); }
      catch (cleanup) { detail += `; Pi package compensation failed: ${(cleanup as Error).message}`; }
    }
    return { ...plan, status: 'failed', detail };
  }
}

export function removePiPackage(source: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!piPackagePresent(source, env)) return;
  runPi(['remove', source], env);
  if (piPackagePresent(source, env)) throw new Error('PI_PACKAGE_REMOVE_NOT_RECORDED');
}
