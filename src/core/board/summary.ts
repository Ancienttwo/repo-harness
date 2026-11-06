import { evaluateBoardAttention } from './attention';
import type { BoardV1 } from './board';
import { currentBatch, DESK_STATES, deskState, hasDesk, isQueued, liveSeats, seatItem, seatPullRequest, workerLimit, type DeskState } from './desk';
import { primaryPullRequest } from './pull-requests';

export const BOARD_SUMMARIES_PROTOCOL = 3 as const;

/** The seat, issue and pr labels are the labels of the parent list seat. No terminal address or path (ADR-0002). */
export interface BoardSummaryDeskV1 {
  readonly seat: string;
  readonly agent: string | null;
  readonly issue: number | null;
  readonly pr: number | null;
  readonly state: DeskState;
}

/** The desks of the parent's seats. The board execution read gives them, so its failure gives no desk and no count. */
export type BoardSummarySeatsV1 =
  | { readonly status: 'observed'; readonly desks: readonly BoardSummaryDeskV1[]; readonly stalled: number }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface BoardSummaryV1 {
  readonly queue: number;
  readonly ci_failures: number;
  /** An unobserved plan has no batch counts. Observed batches are counted together. */
  readonly batch: { readonly accepted: number; readonly size: number } | { readonly accepted: null; readonly size: null };
  /** The first plan batch with an unmerged member; null without one. */
  readonly current_batch: { readonly accepted: number; readonly size: number } | null;
  readonly needs_you: number;
  readonly worker_limit: number;
  readonly seats: BoardSummarySeatsV1;
}

export type BoardSummaryEntryV1 =
  | { readonly parent: number; readonly status: 'observed'; readonly observed_at: string; readonly summary: BoardSummaryV1 }
  | { readonly parent: number; readonly status: 'not_read' }
  | { readonly parent: number; readonly status: 'unavailable'; readonly reason: string };

export interface BoardSummariesV1 {
  readonly protocol: typeof BOARD_SUMMARIES_PROTOCOL;
  readonly kind: 'repo-harness.board-summaries';
  readonly repository_id: string;
  readonly parents: readonly BoardSummaryEntryV1[];
}

const stalledDesks = (desks: readonly BoardSummaryDeskV1[]) => desks.filter(desk => desk.state === 'no_claim_status').length;

function summarySeats(board: BoardV1): BoardSummarySeatsV1 {
  if (board.execution.status !== 'observed') return board.execution;
  const desks = liveSeats(board.execution.terminals).filter(hasDesk).map((seat) => {
    const item = seatItem(board, seat);
    return { seat: seat.seat, agent: seat.agent, issue: seat.issue, pr: seat.pr, state: deskState(seat, item, seatPullRequest(board, seat, item)) };
  });
  return { status: 'observed', desks, stalled: stalledDesks(desks) };
}

/** Counts use the board's observations, including its attention time. No source read occurs here. */
export function boardSummary(board: BoardV1): BoardSummaryV1 {
  const open = board.pull_requests.filter(pr => pr.state === 'open');
  let batch: BoardSummaryV1['batch'] = { accepted: null, size: null };
  if (board.plan.status === 'observed') {
    const members = board.plan.block.batches.flat();
    batch = { size: members.length, accepted: members.filter(number =>
      board.items.some(item => item.number === number && primaryPullRequest(board, item)?.acceptance.status === 'accepted')).length };
  }
  const current = currentBatch(board);
  return {
    queue: board.pull_requests.filter(isQueued).length,
    ci_failures: open.filter(pr => pr.required_check.status === 'failure').length,
    batch,
    current_batch: current === null ? null : { accepted: current.accepted.length, size: current.size },
    needs_you: evaluateBoardAttention(board).findings.filter(finding => finding.route === 'orchestrator').length,
    worker_limit: workerLimit(board),
    seats: summarySeats(board),
  };
}

function fail(label: string): never { throw new TypeError(`board summaries invalid: ${label}`); }

function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(label);
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(`${label} fields`);
  return value as Record<string, unknown>;
}

function count(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(label);
  return value as number;
}

function positive(value: unknown, label: string): number {
  if (count(value, label) === 0) fail(label);
  return value as number;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(label);
  return value;
}

function batchCounts(batch: Record<string, unknown>, label: string): { readonly accepted: number; readonly size: number } {
  const accepted = count(batch.accepted, `${label} accepted`), size = count(batch.size, `${label} size`);
  if (accepted > size) fail(`${label} accepted exceeds size`);
  return { accepted, size };
}

function decodeDesk(value: unknown): BoardSummaryDeskV1 {
  const row = record(value, ['seat', 'agent', 'issue', 'pr', 'state'], 'desk');
  if (!(DESK_STATES as readonly unknown[]).includes(row.state)) fail('desk state');
  return { seat: text(row.seat, 'desk seat'), agent: row.agent === null ? null : text(row.agent, 'desk agent'),
    issue: row.issue === null ? null : positive(row.issue, 'desk issue'), pr: row.pr === null ? null : positive(row.pr, 'desk pr'),
    state: row.state as DeskState };
}

function decodeSeats(value: unknown): BoardSummarySeatsV1 {
  const status = (value as Partial<BoardSummarySeatsV1> | null)?.status;
  if (status === 'unavailable') return { status, reason: text(record(value, ['status', 'reason'], 'seats').reason, 'seats reason') };
  if (status !== 'observed') fail('seats status');
  const row = record(value, ['status', 'desks', 'stalled'], 'seats');
  if (!Array.isArray(row.desks)) fail('desks');
  const desks = row.desks.map(decodeDesk);
  if (row.stalled !== stalledDesks(desks)) fail('stalled');
  return { status, desks, stalled: stalledDesks(desks) };
}

function entry(value: unknown): BoardSummaryEntryV1 {
  const status = (value as Partial<BoardSummaryEntryV1> | null)?.status;
  const keys = status === 'observed' ? ['parent', 'status', 'observed_at', 'summary']
    : status === 'not_read' ? ['parent', 'status'] : status === 'unavailable' ? ['parent', 'status', 'reason'] : fail('status');
  const row = record(value, keys, 'parent');
  const parent = positive(row.parent, 'parent number');
  if (status === 'not_read') return { parent, status };
  if (status === 'unavailable') return { parent, status, reason: text(row.reason, 'reason') };
  if (typeof row.observed_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(row.observed_at)
    || !Number.isFinite(Date.parse(row.observed_at))) fail('observed_at');
  if (new Date(row.observed_at).toISOString().replace('.000Z', 'Z') !== row.observed_at.replace('.000Z', 'Z')) fail('observed_at');
  const summary = record(row.summary, ['queue', 'ci_failures', 'batch', 'current_batch', 'needs_you', 'worker_limit', 'seats'], 'summary');
  const batch = record(summary.batch, ['accepted', 'size'], 'batch');
  const decodedBatch = batch.accepted === null && batch.size === null ? { accepted: null, size: null } : batchCounts(batch, 'batch');
  return { parent, status: 'observed', observed_at: row.observed_at, summary: {
    queue: count(summary.queue, 'queue'), ci_failures: count(summary.ci_failures, 'ci_failures'),
    batch: decodedBatch,
    current_batch: summary.current_batch === null ? null : batchCounts(record(summary.current_batch, ['accepted', 'size'], 'current_batch'), 'current_batch'),
    needs_you: count(summary.needs_you, 'needs_you'), worker_limit: positive(summary.worker_limit, 'worker_limit'), seats: decodeSeats(summary.seats),
  } };
}

/** The same strict contract decodes stored snapshots and the route response. A file holds one observed parent. */
export function decodeBoardSummaries(value: unknown): BoardSummariesV1 {
  const result = record(value, ['protocol', 'kind', 'repository_id', 'parents'], 'response');
  if (result.protocol !== BOARD_SUMMARIES_PROTOCOL || result.kind !== 'repo-harness.board-summaries') fail('protocol or kind');
  if (typeof result.repository_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(result.repository_id)) fail('repository_id');
  if (!Array.isArray(result.parents)) fail('parents');
  const parents = result.parents.map(entry);
  if (new Set(parents.map(row => row.parent)).size !== parents.length) fail('duplicate parent');
  return { protocol: BOARD_SUMMARIES_PROTOCOL, kind: 'repo-harness.board-summaries', repository_id: result.repository_id, parents };
}
