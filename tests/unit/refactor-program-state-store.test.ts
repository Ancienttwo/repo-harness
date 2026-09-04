import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { sealProgramAuthorization } from '../../src/core/automation/budget';
import { buildRefactorProgramDefinition } from '../../src/core/refactor/program-state';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';
import { appendRefactorProgramEvent, createRefactorProgram, readRefactorProgramStatus, RefactorProgramStoreError } from '../../src/effects/refactor/program-store';
import { activateRefactorFixture } from '../helpers/refactor-activation-fixture';

const roots: string[] = [];
const hex = (value: string): string => createHash('sha256').update(value).digest('hex');
const limits = { max_agent_turns: 10, max_successful_acquisitions: 3, max_runner_invocations: 10, max_provider_failures: 3, max_consecutive_no_progress_steps: 2, max_repair_cycles: 2, max_wall_clock_seconds: 3600, max_input_tokens: null, max_output_tokens: null, max_cost_micros: null } as const;

function fixture(mode: 'off' | 'shadow' | 'active' = 'shadow') {
  const root = mkdtempSync(join(tmpdir(), 'refactor-program-')); roots.push(root);
  const home = mkdtempSync(join(tmpdir(), 'refactor-program-home-')); roots.push(home);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  mkdirSync(join(root, '.ai', 'harness'), { recursive: true });
  writeFileSync(join(root, '.ai', 'harness', 'policy.json'), `${JSON.stringify({ refactor: { mode } })}\n`);
  execFileSync('git', ['add', '.ai/harness/policy.json'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'policy'], { cwd: root });
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (mode !== 'off') activateRefactorFixture(root, 'repo-fixture', revision, mode === 'shadow' ? 'shadow' : 'active_module');
  const authorization = sealProgramAuthorization({ authorization_id: 'authorization-refactor', repository_id: 'repo-fixture', target_ref: 'refs/heads/main', target_revision: revision, work_graph_revision: hex('work-graph'), allowed_work_package_ids: ['wp-refactor'], allowed_risk_tiers: ['low'], merge_mode: 'disabled', allowed_merge_method: 'squash', max_repair_cycles: limits.max_repair_cycles, budget: limits, contract_scope: 'contract_less', contract_path: null, campaign: null, issued_by: 'ancienttwo', issued_at: '2026-09-04T00:00:00.000Z', expires_at: '2027-09-04T00:00:00.000Z' });
  const env = { ...process.env, REPO_HARNESS_HOME: home };
  mintProgramAuthorization({ repo_root: root, authorization, env });
  const program = buildRefactorProgramDefinition({ program_id: 'refactor-program.fixture', authorization_id: authorization.authorization_id, authorization_sha256: authorization.authorization_sha256, repository_id: authorization.repository_id, target_ref: authorization.target_ref, target_revision: authorization.target_revision, base_main_sha: revision, created_at: '2026-09-04T01:00:00.000Z' });
  return { root, env, program };
}

afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

describe('Module 4 refactor program state and store', () => {
  test('treats policy mode as an intent ceiling and requires canary activation evidence', () => { const f = fixture('active'); const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: f.root, encoding: 'utf8' }).trim(); rmSync(join(f.root, common, 'repo-harness', 'refactor-activation'), { recursive: true }); expect(() => createRefactorProgram({ repo_root: f.root, program: f.program, idempotency_key: 'unactivated', env: f.env })).toThrow('requires activation level active_module'); });
  test('rebuilds current from the append-only chain and keeps exact replay idempotent', () => {
    const f = fixture();
    const created = createRefactorProgram({ repo_root: f.root, program: f.program, idempotency_key: 'create-1', env: f.env });
    const scanning = appendRefactorProgramEvent({ repo_root: f.root, program_id: f.program.program_id, expected_current_sha256: created.current.current_sha256, idempotency_key: 'scan-1', operation: 'begin_scan', observed_at: '2026-09-04T01:01:00.000Z', env: f.env });
    expect(scanning.current.state).toBe('scanning');
    const replay = appendRefactorProgramEvent({ repo_root: f.root, program_id: f.program.program_id, expected_current_sha256: created.current.current_sha256, idempotency_key: 'scan-1', operation: 'begin_scan', observed_at: '2026-09-04T01:01:00.000Z', env: f.env });
    expect(replay.event.event_sha256).toBe(scanning.event.event_sha256);
    const status = readRefactorProgramStatus(f.root, f.program.program_id, f.env);
    expect(status.current).toEqual(scanning.current);
    expect(status.events.map((event) => event.operation)).toEqual(['create', 'begin_scan']);
    expect(() => createRefactorProgram({ repo_root: f.root, program: f.program, idempotency_key: 'create-conflict', env: f.env })).toThrow('another idempotency key');
    expect(() => appendRefactorProgramEvent({ repo_root: f.root, program_id: f.program.program_id, expected_current_sha256: null, idempotency_key: 'scan-1', operation: 'begin_scan', observed_at: '2026-09-04T01:01:00.000Z', env: f.env })).toThrow('idempotency key names another transition');
  });

  test('rejects conflicting replay, target-ref movement, and off-mode mutation', () => {
    const f = fixture();
    const created = createRefactorProgram({ repo_root: f.root, program: f.program, idempotency_key: 'create-1', env: f.env });
    expect(() => appendRefactorProgramEvent({ repo_root: f.root, program_id: f.program.program_id, expected_current_sha256: created.current.current_sha256, idempotency_key: 'create-1', operation: 'begin_scan', observed_at: '2026-09-04T01:02:00.000Z', env: f.env })).toThrow(RefactorProgramStoreError);
    writeFileSync(join(f.root, 'moved.txt'), 'moved\n'); execFileSync('git', ['add', 'moved.txt'], { cwd: f.root }); execFileSync('git', ['commit', '-qm', 'move target'], { cwd: f.root });
    expect(readRefactorProgramStatus(f.root, f.program.program_id, f.env).current.state).toBe('created');
    expect(() => appendRefactorProgramEvent({ repo_root: f.root, program_id: f.program.program_id, expected_current_sha256: created.current.current_sha256, idempotency_key: 'scan-after-move', operation: 'begin_scan', observed_at: '2026-09-04T01:03:00.000Z', env: f.env })).toThrow('authorized target ref moved');
    const off = fixture('off');
    expect(() => createRefactorProgram({ repo_root: off.root, program: off.program, idempotency_key: 'create-off', env: off.env })).toThrow('refactor mode is off');
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: off.root, encoding: 'utf8' }).trim();
    expect(existsSync(join(off.root, common, 'repo-harness', 'refactor-programs', 'v1'))).toBe(false);
  });

  test('stops explicitly without claiming completion', () => {
    const f = fixture('active');
    const created = createRefactorProgram({ repo_root: f.root, program: f.program, idempotency_key: 'create-1', env: f.env });
    const stopped = appendRefactorProgramEvent({ repo_root: f.root, program_id: f.program.program_id, expected_current_sha256: created.current.current_sha256, idempotency_key: 'stop-1', operation: 'stop', observed_at: '2026-09-04T01:03:00.000Z', env: f.env });
    expect(stopped.current.state).toBe('stopped');
    expect(stopped.current.state).not.toBe('complete');
  });

  test('shadow mode rejects the first materializing mutation', () => {
    const f = fixture('shadow');
    let current = createRefactorProgram({ repo_root: f.root, program: f.program, idempotency_key: 'create-1', env: f.env }).current;
    const steps = ['begin_scan', 'observe', 'begin_authoring', 'assess', 'begin_route'] as const;
    for (const [index, operation] of steps.entries()) {
      current = appendRefactorProgramEvent({ repo_root: f.root, program_id: f.program.program_id, expected_current_sha256: current.current_sha256, idempotency_key: `step-${index}`, operation, observed_at: `2026-09-04T01:0${index + 1}:00.000Z`, env: f.env }).current;
    }
    expect(current.state).toBe('routing');
    expect(() => appendRefactorProgramEvent({ repo_root: f.root, program_id: f.program.program_id, expected_current_sha256: current.current_sha256, idempotency_key: 'materialize-1', operation: 'begin_materialize', observed_at: '2026-09-04T01:07:00.000Z', env: f.env })).toThrow('forbidden while refactor mode is shadow');
  });

  test('CLI start, status, and stop operate the same durable projection', () => {
    const f = fixture('active');
    const cli = join(import.meta.dir, '..', '..', 'src', 'cli', 'index.ts');
    const run = (args: string[]) => JSON.parse(execFileSync(process.execPath, [cli, 'refactor', ...args], { cwd: f.root, env: f.env, encoding: 'utf8' }));
    const created = run(['start', '--repo', f.root, '--program-id', f.program.program_id, '--authorization-sha256', f.program.authorization_sha256, '--base-main-sha', f.program.base_main_sha, '--idempotency-key', 'cli-create', '--observed-at', f.program.created_at]);
    expect(created.current.state).toBe('created');
    expect(run(['status', '--repo', f.root, '--program-id', f.program.program_id]).current.current_sha256).toBe(created.current.current_sha256);
    const stopped = run(['stop', '--repo', f.root, '--program-id', f.program.program_id, '--expected-current-sha256', created.current.current_sha256, '--idempotency-key', 'cli-stop', '--observed-at', '2026-09-04T01:10:00.000Z']);
    expect(stopped.current.state).toBe('stopped');
  });

  test('projection corruption requires reconciliation and blocks progress', () => {
    const f = fixture('active');
    const created = createRefactorProgram({ repo_root: f.root, program: f.program, idempotency_key: 'create-1', env: f.env });
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: f.root, encoding: 'utf8' }).trim();
    const encoded = Buffer.from(f.program.program_id).toString('hex');
    writeFileSync(join(f.root, common, 'repo-harness', 'refactor-programs', 'v1', 'programs', encoded, 'current.json'), '{}\n');
    const advance = () => appendRefactorProgramEvent({ repo_root: f.root, program_id: f.program.program_id, expected_current_sha256: created.current.current_sha256, idempotency_key: 'scan-1', operation: 'begin_scan', observed_at: '2026-09-04T01:11:00.000Z', env: f.env });
    try { advance(); throw new Error('expected reconciliation refusal'); }
    catch (error) { expect((error as RefactorProgramStoreError).code).toBe('refactor_program_reconciliation_required'); }
    expect(readRefactorProgramStatus.bind(null, f.root, f.program.program_id, f.env)).toThrow('must be reconciled');
  });
});
