import { controlApprovalFixture } from './control-approval-fixture';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize } from '../../src/core/evidence/canonical-json';
import type { JsonValue } from '../../src/core/evidence/types';
import { createReviewAdmission, type ReviewAdmissionInput } from '../../src/core/review/authority-context';
import { gatesDirectoryName } from '../../src/effects/git/repository-identity';
import { parseExternalSourcesPolicy } from '../../src/effects/external-sources/policy';
import { observeReviewIssueGoal } from '../../src/effects/review/issue-goal';
import type { ReviewAdmissionSource } from '../../src/effects/review/admission-source';

/** Explicit synthetic approval fixture. This writes real account-owned record bytes;
 * it does not exercise operator approval or a live GitHub endpoint. */
export function seedReviewAdmissionFixture(root: string, home: string, options: {
  repositoryId?: string; issueId?: string;
  plan?: ReviewAdmissionInput['verification_plan']; oracles?: ReviewAdmissionInput['oracles'];
  benchmark?: ReviewAdmissionInput['benchmark']; allowedPaths?: string[]; campaignId?: string;
  reviewer?: 'Codex' | 'Claude'; userWaiver?: 'allowed' | 'forbidden'; actor?: string;
} = {}) {
  root = realpathSync(root); home = realpathSync(home);
  const hash = (bytes: string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const policy = parseExternalSourcesPolicy({ version: 1, mode: 'manual', github: { enabled: true,
    repository: 'acme/widgets', selection: { kind: 'issue_numbers', issue_numbers: [903] },
    limits: { max_pages: 1, max_issues: 1, max_body_bytes: 4096, max_total_bytes: 8192, deadline_ms: 5000 } } });
  const issue = { id: options.issueId ?? 'I_903', number: 903, html_url: 'https://github.com/acme/widgets/issues/903', state: 'open',
    title: 'Preserve behavior', body: 'Migrate review authority.', updated_at: '2026-10-25T00:00:00Z' };
  const repo = { id: options.repositoryId ?? 'R_provider', node_id: 'R_provider', full_name: 'acme/widgets', html_url: 'https://github.com/acme/widgets' };
  const runner: ReviewAdmissionSource['runner'] = args => ({ stdout: JSON.stringify(args.includes('repos/acme/widgets/issues/903') ? issue : repo) });
  const goal = observeReviewIssueGoal({ policy, repository_id: repo.id, issue_id: issue.id, runner });
  const admission = createReviewAdmission({ repository_id: repo.id, issue_id: issue.id, campaign_id: options.campaignId ?? 'review',
    actor_id: options.actor ?? 'U_owner', goal, policy: { reviewer: options.reviewer ?? 'Codex', user_waiver: options.userWaiver ?? 'forbidden', policy_sha256: hash('fixture-approved-policy') },
    allowed_paths: options.allowedPaths ?? ['*'], benchmark: options.benchmark ?? 'not_required',
    oracles: options.oracles ?? [{ id: 'deterministic', kind: 'deterministic_test', paths: ['*'] }],
    verification_plan: options.plan ?? { protocol: 1, checks: [{ id: 'behavior', kind: 'command', command: 'true', cwd: '.', phase: 'verification',
      cost: 'normal', evidence_policy: 'current_exact', necessity: 'Check behavior.', inputs: { env: [] } }] } });
  const directory = join(home, '.repo-harness', 'gates', gatesDirectoryName(root), 'review-admissions', admission.campaign_sha256.slice(7));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const active = join(directory, 'active.json');
  const revision = existsSync(active) ? JSON.parse(readFileSync(active, 'utf8')).revision + 1 : 1;
  const content = canonicalize({ protocol: 3, kind: 'repo-harness-review-approval', repository_root: root,
    actor_id: admission.actor_id, activation_id: randomUUID(), admission,
    control_approval: controlApprovalFixture(root, admission, revision - 1,
      admission.policy.user_waiver === 'allowed' ? 'admit-with-waiver-eligibility' : 'admit') } as unknown as JsonValue) + '\n';
  const grant = hash(content);
  writeFileSync(join(directory, `${grant.slice(7)}.json`), content, { mode: 0o600 });
  writeFileSync(active, JSON.stringify({ protocol: 1, revision, grant_sha256: grant }), { mode: 0o600 });
  const source: ReviewAdmissionSource = { repoRoot: root, authorityHome: home, repository_id: repo.id, issue_id: issue.id,
    campaign_id: admission.campaign_id, expectedGrantSha256: grant, expectedPolicySha256: admission.policy.policy_sha256,
    expectedActor: admission.actor_id, issuePolicy: policy, runner };
  return { source, admission, directory, grant, issue, policy };
}
