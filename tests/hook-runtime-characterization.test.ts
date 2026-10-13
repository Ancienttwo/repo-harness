import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ROUTES, type HookEvent, type RouteId } from '../src/cli/hook/route-registry';
import { runHook } from '../src/cli/hook/runtime';
import { HOOK_EVENT_TELEMETRY_PROTOCOL } from '../src/cli/hook/event-telemetry';

interface FixtureRoute {
  readonly host: 'claude' | 'codex' | 'pi';
  readonly input?: string;
}

function fixtureInput(event: HookEvent, routeId: RouteId): FixtureRoute {
  switch (`${event}.${routeId}`) {
    case 'SessionStart.default': return { host: 'claude', input: JSON.stringify({ session_id: 'characterization-session' }) };
    case 'PreToolUse.edit': return { host: 'claude', input: JSON.stringify({ tool_input: { file_path: 'src/example.ts' } }) };
    case 'PreToolUse.subagent': return { host: 'claude', input: JSON.stringify({ tool_name: 'Agent', tool_input: { prompt: 'Inspect the repository and report findings.' } }) };
    case 'PostToolUse.bash': return { host: 'pi', input: JSON.stringify({ tool_input: { command: 'echo hello' }, tool_response: { stdout: 'hello\n', stderr: '', interrupted: false }, exit_code: 0 }) };
    case 'UserPromptSubmit.inbox': return { host: 'claude', input: JSON.stringify({ prompt: 'Check the task inbox.' }) };
    case 'UserPromptSubmit.delegation': return { host: 'codex', input: JSON.stringify({ session_id: 'characterization-session', prompt: 'implement the next sequential task' }) };
    case 'SubagentStart.context': return { host: 'codex', input: JSON.stringify({ hook_event_name: 'SubagentStart', session_id: 'characterization-session' }) };
    case 'Stop.default': return { host: 'claude', input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false }) };
    default: throw new Error(`missing fixture for ${event}.${routeId}`);
  }
}

function fixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'hrd09-hook-runtime-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/example.ts'), 'export const fixture = true;\n');
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/workflow-contract.json'), '{}\n');
  writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

function telemetry(root: string): Record<string, unknown>[] {
  const file = join(root, '.ai/harness/runs/hook-events.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

describe('HRD-09 typed runtime characterization', () => {
  test('every public route runs its typed handler and writes one v2 telemetry record', () => {
    const root = fixtureRepo();
    try {
      for (const route of ROUTES) {
        const fixture = fixtureInput(route.event, route.routeId);
        const result = runHook({
          event: route.event,
          routeId: route.routeId,
          cwd: root,
          input: fixture.input,
          env: {
            ...process.env,
            HOOK_REPO_ROOT: root,
            HOOK_HOST: fixture.host,
            REPO_HARNESS_WORKFLOW_PROFILE: 'routine',
          },
        });
        expect(result.handler).toBe(route.handler);
      }

      const records = telemetry(root);
      expect(records).toHaveLength(ROUTES.length);
      for (const record of records) {
        expect(record.protocol).toBe(HOOK_EVENT_TELEMETRY_PROTOCOL);
        expect(record.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
      }
      const sessionStart = records.find((record) => record.event === 'SessionStart');
      expect(sessionStart?.session_id).toBe('characterization-session');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);
});
