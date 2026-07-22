/**
 * Store layout (D1): a single per-worktree append-only log plus a
 * content-addressed blob directory, both gitignored. Resolution goes
 * through the existing `path-safety` module (reused, not modified).
 */
import { resolveInsideRepo } from "../path-safety";

export const EVENTS_DIR_RELATIVE = ".ai/harness/evidence/events";
export const LOG_FILE_RELATIVE = ".ai/harness/evidence/events/log.jsonl";
export const BLOBS_DIR_RELATIVE = ".ai/harness/evidence/blobs";

function resolveOrThrow(repoRoot: string, relativePath: string): string {
  const result = resolveInsideRepo(repoRoot, relativePath);
  if (!result.ok || !result.path) throw new Error(result.error ?? `invalid evidence store path: ${relativePath}`);
  return result.path;
}

export function resolveEventsDir(repoRoot: string): string {
  return resolveOrThrow(repoRoot, EVENTS_DIR_RELATIVE);
}

export function resolveLogPath(repoRoot: string): string {
  return resolveOrThrow(repoRoot, LOG_FILE_RELATIVE);
}

export function resolveBlobsDir(repoRoot: string): string {
  return resolveOrThrow(repoRoot, BLOBS_DIR_RELATIVE);
}
