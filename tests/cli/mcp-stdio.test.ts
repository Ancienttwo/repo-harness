import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { repoHarnessPackageVersion } from '../../src/cli/mcp/version';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');

function textPayload(result: Awaited<ReturnType<Client['callTool']>>): Record<string, unknown> {
  const first = 'content' in result ? result.content[0] : undefined;
  if (!first || first.type !== 'text') throw new Error('expected text tool result');
  return JSON.parse(first.text);
}

describe('mcp stdio transport', () => {
  test('initializes and calls workspace reader tools over real stdio transport', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-stdio-'));
    const registryHome = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-stdio-home-'));
    const client = new Client({ name: 'repo-harness-stdio-test', version: '0' }, { capabilities: {} });
    try {
      mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
      mkdirSync(join(repoRoot, 'docs'), { recursive: true });
      mkdirSync(join(repoRoot, 'secrets'), { recursive: true });
      writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
      writeFileSync(join(repoRoot, 'docs/design.md'), '# Design\nstdio reader route\n');
      writeFileSync(join(repoRoot, 'secrets/token.txt'), 'TOKEN=secret\n');

      const transport = new StdioClientTransport({
        command: 'bun',
        args: [
          CLI,
          'mcp',
          'serve',
          '--repo',
          repoRoot,
          '--transport',
          'stdio',
          '--profile',
          'planner',
          '--enable-reader',
          '--allow-root',
          repoRoot,
        ],
        cwd: ROOT,
        env: {
          ...process.env,
          REPO_HARNESS_HOME: registryHome,
        },
        stderr: 'pipe',
      });

      await client.connect(transport);
      expect(client.getServerVersion()).toMatchObject({
        name: 'repo-harness-mcp',
        version: repoHarnessPackageVersion(),
      });

      const listed = await client.listTools();
      const toolNames = listed.tools.map((tool) => tool.name);
      expect(toolNames).toContain('reader_status');
      expect(toolNames).toContain('list_allowed_roots');
      expect(toolNames).toContain('open_workspace');
      expect(toolNames).toContain('read_text');
      expect(toolNames).toContain('search_text');
      expect(toolNames).not.toContain('run_agent_goal');

      const roots = textPayload(await client.callTool({ name: 'list_allowed_roots', arguments: {} }));
      const root = (roots.roots as Array<{ root_id: string; path: string }>).find((entry) => entry.path === realpathSync(repoRoot));
      expect(root?.root_id).toMatch(/^root_/);

      const opened = textPayload(await client.callTool({
        name: 'open_workspace',
        arguments: { root_id: root?.root_id },
      }));
      expect(opened.workspace_id).toMatch(/^ws_/);

      const read = textPayload(await client.callTool({
        name: 'read_text',
        arguments: {
          workspace_id: opened.workspace_id,
          path: 'docs/design.md',
          start_line: 2,
          end_line: 2,
        },
      }));
      expect(read.text).toBe('2: stdio reader route');

      const search = textPayload(await client.callTool({
        name: 'search_text',
        arguments: {
          workspace_id: opened.workspace_id,
          query: 'stdio',
          path: 'docs',
        },
      }));
      expect(search.matches).toEqual([
        expect.objectContaining({ path: 'docs/design.md', line: 2 }),
      ]);

      const denied = textPayload(await client.callTool({
        name: 'read_text',
        arguments: {
          workspace_id: opened.workspace_id,
          path: 'secrets/token.txt',
        },
      }));
      expect((denied.error as { code: string }).code).toBe('PATH_DENIED');
    } finally {
      await client.close().catch(() => undefined);
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(registryHome, { recursive: true, force: true });
    }
  });
});
