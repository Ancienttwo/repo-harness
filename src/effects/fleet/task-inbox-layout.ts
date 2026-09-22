import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TASK_INBOX_RETIREMENT_MARKER } from '../../core/fleet/task-inbox-layout';

export class TaskInboxLayoutError extends Error {
  constructor(readonly code: 'task_inbox_migration_required' | 'task_inbox_migration_incomplete' | 'task_inbox_layout_invalid', message: string) {
    super(`${message}; use repo-harness fleet inbox migrate-layout --json to inspect the offline migration`);
    this.name = 'TaskInboxLayoutError';
  }
}

export function inboxLayoutPaths(common: string) {
  const root = join(common, 'repo-harness/task-inbox');
  return { root, legacy: join(root, 'v1'), current: join(root, 'v2'),
    stage: join(root, 'v2-stage'), backup: join(root, 'retired-v1'),
    journal: join(root, 'migration-v1-v2.json'), receipt: join(root, 'migration-v1-v2.receipt.json'),
    rollback: join(root, 'migration-v1-v2.rollback.json'), rolledBack: join(root, 'migration-v1-v2.rolled-back.json') };
}

export function inboxPathStat(path: string) {
  // File IDs must remain exact for hard-link accounting and layout identity fences.
  try { return lstatSync(path, { bigint: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

export function assertInboxDirectory(path: string): void {
  const stat = inboxPathStat(path);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new TaskInboxLayoutError('task_inbox_layout_invalid', 'Task Inbox directory is unsafe');
}

/** Returns an identity fence without writing anything, including for an empty store. */
export function inspectTaskInboxLayout(common: string): string {
  assertInboxDirectory(common);
  assertInboxDirectory(join(common, 'repo-harness'));
  const p = inboxLayoutPaths(common);
  assertInboxDirectory(p.root);
  if ([p.journal, `${p.journal}.pending`, p.rollback, `${p.rollback}.pending`].some(path => inboxPathStat(path))) {
    throw new TaskInboxLayoutError('task_inbox_migration_incomplete', 'Task Inbox migration requires explicit recovery');
  }
  const legacy = inboxPathStat(p.legacy);
  if (legacy?.isDirectory()) throw new TaskInboxLayoutError('task_inbox_migration_required', 'Task Inbox v1 history must be migrated before use');
  if (legacy && (!legacy.isFile() || legacy.isSymbolicLink() || legacy.size !== BigInt(Buffer.byteLength(TASK_INBOX_RETIREMENT_MARKER))
    || readFileSync(p.legacy, 'utf8') !== TASK_INBOX_RETIREMENT_MARKER)) {
    throw new TaskInboxLayoutError('task_inbox_layout_invalid', 'Task Inbox retirement marker is invalid');
  }
  assertInboxDirectory(p.current);
  const current = inboxPathStat(p.current);
  const backup = inboxPathStat(p.backup), receipt = inboxPathStat(p.receipt);
  if ((backup || receipt || legacy) && (!backup?.isDirectory() || backup.isSymbolicLink()
    || !receipt?.isFile() || receipt.isSymbolicLink() || !legacy)) {
    throw new TaskInboxLayoutError('task_inbox_layout_invalid', 'Task Inbox retirement artifacts are inconsistent');
  }
  if (inboxPathStat(p.stage) || inboxPathStat(p.rolledBack) || (!current && (legacy || inboxPathStat(p.backup) || inboxPathStat(p.receipt)))) {
    throw new TaskInboxLayoutError('task_inbox_migration_incomplete', 'Task Inbox layout cutover is incomplete');
  }
  return current ? `${current.dev}:${current.ino}` : 'absent';
}

export function assertTaskInboxLayoutUnchanged(common: string, identity: string): void {
  if (inspectTaskInboxLayout(common) !== identity) throw new TaskInboxLayoutError('task_inbox_migration_incomplete', 'Task Inbox layout changed during observation');
}

/** Windows flushes writable file handles; directory fsync is a POSIX operation. */
export function syncInboxDirectory(path: string): void {
  if (process.platform === 'win32') return;
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
