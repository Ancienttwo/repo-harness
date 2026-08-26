import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  TaskFreezeError,
  buildTaskFreezeReceipt,
  canonicalTaskFreezeReceiptBytes,
  validateTaskFreezeReceipt,
} from '../../src/core/engineers/task-freeze';
import { buildClaimActorReceipt, validateEngineerPrincipal } from '../../src/core/engineers/principal-claim';
import { buildLeaseOwnerRecord, bindLeaseRecord } from '../../src/core/state/coordination-identity';
import { bindEngineer, engineerBindingStoreRoot, readEngineerBindingStatus, retireEngineer } from '../../src/effects/engineers/binding-store';
import { publishClaimActorReceipt } from '../../src/effects/engineers/claim-actor-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import {
  createTaskFreeze,
  inspectBoundTask,
  verifyTaskFreeze,
} from '../../src/effects/engineers/task-freeze-store';
import { createLeaseDirectory, leaseOwnerPath, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { buildEngineerCommand } from '../../src/cli/commands/engineer';
import { buildReviewSubject } from '../../src/effects/review/diff-fingerprint';

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
  readonly lease_path: string;
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
  mkdirSync(join(root, 'tasks/contracts'), { recursive: true });
  mkdirSync(join(root, 'tasks/notes'), { recursive: true });
  mkdirSync(join(root, '.ai/harness/checks'), { recursive: true });
  mkdirSync(join(root, '.ai/harness/handoff'), { recursive: true });
  cpSync(join(process.cwd(), '.archcontext/model/nodes'), join(root, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(process.cwd(), 'agents/engineers'), join(root, 'agents/engineers'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), '.ai/harness/checks/\n');
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  writeFileSync(join(root, UNIT), '# Plan: canary\n');
  writeFileSync(join(root, 'tasks/contracts/canary.contract.md'), '# Contract: canary\n');
  writeFileSync(join(root, 'tasks/notes/canary.notes.md'), '# Notes\n\n## Open Questions\n\n- None.\n\n## Evidence Links\n');
  writeFileSync(join(root, '.ai/harness/policy.json'), `${JSON.stringify({ worktree_strategy: { review_base: 'main' } })}\n`);
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
  writeFileSync(join(root, '.ai/harness/handoff/work-envelope.json'), `${JSON.stringify(envelope)}\n`);
  git(root, ['add', '.ai/harness/handoff/work-envelope.json']);
  git(root, ['commit', '-qm', 'persist exact work envelope']);
  const reviewSubject = buildReviewSubject(root, { targetRef: 'main' });
  if (reviewSubject.status !== 'ok') throw new Error(reviewSubject.reason);
  writeFileSync(join(root, '.ai/harness/checks/latest.json'), `${JSON.stringify({
    status: 'pass',
    contract: { file: 'tasks/contracts/canary.contract.md' },
    review_subject_sha256: reviewSubject.review_subject_sha256,
    change_assessment: {
      assessment: {
        review_subject_sha256: reviewSubject.review_subject_sha256,
        target_ref: reviewSubject.target_ref,
        target_revision: reviewSubject.target_rev,
      },
    },
  })}\n`);
  publishClaimActorReceipt(root, buildClaimActorReceipt({
    envelope,
    principal,
    session_id: 'session',
    bound_at: '2026-08-26T00:01:00.000Z',
  }));
  return { root, revision: profile.engineer_contract_revision, active_digest: active.current_digest, lease_path: leaseOwnerPath(root, TASK) };
}

afterEach(() => {
  while (tempRoots.length > 0) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe('ME-4A bound task freeze and handoff refusal', () => {
  test('receipt schema is exact-key canonical and digest protected', () => {
    const receipt = buildTaskFreezeReceipt({
      task: { task_id: TASK, task_revision: TASK_REVISION, claim_id: CLAIM, lease_generation: 1 },
      engineer_id: ENGINEER,
      binding_id: BINDING,
      binding_generation: 1,
      binding_current_sha256: `sha256:${'5'.repeat(64)}`,
      claim_actor_receipt_sha256: `sha256:${'6'.repeat(64)}`,
      work_envelope_sha256: `sha256:${'7'.repeat(64)}`,
      work_envelope_bytes_sha256: `sha256:${'a'.repeat(64)}`,
      lease_state_sha256: `sha256:${'8'.repeat(64)}`,
      worktree: '/tmp/worktree',
      worktree_topology_sha256: `sha256:${'9'.repeat(64)}`,
      branch: 'main',
      unit_ref: UNIT,
      head_sha: 'a'.repeat(40),
      tree_sha: 'b'.repeat(40),
      diff_sha256: `sha256:${'1'.repeat(64)}`,
      untracked_inventory_sha256: `sha256:${'2'.repeat(64)}`,
      checks_state_sha256: `sha256:${'3'.repeat(64)}`,
      unverified_hypotheses_sha256: `sha256:${'4'.repeat(64)}`,
      writer_grant_id: null,
      writer_grant_sha256: null,
      observed_at: '2026-08-26T00:00:00.000Z',
    });
    expect(validateTaskFreezeReceipt(JSON.parse(canonicalTaskFreezeReceiptBytes(receipt)))).toEqual(receipt);
    expect(() => validateTaskFreezeReceipt({ ...receipt, extra: true })).toThrow('keys are invalid');
    expect(() => validateTaskFreezeReceipt({ ...receipt, branch: 'other' })).toThrow('receipt_sha256 is invalid');
  });

  test('double-read classifies clean and dirty state without changing Lease or Binding bytes', () => {
    const subject = fixture();
    const leaseBefore = readFileSync(subject.lease_path, 'utf8');
    const bindingRoot = engineerBindingStoreRoot(subject.root);
    const bindingBefore = readEngineerBindingStatus(subject.root, ENGINEER, subject.revision).current;
    const clean = inspectBoundTask(subject.root, ENGINEER, { now: () => '2026-08-26T00:02:00.000Z' });
    expect(clean.disposition).toBe('clean_release_allowed');
    expect(clean.reasons).toEqual([]);
    expect(clean.untracked_inventory_is_content_carrier).toBe(false);

    writeFileSync(join(subject.root, 'README.md'), 'dirty\n');
    writeFileSync(join(subject.root, 'untracked.txt'), 'secret bytes are never carried\n');
    writeFileSync(join(subject.root, '.ai/harness/checks/latest.json'), '{"status":"fail"}\n');
    writeFileSync(join(subject.root, 'tasks/notes/canary.notes.md'), '# Notes\n\n## Open Questions\n\n- hypothesis\n');
    const dirty = inspectBoundTask(subject.root, ENGINEER, {
      now: () => '2026-08-26T00:03:00.000Z',
      read_writer_grant: () => ({ grant_id: '44444444-4444-4444-8444-444444444444', grant_sha256: `sha256:${'f'.repeat(64)}` }),
    });
    expect(dirty.disposition).toBe('freeze_required');
    expect(dirty.reasons).toEqual(['tracked_dirty', 'untracked_present', 'checks_unverified', 'hypotheses_present', 'writer_grant_active']);
    expect(readFileSync(subject.lease_path, 'utf8')).toBe(leaseBefore);
    expect(readEngineerBindingStatus(subject.root, ENGINEER, subject.revision).current).toEqual(bindingBefore);
    expect(bindingRoot).toContain('repo-harness/engineers/v1');
  });

  test('changed-during-read writes no receipt and persisted freezes become stale on later inventory change', () => {
    const subject = fixture();
    expect(() => inspectBoundTask(subject.root, ENGINEER, {
      after_first_read: () => writeFileSync(join(subject.root, 'between.txt'), 'changed\n'),
    })).toThrow(new TaskFreezeError('task_freeze_changed_during_read', 'bound task changed during the freeze read'));
    rmSync(join(subject.root, 'between.txt'));
    const frozen = createTaskFreeze(subject.root, ENGINEER, { now: () => '2026-08-26T00:04:00.000Z' });
    expect(createTaskFreeze(subject.root, ENGINEER, { now: () => '2026-08-26T00:04:00.000Z' }).receipt).toEqual(frozen.receipt);
    expect(verifyTaskFreeze(subject.root, TASK, frozen.receipt.receipt_sha256).receipt).toEqual(frozen.receipt);
    writeFileSync(join(subject.root, 'later.txt'), 'later\n');
    expect(() => verifyTaskFreeze(subject.root, TASK, frozen.receipt.receipt_sha256)).toThrow('untracked_inventory_sha256');
  });

  test('verification evidence is bound to the current subject and target revision', () => {
    const subject = fixture();
    expect(inspectBoundTask(subject.root, ENGINEER).disposition).toBe('clean_release_allowed');
    writeFileSync(join(subject.root, 'README.md'), 'changed after checks\n');
    git(subject.root, ['add', 'README.md']);
    git(subject.root, ['commit', '-qm', 'unverified change']);
    const inspected = inspectBoundTask(subject.root, ENGINEER);
    expect(inspected.reasons).toEqual(['checks_unverified']);
  });

  test('untracked filename inventory fences filesystem entry type', () => {
    const subject = fixture();
    const path = join(subject.root, 'carrier.txt');
    writeFileSync(path, 'regular\n');
    const frozen = createTaskFreeze(subject.root, ENGINEER);
    rmSync(path);
    symlinkSync('README.md', path);
    expect(() => verifyTaskFreeze(subject.root, TASK, frozen.receipt.receipt_sha256)).toThrow('untracked_inventory_sha256');
  });

  test('active Claim blocks retire/replace and CLI exposes no takeover command', () => {
    const subject = fixture();
    const before = readEngineerBindingStatus(subject.root, ENGINEER, subject.revision).current;
    expect(() => retireEngineer(subject.root, {
      engineer_id: ENGINEER,
      idempotency_key: 'retire',
      expected_current_digest: subject.active_digest,
      expected_binding_generation: 1,
      expected_binding_id: BINDING,
      expected_engineer_contract_revision: subject.revision,
    })).toThrow('inspect/freeze the bound task');
    expect(readEngineerBindingStatus(subject.root, ENGINEER, subject.revision).current).toEqual(before);
    const taskFreeze = buildEngineerCommand().commands.find((command) => command.name() === 'task-freeze');
    expect(taskFreeze?.commands.map((command) => command.name())).toEqual(['inspect', 'create', 'verify']);
    expect(JSON.stringify(taskFreeze?.commands.map((command) => command.name()))).not.toContain('takeover');
  });
});
