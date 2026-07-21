import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runTraceObserver, type TraceObserverFs } from '../src/cli/hook/trace-observer';

function workspace(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
}

function traceRecords(repoRoot: string): Array<Record<string, unknown>> {
  const tracePath = join(repoRoot, '.claude/.trace.jsonl');
  if (!existsSync(tracePath)) return [];
  return readFileSync(tracePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('runTraceObserver', () => {
  test('appends one structured trace record and preserves host attribution', () => {
    const repoRoot = workspace('trace-observer');
    try {
      const result = runTraceObserver({
        repoRoot,
        input: JSON.stringify({
          hook_event_name: 'PostToolUse',
          tool_name: 'Read',
          source: 'claude-code',
          session_id: 'session-1',
          duration_ms: 42,
          tool_input: { file_path: 'src/demo.ts' },
          tool_response: { exit_code: 0 },
        }),
        env: {
          CLAUDE_AGENT_NAME: 'main-claude',
          CLAUDE_SESSION_ID: 'session-1',
          CLAUDE_SESSION_SOURCE: 'claude-code',
        },
        dependencies: { now: () => new Date('2026-07-21T12:34:56.000Z') },
      });
      expect(result.exitCode).toBe(0);
      expect(result.reason).toBe('ok');
      const trace = readFileSync(join(repoRoot, '.claude/.trace.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(trace).toHaveLength(1);
      expect(trace[0]).toMatchObject({
        event_type: 'PostToolUse',
        tool_name: 'Read',
        file_path: 'src/demo.ts',
        exit_code: 0,
        duration_ms: 42,
        session_key: 'session-1',
        host: 'claude',
        agent_name: 'main-claude',
        session_source: 'claude-code',
      });
      expect(trace[0].run_id).toBe('run-claude-code-session-1');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('emits the plan annotation advisory and marks CodeGraph use without a second observer', () => {
    const repoRoot = workspace('trace-observer-plan');
    try {
      const result = runTraceObserver({
        repoRoot,
        input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'mcp__codegraph__context', session_id: 'codex-session' }),
        dependencies: {
          runGit: () => ' M plans/plan-20260721-1200-example.md\n',
          now: () => new Date('2026-07-21T12:34:56.000Z'),
        },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(existsSync(join(repoRoot, '.claude/.codegraph-state/codex-session.used'))).toBe(true);

      const annotation = runTraceObserver({
        repoRoot,
        input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'apply_patch', session_id: 'codex-session' }),
        dependencies: { runGit: () => ' M plans/plan-20260721-1200-example.md\n' },
      });
      expect(annotation.exitCode).toBe(0);
      expect(annotation.stdout).toContain('[AnnotationGuard] plans/plan-20260721-1200-example.md has annotations.');
      const trace = readFileSync(join(repoRoot, '.claude/.trace.jsonl'), 'utf8').trim().split('\n');
      expect(trace).toHaveLength(2);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('persists the resolved session key and keeps observer state free of context-budget side effects', () => {
    const repoRoot = workspace('trace-observer-session-state');
    try {
      const first = runTraceObserver({
        repoRoot,
        input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Read' }),
        dependencies: { now: () => new Date('2026-07-21T12:34:56.000Z') },
      });
      expect(first).toMatchObject({ exitCode: 0, reason: 'ok', stdout: '', stderr: '' });
      const sessionFile = join(repoRoot, '.claude/.session-id');
      const session = readFileSync(sessionFile, 'utf8').trim();
      expect(session).toMatch(/^session-2026-07-21T12:34:56\.000Z-/);

      const second = runTraceObserver({
        repoRoot,
        input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Read' }),
        dependencies: { now: () => new Date('2026-07-21T12:35:56.000Z') },
      });
      expect(second.exitCode).toBe(0);
      const records = traceRecords(repoRoot);
      expect(records).toHaveLength(2);
      expect(records.map((record) => record.session_key)).toEqual([session, session]);
      expect(existsSync(join(repoRoot, '.claude/.tool-call-count'))).toBe(false);
      expect(existsSync(join(repoRoot, '.claude/.context-pressure'))).toBe(false);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('preserves nested tool response fields, path normalization, and explicit run-id precedence', () => {
    const repoRoot = workspace('trace-observer-fields');
    try {
      const result = runTraceObserver({
        repoRoot,
        input: JSON.stringify({
          hook_event_name: 'PostToolUse',
          tool_name: 'Read',
          file_path: join(repoRoot, 'src/demo.ts'),
          run_id: 'input-run',
          exit_code: 3,
          duration_ms: 4,
          tool_response: { exit_code: 7, duration_ms: 12 },
        }),
        env: { HOOK_RUN_ID: 'env-run', CLAUDE_SESSION_ID: 'session-fields' },
      });
      expect(result.exitCode).toBe(0);
      expect(traceRecords(repoRoot)[0]).toMatchObject({
        event_type: 'PostToolUse',
        tool_name: 'Read',
        file_path: 'src/demo.ts',
        exit_code: 7,
        duration_ms: 4,
        run_id: 'env-run',
        session_key: 'session-fields',
      });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('keeps outside-repo absolute paths unchanged and unknown host attribution explicit', () => {
    const repoRoot = workspace('trace-observer-paths');
    try {
      const result = runTraceObserver({
        repoRoot,
        input: JSON.stringify({
          hook_event_name: 'PostToolUse',
          tool_name: 'Read',
          file_path: '/var/tmp/external.txt',
          session_id: 'external-session',
          source: 'other-host',
        }),
      });
      expect(result.exitCode).toBe(0);
      expect(traceRecords(repoRoot)[0]).toMatchObject({
        file_path: '/var/tmp/external.txt',
        host: 'unknown',
        session_key: 'external-session',
        session_source: 'other-host',
        agent_name: 'unknown',
      });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('marks CodeGraph usage with a sanitized session marker and does not invoke git for ordinary traces', () => {
    const repoRoot = workspace('trace-observer-codegraph');
    try {
      const gitCalls: string[][] = [];
      const ordinary = runTraceObserver({
        repoRoot,
        input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Read', session_id: 'session ordinary' }),
        dependencies: { runGit: (args) => { gitCalls.push([...args]); return ''; } },
      });
      expect(ordinary.exitCode).toBe(0);
      expect(gitCalls).toEqual([]);

      const codegraph = runTraceObserver({
        repoRoot,
        input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'mcp__codegraph__context', session_id: 'session/ordinary' }),
      });
      expect(codegraph.exitCode).toBe(0);
      expect(existsSync(join(repoRoot, '.claude/.codegraph-state/session_ordinary.used'))).toBe(true);
      expect(traceRecords(repoRoot)).toHaveLength(2);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('rotates an oversized trace before appending the next event', () => {
    const repoRoot = workspace('trace-observer-rotation');
    try {
      mkdirSync(join(repoRoot, '.claude'), { recursive: true });
      const oldRecords = Array.from({ length: 10001 }, (_, index) => JSON.stringify({ legacy: index })).join('\n') + '\n';
      writeFileSync(join(repoRoot, '.claude/.trace.jsonl'), oldRecords);

      const result = runTraceObserver({
        repoRoot,
        input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Read', session_id: 'rotation-session' }),
      });
      expect(result.exitCode).toBe(0);
      const lines = readFileSync(join(repoRoot, '.claude/.trace.jsonl'), 'utf8').trim().split('\n');
      expect(lines).toHaveLength(5001);
      expect(JSON.parse(lines[0])).toEqual({ legacy: 5001 });
      expect(JSON.parse(lines.at(-1) as string)).toMatchObject({ tool_name: 'Read', session_key: 'rotation-session' });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('suppresses annotation when git status fails but still records the observer event', () => {
    const repoRoot = workspace('trace-observer-git-error');
    try {
      const result = runTraceObserver({
        repoRoot,
        input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'apply_patch', session_id: 'session-git-error' }),
        dependencies: { runGit: () => { throw new Error('git unavailable'); } },
      });
      expect(result).toMatchObject({ exitCode: 0, stdout: '', stderr: '', reason: 'ok' });
      expect(traceRecords(repoRoot)).toHaveLength(1);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('reports malformed payloads and append failures without invoking a legacy shell dispatcher', () => {
    const repoRoot = workspace('trace-observer-errors');
    try {
      const malformed = runTraceObserver({
        repoRoot,
        input: 'not json',
        dependencies: { now: () => new Date('2026-07-21T12:34:56.000Z') },
      });
      expect(malformed.exitCode).toBe(0);
      expect(malformed.stderr).toContain('[HookInput] WARN');
      expect(traceRecords(repoRoot)).toHaveLength(1);

      const fsApi: TraceObserverFs = {
        existsSync: () => false,
        readFileSync: () => '',
        realpathSync: (path) => path,
        statSync: () => ({ isFile: () => true }),
        mkdirSync: () => undefined,
        writeFileSync: () => undefined,
        appendFileSync: () => { throw new Error('trace disk full'); },
      };
      const failed = runTraceObserver({
        repoRoot,
        input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Read' }),
        dependencies: { fs: fsApi },
      });
      expect(failed.exitCode).toBe(1);
      expect(failed.reason).toBe('write-failed');
      expect(failed.stderr).toContain('[TraceObserver] trace disk full');
      expect(failed.stderr).not.toContain('run-hook.sh');
      expect(failed.stderr).not.toContain('post-tool-observer.sh');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
