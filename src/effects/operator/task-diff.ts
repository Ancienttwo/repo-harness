import { isAdmittedSessionSelector, type AdmittedSessionSelector } from '../../core/sessions/session-selector';
import { TASK_DIFF_MAX_UNTRACKED, type OperatorTaskDiff } from '../../core/operator/task-diff';
import type { readReviewAdmissionSource } from '../admission/admission-source';
import { observeAdmittedSessionSource, SessionObservationError, runSessionObservationGit as git, refuseSessionObservation as refuse } from '../sessions/admitted-source';

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

/** Synchronous local authority/Git reads run only in the cancellable worker. */
export function readOperatorTaskDiff(input: AdmittedSessionSelector & { readonly env?: NodeJS.ProcessEnv },
  effects: { readonly admissionSource?: typeof readReviewAdmissionSource } = {}): OperatorTaskDiff {
  const { env, ...selector } = input;
  try {
    if (!isAdmittedSessionSelector(selector)) return refuse('unavailable');
    const authority = () => observeAdmittedSessionSource(input, effects);
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
      ...selector, protocol: 2, kind: 'operator_task_diff',
      target_ref: before.targetRef, branch: before.branch, base_sha: before.base, head_sha: head,
      observed_at: new Date().toISOString(), patch, untracked_paths: untracked,
    };
  } catch (error) {
    if (error instanceof SessionObservationError) throw error;
    return refuse('unavailable');
  }
}
