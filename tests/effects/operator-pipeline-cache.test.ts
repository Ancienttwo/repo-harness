import { expect, test } from 'bun:test';
import { createPipelineStatusReader } from '../../src/effects/operator/pipeline-status';
import { unavailableBoard, type PipelineBoardV2 } from '../../src/core/pipeline/board';

test('in-process pipeline reader retains the original generation age on unavailable or failed reads', async () => {
  const original: PipelineBoardV2 = { ...unavailableBoard(), status: 'ready', generated_at: '2026-10-01T00:00:00.000Z', last_reconciled_at: '2026-10-01T00:00:00.000Z' };
  let next: PipelineBoardV2 | Error = original;
  const read = createPipelineStatusReader(() => { if (next instanceof Error) throw next; return next; });
  expect(await read()).toEqual(original);
  next = unavailableBoard();
  expect(await read()).toEqual({ ...original, status: 'unavailable' });
  next = new Error('fixture');
  expect(await read()).toEqual({ ...original, status: 'unavailable' });
  expect(original.status).toBe('ready');
});
