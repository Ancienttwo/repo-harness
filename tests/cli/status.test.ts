import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { runStatus, formatStatus } from '../../src/cli/commands/status';
import { runInstall } from '../../src/cli/commands/install';
import { registerArchitecturePlugin } from '../../src/cli/index';
import { installProfileStatePath, versions } from '../../src/cli/installer/install-profile';
import type { PluginId } from '../../src/core/skill-surface/plugin-manifest';

const FULL_PLUGINS: readonly PluginId[] = ['architecture', 'cross-review', 'peer-runtime', 'platform', 'product', 'strategy-memory'];

const ROOT = path.join(import.meta.dir, '..', '..');

function withTempHome(fn: (home: string) => void): void {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-status-')));
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

function writeInstallStateFixture(plugins: readonly PluginId[]): void {
  const statePath = installProfileStatePath(process.env);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({
    protocol: 3,
    ...versions(plugins),
    selection: plugins === FULL_PLUGINS ? 'all' : plugins,
    transaction_id: `test-${plugins.join('-') || 'core'}`,
    applied_at: '2026-01-01T00:00:00.000Z',
    ownership_manifest: [],
    previous: null,
  }));
}

describe('status command (Phase 1C)', () => {
  test('reports CLI version + 7 routes with correct per-event breakdown', () => {
    withTempHome(() => {
      const r = runStatus();
      expect(r.cli.version).toBeTruthy();
      expect(r.routes.total).toBe(7);
      expect(r.routes.byEvent.PreToolUse).toBe(3);
      expect(r.routes.byEvent.PostToolUse).toBeUndefined();
      expect(r.routes.byEvent.SessionStart).toBe(1);
      expect(r.routes.byEvent.UserPromptSubmit).toBe(1);
      expect(r.routes.byEvent.SubagentStart).toBe(1);
      expect(r.routes.byEvent.SubagentStop).toBeUndefined();
      expect(r.routes.byEvent.Stop).toBe(1);
    });
  });

  test('before install: every host reports alreadyConfigured=false', () => {
    withTempHome(() => {
      const r = runStatus();
      expect(r.targets.length).toBeGreaterThan(0);
      for (const t of r.targets) {
        expect(t.alreadyConfigured).toBe(false);
        expect(t.managedEntryCount).toBe(0);
      }
    });
  });

  test('after install: managedEntryCount equals expectedEntryCount per host', () => {
    withTempHome(() => {
      runInstall({ target: 'both', location: 'global' });
      const r = runStatus();
      const codex = r.targets.find((t) => t.id === 'codex')!;
      expect(codex.alreadyConfigured).toBe(true);
      expect(codex.managedEntryCount).toBe(codex.expectedEntryCount);
      expect(codex.managedEntryCount).toBe(5);
      const claude = r.targets.find((t) => t.id === 'claude')!;
      expect(claude.managedEntryCount).toBe(claude.expectedEntryCount);
      expect(claude.managedEntryCount).toBe(6);
    });
  });

  test('reports exact projection drift when Stop timeout changes without changing managed count', () => {
    withTempHome(() => {
      runInstall({ target: 'codex', location: 'global' });
      const configPath = path.join(process.env.HOME!, '.codex', 'hooks.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
        hooks: Record<string, Array<{ hooks: Array<{ timeout?: number }> }>>;
      };
      config.hooks.Stop[0].hooks[0].timeout = 150;
      fs.writeFileSync(configPath, JSON.stringify(config));

      const report = runStatus();
      const codex = report.targets.find((target) => target.id === 'codex')!;
      const projection = codex.projection!;
      expect(codex.managedEntryCount).toBe(codex.expectedEntryCount);
      expect(projection.status).toBe('drift');
      expect(projection.mismatches).toEqual(expect.arrayContaining([
        expect.objectContaining({
          event: 'Stop',
          routeId: 'default',
          field: 'timeout',
          expected: 30,
          actual: 150,
        }),
      ]));
      expect(formatStatus(report, false)).toContain('Stop.default timeout expected=30 actual=150');
    });
  });

  test('reports matcher, type, and command field drift by route', () => {
    withTempHome(() => {
      runInstall({ target: 'codex', location: 'global' });
      const configPath = path.join(process.env.HOME!, '.codex', 'hooks.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
        hooks: Record<string, Array<{
          matcher?: unknown;
          hooks: Array<{ type?: unknown; command?: unknown; timeout?: unknown }>;
        }>>;
      };
      const edit = config.hooks.PreToolUse.find((entry) => entry.matcher === 'Edit|Write')!;
      edit.matcher = 'Edit';
      edit.hooks[0].type = 'script';
      edit.hooks[0].command = `${edit.hooks[0].command}; changed`;
      fs.writeFileSync(configPath, JSON.stringify(config));

      const codex = runStatus().targets.find((target) => target.id === 'codex')!;
      expect(codex.projection?.mismatches).toEqual(expect.arrayContaining([
        expect.objectContaining({ event: 'PreToolUse', routeId: 'edit', field: 'matcher' }),
        expect.objectContaining({ event: 'PreToolUse', routeId: 'edit', field: 'type' }),
        expect.objectContaining({ event: 'PreToolUse', routeId: 'edit', field: 'command' }),
      ]));
    });
  });

  test('reports missing, duplicate, and unexpected managed routes', () => {
    withTempHome(() => {
      runInstall({ target: 'codex', location: 'global' });
      const configPath = path.join(process.env.HOME!, '.codex', 'hooks.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
        hooks: Record<string, Array<{
          matcher?: unknown;
          hooks: Array<{ type?: unknown; command?: unknown; timeout?: unknown }>;
        }>>;
      };
      const stop = config.hooks.Stop[0];
      config.hooks.Stop = [];
      config.hooks.SessionStart.push({
        ...stop,
        hooks: stop.hooks.map((hook) => ({
          ...hook,
          command: String(hook.command).replace('--route default', '--route unknown'),
        })),
      });
      config.hooks.PreToolUse.push(config.hooks.PreToolUse[0]);
      fs.writeFileSync(configPath, JSON.stringify(config));

      const projection = runStatus().targets.find((target) => target.id === 'codex')!.projection!;
      expect(projection.status).toBe('drift');
      expect(projection.mismatches).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'missing', event: 'Stop', routeId: 'default' }),
        expect.objectContaining({ kind: 'duplicate', event: 'PreToolUse', routeId: 'edit' }),
        expect.objectContaining({ kind: 'unexpected', event: 'SessionStart', routeId: 'unknown' }),
      ]));
    });
  });

  test('ignores unmanaged sibling commands while checking the managed projection', () => {
    withTempHome(() => {
      runInstall({ target: 'codex', location: 'global' });
      const configPath = path.join(process.env.HOME!, '.codex', 'hooks.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
        hooks: Record<string, Array<{
          hooks: Array<{ type?: unknown; command?: unknown; timeout?: unknown }>;
        }>>;
      };
      config.hooks.Stop[0].hooks.push({ type: 'command', command: 'echo user-owned', timeout: 30 });
      fs.writeFileSync(configPath, JSON.stringify(config));

      const projection = runStatus().targets.find((target) => target.id === 'codex')!.projection!;
      expect(projection.status).toBe('consistent');
      expect(projection.mismatches).toEqual([]);
    });
  });

  test('every hook route is core: the expected managed entry count does not depend on the plugin selection', () => {
    for (const plugins of [[], FULL_PLUGINS] as const) {
      withTempHome(() => {
        runInstall({ target: 'codex', location: 'global' });
        writeInstallStateFixture(plugins);

        const report = runStatus();
        const codex = report.targets.find((target) => target.id === 'codex')!;
        expect(codex.managedEntryCount).toBe(5);
        expect(codex.expectedEntryCount).toBe(5);
        expect(report.installState).toMatchObject({ recorded: true, plugins, selection: plugins === FULL_PLUGINS ? 'all' : plugins });
      });
    }
  });

  test('detects opt-in repo via .ai/harness/workflow-contract.json marker', () => {
    withTempHome(() => {
      const repo = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-status-repo-')),
      );
      try {
        execSync('git init', { cwd: repo, stdio: 'ignore' });
        fs.mkdirSync(path.join(repo, '.ai/harness'), { recursive: true });
        fs.writeFileSync(path.join(repo, '.ai/harness/workflow-contract.json'), '{}');
        const r = runStatus(repo);
        expect(r.repo.inGitRepo).toBe(true);
        expect(r.repo.optIn).toBe(true);
        expect(r.repo.repoRoot).toBe(repo);
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('reports model authority, projection provider, code facts, and apply independently', () => {
    registerArchitecturePlugin();
    withTempHome(() => {
      const repo = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-status-architecture-')),
      );
      try {
        execSync('git init', { cwd: repo, stdio: 'ignore' });
        fs.mkdirSync(path.join(repo, '.ai/harness'), { recursive: true });
        fs.mkdirSync(path.join(repo, '.archcontext/model/nodes'), { recursive: true });
        fs.writeFileSync(path.join(repo, '.ai/harness/workflow-contract.json'), '{}');
        fs.copyFileSync(path.join(ROOT, '.archcontext/manifest.yaml'), path.join(repo, '.archcontext/manifest.yaml'));
        fs.writeFileSync(path.join(repo, '.archcontext/product.yaml'), 'name: fixture\n');
        // The native export needs a valid model and a committed HEAD.
        fs.writeFileSync(path.join(repo, '.archcontext/model/nodes/capability.fixture.core.yaml'), [
          'schemaVersion: archcontext.node/v2',
          'kind: capability',
          'id: capability.fixture.core',
          'name: Fixture Core',
          'summary: Fixture capability.',
          'responsibilities:',
          '  - Own the fixture source.',
          'status: active',
          'source:',
          '  include:',
          '    - src/**',
          'extensions:',
          '  lspProfile: ts',
          '  verification: []',
          '  contractFiles:',
          '    agents: AGENTS.md',
          '    claude: CLAUDE.md',
          '',
        ].join('\n'));
        fs.writeFileSync(
          path.join(repo, '.ai/harness/policy.json'),
          JSON.stringify({ context: { capability_source: 'archcontext' } }),
        );

        execSync('git add .', { cwd: repo, stdio: 'ignore' });
        execSync('git -c user.name=Test -c user.email=test@example.com commit -m fixture', { cwd: repo, stdio: 'ignore' });
        const report = runStatus(repo);
        expect(report.architectureProjection).toEqual({
          schemaVersion: 'repo-harness.architecture-projection-readiness/v1',
          modelAuthority: { source: 'archcontext', ready: true },
          projectionProvider: {
            provider: 'disabled',
            state: 'disabled',
            binaryPath: null,
            nodePath: null,
            command: null,
            version: null,
            reason: 'global architecture configuration is missing; run repo-harness update once',
          },
          codeFacts: { requirement: 'required', state: 'not-evaluated' },
          daemonRuntime: { state: 'not-evaluated' },
          apply: { mode: 'disabled', enabled: false },
          next: null,
        });
        const text = formatStatus(report, false);
        expect(text).toContain('model authority: archcontext (ready)');
        expect(text).toContain('provider: disabled (disabled)');
        expect(text).toContain('code facts: not-evaluated');
        expect(text).toContain('apply: disabled');
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    });
  });

  test('non-git-repo cwd reports inGitRepo=false and optIn=false', () => {
    withTempHome(() => {
      const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-')));
      try {
        const r = runStatus(tmp);
        expect(r.repo.inGitRepo).toBe(false);
        expect(r.repo.optIn).toBe(false);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  test('formatStatus produces human-readable text', () => {
    withTempHome(() => {
      const text = formatStatus(runStatus(), false);
      expect(text).toContain('repo-harness');
      expect(text).toContain('Hosts:');
      expect(text).toContain('Routes:');
      expect(text).toContain('Current repo:');
    });
  });

  test('formatStatus --json produces parseable JSON', () => {
    withTempHome(() => {
      const json = formatStatus(runStatus(), true);
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.cli).toBeDefined();
      expect(parsed.routes.total).toBe(7);
    });
  });

  test('installState reports not recorded when install-state.json is absent', () => {
    withTempHome(() => {
      const r = runStatus();
      expect(r.installState).toEqual({ recorded: false });
      expect(r.targets.find((target) => target.id === 'codex')?.expectedEntryCount).toBe(5);
      const text = formatStatus(r, false);
      expect(text).toContain('Install state:');
      expect(text).toContain('(not recorded)');
    });
  });

  test('installState reads back the core version and plugins from install-state.json', () => {
    withTempHome(() => {
      writeInstallStateFixture(['architecture', 'product']);
      const { core } = versions([]);

      const r = runStatus();
      expect(r.installState).toEqual({
        recorded: true,
        core_version: core.version,
        plugins: ['architecture', 'product'],
        selection: ['architecture', 'product'],
      });

      const text = formatStatus(r, false);
      expect(text).toContain(`core: ${core.version}`);
      expect(text).toContain('plugins: architecture, product');
      expect(text).toContain('selection:');

      writeInstallStateFixture([]);
      expect(formatStatus(runStatus(), false)).toContain('plugins: (none)');
    });
  });

  test('installState reports invalid (not not-recorded) when install-state.json is corrupt JSON', () => {
    // A corrupt install is a materially different diagnostic signal than
    // "never installed" -- conflating them (as this test used to assert)
    // hides a broken host install behind text that reads as "just run
    // install", when actually something needs repairing.
    withTempHome(() => {
      const statePath = installProfileStatePath(process.env);
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, '{not valid json');

      const r = runStatus();
      expect(r.installState.recorded).toBe('invalid');
      expect(r.installState).toMatchObject({ code: 'install_state_invalid', path: statePath });
      expect(r.installState).not.toEqual({ recorded: false });
      expect(r.targets.find((target) => target.id === 'codex')?.expectedEntryCount).toBe(5);
      const text = formatStatus(r, false);
      expect(text).toContain('(install_state_invalid)');
      expect(text).not.toContain('(not recorded)');
    });
  });

  test('installState reports invalid when a plugin entry fails readInstallState validation', () => {
    withTempHome(() => {
      const statePath = installProfileStatePath(process.env);
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      const { core } = versions([]);
      fs.writeFileSync(statePath, JSON.stringify({
        protocol: 3,
        core,
        plugins: [{ id: 'not-a-real-plugin', version: core.version }],
        selection: 'all',
        transaction_id: 'test-txn',
        applied_at: '2026-01-01T00:00:00.000Z',
        ownership_manifest: [],
        previous: null,
      }));

      const r = runStatus();
      expect(r.installState.recorded).toBe('invalid');
      expect(r.installState).toMatchObject({ code: 'install_state_invalid' });
    });
  });

  test('installState names the next step for protocol 1 and protocol 2 states', () => {
    withTempHome(() => {
      const statePath = installProfileStatePath(process.env);
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify({
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
      }));

      const r = runStatus();
      expect(r.installState).toMatchObject({
        recorded: 'invalid',
        code: 'install_state_protocol_retired',
      });

      fs.writeFileSync(statePath, JSON.stringify({
        protocol: 2,
        profile: 'full',
        components: [],
        transaction_id: 'legacy-full',
        applied_at: '2026-07-14T00:00:00.000Z',
        ownership_manifest: [],
        previous: null,
      }));
      const retired = runStatus();
      expect(retired.installState).toMatchObject({
        recorded: 'invalid',
        code: 'install_state_protocol_retired',
      });
      expect(formatStatus(retired, false)).toContain('bun add -g repo-harness@0.25.4 --no-cache && repo-harness update --version 0.25.4');
    });
  });

  test('installState reports invalid instead of crashing when a syntactically valid install-state.json is missing plugins', () => {
    // A syntactically valid state with missing plugins must remain
    // diagnosable instead of reaching formatStatus's `.plugins.join()`.
    withTempHome(() => {
      const statePath = installProfileStatePath(process.env);
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify({
        protocol: 3,
        core: versions([]).core,
        selection: 'all',
        transaction_id: 'test-txn',
        applied_at: '2026-01-01T00:00:00.000Z',
        ownership_manifest: [],
        previous: null,
      }));

      const r = runStatus();
      expect(r.installState.recorded).toBe('invalid');
      if (r.installState.recorded === 'invalid') {
        expect(r.installState.error).toContain('plugins');
      }
      expect(() => formatStatus(r, false)).not.toThrow();
    });
  });

  test('installState reports invalid instead of crashing when plugins is a non-array value', () => {
    withTempHome(() => {
      const statePath = installProfileStatePath(process.env);
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify({
        protocol: 3,
        core: versions([]).core,
        plugins: 'architecture,product',
        selection: 'all',
        transaction_id: 'test-txn',
        applied_at: '2026-01-01T00:00:00.000Z',
        ownership_manifest: [],
        previous: null,
      }));

      const r = runStatus();
      expect(r.installState.recorded).toBe('invalid');
      expect(() => formatStatus(r, false)).not.toThrow();
    });
  });
});
