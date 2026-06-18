import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export interface McpLocalConfig {
  version?: number;
  repo?: string;
  server?: {
    host?: string;
    port?: number;
    transport?: string;
  };
  auth?: {
    mode?: string;
    tokenFile?: string;
    oauthFile?: string;
  };
  chatgpt?: {
    endpoint?: string;
  };
  profile?: string;
  devMode?: {
    agentRunner?: boolean;
    allowedAgents?: string[];
    timeoutMs?: number;
  };
}

export type McpHttpAuthMode = 'oauth' | 'bearer';

export function mcpLocalConfigPath(repoRoot: string): string {
  return join(repoRoot, '.repo-harness', 'mcp.local.json');
}

export function mcpTokenPath(repoRoot: string): string {
  return join(repoRoot, '.repo-harness', 'mcp.tokens.json');
}

export function mcpOAuthPath(repoRoot: string): string {
  return join(repoRoot, '.repo-harness', 'mcp.oauth.json');
}

export function mcpOAuthTokenStorePath(repoRoot: string): string {
  return join(repoRoot, '.repo-harness', 'mcp.oauth-tokens.json');
}

export function loadMcpLocalConfig(repoRoot: string): McpLocalConfig | null {
  const path = mcpLocalConfigPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as McpLocalConfig;
  } catch (_error) {
    return null;
  }
}

export function readMcpBearerToken(repoRoot: string): string | null {
  if (process.env.REPO_HARNESS_MCP_TOKEN?.trim()) return process.env.REPO_HARNESS_MCP_TOKEN.trim();
  const path = mcpTokenPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { bearerToken?: unknown };
    return typeof parsed.bearerToken === 'string' && parsed.bearerToken.trim().length > 0 ? parsed.bearerToken.trim() : null;
  } catch (_error) {
    return null;
  }
}

export function ensureMcpBearerToken(repoRoot: string): { token: string; path: string; changed: boolean } {
  const path = mcpTokenPath(repoRoot);
  const existing = readMcpBearerToken(repoRoot);
  if (existing) return { token: existing, path, changed: false };

  const token = randomBytes(32).toString('base64url');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ version: 1, bearerToken: token }, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  return { token, path, changed: true };
}

export function parseMcpHttpAuthMode(value: string | undefined): McpHttpAuthMode {
  const mode = (value ?? 'oauth').trim().toLowerCase();
  if (mode === 'oauth' || mode === 'bearer') return mode;
  throw new Error(`invalid --auth "${value}" (expected: oauth, bearer)`);
}

export function readMcpOAuthPassphrase(repoRoot: string): string | null {
  if (process.env.REPO_HARNESS_MCP_OAUTH_PASSPHRASE?.trim()) {
    return process.env.REPO_HARNESS_MCP_OAUTH_PASSPHRASE.trim();
  }
  const path = mcpOAuthPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { passphrase?: unknown };
    return typeof parsed.passphrase === 'string' && parsed.passphrase.trim().length > 0 ? parsed.passphrase.trim() : null;
  } catch (_error) {
    return null;
  }
}

export function ensureMcpOAuthPassphrase(repoRoot: string): { passphrase: string; path: string; changed: boolean } {
  const path = mcpOAuthPath(repoRoot);
  const existing = readMcpOAuthPassphrase(repoRoot);
  if (existing) return { passphrase: existing, path, changed: false };

  const passphrase = randomBytes(24).toString('base64url');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ version: 1, passphrase }, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  return { passphrase, path, changed: true };
}
