// The test report contract that the CI scripts, the board and the operator share:
// the JUnit parser, the result types, the test capability projection schema and
// the CI repair issue identity.

import { publicDevActivityText } from '../public-projections/public-text';

export const TEST_PROJECTION_SCHEMA = 'repo-harness.test-capability-projection/v1' as const;

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

export const TEST_FILE = /^tests\/[A-Za-z0-9._/-]{1,250}\.test\.tsx?$/u;
export const CAPABILITY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
export const TEXT_LIMIT = 500;

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
