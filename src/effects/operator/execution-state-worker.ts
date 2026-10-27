// Worker thread of the execution-state collector. `collectTaskExecutionStates`
// reads files and runs `ps` synchronously, so it runs here, off the server
// event loop. It posts one message: one result per repository, in order.

import { parentPort, workerData } from 'node:worker_threads';
import type { TaskExecutionSnapshot } from '../../core/operator/execution-state';
import { collectTaskExecutionStates } from './execution-state';

export interface ExecutionStateWorkerRequest {
  readonly repos: readonly { readonly id: string; readonly path: string }[];
}

export type ExecutionStateWorkerResult =
  | { readonly id: string; readonly ok: true; readonly snapshot: TaskExecutionSnapshot }
  | { readonly id: string; readonly ok: false };

const request = workerData as ExecutionStateWorkerRequest;
// A failed repository is one result; its cause (a path, a git error) stays in this thread.
parentPort!.postMessage(request.repos.map((repo): ExecutionStateWorkerResult => {
  try { return { id: repo.id, ok: true, snapshot: collectTaskExecutionStates(repo.path) }; }
  catch { return { id: repo.id, ok: false }; }
}));
