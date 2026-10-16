import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(import.meta.dir, '..', '..', 'scripts', 'evidence-gc.ts');
const STATE = '.ai/harness/state/circuit-breaker.json';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'evidence-gc-')));
  roots.push(root);
  mkdirSync(join(root, '.ai/harness/runs'), { recursive: true });
  mkdirSync(join(root, '.ai/harness/state'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/policy.json'), '{}\n');
  return root;
}

function gc(root: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, '--repo', root, '--format', 'json', ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: join(root, 'home') },
  });
  return { status: result.status, report: result.stdout ? JSON.parse(result.stdout) : null, stderr: result.stderr };
}

function entry(token: string) {
  return { progress_token: token, blocker_key: 'b', count: 1, render_key: 'r', recent_blockers: ['b'], last_pattern: 'initial' };
}

function writeState(root: string, state: unknown): string {
  const text = `${JSON.stringify(state, null, 2)}\n`;
  writeFileSync(join(root, STATE), text);
  return text;
}

describe('evidence-gc one-release cleanups', () => {
  test('deletes the retired run summaries and leaves acceptance snapshots', () => {
    const root = fixture();
    writeFileSync(join(root, '.ai/harness/runs/run-20260901T000000-1.json'), JSON.stringify({
      run_id: 'run-20260901T000000-1',
      handoff_file: '.ai/harness/handoff/current.md',
      policy_file: '.ai/harness/policy.json',
      context_map_file: '.ai/context/context-map.json',
    }));
    writeFileSync(join(root, '.ai/harness/runs/run-20260829T025442-29360-board.json'), JSON.stringify({
      schema: 'repo-harness-run-trace.v1', run_id: 'run-20260829T025442-29360', run_file: '.ai/harness/runs/run-20260829T025442-29360-board.json',
    }));

    const result = gc(root);

    expect(result.status, result.stderr).toBe(0);
    expect(result.report.run_summaries).toMatchObject({ scanned: 1, foreign: 1, removed: 1 });
    expect(readdirSync(join(root, '.ai/harness/runs'))).toEqual(['run-20260829T025442-29360-board.json']);
  });

  test('removes retired circuit kinds and keeps the live ones', () => {
    const root = fixture();
    writeState(root, {
      protocol: 2,
      entries: { guard: entry('g'), repair: entry('r'), 'minimal-change': entry('m'), 'semantic-review': entry('s') },
      updated_at: '2026-10-01T00:00:00.000Z',
    });

    const result = gc(root);

    expect(result.status, result.stderr).toBe(0);
    expect(result.report.circuit_breaker).toEqual({ action: 'removed-retired-kinds', removed_kinds: ['guard', 'minimal-change', 'repair'] });
    const state = JSON.parse(readFileSync(join(root, STATE), 'utf8'));
    expect(state).toEqual({
      protocol: 2,
      entries: { 'semantic-review': entry('s') },
      updated_at: '2026-10-01T00:00:00.000Z',
    });
    expect(readdirSync(join(root, '.ai/harness/state')).filter((name) => name.includes('.tmp-'))).toEqual([]);
  });

  test('a dry run reports the circuit cleanup and changes nothing', () => {
    const root = fixture();
    const before = writeState(root, { protocol: 2, entries: { review: entry('v') }, updated_at: '2026-10-01T00:00:00.000Z' });

    const result = gc(root, '--dry-run');

    expect(result.status, result.stderr).toBe(0);
    expect(result.report.circuit_breaker).toEqual({ action: 'removed-retired-kinds', removed_kinds: ['review'] });
    expect(readFileSync(join(root, STATE), 'utf8')).toBe(before);
  });

  test('deletes a protocol-1 circuit state file', () => {
    const root = fixture();
    writeState(root, { protocol: 1, entries: { ['a'.repeat(64)]: { count: 1, token: 't' } }, updated_at: '2026-01-01T00:00:00.000Z' });

    const result = gc(root);

    expect(result.status, result.stderr).toBe(0);
    expect(result.report.circuit_breaker).toEqual({ action: 'deleted-protocol-1', removed_kinds: [] });
    expect(existsSync(join(root, STATE))).toBe(false);
  });

  test('an unknown circuit kind fails the cleanup and leaves the file unchanged', () => {
    const root = fixture();
    const before = writeState(root, { protocol: 2, entries: { guard: entry('g'), mystery: entry('x') }, updated_at: '2026-10-01T00:00:00.000Z' });

    const result = gc(root);

    expect(result.status).toBe(1);
    expect(result.report.circuit_breaker).toBeNull();
    expect(result.report.errors.join('\n')).toContain('unknown circuit kind: mystery');
    expect(readFileSync(join(root, STATE), 'utf8')).toBe(before);
  });

  test('a repository with no retired state reports nothing to clean', () => {
    const root = fixture();
    const result = gc(root);
    expect(result.status, result.stderr).toBe(0);
    expect(result.report.circuit_breaker).toEqual({ action: 'none', removed_kinds: [] });
    expect(existsSync(join(root, STATE))).toBe(false);
  });
});
