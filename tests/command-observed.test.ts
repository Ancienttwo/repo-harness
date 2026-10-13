import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runCommandObserved, runsPublicationCommand, type CommandObservedDependencies } from '../src/cli/hook/command-observed';
import type { HookPayload } from '../src/cli/hook/hook-input';
import { runHook } from '../src/cli/hook/runtime';

function workspace(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
}

/** An opt-in Git repository with one commit, so the hook route and state resolution run for real. */
function optInRepo(prefix: string): string {
  const root = workspace(prefix);
  const gitIn = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  gitIn('init', '-q', '-b', 'main');
  gitIn('config', 'user.name', 'Fixture');
  gitIn('config', 'user.email', 'fixture@example.com');
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/workflow-contract.json'), '{}\n');
  writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  gitIn('add', '.');
  gitIn('commit', '-q', '-m', 'fixture');
  return root;
}

function commandInput(command: string, stdout: string, exitCode: unknown): HookPayload {
  return { tool_input: { command }, tool_response: { stdout, stderr: '', interrupted: false }, exit_code: exitCode };
}

function observe(repoRoot: string, payload: HookPayload, dependencies?: CommandObservedDependencies) {
  return runCommandObserved({ repoRoot, payload, dependencies });
}

const TRIPPED = {
  protocol: 1 as const,
  allowed: false,
  tripped: true,
  guard: 'RepairLimit',
  reason: 'automatic repair loop cap',
  path_action: 'bun test',
  progress_token: 'sha256:progress',
  repeat_count: 3,
  limit: 2,
  required_action: 'terminal: stop automatic retries; change state or wait for an explicit user decision',
  explicit_override_command: null,
};

describe('runCommandObserved', () => {
  test('a Claude PostToolUse payload without an exit status writes no status record', () => {
    const root = optInRepo('command-observed-claude-unknown');
    try {
      const result = runHook({
        event: 'PostToolUse',
        routeId: 'bash',
        cwd: root,
        input: JSON.stringify({
          session_id: 'claude-session',
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'bun test', description: 'Run tests' },
          tool_response: { stdout: 'FAIL tests/a.test.ts\n', stderr: '', interrupted: false, isImage: false },
          tool_use_id: 'toolu_01',
          duration_ms: 812,
        }),
        env: { ...process.env, HOOK_REPO_ROOT: root, HOOK_HOST: 'claude', EXIT_CODE: '1' },
      });
      expect(result).toMatchObject({ exitCode: 0, reason: 'ok', handler: 'command-observed' });
      expect(existsSync(join(root, '.ai/harness/checks'))).toBe(false);
      expect(existsSync(join(root, '.ai/harness/evidence'))).toBe(false);
      expect(existsSync(join(root, '.ai/harness/state/circuit-breaker.json'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('only a safe-integer exit_code is an exit status', () => {
    const repoRoot = workspace('command-observed-exit-status');
    try {
      let calls = 0;
      const dependencies: CommandObservedDependencies = { recordCircuit: () => { calls += 1; return TRIPPED; } };
      for (const exitCode of [undefined, null, '1', 1.5]) {
        const result = observe(repoRoot, commandInput('bun test', 'FAILED test\n', exitCode), dependencies);
        expect({ exitCode, result }).toEqual({ exitCode, result: { exitCode: 0, stdout: '', stderr: '', reason: 'ok' } });
      }
      expect(calls).toBe(0);
      expect(readdirSync(repoRoot)).toEqual([]);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('a known failing test run emits the rewrite reminder', () => {
    const root = optInRepo('command-observed-failure');
    try {
      const result = observe(root, commandInput('bun test tests/command-observed.test.ts', 'FAIL tests/command-observed.test.ts\nexpected pass\n', 1));
      expect(result).toMatchObject({ exitCode: 0, reason: 'ok' });
      expect(result.stdout).toContain('[PostBash] Tests failed. Reminder: failure = rewrite module, not patching.');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('does not turn a successful command into a failure when output contains a failure signal', () => {
    const repoRoot = workspace('command-observed-successful-failure-signal');
    try {
      const result = observe(repoRoot, commandInput('rg Traceback docs/', 'docs/debug.md:Traceback appears in this example\n', 0));
      expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '', reason: 'ok' });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('a failed exit without a failure signal stays silent and records no circuit', () => {
    const repoRoot = workspace('command-observed-failed-no-signal');
    try {
      const result = observe(repoRoot, commandInput('bun run check:type', 'command returned status 1\n', 1));
      expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '', reason: 'ok' });
      expect(existsSync(join(repoRoot, '.ai/harness/state/circuit-breaker.json'))).toBe(false);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('fails closed when the repair circuit denies a failing command', () => {
    const root = optInRepo('command-observed-circuit');
    try {
      const result = observe(root, commandInput('bun test', 'FAILED test\n', 1), { recordCircuit: () => TRIPPED });
      expect(result.exitCode).toBe(2);
      expect(result.reason).toBe('repair-circuit-tripped');
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('"tripped":true');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('fails closed when the repair circuit cannot be recorded', () => {
    const root = optInRepo('command-observed-circuit-error');
    try {
      const result = observe(root, commandInput('bun test', 'FAILED test\n', 1), {
        recordCircuit: () => { throw new Error('circuit state unreadable'); },
      });
      expect(result).toEqual({ exitCode: 2, stdout: '', stderr: '[RepairLimit] circuit state unreadable\n', reason: 'repair-circuit-tripped' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('publication commands that report owed architecture updates (#678)', () => {
  test.each([
    'git commit -m x',
    'git push',
    'git -c user.name=Bot commit -m x',
    'git -c "user.name=Bot Name" commit -m x',
    'git --no-pager push origin feature',
    'git -C ../repo --git-dir=.git --work-tree=. commit -am x',
    'git --git-dir .git --work-tree . push',
    'git --namespace ns --config-env=core.editor=EDITOR -P --no-optional-locks commit',
    'GIT_AUTHOR_NAME=Bot git commit -m x',
    'bun test && git commit -m "done" && git push',
    'cd repo; gh pr create --fill',
    '(git push)',
  ])('matches %s', (command) => {
    expect(runsPublicationCommand(command)).toBe(true);
  });

  test.each([
    'git status',
    'git log --grep commit',
    'git -c alias.ci=commit ci',
    'echo git commit',
    'gh pr view',
    'git -C push status',
    'rg "git push" src',
  ])('does not match %s', (command) => {
    expect(runsPublicationCommand(command)).toBe(false);
  });
});
