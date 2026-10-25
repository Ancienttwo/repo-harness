import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize } from '../../src/core/evidence/canonical-json';
import type { JsonValue } from '../../src/core/evidence/types';
import type { ReviewAdmission } from '../../src/core/review/authority-context';
const keys = new Map<string, { privateKey: KeyObject; publicKey: KeyObject }>();
/** Synthetic host trust and explicit human approval. No production credentials,
 * network authorization, or Bot delegation is implied by this test fixture. */
export function signedHumanAdmissionFixture(home: string, root: string, admission: ReviewAdmission, revision: number) {
  home = realpathSync(home); root = realpathSync(root);
  let key = keys.get(home);
  if (!key) { key = generateKeyPairSync('ed25519'); keys.set(home, key); }
  mkdirSync(join(home, '.repo-harness'), { recursive: true, mode: 0o700 });
  writeFileSync(join(home, '.repo-harness/control-trust.json'), JSON.stringify({ protocol: 1,
    user_public_key: key.publicKey.export({ format: 'pem', type: 'spki' }), revoked_delegation_ids: [] }), { mode: 0o600 });
  const payload = { protocol: 1, kind: 'repo-harness-human-admission', admission_sha256: admission.admission_sha256,
    repository_root: root, expected_revision: revision, expires_at: Date.now() + 3_600_000 };
  return { human_approval: { payload, signature: sign(null, Buffer.from(canonicalize(payload as JsonValue)), key.privateKey).toString('base64') } };
}

export function signedBotAdmissionFixture(home: string, root: string, admission: ReviewAdmission, revision: number) {
  signedHumanAdmissionFixture(home, root, admission, revision);
  const user = keys.get(realpathSync(home))!, bot = generateKeyPairSync('ed25519');
  const delegation = { protocol: 1, kind: 'repo-harness-control-delegation', id: 'fixture-delegation', user_id: 'fixture-user',
    bot_id: 'fixture-bot', bot_public_key: bot.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    repository_id: admission.repository_id, issue_ids: [admission.issue_id], allowed_paths: [...admission.allowed_paths],
    policy: { ...admission.policy }, benchmark: admission.benchmark,
    not_before: Date.now() - 1000, expires_at: Date.now() + 3_600_000 };
  const delegation_sha256 = `sha256:${createHash('sha256').update(canonicalize(delegation as JsonValue)).digest('hex')}`;
  const decision = { protocol: 1, kind: 'repo-harness-control-approval', delegation_sha256,
    admission_sha256: admission.admission_sha256, repository_root: realpathSync(root), expected_revision: revision,
    expires_at: delegation.expires_at };
  const signed = (payload: unknown, key: KeyObject) => ({ payload,
    signature: sign(null, Buffer.from(canonicalize(payload as JsonValue)), key).toString('base64') });
  return { delegation: signed(delegation, user.privateKey), decision: signed(decision, bot.privateKey) };
}

export function signHumanFixturePayload(home: string, payload: unknown) {
  const key = keys.get(realpathSync(home));
  if (!key) throw new Error('fixture control trust is not initialized');
  return { payload, signature: sign(null, Buffer.from(canonicalize(payload as JsonValue)), key.privateKey).toString('base64') };
}
