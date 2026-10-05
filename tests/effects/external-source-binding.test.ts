import { describe, expect, test } from 'bun:test';

import { buildExternalSourceRefreshReceipt, buildProviderIssueObservation, type ExternalSourceRefreshReceiptV1 } from '../../src/core/external-sources/issue-observation';
import { deriveTaskRevision } from '../../src/core/state/coordination-identity';
import { bindExternalSource, listExternalSourceBindings, type ExternalSourceBindingDependencies } from '../../src/effects/external-sources/binding';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const REPO_ID = 'repo_0123456789abcdef';
const SPRINT = 'plans/sprints/intake.sprint.md';
const TASK = 'implement intake';
const TASK_ID = fixtureTaskId(TASK);
const TASK_REVISION = deriveTaskRevision({ taskCell: TASK, taskId: TASK_ID, modeCell: 'contract', acceptanceCell: 'tests pass' });
const PLAN = { plan_path: 'plans/plan-intake.md', contract_path: 'tasks/contracts/intake.contract.md', source_ref: `sprint:${SPRINT}#${TASK}`, plan_sha256: `sha256:${'a'.repeat(64)}`, contract_sha256: `sha256:${'b'.repeat(64)}`, projectable: true as const };

function observation(body = 'request') {
  return buildProviderIssueObservation({
    registered_repository_id: REPO_ID, provider: 'github', provider_host: 'github.com', provider_repository_id: '101', provider_issue_id: '202',
    display_ref: 'acme/widgets#7', url: 'https://github.com/acme/widgets/issues/7', observed_at: body === 'request' ? '2026-09-01T00:00:00.000Z' : '2026-09-01T01:00:00.000Z',
    provider_created_at: null, provider_updated_at: null, state: 'open', title: 'issue', body, labels: ['ready'], assignees: [], comments_policy: 'omitted',
    policy_revision: `sha256:${'c'.repeat(64)}`, eligible: true, eligibility_reasons: [],
  });
}

function harness(observations = [observation()], refreshReceipts: readonly ExternalSourceRefreshReceiptV1[] = []): { deps: ExternalSourceBindingDependencies; written: ReturnType<typeof bindExternalSource>[] } {
  const written: ReturnType<typeof bindExternalSource>[] = [];
  const repo = { id: REPO_ID, path: '/repo', accessMode: 'read_write' as const, source: 'manual' as const, registeredAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-09-01T00:00:00Z' };
  const deps: ExternalSourceBindingDependencies = {
    registry: () => ({ registryPath: '/registry', registryRevision: `sha256:${'d'.repeat(64)}`, authorizationRevision: 4, repos: [repo] }),
    observations: () => observations,
    refreshReceipts: () => refreshReceipts,
    receipts: () => written,
    canonical: () => ({ ok: true, commit: 'e'.repeat(40), text: `# Sprint\n\n> **Status**: Executing\n> **Backlog Schema**: 2\n\n## Backlog\n\n| # | ID | Status | Task | Mode | Acceptance | Plan |\n|---|----|---|---|---|---|---|\n| 1 | ${TASK_ID} | [ ] | ${TASK} | contract | tests pass | plan |\n` }),
    plan: () => ({ ok: true, proof: PLAN }),
    repoIdentity: () => '/git/common',
    write: (_root, receipt) => { const existing = written.find((entry) => entry.binding_id === receipt.binding_id); if (existing) return existing; written.push(receipt); return receipt; },
  };
  return { deps, written };
}

describe('external source binding effect', () => {
  test('revalidates and persists an exact canonical edge without execution authority', () => {
    const item = harness();
    const source = observation();
    const receipt = bindExternalSource({ registered_repository_id: REPO_ID, source_revision: source.source_revision, sprint_path: SPRINT, task_id: TASK_ID, target_ref: 'main', bound_at: '2026-09-01T02:00:00.000Z' }, item.deps);
    expect(receipt.task_revision).toBe(TASK_REVISION);
    expect(receipt.plan_sha256).toBe(PLAN.plan_sha256);
    expect(JSON.stringify(receipt)).not.toContain('execution_ready');
    expect(item.written).toHaveLength(1);
  });

  test('uses the immutable observation timestamp so retries without an injected clock are byte-idempotent', () => {
    const item = harness();
    const source = observation();
    const input = { registered_repository_id: REPO_ID, source_revision: source.source_revision, sprint_path: SPRINT, task_id: TASK_ID, target_ref: 'main' } as const;
    const first = bindExternalSource(input, item.deps);
    const second = bindExternalSource(input, item.deps);
    expect(second).toEqual(first);
    expect(first.bound_at).toBe(source.observed_at);
    expect(item.written).toHaveLength(1);
  });

  test('projects source drift while preserving the immutable bound revision', () => {
    const first = observation();
    const later = observation('changed request');
    const item = harness([first]);
    const receipt = bindExternalSource({ registered_repository_id: REPO_ID, source_revision: first.source_revision, sprint_path: SPRINT, task_id: TASK_ID, target_ref: 'main', bound_at: '2026-09-01T02:00:00.000Z' }, item.deps);
    const drifted = harness([first, later]);
    drifted.written.push(receipt);
    const projection = listExternalSourceBindings(REPO_ID, undefined, drifted.deps);
    expect(projection.bindings[0].source_status).toBe('drifted');
    expect(projection.bindings[0].attention).toBe('source_drift');
    expect(projection.bindings[0].receipt.source_revision).toBe(first.source_revision);
  });

  test('projects a repeated refresh of the bound revision as current, not drifted', () => {
    const first = observation();
    const changed = observation('changed request');
    const repeated = buildExternalSourceRefreshReceipt({
      registered_repository_id: REPO_ID, provider: 'github', provider_host: 'github.com', provider_repository_id: '101', provider_display_ref: 'acme/widgets#7',
      policy_revision: `sha256:${'c'.repeat(64)}`, started_at: '2026-09-01T02:30:00.000Z', completed_at: '2026-09-01T03:00:00.000Z',
      outcome: 'complete', pages_fetched: 1, issues_seen: 1, observations_written: 1,
      limits: { max_pages: 1, max_issues: 10, max_body_bytes: 1024, max_total_bytes: 8192, deadline_ms: 1000 },
      source_revisions: [first.source_revision], failure: null,
    });
    const item = harness([first, changed], [repeated]);
    const receipt = bindExternalSource({ registered_repository_id: REPO_ID, source_revision: first.source_revision, sprint_path: SPRINT, task_id: TASK_ID, target_ref: 'main', bound_at: '2026-09-01T02:00:00.000Z' }, item.deps);
    const projection = listExternalSourceBindings(REPO_ID, undefined, item.deps);
    expect(projection.bindings[0].source_status).toBe('current');
    expect(projection.bindings[0].attention).toBe('none');
    expect(projection.bindings[0].receipt).toEqual(receipt);
  });

  test('rejects ineligible observations before persistence', () => {
    const source = buildProviderIssueObservation({ ...((({ protocol: _p, kind: _k, source_revision: _s, observation_sha256: _o, ...rest }) => rest)(observation())), eligible: false, eligibility_reasons: ['missing-label'] });
    const item = harness([source]);
    expect(() => bindExternalSource({ registered_repository_id: REPO_ID, source_revision: source.source_revision, sprint_path: SPRINT, task_id: TASK_ID, target_ref: 'main' }, item.deps)).toThrow('not eligible');
    expect(item.written).toHaveLength(0);
  });
});
