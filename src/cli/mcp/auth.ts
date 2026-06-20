import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';

export type McpConfigScope = 'repo' | 'user';

export interface McpLocalConfig {
  version?: number;
  scope?: McpConfigScope;
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
    serverName?: string;
    endpoint?: string;
  };
  permissions?: {
    fullDiskRead?: boolean;
  };
  profile?: string;
  devMode?: {
    agentRunner?: boolean;
    allowedAgents?: string[];
    timeoutMs?: number;
  };
}

export type McpHttpAuthMode = 'oauth' | 'bearer';

function repoHarnessHome(): string {
  return resolve(process.env.REPO_HARNESS_HOME ?? join(process.env.HOME ?? homedir(), '.repo-harness'));
}

function mcpStorageDir(repoRoot: string, scope: McpConfigScope): string {
  return scope === 'user' ? repoHarnessHome() : join(repoRoot, '.repo-harness');
}

export function mcpLocalConfigPath(repoRoot: string, scope: McpConfigScope = 'repo'): string {
  return join(mcpStorageDir(repoRoot, scope), 'mcp.local.json');
}

export function mcpTokenPath(repoRoot: string, scope: McpConfigScope = 'repo'): string {
  return join(mcpStorageDir(repoRoot, scope), 'mcp.tokens.json');
}

export function mcpOAuthPath(repoRoot: string, scope: McpConfigScope = 'repo'): string {
  return join(mcpStorageDir(repoRoot, scope), 'mcp.oauth.json');
}

export function mcpOAuthTokenStorePath(repoRoot: string, scope: McpConfigScope = 'repo'): string {
  return join(mcpStorageDir(repoRoot, scope), 'mcp.oauth-tokens.json');
}

function readMcpLocalConfig(path: string): McpLocalConfig | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as McpLocalConfig;
  } catch (_error) {
    return null;
  }
}

export function resolveMcpConfigScope(repoRoot: string, requested?: McpConfigScope): McpConfigScope {
  if (requested) return requested;
  if (existsSync(mcpLocalConfigPath(repoRoot, 'repo'))) return 'repo';
  if (existsSync(mcpLocalConfigPath(repoRoot, 'user'))) return 'user';
  return 'repo';
}

export function loadMcpLocalConfig(repoRoot: string, scope?: McpConfigScope): McpLocalConfig | null {
  if (scope) return readMcpLocalConfig(mcpLocalConfigPath(repoRoot, scope));
  return readMcpLocalConfig(mcpLocalConfigPath(repoRoot, 'repo')) ?? readMcpLocalConfig(mcpLocalConfigPath(repoRoot, 'user'));
}

export function readMcpBearerToken(repoRoot: string, scope?: McpConfigScope): string | null {
  if (process.env.REPO_HARNESS_MCP_TOKEN?.trim()) return process.env.REPO_HARNESS_MCP_TOKEN.trim();
  const path = mcpTokenPath(repoRoot, resolveMcpConfigScope(repoRoot, scope));
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { bearerToken?: unknown };
    return typeof parsed.bearerToken === 'string' && parsed.bearerToken.trim().length > 0 ? parsed.bearerToken.trim() : null;
  } catch (_error) {
    return null;
  }
}

export function ensureMcpBearerToken(repoRoot: string, scope: McpConfigScope = 'repo'): { token: string; path: string; changed: boolean } {
  const path = mcpTokenPath(repoRoot, scope);
  const existing = readMcpBearerToken(repoRoot, scope);
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

export function readMcpOAuthPassphrase(repoRoot: string, scope?: McpConfigScope): string | null {
  if (process.env.REPO_HARNESS_MCP_OAUTH_PASSPHRASE?.trim()) {
    return process.env.REPO_HARNESS_MCP_OAUTH_PASSPHRASE.trim();
  }
  const path = mcpOAuthPath(repoRoot, resolveMcpConfigScope(repoRoot, scope));
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { passphrase?: unknown };
    return typeof parsed.passphrase === 'string' && parsed.passphrase.trim().length > 0 ? parsed.passphrase.trim() : null;
  } catch (_error) {
    return null;
  }
}

export function ensureMcpOAuthPassphrase(repoRoot: string, scope: McpConfigScope = 'repo'): { passphrase: string; path: string; changed: boolean } {
  const path = mcpOAuthPath(repoRoot, scope);
  const existing = readMcpOAuthPassphrase(repoRoot, scope);
  if (existing) return { passphrase: existing, path, changed: false };

  const passphrase = randomBytes(24).toString('base64url');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ version: 1, passphrase }, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  return { passphrase, path, changed: true };
}
