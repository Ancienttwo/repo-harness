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
import { HOOK_EVENT_TELEMETRY_PROTOCOL } from '../../src/cli/hook/event-telemetry';
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

function routeInput(event: HookEvent, routeId: RouteId): { readonly host: 'claude' | 'codex' | 'pi'; readonly input?: string } {
  switch (`${event}.${routeId}`) {
    case 'SessionStart.default': return { host: 'claude' };
    case 'PreToolUse.edit': return { host: 'claude', input: JSON.stringify({ tool_input: { file_path: 'src/example.ts' } }) };
    case 'PreToolUse.subagent': return { host: 'claude', input: JSON.stringify({ tool_name: 'Agent', tool_input: { prompt: 'Inspect the fixture and report evidence.' } }) };
    case 'PostToolUse.bash': return { host: 'pi', input: JSON.stringify({ tool_input: { command: 'echo fixture' }, tool_response: { stdout: 'fixture\n', stderr: '', interrupted: false }, exit_code: 0 }) };
    case 'UserPromptSubmit.inbox': return { host: 'claude', input: JSON.stringify({ prompt: 'check task inbox' }) };
    case 'SubagentStart.context': return { host: 'codex', input: JSON.stringify({ hook_event_name: 'SubagentStart', session_id: 'hrd09-fixture' }) };
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
  test('one adoption transaction retires the exact Bash runtime and all current routes stay on one typed authority', () => {
    const repo = mkdtempSync(join(tmpdir(), 'hrd09-integrated-'));
    // HOME is isolated so no route reads the real ~/.claude or ~/.codex, and it
    // has to live outside `repo`: Bun writes its transpile cache under
    // $HOME/Library/Caches/bun, and inside the repo those files land in the
    // drift scan's untracked set, which spawns one CLI per path and pushes the
    // Stop route past its budget.
    const home = mkdtempSync(join(tmpdir(), 'hrd09-home-'));
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
            { type: 'command', command: 'repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; HOOK_HOST=codex HOOK_REPO_ROOT="$repo" bash "$repo/.ai/hooks/run-hook.sh" post-bash.sh' },
            { type: 'command', command: 'bash scripts/custom-owner-hook.sh' },
          ] }],
        },
        ownerField: true,
      }, null, 2)}\n`);
      writeFileSync(join(repo, '.claude/settings.json'), `${JSON.stringify({
        hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; HOOK_REPO_ROOT="$repo" bash "$repo/.ai/hooks/run-hook.sh" prompt-guard.sh' }] }] },
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
      // Adoption lands as a commit in practice. Committing it here keeps the
      // Stop route's git-derived architecture changed set at the realistic
      // post-adoption delta instead of replaying the whole 70-file adoption
      // transaction through the per-path cascade.
      execFileSync('git', ['add', '-A'], { cwd: repo });
      execFileSync('git', ['commit', '-q', '-m', 'adopt harness'], { cwd: repo });

      const retirement = JSON.parse(readFileSync(join(ROOT, 'assets/workflow-contract.v1.json'), 'utf8'))
        .migrations.upgrade.actions.find((action: { id?: string }) => action.id === 'legacy-hook-runtime-retirement') as { paths: string[] };
      for (const path of retirement.paths) expect(existsSync(join(repo, path))).toBe(false);
      expect(existsSync(join(repo, '.ai/hooks/custom-owner-hook.sh'))).toBe(true);
      expect(existsSync(join(repo, '.ai/hooks/lib/workflow-state.sh'))).toBe(false);
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
          ...(provider === 'claude' ? [
            'if [ "$1" = "plugin" ] && [ "$2" = "list" ] && [ "$3" = "--json" ]; then',
            "  printf '[]\\n'",
            '  exit 0',
            'fi',
          ] : []),
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
          env: {
            ...process.env,
            HOME: home,
            PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
            HOOK_REPO_ROOT: repo,
            HOOK_HOST: fixture.host,
            REPO_HARNESS_WORKFLOW_PROFILE: 'routine',
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
        expect((record as { protocol: string }).protocol).toBe(HOOK_EVENT_TELEMETRY_PROTOCOL);
        // v2 records carry no step names; nothing in a record may name a retired script.
        for (const retired of RETIRED_BASENAMES) expect(JSON.stringify(record)).not.toContain(retired);
      }
      expect(existsSync(providerLog) ? readFileSync(providerLog, 'utf8') : '').toBe('');
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  }, 120000);
});
