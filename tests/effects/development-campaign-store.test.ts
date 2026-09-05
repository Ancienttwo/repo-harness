import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { sealProgramAuthorization, type ProgramAuthorizationCampaignV1, type ProgramBudgetLimitV1 } from '../../src/core/automation/budget';
import { buildDevelopmentCampaignDefinition } from '../../src/core/automation/development-campaign';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';
import {
  appendDevelopmentCampaignEvent,
  createDevelopmentCampaign,
  developmentCampaignStoreRoot,
  readDevelopmentCampaignStatus,
} from '../../src/effects/automation/development-campaign-store';

const fixtures: string[] = [];
afterEach(() => { while (fixtures.length) rmSync(fixtures.pop()!, { recursive: true, force: true }); });
const hex = (seed: string): string => new Bun.CryptoHasher('sha256').update(seed).digest('hex');
const observedAt = '2026-09-05T00:00:00.000Z';
const limits: ProgramBudgetLimitV1 = Object.freeze({ max_agent_turns: 10, max_successful_acquisitions: 3, max_runner_invocations: 10, max_provider_failures: 3, max_consecutive_no_progress_steps: 3, max_repair_cycles: 2, max_wall_clock_seconds: 3600, max_input_tokens: null, max_output_tokens: null, max_cost_micros: null });

function policy(mode: 'off' | 'shadow' | 'active' = 'shadow', external: 'off' | 'manual' = 'manual', maximumGroupCount: 1 | 2 | 3 = 3) {
  return {
    development_campaign: mode === 'off' ? { version: 1, mode } : { version: 1, mode, limits: { maximum_group_count: maximumGroupCount, maximum_issues_per_group: 10, maximum_parallel_tasks: 3 } },
    external_sources: external === 'off' ? { version: 1, mode: 'off' } : { version: 1, mode: 'manual', github: { enabled: true, repository: 'acme/widgets', selection: { kind: 'issue_numbers', issue_numbers: [1] }, limits: { max_pages: 1, max_issues: 1, max_body_bytes: 1024, max_total_bytes: 4096, deadline_ms: 1000 } } },
  };
}

function fixture(policyDocument = policy(), campaignOverrides: Partial<ProgramAuthorizationCampaignV1> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'development-campaign-store-'));
  const home = mkdtempSync(join(tmpdir(), 'development-campaign-home-'));
  fixtures.push(root, home);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  mkdirSync(join(root, '.ai', 'harness'), { recursive: true });
  writeFileSync(join(root, '.ai', 'harness', 'policy.json'), `${JSON.stringify(policyDocument)}\n`);
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: root });
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const campaign = { campaign_id: 'campaign-1', group_count: 1, issues_per_group: 2, allowed_issue_kinds: ['bugfix', 'test_gap'], max_parallel_tasks: 2, issue_author: 'gpt_pro', local_parent_host: 'codex', chrome_profile_directory: 'Profile 13', require_fresh_main_audit: true, ...campaignOverrides } as ProgramAuthorizationCampaignV1;
  const authorization = sealProgramAuthorization({ authorization_id: 'authorization-campaign-1', repository_id: 'repo-fixture', target_ref: 'refs/heads/main', target_revision: revision, work_graph_revision: hex('work-graph'), allowed_work_package_ids: ['campaign-1'], allowed_risk_tiers: ['low'], merge_mode: 'manual', allowed_merge_method: 'squash', max_repair_cycles: limits.max_repair_cycles, budget: limits, contract_scope: 'contract_less', contract_path: null, campaign, issued_by: 'owner', issued_at: observedAt, expires_at: '2027-09-05T00:00:00.000Z' });
  const env = { ...process.env, REPO_HARNESS_HOME: home };
  mintProgramAuthorization({ repo_root: root, authorization, env });
  const definition = buildDevelopmentCampaignDefinition({ campaign_id: campaign.campaign_id, authorization_id: authorization.authorization_id, authorization_sha256: authorization.authorization_sha256, repository_id: authorization.repository_id, target_ref: authorization.target_ref, target_revision: authorization.target_revision, created_at: observedAt });
  return { root, home, env, revision, authorization, definition };
}

describe('development campaign Git-common-dir journal', () => {
  test('creates once, replays identically, appends, and rebuilds current from events', () => {
    const f = fixture();
    const created = createDevelopmentCampaign({ repo_root: f.root, campaign: f.definition, idempotency_key: 'create-1', env: f.env });
    expect(createDevelopmentCampaign({ repo_root: f.root, campaign: f.definition, idempotency_key: 'create-1', env: f.env })).toEqual(created);
    const appended = appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: 'campaign-1', expected_current_sha256: created.current.current_sha256, idempotency_key: 'prepare-1', operation: 'prepare_group', evidence_refs: ['intent-1'], observed_at: observedAt, env: f.env });
    expect(appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: 'campaign-1', expected_current_sha256: created.current.current_sha256, idempotency_key: 'prepare-1', operation: 'prepare_group', evidence_refs: ['intent-1'], observed_at: observedAt, env: f.env })).toEqual(appended);
    expect(readDevelopmentCampaignStatus(f.root, 'campaign-1', f.env)).toMatchObject({ current: { revision: 2, state: 'group_preparing' } });
    expect(developmentCampaignStoreRoot(f.root)).toContain('/.git/repo-harness/development-campaigns/v1');
  });

  test('rejects conflicting replay and a current projection that diverges from events', () => {
    const f = fixture();
    const created = createDevelopmentCampaign({ repo_root: f.root, campaign: f.definition, idempotency_key: 'create-1', env: f.env });
    appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: 'campaign-1', expected_current_sha256: created.current.current_sha256, idempotency_key: 'prepare-1', operation: 'prepare_group', evidence_refs: [], observed_at: observedAt, env: f.env });
    expect(() => appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: 'campaign-1', expected_current_sha256: created.current.current_sha256, idempotency_key: 'prepare-1', operation: 'prepare_group', evidence_refs: ['different'], observed_at: observedAt, env: f.env })).toThrow('idempotency key names another');
    const current = join(developmentCampaignStoreRoot(f.root), hex('campaign-1'), 'current.json');
    const parsed = JSON.parse(readFileSync(current, 'utf8')) as Record<string, unknown>;
    writeFileSync(current, `${JSON.stringify({ ...parsed, revision: 1 })}\n`);
    expect(() => readDevelopmentCampaignStatus(f.root, 'campaign-1', f.env)).toThrow('reconciled from durable events');
  });

  test('recovers an event published before its transition index and current projection', () => {
    const f = fixture();
    const created = createDevelopmentCampaign({ repo_root: f.root, campaign: f.definition, idempotency_key: 'create-1', env: f.env });
    const campaignRoot = join(developmentCampaignStoreRoot(f.root), hex('campaign-1'));
    const currentPath = join(campaignRoot, 'current.json');
    const priorCurrent = readFileSync(currentPath);
    const request = { repo_root: f.root, campaign_id: 'campaign-1', expected_current_sha256: created.current.current_sha256, idempotency_key: 'prepare-crash', operation: 'prepare_group' as const, evidence_refs: ['intent-1'], observed_at: observedAt, env: f.env };
    const appended = appendDevelopmentCampaignEvent(request);
    const transitionPath = join(campaignRoot, 'transitions', `${hex('prepare-crash')}.json`);
    rmSync(transitionPath);
    writeFileSync(currentPath, priorCurrent);
    expect(appendDevelopmentCampaignEvent(request)).toEqual(appended);
    expect(existsSync(transitionPath)).toBe(true);
    expect(readDevelopmentCampaignStatus(f.root, 'campaign-1', f.env).current.revision).toBe(2);
  });

  test('uses target-base limits and fails closed for disabled modes and intake', () => {
    const off = fixture(policy('off'));
    expect(() => createDevelopmentCampaign({ repo_root: off.root, campaign: off.definition, idempotency_key: 'off', env: off.env })).toThrow('development_campaign.mode is off');
    const noIntake = fixture(policy('shadow', 'off'));
    expect(() => createDevelopmentCampaign({ repo_root: noIntake.root, campaign: noIntake.definition, idempotency_key: 'no-intake', env: noIntake.env })).toThrow('external_sources.mode must be enabled');
    const bounded = fixture(policy('shadow', 'manual', 1), { group_count: 2 });
    writeFileSync(join(bounded.root, '.ai', 'harness', 'policy.json'), `${JSON.stringify(policy('active', 'manual', 3))}\n`);
    expect(() => createDevelopmentCampaign({ repo_root: bounded.root, campaign: bounded.definition, idempotency_key: 'too-large', env: bounded.env })).toThrow('exceeds target-base');
  });

  test('serializes identical campaign creation across real processes', async () => {
    const f = fixture(policy('active'));
    const cli = join(import.meta.dir, '..', '..', 'src', 'cli', 'index.ts');
    const args = [cli, 'campaign', 'start', '--repo', f.root, '--authorization-sha256', f.authorization.authorization_sha256, '--idempotency-key', 'process-create'];
    const run = async () => {
      const child = Bun.spawn([process.execPath, ...args], { env: f.env, stdout: 'pipe', stderr: 'pipe' });
      const [status, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
      return { status, stdout, stderr };
    };
    const results = await Promise.all([run(), run()]);
    expect(results.map((entry) => entry.status), results.map((entry) => entry.stderr).join('\n')).toEqual([0, 0]);
    expect(results[0]!.stdout).toBe(results[1]!.stdout);
    expect(readDevelopmentCampaignStatus(f.root, 'campaign-1', f.env).events).toHaveLength(1);
  });

  test('preserves read-only inspection and terminal reconciliation after target movement or expiry', () => {
    const moved = fixture(policy('active'));
    const created = createDevelopmentCampaign({ repo_root: moved.root, campaign: moved.definition, idempotency_key: 'create-1', env: moved.env });
    writeFileSync(join(moved.root, 'README.md'), '# moved target\n');
    execFileSync('git', ['add', 'README.md'], { cwd: moved.root });
    execFileSync('git', ['commit', '-qm', 'legitimate merge movement'], { cwd: moved.root });

    expect(readDevelopmentCampaignStatus(moved.root, 'campaign-1', moved.env).current).toMatchObject({ revision: 1, state: 'authorized' });
    expect(() => appendDevelopmentCampaignEvent({ repo_root: moved.root, campaign_id: 'campaign-1', expected_current_sha256: created.current.current_sha256, idempotency_key: 'prepare-after-move', operation: 'prepare_group', observed_at: observedAt, env: moved.env })).toThrow('authorized target ref moved');
    const reconciled = appendDevelopmentCampaignEvent({ repo_root: moved.root, campaign_id: 'campaign-1', expected_current_sha256: created.current.current_sha256, idempotency_key: 'reconcile-after-move', operation: 'require_reconciliation', observed_at: observedAt, env: moved.env });
    expect(reconciled.current).toMatchObject({ revision: 2, state: 'reconciliation_required' });
    expect(appendDevelopmentCampaignEvent({ repo_root: moved.root, campaign_id: 'campaign-1', expected_current_sha256: reconciled.current.current_sha256, idempotency_key: 'stop-after-move', operation: 'stop', observed_at: observedAt, env: moved.env }).current).toMatchObject({ revision: 3, state: 'stopped' });

    const expired = fixture(policy('active'));
    const expiredCreated = createDevelopmentCampaign({ repo_root: expired.root, campaign: expired.definition, idempotency_key: 'create-1', env: expired.env });
    expect(() => appendDevelopmentCampaignEvent({ repo_root: expired.root, campaign_id: 'campaign-1', expected_current_sha256: expiredCreated.current.current_sha256, idempotency_key: 'expire-before-expiry', operation: 'expire_authorization', observed_at: observedAt, env: expired.env })).toThrow('campaign authorization has not expired');
    writeFileSync(join(expired.root, 'README.md'), '# moved after authorization\n');
    execFileSync('git', ['add', 'README.md'], { cwd: expired.root });
    execFileSync('git', ['commit', '-qm', 'move target before expiry recording'], { cwd: expired.root });
    const originalNow = Date.now;
    Date.now = () => Date.parse('2028-09-05T00:00:00.000Z');
    try {
      expect(readDevelopmentCampaignStatus(expired.root, 'campaign-1', expired.env).current).toMatchObject({ revision: 1, state: 'authorized' });
      expect(() => appendDevelopmentCampaignEvent({ repo_root: expired.root, campaign_id: 'campaign-1', expected_current_sha256: expiredCreated.current.current_sha256, idempotency_key: 'prepare-after-expiry', operation: 'prepare_group', observed_at: '2028-09-05T00:00:00.000Z', env: expired.env })).toThrow('campaign authorization expired');
      expect(appendDevelopmentCampaignEvent({ repo_root: expired.root, campaign_id: 'campaign-1', expected_current_sha256: expiredCreated.current.current_sha256, idempotency_key: 'expire-after-expiry', operation: 'expire_authorization', observed_at: '2028-09-05T00:00:00.000Z', env: expired.env }).current).toMatchObject({ revision: 2, state: 'authorization_expired' });
    } finally {
      Date.now = originalNow;
    }
  });
});
