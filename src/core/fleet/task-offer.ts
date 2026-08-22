/**
 * Read-time task offers for the fleet acquisition boundary.
 *
 * An offer is a capability projection, never task or lease authority.  The
 * canonical sprint owns the row, the lease store owns availability, and the
 * registry owns repository authorization.  This module only combines facts
 * already observed by an effect and applies the closed v1 classification.
 */

import { createHash } from 'crypto';

export const TASK_OFFER_PROTOCOL = 1 as const;
export const TASK_OFFER_KIND = 'repo-harness-task-offer' as const;
export const FLEET_OFFERS_PROTOCOL = 1 as const;
export const FLEET_OFFERS_KIND = 'repo-harness-fleet-offers' as const;

export type TaskOfferExecutionReadiness =
  | 'execution_ready'
  | 'planning_required'
  | 'inline_ready'
  | 'unsupported';

export type TaskOfferSnapshotConsistency = 'stable' | 'changed_during_read';

/**
 * The blocker vocabulary is intentionally closed.  A caller can route every
 * excluded offer without interpreting a free-form diagnostic string.
 */
export type TaskOfferBlockerCode =
  | 'repo_read_only'
  | 'repo_unavailable'
  | 'canonical_unavailable'
  | 'canonical_target_mismatch'
  | 'row_not_pending'
  | 'lease_unavailable'
  | 'lease_unknown'
  | 'snapshot_changed_during_read'
  | 'mode_unsupported'
  | 'plan_missing'
  | 'plan_ambiguous'
  | 'plan_not_approved'
  | 'plan_source_mismatch'
  | 'plan_not_projectable'
  | 'contract_missing'
  | 'contract_not_projectable';

export type TaskOfferAttentionOwner = 'agent' | 'user' | 'external';

export interface TaskOfferBlockerV1 {
  readonly code: TaskOfferBlockerCode;
  readonly attention_owner: TaskOfferAttentionOwner;
}

export interface TaskOfferPlanProofV1 {
  readonly plan_path: string;
  readonly contract_path: string;
  readonly source_ref: string;
  readonly plan_sha256: string;
  readonly contract_sha256: string;
}

/** The row/lease/registry facts consumed by the pure classifier. */
export interface ClassifyTaskOfferInput {
  readonly repo_access_mode: 'read_only' | 'read_write';
  readonly row_status: string;
  readonly mode: string;
  readonly lease_state: 'available' | 'reserving' | 'bound' | 'completing' | 'reviewing' | 'released' | 'unknown';
  readonly snapshot_consistency: TaskOfferSnapshotConsistency;
  readonly plan: TaskOfferPlanProofV1 | null;
  /** Distinguishes an absent plan from a malformed/ambiguous proof. */
  readonly plan_failure?:
    | 'missing'
    | 'ambiguous'
    | 'not_approved'
    | 'source_mismatch'
    | 'not_projectable'
    | 'contract_missing'
    | 'contract_not_projectable';
  readonly canonical_available?: boolean;
}

export interface ClassifyTaskOfferResult {
  readonly execution_readiness: TaskOfferExecutionReadiness;
  readonly blockers: readonly TaskOfferBlockerV1[];
}

export interface TaskOfferV1 {
  readonly protocol: typeof TASK_OFFER_PROTOCOL;
  readonly kind: typeof TASK_OFFER_KIND;
  readonly repo_id: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly sprint_path: string;
  readonly row_order: number;
  readonly execution_readiness: TaskOfferExecutionReadiness;
  readonly snapshot_consistency: TaskOfferSnapshotConsistency;
  readonly blockers: readonly TaskOfferBlockerV1[];
  readonly offer_revision: string;
  readonly authorization_revision: number;
  readonly canonical_target: {
    readonly ref: string;
    readonly oid: string;
  } | null;
  readonly plan: TaskOfferPlanProofV1 | null;
}

export interface FleetOffersV1 {
  readonly protocol: typeof FLEET_OFFERS_PROTOCOL;
  readonly kind: typeof FLEET_OFFERS_KIND;
  readonly authorization_revision: number;
  readonly snapshot_consistency: TaskOfferSnapshotConsistency;
  readonly offer_revision: string;
  readonly offers: readonly TaskOfferV1[];
}

/**
 * Deterministic v1 acquisition selection: the document is already ordered by
 * registry repository and canonical row, so the first eligible offer is the
 * only selection rule.  This helper remains pure; a caller must still
 * revalidate the returned offer before taking any mutation step.
 */
export function selectExecutionReadyOffer(
  document: FleetOffersV1,
  repoId?: string,
): TaskOfferV1 | null {
  return document.offers.find((offer) => (
    offer.execution_readiness === 'execution_ready'
    && offer.snapshot_consistency === 'stable'
    && (repoId === undefined || offer.repo_id === repoId)
  )) ?? null;
}

const BLOCKER_ATTENTION: Readonly<Record<TaskOfferBlockerCode, TaskOfferAttentionOwner>> = {
  repo_read_only: 'user',
  repo_unavailable: 'external',
  canonical_unavailable: 'external',
  canonical_target_mismatch: 'user',
  row_not_pending: 'user',
  lease_unavailable: 'external',
  lease_unknown: 'user',
  snapshot_changed_during_read: 'external',
  mode_unsupported: 'user',
  plan_missing: 'agent',
  plan_ambiguous: 'user',
  plan_not_approved: 'user',
  plan_source_mismatch: 'user',
  plan_not_projectable: 'agent',
  contract_missing: 'agent',
  contract_not_projectable: 'agent',
};

function blocker(code: TaskOfferBlockerCode): TaskOfferBlockerV1 {
  return Object.freeze({ code, attention_owner: BLOCKER_ATTENTION[code] });
}

function uniqueBlockers(codes: readonly TaskOfferBlockerCode[]): readonly TaskOfferBlockerV1[] {
  const seen = new Set<TaskOfferBlockerCode>();
  const result: TaskOfferBlockerV1[] = [];
  for (const code of codes) {
    if (seen.has(code)) continue;
    seen.add(code);
    result.push(blocker(code));
  }
  return Object.freeze(result);
}

function planFailureBlocker(
  failure: ClassifyTaskOfferInput['plan_failure'],
): TaskOfferBlockerCode | null {
  switch (failure) {
    case 'missing': return 'plan_missing';
    case 'ambiguous': return 'plan_ambiguous';
    case 'not_approved': return 'plan_not_approved';
    case 'source_mismatch': return 'plan_source_mismatch';
    case 'not_projectable': return 'plan_not_projectable';
    case 'contract_missing': return 'contract_missing';
    case 'contract_not_projectable': return 'contract_not_projectable';
    default: return null;
  }
}

/**
 * Closed four-way classification.  The order is deliberate: an unavailable
 * row or authorization is never relabelled as a planning opportunity, and an
 * inline row never becomes executable merely because a contract-shaped plan
 * happens to exist beside it.
 */
export function classifyTaskOffer(input: ClassifyTaskOfferInput): ClassifyTaskOfferResult {
  const codes: TaskOfferBlockerCode[] = [];

  if (input.repo_access_mode !== 'read_write') codes.push('repo_read_only');
  if (input.canonical_available === false) codes.push('canonical_unavailable');
  if (input.snapshot_consistency !== 'stable') codes.push('snapshot_changed_during_read');
  if (input.row_status !== '[ ]') codes.push('row_not_pending');

  if (input.lease_state === 'unknown') codes.push('lease_unknown');
  else if (input.lease_state !== 'available') codes.push('lease_unavailable');

  const mode = input.mode.trim().toLowerCase();
  if (mode !== 'contract' && mode !== 'inline') codes.push('mode_unsupported');

  const planFailure = planFailureBlocker(input.plan_failure);
  // Keep all applicable diagnostics on an already unsupported offer.  A
  // planning blocker changes the class only when every execution authority
  // prerequisite is otherwise satisfied.
  if (codes.length > 0 && mode === 'contract' && input.plan === null && planFailure !== null) {
    codes.push(planFailure);
  }

  if (codes.length > 0) {
    return Object.freeze({
      execution_readiness: 'unsupported',
      blockers: uniqueBlockers(codes),
    });
  }

  if (mode === 'inline') {
    return Object.freeze({
      execution_readiness: 'inline_ready',
      blockers: uniqueBlockers([]),
    });
  }

  if (input.plan === null) {
    return Object.freeze({
      execution_readiness: 'planning_required',
      blockers: uniqueBlockers(planFailure === null ? ['plan_missing'] : [planFailure]),
    });
  }

  return Object.freeze({
    execution_readiness: 'execution_ready',
    blockers: uniqueBlockers([]),
  });
}

/** Stable JSON-array digest used by offers and the fleet document. */
export function taskOfferRevision(fields: readonly (string | number | null)[]): string {
  const encoded = JSON.stringify(fields);
  return `sha256:${createHash('sha256').update(encoded, 'utf-8').digest('hex')}`;
}

/** Synchronous SHA-256 is provided by effects; this helper keeps the contract shape pure. */
export function freezeTaskOffer(offer: TaskOfferV1): TaskOfferV1 {
  return Object.freeze({
    ...offer,
    blockers: Object.freeze(offer.blockers.map((entry) => Object.freeze({ ...entry }))),
    canonical_target: offer.canonical_target === null ? null : Object.freeze({ ...offer.canonical_target }),
    plan: offer.plan === null ? null : Object.freeze({ ...offer.plan }),
  });
}
