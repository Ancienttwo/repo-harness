import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { join } from 'path';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');

function runMcp(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync('bun', [CLI, 'mcp', ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

describe('mcp command', () => {
  test('prints help for command group and subcommands', () => {
    const root = runMcp(['--help']);
    expect(root.status).toBe(0);
    expect(root.stdout).toContain('Run and configure the repo-harness MCP workflow sidecar');
    expect(root.stdout).toContain('serve');
    expect(root.stdout).toContain('doctor');
    expect(root.stdout).toContain('access');

    const serve = runMcp(['serve', '--help']);
    expect(serve.status).toBe(0);
    expect(serve.stdout).toContain('--profile <profile>');
    expect(serve.stdout).toContain('planner|executor');
    expect(serve.stdout).toContain('--enable-reader');
    expect(serve.stdout).toContain('--allow-root <path>');

    const doctor = runMcp(['doctor', '--help']);
    expect(doctor.status).toBe(0);
    expect(doctor.stdout).toContain('Check repo-harness MCP setup status');
  }, 30_000);

  test('rejects invalid subcommands with a useful error', () => {
    const result = runMcp(['missing']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown command 'missing'");
  }, 30_000);
});
