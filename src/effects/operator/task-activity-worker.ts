import { parentPort, workerData } from 'node:worker_threads';
import { OperatorTaskActivityError, readOperatorTaskActivity } from './task-activity';
try { parentPort!.postMessage({ ok: true, snapshot: readOperatorTaskActivity(workerData) }); }
catch (error) { parentPort!.postMessage({ ok: false, code: error instanceof OperatorTaskActivityError ? error.code : 'unavailable' }); }
