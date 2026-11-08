import { realpathSync } from 'fs';
import { architecturePort, isArchitectureUnavailable } from '../../core/architecture/contracts';
import type { BoardHostPortsV1, BoardSeatTerminalReadV1 } from '../../core/board/board';
import { gitSpawnSync, withoutRepositorySelectingGitEnv } from '../git/runner';
import { worktreeProcesses } from '../git/worktree-processes';
import { checkoutPath, entries, mergeBackTarget, protectsCwd, removeExactWorktree } from '../state/coordination-worktree-topology';
import { cleanupTaskWorktree } from '../terminal/runtime-closeout';
import { BoardCollectError, readGhJson, readRepositoryId, type GhInput } from './collect';

/**
 * The post-merge closeout of one pull request (#2005). Each seat terminal of the PR closes only when its checkout is
 * clean and has nothing outside `origin/<branch>`. The PR head worktree is then removed through the exact closeout
 * path of `contract-worktree cleanup`, only after no process runs in it. Everything that fails a check stays.
 */
export const BOARD_CLOSEOUT_KIND = 'repo-harness.board-closeout' as const;

export interface BoardCloseoutPaneV1 {
  readonly address: string;
  readonly seat: string | null;
  readonly outcome: 'closed' | 'kept';
  readonly reason: string | null;
}

export interface BoardCloseoutV1 {
  readonly kind: typeof BOARD_CLOSEOUT_KIND;
  readonly pr: number;
  readonly merge_commit: string;
  readonly panes: readonly BoardCloseoutPaneV1[];
  readonly worktree: { readonly path: string | null; readonly outcome: 'removed' | 'kept' | 'absent'; readonly reason: string | null };
  /** The architecture daemon stop of the removed worktree; it never blocks the removal, as in `contract-worktree cleanup`. */
  readonly daemon_stop_failures: readonly string[];
}

export interface BoardCloseoutInput extends GhInput {
  readonly pr: number;
  readonly host: Pick<BoardHostPortsV1, 'seatTerminals' | 'closeTerminal'>;
  /** Stops the architecture daemons of a checkout and returns the failures. */
  readonly stopDaemons: (worktree: string) => readonly string[];
  /** `HC_TERMINAL_ID` of the caller: closeout never ends its own terminal. */
  readonly caller_terminal: string | null;
}

interface MergedPullRequest {
  readonly number: number;
  readonly head_ref: string;
  readonly head_oid: string;
  readonly merge_commit: string;
  readonly closing_issues: readonly number[];
}

const OID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;

function readMergedPullRequest(input: BoardCloseoutInput): MergedPullRequest {
  const read = readGhJson(input, ['pr', 'view', String(input.pr), '--json', 'number,state,headRefName,headRefOid,mergeCommit,closingIssuesReferences']) as {
    number?: unknown; state?: unknown; headRefName?: unknown; headRefOid?: unknown; mergeCommit?: { oid?: unknown } | null; closingIssuesReferences?: unknown;
  } | null;
  if (read?.number !== input.pr) throw new BoardCollectError(`gh pr view ${input.pr} returned another pull request`);
  if (read.state !== 'MERGED') throw new BoardCollectError(`#${input.pr} is not merged (${String(read.state)}); closeout runs only after a merge`);
  const merge = read.mergeCommit?.oid;
  if (typeof read.headRefName !== 'string' || typeof read.headRefOid !== 'string' || !OID.test(read.headRefOid)
    || typeof merge !== 'string' || !OID.test(merge) || !Array.isArray(read.closingIssuesReferences)) {
    throw new BoardCollectError(`gh pr view ${input.pr} has no head branch, head sha, merge commit or closing issue list`);
  }
  const closing = read.closingIssuesReferences.map(entry => (entry as { number?: unknown } | null)?.number);
  if (!closing.every(number => Number.isSafeInteger(number))) throw new BoardCollectError(`gh pr view ${input.pr} has an invalid closing issue`);
  return { number: input.pr, head_ref: read.headRefName, head_oid: read.headRefOid, merge_commit: merge, closing_issues: closing as number[] };
}

function git(cwd: string, args: readonly string[]): { readonly ok: boolean; readonly out: string } {
  // The directory selects the repository, so a git variable of this process must not.
  const run = gitSpawnSync([...args], { cwd, env: withoutRepositorySelectingGitEnv(), encoding: 'utf8', timeout: 10_000 });
  return { ok: run.error === undefined && run.status === 0, out: (run.stdout ?? '').trim() };
}

/** The reason to keep the pane of `cwd`, or null when its checkout is clean and fully on `origin/<branch>`. */
function paneKeepReason(cwd: string | null): string | null {
  if (cwd === null) return 'cwd_unknown';
  const status = git(cwd, ['status', '--porcelain', '--untracked-files=all']);
  if (!status.ok) return 'git_status_failed';
  if (status.out !== '') return 'dirty';
  const branch = git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!branch.ok) return 'no_branch';
  const ahead = git(cwd, ['rev-list', '--count', `refs/remotes/origin/${branch.out}..HEAD`]);
  if (!ahead.ok) return `no_origin_branch origin/${branch.out}`;
  return ahead.out === '0' ? null : `unpushed ${ahead.out} commit(s) on ${branch.out}`;
}

/**
 * A seat pane of the PR: its pr label, a closing issue label, or a working directory inside the PR head worktree.
 * A terminal without a seat label is a task session; the runtime cleanup of the worktree owns it.
 */
function paneOfPullRequest(terminal: BoardSeatTerminalReadV1, pr: MergedPullRequest, worktree: string | null): boolean {
  const { labels } = terminal;
  if (labels.seat === undefined) return false;
  if (labels.pr === String(pr.number)) return true;
  if (labels.issue !== undefined && pr.closing_issues.some(issue => String(issue) === labels.issue)) return true;
  if (worktree === null || terminal.cwd === null) return false;
  try { return protectsCwd(worktree, realpathSync(terminal.cwd)); } catch { return false; }
}

function closePanes(input: BoardCloseoutInput, pr: MergedPullRequest, worktree: string | null): BoardCloseoutPaneV1[] {
  const read = input.host.seatTerminals(String(readRepositoryId(input)));
  if (read.status === 'unavailable') throw new BoardCollectError(`the seat terminals are unavailable: ${read.reason}`);
  return read.terminals.filter(terminal => paneOfPullRequest(terminal, pr, worktree)).map((terminal) => {
    const pane = { address: terminal.address, seat: terminal.labels.seat ?? null };
    const keep = terminal.address === input.caller_terminal ? 'caller_terminal' : paneKeepReason(terminal.cwd);
    if (keep !== null) return { ...pane, outcome: 'kept', reason: keep };
    const closed = input.host.closeTerminal(terminal.address);
    return closed.status === 'closed' ? { ...pane, outcome: 'closed', reason: null } : { ...pane, outcome: 'kept', reason: closed.reason };
  });
}

type WorktreeOutcome = Pick<BoardCloseoutV1, 'worktree' | 'daemon_stop_failures'>;

/** The exact closeout path of `contract-worktree cleanup`: runtime cleanup, daemon stop, then the exact removal, which drops only this worktree's own marker. */
async function removeWorktree(input: BoardCloseoutInput, pr: MergedPullRequest, main: string, path: string, head: string | undefined,
  panes: readonly BoardCloseoutPaneV1[]): Promise<WorktreeOutcome> {
  const kept = (reason: string, daemon_stop_failures: readonly string[] = []): WorktreeOutcome => ({ worktree: { path, outcome: 'kept', reason }, daemon_stop_failures });
  if (panes.some(pane => pane.outcome === 'kept')) return kept('a pane of the pull request is kept');
  if (head !== pr.head_oid) return kept(`worktree HEAD ${head ?? 'unknown'} is not the PR head ${pr.head_oid}`);
  if (protectsCwd(path, realpathSync(process.cwd()))) return kept('session_cwd');
  let target: { readonly targetRef: string; readonly target: string };
  try { target = mergeBackTarget(main); } catch (error) { return kept((error as Error).message); }
  if (!git(main, ['merge-base', '--is-ancestor', pr.merge_commit, target.target]).ok) return kept(`merge commit ${pr.merge_commit} is not in ${target.targetRef}; fetch it first`);
  const runtime = await cleanupTaskWorktree(main, path);
  if (runtime.status !== 'closed' && runtime.status !== 'not_registered') return kept(`runtime ${runtime.status}${'reason' in runtime && runtime.reason ? ` (${runtime.reason})` : ''}`);
  // The exact removal does not read processes. A closed pane's program can take a moment to exit; after 5 s a process in the checkout keeps it.
  const deadline = Date.now() + 5_000;
  for (;;) {
    const processes = worktreeProcesses(Date.now() + 5_000);
    if (processes === null) return kept('process_unknown');
    if (!processes.some(item => protectsCwd(path, item.cwd))) break;
    if (Date.now() >= deadline) return kept('process_in_use');
    await Bun.sleep(200);
  }
  const failures = input.stopDaemons(path);
  try {
    removeExactWorktree(main, { worktree: path, branch: pr.head_ref, head_sha: pr.head_oid, target_ref: target.targetRef, target_oid: target.target,
      merge_commit_sha: pr.merge_commit }, { closeout: true });
  } catch (error) { return kept((error as Error).message.split('\n')[0]!, failures); }
  return { worktree: { path, outcome: 'removed', reason: null }, daemon_stop_failures: failures };
}

export async function runBoardCloseout(input: BoardCloseoutInput): Promise<BoardCloseoutV1> {
  const pr = readMergedPullRequest(input);
  const topology = entries(input.repo_root);
  const main = checkoutPath(topology[0]!.path);
  if (checkoutPath(input.repo_root) !== main) throw new BoardCollectError(`closeout runs in the primary checkout ${main}`);
  const entry = topology.slice(1).find(row => row.branch === `refs/heads/${pr.head_ref}`);
  const path = entry === undefined ? null : checkoutPath(entry.path);
  const panes = closePanes(input, pr, path);
  const result = path === null
    ? { worktree: { path: null, outcome: 'absent' as const, reason: null }, daemon_stop_failures: [] }
    : await removeWorktree(input, pr, main, path, entry?.head ?? undefined, panes);
  return { kind: BOARD_CLOSEOUT_KIND, pr: pr.number, merge_commit: pr.merge_commit, panes, ...result };
}

/** The daemon stop of `contract-worktree cleanup`: without the architecture plugin there is no daemon to stop. */
export function stopArchitectureDaemons(repoRoot: string, worktree: string): readonly string[] {
  const runtime = architecturePort('runtime');
  if (isArchitectureUnavailable(runtime)) return runtime.code === 'ARCHITECTURE_PLUGIN_NOT_SELECTED' ? [] : [runtime.message];
  return runtime.stopWorkspaceDaemons(repoRoot, worktree).failures.map(failure => failure.message);
}
