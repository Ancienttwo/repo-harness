import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';
import { validateVerificationPlan } from '../../src/core/evidence/verification-plan';

const ROOT = join(import.meta.dir, '..', '..');
const MARKER = 'VERIFIER_RETENTION_MARKER_XYZ';

function runVerifier(script: string, command: string, inspect: (root: string, report: any) => void) {
  const root = mkdtempSync(join(tmpdir(), 'verifier-retention-'));
  const home = mkdtempSync(join(tmpdir(), 'verifier-retention-authority-'));
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
    const approval = seedReviewAdmissionFixture(root, home, { plan: validateVerificationPlan(plan) });
    const args = ['execute', '--repo', root,
    '--repository-id', approval.source.repository_id, '--issue-id', approval.source.issue_id,
    '--campaign-id', approval.source.campaign_id, '--grant-sha256', approval.source.expectedGrantSha256,
    '--policy-sha256', approval.source.expectedPolicySha256, '--actor', approval.source.expectedActor,
    '--report-file', '.ai/harness/checks/report.json'];
    const result = spawnSync(process.execPath, ["-e", `
    const { main } = await import(${JSON.stringify(join(ROOT, script))});
    const source = ${JSON.stringify(approval.source)};
    source.runner = args => ({ stdout: JSON.stringify(args.includes('repos/acme/widgets/issues/903')
      ? ${JSON.stringify(approval.issue)} : { id: 'R_provider', full_name: 'acme/widgets', html_url: 'https://github.com/acme/widgets' }) });
    process.exit(await main(${JSON.stringify(args)}, () => source));
  `], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(command.includes('exit 3') ? 1 : 0);
    inspect(root, JSON.parse(readFileSync(join(root, '.ai/harness/checks/report.json'), 'utf8')));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

for (const script of ['scripts/verification-plan.ts']) {
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
