/**
 * C6 — context delivery and the dispatch fence.
 *
 * Acceptance for sprint row C6, delivery half: a packet built from the real
 * stores rebuilds byte-identically and carries `source_snapshot_sha256`, the
 * estimator version, truncation evidence and a canonical render digest; a
 * non-stable snapshot fails loud instead of producing one; the rendering
 * embedded in the dispatched goal is exactly the rendering the packet names; and
 * a collaboration-mode delegated run whose `CollaborationRunContextBindingV1` is
 * missing, dangling, or describes a different goal is refused dispatch.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { realpathSync, rmSync } from 'fs';

import {
  COLLABORATION_CONTEXT_END,
  COLLABORATION_CONTEXT_START,
  COLLABORATION_ESTIMATOR_VERSION,
} from '../../src/core/collaboration/context-packet';
import { collaborationSha256 } from '../../src/core/collaboration/common';
import {
  buildCollaborationRunContextBinding,
  checkCollaborationRunContextBinding,
  composeCollaborationGoal,
  decomposeCollaborationGoal,
} from '../../src/core/collaboration/run-binding';
import { engineerPrincipalAuthorization } from '../../src/effects/collaboration/actor';
import { admitCollaborationDelegation } from '../../src/effects/collaboration/admission-bridge';
import {
  CollaborationRunContextBindingRefused,
  assertCollaborationDispatchBinding,
  contextPacketStorePaths,
  deliverCollaborationContext,
  readCollaborationRunContextBinding,
  recordCollaborationRunContextBinding,
  type CollaborationContextDeliveryV1,
} from '../../src/effects/collaboration/context-delivery';
import { publishCoordinationSignal } from '../../src/effects/collaboration/signal-store';
import { collaborationRecordPath } from '../../src/effects/collaboration/record-store';
import { collectCollaborativeWorkExchange } from '../../src/effects/collaboration/work-exchange';
import {
  createCollaborationDelegationFixture,
  delegationParticipant,
  liveParentFor,
  setWorkerStdout,
  type CollaborationDelegationFixture as Fixture,
} from '../helpers/collaboration-delegation-fixture';
import { removeFixtureRoots } from '../helpers/collaboration-store-fixture';

const sourceRoot = process.cwd();
const roots: string[] = [];
const CAPABILITY = 'capability.runtime-harness.collaboration';
const BASE_GOAL = 'Explain why the fourth writer never observes the published token.';

afterEach(() => removeFixtureRoots(roots));

function fixture(mode: string | null = 'shadow'): Fixture {
  const value = createCollaborationDelegationFixture(sourceRoot, roots, mode);
  setWorkerStdout(value.repoRoot, 'worker prose\n');
  return value;
}

function publishSignal(value: Fixture, key: string, threadKey: string): string {
  return publishCoordinationSignal({
    repo_root: value.repoRoot,
    authorization: engineerPrincipalAuthorization(value.actors[0]!.authorization_id),
    destination: { kind: 'public' },
    idempotency_key: key,
    thread_key: threadKey,
    reply_to_signal_id: null,
    scope_refs: [{ kind: 'capability', capability_id: CAPABILITY, capability_revision: `sha256:${'7'.repeat(64)}` }],
    labels: ['NEED-REPRO'],
    title: `observation ${key}`,
    body: `body for ${key}`,
    artifact_refs: [],
    source_signal_ids: [],
    supersedes_signal_id: null,
    recorded_time: { kind: 'persisted_observation', observed_at: '2026-08-30T09:00:00.000Z' },
    env: value.env,
  }).signal.signal_id;
}

function collect(value: Fixture) {
  return collectCollaborativeWorkExchange({
    repo_root: value.repoRoot,
    read_execution_offers: () => [],
  });
}

function deliver(value: Fixture, baseGoal = BASE_GOAL): CollaborationContextDeliveryV1 {
  return deliverCollaborationContext({
    repo_root: value.repoRoot,
    collection: collect(value),
    subject_refs: [{ kind: 'capability', capability_id: CAPABILITY, capability_revision: `sha256:${'7'.repeat(64)}` }],
    base_goal: baseGoal,
  });
}

/** Admit and prepare one real seat whose envelope carries `goal`. */
function admit(value: Fixture, index: number, goal: string): string {
  const participant = delegationParticipant(value, index, goal);
  const result = admitCollaborationDelegation({
    repo_root: value.repoRoot,
    round_index: 0,
    decided_at: '2026-08-30T00:00:02.000Z',
    idempotency_key: participant.idempotency_key,
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
  if (result.run === null) {
    throw new Error(`fixture seat was refused: ${result.admission.rejection_reason ?? 'unknown'}`);
  }
  return result.run.intent.dispatch_id;
}

function refusalOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof CollaborationRunContextBindingRefused) return error.refusal;
    throw error;
  }
  throw new Error('expected a binding refusal');
}

describe('C6 collaboration context delivery', () => {
  test('a packet built from the real stores rebuilds byte-identically', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    publishSignal(value, 'signal-b', 'archctx-drain');

    const first = deliver(value);
    const second = deliver(value);

    expect(first.packet.packet_sha256).toBe(second.packet.packet_sha256);
    expect(first.rendered_context).toBe(second.rendered_context);
    expect(first.composed_goal).toBe(second.composed_goal);
    // The evidence the row names, each present on the record itself.
    expect(first.packet.source_snapshot_sha256).toBe(collect(value).snapshot.source_snapshot_sha256);
    expect(first.packet.estimator_version).toBe(COLLABORATION_ESTIMATOR_VERSION);
    expect(first.packet.budget_estimated_tokens).toBeGreaterThan(0);
    expect(first.packet.truncated).toBe(first.packet.omitted_signal_count > 0);
    expect(first.packet.rendered_context_sha256).toBe(collaborationSha256(first.rendered_context));
    expect(first.packet.snapshot_consistency).toBe('stable');
  });

  test('the goal carries the untrusted block and splits back into exactly its two parts', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');

    const delivery = deliver(value);

    expect(delivery.composed_goal.startsWith(BASE_GOAL)).toBe(true);
    expect(delivery.rendered_context.startsWith(`${COLLABORATION_CONTEXT_START}\n`)).toBe(true);
    expect(delivery.composed_goal.endsWith(`\n${COLLABORATION_CONTEXT_END}`)).toBe(true);
    const parts = decomposeCollaborationGoal(delivery.composed_goal);
    expect(parts.base_goal).toBe(BASE_GOAL);
    expect(parts.rendered_context).toBe(delivery.rendered_context);
    expect(collaborationSha256(parts.base_goal)).toBe(delivery.base_goal_sha256);
  });

  test('a base goal that already carries the markers is refused', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const rendered = deliver(value).rendered_context;

    expect(() => composeCollaborationGoal(`${BASE_GOAL} ${COLLABORATION_CONTEXT_START}`, rendered))
      .toThrow('already carries the untrusted coordination markers');
  });

  test('a non-stable snapshot fails loud instead of producing a packet', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const collection = collect(value);

    expect(() => deliverCollaborationContext({
      repo_root: value.repoRoot,
      collection: { ...collection, snapshot_consistency: 'changed_during_read' },
      subject_refs: [{ kind: 'capability', capability_id: CAPABILITY, capability_revision: `sha256:${'7'.repeat(64)}` }],
      base_goal: BASE_GOAL,
    })).toThrow('cannot be delivered from a changed_during_read snapshot');

    expect(() => deliverCollaborationContext({
      repo_root: value.repoRoot,
      collection: { ...collection, snapshot_consistency: 'degraded', degraded_sources: ['handoffs'] },
      subject_refs: [{ kind: 'capability', capability_id: CAPABILITY, capability_revision: `sha256:${'7'.repeat(64)}` }],
      base_goal: BASE_GOAL,
    })).toThrow('degraded: handoffs');
  });
});

describe('C6 collaboration run context binding fence', () => {
  test('a recorded binding names the run, the packet and the goal that was dispatched', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);

    const binding = recordCollaborationRunContextBinding({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      delivery,
    });

    expect(binding.dispatch_id).toBe(dispatchId);
    expect(binding.collaboration_context_packet_sha256).toBe(delivery.packet.packet_sha256);
    expect(binding.rendered_context_sha256).toBe(delivery.packet.rendered_context_sha256);
    expect(binding.composed_goal_sha256).toBe(delivery.composed_goal_sha256);
    expect(binding.base_goal_sha256).toBe(delivery.base_goal_sha256);
    // The frozen D2 semantics: the run's own `context_packet_sha256` is the
    // ExecutionPacket digest, and the binding records it as such.
    expect(binding.execution_packet_sha256).not.toBe(delivery.packet.packet_sha256);
    expect(readCollaborationRunContextBinding(value.repoRoot, dispatchId)).toEqual(binding);
    // Recording twice converges rather than conflicting.
    expect(recordCollaborationRunContextBinding({ repo_root: value.repoRoot, dispatch_id: dispatchId, delivery }))
      .toEqual(binding);
    expect(assertCollaborationDispatchBinding({ repo_root: value.repoRoot, dispatch_id: dispatchId }))
      .toEqual(binding);
  });

  test('a run with no binding is refused dispatch', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);

    expect(readCollaborationRunContextBinding(value.repoRoot, dispatchId)).toBeNull();
    expect(refusalOf(() => assertCollaborationDispatchBinding({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
    }))).toBe('binding_missing');
  });

  test('a binding whose packet no longer resolves is refused dispatch', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);
    recordCollaborationRunContextBinding({ repo_root: value.repoRoot, dispatch_id: dispatchId, delivery });

    // The binding still reads as provenance and now evidences nothing.
    rmSync(collaborationRecordPath(
      contextPacketStorePaths(value.repoRoot),
      delivery.packet.packet_sha256.slice('sha256:'.length),
      'packet_sha256',
    ));

    expect(refusalOf(() => assertCollaborationDispatchBinding({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
    }))).toBe('binding_context_packet_unresolvable');
  });

  test('a binding is never persisted for a run carrying a different goal', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivered = deliver(value);
    const other = deliver(value, 'A different base goal entirely.');
    // The seat is admitted with the second delivery's goal; the caller then tries
    // to bind the first, which is the drift the fence exists for.
    const dispatchId = admit(value, 0, other.composed_goal);

    expect(refusalOf(() => recordCollaborationRunContextBinding({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      delivery: delivered,
    }))).toBe('binding_composed_goal_stale');
    expect(readCollaborationRunContextBinding(value.repoRoot, dispatchId)).toBeNull();
    // And with nothing persisted, the fence refuses the dispatch outright.
    expect(refusalOf(() => assertCollaborationDispatchBinding({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
    }))).toBe('binding_missing');
  });

  test('a run whose goal was never composed is refused', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    // An envelope carrying the bare base goal: no untrusted block was ever
    // embedded, so no binding can honestly say one was.
    const dispatchId = admit(value, 1, BASE_GOAL);

    expect(refusalOf(() => recordCollaborationRunContextBinding({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      delivery,
    }))).toBe('binding_composed_goal_stale');
  });

  test('a binding naming an uncomposed goal is refused, reachable only from forged state', () => {
    // `binding_goal_not_composed` cannot be produced through the honest path:
    // `deliverCollaborationContext()` always composes, so a binding whose
    // `composed_goal_sha256` matches an uncomposed goal is a record no producer
    // in this repository writes. The refusal exists for a hand-written or
    // corrupted binding, so it is exercised against exactly that — driving the
    // pure check directly rather than through a store the producer guards.
    const plainGoal = 'A goal that was never composed with a coordination block.';
    const renderedDigest = `sha256:${'d'.repeat(64)}`;
    const binding = buildCollaborationRunContextBinding({
      dispatch_id: `sha256:${'1'.repeat(64)}`,
      delegated_run_intent_sha256: `sha256:${'2'.repeat(64)}`,
      execution_packet_sha256: `sha256:${'3'.repeat(64)}`,
      collaboration_context_packet_sha256: `sha256:${'4'.repeat(64)}`,
      rendered_context_sha256: renderedDigest,
      base_goal_sha256: `sha256:${'5'.repeat(64)}`,
      composed_goal_sha256: collaborationSha256(plainGoal),
    });

    // Every earlier check passes, so control actually reaches the decomposition.
    expect(checkCollaborationRunContextBinding(binding, {
      dispatch_id: binding.dispatch_id,
      delegated_run_intent_sha256: binding.delegated_run_intent_sha256,
      execution_packet_sha256: binding.execution_packet_sha256,
      composed_goal: plainGoal,
      context_packet_rendered_context_sha256: renderedDigest,
    })).toBe('binding_goal_not_composed');

    // And the ordering is what makes it unreachable honestly: give the same
    // binding a goal it does not digest to, and the composed-goal check fires
    // first.
    expect(checkCollaborationRunContextBinding(binding, {
      dispatch_id: binding.dispatch_id,
      delegated_run_intent_sha256: binding.delegated_run_intent_sha256,
      execution_packet_sha256: binding.execution_packet_sha256,
      composed_goal: `${plainGoal} altered`,
      context_packet_rendered_context_sha256: renderedDigest,
    })).toBe('binding_composed_goal_stale');
  });

  test('the binding store keeps one record per dispatch', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);
    recordCollaborationRunContextBinding({ repo_root: value.repoRoot, dispatch_id: dispatchId, delivery });

    const stored = readCollaborationRunContextBinding(realpathSync(value.repoRoot), dispatchId)!;

    expect(stored.dispatch_id).toBe(dispatchId);
    expect(stored.binding_sha256).toBe(
      recordCollaborationRunContextBinding({
        repo_root: value.repoRoot,
        dispatch_id: dispatchId,
        delivery,
      }).binding_sha256,
    );
  });
});
