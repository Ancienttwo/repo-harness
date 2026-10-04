import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// These files own the real repository and Herdr integration paths.
export const integrationFiles = new Set([
  'tests/herdr-task-lifecycle.test.ts',
  'tests/sprint-claim-concurrency.test.ts',
  'tests/contract-worktree-closeout-journal.test.ts',
  'tests/continuation-conformance.test.ts',
]);

// Keep sensitive HOME cases and real process deadlines in the serial tail.
// init and global-runtime-init use per-file processes and unique fixture HOME paths.
// Port-literal tests already use port 0, browser URLs, or temporary config files.
export const serialFiles = new Set([
  'tests/herdr-task-lifecycle.test.ts',
  'tests/bounded-supervisor-audit.test.ts',
  'tests/cli/install.test.ts',
  'tests/cli/doctor.test.ts',
  'tests/cli/status.test.ts',
  'tests/cli/security.test.ts',
  'tests/cli/global-runtime.test.ts',
  'tests/run-skill-evals.test.ts',
]);

export function discoverTestFiles(root = process.cwd()): string[] {
  return [...new Bun.Glob('**/*.test.{ts,tsx}').scanSync({ cwd: resolve(root, 'tests'), onlyFiles: true })]
    .map(file => `tests/${file.replaceAll('\\', '/')}`).sort();
}

export function selectTestSuite(suite: string, files: readonly string[]): string[] {
  if (!['core', 'integration', 'full'].includes(suite)) throw Error('Suite must be core, integration, or full');
  if (new Set(files).size !== files.length) throw Error('Duplicate test file');
  if (files.some(file => !/^tests\/[\w/.-]+\.test\.tsx?$/.test(file) || file.split('/').includes('..'))) throw Error('Invalid test file');
  return files.filter(file => suite === 'full' || integrationFiles.has(file) === (suite === 'integration'));
}

export function scheduleTestFiles(files: readonly string[], durations: Readonly<Record<string, number>>): string[] {
  if (Object.values(durations).some(value => !Number.isFinite(value) || value < 0)) throw Error('Invalid recorded duration');
  // New files have no record yet. They run after measured files, by path.
  return [...files].sort((a, b) => (durations[b] ?? 0) - (durations[a] ?? 0) || a.localeCompare(b));
}

if (import.meta.main) {
  const [suite = 'full', ...selected] = process.argv.slice(2);
  const durations = JSON.parse(readFileSync(new URL('./test-file-durations.json', import.meta.url), 'utf8')).files;
  const files = selectTestSuite(suite, selected.length ? selected : discoverTestFiles());
  for (const file of scheduleTestFiles(files, durations)) console.log(`${serialFiles.has(file) ? 'serial' : 'parallel'}\t${file}`);
}
