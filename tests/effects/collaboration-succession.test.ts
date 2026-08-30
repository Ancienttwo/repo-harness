/**
 * C5 — the three-way separation, end to end.
 *
 * > `WorkStateHandoff` passes knowledge, `TaskFreezeReceiptV1` passes exact
 * > state, and the existing Lease lifecycle passes the right to execute.
 *
 * Each of the four scenarios below falsifies one way that sentence could be
 * false in code: a handoff that transfers execution, a freeze that does not bind
 * the state it claims, an adoption that grants a write path, and a read-only
 * succession that demands a takeover it has no use for.
 *
 * The delivery-plane digest is the load-bearing assertion. It hashes every byte
 * under the Git common directory's `repo-harness/` tree except the collaboration
 * store itself, so "the collaboration plane wrote nothing to the delivery plane"
 * is checked over the whole plane rather than over the two files a test author
 * happened to think of.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { buildWorkStateHandoff, type WorkStateHandoffV1 } from '../../src/core/collaboration/handoff';
import { CollaborationError } from '../../src/core/collaboration/common';
import { TaskFreezeError, type TaskFreezeReceiptV1 } from '../../src/core/engineers/task-freeze';
import {
  bindLeaseRecord,
  releaseLeaseRecord,
  stealLeaseRecord,
} from '../../src/core/state/coordination-identity';
import { adoptWorkStateHandoff } from '../../src/effects/collaboration/adoption-store';
import { engineerPrincipalAuthorization } from '../../src/effects/collaboration/actor';
import { publishWorkStateHandoff } from '../../src/effects/collaboration/handoff-store';
import {
  EXECUTION_AUTHORITY_LIFECYCLE,
  assertBoundTaskFrozenForSuccession,
  assertSuccessorExecutionAuthority,
  boundTaskExecutionContext,
  handoffSuccessionRequirement,
  publishBoundTaskSuccessionHandoff,
  resolveBoundTaskSuccession,
} from '../../src/effects/collaboration/succession';
import { assertNoLiveClaimForBindingRotation } from '../../src/effects/engineers/bound-task-rotation';
import { createTaskFreeze, inspectBoundTask } from '../../src/effects/engineers/task-freeze-store';
import { readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { listLeaseReads, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { admitCollaborationDelegation } from '../../src/effects/collaboration/admission-bridge';
import { collectCollaborationContribution } from '../../src/effects/collaboration/contribution-collector';
import { listWorkStateHandoffs } from '../../src/effects/collaboration/handoff-store';
import { dispatchDelegatedRun } from '../../src/effects/engineers/delegated-run-store';
import { COLLABORATION_PROTOCOL } from '../../src/core/collaboration/common';
import {
  CONTRIBUTION_OUTPUT_END,
  CONTRIBUTION_OUTPUT_START,
} from '../../src/effects/collaboration/provider-output-adapter';
import {
  createCollaborationDelegationFixture,
  delegationParticipant,
  liveParentFor,
  setWorkerStdout,
} from '../helpers/collaboration-delegation-fixture';
import {
  CONTRACT_ENGINEER,
  EVALS_ENGINEER,
  deliveryPlaneDigest,
  removeFixtureRoots,
} from '../helpers/collaboration-store-fixture';
import {
  SUCCESSION_TASK_ID,
  SUCCESSION_UNIT_REF,
  SUCCESSOR_CLAIM_ID,
  createCollaborationSuccessionFixture,
  publishClaimActorFor,
  readLeaseOwnerRecord,
  writeVerifiedChecks,
  type CollaborationSuccessionFixture,
} from '../helpers/collaboration-succession-fixture';

const sourceRoot = process.cwd();
const roots: string[] = [];

afterEach(() => removeFixtureRoots(roots));

const RECORDED = { kind: 'persisted_observation', observed_at: '2026-08-30T01:00:00.000Z' } as const;

function authorizationFor(fixture: CollaborationSuccessionFixture, engineerId: string) {
  return engineerPrincipalAuthorization(
    fixture.actors.find((actor) => actor.engineer_id === engineerId)!.authorization_id,
  );
}

/** The narrative payload every handoff below carries; only the binding differs. */
function knowledge() {
  return {
    thread_key: 'collaboration/succession',
    scope_refs: [{ kind: 'free_topic' as const, value: 'collaboration/succession' }],
    trigger: 'budget_low' as const,
    goal: 'Finish the succession integration for the bound task.',
    completed: ['derived the bound_task context from the freeze receipt'],
    key_findings: ['the freeze receipt is the only carrier of exact state'],
    attempted_paths: [
      {
        description: 'declare the execution context on the publish call',
        outcome: 'rejected: it lets a caller name a freeze that does not describe the record',
        evidence_refs: [],
      },
    ],
    dead_ends: ['reading the adoption store to decide who may write'],
    open_hypotheses: [],
    next_actions: ['acquire through the existing lifecycle, then read the freeze receipt'],
    source_signal_ids: [],
    supersedes_handoff_id: null,
  };
}

/** Make the bound worktree dirty and its verification evidence stale. */
function makeDirty(repoRoot: string): void {
  writeFileSync(join(repoRoot, 'README.md'), 'the executor was mid-edit when its budget ran out\n');
  writeFileSync(join(repoRoot, '.ai/harness/checks/latest.json'), '{"status":"fail"}\n');
}

function freezeDirtyExecutor(fixture: CollaborationSuccessionFixture): TaskFreezeReceiptV1 {
  makeDirty(fixture.repoRoot);
  const frozen = createTaskFreeze(fixture.repoRoot, fixture.executor_id, {
    now: () => '2026-08-30T00:30:00.000Z',
  });
  expect(frozen.disposition).toBe('freeze_required');
  expect(frozen.reasons).toEqual(['tracked_dirty', 'checks_unverified']);
  return frozen.receipt;
}

function publishSuccessionHandoff(
  fixture: CollaborationSuccessionFixture,
  receipt: TaskFreezeReceiptV1,
): WorkStateHandoffV1 {
  return publishBoundTaskSuccessionHandoff({
    repo_root: fixture.repoRoot,
    authorization: authorizationFor(fixture, fixture.executor_id),
    engineer_id: fixture.executor_id,
    freeze_receipt_sha256: receipt.receipt_sha256,
    idempotency_key: 'succession-1',
    ...knowledge(),
    recorded_time: RECORDED,
    destination: { kind: 'public' },
    env: fixture.env,
  }).handoff;
}

/**
 * The existing lifecycle, driven through its own record transitions: explicit
 * release, then a takeover that mints a new claim and bumps the generation, then
 * the successor's own Claim actor receipt. Nothing in `succession.ts` performs
 * any of this — that is the point. It is the delivery plane's, and the gate only
 * reads its outcome.
 */
function releaseAndTakeOver(fixture: CollaborationSuccessionFixture, successorId: string) {
  const released = releaseLeaseRecord(readLeaseOwnerRecord(fixture.repoRoot), fixture.claim_id);
  if (!released.ok) throw new Error(released.error);
  writeLeaseOwnerDurably(fixture.repoRoot, SUCCESSION_TASK_ID, released.record);

  const profile = loadEngineerProfile(fixture.repoRoot, successorId);
  const binding = readEngineerBindingStatus(fixture.repoRoot, successorId, profile.engineer_contract_revision).binding!;
  const stolen = stealLeaseRecord(released.record, {
    expectedClaimId: fixture.claim_id,
    reason: 'predecessor exhausted its budget and froze the bound task',
    newClaimId: SUCCESSOR_CLAIM_ID,
    sessionId: `engineer:${binding.binding_id}`,
    sourceWorktree: fixture.repoRoot,
  });
  if (!stolen.ok) throw new Error(stolen.error);
  const bound = bindLeaseRecord(stolen.record, {
    claimId: SUCCESSOR_CLAIM_ID,
    executionWorktree: fixture.repoRoot,
    branch: 'main',
    unitRef: SUCCESSION_UNIT_REF,
  });
  if (!bound.ok) throw new Error(bound.error);
  writeLeaseOwnerDurably(fixture.repoRoot, SUCCESSION_TASK_ID, bound.record);
  publishClaimActorFor(fixture, successorId, SUCCESSOR_CLAIM_ID, bound.record.generation, '2026-08-30T02:00:00.000Z');
  return bound.record;
}

describe('C5 bound executor succession', () => {
  test('a dirty executor must freeze before succession, and the handoff binds what it froze', () => {
    const fixture = createCollaborationSuccessionFixture(sourceRoot, roots);

    // A clean bound task needs no freeze: there is no divergent state to carry.
    expect(assertBoundTaskFrozenForSuccession(fixture.repoRoot, fixture.executor_id, null).freeze_receipt)
      .toBeNull();

    makeDirty(fixture.repoRoot);
    expect(() => assertBoundTaskFrozenForSuccession(fixture.repoRoot, fixture.executor_id, null))
      .toThrow('tracked_dirty, checks_unverified');

    const receipt = createTaskFreeze(fixture.repoRoot, fixture.executor_id, {
      now: () => '2026-08-30T00:30:00.000Z',
    }).receipt;
    // The receipt binds the actual worktree, not a description of it.
    expect(receipt.head_sha).toBe(execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: fixture.repoRoot,
      encoding: 'utf8',
    }).trim());
    expect(receipt.task.claim_id).toBe(fixture.claim_id);
    expect(receipt.task.lease_generation).toBe(1);

    const before = deliveryPlaneDigest(fixture.repoRoot);
    const leaseBefore = readFileSync(fixture.lease_path, 'utf8');
    const handoff = publishSuccessionHandoff(fixture, receipt);

    expect(handoff.execution_context).toEqual(boundTaskExecutionContext(receipt));
    expect(handoff.execution_context.kind).toBe('bound_task');
    // Publishing knowledge moved no delivery-plane byte and no Lease generation.
    expect(deliveryPlaneDigest(fixture.repoRoot)).toBe(before);
    expect(readFileSync(fixture.lease_path, 'utf8')).toBe(leaseBefore);
    expect(readLeaseOwnerRecord(fixture.repoRoot).generation).toBe(1);

    // Republishing the same identity converges instead of writing a second record.
    const republished = publishBoundTaskSuccessionHandoff({
      repo_root: fixture.repoRoot,
      authorization: authorizationFor(fixture, fixture.executor_id),
      engineer_id: fixture.executor_id,
      freeze_receipt_sha256: receipt.receipt_sha256,
      idempotency_key: 'succession-1',
      ...knowledge(),
      recorded_time: RECORDED,
      destination: { kind: 'public' },
      env: fixture.env,
    });
    expect(republished.created).toBe(false);
    expect(republished.handoff.handoff_sha256).toBe(handoff.handoff_sha256);
  });

  test('a stale freeze receipt cannot carry a succession, and the context is never caller-declared', () => {
    const fixture = createCollaborationSuccessionFixture(sourceRoot, roots);
    const receipt = freezeDirtyExecutor(fixture);

    // One more edit after the freeze, and the receipt no longer describes the
    // worktree it claims to.
    writeFileSync(join(fixture.repoRoot, 'README.md'), 'edited again after freezing\n');
    expect(() => publishSuccessionHandoff(fixture, receipt)).toThrow('freeze receipt is stale');
    expect(listWorkStateHandoffs(fixture.repoRoot)).toHaveLength(0);

    // `publishBoundTaskSuccessionHandoff` exposes no `execution_context`
    // parameter at all, which is what makes the mismatched record unexpressible
    // on this path rather than merely rejected.
    expect(Object.keys(knowledge())).not.toContain('execution_context');
  });

  test('the successor may write only after release, takeover and acquire', () => {
    const fixture = createCollaborationSuccessionFixture(sourceRoot, roots);
    const receipt = freezeDirtyExecutor(fixture);
    const handoff = publishSuccessionHandoff(fixture, receipt);

    // Before the lifecycle runs, the successor holds nothing, and reading the
    // handoff has not changed that.
    expect(() => assertSuccessorExecutionAuthority(fixture.repoRoot, handoff, EVALS_ENGINEER))
      .toThrow(EXECUTION_AUTHORITY_LIFECYCLE);
    // While the predecessor still holds the Claim, its Binding cannot rotate.
    expect(() => assertNoLiveClaimForBindingRotation(
      fixture.repoRoot,
      fixture.executor_id,
      fixture.claim_actor_receipt.binding_id,
    )).toThrow('inspect/freeze the bound task and release it explicitly');

    const taken = releaseAndTakeOver(fixture, EVALS_ENGINEER);
    expect(taken.generation).toBe(2);
    expect(taken.claim_id).toBe(SUCCESSOR_CLAIM_ID);

    const authority = assertSuccessorExecutionAuthority(fixture.repoRoot, handoff, EVALS_ENGINEER);
    expect(authority.live_lease_generation).toBe(2);
    expect(authority.frozen_lease_generation).toBe(1);
    // A takeover mints a new claim, so the successor is explicitly not continuing
    // the frozen one; the freeze describes a previous holder's worktree.
    expect(authority.continues_frozen_claim).toBe(false);

    // Only now does the pair reconstruct the predecessor's exact context.
    const state = resolveBoundTaskSuccession(fixture.repoRoot, handoff);
    expect(state.freeze_receipt).toEqual(receipt);
    expect(state.freeze_receipt.diff_sha256).toBe(receipt.diff_sha256);
    expect(state.freeze_receipt.untracked_inventory_sha256).toBe(receipt.untracked_inventory_sha256);
    expect(state.freeze_receipt.checks_state_sha256).toBe(receipt.checks_state_sha256);

    // The predecessor's Binding is free to rotate once the Claim has moved on.
    expect(() => assertNoLiveClaimForBindingRotation(
      fixture.repoRoot,
      fixture.executor_id,
      fixture.claim_actor_receipt.binding_id,
    )).not.toThrow();
  });

  test('adoption alone grants no write path', () => {
    const fixture = createCollaborationSuccessionFixture(sourceRoot, roots);
    const receipt = freezeDirtyExecutor(fixture);
    const handoff = publishSuccessionHandoff(fixture, receipt);

    const before = deliveryPlaneDigest(fixture.repoRoot);
    const adopted = adoptWorkStateHandoff({
      repo_root: fixture.repoRoot,
      authorization: authorizationFor(fixture, CONTRACT_ENGINEER),
      handoff_id: handoff.handoff_id,
      context_packet_sha256: `sha256:${'a'.repeat(64)}`,
      recorded_time: RECORDED,
      env: fixture.env,
    });
    expect(adopted.created).toBe(true);
    expect(adopted.receipt.handoff_sha256).toBe(handoff.handoff_sha256);
    // Adoption is a collaboration-plane record and nothing else.
    expect(deliveryPlaneDigest(fixture.repoRoot)).toBe(before);

    // The succession gate refuses the adopter...
    expect(() => assertSuccessorExecutionAuthority(fixture.repoRoot, handoff, CONTRACT_ENGINEER))
      .toThrow('adopting a handoff grants no write path');
    // ...and so does the delivery plane's own transition, on its own terms: the
    // adopter's claim is not the one the Lease names.
    const mismatch = releaseLeaseRecord(readLeaseOwnerRecord(fixture.repoRoot), SUCCESSOR_CLAIM_ID);
    expect(mismatch.ok).toBe(false);
    expect(readLeaseOwnerRecord(fixture.repoRoot).claim_id).toBe(fixture.claim_id);

    // A second, different adopter also succeeds: adoption stays non-exclusive
    // precisely because it confers nothing to be exclusive about.
    const second = adoptWorkStateHandoff({
      repo_root: fixture.repoRoot,
      authorization: authorizationFor(fixture, EVALS_ENGINEER),
      handoff_id: handoff.handoff_id,
      context_packet_sha256: `sha256:${'a'.repeat(64)}`,
      recorded_time: RECORDED,
      env: fixture.env,
    });
    expect(second.created).toBe(true);
    expect(second.receipt_id).not.toBe(adopted.receipt_id);
    expect(deliveryPlaneDigest(fixture.repoRoot)).toBe(before);
  });

  test('a bound_task context that does not resolve or does not match fails closed', () => {
    const fixture = createCollaborationSuccessionFixture(sourceRoot, roots);
    const receipt = freezeDirtyExecutor(fixture);
    const context = boundTaskExecutionContext(receipt) as Extract<
      ReturnType<typeof boundTaskExecutionContext>,
      { kind: 'bound_task' }
    >;

    const publishWith = (execution_context: typeof context, key: string) => publishWorkStateHandoff({
      repo_root: fixture.repoRoot,
      authorization: authorizationFor(fixture, fixture.executor_id),
      idempotency_key: key,
      ...knowledge(),
      execution_context,
      recorded_time: RECORDED,
      destination: { kind: 'public' },
      env: fixture.env,
    }).handoff;

    // Well-formed, persisted, and pointing at a receipt that does not exist.
    const unresolvable = publishWith(
      { ...context, task_freeze_receipt_sha256: `sha256:${'e'.repeat(64)}` },
      'unresolvable',
    );
    expect(() => resolveBoundTaskSuccession(fixture.repoRoot, unresolvable))
      .toThrow(new TaskFreezeError('task_freeze_state_unavailable', 'freeze receipt not found'));

    // Resolvable, and describing a different Claim than the receipt it names.
    const mismatched = publishWith(
      { ...context, claim_id: SUCCESSOR_CLAIM_ID },
      'mismatched',
    );
    expect(() => resolveBoundTaskSuccession(fixture.repoRoot, mismatched))
      .toThrow('does not match freeze receipt');

    // And a generation the receipt does not carry.
    const wrongGeneration = publishWith({ ...context, lease_generation: 9 }, 'wrong-generation');
    expect(() => resolveBoundTaskSuccession(fixture.repoRoot, wrongGeneration))
      .toThrow('does not match freeze receipt');

    // The honest one still resolves, so the three refusals above are the check
    // firing rather than the check being unsatisfiable.
    expect(resolveBoundTaskSuccession(fixture.repoRoot, publishWith(context, 'honest')).freeze_receipt)
      .toEqual(receipt);
  });

  test('TaskFreezeReceiptV1 elects no successor', () => {
    const fixture = createCollaborationSuccessionFixture(sourceRoot, roots);
    const receipt = freezeDirtyExecutor(fixture);
    for (const key of Object.keys(receipt)) {
      expect(key).not.toMatch(/success|handoff|adopt|next_|candidate/u);
    }
    // The only person named by the receipt is the holder that produced it.
    expect(receipt.engineer_id).toBe(fixture.executor_id);
    const contract = readFileSync(join(sourceRoot, 'src/core/engineers/task-freeze.ts'), 'utf8');
    expect(contract).not.toMatch(/successor/iu);
  });
});

describe('C5 read-only participant succession', () => {
  test('a read-only Worker handoff is knowledge only and needs no takeover', () => {
    const fixture = createCollaborationDelegationFixture(sourceRoot, roots);
    setWorkerStdout(fixture.repoRoot, [
      'Prose the collector ignores.',
      CONTRIBUTION_OUTPUT_START,
      JSON.stringify({
        protocol: COLLABORATION_PROTOCOL,
        kind: 'repo-harness-collaboration-contribution-draft',
        thread_key: 'collaboration/succession',
        signals: [],
        handoff: {
          trigger: 'budget_low',
          goal: 'Map the succession surface before the budget runs out.',
          completed: ['read src/effects/collaboration'],
          key_findings: ['the freeze receipt is the only exact-state carrier'],
          attempted_paths: [
            {
              description: 'look for a successor field on the freeze receipt',
              outcome: 'there is none; succession composes existing records',
              evidence_refs: [],
            },
          ],
          dead_ends: [],
          open_hypotheses: [],
          next_actions: ['continue from the recorded findings'],
          source_signal_ids: [],
          // A read-only participant holds no Claim, so there is no bound task to
          // name. This is the branch that makes the whole path takeover-free.
          execution_context: { kind: 'none' },
        },
        built_on_signal_ids: [],
      }, null, 2),
      CONTRIBUTION_OUTPUT_END,
      '',
    ].join('\n'));

    const participant = delegationParticipant(fixture, 0);
    const admitted = admitCollaborationDelegation({
      repo_root: fixture.repoRoot,
      round_index: 0,
      decided_at: '2026-08-30T00:00:02.000Z',
      idempotency_key: participant.idempotency_key,
      observed_at: '2026-08-30T00:00:03.000Z',
      delegation: {
        repo_root: fixture.repoRoot,
        envelope: participant.envelope,
        role_profile: fixture.role_profile,
        capability: fixture.capability,
        execution_packet: participant.packet,
        work_envelope: {} as never,
        claim_actor_receipt: fixture.claim_actor_receipt,
        decided_at: '2026-08-30T00:00:02.000Z',
        validate_parent: liveParentFor(fixture),
      },
    });
    const dispatchId = admitted.run!.intent.dispatch_id;
    expect(dispatchDelegatedRun({
      repo_root: fixture.repoRoot,
      dispatch_id: dispatchId,
      observed_at: '2026-08-30T00:00:04.000Z',
      protected_paths: [
        'common:.repo-harness-read-only-canary-common',
        'worktree:.repo-harness-read-only-canary-worktree',
      ],
    }).current.state).toBe('completed');

    collectCollaborationContribution({
      repo_root: fixture.repoRoot,
      dispatch_id: dispatchId,
      untrusted_claims: ['the run reports it finished its sweep'],
    });

    const handoffs = listWorkStateHandoffs(fixture.repoRoot);
    expect(handoffs).toHaveLength(1);
    const handoff = handoffs[0]!;
    expect(handoff.actor.kind).toBe('delegated_worker');
    expect(handoffSuccessionRequirement(handoff)).toEqual({ kind: 'knowledge_only' });

    // Nothing in the delivery plane ever became relevant: no Lease was taken and
    // no state was frozen, because the participant held neither.
    expect(listLeaseReads(fixture.repoRoot)).toHaveLength(0);
    expect(existsSync(join(
      resolveGitCommonDirectory(fixture.repoRoot),
      'repo-harness/engineers/v1/task-freezes',
    ))).toBe(false);

    // Both bound-task functions refuse it, by kind rather than by guess.
    expect(() => resolveBoundTaskSuccession(fixture.repoRoot, handoff))
      .toThrow('needs no bound task resolution');
    expect(() => assertSuccessorExecutionAuthority(fixture.repoRoot, handoff, fixture.engineer_id))
      .toThrow('needs no execution authority');

    // The succession completes with adoption alone.
    const before = deliveryPlaneDigest(fixture.repoRoot);
    const adopted = adoptWorkStateHandoff({
      repo_root: fixture.repoRoot,
      authorization: authorizationFor(fixture as never, EVALS_ENGINEER),
      handoff_id: handoff.handoff_id,
      context_packet_sha256: `sha256:${'b'.repeat(64)}`,
      recorded_time: RECORDED,
      env: fixture.env,
    });
    expect(adopted.created).toBe(true);
    expect(deliveryPlaneDigest(fixture.repoRoot)).toBe(before);
  });

  test('a delegated_worker execution context is knowledge only too', () => {
    const handoff = buildWorkStateHandoff({
      handoff_id: 'a'.repeat(64),
      repository_id: 'repo_0123456789abcdef',
      actor: {
        kind: 'module_engineer',
        engineer_id: EVALS_ENGINEER,
        binding_id: '11111111-1111-4111-8111-111111111111',
        binding_generation: 1,
        principal_mapping_sha256: `sha256:${'f'.repeat(64)}`,
      },
      thread_key: 'collaboration/succession',
      scope_refs: [{ kind: 'free_topic', value: 'collaboration/succession' }],
      trigger: 'context_pressure',
      goal: 'Hand the exploration to the next reader.',
      completed: [],
      key_findings: [],
      attempted_paths: [{ description: 'one path', outcome: 'exhausted the budget', evidence_refs: [] }],
      dead_ends: [],
      open_hypotheses: [],
      next_actions: ['continue the sweep'],
      source_signal_ids: [],
      execution_context: {
        kind: 'delegated_worker',
        worker_run_ref_sha256: `sha256:${'c'.repeat(64)}`,
        worker_result_sha256: `sha256:${'d'.repeat(64)}`,
      },
      supersedes_handoff_id: null,
      created_at: '2026-08-30T00:00:00.000Z',
    });
    expect(handoffSuccessionRequirement(handoff)).toEqual({ kind: 'knowledge_only' });
  });
});

describe('C5 succession invariants', () => {
  test('the module holds no delivery-plane writer and no second destination resolver', () => {
    // Comments are stripped first: the module's own docblock names the functions
    // it delegates to, and an assertion that cannot tell prose from a call site
    // would be satisfied by deleting a sentence.
    const code = readFileSync(join(sourceRoot, 'src/effects/collaboration/succession.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');
    // The delivery plane is read through its own readers and written through none.
    expect(code.match(/writeLeaseOwnerDurably\(|createLeaseDirectory\(|removeLease\(|publishClaimActorReceipt\(|persistTaskFreezeReceipt\(/u)).toBeNull();
    // C4 froze `authorizeCollaborationDestination()` as the single producer of
    // the value the stores accept; this module forwards a destination and
    // resolves none of its own.
    expect(code.match(/authorizeCollaborationDestination\(|collaborationDestinationPaths\(/u)).toBeNull();
    // Succession elects nobody.
    expect(code.match(/elect|choose_successor|assign_successor/u)).toBeNull();
  });

  test('an unfrozen clean task keeps its succession path open after re-verification', () => {
    const fixture = createCollaborationSuccessionFixture(sourceRoot, roots);
    makeDirty(fixture.repoRoot);
    expect(inspectBoundTask(fixture.repoRoot, fixture.executor_id).disposition).toBe('freeze_required');

    execFileSync('git', ['checkout', '--', 'README.md'], { cwd: fixture.repoRoot });
    writeVerifiedChecks(fixture.repoRoot);
    const gate = assertBoundTaskFrozenForSuccession(fixture.repoRoot, fixture.executor_id, null);
    expect(gate.freeze_receipt).toBeNull();
    expect(gate.inspection.disposition).toBe('clean_release_allowed');
  });

  test('a freeze receipt belonging to another Engineer is refused', () => {
    const fixture = createCollaborationSuccessionFixture(sourceRoot, roots);
    const receipt = freezeDirtyExecutor(fixture);
    expect(() => assertBoundTaskFrozenForSuccession(fixture.repoRoot, EVALS_ENGINEER, receipt.receipt_sha256))
      .toThrow(new TaskFreezeError('task_freeze_claim_missing', `engineer ${EVALS_ENGINEER} has no live Claim`));
  });

  test('the succession gate reports a typed collaboration error, not a bare throw', () => {
    const fixture = createCollaborationSuccessionFixture(sourceRoot, roots);
    const handoff = publishSuccessionHandoff(fixture, freezeDirtyExecutor(fixture));
    try {
      assertSuccessorExecutionAuthority(fixture.repoRoot, handoff, EVALS_ENGINEER);
      throw new Error('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(CollaborationError);
      expect((error as CollaborationError).code).toBe('collaboration_invalid');
    }
  });
});
