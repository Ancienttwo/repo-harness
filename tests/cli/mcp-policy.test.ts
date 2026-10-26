import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { hashMcpInput, mcpAuditBotForClient, mcpAuditLogPath, runWithMcpAuditBot, tryWriteMcpAuditEntry, writeMcpAuditEntry } from '../../src/cli/mcp/audit';
import { registerBot } from '../../src/effects/bot-registry';
import { getMcpPolicy } from '../../src/cli/mcp/policy';
import { redactMcpText } from '../../src/cli/mcp/redaction';
import { globMatches, normalizeMcpRelativePath, resolveMcpPath } from '../../src/cli/mcp/paths';
import { buildMcpToolDefinitions, callMcpTool } from '../../src/cli/mcp/tools';
import { SEGMENTED_LOG_SEGMENT_BYTES } from '../../src/effects/segmented-log';

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
      expect(executor.allowAbsoluteRead).toBe(false);
      expect(executor.readGlobs).not.toContain('**');
      expect(executor.execution.fixedWorkflowCheck).toBe(true);
      expect(resolveMcpPath(tmp, 'tasks/secrets/token.txt', executor, 'read')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, '.ai/harness/nested/private.key', executor, 'read')).toMatchObject({ ok: false });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('scoped read policy keeps deny globs and permits workflow files', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-full-disk-'));
    const outside = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-full-disk-outside-'));
    try {
      mkdirSync(join(tmp, 'plans/prds'), { recursive: true });
      writeFileSync(join(tmp, '.env'), 'TOKEN=secret\n');
      writeFileSync(join(tmp, 'plans/prds/readme.md'), '# readable\n');
      writeFileSync(join(outside, 'note.md'), '# outside\n');

      const normal = getMcpPolicy('planner');
      expect(resolveMcpPath(tmp, join(tmp, '.env'), normal, 'read')).toMatchObject({ ok: false });

      const scoped = getMcpPolicy('planner');
      expect(scoped.allowAbsoluteRead).toBe(false);
      expect(scoped.readGlobs).not.toContain('**');
      expect(scoped.execution.fixedWorkflowCheck).toBe(true);
      expect(resolveMcpPath(tmp, join(tmp, '.env'), scoped, 'read')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, 'plans/prds/readme.md', scoped, 'read')).toMatchObject({
        ok: true,
        relativePath: 'plans/prds/readme.md',
      });
      expect(resolveMcpPath(tmp, join(tmp, 'plans/prds/new.md'), scoped, 'write')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, join(outside, 'note.md'), scoped, 'read')).toMatchObject({ ok: false });
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
      expect(policy.writeGlobs).toContain('plans/prds/**');
      expect(policy.allowAbsoluteRead).toBe(false);
      expect(resolveMcpPath(tmp, '.env', policy, 'read')).toMatchObject({ ok: false });
      const tools = buildMcpToolDefinitions(policy).map((tool) => tool.name);
      expect(tools).toContain('write_prd');
      expect(tools).toContain('prepare_task_goal_from_sprint');
      expect(tools).toContain('reader_status');
      expect(tools).toContain('list_allowed_roots');
      expect(tools).toContain('open_workspace');
      expect(tools).toContain('tree');
      expect(tools).toContain('search_text');
      expect(tools).toContain('read_text');
      expect(tools).toContain('repo_manifest');
      expect(tools).toContain('write_file');
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

  test('executor and orchestrator profiles keep reader and planner writes out of their regression surface', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-profile-regression-'));
    try {
      mkdirSync(join(tmp, 'plans/prds'), { recursive: true });
      mkdirSync(join(tmp, '.ai/harness/handoff'), { recursive: true });
      mkdirSync(join(tmp, '.ai/harness/checks'), { recursive: true });
      writeFileSync(join(tmp, 'plans/prds/existing.prd.md'), '# Existing\n');
      writeFileSync(join(tmp, '.ai/harness/handoff/task-goal.md'), '# Task Goal\n');

      const executor = getMcpPolicy('executor');
      expect(executor.allowAbsoluteRead).toBe(false);
      expect(executor.readGlobs).not.toContain('**');
      expect(executor.execution.fixedWorkflowCheck).toBe(true);
      const executorTools = buildMcpToolDefinitions(executor).map((tool) => tool.name);
      expect(executor.capabilities).toMatchObject({
        workspaceReader: false,
        workflowExecutor: true,
      });
      expect(executorTools).toContain('run_workflow_check');
      expect(executorTools).not.toContain('reader_status');
      expect(executorTools).not.toContain('tree');
      expect(executorTools).not.toContain('read_text');
      expect(executorTools).not.toContain('search_text');
      expect(executorTools).not.toContain('run_agent_goal');
      expect(resolveMcpPath(tmp, '.ai/harness/checks/change-assessment.latest.json', executor, 'write')).toMatchObject({ ok: true });
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

      expect(resolveMcpPath(tmp, '.ai/harness/handoff/task-goal.md', orchestrator, 'read')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, 'plans/prds/existing.prd.md', orchestrator, 'read')).toMatchObject({ ok: false });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('coding exposes workflow, publication, and direct coding tools exactly once', () => {
    const coding = getMcpPolicy('coding');
    const definitions = buildMcpToolDefinitions(coding);
    const codingNames = ['open_workspace', 'read', 'apply_patch', 'exec_command', 'write_stdin'];
    expect(coding.capabilities).toMatchObject({
      workflowPlanner: true,
      workspaceReader: false,
      workspaceCoder: true,
    });
    expect(coding.execution).toMatchObject({ codingShell: true });
    expect(definitions).toHaveLength(25);
    expect(definitions.filter((tool) => codingNames.includes(tool.name)).map((tool) => tool.name)).toEqual(codingNames);
    expect(definitions.map((tool) => tool.name)).toContain('write_prd');
    expect(definitions.map((tool) => tool.name)).toContain('prepare_task_goal_from_sprint');
    expect(definitions.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'publication_readiness',
    ]));
    expect(new Set(definitions.map((tool) => tool.name)).size).toBe(definitions.length);
    expect(definitions.find((tool) => tool.name === 'exec_command')?.annotations).toMatchObject({
      destructiveHint: true,
      openWorldHint: true,
    });

    for (const profile of ['planner', 'executor', 'orchestrator'] as const) {
      const legacyNames = buildMcpToolDefinitions(getMcpPolicy(profile)).map((tool) => tool.name);
      expect(legacyNames).not.toContain('exec_command');
      expect(legacyNames).not.toContain('write_stdin');
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

  test('audit rows carry the Bot of the calling OAuth client, or null', () => {
    const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-mcp-audit-bot-')));
    try {
      const env = { REPO_HARNESS_HOME: join(tmp, 'home') };
      registerBot({ bot_id: 'hermes', name: 'Hermes', host: 'Hermes', mcp_client_id: 'client-a' }, env);
      expect(mcpAuditBotForClient('client-a', env)).toBe('hermes');
      expect(mcpAuditBotForClient('client-z', env)).toBeNull();
      expect(mcpAuditBotForClient(undefined, env)).toBeNull();
      writeFileSync(join(tmp, 'home', 'bots', 'broken.json'), '{');
      // An unreadable registry leaves the call unattributed; it never blocks the call.
      expect(mcpAuditBotForClient('client-a', env)).toBeNull();

      const entry = (tool: string) => ({ timestamp: '2026-10-27T00:00:00.000Z', tool, status: 'ok' as const, inputHash: hashMcpInput({}) });
      runWithMcpAuditBot('hermes', () => writeMcpAuditEntry(tmp, entry('from_bot')));
      writeMcpAuditEntry(tmp, entry('outside_call'));
      const rows = readFileSync(mcpAuditLogPath(tmp), 'utf-8').trim().split('\n').map(line => JSON.parse(line));
      expect(rows.map(row => [row.tool, row.botId])).toEqual([['from_bot', 'hermes'], ['outside_call', null]]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('audit log rotates a full segment into its archive before the next append', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-audit-rotate-'));
    try {
      const logPath = mcpAuditLogPath(tmp);
      mkdirSync(dirname(logPath), { recursive: true });
      writeFileSync(logPath, `${'x'.repeat(SEGMENTED_LOG_SEGMENT_BYTES)}\n`);
      writeMcpAuditEntry(tmp, { timestamp: '2026-06-17T00:00:00.000Z', tool: 'read_workflow_file', status: 'ok', inputHash: hashMcpInput({}) });

      expect(JSON.parse(readFileSync(logPath, 'utf-8')).tool).toBe('read_workflow_file');
      const archived = readdirSync(`${logPath}.archive`);
      expect(archived).toHaveLength(1);
      expect(statSync(join(`${logPath}.archive`, archived[0]!)).size).toBe(SEGMENTED_LOG_SEGMENT_BYTES + 1);
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

test('shared token rules keep existing redaction and hide webhook and credential URLs', () => {
  const cases = [
    'Authorization: Bearer fake-value', 'sk-'+'a'.repeat(25), 'ghp_'+'a'.repeat(25),
    'github_pat_'+'a'.repeat(35), 'AKIA'+'A'.repeat(16),
    'eyJ'+'a'.repeat(12)+'.'+'b'.repeat(12)+'.'+'c'.repeat(12),
    '-----BEGIN PRIVATE KEY-----fake-value-----END PRIVATE KEY-----',
    'SECRET=sample-value', 'DATABASE_URL=postgres://example.invalid/db',
    'https://hooks.slack.com/services/TTEST/BTEST/fake-value',
    'https://discord.com/api/webhooks/123456/fake-value',
    'https://user:pass@example.invalid/db', '123456789:'+'a'.repeat(35),
  ];
  for (const input of cases) {
    const result = redactMcpText(input);
    expect(result.text).not.toBe(input);
    expect(result.text).toContain('REDACTED');
    expect(result.redactions.length).toBeGreaterThan(0);
  }
  // MCP keeps its broad assignment rule. Only prompt detection narrows it.
  expect(redactMcpText('tokens: null').text).toContain('REDACTED');
  expect(redactMcpText('bound-task-abcdefghijklmnopqrstuv').text).toContain('REDACTED');
});
