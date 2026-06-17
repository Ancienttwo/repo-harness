import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  chatgptGuideMarkdown,
  patchCodexConfigToml,
  runMcpDoctor,
  runMcpInstallSkill,
  runMcpSetupChatgpt,
  runMcpSetupCodex,
} from '../../src/cli/mcp/setup';

function withTmpRepo<T>(fn: (repoRoot: string) => T): T {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-setup-'));
  try {
    mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
    writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
    return fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

describe('mcp setup', () => {
  test('generates ChatGPT local config, guide, and ignore entries', () => {
    withTmpRepo((repoRoot) => {
      const result = runMcpSetupChatgpt({ repo: repoRoot });
      expect(result.changed.length).toBeGreaterThan(0);
      expect(existsSync(join(repoRoot, '.repo-harness/mcp.local.json'))).toBe(true);
      expect(existsSync(join(repoRoot, '.repo-harness/mcp.tokens.json'))).toBe(true);
      expect(existsSync(join(repoRoot, '.repo-harness/mcp.oauth.json'))).toBe(true);
      expect(existsSync(join(repoRoot, 'docs/repo-harness-chatgpt-mcp-setup.md'))).toBe(true);
      const config = JSON.parse(readFileSync(join(repoRoot, '.repo-harness/mcp.local.json'), 'utf-8'));
      expect(config.auth).toMatchObject({
        mode: 'oauth',
        oauthFile: '.repo-harness/mcp.oauth.json',
        tokenFile: '.repo-harness/mcp.tokens.json',
      });
      expect(config.devMode).toMatchObject({
        agentRunner: false,
        allowedAgents: ['codex'],
        timeoutMs: 120000,
      });
      const token = JSON.parse(readFileSync(join(repoRoot, '.repo-harness/mcp.tokens.json'), 'utf-8')).bearerToken;
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(30);
      const passphrase = JSON.parse(readFileSync(join(repoRoot, '.repo-harness/mcp.oauth.json'), 'utf-8')).passphrase;
      expect(typeof passphrase).toBe('string');
      expect(passphrase.length).toBeGreaterThan(20);
      const ignore = readFileSync(join(repoRoot, '.gitignore'), 'utf-8');
      expect(ignore).toContain('.repo-harness/mcp.local.json');
      expect(ignore).toContain('.repo-harness/mcp.tokens.json');
      expect(ignore).toContain('.repo-harness/mcp.oauth.json');
      expect(ignore).toContain('.repo-harness/mcp.oauth-tokens.json');
      expect(ignore).toContain('.ai/harness/mcp/audit.log');

      const doctor = JSON.parse(runMcpDoctor({ repo: repoRoot, json: true }).lines[0]);
      expect(doctor.mcp.authConfigured).toBe(true);
      expect(doctor.mcp.devMode.agentRunner).toBe(false);
      expect(doctor.chatgpt.localEndpoint).toBe('http://127.0.0.1:8765/mcp');
    });
  });

  test('ChatGPT guide uses OAuth for ChatGPT and documents bearer fallback', () => {
    const guide = chatgptGuideMarkdown('https://example.test/mcp');
    expect(guide).toContain('Configure Connector authentication as OAuth');
    expect(guide).toContain('.repo-harness/mcp.oauth.json');
    expect(guide).toContain('oauth-protected-resource');
    expect(guide).toContain('--auth bearer');
    expect(guide).toContain('## Dev Mode Agent Runner');
    expect(guide).toContain('--enable-dev-runner');
    expect(guide).toContain('run_agent_goal');
    expect(guide).toContain('https://example.test/mcp');
  });

  test('patches Codex config while preserving unrelated content', () => {
    const patched = patchCodexConfigToml('[profiles.default]\nmodel = "gpt-5"\n');
    expect(patched).toContain('[profiles.default]');
    expect(patched).toContain('[mcp_servers.repo_harness]');
    expect(patched).toContain('"mcp"');

    withTmpRepo((repoRoot) => {
      mkdirSync(join(repoRoot, '.codex'), { recursive: true });
      writeFileSync(join(repoRoot, '.codex/config.toml'), '[profiles.default]\nmodel = "gpt-5"\n');
      const dryRun = runMcpSetupCodex({ repo: repoRoot, scope: 'project', dryRun: true });
      expect(dryRun.changed).toHaveLength(0);
      expect(readFileSync(join(repoRoot, '.codex/config.toml'), 'utf-8')).not.toContain('[mcp_servers.repo_harness]');

      const result = runMcpSetupCodex({ repo: repoRoot, scope: 'project' });
      expect(result.changed.some((path) => path.endsWith('.codex/config.toml'))).toBe(true);
      expect(existsSync(join(repoRoot, '.codex/config.toml.bak'))).toBe(true);
      const config = readFileSync(join(repoRoot, '.codex/config.toml'), 'utf-8');
      expect(config).toContain('[profiles.default]');
      expect(config).toContain('[mcp_servers.repo_harness]');

      const again = runMcpSetupCodex({ repo: repoRoot, scope: 'project' });
      expect(again.changed).toHaveLength(0);
    });
  });

  test('installs bridge skill template with overwrite protection', () => {
    withTmpRepo((repoRoot) => {
      runMcpInstallSkill({ repo: repoRoot });
      const skill = join(repoRoot, '.agents/skills/repo-harness-chatgpt-bridge/SKILL.md');
      expect(existsSync(skill)).toBe(true);
      expect(readFileSync(skill, 'utf-8')).toContain('repo-harness-chatgpt-bridge');
      writeFileSync(skill, 'custom\n');
      const protectedResult = runMcpInstallSkill({ repo: repoRoot });
      expect(protectedResult.changed).toHaveLength(0);
      expect(readFileSync(skill, 'utf-8')).toBe('custom\n');
      runMcpInstallSkill({ repo: repoRoot, overwrite: true });
      const installed = readFileSync(skill, 'utf-8');
      expect(installed).toContain('repo-harness-chatgpt-bridge');
      expect(installed).toContain("Use the user's language for status reports unless repo-local instructions require otherwise.");
      expect(installed).not.toContain('阅读：');
      expect(installed).not.toContain('开worktree完整执行');
      expect(installed).not.toContain('完成阶段性任务，要staging再继续');
    });
  });
});
