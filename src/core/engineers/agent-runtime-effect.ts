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
import type { EngineerOfferBlockerCode, EngineerOffersV1 } from './scheduling';

export const AGENT_RUNTIME_EFFECT_PROTOCOL = 2 as const;
export const AGENT_RUNTIME_CAPABILITY_KIND = 'repo-harness-agent-runtime-capability-observation' as const;
export const AGENT_RUNTIME_EFFECT_INTENT_KIND = 'repo-harness-agent-runtime-effect-intent' as const;
export const AGENT_RUNTIME_HOST_ACTION_KIND = 'repo-harness-agent-runtime-host-action' as const;
export const AGENT_RUNTIME_EFFECT_OBSERVATION_KIND = 'repo-harness-agent-runtime-effect-observation' as const;
export const AGENT_RUNTIME_EFFECT_CURRENT_KIND = 'repo-harness-agent-runtime-effect-current' as const;
export const AGENT_RUNTIME_CONTROLLER_STEP_RECEIPT_KIND = 'repo-harness-agent-runtime-controller-step-receipt' as const;
export const AGENT_RUNTIME_OFFER_WAKE_LEDGER_KIND = 'repo-harness-agent-runtime-offer-wake-ledger' as const;

const ENGINEER_ID = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const TASK_DIGEST = /^[0-9a-f]{64}$/u;
const REPOSITORY_ID = /^repo_[0-9a-f]{16}$/u;
const WORK_PACKAGE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/u;

export type AgentRuntimeAdapterKind = 'codex-app-thread' | 'tmux-cli-agent';
export type AgentRuntimeOperation = 'notify_inbox' | 'wake_for_offer';
export const AGENT_RUNTIME_OPERATIONS: readonly AgentRuntimeOperation[] = Object.freeze(['notify_inbox', 'wake_for_offer']);
/** Closed wake causes. `retry_due` belongs to the attempt-receipt authority and
 * no transition in this module emits it; it stays here so a future attempt
 * owner extends the closed enum instead of opening the reason field. */
export type AgentRuntimeOfferWakeReason = 'new_eligible_offer' | 'dependency_unblocked' | 'concurrency_released' | 'retry_due';
export type AgentRuntimeCapabilityStatus = 'supported' | 'unsupported' | 'unavailable' | 'unverifiable';
export type AgentRuntimeEffectState = 'intent_persisted' | 'effect_started' | 'observed_success' | 'observed_failure' | 'reconciliation_required' | 'stopped';
export type AgentRuntimeFailureClass = 'none' | 'binding_stale' | 'claim_stale' | 'capability_unsupported' | 'adapter_unavailable' | 'receipt_missing' | 'receipt_mismatch' | 'unknown';
export type AgentRuntimeReceiptKind = 'task_message_delivery_receipt' | 'module_message_delivery_receipt' | 'controller_step_receipt';
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

/** The wake subject. Engineer, Binding, generation and contract revision are
 * bound once by the endpoint fence; this reference adds only what the fence
 * cannot carry, so no datum has two authorities inside one intent. */
export interface RuntimeOfferWakeRefV2 {
  readonly repository_id: string;
  readonly authorization_revision: number;
  readonly snapshot_revision: string;
  readonly wake_reason: AgentRuntimeOfferWakeReason;
}

export interface RuntimeEndpointFenceV2 {
  readonly engineer_id: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly engineer_contract_revision: string;
  readonly adapter_kind: AgentRuntimeAdapterKind;
  readonly host_id: string;
  readonly endpoint_id: string;
}

interface AgentRuntimeEffectIntentBaseV2 {
  readonly protocol: typeof AGENT_RUNTIME_EFFECT_PROTOCOL;
  readonly kind: typeof AGENT_RUNTIME_EFFECT_INTENT_KIND;
  readonly effect_id: string;
  readonly idempotency_key: string;
  readonly operation_fingerprint: string;
  readonly endpoint_fence: RuntimeEndpointFenceV2;
  readonly capability_sha256: string;
  readonly created_at: string;
  readonly intent_sha256: string;
}
export interface AgentRuntimeNotifyInboxIntentV2 extends AgentRuntimeEffectIntentBaseV2 {
  readonly operation: 'notify_inbox';
  readonly message_ref: RuntimeMessageRefV2;
}
export interface AgentRuntimeOfferWakeIntentV2 extends AgentRuntimeEffectIntentBaseV2 {
  readonly operation: 'wake_for_offer';
  readonly wake_ref: RuntimeOfferWakeRefV2;
}
export type AgentRuntimeEffectIntentV2 = AgentRuntimeNotifyInboxIntentV2 | AgentRuntimeOfferWakeIntentV2;

interface AgentRuntimeHostActionBaseV2 {
  readonly protocol: typeof AGENT_RUNTIME_EFFECT_PROTOCOL;
  readonly kind: typeof AGENT_RUNTIME_HOST_ACTION_KIND;
  readonly effect_id: string;
  readonly intent_sha256: string;
  readonly adapter_kind: AgentRuntimeAdapterKind;
  readonly host_id: string;
  readonly endpoint_id: string;
  readonly control_ref: string;
  readonly control_sha256: string;
  readonly action_sha256: string;
}
export interface AgentRuntimeNotifyInboxHostActionV2 extends AgentRuntimeHostActionBaseV2 {
  readonly operation: 'notify_inbox';
  readonly message_id: string;
  readonly message_event_digest: string;
  readonly delivery_attempt: number;
}
/** A wake tells the endpoint that work may exist. It carries no Claim, Lease,
 * Task or offer body, so a Host that replays it gains no acquisition path. */
export interface AgentRuntimeOfferWakeHostActionV2 extends AgentRuntimeHostActionBaseV2 {
  readonly operation: 'wake_for_offer';
  readonly repository_id: string;
  readonly snapshot_revision: string;
  readonly wake_reason: AgentRuntimeOfferWakeReason;
}
export type AgentRuntimeHostActionV2 = AgentRuntimeNotifyInboxHostActionV2 | AgentRuntimeOfferWakeHostActionV2;

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

/** Proof that one bounded controller step ran at the woken endpoint for this
 * exact effect. Distinct from every message-delivery receipt: a wake carries no
 * message, so a delivery receipt can never close it, and a process exit code is
 * never accepted in its place. */
export interface AgentRuntimeControllerStepReceiptV2 {
  readonly protocol: typeof AGENT_RUNTIME_EFFECT_PROTOCOL;
  readonly kind: typeof AGENT_RUNTIME_CONTROLLER_STEP_RECEIPT_KIND;
  readonly effect_id: string;
  readonly intent_sha256: string;
  readonly control_ref: string;
  readonly control_sha256: string;
  readonly engineer_id: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly observed_snapshot_revision: string;
  readonly observed_at: string;
  readonly receipt_sha256: string;
}

export interface AgentRuntimeOfferWakeBlockedV2 {
  readonly work_package_id: string;
  readonly blockers: readonly EngineerOfferBlockerCode[];
}
/** The bounded projection of one `EngineerOffersV1` the wake observer needs.
 * The offers document stays the authority; this keeps only the eligibility and
 * blocker facts a transition decision reads, so one Binding's durable ledger
 * does not grow with offer bodies. */
export interface AgentRuntimeOfferWakeSnapshotV2 {
  readonly repository_id: string;
  readonly engineer_id: string;
  readonly snapshot_revision: string;
  readonly authorization_revision: number | null;
  readonly eligible_work_package_ids: readonly string[];
  readonly blocked: readonly AgentRuntimeOfferWakeBlockedV2[];
}
export type AgentRuntimeOfferWakeDecisionV2 =
  | Readonly<{
    due: true;
    wake_reason: AgentRuntimeOfferWakeReason;
    repository_id: string;
    engineer_id: string;
    snapshot_revision: string;
    authorization_revision: number;
  }>
  | Readonly<{ due: false; cause: 'no_eligible_offers' | 'unchanged_snapshot' | 'already_eligible' }>;

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
function operationName(value: unknown): AgentRuntimeOperation {
  if (value !== 'notify_inbox' && value !== 'wake_for_offer') invalid('operation is invalid'); return value;
}
function wakeReason(value: unknown): AgentRuntimeOfferWakeReason {
  if (value !== 'new_eligible_offer' && value !== 'dependency_unblocked' && value !== 'concurrency_released' && value !== 'retry_due') invalid('wake_reason is invalid'); return value;
}
function repositoryId(value: unknown, field: string): string { const text = messageRequiredString(value, field, invalid); if (!REPOSITORY_ID.test(text)) invalid(`${field} is invalid`); return text; }
function workPackageId(value: unknown, field: string): string { const text = messageRequiredString(value, field, invalid); if (!WORK_PACKAGE_ID.test(text)) invalid(`${field} is invalid`); return text; }
function blockerCode(value: unknown): EngineerOfferBlockerCode {
  const allowed: readonly unknown[] = ['profile_capability_mismatch', 'binding_inactive', 'fleet_offer_unavailable', 'dependency_not_ready', 'dependency_authority_unavailable', 'concurrency_unavailable', 'active_claim_limit'];
  if (!allowed.includes(value)) invalid('offer blocker code is invalid'); return value as EngineerOfferBlockerCode;
}
function digest(value: Readonly<Record<string, unknown>>): string { return canonicalMessageDigest(value); }

export function buildAgentRuntimeCapabilityObservation(input: {
  readonly adapter_kind: AgentRuntimeAdapterKind; readonly host_id: string;
  readonly operations: Readonly<Record<AgentRuntimeOperation, AgentRuntimeCapabilityStatus>>;
  readonly evidence_refs: readonly AgentRuntimeCapabilityEvidenceRefV2[]; readonly observed_at: string;
}): AgentRuntimeCapabilityObservationV2 {
  const adapter = adapterKind(input.adapter_kind); const hostId = bounded(input.host_id, 'host_id');
  const operations = record(input.operations, 'operations'); assertMessageExactKeys(operations, AGENT_RUNTIME_OPERATIONS, 'operations', invalid);
  const notifyInbox = capabilityStatus(operations.notify_inbox); const wakeForOffer = capabilityStatus(operations.wake_for_offer);
  if (!Array.isArray(input.evidence_refs) || input.evidence_refs.length > 8) invalid('evidence_refs is invalid');
  const evidenceRefs = input.evidence_refs.map((entry) => {
    const item = record(entry, 'evidence_ref'); assertMessageExactKeys(item, ['ref', 'sha256'], 'evidence_ref', invalid);
    return Object.freeze({ ref: bounded(item.ref, 'evidence_ref.ref', 1024), sha256: sha(item.sha256, 'evidence_ref.sha256') });
  });
  assertMessageTimestamp(input.observed_at, 'observed_at', invalid);
  const basis = Object.freeze({ protocol: AGENT_RUNTIME_EFFECT_PROTOCOL, kind: AGENT_RUNTIME_CAPABILITY_KIND, adapter_kind: adapter, host_id: hostId, operations: Object.freeze({ notify_inbox: notifyInbox, wake_for_offer: wakeForOffer }), evidence_refs: Object.freeze(evidenceRefs), observed_at: input.observed_at });
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
export function validateRuntimeOfferWakeRef(value: unknown): RuntimeOfferWakeRefV2 {
  const input = record(value, 'wake_ref'); assertMessageExactKeys(input, ['repository_id', 'authorization_revision', 'snapshot_revision', 'wake_reason'], 'wake_ref', invalid);
  return Object.freeze({ repository_id: repositoryId(input.repository_id, 'wake_ref.repository_id'), authorization_revision: integer(input.authorization_revision, 'wake_ref.authorization_revision', 0), snapshot_revision: sha(input.snapshot_revision, 'wake_ref.snapshot_revision'), wake_reason: wakeReason(input.wake_reason) });
}
export function deriveAgentRuntimeEffectId(idempotencyKey: string): string { return digest({ domain: 'repo-harness-agent-runtime-effect-id.v2', idempotency_key: bounded(idempotencyKey, 'idempotency_key') }); }
export type BuildAgentRuntimeEffectIntentInput = Readonly<{
  idempotency_key: string; endpoint_fence: RuntimeEndpointFenceV2; capability_sha256: string; created_at: string;
} & ({ operation: 'notify_inbox'; message_ref: RuntimeMessageRefV2 } | { operation: 'wake_for_offer'; wake_ref: RuntimeOfferWakeRefV2 })>;
export function buildAgentRuntimeEffectIntent(input: BuildAgentRuntimeEffectIntentInput): AgentRuntimeEffectIntentV2 {
  const key = bounded(input.idempotency_key, 'idempotency_key'); const endpointFence = validateRuntimeEndpointFence(input.endpoint_fence);
  const operation = operationName(input.operation); const capabilitySha = sha(input.capability_sha256, 'capability_sha256'); assertMessageTimestamp(input.created_at, 'created_at', invalid);
  let subject: { readonly message_ref: RuntimeMessageRefV2 } | { readonly wake_ref: RuntimeOfferWakeRefV2 };
  if (operation === 'notify_inbox') {
    const messageRef = validateRuntimeMessageRef((input as { message_ref: unknown }).message_ref);
    assertMessageEndpointJoin(messageRef, endpointFence); subject = { message_ref: messageRef };
  } else subject = { wake_ref: validateRuntimeOfferWakeRef((input as { wake_ref: unknown }).wake_ref) };
  const fingerprint = digest({ domain: 'repo-harness-agent-runtime-operation.v2', ...subject, endpoint_fence: endpointFence, operation, capability_sha256: capabilitySha });
  const basis = Object.freeze({ protocol: AGENT_RUNTIME_EFFECT_PROTOCOL, kind: AGENT_RUNTIME_EFFECT_INTENT_KIND, effect_id: deriveAgentRuntimeEffectId(key), idempotency_key: key, operation_fingerprint: fingerprint, ...subject, endpoint_fence: endpointFence, operation, capability_sha256: capabilitySha, created_at: input.created_at });
  return Object.freeze({ ...basis, intent_sha256: digest(basis) }) as AgentRuntimeEffectIntentV2;
}
export function validateAgentRuntimeEffectIntent(value: unknown): AgentRuntimeEffectIntentV2 {
  const input = record(value, 'effect intent'); const operation = operationName(input.operation);
  const subjectKey = operation === 'notify_inbox' ? 'message_ref' : 'wake_ref';
  assertMessageExactKeys(input, ['protocol', 'kind', 'effect_id', 'idempotency_key', 'operation_fingerprint', subjectKey, 'endpoint_fence', 'operation', 'capability_sha256', 'created_at', 'intent_sha256'], 'effect intent', invalid);
  if (input.protocol !== AGENT_RUNTIME_EFFECT_PROTOCOL || input.kind !== AGENT_RUNTIME_EFFECT_INTENT_KIND) invalid('effect intent protocol or kind is invalid');
  const shared = { idempotency_key: input.idempotency_key as string, endpoint_fence: input.endpoint_fence as RuntimeEndpointFenceV2, capability_sha256: input.capability_sha256 as string, created_at: input.created_at as string };
  const built = operation === 'notify_inbox'
    ? buildAgentRuntimeEffectIntent({ ...shared, operation, message_ref: input.message_ref as RuntimeMessageRefV2 })
    : buildAgentRuntimeEffectIntent({ ...shared, operation, wake_ref: input.wake_ref as RuntimeOfferWakeRefV2 });
  if (input.effect_id !== built.effect_id || input.operation_fingerprint !== built.operation_fingerprint || input.intent_sha256 !== built.intent_sha256) invalid('effect intent derived digest is stale'); return built;
}
export function canonicalAgentRuntimeEffectIntentBytes(value: AgentRuntimeEffectIntentV2): string { return canonicalMessageBytes(validateAgentRuntimeEffectIntent(value) as unknown as Readonly<Record<string, unknown>>); }

const CONTROL_PREFIX: Readonly<Record<AgentRuntimeOperation, string>> = Object.freeze({ notify_inbox: 'repo-harness-inbox', wake_for_offer: 'repo-harness-wake' });
function controlSha(intent: AgentRuntimeEffectIntentV2): string {
  return intent.operation === 'notify_inbox'
    ? digest({ domain: 'repo-harness-agent-runtime-control.v2', effect_id: intent.effect_id, intent_sha256: intent.intent_sha256, message_event_digest: intent.message_ref.message_event_digest, delivery_attempt: intent.message_ref.delivery_attempt })
    : digest({ domain: 'repo-harness-agent-runtime-wake-control.v2', effect_id: intent.effect_id, intent_sha256: intent.intent_sha256, snapshot_revision: intent.wake_ref.snapshot_revision, wake_reason: intent.wake_ref.wake_reason });
}
/** The exact bounded control reference one effect admits. The same
 * deterministic derivation runs on the observing side, so a receipt must carry
 * this exact string before it can prove this effect. Wake and inbox controls
 * use different prefixes and different domains, so neither can stand in for
 * the other. */
export function agentRuntimeControlRef(intentValue: AgentRuntimeEffectIntentV2): string {
  const intent = validateAgentRuntimeEffectIntent(intentValue);
  return `${CONTROL_PREFIX[intent.operation]}:${intent.effect_id}:${controlSha(intent)}`;
}
export function agentRuntimeControlSha256(intentValue: AgentRuntimeEffectIntentV2): string { return controlSha(validateAgentRuntimeEffectIntent(intentValue)); }
export function buildAgentRuntimeHostAction(intentValue: AgentRuntimeEffectIntentV2): AgentRuntimeHostActionV2 {
  const intent = validateAgentRuntimeEffectIntent(intentValue); const control = controlSha(intent);
  const subject = intent.operation === 'notify_inbox'
    ? { message_id: intent.message_ref.message_id, message_event_digest: intent.message_ref.message_event_digest, delivery_attempt: intent.message_ref.delivery_attempt }
    : { repository_id: intent.wake_ref.repository_id, snapshot_revision: intent.wake_ref.snapshot_revision, wake_reason: intent.wake_ref.wake_reason };
  const basis = Object.freeze({ protocol: AGENT_RUNTIME_EFFECT_PROTOCOL, kind: AGENT_RUNTIME_HOST_ACTION_KIND, effect_id: intent.effect_id, intent_sha256: intent.intent_sha256, adapter_kind: intent.endpoint_fence.adapter_kind, operation: intent.operation, host_id: intent.endpoint_fence.host_id, endpoint_id: intent.endpoint_fence.endpoint_id, ...subject, control_ref: agentRuntimeControlRef(intent), control_sha256: control });
  return Object.freeze({ ...basis, action_sha256: digest(basis) }) as AgentRuntimeHostActionV2;
}
export function validateAgentRuntimeHostAction(value: unknown): AgentRuntimeHostActionV2 {
  const input = record(value, 'host action'); const operation = operationName(input.operation);
  const subjectKeys = operation === 'notify_inbox' ? ['message_id', 'message_event_digest', 'delivery_attempt'] : ['repository_id', 'snapshot_revision', 'wake_reason'];
  assertMessageExactKeys(input, ['protocol', 'kind', 'effect_id', 'intent_sha256', 'adapter_kind', 'operation', 'host_id', 'endpoint_id', ...subjectKeys, 'control_ref', 'control_sha256', 'action_sha256'], 'host action', invalid);
  if (input.protocol !== AGENT_RUNTIME_EFFECT_PROTOCOL || input.kind !== AGENT_RUNTIME_HOST_ACTION_KIND) invalid('host action protocol or kind is invalid');
  const subject = operation === 'notify_inbox'
    ? { message_id: uuid(input.message_id, 'message_id'), message_event_digest: sha(input.message_event_digest, 'message_event_digest'), delivery_attempt: integer(input.delivery_attempt, 'delivery_attempt') }
    : { repository_id: repositoryId(input.repository_id, 'repository_id'), snapshot_revision: sha(input.snapshot_revision, 'snapshot_revision'), wake_reason: wakeReason(input.wake_reason) };
  const basis = Object.freeze({ protocol: AGENT_RUNTIME_EFFECT_PROTOCOL, kind: AGENT_RUNTIME_HOST_ACTION_KIND, effect_id: sha(input.effect_id, 'effect_id'), intent_sha256: sha(input.intent_sha256, 'intent_sha256'), adapter_kind: adapterKind(input.adapter_kind), operation, host_id: bounded(input.host_id, 'host_id'), endpoint_id: bounded(input.endpoint_id, 'endpoint_id'), ...subject, control_ref: bounded(input.control_ref, 'control_ref', 1024), control_sha256: sha(input.control_sha256, 'control_sha256') });
  if (basis.control_ref !== `${CONTROL_PREFIX[operation]}:${basis.effect_id}:${basis.control_sha256}`) invalid('control_ref does not match the bounded control identity');
  const built = Object.freeze({ ...basis, action_sha256: digest(basis) }); if (input.action_sha256 !== built.action_sha256) invalid('action_sha256 is stale'); return built as AgentRuntimeHostActionV2;
}
export function canonicalAgentRuntimeHostActionBytes(value: AgentRuntimeHostActionV2): string { return canonicalMessageBytes(validateAgentRuntimeHostAction(value) as unknown as Readonly<Record<string, unknown>>); }

export function validateAgentRuntimeAdapterObservation(value: unknown): AgentRuntimeAdapterObservationV2 {
  const input = record(value, 'adapter observation'); assertMessageExactKeys(input, ['adapter_kind', 'outcome', 'process_exit_code', 'process_signal'], 'adapter observation', invalid);
  if (input.process_exit_code !== null) assertMessageInteger(input.process_exit_code, 'process_exit_code', 0, invalid);
  return Object.freeze({ adapter_kind: adapterKind(input.adapter_kind), outcome: adapterOutcome(input.outcome), process_exit_code: input.process_exit_code as number | null, process_signal: nullableBounded(input.process_signal, 'process_signal') });
}
export function buildAgentRuntimeEffectObservation(input: Omit<AgentRuntimeEffectObservationV2, 'protocol' | 'kind' | 'observation_sha256'>): AgentRuntimeEffectObservationV2 {
  const state = effectState(input.state); const adapter = validateAgentRuntimeAdapterObservation(input.adapter); const receiptKind = input.receipt_kind;
  if (receiptKind !== null && receiptKind !== 'task_message_delivery_receipt' && receiptKind !== 'module_message_delivery_receipt' && receiptKind !== 'controller_step_receipt') invalid('receipt_kind is invalid');
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

const RECEIPT_KINDS_BY_OPERATION: Readonly<Record<AgentRuntimeOperation, readonly AgentRuntimeReceiptKind[]>> = Object.freeze({
  notify_inbox: Object.freeze<AgentRuntimeReceiptKind[]>(['task_message_delivery_receipt', 'module_message_delivery_receipt']),
  wake_for_offer: Object.freeze<AgentRuntimeReceiptKind[]>(['controller_step_receipt']),
});
/** A wake carries no message, so no delivery receipt may close it; a message
 * effect carries no controller step, so a controller-step receipt may not
 * close it either. The pairing is closed in both directions. */
export function assertAgentRuntimeReceiptKindForOperation(operationValue: unknown, receiptKind: AgentRuntimeReceiptKind): void {
  const operation = operationName(operationValue);
  if (!RECEIPT_KINDS_BY_OPERATION[operation].includes(receiptKind)) invalid(`${receiptKind} cannot prove a ${operation} effect`);
}

export function buildAgentRuntimeControllerStepReceipt(input: Omit<AgentRuntimeControllerStepReceiptV2, 'protocol' | 'kind' | 'receipt_sha256'>): AgentRuntimeControllerStepReceiptV2 {
  const effectId = sha(input.effect_id, 'effect_id'); const intentSha = sha(input.intent_sha256, 'intent_sha256');
  const controlSha256 = sha(input.control_sha256, 'control_sha256'); const controlRef = bounded(input.control_ref, 'control_ref', 1024);
  if (controlRef !== `${CONTROL_PREFIX.wake_for_offer}:${effectId}:${controlSha256}`) invalid('control_ref does not match the bounded wake control identity');
  assertMessageTimestamp(input.observed_at, 'observed_at', invalid);
  const basis = Object.freeze({
    protocol: AGENT_RUNTIME_EFFECT_PROTOCOL, kind: AGENT_RUNTIME_CONTROLLER_STEP_RECEIPT_KIND, effect_id: effectId, intent_sha256: intentSha,
    control_ref: controlRef, control_sha256: controlSha256, engineer_id: engineer(input.engineer_id, 'engineer_id'), binding_id: uuid(input.binding_id, 'binding_id'),
    binding_generation: integer(input.binding_generation, 'binding_generation'), observed_snapshot_revision: sha(input.observed_snapshot_revision, 'observed_snapshot_revision'),
    observed_at: input.observed_at,
  });
  return Object.freeze({ ...basis, receipt_sha256: digest(basis) });
}
export function validateAgentRuntimeControllerStepReceipt(value: unknown): AgentRuntimeControllerStepReceiptV2 {
  const input = record(value, 'controller step receipt');
  assertMessageExactKeys(input, ['protocol', 'kind', 'effect_id', 'intent_sha256', 'control_ref', 'control_sha256', 'engineer_id', 'binding_id', 'binding_generation', 'observed_snapshot_revision', 'observed_at', 'receipt_sha256'], 'controller step receipt', invalid);
  if (input.protocol !== AGENT_RUNTIME_EFFECT_PROTOCOL || input.kind !== AGENT_RUNTIME_CONTROLLER_STEP_RECEIPT_KIND) invalid('controller step receipt protocol or kind is invalid');
  const built = buildAgentRuntimeControllerStepReceipt({
    effect_id: input.effect_id as string, intent_sha256: input.intent_sha256 as string, control_ref: input.control_ref as string,
    control_sha256: input.control_sha256 as string, engineer_id: input.engineer_id as string, binding_id: input.binding_id as string,
    binding_generation: input.binding_generation as number, observed_snapshot_revision: input.observed_snapshot_revision as string,
    observed_at: input.observed_at as string,
  });
  if (input.receipt_sha256 !== built.receipt_sha256) invalid('receipt_sha256 is stale'); return built;
}
export function canonicalAgentRuntimeControllerStepReceiptBytes(value: AgentRuntimeControllerStepReceiptV2): string {
  return canonicalMessageBytes(validateAgentRuntimeControllerStepReceipt(value) as unknown as Readonly<Record<string, unknown>>);
}

export function buildAgentRuntimeOfferWakeSnapshot(offers: EngineerOffersV1): AgentRuntimeOfferWakeSnapshotV2 {
  const repository = repositoryId(offers.repository_id, 'offers.repository_id'); const engineerName = engineer(offers.engineer_id, 'offers.engineer_id');
  const snapshotRevision = sha(offers.snapshot_revision, 'offers.snapshot_revision');
  if (!Array.isArray(offers.offers) || !Array.isArray(offers.exclusions)) invalid('offers document is invalid');
  const revisions = new Set(offers.offers.map((offer) => offer.authorization_revision));
  if (revisions.size > 1) invalid('offers document mixes authorization revisions');
  for (const offer of offers.offers) {
    if (offer.repository_id !== repository || offer.engineer_id !== engineerName) invalid('offer does not belong to this offers document');
  }
  return Object.freeze({
    repository_id: repository, engineer_id: engineerName, snapshot_revision: snapshotRevision,
    authorization_revision: offers.offers.length === 0 ? null : integer(offers.offers[0]!.authorization_revision, 'offers.authorization_revision', 0),
    eligible_work_package_ids: Object.freeze(offers.offers.map((offer) => workPackageId(offer.work_package_id, 'offer.work_package_id'))),
    blocked: Object.freeze(offers.exclusions.map((exclusion) => Object.freeze({
      work_package_id: workPackageId(exclusion.work_package_id, 'exclusion.work_package_id'),
      blockers: Object.freeze((exclusion.blockers as readonly unknown[]).map((code) => blockerCode(code))),
    }))),
  });
}
export function validateAgentRuntimeOfferWakeSnapshot(value: unknown): AgentRuntimeOfferWakeSnapshotV2 {
  const input = record(value, 'offer wake snapshot');
  assertMessageExactKeys(input, ['repository_id', 'engineer_id', 'snapshot_revision', 'authorization_revision', 'eligible_work_package_ids', 'blocked'], 'offer wake snapshot', invalid);
  if (!Array.isArray(input.eligible_work_package_ids) || !Array.isArray(input.blocked)) invalid('offer wake snapshot collections are invalid');
  if (input.authorization_revision !== null) integer(input.authorization_revision, 'authorization_revision', 0);
  if ((input.authorization_revision === null) !== (input.eligible_work_package_ids.length === 0)) invalid('offer wake snapshot authorization revision does not match eligibility');
  return Object.freeze({
    repository_id: repositoryId(input.repository_id, 'repository_id'), engineer_id: engineer(input.engineer_id, 'engineer_id'),
    snapshot_revision: sha(input.snapshot_revision, 'snapshot_revision'), authorization_revision: input.authorization_revision as number | null,
    eligible_work_package_ids: Object.freeze(input.eligible_work_package_ids.map((entry) => workPackageId(entry, 'eligible_work_package_id'))),
    blocked: Object.freeze(input.blocked.map((entry) => {
      const item = record(entry, 'blocked'); assertMessageExactKeys(item, ['work_package_id', 'blockers'], 'blocked', invalid);
      if (!Array.isArray(item.blockers)) invalid('blocked.blockers is invalid');
      return Object.freeze({ work_package_id: workPackageId(item.work_package_id, 'blocked.work_package_id'), blockers: Object.freeze((item.blockers as readonly unknown[]).map((code) => blockerCode(code))) });
    })),
  });
}

/** The wake reason is read from the previous blockers of the highest-priority
 * newly eligible Work Package. Dependency is inspected before concurrency
 * because a dependency release is the upstream cause when both cleared in the
 * same pass; the order is fixed so the same pair of snapshots always yields
 * the same reason. */
export function decideAgentRuntimeOfferWake(previous: AgentRuntimeOfferWakeSnapshotV2 | null, currentValue: AgentRuntimeOfferWakeSnapshotV2): AgentRuntimeOfferWakeDecisionV2 {
  const current = validateAgentRuntimeOfferWakeSnapshot(currentValue);
  const before = previous === null ? null : validateAgentRuntimeOfferWakeSnapshot(previous);
  if (before && (before.repository_id !== current.repository_id || before.engineer_id !== current.engineer_id)) {
    invalid('offer wake snapshots describe different Engineers or repositories');
  }
  if (current.eligible_work_package_ids.length === 0) return Object.freeze({ due: false, cause: 'no_eligible_offers' });
  if (before && before.snapshot_revision === current.snapshot_revision) return Object.freeze({ due: false, cause: 'unchanged_snapshot' });
  if (before && before.eligible_work_package_ids.length > 0) return Object.freeze({ due: false, cause: 'already_eligible' });
  const lead = current.eligible_work_package_ids[0]!;
  const priorBlockers = before?.blocked.find((entry) => entry.work_package_id === lead)?.blockers ?? [];
  const reason: AgentRuntimeOfferWakeReason = priorBlockers.includes('dependency_not_ready') || priorBlockers.includes('dependency_authority_unavailable')
    ? 'dependency_unblocked'
    : priorBlockers.includes('concurrency_unavailable') || priorBlockers.includes('active_claim_limit')
      ? 'concurrency_released'
      : 'new_eligible_offer';
  return Object.freeze({
    due: true, wake_reason: reason, repository_id: current.repository_id, engineer_id: current.engineer_id,
    snapshot_revision: current.snapshot_revision, authorization_revision: current.authorization_revision!,
  });
}

export function deriveAgentRuntimeOfferWakeIdempotencyKey(input: {
  readonly engineer_id: string; readonly binding_id: string; readonly binding_generation: number;
  readonly snapshot_revision: string; readonly wake_reason: AgentRuntimeOfferWakeReason;
}): string {
  return digest({
    domain: 'repo-harness-agent-runtime-offer-wake-key.v2', engineer_id: engineer(input.engineer_id, 'engineer_id'),
    binding_id: uuid(input.binding_id, 'binding_id'), binding_generation: integer(input.binding_generation, 'binding_generation'),
    snapshot_revision: sha(input.snapshot_revision, 'snapshot_revision'), wake_reason: wakeReason(input.wake_reason),
  });
}

/** One Binding's durable wake ledger: the last consumed offer projection plus
 * the single wake pointer that a Host action may start. Two wakes for one
 * Binding cannot both be current, so supersession is a pointer replacement
 * rather than a second effect. */
export interface AgentRuntimeOfferWakePendingV2 {
  readonly effect_id: string;
  readonly snapshot_revision: string;
  readonly wake_reason: AgentRuntimeOfferWakeReason;
  readonly requested_at: string;
  readonly coalesce_until: string;
}
export interface AgentRuntimeOfferWakeLedgerV2 {
  readonly protocol: typeof AGENT_RUNTIME_EFFECT_PROTOCOL;
  readonly kind: typeof AGENT_RUNTIME_OFFER_WAKE_LEDGER_KIND;
  readonly endpoint_fence: RuntimeEndpointFenceV2;
  readonly observed: AgentRuntimeOfferWakeSnapshotV2;
  readonly observed_at: string;
  readonly pending: AgentRuntimeOfferWakePendingV2 | null;
  readonly ledger_sha256: string;
}

function offerWakePending(value: unknown): AgentRuntimeOfferWakePendingV2 | null {
  if (value === null) return null;
  const input = record(value, 'pending');
  assertMessageExactKeys(input, ['effect_id', 'snapshot_revision', 'wake_reason', 'requested_at', 'coalesce_until'], 'pending', invalid);
  const requestedAt = messageRequiredString(input.requested_at, 'pending.requested_at', invalid);
  const coalesceUntil = messageRequiredString(input.coalesce_until, 'pending.coalesce_until', invalid);
  assertMessageTimestamp(requestedAt, 'pending.requested_at', invalid);
  assertMessageTimestamp(coalesceUntil, 'pending.coalesce_until', invalid);
  if (Date.parse(coalesceUntil) < Date.parse(requestedAt)) invalid('pending.coalesce_until precedes pending.requested_at');
  return Object.freeze({
    effect_id: sha(input.effect_id, 'pending.effect_id'), snapshot_revision: sha(input.snapshot_revision, 'pending.snapshot_revision'),
    wake_reason: wakeReason(input.wake_reason), requested_at: requestedAt, coalesce_until: coalesceUntil,
  });
}
export function buildAgentRuntimeOfferWakeLedger(input: Omit<AgentRuntimeOfferWakeLedgerV2, 'protocol' | 'kind' | 'ledger_sha256'>): AgentRuntimeOfferWakeLedgerV2 {
  const endpointFence = validateRuntimeEndpointFence(input.endpoint_fence);
  const observed = validateAgentRuntimeOfferWakeSnapshot(input.observed);
  if (observed.engineer_id !== endpointFence.engineer_id) invalid('offer wake ledger observes another Engineer');
  assertMessageTimestamp(input.observed_at, 'observed_at', invalid);
  const basis = Object.freeze({
    protocol: AGENT_RUNTIME_EFFECT_PROTOCOL, kind: AGENT_RUNTIME_OFFER_WAKE_LEDGER_KIND, endpoint_fence: endpointFence,
    observed, observed_at: input.observed_at, pending: offerWakePending(input.pending),
  });
  return Object.freeze({ ...basis, ledger_sha256: digest(basis) });
}
export function validateAgentRuntimeOfferWakeLedger(value: unknown): AgentRuntimeOfferWakeLedgerV2 {
  const input = record(value, 'offer wake ledger');
  assertMessageExactKeys(input, ['protocol', 'kind', 'endpoint_fence', 'observed', 'observed_at', 'pending', 'ledger_sha256'], 'offer wake ledger', invalid);
  if (input.protocol !== AGENT_RUNTIME_EFFECT_PROTOCOL || input.kind !== AGENT_RUNTIME_OFFER_WAKE_LEDGER_KIND) invalid('offer wake ledger protocol or kind is invalid');
  const built = buildAgentRuntimeOfferWakeLedger({
    endpoint_fence: input.endpoint_fence as RuntimeEndpointFenceV2, observed: input.observed as AgentRuntimeOfferWakeSnapshotV2,
    observed_at: input.observed_at as string, pending: input.pending as AgentRuntimeOfferWakePendingV2 | null,
  });
  if (input.ledger_sha256 !== built.ledger_sha256) invalid('ledger_sha256 is stale'); return built;
}
export function canonicalAgentRuntimeOfferWakeLedgerBytes(value: AgentRuntimeOfferWakeLedgerV2): string {
  return canonicalMessageBytes(validateAgentRuntimeOfferWakeLedger(value) as unknown as Readonly<Record<string, unknown>>);
}
