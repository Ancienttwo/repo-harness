import { createInterface } from 'node:readline';
import { isTaskActivityRequest } from '../../core/operator/task-activity';
import { isTaskContextRequest } from '../../core/operator/task-context';
import { isTaskDiffRequest } from '../../core/operator/task-diff';
import { OperatorTaskActivityError, readOperatorTaskActivity } from './task-activity';
import { OperatorTaskContextError, readOperatorTaskContext } from './task-context';
import { OperatorTaskDiffError, readOperatorTaskDiff } from './task-diff';

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
      if (message.kind === 'context' && isTaskContextRequest(message.request)) {
        finish({ok:true,snapshot:readOperatorTaskContext({...message.request,env})});
      } else if (message.kind === 'activity' && isTaskActivityRequest(message.request)) {
        finish({ok:true,snapshot:readOperatorTaskActivity({...message.request,env})});
      } else if (message.kind === 'diff' && isTaskDiffRequest(message.request)) {
        finish({ok:true,snapshot:readOperatorTaskDiff({...message.request,env})});
      } else throw new Error('invalid reader');
    } catch (error) {
      finish({ok:false,code:error instanceof OperatorTaskActivityError || error instanceof OperatorTaskContextError || error instanceof OperatorTaskDiffError ? error.code : 'unavailable'});
    }
  });
}

if (import.meta.main) run();
