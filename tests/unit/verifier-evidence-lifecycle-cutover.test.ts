import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'node:crypto';
import { canonicalize } from '../../src/core/evidence/canonical-json';
import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';
import { initGitRepo, commitAll } from '../helpers/repo-fixture';

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
    const home = mkdtempSync(join(tmpdir(), 'repo-harness-producer-authority-'));
    try {
      initGitRepo(cwd);
      writeFileSync(join(cwd, 'source.txt'), 'fixture\n');
      commitAll(cwd, 'fixture');
      const approval = seedReviewAdmissionFixture(cwd, home);
      const report = join(cwd, 'report.json');
      // Negative protected-store fixture: valid byte identities cannot authorize
      // an evidence producer. The real admission reader must reject plan syntax.
      const record = JSON.parse(readFileSync(join(approval.directory, `${approval.grant.slice(7)}.json`), 'utf8'));
      record.admission.verification_plan.checks[0].command = 'bun run benchmark:harness --require-authoritative';
      const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
      const { admission_sha256: _previous, ...basis } = record.admission;
      record.admission.admission_sha256 = digest(canonicalize(basis));
      const bytes = canonicalize(record) + '\n';
      const grant = digest(bytes);
      writeFileSync(join(approval.directory, `${grant.slice(7)}.json`), bytes, { mode: 0o600 });
      writeFileSync(join(approval.directory, 'active.json'), JSON.stringify({ protocol: 1, revision: 2, grant_sha256: grant }), { mode: 0o600 });
      const source = { ...approval.source, expectedGrantSha256: grant };
      const args = ['execute', '--repo', cwd,
        '--repository-id', source.repository_id, '--issue-id', source.issue_id,
        '--campaign-id', source.campaign_id, '--grant-sha256', source.expectedGrantSha256,
        '--policy-sha256', source.expectedPolicySha256, '--actor', source.expectedActor,
        '--report-file', report];
      const result = spawnSync(process.execPath, ['-e', `
        const { main } = await import(${JSON.stringify(join(ROOT, 'scripts/verification-plan.ts'))});
        const source = ${JSON.stringify(source)};
        source.runner = args => ({ stdout: JSON.stringify(args.includes('repos/acme/widgets/issues/903')
          ? ${JSON.stringify(approval.issue)} : { id: 'R_provider', full_name: 'acme/widgets', html_url: 'https://github.com/acme/widgets' }) });
        process.exit(await main(${JSON.stringify(args)}, () => source));
      `], { cwd, encoding: 'utf-8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('evidence producer');
      expect(existsSync(report)).toBe(false);
      expect(existsSync(join(cwd, '.ai/harness/runs'))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
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
