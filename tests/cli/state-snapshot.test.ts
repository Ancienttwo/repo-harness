import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import type { StateSnapshot } from '../../src/core/state/types';

const ROOT = join(import.meta.dir, '../..');
const HOOK_ENTRY = join(ROOT, 'src/cli/hook-entry.ts');

function withTempRepo(fn: (cwd: string) => void): void {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-state-')));
  try {
    mkdirSync(join(cwd, 'docs'), { recursive: true });
    mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
    writeFileSync(join(cwd, 'docs/spec.md'), '# Spec\n');
    fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function runSnapshot(cwd: string): StateSnapshot {
  const result = spawnSync(process.execPath, [HOOK_ENTRY, 'state-snapshot', '--json'], {
    cwd,
    encoding: 'utf-8',
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(Buffer.byteLength(result.stdout.trim(), 'utf8')).toBeLessThanOrEqual(1024);
  return JSON.parse(result.stdout) as StateSnapshot;
}

describe('state-snapshot hook command', () => {
  test('keeps the public read-only JSON projection bounded', () => {
    withTempRepo((cwd) => {
      expect(runSnapshot(cwd)).toEqual({
        protocol: 1,
        kind: 'repo-harness-state-snapshot',
        states: {
          spec: 'present',
          plan: 'none',
          pending: 'none',
          worktree: 'current',
          contract: 'missing',
          contract_path: 'missing',
          evidence: 'unchecked',
        },
        paths: { active_plan: null, contract: null },
        marker: { problem: 'none' },
      });
      expect(existsSync(join(cwd, '.ai/harness/active-plan'))).toBe(false);
      expect(existsSync(join(cwd, '.ai/harness/state/effective.json'))).toBe(false);
    });
  });

  test('rejects unsupported output flags', () => {
    withTempRepo((cwd) => {
      const result = spawnSync(process.execPath, [HOOK_ENTRY, 'state-snapshot', '--yaml'], {
        cwd,
        encoding: 'utf-8',
      });
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('state-snapshot --json');
    });
  });
});
