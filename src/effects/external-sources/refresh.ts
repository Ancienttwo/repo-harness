import {
  buildExternalSourceRefreshReceipt,
  buildProviderIssueObservation,
  type ExternalSourceFailureClass,
  type ExternalSourceRefreshReceiptV1,
} from '../../core/external-sources/issue-observation';
import { buildExternalSourceProjection, type ExternalSourceProjectionV1 } from '../../core/external-sources/projection';
import {
  evaluateGithubEligibility,
  fetchGithubIssues,
  GithubAdapterError,
  type GithubCommandRunner,
  type GithubRepositoryIdentityV1,
} from './github';
import { requireManualGithubPolicy, type ExternalSourcesPolicyV1 } from './policy';
import {
  listExternalSourceRefreshReceipts,
  listProviderIssueObservations,
  writeExternalSourceRefreshReceipt,
  writeProviderIssueObservation,
  type ExternalSourceStoreError,
} from './store';

export class ExternalSourceRefreshError extends Error {
  constructor(
    readonly code: 'external_source_refresh_failed',
    message: string,
    readonly receipt: ExternalSourceRefreshReceiptV1 | null,
  ) {
    super(message);
    this.name = 'ExternalSourceRefreshError';
  }
}

export interface ExternalSourceRefreshResultV1 {
  readonly receipt: ExternalSourceRefreshReceiptV1;
  readonly projection: ExternalSourceProjectionV1;
}

function timestamp(now: () => Date): string {
  return now().toISOString();
}

function failureOf(error: unknown): { readonly class: ExternalSourceFailureClass; readonly message: string; readonly outcome: 'incomplete' | 'unavailable'; readonly repository: GithubRepositoryIdentityV1 | null; readonly pages: number; readonly issues: number } {
  if (error instanceof GithubAdapterError) {
    return { class: error.failure_class, message: error.message, outcome: error.outcome, repository: error.repository, pages: error.pages_fetched, issues: error.issues_seen };
  }
  const code = (error as ExternalSourceStoreError | undefined)?.code;
  if (code?.startsWith('external_source_store_')) {
    return { class: 'persistence', message: error instanceof Error ? error.message : String(error), outcome: 'unavailable', repository: null, pages: 0, issues: 0 };
  }
  return { class: 'invalid_response', message: error instanceof Error ? error.message : String(error), outcome: 'unavailable', repository: null, pages: 0, issues: 0 };
}

function projection(repoRoot: string, registeredRepositoryId: string): ExternalSourceProjectionV1 {
  return buildExternalSourceProjection({
    registered_repository_id: registeredRepositoryId,
    observations: listProviderIssueObservations(repoRoot),
    receipts: listExternalSourceRefreshReceipts(repoRoot),
  });
}

/** One explicit provider attempt. This never creates a Task, Claim, Lease, or runtime effect. */
export function refreshExternalSource(input: {
  readonly repo_root: string;
  readonly registered_repository_id: string;
  readonly policy: ExternalSourcesPolicyV1;
  readonly runner?: GithubCommandRunner;
  readonly now?: () => Date;
}): ExternalSourceRefreshResultV1 {
  const now = input.now ?? (() => new Date());
  const startedAt = timestamp(now);
  const policy = requireManualGithubPolicy(input.policy);
  let identity: GithubRepositoryIdentityV1 | null = null;
  let pages = 0;
  let issuesSeen = 0;
  try {
    const fetched = fetchGithubIssues(policy, input.runner);
    identity = fetched.repository;
    pages = fetched.pages_fetched;
    issuesSeen = fetched.issues_seen;
    const observations = fetched.issues.map((issue) => {
      const eligibility = evaluateGithubEligibility(issue, policy);
      return buildProviderIssueObservation({
        registered_repository_id: input.registered_repository_id,
        provider: 'github',
        provider_host: 'github.com',
        provider_repository_id: fetched.repository.provider_repository_id,
        provider_issue_id: issue.provider_issue_id,
        display_ref: `${fetched.repository.display_ref}#${issue.number}`,
        url: issue.url,
        observed_at: timestamp(now),
        provider_created_at: issue.created_at,
        provider_updated_at: issue.updated_at,
        state: issue.state,
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
        assignees: issue.assignees,
        comments_policy: 'omitted',
        policy_revision: policy.policy_revision,
        eligible: eligibility.eligible,
        eligibility_reasons: eligibility.reasons,
      });
    });
    for (const observation of observations) writeProviderIssueObservation(input.repo_root, observation);
    const receipt = writeExternalSourceRefreshReceipt(input.repo_root, buildExternalSourceRefreshReceipt({
      registered_repository_id: input.registered_repository_id,
      provider: 'github',
      provider_host: 'github.com',
      provider_repository_id: fetched.repository.provider_repository_id,
      provider_display_ref: fetched.repository.display_ref,
      policy_revision: policy.policy_revision,
      started_at: startedAt,
      completed_at: timestamp(now),
      outcome: 'complete',
      pages_fetched: fetched.pages_fetched,
      issues_seen: fetched.issues_seen,
      observations_written: observations.length,
      limits: policy.github.limits,
      source_revisions: observations.map((observation) => observation.source_revision).sort(),
      failure: null,
    }));
    return Object.freeze({ receipt, projection: projection(input.repo_root, input.registered_repository_id) });
  } catch (error) {
    const failure = failureOf(error);
    identity = failure.repository ?? identity;
    pages = failure.pages || pages;
    issuesSeen = failure.issues || issuesSeen;
    let receipt: ExternalSourceRefreshReceiptV1 | null = null;
    try {
      receipt = writeExternalSourceRefreshReceipt(input.repo_root, buildExternalSourceRefreshReceipt({
        registered_repository_id: input.registered_repository_id,
        provider: 'github',
        provider_host: 'github.com',
        provider_repository_id: identity?.provider_repository_id ?? null,
        provider_display_ref: identity?.display_ref ?? policy.github.repository,
        policy_revision: policy.policy_revision,
        started_at: startedAt,
        completed_at: timestamp(now),
        outcome: failure.outcome,
        pages_fetched: pages,
        issues_seen: issuesSeen,
        observations_written: 0,
        limits: policy.github.limits,
        source_revisions: [],
        failure: { class: failure.class, message: failure.message },
      }));
    } catch (receiptError) {
      throw new ExternalSourceRefreshError('external_source_refresh_failed', `${failure.message}; cannot persist refresh receipt: ${receiptError instanceof Error ? receiptError.message : String(receiptError)}`, null);
    }
    throw new ExternalSourceRefreshError('external_source_refresh_failed', failure.message, receipt);
  }
}

export function listExternalSourceProjection(repoRoot: string, registeredRepositoryId: string): ExternalSourceProjectionV1 {
  return projection(repoRoot, registeredRepositoryId);
}
