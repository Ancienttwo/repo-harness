import { describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runHook } from '../../src/cli/hook/runtime';

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
    HOOK_SESSION_ID: 'test-session',
    HOOK_RUN_ID: 'test-run',
    REPO_HARNESS_WORKFLOW_PROFILE: 'lite',
  };
}

function clean(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

describe('typed hook runtime', () => {
  test('fails open outside a git repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'hrd09-not-git-'));
    try {
      const result = runHook({ event: 'Stop', routeId: 'default', cwd: root, env: env(root) });
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
  });

  test('rejects an explicit repo-root mismatch before route dispatch', () => {
    const root = repo();
    const other = repo();
    try {
      const result = runHook({
        event: 'Stop',
        routeId: 'default',
        cwd: root,
        env: { ...env(root), HOOK_REPO_ROOT: other },
      });
      expect(result).toEqual({ exitCode: 0, reason: 'repo-root-mismatch' });
    } finally { clean(root); clean(other); }
  });

  test('unknown routes do not create a handler or telemetry record', () => {
    const root = repo();
    try {
      const result = runHook({ event: 'Stop', routeId: 'edit', cwd: root, env: env(root) });
      expect(result).toMatchObject({ exitCode: 2, reason: 'unknown-route' });
      expect(result.handler).toBeUndefined();
      expect(existsSync(join(root, '.ai/harness/runs/hook-events.jsonl'))).toBe(false);
    } finally { clean(root); }
  });

  test('dispatches each route through its typed handler identity', () => {
    const root = repo();
    try {
      const cases = [
        ['SessionStart', 'default', undefined, 'session-context'],
        ['PreToolUse', 'edit', JSON.stringify({ tool_input: { file_path: 'README.md' } }), 'mutation-guard'],
        ['PreToolUse', 'subagent', JSON.stringify({ tool_name: 'Task', tool_input: { prompt: 'inspect' } }), 'subagent'],
        ['PostToolUse', 'edit', JSON.stringify({ tool_input: { file_path: 'README.md' } }), 'mutation-observed'],
        ['PostToolUse', 'bash', JSON.stringify({ tool_input: { command: 'echo hi' }, tool_output: 'hi\n', exit_code: 0 }), 'command-observed'],
        ['PostToolUse', 'always', JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Read' }), 'trace-observer'],
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

  test('Codex suppresses successful Stop stdout while preserving failure diagnostics', () => {
    const root = repo();
    try {
      const moduleUrl = new URL('../../src/cli/hook/runtime.ts', import.meta.url).href;
      const script = [
        `const { runHook } = await import(${JSON.stringify(moduleUrl)});`,
        `runHook({ event: 'Stop', routeId: 'default', cwd: ${JSON.stringify(root)}, input: JSON.stringify({ stop_hook_active: false }), env: { ...process.env, HOOK_REPO_ROOT: ${JSON.stringify(root)}, HOOK_HOST: 'codex', REPO_HARNESS_WORKFLOW_PROFILE: 'lite' } });`,
      ].join('\n');
      const result = spawnSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
    } finally { clean(root); }
  });

  test('one telemetry record stays opaque-free without fabricating file-metric completeness', () => {
    const root = repo();
    try {
      const result = runHook({ event: 'PostToolUse', routeId: 'bash', cwd: root, input: JSON.stringify({ tool_input: { command: 'echo hi' }, tool_output: 'hi\n', exit_code: 0 }), env: env(root) });
      expect(result.handler).toBe('command-observed');
      const raw = readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim();
      const record = JSON.parse(raw) as { steps: Array<{ execution: string }>; measurement: { complete: boolean; incomplete_metrics: unknown[]; opaque_steps: unknown[] } };
      expect(record.steps).toHaveLength(1);
      expect(record.steps[0].execution).toBe('in_process');
      expect(record.measurement).toMatchObject({ complete: false, opaque_steps: [] });
      expect(record.measurement.incomplete_metrics).toContain('files_read');
    } finally { clean(root); }
  });
});
