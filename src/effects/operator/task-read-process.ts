import { Worker } from 'node:worker_threads';
import { isArchitectureRequest } from '../../core/operator/architecture';
import { createInterface } from 'node:readline';
import { isTaskMessagesRequest } from '../../core/operator/task-messages';
import { readOperatorTaskMessages, TaskMessagesReadError } from './task-messages';

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
        const worker = new Worker(new URL('../../cli/commands/architecture-thread.ts', import.meta.url), { workerData: { request: message.request, env } });
        worker.once('message', finish);
        worker.once('error', () => finish({ ok: false, code: 'unavailable' }));
        worker.once('exit', () => { if (!settled) finish({ ok: false, code: 'unavailable' }); });
      } else if (message.kind === 'task_messages' && isTaskMessagesRequest(message.request)) {
        finish({ok:true,snapshot:readOperatorTaskMessages(message.request,env ?? process.env)});
      } else throw new Error('invalid reader');
    } catch (error) {
      finish({ok:false,code:error instanceof TaskMessagesReadError ? error.code : 'unavailable'});
    }
  });
}

if (import.meta.main) run();
