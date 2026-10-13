import { describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runHook } from '../../src/cli/hook/runtime';
import { getRoute } from '../../src/cli/hook/route-registry';
import { buildHookCommand } from '../../src/cli/installer/managed-entries';

const HOOK_ENTRY = join(import.meta.dir, '..', '..', 'src', 'cli', 'hook-entry.ts');

function repo(optIn = true): string {
  const root = mkdtempSync(join(tmpdir(), 'hrd09-runtime-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
  if (optIn) writeFileSync(join(root, '.ai/harness/workflow-contract.json'), '{}\n');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

function env(root: string, host: 'claude' | 'codex' = 'claude'): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOOK_REPO_ROOT: root,
    HOOK_HOST: host,
    REPO_HARNESS_WORKFLOW_PROFILE: 'routine',
  };
}

function clean(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

describe('typed hook runtime', () => {
  test('fails open outside a git repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'hrd09-not-git-'));
    try {
      // #691 finding 7: HOOK_REPO_ROOT is trusted as the root, so only a call
      // without it (Pi, or a direct call) resolves the root from a non-git cwd.
      const { HOOK_REPO_ROOT: _managedRoot, ...unmanaged } = env(root);
      const result = runHook({ event: 'Stop', routeId: 'default', cwd: root, env: unmanaged });
      expect(result).toEqual({ exitCode: 0, reason: 'not-in-git-repo' });
    } finally { clean(root); }
  });

  test('fails open without the opt-in contract', () => {
    const root = repo(false);
    try {
      const result = runHook({ event: 'Stop', routeId: 'default', cwd: root, env: env(root) });
      expect(result.reason).toBe('non-opt-in');
      expect(result.handler).toBeUndefined();
    } finally { clean(root); }
  }, 30_000);

  test('the managed HOOK_REPO_ROOT is the root without a second git lookup', () => {
    const root = repo();
    const other = repo();
    try {
      const result = runHook({
        event: 'Stop',
        routeId: 'default',
        cwd: root,
        input: JSON.stringify({ stop_hook_active: true }),
        env: { ...env(root), HOOK_REPO_ROOT: other },
      });
      expect(result.repoRoot).toBe(realpathSync(other));
    } finally { clean(root); clean(other); }
  }, 30_000);

  test('a missing HOOK_HOST fails before any handler runs', () => {
    const root = repo();
    try {
      const hostless = { ...env(root) };
      delete hostless.HOOK_HOST;
      expect(runHook({ event: 'Stop', routeId: 'default', cwd: root, env: hostless }))
        .toEqual({ exitCode: 1, reason: 'unknown-host' });
      expect(runHook({ event: 'PreToolUse', routeId: 'edit', cwd: root, env: hostless }))
        .toEqual({ exitCode: 2, reason: 'unknown-host' });
      expect(existsSync(join(root, '.ai/harness/runs/hook-events.jsonl'))).toBe(false);
    } finally { clean(root); }
  }, 30_000);

  test('a route that is not installed for the host exits 2 with one stderr line', () => {
    const root = repo();
    try {
      const result = spawnSync(process.execPath, [HOOK_ENTRY, 'SubagentStop', '--route', 'quality'], {
        cwd: root,
        env: env(root, 'claude'),
        input: JSON.stringify({ hook_event_name: 'SubagentStop', final_message: 'ok' }),
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr.trim().split('\n')).toHaveLength(1);
      expect(result.stderr).toContain('unsupported-host-route');
      expect(existsSync(join(root, '.ai/harness/delegation'))).toBe(false);
    } finally { clean(root); }
  }, 30_000);

  test('a managed call spawns one git process to find the root', () => {
    const root = repo();
    const bin = mkdtempSync(join(tmpdir(), 'hrd09-managed-bin-'));
    try {
      const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
      const gitLog = join(bin, 'git.log');
      writeFileSync(join(bin, 'git'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "$GIT_LOG"\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
      writeFileSync(join(bin, 'repo-harness-hook'), `#!/bin/sh\nexec "${process.execPath}" "${HOOK_ENTRY}" "$@"\n`, { mode: 0o755 });
      const route = getRoute('PostToolUse', 'always');
      if (!route) throw new Error('missing PostToolUse.always route');
      const hostEnv: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, GIT_LOG: gitLog, REPO_HARNESS_WORKFLOW_PROFILE: 'routine' };
      delete hostEnv.HOOK_REPO_ROOT;
      delete hostEnv.HOOK_HOST;
      const result = spawnSync('sh', ['-c', buildHookCommand(route, 'claude')], {
        cwd: root,
        env: hostEnv,
        input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Read' }),
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(gitLog, 'utf8').trim().split('\n')).toEqual(['rev-parse --show-toplevel']);
      expect(existsSync(join(root, '.ai/harness/runs/hook-events.jsonl'))).toBe(true);
    } finally { clean(root); clean(bin); }
  }, 30_000);

  test('unknown routes do not create a handler or telemetry record', () => {
    const root = repo();
    try {
      const result = runHook({ event: 'Stop', routeId: 'edit', cwd: root, env: env(root) });
      expect(result).toMatchObject({ exitCode: 2, reason: 'unknown-route' });
      expect(result.handler).toBeUndefined();
      expect(existsSync(join(root, '.ai/harness/runs/hook-events.jsonl'))).toBe(false);
    } finally { clean(root); }
  }, 30_000);

  test('dispatches each route through its typed handler identity', () => {
    const root = repo();
    try {
      const cases = [
        ['SessionStart', 'default', undefined, 'session-context'],
        ['PreToolUse', 'edit', JSON.stringify({ tool_input: { file_path: 'README.md' } }), 'mutation-guard'],
        ['PreToolUse', 'subagent', JSON.stringify({ tool_name: 'Task', tool_input: { prompt: 'inspect' } }), 'subagent'],
        ['PostToolUse', 'edit', JSON.stringify({ tool_input: { file_path: 'README.md' } }), 'retired-observer'],
        ['PostToolUse', 'bash', JSON.stringify({ tool_input: { command: 'echo hi' }, tool_response: { stdout: 'hi\n', stderr: '', interrupted: false }, exit_code: 0 }), 'command-observed'],
        ['PostToolUse', 'always', JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Read' }), 'retired-observer'],
        ['UserPromptSubmit', 'default', JSON.stringify({ prompt: 'review this' }), 'prompt'],
        ['UserPromptSubmit', 'delegation', JSON.stringify({ prompt: 'implement next task' }), 'subagent'],
        ['SubagentStart', 'context', JSON.stringify({ hook_event_name: 'SubagentStart' }), 'subagent'],
        ['SubagentStop', 'quality', JSON.stringify({ hook_event_name: 'SubagentStop', final_message: 'inspected files and ran bun test; no risks identified' }), 'subagent'],
        ['Stop', 'default', JSON.stringify({ stop_hook_active: false }), 'stop'],
      ] as const;
      for (const [event, routeId, input, handler] of cases) {
        const result = runHook({ event, routeId, cwd: root, input, env: env(root, event === 'UserPromptSubmit' && routeId === 'delegation' || event === 'SubagentStart' || event === 'SubagentStop' ? 'codex' : 'claude') });
        expect(result.handler).toBe(handler);
      }
    } finally { clean(root); }
  }, 60000);

  test('the full CLI fallback forwards host stdin to the typed hook runtime', () => {
    const root = repo();
    try {
      const cli = join(import.meta.dir, '..', '..', 'src', 'cli', 'index.ts');
      const result = spawnSync(process.execPath, [cli, 'hook', 'PreToolUse', '--route', 'edit'], {
        cwd: root,
        env: env(root, 'codex'),
        input: `${JSON.stringify({ session_id: 'fallback-session', tool_input: { file_path: join(root, '_ops/secret.env') } })}\n`,
        encoding: 'utf8',
      });
      // Only the forwarded payload names this target; without stdin the guard would refuse a missing path instead.
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('[OpsPrivateGuard] _ops/secret.env is under _ops/');
    } finally { clean(root); }
  }, 30_000);

  test('Codex suppresses successful Stop stdout while preserving failure diagnostics', () => {
    const root = repo();
    try {
      const moduleUrl = new URL('../../src/cli/hook/runtime.ts', import.meta.url).href;
      const script = [
        `const { runHook } = await import(${JSON.stringify(moduleUrl)});`,
        `runHook({ event: 'Stop', routeId: 'default', cwd: ${JSON.stringify(root)}, input: JSON.stringify({ stop_hook_active: false }), env: { ...process.env, HOOK_REPO_ROOT: ${JSON.stringify(root)}, HOOK_HOST: 'codex', REPO_HARNESS_WORKFLOW_PROFILE: 'routine' } });`,
      ].join('\n');
      const result = spawnSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
    } finally { clean(root); }
  }, 30_000);

  test('one handled event writes one telemetry record', () => {
    const root = repo();
    try {
      const result = runHook({ event: 'PostToolUse', routeId: 'bash', cwd: root, input: JSON.stringify({ tool_input: { command: 'echo hi' }, tool_response: { stdout: 'hi\n', stderr: '', interrupted: false }, exit_code: 0 }), env: env(root) });
      expect(result.handler).toBe('command-observed');
      const lines = readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({ event: 'PostToolUse', route_id: 'bash', reason: 'ok' });
    } finally { clean(root); }
  }, 30_000);
});
