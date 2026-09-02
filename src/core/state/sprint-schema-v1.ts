/**
 * COMPATIBILITY SURFACE -- migration input only.
 *
 * This module is the single remaining implementation of the schema 1 task
 * identity derivation: `task_id = digest(protocol + repo identity + canonical
 * sprint path + exact Task cell text)`. It exists for exactly one reason, which
 * is to let `repo-harness sprint migrate-schema` write each row's *existing*
 * identity into the new persisted `ID` cell instead of inventing a new alias.
 *
 * It is deliberately NOT reachable from `projectCanonicalTasks`, from any
 * claim, offer, board, message, or binding path, or from the shell helper. A
 * schema 1 sprint fails closed everywhere else; there is no dual-read window
 * during which a live sprint can mint identity from its Task text.
 *
 * - Compatibility owner: the repo-harness coordination-identity maintainer,
 *   tracked as the `sprint-schema-v1-parser-removal` deferred-goal row in
 *   `tasks/todos.md`.
 * - Removal trigger: once every tracked sprint under `plans/sprints/` reports
 *   `Backlog Schema: 2` and no archived sprint needs re-activation, delete this
 *   module together with `sprint migrate-schema` and the schema 1 branches in
 *   `sprint-backlog-rows.ts` and `scripts/sprint-backlog.sh`.
 */
import {
  COORDINATION_PROTOCOL,
  identityDigest,
} from './coordination-identity';
import {
  SPRINT_BACKLOG_SCHEMA_V1,
  backlogRows,
  sprintBacklogSchema,
  type BacklogRow,
} from './sprint-backlog-rows';

/** The schema 1 `task_id` digest domain, byte-for-byte as it shipped. */
const LEGACY_TASK_ID_DOMAIN = 'repo-harness-task-id';

export interface LegacyTaskIdInput {
  /** Stable identity of the clone that owns the coordination plane. */
  readonly repoIdentity: string;
  /** Canonical repo-relative sprint path, as it exists on the target ref. */
  readonly sprintPath: string;
  /** The row's Task cell, verbatim and untransformed. */
  readonly taskCell: string;
}

/**
 * The identity a schema 1 row already had. The preimage must never change: its
 * output is what the migration persists, and any drift here would rename every
 * live task instead of preserving it.
 */
export function deriveLegacyTaskId(input: LegacyTaskIdInput): string {
  return identityDigest([
    LEGACY_TASK_ID_DOMAIN,
    String(COORDINATION_PROTOCOL),
    input.repoIdentity,
    input.sprintPath,
    input.taskCell,
  ]);
}

export interface LegacyCanonicalRow {
  readonly row: BacklogRow;
  readonly legacy_task_id: string;
}

export type LegacySprintRead =
  | { readonly ok: true; readonly rows: readonly LegacyCanonicalRow[] }
  | { readonly ok: false; readonly error: string };

export interface LegacySprintInput {
  readonly repoIdentity: string;
  readonly sprintPath: string;
  readonly sprintText: string;
}

/**
 * Every schema 1 row of one sprint with the identity it already has.
 *
 * Refuses a sprint that is not schema 1 (nothing to migrate), a row whose Task
 * cell is empty (no identity preimage), and duplicate Task cells. Duplicates
 * are the ambiguity the migration contract names: two rows sharing one Task
 * cell already share one derived id, so there is no mapping that preserves both
 * and the migration must not pick one.
 */
export function readLegacySprint(input: LegacySprintInput): LegacySprintRead {
  if (sprintBacklogSchema(input.sprintText) !== SPRINT_BACKLOG_SCHEMA_V1) {
    return { ok: false, error: `canonical sprint ${input.sprintPath} is not backlog schema 1` };
  }
  const rows = backlogRows(input.sprintText);
  if (rows.length === 0) {
    return { ok: false, error: `canonical sprint ${input.sprintPath} has no backlog rows to migrate` };
  }
  const seenTask = new Set<string>();
  const seenIndex = new Set<string>();
  const out: LegacyCanonicalRow[] = [];
  for (const row of rows) {
    if (row.task.length === 0) {
      return { ok: false, error: `backlog row ${row.index} in ${input.sprintPath} has an empty Task cell` };
    }
    if (seenTask.has(row.task)) {
      return {
        ok: false,
        error: `backlog rows in ${input.sprintPath} repeat the Task cell '${row.task}'; the schema 1 identity of both rows is the same value and the migration cannot preserve two identities from one`,
      };
    }
    if (seenIndex.has(row.index)) {
      return { ok: false, error: `backlog rows in ${input.sprintPath} repeat the index ${row.index}` };
    }
    seenTask.add(row.task);
    seenIndex.add(row.index);
    out.push({
      row,
      legacy_task_id: deriveLegacyTaskId({
        repoIdentity: input.repoIdentity,
        sprintPath: input.sprintPath,
        taskCell: row.task,
      }),
    });
  }
  return { ok: true, rows: Object.freeze(out) };
}
