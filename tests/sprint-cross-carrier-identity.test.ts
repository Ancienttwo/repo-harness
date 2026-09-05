import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  assertCanonicalSprintTaskIdsUniqueAtCommit,
  readCanonicalSprint,
} from '../src/effects/state/coordination-canonical-source';
import { leaseDirectory } from '../src/effects/state/coordination-lease-store';
import { fixtureTaskId } from './helpers/sprint-fixture';

const ROOT = join(import.meta.dir, '..');
const CLI = join(ROOT, 'src/cli/index.ts');
const SPRINT_DIR = 'workflow/sprints';
const PRIMARY = `${SPRINT_DIR}/primary.sprint.md`;
const SIBLING = `${SPRINT_DIR}/sibling.sprint.md`;
const TASK_ID = fixtureTaskId('primary task');

const fixtures: string[] = [];

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd, encoding: 'utf8' });
}

function sprint(
  status: 'Draft' | 'Approved' | 'Executing' | 'Done' | 'Archived',
  taskId: string,
  task: string,
  extraRows: readonly string[] = [],
  rowStatus: '[ ]' | '[x]' = '[ ]',
): string {
  return [
    '# Sprint: identity fixture',
    '',
    `> **Status**: ${status}`,
    '> **Backlog Schema**: 2',
    '',
    '## PRD',
    '',
    'Identity fixtures.',
    '',
    '## Backlog',
    '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    `| 1 | ${taskId} | ${rowStatus} | ${task} | contract | identity test passes | (pending) |`,
    ...extraRows,
    '',
  ].join('\n');
}

function commit(cwd: string, message: string): void {
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '--quiet', '-m', message]);
}

function runSprint(cwd: string, args: readonly string[]) {
  return spawnSync(process.execPath, [CLI, 'sprint', ...args], { cwd, encoding: 'utf8' });
}

afterEach(() => {
  while (fixtures.length > 0) rmSync(fixtures.pop()!, { recursive: true, force: true });
});

describe('cross-carrier task identity', () => {
  test('canonical identity validation rejects missing, malformed, and unknown Sprint status authority', () => {
    const root = mkdtempSync(join(tmpdir(), 'sprint-status-authority-'));
    fixtures.push(root);
    git(root, ['init', '--quiet', '--initial-branch=main']);
    git(root, ['config', 'user.email', 'identity@example.invalid']);
    git(root, ['config', 'user.name', 'Identity Fixture']);
    mkdirSync(join(root, SPRINT_DIR), { recursive: true });
    mkdirSync(join(root, '.ai/harness'), { recursive: true });
    writeFileSync(join(root, '.ai/harness/policy.json'), `${JSON.stringify({ sprints: { dir: SPRINT_DIR } })}\n`);
    writeFileSync(join(root, PRIMARY), sprint('Approved', TASK_ID, 'primary task'));

    const invalidStatuses = [
      {
        name: 'missing',
        text: sprint('Executing', TASK_ID, 'sibling task').replace(/^> \*\*Status\*\*:.*\n/m, ''),
        error: 'is missing required > **Status**:',
      },
      {
        name: 'malformed',
        text: sprint('Executing', TASK_ID, 'sibling task').replace('> **Status**:', '**Status**:'),
        error: 'is missing required > **Status**:',
      },
      {
        name: 'unknown',
        text: sprint('Executing', TASK_ID, 'sibling task').replace('Executing', 'Cooking'),
        error: "has unknown status 'Cooking'",
      },
      {
        name: 'lowercase-label',
        text: sprint('Executing', TASK_ID, 'sibling task').replace('**Status**', '**status**'),
        error: 'is missing required > **Status**:',
      },
      {
        name: 'quoted-value',
        text: sprint('Executing', TASK_ID, 'sibling task').replace('Executing', '`Approved`'),
        error: "has unknown status '`Approved`'",
      },
    ] as const;

    for (const fixture of invalidStatuses) {
      writeFileSync(join(root, SIBLING), fixture.text);
      commit(root, `${fixture.name} sibling status`);
      const read = readCanonicalSprint(root, { targetRef: 'main', sprintPath: PRIMARY });
      expect(read.ok).toBe(false);
      if (!read.ok) {
        expect(read.error).toContain(SIBLING);
        expect(read.error).toContain(fixture.error);
      }
    }

    writeFileSync(
      join(root, SIBLING),
      sprint('Executing', TASK_ID, 'unsupported schema sibling').replace('> **Backlog Schema**: 2', '> **Backlog Schema**: 3'),
    );
    commit(root, 'unsupported sibling schema');
    const unsupported = readCanonicalSprint(root, { targetRef: 'main', sprintPath: PRIMARY });
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) {
      expect(unsupported.error).toContain(SIBLING);
      expect(unsupported.error).toContain('unsupported backlog schema: 3');
    }
  });

  test('refuses read and claim before a shared lease can be elected, while distinct and archived carriers remain valid', () => {
    const root = mkdtempSync(join(tmpdir(), 'sprint-cross-carrier-'));
    fixtures.push(root);
    git(root, ['init', '--quiet', '--initial-branch=main']);
    git(root, ['config', 'user.email', 'identity@example.invalid']);
    git(root, ['config', 'user.name', 'Identity Fixture']);
    mkdirSync(join(root, SPRINT_DIR), { recursive: true });
    mkdirSync(join(root, '.ai/harness'), { recursive: true });
    writeFileSync(join(root, '.ai/harness/policy.json'), `${JSON.stringify({ sprints: { dir: SPRINT_DIR } })}\n`);
    writeFileSync(join(root, PRIMARY), sprint('Approved', TASK_ID, 'primary task'));
    writeFileSync(join(root, SIBLING), sprint('Executing', TASK_ID, 'sibling task'));
    commit(root, 'two live duplicate carriers');

    const rejectedRead = readCanonicalSprint(root, { targetRef: 'main', sprintPath: PRIMARY });
    expect(rejectedRead.ok).toBe(false);
    if (!rejectedRead.ok) {
      expect(rejectedRead.error).toContain(TASK_ID);
      expect(rejectedRead.error).toContain(PRIMARY);
      expect(rejectedRead.error).toContain(SIBLING);
    }

    const rejectedClaim = runSprint(root, [
      'claim',
      '--task-id', TASK_ID,
      '--expected-task-revision', 'a'.repeat(64),
      '--target-ref', 'main',
      '--sprint-path', PRIMARY,
      '--session-id', 'cross-carrier-fixture',
    ]);
    expect(rejectedClaim.status).toBe(1);
    expect(rejectedClaim.stderr).toContain(TASK_ID);
    expect(existsSync(leaseDirectory(root, TASK_ID))).toBe(false);

    writeFileSync(join(root, SIBLING), sprint('Executing', fixtureTaskId('sibling task'), 'sibling task'));
    commit(root, 'distinct live task id');
    expect(readCanonicalSprint(root, { targetRef: 'main', sprintPath: PRIMARY }).ok).toBe(true);

    const fixedCommit = git(root, ['rev-parse', 'main']).trim();
    const siblingId = fixtureTaskId('sibling task');
    expect(() => assertCanonicalSprintTaskIdsUniqueAtCommit(root, {
      commit: fixedCommit,
      sprintPath: 'workflow/sprints/new.sprint.md',
      sprintText: sprint('Approved', siblingId, 'new materialized carrier'),
    })).toThrow(`task id ${siblingId}`);
    expect(() => assertCanonicalSprintTaskIdsUniqueAtCommit(root, {
      commit: fixedCommit,
      sprintPath: 'workflow/sprints/new.sprint.md',
      sprintText: sprint('Approved', fixtureTaskId('new task'), 'new materialized carrier'),
    })).not.toThrow();
    expect(() => assertCanonicalSprintTaskIdsUniqueAtCommit(root, {
      commit: fixedCommit,
      sprintPath: PRIMARY,
      sprintText: sprint('Approved', TASK_ID, 'primary task', [
        `| 2 | ${siblingId} | [ ] | proposed duplicate | contract | identity test passes | (pending) |`,
      ]),
    })).toThrow(`task id ${siblingId}`);

    writeFileSync(join(root, SIBLING), sprint('Executing', TASK_ID, 'completed sibling task', [], '[x]'));
    commit(root, 'completed live task still reserves its identity');
    expect(readCanonicalSprint(root, { targetRef: 'main', sprintPath: PRIMARY }).ok).toBe(false);

    writeFileSync(join(root, SIBLING), sprint('Archived', TASK_ID, 'archived sibling task'));
    commit(root, 'archived duplicate is outside live coordination');
    expect(readCanonicalSprint(root, { targetRef: 'main', sprintPath: PRIMARY }).ok).toBe(true);

    for (const status of ['Draft', 'Done'] as const) {
      writeFileSync(join(root, SIBLING), sprint(status, TASK_ID, `${status} sibling task`));
      commit(root, `${status} duplicate is outside live coordination`);
      expect(readCanonicalSprint(root, { targetRef: 'main', sprintPath: PRIMARY }).ok).toBe(true);
    }
  });

  test('strict workflow validation rejects an uncommitted duplicate through the installable helper', () => {
    const root = mkdtempSync(join(tmpdir(), 'strict-sprint-cross-carrier-'));
    fixtures.push(root);
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'plans/sprints'), { recursive: true });
    mkdirSync(join(root, '.ai/harness'), { recursive: true });
    copyFileSync(join(ROOT, 'assets/templates/helpers/check-task-workflow.sh'), join(root, 'scripts/check-task-workflow.sh'));
    writeFileSync(join(root, '.ai/harness/policy.json'), '{"sprints":{"dir":"plans/sprints"}}\n');
    writeFileSync(join(root, 'plans/sprints/one.sprint.md'), sprint('Approved', TASK_ID, 'one'));
    writeFileSync(join(root, 'plans/sprints/two.sprint.md'), sprint('Executing', TASK_ID, 'two'));
    writeFileSync(
      join(root, 'plans/sprints/malformed.sprint.md'),
      sprint('Approved', fixtureTaskId('malformed status'), 'malformed').replace('> **Status**:', '**Status**:'),
    );

    const check = spawnSync('bash', ['scripts/check-task-workflow.sh', '--strict'], { cwd: root, encoding: 'utf8' });
    expect(check.status).toBe(1);
    expect(check.stdout).toContain(`duplicate live Sprint task id ${TASK_ID}`);
    expect(check.stdout).toContain('plans/sprints/one.sprint.md');
    expect(check.stdout).toContain('plans/sprints/two.sprint.md');
    expect(check.stdout).toContain("Sprint is missing a '**Status**' line: plans/sprints/malformed.sprint.md");
  });
});
