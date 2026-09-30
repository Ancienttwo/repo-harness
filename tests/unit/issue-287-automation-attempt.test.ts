import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'fs'; import { tmpdir } from 'os'; import { join, resolve } from 'path'; import { execFileSync } from 'child_process';
import { attemptIdentity, observeRetryEligibility, buildTaskAutomationAttempt, completeTaskAutomationAttempt, validateTaskAutomationAttempt, validateTaskAutomationAttemptCurrent, type TaskAutomationAttemptOutcome } from '../../src/core/engineers/automation-attempt';
import { buildEngineerOfferCandidate, buildEngineerOffersDocument, validateEngineerOffersDocument, projectWorkGraph, validateWorkGraph, type WorkPackageRetryPolicyV1 } from '../../src/core/engineers/scheduling';
import { canonicalEngineerJson, engineerSha256 } from '../../src/core/engineers/profile-binding';
import { readTaskAutomationAttemptCurrent, recordTaskAutomationAttemptOutcome, recordTaskAutomationAttemptStart } from '../../src/effects/engineers/automation-attempt-store';
const D=(c:string)=>`sha256:${c.repeat(64)}`; const TASK='a'.repeat(64); const REV='b'.repeat(64);
const policy:WorkPackageRetryPolicyV1={max_automated_attempts:2,retryable_failure_classes:['transient_failure'],backoff:{kind:'exponential',initial_seconds:10,maximum_seconds:60},attention_after_seconds:30,revision_reset:'reset_on_work_package_revision'};
const identity={repository_id:'repo_0123456789abcdef',sprint_path:'plans/sprints/a.sprint.md',task_id:TASK,task_revision:REV,work_package_id:'work',work_package_revision:D('c'),engineer_id:'engineer:capability.runtime.test',binding_generation:1,claim_id:'11111111-1111-4111-8111-111111111111',lease_generation:1,controller_run_id:D('d'),budget_revision:D('e'),dispatch_id:D('f')} as const;
function root(){const value=mkdtempSync(join(tmpdir(),'attempt-'));execFileSync('git',['init','-q'],{cwd:value});return value;}
describe('issue #287 automation attempt authority',()=>{
 test('persists one idempotent attempt and enforces backoff and exhaustion',()=>{const repo=root();try{
  const first=recordTaskAutomationAttemptStart({repo_root:repo,policy,started_at:'2026-09-04T00:00:00.000Z',first_eligible_at:'2026-09-03T23:59:00.000Z',...identity});
  expect(recordTaskAutomationAttemptStart({repo_root:repo,policy,started_at:'2026-09-04T00:00:00.000Z',first_eligible_at:'2026-09-03T23:59:00.000Z',...identity}).attempt.attempt_sha256).toBe(first.attempt.attempt_sha256);
  const done=recordTaskAutomationAttemptOutcome({repo_root:repo,work_package_id:'work',work_package_revision:D('c'),policy,identity_sha256:attemptIdentity(identity),outcome:'transient_failure',ended_at:'2026-09-04T00:00:01.000Z',runtime_effect_id:D('1'),evidence_refs:['provider:evidence']});
  expect(recordTaskAutomationAttemptOutcome({repo_root:repo,work_package_id:'work',work_package_revision:D('c'),policy,identity_sha256:attemptIdentity(identity),outcome:'transient_failure',ended_at:'2026-09-04T00:00:01.000Z',runtime_effect_id:D('1'),evidence_refs:['provider:evidence']}).attempt.attempt_sha256).toBe(done.attempt.attempt_sha256);
  expect(observeRetryEligibility({policy,current:done.current,work_package_revision:D('c'),observed_at:'2026-09-04T00:00:05.000Z'}).state).toBe('retry_backoff');
  expect(observeRetryEligibility({policy,current:done.current,work_package_revision:D('c'),observed_at:'2026-09-04T00:00:11.000Z'}).state).toBe('eligible');
  const secondIdentity={...identity,claim_id:'22222222-2222-4222-8222-222222222222',lease_generation:2,dispatch_id:D('2')};
  recordTaskAutomationAttemptStart({repo_root:repo,policy,started_at:'2026-09-04T00:00:11.000Z',first_eligible_at:'2026-09-03T23:59:00.000Z',...secondIdentity});
  const exhausted=recordTaskAutomationAttemptOutcome({repo_root:repo,work_package_id:'work',work_package_revision:D('c'),policy,identity_sha256:attemptIdentity(secondIdentity),outcome:'transient_failure',ended_at:'2026-09-04T00:00:12.000Z',runtime_effect_id:D('3'),evidence_refs:['provider:evidence-2']});
  expect(observeRetryEligibility({policy,current:exhausted.current,work_package_revision:D('c'),observed_at:'2026-09-04T00:01:00.000Z'})).toMatchObject({state:'retry_exhausted',attention_owner:'user'});
 }finally{rmSync(repo,{recursive:true,force:true});}});
 test('cross-process starts linearize to one attempt',async()=>{const repo=root();try{const script=join(repo,'attempt-worker.ts');writeFileSync(script,`import { recordTaskAutomationAttemptStart } from ${JSON.stringify(resolve('src/effects/engineers/automation-attempt-store.ts'))};\nrecordTaskAutomationAttemptStart(JSON.parse(process.env.ATTEMPT_INPUT!));\n`);const value={repo_root:repo,policy,started_at:'2026-09-04T00:00:00.000Z',first_eligible_at:'2026-09-04T00:00:00.000Z',...identity};const env={...process.env,ATTEMPT_INPUT:JSON.stringify(value)};const children=[Bun.spawn(['bun',script],{env,stdout:'pipe',stderr:'pipe'}),Bun.spawn(['bun',script],{env,stdout:'pipe',stderr:'pipe'})];expect(await Promise.all(children.map(child=>child.exited))).toEqual([0,0]);expect(readTaskAutomationAttemptCurrent(repo,'work',D('c'))?.attempt_count).toBe(1);}finally{rmSync(repo,{recursive:true,force:true});}});
 test('started, permanent and stale revision evidence fail closed',()=>{const repo=root();try{const started=recordTaskAutomationAttemptStart({repo_root:repo,policy,started_at:'2026-09-04T00:00:00.000Z',first_eligible_at:'2026-09-04T00:00:00.000Z',...identity});
  expect(observeRetryEligibility({policy,current:started.current,work_package_revision:D('c'),observed_at:'2026-09-04T00:00:01.000Z'}).state).toBe('reconciliation_required');
  expect(observeRetryEligibility({policy,current:started.current,work_package_revision:D('9'),observed_at:'2026-09-04T00:00:01.000Z'}).state).toBe('authority_unavailable');
  const permanent=recordTaskAutomationAttemptOutcome({repo_root:repo,work_package_id:'work',work_package_revision:D('c'),policy,identity_sha256:attemptIdentity(identity),outcome:'permanent_failure',ended_at:'2026-09-04T00:00:02.000Z',runtime_effect_id:null,evidence_refs:['verification:failed']});
  expect(observeRetryEligibility({policy,current:permanent.current,work_package_revision:D('c'),observed_at:'2026-09-04T00:00:03.000Z'})).toMatchObject({state:'retry_forbidden',attention_owner:'user'});
 }finally{rmSync(repo,{recursive:true,force:true});}});
 test('offer revision binds retry evidence and equal priority orders oldest eligible first',()=>{const definition={work_package_id:'work',task_id:TASK,primary_capability:'capability.runtime.test',depends_on:[],priority:50,concurrency:{scope:'repo',key:'work'},execution_surface:'contract',integration_group:null,required_acceptance:[{gate:'module',policy_id:'p',policy_ref:'plans/p.json',policy_revision:D('7')}],rollback_boundary:{kind:'work_package',boundary_id:'r',boundary_ref:'plans/r.json',boundary_revision:D('8')},retry_policy:policy} as const;
  const graph=projectWorkGraph(validateWorkGraph({protocol:1,kind:'repo-harness-work-graph',repository_id:identity.repository_id,sprint_path:identity.sprint_path,lane:'engineering-v2',work_packages:[definition]}),[{task_id:TASK,task_revision:REV,task_ref:'Task',status:'Pending',row_order:1}]);
  const make=(eligible:string,revision:string)=>buildEngineerOfferCandidate({graph,work_package:graph.work_packages[0]!,engineer:{engineer_id:identity.engineer_id,capability_id:'capability.runtime.test',engineer_contract_revision:D('4'),max_active_claims:1},binding:{state:'active',binding_id:'33333333-3333-4333-8333-333333333333',binding_generation:1},fleet_offer:{execution_readiness:'execution_ready',snapshot_consistency:'stable',task_id:TASK,task_revision:REV,offer_revision:D('5'),authorization_revision:1},dependencies:[],concurrency_available:true,concurrency_revision:D('6'),active_claims:0,retry:{state:'eligible',attempt_count:1,last_outcome:'transient_failure',next_eligible_at:eligible,eligible_since:eligible,attention_owner:'none',starvation_attention:false,authority_revision:revision}});
  const newer=make('2026-09-04T00:01:00.000Z',D('a'));const older=make('2026-09-04T00:00:00.000Z',D('b'));if(!newer.eligible||!older.eligible)throw new Error('fixture');
  expect(newer.offer.offer_revision).not.toBe(older.offer.offer_revision);expect(buildEngineerOffersDocument({repository_id:identity.repository_id,engineer_id:identity.engineer_id,lane:'engineering-v2',work_graph_revision:graph.work_graph_revision,candidates:[newer,older]}).offers[0]!.eligible_since).toBe('2026-09-04T00:00:00.000Z');
 });
});

const startedAt = '2026-09-04T00:00:00.000Z';
const endedAt = '2026-09-04T00:00:01.000Z';
const nextIdentity = { ...identity, claim_id: '22222222-2222-4222-8222-222222222222', lease_generation: 2, dispatch_id: D('2') };
function startInput(repo: string) {
  return { repo_root: repo, policy, ...identity, started_at: startedAt, first_eligible_at: startedAt };
}
function outcomeInput(repo: string, outcome: Exclude<TaskAutomationAttemptOutcome, 'started'>) {
  return { repo_root: repo, work_package_id: identity.work_package_id, work_package_revision: identity.work_package_revision, policy, identity_sha256: attemptIdentity(identity), outcome, ended_at: endedAt, runtime_effect_id: null, evidence_refs: ['verification:attempt-result'] };
}
function durableBytes(repo: string) {
  const directory = join(repo, '.git/repo-harness/engineer-attempts/v1');
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => { const path = join(entry.parentPath, entry.name); return [path, readFileSync(path, 'utf8')]; })
    .sort((a, b) => a[0]!.localeCompare(b[0]!));
}

describe('Task attempt mutation boundary', () => {
  test.each(['completed', 'not_reproducible', 'user_blocked', 'permanent_failure', 'cancelled'] as const)('refuses a new identity after %s without changing evidence', outcome => {
    const repo = root();
    try {
      const input = startInput(repo);
      recordTaskAutomationAttemptStart(input);
      const completed = recordTaskAutomationAttemptOutcome(outcomeInput(repo, outcome));
      const before = durableBytes(repo);
      expect(() => recordTaskAutomationAttemptStart({ ...input, ...nextIdentity, started_at: '2026-09-04T00:01:00.000Z' })).toThrow('retry_forbidden');
      expect(durableBytes(repo)).toEqual(before);
      expect(recordTaskAutomationAttemptStart(input).attempt).toEqual(completed.attempt);
      expect(recordTaskAutomationAttemptOutcome(outcomeInput(repo, outcome))).toEqual(completed);
      expect(durableBytes(repo)).toEqual(before);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  test('enforces backoff before the exact eligible instant, then exhaustion', () => {
    const repo = root();
    try {
      const input = startInput(repo);
      recordTaskAutomationAttemptStart(input);
      recordTaskAutomationAttemptOutcome(outcomeInput(repo, 'transient_failure'));
      const before = durableBytes(repo);
      expect(() => recordTaskAutomationAttemptStart({ ...input, ...nextIdentity, started_at: '2026-09-04T00:00:10.999Z' })).toThrow('retry_backoff');
      expect(durableBytes(repo)).toEqual(before);
      expect(recordTaskAutomationAttemptStart({ ...input, ...nextIdentity, started_at: '2026-09-04T00:00:11.000Z' }).current.attempt_count).toBe(2);
      recordTaskAutomationAttemptOutcome({ ...outcomeInput(repo, 'transient_failure'), identity_sha256: attemptIdentity(nextIdentity), ended_at: '2026-09-04T00:00:12.000Z' });
      const exhausted = durableBytes(repo);
      expect(() => recordTaskAutomationAttemptStart({ ...input, claim_id: '33333333-3333-4333-8333-333333333333', dispatch_id: D('3'), started_at: '2026-09-04T00:02:00.000Z' })).toThrow('retry_exhausted');
      expect(durableBytes(repo)).toEqual(exhausted);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  test.each(['started', 'reconciliation_required'] as const)('does not start across unresolved %s evidence', outcome => {
    const repo = root();
    try {
      const input = startInput(repo);
      recordTaskAutomationAttemptStart(input);
      if (outcome !== 'started') recordTaskAutomationAttemptOutcome(outcomeInput(repo, outcome));
      const before = durableBytes(repo);
      expect(() => recordTaskAutomationAttemptStart({ ...input, ...nextIdentity, started_at: '2026-09-04T00:01:00.000Z' })).toThrow('reconciliation_required');
      expect(durableBytes(repo)).toEqual(before);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  test('rejects an invalid retry policy before creating durable attempt data', () => {
    const repo = root();
    try {
      const invalidPolicy = { ...policy, retryable_failure_classes: ['permanent_failure'] } as unknown as WorkPackageRetryPolicyV1;
      expect(() => recordTaskAutomationAttemptStart({ ...startInput(repo), policy: invalidPolicy })).toThrow('retryable_failure_classes');
      expect(readTaskAutomationAttemptCurrent(repo, identity.work_package_id, identity.work_package_revision)).toBeNull();
      expect(durableBytes(repo)).toEqual([]);
      recordTaskAutomationAttemptStart(startInput(repo));
      const before = durableBytes(repo);
      expect(() => recordTaskAutomationAttemptOutcome({ ...outcomeInput(repo, 'transient_failure'), policy: { ...policy, backoff: { ...policy.backoff, initial_seconds: 0 } } })).toThrow('initial_seconds');
      expect(durableBytes(repo)).toEqual(before);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  test('rejects unknown outcomes at write and read boundaries even with a correct digest', () => {
    const repo = root();
    try {
      const started = recordTaskAutomationAttemptStart(startInput(repo));
      const before = durableBytes(repo);
      expect(() => recordTaskAutomationAttemptOutcome(outcomeInput(repo, 'unexpected_outcome' as TaskAutomationAttemptOutcome as Exclude<TaskAutomationAttemptOutcome, 'started'>))).toThrow('outcome');
      expect(durableBytes(repo)).toEqual(before);
      const { attempt_sha256: _attemptDigest, ...attemptBasis } = started.attempt;
      const unknown = { ...attemptBasis, outcome: 'unexpected_outcome', ended_at: endedAt, evidence_refs: ['verification:unknown'] };
      expect(() => validateTaskAutomationAttempt({ ...unknown, attempt_sha256: engineerSha256(canonicalEngineerJson(unknown)) })).toThrow('outcome');
      const { current_sha256: _currentDigest, ...currentBasis } = started.current;
      const unknownCurrent = { ...currentBasis, last_outcome: 'unexpected_outcome' };
      expect(() => validateTaskAutomationAttemptCurrent({ ...unknownCurrent, current_sha256: engineerSha256(canonicalEngineerJson(unknownCurrent)) })).toThrow('outcome');
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  test('round-trips every supported outcome and refuses started as a completion', () => {
    const start = buildTaskAutomationAttempt({ ...identity, sequence: 1, started_at: startedAt, ended_at: null, outcome: 'started', evidence_refs: [], runtime_effect_id: null, previous_attempt_sha256: null });
    expect(validateTaskAutomationAttempt(start)).toEqual(start);
    for (const outcome of ['completed', 'not_reproducible', 'user_blocked', 'external_blocked', 'transient_failure', 'permanent_failure', 'lease_lost', 'cancelled', 'reconciliation_required'] as const) {
      const completed = completeTaskAutomationAttempt(start, { outcome, ended_at: endedAt, runtime_effect_id: null, evidence_refs: ['verification:result'] });
      expect(validateTaskAutomationAttempt(completed)).toEqual(completed);
    }
    expect(() => completeTaskAutomationAttempt(start, { outcome: 'started', ended_at: null, runtime_effect_id: null, evidence_refs: [] } as unknown as Parameters<typeof completeTaskAutomationAttempt>[1])).toThrow('outcome');
  });
});


test('Engineer exclusions preserve the closed terminal outcome vocabulary', () => {
  const document = buildEngineerOffersDocument({
    repository_id: identity.repository_id, engineer_id: identity.engineer_id,
    lane: 'engineering-v2', work_graph_revision: D('1'),
    candidates: [{ eligible: false, exclusion: {
      repository_id: identity.repository_id, work_package_id: identity.work_package_id,
      engineer_id: identity.engineer_id, blockers: ['retry_forbidden'],
      attempt_count: 1, last_outcome: 'not_reproducible', next_eligible_at: null, blocker_owner: 'operator',
    } }],
  });
  expect(validateEngineerOffersDocument(document)).toEqual(document);
  const { snapshot_revision: _revision, ...basis } = document;
  const unknown = { ...basis, exclusions: [{ ...document.exclusions[0], last_outcome: 'unexpected_outcome' }] };
  expect(() => validateEngineerOffersDocument({ ...unknown, snapshot_revision: engineerSha256(canonicalEngineerJson(unknown)) })).toThrow('last_outcome');
});


test('frozen observation keeps backoff/attention time-indexed but never hides new attempt authority', () => {
 const repo=root();try {
  const input=startInput(repo);
  const first=recordTaskAutomationAttemptStart(input);
  const completed=recordTaskAutomationAttemptOutcome(outcomeInput(repo,'transient_failure'));
  const observe=(at:string,current=completed.current)=>observeRetryEligibility({policy,current,work_package_revision:D('c'),observed_at:at});
  expect(observe('2026-09-04T00:00:10.999Z').state).toBe('retry_backoff');
  expect(observe('2026-09-04T00:00:11.000Z').state).toBe('eligible');
  expect(observe('2026-09-04T00:00:40.999Z').starvation_attention).toBeFalse();
  expect(observe('2026-09-04T00:00:41.000Z').starvation_attention).toBeTrue();
  expect(observe('2026-09-04T00:00:11.000Z',first.current)).toMatchObject({state:'reconciliation_required'});
  expect(observe('2026-09-04T00:00:11.000Z',first.current).authority_revision).not.toBe(observe('2026-09-04T00:00:11.000Z').authority_revision);
 }finally {rmSync(repo,{recursive:true,force:true});}
});
