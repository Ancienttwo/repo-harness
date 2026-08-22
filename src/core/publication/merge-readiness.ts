import type { PublicationReceiptV1 } from './publication-receipt';

/** Read-time protocol only. It is deliberately independent of lease/task digest domains. */
export const MERGE_READINESS_PROTOCOL = 1 as const;
export const MERGE_READINESS_KIND = 'repo-harness-merge-readiness' as const;

export type MergeReadinessAttentionOwner = 'agent' | 'user' | 'external';
export type MergeReadinessVerdictAttentionOwner = MergeReadinessAttentionOwner | 'none';

/**
 * This is intentionally a closed vocabulary. A consumer can route every
 * non-ready result without interpreting an untrusted provider error string.
 */
export type MergeReadinessBlockerCode =
  | 'receipt_unavailable'
  | 'publication_claim_mismatch'
  | 'publication_pointer_mismatch'
  | 'lease_not_reviewing'
  | 'provider_unavailable'
  | 'provider_data_incomplete'
  | 'changed_during_read'
  | 'pr_not_open'
  | 'draft'
  | 'head_moved'
  | 'base_moved_since_verification'
  | 'review_subject_mismatch'
  | 'verification_evidence_stale'
  | 'checks_failed'
  | 'checks_pending'
  | 'acceptance_missing'
  | 'required_reviews_missing'
  | 'changes_requested'
  | 'unresolved_threads'
  | 'not_mergeable'
  | 'task_revision_mismatch'
  | 'already_integrated';

export interface MergeReadinessBlockerV1 {
  readonly code: MergeReadinessBlockerCode;
  readonly attention_owner: MergeReadinessAttentionOwner;
}

export type MergeReadinessIntegrationMode = 'unmerged' | 'ancestor' | 'absorbed' | 'unavailable';
export type MergeReadinessAcceptance = 'pass' | 'not_required' | 'waived' | 'missing';
export type MergeReadinessObservation = 'stable' | 'changed_during_read' | 'provider_unavailable' | 'provider_data_incomplete';

export interface ProviderMergeReadinessFactsV1 {
  readonly state: string;
  readonly is_draft: boolean;
  readonly head_sha: string;
  readonly base_sha: string;
  readonly review_decision: string | null;
  readonly unresolved_thread_count: number;
  readonly checks: readonly {
    readonly bucket: 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel';
  }[];
  readonly mergeable: 'MERGEABLE' | 'CONFLICTING';
}

export interface MergeReadinessInputV1 {
  readonly receipt: PublicationReceiptV1;
  readonly lease_is_reviewing: boolean;
  readonly pointer_matches_receipt: boolean;
  readonly lease_matches_receipt: boolean;
  readonly canonical_task_matches_receipt: boolean;
  /** The local merge-seal proof's head, never the caller cwd's current HEAD. */
  readonly local_proof_head_matches_receipt: boolean;
  readonly review_subject_matches_receipt: boolean;
  readonly verification_evidence_matches_receipt: boolean;
  readonly local_evidence_fresh: boolean;
  readonly acceptance: MergeReadinessAcceptance;
  readonly integration_mode: MergeReadinessIntegrationMode;
  readonly observation: MergeReadinessObservation;
  readonly provider: ProviderMergeReadinessFactsV1 | null;
}

export interface MergeReadinessV1 {
  readonly protocol: typeof MERGE_READINESS_PROTOCOL;
  readonly kind: typeof MERGE_READINESS_KIND;
  readonly publication_id: string;
  readonly ready: boolean;
  /** Immutable receipt fences, emitted whether the verdict is ready or blocked. */
  readonly expected_head_sha: string;
  readonly expected_base_sha: string;
  readonly integration_mode: MergeReadinessIntegrationMode;
  readonly attention_owner: MergeReadinessVerdictAttentionOwner;
  readonly blockers: readonly MergeReadinessBlockerV1[];
}

const ATTENTION: Readonly<Record<MergeReadinessBlockerCode, MergeReadinessAttentionOwner>> = {
  receipt_unavailable: 'user',
  publication_claim_mismatch: 'user',
  publication_pointer_mismatch: 'user',
  lease_not_reviewing: 'user',
  provider_unavailable: 'external',
  provider_data_incomplete: 'external',
  changed_during_read: 'external',
  pr_not_open: 'user',
  draft: 'user',
  head_moved: 'agent',
  base_moved_since_verification: 'user',
  review_subject_mismatch: 'agent',
  verification_evidence_stale: 'agent',
  checks_failed: 'agent',
  checks_pending: 'external',
  acceptance_missing: 'agent',
  required_reviews_missing: 'external',
  changes_requested: 'agent',
  unresolved_threads: 'agent',
  not_mergeable: 'agent',
  task_revision_mismatch: 'agent',
  already_integrated: 'user',
};

function push(blockers: MergeReadinessBlockerV1[], code: MergeReadinessBlockerCode): void {
  if (blockers.some((blocker) => blocker.code === code)) return;
  blockers.push(Object.freeze({ code, attention_owner: ATTENTION[code] }));
}

function verdictAttentionOwner(blockers: readonly MergeReadinessBlockerV1[]): MergeReadinessVerdictAttentionOwner {
  if (blockers.some((blocker) => blocker.attention_owner === 'user')) return 'user';
  if (blockers.some((blocker) => blocker.attention_owner === 'agent')) return 'agent';
  if (blockers.some((blocker) => blocker.attention_owner === 'external')) return 'external';
  return 'none';
}

/**
 * Deterministic projection over already-fenced observations. This function
 * performs no I/O and intentionally emits all applicable blockers in a stable
 * order so output remains usable for routing and tests.
 */
export function projectMergeReadiness(input: MergeReadinessInputV1): MergeReadinessV1 {
  const blockers: MergeReadinessBlockerV1[] = [];
  if (!input.lease_is_reviewing) push(blockers, 'lease_not_reviewing');
  if (!input.pointer_matches_receipt) push(blockers, 'publication_pointer_mismatch');
  if (!input.lease_matches_receipt) push(blockers, 'publication_claim_mismatch');
  if (!input.canonical_task_matches_receipt) push(blockers, 'task_revision_mismatch');
  if (!input.local_proof_head_matches_receipt) push(blockers, 'head_moved');
  if (!input.review_subject_matches_receipt) push(blockers, 'review_subject_mismatch');
  if (!input.verification_evidence_matches_receipt || !input.local_evidence_fresh) push(blockers, 'verification_evidence_stale');
  if (input.acceptance === 'missing') push(blockers, 'acceptance_missing');
  if (input.integration_mode === 'ancestor' || input.integration_mode === 'absorbed') push(blockers, 'already_integrated');
  if (input.integration_mode === 'unavailable') push(blockers, 'provider_data_incomplete');

  if (input.observation === 'provider_unavailable') {
    push(blockers, 'provider_unavailable');
  } else if (input.observation === 'provider_data_incomplete') {
    push(blockers, 'provider_data_incomplete');
  } else if (input.observation === 'changed_during_read') {
    push(blockers, 'changed_during_read');
  } else if (input.provider === null) {
    push(blockers, 'provider_unavailable');
  } else {
    const provider = input.provider;
    if (provider.state !== 'OPEN') push(blockers, 'pr_not_open');
    if (provider.is_draft) push(blockers, 'draft');
    if (provider.head_sha !== input.receipt.head_sha) push(blockers, 'head_moved');
    if (provider.base_sha !== input.receipt.base_sha) push(blockers, 'base_moved_since_verification');
    if (provider.review_decision === 'CHANGES_REQUESTED') push(blockers, 'changes_requested');
    else if (provider.review_decision === 'REVIEW_REQUIRED') push(blockers, 'required_reviews_missing');
    if (provider.unresolved_thread_count > 0) push(blockers, 'unresolved_threads');
    if (provider.checks.some((check) => check.bucket === 'pending')) push(blockers, 'checks_pending');
    if (provider.checks.some((check) => check.bucket !== 'pass' && check.bucket !== 'pending')) push(blockers, 'checks_failed');
    if (provider.mergeable !== 'MERGEABLE') push(blockers, 'not_mergeable');
  }

  return Object.freeze({
    protocol: MERGE_READINESS_PROTOCOL,
    kind: MERGE_READINESS_KIND,
    publication_id: input.receipt.publication_id,
    ready: blockers.length === 0,
    expected_head_sha: input.receipt.head_sha,
    expected_base_sha: input.receipt.base_sha,
    integration_mode: input.integration_mode,
    attention_owner: verdictAttentionOwner(blockers),
    blockers: Object.freeze(blockers),
  });
}
