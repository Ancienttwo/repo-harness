import { isTaskHistoryRequest } from '../core/operator/task-history';
export interface TaskLocation {
  readonly repositoryId: string | null;
  readonly selection: ({ readonly key: string; readonly revision: string | null } & (
    { readonly historical: true; readonly taskId: string } |
    { readonly historical: false; readonly providerRepositoryId: string; readonly issueId: string; readonly sessionBinding: string | null })) | null;
  readonly invalid: boolean;
}
const invalid: TaskLocation={repositoryId:null,selection:null,invalid:true};
export function parseTaskLocation(search: string): TaskLocation {
  const p=new URLSearchParams(search);
  if ([...p.keys()].some(k=>!['repository','provider_repository_id','issue_id','session_binding_sha256','task','task_revision','view'].includes(k)) || [...p.keys()].some(k=>p.getAll(k).length !== 1)) return invalid;
  if (p.size === 0) return {repositoryId:null,selection:null,invalid:false};
  const repositoryId=p.get('repository');
  if (!repositoryId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(repositoryId)) return invalid;
  if (p.size === 1) return {repositoryId,selection:null,invalid:false};
  if (p.get('view') === 'history') {
    if ([...p.keys()].some(k=>!['repository','task','task_revision','view'].includes(k))) return invalid;
    const taskId=p.get('task'),revision=p.get('task_revision');
    if (!taskId || !isTaskHistoryRequest({repository_id:repositoryId,task_id:taskId,expected_task_revision:revision})) return invalid;
    return {repositoryId,selection:{key:`${repositoryId}:${taskId}`,taskId,revision,historical:true},invalid:false};
  }
  if ([...p.keys()].some(k=>!['repository','provider_repository_id','issue_id','session_binding_sha256'].includes(k))) return invalid;
  const providerRepositoryId=p.get('provider_repository_id'),issueId=p.get('issue_id'),sessionBinding=p.get('session_binding_sha256');
  if (!providerRepositoryId || !issueId || !/^[1-9][0-9]*$/u.test(providerRepositoryId) || !/^[1-9][0-9]*$/u.test(issueId)
    || sessionBinding !== null && !/^sha256:[0-9a-f]{64}$/u.test(sessionBinding)) return invalid;
  return {repositoryId,selection:{key:`${repositoryId}:${providerRepositoryId}:${issueId}:${sessionBinding ?? 'unassigned'}`,providerRepositoryId,issueId,sessionBinding,revision:null,historical:false},invalid:false};
}
export function taskLocationSearch(repositoryId: string | null, selection: TaskLocation['selection']): string {
  if (repositoryId === null) return '';
  const p=new URLSearchParams({repository:repositoryId});
  if (selection?.historical) {
    p.set('task',selection.taskId);p.set('view','history');if(selection.revision!==null)p.set('task_revision',selection.revision);
  } else if (selection) {
    p.set('provider_repository_id',selection.providerRepositoryId);p.set('issue_id',selection.issueId);
    if(selection.sessionBinding!==null)p.set('session_binding_sha256',selection.sessionBinding);
  }
  return `?${p}`;
}
