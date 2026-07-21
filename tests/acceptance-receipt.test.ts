import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { buildReviewSubject } from '../src/effects/review/diff-fingerprint';
import {
  parseAcceptancePolicy,
  projectAcceptance,
  recordAcceptance,
  recordUserWaiverAcceptance,
  recordUserWaiverGrant,
  revokeUserWaiverGrant,
  verifyAcceptance,
  verifyUserWaiverGrant,
} from '../scripts/acceptance-receipt';

const tempDirs: string[] = [];

afterEach(() => {
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function commit(cwd: string, message: string): void {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-m', message);
}

function contract(waiver: 'allowed' | 'forbidden' = 'allowed'): string {
  return [
    '# Task Contract: demo',
    '',
    '> **Status**: Active',
    '> **Plan**: plans/plan-demo.md',
    '> **Owner**: kito',
    '',
    '## Acceptance Policy',
    '',
    '```json',
    `{"protocol":1,"reviewer":"Claude","user_waiver":"${waiver}"}`,
    '```',
    '',
  ].join('\n');
}

function writePassingChecks(root: string): void {
  const subject = buildReviewSubject(root, { targetRef: 'main' });
  expect(subject.status).toBe('ok');
  const checks = {
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
  };
  writeFileSync(join(root, '.ai', 'harness', 'checks', 'latest.json'), JSON.stringify(checks, null, 2) + '\n');
}

function makeFixture(waiver: 'allowed' | 'forbidden' = 'allowed') {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-acceptance-repo-'));
  const home = mkdtempSync(join(tmpdir(), 'repo-harness-acceptance-home-'));
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
  git(root, 'checkout', '-b', 'codex/demo');
  writeFileSync(join(root, 'feature.txt'), 'candidate\n');
  writeFileSync(join(root, 'plans', 'plan-demo.md'), '# Plan: demo\n\n> **Status**: Executing\n');
  writeFileSync(join(root, 'tasks', 'contracts', 'demo.contract.md'), contract(waiver));
  writeFileSync(join(root, 'tasks', 'reviews', 'demo.review.md'), '# Review\n\n> **Recommendation**: pass\n');
  commit(root, 'candidate');
  writePassingChecks(root);
  return { root, home };
}

async function externalPass(root: string, home: string) {
  return recordAcceptance({
    root,
    authorityHome: home,
    contract: 'tasks/contracts/demo.contract.md',
    verification: '.ai/harness/checks/latest.json',
    disposition: 'external_pass',
    reviewer: 'Claude',
    source: 'claude-review',
    actor: null,
    summary: 'candidate accepted',
    findings: [],
  });
}

describe('AcceptanceReceipt', () => {
  test('strictly parses the contract-frozen reviewer and waiver policy', () => {
    expect(parseAcceptancePolicy(contract())).toEqual({ protocol: 1, reviewer: 'Claude', user_waiver: 'allowed' });
    expect(() => parseAcceptancePolicy(contract().replace('"allowed"', '"maybe"'))).toThrow('user_waiver');
  });

  test('review projection changes do not invalidate acceptance, semantic changes do', async () => {
    const { root, home } = makeFixture();
    const receipt = await externalPass(root, home);
    const reviewPath = join(root, 'tasks', 'reviews', 'demo.review.md');
    writeFileSync(reviewPath, [
      '# Review',
      '',
      '## Acceptance Receipt Projection',
      '',
      '> **Disposition**: unavailable',
      '',
      '## Summary',
      '',
      '- pending',
      '',
    ].join('\n'));
    projectAcceptance(reviewPath, receipt);
    projectAcceptance(reviewPath, receipt);
    const projection = readFileSync(reviewPath, 'utf-8');
    expect(projection.match(/^## Acceptance Receipt Projection$/gm)).toHaveLength(1);
    expect(projection).not.toContain('> **Disposition**: unavailable');
    expect(projection).toContain('## Summary\n\n- pending');
    expect((await verifyAcceptance({ root, authorityHome: home })).disposition).toBe('external_pass');

    writeFileSync(join(root, 'feature.txt'), 'semantic change\n');
    await expect(verifyAcceptance({ root, authorityHome: home })).rejects.toThrow('semantic subject is stale');
  });

  test('typed user waiver stays distinct from external pass and obeys the contract', async () => {
    const allowed = makeFixture('allowed');
    const grant = recordUserWaiverGrant({
      root: allowed.root,
      authorityHome: allowed.home,
      contract: 'tasks/contracts/demo.contract.md',
      actor: 'kito',
      summary: 'owner accepted the bounded contract risk',
    });
    const receipt = await recordUserWaiverAcceptance({
      root: allowed.root,
      authorityHome: allowed.home,
      contract: 'tasks/contracts/demo.contract.md',
      verification: '.ai/harness/checks/latest.json',
    });
    expect(grant.scope).toBe('contract-authority');
    expect(receipt.disposition).toBe('user_waiver');
    expect(receipt.protocol).toBe(2);
    expect(receipt.waiver_grant_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect((await verifyAcceptance({ root: allowed.root, authorityHome: allowed.home })).disposition).not.toBe('external_pass');
    await expect(recordAcceptance({
      root: allowed.root,
      authorityHome: allowed.home,
      contract: 'tasks/contracts/demo.contract.md',
      verification: '.ai/harness/checks/latest.json',
      disposition: 'user_waiver',
      reviewer: 'User',
      source: 'user-waiver',
      actor: 'kito',
      summary: 'direct fallback attempt',
      findings: [],
    })).rejects.toThrow('must be materialized from a valid UserWaiverGrant');

    const forbidden = makeFixture('forbidden');
    expect(() => recordUserWaiverGrant({
      root: forbidden.root,
      authorityHome: forbidden.home,
      contract: 'tasks/contracts/demo.contract.md',
      actor: 'kito',
      summary: 'attempted waiver',
    })).toThrow('forbids user waiver');
  });

  test('reuses one owner grant after semantic correction while every receipt stays exact', async () => {
    const { root, home } = makeFixture();
    const grant = recordUserWaiverGrant({
      root,
      authorityHome: home,
      contract: 'tasks/contracts/demo.contract.md',
      actor: 'kito',
      summary: 'one bounded owner decision',
    });
    const first = await recordUserWaiverAcceptance({
      root,
      authorityHome: home,
      contract: 'tasks/contracts/demo.contract.md',
      verification: '.ai/harness/checks/latest.json',
    });

    writeFileSync(join(root, 'feature.txt'), 'corrective semantic change\n');
    await expect(verifyAcceptance({ root, authorityHome: home })).rejects.toThrow('semantic subject is stale');
    await expect(recordUserWaiverAcceptance({
      root,
      authorityHome: home,
      contract: 'tasks/contracts/demo.contract.md',
      verification: '.ai/harness/checks/latest.json',
    })).rejects.toThrow('verification evidence is stale');

    writePassingChecks(root);
    const second = await recordUserWaiverAcceptance({
      root,
      authorityHome: home,
      contract: 'tasks/contracts/demo.contract.md',
      verification: '.ai/harness/checks/latest.json',
    });
    expect(second.subject_sha256).not.toBe(first.subject_sha256);
    expect(second.waiver_grant_sha256).toBe(first.waiver_grant_sha256);
    expect((verifyUserWaiverGrant({ root, authorityHome: home }))).toEqual(grant);
    expect((await verifyAcceptance({ root, authorityHome: home })).subject_sha256).toBe(second.subject_sha256);
  });

  test('contract or goal authority changes invalidate the owner grant', async () => {
    const contractChanged = makeFixture();
    recordUserWaiverGrant({
      root: contractChanged.root,
      authorityHome: contractChanged.home,
      contract: 'tasks/contracts/demo.contract.md',
      actor: 'kito',
      summary: 'bounded decision',
    });
    writeFileSync(
      join(contractChanged.root, 'tasks', 'contracts', 'demo.contract.md'),
      contract().replace('## Acceptance Policy', '## Scope\n\n- changed authority\n\n## Acceptance Policy'),
    );
    expect(() => verifyUserWaiverGrant({
      root: contractChanged.root,
      authorityHome: contractChanged.home,
      contract: 'tasks/contracts/demo.contract.md',
    })).toThrow('contract authority is stale');

    const goalChanged = makeFixture();
    recordUserWaiverGrant({
      root: goalChanged.root,
      authorityHome: goalChanged.home,
      contract: 'tasks/contracts/demo.contract.md',
      actor: 'kito',
      summary: 'bounded decision',
    });
    writeFileSync(join(goalChanged.root, 'plans', 'plan-demo.md'), '# Plan: demo\n\n> **Status**: Executing\n\nchanged goal\n');
    expect(() => verifyUserWaiverGrant({
      root: goalChanged.root,
      authorityHome: goalChanged.home,
      contract: 'tasks/contracts/demo.contract.md',
    })).toThrow('goal authority is stale');
  });

  test('revocation invalidates a user-waiver receipt and external pass never binds a grant', async () => {
    const waived = makeFixture();
    recordUserWaiverGrant({
      root: waived.root,
      authorityHome: waived.home,
      contract: 'tasks/contracts/demo.contract.md',
      actor: 'kito',
      summary: 'revocable decision',
    });
    await recordUserWaiverAcceptance({
      root: waived.root,
      authorityHome: waived.home,
      contract: 'tasks/contracts/demo.contract.md',
      verification: '.ai/harness/checks/latest.json',
    });
    revokeUserWaiverGrant({ root: waived.root, authorityHome: waived.home });
    await expect(verifyAcceptance({ root: waived.root, authorityHome: waived.home })).rejects.toThrow('UserWaiverGrant is missing');

    const external = makeFixture();
    const externalReceipt = await externalPass(external.root, external.home);
    expect(externalReceipt.waiver_grant_sha256).toBeNull();
  });

  test('non-overlapping target movement preserves acceptance; overlap invalidates it', async () => {
    const { root, home } = makeFixture();
    await externalPass(root, home);
    git(root, 'checkout', 'main');
    writeFileSync(join(root, 'other.txt'), 'unrelated target change\n');
    commit(root, 'advance target without overlap');
    git(root, 'checkout', 'codex/demo');
    expect((await verifyAcceptance({ root, authorityHome: home })).disposition).toBe('external_pass');

    git(root, 'checkout', 'main');
    writeFileSync(join(root, 'feature.txt'), 'target overlap\n');
    commit(root, 'advance target with overlap');
    git(root, 'checkout', 'codex/demo');
    await expect(verifyAcceptance({ root, authorityHome: home })).rejects.toThrow('overlaps 1 reviewed path');
  });

  test('strict archive envelopes preserve plan and contract receipt authority', async () => {
    const { root, home } = makeFixture();
    await externalPass(root, home);
    mkdirSync(join(root, 'plans', 'archive'), { recursive: true });
    mkdirSync(join(root, 'tasks', 'archive'), { recursive: true });

    const plan = readFileSync(join(root, 'plans', 'plan-demo.md'), 'utf-8')
      .replace('> **Status**: Executing', '> **Status**: Archived');
    writeFileSync(join(root, 'plans', 'archive', 'plan-demo.md'), plan);
    rmSync(join(root, 'plans', 'plan-demo.md'));

    const liveContract = readFileSync(join(root, 'tasks', 'contracts', 'demo.contract.md'), 'utf-8');
    writeFileSync(join(root, 'tasks', 'archive', 'contract-20260721-0800-demo.md'), [
      '> **Archived**: 2026-07-21 08:00',
      '> **Related Plan**: plans/archive/plan-demo.md',
      '> **Outcome**: Completed',
      '> **Lifecycle**: contract',
      '> **Parent Run ID**: acceptance-test',
      '',
      liveContract,
    ].join('\n'));
    rmSync(join(root, 'tasks', 'contracts', 'demo.contract.md'));
    commit(root, 'archive accepted workflow');

    expect((await verifyAcceptance({ root, authorityHome: home })).disposition).toBe('external_pass');
  });

  test('strict archive envelopes preserve the waiver grant and its exact receipt', async () => {
    const { root, home } = makeFixture();
    recordUserWaiverGrant({
      root,
      authorityHome: home,
      contract: 'tasks/contracts/demo.contract.md',
      actor: 'kito',
      summary: 'archive-safe bounded decision',
    });
    await recordUserWaiverAcceptance({
      root,
      authorityHome: home,
      contract: 'tasks/contracts/demo.contract.md',
      verification: '.ai/harness/checks/latest.json',
    });
    mkdirSync(join(root, 'plans', 'archive'), { recursive: true });
    mkdirSync(join(root, 'tasks', 'archive'), { recursive: true });

    const plan = readFileSync(join(root, 'plans', 'plan-demo.md'), 'utf-8')
      .replace('> **Status**: Executing', '> **Status**: Archived');
    writeFileSync(join(root, 'plans', 'archive', 'plan-demo.md'), plan);
    rmSync(join(root, 'plans', 'plan-demo.md'));

    const liveContract = readFileSync(join(root, 'tasks', 'contracts', 'demo.contract.md'), 'utf-8');
    writeFileSync(join(root, 'tasks', 'archive', 'contract-20260721-0900-demo.md'), [
      '> **Archived**: 2026-07-21 09:00',
      '> **Related Plan**: plans/archive/plan-demo.md',
      '> **Outcome**: Completed',
      '> **Lifecycle**: contract',
      '> **Parent Run ID**: waiver-archive-test',
      '',
      liveContract,
    ].join('\n'));
    rmSync(join(root, 'tasks', 'contracts', 'demo.contract.md'));
    commit(root, 'archive waived workflow');

    expect(verifyUserWaiverGrant({ root, authorityHome: home }).actor).toBe('kito');
    expect((await verifyAcceptance({ root, authorityHome: home })).disposition).toBe('user_waiver');
  });
});
