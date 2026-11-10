import { checkSeatTerminals, seatTerminal, type BoardSeatTerminalInputV1, type BoardTerminalV1 } from './board';
import type { BoardOpenIssuesReadV1 } from './source';

/** GitHub parent facts only. Live seats have their own observation document. */
export const BOARD_PARENTS_PROTOCOL = 5 as const;
export const BOARD_PARENTS_KIND = 'repo-harness.board-parents' as const;

export interface BoardParentV1 {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly updated_at: string;
  readonly sub_issues: { readonly total: number; readonly completed: number };
}

export type BoardParentsSeatV1 = BoardTerminalV1 & { readonly parent: string | null; readonly seat: string };

export interface BoardSeatsV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness.board-seats';
  readonly observed_at: string;
  /** The GitHub numeric repository id used by hc labels. */
  readonly repository_id: string;
  readonly seats: readonly BoardParentsSeatV1[];
}

export interface BoardParentsV1 {
  readonly protocol: typeof BOARD_PARENTS_PROTOCOL;
  readonly kind: typeof BOARD_PARENTS_KIND;
  readonly observed_at: string;
  readonly repository: string;
  readonly parents: readonly BoardParentV1[];
}

export function projectBoardSeats(repositoryId: string, observedAt: string, terminals: readonly BoardSeatTerminalInputV1[]): BoardSeatsV1 {
  return Object.freeze({
    protocol: 1, kind: 'repo-harness.board-seats', observed_at: observedAt, repository_id: repositoryId,
    seats: Object.freeze(terminals.filter(terminal => terminal.state === 'live' && terminal.labels.seat !== undefined)
      .map(terminal => Object.freeze({ ...seatTerminal(terminal), seat: terminal.labels.seat!, parent: terminal.labels.parent ?? null }))),
  });
}

export function projectBoardParents(input: { readonly observed_at: string; readonly issues: BoardOpenIssuesReadV1 }): BoardParentsV1 {
  return Object.freeze({
    protocol: BOARD_PARENTS_PROTOCOL, kind: BOARD_PARENTS_KIND, observed_at: input.observed_at,
    repository: input.issues.repository.name_with_owner,
    parents: Object.freeze(input.issues.issues.filter(issue => issue.sub_issues.total > 0)
      .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at) || right.number - left.number)),
  });
}

/** Local projection, never a wire document. Both the observer and browser use this join. */
export interface BoardParentsWithSeats {
  readonly parents: readonly (BoardParentV1 & { readonly seats: number })[];
  readonly active_parent: number | null;
}

export function joinBoardParents(parents: BoardParentsV1, seats: BoardSeatsV1): BoardParentsWithSeats {
  const counts = new Map<string, number>();
  for (const seat of seats.seats) {
    if (seat.state !== 'live' || seat.parent === null || seat.seat === '') continue;
    counts.set(seat.parent, (counts.get(seat.parent) ?? 0) + 1);
  }
  const joined = parents.parents.map(parent => ({ ...parent, seats: counts.get(String(parent.number)) ?? 0 }))
    .sort((left, right) => Number(right.seats > 0) - Number(left.seats > 0)
      || Date.parse(right.updated_at) - Date.parse(left.updated_at) || right.number - left.number);
  return { parents: joined, active_parent: joined.find(parent => parent.seats > 0)?.number ?? null };
}

/** Protocol 4 carried seats and counts and is refused, with no translation. */
export function decodeBoardParents(value: unknown): BoardParentsV1 {
  const list = value as Partial<BoardParentsV1> | null;
  if (list?.protocol !== BOARD_PARENTS_PROTOCOL) throw new Error(`unsupported board parents protocol: ${String(list?.protocol)}`);
  if (list.kind !== BOARD_PARENTS_KIND) throw new Error(`unsupported board parents kind: ${String(list.kind)}`);
  if ('seats' in list || !Array.isArray(list.parents) || list.parents.some(parent => 'seats' in parent)) throw new Error('board parents invalid');
  return list as BoardParentsV1;
}

export function decodeBoardSeats(value: unknown): BoardSeatsV1 {
  const document = value as Partial<BoardSeatsV1> | null;
  if (document?.protocol !== 1 || document.kind !== 'repo-harness.board-seats'
    || typeof document.repository_id !== 'string' || !/^[1-9][0-9]*$/u.test(document.repository_id)
    || typeof document.observed_at !== 'string' || !Number.isFinite(Date.parse(document.observed_at))) throw new Error('board seats invalid');
  checkSeatTerminals(document.seats);
  if (document.seats!.some(seat => seat.state !== 'live' || typeof seat.seat !== 'string' || !(seat.parent === null || typeof seat.parent === 'string'))) throw new Error('board seats invalid');
  return document as BoardSeatsV1;
}
