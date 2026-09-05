import {
  buildExternalSourceRefreshReceipt,
  buildProviderIssueObservation,
  type ExternalSourceFailureClass,
  type ExternalSourceRefreshReceiptV1,
  type ProviderIssueObservationV1,
} from '../../core/external-sources/issue-observation';
import type { IssueBatchIntentV1 } from '../../core/automation/issue-batch';
import { readCampaignExternalSourcesPolicyAtRevision } from './development-campaign-policy';
import {
  evaluateGithubEligibility,
  fetchGithubIssues,
  GithubAdapterError,
  type GithubCommandRunner,
  type GithubRepositoryIdentityV1,
} from '../external-sources/github';
import { requireManualGithubPolicy } from '../external-sources/policy';
import { writeExternalSourceRefreshReceipt, writeProviderIssueObservation } from '../external-sources/store';
import { execFileSync } from 'child_process';
import { readDevelopmentCampaignStatus } from './development-campaign-store';
import { readStoredProgramAuthorization } from './grant-store';

export type IssueBatchObserverErrorCode =
  | 'issue_provider_unavailable'
  | 'issue_provider_snapshot_incomplete'
  | 'issue_observation_binding_invalid'
  | 'campaign_no_progress'
  | 'source_main_stale'
  | 'campaign_step_invalid';

export class IssueBatchObserverError extends Error {
  constructor(
    readonly code: IssueBatchObserverErrorCode,
    message: string,
    readonly receipt: ExternalSourceRefreshReceiptV1 | null,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'IssueBatchObserverError';
  }
}

export interface ObserveIssueBatchInput {
  readonly repo_root: string;
  readonly intent: IssueBatchIntentV1;
  readonly runner?: GithubCommandRunner;
  readonly now?: () => Date;
  readonly env?: NodeJS.ProcessEnv;
}

export interface IssueBatchObservationSnapshotV1 {
  readonly receipt: ExternalSourceRefreshReceiptV1;
  readonly observations: readonly ProviderIssueObservationV1[];
}

function at(now: () => Date): string { return now().toISOString(); }

export function requireIssueBatchAuthority(input: { readonly repo_root: string; readonly intent: IssueBatchIntentV1; readonly env?: NodeJS.ProcessEnv; readonly now: Date }) {
  const { intent } = input;
  if (input.now.getTime() >= Date.parse(intent.expires_at)) throw new IssueBatchObserverError('campaign_no_progress', 'issue batch intent expired', null);
  let currentMain: string;
  try { currentMain = execFileSync('git', ['rev-parse', '--verify', `${intent.target_ref}^{commit}`], { cwd: input.repo_root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (error) { throw new IssueBatchObserverError('source_main_stale', `cannot resolve issue batch target ref ${intent.target_ref}`, null, error); }
  if (currentMain !== intent.base_main_sha) throw new IssueBatchObserverError('source_main_stale', 'campaign target ref moved after issue authoring intent', null);
  const status = readDevelopmentCampaignStatus(input.repo_root, intent.campaign_id, input.env);
  if (status.current.state !== 'group_preparing') throw new IssueBatchObserverError('campaign_step_invalid', `campaign heartbeat cannot observe from state ${status.current.state}`, null);
  const authorization = readStoredProgramAuthorization(input.repo_root, status.campaign.authorization_sha256, input.env);
  const campaign = authorization.campaign;
  if (campaign === null) throw new IssueBatchObserverError('issue_observation_binding_invalid', 'campaign authorization payload is missing', null);
  const policy = requireManualGithubPolicy(readCampaignExternalSourcesPolicyAtRevision(input.repo_root, status.campaign.target_revision));
  const expectedSlots = Array.from({ length: campaign.issues_per_group }, (_, index) => String(index + 1).padStart(2, '0'));
  const bound = intent.campaign_id === status.campaign.campaign_id
    && intent.campaign_id === campaign.campaign_id
    && intent.repository_id === status.campaign.repository_id && intent.repository_id === authorization.repository_id
    && intent.target_ref === status.campaign.target_ref && intent.target_ref === authorization.target_ref
    && intent.base_main_sha === status.campaign.target_revision && intent.base_main_sha === authorization.target_revision
    && intent.group_number >= 1 && intent.group_number <= campaign.group_count
    && JSON.stringify(intent.slots) === JSON.stringify(expectedSlots)
    && JSON.stringify(intent.allowed_issue_kinds) === JSON.stringify(campaign.allowed_issue_kinds)
    && intent.authoring_parent === campaign.local_parent_host
    && campaign.issue_author === 'gpt_pro'
    && intent.chrome_profile_directory === campaign.chrome_profile_directory
    && intent.expires_at === authorization.expires_at
    && Date.parse(intent.created_at) >= Date.parse(status.campaign.created_at)
    && Date.parse(intent.created_at) >= Date.parse(authorization.issued_at)
    && intent.provider_repository === policy.github.repository
    && intent.authoring_policy_sha256 === policy.policy_revision;
  if (!bound) throw new IssueBatchObserverError('issue_observation_binding_invalid', 'issue batch intent is not fully bound to the sealed campaign authorization', null);
  return Object.freeze({ status, authorization, policy, current_main_sha: currentMain });
}

function failure(error: unknown): {
  readonly failure_class: ExternalSourceFailureClass;
  readonly outcome: 'incomplete' | 'unavailable';
  readonly repository: GithubRepositoryIdentityV1 | null;
  readonly pages_fetched: number;
  readonly issues_seen: number;
  readonly message: string;
} {
  if (error instanceof GithubAdapterError) {
    return {
      failure_class: error.failure_class,
      outcome: error.outcome,
      repository: error.repository,
      pages_fetched: error.pages_fetched,
      issues_seen: error.issues_seen,
      message: error.message,
    };
  }
  return {
    failure_class: 'invalid_response', outcome: 'unavailable', repository: null,
    pages_fetched: 0, issues_seen: 0, message: error instanceof Error ? error.message : String(error),
  };
}

function failedReceipt(input: ObserveIssueBatchInput, startedAt: string, completedAt: string, detail: ReturnType<typeof failure>, policyRevision: string, displayRef: string, limits: ExternalSourceRefreshReceiptV1['limits']): ExternalSourceRefreshReceiptV1 {
  return writeExternalSourceRefreshReceipt(input.repo_root, buildExternalSourceRefreshReceipt({
    registered_repository_id: input.intent.repository_id,
    provider: 'github', provider_host: 'github.com',
    provider_repository_id: detail.repository?.provider_repository_id ?? null,
    provider_display_ref: detail.repository?.display_ref ?? displayRef,
    policy_revision: policyRevision,
    started_at: startedAt, completed_at: completedAt, outcome: detail.outcome,
    pages_fetched: detail.pages_fetched, issues_seen: detail.issues_seen,
    observations_written: 0, limits, source_revisions: [],
    failure: { class: detail.failure_class, message: detail.message },
  }));
}

/**
 * Reads one complete provider snapshot under the policy frozen at the intent's
 * target revision. A policy that selects individual issue numbers cannot prove
 * absence, duplicates, or unexpected issues, so it is never a batch snapshot.
 */
export function observeIssueBatch(input: ObserveIssueBatchInput): IssueBatchObservationSnapshotV1 {
  const now = input.now ?? (() => new Date());
  const startedAt = at(now);
  const { policy } = requireIssueBatchAuthority({ repo_root: input.repo_root, intent: input.intent, env: input.env, now: new Date(startedAt) });
  if (policy.github.selection.kind === 'issue_numbers') {
    const detail = {
      failure_class: 'policy' as const, outcome: 'incomplete' as const, repository: null,
      pages_fetched: 0, issues_seen: 0,
      message: 'issue-number selection is not a complete issue-batch snapshot',
    };
    const receipt = failedReceipt(input, startedAt, at(now), detail, policy.policy_revision, policy.github.repository, policy.github.limits);
    throw new IssueBatchObserverError('issue_provider_snapshot_incomplete', detail.message, receipt);
  }

  try {
    const snapshot = fetchGithubIssues(policy, input.runner);
    const observations = snapshot.issues.map((issue) => {
      const eligibility = evaluateGithubEligibility(issue, policy);
      return writeProviderIssueObservation(input.repo_root, buildProviderIssueObservation({
        registered_repository_id: input.intent.repository_id,
        provider: 'github', provider_host: 'github.com',
        provider_repository_id: snapshot.repository.provider_repository_id,
        provider_issue_id: issue.provider_issue_id,
        display_ref: `${snapshot.repository.display_ref}#${issue.number}`,
        url: issue.url,
        observed_at: at(now), provider_created_at: issue.created_at, provider_updated_at: issue.updated_at,
        state: issue.state, title: issue.title, body: issue.body,
        labels: issue.labels, assignees: issue.assignees, comments_policy: 'omitted',
        policy_revision: policy.policy_revision,
        eligible: eligibility.eligible, eligibility_reasons: eligibility.reasons,
      }));
    });
    const receipt = writeExternalSourceRefreshReceipt(input.repo_root, buildExternalSourceRefreshReceipt({
      registered_repository_id: input.intent.repository_id,
      provider: 'github', provider_host: 'github.com',
      provider_repository_id: snapshot.repository.provider_repository_id,
      provider_display_ref: snapshot.repository.display_ref,
      policy_revision: policy.policy_revision,
      started_at: startedAt, completed_at: at(now), outcome: 'complete',
      pages_fetched: snapshot.pages_fetched, issues_seen: snapshot.issues_seen,
      observations_written: observations.length, limits: policy.github.limits,
      source_revisions: observations.map((entry) => entry.source_revision).sort(), failure: null,
    }));
    return Object.freeze({ receipt, observations: Object.freeze(observations) });
  } catch (error) {
    if (error instanceof IssueBatchObserverError) throw error;
    const detail = failure(error);
    let receipt: ExternalSourceRefreshReceiptV1 | null = null;
    try { receipt = failedReceipt(input, startedAt, at(now), detail, policy.policy_revision, policy.github.repository, policy.github.limits); }
    catch (persistenceError) {
      throw new IssueBatchObserverError('issue_provider_unavailable', `${detail.message}; provider receipt persistence failed`, null, persistenceError);
    }
    const code = detail.outcome === 'incomplete' ? 'issue_provider_snapshot_incomplete' : 'issue_provider_unavailable';
    throw new IssueBatchObserverError(code, detail.message, receipt, error);
  }
}
