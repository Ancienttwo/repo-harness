/**
 * Issue #278 — the collaboration fence belongs to the dispatch effect.
 *
 * C6 wired the fence as a pre-step in front of `dispatchDelegatedRun()` and C7
 * gave that pre-step its first production call site in the delegation CLI. This
 * file states the property the pre-step shape could not: *the effect itself*
 * refuses a collaboration run that no live binding accounts for, so a caller
 * that never heard of the collaboration plane — agent task automation, an MCP
 * surface, a future scheduler — cannot reach the Codex host action by simply
 * forgetting a step.
 *
 * Every case here calls `dispatchDelegatedRun()` directly. "Before the host
 * action" is asserted from Host-owned state rather than from the thrown error:
 * the seat must still be exactly where `prepareDelegatedRun()` left it, and the
 * launch-claim store — the one record that must exist before any Codex process
 * may start — must still be empty.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

import { engineerPrincipalAuthorization } from '../../src/effects/collaboration/actor';
import { admitCollaborationDelegation } from '../../src/effects/collaboration/admission-bridge';
import {
  CollaborationRunContextBindingRefused,
  contextPacketStorePaths,
  deliverCollaborationContext,
  readCollaborationRunContextBinding,
  recordCollaborationRunContextBinding,
  type CollaborationContextDeliveryV1,
} from '../../src/effects/collaboration/context-delivery';
import { collaborationRecordPath } from '../../src/effects/collaboration/record-store';
import { publishCoordinationSignal } from '../../src/effects/collaboration/signal-store';
import { collectCollaborativeWorkExchange } from '../../src/effects/collaboration/work-exchange';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import {
  DELEGATED_RUN_STORE_RELATIVE_ROOT,
  dispatchDelegatedRun,
  readDelegatedRunStatus,
} from '../../src/effects/engineers/delegated-run-store';
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
const CAPABILITY_REF = {
  kind: 'capability',
  capability_id: CAPABILITY,
  capability_revision: `sha256:${'7'.repeat(64)}`,
} as const;
const BASE_GOAL = 'Explain why the fourth writer never observes the published token.';
const PROTECTED_PATHS = [
  'common:.repo-harness-read-only-canary-common',
  'worktree:.repo-harness-read-only-canary-worktree',
];

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
    scope_refs: [CAPABILITY_REF],
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

function deliver(value: Fixture, baseGoal = BASE_GOAL): CollaborationContextDeliveryV1 {
  return deliverCollaborationContext({
    repo_root: value.repoRoot,
    collection: collectCollaborativeWorkExchange({
      repo_root: value.repoRoot,
      read_execution_offers: () => [],
    }),
    subject_refs: [CAPABILITY_REF],
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

function dispatch(value: Fixture, dispatchId: string, observedAt = '2026-08-30T00:00:05.000Z') {
  return dispatchDelegatedRun({
    repo_root: value.repoRoot,
    dispatch_id: dispatchId,
    observed_at: observedAt,
    protected_paths: PROTECTED_PATHS,
  });
}

/**
 * How many Codex host actions this repository has ever been permitted.
 *
 * One persisted launch claim permits one and only one subprocess action, and it
 * is written before the process starts, so counting claims counts provider calls
 * without needing to instrument the shim the capability receipt pins by digest.
 */
function hostActionsPermitted(repoRoot: string): number {
  const directory = join(
    resolveGitCommonDirectory(repoRoot),
    ...DELEGATED_RUN_STORE_RELATIVE_ROOT.split('/'),
    'launch-claims',
  );
  return existsSync(directory)
    ? readdirSync(directory).filter((entry) => entry.endsWith('.json')).length
    : 0;
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

describe('the delegated run dispatch effect enforces the collaboration fence', () => {
  test('a direct collaboration dispatch with no binding is refused before the host action', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);
    expect(readCollaborationRunContextBinding(value.repoRoot, dispatchId)).toBeNull();

    // No CLI, no canary runner, no pre-step: the effect is called the way a
    // scheduler would call it.
    expect(refusalOf(() => dispatch(value, dispatchId))).toBe('binding_missing');

    expect(readDelegatedRunStatus(value.repoRoot, dispatchId).current.state).toBe('intent_persisted');
    expect(hostActionsPermitted(value.repoRoot)).toBe(0);
  });

  test('the same direct dispatch completes once the exact live binding is recorded', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);
    recordCollaborationRunContextBinding({ repo_root: value.repoRoot, dispatch_id: dispatchId, delivery });

    expect(dispatch(value, dispatchId).current.state).toBe('completed');
    expect(hostActionsPermitted(value.repoRoot)).toBe(1);
  });

  test('a delegation-only run still dispatches with no collaboration binding', () => {
    const value = fixture();
    // A seat whose goal carries neither untrusted marker and for which no
    // context was ever delivered: every delegated dispatch before C6 looked
    // like this, and the fence must make no claim about it.
    const dispatchId = admit(value, 1, BASE_GOAL);
    expect(readCollaborationRunContextBinding(value.repoRoot, dispatchId)).toBeNull();

    expect(dispatch(value, dispatchId).current.state).toBe('completed');
    expect(hostActionsPermitted(value.repoRoot)).toBe(1);
  });

  test('a persisted binding whose context packet no longer resolves fails the dispatch closed', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);
    recordCollaborationRunContextBinding({ repo_root: value.repoRoot, dispatch_id: dispatchId, delivery });

    // The binding still reads as provenance and now evidences nothing: this is
    // the stale record the fence exists to catch, and the effect must catch it
    // with the same code the pre-step raised.
    rmSync(collaborationRecordPath(
      contextPacketStorePaths(value.repoRoot),
      delivery.packet.packet_sha256.slice('sha256:'.length),
      'packet_sha256',
    ));

    expect(refusalOf(() => dispatch(value, dispatchId))).toBe('binding_context_packet_unresolvable');
    expect(readDelegatedRunStatus(value.repoRoot, dispatchId).current.state).toBe('intent_persisted');
    expect(hostActionsPermitted(value.repoRoot)).toBe(0);
  });

  test('a run bound to one delivery is refused after its goal was replaced by another', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);
    recordCollaborationRunContextBinding({ repo_root: value.repoRoot, dispatch_id: dispatchId, delivery });

    // A second seat carrying a different composed goal, bound to nothing: the
    // binding that exists names the first run, so the second must not borrow it.
    const other = deliver(value, 'A different base goal entirely.');
    const otherDispatchId = admit(value, 1, other.composed_goal);

    expect(refusalOf(() => dispatch(value, otherDispatchId))).toBe('binding_missing');
    expect(readDelegatedRunStatus(value.repoRoot, otherDispatchId).current.state).toBe('intent_persisted');
    expect(hostActionsPermitted(value.repoRoot)).toBe(0);
  });
});
