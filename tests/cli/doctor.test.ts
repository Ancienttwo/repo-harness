import { buildProgram } from '../../src/cli/index';
import { PROFILE_COMPONENTS, hashManagedTree, profileEnablesExternalSkills } from '../../src/cli/installer/install-profile';
import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';
import {
  checkSkillProjection,
  clearRegisteredChecks,
  formatDoctor,
  readLatestPackageVersion,
  registerCheck,
  runDoctor,
} from '../../src/cli/commands/doctor';
import { writeShellExecutableFixture } from '../helpers/repo-fixture';
import { expectedSkillProjections, type SkillProjection } from '../../src/cli/installer/skill-projection';
import { parseSkillSurfaceCatalog } from '../../src/core/skill-surface/catalog';

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
  writeShellExecutableFixture(filePath, content);
}

function withTempRepo(
  opts: { optIn: boolean; scripts?: readonly string[] },
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

function writeFakeBunx(fakeBin: string): void {
  writeExecutable(
    path.join(fakeBin, 'bunx'),
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
      expect(ids).toContain('codex-cli-version');
      expect(ids).toContain('cli-update');
      expect(ids).toContain('codex-adapter');
      expect(ids).toContain('claude-adapter');
      expect(ids).toContain('codex-trust-state');
      expect(ids).toContain('codegraph-readiness');
      expect(ids).toContain('codex-codegraph-mcp');
      expect(ids).toContain('claude-codegraph-mcp');
      expect(ids).toContain('codegraph-index');
      expect(ids).toContain('security-config');
      expect(ids).toContain('typed-hook-routes');
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

  test('codex-cli-version reports n/a when codex is absent from PATH', () => {
    const envRoot = setupFakeEnvironment('repo-harness-doctor-codex-absent');
    try {
      withEnv({ HOME: envRoot.home, PATH: envRoot.fakeBin }, () => {
        const r = runDoctor(envRoot.root);
        const codex = r.checks.find((c) => c.id === 'codex-cli-version')!;
        expect(codex.status).toBe('na');
        expect(codex.detail).toBe('codex not found on PATH');
      });
    } finally {
      fs.rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, DOCTOR_CHECK_TIMEOUT_MS);

  for (const expected of [
    { version: '0.143.0', status: 'warn', stable: true },
    { version: '0.144.0', status: 'ok', stable: true },
    { version: '0.144.0-alpha.4', status: 'warn', stable: false },
  ] as const) {
    test(`codex-cli-version reports ${expected.status} for Codex ${expected.version}`, () => {
      const envRoot = setupFakeEnvironment(`repo-harness-doctor-codex-${expected.version}`);
      const fakeCodex = path.join(envRoot.fakeBin, 'codex');
      try {
        writeExecutable(fakeCodex, `#!/bin/bash\nprintf 'codex-cli ${expected.version}\\n'\n`);
        withEnv({ HOME: envRoot.home, PATH: envRoot.fakeBin }, () => {
          const r = runDoctor(envRoot.root);
          const codex = r.checks.find((c) => c.id === 'codex-cli-version')!;
          expect(codex.status).toBe(expected.status);
          expect(codex.detail).toContain(`path=${fakeCodex}`);
          if (expected.stable) {
            expect(codex.detail).toContain(`current=${expected.version}`);
            expect(codex.detail).toContain('minimum=0.144.0');
          } else {
            expect(codex.detail).toContain(`unable to parse version from "codex-cli ${expected.version}"`);
          }
        });
      } finally {
        fs.rmSync(envRoot.root, { recursive: true, force: true });
      }
    }, DOCTOR_CHECK_TIMEOUT_MS);
  }

  test('typed-hook-routes reports n/a for non-opt-in repos', () => {
    withTempRepo({ optIn: false }, (repoRoot) => {
      const r = runDoctor(repoRoot);
      const hooks = r.checks.find((c) => c.id === 'typed-hook-routes')!;
      expect(hooks.status).toBe('na');
      expect(hooks.detail).toContain('not opted in');
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('typed-hook-routes verifies the exhaustive in-process binding', () => {
    withTempRepo({ optIn: true }, (repoRoot) => {
      const r = runDoctor(repoRoot);
      const hooks = r.checks.find((c) => c.id === 'typed-hook-routes')!;
      expect(hooks.status).toBe('ok');
      expect(hooks.detail).toContain('all 12 public routes');
      expect(hooks.detail).toContain('typed in-process handler');
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
        expect(update.detail).toContain('agent_action=repo-harness update --target both');
      });
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('cli-update scopes the recommended runtime refresh to the requested target', () => {
    withTempHome(() => {
      withEnv({ REPO_HARNESS_CHECK_UPDATES: '1', REPO_HARNESS_LATEST_VERSION: '99.0.0' }, () => {
        for (const target of ['codex', 'claude'] as const) {
          const r = runDoctor(process.cwd(), target);
          const update = r.checks.find((c) => c.id === 'cli-update')!;
          expect(update.status).toBe('warn');
          expect(update.detail).toContain(`agent_action=repo-harness update --target ${target}`);
        }
      });
    });
  }, DOCTOR_CHECK_TIMEOUT_MS);

  test('registry version lookup uses the running Bun and ignores repo PATH package-manager shims', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-version-lookup-')));
    const fakeBin = path.join(root, 'bin');
    const probe = path.join(root, 'bun-probe');
    const probeLog = path.join(root, 'probe.log');
    const fakeNpmLog = path.join(root, 'fake-npm.log');
    const previousExecPath = process.execPath;
    try {
      fs.mkdirSync(fakeBin, { recursive: true });
      writeExecutable(
        probe,
        [
          '#!/bin/bash',
          'set -euo pipefail',
          `printf '%s\\n%s\\n' "$PWD" "$*" > "${probeLog}"`,
          'if [[ ! -f "$PWD/package.json" ]]; then echo "missing package.json in cwd" >&2; exit 43; fi',
          'printf \'"99.0.0"\\n\'',
          '',
        ].join('\n'),
      );
      writeExecutable(
        path.join(fakeBin, 'npm'),
        `#!/bin/bash\nprintf '%s\\n' "$*" > "${fakeNpmLog}"\nexit 42\n`,
      );
      Object.defineProperty(process, 'execPath', { value: probe, configurable: true });

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      };
      delete env.REPO_HARNESS_LATEST_VERSION;
      const result = readLatestPackageVersion(env);

      expect(result).toEqual({ version: '99.0.0' });
      const [cwd, args] = fs.readFileSync(probeLog, 'utf-8').trim().split('\n');
      const packageRoot = path.dirname(fileURLToPath(new URL('../../package.json', import.meta.url)));
      expect(fs.realpathSync(cwd)).toBe(fs.realpathSync(packageRoot));
      expect(args).toBe(
        'pm view repo-harness version --json --registry=https://registry.npmjs.org',
      );
      expect(fs.existsSync(fakeNpmLog)).toBe(false);
    } finally {
      Object.defineProperty(process, 'execPath', { value: previousExecPath, configurable: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

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
      writeFakeBunx(envRoot.fakeBin);

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

      expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
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

describe('doctor skill projection', () => {
  const root = path.resolve(import.meta.dir, '../..');
  function seed(home: string) {
    const source = path.join(home, '.bun/install/global/node_modules/repo-harness');
    fs.mkdirSync(path.join(source, 'assets/skill-commands'), { recursive: true });
    fs.cpSync(path.join(root, 'assets/skill-commands/manifest.json'), path.join(source, 'assets/skill-commands/manifest.json'));
    fs.cpSync(path.join(root, 'assets/workflow-contract.v1.json'), path.join(source, 'assets/workflow-contract.v1.json'));
    fs.cpSync(path.join(root, 'assets/skills/repo-harness-cross-review'), path.join(source, 'assets/skills/repo-harness-cross-review'), { recursive: true });
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: 'repo-harness', version: '0.20.0' }));
    const destination = path.join(home, '.codex/skills/repo-harness-cross-review');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    return { source: path.join(source, 'assets/skills/repo-harness-cross-review'), destination,
      env: { ...process.env, HOME: home, BUN_INSTALL: path.join(home, '.bun') } };
  }

  for (const state of ['ok link', 'stale copy', 'missing', 'dangling link', 'wrong link', 'ok copy'] as const) {
    test(`reports ${state} with the affected path and repair command`, () => withTempHome(home => {
      const f = seed(home);
      if (state === 'ok link') fs.symlinkSync(f.source, f.destination);
      if (state === 'dangling link') fs.symlinkSync(path.join(home, 'missing'), f.destination);
      if (state === 'wrong link') fs.symlinkSync(root, f.destination);
      if (state === 'stale copy' || state === 'ok copy') {
        fs.cpSync(f.source, f.destination, { recursive: true });
        if (state === 'stale copy') fs.writeFileSync(path.join(f.destination, 'SKILL.md'), 'user change\n');
      }
      const result = checkSkillProjection('both', f.env);
      expect(result.id).toBe('skill-projection');
      expect(result.detail).toContain(`${f.destination}: ${state}`);
      expect(result.detail).toContain('repo-harness install --profile full --target codex');
      expect(result.detail).toContain(path.join(home, '.claude/skills/repo-harness-cross-review') + ': missing');
      expect(result.detail).toContain(path.join(home, '.codex/skills/think') + ': missing');
      if (state === 'stale copy') expect(fs.readFileSync(path.join(f.destination, 'SKILL.md'), 'utf8')).toBe('user change\n');
      if (state === 'dangling link') expect(fs.readlinkSync(f.destination)).toBe(path.join(home, 'missing'));
    }));
  }

  test('per-skill rows and the CLI text are two projections of the same judgments', () => withTempHome(home => {
    const f = seed(home);
    const packageRoot = path.join(home, '.bun/install/global/node_modules/repo-harness');
    const catalog = parseSkillSurfaceCatalog(fs.readFileSync(path.join(packageRoot, 'assets/skill-commands/manifest.json'), 'utf8'),
      { declared: true, profileComponents: PROFILE_COMPONENTS });
    if (catalog.status !== 'valid') throw new Error('fixture catalog invalid');
    // The pre-row CLI line format, frozen: the rows must regenerate it byte for byte.
    const frozenLine = (projection: SkillProjection, state: string, ledgerDrift: boolean): string => {
      const fix = `repo-harness install --profile full --target ${projection.host}`;
      const shown = state === 'ok link' ? `ok link -> ${projection.source}` : state;
      const problems: string[] = [];
      if (!shown.startsWith('ok ')) {
        const preserve = state === 'missing' || state === 'source missing' ? '' : `preserve or move ${projection.destination}, then `;
        problems.push(`expected ${projection.source}; ${preserve}run: ${fix}`);
      }
      if (ledgerDrift) problems.push(`ledger drift; inspect: repo-harness install --state; then run: ${fix}`);
      return `${projection.destination}: ${shown}${problems.length > 0 ? '; ' + problems.join('; ') : ''}`;
    };
    const arrange: Record<string, () => void> = {
      'ok link': () => fs.symlinkSync(f.source, f.destination),
      'dangling link': () => fs.symlinkSync(path.join(home, 'missing'), f.destination),
      'wrong link': () => fs.symlinkSync(root, f.destination),
      'ok copy': () => fs.cpSync(f.source, f.destination, { recursive: true }),
      'stale copy': () => { fs.cpSync(f.source, f.destination, { recursive: true }); fs.writeFileSync(path.join(f.destination, 'SKILL.md'), 'x\n'); },
      'invalid path type': () => fs.writeFileSync(f.destination, 'f\n'),
      missing: () => {},
    };
    for (const [state, setup] of Object.entries(arrange)) {
      fs.rmSync(f.destination, { recursive: true, force: true });
      setup();
      for (const target of ['both', 'codex', 'claude'] as const) {
        const result = checkSkillProjection(target, f.env);
        const rows = result.skills!;
        const projections = expectedSkillProjections(catalog.catalog, packageRoot, home, 'full')
          .filter(projection => target === 'both' || projection.host === target);
        expect(rows.map(row => `${row.host}:${row.name}`)).toEqual(projections.map(p => `${p.host}:${p.name}`));
        expect(rows.find(row => row.host === 'codex' && row.name === 'repo-harness-cross-review')?.state ?? state).toBe(state as never);
        for (const row of rows) expect(row.ok).toBe(row.state.startsWith('ok '));
        const expected = [...rows.map((row, index) => frozenLine(projections[index]!, row.state, false)),
          'install ledger: missing; run: repo-harness install --profile full'];
        expect(result.detail).toBe(expected.join('\n'));
        expect(result.status).toBe('warn');
        expect(JSON.stringify(rows)).not.toContain(home);
      }
    }
  }));

  test('review regression: old global contract is an actionable warning', () => withTempHome(home => {
    const f = seed(home);
    const packageRoot = path.join(home, '.bun/install/global/node_modules/repo-harness');
    const contractPath = path.join(packageRoot, 'assets/workflow-contract.v1.json');
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    delete contract.installedCopyExcludes;
    fs.writeFileSync(contractPath, JSON.stringify(contract));
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'repo-harness', version: '0.19.5' }));
    const before = fs.readFileSync(contractPath, 'utf8');
    const result = checkSkillProjection('both', f.env);
    expect(result.status).toBe('warn');
    expect(result.detail).toContain('installedCopyExcludes');
    expect(result.detail).toContain('run: repo-harness upgrade');
    expect(fs.readFileSync(contractPath, 'utf8')).toBe(before);
  }));

  test('an old global contract without the canonical include set gives an actionable warning', () => withTempHome(home => {
    const f = seed(home);
    const contractPath = path.join(home, '.bun/install/global/node_modules/repo-harness/assets/workflow-contract.v1.json');
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    delete contract.installedCopyIncludes;
    fs.writeFileSync(contractPath, JSON.stringify(contract));
    const before = fs.readFileSync(contractPath, 'utf8');
    const result = checkSkillProjection('both', f.env);
    expect(result.status).toBe('warn');
    expect(result.detail).toContain('installedCopyIncludes');
    expect(result.detail).toContain('run: repo-harness update; then run: repo-harness upgrade');
    expect(fs.readFileSync(contractPath, 'utf8')).toBe(before);
  }));

  test('reports invalid path type without replacing the file', () => withTempHome(home => {
    const f = seed(home);
    fs.writeFileSync(f.destination, 'user file\n');
    const result = checkSkillProjection('codex', f.env);
    expect(result.status).toBe('warn');
    expect(result.detail).toContain(`${f.destination}: invalid path type`);
    expect(result.detail).toContain(`preserve or move ${f.destination}`);
    expect(fs.readFileSync(f.destination, 'utf8')).toBe('user file\n');
  }));

  test('reports source missing and preserves the installed copy', () => withTempHome(home => {
    const f = seed(home);
    fs.cpSync(f.source, f.destination, { recursive: true });
    const before = hashManagedTree(f.destination);
    fs.rmSync(f.source, { recursive: true });
    const result = checkSkillProjection('codex', f.env);
    expect(result.status).toBe('warn');
    expect(result.detail).toContain(`${f.destination}: source missing`);
    expect(result.detail).toContain('run: repo-harness install --profile full --target codex');
    expect(hashManagedTree(f.destination)).toBe(before);
  }));

  test('fails closed on a malformed projection contract', () => withTempHome(home => {
    const f = seed(home);
    const contractPath = path.join(home, '.bun/install/global/node_modules/repo-harness/assets/workflow-contract.v1.json');
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    contract.installedCopyExcludes = 42;
    fs.writeFileSync(contractPath, JSON.stringify(contract));
    const result = checkSkillProjection('codex', f.env);
    expect(result.status).toBe('fail');
    expect(result.detail).toContain('invalid installed copy exclusions');
    expect(result.detail).toContain('repo-harness install --state');
  }));

  test('reports ledger type drift and installedProfileStatus drift without changing the ledger', () => withTempHome(home => {
    const f = seed(home);
    fs.symlinkSync(f.source, f.destination);
    const ledger = path.join(home, '.repo-harness/install-state.json');
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.writeFileSync(ledger, JSON.stringify({ protocol: 2, profile: 'full', components: PROFILE_COMPONENTS.full,
      transaction_id: 'projection-test', applied_at: new Date(0).toISOString(), previous: null,
      ownership_manifest: [{ components: ['cross-model-acceptance'], authority: 'repo-harness-install-transaction', removal: 'managed-surfaces-only',
        path: f.destination, type: 'directory-copy', content_hash: hashManagedTree(f.source), managed_marker: 'transaction-created-directory', symlink_target: null }] }));
    const before = fs.readFileSync(ledger, 'utf8');
    const result = checkSkillProjection('codex', f.env);
    expect(result.status).toBe('warn');
    expect(result.detail).toContain(`${f.destination}: ok link -> ${f.source}; ledger drift`);
    expect(result.detail).toContain('"surface_drift":["' + f.destination + '"]');
    expect(result.detail).toContain('repo-harness install --state');
    expect(fs.readFileSync(ledger, 'utf8')).toBe(before);
    // Keep the on-disk type as symlink, but change its recorded target.
    const changed = JSON.parse(before);
    changed.ownership_manifest[0] = { ...changed.ownership_manifest[0], type: 'symlink', content_hash: null,
      managed_marker: null, symlink_target: path.join(home, 'previous-target') };
    fs.writeFileSync(ledger, JSON.stringify(changed));
    expect(checkSkillProjection('codex', f.env).detail).toContain(`${f.destination}: ok link -> ${f.source}; ledger drift`);
  }));

  test('reports changed owned links and unknown Waza directories; accepts relative staging links', () => withTempHome(home => {
    const f = seed(home);
    const staging = path.join(home, '.agents/skills/think');
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(path.join(staging, 'SKILL.md'), '# think\n');
    const dest = path.join(home, '.codex/skills/think');
    fs.symlinkSync('../../.agents/skills/think', dest);
    expect(checkSkillProjection('codex', f.env).detail).toContain(`${dest}: ok link -> ${staging}`);
    fs.rmSync(dest);
    fs.cpSync(staging, dest, { recursive: true });
    const result = checkSkillProjection('codex', f.env);
    expect(result.detail).toContain(`${dest}: unowned real directory; expected ${staging}; preserve or move ${dest}`);
    expect(result.detail).toContain('repo-harness install --profile full --target codex');
    expect(fs.lstatSync(dest).isDirectory()).toBe(true);
    fs.writeFileSync(path.join(dest, 'SKILL.md'), 'private instructions\n');
    expect(checkSkillProjection('codex', f.env).detail).toContain(`${dest}: stale copy`);
    expect(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8')).toBe('private instructions\n');
  }));

  test('runDoctor includes the check and filters projection hosts by target', () => withTempHome(home => {
    seed(home);
    withEnv({ BUN_INSTALL: path.join(home, '.bun') }, () => {
      const result = runDoctor(root, 'codex').checks.find(check => check.id === 'skill-projection');
      expect(result?.detail).toContain(path.join(home, '.codex/skills/repo-harness-cross-review'));
      expect(result?.detail).not.toContain(path.join(home, '.claude/skills'));
    });
  }), DOCTOR_CHECK_TIMEOUT_MS);
});

test('skill-projection repair commands use supported install arguments', () => {
  withTempHome(home => {
    const result = checkSkillProjection('both', { ...process.env, HOME: home, BUN_INSTALL: path.join(home, '.bun') });
    const repairs = [...result.detail.matchAll(/run: repo-harness (install[^;\n]*)/g)].map(match => match[1]);
    expect(repairs.length).toBeGreaterThan(0);
    for (const repair of repairs) {
      const install = buildProgram().commands.find(command => command.name() === 'install')!;
      const args = repair.trim().split(/\s+/).slice(1);
      expect(install.parseOptions(args).unknown).toEqual([]);
      expect(install.opts().profile).toBe('full');
      // parseOptions validates flags. The action selects marketplace defaults
      // from the requested profile through this exact policy function.
      expect(profileEnablesExternalSkills(install.opts().profile)).toBe(true);
    }
  });
});

describe('legacy workflow-state diagnostic', () => {
  test('reports a legacy copy from a nested cwd without changing its bytes', () => {
    withTempHome(() => withTempRepo({ optIn: true }, (repo) => {
      const legacy = path.join(repo, '.ai/hooks/lib/workflow-state.sh');
      fs.mkdirSync(path.dirname(legacy), { recursive: true });
      const content = '# Local operator changes\n';
      fs.writeFileSync(legacy, content);
      withEnv({ PATH: '/usr/bin:/bin', REPO_HARNESS_CHECK_UPDATES: '0' }, () => {
        const check = runDoctor(path.dirname(legacy)).checks.find((check) => check.id === 'legacy-workflow-state');
        expect(check?.status).toBe('warn');
        expect(check?.detail).toContain('repo-harness hook-lib path');
        expect(check?.detail).toContain('back up');
        expect(check?.detail).toContain('edited copies');
        expect(fs.readFileSync(legacy, 'utf8')).toBe(content);
        fs.unlinkSync(legacy);
        expect(runDoctor(repo).checks.find((check) => check.id === 'legacy-workflow-state')?.status).toBe('ok');
      });
    }));
  }, DOCTOR_CHECK_TIMEOUT_MS);
});

test('doctor preserves the source checkout self-host library without migration warnings', () => {
  withTempHome(() => withEnv({ PATH: '/usr/bin:/bin', REPO_HARNESS_CHECK_UPDATES: '0' }, () => {
    const root = path.join(import.meta.dir, '../..');
    const library = path.join(root, '.ai/hooks/lib/workflow-state.sh');
    const before = fs.readFileSync(library, 'utf8');
    const check = runDoctor(root).checks.find((check) => check.id === 'legacy-workflow-state');
    expect(check?.status).toBe('na');
    expect(check?.detail).toContain('self-host');
    expect(check?.detail).not.toContain('remove');
    expect(fs.readFileSync(library, 'utf8')).toBe(before);
  }));
}, DOCTOR_CHECK_TIMEOUT_MS);
