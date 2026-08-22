/**
 * Pure publication lifecycle contracts. Receipt identity is immutable; the
 * lease pointer below is the separate, mutable authority that says which
 * receipt is current for execution.
 */
import {
  publicationReceiptDigest,
  publicationSha256,
  stablePublicationJson,
  type PublicationReceiptV1,
} from './publication-receipt';
import { TASK_DIGEST_PATTERN, type CurrentPublicationPointerV1 } from '../state/coordination-identity';

export const PUBLICATION_LINEAGE_PROTOCOL = 1 as const;
export const PUBLICATION_LINEAGE_KIND = 'repo-harness-publication-lineage' as const;
export const PUBLICATION_INTEGRATION_OBSERVATION_PROTOCOL = 1 as const;
export const PUBLICATION_INTEGRATION_OBSERVATION_KIND = 'repo-harness-publication-integration-observation' as const;

export type PublicationLifecycleErrorCode =
  | 'publication_incomplete'
  | 'publication_claim_mismatch'
  | 'publication_pointer_mismatch'
  | 'worktree_missing'
  | 'head_moved'
  | 'task_revision_mismatch'
  | 'legacy_confirmation_required'
  | 'legacy_unattributable'
  | 'canonical_row_incomplete'
  | 'integration_unproven'
  | 'closed_unmerged'
  | 'provider_unavailable'
  | 'publication_head_unavailable'
  | 'recovery_confirmation_required';

export class PublicationLifecycleError extends Error {
  constructor(
    readonly code: PublicationLifecycleErrorCode,
    message: string,
    readonly cause?: unknown,
    readonly details?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = 'PublicationLifecycleError';
  }
}

export interface PublicationLineageV1 {
  readonly protocol: typeof PUBLICATION_LINEAGE_PROTOCOL;
  readonly kind: typeof PUBLICATION_LINEAGE_KIND;
  readonly publication_id: string;
  readonly task_id: string;
  readonly claim_id: string;
  readonly generation: number;
  readonly receipt_sha256: string;
  readonly head_sha: string;
  readonly ship_transaction_key: string;
  readonly reason: string;
}

/**
 * A single immutable close-out observation. It is audit evidence only: the
 * reviewing lease pointer remains the sole current-publication authority.
 */
export interface PublicationIntegrationObservationV1 {
  readonly protocol: typeof PUBLICATION_INTEGRATION_OBSERVATION_PROTOCOL;
  readonly kind: typeof PUBLICATION_INTEGRATION_OBSERVATION_KIND;
  readonly observation_id: string;
  readonly publication_id: string;
  readonly receipt_sha256: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly claim_id: string;
  readonly generation: number;
  readonly head_sha: string;
  readonly target_ref: string;
  readonly fetched_target_oid: string;
  readonly observation_ref: string;
  readonly provider_pr_number: number;
  readonly provider_state: string;
  readonly provider_merged_at: string | null;
  /** Read-time projection from provider state plus the existing merge-lib proof. */
  readonly integration_state: PublicationIntegrationState;
}

export type PublicationIntegrationState = 'merged' | 'ancestor' | 'absorbed';

type PublicationIntegrationObservationInput = Omit<PublicationIntegrationObservationV1, 'protocol' | 'kind' | 'observation_id'>;

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GIT_OID_PATTERN = /^[0-9a-f]{40,64}$/;

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new PublicationLifecycleError('publication_incomplete', `${label} is required`);
  return value;
}

function requireExactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    throw new PublicationLifecycleError('publication_incomplete', `integration observation fields are invalid: expected ${sortedExpected.join(', ')}`);
  }
}

function validateObservationInput(input: PublicationIntegrationObservationInput): PublicationIntegrationObservationInput {
  const valid: PublicationIntegrationObservationInput = {
    publication_id: requiredString(input.publication_id, 'publication_id'),
    receipt_sha256: requiredString(input.receipt_sha256, 'receipt_sha256'),
    task_id: requiredString(input.task_id, 'task_id'),
    task_revision: requiredString(input.task_revision, 'task_revision'),
    claim_id: requiredString(input.claim_id, 'claim_id'),
    generation: input.generation,
    head_sha: requiredString(input.head_sha, 'head_sha'),
    target_ref: requiredString(input.target_ref, 'target_ref'),
    fetched_target_oid: requiredString(input.fetched_target_oid, 'fetched_target_oid'),
    observation_ref: requiredString(input.observation_ref, 'observation_ref'),
    provider_pr_number: input.provider_pr_number,
    provider_state: requiredString(input.provider_state, 'provider_state'),
    provider_merged_at: input.provider_merged_at,
    integration_state: input.integration_state,
  };
  if (!SHA256_PATTERN.test(valid.publication_id) || !SHA256_PATTERN.test(valid.receipt_sha256)) {
    throw new PublicationLifecycleError('publication_incomplete', 'integration observation publication or receipt digest is invalid');
  }
  if (!TASK_DIGEST_PATTERN.test(valid.task_id) || !TASK_DIGEST_PATTERN.test(valid.task_revision)) {
    throw new PublicationLifecycleError('publication_incomplete', 'integration observation task identity is invalid');
  }
  if (!Number.isInteger(valid.generation) || valid.generation < 1 || !Number.isInteger(valid.provider_pr_number) || valid.provider_pr_number < 1) {
    throw new PublicationLifecycleError('publication_incomplete', 'integration observation generation or provider PR number is invalid');
  }
  if (!GIT_OID_PATTERN.test(valid.head_sha) || !GIT_OID_PATTERN.test(valid.fetched_target_oid)) {
    throw new PublicationLifecycleError('publication_incomplete', 'integration observation git OID is invalid');
  }
  if (!valid.observation_ref.startsWith('refs/repo-harness/observations/')) {
    throw new PublicationLifecycleError('publication_incomplete', 'integration observation ref is outside the isolated observation namespace');
  }
  if (valid.provider_merged_at !== null && typeof valid.provider_merged_at !== 'string') {
    throw new PublicationLifecycleError('publication_incomplete', 'integration observation provider_merged_at is invalid');
  }
  if (valid.integration_state !== 'merged' && valid.integration_state !== 'ancestor' && valid.integration_state !== 'absorbed') {
    throw new PublicationLifecycleError('publication_incomplete', 'integration observation state is invalid');
  }
  return Object.freeze(valid);
}

export function derivePublicationIntegrationObservationId(input: PublicationIntegrationObservationInput): string {
  return publicationSha256(stablePublicationJson([
    PUBLICATION_INTEGRATION_OBSERVATION_PROTOCOL,
    PUBLICATION_INTEGRATION_OBSERVATION_KIND,
    validateObservationInput(input),
  ]));
}

export function buildPublicationIntegrationObservation(input: PublicationIntegrationObservationInput): PublicationIntegrationObservationV1 {
  const valid = validateObservationInput(input);
  return Object.freeze({
    protocol: PUBLICATION_INTEGRATION_OBSERVATION_PROTOCOL,
    kind: PUBLICATION_INTEGRATION_OBSERVATION_KIND,
    observation_id: derivePublicationIntegrationObservationId(valid),
    ...valid,
  });
}

export function validatePublicationIntegrationObservation(value: unknown): PublicationIntegrationObservationV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PublicationLifecycleError('publication_incomplete', 'integration observation must be an object');
  }
  const record = value as Record<string, unknown>;
  requireExactKeys(record, [
    'protocol', 'kind', 'observation_id', 'publication_id', 'receipt_sha256', 'task_id', 'task_revision',
    'claim_id', 'generation', 'head_sha', 'target_ref', 'fetched_target_oid', 'observation_ref',
    'provider_pr_number', 'provider_state', 'provider_merged_at', 'integration_state',
  ]);
  if (record.protocol !== PUBLICATION_INTEGRATION_OBSERVATION_PROTOCOL || record.kind !== PUBLICATION_INTEGRATION_OBSERVATION_KIND) {
    throw new PublicationLifecycleError('publication_incomplete', 'integration observation protocol or kind is invalid');
  }
  const observation = buildPublicationIntegrationObservation({
    publication_id: record.publication_id as string,
    receipt_sha256: record.receipt_sha256 as string,
    task_id: record.task_id as string,
    task_revision: record.task_revision as string,
    claim_id: record.claim_id as string,
    generation: record.generation as number,
    head_sha: record.head_sha as string,
    target_ref: record.target_ref as string,
    fetched_target_oid: record.fetched_target_oid as string,
    observation_ref: record.observation_ref as string,
    provider_pr_number: record.provider_pr_number as number,
    provider_state: record.provider_state as string,
    provider_merged_at: record.provider_merged_at as string | null,
    integration_state: record.integration_state as PublicationIntegrationState,
  });
  if (record.observation_id !== observation.observation_id) {
    throw new PublicationLifecycleError('publication_incomplete', 'integration observation id is stale');
  }
  return observation;
}

export function canonicalPublicationIntegrationObservationBytes(observation: PublicationIntegrationObservationV1): string {
  return stablePublicationJson(validatePublicationIntegrationObservation(observation));
}

export function publicationPointerFromReceipt(
  receipt: PublicationReceiptV1,
  shipTransactionKey: string,
): CurrentPublicationPointerV1 {
  if (shipTransactionKey.length === 0) throw new PublicationLifecycleError('publication_incomplete', 'ship transaction key is required');
  return Object.freeze({
    publication_id: receipt.publication_id,
    receipt_sha256: publicationReceiptDigest(receipt),
    head_sha: receipt.head_sha,
    ship_transaction_key: shipTransactionKey,
  });
}

export function publicationLineageFromPointer(
  receipt: PublicationReceiptV1,
  pointer: CurrentPublicationPointerV1,
  reason: string,
): PublicationLineageV1 {
  if (reason.trim() === '') throw new PublicationLifecycleError('publication_incomplete', 'publication abandon reason is required');
  const expected = publicationPointerFromReceipt(receipt, pointer.ship_transaction_key);
  if (
    expected.publication_id !== pointer.publication_id
    || expected.receipt_sha256 !== pointer.receipt_sha256
    || expected.head_sha !== pointer.head_sha
  ) {
    throw new PublicationLifecycleError('publication_pointer_mismatch', 'receipt does not match current publication pointer');
  }
  return Object.freeze({
    protocol: PUBLICATION_LINEAGE_PROTOCOL,
    kind: PUBLICATION_LINEAGE_KIND,
    publication_id: receipt.publication_id,
    task_id: receipt.task_id,
    claim_id: receipt.claim_id,
    generation: receipt.generation,
    receipt_sha256: pointer.receipt_sha256,
    head_sha: receipt.head_sha,
    ship_transaction_key: pointer.ship_transaction_key,
    reason,
  });
}

export function canonicalPublicationLineageBytes(lineage: PublicationLineageV1): string {
  return JSON.stringify(lineage);
}
