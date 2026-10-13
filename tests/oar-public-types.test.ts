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

test('real OAR observations correlate native input, replay phases and failures, and reject bad captures', () => {
  mkdirSync(join(root, '.ai/harness/runs'), { recursive: true });
  const dir = mkdtempSync(join(root, '.ai/harness/runs/oar-observation-'));
  const observer = pathToFileURL(join(root, 'src/effects/terminal/task-runtime-observation.ts')).href;
  try {
    const driver = join(dir, 'observe.mjs');
    writeFileSync(driver, `
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {scriptedRuntime} from '@botiverse/oar/testing';
import {promptWithOarObservation,replayOarStatus,readOarObservation} from ${JSON.stringify(observer)};
const dir=${JSON.stringify(dir)},path=join(dir,'observation.json');
const host={pid:process.pid,identity:'node-fixture'},request={request_id:'11111111-1111-4111-8111-111111111111',round:1};
let release,started;
const gate=new Promise(resolve=>release=resolve),toolStarted=new Promise(resolve=>started=resolve);
const session=await scriptedRuntime({turn:async({think,tool})=>{think('private-reasoning');await tool('Read','private-tool-input',async()=>{started();await gate})}}).session({kind:'available',via:'bundled'},{cwd:dir});
const save=snapshot=>writeFileSync(path,JSON.stringify(snapshot));
try{
 const pending=promptWithOarObservation(session,request,host,'private-prompt',{timeoutMs:10000},save);
 await toolStarted;
 const read=()=>readOarObservation(path,request,host),snapshot=()=>JSON.parse(readFileSync(path,'utf8'));
 assert.equal(read().status,'running');assert.equal(read().phase.tool,'Read');assert.equal(read().input_id,request.request_id);
 assert.equal(read().control,'accepted');assert.equal(JSON.stringify(read()).includes('private-'),false);
 assert.deepEqual(replayOarStatus(snapshot()),session.status().value);
 const nativePrompt=snapshot().records.find(record=>record.kind==='request'&&record.body.kind==='prompt');
 assert.equal(nativePrompt.body.inputId,request.request_id);
 release();const run=await pending;assert.equal(run.outcome.kind,'completed');
 assert.deepEqual(replayOarStatus(snapshot()),session.status().value);assert.equal(read().outcome,'completed');
 const firstCapture=readFileSync(path,'utf8');
 const next={request_id:'22222222-2222-4222-8222-222222222222',round:2};let checkedInitial=false;
 await promptWithOarObservation(session,next,host,'second-input',{timeoutMs:1000},capture=>{save(capture);if(capture.records.length===0){checkedInitial=true;assert.equal(capture.initial_status.lastTurnOutcome.kind,'completed');assert.equal(readOarObservation(path,next,host).outcome,null)}});
 assert.equal(checkedInitial,true);
 writeFileSync(path,firstCapture);
 const valid=readFileSync(path,'utf8');
 for(const changed of [{...request,request_id:'other'},{...request,round:2}])assert.throws(()=>readOarObservation(path,changed,host),/IDENTITY_MISMATCH/);
 assert.throws(()=>readOarObservation(path,request,{...host,identity:'reused-pid'}),/IDENTITY_MISMATCH/);
 const wrongSession=snapshot();wrongSession.session_id='other-session';save(wrongSession);assert.throws(read,/IDENTITY_MISMATCH/);
 writeFileSync(path,valid);const gap=snapshot();gap.records[0].seq+=1;save(gap);assert.throws(read,/INVALID/);
 writeFileSync(path,'{}');assert.throws(read,/INVALID/);writeFileSync(path,valid);
 const link=join(dir,'link.json');symlinkSync(path,link);assert.throws(()=>readOarObservation(link,request,host));
 assert.equal(readOarObservation(join(dir,'absent.json'),request,host),null);
}finally{await session.dispose()}
const failed=await scriptedRuntime({turn:()=>{throw new Error('private-error-prose')}}).session({kind:'available',via:'bundled'},{cwd:dir});
try{
 const run=await promptWithOarObservation(failed,request,host,'private-failure',{timeoutMs:1000},save);
 assert.equal(run.outcome.kind,'failed');const view=readOarObservation(path,request,host);
 assert.equal(view.outcome,'failed');assert.equal(view.failure,run.outcome.failure);
 assert.equal(JSON.stringify(view).includes('private-'),false);
 assert.deepEqual(replayOarStatus(JSON.parse(readFileSync(path,'utf8'))),failed.status().value);
}finally{await failed.dispose()}
const stopped=await scriptedRuntime({turn:async({signal})=>{await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}))}}).session({kind:'available',via:'bundled'},{cwd:dir});
let writes=0;
try{
 await assert.rejects(promptWithOarObservation(stopped,request,host,'capture-failure',{timeoutMs:1000},()=>{if(++writes>1)throw new Error('capture-write-refused')}),/capture-write-refused/);
 assert.equal(stopped.records().some(record=>record.kind==='request'&&record.body.kind==='dispose'),true);
}finally{await stopped.dispose()}
console.log(JSON.stringify({passed:true}));
`);
    const result = spawnSync('node', [driver], { cwd: root, encoding: 'utf8', timeout: 20_000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ passed: true });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30_000);
