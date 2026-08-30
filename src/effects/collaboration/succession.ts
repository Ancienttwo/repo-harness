/**
 * Succession — the join between what one run knows and who is allowed to act on
 * it.
 *
 * Sprint row C5, and the frozen three-way sentence stated as code:
 *
 * > `WorkStateHandoff` passes knowledge, `TaskFreezeReceiptV1` passes exact
 * > state, and the existing Lease lifecycle passes the right to execute.
 *
 * Nothing here is a fourth mechanism. There is no successor election, no
 * successor field on any record, no new protocol, no new store and no second
 * write destination: the entire row is a cross-check between two record families
 * that already exist, plus a refusal in front of the delivery plane.
 *
 * **The gap this closes.** `HandoffExecutionContextV1.bound_task` names a Claim
 * and a freeze receipt by digest, and C3 validated its *shape* — six well-formed
 * references, present together or not at all. Shape is not truth. A caller could
 * state any syntactically valid `claim_id`, `lease_generation` and
 * `task_freeze_receipt_sha256`, and the record would validate, persist and read
 * back clean while naming a receipt that does not exist or describes different
 * bytes. The successor would then reconstruct a state nobody ever froze, which is
 * strictly worse than having no handoff: it looks like evidence.
 *
 * C3 could not have closed it. The check needs a delivery-plane reader, and
 * importing the freeze store into the schema layer would invert the direction D1
 * froze. C5 is the first row holding both sides, so the cross-check lives here,
 * in `effects`, beside the other cross-plane adapter (`admission-bridge.ts`).
 *
 * **Derive on write, prove on read.** `publishBoundTaskSuccessionHandoff()`
 * derives the execution context *from* the persisted receipt rather than
 * accepting one and validating it, so on that path the mismatched record cannot
 * be expressed at all. `resolveBoundTaskSuccession()` still performs the
 * comparison, because a handoff persisted by any other route — a later row, a
 * hand-written record, a restored backup — has to be provable at read time. One
 * derivation, one comparison, used from both sides.
 *
 * Zero delivery-plane write (D1). Every delivery-plane touch below is a read or
 * a refusal. The only write this module can cause is one `WorkStateHandoffV1`
 * through the existing C3 store, at the existing destination authorizer.
 */
import { realpathSync } from 'fs';

import { CollaborationError, type CollaborationMode, type CollaborationRecordedTimeSource, type CollaborationScopeRefV1 } from '../../core/collaboration/common';
import {
  type HandoffAttemptedPathV1,
  type HandoffExecutionContextV1,
  type WorkStateHandoffTrigger,
  type WorkStateHandoffV1,
} from '../../core/collaboration/handoff';
import { canonicalEngineerJson } from '../../core/engineers/profile-binding';
import { TaskFreezeError, type TaskFreezeInspectionV1, type TaskFreezeReceiptV1 } from '../../core/engineers/task-freeze';
import type { ClaimActorReceiptV1 } from '../../core/engineers/principal-claim';
import { listLiveClaimActorReceiptsForEngineer } from '../engineers/claim-actor-store';
import {
  inspectBoundTask,
  readTaskFreezeReceipt,
  verifyTaskFreeze,
  type TaskFreezeStoreDependencies,
} from '../engineers/task-freeze-store';
import type { CollaborationAuthorizationV1 } from './actor';
import { publishWorkStateHandoff } from './handoff-store';
import { collaborationInvalidStore, type CollaborationPublishDestinationV1 } from './record-store';

/**
 * The three verbs that move execution authority. Named once so every refusal
 * below points at the same lifecycle instead of describing it in its own words.
 */
export const EXECUTION_AUTHORITY_LIFECYCLE = 'sprint release / fleet takeover / fleet acquire' as const;

/**
 * What a handoff requires of whoever picks it up.
 *
 * This is the whole read-only-versus-bound distinction, as a total function over
 * the execution context. A `bound_task` handoff describes work someone held a
 * Lease for, so acting on it needs that Lease; every other kind describes work
 * that never held one, so adoption is the end of the path. Nothing infers this
 * from prose, budget, trigger or actor kind — it is the branch of the union.
 */
export type HandoffSuccessionRequirementV1 =
  | {
      readonly kind: 'execution_authority';
      readonly task_id: string;
      readonly claim_id: string;
      readonly lease_generation: number;
      readonly task_freeze_receipt_sha256: string;
    }
  | { readonly kind: 'knowledge_only' };

export function handoffSuccessionRequirement(handoff: WorkStateHandoffV1): HandoffSuccessionRequirementV1 {
  const context = handoff.execution_context;
  if (context.kind !== 'bound_task') return Object.freeze({ kind: 'knowledge_only' as const });
  return Object.freeze({
    kind: 'execution_authority' as const,
    task_id: context.task_id,
    claim_id: context.claim_id,
    lease_generation: context.lease_generation,
    task_freeze_receipt_sha256: context.task_freeze_receipt_sha256,
  });
}

/**
 * The one place a `bound_task` execution context is constructed.
 *
 * Every field is read out of the receipt, so the context cannot describe a state
 * other than the one that was frozen. A signature taking these six values
 * separately would be a smaller change and would let a caller express exactly
 * the record this row exists to prevent.
 */
export function boundTaskExecutionContext(receipt: TaskFreezeReceiptV1): HandoffExecutionContextV1 {
  return Object.freeze({
    kind: 'bound_task' as const,
    task_id: receipt.task.task_id,
    task_revision: receipt.task.task_revision,
    claim_id: receipt.task.claim_id,
    lease_generation: receipt.task.lease_generation,
    work_envelope_sha256: receipt.work_envelope_sha256,
    task_freeze_receipt_sha256: receipt.receipt_sha256,
  });
}

export interface BoundTaskSuccessionStateV1 {
  readonly handoff: WorkStateHandoffV1;
  /** The exact bytes the handoff's execution context names, resolved from the store. */
  readonly freeze_receipt: TaskFreezeReceiptV1;
}

/**
 * Resolve and prove a `bound_task` handoff's execution context.
 *
 * Two distinct failures, both closed. The receipt may not resolve — a digest
 * naming nothing, or a task directory that does not exist — which
 * `readTaskFreezeReceipt()` reports as `task_freeze_state_unavailable`. Or it may
 * resolve while the context disagrees with it, which is the more dangerous case:
 * the reference looks live, and only a field-by-field comparison catches that it
 * describes a different Claim, a different generation or a different envelope.
 *
 * The comparison is against `boundTaskExecutionContext()` rather than against
 * hand-listed fields, so a later field added to the branch is covered by
 * construction instead of by remembering to extend a list here.
 */
export function resolveBoundTaskSuccession(
  repoRootInput: string,
  handoff: WorkStateHandoffV1,
): BoundTaskSuccessionStateV1 {
  const context = handoff.execution_context;
  if (context.kind !== 'bound_task') {
    collaborationInvalidStore(
      `handoff ${handoff.handoff_id} carries a ${context.kind} execution context and needs no bound task resolution`,
    );
  }
  const repoRoot = realpathSync(repoRootInput);
  const receipt = readTaskFreezeReceipt(repoRoot, context.task_id, context.task_freeze_receipt_sha256);
  const derived = boundTaskExecutionContext(receipt);
  if (canonicalEngineerJson(derived) !== canonicalEngineerJson(context)) {
    collaborationInvalidStore(
      `handoff ${handoff.handoff_id} execution context does not match freeze receipt ${context.task_freeze_receipt_sha256}`,
    );
  }
  return Object.freeze({ handoff, freeze_receipt: receipt });
}

export interface BoundTaskFreezeGateV1 {
  readonly inspection: TaskFreezeInspectionV1;
  /** Null exactly when the bound task was clean enough to release without freezing. */
  readonly freeze_receipt: TaskFreezeReceiptV1 | null;
}

/**
 * The freeze-first gate: a dirty or unverified bound executor may not hand over
 * until its state is written down.
 *
 * `inspectBoundTask()` already classifies the disposition, and this adds the one
 * thing it cannot know — whether a receipt for that state exists. Passing a
 * receipt digest routes through `verifyTaskFreeze()`, which re-inspects and
 * refuses as `task_freeze_stale` if any observed field moved since. That is what
 * makes "the receipt binds the actual worktree state" a checked property rather
 * than a claim: a receipt taken before the last three edits is not a freeze of
 * what is there now.
 *
 * A `clean_release_allowed` task needs no receipt, and demanding one anyway would
 * be ceremony: there is no divergent state to carry, and the existing release
 * path already covers it.
 */
export function assertBoundTaskFrozenForSuccession(
  repoRootInput: string,
  engineerId: string,
  freezeReceiptSha256: string | null,
  dependencies: TaskFreezeStoreDependencies = {},
): BoundTaskFreezeGateV1 {
  const repoRoot = realpathSync(repoRootInput);
  if (freezeReceiptSha256 === null) {
    const inspection = inspectBoundTask(repoRoot, engineerId, dependencies);
    if (inspection.disposition !== 'clean_release_allowed') {
      throw new TaskFreezeError(
        'task_freeze_invalid',
        `bound task is ${inspection.reasons.join(', ')}; freeze it with \`repo-harness engineer task-freeze create\` before requesting succession`,
      );
    }
    return Object.freeze({ inspection, freeze_receipt: null });
  }
  const receipt = readTaskFreezeReceipt(
    repoRoot,
    // The receipt's own task id, taken from the live Claim rather than from a
    // caller-supplied one: a digest plus an unrelated task id would otherwise
    // read a receipt from a different task's directory and never be noticed.
    liveClaimForEngineer(repoRoot, engineerId).task_id,
    freezeReceiptSha256,
  );
  if (receipt.engineer_id !== engineerId) {
    throw new TaskFreezeError('task_freeze_binding_stale', `freeze receipt belongs to ${receipt.engineer_id}`);
  }
  const verified = verifyTaskFreeze(repoRoot, receipt.task.task_id, freezeReceiptSha256, dependencies);
  return Object.freeze({ inspection: verified.current, freeze_receipt: verified.receipt });
}

/**
 * The single live Claim an Engineer holds. Ambiguity is refused rather than
 * resolved: with two live Claims there is no fact about which task a succession
 * request refers to, and picking one would be inventing the answer.
 */
function liveClaimForEngineer(repoRoot: string, engineerId: string): ClaimActorReceiptV1 {
  const live = listLiveClaimActorReceiptsForEngineer(repoRoot, engineerId);
  if (live.length === 0) {
    throw new TaskFreezeError('task_freeze_claim_missing', `engineer ${engineerId} has no live Claim`);
  }
  if (live.length !== 1) {
    throw new TaskFreezeError('task_freeze_claim_ambiguous', `engineer ${engineerId} has ${live.length} live Claims`);
  }
  return live[0]!;
}

export interface PublishBoundTaskSuccessionHandoffInput {
  readonly repo_root: string;
  /** The authenticated authorization; the actor is derived from it, never declared. */
  readonly authorization: CollaborationAuthorizationV1;
  /** The Engineer whose bound task is being handed over. */
  readonly engineer_id: string;
  /** The receipt this succession is frozen at; it must still bind current state. */
  readonly freeze_receipt_sha256: string;
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
  readonly supersedes_handoff_id: string | null;
  readonly recorded_time: CollaborationRecordedTimeSource;
  /**
   * Forwarded to `authorizeCollaborationDestination()` unchanged. This module
   * resolves no destination of its own: C4 made that authorizer the single
   * producer of the value the stores accept, and a second resolver here would be
   * a second place for the actor/destination binding to drift.
   */
  readonly destination: CollaborationPublishDestinationV1;
  readonly now?: () => string;
  readonly env?: NodeJS.ProcessEnv;
  readonly freeze_dependencies?: TaskFreezeStoreDependencies;
}

export interface PublishBoundTaskSuccessionHandoffResult {
  readonly handoff: WorkStateHandoffV1;
  readonly freeze_receipt: TaskFreezeReceiptV1;
  /** False when an existing identity with identical bytes was returned unchanged. */
  readonly created: boolean;
  readonly mode: CollaborationMode;
}

/**
 * Publish a bound executor's handoff, bound to the state it froze.
 *
 * There is no `execution_context` parameter, and that absence is the guarantee:
 * the context is derived from the verified receipt, so this path cannot produce
 * a handoff naming a freeze that does not describe it. Everything else — actor
 * derivation, destination authorization, identity, idempotency, durability — is
 * `publishWorkStateHandoff()` unchanged, because a succession handoff is an
 * ordinary handoff that happens to know which receipt it belongs to.
 *
 * Publishing transfers nothing. The Lease keeps its generation, the Claim keeps
 * its owner, and the successor still becomes a writer only through
 * `sprint release` / `fleet takeover` / `fleet acquire`.
 */
export function publishBoundTaskSuccessionHandoff(
  input: PublishBoundTaskSuccessionHandoffInput,
): PublishBoundTaskSuccessionHandoffResult {
  const repoRoot = realpathSync(input.repo_root);
  const gate = assertBoundTaskFrozenForSuccession(
    repoRoot,
    input.engineer_id,
    input.freeze_receipt_sha256,
    input.freeze_dependencies ?? {},
  );
  // Unreachable through the gate above, which refuses a null digest on a dirty
  // task and returns the receipt otherwise; asserted rather than assumed because
  // the null branch is a real return value of that function's type.
  if (gate.freeze_receipt === null) {
    collaborationInvalidStore('a bound task succession handoff requires a freeze receipt');
  }
  const published = publishWorkStateHandoff({
    repo_root: repoRoot,
    authorization: input.authorization,
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
    execution_context: boundTaskExecutionContext(gate.freeze_receipt),
    supersedes_handoff_id: input.supersedes_handoff_id,
    recorded_time: input.recorded_time,
    destination: input.destination,
    now: input.now,
    env: input.env,
  });
  return Object.freeze({
    handoff: published.handoff,
    freeze_receipt: gate.freeze_receipt,
    created: published.created,
    mode: published.mode,
  });
}

export interface SuccessorExecutionAuthorityV1 {
  /** The successor's own live Claim, granted by the existing lifecycle. */
  readonly claim_actor_receipt: ClaimActorReceiptV1;
  readonly frozen_lease_generation: number;
  readonly live_lease_generation: number;
  /**
   * True when the live Claim is the one the handoff was written under. False
   * after a real takeover, which is the ordinary case and not an error: it tells
   * the successor the frozen state describes a previous holder's worktree rather
   * than its own.
   */
  readonly continues_frozen_claim: boolean;
}

/**
 * The write gate: a successor may act on a bound-task handoff only once the
 * existing lifecycle has given it a live Claim on that task.
 *
 * Adoption is deliberately not consulted. A `HandoffAdoptionReceiptV1` proves
 * that context reached someone and is non-exclusive by identity — many adopters,
 * all valid — so treating it as an input here would make a non-exclusive record
 * the basis of an exclusive right, which is the exact confusion C3 froze against.
 * The authority read is the Claim, and the Claim comes from `sprint release` /
 * `fleet takeover` / `fleet acquire`.
 *
 * A newer generation passes. Requiring the frozen `claim_id` would make takeover
 * — the supported path — permanently fail this check, since a steal mints a new
 * claim and bumps the generation. An *older* generation is refused: it names a
 * Claim from before the handoff was written, so it cannot be the succession this
 * handoff is about.
 */
export function assertSuccessorExecutionAuthority(
  repoRootInput: string,
  handoff: WorkStateHandoffV1,
  engineerId: string,
): SuccessorExecutionAuthorityV1 {
  const requirement = handoffSuccessionRequirement(handoff);
  if (requirement.kind === 'knowledge_only') {
    collaborationInvalidStore(
      `handoff ${handoff.handoff_id} carries no bound task; it needs no execution authority`,
    );
  }
  const repoRoot = realpathSync(repoRootInput);
  const live = listLiveClaimActorReceiptsForEngineer(repoRoot, engineerId)
    .filter((receipt) => receipt.task_id === requirement.task_id);
  if (live.length === 0) {
    throw new CollaborationError(
      'collaboration_invalid',
      `engineer ${engineerId} holds no live Claim on task ${requirement.task_id}; `
        + `adopting a handoff grants no write path, so go through ${EXECUTION_AUTHORITY_LIFECYCLE} first`,
    );
  }
  if (live.length !== 1) {
    throw new CollaborationError(
      'collaboration_invalid',
      `engineer ${engineerId} holds ${live.length} live Claims on task ${requirement.task_id}`,
    );
  }
  const receipt = live[0]!;
  if (receipt.lease_generation < requirement.lease_generation) {
    throw new CollaborationError(
      'collaboration_invalid',
      `live Claim on task ${requirement.task_id} is at lease generation ${receipt.lease_generation}, `
        + `older than the handoff's ${requirement.lease_generation}`,
    );
  }
  return Object.freeze({
    claim_actor_receipt: receipt,
    frozen_lease_generation: requirement.lease_generation,
    live_lease_generation: receipt.lease_generation,
    continues_frozen_claim: receipt.claim_id === requirement.claim_id,
  });
}
