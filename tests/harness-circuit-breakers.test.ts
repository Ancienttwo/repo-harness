import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn, spawnSync } from 'child_process';
import { circuitLimit, recordCircuitAttempt, type CircuitAttempt } from '../src/cli/hook/circuit-breaker';
import { runMutationGuard, type MutationGuardCollector } from '../src/cli/hook/mutation-guard';
import { createStateInputCollector } from '../src/effects/loop/state-input-collector';
import { resolveEffectiveState } from '../src/effects/state/resolve-effective-state';
import type { EffectiveState } from '../src/core/state/types';

// HRD-03: pre-edit-guard.sh is retired; the OpsPrivateGuard phase below
// (the only phase of this test that used it -- subagent-start-context.sh
// and post-bash.sh, the other three phases' scripts, are untouched by this
// cutover) is retargeted to call the in-process mutation-guard handler
// directly. OpsPrivateGuard fires on a pure `_ops/*` path-prefix match
// before any Effective State resolution, so this needs no git repo --
// matching withRepo's own bare (non-git-initialized) fixture.
function editHandlerResult(cwd: string, filePath: string): { status: number | null; stdout: string; stderr: string } {
  const collector: MutationGuardCollector = createStateInputCollector({
    event: 'PreToolUse',
    repoRoot: cwd,
    resolveSessionEffectiveState: () => null,
    resolvePreEditEffectiveState: (targetPaths: readonly string[]): EffectiveState | null => {
      try {
        return resolveEffectiveState(cwd, Date.now(), { targetPaths, operationKind: 'edit' });
      } catch {
        return null;
      }
    },
  });
  const result = runMutationGuard({ collector, input: JSON.stringify({ tool_input: { file_path: filePath } }) });
  return { status: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}

function attempt(overrides: Partial<CircuitAttempt> = {}): CircuitAttempt {
  return {
    kind: 'guard', guard: 'scope', reason: 'outside allowed paths', pathOrAction: 'src/secret.ts',
    progressToken: 'sha256:progress', fingerprint: 'sha256:guard', profile: 'lite', ...overrides,
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

  test('progress token or action changes reset the consecutive repeat counter', () => withRepo((cwd) => {
    recordCircuitAttempt(cwd, attempt());
    expect(recordCircuitAttempt(cwd, attempt({ progressToken: 'sha256:new' })).repeat_count).toBe(1);
    expect(recordCircuitAttempt(cwd, attempt({ pathOrAction: 'src/other.ts' })).repeat_count).toBe(1);
  }));

  test('projection-only churn never changes the progress token, so repeats keep accumulating on it', () => withRepo((cwd) => {
    // Same progress token across calls (what a handoff/resume/current-snapshot
    // rewrite produces, since projection churn never moves progress_token):
    // repeats accumulate against the same key instead of resetting.
    expect(recordCircuitAttempt(cwd, attempt({ progressToken: 'sha256:same' })).repeat_count).toBe(1);
    expect(recordCircuitAttempt(cwd, attempt({ progressToken: 'sha256:same' })).repeat_count).toBe(2);
    const third = recordCircuitAttempt(cwd, attempt({ progressToken: 'sha256:same' }));
    expect(third).toMatchObject({ allowed: false, tripped: true, repeat_count: 3, limit: 2 });

    // Real progress -- the token itself changes -- resets to a fresh key.
    expect(recordCircuitAttempt(cwd, attempt({ progressToken: 'sha256:advanced' })).repeat_count).toBe(1);
  }));

  test('an empty or missing progress token fails closed: the key stays stable so repeats keep accumulating', () => withRepo((cwd) => {
    expect(recordCircuitAttempt(cwd, attempt({ progressToken: '' })).repeat_count).toBe(1);
    expect(recordCircuitAttempt(cwd, attempt({ progressToken: '' })).repeat_count).toBe(2);
    const third = recordCircuitAttempt(cwd, attempt({ progressToken: '' }));
    expect(third).toMatchObject({ allowed: false, tripped: true, repeat_count: 3, limit: 2 });

    // Omitting the field entirely (as a raw stdin-JSON caller might) must
    // collapse to the exact same stable key as an explicit empty string --
    // never a distinct, ever-changing key that would fail open -- so the
    // breaker stays tripped at the capped count instead of resetting to 1.
    const { progressToken: _omitted, ...omitted } = attempt();
    const fourth = recordCircuitAttempt(cwd, omitted as CircuitAttempt);
    expect(fourth).toMatchObject({ allowed: false, tripped: true, repeat_count: 3, limit: 2 });
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

  test('serializes concurrent process attempts without losing cap increments', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-circuit-concurrent-'));
    try {
      const processCount = 12;
      const readyDir = join(cwd, 'ready');
      const goPath = join(cwd, 'go');
      const modulePath = join(import.meta.dir, '../src/cli/hook/circuit-breaker.ts');
      mkdirSync(readyDir, { recursive: true });

      const runs = Array.from({ length: processCount }, (_, index) => new Promise<{
        status: number | null;
        stdout: string;
        stderr: string;
      }>((resolve, reject) => {
        const script = [
          `import { existsSync, writeFileSync } from ${JSON.stringify('fs')};`,
          `import { recordCircuitAttempt } from ${JSON.stringify(modulePath)};`,
          `writeFileSync(${JSON.stringify(join(readyDir, String(index)))}, '');`,
          'const wait = new Int32Array(new SharedArrayBuffer(4));',
          `while (!existsSync(${JSON.stringify(goPath)})) Atomics.wait(wait, 0, 0, 2);`,
          `const decision = recordCircuitAttempt(${JSON.stringify(cwd)}, ${JSON.stringify(attempt())});`,
          'process.stdout.write(JSON.stringify(decision));',
        ].join('\n');
        const child = spawn(process.execPath, ['-e', script], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf-8');
        child.stderr.setEncoding('utf-8');
        child.stdout.on('data', (chunk: string) => { stdout += chunk; });
        child.stderr.on('data', (chunk: string) => { stderr += chunk; });
        child.once('error', reject);
        child.once('close', (status) => resolve({ status, stdout, stderr }));
      }));

      const readyDeadline = Date.now() + 10_000;
      while (readdirSync(readyDir).length < processCount && Date.now() < readyDeadline) {
        await Bun.sleep(10);
      }
      const readyCount = readdirSync(readyDir).length;
      writeFileSync(goPath, 'go\n');
      const results = await Promise.all(runs);

      expect(readyCount).toBe(processCount);
      for (const result of results) {
        expect(result.status, result.stderr).toBe(0);
      }
      const decisions = results.map((result) => JSON.parse(result.stdout) as {
        allowed: boolean;
        repeat_count: number;
        limit: number;
      });
      expect(decisions.filter((decision) => decision.allowed)).toHaveLength(2);
      expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(processCount - 2);
      expect(decisions.every((decision) => decision.limit === 2)).toBe(true);
      expect(decisions.filter((decision) => decision.repeat_count === 1)).toHaveLength(1);
      expect(decisions.filter((decision) => decision.repeat_count === 2)).toHaveLength(1);
      expect(decisions.filter((decision) => decision.repeat_count === 3)).toHaveLength(processCount - 2);
      expect(existsSync(join(cwd, '.ai/harness/state/circuit-breaker.json.lock'))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('never reclaims stale or live owner locks without an atomic ownership primitive', () => withRepo((cwd) => {
    const stateDir = join(cwd, '.ai/harness/state');
    const lockPath = join(stateDir, 'circuit-breaker.json.lock');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(lockPath, JSON.stringify({
      protocol: 1,
      pid: 2_147_483_647,
      token: 'dead-owner',
      acquired_at: new Date().toISOString(),
    }));
    expect(() => recordCircuitAttempt(cwd, attempt())).toThrow(/lock contention \(stale owner pid .*attempt denied/);
    expect(existsSync(lockPath)).toBe(true);

    rmSync(lockPath);
    writeFileSync(lockPath, JSON.stringify({
      protocol: 1,
      pid: process.pid,
      token: 'live-owner',
      acquired_at: new Date().toISOString(),
    }));
    expect(() => recordCircuitAttempt(cwd, attempt())).toThrow(/lock contention \(live owner pid .*attempt denied/);
    expect(existsSync(lockPath)).toBe(true);
  }), 30_000);

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
      const result = editHandlerResult(cwd, '_ops/secret.env');
      expect(result.status).toBe(2);
      if (index < 3) {
        // Non-tripped blocks: structuredError() writes "[Guard] reason" +
        // "  Fix: ..." to stderr exactly like the retired script did.
        expect(result.stderr).toContain('Fix:');
      } else {
        // Tripped: structuredError() returns before ever reaching the
        // stderr-writing branch (mirrors hook_structured_error's own early
        // return), so the terminal circuit JSON lands on stdout here. The
        // ORIGINAL script-based test saw it on stderr only because
        // run-hook.sh's Codex-host wrapper moves non-`{"guard":`-prefixed
        // stdout lines to stderr on failure -- a run-hook.sh concern with
        // its own dedicated coverage (tests/hook-runtime.test.ts's
        // "run-hook preserves Codex failure status..."), not
        // mutation-guard.ts's. The decision content asserted below is
        // unchanged.
        expect(result.stdout).toContain('"tripped":true');
        expect(result.stdout).toContain('terminal:');
        expect(result.stderr).not.toContain('Fix:');
        expect(result.stdout).not.toContain('circuit-override');
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
  }), 30_000);

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
  }), 30_000);
});
