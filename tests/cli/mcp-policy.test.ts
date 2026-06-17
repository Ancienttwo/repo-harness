import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { hashMcpInput, mcpAuditLogPath, tryWriteMcpAuditEntry, writeMcpAuditEntry } from '../../src/cli/mcp/audit';
import { getMcpPolicy } from '../../src/cli/mcp/policy';
import { redactMcpText } from '../../src/cli/mcp/redaction';
import { globMatches, normalizeMcpRelativePath, resolveMcpPath } from '../../src/cli/mcp/paths';

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
    expect(tryWriteMcpAuditEntry('/dev/null/not-a-dir', {
      timestamp: '2026-06-17T00:00:00.000Z',
      tool: 'read_workflow_file',
      status: 'ok',
      inputHash: hashMcpInput({ path: 'plans/test.md' }),
    })).toBe(false);
  });
});
