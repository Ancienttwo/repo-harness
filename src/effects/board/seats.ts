import type { BoardHostPortsV1 } from '../../core/board/board';
import { projectBoardSeats, type BoardSeatsV1 } from '../../core/board/parents';
import { readRepositoryId, seatTerminalsWithBranches } from './collect';

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
  return projectBoardSeats(repositoryId, observedAt, seatTerminalsWithBranches(read.terminals));
}
