import { canonicalize } from '../evidence/canonical-json';
import type { JsonValue } from '../evidence/types';
import { SESSION_OBSERVATION_MAX_BYTES } from '../sessions/session-selector';
import { isRepositoryRelativePath } from './doc-session-events';

/**
 * The changes of a doc session worktree (issue #1146), and the one digest
 * authority that commit and discard (#1023) check: `diff_sha256` binds the
 * reviewed diff against the session base, `loss_sha256` binds what a discard
 * deletes. A digest hashes the content ids and modes of each changed path,
 * not the patch text, so display options cannot change it. Pure, so the
 * page can import the decoders.
 */

export const DOC_SESSION_CHANGE_STATUSES = ['added', 'modified', 'deleted', 'type_changed'] as const;
export type DocSessionChangeStatus = typeof DOC_SESSION_CHANGE_STATUSES[number];
/** At most this many changed paths, and this many loss entries in all; a larger read is refused, never cut. */
export const DOC_SESSION_CHANGES_MAX = 1000;
export const DOC_SESSION_PATCH_MAX_BYTES = SESSION_OBSERVATION_MAX_BYTES;

export const DOC_SESSION_READ_FAILURES = [
  'session_not_found', 'worktree_missing', 'worktree_changed', 'stale', 'too_large',
  'filters_unsupported', 'index_unsupported', 'path_unsupported', 'encoding_unsupported', 'unavailable', 'busy', 'timeout',
] as const;
export type DocSessionReadFailure = typeof DOC_SESSION_READ_FAILURES[number];

/** One changed path. A null side is absent: `old_*` for an added path, `new_*` for a deleted one. */
export interface DocSessionChange {
  readonly path: string;
  readonly status: DocSessionChangeStatus;
  readonly old_mode: string | null;
  readonly new_mode: string | null;
  readonly old_oid: string | null;
  readonly new_oid: string | null;
  /** False for a path git does not track. Not digested: a commit adds both the same way. */
  readonly tracked: boolean;
}

export interface DocSessionFileView {
  readonly path: string;
  readonly status: DocSessionChangeStatus;
  readonly tracked: boolean;
  readonly binary: boolean;
}

export type DocSessionTurn = 'running' | 'idle';

export interface OperatorDocSessionDiffV1 {
  readonly protocol: 1;
  readonly kind: 'operator_docs_session_diff';
  readonly session_id: string;
  readonly base_commit: string;
  readonly head_commit: string;
  readonly turn: DocSessionTurn;
  readonly files: readonly DocSessionFileView[];
  /** Repository-relative `a/` and `b/` prefixes; untracked files appear as new files. Content is verbatim. */
  readonly patch: string;
  readonly diff_sha256: string;
  readonly observed_at: string;
}

export interface OperatorDocSessionLossV1 {
  readonly protocol: 1;
  readonly kind: 'operator_docs_session_loss';
  readonly session_id: string;
  readonly head_commit: string;
  readonly turn: DocSessionTurn;
  /** Working-tree and index changes against HEAD, including untracked files. */
  readonly files: readonly Omit<DocSessionFileView, 'binary'>[];
  /** Ignored entries the worktree removal deletes; a directory ends with `/`. */
  readonly ignored: readonly string[];
  /** Commits after the session base that no remote ref holds. */
  readonly commits: readonly string[];
  /** A remote ref of the session branch exists, so the branch was pushed. */
  readonly pushed: boolean;
  readonly loss_sha256: string;
  readonly observed_at: string;
}

export interface DocSessionReadRequest { readonly session_id: string }

const SESSION_ID = /^[0-9a-f]{32}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const MODE = /^(?:100644|100755|120000|160000)$/u;

export const isDocSessionReadRequest = (value: unknown): value is DocSessionReadRequest =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 1
  && typeof (value as Record<string, unknown>).session_id === 'string' && SESSION_ID.test((value as Record<string, string>).session_id);

const byPath = (left: { readonly path: string }, right: { readonly path: string }): number => left.path < right.path ? -1 : left.path > right.path ? 1 : 0;

const digestEntries = (changes: readonly DocSessionChange[]): JsonValue => [...changes].sort(byPath).map(change => ({
  path: change.path, status: change.status, old_mode: change.old_mode, new_mode: change.new_mode, old_oid: change.old_oid, new_oid: change.new_oid,
}));

/** The exact bytes that SHA-256 hashes into `diff_sha256`: the changes against the session base. */
export function docSessionDiffDigestInput(baseCommit: string, changes: readonly DocSessionChange[]): string {
  return canonicalize({ version: 1, kind: 'docs_session_diff', base_commit: baseCommit, changes: digestEntries(changes) });
}

export interface DocSessionLossInput {
  readonly head_commit: string;
  readonly changes: readonly DocSessionChange[];
  /** Index-to-HEAD changes, separate from working-tree content. */
  readonly index: readonly DocSessionChange[];
  readonly ignored: readonly string[];
  readonly ignored_leaves: readonly { readonly path: string; readonly mode: string; readonly oid: string }[];
  readonly commits: readonly string[];
  readonly pushed: boolean;
}

/** The exact bytes that SHA-256 hashes into `loss_sha256`: everything a discard deletes. */
export function docSessionLossDigestInput(loss: DocSessionLossInput): string {
  return canonicalize({
    version: 1, kind: 'docs_session_loss', head_commit: loss.head_commit, changes: digestEntries(loss.changes),
    index: digestEntries(loss.index),
    ignored: [...loss.ignored].sort(), ignored_leaves: [...loss.ignored_leaves].sort(byPath).map(leaf => ({ path: leaf.path, mode: leaf.mode, oid: leaf.oid })),
    commits: [...loss.commits], pushed: loss.pushed,
  });
}

/** A repository-relative path; an ignored directory keeps one trailing `/`. */
export const isDocSessionLossPath = (value: unknown): value is string =>
  typeof value === 'string' && isRepositoryRelativePath(value.endsWith('/') ? value.slice(0, -1) : value);

const fail = (what: string): never => { throw new Error(`doc session ${what}`); };
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function exact(value: unknown, keys: readonly string[], what: string): Record<string, unknown> {
  if (!isObject(value)) return fail(what);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) return fail(what);
  return value;
}
const timestamp = (value: unknown): boolean => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** Paths are repository-relative, unique and in order. */
function decodeFiles(value: unknown, keys: readonly string[]): void {
  if (!Array.isArray(value) || value.length > DOC_SESSION_CHANGES_MAX) fail('files');
  let previous: string | null = null;
  for (const raw of value as unknown[]) {
    const file = exact(raw, keys, 'file');
    if (!isRepositoryRelativePath(file.path) || !(DOC_SESSION_CHANGE_STATUSES as readonly unknown[]).includes(file.status)
      || typeof file.tracked !== 'boolean' || (keys.includes('binary') && typeof file.binary !== 'boolean')) fail('file');
    if (previous !== null && (file.path as string) <= previous) fail('file order');
    previous = file.path as string;
  }
}

function decodeCommon(record: Record<string, unknown>, request: DocSessionReadRequest, kind: string): void {
  if (record.protocol !== 1 || record.kind !== kind || record.session_id !== request.session_id
    || typeof record.head_commit !== 'string' || !OID.test(record.head_commit)
    || (record.turn !== 'running' && record.turn !== 'idle') || !timestamp(record.observed_at)) fail('read');
}

const DIFF_KEYS = ['base_commit', 'diff_sha256', 'files', 'head_commit', 'kind', 'observed_at', 'patch', 'protocol', 'session_id', 'turn'];

/** Closed decoder for the diff read, for the server before it sends, the CLI and the page. */
export function decodeOperatorDocSessionDiff(value: unknown, request: DocSessionReadRequest): OperatorDocSessionDiffV1 {
  const record = exact(value, DIFF_KEYS, 'diff');
  decodeCommon(record, request, 'operator_docs_session_diff');
  if (typeof record.base_commit !== 'string' || !OID.test(record.base_commit) || typeof record.diff_sha256 !== 'string' || !SHA256.test(record.diff_sha256)
    || typeof record.patch !== 'string' || new TextEncoder().encode(record.patch).length > DOC_SESSION_PATCH_MAX_BYTES) fail('diff');
  decodeFiles(record.files, ['binary', 'path', 'status', 'tracked']);
  return value as OperatorDocSessionDiffV1;
}

const LOSS_KEYS = ['commits', 'files', 'head_commit', 'ignored', 'kind', 'loss_sha256', 'observed_at', 'protocol', 'pushed', 'session_id', 'turn'];

/** Closed decoder for the loss read. */
export function decodeOperatorDocSessionLoss(value: unknown, request: DocSessionReadRequest): OperatorDocSessionLossV1 {
  const record = exact(value, LOSS_KEYS, 'loss');
  decodeCommon(record, request, 'operator_docs_session_loss');
  if (typeof record.loss_sha256 !== 'string' || !SHA256.test(record.loss_sha256) || typeof record.pushed !== 'boolean') fail('loss');
  decodeFiles(record.files, ['path', 'status', 'tracked']);
  const { files, ignored, commits } = record as { files: unknown[]; ignored: unknown; commits: unknown };
  if (!Array.isArray(ignored) || !ignored.every(isDocSessionLossPath) || new Set(ignored).size !== ignored.length) fail('loss ignored');
  if (!Array.isArray(commits) || !commits.every(oid => typeof oid === 'string' && OID.test(oid)) || new Set(commits).size !== commits.length) fail('loss commits');
  if (files.length + (ignored as unknown[]).length + (commits as unknown[]).length > DOC_SESSION_CHANGES_MAX) fail('loss size');
  return value as OperatorDocSessionLossV1;
}

/** A change entry as git reports it: modes and object ids, closed. */
export function isDocSessionChange(value: DocSessionChange): boolean {
  const side = (mode: string | null, oid: string | null) => (mode === null) === (oid === null) && (mode === null || (MODE.test(mode) && OID.test(oid!)));
  return isRepositoryRelativePath(value.path) && side(value.old_mode, value.old_oid) && side(value.new_mode, value.new_oid)
    && (value.status === 'added' ? value.old_mode === null && value.new_mode !== null
      : value.status === 'deleted' ? value.old_mode !== null && value.new_mode === null
        : value.old_mode !== null && value.new_mode !== null);
}
