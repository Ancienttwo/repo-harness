import {
  assertMessageBoundedUtf8,
  assertMessageExactKeys,
  assertMessageInteger,
  assertMessageSha256,
  assertMessageUuid,
  canonicalMessageBytes,
  canonicalMessageDigest,
  messageRequiredString,
} from '../messages/mechanics';
import { validateWorkPackageDefinition, workPackageRevision, type WorkPackageDefinitionV1 } from './scheduling';

export const WORK_DEMAND_PROTOCOL = 1 as const;
export const WORK_DEMAND_KIND = 'repo-harness-work-demand' as const;
export const WORK_DEMAND_PROJECTION_KIND = 'repo-harness-accepted-work-demand-projection' as const;
export const WORK_DEMAND_EVENT_KIND = 'repo-harness-work-demand-event' as const;
export const WORK_DEMAND_CURRENT_KIND = 'repo-harness-work-demand-current' as const;

const REPOSITORY_ID = /^repo_[0-9a-f]{16}$/u;
const CAPABILITY_ID = /^capability\.[a-z0-9][a-z0-9.-]*$/u;
const ENGINEER_ID = /^engineer:capability\.[a-z0-9][a-z0-9.-]*$/u;
const SAFE_TOKEN = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const TASK_ID = /^[0-9a-f]{64}$/u;
const MAX_TEXT_BYTES = 16 * 1024;

type RecordValue = Record<string, unknown>;

export interface WorkDemandEngineerFenceV1 {
  readonly engineer_id: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly engineer_contract_revision: string;
}

export interface WorkDemandResourceRefV1 {
  readonly kind: 'file' | 'commit' | 'issue' | 'receipt';
  readonly ref: string;
  readonly sha256: string;
}

export type WorkDemandUrgency = 'low' | 'normal' | 'high' | 'urgent';

export interface WorkDemandV1 {
  readonly protocol: typeof WORK_DEMAND_PROTOCOL;
  readonly kind: typeof WORK_DEMAND_KIND;
  readonly repository_id: string;
  readonly demand_id: string;
  readonly idempotency_key: string;
  readonly source_engineer: WorkDemandEngineerFenceV1;
  readonly source_capability_id: string;
  readonly target_capability_id: string;
  readonly target_engineer_id: string | null;
  readonly problem: string;
  readonly desired_outcome: string;
  readonly contract_escape_reason: string;
  readonly resource_refs: readonly WorkDemandResourceRefV1[];
  readonly requested_urgency: WorkDemandUrgency;
  readonly dependency_hints: readonly string[];
  readonly created_at: string;
  readonly demand_sha256: string;
}

export interface AcceptedWorkDemandProjectionV1 {
  readonly protocol: typeof WORK_DEMAND_PROTOCOL;
  readonly kind: typeof WORK_DEMAND_PROJECTION_KIND;
  readonly demand_id: string;
  readonly demand_sha256: string;
  readonly accepted_from_current_digest: string;
  readonly sprint_path: string;
  readonly expected_sprint_commit: string;
  readonly expected_work_graph_revision: string | null;
  readonly task_id: string;
  readonly task_text: string;
  readonly task_mode: 'contract' | 'inline';
  readonly acceptance_text: string;
  readonly work_package: WorkPackageDefinitionV1;
  readonly work_package_revision: string;
  readonly planning_required: boolean;
  readonly projection_sha256: string;
}

export type WorkDemandState = 'proposed' | 'under_review' | 'accepted' | 'rejected' | 'cancelled' | 'materializing' | 'materialized' | 'integrated';
export type WorkDemandTransition = 'propose' | 'submit' | 'accept' | 'reject' | 'cancel' | 'begin_materialization' | 'materialize' | 'integrate';
export type WorkDemandActorV1 =
  | { readonly kind: 'engineer'; readonly principal: WorkDemandEngineerFenceV1 }
  | { readonly kind: 'human'; readonly principal_ref: string };

export interface MaterializedWorkDemandReceiptV1 {
  readonly protocol: typeof WORK_DEMAND_PROTOCOL;
  readonly kind: 'repo-harness-materialized-work-demand-receipt';
  readonly demand_id: string;
  readonly demand_sha256: string;
  readonly projection_sha256: string;
  readonly repository_id: string;
  readonly sprint_path: string;
  readonly task_id: string;
  readonly work_package_id: string;
  readonly work_package_revision: string;
  readonly materialized_commit: string;
  readonly receipt_sha256: string;
}

export interface WorkDemandEventV1 {
  readonly protocol: typeof WORK_DEMAND_PROTOCOL;
  readonly kind: typeof WORK_DEMAND_EVENT_KIND;
  readonly transition_id: string;
  readonly idempotency_key: string;
  readonly operation_fingerprint: string;
  readonly demand_id: string;
  readonly demand_sha256: string;
  readonly revision: number;
  readonly transition: WorkDemandTransition;
  readonly expected_current_digest: string | null;
  readonly actor: WorkDemandActorV1;
  readonly next_state: WorkDemandState;
  readonly accepted_projection: AcceptedWorkDemandProjectionV1 | null;
  readonly materialization_receipt: MaterializedWorkDemandReceiptV1 | null;
  readonly event_sha256: string;
}

export interface WorkDemandCurrentV1 {
  readonly protocol: typeof WORK_DEMAND_PROTOCOL;
  readonly kind: typeof WORK_DEMAND_CURRENT_KIND;
  readonly demand_id: string;
  readonly demand_sha256: string;
  readonly revision: number;
  readonly state: WorkDemandState;
  readonly current_event_sha256: string;
  readonly accepted_projection: AcceptedWorkDemandProjectionV1 | null;
  readonly materialization_receipt: MaterializedWorkDemandReceiptV1 | null;
  readonly previous_current_digest: string | null;
  readonly current_digest: string;
}

export class WorkDemandError extends Error {
  constructor(readonly code: 'work_demand_invalid' | 'work_demand_blocked' | 'work_demand_stale', message: string) {
    super(message); this.name = 'WorkDemandError';
  }
}

function invalid(message: string): never { throw new WorkDemandError('work_demand_invalid', message); }
function blocked(message: string): never { throw new WorkDemandError('work_demand_blocked', message); }
function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as RecordValue;
}
function required(value: unknown, field: string, pattern?: RegExp): string {
  const text = messageRequiredString(value, field, invalid);
  if (pattern && !pattern.test(text)) invalid(`${field} is invalid`);
  return text;
}
function bounded(value: unknown, field: string, maximum = MAX_TEXT_BYTES): string {
  const text = required(value, field); assertMessageBoundedUtf8(text, field, maximum, invalid); return text;
}
function sha(value: unknown, field: string): string { const text = required(value, field); assertMessageSha256(text, field, invalid); return text; }
function uuid(value: unknown, field: string): string { const text = required(value, field); assertMessageUuid(text, field, invalid); return text; }
function exact(value: RecordValue, keys: readonly string[], label: string): void { assertMessageExactKeys(value, keys, label, invalid); }

function engineerFence(value: unknown): WorkDemandEngineerFenceV1 {
  const input = record(value, 'source_engineer'); exact(input, ['engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision'], 'source_engineer');
  assertMessageInteger(input.binding_generation, 'source_engineer.binding_generation', 1, invalid);
  return Object.freeze({ engineer_id: required(input.engineer_id, 'source_engineer.engineer_id', ENGINEER_ID), binding_id: uuid(input.binding_id, 'source_engineer.binding_id'), binding_generation: input.binding_generation, engineer_contract_revision: sha(input.engineer_contract_revision, 'source_engineer.engineer_contract_revision') });
}

function resourceRef(value: unknown, index: number): WorkDemandResourceRefV1 {
  const input = record(value, `resource_refs[${index}]`); exact(input, ['kind', 'ref', 'sha256'], `resource_refs[${index}]`);
  if (!['file', 'commit', 'issue', 'receipt'].includes(String(input.kind))) invalid(`resource_refs[${index}].kind is invalid`);
  return Object.freeze({ kind: input.kind as WorkDemandResourceRefV1['kind'], ref: bounded(input.ref, `resource_refs[${index}].ref`, 2048), sha256: sha(input.sha256, `resource_refs[${index}].sha256`) });
}

function safePath(value: unknown, field: string): string {
  const text = bounded(value, field, 1024);
  if (!text.endsWith('.sprint.md') || text.startsWith('/') || text.startsWith('-') || text.includes('\\') || text.split('/').some((part) => part === '' || part === '.' || part === '..')) invalid(`${field} is unsafe`);
  return text;
}

function timestamp(value: unknown): string {
  const text = required(value, 'created_at');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(text) || Number.isNaN(Date.parse(text))) invalid('created_at is invalid');
  return text;
}

export function buildWorkDemand(input: Omit<WorkDemandV1, 'protocol' | 'kind' | 'demand_sha256'>): WorkDemandV1 {
  const source = engineerFence(input.source_engineer);
  const sourceCapability = required(input.source_capability_id, 'source_capability_id', CAPABILITY_ID);
  if (source.engineer_id !== `engineer:${sourceCapability}`) invalid('source Engineer does not own source capability');
  const targetCapability = required(input.target_capability_id, 'target_capability_id', CAPABILITY_ID);
  const targetEngineer = input.target_engineer_id === null ? null : required(input.target_engineer_id, 'target_engineer_id', ENGINEER_ID);
  if (targetEngineer !== null && targetEngineer !== `engineer:${targetCapability}`) invalid('target Engineer does not own target capability');
  if (!Array.isArray(input.resource_refs) || input.resource_refs.length > 64) invalid('resource_refs must be a bounded array');
  if (!Array.isArray(input.dependency_hints) || input.dependency_hints.length > 64) invalid('dependency_hints must be a bounded array');
  if (!['low', 'normal', 'high', 'urgent'].includes(input.requested_urgency)) invalid('requested_urgency is invalid');
  const basis = Object.freeze({ protocol: WORK_DEMAND_PROTOCOL, kind: WORK_DEMAND_KIND,
    repository_id: required(input.repository_id, 'repository_id', REPOSITORY_ID), demand_id: uuid(input.demand_id, 'demand_id'),
    idempotency_key: bounded(input.idempotency_key, 'idempotency_key', 512), source_engineer: source,
    source_capability_id: sourceCapability, target_capability_id: targetCapability, target_engineer_id: targetEngineer,
    problem: bounded(input.problem, 'problem'), desired_outcome: bounded(input.desired_outcome, 'desired_outcome'),
    contract_escape_reason: bounded(input.contract_escape_reason, 'contract_escape_reason'),
    resource_refs: Object.freeze(input.resource_refs.map(resourceRef)), requested_urgency: input.requested_urgency,
    dependency_hints: Object.freeze(input.dependency_hints.map((hint, index) => required(hint, `dependency_hints[${index}]`, SAFE_TOKEN))),
    created_at: timestamp(input.created_at) });
  return Object.freeze({ ...basis, demand_sha256: canonicalMessageDigest(basis) });
}

export function validateWorkDemand(value: unknown): WorkDemandV1 {
  const input = record(value, 'WorkDemand'); exact(input, ['protocol', 'kind', 'repository_id', 'demand_id', 'idempotency_key', 'source_engineer', 'source_capability_id', 'target_capability_id', 'target_engineer_id', 'problem', 'desired_outcome', 'contract_escape_reason', 'resource_refs', 'requested_urgency', 'dependency_hints', 'created_at', 'demand_sha256'], 'WorkDemand');
  if (input.protocol !== WORK_DEMAND_PROTOCOL || input.kind !== WORK_DEMAND_KIND) invalid('WorkDemand protocol or kind is invalid');
  const built = buildWorkDemand(input as unknown as Omit<WorkDemandV1, 'protocol' | 'kind' | 'demand_sha256'>);
  if (input.demand_sha256 !== built.demand_sha256 || canonicalMessageBytes(input) !== canonicalMessageBytes(built as unknown as RecordValue)) invalid('WorkDemand digest is stale');
  return built;
}

export function buildAcceptedWorkDemandProjection(input: Omit<AcceptedWorkDemandProjectionV1, 'protocol' | 'kind' | 'work_package_revision' | 'projection_sha256'>): AcceptedWorkDemandProjectionV1 {
  const workPackage = validateWorkPackageDefinition(input.work_package);
  if (workPackage.task_id !== input.task_id) invalid('Work Package task_id does not match accepted Task identity');
  const basis = Object.freeze({ protocol: WORK_DEMAND_PROTOCOL, kind: WORK_DEMAND_PROJECTION_KIND,
    demand_id: uuid(input.demand_id, 'demand_id'), demand_sha256: sha(input.demand_sha256, 'demand_sha256'), accepted_from_current_digest: sha(input.accepted_from_current_digest, 'accepted_from_current_digest'),
    sprint_path: safePath(input.sprint_path, 'sprint_path'), expected_sprint_commit: required(input.expected_sprint_commit, 'expected_sprint_commit', /^[0-9a-f]{40,64}$/u),
    expected_work_graph_revision: input.expected_work_graph_revision === null ? null : sha(input.expected_work_graph_revision, 'expected_work_graph_revision'),
    task_id: required(input.task_id, 'task_id', TASK_ID), task_text: bounded(input.task_text, 'task_text', 4096), task_mode: input.task_mode,
    acceptance_text: bounded(input.acceptance_text, 'acceptance_text', 4096), work_package: workPackage,
    work_package_revision: workPackageRevision(workPackage), planning_required: input.planning_required });
  if (basis.task_mode !== 'contract' && basis.task_mode !== 'inline') invalid('task_mode is invalid');
  if (typeof basis.planning_required !== 'boolean') invalid('planning_required must be boolean');
  return Object.freeze({ ...basis, projection_sha256: canonicalMessageDigest(basis) });
}

export function validateAcceptedWorkDemandProjection(value: unknown): AcceptedWorkDemandProjectionV1 {
  const input = record(value, 'accepted WorkDemand projection');
  exact(input, ['protocol', 'kind', 'demand_id', 'demand_sha256', 'accepted_from_current_digest', 'sprint_path', 'expected_sprint_commit', 'expected_work_graph_revision', 'task_id', 'task_text', 'task_mode', 'acceptance_text', 'work_package', 'work_package_revision', 'planning_required', 'projection_sha256'], 'accepted WorkDemand projection');
  if (input.protocol !== WORK_DEMAND_PROTOCOL || input.kind !== WORK_DEMAND_PROJECTION_KIND) invalid('accepted projection protocol or kind is invalid');
  const built = buildAcceptedWorkDemandProjection(input as unknown as Omit<AcceptedWorkDemandProjectionV1, 'protocol' | 'kind' | 'work_package_revision' | 'projection_sha256'>);
  if (input.work_package_revision !== built.work_package_revision || input.projection_sha256 !== built.projection_sha256
    || canonicalMessageBytes(input) !== canonicalMessageBytes(built as unknown as RecordValue)) invalid('accepted projection digest is stale');
  return built;
}

function sameFence(left: WorkDemandEngineerFenceV1, right: WorkDemandEngineerFenceV1): boolean { return canonicalMessageBytes(left as unknown as RecordValue) === canonicalMessageBytes(right as unknown as RecordValue); }

export function assertWorkDemandActor(demand: WorkDemandV1, transition: WorkDemandTransition, actor: WorkDemandActorV1): void {
  if (['propose', 'submit', 'cancel'].includes(transition)) {
    if (actor.kind === 'engineer' && sameFence(actor.principal, demand.source_engineer)) return;
    if (transition === 'cancel' && actor.kind === 'human') return;
    invalid(`${transition} requires the exact requester Engineer or allowed Human cancel actor`);
  }
  if (actor.kind !== 'human') invalid(`${transition} requires Human authority`);
}

export function nextWorkDemandState(previous: WorkDemandCurrentV1 | null, transition: WorkDemandTransition): WorkDemandState {
  if (previous === null) return transition === 'propose' ? 'proposed' : blocked('first WorkDemand transition must be propose');
  const states: Record<string, WorkDemandState> = {
    'proposed:submit': 'under_review', 'proposed:cancel': 'cancelled', 'under_review:accept': 'accepted',
    'under_review:reject': 'rejected', 'under_review:cancel': 'cancelled', 'accepted:begin_materialization': 'materializing',
    'materializing:materialize': 'materialized', 'materialized:integrate': 'integrated',
  };
  return states[`${previous.state}:${transition}`] ?? blocked(`transition ${transition} is invalid from ${previous.state}`);
}

export function buildMaterializedWorkDemandReceipt(input: Omit<MaterializedWorkDemandReceiptV1, 'protocol' | 'kind' | 'receipt_sha256'>): MaterializedWorkDemandReceiptV1 {
  const basis = Object.freeze({ protocol: WORK_DEMAND_PROTOCOL, kind: 'repo-harness-materialized-work-demand-receipt' as const,
    demand_id: uuid(input.demand_id, 'demand_id'), demand_sha256: sha(input.demand_sha256, 'demand_sha256'), projection_sha256: sha(input.projection_sha256, 'projection_sha256'),
    repository_id: required(input.repository_id, 'repository_id', REPOSITORY_ID), sprint_path: safePath(input.sprint_path, 'sprint_path'),
    task_id: required(input.task_id, 'task_id', TASK_ID), work_package_id: required(input.work_package_id, 'work_package_id', /^[a-z0-9][a-z0-9-]{0,127}$/u),
    work_package_revision: sha(input.work_package_revision, 'work_package_revision'), materialized_commit: required(input.materialized_commit, 'materialized_commit', /^[0-9a-f]{40,64}$/u) });
  return Object.freeze({ ...basis, receipt_sha256: canonicalMessageDigest(basis) });
}

export function validateMaterializedWorkDemandReceipt(value: unknown): MaterializedWorkDemandReceiptV1 {
  const input = record(value, 'materialized WorkDemand receipt');
  exact(input, ['protocol', 'kind', 'demand_id', 'demand_sha256', 'projection_sha256', 'repository_id', 'sprint_path', 'task_id', 'work_package_id', 'work_package_revision', 'materialized_commit', 'receipt_sha256'], 'materialized WorkDemand receipt');
  if (input.protocol !== WORK_DEMAND_PROTOCOL || input.kind !== 'repo-harness-materialized-work-demand-receipt') invalid('materialization receipt protocol or kind is invalid');
  const built = buildMaterializedWorkDemandReceipt(input as unknown as Omit<MaterializedWorkDemandReceiptV1, 'protocol' | 'kind' | 'receipt_sha256'>);
  if (input.receipt_sha256 !== built.receipt_sha256 || canonicalMessageBytes(input) !== canonicalMessageBytes(built as unknown as RecordValue)) invalid('materialization receipt digest is stale');
  return built;
}

function validateActor(value: unknown): WorkDemandActorV1 {
  const input = record(value, 'WorkDemand actor');
  if (input.kind === 'engineer') {
    exact(input, ['kind', 'principal'], 'WorkDemand actor');
    return Object.freeze({ kind: 'engineer', principal: engineerFence(input.principal) });
  }
  if (input.kind === 'human') {
    exact(input, ['kind', 'principal_ref'], 'WorkDemand actor');
    return Object.freeze({ kind: 'human', principal_ref: bounded(input.principal_ref, 'principal_ref', 512) });
  }
  return invalid('WorkDemand actor kind is invalid');
}

export interface BuildWorkDemandEventInput {
  readonly demand: WorkDemandV1;
  readonly previous: WorkDemandCurrentV1 | null;
  readonly idempotency_key: string;
  readonly transition: WorkDemandTransition;
  readonly expected_current_digest: string | null;
  readonly actor: WorkDemandActorV1;
  readonly accepted_projection: AcceptedWorkDemandProjectionV1 | null;
  readonly materialization_receipt: MaterializedWorkDemandReceiptV1 | null;
}

export function deriveWorkDemandTransitionId(demandId: string, idempotencyKey: string): string {
  return canonicalMessageDigest({ domain: 'repo-harness-work-demand-transition.v1', demand_id: uuid(demandId, 'demand_id'), idempotency_key: bounded(idempotencyKey, 'idempotency_key', 512) });
}

export function buildWorkDemandEvent(input: BuildWorkDemandEventInput): WorkDemandEventV1 {
  const demand = validateWorkDemand(input.demand);
  const previous = input.previous === null ? null : validateWorkDemandCurrent(input.previous);
  if ((previous?.current_digest ?? null) !== input.expected_current_digest) throw new WorkDemandError('work_demand_stale', 'expected WorkDemand current digest is stale');
  const actor = validateActor(input.actor); assertWorkDemandActor(demand, input.transition, actor);
  const next = nextWorkDemandState(previous, input.transition);
  const projection = input.accepted_projection === null ? null : validateAcceptedWorkDemandProjection(input.accepted_projection);
  const receipt = input.materialization_receipt === null ? null : validateMaterializedWorkDemandReceipt(input.materialization_receipt);
  if (input.transition === 'accept') {
    if (!projection || previous === null || projection.demand_id !== demand.demand_id || projection.demand_sha256 !== demand.demand_sha256 || projection.accepted_from_current_digest !== previous.current_digest) invalid('accept requires the exact immutable projection');
  } else if (projection !== null) invalid('only accept may carry an accepted projection');
  if (input.transition === 'materialize') {
    const accepted = previous?.accepted_projection;
    if (!receipt || !accepted || receipt.demand_id !== demand.demand_id || receipt.demand_sha256 !== demand.demand_sha256
      || receipt.projection_sha256 !== accepted.projection_sha256 || receipt.task_id !== accepted.task_id
      || receipt.work_package_id !== accepted.work_package.work_package_id || receipt.work_package_revision !== accepted.work_package_revision) invalid('materialize requires a receipt for the exact accepted projection');
  } else if (receipt !== null) invalid('only materialize may carry a materialization receipt');
  const idempotencyKey = bounded(input.idempotency_key, 'idempotency_key', 512);
  const operation = { demand_id: demand.demand_id, demand_sha256: demand.demand_sha256, transition: input.transition,
    expected_current_digest: input.expected_current_digest, actor, accepted_projection_sha256: projection?.projection_sha256 ?? null,
    materialization_receipt_sha256: receipt?.receipt_sha256 ?? null };
  const basis = Object.freeze({ protocol: WORK_DEMAND_PROTOCOL, kind: WORK_DEMAND_EVENT_KIND,
    transition_id: deriveWorkDemandTransitionId(demand.demand_id, idempotencyKey), idempotency_key: idempotencyKey,
    operation_fingerprint: canonicalMessageDigest(operation), demand_id: demand.demand_id, demand_sha256: demand.demand_sha256,
    revision: (previous?.revision ?? 0) + 1, transition: input.transition, expected_current_digest: input.expected_current_digest,
    actor, next_state: next, accepted_projection: projection, materialization_receipt: receipt });
  return Object.freeze({ ...basis, event_sha256: canonicalMessageDigest(basis) });
}

export function validateWorkDemandEvent(value: unknown): WorkDemandEventV1 {
  const input = record(value, 'WorkDemand event');
  exact(input, ['protocol', 'kind', 'transition_id', 'idempotency_key', 'operation_fingerprint', 'demand_id', 'demand_sha256', 'revision', 'transition', 'expected_current_digest', 'actor', 'next_state', 'accepted_projection', 'materialization_receipt', 'event_sha256'], 'WorkDemand event');
  if (input.protocol !== WORK_DEMAND_PROTOCOL || input.kind !== WORK_DEMAND_EVENT_KIND) invalid('WorkDemand event protocol or kind is invalid');
  assertMessageInteger(input.revision, 'revision', 1, invalid);
  const transition = required(input.transition, 'transition') as WorkDemandTransition;
  if (!['propose', 'submit', 'accept', 'reject', 'cancel', 'begin_materialization', 'materialize', 'integrate'].includes(transition)) invalid('WorkDemand transition is invalid');
  const nextState = required(input.next_state, 'next_state') as WorkDemandState;
  if (!['proposed', 'under_review', 'accepted', 'rejected', 'cancelled', 'materializing', 'materialized', 'integrated'].includes(nextState)) invalid('WorkDemand next state is invalid');
  const basis = Object.freeze({
    protocol: WORK_DEMAND_PROTOCOL, kind: WORK_DEMAND_EVENT_KIND,
    transition_id: sha(input.transition_id, 'transition_id'), idempotency_key: bounded(input.idempotency_key, 'idempotency_key', 512),
    operation_fingerprint: sha(input.operation_fingerprint, 'operation_fingerprint'), demand_id: uuid(input.demand_id, 'demand_id'),
    demand_sha256: sha(input.demand_sha256, 'demand_sha256'), revision: input.revision, transition,
    expected_current_digest: input.expected_current_digest === null ? null : sha(input.expected_current_digest, 'expected_current_digest'),
    actor: validateActor(input.actor), next_state: nextState,
    accepted_projection: input.accepted_projection === null ? null : validateAcceptedWorkDemandProjection(input.accepted_projection),
    materialization_receipt: input.materialization_receipt === null ? null : validateMaterializedWorkDemandReceipt(input.materialization_receipt),
  });
  const built = Object.freeze({ ...basis, event_sha256: canonicalMessageDigest(basis) });
  if (input.transition_id !== deriveWorkDemandTransitionId(built.demand_id, built.idempotency_key)
    || input.event_sha256 !== built.event_sha256
    || canonicalMessageBytes(input) !== canonicalMessageBytes(built as unknown as RecordValue)) invalid('WorkDemand event digest is stale');
  return built;
}

export function foldWorkDemandCurrent(previous: WorkDemandCurrentV1 | null, eventValue: WorkDemandEventV1): WorkDemandCurrentV1 {
  const event = eventValue;
  if ((previous?.current_digest ?? null) !== event.expected_current_digest || event.revision !== (previous?.revision ?? 0) + 1) invalid('WorkDemand event chain is discontinuous');
  const basis = Object.freeze({ protocol: WORK_DEMAND_PROTOCOL, kind: WORK_DEMAND_CURRENT_KIND, demand_id: event.demand_id,
    demand_sha256: event.demand_sha256, revision: event.revision, state: event.next_state, current_event_sha256: event.event_sha256,
    accepted_projection: event.accepted_projection ?? previous?.accepted_projection ?? null,
    materialization_receipt: event.materialization_receipt ?? previous?.materialization_receipt ?? null,
    previous_current_digest: previous?.current_digest ?? null });
  return Object.freeze({ ...basis, current_digest: canonicalMessageDigest(basis) });
}

export function validateWorkDemandCurrent(value: unknown): WorkDemandCurrentV1 {
  const input = record(value, 'WorkDemand current');
  exact(input, ['protocol', 'kind', 'demand_id', 'demand_sha256', 'revision', 'state', 'current_event_sha256', 'accepted_projection', 'materialization_receipt', 'previous_current_digest', 'current_digest'], 'WorkDemand current');
  if (input.protocol !== WORK_DEMAND_PROTOCOL || input.kind !== WORK_DEMAND_CURRENT_KIND) invalid('WorkDemand current protocol or kind is invalid');
  assertMessageInteger(input.revision, 'revision', 1, invalid);
  const state = required(input.state, 'state') as WorkDemandState;
  if (!['proposed', 'under_review', 'accepted', 'rejected', 'cancelled', 'materializing', 'materialized', 'integrated'].includes(state)) invalid('WorkDemand current state is invalid');
  const basis = Object.freeze({ protocol: WORK_DEMAND_PROTOCOL, kind: WORK_DEMAND_CURRENT_KIND, demand_id: uuid(input.demand_id, 'demand_id'),
    demand_sha256: sha(input.demand_sha256, 'demand_sha256'), revision: input.revision, state,
    current_event_sha256: sha(input.current_event_sha256, 'current_event_sha256'),
    accepted_projection: input.accepted_projection === null ? null : validateAcceptedWorkDemandProjection(input.accepted_projection),
    materialization_receipt: input.materialization_receipt === null ? null : validateMaterializedWorkDemandReceipt(input.materialization_receipt),
    previous_current_digest: input.previous_current_digest === null ? null : sha(input.previous_current_digest, 'previous_current_digest') });
  const built = Object.freeze({ ...basis, current_digest: canonicalMessageDigest(basis) });
  if (input.current_digest !== built.current_digest || canonicalMessageBytes(input) !== canonicalMessageBytes(built as unknown as RecordValue)) invalid('WorkDemand current digest is stale');
  return built;
}

export const canonicalWorkDemandBytes = (value: WorkDemandV1): string => canonicalMessageBytes(value as unknown as RecordValue);
export const canonicalWorkDemandProjectionBytes = (value: AcceptedWorkDemandProjectionV1): string => canonicalMessageBytes(value as unknown as RecordValue);
export const canonicalWorkDemandEventBytes = (value: WorkDemandEventV1): string => canonicalMessageBytes(value as unknown as RecordValue);
export const canonicalWorkDemandCurrentBytes = (value: WorkDemandCurrentV1): string => canonicalMessageBytes(value as unknown as RecordValue);
export const canonicalWorkDemandReceiptBytes = (value: MaterializedWorkDemandReceiptV1): string => canonicalMessageBytes(value as unknown as RecordValue);
