import { closeSync, constants, fsyncSync, fstatSync, lstatSync, openSync, readFileSync, writeSync, ftruncateSync } from 'fs';
import { hostname } from 'os';
import { join } from 'path';
import { resolveGitCommonDirectory } from './git/common-directory';
import {
  acquireExclusiveDirectoryLock,
  type ExclusiveDirectoryLockHandle,
  type ExclusiveDirectoryLockOwner,
} from './locking/exclusive-directory-lock';

export const EXPENSIVE_RUN_LOCK_RELATIVE_PATH = 'repo-harness/expensive-run.lock';

export interface ExpensiveRunLockHandle extends ExclusiveDirectoryLockHandle {
  /** Register the supervisor's actual detached launcher before releasing its start barrier. */
  registerProcessGroup(pid: number): void;
}

function registeredProcessGroup(owner: ExclusiveDirectoryLockOwner, record: Readonly<Record<string, unknown>>): number | null {
  const value = record.expensive_group;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const group = value as Record<string, unknown>;
  const keys = ['protocol', 'kind', 'hostname', 'owner_token', 'process_group_pid'];
  if (Object.keys(group).length !== keys.length || Object.keys(group).some(key => !keys.includes(key))
    || group.protocol !== 1 || group.kind !== 'repo-harness-expensive-run-group'
    || group.hostname !== hostname() || group.owner_token !== owner.token
    || record.pid !== owner.pid || record.token !== owner.token
    || !Number.isSafeInteger(group.process_group_pid) || (group.process_group_pid as number) < 1) return null;
  return group.process_group_pid as number;
}

function processGroupDrained(pid: number): boolean {
  // Windows cannot prove absence of all descendants with a negative-PGID probe.
  if (process.platform === 'win32') return false;
  try {
    process.kill(-pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

export function acquireExpensiveRunLock(
  cwd: string,
  gitBin = process.env.REPO_HARNESS_GIT_BIN || 'git',
  waitTimeoutMs?: number,
): ExpensiveRunLockHandle {
  const commonDir = resolveGitCommonDirectory(cwd, gitBin);
  const lock = acquireExclusiveDirectoryLock(commonDir, EXPENSIVE_RUN_LOCK_RELATIVE_PATH, {
    waitTimeoutMs,
    canReclaimStaleOwner(owner, record) {
      const pid = registeredProcessGroup(owner, record);
      // Non-supervised consumers publish no group proof; dead PID is insufficient.
      return pid !== null && processGroupDrained(pid);
    },
  });
  const ownerPath = join(lock.lockPath, `${lock.ownerToken}.json`);
  let registeredPid: number | null = null;
  let released = false;
  return {
    ...lock,
    registerProcessGroup(pid) {
      if (process.platform === 'win32') throw new Error('POSIX process-group registration is unavailable on Windows');
      lock.assertOwned();
      if (!Number.isSafeInteger(pid) || pid < 1 || registeredPid !== null) {
        throw new Error('expensive run requires exactly one supervisor process group');
      }
      registeredPid = pid;
      const identity = lstatSync(ownerPath);
      const fd = openSync(ownerPath, constants.O_RDWR | constants.O_NOFOLLOW);
      try {
        const opened = fstatSync(fd);
        lock.assertOwned();
        if (!opened.isFile() || opened.dev !== identity.dev || opened.ino !== identity.ino) {
          throw new Error('expensive run owner inode changed before group registration');
        }
        const owner = JSON.parse(readFileSync(fd, 'utf-8')) as Record<string, unknown>;
        if (owner.pid !== lock.ownerPid || owner.token !== lock.ownerToken || owner.expensive_group !== undefined) {
          throw new Error('expensive run owner record changed before group registration');
        }
        const bytes = `${JSON.stringify({ ...owner, expensive_group: {
          protocol: 1, kind: 'repo-harness-expensive-run-group', hostname: hostname(),
          owner_token: lock.ownerToken, process_group_pid: pid,
        } })}\n`;
        // Keep the inode fence; truncated/interrupted publication stays unknown.
        ftruncateSync(fd, 0);
        const buffer = Buffer.from(bytes);
        let offset = 0;
        while (offset < buffer.length) {
          const written = writeSync(fd, buffer, offset, buffer.length - offset, offset);
          if (written === 0) throw new Error('expensive run group publication made no progress');
          offset += written;
        }
        fsyncSync(fd);
        const directory = openSync(lock.lockPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        try { fsyncSync(directory); } finally { closeSync(directory); }
        lock.assertOwned();
      } finally {
        closeSync(fd);
      }
    },
    release() {
      if (released) return;
      if (registeredPid !== null) {
        lock.assertOwned();
        const record = JSON.parse(readFileSync(ownerPath, 'utf-8')) as Record<string, unknown>;
        const pid = registeredProcessGroup({ lockPath: lock.lockPath, pid: lock.ownerPid, token: lock.ownerToken }, record);
        if (pid === null || pid !== registeredPid || !processGroupDrained(pid)) {
          throw new Error('expensive run process group has not been proven drained; preserving lock');
        }
      }
      lock.release();
      released = true;
    },
  };
}
