import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BoardV1 } from '../../core/board/board';
import { BOARD_SUMMARIES_PROTOCOL, boardSummary, decodeBoardSummaries, type BoardSummariesV1, type BoardSummaryEntryV1 } from '../../core/board/summary';
import { repoHarnessHome } from '../repo-harness-home';

function snapshotPath(env: NodeJS.ProcessEnv, repositoryId: string, parent: number): string {
  return join(repoHarnessHome(env), 'board', 'summaries', `${repositoryId}-${parent}.json`);
}

function readSnapshot(env: NodeJS.ProcessEnv, repositoryId: string, parent: number): BoardSummaryEntryV1 {
  let text: string;
  try { text = readFileSync(snapshotPath(env, repositoryId, parent), 'utf8'); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ENOENT' ? { parent, status: 'not_read' }
      : { parent, status: 'unavailable', reason: `snapshot_read_failed:${code}` };
  }
  try {
    const snapshot = decodeBoardSummaries(JSON.parse(text));
    const row = snapshot.parents[0];
    if (snapshot.repository_id !== repositoryId || snapshot.parents.length !== 1 || row?.parent !== parent || row.status !== 'observed') {
      return { parent, status: 'unavailable', reason: 'snapshot_subject_invalid' };
    }
    return row;
  } catch {
    return { parent, status: 'unavailable', reason: 'snapshot_invalid' };
  }
}

/** The board route is the only caller. Synchronous replace keeps completed reads in observation order. */
export function writeBoardSummary(env: NodeJS.ProcessEnv, repositoryId: string, board: BoardV1): void {
  const snapshot = decodeBoardSummaries({ protocol: BOARD_SUMMARIES_PROTOCOL, kind: 'repo-harness.board-summaries', repository_id: repositoryId,
    parents: [{ parent: board.parent.number, status: 'observed', observed_at: board.observed_at, summary: boardSummary(board) }] });
  const previous = readSnapshot(env, repositoryId, board.parent.number);
  if (previous.status === 'observed' && Date.parse(previous.observed_at) > Date.parse(board.observed_at)) return;
  const target = snapshotPath(env, repositoryId, board.parent.number);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(snapshot)}\n`, { flag: 'wx', mode: 0o600 });
  try { renameSync(temporary, target); }
  catch (error) { unlinkSync(temporary); throw error; }
}

/** This reads no board, no registry and starts no refresh. An id with no stored file answers `not_read`. */
export function readBoardSummaries(env: NodeJS.ProcessEnv, repositoryId: string, parent: number): BoardSummariesV1 {
  return { protocol: BOARD_SUMMARIES_PROTOCOL, kind: 'repo-harness.board-summaries', repository_id: repositoryId,
    parents: [readSnapshot(env, repositoryId, parent)] };
}
