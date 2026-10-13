import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { hookIdentity } from '../src/cli/hook/hook-input';
import { runHook } from '../src/cli/hook/runtime';

describe('hook identity comes from the payload only', () => {
  test('takes session, run and turn from the payload', () => {
    expect(hookIdentity({ session_id: 'sess-1', run_id: 'run-from-payload', turn_id: 'turn-1' }, 'codex'))
      .toEqual({ host: 'codex', sessionId: 'sess-1', runId: 'run-from-payload', turnId: 'turn-1' });
  });

  test('a missing or blank id stays null and nothing is minted', () => {
    expect(hookIdentity({}, 'pi')).toEqual({ host: 'pi', sessionId: null, runId: null, turnId: null });
    expect(hookIdentity({ session_id: ' ', run_id: 7, turn_id: null }, 'claude'))
      .toEqual({ host: 'claude', sessionId: null, runId: null, turnId: null });
  });
});

function fixtureRepo(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/workflow-contract.json'), '{}\n');
  writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

function hookEvents(root: string): Record<string, unknown>[] {
  const file = join(root, '.ai/harness/runs/hook-events.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

describe('SessionStart identity in telemetry', () => {
  test('telemetry carries the payload ids, a null run without a payload run_id, and no identity file', () => {
    const root = fixtureRepo('run-identity-telemetry');
    try {
      const env = { ...process.env, HOOK_REPO_ROOT: root, HOOK_HOST: 'claude' };
      expect(runHook({ event: 'SessionStart', routeId: 'default', cwd: root, env,
        input: JSON.stringify({ session_id: 'sess-without-run' }) }).exitCode).toBe(0);
      expect(runHook({ event: 'SessionStart', routeId: 'default', cwd: root, env,
        input: JSON.stringify({ session_id: 'sess-with-run', run_id: 'loop-engine-run-77' }) }).exitCode).toBe(0);
      const [first, second] = hookEvents(root).filter((event) => event.event === 'SessionStart');
      expect(first).toMatchObject({ session_id: 'sess-without-run', run_id: null });
      expect(second).toMatchObject({ session_id: 'sess-with-run', run_id: 'loop-engine-run-77' });
      expect(existsSync(join(root, '.ai/harness/state/session-run-identity.json'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30000);
});
