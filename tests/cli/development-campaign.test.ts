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
  const authorization = sealProgramAuthorization({ authorization_id: 'authorization-cli', repository_id: 'repo-cli', target_ref: 'refs/heads/main', target_revision: revision, work_graph_revision: hex('work-graph'), allowed_work_package_ids: ['campaign-cli'], allowed_risk_tiers: ['low'], merge_mode: 'manual', allowed_merge_method: 'squash', max_repair_cycles: 2, budget: limits, contract_scope: 'contract_less', contract_path: null, campaign: { campaign_id: 'campaign-cli', group_count: 1, issues_per_group: 2, allowed_issue_kinds: ['bugfix', 'test_gap'], max_parallel_tasks: 2, issue_author: 'gpt_pro', local_parent_host: 'codex', chrome_profile_directory: 'Profile 13', max_authoring_rounds_per_group: 5, require_fresh_main_audit: true }, issued_by: 'owner', issued_at: '2026-09-05T00:00:00.000Z', expires_at: '2027-09-05T00:00:00.000Z' });
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
    expect(result.stdout).toContain('step');
  });

  test('requires exact persisted intent and stable step identity', () => {
    const help = run(['campaign', 'step', '--help']);
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('--intent-sha256');
    expect(help.stdout).toContain('--idempotency-key');
    const missing = run(['campaign', 'step', '--campaign-id', 'campaign-cli', '--group-number', '1']);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain('--intent-sha256');
  });

  test('requires an exact Issue URL for an edit author-followup request', () => {
    const f = fixture();
    const request = join(f.root, 'author-followup.json');
    writeFileSync(request, `${JSON.stringify({ campaign_id: 'campaign-cli', group_number: 1, intent_sha256: 'sha256:abc', operation: 'edit_issue', provider_issue_id: '201', requested_slots: ['01'], source_session_ref: 'session-1' })}\n`);
    const result = run(['campaign', 'author-followup', '--repo', f.root, '--request', request], f.env);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('author follow-up request fields are invalid');
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

  test('replays an implicit creation time from the first CLI request and rejects explicit identity conflicts', () => {
    const f = fixture();
    const args = ['campaign', 'start', '--repo', f.root, '--authorization-sha256', f.authorization.authorization_sha256, '--idempotency-key', 'cli-default-time'];
    const first = run(args, f.env);
    const replay = run(args, f.env);
    expect(first.status, first.stderr).toBe(0);
    expect(replay.status, replay.stderr).toBe(0);
    expect(replay.stdout).toBe(first.stdout);

    const conflictingTime = run([...args, '--observed-at', '2030-09-05T00:00:00.000Z'], f.env);
    expect(conflictingTime.status).toBe(1);
    expect(conflictingTime.stderr).toContain('campaign_conflict');

    const conflictingKey = run([...args.slice(0, -1), 'another-key'], f.env);
    expect(conflictingKey.status).toBe(1);
    expect(conflictingKey.stderr).toContain('campaign_conflict');

    const { protocol: _protocol, kind: _kind, authorization_sha256: _digest, ...alternateInput } = f.authorization;
    const alternate = sealProgramAuthorization({ ...alternateInput, authorization_id: 'authorization-cli-alternate' });
    mintProgramAuthorization({ repo_root: f.root, authorization: alternate, env: f.env });
    const conflictingGrant = run(['campaign', 'start', '--repo', f.root, '--authorization-sha256', alternate.authorization_sha256, '--idempotency-key', 'cli-default-time'], f.env);
    expect(conflictingGrant.status).toBe(1);
    expect(conflictingGrant.stderr).toContain('campaign_conflict');
  });
});

 test('campaign adopt declares its required exact-main publication policy and bounded inputs', () => {
   const help = run(['campaign', 'adopt', '--help']);
   expect(help.status).toBe(0);
   expect(help.stdout).toContain('--publication-policy');
   const missing = run(['campaign', 'adopt']);
   expect(missing.status).not.toBe(0);
 });
