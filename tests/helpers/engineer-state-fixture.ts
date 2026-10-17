import { createHash, randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  ENGINEER_BINDING_CURRENT_KIND,
  ENGINEER_BINDING_KIND,
  ENGINEER_PROFILE_PROTOCOL,
  buildEngineerBindingEvent,
  buildEngineerBindingCurrent,
  canonicalEngineerBindingCurrentBytes,
  canonicalEngineerBindingEventBytes,
  deriveEngineerTransitionId,
  engineerCurrentPayloadSha256,
  engineerOperationFingerprint,
  canonicalEngineerJson,
  engineerSha256,
  type EngineerBindingV1,
} from '../../src/core/engineers/profile-binding';
import {
  ENGINEER_PRINCIPAL_PROTOCOL,
  ENGINEER_PRINCIPAL_MAPPING_KIND,
  CLAIM_ACTOR_RECEIPT_KIND,
  canonicalClaimActorReceiptBytes,
  validateEngineerPrincipalMapping,
  validateClaimActorReceipt,
  type ClaimActorReceiptV1,
  type EngineerPrincipalMappingV1,
} from '../../src/core/engineers/principal-claim';
import { engineerBindingStoreRoot } from '../../src/effects/engineers/binding-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';

export interface SeedEngineerBindingInput {
  engineer_id: string; idempotency_key: string; provider: string; provider_thread_id: string;
  host_id: string; engineer_contract_revision: string; expected_current_digest: string | null;
  expected_binding_generation: number; expected_binding_id: string | null;
  expected_engineer_contract_revision: string; now?: () => string; binding_id?: () => string;
}

/** Seed an old event/current pair. Readers still validate its real canonical bytes. */
export function seedEngineerBinding(root: string, input: SeedEngineerBindingInput) {
  const transition = input.expected_binding_generation === 0 ? 'initialize' : 'replace';
  const now = input.now?.() ?? '2026-08-24T12:00:00.000Z';
  const binding: EngineerBindingV1 = {
    protocol: ENGINEER_PROFILE_PROTOCOL, kind: ENGINEER_BINDING_KIND,
    binding_id: input.binding_id?.() ?? randomUUID(), engineer_id: input.engineer_id,
    binding_generation: input.expected_binding_generation + 1, provider: input.provider,
    provider_thread_id: input.provider_thread_id, host_id: input.host_id,
    engineer_contract_revision: input.engineer_contract_revision, state: 'active',
    previous_binding_id: input.expected_binding_id, bound_at: now, retired_at: null,
  };
  const request = { engineer_id: input.engineer_id, idempotency_key: input.idempotency_key, transition,
    expected_current_digest: input.expected_current_digest, expected_binding_generation: input.expected_binding_generation,
    expected_binding_id: input.expected_binding_id, expected_engineer_contract_revision: input.expected_engineer_contract_revision,
    engineer_contract_revision: input.engineer_contract_revision, provider: input.provider,
    provider_thread_id: input.provider_thread_id, host_id: input.host_id } as const;
  const event = buildEngineerBindingEvent({
    transition_id: deriveEngineerTransitionId(input.engineer_id, input.idempotency_key),
    idempotency_key: input.idempotency_key, operation_fingerprint: engineerOperationFingerprint(request),
    engineer_id: input.engineer_id, transition, expected_current_digest: input.expected_current_digest,
    expected_binding_generation: input.expected_binding_generation, previous_binding_id: input.expected_binding_id,
    next_binding: binding, next_current_payload_sha256: engineerCurrentPayloadSha256({
      protocol: ENGINEER_PROFILE_PROTOCOL, kind: ENGINEER_BINDING_CURRENT_KIND,
      engineer_id: input.engineer_id, binding_generation: binding.binding_generation,
      state: binding.state, current_binding_id: binding.binding_id, engineer_contract_revision: input.engineer_contract_revision,
    }), created_at: now,
  });
  const current = buildEngineerBindingCurrent(event);
  const key = createHash('sha256').update(input.engineer_id).digest('hex');
  const dir = join(engineerBindingStoreRoot(root), key);
  mkdirSync(join(dir, 'events'), { recursive: true });
  writeFileSync(join(dir, 'events', `${event.transition_id.slice(7)}.json`), canonicalEngineerBindingEventBytes(event));
  writeFileSync(join(dir, 'current.json'), canonicalEngineerBindingCurrentBytes(current));
  return current;
}

export function seedClaimActorReceipt(root: string, receipt: ClaimActorReceiptV1): void {
  const dir = join(resolveGitCommonDirectory(root), 'repo-harness/engineers/v1/claim-actors', receipt.task_id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${receipt.claim_id}.json`), canonicalClaimActorReceiptBytes(receipt), { mode: 0o600 });
}

export function principalMappingFixture(input: {
  repository_id: string; authorization_id: string; binding: EngineerBindingV1; created_at: string;
}): EngineerPrincipalMappingV1 {
  const basis = { protocol: ENGINEER_PRINCIPAL_PROTOCOL, kind: ENGINEER_PRINCIPAL_MAPPING_KIND,
    repository_id: input.repository_id, authorization_id: input.authorization_id,
    engineer_id: input.binding.engineer_id, binding_id: input.binding.binding_id,
    binding_generation: input.binding.binding_generation, engineer_contract_revision: input.binding.engineer_contract_revision,
    state: 'active', created_at: input.created_at, revoked_at: null };
  return validateEngineerPrincipalMapping({ ...basis, mapping_digest: engineerSha256(canonicalEngineerJson(basis)) });
}

export function revokedPrincipalFixture(mapping: EngineerPrincipalMappingV1, revokedAt: string): EngineerPrincipalMappingV1 {
  const { mapping_digest: ignored, ...previous } = mapping;
  const basis = { ...previous, state: 'revoked', revoked_at: revokedAt };
  return validateEngineerPrincipalMapping({ ...basis, mapping_digest: engineerSha256(canonicalEngineerJson(basis)) });
}

/** Build canonical historical data for the retained receipt readers. */
export function claimActorReceiptFixture(input: {
  binding: EngineerBindingV1;
  envelope: { repo_id: string; task_id: string; task_revision: string; claim_id: string;
    generation: number; authorization_revision: number; worktree_path: string; branch: string; unit_ref: string };
  session_id: string | null;
  bound_at: string;
}): ClaimActorReceiptV1 {
  const { binding, envelope } = input;
  const basis = {
    protocol: ENGINEER_PRINCIPAL_PROTOCOL, kind: CLAIM_ACTOR_RECEIPT_KIND,
    task_id: envelope.task_id, task_revision: envelope.task_revision, claim_id: envelope.claim_id,
    lease_generation: envelope.generation, engineer_id: binding.engineer_id, binding_id: binding.binding_id,
    binding_generation: binding.binding_generation, repository_id: envelope.repo_id,
    authorization_revision: envelope.authorization_revision,
    work_envelope_sha256: engineerSha256(canonicalEngineerJson(envelope)),
    worktree_path: envelope.worktree_path, branch: envelope.branch, unit_ref: envelope.unit_ref,
    engineer_contract_revision: binding.engineer_contract_revision, session_id: input.session_id, bound_at: input.bound_at,
  };
  return validateClaimActorReceipt({ ...basis, receipt_sha256: engineerSha256(canonicalEngineerJson(basis)) });
}
