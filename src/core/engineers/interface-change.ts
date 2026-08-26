import {
  assertMessageBoundedUtf8,
  assertMessageExactKeys,
  assertMessageInteger,
  assertMessageSha256,
  assertMessageUuid,
  canonicalMessageBytes,
  canonicalMessageDigest,
  messageNullableString,
  messageRequiredString,
} from '../messages/mechanics';
import {
  validateWorkPackageDefinition,
  workPackageRevision,
  type WorkPackageDefinitionV1,
} from './scheduling';

export const INTERFACE_CHANGE_PROTOCOL = 1 as const;
export const INTERFACE_CHANGE_REQUEST_KIND = 'repo-harness-interface-change-request' as const;
export const INTERFACE_CHANGE_PROJECTION_KIND = 'repo-harness-interface-work-package-projection' as const;
export const INTERFACE_CHANGE_EVENT_KIND = 'repo-harness-interface-change-event' as const;
export const INTERFACE_CHANGE_CURRENT_KIND = 'repo-harness-interface-change-current' as const;

const REPOSITORY_ID = /^repo_[0-9a-f]{16}$/u;
const CAPABILITY_ID = /^capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const ENGINEER_ID = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const GIT_OID = /^[0-9a-f]{40,64}$/u;
const OPAQUE = /^[^\u0000-\u001f\u007f]{1,512}$/u;
const MAX_TEXT_BYTES = 16 * 1024;

export interface InterfaceEngineerFenceV1 {
  readonly engineer_id: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly engineer_contract_revision: string;
}

export type InterfaceChangeActorV1 =
  | { readonly kind: 'engineer'; readonly principal: InterfaceEngineerFenceV1 }
  | { readonly kind: 'human'; readonly principal_ref: string };

export interface InterfaceChangeRequestV1 {
  readonly protocol: typeof INTERFACE_CHANGE_PROTOCOL;
  readonly kind: typeof INTERFACE_CHANGE_REQUEST_KIND;
  readonly repository_id: string;
  readonly request_id: string;
  readonly source_capability_id: string;
  readonly target_capability_id: string;
  readonly requester_fence: InterfaceEngineerFenceV1;
  readonly target_engineer_id: string;
  readonly interface_ref: string;
  readonly proposed_change: string;
  readonly compatibility_impact: string;
  readonly request_sha256: string;
}

export interface InterfaceWorkPackageProjectionV1 {
  readonly protocol: typeof INTERFACE_CHANGE_PROTOCOL;
  readonly kind: typeof INTERFACE_CHANGE_PROJECTION_KIND;
  readonly request_id: string;
  readonly request_sha256: string;
  readonly accepted_from_current_digest: string;
  readonly sprint_ref: string;
  readonly expected_work_graph_revision: string | null;
  readonly proposed_work_package: WorkPackageDefinitionV1;
  readonly proposed_work_package_revision: string;
  readonly projection_sha256: string;
}

export interface InterfaceMaterializedWorkPackageRefV1 {
  readonly repository_id: string;
  readonly sprint_ref: string;
  readonly work_graph_revision: string;
  readonly work_package_id: string;
  readonly work_package_revision: string;
  readonly materialized_commit: string;
}

export type InterfaceChangeState =
  | 'proposed'
  | 'under_review'
  | 'accepted'
  | 'rejected'
  | 'implementing'
  | 'implemented'
  | 'integrated'
  | 'cancelled';

export type InterfaceChangeTransition =
  | 'propose'
  | 'submit'
  | 'accept'
  | 'reject'
  | 'cancel'
  | 'materialize'
  | 'implemented'
  | 'integrated';

export interface InterfaceChangeEventV1 {
  readonly protocol: typeof INTERFACE_CHANGE_PROTOCOL;
  readonly kind: typeof INTERFACE_CHANGE_EVENT_KIND;
  readonly transition_id: string;
  readonly idempotency_key: string;
  readonly operation_fingerprint: string;
  readonly request_id: string;
  readonly request_sha256: string;
  readonly request_revision: number;
  readonly transition: InterfaceChangeTransition;
  readonly expected_current_digest: string | null;
  readonly actor: InterfaceChangeActorV1;
  readonly next_state: InterfaceChangeState;
  readonly accepted_projection_sha256: string | null;
  readonly materialized_work_package_ref: InterfaceMaterializedWorkPackageRefV1 | null;
  readonly evidence_sha256: string | null;
  readonly event_sha256: string;
}

export interface InterfaceChangeCurrentV1 {
  readonly protocol: typeof INTERFACE_CHANGE_PROTOCOL;
  readonly kind: typeof INTERFACE_CHANGE_CURRENT_KIND;
  readonly request_id: string;
  readonly request_sha256: string;
  readonly request_revision: number;
  readonly state: InterfaceChangeState;
  readonly current_event_sha256: string;
  readonly accepted_projection_sha256: string | null;
  readonly materialized_work_package_ref: InterfaceMaterializedWorkPackageRefV1 | null;
  readonly implementation_evidence_sha256: string | null;
  readonly integration_evidence_sha256: string | null;
  readonly previous_current_digest: string | null;
  readonly current_digest: string;
}

export interface InterfaceChangeTransitionInput {
  readonly idempotency_key: string;
  readonly transition: InterfaceChangeTransition;
  readonly expected_current_digest: string | null;
  readonly actor: InterfaceChangeActorV1;
  readonly accepted_projection: InterfaceWorkPackageProjectionV1 | null;
  readonly materialized_work_package_ref: InterfaceMaterializedWorkPackageRefV1 | null;
  readonly evidence_sha256: string | null;
}

export type InterfaceChangeErrorCode =
  | 'interface_change_invalid'
  | 'interface_change_blocked'
  | 'interface_change_stale';

export class InterfaceChangeError extends Error {
  constructor(readonly code: InterfaceChangeErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'InterfaceChangeError';
  }
}

type RecordValue = Record<string, unknown>;

function invalid(message: string): never {
  throw new InterfaceChangeError('interface_change_invalid', message);
}

function blocked(message: string): never {
  throw new InterfaceChangeError('interface_change_blocked', message);
}

function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as RecordValue;
}

function required(value: unknown, field: string, pattern?: RegExp): string {
  const result = messageRequiredString(value, field, invalid);
  if (pattern && !pattern.test(result)) invalid(`${field} is invalid`);
  return result;
}

function uuid(value: unknown, field: string): string {
  const result = required(value, field);
  assertMessageUuid(result, field, invalid);
  return result;
}

function sha(value: unknown, field: string): string {
  const result = required(value, field);
  assertMessageSha256(result, field, invalid);
  return result;
}

function nullableSha(value: unknown, field: string): string | null {
  if (value === null) return null;
  return sha(value, field);
}

function bounded(value: unknown, field: string, maximum = MAX_TEXT_BYTES): string {
  const result = required(value, field);
  assertMessageBoundedUtf8(result, field, maximum, invalid);
  return result;
}

function safeRepoPath(value: unknown, field: string, suffix?: string): string {
  const result = bounded(value, field, 1024);
  if (result.startsWith('/') || result.startsWith('-') || result.includes('\\')
    || result.split('/').some((part) => part.length === 0 || part === '.' || part === '..')) invalid(`${field} is unsafe`);
  if (suffix && !result.endsWith(suffix)) invalid(`${field} must end with ${suffix}`);
  return result;
}

function engineerFence(value: unknown, label: string): InterfaceEngineerFenceV1 {
  const input = record(value, label);
  assertMessageExactKeys(input, ['engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision'], label, invalid);
  const bindingId = uuid(input.binding_id, `${label}.binding_id`);
  assertMessageInteger(input.binding_generation, `${label}.binding_generation`, 1, invalid);
  return Object.freeze({
    engineer_id: required(input.engineer_id, `${label}.engineer_id`, ENGINEER_ID),
    binding_id: bindingId,
    binding_generation: input.binding_generation,
    engineer_contract_revision: sha(input.engineer_contract_revision, `${label}.engineer_contract_revision`),
  });
}

export function validateInterfaceChangeActor(value: unknown): InterfaceChangeActorV1 {
  const input = record(value, 'interface actor');
  if (input.kind === 'engineer') {
    assertMessageExactKeys(input, ['kind', 'principal'], 'interface actor', invalid);
    return Object.freeze({ kind: 'engineer', principal: engineerFence(input.principal, 'interface actor.principal') });
  }
  if (input.kind === 'human') {
    assertMessageExactKeys(input, ['kind', 'principal_ref'], 'interface actor', invalid);
    return Object.freeze({ kind: 'human', principal_ref: required(input.principal_ref, 'interface actor.principal_ref', OPAQUE) });
  }
  return invalid('interface actor kind is invalid');
}

function sameFence(left: InterfaceEngineerFenceV1, right: InterfaceEngineerFenceV1): boolean {
  return left.engineer_id === right.engineer_id
    && left.binding_id === right.binding_id
    && left.binding_generation === right.binding_generation
    && left.engineer_contract_revision === right.engineer_contract_revision;
}

export function validateInterfaceChangeTransitionActor(
  requestValue: InterfaceChangeRequestV1,
  transition: InterfaceChangeTransition,
  actorValue: InterfaceChangeActorV1,
): InterfaceChangeActorV1 {
  const request = validateInterfaceChangeRequest(requestValue);
  if (!['propose', 'submit', 'accept', 'reject', 'cancel', 'materialize', 'implemented', 'integrated'].includes(transition)) invalid('interface transition is invalid');
  const actor = validateInterfaceChangeActor(actorValue);
  if (transition === 'propose' || transition === 'submit') {
    if (actor.kind !== 'engineer' || !sameFence(actor.principal, request.requester_fence)) invalid(`${transition} requires exact requester Engineer`);
  } else if (transition === 'cancel') {
    if (actor.kind === 'engineer' && !sameFence(actor.principal, request.requester_fence)) invalid('cancel Engineer does not match requester');
  } else if (transition === 'materialize' || transition === 'implemented') {
    if (actor.kind !== 'engineer' || actor.principal.engineer_id !== request.target_engineer_id) invalid(`${transition} requires target Engineer`);
  } else if (actor.kind !== 'human') {
    invalid(`${transition} requires Human authority`);
  }
  return actor;
}

function materializedRef(value: unknown): InterfaceMaterializedWorkPackageRefV1 {
  const input = record(value, 'materialized Work Package ref');
  assertMessageExactKeys(input, ['repository_id', 'sprint_ref', 'work_graph_revision', 'work_package_id', 'work_package_revision', 'materialized_commit'], 'materialized Work Package ref', invalid);
  return Object.freeze({
    repository_id: required(input.repository_id, 'materialized.repository_id', REPOSITORY_ID),
    sprint_ref: safeRepoPath(input.sprint_ref, 'materialized.sprint_ref', '.sprint.md'),
    work_graph_revision: sha(input.work_graph_revision, 'materialized.work_graph_revision'),
    work_package_id: required(input.work_package_id, 'materialized.work_package_id', /^[a-z0-9][a-z0-9-]{0,127}$/u),
    work_package_revision: sha(input.work_package_revision, 'materialized.work_package_revision'),
    materialized_commit: required(input.materialized_commit, 'materialized.materialized_commit', GIT_OID),
  });
}

export function buildInterfaceChangeRequest(
  input: Omit<InterfaceChangeRequestV1, 'protocol' | 'kind' | 'request_sha256'>,
): InterfaceChangeRequestV1 {
  const requester = engineerFence(input.requester_fence, 'requester_fence');
  const sourceCapability = required(input.source_capability_id, 'source_capability_id', CAPABILITY_ID);
  const targetCapability = required(input.target_capability_id, 'target_capability_id', CAPABILITY_ID);
  if (sourceCapability === targetCapability) invalid('source and target capabilities must differ');
  if (requester.engineer_id !== `engineer:${sourceCapability}`) invalid('requester Engineer does not own source capability');
  const targetEngineer = required(input.target_engineer_id, 'target_engineer_id', ENGINEER_ID);
  if (targetEngineer !== `engineer:${targetCapability}`) invalid('target Engineer does not own target capability');
  const basis = Object.freeze({
    protocol: INTERFACE_CHANGE_PROTOCOL,
    kind: INTERFACE_CHANGE_REQUEST_KIND,
    repository_id: required(input.repository_id, 'repository_id', REPOSITORY_ID),
    request_id: uuid(input.request_id, 'request_id'),
    source_capability_id: sourceCapability,
    target_capability_id: targetCapability,
    requester_fence: requester,
    target_engineer_id: targetEngineer,
    interface_ref: bounded(input.interface_ref, 'interface_ref', 2048),
    proposed_change: bounded(input.proposed_change, 'proposed_change'),
    compatibility_impact: bounded(input.compatibility_impact, 'compatibility_impact'),
  });
  return Object.freeze({ ...basis, request_sha256: canonicalMessageDigest(basis) });
}

export function validateInterfaceChangeRequest(value: unknown): InterfaceChangeRequestV1 {
  const input = record(value, 'interface change request');
  assertMessageExactKeys(input, ['protocol', 'kind', 'repository_id', 'request_id', 'source_capability_id', 'target_capability_id', 'requester_fence', 'target_engineer_id', 'interface_ref', 'proposed_change', 'compatibility_impact', 'request_sha256'], 'interface change request', invalid);
  if (input.protocol !== INTERFACE_CHANGE_PROTOCOL || input.kind !== INTERFACE_CHANGE_REQUEST_KIND) invalid('interface change request protocol or kind is invalid');
  const built = buildInterfaceChangeRequest(input as unknown as Omit<InterfaceChangeRequestV1, 'protocol' | 'kind' | 'request_sha256'>);
  if (input.request_sha256 !== built.request_sha256 || canonicalMessageBytes(input) !== canonicalMessageBytes(built as unknown as RecordValue)) invalid('interface change request digest is stale');
  return built;
}

export const canonicalInterfaceChangeRequestBytes = (value: InterfaceChangeRequestV1): string => canonicalMessageBytes(validateInterfaceChangeRequest(value) as unknown as RecordValue);

export interface BuildInterfaceWorkPackageProjectionInput {
  readonly request: InterfaceChangeRequestV1;
  readonly accepted_from_current_digest: string;
  readonly sprint_ref: string;
  readonly expected_work_graph_revision: string | null;
  readonly proposed_work_package: WorkPackageDefinitionV1;
}

export function buildInterfaceWorkPackageProjection(input: BuildInterfaceWorkPackageProjectionInput): InterfaceWorkPackageProjectionV1 {
  const request = validateInterfaceChangeRequest(input.request);
  const proposed = validateWorkPackageDefinition(input.proposed_work_package);
  if (proposed.primary_capability !== request.target_capability_id) invalid('proposed Work Package capability does not match target capability');
  const basis = Object.freeze({
    protocol: INTERFACE_CHANGE_PROTOCOL,
    kind: INTERFACE_CHANGE_PROJECTION_KIND,
    request_id: request.request_id,
    request_sha256: request.request_sha256,
    accepted_from_current_digest: sha(input.accepted_from_current_digest, 'accepted_from_current_digest'),
    sprint_ref: safeRepoPath(input.sprint_ref, 'sprint_ref', '.sprint.md'),
    expected_work_graph_revision: nullableSha(input.expected_work_graph_revision, 'expected_work_graph_revision'),
    proposed_work_package: proposed,
    proposed_work_package_revision: workPackageRevision(proposed),
  });
  return Object.freeze({ ...basis, projection_sha256: canonicalMessageDigest(basis) });
}

export function validateInterfaceWorkPackageProjection(value: unknown): InterfaceWorkPackageProjectionV1 {
  const input = record(value, 'interface Work Package projection');
  assertMessageExactKeys(input, ['protocol', 'kind', 'request_id', 'request_sha256', 'accepted_from_current_digest', 'sprint_ref', 'expected_work_graph_revision', 'proposed_work_package', 'proposed_work_package_revision', 'projection_sha256'], 'interface Work Package projection', invalid);
  if (input.protocol !== INTERFACE_CHANGE_PROTOCOL || input.kind !== INTERFACE_CHANGE_PROJECTION_KIND) invalid('interface Work Package projection protocol or kind is invalid');
  const proposed = validateWorkPackageDefinition(input.proposed_work_package);
  const basis = Object.freeze({
    protocol: INTERFACE_CHANGE_PROTOCOL,
    kind: INTERFACE_CHANGE_PROJECTION_KIND,
    request_id: uuid(input.request_id, 'request_id'),
    request_sha256: sha(input.request_sha256, 'request_sha256'),
    accepted_from_current_digest: sha(input.accepted_from_current_digest, 'accepted_from_current_digest'),
    sprint_ref: safeRepoPath(input.sprint_ref, 'sprint_ref', '.sprint.md'),
    expected_work_graph_revision: nullableSha(input.expected_work_graph_revision, 'expected_work_graph_revision'),
    proposed_work_package: proposed,
    proposed_work_package_revision: workPackageRevision(proposed),
  });
  const built = Object.freeze({ ...basis, projection_sha256: canonicalMessageDigest(basis) });
  if (input.proposed_work_package_revision !== built.proposed_work_package_revision || input.projection_sha256 !== built.projection_sha256 || canonicalMessageBytes(input) !== canonicalMessageBytes(built as unknown as RecordValue)) invalid('interface Work Package projection digest is stale');
  return built;
}

export const canonicalInterfaceWorkPackageProjectionBytes = (value: InterfaceWorkPackageProjectionV1): string => canonicalMessageBytes(validateInterfaceWorkPackageProjection(value) as unknown as RecordValue);

export function deriveInterfaceChangeTransitionId(requestId: string, idempotencyKey: string): string {
  return canonicalMessageDigest({ domain: 'repo-harness-interface-change-transition.v1', request_id: uuid(requestId, 'request_id'), idempotency_key: bounded(idempotencyKey, 'idempotency_key', 512) });
}

function nextState(previous: InterfaceChangeCurrentV1 | null, transition: InterfaceChangeTransition): InterfaceChangeState {
  if (previous === null) {
    if (transition !== 'propose') blocked('first interface transition must be propose');
    return 'proposed';
  }
  const key = `${previous.state}:${transition}`;
  const states: Record<string, InterfaceChangeState> = {
    'proposed:submit': 'under_review',
    'proposed:cancel': 'cancelled',
    'under_review:accept': 'accepted',
    'under_review:reject': 'rejected',
    'under_review:cancel': 'cancelled',
    'accepted:materialize': 'implementing',
    'implementing:implemented': 'implemented',
    'implemented:integrated': 'integrated',
  };
  return states[key] ?? blocked(`transition ${transition} is invalid from ${previous.state}`);
}

function validateTransitionPayload(
  request: InterfaceChangeRequestV1,
  previous: InterfaceChangeCurrentV1 | null,
  transition: InterfaceChangeTransition,
  actor: InterfaceChangeActorV1,
  projection: InterfaceWorkPackageProjectionV1 | null,
  materialization: InterfaceMaterializedWorkPackageRefV1 | null,
  evidence: string | null,
): void {
  if (transition === 'accept') {
    if (!projection || previous === null || projection.request_id !== request.request_id || projection.request_sha256 !== request.request_sha256 || projection.accepted_from_current_digest !== previous.current_digest) invalid('accept projection does not match exact request current');
  } else if (projection !== null) invalid('only accept may carry a Work Package projection');
  if (transition === 'materialize') {
    if (!materialization || previous?.accepted_projection_sha256 === null) invalid('materialize requires accepted projection and exact materialization');
  } else if (materialization !== null) invalid('only materialize may carry a materialized Work Package ref');
  if (transition === 'implemented' || transition === 'integrated') {
    if (evidence === null) invalid(`${transition} requires evidence_sha256`);
  } else if (evidence !== null) invalid(`transition ${transition} cannot carry evidence_sha256`);
}

function operationFingerprintBasis(input: {
  readonly request_id: string;
  readonly request_sha256: string;
  readonly transition: InterfaceChangeTransition;
  readonly expected_current_digest: string | null;
  readonly actor: InterfaceChangeActorV1;
  readonly accepted_projection_sha256: string | null;
  readonly materialized_work_package_ref: InterfaceMaterializedWorkPackageRefV1 | null;
  readonly evidence_sha256: string | null;
}): string {
  return canonicalMessageDigest({
    domain: 'repo-harness-interface-change-operation.v1',
    ...input,
  });
}

export function deriveInterfaceChangeOperationFingerprint(requestValue: InterfaceChangeRequestV1, input: InterfaceChangeTransitionInput): string {
  const request = validateInterfaceChangeRequest(requestValue);
  return operationFingerprintBasis({
    request_id: request.request_id,
    request_sha256: request.request_sha256,
    transition: input.transition,
    expected_current_digest: input.expected_current_digest,
    actor: input.actor,
    accepted_projection_sha256: input.accepted_projection?.projection_sha256 ?? null,
    materialized_work_package_ref: input.materialized_work_package_ref,
    evidence_sha256: input.evidence_sha256,
  });
}

export function buildInterfaceChangeEvent(
  requestValue: InterfaceChangeRequestV1,
  previous: InterfaceChangeCurrentV1 | null,
  input: InterfaceChangeTransitionInput,
): InterfaceChangeEventV1 {
  const request = validateInterfaceChangeRequest(requestValue);
  if (!['propose', 'submit', 'accept', 'reject', 'cancel', 'materialize', 'implemented', 'integrated'].includes(input.transition)) invalid('interface transition is invalid');
  const actor = validateInterfaceChangeTransitionActor(request, input.transition, input.actor);
  const expected = nullableSha(input.expected_current_digest, 'expected_current_digest');
  const projection = input.accepted_projection === null ? null : validateInterfaceWorkPackageProjection(input.accepted_projection);
  const materialization = input.materialized_work_package_ref === null ? null : materializedRef(input.materialized_work_package_ref);
  const evidence = nullableSha(input.evidence_sha256, 'evidence_sha256');
  if (previous === null) {
    if (expected !== null) blocked('first transition expected_current_digest must be null');
  } else {
    const current = validateInterfaceChangeCurrent(previous);
    if (current.request_id !== request.request_id || current.request_sha256 !== request.request_sha256 || expected !== current.current_digest) throw new InterfaceChangeError('interface_change_stale', 'interface current fence is stale');
  }
  const next = nextState(previous, input.transition);
  validateTransitionPayload(request, previous, input.transition, actor, projection, materialization, evidence);
  const idempotencyKey = bounded(input.idempotency_key, 'idempotency_key', 512);
  const basis = Object.freeze({
    protocol: INTERFACE_CHANGE_PROTOCOL,
    kind: INTERFACE_CHANGE_EVENT_KIND,
    transition_id: deriveInterfaceChangeTransitionId(request.request_id, idempotencyKey),
    idempotency_key: idempotencyKey,
    operation_fingerprint: deriveInterfaceChangeOperationFingerprint(request, { ...input, actor, accepted_projection: projection, materialized_work_package_ref: materialization, evidence_sha256: evidence }),
    request_id: request.request_id,
    request_sha256: request.request_sha256,
    request_revision: (previous?.request_revision ?? 0) + 1,
    transition: input.transition,
    expected_current_digest: expected,
    actor,
    next_state: next,
    accepted_projection_sha256: projection?.projection_sha256 ?? null,
    materialized_work_package_ref: materialization,
    evidence_sha256: evidence,
  });
  return Object.freeze({ ...basis, event_sha256: canonicalMessageDigest(basis) });
}

export function validateInterfaceChangeEvent(value: unknown): InterfaceChangeEventV1 {
  const input = record(value, 'interface change event');
  assertMessageExactKeys(input, ['protocol', 'kind', 'transition_id', 'idempotency_key', 'operation_fingerprint', 'request_id', 'request_sha256', 'request_revision', 'transition', 'expected_current_digest', 'actor', 'next_state', 'accepted_projection_sha256', 'materialized_work_package_ref', 'evidence_sha256', 'event_sha256'], 'interface change event', invalid);
  if (input.protocol !== INTERFACE_CHANGE_PROTOCOL || input.kind !== INTERFACE_CHANGE_EVENT_KIND) invalid('interface change event protocol or kind is invalid');
  const transition = input.transition as InterfaceChangeTransition;
  if (!['propose', 'submit', 'accept', 'reject', 'cancel', 'materialize', 'implemented', 'integrated'].includes(transition)) invalid('interface transition is invalid');
  const actor = validateInterfaceChangeActor(input.actor);
  assertMessageInteger(input.request_revision, 'request_revision', 1, invalid);
  const basis = Object.freeze({
    protocol: INTERFACE_CHANGE_PROTOCOL,
    kind: INTERFACE_CHANGE_EVENT_KIND,
    transition_id: required(input.transition_id, 'transition_id'),
    idempotency_key: bounded(input.idempotency_key, 'idempotency_key', 512),
    operation_fingerprint: sha(input.operation_fingerprint, 'operation_fingerprint'),
    request_id: uuid(input.request_id, 'request_id'),
    request_sha256: sha(input.request_sha256, 'request_sha256'),
    request_revision: input.request_revision,
    transition,
    expected_current_digest: nullableSha(input.expected_current_digest, 'expected_current_digest'),
    actor,
    next_state: required(input.next_state, 'next_state') as InterfaceChangeState,
    accepted_projection_sha256: nullableSha(input.accepted_projection_sha256, 'accepted_projection_sha256'),
    materialized_work_package_ref: input.materialized_work_package_ref === null ? null : materializedRef(input.materialized_work_package_ref),
    evidence_sha256: nullableSha(input.evidence_sha256, 'evidence_sha256'),
  });
  const expectedNext: Record<InterfaceChangeTransition, InterfaceChangeState> = {
    propose: 'proposed', submit: 'under_review', accept: 'accepted', reject: 'rejected', cancel: 'cancelled', materialize: 'implementing', implemented: 'implemented', integrated: 'integrated',
  };
  if (basis.next_state !== expectedNext[transition]) invalid('event next_state is invalid');
  if ((transition === 'accept') !== (basis.accepted_projection_sha256 !== null)) invalid('event accepted projection shape is invalid');
  if ((transition === 'materialize') !== (basis.materialized_work_package_ref !== null)) invalid('event materialization shape is invalid');
  if ((transition === 'implemented' || transition === 'integrated') !== (basis.evidence_sha256 !== null)) invalid('event evidence shape is invalid');
  const expectedFingerprint = operationFingerprintBasis({
    request_id: basis.request_id,
    request_sha256: basis.request_sha256,
    transition,
    expected_current_digest: basis.expected_current_digest,
    actor: basis.actor,
    accepted_projection_sha256: basis.accepted_projection_sha256,
    materialized_work_package_ref: basis.materialized_work_package_ref,
    evidence_sha256: basis.evidence_sha256,
  });
  if (basis.operation_fingerprint !== expectedFingerprint) invalid('event operation_fingerprint is stale');
  const built = Object.freeze({ ...basis, event_sha256: canonicalMessageDigest(basis) });
  if (input.event_sha256 !== built.event_sha256 || input.transition_id !== deriveInterfaceChangeTransitionId(built.request_id, built.idempotency_key) || canonicalMessageBytes(input) !== canonicalMessageBytes(built as unknown as RecordValue)) invalid('interface change event digest is stale');
  return built;
}

export const canonicalInterfaceChangeEventBytes = (value: InterfaceChangeEventV1): string => canonicalMessageBytes(validateInterfaceChangeEvent(value) as unknown as RecordValue);

export function buildInterfaceChangeCurrent(eventValue: InterfaceChangeEventV1, previous: InterfaceChangeCurrentV1 | null): InterfaceChangeCurrentV1 {
  const event = validateInterfaceChangeEvent(eventValue);
  if ((previous === null) !== (event.transition === 'propose')) invalid('interface current predecessor is invalid');
  if (previous !== null && (event.expected_current_digest !== previous.current_digest || event.request_revision !== previous.request_revision + 1)) throw new InterfaceChangeError('interface_change_stale', 'interface current predecessor is stale');
  const basis = Object.freeze({
    protocol: INTERFACE_CHANGE_PROTOCOL,
    kind: INTERFACE_CHANGE_CURRENT_KIND,
    request_id: event.request_id,
    request_sha256: event.request_sha256,
    request_revision: event.request_revision,
    state: event.next_state,
    current_event_sha256: event.event_sha256,
    accepted_projection_sha256: event.accepted_projection_sha256 ?? previous?.accepted_projection_sha256 ?? null,
    materialized_work_package_ref: event.materialized_work_package_ref ?? previous?.materialized_work_package_ref ?? null,
    implementation_evidence_sha256: event.transition === 'implemented' ? event.evidence_sha256 : previous?.implementation_evidence_sha256 ?? null,
    integration_evidence_sha256: event.transition === 'integrated' ? event.evidence_sha256 : previous?.integration_evidence_sha256 ?? null,
    previous_current_digest: previous?.current_digest ?? null,
  });
  return Object.freeze({ ...basis, current_digest: canonicalMessageDigest(basis) });
}

export function validateInterfaceChangeCurrent(value: unknown): InterfaceChangeCurrentV1 {
  const input = record(value, 'interface change current');
  assertMessageExactKeys(input, ['protocol', 'kind', 'request_id', 'request_sha256', 'request_revision', 'state', 'current_event_sha256', 'accepted_projection_sha256', 'materialized_work_package_ref', 'implementation_evidence_sha256', 'integration_evidence_sha256', 'previous_current_digest', 'current_digest'], 'interface change current', invalid);
  if (input.protocol !== INTERFACE_CHANGE_PROTOCOL || input.kind !== INTERFACE_CHANGE_CURRENT_KIND) invalid('interface change current protocol or kind is invalid');
  assertMessageInteger(input.request_revision, 'request_revision', 1, invalid);
  const state = required(input.state, 'state') as InterfaceChangeState;
  if (!['proposed', 'under_review', 'accepted', 'rejected', 'implementing', 'implemented', 'integrated', 'cancelled'].includes(state)) invalid('interface current state is invalid');
  const basis = Object.freeze({
    protocol: INTERFACE_CHANGE_PROTOCOL,
    kind: INTERFACE_CHANGE_CURRENT_KIND,
    request_id: uuid(input.request_id, 'request_id'),
    request_sha256: sha(input.request_sha256, 'request_sha256'),
    request_revision: input.request_revision,
    state,
    current_event_sha256: sha(input.current_event_sha256, 'current_event_sha256'),
    accepted_projection_sha256: nullableSha(input.accepted_projection_sha256, 'accepted_projection_sha256'),
    materialized_work_package_ref: input.materialized_work_package_ref === null ? null : materializedRef(input.materialized_work_package_ref),
    implementation_evidence_sha256: nullableSha(input.implementation_evidence_sha256, 'implementation_evidence_sha256'),
    integration_evidence_sha256: nullableSha(input.integration_evidence_sha256, 'integration_evidence_sha256'),
    previous_current_digest: nullableSha(input.previous_current_digest, 'previous_current_digest'),
  });
  const built = Object.freeze({ ...basis, current_digest: canonicalMessageDigest(basis) });
  const acceptedStates: readonly InterfaceChangeState[] = ['accepted', 'implementing', 'implemented', 'integrated'];
  const materializedStates: readonly InterfaceChangeState[] = ['implementing', 'implemented', 'integrated'];
  const implementedStates: readonly InterfaceChangeState[] = ['implemented', 'integrated'];
  if (acceptedStates.includes(state) !== (basis.accepted_projection_sha256 !== null)) invalid('current accepted projection shape is invalid');
  if (materializedStates.includes(state) !== (basis.materialized_work_package_ref !== null)) invalid('current materialization shape is invalid');
  if (implementedStates.includes(state) !== (basis.implementation_evidence_sha256 !== null)) invalid('current implementation evidence shape is invalid');
  if ((state === 'integrated') !== (basis.integration_evidence_sha256 !== null)) invalid('current integration evidence shape is invalid');
  if (input.current_digest !== built.current_digest || canonicalMessageBytes(input) !== canonicalMessageBytes(built as unknown as RecordValue)) invalid('interface change current digest is stale');
  return built;
}

export const canonicalInterfaceChangeCurrentBytes = (value: InterfaceChangeCurrentV1): string => canonicalMessageBytes(validateInterfaceChangeCurrent(value) as unknown as RecordValue);
