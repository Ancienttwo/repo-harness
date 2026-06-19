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
  process.env.HOME = tmp;
  try {
    fn(tmp);
  } finally {
    if (prev === undefined) delete process.env.HOME;
    else process.env.HOME = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe('install command (Phase 1B)', () => {
  test('codex --location local errors with exit 2 (no project-local hook concept)', () => {
    withTempHome(() => {
      const result = runInstall({ target: 'codex', location: 'local' });
      expect(result.exitCode).toBe(2);
      expect(result.lines.some((l) => l.includes('[codex]') && l.includes('not supported'))).toBe(true);
    });
  });

  test('codex --location global creates ~/.codex/hooks.json with 11 matcher-grouped entries', () => {
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
      expect(total).toBe(11);

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
      // UserPromptSubmit has default + delegation.
      expect(entries.SessionStart.length).toBe(1);
      expect(entries.Stop.length).toBe(1);
      expect(entries.UserPromptSubmit.length).toBe(2);
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
      for (const entries of Object.values(data.hooks) as { hooks: { command: string; timeout?: number }[] }[][]) {
        for (const entry of entries) {
          const hook = entry.hooks[0];
          const cmd = hook.command;
          expect(cmd).toContain('command -v repo-harness-hook');
          expect(cmd).toContain('repo-harness-hook ');
          expect(cmd).toContain('&& exit 0');
          expect(cmd).toContain('command -v repo-harness');
          expect(cmd).toContain('HOOK_HOST=codex');
          expect(cmd).toContain('exec repo-harness hook ');
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

  test('claude --location global creates ~/.claude/settings.json with 8 shared hooks', () => {
    withTempHome((home) => {
      const result = runInstall({ target: 'claude', location: 'global' });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(
        fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf-8'),
      );
      const total = Object.values(data.hooks as Record<string, unknown[]>).flat().length;
      expect(total).toBe(8);
      expect(data.hooks.UserPromptSubmit.length).toBe(1);
      expect(data.hooks.SubagentStart).toBeUndefined();
      expect(data.hooks.SubagentStop).toBeUndefined();
      for (const entries of Object.values(data.hooks) as { hooks: { command: string; timeout?: number }[] }[][]) {
        for (const entry of entries) {
          expect(entry.hooks[0].command).toContain('HOOK_HOST=claude');
          expect(entry.hooks[0].timeout).toBe(30);
        }
      }
    });
  });

  test('claude install self-heals legacy Codex-only managed entries back to 8 shared hooks', () => {
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
      expect(total).toBe(8);
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
            PreToolUse: [{ hooks: [{ type: 'command', command: 'rtk hook claude' }] }],
          },
        }, null, 2)}\n`,
      );
      runInstall({ target: 'claude', location: 'global' });
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const pre = data.hooks.PreToolUse as { hooks: { command: string }[] }[];
      // 1 sibling + 2 managed
      expect(pre.length).toBe(3);
      expect(pre[0].hooks[0].command).toBe('rtk hook claude');
      expect(pre[1].hooks[0].command).toContain('repo-harness hook PreToolUse');
      expect(pre[2].hooks[0].command).toContain('repo-harness hook PreToolUse');
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
  });

  test('CLI install without --location runs the full runtime bootstrap path', () => {
    withTempHome((home) => {
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
          env: { ...process.env, HOME: home },
          encoding: 'utf-8',
        },
      );
      expect(install.status).toBe(0);
      expect(install.stdout).toContain('[runtime] ok: install host adapters');
      expect(install.stdout).toContain('[codex] created');
      expect(fs.existsSync(path.join(home, '.codex/hooks.json'))).toBe(true);
    });
  });
});
