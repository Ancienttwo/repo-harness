import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import {
  buildSetupCheck,
  formatInitHook,
  runInitHook,
  type ToolingReport,
} from '../../src/cli/commands/init-hook';
import { runDoctor, type DoctorReport } from '../../src/cli/commands/doctor';
import type { StatusReport } from '../../src/cli/commands/status';
import { planAdoption } from '../../src/effects/adoption/plan';
import { applyAdoptionPlan } from '../../src/effects/fs-transaction';
import { readUpgradeFixture } from '../helpers/upgrade-fixtures';
import { renderGlobalRulesBlock } from '../../src/cli/installer/global-context';
import { CLI_PORTS } from '../../src/cli/index';
import { initGitRepo } from '../helpers/repo-fixture';
import { HC_MIN_VERSION } from '../../src/core/terminal/herdr-pin';

const ROOT = join(import.meta.dir, '..', '..');
const CLI = join(ROOT, 'src/cli/index.ts');

// Doctor readiness runs `hc --version`; a fake hc first on PATH keeps the developer's hc out of every test.
const fakeHcBin = mkdtempSync(join(tmpdir(), 'repo-harness-init-hook-hc-'));
const pathBeforeFakeHc = process.env.PATH;
beforeAll(() => {
  writeFileSync(join(fakeHcBin, 'hc'), `#!/bin/sh\nprintf 'hc ${HC_MIN_VERSION}\\n'\n`, { mode: 0o755 });
  process.env.PATH = `${fakeHcBin}:${pathBeforeFakeHc ?? ''}`;
});
afterAll(() => {
  process.env.PATH = pathBeforeFakeHc;
  rmSync(fakeHcBin, { recursive: true, force: true });
});

/** A managed block that matches the current template, so the rules check is ok. */
function currentRulesBlock(): string {
  return renderGlobalRulesBlock(ROOT, { preset: 'en', instruction: 'Use English to report to user.' });
}

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
        managedEntryCount: 6,
        expectedEntryCount: 6,
        ...overrides,
      },
      {
        id: 'claude',
        displayName: 'Claude Code',
        location: 'global',
        installed: true,
        alreadyConfigured: true,
        configPath: '/tmp/.claude/settings.json',
        managedEntryCount: 9,
        expectedEntryCount: 9,
      },
    ],
    repo: {
      inGitRepo: true,
      repoRoot: '/tmp/repo',
      optIn: false,
      optInMarker: '.ai/harness/workflow-contract.json',
    },
    routes: {
      total: 8,
      byEvent: {
        SessionStart: 1,
        PreToolUse: 2,
        PostToolUse: 1,
        UserPromptSubmit: 2,
        SubagentStart: 1,
        Stop: 1,
      },
    },
    installState: { recorded: false },
  };
}

function statusReportForRepo(repo: string, optIn = true): StatusReport {
  const report = baseStatusReport();
  return {
    ...report,
    repo: {
      inGitRepo: true,
      repoRoot: repo,
      optIn,
      optInMarker: '.ai/harness/workflow-contract.json',
    },
  };
}

function shellQuoted(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
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
  test('prints one leftover summary without listing or changing retired bytes', () => {
    withTempHome((home, repo) => {
      const target = join(home, '.repo-harness/hook-shim.sh');
      mkdirSync(join(home, '.repo-harness'), { recursive: true });
      const original = readUpgradeFixture('upgrade-v0.10-home', '.repo-harness/hook-shim.sh').toString('utf8');
      writeFileSync(target, original);
      const report = runInitHook(CLI_PORTS.doctor, { cwd: repo, env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(), doctorReport: baseDoctorReport(), toolingReport: baseToolingReport() });
      expect(formatInitHook(report)).toContain('1 leftovers (1 removable). Run: repo-harness upgrade');
      expect(formatInitHook(report)).not.toContain(target);
      expect(readFileSync(target, 'utf8')).toBe(original);
    });
  });
  test('leaves operator-kept project items out of the leftover count and warns on an invalid decision file', () => {
    withTempHome((home, repo) => {
      const library = '.ai/hooks/lib/workflow-state.sh';
      const decisionsFile = join(repo, '.ai/harness/upgrade-decisions.json');
      mkdirSync(join(repo, '.ai/hooks/lib'), { recursive: true });
      mkdirSync(join(repo, '.ai/harness'), { recursive: true });
      writeFileSync(join(repo, library), readUpgradeFixture('upgrade-v0.10-project', library));
      const run = (homeDir = home) => runInitHook(CLI_PORTS.doctor, { cwd: repo, env: { ...process.env, HOME: homeDir },
        statusReport: baseStatusReport(), doctorReport: baseDoctorReport(), toolingReport: baseToolingReport() });
      expect(run().leftovers).toEqual({ total: 1, removable: 0 });

      const contentHash = `sha256:${new Bun.CryptoHasher('sha256').update(readFileSync(join(repo, library))).digest('hex')}`;
      writeFileSync(decisionsFile, JSON.stringify({ version: 1, decisions: [{ path: library, decision: 'keep', contentHash }] }));
      const kept = run();
      expect(kept.leftovers).toEqual({ total: 0, removable: 0 });
      expect(kept.checks.some((check) => check.id === 'legacy.upgrade-decisions')).toBe(false);

      writeFileSync(decisionsFile, '{ not json');
      const invalid = run();
      expect(invalid.checks.find((check) => check.id === 'legacy.upgrade-decisions')?.status).toBe('warn');
      expect(invalid.leftovers).toEqual({ total: 1, removable: 0 });
    });
  });
  test('flags a project host config only when it holds a repo-harness command', () => {
    withTempHome((home, repo) => {
      initGitRepo(repo);
      const run = (homeDir = home) => runInitHook(CLI_PORTS.doctor, { cwd: repo, env: { ...process.env, HOME: homeDir },
        statusReport: baseStatusReport(), doctorReport: baseDoctorReport(), toolingReport: baseToolingReport() });
      const claude = join(repo, '.claude/settings.json');
      const codex = join(repo, '.codex/hooks.json');
      mkdirSync(join(repo, '.claude'), { recursive: true });
      mkdirSync(join(repo, '.codex'), { recursive: true });
      writeFileSync(claude, JSON.stringify({ permissions: { allow: ['Bash(git status:*)'] } }));
      writeFileSync(codex, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo user' }] }] } }));
      let report = run();
      expect(report.checks.find((entry) => entry.id === 'legacy.project-claude-settings')?.status).toBe('ok');
      expect(report.checks.find((entry) => entry.id === 'legacy.project-codex-hooks')?.status).toBe('ok');
      expect(report.agent_actions.find((entry) => entry.id === 'legacy.project-adapters.review')).toBeUndefined();

      writeFileSync(codex, JSON.stringify({ hooks: { Stop: [{ hooks: [
        { type: 'command', command: 'echo user' },
        { type: 'command', command: 'repo-harness hook Stop --route default' },
      ] }] } }));
      writeFileSync(claude, '{ broken');
      report = run();
      expect(report.checks.find((entry) => entry.id === 'legacy.project-codex-hooks')?.status).toBe('needs_agent');
      expect(report.checks.find((entry) => entry.id === 'legacy.project-claude-settings')?.detail).toContain('cannot inspect');
      expect(report.agent_actions.find((entry) => entry.id === 'legacy.project-adapters.review')?.targets).toEqual([claude, codex]);
      expect(readFileSync(claude, 'utf8')).toBe('{ broken');

      // Issue 1650: outside a repository (cwd = $HOME) the same files are the user-level adapters.
      rmSync(join(repo, '.git'), { recursive: true, force: true });
      report = run();
      for (const id of ['legacy.project-claude-settings', 'legacy.project-codex-hooks']) {
        expect(report.checks.find((entry) => entry.id === id)).toMatchObject({ status: 'na', detail: `cwd is not in a git repository: ${repo}` });
      }
      expect(report.agent_actions.find((entry) => entry.id === 'legacy.project-adapters.review')).toBeUndefined();

      // A repository rooted at HOME holds the user-level adapters, which migrate refuses.
      initGitRepo(repo);
      report = run(repo);
      expect(report.checks.find((entry) => entry.id === 'legacy.project-codex-hooks')).toMatchObject({ status: 'na', detail: `user-level adapter, not a project adapter: ${codex}` });
      expect(report.agent_actions.find((entry) => entry.id === 'legacy.project-adapters.review')).toBeUndefined();

      // A dotfiles layout: HOME links one adapter into the repository, so migrate refuses the legacy codex file too.
      mkdirSync(join(home, '.claude'), { recursive: true });
      symlinkSync(claude, join(home, '.claude', 'settings.json'));
      report = run();
      expect(report.checks.find((entry) => entry.id === 'legacy.project-claude-settings')?.status).toBe('na');
      const review = report.agent_actions.find((entry) => entry.id === 'legacy.project-adapters.review');
      expect(review).toMatchObject({ targets: [codex], reason: expect.stringContaining('review the targets manually') });
      expect(review?.command).toBeUndefined();
    });
  });

  test('reports missing Global Working Rules as Agent action without creating files', () => {
    withTempHome((home, repo) => {
      const report = runInitHook(CLI_PORTS.doctor, {
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

      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: repo,
        target: 'codex',
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });

      const globalRules = report.checks.find((entry) => entry.id === 'global-rules.codex');
      expect(globalRules?.status).toBe('warn');
      expect(globalRules?.detail).toContain('repo-harness update --report-language <follow|zh-CN|en>');
      expect(report.agent_actions.find((entry) => entry.id === 'global-rules.insert')).toBeUndefined();
      expect(readFileSync(filePath, 'utf-8')).toContain('Existing user rule.');
    });
  });

  test('reports a current CRLF managed block as ok', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), `notes\r\n\r\n${currentRulesBlock().replace(/\n/g, '\r\n')}`);
      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: repo,
        target: 'codex',
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });
      expect(report.checks.find((entry) => entry.id === 'global-rules.codex')?.status).toBe('ok');
    });
  });

  test('reports a symlinked instruction file as a warning', () => {
    withTempHome((home, repo) => {
      const target = join(home, 'dotfiles-AGENTS.md');
      writeFileSync(target, currentRulesBlock());
      mkdirSync(join(home, '.codex'), { recursive: true });
      symlinkSync(target, join(home, '.codex', 'AGENTS.md'));
      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: repo,
        target: 'codex',
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });
      const check = report.checks.find((entry) => entry.id === 'global-rules.codex');
      expect(check?.status).toBe('warn');
      const link = join(home, '.codex', 'AGENTS.md');
      expect(check?.detail).toBe(
        `${link} is a symlink or not a regular file (refusing symlink configuration path: ${link}); replace it with a regular file to enable managed sync`,
      );
    });
  });

  test('compares the managed block with the current template and reports each state', () => {
    const block = currentRulesBlock();
    const unrecorded = block.replace(/^<!-- repo-harness reporting-language: .*\n/m, '');
    const cases: Array<{ name: string; content: string; status: 'ok' | 'warn' | 'fail'; detail: string }> = [
      { name: 'current', content: `user notes\n\n${block}`, status: 'ok', detail: 'matches the current template' },
      { name: 'stale', content: block.replace('Rule 0:', 'Old rule 0:'), status: 'warn', detail: 'stale' },
      {
        name: 'legacy span beside a recorded block',
        content: `${block}\n## Reporting\n\n- Old copy.\n`,
        status: 'warn',
        detail: 'legacy repo-harness sections outside the markers',
      },
      { name: 'unrecorded', content: unrecorded, status: 'warn', detail: '--report-language <follow|zh-CN|en>' },
      {
        name: 'invalid header',
        content: block.replace('"preset":"en"', '"preset":"zh-CN"'),
        status: 'warn',
        detail: 'no recorded reporting language',
      },
      { name: 'unbalanced', content: `${block}${block}`, status: 'fail', detail: 'unbalanced repo-harness markers' },
    ];
    for (const entry of cases) {
      withTempHome((home, repo) => {
        mkdirSync(join(home, '.codex'), { recursive: true });
        writeFileSync(join(home, '.codex', 'AGENTS.md'), entry.content);
        const report = runInitHook(CLI_PORTS.doctor, {
          cwd: repo,
          target: 'codex',
          env: { ...process.env, HOME: home },
          statusReport: baseStatusReport(),
          doctorReport: baseDoctorReport(),
          toolingReport: baseToolingReport(),
        });
        const check = report.checks.find((item) => item.id === 'global-rules.codex');
        expect({ name: entry.name, status: check?.status }).toEqual({ name: entry.name, status: entry.status });
        expect(check?.detail).toContain(entry.detail);
        expect(report.agent_actions.find((item) => item.id === 'global-rules.insert')).toBeUndefined();
        expect(readFileSync(join(home, '.codex', 'AGENTS.md'), 'utf-8')).toBe(entry.content);
      });
    }
  });

  test('reports an unreadable Global Working Rules file instead of crashing', () => {
    withTempHome((home, repo) => {
      // A directory at the expected file path makes readFileSync throw EISDIR.
      mkdirSync(join(home, '.codex', 'AGENTS.md'), { recursive: true });

      const report = runInitHook(CLI_PORTS.doctor, {
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
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());

      const report = runInitHook(CLI_PORTS.doctor, {
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

  test('accepts a complete expected adapter count', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());

      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: repo,
        target: 'codex',
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport({
          managedEntryCount: 8,
          expectedEntryCount: 8,
        }),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });

      const adapter = report.checks.find((entry) => entry.id === 'status.adapter.codex');
      const action = report.agent_actions.find((entry) => entry.id === 'adapter.codex.install');
      expect(adapter?.status).toBe('ok');
      expect(adapter?.detail).toContain('8/8 managed entries');
      expect(action).toBeUndefined();
    });
  });

  test('turns same-count exact projection drift into an install action', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());

      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: repo,
        target: 'codex',
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport({
          projection: {
            status: 'drift',
            expectedEntryCount: 6,
            managedEntryCount: 6,
            mismatches: [{
              kind: 'field-mismatch',
              event: 'Stop',
              routeId: 'default',
              field: 'timeout',
              expected: 30,
              actual: 150,
            }],
          },
        }),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });

      const adapter = report.checks.find((entry) => entry.id === 'status.adapter.codex');
      const action = report.agent_actions.find((entry) => entry.id === 'adapter.codex.install');
      expect(adapter?.status).toBe('needs_agent');
      expect(adapter?.detail).toContain('Stop.default timeout expected=30 actual=150');
      expect(action?.command).toBe('repo-harness install --target codex --location global');
    });
  });

  test('an unreadable or retired install state requires manual repair without an inapplicable command', () => {
    const rows = [
      { code: 'install_state_invalid', error: 'install state is not valid JSON' },
      {
        code: 'install_state_protocol_retired',
        error: 'install state is protocol 2, which this package no longer reads. Migrate it with the 0.25.4 bridge first: '
          + 'bun add -g repo-harness@0.25.4 --no-cache && repo-harness update --version 0.25.4',
      },
    ] as const;
    for (const row of rows) withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());
      const statusReport = baseStatusReport();
      statusReport.installState = {
        recorded: 'invalid',
        code: row.code,
        error: row.error,
        path: join(home, '.repo-harness', 'install-state.json'),
      };

      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: repo,
        target: 'codex',
        env: { ...process.env, HOME: home },
        statusReport,
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });

      const adapter = report.checks.find((entry) => entry.id === 'status.adapter.codex');
      expect(adapter?.status, row.code).toBe('needs_agent');
      expect(adapter?.detail, row.code).toContain(row.error);
      const repair = report.agent_actions.find((entry) => entry.id === 'install-state.repair');
      expect(repair?.reason, row.code).toBe(`Install state cannot be read (${row.code}): ${row.error}`);
      expect(repair?.command, row.code).toBeUndefined();
      expect(repair?.targets).toEqual([join(home, '.repo-harness', 'install-state.json')]);
      expect(report.agent_actions.find((entry) => entry.id === 'install-state.migrate')).toBeUndefined();
      expect(report.agent_actions.find((entry) => entry.id === 'adapter.codex.install')).toBeUndefined();
    });
  });

  test('turns stale CLI advisory into an Agent update action', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());

      const report = runInitHook(CLI_PORTS.doctor, {
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
            detail: 'current=0.4.2; latest=99.0.0; agent_action=repo-harness update --target codex',
          },
        ]),
        toolingReport: baseToolingReport(),
      });

      const action = report.agent_actions.find((entry) => entry.id === 'cli.update');
      expect(action?.command).toBe('repo-harness update --target codex');
      expect(action?.verification).toBe('repo-harness setup check --target codex --check-updates --json');
    });
  });

  test('scopes the Codex CLI version doctor check to targets that include Codex', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());
      writeFileSync(join(home, '.claude', 'CLAUDE.md'), currentRulesBlock());
      const doctorReport = baseDoctorReport([
        {
          id: 'codex-cli-version',
          describe: 'Codex CLI supports generated GPT-5.6 agent profiles',
          status: 'warn',
          detail: 'current=0.143.0; minimum=0.144.0',
        },
      ]);

      for (const target of ['claude', 'codex', 'both'] as const) {
        const report = runInitHook(CLI_PORTS.doctor, {
          cwd: repo,
          target,
          env: { ...process.env, HOME: home },
          statusReport: baseStatusReport(),
          doctorReport,
          toolingReport: baseToolingReport(),
        });
        const check = report.checks.find((entry) => entry.id === 'doctor.codex-cli-version');

        if (target === 'claude') {
          expect(check).toBeUndefined();
          expect(report.summary.warn).toBe(0);
          expect(report.status).toBe('ok');
        } else {
          expect(check?.status).toBe('warn');
          expect(report.summary.warn).toBe(1);
          expect(report.status).toBe('attention');
        }
      }
    });
  });

  test('the update check fails when this runtime cannot serve the repository model', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());
      spawnSync('git', ['init', '-q'], { cwd: repo });
      mkdirSync(join(repo, '.ai', 'harness'), { recursive: true });
      writeFileSync(join(repo, '.ai', 'harness', 'workflow-contract.json'), `${JSON.stringify({ minimum_harness_version: '999.0.0' })}\n`);
      // The real doctor check, projected through the update check.
      const registry = runDoctor(CLI_PORTS.doctor, repo, 'codex').checks.find((entry) => entry.id === 'capability-registry')!;

      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: repo,
        target: 'codex',
        checkUpdates: true,
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(),
        doctorReport: baseDoctorReport([registry]),
        toolingReport: baseToolingReport(),
      });

      const check = report.checks.find((entry) => entry.id === 'doctor.capability-registry');
      expect(check?.status).toBe('fail');
      expect(check?.detail).toContain('This repository needs repo-harness >= 999.0.0;');
      expect(report.summary.fail).toBeGreaterThanOrEqual(1);
    });
  });

  test('keeps repo adoption refresh check disabled unless update checks are requested', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());

      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: repo,
        target: 'codex',
        env: { ...process.env, HOME: home },
        statusReport: statusReportForRepo(repo),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });

      const check = report.checks.find((entry) => entry.id === 'repo.init-refresh');
      expect(check?.status).toBe('na');
      expect(check?.detail).toContain('disabled');
      expect(report.agent_actions.find((entry) => entry.id === 'repo.init-refresh')).toBeUndefined();
    });
  });

  test('turns pending adoption plan operations into an Agent refresh action', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      mkdirSync(join(repo, '.ai', 'harness'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());
      writeFileSync(join(repo, '.ai', 'harness', 'workflow-contract.json'), '{}\n');
      expect(spawnSync('git', ['init', '-q'], { cwd: repo }).status).toBe(0);

      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: repo,
        target: 'codex',
        checkUpdates: true,
        env: { ...process.env, HOME: home },
        statusReport: statusReportForRepo(repo),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });

      const check = report.checks.find((entry) => entry.id === 'repo.init-refresh');
      const action = report.agent_actions.find((entry) => entry.id === 'repo.init-refresh');
      expect(check?.status).toBe('needs_agent');
      expect(check?.detail).toContain('planned=');
      expect(action?.command).toBe(`repo-harness init --repo ${shellQuoted(repo)}`);
      expect(action?.verification).toBe('repo-harness setup check --target codex --check-updates --json');
      expect(existsSync(join(repo, 'docs', 'spec.md'))).toBe(false);
    });
  });

  test('turns an unresolved review base into an Agent action without a refresh command', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(repo, '.ai', 'harness'), { recursive: true });
      writeFileSync(join(repo, '.ai', 'harness', 'workflow-contract.json'), '{}\n');
      for (const args of [['init', '-q'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'base'], ['checkout', '-q', '--detach']]) {
        expect(spawnSync('git', args, { cwd: repo }).status).toBe(0);
      }

      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: repo,
        target: 'codex',
        checkUpdates: true,
        env: { ...process.env, HOME: home },
        statusReport: statusReportForRepo(repo),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });

      const check = report.checks.find((entry) => entry.id === 'repo.init-refresh');
      expect(check?.status).toBe('needs_agent');
      expect(check?.detail).toContain('worktree_strategy.review_base');
      const action = report.agent_actions.find((entry) => entry.id === 'repo.init-refresh');
      expect(action?.reason).toContain('worktree_strategy.review_base');
      expect(action?.command).toBeUndefined();
    });
  });

  test('reports adopted repo refresh as ok when the adoption dry-run is a no-op', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());
      expect(spawnSync('git', ['init', '-q'], { cwd: repo }).status).toBe(0);
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: 'standard', apply: false }));
      expect(apply.ok).toBe(true);

      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: repo,
        target: 'codex',
        checkUpdates: true,
        env: { ...process.env, HOME: home },
        statusReport: statusReportForRepo(repo),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });

      const check = report.checks.find((entry) => entry.id === 'repo.init-refresh');
      expect(check?.status).toBe('ok');
      expect(check?.detail).toContain('up-to-date');
      expect(report.agent_actions.find((entry) => entry.id === 'repo.init-refresh')).toBeUndefined();
    });
  });

  test('does not recommend downstream init refresh for the repo-harness source checkout', () => {
    withTempHome((home) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());

      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: ROOT,
        sourceRoot: join(home, '.bun', 'install', 'global', 'node_modules', 'repo-harness'),
        target: 'codex',
        checkUpdates: true,
        env: { ...process.env, HOME: home },
        statusReport: statusReportForRepo(ROOT),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });

      const check = report.checks.find((entry) => entry.id === 'repo.init-refresh');
      expect(check?.status).toBe('na');
      expect(check?.detail).toContain('self-host source checkout');
      expect(report.agent_actions.find((entry) => entry.id === 'repo.init-refresh')).toBeUndefined();
    });
  });

  test('does not ask Agents to refresh adoption for non-adopted repos', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());

      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: repo,
        target: 'codex',
        checkUpdates: true,
        env: { ...process.env, HOME: home },
        statusReport: statusReportForRepo(repo, false),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport(),
      });

      const check = report.checks.find((entry) => entry.id === 'repo.init-refresh');
      expect(check?.status).toBe('na');
      expect(check?.detail).toContain('not repo-harness adopted');
      expect(report.agent_actions.find((entry) => entry.id === 'repo.init-refresh')).toBeUndefined();
    });
  });

  test('turns missing and outdated tooling into Agent actions', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());

      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: repo,
        target: 'codex',
        checkUpdates: true,
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport({
          planner: {
            name: 'planner',
            status: 'missing',
            reason: 'planner is missing from all requested hosts.',
            install_command: 'install-planner',
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

      expect(report.checks.find((entry) => entry.id === 'tooling.planner')?.status).toBe('needs_agent');
      expect(report.agent_actions.find((entry) => entry.id === 'tooling.planner.repair')?.command).toBe('install-planner');
      expect(report.agent_actions.find((entry) => entry.id === 'tooling.codegraph.update')?.command).toBe(
        'upgrade-codegraph',
      );
    });
  });

  test('keeps optional tooling gaps out of setup dependency actions', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());

      const report = runInitHook(CLI_PORTS.doctor, {
        cwd: repo,
        target: 'codex',
        checkUpdates: true,
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport(),
        doctorReport: baseDoctorReport(),
        toolingReport: baseToolingReport({
          advisory_tool: {
            name: 'advisory_tool',
            required: false,
            status: 'missing',
            reason: 'Optional advisory tool is not installed.',
            update_status: 'update-available',
            install_command: 'install-advisory-tool',
            upgrade_command: 'upgrade-advisory-tool',
          },
        }),
      });

      const check = report.checks.find((entry) => entry.id === 'tooling.advisory_tool');
      expect(check?.status).toBe('ok');
      expect(check?.detail).toContain('optional');
      expect(report.agent_actions.find((entry) => entry.id.startsWith('tooling.advisory_tool.'))).toBeUndefined();
      expect(report.status).toBe('ok');
    });
  });

  test('reports runtime capabilities as separate setup checks', () => {
    withTempHome((home, repo) => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());

      const report = runInitHook(CLI_PORTS.doctor, {
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
      writeFileSync(join(home, '.codex', 'AGENTS.md'), currentRulesBlock());
      const report = runInitHook(CLI_PORTS.doctor, {
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
  }, 30_000);

  test('CLI exposes setup check help', () => {
    const res = spawnSync('bun', [CLI, 'setup', 'check', '--help'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Usage: repo-harness setup check');
    expect(res.stdout).toContain('--target <target>');
    expect(res.stdout).toContain('--check-updates');
  }, 30_000);
});

describe('setup check builder', () => {
  test('links each check to the action it generated and keeps the report unchanged', () => {
    withTempHome((home, repo) => {
      const options = {
        cwd: repo,
        target: 'both' as const,
        env: { ...process.env, HOME: home },
        statusReport: baseStatusReport({ managedEntryCount: 11 }),
        doctorReport: baseDoctorReport([
          { id: 'codegraph-index', describe: 'CodeGraph project index', status: 'warn', detail: 'index=stale; remediation=bash scripts/ensure-codegraph.sh --sync' },
        ]),
        toolingReport: baseToolingReport({
          agent_fleet: { name: 'agent_fleet', status: 'missing', reason: 'none', install_command: 'repo-harness run install-agent-fleet' },
        }),
      };
      const build = buildSetupCheck(CLI_PORTS.doctor, options);
      expect(JSON.stringify(build.report)).toBe(JSON.stringify(runInitHook(CLI_PORTS.doctor, options)));
      const commandFor = (checkId: string) => build.check_actions.get(checkId)?.command;
      expect(build.check_actions.get('status.adapter.codex')?.id).toBe('adapter.codex.install');
      expect(commandFor('status.adapter.codex')).toBe('repo-harness install --target codex --location global');
      expect(build.check_actions.has('status.adapter.claude')).toBe(false);
      expect(commandFor('doctor.codegraph-index')).toBe('bash scripts/ensure-codegraph.sh --sync');
      expect(commandFor('tooling.agent_fleet')).toBe('repo-harness run install-agent-fleet');
      expect(build.check_actions.get('global-rules.codex')?.id).toBe('global-rules.insert');
      expect(build.check_actions.get('global-rules.claude')?.id).toBe('global-rules.insert');
      for (const [checkId, action] of build.check_actions) {
        expect(build.report.checks.some(check => check.id === checkId)).toBe(true);
        expect(build.report.agent_actions).toContain(action);
      }
    });
  });
});
