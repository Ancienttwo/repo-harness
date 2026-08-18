/**
 * The sprint `## Backlog` row grammar, in exactly one place.
 *
 * `scripts/sprint-backlog.sh`'s `backlog_rows()` awk scan is the authority and
 * `tests/sprint-backlog-grammar-drift.test.ts` binds this projection to it.
 * Two consumers read rows through this module -- the continuation envelope
 * (status cells only) and the coordination identity derivation (task, mode,
 * and acceptance cells) -- so neither re-implements the grammar.
 *
 * Cell extraction reproduces the awk field split exactly, including its known
 * behaviour on escaped pipes: `awk -F '|'` splits on every `|`, so a cell
 * containing `\|` is split there too. Matching that is the point; a "smarter"
 * split here would silently disagree with the script that owns the file.
 */

/** One backlog row's six cells, trimmed, in file order. */
export interface BacklogRow {
  readonly index: string;
  readonly status: string;
  readonly task: string;
  readonly mode: string;
  readonly acceptance: string;
  readonly plan: string;
}

/**
 * Rows between `## Backlog` and the next `## ` heading whose first cell is a
 * bare integer index: `| <index> | <status> | <task> | <mode> | <acceptance> | <plan> |`.
 */
export function backlogRows(sprintText: string): BacklogRow[] {
  const rows: BacklogRow[] = [];
  let inSection = false;
  for (const line of sprintText.split(/\r?\n/)) {
    if (/^## Backlog[ \t]*$/.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (/^## /.test(line)) break;
    if (!/^\|[ \t]*[0-9]+[ \t]*\|/.test(line)) continue;
    const cells = line.split('|');
    const cell = (position: number): string => (cells[position] ?? '').trim();
    rows.push({
      index: cell(1),
      status: cell(2),
      task: cell(3),
      mode: cell(4),
      acceptance: cell(5),
      plan: cell(6),
    });
  }
  return rows;
}
