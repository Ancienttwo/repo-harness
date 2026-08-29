/**
 * C4's real runtime admission canary and the D6 decision table under real
 * runtime conditions.
 *
 * This row owns the canary exclusively. C0 froze the table and recorded, in D7,
 * a negative proof that nothing enforced `max_parallel_readers` at admission
 * time; C1 to C3 asserted nothing about runtime rejection. So the assertions
 * below are the first place in the program where a fourth participant is
 * actually refused, and they are deliberately made against separate operating
 * system processes rather than against three calls in one event loop.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  admitCollaborationDelegation,
} from '../../src/effects/collaboration/admission-bridge';
import {
  dispatchDelegatedRun,
  readDelegatedRunStatus,
} from '../../src/effects/engineers/delegated-run-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import {
  createCollaborationDelegationFixture,
  delegationParticipant,
  liveParentFor,
  failNextWorkerRun,
  setWorkerStdout,
  type CollaborationDelegationFixture,
} from '../helpers/collaboration-delegation-fixture';
import { removeFixtureRoots } from '../helpers/collaboration-store-fixture';

const sourceRoot = process.cwd();
const roots: string[] = [];

afterEach(() => removeFixtureRoots(roots));

function fixture(mode: string | null = 'shadow'): CollaborationDelegationFixture {
  const value = createCollaborationDelegationFixture(sourceRoot, roots, mode);
  setWorkerStdout(value.repoRoot, 'worker prose\n');
  return value;
}

function admit(
  value: CollaborationDelegationFixture,
  index: number,
  roundIndex = 0,
) {
  const participant = delegationParticipant(value, index);
  return admitCollaborationDelegation({
    repo_root: value.repoRoot,
    round_index: roundIndex,
    decided_at: '2026-08-30T00:00:02.000Z',
    idempotency_key: `${participant.idempotency_key}-r${roundIndex}`,
    observed_at: '2026-08-30T00:00:03.000Z',
    delegation: {
      repo_root: value.repoRoot,
      envelope: participant.envelope,
      role_profile: value.role_profile,
      capability: value.capability,
      execution_packet: participant.packet,
      work_envelope: {} as never,
      claim_actor_receipt: value.claim_actor_receipt,
      decided_at: '2026-08-30T00:00:02.000Z',
      validate_parent: liveParentFor(value),
    },
  });
}

/** Drive one admitted seat to a terminal state through the real dispatch path. */
function finishRun(value: CollaborationDelegationFixture, dispatchId: string): string {
  const status = dispatchDelegatedRun({
    repo_root: value.repoRoot,
    dispatch_id: dispatchId,
    observed_at: '2026-08-30T00:00:04.000Z',
    protected_paths: [
      'common:.repo-harness-read-only-canary-common',
      'worktree:.repo-harness-read-only-canary-worktree',
    ],
  });
  return status.current.state;
}

describe('C4 real runtime admission canary', () => {
  test(
    'three real parallel readers are admitted and a fourth real request is rejected at max_parallel_readers=3',
    async () => {
      const value = fixture();
      expect(value.claim_actor_receipt.claim_id).toBeTruthy();
      // The limit is the parent Profile's own declared value, not a constant in
      // this test. D6 froze the table at 3 because that is what the shipped
      // Engineer Profiles declare.
      const inputsPath = join(value.repoRoot, '.canary-inputs.json');
      writeFileSync(inputsPath, `${JSON.stringify({
        capability: value.capability,
        claim_actor_receipt: value.claim_actor_receipt,
        round_index: 0,
      })}\n`);

      const run = (index: number): Record<string, unknown> => JSON.parse(execFileSync(
        process.execPath,
        [join(sourceRoot, 'tests/helpers/collaboration-admission-runner.ts'), value.repoRoot, inputsPath, String(index)],
        { cwd: sourceRoot, encoding: 'utf8', env: { ...value.env } },
      ).trim());

      // Three real processes, launched together, contending for the same on-disk
      // lock. `execFileSync` would serialize them by construction, so they are
      // spawned concurrently and joined afterwards.
      const children = [0, 1, 2].map((index) => Bun.spawn({
        cmd: [
          process.execPath,
          join(sourceRoot, 'tests/helpers/collaboration-admission-runner.ts'),
          value.repoRoot,
          inputsPath,
          String(index),
        ],
        cwd: sourceRoot,
        env: { ...value.env },
        stdout: 'pipe',
        stderr: 'pipe',
      }));
      const joined: Record<string, unknown>[] = [];
      for (const child of children) {
        const [out, err] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        const code = await child.exited;
        if (code !== 0) throw new Error(`parallel admission child failed (${code}): ${err}`);
        joined.push(JSON.parse(out.trim()) as Record<string, unknown>);
      }
      expect(joined).toHaveLength(3);
      for (const outcome of joined) {
        expect(outcome.decision).toBe('admitted');
        expect(outcome.delegation_decision).toBe('admitted');
        expect(outcome.run_state).toBe('intent_persisted');
      }
      // Three distinct processes, three distinct seats.
      expect(new Set(joined.map((outcome) => outcome.pid)).size).toBe(3);
      expect(new Set(joined.map((outcome) => outcome.dispatch_id)).size).toBe(3);
      // The seat counts observed inside the lock are 0, 1 and 2 in some order:
      // proof that the three requests really serialized on it rather than each
      // observing an empty window.
      expect([...joined.map((outcome) => outcome.observed_active_readers)].sort())
        .toEqual([0, 1, 2]);

      const fourth = run(3);
      expect(fourth.decision).toBe('rejected');
      expect(fourth.rejection_reason).toBe('max_parallel_readers_exceeded');
      expect(fourth.observed_active_readers).toBe(3);
      // Fail closed: no admission receipt, therefore no seat and nothing
      // `prepareDelegatedRun()` could consume.
      expect(fourth.delegation_decision).toBeNull();
      expect(fourth.dispatch_id).toBeNull();
    },
    120_000,
  );

  test('a completed reader releases its seat and the next request is admitted (D6 A8)', () => {
    const value = fixture();
    const seats = [0, 1, 2].map((index) => admit(value, index));
    for (const seat of seats) expect(seat.admission.decision).toBe('admitted');
    expect(admit(value, 3).admission.rejection_reason).toBe('max_parallel_readers_exceeded');

    expect(finishRun(value, seats[0].run!.intent.dispatch_id)).toBe('completed');
    const afterRelease = admit(value, 3);
    expect(afterRelease.admission.decision).toBe('admitted');
    expect(afterRelease.admission.observed_active_readers).toBe(2);
  }, 120_000);

  test('a failed reader releases its seat too (D6 A9)', () => {
    const value = fixture();
    const seats = [0, 1, 2].map((index) => admit(value, index));
    // Make the provider fail: the run reaches `failed`, which is terminal and
    // releases the seat exactly as `completed` does.
    failNextWorkerRun(value.repoRoot);
    expect(finishRun(value, seats[0].run!.intent.dispatch_id)).toBe('failed');
    const afterRelease = admit(value, 3);
    expect(afterRelease.admission.decision).toBe('admitted');
    expect(afterRelease.admission.observed_active_readers).toBe(2);
  }, 120_000);

  test('a reconciliation_required reader fails the window closed (D6 A7)', () => {
    const value = fixture();
    const seats = [0, 1].map((index) => admit(value, index));
    // The real path into `reconciliation_required`: a Host that dies after
    // persisting its launch claim, then a retry. The retry finds a claim it did
    // not resolve and refuses to act, which is the state whose outcome nobody
    // can establish.
    finishRun(value, seats[0].run!.intent.dispatch_id);
    const protectedPaths = [
      'common:.repo-harness-read-only-canary-common',
      'worktree:.repo-harness-read-only-canary-worktree',
    ];
    expect(() => dispatchDelegatedRun({
      repo_root: value.repoRoot,
      dispatch_id: seats[1].run!.intent.dispatch_id,
      observed_at: '2026-08-30T00:00:05.000Z',
      protected_paths: protectedPaths,
      crash_hook: (boundary) => {
        if (boundary === 'after_launch_claim_persisted') throw new Error('injected host crash');
      },
    })).toThrow('injected host crash');
    const reconciling = dispatchDelegatedRun({
      repo_root: value.repoRoot,
      dispatch_id: seats[1].run!.intent.dispatch_id,
      observed_at: '2026-08-30T00:00:06.000Z',
      protected_paths: protectedPaths,
    });
    expect(reconciling.current.state).toBe('reconciliation_required');
    expect(readDelegatedRunStatus(value.repoRoot, seats[1].run!.intent.dispatch_id).current.state)
      .toBe('reconciliation_required');

    // One unresolved reader refuses the whole window, even though only one of
    // three seats is held. A seat is never inferred free.
    const refused = admit(value, 2);
    expect(refused.admission.decision).toBe('rejected');
    expect(refused.admission.rejection_reason).toBe('reader_reconciliation_required');
    expect(refused.delegation).toBeNull();
    expect(refused.run).toBeNull();
  }, 120_000);

  test('an unreadable delegated run fails closed rather than counting as an empty window (D6 A6)', () => {
    const value = fixture();
    expect(admit(value, 0).admission.decision).toBe('admitted');
    // A file in the pointer shard the bridge cannot account for. Skipping it is
    // how an unreadable store degrades into a smaller, healthier-looking count.
    writeFileSync(
      join(resolveGitCommonDirectory(value.repoRoot), 'repo-harness/delegated-runs/v1/current/not-a-dispatch.json'),
      '{}\n',
    );
    const refused = admit(value, 1);
    expect(refused.admission.decision).toBe('rejected');
    expect(refused.admission.rejection_reason).toBe('reader_state_unreadable');
    expect(refused.run).toBeNull();
  }, 120_000);

  test('a corrupt observation pointer is stale rather than unknown (D6 A5)', () => {
    const value = fixture();
    const seat = admit(value, 0);
    const pointer = join(
      resolveGitCommonDirectory(value.repoRoot),
      'repo-harness/delegated-runs/v1/current',
      `${seat.run!.intent.dispatch_id.slice('sha256:'.length)}.json`,
    );
    // Replace one run's pointer with another run's observation: every file is
    // individually readable and canonical, and the join is what disagrees.
    const other = admit(value, 1);
    const otherPointer = join(
      resolveGitCommonDirectory(value.repoRoot),
      'repo-harness/delegated-runs/v1/current',
      `${other.run!.intent.dispatch_id.slice('sha256:'.length)}.json`,
    );
    writeFileSync(pointer, readFileSync(otherPointer, 'utf8'));
    const refused = admit(value, 2);
    expect(refused.admission.decision).toBe('rejected');
    expect(refused.admission.rejection_reason).toBe('reader_observation_stale');
  }, 120_000);
});

describe('C4 admission authorization limb', () => {
  test('a role outside the parent Profile allowed_roles is refused before any counting', () => {
    const value = fixture();
    const participant = delegationParticipant(value, 0);
    const rejected = admitCollaborationDelegation({
      repo_root: value.repoRoot,
      round_index: 0,
      decided_at: '2026-08-30T00:00:02.000Z',
      idempotency_key: 'unauthorized-role',
      observed_at: '2026-08-30T00:00:03.000Z',
      delegation: {
        repo_root: value.repoRoot,
        // `deep-reasoner` is a tracked read-only profile in this repository, so
        // the refusal cannot come from the profile being missing: it comes from
        // the Profile's own `allowed_roles`, which is the point.
        envelope: { ...participant.envelope, logical_role: 'deep-reasoner' } as never,
        role_profile: value.role_profile,
        capability: value.capability,
        execution_packet: participant.packet,
        work_envelope: {} as never,
        claim_actor_receipt: value.claim_actor_receipt,
        decided_at: '2026-08-30T00:00:02.000Z',
        validate_parent: liveParentFor(value),
      },
    });
    expect(rejected.admission.decision).toBe('rejected');
    expect(rejected.admission.rejection_reason).toBe('role_not_allowed');
    expect(rejected.delegation).toBeNull();
  }, 120_000);

  test('an untracked logical Role Profile is refused: an open role string is not authorization', () => {
    const value = fixture();
    // Built while the profile still exists, so the refusal below is the bridge's
    // and not the packet builder's.
    const participant = delegationParticipant(value, 0);
    rmSync(join(value.repoRoot, '.codex/agents/explorer.toml'));
    const refused = admitCollaborationDelegation({
      repo_root: value.repoRoot,
      round_index: 0,
      decided_at: '2026-08-30T00:00:02.000Z',
      idempotency_key: 'untracked-role',
      observed_at: '2026-08-30T00:00:03.000Z',
      delegation: {
        repo_root: value.repoRoot,
        envelope: participant.envelope,
        role_profile: value.role_profile,
        capability: value.capability,
        execution_packet: participant.packet,
        work_envelope: {} as never,
        claim_actor_receipt: value.claim_actor_receipt,
        decided_at: '2026-08-30T00:00:02.000Z',
        validate_parent: liveParentFor(value),
      },
    });
    expect(refused.admission.decision).toBe('rejected');
    expect(refused.admission.rejection_reason).toBe('role_profile_unavailable');
    expect(refused.delegation).toBeNull();
    expect(refused.run).toBeNull();
  }, 120_000);

  test('a parent whose live Binding no longer matches the receipt is refused', () => {
    const value = fixture();
    const participant = delegationParticipant(value, 0);
    const refused = admitCollaborationDelegation({
      repo_root: value.repoRoot,
      round_index: 0,
      decided_at: '2026-08-30T00:00:02.000Z',
      idempotency_key: 'stale-parent',
      observed_at: '2026-08-30T00:00:03.000Z',
      delegation: {
        repo_root: value.repoRoot,
        envelope: participant.envelope,
        role_profile: value.role_profile,
        capability: value.capability,
        execution_packet: participant.packet,
        work_envelope: {} as never,
        claim_actor_receipt: { ...value.claim_actor_receipt, binding_generation: 9 },
        decided_at: '2026-08-30T00:00:02.000Z',
        validate_parent: liveParentFor(value),
      },
    });
    expect(refused.admission.decision).toBe('rejected');
    expect(refused.admission.rejection_reason).toBe('parent_authority_stale');
  }, 120_000);

  test('the bridge refuses every request while collaboration.mode is off', () => {
    const value = fixture(null);
    expect(() => admit(value, 0)).toThrow('collaboration mutation is disabled');
  }, 120_000);
});

describe('C4 admission window scoping', () => {
  test('the counting window is the parent claim plus the round index', () => {
    const value = fixture();
    for (const index of [0, 1, 2]) expect(admit(value, index, 0).admission.decision).toBe('admitted');
    expect(admit(value, 3, 0).admission.rejection_reason).toBe('max_parallel_readers_exceeded');
    // A different round is a different window, so the same three participants
    // are admitted again. This is what makes multi-round accumulation possible
    // without relaxing `max_turns`, which stays pinned at 1.
    const nextRound = admit(value, 0, 1);
    expect(nextRound.admission.decision).toBe('admitted');
    expect(nextRound.admission.observed_active_readers).toBe(0);
    expect(nextRound.run!.intent.round_index).toBe(1);
  }, 120_000);

  test('D7 stays true of the file it names: the existing admission still ignores delegation_policy', () => {
    const admissionSource = readFileSync('src/effects/engineers/delegated-run-store.ts', 'utf8');
    for (const token of ['delegation_policy', 'allowed_roles', 'max_parallel_readers']) {
      expect(admissionSource).not.toContain(token);
    }
    // And the enforcement really is somewhere: the bridge is where.
    const bridgeSource = readFileSync('src/effects/collaboration/admission-bridge.ts', 'utf8');
    expect(bridgeSource).toContain('max_parallel_readers');
    expect(bridgeSource).toContain('allowed_roles');
  });
});
