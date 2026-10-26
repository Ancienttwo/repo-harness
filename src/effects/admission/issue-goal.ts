import { readActiveReviewAdmission, readCurrentReviewAdmissionSelection } from './admission-store';
import { bindReviewAdmission, type ReviewAuthorityInput } from '../../core/review/authority-context';
import { createHash } from 'node:crypto';
import { canonicalize } from '../../core/evidence/canonical-json';
import { fetchGithubIssues, type GithubCommandRunner } from '../github/issues';
import { parseExternalSourcesPolicy, requireManualGithubPolicy, type ExternalSourcesPolicyV1 } from '../github/policy';

/** Read one explicitly selected issue through the existing bounded provider
 * adapter. This observes a goal; it does not grant review or waiver permission.
 * Closed issues can still have unfinished migration work. State is therefore
 * neither acceptance nor authorization here.
 */
export function observeReviewIssueGoal(input: {
  policy: ExternalSourcesPolicyV1;
  repository_id: string;
  issue_id: string;
  runner?: GithubCommandRunner;
}) {
  const policy = requireManualGithubPolicy(input.policy);
  if (policy.github.selection.kind !== 'issue_numbers' || policy.github.selection.issue_numbers.length !== 1) {
    throw new Error('review_goal_requires_one_issue');
  }
  const snapshot = fetchGithubIssues(policy, input.runner);
  const issue = snapshot.issues[0];
  if (snapshot.repository.provider_repository_id !== input.repository_id || snapshot.issues.length !== 1
    || !issue || issue.provider_issue_id !== input.issue_id) throw new Error('review_goal_identity_changed');
  if (!issue.updated_at) throw new Error('review_goal_revision_unavailable');
  // Goal revision is content identity, not issue activity. Comments and labels
  // can change updated_at without changing the approved goal.
  const content = canonicalize({ title: issue.title, body: issue.body });
  const revision = `sha256:${createHash('sha256').update(canonicalize({
    repository_id: input.repository_id, issue_id: input.issue_id,
    content,
  })).digest('hex')}`;
  return Object.freeze({ revision, content });
}

/** The caller supplies an approved grant identity, not its own claim about the
 * current goal. Observe the provider on both sides of the protected read so an
 * edit during admission cannot produce a mixed context.
 */
export function observeActiveReviewAdmission(input: Omit<Parameters<typeof readActiveReviewAdmission>[0], 'expectedGoal'> & {
  issuePolicy: ExternalSourcesPolicyV1;
  runner?: GithubCommandRunner;
}) {
  // Discovery selection is not the approved task locator. Read the locator from
  // the current, validated approval, then freshly observe that exact provider
  // issue. This preliminary read grants no execution authority by itself.
  const selected = readCurrentReviewAdmissionSelection(input);
  if (!selected || selected.expectedGrantSha256 !== input.expectedGrantSha256
    || selected.expectedActor !== input.expectedActor
    || selected.expectedPolicySha256 !== input.expectedPolicySha256) throw new Error('review_admission_revoked_or_replaced');
  const discovery = requireManualGithubPolicy(input.issuePolicy);
  const policy = parseExternalSourcesPolicy({ version: discovery.version, mode: discovery.mode,
    github: { ...discovery.github, selection: { kind: 'issue_numbers', issue_numbers: [selected.issue_number] } } });
  const observe = () => observeReviewIssueGoal({ policy, repository_id: input.repository_id,
    issue_id: input.issue_id, runner: input.runner });
  const before = observe();
  const result = readActiveReviewAdmission({ ...input, expectedGoal: before });
  const after = observe();
  if (after.revision !== before.revision || after.content !== before.content) throw new Error('review_goal_changed_during_read');
  const current = readActiveReviewAdmission({ ...input, expectedGoal: after });
  if (current.revision !== result.revision) throw new Error('review_admission_changed_during_read');
  return current;
}

export function observeAdmittedReviewContext(input: Parameters<typeof observeActiveReviewAdmission>[0] & {
  round: Pick<ReviewAuthorityInput, 'subject' | 'verification'>;
}) {
  const { round, ...source } = input;
  const active = observeActiveReviewAdmission(source);
  return { admission: active.admission, revision: active.revision,
    context: bindReviewAdmission(active.admission, round, active.grant_sha256) };
}
