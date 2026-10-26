import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  collectBotAccess,
  MCP_AUDIT_LOG_SEGMENTS,
  MCP_DOCTOR_ARGV,
  MCP_OAUTH_TOKEN_STORE_FILE,
  runBotAccessCommand,
  startBotAccessCollector,
  type BotAccessCommand,
} from '../../src/effects/operator/bot-access';
import type { NotifyChannelStatus } from '../../src/effects/operator/notify-status';
import { MCP_AUDIT_LOG_RELATIVE_PATH } from '../../src/cli/mcp/audit';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { projectMcpDoctor, projectOAuthClients } from '../../src/core/operator/bot-access';

const NOW = new Date('2026-10-27T00:00:00.000Z');
const NOW_S = Math.floor(NOW.getTime() / 1000);
const ACCESS_TOKEN = 'access-token-secret-0001';
const REFRESH_TOKEN = 'refresh-token-secret-0002';
const CLIENT_SECRET = 'client-secret-value-0003';
const PASSPHRASE = 'oauth-passphrase-value-0004';
const PUBLIC_ENDPOINT = 'https://public.example/mcp?token=url-token-secret-0005';
const SLACK_URL = 'https://hooks.slack.example/services/T0/B0/webhook-secret-0006';
const LEAKS = [ACCESS_TOKEN, REFRESH_TOKEN, CLIENT_SECRET, PASSPHRASE, PUBLIC_ENDPOINT, 'url-token-secret', SLACK_URL, 'webhook-secret', 'https://', 'stderr-secret'];

const notifyStatus: NotifyChannelStatus = {
  status: {
    protocol: 1, kind: 'operator_notify_status', plugin_id: 'aimpact.webhook-notify', linked: 'linked', enabled: 'enabled',
    config: { WEBHOOK_URL: 'configured', WEBHOOK_KEY: 'configured', SLACK_WEBHOOK_URL: 'configured' },
    last_delivery: { at: '2026-10-26T00:00:00.000Z', result: 'succeeded' }, observed_at: NOW.toISOString(),
  },
  channels: { webhook: 'configured', slack: 'configured', discord: 'missing', telegram: 'missing' },
};

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rh-bot-access-')));
  const home = join(root, 'home', '.repo-harness');
  const repo = join(root, 'repos', 'demo-repo');
  mkdirSync(home, { recursive: true });
  mkdirSync(join(repo, '.ai', 'harness', 'mcp'), { recursive: true });
  writeFileSync(join(home, 'mcp.oauth.json'), JSON.stringify({ version: 1, passphrase: PASSPHRASE }));
  writeFileSync(join(home, MCP_OAUTH_TOKEN_STORE_FILE), JSON.stringify({
    accessTokens: {
      [ACCESS_TOKEN]: { token: ACCESS_TOKEN, clientId: 'client-a', scopes: ['repo-harness'], expiresAt: NOW_S + 3600, profile: 'planner', authorizationId: 'auth-1' },
      'expired-token-secret': { token: 'expired-token-secret', clientId: 'client-b', scopes: [], expiresAt: NOW_S - 10, profile: 'executor' },
    },
    refreshTokens: { [REFRESH_TOKEN]: { accessToken: ACCESS_TOKEN, expiresAt: NOW_S + 30 * 86400 } },
    clients: {
      'client-a': { client_id: 'client-a', client_id_issued_at: NOW_S - 86400, client_secret: CLIENT_SECRET, client_name: 'Hermes', redirect_uris: ['https://chatgpt.example/cb'] },
      'client-b': { client_id: 'client-b', client_id_issued_at: NOW_S - 2 * 86400, redirect_uris: [] },
      'https://cimd.example/client': { client_id: 'https://cimd.example/client', client_id_issued_at: NOW_S },
    },
  }));
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 3, repos: [{
    id: repoHarnessRepoIdFor(repo), path: repo, accessMode: 'read_write', source: 'manual', registeredAt: NOW.toISOString(), lastSeenAt: NOW.toISOString(),
  }] }));
  writeFileSync(join(repo, MCP_AUDIT_LOG_RELATIVE_PATH), [
    { timestamp: '2026-10-25T00:00:00.000Z', tool: 'read_file', status: 'ok', actor: 'mcp:planner', relativePaths: ['docs/a.md'] },
    { timestamp: '2026-10-26T00:00:00.000Z', tool: 'write_plan', status: 'failed', actor: 'mcp:executor', targetPath: join(repo, 'plans/x.md'), error: 'stderr-secret' },
  ].map(row => JSON.stringify(row)).join('\n') + '\n{"torn":');
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: join(root, 'home'), REPO_HARNESS_HOME: home, REPO_HARNESS_MCP_OAUTH_PASSPHRASE: PASSPHRASE, HERDR_SESSION: 'bots', HERDR_SOCKET_PATH: join(root, 'pane.sock') };
  return { root, home, repo, env, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function doctorReport(root: string) {
  return {
    status: 'ready_user', repo: root,
    mcp: {
      packageVersion: '0.24.3', storageDir: join(root, 'home'), configVersion: 3, configVersionOk: true, localConfig: true, guide: false, authConfigured: true,
      permissions: { fullDiskRead: false, allowedRootCount: 1, allowedRoots: [{ path: join(root, 'repos'), exists: true, readable: true }], unsafeAllowedRoots: [root], registeredRepoCount: 1, legacyFullDiskReadDetected: false },
      capabilities: { workspaceReader: true, workflowPlanner: true, workflowExecutor: false, workspaceCoder: false },
      authorizationRevision: 3,
    },
    codex: { cliAvailable: true, configured: false, configPath: '.codex/config.toml', hasServer: false, missingTools: [], fix: 'repo-harness mcp setup codex' },
    chatgpt: { serverNameConfigured: true, serverName: 'repo-harness', localEndpoint: 'http://127.0.0.1:8765/mcp', publicEndpoint: PUBLIC_ENDPOINT, publicEndpointConfigured: true, authMode: 'oauth', setup: `repo-harness mcp setup chatgpt --repo ${root}` },
  };
}

function herdrStatus(root: string, server: { status: string; version: string | null; protocol: number | null; socket: string }) {
  return {
    client: { version: '0.9.5', protocol: 23, binary: join(root, 'bin', 'herdr'), session: 'bots' },
    server: { ...server, running: server.status === 'running', compatible: true, session: 'bots', restart_needed: false },
    update: { restart_needed: false },
  };
}

function recorder(responses: (file: string, args: readonly string[]) => ReturnType<BotAccessCommand>) {
  const calls: { file: string; args: readonly string[]; env: NodeJS.ProcessEnv }[] = [];
  const run: BotAccessCommand = (file, args, options) => { calls.push({ file, args, env: options.env }); return responses(file, args); };
  return { calls, run };
}

function expectNoLeak(snapshot: unknown, root: string) {
  const text = JSON.stringify(snapshot);
  for (const secret of LEAKS) expect(text).not.toContain(secret);
  expect(text).not.toContain(root);
  expect(text).not.toMatch(/"\/(?:Users|home|private|var|tmp)\//u);
}

describe('Bot access collector', () => {
  test('projects MCP, OAuth, registry, audit, Herdr and notify without secrets or absolute paths', async () => {
    const f = fixture();
    try {
      const socket = join(f.root, 'herdr.sock');
      const { calls, run } = recorder(async (file, args) => file === 'herdr'
        ? { ok: true, stdout: JSON.stringify(herdrStatus(f.root, { status: 'running', version: '0.9.5', protocol: 23, socket })) }
        : { ok: true, stdout: JSON.stringify(doctorReport(f.root)) });
      const notifyCalls: unknown[] = [];
      const snapshot = await collectBotAccess({ env: f.env, cwd: f.repo, now: () => NOW, run_command: run,
        read_notify: async input => { notifyCalls.push(input.session); return notifyStatus; } });

      expect(snapshot.mcp).toMatchObject({ state: 'ok', doctor: { status: 'ready_user', auth_mode: 'oauth', registered_repo_count: 1, allowed_root_count: 1, unsafe_allowed_root_count: 1,
        chatgpt: { server_name_configured: true, public_endpoint_configured: true }, authorization_revision: 3 } });
      expect(snapshot.oauth).toEqual({ state: 'ok', unreadable_clients: 1, clients: [
        { client_id: 'client-a', issued_at: new Date((NOW_S - 86400) * 1000).toISOString(), profiles: ['planner'], expires_at: new Date((NOW_S + 30 * 86400) * 1000).toISOString() },
        { client_id: 'client-b', issued_at: new Date((NOW_S - 2 * 86400) * 1000).toISOString(), profiles: [], expires_at: null },
      ] });
      expect(snapshot.registry).toEqual({ state: 'ok', authorization_revision: 3, registry_revision: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u), repos: [{
        repo_id: repoHarnessRepoIdFor(f.repo), label: 'demo-repo', access_mode: 'read_write',
        last_audit: { state: 'ok', entry: { at: '2026-10-26T00:00:00.000Z', tool: 'write_plan', status: 'failed', actor: 'mcp:executor' } },
      }] });
      expect(snapshot.herdr).toEqual({
        session: 'bots',
        status: { state: 'ok', value: { client: { version: '0.9.5', protocol: 23 }, server: { status: 'running', restart_needed: false, version: {
          state: 'mismatch', expected: { version: '0.9.3', protocol: 22, revision: 'add5f99a8351e66464f9abec0920778303f0e885' }, actual: { version: '0.9.5', protocol: 23 },
        } } } },
        snapshot: { state: 'unavailable', reason: 'herdr_version_mismatch' },
      });
      expect(snapshot.notify).toEqual({ state: 'ok', ...notifyStatus });
      expect(notifyCalls).toEqual(['bots']);
      expectNoLeak(snapshot, f.root);

      const herdr = calls.find(call => call.file === 'herdr')!;
      expect(herdr.args).toEqual(['--session', 'bots', 'status', '--json']);
      expect(Object.keys(herdr.env).filter(name => name.startsWith('HERDR_'))).toEqual([]);
      const doctor = calls.find(call => call.file === process.execPath)!;
      expect(doctor.args).toEqual([...MCP_DOCTOR_ARGV]);
      expect(doctor.env.REPO_HARNESS_MCP_OAUTH_PASSPHRASE).toBeUndefined();
    } finally { f.cleanup(); }
  });

  test('the doctor command never carries --live', async () => {
    expect(MCP_DOCTOR_ARGV.slice(1)).toEqual(['mcp', 'doctor', '--json']);
    expect(MCP_DOCTOR_ARGV).not.toContain('--live');
    const source = await Bun.file(new URL('../../src/effects/operator/bot-access.ts', import.meta.url)).text();
    expect(source).not.toMatch(/['"]--live['"]/u);
  });

  test('the real mcp doctor --json output projects without paths or endpoints, and the store stays unwritten', async () => {
    const f = fixture();
    try {
      const before = readdirSync(f.home).sort();
      const result = await runBotAccessCommand(process.execPath, MCP_DOCTOR_ARGV, { cwd: f.repo, env: { ...f.env, NO_COLOR: '1' }, timeout_ms: 60_000 });
      expect(result.ok).toBe(true);
      const doctor = projectMcpDoctor(JSON.parse((result as { stdout: string }).stdout));
      expect(doctor.status).toBe('not_adopted');
      expect(doctor.registered_repo_count).toBe(0);
      expectNoLeak(doctor, f.root);
      expect(readdirSync(f.home).sort()).toEqual(before);
    } finally { f.cleanup(); }
  }, 90_000);

  test('an aligned server snapshot keeps counts and agent states, never cwd, titles or labels', async () => {
    const f = fixture();
    const socket = join(f.root, 'h.sock');
    const server = createServer(connection => {
      connection.on('data', chunk => {
        const request = JSON.parse(chunk.toString().trim());
        connection.write(JSON.stringify({ id: request.id, result: { type: 'session_snapshot', snapshot: {
          version: '0.9.3', protocol: 22, layouts: [],
          workspaces: [{ workspace_id: 'w1', label: 'private-workspace-label' }],
          tabs: [{ tab_id: 't1', label: 'private-tab-label' }, { tab_id: 't2', label: 'x' }],
          panes: [{ pane_id: 'w1:p1', cwd: join(f.root, 'cwd') }, { pane_id: 'w1:p2', cwd: join(f.root, 'cwd') }],
          agents: [
            { pane_id: 'w1:p2', agent: 'codex', agent_status: 'working', cwd: join(f.root, 'cwd'), terminal_title: 'private-terminal-title', agent_session: { value: 'session-secret' } },
            { pane_id: 'w1:p1', agent: 'claude', agent_status: 'blocked', foreground_cwd: join(f.root, 'fg') },
          ],
        } } }) + '\n');
      });
    });
    await new Promise<void>(resolve => server.listen(socket, resolve));
    try {
      const { run } = recorder(async (file) => file === 'herdr'
        ? { ok: true, stdout: JSON.stringify(herdrStatus(f.root, { status: 'running', version: '0.9.3', protocol: 22, socket })) }
        : { ok: false, code: 'timeout' });
      const snapshot = await collectBotAccess({ env: f.env, cwd: f.repo, session: 'bots', now: () => NOW, run_command: run, read_notify: async () => { throw new Error('stderr-secret'); } });
      expect(snapshot.herdr.snapshot).toEqual({ state: 'ok', value: { workspaces: 1, tabs: 2, panes: 2, agents: [
        { pane_id: 'w1:p1', agent: 'claude', agent_status: 'blocked' },
        { pane_id: 'w1:p2', agent: 'codex', agent_status: 'working' },
      ] } });
      expect(snapshot.mcp).toEqual({ state: 'unavailable', reason: 'mcp_doctor_timeout' });
      expect(snapshot.notify).toEqual({ state: 'unavailable', reason: 'notify_status_failed' });
      const text = JSON.stringify(snapshot);
      for (const hidden of ['private-workspace-label', 'private-tab-label', 'private-terminal-title', 'session-secret']) expect(text).not.toContain(hidden);
      expectNoLeak(snapshot, f.root);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      f.cleanup();
    }
  });

  test('missing, unreadable and symlinked sources stay explicit and are never followed', async () => {
    const f = fixture();
    try {
      rmSync(join(f.home, MCP_OAUTH_TOKEN_STORE_FILE));
      rmSync(join(f.repo, '.ai'), { recursive: true });
      mkdirSync(join(f.root, 'elsewhere', 'mcp'), { recursive: true });
      writeFileSync(join(f.root, 'elsewhere', 'mcp', 'audit.log'), JSON.stringify({ timestamp: '2026-10-26T00:00:00.000Z', tool: 'outside_tool', status: 'ok' }) + '\n');
      mkdirSync(join(f.repo, '.ai'));
      (await import('node:fs')).symlinkSync(join(f.root, 'elsewhere'), join(f.repo, '.ai', 'harness'));
      const { run } = recorder(async (file) => file === 'herdr'
        ? { ok: true, stdout: JSON.stringify(herdrStatus(f.root, { status: 'not_running', version: null, protocol: null, socket: join(f.root, 'x.sock') })) }
        : { ok: true, stdout: 'not json stderr-secret' });
      const snapshot = await collectBotAccess({ env: f.env, cwd: f.repo, session: 'bots', now: () => NOW, run_command: run, read_notify: async () => notifyStatus });
      expect(snapshot.oauth).toEqual({ state: 'missing' });
      expect(snapshot.mcp).toEqual({ state: 'unavailable', reason: 'mcp_doctor_invalid' });
      expect(snapshot.registry.state === 'ok' && snapshot.registry.repos[0]!.last_audit).toEqual({ state: 'unavailable', reason: 'audit_unreadable' });
      expect(snapshot.herdr.status).toMatchObject({ state: 'ok', value: { server: { status: 'not_running', version: null } } });
      expect(snapshot.herdr.snapshot).toEqual({ state: 'unavailable', reason: 'herdr_not_running' });
      expect(JSON.stringify(snapshot)).not.toContain('outside_tool');
      expectNoLeak(snapshot, f.root);

      writeFileSync(join(f.home, 'registered-repos.json'), '{"version":1}');
      const invalid = await collectBotAccess({ env: f.env, cwd: f.repo, session: 'bots', now: () => NOW, run_command: run, read_notify: async () => notifyStatus });
      expect(invalid.registry).toEqual({ state: 'unavailable', reason: 'registry_invalid' });
      await expect(collectBotAccess({ env: f.env, session: '../x', run_command: run })).rejects.toThrow('bot_access_session');
    } finally { f.cleanup(); }
  });

  test('the newest audit row comes from the newest archive segment when the active log has none', async () => {
    const f = fixture();
    try {
      const log = join(f.repo, MCP_AUDIT_LOG_RELATIVE_PATH);
      writeFileSync(log, '');
      mkdirSync(`${log}.archive`);
      writeFileSync(join(`${log}.archive`, '1700000000000-00000000-0000-4000-8000-000000000001.jsonl'), JSON.stringify({ timestamp: '2026-10-01T00:00:00.000Z', tool: 'old_tool', status: 'ok' }) + '\n');
      writeFileSync(join(`${log}.archive`, '1700000000001-00000000-0000-4000-8000-000000000002.jsonl'), JSON.stringify({ timestamp: '2026-10-02T00:00:00.000Z', tool: 'new_tool', status: 'blocked', actor: '/abs/actor' }) + '\n');
      const { run } = recorder(async () => ({ ok: false, code: 'failed' }));
      const snapshot = await collectBotAccess({ env: f.env, cwd: f.repo, session: 'bots', now: () => NOW, run_command: run, read_notify: async () => notifyStatus });
      expect(snapshot.registry.state === 'ok' && snapshot.registry.repos[0]!.last_audit).toEqual({ state: 'ok', entry: { at: '2026-10-02T00:00:00.000Z', tool: 'new_tool', status: 'blocked', actor: null } });
      expect(snapshot.herdr.status).toEqual({ state: 'unavailable', reason: 'herdr_status_failed' });
    } finally { f.cleanup(); }
  });

  test('the collector serves its cache and starts no work on read', async () => {
    const f = fixture();
    try {
      let runs = 0;
      const handle = startBotAccessCollector({ env: f.env, cwd: f.repo, session: 'bots', now: () => NOW, interval_ms: 60_000,
        run_command: async () => { runs++; return { ok: false, code: 'failed' }; }, read_notify: async () => notifyStatus });
      expect(handle.read()).toBeNull();
      await handle.settled();
      const first = handle.read();
      expect(first?.kind).toBe('operator_bot_access');
      handle.read(); handle.read();
      expect(runs).toBe(2);
      await handle.close();
    } finally { f.cleanup(); }
  });

  test('a grant with an expired access token and a live refresh token keeps its profile, like listAuthorizations', () => {
    const projection = projectOAuthClients({
      accessTokens: {
        'stale-access-secret': { token: 'stale-access-secret', clientId: 'client-c', scopes: [], expiresAt: NOW_S - 60, profile: 'executor' },
        'dead-access-secret': { token: 'dead-access-secret', clientId: 'client-d', scopes: [], expiresAt: NOW_S - 60, profile: 'coding' },
      },
      refreshTokens: {
        'live-refresh-secret': { accessToken: 'stale-access-secret', expiresAt: NOW_S + 7 * 86400 },
        'dead-refresh-secret': { accessToken: 'dead-access-secret', expiresAt: NOW_S - 1 },
      },
      clients: { 'client-c': { client_id: 'client-c', client_id_issued_at: NOW_S - 86400 }, 'client-d': { client_id: 'client-d', client_id_issued_at: NOW_S - 86400 } },
    }, NOW_S);
    expect(projection.clients).toEqual([
      { client_id: 'client-c', issued_at: new Date((NOW_S - 86400) * 1000).toISOString(), profiles: ['executor'], expires_at: new Date((NOW_S + 7 * 86400) * 1000).toISOString() },
      { client_id: 'client-d', issued_at: new Date((NOW_S - 86400) * 1000).toISOString(), profiles: [], expires_at: null },
    ]);
    expect(JSON.stringify(projection)).not.toContain('secret');
  });

  test('local constants match the writers they read after', async () => {
    const { mcpOAuthTokenStorePath } = await import('../../src/cli/mcp/auth');
    expect(basename(mcpOAuthTokenStorePath())).toBe(MCP_OAUTH_TOKEN_STORE_FILE);
    expect(MCP_AUDIT_LOG_SEGMENTS.join('/')).toBe(MCP_AUDIT_LOG_RELATIVE_PATH);
  });
});
