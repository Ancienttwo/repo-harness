import { decodePipelineBoard, unavailableBoard, type PipelineBoardV2 } from '../../core/pipeline/board';
import { readPipelineSnapshot } from '../pipeline/read';
export interface PipelineStatusReadInput { env?: NodeJS.ProcessEnv }
/** Read the existing immutable generation in process. GET never starts a CLI or writer. */
export function createPipelineStatusReader(read: (input: PipelineStatusReadInput) => PipelineBoardV2 = readPipelineSnapshot) {
  let last: PipelineBoardV2 | null = null;
  return async (input: PipelineStatusReadInput = {}): Promise<PipelineBoardV2> => {
    try {
      const board = decodePipelineBoard(read(input));
      if (board.status === 'unavailable') return last ? { ...last, status: 'unavailable' } : board;
      last = board; return board;
    } catch { return last ? { ...last, status: 'unavailable' } : unavailableBoard(); }
  };
}
export const readPipelineStatus = createPipelineStatusReader();
