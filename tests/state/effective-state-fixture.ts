import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn, spawnSync } from 'child_process';
import {
  resolveEffectiveState,
} from '../../src/effects/state/resolve-effective-state';
import type { EffectiveState, EffectiveStateRiskInput } from '../../src/core/state/types';

export const ROOT = join(import.meta.dir, '../..');
export const CLI = join(ROOT, 'src/cli/index.ts');
export const HOOK_ENTRY = join(ROOT, 'src/cli/hook-entry.ts');
export const PLAN = 'plans/plan-20260712-2327-effective-fixture.md';
export const CONTRACT = 'tasks/contracts/20260712-2327-effective-fixture.contract.md';
const REVIEW = 'tasks/reviews/20260712-2327-effective-fixture.review.md';
const FIXTURE_GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
};

interface EffectiveStateFixture {
  readonly cwd: string;
  cleanup(): void;
}

interface EffectiveStateFixtureOptions {
  readonly currentUpdatedAt?: string;
  readonly includeLegacyActivePlan?: boolean;
}

interface EffectiveStateScenario {
  readonly name: string;
  readonly risk: EffectiveStateRiskInput;
  readonly setup?: (cwd: string, nowMs: number) => void;
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
    for (const path of ['plans', 'tasks/contracts', 'tasks/reviews', '.ai/harness/handoff']) {
      mkdirSync(join(cwd, path), { recursive: true });
    }
    writeFixture(cwd, '.ai/harness/active-plan', `${PLAN}\n`);
    if (options.includeLegacyActivePlan) {
      writeFixture(cwd, '.claude/.active-plan', `${PLAN}\n`);
    }
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

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function gitHead(cwd: string): string {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function makeFreshEvidence(cwd: string, nowMs: number): void {
  const risk = { targetPaths: ['src/feature.ts'], operationKind: 'feature' } as const;
  const initial = resolveEffectiveState(cwd, nowMs, risk);
  const subject = initial.source_hashes.review_subject;
  if (!subject) throw new Error('fixture review subject is unavailable');
  const target = gitHead(cwd);
  writeFixture(cwd, REVIEW, [
    '# Review',
    '> **Recommendation**: pass',
    `> **Reviewed Subject SHA256**: ${subject}`,
    `> **Reviewed Target Revision**: ${target}`,
    '## External Acceptance Advice',
    '> **External Acceptance**: pass',
    `> **Reviewed Subject SHA256**: ${subject}`,
    `> **Reviewed Target Revision**: ${target}`,
    '',
  ].join('\n'));
  const reviewed = resolveEffectiveState(cwd, nowMs, risk);
  const authorityRevision = reviewed.source_hashes.authority_revision;
  const handoff = [
    '# Handoff',
    '> **Task ID**: 20260712-2327-effective-fixture',
    `> **Source State Revision**: ${authorityRevision}`,
    '- Exact Next Step: implement resolver',
    '',
  ].join('\n');
  writeFixture(cwd, '.ai/harness/checks/latest.json', JSON.stringify({
    status: 'pass',
    active_plan: PLAN,
    review_subject_sha256: subject,
    acceptance_receipt: {
      status: 'pass',
      disposition: 'external_pass',
    },
  }));
  writeFixture(cwd, '.ai/harness/handoff/current.md', handoff);
  writeFixture(cwd, '.ai/harness/handoff/resume.md', [
    '# Resume',
    '> **Task ID**: 20260712-2327-effective-fixture',
    `> **Source State Revision**: ${authorityRevision}`,
    `> **Handoff Hash**: ${sha256(handoff)}`,
    '',
  ].join('\n'));
}

export const EFFECTIVE_STATE_SCENARIOS: readonly EffectiveStateScenario[] = [
  {
    name: 'idle-inspect',
    risk: { targetPaths: [], operationKind: 'inspect' },
    setup: (cwd) => {
      rmSync(join(cwd, '.ai/harness/active-plan'), { force: true });
      rmSync(join(cwd, '.claude/.active-plan'), { force: true });
    },
  },
  {
    name: 'executing-fresh-evidence',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: makeFreshEvidence,
  },
  {
    name: 'missing-contract',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: (cwd) => rmSync(join(cwd, CONTRACT)),
  },
  {
    name: 'foreign-worktree-owner',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: (cwd) => writeFixture(cwd, '.ai/harness/active-worktree', '/tmp/foreign-worktree\n'),
  },
  {
    name: 'stale-projections',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: (cwd) => {
      writeFixture(cwd, '.ai/harness/checks/latest.json', JSON.stringify({
        status: 'pass',
        active_plan: 'plans/plan-old.md',
      }));
      writeFixture(cwd, '.ai/harness/handoff/current.md', '- Active Plan: plans/plan-old.md\n');
      writeFixture(cwd, 'tasks/current.md', [
        '> **Updated At**: 2020-01-01T00:00:00Z',
        '- Active Plan: plans/plan-old.md',
      ].join('\n'));
      writeFixture(cwd, '.ai/harness/sprint/active-sprint', 'plans/sprints/missing.sprint.md\n');
    },
  },
  {
    name: 'invalid-capability-registry',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'edit' },
    setup: (cwd) => {
      writeFixture(cwd, '.ai/context/capabilities.json', '{not json');
      commitFixture(cwd, 'seed invalid capability registry');
    },
  },
  {
    name: 'profile-below-strict-floor',
    risk: { targetPaths: ['src/security/auth.ts'], operationKind: 'security' },
  },
  {
    name: 'deleted-cache-reconstruction',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: (cwd, nowMs) => {
      resolveEffectiveState(cwd, nowMs, { targetPaths: ['src/feature.ts'], operationKind: 'feature' });
      rmSync(join(cwd, '.ai/harness/state/effective.json'));
    },
  },
  {
    name: 'corrupt-cache-reconstruction',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: (cwd, nowMs) => {
      resolveEffectiveState(cwd, nowMs, { targetPaths: ['src/feature.ts'], operationKind: 'feature' });
      writeFixture(cwd, '.ai/harness/state/effective.json', '{broken');
    },
  },
  {
    name: 'stale-dead-lock-reclaimed',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: (cwd, nowMs) => writeFixtureStateLock(cwd, {
      pid: 99999999,
      created_at: nowMs - 60_000,
      token: '99999999-0-00000000-0000-4000-8000-000000000003',
    }),
  },
  {
    name: 'live-lock-waits-for-release',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    setup: (cwd, nowMs) => {
      const { lockPath, ownerPath } = writeFixtureStateLock(cwd, {
        pid: process.pid,
        created_at: nowMs,
        token: 'live',
      });
      const release = spawn('sh', ['-c', 'sleep 0.1; rm -f "$1"; rmdir "$2"', 'release-lock', ownerPath, lockPath], {
        cwd,
        stdio: 'ignore',
      });
      release.unref();
    },
  },
  {
    name: 'explicit-strict-without-path-signals',
    risk: { explicitOverride: 'strict' },
    setup: (cwd) => replaceContractProfile(cwd, 'strict'),
  },
];

export function effectiveStateCliRiskArgs(risk: EffectiveStateRiskInput): string[] {
  return [
    ...(risk.targetPaths?.length ? ['--target-path', ...risk.targetPaths] : []),
    ...(risk.operationKind ? ['--operation', risk.operationKind] : []),
    ...(risk.explicitOverride ? ['--profile', risk.explicitOverride] : []),
  ];
}
