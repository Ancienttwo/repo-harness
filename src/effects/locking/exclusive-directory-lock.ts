import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { randomUUID } from 'crypto';
import { isAbsolute, join, relative, resolve, sep } from 'path';

const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 5_000;
const MAX_LOCK_WAIT_MS = 2_147_483_647;

/**
 * Thrown when the lock cannot be held because another holder is contending for
 * it: the acquire wait deadline expired, or this process' token stopped being
 * the single published owner. Both kinds are ordinary concurrent-write
 * contention rather than an unrecoverable lock state, so callers classify this
 * by type and may retry.
 */
export class ExclusiveLockContentionError extends Error {
  readonly lockPath: string;
  readonly kind: 'timeout' | 'lost-ownership';

  constructor(message: string, lockPath: string, kind: 'timeout' | 'lost-ownership') {
    super(message);
    this.name = 'ExclusiveLockContentionError';
    this.lockPath = lockPath;
    this.kind = kind;
  }
}

interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
}

interface LockAncestor {
  readonly path: string;
  readonly identity: FileIdentity;
}

interface LockLocation {
  readonly lockPath: string;
  readonly ancestors: readonly LockAncestor[];
}

interface LockHandle {
  readonly fd: number;
  readonly ownerName: string;
  readonly ownerPath: string;
  readonly directoryIdentity: FileIdentity;
  readonly ownerIdentity: FileIdentity;
}

export interface ExclusiveDirectoryLockHandle {
  readonly lockPath: string;
  assertOwned(): void;
  release(): void;
}

export interface ExclusiveDirectoryLockOptions {
  readonly reclaimStaleEmptyDirectory?: boolean;
  readonly reclaimStaleOwner?: boolean;
  readonly waitTimeoutMs?: number;
}

function resolveWaitTimeoutMs(value: number | undefined): number {
  if (value === undefined) return LOCK_WAIT_MS;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LOCK_WAIT_MS) {
    throw new Error(
      `invalid exclusive lock waitTimeoutMs: expected an integer from 1 to ${MAX_LOCK_WAIT_MS}`,
    );
  }
  return value;
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

function unsafeAncestor(path: string): Error {
  return new Error(`unsafe lock ancestor is not a stable real directory: ${path}`);
}

function prepareLockLocation(root: string, relativeLockPath: string): LockLocation {
  const absoluteRoot = resolve(root);
  const canonicalRoot = realpathSync(absoluteRoot);
  if (canonicalRoot !== absoluteRoot) throw unsafeAncestor(absoluteRoot);
  const lockPath = resolve(canonicalRoot, relativeLockPath);
  const normalizedRelative = relative(canonicalRoot, lockPath);
  if (!relativeLockPath
    || isAbsolute(relativeLockPath)
    || !normalizedRelative
    || normalizedRelative === '..'
    || normalizedRelative.startsWith(`..${sep}`)
    || isAbsolute(normalizedRelative)) {
    throw new Error(`unsafe lock path escapes its canonical root: ${relativeLockPath}`);
  }

  const parts = normalizedRelative.split(sep);
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`unsafe lock path components: ${relativeLockPath}`);
  }

  let current = canonicalRoot;
  const ancestors: LockAncestor[] = [];
  const rootStat = lstatSync(current);
  if (!rootStat.isDirectory()) throw unsafeAncestor(current);
  ancestors.push({ path: current, identity: fileIdentity(rootStat) });

  for (const component of parts.slice(0, -1)) {
    current = join(current, component);
    let currentStat;
    try {
      currentStat = lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError;
      }
      currentStat = lstatSync(current);
    }
    if (!currentStat.isDirectory()) throw unsafeAncestor(current);
    ancestors.push({ path: current, identity: fileIdentity(currentStat) });
  }
  return { lockPath, ancestors };
}

function assertLockAncestors(location: LockLocation): void {
  for (const ancestor of location.ancestors) {
    const current = lstatSync(ancestor.path);
    if (!current.isDirectory()
      || !sameFileIdentity(fileIdentity(current), ancestor.identity)) {
      throw unsafeAncestor(ancestor.path);
    }
  }
}

function removeOwnedLock(
  location: LockLocation,
  ownerPath: string,
  directoryIdentity: FileIdentity,
  ownerIdentity: FileIdentity,
): void {
  try {
    assertLockAncestors(location);
    const currentDirectory = lstatSync(location.lockPath);
    if (!currentDirectory.isDirectory()
      || !sameFileIdentity(fileIdentity(currentDirectory), directoryIdentity)) return;
    const currentOwner = lstatSync(ownerPath);
    if (currentOwner.isFile()
      && sameFileIdentity(fileIdentity(currentOwner), ownerIdentity)) unlinkSync(ownerPath);
  } catch {
    return;
  }
  try {
    assertLockAncestors(location);
    const currentDirectory = lstatSync(location.lockPath);
    if (currentDirectory.isDirectory()
      && sameFileIdentity(fileIdentity(currentDirectory), directoryIdentity)) rmdirSync(location.lockPath);
  } catch {
    // Another token, ancestor replacement, or unexpected entry keeps the lock closed.
  }
}

function removeUnpublishedLock(location: LockLocation, directoryIdentity: FileIdentity): void {
  try {
    assertLockAncestors(location);
    const currentDirectory = lstatSync(location.lockPath);
    if (currentDirectory.isDirectory()
      && sameFileIdentity(fileIdentity(currentDirectory), directoryIdentity)
      && readdirSync(location.lockPath).length === 0) rmdirSync(location.lockPath);
  } catch {
    // Fail closed when publication state or ancestor identity is uncertain.
  }
}

function ownsExclusiveToken(
  location: LockLocation,
  ownerPath: string,
  ownerName: string,
  directoryIdentity: FileIdentity,
  ownerIdentity: FileIdentity,
): boolean {
  try {
    assertLockAncestors(location);
    const currentDirectory = lstatSync(location.lockPath);
    if (!currentDirectory.isDirectory()
      || !sameFileIdentity(fileIdentity(currentDirectory), directoryIdentity)) return false;
    const entries = readdirSync(location.lockPath);
    if (entries.length !== 1 || entries[0] !== ownerName) return false;
    const currentOwner = lstatSync(ownerPath);
    return currentOwner.isFile()
      && sameFileIdentity(fileIdentity(currentOwner), ownerIdentity);
  } catch {
    return false;
  }
}

function reclaimStaleLockDirectory(
  location: LockLocation,
  reclaimStaleEmptyDirectory: boolean,
): boolean {
  assertLockAncestors(location);
  let observedDirectoryIdentity: FileIdentity;
  let observedDirectoryMtimeMs: number;
  try {
    const observedDirectory = lstatSync(location.lockPath);
    if (!observedDirectory.isDirectory()) return false;
    observedDirectoryIdentity = fileIdentity(observedDirectory);
    observedDirectoryMtimeMs = observedDirectory.mtimeMs;
  } catch {
    return false;
  }
  let entries: string[];
  try {
    entries = readdirSync(location.lockPath);
  } catch {
    return false;
  }
  if (entries.length === 0 && reclaimStaleEmptyDirectory) {
    if (Date.now() - observedDirectoryMtimeMs <= LOCK_STALE_MS) return false;
    try {
      assertLockAncestors(location);
      const currentDirectory = lstatSync(location.lockPath);
      if (!currentDirectory.isDirectory()
        || !sameFileIdentity(fileIdentity(currentDirectory), observedDirectoryIdentity)
        || readdirSync(location.lockPath).length !== 0) return false;
      // rmdir is the publication fence: a paused creator that publishes a
      // token first makes removal fail, while a creator resumed after removal
      // must still win the normal single-token ownership check before running.
      rmdirSync(location.lockPath);
      return true;
    } catch {
      return false;
    }
  }
  // The default remains fail closed for ownerless directories. Callers may
  // opt in only when their protocol permits a stale paused creator to lose the
  // acquisition and retry through the normal ownership check.
  if (entries.length !== 1) return false;

  const entry = entries[0];
  const observedToken = ownerTokenFromFileName(entry);
  if (observedToken === null) return false;
  const observedOwnerPath = join(location.lockPath, entry);
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
    const token = typeof lock.token === 'string' ? lock.token : null;
    reclaim = token === observedToken.token
      && pid === observedToken.pid
      && !ownerIsAlive(observedToken.pid);
  } catch {
    reclaim = Date.now() - observedOwnerMtimeMs > LOCK_STALE_MS
      && !ownerIsAlive(observedToken.pid);
  }
  if (!reclaim) return false;

  try {
    assertLockAncestors(location);
    const currentDirectory = lstatSync(location.lockPath);
    const currentOwner = lstatSync(observedOwnerPath);
    if (!currentDirectory.isDirectory()
      || !sameFileIdentity(fileIdentity(currentDirectory), observedDirectoryIdentity)
      || !currentOwner.isFile()
      || !sameFileIdentity(fileIdentity(currentOwner), observedOwnerIdentity)) return false;
    // Delete only the exact observed token. A legitimate new owner always has
    // a different UUID filename, so its token makes rmdir fail closed.
    unlinkSync(observedOwnerPath);
  } catch {
    return false;
  }
  try {
    assertLockAncestors(location);
    rmdirSync(location.lockPath);
    return true;
  } catch {
    // Another token or unexpected entry appeared; preserve it and fail closed.
    return false;
  }
}

export function acquireExclusiveDirectoryLock(
  canonicalRoot: string,
  relativeLockPath: string,
  options: ExclusiveDirectoryLockOptions = {},
): ExclusiveDirectoryLockHandle {
  const waitTimeoutMs = resolveWaitTimeoutMs(options.waitTimeoutMs);
  const location = prepareLockLocation(canonicalRoot, relativeLockPath);
  const deadline = Date.now() + waitTimeoutMs;
  let handle: LockHandle | null = null;

  while (handle === null) {
    assertLockAncestors(location);
    try {
      mkdirSync(location.lockPath, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        assertLockAncestors(location);
        if (!lstatSync(location.lockPath).isDirectory()) {
          throw new Error(`unsafe lock path is not a real directory: ${location.lockPath}`);
        }
      } catch (pathError) {
        if ((pathError as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw pathError;
      }
      if (options.reclaimStaleOwner !== false) {
        reclaimStaleLockDirectory(location, options.reclaimStaleEmptyDirectory === true);
      }
      if (Date.now() >= deadline) {
        throw new ExclusiveLockContentionError(
          `timed out waiting for exclusive lock ${location.lockPath}; `
          + 'verify the owner is not live before manual cleanup',
          location.lockPath,
          'timeout',
        );
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      continue;
    }

    const directoryStat = lstatSync(location.lockPath);
    if (!directoryStat.isDirectory()) {
      throw new Error(`unsafe lock path is not a real directory: ${location.lockPath}`);
    }
    const directoryIdentity = fileIdentity(directoryStat);
    assertLockAncestors(location);
    const token = `${process.pid}-${Date.now()}-${randomUUID()}`;
    const ownerName = ownerFileName(token);
    const ownerPath = join(location.lockPath, ownerName);
    let fd: number | null = null;
    let ownerIdentity: FileIdentity | null = null;
    try {
      fd = openSync(
        ownerPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      ownerIdentity = fileIdentity(fstatSync(fd));
      writeFileSync(fd, `${JSON.stringify({ pid: process.pid, created_at: Date.now(), token })}\n`);
      if (!ownsExclusiveToken(
        location,
        ownerPath,
        ownerName,
        directoryIdentity,
        ownerIdentity,
      )) {
        closeSync(fd);
        fd = null;
        removeOwnedLock(location, ownerPath, directoryIdentity, ownerIdentity);
        if (Date.now() >= deadline) {
          throw new ExclusiveLockContentionError(
            `lost exclusive lock ownership: ${location.lockPath}`,
            location.lockPath,
            'lost-ownership',
          );
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        continue;
      }
      handle = { fd, ownerName, ownerPath, directoryIdentity, ownerIdentity };
    } catch (error) {
      if (fd !== null) closeSync(fd);
      if (ownerIdentity !== null) {
        removeOwnedLock(location, ownerPath, directoryIdentity, ownerIdentity);
      } else {
        removeUnpublishedLock(location, directoryIdentity);
      }
      throw error;
    }
  }

  let released = false;
  return {
    lockPath: location.lockPath,
    assertOwned() {
      assertLockAncestors(location);
      if (!ownsExclusiveToken(
        location,
        handle.ownerPath,
        handle.ownerName,
        handle.directoryIdentity,
        handle.ownerIdentity,
      )) {
        throw new ExclusiveLockContentionError(
          `lost exclusive lock ownership: ${location.lockPath}`,
          location.lockPath,
          'lost-ownership',
        );
      }
    },
    release() {
      if (released) return;
      released = true;
      closeSync(handle.fd);
      removeOwnedLock(
        location,
        handle.ownerPath,
        handle.directoryIdentity,
        handle.ownerIdentity,
      );
    },
  };
}

export function withExclusiveDirectoryLock<T>(
  canonicalRoot: string,
  relativeLockPath: string,
  run: () => T,
  options: ExclusiveDirectoryLockOptions = {},
): T {
  const handle = acquireExclusiveDirectoryLock(canonicalRoot, relativeLockPath, options);
  try {
    handle.assertOwned();
    return run();
  } finally {
    handle.release();
  }
}
