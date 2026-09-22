import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { decodeOperatorTaskHistory, isTaskHistoryRequest, TASK_HISTORY_DEADLINE_MS, TASK_HISTORY_MAX_BLOB_BYTES, TASK_HISTORY_MAX_BLOBS, TASK_HISTORY_MAX_BYTES, TASK_HISTORY_MAX_CARRIERS, TASK_HISTORY_MAX_COMMITS, type OperatorTaskHistory, type OperatorTaskHistoryRequest, type TaskHistoryFailure } from '../../core/operator/task-history';
import { projectCanonicalTasks, type CanonicalTask } from '../../core/state/coordination-identity';
import { sprintBacklogSchema, SPRINT_BACKLOG_SCHEMA_V2 } from '../../core/state/sprint-backlog-rows';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { readCanonicalTargetRef } from '../state/collect-board-inputs';
import { canonicalSprintsDirectory } from '../state/coordination-canonical-source';

export class OperatorTaskHistoryError extends Error {
  constructor(readonly code: TaskHistoryFailure) { super(code); }
}
const fail = (code: TaskHistoryFailure): never => { throw new OperatorTaskHistoryError(code); };
const safePath = (path: string) => path.length > 0 && !path.startsWith('/') && !/[\\:\r\n\0]/u.test(path) && !path.split('/').some(p => !p || p === '.' || p === '..');
interface Entry { mode: string; oid: string; path: string }

/** Immutable canonical snapshots only. This reader never resolves execution rights. */
export function readOperatorTaskHistory(input: OperatorTaskHistoryRequest & { readonly env?: NodeJS.ProcessEnv }): OperatorTaskHistory {
  try {
    const {env,...request}=input;
    if (!isTaskHistoryRequest(request)) return fail('unavailable');
    const started=performance.now();
    const before=readRepoHarnessRegistryStrictSnapshot({env,adoptedOnly:false});
    const repo=before.repos.find(r=>r.id === request.repository_id);
    if (!repo) return fail('history_unavailable');
    const root=realpathSync(repo.path);
    let bytesRead=0;
    const git=(args: string[], maxBytes=TASK_HISTORY_MAX_BLOB_BYTES): string => {
      const remaining=TASK_HISTORY_DEADLINE_MS-(performance.now()-started);
      if (remaining <= 0) return fail('timeout');
      const room=Math.min(maxBytes,TASK_HISTORY_MAX_BYTES-bytesRead);
      if (room <= 0) return fail('too_large');
      try {
        const bytes=execFileSync('git',['--no-pager','--no-replace-objects','-c','core.fsmonitor=false',...args],{cwd:root,timeout:Math.max(1,Math.ceil(remaining)),maxBuffer:room,stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0',GIT_NO_LAZY_FETCH:'1'}});
        bytesRead+=bytes.length;
        if (performance.now()-started > TASK_HISTORY_DEADLINE_MS) return fail('timeout');
        return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
      } catch (error) {
        if (error instanceof OperatorTaskHistoryError) throw error;
        const code=(error as NodeJS.ErrnoException).code;
        return fail(code === 'ETIMEDOUT' ? 'timeout' : code === 'ENOBUFS' ? 'too_large' : 'unavailable');
      }
    };
    const entries=(commit:string,path:string): Entry[] => {
      if (!safePath(path)) return fail('unavailable');
      const raw=git(['ls-tree','-rz','--full-tree',commit,'--',path]);
      if (!raw) return [];
      if (!raw.endsWith('\0')) return fail('unavailable');
      return raw.slice(0,-1).split('\0').map(record=>{
        const match=/^(\d{6}) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/u.exec(record);
        if (!match || !safePath(match[3]!)) return fail('unavailable');
        return {mode:match[1]!,oid:match[2]!,path:match[3]!};
      });
    };
    const blobs=new Map<string,string>();
    const blob=(entry:Entry):string => {
      if (!['100644','100755'].includes(entry.mode)) return fail('unavailable');
      if (blobs.has(entry.oid)) return blobs.get(entry.oid)!;
      if (blobs.size >= TASK_HISTORY_MAX_BLOBS) return fail('too_large');
      const text=git(['cat-file','blob',entry.oid]);blobs.set(entry.oid,text);return text;
    };
    const readFile=(_cwd:string,commit:string,path:string):string|null => {
      const found=entries(commit,path).filter(e=>e.path === path);
      return found.length === 0 ? null : found.length === 1 ? blob(found[0]!) : fail('unavailable');
    };
    const target=readCanonicalTargetRef(root);
    const resolveTarget=()=>git(['rev-parse','--verify','--end-of-options',`${target}^{commit}`]).trim();
    const targetCommit=resolveTarget();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(targetCommit)) return fail('unavailable');
    const commits=git(['rev-list','--first-parent',`--max-count=${TASK_HISTORY_MAX_COMMITS}`,targetCommit]).trim().split('\n');
    for (const [index,commit] of commits.entries()) {
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(commit)) return fail('unavailable');
      const directory=canonicalSprintsDirectory(root,commit,readFile);
      const prefix=directory+'/';
      const carriers=entries(commit,directory).filter(e=>e.path.startsWith(prefix) && !e.path.slice(prefix.length).includes('/') && e.path.endsWith('.sprint.md'));
      if (carriers.length > TASK_HISTORY_MAX_CARRIERS) return fail('too_large');
      const seen=new Set<string>();let found:{task:CanonicalTask;entry:Entry;text:string}|null=null;
      for (const entry of carriers) {
        const text=blob(entry);
        if (sprintBacklogSchema(text) !== SPRINT_BACKLOG_SCHEMA_V2) continue;
        for (const task of projectCanonicalTasks({repoIdentity:root,sprintPath:entry.path,sprintText:text})) {
          if (seen.has(task.task_id)) return fail('history_ambiguous');
          seen.add(task.task_id);
          if (task.task_id === request.task_id && (request.expected_task_revision === null || request.expected_task_revision === task.task_revision)) found={task,entry,text};
        }
      }
      if (!found) continue;
      const after=readRepoHarnessRegistryStrictSnapshot({env,adoptedOnly:false});
      const current=after.repos.find(r=>r.id === request.repository_id);
      if (!current || after.authorizationRevision !== before.authorizationRevision || realpathSync(current.path) !== root || readCanonicalTargetRef(root) !== target || resolveTarget() !== targetCommit) return fail('stale');
      const {task,entry,text}=found;
      return decodeOperatorTaskHistory({protocol:1,kind:'operator_task_history',repository_id:request.repository_id,task_id:task.task_id,task_revision:task.task_revision,
        task:{title:task.row.task,mode:task.row.mode,acceptance:task.row.acceptance,recorded_status:task.row.status},
        source:{target_ref:target,target_commit:targetCommit,commit,sprint_path:entry.path,blob_sha256:`sha256:${createHash('sha256').update(text).digest('hex')}`},
        coverage:{scope:'canonical_first_parent',commits_examined:index+1,blobs_examined:blobs.size},observed_at:new Date().toISOString()},request);
    }
    return fail('history_unavailable');
  } catch(error) { if (error instanceof OperatorTaskHistoryError) throw error; return fail('unavailable'); }
}
