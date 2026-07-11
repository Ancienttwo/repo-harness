import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { redirectUriMatches } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { InvalidScopeError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  createMcpCodingRuntime,
  createMcpToolContext,
  createRepoHarnessMcpServer,
  shutdownAllMcpCodingRuntimes,
  shutdownMcpCodingRuntime,
  type McpCodingRuntime,
  type McpServerOptions,
} from '../server';
import {
  loadMcpLocalConfig,
  mcpOAuthTokenStorePath,
  parseMcpHttpAuthMode,
  readMcpBearerToken,
  readMcpOAuthPassphrase,
  resolveMcpConfigScope,
  type McpHttpAuthMode,
} from '../auth';
import { createMcpOAuthProvider, McpOAuthTokenStore, type McpStoredAuthInfo } from '../oauth';
import { readRegisteredRepoHarnessRepos, repoHarnessAuthorizationRevision } from '../../../effects/repo-registry';
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

type McpHttpTransport = StreamableHTTPServerTransport & { authorizationId?: string };

function reportCodingRuntimeCleanupError(error: unknown): void {
  const name = error instanceof Error && error.name ? error.name : 'UnknownError';
  console.error(`[repo-harness-mcp] background coding runtime cleanup failed: ${name}`);
}

export class CodingAuthorizationRuntimeStore {
  private readonly runtimes = new Map<string, { runtime: McpCodingRuntime; lastUsedAt: number }>();

  constructor(
    readonly ttlMs: number,
    readonly maxRuntimes: number,
    private readonly now: () => number = Date.now,
    private readonly shutdown: (runtime: McpCodingRuntime) => Promise<void> = shutdownMcpCodingRuntime,
    private readonly onCleanupError: (error: unknown) => void = reportCodingRuntimeCleanupError,
  ) {}

  getOrCreate(authorizationId: string, factory: () => McpCodingRuntime): McpCodingRuntime {
    const existing = this.runtimes.get(authorizationId);
    if (existing) {
      existing.lastUsedAt = this.now();
      return existing.runtime;
    }
    if (this.runtimes.size >= this.maxRuntimes) {
      throw new Error('AUTHORIZATION_RUNTIME_LIMIT_REACHED');
    }
    const runtime = factory();
    this.runtimes.set(authorizationId, { runtime, lastUsedAt: this.now() });
    return runtime;
  }

  touch(authorizationId: string): boolean {
    const existing = this.runtimes.get(authorizationId);
    if (!existing) return false;
    existing.lastUsedAt = this.now();
    return true;
  }

  cleanupExpired(): number {
    const now = this.now();
    const expired = Array.from(this.runtimes.entries())
      .filter(([, record]) => now - record.lastUsedAt >= this.ttlMs);
    for (const [authorizationId] of expired) this.runtimes.delete(authorizationId);
    void Promise.all(expired.map(([, record]) => this.shutdown(record.runtime)))
      .catch(this.onCleanupError);
    return expired.length;
  }

  async close(authorizationId: string): Promise<void> {
    const existing = this.runtimes.get(authorizationId);
    if (!existing) return;
    this.runtimes.delete(authorizationId);
    await this.shutdown(existing.runtime);
  }

  async closeAll(): Promise<void> {
    const records = Array.from(this.runtimes.values());
    this.runtimes.clear();
    await Promise.all(records.map((record) => this.shutdown(record.runtime)));
  }
}

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

function getPublicOrigin(req: Request, configured?: string): string {
  if (configured) return normalizePublicOrigin(configured);
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

export function isAllowedMcpOAuthRedirectUri(
  redirectUri: string,
  allowedHosts: string[] = ['chatgpt.com', 'localhost', '127.0.0.1', '::1'],
): boolean {
  try {
    const url = new URL(redirectUri);
    const normalizedHost = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const allowed = new Set(allowedHosts.map((host) => host.replace(/^\[|\]$/g, '').toLowerCase()));
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(normalizedHost) && allowed.has(normalizedHost)) {
      return true;
    }
    return url.protocol === 'https:' && url.username === '' && url.password === '' && allowed.has(normalizedHost);
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

function renderPassphrasePage(params: URLSearchParams, opts: { coding?: boolean; repoNames?: string[] } = {}): string {
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
<p>${opts.coding
    ? `This Connector can edit source files and run arbitrary shell commands with your local user account in these repos: ${escapeHtmlAttribute((opts.repoNames ?? []).join(', ') || '(none)')}. Allowed roots are not a shell sandbox. Access tokens expire after 1 hour; refresh authorization lasts up to 30 days and rotates.`
    : 'Enter the local MCP passphrase to let ChatGPT use this workflow-scoped connector.'}</p>
<form method="POST" action="/authorize">
${hiddenFields}
<input type="password" name="passphrase" placeholder="Passphrase" autofocus>
<button type="submit">Authorize</button>
</form>
</main></body></html>`;
}

function requirePassphrase(
  passphrase: string,
  opts: { coding?: boolean; repoNames?: string[] } = {},
): (req: Request, res: Response, next: NextFunction) => void {
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
    res.type('html').send(renderPassphrasePage(params, opts));
  };
}

function oauthAuthorizationHandler(provider: ReturnType<typeof createMcpOAuthProvider>, allowedRedirectHosts: string[]) {
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
    if (!redirectUri || !isAllowedMcpOAuthRedirectUri(redirectUri, allowedRedirectHosts)) {
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

    try {
      await provider.authorize(client as OAuthClientInformationFull, {
        state,
        scopes: scope ? scope.split(' ') : [],
        redirectUri,
        codeChallenge,
      }, res);
    } catch (error) {
      if (error instanceof InvalidScopeError) {
        res.status(400).json({ error: 'invalid_scope', error_description: error.message });
        return;
      }
      throw error;
    }
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

function sendOAuthUnauthorized(req: Request, res: Response, description: string, publicOrigin?: string): void {
  const resourceMetadataUrl = `${getPublicOrigin(req, publicOrigin)}/.well-known/oauth-protected-resource/mcp`;
  res.setHeader(
    'www-authenticate',
    `Bearer error="invalid_token", error_description="${description}", resource_metadata="${resourceMetadataUrl}"`,
  );
  res.status(401).json({ error: 'invalid_token', message: description });
}

function requireMcpHttpAuth(
  mode: McpHttpAuthMode,
  bearerToken: string | null,
  provider: ReturnType<typeof createMcpOAuthProvider> | null,
  publicOrigin?: string,
) {
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
      sendOAuthUnauthorized(req, res, token ? 'OAuth is not configured' : 'Missing Authorization header', publicOrigin);
      return;
    }
    provider.verifyAccessToken(token)
      .then((authInfo) => {
        (req as unknown as Record<string, unknown>).auth = authInfo;
        next();
      })
      .catch((error: unknown) => {
        if (error instanceof InvalidTokenError) {
          sendOAuthUnauthorized(req, res, error.message, publicOrigin);
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

function authorizationIdFromRequest(req: Request): string | undefined {
  const auth = (req as unknown as Record<string, unknown>).auth as McpStoredAuthInfo | undefined;
  const authorizationId = auth?.authorizationId;
  return typeof authorizationId === 'string' && authorizationId.trim() ? authorizationId : undefined;
}

function authorizationOwnsTransport(req: Request, transport: McpHttpTransport, coding: boolean): boolean {
  return !coding || transport.authorizationId === authorizationIdFromRequest(req);
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

function recordForSession(sessions: McpSessionStore<McpHttpTransport>, sessionId: string | undefined) {
  if (!sessionId || !isValidSessionId(sessionId)) return undefined;
  return sessions.get(sessionId);
}

async function handleMcpPost(
  req: Request,
  res: Response,
  opts: McpHttpOptions,
  sessions: McpSessionStore<McpHttpTransport>,
  codingRuntimes: CodingAuthorizationRuntimeStore | null,
): Promise<void> {
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
    const authorizationId = codingRuntimes ? authorizationIdFromRequest(req) : undefined;
    if (codingRuntimes && !authorizationId) {
      sendOAuthUnauthorized(req, res, 'Coding authorization identity is missing');
      return;
    }
    let codingRuntime: McpCodingRuntime | undefined;
    if (codingRuntimes && authorizationId) {
      try {
        codingRuntime = codingRuntimes.getOrCreate(authorizationId, () => createMcpCodingRuntime(
          { ...opts, codingRuntime: null },
          `mcp_auth_${createHash('sha256').update(authorizationId).digest('hex').slice(0, 24)}`,
        ));
      } catch (error) {
        if (error instanceof Error && error.message === 'AUTHORIZATION_RUNTIME_LIMIT_REACHED') {
          res.status(429).json({ error: { code: error.message, message: 'Too many active coding authorizations.' } });
          return;
        }
        throw error;
      }
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => { sessions.set(newSessionId, transport); },
    }) as McpHttpTransport;
    transport.authorizationId = authorizationId;
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    const server = createRepoHarnessMcpServer({ ...opts, codingRuntime });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
    return;
  }
  if (sessionId) {
    const record = recordForSession(sessions, sessionId);
    if (record && authorizationOwnsTransport(req, record.transport, codingRuntimes !== null)) {
      const authorizationId = authorizationIdFromRequest(req);
      if (authorizationId) codingRuntimes?.touch(authorizationId);
      await record.transport.handleRequest(req, res, body);
      return;
    }
  }
  sendSessionNotFound(res);
}

async function handleMcpGet(
  req: Request,
  res: Response,
  sessions: McpSessionStore<McpHttpTransport>,
  codingRuntimes: CodingAuthorizationRuntimeStore | null,
): Promise<void> {
  const record = recordForSession(sessions, sessionIdFromRequest(req));
  if (!record || !authorizationOwnsTransport(req, record.transport, codingRuntimes !== null)) {
    sendSessionNotFound(res);
    return;
  }
  const authorizationId = authorizationIdFromRequest(req);
  if (authorizationId) codingRuntimes?.touch(authorizationId);
  await record.transport.handleRequest(req, res);
}

async function handleMcpDelete(
  req: Request,
  res: Response,
  sessions: McpSessionStore<McpHttpTransport>,
  codingRuntimes: CodingAuthorizationRuntimeStore | null,
): Promise<void> {
  const sessionId = sessionIdFromRequest(req);
  const record = recordForSession(sessions, sessionId);
  if (!sessionId || !record || !authorizationOwnsTransport(req, record.transport, codingRuntimes !== null)) {
    sendSessionNotFound(res);
    return;
  }
  const authorizationId = authorizationIdFromRequest(req);
  if (authorizationId) codingRuntimes?.touch(authorizationId);
  await record.transport.handleRequest(req, res);
  await sessions.closeAndDelete(sessionId);
}

export async function startMcpHttp(opts: McpHttpOptions): Promise<void> {
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? 8765;
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  const configScope = resolveMcpConfigScope(repoRoot);
  const localConfig = loadMcpLocalConfig(repoRoot, configScope);
  const profile = opts.profile ?? localConfig?.profile ?? 'planner';
  const storedEndpoint = localConfig?.chatgpt?.endpoint;
  const storedPublicOrigin = storedEndpoint ? new URL(storedEndpoint).origin : undefined;
  const configuredPublicOrigin = process.env.REPO_HARNESS_MCP_PUBLIC_ORIGIN?.trim()
    ? normalizePublicOrigin(process.env.REPO_HARNESS_MCP_PUBLIC_ORIGIN.trim())
    : storedPublicOrigin;
  if (!isLoopbackBindHost(host) && !configuredPublicOrigin) {
    throw new Error('REPO_HARNESS_MCP_PUBLIC_ORIGIN is required when binding MCP HTTP to a non-loopback host');
  }
  const coding = profile === 'coding';
  if (coding && (configScope !== 'user' || localConfig?.profile !== 'coding' || localConfig.coding?.enabled !== true)) {
    throw new Error('coding profile requires enabled user-scoped v3 setup');
  }
  const readWriteRepos = readRegisteredRepoHarnessRepos({ adoptedOnly: true }).filter((repo) => repo.accessMode === 'read_write');
  if (coding && readWriteRepos.length === 0) {
    throw new Error('coding profile requires at least one explicitly registered read_write repo');
  }
  const authMode = parseMcpHttpAuthMode(opts.auth);
  if (coding && authMode !== 'oauth') {
    throw new Error('coding profile requires OAuth authentication');
  }
  const authToken = authMode === 'bearer' || authMode === 'url-token' ? opts.authToken ?? readMcpBearerToken(repoRoot, configScope) : null;
  const oauthPassphrase = authMode === 'oauth' ? readMcpOAuthPassphrase(repoRoot, configScope) : null;
  const sessionTtlMs = boundedIntegerEnv('REPO_HARNESS_MCP_SESSION_TTL_MS', SESSION_TTL_MS, 1_000, 24 * 60 * 60 * 1000);
  const maxSessions = boundedIntegerEnv('REPO_HARNESS_MCP_MAX_SESSIONS', MAX_SESSIONS, 1, 256);
  const sessions = new McpSessionStore<McpHttpTransport>({ ttlMs: sessionTtlMs, maxSessions });
  const codingRuntimes = coding ? new CodingAuthorizationRuntimeStore(sessionTtlMs, maxSessions) : null;
  const tokenStore = authMode === 'oauth' ? new McpOAuthTokenStore(mcpOAuthTokenStorePath(repoRoot, configScope)) : null;
  tokenStore?.load();
  let observedAuthorizationRevision = repoHarnessAuthorizationRevision();
  const oauthProvider = tokenStore ? createMcpOAuthProvider(tokenStore, {
    profile,
    authorizationRevision: () => repoHarnessAuthorizationRevision(),
    accessTokenTtlSeconds: coding ? 60 * 60 : 30 * 24 * 60 * 60,
    refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
    onAuthorizationRevoked: (authorizationId) => codingRuntimes?.close(authorizationId),
  }) : null;
  const allowedRedirectHosts = localConfig?.auth?.allowedRedirectHosts ?? ['chatgpt.com', 'localhost', '127.0.0.1', '::1'];
  const publicHost = configuredPublicOrigin ? new URL(configuredPublicOrigin).host.toLowerCase() : undefined;
  const allowedRequestHosts = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
    ...(publicHost ? [publicHost] : []),
  ]);
  let authorizationCleanupRunning = false;
  const closeStaleCodingState = (): void => {
    if (!coding || authorizationCleanupRunning) return;
    authorizationCleanupRunning = true;
    void Promise.all([
      sessions.closeAll(),
      codingRuntimes?.closeAll() ?? Promise.resolve(),
    ])
      .catch(reportCodingRuntimeCleanupError)
      .finally(() => { authorizationCleanupRunning = false; });
  };
  const authorizationTimer = coding ? setInterval(() => {
    const currentRevision = repoHarnessAuthorizationRevision();
    const liveConfig = loadMcpLocalConfig(repoRoot, 'user');
    if (currentRevision !== observedAuthorizationRevision) {
      observedAuthorizationRevision = currentRevision;
      closeStaleCodingState();
    }
    if (liveConfig?.profile !== 'coding' || liveConfig.coding?.enabled !== true) closeStaleCodingState();
  }, 1_000) : undefined;
  authorizationTimer?.unref?.();
  const cleanupTimer = setInterval(() => {
    sessions.cleanupExpired();
    codingRuntimes?.cleanupExpired();
  }, Math.min(sessionTtlMs, 60_000));
  cleanupTimer.unref?.();
  const app = express();
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    if (coding) {
      const liveConfig = loadMcpLocalConfig(repoRoot, 'user');
      const hasGrant = readRegisteredRepoHarnessRepos({ adoptedOnly: true }).some((repo) => repo.accessMode === 'read_write');
      if (liveConfig?.profile !== 'coding' || liveConfig.coding?.enabled !== true || !hasGrant) {
        closeStaleCodingState();
        res.status(503).json({ error: 'coding_disabled' });
        return;
      }
    }
    const forwardedHost = typeof req.headers['x-forwarded-host'] === 'string' ? req.headers['x-forwarded-host'].split(',')[0].trim().toLowerCase() : undefined;
    const requestHost = forwardedHost ?? req.headers.host?.toLowerCase();
    if (coding && (!requestHost || !allowedRequestHosts.has(requestHost))) {
      res.status(421).json({ error: 'host_not_allowed' });
      return;
    }
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    if (coding && origin && origin !== 'https://chatgpt.com') {
      res.status(403).json({ error: 'origin_not_allowed' });
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', coding ? (origin ?? 'https://chatgpt.com') : (origin ?? '*'));
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
    codingRuntimes?.cleanupExpired();
    const ctx = createMcpToolContext({ ...opts, repo: repoRoot, codingRuntime: null });
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
      public_origin: getPublicOrigin(req, configuredPublicOrigin),
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
    app.use('/authorize', requirePassphrase(oauthPassphrase ?? '', { coding, repoNames: readWriteRepos.map((repo) => repo.path.split('/').pop() ?? repo.id) }));
    app.use('/authorize', oauthAuthorizationHandler(oauthProvider, allowedRedirectHosts));
    app.use('/token', tokenHandler({ provider: oauthProvider }));
    app.use('/revoke', revocationHandler({ provider: oauthProvider }));
    app.use('/register', clientRegistrationHandler({ clientsStore: oauthProvider.clientsStore }));
    app.get('/.well-known/oauth-authorization-server', (req, res) => {
      const origin = getPublicOrigin(req, configuredPublicOrigin);
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
        scopes_supported: ['repo-harness', ...(coding ? ['repo-harness.coding'] : []), 'offline_access'],
      });
    });
    app.get('/.well-known/openid-configuration', (req, res) => {
      const origin = getPublicOrigin(req, configuredPublicOrigin);
      res.json({
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        registration_endpoint: `${origin}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
        scopes_supported: ['repo-harness', ...(coding ? ['repo-harness.coding'] : []), 'offline_access'],
      });
    });
    app.get('/.well-known/oauth-protected-resource/mcp', (req, res) => {
      const origin = getPublicOrigin(req, configuredPublicOrigin);
      res.json({
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        scopes_supported: ['repo-harness', ...(coding ? ['repo-harness.coding'] : []), 'offline_access'],
        bearer_methods_supported: ['header'],
      });
    });
  }

  app.post('/mcp', requireMcpHttpAuth(authMode, authToken, oauthProvider, configuredPublicOrigin), express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    handleMcpPost(req, res, { ...opts, repo: repoRoot }, sessions, codingRuntimes).catch((error: unknown) => {
      if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    });
  });
  app.get('/mcp', requireMcpHttpAuth(authMode, authToken, oauthProvider, configuredPublicOrigin), (req, res) => {
    handleMcpGet(req, res, sessions, codingRuntimes).catch((error: unknown) => {
      if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    });
  });
  app.delete('/mcp', requireMcpHttpAuth(authMode, authToken, oauthProvider, configuredPublicOrigin), (req, res) => {
    handleMcpDelete(req, res, sessions, codingRuntimes).catch((error: unknown) => {
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

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(cleanupTimer);
    if (authorizationTimer) clearInterval(authorizationTimer);
    void (async () => {
      await sessions.closeAll();
      await codingRuntimes?.closeAll();
      await shutdownAllMcpCodingRuntimes();
      tokenStore?.flush();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      process.exit(0);
    })();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
