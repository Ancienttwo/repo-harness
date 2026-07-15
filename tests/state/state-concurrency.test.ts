import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { spawn, spawnSync } from 'child_process';
import { commitFixture, resolveFixtureState, createEffectiveStateFixture, writeFixture, writeFixtureStateLock } from './effective-state-fixture';
import { ROOT } from './effective-state-fixture';
import { stateVersionOwnerPath } from '../../src/effects/state/git-state-version-store';
import { resolveEffectiveState } from '../../src/effects/state/resolve-effective-state';
import type { StateCacheWriteEffects } from '../../src/effects/state/state-cache';
import { withStateLock } from '../../src/effects/state/state-lock';

function releaseLockAfter(ownerPath: string, lockPath: string, delaySeconds: string): void {
  const child = spawn('sh', [
    '-c',
    'sleep "$1"; rm -f "$2"; rmdir "$3"',
    'release-effective-state-lock',
    delaySeconds,
    ownerPath,
    lockPath,
  ], { stdio: 'ignore' });
  child.unref();
}

function versionOwner(cwd: string): string {
  return stateVersionOwnerPath(cwd);
}

describe('Effective State lock and source-stability characterization', () => {
  test('a live lock waits for its owner to release instead of being reclaimed', () => {
    const fixture = createEffectiveStateFixture();
    try {
      const lockPath = join(fixture.cwd, '.ai/harness/state/effective.lock');
      const { ownerPath } = writeFixtureStateLock(fixture.cwd, {
        pid: process.pid,
        created_at: Date.now() - 60_000,
        token: `${process.pid}-0-00000000-0000-4000-8000-000000000005`,
      });
      releaseLockAfter(ownerPath, lockPath, '0.15');
      const started = performance.now();
      const state = resolveFixtureState(fixture.cwd);
      const elapsedMs = performance.now() - started;
      expect(state.task_id).toBe('20260712-2327-effective-fixture');
      expect(elapsedMs).toBeGreaterThanOrEqual(80);
      expect(elapsedMs).toBeLessThan(5_000);
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  }, 10_000);

  test('a stale lock with a dead owner is reclaimed', () => {
    const fixture = createEffectiveStateFixture();
    try {
      const lockPath = join(fixture.cwd, '.ai/harness/state/effective.lock');
      writeFixtureStateLock(fixture.cwd, {
        pid: 99999999,
        created_at: Date.now() - 60_000,
        token: '99999999-0-00000000-0000-4000-8000-000000000001',
      });
      expect(resolveFixtureState(fixture.cwd).task_id).toBe('20260712-2327-effective-fixture');
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test('concurrent stale reclaimers preserve exclusive critical-section ownership', async () => {
    const fixture = createEffectiveStateFixture();
    const startPath = join(fixture.cwd, '.ai/harness/state/reclaim-start');
    const criticalDir = join(fixture.cwd, '.ai/harness/state/reclaim-critical');
    const stateLockModule = join(ROOT, 'src/effects/state/state-lock.ts');
    const workerCount = 12;
    const workerScript = `
      import { existsSync, unlinkSync, writeFileSync } from 'fs';
      import { join } from 'path';
      const lock = await import(process.env.STATE_LOCK_MODULE);
      while (!existsSync(process.env.START_PATH)) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
      lock.withStateLock(process.env.TEST_REPO, () => {
        const marker = join(process.env.CRITICAL_DIR, process.env.WORKER_ID);
        writeFileSync(marker, 'owned\\n');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
        unlinkSync(marker);
      });
    `;
    try {
      writeFixtureStateLock(fixture.cwd, {
        pid: 99999999,
        created_at: Date.now() - 60_000,
        token: '99999999-0-00000000-0000-4000-8000-000000000002',
      });
      mkdirSync(criticalDir, { recursive: true });
      let completed = 0;
      const workers = Array.from({ length: workerCount }, (_, index) => Bun.spawn(['bun', '-e', workerScript], {
        cwd: ROOT,
        env: {
          ...process.env,
          STATE_LOCK_MODULE: stateLockModule,
          START_PATH: startPath,
          TEST_REPO: fixture.cwd,
          CRITICAL_DIR: criticalDir,
          WORKER_ID: `worker-${index}`,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      }));
      const results = workers.map(async (worker) => {
        const [exitCode, stderr] = await Promise.all([
          worker.exited,
          new Response(worker.stderr).text(),
        ]);
        completed += 1;
        return { exitCode, stderr };
      });
      writeFixture(fixture.cwd, '.ai/harness/state/reclaim-start', 'go\n');
      let maxConcurrent = 0;
      while (completed < workerCount) {
        maxConcurrent = Math.max(maxConcurrent, readdirSync(criticalDir).length);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 1));
      }
      const settled = await Promise.all(results);
      expect(settled.map((result) => result.exitCode), settled.map((result) => result.stderr).filter(Boolean).join('\n'))
        .toEqual(Array(workerCount).fill(0));
      expect(maxConcurrent).toBe(1);
      expect(existsSync(join(fixture.cwd, '.ai/harness/state/effective.lock'))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  }, 20_000);

  test('a delayed live creator in the aged empty pre-token window cannot overlap a contender', async () => {
    const fixture = createEffectiveStateFixture();
    const stateDir = join(fixture.cwd, '.ai/harness/state');
    const lockPath = join(stateDir, 'effective.lock');
    const readyPath = join(stateDir, 'empty-owner-ready');
    const goPath = join(stateDir, 'empty-owner-go');
    const finishedPath = join(stateDir, 'empty-owner-finished');
    const criticalDir = join(stateDir, 'empty-owner-critical');
    const ownerScript = `
      import { closeSync, existsSync, mkdirSync, openSync, rmdirSync, unlinkSync, utimesSync, writeFileSync } from 'fs';
      import { join } from 'path';
      const token = \`\${process.pid}-0-00000000-0000-4000-8000-000000000004\`;
      const ownerPath = join(process.env.LOCK_PATH, \`\${token}.json\`);
      mkdirSync(process.env.LOCK_PATH, { mode: 0o700 });
      const old = new Date(Date.now() - 60_000);
      utimesSync(process.env.LOCK_PATH, old, old);
      writeFileSync(process.env.READY_PATH, 'ready\\n');
      while (!existsSync(process.env.GO_PATH)) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      const fd = openSync(ownerPath, 'wx', 0o600);
      writeFileSync(fd, \`\${JSON.stringify({ pid: process.pid, created_at: Date.now(), token })}\\n\`);
      const marker = join(process.env.CRITICAL_DIR, 'empty-owner');
      writeFileSync(marker, 'owned\\n');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
      unlinkSync(marker);
      writeFileSync(process.env.FINISHED_PATH, 'finished\\n');
      closeSync(fd);
      try { unlinkSync(ownerPath); } catch {}
      try { rmdirSync(process.env.LOCK_PATH); } catch {}
    `;
    try {
      mkdirSync(criticalDir, { recursive: true });
      const owner = Bun.spawn(['bun', '-e', ownerScript], {
        cwd: ROOT,
        env: {
          ...process.env,
          LOCK_PATH: lockPath,
          READY_PATH: readyPath,
          GO_PATH: goPath,
          FINISHED_PATH: finishedPath,
          CRITICAL_DIR: criticalDir,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const readyDeadline = Date.now() + 5_000;
      while (!existsSync(readyPath) && Date.now() < readyDeadline) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
      }
      expect(existsSync(readyPath)).toBe(true);
      expect(existsSync(lockPath)).toBe(true);
      expect(readdirSync(criticalDir)).toEqual([]);
      writeFileSync(goPath, 'go\n');
      withStateLock(fixture.cwd, () => {
        expect(existsSync(finishedPath)).toBe(true);
        expect(readdirSync(criticalDir)).toEqual([]);
      });
      const [ownerExit, ownerStderr] = await Promise.all([
        owner.exited,
        new Response(owner.stderr).text(),
      ]);
      expect(ownerExit, ownerStderr).toBe(0);
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  }, 15_000);

  test('an aged token whose PID is live or reused stays fail-closed for manual recovery', async () => {
    const fixture = createEffectiveStateFixture();
    const stateLockModule = join(ROOT, 'src/effects/state/state-lock.ts');
    const enteredPath = join(fixture.cwd, '.ai/harness/state/reused-pid-entered');
    try {
      const { lockPath, ownerPath } = writeFixtureStateLock(fixture.cwd, {
        pid: process.pid,
        created_at: Date.now() - 60_000,
        token: `${process.pid}-0-00000000-0000-4000-8000-000000000006`,
      });
      const worker = Bun.spawn(['bun', '-e', `
        const lock = await import(process.env.STATE_LOCK_MODULE);
        const fs = await import('fs');
        try {
          lock.withStateLock(process.env.TEST_REPO, () => fs.writeFileSync(process.env.ENTERED_PATH, 'entered\\n'));
        } catch (error) {
          process.stderr.write(String(error.message));
          process.exit(7);
        }
      `], {
        cwd: ROOT,
        env: {
          ...process.env,
          STATE_LOCK_MODULE: stateLockModule,
          TEST_REPO: fixture.cwd,
          ENTERED_PATH: enteredPath,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [exitCode, stderr] = await Promise.all([
        worker.exited,
        new Response(worker.stderr).text(),
      ]);
      expect(exitCode).toBe(7);
      expect(stderr).toContain('timed out waiting for exclusive lock');
      expect(existsSync(enteredPath)).toBe(false);
      expect(existsSync(ownerPath)).toBe(true);
      expect(readdirSync(lockPath)).toEqual([basename(ownerPath)]);
    } finally {
      fixture.cleanup();
    }
  }, 8_000);

  test('linked worktrees share one Git common-dir version owner', () => {
    const fixture = createEffectiveStateFixture();
    const linked = `${fixture.cwd}-linked`;
    let linkedCreated = false;
    try {
      const first = resolveFixtureState(fixture.cwd);
      const add = spawnSync('git', ['worktree', 'add', '-b', 'linked-state-version', linked], {
        cwd: fixture.cwd,
        encoding: 'utf-8',
      });
      if (add.status !== 0) throw new Error(add.stderr);
      linkedCreated = true;
      writeFixture(linked, '.ai/harness/active-worktree', `${linked}\n`);
      const second = resolveFixtureState(linked);
      const third = resolveFixtureState(fixture.cwd);
      expect(versionOwner(fixture.cwd)).toBe(versionOwner(linked));
      expect(second.state_version).toBe(first.state_version + 1);
      expect(third.state_version).toBe(second.state_version + 1);
    } finally {
      if (linkedCreated) {
        spawnSync('git', ['worktree', 'remove', '--force', linked], {
          cwd: fixture.cwd,
          encoding: 'utf-8',
        });
      }
      fixture.cleanup();
    }
  }, 10_000);

  test('a linked-worktree cache publication failure does not consume the shared next version', () => {
    const fixture = createEffectiveStateFixture();
    const linked = `${fixture.cwd}-linked-publication-failure`;
    let linkedCreated = false;
    try {
      const first = resolveFixtureState(fixture.cwd);
      const add = spawnSync('git', ['worktree', 'add', '-b', 'linked-state-publication-failure', linked], {
        cwd: fixture.cwd,
        encoding: 'utf-8',
      });
      if (add.status !== 0) throw new Error(add.stderr);
      linkedCreated = true;
      writeFixture(linked, '.ai/harness/active-worktree', `${linked}\n`);
      const cache: StateCacheWriteEffects = {
        writeTemp(path, content) { writeFileSync(path, content, { mode: 0o600 }); },
        publish() { throw new Error('injected linked cache publish failure'); },
        removeTemp(path) { rmSync(path, { force: true }); },
      };
      expect(() => resolveEffectiveState(linked, Date.now(), {
        targetPaths: ['src/feature.ts'],
        operationKind: 'feature',
      }, { cache })).toThrow('injected linked cache publish failure');
      expect(JSON.parse(readFileSync(versionOwner(fixture.cwd), 'utf-8')).version)
        .toBe(first.state_version);
      expect(resolveFixtureState(linked).state_version).toBe(first.state_version + 1);
      expect(versionOwner(fixture.cwd)).toBe(versionOwner(linked));
    } finally {
      if (linkedCreated) {
        spawnSync('git', ['worktree', 'remove', '--force', linked], {
          cwd: fixture.cwd,
          encoding: 'utf-8',
        });
      }
      fixture.cleanup();
    }
  }, 10_000);

  test('linked worktrees serialize concurrent version allocations through the shared owner', async () => {
    const fixture = createEffectiveStateFixture();
    const linked = `${fixture.cwd}-linked-concurrent`;
    const startPath = join(fixture.cwd, '.ai/harness/state/version-start');
    let linkedCreated = false;
    const versionStoreModule = join(ROOT, 'src/effects/state/git-state-version-store.ts');
    const workerScript = `
      import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
      import { join } from 'path';
      const store = await import(process.env.VERSION_STORE_MODULE);
      while (!existsSync(process.env.START_PATH)) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
      const publicationPath = join(
        process.env.TEST_REPO,
        '.ai/harness/state',
        \`version-publication-\${process.env.WORKER_ID}.json\`,
      );
      mkdirSync(join(publicationPath, '..'), { recursive: true });
      const version = store.commitStateVersionAfter(
        process.env.TEST_REPO,
        process.env.REVISION,
        (candidate) => {
          writeFileSync(publicationPath, String(candidate));
          return { rollback() { try { unlinkSync(publicationPath); } catch {} } };
        },
      );
      process.stdout.write(String(version));
    `;
    try {
      const add = spawnSync('git', ['worktree', 'add', '-b', 'linked-state-version-concurrent', linked], {
        cwd: fixture.cwd,
        encoding: 'utf-8',
      });
      if (add.status !== 0) throw new Error(add.stderr);
      linkedCreated = true;
      const workerCount = 12;
      const workers = Array.from({ length: workerCount }, (_, index) => Bun.spawn(['bun', '-e', workerScript], {
        cwd: ROOT,
        env: {
          ...process.env,
          VERSION_STORE_MODULE: versionStoreModule,
          START_PATH: startPath,
          TEST_REPO: index % 2 === 0 ? fixture.cwd : linked,
          REVISION: `revision-${index}`,
          WORKER_ID: String(index),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      }));
      writeFixture(fixture.cwd, '.ai/harness/state/version-start', 'go\n');
      const results = await Promise.all(workers.map(async (worker) => {
        const [exitCode, stdout, stderr] = await Promise.all([
          worker.exited,
          new Response(worker.stdout).text(),
          new Response(worker.stderr).text(),
        ]);
        return { exitCode, stdout, stderr };
      }));
      expect(results.map((result) => result.exitCode), results.map((result) => result.stderr).filter(Boolean).join('\n'))
        .toEqual(Array(workerCount).fill(0));
      const versions = results.map((result) => Number.parseInt(result.stdout, 10)).sort((a, b) => a - b);
      expect(versions).toEqual(Array.from({ length: workerCount }, (_, index) => index + 1));
      expect(JSON.parse(readFileSync(versionOwner(fixture.cwd), 'utf-8')).version).toBe(workerCount);
      expect(versionOwner(fixture.cwd)).toBe(versionOwner(linked));
    } finally {
      if (linkedCreated) {
        spawnSync('git', ['worktree', 'remove', '--force', linked], {
          cwd: fixture.cwd,
          encoding: 'utf-8',
        });
      }
      fixture.cleanup();
    }
  }, 20_000);

  test('continuous capability-registry mutation overlaps resolution and fails without a partial cache', async () => {
    const fixture = createEffectiveStateFixture();
    try {
      const registryPath = join(fixture.cwd, '.ai/context/capabilities.json');
      writeFixture(fixture.cwd, '.ai/context/capabilities.json', '{"version":1,"capabilities":[]}\n');
      commitFixture(fixture.cwd, 'seed capability registry mutation fixture');
      const lockPath = join(fixture.cwd, '.ai/harness/state/effective.lock');
      const startedPath = join(fixture.cwd, '.ai/harness/state/mutator-started');
      const stopPath = join(fixture.cwd, '.ai/harness/state/mutator-stop');
      const counterPath = join(fixture.cwd, '.ai/harness/state/mutator-count');
      const { ownerPath } = writeFixtureStateLock(fixture.cwd, {
        pid: process.pid,
        created_at: Date.now(),
        token: 'mutation-barrier',
      });
      const mutator = spawn('sh', [
        '-c',
        [
          'i=0',
          'printf "started\\n" > "$2"',
          'printf " " >> "$1"',
          'i=$((i + 1))',
          'printf "%s\\n" "$i" > "$5"',
          'rm -f "$3"',
          'rmdir "$4"',
          'while [ ! -f "$6" ]; do',
          '  printf " " >> "$1"',
          '  i=$((i + 1))',
          'done',
          'printf "%s\\n" "$i" > "$5"',
        ].join('\n'),
        'mutate-effective-state-source',
        registryPath,
        startedPath,
        ownerPath,
        lockPath,
        counterPath,
        stopPath,
      ], { stdio: 'ignore' });
      const mutatorDone = new Promise<void>((resolvePromise, rejectPromise) => {
        mutator.once('exit', (code) => code === 0
          ? resolvePromise()
          : rejectPromise(new Error(`fixture mutator exited ${code}`)));
        mutator.once('error', rejectPromise);
      });
      const barrier = spawnSync('sh', ['-c', 'i=0; while [ ! -f "$1" ]; do i=$((i + 1)); [ "$i" -lt 500 ] || exit 1; sleep 0.01; done', 'wait-mutator', startedPath]);
      expect(barrier.status).toBe(0);
      const beforeCount = Number.parseInt(readFileSync(counterPath, 'utf-8'), 10);
      let failure: Error | null = null;
      try {
        resolveFixtureState(fixture.cwd);
      } catch (error) {
        failure = error as Error;
      } finally {
        writeFileSync(stopPath, 'stop\n');
      }
      await mutatorDone;

      const cachePath = join(fixture.cwd, '.ai/harness/state/effective.json');
      const afterCount = Number.parseInt(readFileSync(counterPath, 'utf-8'), 10);
      expect(afterCount).toBeGreaterThan(beforeCount);
      expect(failure?.message).toBe('workflow authority changed repeatedly while resolving effective state');
      expect(existsSync(cachePath)).toBe(false);
      expect(existsSync(stateVersionOwnerPath(fixture.cwd))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  }, 15_000);
});
