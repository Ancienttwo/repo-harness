import { afterEach, describe, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  acquireExclusiveDirectoryLock,
  exclusiveDirectoryLockOwnerLiveness,
  ExclusiveLockContentionError,
  readExclusiveDirectoryLockOwner,
} from '../../src/effects/locking/exclusive-directory-lock';
import { currentProcessStartTime, readProcessStartTime } from '../../src/effects/locking/process-start-time';

const LOCK = 'locks/owner.lock';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-lock-owner-identity-')));
  roots.push(root);
  return root;
}

function forgeOwner(root: string, record: Record<string, unknown> & { readonly pid: number }): string {
  const lockPath = join(root, LOCK);
  const token = `${record.pid}-${Date.now()}-00000000-0000-4000-8000-000000000915`;
  const ownerPath = join(lockPath, `${token}.json`);
  mkdirSync(lockPath, { recursive: true, mode: 0o700 });
  writeFileSync(ownerPath, `${JSON.stringify({ ...record, created_at: Date.now() - 60_000, token })}\n`, { mode: 0o600 });
  return ownerPath;
}

function acquireOnce(root: string, reclaimed: string[]): void {
  acquireExclusiveDirectoryLock(root, LOCK, { waitTimeoutMs: 1, onStaleReclaim: path => reclaimed.push(path) }).release();
}

describe('exclusive directory lock owner identity', () => {
  test('the published owner record carries the OS start time of the owner process', () => {
    const root = temporaryRoot();
    const lock = acquireExclusiveDirectoryLock(root, LOCK);
    try {
      const [entry] = readdirSync(lock.lockPath);
      const record = JSON.parse(readFileSync(join(lock.lockPath, entry!), 'utf-8')) as Record<string, unknown>;
      expect(record.pid).toBe(process.pid);
      expect(record.start_time).toBe(currentProcessStartTime());
      expect(readExclusiveDirectoryLockOwner(root, LOCK)).toEqual({
        lockPath: lock.lockPath, pid: process.pid, startTime: currentProcessStartTime(), token: lock.ownerToken,
      });
    } finally {
      lock.release();
    }
  });

  test('a live PID with a different start time is a reused PID and its lock is stale', () => {
    const root = temporaryRoot();
    const ownerPath = forgeOwner(root, { pid: process.pid, start_time: `${currentProcessStartTime()}-earlier-process` });
    const owner = readExclusiveDirectoryLockOwner(root, LOCK);
    expect(owner).not.toBeNull();
    expect(exclusiveDirectoryLockOwnerLiveness(owner!)).toBe('dead');

    const reclaimed: string[] = [];
    acquireOnce(root, reclaimed);
    expect(reclaimed).toEqual([join(root, LOCK)]);
    expect(existsSync(ownerPath)).toBe(false);
    expect(existsSync(join(root, LOCK))).toBe(false);
  });

  test('another live process keeps its lock only while its start time matches the record', async () => {
    const root = temporaryRoot();
    // The child blocks on stdin, so it stays alive until the test closes the pipe.
    const child = spawn(process.execPath, ['-e', 'await Bun.stdin.text()'], { stdio: ['pipe', 'ignore', 'ignore'] });
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    try {
      const startTime = readProcessStartTime(child.pid!);
      expect(startTime).not.toBeNull();

      const liveOwner = forgeOwner(root, { pid: child.pid!, start_time: startTime });
      expect(() => acquireExclusiveDirectoryLock(root, LOCK, { waitTimeoutMs: 1 })).toThrow(ExclusiveLockContentionError);
      expect(existsSync(liveOwner)).toBe(true);
      rmSync(join(root, LOCK), { recursive: true, force: true });

      forgeOwner(root, { pid: child.pid!, start_time: `${startTime}-earlier-process` });
      const reclaimed: string[] = [];
      acquireOnce(root, reclaimed);
      expect(reclaimed).toEqual([join(root, LOCK)]);
    } finally {
      child.stdin!.end();
      await exited;
    }
  });

  test('an owner record without a start time is never proven stale, even with a dead PID', () => {
    const root = temporaryRoot();
    const exited = spawnSync(process.execPath, ['-e', '']);
    expect(exited.status).toBe(0);
    const ownerPath = forgeOwner(root, { pid: exited.pid });
    const owner = readExclusiveDirectoryLockOwner(root, LOCK);
    expect(owner).toEqual({
      lockPath: join(root, LOCK), pid: exited.pid, startTime: null, token: expect.any(String),
    });
    expect(exclusiveDirectoryLockOwnerLiveness(owner!)).toBe('unverified');

    expect(() => acquireExclusiveDirectoryLock(root, LOCK, { waitTimeoutMs: 1 })).toThrow(ExclusiveLockContentionError);
    expect(existsSync(ownerPath)).toBe(true);
  });

  test('#973: a pre-#934 owner record { pid, created_at, token } still identifies its owner', () => {
    const root = temporaryRoot();
    const ownerPath = forgeOwner(root, { pid: process.pid });
    const token = ownerPath.slice(join(root, LOCK).length + 1, -'.json'.length);
    expect(Object.keys(JSON.parse(readFileSync(ownerPath, 'utf-8'))).sort()).toEqual(['created_at', 'pid', 'token']);
    const owner = readExclusiveDirectoryLockOwner(root, LOCK);
    expect(owner).toEqual({ lockPath: join(root, LOCK), pid: process.pid, startTime: null, token });
    expect(exclusiveDirectoryLockOwnerLiveness(owner!)).toBe('unverified');

    expect(() => acquireExclusiveDirectoryLock(root, LOCK, { waitTimeoutMs: 1 })).toThrow(ExclusiveLockContentionError);
    expect(existsSync(ownerPath)).toBe(true);
  });

  test('an owner record whose pid or token does not match its file name has no owner', () => {
    const root = temporaryRoot();
    const ownerPath = forgeOwner(root, { pid: process.pid });
    const record = JSON.parse(readFileSync(ownerPath, 'utf-8')) as Record<string, unknown>;
    writeFileSync(ownerPath, `${JSON.stringify({ ...record, pid: process.pid + 1 })}\n`);
    expect(readExclusiveDirectoryLockOwner(root, LOCK)).toBeNull();
    writeFileSync(ownerPath, `${JSON.stringify({ ...record, token: `${record.token}-forged` })}\n`);
    expect(readExclusiveDirectoryLockOwner(root, LOCK)).toBeNull();
  });

  test('the process table reports a stable start time for a live PID and none for an exited one', () => {
    expect(readProcessStartTime(process.pid)).toBe(currentProcessStartTime());
    expect(readProcessStartTime(process.pid)).toBe(currentProcessStartTime());
    const exited = spawnSync(process.execPath, ['-e', '']);
    expect(exited.status).toBe(0);
    expect(readProcessStartTime(exited.pid)).toBeNull();
  });
});
