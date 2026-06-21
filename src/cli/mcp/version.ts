import { readFileSync } from 'fs';

export function repoHarnessPackageVersion(): string {
  try {
    const data = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf-8')) as { version?: unknown };
    return typeof data.version === 'string' ? data.version : 'unknown';
  } catch (_error) {
    return 'unknown';
  }
}
