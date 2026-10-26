import { readCurrentReviewAdmissionSelection } from './admission-store';
import { observeActiveReviewAdmission } from './issue-goal';
import { parseExternalSourcesPolicy, requireManualGithubPolicy, readExternalSourcesPolicy } from '../github/policy';

export type ReviewAdmissionSource = Parameters<typeof observeActiveReviewAdmission>[0];

/** CLI identifiers locate an existing protected approval. They never create one
 * or select an authority directory from the candidate or launch environment.
 * The observer obtains the exact issue number from the approved record; this
 * policy remains repository-wide discovery configuration, not a task selector. */
export function readReviewAdmissionSource(repoRoot: string, values: Readonly<Record<string, string | undefined>>): ReviewAdmissionSource {
  if (values.contract !== undefined) throw new Error('--contract is retired; select an approved review campaign');
  const required = (key: string) => {
    const value = values[key];
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error(`--${key} is required`);
    return value;
  };
  return { repoRoot, repository_id: required('repository-id'), issue_id: required('issue-id'),
    campaign_id: required('campaign-id'), expectedGrantSha256: required('grant-sha256'),
    expectedPolicySha256: required('policy-sha256'), expectedActor: required('actor'),
    issuePolicy: readExternalSourcesPolicy(repoRoot) };
}

/** Scope a provider lookup hint to one explicitly associated issue. The fresh
 * observer still verifies the repository ID, issue ID, goal and protected grant.
 * Repository-wide discovery selection is not an admission selector. */
export function readReviewAdmissionSourceForIssue(repoRoot: string,
  values: Readonly<Record<string, string | undefined>>, issueNumber: number): ReviewAdmissionSource {
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) throw new Error('review_issue_number_invalid');
  const source = readReviewAdmissionSource(repoRoot, values);
  const policy = requireManualGithubPolicy(source.issuePolicy);
  return { ...source, issuePolicy: parseExternalSourcesPolicy({ version: policy.version, mode: policy.mode,
    github: { ...policy.github, selection: { kind: 'issue_numbers', issue_numbers: [issueNumber] } } }) };
}

/** Protected active selection plus a fresh provider check; never launch-time approval. */
export function readCurrentReviewAdmissionSource(input: Pick<ReviewAdmissionSource, 'repoRoot' | 'repository_id' | 'issue_id' | 'campaign_id'>,
  trusted: Pick<ReviewAdmissionSource, 'authorityHome' | 'runner'> = {}): ReviewAdmissionSource | null {
  const selected = readCurrentReviewAdmissionSelection({ ...input, ...trusted });
  if (!selected) return null;
  const source = { ...input, ...trusted, ...selected, issuePolicy: readExternalSourcesPolicy(input.repoRoot) };
  observeActiveReviewAdmission(source);
  return source;
}
