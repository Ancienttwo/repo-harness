import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { spawn } from 'child_process';
import * as fs from 'fs';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import {
  enterHostTestQueue,
  HOST_TEST_QUEUE_HOLDER_ENV,
  isHostTestQueueHolder,
  readHostTestQueueState,
  type HostTestQueueHandle,
  type HostTestRunKind,
} from '../../src/effects/locking/host-test-queue.ts';

const ROOT = resolve(import.meta.dir, '../..');
const roots: string[] = [];

function queueEnv(): NodeJS.ProcessEnv {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rh-host-test-queue-')));
  roots.push(root);
  return { REPO_HARNESS_HOME: join(root, '.repo-harness') };
}

function enter(env: NodeJS.ProcessEnv, kind: HostTestRunKind, label: string): Promise<HostTestQueueHandle> {
  return enterHostTestQueue({ kind, cwd: ROOT, command: [label] }, { env, pollMs: 10 });
}

async function until<T>(read: () => T | null | undefined): Promise<T> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const value = read();
    if (value !== null && value !== undefined) return value;
    await Bun.sleep(10);
  }
  throw new Error('condition not reached');
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('host test queue', () => {
  test.each(['ESRCH', 'EPERM', 'EINVAL', undefined])('process liveness: group probe %s controls queue state and preserves tickets on error', async code => {
    const env = queueEnv(), pid = 2_147_483_647, pgid = pid - 1;
    const directory = join(env.REPO_HARNESS_HOME!, 'host-test-queue', 'tickets');
    mkdirSync(directory, { recursive: true });
    const ticket = join(directory, '0-holder.json');
    writeFileSync(ticket, JSON.stringify({ token: 'holder', pid, start_time: 'exited', kind: 'full', cwd: ROOT,
      command: ['holder'], enqueued_at: new Date().toISOString(), acquired_at: null, lock_token: null, pgid }));
    const originalKill = process.kill;
    const error = Object.assign(new Error('group probe failed'), { code });
    const probe = spyOn(process, 'kill').mockImplementation((target, signal) => {
      if (target === pid && signal === 0) throw Object.assign(new Error('wrapper exited'), { code: 'ESRCH' });
      if (target === -pgid && signal === 0) throw error;
      return originalKill(target, signal);
    });
    try {
      if (code === 'ESRCH' || code === 'EPERM') {
        expect(readHostTestQueueState(env).waiting[0]?.liveness).toBe(code === 'ESRCH' ? 'dead' : 'live');
      } else {
        expect(() => readHostTestQueueState(env)).toThrow(error);
        await expect(enter(env, 'affected', 'next')).rejects.toThrow(error);
        expect(existsSync(ticket)).toBe(true);
      }
    } finally { probe.mockRestore(); }
  });

  test('a free queue grants the run, shows its holder and is free after release', async () => {
    const env = queueEnv();
    const handle = await enter(env, 'affected', 'first');
    const state = readHostTestQueueState(env);
    expect(state.holder?.pid).toBe(process.pid);
    expect(state.holder?.entry?.command).toEqual(['first']);
    expect(state.holder?.entry?.acquiredAt).not.toBeNull();
    expect(state.waiting).toEqual([]);
    handle.release();
    expect(readHostTestQueueState(env)).toMatchObject({ holder: null, waiting: [] });
  });

  test('every run waits for the holder, and a release check runs before an earlier affected run', async () => {
    const env = queueEnv();
    const full = await enter(env, 'full', 'full');
    const order: string[] = [];
    const affected = enter(env, 'affected', 'affected').then((handle) => { order.push('affected'); return handle; });
    await until(() => readHostTestQueueState(env).waiting.length === 1 || null);
    const release = enter(env, 'release', 'release').then((handle) => { order.push('release'); return handle; });
    const waiting = await until(() => {
      const state = readHostTestQueueState(env);
      return state.waiting.length === 2 ? state.waiting : null;
    });
    expect(waiting.map((entry) => entry.command[0])).toEqual(['release', 'affected']);
    await Bun.sleep(50);
    expect(order).toEqual([]);

    full.release();
    const releaseHandle = await release;
    await Bun.sleep(50);
    expect(order).toEqual(['release']);
    releaseHandle.release();
    (await affected).release();
    expect(order).toEqual(['release', 'affected']);
  });

  test('only the live lock owner run id skips the queue', async () => {
    const env = queueEnv();
    const handle = await enter(env, 'affected', 'holder');
    expect(isHostTestQueueHolder({ ...env, [HOST_TEST_QUEUE_HOLDER_ENV]: handle.token })).toBe(true);
    expect(isHostTestQueueHolder({ ...env, [HOST_TEST_QUEUE_HOLDER_ENV]: 'foreign' })).toBe(false);
    handle.release();
    expect(isHostTestQueueHolder({ ...env, [HOST_TEST_QUEUE_HOLDER_ENV]: handle.token })).toBe(false);
  });

  test('a killed wrapper keeps the lock while its command group runs, and the next run gets it after the group ends', async () => {
    const env = queueEnv();
    const holderEnv = { ...process.env, ...env };
    delete holderEnv[HOST_TEST_QUEUE_HOLDER_ENV];
    const wrapper = spawn('bun', ['scripts/host-test-queue.ts', 'run', '--kind', 'full', '--', 'sleep', '30'], { cwd: ROOT, env: holderEnv, stdio: 'ignore' });
    const pgid = await until(() => readHostTestQueueState(env).holder?.entry?.pgid);
    wrapper.kill('SIGKILL');
    await until(() => (wrapper.exitCode !== null || wrapper.signalCode !== null) || null);
    expect(readHostTestQueueState(env).holder?.liveness).toBe('live');

    let granted = false;
    const next = enter(env, 'affected', 'next').then((handle) => { granted = true; return handle; });
    await Bun.sleep(300);
    expect(granted).toBe(false);
    process.kill(-pgid, 'SIGKILL');

    const handle = await next;
    const state = readHostTestQueueState(env);
    expect(state.holder?.pid).toBe(process.pid);
    expect(state.holder?.entry?.command).toEqual(['next']);
    expect(state.waiting).toEqual([]);
    handle.release();
  });

  test('an empty lock directory left by a killed publisher is freed', async () => {
    const env = queueEnv();
    const lock = join(env.REPO_HARNESS_HOME!, 'host-test-queue', 'holder.lock');
    mkdirSync(lock, { recursive: true });
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    const handle = await enter(env, 'affected', 'after-empty');
    expect(readHostTestQueueState(env).holder?.entry?.command).toEqual(['after-empty']);
    handle.release();
  });

  // Windows gives EPERM, not ENOENT, on a ticket that another member just
  // unlinked (#2609), until the delete ends (#2615).
  test.each([
    ['a ticket that the other member unlinked is skipped', 'unlinked'],
    ['a ticket that is still there after the EPERM clears is read', 'cleared'],
    ['a ticket that keeps an EPERM past the bound is a real access refusal', 'refused'],
  ] as const)('windows EPERM on the ticket read: %s', (_name, race) => {
    const env = queueEnv();
    const directory = join(env.REPO_HARNESS_HOME!, 'host-test-queue', 'tickets');
    mkdirSync(directory, { recursive: true });
    const ticket = join(directory, '1-000000000000000-other.json');
    writeFileSync(ticket, JSON.stringify({
      token: 'other', pid: process.pid, start_time: 'start', kind: 'affected', cwd: ROOT, command: ['other'],
      enqueued_at: new Date(0).toISOString(), acquired_at: null, lock_token: null, pgid: null,
    }));
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    const fail = () => {
      if (race === 'unlinked') rmSync(ticket);
      throw Object.assign(new Error(`EPERM: operation not permitted, open '${ticket}'`), { code: 'EPERM', syscall: 'open' });
    };
    const read = race === 'refused' ? spyOn(fs, 'readFileSync').mockImplementation(fail) : spyOn(fs, 'readFileSync').mockImplementationOnce(fail);
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    try {
      if (race === 'refused') expect(() => readHostTestQueueState(env)).toThrow('EPERM');
      else expect(readHostTestQueueState(env).waiting.map(entry => entry.token)).toEqual(race === 'cleared' ? ['other'] : []);
    } finally {
      Object.defineProperty(process, 'platform', platform);
      read.mockRestore();
    }
  });
});
