import {
  canonicalEngineerJson,
  engineerSha256,
  type EngineerBindingV1,
} from './profile-binding';

export const ENGINEER_PRINCIPAL_PROTOCOL = 1 as const;
export const ENGINEER_PRINCIPAL_KIND = 'repo-harness-engineer-principal' as const;
export const ENGINEER_PRINCIPAL_MAPPING_KIND = 'repo-harness-engineer-principal-mapping' as const;
export const CLAIM_ACTOR_RECEIPT_KIND = 'repo-harness-claim-actor-receipt' as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const TASK_ID = /^[0-9a-f]{64}$/;
const REPOSITORY_ID = /^repo_[0-9a-f]{16}$/;
const ENGINEER_ID = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/;
const OPAQUE = /^[^\u0000-\u001f\u007f]{1,512}$/;

export type EngineerObservedProvider = 'codex' | 'claude' | 'worker_host' | 'unknown' | 'codex-app-thread' | 'tmux-cli-agent';
export type EngineerPrincipalMappingState = 'active' | 'revoked';

export interface EngineerPrincipalMappingV1 {
  readonly protocol: typeof ENGINEER_PRINCIPAL_PROTOCOL;
  readonly kind: typeof ENGINEER_PRINCIPAL_MAPPING_KIND;
  readonly repository_id: string;
  readonly authorization_id: string;
  readonly engineer_id: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly engineer_contract_revision: string;
  readonly state: EngineerPrincipalMappingState;
  readonly created_at: string;
  readonly revoked_at: string | null;
  readonly mapping_digest: string;
}

export interface EngineerPrincipalV1 {
  readonly protocol: typeof ENGINEER_PRINCIPAL_PROTOCOL;
  readonly kind: typeof ENGINEER_PRINCIPAL_KIND;
  readonly repository_id: string;
  readonly engineer_id: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly engineer_contract_revision: string;
  readonly carrier: 'mcp_oauth';
  readonly auth_subject: string;
  readonly provider: EngineerObservedProvider;
  readonly provider_thread_id: string | null;
}

export interface ClaimActorReceiptV1 {
  readonly protocol: typeof ENGINEER_PRINCIPAL_PROTOCOL;
  readonly kind: typeof CLAIM_ACTOR_RECEIPT_KIND;
  readonly task_id: string;
  readonly task_revision: string;
  readonly claim_id: string;
  readonly lease_generation: number;
  readonly engineer_id: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly repository_id: string;
  readonly authorization_revision: number;
  readonly work_envelope_sha256: string;
  readonly worktree_path: string;
  readonly branch: string;
  readonly unit_ref: string;
  readonly engineer_contract_revision: string;
  readonly session_id: string | null;
  readonly bound_at: string;
  readonly receipt_sha256: string;
}

export interface ClaimActorEnvelope {
  readonly repo_id: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly claim_id: string;
  readonly generation: number;
  readonly worktree_path: string;
  readonly branch: string;
  readonly unit_ref: string;
  readonly authorization_revision: number;
}

export type EngineerPrincipalErrorCode =
  | 'engineer_principal_invalid'
  | 'engineer_principal_unmapped'
  | 'engineer_principal_revoked'
  | 'engineer_principal_stale'
  | 'engineer_principal_mismatch'
  | 'engineer_principal_store_corrupt'
  | 'claim_actor_receipt_invalid'
  | 'claim_actor_receipt_conflict';

export class EngineerPrincipalError extends Error {
  constructor(readonly code: EngineerPrincipalErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'EngineerPrincipalError';
  }
}

type RecordValue = Record<string, unknown>;

function record(value: unknown, label: string, code: EngineerPrincipalErrorCode): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EngineerPrincipalError(code, `${label} must be an object`);
  return value as RecordValue;
}

function exact(value: RecordValue, keys: readonly string[], label: string, code: EngineerPrincipalErrorCode): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new EngineerPrincipalError(code, `${label} keys are invalid`);
  }
}

function string(value: unknown, label: string, pattern: RegExp, code: EngineerPrincipalErrorCode): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new EngineerPrincipalError(code, `${label} is invalid`);
  return value;
}

function integer(value: unknown, label: string, minimum: number, code: EngineerPrincipalErrorCode): number {
  if (!Number.isInteger(value) || (value as number) < minimum) throw new EngineerPrincipalError(code, `${label} is invalid`);
  return value as number;
}

function timestamp(value: unknown, label: string, code: EngineerPrincipalErrorCode): string {
  const result = string(value, label, OPAQUE, code);
  if (!Number.isFinite(Date.parse(result))) throw new EngineerPrincipalError(code, `${label} is invalid`);
  return result;
}

function nullableOpaque(value: unknown, label: string, code: EngineerPrincipalErrorCode): string | null {
  return value === null ? null : string(value, label, OPAQUE, code);
}

function mappingBasis(value: Omit<EngineerPrincipalMappingV1, 'mapping_digest'>): object {
  return value;
}

export function buildEngineerPrincipalMapping(input: {
  repository_id: string;
  authorization_id: string;
  binding: EngineerBindingV1;
  created_at: string;
}): EngineerPrincipalMappingV1 {
  const basis = {
    protocol: ENGINEER_PRINCIPAL_PROTOCOL,
    kind: ENGINEER_PRINCIPAL_MAPPING_KIND,
    repository_id: input.repository_id,
    authorization_id: input.authorization_id,
    engineer_id: input.binding.engineer_id,
    binding_id: input.binding.binding_id,
    binding_generation: input.binding.binding_generation,
    engineer_contract_revision: input.binding.engineer_contract_revision,
    state: 'active' as const,
    created_at: input.created_at,
    revoked_at: null,
  };
  return validateEngineerPrincipalMapping({ ...basis, mapping_digest: engineerSha256(canonicalEngineerJson(mappingBasis(basis))) });
}

export function revokeEngineerPrincipalMapping(mapping: EngineerPrincipalMappingV1, revokedAt: string): EngineerPrincipalMappingV1 {
  const current = validateEngineerPrincipalMapping(mapping);
  if (current.state === 'revoked') return current;
  const basis = { ...current, state: 'revoked' as const, revoked_at: revokedAt, mapping_digest: undefined };
  const { mapping_digest: _ignored, ...withoutDigest } = basis;
  return validateEngineerPrincipalMapping({ ...withoutDigest, mapping_digest: engineerSha256(canonicalEngineerJson(withoutDigest)) });
}

export function validateEngineerPrincipalMapping(value: unknown): EngineerPrincipalMappingV1 {
  const code: EngineerPrincipalErrorCode = 'engineer_principal_invalid';
  const input = record(value, 'principal mapping', code);
  exact(input, ['protocol', 'kind', 'repository_id', 'authorization_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision', 'state', 'created_at', 'revoked_at', 'mapping_digest'], 'principal mapping', code);
  if (input.protocol !== ENGINEER_PRINCIPAL_PROTOCOL || input.kind !== ENGINEER_PRINCIPAL_MAPPING_KIND) throw new EngineerPrincipalError(code, 'principal mapping protocol or kind is invalid');
  const repositoryId = string(input.repository_id, 'repository_id', REPOSITORY_ID, code);
  const authorizationId = string(input.authorization_id, 'authorization_id', UUID, code);
  const engineerId = string(input.engineer_id, 'engineer_id', ENGINEER_ID, code);
  const bindingId = string(input.binding_id, 'binding_id', UUID, code);
  const generation = integer(input.binding_generation, 'binding_generation', 1, code);
  const revision = string(input.engineer_contract_revision, 'engineer_contract_revision', DIGEST, code);
  const createdAt = timestamp(input.created_at, 'created_at', code);
  const revokedAt = input.revoked_at === null ? null : timestamp(input.revoked_at, 'revoked_at', code);
  if (input.state !== 'active' && input.state !== 'revoked') throw new EngineerPrincipalError(code, 'principal mapping state is invalid');
  if ((input.state === 'active') !== (revokedAt === null)) throw new EngineerPrincipalError(code, 'principal mapping state/revoked_at is invalid');
  const digest = string(input.mapping_digest, 'mapping_digest', DIGEST, code);
  const basis = { protocol: ENGINEER_PRINCIPAL_PROTOCOL, kind: ENGINEER_PRINCIPAL_MAPPING_KIND, repository_id: repositoryId, authorization_id: authorizationId, engineer_id: engineerId, binding_id: bindingId, binding_generation: generation, engineer_contract_revision: revision, state: input.state, created_at: createdAt, revoked_at: revokedAt } as const;
  if (digest !== engineerSha256(canonicalEngineerJson(mappingBasis(basis)))) throw new EngineerPrincipalError(code, 'principal mapping digest is invalid');
  return Object.freeze({ ...basis, mapping_digest: digest });
}

export function canonicalEngineerPrincipalMappingBytes(value: EngineerPrincipalMappingV1): string {
  return canonicalEngineerJson(validateEngineerPrincipalMapping(value));
}

export function validateEngineerPrincipal(value: unknown): EngineerPrincipalV1 {
  const code: EngineerPrincipalErrorCode = 'engineer_principal_invalid';
  const input = record(value, 'engineer principal', code);
  exact(input, ['protocol', 'kind', 'repository_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision', 'carrier', 'auth_subject', 'provider', 'provider_thread_id'], 'engineer principal', code);
  if (input.protocol !== 1 || input.kind !== ENGINEER_PRINCIPAL_KIND || input.carrier !== 'mcp_oauth') throw new EngineerPrincipalError(code, 'engineer principal protocol, kind, or carrier is invalid');
  if (!['codex', 'claude', 'worker_host', 'unknown', 'codex-app-thread', 'tmux-cli-agent'].includes(String(input.provider))) throw new EngineerPrincipalError(code, 'provider is invalid');
  return Object.freeze({
    protocol: 1,
    kind: ENGINEER_PRINCIPAL_KIND,
    repository_id: string(input.repository_id, 'repository_id', REPOSITORY_ID, code),
    engineer_id: string(input.engineer_id, 'engineer_id', ENGINEER_ID, code),
    binding_id: string(input.binding_id, 'binding_id', UUID, code),
    binding_generation: integer(input.binding_generation, 'binding_generation', 1, code),
    engineer_contract_revision: string(input.engineer_contract_revision, 'engineer_contract_revision', DIGEST, code),
    carrier: 'mcp_oauth',
    auth_subject: string(input.auth_subject, 'auth_subject', UUID, code),
    provider: input.provider as EngineerObservedProvider,
    provider_thread_id: nullableOpaque(input.provider_thread_id, 'provider_thread_id', code),
  });
}

export function workEnvelopeSha256(envelope: unknown): string {
  return engineerSha256(canonicalEngineerJson(envelope));
}

function receiptBasis(value: Omit<ClaimActorReceiptV1, 'receipt_sha256'>): object {
  return value;
}

export function buildClaimActorReceipt<TEnvelope extends ClaimActorEnvelope>(input: {
  envelope: TEnvelope;
  principal: EngineerPrincipalV1;
  session_id: string | null;
  bound_at: string;
}): ClaimActorReceiptV1 {
  const principal = validateEngineerPrincipal(input.principal);
  if (principal.repository_id !== input.envelope.repo_id) throw new EngineerPrincipalError('engineer_principal_mismatch', 'principal repository does not match WorkEnvelope');
  const basis = {
    protocol: ENGINEER_PRINCIPAL_PROTOCOL,
    kind: CLAIM_ACTOR_RECEIPT_KIND,
    task_id: input.envelope.task_id,
    task_revision: input.envelope.task_revision,
    claim_id: input.envelope.claim_id,
    lease_generation: input.envelope.generation,
    engineer_id: principal.engineer_id,
    binding_id: principal.binding_id,
    binding_generation: principal.binding_generation,
    repository_id: input.envelope.repo_id,
    authorization_revision: input.envelope.authorization_revision,
    work_envelope_sha256: workEnvelopeSha256(input.envelope),
    worktree_path: input.envelope.worktree_path,
    branch: input.envelope.branch,
    unit_ref: input.envelope.unit_ref,
    engineer_contract_revision: principal.engineer_contract_revision,
    session_id: input.session_id,
    bound_at: input.bound_at,
  };
  return validateClaimActorReceipt({ ...basis, receipt_sha256: engineerSha256(canonicalEngineerJson(receiptBasis(basis))) });
}

export function validateClaimActorReceipt(value: unknown): ClaimActorReceiptV1 {
  const code: EngineerPrincipalErrorCode = 'claim_actor_receipt_invalid';
  const input = record(value, 'claim actor receipt', code);
  const keys = ['protocol', 'kind', 'task_id', 'task_revision', 'claim_id', 'lease_generation', 'engineer_id', 'binding_id', 'binding_generation', 'repository_id', 'authorization_revision', 'work_envelope_sha256', 'worktree_path', 'branch', 'unit_ref', 'engineer_contract_revision', 'session_id', 'bound_at', 'receipt_sha256'];
  exact(input, keys, 'claim actor receipt', code);
  if (input.protocol !== 1 || input.kind !== CLAIM_ACTOR_RECEIPT_KIND) throw new EngineerPrincipalError(code, 'claim actor receipt protocol or kind is invalid');
  const basis = {
    protocol: ENGINEER_PRINCIPAL_PROTOCOL,
    kind: CLAIM_ACTOR_RECEIPT_KIND,
    task_id: string(input.task_id, 'task_id', TASK_ID, code),
    task_revision: string(input.task_revision, 'task_revision', TASK_ID, code),
    claim_id: string(input.claim_id, 'claim_id', UUID, code),
    lease_generation: integer(input.lease_generation, 'lease_generation', 1, code),
    engineer_id: string(input.engineer_id, 'engineer_id', ENGINEER_ID, code),
    binding_id: string(input.binding_id, 'binding_id', UUID, code),
    binding_generation: integer(input.binding_generation, 'binding_generation', 1, code),
    repository_id: string(input.repository_id, 'repository_id', REPOSITORY_ID, code),
    authorization_revision: integer(input.authorization_revision, 'authorization_revision', 0, code),
    work_envelope_sha256: string(input.work_envelope_sha256, 'work_envelope_sha256', DIGEST, code),
    worktree_path: string(input.worktree_path, 'worktree_path', OPAQUE, code),
    branch: string(input.branch, 'branch', OPAQUE, code),
    unit_ref: string(input.unit_ref, 'unit_ref', OPAQUE, code),
    engineer_contract_revision: string(input.engineer_contract_revision, 'engineer_contract_revision', DIGEST, code),
    session_id: nullableOpaque(input.session_id, 'session_id', code),
    bound_at: timestamp(input.bound_at, 'bound_at', code),
  };
  const digest = string(input.receipt_sha256, 'receipt_sha256', DIGEST, code);
  if (digest !== engineerSha256(canonicalEngineerJson(receiptBasis(basis)))) throw new EngineerPrincipalError(code, 'claim actor receipt digest is invalid');
  return Object.freeze({ ...basis, receipt_sha256: digest });
}

export function canonicalClaimActorReceiptBytes(value: ClaimActorReceiptV1): string {
  return canonicalEngineerJson(validateClaimActorReceipt(value));
}
