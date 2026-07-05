import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { redirectUriMatches } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpToolContext, createRepoHarnessMcpServer, type McpServerOptions } from '../server';
import {
  mcpOAuthTokenStorePath,
  parseMcpHttpAuthMode,
  readMcpBearerToken,
  readMcpOAuthPassphrase,
  resolveMcpConfigScope,
  type McpHttpAuthMode,
} from '../auth';
import { createMcpOAuthProvider, McpOAuthTokenStore } from '../oauth';
import { resolveMcpRepoRoot } from '../repo';
import { McpSessionStore } from '../session-store';
import { buildMcpToolDefinitions } from '../tools';
import { repoHarnessPackageVersion } from '../version';

export interface McpHttpOptions extends McpServerOptions {
  host?: string;
  port?: number;
  authToken?: string;
  auth?: string;
}

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 64;
const MCP_ALLOWED_HEADERS = [
  'Content-Type',
  'Accept',
  'Authorization',
  'Mcp-Session-Id',
  'MCP-Protocol-Version',
  'Last-Event-ID',
].join(', ');

function bearerFromRequest(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function tokenFromQuery(req: Request): string | null {
  const raw = req.query.repo_harness_token;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function tokensMatch(provided: string | null, expected: string | null): boolean {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

export function isAuthorizedMcpHttpRequest(req: Request, expectedToken: string | null, allowQueryToken = false): boolean {
  if (!expectedToken) return false;
  return tokensMatch(bearerFromRequest(req), expectedToken) || (allowQueryToken && tokensMatch(tokenFromQuery(req), expectedToken));
}

function rawBodyToJson(body: Buffer): unknown | undefined {
  if (body.length === 0) return undefined;
  return JSON.parse(body.toString('utf-8'));
}

function isInitializeRequest(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as Record<string, unknown>).method === 'initialize';
}

function getPublicOrigin(req: Request): string {
  const configured = process.env.REPO_HARNESS_MCP_PUBLIC_ORIGIN?.trim();
  if (configured) {
    return normalizePublicOrigin(configured);
  }
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? '127.0.0.1:8765';
  return `${proto}://${host}`;
}

function normalizePublicOrigin(value: string): string {
  const parsed = new URL(value);
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '' || parsed.username !== '' || parsed.password !== '') {
    throw new Error('REPO_HARNESS_MCP_PUBLIC_ORIGIN must be an origin only, for example https://mcp.example.com');
  }
  return parsed.origin;
}

function isLoopbackBindHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function isAllowedMcpOAuthRedirectUri(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      return true;
    }
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch (_error) {
    return false;
  }
}

function isRegisteredRedirectUri(redirectUri: string, client: { redirect_uris?: string[] }): boolean {
  return (client.redirect_uris ?? []).some((registered) => redirectUriMatches(redirectUri, registered));
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderPassphrasePage(params: URLSearchParams): string {
  const hiddenFields = Array.from(params.entries())
    .filter(([key]) => key !== 'passphrase')
    .map(([key, value]) => `<input type="hidden" name="${escapeHtmlAttribute(key)}" value="${escapeHtmlAttribute(value)}">`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Authorize repo-harness</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f6f6f3;color:#1f2328}
.card{width:min(420px,92vw);background:#fff;border:1px solid #d8d8d0;border-radius:12px;padding:32px;box-shadow:0 12px 40px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 8px}p{margin:0 0 20px;color:#60666d;line-height:1.45}
input{width:100%;box-sizing:border-box;border:1px solid #bfc4c9;border-radius:8px;padding:12px;font-size:16px}
button{width:100%;margin-top:14px;border:0;border-radius:8px;padding:12px;background:#1f2328;color:#fff;font-size:16px;font-weight:600}
</style></head>
<body><main class="card">
<h1>Authorize repo-harness</h1>
<p>Enter the local MCP passphrase to let ChatGPT use this workflow-scoped connector.</p>
<form method="POST" action="/authorize">
${hiddenFields}
<input type="password" name="passphrase" placeholder="Passphrase" autofocus>
<button type="submit">Authorize</button>
</form>
</main></body></html>`;
}

function requirePassphrase(passphrase: string): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const provided = typeof req.body?.passphrase === 'string' ? req.body.passphrase : undefined;
    if (provided) {
      const a = Buffer.from(provided);
      const b = Buffer.from(passphrase);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        next();
        return;
      }
    }
    const params = new URLSearchParams(req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    res.type('html').send(renderPassphrasePage(params));
  };
}

function oauthAuthorizationHandler(provider: ReturnType<typeof createMcpOAuthProvider>) {
  return async (req: Request, res: Response) => {
    const query = req.method === 'POST' ? req.body : req.query;
    const clientId = typeof query.client_id === 'string' ? query.client_id : '';
    const responseType = typeof query.response_type === 'string' ? query.response_type : '';
    const codeChallenge = typeof query.code_challenge === 'string' ? query.code_challenge : '';
    const codeChallengeMethod = typeof query.code_challenge_method === 'string' ? query.code_challenge_method : '';
    const state = typeof query.state === 'string' ? query.state : undefined;
    const scope = typeof query.scope === 'string' ? query.scope : undefined;
    let redirectUri = typeof query.redirect_uri === 'string' ? query.redirect_uri : undefined;

    if (responseType !== 'code') {
      res.status(400).json({ error: 'unsupported_response_type', error_description: 'Only code response type is supported' });
      return;
    }
    if (!codeChallenge || codeChallengeMethod !== 'S256') {
      res.status(400).json({ error: 'invalid_request', error_description: 'PKCE S256 is required' });
      return;
    }

    const client = await provider.clientsStore.getClient(clientId);
    if (!client) {
      res.status(400).json({ error: 'invalid_client', error_description: 'Unknown client_id' });
      return;
    }
    if (!redirectUri && client.redirect_uris.length === 1) {
      redirectUri = client.redirect_uris[0];
    }
    if (!redirectUri || !isAllowedMcpOAuthRedirectUri(redirectUri)) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'redirect_uri must be localhost or a ChatGPT connector callback URL',
      });
      return;
    }
    if (!isRegisteredRedirectUri(redirectUri, client)) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'redirect_uri must match a registered client redirect_uri',
      });
      return;
    }

    await provider.authorize(client as OAuthClientInformationFull, {
      state,
      scopes: scope ? scope.split(' ') : [],
      redirectUri,
      codeChallenge,
    }, res);
  };
}

function rateLimitMiddleware(opts: { windowMs: number; maxRequests: number }) {
  const buckets = new Map<string, { windowStart: number; count: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${req.ip ?? 'unknown'}:${req.path}`;
    const current = buckets.get(key);
    if (!current || now - current.windowStart > opts.windowMs) {
      buckets.set(key, { windowStart: now, count: 1 });
      next();
      return;
    }
    current.count += 1;
    if (current.count > opts.maxRequests) {
      res.status(429).json({ error: 'rate_limited', error_description: 'Too many OAuth requests' });
      return;
    }
    next();
  };
}

function sendOAuthUnauthorized(req: Request, res: Response, description: string): void {
  const resourceMetadataUrl = `${getPublicOrigin(req)}/.well-known/oauth-protected-resource/mcp`;
  res.setHeader(
    'www-authenticate',
    `Bearer error="invalid_token", error_description="${description}", resource_metadata="${resourceMetadataUrl}"`,
  );
  res.status(401).json({ error: 'invalid_token', message: description });
}

function requireMcpHttpAuth(mode: McpHttpAuthMode, bearerToken: string | null, provider: ReturnType<typeof createMcpOAuthProvider> | null) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (mode === 'bearer' || mode === 'url-token') {
      if (!isAuthorizedMcpHttpRequest(req, bearerToken, mode === 'url-token')) {
        res.setHeader('www-authenticate', 'Bearer realm="repo-harness-mcp"');
        res.status(bearerToken ? 401 : 503).json({ error: bearerToken ? 'unauthorized' : 'auth_not_configured' });
        return;
      }
      next();
      return;
    }

    const token = bearerFromRequest(req);
    if (!token || !provider) {
      sendOAuthUnauthorized(req, res, token ? 'OAuth is not configured' : 'Missing Authorization header');
      return;
    }
    provider.verifyAccessToken(token)
      .then((authInfo) => {
        (req as unknown as Record<string, unknown>).auth = authInfo;
        next();
      })
      .catch((error: unknown) => {
        if (error instanceof InvalidTokenError) {
          sendOAuthUnauthorized(req, res, error.message);
        } else {
          res.status(500).json({ error: 'server_error', message: 'Internal Server Error' });
        }
      });
  };
}

function sessionIdFromRequest(req: Request): string | undefined {
  const raw = req.headers['mcp-session-id'];
  return typeof raw === 'string' ? raw : undefined;
}

function isValidSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function boundedIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function sendSessionNotFound(res: Response, status = 404): void {
  res.status(status).json({
    error: {
      code: 'SESSION_NOT_FOUND',
      message: 'The MCP session is missing or expired; initialize a new session.',
    },
  });
}

function recordForSession(sessions: McpSessionStore<StreamableHTTPServerTransport>, sessionId: string | undefined) {
  if (!sessionId || !isValidSessionId(sessionId)) return undefined;
  return sessions.get(sessionId);
}

async function handleMcpPost(req: Request, res: Response, opts: McpHttpOptions, sessions: McpSessionStore<StreamableHTTPServerTransport>): Promise<void> {
  let body: unknown;
  try {
    body = rawBodyToJson(req.body as Buffer);
  } catch (_error) {
    res.status(400).json({ error: 'invalid JSON request body' });
    return;
  }
  const sessionId = sessionIdFromRequest(req);
  if (!sessionId && isInitializeRequest(body)) {
    if (!sessions.canCreate()) {
      res.status(429).json({ error: { code: 'SESSION_LIMIT_REACHED', message: 'Too many active MCP sessions.' } });
      return;
    }
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => { sessions.set(newSessionId, transport); },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    const server = createRepoHarnessMcpServer(opts);
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
    return;
  }
  if (sessionId) {
    const record = recordForSession(sessions, sessionId);
    if (record) {
      await record.transport.handleRequest(req, res, body);
      return;
    }
  }
  sendSessionNotFound(res);
}

async function handleMcpGet(req: Request, res: Response, sessions: McpSessionStore<StreamableHTTPServerTransport>): Promise<void> {
  const record = recordForSession(sessions, sessionIdFromRequest(req));
  if (!record) {
    sendSessionNotFound(res);
    return;
  }
  await record.transport.handleRequest(req, res);
}

async function handleMcpDelete(req: Request, res: Response, sessions: McpSessionStore<StreamableHTTPServerTransport>): Promise<void> {
  const sessionId = sessionIdFromRequest(req);
  const record = recordForSession(sessions, sessionId);
  if (!sessionId || !record) {
    sendSessionNotFound(res);
    return;
  }
  await record.transport.handleRequest(req, res);
  await sessions.closeAndDelete(sessionId);
}

export async function startMcpHttp(opts: McpHttpOptions): Promise<void> {
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? 8765;
  if (!isLoopbackBindHost(host) && !process.env.REPO_HARNESS_MCP_PUBLIC_ORIGIN?.trim()) {
    throw new Error('REPO_HARNESS_MCP_PUBLIC_ORIGIN is required when binding MCP HTTP to a non-loopback host');
  }
  const configuredPublicOrigin = process.env.REPO_HARNESS_MCP_PUBLIC_ORIGIN?.trim()
    ? normalizePublicOrigin(process.env.REPO_HARNESS_MCP_PUBLIC_ORIGIN.trim())
    : undefined;
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  const configScope = resolveMcpConfigScope(repoRoot);
  const authMode = parseMcpHttpAuthMode(opts.auth);
  const authToken = authMode === 'bearer' || authMode === 'url-token' ? opts.authToken ?? readMcpBearerToken(repoRoot, configScope) : null;
  const oauthPassphrase = authMode === 'oauth' ? readMcpOAuthPassphrase(repoRoot, configScope) : null;
  const tokenStore = authMode === 'oauth' ? new McpOAuthTokenStore(mcpOAuthTokenStorePath(repoRoot, configScope)) : null;
  tokenStore?.load();
  const oauthProvider = tokenStore ? createMcpOAuthProvider(tokenStore) : null;
  const sessionTtlMs = boundedIntegerEnv('REPO_HARNESS_MCP_SESSION_TTL_MS', SESSION_TTL_MS, 1_000, 24 * 60 * 60 * 1000);
  const maxSessions = boundedIntegerEnv('REPO_HARNESS_MCP_MAX_SESSIONS', MAX_SESSIONS, 1, 256);
  const sessions = new McpSessionStore<StreamableHTTPServerTransport>({ ttlMs: sessionTtlMs, maxSessions });
  const cleanupTimer = setInterval(() => {
    sessions.cleanupExpired();
  }, Math.min(sessionTtlMs, 60_000));
  cleanupTimer.unref?.();
  const app = express();
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', MCP_ALLOWED_HEADERS);
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/health', (req, res) => {
    sessions.cleanupExpired();
    const ctx = createMcpToolContext({ ...opts, repo: repoRoot });
    const tools = buildMcpToolDefinitions(ctx.policy, { enableChatgptBrowser: opts.enableChatgptBrowser === true });
    res.json({
      status: 'ok',
      server: 'repo-harness-mcp',
      package_version: repoHarnessPackageVersion(),
      mcp_protocol: 'streamable-http',
      profile: ctx.policy.profile,
      capabilities: ctx.policy.capabilities,
      allowed_root_count: ctx.policy.allowedRoots?.length ?? 0,
      auth: authMode === 'oauth' ? (oauthPassphrase ? 'oauth' : 'missing') : (authToken ? authMode : 'missing'),
      auth_mode: authMode,
      public_origin: configuredPublicOrigin ?? getPublicOrigin(req),
      active_sessions: sessions.size,
      max_sessions: sessions.maxSessions,
      session_ttl_ms: sessions.ttlMs,
      schema_hash: createHash('sha256').update(JSON.stringify(tools)).digest('hex'),
    });
  });

  if (authMode === 'oauth' && oauthProvider) {
    const oauthRateLimit = rateLimitMiddleware({ windowMs: 60_000, maxRequests: 120 });
    app.use(['/authorize', '/token', '/revoke', '/register'], oauthRateLimit);
    app.use('/authorize', express.urlencoded({ extended: false, limit: '10kb' }));
    app.use('/authorize', requirePassphrase(oauthPassphrase ?? ''));
    app.use('/authorize', oauthAuthorizationHandler(oauthProvider));
    app.use('/token', tokenHandler({ provider: oauthProvider }));
    app.use('/revoke', revocationHandler({ provider: oauthProvider }));
    app.use('/register', clientRegistrationHandler({ clientsStore: oauthProvider.clientsStore }));
    app.get('/.well-known/oauth-authorization-server', (req, res) => {
      const origin = getPublicOrigin(req);
      res.json({
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        revocation_endpoint: `${origin}/revoke`,
        registration_endpoint: `${origin}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
        scopes_supported: ['repo-harness', 'offline_access'],
      });
    });
    app.get('/.well-known/openid-configuration', (req, res) => {
      const origin = getPublicOrigin(req);
      res.json({
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        registration_endpoint: `${origin}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
        scopes_supported: ['repo-harness', 'offline_access'],
      });
    });
    app.get('/.well-known/oauth-protected-resource/mcp', (req, res) => {
      const origin = getPublicOrigin(req);
      res.json({
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        scopes_supported: ['repo-harness', 'offline_access'],
        bearer_methods_supported: ['header'],
      });
    });
  }

  app.post('/mcp', requireMcpHttpAuth(authMode, authToken, oauthProvider), express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    handleMcpPost(req, res, { ...opts, repo: repoRoot }, sessions).catch((error: unknown) => {
      if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    });
  });
  app.get('/mcp', requireMcpHttpAuth(authMode, authToken, oauthProvider), (req, res) => {
    handleMcpGet(req, res, sessions).catch((error: unknown) => {
      if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    });
  });
  app.delete('/mcp', requireMcpHttpAuth(authMode, authToken, oauthProvider), (req, res) => {
    handleMcpDelete(req, res, sessions).catch((error: unknown) => {
      if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    });
  });
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

  const httpServer = app.listen(port, host);

  await new Promise<void>((resolve) => {
    httpServer.once('listening', resolve);
  });
  const authLabel = authMode === 'oauth' ? (oauthPassphrase ? 'oauth' : 'oauth-missing') : (authToken ? authMode : 'missing');
  console.error(`repo-harness mcp http listening on http://${host}:${port}/mcp (auth: ${authLabel})`);

  const shutdown = () => {
    clearInterval(cleanupTimer);
    void sessions.closeAll();
    tokenStore?.flush();
    httpServer.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
