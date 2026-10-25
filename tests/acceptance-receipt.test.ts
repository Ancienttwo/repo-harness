import { startOfflineTaskAgent } from './helpers/engineer-runtime-fixture';
import { canonicalize } from '../src/core/evidence/canonical-json';
import { observeActiveReviewAdmission } from '../src/effects/admission/issue-goal';
import { seedReviewAdmissionFixture } from './helpers/review-admission-fixture';
import { parseAcceptancePolicy, acceptanceBenchmarkRequirement } from '../src/core/review/acceptance-receipt';
import { runReviewRound, closeReview, reviewLocation, type ReviewEffects } from '../src/effects/review/generic-review';
import { readSessionArtifact, writeSessionArtifact, taskSessionDirectory as importedTaskDir, type TaskRequest } from '../src/effects/terminal/task-session';
import { recordFixtureAcceptance, fixtureReviewResult } from './helpers/repo-fixture';
import { afterEach, describe, expect, test } from 'bun:test';
import { darwinTest } from './helpers/darwin-test';
import { existsSync, mkdtempSync, mkdirSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { buildReviewSubject } from '../src/effects/review/diff-fingerprint';
import { prepareChangeAssessment } from '../src/effects/review/change-assessment';
import { applyReviewerDisagreement, assessChange, buildReviewSelectionPacket } from '../src/core/review/change-assessment';
import { executeAdmittedVerification, evaluateAdmittedVerification, materializeVerificationExecutionReport } from '../src/effects/evidence/verification-execution';
import { acceptanceContext, authorityFingerprint, acceptanceReceiptPath, acceptanceVerificationObservationPath, inspectAcceptanceEvidence, inspectAcceptanceCurrentBinding, projectAcceptance, recordAcceptance, recordUserWaiverAcceptance, recordUserWaiverGrant, revokeUserWaiverGrant, verifyAcceptance, verifyUserWaiverGrant } from '../scripts/acceptance-receipt';

const tempDirs: string[] = [];
const admissions = new Map<string, ReturnType<typeof seedReviewAdmissionFixture>>();
function authorityFor(root: string) {
  const fixture = admissions.get(root);
  if (!fixture) throw new Error('missing explicit test admission');
  return fixture.source;
}
// Explicit separate upstream decision fixture. This is not authentication proof.
function recordFixtureUserWaiverGrant(args: Parameters<typeof recordUserWaiverGrant>[0]) {
  const active = observeActiveReviewAdmission(args.authority), admission = active.admission;
  return recordUserWaiverGrant({ ...args, authorization: {
    protocol: 1, kind: 'repo-harness-upstream-waiver-authorization', action: 'human-approved-user-waiver',
    authorization_ref: 'fixture-separate-human-decision', bot_id: 'fixture-control-bot',
    repository_root: realpathSync(args.root), repository_id: admission.repository_id,
    issue_id: admission.issue_id, campaign_id: admission.campaign_id,
    campaign_sha256: admission.campaign_sha256, admission_sha256: admission.admission_sha256,
    grant_sha256: active.grant_sha256, goal_sha256: admission.goal.revision,
    actor: admission.actor_id, summary: args.summary, expires_at: Date.now() + 3_600_000,
  } });
}
const fixturePlan = { protocol: 1 as const, checks: [{ id: 'feature-content', kind: 'command' as const,
  command: "test \"$(wc -l < feature.txt | tr -d ' ')\" = 1 && LC_ALL=C grep -qx '[a-z][a-z 0-9]*' feature.txt",
  cwd: '.', phase: 'verification' as const, cost: 'normal' as const, evidence_policy: 'current_exact' as const,
  necessity: 'Validate the tracked candidate file.', inputs: { env: [] } }] };
function approveFixture(root: string, home: string, options: Parameters<typeof seedReviewAdmissionFixture>[2] = {}) {
  const fixture = seedReviewAdmissionFixture(root, home, { reviewer: 'Claude', userWaiver: 'allowed', actor: 'kito',
    plan: fixturePlan, oracles: [], allowedPaths: ['feature.txt', 'plans/', 'tasks/', '.ai/harness/policy.json'], ...options });
  admissions.set(root, fixture);
  return fixture;
}

test('provider expected-context fence rejects each stale identity without overwriting acceptance', async () => {
  const { root, home } = makeFixture();
  await externalPass(root, home);
  const before = readFileSync(acceptanceReceiptPath(root, home), 'utf8');
  const context = await acceptanceContext({ root, authority: authorityFor(root), verification: '.ai/harness/runs/acceptance.report.json' });
  const expected = {
    admission_sha256: context.admission.admission_sha256, goal_sha256: context.goal.revision,
    subject_sha256: context.subject.review_subject_sha256, verification_evidence_sha256: context.evidence.fingerprint,
    target_revision: context.subject.target_rev,
  };
  for (const field of Object.keys(expected)) {
    await expect(recordFixtureAcceptance({ root, authority: authorityFor(root), authorityHome: home,
      verification: '.ai/harness/runs/acceptance.report.json', disposition: 'external_pass', reviewer: 'Claude', source: 'generic-review',
      actor: null, summary: 'Real provider opinion for a different context', findings: [], expectedContext: { ...expected, [field]: 'stale' },
    })).rejects.toThrow(`reviewed acceptance context is stale: ${field}`);
    expect(readFileSync(acceptanceReceiptPath(root, home), 'utf8')).toBe(before);
  }
});

test('generic review Receipt is launcher-independent and rejects every added binding tamper', async () => {
  const { root, home } = makeFixture();
  const input = { root, authority: authorityFor(root), authorityHome: home,
    verification: '.ai/harness/runs/acceptance.report.json', disposition: 'external_pass' as const,
    reviewer: 'Claude', source: 'generic-review', actor: null,
    summary: '[fixture opinion] candidate accepted; no real model verdict', findings: [],
    now: () => new Date('2026-10-02T00:00:00.000Z') };
  const reviewResult = await fixtureReviewResult(input);
  const bytes: string[] = [];
  for (const launcher of ['herdr', 'headless']) {
    // launcher is a test diagnostic only, never passed to the production authority.
    const receipt = await recordAcceptance({ ...input, reviewResult });
    const verified = await verifyAcceptance({ root, authority: authorityFor(root), authorityHome: home });
    expect(verified, `fixture caller: ${launcher}`).toEqual(receipt);
    bytes.push(readFileSync(acceptanceReceiptPath(root, home), 'utf8'));
  }
  expect(bytes[0]).toBe(bytes[1]);
  const valid = JSON.parse(bytes[0]!);
  for (const field of ['pane_id','herdr_session','pid','process_proof','host_launch_mode','provider_log_path']) expect(Object.hasOwn(valid,field)).toBe(false);
  const mutations = { request_id: 'other-request', context_sha256: `sha256:${'a'.repeat(64)}`,
    result_sha256: `sha256:${'b'.repeat(64)}`, actual_harness: 'codex', actual_role: 'fast-worker', actual_model: 'other-model' };
  for (const [field,value] of Object.entries(mutations)) {
    writeFileSync(acceptanceReceiptPath(root,home),JSON.stringify({ ...valid,[field]:value }));
    await expect(verifyAcceptance({root, authority: authorityFor(root),authorityHome:home})).rejects.toThrow(`AcceptanceReceipt generic-review ${field} mismatch`);
  }
  writeFileSync(acceptanceReceiptPath(root,home),bytes[0]!);
  for (const source of ['claude-review','codex-review']) {
    await expect(recordAcceptance({ ...input,reviewResult,source })).rejects.toThrow('approved reviewer policy');
    writeFileSync(acceptanceReceiptPath(root,home),JSON.stringify({ ...valid,source }));
    await expect(verifyAcceptance({root, authority: authorityFor(root),authorityHome:home})).rejects.toThrow('AcceptanceReceipt source is invalid');
  }
  writeFileSync(acceptanceReceiptPath(root,home),bytes[0]!);
});

afterEach(() => {
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true });
  admissions.clear();
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
    '## Allowed Paths', '', '```yaml', 'allowed_paths:', '  - feature.txt', '  - plans/', '  - tasks/', '  - .ai/harness/policy.json', '```', '',
    '## Evidence Requirements', '', '```yaml', 'evidence_requirements:', '  benchmark: not_applicable', '```', '',
    '## Acceptance Policy',
    '',
    '```json',
    `{"protocol":1,"reviewer":"Claude","user_waiver":"${waiver}"}`,
    '```',
    '',
    '## Change Assessment',
    '',
    '```json',
    '{"protocol":1,"oracles":[]}',
    '```',
    '',
    '## Verification Plan',
    '',
    '```json',
    JSON.stringify({protocol:1,checks:[{id:'feature-content',kind:'command',command:"test \"$(wc -l < feature.txt | tr -d ' ')\" = 1 && LC_ALL=C grep -qx '[a-z][a-z 0-9]*' feature.txt",cwd:'.',phase:'verification',cost:'normal',evidence_policy:'current_exact',necessity:'Validate the tracked candidate file.',inputs:{env:[]}}]}),
    '```',
    '',
  ].join('\n');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function changeAssessmentEnvelope(assessment: unknown, selection_packet: unknown): Record<string, unknown> {
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

function replaceChangeAssessment(root: string, next: Record<string, unknown>): void {
  writeFileSync(join(root, '.ai/harness/checks/change-assessment.latest.json'), JSON.stringify(next, null, 2) + '\n');
}

function writePassingChecks(root: string): void {
  const subject = buildReviewSubject(root, { targetRef: 'main' });
  expect(subject.status).toBe('ok');
  const report = executeAdmittedVerification({ repoRoot: root, authority: authorityFor(root), reportFile: '.ai/harness/runs/acceptance.report.json' });
  expect(report.passed).toBe(true);
  const prepared = prepareChangeAssessment({ repoRoot: root, authority: authorityFor(root) });
  replaceChangeAssessment(root, changeAssessmentEnvelope(prepared.assessment, prepared.packet));
}

function makeFixture(waiver: 'allowed' | 'forbidden' = 'allowed') {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-acceptance-repo-'));
  const home = mkdtempSync(join(tmpdir(), 'repo-harness-acceptance-home-'));
  tempDirs.push(root, home);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Acceptance Test');
  git(root, 'config', 'user.email', 'acceptance@test.local');
  mkdirSync(join(root, '.ai', 'harness', 'checks'), { recursive: true });
  mkdirSync(join(root, '.ai', 'harness', 'runs'), { recursive: true });
  mkdirSync(join(root, 'plans'), { recursive: true });
  mkdirSync(join(root, 'tasks', 'contracts'), { recursive: true });
  mkdirSync(join(root, 'tasks', 'reviews'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), '.ai/harness/checks/\n.ai/harness/runs/\n.ai/harness/evidence/\n');
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
  approveFixture(root, home, { userWaiver: waiver });
  writePassingChecks(root);
  return { root, home };
}

async function externalPass(root: string, home: string) {
  return recordFixtureAcceptance({
    root, authority: authorityFor(root),
    authorityHome: home,
    verification: '.ai/harness/runs/acceptance.report.json',
    disposition: 'external_pass',
    reviewer: 'Claude',
    source: 'generic-review',
    actor: null,
    summary: 'candidate accepted',
    findings: [],
  });
}

describe('AcceptanceReceipt', () => {
  test('strictly parses the contract-frozen reviewer and waiver policy', () => {
    expect(parseAcceptancePolicy(contract())).toEqual({ protocol: 1, reviewer: 'Claude', user_waiver: 'allowed' });
    expect(parseAcceptancePolicy(contract().replace(
      '{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}',
      '{"protocol":2,"reviewer":"Codex","source":"generic-review","user_waiver":"allowed"}',
    ))).toEqual({ protocol: 2, reviewer: 'Codex', source: 'generic-review', user_waiver: 'allowed' });
    expect(() => parseAcceptancePolicy(contract().replace('"allowed"', '"maybe"'))).toThrow('user_waiver');
    expect(() => parseAcceptancePolicy(contract().replace(
      '{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}',
      '{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}',
    ))).toThrow('source must be generic-review');
  });

  test('protocol 2 binds Codex review to generic domain source and rejects retired labels', async () => {
    const { root, home } = makeFixture();
    const contractPath = join(root, 'tasks', 'contracts', 'demo.contract.md');
    writeFileSync(contractPath, contract().replace(
      '{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}',
      '{"protocol":2,"reviewer":"Codex","source":"generic-review","user_waiver":"allowed"}',
    ));
    commit(root, 'freeze Codex acceptance policy');
    approveFixture(root, home, { reviewer: 'Codex' });
    writePassingChecks(root);

    await expect(recordFixtureAcceptance({
      root, authority: authorityFor(root),
      authorityHome: home,
      verification: '.ai/harness/runs/acceptance.report.json',
      disposition: 'external_pass',
      reviewer: 'Codex',
      source: 'claude-review',
      actor: null,
      summary: 'wrong transport',
      findings: [],
    })).rejects.toThrow('approved reviewer policy');

    const receipt = await recordFixtureAcceptance({
      root, authority: authorityFor(root),
      authorityHome: home,
      verification: '.ai/harness/runs/acceptance.report.json',
      disposition: 'external_pass',
      reviewer: 'Codex',
      source: 'generic-review',
      actor: null,
      summary: 'Codex review passed',
      findings: [],
    });
    expect(receipt).toMatchObject({ reviewer: 'Codex', source: 'generic-review', expected_reviewer: 'Codex' });
    expect((await verifyAcceptance({ root, authority: authorityFor(root), authorityHome: home })).source).toBe('generic-review');
    writeFileSync(acceptanceReceiptPath(root,home),JSON.stringify({...receipt,source:'codex-plugin'}));
    await expect(verifyAcceptance({root, authority: authorityFor(root),authorityHome:home})).rejects.toThrow('source is invalid');
  }, 30_000);

  test('review projections preserve semantic subject but require fresh full-tree execution', async () => {
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
    await expect(verifyAcceptance({ root, authority: authorityFor(root), authorityHome: home })).rejects.toThrow('verification evidence is stale');

    writeFileSync(join(root, 'feature.txt'), 'semantic change\n');
    await expect(verifyAcceptance({ root, authority: authorityFor(root), authorityHome: home })).rejects.toThrow('semantic subject is stale');
  }, 30_000);

  test('projection overwrites review-binding headers from the receipt for every disposition', async () => {
    const { root, home } = makeFixture();
    const receipt = await externalPass(root, home);
    const reviewPath = join(root, 'tasks', 'reviews', 'demo.review.md');
    const header = (status: string, recommendation: string, subject: string, target: string): string => [
      '# Task Review: demo',
      '',
      `> **Status**: ${status}`,
      '> **Contract**: tasks/contracts/demo.contract.md',
      `> **Recommendation**: ${recommendation}`,
      '> **Review Rubric Version**: 2',
      `> **Reviewed Subject SHA256**: ${subject}`,
      '> **Reviewed Subject Scope**: normalized-final-content',
      `> **Reviewed Target Revision**: ${target}`,
      '',
      '## Human Review Card',
      '',
      '- Verdict: pending',
      '',
    ].join('\n');

    writeFileSync(reviewPath, header('Pending', 'fail', 'pending', 'pending'));
    projectAcceptance(reviewPath, receipt);
    const synced = readFileSync(reviewPath, 'utf-8');
    expect(synced).toContain('> **Status**: Accepted');
    expect(synced).toContain('> **Recommendation**: pass');
    expect(synced).toContain(`> **Reviewed Subject SHA256**: ${receipt.subject_sha256}`);
    expect(synced).toContain(`> **Reviewed Target Revision**: ${receipt.target_revision}`);
    expect(synced).not.toMatch(/^> \*\*Reviewed (?:Subject SHA256|Target Revision)\*\*: pending$/m);

    // The projected receipt section and the synced header now agree field by field.
    const headerBlock = synced.slice(0, synced.indexOf('## Human Review Card'));
    const projectionBlock = synced.slice(synced.indexOf('## Acceptance Receipt Projection'));
    for (const field of ['Reviewed Subject SHA256', 'Reviewed Subject Scope', 'Reviewed Target Revision']) {
      const read = (text: string): string | undefined =>
        text.match(new RegExp(`^> \\*\\*${field}\\*\\*: (.+)$`, 'm'))?.[1];
      expect(read(headerBlock)).toBe(read(projectionBlock));
    }

    projectAcceptance(reviewPath, receipt);
    const reprojected = readFileSync(reviewPath, 'utf-8');
    expect(reprojected.slice(0, reprojected.indexOf('## Human Review Card'))).toBe(headerBlock);

    // An authored value that disagrees with the receipt is stale, not a second
    // opinion: the receipt owns all four fields and overwrites them.
    writeFileSync(reviewPath, header('Reviewed', 'pass', 'sha256:authored', 'authored-rev'));
    projectAcceptance(reviewPath, receipt);
    const overwritten = readFileSync(reviewPath, 'utf-8');
    expect(overwritten).toContain('> **Status**: Accepted');
    expect(overwritten).toContain(`> **Reviewed Subject SHA256**: ${receipt.subject_sha256}`);
    expect(overwritten).toContain(`> **Reviewed Target Revision**: ${receipt.target_revision}`);
    expect(overwritten).not.toContain('sha256:authored');
    expect(overwritten).not.toContain('authored-rev');

    // `projectAcceptance` is a pure projection of the receipt it is handed, so
    // varying the disposition alone is enough to pin the Status/Recommendation
    // mapping for all three.
    for (const [disposition, status, recommendation] of [
      ['external_pass', 'Accepted', 'pass'],
      ['user_waiver', 'Accepted', 'pass'],
      ['reject', 'Pending', 'fail'],
    ] as const) {
      writeFileSync(reviewPath, header('Reviewed', 'pass', 'sha256:authored', 'authored-rev'));
      projectAcceptance(reviewPath, { ...receipt, disposition });
      const projected = readFileSync(reviewPath, 'utf-8');
      expect(projected).toContain(`> **Status**: ${status}`);
      expect(projected).toContain(`> **Recommendation**: ${recommendation}`);
      expect(projected).toContain(`> **Reviewed Subject SHA256**: ${receipt.subject_sha256}`);
      expect(projected).toContain(`> **Reviewed Target Revision**: ${receipt.target_revision}`);
    }
  }, 30_000);

  test('rejects a self-consistent forged Change Assessment and invalidates a receipt when a disagreement overlay changes canonical evidence', async () => {
    const { root, home } = makeFixture();
    const subject = buildReviewSubject(root, { targetRef: 'main' });
    expect(subject.status).toBe('ok');
    const forgedAssessment = assessChange({
      subject,
      workflowProfile: 'high',
      strictCategories: [],
      patternNoveltyPaths: [],
      declaredOracles: [],
    });
    if (forgedAssessment.status !== 'ready') throw new Error('fixture forged assessment must be ready');
    const actual = JSON.parse(readFileSync(join(root, '.ai/harness/checks/change-assessment.latest.json'), 'utf8')).assessment;
    expect(forgedAssessment.assessment_sha256).not.toBe(actual.assessment_sha256);
    replaceChangeAssessment(root, changeAssessmentEnvelope(forgedAssessment, buildReviewSelectionPacket(forgedAssessment)));
    await expect(externalPass(root, home)).rejects.toThrow('does not match current base assessment');

    writePassingChecks(root);
    const baseReceipt = await externalPass(root, home);
    const checks = JSON.parse(readFileSync(join(root, '.ai/harness/checks/change-assessment.latest.json'), 'utf-8')) as {
      assessment: unknown; selection_packet: Parameters<typeof applyReviewerDisagreement>[0];
    };
    const overlay = applyReviewerDisagreement(checks.selection_packet, {
      review_subject_sha256: subject.review_subject_sha256,
      target_revision: subject.target_rev,
      paths: ['feature.txt'],
      summary: 'independent reviewer requires targeted human review',
    });
    replaceChangeAssessment(root, changeAssessmentEnvelope(checks.assessment, overlay));
    await expect(verifyAcceptance({ root, authority: authorityFor(root), authorityHome: home })).rejects.toThrow('verification evidence is stale');
    const overlayReceipt = await externalPass(root, home);
    expect(overlayReceipt.verification_evidence_sha256).not.toBe(baseReceipt.verification_evidence_sha256);
    expect((await verifyAcceptance({ root, authority: authorityFor(root), authorityHome: home })).verification_evidence_sha256)
      .toBe(overlayReceipt.verification_evidence_sha256);
  }, 30_000);

  test('typed user waiver stays distinct from external pass and obeys the approved policy', async () => {
    const allowed = makeFixture('allowed');
    expect(() => recordFixtureUserWaiverGrant({ root: allowed.root, authorityHome: allowed.home, authority: authorityFor(allowed.root),
      actor: 'unapproved-actor', summary: 'attempted waiver' })).toThrow('approved actor');
    const grant = recordFixtureUserWaiverGrant({
      root: allowed.root, authority: authorityFor(allowed.root),
      authorityHome: allowed.home,
      actor: 'kito',
      summary: 'owner accepted the bounded contract risk',
    });
    const receipt = await recordUserWaiverAcceptance({
      root: allowed.root, authority: authorityFor(allowed.root),
      authorityHome: allowed.home,
      verification: '.ai/harness/runs/acceptance.report.json',
    });
    expect(grant.scope).toBe('admission-authority');
    expect(receipt.disposition).toBe('user_waiver');
    expect(receipt.protocol).toBe(3);
    expect(receipt.waiver_grant_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect((await verifyAcceptance({ root: allowed.root, authority: authorityFor(allowed.root), authorityHome: allowed.home })).disposition).not.toBe('external_pass');
    await expect(recordFixtureAcceptance({
      root: allowed.root, authority: authorityFor(allowed.root),
      authorityHome: allowed.home,
      verification: '.ai/harness/runs/acceptance.report.json',
      disposition: 'user_waiver',
      reviewer: 'User',
      source: 'user-waiver',
      actor: 'kito',
      summary: 'direct fallback attempt',
      findings: [],
    })).rejects.toThrow('must be materialized from a valid UserWaiverGrant');

    const forbidden = makeFixture('forbidden');
    expect(() => recordFixtureUserWaiverGrant({
      root: forbidden.root, authority: authorityFor(forbidden.root),
      authorityHome: forbidden.home,
      actor: 'kito',
      summary: 'attempted waiver',
    })).toThrow('forbids user waiver');
  }, 30_000);

  test('reuses one owner grant after semantic correction while every receipt stays exact', async () => {
    const { root, home } = makeFixture();
    const grant = recordFixtureUserWaiverGrant({
      root, authority: authorityFor(root),
      authorityHome: home,
      actor: 'kito',
      summary: 'one bounded owner decision',
    });
    const first = await recordUserWaiverAcceptance({
      root, authority: authorityFor(root),
      authorityHome: home,
      verification: '.ai/harness/runs/acceptance.report.json',
    });

    writeFileSync(join(root, 'feature.txt'), 'corrective semantic change\n');
    await expect(verifyAcceptance({ root, authority: authorityFor(root), authorityHome: home })).rejects.toThrow('semantic subject is stale');
    await expect(recordUserWaiverAcceptance({
      root, authority: authorityFor(root),
      authorityHome: home,
      verification: '.ai/harness/runs/acceptance.report.json',
    })).rejects.toThrow('verification evidence is stale');

    writePassingChecks(root);
    const second = await recordUserWaiverAcceptance({
      root, authority: authorityFor(root),
      authorityHome: home,
      verification: '.ai/harness/runs/acceptance.report.json',
    });
    expect(second.subject_sha256).not.toBe(first.subject_sha256);
    expect(second.waiver_grant_sha256).toBe(first.waiver_grant_sha256);
    expect((verifyUserWaiverGrant({ root, authority: authorityFor(root), authorityHome: home }))).toEqual(grant);
    expect((await verifyAcceptance({ root, authority: authorityFor(root), authorityHome: home })).subject_sha256).toBe(second.subject_sha256);
  }, 30_000);

  test('replaced admission or changed issue goal invalidates the separate waiver grant', () => {
    const changed = makeFixture();
    recordFixtureUserWaiverGrant({ root: changed.root, authorityHome: changed.home, authority: authorityFor(changed.root), actor: 'kito', summary: 'bounded decision' });
    approveFixture(changed.root, changed.home, { allowedPaths: ['feature.txt'] });
    expect(() => verifyUserWaiverGrant({ root: changed.root, authorityHome: changed.home, authority: authorityFor(changed.root) })).toThrow('authority is stale');
    const goalChanged = makeFixture();
    recordFixtureUserWaiverGrant({ root: goalChanged.root, authorityHome: goalChanged.home, authority: authorityFor(goalChanged.root), actor: 'kito', summary: 'bounded decision' });
    admissions.get(goalChanged.root)!.issue.body = 'Changed approved goal';
    expect(() => verifyUserWaiverGrant({ root: goalChanged.root, authorityHome: goalChanged.home, authority: authorityFor(goalChanged.root) })).toThrow('goal_or_actor_changed');
  }, 30_000);

  test('revocation invalidates a user-waiver receipt and external pass never binds a grant', async () => {
    const waived = makeFixture();
    recordFixtureUserWaiverGrant({
      root: waived.root, authority: authorityFor(waived.root),
      authorityHome: waived.home,
      actor: 'kito',
      summary: 'revocable decision',
    });
    await recordUserWaiverAcceptance({
      root: waived.root, authority: authorityFor(waived.root),
      authorityHome: waived.home,
      verification: '.ai/harness/runs/acceptance.report.json',
    });
    revokeUserWaiverGrant({ root: waived.root, authorityHome: waived.home });
    await expect(verifyAcceptance({ root: waived.root, authority: authorityFor(waived.root), authorityHome: waived.home })).rejects.toThrow('UserWaiverGrant is missing');

    const external = makeFixture();
    const externalReceipt = await externalPass(external.root, external.home);
    expect(externalReceipt.waiver_grant_sha256).toBeNull();
  }, 30_000);

  test('archived authoring text cannot replace a revoked protected approval', async () => {
    const { root, home } = makeFixture();
    await externalPass(root, home);
    const fixture = admissions.get(root)!;
    mkdirSync(join(root, 'tasks/archive'), { recursive: true });
    writeFileSync(join(root, 'tasks/archive/demo.md'), readFileSync(join(root, 'tasks/contracts/demo.contract.md')));
    writeFileSync(join(fixture.directory, 'active.json'), JSON.stringify({ protocol: 1, revision: 2, grant_sha256: null }), { mode: 0o600 });
    await expect(verifyAcceptance({ root, authorityHome: home, authority: authorityFor(root) })).rejects.toThrow('revoked_or_replaced');
  }, 30_000);

  test('historical acceptance stays bound to its recorded target through unrelated and overlapping target movement', async () => {
    const { root, home } = makeFixture();
    await externalPass(root, home);
    git(root, 'checkout', 'main');
    writeFileSync(join(root, 'other.txt'), 'unrelated target change\n');
    commit(root, 'advance target without overlap');
    git(root, 'checkout', 'codex/demo');
    expect((await verifyAcceptance({ root, authority: authorityFor(root), authorityHome: home })).disposition).toBe('external_pass');

    git(root, 'checkout', 'main');
    writeFileSync(join(root, 'feature.txt'), 'target overlap\n');
    commit(root, 'advance target with overlap');
    git(root, 'checkout', 'codex/demo');
    expect((await verifyAcceptance({ root, authority: authorityFor(root), authorityHome: home })).disposition).toBe('external_pass');
  }, 30_000);



});


// Domain integration reuses this file's real acceptanceContext/Verification Plan fixture.
// Only provider/task-agent effects are deterministic; this is a fixture opinion, not model evidence.
function reviewFixture() {
  const fixture = makeFixture();
  const endpointHome = realpathSync(mkdtempSync('/tmp/as-')); tempDirs.push(endpointHome);
  mkdirSync(join(endpointHome, '.codex'));
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+86400 })).toString('base64url');
  writeFileSync(join(endpointHome,'.codex','auth.json'),JSON.stringify({tokens:{access_token:`fixture.${payload}.fixture`}}),{mode:0o600});
  writeFileSync(join(fixture.root, '.gitignore'), '.ai/harness/checks/\n.ai/harness/runs/\n.ai/harness/evidence/\n');

  const reviewerRepo = join(fixture.home, 'reviewer');
  git(fixture.root, 'worktree', 'add', '-qb', 'fixture-reviewer', reviewerRepo);
  writePassingChecks(fixture.root);
  const calls: string[] = [];
  let request: TaskRequest; let domain: Record<string, unknown>; let sent = 0;
  let verdict: 'PASS' | 'FAIL' = 'FAIL'; let prior = false;
  const effects: ReviewEffects = {
    owner: () => 'codex', installation: async (_kind, executable) => ({ kind: 'available', via: 'executable', command: executable ?? '/usr/bin/true' }), model: () => 'fixture-model', assertBinding: () => {}, ready: async () => {}, dispose: async () => { calls.push('dispose'); },
    start: async (repo, spec, _command, _ready, _guard, authority) => {
      calls.push(`start:${spec.harness_kind}:${spec.role}`);
      if (!authority) throw new Error('fixture_task_authority_missing');
      return startOfflineTaskAgent(repo, spec, authority);
    },
    // Domain fixture: native host attribution is injected, with no host-ready file
    // or live native-session claim. Native binding has its own strict lifecycle tests.
    bindNative: ({ binding }) => {
      expect(binding.task_admission).toBeDefined();
      expect(binding.harness_kind === 'claude' || binding.harness_kind === 'codex').toBe(true);
      return { protocol: 1, kind: 'repo-harness-native-task-session',
        host: binding.harness_kind as 'claude' | 'codex', native_session_id: 'fixture-native-session',
        task: binding.task, role: binding.role,
        session_binding_sha256: `sha256:${createHash('sha256').update(canonicalize(JSON.parse(JSON.stringify(binding)))).digest('hex')}`,
        provider: { pid: binding.provider.pid, identity: binding.provider.identity } };
    },
    send: async (repo, task, role, ref) => {
      sent++; calls.push('send');
      const packet = readFileSync(join(repo, ref), 'utf8');
      domain = JSON.parse(packet.match(/^DOMAIN IDENTITY: (.*)$/m)![1]!);
      request = { protocol: 2, task, role, round: sent, request_id: `fixture-request-${sent}`, context_sha256: authorityFingerprint(packet),
        context_ref: ref, source_ref: ref, result_ref: join(repo, `.ai/harness/runs/task-agent-outbox/${importedTaskDir(repo, task, role).split('/').pop()}/result-${sent}.json`),
        result_contract: { required_fields: ['request_id','context_sha256','value'], atomic_write: 'temp_rename' } };
      writeFileSync(join(reviewLocation(fixture.root, authorityFor(fixture.root)).dir, `observed-${sent}.json`), JSON.stringify({ fixture: true }));
      return request;
    },
    collect: async () => {
      calls.push('collect');
      return { request_id: request.request_id, context_sha256: request.context_sha256,
        value: { request_id: request.request_id, context_sha256: domain.context_sha256, subject_sha256: domain.subject_sha256,
          verdict, summary: '[fixture opinion] review current subject', findings: [{ id: 'fence', severity: 'P1', status: verdict === 'PASS' ? 'resolved' : prior ? 'open' : 'new', message: '[fixture opinion] fence evidence' }] } };
    },
    close: async () => { calls.push('close'); return { status: 'closed', pids: [] }; },
    cancel: async () => { calls.push('cancel'); return { status: 'closed', pids: [] }; },
  };
  const options = { repoRoot: fixture.root, authority: authorityFor(fixture.root), verification: '.ai/harness/runs/acceptance.report.json', reviewerRepo,
    endpoint: { session: 'private-fixture', home: endpointHome }, parentPane: 'fixture-owner-pane', authorityHome: fixture.home,
    taskClaim: { reference: 'https://github.com/acme/widgets/issues/903#issuecomment-1', revision: 'sha256:' + 'c'.repeat(64) }, admitSession: () => { calls.push('admit'); } };
  return { ...fixture, reviewerRepo, calls, effects, options, sent: () => sent,
    verdict: (next: 'PASS' | 'FAIL') => { verdict = next; prior = true; } };
}

/** Effects for a delivered request whose host has not observed a finished turn. */
function pendingTurnEffects(f: ReturnType<typeof reviewFixture>, collect: ReviewEffects['collect']): ReviewEffects {
  return { ...f.effects, collect, send: async (...args) => {
    const request = await f.effects.send!(...args);
    rmSync(join(reviewLocation(f.root, f.options.authority).dir, `observed-${request.round}.json`));
    return request;
  } };
}

darwinTest('generic orchestration collects domain Results, keeps one reviewer for three rounds and verifies close', async () => {
  const f = reviewFixture();
  expect(reviewLocation(f.root, f.options.authority).dir).toBe(reviewLocation(f.reviewerRepo, f.options.authority).dir);
  const trackedReview = readFileSync(join(f.root, 'tasks/reviews/demo.review.md'), 'utf8');
  const first = await runReviewRound(f.options, f.effects);
  expect(first.projection).toContain('.ai/harness/runs/generic-review/');
  expect(readFileSync(first.projection, 'utf8')).toContain('Acceptance Receipt Projection');
  expect(readFileSync(join(f.root, 'tasks/reviews/demo.review.md'), 'utf8')).toBe(trackedReview);
  expect(first.status).toBe('rejected');
  await expect(closeReview(f.root, f.options.authority, false, f.home, f.effects)).rejects.toThrow('disposition is reject');
  const campaignDirectory = reviewLocation(f.root, f.options.authority).dir;
  approveFixture(f.root, f.home);
  f.options.authority = authorityFor(f.root);
  expect(reviewLocation(f.root, f.options.authority).dir).toBe(campaignDirectory);
  for (const number of [2, 3]) {
    writeFileSync(join(f.root, 'feature.txt'), `candidate repair ${number}\n`);
    writePassingChecks(f.root);
    f.verdict(number === 3 ? 'PASS' : 'FAIL');
    const result = await runReviewRound({ ...f.options, endpoint: { home: f.options.endpoint.home, session: 'private-fixture' } }, f.effects);
    expect(result.round).toBe(number);
  }
  expect(f.sent()).toBe(3);
  expect(f.calls.filter(call => call === 'admit')).toHaveLength(1);
  expect(f.calls.filter(call => call.startsWith('start:'))).toEqual(Array(3).fill('start:claude:deep-reasoner'));
  const receipt = await verifyAcceptance({ root: f.root, authority: authorityFor(f.root), authorityHome: f.home });
  expect(receipt.actual_model).toBe('fixture-model');
  expect(receipt.source).toBe('generic-review');
  const path = acceptanceReceiptPath(f.root, f.home), bytes = readFileSync(path, 'utf8');
  writeFileSync(path, JSON.stringify({ ...receipt, actual_model: 'tampered' }));
  await expect(closeReview(f.root, f.options.authority, false, f.home, f.effects)).rejects.toThrow('actual_model mismatch');
  expect(f.calls).not.toContain('close');
  writeFileSync(path, bytes);
  writeFileSync(join(f.root, 'feature.txt'), 'fourth repair\n'); writePassingChecks(f.root);
  await expect(runReviewRound(f.options, f.effects)).rejects.toThrow('round_budget_exhausted');
  // Restore the exact accepted semantic bytes before close.
  writeFileSync(join(f.root, 'feature.txt'), 'candidate repair 3\n'); writePassingChecks(f.root);
  expect((await closeReview(f.root, f.options.authority, false, f.home, f.effects)).status).toBe('closed');
  expect(f.calls).toContain('close');
});

darwinTest('generic review allows explicit same-harness and only preflight-missing fallback; pending launch never replays', async () => {
  const f = reviewFixture(); f.verdict('PASS');
  const result = await runReviewRound({ ...f.options, harness: 'codex' }, f.effects);
  expect(result.actual_harness).toBe('codex'); expect(result.fallback_reason).toBeNull();
  expect(result.receipt.expected_reviewer).toBe('Claude'); expect(result.receipt.reviewer).toBe('Codex');
  expect((await verifyAcceptance({ root: f.root, authority: authorityFor(f.root), authorityHome: f.home })).actual_harness).toBe('codex');
  await closeReview(f.root, f.options.authority, true, f.home, f.effects);
  const fallback = reviewFixture(); fallback.verdict('PASS');
  const accepted = await runReviewRound(fallback.options, { ...fallback.effects, installation: async (kind, executable) => kind === 'codex' ? { kind: 'available', via: 'executable', command: executable ?? '/usr/bin/true' } : { kind: 'not_found' } });
  expect(accepted.requested_harness).toBe('claude'); expect(accepted.actual_harness).toBe('codex');
  expect(accepted.fallback_reason).toContain('missing before start');
  const failed = reviewFixture(); let starts = 0;
  const effects = { ...failed.effects, start: async () => { starts++; throw new Error('task_agent_ambiguous_launch'); } };
  await expect(runReviewRound(failed.options, effects)).rejects.toThrow('ambiguous_launch');
  await expect(runReviewRound(failed.options, { ...effects, installation: async () => ({ kind: 'not_found' }) })).rejects.toThrow('ambiguous_launch');
  // start is the existing task-agent reconciliation entry, never a fallback or alternate harness.
  expect(starts).toBe(2); expect(failed.sent()).toBe(0);
  expect(failed.calls).not.toContain('start:codex:deep-reasoner');
  expect((await closeReview(failed.root, failed.options.authority, true, failed.home, effects)).status).toBe('closed');
});

darwinTest('generic review unknown owner, explicit missing provider and timeout fail closed without history acceptance', async () => {
  const f = reviewFixture();
  await expect(runReviewRound(f.options, { ...f.effects, owner: () => null })).rejects.toThrow('owner_unknown');
  expect(f.sent()).toBe(0);
  await expect(runReviewRound({ ...f.options, harness: 'claude' }, { ...f.effects, installation: async () => ({ kind: 'not_found' }) })).rejects.toThrow('executable_missing');
  // The fixture host has observed the turn, and no Result exists.
  await expect(runReviewRound({ ...f.options, timeoutMs: 1 }, { ...f.effects, collect: async () => null })).rejects.toThrow('review_result_missing');
  const { dir } = reviewLocation(f.root, f.options.authority);
  expect(readSessionArtifact(join(dir, 'request-1.json'))).toBeDefined();
  await expect(runReviewRound(f.options, f.effects)).rejects.toThrow('ambiguous_round');
  expect(f.sent()).toBe(1);
  expect((await closeReview(f.root, f.options.authority, true, f.home, f.effects)).status).toBe('closed');
  // No observed turn: the round waits and ends at the deadline.
  const pending = reviewFixture();
  await expect(runReviewRound({ ...pending.options, timeoutMs: 1 }, pendingTurnEffects(pending, async () => null))).rejects.toThrow('review_round_timeout');
  expect(readSessionArtifact(join(reviewLocation(pending.root, pending.options.authority).dir, 'request-1.json'))).toBeDefined();
  await expect(runReviewRound(pending.options, pending.effects)).rejects.toThrow('ambiguous_round');
  expect(pending.sent()).toBe(1);
  expect((await closeReview(pending.root, pending.options.authority, true, pending.home, pending.effects)).status).toBe('closed');
});

darwinTest('generic review checks the reviewer binding at most once per second while a turn is pending', async () => {
  const f = reviewFixture();
  const { dir } = reviewLocation(f.root, f.options.authority);
  let checks = 0;
  const pending = pendingTurnEffects(f, async () => null);
  await expect(runReviewRound({ ...f.options, timeoutMs: 1500 }, { ...pending,
    assertBinding: () => { if (existsSync(join(dir, 'delivery-1.json'))) checks++; } })).rejects.toThrow('review_round_timeout');
  // The loop sleeps 100 ms per pass, so a per-pass check would make about 15 calls.
  expect(checks).toBeGreaterThanOrEqual(1); expect(checks).toBeLessThanOrEqual(3);
});

darwinTest('generic review cancel reaches an active round at the lock boundary and records no acceptance', async () => {
  const f = reviewFixture(); f.verdict('PASS');
  const { dir } = reviewLocation(f.root, f.options.authority);
  let collecting!: () => void;
  const inCollectLoop = new Promise<void>(resolve => { collecting = resolve; });
  // The delivered request stays pending: the host has not observed a turn and no Result arrives before cancel.
  // The first binding check after delivery marks the collect loop.
  const pending = pendingTurnEffects(f, async () => null);
  const round = runReviewRound({ ...f.options, timeoutMs: 20_000 }, { ...pending, assertBinding: () => { if (existsSync(join(dir, 'delivery-1.json'))) collecting(); } })
    .then(() => { f.calls.push('round:accepted'); }, (error: unknown) => { f.calls.push(`round:${String(error)}`); });
  await Promise.race([inCollectLoop, round.then(() => { throw new Error(`round settled before collection: ${f.calls.join(', ')}`); })]);
  expect(existsSync(join(dir, 'delivery-1.json'))).toBe(true);
  const cleanup = await closeReview(f.root, f.options.authority, true, f.home, { ...f.effects,
    dispose: async () => { f.calls.push(existsSync(join(dir, 'close.request')) ? 'dispose:requested' : 'dispose:unrequested'); } });
  await round;
  expect(cleanup.status).toBe('closed');
  const ended = f.calls.findIndex(call => call.startsWith('round:'));
  expect(f.calls[ended]).toContain('review_round_cancelled');
  expect(f.calls.slice(ended + 1)).toEqual(['dispose:requested', 'cancel']);
  expect(existsSync(join(dir, 'accepted-1.json'))).toBe(false);
  expect(existsSync(acceptanceReceiptPath(f.root, f.home))).toBe(false);
  expect(readSessionArtifact<{ cancelled: boolean }>(join(dir, 'closed.json')).cancelled).toBe(true);
});

darwinTest('generic review cancel that lands between the final check and the acceptance keeps the receipt and reports it', async () => {
  const f = reviewFixture(); f.verdict('PASS');
  const { dir } = reviewLocation(f.root, f.options.authority);
  // The request is written by the model effect, which runs after the round's
  // final close.request read and before the acceptance is recorded.
  const round = runReviewRound({ ...f.options }, { ...f.effects,
    model: () => { writeSessionArtifact(join(dir, 'close.request'), { close: true }); return 'fixture-model'; } });
  const result = await round;
  expect(result.status).toBe('accepted');
  expect(existsSync(join(dir, 'accepted-1.json'))).toBe(true);
  const cleanup = await closeReview(f.root, f.options.authority, true, f.home, f.effects);
  expect(cleanup).toMatchObject({ status: 'closed', accepted_rounds: [1] });
  expect(readSessionArtifact<{ cancelled: boolean; accepted_rounds: number[] }>(join(dir, 'closed.json'))).toMatchObject({ cancelled: true, accepted_rounds: [1] });
  // A repeated cancel reports the already-closed cleanup without the window field.
  expect(await closeReview(f.root, f.options.authority, true, f.home, f.effects)).toEqual({ status: 'closed', pids: [] });
});


darwinTest('Codex credential copy cleanup follows owner close/cancel/start-failure/timeout and reports refusal', async () => {
  const { existsSync, unlinkSync } = await import('node:fs');
  const copied = (f: ReturnType<typeof reviewFixture>) => {
    const session = readSessionArtifact<{task:string}>(join(reviewLocation(f.root,f.options.authority).dir,'session.json'));
    return join(f.reviewerRepo,'.ai/harness/runs/task-agent-outbox',importedTaskDir(f.reviewerRepo,session.task,'deep-reasoner').split('/').pop()!,'.codex-home','auth.json');
  };
  for (const cancel of [false,true]) {
    const f=reviewFixture();f.verdict('PASS');await runReviewRound({...f.options,harness:'codex'},f.effects);
    expect(existsSync(copied(f))).toBe(true);await closeReview(f.root,f.options.authority,cancel,f.home,f.effects);expect(existsSync(copied(f))).toBe(false);
  }
  const start=reviewFixture();
  await expect(runReviewRound({...start.options,harness:'codex'},{...start.effects,start:async()=>{throw new Error('fixture_start_failure')}})).rejects.toThrow('fixture_start_failure');
  expect(existsSync(copied(start))).toBe(false);
  const missing=reviewFixture();
  await expect(runReviewRound({...missing.options,harness:'codex',timeoutMs:1},{...missing.effects,collect:async()=>null})).rejects.toThrow('review_result_missing');
  expect(existsSync(copied(missing))).toBe(false);
  const timed=reviewFixture();
  await expect(runReviewRound({...timed.options,harness:'codex',timeoutMs:1},pendingTurnEffects(timed,async()=>null))).rejects.toThrow('review_round_timeout');
  expect(existsSync(copied(timed))).toBe(false);
  const refused=reviewFixture();refused.verdict('PASS');await runReviewRound({...refused.options,harness:'codex'},refused.effects);
  unlinkSync(copied(refused));mkdirSync(copied(refused));
  await expect(closeReview(refused.root,refused.options.authority,true,refused.home,refused.effects)).rejects.toThrow('cleanup_pending: review_auth_copy_delete_failed');
});

// Regression: reviewer-authored completion/model evidence must never mint a Receipt.
darwinTest('generic review rejects forged outbox observation before genuine host completion', async () => {
  const f = reviewFixture(); f.verdict('PASS');
  const { model: _model, ...effects } = f.effects;
  const send = effects.send!;
  effects.send = async (...args) => {
    const request = await send(...args);
    rmSync(join(reviewLocation(f.root, f.options.authority).dir, `observed-${request.round}.json`));
    writeFileSync(join(resolve(request.result_ref, '..'), `observed-${request.round}.json`), JSON.stringify({
      request_id: request.request_id, kind: 'ended', outcome: 'completed', actual_model: 'forged-model',
    }));
    return request;
  };
  await expect(runReviewRound({ ...f.options, harness: 'codex', timeoutMs: 50 }, effects)).rejects.toThrow('review_round_timeout');
  const { existsSync } = await import('node:fs');
  expect(existsSync(acceptanceReceiptPath(f.root, f.home))).toBe(false);
});

darwinTest('generic review uses owner host completion and ignores forged outbox model', async () => {
  const f = reviewFixture(); f.verdict('PASS');
  const { model: _model, ...effects } = f.effects;
  const send = effects.send!;
  effects.send = async (...args) => {
    const request = await send(...args);
    const observation = { request_id: request.request_id, kind: 'ended', outcome: 'completed', actual_model: 'fixture-host-model' };
    writeFileSync(join(reviewLocation(f.root, f.options.authority).dir, `observed-${request.round}.json`), JSON.stringify(observation));
    writeFileSync(join(resolve(request.result_ref, '..'), `observed-${request.round}.json`), JSON.stringify({ ...observation, actual_model: 'forged-model' }));
    return request;
  };
  const result = await runReviewRound({ ...f.options, harness: 'codex' }, effects);
  expect(result.status).toBe('accepted');
  expect(result.receipt.actual_model).toBe('fixture-host-model');
  expect((await verifyAcceptance({ root: f.root, authority: authorityFor(f.root), authorityHome: f.home })).actual_model).toBe('fixture-host-model');
});

darwinTest('generic review refuses failed owner turn even with forged completed observation', async () => {
  const f = reviewFixture(); f.verdict('PASS');
  const { model: _model, ...effects } = f.effects;
  const send = effects.send!;
  effects.send = async (...args) => {
    const request = await send(...args);
    const observation = { request_id: request.request_id, kind: 'ended', outcome: 'failed', actual_model: 'fixture-host-model' };
    writeFileSync(join(reviewLocation(f.root, f.options.authority).dir, `observed-${request.round}.json`), JSON.stringify(observation));
    writeFileSync(join(resolve(request.result_ref, '..'), `observed-${request.round}.json`), JSON.stringify({ ...observation, outcome: 'completed', actual_model: 'forged-model' }));
    return request;
  };
  await expect(runReviewRound({ ...f.options, harness: 'codex' }, effects)).rejects.toThrow('review_host_turn_unverified');
  const { existsSync } = await import('node:fs');
  expect(existsSync(acceptanceReceiptPath(f.root, f.home))).toBe(false);
});

test('tampered empty and missing approved plans refuse external and waiver acceptance without publishing proof', async () => {
  for (const kind of ['empty_plan', 'missing_plan']) {
    const { root, home } = makeFixture();
    recordFixtureUserWaiverGrant({ root, authorityHome: home, authority: authorityFor(root), actor: 'kito', summary: 'Waiver still requires execution proof.' });
    const fixture = admissions.get(root)!;
    const path = join(fixture.directory, fixture.grant.slice(7) + '.json');
    const protectedRecord = JSON.parse(readFileSync(path, 'utf8'));
    if (kind === 'empty_plan') protectedRecord.admission.verification_plan.checks = [];
    else delete protectedRecord.admission.verification_plan;
    writeFileSync(path, JSON.stringify(protectedRecord), { mode: 0o600 });
    await expect(externalPass(root, home)).rejects.toThrow('grant_digest');
    await expect(recordUserWaiverAcceptance({ root, authorityHome: home, authority: authorityFor(root), verification: '.ai/harness/runs/acceptance.report.json' })).rejects.toThrow('grant_digest');
    expect(existsSync(acceptanceReceiptPath(root, home))).toBe(false);
    expect(existsSync(acceptanceVerificationObservationPath(root, home, fixture.admission.campaign_sha256, fixture.admission.admission_sha256))).toBe(false);
  }
}, 30000);

test('semantic admission retains scope and required benchmark refusal', async () => {
  for (const change of ['scope', 'benchmark']) {
    const { root, home } = makeFixture();
    approveFixture(root, home, change === 'scope' ? { allowedPaths: ['outside.txt', 'plans/', 'tasks/'] } : { benchmark: 'required' });
    writePassingChecks(root);
    await expect(externalPass(root, home)).rejects.toThrow(change === 'scope' ? 'Allowed Paths refuse reviewed path: feature.txt' : 'required benchmark report is missing');
    expect(existsSync(acceptanceReceiptPath(root, home))).toBe(false);
  }
}, 30000);

test('synchronous binding inspection rejects missing observations and revoked waivers', async () => {
  const { root, home } = makeFixture();
  recordFixtureUserWaiverGrant({ root, authority: authorityFor(root), authorityHome: home, actor: 'kito', summary: 'Bound waiver.' });
  const receipt = await recordUserWaiverAcceptance({ root, authority: authorityFor(root), authorityHome: home, verification: '.ai/harness/runs/acceptance.report.json' });
  const subject = buildReviewSubject(root, { targetRef: 'main' });
  const report = evaluateAdmittedVerification({ repoRoot: root, authority: authorityFor(root) });
  const evidence = inspectAcceptanceEvidence({ root, authority: authorityFor(root), report: materializeVerificationExecutionReport(report), subject, current: true });
  const args = { root, authority: authorityFor(root), authorityHome: home, subject, evidence };
  expect(inspectAcceptanceCurrentBinding(args)).toEqual(receipt);
  const observation = acceptanceVerificationObservationPath(root, home, receipt.campaign_sha256, receipt.admission_sha256);
  const bytes = readFileSync(observation);
  rmSync(observation);
  expect(() => inspectAcceptanceCurrentBinding(args)).toThrow('Observation is missing or stale');
  writeFileSync(observation, bytes);
  revokeUserWaiverGrant({ root, authorityHome: home });
  expect(() => inspectAcceptanceCurrentBinding(args)).toThrow('UserWaiverGrant');
}, 30000);

test('native report selection refuses retired, absolute, traversing and symlink inputs', async () => {
  const { root, home } = makeFixture();
  for (const verification of [
    '.ai/harness/checks/latest.json', join(root, '.ai/harness/runs/acceptance.report.json'),
    '.ai/harness/runs/../runs/acceptance.report.json', '.ai/harness/runs/sub\\report.json',
  ]) {
    await expect(acceptanceContext({ root, authority: authorityFor(root), verification })).rejects.toThrow('verification_file is unsafe');
  }
  const { symlinkSync } = await import('fs');
  symlinkSync(join(root, '.ai/harness/runs/acceptance.report.json'), join(root, '.ai/harness/runs/link.report.json'));
  await expect(acceptanceContext({ root, authority: authorityFor(root), verification: '.ai/harness/runs/link.report.json' })).rejects.toThrow('non-symlink');
  expect(existsSync(acceptanceReceiptPath(root, home))).toBe(false);
});

test('benchmark applicability refuses inline overwrite and anchored scalar forms', () => {
  const fence = String.fromCharCode(96).repeat(3);
  for (const declaration of [
    'evidence_requirements: {benchmark: required, benchmark: not_applicable}',
    'evidence_requirements: {benchmark: not_applicable}',
    'evidence_requirements:\n  benchmark: &value required',
  ]) expect(() => acceptanceBenchmarkRequirement(fence + 'yaml\n' + declaration + '\n' + fence + '\n')).toThrow();
});


test('external acceptance and current inspection survive HEAD-only provenance changes', async () => {
  const { root, home } = makeFixture();
  const receipt = await externalPass(root, home);
  const oldHead = git(root, 'rev-parse', 'HEAD');
  git(root, 'commit', '--allow-empty', '-m', 'provenance only');
  expect(git(root, 'rev-parse', 'HEAD')).not.toBe(oldHead);
  expect(await verifyAcceptance({ root, authority: authorityFor(root), authorityHome: home })).toEqual(receipt);
  const context = await acceptanceContext({ root, authority: authorityFor(root), verification: receipt.verification_file });
  const report = evaluateAdmittedVerification({ repoRoot: root, authority: authorityFor(root) });
  const evidence = inspectAcceptanceEvidence({ root, authority: authorityFor(root), report: materializeVerificationExecutionReport(report), subject: context.subject, current: true });
  expect(evidence.fingerprint).toBe(receipt.verification_evidence_sha256);
  expect(inspectAcceptanceCurrentBinding({ root, authority: authorityFor(root), authorityHome: home, subject: context.subject, evidence })).toEqual(receipt);
});
