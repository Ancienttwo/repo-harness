import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import { runInstall, runUninstall } from '../../src/cli/commands/install';

const ROOT = path.join(import.meta.dir, '..', '..');
const CLI = path.join(ROOT, 'src/cli/index.ts');

function withTempHome(fn: (home: string) => void): void {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-install-')));
  const prev = process.env.HOME;
  const prevBunInstall = process.env.BUN_INSTALL;
  process.env.HOME = tmp;
  process.env.BUN_INSTALL = path.join(tmp, '.bun');
  try {
    fn(tmp);
  } finally {
    if (prev === undefined) delete process.env.HOME;
    else process.env.HOME = prev;
    if (prevBunInstall === undefined) delete process.env.BUN_INSTALL;
    else process.env.BUN_INSTALL = prevBunInstall;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function writeReadyOfficialCodexPluginCli(home: string): string {
  const pluginRoot = path.join(home, '.claude', 'plugins', 'cache', 'openai-codex', 'codex', '1.0.6');
  fs.mkdirSync(path.join(pluginRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, 'schemas'), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, 'scripts', 'codex-companion.mjs'), '// fixture\n');
  fs.writeFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), JSON.stringify({
    name: 'codex',
    version: '1.0.6',
    author: { name: 'OpenAI' },
  }));
  fs.writeFileSync(path.join(pluginRoot, 'schemas', 'review-output.schema.json'), JSON.stringify({
    required: ['verdict', 'summary', 'findings', 'next_steps'],
    properties: {
      verdict: { enum: ['approve', 'needs-attention'] },
      findings: { items: { properties: { severity: { enum: ['critical', 'high', 'medium', 'low'] } } } },
    },
  }));
  const claude = path.join(home, 'bin', 'claude');
  fs.mkdirSync(path.dirname(claude), { recursive: true });
  fs.writeFileSync(claude, [
    '#!/bin/bash',
    'if [[ "$*" == "plugin list --json" ]]; then',
    `  printf '%s\\n' '${JSON.stringify([{ id: 'codex@openai-codex', version: '1.0.6', enabled: true, installPath: pluginRoot }])}'`,
    '  exit 0',
    'fi',
    'exit 9',
    '',
  ].join('\n'));
  fs.chmodSync(claude, 0o755);
  return claude;
}

describe('install command (Phase 1B)', () => {
  test('install profiles bound host route inventory', () => {
    withTempHome((home) => {
      runInstall({ target: 'codex', location: 'global', profile: 'minimal' });
      let hooks = JSON.parse(fs.readFileSync(path.join(home, '.codex/hooks.json'), 'utf-8')).hooks;
      expect(Object.values(hooks as Record<string, unknown[]>).flat()).toHaveLength(8);
      expect(hooks.UserPromptSubmit).toHaveLength(2);
      expect(hooks.SubagentStart).toBeUndefined();

      runInstall({ target: 'codex', location: 'global', profile: 'full' as never });
      hooks = JSON.parse(fs.readFileSync(path.join(home, '.codex/hooks.json'), 'utf-8')).hooks;
      expect(Object.values(hooks as Record<string, unknown[]>).flat()).toHaveLength(12);
      expect(hooks.SubagentStart).toHaveLength(1);
    });
  });

  test('adapter-only install rejects protocol-1 state before mutating host config', () => {
    withTempHome((home) => {
      const statePath = path.join(home, '.repo-harness', 'install-state.json');
      const hooksPath = path.join(home, '.codex', 'hooks.json');
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
      fs.writeFileSync(statePath, `${JSON.stringify({
        protocol: 1,
        profile: 'standard',
        components: [
          'cli',
          'effective-state',
          'scope-worktree-check-guards',
          'handoff',
          'host-adapters',
          'adaptive-workflow',
          'codegraph-conditional',
        ],
        transaction_id: 'legacy-standard',
        applied_at: '2026-07-14T00:00:00.000Z',
        ownership_manifest: [],
        previous: null,
      }, null, 2)}\n`);
      fs.writeFileSync(hooksPath, `${JSON.stringify({
        theme: 'user-owned',
        hooks: {
          PreToolUse: [{ hooks: [{ type: 'command', command: 'user hook' }] }],
        },
      }, null, 2)}\n`);
      const stateBefore = fs.readFileSync(statePath);
      const hooksBefore = fs.readFileSync(hooksPath);

      const result = spawnSync(process.execPath, [
        CLI,
        'install',
        '--target',
        'codex',
        '--location',
        'global',
      ], {
        cwd: ROOT,
        env: { ...process.env, HOME: home, BUN_INSTALL: path.join(home, '.bun') },
        encoding: 'utf-8',
      });

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain('--migrate-profile-state');
      expect(fs.readFileSync(statePath)).toEqual(stateBefore);
      expect(fs.readFileSync(hooksPath)).toEqual(hooksBefore);
    });
  }, 30_000);

  test('codex --location local errors with exit 2 (no project-local hook concept)', () => {
    withTempHome(() => {
      const result = runInstall({ target: 'codex', location: 'local' });
      expect(result.exitCode).toBe(2);
      expect(result.lines.some((l) => l.includes('[codex]') && l.includes('not supported'))).toBe(true);
    });
  });

  test('codex --location global creates ~/.codex/hooks.json with 12 matcher-grouped entries', () => {
    withTempHome((home) => {
      const result = runInstall({ target: 'codex', location: 'global' });
      expect(result.exitCode).toBe(0);
      const filePath = path.join(home, '.codex/hooks.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const tomlPath = path.join(home, '.codex/config.toml');
      expect(fs.readFileSync(tomlPath, 'utf-8')).toContain('default_mode_request_user_input = true');

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const entries = data.hooks;
      const total = Object.values(entries as Record<string, unknown[]>).flat().length;
      expect(total).toBe(12);

      // PostToolUse must have 3 matcher-disjoint entries
      expect((entries.PostToolUse as { matcher?: string }[]).map((e) => e.matcher)).toEqual([
        'Edit|Write',
        'Bash',
        undefined,
      ]);
      // PreToolUse must have isolated edit and subagent entries
      expect((entries.PreToolUse as { matcher?: string }[]).map((e) => e.matcher)).toEqual([
        'Edit|Write',
        'Task|Agent|SendUserMessage',
      ]);
      // SessionStart / Stop / SubagentStart / SubagentStop have 1 matcher-less entry each;
      // UserPromptSubmit has default + inbox + delegation.
      expect(entries.SessionStart.length).toBe(1);
      expect(entries.Stop.length).toBe(1);
      expect(entries.UserPromptSubmit.length).toBe(3);
      expect(entries.SubagentStart.length).toBe(1);
      expect(entries.SubagentStop.length).toBe(1);
    });
  });

  test('every adapter command embeds the CLI-missing fallback shim', () => {
    withTempHome((home) => {
      runInstall({ target: 'codex', location: 'global' });
      const data = JSON.parse(
        fs.readFileSync(path.join(home, '.codex/hooks.json'), 'utf-8'),
      );
      for (const [event, entries] of Object.entries(data.hooks) as [string, { hooks: { command: string; timeout?: number }[] }[]][]) {
        for (const entry of entries) {
          const hook = entry.hooks[0];
          const cmd = hook.command;
          expect(cmd).toContain('git rev-parse --show-toplevel');
          expect(cmd).toContain('repo-harness-managed-hook-v1');
          expect(cmd).toContain('export HOOK_REPO_ROOT="$repo"');
          expect(cmd).toContain('command -v repo-harness-hook');
          expect(cmd).toContain('exec repo-harness-hook ');
          expect(cmd).not.toContain('&& exit 0');
          expect(cmd).toContain('command -v repo-harness');
          expect(cmd).toContain('HOOK_HOST=codex');
          expect(cmd).toContain('exec repo-harness hook ');
          expect(hook.timeout).toBe(event === 'Stop' ? 150 : 30);
        }
      }
    });
  });

  test('codex install is idempotent — second run returns unchanged', () => {
    withTempHome(() => {
      const first = runInstall({ target: 'codex', location: 'global' });
      expect(first.lines.some((l) => l.includes('created'))).toBe(true);

      const second = runInstall({ target: 'codex', location: 'global' });
      expect(second.exitCode).toBe(0);
      expect(second.lines.some((l) => l.includes('unchanged'))).toBe(true);
    });
  });

  test('codex install updates existing config.toml to enable request-user-input popups', () => {
    withTempHome((home) => {
      const tomlPath = path.join(home, '.codex/config.toml');
      fs.mkdirSync(path.dirname(tomlPath), { recursive: true });
      fs.writeFileSync(
        tomlPath,
        [
          'model = "gpt-5"',
          'default_mode_request_user_input = false',
          '',
          '[features]',
          'hooks = true',
          '',
        ].join('\n'),
      );

      const result = runInstall({ target: 'codex', location: 'global' });
      expect(result.exitCode).toBe(0);
      const config = fs.readFileSync(tomlPath, 'utf-8');
      expect(config).toContain('default_mode_request_user_input = true');
      expect(config).not.toContain('default_mode_request_user_input = false');
      expect(config).toContain('[features]');
    });
  });

  test('claude --location global creates ~/.claude/settings.json with 9 shared hooks', () => {
    withTempHome((home) => {
      const result = runInstall({ target: 'claude', location: 'global' });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(
        fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf-8'),
      );
      const total = Object.values(data.hooks as Record<string, unknown[]>).flat().length;
      expect(total).toBe(9);
      expect(data.hooks.UserPromptSubmit.length).toBe(2);
      expect(data.hooks.SubagentStart).toBeUndefined();
      expect(data.hooks.SubagentStop).toBeUndefined();
      for (const [event, entries] of Object.entries(data.hooks) as [string, { hooks: { command: string; timeout?: number }[] }[]][]) {
        for (const entry of entries) {
          expect(entry.hooks[0].command).toContain('HOOK_HOST=claude');
          expect(entry.hooks[0].timeout).toBe(event === 'Stop' ? 150 : 30);
        }
      }
    });
  });

  test('claude install self-heals legacy Codex-only managed entries back to 9 shared hooks', () => {
    withTempHome((home) => {
      const filePath = path.join(home, '.claude/settings.json');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        `${JSON.stringify({
          hooks: {
            UserPromptSubmit: [
              { hooks: [{ type: 'command', command: 'HOOK_HOST=claude repo-harness hook UserPromptSubmit --route delegation' }] },
            ],
            SubagentStart: [
              { hooks: [{ type: 'command', command: 'HOOK_HOST=claude repo-harness hook SubagentStart --route context' }] },
            ],
            SubagentStop: [
              { hooks: [{ type: 'command', command: 'HOOK_HOST=claude repo-harness hook SubagentStop --route quality' }] },
            ],
          },
        }, null, 2)}\n`,
      );

      const result = runInstall({ target: 'claude', location: 'global' });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const total = Object.values(data.hooks as Record<string, unknown[]>).flat().length;
      expect(total).toBe(9);
      expect(data.hooks.UserPromptSubmit.length).toBe(2);
      expect(data.hooks.SubagentStart).toBeUndefined();
      expect(data.hooks.SubagentStop).toBeUndefined();
    });
  });

  test('install preserves sibling non-managed hooks (Phase 0 rtk hook claude case)', () => {
    withTempHome((home) => {
      const filePath = path.join(home, '.claude/settings.json');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        `${JSON.stringify({
          hooks: {
            PreToolUse: [
              { hooks: [{ type: 'command', command: 'rtk hook claude' }] },
              { hooks: [{ type: 'command', command: 'echo repo-harness hook is documented' }] },
            ],
          },
        }, null, 2)}\n`,
      );
      runInstall({ target: 'claude', location: 'global' });
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const pre = data.hooks.PreToolUse as { hooks: { command: string }[] }[];
      // 2 siblings + 2 managed
      expect(pre.length).toBe(4);
      expect(pre[0].hooks[0].command).toBe('rtk hook claude');
      expect(pre[1].hooks[0].command).toBe('echo repo-harness hook is documented');
      expect(pre[2].hooks[0].command).toContain('repo-harness hook PreToolUse');
      expect(pre[3].hooks[0].command).toContain('repo-harness hook PreToolUse');
    });
  });

  test('uninstall removes only managed Claude entries and leaves sibling entries intact', () => {
    withTempHome((home) => {
      const filePath = path.join(home, '.claude/settings.json');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        `${JSON.stringify({
          theme: 'dark',
          hooks: {
            UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'rtk hook claude' }] }],
          },
        }, null, 2)}\n`,
      );
      runInstall({ target: 'claude', location: 'global' });
      const beforeUninstall = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(beforeUninstall.theme).toBe('dark');
      expect(beforeUninstall.hooks.UserPromptSubmit.length).toBe(3);

      const uninstall = runUninstall({ target: 'claude', location: 'global' });
      expect(uninstall.exitCode).toBe(0);
      expect(uninstall.lines.some((l) => l.includes('[claude] removed'))).toBe(true);
      const afterUninstall = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(afterUninstall.theme).toBe('dark');
      expect(afterUninstall.hooks.UserPromptSubmit).toEqual([
        { hooks: [{ type: 'command', command: 'rtk hook claude' }] },
      ]);
    });
  });

  test('uninstall removes managed Codex entries and preserves trust TOML', () => {
    withTempHome((home) => {
      const result = runInstall({ target: 'codex', location: 'global' });
      expect(result.exitCode).toBe(0);
      const hooksPath = path.join(home, '.codex/hooks.json');
      const tomlPath = path.join(home, '.codex/config.toml');
      expect(fs.existsSync(hooksPath)).toBe(true);
      expect(fs.existsSync(tomlPath)).toBe(true);

      const uninstall = runUninstall({ target: 'codex', location: 'global' });
      expect(uninstall.exitCode).toBe(0);
      expect(uninstall.lines.some((l) => l.includes('[codex] removed'))).toBe(true);
      expect(uninstall.lines.some((l) => l.includes('[codex] note: ~/.codex/config.toml [hooks.state]'))).toBe(true);

      const data = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
      expect(data.hooks).toEqual({});
      expect(fs.readFileSync(tomlPath, 'utf-8')).toContain('default_mode_request_user_input = true');
    });
  });

  test('uninstall is idempotent when no managed entries exist', () => {
    withTempHome(() => {
      runInstall({ target: 'both', location: 'global' });
      const first = runUninstall({ target: 'both', location: 'global' });
      expect(first.exitCode).toBe(0);
      expect(first.lines.some((l) => l.includes('removed'))).toBe(true);

      const second = runUninstall({ target: 'both', location: 'global' });
      expect(second.exitCode).toBe(0);
      expect(second.lines.filter((l) => l.includes('not-found')).length).toBeGreaterThanOrEqual(2);
    });
  });

  test('both --location global installs to both targets', () => {
    withTempHome((home) => {
      const result = runInstall({ target: 'both', location: 'global' });
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(home, '.codex/hooks.json'))).toBe(true);
      expect(fs.existsSync(path.join(home, '.claude/settings.json'))).toBe(true);
      // Both targets each emit at least one created/updated line
      expect(result.lines.filter((l) => l.startsWith('[codex]')).length).toBeGreaterThan(0);
      expect(result.lines.filter((l) => l.startsWith('[claude]')).length).toBeGreaterThan(0);
    });
  });

  test('CLI exposes uninstall command', () => {
    withTempHome((home) => {
      const install = spawnSync('bun', [CLI, 'install', '--target', 'codex', '--location', 'global'], {
        cwd: ROOT,
        env: { ...process.env, HOME: home },
        encoding: 'utf-8',
      });
      expect(install.status).toBe(0);

      const uninstall = spawnSync('bun', [CLI, 'uninstall'], {
        cwd: ROOT,
        env: { ...process.env, HOME: home },
        encoding: 'utf-8',
      });
      expect(uninstall.status).toBe(0);
      expect(uninstall.stdout).toContain('[codex] removed');
    });
  }, 30_000);

  test('CLI install without required profile components fails closed and compensates adapters', () => {
    withTempHome((home) => {
      const claude = writeReadyOfficialCodexPluginCli(home);
      const install = spawnSync(
        'bun',
        [
          CLI,
          'install',
          '--target',
          'codex',
          '--no-cli',
          '--no-sync-skill',
          '--no-external-skills',
          '--no-codegraph',
        ],
        {
          cwd: ROOT,
          env: { ...process.env, HOME: home, REPO_HARNESS_CLAUDE_EXECUTABLE: claude },
          encoding: 'utf-8',
        },
      );
      expect(install.status).not.toBe(0);
      expect(`${install.stdout}\n${install.stderr}`).toContain('install profile projection is incomplete');
      expect(fs.existsSync(path.join(home, '.codex/hooks.json'))).toBe(false);
      expect(fs.existsSync(path.join(home, '.repo-harness/install-state.json'))).toBe(false);
    });
  }, 30_000);
});

describe('install native Codex delegation authority', () => {
  test('adapter-only install exposes no delegation-mode compatibility option or config write', () => {
    withTempHome((home) => {
      const help = spawnSync('bun', [CLI, 'install', '--help'], {
        cwd: ROOT,
        env: { ...process.env, HOME: home },
        encoding: 'utf-8',
      });
      expect(help.status).toBe(0);
      expect(help.stdout).not.toContain('--delegation-mode');

      const install = spawnSync('bun', [CLI, 'install', '--target', 'codex', '--location', 'global'], {
        cwd: ROOT,
        env: { ...process.env, HOME: home },
        encoding: 'utf-8',
      });
      expect(install.status).toBe(0);
      expect(fs.existsSync(path.join(home, '.codex/hooks.json'))).toBe(true);
      expect(fs.existsSync(path.join(home, '.repo-harness', 'config.json'))).toBe(false);
    });
  }, 30_000);
});
