import { buildProviderEngineerOffers, validateProviderEngineerOffers } from '../../src/core/engineers/scheduling';
import { readFileSync } from 'node:fs';
import { projectProviderWorkGraph, validateProviderWorkGraph, validateProviderWorkGraphTopology } from '../../src/core/engineers/scheduling';
import { describe, expect, test } from 'bun:test';

import {
  validateModuleAcceptanceReference,
  validateIntegrationDependencyReference,
} from '../../src/core/engineers/scheduling';

const REPO = 'repo_0123456789abcdef';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const CAPABILITY = 'capability.workflow-engine.contract-assets';
const MODULE_AUTHORITY = {
  authority_kind: 'module_acceptance',
  subject_ref: 'plans/review/wp-b.admission.json',
  subject_revision: DIGEST,
} as const;

test('integration dependency selectors accept several PRs for one issue', () => {
  const pr = { provider_repository_id: '1001', repository: 'example/product', issue_id: '2001', issue_number: 903,
    pr_number: 1, expected_head_sha: 'a'.repeat(40), expected_base_sha: 'b'.repeat(40) };
  const selector = { protocol: 2, task_id: 'a'.repeat(64), task_revision: 'b'.repeat(64),
    final_head_sha: 'c'.repeat(40), final_tree_sha: 'd'.repeat(40), required_pull_requests: [pr, { ...pr, pr_number: 2 }], product: null };
  expect(validateIntegrationDependencyReference(selector).required_pull_requests).toHaveLength(2);
  expect(() => validateIntegrationDependencyReference({ ...selector, required_pull_requests: [pr, pr] })).toThrow('duplicate');
  expect(() => validateIntegrationDependencyReference({ ...selector, protocol: 1 })).toThrow('protocol');
  expect(() => validateIntegrationDependencyReference({ ...selector, final_tree_sha: null })).toThrow();
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
