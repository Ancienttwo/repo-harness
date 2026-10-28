// Development fixtures for GET /api/v1/repositories/{id}/tests. The shape
// follows src/core/operator/tests.ts; the fixture passes the same strict
// decoder the browser applies to served snapshots, so drift fails loudly.

import {
  OPERATOR_TESTS_KIND,
  TESTS_CHANNEL,
  TEST_PROJECTION_SCHEMA,
  testRunCommand,
  type TestsSnapshotV1,
} from '../../core/operator/tests';

function projection(file: string, capabilities: readonly { id: string; via: ('import' | 'verification')[] }[]) {
  return { file, capabilities, command: testRunCommand(file) };
}

function result(file: string, duration_ms: number, cases: { suite: string | null; name: string; result: 'passed' | 'failed' | 'skipped'; duration_ms: number }[]) {
  return { file, duration_ms, cases };
}

/** The open `[CI repair]` issue this repository has; Home and the Tests page must name the same one. */
export const readyRepairIssue = {
  number: 1101,
  title: '[CI repair] daily full run failed',
  url: 'https://github.com/Ancienttwo/repo-harness/issues/1101',
};

/** A finished daily run: three files with results (one failing) and one file the run has no entry for. */
export function readyTests(now: number): TestsSnapshotV1 {
  return {
    protocol: 1,
    kind: OPERATOR_TESTS_KIND,
    repository_id: 'repo_a5b76eee64af71c3',
    collected_at: new Date(now - 5 * 60_000).toISOString(),
    run: {
      id: 4036605416, attempt: 1,
      head_sha: '49f7ba6fa3c1d2e4b5a6978877665544332211aa',
      created_at: new Date(now - 6 * 3600_000).toISOString(),
      conclusion: 'success', channel: TESTS_CHANNEL,
    },
    projection: {
      state: 'ok', files: [
        projection('tests/cli/runner-z.test.ts', [{ id: 'workflow-engine.execution-primitives', via: ['import'] }]),
        projection('tests/loose-root.test.ts', [{ id: 'runtime-harness.operator', via: ['verification'] }]),
        projection('tests/operator/server-y.test.ts', [
          { id: 'runtime-harness.operator', via: ['import', 'verification'] },
          { id: 'runtime-harness.task-agent-host', via: ['import'] },
        ]),
        projection('tests/operator/core-x.test.ts', [{ id: 'runtime-harness.operator', via: ['import'] }]),
      ],
    },
    results: {
      state: 'ok', files: [
        result('tests/cli/runner-z.test.ts', 812, [
          { suite: null, name: 'runner queues one task per worker', result: 'passed', duration_ms: 120 },
          { suite: 'runner backoff', name: 'doubles the delay after a failure', result: 'passed', duration_ms: 64 },
          { suite: 'runner backoff', name: 'stops at the ceiling', result: 'skipped', duration_ms: 0 },
        ]),
        result('tests/operator/server-y.test.ts', 1540, [
          { suite: 'operator server', name: 'serves the tests route from cache', result: 'passed', duration_ms: 210 },
          { suite: 'operator server', name: 'refuses a write route', result: 'passed', duration_ms: 98 },
          { suite: 'operator server', name: 'keeps GET free of side effects', result: 'failed', duration_ms: 340 },
        ]),
        result('tests/operator/core-x.test.ts', 430, [
          { suite: null, name: 'collector cache reads back decoded', result: 'passed', duration_ms: 88 },
          { suite: null, name: 'collector cycle never overlaps', result: 'passed', duration_ms: 51 },
        ]),
      ],
    },
    repairs: { state: 'ok', issues: [readyRepairIssue] },
  };
}
