import { execFileSync } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { TASK_DIFF_MAX_BYTES, TASK_DIFF_MAX_UNTRACKED, isTaskDiffRequest, type OperatorTaskDiff, type OperatorTaskDiffRequest, type TaskDiffFailure } from '../../core/operator/task-diff';
import { lookupCanonicalTask } from '../../core/state/coordination-identity';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { readWorktreeTopology } from '../git/worktree-topology';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { readActiveSprintPath, readCanonicalTargetRef } from '../state/collect-board-inputs';
import { readCanonicalSprint, resolveRepoIdentity } from '../state/coordination-canonical-source';
import { readLease } from '../state/coordination-lease-store';

export class OperatorTaskDiffError extends Error {
  constructor(readonly code: TaskDiffFailure) { super(code); }
}
const refuse = (code: TaskDiffFailure): never => { throw new OperatorTaskDiffError(code); };

function git(cwd: string, args: string[], allowNoMatch = false): string {
  try {
    const bytes = execFileSync('git', ['--no-pager', '-c', 'core.fsmonitor=false', ...args], {
      cwd, timeout: 5000, maxBuffer: TASK_DIFF_MAX_BYTES, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' },
    });
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text;
  } catch (error) {
    if (allowNoMatch && (error as { status?: number }).status === 1) return '';
    if ((error as NodeJS.ErrnoException).code === 'ENOBUFS') return refuse('too_large');
    return refuse('unavailable');
  }
}

/** Filters may execute commands even with --no-ext-diff and --no-textconv.
 * Refuse them rather than silently changing the repository's Git semantics.
 */
function refuseExternalFilters(cwd: string): void {
  const output = git(cwd, ['config', '--includes', '--null', '--get-regexp', '^filter\\..*\\.(clean|process)$'], true);
  if (!output) return;
  if (!output.endsWith('\0')) return refuse('unavailable');
  const effective = new Map<string, string>();
  for (const record of output.slice(0, -1).split('\0')) {
    const separator = record.indexOf('\n');
    if (separator < 1) return refuse('unavailable');
    effective.set(record.slice(0, separator), record.slice(separator + 1));
  }
  if ([...effective.values()].some(command => command !== '')) return refuse('filters_unsupported');
}

// Git omits worktree checks for assume-unchanged (lowercase tag) and
// skip-worktree (`S`) entries; never label that an empty diff.
function refuseHiddenWorktreeEntries(cwd: string): void {
  const entries = git(cwd, ['ls-files', '-v', '-z']);
  if (entries && !entries.endsWith('\0')) return refuse('unavailable');
  if (entries.split('\0').some(entry => /^[a-zS] /.test(entry))) return refuse('index_unsupported');
}

// Windows short/long path spellings can survive realpath. Bind physical directories.
function sameDirectory(left: string, right: string): boolean {
  try {
    const a = statSync(left, { bigint: true });
    const b = statSync(right, { bigint: true });
    return a.isDirectory() && b.isDirectory() && a.ino !== 0n && b.ino !== 0n
      && a.dev === b.dev && a.ino === b.ino;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Synchronous local authority/Git reads run only in the cancellable worker. */
export function readOperatorTaskDiff(input: OperatorTaskDiffRequest & { readonly env?: NodeJS.ProcessEnv }): OperatorTaskDiff {
  try {
    if (!isTaskDiffRequest(input)) return refuse('unavailable');
    const authority = () => {
      const registry = readRepoHarnessRegistryStrictSnapshot({ env: input.env, adoptedOnly: false });
      const repo = registry.repos.find(r => r.id === input.repository_id);
      if (!repo) return refuse('unavailable');
      const root = realpathSync(repo.path);
      const sprintPath = readActiveSprintPath(root);
      if (!sprintPath) return refuse('unavailable');
      const targetRef = readCanonicalTargetRef(root);
      const canonical = readCanonicalSprint(root, { targetRef, sprintPath });
      if (!canonical.ok) return refuse('unavailable');
      const task = lookupCanonicalTask({ repoIdentity: resolveRepoIdentity(root), sprintPath, sprintText: canonical.text }, input.task_id);
      if (!task.ok || task.task.task_revision !== input.task_revision) return refuse('stale');
      const lease = readLease(root, input.task_id);
      const owner = lease.record;
      if (!owner || !owner.execution_worktree || !owner.branch || !['bound', 'reviewing', 'completing'].includes(owner.state)) return refuse('unavailable');
      if (owner.claim_id !== input.claim_id || owner.generation !== input.generation || owner.task_revision !== input.task_revision
        || owner.target_ref !== targetRef || owner.sprint_path !== sprintPath) return refuse('stale');
      const worktree = realpathSync(owner.execution_worktree);
      if (worktree !== owner.execution_worktree || !sameDirectory(resolveGitCommonDirectory(root), resolveGitCommonDirectory(worktree))) return refuse('unavailable');
      const entry = readWorktreeTopology(root).worktrees.find(w => sameDirectory(w.path, worktree));
      if (!entry || entry.branch !== `refs/heads/${owner.branch}` || entry.detached) return refuse('unavailable');
      if (!sameDirectory(git(worktree, ['rev-parse', '--show-toplevel']).trim(), worktree)
        || git(worktree, ['symbolic-ref', 'HEAD']).trim() !== entry.branch) return refuse('unavailable');
      return { root, worktree, base: canonical.commit, targetRef, branch: owner.branch, lease: lease.raw };
    };
    const before = authority();
    refuseExternalFilters(before.worktree);
    const head = git(before.worktree, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
    const patchArgs = ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--ignore-submodules=none', '--submodule=short', '--src-prefix=a/', '--dst-prefix=b/', before.base, '--'];
    refuseHiddenWorktreeEntries(before.worktree);
    const patch = git(before.worktree, patchArgs);
    const rawUntracked = git(before.worktree, ['ls-files', '--others', '--exclude-standard', '-z']);
    const untracked = rawUntracked === '' ? [] : rawUntracked.slice(0, -1).split('\0');
    if (untracked.length > TASK_DIFF_MAX_UNTRACKED) return refuse('too_large');
    refuseHiddenWorktreeEntries(before.worktree);
    // Re-observe content as well as ownership: HEAD alone misses agent edits.
    if (git(before.worktree, patchArgs) !== patch
      || git(before.worktree, ['ls-files', '--others', '--exclude-standard', '-z']) !== rawUntracked) return refuse('stale');
    const after = authority();
    if (JSON.stringify(before) !== JSON.stringify(after) || git(before.worktree, ['rev-parse', '--verify', 'HEAD^{commit}']).trim() !== head) return refuse('stale');
    return {
      protocol: 1, kind: 'operator_task_diff', repository_id: input.repository_id, task_id: input.task_id,
      task_revision: input.task_revision, claim_id: input.claim_id, generation: input.generation,
      target_ref: before.targetRef, branch: before.branch, base_sha: before.base, head_sha: head,
      observed_at: new Date().toISOString(), patch, untracked_paths: untracked,
    };
  } catch (error) {
    if (error instanceof OperatorTaskDiffError) throw error;
    return refuse('unavailable');
  }
}
