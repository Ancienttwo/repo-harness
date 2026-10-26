import {
  canonicalEngineerJson,
  engineerSha256,
  type EngineerBindingV1,
} from '../../src/core/engineers/profile-binding';
import {
  ENGINEER_PRINCIPAL_PROTOCOL,
  ENGINEER_PRINCIPAL_MAPPING_KIND,
  CLAIM_ACTOR_RECEIPT_KIND,
  validateEngineerPrincipalMapping,
  validateClaimActorReceipt,
  type ClaimActorReceiptV1,
  type EngineerPrincipalMappingV1,
} from '../../src/core/engineers/principal-claim';

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
