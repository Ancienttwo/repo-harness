import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dir, '../..');
const CLI = resolve(ROOT, 'src/cli/index.ts');

function help(args: readonly string[]): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync('bun', [CLI, ...args, '--help'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  return result as unknown as { status: number | null; stdout: string; stderr: string };
}

function run(args: readonly string[]): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  return spawnSync('bun', [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  }) as unknown as { status: number | null; stdout: string; stderr: string };
}

describe('fleet task inbox CLI transport', () => {
  test('exposes JSON send/list/ack surfaces without exposing trust or raw-path options', () => {
    const send = help(['fleet', 'message', 'send']);
    expect(send.status, send.stderr).toBe(0);
    expect(send.stdout).toContain('--task-id');
    expect(send.stdout).toContain('--scope');
    expect(send.stdout).toContain('--audience');
    expect(send.stdout).toContain('--body-file');
    expect(send.stdout).toContain('--message-id');
    expect(send.stdout).not.toContain('--sender-trust');
    expect(send.stdout).not.toContain('--recipient-path');

    const list = help(['fleet', 'inbox', 'list']);
    expect(list.status, list.stderr).toBe(0);
    expect(list.stdout).toContain('--task-id');
    expect(list.stdout).not.toContain('--recipient-kind');
    expect(list.stdout).not.toContain('--recipient-id');

    const ack = help(['fleet', 'inbox', 'ack']);
    expect(ack.status, ack.stderr).toBe(0);
    expect(ack.stdout).toContain('--message-id');
    expect(ack.stdout).not.toContain('--recipient-kind');
    expect(ack.stdout).not.toContain('--recipient-id');
  });

  test('rejects caller-selected durable recipient identities', () => {
    const result = run([
      'fleet', 'inbox', 'list', '--json', '--task-id', 'a'.repeat(64),
      '--recipient-kind', 'user', '--recipient-id', 'victim',
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unknown option '--recipient-kind'");
  });
});
