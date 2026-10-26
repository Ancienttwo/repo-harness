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
