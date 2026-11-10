import { useCallback, useEffect, useRef, useState } from 'react';
import { evaluateBoardAttention, type BoardAttentionV1 } from '../core/board/attention';
import type { BoardAcceptanceMergeV1, BoardItemV1, BoardV1 } from '../core/board/board';
import {
  currentBatch, deskState, hasDesk, isQueued, liveSeats, seatItem, seatPullRequest, workerLimit,
  type BoardCurrentBatch, type BoardSeatTerminal, type DeskState,
} from '../core/board/desk';
import { joinBoardParents, type BoardParentsV1, type BoardSeatsV1 } from '../core/board/parents';
import { PLAN_BATCH_MAX_MEMBERS } from '../core/board/plan-block';
import { BOARD_CACHE_POLL_MS, type BoardParentsReader, type BoardParentsReason, type BoardParentsView, type BoardRead, type BoardReader, type BoardSeatsReader, type BoardSeatsView } from './board-view';
import { useObservationRefresh } from './useObservationRefresh';

/**
 * The data map of the Board office view (#1755, #1787): the live seats of one
 * repository and the board of its active parent → room. The overview card is
 * the same room, so its counts equal the room's counts. Each value comes from
 * one board or parent list field. A value that none carries has no field here,
 * so the view cannot draw it.
 */

/** The feed shows the newest events only. */
const FEED_MAX = 5;

export interface OfficeDesk {
  readonly address: string;
  readonly seat: string;
  readonly agent: string | null;
  /** The hc status word of the seat. */
  readonly status: string | null;
  /** The hc status message of the seat; null when it has none. */
  readonly status_msg: string | null;
  readonly state: DeskState;
  readonly issue: number | null;
  /** The pull request that the seat names, else the primary pull request of its item. */
  readonly pr: number | null;
  /** The item title, else the pull request head branch. */
  readonly title: string | null;
  /** The current branch of the seat's terminal; null when the terminal read gave none. */
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
  /** The agent of the first seat that resolves to the pull request; null when no live seat does. */
  readonly agent: string | null;
  /** The status message of each live seat that resolves to the pull request. Several seats can share one desk key, so each message keeps its seat. */
  readonly messages: readonly { readonly address: string; readonly text: string }[];
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
  | { readonly status: 'observed'; readonly created_at: string; readonly revision: number | null; readonly merge_order: readonly number[]; readonly worker_limit: number; readonly batch: number }
  | { readonly status: 'none' };

export interface OfficeLead {
  readonly address: string;
  readonly agent: string | null;
  readonly status: string | null;
  readonly status_msg: string | null;
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
  readonly cart: BoardCurrentBatch | null;
  readonly cart_sockets: number;
  readonly backlog: readonly OfficeBacklogEntry[];
  readonly holds: readonly OfficeHold[];
  /** A1 findings: accepted, ready pull requests that wait for a merge. */
  readonly merge_waits: number;
  /** What those waits mean: who merges under the policy of the board. Null when no board was read. */
  readonly merge_policy: BoardAcceptanceMergeV1 | null;
  /** The R2 or R3 rule that names each desk, by terminal address. */
  readonly mines: ReadonlyMap<string, string>;
  /** Newest first. */
  readonly feed: readonly OfficeFeedEvent[];
}

function lead(seats: readonly BoardSeatTerminal[], seat: string): OfficeLead | null {
  const terminal = seats.find(entry => entry.seat === seat);
  return terminal === undefined ? null : { address: terminal.address, agent: terminal.agent, status: terminal.status, status_msg: terminal.status_msg };
}

function desk(board: BoardV1 | null, terminal: BoardSeatTerminal): OfficeDesk {
  const item = board === null ? null : seatItem(board, terminal);
  const pr = board === null ? null : seatPullRequest(board, terminal, item);
  const state = deskState(terminal, item, pr);
  return {
    address: terminal.address, seat: terminal.seat, agent: terminal.agent, status: terminal.status, status_msg: terminal.status_msg,
    state, issue: terminal.issue, pr: pr?.number ?? terminal.pr,
    title: item?.title ?? pr?.head_ref ?? null,
    branch: terminal.branch,
    queued: state === 'acceptance_queue' ? pr!.number : null,
    drawerIssue: item?.number ?? null,
  };
}

function feed(board: BoardV1, cart: BoardCurrentBatch | null): readonly OfficeFeedEvent[] {
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

/** The room of one repository: its live seats, and the board and attention when a parent is active. */
export function officeRoom(document: BoardSeatsV1, active: { readonly board: BoardV1; readonly attention: BoardAttentionV1 } | null): OfficeRoom {
  const seats = liveSeats(document.seats);
  const board = active?.board ?? null;
  const desks = seats.filter(hasDesk).map(seat => desk(board, seat));
  const plan = board?.plan.status === 'observed' ? board.plan : null;
  const open = board?.items.filter(item => item.state === 'open') ?? [];
  const planned = new Set([...(plan?.block.merge_order ?? []), ...(plan?.block.batches.flat() ?? [])]);
  const held = new Map((plan?.block.holds ?? []).map(hold => [hold.issue, hold.reason]));
  const cart = board === null ? null : currentBatch(board);
  const seated = (item: BoardItemV1) => seats.some(seat => seat.issue === item.number || (seat.pr !== null && item.pull_requests.includes(seat.pr)));
  return {
    plan: plan === null ? { status: 'none' } : {
      status: 'observed', created_at: plan.created_at, revision: plan.revision, merge_order: plan.block.merge_order,
      worker_limit: plan.block.seat_limits.worker, batch: cart?.size ?? 0,
    },
    orchestrator: lead(seats, 'orchestrator'),
    advisor: lead(seats, 'advisor'),
    desks,
    limit: workerLimit(board),
    queue: (board?.pull_requests ?? []).filter(isQueued).map((pr) => {
      const item = board!.items.find(entry => entry.pull_requests.includes(pr.number)) ?? null;
      // The resolution of the desk, so each seat on a queued desk is an owner, on any issue that lists the pull request.
      const owners = seats.filter(seat => seatPullRequest(board!, seat, seatItem(board!, seat))?.number === pr.number);
      return {
        pr: pr.number, title: item?.title ?? pr.head_ref, issue: item?.number ?? null, agent: owners[0]?.agent ?? null,
        messages: owners.flatMap(seat => (seat.status_msg === null ? [] : [{ address: seat.address, text: seat.status_msg }])),
      };
    }),
    cart,
    cart_sockets: PLAN_BATCH_MAX_MEMBERS,
    backlog: open.filter(item => !planned.has(item.number) && !held.has(item.number) && item.pull_requests.length === 0 && !seated(item)).map(item => ({ issue: item.number, title: item.title })),
    holds: [...held].map(([issue, reason]) => ({ issue, title: board!.items.find(item => item.number === issue)?.title ?? null, reason })),
    merge_waits: active?.attention.findings.filter(finding => finding.rule === 'A1').length ?? 0,
    merge_policy: board?.acceptance_merge ?? null,
    mines: active === null ? new Map() : mines(active.attention, desks),
    feed: board === null ? [] : feed(board, cart),
  };
}

/** The parent a room with no selected parent shows: the first with a live seat, in the server's order. */
export function activeParent(list: BoardParentsV1, seats: BoardSeatsV1): number | null {
  return joinBoardParents(list, seats).active_parent;
}

/** The room has someone in it. */
export const officeLit = (room: Pick<OfficeRoom, 'orchestrator' | 'advisor' | 'desks'>): boolean => room.orchestrator !== null || room.advisor !== null || room.desks.length > 0;

/** One repository on the overview. `board` is null until the board read of its active parent settles; a repository with no active parent reads no board. */
export type OfficeRepositoryView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly reason: BoardParentsReason }
  | { readonly kind: 'ready'; readonly parents: BoardParentsView; readonly seats: BoardSeatsV1; readonly board: BoardRead | null };

const LOADING: OfficeRepositoryView = { kind: 'loading' };
/** A repository that no read has reached yet loads. */
export const officeRepositoryView = (views: ReadonlyMap<string, OfficeRepositoryView>, id: string): OfficeRepositoryView => views.get(id) ?? LOADING;

/** Seats and parent facts refresh independently. A slow facts read cannot hold up a room. */
export function useOfficeOverview(repositories: readonly string[], readParents: BoardParentsReader, readBoard: BoardReader, generation: number, readSeats: BoardSeatsReader): ReadonlyMap<string, OfficeRepositoryView> {
  const [parents, setParents] = useState<ReadonlyMap<string, BoardParentsView>>(new Map());
  const [seats, setSeats] = useState<ReadonlyMap<string, BoardSeatsView>>(new Map());
  const [boards, setBoards] = useState<ReadonlyMap<string, { readonly parent: number; readonly read: BoardRead }>>(new Map());
  const key = JSON.stringify(repositories);
  const repositoryIds = useRef(repositories);
  repositoryIds.current = repositories;
  const observeParents = useCallback(async (signal: AbortSignal) => {
    let complete = true;
    for (const id of repositoryIds.current) {
      const result = await readParents(id, signal);
      if (signal.aborted) return false;
      setParents(current => new Map(current).set(id, result.state === 'ok' ? { kind: 'ready', list: result.list } : { kind: 'failed', reason: result.reason }));
      if (result.state !== 'ok' && result.reason === 'unreachable') complete = false;
    }
    return complete;
  }, [readParents, key]);
  const observeSeats = useCallback(async (signal: AbortSignal) => {
    let complete = true;
    for (const id of repositoryIds.current) {
      const result = await readSeats(id, signal);
      if (signal.aborted) return false;
      setSeats(current => new Map(current).set(id, result.state === 'pending' ? { kind: 'loading' } : result.state === 'ok' ? { kind: 'ready', seats: result.seats } : { kind: 'failed', reason: result.reason }));
      if (result.state === 'unavailable' && result.reason === 'unreachable') complete = false;
    }
    return complete;
  }, [readSeats, key]);
  const activeParents = useRef<readonly (readonly [string, number])[]>([]);
  activeParents.current = repositories.flatMap(id => {
    const list = parents.get(id), document = seats.get(id);
    if (list?.kind !== 'ready' || document?.kind !== 'ready') return [];
    const parent = activeParent(list.list, document.seats);
    return parent === null ? [] : [[id, parent] as const];
  });
  const active = JSON.stringify(activeParents.current);
  const observeBoards = useCallback(async (signal: AbortSignal) => {
    let complete = true;
    for (const [id, parent] of activeParents.current) {
      const read = await readBoard({ repository_id: id, parent }, signal);
      if (signal.aborted) return false;
      setBoards(current => new Map(current).set(id, { parent, read }));
      if (read.state !== 'ok' && read.reason === 'unreachable') complete = false;
    }
    return complete;
  }, [readBoard, key]);
  useObservationRefresh(observeParents, JSON.stringify(['office-parents', key, generation]), { enabled: repositories.length > 0, interval: BOARD_CACHE_POLL_MS });
  useObservationRefresh(observeSeats, JSON.stringify(['office-seats', key, generation]), { enabled: repositories.length > 0, interval: BOARD_CACHE_POLL_MS });
  // A changed set of active parents restarts the loop, so a new active parent is read at once.
  useObservationRefresh(observeBoards, JSON.stringify(['office-boards', key, generation, active]), { enabled: active !== '[]', interval: BOARD_CACHE_POLL_MS });
  useEffect(() => {
    const forget = () => {
      if (document.visibilityState === 'hidden') { setParents(new Map()); setSeats(new Map()); setBoards(new Map()); }
    };
    document.addEventListener('visibilitychange', forget);
    return () => document.removeEventListener('visibilitychange', forget);
  }, []);
  return new Map(repositories.map(id => {
    const list = parents.get(id), document = seats.get(id);
    if (document?.kind === 'failed') return [id, document];
    if (document?.kind !== 'ready') return [id, LOADING];
    const parent = list?.kind === 'ready' ? activeParent(list.list, document.seats) : null;
    const board = boards.get(id);
    return [id, { kind: 'ready', seats: document.seats, parents: list ?? { kind: 'loading' }, board: board?.parent === parent ? board.read : null }];
  }));
}


/** The board of the card's active parent. `observed` carries the counts that the room has no field for. */
export type OfficeCardBoard =
  | { readonly status: 'no_parent' }
  | { readonly status: 'loading' }
  | { readonly status: 'not_read' }
  | { readonly status: 'unavailable'; readonly reason: string }
  | { readonly status: 'observed'; readonly observed_at: string; readonly needs_you: number; readonly ci_failures: number };

export interface OfficeCard {
  readonly room: OfficeRoom;
  readonly lit: boolean;
  /** The active parent: the same parent as the room that the card opens. */
  readonly parent: number | null;
  readonly parents: BoardParentsView;
  readonly board: OfficeCardBoard;
}

type CardRead = Exclude<OfficeCardBoard, { readonly status: 'observed' }> | { readonly status: 'read'; readonly board: BoardV1 };

function cardRead(view: Extract<OfficeRepositoryView, { readonly kind: 'ready' }>, parent: number | null): CardRead {
  if (view.parents.kind === 'failed') return { status: 'unavailable', reason: view.parents.reason };
  if (view.parents.kind === 'loading') return { status: 'loading' };
  if (parent === null) return { status: 'no_parent' };
  if (view.board === null) return { status: 'loading' };
  if (view.board.state === 'ok') return { status: 'read', board: view.board.board };
  // The observer has not read this parent yet.
  return view.board.reason === 'board_pending' ? { status: 'not_read' } : { status: 'unavailable', reason: view.board.reason };
}

/** One card per repository: the room of its active parent, built by `officeRoom` from the same seats and board documents as the room page. */
export function officeCard(view: Extract<OfficeRepositoryView, { readonly kind: 'ready' }>): OfficeCard {
  const { parents } = view;
  const parent = parents.kind === 'ready' ? activeParent(parents.list, view.seats) : null;
  const read = cardRead(view, parent);
  if (read.status !== 'read') {
    const room = officeRoom(view.seats, null);
    return { room, lit: officeLit(room), parent, parents, board: read };
  }
  const attention = evaluateBoardAttention(read.board);
  const room = officeRoom(view.seats, { board: read.board, attention });
  return { room, lit: officeLit(room), parent, parents, board: {
    status: 'observed', observed_at: read.board.observed_at,
    needs_you: attention.findings.filter(finding => finding.route === 'orchestrator').length,
    ci_failures: read.board.pull_requests.filter(pr => pr.state === 'open' && pr.required_check.status === 'failure').length,
  } };
}

/** Waiting for you, then CI failed, then the other lit rooms, then the idle rooms. A card with no read yet ranks with the lit rooms. */
export function officeCardRank(card: OfficeCard | null): number {
  if (card === null) return 2;
  if (!card.lit) return 3;
  if (card.board.status !== 'observed') return 2;
  return card.board.needs_you > 0 ? 0 : card.board.ci_failures > 0 ? 1 : 2;
}

export interface OfficeTotals {
  readonly rooms: number;
  readonly workers: number;
  readonly queue: number;
  readonly ci_failures: number;
  readonly needs_you: number;
  /** Rooms that a total leaves out: no parents read, or no observed board of the active parent. */
  readonly unread: number;
}

/** The office chips add the counts of each card, so the totals equal the cards. A null card has no parents read. */
export function officeTotals(cards: readonly (OfficeCard | null)[]): OfficeTotals {
  const totals = { rooms: cards.length, workers: 0, queue: 0, ci_failures: 0, needs_you: 0, unread: 0 };
  for (const card of cards) {
    if (card === null) { totals.unread += 1; continue; }
    totals.workers += card.room.desks.length;
    if (card.board.status === 'observed') {
      totals.queue += card.room.queue.length;
      totals.ci_failures += card.board.ci_failures;
      totals.needs_you += card.board.needs_you;
    } else if (card.board.status !== 'no_parent') totals.unread += 1;
  }
  return totals;
}
