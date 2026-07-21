import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runHook } from '../src/cli/hook/runtime';

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'hrd09-hook-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/workflow-contract.json'), '{}\n');
  writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

function env(root: string, host: 'claude' | 'codex' = 'claude'): NodeJS.ProcessEnv {
  return { ...process.env, HOOK_REPO_ROOT: root, HOOK_HOST: host, REPO_HARNESS_WORKFLOW_PROFILE: 'lite' };
}

describe('hook runtime typed dispatch', () => {
  test('passes host payload once to the command observer and records its result', () => {
    const root = fixture();
    try {
      const result = runHook({
        event: 'PostToolUse',
        routeId: 'bash',
        cwd: root,
        input: JSON.stringify({ tool_input: { command: 'echo hello' }, tool_output: 'hello\n', exit_code: 0 }),
        env: env(root),
      });
      expect(result).toMatchObject({ exitCode: 0, reason: 'ok', handler: 'command-observed' });
      const record = JSON.parse(readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim()) as Record<string, unknown>;
      expect(record.steps).toEqual([expect.objectContaining({ name: 'command-observed', execution: 'in_process', exit_code: 0 })]);
      expect(record.measurement).toMatchObject({ opaque_steps: [] });
      expect((record.measurement as { incomplete_metrics: string[] }).incomplete_metrics).toContain('files_read');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('host output policy is centralized and does not leak successful Codex stdout', () => {
    const root = fixture();
    try {
      const result = runHook({
        event: 'UserPromptSubmit',
        routeId: 'delegation',
        cwd: root,
        input: JSON.stringify({ prompt: 'implement the next task' }),
        env: env(root, 'codex'),
      });
      expect(result.handler).toBe('subagent');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('typed handlers do not consult a route filesystem or spawn a route child', () => {
    const root = fixture();
    try {
      const result = runHook({
        event: 'PostToolUse',
        routeId: 'always',
        cwd: root,
        input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Read' }),
        env: env(root),
      });
      expect(result.handler).toBe('trace-observer');
      const raw = readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim();
      const record = JSON.parse(raw) as { metrics: { child_processes: number }; steps: Array<{ execution: string }> };
      expect(record.metrics.child_processes).toBe(0);
      expect(record.steps.every((step) => step.execution === 'in_process')).toBe(true);
      expect(existsSync(join(root, '.ai/hooks'))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
