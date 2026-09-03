import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { engineerSha256 } from '../../src/core/engineers/profile-binding';
import type { EngineerPrincipalV1 } from '../../src/core/engineers/principal-claim';
import { projectCanonicalTasks } from '../../src/core/state/coordination-identity';
import {
  collectEngineerOffers,
  type EngineerSchedulingDependencies,
} from '../../src/effects/engineers/scheduling';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const REPO = 'repo_0123456789abcdef';
const CAPABILITY = 'capability.workflow-engine.contract-assets';
const ENGINEER = `engineer:${CAPABILITY}`;
const CONTRACT_REVISION = `sha256:${'a'.repeat(64)}`;
const BINDING = '11111111-1111-4111-8111-111111111111';
const SPRINT = 'plans/sprints/demo.sprint.md';
const POLICY_BYTES = '{"policy":1}\n';
const ROLLBACK_A = '{"rollback":"a"}\n';
const ROLLBACK_B = '{"rollback":"b"}\n';
const SPRINT_TEXT = `# Sprint: demo
> **Backlog Schema**: 2

## Backlog

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|---|---|---|---|---|
| 1 | ${fixtureTaskId('task A')} | [x] | task A | contract | accepted A | (pending) |
| 2 | ${fixtureTaskId('task B')} | [ ] | task B | contract | accepted B | (pending) |

## Execution Log
`;

function definition(id: string, taskRef: string, dependencies: unknown[] = []) {
  return {
    work_package_id: id,
    task_id: fixtureTaskId(taskRef),
    primary_capability: CAPABILITY,
    depends_on: dependencies,
    priority: id === 'wp-b' ? 90 : 10,
    concurrency: { scope: 'repo', key: 'release' },
    execution_surface: 'contract',
    integration_group: null,
    required_acceptance: [{
      gate: 'module', policy_id: 'module-default', policy_ref: 'plans/policies/module.json',
      policy_revision: engineerSha256(POLICY_BYTES),
    }],
    rollback_boundary: {
      kind: 'work_package', boundary_id: `${REPO}:${id}`,
      boundary_ref: `plans/rollback/${id}.json`,
      boundary_revision: engineerSha256(id === 'wp-a' ? ROLLBACK_A : ROLLBACK_B),
    },
  };
}

function graph() {
  return {
    protocol: 1,
    kind: 'repo-harness-work-graph',
    repository_id: REPO,
    sprint_path: SPRINT,
    lane: 'engineering-v2',
    work_packages: [
      definition('wp-a', 'task A'),
      definition('wp-b', 'task B', [{ repository_id: REPO, work_package_id: 'wp-a', required_state: 'canonical_done' }]),
    ],
  };
}

function principal(): EngineerPrincipalV1 {
  return {
    protocol: 1,
    kind: 'repo-harness-engineer-principal',
    repository_id: REPO,
    engineer_id: ENGINEER,
    binding_id: BINDING,
    binding_generation: 1,
    engineer_contract_revision: CONTRACT_REVISION,
    carrier: 'mcp_oauth',
    auth_subject: '22222222-2222-4222-8222-222222222222',
    provider: 'unknown',
    provider_thread_id: null,
  };
}

function fixture(options: { carrier?: boolean; activeConcurrency?: boolean; activeClaims?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'me1a-scheduling-'));
  const canonical = projectCanonicalTasks({ repoIdentity: '/git/common', sprintPath: SPRINT, sprintText: SPRINT_TEXT });
  const byTask = new Map(canonical.map((task) => [task.row.task, task]));
  const registry = {
    authorizationRevision: 3,
    repos: [{ id: REPO, path: root, accessMode: 'read_write', adopted: true }],
  } as any;
  const readFileAtCommit = (_repo: string, _commit: string, path: string): string | null => {
    if (path.endsWith('.work-graph.v1.json')) return options.carrier === false ? null : JSON.stringify(graph());
    if (path === 'plans/policies/module.json') return POLICY_BYTES;
    if (path === 'plans/rollback/wp-a.json') return ROLLBACK_A;
    if (path === 'plans/rollback/wp-b.json') return ROLLBACK_B;
    return null;
  };
  const leaseFor = (taskId: string) => {
    if (options.activeConcurrency && taskId === byTask.get('task A')!.task_id) {
      return {
        classification: 'bound', unknown_reason: null,
        record: { task_id: taskId, task_revision: byTask.get('task A')!.task_revision, claim_id: '33333333-3333-4333-8333-333333333333', generation: 1, state: 'bound' },
      } as any;
    }
    return { classification: 'available', unknown_reason: null, record: null } as any;
  };
  const deps: Partial<EngineerSchedulingDependencies> = {
    readRegistry: () => registry,
    readActiveSprintPath: () => SPRINT,
    readCanonicalTargetRef: () => 'main',
    readCanonicalSprint: () => ({ ok: true, commit: 'f'.repeat(40), text: SPRINT_TEXT }),
    readFileAtCommit,
    repoIdentity: () => '/git/common',
    resolveCapability: () => ({ capability: {} as any, capability_revision: CONTRACT_REVISION }),
    loadProfile: () => ({
      profile: { engineer_id: ENGINEER, capability_id: CAPABILITY, max_active_claims: 2 },
      engineer_contract_revision: CONTRACT_REVISION,
    } as any),
    readBinding: () => ({
      current: { state: 'active', current_binding_id: BINDING, binding_generation: 1 },
      binding: {}, event: {}, genesis: false,
    } as any),
    collectFleetOffers: () => ({
      protocol: 1,
      kind: 'repo-harness-fleet-offers',
      authorization_revision: 3,
      snapshot_consistency: 'stable',
      offer_revision: `sha256:${'b'.repeat(64)}`,
      offers: [{
        repo_id: REPO,
        task_id: byTask.get('task B')!.task_id,
        task_revision: byTask.get('task B')!.task_revision,
        execution_readiness: 'execution_ready',
        snapshot_consistency: 'stable',
        offer_revision: `sha256:${'c'.repeat(64)}`,
        authorization_revision: 3,
      }],
    } as any),
    listLiveClaims: () => Array.from({ length: options.activeClaims ?? 0 }, () => ({} as any)),
    readLease: (_cwd, taskId) => leaseFor(taskId),
  };
  return { root, registry, deps, byTask };
}

describe('ME-1A Engineer offer effects', () => {
  test('projects one exact-capability offer after canonical dependency completion', () => {
    const subject = fixture();
    const result = collectEngineerOffers({
      repo_root: subject.root,
      principal: principal(),
      registry_snapshot: subject.registry,
      dependencies: subject.deps,
    });
    expect(result.lane).toBe('engineering-v2');
    expect(result.offers.map((offer) => offer.work_package_id)).toEqual(['wp-b']);
    expect(result.exclusions.find((item) => item.work_package_id === 'wp-a')?.blockers)
      .toContain('fleet_offer_unavailable');
  });

  test('missing carrier is unclassified and never falls back to generic routing', () => {
    const subject = fixture({ carrier: false });
    const result = collectEngineerOffers({
      repo_root: subject.root,
      principal: principal(),
      registry_snapshot: subject.registry,
      dependencies: subject.deps,
    });
    expect(result.lane).toBe('unclassified');
    expect(result.offers).toEqual([]);
  });

  test('same-commit policy and rollback references are exact digest fences', () => {
    const subject = fixture();
    const original = subject.deps.readFileAtCommit!;
    (subject.deps as any).readFileAtCommit = (repo: string, commit: string, path: string) => (
      path === 'plans/policies/module.json' ? '{"policy":"moved"}\n' : original(repo, commit, path)
    );
    expect(() => collectEngineerOffers({
      repo_root: subject.root,
      principal: principal(),
      registry_snapshot: subject.registry,
      dependencies: subject.deps,
    })).toThrow('acceptance policy module-default is missing or stale');
  });

  test('live same-key Lease blocks a different Work Package', () => {
    const subject = fixture({ activeConcurrency: true });
    const result = collectEngineerOffers({
      repo_root: subject.root,
      principal: principal(),
      registry_snapshot: subject.registry,
      dependencies: subject.deps,
    });
    expect(result.offers).toEqual([]);
    expect(result.exclusions.find((item) => item.work_package_id === 'wp-b')?.blockers)
      .toContain('concurrency_unavailable');
  });

  test('Profile max_active_claims is enforced from live actor/Lease joins', () => {
    const subject = fixture({ activeClaims: 2 });
    const result = collectEngineerOffers({
      repo_root: subject.root,
      principal: principal(),
      registry_snapshot: subject.registry,
      dependencies: subject.deps,
    });
    expect(result.exclusions.find((item) => item.work_package_id === 'wp-b')?.blockers)
      .toContain('active_claim_limit');
  });

  test('a generic-v1 carrier is excluded in the effects layer before any Profile or Binding read', () => {
    const subject = fixture();
    let profileReads = 0;
    let bindingReads = 0;
    let fleetReads = 0;
    (subject.deps as any).readFileAtCommit = (_repo: string, _commit: string, path: string) => (
      path.endsWith('.work-graph.v1.json')
        ? JSON.stringify({
          protocol: 1,
          kind: 'repo-harness-work-graph',
          repository_id: REPO,
          sprint_path: SPRINT,
          lane: 'generic-v1',
          work_packages: [],
        })
        : null
    );
    (subject.deps as any).loadProfile = () => { profileReads += 1; throw new Error('must not read the Profile authority'); };
    (subject.deps as any).readBinding = () => { bindingReads += 1; throw new Error('must not read the Binding authority'); };
    (subject.deps as any).collectFleetOffers = () => { fleetReads += 1; throw new Error('must not read ME-0B Fleet offers'); };

    const result = collectEngineerOffers({
      repo_root: subject.root,
      principal: principal(),
      registry_snapshot: subject.registry,
      dependencies: subject.deps,
    });

    expect(result.lane).toBe('generic-v1');
    expect(result.offers).toEqual([]);
    expect(result.exclusions).toEqual([]);
    expect(result.work_graph_revision).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect([profileReads, bindingReads, fleetReads]).toEqual([0, 0, 0]);
  });

  test('future dependency authority fails closed until its receipt adapter exists', () => {
    const subject = fixture();
    const baseGraph = graph();
    (baseGraph.work_packages[1] as any).depends_on[0].required_state = 'product_accepted';
    (subject.deps as any).readFileAtCommit = (_repo: string, _commit: string, path: string) => {
      if (path.endsWith('.work-graph.v1.json')) return JSON.stringify(baseGraph);
      if (path === 'plans/policies/module.json') return POLICY_BYTES;
      if (path === 'plans/rollback/wp-a.json') return ROLLBACK_A;
      if (path === 'plans/rollback/wp-b.json') return ROLLBACK_B;
      return null;
    };
    const result = collectEngineerOffers({
      repo_root: subject.root,
      principal: principal(),
      registry_snapshot: subject.registry,
      dependencies: subject.deps,
    });
    expect(result.exclusions.find((item) => item.work_package_id === 'wp-b')?.blockers)
      .toContain('dependency_authority_unavailable');
  });
});
