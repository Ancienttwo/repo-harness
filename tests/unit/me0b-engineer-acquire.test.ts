import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { validateEngineerPrincipal } from '../../src/core/engineers/principal-claim';
import { engineerSha256 } from '../../src/core/engineers/profile-binding';
import { buildLeaseOwnerRecord, bindLeaseRecord } from '../../src/core/state/coordination-identity';
import { acquireEngineerTask, type EngineerAcquireDependencies } from '../../src/effects/engineers/acquire';
import { bindEngineer, readEngineerBindingStatus, retireEngineer, withEngineerBindingLock } from '../../src/effects/engineers/binding-store';
import type { WorkEnvelopeV1 } from '../../src/effects/fleet/acquire';
import { createLeaseDirectory, readLease, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';

const roots: string[] = [];
const repoId = 'repo_0123456789abcdef';

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-me0b-acquire-'));
  roots.push(root);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root });
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
  return root;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function principal() {
  return validateEngineerPrincipal({
    protocol: 1,
    kind: 'repo-harness-engineer-principal',
    repository_id: repoId,
    engineer_id: 'engineer:capability.verification.evals-checks',
    binding_id: '11111111-1111-4111-8111-111111111111',
    binding_generation: 1,
    engineer_contract_revision: engineerSha256('contract'),
    carrier: 'mcp_oauth',
    auth_subject: '22222222-2222-4222-8222-222222222222',
    provider: 'codex',
    provider_thread_id: 'thread-1',
  });
}

function envelope(root: string): WorkEnvelopeV1 {
  return {
    protocol: 1,
    kind: 'repo-harness-work-envelope',
    repo_id: repoId,
    task_id: 'a'.repeat(64),
    task_revision: 'b'.repeat(64),
    sprint_path: 'plans/sprints/canary.sprint.md',
    claim_id: '33333333-3333-4333-8333-333333333333',
    generation: 2,
    worktree_path: join(root, 'worktree'),
    branch: 'codex/canary',
    unit_ref: 'plans/plan-canary.md',
    authorization_revision: 7,
    offer_revision: engineerSha256('offer'),
    canonical_target: { ref: 'refs/heads/main', oid: 'c'.repeat(40) },
    plan: {
      plan_path: 'plans/plan-canary.md',
      contract_path: 'tasks/contracts/canary.contract.md',
      source_ref: 'refs/heads/main',
      plan_sha256: engineerSha256('plan'),
      contract_sha256: engineerSha256('contract'),
    },
    claim_token: { path: '.ai/harness/claim-token', claim_id: '33333333-3333-4333-8333-333333333333', task_id: 'a'.repeat(64), sprint: 'plans/sprints/canary.sprint.md', task: 'Canary', unit_ref: 'plans/plan-canary.md' },
  };
}

function dependencies(root: string, overrides: Partial<EngineerAcquireDependencies> = {}): Partial<EngineerAcquireDependencies> {
  const work = envelope(root);
  const actor = principal();
  return {
    acquire: () => ({ ok: true, envelope: work }),
    readRegistry: () => ({
      registryPath: join(root, 'repos.json'),
      authorizationRevision: 7,
      repos: [{ id: repoId, path: root, accessMode: 'read_write', source: 'manual', registeredAt: '2026-08-25T00:00:00.000Z', lastSeenAt: '2026-08-25T00:00:00.000Z' }],
    }),
    publish: (_cwd, receipt) => receipt,
    validateLive: (_cwd, receipt) => receipt,
    readLease: () => ({ record: { claim_id: work.claim_id, generation: work.generation } } as never),
    release: () => ({ exitCode: 0, stdout: '', stderr: '' }),
    readBinding: () => ({
      current: {
        state: 'active',
        current_binding_id: actor.binding_id,
        binding_generation: actor.binding_generation,
        engineer_contract_revision: actor.engineer_contract_revision,
      },
    } as never),
    withBindingLock: (_cwd, _engineerId, run) => run(),
    ...overrides,
  };
}

describe('ME-0B engineer acquire composition', () => {
  test('publishes and returns the receipt after canonical Fleet acquire', () => {
    const root = fixture();
    const result = acquireEngineerTask({ repo_root: root, principal: principal(), dependencies: dependencies(root), now: () => new Date('2026-08-25T00:00:00.000Z') });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.receipt.claim_id).toBe(result.envelope.claim_id);
  });

  test('receipt failure releases only the exact still-current own Claim', () => {
    const root = fixture();
    const released: string[] = [];
    const result = acquireEngineerTask({
      repo_root: root,
      principal: principal(),
      dependencies: dependencies(root, {
        publish: () => { throw new Error('disk full'); },
        release: (_repo, claimId) => { released.push(claimId); return { exitCode: 0, stdout: '', stderr: '' }; },
      }),
    });
    expect(result).toMatchObject({ ok: false, error: 'claim_actor_receipt_failed' });
    expect(released).toEqual(['33333333-3333-4333-8333-333333333333']);
  });

  test('receipt failure never releases a replaced Claim and reports compensation failure', () => {
    const root = fixture();
    let releases = 0;
    const foreign = acquireEngineerTask({
      repo_root: root,
      principal: principal(),
      dependencies: dependencies(root, {
        publish: () => { throw new Error('disk full'); },
        readLease: () => ({ record: { claim_id: '44444444-4444-4444-8444-444444444444', generation: 3 } } as never),
        release: () => { releases += 1; return { exitCode: 0, stdout: '', stderr: '' }; },
      }),
    });
    expect(foreign).toMatchObject({ ok: false, error: 'claim_actor_receipt_failed' });
    expect(releases).toBe(0);

    const rollbackFailed = acquireEngineerTask({
      repo_root: root,
      principal: principal(),
      dependencies: dependencies(root, {
        publish: () => { throw new Error('disk full'); },
        release: () => ({ exitCode: 1, stdout: '', stderr: 'release refused' }),
      }),
    });
    expect(rollbackFailed).toMatchObject({ ok: false, error: 'rollback_failed' });
  });

  test('rollback failure leaves a binding-linked Lease that blocks rotation without a receipt', () => {
    const root = fixture();
    const actor = principal();
    const active = bindEngineer(root, {
      engineer_id: actor.engineer_id,
      idempotency_key: 'bind',
      provider: actor.provider,
      provider_thread_id: actor.provider_thread_id!,
      host_id: 'local',
      engineer_contract_revision: actor.engineer_contract_revision,
      expected_current_digest: null,
      expected_binding_generation: 0,
      expected_binding_id: null,
      expected_engineer_contract_revision: actor.engineer_contract_revision,
      binding_id: () => actor.binding_id,
    });
    const work = envelope(root);
    const claimed = buildLeaseOwnerRecord({
      claimId: work.claim_id,
      taskId: work.task_id,
      taskRevision: work.task_revision,
      sprintPath: work.sprint_path,
      targetRef: 'main',
      generation: work.generation,
      sessionId: `engineer:${actor.binding_id}`,
      sourceWorktree: root,
    });
    const bound = bindLeaseRecord(claimed, {
      claimId: work.claim_id,
      executionWorktree: work.worktree_path,
      branch: work.branch,
      unitRef: work.unit_ref,
    });
    if (!bound.ok) throw new Error(bound.error);
    if (!createLeaseDirectory(root, work.task_id)) throw new Error('lease election failed');
    writeLeaseOwnerDurably(root, work.task_id, bound.record);

    const failed = acquireEngineerTask({
      repo_root: root,
      principal: actor,
      dependencies: dependencies(root, {
        publish: () => { throw new Error('disk full'); },
        readLease,
        readBinding: readEngineerBindingStatus,
        withBindingLock: withEngineerBindingLock,
        release: () => ({ exitCode: 1, stdout: '', stderr: 'release refused' }),
      }),
    });
    expect(failed).toMatchObject({ ok: false, error: 'rollback_failed' });
    expect(() => retireEngineer(root, {
      engineer_id: actor.engineer_id,
      idempotency_key: 'retire',
      expected_current_digest: active.current_digest,
      expected_binding_generation: active.binding_generation,
      expected_binding_id: active.current_binding_id!,
      expected_engineer_contract_revision: actor.engineer_contract_revision,
    })).toThrow('inspect/freeze the bound task');
  });

  test('holds the Binding lock and rejects a stale principal before Fleet mutation', () => {
    const root = fixture();
    const events: string[] = [];
    let acquires = 0;
    const result = acquireEngineerTask({
      repo_root: root,
      principal: principal(),
      dependencies: dependencies(root, {
        withBindingLock: (_cwd, _engineerId, run) => { events.push('lock'); const value = run(); events.push('unlock'); return value; },
        readBinding: () => ({ current: { state: 'retired' } } as never),
        acquire: () => { acquires += 1; return { ok: true, envelope: envelope(root) }; },
      }),
    });
    expect(result).toMatchObject({ ok: false, error: 'fleet_acquire_failed', message: 'authenticated Engineer Binding is not current' });
    expect(events).toEqual(['lock', 'unlock']);
    expect(acquires).toBe(0);
  });
});
