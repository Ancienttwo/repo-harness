import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { spawnSync } from 'child_process';

const ROOT = resolve(import.meta.dir, '../..');
const CLI = resolve(ROOT, 'src/cli/index.ts');

function run(args: readonly string[], env: NodeJS.ProcessEnv): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  return spawnSync('bun', [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  }) as unknown as { readonly status: number | null; readonly stdout: string; readonly stderr: string };
}

describe('fleet board CLI transport', () => {
  test('renders a deterministic JSON board for an empty registry without creating registry authority', () => {
    const root = mkdtempSync(join(tmpdir(), 'fleet-board-cli-'));
    const home = join(root, 'home');
    try {
      const result = run(['fleet', 'board', '--json'], { REPO_HARNESS_HOME: home });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toBe('');
      const document = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(document).toMatchObject({
        protocol: 6,
        kind: 'fleet_board_snapshot',
        sequence: 1,
        repositories: [],
        counts: { available: 0, working: 0, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0, preparation: 0, alternate_workflow: 0, isolated_execution: 0, known_tasks: 0, unclassified: 0 },
      });
      expect(document.snapshot_sha256).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(existsSync(home)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('board and watch accept explicit association JSON and reject authority-root injection', () => {
    const root = mkdtempSync(join(tmpdir(), 'fleet-board-cli-admission-'));
    try {
      const path = join(root, 'admissions.json'), env = { REPO_HARNESS_HOME: join(root, 'home') };
      writeFileSync(path, '[]');
      expect(run(['fleet', 'board', '--json', '--admission-associations', path], env).status).toBe(0);
      writeFileSync(path, JSON.stringify([{ repository_id: 'unknown', provider_repository_id: '1001', provider_issue_id: '2001',
        admission: { campaign_id: 'review', grant_sha256: `sha256:${'a'.repeat(64)}`, policy_sha256: `sha256:${'b'.repeat(64)}`, actor_id: 'owner', authorityHome: root } }]));
      for (const command of [['board', '--json'], ['watch', '--format', 'jsonl']]) {
        const result = run(['fleet', ...command, '--admission-associations', path], env);
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('fleet_board_argument_invalid');
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('accepts only JSON board and JSONL watch render contracts', () => {
    const root = mkdtempSync(join(tmpdir(), 'fleet-board-cli-args-'));
    try {
      const env = { REPO_HARNESS_HOME: join(root, 'home') };
      const missingJson = run(['fleet', 'board'], env);
      expect(missingJson.status).not.toBe(0);
      const wrongFormat = run(['fleet', 'watch', '--format', 'json'], env);
      expect(wrongFormat.status).toBe(2);
      expect(wrongFormat.stdout).toBe('');
      expect(wrongFormat.stderr).toContain('fleet_board_argument_invalid');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
