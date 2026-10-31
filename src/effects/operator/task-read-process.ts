import { isDocSessionListRequest, isDocSessionDetailRequest, isDocSessionEventsRequest } from '../../core/operator/doc-session-views';
import { readDocSessionFinalizationView } from './doc-session-finalization-view';
import { readDocSessionList, readDocSessionDetail } from './doc-session-views';
import { DocSessionEventsError, readDocSessionEvents } from './doc-session-events';
import { isAdmittedTaskActivityRequest } from '../../core/operator/admitted-task-activity';
import { OperatorTaskActivityError, readOperatorAdmittedTaskActivity } from './admitted-task-activity';
import { isTaskSessionsRequest } from '../../core/sessions/task-sessions';
import { readAdmittedTaskSessions } from '../sessions/task-sessions';
import { Worker } from 'node:worker_threads';
import { isArchitectureRequest } from '../../core/operator/architecture';
import { createInterface } from 'node:readline';
import { isAdmittedSessionSelector } from '../../core/sessions/session-selector';
import { readOperatorTaskContext } from './task-context';
import { SessionObservationError } from '../sessions/admitted-source';
import { readOperatorTaskDiff } from './task-diff';
import { isDocSessionReadRequest } from '../../core/operator/doc-session-changes';
import { DocSessionReadError, readDocSessionDiff, readDocSessionLoss } from './doc-session-changes';

// Stay inert until the supervisor has assigned this process to its ownership boundary.
function run(): void {
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let started = false, settled = false;
  const finish = (response: unknown): void => {
    if (settled) return;
    settled = true;
    reader.close();
    process.stdout.write(`${JSON.stringify(response)}\n`, () => process.exit(0));
  };
  const cancel = () => finish({ok:false,cancelled:true});
  process.once('SIGTERM', cancel);
  process.once('SIGINT', cancel);
  reader.once('close', () => { if (!settled) cancel(); });
  reader.on('line', line => {
    if (settled) return;
    try {
      const value: unknown = JSON.parse(line);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid request');
      const message = value as Record<string,unknown>;
      if (message.type === 'cancel' && Object.keys(message).length === 1) { cancel(); return; }
      if (started || message.type !== 'start' || message.protocol !== 1
        || Object.keys(message).some(key=>!['type','protocol','kind','request','env'].includes(key))) throw new Error('invalid request');
      if (message.env !== undefined && (!message.env || typeof message.env !== 'object' || Array.isArray(message.env)
        || Object.values(message.env).some(value=>typeof value !== 'string'))) throw new Error('invalid environment');
      started = true;
      const env = message.env as NodeJS.ProcessEnv | undefined;
      if (message.kind === 'architecture' && isArchitectureRequest(message.request)) {
        // The brief requires a worker; the outer process owns and retires its Git process tree.
        const worker = new Worker(new URL('./architecture.ts', import.meta.url), { workerData: { request: message.request, env } });
        worker.once('message', finish);
        worker.once('error', () => finish({ ok: false, code: 'unavailable' }));
        worker.once('exit', () => { if (!settled) finish({ ok: false, code: 'unavailable' }); });
      } else if (message.kind === 'context' && isAdmittedSessionSelector(message.request)) {
        finish({ok:true,snapshot:readOperatorTaskContext({...message.request,env})});
      } else if (message.kind === 'admitted_activity' && isAdmittedTaskActivityRequest(message.request)) {
        finish({ok:true,snapshot:readOperatorAdmittedTaskActivity({...message.request,env})});
      } else if (message.kind === 'sessions' && isTaskSessionsRequest(message.request)) {
        finish({ok:true,snapshot:readAdmittedTaskSessions({...message.request,env})});
      } else if (message.kind === 'diff' && isAdmittedSessionSelector(message.request)) {
        finish({ok:true,snapshot:readOperatorTaskDiff({...message.request,env})});
      } else if (message.kind === 'doc_session_list' && isDocSessionListRequest(message.request)) {
        finish({ok:true,snapshot:readDocSessionList(env ?? process.env,message.request)});
      } else if (message.kind === 'doc_session_detail' && isDocSessionDetailRequest(message.request)) {
        finish({ok:true,snapshot:readDocSessionDetail(env ?? process.env,message.request)});
      } else if (message.kind === 'doc_session_events' && isDocSessionEventsRequest(message.request)) {
        finish({ok:true,snapshot:readDocSessionEvents(env ?? process.env,message.request.session_id,message.request.after)});
      } else if (message.kind === 'doc_session_diff' && isDocSessionReadRequest(message.request)) {
        finish({ok:true,snapshot:readDocSessionDiff(env ?? process.env,message.request.session_id)});
      } else if (message.kind === 'doc_session_finalization' && isDocSessionReadRequest(message.request)) {
        finish({ok:true,snapshot:readDocSessionFinalizationView(env ?? process.env,message.request)});
      } else if (message.kind === 'doc_session_loss' && isDocSessionReadRequest(message.request)) {
        finish({ok:true,snapshot:readDocSessionLoss(env ?? process.env,message.request.session_id)});
      } else throw new Error('invalid reader');
    } catch (error) {
      finish({ok:false,code:error instanceof OperatorTaskActivityError || error instanceof SessionObservationError
        || error instanceof DocSessionReadError || error instanceof DocSessionEventsError ? error.code : 'unavailable'});
    }
  });
}

if (import.meta.main) run();
