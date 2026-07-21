import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import { planAdoption } from '../../src/core/adoption/plan';
import { applyAdoptionPlan } from '../../src/effects/fs-transaction';
import { isHookEventTelemetryRecord } from '../../src/cli/hook/event-telemetry';
import { ROUTES, type HookEvent, type RouteId } from '../../src/cli/hook/route-registry';
import { runHook } from '../../src/cli/hook/runtime';

const ROOT = join(import.meta.dir, '..', '..');
const LEGACY_FIXTURE = join(ROOT, 'tests/fixtures/hrd09-legacy-hook-runtime');
const RETIRED_BASENAMES = [
  'run-hook.sh',
  'prompt-guard.sh',
  'post-bash.sh',
  'post-tool-observer.sh',
  'subagent-return-channel-guard.sh',
  'subagent-start-context.sh',
  'subagent-stop-quality.sh',
  'codex-delegation-advisor.sh',
  'hook-shim.sh',
  'repo-harness.sh',
] as const;

function routeInput(event: HookEvent, routeId: RouteId): { readonly host: 'claude' | 'codex'; readonly input?: string } {
  switch (`${event}.${routeId}`) {
    case 'SessionStart.default': return { host: 'claude' };
    case 'PreToolUse.edit': return { host: 'claude', input: JSON.stringify({ tool_input: { file_path: 'src/example.ts' } }) };
    case 'PreToolUse.subagent': return { host: 'claude', input: JSON.stringify({ tool_name: 'Task', tool_input: { prompt: 'Inspect the fixture and report evidence.' } }) };
    case 'PostToolUse.edit': return { host: 'claude', input: JSON.stringify({ tool_input: { file_path: 'src/example.ts' } }) };
    case 'PostToolUse.bash': return { host: 'claude', input: JSON.stringify({ tool_input: { command: 'echo fixture' }, tool_output: 'fixture\n', exit_code: 0 }) };
    case 'PostToolUse.always': return { host: 'claude', input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Read' }) };
    case 'UserPromptSubmit.default': return { host: 'claude', input: JSON.stringify({ prompt: 'status update' }) };
    case 'UserPromptSubmit.delegation': return { host: 'codex', input: JSON.stringify({ session_id: 'hrd09-fixture', prompt: 'implement the next sequential task' }) };
    case 'SubagentStart.context': return { host: 'codex', input: JSON.stringify({ hook_event_name: 'SubagentStart', session_id: 'hrd09-fixture' }) };
    case 'SubagentStop.quality': return { host: 'codex', input: JSON.stringify({ hook_event_name: 'SubagentStop', final_message: 'Inspected src/example.ts. Evidence: fixture assertion passed. Risk: none. Recommended action: continue.' }) };
    case 'Stop.default': return { host: 'claude', input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false }) };
    default: throw new Error(`missing route fixture for ${event}.${routeId}`);
  }
}

function readEventRecords(repo: string): unknown[] {
  return readFileSync(join(repo, '.ai/harness/runs/hook-events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('HRD-09 terminal runtime migration', () => {
  test('one adoption transaction retires the exact Bash runtime and all eleven routes stay on one typed authority', () => {
    const repo = mkdtempSync(join(tmpdir(), 'hrd09-integrated-'));
    try {
      cpSync(join(LEGACY_FIXTURE, '.ai'), join(repo, '.ai'), { recursive: true });
      cpSync(join(LEGACY_FIXTURE, 'scripts'), join(repo, 'scripts'), { recursive: true });
      mkdirSync(join(repo, '.ai/hooks'), { recursive: true });
      writeFileSync(join(repo, '.ai/hooks/custom-owner-hook.sh'), '#!/bin/sh\necho owner\n');
      mkdirSync(join(repo, '.codex'), { recursive: true });
      mkdirSync(join(repo, '.claude'), { recursive: true });
      writeFileSync(join(repo, '.codex/hooks.json'), `${JSON.stringify({
        hooks: {
          PostToolUse: [{ matcher: 'Bash', hooks: [
            { type: 'command', command: 'bash .ai/hooks/run-hook.sh post-bash.sh' },
            { type: 'command', command: 'bash scripts/custom-owner-hook.sh' },
          ] }],
        },
        ownerField: true,
      }, null, 2)}\n`);
      writeFileSync(join(repo, '.claude/settings.json'), `${JSON.stringify({
        hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: '.ai/hooks/run-hook.sh prompt-guard.sh' }] }] },
        permissions: { allow: ['Bash(git status:*)'] },
      }, null, 2)}\n`);
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(join(repo, 'src/example.ts'), 'export const fixture = true;\n');
      writeFileSync(join(repo, 'README.md'), '# HRD-09 integrated fixture\n');

      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
      execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: repo });
      execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: repo });
      execFileSync('git', ['add', '.'], { cwd: repo });
      execFileSync('git', ['commit', '-q', '-m', 'legacy fixture'], { cwd: repo });

      const planned = planAdoption({ repoRoot: repo, mode: 'standard', apply: true });
      const applied = applyAdoptionPlan(planned);
      expect(applied.ok).toBe(true);
      expect(applied.transactionManifestPath).toBeDefined();
      expect(planAdoption({ repoRoot: repo, mode: 'standard' }).summary.plannedTotal).toBe(0);

      const retirement = JSON.parse(readFileSync(join(ROOT, 'assets/workflow-contract.v1.json'), 'utf8'))
        .migrations.upgrade.actions.find((action: { id?: string }) => action.id === 'legacy-hook-runtime-retirement') as { paths: string[] };
      for (const path of retirement.paths) expect(existsSync(join(repo, path))).toBe(false);
      expect(existsSync(join(repo, '.ai/hooks/custom-owner-hook.sh'))).toBe(true);
      expect(existsSync(join(repo, '.ai/hooks/lib/workflow-state.sh'))).toBe(true);
      const codexConfig = readFileSync(join(repo, '.codex/hooks.json'), 'utf8');
      expect(codexConfig).not.toContain('run-hook.sh');
      expect(codexConfig).toContain('custom-owner-hook.sh');
      expect(codexConfig).toContain('ownerField');
      const claudeConfig = readFileSync(join(repo, '.claude/settings.json'), 'utf8');
      expect(claudeConfig).not.toContain('run-hook.sh');
      expect(claudeConfig).toContain('permissions');

      const fakeBin = join(repo, '.test-bin');
      const providerLog = join(repo, '.provider-invocations');
      mkdirSync(fakeBin);
      for (const provider of ['claude', 'codex']) {
        const shim = join(fakeBin, provider);
        writeFileSync(shim, [
          '#!/bin/sh',
          'case "$*" in',
          `  --version|-V) printf '%s\\n' '${provider}-fixture 1.0.0'; exit 0 ;;`,
          `  *) printf '%s\\n' ${provider} >> ${JSON.stringify(providerLog)}; exit 99 ;;`,
          'esac',
          '',
        ].join('\n'));
        chmodSync(shim, 0o755);
      }

      for (const route of ROUTES) {
        const fixture = routeInput(route.event, route.routeId);
        const result = runHook({
          event: route.event,
          routeId: route.routeId,
          cwd: repo,
          input: fixture.input,
          stdio: 'ignore',
          env: {
            ...process.env,
            HOME: repo,
            PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
            HOOK_REPO_ROOT: repo,
            HOOK_HOST: fixture.host,
            HOOK_SESSION_ID: 'hrd09-fixture',
            HOOK_RUN_ID: 'hrd09-fixture-run',
            REPO_HARNESS_WORKFLOW_PROFILE: 'lite',
            REPO_HARNESS_CLI: join(ROOT, 'src/cli/index.ts'),
          },
        });
        expect(result.handler).toBe(route.handler);
      }

      const records = readEventRecords(repo);
      expect(records).toHaveLength(ROUTES.length);
      expect(new Set(records.map((record) => (record as { event_id: string }).event_id)).size).toBe(ROUTES.length);
      expect(new Set(records.map((record) => `${(record as { event: string }).event}.${(record as { route_id: string }).route_id}`)))
        .toEqual(new Set(ROUTES.map((route) => `${route.event}.${route.routeId}`)));
      for (const record of records) {
        expect(isHookEventTelemetryRecord(record)).toBe(true);
        const typed = record as {
          runtime_entries: number;
          steps: Array<{ name: string; execution: string }>;
          metrics: { child_processes: number };
          measurement: { opaque_steps: string[] };
        };
        expect(typed.runtime_entries).toBe(1);
        expect(typed.steps).toHaveLength(1);
        expect(typed.steps[0]?.execution).toBe('in_process');
        expect(typed.metrics.child_processes).toBe(0);
        expect(typed.measurement.opaque_steps).toEqual([]);
        for (const retired of RETIRED_BASENAMES) expect(typed.steps[0]?.name).not.toContain(retired);
      }
      expect(existsSync(providerLog) ? readFileSync(providerLog, 'utf8') : '').toBe('');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 120000);
});
