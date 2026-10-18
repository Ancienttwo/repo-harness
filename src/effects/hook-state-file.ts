import { lstatSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export function assertSafeRepoWritePath(repoRoot: string, path: string): void {
  const root = resolve(repoRoot);
  const target = resolve(path);
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`hook-state: write path escapes repository: ${path}`);
  }
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    const entry = lstatSync(current, { throwIfNoEntry: false });
    if (!entry) continue;
    if (entry.isSymbolicLink()) throw new Error(`hook-state: symlinked write path is forbidden: ${current}`);
    if (current !== target && !entry.isDirectory()) {
      throw new Error(`hook-state: non-directory write ancestor: ${current}`);
    }
  }
}

export function writeHookStateFile(repoRoot: string, path: string, content: string): void {
  assertSafeRepoWritePath(repoRoot, path);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  try {
    assertSafeRepoWritePath(repoRoot, temporary);
    writeFileSync(temporary, content, { mode: 0o600 });
    assertSafeRepoWritePath(repoRoot, path);
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // No temporary file was committed, or another fault already removed it.
    }
    throw error;
  }
}

