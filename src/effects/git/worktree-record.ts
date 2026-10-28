import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { WorktreeLifecycle } from '../../core/operator/worktrees';
import { resolveGitCommonDirectory } from './common-directory';

export interface WorktreeRecord extends WorktreeLifecycle { version: 1; id: string; path: string }

/** A directory incarnation, not its reusable branch or Git admin name. No write is needed for discovery. */
export function worktreeId(common: string, path: string): string {
  let identity: unknown = null;
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('worktree directory invalid');
    identity = [stat.dev, stat.ino, stat.birthtimeMs];
    path = realpathSync(path);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return 'wt_' + createHash('sha256').update(JSON.stringify([common, resolve(path), identity])).digest('hex');
}

function recordFile(common: string, id: string): string { return join(common, 'repo-harness', 'worktree-records', id + '.json'); }
export function readWorktreeRecord(common: string, path: string): WorktreeRecord | null {
  const record = readWorktreeRecordById(common, worktreeId(common, path));
  if (record && record.path !== realpathSync(path)) throw new Error('worktree record path invalid');
  return record;
}

export function readWorktreeRecordById(common: string, id: string): WorktreeRecord | null {
  if (!/^wt_[a-f0-9]{64}$/u.test(id)) throw new Error('worktree record id invalid');
  const file = recordFile(common, id);
  if (!existsSync(file)) return null;
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('worktree record invalid');
  const value = JSON.parse(readFileSync(file, 'utf8')) as WorktreeRecord;
  if (value.version !== 1 || value.id !== id || typeof value.path !== 'string') throw new Error('worktree record identity invalid');
  return value;
}

function save(common: string, record: WorktreeRecord): void {
  const file = recordFile(common, record.id);
  let directory = common;
  for (const part of ['repo-harness', 'worktree-records']) {
    directory = join(directory, part);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('worktree record store invalid');
  }
  const temporary = file + '.' + randomUUID();
  writeFileSync(temporary, JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 });
  renameSync(temporary, file);
}

/** Creation metadata is immutable; runtime bindings keep their own operational authority. */
export function recordWorktree(root: string, path: string, input: Pick<WorktreeLifecycle, 'creator' | 'purpose'> & Partial<Pick<WorktreeLifecycle, 'task_id' | 'pull_request'>>): WorktreeRecord {
  const common = resolveGitCommonDirectory(root);
  const current = readWorktreeRecord(common, path);
  if (current) return current;
  const record: WorktreeRecord = { version: 1, id: worktreeId(common, path), path: realpathSync(path),
    creator: input.creator, purpose: input.purpose, task_id: input.task_id ?? null, pull_request: input.pull_request ?? null,
    created_at: new Date().toISOString(), ended_at: null, end_state: 'open' };
  save(common, record);
  return record;
}

/** Capture before removal; publish the end state only after the caller proves closeout. */
export function endWorktreeRecord(common: string, record: WorktreeRecord | null, state: 'closed' | 'removed'): void {
  if (!record) return;
  const current = readWorktreeRecordById(common, record.id);
  if (!current || current.path !== record.path) throw new Error('worktree record disappeared');
  if (current.end_state !== state) save(common, { ...current, end_state: state, ended_at: new Date().toISOString() });
}
