import { Database, constants as sqlite } from 'bun:sqlite';
import { hostname } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, statfsSync, lstatSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { decodeRecord, digest, PipelineError, type Key, type PipelineRecord } from '../../core/pipeline/types';

export const WRITER_PROTOCOL = 2;
// boundary marks the first-open point between unlocked reads and the init lock.
// Concurrency tests use it as a real pause point, like MutationBoundary.
export interface StoreOptions { path?: string; wait_ms?: number; env?: NodeJS.ProcessEnv; boundary?: (stage:'preflight')=>void }
export interface Watermark {epoch:number;commit_seq:number}
export interface Pointer extends Watermark {file:string;sha256:string;produced_at:string}
let librarySelected = false;
export function selectSQLite(env: NodeJS.ProcessEnv = process.env): void {
  if (librarySelected) return;
  if (env.REPO_HARNESS_PIPELINES_SQLITE_LIBRARY && !Database.setCustomSQLite(env.REPO_HARNESS_PIPELINES_SQLITE_LIBRARY)) throw new PipelineError('sqlite_library',3,'Cannot load the configured SQLite library');
  librarySelected = true;
}
export function assertSQLiteVersion(version: string): void {
  const m=/^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if(!m) throw new PipelineError('sqlite_version',3,'SQLite version is unknown');
  const [major,minor,patch]=m.slice(1).map(Number);
  // Official fixed backports: 3.44.6 and 3.50.7. Do not infer an Apple backport.
  if (!(major! > 3 || (major===3 && (minor!>51 || (minor===51 && patch!>=3) || (minor===50 && patch!>=7) || (minor===44 && patch!>=6))))) throw new PipelineError('sqlite_version',3,`SQLite ${version} lacks the WAL-reset fix`);
}
export const storePath = (env: NodeJS.ProcessEnv = process.env) => resolve(env.REPO_HARNESS_PIPELINES_DB ?? '/Volumes/D/repo-harness/pipelines/pipelines.db');
export const snapshotPointerPath = (path: string) => path + '.snapshot.json';
function syncFile(path: string): void {const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function durable(path:string,bytes:string|Buffer): void {const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}
export function storeFailure(error: unknown): PipelineError {
  if(error instanceof PipelineError) return error;
  const code=(error as {code?:string}).code;
  return code==='SQLITE_BUSY' || code==='SQLITE_LOCKED'
    ? new PipelineError('busy',4,'Store is busy',true)
    : new PipelineError('store_unavailable',3,error instanceof Error?error.message:'Store is unavailable');
}
function requireLocation(path:string,env:NodeJS.ProcessEnv): void {
  const authority=env.REPO_HARNESS_PIPELINES_AUTHORITY_HOST ?? 'kitos';
  if(hostname() !== authority) throw new PipelineError('authority_unavailable',3,'Run the writer on the configured authority host');
  if(path==='/Volumes/D'||path.startsWith('/Volumes/D/')) {
    try {if(statSync('/Volumes/D').dev === statSync('/Volumes').dev) throw new Error('not mounted');}
    catch {throw new PipelineError('volume_unavailable',3,'Volume D is not mounted');}
  }
  let ancestor=dirname(path);while(!existsSync(ancestor)&&dirname(ancestor)!==ancestor)ancestor=dirname(ancestor);
  const fsType=statfsSync(ancestor).type;
  const allowed=process.platform==='darwin'?[17,26]:process.platform==='linux'?[0xef53,0x01021994,0x794c7630,0x58465342,0x9123683e]:[];
  if(!allowed.includes(fsType))throw new PipelineError('store_location',3,'The ledger requires a known local filesystem');
  if(path.split('/').includes('_share') || path.split('/').includes('_ops')) throw new PipelineError('store_location',3,'Shared and operations directories cannot hold the ledger');
}
export class PipelineStore {
  readonly db!: Database; readonly path: string; readonly env: NodeJS.ProcessEnv;
  constructor(options:StoreOptions={}) {
    this.env=options.env ?? process.env; this.path=resolve(options.path ?? storePath(this.env));
    const wait=options.wait_ms ?? 2000;
    if(!Number.isSafeInteger(wait)||wait<0||wait>30000) throw new PipelineError('usage',2,'wait-ms must be 0 to 30000');
    requireLocation(this.path,this.env);selectSQLite(this.env);
    const probe=new Database(':memory:');
    try{assertSQLiteVersion((probe.query('SELECT sqlite_version() v').get() as {v:string}).v);}finally{probe.close();}
    mkdirSync(dirname(this.path),{recursive:true,mode:0o700});
    try {
      this.db=new Database(this.path,{create:true,strict:true});
      this.db.exec(`PRAGMA busy_timeout=${wait}; PRAGMA synchronous=FULL;`);
      const health=this.db.query('PRAGMA quick_check').get() as Record<string,string>;
      if(Object.values(health)[0] !== 'ok') throw new PipelineError('store_corrupt',3,'quick_check failed');
      const version=(this.db.query('PRAGMA user_version').get() as {user_version:number}).user_version;
      if(version!==0 && version!==WRITER_PROTOCOL) throw new PipelineError('writer_protocol',3,'Store protocol requires an explicit migration');
      if(version===0) {
        options.boundary?.('preflight');
        // Another first opener can initialize the store before this lock. Decide again under the lock.
        this.transaction(()=>{
          const locked=(this.db.query('PRAGMA user_version').get() as {user_version:number}).user_version;
          if(locked===WRITER_PROTOCOL) return;
          if(locked!==0) throw new PipelineError('writer_protocol',3,'Store protocol requires an explicit migration');
          const count=this.db.query("SELECT count(*) n FROM sqlite_master WHERE type='table'").get() as {n:number};
          if(count.n) throw new PipelineError('writer_protocol',3,'Unversioned store requires explicit migration');
          this.db.exec(`
          CREATE TABLE metadata(id INTEGER PRIMARY KEY CHECK(id=1), epoch INTEGER NOT NULL, commit_seq INTEGER NOT NULL, protocol INTEGER NOT NULL, recovery_pending INTEGER NOT NULL);
          INSERT INTO metadata VALUES(1,1,0,2,0);
          CREATE TABLE pipelines(source_host TEXT,repository_id TEXT,task TEXT,state_version INTEGER,phase TEXT,admission TEXT,title TEXT,record TEXT,PRIMARY KEY(source_host,repository_id,task));
          CREATE TABLE transitions(seq INTEGER PRIMARY KEY AUTOINCREMENT,source_host TEXT,repository_id TEXT,task TEXT,event_id TEXT UNIQUE,ts TEXT,actor TEXT,op TEXT,from_phase TEXT,to_phase TEXT,payload TEXT,payload_hash TEXT);
          CREATE TABLE idem_keys(source_host TEXT,repository_id TEXT,task TEXT,command_key TEXT,kind TEXT,request_hash TEXT,response TEXT,response_state_version INTEGER,created_at TEXT,PRIMARY KEY(source_host,repository_id,task,command_key));
          CREATE TABLE ingest_receipts(source TEXT,delivery_id TEXT,fingerprint TEXT,received_at TEXT,disposition TEXT,PRIMARY KEY(source,delivery_id));
          CREATE TABLE observations(seq INTEGER PRIMARY KEY AUTOINCREMENT,source_host TEXT,repository_id TEXT,task TEXT,role TEXT,round INTEGER,request_id TEXT,kind TEXT,source TEXT,observed_at TEXT,payload TEXT,terminal_key TEXT UNIQUE);
          PRAGMA user_version=2;
        `);});
      }
      const meta=this.db.query('SELECT protocol FROM metadata WHERE id=1').get() as {protocol:number};
      if(meta.protocol!==WRITER_PROTOCOL) throw new PipelineError('writer_protocol',3,'Incompatible writer protocol');
      const mode=this.db.query('PRAGMA journal_mode=WAL').get() as {journal_mode:string};
      if(mode.journal_mode!=='wal') throw new PipelineError('store_mode',3,'WAL is required');
    } catch(error) {this.db!?.close();throw storeFailure(error);}
  }
  close():void {this.db.close();}
  transaction<T>(fn:()=>T):T {
    try {this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
    catch(error){throw storeFailure(error);}
  }
  watermark():Watermark {return this.db.query('SELECT epoch,commit_seq FROM metadata WHERE id=1').get() as Watermark;}
  assertWritable():void {const row=this.db.query('SELECT recovery_pending FROM metadata WHERE id=1').get() as {recovery_pending:number};if(row.recovery_pending)throw new PipelineError('restore_requires_reverification',3,'Reverify source observations after restore before new writes');}
  bump():Watermark {if(this.watermark().commit_seq>=2**52-1)throw new PipelineError('store_sequence_exhausted',3,'Store commit sequence exhausted its exact numeric range');this.db.exec('UPDATE metadata SET commit_seq=commit_seq+1 WHERE id=1');return this.watermark();}
  read(key:Key):PipelineRecord {
    const row=this.db.query('SELECT record FROM pipelines WHERE source_host=? AND repository_id=? AND task=?').get(key.source_host,key.repository_id,key.task) as {record:string}|null;
    if(!row) throw new PipelineError('unknown_id',6,'Pipeline key is unknown');return decodeRecord(JSON.parse(row.record));
  }
  all():PipelineRecord[]{return (this.db.query('SELECT record FROM pipelines ORDER BY source_host,repository_id,task').all() as {record:string}[]).map(x=>decodeRecord(JSON.parse(x.record)));}
  save(record:PipelineRecord):void {
    decodeRecord(record);
    this.db.query('INSERT INTO pipelines VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(source_host,repository_id,task) DO UPDATE SET state_version=excluded.state_version,phase=excluded.phase,admission=excluded.admission,title=excluded.title,record=excluded.record').run(record.source_host,record.repository_id,record.task.value,record.state_version,record.phase,record.admission,record.task.title,JSON.stringify(record));
  }
  audit(key:Key,op:string,from:string|null,to:string,payload:unknown):void {
    const bytes=JSON.stringify(payload);
    this.db.query('INSERT INTO transitions(source_host,repository_id,task,event_id,ts,actor,op,from_phase,to_phase,payload,payload_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(key.source_host,key.repository_id,key.task,randomUUID(),new Date().toISOString(),hostname(),op,from,to,bytes,digest(bytes));
  }
  appendObservation(input:{key?:Key;role?:string;round?:number;request_id?:string;kind:string;source:string;observed_at:string;payload:unknown;terminal_key?:string}):void {
    this.db.query('INSERT INTO observations(source_host,repository_id,task,role,round,request_id,kind,source,observed_at,payload,terminal_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(input.key?.source_host??null,input.key?.repository_id??null,input.key?.task??null,input.role??null,input.round??null,input.request_id??null,input.kind,input.source,input.observed_at,JSON.stringify(input.payload),input.terminal_key??null);
  }
  // Backup/restore is an explicit maintenance action, never a read-side repair.
  restoreEpoch():void {
    let previousEpoch=0;const pointerPath=snapshotPointerPath(this.path);
    if(existsSync(pointerPath)){const previous=openSnapshot(pointerPath);try{previousEpoch=previous.pointer.epoch;}finally{previous.db.close();}}
    this.transaction(()=>{
      for(const record of this.all()) {
        record.evidence.forEach(e=>{e.current=false;if(e.source==='verified')e.source='attested';});
        record.runs.forEach(r=>{r.result_state='present_unvalidated';r.status='pending_verification';});
        record.flags_attested.push('restore_requires_reverification');record.state_version++;record.updated_at=new Date().toISOString();
        if(record.merge.owner_approval && !record.merge.owner_approval.consumed_at) {record.merge.owner_approval.expired=true;record.merge.owner_approval.expired_reason='restore';}
        this.save(record);this.audit({source_host:record.source_host,repository_id:record.repository_id,task:record.task.value},'restore-epoch',record.phase,record.phase,{});
      }
      const epoch=Math.max(previousEpoch,this.watermark().epoch)+1;
      // Keep observation and delivery history. The marker fences old derived
      // run state without losing the inbox or making receipt dedupe lie.
      this.appendObservation({kind:'restore_epoch',source:'store',observed_at:new Date().toISOString(),payload:{epoch}});
      this.db.query('UPDATE metadata SET epoch=?,commit_seq=commit_seq+1,recovery_pending=1 WHERE id=1').run(epoch);
    });
  }
}

export function immutableDatabase(path:string):Database {
  // URI parsing must be enabled explicitly. Never pass the live DB here.
  return new Database(`file:${encodeURI(resolve(path)).replaceAll('?','%3F').replaceAll('#','%23')}?immutable=1&mode=ro`, sqlite.SQLITE_OPEN_READONLY | sqlite.SQLITE_OPEN_URI);
}
export function exportSnapshot(store:PipelineStore,out=snapshotPointerPath(store.path),boundary?:(stage:'copied'|'verified'|'published')=>void):Pointer {
  if(existsSync(out)) {
    const previous=openSnapshot(out);
    try {
      const current=store.watermark();
      if(previous.pointer.epoch>current.epoch||(previous.pointer.epoch===current.epoch&&previous.pointer.commit_seq>=current.commit_seq))return previous.pointer;
    }finally{previous.db.close();}
  }
  const directory=dirname(resolve(out));mkdirSync(directory,{recursive:true,mode:0o700});
  const temporary=join(directory,`.pipeline-${randomUUID()}.db`);
  // Claim an empty file with O_EXCL. VACUUM INTO accepts an empty target.
  // Cleanup owns this file only. Published generations are never reclaimed.
  durable(temporary,Buffer.alloc(0));
  let published=false;
  try {
  // VACUUM INTO is a consistent SQLite backup. It contains metadata and logs
  // from the same view. No watermark is taken from the live connection.
  store.db.query('VACUUM INTO ?').run(temporary);syncFile(temporary);boundary?.('copied');
  const copied=immutableDatabase(temporary);let watermark:Watermark;
  try {
    const health=copied.query('PRAGMA integrity_check').get() as Record<string,string>;
    if(Object.values(health)[0]!=='ok') throw new PipelineError('snapshot_corrupt',3,'Snapshot integrity check failed');
    watermark=copied.query('SELECT epoch,commit_seq FROM metadata WHERE id=1').get() as Watermark;
  } finally{copied.close();}
  const pointer:Pointer={...watermark,file:basename(temporary),sha256:digest(readFileSync(temporary)),produced_at:new Date().toISOString()};
  chmodSync(temporary,0o400);boundary?.('verified');
  return store.transaction(()=>{
    let old:Pointer|null=null;
    if(existsSync(out)) {try{old=JSON.parse(readFileSync(out,'utf8'));}catch{throw new PipelineError('snapshot_pointer',3,'Publication pointer is corrupt');}}
    if(old && (old.epoch>pointer.epoch || (old.epoch===pointer.epoch && old.commit_seq>=pointer.commit_seq))) return old;
    const next=out+`.${randomUUID()}.tmp`;durable(next,JSON.stringify(pointer)+'\n');renameSync(next,out);published=true;syncFile(directory);boundary?.('published');return pointer;
  });
  }finally{if(!published&&existsSync(temporary))unlinkSync(temporary);}
}
export function publishAfterCommit(store:PipelineStore):void {
  let last:unknown;
  for(let i=0;i<3;i++){try{exportSnapshot(store);return;}catch(error){last=error;}}
  process.stderr.write(JSON.stringify({warning:'snapshot_export_failed',attempts:3,error:storeFailure(last).code})+'\n');
}
export function openSnapshot(pointerPath:string):{db:Database;pointer:Pointer} {
  try {
    const pointer=JSON.parse(readFileSync(pointerPath,'utf8')) as Pointer;
    if(!Number.isSafeInteger(pointer.epoch)||!Number.isSafeInteger(pointer.commit_seq)||pointer.epoch<1||pointer.commit_seq<0||basename(pointer.file)!==pointer.file||!pointer.file.startsWith('.pipeline-')) throw new Error('Invalid snapshot pointer');
    if(typeof pointer.produced_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(pointer.produced_at)||!/^sha256:[a-f0-9]{64}$/.test(pointer.sha256))throw new Error('Invalid snapshot metadata');
    const path=join(dirname(pointerPath),pointer.file);
    const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Snapshot must be a regular immutable file');
    if(digest(readFileSync(path))!==pointer.sha256) throw new Error('Snapshot digest mismatch');
    const db=immutableDatabase(path);
    const mark=db.query('SELECT epoch,commit_seq FROM metadata WHERE id=1').get() as Watermark;
    if(mark.epoch!==pointer.epoch||mark.commit_seq!==pointer.commit_seq){db.close();throw new Error('Snapshot watermark mismatch');}
    return {db,pointer};
  } catch(error){throw storeFailure(error);}
}
