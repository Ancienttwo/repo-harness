import { approveDelegatedReviewAdmission } from '../../src/effects/review/control-admission';
import { signedHumanAdmissionFixture, signedBotAdmissionFixture } from '../helpers/control-approval-fixture';
import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createReviewAdmission, reviewCampaignKey, type ReviewAdmissionInput, type ReviewAuthorityInput } from '../../src/core/review/authority-context';
import { observeReviewIssueGoal, observeActiveReviewAdmission, observeAdmittedReviewContext } from '../../src/effects/review/issue-goal';
import { parseExternalSourcesPolicy } from '../../src/effects/external-sources/policy';
import { hashVerificationPlan } from '../../src/core/evidence/verification-plan';
import { canonicalize } from '../../src/core/evidence/canonical-json';
import type { JsonValue } from '../../src/core/evidence/types';
import { gatesDirectoryName } from '../../src/effects/git/repository-identity';
import { approveReviewAdmission, readActiveReviewAdmission, readReviewAdmission, revokeReviewAdmission } from '../../src/effects/review/admission-store';
import { initGitRepo, tmpWorkspace } from '../helpers/repo-fixture';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const hash = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
function fixture(goal = { revision: 'goal-1', content: 'Preserve feedback and acceptance.' }) {
  const root = tmpWorkspace('review-admitted-repo'), home = tmpWorkspace('review-admitted-home'); roots.push(root, home); initGitRepo(root);
  const input: ReviewAdmissionInput = { repository_id: 'R_provider', issue_id: 'I_903', campaign_id: 'review', actor_id: 'U_owner',
    goal, oracles: [],
    policy: { reviewer: 'Codex', user_waiver: 'forbidden', policy_sha256: hash('policy') }, allowed_paths: ['src/**'], benchmark: 'not_required',
    verification_plan: { protocol: 1, checks: [{ id: 'behavior', kind: 'command', command: 'test -f feature.txt', cwd: '.', phase: 'verification',
      cost: 'normal', evidence_policy: 'current_exact', necessity: 'Check the feature.', inputs: { env: [] } }] } };
  const admission = createReviewAdmission(input);
  const directory = join(home, '.repo-harness', 'gates', gatesDirectoryName(root), 'review-admissions', reviewCampaignKey(input).slice(7));
  const round: Pick<ReviewAuthorityInput, 'subject' | 'verification'> = {
    subject: { status: 'ok', scope: 'normalized-final-content', target_ref: 'main', target_rev: '1'.repeat(40), head_rev: '2'.repeat(40), review_subject_sha256: hash('content') },
    verification: { plan_sha256: hashVerificationPlan(input.verification_plan), source_sha256: hash('source'), evidence_sha256: hash('report'), tree_sha256: hash('tree') } };
  function seed() {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const content = canonicalize({ protocol: 2, kind: 'repo-harness-review-approval', repository_root: root, actor_id: input.actor_id,
      activation_id: '11111111-1111-4111-8111-111111111111', admission,
      control_approval: { envelope: signedHumanAdmissionFixture(home, root, admission, 0), expected_revision: 0 } } as unknown as JsonValue) + '\n';
    const digest = hash(content);
    writeFileSync(join(directory, `${digest.slice(7)}.json`), content, { mode: 0o600 });
    writeFileSync(join(directory, 'active.json'), JSON.stringify({ protocol: 1, revision: 1, grant_sha256: digest }), { mode: 0o600 });
    return digest;
  }
  const args = (grant: string) => ({ repoRoot: root, authorityHome: home, repository_id: input.repository_id, issue_id: input.issue_id, campaign_id: input.campaign_id,
    expectedGrantSha256: grant, expectedPolicySha256: input.policy.policy_sha256, expectedGoal: input.goal, expectedActor: input.actor_id, round });
  return { root, home, input, admission, directory, round, seed, args };
}

test('protected read binds the active grant to actor, goal, subject and exact plan', () => {
  const f = fixture(), grant = f.seed();
  const value = readReviewAdmission(f.args(grant));
  expect(value.context.authorization.grant_sha256).toBe(grant);
  expect(value.context.subject.review_subject_sha256).toBe(f.round.subject.review_subject_sha256);
  expect(() => readReviewAdmission({ ...f.args(grant), expectedPolicySha256: hash('changed policy') })).toThrow('policy_changed');
  expect(() => readReviewAdmission({ ...f.args(grant), expectedActor: 'U_other' })).toThrow('grant_binding');
  expect(() => readReviewAdmission({ ...f.args(grant), expectedGoal: { ...f.input.goal, content: 'Different goal' } })).toThrow('goal_or_actor_changed');
  expect(() => readReviewAdmission({ ...f.args(grant), round: { ...f.round, verification: { ...f.round.verification, plan_sha256: hash('other plan') } } })).toThrow('verification plan changed');
});

test('protected read rejects revoked and byte-tampered grants without using historical approvals', () => {
  const f = fixture(), grant = f.seed(), file = join(f.directory, `${grant.slice(7)}.json`);
  const original = readFileSync(file);
  writeFileSync(file, original.toString().replace('Preserve feedback', 'Retire feedback'));
  expect(() => readReviewAdmission(f.args(grant))).toThrow('grant_digest');
  writeFileSync(file, original);
  writeFileSync(join(f.directory, 'active.json'), JSON.stringify({ protocol: 1, revision: 2, grant_sha256: null }));
  expect(() => readReviewAdmission(f.args(grant))).toThrow('revoked_or_replaced');
  expect(readFileSync(file)).toEqual(original);
});

test('protected read refuses a candidate-local authority home and linked grant files', () => {
  const f = fixture(), grant = f.seed();
  expect(() => readReviewAdmission({ ...f.args(grant), authorityHome: f.root })).toThrow('authority_inside_candidate');
  const file = join(f.directory, `${grant.slice(7)}.json`), alternate = join(f.home, 'copied.json');
  writeFileSync(alternate, readFileSync(file), { mode: 0o600 }); rmSync(file); symlinkSync(alternate, file);
  expect(() => readReviewAdmission(f.args(grant))).toThrow('unsafe_authority');
});

test('operator approval uses revision CAS and reapproval never resurrects an old grant identity', () => {
  const f = fixture();
  const approve = (revision: number) => approveReviewAdmission({ repoRoot: f.root, authorityHome: f.home,
    admission: f.input, expectedAdmissionSha256: f.admission.admission_sha256, expectedRevision: revision,
    controlEnvelope: signedHumanAdmissionFixture(f.home, f.root, f.admission, revision) });
  const first = approve(0);
  expect(readReviewAdmission(f.args(first.grant_sha256)).revision).toBe(1);
  expect(() => approve(0)).toThrow('revision_changed');
  revokeReviewAdmission({ ...f.args(first.grant_sha256), expectedRevision: 1 });
  expect(() => readReviewAdmission(f.args(first.grant_sha256))).toThrow('revoked_or_replaced');
  const next = approve(2);
  expect(next.grant_sha256).not.toBe(first.grant_sha256);
  expect(readReviewAdmission(f.args(next.grant_sha256)).revision).toBe(3);
  expect(() => readReviewAdmission(f.args(first.grant_sha256))).toThrow('revoked_or_replaced');
});

test('protected read reobserves the provider goal instead of trusting a caller snapshot', () => {
  const policy = parseExternalSourcesPolicy({ version: 1, mode: 'manual', github: {
    enabled: true, repository: 'acme/widgets', selection: { kind: 'issue_numbers', issue_numbers: [903] },
    limits: { max_pages: 1, max_issues: 1, max_body_bytes: 4096, max_total_bytes: 8192, deadline_ms: 5000 },
  } });
  const issue = { id: 'I_903', number: 903, html_url: 'https://github.com/acme/widgets/issues/903', state: 'open',
    title: 'Preserve behavior', body: 'Migrate review authority.', updated_at: '2026-10-25T00:00:00Z' };
  const repo = { id: 'R_provider', full_name: 'acme/widgets', html_url: 'https://github.com/acme/widgets' };
  const runner = (changed = false) => {
    const replies = [repo, issue, repo, changed ? { ...issue, body: 'Different goal' } : issue];
    return () => ({ stdout: JSON.stringify(replies.shift()) });
  };
  const goal = observeReviewIssueGoal({ policy, repository_id: 'R_provider', issue_id: 'I_903', runner: runner() });
  const f = fixture(goal), grant = f.seed();
  const { expectedGoal: _ignored, ...args } = f.args(grant);
  const { round: _notExecuted, ...beforeExecution } = args;
  expect(observeActiveReviewAdmission({ ...beforeExecution, issuePolicy: policy, runner: runner() }).admission.verification_plan).toEqual(f.input.verification_plan);
  expect(observeAdmittedReviewContext({ ...args, issuePolicy: policy, runner: runner() }).context.goal).toEqual(goal);
  expect(() => observeAdmittedReviewContext({ ...args, issuePolicy: policy, runner: runner(true) })).toThrow('review_goal_changed_during_read');
  const duringRead = runner(); let calls = 0;
  expect(() => observeActiveReviewAdmission({ ...beforeExecution, issuePolicy: policy, runner: () => {
    const response = duringRead();
    if (++calls === 4) writeFileSync(join(f.directory, 'active.json'), JSON.stringify({ protocol: 1, revision: 2, grant_sha256: null }));
    return response;
  } })).toThrow('revoked_or_replaced');
});

test('launch-time HOME and REPO_HARNESS_HOME cannot authorize a forged default admission', () => {
  const f = fixture(), grant = f.seed();
  const { authorityHome: _explicitHome, ...args } = f.args(grant);
  const code = [
    `const { readReviewAdmission } = await import(${JSON.stringify(join(import.meta.dir, '../../src/effects/review/admission-store.ts'))});`,
    `const args = ${JSON.stringify(args)};`,
    `const explicit = readReviewAdmission({ ...args, authorityHome: ${JSON.stringify(f.home)} });`,
    `if (explicit.context.authorization.grant_sha256 !== args.expectedGrantSha256) throw new Error('fixture is invalid');`,
    `try { readReviewAdmission(args); console.log('accepted-forged-grant'); }`,
    `catch (error) { if (error.message !== 'review_admission_missing') throw error; console.log('rejected-forged-grant'); }`,
  ].join('\n');
  const child = Bun.spawnSync([process.execPath, '-e', code], {
    env: { ...process.env, HOME: f.home, REPO_HARNESS_HOME: join(f.home, '.repo-harness') }, stdout: 'pipe', stderr: 'pipe',
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(child.stdout.toString().trim()).toBe('rejected-forged-grant');
});

test('protected read returns a detached frozen admission and nested execution plan', () => {
  const f = fixture(), grant = f.seed();
  const value = readReviewAdmission(f.args(grant));
  expect(Object.isFrozen(value.admission)).toBe(true);
  expect(Object.isFrozen(value.admission.allowed_paths)).toBe(true);
  expect(Object.isFrozen(value.admission.verification_plan.checks)).toBe(true);
  expect(Reflect.set(value.admission.goal, 'content', 'Unapproved replacement')).toBe(false);
  expect(Reflect.set(value.admission.allowed_paths, '0', 'outside/**')).toBe(false);
  expect(Reflect.set(value.admission.verification_plan.checks[0]!, 'command', 'echo bypass')).toBe(false);
  expect(value.admission.goal).toEqual(value.context.goal);
  expect(hashVerificationPlan(value.admission.verification_plan)).toBe(value.context.verification.plan_sha256);
  expect(readReviewAdmission(f.args(grant)).admission).toEqual(value.admission);
});

test('protected read exposes the approved plan before execution without fabricated evidence', () => {
  const f = fixture(), grant = f.seed();
  const { round: _notExecuted, ...args } = f.args(grant);
  const value = readActiveReviewAdmission(args);
  expect(value.admission.verification_plan).toEqual(f.input.verification_plan);
  expect(value.grant_sha256).toBe(grant);
  expect(Object.isFrozen(value.admission.verification_plan.checks)).toBe(true);
  writeFileSync(join(f.directory, 'active.json'), JSON.stringify({ protocol: 1, revision: 2, grant_sha256: null }));
  expect(() => readActiveReviewAdmission(args)).toThrow('revoked_or_replaced');
});


test('control admission writes a signed Bot grant and later reads recheck parent revocation', () => {
  const f = fixture();
  const envelope = signedBotAdmissionFixture(f.home, f.root, f.admission, 0);
  const result = approveDelegatedReviewAdmission({ repoRoot: f.root, authorityHome: f.home,
    admission: f.input, envelope, expectedRevision: 0 });
  expect(result.approved_by).toBe('fixture-bot');
  expect(result.execution_actor).toBe(f.input.actor_id);
  expect(readReviewAdmission(f.args(result.grant_sha256)).admission).toEqual(f.admission);
  expect(() => approveDelegatedReviewAdmission({ repoRoot: f.root, authorityHome: f.home,
    admission: f.input, envelope, expectedRevision: 0 })).toThrow('revision_changed');
  const trustPath = join(f.home, '.repo-harness/control-trust.json');
  const trust = JSON.parse(readFileSync(trustPath, 'utf8'));
  writeFileSync(trustPath, JSON.stringify({ ...trust, revoked_delegation_ids: ['fixture-delegation'] }));
  expect(() => readReviewAdmission(f.args(result.grant_sha256))).toThrow('revoked');
});

test('protected read rejects unsigned records even when the record digest matches', () => {
  const f = fixture(), grant = f.seed();
  const raw = JSON.parse(readFileSync(join(f.directory, `${grant.slice(7)}.json`), 'utf8'));
  delete raw.control_approval;
  const content = canonicalize(raw) + '\n', forged = hash(content);
  writeFileSync(join(f.directory, `${forged.slice(7)}.json`), content, { mode: 0o600 });
  writeFileSync(join(f.directory, 'active.json'), JSON.stringify({ protocol: 1, revision: 1, grant_sha256: forged }));
  expect(() => readReviewAdmission(f.args(forged))).toThrow('grant_binding');
});
