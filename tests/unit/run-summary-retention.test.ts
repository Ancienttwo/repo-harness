import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { RUN_SUMMARY_RETENTION_COUNT, sweepRunSummaries } from '../../src/effects/run-summary-retention';

const RUNS_DIR = '.ai/harness/runs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'run-retention-'));
  roots.push(root);
  mkdirSync(join(root, RUNS_DIR), { recursive: true });
  return root;
}

function age(root: string, name: string, index: number): void {
  const seconds = 1_600_000_000 - index * 60;
  utimesSync(join(root, RUNS_DIR, name), seconds, seconds);
}

/** `index` orders age: 0 is the newest. Mirrors `stop-handler.ts`'s record. */
function seedStopSummary(root: string, name: string, index: number, reason = 'session-stop'): void {
  writeFileSync(join(root, RUNS_DIR, name), JSON.stringify({
    generated_at: '2026-09-11T02:16:42+0800',
    run_id: name.replace(/\.json$/, ''),
    reason,
    active_plan: '',
    active_contract: '',
    active_review: '',
    active_notes: '',
    handoff_file: '.ai/harness/handoff/current.md',
    policy_file: '.ai/harness/policy.json',
    context_map_file: '.ai/context/context-map.json',
  }));
  age(root, name, index);
}

/** Mirrors `scripts/verify-sprint.sh`'s frozen acceptance snapshot. */
function seedAcceptanceSnapshot(root: string, name: string, index: number): void {
  writeFileSync(join(root, RUNS_DIR, name), JSON.stringify({
    schema: 'repo-harness-run-trace.v1',
    status: 'pass',
    source: 'verify-sprint',
    run_id: 'run-20260829T025442-29360',
    run_file: `${RUNS_DIR}/${name}`,
  }));
  age(root, name, index);
}

/** Mirrors `evidence/verification-execution.ts`'s ledger-bound run record. */
function seedVerificationRecord(root: string, executionId: string, index: number): string {
  const name = `verification-${executionId}.json`;
  writeFileSync(join(root, RUNS_DIR, name), JSON.stringify({
    protocol: 1,
    kind: 'verification_execution_record',
    execution_id: executionId,
    cache_key: 'sha256:deadbeef',
    result: { id: 'focused-regression', passed: true, execution_id: executionId },
  }));
  age(root, name, index);
  return name;
}

function remaining(root: string): string[] {
  return readdirSync(join(root, RUNS_DIR)).sort();
}

describe('run summary retention', () => {
  test('keeps the newest N Stop summaries and removes the rest', () => {
    const root = fixture();
    for (let index = 0; index < 5; index++) seedStopSummary(root, `run-${index}.json`, index);

    const result = sweepRunSummaries({ repoRoot: root, runsDir: RUNS_DIR, retain: 2 });

    expect(result.scanned).toBe(5);
    expect([...result.removed].sort()).toEqual([
      `${RUNS_DIR}/run-2.json`, `${RUNS_DIR}/run-3.json`, `${RUNS_DIR}/run-4.json`,
    ]);
    expect(remaining(root)).toEqual(['run-0.json', 'run-1.json']);
    expect(result.retained).toBe(2);
  });

  test('a ledger-bound verification execution record is never a candidate', () => {
    const root = fixture();
    // Oldest file in the directory, and the only one a count-only or
    // newest-N-by-name rule would delete first.
    const record = seedVerificationRecord(root, 'vx-0c2998f10e2847ccbb86', 99);
    for (let index = 0; index < 3; index++) seedStopSummary(root, `run-${index}.json`, index);

    const result = sweepRunSummaries({ repoRoot: root, runsDir: RUNS_DIR, retain: 0 });

    expect(result.foreign).toBe(1);
    expect(result.scanned).toBe(3);
    expect(remaining(root)).toEqual([record]);
    expect(result.removed).not.toContain(`${RUNS_DIR}/${record}`);
  });

  test("verify-sprint's frozen acceptance snapshot is never a candidate", () => {
    const root = fixture();
    // Shares Stop's `run-` prefix, so only the record shape separates them.
    seedAcceptanceSnapshot(root, 'run-20260829T025442-29360-operator-board.json', 99);
    for (let index = 0; index < 3; index++) seedStopSummary(root, `run-${index}.json`, index);

    sweepRunSummaries({ repoRoot: root, runsDir: RUNS_DIR, retain: 0 });

    expect(remaining(root)).toEqual(['run-20260829T025442-29360-operator-board.json']);
  });

  test('an unparseable or unrecognized record is left alone, not deleted', () => {
    const root = fixture();
    writeFileSync(join(root, RUNS_DIR, 'run-truncated.json'), '{ truncated');
    // The operator-report shape: a run_id, but none of the projection paths.
    writeFileSync(join(root, RUNS_DIR, 'run-report.json'), JSON.stringify({ run_id: 'x', command: 'bun test', exit_code: 0 }));
    writeFileSync(join(root, RUNS_DIR, 'run-array.json'), '[]');
    seedStopSummary(root, 'run-0.json', 0);

    const result = sweepRunSummaries({ repoRoot: root, runsDir: RUNS_DIR, retain: 0 });

    expect(result.foreign).toBe(3);
    expect(result.removed).toEqual([`${RUNS_DIR}/run-0.json`]);
    expect(remaining(root)).toEqual(['run-array.json', 'run-report.json', 'run-truncated.json']);
  });

  test('a run summary with an operator-supplied reason is still a candidate', () => {
    const root = fixture();
    // `reason` is free-form text set by whoever refreshed the projection; this
    // repository's own history holds ~190 distinct values. Matching one value
    // would leave every other summary unreclaimable.
    seedStopSummary(root, 'run-0.json', 0, 'session-stop');
    seedStopSummary(root, 'run-1.json', 1, 'repo-harness-migration-verify');
    seedStopSummary(root, 'run-2.json', 2, 'C4 shipped via PR #226; main at 8134a2af');

    const result = sweepRunSummaries({ repoRoot: root, runsDir: RUNS_DIR, retain: 0 });

    expect(result.scanned).toBe(3);
    expect(result.foreign).toBe(0);
    expect(remaining(root)).toEqual([]);
  });

  test('a symlinked entry is reported, never unlinked or followed', () => {
    const root = fixture();
    const outside = join(root, 'outside.json');
    writeFileSync(outside, JSON.stringify({ run_id: 'outside' }));
    symlinkSync(outside, join(root, RUNS_DIR, 'run-link.json'));
    seedStopSummary(root, 'run-0.json', 0);

    const result = sweepRunSummaries({ repoRoot: root, runsDir: RUNS_DIR, retain: 0 });

    expect(result.skipped).toEqual(['run-link.json: not a regular file']);
    expect(existsSync(outside)).toBe(true);
    expect(remaining(root)).toEqual(['run-link.json']);
  });

  test('only .json files directly in the runs directory are read', () => {
    const root = fixture();
    seedStopSummary(root, 'run-0.json', 0);
    writeFileSync(join(root, RUNS_DIR, 'hook-events.jsonl'), '{}\n');
    writeFileSync(join(root, RUNS_DIR, 'verification-vx-abc.log'), 'diagnostics\n');
    mkdirSync(join(root, RUNS_DIR, 'bash-output'));
    writeFileSync(join(root, RUNS_DIR, 'bash-output', 'run-nested.json'), '{}');

    const result = sweepRunSummaries({ repoRoot: root, runsDir: RUNS_DIR, retain: 0 });

    expect(result.scanned).toBe(1);
    expect(remaining(root)).toEqual(['bash-output', 'hook-events.jsonl', 'verification-vx-abc.log']);
    expect(existsSync(join(root, RUNS_DIR, 'bash-output', 'run-nested.json'))).toBe(true);
  });

  test('a dry run reports the same selection without deleting', () => {
    const root = fixture();
    for (let index = 0; index < 3; index++) seedStopSummary(root, `run-${index}.json`, index);

    const result = sweepRunSummaries({ repoRoot: root, runsDir: RUNS_DIR, retain: 1, dryRun: true });

    expect(result.removed.length).toBe(2);
    expect(result.reclaimedBytes).toBeGreaterThan(0);
    expect(remaining(root)).toEqual(['run-0.json', 'run-1.json', 'run-2.json']);
  });

  test('a missing runs directory is not an error', () => {
    const root = fixture();
    rmSync(join(root, RUNS_DIR), { recursive: true, force: true });
    expect(sweepRunSummaries({ repoRoot: root, runsDir: RUNS_DIR }).scanned).toBe(0);
  });

  test('the default bound is the exported retention count', () => {
    const root = fixture();
    for (let index = 0; index < RUN_SUMMARY_RETENTION_COUNT + 3; index++) seedStopSummary(root, `run-${index}.json`, index);

    const result = sweepRunSummaries({ repoRoot: root, runsDir: RUNS_DIR });

    expect(result.removed.length).toBe(3);
    expect(result.retained).toBe(RUN_SUMMARY_RETENTION_COUNT);
  });

  test('foreign records never consume the retention window', () => {
    const root = fixture();
    // Newer than every Stop summary: a rule that counted them would evict one.
    for (let index = 0; index < 5; index++) seedVerificationRecord(root, `vx-newer-${index}`, -index - 1);
    for (let index = 0; index < 3; index++) seedStopSummary(root, `run-${index}.json`, index);

    const result = sweepRunSummaries({ repoRoot: root, runsDir: RUNS_DIR, retain: 3 });

    expect(result.removed).toEqual([]);
    expect(result.retained).toBe(3);
    expect(result.foreign).toBe(5);
  });

  test('a runs directory outside the repository is refused', () => {
    const root = fixture();
    expect(() => sweepRunSummaries({ repoRoot: root, runsDir: '../escape' }))
      .toThrow('path traversal is not allowed');
  });
});
