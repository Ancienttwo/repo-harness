/**
 * The append-only `WorkStateHandoffV1` store.
 *
 * Sprint row C3. Store mechanics come from `record-store.ts`; this module is the
 * handoff-specific part: the authenticated actor, which signals a handoff may
 * cite, and what a revision may supersede.
 *
 * Zero delivery-plane write (D1). Publishing a handoff opens no Task, Lease,
 * Publication or Acceptance store for writing, and transfers no execution right:
 * the successor still becomes a writer only through the existing
 * release / takeover / acquire lifecycle.
 */
import { realpathSync } from 'fs';

import {
  COLLABORATION_IDEMPOTENCY_KEY_MAX_BYTES,
  CollaborationError,
  collaborationActorLineage,
  validateCollaborationRecordId,
  type CollaborationMode,
  type CollaborationRecordedTimeSource,
  type CollaborationScopeRefV1,
} from '../../core/collaboration/common';
import {
  buildWorkStateHandoff,
  canonicalWorkStateHandoffBytes,
  deriveWorkStateHandoffId,
  validateWorkStateHandoff,
  type HandoffAttemptedPathV1,
  type HandoffExecutionContextV1,
  type WorkStateHandoffTrigger,
  type WorkStateHandoffV1,
} from '../../core/collaboration/handoff';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { resolveCollaborationActor, type CollaborationAuthorizationV1 } from './actor';
import { assertCollaborationMutationEnabled } from './feature-flag';
import {
  COLLABORATION_STORE_RELATIVE_ROOT,
  collaborationInvalidStore,
  collaborationLockRelativePath,
  collaborationRecordPath,
  collaborationStorePaths,
  ensureCollaborationDirectory,
  listCollaborationRecords,
  publishCollaborationRecordDurably,
  readCollaborationRecord,
  type CollaborationRecordCodec,
  type CollaborationStorePaths,
} from './record-store';
import { readCoordinationSignal } from './signal-store';

export const COLLABORATION_HANDOFFS_SHARD = 'handoffs';
export const COLLABORATION_HANDOFFS_RELATIVE_ROOT = `${COLLABORATION_STORE_RELATIVE_ROOT}/${COLLABORATION_HANDOFFS_SHARD}`;

const HANDOFF_CODEC: CollaborationRecordCodec<WorkStateHandoffV1> = {
  label: 'handoff',
  validate: validateWorkStateHandoff,
  identityOf: (handoff) => handoff.handoff_id,
  canonicalBytes: canonicalWorkStateHandoffBytes,
};

export interface PublishWorkStateHandoffInput {
  readonly repo_root: string;
  /** The authenticated authorization; the actor is derived from it, never declared. */
  readonly authorization: CollaborationAuthorizationV1;
  /** Identity input for the derived handoff id; the same key retried converges. */
  readonly idempotency_key: string;
  readonly thread_key: string;
  readonly scope_refs: readonly CollaborationScopeRefV1[];
  readonly trigger: WorkStateHandoffTrigger;
  readonly goal: string;
  readonly completed: readonly string[];
  readonly key_findings: readonly string[];
  readonly attempted_paths: readonly HandoffAttemptedPathV1[];
  readonly dead_ends: readonly string[];
  readonly open_hypotheses: readonly string[];
  readonly next_actions: readonly string[];
  readonly source_signal_ids: readonly string[];
  readonly execution_context: HandoffExecutionContextV1;
  readonly supersedes_handoff_id: string | null;
  readonly recorded_time: CollaborationRecordedTimeSource;
  readonly now?: () => string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface PublishWorkStateHandoffResult {
  readonly handoff: WorkStateHandoffV1;
  /** False when an existing identity with identical bytes was returned unchanged. */
  readonly created: boolean;
  readonly mode: CollaborationMode;
}

export function handoffStorePaths(repoRoot: string): CollaborationStorePaths {
  return collaborationStorePaths(repoRoot, COLLABORATION_HANDOFFS_SHARD);
}

export function readWorkStateHandoff(repoRoot: string, handoffId: string): WorkStateHandoffV1 | null {
  // Validated before the repo root is even resolved: a malformed id is a caller
  // error, not a store lookup, and must not cost a filesystem walk.
  validateCollaborationRecordId(handoffId, 'handoff_id');
  return readCollaborationRecord(handoffStorePaths(realpathSync(repoRoot)), HANDOFF_CODEC, handoffId, 'handoff_id');
}

export function listWorkStateHandoffs(repoRoot: string): readonly WorkStateHandoffV1[] {
  return listCollaborationRecords(handoffStorePaths(realpathSync(repoRoot)), HANDOFF_CODEC, 'handoff_id');
}

/**
 * A cited signal must already exist in this repository's signal store. A handoff
 * that points at a record nobody can resolve gives the successor a dead
 * reference in the place its evidence should be.
 */
function assertResolvableSignal(repoRoot: string, repositoryId: string, signalId: string): void {
  const signal = readCoordinationSignal(repoRoot, validateCollaborationRecordId(signalId, 'source_signal_id'));
  if (!signal) collaborationInvalidStore(`source_signal_id does not exist in this repository: ${signalId}`);
  if (signal.repository_id !== repositoryId) {
    collaborationInvalidStore(`source_signal_id belongs to another repository: ${signalId}`);
  }
}

export function publishWorkStateHandoff(
  input: PublishWorkStateHandoffInput,
): PublishWorkStateHandoffResult {
  const repoRoot = realpathSync(input.repo_root);
  const mode = assertCollaborationMutationEnabled(repoRoot);
  if (typeof input.idempotency_key !== 'string'
    || input.idempotency_key.length === 0
    || Buffer.byteLength(input.idempotency_key, 'utf8') > COLLABORATION_IDEMPOTENCY_KEY_MAX_BYTES) {
    collaborationInvalidStore('idempotency_key is invalid');
  }
  const { actor, repository_id: repositoryId } = resolveCollaborationActor(repoRoot, input.authorization, input.env);
  const handoffId = deriveWorkStateHandoffId(repositoryId, actor, input.idempotency_key);
  const paths = handoffStorePaths(repoRoot);

  const build = (createdAt: string): WorkStateHandoffV1 => buildWorkStateHandoff({
    handoff_id: handoffId,
    repository_id: repositoryId,
    actor,
    thread_key: input.thread_key,
    scope_refs: input.scope_refs,
    trigger: input.trigger,
    goal: input.goal,
    completed: input.completed,
    key_findings: input.key_findings,
    attempted_paths: input.attempted_paths,
    dead_ends: input.dead_ends,
    open_hypotheses: input.open_hypotheses,
    next_actions: input.next_actions,
    source_signal_ids: input.source_signal_ids,
    execution_context: input.execution_context,
    supersedes_handoff_id: input.supersedes_handoff_id,
    created_at: createdAt,
  });

  /**
   * Reconcile against an already persisted identity. The candidate is rebuilt
   * from the *recorded* time, so a retry never re-samples the wall clock and an
   * otherwise identical republish is idempotent instead of a false conflict.
   */
  const reconcile = (existing: WorkStateHandoffV1): PublishWorkStateHandoffResult => {
    const candidate = build(existing.created_at);
    if (canonicalWorkStateHandoffBytes(candidate) !== canonicalWorkStateHandoffBytes(existing)) {
      throw new CollaborationError(
        'collaboration_conflict',
        `handoff identity ${handoffId} already exists with different bytes`,
      );
    }
    return Object.freeze({ handoff: existing, created: false, mode });
  };

  ensureCollaborationDirectory(paths.common, paths.shard);
  // Per handoff, as D9 freezes it. The identity is derived above from the actor
  // and the idempotency key rather than from the thread, so this is also the
  // only key that serialises two concurrent publishes of *one* handoff: under a
  // thread-keyed lock the same identity published under two thread keys would
  // take two locks and race into a spurious byte conflict.
  return withExclusiveDirectoryLock(
    paths.common,
    collaborationLockRelativePath('handoff', handoffId),
    () => {
      const existing = readCollaborationRecord(paths, HANDOFF_CODEC, handoffId, 'handoff_id');
      if (existing) return reconcile(existing);

      for (const signalId of input.source_signal_ids) {
        assertResolvableSignal(repoRoot, repositoryId, signalId);
      }
      if (input.supersedes_handoff_id !== null) {
        const superseded = readCollaborationRecord(
          paths,
          HANDOFF_CODEC,
          validateCollaborationRecordId(input.supersedes_handoff_id, 'supersedes_handoff_id'),
          'supersedes_handoff_id',
        );
        if (!superseded) {
          collaborationInvalidStore(
            `supersedes_handoff_id does not exist in this repository: ${input.supersedes_handoff_id}`,
          );
        }
        if (superseded.repository_id !== repositoryId) {
          collaborationInvalidStore(
            `supersedes_handoff_id belongs to another repository: ${input.supersedes_handoff_id}`,
          );
        }
        // A revision is the author correcting their own record. Another
        // participant disagreeing publishes their own handoff instead.
        if (collaborationActorLineage(superseded.actor) !== collaborationActorLineage(actor)) {
          collaborationInvalidStore('supersedes_handoff_id belongs to another actor lineage');
        }
      }

      // The only place a clock is read. Everything above resolves without it, so a
      // retry that finds the record already written reuses the persisted value.
      const createdAt = input.recorded_time.kind === 'persisted_observation'
        ? input.recorded_time.observed_at
        : (input.now ?? (() => new Date().toISOString()))();
      const handoff = build(createdAt);
      const bytes = canonicalWorkStateHandoffBytes(handoff);
      const file = collaborationRecordPath(paths, handoffId, 'handoff_id');
      try {
        publishCollaborationRecordDurably(paths.shard, file, bytes);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        // Another writer won the link between the read above and this publish.
        // Reconcile against its bytes rather than reporting a spurious conflict.
        return reconcile(readCollaborationRecord(paths, HANDOFF_CODEC, handoffId, 'handoff_id')!);
      }
      return Object.freeze({ handoff, created: true, mode });
    },
  );
}
