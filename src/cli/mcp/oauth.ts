import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, renameSync } from 'fs';
import { dirname } from 'path';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { InvalidGrantError, InvalidScopeError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

interface TokenData {
  accessTokens?: Record<string, AuthInfo>;
  refreshTokens?: Record<string, string | RefreshTokenRecord>;
  clients?: Record<string, OAuthClientInformationFull>;
}

interface RefreshTokenRecord {
  accessToken: string;
  expiresAt?: number;
}

type StoredAuthInfo = AuthInfo & {
  profile?: string;
  authorizationRevision?: number;
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function issueToken(): string {
  return randomUUID();
}

function normalizeScopes(scopes: string[] | undefined, profile = 'planner'): string[] {
  const allowed = new Set(['repo-harness', 'offline_access', ...(profile === 'coding' ? ['repo-harness.coding'] : [])]);
  const normalized = (scopes ?? [])
    .flatMap((scope) => scope.split(' '))
    .map((scope) => scope.trim())
    .filter((scope) => allowed.has(scope));
  const unique = Array.from(new Set(normalized));
  if (!unique.includes('repo-harness')) unique.unshift('repo-harness');
  return unique;
}

export class McpOAuthTokenStore implements OAuthRegisteredClientsStore {
  private accessTokens = new Map<string, StoredAuthInfo>();
  private refreshTokens = new Map<string, RefreshTokenRecord>();
  private clients = new Map<string, OAuthClientInformationFull>();
  private clock: () => number = nowSeconds;

  constructor(private readonly path: string) {}

  setClock(clock: () => number): void {
    this.clock = clock;
  }

  load(): void {
    if (!existsSync(this.path)) return;
    try {
      const data = JSON.parse(readFileSync(this.path, 'utf-8')) as TokenData;
      const refreshTargets = new Set(Object.values(data.refreshTokens ?? {}).map((entry) => typeof entry === 'string' ? entry : entry.accessToken));
      for (const [token, info] of Object.entries(data.accessTokens ?? {})) {
        if (!info.expiresAt || info.expiresAt > nowSeconds() || refreshTargets.has(token)) {
          this.accessTokens.set(token, info);
        }
      }
      for (const [token, record] of Object.entries(data.refreshTokens ?? {})) {
        this.refreshTokens.set(token, typeof record === 'string' ? { accessToken: record } : record);
      }
      for (const [clientId, client] of Object.entries(data.clients ?? {})) {
        this.clients.set(clientId, client);
      }
    } catch (_error) {
      // Corrupt local auth state should not prevent starting the server.
    }
  }

  flush(): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    chmodSync(dirname(this.path), 0o700);
    const data: TokenData = {
      accessTokens: Object.fromEntries(this.accessTokens),
      refreshTokens: Object.fromEntries(this.refreshTokens),
      clients: Object.fromEntries(this.clients),
    };
    const tmpPath = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
    renameSync(tmpPath, this.path);
    chmodSync(this.path, 0o600);
  }

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }

  registerClient(client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>): OAuthClientInformationFull {
    const candidate = client as Partial<OAuthClientInformationFull>;
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: candidate.client_id ?? randomUUID(),
      client_id_issued_at: candidate.client_id_issued_at ?? nowSeconds(),
    };
    this.clients.set(full.client_id, full);
    this.flush();
    return full;
  }

  getAccessToken(token: string): StoredAuthInfo | undefined {
    return this.accessTokens.get(token);
  }

  setAccessToken(token: string, info: StoredAuthInfo): void {
    this.accessTokens.set(token, info);
    this.flush();
  }

  deleteAccessToken(token: string): void {
    this.accessTokens.delete(token);
    this.flush();
  }

  getRefreshToken(token: string): string | undefined {
    const record = this.refreshTokens.get(token);
    if (!record) return undefined;
    if (record.expiresAt !== undefined && record.expiresAt <= this.clock()) {
      this.refreshTokens.delete(token);
      this.flush();
      return undefined;
    }
    return record.accessToken;
  }

  setRefreshToken(token: string, accessToken: string, expiresAt?: number): void {
    this.refreshTokens.set(token, { accessToken, expiresAt });
    this.flush();
  }

  deleteRefreshToken(token: string): void {
    this.refreshTokens.delete(token);
    this.flush();
  }

  findRefreshTokenByAccessToken(accessToken: string): string | undefined {
    for (const [refreshToken, record] of this.refreshTokens) {
      if (record.accessToken === accessToken) return refreshToken;
    }
    return undefined;
  }

  revokeMismatchedAuthorization(profile: string, authorizationRevision: number): void {
    const revoked = new Set<string>();
    for (const [token, info] of this.accessTokens) {
      if (info.profile === profile && info.authorizationRevision !== authorizationRevision) {
        this.accessTokens.delete(token);
        revoked.add(token);
      }
    }
    for (const [token, record] of this.refreshTokens) {
      if (revoked.has(record.accessToken)) this.refreshTokens.delete(token);
    }
    if (revoked.size > 0) this.flush();
  }
}

interface AuthorizationCodeRecord {
  challenge: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  createdAt: number;
  expiresAt: number;
}

export function createMcpOAuthProvider(
  store: McpOAuthTokenStore,
  opts: {
    readonly nowSeconds?: () => number;
    readonly authorizationCodeTtlSeconds?: number;
    readonly accessTokenTtlSeconds?: number;
    readonly refreshTokenTtlSeconds?: number;
    readonly profile?: string;
    readonly authorizationRevision?: number | (() => number);
  } = {},
): OAuthServerProvider {
  const authCodes = new Map<string, AuthorizationCodeRecord>();
  const clock = opts.nowSeconds ?? nowSeconds;
  store.setClock(clock);
  const authorizationCodeTtlSeconds = opts.authorizationCodeTtlSeconds ?? 10 * 60;
  const accessTokenTtlSeconds = opts.accessTokenTtlSeconds ?? 30 * 24 * 60 * 60;
  const refreshTokenTtlSeconds = opts.refreshTokenTtlSeconds ?? 30 * 24 * 60 * 60;
  const profile = opts.profile ?? 'planner';
  const revisionOption = opts.authorizationRevision;
  const currentAuthorizationRevision: () => number = typeof revisionOption === 'function'
    ? revisionOption
    : () => revisionOption ?? 0;
  if (profile === 'coding') store.revokeMismatchedAuthorization(profile, currentAuthorizationRevision());

  const cleanupExpiredAuthorizationCodes = (): void => {
    const now = clock();
    for (const [code, record] of authCodes) {
      if (record.expiresAt > now) continue;
      authCodes.delete(code);
    }
  };

  const authorizationCodeRecord = (authorizationCode: string): AuthorizationCodeRecord => {
    cleanupExpiredAuthorizationCodes();
    const stored = authCodes.get(authorizationCode);
    if (!stored) throw new InvalidGrantError('Invalid authorization code');
    if (stored.expiresAt <= clock()) {
      authCodes.delete(authorizationCode);
      throw new InvalidGrantError('Authorization code has expired');
    }
    return stored;
  };

  return {
    get clientsStore(): OAuthRegisteredClientsStore {
      return store;
    },

    async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res): Promise<void> {
      cleanupExpiredAuthorizationCodes();
      const scopes = normalizeScopes(params.scopes, profile);
      if (profile === 'coding' && !scopes.includes('repo-harness.coding')) {
        throw new InvalidScopeError('The repo-harness.coding scope is required for coding authorization');
      }
      const code = issueToken();
      const createdAt = clock();
      authCodes.set(code, {
        challenge: params.codeChallenge,
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        scopes,
        createdAt,
        expiresAt: createdAt + authorizationCodeTtlSeconds,
      });
      const redirectUrl = new URL(params.redirectUri);
      redirectUrl.searchParams.set('code', code);
      if (params.state) redirectUrl.searchParams.set('state', params.state);
      res.redirect(302, redirectUrl.toString());
    },

    async challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
      return authorizationCodeRecord(authorizationCode).challenge;
    },

    async exchangeAuthorizationCode(
      client: OAuthClientInformationFull,
      authorizationCode: string,
      _codeVerifier?: string,
      redirectUri?: string,
    ): Promise<OAuthTokens> {
      const stored = authorizationCodeRecord(authorizationCode);
      if (stored.clientId !== client.client_id) {
        throw new InvalidGrantError('Invalid authorization code');
      }
      if (redirectUri !== stored.redirectUri) {
        throw new InvalidGrantError('redirect_uri mismatch');
      }
      authCodes.delete(authorizationCode);
      const accessToken = issueToken();
      const expiresIn = accessTokenTtlSeconds;
      const expiresAt = clock() + expiresIn;
      const scopes = normalizeScopes(stored.scopes, profile);
      const authorizationRevision = currentAuthorizationRevision();
      store.setAccessToken(accessToken, {
        token: accessToken,
        clientId: client.client_id,
        scopes,
        expiresAt,
        profile,
        authorizationRevision,
      });
      const response: OAuthTokens = {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
        scope: scopes.join(' '),
      };
      if (scopes.includes('offline_access')) {
        const refreshToken = issueToken();
        store.setRefreshToken(refreshToken, accessToken, clock() + refreshTokenTtlSeconds);
        response.refresh_token = refreshToken;
      }
      return response;
    },

    async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string): Promise<OAuthTokens> {
      const accessToken = store.getRefreshToken(refreshToken);
      const existing = accessToken ? store.getAccessToken(accessToken) : undefined;
      if (!accessToken || !existing || existing.clientId !== client.client_id) {
        throw new InvalidGrantError('Invalid refresh token');
      }
      store.deleteRefreshToken(refreshToken);
      store.deleteAccessToken(accessToken);
      const nextAccessToken = issueToken();
      const nextRefreshToken = issueToken();
      const expiresIn = accessTokenTtlSeconds;
      const scopes = normalizeScopes(existing.scopes, profile);
      const authorizationRevision = currentAuthorizationRevision();
      if ((existing.profile ?? 'planner') !== profile || (profile === 'coding' && existing.authorizationRevision !== authorizationRevision)) {
        throw new InvalidGrantError('Refresh token authorization is stale');
      }
      store.setAccessToken(nextAccessToken, { ...existing, token: nextAccessToken, scopes, expiresAt: clock() + expiresIn, profile, authorizationRevision });
      store.setRefreshToken(nextRefreshToken, nextAccessToken, clock() + refreshTokenTtlSeconds);
      return {
        access_token: nextAccessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
        refresh_token: nextRefreshToken,
        scope: scopes.join(' '),
      };
    },

    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const info = store.getAccessToken(token);
      if (!info) throw new InvalidTokenError('Token not found');
      if ((info.profile ?? 'planner') !== profile) throw new InvalidTokenError('Token profile mismatch');
      if (profile === 'coding' && (info.authorizationRevision !== currentAuthorizationRevision() || !info.scopes.includes('repo-harness.coding'))) {
        const refreshToken = store.findRefreshTokenByAccessToken(token);
        if (refreshToken) store.deleteRefreshToken(refreshToken);
        store.deleteAccessToken(token);
        throw new InvalidTokenError('Coding authorization is stale or missing');
      }
      if (info.expiresAt && info.expiresAt < clock()) {
        if (!store.findRefreshTokenByAccessToken(token)) {
          store.deleteAccessToken(token);
        }
        throw new InvalidTokenError('Token has expired');
      }
      return info;
    },

    async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
      const linkedAccessToken = store.getRefreshToken(request.token);
      if (linkedAccessToken) {
        store.deleteRefreshToken(request.token);
        store.deleteAccessToken(linkedAccessToken);
        return;
      }
      store.deleteAccessToken(request.token);
      const refreshToken = store.findRefreshTokenByAccessToken(request.token);
      if (refreshToken) store.deleteRefreshToken(refreshToken);
    },
  };
}
