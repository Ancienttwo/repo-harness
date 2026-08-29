/**
 * `HandoffAdoptionReceiptV1` — proof that a body of knowledge was handed to
 * someone, and nothing more than that.
 *
 * Sprint row C3, and the frozen sentence this module exists to keep true:
 *
 * > Handoff adoption is non-exclusive.
 *
 * Uniqueness lives on the Task Lease writer side only, and a writer changes
 * exclusively through the existing release / takeover / acquire lifecycle. A
 * receipt grants no Task, grants no Lease, and changes nothing about who owns
 * work. It records that a context packet built from one handoff reached one
 * adopter, so a later reader can tell whether a handoff has been picked up at
 * all. Many adopters may adopt the same handoff; a handoff nobody has adopted is
 * an `unadopted_handoff`, and the ownership vocabulary of the delivery plane is
 * deliberately absent from this record family.
 *
 * Identity is the frozen triple: handoff SHA + adopter actor SHA + context
 * packet SHA. Two distinct adopters differ in the second term and land two
 * receipts; the same adopter repeating the same triple converges on the one it
 * already wrote. Non-exclusivity therefore falls out of the identity rather than
 * out of a policy check somebody could later relax.
 *
 * The wire version is the frozen `COLLABORATION_PROTOCOL`; this row mints no
 * second protocol constant for the same plane.
 */
import {
  COLLABORATION_PROTOCOL,
  canonicalCollaborationBytes,
  canonicalCollaborationDigest,
  collaborationActorSha256,
  collaborationInvalid,
  deriveCollaborationRecordId,
  isCollaborationRecord,
  validateCollaborationActorRef,
  validateCollaborationRecordId,
  validateCollaborationRecordedAt,
  type CollaborationActorRefV1,
} from './common';
import {
  assertMessageExactKeys,
  assertMessageSha256,
  messageRequiredString,
} from '../messages/mechanics';

export const HANDOFF_ADOPTION_RECEIPT_KIND = 'repo-harness-handoff-adoption-receipt' as const;

export interface HandoffAdoptionReceiptV1 {
  readonly protocol: typeof COLLABORATION_PROTOCOL;
  readonly kind: typeof HANDOFF_ADOPTION_RECEIPT_KIND;
  readonly handoff_id: string;
  /**
   * The exact bytes adopted. `handoff_id` alone would let a superseding revision
   * silently change what the receipt attests to; the digest pins the version.
   */
  readonly handoff_sha256: string;
  readonly adopter: CollaborationActorRefV1;
  readonly context_packet_sha256: string;
  /** Host-derived and stable across retries; never re-sampled from the wall clock. */
  readonly adopted_at: string;
  readonly receipt_sha256: string;
}

export type HandoffAdoptionReceiptInput =
  Omit<HandoffAdoptionReceiptV1, 'protocol' | 'kind' | 'receipt_sha256'>;

const RECEIPT_FIELDS = [
  'protocol',
  'kind',
  'handoff_id',
  'handoff_sha256',
  'adopter',
  'context_packet_sha256',
  'adopted_at',
  'receipt_sha256',
] as const;

function digest(value: unknown, field: string): string {
  const text = messageRequiredString(value, field, collaborationInvalid);
  assertMessageSha256(text, field, collaborationInvalid);
  return text;
}

/**
 * The frozen receipt identity. It is derived rather than carried as a field, so
 * the record cannot assert one identity while being filed under another: the
 * store recomputes this from the persisted bytes and compares it with the name
 * it read them from.
 *
 * `handoff_id` is deliberately not part of the preimage. The digest already
 * pins the exact handoff bytes, and those bytes contain the id.
 */
export function deriveHandoffAdoptionReceiptId(
  handoffSha256: string,
  adopter: CollaborationActorRefV1,
  contextPacketSha256: string,
): string {
  return deriveCollaborationRecordId('handoff-adoption-receipt', [
    digest(handoffSha256, 'handoff_sha256'),
    collaborationActorSha256(adopter),
    digest(contextPacketSha256, 'context_packet_sha256'),
  ]);
}

export function buildHandoffAdoptionReceipt(
  input: HandoffAdoptionReceiptInput,
): HandoffAdoptionReceiptV1 {
  const basis = Object.freeze({
    protocol: COLLABORATION_PROTOCOL,
    kind: HANDOFF_ADOPTION_RECEIPT_KIND,
    handoff_id: validateCollaborationRecordId(input.handoff_id, 'handoff_id'),
    handoff_sha256: digest(input.handoff_sha256, 'handoff_sha256'),
    adopter: validateCollaborationActorRef(input.adopter),
    context_packet_sha256: digest(input.context_packet_sha256, 'context_packet_sha256'),
    adopted_at: validateCollaborationRecordedAt(input.adopted_at, 'adopted_at'),
  });
  return Object.freeze({
    ...basis,
    receipt_sha256: canonicalCollaborationDigest(basis as unknown as Readonly<Record<string, unknown>>),
  });
}

export function validateHandoffAdoptionReceipt(value: unknown): HandoffAdoptionReceiptV1 {
  if (!isCollaborationRecord(value)) collaborationInvalid('handoff adoption receipt must be an object');
  assertMessageExactKeys(value, RECEIPT_FIELDS, 'handoff adoption receipt', collaborationInvalid);
  if (value.protocol !== COLLABORATION_PROTOCOL || value.kind !== HANDOFF_ADOPTION_RECEIPT_KIND) {
    collaborationInvalid('handoff adoption receipt protocol or kind is invalid');
  }
  const receipt = buildHandoffAdoptionReceipt({
    handoff_id: value.handoff_id as string,
    handoff_sha256: value.handoff_sha256 as string,
    adopter: value.adopter as CollaborationActorRefV1,
    context_packet_sha256: value.context_packet_sha256 as string,
    adopted_at: value.adopted_at as string,
  });
  if (value.receipt_sha256 !== receipt.receipt_sha256) {
    collaborationInvalid('handoff adoption receipt receipt_sha256 is stale');
  }
  return receipt;
}

export function handoffAdoptionReceiptId(receipt: HandoffAdoptionReceiptV1): string {
  return deriveHandoffAdoptionReceiptId(
    receipt.handoff_sha256,
    receipt.adopter,
    receipt.context_packet_sha256,
  );
}

export function canonicalHandoffAdoptionReceiptBytes(receipt: HandoffAdoptionReceiptV1): string {
  return canonicalCollaborationBytes(
    validateHandoffAdoptionReceipt(receipt) as unknown as Readonly<Record<string, unknown>>,
  );
}
