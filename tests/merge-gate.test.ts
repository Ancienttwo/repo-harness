import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { buildReviewSubject } from '../src/effects/review/diff-fingerprint';
import { acceptanceReceiptPath, recordAcceptance } from '../scripts/acceptance-receipt';

const ROOT = join(import.meta.dir, '..');
const SCRIPT = join(ROOT, 'scripts', 'merge-gate.ts');
const tempDirs: string[] = [];

afterEach(() => {
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

function run(command: string, args: string[], cwd: string) {
  return spawnSync(command, args, { cwd, encoding: 'utf-8', env: process.env });
}

function git(cwd: string, ...args: string[]): string {
  const result = run('git', args, cwd);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function commit(cwd: string, message: string): void {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-m', message);
}

async function makeFixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-merge-seal-repo-'));
  const home = mkdtempSync(join(tmpdir(), 'repo-harness-merge-seal-home-'));
  tempDirs.push(cwd, home);
  git(cwd, 'init', '-b', 'main');
  git(cwd, 'config', 'user.name', 'Merge Seal Test');
  git(cwd, 'config', 'user.email', 'merge-seal@test.local');
  mkdirSync(join(cwd, '.ai', 'harness', 'checks'), { recursive: true });
  mkdirSync(join(cwd, 'plans'), { recursive: true });
  mkdirSync(join(cwd, 'tasks', 'contracts'), { recursive: true });
  mkdirSync(join(cwd, 'tasks', 'reviews'), { recursive: true });
  writeFileSync(join(cwd, '.gitignore'), '.ai/harness/checks/\n');
  writeFileSync(join(cwd, '.ai', 'harness', 'policy.json'), `${JSON.stringify({
    worktree_strategy: { review_base: 'main' },
    merge_gate: { enabled: true, rule: 'fixture' },
  }, null, 2)}\n`);
  writeFileSync(join(cwd, 'base.txt'), 'base\n');
  commit(cwd, 'base');
  git(cwd, 'checkout', '-b', 'codex/demo');
  writeFileSync(join(cwd, 'feature.txt'), 'candidate\n');
  writeFileSync(join(cwd, 'plans', 'plan-demo.md'), '# Plan: demo\n\n> **Status**: Executing\n');
  writeFileSync(join(cwd, 'tasks', 'contracts', 'demo.contract.md'), [
    '# Task Contract: demo',
    '',
    '> **Status**: Active',
    '> **Plan**: plans/plan-demo.md',
    '> **Owner**: kito',
    '',
    '## Acceptance Policy',
    '',
    '```json',
    '{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}',
    '```',
    '',
  ].join('\n'));
  writeFileSync(join(cwd, 'tasks', 'reviews', 'demo.review.md'), '# Review\n\n> **Recommendation**: pass\n');
  commit(cwd, 'candidate');
  const subject = buildReviewSubject(cwd, { targetRef: 'main' });
  writeFileSync(join(cwd, '.ai', 'harness', 'checks', 'latest.json'), `${JSON.stringify({
    schema: 'repo-harness-run-trace.v1',
    source: 'verify-sprint',
    status: 'pass',
    exit_code: 0,
    active_plan: 'plans/plan-demo.md',
    review_subject_sha256: subject.review_subject_sha256,
    benchmark_evidence: { status: 'not_applicable', report_sha256: 'not-applicable' },
    commands: [{ name: 'verify-sprint', status: 'pass', exit_code: 0 }],
    guards: [
      { name: 'contract', status: 'pass' },
      { name: 'review', status: 'pass' },
      { name: 'allowed_paths', status: 'pass' },
    ],
    contract: { file: 'tasks/contracts/demo.contract.md' },
    review: { file: 'tasks/reviews/demo.review.md' },
  }, null, 2)}\n`);

  const providerCalls = join(home, 'provider-calls');
  writeFileSync(providerCalls, '1\n');
  await recordAcceptance({
    root: cwd,
    authorityHome: home,
    contract: 'tasks/contracts/demo.contract.md',
    verification: '.ai/harness/checks/latest.json',
    disposition: 'external_pass',
    reviewer: 'Claude',
    source: 'claude-review',
    actor: null,
    summary: 'the sole semantic reviewer accepted the candidate',
    findings: [],
  });
  const harness = join(home, 'merge-gate-harness.ts');
  writeFileSync(harness, `import { runMergeGateCli } from ${JSON.stringify(SCRIPT)};\nawait runMergeGateCli(process.argv.slice(2), ${JSON.stringify(home)});\n`);
  return { cwd, home, harness, providerCalls };
}

describe('provider-free merge seal', () => {
  test('consumes the one AcceptanceReceipt and binds exact base/head/full diff locally', async () => {
    const fixture = await makeFixture();
    const sealed = run('bun', [fixture.harness, 'run', '--base', 'main', '--format', 'json'], fixture.cwd);
    expect(sealed.status, sealed.stderr).toBe(0);
    expect(JSON.parse(sealed.stdout).required).toBe(true);
    expect(readFileSync(fixture.providerCalls, 'utf-8').trim()).toBe('1');

    const sealPath = join(dirname(acceptanceReceiptPath(fixture.cwd, fixture.home)), 'merge-seal.latest.json');
    const seal = JSON.parse(readFileSync(sealPath, 'utf-8'));
    expect(seal.kind).toBe('repo-harness-merge-seal');
    expect(seal.base_sha).toBe(git(fixture.cwd, 'rev-parse', 'main'));
    expect(seal.head_sha).toBe(git(fixture.cwd, 'rev-parse', 'HEAD'));
    expect(seal.diff_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(seal).not.toHaveProperty('runner');
    expect(seal).not.toHaveProperty('agent');

    const verified = run('bun', [fixture.harness, 'verify', '--base', 'main', '--format', 'sha'], fixture.cwd);
    expect(verified.status, verified.stderr).toBe(0);
    expect(verified.stdout.trim()).toBe(git(fixture.cwd, 'rev-parse', 'HEAD'));
    expect(readFileSync(fixture.providerCalls, 'utf-8').trim()).toBe('1');
  });

  test('review-only head movement needs only reseal; semantic movement invalidates acceptance', async () => {
    const fixture = await makeFixture();
    expect(run('bun', [fixture.harness, 'run', '--base', 'main', '--format', 'sha'], fixture.cwd).status).toBe(0);
    writeFileSync(join(fixture.cwd, 'tasks', 'reviews', 'demo.review.md'), '# Review\n\nprojection changed\n');
    commit(fixture.cwd, 'review projection');
    const staleSeal = run('bun', [fixture.harness, 'verify', '--base', 'main', '--format', 'sha'], fixture.cwd);
    expect(staleSeal.status).not.toBe(0);
    expect(staleSeal.stderr).toContain('merge seal head_sha is stale');
    expect(run('bun', [fixture.harness, 'run', '--base', 'main', '--format', 'sha'], fixture.cwd).status).toBe(0);

    writeFileSync(join(fixture.cwd, 'feature.txt'), 'semantic movement\n');
    commit(fixture.cwd, 'semantic movement');
    const invalid = run('bun', [fixture.harness, 'run', '--base', 'main', '--format', 'sha'], fixture.cwd);
    expect(invalid.status).not.toBe(0);
    expect(invalid.stderr).toContain('semantic subject is stale');
    expect(readFileSync(fixture.providerCalls, 'utf-8').trim()).toBe('1');
  });

  test('non-overlapping target movement reuses acceptance and recomputes only the local seal', async () => {
    const fixture = await makeFixture();
    git(fixture.cwd, 'checkout', 'main');
    writeFileSync(join(fixture.cwd, 'other.txt'), 'target advanced\n');
    commit(fixture.cwd, 'advance base');
    git(fixture.cwd, 'checkout', 'codex/demo');
    const resealed = run('bun', [fixture.harness, 'run', '--base', 'main', '--format', 'sha'], fixture.cwd);
    expect(resealed.status, resealed.stderr).toBe(0);
    expect(readFileSync(fixture.providerCalls, 'utf-8').trim()).toBe('1');
  });

  test('post-freeze lifecycle commit verifies against the sealed head without another provider call', async () => {
    const fixture = await makeFixture();
    const sealed = run('bun', [
      fixture.harness,
      'run',
      '--base', 'main',
      '--allow-post-freeze', 'tasks/current.md',
      '--format', 'sha',
    ], fixture.cwd);
    expect(sealed.status, sealed.stderr).toBe(0);

    mkdirSync(join(fixture.cwd, 'tasks'), { recursive: true });
    writeFileSync(join(fixture.cwd, 'tasks', 'current.md'), '# Current\n\nlifecycle projection\n');
    commit(fixture.cwd, 'archive lifecycle projection');

    const verified = run('bun', [fixture.harness, 'verify', '--base', 'main', '--format', 'sha'], fixture.cwd);
    expect(verified.status, verified.stderr).toBe(0);
    expect(verified.stdout.trim()).toBe(git(fixture.cwd, 'rev-parse', 'HEAD'));
    expect(readFileSync(fixture.providerCalls, 'utf-8').trim()).toBe('1');
  });
});
