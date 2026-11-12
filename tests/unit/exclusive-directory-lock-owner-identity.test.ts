import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  acquireExclusiveDirectoryLock,
  exclusiveDirectoryLockOwnerLiveness,
  ExclusiveLockContentionError,
  type ExclusiveDirectoryLockOwner,
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
    expect(exclusiveDirectoryLockOwnerLiveness(owner!)).toBe('dead');

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

  test('stale-owner callback errors reach acquisition at both proof checks and preserve the owner', () => {
    for (const failAt of [1, 2]) {
      const root = temporaryRoot();
      const ownerPath = forgeOwner(root, { pid: process.pid, start_time: `${currentProcessStartTime()}-earlier-process` });
      const before = readFileSync(ownerPath, 'utf-8');
      const failure = Object.assign(new Error('stale-owner probe failed'), { code: 'EIO' });
      let calls = 0;
      expect(() => acquireExclusiveDirectoryLock(root, LOCK, {
        waitTimeoutMs: 1,
        canReclaimStaleOwner: () => { if (++calls === failAt) throw failure; return true; },
      })).toThrow(failure);
      expect(calls).toBe(failAt);
      expect(readFileSync(ownerPath, 'utf-8')).toBe(before);
    }
  });

  test('owner liveness distinguishes absent, inaccessible and failed probes', () => {
    const kill = process.kill;
    const owner = { lockPath: '', pid: process.pid, startTime: null, token: '' };
    try {
      for (const [code, result] of [['ESRCH', 'dead'], ['EPERM', 'unverified'], ['EIO', null]] as const) {
        const failure = Object.assign(new Error(code), { code });
        process.kill = () => { throw failure; };
        if (result === null) {
          expect(() => exclusiveDirectoryLockOwnerLiveness(owner)).toThrow(failure);
          const root = temporaryRoot();
          const ownerPath = forgeOwner(root, { pid: owner.pid, start_time: 'recorded-start-time' });
          expect(() => acquireExclusiveDirectoryLock(root, LOCK, { waitTimeoutMs: 1 })).toThrow(failure);
          expect(existsSync(ownerPath)).toBe(true);
        } else expect(exclusiveDirectoryLockOwnerLiveness(owner)).toBe(result);
      }
    } finally { process.kill = kill; }
  });

  test('the process table reports a stable start time for a live PID and none for an exited one', () => {
    expect(readProcessStartTime(process.pid)).toBe(currentProcessStartTime());
    expect(readProcessStartTime(process.pid)).toBe(currentProcessStartTime());
    const exited = spawnSync(process.execPath, ['-e', '']);
    expect(exited.status).toBe(0);
    expect(readProcessStartTime(exited.pid)).toBeNull();
  });

  test('a killed child that the parent still holds has no start time', async () => {
    const child = spawn(process.execPath, ['-e', 'await Bun.stdin.text()'], { stdio: ['pipe', 'ignore', 'ignore'] });
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    expect(readProcessStartTime(child.pid!)).not.toBeNull();
    child.kill('SIGKILL');
    await exited;
    expect(readProcessStartTime(child.pid!)).toBeNull();
  });
});


test('reading the owner during real concurrent releases returns an owner or null without an ENOENT failure', async () => {
  const root = temporaryRoot();
  const module = join(import.meta.dir, '../../src/effects/locking/exclusive-directory-lock.ts');
  const code = `import { acquireExclusiveDirectoryLock } from ${JSON.stringify(module)};
    for (let i = 0; i < 200; i++) { const lock = acquireExclusiveDirectoryLock(process.argv[1], 'agent.lock'); lock.release(); }`;
  const child = Bun.spawn([process.execPath, '-e', code, root], { stdout: 'ignore', stderr: 'pipe' });
  const failures: string[] = [];
  try {
    for (let i = 0; i < 20_000; i++) {
      try { readExclusiveDirectoryLockOwner(root, 'agent.lock'); }
      catch (error) { failures.push(String(error)); }
    }
    expect(await child.exited).toBe(0);
    expect(await new Response(child.stderr).text()).toBe('');
    expect(failures).toEqual([]);
    expect(readExclusiveDirectoryLockOwner(root, 'agent.lock')).toBeNull();
    // The race handling must not hide unsafe-path errors.
    symlinkSync(root, join(root, 'agent.lock'));
    expect(() => readExclusiveDirectoryLockOwner(root, 'agent.lock')).toThrow('unsafe lock path');
  } finally { child.kill(); await child.exited; }
}, 60_000);

// Windows gives EPERM, not ENOENT, on a directory that a concurrent release left
// delete-pending (#2588). The injected readdir runs the release race, then fails.
function readOwnerWithWindowsEperm(root: string, race: (lockPath: string) => void): ExclusiveDirectoryLockOwner | null {
  const lockPath = join(root, LOCK);
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const readdir = spyOn(fs, 'readdirSync').mockImplementationOnce(() => {
    race(lockPath);
    throw Object.assign(new Error(`EPERM: operation not permitted, scandir '${lockPath}'`), { code: 'EPERM', syscall: 'scandir' });
  });
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  try { return readExclusiveDirectoryLockOwner(root, LOCK); } finally {
    Object.defineProperty(process, 'platform', platform);
    readdir.mockRestore();
  }
}

describe('windows EPERM on the owner read during a release', () => {
  test('a removed lock directory is no observed owner', () => {
    const root = temporaryRoot();
    forgeOwner(root, { pid: process.pid });
    expect(readOwnerWithWindowsEperm(root, lockPath => rmSync(lockPath, { recursive: true }))).toBeNull();
  });

  test('a lock directory that the next acquirer created is no observed owner', () => {
    const root = temporaryRoot();
    forgeOwner(root, { pid: process.pid });
    // Keep the old directory alive so the new one cannot reuse its inode.
    expect(readOwnerWithWindowsEperm(root, lockPath => {
      renameSync(lockPath, `${lockPath}.released`);
      mkdirSync(lockPath);
    })).toBeNull();
  });

  test('the same lock directory keeps the EPERM as a real access refusal', () => {
    const root = temporaryRoot();
    forgeOwner(root, { pid: process.pid });
    expect(() => readOwnerWithWindowsEperm(root, () => {})).toThrow('EPERM');
  });
});
