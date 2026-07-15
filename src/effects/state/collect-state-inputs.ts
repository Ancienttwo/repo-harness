import { createHash } from 'crypto';
import { readFileSync, realpathSync, statSync } from 'fs';
import { dirname, isAbsolute, posix, relative, resolve, sep, win32 } from 'path';
import { stripWrappingQuotes } from '../../core/state/artifact-parsers';

export interface CollectedStateInputs {
  readonly sourceHashes: Readonly<Record<string, string>>;
  readonly stateRevision: string;
}

export function repoPath(cwd: string, relPath: string): string {
  const posixRoot = posix.resolve('/repo');
  const win32Root = win32.resolve('C:\\repo').toLowerCase();
  const posixCandidate = posix.resolve(posixRoot, relPath);
  const win32Candidate = win32.resolve(win32Root, relPath).toLowerCase();
  if (
    !relPath
    || relPath.includes('\0')
    || relPath.includes('\n')
    || relPath.includes('\r')
    || posix.isAbsolute(relPath)
    || win32.isAbsolute(relPath)
    || win32.parse(relPath).root !== ''
    || !posixCandidate.startsWith(`${posixRoot}${posix.sep}`)
    || !win32Candidate.startsWith(`${win32Root}${win32.sep}`)
  ) {
    throw new Error(`unsafe state source path escapes repository: ${relPath}`);
  }

  const canonicalRoot = realpathSync(resolve(cwd));
  const lexicalTarget = resolve(canonicalRoot, relPath);
  let canonicalTarget: string;
  let targetExists = true;
  try {
    canonicalTarget = realpathSync(lexicalTarget);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    targetExists = false;
    let existingAncestor = dirname(lexicalTarget);
    while (true) {
      try {
        canonicalTarget = realpathSync(existingAncestor);
        break;
      } catch (ancestorError) {
        if ((ancestorError as NodeJS.ErrnoException).code !== 'ENOENT') throw ancestorError;
        existingAncestor = dirname(existingAncestor);
      }
    }
  }
  const canonicalRelative = relative(canonicalRoot, canonicalTarget);
  if (
    (targetExists && !canonicalRelative)
    || canonicalRelative === '..'
    || canonicalRelative.startsWith(`..${sep}`)
    || isAbsolute(canonicalRelative)
  ) {
    throw new Error(`unsafe state source path escapes repository: ${relPath}`);
  }
  return targetExists ? canonicalTarget : lexicalTarget;
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
  if (!relPath) return false;
  try {
    statSync(repoPath(cwd, relPath));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function safeRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return path;
    throw error;
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
    Object.entries(sourceHashes).sort(([left], [right]) => (
      left < right ? -1 : left > right ? 1 : 0
    )),
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
