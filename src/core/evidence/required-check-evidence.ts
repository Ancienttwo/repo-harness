/**
 * Required-check failure evidence (repo-harness issue #1211).
 *
 * A required-check failure is observable provider evidence, not a verdict.
 * This module records the exact head/base (or merge tree), the workflow
 * version, the run/attempt/job links, the executed and skipped scope, the
 * failed job and step, the retry outcome and a typed cause with the evidence
 * that supports it.
 *
 * A same-SHA rerun that passes is recorded as `failed_then_passed`. It is
 * never converted into a proven infrastructure flake, and a rerun that skips
 * the originally failed test is not revalidation. The merge decision is made
 * separately, by the existing publication policy, from the observed check
 * buckets; this module never clears a blocker.
 */

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
  readonly shape: RequiredCheckFailureShape;
  readonly logs_available: boolean;
  /** Provider annotation text when the job published any; never invented. */
  readonly failure_excerpt: string | null;
  /** Lines that prove a platform or runner signal, not a product assertion. */
  readonly platform_evidence: readonly string[];
  readonly scope: RequiredCheckScopeV1;
}

export interface RequiredCheckRetryV1 {
  readonly attempted: boolean;
  readonly attempts: number;
  readonly outcome: RequiredCheckRetryOutcome;
  /** True only when every failed identifier provably executed again and none was skipped. */
  readonly revalidated: boolean;
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
  readonly failed: RequiredCheckFailurePointV1;
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

function attemptConclusion(value: unknown, label: string): RequiredCheckAttemptConclusion {
  if (!['success', 'failure', 'timed_out', 'cancelled', 'skipped', 'unknown'].includes(String(value))) {
    fail(`${label} is invalid`);
  }
  return value as RequiredCheckAttemptConclusion;
}

function failureShape(value: unknown, label: string): RequiredCheckFailureShape {
  if (!['runner_abort', 'timeout', 'assertion_mismatch', 'dependency_install_failure', 'logs_unavailable', 'other'].includes(String(value))) {
    fail(`${label} is invalid`);
  }
  return value as RequiredCheckFailureShape;
}

function cause(value: unknown, label: string): RequiredCheckCause {
  if (!['infrastructure', 'test_defect', 'product_defect', 'unknown'].includes(String(value))) {
    fail(`${label} is invalid`);
  }
  return value as RequiredCheckCause;
}

function observedResult(value: unknown, label: string): RequiredCheckObservedResult {
  if (!['failed', 'failed_then_passed', 'not_revalidated'].includes(String(value))) {
    fail(`${label} is invalid`);
  }
  return value as RequiredCheckObservedResult;
}

function retryOutcome(value: unknown, label: string): RequiredCheckRetryOutcome {
  if (!['not_attempted', 'failed_then_passed', 'failed_then_not_revalidated', 'still_failing'].includes(String(value))) {
    fail(`${label} is invalid`);
  }
  return value as RequiredCheckRetryOutcome;
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

/** Strict reader for a stored evidence record; a receipt may not carry an invented shape. */
export function validateRequiredCheckFailureEvidence(value: unknown): RequiredCheckFailureEvidenceV1 {
  if (!isRecord(value)) fail('RequiredCheckFailureEvidence must be an object');
  exactKeys(value, 'RequiredCheckFailureEvidence', ['protocol', 'kind', 'check_name', 'head_sha', 'base_sha',
    'merge_tree_sha', 'workflow', 'failed', 'retry', 'observed_result', 'cause', 'cause_evidence']);
  if (value.protocol !== REQUIRED_CHECK_FAILURE_PROTOCOL || value.kind !== REQUIRED_CHECK_FAILURE_KIND) {
    fail('RequiredCheckFailureEvidence kind/protocol is invalid');
  }
  const failed = (() => {
    if (!isRecord(value.failed)) fail('RequiredCheckFailureEvidence.failed is invalid');
    exactKeys(value.failed, 'RequiredCheckFailureEvidence.failed', ['run_id', 'attempt', 'job_id', 'job_name',
      'run_url', 'job_url', 'steps', 'shape', 'logs_available', 'failure_excerpt', 'platform_evidence', 'scope']);
    if (typeof value.failed.logs_available !== 'boolean') fail('RequiredCheckFailureEvidence.failed.logs_available is invalid');
    return Object.freeze({
      ...jobLink({
        run_id: value.failed.run_id, attempt: value.failed.attempt, job_id: value.failed.job_id,
        job_name: value.failed.job_name, run_url: value.failed.run_url, job_url: value.failed.job_url,
      }, 'RequiredCheckFailureEvidence.failed'),
      steps: Object.freeze(stringArray(value.failed.steps, 'RequiredCheckFailureEvidence.failed.steps')),
      shape: failureShape(value.failed.shape, 'RequiredCheckFailureEvidence.failed.shape'),
      logs_available: value.failed.logs_available,
      failure_excerpt: nullableString(value.failed.failure_excerpt, 'RequiredCheckFailureEvidence.failed.failure_excerpt'),
      platform_evidence: Object.freeze(stringArray(value.failed.platform_evidence, 'RequiredCheckFailureEvidence.failed.platform_evidence')),
      scope: scope(value.failed.scope, 'RequiredCheckFailureEvidence.failed.scope'),
    });
  })();
  const retry = (() => {
    if (!isRecord(value.retry)) fail('RequiredCheckFailureEvidence.retry is invalid');
    exactKeys(value.retry, 'RequiredCheckFailureEvidence.retry', ['attempted', 'attempts', 'outcome', 'revalidated', 'latest']);
    if (typeof value.retry.attempted !== 'boolean' || typeof value.retry.revalidated !== 'boolean') {
      fail('RequiredCheckFailureEvidence.retry flags are invalid');
    }
    if (!isRecord(value.retry.latest)) fail('RequiredCheckFailureEvidence.retry.latest is invalid');
    exactKeys(value.retry.latest, 'RequiredCheckFailureEvidence.retry.latest', ['run_id', 'attempt', 'job_id',
      'job_name', 'run_url', 'job_url', 'conclusion', 'scope']);
    return Object.freeze({
      attempted: value.retry.attempted,
      attempts: positiveInteger(value.retry.attempts, 'RequiredCheckFailureEvidence.retry.attempts'),
      outcome: retryOutcome(value.retry.outcome, 'RequiredCheckFailureEvidence.retry.outcome'),
      revalidated: value.retry.revalidated,
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
  return Object.freeze({
    protocol: REQUIRED_CHECK_FAILURE_PROTOCOL,
    kind: REQUIRED_CHECK_FAILURE_KIND,
    check_name: requiredString(value.check_name, 'RequiredCheckFailureEvidence.check_name'),
    head_sha: requiredString(value.head_sha, 'RequiredCheckFailureEvidence.head_sha', SHA40),
    base_sha: requiredString(value.base_sha, 'RequiredCheckFailureEvidence.base_sha', SHA40),
    merge_tree_sha: value.merge_tree_sha === null ? null
      : requiredString(value.merge_tree_sha, 'RequiredCheckFailureEvidence.merge_tree_sha', GIT_OID),
    workflow: workflow(value.workflow, 'RequiredCheckFailureEvidence.workflow'),
    failed,
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

function revalidation(attempts: readonly RequiredCheckAttemptObservationV1[]): { outcome: RequiredCheckRetryOutcome; revalidated: boolean } {
  const latest = attempts[attempts.length - 1]!;
  if (attempts.length === 1) return { outcome: 'not_attempted', revalidated: false };
  if (latest.conclusion !== 'success') return { outcome: 'still_failing', revalidated: false };
  const incident = attempts.find(isFailureAttempt)!;
  const identifiers = [...incident.failed_tests, ...incident.steps];
  if (identifiers.length === 0) return { outcome: 'failed_then_passed', revalidated: false };
  const skipped = new Set(latest.scope.skipped);
  const executed = new Set(latest.scope.executed);
  const revalidated = identifiers.every((identifier) => executed.has(identifier) && !skipped.has(identifier));
  return { outcome: revalidated ? 'failed_then_passed' : 'failed_then_not_revalidated', revalidated };
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
  if (!incident) fail('RequiredCheckObservation has no failed attempt');
  const latest = input.attempts[input.attempts.length - 1]!;
  const shape = failureShapeOf(incident);
  const retry = revalidation(input.attempts);
  const assessed = causeOf(shape, incident, input.declared_cause);
  const failedThenPassed = retry.outcome === 'failed_then_passed' || retry.outcome === 'failed_then_not_revalidated';
  // A passing rerun is not proof of an infrastructure flake, even when the
  // caller declared one; keep the observed evidence and stay unknown.
  const finalCause = failedThenPassed && assessed.cause === 'infrastructure' ? 'unknown' : assessed.cause;
  const causeEvidence = finalCause === 'unknown' ? [] : assessed.evidence;
  return Object.freeze({
    protocol: REQUIRED_CHECK_FAILURE_PROTOCOL,
    kind: REQUIRED_CHECK_FAILURE_KIND,
    check_name: input.check_name,
    head_sha: input.head_sha,
    base_sha: input.base_sha,
    merge_tree_sha: input.merge_tree_sha,
    workflow: Object.freeze({ ...input.workflow }),
    failed: Object.freeze({
      ...jobLink({ run_id: incident.run_id, attempt: incident.attempt, job_id: incident.job_id,
        job_name: incident.job_name, run_url: incident.run_url, job_url: incident.job_url }, 'RequiredCheckObservation.failed'),
      steps: Object.freeze([...incident.steps]),
      shape,
      logs_available: incident.logs_available,
      failure_excerpt: incident.failure_excerpt,
      platform_evidence: Object.freeze(platformLines(incident)),
      scope: frozenScope(incident.scope),
    }),
    retry: Object.freeze({
      attempted: input.attempts.length > 1,
      attempts: input.attempts.length,
      outcome: retry.outcome,
      revalidated: retry.revalidated,
      latest: Object.freeze({
        ...jobLink({ run_id: latest.run_id, attempt: latest.attempt, job_id: latest.job_id,
          job_name: latest.job_name, run_url: latest.run_url, job_url: latest.job_url }, 'RequiredCheckObservation.latest'),
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
