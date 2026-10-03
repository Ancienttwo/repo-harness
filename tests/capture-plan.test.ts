import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const source = join(import.meta.dir, '..', 'scripts');
function fixture(run: (repo: string, invoke: (helper: string, args?: string[], body?: string) => ReturnType<typeof spawnSync>) => void) {
  const repo = mkdtempSync(join(tmpdir(), 'capture-reference-'));
  expect(spawnSync('git', ['init', '-q', repo]).status).toBe(0);
  try { run(repo, (helper, args = [], body = '') => spawnSync('bash', [join(source, helper), ...args], {
    cwd: repo, env: { ...process.env, REPO_HARNESS_TARGET_REPO_ROOT: repo }, input: body, encoding: 'utf8', timeout: 10000,
  })); } finally { rmSync(repo, { recursive: true, force: true }); }
}
describe('optional planning references', () => {
  test('capture preserves the requested text without projecting execution or approval artifacts', () => fixture((repo, invoke) => {
    const body = '## Goal\nOne change\n## Scope\nowned paths\n## Verify\ntargeted tests\n## Rollback\nrevert\n';
    expect(invoke('capture-plan.sh', ['--slug', 'bounded'], body).status).toBe(0);
    expect(readFileSync(join(repo, 'plans/bounded.md'), 'utf8')).toBe(body);
    expect(existsSync(join(repo, 'tasks'))).toBe(false);
    expect(existsSync(join(repo, '.ai/harness/active-plan'))).toBe(false);
    const readback = invoke('plan-to-todo.sh', ['--plan', 'plans/bounded.md']);
    expect(readback.status).toBe(0);
    expect(readback.stdout).toBe(body);
    expect(existsSync(join(repo, 'tasks'))).toBe(false);
  }));
  test('capture refuses existing work and retired ceremony flags without writes', () => fixture((repo, invoke) => {
    expect(invoke('capture-plan.sh', ['--slug', 'same'], 'original').status).toBe(0);
    expect(invoke('capture-plan.sh', ['--slug', 'same'], 'replacement').status).not.toBe(0);
    expect(readFileSync(join(repo, 'plans/same.md'), 'utf8')).toBe('original');
    expect(invoke('capture-plan.sh', ['--slug', 'new', '--promotion-reason', 'merge_boundary'], 'body').status).toBe(2);
    expect(existsSync(join(repo, 'plans/new.md'))).toBe(false);
  }));
  test('capture preserves user-written 3P evidence without adding template fields', () => fixture((repo, invoke) => {
    const body = '## Decision\nP1 map: scripts own the runtime.\nP2 trace: stdin becomes a plan file.\nP3 decision rationale: preserve the input text.\n';
    expect(invoke('capture-plan.sh', ['--slug', 'evidence', '--title', 'Evidence'], body).status).toBe(0);
    expect(readFileSync(join(repo, 'plans/evidence.md'), 'utf8')).toBe(`# Evidence\n\n${body}`);
  }));
  test('capture rejects traversal and symlink destinations', () => fixture((repo, invoke) => {
    expect(invoke('capture-plan.sh', ['--slug', '../outside'], 'body').status).not.toBe(0);
    mkdirSync(join(repo, 'other'));
    symlinkSync(join(repo, 'other'), join(repo, 'plans'));
    expect(invoke('capture-plan.sh', ['--slug', 'escape'], 'body').status).not.toBe(0);
    expect(existsSync(join(repo, 'other/escape.md'))).toBe(false);
  }));
  test('ensure prepares only bounded runtime recovery space and refuses unsafe ancestors', () => fixture((repo, invoke) => {
    expect(invoke('ensure-task-workflow.sh').status).toBe(0);
    expect(existsSync(join(repo, '.ai/harness/handoff'))).toBe(true);
    expect(existsSync(join(repo, 'tasks/workstreams'))).toBe(false);
    expect(existsSync(join(repo, '.claude/templates/contract.template.md'))).toBe(false);
    rmSync(join(repo, '.ai/harness'), { recursive: true });
    mkdirSync(join(repo, 'outside'));
    symlinkSync(join(repo, 'outside'), join(repo, '.ai/harness'));
    expect(invoke('ensure-task-workflow.sh').status).not.toBe(0);
    expect(existsSync(join(repo, 'outside/handoff'))).toBe(false);
  }));
});
