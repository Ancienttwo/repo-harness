/**
 * C3 — `HandoffAdoptionReceiptV1` schema invariants.
 *
 * Acceptance for sprint row C3: the receipt carries `handoff_sha256`, and its
 * identity is the frozen triple of handoff SHA, adopter actor SHA and context
 * packet SHA. Non-exclusive adoption is a property of that identity — two
 * adopters differ in exactly one term — so it is proven here at the schema
 * level and again against the filesystem in
 * `tests/effects/collaboration-adoption-store.test.ts`.
 */
import { describe, expect, test } from 'bun:test';

import {
  CollaborationError,
  COLLABORATION_PROTOCOL,
  collaborationActorSha256,
  deriveCollaborationRecordId,
  type CollaborationActorRefV1,
} from '../../src/core/collaboration/common';
import {
  HANDOFF_ADOPTION_RECEIPT_KIND,
  buildHandoffAdoptionReceipt,
  canonicalHandoffAdoptionReceiptBytes,
  deriveHandoffAdoptionReceiptId,
  handoffAdoptionReceiptId,
  validateHandoffAdoptionReceipt,
  type HandoffAdoptionReceiptInput,
} from '../../src/core/collaboration/adoption';

const HANDOFF_ID = 'a'.repeat(64);
const HANDOFF_SHA = `sha256:${'1'.repeat(64)}`;
const PACKET_SHA = `sha256:${'2'.repeat(64)}`;
const OTHER_PACKET_SHA = `sha256:${'3'.repeat(64)}`;

function engineer(id: string, generation = 1): CollaborationActorRefV1 {
  return Object.freeze({
    kind: 'module_engineer',
    engineer_id: `engineer:capability.runtime-harness.${id}`,
    binding_id: '11111111-1111-4111-8111-111111111111',
    binding_generation: generation,
    principal_mapping_sha256: `sha256:${'e'.repeat(64)}`,
  });
}

const ADOPTER = engineer('collaboration');
const OTHER_ADOPTER = engineer('mcp-sidecar');

function input(overrides: Partial<HandoffAdoptionReceiptInput> = {}): HandoffAdoptionReceiptInput {
  return {
    handoff_id: HANDOFF_ID,
    handoff_sha256: HANDOFF_SHA,
    adopter: ADOPTER,
    context_packet_sha256: PACKET_SHA,
    adopted_at: '2026-08-30T00:00:00.000Z',
    ...overrides,
  };
}

function code(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof CollaborationError) return error.code;
    return `other:${(error as Error).message}`;
  }
  return 'no-error';
}

describe('C3 HandoffAdoptionReceiptV1 schema', () => {
  test('a receipt round-trips and carries the adopted handoff digest', () => {
    const receipt = buildHandoffAdoptionReceipt(input());
    expect(receipt.protocol).toBe(COLLABORATION_PROTOCOL);
    expect(receipt.kind).toBe(HANDOFF_ADOPTION_RECEIPT_KIND);
    expect(receipt.handoff_sha256).toBe(HANDOFF_SHA);
    expect(receipt.receipt_sha256).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(validateHandoffAdoptionReceipt(JSON.parse(canonicalHandoffAdoptionReceiptBytes(receipt))))
      .toEqual(receipt);
  });

  test('the record is exact-key and a stale digest is refused', () => {
    const receipt = buildHandoffAdoptionReceipt(input());
    expect(code(() => validateHandoffAdoptionReceipt({ ...receipt, extra: 1 }))).toBe('collaboration_invalid');
    const { handoff_sha256: _dropped, ...missing } = receipt;
    expect(code(() => validateHandoffAdoptionReceipt(missing))).toBe('collaboration_invalid');
    expect(code(() => validateHandoffAdoptionReceipt({ ...receipt, receipt_sha256: PACKET_SHA })))
      .toBe('collaboration_invalid');
    expect(code(() => validateHandoffAdoptionReceipt({ ...receipt, context_packet_sha256: OTHER_PACKET_SHA })))
      .toBe('collaboration_invalid');
    expect(code(() => validateHandoffAdoptionReceipt({ ...receipt, protocol: 2 }))).toBe('collaboration_invalid');
  });

  test('every reference is held to its declared shape', () => {
    expect(code(() => buildHandoffAdoptionReceipt(input({ handoff_id: 'not-hex' })))).toBe('collaboration_invalid');
    expect(code(() => buildHandoffAdoptionReceipt(input({ handoff_id: '../escape' })))).toBe('collaboration_invalid');
    expect(code(() => buildHandoffAdoptionReceipt(input({ handoff_sha256: '1'.repeat(64) }))))
      .toBe('collaboration_invalid');
    expect(code(() => buildHandoffAdoptionReceipt(input({ context_packet_sha256: 'sha256:short' }))))
      .toBe('collaboration_invalid');
    expect(code(() => buildHandoffAdoptionReceipt(input({ adopted_at: '2026-08-30 00:00:00' }))))
      .toBe('collaboration_invalid');
    expect(code(() => buildHandoffAdoptionReceipt(input({ adopter: { kind: 'human_operator' } as never }))))
      .toBe('collaboration_invalid');
  });

  /**
   * The frozen sentence, expressed as arithmetic on the identity: two adopters
   * of one handoff differ in exactly the adopter term, so they cannot collide
   * and neither can exclude the other. Nothing here consults a policy.
   */
  test('adoption is non-exclusive: distinct adopters derive distinct identities', () => {
    const mine = deriveHandoffAdoptionReceiptId(HANDOFF_SHA, ADOPTER, PACKET_SHA);
    const theirs = deriveHandoffAdoptionReceiptId(HANDOFF_SHA, OTHER_ADOPTER, PACKET_SHA);
    expect(mine).toMatch(/^[0-9a-f]{64}$/u);
    expect(mine).not.toBe(theirs);
    // A rebinding is a different actor digest and therefore a different receipt.
    expect(mine).not.toBe(deriveHandoffAdoptionReceiptId(HANDOFF_SHA, engineer('collaboration', 2), PACKET_SHA));
  });

  test('the identity is exactly the frozen triple', () => {
    expect(deriveHandoffAdoptionReceiptId(HANDOFF_SHA, ADOPTER, PACKET_SHA))
      .toBe(deriveCollaborationRecordId('handoff-adoption-receipt', [
        HANDOFF_SHA,
        collaborationActorSha256(ADOPTER),
        PACKET_SHA,
      ]));
    // Each term moves the identity, so none of the three is decorative.
    const base = deriveHandoffAdoptionReceiptId(HANDOFF_SHA, ADOPTER, PACKET_SHA);
    expect(base).not.toBe(deriveHandoffAdoptionReceiptId(`sha256:${'4'.repeat(64)}`, ADOPTER, PACKET_SHA));
    expect(base).not.toBe(deriveHandoffAdoptionReceiptId(HANDOFF_SHA, OTHER_ADOPTER, PACKET_SHA));
    expect(base).not.toBe(deriveHandoffAdoptionReceiptId(HANDOFF_SHA, ADOPTER, OTHER_PACKET_SHA));
  });

  /**
   * The same adopter re-adopting the same handoff with the same packet lands on
   * the receipt it already has. `adopted_at` is not part of the identity, which
   * is what makes a retry idempotent instead of a second receipt per attempt.
   */
  test('the same triple is one identity regardless of when it is recorded', () => {
    const first = buildHandoffAdoptionReceipt(input());
    const later = buildHandoffAdoptionReceipt(input({ adopted_at: '2026-09-01T12:00:00.000Z' }));
    expect(handoffAdoptionReceiptId(first)).toBe(handoffAdoptionReceiptId(later));
    // The content digests differ, which is why the store must reconcile against
    // the recorded time rather than re-sampling the clock.
    expect(first.receipt_sha256).not.toBe(later.receipt_sha256);
  });

  test('the derived identity is recomputable from the persisted bytes alone', () => {
    const receipt = buildHandoffAdoptionReceipt(input());
    const parsed = validateHandoffAdoptionReceipt(JSON.parse(canonicalHandoffAdoptionReceiptBytes(receipt)));
    expect(handoffAdoptionReceiptId(parsed))
      .toBe(deriveHandoffAdoptionReceiptId(HANDOFF_SHA, ADOPTER, PACKET_SHA));
  });
});
