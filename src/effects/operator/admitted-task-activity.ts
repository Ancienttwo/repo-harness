import { decodeAdmittedTaskActivity, isAdmittedTaskActivityRequest, type AdmittedActivityEntry, type AdmittedTaskActivity, type AdmittedTaskActivityRequest } from '../../core/operator/admitted-task-activity';
import { TASK_ACTIVITY_DEADLINE_MS, TASK_ACTIVITY_MAX_BYTES, TASK_ACTIVITY_MAX_OUTPUT_BYTES, TASK_ACTIVITY_MAX_SCAN } from '../../core/operator/task-activity';
import { readAdmittedTaskActivity } from '../fleet/task-inbox';
import { OperatorTaskActivityError } from './task-activity';
import { observeOperatorTaskDiffSource, OperatorTaskDiffError } from './task-diff';

/** Current session authorization surrounds a bounded observation of stored facts. */
export function readOperatorAdmittedTaskActivity(input: AdmittedTaskActivityRequest & { readonly env?: NodeJS.ProcessEnv },
  effects: Parameters<typeof observeOperatorTaskDiffSource>[1] = {}): AdmittedTaskActivity {
  const { env, ...request } = input;
  try {
    if (!isAdmittedTaskActivityRequest(request)) throw new OperatorTaskActivityError('unavailable');
    const observe = () => observeOperatorTaskDiffSource({ ...request.selector, env }, effects);
    const before = observe();
    const facts = readAdmittedTaskActivity({ repo_root: before.sourceRoot, task_id: request.selector.task,
      limit: request.limit, after: request.after, message_id: request.message_id,
      budget: { max_scan: TASK_ACTIVITY_MAX_SCAN, max_bytes: TASK_ACTIVITY_MAX_BYTES, deadline_ms: TASK_ACTIVITY_DEADLINE_MS } });
    if (JSON.stringify(before) !== JSON.stringify(observe())) throw new OperatorTaskDiffError('stale');
    if (!facts.history_exists) throw new OperatorTaskActivityError('history_unavailable');
    const entries: AdmittedActivityEntry[] = [];
    let outputBytes = 16384, exhausted = false;
    for (const entry of facts.entries) {
      outputBytes += Buffer.byteLength(JSON.stringify(entry));
      if (outputBytes > TASK_ACTIVITY_MAX_OUTPUT_BYTES) { exhausted = true; break; }
      entries.push(entry);
    }
    const result: AdmittedTaskActivity = { ...request, protocol: 2, kind: 'operator_admitted_task_activity', admission_sha256: before.approval.admission_sha256,
      observed_at: new Date().toISOString(), consistency: 'observed', entries,
      coverage: { ...facts.coverage, scope: request.message_id === null ? 'task' : 'message', ...(exhausted ? {complete:false,reason:'output' as const} : {}) },
      next_cursor: exhausted ? null : facts.next_cursor };
    return decodeAdmittedTaskActivity(result, request);
  } catch (error) {
    if (error instanceof OperatorTaskActivityError || error instanceof OperatorTaskDiffError) throw error;
    throw new OperatorTaskActivityError('unavailable');
  }
}
