import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dir, '..');
const consumer = `
import { grokRuntime, promptAndWait, type Session, type SessionOptions, type Event } from '@botiverse/oar';
async function consume(options: SessionOptions): Promise<void> {
  const installation = await grokRuntime.installation();
  if (installation.kind !== 'available') throw new Error('installation unavailable');
  const session: Session = await grokRuntime.session(installation, options);
  const stop = session.events((event: Event) => { void event.kind; }, {
    cursor: { sessionId: session.id, afterSeq: -1 },
  });
  try {
    const run = await promptAndWait(session, 'compile-only', { timeoutMs: 1000 });
    if (run.kind !== 'rejected') void run.outcome.kind;
  } finally {
    stop();
    await session.dispose();
  }
}
void consume;
`;

// Compile real published declarations. These fixtures never execute a Session
// or provider; the actual root policy supplies D4 and strict source checking.
function compile(types: 'bun-types' | 'node', invalidSource = false) {
  const runs = join(root, '.ai/harness/runs');
  mkdirSync(runs, { recursive: true });
  const dir = mkdtempSync(join(runs, 'oar-public-types-'));
  try {
    const source = invalidSource
      ? `${consumer}\nconst invalid: SessionOptions = { cwd: undefined };\nvoid invalid;\n`
      : consumer;
    writeFileSync(join(dir, 'consumer.ts'), source);
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      extends: join(root, 'tsconfig.json'),
      compilerOptions: { types: [types] },
      include: ['consumer.ts'],
    }));
    return spawnSync('node', [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--project', join(dir, 'tsconfig.json'),
    ], { cwd: root, encoding: 'utf8', timeout: 30_000 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('OAR public declarations under the approved D4 policy', () => {
  for (const types of ['bun-types', 'node'] as const) {
    test(`the real Session API compiles with ${types} ambient types`, () => {
      const result = compile(types);
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(0);
    }, 40_000);
  }

  test('incorrect application source is still rejected', () => {
    const result = compile('bun-types', true);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('consumer.ts');
    expect(result.stdout + result.stderr).toContain('TS2322');
  }, 40_000);
});

test('real OAR observations are bounded, event-fresh and input-scoped, and reject invalid snapshots', () => {
  mkdirSync(join(root, '.ai/harness/runs'), { recursive: true });
  const dir = mkdtempSync(join(root, '.ai/harness/runs/oar-observation-'));
  const observer = pathToFileURL(join(root, 'src/effects/terminal/task-runtime-observation.ts')).href;
  try {
    const driver = join(dir, 'observe.mjs');
    writeFileSync(driver, `
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import {scriptedRuntime} from '@botiverse/oar/testing';
import {statusOf} from '@botiverse/oar/observe';
import {promptWithOarObservation,readOarObservation,OAR_OBSERVATION_MAX_BYTES,OAR_OBSERVATION_REFRESH_MS} from ${JSON.stringify(observer)};
const dir=${JSON.stringify(dir)},path=join(dir,'observation.json');
const host={pid:process.pid,identity:'node-fixture'},request={request_id:'11111111-1111-4111-8111-111111111111',round:1};
const read=()=>readOarObservation(path,request,host),snapshot=()=>JSON.parse(readFileSync(path,'utf8'));
let waits=[],writes=[];
const save=capture=>{writeFileSync(path,JSON.stringify(capture,null,2));writes.push({capture,at:performance.now()});for(const wait of [...waits])if(wait.predicate(capture)){waits=waits.filter(item=>item!==wait);wait.resolve(capture)}};
const waitCapture=predicate=>new Promise(resolve=>{waits.push({predicate,resolve})});
const assertFold=session=>{const folded=statusOf(session.records(),session.id);assert.deepEqual(folded,session.status());const captured=snapshot();assert.equal(captured.seq,folded.seq);assert.equal(captured.status,folded.value.kind);assert.deepEqual(captured.phase,folded.value.kind==='running'?folded.value.phase:null);if(folded.value.kind==='running'){assert.equal(captured.since_seq,folded.value.sinceSeq);assert.equal(captured.last_event_at,folded.value.lastEventAt)}};
let release,started;
const gate=new Promise(resolve=>release=resolve),toolStarted=new Promise(resolve=>started=resolve);
const session=await scriptedRuntime({turn:async({think,tool})=>{think('private-reasoning');await tool('Read','private-tool-input',async()=>{started();await gate;return 'private-tool-output'})}}).session({kind:'available',via:'bundled'},{cwd:dir});
try{
 const capturedTool=waitCapture(capture=>capture.phase?.tool==='Read');
 const pending=promptWithOarObservation(session,request,host,'private-prompt',{timeoutMs:10000},save);
 assert.equal(read().last_event_at,null);assert.equal(read().outcome,null);
 await toolStarted;await capturedTool;
 assert.equal(read().status,'running');assert.equal(read().phase.tool,'Read');assert.equal(read().input_id,request.request_id);
 assert.equal(read().control,'accepted');assert.equal(readFileSync(path,'utf8').includes('private-'),false);
 assert.equal(Object.hasOwn(snapshot(),'records'),false);assertFold(session);
 const nativePrompt=session.records().find(record=>record.kind==='request'&&record.body.kind==='prompt');
 assert.equal(nativePrompt.body.inputId,request.request_id);
 release();const run=await pending;assert.equal(run.outcome.kind,'completed');assertFold(session);assert.equal(read().outcome,'completed');
 assert(readFileSync(path).length<=OAR_OBSERVATION_MAX_BYTES);assert.equal(readFileSync(path,'utf8').includes('private-'),false);
 const firstCapture=readFileSync(path,'utf8');
 const next={request_id:'22222222-2222-4222-8222-222222222222',round:2};let checkedInitial=false;
 await promptWithOarObservation(session,next,host,'second-input',{timeoutMs:1000},capture=>{save(capture);if(!checkedInitial){checkedInitial=true;assert.equal(session.status().value.lastTurnOutcome.kind,'completed');assert.equal(readOarObservation(path,next,host).outcome,null);assert.equal(capture.control,null)}});
 assert.equal(checkedInitial,true);writeFileSync(path,firstCapture);
 const valid=readFileSync(path,'utf8');
 for(const changed of [{...request,request_id:'other'},{...request,round:2}])assert.throws(()=>readOarObservation(path,changed,host),/IDENTITY_MISMATCH/);
 assert.throws(()=>readOarObservation(path,request,{...host,identity:'reused-pid'}),/IDENTITY_MISMATCH/);
 // Each mutation violates the closed v2 schema. No native log is accepted.
 for(const mutate of [capture=>capture.seq=-2,capture=>capture.seq=1.5,capture=>capture.last_event_at=-1,
   capture=>capture.input_id='other-input',capture=>capture.protocol='repo-harness.oar-observation.v1',
   capture=>capture.records=session.records(),capture=>capture.failure='private-error-prose',
   capture=>{capture.outcome='failed';capture.failure='private-error-prose'},
   capture=>{capture.control='rejected';capture.rejection='private-rejection-prose'},
   capture=>{capture.status='running';capture.phase={tool:'Read',callId:'id',native:'private'};capture.since_seq=0},
   capture=>capture.session_id='x'.repeat(1025),capture=>capture.host.extra='private']){
   writeFileSync(path,valid);const invalid=snapshot();mutate(invalid);save(invalid);assert.throws(read,/INVALID/);
 }
 writeFileSync(path,'{}');assert.throws(read,/INVALID/);
 writeFileSync(path,' '.repeat(OAR_OBSERVATION_MAX_BYTES+1));assert.throws(read,/LIMIT/);writeFileSync(path,valid);
 const link=join(dir,'link.json');symlinkSync(path,link);assert.throws(()=>readOarObservation(link,request,host));
 assert.equal(readOarObservation(join(dir,'absent.json'),request,host),null);
}finally{await session.dispose()}
const failed=await scriptedRuntime({turn:()=>{throw new Error('private-error-prose')}}).session({kind:'available',via:'bundled'},{cwd:dir});
try{
 const run=await promptWithOarObservation(failed,request,host,'private-failure',{timeoutMs:1000},save);
 assert.equal(run.outcome.kind,'failed');assert.equal(read().outcome,'failed');assert.equal(read().failure,run.outcome.failure);
 assert.equal(readFileSync(path,'utf8').includes('private-'),false);assertFold(failed);
 const rejected=await promptWithOarObservation(failed,request,host,'',{timeoutMs:1000},save);
 assert.equal(rejected.kind,'rejected');assert.equal(read().control,'rejected');assert.equal(read().rejection,rejected.code);
 assert.equal(read().outcome,null);assert.equal(read().failure,null);assertFold(failed);
}finally{await failed.dispose()}
// A continuous responding phase must advance time and sequence. A quiet phase
// must stay quiet after the trailing flush. Use actual SDK records as barriers.
let send,finish,streamStarted;
const streamGate=new Promise(resolve=>finish=resolve),streamReady=new Promise(resolve=>streamStarted=resolve);
const stream=await scriptedRuntime({turn:async({say})=>{send=say;say('private-first');streamStarted();await streamGate}}).session({kind:'available',via:'bundled'},{cwd:dir});
try{
 writes=[];const first=waitCapture(capture=>capture.phase==='responding');
 const pending=promptWithOarObservation(stream,request,host,'private-stream',{timeoutMs:10000},save);
 await streamReady;await first;assertFold(stream);const before=read();
 const silentWrites=writes.length;await delay(OAR_OBSERVATION_REFRESH_MS+50);assert.equal(writes.length,silentWrites);assert.deepEqual(read(),before);
 const fresh=waitCapture(capture=>capture.seq>before.seq);
 for(let index=0;index<2000;index++)send('private-delta-'+ 'x'.repeat(1024));
 await fresh;assert.equal(read().phase,'responding');assert(read().last_event_at>before.last_event_at);assertFold(stream);
 assert(readFileSync(path).length<=OAR_OBSERVATION_MAX_BYTES);assert.equal(readFileSync(path,'utf8').includes('private-'),false);
 for(let index=1;index<writes.length;index++)assert(writes[index].at-writes[index-1].at>=OAR_OBSERVATION_REFRESH_MS);
 // End inside the interval. The final write must not wait for another timer.
 send('private-final');finish();await pending;assertFold(stream);assert.equal(read().outcome,'completed');
 const finalWrites=writes.length;await delay(OAR_OBSERVATION_REFRESH_MS+50);assert.equal(writes.length,finalWrites);
}finally{await stream.dispose()}
const stopped=await scriptedRuntime({turn:async({signal})=>{await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}))}}).session({kind:'available',via:'bundled'},{cwd:dir});
let refusedWrites=0;
try{
 // Failure occurs in the trailing timer, outside the SDK callback stack.
 await assert.rejects(promptWithOarObservation(stopped,request,host,'capture-failure',{timeoutMs:10000},()=>{if(++refusedWrites>1)throw new Error('capture-write-refused')}),/capture-write-refused/);
 assert.equal(stopped.records().some(record=>record.kind==='request'&&record.body.kind==='dispose'),true);
}finally{await stopped.dispose()}
// Disposal failure must not replace the capture error; both stay visible.
const inner=await scriptedRuntime({turn:async({signal})=>{await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}))}}).session({kind:'available',via:'bundled'},{cwd:dir});
const refusing=new Proxy(inner,{get(target,key){if(key==='dispose')return async()=>{await target.dispose();throw new Error('dispose-refused')};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}});
let secondWrites=0;
try{
 await assert.rejects(promptWithOarObservation(refusing,request,host,'capture-failure',{timeoutMs:10000},()=>{if(++secondWrites>1)throw new Error('capture-write-refused')}),error=>error instanceof AggregateError&&error.errors[0].message==='capture-write-refused'&&error.errors[1].message==='dispose-refused');
}finally{await inner.dispose().catch(()=>{})}
console.log(JSON.stringify({passed:true}));
`);
    const result = spawnSync('node', [driver], { cwd: root, encoding: 'utf8', timeout: 20_000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ passed: true });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30_000);
