import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { realpathSync, statSync } from 'fs';
import { resolve } from 'path';
import { registeredRepoHarnessRoots } from '../../effects/repo-registry';
import { loadMcpLocalConfig } from './auth';
import { buildMcpServerInstructions } from './instructions';
import { getMcpPolicy, parseMcpProfile, sensitiveAllowedRootReason } from './policy';
import { isRepoHarnessAdopted, resolveMcpRepoRoot } from './repo';
import { buildMcpToolDefinitions, callMcpTool, type McpToolContext } from './tools';
import type { McpAgentRunnerName } from './types';
import { repoHarnessPackageVersion } from './version';
import { WorkspaceManager } from './workspaces';

export interface McpServerOptions {
  repo?: string;
  profile?: string;
  enableReader?: boolean;
  allowedRoots?: string[];
  enableChatgptBrowser?: boolean;
  enableDevRunner?: boolean;
  devRunnerAgents?: string;
  devRunnerTimeoutMs?: number;
}

function parseBooleanSetting(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function parseAgentList(value: unknown): McpAgentRunnerName[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return Array.from(new Set(raw
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry): entry is McpAgentRunnerName => entry === 'codex' || entry === 'claude')));
}

function parseTimeoutMs(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return undefined;
  const integer = Math.trunc(parsed);
  if (integer < 5_000 || integer > 900_000) return undefined;
  return integer;
}

function normalizeAllowedRoots(rawRoots: string[]): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();
  for (const rawRoot of rawRoots) {
    const absoluteRoot = resolve(rawRoot);
    let normalized = absoluteRoot;
    try {
      if (!statSync(absoluteRoot).isDirectory()) continue;
      normalized = realpathSync(absoluteRoot);
    } catch (_error) {
      normalized = absoluteRoot;
    }
    const sensitiveReason = sensitiveAllowedRootReason(normalized, undefined, rawRoot);
    if (sensitiveReason) {
      throw new Error(`MCP allowed root is denied by policy: ${rawRoot} (${sensitiveReason})`);
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    roots.push(normalized);
  }
  return roots;
}

export function createMcpToolContext(opts: McpServerOptions): McpToolContext {
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  const config = loadMcpLocalConfig(repoRoot);
  const requestedProfile = opts.profile ?? config?.profile ?? 'planner';
  const profile = parseMcpProfile(requestedProfile === 'reader' ? 'planner' : requestedProfile);
  const envDevRunner = parseBooleanSetting(process.env.REPO_HARNESS_MCP_DEV_RUNNER);
  const configuredDevRunner = envDevRunner ?? config?.devMode?.agentRunner === true;
  const devAgentRunner = opts.enableDevRunner === true || configuredDevRunner;
  const allowedAgents = parseAgentList(
    opts.devRunnerAgents ?? process.env.REPO_HARNESS_MCP_DEV_RUNNER_AGENTS ?? config?.devMode?.allowedAgents,
  );
  const runnerTimeoutMs = parseTimeoutMs(
    opts.devRunnerTimeoutMs ?? process.env.REPO_HARNESS_MCP_DEV_RUNNER_TIMEOUT_MS ?? config?.devMode?.timeoutMs,
  );
  const fullDiskRead = false;
  const configuredAllowedRoots = Array.from(new Set([
    ...(opts.allowedRoots ?? []),
    ...(config?.permissions?.allowedRoots ?? []),
  ].map((entry) => String(entry).trim()).filter(Boolean)));
  const registeredRepoRoots = registeredRepoHarnessRoots({ adoptedOnly: true });
  const currentRepoRoot = isRepoHarnessAdopted(repoRoot) ? [repoRoot] : [];
  const configuredDiscoveryRoots = Array.from(new Set([
    ...currentRepoRoot,
    ...(config?.permissions?.discoveryRoots ?? []),
    ...(config?.permissions?.allowedRoots ?? []),
    ...(opts.allowedRoots ?? []),
  ].map((entry) => String(entry).trim()).filter(Boolean)));
  const explicitReaderEnable = opts.enableReader === true || requestedProfile === 'reader' || (opts.allowedRoots?.length ?? 0) > 0;
  const configDisablesReader = config?.capabilities?.workspaceReader === false ||
    (config?.capabilities?.workspaceReader === undefined && config?.capabilities?.reader === false);
  const configuredReaderEnable = !configDisablesReader && (
    config?.capabilities?.workspaceReader === true ||
    config?.capabilities?.reader === true ||
    configuredAllowedRoots.length > 0
  );
  const defaultRepoReader = profile === 'planner' && (explicitReaderEnable || !configDisablesReader);
  const readerEnabled = explicitReaderEnable ||
    configuredReaderEnable ||
    defaultRepoReader;
  const policyAllowedRoots = normalizeAllowedRoots([
    ...configuredAllowedRoots,
    ...(readerEnabled ? registeredRepoRoots : []),
    ...(readerEnabled ? currentRepoRoot : []),
  ]);
  const discoveryRoots = normalizeAllowedRoots([
    ...configuredDiscoveryRoots,
    ...registeredRepoRoots,
  ]);
  const policy = getMcpPolicy(profile, {
    devAgentRunner,
    allowedAgents,
    runnerTimeoutMs,
    fullDiskRead,
    enableReader: readerEnabled,
    allowedRoots: policyAllowedRoots,
    discoveryRoots,
  });
  return {
    repoRoot,
    policy,
    workspaceManager: readerEnabled ? new WorkspaceManager({ allowedRoots: policyAllowedRoots, policy }) : undefined,
    enableChatgptBrowser: opts.enableChatgptBrowser === true,
  };
}

export function createRepoHarnessMcpServer(opts: McpServerOptions): Server {
  const ctx = createMcpToolContext(opts);
  const server = new Server(
    { name: 'repo-harness-mcp', version: repoHarnessPackageVersion() },
    {
      capabilities: { tools: {} },
      instructions: buildMcpServerInstructions({ readerEnabled: ctx.policy.capabilities.workspaceReader }),
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildMcpToolDefinitions(ctx.policy, { enableChatgptBrowser: ctx.enableChatgptBrowser === true }),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    return callMcpTool(ctx, name, args);
  });

  return server;
}
