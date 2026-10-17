/** Retained completion, reconciliation, locks and board reads over real linked worktrees. */
import { afterAll, describe, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
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
import {
  COORDINATION_BACKLOG_LOCK_RELATIVE_PATH,
  leaseDirectory,
  readLease,
  taskLockRelativePath,
  withBacklogLock,
} from '../src/effects/state/coordination-lease-store';
import { withExclusiveDirectoryLock } from '../src/effects/locking/exclusive-directory-lock';
import { resolveGitCommonDirectory } from '../src/effects/git/common-directory';
import {
  cutoverMarkerPath,
  inspectCutoverQuiescence,
  recordCutoverInstalled,
} from '../src/effects/state/coordination-cutover';
import { fixtureTaskId, leaseOwnerPath, writeClaimTokenFixture } from './helpers/sprint-fixture';
import { randomUUID } from 'crypto';
import { buildLeaseOwnerRecord, projectCanonicalTasks } from '../src/core/state/coordination-identity';
import { createLeaseDirectory, writeLeaseOwnerDurably } from '../src/effects/state/coordination-lease-store';

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

function sprint(cwd: string, args: readonly string[]): Run {
  const result = spawnSync(process.execPath, [CLI, 'sprint', ...args], {
    cwd,
    encoding: 'utf-8',
    env: sandboxEnv(),
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function sprintJson<T>(run: Run): T {
  if (run.status !== 0) throw new Error(`sprint verb failed (${run.status}): ${run.stderr}`);
  return JSON.parse(run.stdout) as T;
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
  readonly actions: {
    readonly release: string | null;
    readonly reconcile: string | null;
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
  createLeaseDirectory(cwd, identity.task_id);
  writeLeaseOwnerDurably(cwd, identity.task_id, record);
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
  test('the finish gate rejects on worktree binding independently of the token', () => {
    const fixture = createFixture('sprint-binding-gate');
    const owner = seedBoundRow(fixture, fixture.worktreeA, fixture.worktreeA, 'codex/row-a');

    // Same live fencing token, wrong worktree: the binding check alone refuses.
    const wrongTree = sprint(fixture.worktreeB, [
      'begin-completion', '--claim-id', owner.claim_id, '--worktree', fixture.worktreeB, '--target-ref', 'main',
    ]);
    expect(wrongTree.status).toBe(1);
    expect(wrongTree.stderr).toContain(`is bound to ${fixture.worktreeA}`);

    const rightTree = sprint(fixture.worktreeA, [
      'begin-completion', '--claim-id', owner.claim_id, '--worktree', fixture.worktreeA, '--target-ref', 'main',
    ]);
    expect(rightTree.status).toBe(0);
  }, 60_000);

  test('contract finish gates publication on the lease and reconciles only after it', () => {
    // The wiring, read out of the live script: the gate must run before the
    // publication commit is synthesized, the closeout journal key must be
    // stamped on the lease before that too, and the cleanup only after the
    // transaction commits. Dropping ownership before publication would free a
    // row whose work was never published.
    const script = readFileSync(join(ROOT, 'scripts/contract-worktree.sh'), 'utf-8');
    const gate = script.indexOf('sprint_lease_begin_completion "$target_branch"');
    const stamp = script.indexOf('sprint_lease_record_finish_transaction "$target_branch" "$closeout_key"');
    const publish = script.indexOf('publication_sha="$(git commit-tree');
    const commit = script.indexOf('finish_transaction_commit "$publication_sha"');
    // lastIndexOf: the first occurrence is the function definition, which sits
    // above finish_worktree; the call site is the one whose order matters.
    const cleanup = script.lastIndexOf('sprint_lease_reconcile_after_publication "$target_branch"');
    expect(gate).toBeGreaterThan(0);
    expect(stamp).toBeGreaterThan(gate);
    expect(publish).toBeGreaterThan(stamp);
    expect(cleanup).toBeGreaterThan(commit);

    // The key handed to the lease is the closeout journal's own, never derived
    // a second time here.
    expect(script).toContain('--finish-transaction-key "$journal_key"');
    // Cleanup is reconcile, not release: at this point the lease is
    // `completing`, which release refuses because it cannot tell whether the
    // publication landed. Nothing in this script releases a lease any more.
    expect(script).toContain('--expected-claim-id "$sprint_lease_claim_id"');
    expect(script).not.toContain('sprint_lease release');
    // The back-fill inside the publication tree must not release the lease.
    expect(script).toContain('--defer-lease-release');
  });

  test('the post-publication cleanup clears the lease with its own token', () => {
    // The path the script now takes, over a real clone: the finish stamps its
    // journal key, publication lands, and reconcile -- narrowed to this
    // claim -- clears the lease that release cannot touch.
    const fixture = createFixture('sprint-post-publication-cleanup');
    const owner = seedBoundRow(fixture, fixture.worktreeA, fixture.worktreeA, 'codex/row-a');
    const identity = identify(fixture.primary, ROW_ONE);

    const gated = sprintJson<OwnerRecord>(sprint(fixture.worktreeA, [
      'begin-completion', '--claim-id', owner.claim_id, '--worktree', fixture.worktreeA,
      '--target-ref', 'main', '--finish-transaction-key', 'finish/abc123',
    ]));
    expect(gated.state).toBe('completing');
    expect(gated.finish_transaction_key).toBe('finish/abc123');

    // Why the script stopped calling release at all.
    const released = sprint(fixture.worktreeA, ['release', '--claim-id', owner.claim_id]);
    expect(released.status).toBe(1);
    expect(released.stderr).toContain('cannot release a lease in state completing');

    // Publication lands on the target ref.
    writeFileSync(
      join(fixture.primary, SPRINT_PATH),
      sprintFile([
        `| 1 | ${fixtureTaskId(`${ROW_ONE}`)} | [x] | ${ROW_ONE} | contract | tests pass | \`plans/archive/plan-row-one.md\` |`,
        PENDING_ROWS[1],
      ]),
    );
    git(fixture.primary, ['add', '-A']);
    git(fixture.primary, ['commit', '--quiet', '-m', 'publish row one']);

    // A token that does not own the lease clears nothing.
    const foreign = sprint(fixture.worktreeA, [
      'reconcile', '--task-id', identity.task_id,
      '--expected-claim-id', 'claim-not-mine', '--target-ref', 'main',
    ]);
    expect(foreign.status).toBe(1);
    expect(foreign.stderr).toContain('claim id mismatch');
    expect(readLease(fixture.primary, identity.task_id).classification).toBe('completing');

    const cleared = sprintJson<{ action: string; canonical_status: string }>(sprint(fixture.worktreeA, [
      'reconcile', '--task-id', identity.task_id,
      '--expected-claim-id', owner.claim_id, '--target-ref', 'main',
    ]));
    expect(cleared.canonical_status).toBe('[x]');
    expect(cleared.action).toBe('cleared_completed_lease');
    expect(readLease(fixture.primary, identity.task_id).classification).toBe('available');
  }, 60_000);

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

    // Reconcile reports and stops: an empty lease directory cannot distinguish
    // a crashed claim from a live one paused between `mkdir` and the write.
    const reconcile = sprintJson<{ action: string; classification: string; unknown_reason: string }>(
      sprint(fixture.primary, ['reconcile', '--task-id', identity.task_id, '--target-ref', 'main']),
    );
    expect(reconcile.classification).toBe('unknown');
    expect(reconcile.unknown_reason).toBe('owner_record_missing');
    expect(reconcile.action).toBe('none');
    expect(existsSync(leaseDirectory(fixture.primary, identity.task_id))).toBe(true);

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
    // The live token cannot act on it either: the lookup that finds a lease by
    // fencing token skips what it cannot classify rather than guessing.
    const staleRelease = sprint(fixture.worktreeA, ['release', '--claim-id', owner.claim_id]);
    expect(staleRelease.status).toBe(1);
    expect(staleRelease.stderr).toContain(`no lease holds claim id ${owner.claim_id}`);
    const malformedReconcile = sprintJson<{ action: string; classification: string }>(
      sprint(fixture.primary, ['reconcile', '--task-id', identity.task_id, '--target-ref', 'main']),
    );
    expect(malformedReconcile.classification).toBe('unknown');
    expect(malformedReconcile.action).toBe('none');
    expect(existsSync(ownerPath)).toBe(true);

    // 2. A symlinked record is unknown and is not followed, so a decoy record
    // planted elsewhere never becomes this lease's owner.
    const decoy = join(fixture.primary, 'decoy-owner.json');
    writeFileSync(decoy, intact);
    rmSync(ownerPath);
    symlinkSync(decoy, ownerPath);
    expect(readLease(fixture.worktreeB, identity.task_id).unknown_reason).toBe('owner_record_symlink');
    expect(readLease(fixture.worktreeB, identity.task_id).record).toBeNull();
    const symlinkReconcile = sprintJson<{ action: string; unknown_reason: string }>(
      sprint(fixture.primary, ['reconcile', '--task-id', identity.task_id, '--target-ref', 'main']),
    );
    expect(symlinkReconcile.unknown_reason).toBe('owner_record_symlink');
    expect(symlinkReconcile.action).toBe('none');
    expect(lstatSync(ownerPath).isSymbolicLink()).toBe(true);
    expect(existsSync(decoy)).toBe(true);

    // 3. The record is the authority: restoring it restores ownership, and the
    // original token -- never revoked by any of the above -- can release.
    rmSync(ownerPath);
    writeFileSync(ownerPath, intact);
    expect(readLease(fixture.worktreeB, identity.task_id).record?.claim_id).toBe(owner.claim_id);
    expect(sprint(fixture.worktreeA, ['release', '--claim-id', owner.claim_id]).status).toBe(0);
    expect(readLease(fixture.primary, identity.task_id).classification).toBe('available');
  }, 60_000);

  test('a reserving lease whose session is gone is never auto-reclaimed', () => {
    const fixture = createFixture('sprint-dead-session');
    const identity = identify(fixture.primary, ROW_ONE);
    // A session id that names no live process anywhere.
    seedRow(fixture.worktreeA, ROW_ONE, null, null, 'session-that-is-gone');

    const reconcile = sprintJson<{ action: string; classification: string }>(
      sprint(fixture.primary, ['reconcile', '--task-id', identity.task_id, '--target-ref', 'main']),
    );
    // A reservation has no worktree whose absence could prove death, so it is
    // reported and left alone; it has no automatic expiry.
    expect(reconcile.action).toBe('none');
    expect(reconcile.classification).toBe('reserving');
    expect(readLease(fixture.primary, identity.task_id).classification).toBe('reserving');

    expect(readLease(fixture.worktreeB, identity.task_id).classification).toBe('reserving');
  }, 60_000);

  test('a publication that crashed before release is reconcilable, not corrupt', () => {
    const fixture = createFixture('sprint-crash-after-publish');
    const owner = seedBoundRow(fixture, fixture.worktreeA, fixture.worktreeA, 'codex/row-a');
    const identity = identify(fixture.primary, ROW_ONE);
    expect(sprint(fixture.worktreeA, [
      'begin-completion', '--claim-id', owner.claim_id, '--worktree', fixture.worktreeA, '--target-ref', 'main',
    ]).status).toBe(0);

    // Before publication the lease is protected: the row is still pending.
    const early = sprintJson<{ action: string }>(
      sprint(fixture.primary, ['reconcile', '--task-id', identity.task_id, '--target-ref', 'main']),
    );
    expect(early.action).toBe('none');
    expect(readLease(fixture.primary, identity.task_id).classification).toBe('completing');

    // Publication lands, then the process dies before `release`.
    writeFileSync(
      join(fixture.primary, SPRINT_PATH),
      sprintFile([
        `| 1 | ${fixtureTaskId(`${ROW_ONE}`)} | [x] | ${ROW_ONE} | contract | tests pass | \`plans/archive/plan-row-one.md\` |`,
        PENDING_ROWS[1],
      ]),
    );
    git(fixture.primary, ['add', '-A']);
    git(fixture.primary, ['commit', '--quiet', '-m', 'publish row one']);

    const cleared = sprintJson<{ action: string; canonical_status: string }>(
      sprint(fixture.primary, ['reconcile', '--task-id', identity.task_id, '--target-ref', 'main']),
    );
    expect(cleared.canonical_status).toBe('[x]');
    expect(cleared.action).toBe('cleared_completed_lease');
    expect(readLease(fixture.primary, identity.task_id).classification).toBe('available');
  }, 60_000);

  test('a removed worktree orphans its lease without losing it', () => {
    const fixture = createFixture('sprint-worktree-removed');
    const owner = seedBoundRow(fixture, fixture.primary, fixture.worktreeB, 'codex/row-b');
    const identity = identify(fixture.primary, ROW_ONE);

    git(fixture.primary, ['worktree', 'remove', '--force', fixture.worktreeB]);
    expect(git(fixture.primary, ['worktree', 'list', '--porcelain'])).not.toContain(fixture.worktreeB);

    // No auto-reclaim: a worktree's absence does not transfer ownership, and
    // reconcile is safe to run against the orphan.
    const orphan = sprintJson<{ action: string; classification: string }>(
      sprint(fixture.primary, ['reconcile', '--task-id', identity.task_id, '--target-ref', 'main']),
    );
    expect(orphan.action).toBe('none');
    expect(orphan.classification).toBe('bound');
    expect(readLease(fixture.primary, identity.task_id).record?.claim_id).toBe(owner.claim_id);

    // The orphan is still explicitly releasable by its own token.
    expect(sprint(fixture.primary, ['release', '--claim-id', owner.claim_id]).status).toBe(0);
    expect(readLease(fixture.primary, identity.task_id).classification).toBe('available');
  }, 60_000);

  test('detached HEAD and branch rename do not disturb ownership', () => {
    const fixture = createFixture('sprint-detached-head');
    const owner = seedBoundRow(fixture, fixture.worktreeA, fixture.worktreeA, 'codex/row-a');
    const identity = identify(fixture.primary, ROW_ONE);

    git(fixture.worktreeA, ['checkout', '--quiet', '--detach']);
    expect(git(fixture.worktreeA, ['status', '--porcelain=v2', '--branch'])).toContain('detached');
    // Ownership is a lease binding on a path, not an inference from HEAD.
    expect(readLease(fixture.primary, identity.task_id).record?.claim_id).toBe(owner.claim_id);
    expect(sprint(fixture.worktreeA, [
      'begin-completion', '--claim-id', owner.claim_id, '--worktree', fixture.worktreeA, '--target-ref', 'main',
    ]).status).toBe(0);

    git(fixture.worktreeA, ['checkout', '--quiet', 'codex/row-a']);
    git(fixture.worktreeA, ['branch', '-m', 'codex/row-a', 'codex/row-a-renamed']);
    const afterRename = readLease(fixture.primary, identity.task_id);
    // The recorded branch is provenance, never authority: the rename leaves it
    // stale and leaves ownership untouched.
    expect(afterRename.record?.branch).toBe('codex/row-a');
    expect(afterRename.record?.claim_id).toBe(owner.claim_id);
    expect(sprint(fixture.worktreeA, [
      'begin-completion', '--claim-id', owner.claim_id, '--worktree', fixture.worktreeA, '--target-ref', 'main',
    ]).status).toBe(0);
  }, 60_000);

  test('an inline sibling completing in the primary tree does not drift a live claim', () => {
    // The revision-granularity falsifier, end to end over a real clone: row one
    // is claimed and bound from a linked worktree while row two runs the real
    // inline completion in the primary tree -- seeded lease and token, then the row
    // rewrite and the lease release inside one backlog-lock critical section.
    // A whole-sprint or whole-ref revision would invalidate row one here, which
    // is exactly what makes parallel execution impossible.
    const fixture = createFixture('sprint-sibling-complete');
    mkdirSync(join(fixture.primary, 'scripts'), { recursive: true });
    for (const helper of ['sprint-backlog.sh']) {
      copyFileSync(join(HELPER_DIR, helper), join(fixture.primary, 'scripts', helper));
      chmodSync(join(fixture.primary, 'scripts', helper), 0o755);
    }

    // Inline admission needs no planning marker or projection.
    const rowOne = seedBoundRow(fixture, fixture.worktreeA, fixture.worktreeA, 'codex/row-a');
    const before = identify(fixture.primary, ROW_ONE);

    const shell = (args: readonly string[]) => spawnSync('bash', [...args], {
      cwd: fixture.primary,
      encoding: 'utf-8',
      env: sandboxEnv(),
    });

    seedRow(fixture.primary, ROW_TWO, fixture.primary, 'main', 'inline-owner');

    const complete = shell(['scripts/sprint-backlog.sh', 'complete-task', '--task', ROW_TWO]);
    expect(complete.status, `${complete.stdout}\n${complete.stderr}`).toBe(0);
    expect(complete.stdout).toContain(`Released lease for '${ROW_TWO}'`);
    expect(readFileSync(join(fixture.primary, SPRINT_PATH), 'utf-8'))
      .toMatch(new RegExp(`\\|\\s*2\\s*\\|\\s*[0-9a-f]{64}\\s*\\|\\s*\\[x\\]\\s*\\|\\s*${ROW_TWO}`));

    // Publish the sibling's completion, so canonical `main` -- the ref every
    // verb validates against -- now carries a rewritten sprint file.
    git(fixture.primary, ['add', '-A']);
    git(fixture.primary, ['commit', '--quiet', '-m', 'complete row two']);

    const after = identify(fixture.primary, ROW_ONE);
    expect(after.task_id).toBe(before.task_id);
    expect(after.task_revision).toBe(before.task_revision);

    const lease = readLease(fixture.primary, before.task_id);
    expect(lease.classification).toBe('bound');
    expect(lease.record?.claim_id).toBe(rowOne.claim_id);
    // Not merely undrifted on paper: the claim can still pass the finish gate.
    expect(sprint(fixture.worktreeA, [
      'begin-completion', '--claim-id', rowOne.claim_id, '--worktree', fixture.worktreeA, '--target-ref', 'main',
    ]).status).toBe(0);

    // The inline transaction closed on both sides: row completed, lease gone.
    expect(readLease(fixture.primary, identify(fixture.primary, ROW_TWO).task_id).classification)
      .toBe('available');
    expect(readdirSync(join(fixture.primary, '.ai/harness/sprint/claims'))).toHaveLength(0);
  }, 120_000);

  test('cutover refuses while legacy markers, contract worktrees, or closeouts are live', () => {
    const fixture = createFixture('sprint-cutover');
    expect(inspectCutoverQuiescence(fixture.primary).quiescent).toBe(true);

    // 1. A retired per-worktree in-flight marker under a linked worktree.
    mkdirSync(join(fixture.worktreeA, '.ai/harness/sprint/in-flight'), { recursive: true });
    writeFileSync(join(fixture.worktreeA, '.ai/harness/sprint/in-flight/race-the-claim'), 'capturing');
    let quiescence = inspectCutoverQuiescence(fixture.primary);
    expect(quiescence.quiescent).toBe(false);
    expect(quiescence.blockers.map((entry) => entry.kind)).toContain('legacy_in_flight_marker');
    rmSync(join(fixture.worktreeA, '.ai/harness/sprint/in-flight'), { recursive: true, force: true });
    expect(inspectCutoverQuiescence(fixture.primary).quiescent).toBe(true);

    // 2. An executing contract worktree.
    mkdirSync(join(fixture.worktreeB, '.ai/harness/worktrees'), { recursive: true });
    writeFileSync(join(fixture.worktreeB, '.ai/harness/worktrees/row-one.json'), '{"slug":"row-one"}');
    quiescence = inspectCutoverQuiescence(fixture.primary);
    expect(quiescence.quiescent).toBe(false);
    expect(quiescence.blockers.map((entry) => entry.kind)).toContain('executing_contract_worktree');
    rmSync(join(fixture.worktreeB, '.ai/harness/worktrees'), { recursive: true, force: true });

    // 3. An unfinished closeout journal entry.
    const journal = join(
      resolveGitCommonDirectory(fixture.primary),
      'repo-harness/transactions/finish/abc123',
    );
    mkdirSync(journal, { recursive: true });
    writeFileSync(join(journal, 'status.json'), '{\n  "status": "in_progress"\n}\n');
    quiescence = inspectCutoverQuiescence(fixture.primary);
    expect(quiescence.quiescent).toBe(false);
    expect(quiescence.blockers.map((entry) => entry.kind)).toContain('unfinished_closeout_journal');

    // Nothing was migrated, repaired, or deleted along the way.
    writeFileSync(join(journal, 'status.json'), '{\n  "status": "complete"\n}\n');
    expect(inspectCutoverQuiescence(fixture.primary).quiescent).toBe(true);
  }, 60_000);

  test('a missing git binary is a typed error, never a skipped gate', () => {
    // Separate process, because PATH is process-global and this suite runs
    // beside others. `process.execPath` keeps bun reachable without PATH.
    const fixture = createFixture('sprint-cutover-no-git', false);
    const emptyPath = realpathSync(mkdtempSync(join(tmpdir(), 'no-git-path-')));
    FIXTURES.add(emptyPath);

    const probe = spawnSync(
      process.execPath,
      [
        '-e',
        [
          'const mod = await import(process.argv[1]);',
          'for (const name of ["cutoverMarkerPath", "inspectCutoverQuiescence", "legacyCutoverRefusal"]) {',
          '  try { mod[name](process.argv[2]); console.log(`${name}:none`); }',
          '  catch (error) { console.log(`${name}:${error.name}`); }',
          '}',
        ].join('\n'),
        join(ROOT, 'src/effects/state/coordination-cutover.ts'),
        fixture.primary,
      ],
      { encoding: 'utf-8', env: { PATH: emptyPath, HOME: emptyPath, TMPDIR: '/tmp' } },
    );

    expect(probe.stdout.trim().split('\n')).toEqual([
      'cutoverMarkerPath:GitBinaryUnavailableError',
      'inspectCutoverQuiescence:GitBinaryUnavailableError',
      'legacyCutoverRefusal:GitBinaryUnavailableError',
    ]);
  }, 60_000);

  test('init refuses to apply while the repo is not quiescent', () => {
    const fixture = createFixture('sprint-cutover-init');
    mkdirSync(join(fixture.worktreeA, '.ai/harness/sprint/in-flight'), { recursive: true });
    writeFileSync(join(fixture.worktreeA, '.ai/harness/sprint/in-flight/race-the-claim'), 'capturing');

    const result = spawnSync(
      process.execPath,
      [CLI, 'init', '--repo', fixture.primary, '--no-verify', '--no-codegraph'],
      { cwd: fixture.primary, encoding: 'utf-8', env: sandboxEnv() },
    );
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('cutover quiescence');
    expect(`${result.stdout}${result.stderr}`).toContain('legacy_in_flight_marker');
    // Fail closed means the legacy marker survives for the operator to resolve.
    expect(existsSync(join(fixture.worktreeA, '.ai/harness/sprint/in-flight/race-the-claim'))).toBe(true);
  }, 120_000);

  test('an empty lock directory wedges the lock clone-wide', () => {
    const fixture = createFixture('sprint-lock-wedge');
    const commonDir = resolveGitCommonDirectory(fixture.primary);
    const backlogLock = join(commonDir, COORDINATION_BACKLOG_LOCK_RELATIVE_PATH);

    // The crash window inside the lock primitive itself: mkdir succeeded, the
    // owner token was never published. `reclaimStaleLockDirectory` refuses to
    // reclaim it (exclusive-directory-lock.ts: `entries.length !== 1`) because
    // an empty directory cannot distinguish a crashed creator from a live one
    // paused between mkdir and publication.
    mkdirSync(backlogLock, { recursive: true });
    expect(readdirSync(backlogLock)).toHaveLength(0);

    expect(() => withBacklogLock(fixture.primary, () => 'never runs')).toThrow(/timed out waiting/);
    // Blast radius: the backlog lock now lives under the git common directory,
    // so this wedge is clone-level rather than bounded to one worktree -- every
    // linked worktree's back-fill fails closed on the same directory until an
    // operator clears it.
    expect(() => withBacklogLock(fixture.worktreeA, () => 'never runs')).toThrow(/timed out waiting/);
    expect(() => withBacklogLock(fixture.worktreeB, () => 'never runs')).toThrow(/timed out waiting/);

    // A wedged per-task lock stays bounded to its own task, which is the
    // contrast that makes the backlog lock's radius the notable one.
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

    // Clearing the empty directory is the operator action, and it restores the
    // lock: nothing self-heals here.
    rmSync(backlogLock, { recursive: true, force: true });
    expect(withBacklogLock(fixture.primary, () => 'recovered')).toBe('recovered');
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
    expect(card.actions.release).toBe(`repo-harness sprint release --claim-id ${owner.claim_id}`);
    expect(card.actions.reconcile).toContain('repo-harness sprint reconcile --task-id');
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
    expect(card.actions.reconcile).toContain('--target-ref main');
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
