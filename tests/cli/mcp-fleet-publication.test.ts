import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { getMcpPolicy } from '../../src/cli/mcp/policy';
import {
  buildFleetToolDefinitions,
  callFleetTool,
} from '../../src/cli/mcp/fleet-tools';
import { buildMcpToolDefinitions, callMcpTool } from '../../src/cli/mcp/tools';

function parseResult(result: { content: Array<{ text: string }> }): Record<string, any> {
  return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, any>;
}

function withRegistryHome<T>(run: (repoRoot: string) => T): T {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-fleet-'));
  const home = join(repoRoot, 'home');
  mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
  writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
  const previous = process.env.REPO_HARNESS_HOME;
  process.env.REPO_HARNESS_HOME = home;
  try {
    return run(repoRoot);
  } finally {
    if (previous === undefined) delete process.env.REPO_HARNESS_HOME;
    else process.env.REPO_HARNESS_HOME = previous;
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

describe('fleet/publication MCP mirrors', () => {
  test('exposes the publication readiness reader', () => withRegistryHome((repoRoot) => {
    const policy = getMcpPolicy('planner', { allowedRoots: [repoRoot] });
    const names = buildFleetToolDefinitions().map((tool) => tool.name);
    expect(names).toEqual([
      'publication_readiness',
    ]);
    expect(buildMcpToolDefinitions(policy).map((tool) => tool.name)).toEqual(expect.arrayContaining(names));

  }));


  test('rejects undeclared publication parameters at dispatch time', async () => withRegistryHome(async (repoRoot) => {
    const policy = getMcpPolicy('planner', { allowedRoots: [repoRoot] });
    const result = parseResult(await callMcpTool({ repoRoot, policy }, 'publication_readiness', {
      unexpected: true,
    }));
    expect(result.error).toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(result.error.message).toContain('unexpected');
  }));


  test('publication readiness mirrors its typed read-side failure without synthesizing a verdict', () => withRegistryHome((repoRoot) => {
    const policy = getMcpPolicy('planner', { allowedRoots: [repoRoot] });
    const result = parseResult(callFleetTool({ repoRoot, policy }, 'publication_readiness'));
    expect(result.error).toMatchObject({ code: 'receipt_unavailable' });
  }));
});
