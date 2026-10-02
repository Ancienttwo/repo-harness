import { afterEach, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { readFileSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { historicalPlanningFixture, installHistoricalBoundDispatch } from '../helpers/historical-campaign-lifecycle';
import { runCampaignAcquisition, campaignAcquisitionPolicyR2, budgetedAcquisition, inspectCampaignAcquisitionCutover, migrateCampaignAcquisitionReceipts, type CampaignAcquisitionTransactionPorts } from '../../src/effects/automation/campaign-acquisition';
import { withCampaignCapacity } from '../../src/effects/automation/campaign-capacity';
import { ensureCampaignAuthoringBudget, readAutomationBudgetStatus } from '../../src/effects/automation/budget-store';
import { requireCampaignPlanningAuthority } from '../../src/effects/automation/campaign-planning-proof';
import { leaseOwnerPath, readLease, withTaskLock, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { resolveEngineerPrincipal } from '../../src/effects/engineers/principal';
import { acquireScheduledEngineerTask } from '../../src/effects/engineers/scheduling-acquire';
import { collectEngineerOffers } from '../../src/effects/engineers/scheduling';
import { acquireNextScheduledEngineerTask, buildAcquisitionRequestIdentity, requireFreshAcquisitionBudgetAdmission, type AcquireNextScheduledEngineerTaskOptions } from '../../src/effects/engineers/scheduling-acquire-next';
import { canonicalMessageDigest } from '../../src/core/messages/mechanics';
import { readPlanningRecord, persistPlanningRecord, withCampaignPlanningLock } from '../../src/effects/automation/campaign-planning-store';
import { validateFleetWorkEnvelope } from '../../src/effects/fleet/acquire';
import { validateClaimActorReceiptLive } from '../../src/effects/engineers/claim-actor-store';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
const sprint = 'plans/sprints/repair.sprint.md';
const git = (root: string, args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('new acquisition and repeated request refuse before budget, callback or Lease mutation', async () => {
  const f = await historicalPlanningFixture(); roots.push(f.root, f.home);
  const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env }).budget;
  const before = readAutomationBudgetStatus(f.root, budget.automation_run_id, f.env);
  let invoked = 0;
  for (const idempotency_key of ['execute', 'execute', 'new-request']) {
    expect(() => runCampaignAcquisition({ ...f.executeInput, idempotency_key }, () => { invoked++; throw new Error('unexpected acquire'); })).toThrow('trusted exact revision readback');
  }
  expect(invoked).toBe(0);
  expect(readAutomationBudgetStatus(f.root, budget.automation_run_id, f.env)).toEqual(before);
  const authority = requireCampaignPlanningAuthority(f.root, f.intent, f.env);
  for (const task of authority.manifest.slots) expect(readLease(f.root, task.task_id).record).toBeNull();
});

test('generic campaign claim actuator cannot bypass the readiness projection', async () => {
  const f = await historicalPlanningFixture(); roots.push(f.root, f.home);
  const task = requireCampaignPlanningAuthority(f.root, f.intent, f.env).manifest.slots[0]!.task_id;
  let claims = 0;
  expect(() => withCampaignCapacity(f.root, task, 'main', f.env, () => { claims++; })).toThrow('trusted exact revision readback');
  expect(claims).toBe(0); expect(readLease(f.root, task).record).toBeNull();
  expect(withCampaignCapacity(f.root, 'f'.repeat(64), 'main', f.env, () => 'unrelated')).toBe('unrelated');
});

test('historical bound envelope and actor remain valid without admitting another dispatch', async () => {
  const f = await historicalPlanningFixture(); roots.push(f.root, f.home);
  const d = installHistoricalBoundDispatch(f);
  expect(() => validateFleetWorkEnvelope(f.root, d.envelope, f.env)).not.toThrow();
  expect(() => validateClaimActorReceiptLive(f.root, d.receipt, d.envelope)).not.toThrow();
  const before = readLease(f.root, d.envelope.task_id);
  expect(() => runCampaignAcquisition(f.executeInput)).toThrow('trusted exact revision readback');
  expect(readLease(f.root, d.envelope.task_id)).toEqual(before);
});

test('two OS callers cannot allocate campaign Claims under the frozen admission boundary', async () => {
  const f = await historicalPlanningFixture(true); roots.push(f.root, f.home);
  const entry = join(import.meta.dir, '../../src/effects/automation/campaign-acquisition.ts');
  const children = [f.executeInput.authorization_id, f.secondAuthorization].map(authorization_id => Bun.spawn([process.execPath, '-e', `
    import { runCampaignAcquisition } from ${JSON.stringify(entry)};
    try { runCampaignAcquisition(${JSON.stringify({ ...f.executeInput, authorization_id })}); process.exit(2); }
    catch (error) { if (!String(error).includes('trusted exact revision readback')) throw error; }
  `], { cwd: f.root, env: f.env, stdout: 'pipe', stderr: 'pipe' }));
  for (const child of children) expect(await child.exited, await new Response(child.stderr).text()).toBe(0);
  for (const task of requireCampaignPlanningAuthority(f.root, f.intent, f.env).manifest.slots) expect(readLease(f.root, task.task_id).record).toBeNull();
});

test('real Engineer acquire-next skips a campaign with unavailable revision admission for later unrelated ready work', async () => {
  const f = await historicalPlanningFixture(true); roots.push(f.root, f.home);
  const taskId = 'e'.repeat(64);
  const task = 'Unrelated ready repair';
  const plan = 'plans/plan-unrelated.md';
  const contract = 'tasks/contracts/unrelated.contract.md';
  const sprintPath = join(f.root, sprint);
  writeFileSync(sprintPath, readFileSync(sprintPath, 'utf8').replace('\n## Execution Log', `\n| 3 | ${taskId} | [ ] | ${task} | contract | Unrelated repair passes | (pending) |\n\n## Execution Log`));
  const graphPath = join(f.root, 'plans/sprints/repair.work-graph.v1.json');
  const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  const campaignTask = graph.work_packages[0].task_id;
  graph.work_packages.push({ ...graph.work_packages[0], work_package_id: 'unrelated-ready', task_id: taskId, priority: 0, depends_on: [] });
  writeFileSync(graphPath, JSON.stringify(graph));
  writeFileSync(join(f.root, plan), readFileSync(join(f.root, 'plans/plan-repair-0.md'), 'utf8')
    .replace(/^> \*\*Source Ref\*\*: .*$/m, `> **Source Ref**: sprint:${sprint}#${task}`)
    .replace('tasks/contracts/repair-0.contract.md', contract));
  writeFileSync(join(f.root, contract), readFileSync(join(f.root, 'tasks/contracts/repair-0.contract.md'), 'utf8').replace('plans/plan-repair-0.md', plan));
  git(f.root, ['add', '.']); git(f.root, ['commit', '-qm', 'unrelated canonical ready task']);

  const principal = resolveEngineerPrincipal({ repo_root: f.root, authorization_id: f.executeInput.authorization_id, env: f.env });
  expect(collectEngineerOffers({ repo_root: f.root, principal, env: f.env }).offers.map(offer => offer.task_id)).toEqual([taskId]);
  const input = { repo_root: f.root, principal, env: f.env, session_id: 'parent', idempotency_key: 'unrelated-next' };
  const acquired = acquireNextScheduledEngineerTask(input);
  expect(acquired, JSON.stringify(acquired)).toMatchObject({ ok: true, envelope: { task_id: taskId } });
  if (acquired.ok) {
    roots.push(acquired.envelope.worktree_path);
    expect(readLease(f.root, taskId).record).toMatchObject({ state: 'bound', claim_id: acquired.envelope.claim_id });
    expect(acquireNextScheduledEngineerTask(input)).toEqual(acquired);
  }
  expect(readLease(f.root, campaignTask).record).toBeNull();
});
test('verified revision admits a real acquisition and worker binding while missing image refuses preparation', async () => {
  const f = await historicalPlanningFixture(false, false, undefined, true, {}, false, false, true); roots.push(f.root, f.home);
  const inventory = inspectCampaignAcquisitionCutover(f.root, f.intent);
  migrateCampaignAcquisitionReceipts({ repo_root: f.root, intent: f.intent,
    expected_inventory_sha256: inventory.inventory_sha256, quiescence_evidence: 'fixture:all-old-producers-stopped' });
  const result = runCampaignAcquisition(f.executeInput);
  expect(result, JSON.stringify(result)).toHaveProperty('action', 'dispatch');
  if (!('action' in result) || result.action !== 'dispatch') throw new Error('expected actual dispatch');
  roots.push(result.envelope.worktree_path);
  expect(() => validateFleetWorkEnvelope(f.root, result.envelope, f.env)).not.toThrow();
  expect(() => validateClaimActorReceiptLive(f.root, result.receipt, result.envelope)).not.toThrow();
  expect(runCampaignAcquisition(f.executeInput)).toEqual(result);
  const { bindCampaignWorker } = await import('../../src/effects/automation/campaign-worker');
  const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env }).budget;
  const before = readAutomationBudgetStatus(f.root, budget.automation_run_id, f.env);
  expect(() => bindCampaignWorker({ selector: result.worker_handoff, worktree: result.envelope.worktree_path,
    contract: result.envelope.plan.contract_path, worker_command: 'touch forbidden-worker', verifier_command: 'true', env: f.env }))
    .toThrow('requires the supervised codex-exec provider');
  expect(readAutomationBudgetStatus(f.root, budget.automation_run_id, f.env)).toEqual(before);
  const bound = bindCampaignWorker({ selector: result.worker_handoff, worktree: result.envelope.worktree_path,
    contract: result.envelope.plan.contract_path, worker_command: 'worker', verifier_command: 'verifier', provider: 'codex-exec',
    env: { ...f.env, BRC_CAMPAIGN_IMAGE: '' } });
  expect(bound.replay).toBeNull();
  await expect(bound.prepareChild('worker', 'prompt.md', Date.now() + 60000)).rejects.toThrow('BRC_CAMPAIGN_IMAGE');
  expect(() => bound.beforeChild('worker', 'worker')).toThrow('invocation intent is missing');
}, 60000);


// These cases exercise the real outer record protocol with existing budget ports; lower campaign
// authority/claim E2E remains covered by the real fixture above. No production selected caller is added.
test('S2 outer identity conflicts before reserve/invoke; completed replay does not repay budget', async () => {
  const f=await historicalPlanningFixture();roots.push(f.root,f.home);
  const inventory=inspectCampaignAcquisitionCutover(f.root,f.intent);
  migrateCampaignAcquisitionReceipts({repo_root:f.root,intent:f.intent,expected_inventory_sha256:inventory.inventory_sha256,quiescence_evidence:'fixture:quiesced'});
  const principal=resolveEngineerPrincipal({repo_root:f.root,authorization_id:f.executeInput.authorization_id,env:f.env});
  const base:AcquireNextScheduledEngineerTaskOptions={repo_root:f.root,principal,idempotency_key:'inner',session_id:f.executeInput.session_id,
    filters:{task_ids:['a'.repeat(64)]},admission_policy:campaignAcquisitionPolicyR2(f.executeInput,f.intent,requireCampaignPlanningAuthority(f.root,f.intent,f.env)),
    before_acquire:()=>{},accept_acquired:()=>{}};
  const request=buildAcquisitionRequestIdentity(base);
  let reserves=0,effects=0;const settled=new Set<string>();
  const ports:Partial<CampaignAcquisitionTransactionPorts>={
    readAuthority:()=>requireCampaignPlanningAuthority(f.root,f.intent,f.env),
    ensureBudget:()=>({budget:{automation_run_id:'test-run',budget_sha256:'sha256:'+'b'.repeat(64)}}) as any,
    reserveBudget:input=>{reserves++;return {idempotency_key:input.idempotency_key,reservation_sha256:'sha256:'+'c'.repeat(64)} as any;},
    appendUsage:input=>{settled.add(input.reservation.reservation_sha256);return {} as any;},
    requireInnerAdmission:()=>{},
  };
  const result={ok:true as const,offer:{} as any,envelope:{} as any,receipt:{} as any};
  const invoke=()=>{effects++;return result;};
  expect(budgetedAcquisition(f.executeInput,f.intent,request,invoke,ports)).toEqual(result);
  expect(budgetedAcquisition(f.executeInput,f.intent,request,invoke,ports)).toEqual(result);
  expect(reserves).toBe(1);expect(effects).toBe(1);expect(settled.size).toBe(1);
  // Exact historical protocol-2 R1 metadata, with no new schema reader/migration.
  const legacyRequest={...request,policy:{...request.policy,policy_revision:'R1',scope:{...request.policy.scope!,authorization_revision:f.authorization.authorization_sha256}}};
  const oldInput={...f.executeInput,idempotency_key:'r1-completed'};
  const oldCursor=canonicalMessageDigest({operation:'campaign-acquisition-budget',intent_sha256:f.intent.intent_sha256,key:oldInput.idempotency_key});
  withCampaignPlanningLock(f.root,f.intent,()=>{
    persistPlanningRecord(f.root,f.intent,canonicalMessageDigest({cursor:oldCursor,part:'admission'}).slice(7),{
      protocol:2,kind:'repo-harness-campaign-acquisition-admission',request:legacyRequest,reservation:{idempotency_key:oldCursor},
    });
    persistPlanningRecord(f.root,f.intent,canonicalMessageDigest({cursor:oldCursor,part:'result'}).slice(7),{
      protocol:2,kind:'repo-harness-campaign-acquisition-result',request_sha256:canonicalMessageDigest({...legacyRequest}),result,
    });
  });
  expect(()=>budgetedAcquisition(oldInput,f.intent,request,invoke,ports)).toThrow('different authenticated request');
  expect(reserves).toBe(1);expect(effects).toBe(1);expect(settled.size).toBe(1);

  for(const changed of [{...request,session_id:'other'}, {...request,operation:'selected' as const,observation_ref:'sha256:'+'d'.repeat(64),assertion:{} as any,filters:null,max_selection_attempts:null},
    {...request,policy:{...request.policy,scope:{...request.policy.scope!,manifest_sha256:'sha256:'+'f'.repeat(64)}}}]) {
    expect(()=>budgetedAcquisition(f.executeInput,f.intent,changed,invoke,ports)).toThrow('different authenticated request');
  }
  expect(reserves).toBe(1);expect(effects).toBe(1);expect(settled.size).toBe(1);
  // A completed inner transaction without an outer admission/result is never paid/re-invoked.
  const extra={...base,idempotency_key:'orphan-inner',dependencies:{resolvePrincipal:()=>principal,
    collectOffers:()=>({offers:[{work_package_id:'one',task_id:'a'.repeat(64)}]} as any),
    acquire:()=>result}};
  expect(acquireNextScheduledEngineerTask(extra).ok).toBeTrue();
  const orphan=buildAcquisitionRequestIdentity(extra);
  expect(()=>budgetedAcquisition({...f.executeInput,idempotency_key:'orphan-outer'},f.intent,orphan,invoke,
    {...ports,requireInnerAdmission:requireFreshAcquisitionBudgetAdmission})).toThrow('matching outer outcome');
  expect(reserves).toBe(1);expect(effects).toBe(1);
});

test('S2 outer unresolved effect and missing-result persistence never invoke twice', async () => {
  const f=await historicalPlanningFixture();roots.push(f.root,f.home);
  const inventory=inspectCampaignAcquisitionCutover(f.root,f.intent);
  migrateCampaignAcquisitionReceipts({repo_root:f.root,intent:f.intent,expected_inventory_sha256:inventory.inventory_sha256,quiescence_evidence:'fixture:quiesced'});
  const principal=resolveEngineerPrincipal({repo_root:f.root,authorization_id:f.executeInput.authorization_id,env:f.env});
  const request=buildAcquisitionRequestIdentity({repo_root:f.root,principal,idempotency_key:'inner',session_id:f.executeInput.session_id,
    admission_policy:campaignAcquisitionPolicyR2(f.executeInput,f.intent,requireCampaignPlanningAuthority(f.root,f.intent,f.env)),before_acquire:()=>{},accept_acquired:()=>{}});
  let effects=0,reserves=0,usage=0;
  const ports:Partial<CampaignAcquisitionTransactionPorts>={readAuthority:()=>requireCampaignPlanningAuthority(f.root,f.intent,f.env),
    ensureBudget:()=>({budget:{automation_run_id:'test-run',budget_sha256:'sha256:'+'b'.repeat(64)}}) as any,
    reserveBudget:input=>{reserves++;return {idempotency_key:input.idempotency_key} as any;},appendUsage:()=>{usage++;return {} as any;},requireInnerAdmission:()=>{}};
  expect(()=>budgetedAcquisition(f.executeInput,f.intent,request,()=>{effects++;throw Error('effect outcome unknown');},ports)).toThrow('effect outcome unknown');
  expect(()=>budgetedAcquisition(f.executeInput,f.intent,request,()=>{effects++;throw Error('must not execute');},ports)).toThrow('reconciliation');
  expect(effects).toBe(1);expect(reserves).toBe(1);expect(usage).toBe(0);
  const input={...f.executeInput,idempotency_key:'result-crash'};
  const persist=ports.persistRecord??persistPlanningRecord;
  const crashPorts={...ports,persistRecord:((root:any,intent:any,key:any,record:any)=>{
    if(record.kind==='repo-harness-campaign-acquisition-result')throw Error('outer result persistence interrupted');
    persist(root,intent,key,record);
  }) as typeof persistPlanningRecord};
  expect(()=>budgetedAcquisition(input,f.intent,request,()=>{effects++;return {ok:true,offer:{} as any,envelope:{} as any,receipt:{} as any};},crashPorts)).toThrow('outer result persistence interrupted');
  expect(()=>budgetedAcquisition(input,f.intent,request,()=>{effects++;throw Error('must not execute');},ports)).toThrow('reconciliation');
  expect(effects).toBe(2);expect(reserves).toBe(2);expect(usage).toBe(0);
});

test.each(['completed','pending'] as const)('S2 legacy outer %s is fenced or stops cutover without spending', async state => {
  const f=await historicalPlanningFixture();roots.push(f.root,f.home);
  const cursor=canonicalMessageDigest({operation:'campaign-acquisition-budget',intent_sha256:f.intent.intent_sha256,key:f.executeInput.idempotency_key});
  const admissionKey=canonicalMessageDigest({cursor,part:'admission'}).slice(7),resultKey=canonicalMessageDigest({cursor,part:'result'}).slice(7);
  const principal=resolveEngineerPrincipal({repo_root:f.root,authorization_id:f.executeInput.authorization_id,env:f.env});
  withCampaignPlanningLock(f.root,f.intent,()=>{
    persistPlanningRecord(f.root,f.intent,admissionKey,{request:{principal,session_id:f.executeInput.session_id,authorization_id:f.executeInput.authorization_id},reservation:{operation:'acquisition',idempotency_key:cursor}});
    if(state==='completed')persistPlanningRecord(f.root,f.intent,resultKey,{ok:true,offer:{},envelope:{},receipt:{}});
  });
  const original=readPlanningRecord(f.root,f.intent,admissionKey);
  const operatorArgs = ['engineer', 'campaign-acquisition-cutover'];
  const identityArgs = ['--campaign-id', f.intent.campaign_id, '--group-number', String(f.intent.group_number), '--intent-sha256', f.intent.intent_sha256, '--json'];
  const operator = (action: string, extra: string[] = []) => Bun.spawnSync([process.execPath, resolve(import.meta.dir, '../../src/cli/index.ts'), ...operatorArgs, action, ...identityArgs, ...extra], { cwd: f.root, env: f.env, stdout: 'pipe', stderr: 'pipe' });
  const inspected = operator('inspect');
  expect(inspected.exitCode, inspected.stderr.toString()).toBe(0);
  const inventory = JSON.parse(inspected.stdout.toString());
  expect(inventory).toEqual(inspectCampaignAcquisitionCutover(f.root, f.intent));
  const changed = operator('migrate', ['--expected-inventory-sha256', `sha256:${'0'.repeat(64)}`, '--quiescence-evidence', 'fixture:stopped']);
  expect(changed.exitCode).toBe(1);
  expect(JSON.parse(changed.stderr.toString())).toMatchObject({ error: 'human_attention_required', message: 'campaign cutover inventory changed' });
  const migrate = () => {
    const result = operator('migrate', ['--expected-inventory-sha256', inventory.inventory_sha256, '--quiescence-evidence', 'fixture:stopped']);
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return JSON.parse(result.stdout.toString());
  };
  if(state==='pending')expect(migrate).toThrow('unresolved');else {expect(migrate().fenced_admissions).toContain(admissionKey);expect(migrate().fenced_admissions).toContain(admissionKey);}
  expect(JSON.stringify(readPlanningRecord(f.root,f.intent,admissionKey))).toBe(JSON.stringify(original));
  let mutations=0;
  const request=buildAcquisitionRequestIdentity({repo_root:f.root,principal,idempotency_key:'inner',session_id:f.executeInput.session_id,
    admission_policy:campaignAcquisitionPolicyR2(f.executeInput,f.intent,requireCampaignPlanningAuthority(f.root,f.intent,f.env)),before_acquire:()=>{},accept_acquired:()=>{}});
  expect(()=>budgetedAcquisition(f.executeInput,f.intent,request,()=>{mutations++;throw Error('must not invoke');},{
    readAuthority:()=>requireCampaignPlanningAuthority(f.root,f.intent,f.env),
    reserveBudget:()=>{mutations++;throw Error('must not reserve');},ensureBudget:()=>{mutations++;throw Error('must not initialize budget');},
  })).toThrow(state==='pending'?'cutover':'fenced');
  expect(mutations).toBe(0);
});


async function s3Fixture() {
  const f=await historicalPlanningFixture(false,false,undefined,true,{},false,false,true);
  roots.push(f.root,f.home);
  const inventory=inspectCampaignAcquisitionCutover(f.root,f.intent);
  migrateCampaignAcquisitionReceipts({repo_root:f.root,intent:f.intent,expected_inventory_sha256:inventory.inventory_sha256,quiescence_evidence:'fixture:old-producers-retired'});
  const authority=requireCampaignPlanningAuthority(f.root,f.intent,f.env);
  const principal=resolveEngineerPrincipal({repo_root:f.root,authorization_id:f.executeInput.authorization_id,env:f.env});
  const offer=collectEngineerOffers({repo_root:f.root,principal,env:f.env}).offers[0]!;
  expect(offer).toBeDefined();
  return {...f,authority,principal,offer};
}

test('S3 owner rejects an otherwise ready Task outside the current intent before A',async()=>{
  const f=await s3Fixture();let calls=0;
  // A trusted authority fixture supplies another group's collection; no transport can do so.
  const otherGroup={...f.authority,manifest:{...f.authority.manifest,slots:[]}};
  expect(()=>runCampaignAcquisition(f.executeInput,options=>{
    options.before_acquire!(f.offer); calls++; throw Error('off-manifest A must not run');
  },{readAuthority:()=>otherGroup})).toThrow('does not belong to this campaign intent');
  expect(calls).toBe(0);expect(readLease(f.root,f.offer.task_id).record).toBeNull();
},60000);

test('S3 policy context drift is refused before outer budget reservation',async()=>{
  const f=await s3Fixture();let reads=0,budget=0,calls=0;
  const changed: typeof f.authority={...f.authority,policy:{...f.authority.policy,limits:{...f.authority.policy.limits,maximum_parallel_tasks:f.authority.policy.limits.maximum_parallel_tasks===1?2:1}}};
  expect(()=>runCampaignAcquisition(f.executeInput,()=>{calls++;throw Error('A must not run');},{
    readAuthority:()=>++reads===1?f.authority:changed,
    ensureBudget:()=>{budget++;throw Error('must not initialize budget');},
    reserveBudget:()=>{budget++;throw Error('must not reserve');},
  })).toThrow('owner context changed');
  expect([budget,calls]).toEqual([0,0]);expect(readLease(f.root,f.offer.task_id).record).toBeNull();
},60000);

test('S3 owner rechecks manifest after reservation before invoking unchanged A',async()=>{
  const f=await s3Fixture();let changed=false,calls=0;
  expect(()=>runCampaignAcquisition(f.executeInput,options=>{
    changed=true;options.before_acquire!(f.offer);calls++;throw Error('A must not run');
  },{readAuthority:()=>changed?{...f.authority,manifest:{...f.authority.manifest,slots:[]}}:f.authority})).toThrow('owner context changed');
  expect(calls).toBe(0);expect(readLease(f.root,f.offer.task_id).record).toBeNull();
  // Reservation/admission already exists: do not execute a second transaction to guess its outcome.
  expect(()=>runCampaignAcquisition(f.executeInput,()=>{calls++;throw Error('must not retry');})).toThrow('reconciliation');
  expect(calls).toBe(0);
},60000);

test('S3 real canonical manifest drift after claim compensates only its exact own Lease',async()=>{
  const f=await s3Fixture();let claims=0;
  const result=runCampaignAcquisition(f.executeInput,options=>acquireNextScheduledEngineerTask({...options,dependencies:{
    acquire:input=>{
      const acquired=acquireScheduledEngineerTask(input);
      if(!acquired.ok)throw Error('expected real claim');
      claims++;roots.push(acquired.envelope.worktree_path);
      const path=join(f.root,f.authority.publication.manifest_path);
      writeFileSync(path,readFileSync(path,'utf8')+'\n');git(f.root,['add',f.authority.publication.manifest_path]);git(f.root,['commit','-qm','fixture canonical manifest drift']);
      return acquired;
    },
  }}));
  expect(result).toMatchObject({ok:false,error:'claim_actor_receipt_failed'});
  expect(claims).toBe(1);expect(readLease(f.root,f.offer.task_id).record).toBeNull();
  expect(()=>runCampaignAcquisition(f.executeInput)).toThrow('canonical adoption manifest differs');
},60000);

test.each(['rotated','generation','unknown','receipt-mismatch'] as const)('S3 compensation preserves %s Lease evidence after claim',async boundary=>{
  const f=await s3Fixture();let path='',after='',claims=0;
  const result=runCampaignAcquisition(f.executeInput,options=>acquireNextScheduledEngineerTask({...options,dependencies:{
    acquire:input=>{
      const acquired=acquireScheduledEngineerTask(input);
      if(!acquired.ok)throw Error('expected real claim');
      claims++;roots.push(acquired.envelope.worktree_path);
      path=leaseOwnerPath(f.root,acquired.envelope.task_id);
      if(boundary==='receipt-mismatch') {
        after=readFileSync(path,'utf8');
        return {...acquired,receipt:{...acquired.receipt,binding_generation:acquired.receipt.binding_generation+1}};
      }
      withTaskLock(f.root,acquired.envelope.task_id,()=>{
        const owner=readLease(f.root,acquired.envelope.task_id).record!;
        if(boundary==='unknown')writeFileSync(path,'unknown owner bytes');
        else writeLeaseOwnerDurably(f.root,owner.task_id,{...owner,generation:owner.generation+1,
          ...(boundary==='rotated'?{claim_id:'99999999-9999-4999-8999-999999999999'}:{})});
      });
      after=readFileSync(path,'utf8');return acquired;
    },
  }}));
  expect(result).toMatchObject({ok:false,error:'rollback_failed'});
  expect(claims).toBe(1);expect(readFileSync(path,'utf8')).toBe(after);
  expect(readLease(f.root,f.offer.task_id).classification).toBe(boundary==='unknown'?'unknown':'bound');
  // Completed failed compensation is replayed without another A; it cannot clean foreign/unknown evidence.
  let retried=0;
  expect(runCampaignAcquisition(f.executeInput,()=>{retried++;throw Error('must not invoke');})).toEqual(result);
  expect(retried).toBe(0);expect(readFileSync(path,'utf8')).toBe(after);
},60000);


test('S3 context drift after envelope validation is compensated before inner completion',async()=>{
  const f=await s3Fixture();let reads=0,claims=0;
  const changed:typeof f.authority={...f.authority,policy:{...f.authority.policy,limits:{...f.authority.policy.limits,maximum_parallel_tasks:f.authority.policy.limits.maximum_parallel_tasks===1?2:1}}};
  const result=runCampaignAcquisition(f.executeInput,options=>acquireNextScheduledEngineerTask({...options,dependencies:{
    acquire:input=>{const acquired=acquireScheduledEngineerTask(input);if(!acquired.ok)throw Error('expected real claim');claims++;roots.push(acquired.envelope.worktree_path);return acquired;},
  }}),{readAuthority:()=>++reads>=5?changed:f.authority});
  expect(result).toMatchObject({ok:false,error:'claim_actor_receipt_failed'});
  expect(reads).toBe(5);expect(claims).toBe(1);expect(readLease(f.root,f.offer.task_id).record).toBeNull();
},60000);
