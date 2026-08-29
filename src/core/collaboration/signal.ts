/**
 * `CoordinationSignalV1` — the append-only unit of collaboration observation.
 *
 * Sprint row C1. The protocol closes the transport only: actor kind, reference
 * structure, identity and digest format, body size, label count and reference
 * counts. It closes no semantics — which labels exist, what a thread is called,
 * how findings are classified and which collaboration strategy applies are all
 * decided by the agents publishing, and the system grants none of it authority.
 *
 * A signal is immutable once written. A revision is a new signal carrying
 * `supersedes_signal_id`; nothing edits a persisted record in place.
 */
import {
  COLLABORATION_PROTOCOL,
  COLLABORATION_SOURCE_SIGNAL_MAX_COUNT,
  canonicalCollaborationBytes,
  canonicalCollaborationDigest,
  collaborationActorSha256,
  collaborationInvalid,
  deriveCollaborationRecordId,
  isCollaborationRecord,
  validateCollaborationArtifactRefs,
  validateCollaborationBody,
  validateCollaborationLabels,
  validateCollaborationRecordId,
  validateCollaborationRecordedAt,
  validateCollaborationRepositoryId,
  validateCollaborationScopeRefs,
  validateCollaborationThreadKey,
  validateCollaborationTitle,
  validateCollaborationActorRef,
  type CollaborationActorRefV1,
  type CollaborationArtifactRefV1,
  type CollaborationScopeRefV1,
} from './common';
import { assertMessageExactKeys } from '../messages/mechanics';

export const COORDINATION_SIGNAL_KIND = 'repo-harness-coordination-signal' as const;

const SIGNAL_FIELDS = [
  'protocol',
  'kind',
  'signal_id',
  'repository_id',
  'actor',
  'thread_key',
  'reply_to_signal_id',
  'scope_refs',
  'labels',
  'title',
  'body',
  'artifact_refs',
  'source_signal_ids',
  'supersedes_signal_id',
  'created_at',
  'signal_sha256',
] as const;

export interface CoordinationSignalV1 {
  readonly protocol: typeof COLLABORATION_PROTOCOL;
  readonly kind: typeof COORDINATION_SIGNAL_KIND;
  readonly signal_id: string;
  readonly repository_id: string;
  readonly actor: CollaborationActorRefV1;
  /** Opaque to the system: threads aggregate on exact equality, never on similarity. */
  readonly thread_key: string;
  readonly reply_to_signal_id: string | null;
  readonly scope_refs: readonly CollaborationScopeRefV1[];
  readonly labels: readonly string[];
  readonly title: string;
  readonly body: string;
  readonly artifact_refs: readonly CollaborationArtifactRefV1[];
  readonly source_signal_ids: readonly string[];
  readonly supersedes_signal_id: string | null;
  /** Host-derived and stable across retries; never re-sampled from the wall clock. */
  readonly created_at: string;
  readonly signal_sha256: string;
}

export type CoordinationSignalInput = Omit<CoordinationSignalV1, 'protocol' | 'kind' | 'signal_sha256'>;

/**
 * Identity is derived by the Host from the repository, the authenticated actor
 * and one identity key. A direct publication passes its idempotency key; a
 * delegated contribution passes `<worker_run_ref_sha256>#<entry index>`, so a
 * retried run converges on the same ids.
 */
export function deriveCoordinationSignalId(
  repositoryId: string,
  actor: CollaborationActorRefV1,
  identityKey: string,
): string {
  return deriveCollaborationRecordId('coordination-signal', [
    validateCollaborationRepositoryId(repositoryId),
    collaborationActorSha256(actor),
    identityKey,
  ]);
}

function nullableRecordId(value: unknown, field: string): string | null {
  if (value === null) return null;
  return validateCollaborationRecordId(value, field);
}

function validateSourceSignalIds(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > COLLABORATION_SOURCE_SIGNAL_MAX_COUNT) {
    collaborationInvalid(`source_signal_ids exceeds ${COLLABORATION_SOURCE_SIGNAL_MAX_COUNT} entries`);
  }
  const ids = value.map((entry) => validateCollaborationRecordId(entry, 'source_signal_id'));
  if (new Set(ids).size !== ids.length) collaborationInvalid('source_signal_ids must be unique');
  return Object.freeze(ids);
}

export function buildCoordinationSignal(input: CoordinationSignalInput): CoordinationSignalV1 {
  const signalId = validateCollaborationRecordId(input.signal_id, 'signal_id');
  const supersedes = nullableRecordId(input.supersedes_signal_id, 'supersedes_signal_id');
  const replyTo = nullableRecordId(input.reply_to_signal_id, 'reply_to_signal_id');
  if (supersedes === signalId) collaborationInvalid('a signal cannot supersede itself');
  if (replyTo === signalId) collaborationInvalid('a signal cannot reply to itself');
  const sourceIds = validateSourceSignalIds(input.source_signal_ids);
  if (sourceIds.includes(signalId)) collaborationInvalid('a signal cannot cite itself as a source');
  const basis = Object.freeze({
    protocol: COLLABORATION_PROTOCOL,
    kind: COORDINATION_SIGNAL_KIND,
    signal_id: signalId,
    repository_id: validateCollaborationRepositoryId(input.repository_id),
    actor: validateCollaborationActorRef(input.actor),
    thread_key: validateCollaborationThreadKey(input.thread_key),
    reply_to_signal_id: replyTo,
    scope_refs: validateCollaborationScopeRefs(input.scope_refs, 'scope_refs'),
    labels: validateCollaborationLabels(input.labels, 'labels'),
    title: validateCollaborationTitle(input.title),
    body: validateCollaborationBody(input.body),
    artifact_refs: validateCollaborationArtifactRefs(input.artifact_refs, 'artifact_refs'),
    source_signal_ids: sourceIds,
    supersedes_signal_id: supersedes,
    created_at: validateCollaborationRecordedAt(input.created_at, 'created_at'),
  });
  return Object.freeze({
    ...basis,
    signal_sha256: canonicalCollaborationDigest(basis as unknown as Readonly<Record<string, unknown>>),
  });
}

export function validateCoordinationSignal(value: unknown): CoordinationSignalV1 {
  if (!isCollaborationRecord(value)) collaborationInvalid('coordination signal must be an object');
  assertMessageExactKeys(value, SIGNAL_FIELDS, 'coordination signal', collaborationInvalid);
  if (value.protocol !== COLLABORATION_PROTOCOL || value.kind !== COORDINATION_SIGNAL_KIND) {
    collaborationInvalid('coordination signal protocol or kind is invalid');
  }
  const signal = buildCoordinationSignal({
    signal_id: value.signal_id as string,
    repository_id: value.repository_id as string,
    actor: value.actor as CollaborationActorRefV1,
    thread_key: value.thread_key as string,
    reply_to_signal_id: value.reply_to_signal_id as string | null,
    scope_refs: value.scope_refs as readonly CollaborationScopeRefV1[],
    labels: value.labels as readonly string[],
    title: value.title as string,
    body: value.body as string,
    artifact_refs: value.artifact_refs as readonly CollaborationArtifactRefV1[],
    source_signal_ids: value.source_signal_ids as readonly string[],
    supersedes_signal_id: value.supersedes_signal_id as string | null,
    created_at: value.created_at as string,
  });
  if (value.signal_sha256 !== signal.signal_sha256) collaborationInvalid('coordination signal signal_sha256 is stale');
  return signal;
}

export function canonicalCoordinationSignalBytes(signal: CoordinationSignalV1): string {
  return canonicalCollaborationBytes(
    validateCoordinationSignal(signal) as unknown as Readonly<Record<string, unknown>>,
  );
}
