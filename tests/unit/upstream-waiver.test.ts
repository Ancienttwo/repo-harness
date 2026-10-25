import { afterEach, expect, test } from 'bun:test';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initGitRepo, tmpWorkspace } from '../helpers/repo-fixture';
import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';
import { validateUserWaiverAuthorization, type UserWaiverAuthorization } from '../../src/core/review/acceptance-receipt';
import { recordUserWaiverGrant, verifyUserWaiverGrant, revokeUserWaiverGrant,
  userWaiverGrantPath, runAcceptanceReceiptCli } from '../../src/effects/review/acceptance-receipt';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(userWaiver: 'allowed' | 'forbidden' = 'allowed') {
  const root = tmpWorkspace('upstream-waiver-repo'), home = tmpWorkspace('upstream-waiver-home');
  roots.push(root, home); initGitRepo(root);
  const seeded = seedReviewAdmissionFixture(root, home, { userWaiver, actor: 'executor' });
  const admission = seeded.admission;
  const subject = { repository_root: root, repository_id: admission.repository_id, issue_id: admission.issue_id,
    campaign_id: admission.campaign_id, campaign_sha256: admission.campaign_sha256, admission_sha256: admission.admission_sha256,
    grant_sha256: seeded.grant, goal_sha256: admission.goal.revision, actor: admission.actor_id, summary: 'Human accepted this bounded risk.' };
  const authorization: UserWaiverAuthorization = { protocol: 1, kind: 'repo-harness-upstream-waiver-authorization',
    action: 'human-approved-user-waiver', authorization_ref: 'fixture-separate-human-decision', bot_id: 'fixture-bot',
    ...subject, expires_at: Date.now() + 3_600_000 };
  const args = { root, authorityHome: home, authority: seeded.source, actor: admission.actor_id, summary: subject.summary };
  return { root, home, seeded, subject, authorization, args, path: userWaiverGrantPath(root, home) };
}

test('eligible policy and actor alone cannot grant a waiver; a separate upstream action is required', () => {
  const f = fixture();
  expect(() => recordUserWaiverGrant(f.args)).toThrow('upstream authorization is required');
  expect(existsSync(f.path)).toBe(false);
  const grant = recordUserWaiverGrant({ ...f.args, authorization: f.authorization });
  expect(grant.protocol).toBe(3);
  expect(grant.actor).toBe('executor');
  expect(grant.authorization.authorization_ref).toBe('fixture-separate-human-decision');
  expect(Object.isFrozen(grant.authorization)).toBe(true);
  f.authorization.authorization_ref = 'changed-input';
  expect(verifyUserWaiverGrant(f.args)).toEqual(grant);
  revokeUserWaiverGrant(f.args);
  expect(() => verifyUserWaiverGrant(f.args)).toThrow('UserWaiverGrant is missing');
});

test('upstream waiver cannot bypass forbidden policy or the bound execution actor', () => {
  const forbidden = fixture('forbidden');
  expect(() => recordUserWaiverGrant({ ...forbidden.args, authorization: forbidden.authorization })).toThrow('forbids user waiver');
  const f = fixture();
  expect(() => recordUserWaiverGrant({ ...f.args, actor: 'other', authorization: f.authorization })).toThrow('approved actor');
  expect(() => recordUserWaiverGrant({ ...f.args, authorization: { ...f.authorization, bot_id: 'executor' } })).toThrow('Bot cannot be the execution actor');
});

test('closed waiver requests bind all identities, exact decision text, action and expiry', () => {
  const f = fixture();
  for (const field of Object.keys(f.subject)) {
    expect(() => recordUserWaiverGrant({ ...f.args, authorization: { ...f.authorization, [field]: 'another-value' } })).toThrow();
  }
  for (const changes of [{ action: 'admit' }, { action: 'admit-with-waiver-eligibility' }, { protocol: '1' },
    { authorization_ref: '' }, { expires_at: Date.now() }, { expires_at: String(Date.now() + 1000) },
    { extra: true }, { summary: ['Human accepted this bounded risk.'] }]) {
    expect(() => recordUserWaiverGrant({ ...f.args, authorization: { ...f.authorization, ...changes } })).toThrow();
  }
  expect(existsSync(f.path)).toBe(false);
  let called = false;
  const hooked = { ...f.authorization };
  Object.defineProperty(hooked, 'summary', { enumerable: true, get() { called = true; return f.subject.summary; } });
  expect(() => validateUserWaiverAuthorization(hooked, f.subject, Date.now())).toThrow('plain data');
  expect(called).toBe(false);
});

test('consumption rechecks request expiry, current goal and exact stored grant fields', () => {
  const f = fixture(), grant = recordUserWaiverGrant({ ...f.args, authorization: f.authorization });
  expect(() => verifyUserWaiverGrant({ ...f.args, now: () => new Date(f.authorization.expires_at) })).toThrow('expired');
  for (const change of [{ summary: 'Changed decision' }, { authorization: undefined }, { extra: true }, { protocol: 2 }]) {
    writeFileSync(f.path, JSON.stringify({ ...grant, ...change }));
    expect(() => verifyUserWaiverGrant(f.args)).toThrow();
  }
  writeFileSync(f.path, JSON.stringify(grant));
  expect(verifyUserWaiverGrant(f.args)).toEqual(grant);
  f.seeded.issue.body = 'Changed provider goal';
  expect(() => verifyUserWaiverGrant(f.args)).toThrow('goal_or_actor_changed');
});

test('grant-waiver CLI requires the separate upstream request and consumes its exact subject', async () => {
  const f = fixture(), before = process.cwd();
  const request = join(f.root, 'waiver-request.json');
  writeFileSync(request, JSON.stringify(f.authorization));
  const args = ['grant-waiver', '--actor', 'executor', '--summary', f.subject.summary];
  try {
    process.chdir(f.root);
    await expect(runAcceptanceReceiptCli(args, { authorityHome: f.home, admissionSource: () => f.seeded.source })).rejects.toThrow('--authorization is required');
    expect(existsSync(f.path)).toBe(false);
    expect(await runAcceptanceReceiptCli([...args, '--authorization', request], {
      authorityHome: f.home, admissionSource: () => f.seeded.source,
    })).toBe(0);
    expect(JSON.parse(readFileSync(f.path, 'utf8')).authorization).toEqual(f.authorization);
  } finally { process.chdir(before); }
});
