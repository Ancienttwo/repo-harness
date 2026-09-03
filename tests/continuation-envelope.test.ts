import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { spawnSync } from 'child_process';
import type { ContinuationEnvelopeV1 } from '../src/core/state/types';
import {
  PLAN,
  commitFixture,
  runStateCli,
  withRepo,
  writeFixture as write,
} from './state/effective-state-fixture';
import { fixtureTaskId } from './helpers/sprint-fixture';

const SPRINT = 'plans/sprints/20260803-fixture.sprint.md';
const SPRINT_MARKER = '.ai/harness/sprint/active-sprint';

function sprintFile(status: string, rows: readonly string[]): string {
  return [
    '# Sprint: Continuation Fixture',
    '',
    `> **Status**: ${status}`,
    '> **Slug**: continuation-fixture',
    '> **Backlog Schema**: 2',
    '',
    '## Backlog',
    '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    ...rows,
    '',
    '## Execution Log',
    '',
  ].join('\n');
}

const PENDING_SPRINT = sprintFile('Approved', [
  `| 1 | ${fixtureTaskId('first work package')} | [x] | first work package | contract | done | \`plans/archive/plan-first.md\` |`,
  `| 2 | ${fixtureTaskId('second work package')} | [ ] | second work package | contract | pending | (pending) |`,
]);
const FINISHED_SPRINT = sprintFile('Approved', [
  `| 1 | ${fixtureTaskId('first work package')} | [x] | first work package | contract | done | \`plans/archive/plan-first.md\` |`,
  `| 2 | ${fixtureTaskId('second work package')} | [x] | second work package | contract | done | \`plans/archive/plan-second.md\` |`,
]);

function dropActivePlan(cwd: string): void {
  rmSync(join(cwd, '.ai/harness/active-plan'), { force: true });
}

function useSprint(cwd: string, text: string): void {
  write(cwd, SPRINT, text);
  write(cwd, SPRINT_MARKER, `${SPRINT}\n`);
}

function planWithTasks(cwd: string, status: string, tasks: readonly string[]): void {
  const current = readFileSync(join(cwd, PLAN), 'utf-8');
  write(cwd, PLAN, current
    .replace(/^> \*\*Status\*\*: .*$/m, `> **Status**: ${status}`)
    .replace(/^- \[[ xX]\] .*$/gm, '')
    .replace(/^## Task Breakdown$/m, ['## Task Breakdown', ...tasks].join('\n')));
}

function envelopeFrom(cwd: string): ContinuationEnvelopeV1 {
  const run = runStateCli(cwd, ['state', 'next', '--json']);
  expect(run.stderr).toBe('');
  expect(run.status).toBe(0);
  return JSON.parse(run.stdout) as ContinuationEnvelopeV1;
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
        entries.push(`d ${relative(root, full)}`);
        walk(full);
        continue;
      }
      entries.push(`f ${relative(root, full)} ${createHash('sha256').update(readFileSync(full)).digest('hex')}`);
    }
  };
  walk(root);
  return entries.join('\n');
}

describe('continuation envelope routes', () => {
  const cases = [
    {
      name: 'continue_active_plan when the active plan still has an open task',
      setup: (cwd: string) => {
        planWithTasks(cwd, 'Executing', ['- [x] first task', '- [ ] implement resolver']);
        commitFixture(cwd, 'open task');
      },
      expected: {
        route: 'continue_active_plan',
        unit_ref: PLAN,
        command: 'repo-harness state resolve --json',
        reason: 'next_action:implement resolver',
      },
    },
    {
      name: 'verify_or_finish when every plan task is checked off',
      setup: (cwd: string) => {
        planWithTasks(cwd, 'Executing', ['- [x] first task', '- [x] implement resolver']);
        commitFixture(cwd, 'closed tasks');
      },
      expected: {
        route: 'verify_or_finish',
        unit_ref: PLAN,
        command: 'repo-harness run verify-sprint',
        reason: 'complete_approved_work_package',
      },
    },
    {
      name: 'halt on a hard blocker, carrying the existing blocker vocabulary',
      setup: (cwd: string) => write(cwd, '.ai/harness/active-worktree', '/tmp/foreign-worktree\n'),
      expected: {
        route: 'halt',
        unit_ref: null,
        command: null,
        reason: 'blockers:conflict:worktree_owner',
      },
    },
    {
      name: 'halt on a plan that is not approved for execution',
      setup: (cwd: string) => {
        planWithTasks(cwd, 'Draft', ['- [ ] implement resolver']);
        commitFixture(cwd, 'draft plan');
      },
      expected: {
        route: 'halt',
        unit_ref: PLAN,
        command: null,
        reason: 'plan_status:draft',
      },
    },
    {
      name: 'advance_sprint when no plan is active and a backlog row is pending',
      setup: (cwd: string) => {
        dropActivePlan(cwd);
        useSprint(cwd, PENDING_SPRINT);
        commitFixture(cwd, 'pending sprint');
      },
      expected: {
        route: 'advance_sprint',
        unit_ref: SPRINT,
        command: "repo-harness run sprint-backlog start-task --task 'second work package' --execute",
        reason: 'sprint_backlog:pending',
      },
    },
    {
      name: 'complete when the active sprint has no pending row left',
      setup: (cwd: string) => {
        dropActivePlan(cwd);
        useSprint(cwd, FINISHED_SPRINT);
        commitFixture(cwd, 'finished sprint');
      },
      expected: {
        route: 'complete',
        unit_ref: SPRINT,
        command: null,
        reason: 'sprint_backlog:complete',
      },
    },
    {
      name: 'idle when neither a plan nor a sprint is active',
      setup: (cwd: string) => {
        dropActivePlan(cwd);
        commitFixture(cwd, 'no active work');
      },
      expected: {
        route: 'idle',
        unit_ref: null,
        command: null,
        reason: 'no_active_plan_or_sprint',
      },
    },
  ] as const;

  for (const scenario of cases) {
    test(scenario.name, () => {
      withRepo((cwd) => {
        scenario.setup(cwd);
        const envelope = envelopeFrom(cwd);
        expect(envelope).toEqual({
          protocol: 1,
          kind: 'repo-harness-continuation-envelope',
          route: scenario.expected.route,
          unit_ref: scenario.expected.unit_ref,
          authority_revision: envelope.authority_revision,
          progress_token: envelope.progress_token,
          command: scenario.expected.command,
          reason: scenario.expected.reason,
        });
        expect(envelope.authority_revision).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(envelope.progress_token).toMatch(/^sha256:[0-9a-f]{64}$/);
      });
    }, 30_000);
  }

  test('every route stays inside the frozen route vocabulary with one unit or one halt', () => {
    const routes = new Set(cases.map((scenario) => scenario.expected.route));
    expect([...routes].sort()).toEqual([
      'advance_sprint',
      'complete',
      'continue_active_plan',
      'halt',
      'idle',
      'verify_or_finish',
    ]);
    for (const scenario of cases) {
      const actionable = scenario.expected.command !== null;
      expect(actionable).toBe(['continue_active_plan', 'advance_sprint', 'verify_or_finish']
        .includes(scenario.expected.route));
    }
  });
});

describe('continuation envelope halts on unusable sprint authority', () => {
  const cases = [
    {
      name: 'sprint marker pointing at a missing file',
      setup: (cwd: string) => write(cwd, SPRINT_MARKER, 'plans/sprints/missing.sprint.md\n'),
      reason: 'active_sprint:stale',
      unit_ref: 'plans/sprints/missing.sprint.md',
    },
    {
      name: 'sprint that is not approved for execution',
      setup: (cwd: string) => useSprint(cwd, sprintFile('Draft', [
        `| 1 | ${fixtureTaskId('first work package')} | [ ] | first work package | contract | pending | (pending) |`,
      ])),
      reason: 'sprint_status:Draft',
      unit_ref: SPRINT,
    },
    {
      name: 'approved sprint with an empty backlog',
      setup: (cwd: string) => useSprint(cwd, sprintFile('Approved', [])),
      reason: 'sprint_backlog:empty',
      unit_ref: SPRINT,
    },
    {
      name: 'backlog row carrying an unrecognized status cell',
      setup: (cwd: string) => useSprint(cwd, sprintFile('Approved', [
        '| 1 | [~] | first work package | contract | in flight | (pending) |',
      ])),
      reason: 'sprint_backlog:unknown_row_status',
      unit_ref: SPRINT,
    },
  ] as const;

  for (const scenario of cases) {
    test(scenario.name, () => {
      withRepo((cwd) => {
        dropActivePlan(cwd);
        scenario.setup(cwd);
        commitFixture(cwd, 'sprint anomaly');
        const envelope = envelopeFrom(cwd);
        expect(envelope.route).toBe('halt');
        expect(envelope.reason).toBe(scenario.reason);
        expect(envelope.unit_ref).toBe(scenario.unit_ref);
        expect(envelope.command).toBeNull();
      });
    }, 30_000);
  }

  test('halts when the active-plan marker points at a deleted plan', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, PLAN));
      commitFixture(cwd, 'delete plan behind the marker');
      const envelope = envelopeFrom(cwd);
      expect(envelope.route).toBe('halt');
      expect(envelope.reason).toBe('stale:active_plan_marker');
      expect(envelope.command).toBeNull();
    });
  }, 30_000);
});

/**
 * The `advance_sprint` command names a free-text Task cell, so its single-quote
 * escaping is the only thing standing between an ordinary backlog row and an
 * injected argument. Proving that by inspection re-implements the shell; this
 * pin hands the published command string to a real `bash`, which tokenizes it
 * itself, and reads back the argv a real `sprint-backlog` invocation would see.
 */
describe('advance_sprint command survives an adversarial Task cell through real bash', () => {
  const COMMAND_PREFIX = 'repo-harness run sprint-backlog ';
  // Every shape that makes single-quote escaping non-trivial. Markdown table
  // cells cannot carry `|` or a newline, so those are out of the grammar's
  // reach rather than omitted; leading/trailing whitespace is trimmed by the
  // row scan, so whitespace cases keep it internal.
  const CORPUS = [
    'plain control sample',
    "embedded ' single quote",
    "already escaped '\\'' sequence",
    'spaces\tand\ttabs mixed',
    'substitution $(rm -rf /tmp/x)',
    'backticks `rm -rf /tmp/x`',
    'double "quoted" span',
    'back\\slash and \\\\ pair',
    'semicolon ; then more',
    'and && operator',
    '--leading-dash-looks-like-a-flag',
    "$(echo pwned) '; touch /tmp/pwned; '",
  ] as const;

  function argvEchoScript(): { path: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'repo-harness-argv-echo-'));
    const path = join(dir, 'argv-echo.sh');
    writeFileSync(path, "#!/bin/bash\nprintf '%s\\0' \"$@\"\n");
    chmodSync(path, 0o755);
    return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  function bashArgv(command: string, scriptPath: string): string[] {
    expect(command.startsWith(COMMAND_PREFIX)).toBe(true);
    const rewritten = `'${scriptPath}' ${command.slice(COMMAND_PREFIX.length)}`;
    const { REPO_HARNESS_NODE_BIN: _node, ...env } = process.env;
    const result = spawnSync('bash', ['-c', rewritten], { env, encoding: 'buffer' });
    expect(String(result.stderr)).toBe('');
    expect(result.status).toBe(0);
    const parts = String(result.stdout).split('\0');
    expect(parts.pop()).toBe('');
    return parts;
  }

  test('bash recovers the Task cell byte-identically with no injected token', () => {
    const echo = argvEchoScript();
    try {
      withRepo((cwd) => {
        dropActivePlan(cwd);
        for (const task of CORPUS) {
          useSprint(cwd, sprintFile('Approved', [
            `| 1 | ${fixtureTaskId(`${task}`)} | [ ] | ${task} | contract | pending | (pending) |`,
          ]));
          commitFixture(cwd, 'adversarial backlog row');
          const envelope = envelopeFrom(cwd);
          expect(envelope.route).toBe('advance_sprint');
          expect(bashArgv(envelope.command!, echo.path)).toEqual([
            'start-task',
            '--task',
            task,
            '--execute',
          ]);
        }
      });
    } finally {
      echo.cleanup();
    }
  }, 120_000);
});

describe('continuation envelope determinism and read-only contract', () => {
  test('identical repo bytes yield byte-identical stdout and exit 0 on halt', () => {
    withRepo((cwd) => {
      dropActivePlan(cwd);
      useSprint(cwd, PENDING_SPRINT);
      commitFixture(cwd, 'pending sprint');

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
      expect((JSON.parse(halted.stdout) as ContinuationEnvelopeV1).route).toBe('halt');
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

  test('performs no writes: repo tree, .ai/harness, and the state cache are untouched', () => {
    withRepo((cwd) => {
      dropActivePlan(cwd);
      useSprint(cwd, PENDING_SPRINT);
      commitFixture(cwd, 'pending sprint');

      const before = treeFingerprint(cwd);
      const beforeStatus = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' }).stdout;
      const run = runStateCli(cwd, ['state', 'next', '--json']);

      expect(run.status).toBe(0);
      expect(treeFingerprint(cwd)).toBe(before);
      expect(spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' }).stdout).toBe(beforeStatus);
      expect(existsSync(join(cwd, '.ai/harness/state/effective.json'))).toBe(false);
    });
  }, 30_000);
});
