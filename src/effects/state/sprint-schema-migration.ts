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
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import type { CommandOutcome } from '../../core/state/command-outcome';
import { projectCanonicalTasks } from '../../core/state/coordination-identity';
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
import { schedulingCarrierPath } from '../../core/engineers/scheduling';
import { readCanonicalSprint, resolveRepoIdentity } from './coordination-canonical-source';
import { readLease } from './coordination-lease-store';

export interface MigrateSprintSchemaOptions {
  /** Repo-relative canonical sprint path. */
  readonly sprint: string;
  /** Ref the schema 1 bytes and every derived identity are read from. */
  readonly targetRef: string;
  /** Repo-relative receipt path; defaults next to the sprint. */
  readonly receipt?: string;
}

export interface MigrateSprintSchemaDependencies {
  readonly repoRoot: string;
  readonly repoIdentity: (cwd: string) => string;
  readonly readCanonicalSprint: typeof readCanonicalSprint;
  readonly readLease: typeof readLease;
  /**
   * The pure rewrite, injected like every other collaborator. It is the only
   * seam a test can use to force a *post-write* validation failure, which is
   * the one path where "refuse" has to also mean "undo"; nothing else in the
   * command can produce bytes that pass the rewrite and then fail the re-read
   * proof.
   */
  readonly rewriteSprint: typeof rewriteSprintToSchemaV2;
}

export function processMigrationDependencies(repoRoot: string): MigrateSprintSchemaDependencies {
  return {
    repoRoot,
    repoIdentity: resolveRepoIdentity,
    readCanonicalSprint,
    readLease,
    rewriteSprint: rewriteSprintToSchemaV2,
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

  const worktreeSprint = join(repoRoot, sprintPath);
  if (!existsSync(worktreeSprint)) {
    return refuse(`canonical sprint ${sprintPath} is absent from the working tree`);
  }
  const beforeBytes = readFileSync(worktreeSprint, 'utf-8');
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

  const carrierPath = schedulingCarrierPath(sprintPath);
  const worktreeCarrier = join(repoRoot, carrierPath);
  const carrierExists = existsSync(worktreeCarrier);
  let carrierBefore: string | null = null;
  let carrierAfter: string | null = null;
  if (carrierExists) {
    carrierBefore = readFileSync(worktreeCarrier, 'utf-8');
    try {
      carrierAfter = rewriteWorkGraphToTaskId({
        workGraphText: carrierBefore,
        idsByTaskCell,
        workGraphPath: carrierPath,
      });
    } catch (error) {
      if (error instanceof SprintSchemaMigrationError) return refuse(error.message);
      throw error;
    }
  }

  writeFileSync(worktreeSprint, afterBytes, 'utf-8');
  if (carrierAfter !== null) writeFileSync(worktreeCarrier, carrierAfter, 'utf-8');

  const receiptPath = options.receipt ?? defaultMigrationReceiptPath(sprintPath);
  const receiptAbsolute = join(repoRoot, receiptPath);

  /**
   * Put the files back exactly as they were, and drop any receipt this call
   * created. Every gate past this point runs *after* the files changed, so a
   * failure that left them written would leave a half-migrated tree that reads
   * as authoritative: the sprint would declare schema 2 while the proof that
   * its ids are the pre-migration ids had just failed, or while no receipt
   * exists to bind the bytes.
   */
  const restoreWrittenFiles = (): void => {
    writeFileSync(worktreeSprint, beforeBytes, 'utf-8');
    if (carrierBefore !== null) writeFileSync(worktreeCarrier, carrierBefore, 'utf-8');
    rmSync(receiptAbsolute, { force: true });
  };

  /** A refusal must always mean "the files are exactly as they were". */
  const restoreAndRefuse = (message: string): CommandOutcome => {
    restoreWrittenFiles();
    return refuse(message);
  };

  try {
    // Re-read proof over the bytes that actually landed.
    const reread = readFileSync(worktreeSprint, 'utf-8');
    if (reread !== afterBytes) {
      return restoreAndRefuse(`migrated ${sprintPath} does not match the bytes just written`);
    }
    if (sprintBacklogSchema(reread) !== 2) {
      return restoreAndRefuse(`migrated ${sprintPath} does not declare backlog schema 2`);
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

    const receipt: SprintSchemaMigrationReceiptV1 = {
      protocol: SPRINT_SCHEMA_MIGRATION_PROTOCOL,
      kind: SPRINT_SCHEMA_MIGRATION_KIND,
      from_schema: 1,
      to_schema: 2,
      sprint_path: sprintPath,
      target_ref: options.targetRef,
      target_commit: canonical.commit,
      sprint_sha256_before: sha256(beforeBytes),
      sprint_sha256_after: sha256(afterBytes),
      work_graph_path: carrierExists ? carrierPath : null,
      work_graph_sha256_before: carrierBefore === null ? null : sha256(carrierBefore),
      work_graph_sha256_after: carrierAfter === null ? null : sha256(carrierAfter),
      tasks: Object.freeze(tasks),
    };

    mkdirSync(dirname(receiptAbsolute), { recursive: true });
    writeFileSync(receiptAbsolute, `${JSON.stringify(receipt, null, 2)}\n`, 'utf-8');

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
