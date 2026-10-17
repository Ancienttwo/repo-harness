import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import wazaRules from '../../../assets/waza-shared-rules.json';
import { runProcess } from '../../effects/process-runner';
import { managedInstallSurfaceIsCurrent, readInstalledProfile, recordRefreshedInstallOwnership } from './install-profile';
import { atomicWriteFileSync } from './shared';

interface RulesResult {
  status: 'ok' | 'skipped' | 'failed';
  detail: string;
}

function readRule(path: string): string | undefined {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) return undefined;
  if (!stat.isFile()) throw new Error(`refusing non-file rule ${path}`);
  return readFileSync(path, 'utf-8');
}

function fetchRules(env: NodeJS.ProcessEnv): Map<string, string> {
  const temporary = mkdtempSync(join(tmpdir(), 'repo-harness-waza-rules-'));
  try {
    const fetched = new Map<string, string>();
    for (const rule of wazaRules.files) {
      const url = `${wazaRules.rawBaseUrl}/rules/${rule}`;
      const output = join(temporary, rule);
      // Fetch to a file so process-output limits and redaction cannot change rule bytes.
      const result = runProcess('curl', ['-fsSL', '--max-time', '5', '--output', output, url], {
        env, timeoutMs: 7000,
      });
      if (!result.ok) {
        throw new Error(`cannot fetch Waza rule ${url}: ${result.stderr || result.error || `exit ${result.status}`}`);
      }
      const value = readRule(output);
      if (!value?.trim()) throw new Error(`cannot fetch Waza rule ${url}: empty response`);
      fetched.set(rule, value);
    }
    return fetched;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/** One preflight covers staging and all hosts before the first rule write. */
export function syncWazaSharedRules(
  home: string | null,
  hosts: readonly ('claude' | 'codex')[],
  env: NodeJS.ProcessEnv,
  refresh = false,
): RulesResult {
  if (!home) return { status: 'failed', detail: 'HOME is required' };
  const sourceDir = join(home, '.agents', 'rules');
  if (!refresh && !existsSync(sourceDir)) {
    return { status: 'skipped', detail: `staging rules not found: ${sourceDir}` };
  }
  try {
    const previous = new Map(wazaRules.files.map((rule) => [rule, readRule(join(sourceDir, rule))]));
    const next = refresh ? fetchRules(env) : previous;
    const missing = wazaRules.files.filter((rule) => next.get(rule) === undefined);
    if (missing.length > 0) return { status: 'failed', detail: `missing ${missing.join(', ')}` };

    if (refresh) {
      const state = readInstalledProfile(env);
      for (const rule of wazaRules.files) {
        const current = previous.get(rule);
        if (current === undefined && state === null) {
          return { status: 'failed', detail: 'an installed profile is required to own new Waza rules; run repo-harness install first' };
        }
        if (current === undefined || current === next.get(rule)) continue;
        const source = join(sourceDir, rule);
        const receipt = state?.ownership_manifest.find((surface) => surface.path === source);
        if (!receipt || !managedInstallSurfaceIsCurrent(receipt)) {
          const hostCopies = hosts.map((host) => join(home, `.${host}`, 'rules', rule)).join(', ');
          return { status: 'failed', detail: `refusing to refresh unowned or drifted staging rule ${source}; move this staging file and any existing host copies (${hostCopies}) to a backup directory before retrying` };
        }
      }
    }

    const writes = new Map<string, string>();
    const createdPaths: string[] = [];
    for (const host of hosts) {
      const destDir = join(home, `.${host}`, 'rules');
      for (const rule of wazaRules.files) {
        const destination = join(destDir, rule);
        const current = readRule(destination);
        const value = next.get(rule)!;
        if (current !== undefined && current !== value && current !== previous.get(rule)) {
          return { status: 'failed', detail: `refusing to overwrite unowned rule ${destination}` };
        }
        if (current !== value) writes.set(destination, value);
        if (current === undefined) createdPaths.push(destination);
      }
    }
    const refreshedPaths: string[] = [];
    if (refresh) {
      for (const rule of wazaRules.files) {
        const value = next.get(rule)!;
        if (previous.get(rule) !== value) {
          const source = join(sourceDir, rule);
          atomicWriteFileSync(source, value);
          refreshedPaths.push(source);
          if (previous.get(rule) === undefined) createdPaths.push(source);
        }
      }
    }
    for (const [destination, value] of writes) atomicWriteFileSync(destination, value);
    // The candidate update path has no install transaction when it records its profile.
    // Keep existing receipts current so the next refresh can prove ownership again.
    if (refresh) recordRefreshedInstallOwnership([...refreshedPaths, ...writes.keys()], env, createdPaths);
    return { status: 'ok', detail: `${refresh ? 'refreshed staging; ' : ''}synced ${hosts.length * wazaRules.files.length} files` };
  } catch (error) {
    return { status: 'failed', detail: (error as Error).message };
  }
}
