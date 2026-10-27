import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export function globalConfigurationPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME ?? process.env.HOME ?? homedir();
  if (!isAbsolute(home)) throw new Error('global configuration requires an absolute HOME');
  return join(home, '.repo-harness', 'config.json');
}

/** The digest of the exact file bytes, or `absent` when there is no file. A writer compares it before it replaces the file. */
export function globalConfigurationRevision(bytes: Buffer | null): string {
  return bytes === null ? 'absent' : `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** One host configuration document; typed consumers validate their own section. */
export function readGlobalConfiguration(env: NodeJS.ProcessEnv = process.env): { path: string; config: Record<string, unknown>; revision: string } {
  const path = globalConfigurationPath(env);
  let bytes: Buffer | null = null;
  let value: unknown;
  try {
    bytes = readFileSync(path);
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Invalid global configuration at ${path}: ${error instanceof Error ? error.message : String(error)}`);
    value = {};
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Global configuration must be an object: ${path}`);
  return { path, config: value as Record<string, unknown>, revision: globalConfigurationRevision(bytes) };
}
