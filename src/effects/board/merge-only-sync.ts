import { gitSpawnSync, withoutRepositorySelectingGitEnv } from '../git/runner';

const SYNC_GIT_TIMEOUT_MS = 30_000;
const SYNC_DIFF_MAX_BYTES = 256 * 1024 * 1024;

export interface MergeOnlySyncInput {
  readonly repo_root: string;
  readonly pr: number;
  readonly base_ref: string;
  readonly base_sha: string;
  readonly head_sha: string;
}

function git(repoRoot: string, args: readonly string[], input?: Buffer) {
  return gitSpawnSync(args, {
    cwd: repoRoot, env: withoutRepositorySelectingGitEnv(), input, maxBuffer: SYNC_DIFF_MAX_BYTES, timeout: SYNC_GIT_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
}

function ok(repoRoot: string, args: readonly string[], input?: Buffer): Buffer | null {
  const run = git(repoRoot, args, input);
  return run.error === undefined && run.status === 0 ? run.stdout : null;
}

const hasCommit = (repoRoot: string, sha: string): boolean => ok(repoRoot, ['cat-file', '-e', `${sha}^{commit}`]) !== null;

/**
 * The patch id of the PR diff of one head: `git diff <merge-base> <head> | git patch-id --verbatim`. `--verbatim` keeps whitespace, so a
 * merge that changes a space inside a string or an indentation changes the id; `--stable` would strip it. Null when git cannot compute it.
 */
function prPatchId(repoRoot: string, baseSha: string, head: string): string | null {
  const bases = ok(repoRoot, ['merge-base', '--all', baseSha, head])?.toString('utf8').trim().split('\n') ?? [];
  // A criss-cross history has no one PR diff.
  if (bases.length !== 1 || !/^[0-9a-f]{40}$/u.test(bases[0]!)) return null;
  // `--binary` puts the content of a binary file in the patch, so a changed blob changes the id.
  const diff = ok(repoRoot, ['diff', '--binary', '--no-renames', '--no-ext-diff', '--no-textconv', '--no-color', bases[0]!, head]);
  if (diff === null || diff.length === 0) return null;
  const id = ok(repoRoot, ['patch-id', '--verbatim'], diff)?.toString('utf8').trim().split(/\s+/u)[0];
  return id !== undefined && /^[0-9a-f]{40}$/u.test(id) ? id : null;
}

/**
 * The reviewed heads of which git proves the head a merge-only sync (#2074): the reviewed head is an ancestor of the head, every commit
 * that the head adds outside the base is a merge commit, and the PR patch ids of both heads are equal. Any git failure, a missing object
 * after one fetch, or a criss-cross merge base leaves a reviewed head out: the head then needs its own review.
 */
export function provenMergeOnlySyncs(input: MergeOnlySyncInput, reviewed: readonly string[]): readonly string[] {
  const { repo_root: root, base_sha: base, head_sha: head } = input;
  if (reviewed.length === 0) return [];
  if (![base, head, ...reviewed].every(sha => hasCommit(root, sha))) {
    // `--refmap=` drops the configured `remote.origin.fetch` mapping and the refspecs name no destination, so the fetch writes objects only.
    const fetched = ok(root, ['fetch', '--no-tags', '--quiet', '--refmap=', '--no-write-fetch-head', 'origin', `refs/pull/${input.pr}/head`, `refs/heads/${input.base_ref}`]);
    if (fetched === null || ![base, head].every(sha => hasCommit(root, sha))) return [];
  }
  const headId = prPatchId(root, base, head);
  if (headId === null) return [];
  return reviewed.filter(sha => hasCommit(root, sha)
    && ok(root, ['merge-base', '--is-ancestor', sha, head]) !== null
    && ok(root, ['rev-list', '--no-merges', head, `^${sha}`, `^${base}`])?.length === 0
    && prPatchId(root, base, sha) === headId);
}
