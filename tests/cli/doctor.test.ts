import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, spawnSync } from 'child_process';
import {
  clearRegisteredChecks,
  formatDoctor,
  registerCheck,
  runDoctor,
} from '../../src/cli/commands/doctor';
import { ROUTES } from '../../src/cli/hook/route-registry';

const DOCTOR_CHECK_TIMEOUT_MS = 15000;

function withTempHome(fn: (home: string) => void): void {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-doctor-')));
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

function withEnv(values: Record<string, string | undefined>, fn: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function writeExecutable(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o755);
}

function withTempRepo(
  opts: { optIn: boolean; scripts?: readonly string[]; pinRepoHooks?: boolean },
  fn: (repoRoot: string) => void,
): void {
  const repoRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-doctor-repo-')));
  try {
    execSync('git init', { cwd: repoRoot, stdio: 'ignore' });
    fs.mkdirSync(path.join(repoRoot, '.ai/hooks'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, '.ai/harness'), { recursive: true });
    if (opts.optIn) {
      fs.writeFileSync(path.join(repoRoot, '.ai/harness/workflow-contract.json'), '{}\n');
    }
    if (opts.pinRepoHooks) {
      fs.writeFileSync(path.join(repoRoot, '.ai/harness/policy.json'), '{ "hook_source": "repo" }\n');
    }
    for (const script of opts.scripts ?? []) {
      writeExecutable(path.join(repoRoot, '.ai/hooks', script), '#!/bin/bash\nexit 0\n');
    }
    fn(repoRoot);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
}

function setupFakeEnvironment(prefix: string) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`)));
  const home = path.join(root, 'home');
  const fakeBin = path.join(root, 'fakebin');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  return { root, home, fakeBin };
}

function writeFakeCodeGraph(fakeBin: string, logFile: string): void {
  writeExecutable(
    path.join(fakeBin, 'codegraph'),
    [
      '#!/bin/bash',
      'set -euo pipefail',
      `echo "codegraph $*" >> "${logFile}"`,
      'case "${1:-}" in',
      '  "--version") echo "0.9.6" ;;',
      '  "status") echo "CodeGraph Status"; echo "Index is up to date" ;;',
      '  "init"|"sync"|"install") echo "unexpected mutation" >&2; exit 2 ;;',
      '  *) exit 1 ;;',
      'esac',
      '',
    ].join('\n'),
  );
}

function writeFakeGbrain(fakeBin: string): void {
  writeExecutable(
    path.join(fakeBin, 'gbrain'),
    [
      '#!/bin/bash',
      'set -euo pipefail',
      'case "$1 ${2:-}" in',
      '  "--version ") echo "gbrain 0.12.0" ;;',
      '  "doctor --json") echo "{\\"status\\":\\"warnings\\",\\"health_score\\":90}" ;;',
      '  "integrations list") echo "{\\"local\\":[]}" ;;',
      '  *) exit 1 ;;',
      'esac',
      '',
    ].join('\n'),
  );
}

function writeFakeNpx(fakeBin: string): void {
  writeExecutable(
    path.join(fakeBin, 'npx'),
    [
      '#!/bin/bash',
      'set -euo pipefail',
      'if [[ "$*" == *"skills ls -g --json"* ]]; then echo "[]"; exit 0; fi',
      'exit 1',
      '',
    ].join('\n'),
  );
}

afterEach(() => {
  clearRegisteredChecks();
});

describe('doctor command (Phase 1C)', () => {
  test('runDoctor emits the built-in checks (path/version/hosts/trust)', () => {
    withTempHome(() => {
      const r = runDoctor();
      const ids = r.checks.map((c) => c.id);
      expect(ids).toContain('cli-on-path');
      expect(ids).toContain('cli-version');
      expect(ids).toContain('cli-update');
      expect(ids).toContain('codex-adapter');
      expect(ids).toContain('claude-adapter');
      expect(ids).toContain('codex-trust-state');
      expect(ids).toContain('codegraph-readiness');
      expect(ids).toContain('codex-codegraph-mcp');
      expect(ids).toContain('claude-codegraph-mcp');
      expect(ids).toContain('codegraph-index');
      expect(ids).toContain('security-config');
      expect(ids).toContain('repo-hook-scripts');
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('cli-on-path resolves repo-harness from PATH without requiring Unix which', () => {
    withTempHome(() => {
      const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-doctor-path-')));
      try {
        const fakeBin = path.join(tmp, 'bin');
        fs.mkdirSync(fakeBin, { recursive: true });
        const fakeCli = path.join(fakeBin, 'repo-harness');
        writeExecutable(fakeCli, '#!/bin/bash\nexit 0\n');

        withEnv({ PATH: fakeBin }, () => {
          const r = runDoctor(tmp);
          const pathCheck = r.checks.find((c) => c.id === 'cli-on-path')!;
          expect(pathCheck.status).toBe('ok');
          expect(pathCheck.detail).toBe(fakeCli);
        });
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('repo-hook-scripts reports n/a for non-opt-in repos', () => {
    withTempRepo({ optIn: false }, (repoRoot) => {
      const r = runDoctor(repoRoot);
      const hooks = r.checks.find((c) => c.id === 'repo-hook-scripts')!;
      expect(hooks.status).toBe('na');
      expect(hooks.detail).toContain('not opted in');
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('repo-hook-scripts warns when pinned repo route scripts are missing', () => {
    withTempRepo({ optIn: true, pinRepoHooks: true }, (repoRoot) => {
      const r = runDoctor(repoRoot);
      const hooks = r.checks.find((c) => c.id === 'repo-hook-scripts')!;
      expect(hooks.status).toBe('warn');
      expect(hooks.detail).toContain('source=repo-pin');
      expect(hooks.detail).toContain('security-sentinel.sh');
      expect(hooks.detail).toContain(`repo-harness adopt --repo ${repoRoot}`);
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('repo-hook-scripts passes when all pinned route scripts are present', () => {
    const scripts = [...new Set(ROUTES.flatMap((route) => [...route.scripts]))];
    withTempRepo({ optIn: true, scripts, pinRepoHooks: true }, (repoRoot) => {
      const r = runDoctor(repoRoot);
      const hooks = r.checks.find((c) => c.id === 'repo-hook-scripts')!;
      expect(hooks.status).toBe('ok');
      expect(hooks.detail).toContain('route scripts present');
      expect(hooks.detail).toContain('source=repo-pin');
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('repo-hook-scripts resolves the packaged runtime when the repo is not pinned', () => {
    withTempRepo({ optIn: true }, (repoRoot) => {
      const r = runDoctor(repoRoot);
      const hooks = r.checks.find((c) => c.id === 'repo-hook-scripts')!;
      expect(hooks.status).toBe('ok');
      expect(hooks.detail).toContain('source=packaged');
      expect(hooks.detail).toContain(path.join('assets', 'hooks'));
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('codex-trust-state reports n/a when ~/.codex/config.toml is missing', () => {
    withTempHome(() => {
      const r = runDoctor();
      const trust = r.checks.find((c) => c.id === 'codex-trust-state')!;
      expect(trust.status).toBe('na');
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('cli-update is agent-triggered and does not check npm by default', () => {
    withTempHome(() => {
      withEnv({ REPO_HARNESS_CHECK_UPDATES: undefined, REPO_HARNESS_LATEST_VERSION: undefined }, () => {
        const r = runDoctor();
        const update = r.checks.find((c) => c.id === 'cli-update')!;
        expect(update.status).toBe('na');
        expect(update.detail).toContain('Agent can run REPO_HARNESS_CHECK_UPDATES=1 repo-harness doctor --json');
      });
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('cli-update warns with an Agent action when the package is stale', () => {
    withTempHome(() => {
      withEnv({ REPO_HARNESS_CHECK_UPDATES: '1', REPO_HARNESS_LATEST_VERSION: '99.0.0' }, () => {
        const r = runDoctor();
        const update = r.checks.find((c) => c.id === 'cli-update')!;
        expect(update.status).toBe('warn');
        expect(update.detail).toContain('current=');
        expect(update.detail).toContain('latest=99.0.0');
        expect(update.detail).toContain('agent_action=bun add -g repo-harness@latest && repo-harness init');
      });
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('codex-trust-state counts user-level [hooks.state] lines when present', () => {
    withTempHome((home) => {
      const configPath = path.join(home, '.codex/config.toml');
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      const content = `[features]\nhooks = true\n\n[hooks.state."${home}/.codex/hooks.json:pre_tool_use:0:0"]\ntrusted_hash = "sha256:a"\n\n[hooks.state."${home}/.codex/hooks.json:post_tool_use:0:0"]\ntrusted_hash = "sha256:b"\n\n[hooks.state."${home}/.codex/hooks.json:session_start:0:0"]\ntrusted_hash = "sha256:c"\n`;
      fs.writeFileSync(configPath, content);
      const r = runDoctor();
      const trust = r.checks.find((c) => c.id === 'codex-trust-state')!;
      expect(trust.status).toBe('ok');
      expect(trust.detail).toContain('3');
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('registerCheck still supports additional plugin entries', () => {
    withTempHome(() => {
      registerCheck({
        id: 'codegraph-test',
        describe: 'placeholder for Phase 2 wiring',
        run: () => ({ status: 'ok', detail: 'plugin reachable' }),
      });
      const r = runDoctor();
      const plugin = r.checks.find((c) => c.id === 'codegraph-test');
      expect(plugin).toBeDefined();
      expect(plugin!.status).toBe('ok');
      expect(plugin!.detail).toBe('plugin reachable');
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('summary tallies each status correctly', () => {
    withTempHome(() => {
      registerCheck({ id: 'ok-a', describe: '', run: () => ({ status: 'ok', detail: '' }) });
      registerCheck({ id: 'fail-b', describe: '', run: () => ({ status: 'fail', detail: '' }) });
      registerCheck({ id: 'na-c', describe: '', run: () => ({ status: 'na', detail: '' }) });
      const r = runDoctor();
      const totalReported =
        r.summary.ok + r.summary.warn + r.summary.fail + r.summary.na;
      expect(totalReported).toBe(r.checks.length);
      expect(r.summary.fail).toBeGreaterThanOrEqual(1);
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('formatDoctor includes a Summary line', () => {
    withTempHome(() => {
      const text = formatDoctor(runDoctor(), false);
      expect(text).toContain('Summary:');
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('formatDoctor --json produces parseable JSON', () => {
    withTempHome(() => {
      const json = formatDoctor(runDoctor(), true);
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed.checks)).toBe(true);
      expect(parsed.summary).toBeDefined();
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('security-config reports fail when hook JSON is invalid', () => {
    withTempHome((home) => {
      const hooksPath = path.join(home, '.codex/hooks.json');
      fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
      fs.writeFileSync(hooksPath, '{ not json');
      const r = runDoctor();
      const security = r.checks.find((c) => c.id === 'security-config')!;
      expect(security.status).toBe('fail');
      expect(security.detail).toContain('invalid-json');
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('security-config treats reviewed user-level warning as ok', () => {
    withTempHome((home) => {
      const settingsPath = path.join(home, '.claude/settings.json');
      const configPath = path.join(home, '.repo-harness/config.json');
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          hooks: {
            SessionStart: [{ hooks: [{ type: 'command', command: 'echo hello' }] }],
          },
        }, null, 2),
      );
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          security: {
            reviewed_findings: [
              {
                filePath: '~/.claude/settings.json',
                ruleId: 'unmanaged-hook-command',
                command: 'echo hello',
                reason: 'Reviewed local test hook',
              },
            ],
          },
        }, null, 2),
      );

      const r = runDoctor();
      const security = r.checks.find((c) => c.id === 'security-config')!;
      expect(security.status).toBe('ok');
      expect(security.detail).toContain('no active findings');
      expect(security.detail).toContain('1 reviewed exception');
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('CLI doctor includes CodeGraph readiness without mutating CodeGraph state', () => {
    const envRoot = setupFakeEnvironment('repo-harness-doctor-codegraph');
    const logFile = path.join(envRoot.root, 'tool.log');
    try {
      fs.mkdirSync(path.join(envRoot.home, '.codex'), { recursive: true });
      fs.mkdirSync(envRoot.home, { recursive: true });
      fs.writeFileSync(
        path.join(envRoot.home, '.codex', 'config.toml'),
        '[mcp_servers.codegraph]\ncommand = "codegraph"\n',
      );
      fs.writeFileSync(
        path.join(envRoot.home, '.claude.json'),
        JSON.stringify({ mcpServers: { codegraph: { type: 'stdio', command: 'codegraph', args: ['serve', '--mcp'] } } }),
      );
      writeFakeCodeGraph(envRoot.fakeBin, logFile);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeNpx(envRoot.fakeBin);

      const root = path.join(import.meta.dir, '..', '..');
      const res = spawnSync('bun', [path.join(root, 'src/cli/index.ts'), 'doctor', '--json'], {
        cwd: root,
        encoding: 'utf-8',
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ''}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: '0',
        },
      });

      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      const codegraph = report.checks.find((entry: { id: string }) => entry.id === 'codegraph-readiness');
      expect(codegraph).toBeDefined();
      expect(codegraph.status).toBe('warn');
      expect(codegraph.detail).toContain('source=global');
      expect(codegraph.detail).toContain('claude-mcp=deferred');
      expect(codegraph.detail).toContain('remediation=bun install');
      const codexMcp = report.checks.find((entry: { id: string }) => entry.id === 'codex-codegraph-mcp');
      const claudeMcp = report.checks.find((entry: { id: string }) => entry.id === 'claude-codegraph-mcp');
      const index = report.checks.find((entry: { id: string }) => entry.id === 'codegraph-index');
      expect(codexMcp.status).toBe('ok');
      expect(claudeMcp.status).toBe('warn');
      expect(claudeMcp.detail).toContain('alwaysLoad is not true');
      expect(claudeMcp.detail).toContain('repo-harness tools configure codegraph --target claude --location global');
      expect(index.status).toBe('ok');

      const log = fs.readFileSync(logFile, 'utf-8');
      expect(log).toContain('codegraph --version');
      expect(log).toContain('codegraph status .');
      expect(log).not.toContain('codegraph init');
      expect(log).not.toContain('codegraph sync');
      expect(log).not.toContain('codegraph install');
    } finally {
      fs.rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);
});
