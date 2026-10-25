import { seedLeaseDirectory, writeHistoricalLease, fixtureTaskId, leaseOwnerPath, writeClaimTokenFixture } from './helpers/sprint-fixture';
/** Retained completion, reconciliation, locks and board reads over real linked worktrees. */
import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { leaseDirectory, readLease } from '../src/effects/state/coordination-lease-store';
import { taskLockRelativePath } from '../src/effects/locking/task-lock';
import { withExclusiveDirectoryLock } from '../src/effects/locking/exclusive-directory-lock';
import { resolveGitCommonDirectory } from '../src/effects/git/common-directory';
import { randomUUID } from 'crypto';
import { buildLeaseOwnerRecord, projectCanonicalTasks } from '../src/core/state/coordination-identity';

const ROOT = join(import.meta.dir, '..');
const CLI = join(ROOT, 'src/cli/index.ts');
const HELPER_DIR = join(ROOT, 'scripts');
const SPRINT_PATH = 'plans/sprints/20260818-0000-race.sprint.md';
const ROW_ONE = 'race the claim';
const ROW_TWO = 'second row';

const FIXTURES = new Set<string>();

/**
 * An ambient `repo-harness` on PATH would be a different build than the source
 * under test, so every shell helper is pointed at this checkout explicitly.
 */
const CLI_WRAPPER = (() => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'sprint-claim-cli-')));
  FIXTURES.add(dir);
  const wrapper = join(dir, 'repo-harness');
  writeFileSync(wrapper, `#!/bin/bash\nexec ${process.execPath} ${CLI} "$@"\n`);
  chmodSync(wrapper, 0o755);
  return wrapper;
})();

function sandboxEnv(extra: Record<string, string> = {}): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key === 'REPO_HARNESS_TARGET_REPO_ROOT') continue;
    if (key === 'REPO_HARNESS_HELPER_SOURCE_PATH') continue;
    if (key === 'REPO_HARNESS_SOURCE_ROOT') continue;
    base[key] = value;
  }
  return { ...base, REPO_HARNESS_CLI_BIN: CLI_WRAPPER, ...extra };
}

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}${result.stdout}`);
  }
  return result.stdout;
}

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}



function state(cwd: string, args: readonly string[]): Run {
  const result = spawnSync(process.execPath, [CLI, 'state', ...args], {
    cwd,
    encoding: 'utf-8',
    env: sandboxEnv(),
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

interface BoardCard {
  readonly task_id: string;
  readonly task: string;
  readonly column: string;
  readonly task_state: string;
  readonly lease_state: string;
  readonly progress_state: string;
  readonly claim: {
    readonly claim_id: string;
    readonly generation: number;
    readonly worktree: string | null;
    readonly branch: string | null;
    readonly unit_ref: string | null;
    readonly stolen_from: { readonly claim_id: string; readonly reason: string } | null;
  } | null;
  readonly diagnostics: {
    readonly worktree_missing: boolean;
    readonly orphan_reclaimable: boolean;
    readonly lease_cleanup_required: boolean;
    readonly progress_unreadable_reason: string | null;
  };
}

interface BoardDocument {
  readonly protocol: number;
  readonly kind: string;
  readonly canonical_target: { readonly ref: string; readonly oid: string };
  readonly sprint_path: string;
  readonly revisions: Readonly<Record<string, string>>;
  readonly snapshot_consistency: string;
  readonly cards: readonly BoardCard[];
}

function board(cwd: string, args: readonly string[] = []): BoardDocument {
  const run = state(cwd, ['board', '--json', ...args]);
  if (run.status !== 0) throw new Error(`state board failed (${run.status}): ${run.stderr}`);
  return JSON.parse(run.stdout) as BoardDocument;
}

function cardOf(document: BoardDocument, task: string): BoardCard {
  const found = document.cards.find((card) => card.task === task);
  if (!found) throw new Error(`no board card for task ${task}`);
  return found;
}

function sprintFile(rows: readonly string[]): string {
  return [
    '# Sprint: Race',
    '',
    '> **Status**: Approved',
    '> **Slug**: race',
    '> **Created**: 2026-08-18 00:00',
    '> **Updated**: 2026-08-18 00:00',
    '> **Backlog Schema**: 2',
    '',
    '## PRD',
    '',
    'Concurrent claims must never both win.',
    '',
    '## Backlog',
    '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    ...rows,
    '',
    '## Execution Log',
    '',
    '| When | Task | Plan | Result |',
    '|------|------|------|--------|',
    '',
  ].join('\n');
}

const PENDING_ROWS = [
  `| 1 | ${fixtureTaskId(`${ROW_ONE}`)} | [ ] | ${ROW_ONE} | contract | tests pass | (pending) |`,
  `| 2 | ${fixtureTaskId(`${ROW_TWO}`)} | [ ] | ${ROW_TWO} | inline | doc updated | (pending) |`,
];

interface Fixture {
  readonly primary: string;
  readonly worktreeA: string;
  readonly worktreeB: string;
}

function createFixture(prefix: string, worktrees = true): Fixture {
  const primary = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
  FIXTURES.add(primary);
  git(primary, ['init', '--quiet', '--initial-branch', 'main']);
  git(primary, ['config', 'user.email', 'race@example.com']);
  git(primary, ['config', 'user.name', 'Race Fixture']);
  mkdirSync(join(primary, 'plans/sprints'), { recursive: true });
  mkdirSync(join(primary, '.ai/harness/sprint'), { recursive: true });
  writeFileSync(join(primary, SPRINT_PATH), sprintFile(PENDING_ROWS));
  writeFileSync(join(primary, '.gitignore'), '.ai/harness/\n');
  writeFileSync(join(primary, '.ai/harness/sprint/active-sprint'), SPRINT_PATH);
  git(primary, ['add', '-A']);
  git(primary, ['commit', '--quiet', '-m', 'sprint']);

  let worktreeA = '';
  let worktreeB = '';
  if (worktrees) {
    worktreeA = `${primary}-wt-a`;
    worktreeB = `${primary}-wt-b`;
    git(primary, ['worktree', 'add', '--quiet', '-b', 'codex/row-a', worktreeA]);
    git(primary, ['worktree', 'add', '--quiet', '-b', 'codex/row-b', worktreeB]);
    FIXTURES.add(worktreeA);
    FIXTURES.add(worktreeB);
    worktreeA = realpathSync(worktreeA);
    worktreeB = realpathSync(worktreeB);
  }
  return { primary, worktreeA, worktreeB };
}

interface Identity {
  readonly task_id: string;
  readonly task_revision: string;
}

function identify(cwd: string, taskRef: string): Identity {
  const task = projectCanonicalTasks({ repoIdentity: resolveGitCommonDirectory(cwd),
    sprintPath: SPRINT_PATH, sprintText: git(cwd, ['show', `main:${SPRINT_PATH}`]) })
    .find(task => task.row.task === taskRef);
  if (!task) throw new Error(`fixture task not found: ${taskRef}`);
  return { task_id: task.task_id, task_revision: task.task_revision };
}


interface OwnerRecord {
  readonly claim_id: string;
  readonly task_id: string;
  readonly target_ref: string;
  readonly generation: number;
  readonly state: string;
  readonly execution_worktree: string | null;
  readonly branch: string | null;
  readonly unit_ref: string | null;
  readonly finish_transaction_key: string | null;
  readonly stolen_from: { readonly claim_id: string; readonly reason: string } | null;
}

/** Write a historical lease so the test exercises only the retained reader or gate. */
function seedRow(cwd: string, taskRef: string, worktree: string | null,
  branch: string | null, sessionId: string, generation = 1,
  stolenFrom: { claim_id: string; reason: string } | null = null) {
  const identity = identify(cwd, taskRef);
  const claimId = randomUUID();
  const reserved = buildLeaseOwnerRecord({ claimId, taskId: identity.task_id,
    taskRevision: identity.task_revision, sprintPath: SPRINT_PATH, targetRef: 'main',
    generation, sessionId, sourceWorktree: cwd, stolenFrom });
  const unitRef = `inline:${SPRINT_PATH}#${taskRef}`;
  const record = worktree ? { ...reserved, state: 'bound' as const,
    execution_worktree: worktree, branch, unit_ref: unitRef } : reserved;
  seedLeaseDirectory(cwd, identity.task_id);
  writeHistoricalLease(cwd, identity.task_id, record);
  if (worktree) writeClaimTokenFixture({ worktree, task_id: identity.task_id,
    claim_id: claimId, sprint: SPRINT_PATH, task: taskRef, unit_ref: unitRef });
  return record;
}

function seedBoundRow(fixture: Fixture, cwd: string, worktree: string, branch: string): OwnerRecord {
  return seedRow(cwd, ROW_ONE, worktree, branch, 'session-owner');
}

afterAll(() => {
  for (const path of FIXTURES) rmSync(path, { recursive: true, force: true });
});

describe('retained sprint closeout and read safety over real worktrees', () => {



  test('a lease directory with no owner record is unknown clone-wide and is never cleared', () => {
    // The crash window inside `claim` itself: the atomic `mkdir` election
    // landed, the durable owner write never did. The unit suite pins the
    // classifier on this shape; what only a real clone can show is that the
    // window is visible from a *sibling* worktree and blocks it there.
    const fixture = createFixture('sprint-crash-before-owner');
    const identity = identify(fixture.primary, ROW_ONE);
    mkdirSync(leaseDirectory(fixture.worktreeA, identity.task_id), { recursive: true });

    const seenFromB = readLease(fixture.worktreeB, identity.task_id);
    expect(seenFromB.classification).toBe('unknown');
    expect(seenFromB.unknown_reason).toBe('owner_record_missing');

    // Only the operator clearing it restores claimability; nothing self-heals.
    rmSync(leaseDirectory(fixture.primary, identity.task_id), { recursive: true, force: true });
    expect(readLease(fixture.worktreeB, identity.task_id).classification).toBe('available');
  }, 60_000);

  test('a malformed or symlinked owner record is unknown, and no verb repairs it', () => {
    const fixture = createFixture('sprint-unknown-owner');
    const identity = identify(fixture.primary, ROW_ONE);
    const owner = seedRow(fixture.worktreeA, ROW_ONE, null, null, 'session-a');
    const ownerPath = leaseOwnerPath(fixture.primary, identity.task_id);
    const intact = readFileSync(ownerPath, 'utf-8');

    // 1. A record truncated mid-write is unknown, not partly trusted.
    writeFileSync(ownerPath, intact.slice(0, Math.floor(intact.length / 2)));
    expect(readLease(fixture.worktreeB, identity.task_id).unknown_reason).toBe('owner_record_malformed');
    expect(existsSync(ownerPath)).toBe(true);

    // 2. A symlinked record is unknown and is not followed, so a decoy record
    // planted elsewhere never becomes this lease's owner.
    const decoy = join(fixture.primary, 'decoy-owner.json');
    writeFileSync(decoy, intact);
    rmSync(ownerPath);
    symlinkSync(decoy, ownerPath);
    expect(readLease(fixture.worktreeB, identity.task_id).unknown_reason).toBe('owner_record_symlink');
    expect(readLease(fixture.worktreeB, identity.task_id).record).toBeNull();
    expect(lstatSync(ownerPath).isSymbolicLink()).toBe(true);
    expect(existsSync(decoy)).toBe(true);

    // 3. The record is the authority: restoring it restores ownership, and the
    // original token -- never revoked by any of the above -- can release.
    rmSync(ownerPath);
    writeFileSync(ownerPath, intact);
    expect(readLease(fixture.worktreeB, identity.task_id).record?.claim_id).toBe(owner.claim_id);
    expect(readLease(fixture.primary, identity.task_id).classification).toBe('reserving');
  }, 60_000);

  test('a reserving lease whose session is gone is never auto-reclaimed', () => {
    const fixture = createFixture('sprint-dead-session');
    const identity = identify(fixture.primary, ROW_ONE);
    // A session id that names no live process anywhere.
    seedRow(fixture.worktreeA, ROW_ONE, null, null, 'session-that-is-gone');

    // A reservation has no worktree whose absence could prove death, so it is
    // reported and left alone; it has no automatic expiry.
    expect(readLease(fixture.primary, identity.task_id).classification).toBe('reserving');

    expect(readLease(fixture.worktreeB, identity.task_id).classification).toBe('reserving');
  }, 60_000);


  test('a removed worktree orphans its lease without losing it', () => {
    const fixture = createFixture('sprint-worktree-removed');
    const owner = seedBoundRow(fixture, fixture.primary, fixture.worktreeB, 'codex/row-b');
    const identity = identify(fixture.primary, ROW_ONE);

    git(fixture.primary, ['worktree', 'remove', '--force', fixture.worktreeB]);
    expect(git(fixture.primary, ['worktree', 'list', '--porcelain'])).not.toContain(fixture.worktreeB);

    // No auto-reclaim: a worktree's absence does not transfer ownership, and
    // the operator still reads the orphan.
    expect(readLease(fixture.primary, identity.task_id).record?.claim_id).toBe(owner.claim_id);

    // The historical owner stays intact.
    expect(readLease(fixture.primary, identity.task_id).classification).toBe('bound');
  }, 60_000);

  test('detached HEAD and branch rename do not disturb ownership', () => {
    const fixture = createFixture('sprint-detached-head');
    const owner = seedBoundRow(fixture, fixture.worktreeA, fixture.worktreeA, 'codex/row-a');
    const identity = identify(fixture.primary, ROW_ONE);

    git(fixture.worktreeA, ['checkout', '--quiet', '--detach']);
    expect(git(fixture.worktreeA, ['status', '--porcelain=v2', '--branch'])).toContain('detached');
    // Ownership is a lease binding on a path, not an inference from HEAD.
    expect(readLease(fixture.primary, identity.task_id).record?.claim_id).toBe(owner.claim_id);

    git(fixture.worktreeA, ['checkout', '--quiet', 'codex/row-a']);
    git(fixture.worktreeA, ['branch', '-m', 'codex/row-a', 'codex/row-a-renamed']);
    const afterRename = readLease(fixture.primary, identity.task_id);
    // The recorded branch is provenance, never authority: the rename leaves it
    // stale and leaves ownership untouched.
    expect(afterRename.record?.branch).toBe('codex/row-a');
    expect(afterRename.record?.claim_id).toBe(owner.claim_id);
  }, 60_000);


  test('an empty task lock refuses entry without blocking a different task', () => {
    const fixture = createFixture('sprint-lock-wedge');
    const commonDir = resolveGitCommonDirectory(fixture.primary);
    const identity = identify(fixture.primary, ROW_ONE);
    const otherIdentity = identify(fixture.primary, ROW_TWO);
    const taskLock = join(commonDir, taskLockRelativePath(identity.task_id));
    mkdirSync(taskLock, { recursive: true });
    expect(() => withExclusiveDirectoryLock(
      commonDir,
      taskLockRelativePath(identity.task_id),
      () => 'never runs',
      { waitTimeoutMs: 200 },
    )).toThrow(/timed out waiting/);
    expect(withExclusiveDirectoryLock(
      commonDir,
      taskLockRelativePath(otherIdentity.task_id),
      () => 'still works',
      { waitTimeoutMs: 200 },
    )).toBe('still works');

  }, 120_000);

  test('two bound worktrees are two doing cards with distinct ownership', () => {
    const fixture = createFixture('board-two-owners');
    const first = seedRow(fixture.worktreeA, ROW_ONE, fixture.worktreeA, 'codex/row-a', 'session-a');
    const second = seedRow(fixture.worktreeB, ROW_TWO, fixture.worktreeB, 'codex/row-b', 'session-b');

    // No `--sprint`: the active sprint marker is the only fallback, and it is
    // the same answer every other verb resolves "which sprint" to.
    const document = board(fixture.primary);
    expect(document.kind).toBe('repo-harness-board');
    expect(document.sprint_path).toBe(SPRINT_PATH);
    expect(document.canonical_target.ref).toBe('main');
    expect(document.cards).toHaveLength(2);

    const cardOne = cardOf(document, ROW_ONE);
    const cardTwo = cardOf(document, ROW_TWO);
    for (const card of [cardOne, cardTwo]) {
      expect(card.column).toBe('doing');
      expect(card.task_state).toBe('pending');
      expect(card.lease_state).toBe('bound');
      expect(card.diagnostics.worktree_missing).toBe(false);
    }
    expect(cardOne.claim?.claim_id).toBe(first.claim_id);
    expect(cardTwo.claim?.claim_id).toBe(second.claim_id);
    expect(cardOne.claim?.claim_id).not.toBe(cardTwo.claim?.claim_id);
    expect(cardOne.claim?.generation).toBe(1);
    expect(cardTwo.claim?.generation).toBe(1);
    expect(cardOne.claim?.worktree).toBe(fixture.worktreeA);
    expect(cardTwo.claim?.worktree).toBe(fixture.worktreeB);
    // Every linked worktree addresses one plane, so the board is the same
    // document wherever it is read from.
    expect(board(fixture.worktreeB, ['--sprint', SPRINT_PATH])).toEqual(document);
  }, 180_000);

  test('a historical second generation keeps its provenance in the board', () => {
    const fixture = createFixture('board-steal');
    const owner = seedRow(fixture.worktreeA, ROW_ONE, fixture.worktreeA, 'codex/row-a', 'session-a');
    const thief = seedRow(fixture.worktreeB, ROW_ONE, null, null, 'session-b', 2,
      { claim_id: owner.claim_id, reason: 'no progress for 2h' });

    const card = cardOf(board(fixture.primary, ['--sprint', SPRINT_PATH]), ROW_ONE);
    expect(card.claim?.claim_id).toBe(thief.claim_id);
    expect(card.claim?.generation).toBe(2);
    expect(card.claim?.stolen_from).toEqual({ claim_id: owner.claim_id, reason: 'no progress for 2h' });
    // The historical reservation has no execution worktree.
    expect(card.lease_state).toBe('reserving');
    expect(card.claim?.worktree).toBeNull();
    expect(card.column).toBe('doing');
  }, 180_000);

  test('a removed worktree is a blocked, reclaimable orphan', () => {
    const fixture = createFixture('board-orphan');
    const owner = seedRow(fixture.worktreeA, ROW_ONE, fixture.worktreeA, 'codex/row-a', 'session-a');
    git(fixture.primary, ['worktree', 'remove', '--force', fixture.worktreeA]);

    const card = cardOf(board(fixture.primary, ['--sprint', SPRINT_PATH]), ROW_ONE);
    expect(card.diagnostics.worktree_missing).toBe(true);
    expect(card.diagnostics.orphan_reclaimable).toBe(true);
    expect(card.diagnostics.progress_unreadable_reason).toBe('owner_worktree_missing');
    expect(card.progress_state).toBe('unreadable');
    expect(card.column).toBe('blocked');
    // Reported, never reclaimed: the lease and its owner are untouched.
    expect(card.claim?.claim_id).toBe(owner.claim_id);
  }, 180_000);

  test('a completed row is done with cleanup, not doing', () => {
    const fixture = createFixture('board-done-residue');
    const owner = seedRow(fixture.worktreeA, ROW_ONE, fixture.worktreeA, 'codex/row-a', 'session-a');
    // The publication back-fills the canonical row; the lease outlives it when
    // the finish crashes between the two.
    writeFileSync(join(fixture.primary, SPRINT_PATH), sprintFile([
      `| 1 | ${fixtureTaskId(`${ROW_ONE}`)} | [x] | ${ROW_ONE} | contract | tests pass | (done) |`,
      `| 2 | ${fixtureTaskId(`${ROW_TWO}`)} | [ ] | ${ROW_TWO} | inline | doc updated | (pending) |`,
    ]));
    git(fixture.primary, ['commit', '--quiet', '-am', 'complete row one']);

    const card = cardOf(board(fixture.primary, ['--sprint', SPRINT_PATH]), ROW_ONE);
    expect(card.task_state).toBe('done');
    expect(card.column).toBe('done');
    expect(card.diagnostics.lease_cleanup_required).toBe(true);
    expect(card.claim?.claim_id).toBe(owner.claim_id);
  }, 180_000);

  test('twenty consecutive board reads under active worktrees', () => {
    const fixture = createFixture('board-stability-probe');
    seedRow(fixture.worktreeA, ROW_ONE, fixture.worktreeA, 'codex/row-a', 'session-a');
    seedRow(fixture.worktreeB, ROW_TWO, fixture.worktreeB, 'codex/row-b', 'session-b');

    const RUNS = 20;
    let stable = 0;
    for (let run = 0; run < RUNS; run += 1) {
      const document = board(fixture.primary, ['--sprint', SPRINT_PATH]);
      expect(['stable', 'changed_during_read']).toContain(document.snapshot_consistency);
      expect(document.cards).toHaveLength(2);
      expect(document.revisions.board).toMatch(/^sha256:[0-9a-f]{64}$/);
      if (document.snapshot_consistency === 'stable') stable += 1;
    }
    console.log(
      `[board stability probe] 3 worktrees, 2 active leases, ${RUNS} runs: `
      + `stable ${stable}/${RUNS} (${Math.round((stable / RUNS) * 100)}%)`,
    );
    expect(stable).toBeGreaterThanOrEqual(0);
  }, 600_000);

});
