// Child process of the execution-state collector. `collectTaskExecutionStates`
// reads files and runs `ps` and git synchronously, so it runs here, in a
// process group that the collector kills at its deadline or on close. It reads
// the repository registry with the environment it got and writes one JSON line:
// one result per registered repository.

import type { TaskExecutionSnapshot } from '../../core/operator/execution-state';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { collectTaskExecutionStates } from './execution-state';

export type ExecutionStateWorkerResult =
  | { readonly id: string; readonly ok: true; readonly snapshot: TaskExecutionSnapshot }
  | { readonly id: string; readonly ok: false };

if (import.meta.main) {
  // A failed repository is one result; its cause (a path, a git error) stays in this process.
  const results = readRepoHarnessRegistryStrictSnapshot({ env: process.env }).repos.map((repo): ExecutionStateWorkerResult => {
    try { return { id: repo.id, ok: true, snapshot: collectTaskExecutionStates(repo.path) }; }
    catch { return { id: repo.id, ok: false }; }
  });
  // Exit once the line is flushed so a handle left open cannot hold the child past its output.
  process.stdout.write(`${JSON.stringify(results)}\n`, () => process.exit(0));
}
