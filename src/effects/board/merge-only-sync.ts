import { gitSpawnSync, withoutRepositorySelectingGitEnv } from '../git/runner';

const SYNC_GIT_TIMEOUT_MS = 30_000;
const SHA = /^[0-9a-f]{40}$/u;

export interface MergeOnlySyncInput {
  readonly repo_root: string;
  readonly pr: number;
  readonly base_ref: string;
  readonly base_sha: string;
  readonly head_sha: string;
}

/** The trimmed stdout of a git call that exited 0; null for any other end. */
function ok(repoRoot: string, args: readonly string[]): string | null {
  const run = gitSpawnSync(args, { cwd: repoRoot, env: withoutRepositorySelectingGitEnv(), encoding: 'utf8', timeout: SYNC_GIT_TIMEOUT_MS, killSignal: 'SIGKILL' });
  return run.error === undefined && run.status === 0 ? run.stdout.trim() : null;
}

const hasCommit = (repoRoot: string, sha: string): boolean => ok(repoRoot, ['cat-file', '-e', `${sha}^{commit}`]) !== null;
const isAncestor = (repoRoot: string, ancestor: string, of: string): boolean => ok(repoRoot, ['merge-base', '--is-ancestor', ancestor, of]) !== null;

/**
 * True when one merge commit is the clean automatic merge of its two parents: one parent is in the base, the parents have one merge
 * base, and `git merge-tree --write-tree` of the parents exits 0 with the tree of the merge commit. Each byte of the merge result is
 * then what git computes, so a merge that moves, edits or re-indents a line of the PR is refused. A conflict, even one resolved to the
 * PR side, gives no proof.
 */
function cleanMergeOfBase(repoRoot: string, base: string, line: string): boolean {
  const [merge, ...parents] = line.split(' ');
  if (merge === undefined || parents.length !== 2 || ![merge, ...parents].every(sha => SHA.test(sha))) return false;
  const [left, right] = parents as [string, string];
  if (!isAncestor(repoRoot, left, base) && !isAncestor(repoRoot, right, base)) return false;
  if (ok(repoRoot, ['merge-base', '--all', left, right])?.split('\n').length !== 1) return false;
  const tree = ok(repoRoot, ['merge-tree', '--write-tree', left, right]);
  return tree !== null && SHA.test(tree) && tree === ok(repoRoot, ['rev-parse', `${merge}^{tree}`]);
}

/** The head adds, outside the reviewed head and the base, only clean automatic merges of the base, and at least one. */
function mergeOnlySync(repoRoot: string, base: string, head: string, reviewed: string): boolean {
  if (!hasCommit(repoRoot, reviewed) || !isAncestor(repoRoot, reviewed, head)) return false;
  if (ok(repoRoot, ['rev-list', '--no-merges', head, `^${reviewed}`, `^${base}`]) !== '') return false;
  const merges = ok(repoRoot, ['rev-list', '--merges', '--parents', head, `^${reviewed}`, `^${base}`]);
  return merges !== null && merges !== '' && merges.split('\n').every(line => cleanMergeOfBase(repoRoot, base, line));
}

/**
 * The reviewed heads of which git proves the head a merge-only sync (#2074): the reviewed head is an ancestor of the head, and every
 * commit that the head adds outside the reviewed head and the base is a clean automatic merge of the base (`cleanMergeOfBase`). Any git
 * failure, a failed fetch or an object still missing after it leaves a reviewed head out: the head then needs its own review.
 */
export function provenMergeOnlySyncs(input: MergeOnlySyncInput, reviewed: readonly string[]): readonly string[] {
  const { repo_root: root, base_sha: base, head_sha: head } = input;
  if (reviewed.length === 0) return [];
  if (![base, head, ...reviewed].every(sha => hasCommit(root, sha))) {
    // `--refmap=` drops the configured `remote.origin.fetch` mapping and the refspecs name no destination, so the fetch writes objects only.
    const fetched = ok(root, ['fetch', '--no-tags', '--quiet', '--refmap=', '--no-write-fetch-head', 'origin', `refs/pull/${input.pr}/head`, `refs/heads/${input.base_ref}`]);
    if (fetched === null || ![base, head].every(sha => hasCommit(root, sha))) return [];
  }
  return reviewed.filter(sha => mergeOnlySync(root, base, head, sha));
}
