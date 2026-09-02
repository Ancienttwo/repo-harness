/**
 * The one-shot schema 1 -> 2 migration, proved on bytes.
 *
 * Two halves, tested where each lives: the pure rewrite is a golden test over
 * exact output text, and the command is exercised against a real git repo so
 * the canonical read, the live-lease refusal, the re-read proof, and the byte
 * bindings in the receipt are all the real ones.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { projectCanonicalTasks } from '../../src/core/state/coordination-identity';
import { sprintBacklogSchema } from '../../src/core/state/sprint-backlog-rows';
import { deriveLegacyTaskId, readLegacySprint } from '../../src/core/state/sprint-schema-v1';
import {
  SprintSchemaMigrationError,
  rewriteSprintToSchemaV2,
  rewriteWorkGraphToTaskId,
} from '../../src/core/state/sprint-schema-migration';
import {
  buildLeaseOwnerRecord,
  serializeLeaseOwnerRecord,
} from '../../src/core/state/coordination-identity';
import {
  defaultMigrationReceiptPath,
  migrateSprintSchemaCommand,
  processMigrationDependencies,
} from '../../src/effects/state/sprint-schema-migration';
import { leaseOwnerPath } from '../../src/effects/state/coordination-lease-store';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';

const SPRINT_PATH = 'plans/sprints/20260902-2101-migration.sprint.md';

const V1_SPRINT = [
  '# Sprint: Migration Fixture',
  '',
  '> **Status**: Approved',
  '> **Slug**: migration',
  '> **Goal Mode**: incremental',
  '',
  '## PRD',
  '',
  'Real problem statement with concrete user outcomes.',
  '',
  '## Backlog',
  '',
  '| # | Status | Task | Mode | Acceptance | Plan |',
  '|---|--------|------|------|------------|------|',
  '| 1 | [x] | first work package | contract | first tests pass | `plans/archive/plan-first.md` |',
  '| 2 | [ ] | second work package | inline | docs land | (pending) |',
  '',
  '## Execution Log',
  '',
  '| When | Task | Plan | Result |',
  '|------|------|------|--------|',
  '',
].join('\n');

function sha256(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf-8').digest('hex')}`;
}

describe('pure sprint rewrite', () => {
  const ids = new Map([['1', 'a'.repeat(64)], ['2', 'b'.repeat(64)]]);

  test('inserts exactly one header line, one column, and nothing else', () => {
    const migrated = rewriteSprintToSchemaV2({ sprintText: V1_SPRINT, idsByRowIndex: ids });
    expect(migrated).toBe([
      '# Sprint: Migration Fixture',
      '',
      '> **Status**: Approved',
      '> **Slug**: migration',
      '> **Goal Mode**: incremental',
      '> **Backlog Schema**: 2',
      '',
      '## PRD',
      '',
      'Real problem statement with concrete user outcomes.',
      '',
      '## Backlog',
      '',
      '| # | ID | Status | Task | Mode | Acceptance | Plan |',
      '|---|----|--------|------|------|------------|------|',
      `| 1 | ${'a'.repeat(64)} | [x] | first work package | contract | first tests pass | \`plans/archive/plan-first.md\` |`,
      `| 2 | ${'b'.repeat(64)} | [ ] | second work package | inline | docs land | (pending) |`,
      '',
      '## Execution Log',
      '',
      '| When | Task | Plan | Result |',
      '|------|------|------|--------|',
      '',
    ].join('\n'));
  });

  test('everything outside the header line and the table is byte-identical', () => {
    const migrated = rewriteSprintToSchemaV2({ sprintText: V1_SPRINT, idsByRowIndex: ids });
    const untouched = (text: string) => text.split('\n').filter((line) =>
      !line.startsWith('|') && line !== '> **Backlog Schema**: 2');
    expect(untouched(migrated)).toEqual(untouched(V1_SPRINT));
    // The Execution Log table is not a backlog table and must not be rewritten.
    expect(migrated).toContain('| When | Task | Plan | Result |');
  });

  test('CRLF bytes round-trip as CRLF', () => {
    const crlf = V1_SPRINT.replace(/\n/g, '\r\n');
    const migrated = rewriteSprintToSchemaV2({ sprintText: crlf, idsByRowIndex: ids });
    expect(migrated.split('\n').every((line, index, all) =>
      index === all.length - 1 || line.endsWith('\r'))).toBe(true);
    expect(migrated.replace(/\r\n/g, '\n'))
      .toBe(rewriteSprintToSchemaV2({ sprintText: V1_SPRINT, idsByRowIndex: ids }));
  });

  test('a row with no migrated id is refused', () => {
    expect(() => rewriteSprintToSchemaV2({ sprintText: V1_SPRINT, idsByRowIndex: new Map([['1', 'a'.repeat(64)]]) }))
      .toThrow(SprintSchemaMigrationError);
  });

  test('a sprint whose backlog header is not the schema 1 header is refused', () => {
    const odd = V1_SPRINT.replace('| # | Status | Task | Mode | Acceptance | Plan |', '| # | Task | Plan |');
    expect(() => rewriteSprintToSchemaV2({ sprintText: odd, idsByRowIndex: ids }))
      .toThrow(SprintSchemaMigrationError);
  });
});

describe('pure work graph rewrite', () => {
  const carrier = `${JSON.stringify({
    protocol: 1,
    kind: 'repo-harness-work-graph',
    repository_id: 'repo_0123456789abcdef',
    sprint_path: SPRINT_PATH,
    lane: 'engineering-v2',
    work_packages: [{ work_package_id: 'wp-a', task_ref: 'second work package', priority: 50 }],
  }, null, 2)}\n`;

  test('the join key becomes task_id and task_ref is dropped', () => {
    const migrated = rewriteWorkGraphToTaskId({
      workGraphText: carrier,
      idsByTaskCell: new Map([['second work package', 'b'.repeat(64)]]),
      workGraphPath: 'plans/sprints/x.work-graph.v1.json',
    });
    const parsed = JSON.parse(migrated);
    expect(parsed.work_packages[0].task_id).toBe('b'.repeat(64));
    expect('task_ref' in parsed.work_packages[0]).toBe(false);
    expect(parsed.protocol).toBe(1);
  });

  test('a task_ref that names no canonical row is refused', () => {
    expect(() => rewriteWorkGraphToTaskId({
      workGraphText: carrier,
      idsByTaskCell: new Map([['first work package', 'a'.repeat(64)]]),
      workGraphPath: 'plans/sprints/x.work-graph.v1.json',
    })).toThrow(/does not name a canonical Sprint row/);
  });

  test('a carrier that already carries task_id is refused', () => {
    const already = carrier.replace('"task_ref"', '"task_id"');
    expect(() => rewriteWorkGraphToTaskId({
      workGraphText: already,
      idsByTaskCell: new Map([['second work package', 'b'.repeat(64)]]),
      workGraphPath: 'plans/sprints/x.work-graph.v1.json',
    })).toThrow(/already carries task_id/);
  });
});

describe('legacy sprint reader', () => {
  test('duplicate Task cells make the mapping ambiguous and are refused', () => {
    const duplicated = V1_SPRINT.replace('second work package', 'first work package');
    const result = readLegacySprint({
      repoIdentity: '/tmp/clone/.git', sprintPath: SPRINT_PATH, sprintText: duplicated,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('repeat the Task cell');
  });

  test('a schema 2 sprint has nothing to migrate', () => {
    const migrated = rewriteSprintToSchemaV2({
      sprintText: V1_SPRINT,
      idsByRowIndex: new Map([['1', 'a'.repeat(64)], ['2', 'b'.repeat(64)]]),
    });
    const result = readLegacySprint({
      repoIdentity: '/tmp/clone/.git', sprintPath: SPRINT_PATH, sprintText: migrated,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not backlog schema 1');
  });
});

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function repoFixture(sprintText = V1_SPRINT, carrier?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-migrate-'));
  roots.push(root);
  mkdirSync(dirname(join(root, SPRINT_PATH)), { recursive: true });
  writeFileSync(join(root, SPRINT_PATH), sprintText);
  if (carrier !== undefined) {
    writeFileSync(join(root, SPRINT_PATH.replace('.sprint.md', '.work-graph.v1.json')), carrier);
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-b', 'main');
  git('config', 'user.email', 'fixture@example.com');
  git('config', 'user.name', 'Migration Fixture');
  git('add', '-A');
  git('commit', '-m', 'fixture');
  return root;
}

describe('migrate-schema command', () => {
  test('every migrated id equals the row\'s schema 1 identity, and the receipt binds the bytes', () => {
    const root = repoFixture();
    const before = readFileSync(join(root, SPRINT_PATH), 'utf-8');
    const outcome = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main' },
      processMigrationDependencies(root),
    );
    expect(outcome.stderr).toBe('');
    expect(outcome.exitCode).toBe(0);

    const after = readFileSync(join(root, SPRINT_PATH), 'utf-8');
    expect(sprintBacklogSchema(after)).toBe(2);

    const repoIdentity = resolveRepoIdentity(root);
    const migrated = projectCanonicalTasks({ repoIdentity, sprintPath: SPRINT_PATH, sprintText: after });
    expect(migrated).toHaveLength(2);
    for (const task of migrated) {
      expect(task.task_id).toBe(deriveLegacyTaskId({
        repoIdentity, sprintPath: SPRINT_PATH, taskCell: task.row.task,
      }));
    }

    const receipt = JSON.parse(readFileSync(join(root, defaultMigrationReceiptPath(SPRINT_PATH)), 'utf-8'));
    expect(receipt.kind).toBe('repo-harness-sprint-schema-migration');
    expect(receipt.from_schema).toBe(1);
    expect(receipt.to_schema).toBe(2);
    expect(receipt.sprint_sha256_before).toBe(sha256(before));
    expect(receipt.sprint_sha256_after).toBe(sha256(after));
    expect(receipt.target_commit).toMatch(/^[0-9a-f]{40,64}$/);
    expect(receipt.work_graph_path).toBeNull();
    expect(receipt.tasks.map((task: { task_id: string }) => task.task_id))
      .toEqual(migrated.map((task) => task.task_id));
  });

  test('the same-commit Work Graph carrier is rewritten and byte-bound in the receipt', () => {
    const carrierPath = SPRINT_PATH.replace('.sprint.md', '.work-graph.v1.json');
    const carrier = `${JSON.stringify({
      protocol: 1,
      kind: 'repo-harness-work-graph',
      repository_id: 'repo_0123456789abcdef',
      sprint_path: SPRINT_PATH,
      lane: 'engineering-v2',
      work_packages: [{ work_package_id: 'wp-a', task_ref: 'second work package' }],
    }, null, 2)}\n`;
    const root = repoFixture(V1_SPRINT, carrier);
    const outcome = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main' },
      processMigrationDependencies(root),
    );
    expect(outcome.exitCode).toBe(0);

    const after = readFileSync(join(root, carrierPath), 'utf-8');
    const parsed = JSON.parse(after);
    const repoIdentity = resolveRepoIdentity(root);
    expect(parsed.work_packages[0].task_id).toBe(deriveLegacyTaskId({
      repoIdentity, sprintPath: SPRINT_PATH, taskCell: 'second work package',
    }));
    const receipt = JSON.parse(readFileSync(join(root, defaultMigrationReceiptPath(SPRINT_PATH)), 'utf-8'));
    expect(receipt.work_graph_path).toBe(carrierPath);
    expect(receipt.work_graph_sha256_before).toBe(sha256(carrier));
    expect(receipt.work_graph_sha256_after).toBe(sha256(after));
  });

  test('a live non-released lease refuses the whole migration and touches nothing', () => {
    const root = repoFixture();
    const repoIdentity = resolveRepoIdentity(root);
    const taskId = deriveLegacyTaskId({ repoIdentity, sprintPath: SPRINT_PATH, taskCell: 'second work package' });
    const ownerPath = leaseOwnerPath(root, taskId);
    mkdirSync(dirname(ownerPath), { recursive: true });
    writeFileSync(ownerPath, serializeLeaseOwnerRecord(buildLeaseOwnerRecord({
      claimId: '11111111-1111-4111-8111-111111111111',
      taskId,
      taskRevision: 'c'.repeat(64),
      sprintPath: SPRINT_PATH,
      targetRef: 'main',
      generation: 1,
      sessionId: 'session-1',
      sourceWorktree: root,
    })));

    const outcome = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main' },
      processMigrationDependencies(root),
    );
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('non-released lease');
    expect(outcome.stderr).toContain(taskId);
    expect(readFileSync(join(root, SPRINT_PATH), 'utf-8')).toBe(V1_SPRINT);
  });

  test('a working tree that differs from the canonical ref is refused', () => {
    const root = repoFixture();
    writeFileSync(join(root, SPRINT_PATH), V1_SPRINT.replace('docs land', 'docs land and ship'));
    const outcome = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main' },
      processMigrationDependencies(root),
    );
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('differs from main');
  });

  test('re-running the migration on an already migrated sprint is refused', () => {
    const root = repoFixture();
    expect(migrateSprintSchemaCommand({ sprint: SPRINT_PATH, targetRef: 'main' }, processMigrationDependencies(root)).exitCode).toBe(0);
    execFileSync('git', ['add', '-A'], { cwd: root, encoding: 'utf8' });
    execFileSync('git', ['commit', '-m', 'migrated'], { cwd: root, encoding: 'utf8' });
    const again = migrateSprintSchemaCommand({ sprint: SPRINT_PATH, targetRef: 'main' }, processMigrationDependencies(root));
    expect(again.exitCode).toBe(1);
    expect(again.stderr).toContain('not backlog schema 1');
  });

  test('a post-write validation failure restores both files and writes no receipt', () => {
    const carrierPath = SPRINT_PATH.replace('.sprint.md', '.work-graph.v1.json');
    const carrier = `${JSON.stringify({
      protocol: 1,
      kind: 'repo-harness-work-graph',
      repository_id: 'repo_0123456789abcdef',
      sprint_path: SPRINT_PATH,
      lane: 'engineering-v2',
      work_packages: [{ work_package_id: 'wp-a', task_ref: 'second work package' }],
    }, null, 2)}\n`;
    const root = repoFixture(V1_SPRINT, carrier);
    const sprintBefore = readFileSync(join(root, SPRINT_PATH), 'utf-8');
    const carrierBefore = readFileSync(join(root, carrierPath), 'utf-8');

    // A rewrite that silently drops the last backlog row: the bytes are valid
    // schema 2 and survive the re-read, so the only gate that catches it is the
    // row-count proof -- which runs after both files are already on disk.
    const outcome = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main' },
      {
        ...processMigrationDependencies(root),
        rewriteSprint: (input) => rewriteSprintToSchemaV2(input)
          .split('\n')
          .filter((line) => !line.includes('second work package'))
          .join('\n'),
      },
    );

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('has 1 rows but schema 1 had 2');
    expect(readFileSync(join(root, SPRINT_PATH), 'utf-8')).toBe(sprintBefore);
    expect(readFileSync(join(root, carrierPath), 'utf-8')).toBe(carrierBefore);
    expect(existsSync(join(root, defaultMigrationReceiptPath(SPRINT_PATH)))).toBe(false);
  });

  test('duplicate Task cells refuse the migration before any write', () => {
    const root = repoFixture(V1_SPRINT.replace('second work package', 'first work package'));
    const before = readFileSync(join(root, SPRINT_PATH), 'utf-8');
    const outcome = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main' },
      processMigrationDependencies(root),
    );
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('repeat the Task cell');
    expect(readFileSync(join(root, SPRINT_PATH), 'utf-8')).toBe(before);
  });
});
