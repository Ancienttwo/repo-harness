/**
 * The one-shot sprint backlog schema 1 -> 2 migration verb.
 *
 * It is a migration, not a repair loop: it reads one canonical sprint at one
 * ref, derives every row's existing schema 1 identity, refuses anything it
 * cannot prove, writes the sprint and the same-commit Work Graph carrier, then
 * re-reads what it wrote and proves each persisted id equals the identity the
 * row already had. Any refusal leaves both files untouched.
 *
 * The order of the gates matters. Lease refusal comes before any write because
 * the contract forbids the migration from silently stealing, releasing, or
 * rewriting a live lease; the re-read proof comes after the write because a
 * proof over the in-memory string would only restate the rewrite, not verify
 * the bytes that landed.
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { CommandOutcome } from '../../core/state/command-outcome';
import { projectCanonicalTasks } from '../../core/state/coordination-identity';
import {
  EngineerSchedulingError,
  projectWorkGraph,
  schedulingCarrierPath,
  validateWorkGraph,
} from '../../core/engineers/scheduling';
import { SprintSchemaError, sprintBacklogSchema } from '../../core/state/sprint-backlog-rows';
import { readLegacySprint } from '../../core/state/sprint-schema-v1';
import {
  SPRINT_SCHEMA_MIGRATION_KIND,
  SPRINT_SCHEMA_MIGRATION_PROTOCOL,
  SprintSchemaMigrationError,
  rewriteSprintToSchemaV2,
  rewriteWorkGraphToTaskId,
  type MigratedRowV1,
  type SprintSchemaMigrationReceiptV1,
} from '../../core/state/sprint-schema-migration';
import {
  readCanonicalFileAtCommit,
  readCanonicalSprint,
  resolveRepoIdentity,
} from './coordination-canonical-source';
import { repoPath } from './collect-state-inputs';
import { readLease } from './coordination-lease-store';

export interface MigrateSprintSchemaOptions {
  /** Repo-relative canonical sprint path. */
  readonly sprint: string;
  /** Ref the schema 1 bytes and every derived identity are read from. */
  readonly targetRef: string;
  /** Repo-relative receipt path; defaults next to the sprint. */
  readonly receipt?: string;
}

/**
 * Every filesystem touch the migration makes, in one injectable record.
 *
 * The migration's whole contract is "a failure means the bytes did not move",
 * and the only honest way to hold it is to make each individual write and read
 * fail on demand. `tests/unit/sprint-schema-migrate.test.ts` runs that matrix.
 */
export interface MigrationFileSystem {
  readonly exists: (absolutePath: string) => boolean;
  readonly readText: (absolutePath: string) => string;
  readonly writeText: (absolutePath: string, text: string) => void;
  readonly makeDirectory: (absolutePath: string) => void;
  readonly removeFile: (absolutePath: string) => void;
}

export const nodeMigrationFileSystem: MigrationFileSystem = Object.freeze({
  exists: (absolutePath: string) => existsSync(absolutePath),
  readText: (absolutePath: string) => readFileSync(absolutePath, 'utf-8'),
  writeText: (absolutePath: string, text: string) => { writeFileSync(absolutePath, text, 'utf-8'); },
  makeDirectory: (absolutePath: string) => { mkdirSync(absolutePath, { recursive: true }); },
  removeFile: (absolutePath: string) => { rmSync(absolutePath, { force: true }); },
});

export interface MigrateSprintSchemaDependencies {
  readonly repoRoot: string;
  readonly fs: MigrationFileSystem;
  readonly repoIdentity: (cwd: string) => string;
  readonly readCanonicalSprint: typeof readCanonicalSprint;
  /** The Work Graph carrier must be compared against the canonical commit too. */
  readonly readFileAtCommit: typeof readCanonicalFileAtCommit;
  readonly readLease: typeof readLease;
  /**
   * The pure rewrite, injected like every other collaborator. It is the only
   * seam a test can use to force a *post-write* validation failure, which is
   * the one path where "refuse" has to also mean "undo"; nothing else in the
   * command can produce bytes that pass the rewrite and then fail the re-read
   * proof.
   */
  readonly rewriteSprint: typeof rewriteSprintToSchemaV2;
  readonly rewriteWorkGraph: typeof rewriteWorkGraphToTaskId;
}

export function processMigrationDependencies(repoRoot: string): MigrateSprintSchemaDependencies {
  return {
    repoRoot,
    repoIdentity: resolveRepoIdentity,
    readCanonicalSprint,
    readFileAtCommit: readCanonicalFileAtCommit,
    readLease,
    rewriteSprint: rewriteSprintToSchemaV2,
    rewriteWorkGraph: rewriteWorkGraphToTaskId,
    fs: nodeMigrationFileSystem,
  };
}

function sha256(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf-8').digest('hex')}`;
}

function refuse(message: string): CommandOutcome {
  return { exitCode: 1, stdout: '', stderr: `sprint migrate-schema: ${message}\n` };
}

/** Receipt path convention: `<sprint stem>.schema-migration.v1.json`. */
export function defaultMigrationReceiptPath(sprintPath: string): string {
  if (!sprintPath.endsWith('.sprint.md')) {
    throw new SprintSchemaMigrationError(`canonical sprint path must end in .sprint.md: ${sprintPath}`);
  }
  return `${sprintPath.slice(0, -'.sprint.md'.length)}.schema-migration.v1.json`;
}

export function migrateSprintSchemaCommand(
  options: MigrateSprintSchemaOptions,
  deps: MigrateSprintSchemaDependencies,
): CommandOutcome {
  const { repoRoot } = deps;
  const sprintPath = options.sprint;

  const canonical = deps.readCanonicalSprint(repoRoot, {
    targetRef: options.targetRef,
    sprintPath,
  });
  if (!canonical.ok) return refuse(canonical.error);

  // The receipt target is resolved and refused *before* anything is written, so
  // the rollback below never has to decide whether a pre-existing file was its
  // own. `repoPath` is the same containment check every other state write uses.
  const receiptPath = options.receipt ?? defaultMigrationReceiptPath(sprintPath);
  let receiptAbsolute: string;
  try {
    receiptAbsolute = repoPath(repoRoot, receiptPath);
  } catch (error) {
    return refuse(`migration receipt path is not a safe repo-relative path: ${receiptPath}`);
  }
  if (deps.fs.exists(receiptAbsolute)) {
    return refuse(`migration receipt ${receiptPath} already exists; this migration is one-shot and will not overwrite it`);
  }

  const worktreeSprint = join(repoRoot, sprintPath);
  if (!deps.fs.exists(worktreeSprint)) {
    return refuse(`canonical sprint ${sprintPath} is absent from the working tree`);
  }
  const beforeBytes = deps.fs.readText(worktreeSprint);
  // The ids are derived from the canonical bytes but written into the working
  // tree file. If those differ, the migration would persist identities that do
  // not belong to the text it is editing.
  if (beforeBytes !== canonical.text) {
    return refuse(
      `working tree ${sprintPath} differs from ${options.targetRef} (${canonical.commit}); commit or reset it before migrating`,
    );
  }

  const legacy = readLegacySprint({
    repoIdentity: deps.repoIdentity(repoRoot),
    sprintPath,
    sprintText: canonical.text,
  });
  if (!legacy.ok) return refuse(legacy.error);

  const held = legacy.rows
    .map((entry) => ({ entry, lease: deps.readLease(repoRoot, entry.legacy_task_id) }))
    .filter(({ lease }) => lease.classification !== 'available'
      && !(lease.record !== null && lease.record.state === 'released'));
  if (held.length > 0) {
    return refuse([
      `${held.length} backlog row(s) still hold a non-released lease; release or reconcile them before migrating:`,
      ...held.map(({ entry, lease }) => `  row ${entry.row.index} task_id=${entry.legacy_task_id} lease=${lease.classification}`),
    ].join('\n'));
  }

  const idsByRowIndex = new Map(legacy.rows.map((entry) => [entry.row.index, entry.legacy_task_id]));
  const idsByTaskCell = new Map(legacy.rows.map((entry) => [entry.row.task, entry.legacy_task_id]));

  let afterBytes: string;
  try {
    afterBytes = deps.rewriteSprint({ sprintText: canonical.text, idsByRowIndex });
  } catch (error) {
    if (error instanceof SprintSchemaMigrationError) return refuse(error.message);
    throw error;
  }

  // The carrier is a sibling of the sprint on the same commit, so it is read
  // there and the working tree must match it exactly -- the same rule the
  // sprint itself obeys. A dirty, deleted, or stale carrier would otherwise be
  // migrated into a receipt that claims to bind this commit's bytes.
  const carrierPath = schedulingCarrierPath(sprintPath);
  const worktreeCarrier = join(repoRoot, carrierPath);
  const committedCarrier = deps.readFileAtCommit(repoRoot, canonical.commit, carrierPath);
  const carrierInWorktree = deps.fs.exists(worktreeCarrier);
  if (committedCarrier === null && carrierInWorktree) {
    return refuse(`work graph ${carrierPath} exists in the working tree but not at ${options.targetRef} (${canonical.commit})`);
  }
  if (committedCarrier !== null && !carrierInWorktree) {
    return refuse(`work graph ${carrierPath} exists at ${options.targetRef} (${canonical.commit}) but not in the working tree`);
  }
  let carrierBefore: string | null = null;
  let carrierAfter: string | null = null;
  if (committedCarrier !== null) {
    carrierBefore = deps.fs.readText(worktreeCarrier);
    if (carrierBefore !== committedCarrier) {
      return refuse(
        `working tree ${carrierPath} differs from ${options.targetRef} (${canonical.commit}); commit or reset it before migrating`,
      );
    }
    try {
      carrierAfter = deps.rewriteWorkGraph({
        workGraphText: carrierBefore,
        idsByTaskCell,
        workGraphPath: carrierPath,
        sprintPath,
      });
    } catch (error) {
      if (error instanceof SprintSchemaMigrationError) return refuse(error.message);
      throw error;
    }
    // Prove the migrated carrier is a Work Graph the runtime accepts, and that
    // it still joins onto the migrated sprint, before it reaches the disk. A
    // carrier that only fails later would fail far from its cause.
    try {
      const graph = validateWorkGraph(JSON.parse(carrierAfter));
      projectWorkGraph(graph, projectCanonicalTasks({
        repoIdentity: deps.repoIdentity(repoRoot),
        sprintPath,
        sprintText: afterBytes,
      }).map((task, index) => ({
        task_id: task.task_id,
        task_revision: task.task_revision,
        task_ref: task.row.task,
        status: task.row.status,
        row_order: index + 1,
      })));
    } catch (error) {
      if (error instanceof EngineerSchedulingError || error instanceof SprintSchemaError) {
        return refuse(`migrated work graph ${carrierPath} is not a valid Work Graph for ${sprintPath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Every file this run touches, recorded with the bytes it had first. `null`
   * means the file did not exist, so the rollback removes it instead of
   * inventing content -- which is also why the receipt target is refused above
   * when it already exists: rollback then never deletes somebody else's file.
   */
  const touched: { readonly path: string; readonly before: string | null }[] = [];
  const writeTracked = (absolutePath: string, text: string): void => {
    touched.push({
      path: absolutePath,
      before: deps.fs.exists(absolutePath) ? deps.fs.readText(absolutePath) : null,
    });
    deps.fs.writeText(absolutePath, text);
  };
  /**
   * Every entry is attempted, and only then is a failure raised. Stopping at
   * the first unrestorable file would leave the *others* migrated: the case
   * that motivates this -- a carrier whose write failed because the path is
   * unwritable -- is exactly the case where the sprint next to it can and must
   * still be put back.
   */
  const restoreWrittenFiles = (): void => {
    const failures: string[] = [];
    for (const entry of [...touched].reverse()) {
      try {
        if (entry.before === null) deps.fs.removeFile(entry.path);
        else deps.fs.writeText(entry.path, entry.before);
      } catch (error) {
        failures.push(`${entry.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`could not restore ${failures.length} file(s): ${failures.join('; ')}`);
    }
  };
  /** A refusal must always mean "the files are exactly as they were". */
  const restoreAndRefuse = (message: string): CommandOutcome => {
    restoreWrittenFiles();
    return refuse(message);
  };

  try {
    writeTracked(worktreeSprint, afterBytes);
    if (carrierAfter !== null) writeTracked(worktreeCarrier, carrierAfter);

    // Re-read proof over the bytes that actually landed.
    const reread = deps.fs.readText(worktreeSprint);
    if (reread !== afterBytes) {
      return restoreAndRefuse(`migrated ${sprintPath} does not match the bytes just written`);
    }
    if (sprintBacklogSchema(reread) !== 2) {
      return restoreAndRefuse(`migrated ${sprintPath} does not declare backlog schema 2`);
    }
    const rereadCarrier = carrierAfter === null ? null : deps.fs.readText(worktreeCarrier);
    if (rereadCarrier !== carrierAfter) {
      return restoreAndRefuse(`migrated work graph ${carrierPath} does not match the bytes just written`);
    }
    let migrated;
    try {
      migrated = projectCanonicalTasks({
        repoIdentity: deps.repoIdentity(repoRoot),
        sprintPath,
        sprintText: reread,
      });
    } catch (error) {
      if (error instanceof SprintSchemaError) {
        return restoreAndRefuse(`migrated ${sprintPath} fails schema 2 validation: ${error.message}`);
      }
      throw error;
    }
    if (migrated.length !== legacy.rows.length) {
      return restoreAndRefuse(`migrated ${sprintPath} has ${migrated.length} rows but schema 1 had ${legacy.rows.length}`);
    }
    const tasks: MigratedRowV1[] = [];
    for (let index = 0; index < migrated.length; index += 1) {
      const before = legacy.rows[index];
      const after = migrated[index];
      if (after.task_id !== before.legacy_task_id) {
        return restoreAndRefuse(
          `migrated row ${after.row.index} has task id ${after.task_id} but its schema 1 identity was ${before.legacy_task_id}`,
        );
      }
      if (after.row.task !== before.row.task) {
        return restoreAndRefuse(`migrated row ${after.row.index} Task cell changed during the rewrite`);
      }
      tasks.push({ row_index: after.row.index, task_id: after.task_id, task_cell: after.row.task });
    }

    // Every "after" digest is taken from the bytes just re-read off disk, not
    // from the in-memory rewrite: a receipt that hashed the intention rather
    // than the result would prove nothing about the file it names.
    const receipt: SprintSchemaMigrationReceiptV1 = {
      protocol: SPRINT_SCHEMA_MIGRATION_PROTOCOL,
      kind: SPRINT_SCHEMA_MIGRATION_KIND,
      from_schema: 1,
      to_schema: 2,
      sprint_path: sprintPath,
      target_ref: options.targetRef,
      target_commit: canonical.commit,
      sprint_sha256_before: sha256(beforeBytes),
      sprint_sha256_after: sha256(reread),
      work_graph_path: carrierBefore === null ? null : carrierPath,
      work_graph_sha256_before: carrierBefore === null ? null : sha256(carrierBefore),
      work_graph_sha256_after: rereadCarrier === null ? null : sha256(rereadCarrier),
      tasks: Object.freeze(tasks),
    };

    deps.fs.makeDirectory(dirname(receiptAbsolute));
    writeTracked(receiptAbsolute, `${JSON.stringify(receipt, null, 2)}\n`);

    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ ok: true, receipt_path: receiptPath, receipt })}\n`,
      stderr: '',
    };
  } catch (error) {
    // An unexpected throw is not a licence to leave the tree half migrated.
    // The restore runs in its own try so that a restore failure surfaces
    // instead of being swallowed, and so that it names the original cause
    // rather than replacing it silently.
    try {
      restoreWrittenFiles();
    } catch (restoreError) {
      throw new Error(
        `sprint migrate-schema failed and could not restore ${sprintPath}: `
        + `${restoreError instanceof Error ? restoreError.message : String(restoreError)} `
        + `(original failure: ${error instanceof Error ? error.message : String(error)})`,
        { cause: error },
      );
    }
    throw error;
  }
}
