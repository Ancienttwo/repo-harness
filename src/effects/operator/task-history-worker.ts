import { parentPort, workerData } from 'node:worker_threads';
import { OperatorTaskHistoryError, readOperatorTaskHistory } from './task-history';
try { parentPort!.postMessage({ ok:true,snapshot:readOperatorTaskHistory(workerData) }); }
catch (error) { parentPort!.postMessage({ ok:false,code:error instanceof OperatorTaskHistoryError ? error.code : 'unavailable' }); }
