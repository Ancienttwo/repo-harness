/**
 * Pure publication lifecycle contracts. Receipt identity is immutable; the
 * lease pointer below is the separate, mutable authority that says which
 * receipt is current for execution.
 */
import {
  publicationReceiptDigest,
  type PublicationReceiptV1,
} from './publication-receipt';
import type { CurrentPublicationPointerV1 } from '../state/coordination-identity';

export const PUBLICATION_LINEAGE_PROTOCOL = 1 as const;
export const PUBLICATION_LINEAGE_KIND = 'repo-harness-publication-lineage' as const;

export type PublicationLifecycleErrorCode =
  | 'publication_incomplete'
  | 'publication_claim_mismatch'
  | 'publication_pointer_mismatch'
  | 'worktree_missing'
  | 'head_moved'
  | 'task_revision_mismatch'
  | 'legacy_confirmation_required'
  | 'legacy_unattributable';

export class PublicationLifecycleError extends Error {
  constructor(readonly code: PublicationLifecycleErrorCode, message: string, readonly cause?: unknown) {
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
