import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import {
  formatInitHook,
  runInitHook,
  type ToolingReport,
} from '../../src/cli/commands/init-hook';
import type { DoctorReport } from '../../src/cli/commands/doctor';
import type { StatusReport } from '../../src/cli/commands/status';

const ROOT = join(import.meta.dir, '..', '..');
const CLI = join(ROOT, 'src/cli/index.ts');

function withTempHome(fn: (home: string, repo: string) => void): void {
  const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-init-hook-'));
  const home = join(tmp, 'home');
  const repo = join(tmp, 'repo');
  try {
    mkdirSync(home, { recursive: true });
    mkdirSync(repo, { recursive: true });
    fn(home, repo);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function baseStatusReport(overrides: Partial<StatusReport['targets'][number]> = {}): StatusReport {
  return {
    cli: { version: '0.0.0-test' },
    targets: [
      {
        id: 'codex',
        displayName: 'Codex',
        location: 'global',
        installed: true,
        alreadyConfigured: true,
        configPath: '/tmp/.codex/hooks.json',
        managedEntryCount: 8,
        expectedEntryCount: 8,
        ...overrides,
      },
      {
        id: 'claude',
        displayName: 'Claude Code',
        location: 'global',
        installed: true,
        alreadyConfigured: true,
        configPath: '/tmp/.claude/settings.json',
        managedEntryCount: 8,
        expectedEntryCount: 8,
      },
    ],
    repo: {
      inGitRepo: true,
      repoRoot: '/tmp/repo',
      optIn: true,
      optInMarker: '.ai/harness/workflow-contract.json',
    },
    routes: { total: 8, byEvent: { SessionStart: 1, PreToolUse: 2, PostToolUse: 3, UserPromptSubmit: 1, Stop: 1 } },
  };
}

function baseDoctorReport(checks: DoctorReport['checks'] = []): DoctorReport {
  const summary = { ok: 0, warn: 0, fail: 0, na: 0 };
  for (const entry of checks) summary[entry.status] += 1;
  return {
    checks,
    summary,
  };
}

function baseToolingReport(tools: ToolingReport['tools'] = {}): ToolingReport {
  return {
    generated_at: '2026-06-13T00:00:00.000Z',
    repo_root: '/tmp/repo',
    hosts: ['codex'],
    check_updates: false,
    tools,
  };
}

describe('init-hook command', () => {
  test('reports missing Global Working Rules as Agent action without creating files', () => {
    withTempHome((home, repo) => {
      const report = runInitHook({
        cwd: repo,
        target: 'codex',
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });

      const globalRules = report.checks.find((entry) => entry.id === 'global-rules.codex');
      expect(globalRules?.status).toBe('needs_agent');
      expect(report.agent_actions.find((entry) => entry.id === 'global-rules.insert')).toBeDefined();
      expect(existsSync(join(home, '.codex', 'AGENTS.md'))).toBe(false);
      expect(report.status).toBe('attention');
    });
  });

  test('does not generate a Global Working Rules action when rules already exist', () => {
    withTempHome((home, repo) => {
      const filePath = join(home, '.codex', 'AGENTS.md');
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(filePath, '# Global Working Rules\n\n- Existing user rule.\n');

      const report = runInitHook({
        cwd: repo,
        target: 'codex',
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });

      const globalRules = report.checks.find((entry) => entry.id === 'global-rules.codex');
      expect(globalRules?.status).toBe('ok');
      expect(report.agent_actions.find((entry) => entry.id === 'global-rules.insert')).toBeUndefined();
      expect(readFileSync(filePath, 'utf-8')).toContain('Existing user rule.');
    });
  });

  test('reports an unreadable Global Working Rules file instead of crashing', () => {
    withTempHome((home, repo) => {
      // A directory at the expected file path makes readFileSync throw EISDIR.
      mkdirSync(join(home, '.codex', 'AGENTS.md'), { recursive: true });

      const report = runInitHook({
        cwd: repo,
        target: 'codex',
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });

      const globalRules = report.checks.find((entry) => entry.id === 'global-rules.codex');
      expect(globalRules?.status).toBe('needs_agent');
      expect(globalRules?.detail).toContain('unreadable');
      expect(report.agent_actions.find((entry) => entry.id === 'global-rules.insert')).toBeDefined();
    });
  });

  test('turns adapter count drift into an install action', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), '# Global Working Rules\n');

      const report = runInitHook({
        cwd: repo,
        target: 'codex',
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport({ managedEntryCount: 7 }),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });

      const adapter = report.checks.find((entry) => entry.id === 'status.adapter.codex');
      const action = report.agent_actions.find((entry) => entry.id === 'adapter.codex.install');
      expect(adapter?.status).toBe('needs_agent');
      expect(action?.command).toBe('repo-harness install --target codex --location global');
    });
  });

  test('turns stale CLI advisory into an Agent update action', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), '# Global Working Rules\n');

      const report = runInitHook({
        cwd: repo,
        target: 'codex',
        checkUpdates: true,
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(),
        doctorReport: baseDoctorReport([
          {
            id: 'cli-update',
            describe: 'repo-harness latest version advisory',
            status: 'warn',
            detail: 'current=0.4.2; latest=99.0.0; agent_action=bun add -g repo-harness@latest && repo-harness init',
          },
        ]),
        toolingReport: baseToolingReport(),
      });

      const action = report.agent_actions.find((entry) => entry.id === 'cli.update');
      expect(action?.command).toBe('bun add -g repo-harness@latest && repo-harness init');
      expect(action?.verification).toBe('repo-harness setup check --target codex --check-updates --json');
    });
  });

  test('turns missing and outdated tooling into Agent actions', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), '# Global Working Rules\n');

      const report = runInitHook({
        cwd: repo,
        target: 'codex',
        checkUpdates: true,
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport({
          gstack: {
            name: 'gstack',
            status: 'missing',
            reason: 'gstack is missing from all requested hosts.',
            install_command: 'install-gstack',
          },
          codegraph: {
            name: 'codegraph',
            status: 'present',
            reason: 'ready',
            update_status: 'update-available',
            upgrade_command: 'upgrade-codegraph',
          },
        }),
      });

      expect(report.checks.find((entry) => entry.id === 'tooling.gstack')?.status).toBe('needs_agent');
      expect(report.agent_actions.find((entry) => entry.id === 'tooling.gstack.repair')?.command).toBe('install-gstack');
      expect(report.agent_actions.find((entry) => entry.id === 'tooling.codegraph.update')?.command).toBe(
        'upgrade-codegraph',
      );
    });
  });

  test('keeps optional gbrain gaps out of setup dependency actions', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), '# Global Working Rules\n');

      const report = runInitHook({
        cwd: repo,
        target: 'codex',
        checkUpdates: true,
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport({
          gbrain: {
            name: 'gbrain',
            required: false,
            status: 'missing',
            reason: 'gbrain CLI is not installed.',
            update_status: 'update-available',
            install_command: 'install-gbrain',
            upgrade_command: 'upgrade-gbrain',
          },
        }),
      });

      const check = report.checks.find((entry) => entry.id === 'tooling.gbrain');
      expect(check?.status).toBe('ok');
      expect(check?.detail).toContain('optional');
      expect(report.agent_actions.find((entry) => entry.id.startsWith('tooling.gbrain.'))).toBeUndefined();
      expect(report.status).toBe('ok');
    });
  });

  test('reports runtime capabilities as separate setup checks', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), '# Global Working Rules\n');

      const report = runInitHook({
        cwd: repo,
        target: 'codex',
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(),
        doctorReport: baseDoctorReport(),
        toolingReport: {
          ...baseToolingReport(),
          runtime_capabilities: {
            bun: {
              name: 'bun',
              status: 'present',
              path: '/tmp/bin/bun',
              owner: 'repo-harness',
              required: true,
              required_for: 'repo-harness-owned global installs',
            },
            npx: {
              name: 'npx',
              status: 'missing',
              owner: 'external-skills-cli',
              required: false,
              required_for: 'external Skills CLI bootstrap',
            },
            skills_cli: {
              name: 'skills_cli',
              status: 'timed-out',
              owner: 'external-skills-cli',
              required: false,
              required_for: 'Waza/Mermaid bootstrap',
            },
          },
        },
      });

      expect(report.checks.find((entry) => entry.id === 'runtime.bun')?.status).toBe('ok');
      expect(report.checks.find((entry) => entry.id === 'runtime.bun')?.detail).toContain('owner=repo-harness');
      expect(report.checks.find((entry) => entry.id === 'runtime.npx')?.status).toBe('warn');
      expect(report.checks.find((entry) => entry.id === 'runtime.skills_cli')?.detail).toContain(
        'Waza/Mermaid bootstrap',
      );
      expect(report.agent_actions.find((entry) => entry.id === 'runtime.npx.repair')).toBeUndefined();
    });
  });

  test('formatInitHook --json returns parseable JSON', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), '# Global Working Rules\n');
      const report = runInitHook({
        cwd: repo,
        target: 'codex',
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });
      const parsed = JSON.parse(formatInitHook(report, true));
      expect(parsed.version).toBe(1);
      expect(parsed.target).toBe('codex');
    });
  });

  test('CLI exposes init-hook help', () => {
    const res = spawnSync('bun', [CLI, 'init-hook', '--help'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Usage: repo-harness init-hook');
    expect(res.stdout).toContain('--target <target>');
    expect(res.stdout).toContain('--check-updates');
  });

  test('CLI exposes setup check help', () => {
    const res = spawnSync('bun', [CLI, 'setup', 'check', '--help'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Usage: repo-harness setup check');
    expect(res.stdout).toContain('--target <target>');
    expect(res.stdout).toContain('--check-updates');
  });
});
