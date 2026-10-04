import { sourceAuthority } from './authority';
import { PipelineStore, publishAfterCommit } from './store';
import { digest, keyOf, object, PipelineError, type Key, type PipelineRecord, type Run } from '../../core/pipeline/types';

export { type LogObservation, projectedRuns } from '../../core/pipeline/projection';
import { type LogObservation, projectedRuns } from '../../core/pipeline/projection';
export function observations(store:PipelineStore):LogObservation[] {return store.db.query('SELECT * FROM observations ORDER BY seq').all().map((row:any)=>({...row,payload:JSON.parse(row.payload)}));}
function identity(log:LogObservation,key:Key):boolean{return log.source_host===key.source_host&&log.repository_id===key.repository_id&&log.task===key.task;}
const empty=(kind:string,source:string,payload:Record<string,any>):LogObservation=>({source_host:null,repository_id:null,task:null,role:null,round:null,request_id:null,kind,source,observed_at:new Date().toISOString(),payload,terminal_key:null});
function runLog(record:PipelineRecord,run:Run,kind:string,source:string,payload:Record<string,any>):LogObservation {return {...empty(kind,source,payload),...keyOf(record),role:run.role,round:run.round,request_id:run.request_id};}
export function ingestEvent(store:PipelineStore,payload:unknown,input:{source?:string;delivery_id?:string;snapshot?:boolean}={},boundary?:(stage:'observations'|'receipt'|'commit')=>void):Record<string,any> {
  const event=object(payload);const source=input.source??(typeof event.source==='string'?event.source:'herdr');
  if(event.phase!==undefined||event.state_version!==undefined)throw new PipelineError('usage',2,'Ingest cannot replace record state');
  const delivery=input.delivery_id;
  if(delivery) {
    const row=store.db.query('SELECT disposition FROM ingest_receipts WHERE source=? AND delivery_id=?').get(source,delivery);
    if(row)return {status:'duplicate'};
  }
  store.assertWritable();
  const records=store.all();const oldLogs=observations(store);const pending:LogObservation[]=[];let status='unclaimed';let errors=0;
  if(input.snapshot) {
    const panes=event.result?.panes;
    if(!Array.isArray(panes))throw new PipelineError('usage',2,'Snapshot requires the Herdr pane list envelope');
    status='observed';
    for(const record of records) {
      const roles=[...new Set(record.runs.map(r=>r.role))];
      // A registered session role can also recover a send that was never enrolled.
      for(const obs of record.observations)if(obs.kind==='session'&&typeof obs.data.role==='string')roles.push(obs.data.role);
      for(const role of [...new Set(roles)]) {
        const bundle=sourceAuthority({key:keyOf(record),root:record.repo.root,kind:'enroll',payload:{role}},store.env);
        if(bundle)pending.push({...empty('enrollment','outbox',bundle.output),...keyOf(record)});
        else {errors++;pending.push({...empty('source_unavailable','outbox',{registration_incomplete:1}),...keyOf(record)});}
      }
      const runs=projectedRuns(record,[...oldLogs,...pending]);
      for(const run of runs) {
        const bundle=sourceAuthority({key:keyOf(record),root:record.repo.root,kind:'result',payload:{role:run.role,round:run.round,request_id:run.request_id,context_sha256:run.context_sha256}},store.env);
        if(bundle){const log=runLog(record,run,'result','outbox',bundle.output);if(log.payload.result_state==='validated')log.terminal_key=digest(JSON.stringify({...keyOf(record),role:run.role,round:run.round,request_id:run.request_id,digest:log.payload.result_digest}));pending.push(log);pending.push(runLog(record,run,'source_check','outbox',bundle.output));}
        else {errors++;pending.push(runLog(record,run,'source_unavailable','outbox',{result_state:'unavailable'}));}
        // Snapshot pane identity is explicit. Host and session must accompany it.
        const pane=panes.find((p:any)=>p.pane_id===run.pane.pane_id&&event.host===run.source_host&&event.herdr_session===run.endpoint.session);
        if(event.host===run.source_host&&event.herdr_session===run.endpoint.session)pending.push(runLog(record,run,'liveness','herdr',{present:!!pane,agent_status:pane?.agent_status??'unknown'}));
      }
    }
    pending.push(empty('reconcile','round',{status:errors?'partial':'complete',errors,checked_at:new Date().toISOString()}));
    if(errors)status='partial';
  } else if(typeof event.cwd==='string' && (event.cwd.startsWith('/tmp/')||event.cwd.startsWith('/private/tmp/')) || typeof event.workspace_label==='string' && event.workspace_label.startsWith('rh-herdr-'))status='ignored';
  else {
    const full=['source_host','repository_id','task','role','round','request_id','context_sha256'].every(k=>event[k]!==undefined);
    const record=full?records.find(r=>r.source_host===event.source_host&&r.repository_id===event.repository_id&&r.task.value===event.task):undefined;
    const run=record?projectedRuns(record,oldLogs).find(r=>r.role===event.role&&r.round===event.round&&r.request_id===event.request_id&&r.context_sha256===event.context_sha256):undefined;
    if(record&&run) {
      const bundle=sourceAuthority({key:keyOf(record),root:record.repo.root,kind:'result',payload:{role:run.role,round:run.round,request_id:run.request_id,context_sha256:run.context_sha256}},store.env);
      if(bundle) {
        status='observed';const log=runLog(record,run,'result','outbox',bundle.output);
        if(log.payload.result_state==='validated')log.terminal_key=digest(JSON.stringify({...keyOf(record),role:run.role,round:run.round,request_id:run.request_id,digest:log.payload.result_digest}));
        pending.push(log);pending.push(runLog(record,run,'source_check','outbox',bundle.output));
      } else {status='weak_observation';pending.push(empty('weak_observation',source,{event,quality:'unavailable',pending_attention:true}));}
    } else if(event.agent_status==='done'||event.agent_status==='blocked'){status='weak_observation';pending.push(empty('weak_observation',source,{event,pending_attention:true}));}
    else if(records.some(r=>r.runs.some(run=>run.pane.pane_id===event.pane_id&&run.source_host===event.host&&run.endpoint.session===event.herdr_session))){status='observed';pending.push(empty('liveness_hint',source,{event}));}
    else pending.push(empty('unclaimed',source,{event,candidate_hint:event.tab_label??null}));
  }
  if(status==='ignored')pending.push(empty('ignored',source,{event}));
  const result=store.transaction(()=>{
    if(delivery&&store.db.query('SELECT 1 FROM ingest_receipts WHERE source=? AND delivery_id=?').get(source,delivery))return {status:'duplicate'};
    store.assertWritable();
    let appended=0;
    for(const log of pending) {
      if(log.task) {
        const current=store.read({source_host:log.source_host!,repository_id:log.repository_id!,task:log.task});
        if(log.kind==='result'&&!projectedRuns(current,[...observations(store),...pending.filter(o=>o.kind==='enrollment'&&identity(o,keyOf(current)))]).some(r=>r.role===log.role&&r.round===log.round&&r.request_id===log.request_id)){errors++;continue;}
      }
      if(log.terminal_key&&store.db.query('SELECT 1 FROM observations WHERE terminal_key=?').get(log.terminal_key)){if(!input.snapshot)status='duplicate';continue;}
      store.db.query('INSERT INTO observations(source_host,repository_id,task,role,round,request_id,kind,source,observed_at,payload,terminal_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(log.source_host,log.repository_id,log.task,log.role,log.round,log.request_id,log.kind,log.source,log.observed_at,JSON.stringify(log.payload),log.terminal_key);appended++;
    }
    boundary?.('observations');
    if(delivery)store.db.query('INSERT INTO ingest_receipts VALUES(?,?,?,?,?)').run(source,delivery,digest(JSON.stringify(event)),new Date().toISOString(),status);
    boundary?.('receipt');
    if(appended||delivery)return {status,observations:appended,errors,...store.bump()};
    return {status,observations:0,errors,...store.watermark()};
  });
  boundary?.('commit');publishAfterCommit(store);return result;
}
