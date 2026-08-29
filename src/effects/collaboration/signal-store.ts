/**
 * The append-only `CoordinationSignalV1` store.
 *
 * Sprint row C1. Store root, lock strategy and canonical JSON are frozen by D9:
 * `<git-common-dir>/repo-harness/collaboration/v1/`, the existing exclusive
 * directory lock taken per thread, immutable create plus fsync, an lstat
 * ancestor walk that refuses symlinks and non-directories, explicit idempotency
 * conflict on the same identity with different bytes, and no healthy-empty
 * fallback when a shard cannot be read.
 *
 * Zero delivery-plane write (D1). This module opens no Task, Lease, Publication
 * or Acceptance store for writing; it reads the Engineer principal and Binding
 * only to derive who is speaking.
 */
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { createHash, randomUUID } from 'crypto';
import { basename, dirname, join, relative, resolve, sep } from 'path';

import {
  COLLABORATION_IDEMPOTENCY_KEY_MAX_BYTES,
  CollaborationError,
  collaborationActorLineage,
  validateCollaborationRecordId,
  type CollaborationActorRefV1,
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
import { resolveEngineerPrincipal } from '../engineers/principal';
import { readEngineerPrincipalMapping } from '../engineers/principal-store';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { assertCollaborationMutationEnabled } from './feature-flag';

export const COLLABORATION_STORE_RELATIVE_ROOT = 'repo-harness/collaboration/v1';
export const COLLABORATION_SIGNALS_RELATIVE_ROOT = `${COLLABORATION_STORE_RELATIVE_ROOT}/signals`;

const SIGNAL_FILE = /^[0-9a-f]{64}\.json$/u;
/**
 * The staging name `publishSignalFileDurably()` links from. A crash between
 * staging and linking leaves one behind; it is residue of this store's own
 * publish protocol, so listing skips it instead of declaring the store corrupt.
 * Anything else in the directory still fails the store closed.
 */
const SIGNAL_TEMP_FILE = /^\.[0-9a-f]{64}\.json\.\d+\.[0-9a-f-]{36}\.tmp$/u;

export interface PublishCoordinationSignalInput {
  readonly repo_root: string;
  /** The authenticated authorization; the actor is derived from it, never declared. */
  readonly authorization_id: string;
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

interface StorePaths {
  readonly common: string;
  readonly root: string;
  readonly signals: string;
}

function invalid(message: string, cause?: unknown): never {
  throw new CollaborationError('collaboration_invalid', message, cause);
}

function unavailable(message: string, cause?: unknown): never {
  throw new CollaborationError('collaboration_unavailable', message, cause);
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function storePaths(repoRoot: string): StorePaths {
  const common = resolve(realpathSync(resolveGitCommonDirectory(repoRoot)));
  const root = join(common, COLLABORATION_STORE_RELATIVE_ROOT);
  return { common, root, signals: join(root, 'signals') };
}

/**
 * Walk every ancestor between the Git common directory and the target,
 * creating what is missing and refusing anything that is not a real directory.
 * A symlinked ancestor would let a signal be written outside the store.
 */
function ensureDirectory(common: string, target: string): void {
  const scoped = relative(common, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`)) {
    invalid(`collaboration path escapes the Git common directory: ${target}`);
  }
  let current = common;
  for (const part of scoped.split(sep)) {
    current = join(current, part);
    if (!existsSync(current)) {
      try {
        mkdirSync(current, { mode: 0o700 });
        fsyncDirectory(dirname(current));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) invalid(`unsafe collaboration directory: ${current}`);
  }
}

function assertSafeDirectory(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) invalid(`unsafe collaboration directory: ${path}`);
}

/**
 * Every path into the store is built from a validated record id. The 64-hex
 * shape is checked *before* the `join()`, so `../escape`, an absolute path or a
 * separator-bearing id is a typed `collaboration_invalid` and never reaches the
 * filesystem as a traversal.
 */
function signalPath(paths: StorePaths, signalId: string, field = 'signal_id'): string {
  return join(paths.signals, `${validateCollaborationRecordId(signalId, field)}.json`);
}

function readPersistedSignal(
  paths: StorePaths,
  signalId: string,
  field = 'signal_id',
): CoordinationSignalV1 | null {
  const file = signalPath(paths, signalId, field);
  if (!existsSync(file)) return null;
  let raw: string;
  try {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) invalid(`unsafe signal path: ${file}`);
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if (error instanceof CollaborationError) throw error;
    return unavailable(`signal is unreadable: ${file}`, error);
  }
  let signal: CoordinationSignalV1;
  try {
    signal = validateCoordinationSignal(JSON.parse(raw));
  } catch (error) {
    return unavailable(`signal is not a valid record: ${file}`, error);
  }
  if (signal.signal_id !== signalId || canonicalCoordinationSignalBytes(signal) !== raw) {
    unavailable(`signal path and content identity disagree: ${file}`);
  }
  return signal;
}

export function readCoordinationSignal(repoRoot: string, signalId: string): CoordinationSignalV1 | null {
  // Validated before the repo root is even resolved: a malformed id is a caller
  // error, not a store lookup, and must not cost a filesystem walk.
  validateCollaborationRecordId(signalId, 'signal_id');
  const paths = storePaths(realpathSync(repoRoot));
  if (!existsSync(paths.signals)) return null;
  assertSafeDirectory(paths.signals);
  return readPersistedSignal(paths, signalId);
}

/**
 * Every persisted signal. An unreadable entry throws instead of being skipped:
 * a partially readable store is never served as a healthy smaller one.
 */
export function listCoordinationSignals(repoRoot: string): readonly CoordinationSignalV1[] {
  const paths = storePaths(realpathSync(repoRoot));
  if (!existsSync(paths.signals)) return Object.freeze([]);
  assertSafeDirectory(paths.signals);
  let entries: string[];
  try {
    entries = readdirSync(paths.signals);
  } catch (error) {
    return unavailable(`signal store is unreadable: ${paths.signals}`, error);
  }
  const unexpected = entries.filter((entry) => !SIGNAL_FILE.test(entry) && !SIGNAL_TEMP_FILE.test(entry));
  if (unexpected.length > 0) unavailable(`unexpected entries in the signal store: ${unexpected.sort().join(', ')}`);
  return Object.freeze(
    entries
      .filter((entry) => SIGNAL_FILE.test(entry))
      .sort()
      .map((entry) => readPersistedSignal(paths, entry.slice(0, -'.json'.length))!),
  );
}

function resolveModuleEngineerActor(
  repoRoot: string,
  authorizationId: string,
  env: NodeJS.ProcessEnv | undefined,
): { readonly actor: CollaborationActorRefV1; readonly repository_id: string } {
  const principal = resolveEngineerPrincipal({ repo_root: repoRoot, authorization_id: authorizationId, env });
  // Second read of the same authority: if the mapping moved between the
  // principal resolution and here, the actor is uncertain and publication stops.
  const mapping = readEngineerPrincipalMapping(principal.repository_id, authorizationId, env);
  if (!mapping
    || mapping.state !== 'active'
    || mapping.engineer_id !== principal.engineer_id
    || mapping.binding_id !== principal.binding_id
    || mapping.binding_generation !== principal.binding_generation
    || mapping.engineer_contract_revision !== principal.engineer_contract_revision) {
    unavailable('the principal mapping changed during actor derivation');
  }
  return {
    repository_id: principal.repository_id,
    actor: Object.freeze({
      kind: 'module_engineer' as const,
      engineer_id: principal.engineer_id,
      binding_id: principal.binding_id,
      binding_generation: principal.binding_generation,
      principal_mapping_sha256: mapping.mapping_digest,
    }),
  };
}

/**
 * Source references must already exist in this store and belong to this
 * repository. A signal that cites a record nobody can resolve is not a lead, it
 * is an unverifiable claim.
 */
function assertResolvableSource(
  paths: StorePaths,
  repositoryId: string,
  signalId: string | null,
  field: string,
): CoordinationSignalV1 | null {
  if (signalId === null) return null;
  const referenced = readPersistedSignal(paths, validateCollaborationRecordId(signalId, field), field);
  if (!referenced) invalid(`${field} does not exist in this repository: ${signalId}`);
  if (referenced.repository_id !== repositoryId) invalid(`${field} belongs to another repository: ${signalId}`);
  return referenced;
}

/**
 * Publish the record so no reader can ever observe a half-written one: the bytes
 * go into a same-directory temp file, are fsynced, and only then appear under
 * their final name. `O_CREAT|O_EXCL` on the target itself made the name visible
 * before the bytes landed, so a crash in between left a zero-length JSON that an
 * append-only store can never repair.
 *
 * `link` rather than `rename` — matching `publishImmutable()` in
 * `src/effects/publication/feedback-store.ts`, this store's create-once
 * precedent. A rename would silently overwrite whatever a competing writer had
 * already published; `link` fails `EEXIST` and preserves first-writer-wins, so
 * the loser still reconciles to identical bytes or `collaboration_conflict`.
 */
function publishSignalFileDurably(directory: string, file: string, bytes: string): void {
  const temporary = join(directory, `.${basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(fd, bytes, 'utf8');
    fsyncSync(fd);
  } catch (error) {
    // Wrapped so the caller's EEXIST branch can only ever mean "the final name
    // was taken", never "the temp name collided".
    if (fd !== null) { closeSync(fd); fd = null; }
    try { unlinkSync(temporary); } catch { /* it may never have been created */ }
    return unavailable(`cannot stage signal bytes: ${file}`, error);
  } finally {
    if (fd !== null) closeSync(fd);
  }
  try {
    linkSync(temporary, file);
    fsyncDirectory(directory);
  } finally {
    try { unlinkSync(temporary); } catch { /* the publish error, if any, wins */ }
  }
}

function threadLockRelativePath(threadKey: string): string {
  const key = createHash('sha256').update(threadKey, 'utf8').digest('hex');
  return `${COLLABORATION_STORE_RELATIVE_ROOT}/locks/${key}.lock`;
}

export function publishCoordinationSignal(
  input: PublishCoordinationSignalInput,
): PublishCoordinationSignalResult {
  const repoRoot = realpathSync(input.repo_root);
  const mode = assertCollaborationMutationEnabled(repoRoot);
  if (typeof input.idempotency_key !== 'string'
    || input.idempotency_key.length === 0
    || Buffer.byteLength(input.idempotency_key, 'utf8') > COLLABORATION_IDEMPOTENCY_KEY_MAX_BYTES) {
    invalid('idempotency_key is invalid');
  }
  const { actor, repository_id: repositoryId } = resolveModuleEngineerActor(repoRoot, input.authorization_id, input.env);
  const signalId = deriveCoordinationSignalId(repositoryId, actor, input.idempotency_key);
  const paths = storePaths(repoRoot);

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

  ensureDirectory(paths.common, paths.signals);
  return withExclusiveDirectoryLock(paths.common, threadLockRelativePath(input.thread_key), () => {
    const existing = readPersistedSignal(paths, signalId);
    if (existing) return reconcile(existing);

    assertResolvableSource(paths, repositoryId, input.reply_to_signal_id, 'reply_to_signal_id');
    for (const sourceId of input.source_signal_ids) {
      assertResolvableSource(paths, repositoryId, sourceId, 'source_signal_id');
    }
    const superseded = assertResolvableSource(paths, repositoryId, input.supersedes_signal_id, 'supersedes_signal_id');
    if (superseded && collaborationActorLineage(superseded.actor) !== collaborationActorLineage(actor)) {
      invalid('supersedes_signal_id belongs to another actor lineage');
    }

    // The only place a clock is read. Everything above resolves without it, so a
    // retry that finds the record already written reuses the persisted value.
    const createdAt = input.recorded_time.kind === 'persisted_observation'
      ? input.recorded_time.observed_at
      : (input.now ?? (() => new Date().toISOString()))();
    const signal = build(createdAt);
    const bytes = canonicalCoordinationSignalBytes(signal);
    const file = signalPath(paths, signalId);
    try {
      publishSignalFileDurably(paths.signals, file, bytes);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Another writer won the link between the read above and this publish.
      // Reconcile against its bytes rather than reporting a spurious conflict.
      return reconcile(readPersistedSignal(paths, signalId)!);
    }
    return Object.freeze({ signal, created: true, mode });
  });
}
