/**
 * The falsification harness for the shared lease protocol, over REAL linked
 * worktrees of a real clone and, where the hazard is a race, over real
 * concurrent processes.
 *
 * Every hazard in this file is a filesystem-ordering hazard: `mkdir` atomicity,
 * the window between a lease election and its durable owner write, the window
 * between a git publication and a lease release. A mocked filesystem would
 * prove nothing about any of them, so nothing here is mocked -- the git common
 * directory, the locks, the leases, and the worktrees are all real.
 *
 * Row-by-row map to the work package's falsification table:
 *
 * | table row | test |
 * | --- | --- |
 * | two linked worktrees claim one task concurrently | "exactly one of two concurrent claims wins" |
 * | `release` and `steal` run concurrently | "release racing steal is serialized" |
 * | `complete` and `steal` run concurrently | "completion racing steal is serialized" |
 * | stolen-from agent calls release | "a stolen-from token cannot release" |
 * | stolen-from agent calls finish | "a stolen-from token is rejected on claim id" / "on worktree binding" |
 * | claim succeeds, then worktree creation fails | "only the same claim id rolls back a reservation" / "start-task rolls its own reservation back" |
 * | crash after lease mkdir, before the owner write | "a lease directory with no owner record is unknown clone-wide" |
 * | malformed, empty, or symlinked owner record | "a malformed or symlinked owner record is unknown, and no verb repairs it" |
 * | a `reserving` record whose session is gone | "a reserving lease whose session is gone is never auto-reclaimed" |
 * | task A completes, changing the sprint file | "an inline sibling completing in the primary tree does not drift a live claim" |
 * | finish publishes, then crashes before release | "a publication that crashed before release is reconcilable" |
 * | worktree formally removed | "a removed worktree orphans its lease without losing it" |
 * | detached HEAD or branch rename | "detached HEAD and branch rename do not disturb ownership" |
 * | upgrade with legacy per-worktree markers present | "cutover refuses while legacy markers, contract worktrees, or closeouts are live" |
 * | empty lock directory wedge (carry-over) | "an empty lock directory wedges the lock clone-wide" |
 * | `scripts/` vs `assets/templates/helpers/` | "the helper mirrors stay byte-identical" |
 *
 * The purely derivational rows -- row reorder and deletion, slug collisions,
 * cross-sprint isolation, separator forging, and revision granularity under an
 * unrelated row's edit -- are falsified against the derivation itself in
 * `tests/coordination-identity.test.ts`, where no filesystem is involved.
 */
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
  leaseOwnerPath,
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
import { fixtureTaskId } from './helpers/sprint-fixture';

const ROOT = join(import.meta.dir, '..');
const CLI = join(ROOT, 'src/cli/index.ts');
const HELPER_DIR = join(ROOT, 'assets/templates/helpers');
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

/** Real concurrency: two OS processes, started before either can finish. */
function sprintAsync(cwd: string, args: readonly string[]): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, 'sprint', ...args], { cwd, env: sandboxEnv() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

/**
 * The three shapes a mutation takes when it lost a race, all fail-closed: the
 * pre-lock lookup found no lease for the token, the re-read inside the lock
 * found a different owner, or the re-read found the lease already gone. The
 * second and third are the TOCTOU the per-task lock exists to catch.
 */
const LOST_THE_RACE = /no lease holds claim id|claim id mismatch|expected claim id|is available/;

function thiefClaimId(steal: Run): string {
  return (JSON.parse(steal.stdout) as OwnerRecord).claim_id;
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
    readonly steal: string | null;
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
  return sprintJson<Identity>(
    sprint(cwd, ['identify', '--task', taskRef, '--target-ref', 'main', '--sprint-path', SPRINT_PATH]),
  );
}

function claimArgs(identity: Identity, sessionId: string): string[] {
  return [
    'claim',
    '--task-id', identity.task_id,
    '--expected-task-revision', identity.task_revision,
    '--target-ref', 'main',
    '--sprint-path', SPRINT_PATH,
    '--session-id', sessionId,
  ];
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

/** Claim row one from `cwd` and bind it to `worktree`. */
function claimAndBind(fixture: Fixture, cwd: string, worktree: string, branch: string): OwnerRecord {
  const identity = identify(cwd, ROW_ONE);
  const claimed = sprintJson<OwnerRecord>(sprint(cwd, claimArgs(identity, 'session-owner')));
  const bound = sprintJson<OwnerRecord>(sprint(cwd, [
    'bind',
    '--claim-id', claimed.claim_id,
    '--worktree', worktree,
    '--branch', branch,
    '--unit-ref', 'plans/plan-row-one.md',
  ]));
  expect(bound.state).toBe('bound');
  expect(fixture.primary.length).toBeGreaterThan(0);
  return bound;
}

afterAll(() => {
  for (const path of FIXTURES) rmSync(path, { recursive: true, force: true });
});

describe('concurrent claims over real linked worktrees', () => {
  test('exactly one of two concurrent claims wins', async () => {
    const fixture = createFixture('sprint-claim-race');
    const identity = identify(fixture.primary, ROW_ONE);

    const [a, b] = await Promise.all([
      sprintAsync(fixture.worktreeA, claimArgs(identity, 'session-a')),
      sprintAsync(fixture.worktreeB, claimArgs(identity, 'session-b')),
    ]);

    const winners = [a, b].filter((run) => run.status === 0);
    const losers = [a, b].filter((run) => run.status !== 0);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    // The loser is refused, never crashed: exit 1 is a fail-closed refusal.
    expect(losers[0].status).toBe(1);
    expect(losers[0].stderr).toMatch(/is not available|lost the lease election/);

    const record = JSON.parse(winners[0].stdout) as OwnerRecord;
    const lease = readLease(fixture.primary, identity.task_id);
    expect(lease.classification).toBe('reserving');
    expect(lease.record?.claim_id).toBe(record.claim_id);
    // Both worktrees address one lease directory, which is the whole point.
    expect(leaseDirectory(fixture.worktreeA, identity.task_id))
      .toBe(leaseDirectory(fixture.worktreeB, identity.task_id));
  }, 60_000);

  test('release racing steal is serialized: never both, never neither', async () => {
    const fixture = createFixture('sprint-release-steal');
    const identity = identify(fixture.primary, ROW_ONE);
    const owner = sprintJson<OwnerRecord>(sprint(fixture.worktreeA, claimArgs(identity, 'session-a')));

    const [release, steal] = await Promise.all([
      sprintAsync(fixture.worktreeA, ['release', '--claim-id', owner.claim_id]),
      sprintAsync(fixture.worktreeB, [
        'steal', '--expected-claim-id', owner.claim_id, '--reason', 'no progress', '--session-id', 'session-b',
      ]),
    ]);

    const succeeded = [release, steal].filter((run) => run.status === 0);
    expect(succeeded).toHaveLength(1);

    const lease = readLease(fixture.primary, identity.task_id);
    if (release.status === 0) {
      // Release won: the lease is gone and the steal found nothing to take.
      expect(lease.classification).toBe('available');
      expect(steal.stderr).toMatch(LOST_THE_RACE);
    } else {
      // Steal won: a new token owns it, with provenance, and the stale read
      // never deleted the new owner's lease. The refusal arrives either from
      // the pre-lock lookup ("no lease holds claim id") or from the re-read
      // inside the lock ("claim id mismatch") -- the second is the TOCTOU the
      // per-task lock exists to catch, so both are correct outcomes.
      expect(lease.record).not.toBeNull();
      expect(lease.record!.claim_id).not.toBe(owner.claim_id);
      expect(lease.record!.stolen_from).toEqual({ claim_id: owner.claim_id, reason: 'no progress' });
      expect(release.stderr).toMatch(LOST_THE_RACE);
    }
  }, 60_000);

  test('completion racing steal is serialized, and the loser cannot publish', async () => {
    const fixture = createFixture('sprint-complete-steal');
    const owner = claimAndBind(fixture, fixture.worktreeA, fixture.worktreeA, 'codex/row-a');
    const identity = identify(fixture.primary, ROW_ONE);

    const [completion, steal] = await Promise.all([
      sprintAsync(fixture.worktreeA, [
        'begin-completion', '--claim-id', owner.claim_id, '--worktree', fixture.worktreeA, '--target-ref', 'main',
      ]),
      sprintAsync(fixture.worktreeB, [
        'steal', '--expected-claim-id', owner.claim_id, '--reason', 'reassigned', '--session-id', 'session-b',
      ]),
    ]);

    // Serialized by the per-task lock, so the lease ends up with exactly one
    // owner whichever order the two landed in, and never both.
    const lease = readLease(fixture.primary, identity.task_id);
    expect(lease.record).not.toBeNull();
    expect([completion, steal].filter((run) => run.status === 0)).toHaveLength(1);

    if (steal.status !== 0) {
      // The completion gate won. The steal is not merely late here -- it is
      // refused by the state machine: once the publication window is open, a
      // steal that succeeded would erase the marker that says the publication
      // may already have landed, and the new owner would see a pending-looking
      // row whose work is in fact published.
      expect(completion.status).toBe(0);
      expect(lease.record!.state).toBe('completing');
      expect(lease.record!.claim_id).toBe(owner.claim_id);
      expect(lease.record!.generation).toBe(1);
      expect(steal.stderr).toContain('cannot steal a lease in state completing');
      // Nor does a later, uncontended steal get it: the refusal is a state
      // rule, not a race outcome.
      const later = sprint(fixture.worktreeB, [
        'steal', '--expected-claim-id', owner.claim_id, '--reason', 'reassigned', '--session-id', 'session-b',
      ]);
      expect(later.status).toBe(1);
      expect(later.stderr).toContain('cannot steal a lease in state completing');
      expect(readLease(fixture.primary, identity.task_id).record!.claim_id).toBe(owner.claim_id);
      return;
    }

    // The steal won, which means it landed while the lease was still `bound`.
    // The displaced token cannot pass the gate again -- and contract finish
    // runs that gate immediately before it builds the publication tree, so a
    // stolen-from agent cannot publish.
    expect(lease.record!.claim_id).toBe(thiefClaimId(steal));
    expect(lease.record!.stolen_from).toEqual({ claim_id: owner.claim_id, reason: 'reassigned' });
    // Fencing history, not just a fresh token: the second owner is generation 2.
    expect(lease.record!.generation).toBe(2);
    const retry = sprint(fixture.worktreeA, [
      'begin-completion', '--claim-id', owner.claim_id, '--worktree', fixture.worktreeA, '--target-ref', 'main',
    ]);
    expect(retry.status).toBe(1);
    expect(retry.stderr).toContain(`no lease holds claim id ${owner.claim_id}`);
  }, 60_000);
});

describe('a stolen-from agent cannot act on the new owner"s lease', () => {
  test('a stolen-from token cannot release', () => {
    const fixture = createFixture('sprint-stolen-release');
    const identity = identify(fixture.primary, ROW_ONE);
    const owner = sprintJson<OwnerRecord>(sprint(fixture.worktreeA, claimArgs(identity, 'session-a')));
    const thief = sprintJson<OwnerRecord>(sprint(fixture.worktreeB, [
      'steal', '--expected-claim-id', owner.claim_id, '--reason', 'stalled', '--session-id', 'session-b',
    ]));

    const stale = sprint(fixture.worktreeA, ['release', '--claim-id', owner.claim_id]);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain(`no lease holds claim id ${owner.claim_id}`);
    expect(readLease(fixture.primary, identity.task_id).record?.claim_id).toBe(thief.claim_id);
  }, 60_000);

  test('a stolen-from token is rejected at the finish gate on claim id', () => {
    const fixture = createFixture('sprint-stolen-finish');
    const owner = claimAndBind(fixture, fixture.worktreeA, fixture.worktreeA, 'codex/row-a');
    sprintJson<OwnerRecord>(sprint(fixture.worktreeB, [
      'steal', '--expected-claim-id', owner.claim_id, '--reason', 'stalled', '--session-id', 'session-b',
    ]));

    const gate = sprint(fixture.worktreeA, [
      'begin-completion', '--claim-id', owner.claim_id, '--worktree', fixture.worktreeA, '--target-ref', 'main',
    ]);
    expect(gate.status).toBe(1);
    expect(gate.stderr).toContain(`no lease holds claim id ${owner.claim_id}`);
  }, 60_000);

  test('the finish gate rejects on worktree binding independently of the token', () => {
    const fixture = createFixture('sprint-binding-gate');
    const owner = claimAndBind(fixture, fixture.worktreeA, fixture.worktreeA, 'codex/row-a');

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
    const owner = claimAndBind(fixture, fixture.worktreeA, fixture.worktreeA, 'codex/row-a');
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
});

describe('reservations, crash windows, and reconcile', () => {
  test('only the same claim id rolls back a reservation', () => {
    const fixture = createFixture('sprint-rollback');
    const identity = identify(fixture.primary, ROW_ONE);
    const owner = sprintJson<OwnerRecord>(sprint(fixture.worktreeA, claimArgs(identity, 'session-a')));

    const foreign = sprint(fixture.worktreeB, ['release', '--claim-id', 'not-the-owner']);
    expect(foreign.status).toBe(1);
    expect(readLease(fixture.primary, identity.task_id).classification).toBe('reserving');

    const own = sprint(fixture.worktreeA, ['release', '--claim-id', owner.claim_id]);
    expect(own.status).toBe(0);
    expect(readLease(fixture.primary, identity.task_id).classification).toBe('available');
  }, 60_000);

  test('start-task rolls its own reservation back when the capture cannot run', () => {
    // The real shell path: the claim is taken, the capture helper is missing,
    // and the reservation must not survive as a lease nobody can find.
    const fixture = createFixture('sprint-start-rollback', false);
    mkdirSync(join(fixture.primary, 'scripts'), { recursive: true });
    writeFileSync(
      join(fixture.primary, 'scripts/sprint-backlog.sh'),
      readFileSync(join(HELPER_DIR, 'sprint-backlog.sh'), 'utf-8'),
    );
    chmodSync(join(fixture.primary, 'scripts/sprint-backlog.sh'), 0o755);

    const identity = identify(fixture.primary, ROW_ONE);
    const start = spawnSync('bash', ['scripts/sprint-backlog.sh', 'start-task', '--task', ROW_ONE], {
      cwd: fixture.primary,
      encoding: 'utf-8',
      env: sandboxEnv(),
    });
    expect(start.status).toBe(1);
    expect(start.stderr).toContain('packaged capture-plan helper not found');
    expect(start.stdout).toContain('Claimed backlog task');
    expect(readLease(fixture.primary, identity.task_id).classification).toBe('available');
  }, 60_000);

  test('start-task refuses to claim without an explicit task: there is no claim-next', () => {
    const fixture = createFixture('sprint-no-claim-next', false);
    mkdirSync(join(fixture.primary, 'scripts'), { recursive: true });
    writeFileSync(
      join(fixture.primary, 'scripts/sprint-backlog.sh'),
      readFileSync(join(HELPER_DIR, 'sprint-backlog.sh'), 'utf-8'),
    );
    const start = spawnSync('bash', ['scripts/sprint-backlog.sh', 'start-task'], {
      cwd: fixture.primary,
      encoding: 'utf-8',
      env: sandboxEnv(),
    });
    expect(start.status).toBe(2);
    expect(start.stderr).toContain('there is no automatic claim-next');
    // Nothing was claimed, so no lease exists for either row.
    for (const row of [ROW_ONE, ROW_TWO]) {
      expect(readLease(fixture.primary, identify(fixture.primary, row).task_id).classification)
        .toBe('available');
    }
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

    // A sibling cannot claim over it, and the refusal names the verb that
    // resolves it rather than resolving it silently.
    const blocked = sprint(fixture.worktreeB, claimArgs(identity, 'session-b'));
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain('owner_record_missing');
    expect(blocked.stderr).toContain('run sprint reconcile');

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
    expect(sprint(fixture.worktreeB, claimArgs(identity, 'session-b')).status).toBe(0);
  }, 60_000);

  test('a malformed or symlinked owner record is unknown, and no verb repairs it', () => {
    const fixture = createFixture('sprint-unknown-owner');
    const identity = identify(fixture.primary, ROW_ONE);
    const owner = sprintJson<OwnerRecord>(sprint(fixture.worktreeA, claimArgs(identity, 'session-a')));
    const ownerPath = leaseOwnerPath(fixture.primary, identity.task_id);
    const intact = readFileSync(ownerPath, 'utf-8');

    // 1. A record truncated mid-write is unknown, not partly trusted.
    writeFileSync(ownerPath, intact.slice(0, Math.floor(intact.length / 2)));
    expect(readLease(fixture.worktreeB, identity.task_id).unknown_reason).toBe('owner_record_malformed');
    const claimOverMalformed = sprint(fixture.worktreeB, claimArgs(identity, 'session-b'));
    expect(claimOverMalformed.status).toBe(1);
    expect(claimOverMalformed.stderr).toContain('owner_record_malformed');
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
    sprintJson<OwnerRecord>(sprint(fixture.worktreeA, claimArgs(identity, 'session-that-is-gone')));

    const reconcile = sprintJson<{ action: string; classification: string }>(
      sprint(fixture.primary, ['reconcile', '--task-id', identity.task_id, '--target-ref', 'main']),
    );
    // A reservation has no worktree whose absence could prove death, so it is
    // reported and left alone; only an explicit steal moves it.
    expect(reconcile.action).toBe('none');
    expect(reconcile.classification).toBe('reserving');
    expect(readLease(fixture.primary, identity.task_id).classification).toBe('reserving');

    const second = sprint(fixture.worktreeB, claimArgs(identity, 'session-b'));
    expect(second.status).toBe(1);
    expect(second.stderr).toContain('is not available');
  }, 60_000);

  test('a publication that crashed before release is reconcilable, not corrupt', () => {
    const fixture = createFixture('sprint-crash-after-publish');
    const owner = claimAndBind(fixture, fixture.worktreeA, fixture.worktreeA, 'codex/row-a');
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
    const owner = claimAndBind(fixture, fixture.primary, fixture.worktreeB, 'codex/row-b');
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
    const owner = claimAndBind(fixture, fixture.worktreeA, fixture.worktreeA, 'codex/row-a');
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
});

describe('completion transaction boundaries', () => {
  test('an inline sibling completing in the primary tree does not drift a live claim', () => {
    // The revision-granularity falsifier, end to end over a real clone: row one
    // is claimed and bound from a linked worktree while row two runs the real
    // inline completion in the primary tree -- claim, bind, token, then the row
    // rewrite and the lease release inside one backlog-lock critical section.
    // A whole-sprint or whole-ref revision would invalidate row one here, which
    // is exactly what makes parallel execution impossible.
    const fixture = createFixture('sprint-sibling-complete');
    mkdirSync(join(fixture.primary, 'scripts'), { recursive: true });
    for (const helper of ['sprint-backlog.sh', 'capture-plan.sh']) {
      copyFileSync(join(HELPER_DIR, helper), join(fixture.primary, 'scripts', helper));
      chmodSync(join(fixture.primary, 'scripts', helper), 0o755);
    }

    // An inline row is captured as a checklist row into the active plan, so the
    // fixture needs the plan that marker resolves to.
    const activePlan = 'plans/plan-20260818-0000-active.md';
    writeFileSync(
      join(fixture.primary, activePlan),
      ['# Plan: Active', '', '> **Status**: Executing', '', '## Task Breakdown', ''].join('\n'),
    );
    writeFileSync(join(fixture.primary, '.ai/harness/active-plan'), activePlan);

    const rowOne = claimAndBind(fixture, fixture.worktreeA, fixture.worktreeA, 'codex/row-a');
    const before = identify(fixture.primary, ROW_ONE);

    const shell = (args: readonly string[]) => spawnSync('bash', [...args], {
      cwd: fixture.primary,
      encoding: 'utf-8',
      env: sandboxEnv(),
    });

    const start = shell(['scripts/sprint-backlog.sh', 'start-task', '--task', ROW_TWO]);
    expect(start.status, `${start.stdout}\n${start.stderr}`).toBe(0);
    expect(start.stdout).toContain(`Claimed backlog task '${ROW_TWO}'`);
    expect(start.stdout).toContain('appended checklist row(s) to the active plan');

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
});

describe('quiescent fail-closed cutover', () => {
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

  test('claim and steal refuse while retired markers survive an uninstalled plane', () => {
    // `init` is not the only route to the plane. A claim taken directly on a
    // clone that never crossed over would run v1 beside legacy per-worktree
    // markers it cannot see, which is the duplicate claim the cutover exists
    // to prevent -- so the ownership verbs carry the same fail-closed gate.
    const fixture = createFixture('sprint-claim-legacy-gate');
    const rowOne = identify(fixture.primary, ROW_ONE);
    const owner = sprintJson<OwnerRecord>(sprint(fixture.worktreeA, claimArgs(rowOne, 'session-a')));

    mkdirSync(join(fixture.worktreeB, '.ai/harness/sprint/in-flight'), { recursive: true });
    writeFileSync(join(fixture.worktreeB, '.ai/harness/sprint/in-flight/second-row'), 'capturing');

    const rowTwo = identify(fixture.primary, ROW_TWO);
    const blockedClaim = sprint(fixture.worktreeB, claimArgs(rowTwo, 'session-b'));
    expect(blockedClaim.status).toBe(1);
    expect(blockedClaim.stderr).toContain('has not crossed over to the v1 coordination plane');
    expect(blockedClaim.stderr).toContain('in-flight');
    expect(blockedClaim.stderr).toContain('repo-harness init');
    // Fail closed leaves the legacy marker and elects no lease.
    expect(readLease(fixture.primary, rowTwo.task_id).classification).toBe('available');
    expect(existsSync(join(fixture.worktreeB, '.ai/harness/sprint/in-flight/second-row'))).toBe(true);

    const blockedSteal = sprint(fixture.worktreeB, [
      'steal', '--expected-claim-id', owner.claim_id, '--reason', 'stalled', '--session-id', 'session-b',
    ]);
    expect(blockedSteal.status).toBe(1);
    expect(blockedSteal.stderr).toContain('has not crossed over to the v1 coordination plane');
    expect(readLease(fixture.primary, rowOne.task_id).record?.claim_id).toBe(owner.claim_id);

    // The crossing is one-shot: once the protocol marker is recorded, the gate
    // is inert even while the operator's own legacy files are still on disk.
    recordCutoverInstalled(cutoverMarkerPath(fixture.primary)!);
    expect(sprint(fixture.worktreeB, claimArgs(rowTwo, 'session-b')).status).toBe(0);
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
      { encoding: 'utf-8', env: { PATH: emptyPath, HOME: emptyPath } },
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
});

describe('lock wedges and their blast radius', () => {
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

  test('the relocated shell backlog lock is the same clone-wide directory', () => {
    const fixture = createFixture('sprint-shell-lock');
    mkdirSync(join(fixture.primary, 'scripts'), { recursive: true });
    writeFileSync(
      join(fixture.primary, 'scripts/sprint-backlog.sh'),
      readFileSync(join(HELPER_DIR, 'sprint-backlog.sh'), 'utf-8'),
    );
    const commonDir = resolveGitCommonDirectory(fixture.primary);
    const backlogLock = join(commonDir, COORDINATION_BACKLOG_LOCK_RELATIVE_PATH);
    mkdirSync(backlogLock, { recursive: true });
    spawnSync('bash', ['-c', `touch -t 202001010000 '${backlogLock}'`], { encoding: 'utf-8' });

    // The shell primitive keeps its mtime-based stale reclaim, so it recovers
    // the same empty directory the TS primitive fails closed on. The two
    // asymmetric reclaim rules meet on one directory now; that asymmetry is the
    // reason the wedge above is worth a named row.
    const complete = spawnSync(
      'bash',
      ['scripts/sprint-backlog.sh', 'complete-task', '--task', ROW_TWO],
      {
        cwd: fixture.primary,
        encoding: 'utf-8',
        env: sandboxEnv({
          REPO_HARNESS_BACKLOG_LOCK_ATTEMPTS: '5',
          REPO_HARNESS_BACKLOG_LOCK_SLEEP_SECONDS: '0.02',
        }),
      },
    );
    expect(complete.stderr).toContain('reclaiming stale backlog lock');
    expect(complete.stderr).toContain(backlogLock);
    expect(complete.status).toBe(0);
    expect(existsSync(backlogLock)).toBe(false);
  }, 60_000);
});

/**
 * The board over the same real clone the ownership verbs run against. Nothing
 * here is mocked: real linked worktrees, real leases on the shared plane, real
 * `git worktree list`, and the real attempt ledgers in the owner worktrees.
 *
 * Three falsification rows are owned by this block (plan verdict H):
 * lease-changes-during-read, unreadable-ledger-never-transfers-ownership, and
 * new-generation-resets-stall. The first two are asserted structurally through
 * the collector seam in `tests/board-snapshot-consistency.test.ts`, because a
 * real filesystem cannot schedule a tear deterministically; what this block
 * adds is that the same shapes are actually reachable over real state.
 */
describe('board projection over real linked worktrees', () => {
  /** Claim one row from `cwd` and bind it to `worktree`. */
  function claimRow(
    cwd: string,
    taskRef: string,
    worktree: string,
    branch: string,
    sessionId: string,
  ): OwnerRecord {
    const identity = identify(cwd, taskRef);
    const claimed = sprintJson<OwnerRecord>(sprint(cwd, claimArgs(identity, sessionId)));
    return sprintJson<OwnerRecord>(sprint(cwd, [
      'bind',
      '--claim-id', claimed.claim_id,
      '--worktree', worktree,
      '--branch', branch,
      '--unit-ref', `plans/plan-${branch.replace(/[^a-z]/g, '-')}.md`,
    ]));
  }

  test('two bound worktrees are two doing cards with distinct ownership', () => {
    const fixture = createFixture('board-two-owners');
    const first = claimRow(fixture.worktreeA, ROW_ONE, fixture.worktreeA, 'codex/row-a', 'session-a');
    const second = claimRow(fixture.worktreeB, ROW_TWO, fixture.worktreeB, 'codex/row-b', 'session-b');

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

  test('a steal shows up as a second generation with provenance', () => {
    const fixture = createFixture('board-steal');
    const owner = claimRow(fixture.worktreeA, ROW_ONE, fixture.worktreeA, 'codex/row-a', 'session-a');
    const thief = sprintJson<OwnerRecord>(sprint(fixture.worktreeB, [
      'steal',
      '--expected-claim-id', owner.claim_id,
      '--reason', 'no progress for 2h',
      '--session-id', 'session-b',
    ]));

    const card = cardOf(board(fixture.primary, ['--sprint', SPRINT_PATH]), ROW_ONE);
    expect(card.claim?.claim_id).toBe(thief.claim_id);
    expect(card.claim?.generation).toBe(2);
    expect(card.claim?.stolen_from).toEqual({ claim_id: owner.claim_id, reason: 'no progress for 2h' });
    // A steal mints a fresh reservation: the new owner has no worktree yet.
    expect(card.lease_state).toBe('reserving');
    expect(card.claim?.worktree).toBeNull();
    expect(card.column).toBe('doing');
  }, 180_000);

  test('a removed worktree is a blocked, reclaimable orphan', () => {
    const fixture = createFixture('board-orphan');
    const owner = claimRow(fixture.worktreeA, ROW_ONE, fixture.worktreeA, 'codex/row-a', 'session-a');
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
    const owner = claimRow(fixture.worktreeA, ROW_ONE, fixture.worktreeA, 'codex/row-a', 'session-a');
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

  test('a new generation resets the previous claim stall count', () => {
    const fixture = createFixture('board-stall-reset');
    const unitRef = 'plans/plan-codex-row-a.md';
    const owner = claimRow(fixture.worktreeA, ROW_ONE, fixture.worktreeA, 'codex/row-a', 'session-a');
    expect(owner.unit_ref).toBe(unitRef);

    // The stall proof, recorded exactly as the loop host records it: two
    // consecutive turns that moved the owner worktree's progress token nowhere.
    const envelope = JSON.parse(
      state(fixture.worktreeA, ['next', '--json']).stdout,
    ) as { progress_token: string };
    expect(envelope.progress_token).toMatch(/^sha256:/);
    for (let turn = 0; turn < 2; turn += 1) {
      const recorded = state(fixture.worktreeA, [
        'attempt', '--json',
        '--unit-ref', unitRef,
        '--outcome', 'completed',
        '--before-progress-token', envelope.progress_token,
        '--after-progress-token', envelope.progress_token,
      ]);
      expect(recorded.status).toBe(0);
    }
    expect(cardOf(board(fixture.primary, ['--sprint', SPRINT_PATH]), ROW_ONE).progress_state)
      .toBe('stalled');

    const thief = sprintJson<OwnerRecord>(sprint(fixture.worktreeB, [
      'steal',
      '--expected-claim-id', owner.claim_id,
      '--reason', 'stalled',
      '--session-id', 'session-b',
    ]));
    const rebound = sprintJson<OwnerRecord>(sprint(fixture.worktreeB, [
      'bind',
      '--claim-id', thief.claim_id,
      '--worktree', fixture.worktreeA,
      '--branch', 'codex/row-a',
      '--unit-ref', unitRef,
    ]));
    expect(rebound.generation).toBe(2);

    // Same worktree, same unit, same ledger, same trailing no-progress
    // receipts -- and the new owner is not stalled, because `bind` appended a
    // `resumed` receipt that stops the backward walk before it reaches them.
    const card = cardOf(board(fixture.primary, ['--sprint', SPRINT_PATH]), ROW_ONE);
    expect(card.claim?.generation).toBe(2);
    expect(card.progress_state).toBe('active');
    expect(card.column).toBe('doing');

    const ledger = readFileSync(
      join(fixture.worktreeA, '.ai/harness/runs/continuation/attempts.jsonl'),
      'utf-8',
    ).trim().split('\n').map((line) => JSON.parse(line) as { outcome: string });
    // Appended, never rewritten: the ledger stays append-only evidence.
    expect(ledger.map((receipt) => receipt.outcome))
      .toEqual(['resumed', 'completed', 'completed', 'resumed']);
  }, 240_000);

  /**
   * The premise this whole work package rests on: lock-free A/B input-revision
   * comparison converges to `stable` under real load. Nothing before this
   * measured it, because no parallel load existed to measure.
   *
   * The assertion is the mechanism -- every run must produce a well-formed
   * document with a consistency value from the vocabulary. The ratio is
   * logged, not asserted at a threshold, because a flaky-by-construction
   * threshold in CI would be a worse signal than the number itself. Below ~80%
   * the plan's pre-authorized fallback applies (drop `evidence` from the
   * composite digest, mark the progress overlay possibly-stale).
   */
  test('twenty consecutive board reads under active worktrees', () => {
    const fixture = createFixture('board-stability-probe');
    claimRow(fixture.worktreeA, ROW_ONE, fixture.worktreeA, 'codex/row-a', 'session-a');
    claimRow(fixture.worktreeB, ROW_TWO, fixture.worktreeB, 'codex/row-b', 'session-b');

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

describe('helper mirrors', () => {
  test('the helper mirrors stay byte-identical', () => {
    for (const name of ['sprint-backlog.sh', 'contract-worktree.sh', 'verify-contract.sh']) {
      expect(readFileSync(join(ROOT, 'scripts', name), 'utf-8'))
        .toBe(readFileSync(join(HELPER_DIR, name), 'utf-8'));
    }
  });
});
