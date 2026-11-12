import { canonicalize } from '../evidence/canonical-json';
import type { JsonValue } from '../evidence/types';

/** The Git output cap of the cleanup Git runner; archive staging refuses an index version above it. */
export const CLEANUP_GIT_OUTPUT_MAX_BYTES = 512 * 1024;
const PATH_MAX_BYTES = 512;
const ENCODER = new TextEncoder();
const utf8Bytes = (text: string): number => ENCODER.encode(text).length;

/** A path inside the repository, relative to its root, in `/` form. */
export function isRepositoryRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || utf8Bytes(value) > PATH_MAX_BYTES) return false;
  if (value.startsWith('/') || value.includes('\\') || /[\u0000-\u001f\u007f]/u.test(value) || /^[A-Za-z]:/u.test(value)) return false;
  const segments = value.split('/');
  // `~` as the first segment names a home directory, not a path inside the repository.
  return segments[0] !== '~' && segments.every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

/** Private evidence; only the plan's loss summary crosses the public boundary. */
export interface CleanupFileEvidence {
  readonly path: string;
  readonly kind: 'file' | 'directory' | 'symlink';
  readonly mode: number;
  readonly size: number;
  /** Raw bytes (link text for a symlink), never Git's filtered representation. */
  readonly sha256: string | null;
  readonly git_oid: string | null;
}
export interface CleanupIndexEntry {
  readonly path: string;
  readonly mode: string;
  readonly oid: string;
  readonly stage: number;
  /** Blob size in bytes; the plan applies the Git archive size rule to it. */
  readonly size: number;
}
export interface CleanupLossEvidence {
  readonly kind: 'registered' | 'orphan';
  readonly identity: { readonly dev: number; readonly ino: number; readonly birthtime_ms: number };
  readonly branch: string | null;
  readonly head_commit: string | null;
  readonly files: readonly CleanupFileEvidence[];
  readonly index: readonly CleanupIndexEntry[];
  readonly changed_paths: readonly string[];
  readonly ignored: readonly string[];
  /** All commits reachable from HEAD and absent from every observed remote ref, with no session-base cutoff. */
  readonly commits: readonly string[];
  readonly remote_refs: readonly { readonly name: string; readonly oid: string }[];
}
export function cleanupContentsDigestInput(loss: CleanupLossEvidence): string {
  return canonicalize({ version: 1, kind: 'worktree_cleanup_contents', evidence: loss as unknown as JsonValue });
}
