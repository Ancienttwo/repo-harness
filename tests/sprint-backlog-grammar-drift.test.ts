/**
 * Drift check: `project-continuation-envelope.ts`'s `backlogRowStatuses` is a
 * projection of `scripts/sprint-backlog.sh`'s `backlog_rows` grammar, so the
 * repo rule requires a check binding it to that authority.
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

/** Status cells produced by the real bash/awk grammar. */
function bashRowStatuses(definition: string, fixturePath: string): string[] {
  const result = spawnSync('bash', ['-c', `${definition}\nbacklog_rows "$1"`, 'drift-check', fixturePath], {
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    throw new Error(`backlog_rows failed (${result.status}): ${result.stderr}`);
  }
  return result.stdout
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split('\t')[1] ?? '');
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
    test(`${name}: identical row statuses and counts`, () => {
      const path = join(FIXTURE_DIR, name);
      const bash = bashRowStatuses(definition, path);
      const ts = backlogRowStatuses(readFileSync(path, 'utf-8'));
      expect(ts.length).toBe(bash.length);
      expect(ts).toEqual(bash);
      // A fixture that parses to nothing on both sides would pass vacuously.
      expect(bash.length).toBeGreaterThan(0);
    });
  }

  test('the check has teeth: a one-sided grammar widening is caught', () => {
    // Scratch copy only -- the real script is never modified. Admitting dotted
    // indices on the bash side alone is exactly the drift this guard exists for.
    const widened = definition.replace('/^\\|[[:space:]]*[0-9]+[[:space:]]*\\|/', '/^\\|[[:space:]]*[0-9.]+[[:space:]]*\\|/');
    expect(widened).not.toBe(definition);
    const path = join(FIXTURE_DIR, '02-row-shapes.md');
    const drifted = bashRowStatuses(widened, path);
    const ts = backlogRowStatuses(readFileSync(path, 'utf-8'));
    expect(drifted.length).toBeGreaterThan(ts.length);
    expect(drifted).not.toEqual(ts);
  });
});
