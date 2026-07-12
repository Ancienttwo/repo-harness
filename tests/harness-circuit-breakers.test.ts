import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { circuitLimit, recordCircuitAttempt, type CircuitAttempt } from '../src/cli/hook/circuit-breaker';

function attempt(overrides: Partial<CircuitAttempt> = {}): CircuitAttempt {
  return {
    kind: 'guard', guard: 'scope', reason: 'outside allowed paths', pathOrAction: 'src/secret.ts',
    stateVersion: 'sha256:state', fingerprint: 'sha256:guard', profile: 'lite', ...overrides,
  };
}

function withRepo(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-circuit-'));
  try { run(cwd); } finally { rmSync(cwd, { recursive: true, force: true }); }
}

describe('workflow circuit breakers', () => {
  test('same guard fingerprint blocks at most twice before structured trip', () => withRepo((cwd) => {
    expect(recordCircuitAttempt(cwd, attempt()).allowed).toBe(true);
    expect(recordCircuitAttempt(cwd, attempt()).allowed).toBe(true);
    const third = recordCircuitAttempt(cwd, attempt());
    expect(third).toMatchObject({ allowed: false, tripped: true, repeat_count: 3, limit: 2 });
    expect(third.explicit_override_command).toBeNull();
    expect(third.required_action).toStartWith('terminal:');
  }));

  test('state or action changes reset the consecutive repeat counter', () => withRepo((cwd) => {
    recordCircuitAttempt(cwd, attempt());
    expect(recordCircuitAttempt(cwd, attempt({ stateVersion: 'sha256:new' })).repeat_count).toBe(1);
    expect(recordCircuitAttempt(cwd, attempt({ pathOrAction: 'src/other.ts' })).repeat_count).toBe(1);
  }));

  test('profile caps match review, subagent, repair, and consult contracts', () => {
    expect(circuitLimit(attempt({ kind: 'review', profile: 'lite' }))).toBe(1);
    expect(circuitLimit(attempt({ kind: 'review', profile: 'strict' }))).toBe(2);
    expect(circuitLimit(attempt({ kind: 'subagent', profile: 'standard' }))).toBe(2);
    expect(circuitLimit(attempt({ kind: 'subagent', profile: 'strict', explicitHighRiskContract: true }))).toBe(3);
    expect(circuitLimit(attempt({ kind: 'repair' }))).toBe(2);
    expect(circuitLimit(attempt({ kind: 'cross-model-consult' }))).toBe(0);
    expect(circuitLimit(attempt({ kind: 'cross-model-consult', riskTriggeredConsult: true }))).toBe(1);
    expect(circuitLimit(attempt({ kind: 'cross-model-consult', userRequestedConsult: true }))).toBe(1);
  });

  test('keeps independent runtime counters per circuit kind', () => withRepo((cwd) => {
    expect(recordCircuitAttempt(cwd, attempt({ kind: 'review', profile: 'lite' })).allowed).toBe(true);
    expect(recordCircuitAttempt(cwd, attempt({ kind: 'subagent' })).allowed).toBe(true);
    expect(recordCircuitAttempt(cwd, attempt({ kind: 'review', profile: 'lite' }))).toMatchObject({
      allowed: false,
      repeat_count: 2,
      limit: 1,
    });
  }));

  test('strong boundaries never expose an override command', () => withRepo((cwd) => {
    recordCircuitAttempt(cwd, attempt({ strongBoundary: true }));
    recordCircuitAttempt(cwd, attempt({ strongBoundary: true }));
    const decision = recordCircuitAttempt(cwd, attempt({ strongBoundary: true }));
    expect(decision.allowed).toBe(false);
    expect(decision.explicit_override_command).toBeNull();
    expect(decision.required_action).toContain('security boundary');
  }));

  test('real hook callers block guard, subagent, and repair attempts over their limits', () => withRepo((cwd) => {
    const root = join(import.meta.dir, '..');
    const hookCli = join(root, 'src/cli/hook-entry.ts');
    const env = {
      ...process.env,
      HOOK_REPO_ROOT: cwd,
      REPO_HARNESS_HOOK_CLI: hookCli,
      HOOK_HOST: 'codex',
    };

    const runner = join(root, 'assets/hooks/run-hook.sh');
    for (let index = 1; index <= 3; index += 1) {
      const result = spawnSync('bash', [runner, 'pre-edit-guard.sh', '_ops/secret.env'], { cwd, env, encoding: 'utf-8' });
      expect(result.status).toBe(2);
      const stderr = result.stderr;
      if (index < 3) expect(stderr).toContain('Fix:');
      else {
        expect(stderr).toContain('"tripped":true');
        expect(stderr).toContain('terminal:');
        expect(stderr).not.toContain('Fix:');
        expect(stderr).not.toContain('circuit-override');
      }
    }

    rmSync(join(cwd, '.ai/harness/state/circuit-breaker.json'));
    mkdirSync(join(cwd, '.ai/harness/state'), { recursive: true });
    writeFileSync(join(cwd, '.ai/harness/state/effective.json'), JSON.stringify({
      state_version: 'sha256:state',
      workflow_profile: 'standard',
    }));
    for (let index = 1; index <= 3; index += 1) {
      const result = spawnSync('bash', [runner, 'subagent-start-context.sh'], { cwd, env, input: '{}', encoding: 'utf-8' });
      expect(result.status).toBe(index < 3 ? 0 : 2);
      if (index === 3) expect(result.stderr).toContain('"limit":2');
    }

    rmSync(join(cwd, '.ai/harness/state/circuit-breaker.json'));
    writeFileSync(join(cwd, '.ai/harness/state/effective.json'), JSON.stringify({
      state_version: 'sha256:strict-state',
      workflow_profile: 'strict',
    }));
    writeFileSync(join(cwd, '.ai/harness/active-plan'), 'plans/plan-20260713-0100-risk.md');
    mkdirSync(join(cwd, 'tasks/contracts'), { recursive: true });
    writeFileSync(join(cwd, 'tasks/contracts/20260713-0100-risk.contract.md'), '> **Risk**: high\n');
    for (let index = 1; index <= 4; index += 1) {
      const result = spawnSync('bash', [runner, 'subagent-start-context.sh'], { cwd, env, input: '{}', encoding: 'utf-8' });
      expect(result.status).toBe(index < 4 ? 0 : 2);
      if (index === 4) expect(result.stderr).toContain('"limit":3');
    }

    rmSync(join(cwd, '.ai/harness/state/circuit-breaker.json'));
    for (let index = 1; index <= 3; index += 1) {
      const result = spawnSync('bash', [runner, 'post-bash.sh'], {
        cwd,
        env,
        input: JSON.stringify({ tool_input: { command: 'bun test' }, tool_output: 'FAIL test', exit_code: 1 }),
        encoding: 'utf-8',
      });
      expect(result.status).toBe(index < 3 ? 0 : 2);
      if (index === 3) expect(result.stderr).toContain('"limit":2');
    }
  }));

  test('review and default-zero cross-model caps execute in the prompt runtime', () => withRepo((cwd) => {
    const root = join(import.meta.dir, '..');
    mkdirSync(join(cwd, '.ai/harness/state'), { recursive: true });
    mkdirSync(join(cwd, 'docs'), { recursive: true });
    writeFileSync(join(cwd, 'docs/spec.md'), '# Spec\n');
    writeFileSync(join(cwd, '.ai/harness/state/effective.json'), JSON.stringify({
      state_version: 'sha256:state',
      workflow_profile: 'standard',
    }));
    expect(spawnSync('git', ['init', '-b', 'main'], { cwd }).status).toBe(0);
    expect(spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd }).status).toBe(0);
    expect(spawnSync('git', ['config', 'user.name', 'Test'], { cwd }).status).toBe(0);
    expect(spawnSync('git', ['add', '.'], { cwd }).status).toBe(0);
    expect(spawnSync('git', ['commit', '-m', 'fixture'], { cwd }).status).toBe(0);
    const prompt = join(root, 'assets/hooks/prompt-guard.sh');
    const env = {
      ...process.env,
      HOOK_REPO_ROOT: cwd,
      REPO_HARNESS_CLI: join(root, 'src/cli/index.ts'),
      REPO_HARNESS_HOOK_CLI: join(root, 'src/cli/hook-entry.ts'),
    };
    const first = spawnSync('bash', [prompt], { cwd, env, input: '{"prompt":"/check"}', encoding: 'utf-8' });
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('[WazaRoute] Review/release intent detected.');
    expect(first.stderr).toContain('"guard":"CrossModelLimit"');
    expect(first.stderr).toContain('"limit":0');
    expect(first.stderr).not.toContain('claude-review');

    const second = spawnSync('bash', [prompt], { cwd, env, input: '{"prompt":"/check"}', encoding: 'utf-8' });
    expect(second.status).toBe(0);
    expect(second.stdout).not.toContain('[WazaRoute] Review/release intent detected.');
    expect(second.stderr).toContain('"guard":"ReviewLimit"');
    expect(second.stderr).toContain('"limit":1');

    rmSync(join(cwd, '.ai/harness/state/circuit-breaker.json'));
    writeFileSync(join(cwd, '.ai/harness/state/effective.json'), JSON.stringify({
      state_version: 'sha256:strict-state',
      workflow_profile: 'strict',
    }));
    mkdirSync(join(cwd, 'plans'), { recursive: true });
    writeFileSync(join(cwd, 'plans/plan-20260713-0200-strict.md'), '# Plan\n\n> **Status**: Executing\n');
    writeFileSync(join(cwd, '.ai/harness/active-plan'), 'plans/plan-20260713-0200-strict.md');
    writeFileSync(join(cwd, '.ai/harness/active-worktree'), `${realpathSync(cwd)}\n`);
    mkdirSync(join(cwd, 'tasks/contracts'), { recursive: true });
    writeFileSync(join(cwd, 'tasks/contracts/20260713-0200-strict.contract.md'), [
      '> **Workflow Profile**: strict',
      '> **Risk**: high',
      '',
    ].join('\n'));
    const strictFirst = spawnSync('bash', [prompt], { cwd, env, input: '{"prompt":"/check"}', encoding: 'utf-8' });
    expect(strictFirst.status).toBe(0);
    expect(strictFirst.stdout).toContain('[WazaRoute] Review/release intent detected.');
    expect(strictFirst.stdout).toContain('[CrossReview]');
    const strictSecond = spawnSync('bash', [prompt], { cwd, env, input: '{"prompt":"/check"}', encoding: 'utf-8' });
    expect(strictSecond.stdout).toContain('[WazaRoute] Review/release intent detected.');
    expect(strictSecond.stderr).toContain('"guard":"CrossModelLimit"');
    expect(strictSecond.stderr).toContain('"limit":1');
    const strictThird = spawnSync('bash', [prompt], { cwd, env, input: '{"prompt":"/check"}', encoding: 'utf-8' });
    expect(strictThird.stdout).not.toContain('[WazaRoute] Review/release intent detected.');
    expect(strictThird.stderr).toContain('"guard":"ReviewLimit"');
    expect(strictThird.stderr).toContain('"limit":2');
  }));
});
