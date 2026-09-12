import * as issueStore from '../../src/effects/automation/issue-batch-store';
import { buildProviderIssueObservation, buildExternalSourceRefreshReceipt } from '../../src/core/external-sources/issue-observation';
import { afterAll, afterEach, expect, test, spyOn } from 'bun:test';
import { execFileSync } from 'child_process';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { createAdoptionRepository, observeVerifiedFixtureRevision } from '../helpers/campaign-adoption-repository';
import { fixtureTemplate } from '../helpers/repo-fixture';
import { campaignBrowserMetadata } from '../helpers/campaign-browser-session';
import { makeSnapshot } from '../helpers/issue-batch-adoption-fixture';
import { sealProgramAuthorization } from '../../src/core/automation/budget';
import { buildDevelopmentCampaignDefinition } from '../../src/core/automation/development-campaign';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';
import { createDevelopmentCampaign, appendDevelopmentCampaignEvent, readDevelopmentCampaignStatus, readExactAuthorityBinding } from '../../src/effects/automation/development-campaign-store';
import { continueIssueBatchAuthoring, startIssueBatchAuthoring } from '../../src/effects/automation/gpt-pro-issue-authoring';
import { adoptIssueBatch } from '../../src/effects/automation/issue-batch-adoption';
import { readIssueBatchAdoptionArtifact, issueBatchGroupStoreRoot } from '../../src/effects/automation/issue-batch-store';
import { reserveCampaignAuthoringBudget, repairAutomationReconciliation, ensureCampaignAuthoringBudget, reserveAutomationBudget, appendAutomationUsage, beginCampaignBudgetStep, readAutomationBudgetStatus, readCampaignBudgetLedger, repairAutomationBudgetDrift } from '../../src/effects/automation/budget-store';
import { AUTOMATION_TEST_CLOCK_SEAM_ENV, __resetAutomationClockForTests, __setAutomationClockForTests } from '../../src/effects/automation/budget-store.internal';
import { assertResumedAdoption, assertReplaceableStoppedSuccessor } from '../../src/effects/automation/campaign-authoring-resume';
import { buildIssueAuthoringSession, renderIssueBatchMarker } from '../../src/core/automation/issue-batch';
import { campaignAutomationRunId } from '../../src/core/automation/campaign-authoring-budget';
import { canonicalMessageBytes, canonicalMessageDigest } from '../../src/core/messages/mechanics';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const git = (root: string, args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
async function buildFixture(stop: boolean, usage: 'none' | 'open' | 'acquired') {
  const f = await createAdoptionRepository('active', 1, undefined, {}, {}, { verified_revision: true, max_agent_turns: 30, max_runner_invocations: 30 });
  const adopted = await adoptIssueBatch(f.input, f.deps);
  git(f.root, ['merge', '--ff-only', adopted.publication!.materialized_commit]);
  if (usage !== 'none') {
    const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env }).budget;
    const reservation = reserveAutomationBudget({ repo_root: f.root, automation_run_id: budget.automation_run_id,
      expected_budget_sha256: budget.budget_sha256, idempotency_key: 'acquisition', operation: 'acquisition', unit_kind: 'execute', unit_id: 'test', attempt: 1, provider: null, env: f.env });
    if (usage === 'acquired') appendAutomationUsage({ repo_root: f.root, reservation, outcome: 'progress', evidence_refs: [], env: f.env });
  }
  if (stop) {
    const status = readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env);
    appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: f.intent.campaign_id, expected_current_sha256: status.current.current_sha256,
      idempotency_key: 'stop', operation: 'stop', observed_at: new Date().toISOString(), env: f.env });
  }
  const resume = { campaign_id: f.intent.campaign_id, group_number: 1, intent_sha256: f.intent.intent_sha256,
    source_session_ref: adopted.receipt.authoring_session_ref, issues: adopted.receipt.issues.map(i => ({ slot: i.slot, provider_issue_id: i.provider_issue_id,
      provider_issue_url: `https://github.com/${f.intent.provider_repository}/issues/${i.issue_number}` })) };
  const readBinding = () => ({ path: 'binding', binding: { profileDir: f.home, profileDirectory: 'Profile 1' } });
  const successor = async (id: string, rounds?: number) => {
    const authorization = sealProgramAuthorization({ ...f.authorization, authorization_id: id, target_revision: git(f.root, ['rev-parse','HEAD']),
      allowed_work_package_ids: [id], campaign: { ...f.authorization.campaign!, campaign_id: id,
        ...(rounds === undefined ? {} : { max_authoring_rounds_per_group: rounds }) } });
    mintProgramAuthorization({ repo_root: f.root, authorization, env: f.env });
    const campaign = buildDevelopmentCampaignDefinition({ campaign_id: id, authorization_id: id, authorization_sha256: authorization.authorization_sha256,
      repository_id: authorization.repository_id, target_ref: authorization.target_ref, target_revision: authorization.target_revision, created_at: new Date().toISOString() });
    const created = createDevelopmentCampaign({ repo_root: f.root, campaign, idempotency_key: 'start', env: f.env });
    appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: id, expected_current_sha256: created.current.current_sha256,
      idempotency_key: 'prepare', operation: 'prepare_group', observed_at: new Date().toISOString(), env: f.env });
    await observeVerifiedFixtureRevision({ root: f.root, authorization, env: f.env, readBinding });
    return { repo_root: f.root, campaign_id: id, group_number: 1, env: f.env, resume_from: resume };
  };
  /**
   * The real field shape: a successor that authored and edited the existing Issues, updating
   * their remote markers, and then stopped before any adoption. It stops from group_preparing
   * because start_group now requires the group adoption and publication, so the group_running
   * variant is unreachable; the stopped-and-never-adopted predicate is identical either way.
   */
  const failedSuccessor = async (id: string, stopped = true) => {
    const { resume_from, ...base } = await successor(id, 2);
    const started = await startIssueBatchAuthoring({ ...base, resume_from }, { readBinding, consult: async () => ({ sessionId: `${id}-author`, status: 'completed' as const,
      meta: campaignBrowserMetadata({ sessionId: `${id}-author`, repoRoot: f.root, profileDir: f.home, profileDirectory: 'Profile 1' }) }) });
    await continueIssueBatchAuthoring({ ...base, intent_sha256: started.intent.intent_sha256, source_session_ref: started.session.session_ref,
      operation: 'edit_issue', requested_slots: ['01'], provider_issue_id: resume.issues[0]!.provider_issue_id, provider_issue_url: resume.issues[0]!.provider_issue_url },
      { readBinding, followup: async () => ({ sessionId: `${id}-followup`, status: 'completed' as const,
        meta: campaignBrowserMetadata({ sessionId: `${id}-followup`, sourceSessionId: `${id}-author`, repoRoot: f.root, profileDir: f.home, profileDirectory: 'Profile 1' }) }) });
    if (stopped) {
      const status = readDevelopmentCampaignStatus(f.root, id, f.env);
      appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: id, expected_current_sha256: status.current.current_sha256,
        idempotency_key: 'stop', operation: 'stop', observed_at: new Date().toISOString(), env: f.env });
    }
    const campaign = readDevelopmentCampaignStatus(f.root, id, f.env).campaign;
    return { ...started, authorization: readExactAuthorityBinding(f.root, campaign, f.env),
      run: campaignAutomationRunId({ repository_id: started.intent.repository_id, campaign_id: id }) };
  };
  const adoptionPath = (campaignId: string, name: string) => join(issueBatchGroupStoreRoot(f.root, campaignId, 1), 'adoption', `${name}.json`);
  const adoptSuccessor = (intent: typeof f.intent) => adoptIssueBatch({ ...f.input, campaign_id: intent.campaign_id, intent_sha256: intent.intent_sha256 }, {
    ...f.deps, observe: () => makeSnapshot(intent, intent.slots), followup: async request => {
      const data = JSON.parse(request.prompt.split('\n\n')[2]!);
      const answers = data.targets.map((t: {kind:string;path:string;line:number}) => t.kind === 'directory_entries'
        ? git(f.root, ['ls-tree','--name-only',`${intent.base_main_sha}:${t.path}`]).split('\n').sort().join('\n')
        : t.kind === 'text_line' ? git(f.root, ['show',`${intent.base_main_sha}:${t.path}`]).split('\n')[t.line-1]
        : createHash('sha256').update(execFileSync('git',['show',`${intent.base_main_sha}:${t.path}`],{cwd:f.root})).digest('hex'));
      return { sessionId: `${intent.campaign_id}-challenge`, status: 'completed' as const, output: JSON.stringify({ base_main_sha: intent.base_main_sha, answers }),
        meta: campaignBrowserMetadata({ sessionId: `${intent.campaign_id}-challenge`, sourceSessionId: `${intent.campaign_id}-author`, repoRoot: f.root, profileDir: f.home, profileDirectory: 'Profile 1' }) };
    },
  });
  const adoptionArtifacts = () => Object.fromEntries(readdirSync(join(issueBatchGroupStoreRoot(f.root, f.intent.campaign_id, 1), 'adoption'))
    .sort().map(name => [name, readFileSync(join(issueBatchGroupStoreRoot(f.root, f.intent.campaign_id, 1), 'adoption', name), 'utf8')]));
  return { ...f, adopted, resume, successor, failedSuccessor, readBinding, adoptionPath, adoptSuccessor, adoptionArtifacts };
}
const templates = fixtureTemplate(buildFixture);
afterAll(() => templates.dispose());
async function fixture(stop = true, usage: 'none' | 'open' | 'acquired' = 'none') {
  const f = await templates.materialize(stop, usage);
  roots.push(f.root, f.home);
  return f;
}

test.each(['exact', 'replacement', 'partial'] as const)('stopped adopted source enforces %s Issue identities through real admission', async mode => {
  const f = await fixture();
  const sourcePath = join(issueBatchGroupStoreRoot(f.root, f.intent.campaign_id, 1), 'intent.json');
  const original = readFileSync(sourcePath, 'utf8');
  const oldCurrent = readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env).current.current_sha256;
  const next = await f.successor('campaign-2'); let calls = 0;
  const started = await startIssueBatchAuthoring(next, { readBinding: f.readBinding, consult: async input => {
    calls++; expect(input.prompt).toContain('Do not create any Issue');
    return { sessionId: 'successor-author', status: 'completed', meta: campaignBrowserMetadata({ sessionId: 'successor-author', repoRoot: f.root, profileDir: f.home, profileDirectory: 'Profile 1' }) };
  } });
  for (const operation of ['fill_missing', 'edit_issue'] as const) {
    await expect(continueIssueBatchAuthoring({ ...next, intent_sha256: started.intent.intent_sha256, source_session_ref: started.session.session_ref,
      operation, requested_slots: ['01'], ...(operation === 'edit_issue' ? { provider_issue_id: 'replacement', provider_issue_url: f.resume.issues[0]!.provider_issue_url } : {}) },
      { readBinding: f.readBinding, followup: async () => { calls++; throw Error('must not edit another Issue'); } })).rejects.toThrow('existing exact Issue');
  }
  const other = await f.successor('campaign-3');
  await expect(startIssueBatchAuthoring(other, { readBinding: f.readBinding, consult: async () => { calls++; throw Error('must not dispatch'); } })).rejects.toThrow('immutable');
  expect(calls).toBe(1);
  const intent = started.intent;
  const adoption = adoptIssueBatch({ ...f.input, campaign_id: intent.campaign_id, intent_sha256: intent.intent_sha256 }, {
    ...f.deps, observe: () => {
      const snapshot = makeSnapshot(intent, mode === 'partial' ? ['01'] : intent.slots);
      if (mode !== 'replacement') return snapshot;
      const observations = snapshot.observations.map((o, n) => {
        if (n !== 0) return o;
        const { protocol, kind, source_revision, observation_sha256, ...basis } = o;
        return buildProviderIssueObservation({ ...basis, provider_issue_id: 'replacement' });
      });
      return { observations, receipt: buildExternalSourceRefreshReceipt({ ...snapshot.receipt, source_revisions: observations.map(o => o.source_revision).sort() }) };
    }, followup: async request => {
      const data = JSON.parse(request.prompt.split('\n\n')[2]!);
      const answers = data.targets.map((t: {kind:string;path:string;line:number}) => t.kind === 'directory_entries'
        ? git(f.root, ['ls-tree','--name-only',`${intent.base_main_sha}:${t.path}`]).split('\n').sort().join('\n')
        : t.kind === 'text_line' ? git(f.root, ['show',`${intent.base_main_sha}:${t.path}`]).split('\n')[t.line-1]
        : createHash('sha256').update(execFileSync('git',['show',`${intent.base_main_sha}:${t.path}`],{cwd:f.root})).digest('hex'));
      return { sessionId:'successor-challenge',status:'completed',output:JSON.stringify({base_main_sha:intent.base_main_sha,answers}),
        meta:campaignBrowserMetadata({sessionId:'successor-challenge',sourceSessionId:'successor-author',repoRoot:f.root,profileDir:f.home,profileDirectory:'Profile 1'}) };
    },
  });
  if (mode === 'replacement') {
    await expect(adoption).rejects.toThrow('replacement Issue');
    expect(readIssueBatchAdoptionArtifact(f.root, intent, 'adoption')).toBeNull();
    expect(readIssueBatchAdoptionArtifact(f.root, intent, 'publication')).toBeNull();
    return;
  }
  const result = await adoption;
  expect(result.receipt.issues.map(i=>i.provider_issue_id)).toEqual(f.adopted.receipt.issues.filter(i=>mode!=='partial'||i.slot==='01').map(i=>i.provider_issue_id));
  expect(result.receipt.unfilled_slots).toEqual(mode==='partial'?['02']:[]);
  expect(result.publication!.materialized_commit).not.toBe(f.adopted.publication!.materialized_commit);
  expect(readFileSync(sourcePath,'utf8')).toBe(original);
  expect(readDevelopmentCampaignStatus(f.root,f.intent.campaign_id,f.env).current.current_sha256).toBe(oldCurrent);
  expect(() => assertResumedAdoption(f.root,intent,{...result.receipt,issues:result.receipt.issues.map((i,n)=>n===0?{...i,provider_issue_id:'replacement'}:i)})).toThrow('replacement Issue');
});

for (const mode of ['active','open','acquired','wrong-issue','tampered-manifest'] as const) test(`resume rejects ${mode} source before provider dispatch`, async () => {
  const f = await fixture(mode !== 'active', mode === 'open' || mode === 'acquired' ? mode : 'none');
  if (mode === 'tampered-manifest') {
    writeFileSync(join(f.root,f.adopted.publication!.manifest_path),'{}\n');git(f.root,['add','.']);git(f.root,['commit','-qm','tamper source manifest']);
  }
  const next = await f.successor('campaign-2');let calls=0;
  if(mode==='wrong-issue') next.resume_from={...f.resume,issues:f.resume.issues.map((i,n)=>n===0?{...i,provider_issue_id:'replacement'}:i)};
  await expect(startIssueBatchAuthoring(next,{readBinding:f.readBinding,consult:async()=>{calls++;throw Error('unexpected provider');}})).rejects.toThrow();
  expect(calls).toBe(0);
  expect(readIssueBatchAdoptionArtifact(f.root,f.intent,'continuation')).toBeNull();
});

test('pre-dispatch crash after continuation binding retries the same persisted intent once', async () => {
  const f = await fixture(); const next = await f.successor('campaign-2'); let calls = 0;
  const persist = issueStore.persistIssueBatchAdoptionArtifact;
  const crash = spyOn(issueStore, 'persistIssueBatchAdoptionArtifact').mockImplementation((...args) => {
    persist(...args);
    if (args[2] === 'continuation') throw Error('crash after binding before reservation');
  });
  const deps = { readBinding:f.readBinding, consult:async () => { calls++; return { sessionId:'resumed-after-crash',status:'completed' as const,
    meta:campaignBrowserMetadata({sessionId:'resumed-after-crash',repoRoot:f.root,profileDir:f.home,profileDirectory:'Profile 1'}) }; } };
  try {
    await expect(startIssueBatchAuthoring(next,{...deps,now:()=> '2026-09-09T00:00:00.000Z'})).rejects.toThrow('crash after binding');
  } finally { crash.mockRestore(); }
  expect(calls).toBe(0);
  const path=join(issueBatchGroupStoreRoot(f.root,'campaign-2',1),'intent.json');
  const original=readFileSync(path,'utf8');
  const resumed=await startIssueBatchAuthoring(next,{...deps,now:()=> '2026-09-09T00:01:00.000Z'});
  expect(calls).toBe(1);expect(readFileSync(path,'utf8')).toBe(original);
  expect(resumed.intent.created_at).toBe('2026-09-09T00:00:00.000Z');
  await expect(startIssueBatchAuthoring(next,{...deps,now:()=> '2026-09-09T00:02:00.000Z'})).rejects.toThrow('reconcile');
  expect(calls).toBe(1);
});

test('a stopped never-adopted successor is replaced through the formal entrypoint and the replacement adopts', async () => {
  const f = await fixture();
  const failed = await f.failedSuccessor('campaign-2');
  const continuationBefore = readFileSync(f.adoptionPath(f.intent.campaign_id, 'continuation'), 'utf8');
  const failedIntentBefore = readFileSync(join(issueBatchGroupStoreRoot(f.root, 'campaign-2', 1), 'intent.json'), 'utf8');
  const sourceCurrent = readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env).current.current_sha256;
  const next = await f.successor('campaign-3');
  let calls = 0;
  const started = await startIssueBatchAuthoring({ ...next, resume_from: { ...f.resume,
    supersedes: { campaign_id: 'campaign-2', group_number: 1, intent_sha256: failed.intent.intent_sha256 } } }, {
    readBinding: f.readBinding, consult: async input => {
      calls++;
      // Most recent first: the superseded successor's confirmed remote marker, then the source marker.
      expect(JSON.parse(input.prompt.split('\n').find(line => line.startsWith('[{'))!)).toEqual(f.resume.issues.map(issue => ({
        slot: issue.slot, provider_issue_id: issue.provider_issue_id, provider_issue_url: issue.provider_issue_url,
        previous_markers: [renderIssueBatchMarker('campaign-2', 1, issue.slot), renderIssueBatchMarker(f.intent.campaign_id, 1, issue.slot)],
      })));
      for (const slot of ['01', '02']) expect(input.prompt).toContain(renderIssueBatchMarker('campaign-3', 1, slot));
      return { sessionId: 'campaign-3-author', status: 'completed' as const,
        meta: campaignBrowserMetadata({ sessionId: 'campaign-3-author', repoRoot: f.root, profileDir: f.home, profileDirectory: 'Profile 1' }) };
    } });
  expect(calls).toBe(1);
  const record = readIssueBatchAdoptionArtifact(f.root, f.intent, `superseded-${failed.intent.intent_sha256.slice('sha256:'.length)}`);
  expect(record).toMatchObject({ protocol: 1, kind: 'repo-harness-campaign-continuation-replacement',
    superseded: { campaign_id: 'campaign-2', group_number: 1, intent_sha256: failed.intent.intent_sha256 },
    replacement: { campaign_id: 'campaign-3', group_number: 1, intent_sha256: started.intent.intent_sha256 },
    evidence: { marked_slots: ['01', '02'] }, created_at: started.intent.created_at });
  expect(readFileSync(f.adoptionPath(f.intent.campaign_id, 'continuation'), 'utf8')).toBe(continuationBefore);
  expect(readFileSync(join(issueBatchGroupStoreRoot(f.root, 'campaign-2', 1), 'intent.json'), 'utf8')).toBe(failedIntentBefore);
  expect(readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env).current.current_sha256).toBe(sourceCurrent);
  const result = await f.adoptSuccessor(started.intent);
  expect(result.receipt.issues.map(i => i.provider_issue_id)).toEqual(f.adopted.receipt.issues.map(i => i.provider_issue_id));
  expect(result.publication!.materialized_commit).not.toBe(f.adopted.publication!.materialized_commit);
  expect(() => assertResumedAdoption(f.root, failed.intent, result.receipt)).toThrow('not bound');
});

// Each mode pins the exact fail-closed reason, so a rejection can never pass this table by throwing
// for an unrelated cause.
const REJECTIONS = {
  'active': 'a replaceable successor must be formally stopped by its own last campaign event',
  'has-adoption': 'a replaceable successor must have no adoption and no publication',
  'has-publication': 'a replaceable successor must have no adoption and no publication',
  'acquired': 'a replaceable successor must have no acquisition, no open reservation and no unadopted budget record',
  'open-reservation': 'a replaceable successor must have no acquisition, no open reservation and no unadopted budget record',
  'active-step': 'a replaceable successor must have no active controller step and no reserved provider call',
  'unknown-provider-result': 'a replaceable successor has a provider mutation with an unknown result',
  'unverified-session': 'a replaceable successor has an incomplete or unverified authoring session',
  'tampered-manifest': 'resume source publication is not an unchanged canonical ancestor',
  'stale-supersedes': 'issue batch intent digest does not name the group intent',
  'supersedes-not-effective': 'the superseded successor no longer holds the effective continuation',
} as const;
for (const mode of Object.keys(REJECTIONS) as readonly (keyof typeof REJECTIONS)[]) test(`replacement rejects ${mode} before any provider dispatch`, async () => {
  const f = await fixture();
  const failed = await f.failedSuccessor('campaign-2', mode !== 'active');
  let supersedes = { campaign_id: 'campaign-2', group_number: 1, intent_sha256: failed.intent.intent_sha256 };
  let calls = 0;
  const dispatch = (id: string) => ({ readBinding: f.readBinding, consult: async () => { calls++; throw Error('must not dispatch'); } });
  if (mode === 'has-adoption' || mode === 'has-publication') {
    issueStore.persistIssueBatchAdoptionArtifact(f.root, failed.intent, mode === 'has-adoption' ? 'adoption' : 'publication', { synthetic: true });
  } else if (mode === 'acquired' || mode === 'open-reservation') {
    const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: failed.authorization, env: f.env }).budget;
    const reservation = reserveAutomationBudget({ repo_root: f.root, automation_run_id: budget.automation_run_id, expected_budget_sha256: budget.budget_sha256,
      idempotency_key: 'acquisition', operation: 'acquisition', unit_kind: 'execute', unit_id: 'test', attempt: 1, provider: null, env: f.env });
    if (mode === 'acquired') appendAutomationUsage({ repo_root: f.root, reservation, outcome: 'progress', evidence_refs: [], env: f.env });
  } else if (mode === 'active-step') {
    const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: failed.authorization, env: f.env }).budget;
    beginCampaignBudgetStep({ repo_root: f.root, automation_run_id: budget.automation_run_id, expected_budget_sha256: budget.budget_sha256,
      campaign_id: 'campaign-2', group_number: 1, intent_sha256: failed.intent.intent_sha256, idempotency_key: 'unsettled-step', env: f.env });
  } else if (mode === 'unknown-provider-result') {
    const basis = { protocol: 1, kind: 'repo-harness-campaign-mutation-reservation', slot: '01' };
    const digest = canonicalMessageDigest(basis);
    issueStore.persistIssueBatchJournalRecord(f.root, 'campaign-2', 1, 'reservations', digest, `${canonicalMessageBytes({ ...basis, reservation_sha256: digest })}\n`);
  } else if (mode === 'unverified-session') {
    issueStore.persistIssueAuthoringSession(f.root, 'campaign-2', 1, buildIssueAuthoringSession({ intent_sha256: failed.intent.intent_sha256,
      operation: 'fill_missing', requested_slots: ['02'], provider_issue_id: null, session_ref: 'unverified-followup',
      source_session_ref: null, browser_status: 'completed', browser_evidence: null, created_at: '2026-09-09T00:00:00.000Z' }));
  } else if (mode === 'tampered-manifest') {
    writeFileSync(join(f.root, f.adopted.publication!.manifest_path), '{}\n');
    git(f.root, ['add', '.']); git(f.root, ['commit', '-qm', 'tamper source manifest']);
  } else if (mode === 'stale-supersedes') {
    supersedes = { ...supersedes, intent_sha256: f.intent.intent_sha256 };
  } else if (mode === 'supersedes-not-effective') {
    const winner = await f.successor('campaign-3');
    await startIssueBatchAuthoring({ ...winner, resume_from: { ...f.resume, supersedes } }, { readBinding: f.readBinding,
      consult: async () => ({ sessionId: 'campaign-3-author', status: 'completed' as const,
        meta: campaignBrowserMetadata({ sessionId: 'campaign-3-author', repoRoot: f.root, profileDir: f.home, profileDirectory: 'Profile 1' }) }) });
  }
  const before = f.adoptionArtifacts();
  const next = await f.successor('campaign-4');
  await expect(startIssueBatchAuthoring({ ...next, resume_from: { ...f.resume, supersedes } }, dispatch('campaign-4')))
    .rejects.toThrow(REJECTIONS[mode]);
  expect(calls).toBe(0);
  expect(f.adoptionArtifacts()).toEqual(before);
}, 120000);

test('competing and interrupted replacements admit exactly one successor', async () => {
  const f = await fixture();
  const failed = await f.failedSuccessor('campaign-2');
  const supersedes = { campaign_id: 'campaign-2', group_number: 1, intent_sha256: failed.intent.intent_sha256 };
  const winner = await f.successor('campaign-3');
  const request = { ...winner, resume_from: { ...f.resume, supersedes } };
  let calls = 0;
  const consult = async () => { calls++; return { sessionId: 'campaign-3-author', status: 'completed' as const,
    meta: campaignBrowserMetadata({ sessionId: 'campaign-3-author', repoRoot: f.root, profileDir: f.home, profileDirectory: 'Profile 1' }) }; };
  const persist = issueStore.persistIssueBatchAdoptionArtifact;
  const crash = spyOn(issueStore, 'persistIssueBatchAdoptionArtifact').mockImplementation((...args) => {
    persist(...args);
    if (String(args[2]).startsWith('superseded-')) throw Error('crash after the replacement record');
  });
  try {
    await expect(startIssueBatchAuthoring(request, { readBinding: f.readBinding, consult, now: () => '2026-09-09T00:00:00.000Z' }))
      .rejects.toThrow('crash after the replacement record');
  } finally { crash.mockRestore(); }
  expect(calls).toBe(0);
  const retried = await startIssueBatchAuthoring(request, { readBinding: f.readBinding, consult, now: () => '2026-09-09T00:01:00.000Z' });
  expect(calls).toBe(1);
  expect(retried.intent.created_at).toBe('2026-09-09T00:00:00.000Z');
  await expect(startIssueBatchAuthoring(request, { readBinding: f.readBinding, consult })).rejects.toThrow('reconcile');
  const artifacts = f.adoptionArtifacts();
  expect(Object.keys(artifacts).filter(name => name.startsWith('superseded-'))).toEqual([`superseded-${failed.intent.intent_sha256.slice('sha256:'.length)}.json`]);
  const loser = await f.successor('campaign-4');
  await expect(startIssueBatchAuthoring({ ...loser, resume_from: { ...f.resume, supersedes } }, { readBinding: f.readBinding, consult }))
    .rejects.toThrow('effective continuation');
  // A changed request against the same campaign id fails closed on its own immutable intent.
  await expect(startIssueBatchAuthoring({ ...winner, resume_from: f.resume }, { readBinding: f.readBinding, consult })).rejects.toThrow('immutable');
  // The superseded successor is neither an adopter nor a resume source any more.
  await expect(startIssueBatchAuthoring({ ...loser, resume_from: { campaign_id: 'campaign-2', group_number: 1,
    intent_sha256: failed.intent.intent_sha256, source_session_ref: failed.session.session_ref, issues: f.resume.issues } },
    { readBinding: f.readBinding, consult })).rejects.toThrow('quiescent predecessor');
  expect(calls).toBe(1);
  expect(f.adoptionArtifacts()).toEqual(artifacts);
}, 120000);

test('a replacement leaves the superseded budget run byte-for-byte and opens its own', async () => {
  const f = await fixture();
  const failed = await f.failedSuccessor('campaign-2');
  const before = readAutomationBudgetStatus(f.root, failed.run, f.env);
  expect(readCampaignBudgetLedger(f.root, failed.run, f.env).provider_calls).toBeGreaterThan(0);
  const next = await f.successor('campaign-3');
  const started = await startIssueBatchAuthoring({ ...next, resume_from: { ...f.resume,
    supersedes: { campaign_id: 'campaign-2', group_number: 1, intent_sha256: failed.intent.intent_sha256 } } }, {
    readBinding: f.readBinding, consult: async () => ({ sessionId: 'campaign-3-author', status: 'completed' as const,
      meta: campaignBrowserMetadata({ sessionId: 'campaign-3-author', repoRoot: f.root, profileDir: f.home, profileDirectory: 'Profile 1' }) }) });
  const after = readAutomationBudgetStatus(f.root, failed.run, f.env);
  expect(after.current).toEqual(before.current);
  const record = readIssueBatchAdoptionArtifact(f.root, f.intent, `superseded-${failed.intent.intent_sha256.slice('sha256:'.length)}`)!;
  expect(record.superseded).toMatchObject({ automation_run_id: failed.run, ledger_sha256: before.current.ledger_sha256,
    budget_current_sha256: before.current.current_sha256 });
  const replacementRun = campaignAutomationRunId({ repository_id: started.intent.repository_id, campaign_id: 'campaign-3' });
  expect(replacementRun).not.toBe(failed.run);
  const replacement = readAutomationBudgetStatus(f.root, replacementRun, f.env);
  expect(replacement.current.consumed.successful_acquisitions).toBe(0);
  expect(replacement.budget.authorization.authorization_sha256).not.toBe(before.budget.authorization.authorization_sha256);
}, 120000);

/**
 * A stopped successor that never adopted can still sit on `unsealed_exhaustion`: its budget
 * deadline passed while it was quiescent, so no business verb is left to seal the receipt and
 * the replacement gate refuses the drift. The repair verb is the explicit operator step that
 * seals it; the gate itself stays strict and never reads drift as "nothing happened".
 */
test('an expired stopped successor is admitted for replacement only after the budget repair verb', async () => {
  const f = await fixture();
  const failed = await f.failedSuccessor('campaign-2');
  const expired = readAutomationBudgetStatus(f.root, failed.run, f.env);
  const previousSeam = process.env[AUTOMATION_TEST_CLOCK_SEAM_ENV];
  process.env[AUTOMATION_TEST_CLOCK_SEAM_ENV] = '1';
  // Past the superseded run's frozen deadline; the grant itself is still valid, so the only
  // thing standing between the successor and replacement is the unsealed exhaustion.
  const pinned = new Date(Date.parse(expired.budget.deadline_at) + 60_000);
  __setAutomationClockForTests(() => pinned);
  try {
    const supersedes = { campaign_id: 'campaign-2', group_number: 1, intent_sha256: failed.intent.intent_sha256 };
    const next = await f.successor('campaign-3');
    const request = { ...next, resume_from: { ...f.resume, supersedes } };
    let calls = 0;
    const consult = async () => { calls++; return { sessionId: 'campaign-3-author', status: 'completed' as const,
      meta: campaignBrowserMetadata({ sessionId: 'campaign-3-author', repoRoot: f.root, profileDir: f.home, profileDirectory: 'Profile 1' }) }; };

    expect(readAutomationBudgetStatus(f.root, failed.run, f.env).drift).toBe('unsealed_exhaustion');
    await expect(startIssueBatchAuthoring(request, { readBinding: f.readBinding, consult }))
      .rejects.toThrow('no unadopted budget record');
    expect(calls).toBe(0);

    const repaired = repairAutomationBudgetDrift({ repo_root: f.root, automation_run_id: failed.run, env: f.env });
    expect(repaired.drift).toBe('none');
    expect(repaired.stop_receipt).not.toBeNull();
    expect(repaired.current.consumed.successful_acquisitions).toBe(0);

    const started = await startIssueBatchAuthoring(request, { readBinding: f.readBinding, consult });
    expect(calls).toBe(1);
    expect(started.intent.campaign_id).toBe('campaign-3');
  } finally {
    __resetAutomationClockForTests();
    if (previousSeam === undefined) delete process.env[AUTOMATION_TEST_CLOCK_SEAM_ENV];
    else process.env[AUTOMATION_TEST_CLOCK_SEAM_ENV] = previousSeam;
  }
}, 120000);

test('prepare-resume emits an exclusive request and its chain preflight with no provider', async () => {
  const f = await fixture();
  const failed = await f.failedSuccessor('campaign-2');
  const cli = join(import.meta.dir, '..', '..', 'src', 'cli', 'index.ts');
  const revision = git(f.root, ['rev-parse', 'HEAD']);
  const prepare = (out: string, supersedes: boolean) => Bun.spawnSync([process.execPath, cli, 'campaign', 'prepare-resume',
    '--repo', f.root, '--source-campaign-id', f.intent.campaign_id, '--source-group-number', '1',
    '--source-intent-sha256', f.intent.intent_sha256, '--target-revision', revision,
    ...(supersedes ? ['--superseded-campaign-id', 'campaign-2', '--superseded-group-number', '1',
      '--superseded-intent-sha256', failed.intent.intent_sha256] : []),
    '--out', out], { env: f.env, stdout: 'pipe', stderr: 'pipe' });
  const plainPath = join(f.home, 'resume-request.json');
  const plain = prepare(plainPath, false);
  expect(plain.exitCode, plain.stderr.toString()).toBe(0);
  expect(Object.keys(JSON.parse(readFileSync(plainPath, 'utf8'))).sort())
    .toEqual(['campaign_id', 'group_number', 'intent_sha256', 'issues', 'source_session_ref']);

  const replacementPath = join(f.home, 'replacement-request.json');
  const replacement = prepare(replacementPath, true);
  expect(replacement.exitCode, replacement.stderr.toString()).toBe(0);
  const request = JSON.parse(readFileSync(replacementPath, 'utf8'));
  expect(Object.keys(request).sort())
    .toEqual(['campaign_id', 'group_number', 'intent_sha256', 'issues', 'source_session_ref', 'supersedes']);
  expect(request).toMatchObject({ campaign_id: f.intent.campaign_id, group_number: 1, intent_sha256: f.intent.intent_sha256,
    source_session_ref: f.resume.source_session_ref, issues: f.resume.issues,
    supersedes: { campaign_id: 'campaign-2', group_number: 1, intent_sha256: failed.intent.intent_sha256 } });
  const preflight = JSON.parse(replacement.stdout.toString());
  expect(preflight).toMatchObject({ kind: 'repo-harness-campaign-resume-preflight', request_path: replacementPath,
    verdict: 'replacement_eligible', effective_continuation: { campaign_id: 'campaign-2', group_number: 1, intent_sha256: failed.intent.intent_sha256 } });
  expect(preflight.chain_consumption.map((entry: { campaign_id: string }) => entry.campaign_id).sort())
    .toEqual([f.intent.campaign_id, 'campaign-2'].sort());
  for (const entry of preflight.chain_consumption) expect(entry).toMatchObject({ drift: 'none', open_reservations: 0 });

  // The request file is exclusive: a second preflight cannot overwrite an emitted request.
  const repeated = prepare(replacementPath, true);
  expect(repeated.exitCode).not.toBe(0);
  expect(repeated.stderr.toString() + repeated.stdout.toString()).toContain('EEXIST');
  expect(readFileSync(replacementPath, 'utf8')).toBe(`${JSON.stringify(request, null, 2)}\n`);
}, 120000);

test('recovery preserves expired history and only unlocks continuation after the stranded charge settles', async () => {
  const f = await fixture();
  const failed = await f.failedSuccessor('expired-successor', false);
  const budget = readAutomationBudgetStatus(f.root, failed.run, f.env);
  const admission = reserveCampaignAuthoringBudget({ repo_root: f.root, automation_run_id: failed.run,
    expected_budget_sha256: budget.budget.budget_sha256, campaign_id: failed.intent.campaign_id,
    group_number: 1, intent_sha256: failed.intent.intent_sha256, operation: 'challenge', idempotency_key: 'stranded-challenge', env: f.env });
  const reservation = admission.reservation;
  const status = readDevelopmentCampaignStatus(f.root, failed.intent.campaign_id, f.env);
  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse(failed.authorization.expires_at) + 1;
    appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: failed.intent.campaign_id,
      expected_current_sha256: status.current.current_sha256, idempotency_key: 'record-expiry',
      operation: 'expire_authorization', observed_at: new Date().toISOString(), env: f.env });
  } finally { Date.now = originalNow; }
  const expired = readDevelopmentCampaignStatus(f.root, failed.intent.campaign_id, f.env);
  expect(() => assertReplaceableStoppedSuccessor(f.root, failed.intent, f.env)).toThrow('formally stopped');
  appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: failed.intent.campaign_id,
    expected_current_sha256: expired.current.current_sha256, idempotency_key: 'acknowledge-stop',
    operation: 'stop', evidence_refs: [expired.events.at(-1)!.event_sha256], observed_at: new Date().toISOString(), env: f.env });
  const stopped = readDevelopmentCampaignStatus(f.root, failed.intent.campaign_id, f.env);
  expect(stopped.events.slice(0, -1)).toEqual([...expired.events]);
  expect(() => assertReplaceableStoppedSuccessor(f.root, failed.intent, f.env)).toThrow('no open reservation');
  const digest = createHash('sha256').update('original provider evidence').digest('hex');
  const recordPath = join(f.root, '.git/repo-harness/automation-budget/v1/runs', failed.run, 'reconciliations', `${reservation.reservation_sha256}.json`);
  const original = JSON.stringify({ protocol: 1, kind: 'repo-harness-automation-reconciliation',
    automation_run_id: failed.run, reservation_sha256: reservation.reservation_sha256, resolution: 'reconciled_reserved',
    reason: 'Challenge result was lost after dispatch.', evidence_refs: [{ ref: 'provider-run:original-challenge', sha256: `sha256:${digest}` }],
    reconciled_at: new Date().toISOString() });
  writeFileSync(recordPath, original, { flag: 'wx' });
  const repaired = repairAutomationReconciliation({ repo_root: f.root, automation_run_id: failed.run,
    reservation_sha256: reservation.reservation_sha256, expected_reconciliation_sha256: createHash('sha256').update(original).digest('hex'),
    repair_reason: 'Use the digest of the original evidence bytes.', outcome: 'provider_failure',
    evidence_refs: [{ ref: 'provider-run:original-challenge', sha256: digest }], mode: 'apply', env: f.env });
  expect(repaired.event.consumed).toEqual(reservation.reserved);
  const basis = assertReplaceableStoppedSuccessor(f.root, failed.intent, f.env);
  expect(basis.superseded.stop_event_sha256).toBe(stopped.events.at(-1)!.event_sha256);
  expect(readFileSync(recordPath, 'utf8')).toBe(original);
  expect(readCampaignBudgetLedger(f.root, failed.run, f.env).reserved_provider_calls).toBe(0);
  expect(readAutomationBudgetStatus(f.root, failed.run, f.env).current.consumed.successful_acquisitions).toBe(0);
}, 120000);
