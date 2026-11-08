import { lstatSync, realpathSync } from 'fs';
import { architecturePort, isArchitectureUnavailable } from '../../core/architecture/contracts';
import type { BoardHostPortsV1, BoardSeatTerminalReadV1 } from '../../core/board/board';
import { gitSpawnSync, withoutRepositorySelectingGitEnv } from '../git/runner';
import type { WorktreeProcess } from '../git/worktree-processes';
import { assertNoOwner, checkoutPath, entries, protectsCwd, removeExactWorktree } from '../state/coordination-worktree-topology';
import { cleanupTaskWorktree } from '../terminal/runtime-closeout';
import { BoardCollectError, readGhJson, readRepositoryId, type GhInput } from './collect';

/**
 * The post-merge closeout of one pull request (#2005). Every merge and worktree proof comes first; a missing one stops
 * before any pane closes. Each seat terminal bound to the PR then closes only when its checkout is clean and has nothing
 * outside `origin/<branch>`. The PR head worktree is removed through the exact closeout path of `contract-worktree
 * cleanup`, only after no process runs in it. Everything that fails a check stays.
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
  /** `partial`: one of the checkout and the local branch is gone; the two flags say which. `unknown`: a flag is null because its readback failed. */
  readonly worktree: {
    readonly path: string; readonly outcome: 'removed' | 'kept' | 'partial' | 'unknown'; readonly reason: string | null;
    readonly checkout_present: boolean | null; readonly branch_present: boolean | null;
  };
  /** The architecture daemon stop of the removed worktree; it never blocks the removal, as in `contract-worktree cleanup`. */
  readonly daemon_stop_failures: readonly string[];
}

export interface BoardCloseoutInput extends GhInput {
  readonly pr: number;
  readonly host: Pick<BoardHostPortsV1, 'seatTerminals' | 'closeTerminal'>;
  /** Stops the architecture daemons of a checkout and returns the failures. */
  readonly stopDaemons: (worktree: string) => readonly string[];
  /** The process inventory (`worktreeProcesses`); null means occupancy is unproven, which keeps the worktree. */
  readonly processes: (deadline: number) => WorktreeProcess[] | null;
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
  const read = readGhJson(input, ['pr', 'view', String(input.pr), '--json', 'number,state,baseRefName,headRefName,headRefOid,mergeCommit,closingIssuesReferences']) as {
    number?: unknown; state?: unknown; baseRefName?: unknown; headRefName?: unknown; headRefOid?: unknown; mergeCommit?: { oid?: unknown } | null; closingIssuesReferences?: unknown;
  } | null;
  if (read?.number !== input.pr) throw new BoardCollectError(`gh pr view ${input.pr} returned another pull request`);
  if (read.state !== 'MERGED') throw new BoardCollectError(`#${input.pr} is not merged (${String(read.state)}); closeout runs only after a merge`);
  if (read.baseRefName !== 'main') throw new BoardCollectError(`#${input.pr} merged into ${String(read.baseRefName)}; closeout proves merges into main only`);
  const merge = read.mergeCommit?.oid;
  if (typeof read.headRefName !== 'string' || typeof read.headRefOid !== 'string' || !OID.test(read.headRefOid)
    || typeof merge !== 'string' || !OID.test(merge) || !Array.isArray(read.closingIssuesReferences)) {
    throw new BoardCollectError(`gh pr view ${input.pr} has no head branch, head sha, merge commit or closing issue list`);
  }
  const repository = (readGhJson(input, ['repo', 'view', '--json', 'id']) as { id?: unknown } | null)?.id;
  if (typeof repository !== 'string' || repository === '') throw new BoardCollectError('gh repo view has no repository id');
  const references = read.closingIssuesReferences.map(entry => entry as { number?: unknown; repository?: { id?: unknown } | null } | null);
  if (!references.every(entry => Number.isSafeInteger(entry?.number) && typeof entry?.repository?.id === 'string')) {
    throw new BoardCollectError(`gh pr view ${input.pr} has an invalid closing issue`);
  }
  // Seat issue labels name issues of this repository, so an issue that the PR closes elsewhere binds no pane.
  const closing = references.filter(entry => entry!.repository!.id === repository).map(entry => entry!.number as number);
  return { number: input.pr, head_ref: read.headRefName, head_oid: read.headRefOid, merge_commit: merge, closing_issues: closing };
}

/** `status` is null when git did not run to an exit (spawn error, timeout or signal). */
function git(cwd: string, args: readonly string[]): { readonly ok: boolean; readonly status: number | null; readonly out: string } {
  // The directory selects the repository, so a git variable of this process must not.
  const run = gitSpawnSync([...args], { cwd, env: withoutRepositorySelectingGitEnv(), encoding: 'utf8', timeout: 10_000 });
  const status = run.error === undefined ? run.status : null;
  return { ok: status === 0, status, out: (run.stdout ?? '').trim() };
}

/** The canonical common Git directory of the checkout at `cwd`, or null when git cannot read it. */
function commonDirectory(cwd: string): string | null {
  const read = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (!read.ok) return null;
  try { return realpathSync(read.out); } catch { return null; }
}

/** The reason to keep the pane of `cwd`, or null when its checkout is clean and fully on `origin/<branch>`. */
function paneKeepReason(cwd: string | null, common: string): string | null {
  if (cwd === null) return 'cwd_unknown';
  // A label can outlive its checkout: the pane must work in a checkout of this repository.
  const own = commonDirectory(cwd);
  if (own === null) return 'repository_unproven';
  if (own !== common) return 'other_repository';
  const status = git(cwd, ['status', '--porcelain', '--untracked-files=all']);
  if (!status.ok) return 'git_status_failed';
  if (status.out !== '') return 'dirty';
  const branch = git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!branch.ok) return 'no_branch';
  const ahead = git(cwd, ['rev-list', '--count', `refs/remotes/origin/${branch.out}..HEAD`]);
  if (!ahead.ok) return `no_origin_branch origin/${branch.out}`;
  return ahead.out === '0' ? null : `unpushed ${ahead.out} commit(s) on ${branch.out}`;
}

/** The integration branch that every proof and the exact removal bind to. */
const TARGET_REF = 'refs/remotes/origin/main';

/** The proofs that every side effect needs. A missing one stops closeout before it closes a pane. */
interface CloseoutProof {
  readonly main: string;
  /** The canonical common Git directory of this repository; every pane checkout must share it. */
  readonly common: string;
  readonly path: string;
  readonly target_oid: string;
}

function proveCloseout(input: BoardCloseoutInput, pr: MergedPullRequest): CloseoutProof {
  const fail = (message: string): never => { throw new BoardCollectError(`closeout of #${pr.number} stopped before any side effect: ${message}`); };
  const topology = entries(input.repo_root);
  const main = checkoutPath(topology[0]!.path);
  if (checkoutPath(input.repo_root) !== main) fail(`closeout runs in the primary checkout ${main}`);
  const common = commonDirectory(main);
  if (common === null) fail('the common Git directory is unreadable');
  if (!git(main, ['fetch', '--quiet', 'origin', 'main']).ok) fail('git fetch origin main failed');
  const target = git(main, ['rev-parse', '--verify', `${TARGET_REF}^{commit}`]);
  if (!target.ok) fail(`${TARGET_REF} is unavailable`);
  if (!git(main, ['merge-base', '--is-ancestor', pr.merge_commit, target.out]).ok) fail(`merge commit ${pr.merge_commit} is not in ${TARGET_REF}`);
  const entry = topology.slice(1).find(row => row.branch === `refs/heads/${pr.head_ref}`);
  if (entry === undefined) fail(`no linked worktree has ${pr.head_ref}`);
  const path = checkoutPath(entry!.path);
  if (entry!.head !== pr.head_oid) fail(`worktree HEAD ${entry!.head ?? 'unknown'} is not the PR head ${pr.head_oid}`);
  if (entry!.locked) fail(`worktree ${path} is locked`);
  if (protectsCwd(path, realpathSync(process.cwd()))) fail(`the caller runs inside ${path}`);
  const status = git(path, ['status', '--porcelain', '--untracked-files=all']);
  if (!status.ok || status.out !== '') fail(`worktree ${path} is dirty or unreadable`);
  // The worktree's own marker is the closeout's to drop; any other marker that names it is another owner.
  try { assertNoOwner(main, path, {}, true); } catch (error) { fail(`worktree ${path}: ${(error as Error).message}`); }
  return { main, common: common!, path, target_oid: target.out };
}

/**
 * The binding of a seat terminal to the PR, by labels only: its pr label, or a closing-issue label with no pr label.
 * A closing-issue label next to the pr label of another PR is a conflict; closeout refuses that pane.
 * A terminal without a seat label is a task session; the runtime cleanup of the worktree owns it.
 */
function paneBinding(terminal: BoardSeatTerminalReadV1, pr: MergedPullRequest): 'bound' | 'conflict' | 'none' {
  const { labels } = terminal;
  if (labels.seat === undefined) return 'none';
  if (labels.pr === String(pr.number)) return 'bound';
  if (labels.issue === undefined || !pr.closing_issues.some(issue => String(issue) === labels.issue)) return 'none';
  return labels.pr === undefined ? 'bound' : 'conflict';
}

function closePanes(input: BoardCloseoutInput, pr: MergedPullRequest, proof: CloseoutProof): BoardCloseoutPaneV1[] {
  const read = input.host.seatTerminals(String(readRepositoryId(input)));
  if (read.status === 'unavailable') throw new BoardCollectError(`the seat terminals are unavailable: ${read.reason}`);
  return read.terminals.flatMap((terminal): BoardCloseoutPaneV1[] => {
    const binding = paneBinding(terminal, pr);
    if (binding === 'none') return [];
    const pane = { address: terminal.address, seat: terminal.labels.seat ?? null };
    const keep = binding === 'conflict' ? `conflicting_binding pr ${terminal.labels.pr}`
      : terminal.address === input.caller_terminal ? 'caller_terminal' : paneKeepReason(terminal.cwd, proof.common);
    if (keep !== null) return [{ ...pane, outcome: 'kept', reason: keep }];
    const closed = input.host.closeTerminal(terminal.address);
    return [closed.status === 'closed' ? { ...pane, outcome: 'closed', reason: null } : { ...pane, outcome: 'kept', reason: closed.reason }];
  });
}

/** Waits up to 5 s for the programs of the closed panes to leave the checkout. */
async function processesGone(input: BoardCloseoutInput, path: string): Promise<string | null> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const processes = input.processes(Date.now() + 5_000);
    if (processes === null) return 'process_unknown';
    if (!processes.some(item => protectsCwd(path, item.cwd))) return null;
    if (Date.now() >= deadline) return 'process_in_use';
    await Bun.sleep(200);
  }
}

/** The exact closeout path of `contract-worktree cleanup`: runtime cleanup, daemon stop, then the exact removal, which drops only this worktree's own marker. */
async function removeWorktree(input: BoardCloseoutInput, pr: MergedPullRequest, proof: CloseoutProof, panes: readonly BoardCloseoutPaneV1[]): Promise<WorktreeOutcome> {
  if (panes.some(pane => pane.outcome === 'kept')) return observed(proof, pr, 'a pane of the pull request is kept', []);
  let failures: readonly string[] = [];
  try {
    const runtime = await cleanupTaskWorktree(proof.main, proof.path);
    if (runtime.status !== 'closed' && runtime.status !== 'not_registered') {
      return observed(proof, pr, `runtime ${runtime.status}${'reason' in runtime && runtime.reason ? ` (${runtime.reason})` : ''}`, failures);
    }
    // A daemon in the checkout would otherwise keep the process wait from ever passing.
    failures = input.stopDaemons(proof.path);
    const busy = await processesGone(input, proof.path);
    if (busy !== null) return observed(proof, pr, busy, failures);
    removeExactWorktree(proof.main, { worktree: proof.path, branch: pr.head_ref, head_sha: pr.head_oid, target_ref: TARGET_REF, target_oid: proof.target_oid,
      merge_commit_sha: pr.merge_commit }, { closeout: true });
    return observed(proof, pr, null, failures);
  } catch (error) {
    return observed(proof, pr, (error as Error).message.split('\n')[0]!, failures);
  }
}

type WorktreeOutcome = Pick<BoardCloseoutV1, 'worktree' | 'daemon_stop_failures'>;

/** The worktree result as observed after the last step, so a partial removal reports what is left. */
function observed(proof: CloseoutProof, pr: MergedPullRequest, reason: string | null, daemon_stop_failures: readonly string[]): WorktreeOutcome {
  let checkout_present: boolean | null;
  try { lstatSync(proof.path); checkout_present = true; }
  catch (error) { checkout_present = (error as NodeJS.ErrnoException).code === 'ENOENT' ? false : null; }
  // show-ref exits 1 only for a proven absent ref; any other result leaves the branch state unknown.
  const ref = git(proof.main, ['show-ref', '--verify', '--quiet', `refs/heads/${pr.head_ref}`]).status;
  const branch_present = ref === 0 ? true : ref === 1 ? false : null;
  const unknown = checkout_present === null || branch_present === null;
  const outcome = unknown ? 'unknown' : !checkout_present && !branch_present && reason === null ? 'removed' : checkout_present && branch_present ? 'kept' : 'partial';
  return { worktree: { path: proof.path, outcome, reason: unknown && reason === null ? 'worktree or branch readback failed' : reason, checkout_present, branch_present }, daemon_stop_failures };
}

export async function runBoardCloseout(input: BoardCloseoutInput): Promise<BoardCloseoutV1> {
  const pr = readMergedPullRequest(input);
  const proof = proveCloseout(input, pr);
  const panes = closePanes(input, pr, proof);
  return { kind: BOARD_CLOSEOUT_KIND, pr: pr.number, merge_commit: pr.merge_commit, panes, ...await removeWorktree(input, pr, proof, panes) };
}

/** The daemon stop of `contract-worktree cleanup`: without the architecture plugin there is no daemon to stop. */
export function stopArchitectureDaemons(repoRoot: string, worktree: string): readonly string[] {
  const runtime = architecturePort('runtime');
  if (isArchitectureUnavailable(runtime)) return runtime.code === 'ARCHITECTURE_PLUGIN_NOT_SELECTED' ? [] : [runtime.message];
  return runtime.stopWorkspaceDaemons(repoRoot, worktree).failures.map(failure => failure.message);
}
