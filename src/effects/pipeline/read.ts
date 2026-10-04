import { decodeRecord, keyOf, equal, PipelineError, type Key } from '../../core/pipeline/types';
import { projectBoard, unavailableBoard, type PipelineBoardV2 } from '../../core/pipeline/projection';
import { projectedRuns, type LogObservation } from './ingest';
import { openSnapshot, snapshotPointerPath, storePath } from './store';

export function readPipelineSnapshot(input:{env?:NodeJS.ProcessEnv;pointer?:string;now?:Date}={}):PipelineBoardV2 {
  let opened;
  try{opened=openSnapshot(input.pointer??snapshotPointerPath(storePath(input.env)));}catch{return unavailableBoard();}
  try {
    const records=(opened.db.query('SELECT record FROM pipelines ORDER BY source_host,repository_id,task').all() as {record:string}[]).map(x=>decodeRecord(JSON.parse(x.record)));
    const logs=opened.db.query('SELECT * FROM observations ORDER BY seq').all().map((row:any)=>({...row,payload:JSON.parse(row.payload)})) as LogObservation[];
    return projectBoard(records,logs,opened.pointer,input.now);
  }catch{return unavailableBoard();}finally{opened.db.close();}
}
export function readPipelineStatus(key:Key,input:{env?:NodeJS.ProcessEnv;events?:boolean;limit?:number;evidence?:number}={}):unknown {
  if(input.limit!==undefined&&(!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>100))throw new PipelineError('usage',2,'limit must be 1 to 100');
  if(input.evidence!==undefined&&(!Number.isSafeInteger(input.evidence)||input.evidence<0))throw new PipelineError('usage',2,'evidence must be a non-negative index');
  const {db,pointer}=openSnapshot(snapshotPointerPath(storePath(input.env)));
  try {
    const row=db.query('SELECT record FROM pipelines WHERE source_host=? AND repository_id=? AND task=?').get(key.source_host,key.repository_id,key.task) as {record:string}|null;
    if(!row)throw new PipelineError('unknown_id',6,'Pipeline key is unknown');
    const record=decodeRecord(JSON.parse(row.record));
    const logs=db.query('SELECT * FROM observations WHERE source_host=? AND repository_id=? AND task=? ORDER BY seq').all(key.source_host,key.repository_id,key.task).map((r:any)=>({...r,payload:JSON.parse(r.payload)}));
    if(input.evidence!==undefined){const e=record.evidence[input.evidence];if(!e)throw new PipelineError('usage',2,'Evidence index is unknown');return {...key,evidence:e,epoch:pointer.epoch,commit_seq:pointer.commit_seq};}
    record.runs=projectedRuns(record,logs);
    const events=input.events?db.query('SELECT * FROM transitions WHERE source_host=? AND repository_id=? AND task=? ORDER BY seq DESC LIMIT ?').all(key.source_host,key.repository_id,key.task,Math.min(input.limit??20,100)):undefined;
    return {record,epoch:pointer.epoch,commit_seq:pointer.commit_seq,generated_at:pointer.produced_at,...(events?{events}:{}),observations:logs.slice(-100)};
  }finally{db.close();}
}

export function readPipelineInbox(env:NodeJS.ProcessEnv=process.env):unknown[] {
  let opened;try{opened=openSnapshot(snapshotPointerPath(storePath(env)));}catch{return [];}
  try{return opened.db.query("SELECT kind,source,observed_at,payload FROM observations WHERE kind IN ('unclaimed','weak_observation') ORDER BY seq DESC LIMIT 100").all().map((raw:any)=>{const p=JSON.parse(raw.payload);return {disposition:raw.kind,source:raw.source,received_at:raw.observed_at,pending_attention:p.pending_attention===true,candidate_hint:p.candidate_hint??null};});}finally{opened.db.close();}
}

export function readPipelineList(env:NodeJS.ProcessEnv=process.env,repo?:string,phase?:string):unknown[] {
  let opened;try{opened=openSnapshot(snapshotPointerPath(storePath(env)));}catch{return [];}
  try{return (opened.db.query('SELECT record FROM pipelines ORDER BY source_host,repository_id,task').all() as {record:string}[]).map(row=>decodeRecord(JSON.parse(row.record))).filter(r=>(!repo||r.repo.id===repo)&&(!phase||r.phase===phase)).map(r=>({...keyOf(r),id:r.id,title:r.task.title,phase:r.phase,state_version:r.state_version}));}finally{opened.db.close();}
}
