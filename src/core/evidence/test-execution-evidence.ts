/**
 * Test-level execution evidence (repo-harness issue #1256).
 *
 * Job and step scope cannot prove that a rerun executed the test that failed:
 * workflow step names are not test identifiers. This module reads the rerun
 * attempt's JUnit reports and projects the executed and skipped test identifier
 * sets. Without that source the retry outcome stays `not_revalidated`.
 */

export type RequiredCheckTestExecutionV1 =
  | {
    readonly status: 'available';
    /** Test identifiers the attempt executed, in the report's normalized form. */
    readonly executed: readonly string[];
    /** Test identifiers the attempt skipped. */
    readonly skipped: readonly string[];
  }
  | { readonly status: 'unavailable' };

export interface TestExecutionFileV1 {
  /** Path inside the downloaded artifact; used only for diagnostics. */
  readonly path: string;
  readonly text: string;
}

export interface TestExecutionArtifactV1 {
  readonly name: string;
  readonly files: readonly TestExecutionFileV1[];
}

const ATTEMPT_SUFFIX = /-(\d+)$/u;
/** CI uploads Bun JUnit reports under this name prefix and the attempt suffix. */
export const TEST_EXECUTION_ARTIFACT_PREFIX = 'junit-';

/** The run attempt a test report artifact belongs to, from its name suffix. */
export function testArtifactAttempt(name: string): number | null {
  const trimmed = name.trim();
  if (!trimmed.startsWith(TEST_EXECUTION_ARTIFACT_PREFIX)) return null;
  const match = ATTEMPT_SUFFIX.exec(trimmed);
  if (!match) return null;
  const attempt = Number(match[1]);
  return Number.isSafeInteger(attempt) && attempt > 0 ? attempt : null;
}

/** Selects the JUnit test report artifacts for one attempt, by name prefix and attempt suffix. */
export function selectAttemptTestArtifacts<T extends { readonly name: string }>(
  artifacts: readonly T[],
  attempt: number,
): T[] {
  return artifacts.filter((artifact) => testArtifactAttempt(artifact.name) === attempt);
}

const TESTCASE = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gu;
const TESTCASE_OPEN = /<testcase\b/gu;
const ATTRIBUTE = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*"([^"]*)"/gu;

function xmlUnescape(value: string): string {
  return value
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function attributes(source: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE)) parsed[match[1]!] = xmlUnescape(match[2]!);
  return parsed;
}

/** Normalized aliases a JUnit test case can carry; never a bare name when a suite exists. */
export function testCaseIdentifiers(fields: Record<string, string>): string[] {
  const name = (fields.name ?? '').trim();
  if (name === '') return [];
  const classname = (fields.classname ?? '').trim();
  const file = (fields.file ?? '').trim();
  const identifiers: string[] = [];
  if (classname !== '') identifiers.push(`${classname} > ${name}`);
  if (file !== '') {
    identifiers.push(`${file} > ${name}`);
    if (classname !== '') identifiers.push(`${file} > ${classname} > ${name}`);
  }
  if (classname === '' && file === '') identifiers.push(name);
  return identifiers;
}

function parseReport(xml: string): { executed: string[]; skipped: string[] } | null {
  const openCount = [...xml.matchAll(TESTCASE_OPEN)].length;
  const executed: string[] = [];
  const skipped: string[] = [];
  let cases = 0;
  for (const match of xml.matchAll(TESTCASE)) {
    cases++;
    const parsed = attributes(match[1] ?? '');
    const identifiers = testCaseIdentifiers(parsed);
    if (identifiers.length === 0) continue;
    const body = match[2] ?? '';
    if (/<skipped\b/u.test(body)) skipped.push(...identifiers);
    else executed.push(...identifiers);
  }
  // An unreadable report must not look like an empty but valid executed set.
  if (cases !== openCount) return null;
  return { executed, skipped };
}

/**
 * Projects downloaded JUnit report files into the test-level observation.
 * Malformed XML fails closed to `unavailable`; an empty but well-formed report
 * stays `available` with empty sets.
 */
export function projectTestExecution(
  files: readonly TestExecutionFileV1[],
): RequiredCheckTestExecutionV1 {
  if (files.length === 0) return Object.freeze({ status: 'unavailable' });
  const executed = new Set<string>();
  const skipped = new Set<string>();
  for (const file of files) {
    const parsed = parseReport(file.text);
    if (parsed === null) return Object.freeze({ status: 'unavailable' });
    for (const identifier of parsed.executed) executed.add(identifier);
    for (const identifier of parsed.skipped) skipped.add(identifier);
  }
  for (const identifier of skipped) executed.delete(identifier);
  return Object.freeze({
    status: 'available',
    executed: Object.freeze([...executed].sort()),
    skipped: Object.freeze([...skipped].sort()),
  });
}

/** A failed test identifier may carry a source line; the report never does. */
export function normalizeTestIdentifier(value: string): string {
  return value.trim().replace(/:(\d+)$/u, '');
}

function isFileIdentifier(identifier: string): boolean {
  return !identifier.includes(' > ') && /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(identifier);
}

/**
 * True when one identifier is present in a test-level set. A file-level failed
 * identifier matches any test of that file; a named test matches exactly.
 */
export function testIdentifierPresent(set: readonly string[], identifier: string): boolean {
  const target = normalizeTestIdentifier(identifier);
  if (target === '') return false;
  if (set.some((entry) => normalizeTestIdentifier(entry) === target)) return true;
  if (!isFileIdentifier(target)) return false;
  return set.some((entry) => {
    const normalized = normalizeTestIdentifier(entry);
    return normalized === target || normalized.startsWith(`${target} > `);
  });
}