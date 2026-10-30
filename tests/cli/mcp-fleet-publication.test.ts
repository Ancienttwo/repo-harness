import { execFileSync } from 'node:child_process';
import { assertLocalPullRequestRepository } from '../../src/effects/publication/merge-readiness';
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { mcpAuditBotForClient, mcpAuditLogPath, runWithMcpAuditBot } from '../../src/cli/mcp/audit';
import { buildMcpServerInstructions } from '../../src/cli/mcp/instructions';
import { getMcpPolicy } from '../../src/cli/mcp/policy';
import {
  buildFleetToolDefinitions,
  callFleetTool,
} from '../../src/cli/mcp/fleet-tools';
import { buildMcpToolDefinitions, callMcpTool } from '../../src/cli/mcp/tools';
import { setRepoHarnessAccessMode } from '../../src/effects/repo-registry';
import {
  BASE,
  HEAD,
  MERGE_COMMIT,
  PR,
  REPOSITORY,
  REPOSITORY_ID,
  graphqlVariable,
  installFakeGh,
  isMergeMutation,
  passingScenario,
  type InstalledFakeGh,
} from '../helpers/publication-merge-fake-gh';
import { commitAll, initGitRepo, run } from '../helpers/repo-fixture';

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

interface MergeFixture {
  readonly root: string;
  readonly granted: string;
  readonly readOnly: string;
  readonly gh: InstalledFakeGh;
}

function checkout(root: string, name: string): string {
  const repo = join(root, name);
  mkdirSync(join(repo, '.ai/harness'), { recursive: true });
  writeFileSync(join(repo, '.ai/harness/policy.json'), '{}\n');
  initGitRepo(repo);
  commitAll(repo, 'fixture');
  expect(run('git', ['remote', 'add', 'origin', `https://github.com/${REPOSITORY}.git`], repo).status).toBe(0);
  return repo;
}

/** A read_write granted checkout and a read_only one of the same GitHub repository, with a fake gh on REPO_HARNESS_GH_BIN. */
async function withMergeFixture(test: (fixture: MergeFixture) => Promise<void>): Promise<void> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-mcp-merge-')));
  const previous = { home: process.env.REPO_HARNESS_HOME, gh: process.env.REPO_HARNESS_GH_BIN };
  process.env.REPO_HARNESS_HOME = join(root, 'home');
  try {
    const granted = checkout(root, 'granted');
    const readOnly = checkout(root, 'read-only');
    expect(setRepoHarnessAccessMode(granted, 'read_write').accessMode).toBe('read_write');
    expect(setRepoHarnessAccessMode(readOnly, 'read_only').accessMode).toBe('read_only');
    const gh = installFakeGh(root, passingScenario());
    process.env.REPO_HARNESS_GH_BIN = gh.bin;
    await test({ root, granted, readOnly, gh });
  } finally {
    for (const [key, value] of [['REPO_HARNESS_HOME', previous.home], ['REPO_HARNESS_GH_BIN', previous.gh]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

const mergeArgs = { repository: REPOSITORY, provider_repository_id: REPOSITORY_ID, pr_number: PR, expected_head_sha: HEAD, expected_base_sha: BASE };

function auditRows(repoRoot: string): Record<string, any>[] {
  return readFileSync(mcpAuditLogPath(repoRoot), 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
}

describe('merge_pull_request MCP tool', () => {
  test('only the orchestrator profile lists and reaches the merge tool', () => withMergeFixture(async ({ granted, gh }) => {
    const orchestrator = getMcpPolicy('orchestrator', { allowedRoots: [granted] });
    expect(orchestrator.capabilities.publicationMerge).toBe(true);
    const tool = buildMcpToolDefinitions(orchestrator).find((definition) => definition.name === 'merge_pull_request');
    expect(tool?.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    for (const profile of ['planner', 'executor', 'coding'] as const) {
      const policy = getMcpPolicy(profile, { allowedRoots: [granted] });
      expect(policy.capabilities.publicationMerge).toBe(false);
      expect(buildMcpToolDefinitions(policy, { enableChatgptBrowser: true }).map((definition) => definition.name)).not.toContain('merge_pull_request');
      const denied = parseResult(await callMcpTool({ repoRoot: granted, policy }, 'merge_pull_request', mergeArgs));
      expect(denied.error.code).toBe('TOOL_NOT_AVAILABLE');
    }
    expect(gh.calls()).toEqual([]);
    expect(buildMcpServerInstructions({ taskDispatchEnabled: true, publicationMergeEnabled: true })).toContain('merge_pull_request');
    expect(buildMcpServerInstructions({ taskDispatchEnabled: true })).not.toContain('merge_pull_request');
  }));

  test('merges through the CLI executor and audits the OAuth actor, PR, head and outcome', () => withMergeFixture(async ({ granted, gh }) => {
    const policy = getMcpPolicy('orchestrator', { allowedRoots: [granted] });
    const result = parseResult(await runWithMcpAuditBot(mcpAuditBotForClient('client-orchestrator'),
      () => callMcpTool({ repoRoot: granted, policy }, 'merge_pull_request', mergeArgs)));
    expect(result).toMatchObject({ kind: 'repo-harness-publication-merge', merge_commit_sha: MERGE_COMMIT, parent_sha: BASE,
      revert: `git revert ${MERGE_COMMIT}` });
    expect(result.audit_write_failed).toBeUndefined();
    const mutations = gh.calls().filter(isMergeMutation);
    expect(mutations).toHaveLength(1);
    expect(graphqlVariable(mutations[0]!, 'expectedHeadOid')).toBe(HEAD);
    expect(auditRows(granted).at(-1)).toMatchObject({ tool: 'merge_pull_request', status: 'ok', actor: 'client-orchestrator',
      pr_number: PR, head_sha: HEAD, base_sha: BASE, outcome: 'merged', merge_commit_sha: MERGE_COMMIT });
  }));

  test('a refusal without an OAuth identity is audited as actor_unavailable and sends no mutation', () => withMergeFixture(async ({ granted, gh }) => {
    gh.setScenario(passingScenario({ policyBase: '{"publication":{"acceptance_merge":"off"}}' }));
    const policy = getMcpPolicy('orchestrator', { allowedRoots: [granted] });
    // A caller-supplied identity is not an argument of this tool.
    const injected = parseResult(await callMcpTool({ repoRoot: granted, policy }, 'merge_pull_request', { ...mergeArgs, actor: 'spoofed' }));
    expect(injected.error.code).toBe('INVALID_ARGUMENT');
    const result = parseResult(await callMcpTool({ repoRoot: granted, policy }, 'merge_pull_request', mergeArgs));
    expect(result.error).toMatchObject({ code: 'acceptance_merge_off', details: { exit_code: 3 } });
    expect(gh.calls().filter(isMergeMutation)).toHaveLength(0);
    expect(auditRows(granted).map((row) => [row.actor, row.status, row.outcome ?? row.errorCode])).toEqual([
      ['actor_unavailable', 'blocked', 'INVALID_ARGUMENT'],
      ['actor_unavailable', 'blocked', 'acceptance_merge_off'],
    ]);
  }));

  test('a repository that is not a read_write granted checkout is REPO_NOT_ALLOWED before any provider call', () => withMergeFixture(async ({ granted, readOnly, gh }) => {
    const policy = getMcpPolicy('orchestrator', { allowedRoots: [granted] });
    const foreign = parseResult(await callMcpTool({ repoRoot: granted, policy }, 'merge_pull_request', { ...mergeArgs, repository: 'example/foreign' }));
    expect(foreign.error.code).toBe('REPO_NOT_ALLOWED');
    const notGranted = parseResult(await callMcpTool({ repoRoot: granted, policy }, 'merge_pull_request', { ...mergeArgs, repo_path: readOnly }));
    expect(notGranted.error.code).toBe('REPO_NOT_ALLOWED');
    expect(gh.calls()).toEqual([]);
  }));

  test('a merged PR whose audit row cannot be written stays merged and reports audit_write_failed', () => withMergeFixture(async ({ granted, gh }) => {
    writeFileSync(join(granted, '.ai/harness/mcp'), 'not a directory\n');
    const policy = getMcpPolicy('orchestrator', { allowedRoots: [granted] });
    const result = parseResult(await runWithMcpAuditBot(mcpAuditBotForClient('client-orchestrator'),
      () => callMcpTool({ repoRoot: granted, policy }, 'merge_pull_request', mergeArgs)));
    expect(result).toMatchObject({ merge_commit_sha: MERGE_COMMIT, audit_write_failed: true });
    expect(gh.calls().filter(isMergeMutation)).toHaveLength(1);
  }));
});
