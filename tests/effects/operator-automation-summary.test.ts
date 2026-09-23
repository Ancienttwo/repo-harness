import { startOperatorServer } from '../../src/effects/operator/server';
import { describe, expect, test, mock } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as locks from '../../src/effects/locking/exclusive-directory-lock';
import { buildAutomationBudget, sealAutomationMetricSupport, sealProgramAuthorization, type ProgramAuthorizationCampaignV1 } from '../../src/core/automation/budget';
import { buildAutomationControllerRun } from '../../src/core/automation/controller';
import { buildDevelopmentCampaignDefinition } from '../../src/core/automation/development-campaign';
import { buildLeaseLivenessPolicy } from '../../src/core/state/lease-liveness';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';
import { publishAutomationBudget, readAutomationBudgetBoardSlice } from '../../src/effects/automation/budget-store';
import { startAutomationControllerRun } from '../../src/effects/automation/controller-store';
import { createDevelopmentCampaign } from '../../src/effects/automation/development-campaign-store';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { automationSummaryReaders, readOperatorAutomationSummary } from '../../src/effects/operator/automation-summary';
import { decodeOperatorAutomationSummary } from '../../src/core/operator/automation-summary';

const originalLock = locks.withExclusiveDirectoryLock;
let denyLocks = false;
mock.module('../../src/effects/locking/exclusive-directory-lock', () => ({
  ...locks, withExclusiveDirectoryLock: (...args: Parameters<typeof locks.withExclusiveDirectoryLock>) => {
    if (denyLocks) throw new Error('read attempted lock mutation');
    return originalLock(...args);
  },
}));
const hex = (value: string) => createHash('sha256').update(value).digest('hex');
const limits = { max_agent_turns: 10, max_successful_acquisitions: 3, max_runner_invocations: 10, max_provider_failures: 3,
  max_consecutive_no_progress_steps: 3, max_repair_cycles: 2, max_wall_clock_seconds: 3600, max_input_tokens: null, max_output_tokens: null, max_cost_micros: null };
function files(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name); result[path] = entry.isDirectory() ? 'directory' : hex(readFileSync(path, 'utf8'));
    if (entry.isDirectory()) walk(path);
  } }; walk(root); return result;
}
function fixture(populated = true) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'operator-automation-'))), root = join(base, 'repo'), home = join(base, 'home');
  mkdirSync(root); mkdirSync(home);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
  git('init','-q','-b','main');git('config','user.email','fixture@example.com');git('config','user.name','Fixture');
  mkdirSync(join(root,'.ai/harness'),{recursive:true});
  writeFileSync(join(root,'.ai/harness/policy.json'),JSON.stringify({
    development_campaign: { version:1,mode:'shadow',limits:{maximum_group_count:1,maximum_issues_per_group:2,maximum_parallel_tasks:2} },
    external_sources: { version:1,mode:'manual',github:{enabled:true,repository:'acme/widgets',selection:{kind:'labels',labels_all:['campaign'],assignees_any:[]},limits:{max_pages:1,max_issues:2,max_body_bytes:1024,max_total_bytes:4096,deadline_ms:1000}} },
  }));
  git('add','.');git('commit','-qm','fixture');
  const id = repoHarnessRepoIdFor(root), env = { ...process.env, REPO_HARNESS_HOME:home }, at = new Date().toISOString();
  writeFileSync(join(home,'registered-repos.json'),JSON.stringify({version:1,authorizationRevision:1,repos:[{id,path:root,accessMode:'read_only',source:'manual',registeredAt:at,lastSeenAt:at}]}));
  const campaign: ProgramAuthorizationCampaignV1 = { campaign_id:'campaign-1',group_count:1,issues_per_group:2,allowed_issue_kinds:['bugfix','test_gap'],max_parallel_tasks:2,
    transient_retry:{max_consecutive_failures:3,initial_backoff_ms:1,maximum_backoff_ms:4},issue_author:'gpt_pro',local_parent_host:'codex',chrome_profile_directory:'PRIVATE_PROFILE',max_authoring_rounds_per_group:5,max_controller_steps:100,max_provider_calls:100,require_fresh_main_audit:true };
  const grant = sealProgramAuthorization({authorization_id:'authorization-1',repository_id:id,target_ref:'refs/heads/main',target_revision:git('rev-parse','HEAD'),work_graph_revision:hex('graph'),
    allowed_work_package_ids:['campaign-1'],allowed_risk_tiers:['low'],merge_mode:'manual',allowed_merge_method:'squash',max_repair_cycles:2,budget:limits,contract_scope:'contract_less',contract_path:null,
    campaign,issued_by:'owner',issued_at:at,expires_at:new Date(Date.now()+3600000).toISOString()});
  const budget = buildAutomationBudget({automation_run_id:hex('run'),goal_id:hex('goal'),goal_revision:hex('goal-revision'),repository_id:id,engineer_id:null,claim_id:null,
    authorization:grant,contract_sha256:null,contract_limits:null,metric_support:sealAutomationMetricSupport({provider:'codex',capability_sha256:hex('capability'),verified_metrics:[],observed_at:at}),
    unattended:true,created_by:'owner',created_at:at,supersedes_sha256:null,revision:1});
  const run = buildAutomationControllerRun({run_id:`sha256:${hex('controller')}`,repository_id:id,budget_sha256:`sha256:${budget.budget_sha256}`,
    principal:{authorization_id:'authorization-1',engineer_id:'engineer:capability.runtime-harness.automation',binding_id:'11111111-1111-4111-8111-111111111111',binding_generation:1,engineer_contract_revision:`sha256:${hex('contract')}`,authorization_revision:1},
    policy:{maximum_steps_per_invocation:4,maximum_duration_ms:10000,maximum_transient_retries:2,initial_backoff_ms:100,maximum_backoff_ms:1000,
      lease_liveness:buildLeaseLivenessPolicy({renewal_interval_ms:1000,maximum_ttl_ms:10000,renewal_actor_kind:'controller',required_evidence_sources:['controller'],unproven_behavior:'require_attention'})},
    protected_paths:['PRIVATE_PATH'],created_at:at});
  if (populated) {
    mintProgramAuthorization({repo_root:root,authorization:grant,env});
    publishAutomationBudget({repo_root:root,budget,env});
    startAutomationControllerRun({repo_root:root,run,idempotency_key:'start',observed_at:at});
    createDevelopmentCampaign({repo_root:root,campaign:buildDevelopmentCampaignDefinition({campaign_id:campaign.campaign_id,authorization_id:grant.authorization_id,
      authorization_sha256:grant.authorization_sha256,repository_id:id,target_ref:grant.target_ref,target_revision:grant.target_revision,created_at:at}),idempotency_key:'create',env});
  }
  return {base,root,home,id,env,grant,budget,run,input:{repository_id:id,env}};
}

describe('original automation observation', () => {
  test('real collector process carries original automation through the scoped HTTP envelope', async () => {
    const f = fixture();
    const before = files(f.base);
    const server = await startOperatorServer({ port: 0, static_root: f.root, env: f.env });
    try {
      const response = await fetch(`${server.url}/api/v1/fleet/repositories/${f.id}/snapshot`);
      expect(response.status).toBe(200);
      const result = await response.json() as {protocol:number;automation:unknown};
      expect(result.protocol).toBe(3);
      const summary = decodeOperatorAutomationSummary(result.automation, f.id);
      expect(summary.grants.records[0]?.authorization_sha256).toBe(f.grant.authorization_sha256);
      expect(summary.controllers.records[0]?.run_sha256).toBe(f.run.run_sha256);
      expect(summary.budgets.status).toBe('known');
      expect(summary.native_execution.status).toBe('unavailable');
      expect(files(f.base)).toEqual(before);
    } finally { await server.close(); rmSync(f.base,{recursive:true,force:true}); }
  });

  test('reads real grant/budget/controller/Campaign records without locks or changed bytes', () => {
    const f = fixture();
    try {
      const before = files(f.base); denyLocks = true;
      const value = readOperatorAutomationSummary(f.input);
      expect([value.policy.status,value.grants.status,value.budgets.status,value.controllers.status,value.campaigns.status]).toEqual(['known','known','known','known','known']);
      expect(value.grants.records[0]).toMatchObject({authorization_sha256:f.grant.authorization_sha256,expires_at:f.grant.expires_at,contract_scope:'contract_less'});
      expect(value.budgets.records[0]?.metrics).toEqual(readAutomationBudgetBoardSlice(f.root,f.budget.automation_run_id,f.env).metrics);
      expect(value.controllers.records[0]).toMatchObject({run_sha256:f.run.run_sha256,operation:'start',state:'created'});
      expect(value.campaigns.records[0]).toMatchObject({authorization_sha256:f.grant.authorization_sha256,operation:'authorize',typed_reason_status:'unavailable'});
      expect(value.native_execution).toEqual({status:'unavailable',reason:'native_admission_authority_unavailable',turn_ref:null});
      expect(JSON.stringify(value)).not.toContain('PRIVATE_');expect(JSON.stringify(value)).not.toContain(f.root);
      expect(files(f.base)).toEqual(before);
    } finally { denyLocks=false;rmSync(f.base,{recursive:true,force:true}); }
  });

  test('missing records and unavailable policy stay distinct, with no fabricated default mode', () => {
    const f = fixture(false);
    try {
      const value=readOperatorAutomationSummary(f.input);expect(value.grants.status).toBe('missing');expect(value.controllers.status).toBe('missing');
      mintProgramAuthorization({repo_root:f.root,authorization:f.grant,env:f.env});
      expect(readOperatorAutomationSummary(f.input).campaigns.status).toBe('missing');
      writeFileSync(join(f.root,'.ai/harness/policy.json'),'broken');
      const failed=readOperatorAutomationSummary(f.input);expect(failed.policy).toMatchObject({status:'unavailable',records:[]});expect(failed.budgets.status).toBe('missing');
    } finally {rmSync(f.base,{recursive:true,force:true});}
  });

  test('isolates source errors, size limits and mixed controller generations', () => {
    const f=fixture();
    try {
      const wrong=readOperatorAutomationSummary(f.input,{...automationSummaryReaders,grant:(...args)=>({...automationSummaryReaders.grant(...args),repository_id:'another-repo'})});
      expect(wrong.grants.status).toBe('unavailable');expect(wrong.controllers.status).toBe('known');expect(wrong.campaigns.status).toBe('unavailable');
      const changed=readOperatorAutomationSummary(f.input,{...automationSummaryReaders,head:(...args)=>({...automationSummaryReaders.head(...args),event_sha256:`sha256:${hex('wrong')}`})});
      expect(changed.controllers.status).toBe('unavailable');expect(changed.grants.status).toBe('known');
      const limit=readOperatorAutomationSummary(f.input,{...automationSummaryReaders,grant_ids:()=>Array(65).fill(hex('grant'))});
      expect(limit.grants).toMatchObject({status:'unavailable',reason:'limit_exceeded',records:[]});
      const value=readOperatorAutomationSummary(f.input);
      expect(()=>decodeOperatorAutomationSummary({...value,native_execution:{status:'running',turn_ref:'guessed'}},f.id)).toThrow();
      expect(()=>decodeOperatorAutomationSummary(value,'another-repo')).toThrow();
      expect(()=>decodeOperatorAutomationSummary({...value,private_path:'/private'},f.id)).toThrow();
    } finally {rmSync(f.base,{recursive:true,force:true});}
  });

  test('rejects final registry mutation and preserves exact caller environment for budget reads', () => {
    const f=fixture();let reads=0;let seen=false;
    try {
      const good=readOperatorAutomationSummary(f.input,{...automationSummaryReaders,budget:(root,run,env)=>{seen=env===f.env;return automationSummaryReaders.budget(root,run,env);}});
      expect(seen).toBe(true);expect(good.budgets.status).toBe('known');
      expect(()=>readOperatorAutomationSummary(f.input,{...automationSummaryReaders,registry:(...args)=>{
        const r=automationSummaryReaders.registry(...args);return ++reads===1?r:{...r,registryRevision:`sha256:${hex('changed')}`};
      }})).toThrow('source_changed');
    } finally {rmSync(f.base,{recursive:true,force:true});}
  });
});
