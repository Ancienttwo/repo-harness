import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { dirname } from 'path';
import { canonicalPublicationReceiptBytes, publicationReceiptDigest, publicationSha256, stablePublicationJson, type PublicationReceiptV3 } from '../../src/core/publication/publication-receipt';
import { publicationReceiptPath } from '../../src/effects/publication/publication-receipt';

/** Seed an immutable historical record before testing its production reader. */
export function seedPublicationReceipt(root: string, receipt: PublicationReceiptV3, gitBin = 'git'): string {
  const path = publicationReceiptPath(root, receipt.publication_id, gitBin);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${canonicalPublicationReceiptBytes(receipt)}\n`);
  return path;
}

import { canonicalReactionAttemptReceiptBytes, type ReactionAttemptReceiptV1 } from '../../src/core/publication/feedback';
import { feedbackReactionLedgerPath } from '../../src/effects/publication/feedback-store';

export function seedReactionReceipt(root: string, publicationId: string, receipt: ReactionAttemptReceiptV1, gitBin = 'git'): string {
  const path = feedbackReactionLedgerPath(root, publicationId, gitBin);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${canonicalReactionAttemptReceiptBytes(receipt)}\n`);
  return path;
}

import type { CurrentPublicationPointerV1 } from '../../src/core/state/coordination-identity';
import type { RepairOfferAction } from '../../src/core/publication/feedback';

export function historicalPublicationPointer(receipt: PublicationReceiptV3, key: string): CurrentPublicationPointerV1 {
  return { publication_id: receipt.publication_id, receipt_sha256: publicationReceiptDigest(receipt),
    head_sha: receipt.head_sha, ship_transaction_key: key };
}

export interface HistoricalRepairProof {
  readonly protocol: 1;
  readonly kind: 'repo-harness-repair-dispatch-proof';
  /** Derived from immutable source fences, not supplied by a caller. */
  readonly repair_id: string;
  readonly publication_id: string;
  readonly receipt_sha256: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly claim_id: string;
  readonly generation: number;
  readonly head_sha: string;
  readonly ship_transaction_key: string;
  readonly feedback_revision: string;
  readonly before_reaction_token: string;
  readonly action: RepairOfferAction;
  readonly phase: 'prepared' | 'dispatched';
  readonly successor_claim_id: string | null;
  readonly successor_generation: number | null;
  readonly successor_state: 'bound' | 'reserving' | null;
}


type HistoricalRepairInput = Omit<HistoricalRepairProof, 'protocol' | 'kind' | 'repair_id'>;
/** Literal historical evidence, without lifecycle mutation or authority checks. */
export function historicalRepairProof(input: HistoricalRepairInput): HistoricalRepairProof {
  const kind = 'repo-harness-repair-dispatch-proof' as const;
  const repairId = publicationSha256(stablePublicationJson([kind, input.publication_id,
    input.receipt_sha256, input.task_id, input.task_revision, input.claim_id, input.generation,
    input.head_sha, input.ship_transaction_key, input.feedback_revision, input.before_reaction_token, input.action]));
  return { protocol: 1, kind, repair_id: repairId, ...input };
}
export function dispatchedRepairFixture(proof: HistoricalRepairProof, successor: {
  successor_claim_id: string; successor_generation: number; successor_state: 'bound' | 'reserving';
}): HistoricalRepairProof {
  return { ...proof, phase: 'dispatched', ...successor };
}
