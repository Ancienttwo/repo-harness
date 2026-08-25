import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';

const root = process.cwd();

function cli(...args: string[]) {
  return spawnSync('bun', ['src/cli/index.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env },
  });
}

describe('delegation CLI', () => {
  test('renders only a logical Role Profile and never calls it a native agent_type', () => {
    const result = cli('delegation', 'profile', '--role', 'explorer', '--format', 'json');
    expect(result.status).toBe(0);
    const value = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(value).toMatchObject({ kind: 'repo-harness-logical-role-profile', logical_role: 'explorer', declared_sandbox_mode: 'read_only' });
    expect(value).not.toHaveProperty('agent_type');
  });

  test('exposes bounded evidence verbs and rejects an unsafe logical role', () => {
    const help = cli('delegation', '--help');
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('capability');
    expect(help.stdout).toContain('admit');
    expect(help.stdout).toContain('prepare');
    expect(help.stdout).toContain('dispatch');
    expect(help.stdout).toContain('read');
    expect(help.stdout).not.toContain('resume');
    expect(help.stdout).not.toContain('cancel');
    const readHelp = cli('delegation', 'read', '--help');
    expect(readHelp.status).toBe(0);
    expect(readHelp.stdout).toContain('process-receipt');
    expect(readHelp.stdout).toContain('run-ref');
    expect(readHelp.stdout).toContain('result');
    expect(readHelp.stdout).not.toContain('profile,');
    const invalid = cli('delegation', 'profile', '--role', '../writer', '--format', 'json');
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('delegated_run_invalid');

    const legacy = cli('delegation', 'capability', '--input', 'package.json', '--format', 'json');
    expect(legacy.status).toBe(1);
    expect(legacy.stderr).toContain('capability input fields are invalid');
  });
});
