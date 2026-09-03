/**
 * The one-shot schema 1 -> 2 migration, proved on bytes.
 *
 * Two halves, tested where each lives: the pure rewrite is a golden test over
 * exact output text, and the command is exercised against a real git repo so
 * the canonical read, the live-lease refusal, the re-read proof, and the byte
 * bindings in the receipt are all the real ones.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync, spawn } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import type { CommandOutcome } from '../../src/core/state/command-outcome';
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
  type MigrationFileSystem,
} from '../../src/effects/state/sprint-schema-migration';
import { leaseOwnerPath, withBacklogLock } from '../../src/effects/state/coordination-lease-store';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';

const REPO_ROOT = join(import.meta.dir, '..', '..');
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

const CARRIER_PATH = SPRINT_PATH.replace('.sprint.md', '.work-graph.v1.json');
const CARRIER_DIGEST = `sha256:${'a'.repeat(64)}`;

/** One schema 1 Work Package in the exact shape the strict validator requires. */
function legacyWorkPackage(id: string, taskRef: string): Record<string, unknown> {
  return {
    work_package_id: id,
    task_ref: taskRef,
    primary_capability: 'capability.runtime-harness.collaboration',
    depends_on: [],
    priority: 50,
    concurrency: { scope: 'repo', key: id },
    execution_surface: 'contract',
    integration_group: null,
    required_acceptance: [{
      gate: 'module', policy_id: 'module-gate',
      policy_ref: 'docs/spec.md', policy_revision: CARRIER_DIGEST,
    }],
    rollback_boundary: {
      kind: 'work_package', boundary_id: id,
      boundary_ref: 'plans/rollback.json', boundary_revision: CARRIER_DIGEST,
    },
  };
}

/**
 * A carrier covering both backlog rows. `projectWorkGraph` requires an
 * engineering-v2 graph to cover every canonical Sprint row, so a one-package
 * carrier would be refused for a reason unrelated to whatever a test is
 * actually exercising.
 */
function legacyCarrier(overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    protocol: 1,
    kind: 'repo-harness-work-graph',
    repository_id: 'repo_0123456789abcdef',
    sprint_path: SPRINT_PATH,
    lane: 'engineering-v2',
    work_packages: [
      legacyWorkPackage('wp-a', 'first work package'),
      legacyWorkPackage('wp-b', 'second work package'),
    ],
    ...overrides,
  }, null, 2)}\n`;
}

/** The ids the migration will persist for the fixture's two rows. */
function fixtureIdsByTaskCell(): Map<string, string> {
  return new Map([
    ['first work package', 'a'.repeat(64)],
    ['second work package', 'b'.repeat(64)],
  ]);
}

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
  const rewrite = (workGraphText: string, ids = fixtureIdsByTaskCell()) => rewriteWorkGraphToTaskId({
    workGraphText,
    idsByTaskCell: ids,
    workGraphPath: CARRIER_PATH,
    sprintPath: SPRINT_PATH,
  });

  test('the join key becomes task_id and task_ref is dropped', () => {
    const parsed = JSON.parse(rewrite(legacyCarrier()));
    expect(parsed.work_packages.map((entry: { task_id: string }) => entry.task_id))
      .toEqual(['a'.repeat(64), 'b'.repeat(64)]);
    expect(parsed.work_packages.every((entry: object) => !('task_ref' in entry))).toBe(true);
    expect(parsed.protocol).toBe(1);
    expect(parsed.sprint_path).toBe(SPRINT_PATH);
  });

  test('a task_ref that names no canonical row is refused', () => {
    expect(() => rewrite(legacyCarrier(), new Map([['first work package', 'a'.repeat(64)]])))
      .toThrow(/does not name a canonical Sprint row/);
  });

  test('a carrier that already carries task_id is refused', () => {
    expect(() => rewrite(legacyCarrier().replace('"task_ref"', '"task_id"')))
      .toThrow(/already carries task_id|keys are invalid/);
  });

  test('the wrong protocol, kind or sprint_path is refused', () => {
    expect(() => rewrite(legacyCarrier({ protocol: 2 }))).toThrow(/declares protocol 2/);
    expect(() => rewrite(legacyCarrier({ kind: 'repo-harness-other' }))).toThrow(/declares kind/);
    expect(() => rewrite(legacyCarrier({ sprint_path: 'plans/sprints/other.sprint.md' })))
      .toThrow(/not the sprint being migrated/);
  });

  test('unknown or missing top-level keys are refused', () => {
    expect(() => rewrite(legacyCarrier({ extra: true }))).toThrow(/keys are invalid/);
    const missing = JSON.parse(legacyCarrier());
    delete missing.repository_id;
    expect(() => rewrite(`${JSON.stringify(missing, null, 2)}\n`)).toThrow(/keys are invalid/);
  });

  test('an unsupported lane and a lane/package-count mismatch are refused', () => {
    expect(() => rewrite(legacyCarrier({ lane: 'fleet-v3' }))).toThrow(/unsupported lane/);
    expect(() => rewrite(legacyCarrier({ lane: 'generic-v1' }))).toThrow(/generic-v1 but carries work packages/);
    expect(() => rewrite(legacyCarrier({ lane: 'engineering-v2', work_packages: [] })))
      .toThrow(/engineering-v2 but carries no work packages/);
  });

  test('a work package missing a required field is refused', () => {
    const short = JSON.parse(legacyCarrier());
    delete short.work_packages[0].rollback_boundary;
    expect(() => rewrite(`${JSON.stringify(short, null, 2)}\n`)).toThrow(/work_packages\[0\] keys are invalid/);
  });

  test('duplicate work_package_id or task_ref is refused', () => {
    expect(() => rewrite(legacyCarrier({
      work_packages: [legacyWorkPackage('wp-a', 'first work package'), legacyWorkPackage('wp-a', 'second work package')],
    }))).toThrow(/repeats work_package_id wp-a/);
    expect(() => rewrite(legacyCarrier({
      work_packages: [legacyWorkPackage('wp-a', 'first work package'), legacyWorkPackage('wp-b', 'first work package')],
    }))).toThrow(/repeats task_ref/);
  });

  test('two task refs collapsing onto one id are refused', () => {
    const collapsing = new Map([
      ['first work package', 'a'.repeat(64)],
      ['second work package', 'a'.repeat(64)],
    ]);
    expect(() => rewrite(legacyCarrier(), collapsing)).toThrow(/maps two work packages onto task id/);
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

describe('legacy sprint row shape', () => {
  const read = (sprintText: string) => readLegacySprint({
    repoIdentity: '/tmp/clone/.git', sprintPath: SPRINT_PATH, sprintText,
  });

  test('a truncated row is refused before any id is derived', () => {
    const truncated = V1_SPRINT.replace(
      '| 2 | [ ] | second work package | inline | docs land | (pending) |',
      '| 2 | [ ] | second work package | inline |',
    );
    const result = read(truncated);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/has \d+ cells, not the 6/);
  });

  test('a row with an extra cell is refused', () => {
    const wide = V1_SPRINT.replace(
      '| 2 | [ ] | second work package | inline | docs land | (pending) |',
      '| 2 | [ ] | second work package | inline | docs land | (pending) | extra |',
    );
    const result = read(wide);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/has 7 cells, not the 6/);
  });

  test('an empty Mode or Acceptance cell is refused', () => {
    for (const [cell, replacement] of [
      ['mode', '| 2 | [ ] | second work package |  | docs land | (pending) |'],
      ['acceptance', '| 2 | [ ] | second work package | inline |  | (pending) |'],
    ] as const) {
      const result = read(V1_SPRINT.replace('| 2 | [ ] | second work package | inline | docs land | (pending) |', replacement));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(`empty ${cell} cell`);
    }
  });

  test('an invalid status cell is refused', () => {
    const result = read(V1_SPRINT.replace('| 2 | [ ] |', '| 2 | [~] |'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('invalid status cell');
  });

  test('an empty Plan cell is allowed: it is not identity-bearing', () => {
    const result = read(V1_SPRINT.replace('| docs land | (pending) |', '| docs land |  |'));
    expect(result.ok).toBe(true);
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
  // The command resolves paths through `repoPath`, which canonicalises; on
  // macOS `/var/...` becomes `/private/var/...`, so a test comparing absolute
  // paths has to start from the canonical root too.
  return realpathSync(root);
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
    const carrierPath = CARRIER_PATH;
    const carrier = legacyCarrier();
    const root = repoFixture(V1_SPRINT, carrier);
    const outcome = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main' },
      processMigrationDependencies(root),
    );
    expect(outcome.exitCode).toBe(0);

    const after = readFileSync(join(root, carrierPath), 'utf-8');
    const parsed = JSON.parse(after);
    const repoIdentity = resolveRepoIdentity(root);
    expect(parsed.work_packages.map((entry: { task_id: string }) => entry.task_id)).toEqual([
      deriveLegacyTaskId({ repoIdentity, sprintPath: SPRINT_PATH, taskCell: 'first work package' }),
      deriveLegacyTaskId({ repoIdentity, sprintPath: SPRINT_PATH, taskCell: 'second work package' }),
    ]);
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
    // A fresh receipt target, so the refusal comes from the schema gate rather
    // than from the receipt this migration already wrote.
    const again = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main', receipt: 'plans/sprints/second-attempt.schema-migration.v1.json' },
      processMigrationDependencies(root),
    );
    expect(again.exitCode).toBe(1);
    expect(again.stderr).toContain('not backlog schema 1');
    // A second run without --receipt refuses on the schema gate, which runs
    // before the receipt is even considered; the receipt-exists refusal has its
    // own test above.
    const repeated = migrateSprintSchemaCommand({ sprint: SPRINT_PATH, targetRef: 'main' }, processMigrationDependencies(root));
    expect(repeated.exitCode).toBe(1);
    expect(repeated.stderr).toContain('not backlog schema 1');
  });

  test('a post-write validation failure restores the sprint and writes no receipt', () => {
    // No carrier here on purpose: the strict pre-write Work Graph gate would
    // catch a dropped row before the write, and this test is about the gate
    // that runs *after* it.
    const root = repoFixture(V1_SPRINT);
    const sprintBefore = readFileSync(join(root, SPRINT_PATH), 'utf-8');

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
    expect(existsSync(join(root, defaultMigrationReceiptPath(SPRINT_PATH)))).toBe(false);
  });

  test('an unexpected post-write throw restores both files, writes no receipt, and propagates', () => {
    const carrierPath = CARRIER_PATH;
    const carrier = legacyCarrier();
    const root = repoFixture(V1_SPRINT, carrier);
    const sprintBefore = readFileSync(join(root, SPRINT_PATH), 'utf-8');
    const carrierBefore = readFileSync(join(root, carrierPath), 'utf-8');

    // `repoIdentity` is read once before the write (to derive the schema 1 ids)
    // and once after it (to re-project the migrated sprint). Throwing on the
    // second call is a plain Error inside the post-write window: no typed
    // refusal, no gate -- exactly the case that used to rethrow past the
    // restore and leave the tree half migrated.
    let calls = 0;
    const deps = processMigrationDependencies(root);
    const failing = {
      ...deps,
      repoIdentity: (cwd: string) => {
        calls += 1;
        if (calls > 1) throw new Error('repo identity is unavailable');
        return deps.repoIdentity(cwd);
      },
    };

    expect(() => migrateSprintSchemaCommand({ sprint: SPRINT_PATH, targetRef: 'main' }, failing))
      .toThrow('repo identity is unavailable');
    expect(calls).toBe(2);
    expect(readFileSync(join(root, SPRINT_PATH), 'utf-8')).toBe(sprintBefore);
    expect(existsSync(join(root, defaultMigrationReceiptPath(SPRINT_PATH)))).toBe(false);
  });

  test('a carrier that differs from the canonical commit is refused', () => {
    const root = repoFixture(V1_SPRINT, legacyCarrier());
    const before = readFileSync(join(root, CARRIER_PATH), 'utf-8');
    writeFileSync(join(root, CARRIER_PATH), before.replace('"priority": 50', '"priority": 51'));
    const outcome = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main' },
      processMigrationDependencies(root),
    );
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('differs from main');
    expect(readFileSync(join(root, SPRINT_PATH), 'utf-8')).toBe(V1_SPRINT);
  });

  test('a carrier present only in the working tree is refused', () => {
    const root = repoFixture(V1_SPRINT);
    writeFileSync(join(root, CARRIER_PATH), legacyCarrier());
    const outcome = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main' },
      processMigrationDependencies(root),
    );
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('exists in the working tree but not at main');
  });

  test('a carrier present only at the canonical commit is refused', () => {
    const root = repoFixture(V1_SPRINT, legacyCarrier());
    rmSync(join(root, CARRIER_PATH));
    const outcome = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main' },
      processMigrationDependencies(root),
    );
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('but not in the working tree');
  });

  test('a receipt path that escapes the repository is refused', () => {
    const root = repoFixture(V1_SPRINT);
    for (const receipt of ['../escape.json', '/tmp/escape.json']) {
      const outcome = migrateSprintSchemaCommand(
        { sprint: SPRINT_PATH, targetRef: 'main', receipt },
        processMigrationDependencies(root),
      );
      expect(outcome.exitCode).toBe(1);
      expect(outcome.stderr).toContain('not a safe repo-relative path');
      expect(readFileSync(join(root, SPRINT_PATH), 'utf-8')).toBe(V1_SPRINT);
    }
  });

  test('an existing receipt target is never overwritten and never deleted', () => {
    const root = repoFixture(V1_SPRINT);
    const receipt = 'plans/sprints/occupied.json';
    writeFileSync(join(root, receipt), 'somebody else owns this\n');
    const outcome = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main', receipt },
      processMigrationDependencies(root),
    );
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('already exists');
    expect(readFileSync(join(root, receipt), 'utf-8')).toBe('somebody else owns this\n');
    expect(readFileSync(join(root, SPRINT_PATH), 'utf-8')).toBe(V1_SPRINT);
  });

  test('the receipt digests are taken from the bytes on disk', () => {
    const root = repoFixture(V1_SPRINT, legacyCarrier());
    expect(migrateSprintSchemaCommand({ sprint: SPRINT_PATH, targetRef: 'main' }, processMigrationDependencies(root)).exitCode).toBe(0);
    const receipt = JSON.parse(readFileSync(join(root, defaultMigrationReceiptPath(SPRINT_PATH)), 'utf-8'));
    expect(receipt.sprint_sha256_after).toBe(sha256(readFileSync(join(root, SPRINT_PATH), 'utf-8')));
    expect(receipt.work_graph_sha256_after).toBe(sha256(readFileSync(join(root, CARRIER_PATH), 'utf-8')));
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

/**
 * The atomicity invariant as one test face rather than per-branch patches.
 *
 * The migration's contract is a single sentence -- "a failure means the bytes
 * did not move" -- so it is verified by failing every filesystem step in turn
 * and asserting the same three facts each time: sprint bytes unchanged, carrier
 * bytes unchanged, no receipt. A per-branch review can miss a new write added
 * outside the rollback boundary; this matrix cannot, because a new step that is
 * not rolled back shows up as a new red row.
 */
describe('migrate-schema atomicity matrix: every filesystem step fails in turn', () => {
  interface Injection {
    readonly name: string;
    /** Wrap the real filesystem so exactly one step throws. */
    readonly wrap: (real: MigrationFileSystem, paths: { sprint: string; carrier: string; receipt: string }) => MigrationFileSystem;
  }

  const failingWrite = (target: string) => (real: MigrationFileSystem): MigrationFileSystem => ({
    ...real,
    writeText: (path, text) => {
      if (path === target) throw new Error(`injected write failure: ${path}`);
      real.writeText(path, text);
    },
    // The receipt lands through `createExclusive`, so a write injection has to
    // cover both doors or the row would pass without firing.
    createExclusive: (path, text) => {
      if (path === target) throw new Error(`injected write failure: ${path}`);
      real.createExclusive(path, text);
    },
  });

  /**
   * Fail the first read of `target` that happens after `target` was written.
   * That is precisely the post-write proof step, and it stays correct however
   * many times the rollback journal reads the file beforehand to record its
   * prior bytes.
   */
  const failingReadAfterWrite = (target: string) => (real: MigrationFileSystem): MigrationFileSystem => {
    let written = false;
    return {
      ...real,
      writeText: (path, text) => {
        real.writeText(path, text);
        if (path === target) written = true;
      },
      readText: (path) => {
        if (path === target && written) throw new Error(`injected post-write read failure: ${path}`);
        return real.readText(path);
      },
    };
  };

  const injections: readonly Injection[] = [
    {
      name: 'the sprint write fails',
      wrap: (real, paths) => failingWrite(paths.sprint)(real),
    },
    {
      name: 'the carrier write fails after the sprint was already written',
      wrap: (real, paths) => failingWrite(paths.carrier)(real),
    },
    {
      // Keyed on "after this path was written", not on a read count: the
      // rollback journal reads a file to record its prior bytes, so counting
      // reads would fire during the write instead of during the proof.
      name: 'the post-write sprint re-read fails',
      wrap: (real, paths) => failingReadAfterWrite(paths.sprint)(real),
    },
    {
      name: 'the post-write carrier re-read fails',
      wrap: (real, paths) => failingReadAfterWrite(paths.carrier)(real),
    },
    {
      name: 'the receipt write fails',
      wrap: (real, paths) => failingWrite(paths.receipt)(real),
    },
    {
      name: 'the receipt directory cannot be created',
      wrap: (real) => ({
        ...real,
        makeDirectory: () => { throw new Error('injected mkdir failure'); },
      }),
    },
  ];

  for (const injection of injections) {
    test(`${injection.name}: sprint, carrier and receipt are exactly as before`, () => {
      const root = repoFixture(V1_SPRINT, legacyCarrier());
      const sprintAbsolute = join(root, SPRINT_PATH);
      const carrierAbsolute = join(root, CARRIER_PATH);
      const receiptAbsolute = join(root, defaultMigrationReceiptPath(SPRINT_PATH));
      const sprintBefore = readFileSync(sprintAbsolute, 'utf-8');
      const carrierBefore = readFileSync(carrierAbsolute, 'utf-8');

      const real = processMigrationDependencies(root);
      const deps = {
        ...real,
        fs: injection.wrap(real.fs, {
          sprint: sprintAbsolute,
          carrier: carrierAbsolute,
          receipt: receiptAbsolute,
        }),
      };

      // Either a typed refusal or a propagated throw is acceptable; leaving the
      // tree half migrated is not. The call is captured rather than asserted
      // inside a `catch`, because a `catch` around the assertions would swallow
      // the assertion failure itself and let an injection that never fired pass
      // as if it had.
      let outcome: CommandOutcome | null = null;
      let thrown: unknown = null;
      try {
        outcome = migrateSprintSchemaCommand({ sprint: SPRINT_PATH, targetRef: 'main' }, deps);
      } catch (error) {
        thrown = error;
      }
      expect(thrown !== null || (outcome !== null && outcome.exitCode !== 0)).toBe(true);

      expect(readFileSync(sprintAbsolute, 'utf-8')).toBe(sprintBefore);
      expect(readFileSync(carrierAbsolute, 'utf-8')).toBe(carrierBefore);
      expect(existsSync(receiptAbsolute)).toBe(false);
    });
  }

  test('a receipt directory this run created is removed when the run rolls back', () => {
    const root = repoFixture(V1_SPRINT, legacyCarrier());
    const receipt = 'plans/receipts/nested/migration.json';
    const receiptAbsolute = join(root, receipt);
    const createdDirectory = join(root, 'plans/receipts');
    expect(existsSync(createdDirectory)).toBe(false);

    const real = processMigrationDependencies(root);
    const deps = {
      ...real,
      fs: {
        ...real.fs,
        writeText: (path: string, text: string) => {
          if (path === receiptAbsolute) throw new Error('injected receipt write failure');
          real.fs.writeText(path, text);
        },
        createExclusive: (path: string, text: string) => {
          if (path === receiptAbsolute) throw new Error('injected receipt write failure');
          real.fs.createExclusive(path, text);
        },
      },
    };
    expect(() => migrateSprintSchemaCommand({ sprint: SPRINT_PATH, targetRef: 'main', receipt }, deps))
      .toThrow('injected receipt write failure');
    // Both levels the run created are gone: a rolled-back migration leaves no
    // trace at all, not even an empty directory.
    expect(existsSync(createdDirectory)).toBe(false);
    expect(existsSync(join(root, 'plans/receipts/nested'))).toBe(false);
    expect(existsSync(receiptAbsolute)).toBe(false);
    // The directory the sprint already lived in is untouched.
    expect(existsSync(join(root, 'plans/sprints'))).toBe(true);
  });

  test('the same fixture migrates cleanly when nothing is injected', () => {
    const root = repoFixture(V1_SPRINT, legacyCarrier());
    const outcome = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main' },
      processMigrationDependencies(root),
    );
    expect(outcome.stderr).toBe('');
    expect(outcome.exitCode).toBe(0);
    expect(existsSync(join(root, defaultMigrationReceiptPath(SPRINT_PATH)))).toBe(true);
  });
});

/**
 * The migration's preconditions and its write must be one coordination
 * boundary.
 *
 * Proving a live lease, the sprint bytes and the carrier bytes outside a lock
 * and then writing is two observations with a window between them: a
 * `complete-task` holding the shared backlog lock can flip a row to `[x]` in
 * that window, and the migration overwrites it with the state it read before.
 */
describe('migrate-schema is serialized against concurrent backlog writers', () => {
  /**
   * The migration runs in a second *process* so the exclusion under test is the
   * real filesystem lock rather than an in-process mock. The test process plays
   * `complete-task`: it holds the shared backlog lock, lets the child start and
   * block on it, edits the row, and only then releases. The child must re-prove
   * its preconditions after it finally gets the lock.
   */
  function migrationChildSource(root: string, signals: string): string {
    return [
      `import { writeFileSync } from 'fs';`,
      `import { migrateSprintSchemaCommand, processMigrationDependencies } from '${join(REPO_ROOT, 'src/effects/state/sprint-schema-migration')}';`,
      `writeFileSync(${JSON.stringify(join(signals, 'started'))}, 'go');`,
      `const outcome = migrateSprintSchemaCommand(`,
      `  { sprint: ${JSON.stringify(SPRINT_PATH)}, targetRef: 'main' },`,
      `  processMigrationDependencies(${JSON.stringify(root)}),`,
      `);`,
      `writeFileSync(${JSON.stringify(join(signals, 'outcome.json'))}, JSON.stringify(outcome));`,
    ].join('\n');
  }

  function waitForFile(path: string, label: string): void {
    const deadline = Date.now() + 30_000;
    while (!existsSync(path)) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
      Bun.sleepSync(10);
    }
  }

  test('a complete-task holding the backlog lock is not overwritten: the migration refuses', () => {
    const root = repoFixture(V1_SPRINT);
    const signals = join(root, '.signals');
    mkdirSync(signals, { recursive: true });
    const childPath = join(root, 'migration-child.ts');
    writeFileSync(childPath, migrationChildSource(root, signals));
    const sprintAbsolute = join(root, SPRINT_PATH);

    const child = spawn('bun', [childPath], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      // The backlog lock is the same one `sprint-backlog.sh complete-task`
      // takes, so holding it here is holding it against the real verb.
      withBacklogLock(root, () => {
        waitForFile(join(signals, 'started'), 'the migration child to start');
        // Give the child time to reach the lock and block on it.
        Bun.sleepSync(300);
        const before = readFileSync(sprintAbsolute, 'utf-8');
        const after = before.replace('| 2 | [ ] | second work package', '| 2 | [x] | second work package');
        expect(after).not.toBe(before);
        writeFileSync(sprintAbsolute, after);
      });

      waitForFile(join(signals, 'outcome.json'), 'the migration child to finish');
      const outcome = JSON.parse(readFileSync(join(signals, 'outcome.json'), 'utf-8')) as {
        exitCode: number;
        stderr: string;
      };

      // Exactly one won. The writer's edit survived, the migration refused
      // because it re-read the bytes under the lock, and there is no torn
      // half-migrated state and no receipt.
      expect(outcome.exitCode).toBe(1);
      expect(outcome.stderr).toContain('differs from main');
      const finalBytes = readFileSync(sprintAbsolute, 'utf-8');
      expect(finalBytes).toContain('| 2 | [x] | second work package');
      expect(finalBytes).not.toContain('Backlog Schema');
      expect(existsSync(join(root, defaultMigrationReceiptPath(SPRINT_PATH)))).toBe(false);
    } finally {
      child.kill();
    }
  }, 60_000);

  test('the lease proof, the re-read and the write all happen inside the locks', () => {
    // The invariant the two-process test cannot see from outside: every
    // precondition this command trusts is re-proved while the backlog lock and
    // the affected rows' task locks are held, so nothing it read can have moved
    // before it wrote.
    const root = repoFixture(V1_SPRINT);
    const events: string[] = [];
    const real = processMigrationDependencies(root);
    const sprintAbsolute = join(root, SPRINT_PATH);

    const outcome = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main' },
      {
        ...real,
        withBacklogLock: (cwd, run) => {
          events.push('backlog:enter');
          try {
            return real.withBacklogLock(cwd, run);
          } finally {
            events.push('backlog:exit');
          }
        },
        withTaskLock: (cwd, taskId, run) => {
          events.push(`task:enter:${taskId}`);
          try {
            return real.withTaskLock(cwd, taskId, run);
          } finally {
            events.push(`task:exit:${taskId}`);
          }
        },
        readLease: (cwd, taskId) => {
          events.push(`lease:${taskId}`);
          return real.readLease(cwd, taskId);
        },
        fs: {
          ...real.fs,
          writeText: (path, text) => {
            if (path === sprintAbsolute) events.push('write:sprint');
            real.fs.writeText(path, text);
          },
        },
      },
    );
    expect(outcome.stderr).toBe('');
    expect(outcome.exitCode).toBe(0);

    const backlogEnter = events.indexOf('backlog:enter');
    const backlogExit = events.indexOf('backlog:exit');
    const inside = (event: string) => {
      const at = events.indexOf(event);
      expect(at, `${event} is not inside the backlog lock`).toBeGreaterThan(backlogEnter);
      expect(at).toBeLessThan(backlogExit);
    };
    inside('write:sprint');
    for (const entry of events.filter((event) => event.startsWith('lease:'))) inside(entry);

    // Every affected row's task lock is held, and they are taken in a stable
    // sorted order so two callers cannot deadlock by pairing them differently.
    const taskEnters = events.filter((event) => event.startsWith('task:enter:'))
      .map((event) => event.slice('task:enter:'.length));
    expect(taskEnters.length).toBe(2);
    expect(taskEnters).toEqual([...taskEnters].sort());
    for (const taskId of taskEnters) inside(`task:enter:${taskId}`);
    for (const taskId of taskEnters) inside(`lease:${taskId}`);
  }, 60_000);

  test('two migrations racing for one receipt: the loser rolls back and leaves the winner alone', () => {
    const root = repoFixture(V1_SPRINT);
    const real = processMigrationDependencies(root);
    const receiptAbsolute = join(root, defaultMigrationReceiptPath(SPRINT_PATH));
    const sprintBefore = readFileSync(join(root, SPRINT_PATH), 'utf-8');

    // The competitor lands its receipt in the window between this run's
    // `exists` check and its own create, which is exactly what a check-then-
    // write cannot survive.
    const outcome = migrateSprintSchemaCommand(
      { sprint: SPRINT_PATH, targetRef: 'main' },
      {
        ...real,
        fs: {
          ...real.fs,
          createExclusive: (path, text) => {
            if (path === receiptAbsolute) real.fs.writeText(path, 'a competitor got here first\n');
            real.fs.createExclusive(path, text);
          },
        },
      },
    );

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('created by another run');
    // The competitor's bytes are untouched, and this run's writes are undone.
    expect(readFileSync(receiptAbsolute, 'utf-8')).toBe('a competitor got here first\n');
    expect(readFileSync(join(root, SPRINT_PATH), 'utf-8')).toBe(sprintBefore);
  });
});
