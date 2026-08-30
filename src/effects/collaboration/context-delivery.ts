/**
 * Context delivery and the dispatch fence.
 *
 * Sprint row C6. This is the path a collaboration round's context actually
 * travels, and the check that refuses a run which took a different one:
 *
 * ```text
 * collect the exchange (double-read, honest consistency)
 *   -> build CollaborationContextPacketV1 over that exact collection
 *   -> render the canonical [CoordinationContextUntrusted] block
 *   -> compose it into the delegated run's goal
 *   -> record CollaborationRunContextBindingV1
 *   -> before dispatch, verify the binding against the live run
 * ```
 *
 * **Fail loud on a non-stable snapshot.** A packet's `source_snapshot_sha256`
 * claims "these are the records this context was chosen from". If the store moved
 * mid-collection the claim is already false, and if a source was unreadable it
 * was never true. Selecting from such a collection would put a Worker's whole
 * context budget behind a provenance value that identifies no moment, so
 * delivery refuses instead of building a packet that looks reproducible.
 *
 * **The binding is checked, not merely written.** `recordCollaborationRunContext
 * Binding()` and `assertCollaborationDispatchBinding()` both run the same pure
 * check from `run-binding.ts`, against the live delegation records rather than
 * against the values the caller passed in. Recording proves the goal reaching the
 * envelope is the goal that was composed; the fence proves it again at dispatch,
 * when the run is about to actually happen and any of it may have moved.
 *
 * **No second destination resolver.** C4's `authorizeCollaborationDestination()`
 * binds an actor to a public or candidate shard, because those records have an
 * author whose visibility must be constrained. A context packet and a run
 * binding have no author: the Host builds both from records that are already
 * committed, exactly as `promoteCollaborationCandidate()` derives its target
 * without taking a destination. Giving them a destination value would create a
 * second thing a caller could aim somewhere else, so they are written to their
 * own Host-owned shards directly.
 *
 * **The Delegation protocol is untouched.** Nothing here writes an envelope, an
 * intent, an admission or an observation, and no delegation record grows a field.
 * `intent.context_packet_sha256` is read with the meaning C0's D2 froze — the
 * ExecutionPacket digest — and is cross-checked against the envelope rather than
 * reinterpreted.
 */
import { existsSync, realpathSync } from 'fs';

import {
  CollaborationError,
  collaborationSha256,
  type CollaborationScopeRefV1,
} from '../../core/collaboration/common';
import {
  buildCollaborationContextPacket,
  canonicalCollaborationContextPacketBytes,
  validateCollaborationContextPacket,
  type CollaborationContextPacketV1,
  type CollaborationHandoffRefV1,
} from '../../core/collaboration/context-packet';
import {
  buildCollaborationRunContextBinding,
  canonicalCollaborationRunContextBindingBytes,
  checkCollaborationRunContextBinding,
  collaborationRunContextBindingId,
  composeCollaborationGoal,
  validateCollaborationRunContextBinding,
  type CollaborationBindingFenceSubjectV1,
  type CollaborationBindingRefusal,
  type CollaborationRunContextBindingV1,
} from '../../core/collaboration/run-binding';
import type { DelegationEnvelopeV1 } from '../../core/engineers/delegation';
import type { DelegatedRunIntentV1 } from '../../core/engineers/delegation';
import {
  readDelegatedRunStatus,
  readDelegationAdmissionReceipt,
  readDelegationEnvelope,
} from '../engineers/delegated-run-store';
import { repoHarnessRepoIdFor } from '../repo-registry';
import {
  collaborationRecordPath,
  collaborationStorePaths,
  collaborationUnavailable,
  ensureCollaborationDirectory,
  listCollaborationRecords,
  publishCollaborationRecordDurably,
  readCollaborationRecord,
  type CollaborationRecordCodec,
  type CollaborationStorePaths,
} from './record-store';
import type { CollaborativeWorkExchangeCollectionV1 } from './work-exchange';

export const COLLABORATION_CONTEXT_PACKETS_SHARD = 'context-packets';
export const COLLABORATION_RUN_BINDINGS_SHARD = 'run-context-bindings';

/** A `sha256:`-prefixed digest as the 64-hex record id a shard files it under. */
function recordIdOfDigest(digest: string): string {
  return digest.slice('sha256:'.length);
}

export const CONTEXT_PACKET_CODEC: CollaborationRecordCodec<CollaborationContextPacketV1> = {
  label: 'collaboration context packet',
  validate: validateCollaborationContextPacket,
  identityOf: (packet) => recordIdOfDigest(packet.packet_sha256),
  canonicalBytes: canonicalCollaborationContextPacketBytes,
};

export const RUN_CONTEXT_BINDING_CODEC: CollaborationRecordCodec<CollaborationRunContextBindingV1> = {
  label: 'collaboration run context binding',
  validate: validateCollaborationRunContextBinding,
  identityOf: (binding) => collaborationRunContextBindingId(binding.dispatch_id),
  canonicalBytes: canonicalCollaborationRunContextBindingBytes,
};

export function contextPacketStorePaths(repoRoot: string): CollaborationStorePaths {
  return collaborationStorePaths(realpathSync(repoRoot), COLLABORATION_CONTEXT_PACKETS_SHARD);
}

export function runContextBindingStorePaths(repoRoot: string): CollaborationStorePaths {
  return collaborationStorePaths(realpathSync(repoRoot), COLLABORATION_RUN_BINDINGS_SHARD);
}

export function readCollaborationContextPacket(
  repoRoot: string,
  packetSha256: string,
): CollaborationContextPacketV1 | null {
  return readCollaborationRecord(
    contextPacketStorePaths(repoRoot),
    CONTEXT_PACKET_CODEC,
    recordIdOfDigest(packetSha256),
    'packet_sha256',
  );
}

export function readCollaborationRunContextBinding(
  repoRoot: string,
  dispatchId: string,
): CollaborationRunContextBindingV1 | null {
  return readCollaborationRecord(
    runContextBindingStorePaths(repoRoot),
    RUN_CONTEXT_BINDING_CODEC,
    collaborationRunContextBindingId(dispatchId),
    'dispatch_id',
  );
}

export function listCollaborationRunContextBindings(
  repoRoot: string,
): readonly CollaborationRunContextBindingV1[] {
  return listCollaborationRecords(
    runContextBindingStorePaths(repoRoot),
    RUN_CONTEXT_BINDING_CODEC,
    'dispatch_id',
  );
}

/**
 * Write a Host record once.
 *
 * Both families are content-derived — a packet is filed under its own digest, a
 * binding under its dispatch — so a second write of the same record is the
 * ordinary result of a retry and reconciles to identical bytes. A second write
 * of *different* bytes under the same name is two records claiming one identity,
 * which is refused rather than overwritten.
 */
function publishHostRecord<T>(
  paths: CollaborationStorePaths,
  codec: CollaborationRecordCodec<T>,
  record: T,
  field: string,
): void {
  const recordId = codec.identityOf(record);
  const bytes = codec.canonicalBytes(record);
  ensureCollaborationDirectory(paths.common, paths.shard);
  const file = collaborationRecordPath(paths, recordId, field);
  if (existsSync(file)) {
    const existing = readCollaborationRecord(paths, codec, recordId, field);
    if (existing === null || codec.canonicalBytes(existing) !== bytes) {
      throw new CollaborationError(
        'collaboration_conflict',
        `${codec.label} ${recordId} already exists with different bytes`,
      );
    }
    return;
  }
  publishCollaborationRecordDurably(paths.shard, file, bytes);
}

export interface DeliverCollaborationContextInput {
  readonly repo_root: string;
  /** The collection the packet is selected from; a non-stable one is refused. */
  readonly collection: CollaborativeWorkExchangeCollectionV1;
  readonly subject_refs: readonly CollaborationScopeRefV1[];
  /** The goal the run would have had without collaboration context. */
  readonly base_goal: string;
  readonly handoff?: CollaborationHandoffRefV1 | null;
  readonly budget_estimated_tokens?: number;
}

export interface CollaborationContextDeliveryV1 {
  readonly packet: CollaborationContextPacketV1;
  /** The exact text `rendered_context_sha256` digests; injected verbatim. */
  readonly rendered_context: string;
  /** Base goal plus the untrusted block, ready to become `ExecutionPacket.goal`. */
  readonly composed_goal: string;
  readonly base_goal_sha256: string;
  readonly composed_goal_sha256: string;
}

/**
 * Build the packet, render it, compose the goal, and persist the packet.
 *
 * The packet is persisted here rather than at binding time because the binding
 * references it: a binding naming a packet no store can produce is a dangling
 * provenance record, and the fence refuses one. Writing the packet first makes
 * that refusal reachable only through actual store damage, not through ordering.
 */
export function deliverCollaborationContext(
  input: DeliverCollaborationContextInput,
): CollaborationContextDeliveryV1 {
  const repoRoot = realpathSync(input.repo_root);
  if (input.collection.snapshot_consistency !== 'stable') {
    throw new CollaborationError(
      'collaboration_unavailable',
      `collaboration context cannot be delivered from a ${input.collection.snapshot_consistency} snapshot`
        + `${input.collection.degraded_sources.length > 0 ? ` (degraded: ${input.collection.degraded_sources.join(', ')})` : ''}`
        + `${input.collection.changed_sources.length > 0 ? ` (changed: ${input.collection.changed_sources.join(', ')})` : ''}`,
    );
  }
  const build = buildCollaborationContextPacket({
    repository_id: repoHarnessRepoIdFor(repoRoot),
    signals: input.collection.signals,
    subject_refs: input.subject_refs,
    handoff_facts: input.collection.handoff_facts,
    snapshot_consistency: input.collection.snapshot_consistency,
    handoff: input.handoff ?? null,
    budget_estimated_tokens: input.budget_estimated_tokens,
  });
  publishHostRecord(contextPacketStorePaths(repoRoot), CONTEXT_PACKET_CODEC, build.packet, 'packet_sha256');
  const composedGoal = composeCollaborationGoal(input.base_goal, build.rendered_context);
  return Object.freeze({
    packet: build.packet,
    rendered_context: build.rendered_context,
    composed_goal: composedGoal,
    base_goal_sha256: collaborationSha256(input.base_goal),
    composed_goal_sha256: collaborationSha256(composedGoal),
  });
}

/** The typed refusal both the recorder and the fence raise. */
export class CollaborationRunContextBindingRefused extends CollaborationError {
  constructor(
    readonly refusal: CollaborationBindingRefusal,
    readonly dispatch_id: string,
  ) {
    super(
      'collaboration_invalid',
      `collaboration run context binding refused for ${dispatch_id}: ${refusal}`,
    );
    this.name = 'CollaborationRunContextBindingRefused';
  }
}

interface LiveRun {
  readonly intent: DelegatedRunIntentV1;
  readonly envelope: DelegationEnvelopeV1;
}

/**
 * The live delegation records for one dispatch, read through the delegation
 * plane's own exported readers.
 *
 * `intent.context_packet_sha256` carries the ExecutionPacket digest, and the
 * envelope carries the same value independently; they are compared rather than
 * one being trusted, because the fence's whole subject is built from them and a
 * disagreement between the two would otherwise be invisible here.
 */
function readLiveRun(repoRoot: string, dispatchId: string): LiveRun {
  const status = readDelegatedRunStatus(repoRoot, dispatchId);
  const admission = readDelegationAdmissionReceipt(repoRoot, status.intent.admission_receipt_sha256);
  const envelope = readDelegationEnvelope(repoRoot, admission.envelope_sha256);
  if (envelope.execution_packet_sha256 !== status.intent.context_packet_sha256) {
    return collaborationUnavailable(
      `delegated run ${dispatchId} intent and envelope disagree about the execution packet`,
    );
  }
  return { intent: status.intent, envelope };
}

function fenceSubject(repoRoot: string, run: LiveRun, binding: CollaborationRunContextBindingV1 | null): CollaborationBindingFenceSubjectV1 {
  const packet = binding === null
    ? null
    : readCollaborationContextPacket(repoRoot, binding.collaboration_context_packet_sha256);
  return Object.freeze({
    dispatch_id: run.intent.dispatch_id,
    delegated_run_intent_sha256: run.intent.intent_sha256,
    execution_packet_sha256: run.intent.context_packet_sha256,
    composed_goal: run.envelope.goal,
    context_packet_rendered_context_sha256: packet?.rendered_context_sha256 ?? null,
  });
}

export interface RecordCollaborationRunContextBindingInput {
  readonly repo_root: string;
  readonly dispatch_id: string;
  readonly delivery: CollaborationContextDeliveryV1;
}

/**
 * Complete the binding from the live run and persist it.
 *
 * The digests that identify the run are read from the store rather than taken
 * from the caller: a caller-supplied intent digest would make the binding a
 * record of what the caller believed, and the point of the record is what
 * actually happened. The same check the fence runs is applied before the write,
 * so a binding that would be refused at dispatch is never persisted in the first
 * place.
 */
export function recordCollaborationRunContextBinding(
  input: RecordCollaborationRunContextBindingInput,
): CollaborationRunContextBindingV1 {
  const repoRoot = realpathSync(input.repo_root);
  const run = readLiveRun(repoRoot, input.dispatch_id);
  const binding = buildCollaborationRunContextBinding({
    dispatch_id: run.intent.dispatch_id,
    delegated_run_intent_sha256: run.intent.intent_sha256,
    execution_packet_sha256: run.intent.context_packet_sha256,
    collaboration_context_packet_sha256: input.delivery.packet.packet_sha256,
    rendered_context_sha256: input.delivery.packet.rendered_context_sha256,
    base_goal_sha256: input.delivery.base_goal_sha256,
    composed_goal_sha256: input.delivery.composed_goal_sha256,
  });
  const refusal = checkCollaborationRunContextBinding(binding, fenceSubject(repoRoot, run, binding));
  if (refusal !== null) throw new CollaborationRunContextBindingRefused(refusal, run.intent.dispatch_id);
  publishHostRecord(
    runContextBindingStorePaths(repoRoot),
    RUN_CONTEXT_BINDING_CODEC,
    binding,
    'dispatch_id',
  );
  return binding;
}

export interface AssertCollaborationDispatchBindingInput {
  readonly repo_root: string;
  readonly dispatch_id: string;
}

/**
 * The dispatch fence.
 *
 * A collaboration-mode delegated run passes through this before
 * `dispatchDelegatedRun()`. It re-reads the run and the binding from their
 * stores and re-runs the whole check — nothing is carried over from the
 * recording call, because the interval between recording and dispatching is
 * exactly where the state this fence exists to catch would have moved.
 *
 * It is a pre-step in the collaboration plane rather than an edit to
 * `dispatchDelegatedRun()`, matching how C4's admission bridge sits in front of
 * `admitReadOnlyDelegation()`: the delegation plane keeps one dispatch semantics,
 * and the collaboration requirement can be removed by deleting this module
 * instead of by unpicking an existing function.
 */
export function assertCollaborationDispatchBinding(
  input: AssertCollaborationDispatchBindingInput,
): CollaborationRunContextBindingV1 {
  const repoRoot = realpathSync(input.repo_root);
  const run = readLiveRun(repoRoot, input.dispatch_id);
  const binding = readCollaborationRunContextBinding(repoRoot, run.intent.dispatch_id);
  const refusal = checkCollaborationRunContextBinding(binding, fenceSubject(repoRoot, run, binding));
  if (refusal !== null) throw new CollaborationRunContextBindingRefused(refusal, run.intent.dispatch_id);
  return binding!;
}
