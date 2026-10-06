import { existsSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { compareWatermarks, decodePipelineHealth, decodePublicationState, type PipelineHealthV1, type PublicationState, type PublicationIntent } from '../../core/pipeline/health';
import { decodeRecord, digest, keyOf, PipelineError, type Key } from '../../core/pipeline/types';
import { projectBoard } from '../../core/pipeline/projection';
import { unavailableBoard, type PipelineBoardV2 } from '../../core/pipeline/board';
import { projectedRuns, type LogObservation } from './ingest';
import { openSnapshot, snapshotPointerPath, storePath, publicationIntents, publicationStatePath } from './store';

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
    const logs=db.query("SELECT * FROM observations WHERE (source_host=? AND repository_id=? AND task=?) OR kind='restore_epoch' ORDER BY seq").all(key.source_host,key.repository_id,key.task).map((r:any)=>({...r,payload:JSON.parse(r.payload)}));
    if(input.evidence!==undefined){const e=record.evidence[input.evidence];if(!e)throw new PipelineError('usage',2,'Evidence index is unknown');return {...key,evidence:e,epoch:pointer.epoch,commit_seq:pointer.commit_seq};}
    record.runs=projectedRuns(record,logs);
    const events=input.events?db.query('SELECT * FROM transitions WHERE source_host=? AND repository_id=? AND task=? ORDER BY seq DESC LIMIT ?').all(key.source_host,key.repository_id,key.task,Math.min(input.limit??20,100)):undefined;
    return {record,epoch:pointer.epoch,commit_seq:pointer.commit_seq,generated_at:pointer.produced_at,...(events?{events}:{}),observations:logs.slice(-100)};
  }finally{db.close();}
}

export function readPipelineListView(env:NodeJS.ProcessEnv=process.env,repo?:string,phase?:string):unknown {
  let opened;try{opened=openSnapshot(snapshotPointerPath(storePath(env)));}catch{return {...unavailableBoard(),records:[],inbox:[]};}
  try {
    const records=(opened.db.query('SELECT record FROM pipelines ORDER BY source_host,repository_id,task').all() as {record:string}[]).map(row=>decodeRecord(JSON.parse(row.record))).filter(r=>(!repo||r.repo.id===repo)&&(!phase||r.phase===phase));
    const logs=opened.db.query('SELECT * FROM observations ORDER BY seq').all().map((row:any)=>({...row,payload:JSON.parse(row.payload)})) as LogObservation[];
    const board=projectBoard(records,logs,opened.pointer);
    return {...board,records:records.map(r=>({...keyOf(r),id:r.id,title:r.task.title,phase:r.phase,state_version:r.state_version})),inbox:logs.filter(o=>['unclaimed','weak_observation'].includes(o.kind)).slice(-100).map(o=>({disposition:o.kind,source:o.source,received_at:o.observed_at,pending_attention:o.payload.pending_attention===true,candidate_hint:o.payload.candidate_hint??null}))};
  }finally{opened.db.close();}
}

// Reads the immutable generation and writer evidence only. No live DB, source
// process, SQLite probe, recovery, directory creation, or publication is allowed.
export function readPipelineHealth(input:{env?:NodeJS.ProcessEnv;now?:Date}={}):PipelineHealthV1 {
  const env=input.env??process.env,path=storePath(env),pointerPath=snapshotPointerPath(path),now=input.now??new Date();
  const authority=env.REPO_HARNESS_PIPELINES_AUTHORITY_HOST??'kitos';
  const health:PipelineHealthV1={
    projection_version:'repo-harness.pipeline-health.v1',
    store:{path_is_default:path===storePath({}),path_sha256:digest(path),authority_host:publicHost(authority),hostname_matches:hostname()===authority,sqlite_version:null,sqlite_library_configured:!!env.REPO_HARNESS_PIPELINES_SQLITE_LIBRARY},
    snapshot:{status:'missing',watermark:null,produced_at:null,age_ms:null},
    publication:{status:'unavailable',state_file:'missing',target:null,at:null,error_code:null,pending_intents:null},
    coverage:{pipelines:null,idempotent_deliveries:null,missing_delivery_observations:null,unclassified_observations:null},
  };
  let opened;
  try {
    opened=openSnapshot(pointerPath);
    const {db,pointer}=opened;
    const records=(db.query('SELECT record FROM pipelines ORDER BY source_host,repository_id,task').all() as {record:string}[]).map(row=>decodeRecord(JSON.parse(row.record)));
    const logs=db.query('SELECT * FROM observations ORDER BY seq').all().map((row:any)=>({...row,payload:JSON.parse(row.payload)})) as LogObservation[];
    const board=projectBoard(records,logs,pointer,now);
    health.snapshot={status:board.status,watermark:{epoch:pointer.epoch,commit_seq:pointer.commit_seq},produced_at:pointer.produced_at,age_ms:Math.max(0,now.getTime()-Date.parse(pointer.produced_at))};
    const {count}=db.query('SELECT count(*) AS count FROM ingest_receipts').get() as {count:number};
    health.coverage={pipelines:board.coverage,idempotent_deliveries:count,missing_delivery_observations:logs.filter(row=>row.payload.transport?.delivery_id===null).length,unclassified_observations:logs.filter(row=>row.kind!=='restore_epoch'&&!row.payload.transport).length};
  } catch {health.snapshot.status=existsSync(pointerPath)?'unavailable':'missing';}
  finally {opened?.db.close();}
  if(!health.store.hostname_matches){health.publication.status='unknown';return decodePipelineHealth(health);}
  let state:PublicationState|null=null,unreadable=false;
  try {
    state=decodePublicationState(JSON.parse(readFileSync(publicationStatePath(path),'utf8')));
    if(state.writer.host!==authority||state.writer.path_sha256!==health.store.path_sha256)throw new Error('Foreign publication state');
    health.store.sqlite_version=state.writer.sqlite_version;
    health.publication.state_file='current';health.publication.at=state.at;
  }catch(error){state=null;if((error as NodeJS.ErrnoException).code!=='ENOENT'){health.publication.state_file='unavailable';}}
  let pending:PublicationIntent[]=[];
  try {pending=publicationIntents(path).filter(intent=>!health.snapshot.watermark||compareWatermarks(intent.watermark,health.snapshot.watermark)>0);health.publication.pending_intents=pending.length;}
  catch {unreadable=true;}
  const published=health.snapshot.watermark;
  const stateCovered=!!(state&&published&&compareWatermarks(published,state.watermark)>=0);
  if(state&&published&&(compareWatermarks(published,state.watermark)>0||(state.status==='failed'&&stateCovered)))health.publication.state_file='stale';
  const pendingTarget=pending.map(intent=>intent.watermark).sort(compareWatermarks).at(-1);
  const targets=[...(pendingTarget?[pendingTarget]:[]),...(state&&!stateCovered?[state.watermark]:[])].sort(compareWatermarks);
  health.publication.target=targets.at(-1)??published;
  if(unreadable)health.publication.status='unknown';
  else if(state?.status==='failed'&&!stateCovered&&(!pendingTarget||compareWatermarks(state.watermark,pendingTarget)>=0)){
    health.publication.status='failed';health.publication.error_code=state.error_code;
  }else if(pending.length||state&&!stateCovered)health.publication.status='pending';
  else if(published)health.publication.status='published';
  return decodePipelineHealth(health);
}
const publicHost=(value:string):string=>/^[-a-zA-Z0-9_.:]+$/.test(value)?value:'unknown';
