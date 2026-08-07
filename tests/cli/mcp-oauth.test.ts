import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { InvalidGrantError, InvalidScopeError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { createMcpOAuthProvider, McpOAuthTokenStore } from '../../src/cli/mcp/oauth';

function redirectRecorder() {
  const state = { status: 0, url: '' };
  return {
    state,
    response: {
      redirect(status: number, url: string) {
        state.status = status;
        state.url = url;
      },
    },
  };
}

describe('mcp oauth provider', () => {
  test('authorization codes bind client, redirect URI, scopes, expiry, and single use', async () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-oauth-provider-'));
    try {
      let now = 10_000;
      const store = new McpOAuthTokenStore(join(root, 'tokens.json'));
      const provider = createMcpOAuthProvider(store, {
        nowSeconds: () => now,
        authorizationCodeTtlSeconds: 30,
      });
      const client = store.registerClient({
        redirect_uris: ['http://localhost/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: 'repo-harness-test',
      });

      const first = redirectRecorder();
      await provider.authorize(client, {
        state: 'state-1',
        scopes: ['repo-harness', 'offline_access', 'not-allowed'],
        redirectUri: 'http://localhost/callback',
        codeChallenge: 'challenge-1',
      }, first.response as never);
      expect(first.state.status).toBe(302);
      const firstCode = new URL(first.state.url).searchParams.get('code') ?? '';
      expect(await provider.challengeForAuthorizationCode(client, firstCode)).toBe('challenge-1');

      await expect(provider.exchangeAuthorizationCode(client, firstCode, 'verifier', 'http://localhost/other'))
        .rejects.toBeInstanceOf(InvalidGrantError);
      const firstTokens = await provider.exchangeAuthorizationCode(client, firstCode, 'verifier', 'http://localhost/callback');
      expect(firstTokens.scope).toBe('repo-harness offline_access');
      expect(firstTokens.refresh_token).toBeTruthy();
      await expect(provider.exchangeAuthorizationCode(client, firstCode, 'verifier', 'http://localhost/callback'))
        .rejects.toBeInstanceOf(InvalidGrantError);

      const refreshed = await provider.exchangeRefreshToken(client, firstTokens.refresh_token ?? '');
      expect(refreshed.access_token).not.toBe(firstTokens.access_token);
      expect(refreshed.refresh_token).not.toBe(firstTokens.refresh_token);
      await expect(provider.exchangeRefreshToken(client, firstTokens.refresh_token ?? ''))
        .rejects.toBeInstanceOf(InvalidGrantError);
      await expect(provider.verifyAccessToken(firstTokens.access_token))
        .rejects.toBeInstanceOf(InvalidTokenError);
      expect(await provider.verifyAccessToken(refreshed.access_token)).toMatchObject({ clientId: client.client_id });

      const noOffline = redirectRecorder();
      await provider.authorize(client, {
        scopes: ['repo-harness'],
        redirectUri: 'http://localhost/callback',
        codeChallenge: 'challenge-2',
      }, noOffline.response as never);
      const noOfflineCode = new URL(noOffline.state.url).searchParams.get('code') ?? '';
      const noOfflineTokens = await provider.exchangeAuthorizationCode(client, noOfflineCode, 'verifier', 'http://localhost/callback');
      expect(noOfflineTokens.scope).toBe('repo-harness');
      expect(noOfflineTokens.refresh_token).toBeUndefined();

      const expired = redirectRecorder();
      await provider.authorize(client, {
        scopes: ['repo-harness'],
        redirectUri: 'http://localhost/callback',
        codeChallenge: 'challenge-3',
      }, expired.response as never);
      const expiredCode = new URL(expired.state.url).searchParams.get('code') ?? '';
      now += 31;
      await expect(provider.challengeForAuthorizationCode(client, expiredCode))
        .rejects.toBeInstanceOf(InvalidGrantError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('coding tokens are scope/profile/revision bound with one-hour access and rotating thirty-day refresh', async () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-oauth-coding-'));
    try {
      let now = 20_000;
      let authorizationRevision = 7;
      const revokedAuthorizations: string[] = [];
      const store = new McpOAuthTokenStore(join(root, 'tokens.json'));
      const coding = createMcpOAuthProvider(store, {
        nowSeconds: () => now,
        profile: 'coding',
        authorizationRevision: () => authorizationRevision,
        accessTokenTtlSeconds: 60 * 60,
        refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
        onAuthorizationRevoked: (authorizationId) => { revokedAuthorizations.push(authorizationId); },
      });
      const client = store.registerClient({
        redirect_uris: ['https://chatgpt.com/connector/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      });
      const redirect = redirectRecorder();
      await expect(coding.authorize(client, {
        scopes: ['repo-harness', 'offline_access'],
        redirectUri: client.redirect_uris[0]!,
        codeChallenge: 'missing-coding-scope',
      }, redirect.response as never)).rejects.toBeInstanceOf(InvalidScopeError);
      await coding.authorize(client, {
        scopes: ['repo-harness', 'repo-harness.coding', 'offline_access'],
        redirectUri: client.redirect_uris[0]!,
        codeChallenge: 'coding-challenge',
      }, redirect.response as never);
      const code = new URL(redirect.state.url).searchParams.get('code') ?? '';
      const tokens = await coding.exchangeAuthorizationCode(client, code, 'verifier', client.redirect_uris[0]);
      expect(tokens).toMatchObject({
        expires_in: 3600,
        scope: 'repo-harness repo-harness.coding offline_access',
      });
      const initialInfo = await coding.verifyAccessToken(tokens.access_token) as { authorizationId?: string };
      expect(initialInfo).toMatchObject({
        profile: 'coding',
        authorizationRevision: 7,
        scopes: ['repo-harness', 'repo-harness.coding', 'offline_access'],
      });
      expect(initialInfo.authorizationId).toMatch(/^[0-9a-f-]{36}$/);
      const authorizationId = initialInfo.authorizationId!;

      store.setAccessToken('legacy-coding-token', {
        token: 'legacy-coding-token',
        clientId: client.client_id,
        scopes: ['repo-harness', 'repo-harness.coding'],
        profile: 'coding',
        authorizationRevision: 7,
      });
      await expect(coding.verifyAccessToken('legacy-coding-token')).rejects.toBeInstanceOf(InvalidTokenError);

      const planner = createMcpOAuthProvider(store, { nowSeconds: () => now, profile: 'planner' });
      await expect(planner.verifyAccessToken(tokens.access_token)).rejects.toBeInstanceOf(InvalidTokenError);

      now += 3601;
      await expect(coding.verifyAccessToken(tokens.access_token)).rejects.toBeInstanceOf(InvalidTokenError);
      const rotated = await coding.exchangeRefreshToken(client, tokens.refresh_token ?? '');
      expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
      await expect(coding.exchangeRefreshToken(client, tokens.refresh_token ?? '')).rejects.toBeInstanceOf(InvalidGrantError);
      expect(await coding.verifyAccessToken(rotated.access_token)).toMatchObject({
        authorizationId,
      });

      const revocable = redirectRecorder();
      await coding.authorize(client, {
        scopes: ['repo-harness', 'repo-harness.coding', 'offline_access'],
        redirectUri: client.redirect_uris[0]!,
        codeChallenge: 'revocable-challenge',
      }, revocable.response as never);
      const revocableCode = new URL(revocable.state.url).searchParams.get('code') ?? '';
      const revocableTokens = await coding.exchangeAuthorizationCode(client, revocableCode, 'verifier', client.redirect_uris[0]);
      const revocableInfo = await coding.verifyAccessToken(revocableTokens.access_token) as { authorizationId?: string };
      const revocableAuthorizationId = revocableInfo.authorizationId!;
      await coding.revokeToken?.(client, { token: revocableTokens.refresh_token ?? '' });
      expect(revokedAuthorizations).toEqual([revocableAuthorizationId]);
      await expect(coding.verifyAccessToken(revocableTokens.access_token)).rejects.toBeInstanceOf(InvalidTokenError);

      authorizationRevision = 8;
      await expect(coding.verifyAccessToken(rotated.access_token)).rejects.toBeInstanceOf(InvalidTokenError);
      expect(revokedAuthorizations).toEqual([revocableAuthorizationId, authorizationId]);
      await expect(coding.exchangeRefreshToken(client, rotated.refresh_token ?? '')).rejects.toBeInstanceOf(InvalidGrantError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('dynamic client and refresh token survive server restart (issue #161)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-oauth-restart-'));
    try {
      const tokensPath = join(root, 'tokens.json');
      const storeA = new McpOAuthTokenStore(tokensPath);
      const providerA = createMcpOAuthProvider(storeA);
      const client = storeA.registerClient({
        redirect_uris: ['https://chatgpt.com/connector/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: 'chatgpt-connector',
      });

      const redirect = redirectRecorder();
      await providerA.authorize(client, {
        scopes: ['repo-harness', 'offline_access'],
        redirectUri: client.redirect_uris[0]!,
        codeChallenge: 'restart-challenge',
      }, redirect.response as never);
      const code = new URL(redirect.state.url).searchParams.get('code') ?? '';
      const tokens = await providerA.exchangeAuthorizationCode(client, code, 'verifier', client.redirect_uris[0]);
      expect(tokens.access_token).toBeTruthy();
      expect(tokens.refresh_token).toBeTruthy();

      const storeB = new McpOAuthTokenStore(tokensPath);
      storeB.load();
      const providerB = createMcpOAuthProvider(storeB);
      const reloadedClient = storeB.getClient(client.client_id);
      expect(reloadedClient).toBeTruthy();

      const refreshed = await providerB.exchangeRefreshToken(reloadedClient!, tokens.refresh_token ?? '');
      expect(refreshed.access_token).not.toBe(tokens.access_token);
      expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);
      expect(await providerB.verifyAccessToken(refreshed.access_token)).toMatchObject({ clientId: client.client_id });
      await expect(providerB.exchangeRefreshToken(reloadedClient!, tokens.refresh_token ?? ''))
        .rejects.toBeInstanceOf(InvalidGrantError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('dynamic client past its absolute TTL survives while a refresh token keeps it active (issue #161)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-oauth-client-ttl-active-'));
    try {
      const day = 24 * 60 * 60;
      let now = 1_000_000;
      const store = new McpOAuthTokenStore(join(root, 'tokens.json'));
      const provider = createMcpOAuthProvider(store, {
        nowSeconds: () => now,
        accessTokenTtlSeconds: 60 * 60,
        refreshTokenTtlSeconds: 30 * day,
      });
      const client = store.registerClient({
        redirect_uris: ['https://chatgpt.com/connector/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: 'chatgpt-connector',
      });

      const redirect = redirectRecorder();
      await provider.authorize(client, {
        scopes: ['repo-harness', 'offline_access'],
        redirectUri: client.redirect_uris[0]!,
        codeChallenge: 'client-ttl-challenge',
      }, redirect.response as never);
      const code = new URL(redirect.state.url).searchParams.get('code') ?? '';
      const tokens = await provider.exchangeAuthorizationCode(client, code, 'verifier', client.redirect_uris[0]);

      // Day 20: continued use slides the refresh token out to day 50.
      now += 20 * day;
      const rotated = await provider.exchangeRefreshToken(client, tokens.refresh_token ?? '');

      // Day 31: the client is past its absolute registration TTL and the rotated
      // access token expired on day 20, but the refresh token is still valid.
      now += 11 * day;
      expect(store.getClient(client.client_id)).toBeTruthy();

      const refreshedAfterTtl = await provider.exchangeRefreshToken(client, rotated.refresh_token ?? '');
      expect(refreshedAfterTtl.access_token).not.toBe(rotated.access_token);
      expect(await provider.verifyAccessToken(refreshedAfterTtl.access_token))
        .toMatchObject({ clientId: client.client_id });
      expect(store.getClient(client.client_id)).toBeTruthy();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('dynamic client past its absolute TTL is removed without tokens and with only zombie tokens', async () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-oauth-client-ttl-expired-'));
    try {
      const day = 24 * 60 * 60;
      let now = 2_000_000;
      const store = new McpOAuthTokenStore(join(root, 'tokens.json'), { nowSeconds: () => now });
      const registration = {
        redirect_uris: ['https://chatgpt.com/connector/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      };
      const idle = store.registerClient({ ...registration, client_name: 'never-used' });
      const zombie = store.registerClient({ ...registration, client_name: 'zombie-tokens' });

      // Zombie state: access token expired, and the refresh token pointing at it
      // expired too; both linger only because cleanup is lazy.
      store.setAccessToken('zombie-access', {
        token: 'zombie-access',
        clientId: zombie.client_id,
        scopes: ['repo-harness', 'offline_access'],
        expiresAt: now + 60 * 60,
      });
      store.setRefreshToken('zombie-refresh', 'zombie-access', now + 2 * 60 * 60);

      expect(store.getClient(idle.client_id)).toBeTruthy();
      expect(store.getClient(zombie.client_id)).toBeTruthy();

      now += 31 * day;
      expect(store.getClient(idle.client_id)).toBeUndefined();
      expect(store.getClient(zombie.client_id)).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('load() applies the same active-token exemption to expired dynamic clients', async () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-oauth-client-ttl-load-'));
    try {
      const tokensPath = join(root, 'tokens.json');
      const day = 24 * 60 * 60;
      const registeredAt = 3_000_000;
      const storeA = new McpOAuthTokenStore(tokensPath, { nowSeconds: () => registeredAt });
      const registration = {
        redirect_uris: ['https://chatgpt.com/connector/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      };
      const active = storeA.registerClient({ ...registration, client_name: 'active-client' });
      const idle = storeA.registerClient({ ...registration, client_name: 'idle-client' });
      storeA.setAccessToken('active-access', {
        token: 'active-access',
        clientId: active.client_id,
        scopes: ['repo-harness', 'offline_access'],
        expiresAt: registeredAt + 60 * 60,
      });
      storeA.setRefreshToken('active-refresh', 'active-access', registeredAt + 50 * day);

      const storeB = new McpOAuthTokenStore(tokensPath, { nowSeconds: () => registeredAt + 31 * day });
      storeB.load();
      expect(storeB.getClient(active.client_id)).toBeTruthy();
      expect(storeB.getClient(idle.client_id)).toBeUndefined();

      const storeC = new McpOAuthTokenStore(tokensPath, { nowSeconds: () => registeredAt + 31 * day });
      storeC.load();
      expect(storeC.getClient(active.client_id)).toBeTruthy();
      expect(storeC.getClient(idle.client_id)).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
