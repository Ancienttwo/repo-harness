import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildClaimActorReceipt, validateEngineerPrincipal } from '../../src/core/engineers/principal-claim';
import { EngineerProfileBindingError } from '../../src/core/engineers/profile-binding';
import { buildLeaseOwnerRecord, bindLeaseRecord } from '../../src/core/state/coordination-identity';
import { bindEngineer, readEngineerBindingStatus, retireEngineer } from '../../src/effects/engineers/binding-store';
import { publishClaimActorReceipt } from '../../src/effects/engineers/claim-actor-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { createLeaseDirectory, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';

const ENGINEER = 'engineer:capability.verification.evals-checks';
const BINDING = '11111111-1111-4111-8111-111111111111';
const AUTHORIZATION = '22222222-2222-4222-8222-222222222222';
const CLAIM = '33333333-3333-4333-8333-333333333333';
const TASK = 'a'.repeat(64);
const TASK_REVISION = 'b'.repeat(64);
const UNIT = 'plans/plan-canary.md';
const tempRoots: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

interface Fixture {
  readonly root: string;
  readonly revision: string;
  readonly active_digest: string;
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-me4a-'));
  tempRoots.push(root);
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'tests@example.invalid']);
  git(root, ['config', 'user.name', 'Tests']);
  mkdirSync(join(root, '.archcontext/model'), { recursive: true });
  mkdirSync(join(root, 'agents'), { recursive: true });
  mkdirSync(join(root, 'plans'), { recursive: true });
  cpSync(join(process.cwd(), '.archcontext/model/nodes'), join(root, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(process.cwd(), '.archcontext/manifest.yaml'), join(root, '.archcontext/manifest.yaml'));
  cpSync(join(process.cwd(), 'agents/engineers'), join(root, 'agents/engineers'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), '.ai/harness/checks/\n.ai/harness/evidence/\n.ai/harness/runs/\n');
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'fixture']);

  const profile = loadEngineerProfile(root, ENGINEER);
  const active = bindEngineer(root, {
    engineer_id: ENGINEER,
    idempotency_key: 'bind',
    provider: 'codex',
    provider_thread_id: 'thread',
    host_id: 'local',
    engineer_contract_revision: profile.engineer_contract_revision,
    expected_current_digest: null,
    expected_binding_generation: 0,
    expected_binding_id: null,
    expected_engineer_contract_revision: profile.engineer_contract_revision,
    binding_id: () => BINDING,
    now: () => '2026-08-26T00:00:00.000Z',
  });

  const claimed = buildLeaseOwnerRecord({
    claimId: CLAIM,
    taskId: TASK,
    taskRevision: TASK_REVISION,
    sprintPath: 'plans/sprints/canary.sprint.md',
    targetRef: 'main',
    generation: 1,
    sessionId: 'session',
    sourceWorktree: root,
  });
  const bound = bindLeaseRecord(claimed, {
    claimId: CLAIM,
    executionWorktree: realpathSync(root),
    branch: 'main',
    unitRef: UNIT,
  });
  if (!bound.ok) throw new Error(bound.error);
  if (!createLeaseDirectory(root, TASK)) throw new Error('lease election failed');
  writeLeaseOwnerDurably(root, TASK, bound.record);

  const envelope = {
    protocol: 1 as const,
    kind: 'repo-harness-work-envelope' as const,
    repo_id: 'repo_0123456789abcdef',
    task_id: TASK,
    task_revision: TASK_REVISION,
    sprint_path: 'plans/sprints/canary.sprint.md',
    claim_id: CLAIM,
    generation: 1,
    worktree_path: realpathSync(root),
    branch: 'main',
    unit_ref: UNIT,
    authorization_revision: 1,
    offer_revision: `sha256:${'c'.repeat(64)}`,
    canonical_target: { ref: 'main', oid: git(root, ['rev-parse', 'HEAD']) },
    plan: {
      plan_path: UNIT,
      contract_path: 'tasks/contracts/canary.contract.md',
      source_ref: 'main',
      plan_sha256: `sha256:${'d'.repeat(64)}`,
      contract_sha256: `sha256:${'e'.repeat(64)}`,
    },
    claim_token: { path: '.ai/harness/claim-token', claim_id: CLAIM, task_id: TASK, sprint: 'plans/sprints/canary.sprint.md', task: 'canary', unit_ref: UNIT },
  };
  const principal = validateEngineerPrincipal({
    protocol: 1,
    kind: 'repo-harness-engineer-principal',
    repository_id: envelope.repo_id,
    engineer_id: ENGINEER,
    binding_id: BINDING,
    binding_generation: 1,
    engineer_contract_revision: profile.engineer_contract_revision,
    carrier: 'mcp_oauth',
    auth_subject: AUTHORIZATION,
    provider: 'codex',
    provider_thread_id: 'thread',
  });
  publishClaimActorReceipt(root, buildClaimActorReceipt({
    envelope,
    principal,
    session_id: 'session',
    bound_at: '2026-08-26T00:01:00.000Z',
  }));
  return { root, revision: profile.engineer_contract_revision, active_digest: active.current_digest };
}

afterEach(() => {
  while (tempRoots.length > 0) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe('bound task rotation guard', () => {
  test('active Claim blocks retirement without changing the Binding', () => {
    const subject = fixture();
    const before = readEngineerBindingStatus(subject.root, ENGINEER, subject.revision).current;
    let refusal: unknown;
    try {
      retireEngineer(subject.root, {
        engineer_id: ENGINEER,
        idempotency_key: 'retire',
        expected_current_digest: subject.active_digest,
        expected_binding_generation: 1,
        expected_binding_id: BINDING,
        expected_engineer_contract_revision: subject.revision,
      });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(EngineerProfileBindingError);
    expect(refusal).toMatchObject({ code: 'bound_task_active' });
    expect((refusal as Error).message).toContain('release it explicitly');
    expect(readEngineerBindingStatus(subject.root, ENGINEER, subject.revision).current).toEqual(before);
  });

  test('an unknown Lease blocks retirement without changing the Binding', () => {
    const subject = fixture();
    const before = readEngineerBindingStatus(subject.root, ENGINEER, subject.revision).current;
    const unknownTask = 'c'.repeat(64);
    expect(createLeaseDirectory(subject.root, unknownTask)).toBe(true);
    let refusal: unknown;
    try {
      retireEngineer(subject.root, {
        engineer_id: ENGINEER,
        idempotency_key: 'retire-unknown-lease',
        expected_current_digest: subject.active_digest,
        expected_binding_generation: 1,
        expected_binding_id: BINDING,
        expected_engineer_contract_revision: subject.revision,
      });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(EngineerProfileBindingError);
    expect(refusal).toMatchObject({
      code: 'bound_task_lease_unavailable',
      message: `cannot prove binding rotation safe while Lease ${unknownTask} is unknown (owner_record_missing)`,
    });
    expect(readEngineerBindingStatus(subject.root, ENGINEER, subject.revision).current).toEqual(before);
  });
});
