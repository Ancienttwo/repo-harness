/**
 * Required-check failure evidence (repo-harness issues #1211, #1256).
 *
 * A required-check failure is observable provider evidence, not a verdict.
 * This module records the exact head/base (or merge tree), the workflow
 * version, the run/attempt/job links, the executed and skipped job/step scope,
 * the failed job and step, the retry outcome and a typed cause with the
 * evidence that supports it.
 *
 * A summary required job (a job with declared `needs`) fails because a child
 * failed. Its failed children keep their own identity, failed steps,
 * annotations and attempt history. When the workflow revision does not prove
 * the association, the association is `unknown` and the summary job's own
 * failure stays the reported failure point.
 *
 * Test-level revalidation compares the originally failed test identifiers with
 * the rerun attempt's test execution report, never with job or step names. A
 * same-SHA rerun that passes is recorded as `failed_then_passed`. It is never
 * converted into a proven infrastructure flake, and a rerun without a test
 * execution source is `failed_then_not_revalidated`. The merge decision is made
 * separately, by the existing publication policy, from the observed check
 * buckets; this module never clears a blocker.
 */

import type { RequiredCheckTestExecutionV1 } from './test-execution-evidence';
import { testIdentifierPresent } from './test-execution-evidence';

export const REQUIRED_CHECK_FAILURE_PROTOCOL = 1 as const;
export const REQUIRED_CHECK_FAILURE_KIND = 'repo-harness-required-check-failure' as const;

export type RequiredCheckFailureShape =
  | 'runner_abort'
  | 'timeout'
  | 'assertion_mismatch'
  | 'dependency_install_failure'
  | 'logs_unavailable'
  | 'other';

export type RequiredCheckCause = 'infrastructure' | 'test_defect' | 'product_defect' | 'unknown';

export type RequiredCheckObservedResult = 'failed' | 'failed_then_passed' | 'not_revalidated';

export type RequiredCheckRetryOutcome =
  | 'not_attempted'
  | 'failed_then_passed'
  | 'failed_then_not_revalidated'
  | 'still_failing';

/** Why a retry is not revalidation. Null unless the outcome is `failed_then_not_revalidated`. */
export type RequiredCheckRetryReason =
  | 'test_execution_evidence_unavailable'
  | 'original_test_skipped'
  | 'original_test_not_executed'
  | 'failed_test_identifier_unavailable';

/** How the reported failure point relates to the required check's linked job. */
export type RequiredCheckAssociationV1 = 'direct' | 'declared_needs' | 'unknown';

export type RequiredCheckAttemptConclusion =
  | 'success'
  | 'failure'
  | 'timed_out'
  | 'cancelled'
  | 'skipped'
  | 'unknown';

export interface RequiredCheckScopeV1 {
  readonly executed: readonly string[];
  readonly skipped: readonly string[];
}

export interface RequiredCheckWorkflowV1 {
  /** Workflow file the run executed, for example `.github/workflows/ci.yml`. */
  readonly path: string;
  /** Provider workflow id when the run reports one. */
  readonly id: number | null;
  /** Exact revision of the workflow definition; the run head that defined it. */
  readonly revision: string;
}

/** The immutable run/attempt/job link every observation keeps. */
export interface RequiredCheckJobLinkV1 {
  readonly run_id: number;
  readonly attempt: number;
  readonly job_id: number;
  readonly job_name: string;
  readonly run_url: string;
  readonly job_url: string;
}

export interface RequiredCheckFailurePointV1 extends RequiredCheckJobLinkV1 {
  /** Steps that reported a failed conclusion in this job. Empty is legal. */
  readonly steps: readonly string[];
  /** Failed test/child identifiers from provider annotations. Empty is legal. */
  readonly tests: readonly string[];
  readonly shape: RequiredCheckFailureShape;
  readonly logs_available: boolean;
  /** Provider annotation text when the job published any; never invented. */
  readonly failure_excerpt: string | null;
  /** Lines that prove a platform or runner signal, not a product assertion. */
  readonly platform_evidence: readonly string[];
  readonly scope: RequiredCheckScopeV1;
}

/** One attempt's identity for a preserved failed child job. */
export interface RequiredCheckChildAttemptV1 {
  readonly attempt: number;
  readonly job_id: number;
  readonly job_name: string;
  readonly conclusion: RequiredCheckAttemptConclusion;
}

/** A failed child job of a summary required job, with its own attempt history. */
export interface RequiredCheckChildFailureV1 {
  readonly association: 'declared_needs' | 'unknown';
  readonly failure: RequiredCheckFailurePointV1;
  /** Ordered identity history of this child across the check's attempts. */
  readonly attempts: readonly RequiredCheckChildAttemptV1[];
}

export interface RequiredCheckRetryV1 {
  readonly attempted: boolean;
  readonly attempts: number;
  readonly outcome: RequiredCheckRetryOutcome;
  /** True only when an observed failed child/test identifier executed again and was not skipped. */
  readonly revalidated: boolean;
  /** Why this retry is not revalidation; null for passed, not attempted and still failing. */
  readonly reason: RequiredCheckRetryReason | null;
  readonly latest: RequiredCheckJobLinkV1 & {
    readonly conclusion: RequiredCheckAttemptConclusion;
    readonly scope: RequiredCheckScopeV1;
  };
}

export interface RequiredCheckFailureEvidenceV1 {
  readonly protocol: typeof REQUIRED_CHECK_FAILURE_PROTOCOL;
  readonly kind: typeof REQUIRED_CHECK_FAILURE_KIND;
  readonly check_name: string;
  readonly head_sha: string;
  readonly base_sha: string;
  /** Provider merge-tree proof when the observation has one; null otherwise. */
  readonly merge_tree_sha: string | null;
  readonly workflow: RequiredCheckWorkflowV1;
  readonly association: RequiredCheckAssociationV1;
  /** The required check's linked job when it is a summary; null for a direct job. */
  readonly summary: RequiredCheckJobLinkV1 | null;
  readonly failed: RequiredCheckFailurePointV1;
  /** Every preserved failed child of a summary check. Empty for a direct check. */
  readonly failed_children: readonly RequiredCheckChildFailureV1[];
  readonly retry: RequiredCheckRetryV1;
  readonly observed_result: RequiredCheckObservedResult;
  readonly cause: RequiredCheckCause;
  readonly cause_evidence: readonly string[];
}

/** One observed attempt of one required check. The collector owns the provider read. */
export interface RequiredCheckAttemptObservationV1 extends RequiredCheckJobLinkV1 {
  readonly conclusion: RequiredCheckAttemptConclusion;
  readonly steps: readonly string[];
  /** Test identifiers visible in the failure; empty when the attempt has none. */
  readonly failed_tests: readonly string[];
  readonly logs_available: boolean;
  readonly failure_excerpt: string | null;
  readonly platform_evidence: readonly string[];
  readonly scope: RequiredCheckScopeV1;
  /** Test-level execution results for this attempt, or null when not observed. */
  readonly test_execution: RequiredCheckTestExecutionV1 | null;
}

/** The failed children of a summary check, as the collector observed them. */
export interface RequiredCheckChildObservationV1 {
  readonly job_name: string;
  readonly association: 'declared_needs' | 'unknown';
  /** Ordered observations of this child across the check's attempts. */
  readonly attempts: readonly RequiredCheckAttemptObservationV1[];
}

/** A caller-declared cause is limited to causes evidence can support; never `infrastructure`. */
export interface RequiredCheckDeclaredCauseV1 {
  readonly cause: 'test_defect' | 'product_defect';
  readonly evidence: readonly string[];
}

export interface RequiredCheckObservationV1 {
  readonly check_name: string;
  readonly head_sha: string;
  readonly base_sha: string;
  readonly merge_tree_sha: string | null;
  readonly workflow: RequiredCheckWorkflowV1;
  /** Ordered, earliest attempt first. The last entry is the observed result. */
  readonly attempts: readonly RequiredCheckAttemptObservationV1[];
  /** How the summary check's failed children were proven from its declared needs. */
  readonly association: RequiredCheckAssociationV1;
  readonly children: readonly RequiredCheckChildObservationV1[];
  readonly declared_cause: RequiredCheckDeclaredCauseV1 | null;
}

const SHA40 = /^[0-9a-f]{40}$/u;
const GIT_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const ACTIONS_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+\/job\/\d+$/u;

const ASSERTION_PATTERN = /(assertion(?:error)?|expected\b.*\b(?:to|deeply) equal|deeply equal|expected\b.*\breceived\b|toBe\(|toEqual\(|mismatch)/iu;
const DEPENDENCY_PATTERN = /(install|setup|dependency|lockfile|npm err|pnpm err|yarn err|bun install|package (?:fetch|resolution)|registry)/iu;
const PLATFORM_PATTERN = /(runner (?:has |was )?(?:shutdown|shut down|received a shutdown|terminated|lost)|lost communication with the (?:runner|server)|the operation was canceled because|service unavailable|internal server error|bad gateway|gateway timeout|ECONN(?:RESET|REFUSED)|ETIMEDOUT|EAI_AGAIN|Could not resolve host)/iu;
const NETWORK_PATTERN = /(service unavailable|internal server error|bad gateway|gateway timeout|ECONN(?:RESET|REFUSED)|ETIMEDOUT|EAI_AGAIN|Could not resolve host|registry\b.*\b(?:unavailable|timeout|5\d\d))/iu;

const FAILED_CONCLUSIONS: ReadonlySet<RequiredCheckAttemptConclusion> = new Set([
  'failure', 'timed_out', 'cancelled',
]);

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

function requiredString(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || value.trim() === '' || (pattern && !pattern.test(value))) {
    fail(`${label} is invalid`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') fail(`${label} is invalid`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail(`${label} is invalid`);
  return Number(value);
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) fail(`${label} must be strings`);
  return [...value] as string[];
}

function scope(value: unknown, label: string): RequiredCheckScopeV1 {
  if (!isRecord(value)) fail(`${label} is invalid`);
  exactKeys(value, label, ['executed', 'skipped']);
  return Object.freeze({
    executed: Object.freeze(stringArray(value.executed, `${label}.executed`)),
    skipped: Object.freeze(stringArray(value.skipped, `${label}.skipped`)),
  });
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  // A JSON array such as ["timeout"] must not pass through String() coercion.
  if (typeof value !== 'string' || !(choices as readonly string[]).includes(value)) fail(`${label} is invalid`);
  return value as T;
}

function attemptConclusion(value: unknown, label: string): RequiredCheckAttemptConclusion {
  return oneOf(value, ['success', 'failure', 'timed_out', 'cancelled', 'skipped', 'unknown'], label);
}

function failureShape(value: unknown, label: string): RequiredCheckFailureShape {
  return oneOf(value, ['runner_abort', 'timeout', 'assertion_mismatch', 'dependency_install_failure', 'logs_unavailable', 'other'], label);
}

function cause(value: unknown, label: string): RequiredCheckCause {
  return oneOf(value, ['infrastructure', 'test_defect', 'product_defect', 'unknown'], label);
}

function observedResult(value: unknown, label: string): RequiredCheckObservedResult {
  return oneOf(value, ['failed', 'failed_then_passed', 'not_revalidated'], label);
}

function retryOutcome(value: unknown, label: string): RequiredCheckRetryOutcome {
  return oneOf(value, ['not_attempted', 'failed_then_passed', 'failed_then_not_revalidated', 'still_failing'], label);
}

function retryReason(value: unknown, label: string): RequiredCheckRetryReason | null {
  if (value === null) return null;
  return oneOf<RequiredCheckRetryReason>(value, ['test_execution_evidence_unavailable', 'original_test_skipped', 'original_test_not_executed', 'failed_test_identifier_unavailable'], label);
}

function associationValue(value: unknown, label: string): RequiredCheckAssociationV1 {
  return oneOf(value, ['direct', 'declared_needs', 'unknown'], label);
}

function workflow(value: unknown, label: string): RequiredCheckWorkflowV1 {
  if (!isRecord(value)) fail(`${label} is invalid`);
  exactKeys(value, label, ['path', 'id', 'revision']);
  return Object.freeze({
    path: requiredString(value.path, `${label}.path`),
    id: value.id === null ? null : positiveInteger(value.id, `${label}.id`),
    revision: requiredString(value.revision, `${label}.revision`, SHA40),
  });
}

function jobLink(value: unknown, label: string): RequiredCheckJobLinkV1 {
  if (!isRecord(value)) fail(`${label} is invalid`);
  exactKeys(value, label, ['run_id', 'attempt', 'job_id', 'job_name', 'run_url', 'job_url']);
  return Object.freeze({
    run_id: positiveInteger(value.run_id, `${label}.run_id`),
    attempt: positiveInteger(value.attempt, `${label}.attempt`),
    job_id: positiveInteger(value.job_id, `${label}.job_id`),
    job_name: requiredString(value.job_name, `${label}.job_name`),
    run_url: requiredString(value.run_url, `${label}.run_url`),
    job_url: requiredString(value.job_url, `${label}.job_url`, ACTIONS_URL),
  });
}

function failurePoint(value: unknown, label: string): RequiredCheckFailurePointV1 {
  if (!isRecord(value)) fail(`${label} is invalid`);
  exactKeys(value, label, ['run_id', 'attempt', 'job_id', 'job_name',
    'run_url', 'job_url', 'steps', 'tests', 'shape', 'logs_available', 'failure_excerpt', 'platform_evidence', 'scope']);
  if (typeof value.logs_available !== 'boolean') fail(`${label}.logs_available is invalid`);
  return Object.freeze({
    ...jobLink({
      run_id: value.run_id, attempt: value.attempt, job_id: value.job_id,
      job_name: value.job_name, run_url: value.run_url, job_url: value.job_url,
    }, label),
    steps: Object.freeze(stringArray(value.steps, `${label}.steps`)),
    tests: Object.freeze(stringArray(value.tests, `${label}.tests`)),
    shape: failureShape(value.shape, `${label}.shape`),
    logs_available: value.logs_available,
    failure_excerpt: nullableString(value.failure_excerpt, `${label}.failure_excerpt`),
    platform_evidence: Object.freeze(stringArray(value.platform_evidence, `${label}.platform_evidence`)),
    scope: scope(value.scope, `${label}.scope`),
  });
}

function childFailure(value: unknown, label: string): RequiredCheckChildFailureV1 {
  if (!isRecord(value)) fail(`${label} is invalid`);
  exactKeys(value, label, ['association', 'failure', 'attempts']);
  if (!Array.isArray(value.attempts) || value.attempts.length === 0) fail(`${label}.attempts is invalid`);
  const attempts = value.attempts.map((entry, index) => {
    if (!isRecord(entry)) fail(`${label}.attempts[${index}] is invalid`);
    exactKeys(entry, `${label}.attempts[${index}]`, ['attempt', 'job_id', 'job_name', 'conclusion']);
    return Object.freeze({
      attempt: positiveInteger(entry.attempt, `${label}.attempts[${index}].attempt`),
      job_id: positiveInteger(entry.job_id, `${label}.attempts[${index}].job_id`),
      job_name: requiredString(entry.job_name, `${label}.attempts[${index}].job_name`),
      conclusion: attemptConclusion(entry.conclusion, `${label}.attempts[${index}].conclusion`),
    });
  });
  return Object.freeze({
    association: oneOf(value.association, ['declared_needs', 'unknown'], `${label}.association`),
    failure: failurePoint(value.failure, `${label}.failure`),
    attempts: Object.freeze(attempts),
  });
}

/** Strict reader for a stored evidence record; a receipt may not carry an invented shape. */
export function validateRequiredCheckFailureEvidence(value: unknown): RequiredCheckFailureEvidenceV1 {
  if (!isRecord(value)) fail('RequiredCheckFailureEvidence must be an object');
  exactKeys(value, 'RequiredCheckFailureEvidence', ['protocol', 'kind', 'check_name', 'head_sha', 'base_sha',
    'merge_tree_sha', 'workflow', 'association', 'summary', 'failed', 'failed_children', 'retry', 'observed_result', 'cause', 'cause_evidence']);
  if (value.protocol !== REQUIRED_CHECK_FAILURE_PROTOCOL || value.kind !== REQUIRED_CHECK_FAILURE_KIND) {
    fail('RequiredCheckFailureEvidence kind/protocol is invalid');
  }
  const association = associationValue(value.association, 'RequiredCheckFailureEvidence.association');
  const summary = value.summary === null ? null : jobLink(value.summary, 'RequiredCheckFailureEvidence.summary');
  if (association === 'direct' && summary !== null) fail('RequiredCheckFailureEvidence.summary must be null for a direct check');
  if (association !== 'direct' && summary === null) fail('RequiredCheckFailureEvidence.summary is required for a summary check');
  const failed = failurePoint(value.failed, 'RequiredCheckFailureEvidence.failed');
  if (!Array.isArray(value.failed_children)) fail('RequiredCheckFailureEvidence.failed_children is invalid');
  const failedChildren = value.failed_children.map((entry, index) =>
    childFailure(entry, `RequiredCheckFailureEvidence.failed_children[${index}]`));
  if (association === 'direct' && failedChildren.length > 0) {
    fail('RequiredCheckFailureEvidence.failed_children must be empty for a direct check');
  }
  if (association === 'declared_needs' && (failedChildren.length === 0 || failedChildren[0]!.association !== 'declared_needs'
    || failedChildren[0]!.failure.job_id !== failed.job_id)) {
    fail('RequiredCheckFailureEvidence.failed must be the first proven failed child');
  }
  if (association === 'unknown' && (failed.job_id !== summary!.job_id || failed.attempt !== summary!.attempt)) {
    fail('RequiredCheckFailureEvidence.failed must stay on the summary job when the association is unknown');
  }
  const retry = (() => {
    if (!isRecord(value.retry)) fail('RequiredCheckFailureEvidence.retry is invalid');
    exactKeys(value.retry, 'RequiredCheckFailureEvidence.retry', ['attempted', 'attempts', 'outcome', 'revalidated', 'reason', 'latest']);
    if (typeof value.retry.attempted !== 'boolean' || typeof value.retry.revalidated !== 'boolean') {
      fail('RequiredCheckFailureEvidence.retry flags are invalid');
    }
    if (!isRecord(value.retry.latest)) fail('RequiredCheckFailureEvidence.retry.latest is invalid');
    exactKeys(value.retry.latest, 'RequiredCheckFailureEvidence.retry.latest', ['run_id', 'attempt', 'job_id',
      'job_name', 'run_url', 'job_url', 'conclusion', 'scope']);
    const outcome = retryOutcome(value.retry.outcome, 'RequiredCheckFailureEvidence.retry.outcome');
    const reason = retryReason(value.retry.reason, 'RequiredCheckFailureEvidence.retry.reason');
    if (outcome === 'failed_then_not_revalidated' && reason === null) {
      fail('RequiredCheckFailureEvidence.retry.reason is required when not revalidated');
    }
    if (outcome !== 'failed_then_not_revalidated' && reason !== null) {
      fail('RequiredCheckFailureEvidence.retry.reason is only valid when not revalidated');
    }
    return Object.freeze({
      attempted: value.retry.attempted,
      attempts: positiveInteger(value.retry.attempts, 'RequiredCheckFailureEvidence.retry.attempts'),
      outcome,
      revalidated: value.retry.revalidated,
      reason,
      latest: Object.freeze({
        ...jobLink({
          run_id: value.retry.latest.run_id, attempt: value.retry.latest.attempt, job_id: value.retry.latest.job_id,
          job_name: value.retry.latest.job_name, run_url: value.retry.latest.run_url, job_url: value.retry.latest.job_url,
        }, 'RequiredCheckFailureEvidence.retry.latest'),
        conclusion: attemptConclusion(value.retry.latest.conclusion, 'RequiredCheckFailureEvidence.retry.latest.conclusion'),
        scope: scope(value.retry.latest.scope, 'RequiredCheckFailureEvidence.retry.latest.scope'),
      }),
    });
  })();
  if (retry.latest.attempt !== retry.attempts) {
    fail('RequiredCheckFailureEvidence.retry.latest must link the last attempt');
  }
  return Object.freeze({
    protocol: REQUIRED_CHECK_FAILURE_PROTOCOL,
    kind: REQUIRED_CHECK_FAILURE_KIND,
    check_name: requiredString(value.check_name, 'RequiredCheckFailureEvidence.check_name'),
    head_sha: requiredString(value.head_sha, 'RequiredCheckFailureEvidence.head_sha', SHA40),
    base_sha: requiredString(value.base_sha, 'RequiredCheckFailureEvidence.base_sha', SHA40),
    merge_tree_sha: value.merge_tree_sha === null ? null
      : requiredString(value.merge_tree_sha, 'RequiredCheckFailureEvidence.merge_tree_sha', GIT_OID),
    workflow: workflow(value.workflow, 'RequiredCheckFailureEvidence.workflow'),
    association,
    summary,
    failed,
    failed_children: Object.freeze(failedChildren),
    retry,
    observed_result: observedResult(value.observed_result, 'RequiredCheckFailureEvidence.observed_result'),
    cause: cause(value.cause, 'RequiredCheckFailureEvidence.cause'),
    cause_evidence: Object.freeze(stringArray(value.cause_evidence, 'RequiredCheckFailureEvidence.cause_evidence')),
  });
}

export function validateRequiredCheckFailureEvidenceList(value: unknown): RequiredCheckFailureEvidenceV1[] {
  if (!Array.isArray(value)) fail('AcceptanceReceipt failures must be an array');
  return value.map(validateRequiredCheckFailureEvidence);
}

function isFailureAttempt(attempt: RequiredCheckAttemptObservationV1): boolean {
  return FAILED_CONCLUSIONS.has(attempt.conclusion);
}

function platformLines(attempt: RequiredCheckAttemptObservationV1): string[] {
  const lines = [...attempt.platform_evidence];
  if (attempt.failure_excerpt !== null) {
    for (const line of attempt.failure_excerpt.split(/\r?\n/u)) {
      if (line.trim() !== '' && PLATFORM_PATTERN.test(line)) lines.push(line.trim());
    }
  }
  return lines;
}

/** Shape is what the attempt reported; cause is what the evidence can prove. */
function failureShapeOf(attempt: RequiredCheckAttemptObservationV1): RequiredCheckFailureShape {
  if (attempt.conclusion === 'timed_out') return 'timeout';
  if (attempt.conclusion === 'cancelled'
    || platformLines(attempt).some((line) => /runner|shutdown|shut down|lost communication/iu.test(line))) {
    return 'runner_abort';
  }
  const dependencySource = `${attempt.steps.join(' ')}\n${attempt.failure_excerpt ?? ''}`;
  if (DEPENDENCY_PATTERN.test(dependencySource)) return 'dependency_install_failure';
  if (attempt.failure_excerpt !== null) {
    if (ASSERTION_PATTERN.test(attempt.failure_excerpt)) return 'assertion_mismatch';
    if (/\btimed out\b/iu.test(attempt.failure_excerpt)) return 'timeout';
  }
  // Several steps failing together is the provider-visible runner-abort shape;
  // it is not an infrastructure cause without platform evidence.
  if (attempt.steps.length > 1) return 'runner_abort';
  if (!attempt.logs_available) return 'logs_unavailable';
  return 'other';
}

function causeOf(
  shape: RequiredCheckFailureShape,
  attempt: RequiredCheckAttemptObservationV1,
  declared: RequiredCheckDeclaredCauseV1 | null,
): { cause: RequiredCheckCause; evidence: string[] } {
  const platform = platformLines(attempt);
  if (shape === 'runner_abort' && platform.length > 0) return { cause: 'infrastructure', evidence: platform };
  if (shape === 'dependency_install_failure' && attempt.failure_excerpt !== null
    && NETWORK_PATTERN.test(attempt.failure_excerpt)) {
    return { cause: 'infrastructure', evidence: attempt.failure_excerpt.split(/\r?\n/u).filter((line) => NETWORK_PATTERN.test(line)) };
  }
  if (declared !== null && declared.evidence.length > 0) return { cause: declared.cause, evidence: [...declared.evidence] };
  return { cause: 'unknown', evidence: [] };
}

function frozenScope(value: RequiredCheckScopeV1): RequiredCheckScopeV1 {
  return Object.freeze({ executed: Object.freeze([...value.executed]), skipped: Object.freeze([...value.skipped]) });
}

function attemptLink(attempt: RequiredCheckAttemptObservationV1): RequiredCheckJobLinkV1 {
  return Object.freeze({    run_id: attempt.run_id,
    attempt: attempt.attempt,
    job_id: attempt.job_id,
    job_name: attempt.job_name,
    run_url: attempt.run_url,
    job_url: attempt.job_url,
  });
}

function failurePointOf(attempt: RequiredCheckAttemptObservationV1): RequiredCheckFailurePointV1 {
  return Object.freeze({
    ...attemptLink(attempt),
    steps: Object.freeze([...attempt.steps]),
    tests: Object.freeze([...attempt.failed_tests]),
    shape: failureShapeOf(attempt),
    logs_available: attempt.logs_available,
    failure_excerpt: attempt.failure_excerpt,
    platform_evidence: Object.freeze(platformLines(attempt)),
    scope: frozenScope(attempt.scope),
  });
}

interface RetryAssessment {
  readonly outcome: RequiredCheckRetryOutcome;
  readonly revalidated: boolean;
  readonly reason: RequiredCheckRetryReason | null;
}

function revalidation(
  attempts: readonly RequiredCheckAttemptObservationV1[],
  failedTests: readonly string[],
): RetryAssessment {
  const latest = attempts[attempts.length - 1]!;
  if (attempts.length === 1) return { outcome: 'not_attempted', revalidated: false, reason: null };
  if (latest.conclusion !== 'success') return { outcome: 'still_failing', revalidated: false, reason: null };
  // The failure must name the test it observed. A summary job's own step label
  // cannot stand in for the failed test identifier.
  if (failedTests.length === 0) {
    return { outcome: 'failed_then_not_revalidated', revalidated: false, reason: 'failed_test_identifier_unavailable' };
  }
  // Job and step names are not test identifiers. Without a test-level source,
  // the retry cannot prove that the failed test ran again.
  const execution = latest.test_execution;
  if (execution === null || execution.status === 'unavailable') {
    return { outcome: 'failed_then_not_revalidated', revalidated: false, reason: 'test_execution_evidence_unavailable' };
  }
  if (failedTests.some((identifier) => testIdentifierPresent(execution.skipped, identifier))) {
    return { outcome: 'failed_then_not_revalidated', revalidated: false, reason: 'original_test_skipped' };
  }
  const revalidated = failedTests.every((identifier) => testIdentifierPresent(execution.executed, identifier));
  return {
    outcome: revalidated ? 'failed_then_passed' : 'failed_then_not_revalidated',
    revalidated,
    reason: revalidated ? null : 'original_test_not_executed',
  };
}

interface ObservedChildFailure {
  readonly failure: RequiredCheckChildFailureV1;
  readonly observation: RequiredCheckAttemptObservationV1;
}

function childFailures(
  children: readonly RequiredCheckChildObservationV1[],
  runId: number,
): ObservedChildFailure[] {
  const failures: ObservedChildFailure[] = [];
  for (const child of children) {
    for (const attempt of child.attempts) {
      if (attempt.run_id !== runId) fail('RequiredCheckObservation children must share one run');
    }
    const failed = child.attempts.find(isFailureAttempt);
    if (!failed) continue;
    failures.push(Object.freeze({
      observation: failed,
      failure: Object.freeze({
        association: child.association,
        failure: failurePointOf(failed),
        attempts: Object.freeze(child.attempts.map((attempt) => Object.freeze({
          attempt: attempt.attempt,
          job_id: attempt.job_id,
          job_name: attempt.job_name,
          conclusion: attempt.conclusion,
        }))),
      }),
    }));
  }
  return failures;
}

/**
 * Deterministic projection of one observed required-check history. It performs
 * no I/O. A passing rerun never becomes an infrastructure claim: without
 * platform or network evidence the cause stays `unknown`.
 */
export function assessRequiredCheckFailure(input: RequiredCheckObservationV1): RequiredCheckFailureEvidenceV1 {
  if (!input.check_name.trim()) fail('RequiredCheckObservation.check_name is required');
  if (!SHA40.test(input.head_sha)) fail('RequiredCheckObservation.head_sha is invalid');
  if (!SHA40.test(input.base_sha)) fail('RequiredCheckObservation.base_sha is invalid');
  if (input.attempts.length === 0) fail('RequiredCheckObservation.attempts is empty');
  for (const [index, attempt] of input.attempts.entries()) {
    if (attempt.attempt !== index + 1) fail('RequiredCheckObservation attempts must be ordered from 1');
    if (attempt.run_id !== input.attempts[0]!.run_id) fail('RequiredCheckObservation attempts must share one run');
  }
  const incident = input.attempts.find(isFailureAttempt);
  const children = childFailures(input.children, input.attempts[0]!.run_id);
  const proven = children.filter((child) => child.failure.association === 'declared_needs');
  const association: RequiredCheckAssociationV1 = proven.length > 0 ? 'declared_needs'
    : input.association === 'direct' ? 'direct'
    : 'unknown';
  if (association !== 'declared_needs' && !incident) {
    fail('RequiredCheckObservation has no failed attempt');
  }
  const summary = association === 'direct' ? null : attemptLink(incident ?? input.attempts[0]!);
  if (association === 'unknown' && summary!.job_id !== incident!.job_id) {
    fail('RequiredCheckObservation unknown association must stay on the summary job');
  }
  const failure = association === 'declared_needs' ? proven[0]!.failure.failure : failurePointOf(incident!);
  const incidentObservation = association === 'declared_needs' ? proven[0]!.observation : incident!;
  const failedChildren = association === 'declared_needs'
    ? proven.map((child) => child.failure)
    : children.map((child) => child.failure);
  const shape = failure.shape;
  const retry = revalidation(input.attempts, failure.tests);
  const assessed = causeOf(shape, incidentObservation, input.declared_cause);
  const failedThenPassed = retry.outcome === 'failed_then_passed' || retry.outcome === 'failed_then_not_revalidated';
  // A passing rerun is not proof of an infrastructure flake, even when the
  // caller declared one; keep the observed evidence and stay unknown.
  const finalCause = failedThenPassed && assessed.cause === 'infrastructure' ? 'unknown' : assessed.cause;
  const causeEvidence = finalCause === 'unknown' ? [] : assessed.evidence;
  const latest = input.attempts[input.attempts.length - 1]!;
  return Object.freeze({
    protocol: REQUIRED_CHECK_FAILURE_PROTOCOL,
    kind: REQUIRED_CHECK_FAILURE_KIND,
    check_name: input.check_name,
    head_sha: input.head_sha,
    base_sha: input.base_sha,
    merge_tree_sha: input.merge_tree_sha,
    workflow: Object.freeze({ ...input.workflow }),
    association,
    summary,
    failed: failure,
    failed_children: Object.freeze(failedChildren),
    retry: Object.freeze({
      attempted: input.attempts.length > 1,
      attempts: input.attempts.length,
      outcome: retry.outcome,
      revalidated: retry.revalidated,
      reason: retry.reason,
      latest: Object.freeze({
        ...attemptLink(latest),
        conclusion: latest.conclusion,
        scope: frozenScope(latest.scope),
      }),
    }),
    observed_result: retry.outcome === 'failed_then_passed' ? 'failed_then_passed'
      : retry.outcome === 'failed_then_not_revalidated' ? 'not_revalidated' : 'failed',
    cause: finalCause,
    cause_evidence: Object.freeze(causeEvidence),
  });
}
