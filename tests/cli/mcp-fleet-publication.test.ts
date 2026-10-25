import { execFileSync } from 'node:child_process';
import { assertLocalPullRequestRepository } from '../../src/effects/publication/merge-readiness';
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
  test('binds registry PR reads to the local GitHub origin before provider queries', () => withRegistryHome((repoRoot) => {
    execFileSync('git', ['init'], { cwd: repoRoot });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/local.git'], { cwd: repoRoot });
    const policy = getMcpPolicy('planner', { allowedRoots: [repoRoot] });
    const result = parseResult(callFleetTool({ repoRoot, policy }, 'publication_readiness', {
      repository: 'example/foreign', provider_repository_id: '2002', pr_number: 1,
      expected_head_sha: 'a'.repeat(40), expected_base_sha: 'b'.repeat(40),
    }));
    expect(result.error).toMatchObject({ code: 'REPO_NOT_ALLOWED' });
    expect(result.error.message).toContain('local GitHub origin');
    for (const remote of ['https://github.com/example/local.git', 'git@github.com:example/local.git', 'ssh://git@github.com/example/local.git']) {
      execFileSync('git', ['remote', 'set-url', 'origin', remote], { cwd: repoRoot });
      expect(() => assertLocalPullRequestRepository(repoRoot, 'example/local')).not.toThrow();
      expect(() => assertLocalPullRequestRepository(repoRoot, 'example/foreign')).toThrow('local GitHub origin');
    }
    execFileSync('git', ['remote', 'set-url', 'origin', 'https://git.example.com/example/local.git'], { cwd: repoRoot });
    expect(() => assertLocalPullRequestRepository(repoRoot, 'example/local')).toThrow('local GitHub origin');
  }));

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
      publication_id: 'retired-selector', unexpected: true,
    }));
    expect(result.error).toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(result.error.message).toContain('unexpected');
  }));


  test('publication readiness mirrors its typed read-side failure without synthesizing a verdict', () => withRegistryHome((repoRoot) => {
    const policy = getMcpPolicy('planner', { allowedRoots: [repoRoot] });
    const result = parseResult(callFleetTool({ repoRoot, policy }, 'publication_readiness'));
    expect(result.error).toMatchObject({ code: 'INVALID_ARGUMENT' });
  }));
});
