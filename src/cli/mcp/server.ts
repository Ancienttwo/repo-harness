import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadMcpLocalConfig } from './auth';
import { MCP_SERVER_INSTRUCTIONS } from './instructions';
import { getMcpPolicy, parseMcpProfile } from './policy';
import { resolveMcpRepoRoot } from './repo';
import { buildMcpToolDefinitions, callMcpTool, type McpToolContext } from './tools';
import type { McpAgentRunnerName } from './types';

export interface McpServerOptions {
  repo?: string;
  profile?: string;
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

export function createMcpToolContext(opts: McpServerOptions): McpToolContext {
  const profile = parseMcpProfile(opts.profile ?? 'planner');
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  const config = loadMcpLocalConfig(repoRoot);
  const envDevRunner = parseBooleanSetting(process.env.REPO_HARNESS_MCP_DEV_RUNNER);
  const configuredDevRunner = envDevRunner ?? config?.devMode?.agentRunner === true;
  const devAgentRunner = opts.enableDevRunner === true || configuredDevRunner;
  const allowedAgents = parseAgentList(
    opts.devRunnerAgents ?? process.env.REPO_HARNESS_MCP_DEV_RUNNER_AGENTS ?? config?.devMode?.allowedAgents,
  );
  const runnerTimeoutMs = parseTimeoutMs(
    opts.devRunnerTimeoutMs ?? process.env.REPO_HARNESS_MCP_DEV_RUNNER_TIMEOUT_MS ?? config?.devMode?.timeoutMs,
  );
  return {
    repoRoot,
    policy: getMcpPolicy(profile, {
      devAgentRunner,
      allowedAgents,
      runnerTimeoutMs,
    }),
    enableChatgptBrowser: opts.enableChatgptBrowser === true,
  };
}

export function createRepoHarnessMcpServer(opts: McpServerOptions): Server {
  const ctx = createMcpToolContext(opts);
  const server = new Server(
    { name: 'repo-harness-mcp', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions: MCP_SERVER_INSTRUCTIONS,
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
