import { randomUUID, timingSafeEqual } from 'crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { redirectUriMatches } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createRepoHarnessMcpServer, type McpServerOptions } from '../server';
import {
  mcpOAuthTokenStorePath,
  parseMcpHttpAuthMode,
  readMcpBearerToken,
  readMcpOAuthPassphrase,
  type McpHttpAuthMode,
} from '../auth';
import { createMcpOAuthProvider, McpOAuthTokenStore } from '../oauth';
import { resolveMcpRepoRoot } from '../repo';

export interface McpHttpOptions extends McpServerOptions {
  host?: string;
  port?: number;
  authToken?: string;
  auth?: string;
}

function bearerFromRequest(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export function isAuthorizedMcpHttpRequest(req: Request, expectedToken: string | null): boolean {
  if (!expectedToken) return false;
  return bearerFromRequest(req) === expectedToken;
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
    try {
      return new URL(configured).origin;
    } catch (_error) {
      // Fall through to request-derived origin.
    }
  }
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? '127.0.0.1:8765';
  return `${proto}://${host}`;
}

export function isAllowedMcpOAuthRedirectUri(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      return true;
    }
    if (
      url.protocol === 'https:' &&
      (url.origin === 'https://chatgpt.com' || url.origin === 'https://chat.openai.com') &&
      url.pathname.startsWith('/connector/oauth/')
    ) {
      return true;
    }
    return false;
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
    if (mode === 'bearer') {
      if (!isAuthorizedMcpHttpRequest(req, bearerToken)) {
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

async function handleMcpPost(req: Request, res: Response, opts: McpHttpOptions, transports: Map<string, StreamableHTTPServerTransport>): Promise<void> {
  let body: unknown;
  try {
    body = rawBodyToJson(req.body as Buffer);
  } catch (_error) {
    res.status(400).json({ error: 'invalid JSON request body' });
    return;
  }
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId && isInitializeRequest(body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => transports.set(newSessionId, transport),
    });
    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };
    const server = createRepoHarnessMcpServer(opts);
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
    return;
  }
  if (sessionId) {
    const transport = transports.get(sessionId);
    if (transport) {
      await transport.handleRequest(req, res, body);
      return;
    }
  }
  res.status(400).json({ error: 'No valid session' });
}

async function handleMcpGet(req: Request, res: Response, transports: Map<string, StreamableHTTPServerTransport>): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).json({ error: 'No valid session' });
    return;
  }
  await transport.handleRequest(req, res);
}

export async function startMcpHttp(opts: McpHttpOptions): Promise<void> {
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? 8765;
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  const authMode = parseMcpHttpAuthMode(opts.auth);
  const authToken = authMode === 'bearer' ? opts.authToken ?? readMcpBearerToken(repoRoot) : null;
  const oauthPassphrase = authMode === 'oauth' ? readMcpOAuthPassphrase(repoRoot) : null;
  const tokenStore = authMode === 'oauth' ? new McpOAuthTokenStore(mcpOAuthTokenStorePath(repoRoot)) : null;
  tokenStore?.load();
  const oauthProvider = tokenStore ? createMcpOAuthProvider(tokenStore) : null;
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const app = express();
  app.set('trust proxy', 1);

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      server: 'repo-harness-mcp',
      auth: authMode === 'oauth' ? (oauthPassphrase ? 'oauth' : 'missing') : (authToken ? 'required' : 'missing'),
    });
  });

  if (authMode === 'oauth' && oauthProvider) {
    app.use('/authorize', express.urlencoded({ extended: false, limit: '10kb' }));
    app.use('/authorize', requirePassphrase(oauthPassphrase ?? ''));
    app.use('/authorize', oauthAuthorizationHandler(oauthProvider));
    app.use('/token', tokenHandler({ provider: oauthProvider, rateLimit: false }));
    app.use('/revoke', revocationHandler({ provider: oauthProvider, rateLimit: false }));
    app.use('/register', clientRegistrationHandler({ clientsStore: oauthProvider.clientsStore, rateLimit: false }));
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
        scopes_supported: ['repo-harness'],
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
        scopes_supported: ['repo-harness'],
      });
    });
    app.get('/.well-known/oauth-protected-resource/mcp', (req, res) => {
      const origin = getPublicOrigin(req);
      res.json({
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        scopes_supported: ['repo-harness'],
        bearer_methods_supported: ['header'],
      });
    });
  }

  app.post('/mcp', requireMcpHttpAuth(authMode, authToken, oauthProvider), express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    handleMcpPost(req, res, { ...opts, repo: repoRoot }, transports).catch((error: unknown) => {
      if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    });
  });
  app.get('/mcp', requireMcpHttpAuth(authMode, authToken, oauthProvider), (req, res) => {
    handleMcpGet(req, res, transports).catch((error: unknown) => {
      if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    });
  });
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

  const httpServer = app.listen(port, host);

  await new Promise<void>((resolve) => {
    httpServer.once('listening', resolve);
  });
  const authLabel = authMode === 'oauth' ? (oauthPassphrase ? 'oauth' : 'oauth-missing') : (authToken ? 'bearer' : 'missing');
  console.error(`repo-harness mcp http listening on http://${host}:${port}/mcp (auth: ${authLabel})`);

  const shutdown = () => {
    for (const transport of transports.values()) {
      void transport.close().catch(() => undefined);
    }
    tokenStore?.flush();
    httpServer.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
