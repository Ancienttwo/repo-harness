import {
  assertMessageBoundedUtf8,
  assertMessageExactKeys,
  assertMessageInteger,
  assertMessageSha256,
  assertMessageTimestamp,
  assertMessageUuid,
  canonicalMessageBytes,
  canonicalMessageDigest,
  messageNullableString,
  messageRequiredString,
  messageSha256,
} from '../messages/mechanics';

export const PROVIDER_THREAD_EFFECT_PROTOCOL = 1 as const;
export const PROVIDER_THREAD_CAPABILITY_KIND = 'repo-harness-provider-thread-capability-observation' as const;
export const PROVIDER_THREAD_EFFECT_INTENT_KIND = 'repo-harness-provider-thread-effect-intent' as const;
export const PROVIDER_THREAD_HOST_ACTION_KIND = 'repo-harness-provider-thread-host-action' as const;
export const PROVIDER_THREAD_EFFECT_OBSERVATION_KIND = 'repo-harness-provider-thread-effect-observation' as const;
export const PROVIDER_THREAD_EFFECT_CURRENT_KIND = 'repo-harness-provider-thread-effect-current' as const;
export const PROVIDER_THREAD_ADAPTER_KIND = 'codex-app-thread' as const;
export const PROVIDER_THREAD_EFFECT_PAYLOAD_MAX_BYTES = 24 * 1024;

const ENGINEER_ID_PATTERN = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;

export type ProviderThreadOperation = 'send' | 'resume' | 'observe' | 'stop';
export type ProviderThreadCapabilityStatus = 'supported' | 'unsupported' | 'unavailable' | 'unverifiable';
export type ProviderThreadEffectState =
  | 'intent_persisted'
  | 'effect_started'
  | 'observed_success'
  | 'observed_failure'
  | 'reconciliation_required'
  | 'stopped';
export type ProviderThreadFailureClass =
  | 'none'
  | 'binding_stale'
  | 'capability_unsupported'
  | 'adapter_unavailable'
  | 'provider'
  | 'unknown';

export interface ProviderThreadCapabilityEvidenceRefV1 {
  readonly ref: string;
  readonly sha256: string;
}

export interface ProviderThreadCapabilityObservationV1 {
  readonly protocol: typeof PROVIDER_THREAD_EFFECT_PROTOCOL;
  readonly kind: typeof PROVIDER_THREAD_CAPABILITY_KIND;
  readonly adapter_kind: typeof PROVIDER_THREAD_ADAPTER_KIND;
  readonly host_id: string;
  readonly operations: Readonly<Record<ProviderThreadOperation, ProviderThreadCapabilityStatus>>;
  readonly evidence_refs: readonly ProviderThreadCapabilityEvidenceRefV1[];
  readonly observed_at: string;
  readonly capability_sha256: string;
}

export interface ProviderThreadEffectIntentV1 {
  readonly protocol: typeof PROVIDER_THREAD_EFFECT_PROTOCOL;
  readonly kind: typeof PROVIDER_THREAD_EFFECT_INTENT_KIND;
  readonly effect_id: string;
  readonly idempotency_key: string;
  readonly operation_fingerprint: string;
  readonly message_id: string;
  readonly message_event_digest: string;
  readonly delivery_attempt: number;
  readonly engineer_id: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly engineer_contract_revision: string;
  readonly adapter_kind: typeof PROVIDER_THREAD_ADAPTER_KIND;
  readonly operation: ProviderThreadOperation;
  readonly host_id: string;
  readonly provider_thread_id: string;
  readonly capability_sha256: string;
  readonly payload: string;
  readonly payload_sha256: string;
  readonly created_at: string;
  readonly intent_sha256: string;
}

export interface ProviderThreadHostActionV1 {
  readonly protocol: typeof PROVIDER_THREAD_EFFECT_PROTOCOL;
  readonly kind: typeof PROVIDER_THREAD_HOST_ACTION_KIND;
  readonly effect_id: string;
  readonly intent_sha256: string;
  readonly adapter_kind: typeof PROVIDER_THREAD_ADAPTER_KIND;
  readonly operation: ProviderThreadOperation;
  readonly host_id: string;
  readonly provider_thread_id: string;
  readonly payload: string;
  readonly message_event_digest: string;
  readonly delivery_attempt: number;
  readonly action_sha256: string;
}

export interface ProviderThreadUsageV1 {
  readonly authority: 'provider' | 'unavailable';
  readonly input_tokens: number | null;
  readonly cached_input_tokens: number | null;
  readonly output_tokens: number | null;
}

export interface ProviderThreadEffectObservationV1 {
  readonly protocol: typeof PROVIDER_THREAD_EFFECT_PROTOCOL;
  readonly kind: typeof PROVIDER_THREAD_EFFECT_OBSERVATION_KIND;
  readonly effect_id: string;
  readonly intent_sha256: string;
  readonly sequence: number;
  readonly state: ProviderThreadEffectState;
  readonly host_id: string;
  readonly provider_thread_id: string;
  readonly provider_turn_id: string | null;
  readonly provider_user_message_id: string | null;
  readonly provider_assistant_message_id: string | null;
  readonly provider_effect_ref: string | null;
  readonly failure_class: ProviderThreadFailureClass;
  readonly usage: ProviderThreadUsageV1;
  readonly observed_at: string;
  readonly previous_observation_sha256: string | null;
  readonly observation_sha256: string;
}

export interface ProviderThreadEffectCurrentV1 {
  readonly protocol: typeof PROVIDER_THREAD_EFFECT_PROTOCOL;
  readonly kind: typeof PROVIDER_THREAD_EFFECT_CURRENT_KIND;
  readonly effect_id: string;
  readonly intent_sha256: string;
  readonly sequence: number;
  readonly state: ProviderThreadEffectState;
  readonly latest_observation_sha256: string;
  readonly current_sha256: string;
}

export type ProviderThreadEffectErrorCode =
  | 'provider_thread_effect_invalid'
  | 'provider_thread_effect_transition_invalid';

export class ProviderThreadEffectError extends Error {
  constructor(readonly code: ProviderThreadEffectErrorCode, message: string) {
    super(message);
    this.name = 'ProviderThreadEffectError';
  }
}

function invalid(message: string): never {
  throw new ProviderThreadEffectError('provider_thread_effect_invalid', message);
}

function transitionInvalid(message: string): never {
  throw new ProviderThreadEffectError('provider_thread_effect_transition_invalid', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertBoundedRequired(value: unknown, field: string, maximum = 512): asserts value is string {
  const text = messageRequiredString(value, field, invalid);
  assertMessageBoundedUtf8(text, field, maximum, invalid);
}

function assertEngineerId(value: string): void {
  if (!ENGINEER_ID_PATTERN.test(value)) invalid('engineer_id is invalid');
}

function assertOperation(value: unknown): asserts value is ProviderThreadOperation {
  if (value !== 'send' && value !== 'resume' && value !== 'observe' && value !== 'stop') {
    invalid('operation is invalid');
  }
}

function assertCapabilityStatus(value: unknown, field: string): asserts value is ProviderThreadCapabilityStatus {
  if (value !== 'supported' && value !== 'unsupported' && value !== 'unavailable' && value !== 'unverifiable') {
    invalid(`${field} is invalid`);
  }
}

function assertState(value: unknown): asserts value is ProviderThreadEffectState {
  if (value !== 'intent_persisted' && value !== 'effect_started' && value !== 'observed_success'
    && value !== 'observed_failure' && value !== 'reconciliation_required' && value !== 'stopped') {
    invalid('state is invalid');
  }
}

function assertFailureClass(value: unknown): asserts value is ProviderThreadFailureClass {
  if (value !== 'none' && value !== 'binding_stale' && value !== 'capability_unsupported'
    && value !== 'adapter_unavailable' && value !== 'provider' && value !== 'unknown') {
    invalid('failure_class is invalid');
  }
}

function nullableBounded(value: unknown, field: string): string | null {
  const text = messageNullableString(value, field, invalid);
  if (text !== null) assertMessageBoundedUtf8(text, field, 512, invalid);
  return text;
}

function capabilityDigest(value: Omit<ProviderThreadCapabilityObservationV1, 'capability_sha256'>): string {
  return canonicalMessageDigest(value as unknown as Readonly<Record<string, unknown>>);
}

export function buildProviderThreadCapabilityObservation(input: Omit<ProviderThreadCapabilityObservationV1,
  'protocol' | 'kind' | 'adapter_kind' | 'capability_sha256'>): ProviderThreadCapabilityObservationV1 {
  assertBoundedRequired(input.host_id, 'host_id');
  if (!isRecord(input.operations)) invalid('operations must be an object');
  assertMessageExactKeys(input.operations, ['send', 'resume', 'observe', 'stop'], 'operations', invalid);
  for (const operation of ['send', 'resume', 'observe', 'stop'] as const) {
    assertCapabilityStatus(input.operations[operation], `operations.${operation}`);
  }
  if (!Array.isArray(input.evidence_refs) || input.evidence_refs.length > 8) invalid('evidence_refs is invalid');
  const evidenceRefs = input.evidence_refs.map((item) => {
    if (!isRecord(item)) invalid('evidence_ref must be an object');
    assertMessageExactKeys(item, ['ref', 'sha256'], 'evidence_ref', invalid);
    assertBoundedRequired(item.ref, 'evidence_ref.ref', 1024);
    const sha256 = messageRequiredString(item.sha256, 'evidence_ref.sha256', invalid);
    assertMessageSha256(sha256, 'evidence_ref.sha256', invalid);
    return Object.freeze({ ref: item.ref, sha256 });
  });
  assertMessageTimestamp(input.observed_at, 'observed_at', invalid);
  const basis = Object.freeze({
    protocol: PROVIDER_THREAD_EFFECT_PROTOCOL,
    kind: PROVIDER_THREAD_CAPABILITY_KIND,
    adapter_kind: PROVIDER_THREAD_ADAPTER_KIND,
    host_id: input.host_id,
    operations: Object.freeze({ ...input.operations }),
    evidence_refs: Object.freeze(evidenceRefs),
    observed_at: input.observed_at,
  });
  return Object.freeze({ ...basis, capability_sha256: capabilityDigest(basis) });
}

export function validateProviderThreadCapabilityObservation(value: unknown): ProviderThreadCapabilityObservationV1 {
  if (!isRecord(value)) invalid('capability observation must be an object');
  assertMessageExactKeys(value, [
    'protocol', 'kind', 'adapter_kind', 'host_id', 'operations', 'evidence_refs', 'observed_at', 'capability_sha256',
  ], 'capability observation', invalid);
  if (value.protocol !== PROVIDER_THREAD_EFFECT_PROTOCOL || value.kind !== PROVIDER_THREAD_CAPABILITY_KIND
    || value.adapter_kind !== PROVIDER_THREAD_ADAPTER_KIND) invalid('capability observation protocol, kind, or adapter is invalid');
  const built = buildProviderThreadCapabilityObservation({
    host_id: value.host_id as string,
    operations: value.operations as Readonly<Record<ProviderThreadOperation, ProviderThreadCapabilityStatus>>,
    evidence_refs: value.evidence_refs as readonly ProviderThreadCapabilityEvidenceRefV1[],
    observed_at: value.observed_at as string,
  });
  if (value.capability_sha256 !== built.capability_sha256) invalid('capability_sha256 is stale');
  return built;
}

export function canonicalProviderThreadCapabilityBytes(value: ProviderThreadCapabilityObservationV1): string {
  return canonicalMessageBytes(validateProviderThreadCapabilityObservation(value) as unknown as Readonly<Record<string, unknown>>);
}

export function deriveProviderThreadEffectId(idempotencyKey: string): string {
  assertBoundedRequired(idempotencyKey, 'idempotency_key');
  return canonicalMessageDigest({
    domain: 'repo-harness-provider-thread-effect-id.v1',
    adapter_kind: PROVIDER_THREAD_ADAPTER_KIND,
    idempotency_key: idempotencyKey,
  });
}

type IntentInput = Omit<ProviderThreadEffectIntentV1,
  'protocol' | 'kind' | 'effect_id' | 'operation_fingerprint' | 'adapter_kind' | 'payload_sha256' | 'intent_sha256'>;

function operationFingerprint(input: IntentInput): string {
  return canonicalMessageDigest({
    domain: 'repo-harness-provider-thread-operation.v1',
    adapter_kind: PROVIDER_THREAD_ADAPTER_KIND,
    ...input,
    payload_sha256: messageSha256(input.payload),
  });
}

function intentDigest(value: Omit<ProviderThreadEffectIntentV1, 'intent_sha256'>): string {
  return canonicalMessageDigest(value as unknown as Readonly<Record<string, unknown>>);
}

export function buildProviderThreadEffectIntent(input: IntentInput): ProviderThreadEffectIntentV1 {
  assertBoundedRequired(input.idempotency_key, 'idempotency_key');
  assertMessageUuid(input.message_id, 'message_id', invalid);
  assertMessageSha256(input.message_event_digest, 'message_event_digest', invalid);
  assertMessageInteger(input.delivery_attempt, 'delivery_attempt', 1, invalid);
  assertEngineerId(input.engineer_id);
  assertMessageUuid(input.binding_id, 'binding_id', invalid);
  assertMessageInteger(input.binding_generation, 'binding_generation', 1, invalid);
  assertMessageSha256(input.engineer_contract_revision, 'engineer_contract_revision', invalid);
  assertOperation(input.operation);
  assertBoundedRequired(input.host_id, 'host_id');
  assertBoundedRequired(input.provider_thread_id, 'provider_thread_id');
  assertMessageSha256(input.capability_sha256, 'capability_sha256', invalid);
  assertMessageBoundedUtf8(input.payload, 'payload', PROVIDER_THREAD_EFFECT_PAYLOAD_MAX_BYTES, invalid);
  assertMessageTimestamp(input.created_at, 'created_at', invalid);
  const basis = Object.freeze({
    protocol: PROVIDER_THREAD_EFFECT_PROTOCOL,
    kind: PROVIDER_THREAD_EFFECT_INTENT_KIND,
    effect_id: deriveProviderThreadEffectId(input.idempotency_key),
    idempotency_key: input.idempotency_key,
    operation_fingerprint: operationFingerprint(input),
    message_id: input.message_id,
    message_event_digest: input.message_event_digest,
    delivery_attempt: input.delivery_attempt,
    engineer_id: input.engineer_id,
    binding_id: input.binding_id,
    binding_generation: input.binding_generation,
    engineer_contract_revision: input.engineer_contract_revision,
    adapter_kind: PROVIDER_THREAD_ADAPTER_KIND,
    operation: input.operation,
    host_id: input.host_id,
    provider_thread_id: input.provider_thread_id,
    capability_sha256: input.capability_sha256,
    payload: input.payload,
    payload_sha256: messageSha256(input.payload),
    created_at: input.created_at,
  });
  return Object.freeze({ ...basis, intent_sha256: intentDigest(basis) });
}

export function validateProviderThreadEffectIntent(value: unknown): ProviderThreadEffectIntentV1 {
  if (!isRecord(value)) invalid('effect intent must be an object');
  assertMessageExactKeys(value, [
    'protocol', 'kind', 'effect_id', 'idempotency_key', 'operation_fingerprint', 'message_id',
    'message_event_digest', 'delivery_attempt', 'engineer_id', 'binding_id', 'binding_generation',
    'engineer_contract_revision', 'adapter_kind', 'operation', 'host_id', 'provider_thread_id',
    'capability_sha256', 'payload', 'payload_sha256', 'created_at', 'intent_sha256',
  ], 'effect intent', invalid);
  if (value.protocol !== PROVIDER_THREAD_EFFECT_PROTOCOL || value.kind !== PROVIDER_THREAD_EFFECT_INTENT_KIND
    || value.adapter_kind !== PROVIDER_THREAD_ADAPTER_KIND) invalid('effect intent protocol, kind, or adapter is invalid');
  const built = buildProviderThreadEffectIntent({
    idempotency_key: value.idempotency_key as string,
    message_id: value.message_id as string,
    message_event_digest: value.message_event_digest as string,
    delivery_attempt: value.delivery_attempt as number,
    engineer_id: value.engineer_id as string,
    binding_id: value.binding_id as string,
    binding_generation: value.binding_generation as number,
    engineer_contract_revision: value.engineer_contract_revision as string,
    operation: value.operation as ProviderThreadOperation,
    host_id: value.host_id as string,
    provider_thread_id: value.provider_thread_id as string,
    capability_sha256: value.capability_sha256 as string,
    payload: value.payload as string,
    created_at: value.created_at as string,
  });
  if (value.effect_id !== built.effect_id || value.operation_fingerprint !== built.operation_fingerprint
    || value.payload_sha256 !== built.payload_sha256 || value.intent_sha256 !== built.intent_sha256) {
    invalid('effect intent derived digest is stale');
  }
  return built;
}

export function canonicalProviderThreadEffectIntentBytes(value: ProviderThreadEffectIntentV1): string {
  return canonicalMessageBytes(validateProviderThreadEffectIntent(value) as unknown as Readonly<Record<string, unknown>>);
}

function actionDigest(value: Omit<ProviderThreadHostActionV1, 'action_sha256'>): string {
  return canonicalMessageDigest(value as unknown as Readonly<Record<string, unknown>>);
}

export function buildProviderThreadHostAction(intent: ProviderThreadEffectIntentV1): ProviderThreadHostActionV1 {
  const valid = validateProviderThreadEffectIntent(intent);
  const basis = Object.freeze({
    protocol: PROVIDER_THREAD_EFFECT_PROTOCOL,
    kind: PROVIDER_THREAD_HOST_ACTION_KIND,
    effect_id: valid.effect_id,
    intent_sha256: valid.intent_sha256,
    adapter_kind: PROVIDER_THREAD_ADAPTER_KIND,
    operation: valid.operation,
    host_id: valid.host_id,
    provider_thread_id: valid.provider_thread_id,
    payload: valid.payload,
    message_event_digest: valid.message_event_digest,
    delivery_attempt: valid.delivery_attempt,
  });
  return Object.freeze({ ...basis, action_sha256: actionDigest(basis) });
}

export function validateProviderThreadHostAction(value: unknown): ProviderThreadHostActionV1 {
  if (!isRecord(value)) invalid('host action must be an object');
  assertMessageExactKeys(value, [
    'protocol', 'kind', 'effect_id', 'intent_sha256', 'adapter_kind', 'operation', 'host_id',
    'provider_thread_id', 'payload', 'message_event_digest', 'delivery_attempt', 'action_sha256',
  ], 'host action', invalid);
  if (value.protocol !== PROVIDER_THREAD_EFFECT_PROTOCOL || value.kind !== PROVIDER_THREAD_HOST_ACTION_KIND
    || value.adapter_kind !== PROVIDER_THREAD_ADAPTER_KIND) invalid('host action protocol, kind, or adapter is invalid');
  const effectId = messageRequiredString(value.effect_id, 'effect_id', invalid);
  assertMessageSha256(effectId, 'effect_id', invalid);
  const intentSha = messageRequiredString(value.intent_sha256, 'intent_sha256', invalid);
  assertMessageSha256(intentSha, 'intent_sha256', invalid);
  assertOperation(value.operation);
  assertBoundedRequired(value.host_id, 'host_id');
  assertBoundedRequired(value.provider_thread_id, 'provider_thread_id');
  assertMessageBoundedUtf8(value.payload, 'payload', PROVIDER_THREAD_EFFECT_PAYLOAD_MAX_BYTES, invalid);
  const eventDigest = messageRequiredString(value.message_event_digest, 'message_event_digest', invalid);
  assertMessageSha256(eventDigest, 'message_event_digest', invalid);
  assertMessageInteger(value.delivery_attempt, 'delivery_attempt', 1, invalid);
  const basis = Object.freeze({
    protocol: PROVIDER_THREAD_EFFECT_PROTOCOL,
    kind: PROVIDER_THREAD_HOST_ACTION_KIND,
    effect_id: effectId,
    intent_sha256: intentSha,
    adapter_kind: PROVIDER_THREAD_ADAPTER_KIND,
    operation: value.operation,
    host_id: value.host_id,
    provider_thread_id: value.provider_thread_id,
    payload: value.payload,
    message_event_digest: eventDigest,
    delivery_attempt: value.delivery_attempt,
  }) as Omit<ProviderThreadHostActionV1, 'action_sha256'>;
  const built = Object.freeze({ ...basis, action_sha256: actionDigest(basis) });
  if (value.action_sha256 !== built.action_sha256) invalid('action_sha256 is stale');
  return built;
}

export function canonicalProviderThreadHostActionBytes(value: ProviderThreadHostActionV1): string {
  return canonicalMessageBytes(validateProviderThreadHostAction(value) as unknown as Readonly<Record<string, unknown>>);
}

function validateUsage(value: unknown): ProviderThreadUsageV1 {
  if (!isRecord(value)) invalid('usage must be an object');
  assertMessageExactKeys(value, ['authority', 'input_tokens', 'cached_input_tokens', 'output_tokens'], 'usage', invalid);
  if (value.authority !== 'provider' && value.authority !== 'unavailable') invalid('usage.authority is invalid');
  for (const field of ['input_tokens', 'cached_input_tokens', 'output_tokens'] as const) {
    if (value[field] !== null) assertMessageInteger(value[field], `usage.${field}`, 0, invalid);
  }
  if (value.authority === 'unavailable'
    && (value.input_tokens !== null || value.cached_input_tokens !== null || value.output_tokens !== null)) {
    invalid('unavailable usage cannot carry estimated token values');
  }
  return Object.freeze({
    authority: value.authority,
    input_tokens: value.input_tokens as number | null,
    cached_input_tokens: value.cached_input_tokens as number | null,
    output_tokens: value.output_tokens as number | null,
  });
}

type ObservationInput = Omit<ProviderThreadEffectObservationV1,
  'protocol' | 'kind' | 'observation_sha256'>;

function observationDigest(value: Omit<ProviderThreadEffectObservationV1, 'observation_sha256'>): string {
  return canonicalMessageDigest(value as unknown as Readonly<Record<string, unknown>>);
}

export function buildProviderThreadEffectObservation(input: ObservationInput): ProviderThreadEffectObservationV1 {
  assertMessageSha256(input.effect_id, 'effect_id', invalid);
  assertMessageSha256(input.intent_sha256, 'intent_sha256', invalid);
  assertMessageInteger(input.sequence, 'sequence', 0, invalid);
  assertState(input.state);
  assertBoundedRequired(input.host_id, 'host_id');
  assertBoundedRequired(input.provider_thread_id, 'provider_thread_id');
  const providerTurnId = nullableBounded(input.provider_turn_id, 'provider_turn_id');
  const providerUserMessageId = nullableBounded(input.provider_user_message_id, 'provider_user_message_id');
  const providerAssistantMessageId = nullableBounded(input.provider_assistant_message_id, 'provider_assistant_message_id');
  const providerEffectRef = nullableBounded(input.provider_effect_ref, 'provider_effect_ref');
  assertFailureClass(input.failure_class);
  const usage = validateUsage(input.usage);
  assertMessageTimestamp(input.observed_at, 'observed_at', invalid);
  if (input.previous_observation_sha256 !== null) {
    assertMessageSha256(input.previous_observation_sha256, 'previous_observation_sha256', invalid);
  }
  if (input.sequence === 0 && input.previous_observation_sha256 !== null) invalid('initial observation cannot have a predecessor');
  if (input.sequence > 0 && input.previous_observation_sha256 === null) invalid('non-initial observation requires a predecessor');
  const hasExactCorrelation = providerTurnId !== null && providerUserMessageId !== null && providerAssistantMessageId !== null;
  if (input.state === 'observed_success' && (!hasExactCorrelation || input.failure_class !== 'none')) {
    invalid('observed_success requires exact Provider correlation and no failure');
  }
  if (input.state === 'observed_failure' && input.failure_class === 'none') {
    invalid('observed_failure requires a failure_class');
  }
  if (input.state === 'reconciliation_required' && input.failure_class !== 'unknown') {
    invalid('reconciliation_required must use failure_class unknown');
  }
  if ((input.state === 'intent_persisted' || input.state === 'effect_started')
    && (providerTurnId !== null || providerUserMessageId !== null || providerAssistantMessageId !== null
      || providerEffectRef !== null || input.failure_class !== 'none')) {
    invalid(`${input.state} cannot claim Provider evidence`);
  }
  const basis = Object.freeze({
    protocol: PROVIDER_THREAD_EFFECT_PROTOCOL,
    kind: PROVIDER_THREAD_EFFECT_OBSERVATION_KIND,
    effect_id: input.effect_id,
    intent_sha256: input.intent_sha256,
    sequence: input.sequence,
    state: input.state,
    host_id: input.host_id,
    provider_thread_id: input.provider_thread_id,
    provider_turn_id: providerTurnId,
    provider_user_message_id: providerUserMessageId,
    provider_assistant_message_id: providerAssistantMessageId,
    provider_effect_ref: providerEffectRef,
    failure_class: input.failure_class,
    usage,
    observed_at: input.observed_at,
    previous_observation_sha256: input.previous_observation_sha256,
  });
  return Object.freeze({ ...basis, observation_sha256: observationDigest(basis) });
}

export function validateProviderThreadEffectObservation(value: unknown): ProviderThreadEffectObservationV1 {
  if (!isRecord(value)) invalid('effect observation must be an object');
  assertMessageExactKeys(value, [
    'protocol', 'kind', 'effect_id', 'intent_sha256', 'sequence', 'state', 'host_id', 'provider_thread_id',
    'provider_turn_id', 'provider_user_message_id', 'provider_assistant_message_id', 'provider_effect_ref',
    'failure_class', 'usage', 'observed_at', 'previous_observation_sha256', 'observation_sha256',
  ], 'effect observation', invalid);
  if (value.protocol !== PROVIDER_THREAD_EFFECT_PROTOCOL || value.kind !== PROVIDER_THREAD_EFFECT_OBSERVATION_KIND) {
    invalid('effect observation protocol or kind is invalid');
  }
  const built = buildProviderThreadEffectObservation({
    effect_id: value.effect_id as string,
    intent_sha256: value.intent_sha256 as string,
    sequence: value.sequence as number,
    state: value.state as ProviderThreadEffectState,
    host_id: value.host_id as string,
    provider_thread_id: value.provider_thread_id as string,
    provider_turn_id: value.provider_turn_id as string | null,
    provider_user_message_id: value.provider_user_message_id as string | null,
    provider_assistant_message_id: value.provider_assistant_message_id as string | null,
    provider_effect_ref: value.provider_effect_ref as string | null,
    failure_class: value.failure_class as ProviderThreadFailureClass,
    usage: value.usage as ProviderThreadUsageV1,
    observed_at: value.observed_at as string,
    previous_observation_sha256: value.previous_observation_sha256 as string | null,
  });
  if (value.observation_sha256 !== built.observation_sha256) invalid('observation_sha256 is stale');
  return built;
}

export function canonicalProviderThreadEffectObservationBytes(value: ProviderThreadEffectObservationV1): string {
  return canonicalMessageBytes(validateProviderThreadEffectObservation(value) as unknown as Readonly<Record<string, unknown>>);
}

const LEGAL_NEXT: Readonly<Record<ProviderThreadEffectState, readonly ProviderThreadEffectState[]>> = Object.freeze({
  intent_persisted: ['effect_started'],
  effect_started: ['observed_success', 'observed_failure', 'reconciliation_required', 'stopped'],
  reconciliation_required: ['observed_success', 'observed_failure', 'stopped'],
  observed_success: [],
  observed_failure: [],
  stopped: [],
});

export function assertProviderThreadEffectTransition(
  previous: ProviderThreadEffectObservationV1,
  next: ProviderThreadEffectObservationV1,
): void {
  const before = validateProviderThreadEffectObservation(previous);
  const after = validateProviderThreadEffectObservation(next);
  if (after.effect_id !== before.effect_id || after.intent_sha256 !== before.intent_sha256
    || after.host_id !== before.host_id || after.provider_thread_id !== before.provider_thread_id
    || after.sequence !== before.sequence + 1
    || after.previous_observation_sha256 !== before.observation_sha256
    || !LEGAL_NEXT[before.state].includes(after.state)) {
    transitionInvalid(`illegal Provider Thread effect transition: ${before.state} -> ${after.state}`);
  }
}

function currentDigest(value: Omit<ProviderThreadEffectCurrentV1, 'current_sha256'>): string {
  return canonicalMessageDigest(value as unknown as Readonly<Record<string, unknown>>);
}

export function buildProviderThreadEffectCurrent(observation: ProviderThreadEffectObservationV1): ProviderThreadEffectCurrentV1 {
  const valid = validateProviderThreadEffectObservation(observation);
  const basis = Object.freeze({
    protocol: PROVIDER_THREAD_EFFECT_PROTOCOL,
    kind: PROVIDER_THREAD_EFFECT_CURRENT_KIND,
    effect_id: valid.effect_id,
    intent_sha256: valid.intent_sha256,
    sequence: valid.sequence,
    state: valid.state,
    latest_observation_sha256: valid.observation_sha256,
  });
  return Object.freeze({ ...basis, current_sha256: currentDigest(basis) });
}

export function validateProviderThreadEffectCurrent(value: unknown): ProviderThreadEffectCurrentV1 {
  if (!isRecord(value)) invalid('effect current must be an object');
  assertMessageExactKeys(value, [
    'protocol', 'kind', 'effect_id', 'intent_sha256', 'sequence', 'state',
    'latest_observation_sha256', 'current_sha256',
  ], 'effect current', invalid);
  if (value.protocol !== PROVIDER_THREAD_EFFECT_PROTOCOL || value.kind !== PROVIDER_THREAD_EFFECT_CURRENT_KIND) {
    invalid('effect current protocol or kind is invalid');
  }
  assertMessageSha256(value.effect_id as string, 'effect_id', invalid);
  assertMessageSha256(value.intent_sha256 as string, 'intent_sha256', invalid);
  assertMessageInteger(value.sequence, 'sequence', 0, invalid);
  assertState(value.state);
  assertMessageSha256(value.latest_observation_sha256 as string, 'latest_observation_sha256', invalid);
  const basis = Object.freeze({
    protocol: PROVIDER_THREAD_EFFECT_PROTOCOL,
    kind: PROVIDER_THREAD_EFFECT_CURRENT_KIND,
    effect_id: value.effect_id as string,
    intent_sha256: value.intent_sha256 as string,
    sequence: value.sequence,
    state: value.state,
    latest_observation_sha256: value.latest_observation_sha256 as string,
  }) as Omit<ProviderThreadEffectCurrentV1, 'current_sha256'>;
  const built = Object.freeze({ ...basis, current_sha256: currentDigest(basis) });
  if (value.current_sha256 !== built.current_sha256) invalid('current_sha256 is stale');
  return built;
}

export function canonicalProviderThreadEffectCurrentBytes(value: ProviderThreadEffectCurrentV1): string {
  return canonicalMessageBytes(validateProviderThreadEffectCurrent(value) as unknown as Readonly<Record<string, unknown>>);
}
