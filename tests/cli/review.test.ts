import { afterEach, expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildReviewCommand } from '../../src/cli/commands/review';
import { createReviewAdmission, reviewCampaignKey, type ReviewAdmissionInput } from '../../src/core/review/authority-context';
import { readCurrentReviewAdmissionSelection, readReviewAdmission } from '../../src/effects/admission/admission-store';
import { gatesDirectoryName } from '../../src/effects/git/repository-identity';
import * as accountHome from '../../src/effects/runtime/os-account-home';
import { hashVerificationPlan } from '../../src/core/evidence/verification-plan';
import { controlApprovalFixture } from '../helpers/control-approval-fixture';
import { initGitRepo, tmpWorkspace } from '../helpers/repo-fixture';
import { HEAD as PUBLISH_HEAD, PR as PUBLISH_PR, installFakeGh, passingScenario } from '../helpers/publication-merge-fake-gh';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const hash = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;

function fixture() {
  const root = tmpWorkspace('review-cli-repo'), home = tmpWorkspace('review-cli-home'); roots.push(root, home); initGitRepo(root);
  const input: ReviewAdmissionInput = { issue_number: 903, execution_mode: 'contract', repository_id: 'R_provider', issue_id: 'I_903',
    campaign_id: 'review', actor_id: 'U_owner', goal: { revision: 'goal-1', content: 'Preserve feedback and acceptance.' }, oracles: [],
    policy: { reviewer: 'Codex', user_waiver: 'forbidden', policy_sha256: hash('policy') }, allowed_paths: ['src/**'], benchmark: 'not_required',
    verification_plan: { protocol: 1, checks: [{ id: 'behavior', kind: 'command', command: 'true', cwd: '.', phase: 'verification',
      cost: 'normal', evidence_policy: 'current_exact', necessity: 'Check the feature.', inputs: { env: [] } }] } };
  const admission = createReviewAdmission(input);
  const identity = { repository_id: input.repository_id, issue_id: input.issue_id, campaign_id: input.campaign_id };
  const active = join(home, '.repo-harness', 'gates', gatesDirectoryName(root), 'review-admissions', reviewCampaignKey(identity).slice(7), 'active.json');
  const request = (name: string, body: unknown) => { const file = join(root, `${name}.json`); writeFileSync(file, JSON.stringify(body)); return file; };
  const read = (grant: string) => readReviewAdmission({ repoRoot: root, authorityHome: home, ...identity, expectedGrantSha256: grant,
    expectedPolicySha256: input.policy.policy_sha256, expectedActor: input.actor_id, expectedGoal: input.goal,
    round: { subject: { status: 'ok', scope: 'normalized-final-content', target_ref: 'main', target_rev: '1'.repeat(40), head_rev: '2'.repeat(40),
      review_subject_sha256: hash('content') }, verification: { plan_sha256: hashVerificationPlan(input.verification_plan),
      source_sha256: hash('source'), evidence_sha256: hash('report'), tree_sha256: hash('tree') } } });
  return { root, home, input, admission, identity, active, request, read };
}

async function runReview(home: string, args: readonly string[]) {
  // Only the account home is redirected; the command still uses the real store, locks and CAS.
  const homeSpy = spyOn(accountHome, 'osAccountHome').mockReturnValue(home);
  const exitCode = process.exitCode;
  let stdout = '', stderr = '';
  const out = spyOn(console, 'log').mockImplementation((value: unknown) => { stdout += `${String(value)}\n`; });
  const err = spyOn(console, 'error').mockImplementation((value: unknown) => { stderr += `${String(value)}\n`; });
  try {
    process.exitCode = 0;
    await buildReviewCommand().parseAsync([...args], { from: 'user' });
    return { status: Number(process.exitCode ?? 0), stdout, stderr };
  } finally {
    homeSpy.mockRestore(); out.mockRestore(); err.mockRestore(); process.exitCode = exitCode;
  }
}

test('review revoke applies an exact active-grant CAS and task consumers observe the revocation', async () => {
  const f = fixture();
  const admitted = await runReview(f.home, ['admit', '--repo', f.root, '--request', f.request('admit', {
    admission: f.input, approval: controlApprovalFixture(f.root, f.admission, 0), expectedRevision: 0 })]);
  expect(admitted.status, admitted.stderr).toBe(0);
  const grant = JSON.parse(admitted.stdout).grant_sha256 as string;
  expect(f.read(grant).revision).toBe(1);
  const revoke = (name: string, changes: Record<string, unknown>) => runReview(f.home, ['revoke', '--repo', f.root, '--request',
    f.request(name, { ...f.identity, expectedGrantSha256: grant, expectedRevision: 1, ...changes })]);

  const before = readFileSync(f.active, 'utf8');
  const stale = await revoke('stale-grant', { expectedGrantSha256: hash('stale grant') });
  expect(stale.status).toBe(1);
  expect(stale.stderr).toContain('review revoke: review_admission_revoked_or_replaced');
  const staleRevision = await revoke('stale-revision', { expectedRevision: 0 });
  expect(staleRevision.status).toBe(1);
  expect(staleRevision.stderr).toContain('review_admission_revision_changed');
  const unknown = await revoke('unknown', { campaign_id: 'unknown-campaign' });
  expect(unknown.status).toBe(1);
  expect(unknown.stderr).toContain('review_admission_missing');
  const extra = await revoke('extra-field', { approval: {} });
  expect(extra.status).toBe(1);
  expect(extra.stderr).toContain('review_control_request_invalid');
  expect(readFileSync(f.active, 'utf8')).toBe(before);
  expect(f.read(grant).revision).toBe(1);

  const revoked = await revoke('revoke', {});
  expect(revoked.status, revoked.stderr).toBe(0);
  expect(JSON.parse(revoked.stdout)).toEqual({ revision: 2, revoked_grant_sha256: grant });
  expect(() => f.read(grant)).toThrow('revoked_or_replaced');
  expect(readCurrentReviewAdmissionSelection({ repoRoot: f.root, authorityHome: f.home, ...f.identity })).toBeNull();
  const again = await revoke('revoke-again', { expectedRevision: 2 });
  expect(again.status).toBe(1);
  expect(again.stderr).toContain('review_admission_revoked_or_replaced');
});
const publishHome = () => { const home = tmpWorkspace('review-publish-home'); roots.push(home); return home; };

function publishReceipt(overrides: Record<string, unknown> = {}) {
  return {
    protocol: 1,
    kind: 'repo-harness-review-publish-receipt',
    round: 1,
    subject_sha: PUBLISH_HEAD,
    risk_tier: 'high',
    reviewer: { harness: 'codex', actual_model: 'gpt-5.1-codex' },
    verdict: 'FAIL',
    model_relation: 'different-family',
    summary: 'One blocking finding and one NIT.',
    findings: [
      { id: 'F1', severity: 'P1', path: 'src/example.ts', line: 12, evidence: 'The guard drops the last item.', fix: 'Use the inclusive bound.' },
      { id: 'N1', severity: 'P3', message: 'Rename the helper for clarity.' },
    ],
    ...overrides,
  };
}

function publishFixture(scenario = passingScenario()) {
  const root = tmpWorkspace('review-publish-root'); roots.push(root);
  const gh = installFakeGh(root, scenario);
  return { root, gh, receipt: join(root, 'receipt.json') };
}

async function runPublish(fixture: ReturnType<typeof publishFixture>, receipt: unknown) {
  writeFileSync(fixture.receipt, JSON.stringify(receipt));
  const previous = process.env.REPO_HARNESS_GH_BIN;
  process.env.REPO_HARNESS_GH_BIN = fixture.gh.bin;
  try {
    return await runReview(publishHome(), ['publish', '--repo', fixture.root, '--pr', String(PUBLISH_PR), '--receipt', fixture.receipt, '--json']);
  } finally {
    if (previous === undefined) delete process.env.REPO_HARNESS_GH_BIN;
    else process.env.REPO_HARNESS_GH_BIN = previous;
  }
}

function postedInputs(fixture: ReturnType<typeof publishFixture>, suffix: string) {
  return fixture.gh.inputs().filter((entry) => entry.args.some((arg) => arg === suffix || arg.endsWith(suffix)));
}

test('publish posts the claim, one review thread per P1/P2, then the record', async () => {
  const fixture = publishFixture();
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status, result.stderr).toBe(0);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: true, pr: PUBLISH_PR, head_sha: PUBLISH_HEAD, round: 1, threads: 1 });
  expect(output.claim_url).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');
  expect(output.review_url).toContain('#pullrequestreview-');
  expect(output.record_url).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');

  const posts = fixture.gh.inputs().filter((entry) => entry.input !== '').map((entry) => JSON.parse(entry.input));
  expect(posts).toHaveLength(3);
  expect(posts[0].body).toContain('repo-harness acceptance claim');
  expect(posts[0].body).toContain('Tier: high');
  expect(posts[0].body).toContain('Agent: codex (gpt-5.1-codex), read-only');
  expect(posts[1]).toMatchObject({ commit_id: PUBLISH_HEAD, event: 'COMMENT' });
  expect(posts[1].comments).toHaveLength(1);
  expect(posts[1].comments[0]).toMatchObject({ path: 'src/example.ts', line: 12, side: 'RIGHT' });
  expect(posts[1].comments[0].body).toContain('The guard drops the last item.');
  expect(posts[1].comments[0].body).toContain('Use the inclusive bound.');
  expect(posts[1].body).toContain('Rename the helper for clarity.');
  expect(posts[1].body).not.toContain('The guard drops the last item.');
  expect(posts[1].comments[0].body).not.toContain('Rename the helper for clarity.');
  expect(posts[2].body).toContain('repo-harness acceptance record');
  expect(posts[2].body).toContain('Model relation: different-family');
  expect(posts[2].body).toContain('FAIL: 1 P1, 1 P3');
  expect(posts[2].body).toContain(output.claim_url);
  expect(posts[2].body).toContain('read-only');
  expect(posts[2].body).not.toContain('fresh context');
});

test('a FAIL receipt with no blocking finding is invalid and posts nothing', async () => {
  const fixture = publishFixture();
  const result = await runPublish(fixture, publishReceipt({ findings: [{ id: 'N1', severity: 'P3', message: 'Only a NIT.' }] }));
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: 'review_receipt_invalid', exit_code: 2, posted: [] });
  expect(fixture.gh.calls()).toEqual([]);
});

test('a stale subject exits 2 and posts nothing', async () => {
  const fixture = publishFixture();
  const result = await runPublish(fixture, publishReceipt({ subject_sha: 'b'.repeat(40) }));
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: 'review_subject_stale', exit_code: 2, posted: [] });
  expect(fixture.gh.calls().some((args) => args.includes('POST'))).toBe(false);
  expect(fixture.gh.inputs().some((entry) => entry.input !== '')).toBe(false);
});

test('a PASS receipt with no P1/P2 opens no review thread', async () => {
  const fixture = publishFixture();
  const result = await runPublish(fixture, publishReceipt({ verdict: 'PASS', findings: [
    { id: 'N1', severity: 'P3', message: 'Rename the helper for clarity.' },
  ] }));
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, threads: 0 });
  const review = JSON.parse(postedInputs(fixture, '/reviews')[0]!.input);
  expect(review.comments ?? []).toEqual([]);
  expect(review.body).toContain('Rename the helper for clarity.');
  expect(review.event).toBe('COMMENT');
});

test('a failure after the claim stops with review_publish_partial and the posted URLs', async () => {
  const fixture = publishFixture(passingScenario({ failPost: 'review' }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(5);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: false, error: 'review_publish_partial', exit_code: 5 });
  expect(output.posted).toHaveLength(1);
  expect(output.posted[0]).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');
  expect(fixture.gh.inputs().filter((entry) => entry.args.some((arg) => arg.endsWith('/reviews')))).toHaveLength(1);
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(0);
});

test('a POST with an unknown outcome exits 5 with the confirmed URLs and is not retried', async () => {
  const fixture = publishFixture(passingScenario({ unknownPost: 'review' }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(5);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: false, error: 'review_publish_unknown', exit_code: 5, inspect_required: true });
  expect(output.posted).toHaveLength(1);
  expect(output.posted[0]).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');
  expect(output.confirmed_urls).toEqual(output.posted);
  expect(output.message).toContain('inspection is required');
  expect(fixture.gh.inputs().filter((entry) => entry.args.some((arg) => arg.endsWith('/reviews')))).toHaveLength(1);
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(0);
});

test('a claim POST with no provider answer exits 5 with no confirmed URL and requires inspection', async () => {
  const fixture = publishFixture(passingScenario({ unknownPost: 'claim', unknownPostMode: 'timeout' }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(5);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: false, error: 'review_publish_unknown', exit_code: 5, inspect_required: true, posted: [] });
  expect(output.confirmed_urls).toEqual([]);
  expect(fixture.gh.inputs().filter((entry) => entry.args.some((arg) => arg.endsWith('/reviews')))).toHaveLength(0);
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(0);
});

test('a POST transport failure with exit 1 and EOF reports the unknown outcome', async () => {
  const fixture = publishFixture(passingScenario({ unknownPost: 'review', unknownPostMode: 'transport' }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(5);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: false, error: 'review_publish_unknown', exit_code: 5, inspect_required: true });
  expect(output.posted).toHaveLength(1);
  expect(output.posted[0]).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');
  expect(output.message).toContain('gh: EOF');
  expect(fixture.gh.inputs().filter((entry) => entry.args.some((arg) => arg.endsWith('/reviews')))).toHaveLength(1);
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(0);
});

test('a record POST whose response fails URL validation exits 5 and keeps the confirmed URLs', async () => {
  const fixture = publishFixture(passingScenario({ unknownPost: 'record', unknownPostMode: 'bad_url' }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(5);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: false, error: 'review_publish_unknown', exit_code: 5, inspect_required: true });
  expect(output.posted).toHaveLength(2);
  expect(output.posted[0]).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');
  expect(output.posted[1]).toContain('#pullrequestreview-');
  expect(output.confirmed_urls).toEqual(output.posted);
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(1);
});

test('a valid review URL with a wrong binding or state is retained in the unknown outcome', async () => {
  for (const reviewBinding of ['wrong_commit', 'wrong_state'] as const) {
    const fixture = publishFixture(passingScenario({ reviewBinding }));
    const result = await runPublish(fixture, publishReceipt());
    expect(result.status).toBe(5);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({ ok: false, error: 'review_publish_unknown', exit_code: 5, inspect_required: true });
    expect(output.posted).toHaveLength(2);
    expect(output.posted[0]).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');
    expect(output.posted[1]).toContain('#pullrequestreview-');
    expect(output.confirmed_urls).toEqual(output.posted);
    expect(fixture.gh.inputs().filter((entry) => entry.args.some((arg) => arg.endsWith('/reviews')))).toHaveLength(1);
    expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(0);
  }
});

test('head movement between the claim and the review stops before the review', async () => {
  const moved = 'f'.repeat(40);
  const fixture = publishFixture(passingScenario({ headSequence: [PUBLISH_HEAD, moved] }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(5);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: false, error: 'review_publish_partial', exit_code: 5 });
  expect(output.posted).toHaveLength(1);
  expect(output.posted[0]).toContain('/pull/' + PUBLISH_PR + '#issuecomment-');
  expect(output.message).toContain('head moved');
  expect(output.message).toContain('inspection is required');
  expect(fixture.gh.inputs().filter((entry) => entry.args.some((arg) => arg.endsWith('/reviews')))).toHaveLength(0);
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(0);
});

test('head movement between the review and the record stops before the record', async () => {
  const moved = 'f'.repeat(40);
  const fixture = publishFixture(passingScenario({ headSequence: [PUBLISH_HEAD, PUBLISH_HEAD, moved] }));
  const result = await runPublish(fixture, publishReceipt());
  expect(result.status).toBe(5);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ ok: false, error: 'review_publish_partial', exit_code: 5 });
  expect(output.posted).toHaveLength(2);
  expect(output.posted[1]).toContain('#pullrequestreview-');
  expect(output.message).toContain('before the record');
  expect(fixture.gh.inputs().filter((entry) => entry.input.includes('repo-harness acceptance record'))).toHaveLength(0);
});

