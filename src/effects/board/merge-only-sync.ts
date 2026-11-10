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

function git(repoRoot: string, args: readonly string[]) {
  return gitSpawnSync(args, { cwd: repoRoot, env: withoutRepositorySelectingGitEnv(), encoding: 'utf8', timeout: SYNC_GIT_TIMEOUT_MS, killSignal: 'SIGKILL' });
}

/** The trimmed stdout of a git call that exited 0; null for any other end. */
function ok(repoRoot: string, args: readonly string[]): string | null {
  const run = git(repoRoot, args);
  return run.error === undefined && run.status === 0 ? run.stdout.trim() : null;
}

/** A git question with a yes/no exit (0 or 1). A spawn error, a signal, a timeout or another exit is `error`, never `no`. */
function ask(repoRoot: string, args: readonly string[]): 'yes' | 'no' | 'error' {
  const run = git(repoRoot, args);
  return run.error !== undefined ? 'error' : run.status === 0 ? 'yes' : run.status === 1 ? 'no' : 'error';
}

const hasCommit = (repoRoot: string, sha: string): boolean => ok(repoRoot, ['cat-file', '-e', `${sha}^{commit}`]) !== null;
const isAncestor = (repoRoot: string, ancestor: string, of: string) => ask(repoRoot, ['merge-base', '--is-ancestor', ancestor, of]);

type Verdict = 'yes' | 'no' | 'error';

/** `yes` when the PR diff of one head, from its one merge base with the base, is not empty. */
function hasPrDiff(repoRoot: string, base: string, head: string): Verdict {
  const bases = ok(repoRoot, ['merge-base', '--all', base, head]);
  if (bases === null) return 'error';
  if (bases.split('\n').length !== 1 || !SHA.test(bases)) return 'no';
  // `diff --quiet` exits 1 when the diff is not empty.
  const empty = ask(repoRoot, ['diff', '--quiet', '--no-ext-diff', '--no-textconv', bases, head]);
  return empty === 'error' ? 'error' : empty === 'no' ? 'yes' : 'no';
}

/**
 * `yes` when one merge commit is the clean automatic merge of its two parents: one parent is in the base, the parents have one merge
 * base, and `git merge-tree --write-tree` of the parents exits 0 with the tree of the merge commit. Each byte of the merge result is
 * then what git computes, so a merge that moves, edits or re-indents a line of the PR is refused. A conflict (exit 1), even one
 * resolved to the PR side, is `no`.
 */
function cleanMergeOfBase(repoRoot: string, base: string, line: string): Verdict {
  const [merge, ...parents] = line.split(' ');
  if (merge === undefined || parents.length !== 2 || ![merge, ...parents].every(sha => SHA.test(sha))) return 'no';
  const [left, right] = parents as [string, string];
  // A parent that is not in the base lets the other parent decide; a failed check of either parent is an error.
  const inBase = [isAncestor(repoRoot, left, base), isAncestor(repoRoot, right, base)];
  if (inBase.includes('error')) return 'error';
  if (!inBase.includes('yes')) return 'no';
  const bases = ok(repoRoot, ['merge-base', '--all', left, right]);
  if (bases === null) return 'error';
  if (bases.split('\n').length !== 1) return 'no';
  const run = git(repoRoot, ['merge-tree', '--write-tree', left, right]);
  if (run.error !== undefined || (run.status !== 0 && run.status !== 1)) return 'error';
  if (run.status === 1) return 'no';
  const tree = run.stdout.trim(), own = ok(repoRoot, ['rev-parse', `${merge}^{tree}`]);
  if (!SHA.test(tree) || own === null) return 'error';
  return tree === own ? 'yes' : 'no';
}

/** The head adds, outside the reviewed head and the base, only clean automatic merges of the base, and at least one. Both PR diffs are not empty. */
function mergeOnlySync(repoRoot: string, base: string, head: string, reviewed: string): Verdict {
  // After the fetch of the head, a reviewed head that is still missing is not in its history.
  // `rev-parse --verify --quiet` exits 1 for a missing object; `cat-file -e` gives 128 for it and for any other git fault.
  const present = ask(repoRoot, ['rev-parse', '--verify', '--quiet', `${reviewed}^{commit}`]);
  if (present !== 'yes') return present;
  const steps: (() => Verdict)[] = [
    () => isAncestor(repoRoot, reviewed, head),
    // A reviewed change that the base already holds leaves no PR diff to carry an acceptance for.
    () => hasPrDiff(repoRoot, base, reviewed),
    () => hasPrDiff(repoRoot, base, head),
    () => {
      const added = ok(repoRoot, ['rev-list', '--no-merges', head, `^${reviewed}`, `^${base}`]);
      return added === null ? 'error' : added === '' ? 'yes' : 'no';
    },
    () => {
      const merges = ok(repoRoot, ['rev-list', '--merges', '--parents', head, `^${reviewed}`, `^${base}`]);
      if (merges === null) return 'error';
      if (merges === '') return 'no';
      for (const line of merges.split('\n')) {
        const verdict = cleanMergeOfBase(repoRoot, base, line);
        if (verdict !== 'yes') return verdict;
      }
      return 'yes';
    },
  ];
  for (const step of steps) {
    const verdict = step();
    if (verdict !== 'yes') return verdict;
  }
  return 'yes';
}

/**
 * The reviewed heads of which git proves the head a merge-only sync (#2074): the reviewed head is an ancestor of the head, both PR diffs
 * are not empty, and every commit that the head adds outside the reviewed head and the base is a clean automatic merge of the base
 * (`cleanMergeOfBase`). A failed fetch, or a git error for any candidate, proves none: the board then cannot tell whether a FAIL row of
 * that candidate stands on a sync of the head, so the head needs its own review.
 */
export function provenMergeOnlySyncs(input: MergeOnlySyncInput, reviewed: readonly string[]): readonly string[] {
  const { repo_root: root, base_sha: base, head_sha: head } = input;
  if (reviewed.length === 0) return [];
  if (![base, head, ...reviewed].every(sha => hasCommit(root, sha))) {
    // `--refmap=` drops the configured `remote.origin.fetch` mapping and the refspecs name no destination, so the fetch writes objects only.
    const fetched = ok(root, ['fetch', '--no-tags', '--quiet', '--refmap=', '--no-write-fetch-head', 'origin', `refs/pull/${input.pr}/head`, `refs/heads/${input.base_ref}`]);
    if (fetched === null || ![base, head].every(sha => hasCommit(root, sha))) return [];
  }
  const verdicts = reviewed.map(sha => [sha, mergeOnlySync(root, base, head, sha)] as const);
  if (verdicts.some(([, verdict]) => verdict === 'error')) return [];
  return verdicts.filter(([, verdict]) => verdict === 'yes').map(([sha]) => sha);
}
