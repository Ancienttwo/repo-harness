import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { repoHarnessPackageVersion } from '../../src/cli/mcp/version';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { recordPluginSelection } from '../helpers/install-ownership';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');

function textPayload(result: Awaited<ReturnType<Client['callTool']>>): Record<string, unknown> {
  const content = (result as { content?: Array<{ type: string; text: string }> }).content;
  const first = content?.[0];
  if (!first || first.type !== 'text') throw new Error('expected text tool result');
  return JSON.parse(first.text);
}

describe('mcp stdio transport', () => {
  test('initializes and calls workspace reader tools over real stdio transport, and runs no CodeGraph binary without the architecture plugin', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-stdio-'));
    const registryHome = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-stdio-home-'));
    // A HOME that selects `mcp` and not `architecture`, and a logging CodeGraph first on PATH.
    const home = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-stdio-user-'));
    const fakeBin = join(home, 'bin');
    const codegraphLog = join(home, 'codegraph.log');
    // A registered repo with a CodeGraph index, which the repo tools read.
    const indexedRoot = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-mcp-stdio-indexed-')));
    const client = new Client({ name: 'repo-harness-stdio-test', version: '0' }, { capabilities: {} });
    try {
      mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
      mkdirSync(join(repoRoot, 'docs'), { recursive: true });
      mkdirSync(join(repoRoot, 'secrets'), { recursive: true });
      writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
      writeFileSync(join(repoRoot, 'docs/design.md'), '# Design\nstdio reader route\n');
      writeFileSync(join(repoRoot, 'secrets/token.txt'), 'TOKEN=secret\n');
      mkdirSync(join(indexedRoot, '.ai/harness'), { recursive: true });
      writeFileSync(join(indexedRoot, '.ai/harness/policy.json'), '{}\n');
      mkdirSync(join(indexedRoot, '.codegraph'));
      recordPluginSelection({ ...process.env, HOME: home }, ['mcp']);
      mkdirSync(fakeBin);
      writeFileSync(join(fakeBin, 'codegraph'), `#!/bin/sh\necho "$*" >> '${codegraphLog}'\necho '[]'\n`);
      chmodSync(join(fakeBin, 'codegraph'), 0o755);
      writeFileSync(join(registryHome, 'registered-repos.json'), `${JSON.stringify({ version: 1, repos: [{ id: repoHarnessRepoIdFor(indexedRoot), path: indexedRoot, accessMode: 'read_only', source: 'manual', registeredAt: '2026-06-23T00:00:00.000Z', lastSeenAt: '2026-06-23T00:00:00.000Z' }] })}\n`);

      const transport = new StdioClientTransport({
        command: 'bun',
        args: [
          CLI,
          'mcp',
          'serve',
          '--repo',
          repoRoot,
          '--profile',
          'planner',
          '--enable-reader',
          '--allow-root',
          repoRoot,
        ],
        cwd: ROOT,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
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
      const root = (roots.roots as Array<{ root_id: string; repo_id?: string; path?: string }>).find(
        (entry) => entry.root_id.startsWith('root_'),
      );
      expect(root?.path).toBeUndefined();
      expect(root?.repo_id).toBeUndefined();
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

      const denied = textPayload(await client.callTool({
        name: 'read_text',
        arguments: {
          workspace_id: opened.workspace_id,
          path: 'secrets/token.txt',
        },
      }));
      expect((denied.error as { code: string }).code).toBe('PATH_DENIED');

      const manifest = textPayload(await client.callTool({ name: 'repo_manifest', arguments: { repo_id: repoHarnessRepoIdFor(indexedRoot) } }));
      expect(manifest.codegraph).toMatchObject({ available: false, source: 'unavailable', error: { code: 'INDEX_UNAVAILABLE', retryable: false } });
      expect((manifest.codegraph as { error: { message: string } }).error.message).toContain('the architecture plugin is not selected');
      expect(existsSync(codegraphLog)).toBe(false);
    } finally {
      await client.close().catch(() => undefined);
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(registryHome, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
      rmSync(indexedRoot, { recursive: true, force: true });
    }
  });
});
