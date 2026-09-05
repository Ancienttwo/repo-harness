import { buildProviderIssueObservation, buildExternalSourceRefreshReceipt } from '../../src/core/external-sources/issue-observation';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdtempSync, realpathSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
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
import { makeSnapshot, AT, CAP, policy } from './issue-batch-adoption-fixture';
const SPRINT = 'plans/sprints/repair.sprint.md';
function git(root: string, args: string[]) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
export async function createAdoptionRepository(mode: 'shadow' | 'active' = 'active', rounds = 1, capability = CAP, metadata: Record<string, unknown> = {}, files: Record<string, string> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'brc6-adoption-'))); const home = mkdtempSync(join(tmpdir(), 'brc6-home-')); 
  git(root, ['init', '-q', '-b', 'main']); git(root, ['config', 'user.name', 'Test']); git(root, ['config', 'user.email', 'test@example.invalid']);
  for (const path of ['.ai/harness', '.archcontext/model/nodes', 'src', 'plans/sprints', 'plans/policies']) mkdirSync(join(root, path), { recursive: true });
  writeFileSync(join(root, 'src/index.ts'), 'export {};\n');
  writeFileSync(join(root, '.archcontext/model/nodes/capability.yaml'), JSON.stringify({ schemaVersion: 'archcontext.node/v2', id: capability, kind: 'capability', name: 'Campaign', status: 'active', summary: 'Fixture capability', responsibilities: ['Own fixture'], source: { include: ['src/**'] }, extensions: { contractFiles: { agents: 'AGENTS.md', claude: 'CLAUDE.md' }, lspProfile: 'typescript-lsp', verification: [] } }));
  writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({ development_campaign: { version: 1, mode, limits: { maximum_group_count: 1, maximum_issues_per_group: 2, maximum_parallel_tasks: 2 } }, external_sources: { version: 1, mode: 'manual', github: { enabled: true, repository: 'acme/widgets', selection: { kind: 'labels', labels_all: ['campaign'], assignees_any: [] }, limits: { max_pages: 2, max_issues: 20, max_body_bytes: 8192, max_total_bytes: 65536, deadline_ms: 1000 } } } }));
  writeFileSync(join(root, 'plans/policies/repair.json'), 'repair');
  writeFileSync(join(root, 'plans/policies/publication.json'), JSON.stringify(policy));
  const repository = repoHarnessRepoIdFor(root);
  writeFileSync(join(root, SPRINT), '# Sprint: repair\n\n> **Status**: Approved\n> **Backlog Schema**: 2\n\n## Backlog\n\n| # | ID | Status | Task | Mode | Acceptance | Plan |\n|---|----|---|---|---|---|---|\n\n## Execution Log\n');
  writeFileSync(join(root, 'plans/sprints/repair.work-graph.v1.json'), JSON.stringify({ protocol: 1, kind: 'repo-harness-work-graph', repository_id: repository, sprint_path: SPRINT, lane: 'generic-v1', work_packages: [] }));
  for (const [path, content] of Object.entries(files)) { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), content); }
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
  const deps: IssueBatchAdoptionDependencies = { readBinding, readSession: () => { throw new Error('unresolved'); }, now: () => new Date(AT), observe: () => makeSnapshot(started.intent, undefined, { primary_capability: capability, ...metadata }), followup: async request => {
    calls++;
    const data = JSON.parse(request.prompt.split('\n\n')[2]!);
    const answers = data.targets.map((t: { kind: string; path: string; line: number }) => t.kind === 'directory_entries'
      ? git(root, ['ls-tree', '--name-only', `${revision}:${t.path}`]).split('\n').sort().join('\n')
      : t.kind === 'text_line' ? git(root, ['show', `${revision}:${t.path}`]).split('\n')[t.line - 1]
      : createHash('sha256').update(execFileSync('git', ['show', `${revision}:${t.path}`], { cwd: root })).digest('hex'));
    return { sessionId: 'challenge', status: 'completed', output: JSON.stringify({ base_main_sha: revision, answers }), meta: { model: { verified: true } } };
  } };
  return { root, home, env, intent: started.intent, authorization, input, deps, calls: () => calls };
}
