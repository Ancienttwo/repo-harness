import { worktreeUid } from './worktree-trash';
import { randomUUID } from 'crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, renameSync, unlinkSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { createFileExclusiveDurably, syncDirectoryDurably } from '../evidence/atomic-append';

export interface PrunedWorktreeIntent {
  readonly worktree: string;
  readonly branch: string;
  readonly head: string;
  readonly git_directory: string;
  readonly git_directory_dev: number;
  readonly git_directory_ino: number;
}
export function prunedIntentKey(entry: PrunedWorktreeIntent): string {
  return JSON.stringify([entry.worktree, entry.branch, entry.head]);
}
function file(common: string): string { return join(common, 'repo-harness/coordination/pruned-worktrees.json'); }
function assertParent(common: string): void {
  let path = common;
  for (const part of ['repo-harness', 'coordination']) {
    path = join(path, part); const stat = lstatSync(path); const uid = worktreeUid();
    if (!stat.isDirectory() || stat.isSymbolicLink() || uid === undefined || stat.uid !== uid || (stat.mode & 0o002)) throw new Error('pruned worktree intent directory is unsafe');
  }
}
function assertFile(path: string): void {
  const stat = lstatSync(path);
  const uid = worktreeUid();
  if (!stat.isFile() || stat.isSymbolicLink() || uid === undefined || stat.uid !== uid || (stat.mode & 0o002)) throw new Error('pruned worktree intent file is unsafe');
}
export function readPrunedWorktreeIntents(common: string): PrunedWorktreeIntent[] {
  const path = file(common);
  if (!existsSync(path)) { try { lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; } }
  assertParent(common);
  assertFile(path);
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  if (!saved || saved.protocol !== 1 || saved.common !== common || !Array.isArray(saved.entries)) throw new Error('pruned worktree intent file is invalid');
  assertEntries(common, saved.entries);
  return saved.entries;
}
function assertEntries(common: string, entries: readonly PrunedWorktreeIntent[]): void {
  for (const entry of entries) {
    if (!entry || typeof entry.worktree !== 'string' || !isAbsolute(entry.worktree) || resolve(entry.worktree) !== entry.worktree
      || typeof entry.branch !== 'string' || !entry.branch || /[\x00-\x20\x7f]/.test(entry.branch)
      || typeof entry.head !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(entry.head)
      || typeof entry.git_directory !== 'string' || dirname(entry.git_directory) !== join(common, 'worktrees') || resolve(entry.git_directory) !== entry.git_directory
      || !Number.isSafeInteger(entry.git_directory_dev) || !Number.isSafeInteger(entry.git_directory_ino)) throw new Error('pruned worktree intent entry is invalid');
  }
  if (new Set(entries.map(prunedIntentKey)).size !== entries.length) throw new Error('pruned worktree intent entries are ambiguous');
}
/** The caller holds the topology lock. Publish before native global prune. */
export function writePrunedWorktreeIntents(common: string, entries: readonly PrunedWorktreeIntent[]): void {
  assertEntries(common, entries);
  const path = file(common);
  assertParent(common);
  const beforeWrite = Date.now();
  const temporaryNames = readdirSync(dirname(path)).filter(name => /^pruned-worktrees\.json\.[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.tmp$/.test(name));
  for (const name of temporaryNames.slice(0, 8)) {
    const orphan = join(dirname(path), name); const stat = lstatSync(orphan);
    if (stat.isFile() && !stat.isSymbolicLink() && stat.uid === worktreeUid() && (stat.mode & 0o777) === 0o600 && stat.mtimeMs < beforeWrite) unlinkSync(orphan);
  }
  if (existsSync(path)) assertFile(path);
  if (!entries.length) { if (existsSync(path)) unlinkSync(path); syncDirectoryDurably(dirname(path)); return; }
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    createFileExclusiveDurably(temporary, Buffer.from(JSON.stringify({ protocol: 1, common, entries })));
    renameSync(temporary, path);
    syncDirectoryDurably(dirname(path));
  } finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}
