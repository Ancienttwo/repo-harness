/**
 * Coordination plane primitives over a real git repository: lease election,
 * durable owner writes, per-task locking, and the `unknown` classification.
 *
 * Real filesystem, real `git rev-parse --git-common-dir`, real linked
 * worktree. Every hazard here is a filesystem-ordering hazard, so a mocked fs
 * would prove nothing about `mkdir` atomicity or the crash windows.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'child_process';
import {
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
import { randomUUID } from 'crypto';
import {
  bindLeaseRecord,
  buildLeaseOwnerRecord,
  deriveTaskRevision,
  parseLeaseOwnerRecord,
  projectCanonicalTasks,
  serializeLeaseOwnerRecord,
  stealLeaseRecord,
  type LeaseOwnerRecordV1,
  type LeaseOwnerRecordV2,
} from '../src/core/state/coordination-identity';
import {
  abortCompletionSprintCommand,
  beginCompletionSprintCommand,
  bindSprintCommand,
  claimSprintCommand,
  completeRowSprintCommand,
  processSprintDependencies,
  reconcileSprintCommand,
  releaseSprintCommand,
  stealSprintCommand,
  type SprintCommandDependencies,
} from '../src/effects/state/coordination-sprint';
import {
  COORDINATION_BACKLOG_LOCK_RELATIVE_PATH,
  COORDINATION_ROOT_RELATIVE_PATH,
  LEASE_OWNER_FILE_NAME,
  coordinationRoot,
  createLeaseDirectory,
  findLeaseByClaimId,
  leaseDirectory,
  leaseOwnerPath,
  readLease,
  removeLease,
  removeOwnLeaseAfterFailedClaim,
  taskLockRelativePath,
  withBacklogLock,
  withTaskLock,
  writeLeaseOwnerDurably,
} from '../src/effects/state/coordination-lease-store';
import { resolveGitCommonDirectory } from '../src/effects/git/common-directory';
import { deriveLegacyTaskId } from '../src/core/state/sprint-schema-v1';
import { CLAIM_TOKEN_DIR } from '../src/effects/state/coordination-claim-token';
import { fixtureTaskId } from './helpers/sprint-fixture';

const FIXTURES = new Set<string>();

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

const REPO_ROOT = join(import.meta.dir, '..');
const REPO_IDENTITY = '/tmp/lease-store-fixture/.git';
const SPRINT_PATH = 'plans/sprints/lease-store.sprint.md';

function taskIdFor(taskCell: string): string {
  return fixtureTaskId(taskCell);
}

function recordFor(taskCell: string, claimId: string): LeaseOwnerRecordV1 {
  const taskId = taskIdFor(taskCell);
  return buildLeaseOwnerRecord({
    claimId,
    taskId,
    taskRevision: deriveTaskRevision({ taskId, taskCell, modeCell: 'contract', acceptanceCell: 'green' }),
    sprintPath: SPRINT_PATH,
    targetRef: 'main',
    generation: 1,
    sessionId: 'session-1',
    sourceWorktree: '/tmp/lease-store-fixture',
  });
}

/** Claim a lease the way the verb does: elect, then publish durably. */
function claim(repo: string, taskCell: string, claimId: string): LeaseOwnerRecordV1 {
  const record = recordFor(taskCell, claimId);
  expect(createLeaseDirectory(repo, record.task_id)).toBe(true);
  writeLeaseOwnerDurably(repo, record.task_id, record);
  return record;
}

afterAll(() => {
  for (const root of FIXTURES) rmSync(root, { recursive: true, force: true });
});

describe('coordination plane layout', () => {
  test('roots under the git common dir, not the worktree', () => {
    const repo = createRepo();
    const commonDir = resolveGitCommonDirectory(repo);
    expect(coordinationRoot(repo)).toBe(join(commonDir, COORDINATION_ROOT_RELATIVE_PATH));
    expect(COORDINATION_ROOT_RELATIVE_PATH).toBe('repo-harness/coordination/v1');
    expect(COORDINATION_BACKLOG_LOCK_RELATIVE_PATH).toBe(
      'repo-harness/coordination/v1/locks/backlog.lock',
    );
  });

  test('a linked worktree resolves to the same coordination root', () => {
    const repo = createRepo();
    const linked = join(repo, '..', `${repo.split('/').pop()}-linked`);
    run(repo, ['worktree', 'add', '--quiet', '-b', 'linked', linked]);
    FIXTURES.add(realpathSync(linked));
    expect(coordinationRoot(realpathSync(linked))).toBe(coordinationRoot(repo));
    expect(leaseDirectory(realpathSync(linked), taskIdFor('shared')))
      .toBe(leaseDirectory(repo, taskIdFor('shared')));
  });

  test('lease and lock paths refuse anything that is not a bare digest', () => {
    const repo = createRepo();
    for (const bad of ['../escape', 'not-a-digest', '', 'a'.repeat(63), `${'a'.repeat(64)}/x`]) {
      expect(() => leaseDirectory(repo, bad)).toThrow('unsafe coordination task id');
      expect(() => taskLockRelativePath(bad)).toThrow('unsafe coordination task id');
    }
  });
});

describe('lease election and durable owner write', () => {
  test('mkdir election admits exactly one first owner', () => {
    const repo = createRepo();
    const taskId = taskIdFor('elect once');
    expect(createLeaseDirectory(repo, taskId)).toBe(true);
    expect(createLeaseDirectory(repo, taskId)).toBe(false);
    expect(createLeaseDirectory(repo, taskId)).toBe(false);
  });

  test('the owner record is published atomically and leaves no temp behind', () => {
    const repo = createRepo();
    const record = claim(repo, 'publish atomically', 'claim-1');
    const directory = leaseDirectory(repo, record.task_id);
    expect(readdirSync(directory)).toEqual([LEASE_OWNER_FILE_NAME]);
    expect(readFileSync(leaseOwnerPath(repo, record.task_id), 'utf-8'))
      .toBe(serializeLeaseOwnerRecord(record));

    const read = readLease(repo, record.task_id);
    expect(read.classification).toBe('reserving');
    expect(read.record).toEqual(record);
    expect(read.unknown_reason).toBeNull();
  });

  test('a replacing write is never observed half-applied', () => {
    const repo = createRepo();
    const record = claim(repo, 'replace atomically', 'claim-1');
    const bound: LeaseOwnerRecordV1 = {
      ...record,
      state: 'bound',
      execution_worktree: '/tmp/worktree',
      branch: 'codex/example',
      unit_ref: 'plans/plan-example.md',
    };
    writeLeaseOwnerDurably(repo, record.task_id, bound);
    expect(readdirSync(leaseDirectory(repo, record.task_id))).toEqual([LEASE_OWNER_FILE_NAME]);
    const read = readLease(repo, record.task_id);
    expect(read.classification).toBe('bound');
    expect(read.record).toEqual(bound);
    // The file parses as a whole record, so no torn prefix was ever published.
    expect(parseLeaseOwnerRecord(readFileSync(leaseOwnerPath(repo, record.task_id), 'utf-8')))
      .toEqual(bound);
  });

  test('a record may not be written into another task lease', () => {
    const repo = createRepo();
    const record = recordFor('owner a', 'claim-1');
    const otherTask = taskIdFor('owner b');
    createLeaseDirectory(repo, otherTask);
    expect(() => writeLeaseOwnerDurably(repo, otherTask, record))
      .toThrow('refusing to write owner record');
  });
});

describe('unknown classification: never silently deleted', () => {
  test('a crash after the lease mkdir and before the owner write is unknown', () => {
    const repo = createRepo();
    const taskId = taskIdFor('crash window');
    expect(createLeaseDirectory(repo, taskId)).toBe(true);

    const read = readLease(repo, taskId);
    expect(read.classification).toBe('unknown');
    expect(read.unknown_reason).toBe('owner_record_missing');
    expect(read.record).toBeNull();
    expect(existsSync(leaseDirectory(repo, taskId))).toBe(true);
  });

  test('malformed, empty, and non-record owner files are unknown and survive', () => {
    const repo = createRepo();
    const cases: ReadonlyArray<readonly [string, string, string]> = [
      ['malformed json', '{ not json', 'owner_record_malformed'],
      ['wrong protocol', JSON.stringify({ protocol: 2, kind: 'repo-harness-lease-owner' }), 'owner_record_malformed'],
      ['wrong kind', JSON.stringify({ protocol: 1, kind: 'something-else' }), 'owner_record_malformed'],
      ['empty file', '', 'owner_record_empty'],
      ['whitespace only', '   \n', 'owner_record_empty'],
    ];
    for (const [name, content, reason] of cases) {
      const taskId = taskIdFor(name);
      createLeaseDirectory(repo, taskId);
      writeFileSync(leaseOwnerPath(repo, taskId), content);
      const read = readLease(repo, taskId);
      expect(read.classification).toBe('unknown');
      expect(read.unknown_reason).toBe(reason as never);
      expect(read.record).toBeNull();
      expect(existsSync(leaseOwnerPath(repo, taskId))).toBe(true);
    }
  });

  test('a truncated but syntactically valid record is unknown, not partly trusted', () => {
    const repo = createRepo();
    const record = recordFor('truncated record', 'claim-1');
    const taskId = record.task_id;
    createLeaseDirectory(repo, taskId);
    const { claimed_by: _dropped, ...withoutClaimedBy } = record;
    writeFileSync(leaseOwnerPath(repo, taskId), `${JSON.stringify(withoutClaimedBy)}\n`);
    expect(readLease(repo, taskId).unknown_reason).toBe('owner_record_malformed');
  });

  test('a record naming a different task is unknown', () => {
    const repo = createRepo();
    const foreign = recordFor('foreign record', 'claim-1');
    const taskId = taskIdFor('host lease');
    createLeaseDirectory(repo, taskId);
    writeFileSync(leaseOwnerPath(repo, taskId), serializeLeaseOwnerRecord(foreign));
    expect(readLease(repo, taskId).unknown_reason).toBe('owner_record_task_id_mismatch');
  });

  test('a symlinked owner record is unknown and is not followed', () => {
    const repo = createRepo();
    const genuine = claim(repo, 'symlink target', 'claim-real');
    const taskId = taskIdFor('symlinked owner');
    createLeaseDirectory(repo, taskId);
    symlinkSync(leaseOwnerPath(repo, genuine.task_id), leaseOwnerPath(repo, taskId));

    const read = readLease(repo, taskId);
    expect(read.classification).toBe('unknown');
    expect(read.unknown_reason).toBe('owner_record_symlink');
    expect(read.record).toBeNull();
    expect(existsSync(leaseOwnerPath(repo, taskId))).toBe(true);
    // The genuine lease it pointed at is untouched.
    expect(readLease(repo, genuine.task_id).classification).toBe('reserving');
  });

  test('a symlinked lease directory is unknown and is not followed', () => {
    const repo = createRepo();
    const genuine = claim(repo, 'directory symlink target', 'claim-real');
    const taskId = taskIdFor('symlinked lease dir');
    const target = leaseDirectory(repo, taskId);
    mkdirSync(join(coordinationRoot(repo), 'leases'), { recursive: true });
    symlinkSync(leaseDirectory(repo, genuine.task_id), target);

    const read = readLease(repo, taskId);
    expect(read.classification).toBe('unknown');
    expect(read.unknown_reason).toBe('lease_path_not_directory');
    expect(existsSync(target)).toBe(true);
  });

  test('an absent lease is available, and reads never create anything', () => {
    const repo = createRepo();
    const taskId = taskIdFor('never claimed');
    const read = readLease(repo, taskId);
    expect(read.classification).toBe('available');
    expect(read.record).toBeNull();
    expect(existsSync(leaseDirectory(repo, taskId))).toBe(false);
  });

  test('removal refuses every unknown shape', () => {
    const repo = createRepo();
    const empty = taskIdFor('refuse empty');
    createLeaseDirectory(repo, empty);
    expect(() => removeLease(repo, empty, 'claim-1')).toThrow('refusing to remove lease');
    expect(existsSync(leaseDirectory(repo, empty))).toBe(true);

    const malformed = taskIdFor('refuse malformed');
    createLeaseDirectory(repo, malformed);
    writeFileSync(leaseOwnerPath(repo, malformed), '{ broken');
    expect(() => removeLease(repo, malformed, 'claim-1')).toThrow('refusing to remove lease');
    expect(existsSync(leaseOwnerPath(repo, malformed))).toBe(true);

    const symlinked = taskIdFor('refuse symlinked');
    createLeaseDirectory(repo, symlinked);
    symlinkSync(join(repo, 'README.md'), leaseOwnerPath(repo, symlinked));
    expect(() => removeLease(repo, symlinked, 'claim-1')).toThrow('refusing to remove lease');
    expect(existsSync(join(repo, 'README.md'))).toBe(true);
  });
});

describe('claim rollback removes only the lease it created', () => {
  test('rolls back its own reserving lease', () => {
    const repo = createRepo();
    const record = claim(repo, 'roll back mine', 'claim-1');
    removeOwnLeaseAfterFailedClaim(repo, record.task_id, 'claim-1');
    expect(readLease(repo, record.task_id).classification).toBe('available');
  });

  test('rolls back the empty directory of its own crash window', () => {
    const repo = createRepo();
    const taskId = taskIdFor('roll back empty');
    createLeaseDirectory(repo, taskId);
    removeOwnLeaseAfterFailedClaim(repo, taskId, 'claim-1');
    expect(existsSync(leaseDirectory(repo, taskId))).toBe(false);
  });

  test("refuses to roll back another claim's lease", () => {
    const repo = createRepo();
    const record = claim(repo, 'not mine', 'claim-other');
    expect(() => removeOwnLeaseAfterFailedClaim(repo, record.task_id, 'claim-1'))
      .toThrow('refusing to remove lease');
    expect(readLease(repo, record.task_id).record?.claim_id).toBe('claim-other');
  });

  test('refuses to roll back a lease it cannot classify', () => {
    const repo = createRepo();
    const taskId = taskIdFor('unclassifiable rollback');
    createLeaseDirectory(repo, taskId);
    writeFileSync(leaseOwnerPath(repo, taskId), 'not a record');
    expect(() => removeOwnLeaseAfterFailedClaim(repo, taskId, 'claim-1'))
      .toThrow('refusing to roll back lease');
    expect(existsSync(leaseOwnerPath(repo, taskId))).toBe(true);
  });
});

describe('lookup by fencing token', () => {
  test('finds one lease and ignores unknown neighbours', () => {
    const repo = createRepo();
    const wanted = claim(repo, 'find me', 'claim-wanted');
    claim(repo, 'other lease', 'claim-other');
    const broken = taskIdFor('broken neighbour');
    createLeaseDirectory(repo, broken);
    writeFileSync(leaseOwnerPath(repo, broken), '{ broken');

    const found = findLeaseByClaimId(repo, 'claim-wanted');
    expect(found.ok).toBe(true);
    if (found.ok) {
      expect(found.lease.task_id).toBe(wanted.task_id);
      expect(found.lease.record.claim_id).toBe('claim-wanted');
    }
  });

  test('an absent coordination root and an unknown token both fail closed', () => {
    const repo = createRepo();
    const missing = findLeaseByClaimId(repo, 'claim-nobody');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain('no lease holds claim id');

    claim(repo, 'present lease', 'claim-present');
    const unknown = findLeaseByClaimId(repo, 'claim-nobody');
    expect(unknown.ok).toBe(false);
  });

  test('a token held by two leases fails closed instead of picking one', () => {
    const repo = createRepo();
    claim(repo, 'duplicate token a', 'claim-dup');
    claim(repo, 'duplicate token b', 'claim-dup');
    const result = findLeaseByClaimId(repo, 'claim-dup');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('is held by 2 leases');
  });
});

describe('per-task lock', () => {
  test('the lock directory lives on the shared plane and is released after use', () => {
    const repo = createRepo();
    const taskId = taskIdFor('lock path');
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
    const leaseStoreModule = new URL('../src/effects/state/coordination-lease-store.ts', import.meta.url).href;
    const child = Bun.spawn([
      process.execPath,
      '-e',
      [
        "const { writeFileSync } = await import('node:fs');",
        'const { withTaskLock } = await import(process.env.LEASE_STORE_MODULE);',
        'withTaskLock(process.env.REPO_ROOT, process.env.TASK_ID, () => {',
        "  writeFileSync(process.env.READY_PATH, 'ready\\n');",
        '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);',
        '});',
      ].join('\n'),
    ], {
      cwd: repo,
      env: {
        ...process.env,
        LEASE_STORE_MODULE: leaseStoreModule,
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
          join(import.meta.dir, '../src/effects/state/coordination-lease-store.ts'),
          repo,
          taskId,
        ],
        { encoding: 'utf-8' },
      );
      inner = attempt.stdout.trim();
    });
    expect(inner).toBe('ExclusiveLockContentionError');
  }, 60_000);

test('the backlog lock reclaims a dead owner and reports it in the shell\'s words', () => {
    // `sprint-backlog.sh` and this primitive now take the same directory, so
    // they must agree about when a dead holder's lock is recoverable. The shell
    // reclaims a stale *empty* directory; this primitive leaves an owner file
    // behind, so it must also reclaim a dead-PID owner -- otherwise a crash
    // under one caller strands every later call through the other.
    const repo = createRepo();
    const lockPath = join(resolveGitCommonDirectory(repo), COORDINATION_BACKLOG_LOCK_RELATIVE_PATH);
    mkdirSync(lockPath, { recursive: true });

    // A PID that cannot be alive: the owner file names it, so the reclaim is a
    // decision about a named dead process rather than about elapsed time.
    const deadPid = 2 ** 22 - 1;
    const token = `${deadPid}-${Date.now()}-11111111-1111-4111-8111-111111111111`;
    writeFileSync(
      join(lockPath, `${token}.json`),
      `${JSON.stringify({ pid: deadPid, created_at: Date.now(), token })}\n`,
    );

    const reclaimed: string[] = [];
    expect(withBacklogLock(repo, () => 'acquired', (path) => reclaimed.push(path))).toBe('acquired');
    expect(reclaimed).toEqual([lockPath]);
    expect(existsSync(lockPath)).toBe(false);
  }, 60_000);

  test('the backlog lock reclaims a stale empty directory, like the shell does', () => {
    const repo = createRepo();
    const lockPath = join(resolveGitCommonDirectory(repo), COORDINATION_BACKLOG_LOCK_RELATIVE_PATH);
    mkdirSync(lockPath, { recursive: true });
    spawnSync('bash', ['-c', `touch -t 202001010000 '${lockPath}'`], { encoding: 'utf-8' });

    const reclaimed: string[] = [];
    expect(withBacklogLock(repo, () => 'acquired', (path) => reclaimed.push(path))).toBe('acquired');
    expect(reclaimed).toEqual([lockPath]);
    expect(existsSync(lockPath)).toBe(false);
  }, 60_000);

  test('a live owner is never reclaimed', () => {
    const repo = createRepo();
    const lockPath = join(resolveGitCommonDirectory(repo), COORDINATION_BACKLOG_LOCK_RELATIVE_PATH);
    mkdirSync(lockPath, { recursive: true });
    const token = `${process.pid}-${Date.now()}-22222222-2222-4222-8222-222222222222`;
    writeFileSync(
      join(lockPath, `${token}.json`),
      `${JSON.stringify({ pid: process.pid, created_at: Date.now(), token })}\n`,
    );
    expect(() => withBacklogLock(repo, () => 'never', () => { throw new Error('must not reclaim'); }))
      .toThrow(/timed out waiting/);
    expect(existsSync(lockPath)).toBe(true);
  }, 60_000);

  test('the backlog lock is one shared lock for the whole clone', () => {
    const repo = createRepo();
    const lockPath = join(resolveGitCommonDirectory(repo), COORDINATION_BACKLOG_LOCK_RELATIVE_PATH);
    expect(withBacklogLock(repo, () => existsSync(lockPath))).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
  });
});

/**
 * The ownership verbs over these primitives, on a real repository with a real
 * canonical ref. Racing them across linked worktrees is the concurrency
 * harness's job, not this file's; what is pinned here is that each verb is
 * gated on the fencing token and on canonical authority.
 */
describe('claim verbs', () => {
  const SPRINT = 'plans/sprints/verbs.sprint.md';
  const ROW_A = `| 1 | ${fixtureTaskId('build the lease store')} | [ ] | build the lease store | contract | store tests pass | (pending) |`;
  const ROW_B = `| 2 | ${fixtureTaskId('wire the claim verbs')} | [ ] | wire the claim verbs | contract | claim tests pass | (pending) |`;

  function sprintText(rows: readonly string[]): string {
    return [
      '# Sprint: Verb Fixture',
      '',
      '> **Status**: Executing',
      '> **Backlog Schema**: 2',
      '',
      '## Backlog',
      '',
      '| # | ID | Status | Task | Mode | Acceptance | Plan |',
      '|---|----|--------|------|------|------------|------|',
      ...rows,
      '',
      '## Execution Log',
      '',
    ].join('\n');
  }

  function commitSprint(repo: string, rows: readonly string[]): void {
    mkdirSync(join(repo, 'plans/sprints'), { recursive: true });
    writeFileSync(join(repo, SPRINT), sprintText(rows));
    run(repo, ['add', SPRINT]);
    run(repo, ['commit', '--quiet', '-m', 'sprint']);
  }

  /**
   * Every `resumed` receipt `bind` appends through the fixture port, in call
   * order. The fixture binds to `/tmp/wt`, which is not a repository, so the
   * live append is replaced by a recorder here; the append's own IO is proved
   * over real linked worktrees in `tests/sprint-claim-concurrency.test.ts`.
   */
  const RESUMED_RECEIPTS: Array<{ worktree: string; unitRef: string }> = [];

  function deps(
    repo: string,
    claimIds: readonly string[] = ['claim-1'],
    appendResumedReceipt: (worktree: string, unitRef: string) => void = (worktree, unitRef) => {
      RESUMED_RECEIPTS.push({ worktree, unitRef });
    },
  ): SprintCommandDependencies {
    const queue = [...claimIds];
    const live = processSprintDependencies(repo);
    return {
      ...live,
      newClaimId: () => queue.shift() ?? randomUUID(),
      coordination: { ...live.coordination, appendResumedReceipt },
    };
  }

  function canonicalTask(repo: string, taskCell: string) {
    const found = projectCanonicalTasks({
      repoIdentity: resolveGitCommonDirectory(repo),
      sprintPath: SPRINT,
      sprintText: readFileSync(join(repo, SPRINT), 'utf-8'),
    }).find((task) => task.row.task === taskCell);
    if (!found) throw new Error(`no row with Task cell ${taskCell}`);
    return found;
  }

  function claimOptions(repo: string, taskCell: string) {
    const task = canonicalTask(repo, taskCell);
    return {
      taskId: task.task_id,
      expectedTaskRevision: task.task_revision,
      targetRef: 'main',
      sprintPath: SPRINT,
      sessionId: 'session-1',
    };
  }

  function repoWithSprint(rows: readonly string[] = [ROW_A, ROW_B]): string {
    const repo = createRepo();
    commitSprint(repo, rows);
    return repo;
  }

  test('claim publishes a reserving lease and refuses a second claimant', () => {
    const repo = repoWithSprint();
    const first = claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo));
    expect(first.exitCode).toBe(0);
    const record = JSON.parse(first.stdout) as LeaseOwnerRecordV1;
    expect(record.state).toBe('reserving');
    expect(record.claim_id).toBe('claim-1');
    expect(record.sprint_path).toBe(SPRINT);
    expect(record.execution_worktree).toBeNull();
    expect(record.stolen_from).toBeNull();
    expect(readLease(repo, record.task_id).classification).toBe('reserving');

    const second = claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo, ['claim-2']));
    expect(second.exitCode).toBe(1);
    expect(second.stderr).toContain('is not available');
    expect(readLease(repo, record.task_id).record?.claim_id).toBe('claim-1');
  });

  test('a sibling row completing does not block a claim', () => {
    const repo = repoWithSprint();
    const options = claimOptions(repo, 'wire the claim verbs');
    commitSprint(repo, [
      `| 1 | ${fixtureTaskId('build the lease store')} | [x] | build the lease store | contract | store tests pass | \`plans/archive/a.md\` |`,
      ROW_B,
    ]);
    const outcome = claimSprintCommand(options, deps(repo));
    expect(outcome.exitCode).toBe(0);
  });

  test('claim refuses a stale expected revision and a non-pending row', () => {
    const repo = repoWithSprint();
    const drifted = claimSprintCommand(
      { ...claimOptions(repo, 'wire the claim verbs'), expectedTaskRevision: 'a'.repeat(64) },
      deps(repo),
    );
    expect(drifted.exitCode).toBe(1);
    expect(drifted.stderr).toContain('drifted');

    const options = claimOptions(repo, 'wire the claim verbs');
    commitSprint(repo, [ROW_A, `| 2 | ${fixtureTaskId('wire the claim verbs')} | [x] | wire the claim verbs | contract | claim tests pass | (pending) |`]);
    const done = claimSprintCommand(options, deps(repo));
    expect(done.exitCode).toBe(1);
    expect(done.stderr).toContain('is not pending');
    expect(readLease(repo, options.taskId).classification).toBe('available');
  });

  test('claim reads the canonical ref, not the caller working tree', () => {
    const repo = repoWithSprint();
    const options = claimOptions(repo, 'wire the claim verbs');
    // A stale local copy that still shows the row pending must not rescue a
    // claim whose canonical row has already been completed.
    commitSprint(repo, [ROW_A, `| 2 | ${fixtureTaskId('wire the claim verbs')} | [x] | wire the claim verbs | contract | claim tests pass | (pending) |`]);
    writeFileSync(join(repo, SPRINT), sprintText([ROW_A, ROW_B]));
    expect(claimSprintCommand(options, deps(repo)).exitCode).toBe(1);
  });

  test('claim rolls back only its own lease when canonical moves mid-claim', () => {
    const repo = repoWithSprint();
    const options = claimOptions(repo, 'wire the claim verbs');
    const live = processSprintDependencies(repo);
    let reads = 0;
    const racing: SprintCommandDependencies = {
      ...live,
      newClaimId: () => 'claim-racing',
      coordination: {
        ...live.coordination,
        readCanonicalSprint: (source) => {
          reads += 1;
          // The second read is the post-write re-read: complete the row between
          // the durable write and that check.
          if (reads === 2) {
            commitSprint(repo, [
              ROW_A,
              `| 2 | ${fixtureTaskId('wire the claim verbs')} | [x] | wire the claim verbs | contract | claim tests pass | (pending) |`,
            ]);
          }
          return live.coordination.readCanonicalSprint(source);
        },
      },
    };
    const other = claimSprintCommand(claimOptions(repo, 'build the lease store'), deps(repo, ['claim-neighbour']));
    expect(other.exitCode).toBe(0);

    const outcome = claimSprintCommand(options, racing);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('canonical authority changed during claim');
    expect(readLease(repo, options.taskId).classification).toBe('available');
    // The neighbouring lease this call did not create is untouched.
    expect(readLease(repo, canonicalTask(repo, 'build the lease store').task_id).record?.claim_id)
      .toBe('claim-neighbour');
  });

  test('bind fills the execution binding, and only from reserving', () => {
    const repo = repoWithSprint();
    expect(claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo)).exitCode).toBe(0);

    const bound = bindSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', branch: 'codex/example', unitRef: 'plans/plan-x.md' },
      deps(repo),
    );
    expect(bound.exitCode).toBe(0);
    const record = JSON.parse(bound.stdout) as LeaseOwnerRecordV1;
    expect(record.state).toBe('bound');
    expect(record.execution_worktree).toBe('/tmp/wt');
    expect(record.branch).toBe('codex/example');
    expect(record.unit_ref).toBe('plans/plan-x.md');

    const rebind = bindSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/other', branch: 'codex/other', unitRef: 'plans/plan-y.md' },
      deps(repo),
    );
    expect(rebind.exitCode).toBe(1);
    expect(rebind.stderr).toContain('cannot bind a lease in state bound');
  });

  test('bind appends a resumed receipt for the execution worktree and unit', () => {
    const repo = repoWithSprint();
    expect(claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo)).exitCode).toBe(0);
    RESUMED_RECEIPTS.length = 0;

    expect(bindSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', branch: 'codex/example', unitRef: 'plans/plan-x.md' },
      deps(repo),
    ).exitCode).toBe(0);

    // The receipt names the worktree whose ledger the board will read for this
    // lease, and the unit `evaluateAttemptStall` filters that ledger by.
    expect(RESUMED_RECEIPTS).toEqual([{ worktree: '/tmp/wt', unitRef: 'plans/plan-x.md' }]);
  });

  test('a resumed receipt that cannot be appended fails the bind closed', () => {
    const repo = repoWithSprint();
    expect(claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo)).exitCode).toBe(0);
    const taskId = canonicalTask(repo, 'wire the claim verbs').task_id;

    const outcome = bindSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', branch: 'codex/example', unitRef: 'plans/plan-x.md' },
      deps(repo, ['claim-1'], () => {
        throw new Error('ledger is not writable');
      }),
    );

    // Receipt before owner write: the append failed, so nothing was written.
    // A lease left `bound` while still carrying the previous claim's stall
    // count is exactly the shape this ordering exists to prevent.
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('ledger is not writable');
    const lease = readLease(repo, taskId);
    expect(lease.classification).toBe('reserving');
    expect(lease.record?.execution_worktree).toBeNull();
  });

  test('readLease publishes the owner record bytes verbatim, or null', () => {
    const repo = repoWithSprint();
    const taskId = canonicalTask(repo, 'wire the claim verbs').task_id;

    // No lease directory at all: nothing was read, so there are no bytes.
    expect(readLease(repo, taskId).raw).toBeNull();

    expect(claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo)).exitCode).toBe(0);
    const live = readLease(repo, taskId);
    expect(live.raw).toBe(readFileSync(leaseOwnerPath(repo, taskId), 'utf-8'));
    // Bytes, not a re-serialization of the parse: the digest that consumes
    // this must be able to see two records that parse the same but differ.
    expect(live.raw).toBe(serializeLeaseOwnerRecord(live.record!));

    // A malformed record is still bytes, and classification is unchanged.
    writeFileSync(leaseOwnerPath(repo, taskId), '{ not json');
    const malformed = readLease(repo, taskId);
    expect(malformed.classification).toBe('unknown');
    expect(malformed.unknown_reason).toBe('owner_record_malformed');
    expect(malformed.raw).toBe('{ not json');
  });

  test('an unknown fencing token cannot bind, release, or steal', () => {
    const repo = repoWithSprint();
    expect(claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo)).exitCode).toBe(0);
    for (const outcome of [
      bindSprintCommand({ claimId: 'claim-ghost', worktree: '/tmp/wt', branch: 'b', unitRef: 'r' }, deps(repo)),
      releaseSprintCommand({ claimId: 'claim-ghost' }, deps(repo)),
      stealSprintCommand({ expectedClaimId: 'claim-ghost', reason: 'stalled', sessionId: 's' }, deps(repo)),
    ]) {
      expect(outcome.exitCode).toBe(1);
      expect(outcome.stderr).toContain('no lease holds claim id claim-ghost');
    }
    expect(readLease(repo, canonicalTask(repo, 'wire the claim verbs').task_id).record?.claim_id)
      .toBe('claim-1');
  });

  test('release publishes released, then removes the lease', () => {
    const repo = repoWithSprint();
    expect(claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo)).exitCode).toBe(0);
    const taskId = canonicalTask(repo, 'wire the claim verbs').task_id;

    const released = releaseSprintCommand({ claimId: 'claim-1' }, deps(repo));
    expect(released.exitCode).toBe(0);
    expect((JSON.parse(released.stdout) as { released: LeaseOwnerRecordV1 }).released.state)
      .toBe('released');
    expect(readLease(repo, taskId).classification).toBe('available');
    expect(releaseSprintCommand({ claimId: 'claim-1' }, deps(repo)).exitCode).toBe(1);
  });

  test('steal transfers ownership with provenance and retires the old token', () => {
    const repo = repoWithSprint();
    expect(claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo)).exitCode).toBe(0);

    const stolen = stealSprintCommand(
      { expectedClaimId: 'claim-1', reason: 'no progress for 2h', sessionId: 'session-2' },
      deps(repo, ['claim-2']),
    );
    expect(stolen.exitCode).toBe(0);
    const record = JSON.parse(stolen.stdout) as LeaseOwnerRecordV1;
    expect(record.claim_id).toBe('claim-2');
    expect(record.state).toBe('reserving');
    expect(record.stolen_from).toEqual({ claim_id: 'claim-1', reason: 'no progress for 2h' });
    expect(record.claimed_by.session_id).toBe('session-2');

    // The stolen-from agent can no longer release or bind the new owner's lease.
    const staleRelease = releaseSprintCommand({ claimId: 'claim-1' }, deps(repo));
    expect(staleRelease.exitCode).toBe(1);
    expect(readLease(repo, record.task_id).record?.claim_id).toBe('claim-2');
  });

  test('reconcile reports without mutating, and clears only a released residue', () => {
    const repo = repoWithSprint();
    const taskId = canonicalTask(repo, 'wire the claim verbs').task_id;

    const absent = JSON.parse(
      reconcileSprintCommand({ taskId, targetRef: 'main' }, deps(repo)).stdout,
    ) as { classification: string; action: string };
    expect(absent).toMatchObject({ classification: 'available', action: 'none' });

    expect(claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo)).exitCode).toBe(0);
    const live = JSON.parse(reconcileSprintCommand({ taskId, targetRef: 'main' }, deps(repo)).stdout) as { action: string };
    expect(live.action).toBe('none');
    expect(readLease(repo, taskId).classification).toBe('reserving');

    // The crash window inside release: `released` published, directory still there.
    writeLeaseOwnerDurably(repo, taskId, { ...readLease(repo, taskId).record!, state: 'released' });
    const cleared = JSON.parse(reconcileSprintCommand({ taskId, targetRef: 'main' }, deps(repo)).stdout) as { action: string };
    expect(cleared.action).toBe('cleared_released_lease');
    expect(readLease(repo, taskId).classification).toBe('available');
  });

  test('reconcile never clears an unknown lease', () => {
    const repo = repoWithSprint();
    const taskId = canonicalTask(repo, 'wire the claim verbs').task_id;
    createLeaseDirectory(repo, taskId);
    const outcome = reconcileSprintCommand({ taskId, targetRef: 'main' }, deps(repo));
    expect(outcome.exitCode).toBe(0);
    expect(JSON.parse(outcome.stdout)).toMatchObject({
      classification: 'unknown',
      unknown_reason: 'owner_record_missing',
      action: 'none',
    });
    expect(existsSync(leaseDirectory(repo, taskId))).toBe(true);
  });

  test('reconcile refuses reviewing leases instead of bypassing publication reconciliation', () => {
    const repo = repoWithSprint();
    const taskId = canonicalTask(repo, 'wire the claim verbs').task_id;
    expect(claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo)).exitCode).toBe(0);
    expect(bindSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', branch: 'codex/example', unitRef: 'plans/plan-x.md' },
      deps(repo),
    ).exitCode).toBe(0);
    const reviewing: LeaseOwnerRecordV2 = {
      ...readLease(repo, taskId).record!,
      record_schema: 2,
      state: 'reviewing',
      finish_transaction_key: null,
      current_publication: {
        publication_id: `sha256:${'a'.repeat(64)}`,
        receipt_sha256: `sha256:${'b'.repeat(64)}`,
        head_sha: 'c'.repeat(40),
        ship_transaction_key: 'ship/reconcile-fixture',
      },
    };
    writeLeaseOwnerDurably(repo, taskId, reviewing);
    const outcome = reconcileSprintCommand({ taskId, targetRef: 'main' }, deps(repo));
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('cannot reconcile a reviewing lease');
    expect(readLease(repo, taskId).record).toEqual(reviewing);
  });

  test('malformed and missing options are usage errors, not refusals', () => {
    const repo = repoWithSprint();
    const base = claimOptions(repo, 'wire the claim verbs');
    expect(claimSprintCommand({ ...base, taskId: 'nope' }, deps(repo)).exitCode).toBe(2);
    expect(claimSprintCommand({ ...base, expectedTaskRevision: 'nope' }, deps(repo)).exitCode).toBe(2);
    expect(claimSprintCommand({ ...base, targetRef: undefined }, deps(repo)).exitCode).toBe(2);
    expect(claimSprintCommand({ ...base, sessionId: undefined }, deps(repo)).exitCode).toBe(2);
    expect(reconcileSprintCommand({ taskId: 'nope' }, deps(repo)).exitCode).toBe(2);
    expect(bindSprintCommand({ claimId: 'claim-1' }, deps(repo)).exitCode).toBe(2);
  });

  /** Claim row B and bind it to `/tmp/wt`, the shape every finish gate needs. */
  function claimAndBind(repo: string, claimId = 'claim-1'): string {
    expect(claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo, [claimId])).exitCode)
      .toBe(0);
    expect(bindSprintCommand(
      { claimId, worktree: '/tmp/wt', branch: 'codex/example', unitRef: 'plans/plan-x.md' },
      deps(repo),
    ).exitCode).toBe(0);
    return canonicalTask(repo, 'wire the claim verbs').task_id;
  }

  test('begin-completion refuses a target ref the claim was not taken against', () => {
    const repo = repoWithSprint();
    claimAndBind(repo);
    run(repo, ['branch', 'other', 'main']);

    // Same live token, same worktree, a ref the lease was never validated on:
    // pendingness proved there says nothing about the ref the lease protects.
    const wrongRef = beginCompletionSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', targetRef: 'other' },
      deps(repo),
    );
    expect(wrongRef.exitCode).toBe(1);
    expect(wrongRef.stderr).toContain('was claimed against main, not other');

    const rightRef = beginCompletionSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', targetRef: 'main' },
      deps(repo),
    );
    expect(rightRef.exitCode).toBe(0);
    expect((JSON.parse(rightRef.stdout) as LeaseOwnerRecordV1).state).toBe('completing');
  });

  test('begin-completion records the closeout journal key, and null without one', () => {
    const repo = repoWithSprint();
    claimAndBind(repo);
    const keyed = beginCompletionSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', targetRef: 'main', finishTransactionKey: 'finish/9f2c' },
      deps(repo),
    );
    expect(keyed.exitCode).toBe(0);
    expect((JSON.parse(keyed.stdout) as LeaseOwnerRecordV1).finish_transaction_key).toBe('finish/9f2c');

    const other = repoWithSprint();
    claimAndBind(other);
    const unkeyed = beginCompletionSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', targetRef: 'main' },
      deps(other),
    );
    expect(unkeyed.exitCode).toBe(0);
    expect((JSON.parse(unkeyed.stdout) as LeaseOwnerRecordV1).finish_transaction_key).toBeNull();
  });

  test('abort-completion restores a pending task and refuses every mismatched authority', () => {
    const repo = repoWithSprint();
    const taskId = claimAndBind(repo);
    expect(beginCompletionSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', targetRef: 'main', finishTransactionKey: 'finish/9f2c' },
      deps(repo),
    ).exitCode).toBe(0);

    expect(abortCompletionSprintCommand(
      { claimId: 'stale-claim', worktree: '/tmp/wt', targetRef: 'main' },
      deps(repo),
    ).exitCode).toBe(1);
    expect(abortCompletionSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/other', targetRef: 'main' },
      deps(repo),
    ).exitCode).toBe(1);
    run(repo, ['branch', 'other', 'main']);
    expect(abortCompletionSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', targetRef: 'other' },
      deps(repo),
    ).exitCode).toBe(1);

    // A failed finish may discover task-definition drift after the first gate.
    // Pendingness, not the stale revision, authorizes reopening the same lease
    // so the next owner can inspect that drift explicitly.
    commitSprint(repo, [
      ROW_A,
      `| 2 | ${fixtureTaskId('wire the claim verbs')} | [ ] | wire the claim verbs | contract | updated acceptance | (pending) |`,
    ]);
    const restored = abortCompletionSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', targetRef: 'main' },
      deps(repo),
    );
    expect(restored.exitCode).toBe(0);
    expect(JSON.parse(restored.stdout)).toMatchObject({
      state: 'bound',
      claim_id: 'claim-1',
      execution_worktree: '/tmp/wt',
      finish_transaction_key: null,
      canonical_status: '[ ]',
    });
    expect(abortCompletionSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', targetRef: 'main' },
      deps(repo),
    ).exitCode).toBe(0);
    expect(readLease(repo, taskId).classification).toBe('bound');

    commitSprint(repo, [ROW_A, ROW_B]);
    expect(beginCompletionSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', targetRef: 'main', finishTransactionKey: 'finish/next' },
      deps(repo),
    ).exitCode).toBe(0);
    commitSprint(repo, [
      ROW_A,
      `| 2 | ${fixtureTaskId('wire the claim verbs')} | [x] | wire the claim verbs | contract | claim tests pass | \`plans/archive/plan-x.md\` |`,
    ]);
    const completed = abortCompletionSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', targetRef: 'main' },
      deps(repo),
    );
    expect(completed.exitCode).toBe(1);
    expect(completed.stderr).toContain('canonical status is [x], expected [ ]');
    expect(readLease(repo, taskId).classification).toBe('completing');

    commitSprint(repo, [ROW_A]);
    const missing = abortCompletionSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', targetRef: 'main' },
      deps(repo),
    );
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain(`has task id ${taskId}`);
    expect(readLease(repo, taskId).classification).toBe('completing');
  });

  test('a drifted task definition blocks begin-completion', () => {
    const repo = repoWithSprint();
    const taskId = claimAndBind(repo);
    // Same Task cell, so the same task_id; a changed Acceptance cell is exactly
    // what `task_revision` exists to catch.
    commitSprint(repo, [
      ROW_A,
      `| 2 | ${fixtureTaskId('wire the claim verbs')} | [ ] | wire the claim verbs | contract | claim tests pass AND cover steal | (pending) |`,
    ]);

    const drifted = beginCompletionSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', targetRef: 'main' },
      deps(repo),
    );
    expect(drifted.exitCode).toBe(1);
    expect(drifted.stderr).toContain('drifted since it was claimed');
    // Fail closed: the lease stays bound, not half-moved into completing.
    expect(readLease(repo, taskId).classification).toBe('bound');
  });

  test('reconcile refuses a target ref the lease was not claimed against', () => {
    const repo = repoWithSprint();
    const taskId = claimAndBind(repo);
    run(repo, ['branch', 'other', 'main']);

    const wrongRef = reconcileSprintCommand({ taskId, targetRef: 'other' }, deps(repo));
    expect(wrongRef.exitCode).toBe(1);
    expect(wrongRef.stderr).toContain('was claimed against main, not other');
    expect(readLease(repo, taskId).classification).toBe('bound');

    // An absent lease has no recorded ref to disagree with, so reporting still works.
    const absent = reconcileSprintCommand(
      { taskId: canonicalTask(repo, 'build the lease store').task_id, targetRef: 'other' },
      deps(repo),
    );
    expect(absent.exitCode).toBe(0);
    expect(JSON.parse(absent.stdout)).toMatchObject({ classification: 'available', action: 'none' });
  });

  test('a completing lease refuses both release and steal', () => {
    const repo = repoWithSprint();
    const taskId = claimAndBind(repo);
    expect(beginCompletionSprintCommand(
      { claimId: 'claim-1', worktree: '/tmp/wt', targetRef: 'main' },
      deps(repo),
    ).exitCode).toBe(0);
    expect(readLease(repo, taskId).classification).toBe('completing');

    // Release would drop the lease without knowing whether the publication
    // landed; steal would erase the marker that says it might have.
    const released = releaseSprintCommand({ claimId: 'claim-1' }, deps(repo));
    expect(released.exitCode).toBe(1);
    expect(released.stderr).toContain('cannot release a lease in state completing');

    const stolen = stealSprintCommand(
      { expectedClaimId: 'claim-1', reason: 'stalled', sessionId: 'session-2' },
      deps(repo, ['claim-2']),
    );
    expect(stolen.exitCode).toBe(1);
    expect(stolen.stderr).toContain('cannot steal a lease in state completing');

    // Neither refusal touched the record.
    const still = readLease(repo, taskId);
    expect(still.classification).toBe('completing');
    expect(still.record?.claim_id).toBe('claim-1');
    expect(still.record?.generation).toBe(1);
  });

  test('claim records the canonical ref and generation 1; a steal increments it', () => {
    const repo = repoWithSprint();
    const first = claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo));
    expect(first.exitCode).toBe(0);
    const claimed = JSON.parse(first.stdout) as LeaseOwnerRecordV1;
    expect(claimed.target_ref).toBe('main');
    expect(claimed.generation).toBe(1);
    expect(claimed.finish_transaction_key).toBeNull();

    const stolen = stealSprintCommand(
      { expectedClaimId: 'claim-1', reason: 'no progress', sessionId: 'session-2' },
      deps(repo, ['claim-2']),
    );
    expect(stolen.exitCode).toBe(0);
    const thief = JSON.parse(stolen.stdout) as LeaseOwnerRecordV1;
    expect(thief.generation).toBe(2);
    expect(thief.target_ref).toBe('main');
    expect(readLease(repo, claimed.task_id).record?.generation).toBe(2);
  });

  test('an unresolvable ref or absent sprint path fails closed', () => {
    const repo = repoWithSprint();
    const base = claimOptions(repo, 'wire the claim verbs');
    const badRef = claimSprintCommand({ ...base, targetRef: 'no-such-ref' }, deps(repo));
    expect(badRef.exitCode).toBe(1);
    expect(badRef.stderr).toContain('does not resolve to a commit');

    const badPath = claimSprintCommand({ ...base, sprintPath: 'plans/sprints/absent.md' }, deps(repo));
    expect(badPath.exitCode).toBe(1);
    expect(badPath.stderr).toContain('is absent at');

    const traversal = claimSprintCommand({ ...base, sprintPath: '../escape.md' }, deps(repo));
    expect(traversal.exitCode).toBe(1);
    expect(traversal.stderr).toContain('unsafe canonical sprint path');
  });
});

/**
 * The pre-migration recovery window.
 *
 * `sprint migrate-schema` refuses while any row holds a non-released lease, and
 * schema 2 identity is fail-closed on a schema 1 sprint. Without a bounded
 * exception those two rules deadlock: a lease minted before the migration can
 * never be reconciled, so the sprint can never be migrated. `reconcile` is the
 * one verb that must work *before* migration, so it -- and only it -- may prove
 * completion through the schema 1 compatibility reader.
 *
 * The exception is deliberately narrow: `completing` only, exact legacy-id
 * equality, and a completed status cell. A live `bound` lease still belongs to
 * its owner.
 */
describe('reconcile on a schema 1 sprint: the pre-migration recovery window', () => {
  const LEGACY_SPRINT = 'plans/sprints/legacy-residue.sprint.md';
  const LEGACY_TASK = 'close the C9 canary';
  const SIBLING_TASK = 'keep a second row pending';

  function legacySprintText(status: string): string {
    return [
      '# Sprint: Legacy Residue',
      '',
      '> **Status**: Approved',
      '',
      '## Backlog',
      '',
      '| # | Status | Task | Mode | Acceptance | Plan |',
      '|---|--------|------|------|------------|------|',
      `| 1 | ${status} | ${LEGACY_TASK} | contract | canary evidence recorded | (pending) |`,
      `| 2 | [ ] | ${SIBLING_TASK} | inline | still pending | (pending) |`,
      '',
    ].join('\n');
  }

  function legacyRepo(status: string): { readonly repo: string; readonly taskId: string } {
    const repo = createRepo();
    mkdirSync(join(repo, 'plans/sprints'), { recursive: true });
    writeFileSync(join(repo, LEGACY_SPRINT), legacySprintText(status));
    run(repo, ['add', LEGACY_SPRINT]);
    run(repo, ['commit', '--quiet', '-m', 'legacy sprint']);
    return {
      repo,
      taskId: deriveLegacyTaskId({
        repoIdentity: resolveGitCommonDirectory(repo),
        sprintPath: LEGACY_SPRINT,
        taskCell: LEGACY_TASK,
      }),
    };
  }

  /** Publish a residue lease in one state, the way a crashed closeout leaves it. */
  function strandLease(repo: string, taskId: string, state: 'completing' | 'bound'): void {
    const base = buildLeaseOwnerRecord({
      claimId: 'claim-legacy-residue',
      taskId,
      taskRevision: 'c'.repeat(64),
      sprintPath: LEGACY_SPRINT,
      targetRef: 'main',
      generation: 1,
      sessionId: 'legacy-session',
      sourceWorktree: repo,
    });
    createLeaseDirectory(repo, taskId);
    writeLeaseOwnerDurably(repo, taskId, {
      ...base,
      state,
      execution_worktree: repo,
      branch: 'codex/legacy-residue',
      unit_ref: 'plans/archive/plan-legacy.md',
      finish_transaction_key: state === 'completing' ? 'finish/legacy-residue' : null,
    });
  }

  function reconcile(repo: string, taskId: string) {
    const outcome = reconcileSprintCommand(
      { taskId, targetRef: 'main' },
      processSprintDependencies(repo),
    );
    expect(outcome.exitCode).toBe(0);
    return JSON.parse(outcome.stdout) as {
      classification: string;
      canonical_status: string | null;
      canonical_error: string | null;
      action: string;
    };
  }

  test('a completing residue over a completed row is cleared', () => {
    const { repo, taskId } = legacyRepo('[x]');
    strandLease(repo, taskId, 'completing');
    const result = reconcile(repo, taskId);
    expect(result.canonical_error).toBeNull();
    expect(result.canonical_status).toBe('[x]');
    expect(result.action).toBe('cleared_completed_lease');
    expect(readLease(repo, taskId).classification).toBe('available');
  });

  test('a completing residue over a pending row is not cleared', () => {
    const { repo, taskId } = legacyRepo('[ ]');
    strandLease(repo, taskId, 'completing');
    const result = reconcile(repo, taskId);
    expect(result.canonical_status).toBe('[ ]');
    expect(result.action).toBe('none');
    expect(readLease(repo, taskId).classification).toBe('completing');
  });

  test('a lease whose task id is not any row\'s legacy identity is not cleared', () => {
    const { repo } = legacyRepo('[x]');
    const foreignTaskId = 'd'.repeat(64);
    strandLease(repo, foreignTaskId, 'completing');
    const result = reconcile(repo, foreignTaskId);
    expect(result.canonical_status).toBeNull();
    expect(result.canonical_error).toContain('no backlog row');
    expect(result.action).toBe('none');
    expect(readLease(repo, foreignTaskId).classification).toBe('completing');
  });

  test('a bound lease is never cleared through the compatibility path', () => {
    const { repo, taskId } = legacyRepo('[x]');
    strandLease(repo, taskId, 'bound');
    const result = reconcile(repo, taskId);
    expect(result.action).toBe('none');
    expect(result.canonical_error).toContain('bound');
    expect(readLease(repo, taskId).classification).toBe('bound');
  });
});

/**
 * Completing a row is one transaction, and these are the races that used to
 * break it.
 *
 * The old shape resolved the row, gated on a claim id and a revision, rewrote
 * the row with `awk`, and released the lease -- four observations of shared
 * state spread across two processes. A `steal`, a `release`, or a fresh `claim`
 * landing in any of the windows between them produced the one outcome a
 * completion may never produce: a row marked `[x]` with no lease state that
 * supports it. Each test below drops a competing verb into exactly that window
 * by holding the row's task lock while the completion blocks on it.
 */
describe('complete-row is one locked transaction', () => {
  const RACE_SPRINT = 'plans/sprints/race.sprint.md';
  const RACE_TASK = 'complete under contention';
  const RACE_ID = fixtureTaskId('race row');

  function raceSprintText(status: string): string {
    return [
      '# Sprint: Race Fixture',
      '',
      '> **Status**: Executing',
      '> **Backlog Schema**: 2',
      '> **Updated**: 2026-01-01 00:00',
      '',
      '## Backlog',
      '',
      '| # | ID | Status | Task | Mode | Acceptance | Plan |',
      '|---|----|--------|------|------|------------|------|',
      `| 1 | ${RACE_ID} | ${status} | ${RACE_TASK} | inline | races converge | (pending) |`,
      '',
    ].join('\n');
  }

  function raceRepo(): string {
    const repo = createRepo();
    mkdirSync(join(repo, 'plans/sprints'), { recursive: true });
    writeFileSync(join(repo, RACE_SPRINT), raceSprintText('[ ]'));
    run(repo, ['add', RACE_SPRINT]);
    run(repo, ['commit', '--quiet', '-m', 'race sprint']);
    return repo;
  }

  function canonicalRevision(repo: string): string {
    const task = projectCanonicalTasks({
      repoIdentity: resolveGitCommonDirectory(repo),
      sprintPath: RACE_SPRINT,
      sprintText: readFileSync(join(repo, RACE_SPRINT), 'utf-8'),
    })[0]!;
    expect(task.task_id).toBe(RACE_ID);
    return task.task_revision;
  }

  /** A claimed, bound row with the token this tree would hold. */
  function claimRow(repo: string, claimId: string): void {
    const record = bindLeaseRecord(
      buildLeaseOwnerRecord({
        claimId,
        taskId: RACE_ID,
        taskRevision: canonicalRevision(repo),
        sprintPath: RACE_SPRINT,
        targetRef: 'main',
        generation: 1,
        sessionId: 'race-session',
        sourceWorktree: repo,
      }),
      { claimId, executionWorktree: repo, branch: 'codex/race', unitRef: 'plans/plan-race.md' },
    );
    if (!record.ok) throw new Error(record.error);
    createLeaseDirectory(repo, RACE_ID);
    writeLeaseOwnerDurably(repo, RACE_ID, record.record);
    mkdirSync(join(repo, CLAIM_TOKEN_DIR), { recursive: true });
    writeFileSync(
      join(repo, CLAIM_TOKEN_DIR, `${RACE_ID}.claim`),
      [
        `claim_id=${claimId}`,
        `task_id=${RACE_ID}`,
        `sprint=${RACE_SPRINT}`,
        `task=${RACE_TASK}`,
        'unit_ref=plans/plan-race.md',
        '',
      ].join('\n'),
    );
  }

  function completionChildSource(repo: string, signals: string): string {
    return [
      "import { writeFileSync } from 'fs';",
      `import { completeRowSprintCommand, processSprintDependencies } from '${join(REPO_ROOT, 'src/effects/state/coordination-sprint')}';`,
      `writeFileSync(${JSON.stringify(join(signals, 'started'))}, 'go');`,
      'const outcome = completeRowSprintCommand(',
      `  { sprint: ${JSON.stringify(RACE_SPRINT)}, task: ${JSON.stringify(RACE_TASK)}, targetRef: 'main' },`,
      `  processSprintDependencies(${JSON.stringify(repo)}),`,
      ');',
      `writeFileSync(${JSON.stringify(join(signals, 'outcome.json'))}, JSON.stringify(outcome));`,
    ].join('\n');
  }

  function waitForFile(path: string, label: string): void {
    const deadline = Date.now() + 30_000;
    while (!existsSync(path)) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
      Bun.sleepSync(10);
    }
  }

  /**
   * Run a completion in a second process while `competitor` runs inside the
   * row's task lock, so the competing verb lands exactly in the window the old
   * split transaction left open.
   */
  function raceAgainst(repo: string, competitor: (repo: string) => void): {
    readonly exitCode: number;
    readonly stderr: string;
  } {
    const signals = join(repo, '.signals');
    mkdirSync(signals, { recursive: true });
    const childPath = join(repo, 'completion-child.ts');
    writeFileSync(childPath, completionChildSource(repo, signals));
    const child = spawn('bun', [childPath], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      withTaskLock(repo, RACE_ID, () => {
        waitForFile(join(signals, 'started'), 'the completion child to start');
        Bun.sleepSync(300);
        competitor(repo);
      });
      waitForFile(join(signals, 'outcome.json'), 'the completion child to finish');
      return JSON.parse(readFileSync(join(signals, 'outcome.json'), 'utf-8'));
    } finally {
      child.kill();
    }
  }

  test('a steal that lands mid-completion wins, and the row is not marked done', () => {
    const repo = raceRepo();
    claimRow(repo, 'claim-original');
    const outcome = raceAgainst(repo, (root) => {
      const current = readLease(root, RACE_ID).record!;
      const stolen = stealLeaseRecord(current, {
        expectedClaimId: current.claim_id,
        newClaimId: 'claim-thief',
        sessionId: 'thief',
        sourceWorktree: root,
        reason: 'takeover under contention',
      });
      if (!stolen.ok) throw new Error(stolen.error);
      writeLeaseOwnerDurably(root, RACE_ID, stolen.record);
    });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('the claim moved');
    expect(readFileSync(join(repo, RACE_SPRINT), 'utf-8')).toContain(`| 1 | ${RACE_ID} | [ ] |`);
    // The thief still owns it: the completion released nothing.
    expect(readLease(repo, RACE_ID).record?.claim_id).toBe('claim-thief');
  }, 60_000);

  test('a release-and-reclaim that lands mid-completion is not completed over', () => {
    const repo = raceRepo();
    claimRow(repo, 'claim-original');
    const outcome = raceAgainst(repo, (root) => {
      removeLease(root, RACE_ID, 'claim-original');
      const record = buildLeaseOwnerRecord({
        claimId: 'claim-successor',
        taskId: RACE_ID,
        taskRevision: canonicalRevision(root),
        sprintPath: RACE_SPRINT,
        targetRef: 'main',
        generation: 2,
        sessionId: 'successor',
        sourceWorktree: root,
      });
      createLeaseDirectory(root, RACE_ID);
      writeLeaseOwnerDurably(root, RACE_ID, record);
    });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('the claim moved');
    expect(readFileSync(join(repo, RACE_SPRINT), 'utf-8')).toContain(`| 1 | ${RACE_ID} | [ ] |`);
    expect(readLease(repo, RACE_ID).record?.claim_id).toBe('claim-successor');
  }, 60_000);

  test('a fresh claim that lands mid no-lease completion is not completed over', () => {
    // The zero-coordination flow: no token, no lease -- until somebody claims
    // the row while this completion is already blocked on its task lock.
    const repo = raceRepo();
    // A lease plane exists on this clone, but nothing owns this row yet.
    mkdirSync(join(coordinationRoot(repo), 'leases'), { recursive: true });
    const outcome = raceAgainst(repo, (root) => {
      const record = buildLeaseOwnerRecord({
        claimId: 'claim-latecomer',
        taskId: RACE_ID,
        taskRevision: canonicalRevision(root),
        sprintPath: RACE_SPRINT,
        targetRef: 'main',
        generation: 1,
        sessionId: 'latecomer',
        sourceWorktree: root,
      });
      createLeaseDirectory(root, RACE_ID);
      writeLeaseOwnerDurably(root, RACE_ID, record);
    });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('holds no claim token');
    expect(readFileSync(join(repo, RACE_SPRINT), 'utf-8')).toContain(`| 1 | ${RACE_ID} | [ ] |`);
    expect(readLease(repo, RACE_ID).record?.claim_id).toBe('claim-latecomer');
  }, 60_000);

  test('an uncontended completion flips the row and releases the lease', () => {
    const repo = raceRepo();
    claimRow(repo, 'claim-original');
    const outcome = completeRowSprintCommand(
      { sprint: RACE_SPRINT, task: RACE_TASK, targetRef: 'main' },
      processSprintDependencies(repo),
    );
    expect(outcome.stderr).toBe('');
    expect(outcome.exitCode).toBe(0);
    expect(readFileSync(join(repo, RACE_SPRINT), 'utf-8')).toContain(`| 1 | ${RACE_ID} | [x] |`);
    expect(readLease(repo, RACE_ID).classification).toBe('available');
    expect(existsSync(join(repo, CLAIM_TOKEN_DIR, `${RACE_ID}.claim`))).toBe(false);
  }, 60_000);

test('a lease this completion could not release is refused before any write', () => {
    // The half-applied state this ordering exists to prevent: the gate passed
    // on ownership alone, the row was flipped to `[x]`, and only then did
    // `releaseLeaseRecord` refuse -- publishing "done" while the lease and the
    // token stayed live. `reviewing` is the normal contract-flow state and
    // `completing` is the residue a crashed closeout leaves, so both are
    // reachable here, not hypothetical.
    for (const state of ['reviewing', 'completing'] as const) {
      const repo = raceRepo();
      claimRow(repo, 'claim-original');
      const ownerPath = leaseOwnerPath(repo, RACE_ID);
      const bound = JSON.parse(readFileSync(ownerPath, 'utf-8')) as Record<string, unknown>;
      const stuck = state === 'reviewing'
        ? {
          ...bound,
          record_schema: 2,
          state,
          finish_transaction_key: null,
          current_publication: {
            publication_id: `sha256:${'c'.repeat(64)}`,
            receipt_sha256: `sha256:${'a'.repeat(64)}`,
            head_sha: 'b'.repeat(40),
            ship_transaction_key: 'ship/race',
          },
        }
        : { ...bound, state, finish_transaction_key: 'finish/race' };
      writeFileSync(ownerPath, `${JSON.stringify(stuck, null, 2)}\n`);
      expect(readLease(repo, RACE_ID).record?.state).toBe(state);

      const sprintBefore = readFileSync(join(repo, RACE_SPRINT), 'utf-8');
      const outcome = completeRowSprintCommand(
        { sprint: RACE_SPRINT, task: RACE_TASK, targetRef: 'main' },
        processSprintDependencies(repo),
      );

      expect(outcome.exitCode).toBe(1);
      expect(outcome.stderr).toContain(`holds a lease in state ${state}`);
      expect(outcome.stderr).toContain(state === 'reviewing' ? 'publication recovery' : 'sprint reconcile');
      // Nothing moved: the row is still pending, the lease and token still stand.
      expect(readFileSync(join(repo, RACE_SPRINT), 'utf-8')).toBe(sprintBefore);
      expect(readLease(repo, RACE_ID).record?.state).toBe(state);
      expect(existsSync(join(repo, CLAIM_TOKEN_DIR, `${RACE_ID}.claim`))).toBe(true);
    }
  }, 60_000);

  test('a deferred release accepts the completing window the closeout holds', () => {
    // The contract closeout calls this verb with --defer-lease-release while its
    // own lease sits in `completing`, the state `begin-completion` put it in.
    // Refusing that state unconditionally aborted the whole finish transaction
    // and left its journal `aborted` instead of resumable, so what the gate
    // accepts depends on whether this completion will release the lease at all.
    const repo = raceRepo();
    claimRow(repo, 'claim-original');
    const ownerPath = leaseOwnerPath(repo, RACE_ID);
    const bound = JSON.parse(readFileSync(ownerPath, 'utf-8')) as Record<string, unknown>;
    writeFileSync(ownerPath, `${JSON.stringify({ ...bound, state: 'completing', finish_transaction_key: 'finish/race' }, null, 2)}\n`);
    expect(readLease(repo, RACE_ID).record?.state).toBe('completing');

    const deferred = completeRowSprintCommand(
      { sprint: RACE_SPRINT, task: RACE_TASK, targetRef: 'main', deferLeaseRelease: true },
      processSprintDependencies(repo),
    );
    expect(deferred.stderr).toBe('');
    expect(deferred.exitCode).toBe(0);
    // The row landed and the lease is untouched: its release belongs to the
    // closeout's own transaction, which ends at the publication commit.
    expect(readFileSync(join(repo, RACE_SPRINT), 'utf-8')).toContain(`| 1 | ${RACE_ID} | [x] |`);
    expect(readLease(repo, RACE_ID).record?.state).toBe('completing');
    expect(existsSync(join(repo, CLAIM_TOKEN_DIR, `${RACE_ID}.claim`))).toBe(true);
  }, 60_000);

  test('a releasing completion still refuses the same completing lease', () => {
    // The same state, the other intent: an inline completion would have to
    // release it, and `completing` cannot be released.
    const repo = raceRepo();
    claimRow(repo, 'claim-original');
    const ownerPath = leaseOwnerPath(repo, RACE_ID);
    const bound = JSON.parse(readFileSync(ownerPath, 'utf-8')) as Record<string, unknown>;
    writeFileSync(ownerPath, `${JSON.stringify({ ...bound, state: 'completing', finish_transaction_key: 'finish/race' }, null, 2)}\n`);

    const inline = completeRowSprintCommand(
      { sprint: RACE_SPRINT, task: RACE_TASK, targetRef: 'main' },
      processSprintDependencies(repo),
    );
    expect(inline.exitCode).toBe(1);
    expect(inline.stderr).toContain('holds a lease in state completing');
    expect(readFileSync(join(repo, RACE_SPRINT), 'utf-8')).toContain(`| 1 | ${RACE_ID} | [ ] |`);
  }, 60_000);

  test('a throw after the row is written restores the sprint bytes', () => {
    const repo = raceRepo();
    claimRow(repo, 'claim-original');
    const sprintBefore = readFileSync(join(repo, RACE_SPRINT), 'utf-8');
    const real = processSprintDependencies(repo);

    // The lease write is the first step past the row rewrite; failing it is the
    // window where the row would otherwise stay published on its own.
    // The verb turns an unexpected throw into a typed operational failure
    // rather than letting it reach the CLI, so the assertion is on the outcome.
    const outcome = completeRowSprintCommand(
      { sprint: RACE_SPRINT, task: RACE_TASK, targetRef: 'main' },
      {
        ...real,
        coordination: {
          ...real.coordination,
          writeLeaseOwner: () => { throw new Error('injected lease write failure'); },
        },
      },
    );
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('injected lease write failure');

    expect(readFileSync(join(repo, RACE_SPRINT), 'utf-8')).toBe(sprintBefore);
    expect(readLease(repo, RACE_ID).record?.claim_id).toBe('claim-original');
    expect(existsSync(join(repo, CLAIM_TOKEN_DIR, `${RACE_ID}.claim`))).toBe(true);
  }, 60_000);

  test('bytes that two readers would read differently are refused, not interpreted', () => {
    // `JSON.parse` keeps the last value for a duplicated key; a line reader
    // keeps the first. Either answer is somebody's authority, so neither is.
    const repo = raceRepo();
    claimRow(repo, 'claim-original');
    const ownerPath = leaseOwnerPath(repo, RACE_ID);
    const owner = readFileSync(ownerPath, 'utf-8');
    writeFileSync(ownerPath, owner.replace(
      '"claim_id": "claim-original",',
      '"claim_id": "claim-original",\n  "claim_id": "claim-forged",',
    ));
    expect(parseLeaseOwnerRecord(readFileSync(ownerPath, 'utf-8'))).toBeNull();

    const duplicated = completeRowSprintCommand(
      { sprint: RACE_SPRINT, task: RACE_TASK, targetRef: 'main' },
      processSprintDependencies(repo),
    );
    expect(duplicated.exitCode).toBe(1);
    expect(duplicated.stderr).toContain('cannot be classified');
    expect(readFileSync(join(repo, RACE_SPRINT), 'utf-8')).toContain(`| 1 | ${RACE_ID} | [ ] |`);

    // The same rule for the token: a second `claim_id=` line is not a capability.
    writeFileSync(ownerPath, owner);
    const tokenPath = join(repo, CLAIM_TOKEN_DIR, `${RACE_ID}.claim`);
    const token = readFileSync(tokenPath, 'utf-8');
    writeFileSync(tokenPath, token.replace('claim_id=claim-original\n', 'claim_id=claim-original\nclaim_id=claim-forged\n'));
    const ambiguousToken = completeRowSprintCommand(
      { sprint: RACE_SPRINT, task: RACE_TASK, targetRef: 'main' },
      processSprintDependencies(repo),
    );
    expect(ambiguousToken.exitCode).toBe(1);
    expect(ambiguousToken.stderr).toContain('not readable as a single capability');
    expect(readFileSync(join(repo, RACE_SPRINT), 'utf-8')).toContain(`| 1 | ${RACE_ID} | [ ] |`);
  }, 60_000);
});
