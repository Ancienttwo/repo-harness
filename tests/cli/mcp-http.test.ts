import { describe, expect, test } from 'bun:test';
import { createHash, randomBytes } from 'crypto';
import { createServer } from 'net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ServerError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { McpOAuthTokenStore } from '../../src/cli/mcp/oauth';
import { McpSessionStore, type McpSessionClosableTransport } from '../../src/cli/mcp/session-store';
import type { McpCodingRuntime } from '../../src/cli/mcp/server';
import { runMcpSetupChatgpt } from '../../src/cli/mcp/setup';
import {
  CodingAuthorizationRuntimeStore,
  createOAuthRateLimitMiddleware,
  startMcpHttp,
} from '../../src/cli/mcp/transports/http';
import { repoHarnessPackageVersion } from '../../src/cli/mcp/version';
import { readRegisteredRepoHarnessRepos, setRepoHarnessAccessMode } from '../../src/effects/repo-registry';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || address === null) {
        server.close(() => reject(new Error('unable to allocate test port')));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHealth(port: number): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch (_error) {
      // Server is still starting.
    }
    await Bun.sleep(50);
  }
  throw new Error('MCP HTTP server did not become healthy');
}

function initializeBody(): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'repo-harness-test', version: '0' },
    },
  });
}

function parseMcpResponse(text: string): any {
  const data = text.split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean)
    .at(-1);
  return JSON.parse(data ?? text);
}

function useTempRegistryHome(): () => void {
  const home = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-http-registry-'));
  const previous = process.env.REPO_HARNESS_HOME;
  process.env.REPO_HARNESS_HOME = home;
  return () => {
    if (previous === undefined) delete process.env.REPO_HARNESS_HOME;
    else process.env.REPO_HARNESS_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  };
}

describe('mcp http transport', () => {
  test('OAuth limiter uses direct socket identity, bounded buckets, and canonical routes', () => {
    let now = 1_000;
    const middleware = createOAuthRateLimitMiddleware({
      windowMs: 100,
      maxRequests: 2,
      maxBuckets: 1,
      now: () => now,
    });
    const invoke = (remoteAddress: string, forwardedIp: string, baseUrl = '/authorize', path = '/') => {
      let status = 200;
      let nextCalls = 0;
      const response = {
        status(code: number) { status = code; return response; },
        json() { return response; },
      };
      middleware({
        ip: forwardedIp,
        socket: { remoteAddress },
        baseUrl,
        path,
      } as never, response as never, () => { nextCalls += 1; });
      return { status, nextCalls };
    };

    expect(invoke('127.0.0.1', '203.0.113.1', '/authorize', '/one').nextCalls).toBe(1);
    expect(invoke('127.0.0.1', '203.0.113.2', '/authorize', '/two').nextCalls).toBe(1);
    expect(invoke('127.0.0.1', '203.0.113.3', '/authorize', '/three').status).toBe(429);
    expect(invoke('127.0.0.2', '203.0.113.4').status).toBe(429);
    now += 100;
    expect(invoke('127.0.0.2', '203.0.113.4').nextCalls).toBe(1);
  });

  test('dynamic OAuth clients expire and fail closed at a fixed capacity', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-oauth-client-cap-'));
    let now = 10_000;
    try {
      const store = new McpOAuthTokenStore(join(root, 'tokens.json'), {
        nowSeconds: () => now,
        dynamicClientTtlSeconds: 10,
        maxDynamicClients: 2,
      });
      const metadata = {
        redirect_uris: ['http://localhost/callback'],
        token_endpoint_auth_method: 'none' as const,
        grant_types: ['authorization_code'],
        response_types: ['code'],
      };
      const first = store.registerClient(metadata);
      const second = store.registerClient(metadata);
      expect(first.client_id_issued_at).toBe(now);
      expect(() => store.registerClient(metadata)).toThrow(ServerError);
      expect(store.getClient(first.client_id)).toBeDefined();
      expect(store.getClient(second.client_id)).toBeDefined();

      now += 10;
      expect(store.getClient(first.client_id)).toBeUndefined();
      expect(store.registerClient(metadata).client_id_issued_at).toBe(now);

      const reloaded = new McpOAuthTokenStore(join(root, 'tokens.json'), {
        nowSeconds: () => now,
        dynamicClientTtlSeconds: 10,
        maxDynamicClients: 2,
      });
      reloaded.load();
      expect(() => reloaded.registerClient(metadata)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('dynamic OAuth client load rejects an over-cap persisted set atomically', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-oauth-client-overcap-'));
    const path = join(root, 'tokens.json');
    const now = 20_000;
    try {
      const clients = Object.fromEntries([0, 1, 2].map((index) => [`client-${index}`, {
        client_id: `client-${index}`,
        client_id_issued_at: now,
        redirect_uris: ['http://localhost/callback'],
        token_endpoint_auth_method: 'none',
      }]));
      writeFileSync(path, `${JSON.stringify({ clients })}\n`);
      const store = new McpOAuthTokenStore(path, {
        nowSeconds: () => now,
        dynamicClientTtlSeconds: 10,
        maxDynamicClients: 2,
      });
      expect(() => store.load()).toThrow(ServerError);
      expect(store.getClient('client-0')).toBeUndefined();
      expect(store.getClient('client-1')).toBeUndefined();
      expect(store.getClient('client-2')).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('authorization runtime expiry catches background shutdown rejection and remains race-idempotent', async () => {
    let now = 1_000;
    let shutdownCalls = 0;
    const cleanupErrors: unknown[] = [];
    const runtime = {} as McpCodingRuntime;
    const store = new CodingAuthorizationRuntimeStore(
      100,
      2,
      () => now,
      async () => {
        shutdownCalls += 1;
        throw new Error('injected cleanup failure');
      },
      (error) => cleanupErrors.push(error),
    );

    expect(store.getOrCreate('authorization-1', () => runtime)).toBe(runtime);
    now += 101;
    expect(store.cleanupExpired()).toBe(1);
    await store.close('authorization-1');
    await Bun.sleep(0);

    expect(shutdownCalls).toBe(1);
    expect(cleanupErrors).toHaveLength(1);
    expect(cleanupErrors[0]).toBeInstanceOf(Error);
  });

  test('session store enforces TTL, max sessions, lastSeen refresh, and close semantics without sleeping', async () => {
    let now = 1_000;
    const closed: string[] = [];
    const makeTransport = (sessionId: string): McpSessionClosableTransport => ({
      sessionId,
      async close() {
        closed.push(sessionId);
      },
    });
    const store = new McpSessionStore({ ttlMs: 100, maxSessions: 2, now: () => now });

    expect(store.canCreate()).toBe(true);
    store.set('s1', makeTransport('s1'));
    now += 40;
    store.set('s2', makeTransport('s2'));
    expect(store.size).toBe(2);
    expect(store.canCreate()).toBe(false);

    now += 40;
    expect(store.get('s1')?.lastSeenAt).toBe(now);
    now += 70;
    expect(store.cleanupExpired()).toBe(1);
    expect(closed).toEqual(['s2']);
    expect(store.size).toBe(1);
    expect(store.canCreate()).toBe(true);

    await store.closeAndDelete('s1');
    expect(closed).toEqual(['s2', 's1']);
    expect(store.size).toBe(0);

    store.set('s3', makeTransport('s3'));
    store.set('s4', makeTransport('s4'));
    await store.closeAll();
    expect(closed.slice(-2).sort()).toEqual(['s3', 's4']);
    expect(store.size).toBe(0);
  });

  test('public HTTP bind fails closed without an explicit public origin', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-public-origin-'));
    const port = await freePort();
    const previous = process.env.REPO_HARNESS_MCP_PUBLIC_ORIGIN;
    const restoreRegistryHome = useTempRegistryHome();
    try {
      delete process.env.REPO_HARNESS_MCP_PUBLIC_ORIGIN;
      mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
      writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
      await expect(startMcpHttp({ repo: repoRoot, host: '0.0.0.0', port, auth: 'bearer', authToken: 'test-token' }))
        .rejects.toThrow('REPO_HARNESS_MCP_PUBLIC_ORIGIN is required');
    } finally {
      if (previous === undefined) delete process.env.REPO_HARNESS_MCP_PUBLIC_ORIGIN;
      else process.env.REPO_HARNESS_MCP_PUBLIC_ORIGIN = previous;
      restoreRegistryHome();
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('requires bearer auth and accepts authenticated initialize requests', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-http-'));
    const port = await freePort();
    const restoreRegistryHome = useTempRegistryHome();
    let proc: Bun.Subprocess | null = null;
    try {
      mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
      writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
      runMcpSetupChatgpt({ repo: repoRoot, port: String(port) });
      const token = (await Bun.file(join(repoRoot, '.repo-harness/mcp.tokens.json')).json()).bearerToken;

      proc = Bun.spawn(
        [
          'bun',
          'src/cli/index.ts',
          'mcp',
          'serve',
          '--repo',
          repoRoot,
          '--transport',
          'http',
          '--host',
          '127.0.0.1',
          '--port',
          String(port),
          '--profile',
          'planner',
          '--auth',
          'bearer',
        ],
        { cwd: process.cwd(), stdout: 'ignore', stderr: 'pipe', env: { ...process.env } },
      );
      await waitForHealth(port);

      const health = await fetch(`http://127.0.0.1:${port}/health`);
      const healthJson = await health.json();
      expect(healthJson).toMatchObject({
        status: 'ok',
        package_version: repoHarnessPackageVersion(),
        auth: 'bearer',
        auth_mode: 'bearer',
        profile: 'planner',
      });
      expect(healthJson.schema_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(healthJson)).not.toContain(token);

      const noAuth = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: initializeBody(),
      });
      expect(noAuth.status).toBe(401);

      const badJson = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: '{bad',
      });
      expect(badJson.status).toBe(400);

      const initialized = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: initializeBody(),
      });
      expect(initialized.status).toBe(200);
      expect(await initialized.text()).toContain('repo-harness-mcp');
      const sessionId = initialized.headers.get('mcp-session-id');
      expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);

      const toolsList = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-session-id': sessionId ?? '',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      });
      expect(toolsList.status).toBe(200);
      expect(await toolsList.text()).toContain('read_workflow_file');

      const deleted = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json, text/event-stream',
          'mcp-session-id': sessionId ?? '',
        },
      });
      expect([200, 202, 204]).toContain(deleted.status);

      const afterDelete = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          'mcp-session-id': sessionId ?? '',
        },
      });
      expect(afterDelete.status).toBe(404);

      const stale = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          'mcp-session-id': '00000000-0000-4000-8000-000000000000',
        },
      });
      expect(stale.status).toBe(404);
      expect(await stale.json()).toMatchObject({
        error: { code: 'SESSION_NOT_FOUND' },
      });
    } finally {
      proc?.kill();
      await proc?.exited.catch(() => undefined);
      restoreRegistryHome();
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('supports URL token compatibility mode for single-user clients', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-url-token-'));
    const port = await freePort();
    const restoreRegistryHome = useTempRegistryHome();
    let proc: Bun.Subprocess | null = null;
    try {
      mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
      writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
      runMcpSetupChatgpt({ repo: repoRoot, port: String(port) });
      const token = (await Bun.file(join(repoRoot, '.repo-harness/mcp.tokens.json')).json()).bearerToken;

      proc = Bun.spawn(
        [
          'bun',
          'src/cli/index.ts',
          'mcp',
          'serve',
          '--repo',
          repoRoot,
          '--transport',
          'http',
          '--host',
          '127.0.0.1',
          '--port',
          String(port),
          '--profile',
          'planner',
          '--auth',
          'url-token',
        ],
        { cwd: process.cwd(), stdout: 'ignore', stderr: 'pipe', env: { ...process.env } },
      );
      await waitForHealth(port);

      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(await health.json()).toMatchObject({
        status: 'ok',
        auth: 'url-token',
        profile: 'planner',
        capabilities: { workspaceReader: true, workflowPlanner: true },
        allowed_root_count: 1,
      });

      const initialized = await fetch(`http://127.0.0.1:${port}/mcp?repo_harness_token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: initializeBody(),
      });
      expect(initialized.status).toBe(200);
      expect(await initialized.text()).toContain('repo-harness-mcp');
    } finally {
      proc?.kill();
      await proc?.exited.catch(() => undefined);
      restoreRegistryHome();
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('supports ChatGPT-compatible OAuth authorization flow', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-oauth-'));
    const port = await freePort();
    const restoreRegistryHome = useTempRegistryHome();
    let proc: Bun.Subprocess | null = null;
    try {
      mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
      writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
      runMcpSetupChatgpt({ repo: repoRoot, port: String(port) });
      const passphrase = (await Bun.file(join(repoRoot, '.repo-harness/mcp.oauth.json')).json()).passphrase;

      proc = Bun.spawn(
        [
          'bun',
          'src/cli/index.ts',
          'mcp',
          'serve',
          '--repo',
          repoRoot,
          '--transport',
          'http',
          '--host',
          '127.0.0.1',
          '--port',
          String(port),
          '--profile',
          'planner',
        ],
        { cwd: process.cwd(), stdout: 'ignore', stderr: 'pipe', env: { ...process.env } },
      );
      await waitForHealth(port);

      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(await health.json()).toMatchObject({ status: 'ok', auth: 'oauth' });

      const metadata = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource/mcp`, {
        headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'example.test' },
      });
      expect(await metadata.json()).toMatchObject({
        resource: 'https://example.test/mcp',
        authorization_servers: ['https://example.test'],
        scopes_supported: ['repo-harness', 'offline_access'],
      });

      const authorizationMetadata = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-authorization-server`, {
        headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'example.test' },
      });
      expect(await authorizationMetadata.json()).toMatchObject({
        issuer: 'https://example.test',
        scopes_supported: ['repo-harness', 'offline_access'],
      });

      const registered = await fetch(`http://127.0.0.1:${port}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['http://localhost/callback'],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          client_name: 'repo-harness-test',
        }),
      });
      expect(registered.status).toBe(201);
      const client = await registered.json() as { client_id: string };
      expect(typeof client.client_id).toBe('string');

      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const authorizeBody = new URLSearchParams({
        passphrase,
        client_id: client.client_id,
        redirect_uri: 'http://localhost/callback',
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        scope: 'repo-harness offline_access',
        state: 'state-1',
      });
      const authorized = await fetch(`http://127.0.0.1:${port}/authorize`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: authorizeBody,
        redirect: 'manual',
      });
      expect(authorized.status).toBe(302);
      const redirect = new URL(authorized.headers.get('location') ?? '');
      const code = redirect.searchParams.get('code');
      expect(code).toBeTruthy();

      const token = await fetch(`http://127.0.0.1:${port}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: client.client_id,
          code: code ?? '',
          code_verifier: verifier,
          redirect_uri: 'http://localhost/callback',
        }),
      });
      expect(token.status).toBe(200);
      const tokenJson = await token.json() as { access_token: string; refresh_token: string; token_type: string; scope: string };
      expect(tokenJson.token_type).toBe('Bearer');
      expect(tokenJson.scope).toBe('repo-harness offline_access');

      const refreshed = await fetch(`http://127.0.0.1:${port}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: client.client_id,
          refresh_token: tokenJson.refresh_token,
        }),
      });
      expect(refreshed.status).toBe(200);
      const refreshedJson = await refreshed.json() as { access_token: string; refresh_token: string; scope: string };
      expect(refreshedJson.access_token).not.toBe(tokenJson.access_token);
      expect(refreshedJson.refresh_token).not.toBe(tokenJson.refresh_token);
      expect(refreshedJson.scope).toBe('repo-harness offline_access');

      const noAuth = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: initializeBody(),
      });
      expect(noAuth.status).toBe(401);
      expect(noAuth.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource/mcp');

      const initialized = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenJson.access_token}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: initializeBody(),
      });
      expect(initialized.status).toBe(401);

      const refreshedInitialized = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${refreshedJson.access_token}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: initializeBody(),
      });
      expect(refreshedInitialized.status).toBe(200);
      expect(await refreshedInitialized.text()).toContain('repo-harness-mcp');
    } finally {
      proc?.kill();
      await proc?.exited.catch(() => undefined);
      restoreRegistryHome();
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('coding OAuth E2E enforces Host/CORS/redirect boundaries and exposes the exact direct-coding schema', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-coding-e2e-'));
    const port = await freePort();
    const restoreRegistryHome = useTempRegistryHome();
    let proc: Bun.Subprocess | null = null;
    try {
      mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
      mkdirSync(join(repoRoot, 'src'), { recursive: true });
      writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
      writeFileSync(join(repoRoot, 'AGENTS.md'), '# Coding test\n');
      writeFileSync(join(repoRoot, 'src/value.txt'), 'before\n');
      const runGit = (...args: string[]) => {
        const result = Bun.spawnSync(['git', '-C', repoRoot, ...args], { stdout: 'pipe', stderr: 'pipe' });
        if (result.exitCode !== 0) throw new Error(result.stderr.toString());
      };
      runGit('init', '-b', 'main');
      runGit('config', 'user.email', 'tests@example.com');
      runGit('config', 'user.name', 'Repo Harness Tests');
      runGit('add', '.');
      runGit('commit', '-m', 'fixture');
      runMcpSetupChatgpt({
        repo: repoRoot,
        scope: 'user',
        profile: 'coding',
        grantReadWrite: [repoRoot],
        endpoint: 'https://coding.test/mcp',
        port: String(port),
      });
      const passphrase = (await Bun.file(join(process.env.REPO_HARNESS_HOME!, 'mcp.oauth.json')).json()).passphrase as string;
      const repoId = readRegisteredRepoHarnessRepos({ adoptedOnly: true })[0]!.id;

      await expect(startMcpHttp({
        repo: repoRoot,
        host: '127.0.0.1',
        port,
        profile: 'coding',
        auth: 'bearer',
        authToken: 'must-not-bypass-coding-oauth',
      })).rejects.toThrow('coding profile requires OAuth authentication');

      proc = Bun.spawn([
        'bun', 'src/cli/index.ts', 'mcp', 'serve',
        '--repo', repoRoot,
        '--transport', 'http',
        '--host', '127.0.0.1',
        '--port', String(port),
        '--profile', 'coding',
      ], { cwd: process.cwd(), stdout: 'ignore', stderr: 'pipe', env: { ...process.env } });
      await waitForHealth(port);

      const badHost = await fetch(`http://127.0.0.1:${port}/health`, { headers: { 'x-forwarded-host': 'evil.test' } });
      expect(badHost.status).toBe(421);
      const badOrigin = await fetch(`http://127.0.0.1:${port}/health`, { headers: { origin: 'https://evil.test' } });
      expect(badOrigin.status).toBe(403);
      const allowedOrigin = await fetch(`http://127.0.0.1:${port}/health`, { headers: { origin: 'https://chatgpt.com' } });
      expect(allowedOrigin.headers.get('access-control-allow-origin')).toBe('https://chatgpt.com');
      expect(await allowedOrigin.json()).toMatchObject({
        profile: 'coding',
        capabilities: { workspaceCoder: true, workspaceReader: false },
      });

      const registered = await fetch(`http://127.0.0.1:${port}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['https://chatgpt.com/connector/callback', 'https://evil.test/callback'],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
        }),
      });
      expect(registered.status).toBe(201);
      const client = await registered.json() as { client_id: string };
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const consent = await fetch(`http://127.0.0.1:${port}/authorize?${new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: 'https://chatgpt.com/connector/callback',
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        scope: 'repo-harness repo-harness.coding offline_access',
      })}`);
      expect(consent.status).toBe(200);
      const consentHtml = await consent.text();
      expect(consentHtml).toContain('can access anything your local OS user can access on this machine');
      expect(consentHtml).toContain('including outside these repositories');
      expect(consentHtml).toContain('Repository grants and allowed roots select workspaces; they do not sandbox shell access.');
      expect(consentHtml).toContain('repo-harness-mcp-coding-e2e-');
      expect(consentHtml).not.toContain(repoRoot);
      const authorize = (redirectUri: string) => fetch(`http://127.0.0.1:${port}/authorize`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          passphrase,
          client_id: client.client_id,
          redirect_uri: redirectUri,
          response_type: 'code',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          scope: 'repo-harness repo-harness.coding offline_access',
        }),
        redirect: 'manual',
      });
      expect((await authorize('https://evil.test/callback')).status).toBe(400);
      const missingScope = await fetch(`http://127.0.0.1:${port}/authorize`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          passphrase,
          client_id: client.client_id,
          redirect_uri: 'https://chatgpt.com/connector/callback',
          response_type: 'code',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          scope: 'repo-harness offline_access',
        }),
        redirect: 'manual',
      });
      expect(missingScope.status).toBe(400);
      expect(await missingScope.json()).toMatchObject({ error: 'invalid_scope' });
      const authorized = await authorize('https://chatgpt.com/connector/callback');
      expect(authorized.status).toBe(302);
      const code = new URL(authorized.headers.get('location') ?? '').searchParams.get('code') ?? '';
      const token = await fetch(`http://127.0.0.1:${port}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: client.client_id,
          code,
          code_verifier: verifier,
          redirect_uri: 'https://chatgpt.com/connector/callback',
        }),
      });
      const tokenJson = await token.json() as { access_token: string; expires_in: number; scope: string };
      expect(tokenJson).toMatchObject({ expires_in: 3600 });
      expect(tokenJson.scope.split(' ')).toEqual(['repo-harness', 'repo-harness.coding', 'offline_access']);

      const initializeSession = async (accessToken: string): Promise<Record<string, string>> => {
        const nextHeaders: Record<string, string> = {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        };
        const initialized = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: nextHeaders,
          body: initializeBody(),
        });
        expect(initialized.status).toBe(200);
        nextHeaders['mcp-session-id'] = initialized.headers.get('mcp-session-id') ?? '';
        await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: nextHeaders,
          body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
        });
        return nextHeaders;
      };
      let headers = await initializeSession(tokenJson.access_token);
      const callWith = async (callHeaders: Record<string, string>, id: number, method: string, params?: Record<string, unknown>) => {
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST', headers: callHeaders,
          body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }),
        });
        expect(response.status).toBe(200);
        return parseMcpResponse(await response.text());
      };
      const call = (id: number, method: string, params?: Record<string, unknown>) => callWith(headers, id, method, params);
      const tools = (await call(2, 'tools/list')).result.tools as Array<{ name: string; annotations?: Record<string, unknown> }>;
      const directNames = ['open_workspace', 'read', 'apply_patch', 'exec_command', 'write_stdin'];
      expect(tools.filter((tool) => directNames.includes(tool.name)).map((tool) => tool.name)).toEqual(directNames);
      expect(tools.find((tool) => tool.name === 'exec_command')?.annotations).toMatchObject({ destructiveHint: true, openWorldHint: true });

      const openedCall = await call(3, 'tools/call', { name: 'open_workspace', arguments: { repo_id: repoId } });
      const opened = JSON.parse(openedCall.result.content[0].text) as { workspace_id: string; mode: string; branch: string };
      expect(opened.mode).toBe('worktree');

      const deleted = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'DELETE',
        headers,
      });
      expect([200, 202, 204]).toContain(deleted.status);
      headers = await initializeSession(tokenJson.access_token);
      const readCall = await call(4, 'tools/call', { name: 'read', arguments: { workspace_id: opened.workspace_id, path: 'src/value.txt' } });
      const before = JSON.parse(readCall.result.content[0].text) as { sha256: string };
      expect(before.sha256).toMatch(/^[a-f0-9]{64}$/);

      const otherAuthorized = await authorize('https://chatgpt.com/connector/callback');
      const otherCode = new URL(otherAuthorized.headers.get('location') ?? '').searchParams.get('code') ?? '';
      const otherTokenResponse = await fetch(`http://127.0.0.1:${port}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: client.client_id,
          code: otherCode,
          code_verifier: verifier,
          redirect_uri: 'https://chatgpt.com/connector/callback',
        }),
      });
      expect(otherTokenResponse.status).toBe(200);
      const otherToken = await otherTokenResponse.json() as { access_token: string };
      const otherHeaders = await initializeSession(otherToken.access_token);
      const crossGrantRead = await callWith(otherHeaders, 40, 'tools/call', {
        name: 'read',
        arguments: { workspace_id: opened.workspace_id, path: 'src/value.txt' },
      });
      expect(JSON.parse(crossGrantRead.result.content[0].text)).toMatchObject({
        error: { code: 'WORKSPACE_NOT_FOUND' },
      });
      const hijackedTransport = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { ...otherHeaders, 'mcp-session-id': headers['mcp-session-id']! },
        body: JSON.stringify({ jsonrpc: '2.0', id: 41, method: 'tools/list' }),
      });
      expect(hijackedTransport.status).toBe(404);
      const patchCall = await call(5, 'tools/call', {
        name: 'apply_patch',
        arguments: {
          workspace_id: opened.workspace_id,
          operations: [{ op: 'replace', path: 'src/value.txt', expected_sha256: before.sha256, content: 'after\n' }],
        },
      });
      expect(JSON.parse(patchCall.result.content[0].text)).toMatchObject({ operations: [{ op: 'replace', path: 'src/value.txt' }] });
      const commandCall = await call(6, 'tools/call', {
        name: 'exec_command',
        arguments: { workspace_id: opened.workspace_id, cmd: 'test "$(cat src/value.txt)" = after && printf e2e-ok', yield_time_ms: 3000 },
      });
      expect(JSON.parse(commandCall.result.content[0].text)).toMatchObject({ running: false, exit_code: 0, output: 'e2e-ok' });

      const backgroundCall = await call(7, 'tools/call', {
        name: 'exec_command',
        arguments: {
          workspace_id: opened.workspace_id,
          cmd: 'while true; do printf . >> authorization-heartbeat.txt; sleep 0.1; done',
          yield_time_ms: 0,
        },
      });
      const background = JSON.parse(backgroundCall.result.content[0].text) as { session_id: number; running: boolean };
      expect(background).toMatchObject({ running: true });
      const crossGrantPoll = await callWith(otherHeaders, 42, 'tools/call', {
        name: 'write_stdin',
        arguments: { session_id: background.session_id, yield_time_ms: 0 },
      });
      expect(JSON.parse(crossGrantPoll.result.content[0].text)).toMatchObject({
        error: { code: 'PROCESS_ACCESS_DENIED' },
      });
      headers = await initializeSession(tokenJson.access_token);
      const polledCall = await call(8, 'tools/call', {
        name: 'write_stdin',
        arguments: { session_id: background.session_id, yield_time_ms: 0 },
      });
      expect(JSON.parse(polledCall.result.content[0].text)).toMatchObject({ session_id: background.session_id, running: true });
      const worktreeList = Bun.spawnSync(['git', '-C', repoRoot, 'worktree', 'list', '--porcelain'], { stdout: 'pipe' }).stdout.toString();
      const worktreeRoot = worktreeList.split(/\r?\n\r?\n/)
        .map((block) => block.split(/\r?\n/))
        .find((lines) => lines.includes(`branch refs/heads/${opened.branch}`))
        ?.find((line) => line.startsWith('worktree '))
        ?.slice('worktree '.length);
      expect(worktreeRoot).toBeTruthy();
      expect(realpathSync(worktreeRoot!)).not.toBe(realpathSync(repoRoot));
      const heartbeatPath = join(worktreeRoot!, 'authorization-heartbeat.txt');
      for (let attempt = 0; attempt < 40 && !existsSync(heartbeatPath); attempt += 1) await Bun.sleep(100);
      expect(existsSync(heartbeatPath)).toBe(true);
      setRepoHarnessAccessMode(repoRoot, 'read_only');
      const disabled = await fetch(`http://127.0.0.1:${port}/health`, { headers: { origin: 'https://chatgpt.com' } });
      expect(disabled.status).toBe(503);
      await Bun.sleep(2_500);
      let stoppedAt = readFileSync(heartbeatPath, 'utf-8');
      let stableSamples = 0;
      for (let attempt = 0; attempt < 30 && stableSamples < 5; attempt += 1) {
        await Bun.sleep(100);
        const current = readFileSync(heartbeatPath, 'utf-8');
        if (current === stoppedAt) stableSamples += 1;
        else {
          stoppedAt = current;
          stableSamples = 0;
        }
      }
      expect(stableSamples).toBe(5);
    } finally {
      proc?.kill();
      await proc?.exited.catch(() => undefined);
      restoreRegistryHome();
      rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 15_000);
});
