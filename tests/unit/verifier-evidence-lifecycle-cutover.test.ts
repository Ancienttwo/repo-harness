import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '..', '..');

describe('verifier evidence lifecycle cutover', () => {
  test('bounded runner terminates the whole descendant process group', async () => {
    if (process.platform === 'win32') return;
    const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-bounded-group-'));
    try {
      const sentinel = join(cwd, 'descendant-survived');
      const resultPath = join(cwd, 'result.json');
      const result = spawnSync('bun', [
        join(ROOT, 'scripts/run-bounded-verifier-command.ts'),
        '--deadline-ms', String(Date.now() + 100),
        '--log', join(cwd, 'command.log'),
        '--result', resultPath,
        '--', 'bash', '-c', `trap 'exit 0' TERM; (trap '' TERM; sleep 1; touch "${sentinel}") & wait`,
      ], { cwd, encoding: 'utf-8' });
      expect(result.status).toBe(124);
      const evidence = JSON.parse(readFileSync(resultPath, 'utf-8'));
      expect(evidence.timed_out).toBe(true);
      expect(evidence.exit_code).toBe(124);
      // This field records only the leader outcome; shell scheduling may report
      // its TERM or a clean trap exit. The sentinel below proves descendant KILL.
      expect([null, 'SIGTERM', 'SIGKILL']).toContain(evidence.signal);
      await Bun.sleep(1200);
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('bounded runner keeps the deadline active after the group leader exits', async () => {
    if (process.platform === 'win32') return;
    const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-bounded-leader-exit-'));
    try {
      const sentinel = join(cwd, 'descendant-survived');
      const resultPath = join(cwd, 'result.json');
      const result = spawnSync('bun', [
        join(ROOT, 'scripts/run-bounded-verifier-command.ts'),
        '--deadline-ms', String(Date.now() + 100),
        '--log', join(cwd, 'command.log'),
        '--result', resultPath,
        '--', 'bash', '-c', `(trap '' TERM; sleep 1; touch "${sentinel}") & exit 0`,
      ], { cwd, encoding: 'utf-8' });
      expect(result.status).toBe(124);
      const evidence = JSON.parse(readFileSync(resultPath, 'utf-8'));
      expect(evidence.timed_out).toBe(true);
      expect(evidence.exit_code).toBe(124);
      await Bun.sleep(1_200);
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('strict verifier has a fixed budget and records timing evidence', () => {
    const source = readFileSync(join(ROOT, 'scripts/verify-contract.sh'), 'utf-8');
    expect(source).toContain('VERIFICATION_BUDGET_MS=600000');
    expect(source).not.toContain('REPO_HARNESS_VERIFICATION_BUDGET');
    expect(source).toContain('"budget_ms"');
    expect(source).toContain('"total_duration_ms"');
    expect(source).toContain('"duration_ms"');
    expect(source).toContain('"timed_out"');
    expect(source).toContain('"signal"');
    expect(source).toContain('failure_class="verification_budget"');
  });

  test('verifier rejects evidence producers before execution', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-verifier-producer-'));
    try {
      const contract = join(cwd, 'producer.contract.md');
      const report = join(cwd, 'report.json');
      writeFileSync(contract, [
        '# Task Contract: producer',
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
        '    - bun run benchmark:harness --require-authoritative',
        '```',
        '',
      ].join('\n'));
      const result = spawnSync('bash', [
        join(ROOT, 'scripts/verify-contract.sh'), '--contract', contract,
        '--strict', '--read-only', '--report-file', report,
      ], { cwd: ROOT, encoding: 'utf-8' });
      expect(result.status).toBe(1);
      const evidence = JSON.parse(readFileSync(report, 'utf-8'));
      const command = evidence.results.find((entry: { kind: string }) => entry.kind === 'commands_succeed');
      expect(command.exit_code).toBe(126);
      expect(command.duration_ms).toBe(0);
      expect(command.signal).toBeNull();
      expect(command.message).toContain('forbidden evidence producer');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('sprint and active contract surfaces contain no live matrix command', () => {
    for (const path of [
      'scripts/verify-sprint.sh',
      'assets/templates/helpers/verify-sprint.sh',
      'tasks/archive/contract-20260722-0350-20260712-2327-harness-kernel-reduction.md',
    ]) {
      const source = readFileSync(join(ROOT, path), 'utf-8');
      expect(source).not.toContain('bun run benchmark:harness');
      expect(source).not.toContain('run-harness-profile-benchmark.ts --provider');
    }
  });
});
