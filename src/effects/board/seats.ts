import { seatTerminal, type BoardHostPortsV1 } from '../../core/board/board';
import type { BoardParentsSeatV1 } from '../../core/board/parents';
import { readRepositoryId, seatTerminalsWithBranches } from './collect';

export interface BoardSeatsV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness.board-seats';
  readonly observed_at: string;
  readonly repository_id: string;
  readonly seats: readonly BoardParentsSeatV1[];
}

export class BoardSeatsError extends Error {
  readonly code = 'seats_hc_failed';

  constructor(message: string) {
    super(message);
    this.name = 'BoardSeatsError';
  }
}

/** All live seats of the local repository, including seats with no parent label. */
export function collectBoardSeats(input: {
  readonly repo_root: string;
  readonly host: BoardHostPortsV1;
}): BoardSeatsV1 {
  const observedAt = new Date().toISOString();
  const repositoryId = String(readRepositoryId(input));
  const read = input.host.seatTerminals(repositoryId);
  if (read.status === 'unavailable') throw new BoardSeatsError(`hc could not list the seat terminals: ${read.reason}`);
  const seats = seatTerminalsWithBranches(read.terminals.filter(terminal => terminal.labels.seat !== undefined))
    .map(terminal => Object.freeze({ ...seatTerminal(terminal), parent: terminal.labels.parent ?? null }));
  return Object.freeze({
    protocol: 1,
    kind: 'repo-harness.board-seats',
    observed_at: observedAt,
    repository_id: repositoryId,
    seats: Object.freeze(seats),
  });
}
