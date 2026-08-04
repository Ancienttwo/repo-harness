import { createHash } from 'crypto';
import { readFileSync, realpathSync, statSync } from 'fs';
import { basename, dirname, isAbsolute, posix, relative, resolve, sep, win32 } from 'path';
import { stripWrappingQuotes } from '../../core/state/artifact-parsers';

export interface CollectedStateInputs {
  readonly sourceHashes: Readonly<Record<string, string>>;
  readonly stateRevision: string;
}

function canonicalTarget(cwd: string, candidate: string): { root: string; target: string } | null {
  if (
    !candidate
    || candidate.includes('\0')
    || candidate.includes('\n')
    || candidate.includes('\r')
    || candidate.replaceAll('\\', '/').split('/').includes('..')
    || (win32.isAbsolute(candidate) && !isAbsolute(candidate))
  ) return null;

  const root = realpathSync(resolve(cwd));
  const lexicalTarget = isAbsolute(candidate) ? resolve(candidate) : resolve(root, candidate);
  try {
    return { root, target: realpathSync(lexicalTarget) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return null;
  }

  const missingSegments: string[] = [];
  let ancestor = lexicalTarget;
  while (true) {
    try {
      const target = resolve(realpathSync(ancestor), ...missingSegments);
      return { root, target };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return null;
      const parent = dirname(ancestor);
      if (parent === ancestor) return null;
      missingSegments.unshift(basename(ancestor));
      ancestor = parent;
    }
  }
}

function containedRelativePath(root: string, target: string): string | null {
  const candidate = relative(root, target);
  if (
    !candidate
    || candidate === '..'
    || candidate.startsWith(`..${sep}`)
    || isAbsolute(candidate)
  ) return null;
  return candidate.split(sep).join('/');
}

/** Canonical repo-relative target for edit authorization; null means fail closed. */
export function canonicalRepoRelativePath(cwd: string, candidate: string): string | null {
  const resolved = canonicalTarget(cwd, candidate);
  return resolved ? containedRelativePath(resolved.root, resolved.target) : null;
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

  const canonical = canonicalTarget(cwd, relPath);
  if (!canonical || containedRelativePath(canonical.root, canonical.target) === null) {
    throw new Error(`unsafe state source path escapes repository: ${relPath}`);
  }
  return canonical.target;
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
