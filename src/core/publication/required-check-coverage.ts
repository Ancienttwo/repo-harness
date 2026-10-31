/**
 * Required-check coverage (repo-harness issue #1205).
 *
 * A repository policy may declare protected path globs and the required checks
 * that must have run for them. When a PR changes a protected path, every
 * declared check must be observed with the provider bucket `pass`. A skipped,
 * missing, pending, failing or cancelled check blocks the merge.
 *
 * The only waiver is provider-visible: a check named `coverage-waiver` with the
 * bucket `pass`. There is no local waiver file and no caller flag.
 *
 * This module owns the closed policy block, the protected-path match, the
 * evidence shape and its validator. The provider read and the blocker
 * projection live elsewhere; nothing here performs I/O.
 */

export const REQUIRED_CHECK_COVERAGE_PROTOCOL = 1 as const;
export const REQUIRED_CHECK_COVERAGE_KIND = 'repo-harness-required-check-coverage' as const;
/** The single provider-visible waiver: this check name with the bucket `pass`. */
export const REQUIRED_CHECK_COVERAGE_WAIVER = 'coverage-waiver' as const;

/** The provider bucket vocabulary plus `missing` for a declared check the provider did not observe. */
export type RequiredCheckCoverageBucket = 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel' | 'missing';

/** The declared block: protected path globs and the checks that must have run for them. */
export interface RequiredCheckCoveragePolicyV1 {
  readonly protected_paths: readonly string[];
  readonly required_checks: readonly string[];
}

export type RequiredCheckCoverageParseResult =
  | { readonly ok: true; readonly policy: RequiredCheckCoveragePolicyV1 }
  | { readonly ok: false; readonly message: string };

/** Per-check detail: what the policy declared, what the provider observed and why it was required. */
export interface RequiredCheckCoverageDetailV1 {
  readonly check: string;
  readonly bucket: RequiredCheckCoverageBucket;
  readonly requirement: 'not_required' | 'required' | 'waived';
}

export interface RequiredCheckCoverageWaiverV1 {
  readonly check: typeof REQUIRED_CHECK_COVERAGE_WAIVER;
  readonly bucket: 'pass';
}

/**
 * The durable coverage observation. Readiness emits it and the protocol 4
 * acceptance record stores it, so both consumers read one closed shape.
 */
export interface RequiredCheckCoverageEvidenceV1 {
  readonly protocol: typeof REQUIRED_CHECK_COVERAGE_PROTOCOL;
  readonly kind: typeof REQUIRED_CHECK_COVERAGE_KIND;
  readonly head_sha: string;
  readonly base_sha: string;
  /** Sorted unique changed paths that match a declared protected pattern. */
  readonly protected_paths: readonly string[];
  /** One entry per declared check, in policy order. */
  readonly checks: readonly RequiredCheckCoverageDetailV1[];
  readonly waiver: RequiredCheckCoverageWaiverV1 | null;
}

export interface RequiredCheckCoverageFailureV1 {
  readonly check: string;
  readonly bucket: RequiredCheckCoverageBucket;
  /** Names the protected path, the check and the executable fix. */
  readonly message: string;
}

const SHA40 = /^[0-9a-f]{40}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(message);
}

function exactKeys(value: Record<string, unknown>, label: string, keys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} fields are invalid`);
  }
}

function uniqueStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    fail(`${label} must be non-empty strings`);
  }
  const strings = value as string[];
  if (new Set(strings).size !== strings.length) fail(`${label} must not repeat a value`);
  return [...strings];
}

function repoRelativePath(value: string): boolean {
  return value.length > 0 && !value.startsWith('/') && !value.includes('\\')
    && !value.includes('\0') && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function protectedPathPattern(value: unknown, label: string): string {
  if (typeof value !== 'string' || !repoRelativePath(value)) fail(`${label} must be a repository-relative glob`);
  return value;
}

function checkName(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0') || /[\r\n]/u.test(value)) {
    fail(`${label} must be a check name`);
  }
  return value;
}

/**
 * The closed `publication.required_check_coverage` block. An absent or empty
 * block leaves the current behavior unchanged; any other shape fails closed.
 */
export function parseRequiredCheckCoverageBlock(value: unknown): RequiredCheckCoverageParseResult {
  if (!isRecord(value)) return { ok: false, message: 'the block must be an object' };
  const unknown = Object.keys(value).filter((key) => key !== 'protected_paths' && key !== 'required_checks');
  if (unknown.length > 0) return { ok: false, message: `the block has unknown fields: ${unknown.sort().join(', ')}` };
  const protectedPaths: string[] = [];
  const requiredChecks: string[] = [];
  try {
    if (value.protected_paths !== undefined) {
      if (!Array.isArray(value.protected_paths)) fail('protected_paths must be an array');
      protectedPaths.push(...value.protected_paths.map((entry, index) => protectedPathPattern(entry, `protected_paths[${index}]`)));
      if (new Set(protectedPaths).size !== protectedPaths.length) fail('protected_paths must not repeat a value');
    }
    if (value.required_checks !== undefined) {
      if (!Array.isArray(value.required_checks)) fail('required_checks must be an array');
      requiredChecks.push(...value.required_checks.map((entry, index) => checkName(entry, `required_checks[${index}]`)));
      if (new Set(requiredChecks).size !== requiredChecks.length) fail('required_checks must not repeat a value');
    }
    if (protectedPaths.length > 0 && requiredChecks.length === 0) {
      fail('required_checks is required when protected_paths is not empty');
    }
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  return { ok: true, policy: Object.freeze({ protected_paths: Object.freeze(protectedPaths), required_checks: Object.freeze(requiredChecks) }) };
}

/** `**` matches zero or more segments; `*` and `?` match inside one segment. */
function segmentMatches(segment: string, pattern: string): boolean {
  let source = '';
  for (const character of pattern) {
    if (character === '*') source += '[^/]*';
    else if (character === '?') source += '[^/]';
    else source += character.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  }
  return new RegExp(`^${source}$`, 'u').test(segment);
}

function matchSegments(path: readonly string[], pattern: readonly string[]): boolean {
  if (pattern.length === 0) return path.length === 0;
  const [head, ...rest] = pattern;
  if (head === '**') {
    for (let index = 0; index <= path.length; index++) {
      if (matchSegments(path.slice(index), rest)) return true;
    }
    return false;
  }
  return path.length > 0 && segmentMatches(path[0]!, head!) && matchSegments(path.slice(1), rest);
}

export function protectedPathMatches(pattern: string, path: string): boolean {
  return matchSegments(path.split('/'), pattern.split('/'));
}

/**
 * The single coverage observation. The projection owns the decision; this
 * function only records what the policy declared and what the provider showed.
 */
export function buildRequiredCheckCoverageEvidence(input: {
  readonly head_sha: string;
  readonly base_sha: string;
  readonly policy: RequiredCheckCoveragePolicyV1;
  readonly changed_paths: readonly string[];
  readonly observed_checks: readonly { readonly name: string; readonly bucket: RequiredCheckCoverageBucket }[];
}): RequiredCheckCoverageEvidenceV1 {
  const protectedPaths = [...new Set(input.changed_paths.filter((path) =>
    input.policy.protected_paths.some((pattern) => protectedPathMatches(pattern, path))))].sort();
  const waiverObservations = input.observed_checks.filter((check) => check.name === REQUIRED_CHECK_COVERAGE_WAIVER);
  const waived = protectedPaths.length > 0 && waiverObservations.length > 0
    && waiverObservations.every((check) => check.bucket === 'pass');
  const waiver: RequiredCheckCoverageWaiverV1 | null = waived
    ? Object.freeze({ check: REQUIRED_CHECK_COVERAGE_WAIVER, bucket: 'pass' as const })
    : null;
  const requirement = protectedPaths.length === 0 ? 'not_required' as const : waived ? 'waived' as const : 'required' as const;
  const checks = input.policy.required_checks.map((check): RequiredCheckCoverageDetailV1 => Object.freeze({
    check,
    bucket: declaredCheckBucket(check, input.observed_checks),
    requirement,
  }));
  return Object.freeze({
    protocol: REQUIRED_CHECK_COVERAGE_PROTOCOL,
    kind: REQUIRED_CHECK_COVERAGE_KIND,
    head_sha: input.head_sha,
    base_sha: input.base_sha,
    protected_paths: Object.freeze(protectedPaths),
    checks: Object.freeze(checks),
    waiver,
  });
}

/**
 * The bucket of one declared check. A provider can report the same name more
 * than once; every observation must then pass, so the verdict cannot depend on
 * observation order. The first non-pass bucket is reported for the message.
 */
function declaredCheckBucket(
  check: string,
  observed: readonly { readonly name: string; readonly bucket: RequiredCheckCoverageBucket }[],
): RequiredCheckCoverageBucket {
  const buckets = observed.filter((entry) => entry.name === check).map((entry) => entry.bucket);
  if (buckets.length === 0) return 'missing';
  return buckets.find((bucket) => bucket !== 'pass') ?? 'pass';
}

function coverageFix(check: string, bucket: RequiredCheckCoverageBucket): string {
  switch (bucket) {
    case 'missing': return `run "${check}" for this PR head, or fix its name in publication.required_check_coverage on the base branch`;
    case 'skipping': return `run "${check}" for this PR instead of skipping it, or add a passing "${REQUIRED_CHECK_COVERAGE_WAIVER}" check`;
    case 'pending': return `wait for "${check}" to finish, then read readiness again`;
    case 'cancel': return `rerun the cancelled "${check}" job`;
    default: return `fix "${check}" and rerun CI, or add a passing "${REQUIRED_CHECK_COVERAGE_WAIVER}" check`;
  }
}

/** Every declared check that is required and did not pass. A waiver clears all of them. */
export function requiredCheckCoverageFailures(
  evidence: RequiredCheckCoverageEvidenceV1,
): RequiredCheckCoverageFailureV1[] {
  if (evidence.waiver !== null || evidence.protected_paths.length === 0) return [];
  const paths = evidence.protected_paths.map((path) => `"${path}"`).join(', ');
  return evidence.checks.filter((check) => check.bucket !== 'pass').map((check): RequiredCheckCoverageFailureV1 => Object.freeze({
    check: check.check,
    bucket: check.bucket,
    message: `required check "${check.check}" is ${check.bucket} for protected path ${paths}; ${coverageFix(check.check, check.bucket)}`,
  }));
}

const BUCKETS: readonly RequiredCheckCoverageBucket[] = ['pass', 'fail', 'pending', 'skipping', 'cancel', 'missing'];
const REQUIREMENTS = ['not_required', 'required', 'waived'] as const;

function oneOf<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(choices as readonly string[]).includes(value)) fail(`${label} is invalid`);
  return value as T;
}

function requiredString(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || value.trim() === '' || (pattern && !pattern.test(value))) fail(`${label} is invalid`);
  return value;
}

function sortedUniqueStrings(value: unknown, label: string): string[] {
  const strings = uniqueStrings(value, label);
  if (strings.some((entry, index) => index > 0 && strings[index - 1]! >= entry)) fail(`${label} must be sorted and unique`);
  return strings;
}

/** Strict reader for a stored coverage observation; a receipt may not carry an invented shape. */
export function validateRequiredCheckCoverageEvidence(value: unknown): RequiredCheckCoverageEvidenceV1 {
  if (!isRecord(value)) fail('RequiredCheckCoverageEvidence must be an object');
  exactKeys(value, 'RequiredCheckCoverageEvidence', ['protocol', 'kind', 'head_sha', 'base_sha', 'protected_paths', 'checks', 'waiver']);
  if (value.protocol !== REQUIRED_CHECK_COVERAGE_PROTOCOL || value.kind !== REQUIRED_CHECK_COVERAGE_KIND) {
    fail('RequiredCheckCoverageEvidence kind/protocol is invalid');
  }
  const protectedPaths = sortedUniqueStrings(value.protected_paths, 'RequiredCheckCoverageEvidence.protected_paths');
  if (protectedPaths.some((path) => !repoRelativePath(path))) fail('RequiredCheckCoverageEvidence.protected_paths are invalid');
  if (!Array.isArray(value.checks) || value.checks.length === 0) fail('RequiredCheckCoverageEvidence.checks must not be empty');
  const seen = new Set<string>();
  const checks = value.checks.map((entry, index): RequiredCheckCoverageDetailV1 => {
    if (!isRecord(entry)) fail(`RequiredCheckCoverageEvidence.checks[${index}] is invalid`);
    exactKeys(entry, `RequiredCheckCoverageEvidence.checks[${index}]`, ['check', 'bucket', 'requirement']);
    const check = requiredString(entry.check, `RequiredCheckCoverageEvidence.checks[${index}].check`);
    if (seen.has(check)) fail('RequiredCheckCoverageEvidence.checks must not repeat a check');
    seen.add(check);
    return Object.freeze({
      check,
      bucket: oneOf(entry.bucket, BUCKETS, `RequiredCheckCoverageEvidence.checks[${index}].bucket`),
      requirement: oneOf(entry.requirement, REQUIREMENTS, `RequiredCheckCoverageEvidence.checks[${index}].requirement`),
    });
  });
  let waiver: RequiredCheckCoverageWaiverV1 | null = null;
  if (value.waiver !== null) {
    if (!isRecord(value.waiver)) fail('RequiredCheckCoverageEvidence.waiver is invalid');
    exactKeys(value.waiver, 'RequiredCheckCoverageEvidence.waiver', ['check', 'bucket']);
    if (value.waiver.check !== REQUIRED_CHECK_COVERAGE_WAIVER || value.waiver.bucket !== 'pass') {
      fail('RequiredCheckCoverageEvidence.waiver is invalid');
    }
    waiver = Object.freeze({ check: REQUIRED_CHECK_COVERAGE_WAIVER, bucket: 'pass' as const });
  }
  const expected = protectedPaths.length === 0 ? 'not_required' : waiver === null ? 'required' : 'waived';
  if (checks.some((check) => check.requirement !== expected)) {
    fail('RequiredCheckCoverageEvidence requirement does not match the protected paths and the waiver');
  }
  return Object.freeze({
    protocol: REQUIRED_CHECK_COVERAGE_PROTOCOL,
    kind: REQUIRED_CHECK_COVERAGE_KIND,
    head_sha: requiredString(value.head_sha, 'RequiredCheckCoverageEvidence.head_sha', SHA40),
    base_sha: requiredString(value.base_sha, 'RequiredCheckCoverageEvidence.base_sha', SHA40),
    protected_paths: Object.freeze(protectedPaths),
    checks: Object.freeze(checks),
    waiver,
  });
}

/** The record field is nullable: a PR under a policy without the block has no coverage observation. */
export function validateRequiredCheckCoverageEvidenceOrNull(value: unknown): RequiredCheckCoverageEvidenceV1 | null {
  if (value === null) return null;
  return validateRequiredCheckCoverageEvidence(value);
}
