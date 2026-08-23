import { describe, expect, test } from 'bun:test';

import {
  TASK_MESSAGE_BODY_MAX_BYTES,
  TaskMessageError,
  buildTaskMessageDeliveryReceipt,
  buildTaskMessageEvent,
  canonicalTaskMessageDeliveryReceiptBytes,
  canonicalTaskMessageEventBytes,
  deriveTaskMessageRecipientKey,
  transitionTaskMessageDeliveryReceipt,
  validateTaskMessageDeliveryReceipt,
  validateTaskMessageEvent,
} from '../../src/core/fleet/task-message';

const TASK_ID = '1'.repeat(64);
const REVISION = '2'.repeat(64);
const MESSAGE_ID = '123e4567-e89b-42d3-a456-426614174000';
const CLAIM_ID = '223e4567-e89b-42d3-a456-426614174000';

function event(overrides: Partial<Parameters<typeof buildTaskMessageEvent>[0]> = {}) {
  return buildTaskMessageEvent({
    message_id: MESSAGE_ID,
    task_id: TASK_ID,
    task_revision: REVISION,
    scope: 'task',
    target_claim_id: null,
    target_generation: null,
    sender_kind: 'user',
    sender_id: 'alice',
    sender_trust: 'local_operator',
    audience: 'owner',
    body: 'please inspect the latest failure',
    created_at: '2026-08-23T04:55:00Z',
    in_reply_to: null,
    ...overrides,
  });
}

describe('TaskMessageEventV1', () => {
  test('freezes canonical immutable bytes and both byte digests', () => {
    const first = event();
    const second = event();
    expect(first).toEqual(second);
    expect(first.body_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.event_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(canonicalTaskMessageEventBytes(first)).toBe(canonicalTaskMessageEventBytes(second));
    expect(validateTaskMessageEvent(JSON.parse(canonicalTaskMessageEventBytes(first)))).toEqual(first);
  });

  test('closes claim scope, body limit, and digest fields', () => {
    expect(() => event({ scope: 'claim' })).toThrow(TaskMessageError);
    expect(() => event({ scope: 'claim', target_claim_id: CLAIM_ID, target_generation: 1, audience: 'user' })).toThrow('claim scope audience');
    expect(() => event({ body: 'x'.repeat(TASK_MESSAGE_BODY_MAX_BYTES + 1) })).toThrow('exceeds 8 KiB');
    const stale = { ...event(), body_sha256: `sha256:${'0'.repeat(64)}` };
    expect(() => validateTaskMessageEvent(stale)).toThrow('body_sha256 is stale');
    expect(() => validateTaskMessageEvent({ ...event(), unknown: true })).toThrow('fields are invalid');
  });
});

describe('TaskMessageDeliveryReceiptV1', () => {
  test('uses closed recipient identities and state transitions', () => {
    const recipient = { kind: 'claim' as const, claim_id: CLAIM_ID, generation: 1 };
    expect(deriveTaskMessageRecipientKey(recipient)).toBe(`claim:${CLAIM_ID}:g1`);
    const pending = buildTaskMessageDeliveryReceipt({
      message_id: MESSAGE_ID,
      recipient,
      task_revision: REVISION,
      delivery_channel: 'hook_session',
    });
    const delivered = transitionTaskMessageDeliveryReceipt(pending, { state: 'delivered', at: '2026-08-23T05:00:00Z' });
    const acknowledged = transitionTaskMessageDeliveryReceipt(delivered, { state: 'acknowledged', at: '2026-08-23T05:01:00Z' });
    expect(transitionTaskMessageDeliveryReceipt(acknowledged, { state: 'acknowledged', at: '2026-08-23T06:01:00Z' })).toEqual(acknowledged);
    expect(() => transitionTaskMessageDeliveryReceipt(pending, { state: 'acknowledged', at: '2026-08-23T05:01:00Z' })).toThrow('cannot acknowledge');
    expect(validateTaskMessageDeliveryReceipt(JSON.parse(canonicalTaskMessageDeliveryReceiptBytes(acknowledged)))).toEqual(acknowledged);
  });

  test('allows only pending or delivered supersession', () => {
    const pending = buildTaskMessageDeliveryReceipt({
      message_id: MESSAGE_ID,
      recipient: { kind: 'user', id: 'alice' },
      task_revision: REVISION,
      delivery_channel: 'manual',
    });
    expect(transitionTaskMessageDeliveryReceipt(pending, { state: 'superseded' }).delivery_state).toBe('superseded');
    const delivered = transitionTaskMessageDeliveryReceipt(pending, { state: 'delivered', at: '2026-08-23T05:00:00Z' });
    expect(transitionTaskMessageDeliveryReceipt(delivered, { state: 'superseded' }).delivered_at).toBe('2026-08-23T05:00:00Z');
  });
});
