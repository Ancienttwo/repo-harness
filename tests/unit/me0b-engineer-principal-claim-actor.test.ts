import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { lstatSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildClaimActorReceipt,
  buildEngineerPrincipalMapping,
  canonicalClaimActorReceiptBytes,
  canonicalEngineerPrincipalMappingBytes,
  EngineerPrincipalError,
  validateClaimActorReceipt,
  validateEngineerPrincipal,
  validateEngineerPrincipalMapping,
  workEnvelopeSha256,
} from '../../src/core/engineers/principal-claim';
import { engineerSha256, type EngineerBindingV1 } from '../../src/core/engineers/profile-binding';
import {
  listLiveClaimActorReceiptsForEngineer,
  publishClaimActorReceipt,
  readClaimActorReceipt,
  validateClaimActorReceiptLive,
} from '../../src/effects/engineers/claim-actor-store';

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

function principal() {
  return validateEngineerPrincipal({
    protocol: 1,
    kind: 'repo-harness-engineer-principal',
    repository_id: 'repo_0123456789abcdef',
    engineer_id: engineerId,
    binding_id: binding.binding_id,
    binding_generation: 1,
    engineer_contract_revision: binding.engineer_contract_revision,
    carrier: 'mcp_oauth',
    auth_subject: authorizationId,
    provider: 'codex',
    provider_thread_id: 'thread-1',
  });
}

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
    const mapping = buildEngineerPrincipalMapping({
      repository_id: 'repo_0123456789abcdef',
      authorization_id: authorizationId,
      binding,
      created_at: '2026-08-25T00:01:00.000Z',
    });
    expect(validateEngineerPrincipalMapping(JSON.parse(canonicalEngineerPrincipalMappingBytes(mapping)))).toEqual(mapping);
    expect(() => validateEngineerPrincipalMapping({ ...mapping, extra: true })).toThrow(EngineerPrincipalError);
    expect(() => validateEngineerPrincipalMapping({ ...mapping, engineer_id: 'engineer:capability.other.module' })).toThrow('principal mapping digest is invalid');
  });

  test('principal rejects payload-selected carrier and malformed identity', () => {
    const resolved = principal();
    expect(resolved.auth_subject).toBe(authorizationId);
    expect(() => validateEngineerPrincipal({ ...resolved, carrier: 'provider_thread' })).toThrow(EngineerPrincipalError);
    expect(() => validateEngineerPrincipal({ ...resolved, engineer_id: 'engineer:capability.invalid' })).toThrow(EngineerPrincipalError);
  });

  test('receipt binds the complete canonical WorkEnvelope digest and exact claim fields', () => {
    const work = envelope();
    const receipt = buildClaimActorReceipt({
      envelope: work,
      principal: principal(),
      session_id: null,
      bound_at: '2026-08-25T00:02:00.000Z',
    });
    expect(receipt).toMatchObject({
      task_id: work.task_id,
      task_revision: work.task_revision,
      claim_id: work.claim_id,
      lease_generation: work.generation,
      repository_id: work.repo_id,
      work_envelope_sha256: workEnvelopeSha256(work),
    });
    expect(validateClaimActorReceipt(JSON.parse(canonicalClaimActorReceiptBytes(receipt)))).toEqual(receipt);
    expect(workEnvelopeSha256({ b: 2, a: 1 })).toBe(workEnvelopeSha256({ a: 1, b: 2 }));
    expect(() => validateClaimActorReceipt({ ...receipt, branch: 'codex/other' })).toThrow('receipt digest is invalid');
  });

  test('receipt store is immutable, mode-0600, idempotent, and joined to the live Lease', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-me0b-receipt-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      const work = envelope();
      const receipt = buildClaimActorReceipt({ envelope: work, principal: principal(), session_id: null, bound_at: '2026-08-25T00:02:00.000Z' });
      expect(publishClaimActorReceipt(root, receipt)).toEqual(receipt);
      expect(publishClaimActorReceipt(root, receipt)).toEqual(receipt);
      expect(readClaimActorReceipt(root, work.task_id, work.claim_id)).toEqual(receipt);
      const path = join(root, '.git/repo-harness/engineers/v1/claim-actors', work.task_id, `${work.claim_id}.json`);
      expect(lstatSync(path).mode & 0o777).toBe(0o600);
      expect(validateClaimActorReceiptLive(root, receipt, work, () => ({
        record: {
          claim_id: work.claim_id,
          generation: work.generation,
          task_revision: work.task_revision,
          state: 'bound',
          execution_worktree: work.worktree_path,
          branch: work.branch,
          unit_ref: work.unit_ref,
        },
      } as never))).toEqual(receipt);
      const conflict = buildClaimActorReceipt({ envelope: work, principal: principal(), session_id: null, bound_at: '2026-08-25T00:03:00.000Z' });
      expect(() => publishClaimActorReceipt(root, conflict)).toThrow('already contains different bytes');
      expect(() => validateClaimActorReceiptLive(root, receipt, work, () => ({
        record: {
          claim_id: work.claim_id,
          generation: work.generation,
          task_revision: 'f'.repeat(64),
          state: 'bound',
          execution_worktree: work.worktree_path,
          branch: work.branch,
          unit_ref: work.unit_ref,
        },
      } as never))).toThrow('does not match live Lease');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('live receipt listing counts only the exact current Lease owner', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-me1a-live-receipts-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      const work = envelope();
      const receipt = buildClaimActorReceipt({ envelope: work, principal: principal(), session_id: null, bound_at: '2026-08-25T00:02:00.000Z' });
      publishClaimActorReceipt(root, receipt);
      const live = listLiveClaimActorReceiptsForEngineer(root, engineerId, () => ({
        record: {
          claim_id: work.claim_id,
          generation: work.generation,
          task_revision: work.task_revision,
          state: 'bound',
        },
      } as never));
      expect(live).toEqual([receipt]);
      expect(listLiveClaimActorReceiptsForEngineer(root, engineerId, () => ({
        record: {
          claim_id: work.claim_id,
          generation: work.generation,
          task_revision: work.task_revision,
          state: 'released',
        },
      } as never))).toEqual([]);
      expect(listLiveClaimActorReceiptsForEngineer(root, engineerId, () => ({
        record: {
          claim_id: '44444444-4444-4444-8444-444444444444',
          generation: work.generation + 1,
          task_revision: work.task_revision,
          state: 'bound',
        },
      } as never))).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
