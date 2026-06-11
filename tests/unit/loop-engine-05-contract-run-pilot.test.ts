import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { runContractRun } from '../../src/cli/commands/contract-run';

const ROOT = path.join(import.meta.dir, '..', '..');
const CLI = path.join(ROOT, 'src/cli/index.ts');

function tempRepo(prefix: string): string {
  const repo = mkdtempSync(path.join(tmpdir(), `${prefix}-`));
  mkdirSync(path.join(repo, 'tasks/contracts'), { recursive: true });
  mkdirSync(path.join(repo, 'tasks/reviews'), { recursive: true });
  mkdirSync(path.join(repo, '.ai/harness/runs'), { recursive: true });
  return repo;
}

function writeContract(repo: string, toolCalls: number | null = null): string {
  const contract = path.join(repo, 'tasks/contracts/demo.contract.md');
  writeFileSync(
    contract,
    [
      '# Sprint Contract: demo',
      '',
      '> **Status**: Active',
      '> **Review File**: `tasks/reviews/demo.review.md`',
      '',
      '## Delegation Fields (κ)',
      '',
      '```yaml',
      'delegation:',
      '  budget:',
      '    tokens: null',
      `    tool_calls: ${toolCalls === null ? 'null' : toolCalls}`,
      '    wall_time_minutes: null',
      '  permission_scope:',
      '    filesystem: allowed_paths',
      '    network: none',
      '    approvals: owner',
      '  roles:',
      '    parent: narrate_only',
      '    worker: implement_within_contract',
      '    verifier: verify_exit_criteria',
      '```',
      '',
      '## Allowed Paths',
      '',
      '```yaml',
      'allowed_paths:',
      '  - src/',
      '  - tests/',
      '  - tasks/reviews/demo.review.md',
      '```',
      '',
      '## Exit Criteria (Machine Verifiable)',
      '',
      '```yaml',
      'exit_criteria:',
      '  files_exist:',
      '    - src/demo.ts',
      '  commands_succeed:',
      '    - bun test tests/demo.test.ts',
      '  manual_checks:',
      '    - "Evaluator review file recommends pass"',
      '```',
      '',
    ].join('\n'),
  );
  writeFileSync(path.join(repo, 'tasks/reviews/demo.review.md'), '# Sprint Review: demo\n\n> **Recommendation**: fail\n');
  return contract;
}

function writeFakeRunner(repo: string, logFile: string): string {
  const runner = path.join(repo, 'fake-child-runner.ts');
  writeFileSync(
    runner,
    [
      '#!/usr/bin/env bun',
      "import { appendFileSync, readFileSync, writeFileSync } from 'fs';",
      'const [phase, packagePath] = process.argv.slice(2);',
      "const payload = JSON.parse(readFileSync(packagePath, 'utf-8'));",
      'appendFileSync(',
      `  ${JSON.stringify(logFile)},`,
      "  `${phase}|${payload.role}|${payload.parent_role}|${payload.verifier_rubric_source}|${payload.exit_criteria.includes('commands_succeed')}\\n`,",
      ');',
      "if (phase === 'verifier') {",
      '  writeFileSync(',
      '    payload.review.abs_path,',
      '    [' ,
      "      '# Sprint Review: demo',",
      "      '',",
      "      '> **Status**: Passed',",
      "      '> **Recommendation**: pass',",
      "      '',",
      "      '## Verification Evidence',",
      "      '- Verifier rubric: contract.exit_criteria',",
      "      '',",
      '    ].join("\\n"),',
      '  );',
      '}',
      '',
    ].join('\n'),
  );
  chmodSync(runner, 0o755);
  return runner;
}

describe('contract-run pilot command', () => {
  test('runs worker and verifier children with the contract exit criteria as verifier rubric', () => {
    const repo = tempRepo('contract-run-ok');
    try {
      writeContract(repo);
      const logFile = path.join(repo, 'child.log');
      const runner = writeFakeRunner(repo, logFile);
      const packageDir = path.join(repo, '.ai/harness/runs/pilot');

      const result = runContractRun({
        repo,
        contract: 'tasks/contracts/demo.contract.md',
        review: 'tasks/reviews/demo.review.md',
        runner,
        packageDir,
      });

      expect(result.exitCode).toBe(0);
      expect(result.lines.join('\n')).toContain('parent role: narrate_only');
      expect(result.lines.join('\n')).toContain('verifier rubric: contract.exit_criteria');
      expect(readFileSync(logFile, 'utf-8')).toContain(
        'worker|implement_within_contract|narrate_only|contract.exit_criteria|true',
      );
      expect(readFileSync(logFile, 'utf-8')).toContain(
        'verifier|verify_exit_criteria|narrate_only|contract.exit_criteria|true',
      );
      expect(readFileSync(path.join(repo, 'tasks/reviews/demo.review.md'), 'utf-8')).toContain(
        '> **Recommendation**: pass',
      );
      expect(existsSync(path.join(packageDir, 'worker-package.json'))).toBe(true);
      expect(existsSync(path.join(packageDir, 'verifier-package.json'))).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test('stops before child execution when the contract tool-call budget is too small', () => {
    const repo = tempRepo('contract-run-budget');
    try {
      writeContract(repo, 1);
      const logFile = path.join(repo, 'child.log');
      const runner = writeFakeRunner(repo, logFile);

      const result = runContractRun({
        repo,
        contract: 'tasks/contracts/demo.contract.md',
        review: 'tasks/reviews/demo.review.md',
        runner,
        packageDir: path.join(repo, '.ai/harness/runs/pilot'),
      });

      expect(result.exitCode).toBe(1);
      expect(result.lines.join('\n')).toContain('budget exceeded');
      expect(result.lines.join('\n')).toContain('no child runner was invoked');
      expect(existsSync(logFile)).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test('wires repo-harness contract-run through the CLI', () => {
    const repo = tempRepo('contract-run-cli');
    try {
      writeContract(repo);
      const logFile = path.join(repo, 'child.log');
      const runner = writeFakeRunner(repo, logFile);
      const packageDir = path.join(repo, '.ai/harness/runs/pilot');

      const res = spawnSync(
        'bun',
        [
          CLI,
          'contract-run',
          '--repo',
          repo,
          '--contract',
          'tasks/contracts/demo.contract.md',
          '--review',
          'tasks/reviews/demo.review.md',
          '--runner',
          runner,
          '--package-dir',
          packageDir,
          '--json',
        ],
        { cwd: ROOT, encoding: 'utf-8' },
      );

      expect(res.status).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.contractPath).toBe('tasks/contracts/demo.contract.md');
      expect(parsed.reviewPath).toBe('tasks/reviews/demo.review.md');
      expect(readFileSync(logFile, 'utf-8')).toContain('verifier|verify_exit_criteria');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
