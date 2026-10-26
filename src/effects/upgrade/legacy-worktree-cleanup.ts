import { existsSync, realpathSync } from 'fs';
import { basename, dirname, join } from 'path';
import { configuredGitBinary, resolveGitCommonDirectory } from '../git/common-directory';
import { isManagedWorktreePath, managedWorktreeRoot } from '../git/managed-worktree';
import { gitExecFileSync } from '../git/runner';
import type { WorktreeEntry } from '../git/worktree-topology';
import {
  assertBranchHasCommits,
  assertNoOwner,
  assertNoSubmodules,
  checkoutPath,
  entries,
  mergeBackTarget,
  mergeProof,
  protectsCwd,
  removeExactWorktree,
  type ExactWorktreeCleanup,
} from '../state/coordination-worktree-topology';
import { taskWorktreeRuntimeClosed } from '../terminal/task-session';

/** `remove` and `keep` are preview verdicts; `removed` and `failed` are apply outcomes. */
export type LegacyWorktreeVerdict = 'remove' | 'keep' | 'removed' | 'failed';

export interface LegacyWorktreeCandidate {
  readonly path: string;
  readonly branch: string | null;
  readonly head: string | null;
  readonly verdict: LegacyWorktreeVerdict;
  readonly reason: string;
  /** Recreates the checkout and its branch after removal. */
  readonly rebuild: string | null;
}

export interface LegacyWorktreeOutcome {
  readonly candidates: readonly LegacyWorktreeCandidate[];
  readonly error?: string;
}

export interface LegacyWorktreeCleanupOptions {
  readonly ghBin?: string;
  /** Runs before each removal, so the rebuild data is out before any deletion. */
  readonly beforeRemove?: (candidate: LegacyWorktreeCandidate) => void;
}

type Limits = { readonly gitBin: string; readonly ghBin?: string };
interface PlannedCandidate {
  readonly candidate: LegacyWorktreeCandidate;
  readonly expected?: ExactWorktreeCleanup;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message.split('\n')[0]! : String(error);
}

function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * True when the merge-back target is, or tracks, the named branch. A remote
 * name may contain slashes, so a remote ref protects every branch whose name is
 * a suffix of it; that over-protects and never parses the remote name. A target
 * that is not a branch (tag, detached, unresolved) protects nothing, so the
 * caller must refuse to remove.
 */
function protectsIntegrationBranch(main: string, targetRef: string, branch: string, limits: Limits): boolean {
  let full = '';
  try {
    full = gitExecFileSync(['rev-parse', '--symbolic-full-name', targetRef], {
      cwd: main, gitBin: limits.gitBin, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch { /* an unresolved target is not a branch */ }
  if (full.startsWith('refs/heads/')) return full === `refs/heads/${branch}`;
  if (full.startsWith('refs/remotes/')) return full.endsWith(`/${branch}`);
  throw new Error('integration target is not a branch');
}

/** Resolve the parent only. A missing parent cannot be beside the primary checkout. */
function resolvedParentPath(path: string): string | null {
  try { return join(realpathSync(dirname(path)), basename(path)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

/**
 * Candidates come only from this clone's Git inventory, never from directory
 * names. The managed root belongs to the sweep, so it is never a candidate here.
 */
function plan(cwd: string, callerCwd: string, env: NodeJS.ProcessEnv, options: LegacyWorktreeCleanupOptions) {
  const limits: Limits = { gitBin: configuredGitBinary(env), ...(options.ghBin ? { ghBin: options.ghBin } : {}) };
  const topology = entries(cwd, limits);
  const primary = topology[0];
  if (!primary) return { main: '', common: '', limits, planned: [] as PlannedCandidate[] };
  const main = checkoutPath(primary.path);
  const siblings = topology.slice(1)
    .map((entry) => ({ entry, path: resolvedParentPath(entry.path) }))
    .filter((item): item is { entry: WorktreeEntry; path: string } => item.path !== null && dirname(item.path) === dirname(main));
  if (siblings.length === 0) return { main, common: '', limits, planned: [] as PlannedCandidate[] };
  const managedRoot = managedWorktreeRoot(env);
  const candidates = siblings.filter(({ path }) => !isManagedWorktreePath(path, managedRoot));
  if (candidates.length === 0) return { main, common: '', limits, planned: [] as PlannedCandidate[] };
  const common = resolveGitCommonDirectory(main, limits.gitBin);
  const caller = realpathSync(callerCwd);
  let target: ReturnType<typeof mergeBackTarget> | undefined;
  let targetError = '';
  try { target = mergeBackTarget(main, limits); } catch (error) { targetError = message(error); }
  const planned = candidates.map(({ entry, path }): PlannedCandidate => {
    const branch = entry.branch?.startsWith('refs/heads/') ? entry.branch.slice('refs/heads/'.length) : null;
    const head = entry.head;
    const keep = (reason: string): PlannedCandidate => ({ candidate: { path, branch, head, verdict: 'keep', reason, rebuild: null } });
    try {
      if (protectsCwd(path, caller)) return keep('current checkout');
      if (entry.locked) return keep('locked');
      if (!branch || !head) return keep('no local branch');
      if (!existsSync(path)) return keep('checkout is missing');
      if (checkoutPath(path) !== path) return keep('checkout path is not canonical');
      // Ownership precedes the merge proof, because that proof can query the provider.
      assertNoOwner(main, path, limits);
      if (!taskWorktreeRuntimeClosed({ repository_id: common, primary_root: main, execution_root: path })) return keep('runtime is open');
      const status = gitExecFileSync(['status', '--porcelain', '--untracked-files=all'], {
        cwd: path, gitBin: limits.gitBin, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      if (status) return keep('dirty worktree');
      assertNoSubmodules({ main, limits }, path);
      // A head reachable from the target proves nothing for a branch with no
      // commits of its own, such as a cloned integration branch or a fresh branch.
      assertBranchHasCommits(main, branch, limits);
      if (!target) return keep(targetError);
      // The integration branch is never a task branch, even when it holds direct commits.
      if (protectsIntegrationBranch(main, target.targetRef, branch, limits)) return keep('integration branch');
      const proof = mergeProof(main, branch, head, target.targetRef, target.target, limits);
      return {
        candidate: {
          path, branch, head, verdict: 'remove',
          reason: `${proof.provider ? 'provider-proven merge' : 'merged'} into ${target.targetRef}`,
          rebuild: `git worktree add -b ${shellQuote(branch)} ${shellQuote(path)} ${head}`,
        },
        expected: { worktree: path, branch, head_sha: head, target_ref: target.targetRef, target_oid: target.target, merge_commit_sha: proof.merge_commit_sha },
      };
    } catch (error) { return keep(message(error)); }
  });
  return { main, common, limits, planned };
}

/**
 * One-shot, operator-run cleanup of linked worktrees beside the primary
 * checkout. Preview is read-only. Apply removes only `remove` candidates
 * through the closeout barrier, which proves every condition again under the
 * topology lock; a candidate that changed is kept and reported. `cwd` selects
 * the repository; `callerCwd` and everything below it are never removed.
 */
export function runLegacyWorktreeCleanup(
  cwd: string,
  callerCwd: string,
  env: NodeJS.ProcessEnv,
  apply: boolean,
  options: LegacyWorktreeCleanupOptions = {},
): LegacyWorktreeOutcome {
  let result;
  try { result = plan(cwd, callerCwd, env, options); }
  catch (error) { return { candidates: [], error: message(error) }; }
  const { main, common, limits, planned } = result;
  if (!apply) return { candidates: planned.map((item) => item.candidate) };
  const failures: string[] = [];
  const candidates = planned.map(({ candidate, expected }): LegacyWorktreeCandidate => {
    if (!expected) return candidate;
    options.beforeRemove?.(candidate);
    const progress = { removing: false };
    try {
      removeExactWorktree(main, expected, limits, () => {
        assertBranchHasCommits(main, expected.branch, limits);
        if (protectsIntegrationBranch(main, expected.target_ref, expected.branch, limits)) throw new Error('integration branch');
        assertNoSubmodules({ main, limits }, expected.worktree);
        if (!taskWorktreeRuntimeClosed({ repository_id: common, primary_root: main, execution_root: expected.worktree })) throw new Error('runtime is open');
        progress.removing = true;
      });
      return { ...candidate, verdict: 'removed' };
    } catch (error) {
      if (!progress.removing) return { ...candidate, verdict: 'keep', reason: `changed before removal: ${message(error)}` };
      failures.push(`${candidate.path}: ${message(error)}`);
      return { ...candidate, verdict: 'failed', reason: message(error) };
    }
  });
  return { candidates, ...(failures.length ? { error: `legacy worktree removal failed: ${failures.join('; ')}` } : {}) };
}

export function formatLegacyWorktreeOutcome(outcome: LegacyWorktreeOutcome): string[] {
  const lines = ['project legacy-worktree:'];
  for (const item of outcome.candidates) {
    lines.push(`  ${item.path}: branch=${item.branch ?? 'none'}; head=${item.head ?? 'none'}; ${item.verdict}; ${item.reason}`);
    if (item.rebuild) lines.push(`    rebuild: ${item.rebuild}`);
  }
  if (outcome.candidates.some((item) => item.verdict === 'remove')) {
    lines.push('  note: removal also deletes ignored files in the checkout (for example .env); commit or copy anything you need first.');
  }
  if (outcome.error) lines.push(`  error: ${outcome.error}`);
  return lines;
}
