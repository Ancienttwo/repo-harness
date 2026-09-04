import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');
function repo(): string { const root = mkdtempSync(join(tmpdir(), 'controller-cli-')); spawnSync('git', ['init', '-q'], { cwd: root }); return root; }

describe('automation controller CLI', () => {
  test('exposes the bounded start, step, status, stop and reconcile surface', () => {
    const result = spawnSync('bun', [CLI, 'automation', 'controller', '--help'], { cwd: ROOT, encoding: 'utf8' });
    expect(result.status).toBe(0);
    for (const command of ['start', 'step', 'status', 'stop', 'reconcile']) expect(result.stdout).toContain(command);
  });

  test('status list is JSON and an unknown exact run fails with a typed JSON error', () => {
    const root = repo();
    try {
      const list = spawnSync('bun', [CLI, 'automation', 'controller', 'status'], { cwd: root, encoding: 'utf8' });
      expect(list.status).toBe(0); expect(JSON.parse(list.stdout)).toEqual([]);
      const missing = spawnSync('bun', [CLI, 'automation', 'controller', 'status', '--run', `sha256:${'a'.repeat(64)}`], { cwd: root, encoding: 'utf8' });
      expect(missing.status).toBe(1); expect(JSON.parse(missing.stderr).error).toBe('automation_controller_not_found');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
