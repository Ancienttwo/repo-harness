/**
 * The participant admission bridge — D5, and the row that turns
 * `max_parallel_readers` from a declared profile value into a runtime
 * constraint.
 *
 * C0's D7 recorded the negative proof: at `main@a490a5ef`,
 * `admitReadOnlyDelegation()` did not consume `delegation_policy`, and
 * `allowed_roles` / `max_parallel_readers` appeared nowhere on the admission
 * path. That proof stays true of `src/effects/engineers/delegated-run-store.ts`
 * after this row, and deliberately so: the enforcement is a *pre-step in a new
 * file*, so the delegation plane keeps one admission semantics and the policy
 * layer can be removed by deleting this module rather than by unpicking an
 * existing function.
 *
 * D5's order, followed exactly:
 *
 * ```text
 * resolve ModuleEngineerProfile from the parent ClaimActorReceipt
 * -> read the current Binding and Principal
 * -> load the tracked LogicalRoleProfile and check it is allowed
 * -> under a lock keyed by parent claim + round_index, count active readers
 * -> enforce active_readers < max_parallel_readers
 * -> call admitReadOnlyDelegation()
 * ```
 *
 * That call is a verbatim forward of the caller's own
 * `AdmitReadOnlyDelegationInput`. Nothing is rewritten on the way through,
 * which is what makes "the bridge does not change the existing admission" a
 * property of the code rather than a claim in a comment.
 *
 * **One step beyond D5's list, and why it is not optional.** The critical
 * section continues through `prepareDelegatedRun()` instead of ending at the
 * admission. A seat is only observable once an intent exists, so a bridge that
 * counted and then released the lock would leave a window in which the seat it
 * just granted is invisible: with `max_parallel_readers = 3`, four concurrent
 * requests could each observe an empty window and all four be admitted. The
 * limit would then hold only when callers happened to prepare before the next
 * request arrived, which is not a limit. Counting a seat and creating it belong
 * in one critical section, so they are in one. D5's ordering is unchanged inside
 * it; the section is longer, not reordered.
 *
 * The nested `withDispatchLock()` inside `prepareDelegatedRun()` is a different
 * lock file under the same common directory, and the admission lock is always
 * the outer one, so the ordering is total and cannot cycle.
 *
 * Fail-closed is the whole design of the counting step. A seat is never inferred
 * free: a run whose state cannot be established, whose immutable records do not
 * join, or which is in `reconciliation_required` refuses the request outright
 * instead of being counted as zero. That includes runs the bridge could not even
 * place in or out of the window — an unreadable envelope cannot be proven to
 * belong to another claim, so it is never quietly excluded from the count.
 *
 * Zero delivery-plane write (D1) from this module itself; the forwarded
 * `admitReadOnlyDelegation()` writes only its own delegation-plane evidence,
 * exactly as it did before this row existed.
 */
import { existsSync, readdirSync, realpathSync } from 'fs';
import { join } from 'path';

import {
  CollaborationError,
  type CollaborationMode,
} from '../../core/collaboration/common';
import {
  buildCollaborationDelegationAdmission,
  collaborationReaderHoldsSeat,
  type CollaborationAdmissionRejectionReason,
  type CollaborationDelegationAdmissionV1,
} from '../../core/collaboration/admission';
import { validateLogicalRoleProfile, type DelegationAdmissionReceiptV1, type DelegationEnvelopeV1 } from '../../core/engineers/delegation';
import { type EngineerDelegationRole } from '../../core/engineers/profile-binding';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { readEngineerBindingStatus } from '../engineers/binding-store';
import {
  DELEGATED_RUN_STORE_RELATIVE_ROOT,
  admitReadOnlyDelegation,
  loadLogicalReadOnlyRoleProfile,
  prepareDelegatedRun,
  readDelegatedRunStatus,
  readDelegationAdmissionReceipt,
  readDelegationEnvelope,
  type AdmitReadOnlyDelegationInput,
  type DelegatedRunStatus,
} from '../engineers/delegated-run-store';
import { loadEngineerProfile } from '../engineers/profile-store';
import { repoHarnessRepoIdFor } from '../repo-registry';
import { assertCollaborationMutationEnabled } from './feature-flag';
import { collaborationLockRelativePath, collaborationUnavailable } from './record-store';

const RUN_CURRENT_FILE = /^[0-9a-f]{64}\.json$/u;

export interface AdmitCollaborationDelegationInput {
  readonly repo_root: string;
  /**
   * The collaboration round. Together with the parent claim it is the counting
   * window D6 freezes, and it is the same value the caller will pass to
   * `prepareDelegatedRun()` as `round_index`.
   */
  readonly round_index: number;
  readonly decided_at: string;
  /**
   * The dispatch identity key. It is required because the seat this bridge
   * grants is created before the lock releases, and `prepareDelegatedRun()`
   * derives the dispatch id from it.
   */
  readonly idempotency_key: string;
  readonly observed_at: string;
  /** Forwarded verbatim to `admitReadOnlyDelegation()` when the bridge admits. */
  readonly delegation: AdmitReadOnlyDelegationInput;
}

export interface AdmitCollaborationDelegationResult {
  readonly admission: CollaborationDelegationAdmissionV1;
  /**
   * The existing admission's own output, or `null` when the bridge refused. A
   * refusal therefore leaves no `DelegationAdmissionReceiptV1` for
   * `prepareDelegatedRun()` to consume, which is what makes the rejection fail
   * closed rather than advisory.
   */
  readonly delegation: {
    readonly envelope: DelegationEnvelopeV1;
    readonly receipt: DelegationAdmissionReceiptV1;
  } | null;
  /**
   * The seat, created inside the same critical section that counted for it.
   * `null` whenever no seat was taken: a bridge refusal, or an existing
   * admission that refused on its own terms.
   */
  readonly run: DelegatedRunStatus | null;
  readonly mode: CollaborationMode;
}

/** One candidate reader, already reduced to what the counting rule needs. */
interface ReaderObservation {
  readonly claim_id: string;
  readonly round_index: number;
  readonly state: string;
}

function readerRefusal(reason: CollaborationAdmissionRejectionReason): { readonly reason: CollaborationAdmissionRejectionReason } {
  return { reason };
}

/**
 * Reduce every persisted delegated run to a `ReaderObservation`, or return the
 * first reason the window cannot be established.
 *
 * Reading happens inside the caller's lock. The store is content-addressed and
 * append-only apart from the `current/` pointer, and the pointer is republished
 * through a rename, so an entry is either the old observation or the new one and
 * never a torn read.
 */
function observeReaders(
  root: string,
): { readonly readers: readonly ReaderObservation[] } | { readonly reason: CollaborationAdmissionRejectionReason } {
  const directory = join(resolveGitCommonDirectory(root), DELEGATED_RUN_STORE_RELATIVE_ROOT, 'current');
  // No delegated run has ever been prepared in this repository. That is a proven
  // empty set rather than an unreadable one: the shard does not exist because
  // nothing wrote it, which is the one case an empty count is honest.
  if (!existsSync(directory)) return { readers: Object.freeze([]) };
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return readerRefusal('reader_state_unreadable');
  }
  const readers: ReaderObservation[] = [];
  for (const entry of entries.sort()) {
    // An entry that is not a dispatch pointer means the store holds something
    // this bridge cannot account for. It is never skipped: skipping is how an
    // unreadable shard degrades into a smaller, healthier-looking count.
    if (!RUN_CURRENT_FILE.test(entry)) return readerRefusal('reader_state_unreadable');
    const dispatchId = `sha256:${entry.slice(0, -'.json'.length)}`;
    let status: ReturnType<typeof readDelegatedRunStatus>;
    let admission: DelegationAdmissionReceiptV1;
    let envelope: DelegationEnvelopeV1;
    try {
      status = readDelegatedRunStatus(root, dispatchId);
      admission = readDelegationAdmissionReceipt(root, status.intent.admission_receipt_sha256);
      envelope = readDelegationEnvelope(root, admission.envelope_sha256);
    } catch {
      return readerRefusal('reader_state_unreadable');
    }
    // The immutable records must describe one run. `prepareDelegatedRun()` only
    // ever writes an intent whose dispatch id matches its own pointer and whose
    // admission is admitted, so either disagreement means the observation no
    // longer describes the run it is filed under.
    if (status.intent.dispatch_id !== dispatchId
      || status.current.dispatch_id !== dispatchId
      || status.current.intent_sha256 !== status.intent.intent_sha256
      || admission.decision !== 'admitted'
      || admission.delegation_id !== envelope.delegation_id
      || envelope.delegation_id !== status.intent.delegation_id) {
      return readerRefusal('reader_observation_stale');
    }
    readers.push({
      claim_id: envelope.parent.claim_id,
      round_index: status.intent.round_index,
      state: status.current.state,
    });
  }
  return { readers: Object.freeze(readers) };
}

/**
 * Count the seats held in one window, or return the reason the window fails
 * closed. D6 rows A4 through A9 are all decided here.
 */
function countActiveReaders(
  readers: readonly ReaderObservation[],
  claimId: string,
  roundIndex: number,
): { readonly active: number } | { readonly reason: CollaborationAdmissionRejectionReason } {
  let active = 0;
  for (const reader of readers) {
    if (reader.claim_id !== claimId || reader.round_index !== roundIndex) continue;
    // D6 A7. A run whose outcome nobody has reconciled holds no seat and frees
    // none either; the window is simply not in a state anyone may add to.
    if (reader.state === 'reconciliation_required') return readerRefusal('reader_reconciliation_required');
    const holds = collaborationReaderHoldsSeat(reader.state);
    // D6 A6, reached when the delegated-run state machine grows a state this
    // bridge has not classified. Rounding it down to "no seat" is the failure
    // mode the closed enumeration exists to prevent.
    if (holds === null) return readerRefusal('reader_state_unreadable');
    if (holds) active += 1;
  }
  return { active };
}

export function admitCollaborationDelegation(
  input: AdmitCollaborationDelegationInput,
): AdmitCollaborationDelegationResult {
  const root = realpathSync(input.repo_root);
  const mode = assertCollaborationMutationEnabled(root);
  const receipt = input.delegation.claim_actor_receipt;
  const envelope = input.delegation.envelope;
  const roleProfile = validateLogicalRoleProfile(input.delegation.role_profile);

  // Step 1 of D5. A parent whose own Profile cannot be resolved is an
  // environment failure rather than a policy decision: there is no
  // `max_parallel_readers` to decide against, so no decision document can
  // honestly be produced for it.
  let profile: ReturnType<typeof loadEngineerProfile>;
  try {
    profile = loadEngineerProfile(root, receipt.engineer_id);
  } catch (error) {
    return collaborationUnavailable(
      `parent Module Engineer Profile is unavailable: ${receipt.engineer_id}`,
      error,
    );
  }
  const policy = profile.profile.delegation_policy;

  const decide = (
    decision: 'admitted' | 'rejected',
    reason: CollaborationAdmissionRejectionReason | null,
    observedActiveReaders: number,
  ): CollaborationDelegationAdmissionV1 => buildCollaborationDelegationAdmission({
    parent_claim_id: receipt.claim_id,
    round_index: input.round_index,
    parent_engineer_id: receipt.engineer_id,
    parent_binding_id: receipt.binding_id,
    parent_binding_generation: receipt.binding_generation,
    logical_role: envelope.logical_role,
    role_profile_sha256: roleProfile.role_profile_sha256,
    max_parallel_readers: policy.max_parallel_readers,
    observed_active_readers: observedActiveReaders,
    decision,
    rejection_reason: reason,
    decided_at: input.decided_at,
  });

  const rejected = (
    reason: CollaborationAdmissionRejectionReason,
    observedActiveReaders = 0,
  ): AdmitCollaborationDelegationResult => Object.freeze({
    admission: decide('rejected', reason, observedActiveReaders),
    delegation: null,
    run: null,
    mode,
  });

  // Step 2 of D5: the current Binding, and the Principal-derived fields the
  // receipt carries, must still describe the parent this request names. The
  // authenticated Principal itself is revalidated by `admitReadOnlyDelegation()`
  // through `validateClaimActorReceiptLive()`; duplicating that here would be a
  // second authority on the same question.
  if (receipt.repository_id !== repoHarnessRepoIdFor(root)
    || profile.engineer_contract_revision !== receipt.engineer_contract_revision
    || envelope.engineer.engineer_id !== receipt.engineer_id
    || envelope.engineer.binding_id !== receipt.binding_id
    || envelope.engineer.binding_generation !== receipt.binding_generation
    || envelope.parent.claim_id !== receipt.claim_id) {
    return rejected('parent_authority_stale');
  }
  let binding: ReturnType<typeof readEngineerBindingStatus>;
  try {
    binding = readEngineerBindingStatus(root, receipt.engineer_id, profile.engineer_contract_revision);
  } catch {
    return rejected('parent_authority_stale');
  }
  if (binding.binding === null
    || binding.current.state !== 'active'
    || binding.binding.state !== 'active'
    || binding.binding.binding_id !== receipt.binding_id
    || binding.binding.binding_generation !== receipt.binding_generation) {
    return rejected('parent_authority_stale');
  }

  // Step 3 of D5. An open `logical_role` string is not authorization: it must be
  // in the parent's own `allowed_roles`, and the tracked profile behind it must
  // still be the exact one this request names.
  if (!policy.allowed_roles.includes(envelope.logical_role as EngineerDelegationRole)) {
    return rejected('role_not_allowed');
  }
  let tracked: ReturnType<typeof loadLogicalReadOnlyRoleProfile>;
  try {
    tracked = loadLogicalReadOnlyRoleProfile(root, envelope.logical_role);
  } catch {
    return rejected('role_profile_unavailable');
  }
  if (tracked.role_profile_sha256 !== roleProfile.role_profile_sha256
    || tracked.role_profile_sha256 !== envelope.role_profile_sha256) {
    return rejected('role_profile_unavailable');
  }

  // Steps 4 to 6 of D5. Counting and admitting are one critical section: a
  // count released before the admission lands would let two requests both
  // observe the same free seat and both take it.
  return withExclusiveDirectoryLock(
    resolveGitCommonDirectory(root),
    collaborationLockRelativePath('delegation-admission', `${receipt.claim_id}#${input.round_index}`),
    () => admitInsideWindow(root, input, policy.max_parallel_readers, mode, decide, rejected),
  );
}

/**
 * The critical section itself: count the window, enforce the limit, forward to
 * the existing admission, and create the seat — all before the lock is released.
 *
 * It is a named top-level function rather than an inline callback so the edges
 * to `admitReadOnlyDelegation()` and `prepareDelegatedRun()` are direct calls a
 * reader, and the architecture flow proof, can follow. A call made inside a
 * lock callback is an indirect hop that neither can.
 */
function admitInsideWindow(
  root: string,
  input: AdmitCollaborationDelegationInput,
  maxParallelReaders: number,
  mode: CollaborationMode,
  decide: (
    decision: 'admitted' | 'rejected',
    reason: CollaborationAdmissionRejectionReason | null,
    observedActiveReaders: number,
  ) => CollaborationDelegationAdmissionV1,
  rejected: (
    reason: CollaborationAdmissionRejectionReason,
    observedActiveReaders?: number,
  ) => AdmitCollaborationDelegationResult,
): AdmitCollaborationDelegationResult {
  const claimId = input.delegation.claim_actor_receipt.claim_id;
  const observed = observeReaders(root);
  if ('reason' in observed) return rejected(observed.reason);
  const counted = countActiveReaders(observed.readers, claimId, input.round_index);
  if ('reason' in counted) return rejected(counted.reason);
  // D6 A1-A4 and A8-A9 collapse into this one comparison, which is the point of
  // freezing the table: the seat arithmetic has exactly one expression.
  if (counted.active >= maxParallelReaders) {
    return rejected('max_parallel_readers_exceeded', counted.active);
  }
  // The bridge's own decision is "admitted through": the policy question it owns
  // is answered. Whether the delegation itself is admitted is the existing
  // admission's answer, carried back verbatim on `delegation`. A bridge reason
  // invented for a refusal that happened downstream would put two explanations
  // on one outcome.
  const admitted = admitReadOnlyDelegation(input.delegation);
  const admission = decide('admitted', null, counted.active);
  // No seat is created for a delegation the existing admission refused. Its
  // rejected receipt cannot produce an intent, so there is nothing to count
  // later either, and the window is left exactly as it was found.
  if (admitted.receipt.decision !== 'admitted') {
    return Object.freeze({ admission, delegation: admitted, run: null, mode });
  }
  const run = prepareDelegatedRun({
    repo_root: root,
    idempotency_key: input.idempotency_key,
    delegation_id: admitted.envelope.delegation_id,
    admission_receipt_sha256: admitted.receipt.admission_receipt_sha256,
    context_packet_sha256: admitted.envelope.execution_packet_sha256,
    round_index: input.round_index,
    observed_at: input.observed_at,
  });
  return Object.freeze({ admission, delegation: admitted, run, mode });
}

/**
 * The same decision as a throw, for callers whose next step assumes admission.
 * The typed reason survives on the error so a caller still distinguishes a
 * seat-count refusal from an unavailable role.
 */
export class CollaborationAdmissionRejected extends CollaborationError {
  constructor(readonly admission: CollaborationDelegationAdmissionV1) {
    super(
      'collaboration_invalid',
      `collaboration delegation admission rejected: ${admission.rejection_reason}`,
    );
    this.name = 'CollaborationAdmissionRejected';
  }
}
