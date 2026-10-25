import { afterEach, describe, expect, test } from 'bun:test';

import { buildExternalSourceRefreshReceipt, buildProviderIssueObservation, type ExternalSourceRefreshReceiptV1 } from '../../src/core/external-sources/issue-observation';
import { rmSync } from 'node:fs';
import { externalSourceBindingFixture } from '../helpers/external-source-binding-fixture';
import { revokeReviewAdmission } from '../../src/effects/review/admission-store';
import { bindExternalSource, listExternalSourceBindings, type ExternalSourceBindingDependencies } from '../../src/effects/external-sources/binding';


const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
let REPO_ID = '';
function observation(body = 'request') {
  return buildProviderIssueObservation({
    registered_repository_id: REPO_ID, provider: 'github', provider_host: 'github.com', provider_repository_id: '101', provider_issue_id: '202',
    display_ref: 'acme/widgets#7', url: 'https://github.com/acme/widgets/issues/7', observed_at: body === 'request' ? '2026-09-01T00:00:00.000Z' : '2026-09-01T01:00:00.000Z',
    provider_created_at: null, provider_updated_at: null, state: 'open', title: 'issue', body, labels: ['ready'], assignees: [], comments_policy: 'omitted',
    policy_revision: `sha256:${'c'.repeat(64)}`, eligible: true, eligibility_reasons: [],
  });
}

async function harness(observations?: ReturnType<typeof observation>[], refreshReceipts: readonly ExternalSourceRefreshReceiptV1[] = []) {
  const fixture = await externalSourceBindingFixture(); roots.push(fixture.directory); REPO_ID = fixture.repoId;
  const written: ReturnType<typeof bindExternalSource>[] = [];
  const repo = { id: REPO_ID, path: fixture.root, accessMode: 'read_write' as const, source: 'manual' as const, registeredAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-09-01T00:00:00Z' };
  const deps: ExternalSourceBindingDependencies = {
    registry: () => ({ registryPath: '/registry', registryRevision: `sha256:${'d'.repeat(64)}`, authorizationRevision: 4, repos: [repo] }),
    observations: () => observations ?? [observation()], refreshReceipts: () => refreshReceipts, receipts: () => written,
    admissionSource: () => fixture.source.authority.source,
    write: (_root, receipt) => { const existing = written.find(entry => entry.binding_id === receipt.binding_id); if (existing) return existing; written.push(receipt); return receipt; },
  };
  return { deps, written, fixture };
}

describe('external source binding effect', () => {
  test('revalidates and persists an exact admitted-session edge without execution authority', async () => {
    const item = await harness();
    const source = observation();
    const receipt = bindExternalSource({ registered_repository_id: REPO_ID, source_revision: source.source_revision, session: item.fixture.session, bound_at: '2026-09-01T02:00:00.000Z' }, item.deps);
    expect(receipt.session).toEqual(item.fixture.session);
    expect(receipt.admission_sha256).toBe(item.fixture.admission.approval.admission_sha256);
    expect(JSON.stringify(receipt)).not.toContain('execution_ready');
    expect(item.written).toHaveLength(1);
  });

  test('uses the immutable observation timestamp so retries without an injected clock are byte-idempotent', async () => {
    const item = await harness();
    const source = observation();
    const input = { registered_repository_id: REPO_ID, source_revision: source.source_revision, session: item.fixture.session } as const;
    const first = bindExternalSource(input, item.deps);
    const second = bindExternalSource(input, item.deps);
    expect(second).toEqual(first);
    expect(first.bound_at).toBe(source.observed_at);
    expect(item.written).toHaveLength(1);
  });

  test('projects source drift while preserving the immutable bound revision', async () => {
    const item = await harness();
    const first = observation();
    const later = observation('changed request');
    const receipt = bindExternalSource({ registered_repository_id: REPO_ID, source_revision: first.source_revision, session: item.fixture.session, bound_at: '2026-09-01T02:00:00.000Z' }, item.deps);
    const projection = listExternalSourceBindings(REPO_ID, undefined, { ...item.deps, observations: () => [first, later] });
    expect(projection.bindings[0].source_status).toBe('drifted');
    expect(projection.bindings[0].attention).toBe('source_drift');
    expect(projection.bindings[0].receipt.source_revision).toBe(first.source_revision);
  });

  test('projects a repeated refresh of the bound revision as current, not drifted', async () => {
    const item = await harness();
    const first = observation();
    const changed = observation('changed request');
    const repeated = buildExternalSourceRefreshReceipt({
      registered_repository_id: REPO_ID, provider: 'github', provider_host: 'github.com', provider_repository_id: '101', provider_display_ref: 'acme/widgets#7',
      policy_revision: `sha256:${'c'.repeat(64)}`, started_at: '2026-09-01T02:30:00.000Z', completed_at: '2026-09-01T03:00:00.000Z',
      outcome: 'complete', pages_fetched: 1, issues_seen: 1, observations_written: 1,
      limits: { max_pages: 1, max_issues: 10, max_body_bytes: 1024, max_total_bytes: 8192, deadline_ms: 1000 },
      source_revisions: [first.source_revision], failure: null,
    });
    const deps = { ...item.deps, observations: () => [first, changed], refreshReceipts: () => [repeated] };
    const receipt = bindExternalSource({ registered_repository_id: REPO_ID, source_revision: first.source_revision, session: item.fixture.session, bound_at: '2026-09-01T02:00:00.000Z' }, deps);
    const projection = listExternalSourceBindings(REPO_ID, undefined, deps);
    expect(projection.bindings[0].source_status).toBe('current');
    expect(projection.bindings[0].attention).toBe('none');
    expect(projection.bindings[0].receipt).toEqual(receipt);
  });

  test('rejects ineligible observations before persistence', async () => {
    const item = await harness();
    const source = buildProviderIssueObservation({ ...((({ protocol: _p, kind: _k, source_revision: _s, observation_sha256: _o, ...rest }) => rest)(observation())), eligible: false, eligibility_reasons: ['missing-label'] });
    const deps = { ...item.deps, observations: () => [source] };
    expect(() => bindExternalSource({ registered_repository_id: REPO_ID, source_revision: source.source_revision, session: item.fixture.session }, deps)).toThrow('not eligible');
    expect(item.written).toHaveLength(0);
  });
  test('rejects a revoked grant and a different provider issue before persistence', async () => {
    const item = await harness(), source = observation();
    const input = { registered_repository_id: REPO_ID, source_revision: source.source_revision, session: item.fixture.session };
    const different = buildProviderIssueObservation({ ...source, provider_issue_id: '999' });
    expect(() => bindExternalSource({ ...input, source_revision: different.source_revision },
      { ...item.deps, observations: () => [different] })).toThrow('source provider identity differs');
    const f = item.fixture;
    revokeReviewAdmission({ repoRoot: f.root, authorityHome: f.home, repository_id: '101', issue_id: '202',
      campaign_id: f.admission.identity.campaign_id, expectedRevision: 1 });
    expect(() => bindExternalSource(input, item.deps)).toThrow('revoked_or_replaced');
    expect(item.written).toHaveLength(0);
  });
  test('rejects registry authorization changes between admission observations', async () => {
    const item = await harness(), source = observation();
    let reads = 0;
    const original = item.deps.registry();
    expect(() => bindExternalSource({ registered_repository_id: REPO_ID, source_revision: source.source_revision, session: item.fixture.session },
      { ...item.deps, registry: () => ({ ...original, authorizationRevision: original.authorizationRevision + reads++ }) })).toThrow('changed during revalidation');
    expect(item.written).toHaveLength(0);
  });

  test('refuses a replaced session binding without writing a new correlation', async () => {
    const item = await harness(), source = observation();
    expect(() => bindExternalSource({ registered_repository_id: REPO_ID, source_revision: source.source_revision,
      session: { ...item.fixture.session, session_binding_sha256: `sha256:${'0'.repeat(64)}` } }, item.deps)).toThrow('session binding changed');
    expect(item.written).toHaveLength(0);
  });

});
