import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { collectMinimalChangeSignals, type MinimalChangeReport } from '../src/cli/hook/minimal-change-signals';
import { runMinimalChangeCli } from '../src/cli/hook/minimal-change-cli';

function git(repo: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function tmpRepo(prefix: string): string {
  const repo = mkdtempSync(join(tmpdir(), `${prefix}-`));
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Minimal Change Test']);
  git(repo, ['config', 'user.email', 'minimal-change@test.local']);
  mkdirSync(join(repo, '.ai/harness'), { recursive: true });
  writeJson(join(repo, '.ai/harness/policy.json'), {
    minimal_change: { mode: 'advice', post_edit_observer: true, max_findings: 5 },
  });
  writeJson(join(repo, 'package.json'), {
    dependencies: { 'left-pad': '1.0.0' },
    devDependencies: { tsx: '4.0.0' },
  });
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'base']);
  return repo;
}

function readReport(repo: string): MinimalChangeReport {
  return JSON.parse(
    readFileSync(join(repo, '.ai/harness/checks/minimal-change.latest.json'), 'utf8'),
  ) as MinimalChangeReport;
}

describe('minimal-change objective signals', () => {
  test('detects new package.json dependencies and writes a review report', () => {
    const repo = tmpRepo('minimal-change-dependency');
    try {
      writeJson(join(repo, 'package.json'), {
        dependencies: { 'left-pad': '1.0.0', chalk: '^5.0.0' },
        devDependencies: { tsx: '4.0.0' },
      });

      const report = collectMinimalChangeSignals({ repoRoot: repo, path: 'package.json' });
      expect(report.verdict).toBe('review');
      expect(report.signals.dependency_manifests_changed).toEqual(['package.json']);
      expect(report.signals.new_dependencies.map((dep) => dep.name)).toEqual(['chalk']);
      expect(report.findings.map((finding) => finding.tag)).toEqual(['dependency']);
      expect(readReport(repo).fingerprint).toBe(report.fingerprint);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test('does not treat a dev-to-prod dependency move as a new dependency', () => {
    const repo = tmpRepo('minimal-change-dependency-move');
    try {
      writeJson(join(repo, 'package.json'), {
        dependencies: { 'left-pad': '1.0.0', tsx: '4.0.0' },
        devDependencies: {},
      });

      const report = collectMinimalChangeSignals({ repoRoot: repo, path: 'package.json' });
      expect(report.signals.new_dependencies).toEqual([]);
      expect(report.findings).toEqual([]);
      expect(report.verdict).toBe('lean');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test('marks test and security validation changes as protected instead of shrink findings', () => {
    const repo = tmpRepo('minimal-change-protected');
    try {
      mkdirSync(join(repo, 'tests'), { recursive: true });
      writeFileSync(
        join(repo, 'tests/security-validation.test.ts'),
        'test("validates auth token", () => { expect(validateToken("x")).toBe(false); });\n',
      );

      const report = collectMinimalChangeSignals({
        repoRoot: repo,
        path: 'tests/security-validation.test.ts',
      });
      expect(report.signals.new_file_paths).toEqual(['tests/security-validation.test.ts']);
      expect(report.protected_changes.map((change) => change.concern)).toContain('tests');
      expect(report.protected_changes.map((change) => change.concern)).toContain('security');
      expect(report.findings).toEqual([]);
      expect(report.verdict).toBe('lean');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test('reports low-confidence abstraction candidates deterministically', () => {
    const repo = tmpRepo('minimal-change-abstraction');
    try {
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(
        join(repo, 'src/payment-wrapper.ts'),
        [
          'export interface PaymentAdapter {',
          '  charge(amount: number): Promise<void>;',
          '}',
          '',
          'export function charge(payment: PaymentAdapter, amount: number) {',
          '  return payment.charge(amount);',
          '}',
        ].join('\n'),
      );

      const report = collectMinimalChangeSignals({ repoRoot: repo, path: 'src/payment-wrapper.ts' });
      expect(report.signals.abstraction_candidates.length).toBeGreaterThan(0);
      expect(report.findings.map((finding) => finding.tag)).toContain('yagni');
      expect(report.verdict).toBe('review');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test('hook-only CLI stays stdout-silent, respects off mode, and dedupes identical events', () => {
    const repo = tmpRepo('minimal-change-cli-signals');
    try {
      writeJson(join(repo, 'package.json'), {
        dependencies: { 'left-pad': '1.0.0', chalk: '^5.0.0' },
      });

      const first = runMinimalChangeCli(['signals', '--phase', 'post-edit', '--path', 'package.json'], {
        cwd: repo,
      });
      expect(first).toEqual({ exitCode: 0, stdout: '', stderr: '' });
      const firstReport = readFileSync(
        join(repo, '.ai/harness/checks/minimal-change.latest.json'),
        'utf8',
      );

      const second = runMinimalChangeCli(['signals', '--phase', 'post-edit', '--path', 'package.json'], {
        cwd: repo,
      });
      expect(second).toEqual({ exitCode: 0, stdout: '', stderr: '' });
      expect(readFileSync(join(repo, '.ai/harness/checks/minimal-change.latest.json'), 'utf8')).toBe(
        firstReport,
      );

      writeJson(join(repo, '.ai/harness/policy.json'), {
        minimal_change: { mode: 'off' },
      });
      rmSync(join(repo, '.ai/harness/checks'), { recursive: true, force: true });
      const disabled = runMinimalChangeCli(['signals', '--phase', 'post-edit', '--path', 'package.json'], {
        cwd: repo,
      });
      expect(disabled).toEqual({ exitCode: 0, stdout: '', stderr: '' });
      expect(existsSync(join(repo, '.ai/harness/checks/minimal-change.latest.json'))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
