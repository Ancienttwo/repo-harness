// Worker thread entry of one architecture read; task-read-process.ts starts it.
// A worker thread has its own module instances, so this root registers the
// architecture providers for the recorded selection before it reads anything.

import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { ModuleReadError } from '../../core/architecture/module-view';
import { ARCHITECTURE_FAILURES } from '../../core/operator/architecture';
import { readRecordedSelection, registerSelectedArchitecturePorts } from '../../cli/installer/architecture-selection';
import { readArchitecture } from './architecture';

if (!isMainThread && parentPort) {
  try {
    await registerSelectedArchitecturePorts(readRecordedSelection(), async () => (await import('../architecture/providers')).ARCHITECTURE_PROVIDERS);
    const { request, env } = workerData;
    parentPort.postMessage({ ok: true, snapshot: readArchitecture(request, env) });
  } catch (error) {
    const code = error instanceof ModuleReadError && ARCHITECTURE_FAILURES.includes(error.code as typeof ARCHITECTURE_FAILURES[number]) ? error.code : 'unavailable';
    parentPort.postMessage({ ok: false, code });
  }
}
