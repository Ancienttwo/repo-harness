/**
 * Shared mechanics for the collaboration plane.
 *
 * Sprint row C1 of
 * `plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`
 * owns this file exclusively: the actor union, the scope-ref union, the artifact
 * reference alias, transport limits, deterministic record identity, recorded
 * time and the canonical digest helpers are frozen here and consumed unchanged
 * by C2-C9. Frozen decisions live in
 * `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`.
 *
 * Nothing in this module carries delivery authority (D1). A collaboration
 * record never decides who owns work, what has been published, or what has been
 * accepted; it is read as untrusted context by whoever chooses to read it.
 */
import { createHash } from 'crypto';

import {
  assertMessageBoundedUtf8,
  assertMessageExactKeys,
  assertMessageInteger,
  assertMessageSha256,
  assertMessageTimestamp,
  assertMessageUuid,
  canonicalMessageBytes,
  canonicalMessageDigest,
  messageRequiredString,
  messageSha256,
} from '../messages/mechanics';
import { validateWorkerEvidenceRefs, type WorkerEvidenceRefV1 } from '../engineers/delegation';

export const COLLABORATION_PROTOCOL = 1 as const;

/**
 * Transport limits frozen by Child PRD A. They bound the wire only: which
 * labels exist, what a thread is called, and how findings are classified stay
 * open to the agents publishing them.
 */
export const COLLABORATION_TITLE_MAX_BYTES = 256;
export const COLLABORATION_BODY_MAX_BYTES = 8 * 1024;
export const COLLABORATION_LABEL_MAX_COUNT = 12;
export const COLLABORATION_LABEL_MAX_BYTES = 128;
export const COLLABORATION_SCOPE_REF_MAX_COUNT = 8;
export const COLLABORATION_ARTIFACT_REF_MAX_COUNT = 8;
export const COLLABORATION_SOURCE_SIGNAL_MAX_COUNT = 16;
export const COLLABORATION_THREAD_KEY_MAX_BYTES = 256;
export const COLLABORATION_FREE_TOPIC_MAX_BYTES = 256;
export const COLLABORATION_IDENTIFIER_MAX_BYTES = 512;
export const COLLABORATION_IDEMPOTENCY_KEY_MAX_BYTES = 512;

/** `off -> shadow -> active`, no skipped state (D10). */
export const COLLABORATION_MODES = ['off', 'shadow', 'active'] as const;
export type CollaborationMode = (typeof COLLABORATION_MODES)[number];

const RECORD_ID = /^[0-9a-f]{64}$/u;
const ENGINEER_ID = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const CAPABILITY_ID = /^capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const TASK_ID = /^[0-9a-f]{64}$/u;
const GIT_OID = /^[0-9a-f]{40,64}$/u;
/** The existing `repoHarnessRepoIdFor()` shape; collaboration mints no repository identity of its own. */
const REPOSITORY_ID = /^repo_[0-9a-f]{16}$/u;
/** One line, no control characters: these values end up in filenames and logs. */
const OPAQUE = /^[^\u0000-\u001f\u007f]+$/u;

export type CollaborationErrorCode =
  /** The record, or an input the Host derives it from, violates the frozen protocol. */
  | 'collaboration_invalid'
  /** The same identity already exists with different bytes. */
  | 'collaboration_conflict'
  /** A referenced record, store shard or authority could not be read. */
  | 'collaboration_unavailable'
  /** `collaboration.mode` does not permit this mutation. */
  | 'collaboration_disabled';

export class CollaborationError extends Error {
  constructor(readonly code: CollaborationErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'CollaborationError';
  }
}

export function collaborationInvalid(message: string): never {
  throw new CollaborationError('collaboration_invalid', message);
}

export function isCollaborationRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collaborationRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isCollaborationRecord(value)) collaborationInvalid(`${label} must be an object`);
  return value;
}

function bounded(value: unknown, field: string, maximum: number): string {
  const text = messageRequiredString(value, field, collaborationInvalid);
  assertMessageBoundedUtf8(text, field, maximum, collaborationInvalid);
  return text;
}

function opaque(value: unknown, field: string, maximum = COLLABORATION_IDENTIFIER_MAX_BYTES): string {
  const text = bounded(value, field, maximum);
  if (!OPAQUE.test(text)) collaborationInvalid(`${field} is invalid`);
  return text;
}

function digest(value: unknown, field: string): string {
  const text = messageRequiredString(value, field, collaborationInvalid);
  assertMessageSha256(text, field, collaborationInvalid);
  return text;
}

function matching(value: unknown, field: string, pattern: RegExp): string {
  const text = messageRequiredString(value, field, collaborationInvalid);
  if (!pattern.test(text)) collaborationInvalid(`${field} is invalid`);
  return text;
}

/**
 * Actor identity is derived by the Host from an authenticated principal and is
 * never accepted from a caller (D4). Only the two kinds with immutable
 * server-side provenance enter the wire union: `human_operator` and
 * `native_subagent` are deferred and unsupported respectively, and get no
 * placeholder branch here.
 */
export type CollaborationActorRefV1 =
  | {
      readonly kind: 'module_engineer';
      readonly engineer_id: string;
      readonly binding_id: string;
      readonly binding_generation: number;
      readonly principal_mapping_sha256: string;
    }
  | {
      readonly kind: 'delegated_worker';
      readonly parent_engineer_id: string;
      readonly parent_binding_id: string;
      readonly parent_binding_generation: number;
      readonly worker_run_ref_sha256: string;
      readonly admission_receipt_sha256: string;
    };

export function validateCollaborationActorRef(value: unknown): CollaborationActorRefV1 {
  const input = collaborationRecord(value, 'actor');
  if (input.kind === 'module_engineer') {
    assertMessageExactKeys(
      input,
      ['kind', 'engineer_id', 'binding_id', 'binding_generation', 'principal_mapping_sha256'],
      'actor',
      collaborationInvalid,
    );
    const bindingId = messageRequiredString(input.binding_id, 'actor binding_id', collaborationInvalid);
    assertMessageUuid(bindingId, 'actor binding_id', collaborationInvalid);
    assertMessageInteger(input.binding_generation, 'actor binding_generation', 1, collaborationInvalid);
    return Object.freeze({
      kind: 'module_engineer' as const,
      engineer_id: matching(input.engineer_id, 'actor engineer_id', ENGINEER_ID),
      binding_id: bindingId,
      binding_generation: input.binding_generation,
      principal_mapping_sha256: digest(input.principal_mapping_sha256, 'actor principal_mapping_sha256'),
    });
  }
  if (input.kind === 'delegated_worker') {
    assertMessageExactKeys(
      input,
      [
        'kind',
        'parent_engineer_id',
        'parent_binding_id',
        'parent_binding_generation',
        'worker_run_ref_sha256',
        'admission_receipt_sha256',
      ],
      'actor',
      collaborationInvalid,
    );
    const bindingId = messageRequiredString(input.parent_binding_id, 'actor parent_binding_id', collaborationInvalid);
    assertMessageUuid(bindingId, 'actor parent_binding_id', collaborationInvalid);
    assertMessageInteger(input.parent_binding_generation, 'actor parent_binding_generation', 1, collaborationInvalid);
    return Object.freeze({
      kind: 'delegated_worker' as const,
      parent_engineer_id: matching(input.parent_engineer_id, 'actor parent_engineer_id', ENGINEER_ID),
      parent_binding_id: bindingId,
      parent_binding_generation: input.parent_binding_generation,
      worker_run_ref_sha256: digest(input.worker_run_ref_sha256, 'actor worker_run_ref_sha256'),
      admission_receipt_sha256: digest(input.admission_receipt_sha256, 'actor admission_receipt_sha256'),
    });
  }
  return collaborationInvalid('actor kind is invalid');
}

export function collaborationActorSha256(actor: CollaborationActorRefV1): string {
  return canonicalMessageDigest(validateCollaborationActorRef(actor) as unknown as Readonly<Record<string, unknown>>);
}

/**
 * The lineage a revision may stay inside. A persistent Module Engineer keeps one
 * lineage across rebindings, because `binding_generation` counts rebindings of
 * the same engineer rather than identifying a different participant. A delegated
 * Worker's lineage is its immutable run reference: two runs are two
 * participants, even under one parent Engineer.
 */
export function collaborationActorLineage(actor: CollaborationActorRefV1): string {
  const valid = validateCollaborationActorRef(actor);
  return valid.kind === 'module_engineer'
    ? `module_engineer ${valid.engineer_id}`
    : `delegated_worker ${valid.worker_run_ref_sha256}`;
}

/**
 * Every scope reference binds the revision of what it points at, so an old
 * observation is never silently read as a current fact. `free_topic` keeps
 * collaboration from being blocked by the existing taxonomy.
 */
export type CollaborationScopeRefV1 =
  | { readonly kind: 'capability'; readonly capability_id: string; readonly capability_revision: string }
  | { readonly kind: 'work_package'; readonly work_package_id: string; readonly work_package_revision: string }
  | { readonly kind: 'task'; readonly task_id: string; readonly task_revision: string }
  | { readonly kind: 'path'; readonly path: string; readonly head_sha: string }
  | { readonly kind: 'publication'; readonly publication_id: string; readonly head_sha: string }
  | { readonly kind: 'free_topic'; readonly value: string };

function validateScopePath(value: unknown): string {
  const path = bounded(value, 'scope_ref path', COLLABORATION_IDENTIFIER_MAX_BYTES);
  if (
    path.startsWith('/')
    || path.startsWith('-')
    || path.includes('\0')
    || path.includes('\n')
    || path.includes('\r')
    || path.includes('\\')
    || path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    collaborationInvalid('scope_ref path is unsafe');
  }
  return path;
}

export function validateCollaborationScopeRef(value: unknown): CollaborationScopeRefV1 {
  const input = collaborationRecord(value, 'scope_ref');
  switch (input.kind) {
    case 'capability':
      assertMessageExactKeys(input, ['kind', 'capability_id', 'capability_revision'], 'scope_ref', collaborationInvalid);
      return Object.freeze({
        kind: 'capability' as const,
        capability_id: matching(input.capability_id, 'scope_ref capability_id', CAPABILITY_ID),
        capability_revision: digest(input.capability_revision, 'scope_ref capability_revision'),
      });
    case 'work_package':
      assertMessageExactKeys(input, ['kind', 'work_package_id', 'work_package_revision'], 'scope_ref', collaborationInvalid);
      return Object.freeze({
        kind: 'work_package' as const,
        work_package_id: opaque(input.work_package_id, 'scope_ref work_package_id'),
        work_package_revision: digest(input.work_package_revision, 'scope_ref work_package_revision'),
      });
    case 'task':
      assertMessageExactKeys(input, ['kind', 'task_id', 'task_revision'], 'scope_ref', collaborationInvalid);
      return Object.freeze({
        kind: 'task' as const,
        task_id: matching(input.task_id, 'scope_ref task_id', TASK_ID),
        task_revision: matching(input.task_revision, 'scope_ref task_revision', TASK_ID),
      });
    case 'path':
      assertMessageExactKeys(input, ['kind', 'path', 'head_sha'], 'scope_ref', collaborationInvalid);
      return Object.freeze({
        kind: 'path' as const,
        path: validateScopePath(input.path),
        head_sha: matching(input.head_sha, 'scope_ref head_sha', GIT_OID),
      });
    case 'publication':
      assertMessageExactKeys(input, ['kind', 'publication_id', 'head_sha'], 'scope_ref', collaborationInvalid);
      return Object.freeze({
        kind: 'publication' as const,
        publication_id: opaque(input.publication_id, 'scope_ref publication_id'),
        head_sha: matching(input.head_sha, 'scope_ref head_sha', GIT_OID),
      });
    case 'free_topic':
      assertMessageExactKeys(input, ['kind', 'value'], 'scope_ref', collaborationInvalid);
      return Object.freeze({
        kind: 'free_topic' as const,
        value: opaque(input.value, 'scope_ref value', COLLABORATION_FREE_TOPIC_MAX_BYTES),
      });
    default:
      return collaborationInvalid('scope_ref kind is invalid');
  }
}

export function validateCollaborationScopeRefs(value: unknown, field: string): readonly CollaborationScopeRefV1[] {
  if (!Array.isArray(value) || value.length > COLLABORATION_SCOPE_REF_MAX_COUNT) {
    collaborationInvalid(`${field} exceeds ${COLLABORATION_SCOPE_REF_MAX_COUNT} entries`);
  }
  return Object.freeze(value.map(validateCollaborationScopeRef));
}

/**
 * D8: the artifact reference *is* the `WorkerResultV1` evidence-ref shape,
 * validated by that module's validator. No second equivalent reference type is
 * introduced here.
 */
export type CollaborationArtifactRefV1 = WorkerEvidenceRefV1;

export function validateCollaborationArtifactRefs(value: unknown, field: string): readonly CollaborationArtifactRefV1[] {
  return validateWorkerEvidenceRefs(value, field, COLLABORATION_ARTIFACT_REF_MAX_COUNT);
}

export function validateCollaborationLabels(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length > COLLABORATION_LABEL_MAX_COUNT) {
    collaborationInvalid(`${field} exceeds ${COLLABORATION_LABEL_MAX_COUNT} entries`);
  }
  const labels = value.map((entry) => opaque(entry, 'label', COLLABORATION_LABEL_MAX_BYTES));
  if (new Set(labels).size !== labels.length) collaborationInvalid(`${field} must be unique`);
  return Object.freeze(labels);
}

export function validateCollaborationThreadKey(value: unknown): string {
  return opaque(value, 'thread_key', COLLABORATION_THREAD_KEY_MAX_BYTES);
}

export function validateCollaborationTitle(value: unknown): string {
  return opaque(value, 'title', COLLABORATION_TITLE_MAX_BYTES);
}

export function validateCollaborationBody(value: unknown): string {
  return bounded(value, 'body', COLLABORATION_BODY_MAX_BYTES);
}

export function validateCollaborationRepositoryId(value: unknown): string {
  return matching(value, 'repository_id', REPOSITORY_ID);
}

export function validateCollaborationRecordId(value: unknown, field: string): string {
  return matching(value, field, RECORD_ID);
}

export function validateCollaborationRecordedAt(value: unknown, field: string): string {
  const text = messageRequiredString(value, field, collaborationInvalid);
  assertMessageTimestamp(text, field, collaborationInvalid);
  return text;
}

/**
 * The recorded time of a collaboration record is Host-derived and stable across
 * retries. A delegated contribution takes the persisted observation time of that
 * exact run; a direct publication freezes the clock on the first idempotency
 * event. Neither branch re-samples the wall clock on a retry: the store reuses
 * the value it already persisted.
 */
export type CollaborationRecordedTimeSource =
  | { readonly kind: 'first_publication' }
  | { readonly kind: 'persisted_observation'; readonly observed_at: string };

export function validateCollaborationRecordedTimeSource(value: unknown): CollaborationRecordedTimeSource {
  const input = collaborationRecord(value, 'recorded_time');
  if (input.kind === 'first_publication') {
    assertMessageExactKeys(input, ['kind'], 'recorded_time', collaborationInvalid);
    return Object.freeze({ kind: 'first_publication' as const });
  }
  if (input.kind === 'persisted_observation') {
    assertMessageExactKeys(input, ['kind', 'observed_at'], 'recorded_time', collaborationInvalid);
    return Object.freeze({
      kind: 'persisted_observation' as const,
      observed_at: validateCollaborationRecordedAt(input.observed_at, 'recorded_time observed_at'),
    });
  }
  return collaborationInvalid('recorded_time kind is invalid');
}

/**
 * Deterministic record identity. The preimage is domain-separated and
 * NUL-joined, so a Host that repeats the same identity inputs derives the same
 * id and a retry converges instead of appending a duplicate. Callers never
 * supply an id.
 */
export function deriveCollaborationRecordId(domain: string, parts: readonly string[]): string {
  const scope = opaque(domain, 'record id domain', 64);
  if (parts.length === 0) collaborationInvalid('record id preimage is empty');
  // The separator is NUL, so a part carrying a control character would make the
  // preimage ambiguous. Parts are held to the same opaque-text rule as the domain.
  parts.forEach((part, index) => {
    if (!OPAQUE.test(part)) collaborationInvalid(`record id part ${index} is invalid`);
  });
  const preimage = [`repo-harness-collaboration/v${COLLABORATION_PROTOCOL}`, scope, ...parts].join(' ');
  return createHash('sha256').update(preimage, 'utf8').digest('hex');
}

export function collaborationSha256(value: string | Buffer): string {
  return messageSha256(value);
}

export function canonicalCollaborationBytes(value: Readonly<Record<string, unknown>>): string {
  return canonicalMessageBytes(value);
}

export function canonicalCollaborationDigest(value: Readonly<Record<string, unknown>>): string {
  return canonicalMessageDigest(value);
}
