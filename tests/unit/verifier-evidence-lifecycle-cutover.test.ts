import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '..', '..');

describe('verifier evidence lifecycle cutover', () => {
  test('explicit execution owns a fixed default deadline and timing evidence', () => {
    const source = readFileSync(join(ROOT, 'src/effects/evidence/verification-execution.ts'), 'utf-8');
    expect(source).toContain('input.timeoutMs ?? 3_600_000');
    expect(source).toContain('const deadlineMs = Date.now() + budgetMs');
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
    ]) {
      const source = readFileSync(join(ROOT, path), 'utf-8');
      expect(source).not.toContain('bun run benchmark:harness');
      expect(source).not.toContain('run-harness-profile-benchmark.ts --provider');
    }
  });
});
