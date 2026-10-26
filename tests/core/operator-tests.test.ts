import { describe, expect, test } from 'bun:test';

import {
  decodeTestsSnapshot,
  isCiRepairIssueBody,
  parseJUnitReport,
  parseTestProjection,
  testRunCommand,
  type TestsSnapshotV1,
} from '../../src/core/operator/tests';

/** The shape `bun test --reporter=junit` writes: one file suite, nested describe suites, properties, skipped and failed cases. */
const REPORT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="4" assertions="9" failures="1" skipped="1" time="0.5">
  <testsuite name="tests/cli/example.test.ts" file="tests/cli/example.test.ts" tests="4" assertions="9" failures="1" skipped="1" time="0.4321" hostname="runner">
    <properties>
      <property name="ci" value="https://github.com/owner/repo/actions/runs/1" />
      <property name="commit" value="0123456789abcdef0123456789abcdef01234567" />
    </properties>
    <testcase name="top level case" classname="" time="0.01" file="tests/cli/example.test.ts" line="3" assertions="1" />
    <testsuite name="outer" file="tests/cli/example.test.ts" line="5" tests="3" time="0.3">
      <testsuite name="inner" file="tests/cli/example.test.ts" line="6" tests="2" time="0.2">
        <testcase name="reads {&quot;days&quot;:0} -&gt; fails closed" classname="inner" time="0.0015" file="tests/cli/example.test.ts" line="7" assertions="2" />
        <testcase name="breaks" classname="inner" time="0.25" file="tests/cli/example.test.ts" line="9" assertions="3">
          <failure type="AssertionError" message="expected /Users/someone/secret-token">error: expect(received).toBe(expected) at /home/runner/work/repo/tests/cli/example.test.ts:10 a &lt; b > c</failure>
        </testcase>
      </testsuite>
      <testcase name="later > raw" classname="outer" time="0" file="tests/cli/example.test.ts" line="12" assertions="0">
        <skipped />
      </testcase>
    </testsuite>
  </testsuite>
</testsuites>
`;

const RUN: TestsSnapshotV1['run'] = { id: 40236195434, attempt: 2, head_sha: 'a'.repeat(40), created_at: '2026-10-25T21:35:21Z', conclusion: 'failure', channel: 'daily_full' };

function snapshot(): TestsSnapshotV1 {
  return {
    protocol: 1, kind: 'operator_tests', repository_id: 'repo-a', collected_at: '2026-10-27T00:00:00.000Z', run: RUN,
    projection: { state: 'ok', files: [{ file: 'tests/cli/example.test.ts', capabilities: [{ id: 'capability.a', via: ['import'] }], command: testRunCommand('tests/cli/example.test.ts') }] },
    results: { state: 'ok', files: [parseJUnitReport(REPORT)] },
    repairs: { state: 'ok', issues: [{ number: 7, title: '[CI repair] daily full run incomplete 2026-10-25', url: 'https://github.com/owner/repo/issues/7' }] },
  };
}

describe('JUnit report', () => {
  test('keeps file, suite path, case name, result and duration, and drops failure text and properties', () => {
    const report = parseJUnitReport(REPORT);
    expect(report).toEqual({ file: 'tests/cli/example.test.ts', duration_ms: 432, cases: [
      { suite: null, name: 'top level case', result: 'passed', duration_ms: 10 },
      { suite: 'outer > inner', name: 'reads {"days":0} -> fails closed', result: 'passed', duration_ms: 2 },
      { suite: 'outer > inner', name: 'breaks', result: 'failed', duration_ms: 250 },
      { suite: 'outer', name: 'later > raw', result: 'skipped', duration_ms: 0 },
    ] });
    const text = JSON.stringify(report);
    for (const hidden of ['secret-token', '/home/runner', 'AssertionError', 'actions/runs', '0123456789abcdef']) expect(text).not.toContain(hidden);
  });

  test('a private path in a case name is masked', () => {
    const report = parseJUnitReport(REPORT.replace('top level case', 'reads /Users/someone/project/file'));
    expect(report.cases[0]!.name).toBe('reads [private path]');
  });

  test('a report that is not well-formed Bun JUnit throws', () => {
    for (const broken of [
      REPORT.replace('</testsuites>', ''),
      REPORT.replace('<testcase name="breaks"', '<testcase title="breaks"'),
      REPORT.replace('file="tests/cli/example.test.ts" tests="4"', 'file="/abs/example.test.ts" tests="4"'),
      REPORT.replace('time="0.25"', 'time="-1"'),
      REPORT.replace('&quot;days', '&bogus;days'),
      REPORT.replace('</testcase>\n      </testsuite>', '</testsuite>\n      </testcase>'),
      '<testsuites></testsuites>',
    ]) expect(() => parseJUnitReport(broken)).toThrow('junit invalid');
  });
});

describe('test projection', () => {
  const projection = (tests: unknown[]) => ({ schemaVersion: 'repo-harness.test-capability-projection/v1', tests, declared: [], missing: [] });

  test('keeps the file and its capabilities, adds the run command, and leaves source paths out', () => {
    expect(parseTestProjection(projection([
      { file: 'tests/a.test.ts', sources: ['src/a.ts'], capabilities: [{ id: 'capability.a', via: ['import', 'verification'] }] },
      { file: 'tests/b.test.tsx', sources: [], capabilities: [] },
    ]))).toEqual([
      { file: 'tests/a.test.ts', capabilities: [{ id: 'capability.a', via: ['import', 'verification'] }], command: 'bun run test:files tests/a.test.ts --timeout 60000 --max-concurrency 1' },
      { file: 'tests/b.test.tsx', capabilities: [], command: 'bun run test:files tests/b.test.tsx --timeout 60000 --max-concurrency 1' },
    ]);
  });

  test('another schema, a path outside tests/, a duplicate file or a bad link throws', () => {
    for (const value of [
      { ...projection([]), schemaVersion: 'v2' },
      projection([{ file: '/abs/a.test.ts', capabilities: [] }]),
      projection([{ file: 'tests/a.test.ts', capabilities: [] }, { file: 'tests/a.test.ts', capabilities: [] }]),
      projection([{ file: 'tests/a.test.ts', capabilities: [{ id: 'x', via: ['guess'] }] }]),
      projection([{ file: 'tests/a.test.ts', capabilities: [{ id: '../x', via: ['import'] }] }]),
    ]) expect(() => parseTestProjection(value)).toThrow('test projection invalid');
  });
});

describe('tests snapshot decoder', () => {
  test('accepts a full snapshot and every unavailable section', () => {
    expect(decodeTestsSnapshot(snapshot())).toEqual(snapshot());
    const sections = { ...snapshot(), projection: { state: 'unavailable', reason: 'projection_missing' }, results: { state: 'unavailable', reason: 'junit_missing' }, repairs: { state: 'unavailable', reason: 'repairs_unavailable' } };
    expect(decodeTestsSnapshot(sections)).toEqual(sections as TestsSnapshotV1);
  });

  test('rejects an extra key, a failure message, a private path, a forged command or a mismatched issue URL', () => {
    const base = snapshot();
    const results = base.results.state === 'ok' ? base.results.files : [];
    const projected = base.projection.state === 'ok' ? base.projection.files : [];
    const mutations: unknown[] = [
      { ...base, extra: true },
      { ...base, run: { ...RUN, channel: 'affected' } },
      { ...base, run: { ...RUN, html_url: 'https://github.com/owner/repo/actions/runs/1' } },
      { ...base, results: { state: 'ok', files: [{ ...results[0]!, cases: [{ ...results[0]!.cases[0]!, message: 'boom' }] }] } },
      { ...base, results: { state: 'ok', files: [{ ...results[0]!, cases: [{ ...results[0]!.cases[0]!, name: 'at /Users/someone/x' }] }] } },
      { ...base, results: { state: 'ok', files: [{ ...results[0]!, cases: [{ ...results[0]!.cases[0]!, result: 'flaky' }] }] } },
      { ...base, projection: { state: 'ok', files: [{ ...projected[0]!, command: 'rm -rf ~' }] } },
      { ...base, repairs: { state: 'ok', issues: [{ number: 7, title: 'x', url: 'https://github.com/owner/repo/issues/8' }] } },
      { ...base, projection: { state: 'unavailable', reason: 'stderr text' } },
      { ...base, results: { state: 'pending' } },
    ];
    for (const value of mutations) expect(() => decodeTestsSnapshot(value)).toThrow('tests snapshot invalid');
  });

  test('a repair issue is an issue body with a marker that scripts/report-ci.ts writes', () => {
    expect(isCiRepairIssueBody('<!-- ci-repair:run-1 -->\n\nevidence')).toBe(true);
    expect(isCiRepairIssueBody('<!-- ci-daily-missing:2026-10-25 -->')).toBe(true);
    expect(isCiRepairIssueBody('[CI repair] in the title only')).toBe(false);
  });
});
