import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'fs';
import { join, relative } from 'path';
import { spawnSync } from 'child_process';
import type { ContinuationEnvelopeV2 } from '../src/core/state/types';
import { stateVersionOwnerPath } from '../src/effects/state/git-state-version-store';
import {
  PLAN,
  runStateCli,
  withRepo,
  writeFixture as write,
} from './state/effective-state-fixture';

const SPRINT = 'plans/sprints/20260803-fixture.sprint.md';
const SPRINT_MARKER = '.ai/harness/sprint/active-sprint';

const ISSUE_BRANCH = 'feat/1234-fixture';
const ISSUE_NEXT_ACTION = `Continue GitHub issue #1234 on branch ${ISSUE_BRANCH}.`;

/** The only next-unit source: a canonical <type>/<digits>-<slug> branch. */
function branchWithIssue(cwd: string, branch = ISSUE_BRANCH): void {
  const result = spawnSync('git', ['checkout', '-q', '-b', branch], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function envelopeFrom(cwd: string): ContinuationEnvelopeV2 {
  const run = runStateCli(cwd, ['state', 'next', '--json']);
  expect(run.stderr).toBe('');
  expect(run.status).toBe(0);
  return JSON.parse(run.stdout) as ContinuationEnvelopeV2;
}

function treeFingerprint(root: string): string {
  const entries: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    ))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (relative(root, full) === '.git') continue;
        entries.push('d ' + relative(root, full));
        walk(full);
        continue;
      }
      entries.push('f ' + relative(root, full) + ' ' + createHash('sha256').update(readFileSync(full)).digest('hex'));
    }
  };
  walk(root);
  return entries.join('\n');
}

describe('continuation envelope routes', () => {
  const cases = [
    {
      name: 'continue when the branch names one issue',
      setup: (cwd: string) => branchWithIssue(cwd),
      expected: {
        route: 'continue',
        command: 'repo-harness state resolve --json',
        reason: `next_action:${ISSUE_NEXT_ACTION}`,
      },
    },
    {
      name: 'halt on a hard blocker, carrying the existing blocker vocabulary',
      setup: (cwd: string) => write(cwd, '.ai/harness/active-worktree', '/tmp/foreign-worktree\n'),
      expected: {
        route: 'halt',
        command: null,
        reason: 'blockers:conflict:worktree_owner',
      },
    },
    {
      name: 'idle when the branch names no issue',
      setup: () => undefined,
      expected: {
        route: 'idle',
        command: null,
        reason: 'no_next_action',
      },
    },
    {
      name: 'idle when a retired sprint and active plan exist but the branch names no issue',
      setup: (cwd: string) => {
        write(cwd, SPRINT, '# Sprint: Fixture\n\n> **Status**: Approved\n');
        write(cwd, SPRINT_MARKER, SPRINT + '\n');
      },
      expected: {
        route: 'idle',
        command: null,
        reason: 'no_next_action',
      },
    },
  ] as const;

  for (const scenario of cases) {
    test(scenario.name, () => {
      withRepo((cwd) => {
        scenario.setup(cwd);
        const envelope = envelopeFrom(cwd);
        expect(envelope).toEqual({
          protocol: 2,
          kind: 'repo-harness-continuation-envelope',
          route: scenario.expected.route,
          unit_ref: envelope.unit_ref,
          authority_revision: envelope.authority_revision,
          progress_token: envelope.progress_token,
          command: scenario.expected.command,
          reason: scenario.expected.reason,
        });
        expect(envelope.authority_revision).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(envelope.progress_token).toMatch(/^sha256:[0-9a-f]{64}$/);
        if (scenario.expected.route === 'continue') {
          expect(envelope.unit_ref).toMatch(/^sha256:[0-9a-f]{64}$/);
        } else {
          expect(envelope.unit_ref).toBeNull();
        }
      });
    }, 30_000);
  }

  test('retired handoff and resume files cannot change the continue unit_ref', () => {
    withRepo(cwd => {
      branchWithIssue(cwd);
      const first = envelopeFrom(cwd);
      write(cwd, '.ai/harness/handoff/current.md', '# Handoff\n- Exact Next Step: retired\n');
      write(cwd, '.ai/harness/handoff/resume.md', '# resume changed\n');
      const second = envelopeFrom(cwd);
      expect(second.route).toBe('continue');
      expect(second.reason).toBe(`next_action:${ISSUE_NEXT_ACTION}`);
      expect(second.unit_ref).toBe(first.unit_ref);
      expect(second.progress_token).toBe(first.progress_token);
    });
  }, 30_000);

  test('an ambiguous branch form stays idle and invents no issue', () => {
    withRepo(cwd => {
      branchWithIssue(cwd, 'feature/no-issue-here');
      const envelope = envelopeFrom(cwd);
      expect(envelope.route).toBe('idle');
      expect(envelope.reason).toBe('no_next_action');
      expect(envelope.unit_ref).toBeNull();
    });
  }, 30_000);

  test('a branch without a slug stays idle', () => {
    withRepo(cwd => {
      branchWithIssue(cwd, 'feat/1234');
      const envelope = envelopeFrom(cwd);
      expect(envelope.route).toBe('idle');
      expect(envelope.reason).toBe('no_next_action');
    });
  }, 30_000);

  test('a leading-zero issue stays idle instead of naming a different number', () => {
    withRepo(cwd => {
      branchWithIssue(cwd, 'feat/01234-fixture');
      const envelope = envelopeFrom(cwd);
      expect(envelope.route).toBe('idle');
      expect(envelope.reason).toBe('no_next_action');
      expect(envelope.unit_ref).toBeNull();
    });
  }, 30_000);

  test('the output never references a plan or sprint path', () => {
    withRepo(cwd => {
      branchWithIssue(cwd);
      const output = runStateCli(cwd, ['state', 'next', '--json']).stdout;
      expect(output).not.toContain('plan');
      expect(output).not.toContain('sprint');
      expect(output).not.toContain(PLAN);
    });
  }, 30_000);

  test('every route stays inside the frozen route vocabulary with one unit or one halt', () => {
    const routes = new Set(cases.map((scenario) => scenario.expected.route));
    expect([...routes].sort()).toEqual(['continue', 'halt', 'idle']);
    for (const scenario of cases) {
      const actionable = scenario.expected.command !== null;
      expect(actionable).toBe(scenario.expected.route === 'continue');
    }
  });
});

describe('continuation envelope determinism and read-only contract', () => {
  test('identical repo bytes yield byte-identical stdout and exit 0 on halt', () => {
    withRepo((cwd) => {
      const first = runStateCli(cwd, ['state', 'next', '--json']);
      const second = runStateCli(cwd, ['state', 'next', '--json']);
      expect(first.status).toBe(0);
      expect(second.status).toBe(0);
      expect(second.stdout).toBe(first.stdout);
      expect(first.stdout.endsWith('}\n')).toBe(true);
      expect(first.stdout).not.toContain(cwd);
      expect(first.stdout).not.toMatch(/\d{4}-\d{2}-\d{2}T/);

      write(cwd, '.ai/harness/active-worktree', '/tmp/foreign-worktree\n');
      const halted = runStateCli(cwd, ['state', 'next', '--json']);
      expect(halted.status).toBe(0);
      expect((JSON.parse(halted.stdout) as ContinuationEnvelopeV2).route).toBe('halt');
    });
  }, 30_000);

  test('key order is stable and matches the declared envelope shape', () => {
    withRepo((cwd) => {
      expect(Object.keys(envelopeFrom(cwd) as unknown as Record<string, unknown>)).toEqual([
        'protocol',
        'kind',
        'route',
        'unit_ref',
        'authority_revision',
        'progress_token',
        'command',
        'reason',
      ]);
    });
  }, 30_000);

  test('performs no writes: repo tree, .ai/harness, and the version owner are untouched', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, '.ai/harness/active-plan'), { force: true });
      write(cwd, SPRINT, '# Sprint: Fixture\n\n> **Status**: Approved\n');
      write(cwd, SPRINT_MARKER, SPRINT + '\n');

      const before = treeFingerprint(cwd);
      const beforeStatus = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' }).stdout;
      const run = runStateCli(cwd, ['state', 'next', '--json']);

      expect(run.status).toBe(0);
      expect(treeFingerprint(cwd)).toBe(before);
      expect(spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' }).stdout).toBe(beforeStatus);
      expect(existsSync(stateVersionOwnerPath(cwd))).toBe(false);
    });
  }, 30_000);
});
