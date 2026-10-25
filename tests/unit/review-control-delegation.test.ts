import { expect, test } from 'bun:test';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { canonicalize } from '../../src/core/evidence/canonical-json';
import type { JsonValue } from '../../src/core/evidence/types';
import { createReviewAdmission, type ReviewAdmissionInput } from '../../src/core/review/authority-context';
import { verifyControlApproval, type ControlDelegation, type ControlApprovalDecision } from '../../src/core/review/control-delegation';

const now = 1_800_000_000_000;
const repositoryRoot = '/work/repository';
const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalize(value as JsonValue)).digest('hex')}`;
const signature = (payload: unknown, key: KeyObject) => ({ payload, signature: sign(null, Buffer.from(canonicalize(payload as JsonValue)), key).toString('base64') });
function fixture() {
  const user = generateKeyPairSync('ed25519'), bot = generateKeyPairSync('ed25519');
  const input: ReviewAdmissionInput = {
    repository_id: 'R_repo', issue_id: 'I_issue', campaign_id: 'campaign', actor_id: 'executor',
    goal: { revision: 'goal-sha', content: 'Implement the reviewed feature.' },
    policy: { reviewer: 'Codex', user_waiver: 'forbidden', policy_sha256: `sha256:${'a'.repeat(64)}` },
    allowed_paths: ['src/**'], benchmark: 'required', oracles: [],
    verification_plan: { protocol: 1, checks: [{ id: 'behavior', kind: 'command', command: 'test -f feature.txt', cwd: '.',
      phase: 'verification', cost: 'normal', evidence_policy: 'current_exact', necessity: 'Verify feature.', inputs: { env: [] } }] },
  };
  const delegation: ControlDelegation = {
    protocol: 1, kind: 'repo-harness-control-delegation', id: 'delegation-1', user_id: 'user', bot_id: 'bot',
    bot_public_key: bot.publicKey.export({ type: 'spki', format: 'pem' }).toString(), repository_id: input.repository_id,
    issue_ids: [input.issue_id], allowed_paths: [...input.allowed_paths], policy_sha256: input.policy.policy_sha256,
    benchmark: input.benchmark, not_before: now - 100, expires_at: now + 1000,
  };
  const decision: ControlApprovalDecision = {
    protocol: 1, kind: 'repo-harness-control-approval', delegation_sha256: hash(delegation),
    admission_sha256: createReviewAdmission(input).admission_sha256, repository_root: repositoryRoot,
    expected_revision: 0, expires_at: now + 500,
  };
  const trust = { userPublicKey: user.publicKey.export({ type: 'spki', format: 'pem' }).toString(), revokedDelegationIds: [] as string[] };
  function envelope() {
    decision.delegation_sha256 = hash(delegation);
    decision.admission_sha256 = createReviewAdmission(input).admission_sha256;
    return { delegation: signature(delegation, user.privateKey), decision: signature(decision, bot.privateKey) };
  }
  return { user, bot, input, delegation, decision, trust, envelope,
    verify: (value: unknown = envelope()) => verifyControlApproval(value, trust, now, createReviewAdmission(input), repositoryRoot, 0) };
}

test('real user and Bot signatures approve only the bound admission and return immutable provenance', () => {
  const f = fixture(), result = f.verify();
  expect(result).toEqual({ delegation_id: 'delegation-1', delegation_sha256: hash(f.delegation), bot_id: 'bot', user_id: 'user', expires_at: now + 500 });
  expect(Object.isFrozen(result)).toBe(true);
  f.delegation.id = 'changed';
  expect(result.delegation_id).toBe('delegation-1');
});

test('exact scope inclusion and explicit whole-scope delegation work without inferred glob containment', () => {
  const f = fixture();
  f.delegation.allowed_paths = ['src/**', 'tests/**'];
  expect(f.verify().bot_id).toBe('bot');
  f.input.allowed_paths = ['src/nested/**'];
  expect(() => f.verify()).toThrow('scope');
  f.delegation.allowed_paths = ['*'];
  expect(f.verify().bot_id).toBe('bot');
});

test('signed delegations still enforce identity, scope, policy, time and revocation restrictions', () => {
  const mutations: Array<(f: ReturnType<typeof fixture>) => void> = [
    f => { f.delegation.bot_id = f.input.actor_id; },
    f => { f.delegation.user_id = f.input.actor_id; },
    f => { f.delegation.user_id = f.delegation.bot_id; },
    f => { f.delegation.repository_id = 'R_other'; },
    f => { f.delegation.issue_ids = ['I_other']; },
    f => { f.delegation.allowed_paths = ['other/**']; },
    f => { f.delegation.allowed_paths = ['../src/**']; },
    f => { f.delegation.policy_sha256 = `sha256:${'b'.repeat(64)}`; },
    f => { f.delegation.benchmark = 'not_required'; },
    f => { f.input.policy.user_waiver = 'allowed'; },
    f => { f.delegation.not_before = now + 1; },
    f => { f.delegation.expires_at = now; },
    f => { f.trust.revokedDelegationIds = [f.delegation.id]; },
    f => { f.decision.repository_root = '/work/other'; },
    f => { f.decision.expected_revision = 1; },
    f => { f.decision.expires_at = now; },
    f => { f.decision.expires_at = f.delegation.expires_at + 1; },
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); expect(() => f.verify()).toThrow('control_approval_invalid'); }
});

test('tampered payloads, another trusted user and signatures for another subject are rejected', () => {
  const f = fixture(), original = f.envelope();
  f.delegation.id = 'tampered';
  expect(() => f.verify(original)).toThrow('signature');
  const next = f.envelope();
  next.decision.payload.repository_root = '/tampered';
  expect(() => f.verify(next)).toThrow('signature');
  const valid = f.envelope();
  f.trust.userPublicKey = fixture().trust.userPublicKey;
  expect(() => f.verify(valid)).toThrow('signature');
  const other = fixture(), prior = other.envelope();
  other.input.goal.content += ' changed';
  expect(() => other.verify(prior)).toThrow('decision_subject');
});

test('closed schemas reject coercion, unknown fields and domain confusion even with valid signatures', () => {
  for (const [field, value] of [ ['protocol', '1'], ['kind', 'repo-harness-control-approval'], ['extra', true],
    ['expires_at', 1.5], ['issue_ids', ['I_issue', 'I_issue']], ['allowed_paths', []], ['benchmark', ['required']] ] as const) {
    const f = fixture(); Object.assign(f.delegation, { [field]: value });
    expect(() => f.verify()).toThrow('control_approval_invalid');
  }
  for (const [field, value] of [['expected_revision', '0'], ['extra', true], ['kind', 'repo-harness-control-delegation']] as const) {
    const f = fixture(); Object.assign(f.decision, { [field]: value });
    expect(() => f.verify()).toThrow('control_approval_invalid');
  }
});

test('signatures require canonical base64 and Ed25519 public keys', () => {
  for (const change of [(s: string) => s + '\n', (s: string) => s.replace(/=+$/, ''), () => 'AAAA']) {
    const f = fixture(), value = f.envelope(); value.decision.signature = change(value.decision.signature);
    expect(() => f.verify(value)).toThrow('signature_encoding');
  }
  const f = fixture();
  f.trust.userPublicKey = f.user.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  expect(() => f.verify()).toThrow('public_key');
  f.trust.userPublicKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
  expect(() => f.verify()).toThrow('key_algorithm');
  const g = fixture(); g.delegation.bot_public_key = f.trust.userPublicKey;
  expect(() => g.verify()).toThrow('key_algorithm');
});

test('canonical payload bytes ignore key order, but reject noncanonical signing bytes and input hooks', () => {
  const f = fixture(), value = f.envelope();
  value.delegation.payload = Object.fromEntries(Object.entries(f.delegation).reverse()) as unknown as ControlDelegation;
  expect(f.verify(value).bot_id).toBe('bot');
  value.delegation.signature = sign(null, Buffer.from(JSON.stringify(value.delegation.payload)), f.user.privateKey).toString('base64');
  expect(() => f.verify(value)).toThrow('signature');
  let called = false;
  const hooked = f.envelope();
  Object.defineProperty(hooked.decision.payload, 'toJSON', { value: () => { called = true; return {}; } });
  expect(() => f.verify(hooked)).toThrow('non_data_field');
  expect(called).toBe(false);
  const accessor = fixture(), access = accessor.envelope();
  Object.defineProperty(access, 'decision', { enumerable: true, get() { called = true; return {}; } });
  expect(() => accessor.verify(access)).toThrow('non_data_field');
  expect(called).toBe(false);
});

test('a valid Bot signature cannot substitute another delegation digest or an envelope trust key', () => {
  const f = fixture(), value = f.envelope();
  value.decision.payload.delegation_sha256 = `sha256:${'f'.repeat(64)}`;
  value.decision = signature(value.decision.payload, f.bot.privateKey);
  expect(() => f.verify(value)).toThrow('decision_subject');
  const valid = f.envelope();
  expect(() => f.verify({ ...valid, userPublicKey: f.trust.userPublicKey })).toThrow('fields');
  expect(() => f.verify({ delegation: valid.decision, decision: valid.delegation })).toThrow();
  expect(() => verifyControlApproval(valid, f.trust, Number.NaN, createReviewAdmission(f.input), repositoryRoot, 0)).toThrow('integer');
  expect(() => verifyControlApproval(valid, f.trust, now, createReviewAdmission(f.input), repositoryRoot, -1)).toThrow('integer');
});
