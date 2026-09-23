import { decodeOperatorTaskHistory, TASK_HISTORY_FAILURES, type OperatorTaskHistoryRequest, type OperatorTaskHistory } from '../core/operator/task-history';
export async function fetchTaskHistory(request: OperatorTaskHistoryRequest, signal: AbortSignal): Promise<OperatorTaskHistory> {
  const query=new URLSearchParams({view:'history'});
  if (request.expected_task_revision !== null) query.set('task_revision',request.expected_task_revision);
  const response=await fetch(`/api/v1/fleet/tasks/${encodeURIComponent(request.repository_id)}/${encodeURIComponent(request.task_id)}/context?${query}`,{signal,cache:'no-store'});
  const value:unknown=await response.json();
  if (!response.ok) {
    const code=(value as {code?:unknown}|null)?.code;
    throw new Error(TASK_HISTORY_FAILURES.includes(code as never) ? String(code) : 'unavailable');
  }
  return decodeOperatorTaskHistory(value,request);
}
