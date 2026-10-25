import {
  claimActorReceiptFixture,
  principalMappingFixture,
} from '../helpers/engineer-state-fixture';
import { describe, expect, test } from 'bun:test';

import {
  canonicalClaimActorReceiptBytes,
  EngineerPrincipalError,
  validateClaimActorReceipt,
  validateEngineerPrincipalMapping,
} from '../../src/core/engineers/principal-claim';
import { engineerSha256, type EngineerBindingV1 } from '../../src/core/engineers/profile-binding';

const engineerId = 'engineer:capability.verification.evals-checks';
const binding: EngineerBindingV1 = {
  protocol: 1,
  kind: 'repo-harness-engineer-binding',
  binding_id: '11111111-1111-4111-8111-111111111111',
  engineer_id: engineerId,
  binding_generation: 1,
  provider: 'codex',
  provider_thread_id: 'thread-1',
  host_id: 'local',
  engineer_contract_revision: engineerSha256('contract-v1'),
  state: 'active',
  previous_binding_id: null,
  bound_at: '2026-08-25T00:00:00.000Z',
  retired_at: null,
};

const authorizationId = '22222222-2222-4222-8222-222222222222';

function envelope() {
  return {
    protocol: 1 as const,
    kind: 'repo-harness-work-envelope' as const,
    repo_id: 'repo_0123456789abcdef',
    task_id: 'a'.repeat(64),
    task_revision: 'b'.repeat(64),
    sprint_path: 'plans/sprints/canary.sprint.md',
    claim_id: '33333333-3333-4333-8333-333333333333',
    generation: 2,
    worktree_path: '/tmp/canary-worktree',
    branch: 'codex/canary',
    unit_ref: 'plans/plan-canary.md',
    authorization_revision: 7,
    offer_revision: engineerSha256('offer-v1'),
    canonical_target: { ref: 'refs/heads/main', oid: 'c'.repeat(40) },
    plan: {
      plan_path: 'plans/plan-canary.md',
      contract_path: 'tasks/contracts/canary.contract.md',
      source_ref: 'refs/heads/main',
      plan_sha256: engineerSha256('plan'),
      contract_sha256: engineerSha256('contract'),
    },
    claim_token: {
      path: '.ai/harness/claim-token',
      claim_id: '33333333-3333-4333-8333-333333333333',
      task_id: 'a'.repeat(64),
      sprint: 'plans/sprints/canary.sprint.md',
      task: 'Canary task',
      unit_ref: 'plans/plan-canary.md',
    },
  };
}

describe('ME-0B principal and claim actor protocols', () => {
  test('mapping is exact-key canonical and digest protected', () => {
    const mapping = principalMappingFixture({
      repository_id: 'repo_0123456789abcdef',
      authorization_id: authorizationId,
      binding,
      created_at: '2026-08-25T00:01:00.000Z',
    });
    expect(validateEngineerPrincipalMapping(JSON.parse(JSON.stringify(mapping)))).toEqual(mapping);
    expect(() => validateEngineerPrincipalMapping({ ...mapping, extra: true })).toThrow(EngineerPrincipalError);
    expect(() => validateEngineerPrincipalMapping({ ...mapping, engineer_id: 'engineer:capability.other.module' })).toThrow('principal mapping digest is invalid');
  });

  test('historical receipt canonical round-trip detects tampering', () => {
    const work = envelope();
    const receipt = claimActorReceiptFixture({
      envelope: work,
      binding,
      session_id: null,
      bound_at: '2026-08-25T00:02:00.000Z',
    });
    expect(validateClaimActorReceipt(JSON.parse(canonicalClaimActorReceiptBytes(receipt)))).toEqual(receipt);
    expect(() => validateClaimActorReceipt({ ...receipt, branch: 'codex/other' })).toThrow('receipt digest is invalid');
  });

});
