import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import {
  resolveEffectiveState,
} from '../../src/effects/state/resolve-effective-state';
import type { EffectiveState, EffectiveStateRiskInput } from '../../src/core/state/types';

export const ROOT = join(import.meta.dir, '../..');
export const CLI = join(ROOT, 'src/cli/index.ts');
export const HOOK_ENTRY = join(ROOT, 'src/cli/hook-entry.ts');
export const PLAN = 'plans/plan-20260712-2327-effective-fixture.md';
export const CONTRACT = 'tasks/contracts/20260712-2327-effective-fixture.contract.md';
export const REVIEW = 'tasks/reviews/20260712-2327-effective-fixture.review.md';
const FIXTURE_GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
};

export interface EffectiveStateFixture {
  readonly cwd: string;
  cleanup(): void;
}

export interface EffectiveStateFixtureOptions {
  readonly currentUpdatedAt?: string;
}

export function writeFixture(cwd: string, path: string, content: string): void {
  mkdirSync(join(cwd, path, '..'), { recursive: true });
  writeFileSync(join(cwd, path), content);
}

export function writeFixtureStateLock(
  cwd: string,
  record: { readonly pid: number; readonly created_at: number; readonly token: string },
  raw?: string,
): { readonly lockPath: string; readonly ownerPath: string } {
  const lockPath = join(cwd, '.ai/harness/state/effective.lock');
  const ownerPath = join(lockPath, `${record.token}.json`);
  mkdirSync(lockPath, { recursive: true });
  writeFileSync(ownerPath, raw ?? `${JSON.stringify(record)}\n`);
  return { lockPath, ownerPath };
}

// Commit fixture writes that would otherwise be observed as implementation
// target paths by the resolver's Git review-subject scan.
export function commitFixture(cwd: string, message: string): void {
  for (const args of [['add', '.'], ['commit', '-m', message]]) {
    const git = spawnSync('git', args, { cwd, encoding: 'utf-8', env: FIXTURE_GIT_ENV });
    if (git.status !== 0) throw new Error(git.stderr);
  }
}

export function createEffectiveStateFixture(
  options: EffectiveStateFixtureOptions = {},
): EffectiveStateFixture {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-effective-')));
  try {
    for (const path of ['plans', 'tasks/contracts', 'tasks/reviews', '.ai/harness/handoff', '.claude']) {
      mkdirSync(join(cwd, path), { recursive: true });
    }
    writeFixture(cwd, '.ai/harness/active-plan', `${PLAN}\n`);
    writeFixture(cwd, '.claude/.active-plan', `${PLAN}\n`);
    writeFixture(cwd, '.ai/harness/active-worktree', `${cwd}\n`);
    writeFixture(cwd, PLAN, [
    '# Plan: Effective Fixture',
    '',
    '> **Status**: Executing',
    `> **Task Contract**: \`${CONTRACT}\``,
    '',
    '## Task Breakdown',
    '- [x] first task',
    '- [ ] implement resolver',
    '',
    '## Evidence Contract',
    '- **State/progress path**: plan',
    '- **Verification evidence**: tests',
    '- **Evaluator rubric**: review',
    '- **Stop condition**: pass',
    '- **Rollback surface**: revert',
    '',
    ].join('\n'));
    writeFixture(cwd, CONTRACT, [
    '# Task Contract: effective-fixture',
    '',
    '> **Status**: Active',
    `> **Plan**: ${PLAN}`,
    '> **Task Profile**: code-change',
    '> **Workflow Profile**: standard',
    `> **Review File**: \`${REVIEW}\``,
    '',
    '## Allowed Paths',
    '',
    '```yaml',
    'allowed_paths:',
    '  - src/',
    '  - tests/effective-state.test.ts',
    '```',
    '',
    ].join('\n'));
    writeFixture(cwd, REVIEW, [
    '# Review',
    '> **Recommendation**: fail',
    '> **Reviewed Subject SHA256**: pending',
    '## External Acceptance Advice',
    '> **External Acceptance**: unavailable',
    '',
    ].join('\n'));
    writeFixture(cwd, '.ai/harness/checks/latest.json', JSON.stringify({
      status: 'fail',
      active_plan: PLAN,
    }));
    writeFixture(cwd, 'tasks/current.md', [
      '# Current',
      `> **Updated At**: ${options.currentUpdatedAt ?? '2099-01-01T00:00:00.000Z'}`,
      `- Active Plan: ${PLAN}`,
      '',
    ].join('\n'));
    writeFixture(cwd, '.gitignore', [
      '.ai/harness/state/',
      '.ai/harness/checks/',
      '.ai/harness/handoff/',
      '.ai/harness/active-worktree',
      '',
    ].join('\n'));
    for (const args of [
      ['init', '-b', 'main'],
      ['config', 'user.email', 'fixture@example.com'],
      ['config', 'user.name', 'Fixture'],
      ['add', '.'],
      ['commit', '-m', 'fixture'],
    ]) {
      const git = spawnSync('git', args, { cwd, encoding: 'utf-8', env: FIXTURE_GIT_ENV });
      if (git.status !== 0) throw new Error(git.stderr);
    }
    return {
      cwd,
      cleanup: () => rmSync(cwd, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(cwd, { recursive: true, force: true });
    throw error;
  }
}

export function withRepo(fn: (cwd: string) => void): void {
  const fixture = createEffectiveStateFixture();
  try {
    fn(fixture.cwd);
  } finally {
    fixture.cleanup();
  }
}

export function runStateCli(
  cwd: string,
  args: readonly string[],
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf-8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function runCli(cwd: string): { status: number | null; state: EffectiveState; stderr: string } {
  const result = runStateCli(cwd, ['state', 'resolve', '--json']);
  return {
    status: result.status,
    state: JSON.parse(result.stdout) as EffectiveState,
    stderr: result.stderr,
  };
}

export function resolveFixtureState(
  cwd: string,
  nowMs = Date.now(),
  risk: EffectiveStateRiskInput = {
    targetPaths: ['src/feature.ts'],
    operationKind: 'feature',
  },
): EffectiveState {
  return resolveEffectiveState(cwd, nowMs, risk);
}

export function replaceContractProfile(cwd: string, profile: string): void {
  const current = readFileSync(join(cwd, CONTRACT), 'utf-8');
  writeFixture(cwd, CONTRACT, current.replace(
    /^> \*\*Workflow Profile\*\*: .*$/m,
    `> **Workflow Profile**: ${profile}`,
  ));
}
