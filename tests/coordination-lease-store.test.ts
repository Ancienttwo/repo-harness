/**
 * Coordination plane primitives over a real git repository: lease election,
 * durable owner writes, per-task locking, and the `unknown` classification.
 *
 * Real filesystem, real `git rev-parse --git-common-dir`, real linked
 * worktree. Every hazard here is a filesystem-ordering hazard, so a mocked fs
 * would prove nothing about `mkdir` atomicity or the crash windows.
 */
import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import { execFileSync, spawn, spawnSync } from 'child_process';
import {
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

test.skipIf(process.platform === 'win32')('POSIX directory flush failure leaves the created lease unknown and propagates', () => {
  const root = createRepo(), taskId = '7'.repeat(64);
  const flush = fs.fsyncSync;
  const sync = spyOn(fs, 'fsyncSync').mockImplementation(fd => {
    if (fs.fstatSync(fd).isDirectory()) throw Object.assign(new Error('directory flush failed'), { code: 'EIO' });
    flush(fd);
  });
  try {
    expect(() => createLeaseDirectory(root, taskId)).toThrow('directory flush failed');
    expect(readLease(root, taskId).classification).toBe('unknown');
    expect(readLease(root, taskId).record).toBeNull();
  } finally { sync.mockRestore(); }
});

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

  test('one scan of many leases starts one Git discovery process', () => {
    const repo = createRepo();
    claim(repo, 'scan lease a', 'scan-claim-a');
    claim(repo, 'scan lease b', 'scan-claim-b');
    claim(repo, 'scan lease c', 'scan-claim-c');
    const discovery = spyOn(childProcess, 'execFileSync');
    try {
      const found = findLeaseByClaimId(repo, 'scan-claim-a');
      expect(found.ok).toBe(true);
      const discoveries = discovery.mock.calls
        .filter((call) => Array.isArray(call[1]) && (call[1] as readonly string[]).includes('--git-common-dir'))
        .length;
      expect(discoveries).toBe(1);
    } finally {
      discovery.mockRestore();
    }
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
      coordination: { ...live.coordination, appendResumedReceipt, assertWorktreeBinding: () => {} },
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

  test('release clears a lease that still holds the temporary file of a terminated owner write', () => {
    // A writer terminated between its temporary file and the rename leaves that
    // file beside a valid owner record. Release must still make the task
    // available, and never leave an ownerless directory that no verb can clear.
    const repo = repoWithSprint();
    expect(claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo)).exitCode).toBe(0);
    const taskId = canonicalTask(repo, 'wire the claim verbs').task_id;
    writeFileSync(join(leaseDirectory(repo, taskId), `.${LEASE_OWNER_FILE_NAME}.tmp-99999-1`), '{"partial"');

    const released = releaseSprintCommand({ claimId: 'claim-1' }, deps(repo));
    expect(released.stderr).toBe('');
    expect(released.exitCode).toBe(0);
    expect(readLease(repo, taskId).classification).toBe('available');
    expect(readdirSync(join(coordinationRoot(repo), 'retired-leases'))).toEqual([]);
    expect(claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo, ['claim-2'])).exitCode).toBe(0);
  });

  test('a release killed after the owner record left the lease directory leaves the task claimable', () => {
    if (process.platform === 'win32') return;
    const repo = repoWithSprint();
    expect(claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo)).exitCode).toBe(0);
    const taskId = canonicalTask(repo, 'wire the claim verbs').task_id;

    // A real process, killed with SIGKILL at the first directory removal for
    // this task: the owner record is no longer in the lease directory, and the
    // directory is not removed yet. No catch or finally runs in that process.
    const childPath = join(repo, 'release-crash-child.ts');
    writeFileSync(childPath, [
      "import * as fs from 'fs';",
      "import { spyOn } from 'bun:test';",
      `const { processSprintDependencies, releaseSprintCommand } = await import(${JSON.stringify(join(REPO_ROOT, 'src/effects/state/coordination-sprint.ts'))});`,
      'const realRmdir = fs.rmdirSync;',
      "spyOn(fs, 'rmdirSync').mockImplementation(((path, ...rest) => {",
      `  if (String(path).includes(${JSON.stringify(taskId)})) process.kill(process.pid, 'SIGKILL');`,
      '  return realRmdir(path, ...rest);',
      '}) as typeof fs.rmdirSync);',
      `releaseSprintCommand({ claimId: 'claim-1' }, processSprintDependencies(${JSON.stringify(repo)}));`,
    ].join('\n'));
    const child = spawnSync(process.execPath, [childPath], { cwd: repo, encoding: 'utf-8' });
    expect(child.signal).toBe('SIGKILL');

    // The killed holder's task lock is reclaimed by PID; the lease itself must
    // need no operator: either a named record or no live lease at all.
    const reconciled = JSON.parse(
      reconcileSprintCommand({ taskId, targetRef: 'main' }, deps(repo)).stdout,
    ) as { classification: string; action: string };
    expect(reconciled.classification).toBe('available');
    expect(claimSprintCommand(claimOptions(repo, 'wire the claim verbs'), deps(repo, ['claim-2'])).exitCode).toBe(0);
  }, 60_000);

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

  /**
   * Run one completion while `directory` is readable but not writable, which
   * is a real permission fault past the gate, and return what it left behind.
   */
  function completeWithReadOnlyDirectory(repo: string, directory: string) {
    const tokenPath = join(repo, CLAIM_TOKEN_DIR, `${RACE_ID}.claim`);
    const before = {
      sprint: readFileSync(join(repo, RACE_SPRINT), 'utf-8'),
      owner: readFileSync(leaseOwnerPath(repo, RACE_ID), 'utf-8'),
      token: readFileSync(tokenPath, 'utf-8'),
    };
    chmodSync(directory, 0o555);
    let outcome;
    try {
      outcome = completeRowSprintCommand(
        { sprint: RACE_SPRINT, task: RACE_TASK, targetRef: 'main' },
        processSprintDependencies(repo),
      );
    } finally {
      chmodSync(directory, 0o755);
    }
    return { before, outcome, tokenPath };
  }

  test('a token that cannot be removed after the lease is gone restores the lease and the token', () => {
    if (process.platform === 'win32') return;
    const repo = raceRepo();
    claimRow(repo, 'claim-original');
    const { before, outcome, tokenPath } = completeWithReadOnlyDirectory(repo, join(repo, CLAIM_TOKEN_DIR));

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('EACCES');
    // The row is pending again, so the claim that protects it must be back too:
    // otherwise any agent can claim the row while this tree still holds a token.
    expect(readFileSync(join(repo, RACE_SPRINT), 'utf-8')).toBe(before.sprint);
    expect(readLease(repo, RACE_ID).raw).toBe(before.owner);
    expect(readFileSync(tokenPath, 'utf-8')).toBe(before.token);
  }, 60_000);

  test('a lease that cannot leave the lease plane after the released write restores the bound record', () => {
    if (process.platform === 'win32') return;
    const repo = raceRepo();
    claimRow(repo, 'claim-original');
    const { before, outcome, tokenPath } = completeWithReadOnlyDirectory(repo, join(coordinationRoot(repo), 'leases'));

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('EACCES');
    expect(readFileSync(join(repo, RACE_SPRINT), 'utf-8')).toBe(before.sprint);
    expect(readLease(repo, RACE_ID).raw).toBe(before.owner);
    expect(readFileSync(tokenPath, 'utf-8')).toBe(before.token);
  }, 60_000);

  test('complete-row refuses a target ref the lease was not claimed against', () => {
    // The lease protects `main`. An older ref that still carries the claimed
    // revision must not stand in for `main` after `main` moved the definition.
    const repo = raceRepo();
    claimRow(repo, 'claim-original');
    run(repo, ['branch', 'before-drift']);
    writeFileSync(
      join(repo, RACE_SPRINT),
      raceSprintText('[ ]').replace('races converge', 'races converge under review'),
    );
    run(repo, ['commit', '--quiet', '-am', 'drift the acceptance cell']);
    const tokenPath = join(repo, CLAIM_TOKEN_DIR, `${RACE_ID}.claim`);
    const sprintBefore = readFileSync(join(repo, RACE_SPRINT), 'utf-8');
    const ownerBefore = readFileSync(leaseOwnerPath(repo, RACE_ID), 'utf-8');
    const tokenBefore = readFileSync(tokenPath, 'utf-8');

    const outcome = completeRowSprintCommand(
      { sprint: RACE_SPRINT, task: RACE_TASK, targetRef: 'before-drift' },
      processSprintDependencies(repo),
    );

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('was claimed against main, not before-drift');
    expect(readFileSync(join(repo, RACE_SPRINT), 'utf-8')).toBe(sprintBefore);
    expect(readLease(repo, RACE_ID).raw).toBe(ownerBefore);
    expect(readFileSync(tokenPath, 'utf-8')).toBe(tokenBefore);
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

import { dirname } from 'path';
import { assertOwnedTrashDirectory, worktreeTrashNames } from '../src/effects/state/worktree-trash';
import { cleanupExactWorktree, removeExactWorktree, recordCreatedWorktree, withWorktreeTopologyLock, sweepManagedWorktrees as productionSweep } from '../src/effects/state/coordination-worktree-topology';

const sweepManagedWorktrees: typeof productionSweep = (root, cwd, env, options) => productionSweep(root, cwd, env, { deadlineMs: 60_000, ...options });

describe('exact cleanup and SessionStart worktree sweep', () => {
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
    writeFileSync(join(root, '.gitignore'), '.ai/\n'); writeFileSync(join(root, 'source'), 'base\n');
    git('add', '.'); git('commit', '-qm', 'base');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    const path = join(managed, 'repo-wt-demo'); git('worktree', 'add', '-q', '-b', 'codex/demo', path);
    writeFileSync(join(path, '.gitignore'), '.ai/\n# merged task change\n');
    git('-C', path, 'add', '.gitignore'); git('-C', path, 'commit', '-qm', 'task change');
    git('merge', '--ff-only', 'codex/demo'); git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    const head = git('rev-parse', 'HEAD');
    const expected = { worktree: path, branch: 'codex/demo', head_sha: head, target_ref: 'refs/remotes/origin/main', target_oid: head, merge_commit_sha: head };
    const env = { ...process.env, REPO_HARNESS_WORKTREE_ROOT: managed, REPO_HARNESS_TOOLING_ADVISORY: '0', HOME: join(parent, 'home') };
    return { parent, root, managed, path, git, expected, env, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
  }

  test('sweep removes a merged clean checkout and branch', () => {
    const f = fixture(); try {
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('removed=1');
      expect(existsSync(f.path)).toBe(false); expect(f.git('branch', '--list', 'codex/demo')).toBe('');
    } finally { f.cleanup(); }
  });

  test('W6 sweep retires the start identity only after exact removal succeeds', () => {
    const f = fixture(); try {
      withWorktreeTopologyLock(f.root, () => recordCreatedWorktree(f.root, f.path));
      const store = join(f.root, '.git/repo-harness/coordination/worktree-identities');
      expect(readdirSync(store).filter(name => name.endsWith('.json'))).toHaveLength(1);
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('removed=1');
      expect(readdirSync(store).filter(name => name.endsWith('.json'))).toEqual([]);
    } finally { f.cleanup(); }
  });

  test('W6 removal keeps unknown identity content without blocking its own record retirement', () => {
    const f = fixture(); try {
      withWorktreeTopologyLock(f.root, () => recordCreatedWorktree(f.root, f.path));
      const store = join(f.root, '.git/repo-harness/coordination/worktree-identities');
      const unknown = 'f'.repeat(64) + '.json'; writeFileSync(join(store, unknown), 'null');
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('removed=1');
      expect(readdirSync(store).filter(name => name.endsWith('.json'))).toEqual([unknown]);
    } finally { f.cleanup(); }
  });

  test('W6 resume retires an identity left by SIGKILL after branch deletion', async () => {
    const f = fixture(); try {
      withWorktreeTopologyLock(f.root, () => recordCreatedWorktree(f.root, f.path));
      const store = join(f.root, '.git/repo-harness/coordination/worktree-identities');
      await interruptSweep(f, 'branch-deleted');
      expect(readdirSync(store).filter(name => name.endsWith('.json'))).toHaveLength(1);
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('resumed=1');
      expect(readdirSync(store).filter(name => name.endsWith('.json'))).toEqual([]);
    } finally { f.cleanup(); }
  }, 20000);

  test('W6 a fresh lane that only makes a no-ff target merge stays protected', () => {
    const f = fixture(); try {
      f.git('worktree', 'remove', f.path); f.git('branch', '-D', 'codex/demo');
      f.git('worktree', 'add', '-q', '-b', 'codex/demo', f.path, 'origin/main');
      f.git('commit', '--allow-empty', '-qm', 'target change'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      f.git('-C', f.path, 'merge', '--no-ff', 'origin/main', '-m', 'target refresh');
      f.git('merge', '--ff-only', 'codex/demo'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('no commits of its own');
      expect(existsSync(f.path)).toBe(true);
    } finally { f.cleanup(); }
  });

  test('W6 shipped bundle CLI SessionStart works with its production deadline', () => {
    const f = fixture(); try {
      mkdirSync(join(f.root, '.ai/harness'), { recursive: true });
      writeFileSync(join(f.root, '.ai/harness/workflow-contract.json'), '{}');
      const bundle = join(f.parent, 'hook-entry.js');
      const built = spawnSync(process.execPath, ['build', join(import.meta.dir, '../src/cli/hook-entry.ts'), '--target=bun', '--outfile', bundle, '--define', 'REPO_HARNESS_BUNDLED_CLI_VERSION="0.21.1"'], { encoding: 'utf8', env: f.env });
      expect(built.status, built.stderr).toBe(0);
      const result = spawnSync(process.execPath, [bundle, 'SessionStart', '--route', 'default'], { cwd: f.root, encoding: 'utf8', input: '{}', env: { ...f.env, HOOK_REPO_ROOT: f.root, HOOK_HOST: 'codex' } });
      expect(result.status).toBe(0); expect(result.stdout + result.stderr).toContain('worktree');
    } finally { f.cleanup(); }
  }, 15000);

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
      const first = sweepManagedWorktrees(f.root, f.root, f.env);
      expect(first).toContain('ignored;'); expect(first).toContain('removed=1');
      expect(existsSync(f.path)).toBe(false);
      expect(f.git('branch', '--list', 'codex/missing')).toContain('codex/missing');
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('missing entry retained while trash ownership is unknown');
      expect(f.git('branch', '--list', 'codex/missing')).toContain('codex/missing');
      expect(readFileSync(invalid, 'utf8')).toBe('not trash');
    } finally { f.cleanup(); }
  });

  test('W7 missing merged registrations survive the eight-entry batch boundary', () => {
    const f = missingBatch(); try {
      const first = sweepManagedWorktrees(f.root, f.root, f.env);
      expect(first).toContain('removed=8'); expect(first).toContain('deferred=3');
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('removed=2');
      for (const branch of f.merged) expect(f.git('branch', '--list', branch)).toBe('');
      expect(f.git('branch', '--list', 'codex/unmerged')).toContain('codex/unmerged');
    } finally { f.cleanup(); }
  });

  test('W7 a kill after global prune leaves branch cleanup identities for later sweeps', async () => {
    const f = missingBatch(); try {
      await interruptSweep(f, 'pruned-registrations');
      expect(f.git('worktree', 'list', '--porcelain')).not.toContain('codex/missing-');
      sweepManagedWorktrees(f.root, f.root, f.env); sweepManagedWorktrees(f.root, f.root, f.env);
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
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('removed=1');
      expect(f.git('branch', '--list', 'codex/demo')).toBe('');
      expect(existsSync(stale)).toBe(false); expect(existsSync(join(directory, 'pruned-worktrees.json'))).toBe(false);
    } finally { f.cleanup(); }
  }, 20000);

  test('W7 a reappeared path keeps its pending branch and all new data', async () => {
    const f = fixture(); try {
      rmSync(f.path, { recursive: true }); await interruptSweep(f, 'pruned-registrations');
      mkdirSync(f.path); writeFileSync(join(f.path, 'new-data'), 'keep');
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('reappeared');
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
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('changed Git registration metadata');
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
      expect(sweepManagedWorktrees(f.root, f.root, { ...f.env, REPO_HARNESS_WORKTREE_ROOT: other })).toContain('protected path');
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
      expect(sweepManagedWorktrees(f.root, f.root, { ...f.env, REPO_HARNESS_GIT_BIN: binary })).toContain('reappeared');
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
      const result = sweepManagedWorktrees(f.root, f.root, f.env);
      expect(result).toContain('removed=1'); expect(result).toContain('kept=7'); expect(result).toContain('deferred=2'); expect(existsSync(f.path)).toBe(false);
      expect(f.git('branch', '--list', 'codex/demo')).toBe('');
      for (let index = 0; index < 9; index++) expect(f.git('branch', '--list', `codex/pending-${index}`)).toContain(`codex/pending-${index}`);
    } finally { f.cleanup(); }
  });

  test('sweep compares the managed root through its realpath', () => {
    const f = fixture(); try {
      const alias = join(f.parent, 'tmp-alias'); symlinkSync(f.managed, alias);
      expect(sweepManagedWorktrees(f.root, f.root, { ...f.env, REPO_HARNESS_WORKTREE_ROOT: alias })).toContain('removed=1');
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

  test('sweep accepts a squash absorbed branch through the shared merge authority', () => {
    const f = fixture(); try {
      writeFileSync(join(f.path, 'change'), 'absorbed\n');
      execFileSync('git', ['add', '.'], { cwd: f.path }); execFileSync('git', ['commit', '-qm', 'feature'], { cwd: f.path });
      f.git('merge', '--squash', 'codex/demo'); f.git('commit', '-qm', 'squash'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('removed=1');
      expect(existsSync(f.path)).toBe(false); expect(f.git('branch', '--list', 'codex/demo')).toBe('');
    } finally { f.cleanup(); }
  });

  test.each(['dirty', 'unmerged', 'locked', 'leased', 'unknown-lease', 'marker', 'session-cwd', 'nested-cwd', 'evidence', 'runtime'])('sweep keeps %s checkout and reports the path', condition => {
    const f = fixture(); try {
      let cwd = f.root;
      if (condition === 'dirty') writeFileSync(join(f.path, 'untracked'), 'keep');
      if (condition === 'unmerged') { writeFileSync(join(f.path, 'new'), 'keep'); execFileSync('git', ['add', '.'], { cwd: f.path }); execFileSync('git', ['commit', '-qm', 'unmerged'], { cwd: f.path }); }
      if (condition === 'locked') f.git('worktree', 'lock', f.path);
      if (condition === 'leased' || condition === 'unknown-lease') {
        const record = recordFor('sweep', 'sweep-claim');
        createLeaseDirectory(f.root, record.task_id);
        if (condition === 'leased') {
          const transition = bindLeaseRecord(record, { claimId: record.claim_id, executionWorktree: f.path, branch: 'codex/demo', unitRef: 'fixture' });
          if (!transition.ok) throw new Error(transition.error);
          writeLeaseOwnerDurably(f.root, record.task_id, transition.record);
        }
      }
      if (condition === 'marker') { mkdirSync(join(f.root, '.ai/harness'), { recursive: true }); writeFileSync(join(f.root, '.ai/harness/active-worktree'), f.path); }
      if (condition === 'session-cwd') cwd = f.path;
      if (condition === 'nested-cwd') { cwd = join(f.path, 'nested'); mkdirSync(cwd); }
      if (condition === 'evidence') { mkdirSync(join(f.path, '.ai/harness/evidence/events'), { recursive: true }); writeFileSync(join(f.path, '.ai/harness/evidence/events/log.jsonl'), '{}\n'); }
      if (condition === 'runtime') {
        const key = require('crypto').createHash('sha256').update(JSON.stringify([join(f.root, '.git'), f.path])).digest('hex');
        mkdirSync(join(f.root, '.ai/harness/runs/task-workspaces', key), { recursive: true });
      }
      const result = sweepManagedWorktrees(f.root, cwd, f.env);
      const reasons: Record<string, string> = { dirty: 'dirty_worktree', unmerged: 'merge is unproven', locked: 'locked', leased: 'active Lease',
        'unknown-lease': 'unknown Lease', marker: 'marker reference', 'session-cwd': 'session cwd', 'nested-cwd': 'session cwd',
        evidence: 'evidence retention', runtime: 'runtime is open' };
      expect(result).toContain(f.path); expect(result).toContain('kept;'); expect(result).toContain(reasons[condition]!); expect(existsSync(f.path)).toBe(true);
      expect(f.git('branch', '--list', 'codex/demo')).toContain('codex/demo');
      if (condition === 'leased') expect(() => removeExactWorktree(f.root, f.expected)).toThrow('active Lease');
    } finally { f.cleanup(); }
  });

  test.each([false, true])('sweep prunes a missing checkout and keeps its branch only when unmerged=%s', unmerged => {
    const f = fixture(); try {
      if (unmerged) { writeFileSync(join(f.path, 'new'), 'keep'); execFileSync('git', ['add', '.'], { cwd: f.path }); execFileSync('git', ['commit', '-qm', 'unmerged'], { cwd: f.path }); }
      rmSync(f.path, { recursive: true });
      const result = sweepManagedWorktrees(f.root, f.root, f.env);
      expect(result).toContain('pruned=1'); expect(f.git('worktree', 'list', '--porcelain')).not.toContain(f.path);
      expect(f.git('branch', '--list', 'codex/demo').includes('codex/demo')).toBe(unmerged);
      if (unmerged) expect(result).toContain('unmerged branch kept');
    } finally { f.cleanup(); }
  });

  test.each(['missing-directory', 'missing-git-file'])('sweep leaves outside paths and protects outside prunable registrations: %s', condition => {
    const f = fixture(); try {
      const outside = join(f.parent, 'outside'); f.git('worktree', 'add', '-q', '-b', 'outside', outside);
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('removed=1'); expect(existsSync(outside)).toBe(true);
      f.git('worktree', 'add', '-q', '-b', 'codex/demo', f.path);
      f.git('-C', f.path, 'commit', '--allow-empty', '-qm', 'recreated task');
      f.git('merge', '--ff-only', 'codex/demo'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      if (condition === 'missing-directory') rmSync(outside, { recursive: true });
      else rmSync(join(outside, '.git'));
      rmSync(f.path, { recursive: true });
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('prune would affect a protected path');
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

  test('the shipped single-file SessionStart bundle uses its package merge library', () => {
    const f = fixture(); try {
      mkdirSync(join(f.root, '.ai/harness'), { recursive: true });
      writeFileSync(join(f.root, '.ai/harness/workflow-contract.json'), '{}');
      const packageRoot = join(f.parent, 'package'); mkdirSync(join(packageRoot, 'dist'), { recursive: true }); mkdirSync(join(packageRoot, 'scripts'));
      writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ name: 'repo-harness', version: '0.21.1' }));
      writeFileSync(join(packageRoot, 'scripts/worktree-merge-lib.sh'), readFileSync(join(import.meta.dir, '../scripts/worktree-merge-lib.sh')));
      const bundle = join(packageRoot, 'dist/hook-entry.js');
      const built = spawnSync(process.execPath, ['build', join(import.meta.dir, '../src/cli/hook-entry.ts'), '--target=bun', '--outfile', bundle, '--define', 'REPO_HARNESS_BUNDLED_CLI_VERSION="0.21.1"'], { encoding: 'utf8', env: f.env });
      expect(built.status, built.stderr).toBe(0);
      const result = spawnSync(process.execPath, ['-e', `const {runHookEntry}=await import(${JSON.stringify(bundle)});process.exitCode=runHookEntry({event:'SessionStart',routeId:'default',input:'{}',worktreeSweepDeadlineMs:60000}).exitCode;`], {
        cwd: f.root, encoding: 'utf8', input: '{}', env: { ...f.env, HOOK_REPO_ROOT: f.root, HOOK_HOST: 'codex' },
      });
      expect(result.status).toBe(0); expect(result.stdout + result.stderr).toContain('removed=1');
      expect(existsSync(f.path)).toBe(false); expect(f.git('branch', '--list', 'codex/demo')).toBe('');
      f.git('worktree', 'add', '-q', '-b', 'codex/demo', f.path);
      f.git('-C', f.path, 'commit', '--allow-empty', '-qm', 'recreated task');
      f.git('merge', '--ff-only', 'codex/demo'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      rmSync(join(packageRoot, 'scripts/worktree-merge-lib.sh'));
      const missing = spawnSync(process.execPath, ['-e', `const {runHookEntry}=await import(${JSON.stringify(bundle)});process.exitCode=runHookEntry({event:'SessionStart',routeId:'default',input:'{}',worktreeSweepDeadlineMs:60000}).exitCode;`], {
        cwd: f.root, encoding: 'utf8', input: '{}', env: { ...f.env, HOOK_REPO_ROOT: f.root, HOOK_HOST: 'codex' },
      });
      expect(missing.status).toBe(0); expect(missing.stdout + missing.stderr).toContain('worktree merge library is unavailable');
      expect(existsSync(f.path)).toBe(true); expect(f.git('branch', '--list', 'codex/demo')).toContain('codex/demo');
    } finally { f.cleanup(); }
  }, 15000);

  async function interruptSweep(f: ReturnType<typeof fixture>, step: string): Promise<string> {
    const worker = join(f.parent, 'w1-worker.ts'); const signal = join(f.parent, 'w1-signal.json');
    const module = join(import.meta.dir, '../src/effects/state/coordination-worktree-topology.ts');
    writeFileSync(worker, [
      `import { sweepManagedWorktrees } from ${JSON.stringify(module)};`,
      `import { writeFileSync } from 'fs';`,
      `let stopped = false;`,
      `const result = sweepManagedWorktrees(${JSON.stringify(f.root)}, ${JSON.stringify(f.root)}, process.env, { deadlineMs: 60_000, afterRemovalStep(step, path) {`,
      `if (!stopped && step === ${JSON.stringify(step)}) { stopped = true; writeFileSync(${JSON.stringify(signal)}, JSON.stringify({ step, path })); process.kill(process.pid, 'SIGSTOP'); }`,
      `} }); console.log(result);`,
    ].join('\n'));
    const child = spawn(process.execPath, [worker], { cwd: f.root, env: f.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    const ended = new Promise<void>(resolve => { child.once('exit', () => resolve()); });
    try {
      const deadline = Date.now() + 15_000;
      while (!existsSync(signal) && child.exitCode === null && child.signalCode === null && Date.now() < deadline) await Bun.sleep(10);
      expect(existsSync(signal), output).toBe(true);
      const path = JSON.parse(readFileSync(signal, 'utf8')).path as string;
      child.kill('SIGKILL'); await ended;
      expect(child.signalCode).toBe('SIGKILL');
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
      const next = sweepManagedWorktrees(f.root, f.root, f.env);
      expect(next).toContain('resumed=1'); expect(existsSync(directory)).toBe(false);
      expect(existsSync(f.path)).toBe(false); expect(f.git('branch', '--list', 'codex/demo')).toBe('');
      expect(f.git('worktree', 'list', '--porcelain')).not.toContain(f.path);
      expect(existsSync(outside)).toBe(true); expect(f.git('branch', '--list', 'outside')).toContain('outside');
    } finally { f.cleanup(); }
  }, 20000);

  test('W1 deadline expiry during trash deletion leaves data that the next sweep finishes', () => {
    const f = fixture(); try {
      let delayed = false;
      const realNow = Date.now;
      let timed: string | null;
      try {
        timed = sweepManagedWorktrees(f.root, f.root, f.env, { afterRemovalStep(step) {
          if (step === 'trash-entry-deleted' && !delayed) { delayed = true; const expired = realNow() + 60_001; Date.now = () => expired; }
        } });
      } finally { Date.now = realNow; }
      expect(delayed).toBe(true); expect(timed).toContain('trash deletion will resume');
      expect(existsSync(f.path)).toBe(false); expect(f.git('branch', '--list', 'codex/demo')).toBe('');
      const directory = worktreeTrashNames(join(f.root, '.git'), f.managed)[0]!;
      expect(existsSync(directory)).toBe(true);
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('resumed=1');
      expect(existsSync(directory)).toBe(false);
    } finally { f.cleanup(); }
  }, 15000);

  test('W1 recovery accepts a local integration ref advance after the rename', async () => {
    const f = fixture(); try {
      const directory = await interruptSweep(f, 'renamed');
      f.git('commit', '--allow-empty', '-qm', 'advance target'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('resumed=1');
      expect(existsSync(directory)).toBe(false); expect(f.git('branch', '--list', 'codex/demo')).toBe('');
    } finally { f.cleanup(); }
  }, 20000);

  test('W1 recovery never removes a replacement directory at the old worktree name', async () => {
    const f = fixture(); try {
      const directory = await interruptSweep(f, 'renamed');
      mkdirSync(f.path); writeFileSync(join(f.path, 'replacement'), 'new owner data');
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('resumed=1');
      expect(existsSync(directory)).toBe(false); expect(readFileSync(join(f.path, 'replacement'), 'utf8')).toBe('new owner data');
      expect(f.git('worktree', 'list', '--porcelain')).not.toContain(f.path); expect(f.git('branch', '--list', 'codex/demo')).toBe('');
    } finally { f.cleanup(); }
  }, 20000);

  test('W1 trash resume does not touch a non-matching directory', () => {
    const f = fixture(); try {
      const unowned = join(f.managed, '.repo-harness-wt-trash-unowned'); mkdirSync(unowned); writeFileSync(join(unowned, 'keep'), 'keep');
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('removed=1');
      expect(readFileSync(join(unowned, 'keep'), 'utf8')).toBe('keep');
    } finally { f.cleanup(); }
  });

  test('W1 trash resume refuses a matching symlink without following it', async () => {
    const f = fixture(); try {
      const directory = await interruptSweep(f, 'renamed');
      const saved = join(f.parent, 'saved'); fs.renameSync(directory, saved); symlinkSync(saved, directory);
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('trash is not a real directory');
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
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('trash is still registered');
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
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('unknown Git registration metadata');
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
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('resumed=1');
      expect(existsSync(receipt.git_directory)).toBe(false); expect(existsSync(directory)).toBe(false);
      expect(f.git('branch', '--list', 'codex/demo')).toBe('');
    } finally { f.cleanup(); }
  }, 20000);

  test('W1 cleanup does not rename a worktree when whole-prune scope is unsafe', () => {
    const f = fixture(); try {
      const outside = join(f.parent, 'outside'); f.git('worktree', 'add', '-q', '-b', 'outside', outside); rmSync(outside, { recursive: true });
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('prune would affect a protected path');
      expect(existsSync(f.path)).toBe(true); expect(worktreeTrashNames(join(f.root, '.git'), f.managed)).toEqual([]);
      expect(f.git('worktree', 'list', '--porcelain')).toContain(outside);
    } finally { f.cleanup(); }
  });

  test('W3 a creation-only branch and a missing reflog are kept, while a merged task commit qualifies', () => {
    const f = fixture(); try {
      f.git('worktree', 'remove', f.path); f.git('branch', '-D', 'codex/demo');
      f.git('worktree', 'add', '-q', '-b', 'codex/demo', f.path);
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('no commits of its own'); expect(existsSync(f.path)).toBe(true);
      f.git('-C', f.path, 'commit', '--allow-empty', '-qm', 'task commit'); f.git('merge', '--ff-only', 'codex/demo'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('removed=1'); expect(existsSync(f.path)).toBe(false);
      f.git('worktree', 'add', '-q', '-b', 'codex/demo', f.path);
      const log = f.git('rev-parse', '--git-path', 'logs/refs/heads/codex/demo'); rmSync(join(f.root, log));
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('reflog is unavailable'); expect(existsSync(f.path)).toBe(true);
    } finally { f.cleanup(); }
  });

  test.each(['head', 'dirty'])('W3 an unused approval is discarded after %s preflight fails, and another live task is swept', async change => {
    const f = fixture(); try {
      const directory = await interruptSweep(f, 'intent');
      writeFileSync(join(f.path, 'new'), 'new work');
      if (change === 'head') { f.git('-C', f.path, 'add', '.'); f.git('-C', f.path, 'commit', '-qm', 'new work'); }
      const other = join(f.managed, 'repo-wt-other'); f.git('worktree', 'add', '-q', '-b', 'other', other);
      f.git('-C', other, 'commit', '--allow-empty', '-qm', 'other task'); f.git('merge', '--ff-only', 'other'); f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      const result = sweepManagedWorktrees(f.root, f.root, f.env);
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
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('submodules present'); expect(existsSync(f.path)).toBe(true);
    } finally { f.cleanup(); }
  });

  test.each(['file', 'symlink'])('W3 a matching non-owned trash %s is ignored while a live task is swept', kind => {
    const f = fixture(); try {
      const name = '.repo-harness-wt-trash-' + require('crypto').createHash('sha256').update(join(f.root, '.git')).digest('hex').slice(0, 32) + '-00000000-0000-0000-0000-000000000000';
      const path = join(f.managed, name); if (kind === 'file') writeFileSync(path, 'not trash'); else symlinkSync(f.parent, path);
      const result = sweepManagedWorktrees(f.root, f.root, f.env);
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
      const result = sweepManagedWorktrees(f.root, f.root, f.env);
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
      expect(sweepManagedWorktrees(f.root, f.root, { ...f.env, REPO_HARNESS_GIT_BIN: binary })).toContain('removed=1');
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
      expect(sweepManagedWorktrees(f.root, f.root, f.env)).toContain('no commits of its own');
      expect(existsSync(f.path)).toBe(true);
    } finally { f.cleanup(); }
  });

  test('W5 production deadline expiry does not fail SessionStart', () => {
    const f = fixture(); try {
      mkdirSync(join(f.root, '.ai/harness'), { recursive: true });
      writeFileSync(join(f.root, '.ai/harness/workflow-contract.json'), '{}');
      const binary = join(f.parent, 'slow-git');
      // Delay only the first sweep query. Hook repository discovery still uses normal Git.
      writeFileSync(binary, '#!/bin/sh\nsleep 3\nexec /usr/bin/git "$@"\n', { mode: 0o755 });
      const result = spawnSync(process.execPath, [join(import.meta.dir, '../src/cli/hook-entry.ts'), 'SessionStart', '--route', 'default'], {
        cwd: f.root, encoding: 'utf8', input: '{}', env: { ...f.env, REPO_HARNESS_GIT_BIN: binary, HOOK_REPO_ROOT: f.root, HOOK_HOST: 'codex' },
      });
      expect(result.status).toBe(0); expect(result.stdout + result.stderr).toContain('worktree sweep skipped:');
      expect(result.stdout + result.stderr).toContain('ETIMEDOUT'); expect(existsSync(f.path)).toBe(true);
    } finally { f.cleanup(); }
  }, 15000);

  test('real SessionStart reports sweep failure and still returns zero', () => {
    const f = fixture(); try {
      mkdirSync(join(f.root, '.ai/harness'), { recursive: true });
      writeFileSync(join(f.root, '.ai/harness/workflow-contract.json'), '{}');
      f.git('update-ref', '-d', 'refs/remotes/origin/main');
      const result = spawnSync(process.execPath, ['-e', `const {runHookEntry}=await import(${JSON.stringify(join(import.meta.dir, '../src/cli/hook-entry.ts'))});process.exitCode=runHookEntry({event:'SessionStart',routeId:'default',input:'{}',worktreeSweepDeadlineMs:60000}).exitCode;`], {
        cwd: f.root, encoding: 'utf8', input: JSON.stringify({ cwd: f.root }), env: { ...f.env, HOOK_REPO_ROOT: f.root, HOOK_HOST: 'codex' },
      });
      expect(result.status).toBe(0); expect(result.stdout + result.stderr).toContain('worktree sweep skipped: local integration target is unavailable');
      expect(existsSync(f.path)).toBe(true);
    } finally { f.cleanup(); }
  }, 15000);
});
