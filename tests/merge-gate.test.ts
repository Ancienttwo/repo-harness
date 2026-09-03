import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { buildReviewSubject } from '../src/effects/review/diff-fingerprint';
import { prepareChangeAssessment } from '../src/effects/review/change-assessment';
import { acceptanceAuthorityFingerprint, acceptanceReceiptPath, recordAcceptance, sealArchiveProjection } from '../scripts/acceptance-receipt';

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

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function changeAssessmentEvidence(cwd: string): Record<string, unknown> {
  const prepared = prepareChangeAssessment({ repoRoot: cwd, contractPath: 'tasks/contracts/demo.contract.md' });
  if (prepared.assessment.status !== 'ready' || !prepared.packet || prepared.packet.status !== 'ready') {
    throw new Error('fixture Change Assessment must be ready');
  }
  const basis = {
    schema: 'repo-harness-change-assessment-evidence.v1',
    status: 'pass',
    assessment: prepared.assessment,
    selection_packet: prepared.packet,
  };
  return { ...basis, evidence_sha256: `sha256:${createHash('sha256').update(stableJson(basis)).digest('hex')}` };
}

async function makeFixture(seedCandidate?: (cwd: string) => void) {
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
    '## Change Assessment',
    '',
    '```json',
    '{"protocol":1,"oracles":[]}',
    '```',
    '',
  ].join('\n'));
  writeFileSync(join(cwd, 'tasks', 'reviews', 'demo.review.md'), '# Review\n\n> **Recommendation**: pass\n');
  // Seeded before the candidate commit so the acceptance receipt covers the
  // same subject the gate scans: a later commit would fail on staleness first
  // and never reach the leak scan.
  seedCandidate?.(cwd);
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
      { name: 'change_assessment', status: 'pass' },
    ],
    contract: { file: 'tasks/contracts/demo.contract.md' },
    review: { file: 'tasks/reviews/demo.review.md' },
    change_assessment: changeAssessmentEvidence(cwd),
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

function archiveAcceptedFixture(cwd: string, home: string, apply = true): Record<string, string> {
  const livePlan = 'plans/plan-demo.md';
  const liveContract = 'tasks/contracts/demo.contract.md';
  const liveReview = 'tasks/reviews/demo.review.md';
  const archivedPlan = 'plans/archive/plan-demo.md';
  const archivedContract = 'tasks/archive/contract-20260904-demo.md';
  const archivedReview = 'tasks/archive/review-20260904-demo.md';
  const projection = [
    `> **Archive Projection V1**: \`${livePlan}\` => \`${archivedPlan}\``,
    `> **Archive Projection V1**: \`${liveContract}\` => \`${archivedContract}\``,
    `> **Archive Projection V1**: \`${liveReview}\` => \`${archivedReview}\``,
  ];
  const envelope = (lifecycle: 'plan' | 'contract' | 'review') => [
    '> **Archived**: 2026-09-04 09:45',
    `> **Related Plan**: ${archivedPlan}`,
    '> **Outcome**: Completed',
    `> **Lifecycle**: ${lifecycle}`,
    '> **Parent Run ID**: merge-gate-archive-fixture',
    ...projection,
    '',
  ];

  const archivedPlanContent = [
    ...envelope('plan'),
    readFileSync(join(cwd, livePlan), 'utf-8')
      .replace('> **Status**: Executing', '> **Status**: Archived')
      .replaceAll(livePlan, archivedPlan)
      .replaceAll(liveContract, archivedContract),
  ].join('\n');
  const archivedContractContent = [
    ...envelope('contract'),
    readFileSync(join(cwd, liveContract), 'utf-8')
      .replaceAll(livePlan, archivedPlan)
      .replaceAll(liveContract, archivedContract),
  ].join('\n');
  const archivedReviewContent = [
    ...envelope('review'),
    readFileSync(join(cwd, liveReview), 'utf-8')
      .replaceAll(livePlan, archivedPlan)
      .replaceAll(liveReview, archivedReview),
  ].join('\n');
  const destinations = {
    [archivedPlan]: `sha256:${createHash('sha256').update(archivedPlanContent).digest('hex')}`,
    [archivedContract]: `sha256:${createHash('sha256').update(archivedContractContent).digest('hex')}`,
    [archivedReview]: `sha256:${createHash('sha256').update(archivedReviewContent).digest('hex')}`,
  };
  if (!apply) return destinations;

  mkdirSync(join(cwd, 'plans', 'archive'), { recursive: true });
  mkdirSync(join(cwd, 'tasks', 'archive'), { recursive: true });
  writeFileSync(join(cwd, archivedPlan), archivedPlanContent);
  writeFileSync(join(cwd, archivedContract), archivedContractContent);
  writeFileSync(join(cwd, archivedReview), archivedReviewContent);
  rmSync(join(cwd, livePlan));
  rmSync(join(cwd, liveContract));
  rmSync(join(cwd, liveReview));
  commit(cwd, 'archive accepted workflow');
  sealArchiveProjection({ root: cwd, authorityHome: home, contract: archivedContract });
  return destinations;
}

describe('provider-free merge seal', () => {
  test('consumes the one AcceptanceReceipt and binds exact base/head/full diff locally', async () => {
    const fixture = await makeFixture();
    const required = run('bun', [fixture.harness, 'fingerprint', '--base', 'main', '--format', 'required'], fixture.cwd);
    expect(required.status, required.stderr).toBe(0);
    expect(required.stdout.trim()).toBe('true');
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
  }, 30_000);

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
  }, 30_000);

  test('non-overlapping target movement invalidates exact-target Change Assessment evidence', async () => {
    const fixture = await makeFixture();
    git(fixture.cwd, 'checkout', 'main');
    writeFileSync(join(fixture.cwd, 'other.txt'), 'target advanced\n');
    commit(fixture.cwd, 'advance base');
    git(fixture.cwd, 'checkout', 'codex/demo');
    const resealed = run('bun', [fixture.harness, 'run', '--base', 'main', '--format', 'sha'], fixture.cwd);
    expect(resealed.status).not.toBe(0);
    expect(resealed.stderr).toContain('change assessment packet is stale');
    expect(readFileSync(fixture.providerCalls, 'utf-8').trim()).toBe('1');
  }, 30_000);

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
  }, 30_000);

  test('post-freeze archive projection preserves the already sealed acceptance authority', async () => {
    const fixture = await makeFixture();
    const beforeArchive = acceptanceAuthorityFingerprint(fixture.cwd, fixture.home);
    const destinations = archiveAcceptedFixture(fixture.cwd, fixture.home, false);
    const sealed = run('bun', [
      fixture.harness,
      'run',
      '--base', 'main',
      '--allow-post-freeze', 'plans/plan-demo.md',
      '--allow-post-freeze', 'plans/archive/plan-demo.md',
      '--allow-post-freeze', 'tasks/contracts/demo.contract.md',
      '--allow-post-freeze', 'tasks/archive/contract-20260904-demo.md',
      '--allow-post-freeze', 'tasks/reviews/demo.review.md',
      '--allow-post-freeze', 'tasks/archive/review-20260904-demo.md',
      '--expect-post-freeze-destination', `plans/archive/plan-demo.md=${destinations['plans/archive/plan-demo.md']}`,
      '--expect-post-freeze-destination', `tasks/archive/contract-20260904-demo.md=${destinations['tasks/archive/contract-20260904-demo.md']}`,
      '--expect-post-freeze-destination', `tasks/archive/review-20260904-demo.md=${destinations['tasks/archive/review-20260904-demo.md']}`,
      '--format', 'sha',
    ], fixture.cwd);
    expect(sealed.status, sealed.stderr).toBe(0);
    const sealPath = join(dirname(acceptanceReceiptPath(fixture.cwd, fixture.home)), 'merge-seal.latest.json');
    const frozenSeal = JSON.parse(readFileSync(sealPath, 'utf-8')) as { acceptance_receipt_sha256: string };
    expect(frozenSeal.acceptance_receipt_sha256).toBe(beforeArchive);

    archiveAcceptedFixture(fixture.cwd, fixture.home);
    const afterArchive = acceptanceAuthorityFingerprint(fixture.cwd, fixture.home);
    expect(afterArchive).not.toBe(beforeArchive);
    expect(frozenSeal.acceptance_receipt_sha256).not.toBe(afterArchive);

    const verified = run('bun', [fixture.harness, 'verify', '--base', 'main', '--format', 'sha'], fixture.cwd);
    expect(verified.status, verified.stderr).toBe(0);
    expect(verified.stdout.trim()).toBe(git(fixture.cwd, 'rev-parse', 'HEAD'));
    expect(readFileSync(fixture.providerCalls, 'utf-8').trim()).toBe('1');
  }, 30_000);
});

/**
 * The seeded credential is assembled at runtime: a literal token shape in this
 * file would be an added line in this repository's own merge candidate and
 * would trip the very scan under test.
 */
describe('merge candidate leak scan', () => {
  const FAKE_AWS_KEY = `AKIA${'A'.repeat(16)}`;

  function sealFile(cwd: string, home: string): string {
    return join(dirname(acceptanceReceiptPath(cwd, home)), 'merge-seal.latest.json');
  }

  test('an added credential line fails the run before any seal is written', async () => {
    const fixture = await makeFixture((cwd) => {
      writeFileSync(join(cwd, 'feature.txt'), `candidate\nAWS_ACCESS_KEY_ID=${FAKE_AWS_KEY}\n`);
    });
    const sealed = run('bun', [fixture.harness, 'run', '--base', 'main', '--format', 'sha'], fixture.cwd);
    expect(sealed.status).not.toBe(0);
    expect(sealed.stderr).toContain('leak scan blocked the merge candidate');
    expect(sealed.stderr).toContain('aws-access-key-id');
    expect(sealed.stderr).toContain('feature.txt');
    expect(sealed.stderr).not.toContain(FAKE_AWS_KEY);
    expect(existsSync(sealFile(fixture.cwd, fixture.home))).toBe(false);
  }, 30_000);

  test('a candidate free of leak patterns still seals', async () => {
    const fixture = await makeFixture();
    const sealed = run('bun', [fixture.harness, 'run', '--base', 'main', '--format', 'sha'], fixture.cwd);
    expect(sealed.status, sealed.stderr).toBe(0);
    expect(existsSync(sealFile(fixture.cwd, fixture.home))).toBe(true);
  }, 30_000);

  test('a changed file under _ops/ fails the run before any seal is written', async () => {
    const fixture = await makeFixture((cwd) => {
      mkdirSync(join(cwd, '_ops'), { recursive: true });
      writeFileSync(join(cwd, '_ops', 'provider-state.json'), '{"local":true}\n');
    });
    const sealed = run('bun', [fixture.harness, 'run', '--base', 'main', '--format', 'sha'], fixture.cwd);
    expect(sealed.status).not.toBe(0);
    expect(sealed.stderr).toContain('leak scan blocked the merge candidate');
    expect(sealed.stderr).toContain('local-ops-path');
    expect(sealed.stderr).toContain('_ops/provider-state.json');
    expect(existsSync(sealFile(fixture.cwd, fixture.home))).toBe(false);
  }, 30_000);
});
