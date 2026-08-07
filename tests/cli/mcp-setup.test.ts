import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import {
  chatgptGuideMarkdown,
  patchCodexConfigToml,
  runMcpDoctor,
  runMcpInstallSkill,
  runMcpMigrateScope,
  runMcpPrintGuide,
  runMcpSetupChatgpt,
  runMcpSetupCodex,
} from '../../src/cli/mcp/setup';
import { createMcpToolContext } from '../../src/cli/mcp/server';
import { callMcpTool } from '../../src/cli/mcp/tools';
import { repoHarnessPackageVersion } from '../../src/cli/mcp/version';
import { assertChatGptMcpContract } from '../helpers/chatgpt-mcp-contract';
import {
  readRegisteredRepoHarnessRepos,
  repoHarnessAuthorizationRevision,
  setRepoHarnessAccessMode,
} from '../../src/effects/repo-registry';

const CLI = join(import.meta.dir, '../..', 'src/cli/index.ts');

function withTmpRepo<T>(fn: (repoRoot: string, userHome: string) => T): T {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-setup-'));
  const repoHarnessHome = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-setup-home-'));
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
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-setup-'));
  const repoHarnessHome = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-setup-home-'));
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

/** Materialize the retired repo-scope layout a pre-migration install would have. */
function writeLegacyRepoScopeMcpState(repoRoot: string, overrides: Record<string, unknown> = {}): {
  config: string;
  tokens: string;
  oauth: string;
  oauthTokens: string;
  bearerToken: string;
  passphrase: string;
} {
  const dir = join(repoRoot, '.repo-harness');
  mkdirSync(dir, { recursive: true });
  const paths = {
    config: join(dir, 'mcp.local.json'),
    tokens: join(dir, 'mcp.tokens.json'),
    oauth: join(dir, 'mcp.oauth.json'),
    oauthTokens: join(dir, 'mcp.oauth-tokens.json'),
    bearerToken: 'legacy-repo-scope-bearer-token-value',
    passphrase: 'legacy-repo-scope-passphrase-value',
  };
  writeFileSync(paths.config, `${JSON.stringify({
    version: 3,
    scope: 'repo',
    repo: repoRoot,
    server: { host: '0.0.0.0', port: 9911, transport: 'http' },
    auth: { mode: 'oauth', oauthFile: '.repo-harness/mcp.oauth.json', tokenFile: '.repo-harness/mcp.tokens.json' },
    chatgpt: { serverName: 'legacy-repo-connector', endpoint: 'https://legacy-repo.example.com/mcp' },
    permissions: { allowedRoots: [], discoveryRoots: [], fullDiskRead: false },
    profile: 'planner',
    ...overrides,
  }, null, 2)}\n`);
  writeFileSync(paths.tokens, `${JSON.stringify({ version: 1, bearerToken: paths.bearerToken }, null, 2)}\n`);
  writeFileSync(paths.oauth, `${JSON.stringify({ version: 1, passphrase: paths.passphrase }, null, 2)}\n`);
  writeFileSync(paths.oauthTokens, `${JSON.stringify({ version: 1, authorizations: {} }, null, 2)}\n`);
  return paths;
}

describe('mcp setup', () => {
  test('stores ChatGPT config and credentials only under user-level storage', () => {
    withTmpRepo((repoRoot, userHome) => {
      const result = runMcpSetupChatgpt({ repo: repoRoot });
      expect(result.changed.length).toBeGreaterThan(0);
      expect(existsSync(join(userHome, 'mcp.local.json'))).toBe(true);
      expect(existsSync(join(userHome, 'mcp.tokens.json'))).toBe(true);
      expect(existsSync(join(userHome, 'mcp.oauth.json'))).toBe(true);
      // Retired repo scope: setup writes nothing into the repo working tree.
      expect(existsSync(join(repoRoot, '.repo-harness'))).toBe(false);
      expect(existsSync(join(repoRoot, '.gitignore'))).toBe(false);
      expect(existsSync(join(repoRoot, 'docs/repo-harness-chatgpt-mcp-setup.md'))).toBe(false);
      const config = JSON.parse(readFileSync(join(userHome, 'mcp.local.json'), 'utf-8'));
      expect(config.scope).toBeUndefined();
      expect(config.auth).toMatchObject({ mode: 'oauth' });
      expect(config.auth.oauthFile).toContain('mcp.oauth.json');
      expect(config.auth.tokenFile).toContain('mcp.tokens.json');
      expect(config.auth.oauthFile.startsWith('.repo-harness/')).toBe(false);
      expect(config.auth.tokenFile.startsWith('.repo-harness/')).toBe(false);
      expect(config.chatgpt.serverName).toBe('repo-harness');
      expect(config.devMode).toMatchObject({
        agentRunner: false,
        allowedAgents: ['codex'],
        timeoutMs: 120000,
      });
      expect(config.rollout).toBeUndefined();
      const token = JSON.parse(readFileSync(join(userHome, 'mcp.tokens.json'), 'utf-8')).bearerToken;
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(30);
      const passphrase = JSON.parse(readFileSync(join(userHome, 'mcp.oauth.json'), 'utf-8')).passphrase;
      expect(typeof passphrase).toBe('string');
      expect(passphrase.length).toBeGreaterThan(20);

      const doctor = JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]);
      expect(doctor.mcp.packageVersion).toBe(repoHarnessPackageVersion());
      expect(doctor.mcp.authConfigured).toBe(true);
      expect(doctor.mcp.storageDir).toBe(userHome);
      expect(doctor.mcp.configScope).toBeUndefined();
      expect(doctor.mcp.permissions.configurationScope).toBeUndefined();
      expect(doctor.mcp.devMode.agentRunner).toBe(false);
      expect(doctor.chatgpt.serverName).toBe('repo-harness');
      expect(doctor.chatgpt.localEndpoint).toBe('http://127.0.0.1:8765/mcp');
      expect(doctor.chatgpt.invocationVerification).toMatchObject({
        status: 'manual_required',
        checkableByDoctor: false,
        scope: 'per_chat_model_surface',
      });
      expect(doctor.chatgpt.invocationVerification.acceptedEvidence).toEqual([
        'called_tool_event',
        'captured_tool_call_transcript',
      ]);
      const humanDoctor = runMcpDoctor({ repo: repoRoot }).lines.join('\n');
      expect(humanDoctor).toContain(`[repo-harness mcp] Package version: ${repoHarnessPackageVersion()}`);
      expect(humanDoctor).toContain('ChatGPT tool invocation: manual verification required');
    });
  });

  test('records and preserves the ChatGPT MCP server name in ignored local config', () => {
    withTmpRepo((repoRoot, userHome) => {
      const setup = runMcpSetupChatgpt({ repo: repoRoot, serverName: 'team-review-mcp' });
      expect(setup.lines.join('\n')).toContain('ChatGPT MCP server name: team-review-mcp');

      let config = JSON.parse(readFileSync(join(userHome, 'mcp.local.json'), 'utf-8'));
      expect(config.chatgpt.serverName).toBe('team-review-mcp');

      runMcpSetupChatgpt({ repo: repoRoot, endpoint: 'https://repo-harness-mcp.example.com/mcp' });
      config = JSON.parse(readFileSync(join(userHome, 'mcp.local.json'), 'utf-8'));
      expect(config.chatgpt.serverName).toBe('team-review-mcp');
      expect(config.chatgpt.endpoint).toBe('https://repo-harness-mcp.example.com/mcp');

      runMcpSetupChatgpt({ repo: repoRoot });
      config = JSON.parse(readFileSync(join(userHome, 'mcp.local.json'), 'utf-8'));
      expect(config.chatgpt.serverName).toBe('team-review-mcp');
      expect(config.chatgpt.endpoint).toBe('https://repo-harness-mcp.example.com/mcp');

      const doctor = JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]);
      expect(doctor.chatgpt.serverName).toBe('team-review-mcp');
      expect(doctor.chatgpt.serverNameConfigured).toBe(true);
    });
  });

  test('ignores and removes retired general-repo rollout config on setup', () => {
    withTmpRepo((repoRoot, userHome) => {
      runMcpSetupChatgpt({ repo: repoRoot });
      const configPath = join(userHome, 'mcp.local.json');
      const staleConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      staleConfig.rollout = {
        generalRepo: {
          general_repo_read: false,
          repo_write: false,
          fs_fallback: false,
          shadow_compare: true,
          canary_repos: ['repo_stale'],
          rollback_to_legacy_tools: true,
        },
      };
      writeFileSync(configPath, `${JSON.stringify(staleConfig, null, 2)}\n`);

      const context = createMcpToolContext({ repo: repoRoot, profile: 'planner' });
      expect(context.policy).not.toHaveProperty('generalRepo');

      runMcpSetupChatgpt({ repo: repoRoot });
      const cleanedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(cleanedConfig.rollout).toBeUndefined();
    });
  });

  test('fails closed when local MCP config cannot be parsed', () => {
    withTmpRepo((repoRoot, userHome) => {
      runMcpSetupChatgpt({ repo: repoRoot });
      const configPath = join(userHome, 'mcp.local.json');
      writeFileSync(configPath, '{not-json\n');

      expect(() => createMcpToolContext({ repo: repoRoot, profile: 'planner' })).toThrow(
        'invalid MCP local config',
      );
    });
  });

  test('ChatGPT setup stores MCP state under the OS user and authorizes current-repo reader access', () => {
    withTmpRepo((repoRoot, userHome) => {
      const setup = runMcpSetupChatgpt({
        repo: repoRoot,
        serverName: 'team-review-mcp',
        endpoint: 'https://repo-harness-mcp.example.com/mcp',
      });
      expect(setup.lines.join('\n')).toContain(`Storage: ${userHome}`);
      expect(setup.lines.join('\n')).toContain('Reader capability: enabled');
      expect(setup.lines.join('\n')).toContain('Registered repo:');
      expect(setup.lines.join('\n')).toContain('--profile planner');
      expect(existsSync(join(userHome, 'mcp.local.json'))).toBe(true);
      expect(existsSync(join(userHome, 'mcp.tokens.json'))).toBe(true);
      expect(existsSync(join(userHome, 'mcp.oauth.json'))).toBe(true);
      expect(existsSync(join(userHome, 'registered-repos.json'))).toBe(true);
      expect(existsSync(join(repoRoot, 'docs/repo-harness-chatgpt-mcp-setup.md'))).toBe(false);

      const config = JSON.parse(readFileSync(join(userHome, 'mcp.local.json'), 'utf-8'));
      expect(config).toMatchObject({
        repo: repoRoot,
        chatgpt: {
          serverName: 'team-review-mcp',
          endpoint: 'https://repo-harness-mcp.example.com/mcp',
        },
        capabilities: { workspaceReader: true, workflowPlanner: true },
        permissions: { fullDiskRead: false, allowedRoots: [], discoveryRoots: [] },
        profile: 'planner',
      });
      expect(config.scope).toBeUndefined();
      const registry = JSON.parse(readFileSync(join(userHome, 'registered-repos.json'), 'utf-8'));
      expect(registry.repos).toEqual([
        expect.objectContaining({ path: realpathSync(repoRoot), source: 'mcp-setup' }),
      ]);
      expect(config.auth.oauthFile).toContain('mcp.oauth.json');
      expect(config.auth.tokenFile).toContain('mcp.tokens.json');

      const doctor = JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]);
      expect(doctor.status).toBe('ready_local');
      expect(doctor.mcp.storageDir).toBe(userHome);
      expect(doctor.mcp.localConfig).toBe(true);
      expect(doctor.mcp.authConfigured).toBe(true);
      expect(doctor.mcp.permissions.fullDiskRead).toBe(false);
      expect(doctor.mcp.permissions.allowedRootCount).toBe(0);
      expect(doctor.mcp.permissions.registeredRepoCount).toBe(1);
      expect(doctor.mcp.capabilities.workspaceReader).toBe(true);
      expect(doctor.codex.configured).toBe(false);
      expect(doctor.chatgpt.serverName).toBe('team-review-mcp');

      const ctx = createMcpToolContext({ repo: repoRoot, profile: 'planner' });
      expect(ctx.policy.allowAbsoluteRead).toBe(false);
      expect(ctx.policy.capabilities.workspaceReader).toBe(true);
      expect(ctx.policy.allowedRoots).toEqual([realpathSync(repoRoot)]);
      expect(ctx.policy.denyGlobs).toContain('.env');
    });
  });

  test('MCP command entrypoints fail closed on legacy repo-scope config and name the migration', () => {
    withTmpRepo((repoRoot, userHome) => {
      const legacy = writeLegacyRepoScopeMcpState(repoRoot);
      const expectedError = 'repo-harness mcp migrate-scope';

      for (const action of [
        () => runMcpSetupChatgpt({ repo: repoRoot }),
        () => runMcpDoctor({ repo: repoRoot, json: true }),
        () => createMcpToolContext({ repo: repoRoot, profile: 'planner' }),
      ]) {
        expect(action).toThrow(expectedError);
        expect(action).toThrow('legacy repo-scope MCP config detected');
      }

      // No silent read-through: the legacy files stay untouched until the
      // operator runs the explicit migration.
      expect(existsSync(legacy.config)).toBe(true);
      expect(existsSync(legacy.tokens)).toBe(true);

      const cli = spawnSync(
        process.execPath,
        [CLI, 'mcp', 'doctor', '--repo', repoRoot],
        { encoding: 'utf-8', env: { ...process.env, REPO_HARNESS_HOME: userHome } },
      );
      expect(cli.status).toBe(2);
      expect(cli.stderr).toContain('repo-harness mcp migrate-scope');
    });
  });

  test('migrate-scope merges non-secret config, rotates credentials, and is idempotent', () => {
    withTmpRepo((repoRoot, userHome) => {
      const legacy = writeLegacyRepoScopeMcpState(repoRoot);

      const migrated = runMcpMigrateScope({ repo: repoRoot });
      const output = migrated.lines.join('\n');
      expect(migrated.migrated).toBe(true);

      // Non-secret fields land in the surviving user config.
      const config = JSON.parse(readFileSync(join(userHome, 'mcp.local.json'), 'utf-8'));
      expect(config).toMatchObject({
        version: 3,
        server: { host: '0.0.0.0', port: 9911 },
        chatgpt: { serverName: 'legacy-repo-connector', endpoint: 'https://legacy-repo.example.com/mcp' },
        profile: 'planner',
      });
      expect(config.scope).toBeUndefined();

      // Credentials are rotated, never relocated.
      const token = JSON.parse(readFileSync(join(userHome, 'mcp.tokens.json'), 'utf-8')).bearerToken;
      const passphrase = JSON.parse(readFileSync(join(userHome, 'mcp.oauth.json'), 'utf-8')).passphrase;
      expect(token).not.toBe(legacy.bearerToken);
      expect(passphrase).not.toBe(legacy.passphrase);
      expect(token.length).toBeGreaterThan(30);
      expect(passphrase.length).toBeGreaterThan(20);

      // Legacy files, including the OAuth token store, are gone.
      expect(existsSync(legacy.config)).toBe(false);
      expect(existsSync(legacy.tokens)).toBe(false);
      expect(existsSync(legacy.oauth)).toBe(false);
      expect(existsSync(legacy.oauthTokens)).toBe(false);

      // Inventory output names what moved, what rotated, and what was voided.
      expect(output).toContain('Migrated config fields: server.host, server.port, chatgpt.serverName, chatgpt.endpoint');
      expect(output).toContain('Rotated bearer token:');
      expect(output).toContain('Rotated OAuth passphrase:');
      expect(output).toContain('ChatGPT must re-authorize once');
      expect(output).toContain('Removed legacy files:');
      expect(output).toContain(legacy.oauthTokens);

      // The gate is satisfied afterwards.
      expect(() => runMcpDoctor({ repo: repoRoot, json: true })).not.toThrow();

      // Re-running on a migrated repo reports nothing to do and changes nothing.
      const rerun = runMcpMigrateScope({ repo: repoRoot });
      expect(rerun.migrated).toBe(false);
      expect(rerun.changed).toEqual([]);
      expect(rerun.lines.join('\n')).toContain('Nothing to migrate');
      expect(JSON.parse(readFileSync(join(userHome, 'mcp.tokens.json'), 'utf-8')).bearerToken).toBe(token);
      expect(JSON.parse(readFileSync(join(userHome, 'mcp.oauth.json'), 'utf-8')).passphrase).toBe(passphrase);
    });
  });

  test('migrate-scope keeps existing user-level values and never adopts legacy secrets', () => {
    withTmpRepo((repoRoot, userHome) => {
      runMcpSetupChatgpt({ repo: repoRoot, serverName: 'existing-user-connector' });
      const userToken = JSON.parse(readFileSync(join(userHome, 'mcp.tokens.json'), 'utf-8')).bearerToken;
      const userPassphrase = JSON.parse(readFileSync(join(userHome, 'mcp.oauth.json'), 'utf-8')).passphrase;
      const legacy = writeLegacyRepoScopeMcpState(repoRoot);

      const migrated = runMcpMigrateScope({ repo: repoRoot });
      expect(migrated.migrated).toBe(true);

      const config = JSON.parse(readFileSync(join(userHome, 'mcp.local.json'), 'utf-8'));
      expect(config.chatgpt.serverName).toBe('existing-user-connector');
      expect(config.server.host).toBe('127.0.0.1');
      // Only the value the user config lacked is inherited from the legacy file.
      expect(config.chatgpt.endpoint).toBe('https://legacy-repo.example.com/mcp');
      expect(migrated.lines.join('\n')).toContain('Migrated config fields: chatgpt.endpoint');

      // An existing user-level install keeps its own credentials; the legacy
      // values are discarded rather than adopted.
      const token = JSON.parse(readFileSync(join(userHome, 'mcp.tokens.json'), 'utf-8')).bearerToken;
      const passphrase = JSON.parse(readFileSync(join(userHome, 'mcp.oauth.json'), 'utf-8')).passphrase;
      expect(token).toBe(userToken);
      expect(passphrase).toBe(userPassphrase);
      expect(token).not.toBe(legacy.bearerToken);
      expect(passphrase).not.toBe(legacy.passphrase);
      expect(existsSync(legacy.oauthTokens)).toBe(false);
    });
  });

  test('harness_doctor and runMcpDoctor agree on mcp.localConfig from the single storage authority', async () => {
    // Both doctor surfaces must read the same authority. The MCP tool used to
    // probe <repo>/.repo-harness/mcp.local.json, which reported false for a
    // correct user-level install and true for an unmigrated legacy repo.
    const harnessDoctorLocalConfig = async (repoRoot: string): Promise<boolean> => {
      const ctx = createMcpToolContext({ repo: repoRoot, profile: 'planner' });
      const result = await callMcpTool(ctx, 'harness_doctor', {});
      return JSON.parse(result.content[0].text).mcp.localConfig;
    };

    // No user-level config yet: both report false.
    await withTmpRepoAsync(async (repoRoot) => {
      expect(JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]).mcp.localConfig).toBe(false);
      expect(await harnessDoctorLocalConfig(repoRoot)).toBe(false);
    });

    // After user-level setup: both report true.
    await withTmpRepoAsync(async (repoRoot) => {
      runMcpSetupChatgpt({ repo: repoRoot });
      expect(JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]).mcp.localConfig).toBe(true);
      expect(await harnessDoctorLocalConfig(repoRoot)).toBe(true);
    });

    // A legacy repo-scope file in the target repo must not fabricate a true.
    // The context is built while the repo is clean (the startup gate has
    // already run), then the legacy files appear underneath it.
    await withTmpRepoAsync(async (repoRoot) => {
      const ctx = createMcpToolContext({ repo: repoRoot, profile: 'planner' });
      writeLegacyRepoScopeMcpState(repoRoot);
      const payload = JSON.parse((await callMcpTool(ctx, 'harness_doctor', {})).content[0].text);
      expect(payload.mcp.localConfig).toBe(false);
    });
  });

  test('migrate-scope refuses a legacy config that claims the coding profile', () => {
    withTmpRepo((repoRoot) => {
      const legacy = writeLegacyRepoScopeMcpState(repoRoot, { profile: 'coding' });
      expect(() => runMcpMigrateScope({ repo: repoRoot })).toThrow('coding profile was never valid in repo scope');
      expect(existsSync(legacy.config)).toBe(true);
    });
  });

  test('full-disk read setup flag is deprecated and rejected', () => {
    withTmpRepo((repoRoot) => {
      expect(() => runMcpSetupChatgpt({ repo: repoRoot, allowFullDiskRead: true })).toThrow(
        '--allow-full-disk-read is deprecated',
      );
    });
  });

  test('rejects explicit allowed roots that target sensitive directories', () => {
    withTmpRepo((repoRoot) => {
      for (const relativeRoot of ['.ssh', '.cache', 'node_modules/pkg', 'private/subdir']) {
        const sensitiveRoot = join(repoRoot, ...relativeRoot.split('/'));
        mkdirSync(sensitiveRoot, { recursive: true });
        expect(() => runMcpSetupChatgpt({ repo: repoRoot, allowRoot: [sensitiveRoot] })).toThrow(
          '--allow-root points at a sensitive directory denied by MCP policy',
        );
      }
    });
  });

  test('server context rejects configured allowed roots that rebase denied directory globs', () => {
    withTmpRepo((repoRoot) => {
      const sensitiveRoot = join(repoRoot, 'node_modules/pkg');
      mkdirSync(sensitiveRoot, { recursive: true });
      expect(() => createMcpToolContext({ repo: repoRoot, enableReader: true, allowedRoots: [sensitiveRoot] })).toThrow(
        'MCP allowed root is denied by policy',
      );
    });
  });

  test('doctor reports config version and explicit allowed-root diagnostics', () => {
    withTmpRepo((repoRoot) => {
      const externalRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-allowed-root-'));
      try {
        runMcpSetupChatgpt({
          repo: repoRoot,
          allowRoot: [externalRoot],
          endpoint: 'https://repo-harness-mcp.example.com/mcp',
        });
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
        expect(doctor.chatgpt.publicEndpointConfigured).toBe(true);
        expect(doctor.chatgpt.healthExpectations).toMatchObject({
          offlineAccessDiscovery: true,
          mcpDeleteSupported: true,
        });
        const human = runMcpDoctor({ repo: repoRoot }).lines.join('\n');
        expect(human).toContain('Allowed roots: ok:');
      } finally {
        rmSync(externalRoot, { recursive: true, force: true });
      }
    });
  });

  test('coding setup requires an explicit grant and fails closed after permission downgrade', () => {
    withTmpRepo((repoRoot, userHome) => {
      expect(() => runMcpSetupChatgpt({ repo: repoRoot, profile: 'coding' }))
        .toThrow('requires at least one explicit --grant-read-write');
      expect(() => runMcpSetupChatgpt({ repo: repoRoot, profile: 'CODING' }))
        .toThrow('invalid MCP profile');

      const setup = runMcpSetupChatgpt({
        repo: repoRoot,
        profile: 'coding',
        grantReadWrite: [repoRoot],
        endpoint: 'https://coding.example.com/mcp',
      });
      expect(setup.lines.join('\n')).toContain('Profile: coding');
      const config = JSON.parse(readFileSync(join(userHome, 'mcp.local.json'), 'utf-8'));
      expect(config).toMatchObject({
        version: 3,
        profile: 'coding',
        capabilities: { workspaceReader: false, workflowPlanner: true, workspaceCoder: true },
        coding: { enabled: true, environmentAllowlist: [] },
      });
      expect(config.scope).toBeUndefined();
      expect(config.authorizationRevision).toBe(1);
      expect(readRegisteredRepoHarnessRepos({ adoptedOnly: true })[0]).toMatchObject({ accessMode: 'read_write' });
      const ctx = createMcpToolContext({ repo: repoRoot, profile: 'coding' });
      expect(ctx.policy.profile).toBe('coding');
      expect(ctx.codingWorkspaceManager).toBeDefined();
      expect(ctx.processManager).toBeDefined();

      const downgraded = setRepoHarnessAccessMode(repoRoot, 'read_only');
      expect(downgraded.authorizationRevision).toBe(2);
      expect(() => createMcpToolContext({ repo: repoRoot, profile: 'coding' })).toThrow('explicit read_write grant');

      expect(setRepoHarnessAccessMode(repoRoot, 'read_write').authorizationRevision).toBe(3);
      expect(() => createMcpToolContext({ repo: repoRoot, profile: 'coding' })).toThrow('authorization revision is stale');
      runMcpSetupChatgpt({ repo: repoRoot, profile: 'planner' });
      const disabled = JSON.parse(readFileSync(join(userHome, 'mcp.local.json'), 'utf-8'));
      expect(disabled).toMatchObject({ profile: 'planner', coding: { enabled: false } });
      expect(disabled.authorizationRevision).toBe(4);
      expect(() => createMcpToolContext({ repo: repoRoot, profile: 'coding' })).toThrow('coding MCP is disabled');
    });
  });

  test('coding setup validation failure leaves repo authorization unchanged', () => {
    withTmpRepo((repoRoot) => {
      expect(readRegisteredRepoHarnessRepos()).toEqual([]);
      expect(repoHarnessAuthorizationRevision()).toBe(0);

      expect(() => runMcpSetupChatgpt({
        repo: repoRoot,
        profile: 'coding',
        grantReadWrite: [repoRoot],
        endpoint: 'http://not-public.example/mcp',
      })).toThrow('expected a public HTTPS URL');

      expect(readRegisteredRepoHarnessRepos()).toEqual([]);
      expect(repoHarnessAuthorizationRevision()).toBe(0);
    });
  });

  test('coding setup preflights every grant and server name before authorization', () => {
    for (const failure of ['server-name', 'mixed-grants'] as const) {
      withTmpRepo((repoRoot) => {
        const nonAdopted = mkdtempSync(join(tmpdir(), 'repo-harness-non-adopted-grant-'));
        try {
          const action = failure === 'server-name'
            ? () => runMcpSetupChatgpt({
                repo: repoRoot,
                profile: 'coding',
                grantReadWrite: [repoRoot],
                serverName: 'bad/name',
              })
            : () => runMcpSetupChatgpt({
                repo: repoRoot,
                profile: 'coding',
                grantReadWrite: [repoRoot, nonAdopted],
              });
          expect(action).toThrow();
          expect(readRegisteredRepoHarnessRepos()).toEqual([]);
          expect(repoHarnessAuthorizationRevision()).toBe(0);
        } finally {
          rmSync(nonAdopted, { recursive: true, force: true });
        }
      });
    }
  });

  test('rerunning setup atomically migrates v1 and v2 local config to v3', () => {
    for (const version of [1, 2] as const) {
      withTmpRepo((repoRoot, userHome) => {
        const configPath = join(userHome, 'mcp.local.json');
        mkdirSync(userHome, { recursive: true });
        writeFileSync(configPath, `${JSON.stringify({
          version,
          repo: repoRoot,
          server: { host: '127.0.0.1', port: 8877, transport: 'http' },
          auth: { mode: 'oauth' },
          chatgpt: { serverName: `legacy-v${version}`, endpoint: 'https://legacy.example.com/mcp' },
          capabilities: version === 1 ? { reader: true } : { workspaceReader: true },
          profile: 'planner',
        }, null, 2)}\n`);
        runMcpSetupChatgpt({ repo: repoRoot });
        const migrated = JSON.parse(readFileSync(configPath, 'utf-8'));
        expect(migrated).toMatchObject({
          version: 3,
          server: { port: 8877 },
          chatgpt: { serverName: `legacy-v${version}`, endpoint: 'https://legacy.example.com/mcp' },
          profile: 'planner',
        });
        expect(migrated.capabilities.reader).toBeUndefined();
        expect(migrated.capabilities.workspaceReader).toBe(true);
      });
    }
  });

  // Replaces the retired scope-precedence rule: a legacy repo-scope config no
  // longer loses to an active user config, it blocks the command outright.
  test('legacy repo-scope config blocks an otherwise working coding setup until migrated', () => {
    withTmpRepo((repoRoot) => {
      runMcpSetupChatgpt({
        repo: repoRoot,
        profile: 'coding',
        grantReadWrite: [repoRoot],
        endpoint: 'https://coding.example.com/mcp',
      });
      expect(createMcpToolContext({ repo: repoRoot, profile: 'coding' }).policy.profile).toBe('coding');

      writeLegacyRepoScopeMcpState(repoRoot);
      expect(() => createMcpToolContext({ repo: repoRoot, profile: 'coding' }))
        .toThrow('repo-harness mcp migrate-scope');

      runMcpMigrateScope({ repo: repoRoot });
      const ctx = createMcpToolContext({ repo: repoRoot, profile: 'coding' });
      expect(ctx.policy.profile).toBe('coding');
      expect(ctx.policy.capabilities.workspaceCoder).toBe(true);
    });
  });

  test('doctor reports sensitive configured allowed roots as unsafe', () => {
    withTmpRepo((repoRoot, userHome) => {
      runMcpSetupChatgpt({ repo: repoRoot });
      const sensitiveRoot = join(repoRoot, 'credentials');
      mkdirSync(sensitiveRoot);
      const configPath = join(userHome, 'mcp.local.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      config.permissions.allowedRoots = [sensitiveRoot];
      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

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
      runMcpSetupChatgpt({
        repo: root,
        serverName: 'team-review-mcp',
      });

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

  test('mcp doctor does not mask a missing recorded ChatGPT server name', () => {
    withTmpRepo((repoRoot, userHome) => {
      mkdirSync(userHome, { recursive: true });
      writeFileSync(join(userHome, 'mcp.local.json'), `${JSON.stringify({
        version: 1,
        repo: repoRoot,
        server: { host: '127.0.0.1', port: 8765, transport: 'http' },
        auth: { mode: 'oauth', oauthFile: 'mcp.oauth.json', tokenFile: 'mcp.tokens.json' },
        chatgpt: { endpoint: 'https://repo-harness-mcp.example.com/mcp' },
        profile: 'planner',
      }, null, 2)}\n`);

      const doctor = JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]);
      expect(doctor.chatgpt.serverName).toBeUndefined();
      expect(doctor.chatgpt.serverNameConfigured).toBe(false);
      expect(doctor.chatgpt.defaultServerName).toBe('repo-harness');
      expect(doctor.chatgpt.publicEndpoint).toBe('https://repo-harness-mcp.example.com/mcp');
      expect(runMcpDoctor({ repo: repoRoot }).lines.join('\n')).toContain('ChatGPT MCP server name: missing');
    });
  });

  test('server-name-only ChatGPT setup preserves existing endpoint and operator settings', () => {
    withTmpRepo((repoRoot, userHome) => {
      mkdirSync(userHome, { recursive: true });
      writeFileSync(join(userHome, 'mcp.local.json'), `${JSON.stringify({
        version: 1,
        repo: repoRoot,
        server: { host: '0.0.0.0', port: 9876, transport: 'http' },
        auth: { mode: 'bearer', tokenFile: 'custom.tokens.json' },
        chatgpt: { endpoint: 'https://repo-harness-mcp.example.com/mcp' },
        profile: 'orchestrator',
        devMode: {
          agentRunner: true,
          allowedAgents: ['codex', 'claude'],
          timeoutMs: 300000,
        },
      }, null, 2)}\n`);

      runMcpSetupChatgpt({ repo: repoRoot, serverName: 'team-review-mcp' });
      const config = JSON.parse(readFileSync(join(userHome, 'mcp.local.json'), 'utf-8'));
      expect(config.server).toMatchObject({ host: '0.0.0.0', port: 9876, transport: 'http' });
      expect(config.auth).toMatchObject({ mode: 'bearer' });
      expect(config.chatgpt).toMatchObject({
        serverName: 'team-review-mcp',
        endpoint: 'https://repo-harness-mcp.example.com/mcp',
      });
      expect(config.profile).toBe('orchestrator');
      expect(config.devMode).toMatchObject({
        agentRunner: true,
        allowedAgents: ['codex', 'claude'],
        timeoutMs: 300000,
      });
    });
  });

  test('server-name-only ChatGPT CLI setup preserves existing bind host and port', () => {
    withTmpRepo((repoRoot, userHome) => {
      mkdirSync(userHome, { recursive: true });
      writeFileSync(join(userHome, 'mcp.local.json'), `${JSON.stringify({
        version: 1,
        repo: repoRoot,
        server: { host: '0.0.0.0', port: 9876, transport: 'http' },
        auth: { mode: 'bearer', tokenFile: 'custom.tokens.json' },
        chatgpt: { endpoint: 'https://repo-harness-mcp.example.com/mcp' },
        profile: 'orchestrator',
        devMode: {
          agentRunner: true,
          allowedAgents: ['codex', 'claude'],
          timeoutMs: 300000,
        },
      }, null, 2)}\n`);

      // The child must inherit the isolated storage root explicitly; storage is
      // user-level now, so an unset REPO_HARNESS_HOME would write to the real
      // operator home.
      const result = spawnSync(
        process.execPath,
        [CLI, 'mcp', 'setup', 'chatgpt', '--repo', repoRoot, '--server-name', 'team-review-mcp'],
        { encoding: 'utf-8', env: { ...process.env, REPO_HARNESS_HOME: userHome } },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('ChatGPT MCP server name: team-review-mcp');
      expect(result.stdout).toContain('Local endpoint: http://0.0.0.0:9876/mcp');

      const config = JSON.parse(readFileSync(join(userHome, 'mcp.local.json'), 'utf-8'));
      expect(config.server).toMatchObject({ host: '0.0.0.0', port: 9876, transport: 'http' });
      expect(config.chatgpt).toMatchObject({
        serverName: 'team-review-mcp',
        endpoint: 'https://repo-harness-mcp.example.com/mcp',
      });
    });
  }, 30_000);

  test('stores a stable ChatGPT endpoint in ignored local config and keeps the tracked guide generic', () => {
    withTmpRepo((repoRoot, userHome) => {
      runMcpSetupChatgpt({ repo: repoRoot, endpoint: 'https://repo-harness-mcp.example.com/mcp' });

      const config = JSON.parse(readFileSync(join(userHome, 'mcp.local.json'), 'utf-8'));
      expect(config.chatgpt.endpoint).toBe('https://repo-harness-mcp.example.com/mcp');

      // The guide is a separate, explicitly written doc; setup no longer emits it.
      runMcpPrintGuide({ repo: repoRoot, write: true });
      const guide = readFileSync(join(repoRoot, 'docs/repo-harness-chatgpt-mcp-setup.md'), 'utf-8');
      expect(guide).not.toContain('https://repo-harness-mcp.example.com/mcp');
      expect(guide).toContain('<https-tunnel-url>/mcp');
      expect(guide).toContain('Quick tunnels are useful for one-off smoke tests');
      expect(guide).toContain('tracked guide stays placeholder-only');
      expect(guide).toContain('chatgpt.serverName');

      const doctor = JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]);
      expect(doctor.chatgpt.publicEndpoint).toBe('https://repo-harness-mcp.example.com/mcp');
    });
  });

  test('rejects unstable ChatGPT endpoint values', () => {
    withTmpRepo((repoRoot) => {
      for (const endpoint of [
        'http://example.com/mcp',
        'https://example.com/not-mcp',
        'https://example.com/foo/mcp',
        'https://localhost/mcp',
        'https://127.0.0.1/mcp',
        'https://10.0.0.1/mcp',
        'https://172.16.0.1/mcp',
        'https://192.168.1.1/mcp',
        'https://169.254.1.1/mcp',
        'https://[::1]/mcp',
        'https://[fc00::1]/mcp',
        'https://user:pass@example.com/mcp',
        'https://example.com/mcp?token=secret',
        'https://example.com/mcp#fragment',
      ]) {
        expect(() => runMcpSetupChatgpt({ repo: repoRoot, endpoint })).toThrow(
          'expected a public HTTPS URL exactly ending in /mcp with no username, password, query, or fragment',
        );
      }
    });
  });

  test('rejects unsafe ChatGPT MCP server names', () => {
    withTmpRepo((repoRoot) => {
      for (const serverName of ['', 'bad/name', 'bad\nname', '`bad`', 'x'.repeat(81)]) {
        expect(() => runMcpSetupChatgpt({ repo: repoRoot, serverName })).toThrow(
          'expected a ChatGPT MCP server name',
        );
      }
    });
  });

  test('print guide write mode keeps tracked docs generic while reporting the session endpoint', () => {
    withTmpRepo((repoRoot) => {
      const result = runMcpPrintGuide({
        repo: repoRoot,
        endpoint: 'https://repo-harness-mcp.example.com/mcp',
        write: true,
      });

      const guide = readFileSync(join(repoRoot, 'docs/repo-harness-chatgpt-mcp-setup.md'), 'utf-8');
      expect(guide).toContain('<https-tunnel-url>/mcp');
      expect(guide).not.toContain('https://repo-harness-mcp.example.com/mcp');
      expect(result.lines.join('\n')).toContain('https://repo-harness-mcp.example.com/mcp');
    });
  });

  test('ChatGPT guide uses OAuth for ChatGPT and documents bearer fallback', () => {
    const guide = chatgptGuideMarkdown('https://example.test/mcp');
    expect(guide).toContain('Configure Connector authentication as OAuth');
    // Single storage authority: the guide describes only the user-level shape
    // plus the one-shot migration off the retired repo scope.
    expect(guide).toContain('~/.repo-harness/mcp.oauth.json');
    expect(guide).toContain('REPO_HARNESS_HOME');
    expect(guide).toContain('repo-harness mcp migrate-scope');
    expect(guide).not.toContain('--scope user');
    expect(guide).not.toContain('jq -r .passphrase .repo-harness/mcp.oauth.json');
    expect(guide).toContain('oauth-protected-resource');
    expect(guide).toContain('--auth bearer');
    expect(guide).toContain('--auth url-token');
    expect(guide).toContain('repo_manifest');
    expect(guide).toContain('read_file');
    expect(guide).toContain('get_repo_capabilities');
    expect(guide).toContain('--allow-root "$HOME/Documents"');
    expect(guide).toContain('rescan the Connector tools');
    expect(guide).toContain('delete and recreate the App/Connector');
    expect(guide).toContain('## Reader Test Prompt');
    expect(guide).toContain('Blocked-file smoke');
    expect(guide).toContain('../outside');
    expect(guide).toContain('SYMLINK_ESCAPE');
    expect(guide).toContain('deny globs');
    expect(guide).toContain('## Dev Mode Agent Runner');
    expect(guide).toContain('--enable-dev-runner');
    expect(guide).toContain('run_agent_goal');
    expect(guide).toContain('https://example.test/mcp');
    expect(guide).toContain('cloudflared tunnel create repo-harness-mcp');
    expect(guide).toContain('quick tunnel');
    expect(guide).toContain('chatgpt.serverName');
    expect(guide).toContain('right-side process pane');
    expect(guide).toContain('Called tool');
    expect(guide).toContain('sandbox/process flow');
    expect(guide).toContain('15 minutes or');
    expect(guide).toContain('do not treat elapsed time as');
    expect(guide).toContain('no thinking status detected yet');
    assertChatGptMcpContract(guide);
  });

  test('patches Codex config while preserving unrelated content', () => {
    const patched = patchCodexConfigToml('[profiles.default]\nmodel = "gpt-5"\n');
    expect(patched).toContain('[profiles.default]');
    expect(patched).toContain('[mcp_servers.repo_harness]');
    expect(patched).toContain('"mcp"');

    withTmpRepo((repoRoot) => {
      mkdirSync(join(repoRoot, '.codex'), { recursive: true });
      writeFileSync(join(repoRoot, '.codex/config.toml'), '[profiles.default]\nmodel = "gpt-5"\n');
      const dryRun = runMcpSetupCodex({ repo: repoRoot, scope: 'project', dryRun: true });
      expect(dryRun.changed).toHaveLength(0);
      expect(readFileSync(join(repoRoot, '.codex/config.toml'), 'utf-8')).not.toContain('[mcp_servers.repo_harness]');

      const result = runMcpSetupCodex({ repo: repoRoot, scope: 'project' });
      expect(result.changed.some((path) => path.endsWith('.codex/config.toml'))).toBe(true);
      expect(existsSync(join(repoRoot, '.codex/config.toml.bak'))).toBe(true);
      const config = readFileSync(join(repoRoot, '.codex/config.toml'), 'utf-8');
      expect(config).toContain('[profiles.default]');
      expect(config).toContain('[mcp_servers.repo_harness]');

      const again = runMcpSetupCodex({ repo: repoRoot, scope: 'project' });
      expect(again.changed).toHaveLength(0);
    });
  });

  test('installs bridge skill template with overwrite protection', () => {
    withTmpRepo((repoRoot) => {
      runMcpInstallSkill({ repo: repoRoot });
      const skill = join(repoRoot, '.agents/skills/repo-harness-chatgpt-bridge/SKILL.md');
      expect(existsSync(skill)).toBe(true);
      expect(readFileSync(skill, 'utf-8')).toContain('repo-harness-chatgpt-bridge');
      writeFileSync(skill, 'custom\n');
      const protectedResult = runMcpInstallSkill({ repo: repoRoot });
      expect(protectedResult.changed).toHaveLength(0);
      expect(readFileSync(skill, 'utf-8')).toBe('custom\n');
      runMcpInstallSkill({ repo: repoRoot, overwrite: true });
      const installed = readFileSync(skill, 'utf-8');
      expect(installed).toContain('repo-harness-chatgpt-bridge');
      expect(installed).toContain("Use the user's language for status reports unless repo-local instructions require otherwise.");
      expect(installed).not.toContain('阅读：');
      expect(installed).not.toContain('开worktree完整执行');
      expect(installed).not.toContain('完成阶段性任务，要staging再继续');
    });
  });

  // SSD-05: setup.ts no longer owns ChatGPT Skill prose inline; install-skill
  // now projects the file-backed canonical package at
  // assets/skills/repo-harness-chatgpt/references/bridge.md. These tests
  // cover the new projection source directly (byte parity, and fail-closed
  // behavior when the canonical package is missing/malformed), replacing the
  // old assumption that SKILL_MD could never be absent.
  const CHATGPT_CANONICAL_BRIDGE_REFERENCE = join(
    import.meta.dir,
    '../..',
    'assets/skills/repo-harness-chatgpt/references/bridge.md',
  );

  function withReplacedSourceRoot<T>(sourceRoot: string, fn: () => T): T {
    const previous = process.env.REPO_HARNESS_SOURCE_ROOT;
    try {
      process.env.REPO_HARNESS_SOURCE_ROOT = sourceRoot;
      return fn();
    } finally {
      if (previous === undefined) delete process.env.REPO_HARNESS_SOURCE_ROOT;
      else process.env.REPO_HARNESS_SOURCE_ROOT = previous;
    }
  }

  test('install-skill projects the exact canonical bridge.md bytes into SKILL.md and references/workflow.md', () => {
    withTmpRepo((repoRoot) => {
      const canonical = readFileSync(CHATGPT_CANONICAL_BRIDGE_REFERENCE, 'utf-8');
      expect(canonical).toContain('name: repo-harness-chatgpt-bridge');
      const result = runMcpInstallSkill({ repo: repoRoot });
      expect(result.changed.length).toBeGreaterThan(0);
      const skill = join(repoRoot, '.agents/skills/repo-harness-chatgpt-bridge/SKILL.md');
      const workflow = join(repoRoot, '.agents/skills/repo-harness-chatgpt-bridge/references/workflow.md');
      expect(readFileSync(skill, 'utf-8')).toBe(canonical);
      expect(readFileSync(workflow, 'utf-8')).toBe(canonical);
    });
  });

  test('install-skill fails closed and writes nothing when the canonical ChatGPT Skill source is missing', () => {
    withTmpRepo((repoRoot) => {
      const fakeSourceRoot = mkdtempSync(join(tmpdir(), 'repo-harness-chatgpt-missing-canonical-'));
      try {
        withReplacedSourceRoot(fakeSourceRoot, () => {
          expect(() => runMcpInstallSkill({ repo: repoRoot })).toThrow('canonical ChatGPT Skill source');
          expect(existsSync(join(repoRoot, '.agents/skills/repo-harness-chatgpt-bridge'))).toBe(false);
          // Dry run validates the canonical source too, so it never reports a
          // false "would install" when the source is actually broken.
          expect(() => runMcpInstallSkill({ repo: repoRoot, dryRun: true })).toThrow('canonical ChatGPT Skill source');
          expect(existsSync(join(repoRoot, '.agents/skills/repo-harness-chatgpt-bridge'))).toBe(false);
        });
      } finally {
        rmSync(fakeSourceRoot, { recursive: true, force: true });
      }
    });
  });

  test('install-skill fails closed and writes nothing when the canonical ChatGPT Skill source is malformed', () => {
    withTmpRepo((repoRoot) => {
      const fakeSourceRoot = mkdtempSync(join(tmpdir(), 'repo-harness-chatgpt-malformed-canonical-'));
      try {
        const referencesDir = join(fakeSourceRoot, 'assets/skills/repo-harness-chatgpt/references');
        mkdirSync(referencesDir, { recursive: true });
        writeFileSync(join(referencesDir, 'bridge.md'), '# not a skill file, no frontmatter\n');
        withReplacedSourceRoot(fakeSourceRoot, () => {
          expect(() => runMcpInstallSkill({ repo: repoRoot })).toThrow('canonical ChatGPT Skill source is malformed');
          expect(existsSync(join(repoRoot, '.agents/skills/repo-harness-chatgpt-bridge'))).toBe(false);
        });
      } finally {
        rmSync(fakeSourceRoot, { recursive: true, force: true });
      }
    });
  });

  test('install-skill rejects a non-absolute REPO_HARNESS_SOURCE_ROOT override', () => {
    withTmpRepo((repoRoot) => {
      withReplacedSourceRoot('relative/path', () => {
        expect(() => runMcpInstallSkill({ repo: repoRoot })).toThrow('REPO_HARNESS_SOURCE_ROOT must be an absolute path');
      });
    });
  });
});
