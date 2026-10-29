/**
 * Shared task locks and worktree cleanup over a real Git repository.
 *
 * Real filesystem, real `git rev-parse --git-common-dir`, real linked
 * worktree. Every hazard here is a filesystem-ordering hazard, so a mocked fs
 * would prove nothing about `mkdir` atomicity or the crash windows.
 */
import { controlledWorktreeProcessPreload, setControlledWorktreeProcesses } from './helpers/controlled-worktree-processes';
import { afterAll, describe, expect, test } from 'bun:test';
import { recordWorktree, readWorktreeRecordById } from '../src/effects/git/worktree-record';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import { execFileSync, spawn, spawnSync } from 'child_process';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fixtureTaskId } from './helpers/sprint-fixture';
import { taskLockRelativePath, withTaskLock } from '../src/effects/locking/task-lock';
import { resolveGitCommonDirectory } from '../src/effects/git/common-directory';
import { withExclusiveDirectoryLock } from '../src/effects/locking/exclusive-directory-lock';

const FIXTURES = new Set<string>();
const REPO_ROOT = join(import.meta.dir, '..');

function run(cwd: string, args: readonly string[]): void {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}${result.stdout}`);
  }
}

function createRepo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-lease-store-')));
  FIXTURES.add(root);
  run(root, ['init', '--quiet', '--initial-branch', 'main']);
  run(root, ['config', 'user.email', 'test@example.com']);
  run(root, ['config', 'user.name', 'Coordination Test']);
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  run(root, ['add', 'README.md']);
  run(root, ['commit', '--quiet', '-m', 'init']);
  return root;
}


function taskIdFor(taskCell: string): string {
  return fixtureTaskId(taskCell);
}

afterAll(() => {
  for (const root of FIXTURES) rmSync(root, { recursive: true, force: true });
});

describe('per-task lock', () => {
  test('lock paths refuse anything that is not a bare digest', () => {
    for (const bad of ['', '../escape', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'a/b']) {
      expect(() => taskLockRelativePath(bad)).toThrow('unsafe coordination task id');
    }
  });

  test('an empty task lock refuses entry without blocking a different task', () => {
    const repo = createRepo();
    const commonDir = resolveGitCommonDirectory(repo);
    const task = taskIdFor('wedged task');
    const other = taskIdFor('independent task');
    const lockPath = join(commonDir, taskLockRelativePath(task));
    mkdirSync(lockPath, { recursive: true });
    expect(() => withExclusiveDirectoryLock(commonDir, taskLockRelativePath(task),
      () => 'never runs', { waitTimeoutMs: 200 })).toThrow(/timed out waiting/);
    expect(withExclusiveDirectoryLock(commonDir, taskLockRelativePath(other),
      () => 'still works', { waitTimeoutMs: 200 })).toBe('still works');
    expect(existsSync(lockPath)).toBe(true);
  }, 120_000);

  test('the lock directory lives on the shared plane and is released after use', () => {
    const repo = createRepo();
    const taskId = taskIdFor('lock path');
    expect(taskLockRelativePath(taskId)).toBe(`repo-harness/coordination/v1/locks/tasks/${taskId}.lock`);
    const lockPath = join(resolveGitCommonDirectory(repo), taskLockRelativePath(taskId));
    const observed = withTaskLock(repo, taskId, () => {
      expect(existsSync(lockPath)).toBe(true);
      return 'held';
    });
    expect(observed).toBe('held');
    expect(existsSync(lockPath)).toBe(false);
  });

  test('immediately reclaims a task lock whose independent owner process was terminated', async () => {
    if (process.platform === 'win32') return;
    const repo = createRepo();
    const taskId = taskIdFor('terminated lock owner');
    const lockPath = join(resolveGitCommonDirectory(repo), taskLockRelativePath(taskId));
    const readyPath = join(repo, '.task-lock-owner-ready');
    const taskLockModule = new URL('../src/effects/locking/task-lock.ts', import.meta.url).href;
    const child = Bun.spawn([
      process.execPath,
      '-e',
      [
        "const { writeFileSync, renameSync } = await import('node:fs');",
        'const { withTaskLock } = await import(process.env.TASK_LOCK_MODULE);',
        'withTaskLock(process.env.REPO_ROOT, process.env.TASK_ID, () => {',
        "  writeFileSync(process.env.READY_PATH + '.tmp', 'ready\\n'); renameSync(process.env.READY_PATH + '.tmp', process.env.READY_PATH);",
        '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);',
        '});',
      ].join('\n'),
    ], {
      cwd: repo,
      env: {
        ...process.env,
        TASK_LOCK_MODULE: taskLockModule,
        REPO_ROOT: repo,
        TASK_ID: taskId,
        READY_PATH: readyPath,
      },
      stdout: 'ignore',
      stderr: 'pipe',
    });
    for (let attempt = 0; attempt < 500 && !existsSync(readyPath); attempt += 1) await Bun.sleep(10);
    expect(existsSync(readyPath)).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
    child.kill('SIGKILL');
    await child.exited;

    const startedAt = Date.now();
    expect(withTaskLock(repo, taskId, () => 'recovered')).toBe('recovered');
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(existsSync(lockPath)).toBe(false);
  }, 10_000);

  test('two tasks do not contend, and a linked worktree shares one lock', () => {
    const repo = createRepo();
    const linked = realpathSync(
      (() => {
        const path = join(repo, '..', `${repo.split('/').pop()}-lock-linked`);
        run(repo, ['worktree', 'add', '--quiet', '-b', 'lock-linked', path]);
        FIXTURES.add(realpathSync(path));
        return path;
      })(),
    );
    const outer = taskIdFor('outer task');
    const inner = taskIdFor('inner task');
    const result = withTaskLock(repo, outer, () =>
      withTaskLock(linked, inner, () => 'both held'));
    expect(result).toBe('both held');

    expect(join(resolveGitCommonDirectory(linked), taskLockRelativePath(outer)))
      .toBe(join(resolveGitCommonDirectory(repo), taskLockRelativePath(outer)));
  });

  test('a second holder of the same task lock times out rather than proceeding', () => {
    const repo = createRepo();
    const taskId = taskIdFor('contended task');
    let inner: unknown = null;
    withTaskLock(repo, taskId, () => {
      const attempt = spawnSync(
        'bun',
        [
          '-e',
          [
            "const { withTaskLock } = await import(process.argv[1]);",
            'try {',
            '  withTaskLock(process.argv[2], process.argv[3], () => {});',
            "  console.log('acquired');",
            '} catch (error) {',
            '  console.log(error.name);',
            '}',
          ].join('\n'),
          join(import.meta.dir, '../src/effects/locking/task-lock.ts'),
          repo,
          taskId,
        ],
        { encoding: 'utf-8' },
      );
      inner = attempt.stdout.trim();
    });
    expect(inner).toBe('ExclusiveLockContentionError');
  }, 60_000);

  test('a reclaim that outlasts the wait budget still elects the freed lock', () => {
    // CI measured an 83 ms reclaim against the 50 ms sweep budget. The reclaim
    // removed the dead owner, but the deadline check then reported a timeout.
    const repo = createRepo();
    const common = resolveGitCommonDirectory(repo);
    const relativeLockPath = 'repo-harness/coordination/locks/slow-reclaim.lock';
    const lockPath = join(common, relativeLockPath);
    mkdirSync(lockPath, { recursive: true });
    const deadPid = 2 ** 22 - 1;
    const token = `${deadPid}-${Date.now()}-33333333-3333-4333-8333-333333333333`;
    writeFileSync(join(lockPath, `${token}.json`), `${JSON.stringify({ pid: deadPid, start_time: 'fixture-exited-owner', created_at: Date.now(), token })}\n`);

    const reclaimed: string[] = [];
    const acquired = withExclusiveDirectoryLock(common, relativeLockPath, () => existsSync(lockPath), {
      waitTimeoutMs: 20,
      onStaleReclaim(path) {
        reclaimed.push(path);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
      },
    });
    expect(acquired).toBe(true);
    expect(reclaimed).toEqual([lockPath]);
    expect(existsSync(lockPath)).toBe(false);
  }, 60_000);

});

import { dirname } from 'path';
import { assertOwnedTrashDirectory, worktreeTrashNames } from '../src/effects/state/worktree-trash';
import {
  cleanupExactWorktree,
  recordCreatedWorktree,
  withWorktreeTopologyLock,
  sweepManagedWorktrees as productionSweep,
} from '../src/effects/state/coordination-worktree-topology';

const sweepManagedWorktrees: typeof productionSweep = (root, cwd, env, options) => productionSweep(root, cwd, env, { deadlineMs: 60_000, ...options });

describe('worktree topology lock', () => {
  test('locks the cwd repository when inherited Git variables select another repository', () => {
    const root = createRepo();
    const other = createRepo();
    const lock = 'repo-harness/coordination/locks/worktree-topology.lock';
    const ownLock = join(root, '.git', lock);
    const otherLock = join(other, '.git', lock);
    const previous = { GIT_DIR: process.env.GIT_DIR, GIT_COMMON_DIR: process.env.GIT_COMMON_DIR };
    try {
      process.env.GIT_DIR = join(other, '.git');
      process.env.GIT_COMMON_DIR = join(other, '.git');
      expect(withWorktreeTopologyLock(root, () => {
        expect(existsSync(ownLock)).toBe(true);
        expect(existsSync(otherLock)).toBe(false);
        return 'held';
      })).toBe('held');
      expect(existsSync(ownLock)).toBe(false);
      expect(existsSync(otherLock)).toBe(false);
    } finally {
      for (const key of ['GIT_DIR', 'GIT_COMMON_DIR'] as const) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });
});

describe('exact cleanup and contract-worktree start sweep', () => {
  function fixture() {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'worktree-sweep-')));
    const root = join(parent, 'repo'); const managed = join(parent, 'managed');
    mkdirSync(root); mkdirSync(managed);
    const git = (...args: string[]) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: join(parent, 'home') } });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    mkdirSync(join(parent, 'home'));
    git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.test');
    writeFileSync(join(root, '.gitignore'), '.ai/\nnode_modules/\n'); writeFileSync(join(root, 'source'), 'base\n');
    git('add', '.'); git('commit', '-qm', 'base');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    const path = join(managed, 'repo-wt-demo'); git('worktree', 'add', '-q', '-b', 'codex/demo', path);
    writeFileSync(join(path, '.gitignore'), '.ai/\nnode_modules/\n# merged task change\n');
    git('-C', path, 'add', '.gitignore'); git('-C', path, 'commit', '-qm', 'task change');
    git('merge', '--ff-only', 'codex/demo'); git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    const head = git('rev-parse', 'HEAD');
    const expected = { worktree: path, branch: 'codex/demo', head_sha: head, target_ref: 'refs/remotes/origin/main', target_oid: head, merge_commit_sha: head };
    const env = { ...process.env, REPO_HARNESS_WORKTREE_ROOT: managed, HOME: join(parent, 'home') };
    // An unmerged branch reaches the provider proof. This stub keeps tests off the host gh and its account.
    const failingGh = join(parent, 'gh-fail'); writeFileSync(failingGh, '#!/bin/bash\nexit 1\n'); chmodSync(failingGh, 0o755);
    return { parent, root, managed, path, git, expected, env, failingGh, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
  }

  /** `contract-worktree start` reads the topology through this runtime action. */
  function startCheck(f: ReturnType<typeof fixture>) {
    return spawnSync(process.execPath, ['--preload', controlledWorktreeProcessPreload, join(import.meta.dir, '../scripts/contract-worktree-runtime.ts'), 'check-start-path',
      '--repo', f.root, '--worktree', join(f.managed, 'repo-wt-next'), '--branch', 'codex/next'], { cwd: f.root, encoding: 'utf8', env: f.env });
  }

  test('sweep removes a merged clean checkout and branch', () => {
    const f = fixture(); try {
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('removed=1');
      expect(existsSync(f.path)).toBe(false); expect(f.git('branch', '--list', 'codex/demo')).toBe('');
    } finally { f.cleanup(); }
  });

  test('sweep retains a checkout with unknown or occupied process observations', () => {
    const f = fixture();
    try {
      for (const [processes, reason] of [[null, 'process_unknown'], [[{ pid: 12345, cwd: f.path }], 'process_in_use']] as const) {
        setControlledWorktreeProcesses(processes === null ? null : [...processes]);
        expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain(reason);
        expect(existsSync(f.path)).toBe(true);
        expect(f.git('branch', '--list', 'codex/demo')).toContain('codex/demo');
      }
      setControlledWorktreeProcesses([]);
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('removed=1');
      expect(existsSync(f.path)).toBe(false);
    } finally { setControlledWorktreeProcesses([]); f.cleanup(); }
  });

  test('sweep retains a merged clean checkout that holds a non-rebuildable evidence log', () => {
    const f = fixture(); try {
      mkdirSync(join(f.path, '.ai/harness/evidence/events'), { recursive: true });
      writeFileSync(join(f.path, '.ai/harness/evidence/events/log.jsonl'), '{}\n');
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('ignored_data');
      expect(readFileSync(join(f.path, '.ai/harness/evidence/events/log.jsonl'), 'utf8')).toBe('{}\n');
      expect(f.git('branch', '--list', 'codex/demo')).toContain('codex/demo');
    } finally { f.cleanup(); }
  });

  test('W6 sweep retires the start identity only after exact removal succeeds', () => {
    const f = fixture(); try {
      withWorktreeTopologyLock(f.root, () => recordCreatedWorktree(f.root, f.path));
      const store = join(f.root, '.git/repo-harness/coordination/worktree-identities');
      expect(readdirSync(store).filter(name => name.endsWith('.json'))).toHaveLength(1);
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('removed=1');
      expect(readdirSync(store).filter(name => name.endsWith('.json'))).toEqual([]);
    } finally { f.cleanup(); }
  });

  test('W6 removal keeps unknown identity content without blocking its own record retirement', () => {
    const f = fixture(); try {
      withWorktreeTopologyLock(f.root, () => recordCreatedWorktree(f.root, f.path));
      const store = join(f.root, '.git/repo-harness/coordination/worktree-identities');
      const unknown = 'f'.repeat(64) + '.json'; writeFileSync(join(store, unknown), 'null');
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('removed=1');
      expect(readdirSync(store).filter(name => name.endsWith('.json'))).toEqual([unknown]);
    } finally { f.cleanup(); }
  });

  test('W6 resume retires an identity left by SIGKILL after branch deletion', async () => {
    const f = fixture(); try {
      const lifecycle = recordWorktree(f.root, f.path, { creator: 'contract', purpose: 'recovery regression' });
      withWorktreeTopologyLock(f.root, () => recordCreatedWorktree(f.root, f.path));
      const store = join(f.root, '.git/repo-harness/coordination/worktree-identities');
      await interruptSweep(f, 'branch-deleted');
      expect(readdirSync(store).filter(name => name.endsWith('.json'))).toHaveLength(1);
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('resumed=1');
      expect(readdirSync(store).filter(name => name.endsWith('.json'))).toEqual([]);
      expect(readWorktreeRecordById(join(f.root, '.git'), lifecycle.id)?.end_state).toBe('removed');
    } finally { f.cleanup(); }
  }, 20000);

  test('W6 a fresh lane that only makes a no-ff target merge stays protected', () => {
    const f = fixture(); try {
      f.git('worktree', 'remove', f.path); f.git('branch', '-D', 'codex/demo');
      f.git('worktree', 'add', '-q', '-b', 'codex/demo', f.path, 'origin/main');
      f.git('commit', '--allow-empty', '-qm', 'target change'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      f.git('-C', f.path, 'merge', '--no-ff', 'origin/main', '-m', 'target refresh');
      f.git('merge', '--ff-only', 'codex/demo'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('no commits of its own');
      expect(existsSync(f.path)).toBe(true);
    } finally { f.cleanup(); }
  });

  test('contract-worktree start sweeps a merged managed worktree before it reads the topology', () => {
    const f = fixture(); try {
      const result = startCheck(f);
      expect(result.status, result.stderr).toBe(0); expect(result.stderr).toContain('[WorktreeSweep] removed=1');
      expect(existsSync(f.path)).toBe(false); expect(f.git('branch', '--list', 'codex/demo')).toBe('');
    } finally { f.cleanup(); }
  }, 15000);

  test('SessionStart leaves a pending trash directory to contract-worktree start', () => {
    const f = fixture(); try {
      mkdirSync(join(f.root, '.ai/harness'), { recursive: true });
      writeFileSync(join(f.root, '.ai/harness/workflow-contract.json'), '{}');
      let delayed = false;
      const realNow = Date.now;
      try {
        sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh, afterRemovalStep(step) {
          if (step === 'trash-entry-deleted' && !delayed) { delayed = true; const expired = realNow() + 60_001; Date.now = () => expired; }
        } });
      } finally { Date.now = realNow; }
      const directory = worktreeTrashNames(join(f.root, '.git'), f.managed)[0]!;
      expect(existsSync(directory)).toBe(true);
      const session = spawnSync(process.execPath, [join(import.meta.dir, '../src/cli/hook-entry.ts'), 'SessionStart', '--route', 'default'], {
        cwd: f.root, encoding: 'utf8', input: '{}', env: { ...f.env, HOOK_REPO_ROOT: f.root, HOOK_HOST: 'codex' },
      });
      expect(session.status, session.stderr).toBe(0);
      expect(session.stdout + session.stderr).not.toContain('[WorktreeSweep]');
      expect(session.stdout + session.stderr).not.toContain('worktree sweep');
      expect(session.stdout + session.stderr).not.toContain('trash deletion will resume');
      expect(existsSync(directory)).toBe(true);
      const start = startCheck(f);
      expect(start.status, start.stderr).toBe(0); expect(start.stderr).toContain('resumed=1');
      expect(existsSync(directory)).toBe(false);
    } finally { f.cleanup(); }
  }, 30000);

  function missingBatch() {
    const f = fixture(); const merged = ['codex/demo'];
    for (let index = 0; index < 9; index++) {
      const branch = `codex/missing-${index}`, path = join(f.managed, `repo-wt-missing-${index}`);
      f.git('worktree', 'add', '-q', '-b', branch, path, 'main');
      f.git('-C', path, 'commit', '--allow-empty', '-qm', 'task commit');
      f.git('merge', '--ff-only', branch); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      merged.push(branch);
    }
    const unmerged = join(f.managed, 'repo-wt-unmerged');
    f.git('worktree', 'add', '-q', '-b', 'codex/unmerged', unmerged, 'main');
    writeFileSync(join(unmerged, 'unmerged'), 'real task data'); f.git('-C', unmerged, 'add', 'unmerged'); f.git('-C', unmerged, 'commit', '-qm', 'unmerged task');
    for (const name of readdirSync(f.managed)) rmSync(join(f.managed, name), { recursive: true });
    return { ...f, merged };
  }

  test('W7 ignored trash with a missing entry does not block eligible live worktrees', () => {
    const f = fixture(); try {
      const missing = join(f.managed, 'repo-wt-missing');
      f.git('worktree', 'add', '-q', '-b', 'codex/missing', missing, 'main');
      f.git('-C', missing, 'commit', '--allow-empty', '-qm', 'task commit');
      f.git('merge', '--ff-only', 'codex/missing'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      rmSync(missing, { recursive: true });
      const name = '.repo-harness-wt-trash-' + require('crypto').createHash('sha256').update(join(f.root, '.git')).digest('hex').slice(0, 32) + '-00000000-0000-0000-0000-000000000000';
      const invalid = join(f.managed, name); writeFileSync(invalid, 'not trash');
      const first = sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh });
      expect(first).toContain('ignored;'); expect(first).toContain('removed=1');
      expect(existsSync(f.path)).toBe(false);
      expect(f.git('branch', '--list', 'codex/missing')).toContain('codex/missing');
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('missing entry retained while trash ownership is unknown');
      expect(f.git('branch', '--list', 'codex/missing')).toContain('codex/missing');
      expect(readFileSync(invalid, 'utf8')).toBe('not trash');
    } finally { f.cleanup(); }
  });

  test('W7 missing merged registrations survive the eight-entry batch boundary', () => {
    const f = missingBatch(); try {
      const first = sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh });
      expect(first).toContain('removed=8'); expect(first).toContain('deferred=3');
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('removed=2');
      for (const branch of f.merged) expect(f.git('branch', '--list', branch)).toBe('');
      expect(f.git('branch', '--list', 'codex/unmerged')).toContain('codex/unmerged');
    } finally { f.cleanup(); }
  });

  test('W7 a kill after global prune leaves branch cleanup identities for later sweeps', async () => {
    const f = missingBatch(); try {
      await interruptSweep(f, 'pruned-registrations');
      expect(f.git('worktree', 'list', '--porcelain')).not.toContain('codex/missing-');
      sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh }); sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh });
      for (const branch of f.merged) expect(f.git('branch', '--list', branch)).toBe('');
      expect(f.git('branch', '--list', 'codex/unmerged')).toContain('codex/unmerged');
    } finally { f.cleanup(); }
  }, 30000);

  test('W7 a partial native prune resumes from the saved admin identity', async () => {
    const f = fixture(); try {
      rmSync(f.path, { recursive: true });
      await interruptSweep(f, 'prune-intent');
      const directory = join(f.root, '.git/repo-harness/coordination');
      const state = JSON.parse(readFileSync(join(directory, 'pruned-worktrees.json'), 'utf8'));
      // Git documents this backpointer. This simulates interruption inside its prune.
      rmSync(join(state.entries[0].git_directory, 'gitdir'));
      const stale = join(directory, 'pruned-worktrees.json.12345678-1234-4123-8123-123456789abc.tmp');
      writeFileSync(stale, 'unpublished', { mode: 0o600 }); require('fs').utimesSync(stale, new Date(0), new Date(0));
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('removed=1');
      expect(f.git('branch', '--list', 'codex/demo')).toBe('');
      expect(existsSync(stale)).toBe(false); expect(existsSync(join(directory, 'pruned-worktrees.json'))).toBe(false);
    } finally { f.cleanup(); }
  }, 20000);

  test('W7 a reappeared path keeps its pending branch and all new data', async () => {
    const f = fixture(); try {
      rmSync(f.path, { recursive: true }); await interruptSweep(f, 'pruned-registrations');
      mkdirSync(f.path); writeFileSync(join(f.path, 'new-data'), 'keep');
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('reappeared');
      expect(f.git('branch', '--list', 'codex/demo')).toContain('codex/demo');
      expect(readFileSync(join(f.path, 'new-data'), 'utf8')).toBe('keep');
    } finally { f.cleanup(); }
  }, 20000);

  test('W7 changed pending admin metadata cannot authorize global prune', async () => {
    const f = fixture(); try {
      rmSync(f.path, { recursive: true }); await interruptSweep(f, 'prune-intent');
      const state = JSON.parse(readFileSync(join(f.root, '.git/repo-harness/coordination/pruned-worktrees.json'), 'utf8'));
      const backpointer = join(state.entries[0].git_directory, 'gitdir');
      const outside = join(f.parent, 'outside/.git'); writeFileSync(backpointer, outside);
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('changed Git registration metadata');
      expect(f.git('branch', '--list', 'codex/demo')).toContain('codex/demo');
      expect(readFileSync(backpointer, 'utf8')).toBe(outside);
    } finally { f.cleanup(); }
  }, 20000);

  test('W7 a changed managed root cannot prune a partial registration outside its scope', async () => {
    const f = fixture(); try {
      rmSync(f.path, { recursive: true }); await interruptSweep(f, 'prune-intent');
      const state = JSON.parse(readFileSync(join(f.root, '.git/repo-harness/coordination/pruned-worktrees.json'), 'utf8'));
      const admin = state.entries[0].git_directory; rmSync(join(admin, 'gitdir'));
      const other = join(f.parent, 'other-managed'); mkdirSync(other);
      expect(sweepManagedWorktrees(f.root, f.root, { ...f.env, REPO_HARNESS_WORKTREE_ROOT: other }, { ghBin: f.failingGh })).toContain('protected path');
      expect(existsSync(admin)).toBe(true); expect(f.git('branch', '--list', 'codex/demo')).toContain('codex/demo');
    } finally { f.cleanup(); }
  }, 20000);

  test('W7 the removal barrier rechecks a path recreated during merge proof', () => {
    const f = fixture(); const keys = ['W7_OLD_PATH', 'W7_RACE_MARK', 'W7_INTENT_PATH'];
    const previous = keys.map(key => process.env[key]);
    try {
      rmSync(f.path, { recursive: true });
      const binary = join(f.parent, 'race-git');
      writeFileSync(binary, '#!/bin/sh\nif [ "$1" = merge-base ] && [ -f "$W7_INTENT_PATH" ] && [ ! -e "$W7_RACE_MARK" ]; then : > "$W7_RACE_MARK"; mkdir "$W7_OLD_PATH"; printf keep > "$W7_OLD_PATH/new-data"; fi\nexec /usr/bin/git "$@"\n', { mode: 0o755 });
      process.env.W7_OLD_PATH = f.path; process.env.W7_RACE_MARK = join(f.parent, 'race-entered');
      process.env.W7_INTENT_PATH = join(f.root, '.git/repo-harness/coordination/pruned-worktrees.json');
      expect(sweepManagedWorktrees(f.root, f.root, { ...f.env, REPO_HARNESS_GIT_BIN: binary }, { ghBin: f.failingGh })).toContain('reappeared');
      expect(f.git('branch', '--list', 'codex/demo')).toContain('codex/demo');
      expect(readFileSync(join(f.path, 'new-data'), 'utf8')).toBe('keep');
    } finally { keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }); f.cleanup(); }
  });

  test('W7 kept missing branches do not starve eligible live worktrees', () => {
    const f = fixture(); try {
      for (let index = 0; index < 9; index++) {
        const branch = `codex/pending-${index}`, path = join(f.managed, `repo-wt-pending-${index}`);
        f.git('worktree', 'add', '-q', '-b', branch, path, 'main');
        writeFileSync(join(path, `pending-${index}`), 'unmerged task');
        f.git('-C', path, 'add', '.'); f.git('-C', path, 'commit', '-qm', 'unmerged task'); rmSync(path, { recursive: true });
      }
      const result = sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh });
      expect(result).toContain('removed=1'); expect(result).toContain('kept=7'); expect(result).toContain('deferred=2'); expect(existsSync(f.path)).toBe(false);
      expect(f.git('branch', '--list', 'codex/demo')).toBe('');
      for (let index = 0; index < 9; index++) expect(f.git('branch', '--list', `codex/pending-${index}`)).toContain(`codex/pending-${index}`);
    } finally { f.cleanup(); }
  });

  test('sweep compares the managed root through its realpath', () => {
    const f = fixture(); try {
      const alias = join(f.parent, 'tmp-alias'); symlinkSync(f.managed, alias);
      expect(sweepManagedWorktrees(f.root, f.root, { ...f.env, REPO_HARNESS_WORKTREE_ROOT: alias }, { ghBin: f.failingGh })).toContain('removed=1');
      expect(existsSync(f.path)).toBe(false);
    } finally { f.cleanup(); }
  });

  test('exact cleanup refuses an existing directory after its Git registration is removed', () => {
    const f = fixture(); try {
      f.git('worktree', 'remove', f.path); mkdirSync(f.path); writeFileSync(join(f.path, 'keep'), 'unknown');
      expect(() => cleanupExactWorktree(f.root, f.expected, () => { throw new Error('actuator called'); })).toThrow('not registered');
      expect(readFileSync(join(f.path, 'keep'), 'utf8')).toBe('unknown');
    } finally { f.cleanup(); }
  });

  test('sweep accepts a remotely reachable squash absorbed branch through the shared merge authority', () => {
    const f = fixture(); try {
      writeFileSync(join(f.path, 'change'), 'absorbed\n');
      execFileSync('git', ['add', '.'], { cwd: f.path }); execFileSync('git', ['commit', '-qm', 'feature'], { cwd: f.path });
      f.git('merge', '--squash', 'codex/demo'); f.git('commit', '-qm', 'squash'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      f.git('update-ref', 'refs/remotes/origin/demo', 'codex/demo');
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('removed=1');
      expect(existsSync(f.path)).toBe(false); expect(f.git('branch', '--list', 'codex/demo')).toBe('');
    } finally { f.cleanup(); }
  });

  test.each(['dirty', 'unmerged', 'locked', 'marker', 'session-cwd', 'nested-cwd', 'runtime'])('sweep keeps %s checkout and reports the path', condition => {
    const f = fixture(); try {
      let cwd = f.root;
      if (condition === 'dirty') writeFileSync(join(f.path, 'untracked'), 'keep');
      if (condition === 'unmerged') { writeFileSync(join(f.path, 'new'), 'keep'); execFileSync('git', ['add', '.'], { cwd: f.path }); execFileSync('git', ['commit', '-qm', 'unmerged'], { cwd: f.path }); }
      if (condition === 'locked') f.git('worktree', 'lock', f.path);
      if (condition === 'marker') { mkdirSync(join(f.root, '.ai/harness'), { recursive: true }); writeFileSync(join(f.root, '.ai/harness/active-worktree'), f.path); }
      if (condition === 'session-cwd') cwd = f.path;
      if (condition === 'nested-cwd') { cwd = join(f.path, 'nested'); mkdirSync(cwd); }
      if (condition === 'runtime') {
        const key = require('crypto').createHash('sha256').update(JSON.stringify([join(f.root, '.git'), f.path])).digest('hex');
        mkdirSync(join(f.root, '.ai/harness/runs/task-workspaces', key), { recursive: true });
      }
      const result = sweepManagedWorktrees(f.root, cwd, f.env, { ghBin: f.failingGh });
      const reasons: Record<string, string> = { dirty: 'dirty_worktree', unmerged: 'merge is unproven', locked: 'locked',
        marker: 'marker reference', 'session-cwd': 'session cwd', 'nested-cwd': 'session cwd', runtime: 'runtime is open' };
      expect(result).toContain(f.path); expect(result).toContain('kept;'); expect(result).toContain(reasons[condition]!); expect(existsSync(f.path)).toBe(true);
      expect(f.git('branch', '--list', 'codex/demo')).toContain('codex/demo');
    } finally { f.cleanup(); }
  });

  test.each([false, true])('sweep prunes a missing checkout and keeps its branch only when unmerged=%s', unmerged => {
    const f = fixture(); try {
      if (unmerged) { writeFileSync(join(f.path, 'new'), 'keep'); execFileSync('git', ['add', '.'], { cwd: f.path }); execFileSync('git', ['commit', '-qm', 'unmerged'], { cwd: f.path }); }
      rmSync(f.path, { recursive: true });
      const result = sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh });
      expect(result).toContain('pruned=1'); expect(f.git('worktree', 'list', '--porcelain')).not.toContain(f.path);
      expect(f.git('branch', '--list', 'codex/demo').includes('codex/demo')).toBe(unmerged);
      if (unmerged) expect(result).toContain('unmerged branch kept');
    } finally { f.cleanup(); }
  });

  test.each(['missing-directory', 'missing-git-file'])('sweep leaves outside paths and protects outside prunable registrations: %s', condition => {
    const f = fixture(); try {
      const outside = join(f.parent, 'outside'); f.git('worktree', 'add', '-q', '-b', 'outside', outside);
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('removed=1'); expect(existsSync(outside)).toBe(true);
      f.git('worktree', 'add', '-q', '-b', 'codex/demo', f.path);
      f.git('-C', f.path, 'commit', '--allow-empty', '-qm', 'recreated task');
      f.git('merge', '--ff-only', 'codex/demo'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      if (condition === 'missing-directory') rmSync(outside, { recursive: true });
      else rmSync(join(outside, '.git'));
      rmSync(f.path, { recursive: true });
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('prune would affect a protected path');
      expect(f.git('worktree', 'list', '--porcelain')).toContain(outside); expect(f.git('worktree', 'list', '--porcelain')).toContain(f.path);
    } finally { f.cleanup(); }
  });

  test.each(['head', 'target', 'path', 'unregistered', 'symlink'])('exact cleanup refuses a changed %s before the actuator runs', change => {
    const f = fixture(); try {
      if (change === 'head') f.expected.head_sha = 'a'.repeat(40);
      if (change === 'target') f.expected.target_oid = 'a'.repeat(40);
      if (change === 'path') f.expected.worktree = f.root;
      if (change === 'unregistered') f.expected.branch = 'outside';
      if (change === 'symlink') { const alias = join(f.managed, 'alias'); symlinkSync(f.path, alias); f.expected.worktree = alias; }
      let called = false;
      expect(() => cleanupExactWorktree(f.root, f.expected, () => { called = true; })).toThrow();
      expect(called).toBe(false); expect(existsSync(f.path)).toBe(true);
    } finally { f.cleanup(); }
  });

  async function interruptSweep(f: ReturnType<typeof fixture>, step: string): Promise<string> {
    const worker = join(f.parent, 'w1-worker.ts'); const signal = join(f.parent, 'w1-signal.json');
    const module = join(import.meta.dir, '../src/effects/state/coordination-worktree-topology.ts');
    writeFileSync(worker, [
      `import { sweepManagedWorktrees } from ${JSON.stringify(module)};`,
      `import { writeFileSync, renameSync } from 'fs';`,
      `let stopped = false;`,
      `const result = sweepManagedWorktrees(${JSON.stringify(f.root)}, ${JSON.stringify(f.root)}, process.env, { deadlineMs: 60_000, ghBin: ${JSON.stringify(f.failingGh)}, afterRemovalStep(step, path) {`,
      `if (!stopped && step === ${JSON.stringify(step)}) { stopped = true; writeFileSync(${JSON.stringify(signal)} + ".tmp", JSON.stringify({ step, path })); renameSync(${JSON.stringify(signal)} + ".tmp", ${JSON.stringify(signal)}); process.kill(process.pid, 'SIGSTOP'); }`,
      `} }); console.log(result);`,
    ].join('\n'));
    const child = spawn(process.execPath, ['--preload', controlledWorktreeProcessPreload, worker], { cwd: f.root, env: f.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    const ended = new Promise<void>(resolve => { child.once('exit', () => resolve()); });
    try {
      const deadline = Date.now() + 15_000;
      while (!existsSync(signal) && child.exitCode === null && child.signalCode === null && Date.now() < deadline) await Bun.sleep(10);
      expect(existsSync(signal), output).toBe(true);
      const path = JSON.parse(readFileSync(signal, 'utf8')).path as string;
      child.kill('SIGKILL'); await ended;
      expect(child.signalCode).toBe('SIGKILL');
      // Recovery uses kill(pid, 0), so an exit notification alone is not its
      // proof of death. Observe that same condition before starting recovery.
      const pid = child.pid;
      expect(pid).toBeDefined();
      let aliveObservations = 0;
      for (;;) {
        try {
          process.kill(pid!, 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
          break;
        }
        aliveObservations += 1;
        if (Date.now() >= deadline) throw new Error(`W1 worker ${pid} remains observable after SIGKILL (${aliveObservations} liveness observations)`);
        await Bun.sleep(10);
      }
      console.error(`[W1 worker death] pid=${pid} aliveAfterExit=${aliveObservations} final=ESRCH`);
      // An unlink signal names a child of the renamed payload. Other steps name the container.
      return step === 'trash-entry-deleted' ? dirname(dirname(path)) : path;
    } finally {
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await ended; }
    }
  }

  test.each(['intent', 'renamed', 'unregistered', 'branch-deleted', 'trash-entry-deleted'])('W1 next sweep converges after SIGKILL at %s', async step => {
    const f = fixture(); try {
      const outside = join(f.parent, 'outside'); f.git('worktree', 'add', '-q', '-b', 'outside', outside);
      const directory = await interruptSweep(f, step);
      expect(existsSync(directory)).toBe(true);
      if (step === 'intent') expect(existsSync(f.path)).toBe(true);
      else expect(existsSync(f.path)).toBe(false);
      if (step === 'unregistered' || step === 'branch-deleted' || step === 'trash-entry-deleted') expect(f.git('worktree', 'list', '--porcelain')).not.toContain(f.path);
      if (step === 'trash-entry-deleted') {
        expect(f.git('branch', '--list', 'codex/demo')).toBe('');
        expect(readdirSync(join(directory, 'worktree')).length).toBeLessThan(3);
      }
      const next = sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh });
      // An unused approval is discarded; the unchanged green source is then removed by fresh selection.
      if (step === 'intent') expect(next).toContain(`${directory}: unused approval discarded; source kept for fresh selection`);
      else expect(next).toContain('resumed=1');
      expect(existsSync(directory)).toBe(false);
      expect(existsSync(f.path)).toBe(false); expect(f.git('branch', '--list', 'codex/demo')).toBe('');
      expect(f.git('worktree', 'list', '--porcelain')).not.toContain(f.path);
      expect(existsSync(outside)).toBe(true); expect(f.git('branch', '--list', 'outside')).toContain('outside');
    } finally { f.cleanup(); }
  }, 20000);

  test.each(['ignored data', 'occupying process'])('W1 an unused intent approval never removes a source that later gained %s', async change => {
    const f = fixture(); try {
      const directory = await interruptSweep(f, 'intent');
      expect(existsSync(f.path)).toBe(true);
      // A second green tree created after the interrupt; fresh selection removes it.
      const second = join(f.managed, 'repo-wt-second'); f.git('worktree', 'add', '-q', '-b', 'codex/second', second);
      writeFileSync(join(second, 'second'), 'second\n'); f.git('-C', second, 'add', 'second'); f.git('-C', second, 'commit', '-qm', 'second change');
      f.git('merge', '--ff-only', 'codex/second'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      if (change === 'ignored data') {
        appendFileSync(join(f.root, '.git/info/exclude'), '.env\n');
        writeFileSync(join(f.path, '.env'), 'private\n');
      } else setControlledWorktreeProcesses([{ pid: 4242, cwd: join(f.path, 'src') }]);
      const next = sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh });
      expect(next).toContain(`${directory}: unused approval discarded; source kept for fresh selection`);
      expect(next).toContain(`${f.path}: kept; ${change === 'ignored data' ? 'ignored_data' : 'process_in_use'}`);
      expect(existsSync(directory)).toBe(false);
      expect(existsSync(join(f.path, '.gitignore'))).toBe(true);
      if (change === 'ignored data') expect(readFileSync(join(f.path, '.env'), 'utf8')).toBe('private\n');
      expect(f.git('branch', '--list', 'codex/demo')).toContain('codex/demo');
      expect(f.git('worktree', 'list', '--porcelain')).toContain(f.path);
      expect(existsSync(second)).toBe(false); expect(f.git('branch', '--list', 'codex/second')).toBe('');
    } finally { setControlledWorktreeProcesses([]); f.cleanup(); }
  }, 20000);

  test.each(['ignored data', 'occupying process'])('the sweep keeps a checkout that gains %s after its green pre-check and before the in-lock check', change => {
    const f = fixture(); try {
      appendFileSync(join(f.root, '.git/info/exclude'), '.env\n');
      const lock = join(f.root, '.git/repo-harness/coordination/locks/worktree-topology.lock');
      const occupant = { pid: 4242, cwd: join(f.path, 'src') };
      let observedInLock = false;
      // The inventory is observed before the pre-check and again inside the barrier.
      // The change happens at the first observation that holds the topology lock.
      setControlledWorktreeProcesses(() => {
        if (!existsSync(lock)) return [];
        observedInLock = true;
        if (change === 'ignored data') { writeFileSync(join(f.path, '.env'), 'private\n'); return []; }
        return [occupant];
      });
      const report = sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh });
      expect(observedInLock).toBe(true);
      expect(report).toContain('removed=0');
      expect(report).toContain(`${f.path}: kept; ${change === 'ignored data' ? 'ignored_data' : 'process_in_use'}`);
      if (change === 'ignored data') expect(readFileSync(join(f.path, '.env'), 'utf8')).toBe('private\n');
      expect(existsSync(join(f.path, '.gitignore'))).toBe(true);
      expect(f.git('worktree', 'list', '--porcelain')).toContain(f.path);
      expect(f.git('branch', '--list', 'codex/demo')).toContain('codex/demo');
      expect(worktreeTrashNames(join(f.root, '.git'), f.managed)).toEqual([]);
    } finally { setControlledWorktreeProcesses([]); f.cleanup(); }
  });

  test('W1 deadline expiry during trash deletion leaves data that the next sweep finishes', () => {
    const f = fixture(); try {
      let delayed = false;
      const realNow = Date.now;
      let timed: string | null;
      try {
        timed = sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh, afterRemovalStep(step) {
          if (step === 'trash-entry-deleted' && !delayed) { delayed = true; const expired = realNow() + 60_001; Date.now = () => expired; }
        } });
      } finally { Date.now = realNow; }
      expect(delayed).toBe(true); expect(timed).toContain('trash deletion will resume');
      expect(existsSync(f.path)).toBe(false); expect(f.git('branch', '--list', 'codex/demo')).toBe('');
      const directory = worktreeTrashNames(join(f.root, '.git'), f.managed)[0]!;
      expect(existsSync(directory)).toBe(true);
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('resumed=1');
      expect(existsSync(directory)).toBe(false);
    } finally { f.cleanup(); }
  }, 15000);

  async function pendingTrashFixture() {
    const f = fixture();
    try {
      const payload = join(f.path, 'node_modules/payload');
      mkdirSync(payload, { recursive: true });
      for (let index = 0; index < 24; index++) writeFileSync(join(payload, `file-${index}`), 'trash data');
      const directory = await interruptSweep(f, 'branch-deleted');
      return { ...f, directory };
    } catch (error) { f.cleanup(); throw error; }
  }

  /** Real Git and filesystem work; only elapsed deletion time is controlled. */
  function sweepWithSlowDeletion(f: ReturnType<typeof fixture>): string | null {
    const realNow = Date.now;
    let offset = 0;
    try {
      Date.now = () => realNow() + offset;
      return productionSweep(f.root, f.root, f.env, {
        deadlineMs: 60_000, ghBin: f.failingGh,
        afterRemovalStep(step) { if (step === 'trash-entry-deleted') offset += 10_000; },
      });
    } finally { Date.now = realNow; }
  }

  function addMergedSweepWorktree(f: ReturnType<typeof fixture>) {
    const other = join(f.managed, 'repo-wt-other');
    f.git('worktree', 'add', '-q', '-b', 'other', other);
    f.git('-C', other, 'commit', '--allow-empty', '-qm', 'other task');
    f.git('merge', '--ff-only', 'other'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    return other;
  }

  test.each(['live', 'missing'])('W8 pending trash leaves time to clean a %s worktree in the same sweep', async state => {
    const f = await pendingTrashFixture(); try {
      const other = addMergedSweepWorktree(f);
      if (state === 'missing') rmSync(other, { recursive: true });
      const before = readdirSync(f.directory, { recursive: true }).length;
      const result = sweepWithSlowDeletion(f);
      expect(result).toContain('trash deletion will resume');
      expect(existsSync(f.directory)).toBe(true);
      expect(readdirSync(f.directory, { recursive: true }).length).toBeLessThan(before);
      expect(result).toContain('removed=1');
      expect(result).not.toContain('worktree sweep skipped');
      if (state === 'missing') expect(result).toContain('pruned=1');
      expect(existsSync(other)).toBe(false);
      expect(f.git('worktree', 'list', '--porcelain')).not.toContain(other);
      expect(f.git('branch', '--list', 'other')).toBe('');
    } finally { f.cleanup(); }
  }, 30000);

  test('W8 repeated bounded sweeps finish real trash with progress in each run', async () => {
    const f = await pendingTrashFixture(); try {
      const entryCount = () => existsSync(f.directory) ? readdirSync(f.directory, { recursive: true }).length + 1 : 0;
      const bound = entryCount();
      let runs = 0;
      while (existsSync(f.directory) && runs < bound) {
        const before = entryCount();
        const result = sweepWithSlowDeletion(f);
        runs++;
        expect(entryCount(), result ?? '').toBeLessThan(before);
      }
      expect(runs).toBeGreaterThan(1);
      expect(existsSync(f.directory)).toBe(false);
      expect(worktreeTrashNames(join(f.root, '.git'), f.managed)).toEqual([]);
      expect(f.git('branch', '--list', 'codex/demo')).toBe('');
    } finally { f.cleanup(); }
  }, 30000);

  test('W8 inline trash deletion leaves time for the next live worktree', () => {
    const f = fixture(); try {
      const other = addMergedSweepWorktree(f);
      const payload = join(f.path, 'node_modules/payload');
      mkdirSync(payload, { recursive: true });
      for (let index = 0; index < 24; index++) writeFileSync(join(payload, `file-${index}`), 'trash data');
      const result = sweepWithSlowDeletion(f);
      expect(result).toContain('removed=2');
      expect(result).toContain('trash deletion will resume');
      expect(existsSync(f.path)).toBe(false); expect(existsSync(other)).toBe(false);
      expect(f.git('branch', '--list', 'codex/demo', 'other')).toBe('');
      expect(f.git('worktree', 'list', '--porcelain')).not.toContain(f.managed);
      expect(worktreeTrashNames(join(f.root, '.git'), f.managed)).toHaveLength(2);
    } finally { f.cleanup(); }
  }, 30000);

  test('W8 unsafe trash recovery still blocks live cleanup', async () => {
    const f = fixture(); try {
      const directory = await interruptSweep(f, 'renamed');
      f.git('worktree', 'repair', join(directory, 'worktree'));
      const other = addMergedSweepWorktree(f);
      const result = sweepWithSlowDeletion(f);
      expect(result).toContain('trash is still registered');
      expect(result).toContain('removed=0');
      expect(existsSync(other)).toBe(true);
      expect(f.git('branch', '--list', 'other')).toContain('other');
      expect(readFileSync(join(directory, 'worktree/source'), 'utf8')).toBe('base\n');
    } finally { f.cleanup(); }
  }, 30000);

  test('W1 recovery accepts a local integration ref advance after the rename', async () => {
    const f = fixture(); try {
      const directory = await interruptSweep(f, 'renamed');
      f.git('commit', '--allow-empty', '-qm', 'advance target'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('resumed=1');
      expect(existsSync(directory)).toBe(false); expect(f.git('branch', '--list', 'codex/demo')).toBe('');
    } finally { f.cleanup(); }
  }, 20000);

  test('W1 recovery never removes a replacement directory at the old worktree name', async () => {
    const f = fixture(); try {
      const directory = await interruptSweep(f, 'renamed');
      mkdirSync(f.path); writeFileSync(join(f.path, 'replacement'), 'new owner data');
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('resumed=1');
      expect(existsSync(directory)).toBe(false); expect(readFileSync(join(f.path, 'replacement'), 'utf8')).toBe('new owner data');
      expect(f.git('worktree', 'list', '--porcelain')).not.toContain(f.path); expect(f.git('branch', '--list', 'codex/demo')).toBe('');
    } finally { f.cleanup(); }
  }, 20000);

  test('W1 trash resume does not touch a non-matching directory', () => {
    const f = fixture(); try {
      const unowned = join(f.managed, '.repo-harness-wt-trash-unowned'); mkdirSync(unowned); writeFileSync(join(unowned, 'keep'), 'keep');
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('removed=1');
      expect(readFileSync(join(unowned, 'keep'), 'utf8')).toBe('keep');
    } finally { f.cleanup(); }
  });

  test('W1 trash resume refuses a matching symlink without following it', async () => {
    const f = fixture(); try {
      const directory = await interruptSweep(f, 'renamed');
      const saved = join(f.parent, 'saved'); fs.renameSync(directory, saved); symlinkSync(saved, directory);
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('trash is not a real directory');
      expect(readFileSync(join(saved, 'worktree/source'), 'utf8')).toBe('base\n');
      expect(fs.lstatSync(directory).isSymbolicLink()).toBe(true); expect(f.git('branch', '--list', 'codex/demo')).toContain('codex/demo');
    } finally { f.cleanup(); }
  }, 20000);

  test.skipIf(!process.getuid || process.getuid() === 0)('W1 the production ownership check rejects a real foreign-owned directory', () => {
    const foreign = realpathSync('/tmp');
    expect(fs.lstatSync(foreign).uid).not.toBe(process.getuid?.());
    expect(() => assertOwnedTrashDirectory(foreign)).toThrow('foreign-owned');
    // The predicate reads native stat only. No permission or ownership is changed.
    expect(fs.lstatSync(foreign).isDirectory()).toBe(true);
  });

  test('W1 trash resume keeps a payload that Git has registered after the rename', async () => {
    const f = fixture(); try {
      const directory = await interruptSweep(f, 'renamed'); const payload = join(directory, 'worktree');
      f.git('worktree', 'repair', payload);
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('trash is still registered');
      expect(f.git('worktree', 'list', '--porcelain')).toContain(payload); expect(existsSync(payload)).toBe(true);
      expect(f.git('branch', '--list', 'codex/demo')).toContain('codex/demo');
    } finally { f.cleanup(); }
  }, 20000);

  test('W1 whole prune refuses unknown metadata omitted from Git porcelain', () => {
    const f = fixture(); try {
      const outside = join(f.parent, 'outside'); f.git('worktree', 'add', '-q', '-b', 'outside', outside);
      const admin = f.git('-C', outside, 'rev-parse', '--absolute-git-dir');
      // This models a real interrupted metadata removal in the documented Git layout.
      rmSync(join(admin, 'gitdir'));
      expect(f.git('worktree', 'list', '--porcelain')).not.toContain(outside);
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('unknown Git registration metadata');
      expect(existsSync(admin)).toBe(true); expect(existsSync(outside)).toBe(true); expect(existsSync(f.path)).toBe(true);
      expect(worktreeTrashNames(join(f.root, '.git'), f.managed)).toEqual([]);
    } finally { f.cleanup(); }
  });

  test('W1 an interrupted Git metadata removal is completed by the next sweep', async () => {
    const f = fixture(); try {
      const directory = await interruptSweep(f, 'renamed');
      const receipt = JSON.parse(readFileSync(join(directory, 'receipt.json'), 'utf8'));
      rmSync(join(receipt.git_directory, 'gitdir'));
      expect(f.git('worktree', 'list', '--porcelain')).not.toContain(f.path);
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('resumed=1');
      expect(existsSync(receipt.git_directory)).toBe(false); expect(existsSync(directory)).toBe(false);
      expect(f.git('branch', '--list', 'codex/demo')).toBe('');
    } finally { f.cleanup(); }
  }, 20000);

  test('W1 cleanup does not rename a worktree when whole-prune scope is unsafe', () => {
    const f = fixture(); try {
      const outside = join(f.parent, 'outside'); f.git('worktree', 'add', '-q', '-b', 'outside', outside); rmSync(outside, { recursive: true });
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('prune would affect a protected path');
      expect(existsSync(f.path)).toBe(true); expect(worktreeTrashNames(join(f.root, '.git'), f.managed)).toEqual([]);
      expect(f.git('worktree', 'list', '--porcelain')).toContain(outside);
    } finally { f.cleanup(); }
  });

  test('W3 a creation-only branch and a missing reflog are kept, while a merged task commit qualifies', () => {
    const f = fixture(); try {
      f.git('worktree', 'remove', f.path); f.git('branch', '-D', 'codex/demo');
      f.git('worktree', 'add', '-q', '-b', 'codex/demo', f.path);
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('no commits of its own'); expect(existsSync(f.path)).toBe(true);
      f.git('-C', f.path, 'commit', '--allow-empty', '-qm', 'task commit'); f.git('merge', '--ff-only', 'codex/demo'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('removed=1'); expect(existsSync(f.path)).toBe(false);
      f.git('worktree', 'add', '-q', '-b', 'codex/demo', f.path);
      const log = f.git('rev-parse', '--git-path', 'logs/refs/heads/codex/demo'); rmSync(join(f.root, log));
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('reflog is unavailable'); expect(existsSync(f.path)).toBe(true);
    } finally { f.cleanup(); }
  });

  test.each(['head', 'dirty'])('W3 an unused approval is discarded after %s preflight fails, and another live task is swept', async change => {
    const f = fixture(); try {
      const directory = await interruptSweep(f, 'intent');
      writeFileSync(join(f.path, 'new'), 'new work');
      if (change === 'head') { f.git('-C', f.path, 'add', '.'); f.git('-C', f.path, 'commit', '-qm', 'new work'); }
      const other = join(f.managed, 'repo-wt-other'); f.git('worktree', 'add', '-q', '-b', 'other', other);
      f.git('-C', other, 'commit', '--allow-empty', '-qm', 'other task'); f.git('merge', '--ff-only', 'other'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      const result = sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh });
      expect(result).toContain('approval discarded'); expect(existsSync(directory)).toBe(false); expect(existsSync(f.path)).toBe(true);
      expect(existsSync(other)).toBe(false); expect(readFileSync(join(f.path, 'new'), 'utf8')).toBe('new work');
    } finally { f.cleanup(); }
  }, 20000);

  test('W3 bind rejects a non-canonical alias', async () => {
    const f = fixture(); try {
      const alias = join(f.parent, 'alias'); symlinkSync(f.managed, alias);
      const { assertWorktreeBinding } = await import('../src/effects/state/coordination-worktree-topology');
      expect(() => assertWorktreeBinding(f.root, join(alias, 'repo-wt-demo'), 'codex/demo')).toThrow('not canonical');
      expect(() => assertWorktreeBinding(f.root, f.path, 'codex/demo')).not.toThrow();
    } finally { f.cleanup(); }
  });

  test.each(['gitmodules', 'modules-store'])('W3 sweep keeps submodules: %s', condition => {
    const f = fixture(); try {
      if (condition === 'gitmodules') { writeFileSync(join(f.path, '.gitmodules'), ''); f.git('-C', f.path, 'add', '.gitmodules'); f.git('-C', f.path, 'commit', '-qm', 'submodule config'); f.git('merge', '--ff-only', 'codex/demo'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD'); }
      else mkdirSync(join(f.git('-C', f.path, 'rev-parse', '--absolute-git-dir'), 'modules'));
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('submodules present'); expect(existsSync(f.path)).toBe(true);
    } finally { f.cleanup(); }
  });

  test.each(['file', 'symlink'])('W3 a matching non-owned trash %s is ignored while a live task is swept', kind => {
    const f = fixture(); try {
      const name = '.repo-harness-wt-trash-' + require('crypto').createHash('sha256').update(join(f.root, '.git')).digest('hex').slice(0, 32) + '-00000000-0000-0000-0000-000000000000';
      const path = join(f.managed, name); if (kind === 'file') writeFileSync(path, 'not trash'); else symlinkSync(f.parent, path);
      const result = sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh });
      expect(result).toContain('ignored;'); expect(result).toContain('removed=1'); expect(existsSync(f.path)).toBe(false);
      expect(fs.lstatSync(path).isSymbolicLink()).toBe(kind === 'symlink'); if (kind === 'file') expect(readFileSync(path, 'utf8')).toBe('not trash');
    } finally { f.cleanup(); }
  });

  test('W3 kept counts exclude deferred entries', () => {
    const f = fixture(); try {
      f.git('worktree', 'lock', f.path);
      for (let index = 0; index < 8; index++) {
        const path = join(f.managed, 'repo-wt-locked-' + index);
        f.git('worktree', 'add', '-q', '-b', 'locked-' + index, path); f.git('worktree', 'lock', path);
      }
      const result = sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh });
      expect(result).toContain('kept=8'); expect(result).toContain('deferred=1'); expect(existsSync(f.path)).toBe(true);
    } finally { f.cleanup(); }
  });

  test('W2 every sweep Git boundary uses the configured binary', () => {
    const f = fixture(); const prior = process.env.W23_GIT_LOG;
    try {
      const log = join(f.parent, 'git.log'); const binary = join(f.parent, 'git-wrapper'); process.env.W23_GIT_LOG = log;
      writeFileSync(binary, `#!/bin/sh
printf '%s\\n' "$*" >> "$W23_GIT_LOG"
exec /usr/bin/git "$@"
`, { mode: 0o755 });
      expect(sweepManagedWorktrees(f.root, f.root, { ...f.env, REPO_HARNESS_GIT_BIN: binary }, { ghBin: f.failingGh })).toContain('removed=1');
      const commands = readFileSync(log, 'utf8');
      expect(commands).toContain('rev-parse --git-common-dir'); expect(commands).toContain('reflog exists');
      expect(commands).toContain('merge-base --is-ancestor'); expect(commands).toContain('worktree prune --expire now');
      expect(commands).toContain('update-ref --stdin'); expect(existsSync(f.path)).toBe(false);
    } finally { if (prior === undefined) delete process.env.W23_GIT_LOG; else process.env.W23_GIT_LOG = prior; f.cleanup(); }
  });

  test.each(['fast-forward', 'reset', 'rebase'])('W5 refresh without a task commit stays protected: %s', operation => {
    const f = fixture(); try {
      f.git('worktree', 'remove', f.path); f.git('branch', '-D', 'codex/demo');
      f.git('worktree', 'add', '-q', '-b', 'codex/demo', f.path, 'origin/main');
      f.git('commit', '--allow-empty', '-qm', 'unrelated main change');
      f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      if (operation === 'fast-forward') f.git('-C', f.path, 'merge', '--ff-only', 'origin/main');
      else if (operation === 'reset') f.git('-C', f.path, 'reset', '--hard', 'origin/main');
      else f.git('-C', f.path, 'rebase', 'origin/main');
      expect(sweepManagedWorktrees(f.root, f.root, f.env, { ghBin: f.failingGh })).toContain('no commits of its own');
      expect(existsSync(f.path)).toBe(true);
    } finally { f.cleanup(); }
  });

  test('contract-worktree start reports a sweep failure and still succeeds', () => {
    const f = fixture(); try {
      f.git('update-ref', '-d', 'refs/remotes/origin/main');
      const result = startCheck(f);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain('worktree sweep skipped: local integration target is unavailable');
      expect(existsSync(f.path)).toBe(true);
    } finally { f.cleanup(); }
  }, 15000);
});
