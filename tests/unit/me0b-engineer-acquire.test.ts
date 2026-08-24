import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { validateEngineerPrincipal } from '../../src/core/engineers/principal-claim';
import { engineerSha256 } from '../../src/core/engineers/profile-binding';
import { acquireEngineerTask, type EngineerAcquireDependencies } from '../../src/effects/engineers/acquire';
import type { WorkEnvelopeV1 } from '../../src/effects/fleet/acquire';

const roots: string[] = [];
const repoId = 'repo_0123456789abcdef';

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-me0b-acquire-'));
  roots.push(root);
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
});
