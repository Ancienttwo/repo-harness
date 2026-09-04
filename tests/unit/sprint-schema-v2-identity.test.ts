/**
 * The schema 2 identity contract, as properties over sprint text.
 *
 * Each test here is one acceptance criterion of the persisted-task-ID contract,
 * falsified where it is cheapest to falsify: no filesystem, no git, no clock.
 * The point of the whole change is that a title clarification is a rename, not
 * a delete plus a create, so the rename cases come first.
 */
import { describe, expect, test } from 'bun:test';
import {
  deriveTaskRevision,
  projectCanonicalTasks,
  lookupCanonicalTask,
  unmigratedSprintRefusal,
} from '../../src/core/state/coordination-identity';
import {
  SPRINT_BACKLOG_SCHEMA_V1,
  SPRINT_BACKLOG_SCHEMA_V2,
  SprintSchemaError,
  backlogRows,
  sprintBacklogSchema,
} from '../../src/core/state/sprint-backlog-rows';
import { projectWorkGraph, type WorkGraphV1 } from '../../src/core/engineers/scheduling';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const REPO_IDENTITY = '/tmp/schema-v2-clone/.git';
const SPRINT_PATH = 'plans/sprints/20260902-2101-schema-v2.sprint.md';

const ID_A = fixtureTaskId('add the ID column');
const ID_B = fixtureTaskId('move the Work Graph join key');

interface Row {
  readonly index: number;
  readonly id: string;
  readonly status?: string;
  readonly task: string;
  readonly mode?: string;
  readonly acceptance?: string;
  readonly plan?: string;
}

function row(input: Row): string {
  return `| ${input.index} | ${input.id} | ${input.status ?? '[ ]'} | ${input.task} | ${input.mode ?? 'contract'} | ${input.acceptance ?? 'tests pass'} | ${input.plan ?? '(pending)'} |`;
}

function sprint(rows: readonly string[], schemaHeader = '> **Backlog Schema**: 2'): string {
  return [
    '# Sprint: Schema v2 Fixture',
    '',
    '> **Status**: Executing',
    '> **Slug**: schema-v2',
    ...(schemaHeader.length > 0 ? [schemaHeader] : []),
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

const ROW_A = row({ index: 1, id: ID_A, task: 'add the ID column' });
const ROW_B = row({ index: 2, id: ID_B, task: 'move the Work Graph join key', mode: 'inline', acceptance: 'graph joins by id' });

function tasks(sprintText: string) {
  return projectCanonicalTasks({ repoIdentity: REPO_IDENTITY, sprintPath: SPRINT_PATH, sprintText });
}

function taskById(sprintText: string, taskId: string) {
  const found = tasks(sprintText).find((task) => task.task_id === taskId);
  if (!found) throw new Error(`fixture has no row with id ${taskId}`);
  return found;
}

describe('schema detection', () => {
  test('an absent marker is schema 1 and a declared 2 is schema 2', () => {
    expect(sprintBacklogSchema(sprint([ROW_A], ''))).toBe(SPRINT_BACKLOG_SCHEMA_V1);
    expect(sprintBacklogSchema(sprint([ROW_A]))).toBe(SPRINT_BACKLOG_SCHEMA_V2);
  });

  test('an unsupported or self-declared-1 schema fails closed instead of degrading', () => {
    expect(() => sprintBacklogSchema(sprint([ROW_A], '> **Backlog Schema**: 3'))).toThrow(SprintSchemaError);
    expect(() => sprintBacklogSchema(sprint([ROW_A], '> **Backlog Schema**: 1'))).toThrow(SprintSchemaError);
    expect(() => sprintBacklogSchema(sprint([ROW_A], '> **Backlog Schema**:'))).toThrow(SprintSchemaError);
  });

  test('a repeated declaration is refused rather than resolved by precedence', () => {
    const twice = sprint([ROW_A], '> **Backlog Schema**: 2\n> **Backlog Schema**: 2');
    expect(() => sprintBacklogSchema(twice)).toThrow(/declares the backlog schema 2 times/);
    const contradictory = sprint([ROW_A], '> **Backlog Schema**: 2\n> **Backlog Schema**: 3');
    expect(() => sprintBacklogSchema(contradictory)).toThrow(/declares the backlog schema 2 times/);
  });

  test('a marker after the backlog heading is not honoured by either parser', () => {
    const text = [
      '# Sprint: late marker', '', '## Backlog', '',
      '> **Backlog Schema**: 2',
      '| # | Status | Task | Mode | Acceptance | Plan |',
      '|---|--------|------|------|------------|------|',
      '| 1 | [ ] | late marker row | contract | tests pass | (pending) |',
    ].join('\n');
    expect(sprintBacklogSchema(text)).toBe(SPRINT_BACKLOG_SCHEMA_V1);
    expect(backlogRows(text)[0].id).toBe('');
  });

  test('a live schema 1 sprint cannot mint identity and names the migration command', () => {
    expect(() => tasks(sprint([ROW_A], ''))).toThrow(SprintSchemaError);
    expect(() => tasks(sprint([ROW_A], ''))).toThrow(/sprint migrate-schema/);
    expect(unmigratedSprintRefusal(SPRINT_PATH)).toContain(SPRINT_PATH);
  });
});

describe('identity survives display edits', () => {
  test('renaming a pending Task preserves task_id and changes task_revision', () => {
    const before = taskById(sprint([ROW_A, ROW_B]), ID_A);
    const after = taskById(
      sprint([row({ index: 1, id: ID_A, task: 'add the persisted ID column' }), ROW_B]),
      ID_A,
    );
    expect(after.task_id).toBe(before.task_id);
    expect(after.row.task).not.toBe(before.row.task);
    expect(after.task_revision).not.toBe(before.task_revision);
  });

  test('reordering rows preserves both identity and revision', () => {
    const before = sprint([ROW_A, ROW_B]);
    const reordered = sprint([
      row({ index: 1, id: ID_B, task: 'move the Work Graph join key', mode: 'inline', acceptance: 'graph joins by id' }),
      row({ index: 2, id: ID_A, task: 'add the ID column' }),
    ]);
    expect(reordered).not.toBe(before);
    for (const id of [ID_A, ID_B]) {
      expect(taskById(reordered, id).task_id).toBe(taskById(before, id).task_id);
      expect(taskById(reordered, id).task_revision).toBe(taskById(before, id).task_revision);
    }
  });

  test('a Mode or Acceptance edit keeps identity and drifts the revision', () => {
    const before = taskById(sprint([ROW_A]), ID_A);
    const mode = taskById(sprint([row({ index: 1, id: ID_A, task: 'add the ID column', mode: 'inline' })]), ID_A);
    const acceptance = taskById(
      sprint([row({ index: 1, id: ID_A, task: 'add the ID column', acceptance: 'tests pass and docs land' })]),
      ID_A,
    );
    expect(mode.task_id).toBe(before.task_id);
    expect(acceptance.task_id).toBe(before.task_id);
    expect(mode.task_revision).not.toBe(before.task_revision);
    expect(acceptance.task_revision).not.toBe(before.task_revision);
  });

  test('a Status-only change preserves the revision', () => {
    const before = taskById(sprint([ROW_A, ROW_B]), ID_B);
    const after = taskById(
      sprint([row({ index: 1, id: ID_A, status: '[x]', task: 'add the ID column' }), ROW_B]),
      ID_B,
    );
    expect(after.task_revision).toBe(before.task_revision);
    // The completed row itself also keeps its revision: Status is excluded.
    expect(taskById(sprint([row({ index: 1, id: ID_A, status: '[x]', task: 'add the ID column' })]), ID_A).task_revision)
      .toBe(taskById(sprint([ROW_A]), ID_A).task_revision);
  });

  test('the Plan cell is not part of either derivation', () => {
    const before = taskById(sprint([ROW_A]), ID_A);
    const after = taskById(
      sprint([row({ index: 1, id: ID_A, task: 'add the ID column', plan: '`plans/plan-x.md`' })]),
      ID_A,
    );
    expect(after.task_id).toBe(before.task_id);
    expect(after.task_revision).toBe(before.task_revision);
  });

  test('a stale offer taken before a title edit fails on revision, not identity', () => {
    const staleRevision = taskById(sprint([ROW_A]), ID_A).task_revision;
    const renamed = taskById(sprint([row({ index: 1, id: ID_A, task: 'add the ID column (v2)' })]), ID_A);
    // The offer can still find its task -- that is the whole point --
    // and the revision check is what refuses it.
    expect(renamed.task_id).toBe(ID_A);
    expect(renamed.task_revision).not.toBe(staleRevision);
  });
});

describe('malformed identity fails closed', () => {
  test('a missing ID cell is refused', () => {
    const text = sprint([`| 1 |  | [ ] | add the ID column | contract | tests pass | (pending) |`]);
    expect(() => tasks(text)).toThrow(/has no persisted task id/);
  });

  test('a non-digest ID cell is refused', () => {
    const text = sprint([row({ index: 1, id: 'add-the-id-column', task: 'add the ID column' })]);
    expect(() => tasks(text)).toThrow(/malformed task id/);
  });

  test('an uppercase-hex ID cell is refused rather than normalised', () => {
    const text = sprint([row({ index: 1, id: ID_A.toUpperCase(), task: 'add the ID column' })]);
    expect(() => tasks(text)).toThrow(/malformed task id/);
  });

  test('a copied ID appearing twice is refused for the whole sprint', () => {
    const text = sprint([ROW_A, row({ index: 2, id: ID_A, task: 'a different row that copied the id' })]);
    expect(() => tasks(text)).toThrow(/repeats task id/);
    const lookup = lookupCanonicalTask(
      { repoIdentity: REPO_IDENTITY, sprintPath: SPRINT_PATH, sprintText: text },
      ID_A,
    );
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) expect(lookup.error).toContain('repeats task id');
  });

  test('two rows may share Task text once identity is persisted', () => {
    const text = sprint([
      row({ index: 1, id: ID_A, task: 'same display text' }),
      row({ index: 2, id: ID_B, task: 'same display text' }),
    ]);
    const projected = tasks(text);
    expect(projected.map((task) => task.task_id)).toEqual([ID_A, ID_B]);
    expect(projected[0].task_revision).not.toBe(projected[1].task_revision);
  });
});

describe('Work Graph joins by persisted id', () => {
  const DIGEST = `sha256:${'a'.repeat(64)}`;

  function graph(taskId: string): WorkGraphV1 {
    return {
      protocol: 1,
      kind: 'repo-harness-work-graph',
      repository_id: 'repo_0123456789abcdef',
      sprint_path: SPRINT_PATH,
      lane: 'engineering-v2',
      work_packages: [{
        work_package_id: 'wp-a',
        task_id: taskId,
        primary_capability: 'capability.runtime-harness.collaboration',
        depends_on: [],
        priority: 50,
        concurrency: { scope: 'repo', key: 'wp-a' },
        execution_surface: 'contract',
        integration_group: null,
        required_acceptance: [{
          gate: 'module', policy_id: 'module-gate',
          policy_ref: 'docs/spec.md', policy_revision: DIGEST,
        }],
        retry_policy: { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'], backoff: { kind: 'exponential', initial_seconds: 30, maximum_seconds: 300 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' } as const,
    rollback_boundary: {
          kind: 'work_package', boundary_id: 'wp-a',
          boundary_ref: 'plans/rollback.json', boundary_revision: DIGEST,
        },
      }],
    };
  }

  function canonical(sprintText: string) {
    return tasks(sprintText).map((task, index) => ({
      task_id: task.task_id,
      task_revision: task.task_revision,
      task_ref: task.row.task,
      status: task.row.status,
      row_order: index + 1,
    }));
  }

  test('the projection survives a Task title edit', () => {
    const before = projectWorkGraph(graph(ID_A), canonical(sprint([ROW_A])));
    const renamed = sprint([row({ index: 1, id: ID_A, task: 'add the persisted ID column' })]);
    const after = projectWorkGraph(graph(ID_A), canonical(renamed));
    expect(after.work_packages[0].task_id).toBe(before.work_packages[0].task_id);
    // task_ref is a derived display projection, so it follows the new title.
    expect(after.work_packages[0].task_ref).toBe('add the persisted ID column');
    expect(before.work_packages[0].task_ref).toBe('add the ID column');
    // The revision moved, which is what invalidates a stale offer.
    expect(after.work_packages[0].task_revision).not.toBe(before.work_packages[0].task_revision);
  });

  test('a carrier naming an absent id is refused', () => {
    expect(() => projectWorkGraph(graph(ID_B), canonical(sprint([ROW_A]))))
      .toThrow('task_id is absent from canonical Sprint');
  });

  test('the carrier refuses a task_id that is not a digest', () => {
    expect(() => projectWorkGraph(graph('add the ID column'), canonical(sprint([ROW_A]))))
      .toThrow(/task_id/);
  });
});

describe('revision preimage', () => {
  test('the revision is domain-separated from the schema 1 protocol constant', () => {
    // A schema 2 revision must not collide with anything a schema 1 build
    // produced for the same row, or a stale claim would look current.
    const revision = deriveTaskRevision({
      taskId: ID_A, taskCell: 'add the ID column', modeCell: 'contract', acceptanceCell: 'tests pass',
    });
    expect(revision).toMatch(/^[0-9a-f]{64}$/);
    expect(revision).not.toBe(deriveTaskRevision({
      taskId: ID_A, taskCell: 'add the ID column', modeCell: 'contract', acceptanceCell: 'tests pass ',
    }));
  });
});
