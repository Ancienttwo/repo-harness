import { describe, expect, test } from 'bun:test';

import {
  MODULE_MESSAGE_BODY_MAX_BYTES,
  ModuleMessageError,
  acknowledgeModuleMessageReceipt,
  applyModuleMessageObservation,
  buildModuleMessageDeliveryObservation,
  buildModuleMessageDeliveryReceipt,
  buildModuleMessageEvent,
  canonicalModuleMessageDeliveryObservationBytes,
  canonicalModuleMessageDeliveryReceiptBytes,
  canonicalModuleMessageEventBytes,
  renderModuleMessageTransportPayload,
  supersedeModuleMessageReceipt,
  validateModuleMessageDeliveryObservation,
  validateModuleMessageDeliveryReceipt,
  validateModuleMessageEvent,
  type ModuleMessageEventInput,
} from '../../src/core/engineers/module-message';

const MESSAGE_ID = '123e4567-e89b-42d3-a456-426614174000';
const BINDING_ID = '223e4567-e89b-42d3-a456-426614174000';
const ENGINEER_ID = 'engineer:capability.verification.evals-checks';
const CAPABILITY_ID = 'capability.verification.evals-checks';
const DIGEST = `sha256:${'a'.repeat(64)}`;

function event(overrides: Partial<ModuleMessageEventInput> = {}) {
  return buildModuleMessageEvent({
    message_id: MESSAGE_ID,
    capability_id: CAPABILITY_ID,
    target_engineer_id: ENGINEER_ID,
    scope: 'assignment',
    target_binding_id: BINDING_ID,
    target_binding_generation: 3,
    target_engineer_contract_revision: DIGEST,
    message_type: 'work_request',
    subject_ref: { kind: 'work_package', id: 'wp-1', revision: DIGEST },
    resource_refs: [
      { kind: 'contract', locator: 'tasks/contracts/work.contract.md', sha256: DIGEST },
      { kind: 'work_envelope', locator: '.ai/harness/handoff/work-envelope.json', sha256: DIGEST },
    ],
    sender: { kind: 'program_orchestrator', principal_ref: 'human:ancienttwo', binding_generation: null },
    body: 'Review the exact Work Package resources.',
    created_at: '2026-08-25T06:00:00.000Z',
    ...overrides,
  });
}

describe('ModuleMessageEventV1', () => {
  test('uses a closed canonical assignment schema and bounded summary-and-reference transport', () => {
    const value = event();
    expect(validateModuleMessageEvent(JSON.parse(canonicalModuleMessageEventBytes(value)))).toEqual(value);
    expect(value.body_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(value.event_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const payload = renderModuleMessageTransportPayload(value);
    expect(payload).toContain(value.event_digest);
    expect(payload).toContain('tasks/contracts/work.contract.md');
    expect(payload).not.toContain('"protocol":1');
  });

  test('rejects open fields, unsafe refs, invalid authorities and scope fence drift', () => {
    expect(() => validateModuleMessageEvent({ ...event(), extra: true })).toThrow('fields are invalid');
    expect(() => event({ message_type: 'run_shell' as never })).toThrow('message_type is invalid');
    expect(() => event({ resource_refs: [{ kind: 'contract', locator: '../secret', sha256: DIGEST }] })).toThrow('unsafe');
    expect(() => event({ body: 'x'.repeat(MODULE_MESSAGE_BODY_MAX_BYTES + 1) })).toThrow('exceeds');
    expect(() => event({ scope: 'module' })).toThrow('module scope target fences must be null');
    expect(() => event({
      scope: 'module',
      target_binding_id: null,
      target_binding_generation: null,
      target_engineer_contract_revision: null,
    })).not.toThrow();
    expect(() => event({ sender: { kind: 'human', principal_ref: 'human:a', binding_generation: 1 } })).toThrow('must be null');
  });
});

describe('ModuleMessage delivery chain', () => {
  test('keeps transport failures pending, chains attempts, then delivers and acknowledges', () => {
    const message = event();
    const pending = buildModuleMessageDeliveryReceipt(message);
    const failed = buildModuleMessageDeliveryObservation({
      message_event_digest: message.event_digest,
      recipient_engineer_id: ENGINEER_ID,
      target_binding_generation: 3,
      attempt: 1,
      outcome: 'transport_error',
      provider_delivery_ref: null,
      observed_at: '2026-08-25T06:01:00.000Z',
      previous_observation_digest: null,
    });
    const stillPending = applyModuleMessageObservation(pending, failed);
    expect(stillPending).toMatchObject({ delivery_state: 'pending', attempt: 1, latest_observation_digest: failed.observation_digest });
    const delivered = buildModuleMessageDeliveryObservation({
      message_event_digest: message.event_digest,
      recipient_engineer_id: ENGINEER_ID,
      target_binding_generation: 3,
      attempt: 2,
      outcome: 'delivered',
      provider_delivery_ref: 'provider-message-1',
      observed_at: '2026-08-25T06:02:00.000Z',
      previous_observation_digest: failed.observation_digest,
    });
    const deliveredReceipt = applyModuleMessageObservation(stillPending, delivered);
    const acknowledged = acknowledgeModuleMessageReceipt(deliveredReceipt, 3);
    expect(acknowledged).toMatchObject({ delivery_state: 'acknowledged', attempt: 2, acknowledged_by_binding_generation: 3 });
    expect(validateModuleMessageDeliveryReceipt(JSON.parse(canonicalModuleMessageDeliveryReceiptBytes(acknowledged)))).toEqual(acknowledged);
    expect(validateModuleMessageDeliveryObservation(JSON.parse(canonicalModuleMessageDeliveryObservationBytes(delivered)))).toEqual(delivered);
  });

  test('rejects broken observation chains and closed transitions', () => {
    const message = event();
    const pending = buildModuleMessageDeliveryReceipt(message);
    const skipped = buildModuleMessageDeliveryObservation({
      message_event_digest: message.event_digest,
      recipient_engineer_id: ENGINEER_ID,
      target_binding_generation: 3,
      attempt: 2,
      outcome: 'delivered',
      provider_delivery_ref: null,
      observed_at: '2026-08-25T06:02:00.000Z',
      previous_observation_digest: null,
    });
    expect(() => applyModuleMessageObservation(pending, skipped)).toThrow(ModuleMessageError);
    expect(() => acknowledgeModuleMessageReceipt(pending, 3)).toThrow('cannot acknowledge');
    expect(supersedeModuleMessageReceipt(pending).delivery_state).toBe('superseded');
    expect(() => validateModuleMessageDeliveryObservation({ ...skipped, outcome: 'unknown' })).toThrow('outcome is invalid');
  });
});
