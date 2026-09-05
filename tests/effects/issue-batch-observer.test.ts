import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildIssueBatchIntent } from '../../src/core/automation/issue-batch';
import { sealProgramAuthorization, type ProgramBudgetLimitV1 } from '../../src/core/automation/budget';
import { buildDevelopmentCampaignDefinition } from '../../src/core/automation/development-campaign';
import { messageSha256 } from '../../src/core/messages/mechanics';
import { readCampaignExternalSourcesPolicyAtRevision } from '../../src/effects/automation/development-campaign-policy';
import { IssueBatchObserverError, observeIssueBatch } from '../../src/effects/automation/issue-batch-observer';
import type { GithubCommandRunner } from '../../src/effects/external-sources/github';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';
import { appendDevelopmentCampaignEvent, createDevelopmentCampaign } from '../../src/effects/automation/development-campaign-store';

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

const budget: ProgramBudgetLimitV1 = { max_agent_turns: 10, max_successful_acquisitions: 2, max_runner_invocations: 10, max_provider_failures: 2, max_consecutive_no_progress_steps: 2, max_repair_cycles: 2, max_wall_clock_seconds: 3600, max_input_tokens: null, max_output_tokens: null, max_cost_micros: null };

function fixture(selection: unknown = { kind: 'labels', labels_all: ['campaign'], assignees_any: [] }) {
  const root = mkdtempSync(join(tmpdir(), 'issue-batch-observer-'));
  const home = mkdtempSync(join(tmpdir(), 'issue-batch-observer-home-'));
  roots.push(root, home);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  mkdirSync(join(root, '.ai', 'harness'), { recursive: true });
  const external_sources = { version: 1, mode: 'manual', github: { enabled: true, repository: 'acme/widgets', selection, limits: { max_pages: 2, max_issues: 20, max_body_bytes: 8192, max_total_bytes: 65536, deadline_ms: 1000 } } };
  const development_campaign = { version: 1, mode: 'shadow', limits: { maximum_group_count: 1, maximum_issues_per_group: 2, maximum_parallel_tasks: 2 } };
  writeFileSync(join(root, '.ai', 'harness', 'policy.json'), `${JSON.stringify({ development_campaign, external_sources })}\n`);
  execFileSync('git', ['add', '.ai'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: root });
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const env = { ...process.env, REPO_HARNESS_HOME: home };
  const authorization = sealProgramAuthorization({ authorization_id: 'auth-1', repository_id: 'repo-1', target_ref: 'refs/heads/main', target_revision: revision, work_graph_revision: new Bun.CryptoHasher('sha256').update('work').digest('hex'), allowed_work_package_ids: ['campaign-1'], allowed_risk_tiers: ['low'], merge_mode: 'manual', allowed_merge_method: 'squash', max_repair_cycles: 2, budget, contract_scope: 'contract_less', contract_path: null, campaign: { campaign_id: 'campaign-1', group_count: 1, issues_per_group: 2, allowed_issue_kinds: ['bugfix', 'test_gap'], max_parallel_tasks: 2, issue_author: 'gpt_pro', local_parent_host: 'codex', chrome_profile_directory: 'Profile 1', require_fresh_main_audit: true }, issued_by: 'owner', issued_at: '2026-09-05T00:00:00.000Z', expires_at: '2027-09-05T00:00:00.000Z' });
  mintProgramAuthorization({ repo_root: root, authorization, env });
  const campaign = buildDevelopmentCampaignDefinition({ campaign_id: 'campaign-1', authorization_id: authorization.authorization_id, authorization_sha256: authorization.authorization_sha256, repository_id: authorization.repository_id, target_ref: authorization.target_ref, target_revision: authorization.target_revision, created_at: '2026-09-05T00:00:00.000Z' });
  const created = createDevelopmentCampaign({ repo_root: root, campaign, idempotency_key: 'start', env });
  appendDevelopmentCampaignEvent({ repo_root: root, campaign_id: 'campaign-1', expected_current_sha256: created.current.current_sha256, idempotency_key: 'prepare', operation: 'prepare_group', observed_at: '2026-09-05T00:00:00.000Z', env });
  const policy = readCampaignExternalSourcesPolicyAtRevision(root, revision);
  const intent = buildIssueBatchIntent({
    campaign_id: 'campaign-1', group_number: 1, repository_id: 'repo-1', provider_repository: 'acme/widgets',
    target_ref: 'refs/heads/main', base_main_sha: revision, slots: ['01', '02'], allowed_issue_kinds: ['bugfix', 'test_gap'],
    prompt_sha256: messageSha256('prompt'), authoring_policy_sha256: policy.policy_revision,
    authoring_parent: 'codex', gpt_pro_transport: 'oracle_browser', browser_transport: 'copy_profile',
    chrome_profile_directory: 'Profile 1', created_at: '2026-09-05T00:00:00.000Z', expires_at: '2027-09-05T00:00:00.000Z',
  });
  return { root, intent, env };
}

function runner(responses: readonly unknown[]): GithubCommandRunner {
  let index = 0;
  return () => ({ stdout: JSON.stringify(responses[index++]) });
}

describe('issue batch provider observer', () => {
  test('persists and returns one complete frozen-policy snapshot', () => {
    const { root, intent, env } = fixture();
    const result = observeIssueBatch({
      repo_root: root, intent, env, now: () => new Date('2026-09-05T00:01:00.000Z'),
      runner: runner([
        { id: 100, full_name: 'acme/widgets', html_url: 'https://github.com/acme/widgets' },
        [{ id: 201, number: 7, html_url: 'https://github.com/acme/widgets/issues/7', created_at: null, updated_at: null, state: 'open', title: 'repair', body: 'body', labels: [{ name: 'campaign' }], assignees: [] }],
      ]),
    });
    expect(result.receipt).toMatchObject({ outcome: 'complete', issues_seen: 1, observations_written: 1 });
    expect(result.observations[0]).toMatchObject({ provider_issue_id: '201', display_ref: 'acme/widgets#7', policy_revision: intent.authoring_policy_sha256 });
    expect(result.receipt.source_revisions).toEqual([result.observations[0]!.source_revision]);
  });

  test('never treats issue-number selection as a complete batch snapshot and makes no provider call', () => {
    const { root, intent, env } = fixture({ kind: 'issue_numbers', issue_numbers: [7] });
    let calls = 0;
    try {
      observeIssueBatch({ repo_root: root, intent, env, runner: () => { calls += 1; return { stdout: '{}' }; }, now: () => new Date('2026-09-05T00:01:00.000Z') });
      throw new Error('expected observer failure');
    } catch (error) {
      expect(error).toBeInstanceOf(IssueBatchObserverError);
      expect((error as IssueBatchObserverError).code).toBe('issue_provider_snapshot_incomplete');
      expect((error as IssueBatchObserverError).receipt?.outcome).toBe('incomplete');
    }
    expect(calls).toBe(0);
  });

  test('persists typed incomplete evidence when provider pagination is bounded', () => {
    const { root, intent, env } = fixture();
    const page = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, number: index + 1, html_url: `https://github.com/acme/widgets/issues/${index + 1}`, created_at: null, updated_at: null, state: 'open', title: 'repair', body: '', labels: [], assignees: [] }));
    try {
      observeIssueBatch({ repo_root: root, intent, env, runner: runner([{ id: 100, full_name: 'acme/widgets', html_url: 'https://github.com/acme/widgets' }, page]), now: () => new Date('2026-09-05T00:01:00.000Z') });
      throw new Error('expected observer failure');
    } catch (error) {
      expect(error).toBeInstanceOf(IssueBatchObserverError);
      expect((error as IssueBatchObserverError).code).toBe('issue_provider_snapshot_incomplete');
      expect((error as IssueBatchObserverError).receipt?.failure?.class).toBe('issue_limit');
    }
  });

  test('rejects a foreign repository intent before provider access', () => {
    const { root, intent, env } = fixture();
    const { protocol: _protocol, kind: _kind, intent_sha256: _digest, ...draft } = intent;
    const foreign = buildIssueBatchIntent({ ...draft, repository_id: 'repo-foreign' });
    let calls = 0;
    expect(() => observeIssueBatch({ repo_root: root, intent: foreign, env, now: () => new Date('2026-09-05T00:01:00.000Z'), runner: () => { calls += 1; return { stdout: '{}' }; } })).toThrow('not fully bound');
    expect(calls).toBe(0);
  });
});
