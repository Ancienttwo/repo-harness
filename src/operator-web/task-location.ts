import { isTaskHistoryRequest } from '../core/operator/task-history';
export interface TaskLocation {
  readonly repositoryId: string | null;
  readonly selection: { readonly key: string; readonly taskId: string; readonly revision: string | null; readonly historical: boolean } | null;
  readonly invalid: boolean;
}
const invalid: TaskLocation={repositoryId:null,selection:null,invalid:true};
export function parseTaskLocation(search: string): TaskLocation {
  const p=new URLSearchParams(search);
  if ([...p.keys()].some(k=>!['repository','task','task_revision','view'].includes(k)) || [...p.keys()].some(k=>p.getAll(k).length !== 1)) return invalid;
  if (p.size === 0) return {repositoryId:null,selection:null,invalid:false};
  const repositoryId=p.get('repository');
  if (!repositoryId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(repositoryId)) return invalid;
  const taskId=p.get('task');
  if (taskId === null) return p.size === 1 ? {repositoryId,selection:null,invalid:false} : invalid;
  const historical=p.get('view') === 'history';
  if ((p.has('view') && !historical) || (p.has('task_revision') && !historical)) return invalid;
  const revision=p.get('task_revision');
  if (!isTaskHistoryRequest({repository_id:repositoryId,task_id:taskId,expected_task_revision:revision})) return invalid;
  return {repositoryId,selection:{key:`${repositoryId}:${taskId}`,taskId,revision,historical},invalid:false};
}
export function taskLocationSearch(repositoryId: string | null, selection: TaskLocation['selection']): string {
  if (repositoryId === null) return '';
  const p=new URLSearchParams({repository:repositoryId});
  if (selection) {
    p.set('task',selection.taskId);
    if (selection.historical) { p.set('view','history'); if (selection.revision !== null) p.set('task_revision',selection.revision); }
  }
  return `?${p}`;
}
