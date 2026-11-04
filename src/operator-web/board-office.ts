import type { BoardAttentionV1 } from '../core/board/attention';
import type { BoardItemV1, BoardPullRequestV1, BoardTerminalV1, BoardV1 } from '../core/board/board';
import type { BoardParentV1 } from '../core/board/parents';
import { primaryPullRequest } from './board-view';

/**
 * The data map of the Board office view (#1755): board → room, parent list →
 * overview cards. Each value comes from one board field. A value that the
 * board does not carry (agent identity, the merge policy, a board summary on
 * the overview) has no field here, so the view cannot draw it.
 */

type SeatTerminal = Extract<BoardTerminalV1, { readonly seat_status: 'observed' }>;

/** The desk states in the order the rules test them; `unknown` is a seat with no issue and no pull request. */
export const DESK_STATES = ['ci_failed', 'ci_pending', 'acceptance_queue', 'no_claim_status', 'coding', 'idle', 'unknown'] as const;
export type DeskState = typeof DESK_STATES[number];

export interface OfficeDesk {
  readonly address: string;
  readonly state: DeskState;
  readonly issue: number | null;
  readonly pr: number | null;
  /** The item title, else the pull request head branch. */
  readonly title: string | null;
  /** The issue that the Task drawer opens; null when the seat names no issue the drawer can show. */
  readonly drawerIssue: number | null;
}

export interface OfficeQueueEntry {
  readonly pr: number;
  readonly title: string;
  readonly drawerIssue: number | null;
}

export interface OfficeCart {
  readonly size: number;
  readonly accepted: readonly number[];
}

export interface OfficeBacklogEntry {
  readonly issue: number;
  readonly title: string;
}

export interface OfficeHold {
  readonly issue: number;
  readonly title: string | null;
  readonly reason: string;
}

export type OfficePlan =
  | { readonly status: 'observed'; readonly created_at: string; readonly merge_order: readonly number[]; readonly worker_limit: number; readonly batches: number }
  | { readonly status: 'none' };

export interface OfficeRoom {
  readonly plan: OfficePlan;
  readonly orchestrator: string | null;
  readonly advisor: string | null;
  /** One desk per live worker terminal, in terminal order. */
  readonly desks: readonly OfficeDesk[];
  /** Empty desks up to the plan limit; 0 without an observed plan. */
  readonly free_desks: number;
  /** The first desk index over the plan limit; null without an observed plan or when the workers fit. */
  readonly roped_from: number | null;
  readonly queue: readonly OfficeQueueEntry[];
  readonly carts: readonly OfficeCart[];
  readonly backlog: readonly OfficeBacklogEntry[];
  readonly holds: readonly OfficeHold[];
  /** Attention findings routed to the orchestrator. */
  readonly door_marks: number;
}

function liveSeats(board: BoardV1, seat: string): readonly SeatTerminal[] {
  if (board.execution.status !== 'observed') return [];
  return board.execution.terminals.flatMap(terminal => terminal.seat_status === 'observed' && terminal.state === 'live' && terminal.seat === seat ? [terminal] : []);
}

function terminalItem(board: BoardV1, terminal: SeatTerminal): BoardItemV1 | null {
  return board.items.find(item => item.number === terminal.issue)
    ?? (terminal.pr === null ? undefined : board.items.find(item => item.pull_requests.includes(terminal.pr!)))
    ?? null;
}

function terminalPullRequest(board: BoardV1, terminal: SeatTerminal, item: BoardItemV1 | null): BoardPullRequestV1 | null {
  if (terminal.pr !== null) return board.pull_requests.find(pr => pr.number === terminal.pr) ?? null;
  return item === null ? null : primaryPullRequest(board, item);
}

function isQueued(pr: BoardPullRequestV1): boolean {
  return pr.state === 'open' && pr.acceptance.status === 'not_accepted';
}

/** The desk state rules of the data map, first match wins. */
export function deskState(terminal: SeatTerminal, item: BoardItemV1 | null, pr: BoardPullRequestV1 | null): DeskState {
  if (terminal.issue === null && terminal.pr === null) return 'unknown';
  if (pr?.required_check.status === 'failure') return 'ci_failed';
  if (pr?.required_check.status === 'pending') return 'ci_pending';
  if (pr !== null && isQueued(pr) && pr.required_check.status === 'success') return 'acceptance_queue';
  if (item?.claim_status.status_kind === 'none') return 'no_claim_status';
  if (terminal.status === 'working') return 'coding';
  return 'idle';
}

function desk(board: BoardV1, terminal: SeatTerminal): OfficeDesk {
  const item = terminalItem(board, terminal);
  const pr = terminalPullRequest(board, terminal, item);
  return {
    address: terminal.address,
    state: deskState(terminal, item, pr),
    issue: terminal.issue,
    pr: terminal.pr,
    title: item?.title ?? pr?.head_ref ?? null,
    drawerIssue: item?.number ?? terminal.issue,
  };
}

function issueAccepted(board: BoardV1, issue: number): boolean {
  const item = board.items.find(entry => entry.number === issue);
  return item !== undefined && primaryPullRequest(board, item)?.acceptance.status === 'accepted';
}

export function officeRoom(board: BoardV1, attention: BoardAttentionV1): OfficeRoom {
  const plan = board.plan.status === 'observed' ? board.plan : null;
  const desks = liveSeats(board, 'worker').map(terminal => desk(board, terminal));
  const limit = plan?.block.seat_limits.worker ?? null;
  const open = board.items.filter(item => item.state === 'open');
  const planned = new Set([...(plan?.block.merge_order ?? []), ...(plan?.block.batches.flat() ?? [])]);
  const held = new Map((plan?.block.holds ?? []).map(hold => [hold.issue, hold.reason]));
  return {
    plan: plan === null ? { status: 'none' } : {
      status: 'observed', created_at: plan.created_at, merge_order: plan.block.merge_order,
      worker_limit: plan.block.seat_limits.worker, batches: plan.block.batches.length,
    },
    orchestrator: liveSeats(board, 'orchestrator')[0]?.address ?? null,
    advisor: liveSeats(board, 'advisor')[0]?.address ?? null,
    desks,
    free_desks: limit === null ? 0 : Math.max(limit - desks.length, 0),
    roped_from: limit !== null && desks.length > limit ? limit : null,
    queue: board.pull_requests.filter(isQueued).map((pr) => {
      const item = board.items.find(entry => entry.pull_requests.includes(pr.number)) ?? null;
      return { pr: pr.number, title: item?.title ?? pr.head_ref, drawerIssue: item?.number ?? null };
    }),
    carts: (plan?.block.batches ?? []).map(batch => ({ size: batch.length, accepted: batch.filter(issue => issueAccepted(board, issue)) })),
    backlog: open.filter(item => !planned.has(item.number) && !held.has(item.number)).map(item => ({ issue: item.number, title: item.title })),
    holds: [...held].map(([issue, reason]) => ({ issue, title: board.items.find(item => item.number === issue)?.title ?? null, reason })),
    door_marks: attention.findings.filter(finding => finding.route === 'orchestrator').length,
  };
}

/** One overview card: a parent with seats, or the one idle card of a repository with none. */
export type OfficeCard =
  | { readonly kind: 'parent'; readonly parent: BoardParentV1 }
  | { readonly kind: 'idle' };

export function officeCards(parents: readonly BoardParentV1[]): readonly OfficeCard[] {
  const seated = parents.filter(parent => parent.seats > 0);
  return seated.length === 0 ? [{ kind: 'idle' }] : seated.map(parent => ({ kind: 'parent', parent }));
}
