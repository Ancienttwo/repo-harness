import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRepoHarnessMcpServer, type McpServerOptions } from '../server';

export async function startMcpStdio(opts: McpServerOptions): Promise<void> {
  const server = createRepoHarnessMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
