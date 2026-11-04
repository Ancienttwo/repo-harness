import type { BoardAttentionV1 } from '../core/board/attention';
import type { BoardItemV1, BoardPullRequestV1, BoardV1 } from '../core/board/board';
import type { BoardParentV1, BoardParentsSeatV1, BoardParentsV1 } from '../core/board/parents';
import { PLAN_BATCH_MAX_MEMBERS } from '../core/board/plan-block';
import { primaryPullRequest } from '../core/board/pull-requests';
import type { BoardParentsReader } from './board-view';

/**
 * The data map of the Board office view (#1755, #1787): the live seats of one
 * repository and the board of its active parent → room, parent list →
 * overview cards. Each value comes from one board or parent list field. A
 * value that neither carries (the plan revision, the merge policy, the branch
 * of a seat with no pull request: #1806) has no field here, so the view cannot
 * draw it.
 */

type SeatTerminal = Extract<BoardParentsSeatV1, { readonly seat_status: 'observed' }>;

/** The seat limit without a plan: at most 8 active writer seats (`orchestrator.md`, seat limits). */
export const ISSUE_FLOW_WORKER_LIMIT = 8;
/** The feed shows the newest events only. */
const FEED_MAX = 5;
const STAGE_SEATS: readonly string[] = ['orchestrator', 'advisor'];

/** The desk states in the order the rules test them; `unknown` is a seat with no issue and no pull request. */
export const DESK_STATES = ['ci_failed', 'ci_pending', 'acceptance_queue', 'no_claim_status', 'coding', 'idle', 'unknown'] as const;
export type DeskState = typeof DESK_STATES[number];

export interface OfficeDesk {
  readonly address: string;
  readonly seat: string;
  readonly agent: string | null;
  /** The hc status word of the seat. */
  readonly status: string | null;
  readonly state: DeskState;
  readonly issue: number | null;
  /** The pull request that the seat names, else the primary pull request of its item. */
  readonly pr: number | null;
  /** The item title, else the pull request head branch. */
  readonly title: string | null;
  /** The head branch of the desk's pull request; null without one. */
  readonly branch: string | null;
  /** The pull request that holds this seat in the queue; null outside the queue. */
  readonly queued: number | null;
  /** The issue that the Task drawer opens; null when the room has no board, or the seat names no issue the drawer can show. */
  readonly drawerIssue: number | null;
}

export interface OfficeQueueEntry {
  readonly pr: number;
  readonly title: string;
  readonly issue: number | null;
  /** The agent of the seat that names the pull request; null when no live seat does. */
  readonly agent: string | null;
}

/** The first plan batch with an unmerged member. */
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
  | { readonly status: 'observed'; readonly created_at: string; readonly merge_order: readonly number[]; readonly worker_limit: number; readonly batch: number }
  | { readonly status: 'none' };

export interface OfficeLead {
  readonly address: string;
  readonly agent: string | null;
  readonly status: string | null;
}

/** One board change with a server time. */
export type OfficeFeedEvent =
  | { readonly kind: 'plan'; readonly at: string }
  | { readonly kind: 'ci_failed'; readonly at: string; readonly pr: number }
  | { readonly kind: 'queued'; readonly at: string; readonly pr: number }
  | { readonly kind: 'accepted'; readonly at: string; readonly pr: number; readonly carted: boolean };

export interface OfficeRoom {
  readonly plan: OfficePlan;
  readonly orchestrator: OfficeLead | null;
  readonly advisor: OfficeLead | null;
  /** One desk per live seat outside the stage, in hc list order. */
  readonly desks: readonly OfficeDesk[];
  /** The plan worker limit, else the issue-flow limit. */
  readonly limit: number;
  readonly queue: readonly OfficeQueueEntry[];
  readonly cart: OfficeCart | null;
  readonly cart_sockets: number;
  readonly backlog: readonly OfficeBacklogEntry[];
  readonly holds: readonly OfficeHold[];
  /** A1 findings: accepted, ready pull requests that wait for a merge. */
  readonly merge_waits: number;
  /** The R2 or R3 rule that names each desk, by terminal address. */
  readonly mines: ReadonlyMap<string, string>;
  /** Newest first. */
  readonly feed: readonly OfficeFeedEvent[];
}

function liveSeats(list: BoardParentsV1): readonly SeatTerminal[] {
  return list.seats.flatMap(seat => (seat.seat_status === 'observed' && seat.state === 'live' ? [seat] : []));
}

function lead(seats: readonly SeatTerminal[], seat: string): OfficeLead | null {
  const terminal = seats.find(entry => entry.seat === seat);
  return terminal === undefined ? null : { address: terminal.address, agent: terminal.agent, status: terminal.status };
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

/** The acceptance queue: an open pull request whose required check passed and that is not accepted. */
function isQueued(pr: BoardPullRequestV1): boolean {
  return pr.state === 'open' && pr.acceptance.status === 'not_accepted' && pr.required_check.status === 'success';
}

/** The desk state rules of the data map, first match wins. */
export function deskState(terminal: SeatTerminal, item: BoardItemV1 | null, pr: BoardPullRequestV1 | null): DeskState {
  if (terminal.issue === null && terminal.pr === null) return 'unknown';
  if (pr?.required_check.status === 'failure') return 'ci_failed';
  if (pr?.required_check.status === 'pending') return 'ci_pending';
  if (pr !== null && isQueued(pr)) return 'acceptance_queue';
  if (item?.claim_status.status_kind === 'none') return 'no_claim_status';
  if (terminal.status === 'working') return 'coding';
  return 'idle';
}

function desk(board: BoardV1 | null, terminal: SeatTerminal): OfficeDesk {
  const item = board === null ? null : terminalItem(board, terminal);
  const pr = board === null ? null : terminalPullRequest(board, terminal, item);
  const state = deskState(terminal, item, pr);
  return {
    address: terminal.address, seat: terminal.seat, agent: terminal.agent, status: terminal.status,
    state, issue: terminal.issue, pr: pr?.number ?? terminal.pr,
    title: item?.title ?? pr?.head_ref ?? null,
    branch: pr?.head_ref ?? null,
    queued: state === 'acceptance_queue' ? pr!.number : null,
    drawerIssue: board === null ? null : item?.number ?? terminal.issue,
  };
}

function currentCart(board: BoardV1, batches: readonly (readonly number[])[]): OfficeCart | null {
  const primary = (issue: number) => {
    const item = board.items.find(entry => entry.number === issue);
    return item === undefined ? null : primaryPullRequest(board, item);
  };
  const batch = batches.find(members => members.some(issue => primary(issue)?.state !== 'merged'));
  if (batch === undefined) return null;
  return { size: batch.length, accepted: batch.filter(issue => primary(issue)?.acceptance.status === 'accepted' && primary(issue)?.state === 'open') };
}

function feed(board: BoardV1, cart: OfficeCart | null): readonly OfficeFeedEvent[] {
  const events: OfficeFeedEvent[] = board.plan.status === 'observed' ? [{ kind: 'plan', at: board.plan.created_at }] : [];
  for (const pr of board.pull_requests) {
    if (pr.required_check.status === 'failure' && pr.state === 'open') events.push({ kind: 'ci_failed', at: pr.required_check.completed_at, pr: pr.number });
    if (pr.required_check.status === 'success' && isQueued(pr)) events.push({ kind: 'queued', at: pr.required_check.completed_at, pr: pr.number });
    if (pr.acceptance.status === 'accepted') {
      const item = board.items.find(entry => entry.pull_requests.includes(pr.number));
      events.push({ kind: 'accepted', at: pr.acceptance.accepted_at, pr: pr.number, carted: item !== undefined && cart?.accepted.includes(item.number) === true });
    }
  }
  return events.sort((left, right) => Date.parse(right.at) - Date.parse(left.at)).slice(0, FEED_MAX);
}

function mines(attention: BoardAttentionV1, desks: readonly OfficeDesk[]): ReadonlyMap<string, string> {
  const named = new Map<string, string>();
  for (const finding of attention.findings) {
    if (finding.rule !== 'R2' && finding.rule !== 'R3') continue;
    for (const entry of desks) {
      if (named.has(entry.address)) continue;
      const pullRequests = [entry.pr, entry.queued].flatMap(number => (number === null ? [] : [number]));
      if (finding.terminals.includes(entry.address) || (entry.issue !== null && finding.issues.includes(entry.issue)) || pullRequests.some(pr => finding.pull_requests.includes(pr))) named.set(entry.address, finding.rule);
    }
  }
  return named;
}

/** The room of one repository: every live seat from the parent list, and the board and its attention when a parent is active. */
export function officeRoom(list: BoardParentsV1, active: { readonly board: BoardV1; readonly attention: BoardAttentionV1 } | null): OfficeRoom {
  const seats = liveSeats(list);
  const board = active?.board ?? null;
  const desks = seats.filter(seat => !STAGE_SEATS.includes(seat.seat)).map(seat => desk(board, seat));
  const plan = board?.plan.status === 'observed' ? board.plan : null;
  const open = board?.items.filter(item => item.state === 'open') ?? [];
  const planned = new Set([...(plan?.block.merge_order ?? []), ...(plan?.block.batches.flat() ?? [])]);
  const held = new Map((plan?.block.holds ?? []).map(hold => [hold.issue, hold.reason]));
  const cart = board === null || plan === null ? null : currentCart(board, plan.block.batches);
  const seated = (item: BoardItemV1) => seats.some(seat => seat.issue === item.number || (seat.pr !== null && item.pull_requests.includes(seat.pr)));
  return {
    plan: plan === null ? { status: 'none' } : {
      status: 'observed', created_at: plan.created_at, merge_order: plan.block.merge_order,
      worker_limit: plan.block.seat_limits.worker, batch: cart?.size ?? 0,
    },
    orchestrator: lead(seats, 'orchestrator'),
    advisor: lead(seats, 'advisor'),
    desks,
    limit: plan?.block.seat_limits.worker ?? ISSUE_FLOW_WORKER_LIMIT,
    queue: (board?.pull_requests ?? []).filter(isQueued).map((pr) => {
      const item = board!.items.find(entry => entry.pull_requests.includes(pr.number)) ?? null;
      const owner = seats.find(seat => seat.pr === pr.number || (item !== null && seat.issue === item.number));
      return { pr: pr.number, title: item?.title ?? pr.head_ref, issue: item?.number ?? null, agent: owner?.agent ?? null };
    }),
    cart,
    cart_sockets: PLAN_BATCH_MAX_MEMBERS,
    backlog: open.filter(item => !planned.has(item.number) && !held.has(item.number) && item.pull_requests.length === 0 && !seated(item)).map(item => ({ issue: item.number, title: item.title })),
    holds: [...held].map(([issue, reason]) => ({ issue, title: board!.items.find(item => item.number === issue)?.title ?? null, reason })),
    merge_waits: active?.attention.findings.filter(finding => finding.rule === 'A1').length ?? 0,
    mines: active === null ? new Map() : mines(active.attention, desks),
    feed: board === null ? [] : feed(board, cart),
  };
}

/** The parent a room with no selected parent shows: the first with a live seat, in the server's order. */
export function activeParent(list: BoardParentsV1): number | null {
  return list.parents.find(parent => parent.seats > 0)?.number ?? null;
}

/** One overview card: a parent with seats, or the one idle card of a repository with none. */
export type OfficeCard =
  | { readonly kind: 'parent'; readonly parent: BoardParentV1 }
  | { readonly kind: 'idle' };

export function officeCards(parents: readonly BoardParentV1[]): readonly OfficeCard[] {
  const seated = parents.filter(parent => parent.seats > 0);
  return seated.length === 0 ? [{ kind: 'idle' }] : seated.map(parent => ({ kind: 'parent', parent }));
}

/**
 * The overview's parent reads run one at a time, in call order. The server
 * refuses a board or parents read over its concurrency limit with
 * `parents_busy`, and that limit lives in effects, so the web keeps no copy of
 * the number. A call whose signal aborts while it waits never starts.
 */
export function serialParentsReader(read: BoardParentsReader): BoardParentsReader {
  let tail: Promise<unknown> = Promise.resolve();
  return (repositoryId, signal) => {
    const run = tail.then(() => {
      signal.throwIfAborted();
      return read(repositoryId, signal);
    });
    tail = run.catch(() => undefined);
    return run;
  };
}
