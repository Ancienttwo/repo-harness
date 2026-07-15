import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { isAbsolute, join, resolve } from 'path';
import { withExclusiveDirectoryLock } from './state-lock';

interface VersionRecord {
  readonly version: number;
  readonly revision: string;
}

export function stateVersionOwnerPath(cwd: string): string {
  const raw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const commonDir = isAbsolute(raw) ? raw : resolve(cwd, raw);
  return join(commonDir, 'repo-harness/effective-state-version.json');
}

function readVersionRecord(target: string): VersionRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(target, 'utf-8')) as { version?: unknown; revision?: unknown };
    if (!Number.isInteger(parsed.version) || (parsed.version as number) < 1 || typeof parsed.revision !== 'string') {
      throw new Error(`invalid effective-state version owner: ${target}`);
    }
    return { version: parsed.version as number, revision: parsed.revision };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function currentStateVersion(cwd: string): number {
  let target: string;
  try {
    target = stateVersionOwnerPath(cwd);
  } catch {
    return 0;
  }
  const current = readVersionRecord(target);
  return current?.version ?? 0;
}

export function allocateStateVersion(cwd: string, revision: string): number {
  const target = stateVersionOwnerPath(cwd);
  return withExclusiveDirectoryLock(`${target}.lock`, () => {
    const previous = readVersionRecord(target);
    if (previous?.revision === revision) return previous.version;
    const next = { version: (previous?.version ?? 0) + 1, revision };
    mkdirSync(join(target, '..'), { recursive: true });
    const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, target);
    return next.version;
  });
}
