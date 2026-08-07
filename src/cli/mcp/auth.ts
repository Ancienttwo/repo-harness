import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';

export interface McpLocalConfig {
  version: 1 | 2 | 3;
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
    allowedRedirectHosts?: string[];
  };
  chatgpt?: {
    serverName?: string;
    endpoint?: string;
  };
  capabilities?: {
    workspaceReader?: boolean;
    workflowPlanner?: boolean;
    workflowExecutor?: boolean;
    agentRunner?: boolean;
    workspaceCoder?: boolean;
    /** @deprecated v2 uses workspaceReader; accepted only for older local configs. */
    reader?: boolean;
  };
  permissions?: {
    fullDiskRead?: boolean;
    allowedRoots?: string[];
    discoveryRoots?: string[];
    legacyFullDiskReadDetected?: boolean;
  };
  profile?: string;
  authorizationRevision?: number;
  coding?: {
    enabled?: boolean;
    environmentAllowlist?: string[];
    worktreeRoot?: string;
  };
  devMode?: {
    agentRunner?: boolean;
    allowedAgents?: string[];
    timeoutMs?: number;
  };
}

export type McpHttpAuthMode = 'oauth' | 'bearer' | 'url-token';

function repoHarnessHome(): string {
  return resolve(process.env.REPO_HARNESS_HOME ?? join(process.env.HOME ?? homedir(), '.repo-harness'));
}

/** Single MCP storage authority: `~/.repo-harness/`, overridable with REPO_HARNESS_HOME. */
export function mcpStorageDir(): string {
  return repoHarnessHome();
}

export function mcpLocalConfigPath(): string {
  return join(mcpStorageDir(), 'mcp.local.json');
}

export function mcpTokenPath(): string {
  return join(mcpStorageDir(), 'mcp.tokens.json');
}

export function mcpOAuthPath(): string {
  return join(mcpStorageDir(), 'mcp.oauth.json');
}

export function mcpOAuthTokenStorePath(): string {
  return join(mcpStorageDir(), 'mcp.oauth-tokens.json');
}

export interface LegacyRepoScopeMcpPaths {
  dir: string;
  config: string;
  tokens: string;
  oauth: string;
  oauthTokens: string;
}

/**
 * Retired repo-scope storage layout. Kept only so the migration gate and
 * `repo-harness mcp migrate-scope` can name and remove it; nothing reads
 * configuration or credentials from these paths.
 */
export function legacyRepoScopeMcpPaths(repoRoot: string): LegacyRepoScopeMcpPaths {
  const dir = join(repoRoot, '.repo-harness');
  return {
    dir,
    config: join(dir, 'mcp.local.json'),
    tokens: join(dir, 'mcp.tokens.json'),
    oauth: join(dir, 'mcp.oauth.json'),
    oauthTokens: join(dir, 'mcp.oauth-tokens.json'),
  };
}

export function legacyRepoScopeMcpFiles(repoRoot: string): string[] {
  const legacy = legacyRepoScopeMcpPaths(repoRoot);
  return [legacy.config, legacy.tokens, legacy.oauth, legacy.oauthTokens].filter((path) => existsSync(path));
}

/**
 * Fail closed when a repo still carries the retired repo-scope MCP config.
 * There is deliberately no read-through fallback: the operator runs the
 * one-shot migration, which rotates credentials instead of relocating them.
 */
export function assertNoLegacyRepoScopeMcpConfig(repoRoot: string): void {
  const legacy = legacyRepoScopeMcpPaths(repoRoot);
  if (!existsSync(legacy.config)) return;
  throw new Error(
    `legacy repo-scope MCP config detected at ${legacy.config}; repo scope is retired and MCP now stores config and credentials only under ${mcpStorageDir()}. Run: repo-harness mcp migrate-scope --repo ${repoRoot}`,
  );
}

export function parseMcpLocalConfig(value: unknown): McpLocalConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('MCP local config must be a JSON object');
  }
  const raw = value as Record<string, unknown>;
  const version = raw.version === undefined ? 1 : raw.version;
  if (version !== 1 && version !== 2 && version !== 3) {
    throw new Error(`unsupported MCP local config version: ${String(version)}`);
  }
  const config = raw as unknown as McpLocalConfig;
  if (config.permissions?.allowedRoots !== undefined && !Array.isArray(config.permissions.allowedRoots)) {
    throw new Error('MCP local config permissions.allowedRoots must be an array');
  }
  if (config.permissions?.discoveryRoots !== undefined && !Array.isArray(config.permissions.discoveryRoots)) {
    throw new Error('MCP local config permissions.discoveryRoots must be an array');
  }
  if (config.auth?.allowedRedirectHosts !== undefined && !Array.isArray(config.auth.allowedRedirectHosts)) {
    throw new Error('MCP local config auth.allowedRedirectHosts must be an array');
  }
  if (config.coding?.environmentAllowlist !== undefined && !Array.isArray(config.coding.environmentAllowlist)) {
    throw new Error('MCP local config coding.environmentAllowlist must be an array');
  }
  if (config.authorizationRevision !== undefined && (!Number.isInteger(config.authorizationRevision) || config.authorizationRevision < 0)) {
    throw new Error('MCP local config authorizationRevision must be a non-negative integer');
  }
  return {
    ...config,
    version,
  };
}

export function readMcpLocalConfigFile(path: string): McpLocalConfig | null {
  if (!existsSync(path)) return null;
  try {
    return parseMcpLocalConfig(JSON.parse(readFileSync(path, 'utf-8')));
  } catch (error) {
    throw new Error(`invalid MCP local config at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function loadMcpLocalConfig(): McpLocalConfig | null {
  return readMcpLocalConfigFile(mcpLocalConfigPath());
}

export function readMcpBearerToken(): string | null {
  if (process.env.REPO_HARNESS_MCP_TOKEN?.trim()) return process.env.REPO_HARNESS_MCP_TOKEN.trim();
  const path = mcpTokenPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { bearerToken?: unknown };
    return typeof parsed.bearerToken === 'string' && parsed.bearerToken.trim().length > 0 ? parsed.bearerToken.trim() : null;
  } catch (_error) {
    return null;
  }
}

export function ensureMcpBearerToken(): { token: string; path: string; changed: boolean } {
  const path = mcpTokenPath();
  const existing = readMcpBearerToken();
  if (existing) return { token: existing, path, changed: false };

  const token = randomBytes(32).toString('base64url');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ version: 1, bearerToken: token }, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  return { token, path, changed: true };
}

export function parseMcpHttpAuthMode(value: string | undefined): McpHttpAuthMode {
  const mode = (value ?? 'oauth').trim().toLowerCase();
  if (mode === 'oauth' || mode === 'bearer' || mode === 'url-token') return mode;
  throw new Error(`invalid --auth "${value}" (expected: oauth, bearer, url-token)`);
}

export function readMcpOAuthPassphrase(): string | null {
  if (process.env.REPO_HARNESS_MCP_OAUTH_PASSPHRASE?.trim()) {
    return process.env.REPO_HARNESS_MCP_OAUTH_PASSPHRASE.trim();
  }
  const path = mcpOAuthPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { passphrase?: unknown };
    return typeof parsed.passphrase === 'string' && parsed.passphrase.trim().length > 0 ? parsed.passphrase.trim() : null;
  } catch (_error) {
    return null;
  }
}

export function ensureMcpOAuthPassphrase(): { passphrase: string; path: string; changed: boolean } {
  const path = mcpOAuthPath();
  const existing = readMcpOAuthPassphrase();
  if (existing) return { passphrase: existing, path, changed: false };

  const passphrase = randomBytes(24).toString('base64url');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ version: 1, passphrase }, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  return { passphrase, path, changed: true };
}
