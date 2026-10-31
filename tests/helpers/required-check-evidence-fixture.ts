import {
  assessRequiredCheckFailure,
  type RequiredCheckAttemptObservationV1,
  type RequiredCheckFailureEvidenceV1,
  type RequiredCheckObservationV1,
} from '../../src/core/evidence/required-check-evidence';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);

export function requiredCheckAttempt(
  overrides: Partial<RequiredCheckAttemptObservationV1> = {},
): RequiredCheckAttemptObservationV1 {
  const attempt = overrides.attempt ?? 1;
  return {
    run_id: 123,
    attempt,
    job_id: 456,
    job_name: 'test (ubuntu-latest)',
    run_url: 'https://github.com/example/repo-harness/actions/runs/123',
    job_url: 'https://github.com/example/repo-harness/actions/runs/123/job/456',
    conclusion: 'failure',
    steps: ['Run tests'],
    failed_tests: [],
    logs_available: true,
    failure_excerpt: 'AssertionError: expected 1 to deeply equal 2',
    platform_evidence: [],
    scope: { executed: ['Run tests'], skipped: [] },
    ...overrides,
  };
}

export function requiredCheckObservation(
  attempts: RequiredCheckAttemptObservationV1[],
  overrides: Partial<RequiredCheckObservationV1> = {},
): RequiredCheckObservationV1 {
  return {
    check_name: 'Required / CI',
    head_sha: HEAD,
    base_sha: BASE,
    merge_tree_sha: null,
    workflow: { path: '.github/workflows/ci.yml', id: 99, revision: HEAD },
    attempts,
    declared_cause: null,
    ...overrides,
  };
}

/** The issue's main case: assertion failure, same-SHA rerun passes. */
export function assertionThenPassedEvidence(): RequiredCheckFailureEvidenceV1 {
  return assessRequiredCheckFailure(requiredCheckObservation([
    requiredCheckAttempt({ attempt: 1, failed_tests: ['session-runtime > chunk boundary'] }),
    requiredCheckAttempt({ attempt: 2, job_id: 789, job_url: 'https://github.com/example/repo-harness/actions/runs/123/job/789',
      conclusion: 'success', steps: [], failure_excerpt: null,
      scope: { executed: ['test (ubuntu-latest)', 'Run tests', 'session-runtime > chunk boundary'], skipped: [] } }),
  ]));
}

/** A real product failure with log evidence and a declared cause. */
export function productFailureEvidence(): RequiredCheckFailureEvidenceV1 {
  return assessRequiredCheckFailure(requiredCheckObservation([
    requiredCheckAttempt({ failure_excerpt: 'AssertionError: expected product response code 200 but received 500' }),
  ], {
    declared_cause: { cause: 'product_defect',
      evidence: ['AssertionError: expected product response code 200 but received 500'] },
  }));
}
