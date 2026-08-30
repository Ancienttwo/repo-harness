/**
 * The bounded agent surface: what a Module Engineer may read and write on the
 * collaboration plane, stated once for both the CLI and the MCP tool set.
 *
 * Sprint row C7. The CLI command family and the Engineer MCP profile are two
 * adapters over this module, not two implementations. That matters for three
 * invariants that would otherwise have to be remembered twice:
 *
 * - **The actor is never a parameter.** Nothing here accepts, builds or forwards
 *   a `CollaborationActorRefV1`. A caller supplies an authorization id; the store
 *   derives the author from it through C1's `resolveModuleEngineerActor()`. There
 *   is no field an adapter could thread a caller-declared identity into.
 * - **The destination is not a parameter either.** Every write here is a direct
 *   Module Engineer publication, so `destination` is fixed to `public`. C4's
 *   `authorizeCollaborationDestination()` already refuses anything else for a
 *   `module_engineer`; exposing the field would only create a value a caller
 *   could aim at another run's candidate area and be refused for.
 * - **Recorded time is not a parameter.** `persisted_observation` belongs to a
 *   delegated run's collector, which takes the instant from the run the Host
 *   persisted. A direct publication freezes the clock on its first idempotency
 *   event, which is `first_publication` and nothing a caller chooses.
 *
 * **Reads are served with the flag off; mutations are not.** This is C1-C6's
 * existing convention rather than a new decision: each store calls
 * `assertCollaborationMutationEnabled()` for itself, and
 * `collectCollaborativeWorkExchange()` reads the mode, reports it on the
 * collection and returns a snapshot regardless. A read surface that refused when
 * the flag is off would make the flag unobservable through the very surface an
 * operator would use to observe it. Every payload below carries `mode`, so the
 * answer is never implicit.
 *
 * **The untrusted marking is a pass-through, not a second producer.**
 * `renderCollaborationContext()` is the only thing that emits a
 * `[CoordinationContextUntrusted]` block, and `decomposeCollaborationGoal()`
 * depends on exactly one such line existing inside a composed goal. Wrapping
 * arbitrary tool JSON in the same markers would mint a second producer and make
 * that split ambiguous, so `collaborationContextPacketBuild()` returns C6's
 * rendering verbatim — markers intact — while every other payload carries
 * `content_trust`, which repeats the frozen warning text without repeating the
 * markers.
 *
 * Nothing here writes a Task, Lease, Publication or Acceptance byte, and nothing
 * here dispatches, admits or collects a delegated run.
 */
import { realpathSync } from 'fs';

import {
  COLLABORATION_CONTEXT_WARNING,
  type CollaborationContextPacketV1,
  type CollaborationHandoffRefV1,
} from '../../core/collaboration/context-packet';
import type {
  CollaborationMode,
  CollaborationArtifactRefV1,
  CollaborationScopeRefV1,
} from '../../core/collaboration/common';
import type {
  HandoffAttemptedPathV1,
  HandoffExecutionContextV1,
  WorkStateHandoffTrigger,
  WorkStateHandoffV1,
} from '../../core/collaboration/handoff';
import type { CoordinationSignalV1 } from '../../core/collaboration/signal';
import type {
  CollaborationContributionOpportunityV1,
  CollaborationThreadSnapshotV1,
} from '../../core/collaboration/thread-projection';
import type { CollaborativeWorkExchangeSnapshotV1 } from '../../core/collaboration/work-exchange';
import type { EngineerOfferV1 } from '../../core/engineers/scheduling';
import { collectEngineerOffers } from '../engineers/scheduling';
import { resolveEngineerPrincipal } from '../engineers/principal';
import { engineerPrincipalAuthorization } from './actor';
import { adoptWorkStateHandoff, listHandoffAdoptionReceipts } from './adoption-store';
import {
  deliverCollaborationContext,
  readCollaborationContextPacket,
  type CollaborationContextDeliveryV1,
} from './context-delivery';
import { assertCollaborationMutationEnabled, readCollaborationMode } from './feature-flag';
import { listWorkStateHandoffs, publishWorkStateHandoff } from './handoff-store';
import { collaborationUnavailable } from './record-store';
import { listCoordinationSignals, publishCoordinationSignal } from './signal-store';
import {
  collectCollaborativeWorkExchange,
  type CollaborativeWorkExchangeCollectionV1,
} from './work-exchange';

/**
 * The marking every collaboration payload carries. `kind` is what a caller
 * branches on; `warning` is the same frozen sentence the untrusted block itself
 * opens with, so the two surfaces cannot drift into two different warnings.
 */
export interface CollaborationContentTrustV1 {
  readonly kind: 'untrusted_coordination_context';
  readonly warning: typeof COLLABORATION_CONTEXT_WARNING;
}

export const COLLABORATION_CONTENT_TRUST: CollaborationContentTrustV1 = Object.freeze({
  kind: 'untrusted_coordination_context' as const,
  warning: COLLABORATION_CONTEXT_WARNING,
});

/** How a caller of this surface identifies itself: an authorization, never an actor. */
export interface CollaborationSurfaceContext {
  readonly repo_root: string;
  readonly authorization_id: string;
  readonly env?: NodeJS.ProcessEnv;
}

function marked<T extends object>(mode: CollaborationMode, value: T): T & {
  readonly mode: CollaborationMode;
  readonly content_trust: CollaborationContentTrustV1;
} {
  return Object.freeze({ mode, content_trust: COLLABORATION_CONTENT_TRUST, ...value });
}

function surfaceRoot(context: CollaborationSurfaceContext): string {
  if (typeof context.authorization_id !== 'string' || context.authorization_id.trim() === '') {
    return collaborationUnavailable('an authenticated authorization id is required on the collaboration surface');
  }
  return realpathSync(context.repo_root);
}

/**
 * Collect the exchange for one authenticated participant.
 *
 * `read_execution_offers` is required by the collector and is answered by the
 * scheduling plane for this exact principal, because an absent reader would make
 * an empty offer list indistinguishable from "the caller did not ask". When
 * scheduling refuses — an unregistered repository, a stale principal — the read
 * fails with that refusal rather than reporting zero offers, which would be this
 * surface inventing an answer the scheduling plane declined to give.
 */
function readExecutionOffersFor(
  repoRoot: string,
  context: CollaborationSurfaceContext,
): readonly EngineerOfferV1[] {
  const principal = resolveEngineerPrincipal({
    repo_root: repoRoot,
    authorization_id: context.authorization_id,
    env: context.env,
  });
  return collectEngineerOffers({ repo_root: repoRoot, principal, env: context.env }).offers;
}

function collect(
  repoRoot: string,
  context: CollaborationSurfaceContext,
): CollaborativeWorkExchangeCollectionV1 {
  return collectCollaborativeWorkExchange({
    repo_root: repoRoot,
    // Called once per collector pass, on purpose. Hoisting the read out of the
    // callback would make the offer source look stable to the double read that
    // exists to notice it moving.
    read_execution_offers: () => readExecutionOffersFor(repoRoot, context),
  });
}

export interface CollaborationExchangeViewV1 {
  readonly mode: CollaborationMode;
  readonly content_trust: CollaborationContentTrustV1;
  readonly snapshot: CollaborativeWorkExchangeSnapshotV1;
  readonly degraded_sources: readonly string[];
  readonly changed_sources: readonly string[];
}

export function collaborationExchangeView(
  context: CollaborationSurfaceContext,
): CollaborationExchangeViewV1 {
  const repoRoot = surfaceRoot(context);
  const collection = collect(repoRoot, context);
  return marked(collection.mode, {
    snapshot: collection.snapshot,
    degraded_sources: collection.degraded_sources,
    changed_sources: collection.changed_sources,
  });
}

export interface CollaborationThreadsViewV1 {
  readonly mode: CollaborationMode;
  readonly content_trust: CollaborationContentTrustV1;
  readonly threads: readonly CollaborationThreadSnapshotV1[];
  readonly contribution_opportunities: readonly CollaborationContributionOpportunityV1[];
  readonly source_snapshot_sha256: string;
  readonly snapshot_consistency: CollaborativeWorkExchangeSnapshotV1['snapshot_consistency'];
}

/**
 * Threads and hotspots, taken from the same collection the exchange returns.
 *
 * Nothing is re-derived here. `hotspot_score` and `recency_rank` already sit on
 * each thread snapshot, so a second call to `projectCollaborationThreads()` would
 * be a second answer that could disagree with `snapshot_sha256`.
 */
export function collaborationThreadsView(
  context: CollaborationSurfaceContext,
): CollaborationThreadsViewV1 {
  const repoRoot = surfaceRoot(context);
  const collection = collect(repoRoot, context);
  return marked(collection.mode, {
    threads: collection.snapshot.threads,
    contribution_opportunities: collection.snapshot.contribution_opportunities,
    source_snapshot_sha256: collection.snapshot.source_snapshot_sha256,
    snapshot_consistency: collection.snapshot.snapshot_consistency,
  });
}

export interface CollaborationSignalsViewV1 {
  readonly mode: CollaborationMode;
  readonly content_trust: CollaborationContentTrustV1;
  readonly signals: readonly CoordinationSignalV1[];
}

export function collaborationSignalsView(
  context: CollaborationSurfaceContext,
): CollaborationSignalsViewV1 {
  const repoRoot = surfaceRoot(context);
  resolveEngineerPrincipal({
    repo_root: repoRoot,
    authorization_id: context.authorization_id,
    env: context.env,
  });
  return marked(readCollaborationMode(repoRoot), { signals: listCoordinationSignals(repoRoot) });
}

export interface CollaborationHandoffsViewV1 {
  readonly mode: CollaborationMode;
  readonly content_trust: CollaborationContentTrustV1;
  readonly handoffs: readonly WorkStateHandoffV1[];
  readonly adoption_counts: readonly { readonly handoff_id: string; readonly adoption_count: number }[];
}

export function collaborationHandoffsView(
  context: CollaborationSurfaceContext,
): CollaborationHandoffsViewV1 {
  const repoRoot = surfaceRoot(context);
  resolveEngineerPrincipal({
    repo_root: repoRoot,
    authorization_id: context.authorization_id,
    env: context.env,
  });
  const handoffs = listWorkStateHandoffs(repoRoot);
  const receipts = listHandoffAdoptionReceipts(repoRoot);
  const counts = new Map<string, number>();
  for (const receipt of receipts) counts.set(receipt.handoff_id, (counts.get(receipt.handoff_id) ?? 0) + 1);
  return marked(readCollaborationMode(repoRoot), {
    handoffs,
    adoption_counts: Object.freeze(handoffs.map((handoff) => Object.freeze({
      handoff_id: handoff.handoff_id,
      adoption_count: counts.get(handoff.handoff_id) ?? 0,
    }))),
  });
}

export interface CollaborationSignalPostInput {
  readonly idempotency_key: string;
  readonly thread_key: string;
  readonly reply_to_signal_id: string | null;
  readonly scope_refs: readonly CollaborationScopeRefV1[];
  readonly labels: readonly string[];
  readonly title: string;
  readonly body: string;
  readonly artifact_refs: readonly CollaborationArtifactRefV1[];
  readonly source_signal_ids: readonly string[];
  readonly supersedes_signal_id: string | null;
}

export interface CollaborationSignalPostResultV1 {
  readonly mode: CollaborationMode;
  readonly content_trust: CollaborationContentTrustV1;
  readonly signal: CoordinationSignalV1;
  readonly created: boolean;
}

export function collaborationSignalPost(
  context: CollaborationSurfaceContext,
  input: CollaborationSignalPostInput,
): CollaborationSignalPostResultV1 {
  const repoRoot = surfaceRoot(context);
  const result = publishCoordinationSignal({
    repo_root: repoRoot,
    authorization: engineerPrincipalAuthorization(context.authorization_id),
    destination: { kind: 'public' },
    idempotency_key: input.idempotency_key,
    thread_key: input.thread_key,
    reply_to_signal_id: input.reply_to_signal_id,
    scope_refs: input.scope_refs,
    labels: input.labels,
    title: input.title,
    body: input.body,
    artifact_refs: input.artifact_refs,
    source_signal_ids: input.source_signal_ids,
    supersedes_signal_id: input.supersedes_signal_id,
    recorded_time: { kind: 'first_publication' },
    env: context.env,
  });
  return marked(result.mode, { signal: result.signal, created: result.created });
}

export interface CollaborationHandoffPublishInput {
  readonly idempotency_key: string;
  readonly thread_key: string;
  readonly scope_refs: readonly CollaborationScopeRefV1[];
  readonly trigger: WorkStateHandoffTrigger;
  readonly goal: string;
  readonly completed: readonly string[];
  readonly key_findings: readonly string[];
  readonly attempted_paths: readonly HandoffAttemptedPathV1[];
  readonly dead_ends: readonly string[];
  readonly open_hypotheses: readonly string[];
  readonly next_actions: readonly string[];
  readonly source_signal_ids: readonly string[];
  readonly execution_context: HandoffExecutionContextV1;
  readonly supersedes_handoff_id: string | null;
}

export interface CollaborationHandoffPublishResultV1 {
  readonly mode: CollaborationMode;
  readonly content_trust: CollaborationContentTrustV1;
  readonly handoff: WorkStateHandoffV1;
  readonly created: boolean;
}

export function collaborationHandoffPublish(
  context: CollaborationSurfaceContext,
  input: CollaborationHandoffPublishInput,
): CollaborationHandoffPublishResultV1 {
  const repoRoot = surfaceRoot(context);
  const result = publishWorkStateHandoff({
    repo_root: repoRoot,
    authorization: engineerPrincipalAuthorization(context.authorization_id),
    destination: { kind: 'public' },
    idempotency_key: input.idempotency_key,
    thread_key: input.thread_key,
    scope_refs: input.scope_refs,
    trigger: input.trigger,
    goal: input.goal,
    completed: input.completed,
    key_findings: input.key_findings,
    attempted_paths: input.attempted_paths,
    dead_ends: input.dead_ends,
    open_hypotheses: input.open_hypotheses,
    next_actions: input.next_actions,
    source_signal_ids: input.source_signal_ids,
    execution_context: input.execution_context,
    supersedes_handoff_id: input.supersedes_handoff_id,
    recorded_time: { kind: 'first_publication' },
    env: context.env,
  });
  return marked(result.mode, { handoff: result.handoff, created: result.created });
}

export interface CollaborationHandoffAdoptInput {
  readonly handoff_id: string;
  readonly context_packet_sha256: string;
}

export interface CollaborationHandoffAdoptResultV1 {
  readonly mode: CollaborationMode;
  readonly content_trust: CollaborationContentTrustV1;
  readonly receipt_id: string;
  readonly created: boolean;
}

export function collaborationHandoffAdopt(
  context: CollaborationSurfaceContext,
  input: CollaborationHandoffAdoptInput,
): CollaborationHandoffAdoptResultV1 {
  const repoRoot = surfaceRoot(context);
  const result = adoptWorkStateHandoff({
    repo_root: repoRoot,
    authorization: engineerPrincipalAuthorization(context.authorization_id),
    handoff_id: input.handoff_id,
    context_packet_sha256: input.context_packet_sha256,
    recorded_time: { kind: 'first_publication' },
    env: context.env,
  });
  return marked(result.mode, { receipt_id: result.receipt_id, created: result.created });
}

export interface CollaborationPacketReadResultV1 {
  readonly mode: CollaborationMode;
  readonly content_trust: CollaborationContentTrustV1;
  readonly packet: CollaborationContextPacketV1;
}

export function collaborationPacketRead(
  context: CollaborationSurfaceContext,
  packetSha256: string,
): CollaborationPacketReadResultV1 {
  const repoRoot = surfaceRoot(context);
  resolveEngineerPrincipal({
    repo_root: repoRoot,
    authorization_id: context.authorization_id,
    env: context.env,
  });
  const packet = readCollaborationContextPacket(repoRoot, packetSha256);
  if (packet === null) {
    return collaborationUnavailable(`collaboration context packet is unavailable: ${packetSha256}`);
  }
  return marked(readCollaborationMode(repoRoot), { packet });
}

export interface CollaborationPacketBuildInput {
  readonly base_goal: string;
  readonly subject_refs: readonly CollaborationScopeRefV1[];
  readonly handoff: CollaborationHandoffRefV1 | null;
  readonly budget_estimated_tokens: number | null;
}

export interface CollaborationPacketBuildResultV1 {
  readonly mode: CollaborationMode;
  readonly content_trust: CollaborationContentTrustV1;
  readonly packet: CollaborationContextPacketV1;
  /** C6's rendering, verbatim and with its untrusted markers intact. */
  readonly rendered_context: string;
  readonly composed_goal: string;
  readonly base_goal_sha256: string;
  readonly composed_goal_sha256: string;
}

/**
 * Build and persist one context packet, and return the rendering unmodified.
 *
 * The mutation gate is applied here rather than inside
 * `deliverCollaborationContext()` because C6 built that function as a Host step
 * inside a round the admission bridge had already gated; this row is the first
 * place a caller can trigger a packet write directly, so this is the boundary
 * that has to say no when the flag is off.
 */
export function collaborationPacketBuild(
  context: CollaborationSurfaceContext,
  input: CollaborationPacketBuildInput,
): CollaborationPacketBuildResultV1 {
  const repoRoot = surfaceRoot(context);
  const mode = assertCollaborationMutationEnabled(repoRoot);
  const collection = collect(repoRoot, context);
  const delivery: CollaborationContextDeliveryV1 = deliverCollaborationContext({
    repo_root: repoRoot,
    collection,
    subject_refs: input.subject_refs,
    base_goal: input.base_goal,
    handoff: input.handoff,
    ...(input.budget_estimated_tokens === null
      ? {}
      : { budget_estimated_tokens: input.budget_estimated_tokens }),
  });
  return marked(mode, {
    packet: delivery.packet,
    rendered_context: delivery.rendered_context,
    composed_goal: delivery.composed_goal,
    base_goal_sha256: delivery.base_goal_sha256,
    composed_goal_sha256: delivery.composed_goal_sha256,
  });
}
