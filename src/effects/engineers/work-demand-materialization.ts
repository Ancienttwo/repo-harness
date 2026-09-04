import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { buildMaterializedWorkDemandReceipt, validateAcceptedWorkDemandProjection, validateWorkDemand, type MaterializedWorkDemandReceiptV1, type WorkDemandV1 } from '../../core/engineers/work-demand';
import { projectWorkGraph, schedulingCarrierPath, validateWorkGraph, type WorkGraphV1 } from '../../core/engineers/scheduling';
import { backlogRows, renderBacklogRow, sprintBacklogSchema } from '../../core/state/sprint-backlog-rows';
import { projectCanonicalTasks } from '../../core/state/coordination-identity';
import { resolveRepoIdentity } from '../state/coordination-canonical-source';
import { readCanonicalTargetRef } from '../state/collect-board-inputs';

export class WorkDemandMaterializationError extends Error {
  constructor(readonly code:'work_demand_materialization_stale'|'work_demand_materialization_conflict'|'work_demand_materialization_failed',message:string,readonly cause?:unknown){super(message);this.name='WorkDemandMaterializationError';}
}
function fail(code:WorkDemandMaterializationError['code'],message:string,cause?:unknown):never{throw new WorkDemandMaterializationError(code,message,cause);}
function git(root:string,args:string[],env?:NodeJS.ProcessEnv):string{return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,...env}}).trim();}
function at(root:string,commit:string,path:string):string{try{return execFileSync('git',['show',`${commit}:${path}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch(error){return fail('work_demand_materialization_conflict',`canonical file is missing: ${path}`,error);}}
function appendSprintRow(text:string,projection:ReturnType<typeof validateAcceptedWorkDemandProjection>):string {
  const rows=backlogRows(text); if(rows.some(row=>row.id===projection.task_id))fail('work_demand_materialization_conflict','accepted task_id already exists');
  const marker='\n## Execution Log'; const position=text.indexOf(marker); if(position<0)fail('work_demand_materialization_conflict','Sprint lacks Execution Log boundary');
  const row=renderBacklogRow(sprintBacklogSchema(text),{index:String(rows.length+1),id:projection.task_id,status:'[ ]',task:projection.task_text,mode:projection.task_mode,acceptance:projection.acceptance_text,plan:projection.planning_required?'(pending)':'(inline)'});
  return `${text.slice(0,position).trimEnd()}\n${row}\n${text.slice(position)}`;
}
function graphAfter(raw:string,demand:WorkDemandV1,projection:ReturnType<typeof validateAcceptedWorkDemandProjection>):WorkGraphV1 {
  let graph:WorkGraphV1; try{graph=validateWorkGraph(JSON.parse(raw));}catch(error){return fail('work_demand_materialization_conflict','canonical Work Graph is invalid',error);}
  if(graph.repository_id!==demand.repository_id||graph.sprint_path!==projection.sprint_path)fail('work_demand_materialization_conflict','Work Graph identity differs from accepted projection');
  if(graph.work_packages.some(item=>item.work_package_id===projection.work_package.work_package_id||item.task_id===projection.task_id))fail('work_demand_materialization_conflict','accepted Work Package identity already exists');
  return validateWorkGraph({...graph,lane:'engineering-v2',work_packages:[...graph.work_packages,projection.work_package]});
}

export interface MaterializeWorkDemandInput {readonly repo_root:string;readonly demand:WorkDemandV1;readonly projection:ReturnType<typeof validateAcceptedWorkDemandProjection>;readonly now?:()=>string;readonly crash_hook?:(boundary:'after_sprint_blob'|'after_graph_blob'|'before_ref_cas')=>void;}
export function materializeWorkDemand(input:MaterializeWorkDemandInput):MaterializedWorkDemandReceiptV1 {
  const root=resolve(input.repo_root);const demand=validateWorkDemand(input.demand);const projection=validateAcceptedWorkDemandProjection(input.projection);if(projection.demand_id!==demand.demand_id||projection.demand_sha256!==demand.demand_sha256)fail('work_demand_materialization_conflict','projection does not belong to demand');
  const target=readCanonicalTargetRef(root);const targetRef=target.startsWith('refs/')?target:`refs/heads/${target}`;const current=git(root,['rev-parse','--verify',`${target}^{commit}`]);if(current!==projection.expected_sprint_commit)fail('work_demand_materialization_stale','canonical Sprint commit moved before materialization');
  const tasks=(sprintText:string)=>projectCanonicalTasks({repoIdentity:resolveRepoIdentity(root),sprintPath:projection.sprint_path,sprintText}).map((task,index)=>({task_id:task.task_id,task_revision:task.task_revision,task_ref:task.row.task,status:task.row.status,row_order:index+1}));
  const sprintBefore=at(root,current,projection.sprint_path);const carrier=schedulingCarrierPath(projection.sprint_path);const graphBefore=at(root,current,carrier);const parsedBefore=validateWorkGraph(JSON.parse(graphBefore));const projectedBefore=projectWorkGraph(parsedBefore,tasks(sprintBefore));
  if(projectedBefore.work_graph_revision!==projection.expected_work_graph_revision)fail('work_demand_materialization_stale','canonical Work Graph revision moved before materialization');
  const sprintAfter=appendSprintRow(sprintBefore,projection);const graph=graphAfter(graphBefore,demand,projection);projectWorkGraph(graph,tasks(sprintAfter));const graphAfterBytes=`${JSON.stringify(graph,null,2)}\n`;
  const temp=mkdtempSync(join(tmpdir(),'repo-harness-work-demand-'));const index=join(temp,'index');try{
    git(root,['read-tree',current],{GIT_INDEX_FILE:index});
    const sprintFile=join(temp,'sprint');writeFileSync(sprintFile,sprintAfter);const sprintBlob=git(root,['hash-object','-w',sprintFile]);git(root,['update-index','--add','--cacheinfo','100644',sprintBlob,projection.sprint_path],{GIT_INDEX_FILE:index});input.crash_hook?.('after_sprint_blob');
    const graphFile=join(temp,'graph');writeFileSync(graphFile,graphAfterBytes);const graphBlob=git(root,['hash-object','-w',graphFile]);git(root,['update-index','--add','--cacheinfo','100644',graphBlob,carrier],{GIT_INDEX_FILE:index});input.crash_hook?.('after_graph_blob');
    const tree=git(root,['write-tree'],{GIT_INDEX_FILE:index});const commit=git(root,['commit-tree',tree,'-p',current,'-m',`materialize WorkDemand ${demand.demand_id}`],{GIT_INDEX_FILE:index,GIT_AUTHOR_NAME:'repo-harness',GIT_AUTHOR_EMAIL:'repo-harness@localhost',GIT_COMMITTER_NAME:'repo-harness',GIT_COMMITTER_EMAIL:'repo-harness@localhost',GIT_AUTHOR_DATE:input.now?.()??new Date().toISOString(),GIT_COMMITTER_DATE:input.now?.()??new Date().toISOString()});input.crash_hook?.('before_ref_cas');
    try{git(root,['update-ref',targetRef,commit,current]);}catch(error){return fail('work_demand_materialization_stale','canonical target moved during materialization',error);}
    return buildMaterializedWorkDemandReceipt({demand_id:demand.demand_id,demand_sha256:demand.demand_sha256,projection_sha256:projection.projection_sha256,repository_id:demand.repository_id,sprint_path:projection.sprint_path,task_id:projection.task_id,work_package_id:projection.work_package.work_package_id,work_package_revision:projection.work_package_revision,materialized_commit:commit});
  }catch(error){if(error instanceof WorkDemandMaterializationError)throw error;return fail('work_demand_materialization_failed','cannot create atomic Sprint and Work Graph commit',error);}finally{if(existsSync(temp))rmSync(temp,{recursive:true,force:true});}
}
