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
  }, 30_000);

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
  }, 30_000);

  test('bounded runner strips REPO_HARNESS_* wiring from the verified command', () => {
    if (process.platform === 'win32') return;
    const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-bounded-env-scrub-'));
    try {
      const logPath = join(cwd, 'command.log');
      const result = spawnSync('bun', [
        join(ROOT, 'scripts/run-bounded-verifier-command.ts'),
        '--deadline-ms', String(Date.now() + 30_000),
        '--log', logPath,
        '--result', join(cwd, 'result.json'),
        '--', 'bash', '-c', 'env',
      ], {
        cwd,
        encoding: 'utf-8',
        env: {
          ...process.env,
          REPO_HARNESS_HELPER_SOURCE_PATH: join(ROOT, 'scripts/verify-contract.sh'),
          REPO_HARNESS_TARGET_REPO_ROOT: ROOT,
          REPO_HARNESS_BASH_BIN: '/bin/bash',
          REPO_HARNESS_GIT_BIN: '/usr/bin/git',
          REPO_HARNESS_BUN_BIN: process.execPath,
          REPO_HARNESS_WORKFLOW_STATE_LIB: join(ROOT, '.ai/hooks/lib/workflow-state.sh'),
          REPO_HARNESS_GH_BIN: '/usr/bin/gh',
          REPO_HARNESS_ENV_SCRUB_PROBE: 'probe',
        },
      });
      expect(result.status).toBe(0);
      const childEnv = readFileSync(logPath, 'utf-8').split('\n');
      expect(childEnv.filter((line) => line.startsWith('REPO_HARNESS_'))).toEqual([]);
      // Everything outside the harness prefix still reaches the command.
      expect(childEnv.some((line) => line.startsWith('PATH='))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('bounded runner passes non-harness environment through unchanged', () => {
    if (process.platform === 'win32') return;
    const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-bounded-env-passthrough-'));
    try {
      const logPath = join(cwd, 'command.log');
      const result = spawnSync('bun', [
        join(ROOT, 'scripts/run-bounded-verifier-command.ts'),
        '--deadline-ms', String(Date.now() + 30_000),
        '--log', logPath,
        '--result', join(cwd, 'result.json'),
        '--', 'bash', '-c', 'env',
      ], {
        cwd,
        encoding: 'utf-8',
        env: { ...process.env, BOUNDED_VERIFIER_PASSTHROUGH_PROBE: 'kept' },
      });
      expect(result.status).toBe(0);
      const childEnv = readFileSync(logPath, 'utf-8').split('\n');
      expect(childEnv).toContain('BOUNDED_VERIFIER_PASSTHROUGH_PROBE=kept');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('explicit execution owns a fixed default deadline and timing evidence', () => {
    const source = readFileSync(join(ROOT, 'src/effects/evidence/verification-execution.ts'), 'utf-8');
    expect(source).toContain('input.timeoutMs ?? 3_600_000');
    expect(source).toContain('deadlineMs - Date.now()');
    expect(source).toContain('duration_ms: Date.now() - started');
    expect(source).toContain('timed_out: run.timedOut');
    expect(source).toContain('signal: run.signal');
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
        '  files_exist:',
        '    - producer.contract.md',
        '```',
        '',
        '## Verification Plan',
        '```json',
        JSON.stringify({ protocol: 1, checks: [{ id: 'producer', kind: 'command',
          command: 'bun run benchmark:harness --require-authoritative', cwd: '.', phase: 'verification',
          cost: 'expensive', evidence_policy: 'current_exact', necessity: 'Rejected provider execution fixture.', inputs: { env: [] } }] }),
        '```',
        '',
      ].join('\n'));
      const result = spawnSync(process.execPath, [
        join(ROOT, 'scripts/verification-plan.ts'), 'execute', '--repo', cwd, '--contract', 'producer.contract.md',
        '--report-file', report,
      ], { cwd, encoding: 'utf-8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('evidence producer');
      expect(existsSync(report)).toBe(false);
      expect(existsSync(join(cwd, '.ai/harness/runs'))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

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
