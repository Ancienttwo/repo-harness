import type { CollaborationMode } from '../collaboration/common';
import type { CollaborationSnapshotConsistency } from '../collaboration/context-packet';
import type { HandoffExecutionContextV1 } from '../collaboration/handoff';
import type { ContributionOpportunityReason } from '../collaboration/thread-projection';
import type {
  CollaborationParticipantProjectionV1,
  CollaborativeWorkExchangeSnapshotV1,
} from '../collaboration/work-exchange';

/**
 * Browser-facing view of one collaborative Work Exchange collection.
 *
 * The sibling of `projectOperatorFleetSnapshot()`, and it keeps the same rule:
 * the collaboration read model stays the authority for every semantic field, and
 * this transport view only removes what a browser must not receive. It
 * classifies nothing, recounts nothing and re-derives nothing — in particular it
 * does not compute a hotspot, does not decide whether a handoff is open, and
 * does not re-run the read-time succession proof, all of which are already
 * decided upstream.
 *
 * Three fields are deliberately absent from the output.
 *
 * `execution_offers` is absent because the board is not an Engineer. Offer
 * eligibility needs an `EngineerPrincipalV1`, and `collectCollaborativeWorkExchange()`
 * requires an offer reader precisely so that an empty list cannot be read as "there
 * is nothing to pick up" when the real fact is "nobody asked". The operator read
 * asks on nobody's behalf, so publishing a list here — empty or otherwise — would
 * be the board answering a question it never put. Delivery-plane availability is
 * already on the board through the Fleet worklist.
 *
 * `snapshot_sha256` is absent for the same reason: it is the digest of a document
 * that contains that unasked-for offer list, so two readers looking at identical
 * store contents through different callers would disagree about it.
 * `source_snapshot_sha256` — the identity of the signal set every projection was
 * derived from — is carried instead, exactly as the Fleet projection carries the
 * source digest rather than a digest of the redacted document.
 *
 * A handoff's `execution_context` is reduced to its discriminant. C6 already
 * applied verify-or-exclude, so a surviving `bound_task` branch is proven; but a
 * proven branch still names a Claim id, a lease generation and a freeze receipt
 * digest, none of which a browser has any use for. What a reader needs is what
 * kind of work the knowledge came from, and whether a context was withheld.
 */
/**
 * The source plane's protocol, carried rather than minted.
 *
 * The Fleet transport view does the same thing for the same reason: this
 * document is a redaction of a collaboration read model, not a second wire
 * identity with a version axis of its own, and a reader correlating the two
 * needs the number to mean the same thing on both sides. It is restated as a
 * literal because importing the collaboration constant would pull that module's
 * Node `createHash` dependency into the browser bundle; the annotation is the
 * source protocol's own type, so a bump that forgets this file fails typecheck.
 */
export const OPERATOR_COLLABORATION_PROTOCOL: CollaborativeWorkExchangeSnapshotV1['protocol'] = 1;
export const OPERATOR_COLLABORATION_SNAPSHOT_KIND = 'operator_collaboration_snapshot' as const;

/**
 * The collector's own source vocabulary, restated here because the collector
 * lives in the effect layer and this module must stay importable by the browser
 * bundle. Drift is not a runtime risk: `readOperatorCollaborationSnapshot()`
 * assigns the collector's `degraded_sources` and `changed_sources` straight into
 * this projection's input, so a renamed or added source fails typecheck there.
 */
export const OPERATOR_COLLABORATION_SOURCES = [
  'signals',
  'handoffs',
  'adoptions',
  'execution_offers',
] as const;

export type OperatorCollaborationSource = (typeof OPERATOR_COLLABORATION_SOURCES)[number];

export type OperatorCollaborationMode = CollaborationMode;
export type OperatorCollaborationConsistency = CollaborationSnapshotConsistency;
export type OperatorCollaborationExecutionContextKind = HandoffExecutionContextV1['kind'];
export type OperatorCollaborationOpportunityReason = ContributionOpportunityReason;
export type OperatorCollaborationActorKind = CollaborationParticipantProjectionV1['actor_kind'];

/** One lane. Every number is C2's, including the hotspot score this view orders by. */
export interface OperatorCollaborationThreadV1 {
  readonly thread_key: string;
  readonly signal_count: number;
  readonly distinct_contributor_count: number;
  readonly latest_signal_at: string;
  readonly artifact_ref_count: number;
  readonly unadopted_handoff_count: number;
  readonly adoption_count: number;
  readonly cross_thread_reference_count: number;
  readonly recency_rank: number;
  readonly hotspot_score: number;
  readonly thread_sha256: string;
}

/** One discovery, as the exchange snapshot already summarized it. */
export interface OperatorCollaborationSignalV1 {
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

export interface OperatorCollaborationHandoffV1 {
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
   * The discriminant only, never the branch.
   *
   * `'none'` and `null` are different facts and must stay different in the UI:
   * `'none'` is a handoff that declared no execution context, while `null` is a
   * `bound_task` context whose read-time proof did not hold and which C6
   * therefore withheld. `unverified_execution_context_count` on the snapshot
   * counts the second kind.
   */
  readonly execution_context_kind: OperatorCollaborationExecutionContextKind | null;
}

export interface OperatorCollaborationParticipantV1 {
  readonly actor_lineage: string;
  readonly actor_kind: OperatorCollaborationActorKind;
  readonly latest_actor_sha256: string;
  readonly signal_count: number;
  readonly handoff_count: number;
  readonly thread_keys: readonly string[];
  readonly latest_activity_at: string;
}

export interface OperatorCollaborationOpportunityV1 {
  readonly thread_key: string;
  readonly reason: OperatorCollaborationOpportunityReason;
  readonly source_refs: readonly string[];
}

export interface OperatorCollaborationSnapshotV1 {
  readonly protocol: typeof OPERATOR_COLLABORATION_PROTOCOL;
  readonly kind: typeof OPERATOR_COLLABORATION_SNAPSHOT_KIND;
  readonly repository_id: string;
  readonly mode: OperatorCollaborationMode;
  readonly snapshot_consistency: OperatorCollaborationConsistency;
  /** Sources whose two reads could not be established at all. */
  readonly degraded_sources: readonly OperatorCollaborationSource[];
  /** Sources a writer moved between the two reads. */
  readonly changed_sources: readonly OperatorCollaborationSource[];
  /** Lanes, ordered by C2's hotspot score; the ordering is attention, not priority. */
  readonly threads: readonly OperatorCollaborationThreadV1[];
  readonly signals: readonly OperatorCollaborationSignalV1[];
  readonly handoffs: readonly OperatorCollaborationHandoffV1[];
  readonly participants: readonly OperatorCollaborationParticipantV1[];
  readonly opportunities: readonly OperatorCollaborationOpportunityV1[];
  readonly unverified_execution_context_count: number;
  /** Digest of the source signal set, not of this redacted document. */
  readonly source_snapshot_sha256: string;
}

export interface ProjectOperatorCollaborationSnapshotInput {
  readonly snapshot: CollaborativeWorkExchangeSnapshotV1;
  readonly mode: OperatorCollaborationMode;
  readonly degraded_sources: readonly OperatorCollaborationSource[];
  readonly changed_sources: readonly OperatorCollaborationSource[];
}

function byText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Newest first, with the record id as the tiebreak.
 *
 * Ordering is presentation and nothing else: `created_at` is the recorded time
 * the store already froze, and the tiebreak keeps two projections of one
 * collection identical without inventing a second opinion about which record is
 * more recent.
 */
function byRecencyThenId(
  left: { readonly created_at: string; readonly id: string },
  right: { readonly created_at: string; readonly id: string },
): number {
  return byText(right.created_at, left.created_at) || byText(left.id, right.id);
}

export function projectOperatorCollaborationSnapshot(
  input: ProjectOperatorCollaborationSnapshotInput,
): OperatorCollaborationSnapshotV1 {
  const { snapshot } = input;

  const threads = snapshot.threads
    .map((thread) => Object.freeze({
      thread_key: thread.thread_key,
      signal_count: thread.signal_count,
      distinct_contributor_count: thread.distinct_contributor_count,
      latest_signal_at: thread.latest_signal_at,
      artifact_ref_count: thread.artifact_ref_count,
      unadopted_handoff_count: thread.unadopted_handoff_count,
      adoption_count: thread.adoption_count,
      cross_thread_reference_count: thread.cross_thread_reference_count,
      recency_rank: thread.recency_rank,
      hotspot_score: thread.hotspot_score,
      thread_sha256: thread.thread_sha256,
    }))
    // The hotspot score exists to order attention and is forbidden from reaching
    // Work Graph priority or Lease eligibility, so sorting by it here is the use
    // it was defined for. The thread key breaks ties so the order is a property
    // of the set rather than of iteration.
    .sort((left, right) => right.hotspot_score - left.hotspot_score || byText(left.thread_key, right.thread_key));

  const signals = snapshot.relevant_signals
    .map((signal) => Object.freeze({
      signal_id: signal.signal_id,
      signal_sha256: signal.signal_sha256,
      thread_key: signal.thread_key,
      actor_lineage: signal.actor_lineage,
      title: signal.title,
      labels: Object.freeze(signal.labels.map((label) => label)),
      artifact_ref_count: signal.artifact_ref_count,
      created_at: signal.created_at,
      superseded: signal.superseded,
    }))
    .sort((left, right) => byRecencyThenId(
      { created_at: left.created_at, id: left.signal_id },
      { created_at: right.created_at, id: right.signal_id },
    ));

  const handoffs = snapshot.open_handoffs
    .map((handoff) => Object.freeze({
      handoff_id: handoff.handoff_id,
      handoff_sha256: handoff.handoff_sha256,
      thread_key: handoff.thread_key,
      actor_lineage: handoff.actor_lineage,
      trigger: handoff.trigger,
      goal: handoff.goal,
      next_action_count: handoff.next_action_count,
      open_hypothesis_count: handoff.open_hypothesis_count,
      adoption_count: handoff.adoption_count,
      created_at: handoff.created_at,
      execution_context_kind: handoff.execution_context === null ? null : handoff.execution_context.kind,
    }))
    .sort((left, right) => byRecencyThenId(
      { created_at: left.created_at, id: left.handoff_id },
      { created_at: right.created_at, id: right.handoff_id },
    ));

  const participants = snapshot.active_participants.map((participant) => Object.freeze({
    actor_lineage: participant.actor_lineage,
    actor_kind: participant.actor_kind,
    latest_actor_sha256: participant.latest_actor_sha256,
    signal_count: participant.signal_count,
    handoff_count: participant.handoff_count,
    thread_keys: Object.freeze(participant.thread_keys.map((key) => key)),
    latest_activity_at: participant.latest_activity_at,
  }));

  const opportunities = snapshot.contribution_opportunities.map((opportunity) => Object.freeze({
    thread_key: opportunity.thread_key,
    reason: opportunity.reason,
    source_refs: Object.freeze(opportunity.source_refs.map((ref) => ref)),
  }));

  return Object.freeze({
    protocol: OPERATOR_COLLABORATION_PROTOCOL,
    kind: OPERATOR_COLLABORATION_SNAPSHOT_KIND,
    repository_id: snapshot.repository_id,
    mode: input.mode,
    snapshot_consistency: snapshot.snapshot_consistency,
    degraded_sources: Object.freeze(input.degraded_sources.map((source) => source)),
    changed_sources: Object.freeze(input.changed_sources.map((source) => source)),
    threads: Object.freeze(threads),
    signals: Object.freeze(signals),
    handoffs: Object.freeze(handoffs),
    participants: Object.freeze(participants),
    opportunities: Object.freeze(opportunities),
    unverified_execution_context_count: snapshot.unverified_execution_context_count,
    source_snapshot_sha256: snapshot.source_snapshot_sha256,
  });
}
