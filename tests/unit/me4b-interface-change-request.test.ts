import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { cpSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  InterfaceChangeError,
  buildInterfaceChangeRequest,
  canonicalInterfaceChangeRequestBytes,
  validateInterfaceChangeRequest,
  type InterfaceChangeActorV1,
} from '../../src/core/engineers/interface-change';
import { workPackageRevision } from '../../src/core/engineers/scheduling';
import { bindEngineer, engineerBindingStoreRoot, readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import {
  InterfaceChangeStoreError,
  findInterfaceChangesByWorkPackage,
  readInterfaceChangeStatus,
  transitionInterfaceChangeRequest,
} from '../../src/effects/engineers/interface-change-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const sourceRoot = process.cwd();
const roots: string[] = [];
const SOURCE_CAPABILITY = 'capability.verification.evals-checks';
const TARGET_CAPABILITY = 'capability.workflow-engine.contract-assets';
const SOURCE_ENGINEER = `engineer:${SOURCE_CAPABILITY}`;
const TARGET_ENGINEER = `engineer:${TARGET_CAPABILITY}`;
const SOURCE_BINDING = '11111111-1111-4111-8111-111111111111';
const TARGET_BINDING = '22222222-2222-4222-8222-222222222222';
const REQUEST = '33333333-3333-4333-8333-333333333333';
const SPRINT = 'plans/sprints/interface.sprint.md';
const D = (char: string) => `sha256:${char.repeat(64)}`;
const POLICY_BYTES = '{"policy":"interface-owner"}\n';
const ROLLBACK_BYTES = '{"rollback":"interface-contract-v2"}\n';
const digest = (bytes: string) => `sha256:${createHash('sha256').update(bytes, 'utf8').digest('hex')}`;
const SPRINT_TEXT = `# Sprint: interface

> **Status**: Approved
> **Backlog Schema**: 2

## Backlog

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|---|---|---|---|---|
| 1 | ${fixtureTaskId('change target interface')} | [ ] | change target interface | contract | exact interface evidence | (pending) |

## Execution Log
`;

function fixture(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-me4b-interface-')));
  roots.push(root);
  execFileSync('git', ['init', '-q', '--initial-branch=main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root });
  mkdirSync(join(root, '.archcontext/model'), { recursive: true });
  mkdirSync(join(root, 'agents'), { recursive: true });
  mkdirSync(join(root, 'plans/sprints'), { recursive: true });
  mkdirSync(join(root, 'plans/policies'), { recursive: true });
  mkdirSync(join(root, 'plans/rollback'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(root, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(root, 'agents/engineers'), { recursive: true });
  writeFileSync(join(root, SPRINT), SPRINT_TEXT);
  writeFileSync(join(root, 'plans/policies/interface-owner.json'), POLICY_BYTES);
  writeFileSync(join(root, 'plans/rollback/interface-contract-v2.json'), ROLLBACK_BYTES);
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: root });
  bind(root, SOURCE_ENGINEER, SOURCE_BINDING);
  bind(root, TARGET_ENGINEER, TARGET_BINDING);
  return root;
}

function bind(root: string, engineerId: string, bindingId: string): void {
  const profile = loadEngineerProfile(root, engineerId);
  bindEngineer(root, {
    engineer_id: engineerId,
    idempotency_key: `bind-${bindingId}`,
    provider: 'codex',
    provider_thread_id: `thread-${bindingId}`,
    host_id: 'local',
    engineer_contract_revision: profile.engineer_contract_revision,
    expected_current_digest: null,
    expected_binding_generation: 0,
    expected_binding_id: null,
    expected_engineer_contract_revision: profile.engineer_contract_revision,
    binding_id: () => bindingId,
    now: () => '2026-08-26T08:30:00.000Z',
  });
}

function engineerActor(root: string, engineerId: string): InterfaceChangeActorV1 {
  const profile = loadEngineerProfile(root, engineerId);
  const binding = readEngineerBindingStatus(root, engineerId, profile.engineer_contract_revision).binding!;
  return { kind: 'engineer', principal: { engineer_id: engineerId, binding_id: binding.binding_id, binding_generation: binding.binding_generation, engineer_contract_revision: binding.engineer_contract_revision } };
}

const HUMAN: InterfaceChangeActorV1 = { kind: 'human', principal_ref: 'human:ancienttwo' };

function request(root: string) {
  const source = engineerActor(root, SOURCE_ENGINEER);
  if (source.kind !== 'engineer') throw new Error('fixture actor must be Engineer');
  return buildInterfaceChangeRequest({
    repository_id: repoHarnessRepoIdFor(root),
    request_id: REQUEST,
    source_capability_id: SOURCE_CAPABILITY,
    target_capability_id: TARGET_CAPABILITY,
    requester_fence: source.principal,
    target_engineer_id: TARGET_ENGINEER,
    interface_ref: 'src/public/interface.ts#ContractV1',
    proposed_change: 'Add one exact revision-fenced field.',
    compatibility_impact: 'Breaking wire change; consumers require one coordinated Work Package.',
  });
}

function definition() {
  return {
    work_package_id: 'interface-contract-v2',
    task_id: fixtureTaskId('change target interface'),
    primary_capability: TARGET_CAPABILITY,
    depends_on: [],
    priority: 80,
    concurrency: { scope: 'repo' as const, key: 'interface-contract' },
    execution_surface: 'contract' as const,
    integration_group: 'interface-contract',
    required_acceptance: [{ gate: 'module' as const, policy_id: 'interface-owner', policy_ref: 'plans/policies/interface-owner.json', policy_revision: digest(POLICY_BYTES) }],
    rollback_boundary: { kind: 'work_package' as const, boundary_id: 'interface-contract-v2', boundary_ref: 'plans/rollback/interface-contract-v2.json', boundary_revision: digest(ROLLBACK_BYTES) },
  };
}

function transition(root: string, req: ReturnType<typeof request>, args: Partial<Parameters<typeof transitionInterfaceChangeRequest>[0]> & Pick<Parameters<typeof transitionInterfaceChangeRequest>[0], 'idempotency_key' | 'transition' | 'expected_current_digest' | 'actor'>) {
  return transitionInterfaceChangeRequest({ repo_root: root, request: req, planning_projection: null, materialization_commit: null, evidence_sha256: null, ...args });
}

function proposeAndSubmit(root: string) {
  const req = request(root);
  const proposed = transition(root, req, { idempotency_key: 'propose', transition: 'propose', expected_current_digest: null, actor: engineerActor(root, SOURCE_ENGINEER) });
  const submitted = transition(root, req, { idempotency_key: 'submit', transition: 'submit', expected_current_digest: proposed.current.current_digest, actor: engineerActor(root, SOURCE_ENGINEER) });
  return { req, proposed, submitted };
}

function accept(root: string, req: ReturnType<typeof request>, expected: string) {
  return transition(root, req, {
    idempotency_key: 'accept',
    transition: 'accept',
    expected_current_digest: expected,
    actor: HUMAN,
    planning_projection: { sprint_ref: SPRINT, expected_work_graph_revision: null, proposed_work_package: definition() },
  });
}

function materializeCommit(root: string): string {
  writeFileSync(join(root, 'plans/sprints/interface.work-graph.v1.json'), `${JSON.stringify({ protocol: 1, kind: 'repo-harness-work-graph', repository_id: repoHarnessRepoIdFor(root), sprint_path: SPRINT, lane: 'engineering-v2', work_packages: [definition()] })}\n`);
  execFileSync('git', ['add', 'plans/sprints/interface.work-graph.v1.json'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'materialize interface Work Package'], { cwd: root });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('ME-4B Interface Change Request', () => {
  test('keeps request schema closed and exact-digest canonical', () => {
    const root = fixture();
    const built = request(root);
    expect(validateInterfaceChangeRequest(JSON.parse(canonicalInterfaceChangeRequestBytes(built)))).toEqual(built);
    expect(() => validateInterfaceChangeRequest({ ...built, extra: true })).toThrow(InterfaceChangeError);
    expect(() => buildInterfaceChangeRequest({ ...built, source_capability_id: TARGET_CAPABILITY } as never)).toThrow('source and target capabilities must differ');
  });

  test('stale submit race has exactly one winner and crash replay repairs current', () => {
    const root = fixture();
    const req = request(root);
    const proposed = transition(root, req, { idempotency_key: 'propose', transition: 'propose', expected_current_digest: null, actor: engineerActor(root, SOURCE_ENGINEER) });
    const attempts = ['submit-a', 'submit-b'].map((idempotency_key) => {
      try { return transition(root, req, { idempotency_key, transition: 'submit', expected_current_digest: proposed.current.current_digest, actor: engineerActor(root, SOURCE_ENGINEER) }); }
      catch (error) { return error; }
    });
    expect(attempts.filter((value) => !(value instanceof Error))).toHaveLength(1);
    expect(attempts.filter((value) => value instanceof InterfaceChangeError && value.code === 'interface_change_stale')).toHaveLength(1);

    const crashRoot = fixture();
    const crashRequest = request(crashRoot);
    expect(() => transition(crashRoot, crashRequest, {
      idempotency_key: 'crash-propose', transition: 'propose', expected_current_digest: null,
      actor: engineerActor(crashRoot, SOURCE_ENGINEER), crash_hook: (boundary) => { if (boundary === 'after_event_fsync') throw new Error('crash'); },
    })).toThrow('crash');
    const recovered = transition(crashRoot, crashRequest, { idempotency_key: 'crash-propose', transition: 'propose', expected_current_digest: null, actor: engineerActor(crashRoot, SOURCE_ENGINEER) });
    expect(recovered.current.state).toBe('proposed');
  });

  test('holds the exact Engineer Binding lock through request publication', () => {
    const root = fixture();
    const req = request(root);
    const engineerKey = createHash('sha256').update(Buffer.from(SOURCE_ENGINEER, 'utf8')).digest('hex');
    let bindingLockObserved = false;
    transition(root, req, {
      idempotency_key: 'binding-locked-propose',
      transition: 'propose',
      expected_current_digest: null,
      actor: engineerActor(root, SOURCE_ENGINEER),
      crash_hook: (boundary) => {
        if (boundary !== 'before_event') return;
        bindingLockObserved = lstatSync(join(engineerBindingStoreRoot(root), 'locks', `${engineerKey}.lock`)).isDirectory();
      },
    });
    expect(bindingLockObserved).toBe(true);
    expect(readInterfaceChangeStatus(root, REQUEST).current.state).toBe('proposed');
  });

  test('enforces source, target and Human actor planes', () => {
    const root = fixture();
    const req = request(root);
    expect(() => transition(root, req, { idempotency_key: 'bad-propose', transition: 'propose', expected_current_digest: null, actor: engineerActor(root, TARGET_ENGINEER) })).toThrow();
    const proposed = transition(root, req, { idempotency_key: 'propose', transition: 'propose', expected_current_digest: null, actor: engineerActor(root, SOURCE_ENGINEER) });
    expect(() => transition(root, req, { idempotency_key: 'bad-submit', transition: 'submit', expected_current_digest: proposed.current.current_digest, actor: engineerActor(root, TARGET_ENGINEER) })).toThrow();
    const submitted = transition(root, req, { idempotency_key: 'submit', transition: 'submit', expected_current_digest: proposed.current.current_digest, actor: engineerActor(root, SOURCE_ENGINEER) });
    expect(() => transition(root, req, { idempotency_key: 'bad-accept', transition: 'accept', expected_current_digest: submitted.current.current_digest, actor: engineerActor(root, SOURCE_ENGINEER), planning_projection: { sprint_ref: SPRINT, expected_work_graph_revision: null, proposed_work_package: definition() } })).toThrow('requires Human authority');
  });

  test('accepts only an immutable planning projection and materializes exact tracked ME-1A bytes', () => {
    const root = fixture();
    const { req, submitted } = proposeAndSubmit(root);
    const before = execFileSync('git', ['status', '--porcelain=v1'], { cwd: root, encoding: 'utf8' });
    const accepted = accept(root, req, submitted.current.current_digest);
    expect(accepted.current.state).toBe('accepted');
    expect(execFileSync('git', ['status', '--porcelain=v1'], { cwd: root, encoding: 'utf8' })).toBe(before);
    expect(findInterfaceChangesByWorkPackage(root, req.repository_id, definition().work_package_id, workPackageRevision(definition()))).toEqual([]);
    expect(() => transition(root, req, { idempotency_key: 'early', transition: 'materialize', expected_current_digest: accepted.current.current_digest, actor: engineerActor(root, TARGET_ENGINEER), materialization_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() })).toThrow(InterfaceChangeStoreError);
    const commit = materializeCommit(root);
    const materialized = transition(root, req, { idempotency_key: 'materialize', transition: 'materialize', expected_current_digest: accepted.current.current_digest, actor: engineerActor(root, TARGET_ENGINEER), materialization_commit: commit });
    expect(materialized.current).toMatchObject({ state: 'implementing', materialized_work_package_ref: { work_package_id: definition().work_package_id, work_package_revision: workPackageRevision(definition()), materialized_commit: commit } });
    const reverse = findInterfaceChangesByWorkPackage(root, req.repository_id, definition().work_package_id, workPackageRevision(definition()));
    expect(reverse).toHaveLength(1);
    expect(reverse[0].request_id).toBe(req.request_id);
  });

  test('rejects materialization outside the canonical target or with stale referenced authorities', () => {
    const branchRoot = fixture();
    const branchFlow = proposeAndSubmit(branchRoot);
    const branchAccepted = accept(branchRoot, branchFlow.req, branchFlow.submitted.current.current_digest);
    execFileSync('git', ['switch', '-q', '-c', 'candidate/materialization'], { cwd: branchRoot });
    const branchCommit = materializeCommit(branchRoot);
    expect(() => transition(branchRoot, branchFlow.req, {
      idempotency_key: 'non-canonical-materialize', transition: 'materialize',
      expected_current_digest: branchAccepted.current.current_digest,
      actor: engineerActor(branchRoot, TARGET_ENGINEER), materialization_commit: branchCommit,
    })).toThrow('materialization commit is not the current canonical target');

    const staleRoot = fixture();
    const staleFlow = proposeAndSubmit(staleRoot);
    const staleAccepted = accept(staleRoot, staleFlow.req, staleFlow.submitted.current.current_digest);
    writeFileSync(join(staleRoot, 'plans/policies/interface-owner.json'), '{"policy":"stale"}\n');
    execFileSync('git', ['add', 'plans/policies/interface-owner.json'], { cwd: staleRoot });
    const staleCommit = materializeCommit(staleRoot);
    expect(() => transition(staleRoot, staleFlow.req, {
      idempotency_key: 'stale-authority-materialize', transition: 'materialize',
      expected_current_digest: staleAccepted.current.current_digest,
      actor: engineerActor(staleRoot, TARGET_ENGINEER), materialization_commit: staleCommit,
    })).toThrow('tracked Work Graph cannot be projected through ME-1A');
  });

  test('records implementation and Human integration as separate evidence transitions', () => {
    const root = fixture();
    const { req, submitted } = proposeAndSubmit(root);
    const accepted = accept(root, req, submitted.current.current_digest);
    const materialized = transition(root, req, { idempotency_key: 'materialize', transition: 'materialize', expected_current_digest: accepted.current.current_digest, actor: engineerActor(root, TARGET_ENGINEER), materialization_commit: materializeCommit(root) });
    const implemented = transition(root, req, { idempotency_key: 'implemented', transition: 'implemented', expected_current_digest: materialized.current.current_digest, actor: engineerActor(root, TARGET_ENGINEER), evidence_sha256: D('c') });
    expect(implemented.current).toMatchObject({ state: 'implemented', implementation_evidence_sha256: D('c'), integration_evidence_sha256: null });
    expect(() => transition(root, req, { idempotency_key: 'self-integrate', transition: 'integrated', expected_current_digest: implemented.current.current_digest, actor: engineerActor(root, TARGET_ENGINEER), evidence_sha256: D('d') })).toThrow('requires Human authority');
    const integrated = transition(root, req, { idempotency_key: 'integrated', transition: 'integrated', expected_current_digest: implemented.current.current_digest, actor: HUMAN, evidence_sha256: D('d') });
    expect(integrated.current).toMatchObject({ state: 'integrated', implementation_evidence_sha256: D('c'), integration_evidence_sha256: D('d') });
    expect(readInterfaceChangeStatus(root, REQUEST).current.current_digest).toBe(integrated.current.current_digest);
  });
});
