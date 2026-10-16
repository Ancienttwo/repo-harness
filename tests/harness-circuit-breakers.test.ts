import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync, spawn, spawnSync } from 'child_process';
import { circuitLimit, recordCircuitAttempt, type CircuitAttempt } from '../src/cli/hook/circuit-breaker';
import { withExclusiveDirectoryLock } from '../src/effects/locking/exclusive-directory-lock';

const HOOK_ENTRY = join(import.meta.dir, '../src/cli/hook-entry.ts');

function attempt(overrides: Partial<CircuitAttempt> = {}): CircuitAttempt {
  return {
    kind: 'semantic-review', guard: 'scope', reason: 'outside allowed paths', pathOrAction: 'src/secret.ts',
    progressToken: 'sha256:progress', fingerprint: 'sha256:render', ...overrides,
  };
}

function withRepo(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-circuit-'));
  try { run(cwd); } finally { rmSync(cwd, { recursive: true, force: true }); }
}

/** An opt-in Git repository with one commit, so hook routes and state resolution run for real. */
function withOptInRepo(run: (cwd: string) => void): void {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-circuit-repo-')));
  try {
    const gitIn = (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });
    gitIn('init', '-q', '-b', 'main');
    gitIn('config', 'user.name', 'Fixture');
    gitIn('config', 'user.email', 'fixture@example.com');
    mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
    writeFileSync(join(cwd, '.ai/harness/workflow-contract.json'), '{}\n');
    writeFileSync(join(cwd, 'README.md'), '# fixture\n');
    gitIn('add', '.');
    gitIn('commit', '-q', '-m', 'fixture');
    run(cwd);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

function writeCircuitState(cwd: string, state: unknown): string {
  const statePath = join(cwd, '.ai/harness/state/circuit-breaker.json');
  mkdirSync(join(cwd, '.ai/harness/state'), { recursive: true });
  const text = `${JSON.stringify(state)}\n`;
  writeFileSync(statePath, text);
  return text;
}

function readCircuitState(cwd: string): {
  protocol: number;
  entries: Record<string, {
    progress_token: string;
    blocker_key: string;
    count: number;
    render_key: string;
    recent_blockers: string[];
    last_pattern: string;
  }>;
} {
  return JSON.parse(readFileSync(join(cwd, '.ai/harness/state/circuit-breaker.json'), 'utf-8')) as {
    protocol: number;
    entries: Record<string, {
      progress_token: string;
      blocker_key: string;
      count: number;
      render_key: string;
      recent_blockers: string[];
      last_pattern: string;
    }>;
  };
}

describe('workflow circuit breakers', () => {
  test('the same fingerprint is allowed once before a structured trip', () => withRepo((cwd) => {
    expect(recordCircuitAttempt(cwd, attempt()).allowed).toBe(true);
    const second = recordCircuitAttempt(cwd, attempt());
    expect(second).toMatchObject({ allowed: false, tripped: true, repeat_count: 2, limit: 1 });
    expect(second.explicit_override_command).toBeNull();
    expect(second.required_action).toStartWith('terminal:');
  }));

  test('real progress resets the stream while a different blocker starts a fresh streak', () => withRepo((cwd) => {
    recordCircuitAttempt(cwd, attempt());
    expect(recordCircuitAttempt(cwd, attempt({ progressToken: 'sha256:new' })).repeat_count).toBe(1);
    expect(recordCircuitAttempt(cwd, attempt({ pathOrAction: 'src/other.ts' })).repeat_count).toBe(1);
  }));

  test('exact repeats increment one blocker streak and persist the latest pattern', () => withRepo((cwd) => {
    const first = recordCircuitAttempt(cwd, attempt());
    const second = recordCircuitAttempt(cwd, attempt());
    const third = recordCircuitAttempt(cwd, attempt());
    expect(first.repeat_count).toBe(1);
    expect(second).toMatchObject({ allowed: false, tripped: true, repeat_count: 2 });
    expect(third).toMatchObject({ allowed: false, tripped: true, repeat_count: 2 });
    const state = readCircuitState(cwd);
    expect(state.protocol).toBe(2);
    expect(Object.keys(state.entries)).toEqual(['semantic-review']);
    expect(state.entries['semantic-review'].last_pattern).toBe('exact-repeat');
    expect(state.entries['semantic-review'].recent_blockers).toHaveLength(2);
  }));

  test('render-only reason, path, and fingerprint churn cannot reset one blocker', () => withRepo((cwd) => {
    const first = recordCircuitAttempt(cwd, attempt({ reason: 'reason A', pathOrAction: 'path A', fingerprint: 'render A' }));
    const second = recordCircuitAttempt(cwd, attempt({ reason: 'reason B', pathOrAction: 'path B', fingerprint: 'render B' }));
    const third = recordCircuitAttempt(cwd, attempt({ reason: 'reason C', pathOrAction: 'path C', fingerprint: 'render C' }));
    expect(first.repeat_count).toBe(1);
    expect(second).toMatchObject({ allowed: false, tripped: true, repeat_count: 2 });
    expect(third).toMatchObject({ allowed: false, tripped: true, repeat_count: 2 });
    const state = readCircuitState(cwd);
    expect(state.entries['semantic-review'].last_pattern).toBe('superficial-churn');
    expect(state.entries['semantic-review'].recent_blockers).toHaveLength(2);
    expect(state.entries['semantic-review'].recent_blockers[0]).toBe(state.entries['semantic-review'].recent_blockers[1]);
  }));

  test('A-B-A trips immediately under one unchanged progress token', () => withRepo((cwd) => {
    const blockerA = attempt({ guard: 'blocker-a', reason: 'A' });
    const blockerB = attempt({ guard: 'blocker-b', reason: 'B' });
    expect(recordCircuitAttempt(cwd, blockerA)).toMatchObject({ allowed: true, repeat_count: 1 });
    expect(recordCircuitAttempt(cwd, blockerB)).toMatchObject({ allowed: true, repeat_count: 1 });
    const oscillation = recordCircuitAttempt(cwd, blockerA);
    expect(oscillation).toMatchObject({ allowed: false, tripped: true, repeat_count: 2, limit: 1 });
    expect(readCircuitState(cwd).entries['semantic-review'].last_pattern).toBe('oscillation');
  }));

  test('non-cycling blocker changes do not trip and do not inherit the old count', () => withRepo((cwd) => {
    const first = attempt({ guard: 'blocker-a' });
    const second = attempt({ guard: 'blocker-b' });
    const third = attempt({ guard: 'blocker-c' });
    expect(recordCircuitAttempt(cwd, first).repeat_count).toBe(1);
    expect(recordCircuitAttempt(cwd, second).repeat_count).toBe(1);
    expect(recordCircuitAttempt(cwd, third)).toMatchObject({ allowed: true, repeat_count: 1 });
    expect(readCircuitState(cwd).entries['semantic-review'].last_pattern).toBe('new-blocker');
  }));

  test('A-A-B is a new blocker, not an A-B-A oscillation', () => withRepo((cwd) => {
    const blockerA = attempt({ guard: 'blocker-a' });
    const blockerB = attempt({ guard: 'blocker-b' });
    expect(recordCircuitAttempt(cwd, blockerA).repeat_count).toBe(1);
    expect(recordCircuitAttempt(cwd, blockerA)).toMatchObject({ allowed: false, repeat_count: 2 });
    expect(recordCircuitAttempt(cwd, blockerB)).toMatchObject({ allowed: true, repeat_count: 1 });
    expect(readCircuitState(cwd).entries['semantic-review'].last_pattern).toBe('new-blocker');
  }));

  test('a progress-token change prevents A-B-A classification and resets bounded history', () => withRepo((cwd) => {
    const blockerA = attempt({ guard: 'blocker-a' });
    const blockerB = attempt({ guard: 'blocker-b' });
    expect(recordCircuitAttempt(cwd, blockerA).repeat_count).toBe(1);
    expect(recordCircuitAttempt(cwd, blockerB).repeat_count).toBe(1);
    const progressed = recordCircuitAttempt(cwd, { ...blockerA, progressToken: 'sha256:advanced' });
    expect(progressed).toMatchObject({ allowed: true, repeat_count: 1, progress_token: 'sha256:advanced' });
    const state = readCircuitState(cwd);
    expect(state.entries['semantic-review'].last_pattern).toBe('real-progress-reset');
    expect(state.entries['semantic-review'].recent_blockers).toHaveLength(1);
  }));

  test('projection-only churn never changes the progress token, so repeats keep accumulating on it', () => withRepo((cwd) => {
    // Same progress token across calls (what a handoff/resume/current-snapshot
    // rewrite produces, since projection churn never moves progress_token):
    // repeats accumulate against the same key instead of resetting.
    expect(recordCircuitAttempt(cwd, attempt({ progressToken: 'sha256:same' })).repeat_count).toBe(1);
    const second = recordCircuitAttempt(cwd, attempt({ progressToken: 'sha256:same' }));
    expect(second).toMatchObject({ allowed: false, tripped: true, repeat_count: 2, limit: 1 });

    // Real progress -- the token itself changes -- resets to a fresh key.
    expect(recordCircuitAttempt(cwd, attempt({ progressToken: 'sha256:advanced' })).repeat_count).toBe(1);
  }));

  test('an empty or missing progress token fails closed: the key stays stable so repeats keep accumulating', () => withRepo((cwd) => {
    expect(recordCircuitAttempt(cwd, attempt({ progressToken: '' })).repeat_count).toBe(1);
    const second = recordCircuitAttempt(cwd, attempt({ progressToken: '' }));
    expect(second).toMatchObject({ allowed: false, tripped: true, repeat_count: 2, limit: 1 });

    // Omitting the field entirely (as a raw stdin-JSON caller might) must
    // collapse to the exact same stable key as an explicit empty string --
    // never a distinct, ever-changing key that would fail open -- so the
    // breaker stays tripped at the capped count instead of resetting to 1.
    const { progressToken: _omitted, ...omitted } = attempt();
    const third = recordCircuitAttempt(cwd, omitted as CircuitAttempt);
    expect(third).toMatchObject({ allowed: false, tripped: true, repeat_count: 2, limit: 1 });
  }));

  test('the cap matches the semantic-review contract', () => {
    expect(circuitLimit(attempt({ kind: 'semantic-review' }))).toBe(1);
  });

  test('a retired circuit kind is not accepted as an attempt', () => withRepo((cwd) => {
    expect(() => recordCircuitAttempt(cwd, attempt({ kind: 'guard' as CircuitAttempt['kind'] }))).toThrow(/invalid circuit kind: guard/);
    expect(() => recordCircuitAttempt(cwd, attempt({ kind: 'repair' as CircuitAttempt['kind'] }))).toThrow(/invalid circuit kind: repair/);
    expect(existsSync(join(cwd, '.ai/harness/state/circuit-breaker.json'))).toBe(false);
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
      expect(decisions.filter((decision) => decision.allowed)).toHaveLength(1);
      expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(processCount - 1);
      expect(decisions.every((decision) => decision.limit === 1)).toBe(true);
      expect(decisions.filter((decision) => decision.repeat_count === 1)).toHaveLength(1);
      expect(decisions.filter((decision) => decision.repeat_count === 2)).toHaveLength(processCount - 1);
      expect(existsSync(join(cwd, '.ai/harness/state/circuit-breaker.json.lock'))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('protocol-1 state fails closed and names the one-shot cleanup without overwriting it', () => withRepo((cwd) => {
    const legacy = writeCircuitState(cwd, {
      protocol: 1,
      entries: { ['a'.repeat(64)]: { count: 2, token: 'legacy-token' } },
      updated_at: new Date().toISOString(),
    });
    expect(() => recordCircuitAttempt(cwd, attempt()))
      .toThrow(/retired protocol-1 circuit breaker state: .*; run the one-shot cleanup: repo-harness run evidence-gc --repo /);
    expect(readFileSync(join(cwd, '.ai/harness/state/circuit-breaker.json'), 'utf-8')).toBe(legacy);
  }));

  test('a retired kind in protocol-2 state fails closed and names the one-shot cleanup', () => withRepo((cwd) => {
    for (const kind of ['guard', 'review', 'subagent', 'cross-model-consult', 'minimal-change', 'repair']) {
      const retired = writeCircuitState(cwd, {
        protocol: 2,
        entries: {
          [kind]: {
            progress_token: 'sha256:progress', blocker_key: 'b', count: 1, render_key: 'r',
            recent_blockers: ['b'], last_pattern: 'initial',
          },
        },
        updated_at: new Date().toISOString(),
      });
      expect(() => recordCircuitAttempt(cwd, attempt()))
        .toThrow(new RegExp(`retired circuit breaker kind ${kind}: .*repo-harness run evidence-gc --repo `));
      expect(readFileSync(join(cwd, '.ai/harness/state/circuit-breaker.json'), 'utf-8')).toBe(retired);
    }
  }));

  test('malformed protocol-2 state fails closed without overwriting evidence', () => withRepo((cwd) => {
    const statePath = join(cwd, '.ai/harness/state/circuit-breaker.json');
    mkdirSync(join(cwd, '.ai/harness/state'), { recursive: true });
    const malformed = `${JSON.stringify({
      protocol: 2,
      entries: { 'semantic-review': { count: 2 } },
      updated_at: new Date().toISOString(),
    })}\n`;
    writeFileSync(statePath, malformed);
    expect(() => recordCircuitAttempt(cwd, attempt())).toThrow(/invalid protocol-2 circuit breaker entry/);
    expect(readFileSync(statePath, 'utf-8')).toBe(malformed);
  }));

  test('unknown state protocol fails closed without overwriting evidence', () => withRepo((cwd) => {
    const statePath = join(cwd, '.ai/harness/state/circuit-breaker.json');
    mkdirSync(join(cwd, '.ai/harness/state'), { recursive: true });
    const unknown = `${JSON.stringify({
      protocol: 3,
      entries: {},
      updated_at: new Date().toISOString(),
    })}\n`;
    writeFileSync(statePath, unknown);
    expect(() => recordCircuitAttempt(cwd, attempt())).toThrow(/unsupported circuit breaker state protocol: 3/);
    expect(readFileSync(statePath, 'utf-8')).toBe(unknown);
  }));

  test('an old file-shaped lock is never converted or removed', () => withRepo((cwd) => {
    const stateDir = join(cwd, '.ai/harness/state');
    const lockPath = join(stateDir, 'circuit-breaker.json.lock');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(lockPath, JSON.stringify({ protocol: 1, pid: process.pid, token: 'old-file-lock' }));
    expect(() => recordCircuitAttempt(cwd, attempt())).toThrow(/unsafe lock path is not a real directory/);
    expect(existsSync(lockPath)).toBe(true);
  }));

  test('reclaims a dead shared-directory owner and never reclaims a live owner', () => withRepo((cwd) => {
    const stateDir = join(cwd, '.ai/harness/state');
    const lockPath = join(stateDir, 'circuit-breaker.json.lock');
    mkdirSync(lockPath, { recursive: true });
    const staleToken = `2147483647-${Date.now()}-00000000-0000-4000-8000-000000000001`;
    const staleOwner = join(lockPath, `${staleToken}.json`);
    writeFileSync(staleOwner, `${JSON.stringify({
      pid: 2_147_483_647,
      created_at: Date.now() - 60_000,
      token: staleToken,
    })}\n`);
    expect(recordCircuitAttempt(cwd, attempt()).repeat_count).toBe(1);
    expect(existsSync(staleOwner)).toBe(false);
    expect(existsSync(lockPath)).toBe(false);

    rmSync(lockPath, { recursive: true, force: true });
    mkdirSync(lockPath, { recursive: true });
    const liveToken = `${process.pid}-${Date.now()}-00000000-0000-4000-8000-000000000002`;
    const liveOwner = join(lockPath, `${liveToken}.json`);
    writeFileSync(liveOwner, `${JSON.stringify({
      pid: process.pid,
      created_at: Date.now() - 60_000,
      token: liveToken,
    })}\n`);
    expect(() => recordCircuitAttempt(cwd, attempt())).toThrow(/timed out waiting for exclusive lock/);
    expect(existsSync(liveOwner)).toBe(true);
  }), 10_000);

  test('wrapper validates bounded wait overrides', () => withRepo((cwd) => {
    const lockPath = '.ai/harness/state/test-options.lock';
    const canonicalRoot = realpathSync(cwd);
    expect(withExclusiveDirectoryLock(canonicalRoot, lockPath, () => 'ok', { waitTimeoutMs: 1 })).toBe('ok');
    expect(() => withExclusiveDirectoryLock(canonicalRoot, lockPath, () => {
      throw new Error('fixture callback failure');
    }, { waitTimeoutMs: 1 })).toThrow('fixture callback failure');
    expect(withExclusiveDirectoryLock(canonicalRoot, lockPath, () => 'released', { waitTimeoutMs: 1 })).toBe('released');
    for (const waitTimeoutMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => withExclusiveDirectoryLock(canonicalRoot, lockPath, () => 'never', { waitTimeoutMs })).toThrow(/invalid exclusive lock waitTimeoutMs/);
    }
  }));

  test('three consecutive _ops writes through the Claude host each exit 2 with the reason and fix on stderr', () => withOptInRepo((cwd) => {
    const home = join(cwd, '.home');
    mkdirSync(home, { recursive: true });
    for (let index = 1; index <= 3; index += 1) {
      const result = spawnSync(process.execPath, [HOOK_ENTRY, 'PreToolUse', '--route', 'edit'], {
        cwd,
        encoding: 'utf-8',
        input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '_ops/x.env', content: 'secret' } }),
        env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, HOME: home, HOOK_HOST: 'claude', HOOK_REPO_ROOT: cwd },
      });
      expect({ index, status: result.status }).toEqual({ index, status: 2 });
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('[OpsPrivateGuard] _ops/x.env is under _ops/');
      expect(result.stderr).toContain('  Fix: ');
      expect(result.stderr).not.toContain('"tripped"');
    }
    expect(existsSync(join(cwd, '.ai/harness/state/circuit-breaker.json'))).toBe(false);
  }), 60_000);
});
