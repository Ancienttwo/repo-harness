import {
  validateRequiredCheckFailureEvidence,
  type RequiredCheckFailureEvidenceV1,
} from '../evidence/required-check-evidence';
import {
  buildRequiredCheckCoverageEvidence,
  requiredCheckCoverageFailures,
  type RequiredCheckCoverageEvidenceV1,
  type RequiredCheckCoveragePolicyV1,
} from './required-check-coverage';

export type MergeReadinessAttentionOwner = 'agent' | 'user' | 'external';
export type MergeReadinessVerdictAttentionOwner = MergeReadinessAttentionOwner | 'none';

/**
 * This is intentionally a closed vocabulary. A consumer can route every
 * non-ready result without interpreting an untrusted provider error string.
 */
export type MergeReadinessBlockerCode =
  | 'provider_unavailable'
  | 'provider_data_incomplete'
  | 'changed_during_read'
  | 'pr_not_open'
  | 'draft'
  | 'head_moved'
  | 'base_moved_since_verification'
  | 'checks_failed'
  | 'checks_pending'
  | 'changes_requested'
  | 'unresolved_threads'
  | 'not_mergeable'
  | 'already_integrated'
  | 'required_check_coverage_missing'
  | 'required_check_coverage_policy_invalid'
  | 'stack_member'
  | 'stack_depth_exceeded'
  | 'stack_cycle'
  | 'stack_base_pr_missing'
  | 'stack_base_pr_not_open'
  | 'stack_foreign_pr';

export interface MergeReadinessBlockerV1 {
  readonly code: MergeReadinessBlockerCode;
  readonly attention_owner: MergeReadinessAttentionOwner;
  /** Action text for a coverage blocker: the protected path, the check and the fix. Absent for every other code. */
  readonly detail?: string;
}

export type MergeReadinessIntegrationMode = 'unmerged' | 'ancestor' | 'absorbed' | 'unavailable';
export type MergeReadinessObservation = 'stable' | 'changed_during_read' | 'provider_unavailable' | 'provider_data_incomplete';

export type MergeReadinessRollbackBoundary =
  | { readonly status: 'not_active' }
  | { readonly status: 'ready'; readonly pr_number: number; readonly before_sha: string; readonly after_sha: string };

/**
 * The closed stack-chain vocabulary. A member is an open PR whose base is not
 * the repository default branch. The effect follows the baseRefName chain and
 * records every observed edge. A failed chain still reports the edges it
 * proved, and a typed blocker prevents a member verdict from becoming ready.
 */
export type MergeReadinessStackStatus =
  | 'not_member'
  | 'complete'
  | 'depth_exceeded'
  | 'cycle'
  | 'base_pr_missing'
  | 'base_pr_not_open'
  | 'foreign_pr'
  | 'unobserved';

export interface MergeReadinessStackEntryV1 {
  readonly pr_number: number;
  readonly head_ref: string;
  readonly head_sha: string;
  readonly base_ref: string;
  readonly base_sha: string;
}

/**
 * The chain is ordered from the observed PR to the base PR nearest the default
 * branch. The member is chain[0]; depth is the number of observed base edges
 * (chain.length - 1). final_base_sha is the default-branch commit on which the
 * chain would land, and is null until the chain reaches that branch.
 */
export interface MergeReadinessStackDetailV1 {
  readonly member: boolean;
  readonly depth: number;
  readonly chain: readonly MergeReadinessStackEntryV1[];
  readonly final_base_sha: string | null;
  readonly status: MergeReadinessStackStatus;
}

/** The provider check bucket vocabulary; `missing` exists only in the coverage evidence. */
export type RequiredCheckBucketV1 = 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel';

/**
 * The observed coverage rule. `active` carries the provider evidence the
 * projection needs: the PR's changed paths and the all-checks read. The
 * all-checks read is the only view that shows a declared check which branch
 * protection does not require, such as a skipped matrix job.
 */
export type RequiredCheckCoverageFactsV1 =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly message: string }
  | {
    readonly status: 'active';
    readonly policy: RequiredCheckCoveragePolicyV1;
    readonly changed_paths: readonly string[];
    readonly observed_checks: readonly { readonly name: string; readonly bucket: RequiredCheckBucketV1 }[];
  };

export interface ProviderMergeReadinessFactsV1 {
  readonly state: string;
  readonly is_draft: boolean;
  readonly head_sha: string;
  readonly base_sha: string;
  readonly review_decision: string | null;
  readonly unresolved_thread_count: number | null;
  readonly rollback_boundary: MergeReadinessRollbackBoundary | null;
  readonly checks: readonly {
    readonly name: string;
    readonly bucket: RequiredCheckBucketV1;
  }[];
  /** Observed failure history for required checks. Empty when every check passed on its first attempt. */
  readonly check_failures: readonly RequiredCheckFailureEvidenceV1[];
  /** Observed required-check coverage rule; `absent` keeps the pre-#1205 behavior. */
  readonly required_check_coverage: RequiredCheckCoverageFactsV1;
  readonly mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
}

export interface PullRequestMergeReadinessInput {
  readonly expected_head_sha: string;
  readonly expected_base_sha: string;
  readonly integration_mode: MergeReadinessIntegrationMode;
  readonly observation: MergeReadinessObservation;
  readonly provider: ProviderMergeReadinessFactsV1 | null;
  /**
   * Observed chain evidence. The effect supplies it; it is not part of the
   * caller's PR selection. A member is always blocked, whatever its own-base
   * facts say.
   */
  readonly stack: MergeReadinessStackDetailV1;
}

export interface MergeReadinessVerdict {
  readonly ready: boolean;
  /** Expected fences, emitted whether the verdict is ready or blocked. */
  readonly expected_head_sha: string;
  readonly expected_base_sha: string;
  readonly integration_mode: MergeReadinessIntegrationMode;
  readonly attention_owner: MergeReadinessVerdictAttentionOwner;
  readonly blockers: readonly MergeReadinessBlockerV1[];
  /**
   * Evidence only. It never changes `blockers` or `ready`: a same-SHA rerun
   * that passes is `failed_then_passed`, not a proven infrastructure flake and
   * not an automatic pass. The merge decision stays with the publication
   * policy and the observed check buckets.
   */
  readonly check_failures: readonly RequiredCheckFailureEvidenceV1[];
  /**
   * Per-check coverage detail for the declared required checks, or null when
   * the base policy declares no coverage block. The same closed shape is stored
   * in the protocol 4 acceptance record.
   */
  readonly required_check_coverage: RequiredCheckCoverageEvidenceV1 | null;
  /** Observed stacked-PR chain. A non-member has depth 0 and an empty chain. */
  readonly stack: MergeReadinessStackDetailV1;
}

export interface PullRequestSelectionV2 {
  readonly provider_repository_id: string;
  readonly repository: string;
  readonly pr_number: number;
  readonly expected_head_sha: string;
  readonly expected_base_sha: string;
}

export interface PullRequestReadinessV2 extends PullRequestSelectionV2, MergeReadinessVerdict {
  readonly protocol: 2;
  readonly kind: 'repo-harness-pull-request-readiness';
}

const ATTENTION: Readonly<Record<MergeReadinessBlockerCode, MergeReadinessAttentionOwner>> = {
  provider_unavailable: 'external',
  provider_data_incomplete: 'external',
  changed_during_read: 'external',
  pr_not_open: 'agent',
  draft: 'agent',
  head_moved: 'agent',
  base_moved_since_verification: 'agent',
  checks_failed: 'agent',
  checks_pending: 'external',
  changes_requested: 'agent',
  unresolved_threads: 'agent',
  not_mergeable: 'agent',
  already_integrated: 'agent',
  required_check_coverage_missing: 'agent',
  required_check_coverage_policy_invalid: 'agent',
  stack_member: 'agent',
  stack_depth_exceeded: 'agent',
  stack_cycle: 'agent',
  stack_base_pr_missing: 'agent',
  stack_base_pr_not_open: 'agent',
  stack_foreign_pr: 'agent',
};

function push(blockers: MergeReadinessBlockerV1[], code: MergeReadinessBlockerCode, detail?: string): void {
  if (blockers.some((blocker) => blocker.code === code)) return;
  blockers.push(Object.freeze({ code, attention_owner: ATTENTION[code], ...(detail === undefined ? {} : { detail }) }));
}

function verdictAttentionOwner(blockers: readonly MergeReadinessBlockerV1[]): MergeReadinessVerdictAttentionOwner {
  if (blockers.some((blocker) => blocker.attention_owner === 'user')) return 'user';
  if (blockers.some((blocker) => blocker.attention_owner === 'agent')) return 'agent';
  if (blockers.some((blocker) => blocker.attention_owner === 'external')) return 'external';
  return 'none';
}

const STACK_STATUSES = [
  'not_member', 'complete', 'depth_exceeded', 'cycle', 'base_pr_missing', 'base_pr_not_open', 'foreign_pr', 'unobserved',
] as const;

/** Each observed chain failure keeps its own typed blocker. */
const STACK_FAILURE_BLOCKERS: Partial<Record<MergeReadinessStackStatus, MergeReadinessBlockerCode>> = {
  depth_exceeded: 'stack_depth_exceeded',
  cycle: 'stack_cycle',
  base_pr_missing: 'stack_base_pr_missing',
  base_pr_not_open: 'stack_base_pr_not_open',
  foreign_pr: 'stack_foreign_pr',
};

function validSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) && value !== '0'.repeat(40);
}

export function notStackMemberDetail(): MergeReadinessStackDetailV1 {
  return Object.freeze({ member: false, depth: 0, chain: Object.freeze([]), final_base_sha: null, status: 'not_member' });
}

/** A torn or unavailable read proves no chain. The observation blocker fails the verdict closed. */
export function unobservedStackDetail(): MergeReadinessStackDetailV1 {
  return Object.freeze({ member: false, depth: 0, chain: Object.freeze([]), final_base_sha: null, status: 'unobserved' });
}

function stackEntry(value: unknown): MergeReadinessStackEntryV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (!Number.isSafeInteger(entry.pr_number) || Number(entry.pr_number) < 1
    || typeof entry.head_ref !== 'string' || entry.head_ref.trim() === '' || !validSha(entry.head_sha)
    || typeof entry.base_ref !== 'string' || entry.base_ref.trim() === '' || !validSha(entry.base_sha)) return null;
  return Object.freeze({
    pr_number: Number(entry.pr_number), head_ref: entry.head_ref, head_sha: entry.head_sha,
    base_ref: entry.base_ref, base_sha: entry.base_sha,
  });
}

/**
 * The projection accepts chain bytes only as observed evidence. It re-binds the
 * first link to the expected head/base, requires every link to name the next
 * base branch, and rejects a member whose chain does not prove its base edge.
 * A member still cannot become ready, even when the whole chain is valid.
 */
function observedStack(
  value: unknown,
  expectedHeadSha: string,
  expectedBaseSha: string,
): MergeReadinessStackDetailV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const detail = value as Record<string, unknown>;
  const status = detail.status as MergeReadinessStackStatus;
  if (!STACK_STATUSES.includes(status) || typeof detail.member !== 'boolean'
    || !Number.isSafeInteger(detail.depth) || Number(detail.depth) < 0 || !Array.isArray(detail.chain)
    || (detail.final_base_sha !== null && !validSha(detail.final_base_sha))) return null;
  const chain: MergeReadinessStackEntryV1[] = [];
  for (const raw of detail.chain) {
    const entry = stackEntry(raw);
    if (entry === null) return null;
    chain.push(entry);
  }
  const depth = Number(detail.depth);
  const finalBaseSha = detail.final_base_sha as string | null;
  if (!detail.member) {
    if ((status !== 'not_member' && status !== 'unobserved') || depth !== 0 || chain.length !== 0 || finalBaseSha !== null) return null;
    return Object.freeze({ member: false, depth: 0, chain: Object.freeze([]), final_base_sha: null, status });
  }
  if (status === 'not_member' || chain.length === 0 || depth !== chain.length - 1) return null;
  if (chain[0]!.head_sha !== expectedHeadSha || chain[0]!.base_sha !== expectedBaseSha) return null;
  const numbers = new Set<number>();
  const refs = new Set<string>();
  for (const entry of chain) {
    if (numbers.has(entry.pr_number) || refs.has(entry.head_ref)) return null;
    numbers.add(entry.pr_number);
    refs.add(entry.head_ref);
  }
  for (let index = 0; index + 1 < chain.length; index++) {
    if (chain[index]!.base_ref !== chain[index + 1]!.head_ref) return null;
  }
  if (status === 'complete') {
    if (depth < 1 || finalBaseSha === null || finalBaseSha !== chain[chain.length - 1]!.base_sha) return null;
  } else if (finalBaseSha !== null) return null;
  return Object.freeze({ member: true, depth, chain: Object.freeze(chain), final_base_sha: finalBaseSha, status });
}

/**
 * Deterministic projection over already-fenced observations. This function
 * performs no I/O and intentionally emits all applicable blockers in a stable
 * order so output remains usable for routing and tests.
 */
export function projectPullRequestMergeReadiness(input: PullRequestMergeReadinessInput): MergeReadinessVerdict {
  const blockers: MergeReadinessBlockerV1[] = [];
  let requiredCheckCoverage: RequiredCheckCoverageEvidenceV1 | null = null;
  if (input.provider !== null && !Array.isArray(input.provider.check_failures)) push(blockers, 'provider_data_incomplete');
  const coverage = input.provider === null ? null : input.provider.required_check_coverage;
  if (input.provider !== null && (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)
    || !['absent', 'invalid', 'active'].includes(String(coverage.status)))) {
    push(blockers, 'provider_data_incomplete');
  }
  const checkFailures = Array.isArray(input.provider?.check_failures) ? input.provider.check_failures : [];
  for (const failure of checkFailures) {
    try {
      validateRequiredCheckFailureEvidence(failure);
    } catch {
      push(blockers, 'provider_data_incomplete');
      continue;
    }
    if (failure.head_sha !== input.expected_head_sha || failure.base_sha !== input.expected_base_sha) {
      push(blockers, 'provider_data_incomplete');
    }
  }
  if (!validSha(input.expected_head_sha) || !validSha(input.expected_base_sha)) push(blockers, 'provider_data_incomplete');
  let stack = unobservedStackDetail();
  if (input.observation === 'stable') {
    const observed = observedStack(input.stack, input.expected_head_sha, input.expected_base_sha);
    if (observed === null) push(blockers, 'provider_data_incomplete');
    else stack = observed;
  }
  if (stack.member) {
    // Own-base evidence can never make a stack member ready. The member is
    // blocked even when its own checks pass and the chain is complete.
    push(blockers, 'stack_member');
    const failure = STACK_FAILURE_BLOCKERS[stack.status];
    if (failure !== undefined) push(blockers, failure);
  }
  if (input.integration_mode === 'ancestor' || input.integration_mode === 'absorbed') push(blockers, 'already_integrated');
  if (input.integration_mode === 'unavailable') push(blockers, 'provider_data_incomplete');
  if (input.observation === 'provider_unavailable') push(blockers, 'provider_unavailable');
  else if (input.observation === 'provider_data_incomplete') push(blockers, 'provider_data_incomplete');
  else if (input.observation === 'changed_during_read') push(blockers, 'changed_during_read');
  else if (input.provider === null && !stack.member) push(blockers, 'provider_unavailable');
  else if (input.provider !== null) {
    const provider = input.provider;
    if (provider.state !== 'OPEN') push(blockers, 'pr_not_open');
    if (provider.is_draft) push(blockers, 'draft');
    if (provider.head_sha !== input.expected_head_sha) push(blockers, 'head_moved');
    if (provider.base_sha !== input.expected_base_sha) push(blockers, 'base_moved_since_verification');
    const boundary = provider.rollback_boundary;
    if (!boundary || typeof boundary !== 'object' || Array.isArray(boundary)
      || (boundary.status !== 'not_active' && boundary.status !== 'ready')
      || (boundary.status === 'ready' && (!Number.isSafeInteger(boundary.pr_number) || boundary.pr_number < 1
        || !validSha(boundary.before_sha) || !validSha(boundary.after_sha)
        || boundary.before_sha === boundary.after_sha
        || boundary.after_sha !== provider.base_sha || boundary.after_sha !== input.expected_base_sha))) {
      push(blockers, 'provider_data_incomplete');
    }
    // GitHub owns review state; local review, lease and acceptance artifacts do not grant merge permission.
    if (provider.review_decision === 'CHANGES_REQUESTED') push(blockers, 'changes_requested');
    if (!Number.isSafeInteger(provider.unresolved_thread_count) || provider.unresolved_thread_count! < 0) push(blockers, 'provider_data_incomplete');
    else if (provider.unresolved_thread_count! > 0) push(blockers, 'unresolved_threads');
    if (!provider.checks.some(check => check.name === 'Required / CI')) push(blockers, 'provider_data_incomplete');
    if (provider.checks.some(check => check.bucket === 'pending')) push(blockers, 'checks_pending');
    if (provider.checks.some(check => check.bucket !== 'pass' && check.bucket !== 'pending')) push(blockers, 'checks_failed');
    if (provider.mergeable !== 'MERGEABLE') push(blockers, 'not_mergeable');
    if (coverage?.status === 'invalid') {
      push(blockers, 'required_check_coverage_policy_invalid',
        `required-check coverage policy is invalid: ${coverage.message}; fix publication.required_check_coverage in .ai/harness/policy.json on the base branch`);
    } else if (coverage?.status === 'active') {
      requiredCheckCoverage = buildRequiredCheckCoverageEvidence({
        head_sha: provider.head_sha,
        base_sha: provider.base_sha,
        policy: coverage.policy,
        changed_paths: coverage.changed_paths,
        observed_checks: coverage.observed_checks,
      });
      const failures = requiredCheckCoverageFailures(requiredCheckCoverage);
      if (failures.length > 0) {
        push(blockers, 'required_check_coverage_missing', failures.map((failure) => failure.message).join('; '));
      }
    }
  }
  return Object.freeze({
    ready: blockers.length === 0,
    expected_head_sha: input.expected_head_sha,
    expected_base_sha: input.expected_base_sha,
    integration_mode: input.integration_mode,
    attention_owner: verdictAttentionOwner(blockers),
    blockers: Object.freeze(blockers),
    check_failures: Object.freeze([...checkFailures]),
    required_check_coverage: requiredCheckCoverage,
    stack,
  });
}
