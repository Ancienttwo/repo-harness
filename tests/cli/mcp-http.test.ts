import { describe, expect, test } from 'bun:test';
import { createHash, randomBytes } from 'crypto';
import { createServer } from 'net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runMcpSetupChatgpt } from '../../src/cli/mcp/setup';

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

describe('mcp http transport', () => {
  test('requires bearer auth and accepts authenticated initialize requests', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-http-'));
    const port = await freePort();
    let proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | null = null;
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
        { cwd: process.cwd(), stdout: 'ignore', stderr: 'pipe' },
      );
      await waitForHealth(port);

      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(await health.json()).toMatchObject({ status: 'ok', auth: 'required' });

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
    } finally {
      proc?.kill();
      await proc?.exited.catch(() => undefined);
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('supports ChatGPT-compatible OAuth authorization flow', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-oauth-'));
    const port = await freePort();
    let proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | null = null;
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
        { cwd: process.cwd(), stdout: 'ignore', stderr: 'pipe' },
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
      const tokenJson = await token.json() as { access_token: string; token_type: string };
      expect(tokenJson.token_type).toBe('Bearer');

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
      expect(initialized.status).toBe(200);
      expect(await initialized.text()).toContain('repo-harness-mcp');
    } finally {
      proc?.kill();
      await proc?.exited.catch(() => undefined);
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
