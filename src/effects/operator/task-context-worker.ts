import { parentPort, workerData } from 'node:worker_threads';
import { OperatorTaskContextError, readOperatorTaskContext } from './task-context';
try { parentPort!.postMessage({ ok:true,snapshot:readOperatorTaskContext(workerData) }); }
catch (error) { parentPort!.postMessage({ ok:false,code:error instanceof OperatorTaskContextError ? error.code : 'unavailable' }); }
