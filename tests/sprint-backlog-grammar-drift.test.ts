/**
 * Drift check: `sprint-backlog-rows.ts` is a projection of
 * `scripts/sprint-backlog.sh`'s `backlog_rows` grammar, so the repo rule
 * requires a check binding it to that authority.
 *
 * All six cells are compared, not just the status column. Every column is now
 * identity-bearing: `task_id` hashes the Task cell verbatim and `task_revision`
 * hashes Mode and Acceptance, so a cell-extraction disagreement no longer
 * shifts a checkbox, it mints a different lease key or falsely marks a live
 * claim drifted. `sprint-backlog-rows.ts` claims its split reproduces the awk
 * field split exactly, including on escaped pipes; this is what holds it to
 * that claim.
 *
 * Own file rather than an append to `continuation-envelope.test.ts`: that suite
 * is an end-to-end CLI/envelope test over a temp repo, while this one is a
 * two-parser differential over a static fixture corpus and shells out to bash.
 *
 * The bash side is never re-implemented here -- the awk is read out of the
 * live script at test time, so widening one grammar alone breaks the run.
 */
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { backlogRowStatuses } from '../src/core/state/project-continuation-envelope';
import { backlogRows, type BacklogRow } from '../src/core/state/sprint-backlog-rows';

const SCRIPT = join(import.meta.dir, '../scripts/sprint-backlog.sh');
const FIXTURE_DIR = join(import.meta.dir, 'fixtures/sprint-backlog-grammar');

/**
 * The live `backlog_rows` definition, lifted verbatim from the script. The
 * script cannot simply be sourced: it `cd`s, then dispatches on `$1` and exits.
 */
function liveBacklogRowsDefinition(): string {
  const script = readFileSync(SCRIPT, 'utf-8');
  const match = script.match(/^backlog_rows\(\) \{\n[\s\S]*?\n\}$/m);
  if (!match) {
    throw new Error(`backlog_rows() not found in ${SCRIPT}; the drift check cannot read the authority`);
  }
  return match[0];
}

/** Whole rows produced by the real bash/awk grammar, tab-separated as emitted. */
function bashRows(definition: string, fixturePath: string): string[] {
  const result = spawnSync('bash', ['-c', `${definition}\nbacklog_rows "$1"`, 'drift-check', fixturePath], {
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    throw new Error(`backlog_rows failed (${result.status}): ${result.stderr}`);
  }
  return result.stdout.split('\n').filter((line) => line.length > 0);
}

/** The projection in the same six-column, tab-separated shape the awk prints. */
function projectedRows(sprintText: string): string[] {
  return backlogRows(sprintText).map((row: BacklogRow) =>
    [row.index, row.status, row.task, row.mode, row.acceptance, row.plan].join('\t'));
}

const fixtures = readdirSync(FIXTURE_DIR)
  .filter((name) => name.endsWith('.md'))
  .sort();

describe('sprint backlog row grammar: bash authority vs TS projection', () => {
  const definition = liveBacklogRowsDefinition();

  test('the extracted definition is the live awk scan', () => {
    expect(definition).toContain("awk -F '|'");
    expect(definition).toContain('## Backlog');
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const name of fixtures) {
    test(`${name}: identical rows across all six columns`, () => {
      const path = join(FIXTURE_DIR, name);
      const text = readFileSync(path, 'utf-8');
      const bash = bashRows(definition, path);
      const ts = projectedRows(text);
      expect(ts.length).toBe(bash.length);
      expect(ts).toEqual(bash);
      // A fixture that parses to nothing on both sides would pass vacuously.
      expect(bash.length).toBeGreaterThan(0);

      // The status-only consumer stays bound to the same authority.
      expect(backlogRowStatuses(text)).toEqual(bash.map((row) => row.split('\t')[1] ?? ''));
    }, 30_000);
  }

  test('the check has teeth: a one-sided grammar widening is caught', () => {
    // Scratch copy only -- the real script is never modified. Admitting dotted
    // indices on the bash side alone is exactly the drift this guard exists for.
    const widened = definition.replace('/^\\|[[:space:]]*[0-9]+[[:space:]]*\\|/', '/^\\|[[:space:]]*[0-9.]+[[:space:]]*\\|/');
    expect(widened).not.toBe(definition);
    const path = join(FIXTURE_DIR, '02-row-shapes.md');
    const drifted = bashRows(widened, path);
    const ts = projectedRows(readFileSync(path, 'utf-8'));
    expect(drifted.length).toBeGreaterThan(ts.length);
    expect(drifted).not.toEqual(ts);
  }, 30_000);

  test('the check has teeth on the identity-bearing columns too', () => {
    // Trimming one cell differently is invisible to a status-only diff and
    // silently changes task_id: the same row would hash to two lease keys.
    const untrimmed = definition.replace(
      'for (i = 2; i <= 7; i++) {',
      'for (i = 2; i <= 3; i++) {',
    );
    expect(untrimmed).not.toBe(definition);
    const path = join(FIXTURE_DIR, '02-row-shapes.md');
    const drifted = bashRows(untrimmed, path);
    const ts = projectedRows(readFileSync(path, 'utf-8'));
    expect(drifted.length).toBe(ts.length);
    expect(drifted).not.toEqual(ts);
    // The status column alone still agrees, which is why it was not enough.
    expect(drifted.map((row) => row.split('\t')[1])).toEqual(ts.map((row) => row.split('\t')[1]));
  }, 30_000);
});
