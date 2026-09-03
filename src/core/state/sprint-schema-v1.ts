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
  backlogRowLines,
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
 * A schema 1 row is `| # | Status | Task | Mode | Acceptance | Plan |`, so
 * splitting the line on `|` yields eight fields: the empty string before the
 * leading pipe, six cells, and the empty string after the trailing pipe.
 *
 * The count is checked on the raw line rather than on `BacklogRow`, because
 * cell extraction silently substitutes the empty string for a column the row
 * does not have: a truncated row reads as a row with empty cells and would
 * still derive an id.
 */
const SCHEMA_V1_LINE_FIELDS = 8;

/** The cells a schema 1 row must fill before it can be given an identity. */
const REQUIRED_CELLS = ['status', 'task', 'mode', 'acceptance'] as const;

const STATUS_CELL = /^\[[ xX]\]$/;

function rowShapeError(line: string, row: BacklogRow, sprintPath: string): string | null {
  const fields = line.split('|').length;
  if (fields !== SCHEMA_V1_LINE_FIELDS) {
    return `backlog row ${row.index} in ${sprintPath} has ${fields - 2} cells, not the 6 a schema 1 row must have`;
  }
  for (const cell of REQUIRED_CELLS) {
    if (row[cell].length === 0) {
      return `backlog row ${row.index} in ${sprintPath} has an empty ${cell} cell`;
    }
  }
  if (!STATUS_CELL.test(row.status)) {
    return `backlog row ${row.index} in ${sprintPath} has an invalid status cell: ${row.status}`;
  }
  return null;
}

/**
 * Every schema 1 row of one sprint with the identity it already has.
 *
 * Refuses a sprint that is not schema 1 (nothing to migrate), any row that is
 * not the exact schema 1 shape, and duplicate Task cells. The shape check runs
 * before a single id is derived: a truncated row would otherwise be migrated
 * into a persisted identity derived from whatever text happened to land in the
 * Task position. Duplicates are the ambiguity the migration contract names: two
 * rows sharing one Task cell already share one derived id, so there is no
 * mapping that preserves both and the migration must not pick one.
 */
export function readLegacySprint(input: LegacySprintInput): LegacySprintRead {
  if (sprintBacklogSchema(input.sprintText) !== SPRINT_BACKLOG_SCHEMA_V1) {
    return { ok: false, error: `canonical sprint ${input.sprintPath} is not backlog schema 1` };
  }
  const rows = backlogRows(input.sprintText);
  const lines = backlogRowLines(input.sprintText);
  if (rows.length === 0) {
    return { ok: false, error: `canonical sprint ${input.sprintPath} has no backlog rows to migrate` };
  }
  if (rows.length !== lines.length) {
    return { ok: false, error: `canonical sprint ${input.sprintPath} backlog rows do not project 1:1 onto their source lines` };
  }
  const seenTask = new Set<string>();
  const seenIndex = new Set<string>();
  const out: LegacyCanonicalRow[] = [];
  for (const [position, row] of rows.entries()) {
    const shape = rowShapeError(lines[position], row, input.sprintPath);
    if (shape !== null) return { ok: false, error: shape };
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
