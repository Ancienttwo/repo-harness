import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');

function runChatgpt(args: string[], cwd = ROOT, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync('bun', [CLI, 'chatgpt', ...args], {
    cwd,
    encoding: 'utf-8',
    env,
  });
}

function withRepo<T>(fn: (repoRoot: string) => T): T {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-chatgpt-browser-'));
  try {
    mkdirSync(join(repoRoot, 'plans/sprints'), { recursive: true });
    mkdirSync(join(repoRoot, 'docs'), { recursive: true });
    writeFileSync(join(repoRoot, 'plans/sprints/example.sprint.md'), '# Sprint\n\n- [ ] Task\n');
    writeFileSync(join(repoRoot, 'docs/example.md'), '# Docs\n');
    writeFileSync(join(repoRoot, '.env'), 'SECRET=value\n');
    return fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

describe('chatgpt browser command', () => {
  test('prints help for browser command group', () => {
    const root = runChatgpt(['--help']);
    expect(root.status).toBe(0);
    expect(root.stdout).toContain('browser-consult');
    expect(root.stdout).toContain('browser-followup');
    expect(root.stdout).toContain('browser-session');
    expect(root.stdout).toContain('browser-doctor');
    expect(root.stdout).toContain('browser-open');
    expect(root.stdout).toContain('browser-cleanup');

      const consult = runChatgpt(['browser-consult', '--help']);
      expect(consult.status).toBe(0);
      expect(consult.stdout).toContain('ChatGPT Web');
      expect(consult.stdout).toContain('--dry-run');
      expect(consult.stdout).toContain('--profile-dir');
      expect(consult.stdout).toContain('--keep-browser');
  });

  test('dry-run consult writes a repo-local session with inline files', () => {
    withRepo((repoRoot) => {
      const result = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--dry-run',
        '--title',
        'review sprint',
        '--prompt',
        'Review this sprint.',
        '--file',
        'plans/sprints/example.sprint.md',
        '--follow-up',
        'Challenge the recommendation.',
        '--model',
        'GPT-5.5 Pro',
        '--thinking',
        'heavy',
      ]);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.status).toBe('dry_run');
      expect(payload.sessionId).toMatch(/^chgpt_\d{8}_\d{6}_review-sprint$/);
      expect(payload.dryRun.files[0].path).toBe('plans/sprints/example.sprint.md');

      const metaPath = join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json');
      expect(existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      expect(meta.engine).toBe('chatgpt-browser');
      expect(meta.provider).toBe('oracle');

      const read = runChatgpt(['browser-session', '--repo', repoRoot, payload.sessionId]);
      expect(read.status).toBe(0);
      expect(read.stdout).toContain('Dry run only');

      const listed = runChatgpt(['browser-list', '--repo', repoRoot, '--json']);
      expect(listed.status).toBe(0);
      expect(JSON.parse(listed.stdout).sessions[0].sessionId).toBe(payload.sessionId);

      const followup = runChatgpt([
        'browser-followup',
        '--repo',
        repoRoot,
        '--session',
        payload.sessionId,
        '--dry-run',
        '--prompt',
        'Turn that into a goal.',
      ]);
      expect(followup.status).toBe(0);
      const followupPayload = JSON.parse(followup.stdout);
      expect(followupPayload.sourceSessionId).toBe(payload.sessionId);
      const followupMeta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', followupPayload.sessionId, 'meta.json'), 'utf-8'));
      expect(followupMeta.sourceSessionId).toBe(payload.sessionId);

      const cleanupPlan = runChatgpt(['browser-cleanup', '--repo', repoRoot, '--status', 'dry_run', '--limit', '1', '--json']);
      expect(cleanupPlan.status).toBe(0);
      expect(JSON.parse(cleanupPlan.stdout).dryRun).toBe(true);
    });
  });

  test('denies secret files before writing a session', () => {
    withRepo((repoRoot) => {
      const result = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--dry-run',
        '--prompt',
        'Read this.',
        '--file',
        '.env',
      ]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('path is denied by ChatGPT browser policy');
      expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);
    });
  });

  test('native provider readiness and dry-run are wired without opening a browser', () => {
    withRepo((repoRoot) => {
      const doctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'native', '--json']);
      expect(doctor.status).toBe(0);
      const readiness = JSON.parse(doctor.stdout);
      expect(readiness.provider).toBe('native');
      expect(['ready', 'partial']).toContain(readiness.status);
      expect(typeof readiness.native.installed).toBe('boolean');
      expect(readiness.native.driver).toBe('chrome-cdp');
      expect(readiness.native.defaultChannel).toBe('chrome');

      const result = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--provider',
        'native',
        '--dry-run',
        '--prompt',
        'Reply exactly OK',
      ]);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
      expect(meta.provider).toBe('native');
      expect(meta.status).toBe('dry_run');
    });
  });

  test('oracle provider wrapper executes a visible oracle binary and saves stdout', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-bin-'));
      const artifactPath = join(repoRoot, 'oracle-artifact.md');
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(artifactPath, '# Imported artifact\n');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'printf "%s\\n" "Oracle saw: $*"',
            'printf "%s\\n" "Session ID: oracle_fake_123"',
            'printf "%s\\n" "https://chatgpt.com/c/fake-conversation"',
            `printf "%s\\n" "Artifact: ${artifactPath}"`,
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--file',
          'docs/example.md',
          '--model',
          'GPT-5.5 Pro',
          '--thinking',
          'heavy',
        ], repoRoot, { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` });
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('completed');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('Oracle saw: --engine browser');
        const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
        expect(meta.browser.conversationUrl).toBe('https://chatgpt.com/c/fake-conversation');
        expect(meta.providerSessionId).toBe('oracle_fake_123');
        expect(meta.output.artifacts[0].fileName).toBe('oracle-artifact.md');
        expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'artifacts/oracle-artifact.md'))).toBe(true);

        const opened = runChatgpt(['browser-open', '--repo', repoRoot, payload.sessionId]);
        expect(opened.status).toBe(0);
        expect(JSON.parse(opened.stdout).url).toBe('https://chatgpt.com/c/fake-conversation');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('ships browser engine docs and Codex Skill', () => {
    const guide = join(ROOT, 'docs/repo-harness-chatgpt-browser-engine.md');
    const skill = join(ROOT, '.agents/skills/repo-harness-chatgpt-browser/SKILL.md');
    expect(readFileSync(guide, 'utf-8')).toContain('repo-harness chatgpt browser-consult');
    expect(readFileSync(guide, 'utf-8')).toContain('--provider native');
    expect(readFileSync(guide, 'utf-8')).toContain('--browser-channel chrome');
    expect(readFileSync(skill, 'utf-8')).toContain('repo-harness-chatgpt-browser');
  });
});
