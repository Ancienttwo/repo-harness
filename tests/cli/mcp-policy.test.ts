import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { hashMcpInput, mcpAuditLogPath, tryWriteMcpAuditEntry, writeMcpAuditEntry } from '../../src/cli/mcp/audit';
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
    expect(globMatches('docs/prds/**', 'docs/prds/example.prd.md')).toBe(true);
    expect(globMatches('tasks/lessons.md', 'tasks/lessons.md')).toBe(true);
    expect(globMatches('tasks/lessons.md', 'tasks/notes/example.md')).toBe(false);
    expect(globMatches('*.pem', 'secret.pem')).toBe(true);
    expect(globMatches('*.pem', 'nested/secret.pem')).toBe(false);
  });

  test('normalizes relative paths and rejects traversal or absolute input', () => {
    expect(normalizeMcpRelativePath('./docs/prds/test.md')).toMatchObject({
      ok: true,
      relativePath: 'docs/prds/test.md',
    });
    expect(normalizeMcpRelativePath('docs\\prds\\test.md')).toMatchObject({
      ok: true,
      relativePath: 'docs/prds/test.md',
    });
    expect(normalizeMcpRelativePath('../outside').ok).toBe(false);
    expect(normalizeMcpRelativePath('/tmp/outside').ok).toBe(false);
  });

  test('planner profile permits workflow reads and blocks denied or source writes', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-policy-'));
    try {
      mkdirSync(join(tmp, 'docs/prds'), { recursive: true });
      mkdirSync(join(tmp, 'src'), { recursive: true });
      writeFileSync(join(tmp, 'docs/prds/test.prd.md'), '# Test\n');
      writeFileSync(join(tmp, '.env'), 'TOKEN=secret\n');
      mkdirSync(join(tmp, 'tasks/secrets'), { recursive: true });
      writeFileSync(join(tmp, 'tasks/secrets/token.txt'), 'TOKEN=secret\n');
      mkdirSync(join(tmp, '.ai/harness/nested'), { recursive: true });
      writeFileSync(join(tmp, '.ai/harness/nested/private.key'), 'SECRET=secret\n');

      const policy = getMcpPolicy('planner');
      expect(resolveMcpPath(tmp, 'docs/prds/test.prd.md', policy, 'read')).toMatchObject({
        ok: true,
        relativePath: 'docs/prds/test.prd.md',
      });
      expect(resolveMcpPath(tmp, 'tasks/lessons.md', policy, 'write')).toMatchObject({ ok: true });
      expect(resolveMcpPath(tmp, '.env', policy, 'read')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, 'src/index.ts', policy, 'read')).toMatchObject({
        ok: false,
        relativePath: 'src/index.ts',
        reason: 'path is not allowed for read: src/index.ts',
      });
      expect(resolveMcpPath(tmp, 'src/index.ts', policy, 'write')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, 'docs/prds/new.prd.md', policy, 'write')).toMatchObject({
        ok: true,
        relativePath: 'docs/prds/new.prd.md',
      });
      expect(resolveMcpPath(tmp, 'tasks/notes/x.md', policy, 'read')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, 'tasks/notes/x.md', policy, 'write')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, 'tasks/reviews/x.md', policy, 'read')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, 'tasks/contracts/x.md', policy, 'read')).toMatchObject({ ok: false });

      const executor = getMcpPolicy('executor');
      expect(executor.allowAbsoluteRead).toBe(false);
      expect(executor.readGlobs).not.toContain('**');
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
      mkdirSync(join(tmp, 'docs/prds'), { recursive: true });
      writeFileSync(join(tmp, '.env'), 'TOKEN=secret\n');
      writeFileSync(join(tmp, 'docs/prds/readme.md'), '# readable\n');
      writeFileSync(join(outside, 'note.md'), '# outside\n');

      const normal = getMcpPolicy('planner');
      expect(resolveMcpPath(tmp, join(tmp, '.env'), normal, 'read')).toMatchObject({ ok: false });

      const scoped = getMcpPolicy('planner');
      expect(scoped.allowAbsoluteRead).toBe(false);
      expect(scoped.readGlobs).not.toContain('**');
      expect(resolveMcpPath(tmp, join(tmp, '.env'), scoped, 'read')).toMatchObject({ ok: false });
      expect(resolveMcpPath(tmp, 'docs/prds/readme.md', scoped, 'read')).toMatchObject({
        ok: true,
        relativePath: 'docs/prds/readme.md',
      });
      expect(resolveMcpPath(tmp, join(tmp, 'docs/prds/new.md'), scoped, 'write')).toMatchObject({ ok: false });
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
      expect(policy.writeGlobs).toContain('docs/prds/**');
      expect(policy.writeGlobs).toContain('tasks/lessons.md');
      expect(policy.readGlobs).toContain('docs/prds/**');
      expect(policy.readGlobs).toContain('tasks/lessons.md');
      expect(policy.readGlobs.some((glob) => glob.includes('tasks/notes'))).toBe(false);
      expect(policy.readGlobs.some((glob) => glob.includes('tasks/reviews'))).toBe(false);
      expect(policy.readGlobs.some((glob) => glob.includes('tasks/contracts'))).toBe(false);
      expect(policy.readGlobs.some((glob) => glob.includes('plans/'))).toBe(false);
      expect(policy.allowAbsoluteRead).toBe(false);
      expect(resolveMcpPath(tmp, '.env', policy, 'read')).toMatchObject({ ok: false });
      const tools = buildMcpToolDefinitions(policy).map((tool) => tool.name);
      expect(tools).toContain('write_prd');
      for (const removed of ['write_sprint', 'write_checklist_sprint', 'write_plan', 'list_sprints', 'prepare_task_goal_from_sprint']) {
        expect(tools).not.toContain(removed);
      }
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
      mkdirSync(join(tmp, 'docs/prds'), { recursive: true });
      writeFileSync(join(outside, 'secret.md'), '# outside\n');
      symlinkSync(join(outside, 'secret.md'), join(tmp, 'docs/prds', 'linked.md'));

      const policy = getMcpPolicy('planner');
      const decision = resolveMcpPath(tmp, 'docs/prds/linked.md', policy, 'read');
      expect(decision.ok).toBe(false);
      expect(decision.reason).toContain('escapes repository root');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('executor profile keeps reader tools out and uses the narrowed write scope', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-profile-regression-'));
    try {
      mkdirSync(join(tmp, 'docs/prds'), { recursive: true });
      mkdirSync(join(tmp, 'tasks'), { recursive: true });
      mkdirSync(join(tmp, '.ai/harness/handoff'), { recursive: true });
      mkdirSync(join(tmp, '.ai/harness/checks'), { recursive: true });
      writeFileSync(join(tmp, 'docs/prds/existing.prd.md'), '# Existing\n');
      writeFileSync(join(tmp, 'tasks/lessons.md'), '# Lessons\n');
      writeFileSync(join(tmp, '.ai/harness/handoff/task-goal.md'), '# Task Goal\n');

      const executor = getMcpPolicy('executor');
      expect(executor.allowAbsoluteRead).toBe(false);
      expect(executor.readGlobs).not.toContain('**');
      const executorTools = buildMcpToolDefinitions(executor).map((tool) => tool.name);
      expect(executor.capabilities).toMatchObject({
        workspaceReader: false,
        workflowExecutor: true,
      });
      expect(executorTools).not.toContain('run_workflow_check');
      expect(executorTools).not.toContain('reader_status');
      expect(executorTools).not.toContain('tree');
      expect(executorTools).not.toContain('read_text');
      expect(executorTools).not.toContain('search_text');
      expect(executorTools).not.toContain('run_agent_goal');
      expect(resolveMcpPath(tmp, '.ai/harness/checks/change-assessment.latest.json', executor, 'write')).toMatchObject({ ok: true });
      expect(resolveMcpPath(tmp, 'docs/prds/existing.prd.md', executor, 'read')).toMatchObject({ ok: true });
      expect(resolveMcpPath(tmp, 'tasks/lessons.md', executor, 'read')).toMatchObject({ ok: true });
      expect(resolveMcpPath(tmp, 'docs/prds/new.prd.md', executor, 'write')).toMatchObject({ ok: true });
      expect(resolveMcpPath(tmp, 'tasks/lessons.md', executor, 'write')).toMatchObject({ ok: true });
      expect(resolveMcpPath(tmp, 'tasks/reviews/x.md', executor, 'write')).toMatchObject({ ok: false });
      const executorWrite = await jsonTool(tmp, executor, 'write_prd', {
        title: 'Executor Write',
        slug: 'executor-write',
        body: '# Executor Write\n',
      });
      expect(executorWrite.status).toBe('written');
      expect(executorWrite.path).toMatch(/^docs\/prds\/\d{8}-\d{4}-executor-write\.prd\.md$/);
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
        targetPath: 'docs/prds/test.prd.md',
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
        inputHash: hashMcpInput({ path: 'docs/prds/test.md' }),
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
