import { afterEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { canonicalEngineerJson, engineerSha256 } from '../../src/core/engineers/profile-binding';
import { canonicalClaimActorReceiptBytes, validateClaimActorReceipt, validateEngineerPrincipalMapping } from '../../src/core/engineers/principal-claim';
import { buildTaskMessageEvent, buildTaskMessageDeliveryReceipt, canonicalTaskMessageDeliveryReceiptBytes, canonicalTaskMessageEventBytes, deriveTaskMessageRecipientKey, transitionTaskMessageDeliveryReceipt } from '../../src/core/fleet/task-message';
import { buildTaskReplyIntent, buildTaskReplyCommit, canonicalTaskReplyIntentBytes, canonicalTaskReplyCommitBytes } from '../../src/core/fleet/task-reply';
import { decodeOperatorTaskActivity, parseTaskActivityRequest, TASK_ACTIVITY_MAX_OUTPUT_BYTES } from '../../src/core/operator/task-activity';
import { OperatorTaskActivityError, readOperatorTaskActivity } from '../../src/effects/operator/task-activity';
import { readHistoricalTaskActivity } from '../../src/effects/fleet/task-inbox';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { startOperatorServer } from '../../src/effects/operator/server';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive:true, force:true }); });
const id = (n:number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12,'0')}`;
const AT = '2026-09-22T00:00:00.000Z';
const sha = (n:number) => `sha256:${String(n).repeat(64)}`;
function put(path:string, bytes:string) { mkdirSync(dirname(path),{ recursive:true }); writeFileSync(path,bytes); }
function fixture(replyBody = '  Exact old reply.\n') {
  const base = realpathSync(mkdtempSync(join(tmpdir(),'operator-activity-'))); roots.push(base);
  const root = join(base,'repo'), home=join(base,'home'); mkdirSync(root); mkdirSync(home);
  execFileSync('git',['init','-q','-b','main'],{cwd:root});
  const repo=repoHarnessRepoIdFor(root), task='a'.repeat(64), revision='b'.repeat(64);
  put(join(home,'registered-repos.json'),JSON.stringify({version:1,authorizationRevision:1,repos:[{id:repo,path:root,accessMode:'read_only',source:'adopt',registeredAt:AT,lastSeenAt:AT}]}));
  const actorBasis={protocol:1,kind:'repo-harness-claim-actor-receipt',task_id:task,task_revision:revision,claim_id:id(3),lease_generation:1,engineer_id:'engineer:capability.runtime-harness.fleet',binding_id:id(4),binding_generation:1,repository_id:repo,authorization_revision:1,work_envelope_sha256:sha(7),worktree_path:root,branch:'codex/history',unit_ref:'plans/history.md',engineer_contract_revision:sha(8),session_id:'private-session',bound_at:AT};
  const actor=validateClaimActorReceipt({...actorBasis,receipt_sha256:engineerSha256(canonicalEngineerJson(actorBasis))});
  const mappingBasis={protocol:1,kind:'repo-harness-engineer-principal-mapping',repository_id:repo,authorization_id:id(5),engineer_id:actor.engineer_id,binding_id:actor.binding_id,binding_generation:1,engineer_contract_revision:sha(8),state:'active',created_at:AT,revoked_at:null};
  const mapping=validateEngineerPrincipalMapping({...mappingBasis,mapping_digest:engineerSha256(canonicalEngineerJson(mappingBasis))});
  const parent=buildTaskMessageEvent({message_id:id(1),task_id:task,task_revision:revision,scope:'task',target_claim_id:null,target_generation:null,sender_kind:'operator',sender_id:'operator',sender_trust:'local_operator',audience:'owner',body:'Inspect before answering.',created_at:AT,in_reply_to:null});
  const recipient={kind:'claim' as const,claim_id:id(3),generation:1};
  const ack=transitionTaskMessageDeliveryReceipt(transitionTaskMessageDeliveryReceipt(buildTaskMessageDeliveryReceipt({message_id:parent.message_id,recipient,task_revision:revision,delivery_channel:'hook_session'}),{state:'delivered',at:AT}),{state:'acknowledged',at:AT});
  const intent=buildTaskReplyIntent({parent,acknowledgement:ack,principal_mapping:mapping,claim_actor:actor,reply_message_id:id(2),body:replyBody,prepared_at:AT});
  const commit=buildTaskReplyCommit({intent,committed_at:AT});
  const inbox=join(root,'.git/repo-harness/task-inbox/v1',task), key=deriveTaskMessageRecipientKey(recipient);
  const event=(message:typeof parent) => put(join(inbox,'events',`${message.message_id}.json`),canonicalTaskMessageEventBytes(message)+'\n');
  event(parent); event(intent.reply);
  put(join(inbox,'delivery',id(1),`${key}.json`),canonicalTaskMessageDeliveryReceiptBytes(ack)+'\n');
  const replyDir=join(inbox,'reply-effects',id(1),key);
  put(join(replyDir,'intent.json'),canonicalTaskReplyIntentBytes(intent)+'\n'); put(join(replyDir,'commit.json'),canonicalTaskReplyCommitBytes(commit)+'\n');
  const actorPath=join(root,'.git/repo-harness/engineers/v1/claim-actors',task,`${id(3)}.json`);
  put(actorPath,canonicalClaimActorReceiptBytes(actor));
  const input={repository_id:repo,task_id:task,limit:50,after:null,message_id:null,env:{REPO_HARNESS_HOME:home}};
  return {root,home,inbox,input,parent,intent,commit,actor,actorPath,replyDir,event};
}
function tree(path:string): string {
  return readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).map(e=>e.isDirectory()?`${e.name}/{${tree(join(path,e.name))}}`:`${e.name}:${createHash('sha256').update(readFileSync(join(path,e.name))).digest('hex')}`).join('\n');
}
test('historical exact reply needs no active sprint, Lease or Binding and never changes stored records', () => {
  const f=fixture(), before=tree(f.root);
  const r=readOperatorTaskActivity({...f.input,message_id:id(2),limit:1});
  expect(r.entries[0]).toMatchObject({provenance:'recorded_claim_actor',event:{body:'  Exact old reply.\n',task_revision:f.parent.task_revision},replies:[{state:'complete',actor:{binding_generation:1,claim_id:id(3)}}]});
  expect(r.coverage).toMatchObject({scope:'message',complete:true});
  expect(JSON.stringify(r)).not.toContain(f.root); expect(JSON.stringify(r)).not.toContain('private-session'); expect(JSON.stringify(r)).not.toContain('work_envelope');
  put(join(f.root,'plans/sprints/current.md'),'different current task revision');
  const changed=tree(f.root);
  expect(readOperatorTaskActivity({...f.input,message_id:id(2),limit:1}).entries).toEqual(r.entries);
  expect(tree(f.root)).toBe(changed); expect(before).not.toBe(changed);
});
test('old recipient channel and interrupted chain stay explicit; absent actor cannot authenticate a raw reply', () => {
  const f=fixture(); unlinkSync(join(f.replyDir,'commit.json'));
  let r=readOperatorTaskActivity(f.input);
  expect(r.entries[0]?.receipts[0]).toMatchObject({delivery_channel:'hook_session',delivery_state:'acknowledged'});
  expect(r.entries[1]).toMatchObject({provenance:'recorded_claim_actor',replies:[{state:'event_uncommitted'}]});
  unlinkSync(f.actorPath); r=readOperatorTaskActivity(f.input);
  expect(r.entries[1]).toMatchObject({provenance:'unverified',replies:[{actor:null}]});
  unlinkSync(join(f.replyDir,'intent.json'));
  expect(readOperatorTaskActivity(f.input).entries[1]?.provenance).toBe('unverified');
});
test('registered scope and missing history fail closed without creating a store', () => {
  const f=fixture(), before=tree(f.root);
  expect(()=>readOperatorTaskActivity({...f.input,repository_id:'repo_missing'})).toThrow('history_unavailable');
  expect(()=>readOperatorTaskActivity({...f.input,task_id:'c'.repeat(64)})).toThrow('history_unavailable');
  expect(()=>readOperatorTaskActivity({...f.input,message_id:id(99),limit:1})).toThrow('history_unavailable');
  expect(tree(f.root)).toBe(before);
});
test('paging is exclusive and hard scan exhaustion remains partial while exact history is readable', () => {
  const f=fixture();
  const page=readOperatorTaskActivity({...f.input,limit:1}); expect(page.next_cursor).toBe(id(1)); expect(page.coverage.reason).toBe('page');
  expect(readOperatorTaskActivity({...f.input,limit:1,after:page.next_cursor}).entries[0]?.event.message_id).toBe(id(2));
  for(let n=100;n<1101;n++) f.event(buildTaskMessageEvent({...f.parent,message_id:id(n)}));
  const r=readOperatorTaskActivity(f.input); expect(r.coverage).toMatchObject({complete:false,reason:'scan',scanned:1000}); expect(r.next_cursor).toBeNull();
  expect(readOperatorTaskActivity({...f.input,limit:1,message_id:id(2)}).entries[0]?.provenance).toBe('recorded_claim_actor');
});
test('byte ceilings include nested reply/actor reads and never report an empty complete inbox', () => {
  const f=fixture();
  const read=(max_bytes:number)=>readHistoricalTaskActivity({repo_root:f.root,task_id:f.input.task_id,limit:50,after:null,message_id:null,budget:{max_scan:1000,max_bytes,deadline_ms:250}});
  expect(read(100).coverage).toMatchObject({complete:false,reason:'bytes'});
  expect(read(3000).coverage).toMatchObject({complete:false,reason:'bytes'});
  for(let n=100;n<400;n++) f.event(buildTaskMessageEvent({...f.parent,message_id:id(n),body:'x'.repeat(8000)}));
  const r=readOperatorTaskActivity(f.input); expect(r.coverage.reason).toBe('bytes'); expect(JSON.stringify(r).length).toBeLessThan(TASK_ACTIVITY_MAX_OUTPUT_BYTES);
  expect(readOperatorTaskActivity({...f.input,message_id:id(2),limit:1}).entries[0]?.provenance).toBe('recorded_claim_actor');
});
test('unsafe and mismatched event/receipt paths are unavailable, with no path disclosure', () => {
  const f=fixture();
  put(join(f.inbox,'events',`${id(99)}.json`),canonicalTaskMessageEventBytes(f.parent)+'\n');
  expect(()=>readOperatorTaskActivity({...f.input,message_id:id(99),limit:1})).toThrow(new OperatorTaskActivityError('unavailable'));
  unlinkSync(join(f.inbox,'events',`${id(99)}.json`)); symlinkSync(join(f.inbox,'events',`${id(1)}.json`),join(f.inbox,'events',`${id(99)}.json`));
  expect(()=>readOperatorTaskActivity({...f.input,message_id:id(99),limit:1})).toThrow('unavailable');
});
test('strict decoder binds scope and rejects injected fields, duplicate entries and false provenance', () => {
  const f=fixture(), r=readOperatorTaskActivity(f.input);
  expect(decodeOperatorTaskActivity(r,f.input)).toEqual(r);
  for(const bad of [{...r,repository_id:'other'},{...r,root:f.root},{...r,entries:[r.entries[0],r.entries[0]]},{...r,entries:[{...r.entries[0],secret:'x'}]},{...r,entries:[{...r.entries[1],provenance:'unverified'}]}]) expect(()=>decodeOperatorTaskActivity(bad,f.input)).toThrow();
  const reply = r.entries[1]!;
  for (const changed of [
    {...reply, replies:reply.replies.map(chain=>({...chain,state:'absent'}))},
    {...reply, replies:reply.replies.map(chain=>({...chain,reply_message_id:null}))},
    {...reply, event:{...reply.event,sender_kind:'user'}},
  ]) expect(()=>decodeOperatorTaskActivity({...r,entries:[r.entries[0],changed]},f.input)).toThrow();
  for(const params of ['limit=0','limit=101','limit=1&limit=2','message_id=bad','message_id='+id(1)+'&after='+id(2),'root=/tmp','limit=1.0']) expect(()=>parseTaskActivityRequest(f.input.repository_id,f.input.task_id,new URLSearchParams(params))).toThrow();
});
test('production HTTP worker reads historical records in a read-only repository', async () => {
  const f=fixture(), before=tree(f.root); const server=await startOperatorServer({port:0,env:f.input.env});
  try {
    const path=`/api/v1/fleet/tasks/${f.input.repository_id}/${f.input.task_id}/activity?message_id=${id(2)}`;
    const response=await fetch(server.url+path); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({entries:[{provenance:'recorded_claim_actor'}]});
    const missing=await fetch(server.url+path.replace(id(2),id(99))); expect(missing.status).toBe(404); expect(await missing.json()).toEqual({code:'history_unavailable'});
    expect(tree(f.root)).toBe(before);
  } finally { await server.close(); }
});

test('serialized output and nested recipient scan limits are independently visible', () => {
  const f=fixture();
  const nested=readHistoricalTaskActivity({repo_root:f.root,task_id:f.input.task_id,message_id:id(1),limit:1,after:null,budget:{max_scan:1,max_bytes:2*1024*1024,deadline_ms:250}});
  expect(nested.coverage).toMatchObject({complete:false,reason:'scan',scanned:1});
  for(let n=100;n<200;n++) f.event(buildTaskMessageEvent({...f.parent,message_id:id(n),body:'\\'.repeat(8000)}));
  const result=readOperatorTaskActivity({...f.input,limit:100});
  expect(result.coverage).toMatchObject({complete:false,reason:'output'});
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(TASK_ACTIVITY_MAX_OUTPUT_BYTES);
  expect(result.next_cursor).toBeNull();
  expect(readOperatorTaskActivity({...f.input,message_id:id(199),limit:1}).entries[0]?.event.message_id).toBe(id(199));
});


test('activity preserves an empty canonical reply through the production HTTP reader', async () => {
  const f = fixture(''), before = tree(f.root);
  const server = await startOperatorServer({ port: 0, env: f.input.env });
  try {
    const path = `/api/v1/fleet/tasks/${f.input.repository_id}/${f.input.task_id}/activity?message_id=${id(2)}`;
    const response = await fetch(server.url + path);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ entries: [{ provenance: 'recorded_claim_actor', event: { body: '', body_sha256: f.intent.reply.body_sha256 } }] });
    expect(tree(f.root)).toBe(before);
  } finally { await server.close(); }
});


test('activity retains canonical UTF-8 body limits while metadata remains nonempty', () => {
  const f = fixture('界'.repeat(2730) + 'ab');
  const result = readOperatorTaskActivity({ ...f.input, message_id: id(2), limit: 1 });
  expect(result.entries[0]?.event.body).toBe(f.intent.reply.body);
  expect(Buffer.byteLength(f.intent.reply.body)).toBe(8192);
  const entry = result.entries[0]!;
  expect(() => decodeOperatorTaskActivity({ ...result, entries: [{ ...entry, event: { ...entry.event, body: f.intent.reply.body + 'x' } }] }, result)).toThrow();
  expect(() => decodeOperatorTaskActivity({ ...result, entries: [{ ...entry, event: { ...entry.event, sender_id: '' } }] }, result)).toThrow();
});
