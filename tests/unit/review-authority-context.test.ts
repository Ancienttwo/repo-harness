import { expect, test } from 'bun:test';
import { createReviewAuthorityContext, assertReviewAuthorityContext, reviewCampaignKey, createReviewAdmission, bindReviewAdmission, type ReviewAuthorityInput } from '../../src/core/review/authority-context';

import { hashVerificationPlan, type VerificationPlan } from '../../src/core/evidence/verification-plan';

const digest = (c: string) => `sha256:${c.repeat(64)}`;
function input(): ReviewAuthorityInput {
  return {
    repository_id: 'R_repository', issue_id: 'I_issue', campaign_id: 'review-903',
    goal: { revision: '2026-10-25T18:00:00Z', content: 'Preserve behavior while removing the retired authority.' },
    authorization: { actor_id: 'U_owner', grant_sha256: digest('a') },
    policy: { reviewer: 'Codex', user_waiver: 'forbidden', policy_sha256: digest('b') },
    allowed_paths: ['src/review/**', 'tests/review/**'], benchmark: 'required',
    verification: { plan_sha256: digest('c'), source_sha256: digest('d'), evidence_sha256: digest('e'), tree_sha256: digest('f') },
    subject: { status: 'ok', scope: 'normalized-final-content', target_ref: 'main', target_rev: '1'.repeat(40), head_rev: '2'.repeat(40), review_subject_sha256: digest('0') },
  };
}

test('a changed round retains campaign identity but invalidates acceptance, including dirty content at the same head', () => {
  const admitted = input(), initial = createReviewAuthorityContext(admitted);
  for (const change of [
    (v: ReviewAuthorityInput) => { v.subject.review_subject_sha256 = digest('1'); },
    (v: ReviewAuthorityInput) => { v.goal.content += ' with a different goal'; },
    (v: ReviewAuthorityInput) => { v.verification.evidence_sha256 = digest('2'); },
    (v: ReviewAuthorityInput) => { v.allowed_paths.push('other/**'); },
    (v: ReviewAuthorityInput) => { v.benchmark = 'not_required'; },
    (v: ReviewAuthorityInput) => { v.policy.user_waiver = 'allowed'; },
    (v: ReviewAuthorityInput) => { v.authorization.actor_id = 'U_other'; },
  ]) {
    const next = structuredClone(admitted); change(next);
    expect(reviewCampaignKey(next)).toBe(initial.campaign_sha256);
    expect(() => assertReviewAuthorityContext(initial, next)).toThrow('review_context_changed');
  }
});

test('a caller cannot cross repository or issue boundaries by reusing a campaign label', () => {
  const original = input();
  for (const next of [{ ...original, repository_id: 'R_other' }, { ...original, issue_id: 'I_other' }]) {
    expect(reviewCampaignKey(next)).not.toBe(reviewCampaignKey(original));
  }
});

test('context refuses unavailable subjects, missing admission and legacy receipt fields', () => {
  const original = input();
  for (const invalid of [
    { ...original, subject: { ...original.subject, status: 'unknown' } },
    { ...original, authorization: { ...original.authorization, grant_sha256: '' } },
    { ...original, contract_file: 'tasks/contracts/old.contract.md' },
    { ...original, allowed_paths: [] },
    { ...original, allowed_paths: ['../outside/**'] },
  ]) expect(() => createReviewAuthorityContext(invalid as ReviewAuthorityInput)).toThrow();
});

test('validated context is detached and deeply frozen, so later caller edits cannot rewrite admitted inputs', () => {
  const source = input(), context = createReviewAuthorityContext(source);
  source.goal.content = 'changed'; source.allowed_paths.push('elsewhere/**');
  expect(context.goal.content).not.toBe(source.goal.content);
  expect(context.allowed_paths).toEqual(['src/review/**', 'tests/review/**']);
  expect(Object.isFrozen(context)).toBe(true);
  expect(Object.isFrozen(context.goal)).toBe(true);
  expect(Object.isFrozen(context.allowed_paths)).toBe(true);
  expect(() => assertReviewAuthorityContext({ ...context, context_sha256: digest('9') }, input())).toThrow();
});

test('policy enum fields reject JSON arrays, objects and null without coercion', () => {
  for (const [field, invalidValues] of [
    ['reviewer', [['Codex'], ['Claude'], {}, null]],
    ['user_waiver', [['allowed'], ['forbidden'], {}, null]],
  ] as const) {
    for (const invalid of invalidValues) {
      const candidate = input();
      (candidate.policy as Record<string, unknown>)[field] = invalid;
      expect(() => createReviewAuthorityContext(candidate)).toThrow('review_context_invalid: policy values');
    }
  }
});

test('comma-bearing JSON keys cannot replace the four required verification fields', () => {
  const candidate = {
    ...input(),
    verification: { 'evidence_sha256,plan_sha256,source_sha256,tree_sha256': digest('a') },
  };
  expect(() => createReviewAuthorityContext(candidate as unknown as ReviewAuthorityInput)).toThrow('review_context_invalid: verification');
});

test('a serialization hook cannot replace the validated scope during snapshot construction', () => {
  const candidate = input();
  Object.setPrototypeOf(candidate, {
    toJSON() { return { ...input(), allowed_paths: ['unapproved/**'] }; },
  });
  expect(createReviewAuthorityContext(candidate).allowed_paths).toEqual(['src/review/**', 'tests/review/**']);
});

const plan: VerificationPlan = { protocol: 1, checks: [{
  id: 'behavior', kind: 'command', command: 'test -f feature.txt', cwd: '.', phase: 'verification',
  cost: 'normal', evidence_policy: 'current_exact', necessity: 'Verify the candidate feature.', inputs: { env: [] },
}] };
function admissionInput() {
  const { authorization, subject: _subject, verification: _verification, ...scope } = input();
  return { ...scope, actor_id: authorization.actor_id, oracles: [], verification_plan: structuredClone(plan) };
}

test('admission binds the actual verification plan and a fixed goal while allowing later subject rounds', () => {
  const admitted = createReviewAdmission(admissionInput());
  const round = input(); round.verification.plan_sha256 = hashVerificationPlan(plan);
  const first = bindReviewAdmission(admitted, round, digest('5'));
  round.subject.review_subject_sha256 = digest('3');
  const second = bindReviewAdmission(admitted, round, digest('5'));
  expect(second.campaign_sha256).toBe(first.campaign_sha256);
  expect(second.context_sha256).not.toBe(first.context_sha256);
  expect(second.authorization.grant_sha256).toBe(digest('5'));
  round.verification.plan_sha256 = digest('4');
  expect(() => bindReviewAdmission(admitted, round, digest('5'))).toThrow('verification plan changed');
  expect(() => bindReviewAdmission({ ...admitted, goal: { ...admitted.goal, content: 'Unapproved new goal' } }, input(), digest('5'))).toThrow('admission digest');
});

test('admission rejects empty plans and cannot mutate a retained execution plan through caller aliases', () => {
  const spec = admissionInput(), admitted = createReviewAdmission(spec);
  (spec.verification_plan.checks as unknown as { command: string }[])[0]!.command = 'echo bypass';
  expect(admitted.verification_plan.checks[0]).toEqual(plan.checks[0]);
  expect(Object.isFrozen(admitted.verification_plan.checks)).toBe(true);
  expect(() => createReviewAdmission({ ...spec, verification_plan: { protocol: 1, checks: [] } })).toThrow('empty verification plan');
});

test('admission preserves directory scopes but rejects empty or traversing path segments', () => {
  expect(createReviewAdmission({ ...admissionInput(), allowed_paths: ['src/'] }).allowed_paths).toEqual(['src/']);
  for (const path of ['/', 'src//', 'src/../', 'src/./', 'src//review']) {
    expect(() => createReviewAdmission({ ...admissionInput(), allowed_paths: [path] })).toThrow('unsafe allowed path');
  }
});

test('approved oracle declarations use assessment validation and bind the admission digest', () => {
  const original = admissionInput();
  const without = createReviewAdmission(original);
  const oracles = [{ id: 'behavior', kind: 'deterministic_test' as const, paths: ['src/**'] }];
  const withOracle = createReviewAdmission({ ...original, oracles });
  expect(withOracle.admission_sha256).not.toBe(without.admission_sha256);
  oracles[0]!.paths.push('unapproved/**');
  expect(withOracle.oracles[0]!.paths).toEqual(['src/**']);
  expect(Object.isFrozen(withOracle.oracles[0]!.paths)).toBe(true);
  for (const bad of [[{ id: 'x', kind: 'unknown', paths: ['*'] }], [oracles[0], oracles[0]], [{ id: 'x', kind: 'manual_acceptance', paths: ['../outside'] }]]) {
    expect(() => createReviewAdmission({ ...original, oracles: bad as never })).toThrow('oracle declarations');
  }
});

test('admission rejects unknown oracle policy fields instead of erasing them', () => {
  const oracle = { id: 'behavior', kind: 'deterministic_test', paths: ['src/feature.ts'], unknown_policy_field: 'must-not-disappear' };
  expect(() => createReviewAdmission({ ...admissionInput(), oracles: [oracle] as never })).toThrow('oracle declarations');
});

test('admitted path scope preserves glob and directory semantics without implicit contract access', async () => {
  const { reviewAdmissionAllowsPath } = await import('../../src/core/review/authority-context');
  expect(reviewAdmissionAllowsPath(['src/'], 'src/feature.ts')).toBe(true);
  expect(reviewAdmissionAllowsPath(['src/**'], 'src/nested/feature.ts')).toBe(true);
  // Existing scope matcher treats '*' as any suffix, including '/'. Preserve it.
  expect(reviewAdmissionAllowsPath(['src/*'], 'src/nested/feature.ts')).toBe(true);
  expect(reviewAdmissionAllowsPath(['src/'], 'tasks/contracts/demo.contract.md')).toBe(false);
  for (const path of ['../src/a.ts', 'src/../secret', '/src/a.ts', 'src\\a.ts']) {
    expect(reviewAdmissionAllowsPath(['*'], path)).toBe(false);
  }
});
