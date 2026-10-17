import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { dirname } from 'path';
import { canonicalPublicationReceiptBytes, type PublicationReceiptV3 } from '../../src/core/publication/publication-receipt';
import { publicationReceiptPath } from '../../src/effects/publication/publication-receipt';

/** Seed an immutable historical record before testing its production reader. */
export function seedPublicationReceipt(root: string, receipt: PublicationReceiptV3, gitBin = 'git'): string {
  const path = publicationReceiptPath(root, receipt.publication_id, gitBin);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${canonicalPublicationReceiptBytes(receipt)}\n`);
  return path;
}

import { canonicalRepairDispatchProofBytes, canonicalReactionAttemptReceiptBytes, type RepairDispatchProofV1, type ReactionAttemptReceiptV1 } from '../../src/core/publication/feedback';
import { repairDispatchProofPath, feedbackReactionLedgerPath } from '../../src/effects/publication/feedback-store';

export function seedRepairProof(root: string, publicationId: string, proof: RepairDispatchProofV1, gitBin = 'git'): string {
  const path = repairDispatchProofPath(root, publicationId, proof.repair_id, gitBin);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${canonicalRepairDispatchProofBytes(proof)}\n`);
  return path;
}
export function seedReactionReceipt(root: string, publicationId: string, receipt: ReactionAttemptReceiptV1, gitBin = 'git'): string {
  const path = feedbackReactionLedgerPath(root, publicationId, gitBin);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${canonicalReactionAttemptReceiptBytes(receipt)}\n`);
  return path;
}
