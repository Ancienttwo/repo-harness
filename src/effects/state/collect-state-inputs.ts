import { createHash } from 'crypto';
import { existsSync, readFileSync, realpathSync } from 'fs';
import { join } from 'path';
import { stripWrappingQuotes } from '../../core/state/artifact-parsers';

export interface CollectedStateInputs {
  readonly sourceHashes: Readonly<Record<string, string>>;
  readonly stateRevision: string;
}

export function repoPath(cwd: string, relPath: string): string {
  return join(cwd, relPath);
}

export function readText(cwd: string, relPath: string | null): string | null {
  if (!relPath) return null;
  try {
    return readFileSync(repoPath(cwd, relPath), 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function readTrimmed(cwd: string, relPath: string): string | null {
  const value = readText(cwd, relPath)?.trim();
  return value ? stripWrappingQuotes(value) : null;
}

export function fileExists(cwd: string, relPath: string | null | undefined): boolean {
  return Boolean(relPath) && existsSync(repoPath(cwd, relPath as string));
}

export function safeRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export function sha256(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

export function sourceHash(cwd: string, relPath: string): string {
  const content = readText(cwd, relPath);
  return content === null ? sha256(`missing:${relPath}`) : sha256(content);
}

export function contentRevision(sourceHashes: Readonly<Record<string, string>>): string {
  const sorted = Object.fromEntries(
    Object.entries(sourceHashes).sort(([left], [right]) => left.localeCompare(right)),
  );
  return sha256(JSON.stringify(sorted));
}

/** Collect the versioned source-hash input bundle consumed by the pure projector. */
export function collectStateInputs(
  cwd: string,
  sourcePaths: readonly string[],
  additionalHashes: Readonly<Record<string, string>> = {},
): CollectedStateInputs {
  const sourceHashes = Object.fromEntries(
    Array.from(new Set(sourcePaths)).sort().map((path) => [path, sourceHash(cwd, path)]),
  );
  Object.assign(sourceHashes, additionalHashes);
  return {
    sourceHashes,
    stateRevision: contentRevision(sourceHashes),
  };
}
