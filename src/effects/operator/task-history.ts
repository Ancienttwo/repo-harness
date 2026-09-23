import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { decodeOperatorTaskHistory, isTaskHistoryRequest, TASK_HISTORY_DEADLINE_MS, TASK_HISTORY_MAX_BLOB_BYTES, TASK_HISTORY_MAX_BLOBS, TASK_HISTORY_MAX_BYTES, TASK_HISTORY_MAX_CARRIERS, TASK_HISTORY_MAX_COMMITS, type OperatorTaskHistory, type OperatorTaskHistoryRequest, type TaskHistoryFailure } from '../../core/operator/task-history';
import { projectCanonicalTasks, type CanonicalTask } from '../../core/state/coordination-identity';
import { sprintBacklogSchema, SPRINT_BACKLOG_SCHEMA_V2 } from '../../core/state/sprint-backlog-rows';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { readCanonicalTargetRef } from '../state/collect-board-inputs';
import { CANONICAL_POLICY_PATH, canonicalSprintsDirectory } from '../state/coordination-canonical-source';

export class OperatorTaskHistoryError extends Error {
  constructor(readonly code: TaskHistoryFailure) { super(code); }
}
const fail = (code: TaskHistoryFailure): never => { throw new OperatorTaskHistoryError(code); };
const safePath = (path: string) => path.length > 0 && !path.startsWith('/') && !/[\\:\r\n\0]/u.test(path) && !path.split('/').some(p => !p || p === '.' || p === '..');
interface Entry { mode: string; oid: string; path: string }
type Resolution = { readonly missing: true } | { readonly missing: false; readonly line: string };
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
/** Only atoms every supported Git provides; `%(objectmode)` needs Git 2.51. */
export const TASK_HISTORY_BATCH_CHECK_FORMAT = '%(objecttype) %(objectname)';
const parentSpec = (commit: string, path: string): string => {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? `${commit}^{tree}` : `${commit}:${path.slice(0, slash)}`;
};

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
    const git=(args: string[], maxBytes=TASK_HISTORY_MAX_BLOB_BYTES, input?: string): string => {
      const remaining=TASK_HISTORY_DEADLINE_MS-(performance.now()-started);
      if (remaining <= 0) return fail('timeout');
      const room=Math.min(maxBytes,TASK_HISTORY_MAX_BYTES-bytesRead);
      if (room <= 0) return fail('too_large');
      try {
        const bytes=execFileSync('git',['--no-pager','--no-replace-objects','-c','core.fsmonitor=false',...args],{cwd:root,timeout:Math.max(1,Math.ceil(remaining)),maxBuffer:room,...(input === undefined ? {stdio:['ignore','pipe','pipe'] as const} : {input,stdio:['pipe','pipe','pipe'] as const}),env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0',GIT_NO_LAZY_FETCH:'1'}});
        bytesRead+=bytes.length;
        if (performance.now()-started > TASK_HISTORY_DEADLINE_MS) return fail('timeout');
        return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
      } catch (error) {
        if (error instanceof OperatorTaskHistoryError) throw error;
        const code=(error as NodeJS.ErrnoException).code;
        return fail(code === 'ETIMEDOUT' ? 'timeout' : code === 'ENOBUFS' ? 'too_large' : 'unavailable');
      }
    };
    // One cat-file process resolves `<commit>:<path>` for every walked commit, and
    // identical subtrees are listed once, so the walk costs a bounded number of
    // Git processes instead of two per commit.
    const resolutions=new Map<string,Resolution>();
    const resolve=(specs:readonly string[]): void => {
      const pending=[...new Set(specs)].filter(spec=>!resolutions.has(spec));
      if (pending.length === 0) return;
      const raw=git(['cat-file',`--batch-check=${TASK_HISTORY_BATCH_CHECK_FORMAT}`],TASK_HISTORY_MAX_BLOB_BYTES,pending.map(spec=>`${spec}\n`).join(''));
      const lines=raw.split('\n');
      if (lines.pop() !== '' || lines.length !== pending.length) return fail('unavailable');
      lines.forEach((line,index)=>resolutions.set(pending[index]!,line === `${pending[index]!} missing` ? {missing:true} : {missing:false,line}));
    };
    const listings=new Map<string,readonly {mode:string;oid:string;relative:string}[]>();
    const listTree=(tree:string) => {
      const cached=listings.get(tree);
      if (cached) return cached;
      const raw=git(['ls-tree','-rz',tree]);
      if (raw && !raw.endsWith('\0')) return fail('unavailable');
      const records=raw ? raw.slice(0,-1).split('\0').map(record=>{
        const match=/^(\d{6}) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/u.exec(record);
        if (!match) return fail('unavailable');
        return {mode:match[1]!,oid:match[2]!,relative:match[3]!};
      }) : [];
      listings.set(tree,records);
      return records;
    };
    const children=new Map<string,ReadonlyMap<string,{mode:string;type:string;oid:string}>>();
    const listChildren=(tree:string) => {
      const cached=children.get(tree);
      if (cached) return cached;
      const raw=git(['ls-tree','-z',tree]);
      if (raw && !raw.endsWith('\0')) return fail('unavailable');
      const records=new Map<string,{mode:string;type:string;oid:string}>();
      for (const record of raw ? raw.slice(0,-1).split('\0') : []) {
        const match=/^(\d{6}) (blob|tree|commit) ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/u.exec(record);
        if (!match || records.has(match[4]!)) return fail('unavailable');
        records.set(match[4]!,{mode:match[1]!,type:match[2]!,oid:match[3]!});
      }
      children.set(tree,records);
      return records;
    };
    const resolved=(spec:string) => {
      resolve([spec]);
      const resolution=resolutions.get(spec)!;
      if (resolution.missing) return null;
      // A gitlink prints `<oid> submodule` whatever the format; it is refused here.
      const match=/^(blob|tree) ([a-f0-9]{40}|[a-f0-9]{64})$/u.exec(resolution.line);
      return match ? {type:match[1]!,oid:match[2]!} : fail('unavailable');
    };
    // Same records as `ls-tree -rz --full-tree <commit> -- <path>`.
    const entries=(commit:string,path:string): Entry[] => {
      if (!safePath(path)) return fail('unavailable');
      const object=resolved(`${commit}:${path}`);
      if (object === null) return [];
      if (object.type === 'blob') {
        // The blob's mode lives in its parent tree, listed once per distinct tree.
        const parent=resolved(parentSpec(commit,path));
        if (parent === null || parent.type !== 'tree') return fail('unavailable');
        const leaf=listChildren(parent.oid).get(path.slice(path.lastIndexOf('/')+1));
        if (!leaf || leaf.type !== 'blob' || leaf.oid !== object.oid) return fail('unavailable');
        return [{mode:leaf.mode,oid:object.oid,path}];
      }
      return listTree(object.oid).map(record=>{
        const full=`${path}/${record.relative}`;
        return safePath(full) ? {mode:record.mode,oid:record.oid,path:full} : fail('unavailable');
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
    if (!OID.test(targetCommit)) return fail('unavailable');
    const commits=git(['rev-list','--first-parent',`--max-count=${TASK_HISTORY_MAX_COMMITS}`,targetCommit]).trim().split('\n');
    if (!commits.every(commit=>OID.test(commit))) return fail('unavailable');
    resolve(commits.flatMap(commit=>[`${commit}:${CANONICAL_POLICY_PATH}`,parentSpec(commit,CANONICAL_POLICY_PATH)]));
    const prefetchedDirectories=new Set<string>();
    for (const [index,commit] of commits.entries()) {
      const directory=canonicalSprintsDirectory(root,commit,readFile);
      if (safePath(directory) && !prefetchedDirectories.has(directory)) {
        prefetchedDirectories.add(directory);
        resolve(commits.slice(index).map(later=>`${later}:${directory}`));
      }
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
