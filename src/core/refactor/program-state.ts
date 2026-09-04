import {
  assertMessageExactKeys,
  assertMessageInteger,
  assertMessageSha256,
  assertMessageTimestamp,
  canonicalMessageBytes,
  canonicalMessageDigest,
  messageRequiredString,
} from '../messages/mechanics';

export const REFACTOR_PROGRAM_SCHEMA_VERSION = 'repo-harness.refactor-program/v1' as const;
export const REFACTOR_PROGRAM_EVENT_SCHEMA_VERSION = 'repo-harness.refactor-program-event/v1' as const;
export const REFACTOR_PROGRAM_CURRENT_SCHEMA_VERSION = 'repo-harness.refactor-program-current/v1' as const;

export const REFACTOR_PROGRAM_STATES = Object.freeze([
  'created', 'scanning', 'observed', 'authoring', 'assessed', 'routing', 'materializing',
  'planning', 'executing', 'verifying', 'merging', 'post_merge_measuring', 'resolving', 'complete',
  'proof_required', 'architecture_approval_required', 'stale', 'blocked', 'reconciliation_required', 'stopped',
] as const);
export type RefactorProgramState = (typeof REFACTOR_PROGRAM_STATES)[number];

export const REFACTOR_PROGRAM_OPERATIONS = Object.freeze([
  'create', 'begin_scan', 'observe', 'begin_authoring', 'assess', 'begin_route', 'begin_materialize',
  'begin_plan', 'begin_execute', 'begin_verify', 'begin_merge', 'begin_post_merge_measure', 'begin_resolve',
  'complete', 'require_proof', 'require_architecture_approval', 'mark_stale', 'block', 'require_reconciliation', 'stop',
] as const);
export type RefactorProgramOperation = (typeof REFACTOR_PROGRAM_OPERATIONS)[number];

export interface RefactorProgramDefinitionV1 {
  readonly schemaVersion: typeof REFACTOR_PROGRAM_SCHEMA_VERSION;
  readonly program_id: string;
  readonly authorization_id: string;
  readonly authorization_sha256: string;
  readonly repository_id: string;
  readonly target_ref: string;
  readonly target_revision: string;
  readonly base_main_sha: string;
  readonly created_at: string;
  readonly program_sha256: string;
}

export interface RefactorProgramEventV1 {
  readonly schemaVersion: typeof REFACTOR_PROGRAM_EVENT_SCHEMA_VERSION;
  readonly program_id: string;
  readonly revision: number;
  readonly idempotency_key: string;
  readonly operation: RefactorProgramOperation;
  readonly previous_state: RefactorProgramState | null;
  readonly next_state: RefactorProgramState;
  readonly evidence_refs: readonly string[];
  readonly observed_at: string;
  readonly previous_event_sha256: string | null;
  readonly event_sha256: string;
}

export interface RefactorProgramCurrentV1 {
  readonly schemaVersion: typeof REFACTOR_PROGRAM_CURRENT_SCHEMA_VERSION;
  readonly program_id: string;
  readonly program_sha256: string;
  readonly revision: number;
  readonly state: RefactorProgramState;
  readonly current_event_sha256: string;
  readonly current_sha256: string;
}

export class RefactorProgramError extends Error {
  constructor(readonly code: 'refactor_program_invalid' | 'refactor_program_transition_invalid', message: string) {
    super(message);
    this.name = 'RefactorProgramError';
  }
}

function invalid(message: string): never { throw new RefactorProgramError('refactor_program_invalid', message); }
function transitionInvalid(message: string): never { throw new RefactorProgramError('refactor_program_transition_invalid', message); }
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function opaque(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid);
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/u.test(result)) invalid(`${field} is invalid`);
  return result;
}
function gitRef(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid);
  if (!/^refs\/[a-zA-Z0-9][a-zA-Z0-9._/-]{0,158}$/u.test(result) || result.includes('..') || result.endsWith('/')) invalid(`${field} is invalid`);
  return result;
}
function sha(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid);
  assertMessageSha256(result, field, invalid);
  return result;
}
function authorityDigest(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid);
  if (!/^[0-9a-f]{64}$/u.test(result)) invalid(`${field} is invalid`);
  return result;
}
function gitObjectId(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(result)) invalid(`${field} is invalid`);
  return result;
}
function state(value: unknown, field: string): RefactorProgramState {
  if (!REFACTOR_PROGRAM_STATES.includes(value as RefactorProgramState)) invalid(`${field} is invalid`);
  return value as RefactorProgramState;
}

const TRANSITIONS: Readonly<Record<RefactorProgramOperation, readonly (RefactorProgramState | null)[]>> = Object.freeze({
  create: [null], begin_scan: ['created'], observe: ['scanning'], begin_authoring: ['observed'], assess: ['authoring'],
  begin_route: ['assessed'], begin_materialize: ['routing', 'architecture_approval_required'], begin_plan: ['materializing'], begin_execute: ['planning'],
  begin_verify: ['executing'], begin_merge: ['verifying'], begin_post_merge_measure: ['merging'], begin_resolve: ['post_merge_measuring'],
  complete: ['resolving'], require_proof: ['assessed', 'routing'], require_architecture_approval: ['assessed', 'routing'],
  mark_stale: REFACTOR_PROGRAM_STATES.filter((value) => !['complete', 'stopped'].includes(value)),
  block: REFACTOR_PROGRAM_STATES.filter((value) => !['complete', 'stopped'].includes(value)),
  require_reconciliation: REFACTOR_PROGRAM_STATES.filter((value) => !['complete', 'stopped'].includes(value)),
  stop: REFACTOR_PROGRAM_STATES.filter((value) => !['complete', 'stopped'].includes(value)),
});
const NEXT: Readonly<Record<RefactorProgramOperation, RefactorProgramState>> = Object.freeze({
  create: 'created', begin_scan: 'scanning', observe: 'observed', begin_authoring: 'authoring', assess: 'assessed',
  begin_route: 'routing', begin_materialize: 'materializing', begin_plan: 'planning', begin_execute: 'executing',
  begin_verify: 'verifying', begin_merge: 'merging', begin_post_merge_measure: 'post_merge_measuring', begin_resolve: 'resolving',
  complete: 'complete', require_proof: 'proof_required', require_architecture_approval: 'architecture_approval_required',
  mark_stale: 'stale', block: 'blocked', require_reconciliation: 'reconciliation_required', stop: 'stopped',
});

export function buildRefactorProgramDefinition(input: Omit<RefactorProgramDefinitionV1, 'schemaVersion' | 'program_sha256'>): RefactorProgramDefinitionV1 {
  const basis = {
    schemaVersion: REFACTOR_PROGRAM_SCHEMA_VERSION,
    program_id: opaque(input.program_id, 'program_id'), authorization_id: opaque(input.authorization_id, 'authorization_id'),
    authorization_sha256: authorityDigest(input.authorization_sha256, 'authorization_sha256'), repository_id: opaque(input.repository_id, 'repository_id'),
    target_ref: gitRef(input.target_ref, 'target_ref'), target_revision: gitObjectId(input.target_revision, 'target_revision'),
    base_main_sha: gitObjectId(input.base_main_sha, 'base_main_sha'), created_at: input.created_at,
  } as const;
  assertMessageTimestamp(basis.created_at, 'created_at', invalid);
  return Object.freeze({ ...basis, program_sha256: canonicalMessageDigest(basis) });
}

export function validateRefactorProgramDefinition(value: unknown): RefactorProgramDefinitionV1 {
  const input = record(value, 'refactor program');
  assertMessageExactKeys(input, ['schemaVersion', 'program_id', 'authorization_id', 'authorization_sha256', 'repository_id', 'target_ref', 'target_revision', 'base_main_sha', 'created_at', 'program_sha256'], 'refactor program', invalid);
  if (input.schemaVersion !== REFACTOR_PROGRAM_SCHEMA_VERSION) invalid('refactor program schemaVersion is unsupported');
  const built = buildRefactorProgramDefinition(input as unknown as Omit<RefactorProgramDefinitionV1, 'schemaVersion' | 'program_sha256'>);
  if (input.program_sha256 !== built.program_sha256) invalid('refactor program digest is stale');
  return built;
}

export function buildRefactorProgramEvent(input: Omit<RefactorProgramEventV1, 'schemaVersion' | 'next_state' | 'event_sha256'>): RefactorProgramEventV1 {
  if (!REFACTOR_PROGRAM_OPERATIONS.includes(input.operation)) invalid('operation is invalid');
  const previous = input.previous_state === null ? null : state(input.previous_state, 'previous_state');
  if (!TRANSITIONS[input.operation].includes(previous)) transitionInvalid(`${input.operation} cannot follow ${previous ?? 'empty'}`);
  assertMessageInteger(input.revision, 'revision', 1, invalid);
  assertMessageTimestamp(input.observed_at, 'observed_at', invalid);
  const evidence = [...input.evidence_refs].map((entry, index) => opaque(entry, `evidence_refs[${index}]`));
  const basis = {
    schemaVersion: REFACTOR_PROGRAM_EVENT_SCHEMA_VERSION,
    program_id: opaque(input.program_id, 'program_id'), revision: input.revision,
    idempotency_key: opaque(input.idempotency_key, 'idempotency_key'), operation: input.operation,
    previous_state: previous, next_state: NEXT[input.operation], evidence_refs: evidence,
    observed_at: input.observed_at,
    previous_event_sha256: input.previous_event_sha256 === null ? null : sha(input.previous_event_sha256, 'previous_event_sha256'),
  } as const;
  return Object.freeze({ ...basis, evidence_refs: Object.freeze(evidence), event_sha256: canonicalMessageDigest(basis) });
}

export function validateRefactorProgramEvent(value: unknown): RefactorProgramEventV1 {
  const input = record(value, 'refactor program event');
  assertMessageExactKeys(input, ['schemaVersion', 'program_id', 'revision', 'idempotency_key', 'operation', 'previous_state', 'next_state', 'evidence_refs', 'observed_at', 'previous_event_sha256', 'event_sha256'], 'refactor program event', invalid);
  if (input.schemaVersion !== REFACTOR_PROGRAM_EVENT_SCHEMA_VERSION || !Array.isArray(input.evidence_refs)) invalid('refactor program event shape is invalid');
  const built = buildRefactorProgramEvent(input as unknown as Omit<RefactorProgramEventV1, 'schemaVersion' | 'next_state' | 'event_sha256'>);
  if (input.next_state !== built.next_state || input.event_sha256 !== built.event_sha256) invalid('refactor program event derived fields are stale');
  return built;
}

export function foldRefactorProgramCurrent(program: RefactorProgramDefinitionV1, events: readonly RefactorProgramEventV1[]): RefactorProgramCurrentV1 {
  let previous: RefactorProgramEventV1 | null = null;
  for (const event of events) {
    if (event.program_id !== program.program_id || event.revision !== (previous?.revision ?? 0) + 1
      || event.previous_event_sha256 !== (previous?.event_sha256 ?? null)
      || event.previous_state !== (previous?.next_state ?? null)) transitionInvalid('refactor program event chain is not contiguous');
    if (previous && Date.parse(event.observed_at) < Date.parse(previous.observed_at)) transitionInvalid('refactor program event time moved backwards');
    previous = event;
  }
  if (!previous) transitionInvalid('refactor program has no events');
  const basis = { schemaVersion: REFACTOR_PROGRAM_CURRENT_SCHEMA_VERSION, program_id: program.program_id, program_sha256: program.program_sha256, revision: previous.revision, state: previous.next_state, current_event_sha256: previous.event_sha256 } as const;
  return Object.freeze({ ...basis, current_sha256: canonicalMessageDigest(basis) });
}

export function validateRefactorProgramCurrent(value: unknown): RefactorProgramCurrentV1 {
  const input = record(value, 'refactor program current');
  assertMessageExactKeys(input, ['schemaVersion', 'program_id', 'program_sha256', 'revision', 'state', 'current_event_sha256', 'current_sha256'], 'refactor program current', invalid);
  if (input.schemaVersion !== REFACTOR_PROGRAM_CURRENT_SCHEMA_VERSION) invalid('refactor program current schemaVersion is unsupported');
  assertMessageInteger(input.revision, 'revision', 1, invalid);
  const basis = {
    schemaVersion: REFACTOR_PROGRAM_CURRENT_SCHEMA_VERSION,
    program_id: opaque(input.program_id, 'program_id'),
    program_sha256: sha(input.program_sha256, 'program_sha256'),
    revision: input.revision as number,
    state: state(input.state, 'state'),
    current_event_sha256: sha(input.current_event_sha256, 'current_event_sha256'),
  } as const;
  const current = Object.freeze({ ...basis, current_sha256: canonicalMessageDigest(basis) });
  if (input.current_sha256 !== current.current_sha256) invalid('refactor program current digest is stale');
  return current;
}

export const canonicalRefactorProgramDefinitionBytes = (value: RefactorProgramDefinitionV1): string => canonicalMessageBytes(validateRefactorProgramDefinition(value) as unknown as Record<string, unknown>);
export const canonicalRefactorProgramEventBytes = (value: RefactorProgramEventV1): string => canonicalMessageBytes(validateRefactorProgramEvent(value) as unknown as Record<string, unknown>);
export const canonicalRefactorProgramCurrentBytes = (value: RefactorProgramCurrentV1): string => canonicalMessageBytes(validateRefactorProgramCurrent(value) as unknown as Record<string, unknown>);
