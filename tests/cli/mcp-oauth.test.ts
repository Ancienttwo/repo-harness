import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
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
});
