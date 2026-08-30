/**
 * `CollaborativeWorkExchangeSnapshotV1` — execution offers and collaboration
 * state in one read model.
 *
 * Sprint row C6. The snapshot answers "what could I pick up, who is already
 * here, and what have they said" with a single set of bytes, so an Agent does
 * not have to join five stores itself and reach five slightly different
 * conclusions about what the moment looked like.
 *
 * Three properties carry the row.
 *
 * Execution offers pass through untouched. An `EngineerOfferV1` arrives with its
 * own `offer_revision` and leaves with the same one; this module never rebuilds a
 * revision, never re-derives readiness, and never decides an offer is stale.
 * Offer eligibility is `src/core/engineers/scheduling.ts`'s authority and the
 * projection borrows none of it — the revision is surfaced beside the offer
 * purely so a reader can compare two snapshots without unpacking the record.
 *
 * `snapshot_consistency` is injected, exactly as the context packet's is. This
 * builder sees arrays that are already assembled and cannot observe whether they
 * were read from a store that moved underneath the collector, so it has no
 * honest way to derive the value. The reader in `src/effects/collaboration/`
 * supplies it; `stable` is a positive assertion about a double-read, and
 * defaulting to it here would seal a claim this layer cannot make into
 * `snapshot_sha256`.
 *
 * A `bound_task` execution context is proven or it is not shown. The proof
 * itself needs the Task freeze store, which is an effect, so the results arrive
 * through the same consumer-declared seam pattern: the builder requires a proof
 * entry for every `bound_task` handoff in its input and refuses the whole
 * snapshot when one is missing. It is never inferred, never defaulted to
 * verified, and never defaulted to unverified either — a missing proof means the
 * caller did not run the check, which is a different fact from the check failing.
 */
import {
  COLLABORATION_PROTOCOL,
  canonicalCollaborationBytes,
  canonicalCollaborationDigest,
  collaborationActorLineage,
  collaborationActorSha256,
  collaborationInvalid,
  isCollaborationRecord,
  validateCollaborationRecordId,
  validateCollaborationRepositoryId,
  type CollaborationActorRefV1,
} from './common';
import { assertMessageExactKeys, assertMessageSha256, messageRequiredString } from '../messages/mechanics';
import {
  COLLABORATION_SNAPSHOT_CONSISTENCY,
  type CollaborationSnapshotConsistency,
} from './context-packet';
import { validateWorkStateHandoff, type HandoffExecutionContextV1, type WorkStateHandoffV1 } from './handoff';
import { validateCoordinationSignal, type CoordinationSignalV1 } from './signal';
import {
  collaborationSourceSnapshotDigest,
  projectCollaborationThreads,
  type CollaborationContributionOpportunityV1,
  type CollaborationHandoffFactV1,
  type CollaborationThreadSnapshotV1,
} from './thread-projection';
import { validateEngineerOffer, type EngineerOfferV1 } from '../engineers/scheduling';

export const COLLABORATIVE_WORK_EXCHANGE_SNAPSHOT_KIND =
  'repo-harness-collaborative-work-exchange-snapshot' as const;

/**
 * One existing offer, carried verbatim.
 *
 * `offer_revision` is a copy of `offer.offer_revision` rather than a second
 * opinion about it: the two are compared on the way in, so a projection whose
 * surfaced revision disagreed with the record it came from cannot be built.
 */
export interface ExistingEngineerOfferProjectionV1 {
  readonly offer: EngineerOfferV1;
  readonly offer_revision: string;
}

/**
 * A participant is a lineage, not an actor record. C1 froze the rule: a Module
 * Engineer keeps one lineage across rebindings, and two delegated runs are two
 * participants even under one parent. Counting actor records instead would make
 * a rebinding look like a new colleague arriving.
 */
export interface CollaborationParticipantProjectionV1 {
  readonly actor_lineage: string;
  readonly actor_kind: CollaborationActorRefV1['kind'];
  /** The digest of the most recent actor record observed on this lineage. */
  readonly latest_actor_sha256: string;
  readonly signal_count: number;
  readonly handoff_count: number;
  readonly thread_keys: readonly string[];
  readonly latest_activity_at: string;
}

export interface CoordinationSignalSummaryV1 {
  readonly signal_id: string;
  readonly signal_sha256: string;
  readonly thread_key: string;
  readonly actor_lineage: string;
  readonly title: string;
  readonly labels: readonly string[];
  readonly artifact_ref_count: number;
  readonly created_at: string;
  readonly superseded: boolean;
}

export interface WorkStateHandoffSummaryV1 {
  readonly handoff_id: string;
  readonly handoff_sha256: string;
  readonly thread_key: string;
  readonly actor_lineage: string;
  readonly trigger: string;
  readonly goal: string;
  readonly next_action_count: number;
  readonly open_hypothesis_count: number;
  readonly adoption_count: number;
  readonly created_at: string;
  /**
   * Null exactly when the handoff declares a `bound_task` context whose
   * read-time proof did not hold. Every other branch of the union describes work
   * that never held a Lease and needs no proof, so it passes through as it was
   * persisted.
   */
  readonly execution_context: HandoffExecutionContextV1 | null;
}

/**
 * One handoff's read-time proof result, supplied by the store reader.
 *
 * The effect layer runs `resolveBoundTaskSuccession()`, which resolves the named
 * `TaskFreezeReceiptV1` and compares the whole branch against a context
 * re-derived from the receipt. Only the verdict crosses this seam: the receipt
 * itself is delivery-plane state and has no business inside a collaboration
 * projection.
 */
export interface CollaborationExecutionContextProofV1 {
  readonly handoff_id: string;
  readonly verified: boolean;
}

export interface CollaborativeWorkExchangeSnapshotV1 {
  readonly protocol: typeof COLLABORATION_PROTOCOL;
  readonly kind: typeof COLLABORATIVE_WORK_EXCHANGE_SNAPSHOT_KIND;
  readonly repository_id: string;
  readonly execution_offers: readonly ExistingEngineerOfferProjectionV1[];
  readonly active_participants: readonly CollaborationParticipantProjectionV1[];
  readonly threads: readonly CollaborationThreadSnapshotV1[];
  readonly relevant_signals: readonly CoordinationSignalSummaryV1[];
  readonly open_handoffs: readonly WorkStateHandoffSummaryV1[];
  readonly contribution_opportunities: readonly CollaborationContributionOpportunityV1[];
  /** The identity of the signal set every projection above was derived from. */
  readonly source_snapshot_sha256: string;
  /** How many handoffs had a `bound_task` context withheld because it did not prove. */
  readonly unverified_execution_context_count: number;
  readonly snapshot_consistency: CollaborationSnapshotConsistency;
  readonly snapshot_sha256: string;
}

const SNAPSHOT_FIELDS = [
  'protocol',
  'kind',
  'repository_id',
  'execution_offers',
  'active_participants',
  'threads',
  'relevant_signals',
  'open_handoffs',
  'contribution_opportunities',
  'source_snapshot_sha256',
  'unverified_execution_context_count',
  'snapshot_consistency',
  'snapshot_sha256',
] as const;

function byText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseInstant(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isInteger(parsed)) collaborationInvalid(`created_at is not a parsable instant: ${value}`);
  return parsed;
}

function validateSnapshotConsistency(value: unknown): CollaborationSnapshotConsistency {
  if (!COLLABORATION_SNAPSHOT_CONSISTENCY.includes(value as CollaborationSnapshotConsistency)) {
    collaborationInvalid('work exchange snapshot_consistency is invalid');
  }
  return value as CollaborationSnapshotConsistency;
}

/**
 * Carry an offer through without touching it.
 *
 * `validateEngineerOffer()` is the existing scheduling validator and it accepts
 * `offer_revision` as a given rather than recomputing it, which is precisely why
 * it is used here: passing the record through the authority's own shape check
 * proves the projection carries a real offer, and re-deriving the revision would
 * be this module forming an opinion about a value it does not own.
 */
export function projectExistingEngineerOffer(offer: EngineerOfferV1): ExistingEngineerOfferProjectionV1 {
  const validated = validateEngineerOffer(offer);
  return Object.freeze({ offer: validated, offer_revision: validated.offer_revision });
}

/** The same cross-repository rule the signal and handoff sets are held to. */
function projectOfferForRepository(offer: EngineerOfferV1, repositoryId: string): ExistingEngineerOfferProjectionV1 {
  const projected = projectExistingEngineerOffer(offer);
  if (projected.offer.repository_id !== repositoryId) {
    collaborationInvalid(`execution offer belongs to another repository: ${projected.offer.work_package_id}`);
  }
  return projected;
}

function validateOfferProjection(value: unknown): ExistingEngineerOfferProjectionV1 {
  if (!isCollaborationRecord(value)) collaborationInvalid('execution offer projection must be an object');
  assertMessageExactKeys(value, ['offer', 'offer_revision'], 'execution offer projection', collaborationInvalid);
  const projected = projectExistingEngineerOffer(value.offer as EngineerOfferV1);
  if (value.offer_revision !== projected.offer_revision) {
    collaborationInvalid('execution offer projection revision disagrees with the offer it carries');
  }
  return projected;
}

function summarizeSignal(
  signal: CoordinationSignalV1,
  supersededIds: ReadonlySet<string>,
): CoordinationSignalSummaryV1 {
  return Object.freeze({
    signal_id: signal.signal_id,
    signal_sha256: signal.signal_sha256,
    thread_key: signal.thread_key,
    actor_lineage: collaborationActorLineage(signal.actor),
    title: signal.title,
    labels: signal.labels,
    artifact_ref_count: signal.artifact_refs.length,
    created_at: signal.created_at,
    superseded: supersededIds.has(signal.signal_id),
  });
}

function summarizeHandoff(
  handoff: WorkStateHandoffV1,
  adoptionCount: number,
  executionContext: HandoffExecutionContextV1 | null,
): WorkStateHandoffSummaryV1 {
  return Object.freeze({
    handoff_id: handoff.handoff_id,
    handoff_sha256: handoff.handoff_sha256,
    thread_key: handoff.thread_key,
    actor_lineage: collaborationActorLineage(handoff.actor),
    trigger: handoff.trigger,
    goal: handoff.goal,
    next_action_count: handoff.next_actions.length,
    open_hypothesis_count: handoff.open_hypotheses.length,
    adoption_count: adoptionCount,
    created_at: handoff.created_at,
    execution_context: executionContext,
  });
}

/**
 * Distinct participants across both record families.
 *
 * The lineage is the key and the latest actor record on it is what
 * `latest_actor_sha256` reports, so a lineage that rebound mid-round shows the
 * binding it ended on rather than an arbitrary one. Ties on the instant fall
 * back to the actor digest, which makes the choice a property of the set instead
 * of a property of iteration order.
 */
function projectParticipants(
  signals: readonly CoordinationSignalV1[],
  handoffs: readonly WorkStateHandoffV1[],
): readonly CollaborationParticipantProjectionV1[] {
  interface Accumulator {
    readonly actor_kind: CollaborationActorRefV1['kind'];
    latest_actor_sha256: string;
    latest_ms: number;
    latest_activity_at: string;
    signal_count: number;
    handoff_count: number;
    readonly thread_keys: Set<string>;
  }
  const lanes = new Map<string, Accumulator>();
  const observe = (
    actor: CollaborationActorRefV1,
    threadKey: string,
    createdAt: string,
    family: 'signal' | 'handoff',
  ): void => {
    const lineage = collaborationActorLineage(actor);
    const entry = lanes.get(lineage) ?? {
      actor_kind: actor.kind,
      latest_actor_sha256: collaborationActorSha256(actor),
      latest_ms: Number.NEGATIVE_INFINITY,
      latest_activity_at: createdAt,
      signal_count: 0,
      handoff_count: 0,
      thread_keys: new Set<string>(),
    };
    const instant = parseInstant(createdAt);
    const digest = collaborationActorSha256(actor);
    if (instant > entry.latest_ms
      || (instant === entry.latest_ms && byText(digest, entry.latest_actor_sha256) > 0)) {
      entry.latest_ms = instant;
      entry.latest_activity_at = createdAt;
      entry.latest_actor_sha256 = digest;
    }
    if (family === 'signal') entry.signal_count += 1; else entry.handoff_count += 1;
    entry.thread_keys.add(threadKey);
    lanes.set(lineage, entry);
  };
  for (const signal of signals) observe(signal.actor, signal.thread_key, signal.created_at, 'signal');
  for (const handoff of handoffs) observe(handoff.actor, handoff.thread_key, handoff.created_at, 'handoff');

  return Object.freeze(
    [...lanes.entries()]
      .map(([lineage, entry]) => Object.freeze({
        actor_lineage: lineage,
        actor_kind: entry.actor_kind,
        latest_actor_sha256: entry.latest_actor_sha256,
        signal_count: entry.signal_count,
        handoff_count: entry.handoff_count,
        thread_keys: Object.freeze([...entry.thread_keys].sort(byText)),
        latest_activity_at: entry.latest_activity_at,
      }))
      .sort((left, right) => byText(left.actor_lineage, right.actor_lineage)),
  );
}

export interface BuildCollaborativeWorkExchangeSnapshotInput {
  readonly repository_id: string;
  readonly execution_offers: readonly EngineerOfferV1[];
  readonly signals: readonly CoordinationSignalV1[];
  readonly handoffs: readonly WorkStateHandoffV1[];
  /** Adoption counts per handoff id, from the C3 adoption store. */
  readonly adoption_counts: readonly { readonly handoff_id: string; readonly adoption_count: number }[];
  /** One entry per `bound_task` handoff; a missing entry fails the snapshot closed. */
  readonly execution_context_proofs: readonly CollaborationExecutionContextProofV1[];
  /** Supplied by the store reader, which is the only layer that can observe it. */
  readonly snapshot_consistency: CollaborationSnapshotConsistency;
}

export function buildCollaborativeWorkExchangeSnapshot(
  input: BuildCollaborativeWorkExchangeSnapshotInput,
): CollaborativeWorkExchangeSnapshotV1 {
  const repositoryId = validateCollaborationRepositoryId(input.repository_id);
  const snapshotConsistency = validateSnapshotConsistency(input.snapshot_consistency);
  const signals = input.signals.map((entry) => validateCoordinationSignal(entry));
  const handoffs = input.handoffs.map((entry) => validateWorkStateHandoff(entry));
  for (const signal of signals) {
    if (signal.repository_id !== repositoryId) {
      collaborationInvalid(`signal belongs to another repository: ${signal.signal_id}`);
    }
  }
  for (const handoff of handoffs) {
    if (handoff.repository_id !== repositoryId) {
      collaborationInvalid(`handoff belongs to another repository: ${handoff.handoff_id}`);
    }
  }

  const adoptionByHandoff = new Map<string, number>();
  for (const entry of input.adoption_counts) {
    const handoffId = validateCollaborationRecordId(entry.handoff_id, 'adoption count handoff_id');
    if (!Number.isInteger(entry.adoption_count) || entry.adoption_count < 0) {
      collaborationInvalid('adoption count is invalid');
    }
    if (adoptionByHandoff.has(handoffId)) collaborationInvalid(`duplicate adoption count: ${handoffId}`);
    adoptionByHandoff.set(handoffId, entry.adoption_count);
  }

  const proofByHandoff = new Map<string, boolean>();
  for (const proof of input.execution_context_proofs) {
    const handoffId = validateCollaborationRecordId(proof.handoff_id, 'execution context proof handoff_id');
    if (typeof proof.verified !== 'boolean') collaborationInvalid('execution context proof verdict is invalid');
    if (proofByHandoff.has(handoffId)) collaborationInvalid(`duplicate execution context proof: ${handoffId}`);
    proofByHandoff.set(handoffId, proof.verified);
  }

  // A handoff is open until another handoff supersedes it. Adoption never closes
  // one: adoption is non-exclusive, so the same knowledge can be handed to
  // several readers and remains just as available to the next.
  const superseded = new Set(
    handoffs.map((handoff) => handoff.supersedes_handoff_id).filter((id): id is string => id !== null),
  );
  const supersededSignals = new Set(
    signals.map((signal) => signal.supersedes_signal_id).filter((id): id is string => id !== null),
  );

  let unverified = 0;
  const openHandoffs = handoffs
    .filter((handoff) => !superseded.has(handoff.handoff_id))
    .map((handoff) => {
      const context = handoff.execution_context;
      if (context.kind !== 'bound_task') {
        return summarizeHandoff(handoff, adoptionByHandoff.get(handoff.handoff_id) ?? 0, context);
      }
      const proof = proofByHandoff.get(handoff.handoff_id);
      if (proof === undefined) {
        collaborationInvalid(
          `handoff ${handoff.handoff_id} declares a bound_task execution context with no read-time proof`,
        );
      }
      if (!proof) unverified += 1;
      return summarizeHandoff(
        handoff,
        adoptionByHandoff.get(handoff.handoff_id) ?? 0,
        proof ? context : null,
      );
    })
    .sort((left, right) => byText(left.handoff_id, right.handoff_id));

  // The handoff facts C2's projection declared and left empty. They are built
  // from the same open set the summaries above use, so the counts a thread
  // reports and the handoffs a reader can see are the same handoffs.
  const threadKeys = new Set(signals.map((signal) => signal.thread_key));
  const handoffFacts: CollaborationHandoffFactV1[] = openHandoffs
    .filter((summary) => threadKeys.has(summary.thread_key))
    .map((summary) => ({
      thread_key: summary.thread_key,
      handoff_id: summary.handoff_id,
      adoption_count: summary.adoption_count,
    }));

  const projection = projectCollaborationThreads({ signals, handoff_facts: handoffFacts });

  const basis = {
    protocol: COLLABORATION_PROTOCOL,
    kind: COLLABORATIVE_WORK_EXCHANGE_SNAPSHOT_KIND,
    repository_id: repositoryId,
    execution_offers: Object.freeze(
      input.execution_offers
        .map((offer) => projectOfferForRepository(offer, repositoryId))
        .sort((left, right) => byText(left.offer.work_package_id, right.offer.work_package_id)
          || byText(left.offer_revision, right.offer_revision)),
    ),
    active_participants: projectParticipants(signals, handoffs),
    threads: projection.threads,
    relevant_signals: Object.freeze(
      signals
        .map((signal) => summarizeSignal(signal, supersededSignals))
        .sort((left, right) => byText(left.signal_id, right.signal_id)),
    ),
    open_handoffs: Object.freeze(openHandoffs),
    contribution_opportunities: projection.opportunities,
    source_snapshot_sha256: collaborationSourceSnapshotDigest(signals),
    unverified_execution_context_count: unverified,
    snapshot_consistency: snapshotConsistency,
  };
  return Object.freeze({
    ...basis,
    snapshot_sha256: canonicalCollaborationDigest(basis as unknown as Readonly<Record<string, unknown>>),
  }) as CollaborativeWorkExchangeSnapshotV1;
}

/**
 * Re-derive the digest from the record's own contents.
 *
 * Every nested projection is re-validated through the validator that owns it —
 * offers through the scheduling authority, signals and handoffs through C1 and
 * C3 — rather than through a local shape check, so a snapshot that round-trips
 * through this function carries records the rest of the repository would also
 * accept.
 */
export function validateCollaborativeWorkExchangeSnapshot(
  value: unknown,
): CollaborativeWorkExchangeSnapshotV1 {
  if (!isCollaborationRecord(value)) collaborationInvalid('work exchange snapshot must be an object');
  assertMessageExactKeys(value, SNAPSHOT_FIELDS, 'work exchange snapshot', collaborationInvalid);
  if (value.protocol !== COLLABORATION_PROTOCOL || value.kind !== COLLABORATIVE_WORK_EXCHANGE_SNAPSHOT_KIND) {
    collaborationInvalid('work exchange snapshot protocol or kind is invalid');
  }
  for (const field of ['execution_offers', 'active_participants', 'threads', 'relevant_signals', 'open_handoffs', 'contribution_opportunities'] as const) {
    if (!Array.isArray(value[field])) collaborationInvalid(`work exchange snapshot ${field} must be an array`);
  }
  if (!Number.isInteger(value.unverified_execution_context_count)
    || (value.unverified_execution_context_count as number) < 0) {
    collaborationInvalid('work exchange snapshot unverified_execution_context_count is invalid');
  }
  const sourceDigest = messageRequiredString(
    value.source_snapshot_sha256,
    'work exchange snapshot source_snapshot_sha256',
    collaborationInvalid,
  );
  assertMessageSha256(sourceDigest, 'work exchange snapshot source_snapshot_sha256', collaborationInvalid);
  const basis = {
    protocol: COLLABORATION_PROTOCOL,
    kind: COLLABORATIVE_WORK_EXCHANGE_SNAPSHOT_KIND,
    repository_id: validateCollaborationRepositoryId(value.repository_id),
    execution_offers: Object.freeze((value.execution_offers as unknown[]).map(validateOfferProjection)),
    active_participants: value.active_participants,
    threads: value.threads,
    relevant_signals: value.relevant_signals,
    open_handoffs: value.open_handoffs,
    contribution_opportunities: value.contribution_opportunities,
    source_snapshot_sha256: sourceDigest,
    unverified_execution_context_count: value.unverified_execution_context_count as number,
    snapshot_consistency: validateSnapshotConsistency(value.snapshot_consistency),
  };
  const snapshot = Object.freeze({
    ...basis,
    snapshot_sha256: canonicalCollaborationDigest(basis as unknown as Readonly<Record<string, unknown>>),
  }) as CollaborativeWorkExchangeSnapshotV1;
  if (value.snapshot_sha256 !== snapshot.snapshot_sha256) {
    collaborationInvalid('work exchange snapshot snapshot_sha256 is stale');
  }
  return snapshot;
}

export function canonicalCollaborativeWorkExchangeSnapshotBytes(
  snapshot: CollaborativeWorkExchangeSnapshotV1,
): string {
  return canonicalCollaborationBytes(
    validateCollaborativeWorkExchangeSnapshot(snapshot) as unknown as Readonly<Record<string, unknown>>,
  );
}
