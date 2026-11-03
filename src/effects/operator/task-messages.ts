import {
  decodeTaskMessagesView,
  projectTaskMessages,
  TASK_MESSAGES_BUDGET,
  TASK_MESSAGES_LIMIT,
  type TaskMessagesFailure,
  type TaskMessagesRequest,
  type TaskMessagesViewV1,
} from '../../core/operator/task-messages';
import { readAdmittedTaskActivity } from '../fleet/task-inbox';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';

export class TaskMessagesReadError extends Error {
  constructor(readonly code: TaskMessagesFailure) { super(code); }
}

/**
 * Read the stored task inbox of one task in a registered repository. It runs
 * in the supervised read process, because the inbox reader runs Git
 * synchronously. The caller checked that the task is verified.
 */
export function readOperatorTaskMessages(request: TaskMessagesRequest, env: NodeJS.ProcessEnv): TaskMessagesViewV1 {
  let repos;
  try { repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos; }
  catch { throw new TaskMessagesReadError('registry_unavailable'); }
  const repository = repos.find(repo => repo.id === request.repository_id);
  if (repository === undefined) throw new TaskMessagesReadError('repository_not_found');
  const activity = readAdmittedTaskActivity({ repo_root: repository.path, task_id: request.task_id, limit: TASK_MESSAGES_LIMIT, after: null, message_id: null,
    budget: TASK_MESSAGES_BUDGET });
  return decodeTaskMessagesView(projectTaskMessages(request, activity.entries, activity.coverage.complete), request);
}
