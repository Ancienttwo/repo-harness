import { decodeAdmittedTaskContext, type AdmittedTaskContext } from '../core/operator/admitted-task-context';
import { SESSION_OBSERVATION_FAILURES, type AdmittedSessionSelector } from '../core/sessions/session-selector';
export async function fetchTaskContext(request: AdmittedSessionSelector, signal: AbortSignal): Promise<AdmittedTaskContext> {
  const query=new URLSearchParams(Object.entries(request).filter(([key])=>key!=='repository_id'));
  const response=await fetch(`/api/v1/fleet/task-sessions/${request.repository_id}/context?${query}`,{signal,cache:'no-store'});
  const value:unknown=await response.json();
  if(!response.ok){const code=(value as {code?:unknown}|null)?.code;throw new Error(SESSION_OBSERVATION_FAILURES.includes(code as never)?String(code):'unavailable');}
  return decodeAdmittedTaskContext(value,request);
}
