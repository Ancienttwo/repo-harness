/**
 * The canonical authority a claim is validated against.
 *
 * A claim never reads the caller's working tree or its local active-sprint
 * marker: a worktree cut from an older commit would otherwise claim against
 * its own stale copy of the backlog. The sprint text is read out of an
 * explicitly named ref, so every worktree of the clone validates against the
 * same bytes.
 *
 * Repo identity is the resolved git common directory. It is stable across
 * every linked worktree of one clone -- which is exactly the coordination
 * plane's scope -- and the contract puts cross-clone and cross-machine
 * coordination out of scope, so nothing needs an identity that outlives the
 * clone's location.
 */
import { execFileSync } from 'child_process';
import { resolveGitCommonDirectory } from '../git/common-directory';

export function resolveRepoIdentity(cwd: string): string {
  return resolveGitCommonDirectory(cwd);
}

export interface CanonicalSprintSource {
  /** Ref naming the canonical commit, for example `main` or `origin/main`. */
  readonly targetRef: string;
  /** Repo-relative sprint path as it exists on that ref. */
  readonly sprintPath: string;
}

export type CanonicalSprintRead =
  | { readonly ok: true; readonly commit: string; readonly text: string }
  | { readonly ok: false; readonly error: string };

function unsafeSprintPath(sprintPath: string): boolean {
  return sprintPath.length === 0
    || sprintPath.startsWith('/')
    || sprintPath.startsWith('-')
    || sprintPath.includes('\0')
    || sprintPath.includes('\n')
    || sprintPath.includes('\r')
    || sprintPath.split('/').includes('..');
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Read one sprint file at one commit. The ref is resolved to a commit first,
 * so the returned bytes and the returned SHA are the same observation and a
 * caller re-reading after its write can tell a moved ref from a moved file.
 */
export function readCanonicalSprint(
  cwd: string,
  source: CanonicalSprintSource,
): CanonicalSprintRead {
  if (unsafeSprintPath(source.sprintPath)) {
    return { ok: false, error: `unsafe canonical sprint path: ${JSON.stringify(source.sprintPath)}` };
  }
  if (source.targetRef.length === 0 || source.targetRef.startsWith('-')) {
    return { ok: false, error: `unsafe canonical target ref: ${JSON.stringify(source.targetRef)}` };
  }

  let commit: string;
  try {
    commit = git(cwd, ['rev-parse', '--verify', '--end-of-options', `${source.targetRef}^{commit}`]).trim();
  } catch {
    return { ok: false, error: `canonical target ref does not resolve to a commit: ${source.targetRef}` };
  }
  if (!/^[0-9a-f]{40,64}$/.test(commit)) {
    return { ok: false, error: `canonical target ref resolved to an unexpected commit: ${commit}` };
  }

  try {
    // `git show <sha>:<path>` takes one object name, so no `--` separator is
    // available here; both halves are validated above instead.
    return { ok: true, commit, text: git(cwd, ['show', `${commit}:${source.sprintPath}`]) };
  } catch {
    return {
      ok: false,
      error: `canonical sprint ${source.sprintPath} is absent at ${source.targetRef} (${commit})`,
    };
  }
}
