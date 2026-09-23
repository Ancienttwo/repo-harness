import { decodeOperatorTaskContext, TASK_CONTEXT_FAILURES, type OperatorTaskContextRequest, type OperatorTaskContext } from '../core/operator/task-context';
export async function fetchTaskContext(request: OperatorTaskContextRequest, signal: AbortSignal): Promise<OperatorTaskContext> {
  const query = request.expected_task_revision === null ? '' : `?${new URLSearchParams({task_revision:request.expected_task_revision})}`;
  const response = await fetch(`/api/v1/fleet/tasks/${encodeURIComponent(request.repository_id)}/${encodeURIComponent(request.task_id)}/context${query}`, {signal,cache:'no-store'});
  const value:unknown = await response.json();
  if (!response.ok) {
    const code=(value as {code?:unknown}|null)?.code;
    throw new Error(TASK_CONTEXT_FAILURES.includes(code as never) ? String(code) : 'unavailable');
  }
  return decodeOperatorTaskContext(value,request);
}
