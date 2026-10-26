import { expect, test } from 'bun:test';
import { createReviewAdmission, type ReviewAdmissionInput } from '../../src/core/review/authority-context';
import { validateControlApproval, type ControlApproval } from '../../src/core/review/control-delegation';

const now = 1_800_000_000_000;
const repositoryRoot = '/work/repository';
function fixture() {
  const input: ReviewAdmissionInput = { issue_number: 1, execution_mode: 'contract',
    repository_id: 'R_repo', issue_id: 'I_issue', campaign_id: 'campaign', actor_id: 'executor',
    goal: { revision: 'goal-sha', content: 'Implement the reviewed feature.' },
    policy: { reviewer: 'Codex', user_waiver: 'forbidden', policy_sha256: `sha256:${'a'.repeat(64)}` },
    allowed_paths: ['src/**'], benchmark: 'required', oracles: [],
    verification_plan: { protocol: 1, checks: [{ id: 'behavior', kind: 'command', command: 'test -f feature.txt', cwd: '.',
      phase: 'verification', cost: 'normal', evidence_policy: 'current_exact', necessity: 'Verify feature.', inputs: { env: [] } }] },
  };
  const approval: ControlApproval = {
    protocol: 1, kind: 'repo-harness-upstream-control-approval', authorization_ref: 'upstream-decision-1', bot_id: 'bot', action: 'admit',
    repository_id: input.repository_id, issue_id: input.issue_id, campaign_id: input.campaign_id, execution_actor: input.actor_id,
    parent_scope: { issue_ids: [input.issue_id], allowed_paths: [...input.allowed_paths], policy: { ...input.policy },
      benchmark: input.benchmark, not_before: now - 100, expires_at: now + 1000 },
    admission_sha256: createReviewAdmission(input).admission_sha256, repository_root: repositoryRoot,
    expected_revision: 0, expires_at: now + 500,
  };
  return { input, approval,
    verify: (value: unknown = approval) => validateControlApproval(value, now, createReviewAdmission(input), repositoryRoot, 0) };
}

test('an upstream request binds the exact admission and returns detached immutable trace and scope data', () => {
  const f = fixture(), result = f.verify();
  expect(result).toEqual(f.approval);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.parent_scope)).toBe(true);
  expect(Object.isFrozen(result.parent_scope.policy)).toBe(true);
  expect(Object.isFrozen(result.parent_scope.allowed_paths)).toBe(true);
  f.approval.authorization_ref = 'another-upstream-decision';
  f.approval.parent_scope.allowed_paths.push('other/**');
  expect(result.authorization_ref).toBe('upstream-decision-1');
  expect(result.parent_scope.allowed_paths).toEqual(['src/**']);
});

test('exact scope inclusion and explicit whole-scope delegation work without inferred glob containment', () => {
  const f = fixture();
  f.approval.parent_scope.allowed_paths = ['src/**', 'tests/**'];
  expect(f.verify().bot_id).toBe('bot');
  f.input.allowed_paths = ['src/nested/**'];
  f.approval.admission_sha256 = createReviewAdmission(f.input).admission_sha256;
  expect(() => f.verify()).toThrow('scope');
  f.approval.parent_scope.allowed_paths = ['*'];
  expect(f.verify().bot_id).toBe('bot');
});

test('requests enforce identity, parent scope, policy, current time and exact transition', () => {
  const mutations: Array<(f: ReturnType<typeof fixture>) => void> = [
    f => { f.approval.bot_id = f.input.actor_id; },
    f => { f.approval.repository_id = 'R_other'; },
    f => { f.approval.issue_id = 'I_other'; },
    f => { f.approval.campaign_id = 'other-campaign'; },
    f => { f.approval.execution_actor = 'other-executor'; },
    f => { f.approval.parent_scope.issue_ids = ['I_other']; },
    f => { f.approval.parent_scope.allowed_paths = ['other/**']; },
    f => { f.approval.parent_scope.allowed_paths = ['../src/**']; },
    f => { f.approval.parent_scope.policy.policy_sha256 = `sha256:${'b'.repeat(64)}`; },
    f => { f.approval.parent_scope.benchmark = 'not_required'; },
    f => { f.input.policy.user_waiver = 'allowed'; },
    f => { f.approval.parent_scope.not_before = now + 1; },
    f => { f.approval.parent_scope.expires_at = now; },
    f => { f.approval.repository_root = '/work/other'; },
    f => { f.approval.expected_revision = 1; },
    f => { f.approval.expires_at = now; },
    f => { f.approval.expires_at = f.approval.parent_scope.expires_at + 1; },
    f => { f.approval.admission_sha256 = `sha256:${'f'.repeat(64)}`; },
    f => { f.approval.authorization_ref = ''; },
    f => { f.input.goal.content += ' changed'; },
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); expect(() => f.verify()).toThrow('control_approval_invalid'); }
});

test('closed schemas reject coercion, unknown fields and wrong action domains', () => {
  for (const [field, value] of [['protocol', '1'], ['kind', 'repo-harness-control-approval'], ['extra', true],
    ['expires_at', 1.5], ['expected_revision', '0'], ['authorization_ref', ['reference']], ['action', 'waive']] as const) {
    const f = fixture(); Object.assign(f.approval, { [field]: value });
    expect(() => f.verify()).toThrow('control_approval_invalid');
  }
  for (const [field, value] of [['issue_ids', ['I_issue', 'I_issue']], ['allowed_paths', []], ['benchmark', ['required']],
    ['expires_at', '1800000001000'], ['extra', true]] as const) {
    const f = fixture(); Object.assign(f.approval.parent_scope, { [field]: value });
    expect(() => f.verify()).toThrow('control_approval_invalid');
  }
  for (const [field, value] of [['reviewer', ['Codex']], ['user_waiver', null], ['extra', true]] as const) {
    const f = fixture(); Object.assign(f.approval.parent_scope.policy, { [field]: value });
    expect(() => f.verify()).toThrow('control_approval_invalid');
  }
});

test('request validation accepts key order changes but never invokes input serialization or accessor hooks', () => {
  const f = fixture();
  expect(f.verify(Object.fromEntries(Object.entries(f.approval).reverse()))).toEqual(f.approval);
  let called = false;
  Object.defineProperty(f.approval, 'toJSON', { value: () => { called = true; return {}; } });
  expect(() => f.verify()).toThrow('non_data_field');
  expect(called).toBe(false);
  const accessor = fixture();
  Object.defineProperty(accessor.approval, 'parent_scope', { enumerable: true, get() { called = true; return {}; } });
  expect(() => accessor.verify()).toThrow('non_data_field');
  expect(called).toBe(false);
});

test('request contract does not interpret references or actor strings as authentication', () => {
  const f = fixture();
  // Authentication occurs before this pure validator is called. These are trace
  // values; a caller cannot use its successful return as a login/identity check.
  f.approval.authorization_ref = 'another-valid-upstream-reference';
  f.approval.bot_id = 'another-control-bot';
  expect(f.verify().authorization_ref).toBe(f.approval.authorization_ref);
  expect(() => f.verify({ actor: 'executor' })).toThrow('fields');
  expect(() => f.verify({ ...f.approval, signature: 'retired-signature' })).toThrow('fields');
  expect(() => validateControlApproval(f.approval, Number.NaN, createReviewAdmission(f.input), repositoryRoot, 0)).toThrow('integer');
  expect(() => validateControlApproval(f.approval, now, createReviewAdmission(f.input), repositoryRoot, -1)).toThrow('integer');
});

test('waiver eligibility requires a separate explicit upstream action and never follows from ordinary admission', () => {
  const f = fixture(); f.input.policy.user_waiver = 'allowed';
  f.approval.parent_scope.policy.user_waiver = 'allowed';
  f.approval.admission_sha256 = createReviewAdmission(f.input).admission_sha256;
  expect(() => f.verify()).toThrow('waiver');
  f.approval.action = 'admit-with-waiver-eligibility';
  const value = f.verify();
  expect(value.action).toBe('admit-with-waiver-eligibility');
  expect(Object.hasOwn(value, 'waiver_grant')).toBe(false);
  expect(() => validateControlApproval(value, now, createReviewAdmission(f.input), repositoryRoot, 1)).toThrow('subject');
  expect(() => validateControlApproval(value, now + 500, createReviewAdmission(f.input), repositoryRoot, 0)).toThrow('expired');
  f.input.policy.user_waiver = 'forbidden';
  f.approval.parent_scope.policy.user_waiver = 'forbidden';
  f.approval.admission_sha256 = createReviewAdmission(f.input).admission_sha256;
  expect(() => f.verify()).toThrow('waiver');
});

test('Bot cannot change reviewer while retaining the parent policy digest', () => {
  const f = fixture();
  f.input.policy.reviewer = 'Claude';
  f.approval.admission_sha256 = createReviewAdmission(f.input).admission_sha256;
  expect(() => f.verify()).toThrow('policy');
});
