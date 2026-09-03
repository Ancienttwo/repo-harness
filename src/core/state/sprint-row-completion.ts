/**
 * The pure half of completing one backlog row: sprint text in, sprint text out.
 *
 * This used to be an `awk` rewrite inside `sprint-backlog.sh`, which meant the
 * step that publishes "this task is done" lived on the other side of a process
 * boundary from the lease that authorises it. The effect
 * (`completeRowSprintCommand`) now owns the whole transaction and calls this
 * for the bytes, so the row flip, the lease release and the proof that they
 * belong together are one thing.
 *
 * The rewrite is deliberately narrow: one row's Status and Plan cells, the
 * `Updated` header, and one appended Execution Log line. It matches the target
 * row on index *and* persisted id, so a duplicate index can never flip a row
 * the caller did not resolve.
 */
import {
  BACKLOG_TABLE_HEADER,
  SPRINT_BACKLOG_SCHEMA_V2,
  backlogRowLines,
  backlogRows,
  renderBacklogRow,
  sprintBacklogSchema,
  type BacklogRow,
} from './sprint-backlog-rows';

export const COMPLETED_ROW_STATUS = '[x]';

export class SprintRowCompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SprintRowCompletionError';
  }
}

export interface CompleteBacklogRowInput {
  readonly sprintText: string;
  /** The row's `#` cell, as resolved by the caller. */
  readonly rowIndex: string;
  /** The row's persisted `ID` cell; empty for a schema 1 sprint. */
  readonly rowId: string;
  /** Replacement Plan cell, or `null` to keep the row's current one. */
  readonly planCell: string | null;
  /** `YYYY-MM-DD HH:MM`, local time, matching what the helper wrote before. */
  readonly timestamp: string;
}

export interface CompleteBacklogRowResult {
  readonly sprintText: string;
  readonly row: BacklogRow;
  /** The Plan cell the row ended up with, for the Execution Log line. */
  readonly planCell: string;
  readonly done: number;
  readonly total: number;
}

const EXECUTION_LOG_HEADING = /^## Execution Log[ \t]*$/;

/**
 * Flip one row to `[x]`, stamp `Updated`, and append the Execution Log line.
 *
 * Throws rather than returning a partial rewrite: a completion that could not
 * find its own row has lost track of what it is completing.
 */
export function completeBacklogRow(input: CompleteBacklogRowInput): CompleteBacklogRowResult {
  const schema = sprintBacklogSchema(input.sprintText);
  const rows = backlogRows(input.sprintText);
  const lines = backlogRowLines(input.sprintText);
  if (rows.length !== lines.length) {
    throw new SprintRowCompletionError('backlog rows do not project 1:1 onto their source lines');
  }
  const position = rows.findIndex((row) => row.index === input.rowIndex && row.id === input.rowId);
  if (position < 0) {
    throw new SprintRowCompletionError(
      `no backlog row matches index ${input.rowIndex} and id ${input.rowId || '(none)'}`,
    );
  }
  const target = rows[position]!;
  if (target.status === COMPLETED_ROW_STATUS) {
    throw new SprintRowCompletionError(`backlog row ${target.index} is already complete`);
  }
  const planCell = input.planCell ?? target.plan;
  const completed: BacklogRow = { ...target, status: COMPLETED_ROW_STATUS, plan: planCell };
  const targetLine = lines[position]!;

  const out: string[] = [];
  let rewritten = false;
  let executionLogSeen = false;
  for (const line of input.sprintText.split('\n')) {
    if (/^> \*\*Updated\*\*:/.test(line)) {
      out.push(`> **Updated**: ${input.timestamp}`);
      continue;
    }
    if (!rewritten && line === targetLine) {
      out.push(renderBacklogRow(schema, completed));
      rewritten = true;
      continue;
    }
    if (EXECUTION_LOG_HEADING.test(line)) executionLogSeen = true;
    out.push(line);
  }
  if (!rewritten) {
    throw new SprintRowCompletionError(
      `failed to rewrite backlog row ${target.index}; check the table for malformed cells`,
    );
  }

  // The trailing empty element of a text ending in a newline; the appends below
  // rebuild it so the file keeps exactly one trailing newline.
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  if (!executionLogSeen) {
    out.push('', '## Execution Log', '', '| When | Task | Plan | Result |', '|------|------|------|--------|');
  }
  out.push(`| ${input.timestamp} | ${target.task} | ${planCell || '(none)'} | done |`);

  const sprintText = `${out.join('\n')}\n`;
  const after = backlogRows(sprintText);
  const done = after.filter((row) => /^\[[xX]\]$/.test(row.status)).length;
  return { sprintText, row: completed, planCell, done, total: after.length };
}

/** The header line a sprint of this schema must carry, for error text. */
export function expectedBacklogHeader(sprintText: string): string {
  return BACKLOG_TABLE_HEADER[
    sprintBacklogSchema(sprintText) === SPRINT_BACKLOG_SCHEMA_V2
      ? SPRINT_BACKLOG_SCHEMA_V2
      : 1
  ];
}
