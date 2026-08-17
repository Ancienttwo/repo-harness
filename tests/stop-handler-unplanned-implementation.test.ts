import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import type { EffectiveState } from '../src/core/state/types';
import { runStopHandler } from '../src/cli/hook/stop-handler';

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) rmSync(fixtures.pop()!, { recursive: true, force: true });
});

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

/** A git repo the drift changed-set can anchor to, with `.ai/harness` ignored. */
function gitFixture(): string {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-unplanned-')));
  fixtures.push(cwd);
  mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
  writeFileSync(join(cwd, '.ai/harness/policy.json'), '{}\n');
  git(cwd, ['init', '-b', 'main']);
  git(cwd, ['config', 'user.email', 'unplanned@example.com']);
  git(cwd, ['config', 'user.name', 'Unplanned Test']);
  writeFileSync(join(cwd, '.gitignore'), '.ai/harness/\n');
  writeFileSync(join(cwd, 'README.md'), '# fixture\n');
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-m', 'seed']);
  return cwd;
}

function canonicalState(): EffectiveState {
  return {
    workflow_profile: 'standard',
    review: { path: null, freshness: 'missing', recommendation: null, recorded_subject_sha256: null, recorded_target_revision: null },
    readiness: {
      ok: true,
      allowedToEdit: { decision: 'allow' },
      allowedToStop: { decision: 'allow' },
      readyToShip: { decision: 'allow' },
    },
    blockers: [],
  } as unknown as EffectiveState;
}

function collector(cwd: string, activePlan: string | null = null) {
  return {
    getRepoRoot: () => cwd,
    getWorktreeOwnership: () => ({ owner: null, ownedByCurrent: false }),
    getActivePlanMarker: () => activePlan,
    getStopEffectiveState: () => canonicalState(),
  };
}

const EVIDENCE = '.ai/harness/runs/unplanned-implementation.jsonl';

/** Written with plain fs, not an Edit/Write tool call -- the exact shape PlanStatusGuard cannot see. */
function shellWrite(cwd: string, relative: string, body: string): void {
  mkdirSync(join(cwd, relative.split('/').slice(0, -1).join('/') || '.'), { recursive: true });
  writeFileSync(join(cwd, relative), body);
}

describe('Stop advisory for implementation changes with no active plan', () => {
  test('fires and records evidence when implementation paths changed with no active plan', () => {
    const cwd = gitFixture();
    shellWrite(cwd, 'src/thing.ts', 'export const thing = 1;\n');

    const result = runStopHandler({ collector: collector(cwd) });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('[PlanStatusGuard] 1 implementation path(s) changed with no active plan');
    expect(result.stderr).toContain('src/thing.ts');
    expect(result.stderr).toContain('capture-plan');

    const records = readFileSync(join(cwd, EVIDENCE), 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
    expect(records).toHaveLength(1);
    expect(records[0].path_count).toBe(1);
    expect(records[0].paths).toContain('src/thing.ts');
    expect(typeof records[0].observed_at).toBe('string');
  });

  test('stays silent when an active plan covers the session', () => {
    const cwd = gitFixture();
    shellWrite(cwd, 'src/thing.ts', 'export const thing = 1;\n');

    const result = runStopHandler({
      collector: collector(cwd, 'plans/plan-20260818-0450-unplanned-implementation-advice.md'),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('[PlanStatusGuard]');
    expect(existsSync(join(cwd, EVIDENCE))).toBe(false);
  });

  test('stays silent when only workflow-surface paths changed', () => {
    const cwd = gitFixture();
    shellWrite(cwd, 'docs/note.md', '# note\n');
    shellWrite(cwd, 'tasks/todos.md', '# todos\n');

    const result = runStopHandler({ collector: collector(cwd) });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('[PlanStatusGuard]');
    expect(existsSync(join(cwd, EVIDENCE))).toBe(false);
  });

  test('stays silent on a clean tree', () => {
    const cwd = gitFixture();

    const result = runStopHandler({ collector: collector(cwd) });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('[PlanStatusGuard]');
    expect(existsSync(join(cwd, EVIDENCE))).toBe(false);
  });
});
