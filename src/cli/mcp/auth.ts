import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { repoHarnessHome } from '../../effects/repo-harness-home';

export interface McpLocalConfig {
  version: 1 | 2 | 3;
  repo?: string;
  capabilities?: {
    workspaceReader?: boolean;
    workflowPlanner?: boolean;
    workflowExecutor?: boolean;
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
}

/**
 * Keys of the removed ChatGPT, HTTP, OAuth, coding and orchestrator surface
 * (#1354). A config that still carries one fails closed: nothing reads these
 * keys, and no setup command rewrites the file.
 */
const RETIRED_CONFIG_KEYS = ['server', 'auth', 'chatgpt', 'coding', 'authorizationRevision'] as const;
const RETIRED_CAPABILITY_KEYS = ['workspaceCoder', 'taskDispatch', 'publicationMerge'] as const;
const RETIRED_PROFILES = ['orchestrator', 'coding'] as const;

/** Single MCP storage authority: `~/.repo-harness/`, overridable with REPO_HARNESS_HOME. */
export function mcpStorageDir(): string {
  return repoHarnessHome();
}

export function mcpLocalConfigPath(): string {
  return join(mcpStorageDir(), 'mcp.local.json');
}

/** Fail closed when a repo still carries the retired repo-scope MCP config. There is no read-through fallback. */
export function assertNoLegacyRepoScopeMcpConfig(repoRoot: string): void {
  const dir = join(repoRoot, '.repo-harness');
  const config = join(dir, 'mcp.local.json');
  if (!existsSync(config)) return;
  throw new Error(
    `legacy repo-scope MCP config detected at ${config}; repo scope is retired and MCP reads config only from ${mcpLocalConfigPath()}. Remove the repo-scope mcp.*.json files under ${dir}.`,
  );
}

function retiredConfigKeys(raw: Record<string, unknown>): string[] {
  const keys: string[] = RETIRED_CONFIG_KEYS.filter((key) => Object.hasOwn(raw, key));
  const capabilities = raw.capabilities;
  if (typeof capabilities === 'object' && capabilities !== null) {
    keys.push(...RETIRED_CAPABILITY_KEYS.filter((key) => Object.hasOwn(capabilities, key)).map((key) => `capabilities.${key}`));
  }
  if ((RETIRED_PROFILES as readonly unknown[]).includes(raw.profile)) keys.push(`profile=${String(raw.profile)}`);
  return keys;
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
  const retired = retiredConfigKeys(raw);
  if (retired.length > 0) {
    throw new Error(`MCP_CONFIG_RETIRED_FIELD: ${retired.join(', ')}; the ChatGPT, HTTP, OAuth, coding and orchestrator MCP surface was removed. Remove these keys from the file.`);
  }
  const config = raw as unknown as McpLocalConfig;
  if (config.permissions?.allowedRoots !== undefined && !Array.isArray(config.permissions.allowedRoots)) {
    throw new Error('MCP local config permissions.allowedRoots must be an array');
  }
  if (config.permissions?.discoveryRoots !== undefined && !Array.isArray(config.permissions.discoveryRoots)) {
    throw new Error('MCP local config permissions.discoveryRoots must be an array');
  }
  return {
    ...config,
    version,
  };
}

function readMcpLocalConfigFile(path: string): McpLocalConfig | null {
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
