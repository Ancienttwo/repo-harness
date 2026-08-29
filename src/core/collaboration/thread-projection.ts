/**
 * Threads, lanes and contribution opportunities, derived from committed signals.
 *
 * Sprint row C2. There is no central lane enum and no lane registry. A lane is
 * the set of signals whose `thread_key` is byte-for-byte equal; keys that merely
 * look alike stay apart, because the key is opaque to the system and a
 * similarity merge would be the system deciding what an agent meant.
 *
 * The projection is a pure function of the source signal bytes plus injected
 * structural facts. It opens no file, keeps no cache and reads no clock, so the
 * same set of signals projects to the same bytes on every rebuild. Child PRD A
 * rules out a `threads/<digest>/current.json` cache for P0 precisely so this
 * property has no second, staler answer to disagree with.
 *
 * Every number here is something a reader could count by hand from the records:
 * how many signals, how many distinct participants, how many artifact
 * references, how many edges leave the lane. Nothing infers state, intent or
 * mood from a body; the thin signal protocol carries no field that would support
 * it, and Child PRD A removes `open_request`, `unverified_hypothesis` and
 * `stalled_thread` from machine semantics for exactly that reason. Agents remain
 * free to say the same things with open labels the system gives no meaning.
 */
import {
  COLLABORATION_THREAD_KEY_MAX_BYTES,
  canonicalCollaborationDigest,
  collaborationActorLineage,
  collaborationInvalid,
  isCollaborationRecord,
  validateCollaborationRecordId,
} from './common';
import {
  COLLABORATION_ARTIFACT_RICH_MIN_REFS,
  COLLABORATION_RECENCY_RANK_MAX,
  collaborationHasLowContributorCoverage,
  collaborationHotspotScore,
  collaborationRecencyRank,
} from './hotspot';
import { validateCoordinationSignal, type CoordinationSignalV1 } from './signal';

/**
 * The C3 seam.
 *
 * C2 needs to count handoffs and their adoptions, and C3 owns both records. The
 * consumer declares the shape it needs and C3 constructs it, so C3 can wire real
 * `WorkStateHandoffV1` and `HandoffAdoptionReceiptV1` records into this
 * collection without changing a line of the projection. Until then the
 * collection is empty and every handoff-derived count is zero — an honest
 * absence rather than a placeholder that pretends to know.
 *
 * Only structural counts cross the seam. Nothing here carries handoff content,
 * and adoption is a count of who was handed context, never a claim on work.
 */
export interface CollaborationHandoffFactV1 {
  /** The thread the handoff belongs to; must be a thread present in the source set. */
  readonly thread_key: string;
  readonly handoff_id: string;
  readonly adoption_count: number;
}

export interface CollaborationThreadSnapshotV1 {
  readonly thread_key: string;
  readonly signal_count: number;
  /** Distinct actor lineages, using C1's frozen lineage rule for "a different participant". */
  readonly distinct_contributor_count: number;
  readonly latest_signal_at: string;
  readonly artifact_ref_count: number;
  readonly unadopted_handoff_count: number;
  readonly adoption_count: number;
  readonly cross_thread_reference_count: number;
  /** Bucketed distance from the snapshot epoch; never from the wall clock. */
  readonly recency_rank: number;
  readonly hotspot_score: number;
  readonly thread_sha256: string;
}

export const COLLABORATION_OPPORTUNITY_REASONS = [
  'unadopted_handoff',
  'low_contributor_coverage',
  'cross_thread_reference',
  'recent_activity',
  'artifact_rich_thread',
  'exploration_slot',
] as const;

/**
 * The closed structural reason set. `open_request`, `unverified_hypothesis` and
 * `stalled_thread` are deliberately absent: deciding whether a signal asks a
 * question, whether a hypothesis was tested, or whether a lane has stalled needs
 * semantic information the signal protocol does not carry, and guessing it is
 * the LLM state inference this row forbids.
 */
export type ContributionOpportunityReason = (typeof COLLABORATION_OPPORTUNITY_REASONS)[number];

/** Opaque record ids evidencing a reason; bounded so one busy lane cannot inflate the projection. */
export const COLLABORATION_OPPORTUNITY_SOURCE_REF_MAX_COUNT = 8;

export interface CollaborationContributionOpportunityV1 {
  readonly thread_key: string;
  readonly reason: ContributionOpportunityReason;
  /** Signal ids, or handoff ids for `unadopted_handoff`; opaque either way. */
  readonly source_refs: readonly string[];
}

export interface CollaborationThreadProjectionV1 {
  /**
   * The deterministic epoch: the latest `created_at` in the source set. Null
   * only when the set is empty, where there is no latest event to measure
   * against and there are no threads to measure.
   */
  readonly epoch_at: string | null;
  readonly signal_count: number;
  readonly threads: readonly CollaborationThreadSnapshotV1[];
  readonly opportunities: readonly CollaborationContributionOpportunityV1[];
  readonly source_snapshot_sha256: string;
  readonly projection_sha256: string;
}

/** A total order over strings by UTF-16 code unit; `sort()`'s default is the same, stated explicitly. */
function byText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseInstant(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isInteger(parsed)) collaborationInvalid(`created_at is not a parsable instant: ${value}`);
  return parsed;
}

/**
 * The timestamp *string* at a known latest instant. Two records may carry the
 * same instant in different spellings (`…:05Z` and `…:05.000Z`), so picking "the
 * one that appeared last while scanning" would make the projection depend on the
 * order the caller happened to hand over its array. The smallest spelling is a
 * property of the set.
 */
function latestTimestamp(signals: readonly CoordinationSignalV1[], latestMs: number): string {
  return signals
    .filter((signal) => parseInstant(signal.created_at) === latestMs)
    .map((signal) => signal.created_at)
    .sort(byText)[0]!;
}

/**
 * The identity of the source set: every signal's id paired with the digest of
 * its bytes, in id order. Two projections carrying the same value were built
 * from the same records, and a single changed byte anywhere changes it.
 */
export function collaborationSourceSnapshotDigest(
  signals: readonly CoordinationSignalV1[],
): string {
  return canonicalCollaborationDigest({
    entries: signals
      .map((signal) => ({ signal_id: signal.signal_id, signal_sha256: signal.signal_sha256 }))
      .sort((left, right) => byText(left.signal_id, right.signal_id)),
  });
}

/**
 * Validate the source set and reject duplicates. Every signal goes through C1's
 * validator rather than a local shape check: one validator, no shadow parser,
 * and a malformed record fails the projection closed instead of being skipped
 * into a healthy-looking smaller answer.
 */
function validateSourceSignals(value: unknown): readonly CoordinationSignalV1[] {
  if (!Array.isArray(value)) collaborationInvalid('signals must be an array');
  const signals = value.map((entry) => validateCoordinationSignal(entry));
  const ids = new Set<string>();
  for (const signal of signals) {
    if (ids.has(signal.signal_id)) collaborationInvalid(`duplicate signal in the source set: ${signal.signal_id}`);
    ids.add(signal.signal_id);
  }
  return signals;
}

function validateHandoffFacts(
  value: unknown,
  threadKeys: ReadonlySet<string>,
): readonly CollaborationHandoffFactV1[] {
  if (!Array.isArray(value)) collaborationInvalid('handoff_facts must be an array');
  const seen = new Set<string>();
  return value.map((entry) => {
    if (!isCollaborationRecord(entry)) collaborationInvalid('handoff fact must be an object');
    const threadKey = entry.thread_key;
    if (typeof threadKey !== 'string'
      || threadKey.length === 0
      || Buffer.byteLength(threadKey, 'utf8') > COLLABORATION_THREAD_KEY_MAX_BYTES) {
      collaborationInvalid('handoff fact thread_key is invalid');
    }
    // A handoff on a lane the source set does not contain cannot be projected:
    // its thread has no signals, so no latest event and no recency. Rather than
    // invent an empty lane, the caller is told its facts and its signals
    // disagree about which snapshot is being projected.
    if (!threadKeys.has(threadKey)) {
      collaborationInvalid(`handoff fact names a thread absent from the source set: ${threadKey}`);
    }
    const handoffId = validateCollaborationRecordId(entry.handoff_id, 'handoff fact handoff_id');
    if (seen.has(handoffId)) collaborationInvalid(`duplicate handoff fact: ${handoffId}`);
    seen.add(handoffId);
    const adoptionCount = entry.adoption_count;
    if (typeof adoptionCount !== 'number' || !Number.isInteger(adoptionCount) || adoptionCount < 0) {
      collaborationInvalid('handoff fact adoption_count is invalid');
    }
    return Object.freeze({ thread_key: threadKey, handoff_id: handoffId, adoption_count: adoptionCount });
  });
}

/**
 * Every outgoing reference a signal declares, in one list. Exported so the
 * context packet's `source_reference` retrieval reason walks the same edges the
 * cross-thread count does, instead of keeping a second opinion about what
 * counts as a reference.
 */
export function collaborationReferencedSignalIds(signal: CoordinationSignalV1): readonly string[] {
  return [
    ...(signal.reply_to_signal_id === null ? [] : [signal.reply_to_signal_id]),
    ...(signal.supersedes_signal_id === null ? [] : [signal.supersedes_signal_id]),
    ...signal.source_signal_ids,
  ];
}

interface ThreadAccumulator {
  readonly thread_key: string;
  readonly signals: CoordinationSignalV1[];
  readonly crossing_signal_ids: Set<string>;
}

export interface ProjectCollaborationThreadsInput {
  readonly signals: readonly CoordinationSignalV1[];
  readonly handoff_facts?: readonly CollaborationHandoffFactV1[];
}

export function projectCollaborationThreads(
  input: ProjectCollaborationThreadsInput,
): CollaborationThreadProjectionV1 {
  const signals = validateSourceSignals(input.signals);
  const sourceSnapshotSha256 = collaborationSourceSnapshotDigest(signals);

  const lanes = new Map<string, ThreadAccumulator>();
  const threadOf = new Map<string, string>();
  for (const signal of signals) {
    threadOf.set(signal.signal_id, signal.thread_key);
    // Exact equality is the whole aggregation rule. No trimming, no case
    // folding, no fuzzy merge: two keys that differ by one byte are two lanes.
    const lane = lanes.get(signal.thread_key)
      ?? { thread_key: signal.thread_key, signals: [], crossing_signal_ids: new Set<string>() };
    lane.signals.push(signal);
    lanes.set(signal.thread_key, lane);
  }

  const facts = validateHandoffFacts(input.handoff_facts ?? [], new Set(lanes.keys()));

  /**
   * Cross-lane edges. An edge counts once per unordered endpoint pair even when
   * a signal both replies to and cites the same record, and only when the target
   * is present in the source set — a reference the snapshot cannot resolve is
   * not evidence of a link between two lanes it can see. Both endpoints count
   * it: being cited from another lane is as much a reason to look as citing one.
   */
  const countedEdges = new Set<string>();
  for (const signal of signals) {
    for (const targetId of collaborationReferencedSignalIds(signal)) {
      const targetThread = threadOf.get(targetId);
      if (targetThread === undefined || targetThread === signal.thread_key) continue;
      const edge = `${signal.signal_id} ${targetId}`;
      if (countedEdges.has(edge)) continue;
      countedEdges.add(edge);
      lanes.get(signal.thread_key)!.crossing_signal_ids.add(signal.signal_id);
      lanes.get(targetThread)!.crossing_signal_ids.add(targetId);
    }
  }
  const crossingEdgeCount = new Map<string, number>();
  for (const edge of countedEdges) {
    const [fromId, toId] = edge.split(' ') as [string, string];
    for (const threadKey of [threadOf.get(fromId)!, threadOf.get(toId)!]) {
      crossingEdgeCount.set(threadKey, (crossingEdgeCount.get(threadKey) ?? 0) + 1);
    }
  }

  const epochMs = signals.length === 0
    ? null
    : signals.reduce((latest, signal) => Math.max(latest, parseInstant(signal.created_at)), Number.NEGATIVE_INFINITY);
  const epochAt = epochMs === null ? null : latestTimestamp(signals, epochMs);

  const snapshots = [...lanes.values()].map((lane) => {
    const ordered = [...lane.signals].sort((left, right) => {
      const byTime = parseInstant(left.created_at) - parseInstant(right.created_at);
      return byTime !== 0 ? byTime : byText(left.signal_id, right.signal_id);
    });
    const latestMs = ordered.reduce((latest, signal) => Math.max(latest, parseInstant(signal.created_at)), Number.NEGATIVE_INFINITY);
    const latestSignalAt = latestTimestamp(ordered, latestMs);
    const laneFacts = facts.filter((fact) => fact.thread_key === lane.thread_key);
    const basis = {
      thread_key: lane.thread_key,
      signal_count: ordered.length,
      distinct_contributor_count: new Set(ordered.map((signal) => collaborationActorLineage(signal.actor))).size,
      latest_signal_at: latestSignalAt,
      artifact_ref_count: ordered.reduce((total, signal) => total + signal.artifact_refs.length, 0),
      unadopted_handoff_count: laneFacts.filter((fact) => fact.adoption_count === 0).length,
      adoption_count: laneFacts.reduce((total, fact) => total + fact.adoption_count, 0),
      cross_thread_reference_count: crossingEdgeCount.get(lane.thread_key) ?? 0,
      recency_rank: collaborationRecencyRank(epochMs!, latestMs),
    };
    const scored = { ...basis, hotspot_score: collaborationHotspotScore(basis) };
    return {
      lane,
      ordered,
      laneFacts,
      snapshot: Object.freeze({
        ...scored,
        thread_sha256: canonicalCollaborationDigest(scored),
      }) as CollaborationThreadSnapshotV1,
    };
  });

  // Attention ordering: hottest first, then the opaque key. The key tiebreak is
  // what makes the order total, so two threads that score identically never
  // swap between rebuilds.
  snapshots.sort((left, right) => {
    const byScore = right.snapshot.hotspot_score - left.snapshot.hotspot_score;
    return byScore !== 0 ? byScore : byText(left.snapshot.thread_key, right.snapshot.thread_key);
  });

  const opportunities = snapshots.flatMap(({ lane, ordered, laneFacts, snapshot }) =>
    projectOpportunities(snapshot, ordered, laneFacts, lane.crossing_signal_ids));

  const projectionBasis = {
    epoch_at: epochAt,
    signal_count: signals.length,
    threads: snapshots.map((entry) => entry.snapshot),
    opportunities,
    source_snapshot_sha256: sourceSnapshotSha256,
  };
  return Object.freeze({
    ...projectionBasis,
    threads: Object.freeze(projectionBasis.threads),
    opportunities: Object.freeze(projectionBasis.opportunities),
    projection_sha256: canonicalCollaborationDigest(projectionBasis as unknown as Readonly<Record<string, unknown>>),
  });
}

function boundedRefs(ids: readonly string[]): readonly string[] {
  return Object.freeze(ids.slice(0, COLLABORATION_OPPORTUNITY_SOURCE_REF_MAX_COUNT));
}

/**
 * Reasons a lane is worth contributing to, in the closed set's own order. Each
 * predicate is a comparison between counts already on the snapshot, so a reader
 * can re-derive every reason from the projection without re-reading a body.
 *
 * `exploration_slot` is the residue by construction: a lane that triggers no
 * structural reason is exactly the lane heat would never surface, so it becomes
 * the exploration pool rather than disappearing. Every lane therefore carries at
 * least one opportunity.
 */
function projectOpportunities(
  snapshot: CollaborationThreadSnapshotV1,
  ordered: readonly CoordinationSignalV1[],
  laneFacts: readonly CollaborationHandoffFactV1[],
  crossingSignalIds: ReadonlySet<string>,
): readonly CollaborationContributionOpportunityV1[] {
  const signalIds = ordered.map((signal) => signal.signal_id);
  const found: CollaborationContributionOpportunityV1[] = [];
  const add = (reason: ContributionOpportunityReason, refs: readonly string[]): void => {
    found.push(Object.freeze({ thread_key: snapshot.thread_key, reason, source_refs: boundedRefs(refs) }));
  };

  if (snapshot.unadopted_handoff_count > 0) {
    add('unadopted_handoff', laneFacts.filter((fact) => fact.adoption_count === 0).map((fact) => fact.handoff_id).sort(byText));
  }
  if (collaborationHasLowContributorCoverage(snapshot.signal_count, snapshot.distinct_contributor_count)) {
    add('low_contributor_coverage', signalIds);
  }
  if (snapshot.cross_thread_reference_count > 0) {
    // Only the signals actually on a crossing edge: the reason is the link, so
    // naming the whole lane would hand the reader refs that evidence nothing.
    add('cross_thread_reference', [...crossingSignalIds].sort(byText));
  }
  if (snapshot.recency_rank === COLLABORATION_RECENCY_RANK_MAX) {
    add('recent_activity', ordered.filter((signal) => signal.created_at === snapshot.latest_signal_at).map((signal) => signal.signal_id));
  }
  if (snapshot.artifact_ref_count >= COLLABORATION_ARTIFACT_RICH_MIN_REFS) {
    add('artifact_rich_thread', ordered.filter((signal) => signal.artifact_refs.length > 0).map((signal) => signal.signal_id));
  }
  if (found.length === 0) add('exploration_slot', signalIds);
  return Object.freeze(found);
}
