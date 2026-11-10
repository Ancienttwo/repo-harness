import { readFileSync, writeFileSync } from 'node:fs';
import { discoverTestFiles } from './select-test-suite';

/** Read one full-suite isolate log, either raw or from `gh run view --job <id> --log`. */
export function buildDurationTable(log: string, source: string, inventory: readonly string[]) {
  if (!source.trim()) throw Error('A measured source run is required');
  const measured = new Map<string, number>();
  let pending: string | undefined;
  for (const raw of log.split('\n')) {
    const line = raw.replace(/^.*\t\d{4}-\d{2}-\d{2}T[\d:.]+Z /, '').trimEnd();
    const header = /^\[ci\] test (tests\/[\w/.-]+\.test\.tsx?)$/.exec(line);
    if (header) {
      if (pending) throw Error(`Missing duration for ${pending}`);
      pending = header[1]!;
      if (pending.split('/').includes('..')) throw Error(`Invalid test file: ${pending}`);
      if (measured.has(pending)) throw Error(`Duplicate duration for ${pending}`);
      continue;
    }
    const summary = /^Ran \d+ tests? across 1 file\. \[(\d+(?:\.\d+)?)(ms|s)\]$/.exec(line);
    if (pending && summary) {
      const milliseconds = Number(summary[1]) * (summary[2] === 's' ? 1000 : 1);
      if (!Number.isFinite(milliseconds)) throw Error(`Invalid duration for ${pending}`);
      measured.set(pending, Math.round(milliseconds * 100) / 100);
      pending = undefined;
    }
  }
  if (pending) throw Error(`Missing duration for ${pending}`);
  if (!measured.size) throw Error('No per-file durations found');
  // A source run can predate test deletions. Do not keep those keys in the table.
  const files = Object.fromEntries([...inventory].sort()
    .filter(file => measured.has(file)).map(file => [file, measured.get(file)!]));
  if (!Object.keys(files).length) throw Error('No measured test files exist in the current inventory');
  return { source: `${source}; per-file Bun elapsed durations in milliseconds`, files };
}

if (import.meta.main) {
  const [logPath, source, ...extra] = process.argv.slice(2);
  if (!logPath || !source || extra.length) {
    throw Error('Usage: bun scripts/write-test-file-durations.ts <full-suite-log> <source-run>');
  }
  const inventory = discoverTestFiles();
  const table = buildDurationTable(readFileSync(logPath, 'utf8'), source, inventory);
  writeFileSync(new URL('./test-file-durations.json', import.meta.url), `${JSON.stringify(table, null, 2)}\n`);
  console.error(`Wrote ${Object.keys(table.files).length} measured test files`);
  const uncovered = inventory.filter(file => !Object.hasOwn(table.files, file));
  if (uncovered.length) console.error(`Not covered by the source run:\n${uncovered.join('\n')}`);
}
