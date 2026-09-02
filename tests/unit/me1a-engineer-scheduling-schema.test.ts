import { describe, expect, test } from 'bun:test';

import {
  EngineerSchedulingError,
  buildEngineerOfferCandidate,
  buildEngineerOffersDocument,
  projectWorkGraph,
  schedulingCarrierPath,
  validateEngineerOffer,
  validateWorkGraph,
  validateWorkGraphTopology,
  type SchedulingCanonicalTask,
  type WorkGraphV1,
} from '../../src/core/engineers/scheduling';

const REPO = 'repo_0123456789abcdef';
const OTHER_REPO = 'repo_fedcba9876543210';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const CAPABILITY = 'capability.workflow-engine.contract-assets';
const MODULE_AUTHORITY = {
  authority_kind: 'module_acceptance',
  subject_ref: 'tasks/contracts/wp-b.contract.md',
  subject_revision: DIGEST,
} as const;
const PRODUCT_AUTHORITY = {
  authority_kind: 'product_acceptance',
  subject_ref: 'plans/prds/product.md',
  subject_revision: DIGEST,
} as const;

function workPackage(id = 'wp-a', taskRef = 'task A', dependsOn: unknown[] = []) {
  return {
    work_package_id: id,
    task_ref: taskRef,
    primary_capability: CAPABILITY,
    depends_on: dependsOn,
    priority: 50,
    concurrency: { scope: 'repo', key: 'release' },
    execution_surface: 'contract',
    integration_group: null,
    required_acceptance: [{
      gate: 'module',
      policy_id: 'module-default',
      policy_ref: 'plans/policies/module-default.json',
      policy_revision: DIGEST,
    }],
    rollback_boundary: {
      kind: 'work_package',
      boundary_id: `${REPO}:${id}`,
      boundary_ref: `plans/rollback/${id}.json`,
      boundary_revision: DIGEST,
    },
  };
}

function graph(workPackages: unknown[], lane: 'generic-v1' | 'engineering-v2' = 'engineering-v2', repositoryId = REPO): WorkGraphV1 {
  return validateWorkGraph({
    protocol: 1,
    kind: 'repo-harness-work-graph',
    repository_id: repositoryId,
    sprint_path: 'plans/sprints/demo.sprint.md',
    lane,
    work_packages: workPackages,
  });
}

function task(ref = 'task A', id = '1', revision = '2', rowOrder = 1): SchedulingCanonicalTask {
  return {
    task_id: id.length === 64 ? id : id.repeat(64),
    task_revision: revision.length === 64 ? revision : revision.repeat(64),
    task_ref: ref,
    status: '[ ]',
    row_order: rowOrder,
  };
}

describe('ME-1A closed scheduling schema', () => {
  test('uses one deterministic sibling carrier and explicit legacy lane', () => {
    expect(schedulingCarrierPath('plans/sprints/demo.sprint.md'))
      .toBe('plans/sprints/demo.work-graph.v1.json');
    expect(graph([], 'generic-v1').lane).toBe('generic-v1');
    expect(() => graph([workPackage()], 'generic-v1')).toThrow(EngineerSchedulingError);
    expect(() => schedulingCarrierPath('../demo.sprint.md')).toThrow(EngineerSchedulingError);
  });

  test('rejects unknown semantic fields and unsupported concurrency scopes', () => {
    expect(() => validateWorkGraph({
      protocol: 1,
      kind: 'repo-harness-work-graph',
      repository_id: REPO,
      sprint_path: 'plans/sprints/demo.sprint.md',
      lane: 'engineering-v2',
      work_packages: [{ ...workPackage(), required_capabilities: [CAPABILITY] }],
    })).toThrow('keys are invalid');
    expect(() => graph([{ ...workPackage(), concurrency: { scope: 'fleet', key: 'release' } }]))
      .toThrow('scope is unsupported');
  });

  test('preserves stable Work Package identity while task revision remains separate', () => {
    const definition = graph([workPackage()]);
    const before = projectWorkGraph(definition, [task()]);
    const after = projectWorkGraph(definition, [task('task A', '1', '3')]);
    expect(after.work_packages[0].work_package_id).toBe(before.work_packages[0].work_package_id);
    expect(after.work_packages[0].work_package_revision).toBe(before.work_packages[0].work_package_revision);
    expect(after.work_packages[0].task_id).toBe(before.work_packages[0].task_id);
    expect(after.work_packages[0].task_revision).not.toBe(before.work_packages[0].task_revision);
    expect(after.work_graph_revision).not.toBe(before.work_graph_revision);
  });

  test('requires exact full Sprint-row coverage', () => {
    expect(() => projectWorkGraph(graph([workPackage()]), [task(), task('task B', '3', '4', 2)]))
      .toThrow('cover every canonical Sprint row');
    expect(() => projectWorkGraph(graph([workPackage('wp-a', 'missing')]), [task()]))
      .toThrow('task_ref is absent');
  });

  test('rejects missing dependency targets and cycles across repository-qualified identities', () => {
    const missing = projectWorkGraph(graph([
      workPackage('wp-a', 'task A', [{ repository_id: OTHER_REPO, work_package_id: 'wp-x', required_state: 'canonical_done', acceptance_authority: null }]),
    ]), [task()]);
    expect(() => validateWorkGraphTopology([missing])).toThrow('depends on missing');

    const cyclic = projectWorkGraph(graph([
      workPackage('wp-a', 'task A', [{ repository_id: REPO, work_package_id: 'wp-b', required_state: 'canonical_done', acceptance_authority: null }]),
      workPackage('wp-b', 'task B', [{ repository_id: REPO, work_package_id: 'wp-a', required_state: 'canonical_done', acceptance_authority: null }]),
    ]), [task(), task('task B', '3', '4', 2)]);
    expect(() => validateWorkGraphTopology([cyclic])).toThrow('cycle detected');
  });

  test('rejects duplicate dependency identities and duplicate canonical task projections', () => {
    expect(() => graph([workPackage('wp-a', 'task A', [
      { repository_id: REPO, work_package_id: 'wp-b', required_state: 'canonical_done', acceptance_authority: null },
      { repository_id: REPO, work_package_id: 'wp-b', required_state: 'module_accepted', acceptance_authority: MODULE_AUTHORITY },
    ])])).toThrow('depends_on contains duplicates');
    expect(() => projectWorkGraph(graph([
      workPackage('wp-a', 'task A'),
      workPackage('wp-b', 'task B'),
    ]), [task(), task('task B', '1', '3', 2)])).toThrow('duplicate task_id');
  });

  test('builds a revision-fenced offer only when every closed input is ready', () => {
    const projected = projectWorkGraph(graph([workPackage()]), [task()]);
    const candidate = buildEngineerOfferCandidate({
      graph: projected,
      work_package: projected.work_packages[0],
      engineer: {
        engineer_id: `engineer:${CAPABILITY}`,
        capability_id: CAPABILITY,
        engineer_contract_revision: DIGEST,
        max_active_claims: 1,
      },
      binding: { state: 'active', binding_id: '11111111-1111-4111-8111-111111111111', binding_generation: 1 },
      fleet_offer: {
        execution_readiness: 'execution_ready', snapshot_consistency: 'stable',
        task_id: '1'.repeat(64), task_revision: '2'.repeat(64),
        offer_revision: DIGEST, authorization_revision: 7,
      },
      dependencies: [],
      concurrency_available: true,
      concurrency_revision: DIGEST,
      active_claims: 0,
    });
    expect(candidate.eligible).toBe(true);
    if (!candidate.eligible) throw new Error('expected offer');
    expect(validateEngineerOffer(candidate.offer)).toEqual(candidate.offer);
    expect(() => validateEngineerOffer({ ...candidate.offer, priority: 51 })).toThrow('revision is invalid');
    const document = buildEngineerOffersDocument({
      repository_id: REPO,
      engineer_id: `engineer:${CAPABILITY}`,
      lane: 'engineering-v2',
      work_graph_revision: projected.work_graph_revision,
      candidates: [candidate],
    });
    expect(document.offers).toHaveLength(1);
    expect(document.snapshot_revision).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('emits closed exclusion reasons instead of partially eligible offers', () => {
    const projected = projectWorkGraph(graph([
      workPackage('wp-a', 'task A', [{ repository_id: REPO, work_package_id: 'wp-b', required_state: 'product_accepted', acceptance_authority: PRODUCT_AUTHORITY }]),
      workPackage('wp-b', 'task B'),
    ]), [task(), task('task B', '3', '4', 2)]);
    const candidate = buildEngineerOfferCandidate({
      graph: projected,
      work_package: projected.work_packages[0],
      engineer: {
        engineer_id: `engineer:${CAPABILITY}`,
        capability_id: CAPABILITY,
        engineer_contract_revision: DIGEST,
        max_active_claims: 1,
      },
      binding: { state: 'active', binding_id: '11111111-1111-4111-8111-111111111111', binding_generation: 1 },
      fleet_offer: null,
      dependencies: [{ repository_id: REPO, work_package_id: 'wp-b', required_state: 'product_accepted', acceptance_authority: PRODUCT_AUTHORITY, status: 'authority_unavailable', authority_revision: null }],
      concurrency_available: false,
      concurrency_revision: DIGEST,
      active_claims: 1,
    });
    expect(candidate.eligible).toBe(false);
    if (candidate.eligible) throw new Error('expected exclusion');
    expect(candidate.exclusion.blockers).toEqual([
      'fleet_offer_unavailable',
      'dependency_authority_unavailable',
      'concurrency_unavailable',
      'active_claim_limit',
    ]);
  });

  test('isolates each ineligibility branch to its own closed blocker code', () => {
    const solo = projectWorkGraph(graph([workPackage()]), [task()]);
    const ready = {
      graph: solo,
      work_package: solo.work_packages[0],
      engineer: {
        engineer_id: `engineer:${CAPABILITY}`,
        capability_id: CAPABILITY,
        engineer_contract_revision: DIGEST,
        max_active_claims: 1,
      },
      binding: { state: 'active' as const, binding_id: '11111111-1111-4111-8111-111111111111', binding_generation: 1 },
      fleet_offer: {
        execution_readiness: 'execution_ready', snapshot_consistency: 'stable',
        task_id: '1'.repeat(64), task_revision: '2'.repeat(64),
        offer_revision: DIGEST, authorization_revision: 7,
      },
      dependencies: [],
      concurrency_available: true,
      concurrency_revision: DIGEST,
      active_claims: 0,
    };
    expect(buildEngineerOfferCandidate(ready).eligible).toBe(true);

    const OTHER_CAPABILITY = 'capability.verification.evals-checks';
    const mismatched = buildEngineerOfferCandidate({
      ...ready,
      engineer: { ...ready.engineer, engineer_id: `engineer:${OTHER_CAPABILITY}`, capability_id: OTHER_CAPABILITY },
    });
    expect(mismatched.eligible).toBe(false);
    if (mismatched.eligible) throw new Error('expected exclusion');
    expect(mismatched.exclusion.blockers).toEqual(['profile_capability_mismatch']);
    expect(mismatched.exclusion.engineer_id).toBe(`engineer:${OTHER_CAPABILITY}`);

    const retired = buildEngineerOfferCandidate({
      ...ready,
      binding: { state: 'retired', binding_id: '11111111-1111-4111-8111-111111111111', binding_generation: 1 },
    });
    expect(retired.eligible).toBe(false);
    if (retired.eligible) throw new Error('expected exclusion');
    expect(retired.exclusion.blockers).toEqual(['binding_inactive']);

    const chained = projectWorkGraph(graph([
      workPackage('wp-a', 'task A', [{ repository_id: REPO, work_package_id: 'wp-b', required_state: 'canonical_done', acceptance_authority: null }]),
      workPackage('wp-b', 'task B'),
    ]), [task(), task('task B', '3', '4', 2)]);
    const unsatisfied = buildEngineerOfferCandidate({
      ...ready,
      graph: chained,
      work_package: chained.work_packages.find((item) => item.work_package_id === 'wp-a')!,
      dependencies: [{
        repository_id: REPO, work_package_id: 'wp-b', required_state: 'canonical_done',
        acceptance_authority: null, status: 'unsatisfied', authority_revision: DIGEST,
      }],
    });
    expect(unsatisfied.eligible).toBe(false);
    if (unsatisfied.eligible) throw new Error('expected exclusion');
    expect(unsatisfied.exclusion.blockers).toEqual(['dependency_not_ready']);
    expect(unsatisfied.exclusion.work_package_id).toBe('wp-a');
  });

  test('validates a 100-node acyclic graph within the P0 target', () => {
    const definitions = Array.from({ length: 100 }, (_, index) => workPackage(
      `wp-${String(index).padStart(3, '0')}`,
      `task ${index}`,
      index === 0 ? [] : [{ repository_id: REPO, work_package_id: `wp-${String(index - 1).padStart(3, '0')}`, required_state: 'canonical_done', acceptance_authority: null }],
    ));
    const tasks = Array.from({ length: 100 }, (_, index) => task(
      `task ${index}`,
      index.toString(16).padStart(64, '0'),
      (index + 100).toString(16).padStart(64, '0'),
      index + 1,
    ));
    const started = performance.now();
    validateWorkGraphTopology([projectWorkGraph(graph(definitions), tasks)]);
    expect(performance.now() - started).toBeLessThan(3_000);
  });
});
