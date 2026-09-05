import { buildProviderIssueObservation, buildExternalSourceRefreshReceipt } from '../../src/core/external-sources/issue-observation';
import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sealProgramAuthorization, validateAutomationReservation } from '../../src/core/automation/budget';
import { buildDevelopmentCampaignDefinition } from '../../src/core/automation/development-campaign';
import { createDevelopmentCampaign, appendDevelopmentCampaignEvent } from '../../src/effects/automation/development-campaign-store';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { startIssueBatchAuthoring } from '../../src/effects/automation/gpt-pro-issue-authoring';
import { adoptIssueBatch, type IssueBatchAdoptionDependencies } from '../../src/effects/automation/issue-batch-adoption';
import { readIssueBatchAdoptionArtifact } from '../../src/effects/automation/issue-batch-store';
import { AUTOMATION_BUDGET_STORE_RELATIVE_ROOT, appendAutomationUsage, reconcileAutomationReservation, ensureCampaignAuthoringBudget, readCampaignAuthoringBudgetTerminal, reserveCampaignAuthoringBudget } from '../../src/effects/automation/budget-store';
import { makeSnapshot, AT, CAP, policy } from '../helpers/issue-batch-adoption-fixture';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const SPRINT = 'plans/sprints/repair.sprint.md';
function git(root: string, args: string[]) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
async function fixture(mode: 'shadow' | 'active' = 'active', rounds = 1) {
  const root = mkdtempSync(join(tmpdir(), 'brc6-adoption-')); const home = mkdtempSync(join(tmpdir(), 'brc6-home-')); roots.push(root, home);
  git(root, ['init', '-q', '-b', 'main']); git(root, ['config', 'user.name', 'Test']); git(root, ['config', 'user.email', 'test@example.invalid']);
  for (const path of ['.ai/harness', '.archcontext/model/nodes', 'src', 'plans/sprints', 'plans/policies']) mkdirSync(join(root, path), { recursive: true });
  writeFileSync(join(root, 'src/index.ts'), 'export {};\n');
  writeFileSync(join(root, '.archcontext/model/nodes/capability.yaml'), JSON.stringify({ schemaVersion: 'archcontext.node/v2', id: CAP, kind: 'capability', name: 'Campaign', status: 'active', summary: 'Fixture capability', responsibilities: ['Own fixture'], source: { include: ['src/**'] }, extensions: { contractFiles: { agents: 'AGENTS.md', claude: 'CLAUDE.md' }, lspProfile: 'typescript-lsp', verification: [] } }));
  writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({ development_campaign: { version: 1, mode, limits: { maximum_group_count: 1, maximum_issues_per_group: 2, maximum_parallel_tasks: 2 } }, external_sources: { version: 1, mode: 'manual', github: { enabled: true, repository: 'acme/widgets', selection: { kind: 'labels', labels_all: ['campaign'], assignees_any: [] }, limits: { max_pages: 2, max_issues: 20, max_body_bytes: 8192, max_total_bytes: 65536, deadline_ms: 1000 } } } }));
  writeFileSync(join(root, 'plans/policies/repair.json'), 'repair');
  writeFileSync(join(root, 'plans/policies/publication.json'), JSON.stringify(policy));
  const repository = repoHarnessRepoIdFor(root);
  writeFileSync(join(root, SPRINT), '# Sprint: repair\n\n> **Status**: Approved\n> **Backlog Schema**: 2\n\n## Backlog\n\n| # | ID | Status | Task | Mode | Acceptance | Plan |\n|---|----|---|---|---|---|---|\n\n## Execution Log\n');
  writeFileSync(join(root, 'plans/sprints/repair.work-graph.v1.json'), JSON.stringify({ protocol: 1, kind: 'repo-harness-work-graph', repository_id: repository, sprint_path: SPRINT, lane: 'generic-v1', work_packages: [] }));
  git(root, ['add', '.']); git(root, ['commit', '-qm', 'base']); const revision = git(root, ['rev-parse', 'HEAD']);
  const authorization = sealProgramAuthorization({ authorization_id: 'auth-1', repository_id: repository, target_ref: 'refs/heads/main', target_revision: revision, work_graph_revision: 'a'.repeat(64), allowed_work_package_ids: ['campaign-1'], allowed_risk_tiers: ['low'], merge_mode: 'manual', allowed_merge_method: 'squash', max_repair_cycles: 2, budget: { max_agent_turns: 10, max_successful_acquisitions: 2, max_runner_invocations: 10, max_provider_failures: 2, max_consecutive_no_progress_steps: 2, max_repair_cycles: 2, max_wall_clock_seconds: 3600, max_input_tokens: null, max_output_tokens: null, max_cost_micros: null }, contract_scope: 'contract_less', contract_path: null, campaign: { campaign_id: 'campaign-1', group_count: 1, issues_per_group: 2, allowed_issue_kinds: ['bugfix', 'test_gap'], max_parallel_tasks: 2, issue_author: 'gpt_pro', local_parent_host: 'codex', chrome_profile_directory: 'Profile 1', max_authoring_rounds_per_group: rounds, require_fresh_main_audit: true }, issued_by: 'owner', issued_at: AT, expires_at: '2027-09-05T00:00:00.000Z' });
  const env = { ...process.env, REPO_HARNESS_HOME: home };
  mintProgramAuthorization({ repo_root: root, authorization, env });
  const campaign = buildDevelopmentCampaignDefinition({ campaign_id: 'campaign-1', authorization_id: authorization.authorization_id, authorization_sha256: authorization.authorization_sha256, repository_id: repository, target_ref: authorization.target_ref, target_revision: revision, created_at: AT });
  const created = createDevelopmentCampaign({ repo_root: root, campaign, idempotency_key: 'start', env });
  appendDevelopmentCampaignEvent({ repo_root: root, campaign_id: campaign.campaign_id, expected_current_sha256: created.current.current_sha256, idempotency_key: 'prepare', operation: 'prepare_group', observed_at: AT, env });
  const readBinding = () => ({ path: 'binding', binding: { profileDir: home, profileDirectory: 'Profile 1' } });
  const started = await startIssueBatchAuthoring({ repo_root: root, campaign_id: campaign.campaign_id, group_number: 1, env }, { readBinding, now: () => AT, consult: async () => ({ sessionId: 'initial', status: 'completed', meta: { model: { verified: true } } }) });
  const input = { repo_root: root, campaign_id: campaign.campaign_id, group_number: 1, intent_sha256: started.intent.intent_sha256, sprint_path: SPRINT, publication_policy_path: 'plans/policies/publication.json', env };
  let calls = 0;
  const deps: IssueBatchAdoptionDependencies = { readBinding, readSession: () => { throw new Error('unresolved'); }, now: () => new Date(AT), observe: () => makeSnapshot(started.intent), followup: async request => {
    calls++;
    const data = JSON.parse(request.prompt.split('\n\n')[2]!);
    const answers = data.targets.map((t: { kind: string; path: string; line: number }) => t.kind === 'directory_entries'
      ? git(root, ['ls-tree', '--name-only', `${revision}:${t.path}`]).split('\n').sort().join('\n')
      : t.kind === 'text_line' ? git(root, ['show', `${revision}:${t.path}`]).split('\n')[t.line - 1]
      : createHash('sha256').update(execFileSync('git', ['show', `${revision}:${t.path}`], { cwd: root })).digest('hex'));
    return { sessionId: 'challenge', status: 'completed', output: JSON.stringify({ base_main_sha: revision, answers }), meta: { model: { verified: true } } };
  } };
  return { root, env, intent: started.intent, authorization, input, deps, calls: () => calls };
}
function terminal(f: Awaited<ReturnType<typeof fixture>>) {
  const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env });
  return readCampaignAuthoringBudgetTerminal({ repo_root: f.root, automation_run_id: budget.budget.automation_run_id, expected_budget_sha256: budget.budget.budget_sha256, campaign_id: f.intent.campaign_id, group_number: 1, intent_sha256: f.intent.intent_sha256, env: f.env });
}
describe('BRC6 budgeted challenge and adoption', () => {
  test('challenge completes before seal; full batch seals early and replay makes no provider calls', async () => {
    const f = await fixture('active', 3);
    const result = await adoptIssueBatch(f.input, f.deps);
    expect(result.receipt.issues).toHaveLength(2); expect(result.publication).not.toBeNull(); expect(f.calls()).toBe(1);
    expect(terminal(f)?.reason).toBe('authoring_completed'); expect(terminal(f)?.completed_authoring_rounds).toBe(1);
    expect(await adoptIssueBatch(f.input, f.deps)).toEqual(result); expect(f.calls()).toBe(1);
    git(f.root, ['update-ref', 'refs/heads/main', result.publication!.materialized_commit, f.intent.base_main_sha]);
    expect(await adoptIssueBatch(f.input, f.deps)).toEqual(result); expect(f.calls()).toBe(1);
  });
  test('partial batch adopts only after exhaustion and shadow dry-run publishes no ref', async () => {
    const f = await fixture('shadow');
    const result = await adoptIssueBatch({ ...f.input, dry_run: true }, { ...f.deps, observe: () => makeSnapshot(f.intent, ['01']) });
    expect(result.receipt.unfilled_slots).toEqual(['02']); expect(result.publication).toBeNull(); expect(terminal(f)?.reason).toBe('authoring_exhausted');
    expect(git(f.root, ['for-each-ref', '--format=%(refname)', 'refs/heads'])).toBe('refs/heads/main');
    expect(readIssueBatchAdoptionArtifact(f.root, f.intent, 'publication')).toBeNull();
  });
  test('partial batch cannot use completed terminal before rounds are exhausted', async () => {
    const f = await fixture('active', 3);
    await expect(adoptIssueBatch(f.input, { ...f.deps, observe: () => makeSnapshot(f.intent, ['01']) })).rejects.toThrow();
    expect(terminal(f)).toBeNull(); expect(readIssueBatchAdoptionArtifact(f.root, f.intent, 'publication')).toBeNull();
  });
  test('unknown browser result cannot settle, seal or invoke again', async () => {
    const f = await fixture(); let calls = 0;
    const deps = { ...f.deps, followup: async () => { calls++; return { sessionId: 'unknown', status: 'recoverable' as const, meta: { model: { verified: true } } }; } };
    await expect(adoptIssueBatch(f.input, deps)).rejects.toThrow('unresolved');
    await expect(adoptIssueBatch(f.input, deps)).rejects.toThrow('unresolved'); expect(calls).toBe(1); expect(terminal(f)).toBeNull();
  });
  test('source main drift and shadow publication reject before challenge', async () => {
    const f = await fixture('shadow'); await expect(adoptIssueBatch(f.input, f.deps)).rejects.toThrow('mode'); expect(f.calls()).toBe(0);
    git(f.root, ['commit', '--allow-empty', '-qm', 'move']);
    await expect(adoptIssueBatch({ ...f.input, dry_run: true }, f.deps)).rejects.toThrow(); expect(f.calls()).toBe(0);
  });
  test('in-flight authoring prevents seal even with correct challenge and complete snapshot', async () => {
    const f = await fixture('active', 3); const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env });
    reserveCampaignAuthoringBudget({ repo_root: f.root, automation_run_id: budget.budget.automation_run_id, expected_budget_sha256: budget.budget.budget_sha256, campaign_id: f.intent.campaign_id, group_number: 1, intent_sha256: f.intent.intent_sha256, operation: 'edit_issue', idempotency_key: 'inflight', env: f.env });
    await expect(adoptIssueBatch(f.input, f.deps)).rejects.toThrow(); expect(terminal(f)).toBeNull();
  });
});

test('missing exact-main policy fails before provider invocation', async () => {
  const f = await fixture();
  await expect(adoptIssueBatch({ ...f.input, publication_policy_path: 'missing.json' }, f.deps)).rejects.toThrow();
  expect(f.calls()).toBe(0);
});
test('source edits after final seal cannot become a new adoption baseline', async () => {
  const f = await fixture(); let observations = 0;
  await expect(adoptIssueBatch(f.input, { ...f.deps, observe: () => makeSnapshot(f.intent, f.intent.slots, ++observations === 1 ? {} : { priority: 99 }) })).rejects.toThrow();
  expect(readIssueBatchAdoptionArtifact(f.root, f.intent, 'publication')).toBeNull();
});

test('recoverable challenge reads its exact completed session without another admission', async () => {
  const f = await fixture(); let calls = 0;
  const deps = { ...f.deps, followup: async () => { calls++; return { sessionId: 'recoverable', status: 'recoverable' as const, meta: { model: { verified: true } } }; } };
  await expect(adoptIssueBatch(f.input, deps)).rejects.toThrow('unresolved');
  const challenge = readIssueBatchAdoptionArtifact(f.root, f.intent, 'challenge')!;
  const response = JSON.stringify({ base_main_sha: f.intent.base_main_sha, answers: (challenge.targets as { expected: string }[]).map(t => t.expected) });
  const result = await adoptIssueBatch(f.input, { ...deps, readSession: () => ({ output: response, meta: { repo: f.root, sessionId: 'recoverable', sourceSessionId: 'initial', status: 'completed', model: { verified: true }, browser: { profileDirectory: 'Profile 1' } } }) });
  expect(result.receipt.connector_evidence).toBe('challenge_verified'); expect(calls).toBe(1);
});

test('explicit not-started reconciliation permits one replacement with the same request key', async () => {
  const f = await fixture();
  await expect(adoptIssueBatch(f.input, { ...f.deps, followup: async () => { throw new Error('not started'); } })).rejects.toThrow('not started');
  const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env });
  const directory = join(f.root, '.git', AUTOMATION_BUDGET_STORE_RELATIVE_ROOT, 'runs', budget.budget.automation_run_id, 'reservations');
  const reservations = readdirSync(directory).filter(name => name.endsWith('.json')).map(name => validateAutomationReservation(JSON.parse(readFileSync(join(directory, name), 'utf8'))));
  const held = reservations.find(r => 'campaign_context' in r && r.campaign_context.operation === 'challenge')!;
  await expect(adoptIssueBatch(f.input, f.deps)).rejects.toThrow('reconcile'); expect(f.calls()).toBe(0);
  reconcileAutomationReservation({ repo_root: f.root, reservation: held, resolution: 'reconciled_not_started', outcome: 'no_progress', reason: 'fixture transport rejected before external execution', evidence_refs: [{ ref: 'provider-run:not-started', sha256: 'e'.repeat(64) }], env: f.env });
  const results = await Promise.allSettled([adoptIssueBatch(f.input, f.deps), adoptIssueBatch(f.input, f.deps)]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(f.calls()).toBe(1);
  expect(terminal(f)?.completed_authoring_rounds).toBe(1);
});

 test.each(['title', 'labels'] as const)('post-seal %s mutation is rejected, including retry against the changed source', async field => {
  const f = await fixture(); let calls = 0;
  const changed = () => {
    const snapshot = makeSnapshot(f.intent);
    const observations = snapshot.observations.map(o => {
      const { protocol, kind, observation_sha256, source_revision, ...raw } = o;
      return buildProviderIssueObservation({ ...raw, ...(field === 'title' ? { title: 'human revised title' } : { labels: ['human-label'] }) });
    });
    const { protocol, kind, receipt_sha256, ...rawReceipt } = snapshot.receipt;
    return { observations, receipt: buildExternalSourceRefreshReceipt({ ...rawReceipt, source_revisions: observations.map(o => o.source_revision).sort() }) };
  };
  const deps = { ...f.deps, observe: () => ++calls === 1 ? makeSnapshot(f.intent) : changed() };
  await expect(adoptIssueBatch(f.input, deps)).rejects.toThrow('sources changed');
  expect(terminal(f)).not.toBeNull();
  await expect(adoptIssueBatch(f.input, deps)).rejects.toThrow();
  expect(readIssueBatchAdoptionArtifact(f.root, f.intent, 'publication')).toBeNull();
 });

test('premature partial adoption can resume after an authorized fill completes', async () => {
  const f = await fixture('active', 3);
  await expect(adoptIssueBatch(f.input, { ...f.deps, observe: () => makeSnapshot(f.intent, ['01']) })).rejects.toThrow();
  expect(terminal(f)).toBeNull();
  const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env });
  const admission = reserveCampaignAuthoringBudget({ repo_root: f.root, automation_run_id: budget.budget.automation_run_id, expected_budget_sha256: budget.budget.budget_sha256, campaign_id: f.intent.campaign_id, group_number: 1, intent_sha256: f.intent.intent_sha256, operation: 'fill_missing', idempotency_key: 'authorized-fill', env: f.env });
  expect(admission.disposition).toBe('reserved');
  appendAutomationUsage({ repo_root: f.root, reservation: admission.reservation, outcome: 'progress', evidence_refs: [{ ref: 'provider-run:authorized-fill', sha256: 'a'.repeat(64) }], env: f.env });
  const result = await adoptIssueBatch(f.input, f.deps);
  expect(result.receipt.issues).toHaveLength(2); expect(terminal(f)?.completed_authoring_rounds).toBe(2); expect(f.calls()).toBe(1);
});
test('crash after seal resumes from its staged source set', async () => {
  const f = await fixture(); let calls = 0;
  await expect(adoptIssueBatch(f.input, { ...f.deps, observe: () => { if (++calls === 2) throw new Error('crash after seal'); return makeSnapshot(f.intent); } })).rejects.toThrow('crash after seal');
  expect(terminal(f)).not.toBeNull();
  expect((await adoptIssueBatch(f.input, f.deps)).receipt.issues).toHaveLength(2); expect(f.calls()).toBe(1);
});
