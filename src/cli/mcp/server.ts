import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { MCP_SERVER_INSTRUCTIONS } from './instructions';
import { getMcpPolicy, parseMcpProfile } from './policy';
import { resolveMcpRepoRoot } from './repo';
import { buildMcpToolDefinitions, callMcpTool, type McpToolContext } from './tools';

export interface McpServerOptions {
  repo?: string;
  profile?: string;
}

export function createMcpToolContext(opts: McpServerOptions): McpToolContext {
  const profile = parseMcpProfile(opts.profile ?? 'planner');
  return {
    repoRoot: resolveMcpRepoRoot(opts.repo ?? '.'),
    policy: getMcpPolicy(profile),
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
    tools: buildMcpToolDefinitions(ctx.policy),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    return callMcpTool(ctx, name, args);
  });

  return server;
}
