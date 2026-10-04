import { fixtureTemplate } from '../helpers/repo-fixture';
import { campaignBrowserMetadata } from '../helpers/campaign-browser-session';
import { startIssueBatchAuthoring, continueIssueBatchAuthoring } from '../../src/effects/automation/gpt-pro-issue-authoring';
import { createHash } from 'crypto';
import historyFixture from '../fixtures/campaign-revision-evidence/history.json';
import { afterAll, test, expect, afterEach } from 'bun:test';
import { execFileSync } from 'child_process';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createAdoptionRepository } from '../helpers/campaign-adoption-repository';
import { installHistoricalAdoption } from '../helpers/historical-campaign-lifecycle';
import { readDevelopmentCampaignStatus, appendDevelopmentCampaignEvent, developmentCampaignStoreRoot } from '../../src/effects/automation/development-campaign-store';
import {
  buildCampaignGroupSnapshot,
  persistCampaignGroupSnapshot,
  runCampaignFreshAudit,
  resolveCampaignGroupBaseline,
} from '../../src/effects/automation/campaign-fresh-audit';
import { withCampaignPlanningLock, persistPlanningRecord, readPlanningRecord } from '../../src/effects/automation/campaign-planning-store';
import { campaignCloseoutKey } from '../../src/core/automation/campaign-closeout';
import { canonicalMessageDigest, messageSha256 } from '../../src/core/messages/mechanics';
import { ensureCampaignAuthoringBudget, readCampaignBudgetLedger } from '../../src/effects/automation/budget-store';
import { listIssueAuthoringSessions } from '../../src/effects/automation/issue-batch-store';
const roots: string[] = [];
const templates = fixtureTemplate(createAdoptionRepository);
afterAll(() => templates.dispose());
afterEach(() => {
  for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true });
});
const git = (root: string, args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function fixture(cleanup = true, groupCount: 1 | 2 | 3 = 1) {
  const f = await templates.materialize(
    'active',
    1,
    undefined,
    {},
    {},
    { group_count: groupCount, max_provider_calls: 20, max_provider_failures: 10, max_agent_turns: 30, max_runner_invocations: 30 },
  );
  f.resetCalls();
  roots.push(f.root, f.home);
  // Production order: the group adoption and its publication precede start_group.
  const publication = installHistoricalAdoption(f);
  const status = readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env);
  appendDevelopmentCampaignEvent({
    repo_root: f.root,
    campaign_id: f.intent.campaign_id,
    operation: 'start_group',
    expected_current_sha256: status.current.current_sha256,
    idempotency_key: 'start-audit-group',
    observed_at: new Date().toISOString(),
    env: f.env,
  });
  git(f.root, ['merge', '--ff-only', publication.materialized_commit]);
  const manifest = JSON.parse(git(f.root, ['show', `${publication.materialized_commit}:${publication.manifest_path}`]));
  // Synthetic historical completion, never current active-admission evidence.
  if (cleanup)
    withCampaignPlanningLock(f.root, f.intent, () => {
      for (const row of manifest.slots)
        persistPlanningRecord(f.root, f.intent, campaignCloseoutKey(row.task_id, 'complete'), {
          protocol: 1,
          kind: 'repo-harness-campaign-cleanup',
          disposition: 'not_planned',
          decision_sha256: canonicalMessageDigest({ task: row.task_id }),
          execution_topology: null,
          task_id: row.task_id,
          task_revision: 'c'.repeat(64),
        });
    });
  const input = {
    repo_root: f.root,
    campaign_id: f.intent.campaign_id,
    group_number: 1,
    intent_sha256: f.intent.intent_sha256,
    idempotency_key: 'audit-1',
    env: f.env,
  };
  const binding = () => ({
    path: 'fixture',
    binding: { version: 1 as const, profileDir: '/fixture/profile', profileDirectory: f.authorization.campaign!.chrome_profile_directory },
    error: undefined,
  });
  return { ...f, input, binding, publication };
}
test('fresh audit uses current default/GitHub, charges after authoring sealed, and replays without I/O', async () => {
  const f = await fixture();
  let calls = 0;
  const deps = {
    readBinding: f.binding,
    consult: async (input: any) => {
      calls++;
      expect(input.chatgptApp).toBeNull(); expect(input.prompt).toStartWith('@github connector ');
      const instructions = JSON.parse(input.prompt.slice(input.prompt.indexOf('\n') + 1));
    expect(instructions).toContain(`https://api.github.com/repos/${f.intent.provider_repository}/git/commits/${git(f.root, ['rev-parse', 'HEAD'])}`);
      expect(instructions).toContain(`https://api.github.com/repos/${f.intent.provider_repository}/git/ref/${f.intent.target_ref.slice(5)}`);
      expect(instructions).toContain('Use the GitHub fetch action');
      expect(input.captureNetworkEvidence).toBe(true);
      expect(input.model).toBeUndefined();
      expect(input.thinkingTime).toBeUndefined();
      expect(input.sessionId).toBeUndefined();
      return {
        sessionId: 'audit-new',
        status: 'completed' as const,
        meta: { model: { verified: false }, oracle: { networkCapture: { status: 'captured', path: 'private-fixture-trace', sha256: 'sha256:' + 'a'.repeat(64), bytes: 100, sessionId: 'audit-provider' } } },
        output: JSON.stringify({
          protocol: 1,
          disposition: 'accepted',
          observed_main_sha: git(f.root, ['rev-parse', 'HEAD']),
          slots: ['01', '02'],
          findings: [],
        }),
      };
    },
  };
  const result = await runCampaignFreshAudit(f.input, deps);
  expect(result.observation.disposition).toBe('unverified');
  const attempt = canonicalMessageDigest({ kind: 'fresh-audit-attempt', value: f.input.idempotency_key }).slice(7);
  const answerKey = canonicalMessageDigest({ kind: 'audit-answer', value: attempt }).slice(7);
  expect(readPlanningRecord(f.root, f.intent, answerKey)).toMatchObject({ network_capture: { status: 'captured', path: 'private-fixture-trace' } });
  expect(result.snapshot.slots).toHaveLength(2);
  expect(readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env).current.state).toBe('group_auditing');
  const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env });
  const before = readCampaignBudgetLedger(f.root, budget.budget.automation_run_id, f.env);
  expect(
    (
      await runCampaignFreshAudit(f.input, {
        ...deps,
        readBinding: () => {
          throw new Error('replay must not need a browser');
        },
      })
    ).replayed,
  ).toBe(true);
  expect(calls).toBe(1);
  expect(readCampaignBudgetLedger(f.root, budget.budget.automation_run_id, f.env)).toEqual(before);
  const status = readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env);
  expect(() =>
    appendDevelopmentCampaignEvent({
      repo_root: f.root,
      campaign_id: f.intent.campaign_id,
      operation: 'accept_group',
      expected_current_sha256: status.current.current_sha256,
      idempotency_key: 'accept',
      evidence_refs: [result.observation.observation_sha256],
      observed_at: new Date().toISOString(),
      env: f.env,
    }),
  ).toThrow('trusted exact-version');
  expect(() => resolveCampaignGroupBaseline(f.root, status.campaign, status.events, 2, f.env)).toThrow('current lifecycle group');
}, 60000);
test('missing cleanup and stale snapshot fail before audit dispatch', async () => {
  const f = await fixture(false);
  expect(() => buildCampaignGroupSnapshot(f.root, f.intent, f.env)).toThrow('cleanup');
}, 60000);
test.each(['reused', 'malformed', 'wrong-sha', 'pending'])(
  'audit outcome %s never advances',
  async (mode) => {
    const f = await fixture();
    const source = listIssueAuthoringSessions(f.root, f.intent.campaign_id, 1)[0]!;
    let calls = 0;
    const deps = {
      readBinding: f.binding,
      consult: async () => {
        calls++;
        return {
          sessionId: mode === 'reused' ? source.session_ref : 'new',
          status: mode === 'pending' ? ('running' as const) : ('completed' as const),
          meta: { model: { verified: false } },
          output:
            mode === 'malformed'
              ? 'invalid'
              : JSON.stringify({
                  protocol: 1,
                  disposition: 'accepted',
                  observed_main_sha: 'f'.repeat(40),
                  slots: ['01', '02'],
                  findings: [],
                }),
        };
      },
    };
    if (mode === 'wrong-sha') {
      expect((await runCampaignFreshAudit(f.input, deps)).observation.disposition).toBe('unverified');
    } else await expect(runCampaignFreshAudit(f.input, deps)).rejects.toThrow();
    expect(readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env).current.state).toBe('group_auditing');
    if (mode === 'pending') {
      await expect(runCampaignFreshAudit(f.input, deps)).rejects.toThrow('do not repeat provider I/O');
      await expect(runCampaignFreshAudit({ ...f.input, idempotency_key: 'another-audit' }, deps)).rejects.toThrow(
        'reconciliation_required',
      );
      expect(calls).toBe(1);
    }
  },
  60000,
);
test('stale stored snapshot and opaque audit references cannot change lifecycle', async () => {
  const f = await fixture();
  const snapshot = buildCampaignGroupSnapshot(f.root, f.intent, f.env);
  persistCampaignGroupSnapshot(f.root, f.intent, snapshot);
  writeFileSync(join(f.root, 'advance.txt'), 'main advanced');
  git(f.root, ['add', 'advance.txt']);
  git(f.root, ['commit', '-qm', 'advance']);
  const status = readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env);
  const request = {
    repo_root: f.root,
    campaign_id: f.intent.campaign_id,
    operation: 'begin_group_audit' as const,
    expected_current_sha256: status.current.current_sha256,
    idempotency_key: 'stale-audit',
    observed_at: new Date().toISOString(),
    env: f.env,
  };
  expect(() => appendDevelopmentCampaignEvent({ ...request, evidence_refs: [snapshot.snapshot_sha256] })).toThrow('snapshot is stale');
  expect(() => appendDevelopmentCampaignEvent({ ...request, evidence_refs: ['opaque'] })).toThrow('snapshot reference');
  expect(readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env).current).toEqual(status.current);
}, 60000);

test.each(['failed', 'recoverable'] as const)('audit retains exact %s attempt capture without new provider I/O', async status => {
  const f = await fixture(); let calls = 0;
  const capture = { status: 'incomplete', path: 'private-original-trace', sha256: 'sha256:' + 'c'.repeat(64), bytes: 200, sessionId: 'provider-partial' };
  const deps = { readBinding: f.binding, consult: async () => {
    calls++;
    return { sessionId: 'local-partial', status, output: 'partial', meta: { model: { verified: false }, providerSessionId: 'provider-partial', oracle: { networkCapture: capture } } };
  } };
  await expect(runCampaignFreshAudit(f.input, deps)).rejects.toThrow('not terminal-completed');
  const attempt = canonicalMessageDigest({ kind: 'fresh-audit-attempt', value: f.input.idempotency_key }).slice(7);
  const answerKey = canonicalMessageDigest({ kind: 'audit-answer', value: attempt }).slice(7);
  const record = readPlanningRecord(f.root, f.intent, answerKey);
  expect(record).toMatchObject({ session_ref: 'local-partial', provider_session_ref: 'provider-partial', browser_status: status, network_capture: capture });
  await expect(runCampaignFreshAudit(f.input, deps)).rejects.toThrow('do not repeat provider I/O');
  expect(calls).toBe(1); expect(JSON.stringify(readPlanningRecord(f.root, f.intent, answerKey))).toBe(JSON.stringify(record));
}, 60000);

test.each([1,2,3].flatMap(groupCount => (['accepted','accepted_with_followups','rejected'] as const).map(disposition => [groupCount,disposition] as const)))('verified provider history gates %s groups / %s recommendation', async (groupCount,disposition) => {
  const f=await fixture(true, groupCount as 1 | 2 | 3); const snapshot=buildCampaignGroupSnapshot(f.root,f.intent,f.env);
  const result=await runCampaignFreshAudit(f.input,{readBinding:f.binding,consult:async input=>{
    expect(input.captureConversationEvidence).toBe(true);
    const output=JSON.stringify({protocol:1,disposition,observed_main_sha:snapshot.expected_final_main_sha,slots:['01','02'],findings:['Preserve exact upstream finding: \"retry boundary\"']});
    const history=structuredClone(historyFixture);
    const body=JSON.parse(history.response.body.replaceAll('example/canary',snapshot.provider_repository).replaceAll('a'.repeat(40),snapshot.expected_final_main_sha));
    body.messages[0].content.parts=[input.prompt];body.messages[3].content.parts=[output];history.response.body=JSON.stringify(body);
    history.response.decodedBodySha256=createHash('sha256').update(history.response.body).digest('hex');
    return {sessionId:'audit-fresh-local',status:'completed' as const,output,meta:{status:'completed',sessionId:'audit-fresh-local',provider:'oracle',engine:'chatgpt-browser',repo:f.root,providerSessionId:'audit-fresh-provider',model:{verified:false},
      browser:{transport:'copy_profile',profileDir:'/fixture/profile',profileDirectory:f.authorization.campaign!.chrome_profile_directory,chatgptApp:'GitHub'},
      oracle:{observation:{source:'oracle-session-metadata',sessionId:'audit-fresh-provider',parentSessionId:null,appSelection:{status:'selected',app:'GitHub',source:'chatgpt-composer-pill',pluginId:'plugin:connector_76869538009648d5b282a4bb21c3d157',capturedAt:new Date().toISOString()}},
        conversationCapture:{status:'captured',sessionId:'audit-fresh-provider',conversationId:history.conversationId,sha256:'sha256:'+'f'.repeat(64),history}}}};
  }});
  expect(result.observation.disposition).toBe(disposition);
  const status=readDevelopmentCampaignStatus(f.root,f.intent.campaign_id,f.env);
  const accept=()=>appendDevelopmentCampaignEvent({repo_root:f.root,campaign_id:f.intent.campaign_id,operation:'accept_group',expected_current_sha256:status.current.current_sha256,idempotency_key:'verified-accept',evidence_refs:[result.observation.observation_sha256],observed_at:new Date().toISOString(),env:f.env});
  if(disposition==='rejected') { expect(accept).toThrow('rejected'); return; }
  accept();
  const transition = (operation: 'complete' | 'complete_with_followups' | 'prepare_group', id = operation) => {
    const current = readDevelopmentCampaignStatus(f.root,f.intent.campaign_id,f.env).current;
    return appendDevelopmentCampaignEvent({repo_root:f.root,campaign_id:f.intent.campaign_id,operation,expected_current_sha256:current.current_sha256,idempotency_key:id,observed_at:new Date().toISOString(),env:f.env});
  };
  if (groupCount === 1) {
    const correct = disposition === 'accepted_with_followups' ? 'complete_with_followups' : 'complete';
    expect(() => transition(correct === 'complete' ? 'complete_with_followups' : 'complete')).toThrow('differs from final audit');
    const terminal = transition(correct);
    expect(terminal.current.state).toBe(disposition === 'accepted_with_followups' ? 'completed_with_followups' : 'completed');
    expect(() => transition('prepare_group')).toThrow();
    expect(readDevelopmentCampaignStatus(f.root,f.intent.campaign_id,{}).current).toEqual(terminal.current);
    return;
  }
  expect(() => transition('complete_with_followups')).toThrow('all authorized groups');
  transition('prepare_group');
  let prompt = '';
  const consult = async (input: any) => {
    prompt=input.prompt;
    if(disposition==='accepted_with_followups') expect(prompt).toContain(JSON.stringify(result.observation.recommendation.findings));
    else expect(prompt).not.toContain('Preserve exact upstream finding');
    expect(prompt).toContain(snapshot.expected_final_main_sha);
    const sessionId=input.sessionId ? 'group2-continuation' : 'group2-initial';
    return {sessionId,status:'completed' as const,meta:campaignBrowserMetadata({repoRoot:f.root,sessionId,profileDir:input.profileDir,profileDirectory:input.profileDirectory,sourceSessionId:input.sessionId})};
  };
  const started=await startIssueBatchAuthoring({repo_root:f.root,campaign_id:f.intent.campaign_id,group_number:2,dry_run:true,env:f.env},{readBinding:f.binding,consult});
  expect(prompt).toStartWith('@github connector ');
  expect(started.intent.prompt_sha256).toBe(messageSha256(prompt.slice('@github connector '.length)));
  await continueIssueBatchAuthoring({repo_root:f.root,campaign_id:f.intent.campaign_id,group_number:2,intent_sha256:started.intent.intent_sha256,source_session_ref:started.session.session_ref,operation:'fill_missing',requested_slots:['02'],dry_run:true,env:f.env},{readBinding:f.binding,followup:consult});
  expect(prompt).toContain('only for these missing slots: 02');
},60000);

test('three-group real-store sequence carries each final SHA and refuses Group 4', async () => {
  const f = await fixture(true, 3);
  let intent = f.intent;
  const finals: string[] = [];
  let calls = 0;
  const transition = (operation: 'accept_group' | 'prepare_group' | 'start_group' | 'complete', group: number, evidence: string[] = []) => {
    const current = readDevelopmentCampaignStatus(f.root, intent.campaign_id, f.env).current;
    return appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: intent.campaign_id,
      expected_current_sha256: current.current_sha256, operation, idempotency_key: `chain-${group}-${operation}`,
      evidence_refs: evidence, observed_at: new Date().toISOString(), env: f.env });
  };
  for (const group of [1, 2, 3]) {
    if (group > 1) {
      transition('prepare_group', group);
      const started = await startIssueBatchAuthoring({ repo_root: f.root, campaign_id: intent.campaign_id, group_number: group, env: f.env }, {
        readBinding: f.binding, consult: async input => {
          expect(input.prompt).toContain(`at commit ${finals[group - 2]}`);
          const sessionId = `chain-author-${group}`;
          return { sessionId, status: 'completed' as const, meta: campaignBrowserMetadata({ repoRoot: f.root, sessionId,
            profileDir: input.profileDir, profileDirectory: input.profileDirectory }) };
        },
      });
      intent = started.intent;
      expect(intent.base_main_sha).toBe(finals[group - 2]);
      // Synthetic adoption/cleanup only: this regression proves group sequencing, not live delivery.
      const publication = installHistoricalAdoption({ ...f, intent, input: { ...f.input, group_number: group,
        intent_sha256: intent.intent_sha256, sprint_path: 'plans/sprints/repair.sprint.md', publication_policy_path: 'plans/policies/publication.json' } });
      transition('start_group', group);
      git(f.root, ['merge', '--ff-only', publication.materialized_commit]);
      const manifest = JSON.parse(git(f.root, ['show', `${publication.materialized_commit}:${publication.manifest_path}`]));
      withCampaignPlanningLock(f.root, intent, () => {
        for (const row of manifest.slots) persistPlanningRecord(f.root, intent, campaignCloseoutKey(row.task_id, 'complete'), {
          protocol: 1, kind: 'repo-harness-campaign-cleanup', disposition: 'not_planned',
          decision_sha256: canonicalMessageDigest({ group, task: row.task_id }), execution_topology: null,
          task_id: row.task_id, task_revision: 'c'.repeat(64),
        });
      });
    }
    const snapshot = buildCampaignGroupSnapshot(f.root, intent, f.env);
    finals.push(snapshot.expected_final_main_sha);
    const result = await runCampaignFreshAudit({ ...f.input, group_number: group, intent_sha256: intent.intent_sha256, idempotency_key: `chain-audit-${group}` }, {
      readBinding: f.binding, consult: async input => {
        calls++;
        const output = JSON.stringify({ protocol: 1, disposition: 'accepted', observed_main_sha: snapshot.expected_final_main_sha, slots: ['01', '02'], findings: [] });
        const history = structuredClone(historyFixture);
        const body = JSON.parse(history.response.body.replaceAll('example/canary', snapshot.provider_repository).replaceAll('a'.repeat(40), snapshot.expected_final_main_sha));
        body.messages[0].content.parts = [input.prompt]; body.messages[3].content.parts = [output];
        history.response.body = JSON.stringify(body); history.response.decodedBodySha256 = createHash('sha256').update(history.response.body).digest('hex');
        const sessionId = `chain-audit-${group}`, providerSessionId = `chain-provider-${group}`;
        const meta = campaignBrowserMetadata({ repoRoot: f.root, sessionId, profileDir: input.profileDir, profileDirectory: input.profileDirectory });
        return { sessionId, status: 'completed' as const, output, meta: { ...meta, providerSessionId,
          oracle: { observation: { source: 'oracle-session-metadata', sessionId: providerSessionId, parentSessionId: null,
            appSelection: { status: 'selected', app: 'GitHub', source: 'chatgpt-composer-pill', pluginId: 'plugin:connector_76869538009648d5b282a4bb21c3d157', capturedAt: new Date().toISOString() } },
            conversationCapture: { status: 'captured', sessionId: providerSessionId, conversationId: history.conversationId, sha256: 'sha256:' + 'f'.repeat(64), history } } } };
      },
    });
    expect(result.observation.disposition).toBe('accepted');
    transition('accept_group', group, [result.observation.observation_sha256]);
    if (group < 3) expect(() => transition('complete', group)).toThrow('all authorized groups');
  }
  expect(calls).toBe(3);
  expect(new Set(finals).size).toBe(3);
  expect(transition('complete', 3).current.state).toBe('completed');
  expect(() => transition('prepare_group', 4)).toThrow();
  const before = listIssueAuthoringSessions(f.root, intent.campaign_id, 3).length;
  await expect(startIssueBatchAuthoring({ repo_root: f.root, campaign_id: intent.campaign_id, group_number: 4, env: f.env }, {
    readBinding: f.binding, consult: async () => { throw new Error('Group 4 provider must not run'); },
  })).rejects.toThrow();
  expect(listIssueAuthoringSessions(f.root, intent.campaign_id, 3)).toHaveLength(before);
}, 60000);

test('start_group is refused before the group adoption and publication and leaves campaign state unchanged', async () => {
  const f = await templates.materialize('active', 1, undefined, {}, {},
    { group_count: 1, max_provider_calls: 20, max_provider_failures: 10, max_agent_turns: 30, max_runner_invocations: 30 });
  f.resetCalls();
  roots.push(f.root, f.home);
  const campaign = join(developmentCampaignStoreRoot(f.root), createHash('sha256').update(f.intent.campaign_id, 'utf8').digest('hex'));
  const facts = () => ({
    events: readdirSync(join(campaign, 'events')).length,
    transitions: readdirSync(join(campaign, 'transitions')).length,
    current: readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env).current.current_sha256,
  });
  const before = facts();
  const start = () => appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: f.intent.campaign_id, operation: 'start_group',
    expected_current_sha256: readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env).current.current_sha256,
    idempotency_key: 'guarded-start', observed_at: new Date().toISOString(), env: f.env });
  expect(start).toThrow('adoption');
  expect(facts()).toEqual(before);
  const publication = installHistoricalAdoption(f);
  expect(publication.materialized_commit).toBeTruthy();
  start();
  const after = facts();
  expect(after.events).toBe(before.events + 1);
  expect(after.transitions).toBe(before.transitions + 1);
  expect(readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env).current.state).toBe('group_running');
}, 60000);
