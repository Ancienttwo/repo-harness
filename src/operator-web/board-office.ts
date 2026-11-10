import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardAttentionV1 } from '../core/board/attention';
import type { BoardAcceptanceMergeV1, BoardItemV1, BoardV1 } from '../core/board/board';
import {
  currentBatch, deskState, hasDesk, isQueued, liveSeats, seatItem, seatPullRequest, workerLimit,
  type BoardCurrentBatch, type BoardSeatTerminal, type DeskState,
} from '../core/board/desk';
import { joinBoardParents, type BoardParentsV1, type BoardSeatsV1 } from '../core/board/parents';
import { PLAN_BATCH_MAX_MEMBERS } from '../core/board/plan-block';
import { decodeBoardSummaries, type BoardSummariesV1, type BoardSummaryV1 } from '../core/board/summary';
import { BOARD_PARENTS_READ_FAILURES, type BoardParentsReadFailure } from '../core/operator/board-read';
import type { BoardParentsReader, BoardParentsReason, BoardParentsView, BoardSeatsReader, BoardSeatsView } from './board-view';
import { asApiError } from './operator-api-error';
import { useObservationRefresh } from './useObservationRefresh';

/**
 * The data map of the Board office view (#1755, #1787): the live seats of one
 * repository and the board of its active parent → room; the seats and the
 * stored summary of that parent → overview card. Each value comes from one
 * board, parent list or summary field. A value that none carries has no field
 * here, so the view cannot draw it.
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

export type BoardSummariesRead =
  | { readonly state: 'ok'; readonly summaries: BoardSummariesV1 }
  | { readonly state: 'unavailable'; readonly reason: BoardParentsReason };
export type BoardSummariesReader = (repositoryId: string, parent: number, signal: AbortSignal) => Promise<BoardSummariesRead>;

/** Browser side of `GET /api/v1/repositories/<id>/board/summaries`. The route reads one stored parent summary and starts no board CLI run. */
export async function fetchBoardSummaries(repositoryId: string, parent: number, signal: AbortSignal): Promise<BoardSummariesRead> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/repositories/${encodeURIComponent(repositoryId)}/board/summaries?parent=${parent}`, {
      signal, cache: 'no-store', headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: 'unavailable', reason: 'unreachable' };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = asApiError(body).code;
    return { state: 'unavailable', reason: (BOARD_PARENTS_READ_FAILURES as readonly string[]).includes(code) ? code as BoardParentsReadFailure : 'unreachable' };
  }
  try { return { state: 'ok', summaries: decodeBoardSummaries(body) }; } catch { return { state: 'unavailable', reason: 'parents_invalid' }; }
}

/** One repository on the overview. `summaries` is null until its read settles; a repository with no active parent never reads them. */
export type OfficeRepositoryView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly reason: BoardParentsReason }
  | { readonly kind: 'ready'; readonly parents: BoardParentsView; readonly seats: BoardSeatsV1; readonly summaries: BoardSummariesRead | null };

const LOADING: OfficeRepositoryView = { kind: 'loading' };
/** A repository that no read has reached yet loads. */
export const officeRepositoryView = (views: ReadonlyMap<string, OfficeRepositoryView>, id: string): OfficeRepositoryView => views.get(id) ?? LOADING;

/** Seats and parent facts refresh independently. A slow facts read cannot hold up a room. */
export function useOfficeOverview(repositories: readonly string[], readParents: BoardParentsReader, readSummaries: BoardSummariesReader, generation: number, readSeats: BoardSeatsReader): ReadonlyMap<string, OfficeRepositoryView> {
  const [parents, setParents] = useState<ReadonlyMap<string, BoardParentsView>>(new Map());
  const [seats, setSeats] = useState<ReadonlyMap<string, BoardSeatsView>>(new Map());
  type SummaryRead = { readonly parent: number; readonly read: BoardSummariesRead; readonly generation: number; readonly read_at: number };
  const [summaries, setSummaries] = useState<ReadonlyMap<string, SummaryRead>>(new Map());
  const summaryReads = useRef(summaries);
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
  const observeSummaries = useCallback(async (signal: AbortSignal) => {
    let complete = true;
    for (const [id, parent] of activeParents.current) {
      const previous = summaryReads.current.get(id);
      if (previous?.parent === parent && previous.generation === generation && Date.now() - previous.read_at < 30_000) continue;
      const read = await readSummaries(id, parent, signal);
      if (signal.aborted) return false;
      summaryReads.current = new Map(summaryReads.current).set(id, { parent, read, generation, read_at: Date.now() });
      setSummaries(summaryReads.current);
      if (read.state !== 'ok' && read.reason === 'unreachable') complete = false;
    }
    return complete;
  }, [readSummaries, key, generation]);
  useObservationRefresh(observeParents, JSON.stringify(['office-parents', key, generation]), { enabled: repositories.length > 0 });
  useObservationRefresh(observeSeats, JSON.stringify(['office-seats', key, generation]), { enabled: repositories.length > 0, interval: 3000 });
  const reloadSummaries = useObservationRefresh(observeSummaries, JSON.stringify(['office-summaries', key, generation]), { enabled: active !== '[]' });
  useEffect(() => { reloadSummaries(); }, [active, reloadSummaries]);
  useEffect(() => {
    const forget = () => {
      if (document.visibilityState === 'hidden') { setParents(new Map()); setSeats(new Map()); summaryReads.current = new Map(); setSummaries(summaryReads.current); }
    };
    document.addEventListener('visibilitychange', forget);
    return () => document.removeEventListener('visibilitychange', forget);
  }, []);
  return new Map(repositories.map(id => {
    const list = parents.get(id), document = seats.get(id);
    if (document?.kind === 'failed') return [id, document];
    if (document?.kind !== 'ready') return [id, LOADING];
    const parent = list?.kind === 'ready' ? activeParent(list.list, document.seats) : null;
    const summary = summaries.get(id);
    return [id, { kind: 'ready', seats: document.seats, parents: list ?? { kind: 'loading' },
      summaries: summary?.parent === parent ? summary.read : null }];
  }));
}


export type OfficeCardSummary =
  | { readonly status: 'no_parent' }
  | { readonly status: 'loading' }
  | { readonly status: 'not_read' }
  | { readonly status: 'unavailable'; readonly reason: string }
  | { readonly status: 'observed'; readonly observed_at: string; readonly summary: BoardSummaryV1 };

export interface OfficeCard {
  readonly room: OfficeRoom;
  readonly lit: boolean;
  /** The active parent: the same parent as the room that the card opens. */
  readonly parent: number | null;
  readonly parents: BoardParentsView;
  readonly summary: OfficeCardSummary;
}

function cardSummary(read: BoardSummariesRead | null, parent: number | null): OfficeCardSummary {
  if (parent === null) return { status: 'no_parent' };
  if (read === null) return { status: 'loading' };
  if (read.state !== 'ok') return { status: 'unavailable', reason: read.reason };
  const row = read.summaries.parents.find(entry => entry.parent === parent);
  // The two reads are separate, so a parent can be missing from the second one.
  if (row === undefined || row.status === 'not_read') return { status: 'not_read' };
  return row.status === 'unavailable' ? { status: 'unavailable', reason: row.reason } : { status: 'observed', observed_at: row.observed_at, summary: row.summary };
}

/**
 * The desks of the card: the observed seats with the desk states of the
 * summary. The rows are the seats of the active parent, so only a seat with that
 * parent label takes one. A row has no address, so it joins on its labels and
 * serves one desk. Any other seat, or a seat with no row, keeps its seat-only
 * state. A summary with no seats gives no desk.
 */
function cardDesks(desks: readonly OfficeDesk[], document: BoardSeatsV1, parent: number | null, summary: OfficeCardSummary): readonly OfficeDesk[] {
  if (summary.status !== 'observed') return desks;
  const { seats } = summary.summary;
  if (seats.status === 'unavailable') return [];
  const owned = new Set(document.seats.filter(seat => seat.parent === String(parent)).map(seat => seat.address));
  const rows = [...seats.desks];
  return desks.map((desk) => {
    if (!owned.has(desk.address)) return desk;
    const index = rows.findIndex(row => row.seat === desk.seat && row.agent === desk.agent && row.issue === desk.issue && row.pr === desk.pr);
    return index < 0 ? desk : { ...desk, state: rows.splice(index, 1)[0]!.state };
  });
}

/** One card per repository. The summary is the row of the active parent; no sum over parents, because the rows of old parents are stale. */
export function officeCard(view: Extract<OfficeRepositoryView, { readonly kind: 'ready' }>): OfficeCard {
  const room = officeRoom(view.seats, null);
  const { parents } = view;
  const parent = parents.kind === 'ready' ? activeParent(parents.list, view.seats) : null;
  const summary: OfficeCardSummary = parents.kind === 'failed' ? { status: 'unavailable', reason: parents.reason }
    : parents.kind === 'loading' ? { status: 'loading' } : cardSummary(view.summaries, parent);
  return { room: { ...room, desks: cardDesks(room.desks, view.seats, parent, summary) }, lit: officeLit(room), parent, parents, summary };
}

/** Waiting for you, then CI failed, then the other lit rooms, then the idle rooms. A card with no read yet ranks with the lit rooms. */
export function officeCardRank(card: OfficeCard | null): number {
  if (card === null) return 2;
  if (!card.lit) return 3;
  if (card.summary.status !== 'observed') return 2;
  return card.summary.summary.needs_you > 0 ? 0 : card.summary.summary.ci_failures > 0 ? 1 : 2;
}

export interface OfficeTotals {
  readonly rooms: number;
  readonly workers: number;
  readonly queue: number;
  readonly ci_failures: number;
  readonly needs_you: number;
  /** Rooms that a total leaves out: no parents read, no observed summary of the active parent, or a summary with no seats. */
  readonly unread: number;
}

/** The office chips add the counts of each card, so the totals equal the cards. A null card has no parents read. */
export function officeTotals(cards: readonly (OfficeCard | null)[]): OfficeTotals {
  const totals = { rooms: cards.length, workers: 0, queue: 0, ci_failures: 0, needs_you: 0, unread: 0 };
  for (const card of cards) {
    if (card === null) { totals.unread += 1; continue; }
    totals.workers += card.room.desks.length;
    if (card.summary.status === 'observed') {
      totals.queue += card.summary.summary.queue;
      totals.ci_failures += card.summary.summary.ci_failures;
      totals.needs_you += card.summary.summary.needs_you;
      if (card.summary.summary.seats.status === 'unavailable') totals.unread += 1;
    } else if (card.summary.status !== 'no_parent') totals.unread += 1;
  }
  return totals;
}
