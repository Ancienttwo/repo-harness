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
});
