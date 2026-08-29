/**
 * The deterministic hotspot function.
 *
 * Sprint row C2. A hotspot score is attention ordering and nothing else: Child
 * PRD A fixes it as an input to Work Exchange ordering, context selection and
 * recommended exploration, and forbids it from reaching Work Graph priority,
 * dependency, Task state or Lease eligibility. This module imports nothing from
 * the delivery plane, so there is no path by which a score could reach one.
 *
 * Two properties make the score reproducible from committed bytes alone.
 *
 * It is integer-only. Every term is a capped non-negative integer times a fixed
 * integer weight, so the sum is exact. A float weight would put a value with a
 * platform-dependent decimal expansion inside `thread_sha256`, and the row's
 * byte-identical requirement would hold only until someone summed the terms in
 * a different order.
 *
 * It never reads a clock. Recency is the distance from the *source snapshot's
 * own epoch* — the latest `created_at` in the signal set being projected — to
 * the thread's latest signal, bucketed into a small rank. Wall-clock recency
 * would mean the same store rebuilt a minute later scored differently, which is
 * exactly the property the acceptance line rules out.
 */
import { collaborationInvalid } from './common';

/**
 * Bucket boundaries in milliseconds, ascending. A thread whose latest signal is
 * within the first boundary of the epoch gets the top rank; past the last
 * boundary the term contributes nothing. Durations, not timestamps: the ladder
 * is measured against the snapshot epoch, never against `Date.now()`.
 */
export const COLLABORATION_RECENCY_BUCKET_BOUNDARIES_MS = [
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  72 * 60 * 60 * 1000,
] as const;

export const COLLABORATION_RECENCY_RANK_MAX = COLLABORATION_RECENCY_BUCKET_BOUNDARIES_MS.length;

/**
 * A thread carries low contributor coverage when it has accumulated signals but
 * still only one participant lineage. That is a structural fact, not a judgement
 * about the thread's health: it says a second pair of eyes has not looked yet.
 */
export const COLLABORATION_LOW_COVERAGE_MAX_CONTRIBUTORS = 1;
export const COLLABORATION_LOW_COVERAGE_MIN_SIGNALS = 2;
export const COLLABORATION_LOW_COVERAGE_BONUS = 7;

/** A thread carrying at least this many artifact references is evidence-dense. */
export const COLLABORATION_ARTIFACT_RICH_MIN_REFS = 2;

export interface CollaborationHotspotInputV1 {
  readonly signal_count: number;
  readonly distinct_contributor_count: number;
  readonly artifact_ref_count: number;
  readonly unadopted_handoff_count: number;
  readonly cross_thread_reference_count: number;
  readonly recency_rank: number;
}

/**
 * The weighted terms, in a fixed order. Each contribution is capped before it is
 * weighted, so no single dimension can dominate: a thread with two hundred
 * signals and one contributor cannot outrank a thread that is fresh, referenced
 * across lanes and evidence-dense. The caps are what make
 * `COLLABORATION_HOTSPOT_SCORE_MAX` a real bound rather than a hope, and the
 * bound is what lets the context quota promise that the hottest thread cannot
 * take the whole budget.
 */
const HOTSPOT_TERMS: readonly {
  readonly field: keyof CollaborationHotspotInputV1;
  readonly weight: number;
  readonly cap: number;
}[] = [
  { field: 'recency_rank', weight: 8, cap: COLLABORATION_RECENCY_RANK_MAX },
  { field: 'distinct_contributor_count', weight: 5, cap: 6 },
  { field: 'signal_count', weight: 3, cap: 12 },
  { field: 'artifact_ref_count', weight: 4, cap: 8 },
  { field: 'unadopted_handoff_count', weight: 6, cap: 4 },
  { field: 'cross_thread_reference_count', weight: 4, cap: 6 },
];

export const COLLABORATION_HOTSPOT_SCORE_MAX = HOTSPOT_TERMS.reduce(
  (total, term) => total + term.weight * term.cap,
  COLLABORATION_LOW_COVERAGE_BONUS,
);

function count(value: unknown, field: string, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    collaborationInvalid(`hotspot ${field} is invalid`);
  }
  if (value > maximum) collaborationInvalid(`hotspot ${field} exceeds ${maximum}`);
  return value;
}

/**
 * The recency rank of one thread inside one snapshot. `epochMs` is the snapshot
 * epoch and `latestMs` the thread's latest signal; a thread later than the epoch
 * is impossible, because the epoch is defined as the maximum over the same set,
 * so it is a caller error rather than a clamped-to-zero silent repair.
 */
export function collaborationRecencyRank(epochMs: number, latestMs: number): number {
  if (!Number.isInteger(epochMs) || !Number.isInteger(latestMs)) {
    collaborationInvalid('recency inputs must be integer milliseconds');
  }
  const age = epochMs - latestMs;
  if (age < 0) collaborationInvalid('a thread cannot be newer than the snapshot epoch');
  for (const [index, boundary] of COLLABORATION_RECENCY_BUCKET_BOUNDARIES_MS.entries()) {
    if (age <= boundary) return COLLABORATION_RECENCY_RANK_MAX - index;
  }
  return 0;
}

export function collaborationHotspotScore(input: CollaborationHotspotInputV1): number {
  const recencyRank = count(input.recency_rank, 'recency_rank', COLLABORATION_RECENCY_RANK_MAX);
  const signalCount = count(input.signal_count, 'signal_count', Number.MAX_SAFE_INTEGER);
  const contributors = count(input.distinct_contributor_count, 'distinct_contributor_count', Number.MAX_SAFE_INTEGER);
  if (contributors > signalCount) {
    collaborationInvalid('hotspot distinct_contributor_count exceeds signal_count');
  }
  const values: Readonly<Record<keyof CollaborationHotspotInputV1, number>> = {
    recency_rank: recencyRank,
    signal_count: signalCount,
    distinct_contributor_count: contributors,
    artifact_ref_count: count(input.artifact_ref_count, 'artifact_ref_count', Number.MAX_SAFE_INTEGER),
    unadopted_handoff_count: count(input.unadopted_handoff_count, 'unadopted_handoff_count', Number.MAX_SAFE_INTEGER),
    cross_thread_reference_count: count(input.cross_thread_reference_count, 'cross_thread_reference_count', Number.MAX_SAFE_INTEGER),
  };
  const weighted = HOTSPOT_TERMS.reduce(
    (total, term) => total + term.weight * Math.min(values[term.field], term.cap),
    0,
  );
  const lowCoverage = contributors <= COLLABORATION_LOW_COVERAGE_MAX_CONTRIBUTORS
    && signalCount >= COLLABORATION_LOW_COVERAGE_MIN_SIGNALS;
  return weighted + (lowCoverage ? COLLABORATION_LOW_COVERAGE_BONUS : 0);
}

/** The structural low-coverage predicate, shared with the opportunity projection. */
export function collaborationHasLowContributorCoverage(
  signalCount: number,
  distinctContributorCount: number,
): boolean {
  return distinctContributorCount <= COLLABORATION_LOW_COVERAGE_MAX_CONTRIBUTORS
    && signalCount >= COLLABORATION_LOW_COVERAGE_MIN_SIGNALS;
}
