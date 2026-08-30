/**
 * The collaborative Work Exchange collector — the store reader C2 declared and
 * left unwired.
 *
 * Sprint row C6. C2's context-packet builder refuses to synthesize
 * `snapshot_consistency` or `handoff_facts` and names this layer as the only one
 * that can supply either. This module is that layer: it reads the real stores,
 * observes whether they held still, and hands both facts to the pure projections
 * as inputs.
 *
 * **Double read, and what each outcome means.** Every mutable source is read
 * twice and the two reads are compared by canonical bytes:
 *
 * - identical — the source held still for the whole collection;
 * - different — a writer committed between the reads, so the snapshot describes
 *   a moment that has already passed and is marked `changed_during_read`;
 * - unreadable — the source could not be established at all, marked `degraded`.
 *
 * The snapshot is built from the second read, never from a merge of the two. A
 * merge would produce a set that no single moment ever contained, and
 * `source_snapshot_sha256` would then identify a state that never existed.
 *
 * **Why the primary source throws and the rest degrade.** Signals are what every
 * projection here is derived from. Without them there is no source set, no
 * thread order and no honest `source_snapshot_sha256` — a snapshot built over an
 * unreadable signal shard would be a digest of nothing, so the collection fails
 * closed instead. Handoffs, adoptions and execution offers are additive: their
 * absence leaves counts at zero, which reads exactly like "there are none". That
 * is a fabrication unless it is marked, and `degraded` is the mark. Every
 * consumer that builds injectable context refuses a non-`stable` snapshot, so a
 * degraded read cannot become a Worker's context; it remains readable only as
 * what it is, an incomplete view that says so.
 *
 * **Visibility needs no filter here.** C4 keeps an uncommitted Worker record in
 * `contribution-candidates/<run>/`, a directory the public listers never open,
 * so reading `signals/` and `handoffs/` yields committed Worker records plus
 * direct Module Engineer records and nothing else. There is no promotion check
 * to remember because there is no unpromoted record in the set being read.
 *
 * **Execution offers arrive through a seam.** Offer eligibility needs an
 * `EngineerPrincipalV1`, the repo registry and the Work Graph — an authority
 * that lives entirely in the scheduling plane. Resolving it here would put a
 * second copy of that resolution in the collaboration plane, so the caller
 * supplies a reader and this module only double-reads whatever it returns. The
 * offers themselves are carried through untouched.
 *
 * Zero filesystem write. Nothing in this module opens a file for writing, and
 * nothing it calls does either.
 */
import { realpathSync } from 'fs';

import {
  CollaborationError,
  canonicalCollaborationBytes,
  type CollaborationMode,
} from '../../core/collaboration/common';
import type { CollaborationSnapshotConsistency } from '../../core/collaboration/context-packet';
import {
  canonicalWorkStateHandoffBytes,
  type WorkStateHandoffV1,
} from '../../core/collaboration/handoff';
import { canonicalCoordinationSignalBytes, type CoordinationSignalV1 } from '../../core/collaboration/signal';
import type { CollaborationHandoffFactV1 } from '../../core/collaboration/thread-projection';
import {
  buildCollaborativeWorkExchangeSnapshot,
  type CollaborationExecutionContextProofV1,
  type CollaborativeWorkExchangeSnapshotV1,
} from '../../core/collaboration/work-exchange';
import { canonicalHandoffAdoptionReceiptBytes } from '../../core/collaboration/adoption';
import type { HandoffAdoptionReceiptV1 } from '../../core/collaboration/adoption';
import type { EngineerOfferV1 } from '../../core/engineers/scheduling';
import { canonicalEngineerJson } from '../../core/engineers/profile-binding';
import { repoHarnessRepoIdFor } from '../repo-registry';
import { listHandoffAdoptionReceipts } from './adoption-store';
import { readCollaborationMode } from './feature-flag';
import { listWorkStateHandoffs } from './handoff-store';
import { collaborationUnavailable } from './record-store';
import { listCoordinationSignals } from './signal-store';
import { resolveBoundTaskSuccession } from './succession';

/** The sources a collection reads, named so a refusal can point at one. */
export const COLLABORATION_EXCHANGE_SOURCES = [
  'signals',
  'handoffs',
  'adoptions',
  'execution_offers',
] as const;

export type CollaborationExchangeSource = (typeof COLLABORATION_EXCHANGE_SOURCES)[number];

/** The worst observation wins; the order is the severity order. */
const CONSISTENCY_SEVERITY: Readonly<Record<CollaborationSnapshotConsistency, number>> = {
  stable: 0,
  changed_during_read: 1,
  degraded: 2,
};

type Observation<T> =
  | { readonly outcome: 'stable' | 'changed_during_read'; readonly value: T }
  | { readonly outcome: 'degraded'; readonly cause: unknown };

/**
 * Read one source twice and classify what happened in between.
 *
 * The comparison is on canonical bytes rather than on record counts: two reads
 * that both return three records but disagree about one of them changed just as
 * much as two reads of different lengths, and a count comparison would call that
 * stable.
 */
function observe<T>(read: () => T, canonical: (value: T) => string): Observation<T> {
  let first: T;
  let second: T;
  try {
    first = read();
    second = read();
  } catch (cause) {
    return { outcome: 'degraded', cause };
  }
  return {
    outcome: canonical(first) === canonical(second) ? 'stable' : 'changed_during_read',
    value: second,
  };
}

function signalSetBytes(signals: readonly CoordinationSignalV1[]): string {
  return signals.map((signal) => canonicalCoordinationSignalBytes(signal)).join('\n');
}

function handoffSetBytes(handoffs: readonly WorkStateHandoffV1[]): string {
  return handoffs.map((handoff) => canonicalWorkStateHandoffBytes(handoff)).join('\n');
}

function adoptionSetBytes(receipts: readonly HandoffAdoptionReceiptV1[]): string {
  return receipts.map((receipt) => canonicalHandoffAdoptionReceiptBytes(receipt)).join('\n');
}

function offerSetBytes(offers: readonly EngineerOfferV1[]): string {
  return offers.map((offer) => canonicalEngineerJson(offer)).join('\n');
}

export interface CollectCollaborativeWorkExchangeInput {
  readonly repo_root: string;
  /**
   * The scheduling plane's own answer about what this participant could pick up.
   * Required rather than defaulted: an absent reader would make an empty offer
   * list indistinguishable from "the caller did not ask", and the collector has
   * no principal with which to ask on its behalf.
   */
  readonly read_execution_offers: () => readonly EngineerOfferV1[];
}

export interface CollaborativeWorkExchangeCollectionV1 {
  readonly snapshot: CollaborativeWorkExchangeSnapshotV1;
  /** The exact signal set the snapshot was built from, for the context packet. */
  readonly signals: readonly CoordinationSignalV1[];
  readonly handoffs: readonly WorkStateHandoffV1[];
  /** C2's declared seam, now carrying real C3 records. */
  readonly handoff_facts: readonly CollaborationHandoffFactV1[];
  readonly snapshot_consistency: CollaborationSnapshotConsistency;
  readonly degraded_sources: readonly CollaborationExchangeSource[];
  readonly changed_sources: readonly CollaborationExchangeSource[];
  readonly mode: CollaborationMode;
}

/**
 * Prove each `bound_task` execution context against the Task freeze store, and
 * report the verdict per handoff.
 *
 * Verify-or-exclude, not verify-or-flag. C4's delegated-worker contribution path
 * persists an `execution_context` the Worker supplied, and
 * `publishWorkStateHandoff()` validates that branch for shape only — so a
 * persisted `bound_task` context can name any Claim, any generation and any
 * freeze digest. `resolveBoundTaskSuccession()` re-derives the whole branch from
 * the receipt it names and compares canonical bytes, which is the only read that
 * turns the branch back into a fact.
 *
 * A failed proof withholds the context rather than publishing it beside a
 * boolean. A flag would put an unproven Claim id and Lease generation into the
 * read model and make every downstream reader responsible for remembering to
 * check it; the repository's rule for an authoritative value that will not
 * verify is to surface the failure, not to pass the value along with a caveat.
 * The handoff itself still projects — the knowledge in it was never the forged
 * part — and `unverified_execution_context_count` on the snapshot is the visible
 * consequence.
 */
function proveExecutionContexts(
  repoRoot: string,
  handoffs: readonly WorkStateHandoffV1[],
): readonly CollaborationExecutionContextProofV1[] {
  return handoffs
    .filter((handoff) => handoff.execution_context.kind === 'bound_task')
    .map((handoff) => {
      try {
        resolveBoundTaskSuccession(repoRoot, handoff);
        return { handoff_id: handoff.handoff_id, verified: true };
      } catch (error) {
        // Only a decided verdict is swallowed. An unresolvable receipt and a
        // context that disagrees with a resolvable one are both "this branch is
        // not proven", which is what the caller asked. Anything else — a broken
        // store, a programming error — is not a verdict and must not be
        // laundered into one.
        if (error instanceof CollaborationError || isTaskFreezeVerdict(error)) {
          return { handoff_id: handoff.handoff_id, verified: false };
        }
        throw error;
      }
    });
}

/**
 * A Task freeze failure that answers the question rather than preventing it from
 * being asked. `readTaskFreezeReceipt()` reports an unresolvable digest and a
 * missing task directory through its own typed error, and both mean the same
 * thing here: the receipt this context names cannot be produced, so the context
 * is not proven.
 */
function isTaskFreezeVerdict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as unknown as { readonly code?: unknown }).code;
  return typeof code === 'string' && code.startsWith('task_freeze_');
}

export function collectCollaborativeWorkExchange(
  input: CollectCollaborativeWorkExchangeInput,
): CollaborativeWorkExchangeCollectionV1 {
  const repoRoot = realpathSync(input.repo_root);
  const mode = readCollaborationMode(repoRoot);

  const signalObservation = observe(() => listCoordinationSignals(repoRoot), signalSetBytes);
  if (signalObservation.outcome === 'degraded') {
    // The one source whose absence leaves nothing to describe. Every projection
    // below is derived from the signal set, so there is no partial snapshot to
    // mark here — only a digest over records the collector never saw.
    return collaborationUnavailable(
      'collaborative work exchange signals are unreadable; no snapshot can be derived',
      signalObservation.cause,
    );
  }
  const handoffObservation = observe(() => listWorkStateHandoffs(repoRoot), handoffSetBytes);
  const adoptionObservation = observe(() => listHandoffAdoptionReceipts(repoRoot), adoptionSetBytes);
  const offerObservation = observe(input.read_execution_offers, offerSetBytes);

  const observations: readonly (readonly [CollaborationExchangeSource, Observation<unknown>])[] = [
    ['signals', signalObservation],
    ['handoffs', handoffObservation],
    ['adoptions', adoptionObservation],
    ['execution_offers', offerObservation],
  ];
  const degradedSources = observations
    .filter(([, entry]) => entry.outcome === 'degraded')
    .map(([source]) => source);
  const changedSources = observations
    .filter(([, entry]) => entry.outcome === 'changed_during_read')
    .map(([source]) => source);
  const snapshotConsistency = observations
    .map(([, entry]) => entry.outcome)
    .reduce<CollaborationSnapshotConsistency>(
      (worst, outcome) => (CONSISTENCY_SEVERITY[outcome] > CONSISTENCY_SEVERITY[worst] ? outcome : worst),
      'stable',
    );

  const signals = signalObservation.value;
  const handoffs = handoffObservation.outcome === 'degraded' ? [] : handoffObservation.value;
  const adoptions = adoptionObservation.outcome === 'degraded' ? [] : adoptionObservation.value;
  const offers = offerObservation.outcome === 'degraded' ? [] : offerObservation.value;

  const adoptionCounts = new Map<string, number>();
  for (const receipt of adoptions) {
    adoptionCounts.set(receipt.handoff_id, (adoptionCounts.get(receipt.handoff_id) ?? 0) + 1);
  }

  const snapshot = buildCollaborativeWorkExchangeSnapshot({
    repository_id: repoHarnessRepoIdFor(repoRoot),
    execution_offers: offers,
    signals,
    handoffs,
    adoption_counts: handoffs.map((handoff) => ({
      handoff_id: handoff.handoff_id,
      adoption_count: adoptionCounts.get(handoff.handoff_id) ?? 0,
    })),
    execution_context_proofs: proveExecutionContexts(repoRoot, handoffs),
    snapshot_consistency: snapshotConsistency,
  });

  // The same facts the snapshot's threads were counted from, handed back so the
  // context packet is built over one collection rather than a second read that
  // could disagree with the first.
  const threadKeys = new Set(signals.map((signal) => signal.thread_key));
  const handoffFacts = snapshot.open_handoffs
    .filter((summary) => threadKeys.has(summary.thread_key))
    .map((summary) => Object.freeze({
      thread_key: summary.thread_key,
      handoff_id: summary.handoff_id,
      adoption_count: summary.adoption_count,
    }));

  return Object.freeze({
    snapshot,
    signals,
    handoffs,
    handoff_facts: Object.freeze(handoffFacts),
    snapshot_consistency: snapshotConsistency,
    degraded_sources: Object.freeze(degradedSources),
    changed_sources: Object.freeze(changedSources),
    mode,
  });
}

/** The canonical bytes of a collected snapshot, for a byte-identity comparison. */
export function canonicalCollaborativeWorkExchangeBytes(
  snapshot: CollaborativeWorkExchangeSnapshotV1,
): string {
  return canonicalCollaborationBytes(snapshot as unknown as Readonly<Record<string, unknown>>);
}
