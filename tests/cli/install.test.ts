import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import { runInstall, runUninstall } from '../../src/cli/commands/install';
import { claudeTarget } from '../../src/cli/installer/targets/claude';
import type { Location } from '../../src/cli/installer/types';
import { readConfigurationReceipt } from '../../src/cli/installer/configuration-ownership';
import { isRepoHarnessManagedHookCommand } from '../../src/core/adoption/managed-hook-config';

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

describe('issue 698 host configuration ownership', () => {
  for (const topLevel of ['', 'default_mode_request_user_input = false\n']) {
    test(`issue 698 installs and restores only the top-level TOML key (${topLevel ? 'replace' : 'add'})`, () => {
      withTempHome((home) => {
        const filePath = path.join(home, '.codex/config.toml');
        const original = `${topLevel}model = "user"\n[profiles.work]\ndefault_mode_request_user_input = false\n`;
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, original);

        const install = runInstall({ target: 'codex', location: 'global' });
        expect(install.exitCode).toBe(0);
        const installed = fs.readFileSync(filePath, 'utf8');
        const parsed = Bun.TOML.parse(installed) as any;
        expect(parsed.default_mode_request_user_input).toBe(true);
        expect(parsed.profiles.work.default_mode_request_user_input).toBe(false);
        expect(installed).toContain('[profiles.work]\ndefault_mode_request_user_input = false\n');
        const receipt = readConfigurationReceipt({ HOME: home });
        expect(receipt.pending).toBeUndefined();
        expect(receipt.changes).toEqual([{
          path: filePath,
          selector: 'default_mode_request_user_input',
          before: topLevel || null,
          installed: 'default_mode_request_user_input = true\n',
          active: true,
        }]);
        expect(runInstall({ target: 'codex', location: 'global' }).exitCode).toBe(0);
        expect(fs.readFileSync(filePath, 'utf8')).toBe(installed);
        expect(readConfigurationReceipt({ HOME: home })).toEqual(receipt);

        expect(runUninstall({ target: 'codex', location: 'global' }).exitCode).toBe(0);
        expect(fs.readFileSync(filePath, 'utf8')).toBe(original);
      });
    });
  }

  test('issue 698 leaves a true top-level TOML key and false profile key unchanged', () => {
    withTempHome((home) => {
      const filePath = path.join(home, '.codex/config.toml');
      const original = 'default_mode_request_user_input = true # user setting\n[profiles.work]\ndefault_mode_request_user_input = false\n';
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, original);
      expect(runInstall({ target: 'codex', location: 'global' }).exitCode).toBe(0);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(original);
      expect(readConfigurationReceipt({ HOME: home }).changes).toEqual([]);
    });
  });

  for (const raw of [
    'default_mode_request_user_input = false\ndefault_mode_request_user_input = true\n',
    '"default_mode_request_user_input" = false\n',
    '[profiles.work\ndefault_mode_request_user_input = false\n',
    'text = """\ndefault_mode_request_user_input = false\n"""\ndefault_mode_request_user_input = false\n',
  ]) {
    test(`issue 698 refuses unsupported TOML before any config write: ${JSON.stringify(raw)}`, () => {
      withTempHome((home) => {
        const filePath = path.join(home, '.codex/config.toml');
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, raw);
        expect(runInstall({ target: 'codex', location: 'global' }).exitCode).toBe(1);
        expect(fs.readFileSync(filePath, 'utf8')).toBe(raw);
        expect(fs.existsSync(path.join(home, '.codex/hooks.json'))).toBe(false);
        expect(fs.existsSync(path.join(home, '.repo-harness/configuration-restore.json'))).toBe(false);
      });
    });
  }

  for (const host of ['codex', 'claude'] as const) {
    for (const shape of ['file', 'directory', 'dangling'] as const) {
      test(`issue 698 ${host} install refuses a ${shape} symlink before writes`, () => {
        withTempHome((home) => {
          const name = host === 'codex' ? 'hooks.json' : 'settings.json';
          const root = path.join(home, `.${host}`);
          const filePath = path.join(root, name);
          const outside = path.join(home, 'dotfiles');
          const victim = path.join(outside, name);
          const original = '{"theme":"user"}\n';
          fs.mkdirSync(outside);
          if (shape !== 'dangling') fs.writeFileSync(victim, original);
          if (shape === 'directory') fs.symlinkSync(outside, root);
          else {
            fs.mkdirSync(root);
            fs.symlinkSync(victim, filePath);
          }
          const linkPath = shape === 'directory' ? root : filePath;
          const link = fs.readlinkSync(linkPath);
          const install = runInstall({ target: host, location: 'global' });
          expect(install.exitCode).toBe(1);
          expect(install.lines.join('\n')).toContain('refusing symlink configuration path');
          expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
          expect(fs.readlinkSync(linkPath)).toBe(link);
          if (shape !== 'dangling') expect(fs.readFileSync(victim, 'utf8')).toBe(original);
          else expect(fs.existsSync(victim)).toBe(false);
          expect(fs.existsSync(path.join(root, 'config.toml'))).toBe(false);
          expect(fs.existsSync(path.join(home, '.repo-harness/configuration-restore.json'))).toBe(false);
          expect(runUninstall({ target: host, location: 'global' }).exitCode).toBe(1);
          expect(fs.readlinkSync(linkPath)).toBe(link);
        });
      });
    }
  }

  test('issue 698 rejects local commands and Claude target calls without touching settings', () => {
    withTempHome((home) => {
      const repo = path.join(home, 'project');
      fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
      const victim = path.join(home, 'dotfile.json');
      const original = '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"repo-harness hook SessionStart --route default"}]}]}}\n';
      fs.writeFileSync(victim, original);
      const filePath = path.join(repo, '.claude/settings.json');
      fs.symlinkSync(victim, filePath);
      const previous = process.cwd();
      process.chdir(repo);
      try {
        const local = 'local' as Location; // Deliberately invalid runtime input.
        for (const target of ['codex', 'claude', 'both'] as const) {
          expect(runInstall({ target, location: local }).exitCode).toBe(2);
          expect(runUninstall({ target, location: local, dryRun: true }).exitCode).toBe(2);
          expect(runUninstall({ target, location: local, recoverInterrupted: true }).exitCode).toBe(2);
          expect(runUninstall({ target, location: local }).exitCode).toBe(2);
        }
        expect(() => claudeTarget.install(local, {})).toThrow('--location global');
        expect(() => claudeTarget.uninstall(local)).toThrow('--location global');
        expect(() => claudeTarget.detect(local)).toThrow('--location global');
        expect(fs.lstatSync(filePath).isSymbolicLink()).toBe(true);
        expect(fs.readFileSync(victim, 'utf8')).toBe(original);
        expect(fs.existsSync(path.join(home, '.claude'))).toBe(false);
        expect(fs.existsSync(path.join(home, '.codex'))).toBe(false);
        expect(fs.existsSync(path.join(home, '.repo-harness'))).toBe(false);
      } finally { process.chdir(previous); }
    });
  });

  test('issue 698 preserves user commands that mention retired paths or command prefixes', () => {
    withTempHome((home) => {
      const filePath = path.join(home, '.claude/settings.json');
      const commands = [
        'echo user-guard # see .ai/hooks/run-hook.sh docs',
        'echo .claude/hooks/run-hook.sh',
        `echo ${home}/.repo-harness/hook-shim.sh`,
        'repo-harness hook Stop --route user',
        'repo-harness hook SessionStart --route default; echo user',
        'repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; export HOOK_REPO_ROOT="$repo"; echo repo-harness-hook exec repo-harness hook user',
      ];
      const historical = 'repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; HOOK_REPO_ROOT="$repo" bash "$repo/.ai/hooks/run-hook.sh" session-start-context.sh';
      expect(isRepoHarnessManagedHookCommand(historical)).toBe(true);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify({ theme: 'user', hooks: { SessionStart: [{ hooks: [...commands, historical].map(command => ({ type: 'command', command })) }] } }));
      expect(runInstall({ target: 'claude', location: 'global' }).exitCode).toBe(0);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(data.theme).toBe('user');
      expect(data.hooks.SessionStart[0].hooks.map((hook: any) => hook.command)).toEqual(commands);
      expect(JSON.stringify(data)).not.toContain('session-start-context.sh');
      expect(runUninstall({ target: 'claude', location: 'global' }).exitCode).toBe(0);
      expect(JSON.parse(fs.readFileSync(filePath, 'utf8')).hooks.SessionStart[0].hooks.map((hook: any) => hook.command)).toEqual(commands);
    });
  });
});

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
  test('dry-run reports owned dangling links without changing host files', () => {
    withTempHome((home) => {
      const ownedTarget = path.join(ROOT, 'assets/skill-commands/retired-symlink-test');
      expect(fs.existsSync(ownedTarget)).toBe(false);
      const foreignTarget = path.join(home, 'Waza', 'think');
      fs.symlinkSync(path.join(home, 'missing-volume'), path.dirname(foreignTarget));
      const roots = ['.codex', '.claude'].map((host) => path.join(home, host, 'skills'));
      for (const root of roots) {
        fs.mkdirSync(root, { recursive: true });
        fs.symlinkSync(ownedTarget, path.join(root, 'repo-harness-plan.bak'));
        fs.symlinkSync(foreignTarget, path.join(root, 'think'));
      }
      for (const json of [false, true]) {
        const result = spawnSync(process.execPath, [CLI, 'install', '--dry-run', ...(json ? ['--json'] : [])], {
          cwd: ROOT, encoding: 'utf-8',
          env: { ...process.env, HOME: home, CODEX_SKILLS_ROOT: '', CLAUDE_SKILLS_ROOT: '' },
        });
        expect(result.status, result.stderr).toBe(0);
        for (const root of roots) {
          const link = path.join(root, 'repo-harness-plan.bak');
          if (json) expect(JSON.parse(result.stdout).removedDanglingSkillLinks).toContain(link);
          else expect(result.stdout).toContain(`would remove dangling skill symlink: ${link}`);
          const foreignLink = path.join(root, 'think');
          if (json) expect(JSON.parse(result.stdout).removedDanglingSkillLinks).not.toContain(foreignLink);
          else expect(result.stdout).not.toContain(foreignLink);
          expect(fs.readdirSync(root).sort()).toEqual(['repo-harness-plan.bak', 'think']);
          expect(fs.readlinkSync(link)).toBe(ownedTarget);
          expect(fs.readlinkSync(path.join(root, 'think'))).toBe(foreignTarget);
        }
        expect(fs.existsSync(path.join(home, '.repo-harness'))).toBe(false);
        expect(fs.readdirSync(path.join(home, '.codex'))).toEqual(['skills']);
        expect(fs.readdirSync(path.join(home, '.claude'))).toEqual(['skills']);
      }
    });
  }, 30_000);

  test('install profiles bound host route inventory', () => {
    withTempHome((home) => {
      runInstall({ target: 'codex', location: 'global', profile: 'minimal' });
      let hooks = JSON.parse(fs.readFileSync(path.join(home, '.codex/hooks.json'), 'utf-8')).hooks;
      expect(Object.values(hooks as Record<string, unknown[]>).flat()).toHaveLength(4);
      expect(hooks.UserPromptSubmit).toHaveLength(1);
      expect(hooks.SubagentStart).toBeUndefined();

      runInstall({ target: 'codex', location: 'global', profile: 'full' as never });
      hooks = JSON.parse(fs.readFileSync(path.join(home, '.codex/hooks.json'), 'utf-8')).hooks;
      expect(Object.values(hooks as Record<string, unknown[]>).flat()).toHaveLength(6);
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

  for (const command of ['install', 'uninstall']) {
    for (const target of ['codex', 'claude', 'both']) {
      test(`CLI ${command} --target ${target} rejects local before any configuration read or write`, () => {
        withTempHome((home) => {
          const repo = path.join(home, 'project');
          fs.mkdirSync(repo);
          const files = {
            '.claude/settings.json': '{"theme":"user"}\n',
            '.codex/hooks.json': '{"hooks":{}}\n',
            '.repo-harness/install-state.json': 'invalid profile state\n',
            'project/.claude/settings.json': '{"permissions":{"allow":["user"]}}\n',
          };
          for (const [relativePath, content] of Object.entries(files)) {
            const filePath = path.join(home, relativePath);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content);
          }
          const before = fs.readdirSync(home, { recursive: true }).sort();
          const result = spawnSync(process.execPath, [CLI, command, '--target', target, '--location', 'local'], {
            cwd: repo,
            env: { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' },
            encoding: 'utf-8',
          });
          expect(result.status, result.stderr).toBe(2);
          expect(result.stderr).toContain('invalid --location "local" (expected: global)');
          expect(fs.readdirSync(home, { recursive: true }).sort()).toEqual(before);
          for (const [relativePath, content] of Object.entries(files)) {
            expect(fs.readFileSync(path.join(home, relativePath), 'utf8')).toBe(content);
          }
        });
      }, 30_000);
    }
  }

  test('codex --location global creates ~/.codex/hooks.json with 6 matcher-grouped entries', () => {
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
      expect(total).toBe(6);

      expect(entries.PostToolUse).toBeUndefined();
      // Codex has only the edit guard.
      expect((entries.PreToolUse as { matcher?: string }[]).map((e) => e.matcher)).toEqual([
        'Edit|Write',
      ]);
      // UserPromptSubmit has inbox + delegation.
      expect(entries.SessionStart.length).toBe(1);
      expect(entries.Stop.length).toBe(1);
      expect(entries.UserPromptSubmit.length).toBe(2);
      expect(entries.SubagentStart.length).toBe(1);
      expect(entries.SubagentStop).toBeUndefined();
    });
  });

  test('every adapter command requires the hook bin only in opted-in repositories', () => {
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
          expect(cmd).toContain('[ -f "$repo/.ai/harness/workflow-contract.json" ]');
          expect(cmd).toContain('exec repo-harness-hook ');
          expect(cmd).not.toContain('&& exit 0');
          expect(cmd).toContain('HOOK_HOST=codex');
          expect(cmd).not.toContain('exec repo-harness hook ');
          expect(cmd).not.toContain('command -v');
          expect(hook.timeout).toBe(30);
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

  test('claude --location global creates ~/.claude/settings.json with 5 shared hooks', () => {
    withTempHome((home) => {
      const result = runInstall({ target: 'claude', location: 'global' });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(
        fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf-8'),
      );
      const total = Object.values(data.hooks as Record<string, unknown[]>).flat().length;
      expect(total).toBe(5);
      expect(data.hooks.UserPromptSubmit.length).toBe(1);
      expect(data.hooks.SubagentStart).toBeUndefined();
      expect(data.hooks.SubagentStop).toBeUndefined();
      for (const [event, entries] of Object.entries(data.hooks) as [string, { hooks: { command: string; timeout?: number }[] }[]][]) {
        for (const entry of entries) {
          expect(entry.hooks[0].command).toContain('HOOK_HOST=claude');
          expect(entry.hooks[0].timeout).toBe(30);
        }
      }
    });
  });

  test('claude install self-heals legacy Codex-only managed entries back to 5 shared hooks', () => {
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
      expect(total).toBe(5);
      expect(data.hooks.UserPromptSubmit.length).toBe(1);
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
      expect(pre[2].hooks[0].command).toContain('repo-harness-hook PreToolUse');
      expect(pre[3].hooks[0].command).toContain('repo-harness-hook PreToolUse');
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
      expect(beforeUninstall.hooks.UserPromptSubmit.length).toBe(2);

      const uninstall = runUninstall({ target: 'claude', location: 'global' });
      expect(uninstall.exitCode).toBe(0);
      expect(uninstall.lines.some((l) => l.includes('claude managed hooks'))).toBe(true);
      const afterUninstall = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(afterUninstall.theme).toBe('dark');
      expect(afterUninstall.hooks.UserPromptSubmit).toEqual([
        { hooks: [{ type: 'command', command: 'rtk hook claude' }] },
      ]);
    });
  });

  test('install and uninstall keep private host config modes under a 0022 umask', () => {
    withTempHome((home) => {
      const claudePath = path.join(home, '.claude/settings.json');
      const codexPath = path.join(home, '.codex/hooks.json');
      const sibling = { hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'rtk hook claude' }] }] } };
      for (const filePath of [claudePath, codexPath]) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify(sibling, null, 2)}\n`, { mode: 0o600 });
        fs.chmodSync(filePath, 0o600);
      }
      const previousUmask = process.umask(0o022);
      try {
        expect(runInstall({ target: 'both', location: 'global' }).exitCode).toBe(0);
        for (const filePath of [claudePath, codexPath]) {
          expect(JSON.parse(fs.readFileSync(filePath, 'utf-8')).hooks.PreToolUse.length).toBeGreaterThan(1);
          expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
        }
        expect(runUninstall({ target: 'both', location: 'global' }).exitCode).toBe(0);
        for (const filePath of [claudePath, codexPath]) {
          expect(JSON.parse(fs.readFileSync(filePath, 'utf-8')).hooks).toEqual(sibling.hooks);
          expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
        }
      } finally {
        process.umask(previousUmask);
      }
    });
  });

  test('uninstall removes managed Codex entries and reverses installer TOML', () => {
    withTempHome((home) => {
      const result = runInstall({ target: 'codex', location: 'global' });
      expect(result.exitCode).toBe(0);
      const hooksPath = path.join(home, '.codex/hooks.json');
      const tomlPath = path.join(home, '.codex/config.toml');
      expect(fs.existsSync(hooksPath)).toBe(true);
      expect(fs.existsSync(tomlPath)).toBe(true);

      const uninstall = runUninstall({ target: 'codex', location: 'global' });
      expect(uninstall.exitCode).toBe(0);
      expect(uninstall.lines.some((l) => l.includes('codex managed hooks'))).toBe(true);


      expect(fs.existsSync(hooksPath)).toBe(false);
      expect(fs.existsSync(tomlPath)).toBe(false);
    });
  });

  test('uninstall is idempotent when no managed entries exist', () => {
    withTempHome(() => {
      runInstall({ target: 'both', location: 'global' });
      const first = runUninstall({ target: 'both', location: 'global' });
      expect(first.exitCode).toBe(0);
      expect(first.lines.some((l) => l.includes('[remove]'))).toBe(true);

      const second = runUninstall({ target: 'both', location: 'global' });
      expect(second.exitCode).toBe(0);
      expect(second.lines.some((l) => l.includes('[remove]'))).toBe(false);
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

  test('CLI global install and uninstall work for both hosts', () => {
    withTempHome((home) => {
      const install = spawnSync('bun', [CLI, 'install', '--target', 'both', '--location', 'global'], {
        cwd: ROOT,
        env: { ...process.env, HOME: home },
        encoding: 'utf-8',
      });
      expect(install.status).toBe(0);
      const claudePath = path.join(home, '.claude/settings.json');
      const codexPath = path.join(home, '.codex/hooks.json');
      expect(fs.existsSync(claudePath)).toBe(true);
      expect(fs.existsSync(codexPath)).toBe(true);

      const uninstall = spawnSync('bun', [CLI, 'uninstall', '--location', 'global'], {
        cwd: ROOT,
        env: { ...process.env, HOME: home },
        encoding: 'utf-8',
      });
      expect(uninstall.status).toBe(0);
      expect(uninstall.stdout).toContain('codex managed hooks');
      expect(uninstall.stdout).toContain('claude managed hooks');
      expect(fs.existsSync(claudePath)).toBe(false);
      expect(fs.existsSync(codexPath)).toBe(false);
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
