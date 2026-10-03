import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '..', '..');
const MARKER = 'VERIFIER_RETENTION_MARKER_XYZ';

function runVerifier(script: string, command: string, inspect: (root: string, report: any) => void) {
  const root = mkdtempSync(join(tmpdir(), 'verifier-retention-'));
  try {
    const git = (args: string[]) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr);
    };
    git(['init', '-q']);
    git(['config', 'user.email', 'fixture@example.test']);
    git(['config', 'user.name', 'Fixture']);
    writeFileSync(join(root, '.gitignore'), '.ai/\nreport.json\n');
    const plan = { protocol: 1, checks: [{ id: 'retention', kind: 'command', command, cwd: '.',
      phase: 'verification', cost: 'normal', evidence_policy: 'current_exact',
      necessity: 'Preserves failed command diagnostics.', inputs: { env: [] } }] };
    writeFileSync(join(root, 'retention.contract.md'), [
      '# Contract', '> **Status**: Active', '> **Task Profile**: code-change',
      '```yaml', 'exit_criteria:', '  files_exist:', '    - retention.contract.md', '```',
      '```yaml', 'evidence_requirements:', '  benchmark: not_applicable', '```',
      '## Verification Plan', '```json', JSON.stringify(plan), '```', '',
    ].join('\n'));
    git(['add', '.']);
    git(['commit', '-qm', 'fixture']);
    const result = spawnSync(process.execPath, [join(ROOT, script), 'execute', '--repo', root, '--contract', 'retention.contract.md',
      '--report-file', '.ai/harness/checks/report.json'], { cwd: root, encoding: 'utf8',
      env: { ...process.env, REPO_HARNESS_WORKFLOW_STATE_LIB: join(ROOT, 'assets/hooks/lib/workflow-state.sh') } });
    expect(result.status).toBe(command.includes('exit 3') ? 1 : 0);
    inspect(root, JSON.parse(readFileSync(join(root, '.ai/harness/checks/report.json'), 'utf8')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const script of ['scripts/verification-plan.ts', 'assets/templates/helpers/verification-plan.ts']) {
  describe(script, () => {
    test('failure retains stdout with the immutable execution reference', () => {
      runVerifier(script, `echo ${MARKER}; exit 3`, (root, report) => {
        const result = report.results.find((entry: any) => entry.id === 'retention');
        expect(result).toMatchObject({ passed: false, exit_code: 3, execution: 'executed' });
        expect(result.run_file).toBe(`.ai/harness/runs/verification-${result.execution_id}.json`);
        const immutable = JSON.parse(readFileSync(join(root, result.run_file), 'utf8'));
        expect(immutable.execution_id).toBe(result.execution_id);
        expect(immutable.result.failure_log_file).toBe(result.failure_log_file);
        expect(result.failure_log_file).toMatch(/^\.ai\/harness\/runs\/verification-.+\.log$/);
        expect(readFileSync(join(root, result.failure_log_file), 'utf8')).toContain(MARKER);
      });
    }, 30_000);
    test('success creates no failure log', () => {
      runVerifier(script, `echo ${MARKER}`, (root, report) => {
        const result = report.results.find((entry: any) => entry.id === 'retention');
        expect(result).toMatchObject({ passed: true, exit_code: 0, failure_log_file: null });
        const runs = join(root, '.ai/harness/runs');
        expect(existsSync(runs) ? readdirSync(runs).filter((path) => path.endsWith('.log')) : []).toEqual([]);
      });
    }, 30_000);
  });
}
