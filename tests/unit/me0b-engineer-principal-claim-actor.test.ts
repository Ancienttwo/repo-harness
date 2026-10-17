import { readFileSync, writeFileSync } from 'fs';
import {
  claimActorReceiptFixture,
  seedClaimActorReceipt,
  principalMappingFixture,
} from '../helpers/engineer-state-fixture';
import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  canonicalClaimActorReceiptBytes,
  EngineerPrincipalError,
  validateClaimActorReceipt,
  validateEngineerPrincipalMapping,
} from '../../src/core/engineers/principal-claim';
import { engineerSha256, type EngineerBindingV1 } from '../../src/core/engineers/profile-binding';
import {
  listLiveClaimActorReceiptsForEngineer,
  readClaimActorReceipt,
} from '../../src/effects/engineers/claim-actor-store';
import { createLeaseDirectory, readLease } from '../../src/effects/state/coordination-lease-store';

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

  test('receipt reads validate canonical historical bytes without rewriting them', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-me0b-receipt-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      const work = envelope();
      const receipt = claimActorReceiptFixture({ envelope: work, binding, session_id: null, bound_at: '2026-08-25T00:02:00.000Z' });
      seedClaimActorReceipt(root, receipt);
      const path = join(root, '.git/repo-harness/engineers/v1/claim-actors', work.task_id, `${work.claim_id}.json`);
      expect(readClaimActorReceipt(root, work.task_id, work.claim_id)).toEqual(receipt);
      writeFileSync(path, JSON.stringify({ ...receipt, branch: 'changed' }));
      const before = readFileSync(path, 'utf8');
      expect(() => readClaimActorReceipt(root, work.task_id, work.claim_id)).toThrow('claim actor receipt');
      expect(readFileSync(path, 'utf8')).toBe(before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('live receipt listing counts only the exact current Lease owner', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-me1a-live-receipts-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      const work = envelope();
      const receipt = claimActorReceiptFixture({ envelope: work, binding, session_id: null, bound_at: '2026-08-25T00:02:00.000Z' });
      seedClaimActorReceipt(root, receipt);
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

  test('live receipt listing refuses a known actor whose Lease is unknown', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-me1a-unknown-receipt-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      const work = envelope();
      seedClaimActorReceipt(root, claimActorReceiptFixture({ envelope: work, binding, session_id: null, bound_at: '2026-08-25T00:02:00.000Z' }));
      // A lease directory without an owner record is the real unknown state.
      expect(createLeaseDirectory(root, work.task_id)).toBeTrue();
      expect(readLease(root, work.task_id)).toMatchObject({ classification: 'unknown', record: null });
      // The unavailable Lease state is named, so the operator repairs the
      // Lease instead of the valid receipt store.
      const refusal = (() => {
        try { listLiveClaimActorReceiptsForEngineer(root, engineerId); return null; }
        catch (error) { return error as EngineerPrincipalError; }
      })();
      expect(refusal).toBeInstanceOf(EngineerPrincipalError);
      expect(refusal?.code).toBe('claim_actor_lease_unavailable');
      expect(refusal?.message).toContain('Lease is unknown');
      // Another Engineer's receipts never read this Engineer's Lease state.
      expect(listLiveClaimActorReceiptsForEngineer(root, 'engineer:capability.workflow-engine.contract-assets')).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
