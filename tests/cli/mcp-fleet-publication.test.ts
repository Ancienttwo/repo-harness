import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  readRepoHarnessRegistrySnapshot,
  setRepoHarnessAccessMode,
} from '../../src/effects/repo-registry';
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
  test('exposes the five effect mirrors and preserves the empty offers contract', () => withRegistryHome((repoRoot) => {
    const policy = getMcpPolicy('planner', { allowedRoots: [repoRoot] });
    const names = buildFleetToolDefinitions().map((tool) => tool.name);
    expect(names).toEqual([
      'fleet_offers',
      'fleet_acquire',
      'publication_readiness',
      'publication_reopen',
      'publication_takeover',
    ]);
    expect(buildMcpToolDefinitions(policy).map((tool) => tool.name)).toEqual(expect.arrayContaining(names));

    const result = parseResult(callFleetTool({ repoRoot, policy }, 'fleet_offers'));
    expect(result).toMatchObject({
      protocol: 1,
      kind: 'repo-harness-fleet-offers',
      authorization_revision: 0,
      snapshot_consistency: 'stable',
      offers: [],
    });
  }));

  test('planner/read-only profiles cannot invoke fleet or publication mutations', async () => withRegistryHome(async (repoRoot) => {
    const policy = getMcpPolicy('planner', { allowedRoots: [repoRoot] });
    for (const name of ['fleet_acquire', 'publication_reopen', 'publication_takeover'] as const) {
      const result = parseResult(await callMcpTool({ repoRoot, policy }, name));
      expect(result.error).toMatchObject({ code: 'POLICY_DENIED' });
    }
  }));

  test('rejects undeclared fleet parameters at dispatch time', async () => withRegistryHome(async (repoRoot) => {
    const policy = getMcpPolicy('planner', { allowedRoots: [repoRoot] });
    const result = parseResult(await callMcpTool({ repoRoot, policy }, 'fleet_offers', {
      unexpected: true,
    }));
    expect(result.error).toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(result.error.message).toContain('unexpected');
  }));

  test('coding mutations require an adopted read_write target and current authorization revision', () => withRegistryHome((repoRoot) => {
    const registration = setRepoHarnessAccessMode(repoRoot, 'read_only');
    const repoId = readRepoHarnessRegistrySnapshot({ adoptedOnly: true }).repos[0]?.id;
    expect(repoId).toBeDefined();
    const readOnlyPolicy = getMcpPolicy('coding', { allowedRoots: [repoRoot] });
    const readOnly = parseResult(callFleetTool({ repoRoot, policy: readOnlyPolicy }, 'fleet_acquire', {
      repo_id: repoId,
      authorization_revision: registration.authorizationRevision,
    }));
    expect(readOnly.error).toMatchObject({ code: 'WRITE_DISABLED' });

    const writable = setRepoHarnessAccessMode(repoRoot, 'read_write');
    const stale = parseResult(callFleetTool({ repoRoot, policy: readOnlyPolicy }, 'fleet_acquire', {
      repo_id: repoId,
      authorization_revision: registration.authorizationRevision,
    }));
    expect(stale.error).toMatchObject({ code: 'AUTHORIZATION_STALE' });
    expect(readRepoHarnessRegistrySnapshot({ adoptedOnly: true }).authorizationRevision).toBe(writable.authorizationRevision);
  }));

  test('publication readiness mirrors its typed read-side failure without synthesizing a verdict', () => withRegistryHome((repoRoot) => {
    const policy = getMcpPolicy('planner', { allowedRoots: [repoRoot] });
    const result = parseResult(callFleetTool({ repoRoot, policy }, 'publication_readiness'));
    expect(result.error).toMatchObject({ code: 'receipt_unavailable' });
  }));
});
