import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import type { PluginId } from '../../src/core/skill-surface/plugin-manifest';
import { installStateFixturePath, pluginSelectionEnv } from '../helpers/install-ownership';
import { RETIRED_CHATGPT_STATE_FINDING, runMcpDoctor } from '../../src/cli/mcp/doctor';
import { createMcpToolContext } from '../../src/cli/mcp/server';
import { createCodeGraphCliAdapter } from '../../src/cli/tools/codegraph-reader';
import { callMcpTool } from '../../src/cli/mcp/tools';

const CLI = join(import.meta.dir, '../..', 'src/cli/index.ts');

function withTmpRepo<T>(fn: (repoRoot: string, userHome: string) => T): T {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-doctor-'));
  const repoHarnessHome = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-doctor-home-'));
  const previousRepoHarnessHome = process.env.REPO_HARNESS_HOME;
  try {
    process.env.REPO_HARNESS_HOME = repoHarnessHome;
    mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
    writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
    return fn(repoRoot, repoHarnessHome);
  } finally {
    if (previousRepoHarnessHome === undefined) delete process.env.REPO_HARNESS_HOME;
    else process.env.REPO_HARNESS_HOME = previousRepoHarnessHome;
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(repoHarnessHome, { recursive: true, force: true });
  }
}

/**
 * Async counterpart of withTmpRepo. The sync version returns fn's value from a
 * try/finally, so an async body would have its temp dirs removed and its
 * REPO_HARNESS_HOME restored before it finished.
 */
async function withTmpRepoAsync<T>(fn: (repoRoot: string, userHome: string) => Promise<T>): Promise<T> {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-doctor-'));
  const repoHarnessHome = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-doctor-home-'));
  const previousRepoHarnessHome = process.env.REPO_HARNESS_HOME;
  try {
    process.env.REPO_HARNESS_HOME = repoHarnessHome;
    mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
    writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
    return await fn(repoRoot, repoHarnessHome);
  } finally {
    if (previousRepoHarnessHome === undefined) delete process.env.REPO_HARNESS_HOME;
    else process.env.REPO_HARNESS_HOME = previousRepoHarnessHome;
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(repoHarnessHome, { recursive: true, force: true });
  }
}

function writeUserConfig(userHome: string, config: Record<string, unknown> = {}): string {
  const path = join(userHome, 'mcp.local.json');
  writeFileSync(path, `${JSON.stringify({ version: 3, permissions: { allowedRoots: [], discoveryRoots: [], fullDiskRead: false }, profile: 'planner', ...config }, null, 2)}\n`);
  return path;
}

describe('mcp doctor and local config', () => {
  test('fails closed when local MCP config cannot be parsed', () => {
    withTmpRepo((repoRoot, userHome) => {
      writeFileSync(join(userHome, 'mcp.local.json'), '{not-json\n');

      expect(() => createMcpToolContext({ repo: repoRoot, profile: 'planner', codeGraphAdapter: createCodeGraphCliAdapter() })).toThrow(
        'invalid MCP local config',
      );
    });
  });

  test('fails closed on a local config that keeps a retired ChatGPT, OAuth or orchestrator key', () => {
    withTmpRepo((repoRoot, userHome) => {
      writeUserConfig(userHome, {
        server: { host: '127.0.0.1', port: 9911, transport: 'http' },
        chatgpt: { serverName: 'repo-harness' },
        capabilities: { workflowPlanner: true, publicationMerge: true },
        profile: 'orchestrator',
      });
      for (const action of [
        () => createMcpToolContext({ repo: repoRoot, profile: 'planner', codeGraphAdapter: createCodeGraphCliAdapter() }),
        () => runMcpDoctor({ repo: repoRoot, json: true }),
      ]) {
        expect(action).toThrow('MCP_CONFIG_RETIRED_FIELD: server, chatgpt, capabilities.publicationMerge, profile=orchestrator;');
      }
    });
  });

  test('MCP command entrypoints fail closed on legacy repo-scope config', () => {
    withTmpRepo((repoRoot, userHome) => {
      const legacyConfig = join(repoRoot, '.repo-harness', 'mcp.local.json');
      mkdirSync(join(repoRoot, '.repo-harness'), { recursive: true });
      writeFileSync(legacyConfig, `${JSON.stringify({ version: 3, scope: 'repo', repo: repoRoot, profile: 'planner' })}\n`);

      for (const action of [
        () => runMcpDoctor({ repo: repoRoot, json: true }),
        () => createMcpToolContext({ repo: repoRoot, profile: 'planner', codeGraphAdapter: createCodeGraphCliAdapter() }),
      ]) {
        expect(action).toThrow('legacy repo-scope MCP config detected');
      }
      // No silent read-through and no cleanup: the legacy file stays untouched.
      expect(existsSync(legacyConfig)).toBe(true);

      const selectedEnv = pluginSelectionEnv(['mcp']);
      const cli = spawnSync(
        process.execPath,
        [CLI, 'mcp', 'doctor', '--repo', repoRoot],
        { encoding: 'utf-8', env: { ...selectedEnv, REPO_HARNESS_HOME: userHome } },
      );
      rmSync(selectedEnv.HOME!, { recursive: true, force: true });
      expect(cli.status).toBe(2);
      expect(cli.stderr).toContain('legacy repo-scope MCP config detected');
    });
  });

  test('the mcp selection gates serve and doctor and the MCP code load', () => {
    withTmpRepo((repoRoot, userHome) => {
      const probe = join(userHome, 'load-probe.ts');
      writeFileSync(probe, `process.on('exit', () => process.stderr.write(\`mcp-modules:\${Object.keys(require.cache).filter(path => /[\\\\/]src[\\\\/]cli[\\\\/]mcp[\\\\/]|@modelcontextprotocol[\\\\/]/.test(path)).length}\n\`));\n`);
      const homes: string[] = [];
      const selected = (plugins: readonly PluginId[]) => { const env = pluginSelectionEnv(plugins); homes.push(env.HOME!); return env; };
      const call = (env: NodeJS.ProcessEnv, ...args: string[]) => {
        const result = spawnSync(process.execPath, ['--preload', probe, CLI, ...args], { encoding: 'utf-8', input: '', env: { ...env, REPO_HARNESS_HOME: userHome, BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' } });
        const lines = result.stderr.split('\n').filter(line => line !== '' && !line.startsWith('mcp-modules:'));
        return { status: result.status, stdout: result.stdout, lines, loaded: Number(/mcp-modules:(\d+)/.exec(result.stderr)?.[1]) };
      };
      const noState = { ...process.env, HOME: join(userHome, 'no-state') };
      mkdirSync(noState.HOME, { recursive: true });
      const unreadable = { ...process.env, HOME: join(userHome, 'unreadable') };
      mkdirSync(join(unreadable.HOME, '.repo-harness'), { recursive: true });
      writeFileSync(installStateFixturePath(unreadable), '{');

      const needs = (name: string, repair: string) => `install_plugin_unavailable: repo-harness mcp ${name} needs the mcp plugin: the mcp plugin is not selected; run: ${repair}`;
      const blocked: [string, NodeJS.ProcessEnv, string | RegExp][] = [
        ['core only', selected([]), 'repo-harness install --plugins mcp'],
        ['other plugin', selected(['product']), 'repo-harness install --plugins mcp,product'],
        ['no install state', noState, 'repo-harness install'],
        ['unreadable install state', unreadable, /is not valid JSON/],
      ];
      for (const [name, env, expected] of blocked) {
        for (const command of ['serve', 'doctor']) {
          const result = call(env, 'mcp', command, '--repo', repoRoot);
          expect(result.status, name).toBe(1);
          expect(result.stdout, name).toBe('');
          expect(result.lines.length, name).toBe(1);
          if (typeof expected === 'string') expect(result.lines[0], name).toBe(needs(command, expected));
          else expect(result.lines[0], name).toMatch(expected);
          expect(result.loaded, name).toBe(0);
        }
      }

      const coreOnly = selected([]);
      for (const args of [['mcp', '--help'], ['mcp', 'serve', '--help'], ['mcp', 'doctor', '--help'], ['bots', '--help'], ['status', '--json']]) {
        const result = call(coreOnly, ...args);
        expect(result.status, args.join(' ')).toBe(0);
        expect(result.loaded, args.join(' ')).toBe(0);
      }
      const access = call(coreOnly, 'mcp', 'access', 'set', '--repo', repoRoot, '--mode', 'read_write');
      expect(access.lines.join('\n')).not.toContain('install_plugin_unavailable');
      expect(access.loaded).toBe(0);

      const withPlugin = selected(['mcp']);
      for (const command of ['serve', 'doctor']) {
        const result = call(withPlugin, 'mcp', command, '--repo', repoRoot);
        expect(result.status, command).toBe(0);
        expect(result.loaded, command).toBeGreaterThan(0);
      }
      for (const home of homes) rmSync(home, { recursive: true, force: true });
    });
  });

  test('harness_doctor and runMcpDoctor agree on mcp.localConfig from the single storage authority', async () => {
    const harnessDoctorLocalConfig = async (repoRoot: string): Promise<boolean> => {
      const ctx = createMcpToolContext({ repo: repoRoot, profile: 'planner', codeGraphAdapter: createCodeGraphCliAdapter() });
      const result = await callMcpTool(ctx, 'harness_doctor', {});
      return JSON.parse(result.content[0].text).mcp.localConfig;
    };

    await withTmpRepoAsync(async (repoRoot) => {
      expect(JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]).mcp.localConfig).toBe(false);
      expect(await harnessDoctorLocalConfig(repoRoot)).toBe(false);
    });

    await withTmpRepoAsync(async (repoRoot, userHome) => {
      writeUserConfig(userHome);
      expect(JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]).mcp.localConfig).toBe(true);
      expect(await harnessDoctorLocalConfig(repoRoot)).toBe(true);
    });

    // A legacy repo-scope file that appears after startup must not fabricate a true.
    await withTmpRepoAsync(async (repoRoot) => {
      const ctx = createMcpToolContext({ repo: repoRoot, profile: 'planner', codeGraphAdapter: createCodeGraphCliAdapter() });
      mkdirSync(join(repoRoot, '.repo-harness'), { recursive: true });
      writeFileSync(join(repoRoot, '.repo-harness', 'mcp.local.json'), '{"version":3}\n');
      const payload = JSON.parse((await callMcpTool(ctx, 'harness_doctor', {})).content[0].text);
      expect(payload.mcp.localConfig).toBe(false);
    });
  });

  test('server context rejects configured allowed roots that rebase denied directory globs', () => {
    withTmpRepo((repoRoot) => {
      const sensitiveRoot = join(repoRoot, 'node_modules/pkg');
      mkdirSync(sensitiveRoot, { recursive: true });
      expect(() => createMcpToolContext({ repo: repoRoot, enableReader: true, allowedRoots: [sensitiveRoot], codeGraphAdapter: createCodeGraphCliAdapter() })).toThrow(
        'MCP allowed root is denied by policy',
      );
    });
  });

  test('doctor reports config version and explicit allowed-root diagnostics', () => {
    withTmpRepo((repoRoot, userHome) => {
      const externalRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-allowed-root-'));
      try {
        writeUserConfig(userHome, { permissions: { allowedRoots: [externalRoot], discoveryRoots: [], fullDiskRead: false } });
        const doctor = JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]);
        expect(doctor.mcp.configVersion).toBe(3);
        expect(doctor.mcp.configVersionOk).toBe(true);
        expect(doctor.mcp.permissions.allowedRootCount).toBe(1);
        expect(doctor.mcp.permissions.allowedRoots).toEqual([
          expect.objectContaining({
            path: realpathSync(externalRoot),
            exists: true,
            readable: true,
            canonicalPath: realpathSync(externalRoot),
          }),
        ]);
        expect(doctor.mcp.permissions.unsafeAllowedRoots).toEqual([]);
        const human = runMcpDoctor({ repo: repoRoot }).lines.join('\n');
        expect(human).toContain('Allowed roots: ok:');
      } finally {
        rmSync(externalRoot, { recursive: true, force: true });
      }
    });
  });

  test('doctor reports sensitive configured allowed roots as unsafe', () => {
    withTmpRepo((repoRoot, userHome) => {
      const sensitiveRoot = join(repoRoot, 'credentials');
      mkdirSync(sensitiveRoot);
      writeUserConfig(userHome, { permissions: { allowedRoots: [sensitiveRoot] } });

      const doctor = JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]);
      expect(doctor.mcp.permissions.unsafeAllowedRoots).toEqual([resolve(sensitiveRoot)]);
      const human = runMcpDoctor({ repo: repoRoot }).lines.join('\n');
      expect(human).toContain('Unsafe allowed roots:');
    });
  });

  test('doctor reports ready_user for MCP on a non-adopted root', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-user-mcp-root-'));
    const userState = mkdtempSync(join(tmpdir(), 'repo-harness-user-mcp-'));
    const previousHome = process.env.REPO_HARNESS_HOME;
    try {
      process.env.REPO_HARNESS_HOME = userState;
      writeUserConfig(userState);

      const doctor = JSON.parse(runMcpDoctor({ repo: root, json: true }).lines[0]);
      expect(doctor.status).toBe('ready_user');
      expect(doctor.mcp.storageDir).toBe(userState);
      expect(doctor.mcp.permissions.fullDiskRead).toBe(false);
      expect(doctor.mcp.permissions.allowedRootCount).toBe(0);
      expect(doctor.mcp.permissions.registeredRepoCount).toBe(0);
      expect(doctor.mcp.capabilities.workspaceReader).toBe(false);
    } finally {
      if (previousHome === undefined) {
        delete process.env.REPO_HARNESS_HOME;
      } else {
        process.env.REPO_HARNESS_HOME = previousHome;
      }
      rmSync(root, { recursive: true, force: true });
      rmSync(userState, { recursive: true, force: true });
    }
  });

  test('doctor names leftover ChatGPT state and a Codex repo_harness block, and removes nothing', () => {
    withTmpRepo((tmpRoot, userHome) => {
      const hostHome = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-doctor-host-'));
      const previousHome = process.env.HOME;
      try {
        process.env.HOME = hostHome;
        // A space and a single quote: each copied command must stay one shell word per path.
        const repoRoot = join(tmpRoot, "my repo's");
        const oauthStore = join(userHome, 'mcp.oauth.json');
        const handoff = join(repoRoot, '.ai/harness/handoff/chatgpt-plan.md');
        const sessions = join(repoRoot, '.ai/harness/chatgpt/sessions');
        // The base installer linked the host skill into the package asset that #1354 deletes.
        const skill = join(hostHome, '.claude/skills/repo-harness-chatgpt');
        const codexConfig = join(repoRoot, '.codex/config.toml');
        writeFileSync(oauthStore, '{}\n');
        mkdirSync(join(repoRoot, '.ai/harness/handoff'), { recursive: true });
        writeFileSync(handoff, '# plan\n');
        mkdirSync(sessions, { recursive: true });
        mkdirSync(join(hostHome, '.claude/skills'), { recursive: true });
        symlinkSync(join(tmpRoot, 'deleted-package/assets/skills/repo-harness-chatgpt'), skill);
        mkdirSync(join(repoRoot, '.codex'), { recursive: true });
        writeFileSync(codexConfig, '[mcp_servers.repo_harness]\ncommand = "repo-harness"\n');

        const doctor = JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]);
        expect(doctor.findings).toEqual([{
          code: RETIRED_CHATGPT_STATE_FINDING,
          paths: [oauthStore, handoff, sessions, skill, codexConfig],
          remove: [
            `rm -- '${oauthStore}'`,
            `rm -- '${tmpRoot}/my repo'\\''s/.ai/harness/handoff/chatgpt-plan.md'`,
            `rm -r -- '${tmpRoot}/my repo'\\''s/.ai/harness/chatgpt/sessions'`,
            `rm -- '${skill}'`,
            `delete the [mcp_servers.repo_harness] block from ${codexConfig}`,
          ],
        }]);
        expect(runMcpDoctor({ repo: repoRoot }).lines.filter((line) => line.includes(RETIRED_CHATGPT_STATE_FINDING))).toHaveLength(5);
        for (const path of [oauthStore, handoff, sessions, codexConfig]) expect(existsSync(path)).toBe(true);
        expect(lstatSync(skill).isSymbolicLink()).toBe(true);
      } finally {
        if (previousHome === undefined) delete process.env.HOME;
        else process.env.HOME = previousHome;
        rmSync(hostHome, { recursive: true, force: true });
      }
    });
  });
});
