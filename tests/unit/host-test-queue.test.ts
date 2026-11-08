import { afterEach, describe, expect, test } from 'bun:test';
import { spawn } from 'child_process';
import { mkdtempSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import {
  enterHostTestQueue,
  HOST_TEST_QUEUE_HOLDER_ENV,
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

  test('a killed holder is seen as dead and its lock is freed for the next run', async () => {
    const env = queueEnv();
    const holderEnv = { ...process.env, ...env };
    delete holderEnv[HOST_TEST_QUEUE_HOLDER_ENV];
    // The child command ends when its parent, the queue holder, is gone.
    const holder = spawn('bun', ['scripts/host-test-queue.ts', 'run', '--kind', 'full', '--', 'sh', '-c', 'while kill -0 $PPID 2>/dev/null; do sleep 0.1; done'], {
      cwd: ROOT,
      env: holderEnv,
      stdio: 'ignore',
    });
    await until(() => readHostTestQueueState(env).holder?.entry);
    holder.kill('SIGKILL');
    await until(() => readHostTestQueueState(env).holder?.liveness === 'dead' || null);

    const next = await enter(env, 'affected', 'next');
    const state = readHostTestQueueState(env);
    expect(state.holder?.pid).toBe(process.pid);
    expect(state.holder?.entry?.command).toEqual(['next']);
    expect(state.waiting).toEqual([]);
    next.release();
  });
});
