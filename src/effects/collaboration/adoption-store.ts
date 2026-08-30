/**
 * The append-only `HandoffAdoptionReceiptV1` store.
 *
 * Sprint row C3. Adoption is non-exclusive, and this store is where that has to
 * survive contact with concurrency: two distinct adopters of one handoff derive
 * two distinct identities and both writes succeed, while one adopter repeating
 * the same triple converges on the receipt it already wrote. There is no
 * first-adopter-wins branch anywhere below, because there is no such rule.
 *
 * Zero delivery-plane write (D1). Adopting knowledge opens no Task, Lease,
 * Publication or Acceptance store for writing and changes no ownership: the
 * adopter becomes a writer only through the existing release / takeover /
 * acquire lifecycle, exactly as before adopting.
 */
import { realpathSync } from 'fs';

import {
  CollaborationError,
  validateCollaborationRecordId,
  type CollaborationActorRefV1,
  type CollaborationMode,
  type CollaborationRecordedTimeSource,
} from '../../core/collaboration/common';
import {
  buildHandoffAdoptionReceipt,
  canonicalHandoffAdoptionReceiptBytes,
  deriveHandoffAdoptionReceiptId,
  handoffAdoptionReceiptId,
  validateHandoffAdoptionReceipt,
  type HandoffAdoptionReceiptV1,
} from '../../core/collaboration/adoption';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { resolveCollaborationActor, type CollaborationAuthorizationV1 } from './actor';
import { assertCollaborationMutationEnabled } from './feature-flag';
import { listWorkStateHandoffs, readWorkStateHandoff } from './handoff-store';
import {
  COLLABORATION_STORE_RELATIVE_ROOT,
  collaborationInvalidStore,
  collaborationLockRelativePath,
  collaborationRecordPath,
  collaborationStorePaths,
  collaborationUnavailable,
  ensureCollaborationDirectory,
  listCollaborationRecords,
  publishCollaborationRecordDurably,
  readCollaborationRecord,
  type CollaborationRecordCodec,
  type CollaborationStorePaths,
} from './record-store';

export const COLLABORATION_ADOPTIONS_SHARD = 'adoptions';
export const COLLABORATION_ADOPTIONS_RELATIVE_ROOT = `${COLLABORATION_STORE_RELATIVE_ROOT}/${COLLABORATION_ADOPTIONS_SHARD}`;

/**
 * The receipt carries no id field, so its identity is recomputed from the frozen
 * triple in its own bytes and compared with the filename it was read from. A
 * receipt filed under a name it does not derive is a corrupt store, not a
 * usable record.
 */
const ADOPTION_CODEC: CollaborationRecordCodec<HandoffAdoptionReceiptV1> = {
  label: 'handoff adoption receipt',
  validate: validateHandoffAdoptionReceipt,
  identityOf: handoffAdoptionReceiptId,
  canonicalBytes: canonicalHandoffAdoptionReceiptBytes,
};

export interface AdoptWorkStateHandoffInput {
  readonly repo_root: string;
  /** The authenticated authorization; the adopter is derived from it, never declared. */
  readonly authorization: CollaborationAuthorizationV1;
  readonly handoff_id: string;
  /** The context packet this adopter received, as its canonical digest. */
  readonly context_packet_sha256: string;
  readonly recorded_time: CollaborationRecordedTimeSource;
  readonly now?: () => string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface AdoptWorkStateHandoffResult {
  readonly receipt: HandoffAdoptionReceiptV1;
  /** The derived receipt identity, which is also its filename in the store. */
  readonly receipt_id: string;
  /** False when an existing identity with identical bytes was returned unchanged. */
  readonly created: boolean;
  readonly mode: CollaborationMode;
}

export function adoptionStorePaths(repoRoot: string): CollaborationStorePaths {
  return collaborationStorePaths(repoRoot, COLLABORATION_ADOPTIONS_SHARD);
}

/**
 * The receipt identity covers the handoff *digest*, not the handoff *id*, so
 * `handoff_id` is the one field a receipt carries that its own name does not
 * constrain. A record naming handoff B while its digest pins handoff A derives
 * the right filename, serialises canonically and validates — and every reader
 * that groups receipts by `handoff_id`, which is the shape C6 consumes, would
 * then count an adopter against a handoff nobody adopted.
 *
 * `adopt()` catches that case as a byte conflict, but only for the one identity
 * being written. Reads need their own check, because an append-only store has
 * no repair path: once such a record exists, every later read inherits it.
 */
function assertReceiptBindsItsHandoff(
  receipt: HandoffAdoptionReceiptV1,
  boundDigest: string | null,
): void {
  if (boundDigest === null) {
    collaborationUnavailable(
      `adoption receipt references a handoff that does not exist in this repository: ${receipt.handoff_id}`,
    );
  }
  if (boundDigest !== receipt.handoff_sha256) {
    collaborationUnavailable(
      `adoption receipt handoff_id and handoff_sha256 disagree: ${receipt.handoff_id}`,
    );
  }
}

export function readHandoffAdoptionReceipt(
  repoRoot: string,
  receiptId: string,
): HandoffAdoptionReceiptV1 | null {
  // Validated before the repo root is even resolved: a malformed id is a caller
  // error, not a store lookup, and must not cost a filesystem walk.
  validateCollaborationRecordId(receiptId, 'receipt_id');
  const root = realpathSync(repoRoot);
  const receipt = readCollaborationRecord(adoptionStorePaths(root), ADOPTION_CODEC, receiptId, 'receipt_id');
  if (receipt) {
    assertReceiptBindsItsHandoff(receipt, readWorkStateHandoff(root, receipt.handoff_id)?.handoff_sha256 ?? null);
  }
  return receipt;
}

export function listHandoffAdoptionReceipts(repoRoot: string): readonly HandoffAdoptionReceiptV1[] {
  const root = realpathSync(repoRoot);
  const receipts = listCollaborationRecords(adoptionStorePaths(root), ADOPTION_CODEC, 'receipt_id');
  if (receipts.length === 0) return receipts;
  // One shard scan rather than one file read per receipt: the same cross-check,
  // without making a list of N receipts cost N handoff reads.
  const digests = new Map(listWorkStateHandoffs(root).map((handoff) => [handoff.handoff_id, handoff.handoff_sha256]));
  for (const receipt of receipts) {
    assertReceiptBindsItsHandoff(receipt, digests.get(receipt.handoff_id) ?? null);
  }
  return receipts;
}

/**
 * Every adopter of one handoff. This is a plain filter over persisted receipts
 * rather than an index: an index would be a second authority that could disagree
 * with the records it summarises. The grouping key is `handoff_id`, which is
 * exactly why `listHandoffAdoptionReceipts()` proves it against the bound digest
 * before anything is counted.
 */
export function listAdoptersOfWorkStateHandoff(
  repoRoot: string,
  handoffId: string,
): readonly CollaborationActorRefV1[] {
  validateCollaborationRecordId(handoffId, 'handoff_id');
  return Object.freeze(
    listHandoffAdoptionReceipts(repoRoot)
      .filter((receipt) => receipt.handoff_id === handoffId)
      .map((receipt) => receipt.adopter),
  );
}

export function adoptWorkStateHandoff(input: AdoptWorkStateHandoffInput): AdoptWorkStateHandoffResult {
  const repoRoot = realpathSync(input.repo_root);
  const mode = assertCollaborationMutationEnabled(repoRoot);
  const handoffId = validateCollaborationRecordId(input.handoff_id, 'handoff_id');
  const { actor: adopter, repository_id: repositoryId } = resolveCollaborationActor(
    repoRoot,
    input.authorization,
    input.env,
  );
  // The sibling of the destination guard in `record-store.ts`. This store has no
  // destination — a receipt always lands in the public `adoptions/` shard — so
  // the binding it needs is on the actor alone: a `delegated_worker` adoption
  // would be a publicly readable Worker record that no contribution commit
  // references, which is the same invariant the candidate area protects, one
  // record family over.
  //
  // Nothing constructs one today: the contribution collector never adopts, and
  // D4 lists `delegated_worker` as a supported author without any row having
  // wired adoption for it. Refusing is therefore fail-closed rather than a
  // removed capability, and the row that needs Worker adoption (C5 succession or
  // C6 packets) unblocks it by deciding how such a receipt becomes visible.
  if (adopter.kind !== 'module_engineer') {
    collaborationInvalidStore(
      'handoff adoption requires a module_engineer authorization; a delegated_worker has no adoption path yet',
    );
  }
  const paths = adoptionStorePaths(repoRoot);

  ensureCollaborationDirectory(paths.common, paths.shard);
  // The lock is per handoff, not per receipt: two adopters of the same handoff
  // serialize against each other, which keeps the handoff-existence read and the
  // receipt write consistent, and both still succeed because their identities
  // differ. Adopters of different handoffs never contend.
  return withExclusiveDirectoryLock(
    paths.common,
    collaborationLockRelativePath('handoff-adoption', handoffId),
    () => {
      const handoff = readWorkStateHandoff(repoRoot, handoffId);
      if (!handoff) collaborationInvalidStore(`handoff does not exist in this repository: ${handoffId}`);
      if (handoff.repository_id !== repositoryId) {
        collaborationInvalidStore(`handoff belongs to another repository: ${handoffId}`);
      }

      // Taken from the persisted record, never from the caller: a receipt that
      // attested to a digest its subject does not have would attest to nothing.
      const handoffSha256 = handoff.handoff_sha256;
      const receiptId = deriveHandoffAdoptionReceiptId(handoffSha256, adopter, input.context_packet_sha256);

      const build = (adoptedAt: string): HandoffAdoptionReceiptV1 => buildHandoffAdoptionReceipt({
        handoff_id: handoffId,
        handoff_sha256: handoffSha256,
        adopter,
        context_packet_sha256: input.context_packet_sha256,
        adopted_at: adoptedAt,
      });

      /**
       * Reconcile against an already persisted identity. The candidate is rebuilt
       * from the *recorded* time, so a retry never re-samples the wall clock and
       * an otherwise identical re-adoption is idempotent instead of a false
       * conflict.
       */
      const reconcile = (existing: HandoffAdoptionReceiptV1): AdoptWorkStateHandoffResult => {
        const candidate = build(existing.adopted_at);
        if (canonicalHandoffAdoptionReceiptBytes(candidate)
          !== canonicalHandoffAdoptionReceiptBytes(existing)) {
          throw new CollaborationError(
            'collaboration_conflict',
            `adoption receipt identity ${receiptId} already exists with different bytes`,
          );
        }
        return Object.freeze({ receipt: existing, receipt_id: receiptId, created: false, mode });
      };

      const existing = readCollaborationRecord(paths, ADOPTION_CODEC, receiptId, 'receipt_id');
      if (existing) return reconcile(existing);

      // The only place a clock is read. Everything above resolves without it, so
      // a retry that finds the receipt already written reuses the persisted value.
      const adoptedAt = input.recorded_time.kind === 'persisted_observation'
        ? input.recorded_time.observed_at
        : (input.now ?? (() => new Date().toISOString()))();
      const receipt = build(adoptedAt);
      const bytes = canonicalHandoffAdoptionReceiptBytes(receipt);
      const file = collaborationRecordPath(paths, receiptId, 'receipt_id');
      try {
        publishCollaborationRecordDurably(paths.shard, file, bytes);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        // Another process won the link between the read above and this publish.
        // Reconcile against its bytes rather than reporting a spurious conflict.
        return reconcile(readCollaborationRecord(paths, ADOPTION_CODEC, receiptId, 'receipt_id')!);
      }
      return Object.freeze({ receipt, receipt_id: receiptId, created: true, mode });
    },
  );
}
