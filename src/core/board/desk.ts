import type { BoardItemV1, BoardPullRequestV1, BoardTerminalV1, BoardV1 } from './board';
import { primaryPullRequest } from './pull-requests';

/**
 * The room rules of one board: which seats have a desk, the state of a desk,
 * the worker limit and the current batch. The Office room and the stored
 * board summary read these rules, so the two cannot differ.
 */

/** A seat terminal whose labels the board accepted. */
export type BoardSeatTerminal = Extract<BoardTerminalV1, { readonly seat_status: 'observed' }>;

/** The seat limit without a plan: at most 8 active writer seats (`orchestrator.md`, seat limits). */
export const ISSUE_FLOW_WORKER_LIMIT = 8;
const STAGE_SEATS: readonly string[] = ['orchestrator', 'advisor'];

/** The desk states in the order the rules test them; `unknown` is a seat with no issue and no pull request. */
export const DESK_STATES = ['ci_failed', 'ci_pending', 'acceptance_queue', 'no_claim_status', 'coding', 'idle', 'unknown'] as const;
export type DeskState = typeof DESK_STATES[number];

/** The first plan batch with an unmerged member. */
export interface BoardCurrentBatch {
  readonly size: number;
  readonly accepted: readonly number[];
}

export function liveSeats(terminals: readonly BoardTerminalV1[]): readonly BoardSeatTerminal[] {
  return terminals.flatMap(terminal => (terminal.seat_status === 'observed' && terminal.state === 'live' ? [terminal] : []));
}

/** Each live seat outside the stage has a desk. */
export const hasDesk = (seat: BoardSeatTerminal): boolean => !STAGE_SEATS.includes(seat.seat);

export function seatItem(board: BoardV1, terminal: BoardSeatTerminal): BoardItemV1 | null {
  return board.items.find(item => item.number === terminal.issue)
    ?? (terminal.pr === null ? undefined : board.items.find(item => item.pull_requests.includes(terminal.pr!)))
    ?? null;
}

export function seatPullRequest(board: BoardV1, terminal: BoardSeatTerminal, item: BoardItemV1 | null): BoardPullRequestV1 | null {
  if (terminal.pr !== null) return board.pull_requests.find(pr => pr.number === terminal.pr) ?? null;
  return item === null ? null : primaryPullRequest(board, item);
}

/** The acceptance queue: an open pull request whose required check passed and that is not accepted. */
export function isQueued(pr: BoardPullRequestV1): boolean {
  return pr.state === 'open' && pr.acceptance.status === 'not_accepted' && pr.required_check.status === 'success';
}

/** The desk state rules of the data map, first match wins. */
export function deskState(terminal: BoardSeatTerminal, item: BoardItemV1 | null, pr: BoardPullRequestV1 | null): DeskState {
  if (terminal.issue === null && terminal.pr === null) return 'unknown';
  if (pr?.required_check.status === 'failure') return 'ci_failed';
  if (pr?.required_check.status === 'pending') return 'ci_pending';
  if (pr !== null && isQueued(pr)) return 'acceptance_queue';
  if (item?.claim_status.status_kind === 'none') return 'no_claim_status';
  if (terminal.status === 'working') return 'coding';
  return 'idle';
}

/** The plan worker limit, else the issue-flow limit. */
export function workerLimit(board: BoardV1 | null): number {
  return board?.plan.status === 'observed' ? board.plan.block.seat_limits.worker : ISSUE_FLOW_WORKER_LIMIT;
}

/** Null without an observed plan, or when every member is merged. */
export function currentBatch(board: BoardV1): BoardCurrentBatch | null {
  if (board.plan.status !== 'observed') return null;
  const primary = (issue: number) => {
    const item = board.items.find(entry => entry.number === issue);
    return item === undefined ? null : primaryPullRequest(board, item);
  };
  const batch = board.plan.block.batches.find(members => members.some(issue => primary(issue)?.state !== 'merged'));
  if (batch === undefined) return null;
  return { size: batch.length, accepted: batch.filter(issue => primary(issue)?.acceptance.status === 'accepted' && primary(issue)?.state === 'open') };
}
