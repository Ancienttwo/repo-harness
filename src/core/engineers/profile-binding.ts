import { createHash } from 'crypto';

import { canonicalize } from '../evidence/canonical-json';
import type { JsonValue } from '../evidence/types';

export const ENGINEER_PROFILE_PROTOCOL = 1 as const;
export const ENGINEER_PROFILE_KIND = 'repo-harness-module-engineer-profile' as const;
export const ENGINEER_BINDING_KIND = 'repo-harness-engineer-binding' as const;
export const ENGINEER_BINDING_EVENT_KIND = 'repo-harness-engineer-binding-event' as const;
export const ENGINEER_BINDING_CURRENT_KIND = 'repo-harness-engineer-binding-current' as const;

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ENGINEER_ID_PATTERN = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const CAPABILITY_ID_PATTERN = /^capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const SOP_REF_PATTERN = /^agents\/engineers\/sops\/[a-z0-9][a-z0-9-]*\.md$/u;
const OPAQUE_PATTERN = /^[^\u0000-\u001f\u007f]{1,512}$/u;
const IDEMPOTENCY_KEY_PATTERN = /^[^\u0000-\u001f\u007f]{1,256}$/u;

export const ENGINEER_DELEGATION_ROLES = [
  'explorer',
  'root-cause-prover',
  'fast-worker',
  'deep-worker',
  'gatekeeper',
] as const;

export type EngineerDelegationRole = (typeof ENGINEER_DELEGATION_ROLES)[number];
export type EngineerBindingState = 'active' | 'retired';
export type EngineerCurrentState = 'unbound' | EngineerBindingState;
export type EngineerBindingTransition = 'initialize' | 'bind' | 'retire' | 'replace';

export interface ModuleEngineerProfileV1 {
  readonly protocol: typeof ENGINEER_PROFILE_PROTOCOL;
  readonly kind: typeof ENGINEER_PROFILE_KIND;
  readonly engineer_id: string;
  readonly capability_id: string;
  readonly sop_ref: string;
  readonly delegation_policy: {
    readonly allowed_roles: readonly EngineerDelegationRole[];
    readonly max_depth: number;
    readonly max_parallel_readers: number;
    readonly max_parallel_writers: number;
  };
  readonly max_active_claims: number;
  readonly escalation_policy: {
    readonly cross_capability_change: 'interface_request';
    readonly acceptance: 'independent_plane';
  };
}

export interface EngineerBindingV1 {
  readonly protocol: typeof ENGINEER_PROFILE_PROTOCOL;
  readonly kind: typeof ENGINEER_BINDING_KIND;
  readonly binding_id: string;
  readonly engineer_id: string;
  readonly binding_generation: number;
  readonly provider: string;
  readonly provider_thread_id: string;
  readonly host_id: string;
  readonly engineer_contract_revision: string;
  readonly state: EngineerBindingState;
  readonly previous_binding_id: string | null;
  readonly bound_at: string;
  readonly retired_at: string | null;
}

export interface EngineerBindingEventV1 {
  readonly protocol: typeof ENGINEER_PROFILE_PROTOCOL;
  readonly kind: typeof ENGINEER_BINDING_EVENT_KIND;
  readonly transition_id: string;
  readonly idempotency_key: string;
  readonly operation_fingerprint: string;
  readonly engineer_id: string;
  readonly transition: EngineerBindingTransition;
  readonly expected_current_digest: string | null;
  readonly expected_binding_generation: number;
  readonly previous_binding_id: string | null;
  readonly next_binding: EngineerBindingV1 | null;
  readonly next_current_payload_sha256: string;
  readonly created_at: string;
  readonly event_digest: string;
}

export interface EngineerBindingCurrentV1 {
  readonly protocol: typeof ENGINEER_PROFILE_PROTOCOL;
  readonly kind: typeof ENGINEER_BINDING_CURRENT_KIND;
  readonly engineer_id: string;
  readonly binding_generation: number;
  readonly state: EngineerCurrentState;
  readonly current_binding_id: string | null;
  readonly current_transition_id: string | null;
  readonly current_event_digest: string | null;
  readonly engineer_contract_revision: string;
  readonly current_digest: string;
}

export interface EngineerTransitionRequest {
  readonly engineer_id: string;
  readonly idempotency_key: string;
  readonly transition: EngineerBindingTransition;
  readonly expected_current_digest: string | null;
  readonly expected_binding_generation: number;
  readonly expected_binding_id: string | null;
  readonly expected_engineer_contract_revision: string;
  readonly engineer_contract_revision: string;
  readonly provider: string | null;
  readonly provider_thread_id: string | null;
  readonly host_id: string | null;
}

export type EngineerProfileBindingErrorCode =
  | 'engineer_profile_invalid'
  | 'engineer_binding_invalid'
  | 'binding_state_corrupt'
  | 'binding_stale'
  | 'idempotency_conflict'
  | 'binding_lock_timeout'
  | 'unsafe_engineer_path';

export class EngineerProfileBindingError extends Error {
  constructor(
    readonly code: EngineerProfileBindingErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'EngineerProfileBindingError';
  }
}

function invalidProfile(message: string): never {
  throw new EngineerProfileBindingError('engineer_profile_invalid', message);
}

function invalidBinding(message: string): never {
  throw new EngineerProfileBindingError('engineer_binding_invalid', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  subject: string,
  invalid: (message: string) => never,
): void {
  const actual = Object.keys(value).sort();
  const fields = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(fields)) invalid(`${subject} fields are invalid`);
}

function requiredString(value: unknown, field: string, invalid: (message: string) => never): string {
  if (typeof value !== 'string' || value.length === 0) invalid(`${field} is required`);
  return value;
}

function nullableString(value: unknown, field: string, invalid: (message: string) => never): string | null {
  if (value === null) return null;
  return requiredString(value, field, invalid);
}

function assertInteger(value: unknown, field: string, minimum: number, invalid: (message: string) => never): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) invalid(`${field} is invalid`);
}

interface ParsedEngineerTimestamp {
  readonly epoch_second: number;
  readonly fractional_second: string;
}

function parseTimestamp(
  value: string,
  field: string,
  invalid: (message: string) => never,
): ParsedEngineerTimestamp {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/u);
  if (!match) invalid(`${field} is invalid`);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour, minute, second, 0);
  if (instant.getUTCFullYear() !== year
    || instant.getUTCMonth() !== month - 1
    || instant.getUTCDate() !== day
    || instant.getUTCHours() !== hour
    || instant.getUTCMinutes() !== minute
    || instant.getUTCSeconds() !== second) {
    invalid(`${field} is invalid`);
  }
  return {
    epoch_second: Math.trunc(instant.getTime() / 1000),
    fractional_second: (match[7] ?? '').replace(/0+$/u, ''),
  };
}

function assertTimestamp(value: string, field: string, invalid: (message: string) => never): void {
  parseTimestamp(value, field, invalid);
}

function timestampPrecedes(left: string, right: string): boolean {
  const leftValue = parseTimestamp(left, 'timestamp', invalidBinding);
  const rightValue = parseTimestamp(right, 'timestamp', invalidBinding);
  if (leftValue.epoch_second !== rightValue.epoch_second) {
    return leftValue.epoch_second < rightValue.epoch_second;
  }
  const width = Math.max(leftValue.fractional_second.length, rightValue.fractional_second.length);
  return leftValue.fractional_second.padEnd(width, '0') < rightValue.fractional_second.padEnd(width, '0');
}

function assertDigest(value: string, field: string, invalid: (message: string) => never): void {
  if (!SHA256_PATTERN.test(value)) invalid(`${field} is invalid`);
}

function assertUuid(value: string, field: string, invalid: (message: string) => never): void {
  if (!UUID_PATTERN.test(value)) invalid(`${field} is invalid`);
}

function assertEngineerId(value: string, invalid: (message: string) => never): void {
  if (!ENGINEER_ID_PATTERN.test(value)) invalid('engineer_id is invalid');
}

function assertOpaque(value: string, field: string, invalid: (message: string) => never): void {
  if (!OPAQUE_PATTERN.test(value)) invalid(`${field} is invalid`);
}

export function engineerSha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function canonicalEngineerJson(value: unknown): string {
  return canonicalize(value as JsonValue);
}

export function validateModuleEngineerProfile(value: unknown): ModuleEngineerProfileV1 {
  if (!isRecord(value)) invalidProfile('engineer profile must be an object');
  assertExactKeys(value, [
    'protocol', 'kind', 'engineer_id', 'capability_id', 'sop_ref',
    'delegation_policy', 'max_active_claims', 'escalation_policy',
  ], 'engineer profile', invalidProfile);
  if (value.protocol !== ENGINEER_PROFILE_PROTOCOL || value.kind !== ENGINEER_PROFILE_KIND) {
    invalidProfile('engineer profile protocol or kind is invalid');
  }
  const engineerId = requiredString(value.engineer_id, 'engineer_id', invalidProfile);
  const capabilityId = requiredString(value.capability_id, 'capability_id', invalidProfile);
  const sopRef = requiredString(value.sop_ref, 'sop_ref', invalidProfile);
  assertEngineerId(engineerId, invalidProfile);
  if (!CAPABILITY_ID_PATTERN.test(capabilityId)) invalidProfile('capability_id is invalid');
  if (engineerId !== `engineer:${capabilityId}`) invalidProfile('engineer_id must bind the exact capability_id');
  if (!SOP_REF_PATTERN.test(sopRef)) invalidProfile('sop_ref is invalid');

  if (!isRecord(value.delegation_policy)) invalidProfile('delegation_policy must be an object');
  assertExactKeys(value.delegation_policy, [
    'allowed_roles', 'max_depth', 'max_parallel_readers', 'max_parallel_writers',
  ], 'delegation_policy', invalidProfile);
  const roles = value.delegation_policy.allowed_roles;
  if (!Array.isArray(roles) || roles.length === 0 || roles.some((role) => !ENGINEER_DELEGATION_ROLES.includes(role as EngineerDelegationRole))) {
    invalidProfile('delegation_policy.allowed_roles is invalid');
  }
  if (new Set(roles).size !== roles.length) invalidProfile('delegation_policy.allowed_roles contains duplicates');
  assertInteger(value.delegation_policy.max_depth, 'delegation_policy.max_depth', 0, invalidProfile);
  assertInteger(value.delegation_policy.max_parallel_readers, 'delegation_policy.max_parallel_readers', 1, invalidProfile);
  assertInteger(value.delegation_policy.max_parallel_writers, 'delegation_policy.max_parallel_writers', 1, invalidProfile);
  assertInteger(value.max_active_claims, 'max_active_claims', 1, invalidProfile);

  if (!isRecord(value.escalation_policy)) invalidProfile('escalation_policy must be an object');
  assertExactKeys(value.escalation_policy, ['cross_capability_change', 'acceptance'], 'escalation_policy', invalidProfile);
  if (value.escalation_policy.cross_capability_change !== 'interface_request'
    || value.escalation_policy.acceptance !== 'independent_plane') {
    invalidProfile('escalation_policy is invalid');
  }

  return Object.freeze({
    protocol: ENGINEER_PROFILE_PROTOCOL,
    kind: ENGINEER_PROFILE_KIND,
    engineer_id: engineerId,
    capability_id: capabilityId,
    sop_ref: sopRef,
    delegation_policy: Object.freeze({
      allowed_roles: Object.freeze([...(roles as EngineerDelegationRole[])]),
      max_depth: value.delegation_policy.max_depth,
      max_parallel_readers: value.delegation_policy.max_parallel_readers,
      max_parallel_writers: value.delegation_policy.max_parallel_writers,
    }),
    max_active_claims: value.max_active_claims,
    escalation_policy: Object.freeze({
      cross_capability_change: 'interface_request',
      acceptance: 'independent_plane',
    }),
  });
}

export function canonicalModuleEngineerProfileBytes(profile: ModuleEngineerProfileV1): string {
  return canonicalEngineerJson(validateModuleEngineerProfile(profile));
}

export function engineerContractRevision(
  profile: ModuleEngineerProfileV1,
  sopBytes: string,
  capabilityRevision: string,
): string {
  assertDigest(capabilityRevision, 'capability_revision', invalidProfile);
  if (typeof sopBytes !== 'string' || Buffer.byteLength(sopBytes, 'utf8') === 0) invalidProfile('SOP bytes are required');
  return engineerSha256(canonicalEngineerJson({
    profile_canonical_bytes: canonicalModuleEngineerProfileBytes(profile),
    sop_utf8_bytes: sopBytes,
    capability_revision: capabilityRevision,
  }));
}

export function validateEngineerBinding(value: unknown): EngineerBindingV1 {
  if (!isRecord(value)) invalidBinding('engineer binding must be an object');
  assertExactKeys(value, [
    'protocol', 'kind', 'binding_id', 'engineer_id', 'binding_generation', 'provider',
    'provider_thread_id', 'host_id', 'engineer_contract_revision', 'state',
    'previous_binding_id', 'bound_at', 'retired_at',
  ], 'engineer binding', invalidBinding);
  if (value.protocol !== ENGINEER_PROFILE_PROTOCOL || value.kind !== ENGINEER_BINDING_KIND) {
    invalidBinding('engineer binding protocol or kind is invalid');
  }
  const bindingId = requiredString(value.binding_id, 'binding_id', invalidBinding);
  const engineerId = requiredString(value.engineer_id, 'engineer_id', invalidBinding);
  const provider = requiredString(value.provider, 'provider', invalidBinding);
  const providerThreadId = requiredString(value.provider_thread_id, 'provider_thread_id', invalidBinding);
  const hostId = requiredString(value.host_id, 'host_id', invalidBinding);
  const revision = requiredString(value.engineer_contract_revision, 'engineer_contract_revision', invalidBinding);
  const previousBindingId = nullableString(value.previous_binding_id, 'previous_binding_id', invalidBinding);
  const boundAt = requiredString(value.bound_at, 'bound_at', invalidBinding);
  const retiredAt = nullableString(value.retired_at, 'retired_at', invalidBinding);
  assertUuid(bindingId, 'binding_id', invalidBinding);
  assertEngineerId(engineerId, invalidBinding);
  assertInteger(value.binding_generation, 'binding_generation', 1, invalidBinding);
  assertOpaque(provider, 'provider', invalidBinding);
  assertOpaque(providerThreadId, 'provider_thread_id', invalidBinding);
  assertOpaque(hostId, 'host_id', invalidBinding);
  assertDigest(revision, 'engineer_contract_revision', invalidBinding);
  if (previousBindingId !== null) assertUuid(previousBindingId, 'previous_binding_id', invalidBinding);
  if (value.binding_generation === 1 && previousBindingId !== null) invalidBinding('generation-1 binding cannot have previous_binding_id');
  if (value.binding_generation > 1 && previousBindingId === null) invalidBinding('rotated binding requires previous_binding_id');
  assertTimestamp(boundAt, 'bound_at', invalidBinding);
  if (value.state !== 'active' && value.state !== 'retired') invalidBinding('state is invalid');
  if (value.state === 'active' && retiredAt !== null) invalidBinding('active binding cannot have retired_at');
  if (value.state === 'retired' && retiredAt === null) invalidBinding('retired binding requires retired_at');
  if (retiredAt !== null) assertTimestamp(retiredAt, 'retired_at', invalidBinding);
  if (retiredAt !== null && timestampPrecedes(retiredAt, boundAt)) invalidBinding('retired_at precedes bound_at');
  return Object.freeze({
    protocol: ENGINEER_PROFILE_PROTOCOL,
    kind: ENGINEER_BINDING_KIND,
    binding_id: bindingId,
    engineer_id: engineerId,
    binding_generation: value.binding_generation,
    provider,
    provider_thread_id: providerThreadId,
    host_id: hostId,
    engineer_contract_revision: revision,
    state: value.state,
    previous_binding_id: previousBindingId,
    bound_at: boundAt,
    retired_at: retiredAt,
  });
}

export function canonicalEngineerBindingBytes(binding: EngineerBindingV1): string {
  return canonicalEngineerJson(validateEngineerBinding(binding));
}

function currentPayloadBasis(current: Omit<EngineerBindingCurrentV1, 'current_transition_id' | 'current_event_digest' | 'current_digest'>): object {
  return {
    protocol: current.protocol,
    kind: current.kind,
    engineer_id: current.engineer_id,
    binding_generation: current.binding_generation,
    state: current.state,
    current_binding_id: current.current_binding_id,
    engineer_contract_revision: current.engineer_contract_revision,
  };
}

export function engineerCurrentPayloadSha256(
  current: Omit<EngineerBindingCurrentV1, 'current_transition_id' | 'current_event_digest' | 'current_digest'>,
): string {
  return engineerSha256(canonicalEngineerJson(currentPayloadBasis(current)));
}

export function engineerBindingEventDigest(event: Omit<EngineerBindingEventV1, 'event_digest'>): string {
  return engineerSha256(canonicalEngineerJson(event));
}

export function engineerBindingCurrentDigest(current: Omit<EngineerBindingCurrentV1, 'current_digest'>): string {
  return engineerSha256(canonicalEngineerJson(current));
}

export function deriveEngineerTransitionId(engineerId: string, idempotencyKey: string): string {
  assertEngineerId(engineerId, invalidBinding);
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) invalidBinding('idempotency_key is invalid');
  return engineerSha256(canonicalEngineerJson({
    protocol: ENGINEER_PROFILE_PROTOCOL,
    engineer_id: engineerId,
    idempotency_key: idempotencyKey,
  }));
}

export function engineerOperationFingerprint(request: EngineerTransitionRequest): string {
  const valid = validateEngineerTransitionRequest(request);
  const { engineer_contract_revision: _derivedEngineerContractRevision, ...clientRequest } = valid;
  return engineerSha256(canonicalEngineerJson(clientRequest));
}

export function validateEngineerTransitionRequest(request: EngineerTransitionRequest): EngineerTransitionRequest {
  assertEngineerId(request.engineer_id, invalidBinding);
  if (!IDEMPOTENCY_KEY_PATTERN.test(request.idempotency_key)) invalidBinding('idempotency_key is invalid');
  if (!['initialize', 'bind', 'retire', 'replace'].includes(request.transition)) invalidBinding('transition is invalid');
  if (request.expected_current_digest !== null) assertDigest(request.expected_current_digest, 'expected_current_digest', invalidBinding);
  assertInteger(request.expected_binding_generation, 'expected_binding_generation', 0, invalidBinding);
  if (request.expected_binding_id !== null) assertUuid(request.expected_binding_id, 'expected_binding_id', invalidBinding);
  assertDigest(request.expected_engineer_contract_revision, 'expected_engineer_contract_revision', invalidBinding);
  assertDigest(request.engineer_contract_revision, 'engineer_contract_revision', invalidBinding);
  if (request.transition === 'retire') {
    if (request.provider !== null || request.provider_thread_id !== null || request.host_id !== null) {
      invalidBinding('retire request provider fields must be null');
    }
  } else {
    for (const [field, value] of [
      ['provider', request.provider],
      ['provider_thread_id', request.provider_thread_id],
      ['host_id', request.host_id],
    ] as const) {
      if (value === null) invalidBinding(`${field} is required`);
      assertOpaque(value, field, invalidBinding);
    }
  }
  return Object.freeze({ ...request });
}

export function buildEngineerBindingEvent(input: Omit<EngineerBindingEventV1, 'protocol' | 'kind' | 'event_digest'>): EngineerBindingEventV1 {
  const basis = {
    protocol: ENGINEER_PROFILE_PROTOCOL,
    kind: ENGINEER_BINDING_EVENT_KIND,
    ...input,
  } as const;
  const event = { ...basis, event_digest: engineerBindingEventDigest(basis) };
  return validateEngineerBindingEvent(event);
}

export function validateEngineerBindingEvent(value: unknown): EngineerBindingEventV1 {
  if (!isRecord(value)) invalidBinding('engineer binding event must be an object');
  assertExactKeys(value, [
    'protocol', 'kind', 'transition_id', 'idempotency_key', 'operation_fingerprint',
    'engineer_id', 'transition', 'expected_current_digest', 'expected_binding_generation',
    'previous_binding_id', 'next_binding', 'next_current_payload_sha256', 'created_at', 'event_digest',
  ], 'engineer binding event', invalidBinding);
  if (value.protocol !== ENGINEER_PROFILE_PROTOCOL || value.kind !== ENGINEER_BINDING_EVENT_KIND) {
    invalidBinding('engineer binding event protocol or kind is invalid');
  }
  const transitionId = requiredString(value.transition_id, 'transition_id', invalidBinding);
  const idempotencyKey = requiredString(value.idempotency_key, 'idempotency_key', invalidBinding);
  const fingerprint = requiredString(value.operation_fingerprint, 'operation_fingerprint', invalidBinding);
  const engineerId = requiredString(value.engineer_id, 'engineer_id', invalidBinding);
  const expectedDigest = nullableString(value.expected_current_digest, 'expected_current_digest', invalidBinding);
  const previousBindingId = nullableString(value.previous_binding_id, 'previous_binding_id', invalidBinding);
  const payloadDigest = requiredString(value.next_current_payload_sha256, 'next_current_payload_sha256', invalidBinding);
  const createdAt = requiredString(value.created_at, 'created_at', invalidBinding);
  const eventDigest = requiredString(value.event_digest, 'event_digest', invalidBinding);
  assertDigest(transitionId, 'transition_id', invalidBinding);
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) invalidBinding('idempotency_key is invalid');
  if (transitionId !== deriveEngineerTransitionId(engineerId, idempotencyKey)) invalidBinding('transition_id is stale');
  assertDigest(fingerprint, 'operation_fingerprint', invalidBinding);
  assertEngineerId(engineerId, invalidBinding);
  if (!['initialize', 'bind', 'retire', 'replace'].includes(value.transition as string)) invalidBinding('transition is invalid');
  if (expectedDigest !== null) assertDigest(expectedDigest, 'expected_current_digest', invalidBinding);
  assertInteger(value.expected_binding_generation, 'expected_binding_generation', 0, invalidBinding);
  if (previousBindingId !== null) assertUuid(previousBindingId, 'previous_binding_id', invalidBinding);
  const nextBinding = value.next_binding === null ? null : validateEngineerBinding(value.next_binding);
  if (nextBinding === null) invalidBinding('next_binding is required for ME-0A transitions');
  if (nextBinding.engineer_id !== engineerId) invalidBinding('next_binding engineer_id mismatch');
  if (value.transition === 'retire') {
    if (previousBindingId === null || nextBinding.binding_id !== previousBindingId || nextBinding.state !== 'retired') {
      invalidBinding('retire event binding lineage is invalid');
    }
    if (expectedDigest === null || value.expected_binding_generation < 1
      || nextBinding.binding_generation !== value.expected_binding_generation) {
      invalidBinding('retire event generation fence is invalid');
    }
  } else if (nextBinding.previous_binding_id !== previousBindingId || nextBinding.state !== 'active') {
    invalidBinding('active event binding lineage is invalid');
  }
  // A replace event retires previous_binding_id at created_at and publishes
  // next_binding as current; older event snapshots retain their state-at-event.
  if (value.transition === 'initialize') {
    if (expectedDigest !== null || value.expected_binding_generation !== 0 || previousBindingId !== null
      || nextBinding.binding_generation !== 1) invalidBinding('initialize event fence is invalid');
  }
  if (value.transition === 'bind' || value.transition === 'replace') {
    if (expectedDigest === null || value.expected_binding_generation < 1 || previousBindingId === null
      || nextBinding.binding_generation !== value.expected_binding_generation + 1) {
      invalidBinding(`${String(value.transition)} event fence is invalid`);
    }
  }
  assertDigest(payloadDigest, 'next_current_payload_sha256', invalidBinding);
  assertTimestamp(createdAt, 'created_at', invalidBinding);
  assertDigest(eventDigest, 'event_digest', invalidBinding);
  const currentBasis = {
    protocol: ENGINEER_PROFILE_PROTOCOL,
    kind: ENGINEER_BINDING_CURRENT_KIND,
    engineer_id: engineerId,
    binding_generation: nextBinding.binding_generation,
    state: nextBinding.state,
    current_binding_id: nextBinding.binding_id,
    engineer_contract_revision: nextBinding.engineer_contract_revision,
  } as const;
  if (payloadDigest !== engineerCurrentPayloadSha256(currentBasis)) invalidBinding('next_current_payload_sha256 is stale');
  const basis = {
    protocol: ENGINEER_PROFILE_PROTOCOL,
    kind: ENGINEER_BINDING_EVENT_KIND,
    transition_id: transitionId,
    idempotency_key: idempotencyKey,
    operation_fingerprint: fingerprint,
    engineer_id: engineerId,
    transition: value.transition as EngineerBindingTransition,
    expected_current_digest: expectedDigest,
    expected_binding_generation: value.expected_binding_generation,
    previous_binding_id: previousBindingId,
    next_binding: nextBinding,
    next_current_payload_sha256: payloadDigest,
    created_at: createdAt,
  } as const;
  if (eventDigest !== engineerBindingEventDigest(basis)) invalidBinding('event_digest is stale');
  return Object.freeze({ ...basis, event_digest: eventDigest });
}

export function canonicalEngineerBindingEventBytes(event: EngineerBindingEventV1): string {
  return canonicalEngineerJson(validateEngineerBindingEvent(event));
}

export function buildEngineerBindingCurrent(event: EngineerBindingEventV1): EngineerBindingCurrentV1 {
  const valid = validateEngineerBindingEvent(event);
  const binding = valid.next_binding!;
  const basis = {
    protocol: ENGINEER_PROFILE_PROTOCOL,
    kind: ENGINEER_BINDING_CURRENT_KIND,
    engineer_id: valid.engineer_id,
    binding_generation: binding.binding_generation,
    state: binding.state,
    current_binding_id: binding.binding_id,
    current_transition_id: valid.transition_id,
    current_event_digest: valid.event_digest,
    engineer_contract_revision: binding.engineer_contract_revision,
  } as const;
  return Object.freeze({ ...basis, current_digest: engineerBindingCurrentDigest(basis) });
}

export function buildEngineerGenesisCurrent(engineerId: string, contractRevision: string): EngineerBindingCurrentV1 {
  assertEngineerId(engineerId, invalidBinding);
  assertDigest(contractRevision, 'engineer_contract_revision', invalidBinding);
  const basis = {
    protocol: ENGINEER_PROFILE_PROTOCOL,
    kind: ENGINEER_BINDING_CURRENT_KIND,
    engineer_id: engineerId,
    binding_generation: 0,
    state: 'unbound' as const,
    current_binding_id: null,
    current_transition_id: null,
    current_event_digest: null,
    engineer_contract_revision: contractRevision,
  };
  return Object.freeze({ ...basis, current_digest: engineerBindingCurrentDigest(basis) });
}

export function validateEngineerBindingCurrent(value: unknown): EngineerBindingCurrentV1 {
  if (!isRecord(value)) invalidBinding('engineer binding current must be an object');
  assertExactKeys(value, [
    'protocol', 'kind', 'engineer_id', 'binding_generation', 'state', 'current_binding_id',
    'current_transition_id', 'current_event_digest', 'engineer_contract_revision', 'current_digest',
  ], 'engineer binding current', invalidBinding);
  if (value.protocol !== ENGINEER_PROFILE_PROTOCOL || value.kind !== ENGINEER_BINDING_CURRENT_KIND) {
    invalidBinding('engineer binding current protocol or kind is invalid');
  }
  const engineerId = requiredString(value.engineer_id, 'engineer_id', invalidBinding);
  const bindingId = nullableString(value.current_binding_id, 'current_binding_id', invalidBinding);
  const transitionId = nullableString(value.current_transition_id, 'current_transition_id', invalidBinding);
  const eventDigest = nullableString(value.current_event_digest, 'current_event_digest', invalidBinding);
  const revision = requiredString(value.engineer_contract_revision, 'engineer_contract_revision', invalidBinding);
  const currentDigest = requiredString(value.current_digest, 'current_digest', invalidBinding);
  assertEngineerId(engineerId, invalidBinding);
  assertInteger(value.binding_generation, 'binding_generation', 0, invalidBinding);
  if (!['unbound', 'active', 'retired'].includes(value.state as string)) invalidBinding('state is invalid');
  if (value.state === 'unbound') {
    if (value.binding_generation !== 0 || bindingId !== null || transitionId !== null || eventDigest !== null) {
      invalidBinding('unbound current fields are invalid');
    }
  } else {
    if (value.binding_generation < 1 || bindingId === null || transitionId === null || eventDigest === null) {
      invalidBinding('bound current fields are invalid');
    }
    assertUuid(bindingId, 'current_binding_id', invalidBinding);
    assertDigest(transitionId, 'current_transition_id', invalidBinding);
    assertDigest(eventDigest, 'current_event_digest', invalidBinding);
  }
  assertDigest(revision, 'engineer_contract_revision', invalidBinding);
  assertDigest(currentDigest, 'current_digest', invalidBinding);
  const basis = {
    protocol: ENGINEER_PROFILE_PROTOCOL,
    kind: ENGINEER_BINDING_CURRENT_KIND,
    engineer_id: engineerId,
    binding_generation: value.binding_generation,
    state: value.state as EngineerCurrentState,
    current_binding_id: bindingId,
    current_transition_id: transitionId,
    current_event_digest: eventDigest,
    engineer_contract_revision: revision,
  } as const;
  if (currentDigest !== engineerBindingCurrentDigest(basis)) invalidBinding('current_digest is stale');
  return Object.freeze({ ...basis, current_digest: currentDigest });
}

export function canonicalEngineerBindingCurrentBytes(current: EngineerBindingCurrentV1): string {
  return canonicalEngineerJson(validateEngineerBindingCurrent(current));
}
