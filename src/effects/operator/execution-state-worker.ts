// Child process of the execution-state collector. `collectTaskExecutionStates`
// reads files and runs `ps` and git synchronously, so it runs here, in a
// process group that the collector kills at its deadline or on close. It reads
// the repository registry with the environment it got and writes one JSON line:
// one result per registered repository. A live hc session's socket stays in this
// process; only its core id goes out.

import type { TaskExecutionSnapshot } from '../../core/operator/execution-state';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { hcServerStatusAsync } from '../terminal/herdr-core';
import { collectTaskExecutionStates, type HcCoreIdOf } from './execution-state';

export type ExecutionStateWorkerResult =
  | { readonly id: string; readonly ok: true; readonly snapshot: TaskExecutionSnapshot }
  | { readonly id: string; readonly ok: false };

/** One `hc server status` per socket. The caller's terminal identity is not lent to another core. */
function coreIds(env: NodeJS.ProcessEnv): HcCoreIdOf {
  const known = new Map<string, Promise<string | null>>();
  return socket => {
    let id = known.get(socket);
    if (!id) {
      const child: NodeJS.ProcessEnv = { ...env, HC_SOCKET: socket };
      delete child.HC_TERMINAL_ID; delete child.HC_TERMINAL_SOCKET; delete child.HC_SCOPE;
      id = hcServerStatusAsync({ env: child }).then(status => status.core.id, () => null);
      known.set(socket, id);
    }
    return id;
  };
}

if (import.meta.main) {
  const coreIdOf = coreIds(process.env);
  const results: ExecutionStateWorkerResult[] = [];
  // A failed repository is one result; its cause (a path, a git error) stays in this process.
  for (const repo of readRepoHarnessRegistryStrictSnapshot({ env: process.env }).repos) {
    try { results.push({ id: repo.id, ok: true, snapshot: await collectTaskExecutionStates(repo.path, coreIdOf) }); }
    catch { results.push({ id: repo.id, ok: false }); }
  }
  // Exit once the line is flushed so a handle left open cannot hold the child past its output.
  process.stdout.write(`${JSON.stringify(results)}\n`, () => process.exit(0));
}
