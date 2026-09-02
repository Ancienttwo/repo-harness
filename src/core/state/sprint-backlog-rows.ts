/**
 * The sprint `## Backlog` row grammar, in exactly one place.
 *
 * `scripts/sprint-backlog.sh`'s `backlog_rows()` awk scan is the authority and
 * `tests/sprint-backlog-grammar-drift.test.ts` binds this projection to it.
 * Three consumers read rows through this module -- the continuation envelope
 * (status cells only), the session-context panel (status and task cells), and
 * the coordination identity derivation (id, task, mode, and acceptance cells)
 * -- so none re-implements the grammar.
 *
 * Cell extraction reproduces the awk field split exactly, including its known
 * behaviour on escaped pipes: `awk -F '|'` splits on every `|`, so a cell
 * containing `\|` is split there too. Matching that is the point; a "smarter"
 * split here would silently disagree with the script that owns the file.
 *
 * ## Schema versions
 *
 * Schema 1 rows are `| # | Status | Task | Mode | Acceptance | Plan |` and carry
 * no identity of their own: `task_id` used to be a digest of the Task cell, so a
 * title edit minted a new task. Schema 2 inserts one persisted `ID` cell --
 * `| # | ID | Status | Task | Mode | Acceptance | Plan |` -- which is the sole
 * task identity authority; the Task cell becomes display text again.
 *
 * The version is declared once, in the sprint header, as
 * `> **Backlog Schema**: 2`. It is read as a header field and never inferred
 * from the column count: a row that lost a cell must fail closed as a malformed
 * row, not silently reclassify the whole file as the other schema. Both this
 * module and the awk authority only look for the marker *before* the
 * `## Backlog` heading, so a stray marker inside or after the table cannot make
 * the two parsers disagree.
 */

/** Backlog schema without a persisted ID column; identity was derived. */
export const SPRINT_BACKLOG_SCHEMA_V1 = 1;
/** Backlog schema with the persisted `ID` column as identity authority. */
export const SPRINT_BACKLOG_SCHEMA_V2 = 2;

export type SprintBacklogSchema =
  | typeof SPRINT_BACKLOG_SCHEMA_V1
  | typeof SPRINT_BACKLOG_SCHEMA_V2;

/** The exact header line schema 2 sprints must carry. */
export const SPRINT_BACKLOG_SCHEMA_HEADER = '> **Backlog Schema**: 2';

/** Header table row each schema renders above the separator. */
export const BACKLOG_TABLE_HEADER: Readonly<Record<SprintBacklogSchema, string>> = Object.freeze({
  [SPRINT_BACKLOG_SCHEMA_V1]: '| # | Status | Task | Mode | Acceptance | Plan |',
  [SPRINT_BACKLOG_SCHEMA_V2]: '| # | ID | Status | Task | Mode | Acceptance | Plan |',
});

/** Separator row each schema renders under the header. */
export const BACKLOG_TABLE_SEPARATOR: Readonly<Record<SprintBacklogSchema, string>> = Object.freeze({
  [SPRINT_BACKLOG_SCHEMA_V1]: '|---|--------|------|------|------------|------|',
  [SPRINT_BACKLOG_SCHEMA_V2]: '|---|----|--------|------|------|------------|------|',
});

/** Raised when a sprint declares a backlog schema this build cannot read. */
export class SprintSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SprintSchemaError';
  }
}

const SCHEMA_MARKER = /^>[ \t]*\*\*Backlog Schema\*\*:[ \t]*(.*?)[ \t]*$/;
const BACKLOG_HEADING = /^## Backlog[ \t]*$/;

/**
 * The declared backlog schema. Absent marker means schema 1: every sprint
 * written before this contract existed is schema 1 and there is nothing else it
 * could be. Any other declared value fails closed rather than degrading to 1,
 * because a forward version this build cannot parse must not be read as the
 * oldest one it can.
 */
export function sprintBacklogSchema(sprintText: string): SprintBacklogSchema {
  for (const line of sprintText.split(/\r?\n/)) {
    if (BACKLOG_HEADING.test(line)) break;
    const match = SCHEMA_MARKER.exec(line);
    if (!match) continue;
    const declared = match[1];
    if (declared === String(SPRINT_BACKLOG_SCHEMA_V2)) return SPRINT_BACKLOG_SCHEMA_V2;
    if (declared === String(SPRINT_BACKLOG_SCHEMA_V1)) {
      throw new SprintSchemaError(
        'sprint declares "Backlog Schema: 1"; schema 1 is the absent-marker default and must not be declared',
      );
    }
    throw new SprintSchemaError(`sprint declares an unsupported backlog schema: ${declared || '(empty)'}`);
  }
  return SPRINT_BACKLOG_SCHEMA_V1;
}

/**
 * One backlog row's cells, trimmed, in file order. `id` is the empty string on
 * schema 1, where the column does not exist; no caller may treat that empty
 * string as an identity.
 */
export interface BacklogRow {
  readonly index: string;
  readonly id: string;
  readonly status: string;
  readonly task: string;
  readonly mode: string;
  readonly acceptance: string;
  readonly plan: string;
}

/**
 * Rows between `## Backlog` and the next `## ` heading whose first cell is a
 * bare integer index.
 *
 * - schema 1: `| <index> | <status> | <task> | <mode> | <acceptance> | <plan> |`
 * - schema 2: `| <index> | <id> | <status> | <task> | <mode> | <acceptance> | <plan> |`
 */
export function backlogRows(sprintText: string): BacklogRow[] {
  const schema = sprintBacklogSchema(sprintText);
  const rows: BacklogRow[] = [];
  let inSection = false;
  for (const line of sprintText.split(/\r?\n/)) {
    if (BACKLOG_HEADING.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (/^## /.test(line)) break;
    if (!/^\|[ \t]*[0-9]+[ \t]*\|/.test(line)) continue;
    const cells = line.split('|');
    const cell = (position: number): string => (cells[position] ?? '').trim();
    rows.push(schema === SPRINT_BACKLOG_SCHEMA_V2
      ? {
        index: cell(1),
        id: cell(2),
        status: cell(3),
        task: cell(4),
        mode: cell(5),
        acceptance: cell(6),
        plan: cell(7),
      }
      : {
        index: cell(1),
        id: '',
        status: cell(2),
        task: cell(3),
        mode: cell(4),
        acceptance: cell(5),
        plan: cell(6),
      });
  }
  return rows;
}

/** Render one row in its schema's column order. */
export function renderBacklogRow(schema: SprintBacklogSchema, row: BacklogRow): string {
  return schema === SPRINT_BACKLOG_SCHEMA_V2
    ? `| ${row.index} | ${row.id} | ${row.status} | ${row.task} | ${row.mode} | ${row.acceptance} | ${row.plan} |`
    : `| ${row.index} | ${row.status} | ${row.task} | ${row.mode} | ${row.acceptance} | ${row.plan} |`;
}
