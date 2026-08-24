import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadMcpLocalConfig } from '../auth';
import { createRepoHarnessMcpServer, type McpServerOptions } from '../server';

export async function startMcpStdio(opts: McpServerOptions): Promise<void> {
  const effectiveProfile = opts.profile ?? loadMcpLocalConfig()?.profile ?? 'planner';
  if (effectiveProfile === 'engineer') {
    throw new Error('engineer profile requires the OAuth-authenticated HTTP transport');
  }
  const server = createRepoHarnessMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
