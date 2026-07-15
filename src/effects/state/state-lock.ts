import {
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { randomUUID } from 'crypto';
import { dirname, join } from 'path';

const LOCK_RELATIVE_PATH = '.ai/harness/state/effective.lock';
const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 5_000;

interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
}

interface LockHandle {
  readonly fd: number;
  readonly ownerPath: string;
  readonly directoryIdentity: FileIdentity;
  readonly ownerIdentity: FileIdentity;
}

function ownerFileName(token: string): string {
  return `${token}.json`;
}

function ownerTokenFromFileName(entry: string): { readonly token: string; readonly pid: number } | null {
  const match = entry.match(/^([1-9]\d*)-\d+-[0-9a-f-]{36}\.json$/i);
  if (!match) return null;
  const pid = Number.parseInt(match[1], 10);
  if (!Number.isSafeInteger(pid)) return null;
  return { token: entry.slice(0, -'.json'.length), pid };
}

function ownerIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function fileIdentity(value: { readonly dev: number; readonly ino: number }): FileIdentity {
  return { dev: value.dev, ino: value.ino };
}

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function removeOwnedLock(
  lockPath: string,
  ownerPath: string,
  directoryIdentity: FileIdentity,
  ownerIdentity: FileIdentity,
): void {
  try {
    const currentDirectory = lstatSync(lockPath);
    if (!currentDirectory.isDirectory()
      || !sameFileIdentity(fileIdentity(currentDirectory), directoryIdentity)) return;
    const currentOwner = lstatSync(ownerPath);
    if (currentOwner.isFile()
      && sameFileIdentity(fileIdentity(currentOwner), ownerIdentity)) unlinkSync(ownerPath);
  } catch {
    return;
  }
  try {
    const currentDirectory = lstatSync(lockPath);
    if (currentDirectory.isDirectory()
      && sameFileIdentity(fileIdentity(currentDirectory), directoryIdentity)) rmdirSync(lockPath);
  } catch {
    // Another token or unexpected entry keeps the lock closed.
  }
}

function ownsExclusiveToken(
  lockPath: string,
  ownerPath: string,
  ownerName: string,
  directoryIdentity: FileIdentity,
  ownerIdentity: FileIdentity,
): boolean {
  try {
    const currentDirectory = lstatSync(lockPath);
    if (!currentDirectory.isDirectory()
      || !sameFileIdentity(fileIdentity(currentDirectory), directoryIdentity)) return false;
    const entries = readdirSync(lockPath);
    if (entries.length !== 1 || entries[0] !== ownerName) return false;
    const currentOwner = lstatSync(ownerPath);
    return currentOwner.isFile()
      && sameFileIdentity(fileIdentity(currentOwner), ownerIdentity);
  } catch {
    return false;
  }
}

function reclaimStaleLockDirectory(lockPath: string): boolean {
  let observedDirectoryIdentity: FileIdentity;
  let observedDirectoryMtimeMs: number;
  try {
    const observedDirectory = lstatSync(lockPath);
    if (!observedDirectory.isDirectory()) return false;
    observedDirectoryIdentity = fileIdentity(observedDirectory);
    observedDirectoryMtimeMs = observedDirectory.mtimeMs;
  } catch {
    return false;
  }
  let entries: string[];
  try {
    entries = readdirSync(lockPath);
  } catch {
    return false;
  }
  if (entries.length === 0) {
    if (Date.now() - observedDirectoryMtimeMs <= LOCK_STALE_MS) return false;
    try {
      const currentDirectory = lstatSync(lockPath);
      if (!currentDirectory.isDirectory()
        || !sameFileIdentity(fileIdentity(currentDirectory), observedDirectoryIdentity)
        || readdirSync(lockPath).length !== 0) return false;
      rmdirSync(lockPath);
      return true;
    } catch {
      return false;
    }
  }
  if (entries.length !== 1) return false;

  const entry = entries[0];
  const observedToken = ownerTokenFromFileName(entry);
  if (observedToken === null) return false;
  const observedOwnerPath = join(lockPath, entry);
  let reclaim = false;
  let observedOwnerIdentity: FileIdentity;
  let observedOwnerMtimeMs: number;
  try {
    const observedOwner = lstatSync(observedOwnerPath);
    if (!observedOwner.isFile()) return false;
    observedOwnerIdentity = fileIdentity(observedOwner);
    observedOwnerMtimeMs = observedOwner.mtimeMs;
  } catch {
    return false;
  }
  try {
    const raw = readFileSync(observedOwnerPath, 'utf-8');
    const lock = JSON.parse(raw) as { pid?: unknown; created_at?: unknown; token?: unknown };
    const pid = typeof lock.pid === 'number' ? lock.pid : null;
    const createdAt = typeof lock.created_at === 'number' ? lock.created_at : 0;
    const token = typeof lock.token === 'string' ? lock.token : null;
    reclaim = token === observedToken.token
      && pid === observedToken.pid
      && Date.now() - createdAt > LOCK_STALE_MS
      && !ownerIsAlive(observedToken.pid);
  } catch {
    reclaim = Date.now() - observedOwnerMtimeMs > LOCK_STALE_MS
      && !ownerIsAlive(observedToken.pid);
  }
  if (!reclaim) return false;

  try {
    const currentDirectory = lstatSync(lockPath);
    const currentOwner = lstatSync(observedOwnerPath);
    if (!currentDirectory.isDirectory()
      || !sameFileIdentity(fileIdentity(currentDirectory), observedDirectoryIdentity)
      || !currentOwner.isFile()
      || !sameFileIdentity(fileIdentity(currentOwner), observedOwnerIdentity)) return false;
    // Delete only the exact owner token that was observed. A new owner has a
    // different filename, so a stale reclaimer can never unlink it by path.
    unlinkSync(observedOwnerPath);
  } catch {
    return false;
  }
  try {
    rmdirSync(lockPath);
    return true;
  } catch {
    // Another token or unexpected entry appeared; preserve it and fail closed.
    return false;
  }
}

export function withExclusiveDirectoryLock<T>(lockPath: string, run: () => T): T {
  mkdirSync(dirname(lockPath), { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  let handle: LockHandle | null = null;

  while (handle === null) {
    try {
      mkdirSync(lockPath, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (!lstatSync(lockPath).isDirectory()) {
          throw new Error(`unsafe lock path is not a real directory: ${lockPath}`);
        }
      } catch (pathError) {
        if ((pathError as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw pathError;
      }
      reclaimStaleLockDirectory(lockPath);
      if (Date.now() >= deadline) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      continue;
    }

    const directoryStat = lstatSync(lockPath);
    if (!directoryStat.isDirectory()) {
      throw new Error(`unsafe lock path is not a real directory: ${lockPath}`);
    }
    const directoryIdentity = fileIdentity(directoryStat);
    const token = `${process.pid}-${Date.now()}-${randomUUID()}`;
    const ownerName = ownerFileName(token);
    const ownerPath = join(lockPath, ownerName);
    let fd: number | null = null;
    let ownerIdentity: FileIdentity | null = null;
    try {
      fd = openSync(ownerPath, 'wx', 0o600);
      ownerIdentity = fileIdentity(fstatSync(fd));
      writeFileSync(fd, `${JSON.stringify({ pid: process.pid, created_at: Date.now(), token })}\n`);
      if (!ownsExclusiveToken(
        lockPath,
        ownerPath,
        ownerName,
        directoryIdentity,
        ownerIdentity,
      )) {
        closeSync(fd);
        fd = null;
        removeOwnedLock(lockPath, ownerPath, directoryIdentity, ownerIdentity);
        if (Date.now() >= deadline) throw new Error(`lost exclusive lock ownership: ${lockPath}`);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        continue;
      }
      handle = { fd, ownerPath, directoryIdentity, ownerIdentity };
    } catch (error) {
      if (fd !== null) closeSync(fd);
      if (ownerIdentity !== null) {
        removeOwnedLock(lockPath, ownerPath, directoryIdentity, ownerIdentity);
      } else {
        try { unlinkSync(ownerPath); } catch { /* owner file was never published */ }
        try { rmdirSync(lockPath); } catch { /* an unexpected entry keeps the lock closed */ }
      }
      throw error;
    }
  }

  try {
    return run();
  } finally {
    closeSync(handle.fd);
    removeOwnedLock(
      lockPath,
      handle.ownerPath,
      handle.directoryIdentity,
      handle.ownerIdentity,
    );
  }
}

export function withStateLock<T>(cwd: string, run: () => T): T {
  return withExclusiveDirectoryLock(join(cwd, LOCK_RELATIVE_PATH), run);
}
