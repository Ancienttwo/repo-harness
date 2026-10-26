// Public contract of the tests route (PRD G20, G21). The tests collector reads
// the newest completed daily (`schedule`) run of `.github/workflows/ci.yml` on
// the default branch: its `junit-daily-<attempt>` and `test-projection-<attempt>`
// artifacts of the highest attempt, and the open CI repair issues. The route
// serves only file, case name, result, duration and the run's channel, never a
// failure message, stack trace or CI path. The strict decoder serves the server
// before it sends and the browser before it renders.

import { isPublicDevActivityText, publicDevActivityText } from '../dev-activity/decode';

export const OPERATOR_TESTS_KIND = 'operator_tests' as const;
export const TEST_PROJECTION_SCHEMA = 'repo-harness.test-capability-projection/v1' as const;
/** The CI lane of every result here: the daily full run. */
export const TESTS_CHANNEL = 'daily_full' as const;

/**
 * Repair issue identity. `scripts/report-ci.ts` builds each repair key from
 * one of these prefixes and writes it into the issue body with
 * `ciRepairIssueMarker`; the tests route and the report's unresolved-repair
 * readback both find open repairs with `isCiRepairIssueBody`.
 */
export const CI_REPAIR_KEY_PREFIX = 'ci-repair:' as const;
export const CI_DAILY_MISSING_KEY_PREFIX = 'ci-daily-missing:' as const;
export const ciRepairIssueMarker = (key: string): string => `<!-- ${key} -->`;
export const CI_REPAIR_MARKERS: readonly string[] = [CI_REPAIR_KEY_PREFIX, CI_DAILY_MISSING_KEY_PREFIX].map(prefix => `<!-- ${prefix}`);

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

export type TestCaseResult = 'passed' | 'failed' | 'skipped';

export interface TestCaseV1 {
  /** The enclosing describe names, joined by ` > `; null at file level. */
  readonly suite: string | null;
  readonly name: string;
  readonly result: TestCaseResult;
  readonly duration_ms: number;
}

export interface TestFileResultV1 {
  readonly file: string;
  readonly duration_ms: number;
  readonly cases: readonly TestCaseV1[];
}

export interface TestProjectionFileV1 {
  readonly file: string;
  readonly capabilities: readonly { readonly id: string; readonly via: readonly ('import' | 'verification')[] }[];
  /** The copyable local command for this file. */
  readonly command: string;
}

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

const TEST_FILE = /^tests\/[A-Za-z0-9._/-]{1,250}\.test\.tsx?$/u;
const CAPABILITY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
/** GitHub's timestamp form; the collector checks a run's `created_at` with it before any download. */
export const TESTS_ISO_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u;
const ISO_TIME = TESTS_ISO_TIME;
const CONCLUSION = /^[a-z_]{1,32}$/u;
const ISSUE_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}\/issues\/[1-9][0-9]{0,9}$/u;
const TEXT_LIMIT = 500;

/** The copyable command that runs one test file the way the repository's own instructions do. */
export function testRunCommand(file: string): string {
  return `bun run test:files ${file} --timeout 60000 --max-concurrency 1`;
}

/** Case, suite and issue text is shown as is, except a private path, which is masked. */
export function publicTestText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return publicDevActivityText(value.replace(/[\x00-\x1f\x7f]+/gu, ' ').trim()).slice(0, TEXT_LIMIT);
}

const XML_ENTITY = /&(?:(amp|lt|gt|quot|apos)|#(\d{1,7})|#x([0-9A-Fa-f]{1,6}));/gu;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function unescapeXml(value: string): string {
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9A-Fa-f]{1,6});)/u.test(value)) throw new Error('junit invalid: entity');
  return value.replace(XML_ENTITY, (_, name: string | undefined, dec: string | undefined, hex: string | undefined) => {
    if (name) return NAMED[name]!;
    const code = dec !== undefined ? Number(dec) : Number.parseInt(hex!, 16);
    if (code > 0x10ffff) throw new Error('junit invalid: entity');
    return String.fromCodePoint(code);
  });
}

function attributes(source: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /\s+([A-Za-z_][\w.-]*)="([^"<]*)"/gy;
  let offset = 0;
  for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
    if (result.has(match[1]!)) throw new Error('junit invalid: attribute');
    result.set(match[1]!, unescapeXml(match[2]!));
    offset = pattern.lastIndex;
  }
  if (source.slice(offset).trim() !== '') throw new Error('junit invalid: attribute');
  return result;
}

function milliseconds(value: string | undefined): number {
  const seconds = value === undefined ? 0 : Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('junit invalid: time');
  return Math.round(seconds * 1000);
}

/**
 * One Bun JUnit report (`bun test --reporter=junit`, one file per report).
 * Only names, results and times are kept; failure text and properties are
 * dropped. Anything that is not well-formed throws.
 */
export function parseJUnitReport(xml: string): TestFileResultV1 {
  // An attribute value may hold a raw `>`; it never holds `<` or `"`.
  const tag = /<(\/?)([A-Za-z_][\w.-]*)((?:\s+[A-Za-z_][\w.-]*="[^"<]*")*)\s*(\/?)>|<\?[^<>]*\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/gu;
  const stack: { name: string; attrs: Map<string, string> }[] = [];
  const cases: TestCaseV1[] = [];
  let file: string | null = null;
  let duration: number | null = null;
  let current: { suite: string | null; name: string; duration_ms: number; result: TestCaseResult } | null = null;
  let offset = 0;
  for (let match = tag.exec(xml); match !== null; match = tag.exec(xml)) {
    // Text between tags never holds `<`: in XML it is escaped.
    if (xml.slice(offset, match.index).includes('<')) throw new Error('junit invalid: text');
    offset = tag.lastIndex;
    const [, closing, name, rest, selfClosing] = match;
    if (name === undefined) continue;
    if (closing) {
      const open = stack.pop();
      if (open?.name !== name || rest!.trim() !== '' || selfClosing) throw new Error('junit invalid: nesting');
      if (name === 'testcase' && current !== null) { cases.push(current); current = null; }
      continue;
    }
    const attrs = attributes(rest!);
    if (name === 'testsuite') {
      if (stack.filter(entry => entry.name === 'testsuite').length === 0) {
        const named = attrs.get('file');
        if (file !== null || named === undefined || !TEST_FILE.test(named)) throw new Error('junit invalid: file');
        file = named;
        duration = milliseconds(attrs.get('time'));
      }
    } else if (name === 'testcase') {
      if (file === null || current !== null) throw new Error('junit invalid: testcase');
      const caseName = attrs.get('name');
      // Bun writes `name=""` for `test('')`; the snapshot has no empty name, so the report is not servable.
      if (caseName === undefined || publicTestText(caseName) === '') throw new Error('junit invalid: testcase name');
      const suites = stack.filter(entry => entry.name === 'testsuite').slice(1).map(entry => entry.attrs.get('name') ?? '');
      if (suites.some(suite => publicTestText(suite) === '')) throw new Error('junit invalid: suite name');
      current = { suite: suites.length ? publicTestText(suites.join(' > ')) : null, name: publicTestText(caseName), duration_ms: milliseconds(attrs.get('time')), result: 'passed' };
    } else if (name === 'failure' || name === 'error') {
      if (current === null) throw new Error('junit invalid: failure');
      current.result = 'failed';
    } else if (name === 'skipped') {
      if (current === null) throw new Error('junit invalid: skipped');
      if (current.result !== 'failed') current.result = 'skipped';
    }
    if (selfClosing) {
      if (name === 'testcase' && current !== null) { cases.push(current); current = null; }
    } else stack.push({ name, attrs });
  }
  if (xml.slice(offset).includes('<') || stack.length !== 0 || file === null || duration === null) throw new Error('junit invalid: document');
  return { file, duration_ms: duration, cases };
}

/** The projection artifact, reduced to what the route serves. Anything else in it is checked, not kept. */
export function parseTestProjection(value: unknown): TestProjectionFileV1[] {
  const fail = (what: string): never => { throw new Error(`test projection invalid: ${what}`); };
  const root = value as Record<string, unknown> | null;
  if (typeof root !== 'object' || root === null || root.schemaVersion !== TEST_PROJECTION_SCHEMA || !Array.isArray(root.tests)) return fail('root');
  const seen = new Set<string>();
  return root.tests.map((raw): TestProjectionFileV1 => {
    const entry = raw as Record<string, unknown> | null;
    if (typeof entry !== 'object' || entry === null || typeof entry.file !== 'string' || !TEST_FILE.test(entry.file) || seen.has(entry.file)) return fail('test file');
    seen.add(entry.file);
    if (!Array.isArray(entry.capabilities)) return fail('capabilities');
    const capabilities = entry.capabilities.map(link => {
      const record = link as Record<string, unknown> | null;
      if (typeof record !== 'object' || record === null || typeof record.id !== 'string' || !CAPABILITY_ID.test(record.id)) return fail('capability id');
      if (!Array.isArray(record.via) || record.via.length === 0 || record.via.some(way => way !== 'import' && way !== 'verification')) return fail('capability via');
      return { id: record.id, via: [...new Set(record.via as ('import' | 'verification')[])] };
    });
    return { file: entry.file, capabilities, command: testRunCommand(entry.file) };
  });
}

/** True when an open issue body carries a repair marker. */
export function isCiRepairIssueBody(body: string): boolean {
  return CI_REPAIR_MARKERS.some(marker => body.includes(marker));
}

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
  match(root.collected_at, ISO_TIME, 'collected_at');
  const run = obj(root.run, ['id', 'attempt', 'head_sha', 'created_at', 'conclusion', 'channel'], 'run');
  whole(run.id, 'run id', 1);
  whole(run.attempt, 'run attempt', 1);
  match(run.head_sha, COMMIT, 'run head_sha');
  match(run.created_at, ISO_TIME, 'run created_at');
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
