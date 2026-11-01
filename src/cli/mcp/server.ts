import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { realpathSync, statSync } from 'fs';
import { resolve } from 'path';
import { registeredRepoHarnessRoots } from '../../effects/repo-registry';
import { assertNoLegacyRepoScopeMcpConfig, loadMcpLocalConfig } from './auth';
import { buildMcpServerInstructions } from './instructions';
import { getMcpPolicy, parseMcpProfile, sensitiveAllowedRootReason } from './policy';
import { isRepoHarnessAdopted, resolveMcpRepoRoot } from './repo';
import { buildMcpToolDefinitions, callMcpTool, type McpToolContext } from './tools';
import { repoHarnessPackageVersion } from './version';
import { WorkspaceManager } from './workspaces';

export interface McpServerOptions {
  repo?: string;
  profile?: string;
  enableReader?: boolean;
  allowedRoots?: string[];
}

function normalizeAllowedRoots(rawRoots: string[], opts: { skipDenied?: boolean } = {}): string[] {
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
      if (opts.skipDenied === true) continue;
      throw new Error(`MCP allowed root is denied by policy: ${rawRoot} (${sensitiveReason})`);
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    roots.push(normalized);
  }
  return roots;
}

function uniqueRoots(rawRoots: string[]): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();
  for (const root of rawRoots) {
    if (seen.has(root)) continue;
    seen.add(root);
    roots.push(root);
  }
  return roots;
}

export function createMcpToolContext(opts: McpServerOptions): McpToolContext {
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  assertNoLegacyRepoScopeMcpConfig(repoRoot);
  const config = loadMcpLocalConfig();
  const requestedProfile = opts.profile ?? config?.profile ?? 'planner';
  const profile = parseMcpProfile(requestedProfile === 'reader' ? 'planner' : requestedProfile);
  const configuredAllowedRoots = Array.from(new Set([
    ...(opts.allowedRoots ?? []),
    ...(config?.permissions?.allowedRoots ?? []),
  ].map((entry) => String(entry).trim()).filter(Boolean)));
  const registeredRepoRoots = registeredRepoHarnessRoots({ adoptedOnly: true });
  const currentRepoRoot = isRepoHarnessAdopted(repoRoot) ? [repoRoot] : [];
  const configuredDiscoveryRoots = Array.from(new Set([
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
  const policyAllowedRoots = uniqueRoots([
    ...normalizeAllowedRoots(configuredAllowedRoots),
    ...(readerEnabled ? normalizeAllowedRoots(registeredRepoRoots, { skipDenied: true }) : []),
    ...(readerEnabled ? normalizeAllowedRoots(currentRepoRoot, { skipDenied: true }) : []),
  ]);
  const discoveryRoots = uniqueRoots([
    ...normalizeAllowedRoots(configuredDiscoveryRoots),
    ...normalizeAllowedRoots(currentRepoRoot, { skipDenied: true }),
    ...normalizeAllowedRoots(registeredRepoRoots, { skipDenied: true }),
  ]);
  const policy = getMcpPolicy(profile, {
    enableReader: readerEnabled,
    allowedRoots: policyAllowedRoots,
    discoveryRoots,
  });
  return {
    repoRoot,
    policy,
    workspaceManager: readerEnabled ? new WorkspaceManager({ allowedRoots: policyAllowedRoots, policy }) : undefined,
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
    tools: buildMcpToolDefinitions(ctx.policy),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    return callMcpTool(ctx, name, args) as any;
  });

  return server;
}
