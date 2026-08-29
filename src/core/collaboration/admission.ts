/**
 * `CollaborationDelegationAdmissionV1` — the decision D5 puts strictly *before*
 * `admitReadOnlyDelegation()`.
 *
 * Sprint row C4, and the row that makes C0's D7 negative proof stop being true
 * about the repository as a whole while leaving it exactly true about the file
 * it names. D7 recorded that `admitReadOnlyDelegation()` does not consume
 * `delegation_policy`, so `max_parallel_readers` was a declared value with no
 * admission-time force. The enforcement lives here and in
 * `src/effects/collaboration/admission-bridge.ts`, never inside the existing
 * admission path — that separation is the point of the negative proof, not an
 * accident of layering.
 *
 * This module owns the decision *document*. It is returned to the caller and is
 * content-addressed so a caller can bind it, but it is deliberately not a
 * persisted shard: D9 froze the collaboration store's shard list and an
 * admissions shard is not on it. The durable admission evidence is the existing
 * `DelegationAdmissionReceiptV1` the delegation plane already persists.
 *
 * The wire version is the frozen `COLLABORATION_PROTOCOL`; this row mints no
 * second protocol constant for the same plane.
 */
import {
  COLLABORATION_PROTOCOL,
  canonicalCollaborationBytes,
  canonicalCollaborationDigest,
  collaborationInvalid,
  isCollaborationRecord,
  validateCollaborationRecordedAt,
} from './common';
import {
  assertMessageExactKeys,
  assertMessageInteger,
  assertMessageSha256,
  assertMessageUuid,
  messageRequiredString,
} from '../messages/mechanics';

export const COLLABORATION_DELEGATION_ADMISSION_KIND =
  'repo-harness-collaboration-delegation-admission' as const;

/**
 * Every way the bridge can refuse. A closed set, because a rejection reason a
 * caller cannot enumerate is a reason a caller will end up matching on prose.
 *
 * The mapping onto C0's frozen D6 table is exact:
 *
 * | D6 | Observation                                        | Reason                            |
 * |----|----------------------------------------------------|-----------------------------------|
 * | A4 | active readers already equal `max_parallel_readers` | `max_parallel_readers_exceeded`   |
 * | A5 | a reader's records do not join consistently        | `reader_observation_stale`        |
 * | A6 | a reader's state cannot be read at all             | `reader_state_unreadable`         |
 * | A7 | a `reconciliation_required` reader is in the window | `reader_reconciliation_required`  |
 *
 * A1-A3 and A8-A9 are the admitted rows and carry no reason. The two remaining
 * values cover the authorization limb of D5 rather than the counting limb: an
 * open `logical_role` string is not authorization, so a role outside the
 * profile's `allowed_roles` and a tracked `LogicalRoleProfile` that is missing
 * or has changed are both refusals before any counting happens.
 */
export const COLLABORATION_ADMISSION_REJECTION_REASONS = [
  'max_parallel_readers_exceeded',
  'reader_observation_stale',
  'reader_state_unreadable',
  'reader_reconciliation_required',
  'role_not_allowed',
  'role_profile_unavailable',
  'parent_authority_stale',
] as const;
export type CollaborationAdmissionRejectionReason =
  (typeof COLLABORATION_ADMISSION_REJECTION_REASONS)[number];

export const COLLABORATION_ADMISSION_DECISIONS = ['admitted', 'rejected'] as const;
export type CollaborationAdmissionDecision = (typeof COLLABORATION_ADMISSION_DECISIONS)[number];

/**
 * The delegated-run states that hold a seat. `completed` and `failed` release
 * one, which is what D6 rows A8 and A9 assert; `reconciliation_required` holds
 * nothing and refuses everything, because a run whose outcome is unknown must
 * not have its seat inferred free (D6 A7).
 *
 * This list is a closed enumeration rather than a "not terminal" predicate on
 * purpose: a new delegated-run state added later becomes a compile-time and
 * test-time decision here instead of silently defaulting to "holds no seat",
 * which is the direction that leaks seats.
 */
export const COLLABORATION_ACTIVE_READER_STATES = [
  'intent_persisted',
  'launch_claimed',
  'running',
  'collecting',
] as const;
export type CollaborationActiveReaderState = (typeof COLLABORATION_ACTIVE_READER_STATES)[number];

export const COLLABORATION_RELEASED_READER_STATES = ['completed', 'failed'] as const;

export interface CollaborationDelegationAdmissionV1 {
  readonly protocol: typeof COLLABORATION_PROTOCOL;
  readonly kind: typeof COLLABORATION_DELEGATION_ADMISSION_KIND;
  /** The counting window, taken inside the lock: parent claim plus round index. */
  readonly parent_claim_id: string;
  readonly round_index: number;
  readonly parent_engineer_id: string;
  readonly parent_binding_id: string;
  readonly parent_binding_generation: number;
  readonly logical_role: string;
  /** The tracked profile that was loaded, pinned by its digest. */
  readonly role_profile_sha256: string;
  readonly max_parallel_readers: number;
  /**
   * What the bridge counted inside the lock. On a rejection that is not a
   * counting rejection this is the count observed before the refusal, so the
   * document always says what the window looked like.
   */
  readonly observed_active_readers: number;
  readonly decision: CollaborationAdmissionDecision;
  readonly rejection_reason: CollaborationAdmissionRejectionReason | null;
  readonly decided_at: string;
  readonly admission_sha256: string;
}

export type CollaborationDelegationAdmissionInput =
  Omit<CollaborationDelegationAdmissionV1, 'protocol' | 'kind' | 'admission_sha256'>;

const ADMISSION_FIELDS = [
  'protocol',
  'kind',
  'parent_claim_id',
  'round_index',
  'parent_engineer_id',
  'parent_binding_id',
  'parent_binding_generation',
  'logical_role',
  'role_profile_sha256',
  'max_parallel_readers',
  'observed_active_readers',
  'decision',
  'rejection_reason',
  'decided_at',
  'admission_sha256',
] as const;

const ENGINEER_ID = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
/** The delegation plane's own role shape; the bridge admits no other. */
const LOGICAL_ROLE = /^[a-z][a-z0-9-]{0,63}$/u;

export function buildCollaborationDelegationAdmission(
  input: CollaborationDelegationAdmissionInput,
): CollaborationDelegationAdmissionV1 {
  const claimId = messageRequiredString(input.parent_claim_id, 'parent_claim_id', collaborationInvalid);
  assertMessageUuid(claimId, 'parent_claim_id', collaborationInvalid);
  const bindingId = messageRequiredString(input.parent_binding_id, 'parent_binding_id', collaborationInvalid);
  assertMessageUuid(bindingId, 'parent_binding_id', collaborationInvalid);
  const engineerId = messageRequiredString(input.parent_engineer_id, 'parent_engineer_id', collaborationInvalid);
  if (!ENGINEER_ID.test(engineerId)) collaborationInvalid('parent_engineer_id is invalid');
  const logicalRole = messageRequiredString(input.logical_role, 'logical_role', collaborationInvalid);
  if (!LOGICAL_ROLE.test(logicalRole)) collaborationInvalid('logical_role is invalid');
  const roleProfileSha = messageRequiredString(input.role_profile_sha256, 'role_profile_sha256', collaborationInvalid);
  assertMessageSha256(roleProfileSha, 'role_profile_sha256', collaborationInvalid);
  assertMessageInteger(input.round_index, 'round_index', 0, collaborationInvalid);
  assertMessageInteger(input.parent_binding_generation, 'parent_binding_generation', 1, collaborationInvalid);
  assertMessageInteger(input.max_parallel_readers, 'max_parallel_readers', 1, collaborationInvalid);
  assertMessageInteger(input.observed_active_readers, 'observed_active_readers', 0, collaborationInvalid);
  if (!(COLLABORATION_ADMISSION_DECISIONS as readonly string[]).includes(input.decision)) {
    collaborationInvalid('decision is invalid');
  }
  // An admitted decision carrying a reason, or a rejection carrying none, would
  // be a record that contradicts itself; both are refused rather than normalised.
  if (input.decision === 'admitted') {
    if (input.rejection_reason !== null) collaborationInvalid('an admitted decision carries no rejection_reason');
  } else if (input.rejection_reason === null
    || !(COLLABORATION_ADMISSION_REJECTION_REASONS as readonly string[]).includes(input.rejection_reason)) {
    collaborationInvalid('rejection_reason is invalid');
  }
  const basis = Object.freeze({
    protocol: COLLABORATION_PROTOCOL,
    kind: COLLABORATION_DELEGATION_ADMISSION_KIND,
    parent_claim_id: claimId,
    round_index: input.round_index,
    parent_engineer_id: engineerId,
    parent_binding_id: bindingId,
    parent_binding_generation: input.parent_binding_generation,
    logical_role: logicalRole,
    role_profile_sha256: roleProfileSha,
    max_parallel_readers: input.max_parallel_readers,
    observed_active_readers: input.observed_active_readers,
    decision: input.decision,
    rejection_reason: input.rejection_reason,
    decided_at: validateCollaborationRecordedAt(input.decided_at, 'decided_at'),
  });
  return Object.freeze({
    ...basis,
    admission_sha256: canonicalCollaborationDigest(basis as unknown as Readonly<Record<string, unknown>>),
  });
}

export function validateCollaborationDelegationAdmission(
  value: unknown,
): CollaborationDelegationAdmissionV1 {
  if (!isCollaborationRecord(value)) collaborationInvalid('collaboration delegation admission must be an object');
  assertMessageExactKeys(value, ADMISSION_FIELDS, 'collaboration delegation admission', collaborationInvalid);
  if (value.protocol !== COLLABORATION_PROTOCOL
    || value.kind !== COLLABORATION_DELEGATION_ADMISSION_KIND) {
    collaborationInvalid('collaboration delegation admission protocol or kind is invalid');
  }
  const admission = buildCollaborationDelegationAdmission({
    parent_claim_id: value.parent_claim_id as string,
    round_index: value.round_index as number,
    parent_engineer_id: value.parent_engineer_id as string,
    parent_binding_id: value.parent_binding_id as string,
    parent_binding_generation: value.parent_binding_generation as number,
    logical_role: value.logical_role as string,
    role_profile_sha256: value.role_profile_sha256 as string,
    max_parallel_readers: value.max_parallel_readers as number,
    observed_active_readers: value.observed_active_readers as number,
    decision: value.decision as CollaborationAdmissionDecision,
    rejection_reason: value.rejection_reason as CollaborationAdmissionRejectionReason | null,
    decided_at: value.decided_at as string,
  });
  if (value.admission_sha256 !== admission.admission_sha256) {
    collaborationInvalid('collaboration delegation admission admission_sha256 is stale');
  }
  return admission;
}

export function canonicalCollaborationDelegationAdmissionBytes(
  admission: CollaborationDelegationAdmissionV1,
): string {
  return canonicalCollaborationBytes(
    validateCollaborationDelegationAdmission(admission) as unknown as Readonly<Record<string, unknown>>,
  );
}

/**
 * The frozen D6 counting rule, expressed once so the bridge and its tests read
 * the same predicate rather than two copies of it.
 *
 * `null` means the state is outside both closed sets, which is D6's "unknown"
 * row: the caller must fail closed instead of treating it as a free seat.
 */
export function collaborationReaderHoldsSeat(state: string): boolean | null {
  if ((COLLABORATION_ACTIVE_READER_STATES as readonly string[]).includes(state)) return true;
  if ((COLLABORATION_RELEASED_READER_STATES as readonly string[]).includes(state)) return false;
  return null;
}
