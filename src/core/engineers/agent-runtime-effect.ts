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
} from '../messages/mechanics';

export const AGENT_RUNTIME_EFFECT_PROTOCOL = 2 as const;
export const AGENT_RUNTIME_CAPABILITY_KIND = 'repo-harness-agent-runtime-capability-observation' as const;
export const AGENT_RUNTIME_EFFECT_INTENT_KIND = 'repo-harness-agent-runtime-effect-intent' as const;
export const AGENT_RUNTIME_HOST_ACTION_KIND = 'repo-harness-agent-runtime-host-action' as const;
export const AGENT_RUNTIME_EFFECT_OBSERVATION_KIND = 'repo-harness-agent-runtime-effect-observation' as const;
export const AGENT_RUNTIME_EFFECT_CURRENT_KIND = 'repo-harness-agent-runtime-effect-current' as const;

const ENGINEER_ID = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const TASK_DIGEST = /^[0-9a-f]{64}$/u;

export type AgentRuntimeAdapterKind = 'codex-app-thread' | 'tmux-cli-agent';
export type AgentRuntimeOperation = 'notify_inbox';
export type AgentRuntimeCapabilityStatus = 'supported' | 'unsupported' | 'unavailable' | 'unverifiable';
export type AgentRuntimeEffectState = 'intent_persisted' | 'effect_started' | 'observed_success' | 'observed_failure' | 'reconciliation_required' | 'stopped';
export type AgentRuntimeFailureClass = 'none' | 'binding_stale' | 'claim_stale' | 'capability_unsupported' | 'adapter_unavailable' | 'receipt_missing' | 'receipt_mismatch' | 'unknown';
export type AgentRuntimeReceiptKind = 'task_message_delivery_receipt' | 'module_message_delivery_receipt';
export type AgentRuntimeAdapterOutcome = 'accepted' | 'unavailable' | 'unsupported' | 'failed' | 'unknown';

export interface AgentRuntimeCapabilityEvidenceRefV2 { readonly ref: string; readonly sha256: string }
export interface AgentRuntimeCapabilityObservationV2 {
  readonly protocol: typeof AGENT_RUNTIME_EFFECT_PROTOCOL;
  readonly kind: typeof AGENT_RUNTIME_CAPABILITY_KIND;
  readonly adapter_kind: AgentRuntimeAdapterKind;
  readonly host_id: string;
  readonly operations: Readonly<Record<AgentRuntimeOperation, AgentRuntimeCapabilityStatus>>;
  readonly evidence_refs: readonly AgentRuntimeCapabilityEvidenceRefV2[];
  readonly observed_at: string;
  readonly capability_sha256: string;
}

export interface TaskRuntimeMessageRefV2 {
  readonly kind: 'task_message';
  readonly message_id: string;
  readonly message_event_digest: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly claim_id: string;
  readonly lease_generation: number;
  readonly delivery_attempt: number;
}
export interface ModuleRuntimeMessageRefV2 {
  readonly kind: 'module_message';
  readonly message_id: string;
  readonly message_event_digest: string;
  readonly engineer_id: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly engineer_contract_revision: string;
  readonly delivery_attempt: number;
}
export type RuntimeMessageRefV2 = TaskRuntimeMessageRefV2 | ModuleRuntimeMessageRefV2;

export interface RuntimeEndpointFenceV2 {
  readonly engineer_id: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly engineer_contract_revision: string;
  readonly adapter_kind: AgentRuntimeAdapterKind;
  readonly host_id: string;
  readonly endpoint_id: string;
}

export interface AgentRuntimeEffectIntentV2 {
  readonly protocol: typeof AGENT_RUNTIME_EFFECT_PROTOCOL;
  readonly kind: typeof AGENT_RUNTIME_EFFECT_INTENT_KIND;
  readonly effect_id: string;
  readonly idempotency_key: string;
  readonly operation_fingerprint: string;
  readonly message_ref: RuntimeMessageRefV2;
  readonly endpoint_fence: RuntimeEndpointFenceV2;
  readonly operation: AgentRuntimeOperation;
  readonly capability_sha256: string;
  readonly created_at: string;
  readonly intent_sha256: string;
}

export interface AgentRuntimeHostActionV2 {
  readonly protocol: typeof AGENT_RUNTIME_EFFECT_PROTOCOL;
  readonly kind: typeof AGENT_RUNTIME_HOST_ACTION_KIND;
  readonly effect_id: string;
  readonly intent_sha256: string;
  readonly adapter_kind: AgentRuntimeAdapterKind;
  readonly operation: AgentRuntimeOperation;
  readonly host_id: string;
  readonly endpoint_id: string;
  readonly message_id: string;
  readonly message_event_digest: string;
  readonly delivery_attempt: number;
  readonly control_ref: string;
  readonly control_sha256: string;
  readonly action_sha256: string;
}

export interface AgentRuntimeAdapterObservationV2 {
  readonly adapter_kind: AgentRuntimeAdapterKind;
  readonly outcome: AgentRuntimeAdapterOutcome;
  readonly process_exit_code: number | null;
  readonly process_signal: string | null;
}
export interface AgentRuntimeEffectObservationV2 {
  readonly protocol: typeof AGENT_RUNTIME_EFFECT_PROTOCOL;
  readonly kind: typeof AGENT_RUNTIME_EFFECT_OBSERVATION_KIND;
  readonly effect_id: string;
  readonly intent_sha256: string;
  readonly sequence: number;
  readonly state: AgentRuntimeEffectState;
  readonly adapter: AgentRuntimeAdapterObservationV2;
  readonly receipt_kind: AgentRuntimeReceiptKind | null;
  readonly receipt_sha256: string | null;
  readonly failure_class: AgentRuntimeFailureClass;
  readonly observed_at: string;
  readonly previous_observation_sha256: string | null;
  readonly observation_sha256: string;
}
export interface AgentRuntimeEffectCurrentV2 {
  readonly protocol: typeof AGENT_RUNTIME_EFFECT_PROTOCOL;
  readonly kind: typeof AGENT_RUNTIME_EFFECT_CURRENT_KIND;
  readonly effect_id: string;
  readonly intent_sha256: string;
  readonly sequence: number;
  readonly state: AgentRuntimeEffectState;
  readonly latest_observation_sha256: string;
  readonly current_sha256: string;
}

export type AgentRuntimeEffectErrorCode = 'agent_runtime_effect_invalid' | 'agent_runtime_effect_transition_invalid';
export class AgentRuntimeEffectError extends Error {
  constructor(readonly code: AgentRuntimeEffectErrorCode, message: string) { super(message); this.name = 'AgentRuntimeEffectError'; }
}
function invalid(message: string): never { throw new AgentRuntimeEffectError('agent_runtime_effect_invalid', message); }
function transitionInvalid(message: string): never { throw new AgentRuntimeEffectError('agent_runtime_effect_transition_invalid', message); }
function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${field} must be an object`);
  return value as Record<string, unknown>;
}
function bounded(value: unknown, field: string, maximum = 512): string {
  const text = messageRequiredString(value, field, invalid); assertMessageBoundedUtf8(text, field, maximum, invalid); return text;
}
function nullableBounded(value: unknown, field: string): string | null {
  const text = messageNullableString(value, field, invalid); if (text !== null) assertMessageBoundedUtf8(text, field, 128, invalid); return text;
}
function engineer(value: unknown, field: string): string { const text = bounded(value, field); if (!ENGINEER_ID.test(text)) invalid(`${field} is invalid`); return text; }
function sha(value: unknown, field: string): string { const text = messageRequiredString(value, field, invalid); assertMessageSha256(text, field, invalid); return text; }
function taskDigest(value: unknown, field: string): string { const text = messageRequiredString(value, field, invalid); if (!TASK_DIGEST.test(text)) invalid(`${field} is invalid`); return text; }
function uuid(value: unknown, field: string): string { const text = messageRequiredString(value, field, invalid); assertMessageUuid(text, field, invalid); return text; }
function integer(value: unknown, field: string, minimum = 1): number { assertMessageInteger(value, field, minimum, invalid); return value as number; }
function adapterKind(value: unknown): AgentRuntimeAdapterKind {
  if (value !== 'codex-app-thread' && value !== 'tmux-cli-agent') invalid('adapter_kind is invalid'); return value;
}
function capabilityStatus(value: unknown): AgentRuntimeCapabilityStatus {
  if (value !== 'supported' && value !== 'unsupported' && value !== 'unavailable' && value !== 'unverifiable') invalid('capability status is invalid'); return value;
}
function effectState(value: unknown): AgentRuntimeEffectState {
  if (value !== 'intent_persisted' && value !== 'effect_started' && value !== 'observed_success' && value !== 'observed_failure' && value !== 'reconciliation_required' && value !== 'stopped') invalid('state is invalid'); return value;
}
function failureClass(value: unknown): AgentRuntimeFailureClass {
  const allowed: readonly unknown[] = ['none', 'binding_stale', 'claim_stale', 'capability_unsupported', 'adapter_unavailable', 'receipt_missing', 'receipt_mismatch', 'unknown'];
  if (!allowed.includes(value)) invalid('failure_class is invalid'); return value as AgentRuntimeFailureClass;
}
function adapterOutcome(value: unknown): AgentRuntimeAdapterOutcome {
  if (value !== 'accepted' && value !== 'unavailable' && value !== 'unsupported' && value !== 'failed' && value !== 'unknown') invalid('adapter outcome is invalid'); return value;
}
function digest(value: Readonly<Record<string, unknown>>): string { return canonicalMessageDigest(value); }

export function buildAgentRuntimeCapabilityObservation(input: {
  readonly adapter_kind: AgentRuntimeAdapterKind; readonly host_id: string;
  readonly operations: Readonly<Record<AgentRuntimeOperation, AgentRuntimeCapabilityStatus>>;
  readonly evidence_refs: readonly AgentRuntimeCapabilityEvidenceRefV2[]; readonly observed_at: string;
}): AgentRuntimeCapabilityObservationV2 {
  const adapter = adapterKind(input.adapter_kind); const hostId = bounded(input.host_id, 'host_id');
  const operations = record(input.operations, 'operations'); assertMessageExactKeys(operations, ['notify_inbox'], 'operations', invalid);
  const notifyInbox = capabilityStatus(operations.notify_inbox);
  if (!Array.isArray(input.evidence_refs) || input.evidence_refs.length > 8) invalid('evidence_refs is invalid');
  const evidenceRefs = input.evidence_refs.map((entry) => {
    const item = record(entry, 'evidence_ref'); assertMessageExactKeys(item, ['ref', 'sha256'], 'evidence_ref', invalid);
    return Object.freeze({ ref: bounded(item.ref, 'evidence_ref.ref', 1024), sha256: sha(item.sha256, 'evidence_ref.sha256') });
  });
  assertMessageTimestamp(input.observed_at, 'observed_at', invalid);
  const basis = Object.freeze({ protocol: AGENT_RUNTIME_EFFECT_PROTOCOL, kind: AGENT_RUNTIME_CAPABILITY_KIND, adapter_kind: adapter, host_id: hostId, operations: Object.freeze({ notify_inbox: notifyInbox }), evidence_refs: Object.freeze(evidenceRefs), observed_at: input.observed_at });
  return Object.freeze({ ...basis, capability_sha256: digest(basis) });
}
export function validateAgentRuntimeCapabilityObservation(value: unknown): AgentRuntimeCapabilityObservationV2 {
  const input = record(value, 'capability observation');
  assertMessageExactKeys(input, ['protocol', 'kind', 'adapter_kind', 'host_id', 'operations', 'evidence_refs', 'observed_at', 'capability_sha256'], 'capability observation', invalid);
  if (input.protocol !== AGENT_RUNTIME_EFFECT_PROTOCOL || input.kind !== AGENT_RUNTIME_CAPABILITY_KIND) invalid('capability protocol or kind is invalid');
  const built = buildAgentRuntimeCapabilityObservation({ adapter_kind: input.adapter_kind as AgentRuntimeAdapterKind, host_id: input.host_id as string, operations: input.operations as Readonly<Record<AgentRuntimeOperation, AgentRuntimeCapabilityStatus>>, evidence_refs: input.evidence_refs as readonly AgentRuntimeCapabilityEvidenceRefV2[], observed_at: input.observed_at as string });
  if (input.capability_sha256 !== built.capability_sha256) invalid('capability_sha256 is stale'); return built;
}
export function canonicalAgentRuntimeCapabilityBytes(value: AgentRuntimeCapabilityObservationV2): string { return canonicalMessageBytes(validateAgentRuntimeCapabilityObservation(value) as unknown as Readonly<Record<string, unknown>>); }

export function validateRuntimeMessageRef(value: unknown): RuntimeMessageRefV2 {
  const input = record(value, 'message_ref');
  if (input.kind === 'task_message') {
    assertMessageExactKeys(input, ['kind', 'message_id', 'message_event_digest', 'task_id', 'task_revision', 'claim_id', 'lease_generation', 'delivery_attempt'], 'task message_ref', invalid);
    return Object.freeze({ kind: 'task_message', message_id: uuid(input.message_id, 'message_id'), message_event_digest: sha(input.message_event_digest, 'message_event_digest'), task_id: taskDigest(input.task_id, 'task_id'), task_revision: taskDigest(input.task_revision, 'task_revision'), claim_id: uuid(input.claim_id, 'claim_id'), lease_generation: integer(input.lease_generation, 'lease_generation'), delivery_attempt: integer(input.delivery_attempt, 'delivery_attempt') });
  }
  if (input.kind === 'module_message') {
    assertMessageExactKeys(input, ['kind', 'message_id', 'message_event_digest', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision', 'delivery_attempt'], 'module message_ref', invalid);
    return Object.freeze({ kind: 'module_message', message_id: uuid(input.message_id, 'message_id'), message_event_digest: sha(input.message_event_digest, 'message_event_digest'), engineer_id: engineer(input.engineer_id, 'engineer_id'), binding_id: uuid(input.binding_id, 'binding_id'), binding_generation: integer(input.binding_generation, 'binding_generation'), engineer_contract_revision: sha(input.engineer_contract_revision, 'engineer_contract_revision'), delivery_attempt: integer(input.delivery_attempt, 'delivery_attempt') });
  }
  return invalid('message_ref kind is invalid');
}
export function validateRuntimeEndpointFence(value: unknown): RuntimeEndpointFenceV2 {
  const input = record(value, 'endpoint_fence'); assertMessageExactKeys(input, ['engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision', 'adapter_kind', 'host_id', 'endpoint_id'], 'endpoint_fence', invalid);
  return Object.freeze({ engineer_id: engineer(input.engineer_id, 'endpoint_fence.engineer_id'), binding_id: uuid(input.binding_id, 'endpoint_fence.binding_id'), binding_generation: integer(input.binding_generation, 'endpoint_fence.binding_generation'), engineer_contract_revision: sha(input.engineer_contract_revision, 'endpoint_fence.engineer_contract_revision'), adapter_kind: adapterKind(input.adapter_kind), host_id: bounded(input.host_id, 'endpoint_fence.host_id'), endpoint_id: bounded(input.endpoint_id, 'endpoint_fence.endpoint_id') });
}
function assertMessageEndpointJoin(message: RuntimeMessageRefV2, endpoint: RuntimeEndpointFenceV2): void {
  if (message.kind === 'module_message' && (message.engineer_id !== endpoint.engineer_id || message.binding_id !== endpoint.binding_id || message.binding_generation !== endpoint.binding_generation || message.engineer_contract_revision !== endpoint.engineer_contract_revision)) invalid('module message_ref and endpoint_fence must be byte-equal at the Binding fence');
}
export function deriveAgentRuntimeEffectId(idempotencyKey: string): string { return digest({ domain: 'repo-harness-agent-runtime-effect-id.v2', idempotency_key: bounded(idempotencyKey, 'idempotency_key') }); }
export function buildAgentRuntimeEffectIntent(input: { readonly idempotency_key: string; readonly message_ref: RuntimeMessageRefV2; readonly endpoint_fence: RuntimeEndpointFenceV2; readonly operation: AgentRuntimeOperation; readonly capability_sha256: string; readonly created_at: string }): AgentRuntimeEffectIntentV2 {
  const key = bounded(input.idempotency_key, 'idempotency_key'); const messageRef = validateRuntimeMessageRef(input.message_ref); const endpointFence = validateRuntimeEndpointFence(input.endpoint_fence); assertMessageEndpointJoin(messageRef, endpointFence);
  if (input.operation !== 'notify_inbox') invalid('operation is invalid'); const capabilitySha = sha(input.capability_sha256, 'capability_sha256'); assertMessageTimestamp(input.created_at, 'created_at', invalid);
  const fingerprint = digest({ domain: 'repo-harness-agent-runtime-operation.v2', message_ref: messageRef, endpoint_fence: endpointFence, operation: input.operation, capability_sha256: capabilitySha });
  const basis = Object.freeze({ protocol: AGENT_RUNTIME_EFFECT_PROTOCOL, kind: AGENT_RUNTIME_EFFECT_INTENT_KIND, effect_id: deriveAgentRuntimeEffectId(key), idempotency_key: key, operation_fingerprint: fingerprint, message_ref: messageRef, endpoint_fence: endpointFence, operation: input.operation, capability_sha256: capabilitySha, created_at: input.created_at });
  return Object.freeze({ ...basis, intent_sha256: digest(basis) });
}
export function validateAgentRuntimeEffectIntent(value: unknown): AgentRuntimeEffectIntentV2 {
  const input = record(value, 'effect intent'); assertMessageExactKeys(input, ['protocol', 'kind', 'effect_id', 'idempotency_key', 'operation_fingerprint', 'message_ref', 'endpoint_fence', 'operation', 'capability_sha256', 'created_at', 'intent_sha256'], 'effect intent', invalid);
  if (input.protocol !== AGENT_RUNTIME_EFFECT_PROTOCOL || input.kind !== AGENT_RUNTIME_EFFECT_INTENT_KIND) invalid('effect intent protocol or kind is invalid');
  const built = buildAgentRuntimeEffectIntent({ idempotency_key: input.idempotency_key as string, message_ref: input.message_ref as RuntimeMessageRefV2, endpoint_fence: input.endpoint_fence as RuntimeEndpointFenceV2, operation: input.operation as AgentRuntimeOperation, capability_sha256: input.capability_sha256 as string, created_at: input.created_at as string });
  if (input.effect_id !== built.effect_id || input.operation_fingerprint !== built.operation_fingerprint || input.intent_sha256 !== built.intent_sha256) invalid('effect intent derived digest is stale'); return built;
}
export function canonicalAgentRuntimeEffectIntentBytes(value: AgentRuntimeEffectIntentV2): string { return canonicalMessageBytes(validateAgentRuntimeEffectIntent(value) as unknown as Readonly<Record<string, unknown>>); }

function controlSha(intent: AgentRuntimeEffectIntentV2): string { return digest({ domain: 'repo-harness-agent-runtime-control.v2', effect_id: intent.effect_id, intent_sha256: intent.intent_sha256, message_event_digest: intent.message_ref.message_event_digest, delivery_attempt: intent.message_ref.delivery_attempt }); }
/** The exact bounded inbox-control reference one effect admits. The same
 * deterministic derivation runs on the observing side, so a delivery receipt
 * must carry this exact string before it can prove this effect's delivery. */
export function agentRuntimeControlRef(intentValue: AgentRuntimeEffectIntentV2): string {
  const intent = validateAgentRuntimeEffectIntent(intentValue);
  return `repo-harness-inbox:${intent.effect_id}:${controlSha(intent)}`;
}
export function buildAgentRuntimeHostAction(intentValue: AgentRuntimeEffectIntentV2): AgentRuntimeHostActionV2 {
  const intent = validateAgentRuntimeEffectIntent(intentValue); const control = controlSha(intent);
  const basis = Object.freeze({ protocol: AGENT_RUNTIME_EFFECT_PROTOCOL, kind: AGENT_RUNTIME_HOST_ACTION_KIND, effect_id: intent.effect_id, intent_sha256: intent.intent_sha256, adapter_kind: intent.endpoint_fence.adapter_kind, operation: intent.operation, host_id: intent.endpoint_fence.host_id, endpoint_id: intent.endpoint_fence.endpoint_id, message_id: intent.message_ref.message_id, message_event_digest: intent.message_ref.message_event_digest, delivery_attempt: intent.message_ref.delivery_attempt, control_ref: agentRuntimeControlRef(intent), control_sha256: control });
  return Object.freeze({ ...basis, action_sha256: digest(basis) });
}
export function validateAgentRuntimeHostAction(value: unknown): AgentRuntimeHostActionV2 {
  const input = record(value, 'host action'); assertMessageExactKeys(input, ['protocol', 'kind', 'effect_id', 'intent_sha256', 'adapter_kind', 'operation', 'host_id', 'endpoint_id', 'message_id', 'message_event_digest', 'delivery_attempt', 'control_ref', 'control_sha256', 'action_sha256'], 'host action', invalid);
  if (input.protocol !== AGENT_RUNTIME_EFFECT_PROTOCOL || input.kind !== AGENT_RUNTIME_HOST_ACTION_KIND || input.operation !== 'notify_inbox') invalid('host action protocol, kind, or operation is invalid');
  const basis = Object.freeze({ protocol: AGENT_RUNTIME_EFFECT_PROTOCOL, kind: AGENT_RUNTIME_HOST_ACTION_KIND, effect_id: sha(input.effect_id, 'effect_id'), intent_sha256: sha(input.intent_sha256, 'intent_sha256'), adapter_kind: adapterKind(input.adapter_kind), operation: 'notify_inbox' as const, host_id: bounded(input.host_id, 'host_id'), endpoint_id: bounded(input.endpoint_id, 'endpoint_id'), message_id: uuid(input.message_id, 'message_id'), message_event_digest: sha(input.message_event_digest, 'message_event_digest'), delivery_attempt: integer(input.delivery_attempt, 'delivery_attempt'), control_ref: bounded(input.control_ref, 'control_ref', 1024), control_sha256: sha(input.control_sha256, 'control_sha256') });
  if (basis.control_ref !== `repo-harness-inbox:${basis.effect_id}:${basis.control_sha256}`) invalid('control_ref does not match the bounded control identity');
  const built = Object.freeze({ ...basis, action_sha256: digest(basis) }); if (input.action_sha256 !== built.action_sha256) invalid('action_sha256 is stale'); return built;
}
export function canonicalAgentRuntimeHostActionBytes(value: AgentRuntimeHostActionV2): string { return canonicalMessageBytes(validateAgentRuntimeHostAction(value) as unknown as Readonly<Record<string, unknown>>); }

export function validateAgentRuntimeAdapterObservation(value: unknown): AgentRuntimeAdapterObservationV2 {
  const input = record(value, 'adapter observation'); assertMessageExactKeys(input, ['adapter_kind', 'outcome', 'process_exit_code', 'process_signal'], 'adapter observation', invalid);
  if (input.process_exit_code !== null) assertMessageInteger(input.process_exit_code, 'process_exit_code', 0, invalid);
  return Object.freeze({ adapter_kind: adapterKind(input.adapter_kind), outcome: adapterOutcome(input.outcome), process_exit_code: input.process_exit_code as number | null, process_signal: nullableBounded(input.process_signal, 'process_signal') });
}
export function buildAgentRuntimeEffectObservation(input: Omit<AgentRuntimeEffectObservationV2, 'protocol' | 'kind' | 'observation_sha256'>): AgentRuntimeEffectObservationV2 {
  const state = effectState(input.state); const adapter = validateAgentRuntimeAdapterObservation(input.adapter); const receiptKind = input.receipt_kind;
  if (receiptKind !== null && receiptKind !== 'task_message_delivery_receipt' && receiptKind !== 'module_message_delivery_receipt') invalid('receipt_kind is invalid');
  const receiptSha = input.receipt_sha256 === null ? null : sha(input.receipt_sha256, 'receipt_sha256'); const failure = failureClass(input.failure_class);
  if ((receiptKind === null) !== (receiptSha === null)) invalid('receipt_kind and receipt_sha256 must both be present or absent');
  if (state === 'observed_success' && (receiptKind === null || failure !== 'none')) invalid('observed_success requires one exact receipt and no failure');
  if (state === 'observed_failure' && failure === 'none') invalid('observed_failure requires failure_class');
  if (state === 'reconciliation_required' && failure !== 'unknown' && failure !== 'receipt_missing') invalid('reconciliation_required requires unknown or receipt_missing');
  if ((state === 'intent_persisted' || state === 'effect_started') && (receiptKind !== null || failure !== 'none')) invalid(`${state} cannot claim receipt or failure evidence`);
  const effectId = sha(input.effect_id, 'effect_id'); const intentSha = sha(input.intent_sha256, 'intent_sha256'); const sequence = integer(input.sequence, 'sequence', 0); assertMessageTimestamp(input.observed_at, 'observed_at', invalid);
  const previous = input.previous_observation_sha256 === null ? null : sha(input.previous_observation_sha256, 'previous_observation_sha256'); if ((sequence === 0) !== (previous === null)) invalid('observation predecessor does not match sequence');
  const basis = Object.freeze({ protocol: AGENT_RUNTIME_EFFECT_PROTOCOL, kind: AGENT_RUNTIME_EFFECT_OBSERVATION_KIND, effect_id: effectId, intent_sha256: intentSha, sequence, state, adapter, receipt_kind: receiptKind, receipt_sha256: receiptSha, failure_class: failure, observed_at: input.observed_at, previous_observation_sha256: previous });
  return Object.freeze({ ...basis, observation_sha256: digest(basis) });
}
export function validateAgentRuntimeEffectObservation(value: unknown): AgentRuntimeEffectObservationV2 {
  const input = record(value, 'effect observation'); assertMessageExactKeys(input, ['protocol', 'kind', 'effect_id', 'intent_sha256', 'sequence', 'state', 'adapter', 'receipt_kind', 'receipt_sha256', 'failure_class', 'observed_at', 'previous_observation_sha256', 'observation_sha256'], 'effect observation', invalid);
  if (input.protocol !== AGENT_RUNTIME_EFFECT_PROTOCOL || input.kind !== AGENT_RUNTIME_EFFECT_OBSERVATION_KIND) invalid('effect observation protocol or kind is invalid');
  const built = buildAgentRuntimeEffectObservation({ effect_id: input.effect_id as string, intent_sha256: input.intent_sha256 as string, sequence: input.sequence as number, state: input.state as AgentRuntimeEffectState, adapter: input.adapter as AgentRuntimeAdapterObservationV2, receipt_kind: input.receipt_kind as AgentRuntimeReceiptKind | null, receipt_sha256: input.receipt_sha256 as string | null, failure_class: input.failure_class as AgentRuntimeFailureClass, observed_at: input.observed_at as string, previous_observation_sha256: input.previous_observation_sha256 as string | null });
  if (input.observation_sha256 !== built.observation_sha256) invalid('observation_sha256 is stale'); return built;
}
export function canonicalAgentRuntimeEffectObservationBytes(value: AgentRuntimeEffectObservationV2): string { return canonicalMessageBytes(validateAgentRuntimeEffectObservation(value) as unknown as Readonly<Record<string, unknown>>); }

const LEGAL_NEXT: Readonly<Record<AgentRuntimeEffectState, readonly AgentRuntimeEffectState[]>> = Object.freeze({ intent_persisted: ['effect_started'], effect_started: ['observed_success', 'observed_failure', 'reconciliation_required', 'stopped'], reconciliation_required: ['observed_success', 'observed_failure', 'stopped'], observed_success: [], observed_failure: [], stopped: [] });
export function assertAgentRuntimeEffectTransition(previous: AgentRuntimeEffectObservationV2, next: AgentRuntimeEffectObservationV2): void {
  const before = validateAgentRuntimeEffectObservation(previous); const after = validateAgentRuntimeEffectObservation(next);
  if (after.effect_id !== before.effect_id || after.intent_sha256 !== before.intent_sha256 || after.adapter.adapter_kind !== before.adapter.adapter_kind || after.sequence !== before.sequence + 1 || after.previous_observation_sha256 !== before.observation_sha256 || !LEGAL_NEXT[before.state].includes(after.state)) transitionInvalid(`illegal Agent Runtime effect transition: ${before.state} -> ${after.state}`);
}
export function buildAgentRuntimeEffectCurrent(observationValue: AgentRuntimeEffectObservationV2): AgentRuntimeEffectCurrentV2 {
  const observation = validateAgentRuntimeEffectObservation(observationValue); const basis = Object.freeze({ protocol: AGENT_RUNTIME_EFFECT_PROTOCOL, kind: AGENT_RUNTIME_EFFECT_CURRENT_KIND, effect_id: observation.effect_id, intent_sha256: observation.intent_sha256, sequence: observation.sequence, state: observation.state, latest_observation_sha256: observation.observation_sha256 }); return Object.freeze({ ...basis, current_sha256: digest(basis) });
}
export function validateAgentRuntimeEffectCurrent(value: unknown): AgentRuntimeEffectCurrentV2 {
  const input = record(value, 'effect current'); assertMessageExactKeys(input, ['protocol', 'kind', 'effect_id', 'intent_sha256', 'sequence', 'state', 'latest_observation_sha256', 'current_sha256'], 'effect current', invalid);
  if (input.protocol !== AGENT_RUNTIME_EFFECT_PROTOCOL || input.kind !== AGENT_RUNTIME_EFFECT_CURRENT_KIND) invalid('effect current protocol or kind is invalid');
  const basis = Object.freeze({ protocol: AGENT_RUNTIME_EFFECT_PROTOCOL, kind: AGENT_RUNTIME_EFFECT_CURRENT_KIND, effect_id: sha(input.effect_id, 'effect_id'), intent_sha256: sha(input.intent_sha256, 'intent_sha256'), sequence: integer(input.sequence, 'sequence', 0), state: effectState(input.state), latest_observation_sha256: sha(input.latest_observation_sha256, 'latest_observation_sha256') });
  const built = Object.freeze({ ...basis, current_sha256: digest(basis) }); if (input.current_sha256 !== built.current_sha256) invalid('current_sha256 is stale'); return built;
}
export function canonicalAgentRuntimeEffectCurrentBytes(value: AgentRuntimeEffectCurrentV2): string { return canonicalMessageBytes(validateAgentRuntimeEffectCurrent(value) as unknown as Readonly<Record<string, unknown>>); }
