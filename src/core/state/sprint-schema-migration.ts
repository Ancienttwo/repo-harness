/**
 * Pure rendering half of the one-shot sprint backlog schema 1 -> 2 migration.
 *
 * The effect half (`src/effects/state/sprint-schema-migration.ts`) owns git,
 * the filesystem, and the lease plane; everything here is a total function over
 * text so the byte-for-byte rewrite can be golden-tested without a repo.
 *
 * The rewrite is deliberately narrow. It inserts one header line, replaces the
 * backlog table header and separator, and prefixes each row with its already
 * existing identity. Nothing else in the file is touched: a migration that
 * reflowed prose or normalised unrelated tables could not be proved byte-safe.
 */
import {
  BACKLOG_TABLE_HEADER,
  BACKLOG_TABLE_SEPARATOR,
  SPRINT_BACKLOG_SCHEMA_HEADER,
  SPRINT_BACKLOG_SCHEMA_V1,
  SPRINT_BACKLOG_SCHEMA_V2,
} from './sprint-backlog-rows';

/** Migration receipt protocol; independent of every other protocol constant. */
export const SPRINT_SCHEMA_MIGRATION_PROTOCOL = 1 as const;
export const SPRINT_SCHEMA_MIGRATION_KIND = 'repo-harness-sprint-schema-migration' as const;

export interface MigratedRowV1 {
  /** The row's `#` cell, unchanged by the migration. */
  readonly row_index: string;
  /** The identity the row already had under schema 1. */
  readonly task_id: string;
  /** The exact Task cell the schema 1 identity was derived from. */
  readonly task_cell: string;
}

export interface SprintSchemaMigrationReceiptV1 {
  readonly protocol: typeof SPRINT_SCHEMA_MIGRATION_PROTOCOL;
  readonly kind: typeof SPRINT_SCHEMA_MIGRATION_KIND;
  readonly from_schema: typeof SPRINT_BACKLOG_SCHEMA_V1;
  readonly to_schema: typeof SPRINT_BACKLOG_SCHEMA_V2;
  readonly sprint_path: string;
  readonly target_ref: string;
  /** The commit the schema 1 bytes and every derived id were read from. */
  readonly target_commit: string;
  readonly sprint_sha256_before: string;
  readonly sprint_sha256_after: string;
  readonly work_graph_path: string | null;
  readonly work_graph_sha256_before: string | null;
  readonly work_graph_sha256_after: string | null;
  readonly tasks: readonly MigratedRowV1[];
}

export class SprintSchemaMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SprintSchemaMigrationError';
  }
}

const BACKLOG_HEADING = /^## Backlog[ \t]*$/;
const HEADER_FIELD = /^>[ \t]*\*\*[^*]+\*\*:/;
const ROW = /^\|[ \t]*([0-9]+)[ \t]*\|/;
const SEPARATOR = /^\|[ \t]*:?-{2,}/;

export interface RewriteSprintInput {
  readonly sprintText: string;
  /** Row index cell -> persisted id, in file order. */
  readonly idsByRowIndex: ReadonlyMap<string, string>;
}

/**
 * Schema 1 sprint bytes rewritten as schema 2.
 *
 * Line endings are preserved per line rather than normalised: a CRLF sprint
 * must round-trip as CRLF, because the migration receipt binds the exact bytes
 * on both sides and a silent newline rewrite would make the "before" digest
 * unverifiable against the file it came from.
 */
export function rewriteSprintToSchemaV2(input: RewriteSprintInput): string {
  const lines = input.sprintText.split('\n');
  const out: string[] = [];
  let insertedHeader = false;
  let lastHeaderField = -1;
  let inBacklog = false;
  let tableHeaderSeen = false;
  let separatorSeen = false;

  for (let index = 0; index < lines.length; index += 1) {
    if (HEADER_FIELD.test(lines[index].replace(/\r$/, ''))) lastHeaderField = index;
    if (BACKLOG_HEADING.test(lines[index].replace(/\r$/, ''))) break;
  }
  if (lastHeaderField < 0) {
    throw new SprintSchemaMigrationError('sprint has no `> **Field**:` header block to declare the backlog schema in');
  }

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const eol = raw.endsWith('\r') ? '\r' : '';
    const line = eol ? raw.slice(0, -1) : raw;

    if (inBacklog && /^## /.test(line)) inBacklog = false;

    if (inBacklog && !tableHeaderSeen && line.trim() === BACKLOG_TABLE_HEADER[SPRINT_BACKLOG_SCHEMA_V1]) {
      out.push(`${BACKLOG_TABLE_HEADER[SPRINT_BACKLOG_SCHEMA_V2]}${eol}`);
      tableHeaderSeen = true;
      continue;
    }
    if (inBacklog && tableHeaderSeen && !separatorSeen && SEPARATOR.test(line)) {
      out.push(`${BACKLOG_TABLE_SEPARATOR[SPRINT_BACKLOG_SCHEMA_V2]}${eol}`);
      separatorSeen = true;
      continue;
    }
    const row = inBacklog ? ROW.exec(line) : null;
    if (row) {
      const id = input.idsByRowIndex.get(row[1]);
      if (id === undefined) {
        throw new SprintSchemaMigrationError(`backlog row ${row[1]} has no migrated task id`);
      }
      // The `#` cell keeps its original bytes, spacing included: the migration
      // inserts one cell and must not reformat the rest of the row.
      const secondPipe = line.indexOf('|', line.indexOf('|') + 1);
      out.push(`${line.slice(0, secondPipe + 1)} ${id} |${line.slice(secondPipe + 1)}${eol}`);
      continue;
    }

    out.push(raw);
    if (index === lastHeaderField && !insertedHeader) {
      out.push(`${SPRINT_BACKLOG_SCHEMA_HEADER}${eol}`);
      insertedHeader = true;
    }
    if (BACKLOG_HEADING.test(line)) inBacklog = true;
  }

  if (!tableHeaderSeen) {
    throw new SprintSchemaMigrationError(
      `sprint backlog table header is not the schema 1 header line: expected '${BACKLOG_TABLE_HEADER[SPRINT_BACKLOG_SCHEMA_V1]}'`,
    );
  }
  if (!separatorSeen) throw new SprintSchemaMigrationError('sprint backlog table has no separator row');
  return out.join('\n');
}

export interface RewriteWorkGraphInput {
  readonly workGraphText: string;
  /** Exact Task cell -> persisted id. */
  readonly idsByTaskCell: ReadonlyMap<string, string>;
  readonly workGraphPath: string;
}

/**
 * Replace every Work Package's `task_ref` join key with the persisted
 * `task_id`. Refuses a carrier whose `task_ref` does not name exactly one
 * canonical row: an ambiguous or absent mapping is the failure the migration
 * contract requires it to stop on, not something to guess through.
 */
export function rewriteWorkGraphToTaskId(input: RewriteWorkGraphInput): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.workGraphText);
  } catch {
    throw new SprintSchemaMigrationError(`work graph ${input.workGraphPath} is not valid JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SprintSchemaMigrationError(`work graph ${input.workGraphPath} is not a JSON object`);
  }
  const graph = parsed as Record<string, unknown>;
  const packages = graph.work_packages;
  if (!Array.isArray(packages)) {
    throw new SprintSchemaMigrationError(`work graph ${input.workGraphPath} has no work_packages array`);
  }
  const migrated = packages.map((entry, position) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new SprintSchemaMigrationError(`work graph ${input.workGraphPath} work_packages[${position}] is not an object`);
    }
    const item = entry as Record<string, unknown>;
    if ('task_id' in item) {
      throw new SprintSchemaMigrationError(`work graph ${input.workGraphPath} work_packages[${position}] already carries task_id`);
    }
    const ref = item.task_ref;
    if (typeof ref !== 'string') {
      throw new SprintSchemaMigrationError(`work graph ${input.workGraphPath} work_packages[${position}].task_ref is not a string`);
    }
    const id = input.idsByTaskCell.get(ref);
    if (id === undefined) {
      throw new SprintSchemaMigrationError(
        `work graph ${input.workGraphPath} work_packages[${position}].task_ref '${ref}' does not name a canonical Sprint row`,
      );
    }
    const { task_ref: _dropped, ...rest } = item;
    return { work_package_id: rest.work_package_id, task_id: id, ...rest };
  });
  return `${JSON.stringify({ ...graph, work_packages: migrated }, null, 2)}\n`;
}
