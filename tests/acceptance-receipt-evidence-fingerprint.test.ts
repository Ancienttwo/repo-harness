import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { buildReviewSubject } from '../src/effects/review/diff-fingerprint';
import { assessChange, buildReviewSelectionPacket } from '../src/core/review/change-assessment';
import { recordAcceptance, verifyAcceptance } from '../scripts/acceptance-receipt';

const tempDirs: string[] = [];
afterEach(() => { for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true }); });

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}
function commit(cwd: string, message: string): void { git(cwd, 'add', '-A'); git(cwd, 'commit', '-m', message); }

function contract(): string {
  return [
    '# Task Contract: demo', '', '> **Status**: Active', '> **Plan**: plans/plan-demo.md',
    '> **Owner**: kito', '', '## Acceptance Policy', '', '```json',
    '{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}', '```', '',
    '## Change Assessment', '', '```json', '{"protocol":1,"oracles":[]}', '```', '',
  ].join('\n');
}

/**
 * The ledger's blob-offload path stores `canonicalize(payload)` -- keys sorted
 * recursively (src/core/evidence/canonical-json.ts) -- while the inline path
 * stores the producer's object as-is (src/effects/evidence/event-writer.ts:82-92).
 * `checks/latest.json` is spread verbatim from whichever form the winning event
 * carried (src/effects/evidence/checks-materializer.ts:239-254), so the same
 * verification result legitimately reaches disk in two different key orders.
 */
function deepSortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepSortKeys) as unknown as T;
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) out[key] = deepSortKeys(record[key]);
  return out as unknown as T;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function changeAssessmentEvidence(subject: ReturnType<typeof buildReviewSubject>): Record<string, unknown> {
  const assessment = assessChange({
    subject,
    workflowProfile: 'lite',
    strictCategories: [],
    patternNoveltyPaths: [],
    declaredOracles: [],
  });
  if (assessment.status !== 'ready') throw new Error('fixture assessment must be ready');
  const selection_packet = buildReviewSelectionPacket(assessment);
  const basis = {
    schema: 'repo-harness-change-assessment-evidence.v1',
    status: 'pass',
    assessment,
    selection_packet,
  };
  return {
    ...basis,
    evidence_sha256: `sha256:${createHash('sha256').update(stableJson(basis)).digest('hex')}`,
  };
}

function passingChecks(root: string): Record<string, unknown> {
  const subject = buildReviewSubject(root, { targetRef: 'main' });
  expect(subject.status).toBe('ok');
  // Producer key order, as scripts/verify-sprint.sh emits it.
  return {
    schema: 'repo-harness-run-trace.v1',
    source: 'verify-sprint',
    status: 'pass',
    exit_code: 0,
    active_plan: 'plans/plan-demo.md',
    review_subject_sha256: subject.review_subject_sha256,
    benchmark_evidence: { status: 'not_applicable', report_sha256: '', benchmark_subject_sha256: '' },
    commands: [{ name: 'verify-sprint', command: 'repo-harness run verify-sprint', status: 'pass', exit_code: 0 }],
    guards: [
      { name: 'contract', status: 'pass' },
      { name: 'review', status: 'pass' },
      { name: 'allowed_paths', status: 'pass' },
      { name: 'change_assessment', status: 'pass' },
    ],
    contract: { file: 'tasks/contracts/demo.contract.md' },
    review: { file: 'tasks/reviews/demo.review.md' },
    change_assessment: changeAssessmentEvidence(subject),
  };
}

function writeChecks(root: string, checks: unknown): void {
  writeFileSync(join(root, '.ai', 'harness', 'checks', 'latest.json'), `${JSON.stringify(checks, null, 2)}\n`);
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-arfp-repo-'));
  const home = mkdtempSync(join(tmpdir(), 'repo-harness-arfp-home-'));
  tempDirs.push(root, home);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Acceptance Test');
  git(root, 'config', 'user.email', 'acceptance@test.local');
  mkdirSync(join(root, '.ai', 'harness', 'checks'), { recursive: true });
  mkdirSync(join(root, 'plans'), { recursive: true });
  mkdirSync(join(root, 'tasks', 'contracts'), { recursive: true });
  mkdirSync(join(root, 'tasks', 'reviews'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), '.ai/harness/checks/\n');
  writeFileSync(join(root, '.ai', 'harness', 'policy.json'), `${JSON.stringify({
    worktree_strategy: { review_base: 'main' },
    merge_gate: { enabled: true, rule: 'fixture' },
  }, null, 2)}\n`);
  writeFileSync(join(root, 'base.txt'), 'base\n');
  commit(root, 'base');
  writeFileSync(join(root, 'feature.txt'), 'candidate\n');
  writeFileSync(join(root, 'plans', 'plan-demo.md'), '# Plan: demo\n\n> **Status**: Executing\n');
  writeFileSync(join(root, 'tasks', 'contracts', 'demo.contract.md'), contract());
  writeFileSync(join(root, 'tasks', 'reviews', 'demo.review.md'), '# Review\n\n> **Recommendation**: pass\n');
  commit(root, 'candidate');
  return { root, home };
}

describe('AcceptanceReceipt verification-evidence fingerprint', () => {
  test('survives a semantics-preserving key-order change in checks/latest.json', async () => {
    const { root, home } = makeFixture();
    const checks = passingChecks(root);
    writeChecks(root, checks);

    const receipt = await recordAcceptance({
      root, authorityHome: home,
      contract: 'tasks/contracts/demo.contract.md',
      verification: '.ai/harness/checks/latest.json',
      disposition: 'external_pass', reviewer: 'Claude', source: 'claude-review',
      actor: null, summary: 'fixture acceptance', findings: [],
    });

    // Re-materialization through the ledger's blob path: identical semantics,
    // canonicalized (key-sorted) encoding. Nothing the receipt attested to changed.
    const reMaterialized = deepSortKeys(checks);
    expect(reMaterialized).toEqual(checks);
    expect(JSON.stringify(reMaterialized)).not.toBe(JSON.stringify(checks));
    writeChecks(root, reMaterialized);

    const verified = await verifyAcceptance({ root, authorityHome: home });
    expect(verified.verification_evidence_sha256).toBe(receipt.verification_evidence_sha256);
    expect(verified.disposition).toBe('external_pass');
  }, 30_000);

  test('still fails closed when the verification evidence changes semantically', async () => {
    const { root, home } = makeFixture();
    const checks = passingChecks(root);
    writeChecks(root, checks);
    await recordAcceptance({
      root, authorityHome: home,
      contract: 'tasks/contracts/demo.contract.md',
      verification: '.ai/harness/checks/latest.json',
      disposition: 'external_pass', reviewer: 'Claude', source: 'claude-review',
      actor: null, summary: 'fixture acceptance', findings: [],
    });
    writeChecks(root, {
      ...checks,
      commands: [
        { name: 'verify-sprint', command: 'repo-harness run verify-sprint', status: 'pass', exit_code: 0 },
        { name: 'extra', command: 'repo-harness run extra', status: 'pass', exit_code: 0 },
      ],
    });
    await expect(verifyAcceptance({ root, authorityHome: home })).rejects.toThrow('verification evidence is stale');
  }, 30_000);
});
