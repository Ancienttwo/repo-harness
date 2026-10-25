import { expect, test } from 'bun:test';
import { createReviewAuthorityContext, assertReviewAuthorityContext, reviewCampaignKey, type ReviewAuthorityInput } from '../../src/core/review/authority-context';

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
