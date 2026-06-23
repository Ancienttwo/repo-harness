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
  runMcpPrintGuide,
  runMcpSetupChatgpt,
  runMcpSetupCodex,
} from '../../src/cli/mcp/setup';
import { createMcpToolContext } from '../../src/cli/mcp/server';
import { repoHarnessPackageVersion } from '../../src/cli/mcp/version';
import { assertChatGptMcpContract } from '../helpers/chatgpt-mcp-contract';

const CLI = join(import.meta.dir, '../..', 'src/cli/index.ts');

function withTmpRepo<T>(fn: (repoRoot: string) => T): T {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-setup-'));
  try {
    mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
    writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
    return fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

describe('mcp setup', () => {
  test('generates ChatGPT local config, guide, and ignore entries', () => {
    withTmpRepo((repoRoot) => {
      const result = runMcpSetupChatgpt({ repo: repoRoot });
      expect(result.changed.length).toBeGreaterThan(0);
      expect(existsSync(join(repoRoot, '.repo-harness/mcp.local.json'))).toBe(true);
      expect(existsSync(join(repoRoot, '.repo-harness/mcp.tokens.json'))).toBe(true);
      expect(existsSync(join(repoRoot, '.repo-harness/mcp.oauth.json'))).toBe(true);
      expect(existsSync(join(repoRoot, 'docs/repo-harness-chatgpt-mcp-setup.md'))).toBe(true);
      const config = JSON.parse(readFileSync(join(repoRoot, '.repo-harness/mcp.local.json'), 'utf-8'));
      expect(config.auth).toMatchObject({
        mode: 'oauth',
        oauthFile: '.repo-harness/mcp.oauth.json',
        tokenFile: '.repo-harness/mcp.tokens.json',
      });
      expect(config.chatgpt.serverName).toBe('repo-harness');
      expect(config.devMode).toMatchObject({
        agentRunner: false,
        allowedAgents: ['codex'],
        timeoutMs: 120000,
      });
      const token = JSON.parse(readFileSync(join(repoRoot, '.repo-harness/mcp.tokens.json'), 'utf-8')).bearerToken;
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(30);
      const passphrase = JSON.parse(readFileSync(join(repoRoot, '.repo-harness/mcp.oauth.json'), 'utf-8')).passphrase;
      expect(typeof passphrase).toBe('string');
      expect(passphrase.length).toBeGreaterThan(20);
      const ignore = readFileSync(join(repoRoot, '.gitignore'), 'utf-8');
      expect(ignore).toContain('.repo-harness/mcp.local.json');
      expect(ignore).toContain('.repo-harness/mcp.tokens.json');
      expect(ignore).toContain('.repo-harness/mcp.oauth.json');
      expect(ignore).toContain('.repo-harness/mcp.oauth-tokens.json');
      expect(ignore).toContain('.ai/harness/mcp/audit.log');
      expect(ignore).toContain('.ai/harness/mcp/index-events.jsonl');

      const doctor = JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]);
      expect(doctor.mcp.packageVersion).toBe(repoHarnessPackageVersion());
      expect(doctor.mcp.authConfigured).toBe(true);
      expect(doctor.mcp.permissions.configurationScope).toBe('repo');
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
    withTmpRepo((repoRoot) => {
      const setup = runMcpSetupChatgpt({ repo: repoRoot, serverName: 'team-review-mcp' });
      expect(setup.lines.join('\n')).toContain('ChatGPT MCP server name: team-review-mcp');

      let config = JSON.parse(readFileSync(join(repoRoot, '.repo-harness/mcp.local.json'), 'utf-8'));
      expect(config.chatgpt.serverName).toBe('team-review-mcp');

      runMcpSetupChatgpt({ repo: repoRoot, endpoint: 'https://repo-harness-mcp.example.com/mcp' });
      config = JSON.parse(readFileSync(join(repoRoot, '.repo-harness/mcp.local.json'), 'utf-8'));
      expect(config.chatgpt.serverName).toBe('team-review-mcp');
      expect(config.chatgpt.endpoint).toBe('https://repo-harness-mcp.example.com/mcp');

      runMcpSetupChatgpt({ repo: repoRoot });
      config = JSON.parse(readFileSync(join(repoRoot, '.repo-harness/mcp.local.json'), 'utf-8'));
      expect(config.chatgpt.serverName).toBe('team-review-mcp');
      expect(config.chatgpt.endpoint).toBe('https://repo-harness-mcp.example.com/mcp');

      const doctor = JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]);
      expect(doctor.chatgpt.serverName).toBe('team-review-mcp');
      expect(doctor.chatgpt.serverNameConfigured).toBe(true);
    });
  });

  test('user-scope ChatGPT setup stores MCP state under the OS user and authorizes current-repo reader access', () => {
    withTmpRepo((repoRoot) => {
      const userState = mkdtempSync(join(tmpdir(), 'repo-harness-user-mcp-'));
      const previousHome = process.env.REPO_HARNESS_HOME;
      try {
        process.env.REPO_HARNESS_HOME = userState;

        const setup = runMcpSetupChatgpt({
          repo: repoRoot,
          scope: 'user',
          serverName: 'team-review-mcp',
          endpoint: 'https://repo-harness-mcp.example.com/mcp',
        });
        expect(setup.lines.join('\n')).toContain('Config scope: user');
        expect(setup.lines.join('\n')).toContain('Reader capability: enabled');
        expect(setup.lines.join('\n')).toContain('Registered repo:');
        expect(setup.lines.join('\n')).toContain('--profile planner');
        expect(existsSync(join(userState, 'mcp.local.json'))).toBe(true);
        expect(existsSync(join(userState, 'mcp.tokens.json'))).toBe(true);
        expect(existsSync(join(userState, 'mcp.oauth.json'))).toBe(true);
        expect(existsSync(join(userState, 'registered-repos.json'))).toBe(true);
        expect(existsSync(join(repoRoot, 'docs/repo-harness-chatgpt-mcp-setup.md'))).toBe(false);

        const config = JSON.parse(readFileSync(join(userState, 'mcp.local.json'), 'utf-8'));
        expect(config).toMatchObject({
          scope: 'user',
          repo: repoRoot,
          chatgpt: {
            serverName: 'team-review-mcp',
            endpoint: 'https://repo-harness-mcp.example.com/mcp',
          },
          capabilities: { workspaceReader: true, workflowPlanner: true },
          permissions: { fullDiskRead: false, allowedRoots: [], discoveryRoots: [] },
          profile: 'planner',
        });
        const registry = JSON.parse(readFileSync(join(userState, 'registered-repos.json'), 'utf-8'));
        expect(registry.repos).toEqual([
          expect.objectContaining({ path: realpathSync(repoRoot), source: 'mcp-setup' }),
        ]);
        expect(config.auth.oauthFile).toContain('mcp.oauth.json');
        expect(config.auth.tokenFile).toContain('mcp.tokens.json');

        const doctor = JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]);
        expect(doctor.status).toBe('ready_local');
        expect(doctor.mcp.configScope).toBe('user');
        expect(doctor.mcp.localConfig).toBe(true);
        expect(doctor.mcp.authConfigured).toBe(true);
        expect(doctor.mcp.permissions.configurationScope).toBe('user');
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
      } finally {
        if (previousHome === undefined) {
          delete process.env.REPO_HARNESS_HOME;
        } else {
          process.env.REPO_HARNESS_HOME = previousHome;
        }
        rmSync(userState, { recursive: true, force: true });
      }
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
        expect(doctor.mcp.configVersion).toBe(2);
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

  test('doctor reports sensitive configured allowed roots as unsafe', () => {
    withTmpRepo((repoRoot) => {
      runMcpSetupChatgpt({ repo: repoRoot });
      const sensitiveRoot = join(repoRoot, 'credentials');
      mkdirSync(sensitiveRoot);
      const configPath = join(repoRoot, '.repo-harness/mcp.local.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      config.permissions.allowedRoots = [sensitiveRoot];
      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

      const doctor = JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]);
      expect(doctor.mcp.permissions.unsafeAllowedRoots).toEqual([resolve(sensitiveRoot)]);
      const human = runMcpDoctor({ repo: repoRoot }).lines.join('\n');
      expect(human).toContain('Unsafe allowed roots:');
    });
  });

  test('doctor reports ready_user for user-scope MCP on a non-repo root', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-user-mcp-root-'));
    const userState = mkdtempSync(join(tmpdir(), 'repo-harness-user-mcp-'));
    const previousHome = process.env.REPO_HARNESS_HOME;
    try {
      process.env.REPO_HARNESS_HOME = userState;
      runMcpSetupChatgpt({
        repo: root,
        scope: 'user',
        serverName: 'team-review-mcp',
      });

      const doctor = JSON.parse(runMcpDoctor({ repo: root, json: true }).lines[0]);
      expect(doctor.status).toBe('ready_user');
      expect(doctor.mcp.configScope).toBe('user');
      expect(doctor.mcp.permissions.configurationScope).toBe('user');
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
    withTmpRepo((repoRoot) => {
      mkdirSync(join(repoRoot, '.repo-harness'), { recursive: true });
      writeFileSync(join(repoRoot, '.repo-harness/mcp.local.json'), `${JSON.stringify({
        version: 1,
        repo: repoRoot,
        server: { host: '127.0.0.1', port: 8765, transport: 'http' },
        auth: { mode: 'oauth', oauthFile: '.repo-harness/mcp.oauth.json', tokenFile: '.repo-harness/mcp.tokens.json' },
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
    withTmpRepo((repoRoot) => {
      mkdirSync(join(repoRoot, '.repo-harness'), { recursive: true });
      writeFileSync(join(repoRoot, '.repo-harness/mcp.local.json'), `${JSON.stringify({
        version: 1,
        repo: repoRoot,
        server: { host: '0.0.0.0', port: 9876, transport: 'http' },
        auth: { mode: 'bearer', tokenFile: '.repo-harness/custom.tokens.json' },
        chatgpt: { endpoint: 'https://repo-harness-mcp.example.com/mcp' },
        profile: 'orchestrator',
        devMode: {
          agentRunner: true,
          allowedAgents: ['codex', 'claude'],
          timeoutMs: 300000,
        },
      }, null, 2)}\n`);

      runMcpSetupChatgpt({ repo: repoRoot, serverName: 'team-review-mcp' });
      const config = JSON.parse(readFileSync(join(repoRoot, '.repo-harness/mcp.local.json'), 'utf-8'));
      expect(config.server).toMatchObject({ host: '0.0.0.0', port: 9876, transport: 'http' });
      expect(config.auth).toMatchObject({ mode: 'bearer', tokenFile: '.repo-harness/custom.tokens.json' });
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
    withTmpRepo((repoRoot) => {
      mkdirSync(join(repoRoot, '.repo-harness'), { recursive: true });
      writeFileSync(join(repoRoot, '.repo-harness/mcp.local.json'), `${JSON.stringify({
        version: 1,
        repo: repoRoot,
        server: { host: '0.0.0.0', port: 9876, transport: 'http' },
        auth: { mode: 'bearer', tokenFile: '.repo-harness/custom.tokens.json' },
        chatgpt: { endpoint: 'https://repo-harness-mcp.example.com/mcp' },
        profile: 'orchestrator',
        devMode: {
          agentRunner: true,
          allowedAgents: ['codex', 'claude'],
          timeoutMs: 300000,
        },
      }, null, 2)}\n`);

      const result = spawnSync(
        process.execPath,
        [CLI, 'mcp', 'setup', 'chatgpt', '--repo', repoRoot, '--server-name', 'team-review-mcp'],
        { encoding: 'utf-8' },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('ChatGPT MCP server name: team-review-mcp');
      expect(result.stdout).toContain('Local endpoint: http://0.0.0.0:9876/mcp');

      const config = JSON.parse(readFileSync(join(repoRoot, '.repo-harness/mcp.local.json'), 'utf-8'));
      expect(config.server).toMatchObject({ host: '0.0.0.0', port: 9876, transport: 'http' });
      expect(config.chatgpt).toMatchObject({
        serverName: 'team-review-mcp',
        endpoint: 'https://repo-harness-mcp.example.com/mcp',
      });
    });
  });

  test('stores a stable ChatGPT endpoint in ignored local config and keeps the tracked guide generic', () => {
    withTmpRepo((repoRoot) => {
      runMcpSetupChatgpt({ repo: repoRoot, endpoint: 'https://repo-harness-mcp.example.com/mcp' });

      const config = JSON.parse(readFileSync(join(repoRoot, '.repo-harness/mcp.local.json'), 'utf-8'));
      expect(config.chatgpt.endpoint).toBe('https://repo-harness-mcp.example.com/mcp');

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
    expect(guide).toContain('.repo-harness/mcp.oauth.json');
    expect(guide).toContain('oauth-protected-resource');
    expect(guide).toContain('--auth bearer');
    expect(guide).toContain('--auth url-token');
    expect(guide).toContain('open_workspace');
    expect(guide).toContain('--allow-root "$HOME/Documents"');
    expect(guide).toContain('rescan the Connector tools');
    expect(guide).toContain('delete and recreate the App/Connector');
    expect(guide).toContain('## Reader Test Prompt');
    expect(guide).toContain('Blocked-file smoke');
    expect(guide).toContain('secrets/token.txt');
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
});
