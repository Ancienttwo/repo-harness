import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createReviewAdmission, reviewCampaignKey, type ReviewAdmissionInput, type ReviewAuthorityInput } from '../../src/core/review/authority-context';
import { hashVerificationPlan } from '../../src/core/evidence/verification-plan';
import { canonicalize } from '../../src/core/evidence/canonical-json';
import type { JsonValue } from '../../src/core/evidence/types';
import { gatesDirectoryName } from '../../src/effects/git/repository-identity';
import { approveReviewAdmission, readReviewAdmission, revokeReviewAdmission } from '../../src/effects/review/admission-store';
import { initGitRepo, tmpWorkspace } from '../helpers/repo-fixture';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const hash = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
function fixture() {
  const root = tmpWorkspace('review-admitted-repo'), home = tmpWorkspace('review-admitted-home'); roots.push(root, home); initGitRepo(root);
  const input: ReviewAdmissionInput = { repository_id: 'R_provider', issue_id: 'I_903', campaign_id: 'review', actor_id: 'U_owner',
    goal: { revision: 'goal-1', content: 'Preserve feedback and acceptance.' },
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
    const content = canonicalize({ protocol: 1, kind: 'repo-harness-review-approval', repository_root: root, actor_id: input.actor_id,
      activation_id: '11111111-1111-4111-8111-111111111111', admission } as unknown as JsonValue) + '\n';
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
    admission: f.input, expectedAdmissionSha256: f.admission.admission_sha256, approvedActor: f.input.actor_id, expectedRevision: revision });
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
