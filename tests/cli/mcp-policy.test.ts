import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { hashMcpInput, mcpAuditLogPath, tryWriteMcpAuditEntry, writeMcpAuditEntry } from '../../src/cli/mcp/audit';
import { getMcpPolicy } from '../../src/cli/mcp/policy';
import { redactMcpText } from '../../src/cli/mcp/redaction';
import { globMatches, normalizeMcpRelativePath, resolveMcpPath } from '../../src/cli/mcp/paths';
import { buildMcpToolDefinitions, callMcpTool } from '../../src/cli/mcp/tools';

async function jsonTool(repoRoot: string, policy: ReturnType<typeof getMcpPolicy>, name: string, args: Record<string, unknown> = {}) {
  const result = await callMcpTool({ repoRoot, policy }, name, args);
  return JSON.parse(result.content[0].text);
}

describe('mcp policy and paths', () => {
  test('matches repo-harness workflow globs without matching sibling paths', () => {
    expect(globMatches('plans/**', 'plans/prds/example.prd.md')).toBe(true);
    expect(globMatches('plans/plan-*.md', 'plans/plan-test.md')).toBe(true);
    expect(globMatches('plans/plan-*.md', 'plans/archive/plan-test.md')).toBe(false);
    expect(globMatches('*.pem', 'secret.pem')).toBe(true);
    expect(globMatches('*.pem', 'nested/secret.pem')).toBe(false);
  });

  test('normalizes relative paths and rejects traversal or absolute input', () => {
    expect(normalizeMcpRelativePath('./plans/prds/test.md')).toMatchObject({
      ok: true,
      relativePath: 'plans/prds/test.md',
    });
    expect(normalizeMcpRelativePath('plans\\prds\\test.md')).toMatchObject({
      ok: true,
      relativePath: 'plans/prds/test.md',
    });
    expect(normalizeMcpRelativePath('../outside').ok).toBe(false);
    expect(normalizeMcpRelativePath('/tmp/outside').ok).toBe(false);
  });

  test('planner profile permits workflow reads and blocks denied or source writes', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-policy-'));
    try {
      mkdirSync(join(tmp, 'plans/prds'), { recursive: true });
      mkdirSync(join(tmp, 'src'), { recursive: true });
      writeFileSync(join(tmp, 'plans/prds/test.prd.md'), '# Test\n');
      writeFileSync(join(tmp, '.env'), 'TOKEN=secret\n');
      mkdirSync(join(tmp, 'tasks/secrets'), { recursive: true });
      writeFileSync(join(tmp, 'tasks/secrets/token.txt'), 'TOKEN=secret\n');
      mkdirSync(join(tmp, '.ai/harness/nested'), { recursive: true });
      writeFileSync(join(tmp, '.ai/harness/nested/private.key'), 'SECRET=secret\n');

      const policy = getMcpPolicy('planner');
      expect(resolveMcpPath(tmp, 'plans/prds/test.prd.md', policy, 'read')).toMatchObject({
        ok: true,
        relativePath: 'plans/prds/test.prd.md',
      });
      expect(resolveMcpPath(tmp, '.env', policy, 'read')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, 'src/index.ts', policy, 'read')).toMatchObject({
        ok: false,
        relativePath: 'src/index.ts',
        reason: 'path is not allowed for read: src/index.ts',
      });
      expect(resolveMcpPath(tmp, 'src/index.ts', policy, 'write')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, 'plans/prds/new.prd.md', policy, 'write')).toMatchObject({
        ok: true,
        relativePath: 'plans/prds/new.prd.md',
      });

      const executor = getMcpPolicy('executor');
      expect(resolveMcpPath(tmp, 'tasks/secrets/token.txt', executor, 'read')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, '.ai/harness/nested/private.key', executor, 'read')).toMatchObject({ ok: false });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('broad read policy keeps deny globs while accepting authorized absolute reads', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-full-disk-'));
    const outside = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-full-disk-outside-'));
    try {
      mkdirSync(join(tmp, 'plans/prds'), { recursive: true });
      writeFileSync(join(tmp, '.env'), 'TOKEN=secret\n');
      writeFileSync(join(tmp, 'plans/prds/readme.md'), '# readable\n');
      writeFileSync(join(outside, 'note.md'), '# outside\n');

      const normal = getMcpPolicy('planner');
      expect(resolveMcpPath(tmp, join(tmp, '.env'), normal, 'read')).toMatchObject({ ok: false });

      const fullDisk = getMcpPolicy('planner', { fullDiskRead: true });
      expect(resolveMcpPath(tmp, join(tmp, '.env'), fullDisk, 'read')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, join(tmp, 'plans/prds/readme.md'), fullDisk, 'read')).toMatchObject({
        ok: true,
        relativePath: 'plans/prds/readme.md',
      });
      expect(resolveMcpPath(tmp, join(tmp, 'plans/prds/new.md'), fullDisk, 'write')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, join(outside, 'note.md'), fullDisk, 'read')).toMatchObject({ ok: false });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('planner profile exposes workflow tools plus current-repo workspace reader capability', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-reader-policy-'));
    try {
      writeFileSync(join(tmp, '.env'), 'TOKEN=secret\n');
      writeFileSync(join(tmp, 'notes.md'), '# notes\n');
      const policy = getMcpPolicy('planner', { enableReader: true, allowedRoots: [tmp] });
      expect(policy.capabilities.workspaceReader).toBe(true);
      expect(policy.capabilities.workflowPlanner).toBe(true);
      expect(policy.capabilities.agentRunner).toBe(false);
      expect(policy.writeGlobs).toContain('plans/prds/**');
      expect(policy.allowAbsoluteRead).toBe(false);
      expect(resolveMcpPath(tmp, '.env', policy, 'read')).toMatchObject({ ok: false });
      const tools = buildMcpToolDefinitions(policy).map((tool) => tool.name);
      expect(tools).toContain('write_prd');
      expect(tools).toContain('prepare_codex_goal_from_sprint');
      expect(tools).toContain('reader_status');
      expect(tools).toContain('list_allowed_roots');
      expect(tools).toContain('open_workspace');
      expect(tools).toContain('tree');
      expect(tools).toContain('search_text');
      expect(tools).toContain('read_text');
      expect(tools).not.toContain('run_agent_goal');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('blocks symlink escapes from allowed workflow roots', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-symlink-'));
    const outside = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-outside-'));
    try {
      mkdirSync(join(tmp, 'plans'), { recursive: true });
      writeFileSync(join(outside, 'secret.md'), '# outside\n');
      symlinkSync(join(outside, 'secret.md'), join(tmp, 'plans', 'linked.md'));

      const policy = getMcpPolicy('planner');
      const decision = resolveMcpPath(tmp, 'plans/linked.md', policy, 'read');
      expect(decision.ok).toBe(false);
      expect(decision.reason).toContain('escapes repository root');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('orchestrator dev runner is opt-in and reads only the fixed goal handoff', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-orchestrator-'));
    try {
      mkdirSync(join(tmp, '.ai/harness/handoff'), { recursive: true });
      mkdirSync(join(tmp, 'src'), { recursive: true });
      writeFileSync(join(tmp, '.ai/harness/handoff/codex-goal.md'), '# Codex Goal\n');
      writeFileSync(join(tmp, 'src/index.ts'), 'export const value = 1;\n');

      const disabled = getMcpPolicy('orchestrator');
      expect(disabled.execution.agentRunner).toBe(false);
      expect(buildMcpToolDefinitions(disabled).some((tool) => tool.name === 'run_agent_goal')).toBe(false);
      expect(resolveMcpPath(tmp, '.ai/harness/handoff/codex-goal.md', disabled, 'read')).toMatchObject({ ok: false });

      const enabled = getMcpPolicy('orchestrator', { devAgentRunner: true, allowedAgents: ['codex'], runnerTimeoutMs: 5000 });
      expect(enabled.execution.agentRunner).toBe(true);
      expect(enabled.execution.allowedAgents).toEqual(['codex']);
      expect(buildMcpToolDefinitions(enabled).some((tool) => tool.name === 'run_agent_goal')).toBe(true);
      expect(resolveMcpPath(tmp, '.ai/harness/handoff/codex-goal.md', enabled, 'read')).toMatchObject({ ok: true });
      expect(resolveMcpPath(tmp, 'src/index.ts', enabled, 'read')).toMatchObject({ ok: false });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('executor and orchestrator profiles keep reader and planner writes out of their regression surface', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-profile-regression-'));
    try {
      mkdirSync(join(tmp, 'plans/prds'), { recursive: true });
      mkdirSync(join(tmp, '.ai/harness/handoff'), { recursive: true });
      mkdirSync(join(tmp, '.ai/harness/checks'), { recursive: true });
      writeFileSync(join(tmp, 'plans/prds/existing.prd.md'), '# Existing\n');
      writeFileSync(join(tmp, '.ai/harness/handoff/codex-goal.md'), '# Codex Goal\n');

      const executor = getMcpPolicy('executor');
      const executorTools = buildMcpToolDefinitions(executor).map((tool) => tool.name);
      expect(executor.capabilities).toMatchObject({
        workspaceReader: false,
        workflowExecutor: true,
        agentRunner: false,
      });
      expect(executorTools).toContain('run_workflow_check');
      expect(executorTools).not.toContain('reader_status');
      expect(executorTools).not.toContain('tree');
      expect(executorTools).not.toContain('read_text');
      expect(executorTools).not.toContain('search_text');
      expect(executorTools).not.toContain('run_agent_goal');
      expect(resolveMcpPath(tmp, '.ai/harness/checks/latest.json', executor, 'write')).toMatchObject({ ok: true });
      expect(resolveMcpPath(tmp, 'plans/prds/new.prd.md', executor, 'write')).toMatchObject({ ok: false });
      const executorWrite = await jsonTool(tmp, executor, 'write_prd', {
        title: 'Executor Write',
        slug: 'executor-write',
        body: '# Executor Write\n',
      });
      expect(executorWrite.error.code).toBe('POLICY_DENIED');

      const orchestrator = getMcpPolicy('orchestrator');
      const orchestratorTools = buildMcpToolDefinitions(orchestrator).map((tool) => tool.name);
      expect(orchestrator.capabilities).toMatchObject({
        workspaceReader: false,
        workflowExecutor: false,
        agentRunner: false,
      });
      expect(orchestratorTools).not.toContain('run_workflow_check');
      expect(orchestratorTools).not.toContain('reader_status');
      expect(orchestratorTools).not.toContain('run_agent_goal');
      const orchestratorWrite = await jsonTool(tmp, orchestrator, 'write_prd', {
        title: 'Orchestrator Write',
        slug: 'orchestrator-write',
        body: '# Orchestrator Write\n',
      });
      expect(orchestratorWrite.error.code).toBe('POLICY_DENIED');

      const orchestratorDev = getMcpPolicy('orchestrator', { devAgentRunner: true, allowedAgents: ['codex'], runnerTimeoutMs: 5000 });
      const orchestratorDevTools = buildMcpToolDefinitions(orchestratorDev).map((tool) => tool.name);
      expect(orchestratorDevTools).toContain('run_agent_goal');
      expect(orchestratorDevTools).not.toContain('reader_status');
      expect(resolveMcpPath(tmp, '.ai/harness/handoff/codex-goal.md', orchestratorDev, 'read')).toMatchObject({ ok: true });
      expect(resolveMcpPath(tmp, 'plans/prds/existing.prd.md', orchestratorDev, 'read')).toMatchObject({ ok: false });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('mcp redaction and audit', () => {
  test('redacts common token and private key patterns', () => {
    const input = [
      'Authorization: Bearer token-value',
      'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz',
      'MY_API_KEY=plain-secret',
      'APP_SECRET: another-secret',
      '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    ].join('\n');
    const result = redactMcpText(input);
    expect(result.text).toContain('Authorization: Bearer [REDACTED]');
    expect(result.text).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(result.text).toContain('MY_API_KEY=[REDACTED]');
    expect(result.text).toContain('APP_SECRET:[REDACTED]');
    expect(result.text).toContain('[PRIVATE KEY REDACTED]');
    expect(result.text).not.toContain('token-value');
    expect(result.text).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(result.text).not.toContain('plain-secret');
    expect(result.text).not.toContain('another-secret');
  });

  test('audit log stores input hash and redacted errors', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-audit-'));
    try {
      const inputHash = hashMcpInput({ body: 'secret body' });
      writeMcpAuditEntry(tmp, {
        timestamp: '2026-06-17T00:00:00.000Z',
        tool: 'write_prd',
        status: 'failed',
        targetPath: 'plans/prds/test.prd.md',
        inputHash,
        error: 'Authorization: Bearer token-value',
      });

      const line = readFileSync(mcpAuditLogPath(tmp), 'utf-8').trim();
      expect(line).toContain(inputHash);
      expect(line).toContain('Authorization: Bearer [REDACTED]');
      expect(line).not.toContain('secret body');
      expect(line).not.toContain('token-value');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('safe audit write reports failure without throwing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-audit-failure-'));
    try {
      const blockingFile = join(tmp, 'not-a-dir');
      writeFileSync(blockingFile, 'not a directory\n');
      expect(tryWriteMcpAuditEntry(blockingFile, {
        timestamp: '2026-06-17T00:00:00.000Z',
        tool: 'read_workflow_file',
        status: 'ok',
        inputHash: hashMcpInput({ path: 'plans/test.md' }),
      })).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
