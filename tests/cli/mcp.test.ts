import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');

function runMcp(args: string[]) {
  return spawnSync('bun', [CLI, 'mcp', ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
  });
}

describe('mcp command', () => {
  test('prints help for command group and subcommands', () => {
    const root = runMcp(['--help']);
    expect(root.status).toBe(0);
    expect(root.stdout).toContain('Run and configure the repo-harness MCP workflow sidecar');
    expect(root.stdout).toContain('serve');
    expect(root.stdout).toContain('doctor');
    expect(root.stdout).toContain('setup');

    const serve = runMcp(['serve', '--help']);
    expect(serve.status).toBe(0);
    expect(serve.stdout).toContain('--transport <transport>');
    expect(serve.stdout).toContain('--profile <profile>');
    expect(serve.stdout).toContain('--enable-dev-runner');

    const doctor = runMcp(['doctor', '--help']);
    expect(doctor.status).toBe(0);
    expect(doctor.stdout).toContain('Check repo-harness MCP setup status');

    const setup = runMcp(['setup', '--help']);
    expect(setup.status).toBe(0);
    expect(setup.stdout).toContain('chatgpt');
    expect(setup.stdout).toContain('codex');
    expect(root.stdout).toContain('prepare-goal');
  });

  test('rejects invalid subcommands with a useful error', () => {
    const result = runMcp(['missing']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown command 'missing'");
  });

  test('prepare-goal writes Codex handoff and prints host-native /goal prompt', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-goal-'));
    try {
      mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
      mkdirSync(join(repoRoot, 'plans/prds'), { recursive: true });
      mkdirSync(join(repoRoot, 'plans/sprints'), { recursive: true });
      writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
      writeFileSync(join(repoRoot, 'plans/prds/example.prd.md'), '# Example PRD\n');
      writeFileSync(join(repoRoot, 'plans/sprints/example.sprint.md'), '# Example Sprint\n\n- [ ] Task\n');

      const result = runMcp([
        'prepare-goal',
        '--repo',
        repoRoot,
        '--prd',
        join(repoRoot, 'plans/prds/example.prd.md'),
        '--sprint',
        join(repoRoot, 'plans/sprints/example.sprint.md'),
        '--reference-repo',
        '/tmp/reference-repo',
      ]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('/goal');
      expect(result.stdout).toContain(`Read: ${join(repoRoot, 'plans/prds/example.prd.md')}`);
      expect(result.stdout).toContain(`Open or use a worktree and complete: ${join(repoRoot, 'plans/sprints/example.sprint.md')}`);
      expect(result.stdout).toContain('After each completed phase, stage the result before continuing.');
      expect(result.stdout).toContain("Use the user's language for status reports unless repo-local instructions require otherwise.");
      expect(result.stdout).not.toContain('阅读：');
      expect(result.stdout).not.toContain('开worktree完整执行');
      const goalPath = join(repoRoot, '.ai/harness/handoff/codex-goal.md');
      expect(existsSync(goalPath)).toBe(true);
      expect(readFileSync(goalPath, 'utf-8')).toContain('## Host-native /goal prompt');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
