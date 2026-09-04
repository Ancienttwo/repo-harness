import { createHash } from 'crypto';

export const LEASE_LIVENESS_PROTOCOL = 1 as const;
export const LEASE_LIVENESS_POLICY_KIND = 'repo-harness-lease-liveness-policy' as const;
export const LEASE_RENEWAL_KIND = 'repo-harness-lease-renewal-observation' as const;
export const LEASE_LIVENESS_CURRENT_KIND = 'repo-harness-lease-liveness-current' as const;
export const LEASE_RECLAIM_ELIGIBILITY_KIND = 'repo-harness-lease-reclaim-eligibility' as const;

export type LeaseRenewalActorKind = 'controller' | 'host' | 'operator';
export type LeaseLivenessClassification = 'live' | 'expired_but_effect_active' | 'reclaimable' | 'liveness_unproven' | 'publication_recovery_required';

export interface LeaseLivenessPolicyV1 {
  readonly protocol: 1;
  readonly kind: typeof LEASE_LIVENESS_POLICY_KIND;
  readonly renewal_interval_ms: number;
  readonly maximum_ttl_ms: number;
  readonly renewal_actor_kind: LeaseRenewalActorKind;
  readonly required_evidence_sources: readonly ('controller' | 'runtime_effect' | 'publication' | 'binding')[];
  readonly unproven_behavior: 'require_attention';
  readonly policy_sha256: string;
}

export interface LeaseRenewalObservationV1 {
  readonly protocol: 1;
  readonly kind: typeof LEASE_RENEWAL_KIND;
  readonly task_id: string;
  readonly task_revision: string;
  readonly claim_id: string;
  readonly lease_generation: number;
  readonly owner_id: string;
  readonly execution_worktree: string | null;
  readonly branch: string | null;
  readonly sequence: number;
  readonly observed_at: string;
  readonly expires_at: string;
  readonly binding_generation: number | null;
  readonly runtime_effect_id: string | null;
  readonly previous_renewal_sha256: string | null;
  readonly policy_sha256: string;
  readonly renewal_sha256: string;
}

export interface LeaseLivenessCurrentV1 {
  readonly protocol: 1;
  readonly kind: typeof LEASE_LIVENESS_CURRENT_KIND;
  readonly task_id: string;
  readonly claim_id: string;
  readonly lease_generation: number;
  readonly policy_sha256: string;
  readonly sequence: number;
  readonly last_renewal_sha256: string;
  readonly last_renewed_at: string;
  readonly expires_at: string;
  readonly current_sha256: string;
}

export interface LeaseReclaimEvidenceV1 {
  readonly controller_terminal: boolean | null;
  readonly runtime_effect_inactive: boolean | null;
  readonly publication_inactive: boolean | null;
  readonly binding_generation_matches: boolean | null;
  readonly claim_actor_matches: boolean | null;
  readonly evidence_revision: string;
}

export interface LeaseReclaimEligibilityReceiptV1 {
  readonly protocol: 1;
  readonly kind: typeof LEASE_RECLAIM_ELIGIBILITY_KIND;
  readonly task_id: string;
  readonly task_revision: string;
  readonly claim_id: string;
  readonly lease_generation: number;
  readonly policy_sha256: string;
  readonly renewal_sha256: string;
  readonly expires_at: string;
  readonly classified_at: string;
  readonly classification: LeaseLivenessClassification;
  readonly attention_owner: 'none' | 'operator';
  readonly evidence: LeaseReclaimEvidenceV1;
  readonly receipt_sha256: string;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}
function integer(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
}
function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value); if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`${name} must be a canonical ISO timestamp`); return parsed;
}
function sha(value: string, name: string): void { if (!/^sha256:[0-9a-f]{64}$/u.test(value)) throw new Error(`${name} must be sha256`); }

export function buildLeaseLivenessPolicy(input: Omit<LeaseLivenessPolicyV1, 'protocol' | 'kind' | 'policy_sha256'>): LeaseLivenessPolicyV1 {
  integer(input.renewal_interval_ms, 1_000, 3_600_000, 'renewal_interval_ms');
  integer(input.maximum_ttl_ms, input.renewal_interval_ms, 86_400_000, 'maximum_ttl_ms');
  if (!['controller', 'host', 'operator'].includes(input.renewal_actor_kind)) throw new Error('invalid renewal_actor_kind');
  if (input.unproven_behavior !== 'require_attention') throw new Error('unproven liveness must require attention');
  const sources = [...input.required_evidence_sources];
  if (sources.length === 0 || new Set(sources).size !== sources.length || sources.some((source) => !['controller', 'runtime_effect', 'publication', 'binding'].includes(source))) throw new Error('required_evidence_sources must be a non-empty unique closed set');
  const body = { protocol: LEASE_LIVENESS_PROTOCOL, kind: LEASE_LIVENESS_POLICY_KIND, renewal_interval_ms: input.renewal_interval_ms, maximum_ttl_ms: input.maximum_ttl_ms, renewal_actor_kind: input.renewal_actor_kind, required_evidence_sources: sources, unproven_behavior: input.unproven_behavior } as const;
  return Object.freeze({ ...body, policy_sha256: digest(body) });
}

export interface BuildLeaseRenewalInput {
  readonly policy: LeaseLivenessPolicyV1;
  readonly task_id: string; readonly task_revision: string; readonly claim_id: string; readonly lease_generation: number;
  readonly owner_id: string; readonly execution_worktree: string | null; readonly branch: string | null;
  readonly observed_at: string; readonly requested_ttl_ms: number; readonly binding_generation: number | null; readonly runtime_effect_id: string | null;
  readonly previous: LeaseRenewalObservationV1 | null;
}

export function buildLeaseRenewalObservation(input: BuildLeaseRenewalInput): LeaseRenewalObservationV1 {
  const observed = timestamp(input.observed_at, 'observed_at'); integer(input.requested_ttl_ms, input.policy.renewal_interval_ms, input.policy.maximum_ttl_ms, 'requested_ttl_ms');
  integer(input.lease_generation, 1, Number.MAX_SAFE_INTEGER, 'lease_generation');
  if (input.previous && (input.previous.task_id !== input.task_id || input.previous.claim_id !== input.claim_id || input.previous.lease_generation !== input.lease_generation || input.previous.policy_sha256 !== input.policy.policy_sha256)) throw new Error('previous renewal belongs to another lease authority');
  const body = { protocol: LEASE_LIVENESS_PROTOCOL, kind: LEASE_RENEWAL_KIND, task_id: input.task_id, task_revision: input.task_revision, claim_id: input.claim_id, lease_generation: input.lease_generation, owner_id: input.owner_id, execution_worktree: input.execution_worktree, branch: input.branch, sequence: (input.previous?.sequence ?? 0) + 1, observed_at: input.observed_at, expires_at: new Date(observed + input.requested_ttl_ms).toISOString(), binding_generation: input.binding_generation, runtime_effect_id: input.runtime_effect_id, previous_renewal_sha256: input.previous?.renewal_sha256 ?? null, policy_sha256: input.policy.policy_sha256 } as const;
  return Object.freeze({ ...body, renewal_sha256: digest(body) });
}

export function foldLeaseLivenessCurrent(observation: LeaseRenewalObservationV1): LeaseLivenessCurrentV1 {
  const body = { protocol: LEASE_LIVENESS_PROTOCOL, kind: LEASE_LIVENESS_CURRENT_KIND, task_id: observation.task_id, claim_id: observation.claim_id, lease_generation: observation.lease_generation, policy_sha256: observation.policy_sha256, sequence: observation.sequence, last_renewal_sha256: observation.renewal_sha256, last_renewed_at: observation.observed_at, expires_at: observation.expires_at } as const;
  return Object.freeze({ ...body, current_sha256: digest(body) });
}

export function classifyLeaseReclaim(input: { readonly renewal: LeaseRenewalObservationV1; readonly task_revision: string; readonly classified_at: string; readonly evidence: LeaseReclaimEvidenceV1; readonly publication_state: 'inactive' | 'completing' | 'reviewing' }): LeaseReclaimEligibilityReceiptV1 {
  const expired = timestamp(input.classified_at, 'classified_at') >= timestamp(input.renewal.expires_at, 'expires_at');
  const values = [input.evidence.controller_terminal, input.evidence.runtime_effect_inactive, input.evidence.publication_inactive, input.evidence.binding_generation_matches, input.evidence.claim_actor_matches];
  let classification: LeaseLivenessClassification;
  if (!expired) classification = 'live';
  else if (input.publication_state !== 'inactive') classification = 'publication_recovery_required';
  else if (input.evidence.runtime_effect_inactive === false || input.evidence.controller_terminal === false) classification = 'expired_but_effect_active';
  else if (values.some((value) => value === null)) classification = 'liveness_unproven';
  else if (values.every((value) => value === true)) classification = 'reclaimable';
  else classification = 'liveness_unproven';
  sha(input.evidence.evidence_revision, 'evidence_revision');
  const body = { protocol: LEASE_LIVENESS_PROTOCOL, kind: LEASE_RECLAIM_ELIGIBILITY_KIND, task_id: input.renewal.task_id, task_revision: input.task_revision, claim_id: input.renewal.claim_id, lease_generation: input.renewal.lease_generation, policy_sha256: input.renewal.policy_sha256, renewal_sha256: input.renewal.renewal_sha256, expires_at: input.renewal.expires_at, classified_at: input.classified_at, classification, attention_owner: classification === 'live' || classification === 'reclaimable' ? 'none' : 'operator', evidence: input.evidence } as const;
  return Object.freeze({ ...body, receipt_sha256: digest(body) });
}

export function assertReclaimReceiptCurrent(receipt: LeaseReclaimEligibilityReceiptV1, input: { readonly task_revision: string; readonly claim_id: string; readonly lease_generation: number; readonly renewal_sha256: string; readonly evidence_revision: string }): void {
  if (receipt.classification !== 'reclaimable' || receipt.task_revision !== input.task_revision || receipt.claim_id !== input.claim_id || receipt.lease_generation !== input.lease_generation || receipt.renewal_sha256 !== input.renewal_sha256 || receipt.evidence.evidence_revision !== input.evidence_revision) throw new Error('lease reclaim eligibility receipt is stale or not reclaimable');
}
