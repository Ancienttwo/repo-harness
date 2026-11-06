// Public contract of the tests route (PRD G20, G21). The tests collector reads
// the newest completed daily (`schedule`) run of `.github/workflows/ci.yml` on
// the default branch: its `junit-daily-<attempt>` and `test-projection-<attempt>`
// artifacts of the highest attempt, and the open CI repair issues. The route
// serves only file, case name, result, duration and the run's channel, never a
// failure message, stack trace or CI path. The strict decoder serves the server
// before it sends and the browser before it renders.

import { CAPABILITY_ID, TEST_FILE, testRunCommand, TEXT_LIMIT, type TestFileResultV1, type TestProjectionFileV1 } from '../ci/test-report';
import { isPublicDevActivityText } from '../public-projections/public-text';

export const OPERATOR_TESTS_KIND = 'operator_tests' as const;
/** The CI lane of every result here: the daily full run. */
export const TESTS_CHANNEL = 'daily_full' as const;

/** Why a repository's tests cannot be served. Each maps to one HTTP status in the route. */
export const TESTS_UNAVAILABLE_REASONS = [
  'tests_pending',
  'registry_unavailable',
  'repository_not_found',
  'default_branch_unknown',
  'github_unavailable',
  'no_daily_run',
  'artifacts_missing',
  'artifacts_expired',
  'artifact_too_large',
  'artifact_download_failed',
  'tests_invalid',
] as const;
export type TestsUnavailableReason = typeof TESTS_UNAVAILABLE_REASONS[number];

type Section<Fields, Reason extends string> = ({ readonly state: 'ok' } & Fields) | { readonly state: 'unavailable'; readonly reason: Reason };

export interface TestsSnapshotV1 {
  readonly protocol: 1;
  readonly kind: typeof OPERATOR_TESTS_KIND;
  readonly repository_id: string;
  /** When the collector last read this repository. */
  readonly collected_at: string;
  readonly run: {
    readonly id: number;
    readonly attempt: number;
    readonly head_sha: string;
    readonly created_at: string;
    readonly conclusion: string | null;
    readonly channel: typeof TESTS_CHANNEL;
  };
  /** `projection_missing`: the run has no projection artifact ("no projection for this run"). */
  readonly projection: Section<{ readonly files: readonly TestProjectionFileV1[] }, 'projection_missing' | 'projection_invalid'>;
  /**
   * `junit_missing`: the run has no JUnit artifact, so every case is "no result" while the file list still shows.
   * A projection file with no entry in `files` has no result either; it never counts as passed.
   */
  readonly results: Section<{ readonly files: readonly TestFileResultV1[] }, 'junit_missing' | 'junit_invalid'>;
  readonly repairs: Section<{ readonly issues: readonly { readonly number: number; readonly title: string; readonly url: string }[] }, 'repairs_unavailable'>;
}

const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
/** GitHub's timestamp form; the collector checks a run's `created_at` with it before any download. */
export const TESTS_ISO_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u;
const CONCLUSION = /^[a-z_]{1,32}$/u;
const ISSUE_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}\/issues\/[1-9][0-9]{0,9}$/u;

export function decodeTestsSnapshot(value: unknown): TestsSnapshotV1 {
  const fail = (what: string): never => { throw new Error(`tests snapshot invalid: ${what}`); };
  const obj = (v: unknown, keys: readonly string[], what: string): Record<string, unknown> => {
    if (typeof v !== 'object' || v === null || Array.isArray(v) || Object.keys(v).sort().join(',') !== [...keys].sort().join(',')) return fail(what);
    return v as Record<string, unknown>;
  };
  const match = (v: unknown, grammar: RegExp, what: string): string => (typeof v === 'string' && grammar.test(v) ? v : fail(what));
  const whole = (v: unknown, what: string, min = 0): number => (typeof v === 'number' && Number.isSafeInteger(v) && v >= min ? v : fail(what));
  const text = (v: unknown, what: string): string => (typeof v === 'string' && v.length > 0 && v.length <= TEXT_LIMIT && isPublicDevActivityText(v) && !/[\x00-\x1f\x7f]/u.test(v) ? v : fail(what));
  const array = (v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : fail(what));
  const section = (v: unknown, what: string, fields: readonly string[], reasons: readonly string[]): Record<string, unknown> | null => {
    const state = (v as { state?: unknown } | null)?.state;
    if (state === 'unavailable') {
      const reason = obj(v, ['state', 'reason'], what).reason;
      return reasons.includes(reason as string) ? null : fail(`${what} reason`);
    }
    return state === 'ok' ? obj(v, ['state', ...fields], what) : fail(`${what} state`);
  };

  const root = obj(value, ['protocol', 'kind', 'repository_id', 'collected_at', 'run', 'projection', 'results', 'repairs'], 'snapshot');
  if (root.protocol !== 1 || root.kind !== OPERATOR_TESTS_KIND) fail('kind');
  match(root.repository_id, REPOSITORY_ID, 'repository_id');
  match(root.collected_at, TESTS_ISO_TIME, 'collected_at');
  const run = obj(root.run, ['id', 'attempt', 'head_sha', 'created_at', 'conclusion', 'channel'], 'run');
  whole(run.id, 'run id', 1);
  whole(run.attempt, 'run attempt', 1);
  match(run.head_sha, COMMIT, 'run head_sha');
  match(run.created_at, TESTS_ISO_TIME, 'run created_at');
  if (run.conclusion !== null) match(run.conclusion, CONCLUSION, 'run conclusion');
  if (run.channel !== TESTS_CHANNEL) fail('run channel');

  const projection = section(root.projection, 'projection', ['files'], ['projection_missing', 'projection_invalid']);
  if (projection !== null) {
    for (const raw of array(projection.files, 'projection files')) {
      const file = obj(raw, ['file', 'capabilities', 'command'], 'projection file');
      const path = match(file.file, TEST_FILE, 'projection file path');
      if (file.command !== testRunCommand(path)) fail('projection command');
      for (const link of array(file.capabilities, 'projection capabilities')) {
        const capability = obj(link, ['id', 'via'], 'projection capability');
        match(capability.id, CAPABILITY_ID, 'capability id');
        const via = array(capability.via, 'capability via');
        if (via.length === 0 || via.some(way => way !== 'import' && way !== 'verification')) fail('capability via');
      }
    }
  }
  const results = section(root.results, 'results', ['files'], ['junit_missing', 'junit_invalid']);
  if (results !== null) {
    for (const raw of array(results.files, 'result files')) {
      const file = obj(raw, ['file', 'duration_ms', 'cases'], 'result file');
      match(file.file, TEST_FILE, 'result file path');
      whole(file.duration_ms, 'result duration');
      for (const rawCase of array(file.cases, 'cases')) {
        const testCase = obj(rawCase, ['suite', 'name', 'result', 'duration_ms'], 'case');
        if (testCase.suite !== null) text(testCase.suite, 'case suite');
        text(testCase.name, 'case name');
        if (testCase.result !== 'passed' && testCase.result !== 'failed' && testCase.result !== 'skipped') fail('case result');
        whole(testCase.duration_ms, 'case duration');
      }
    }
  }
  const repairs = section(root.repairs, 'repairs', ['issues'], ['repairs_unavailable']);
  if (repairs !== null) {
    for (const raw of array(repairs.issues, 'repair issues')) {
      const issue = obj(raw, ['number', 'title', 'url'], 'repair issue');
      const number = whole(issue.number, 'issue number', 1);
      text(issue.title, 'issue title');
      if (!match(issue.url, ISSUE_URL, 'issue url').endsWith(`/issues/${number}`)) fail('issue url number');
    }
  }
  return value as TestsSnapshotV1;
}
