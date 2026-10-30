import { canonicalize } from '../evidence/canonical-json';
import type { JsonValue } from '../evidence/types';

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
