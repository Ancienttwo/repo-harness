/**
 * The append-only `CoordinationSignalV1` store.
 *
 * Sprint row C1. The store rules D9 freezes — root, per-subject lock, immutable
 * create plus fsync, the lstat ancestor walk, the explicit idempotency conflict
 * and the refusal of a healthy-empty fallback — live in `record-store.ts`, which
 * every collaboration record family shares. This module is the signal-specific
 * part: which authority resolves the actor, which references must already exist,
 * and what a revision may supersede.
 *
 * Zero delivery-plane write (D1). This module opens no Task, Lease, Publication
 * or Acceptance store for writing; it reads the Engineer principal and Binding
 * only to derive who is speaking.
 */
import { realpathSync } from 'fs';

import {
  COLLABORATION_IDEMPOTENCY_KEY_MAX_BYTES,
  CollaborationError,
  collaborationActorLineage,
  validateCollaborationRecordId,
  type CollaborationArtifactRefV1,
  type CollaborationMode,
  type CollaborationRecordedTimeSource,
  type CollaborationScopeRefV1,
} from '../../core/collaboration/common';
import {
  buildCoordinationSignal,
  canonicalCoordinationSignalBytes,
  deriveCoordinationSignalId,
  validateCoordinationSignal,
  type CoordinationSignalV1,
} from '../../core/collaboration/signal';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { resolveCollaborationActor, type CollaborationAuthorizationV1 } from './actor';
import { assertCollaborationMutationEnabled } from './feature-flag';
import {
  COLLABORATION_STORE_RELATIVE_ROOT,
  collaborationInvalidStore,
  collaborationLockRelativePath,
  collaborationRecordPath,
  collaborationStagingName,
  collaborationStorePaths,
  ensureCollaborationDirectory,
  listCollaborationRecords,
  publishCollaborationRecordDurably,
  readCollaborationRecord,
  type CollaborationRecordCodec,
  type CollaborationStorePaths,
} from './record-store';

export { COLLABORATION_STORE_RELATIVE_ROOT };
export const COLLABORATION_SIGNALS_SHARD = 'signals';
export const COLLABORATION_SIGNALS_RELATIVE_ROOT = `${COLLABORATION_STORE_RELATIVE_ROOT}/${COLLABORATION_SIGNALS_SHARD}`;

/**
 * The staging name this store publishes through, re-exported from the one
 * builder every collaboration store shares. A test that proves the skip rule
 * against this function is proving it against the real producer.
 */
export const signalStagingName = collaborationStagingName;

const SIGNAL_CODEC: CollaborationRecordCodec<CoordinationSignalV1> = {
  label: 'signal',
  validate: validateCoordinationSignal,
  identityOf: (signal) => signal.signal_id,
  canonicalBytes: canonicalCoordinationSignalBytes,
};

export interface PublishCoordinationSignalInput {
  readonly repo_root: string;
  /** The authenticated authorization; the actor is derived from it, never declared. */
  readonly authorization: CollaborationAuthorizationV1;
  /** Identity input for the derived signal id; the same key retried converges. */
  readonly idempotency_key: string;
  readonly thread_key: string;
  readonly reply_to_signal_id: string | null;
  readonly scope_refs: readonly CollaborationScopeRefV1[];
  readonly labels: readonly string[];
  readonly title: string;
  readonly body: string;
  readonly artifact_refs: readonly CollaborationArtifactRefV1[];
  readonly source_signal_ids: readonly string[];
  readonly supersedes_signal_id: string | null;
  readonly recorded_time: CollaborationRecordedTimeSource;
  readonly now?: () => string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface PublishCoordinationSignalResult {
  readonly signal: CoordinationSignalV1;
  /** False when an existing identity with identical bytes was returned unchanged. */
  readonly created: boolean;
  readonly mode: CollaborationMode;
}

function signalPaths(repoRoot: string): CollaborationStorePaths {
  return collaborationStorePaths(repoRoot, COLLABORATION_SIGNALS_SHARD);
}

export function readCoordinationSignal(repoRoot: string, signalId: string): CoordinationSignalV1 | null {
  // Validated before the repo root is even resolved: a malformed id is a caller
  // error, not a store lookup, and must not cost a filesystem walk.
  validateCollaborationRecordId(signalId, 'signal_id');
  return readCollaborationRecord(signalPaths(realpathSync(repoRoot)), SIGNAL_CODEC, signalId, 'signal_id');
}

export function listCoordinationSignals(repoRoot: string): readonly CoordinationSignalV1[] {
  return listCollaborationRecords(signalPaths(realpathSync(repoRoot)), SIGNAL_CODEC, 'signal_id');
}

/**
 * Source references must already exist in this store and belong to this
 * repository. A signal that cites a record nobody can resolve is not a lead, it
 * is an unverifiable claim.
 */
function assertResolvableSource(
  paths: CollaborationStorePaths,
  repositoryId: string,
  signalId: string | null,
  field: string,
): CoordinationSignalV1 | null {
  if (signalId === null) return null;
  const referenced = readCollaborationRecord(
    paths,
    SIGNAL_CODEC,
    validateCollaborationRecordId(signalId, field),
    field,
  );
  if (!referenced) collaborationInvalidStore(`${field} does not exist in this repository: ${signalId}`);
  if (referenced.repository_id !== repositoryId) {
    collaborationInvalidStore(`${field} belongs to another repository: ${signalId}`);
  }
  return referenced;
}

export function publishCoordinationSignal(
  input: PublishCoordinationSignalInput,
): PublishCoordinationSignalResult {
  const repoRoot = realpathSync(input.repo_root);
  const mode = assertCollaborationMutationEnabled(repoRoot);
  if (typeof input.idempotency_key !== 'string'
    || input.idempotency_key.length === 0
    || Buffer.byteLength(input.idempotency_key, 'utf8') > COLLABORATION_IDEMPOTENCY_KEY_MAX_BYTES) {
    collaborationInvalidStore('idempotency_key is invalid');
  }
  const { actor, repository_id: repositoryId } = resolveCollaborationActor(repoRoot, input.authorization, input.env);
  const signalId = deriveCoordinationSignalId(repositoryId, actor, input.idempotency_key);
  const paths = signalPaths(repoRoot);

  const build = (createdAt: string): CoordinationSignalV1 => buildCoordinationSignal({
    signal_id: signalId,
    repository_id: repositoryId,
    actor,
    thread_key: input.thread_key,
    reply_to_signal_id: input.reply_to_signal_id,
    scope_refs: input.scope_refs,
    labels: input.labels,
    title: input.title,
    body: input.body,
    artifact_refs: input.artifact_refs,
    source_signal_ids: input.source_signal_ids,
    supersedes_signal_id: input.supersedes_signal_id,
    created_at: createdAt,
  });

  /**
   * Reconcile against an already persisted identity. The candidate is rebuilt
   * from the *recorded* time, so a retry never re-samples the wall clock and an
   * otherwise identical republish is idempotent instead of a false conflict.
   */
  const reconcile = (existing: CoordinationSignalV1): PublishCoordinationSignalResult => {
    const candidate = build(existing.created_at);
    if (canonicalCoordinationSignalBytes(candidate) !== canonicalCoordinationSignalBytes(existing)) {
      throw new CollaborationError(
        'collaboration_conflict',
        `signal identity ${signalId} already exists with different bytes`,
      );
    }
    return Object.freeze({ signal: existing, created: false, mode });
  };

  ensureCollaborationDirectory(paths.common, paths.shard);
  return withExclusiveDirectoryLock(
    paths.common,
    collaborationLockRelativePath('thread', input.thread_key),
    () => {
      const existing = readCollaborationRecord(paths, SIGNAL_CODEC, signalId, 'signal_id');
      if (existing) return reconcile(existing);

      assertResolvableSource(paths, repositoryId, input.reply_to_signal_id, 'reply_to_signal_id');
      for (const sourceId of input.source_signal_ids) {
        assertResolvableSource(paths, repositoryId, sourceId, 'source_signal_id');
      }
      const superseded = assertResolvableSource(paths, repositoryId, input.supersedes_signal_id, 'supersedes_signal_id');
      if (superseded && collaborationActorLineage(superseded.actor) !== collaborationActorLineage(actor)) {
        collaborationInvalidStore('supersedes_signal_id belongs to another actor lineage');
      }

      // The only place a clock is read. Everything above resolves without it, so a
      // retry that finds the record already written reuses the persisted value.
      const createdAt = input.recorded_time.kind === 'persisted_observation'
        ? input.recorded_time.observed_at
        : (input.now ?? (() => new Date().toISOString()))();
      const signal = build(createdAt);
      const bytes = canonicalCoordinationSignalBytes(signal);
      const file = collaborationRecordPath(paths, signalId, 'signal_id');
      try {
        publishCollaborationRecordDurably(paths.shard, file, bytes);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        // Another writer won the link between the read above and this publish.
        // Reconcile against its bytes rather than reporting a spurious conflict.
        return reconcile(readCollaborationRecord(paths, SIGNAL_CODEC, signalId, 'signal_id')!);
      }
      return Object.freeze({ signal, created: true, mode });
    },
  );
}
