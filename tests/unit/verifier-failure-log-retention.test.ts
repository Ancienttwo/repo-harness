/**
 * Failing-criterion log retention.
 *
 * Bounded criterion runs write their output to a log under the round's
 * `mktemp -d`, which `trap rm -rf EXIT` destroys when the round ends. The run
 * report keeps only `exit_code`, so a failing `bun test` criterion could not be
 * attributed to a test at all -- two real in-round `exit=1` failures on the
 * bundle shipment burned ~25 minutes each and named nothing.
 *
 * A failing criterion now leaves its log at
 * `.ai/harness/runs/<run-id>-<criterion-slug>.log`. Passing criteria retain
 * nothing, so green rounds do not fill runs/ with logs nobody reads.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '..', '..');
const VERIFY_CONTRACT = join(ROOT, 'scripts/verify-contract.sh');
const RUNS_DIR = '.ai/harness/runs';
const RUN_ID = 'run-retention-fixture';
const MARKER = 'VERIFIER_RETENTION_MARKER_XYZ';

const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
  }
});

function fixtureContract(cwd: string, command: string): string {
  const contract = join(cwd, 'retention.contract.md');
  writeFileSync(
    contract,
    [
      '# Task Contract: retention',
      '',
      '> **Status**: Active',
      '> **Task Profile**: code-change',
      '',
      '## Allowed Paths',
      '',
      '```yaml',
      'allowed_paths:',
      '  - tests/',
      '```',
      '',
      '## Exit Criteria (Machine Verifiable)',
      '',
      '```yaml',
      'exit_criteria:',
      '  commands_succeed:',
      `    - ${command}`,
      '```',
      '',
    ].join('\n'),
  );
  return contract;
}

/** Runs the verifier in an isolated cwd so retained logs land in the fixture's own runs dir. */
function runVerifier(script: string, command: string) {
  const cwd = mkdtempSync(join(tmpdir(), 'verifier-retention-'));
  temporaryRoots.push(cwd);
  const contract = fixtureContract(cwd, command);
  const result = spawnSync(
    'bash',
    [script, '--contract', contract, '--strict', '--read-only', '--report-file', join(cwd, 'report.json')],
    { cwd, encoding: 'utf-8', env: { ...process.env, HOOK_RUN_ID: RUN_ID } },
  );
  const runsDir = join(cwd, RUNS_DIR);
  const retained = existsSync(runsDir) ? readdirSync(runsDir).filter((n) => n.endsWith('.log')).sort() : [];
  // Assert on the criterion's own recorded result, not the round exit status:
  // the isolated fixture cwd has no workflow-state lib, so unrelated
  // round-level checks fail there regardless of the criterion under test.
  const report = JSON.parse(readFileSync(join(cwd, 'report.json'), 'utf-8')) as {
    results: Array<{ kind: string; passed: boolean; exit_code: number }>;
  };
  const criterion = report.results.find((entry) => entry.kind === 'commands_succeed');
  return { cwd, result, runsDir, retained, criterion };
}

describe('verifier failure log retention', () => {
  test('a failing criterion leaves its runner log under the runs dir', () => {
    const { result, runsDir, retained, criterion } = runVerifier(VERIFY_CONTRACT, `echo ${MARKER}; exit 3`);

    expect(criterion, `${result.stdout}\n${result.stderr}`).toMatchObject({ passed: false, exit_code: 3 });
    // Pins the naming scheme: <run-id>-<sanitized criterion>.log
    expect(retained).toEqual([`${RUN_ID}-echo-${MARKER}-exit-3.log`]);
    // The retained log carries the failing command's own output, which is the
    // attribution that was previously destroyed with the temp dir.
    expect(readFileSync(join(runsDir, retained[0] as string), 'utf-8')).toContain(MARKER);
  });

  test('a passing criterion retains nothing', () => {
    const { result, retained, criterion } = runVerifier(VERIFY_CONTRACT, `echo ${MARKER}`);

    expect(criterion, `${result.stdout}\n${result.stderr}`).toMatchObject({ passed: true, exit_code: 0 });
    expect(retained).toEqual([]);
  });

  test('both helper copies carry the retention path', () => {
    for (const path of ['scripts/verify-contract.sh', 'assets/templates/helpers/verify-contract.sh']) {
      const source = readFileSync(join(ROOT, path), 'utf-8');
      expect(source).toContain('FAILURE_LOG_DIR=".ai/harness/runs"');
      expect(source).toContain('retain_failure_log "$log_path" "$path"');
      expect(source).toContain('retain_failure_log "$log_path" "$cmd"');
    }
  });
});
