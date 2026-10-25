import { observeActiveReviewAdmission } from './issue-goal';
import { readExternalSourcesPolicy } from '../external-sources/policy';

export type ReviewAdmissionSource = Parameters<typeof observeActiveReviewAdmission>[0];

/** CLI identifiers locate an existing protected approval. They never create one
 * or select an authority directory from the candidate or launch environment. */
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
