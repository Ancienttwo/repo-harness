import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runHook } from '../src/cli/hook/runtime';
import { isHookEventTelemetryRecord } from '../src/cli/hook/event-telemetry';

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
  }, 30_000);

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
  }, 30_000);

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
  }, 30_000);

  test('targeted commit-then-throw is a complete effect observation but incomplete metrics', () => {
    const root = fixture();
    try {
      const result = runHook({
        event: 'PostToolUse',
        routeId: 'edit',
        cwd: root,
        input: JSON.stringify({ tool_input: { file_path: 'src/example.ts' } }),
        env: env(root),
        afterEffectCommit: (phase) => {
          if (phase === 'journal') throw new Error('injected after journal commit');
        },
      });
      expect(result).toMatchObject({ exitCode: 1, reason: 'handler-failed', handler: 'mutation-observed' });
      const record: unknown = JSON.parse(readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim());
      expect(isHookEventTelemetryRecord(record)).toBe(true);
      if (!isHookEventTelemetryRecord(record)) throw new Error('record failed validation');
      expect(record.effect_observation).toMatchObject({
        contract_id: 'mutation-observed.durable-journal.v1',
        state: 'committed_complete',
        committed_phases: ['journal'],
        last_committed_phase: 'journal',
      });
      expect(record.measurement.complete).toBe(false);
      expect(record.measurement.incomplete_metrics).toContain('event_writes');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 30_000);

  test('handlers without an effect contract omit effect observation instead of claiming zero effects', () => {
    const root = fixture();
    try {
      runHook({
        event: 'PostToolUse',
        routeId: 'bash',
        cwd: root,
        input: JSON.stringify({ tool_input: { command: 'echo hello' }, tool_output: 'hello\n', exit_code: 0 }),
        env: env(root),
      });
      const record = JSON.parse(readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim()) as Record<string, unknown>;
      expect(record).not.toHaveProperty('effect_observation');
      expect(isHookEventTelemetryRecord(record)).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 30_000);

  test('failure before the first observed Stop commit is unknown-partial, not false zero', () => {
    const root = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'hrd09-stop-outside-'));
    try {
      symlinkSync(outside, join(root, '.ai/harness/handoff'));
      const result = runHook({
        event: 'Stop',
        routeId: 'default',
        cwd: root,
        input: JSON.stringify({ stop_hook_active: false }),
        env: env(root),
      });
      expect(result).toMatchObject({ exitCode: 1, reason: 'handler-failed', handler: 'stop' });
      const record: unknown = JSON.parse(readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim());
      expect(isHookEventTelemetryRecord(record)).toBe(true);
      if (!isHookEventTelemetryRecord(record)) throw new Error('record failed validation');
      expect(record.effect_observation).toMatchObject({ state: 'unknown_partial', committed_phases: [] });
      expect(record.measurement.complete).toBe(false);
      expect(record.measurement.incomplete_metrics).toContain('durable_writes');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  }, 30_000);

  test('bounded Stop overflow keeps public failure stable and marks reconciliation telemetry', () => {
    const root = fixture();
    try {
      const runEnv = { ...env(root), HOOK_RUN_ID: 'runtime-overflow-run' };
      const first = runHook({
        event: 'Stop', routeId: 'default', cwd: root,
        input: JSON.stringify({ stop_hook_active: false }), env: runEnv,
        afterEffectCommit: (phase) => {
          if (phase === 'event') throw new Error('fault after event');
        },
      });
      expect(first).toMatchObject({ exitCode: 1, reason: 'handler-failed', handler: 'stop' });
      const eventsPath = join(root, '.ai/harness/events.jsonl');
      writeFileSync(eventsPath, `${readFileSync(eventsPath, 'utf8')}${JSON.stringify({
        ts: '2026-08-14T08:00:30+0800', event_type: 'operator-event', reason: 'overflow', run_id: 'operator',
        extra: { payload: 'x'.repeat(2 * 1024 * 1024) },
      })}\n`);

      const retry = runHook({
        event: 'Stop', routeId: 'default', cwd: root,
        input: JSON.stringify({ stop_hook_active: false }), env: runEnv,
      });
      expect(retry).toMatchObject({ exitCode: 1, reason: 'handler-failed', handler: 'stop' });
      const records = readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8')
        .trim().split('\n').map((line) => JSON.parse(line));
      const record: unknown = records.at(-1);
      expect(isHookEventTelemetryRecord(record)).toBe(true);
      if (!isHookEventTelemetryRecord(record)) throw new Error('record failed validation');
      expect(record.result_reason).toBe('effect-reconcile-required');
      expect(record.effect_observation).toMatchObject({
        state: 'committed_partial',
        committed_phases: ['handoff', 'resume'],
        recovery: 'reconcile-required',
      });
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 30_000);
});
