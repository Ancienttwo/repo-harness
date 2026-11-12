import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TestFileResultV1 } from '../src/core/ci/test-report';

// These files own the real repository and Herdr integration paths.
export const integrationFiles = new Set([
  'tests/herdr-task-lifecycle.test.ts',
  'tests/contract-worktree-closeout-journal.test.ts',
  'tests/continuation-conformance.test.ts',
]);

// Keep sensitive HOME cases and real process deadlines in the serial tail.
// init and global-runtime-init use per-file processes and unique fixture HOME paths.
// Port-literal tests already use port 0, browser URLs, or temporary config files.
export const serialFiles = new Set([
  'tests/herdr-task-lifecycle.test.ts',
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

const TEST_PATH = /^tests\/[\w/.-]+\.test\.tsx?$/;
const validTestPath = (file: unknown): file is string => typeof file === 'string' && TEST_PATH.test(file) && !file.split('/').includes('..');

export function selectTestSuite(suite: string, files: readonly string[]): string[] {
  if (!['core', 'integration', 'full'].includes(suite)) throw Error('Suite must be core, integration, or full');
  if (new Set(files).size !== files.length) throw Error('Duplicate test file');
  if (!files.every(validTestPath)) throw Error('Invalid test file');
  return files.filter(file => suite === 'full' || integrationFiles.has(file) === (suite === 'integration'));
}

export type TestDurations = Readonly<Record<string, number>>;
export type ShardPlan = string[][];

/** Reads the daily duration cache that TEST_DURATIONS_FILE names. No variable or no restored file means no table. */
export function loadTestDurations(path = process.env.TEST_DURATIONS_FILE): TestDurations | null {
  if (!path || !existsSync(path)) return null;
  const files = JSON.parse(readFileSync(path, 'utf8'))?.files;
  if (typeof files !== 'object' || files === null || Array.isArray(files)) throw Error('Invalid test duration table');
  if (Object.entries(files).some(([file, value]) => !validTestPath(file) || typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw Error('Invalid recorded duration');
  return files;
}

/** Splits files into `total` disjoint shards, longest first onto the lightest shard. A file with no record weighs the
 * table median; with no table every file weighs the same, so shard sizes differ by at most one. Each shard is in run order.
 */
export function planShards(files: readonly string[], durations: TestDurations | null, total: number): ShardPlan {
  if (!Number.isInteger(total) || total < 1) throw Error('Invalid shard total');
  const recorded = Object.values(durations ?? {}).sort((a, b) => a - b);
  const median = recorded.length ? recorded[Math.floor(recorded.length / 2)]! : 1;
  const weight = (file: string) => durations && Object.hasOwn(durations, file) ? durations[file]! : median;
  const shards = Array.from({ length: total }, () => ({ load: 0, files: [] as string[] }));
  for (const file of [...files].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b))) {
    const target = shards.reduce((best, shard) => shard.load < best.load || (shard.load === best.load && shard.files.length < best.files.length) ? shard : best);
    target.files.push(file); target.load += weight(file);
  }
  const plan = shards.map(shard => shard.files);
  assertShardPlan(plan, files, total);
  return plan;
}

/** Each selected file runs in exactly one shard: the plan holds `total` disjoint arrays whose union is the selection. */
export function assertShardPlan(plan: unknown, selected: readonly string[] | null, total: number): asserts plan is ShardPlan {
  const flat = Array.isArray(plan) && plan.every(Array.isArray) ? (plan as unknown[][]).flat() : null;
  const files = new Set(flat);
  if (!flat || (plan as unknown[]).length !== total || !flat.every(validTestPath) || files.size !== flat.length
    || (selected && (flat.length !== selected.length || !selected.every(file => files.has(file))))) throw Error('Invalid shard plan');
}

/** The duration cache of one run: a file keeps its duration only when no case of it failed. */
export function reduceTestDurations(reports: readonly TestFileResultV1[], source: { run_id: string; run_attempt: string; sha: string }) {
  const files: Record<string, number> = {};
  for (const report of reports) if (report.cases.every(item => item.result !== 'failed')) files[report.file] = report.duration_ms;
  return { source, files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) };
}

/** Returns the files of a run list that have no JUnit report in the run directory. */
export function missingTestReports(files: readonly string[], reports: readonly TestFileResultV1[]): string[] {
  const reported = new Set(reports.map(report => report.file));
  return files.filter(file => !reported.has(file));
}

const usage = 'Usage: select-test-suite.ts [core|integration|full] [files...] | shard [<index>/<total>] | plan <index>/<total> <files...> | durations <junit-dir> <output> | reports <junit-dir> [files...]';

/** Parses a CI_SHARD value `<index>/<total>` with index < total. */
function parseShard(value: string): { index: number; total: number } {
  const match = /^(0|[1-9]\d*)\/([1-9]\d*)$/.exec(value);
  if (!match || Number(match[1]) >= Number(match[2])) throw Error('Invalid CI_SHARD');
  return { index: Number(match[1]), total: Number(match[2]) };
}

if (import.meta.main) {
  const [command = 'full', ...rest] = process.argv.slice(2);
  if (command === 'shard') {
    // The selection job owns the split. A shard runs its array in plan order; with no shard the run is the concatenation.
    if (rest.length > 1) throw Error(usage);
    const shard = rest[0] === undefined ? null : parseShard(rest[0]);
    const plan: unknown = JSON.parse(readFileSync('.ci-affected-tests.json', 'utf8'));
    assertShardPlan(plan, null, shard ? shard.total : (plan as unknown[]).length);
    for (const file of shard ? plan[shard.index]! : plan.flat()) console.log(file);
  } else if (command === 'plan') {
    // The manual probe writes the plan file that the selection job writes, from a given list, so `shard` reads it unchanged.
    const [value, ...files] = rest;
    if (!value || !files.length) throw Error(usage);
    const { total } = parseShard(value);
    writeFileSync('.ci-affected-tests.json', JSON.stringify(planShards(selectTestSuite('full', files), loadTestDurations(), total)));
  } else if (command === 'durations' || command === 'reports') {
    const [directory, ...args] = rest;
    if (!directory || (command === 'durations' && args.length !== 1)) throw Error(usage);
    const { readJUnitRun } = await import('./report-ci');
    const reports = readJUnitRun(directory);
    if (command === 'durations') {
      const { GITHUB_RUN_ID: run_id, GITHUB_RUN_ATTEMPT: run_attempt, GITHUB_SHA: sha } = process.env;
      if (!run_id || !run_attempt || !sha) throw Error('The duration cache needs GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT and GITHUB_SHA');
      const table = reduceTestDurations(reports, { run_id, run_attempt, sha });
      writeFileSync(args[0]!, `${JSON.stringify(table)}\n`);
      console.log(`[ci] recorded durations of ${Object.keys(table.files).length} of ${reports.length} reported test files`);
    } else {
      const missing = missingTestReports(args, reports);
      for (const file of missing) console.error(`[ci] missing test report: ${file}`);
      if (missing.length) process.exit(1);
      console.log(`[ci] ${args.length} test reports present`);
    }
  } else {
    // Run order is the caller's order: the shard plan for the affected lane, path order for a discovered suite.
    const files = selectTestSuite(command, rest.length ? rest : discoverTestFiles());
    for (const file of files) console.log(`${serialFiles.has(file) ? 'serial' : 'parallel'}\t${file}`);
  }
}
