/**
 * The first TypeScript reader for `git worktree list --porcelain`.
 *
 * Git owns worktree topology; nothing here maintains a second registry. The
 * shared coordination plane needs exactly two facts from it -- which worktrees
 * still exist (a lease bound to a worktree that left the list is the only
 * evidence strong enough to call a lease reclaimable) and a stable digest of
 * the whole listing so a board read can tell that topology moved underneath it.
 *
 * `raw` is preserved verbatim for that digest. Hashing the parsed records
 * instead would erase exactly the signal the digest exists to carry: two
 * listings that parse the same but were produced at different moments.
 *
 * The porcelain grammar is one blank-line-separated record per worktree, each
 * line a bare key or `key value`:
 *
 * ```text
 * worktree /abs/path
 * HEAD 0123abcd...
 * branch refs/heads/main
 *
 * worktree /abs/other
 * HEAD 4567ef01...
 * detached
 * ```
 *
 * Unknown keys (`bare`, `locked`, `prunable`, and whatever git adds next) are
 * ignored rather than rejected: this reader is a topology probe, not a
 * validator of git's own output, and failing closed on a new advisory key
 * would break the board on a git upgrade that changed nothing it reads.
 */
import { execFileSync } from 'child_process';

export interface WorktreeEntry {
  /** Absolute path exactly as git reports it; never re-derived. */
  readonly path: string;
  /** `refs/heads/...` as reported, or null on a detached or bare entry. */
  readonly branch: string | null;
  readonly head: string | null;
  readonly detached: boolean;
}

export interface WorktreeTopology {
  /** `git worktree list --porcelain` stdout, verbatim; the digest input. */
  readonly raw: string;
  readonly worktrees: readonly WorktreeEntry[];
}

export function parseWorktreeTopology(raw: string): WorktreeTopology {
  const worktrees: WorktreeEntry[] = [];
  let path: string | null = null;
  let branch: string | null = null;
  let head: string | null = null;
  let detached = false;

  const flush = (): void => {
    if (path === null) return;
    worktrees.push({ path, branch, head, detached });
    path = null;
    branch = null;
    head = null;
    detached = false;
  };

  for (const line of raw.split('\n')) {
    if (line === '') {
      flush();
      continue;
    }
    const separator = line.indexOf(' ');
    const key = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? '' : line.slice(separator + 1);
    if (key === 'worktree') {
      // A `worktree` line without a preceding blank line still starts a new
      // record; git always separates them, but a truncated read must not merge
      // two entries into one.
      flush();
      path = value;
    } else if (key === 'HEAD') {
      head = value;
    } else if (key === 'branch') {
      branch = value;
    } else if (key === 'detached') {
      detached = true;
    }
  }
  flush();
  return { raw, worktrees };
}

/** Read this clone's worktree topology. Read-only; git is the sole authority. */
export function readWorktreeTopology(cwd: string, gitBin = 'git'): WorktreeTopology {
  const raw = execFileSync(gitBin, ['worktree', 'list', '--porcelain'], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseWorktreeTopology(raw);
}
