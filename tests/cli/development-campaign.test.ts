import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { sealProgramAuthorization, type ProgramBudgetLimitV1 } from '../../src/core/automation/budget';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';

const CLI = join(import.meta.dir, '..', '..', 'src', 'cli', 'index.ts');
const fixtures: string[] = [];
afterEach(() => { while (fixtures.length) rmSync(fixtures.pop()!, { recursive: true, force: true }); });
const hex = (seed: string): string => new Bun.CryptoHasher('sha256').update(seed).digest('hex');

function run(args: readonly string[], env: NodeJS.ProcessEnv = process.env) {
  const child = Bun.spawnSync([process.execPath, CLI, ...args], { env, stdout: 'pipe', stderr: 'pipe' });
  return { status: child.exitCode, stdout: child.stdout.toString(), stderr: child.stderr.toString() };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'development-campaign-cli-'));
  const home = mkdtempSync(join(tmpdir(), 'development-campaign-cli-home-'));
  fixtures.push(root, home);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  mkdirSync(join(root, '.ai', 'harness'), { recursive: true });
  writeFileSync(join(root, '.ai', 'harness', 'policy.json'), `${JSON.stringify({ development_campaign: { version: 1, mode: 'active', limits: { maximum_group_count: 1, maximum_issues_per_group: 10, maximum_parallel_tasks: 2 } }, external_sources: { version: 1, mode: 'manual', github: { enabled: true, repository: 'acme/widgets', selection: { kind: 'issue_numbers', issue_numbers: [1] }, limits: { max_pages: 1, max_issues: 1, max_body_bytes: 1024, max_total_bytes: 4096, deadline_ms: 1000 } } } })}\n`);
  execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: root });
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const limits: ProgramBudgetLimitV1 = { max_agent_turns: 10, max_successful_acquisitions: 2, max_runner_invocations: 10, max_provider_failures: 2, max_consecutive_no_progress_steps: 2, max_repair_cycles: 2, max_wall_clock_seconds: 3600, max_input_tokens: null, max_output_tokens: null, max_cost_micros: null };
  const authorization = sealProgramAuthorization({ authorization_id: 'authorization-cli', repository_id: 'repo-cli', target_ref: 'refs/heads/main', target_revision: revision, work_graph_revision: hex('work-graph'), allowed_work_package_ids: ['campaign-cli'], allowed_risk_tiers: ['low'], merge_mode: 'manual', allowed_merge_method: 'squash', max_repair_cycles: 2, budget: limits, contract_scope: 'contract_less', contract_path: null, campaign: { campaign_id: 'campaign-cli', group_count: 1, issues_per_group: 2, allowed_issue_kinds: ['bugfix', 'test_gap'], max_parallel_tasks: 2, issue_author: 'gpt_pro', local_parent_host: 'codex', chrome_profile_directory: 'Profile 13', require_fresh_main_audit: true }, issued_by: 'owner', issued_at: '2026-09-05T00:00:00.000Z', expires_at: '2027-09-05T00:00:00.000Z' });
  const env = { ...process.env, REPO_HARNESS_HOME: home };
  mintProgramAuthorization({ repo_root: root, authorization, env });
  return { root, env, authorization };
}

describe('development campaign CLI', () => {
  test('registers lifecycle and bounded GPT Pro authoring surfaces', () => {
    const result = run(['campaign', '--help']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('start');
    expect(result.stdout).toContain('transition');
    expect(result.stdout).toContain('status');
    expect(result.stdout).toContain('author');
    expect(result.stdout).toContain('author-followup');
  });

  test('starts from one stored ProgramAuthorizationV1 and reads the rebuilt status', () => {
    const f = fixture();
    const started = run(['campaign', 'start', '--repo', f.root, '--authorization-sha256', f.authorization.authorization_sha256, '--idempotency-key', 'cli-start', '--observed-at', '2026-09-05T00:00:00.000Z'], f.env);
    expect(started.status, started.stderr).toBe(0);
    expect(JSON.parse(started.stdout).current.state).toBe('authorized');
    const status = run(['campaign', 'status', '--repo', f.root, '--campaign-id', 'campaign-cli'], f.env);
    expect(status.status, status.stderr).toBe(0);
    expect(JSON.parse(status.stdout).events).toHaveLength(1);
  });
});
