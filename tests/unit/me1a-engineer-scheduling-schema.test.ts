import { buildProviderEngineerOffers, validateProviderEngineerOffers } from '../../src/core/engineers/scheduling';
import { readFileSync } from 'node:fs';
import { projectProviderWorkGraph, validateProviderWorkGraph, validateProviderWorkGraphTopology } from '../../src/core/engineers/scheduling';
import { describe, expect, test } from 'bun:test';

import {
  EngineerSchedulingError,
  projectWorkGraph,
  schedulingCarrierPath,
  validateWorkGraph,
  validateModuleAcceptanceReference,
  validateIntegrationDependencyReference,
  validateWorkGraphTopology,
  type SchedulingCanonicalTask,
  type WorkGraphV1,
} from '../../src/core/engineers/scheduling';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const REPO = 'repo_0123456789abcdef';
const OTHER_REPO = 'repo_fedcba9876543210';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const CAPABILITY = 'capability.workflow-engine.contract-assets';
const MODULE_AUTHORITY = {
  authority_kind: 'module_acceptance',
  subject_ref: 'plans/review/wp-b.admission.json',
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
    task_id: fixtureTaskId(taskRef),
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
    retry_policy: { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'], backoff: { kind: 'exponential', initial_seconds: 30, maximum_seconds: 300 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' } as const,
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
    task_id: fixtureTaskId(ref),
    task_revision: revision.length === 64 ? revision : revision.repeat(64),
    task_ref: ref,
    status: '[ ]',
    row_order: rowOrder,
  };
}

describe('ME-1A closed scheduling schema', () => {
  test('requires explicit provider selectors and accepts several PRs for one issue', () => {
    const edge = { repository_id: REPO, work_package_id: 'wp-b', required_state: 'publication_integrated', acceptance_authority: null };
    expect(() => graph([workPackage('wp-a', 'task A', [edge]), workPackage('wp-b', 'task B')])).toThrow('authority reference');
    expect(() => graph([workPackage('wp-a', 'task A', [{ ...edge, acceptance_authority: {
      authority_kind: 'provider_integration', subject_ref: 'plans/integration/selected.json', subject_revision: DIGEST,
    } }]), workPackage('wp-b', 'task B')])).not.toThrow();
    const pr = { provider_repository_id: '1001', repository: 'example/product', issue_id: '2001', issue_number: 903,
      pr_number: 1, expected_head_sha: 'a'.repeat(40), expected_base_sha: 'b'.repeat(40) };
    const selector = { protocol: 2, task_id: 'a'.repeat(64), task_revision: 'b'.repeat(64),
      final_head_sha: 'c'.repeat(40), final_tree_sha: 'd'.repeat(40), required_pull_requests: [pr, { ...pr, pr_number: 2 }], product: null };
    expect(validateIntegrationDependencyReference(selector).required_pull_requests).toHaveLength(2);
    expect(() => validateIntegrationDependencyReference({ ...selector, required_pull_requests: [pr, pr] })).toThrow('duplicate');
    expect(() => validateIntegrationDependencyReference({ ...selector, protocol: 1 })).toThrow('protocol');
    expect(() => validateIntegrationDependencyReference({ ...selector, final_tree_sha: null })).toThrow();
  });

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
      .toThrow('task_id is absent');
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
    ]), [task(), { ...task('task B', '1', '3', 2), task_id: fixtureTaskId('task A') }])).toThrow('duplicate task_id');
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


test('module acceptance selector is a closed typed locator with exact approved digests', () => {
  const selector = { protocol: 1 as const, provider_repository_id: 'R_provider', issue_id: 'I_goal', campaign_id: 'campaign',
    admission_sha256: DIGEST, grant_sha256: DIGEST, policy_sha256: DIGEST, actor_id: 'U_owner' };
  expect(validateModuleAcceptanceReference(selector)).toEqual(selector);
  expect(Object.isFrozen(validateModuleAcceptanceReference(selector))).toBe(true);
  for (const field of Object.keys(selector)) {
    const missing = { ...selector } as Record<string, unknown>; delete missing[field];
    expect(() => validateModuleAcceptanceReference(missing)).toThrow();
  }
  for (const field of ['admission_sha256', 'grant_sha256', 'policy_sha256']) {
    expect(() => validateModuleAcceptanceReference({ ...selector, [field]: 'not-a-digest' })).toThrow();
  }
  for (const field of ['provider_repository_id', 'issue_id', 'campaign_id', 'actor_id']) {
    expect(() => validateModuleAcceptanceReference({ ...selector, [field]: '' })).toThrow();
  }
  expect(() => validateModuleAcceptanceReference({ ...selector, repoRoot: '/candidate-selected' })).toThrow();
  expect(() => validateModuleAcceptanceReference({ ...selector, issuePolicy: {} })).toThrow();
  expect(() => validateModuleAcceptanceReference({ ...selector, protocol: 2 })).toThrow();
});


describe('provider work graph V2', () => {
  const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/provider-work-graph-v2/graph.json', import.meta.url), 'utf8'));
  const issues = { protocol: 1 as const, kind: 'repo-harness-external-source-projection' as const,
    registered_repository_id: REPO, latest_attempt: null, latest_complete_refresh: null, issues: [] };
  test('authored provider IDs survive projection without a Sprint or fabricated completion', () => {
    const graph = projectProviderWorkGraph(fixture(), issues, { commit: 'a'.repeat(40), graph_path: '.ai/harness/work-graph.v2.json' });
    expect(graph.work_packages[0]!.task).toEqual({ provider_repository_id: '123456', issue_id: '987654' });
    expect(graph.work_packages[0]!.issue).toBeNull();
    expect(graph.work_packages[0]!.execution_surface).toBe('admitted_session');
    validateProviderWorkGraphTopology([graph]);
  });
  test('legacy and guessed task mappings are refused', () => {
    expect(() => validateProviderWorkGraph({ protocol: 1, kind: 'repo-harness-work-graph', repository_id: REPO, sprint_path: 'legacy.sprint.md', lane: 'generic-v1', work_packages: [] })).toThrow();
    const graph = fixture(); graph.work_packages[0].task.issue_id = 'issue title';
    expect(() => validateProviderWorkGraph(graph)).toThrow();
  });
  test('provider completion edges cannot carry acceptance authority and cycles are refused', () => {
    const graph = fixture(); graph.work_packages[0].depends_on = [{ repository_id: REPO, work_package_id: 'provider-graph', required_state: 'provider_closed', acceptance_authority: MODULE_AUTHORITY }];
    expect(() => validateProviderWorkGraph(graph)).toThrow();
    graph.work_packages[0].depends_on[0].acceptance_authority = null;
    const projected = projectProviderWorkGraph(graph, issues, { commit: 'a'.repeat(40), graph_path: '.ai/harness/work-graph.v2.json' });
    expect(() => validateProviderWorkGraphTopology([projected])).toThrow();
  });
});


describe('provider engineer offer observations', () => {
  const input = () => ({ repository_id: REPO, engineer_id: `engineer:${CAPABILITY}`,
    engineer_contract_revision: DIGEST, session_binding_sha256: DIGEST, planning_revision: DIGEST, authorization_revision: 1,
    offers: [{ provider_repository_id: '123456', issue_id: '987654', source_revision: DIGEST, eligible: true, blockers: [] }] });
  test('an unchanged issue set still pins exact planning evidence', () => {
    const first = buildProviderEngineerOffers(input());
    const second = buildProviderEngineerOffers({ ...input(), planning_revision: `sha256:${'b'.repeat(64)}` });
    expect(first.snapshot_revision).not.toBe(second.snapshot_revision);
    expect(() => validateProviderEngineerOffers({ ...first, authorization_revision: 2 })).toThrow();
  });
  test('missing provider evidence cannot become an eligible offer', () => {
    expect(() => buildProviderEngineerOffers({ ...input(), offers: [{ ...input().offers[0]!, source_revision: null }] })).toThrow();
    const blocked = buildProviderEngineerOffers({ ...input(), offers: [{ ...input().offers[0]!, source_revision: null, eligible: false, blockers: ['provider_unavailable'] }] });
    expect(blocked.offers[0]!.eligible).toBe(false);
  });
});
