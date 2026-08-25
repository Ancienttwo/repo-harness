import { describe, expect, test } from 'bun:test';

import {
  buildEngineerOfferCandidate,
  buildEngineerOffersDocument,
  projectWorkGraph,
  validateWorkGraph,
  type EngineerOfferV1,
} from '../../src/core/engineers/scheduling';
import type { EngineerPrincipalV1 } from '../../src/core/engineers/principal-claim';
import { ExclusiveLockContentionError } from '../../src/effects/locking/exclusive-directory-lock';
import {
  acquireScheduledEngineerTask,
  type ScheduledEngineerAcquireAssertionV1,
} from '../../src/effects/engineers/scheduling-acquire';

const REPO = 'repo_0123456789abcdef';
const CAPABILITY = 'capability.workflow-engine.contract-assets';
const ENGINEER = `engineer:${CAPABILITY}`;
const DIGEST = `sha256:${'a'.repeat(64)}`;
const BINDING = '11111111-1111-4111-8111-111111111111';

function principal(): EngineerPrincipalV1 {
  return {
    protocol: 1,
    kind: 'repo-harness-engineer-principal',
    repository_id: REPO,
    engineer_id: ENGINEER,
    binding_id: BINDING,
    binding_generation: 2,
    engineer_contract_revision: DIGEST,
    carrier: 'mcp_oauth',
    auth_subject: '22222222-2222-4222-8222-222222222222',
    provider: 'unknown',
    provider_thread_id: null,
  };
}

function offer(): EngineerOfferV1 {
  const graph = projectWorkGraph(validateWorkGraph({
    protocol: 1,
    kind: 'repo-harness-work-graph',
    repository_id: REPO,
    sprint_path: 'plans/sprints/demo.sprint.md',
    lane: 'engineering-v2',
    work_packages: [{
      work_package_id: 'wp-a',
      task_ref: 'task A',
      primary_capability: CAPABILITY,
      depends_on: [],
      priority: 50,
      concurrency: { scope: 'repo', key: 'release' },
      execution_surface: 'contract',
      integration_group: null,
      required_acceptance: [{ gate: 'module', policy_id: 'module', policy_ref: 'plans/policy.json', policy_revision: DIGEST }],
      rollback_boundary: { kind: 'work_package', boundary_id: 'wp-a', boundary_ref: 'plans/rollback.json', boundary_revision: DIGEST },
    }],
  }), [{ task_id: '1'.repeat(64), task_revision: '2'.repeat(64), task_ref: 'task A', status: '[ ]', row_order: 1 }]);
  const candidate = buildEngineerOfferCandidate({
    graph,
    work_package: graph.work_packages[0],
    engineer: { engineer_id: ENGINEER, capability_id: CAPABILITY, engineer_contract_revision: DIGEST, max_active_claims: 1 },
    binding: { state: 'active', binding_id: BINDING, binding_generation: 2 },
    fleet_offer: {
      execution_readiness: 'execution_ready', snapshot_consistency: 'stable',
      task_id: '1'.repeat(64), task_revision: '2'.repeat(64), offer_revision: `sha256:${'b'.repeat(64)}`, authorization_revision: 4,
    },
    dependencies: [],
    concurrency_available: true,
    concurrency_revision: `sha256:${'c'.repeat(64)}`,
    active_claims: 0,
  });
  if (!candidate.eligible) throw new Error('fixture offer is not eligible');
  return candidate.offer;
}

function assertion(value: EngineerOfferV1): ScheduledEngineerAcquireAssertionV1 {
  return {
    offer_revision: value.offer_revision,
    work_package_id: value.work_package_id,
    work_package_revision: value.work_package_revision,
    work_graph_revision: value.work_graph_revision,
    task_id: value.task_id,
    task_revision: value.task_revision,
    dependency_revision: value.dependency_revision,
    concurrency_revision: value.concurrency_revision,
    binding_id: value.binding_id,
    binding_generation: value.binding_generation,
    engineer_contract_revision: value.engineer_contract_revision,
    fleet_offer_revision: value.fleet_offer_revision,
    authorization_revision: value.authorization_revision,
  };
}

function document(value: EngineerOfferV1) {
  return buildEngineerOffersDocument({
    repository_id: REPO,
    engineer_id: ENGINEER,
    lane: 'engineering-v2',
    work_graph_revision: value.work_graph_revision,
    candidates: [{ eligible: true, offer: value }],
  });
}

describe('ME-1A scheduled Engineer acquire', () => {
  test('revalidates under the repo-key lock and delegates exactly once to ME-0B', () => {
    const current = offer();
    let collectCount = 0;
    let acquireCount = 0;
    let lockKey = '';
    const result = acquireScheduledEngineerTask({
      repo_root: '/repo',
      principal: principal(),
      assertion: assertion(current),
      dependencies: {
        collectOffers: () => { collectCount += 1; return document(current); },
        withConcurrencyLock: (_root, key, run) => { lockKey = key; return run(); },
        acquire: (options) => {
          acquireCount += 1;
          expect(options.assertion).toEqual({
            repo_id: REPO,
            task_id: current.task_id,
            offer_revision: current.fleet_offer_revision,
            authorization_revision: current.authorization_revision,
          });
          return { ok: true, envelope: { repo_id: REPO } as any, receipt: { repository_id: REPO } as any };
        },
      },
    });
    expect(result.ok).toBe(true);
    expect(collectCount).toBe(2);
    expect(acquireCount).toBe(1);
    expect(lockKey).toBe(`${REPO}:release`);
  });

  test('every asserted scheduling fence fails before mutation when stale', () => {
    const current = offer();
    const base = assertion(current);
    const staleValues: Array<[keyof ScheduledEngineerAcquireAssertionV1, unknown]> = [
      ['offer_revision', DIGEST],
      ['work_package_id', 'wp-other'],
      ['work_package_revision', DIGEST],
      ['work_graph_revision', DIGEST],
      ['task_id', '3'.repeat(64)],
      ['task_revision', '4'.repeat(64)],
      ['dependency_revision', DIGEST],
      ['concurrency_revision', DIGEST],
      ['binding_id', '33333333-3333-4333-8333-333333333333'],
      ['binding_generation', 3],
      ['engineer_contract_revision', `sha256:${'d'.repeat(64)}`],
      ['fleet_offer_revision', DIGEST],
      ['authorization_revision', 5],
    ];
    for (const [key, value] of staleValues) {
      let mutated = false;
      const result = acquireScheduledEngineerTask({
        repo_root: '/repo',
        principal: principal(),
        assertion: { ...base, [key]: value },
        dependencies: {
          collectOffers: () => document(current),
          withConcurrencyLock: (_root, _key, run) => run(),
          acquire: () => { mutated = true; throw new Error('must not mutate'); },
        },
      });
      expect(result).toMatchObject({ ok: false, error: 'engineer_offer_stale' });
      expect(mutated).toBe(false);
    }
  });

  test('a change during the lock window stops before ME-0B', () => {
    const current = offer();
    let reads = 0;
    let mutated = false;
    const empty = buildEngineerOffersDocument({
      repository_id: REPO, engineer_id: ENGINEER, lane: 'engineering-v2',
      work_graph_revision: current.work_graph_revision, candidates: [],
    });
    const result = acquireScheduledEngineerTask({
      repo_root: '/repo',
      principal: principal(),
      assertion: assertion(current),
      dependencies: {
        collectOffers: () => (++reads === 1 ? document(current) : empty),
        withConcurrencyLock: (_root, _key, run) => run(),
        acquire: () => { mutated = true; throw new Error('must not mutate'); },
      },
    });
    expect(result).toMatchObject({ ok: false, error: 'engineer_offer_stale' });
    expect(mutated).toBe(false);
  });

  test('lock contention is a typed concurrency refusal', () => {
    const current = offer();
    const result = acquireScheduledEngineerTask({
      repo_root: '/repo',
      principal: principal(),
      assertion: assertion(current),
      dependencies: {
        collectOffers: () => document(current),
        withConcurrencyLock: () => { throw new ExclusiveLockContentionError('busy', '/lock', 'timeout'); },
        acquire: () => { throw new Error('must not mutate'); },
      },
    });
    expect(result).toEqual({ ok: false, error: 'engineer_concurrency_unavailable', message: 'busy' });
  });
});
