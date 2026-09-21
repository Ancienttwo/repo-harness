import { decodeOperatorTaskActivity, TASK_ACTIVITY_FAILURES, type OperatorTaskActivityRequest, type OperatorTaskActivity } from '../core/operator/task-activity';
export async function fetchTaskActivity(request: OperatorTaskActivityRequest, signal: AbortSignal): Promise<OperatorTaskActivity> {
  const query = request.message_id !== null ? new URLSearchParams({ message_id: request.message_id }) : new URLSearchParams({ limit: String(request.limit), ...(request.after === null ? {} : { after: request.after }) });
  const response = await fetch(`/api/v1/fleet/tasks/${encodeURIComponent(request.repository_id)}/${encodeURIComponent(request.task_id)}/activity?${query}`, { signal, cache:'no-store' });
  const value: unknown = await response.json();
  if (!response.ok) {
    const code = (value as { code?: unknown } | null)?.code;
    throw new Error(TASK_ACTIVITY_FAILURES.includes(code as never) ? String(code) : 'unavailable');
  }
  return decodeOperatorTaskActivity(value, request);
}
