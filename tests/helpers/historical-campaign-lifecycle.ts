import { tmpdir } from 'os';
import { campaignContainerJournalRoot } from '../../src/effects/automation/campaign-container';
import { campaignSessionEvidence } from './campaign-browser-session';
import { buildContainmentSpec, type CampaignContainer } from '../../src/core/automation/campaign-containment';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { realpathSync } from 'fs';
import { campaignAttemptOutcome } from '../../src/core/automation/campaign-runtime';
import { reserveAutomationBudget } from '../../src/effects/automation/budget-store';
import { recordTaskAutomationAttemptStart } from '../../src/effects/engineers/automation-attempt-store';
import { bindCampaignWorker, type CampaignWorkerFinal, type CampaignWorkerChildObservation } from '../../src/effects/automation/campaign-worker';
import { campaignRuntimeRecordKey, type CampaignCodexInvocation } from '../../src/core/automation/campaign-runtime';
import { observeCampaignCodexTerminal } from '../../src/effects/automation/campaign-runtime';
import { readPlanningRecord } from '../../src/effects/automation/campaign-planning-store';
import { randomUUID } from 'crypto';
import { buildEngineerOfferCandidate, projectWorkGraph, validateWorkGraph } from '../../src/core/engineers/scheduling';
import { observeRetryEligibility } from '../../src/core/engineers/automation-attempt';
import { buildLeaseOwnerRecord } from '../../src/core/state/coordination-identity';
import { createLeaseDirectory, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { bindSprintCommand } from '../../src/effects/state/coordination-sprint';
import { writeClaimTokenForBoundLease } from '../../src/effects/state/coordination-claim-token';
import { buildClaimActorReceipt } from '../../src/core/engineers/principal-claim';
import { publishClaimActorReceipt, validateClaimActorReceiptLive } from '../../src/effects/engineers/claim-actor-store';
import { validateFleetWorkEnvelope, type WorkEnvelopeV1 } from '../../src/effects/fleet/acquire';
import { renewLeaseLiveness } from '../../src/effects/state/coordination-lease-liveness-store';
import { buildIssueBatchAdoption } from '../../src/core/automation/issue-batch-adoption';
import { buildConnectorChallenge } from '../../src/core/automation/connector-challenge';
import { buildPlanningJob, validatePlanningResult } from '../../src/core/automation/campaign-planning';
import { canonicalMessageDigest } from '../../src/core/messages/mechanics';
import { publishIssueBatch } from '../../src/effects/automation/issue-batch-publication';
import { listIssueAuthoringSessions, persistIssueBatchAdoptionArtifact, withIssueBatchSealSources } from '../../src/effects/automation/issue-batch-store';
import { ensureCampaignAuthoringBudget, sealCampaignAuthoringBudget, readCampaignAuthoringReadonlyContinuation, verifyCampaignAuthoringReadonlyContinuation } from '../../src/effects/automation/budget-store';
import { persistPlanningRecord } from '../../src/effects/automation/campaign-planning-store';
import { requireCampaignPlanningAuthority, planningProtectionDigest, planningResultKey, validateAdmissionEvidence } from '../../src/effects/automation/campaign-planning-proof';
import { readCanonicalTaskPlanProof } from '../../src/effects/state/coordination-canonical-source';
import { bindExternalSource } from '../../src/effects/external-sources/binding';
import { createHash } from 'crypto';
import { buildProviderIssueObservation, buildExternalSourceRefreshReceipt } from '../../src/core/external-sources/issue-observation';
import { runCampaignPlanningPreflight } from '../../src/cli/commands/campaign';
import { makeSnapshot, policy as publicationPolicy } from '../helpers/issue-batch-adoption-fixture';
import type { WorkPackageRetryPolicyV1 } from '../../src/core/engineers/scheduling';
import { buildExternalSourceProjection } from '../../src/core/external-sources/projection';
import { writeProviderIssueObservation, writeExternalSourceRefreshReceipt } from '../../src/effects/external-sources/store';
import { bindEngineer, readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { enrollEngineerPrincipal } from '../../src/effects/engineers/principal-store';
import { resolveEngineerPrincipal } from '../../src/effects/engineers/principal';
import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createAdoptionRepository } from '../helpers/campaign-adoption-repository';
import { projectCanonicalTasks } from '../../src/core/state/coordination-identity';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';
import { processSprintDependencies } from '../../src/effects/state/coordination-sprint';
import { readLease } from '../../src/effects/state/coordination-lease-store';
import { buildLeaseLivenessPolicy } from '../../src/core/state/lease-liveness';

const sprint = 'plans/sprints/repair.sprint.md';
const git = (root: string, args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export async function historicalPlanningFixture(twoEngineers = false, requiredReview = false, retryPolicy?: WorkPackageRetryPolicyV1, grantLiveness = true, budgetLimits: { max_agent_turns?: number; max_runner_invocations?: number; max_provider_failures?: number } = {}, nonReproducible = false, planningOnly = false, verifiedRevision = false) {
  const capability = 'capability.runtime-harness.fixture';
  const inventory = JSON.stringify({ ...JSON.parse(readFileSync(join(import.meta.dir, '../../.ai/harness/campaign-protection.json'), 'utf8')), capabilities: [] });
  const otherCapability = 'capability.runtime-harness.second';
  const files: Record<string, string> = { '.ai/harness/campaign-protection.json': inventory };
  if (retryPolicy) files['plans/policies/publication.json'] = JSON.stringify({ ...publicationPolicy, retry_policy: retryPolicy });
  if (twoEngineers) {
    files['src/second/index.ts'] = 'export {};';
    files['.archcontext/model/nodes/second.yaml'] = JSON.stringify({ schemaVersion: 'archcontext.node/v2', id: otherCapability, kind: 'capability', name: 'Second', status: 'active', summary: 'Second fixture capability', responsibilities: ['Own second fixture'], source: { include: ['src/second/**'] }, extensions: { contractFiles: { agents: 'AGENTS.md', claude: 'CLAUDE.md' }, lspProfile: 'typescript-lsp', verification: [] } });
  }
  const f = await createAdoptionRepository('active', 1, capability, {}, files, { ...budgetLimits, verified_revision: verifiedRevision, max_parallel_tasks: twoEngineers ? 1 : 2, ...(retryPolicy ? { max_successful_acquisitions: 3 } : {}),
    ...(grantLiveness ? { liveness_policy: buildLeaseLivenessPolicy({ renewal_interval_ms: 1000, maximum_ttl_ms: 6000, renewal_actor_kind: 'controller', required_evidence_sources: ['controller', 'runtime_effect', 'publication', 'binding'], unproven_behavior: 'require_attention' }) } : {}) }, process.platform === 'linux' ? '/var/tmp' : tmpdir());
  mkdirSync(join(f.root, 'tests'), {recursive:true});
  let snapshot = makeSnapshot(f.intent, undefined, { primary_capability: capability });
  if (twoEngineers) {
    const observations = snapshot.observations.map((o, index) => {
      if (index === 0) return o;
      const { protocol, kind, source_revision, observation_sha256, ...input } = o;
      return buildProviderIssueObservation({ ...input, body: input.body.replace(capability, otherCapability).replace('src/index.ts', 'src/second/index.ts') });
    });
    snapshot = { observations, receipt: buildExternalSourceRefreshReceipt({ ...snapshot.receipt, source_revisions: observations.map(o => o.source_revision).sort() }) };
  }
  const publication = installHistoricalAdoption(f, snapshot, twoEngineers ? [capability, otherCapability] : [capability]);
  git(f.root, ['merge', '--ff-only', publication.materialized_commit]);
  cpSync(join(import.meta.dir, '../../assets/templates/helpers'), join(f.root, 'scripts'), { recursive: true });
  writeFileSync(join(f.root, 'package.json'), '{"scripts":{"test":"bun test"}}\n');
  const profile = JSON.parse(readFileSync(join(import.meta.dir, '../../agents/engineers/profiles/verification-evals-checks.json'), 'utf8'));
  profile.engineer_id = `engineer:${capability}`; profile.capability_id = capability; profile.sop_ref = 'agents/engineers/sops/fixture.md'; profile.max_active_claims = 2;
  for (const directory of ['agents/engineers/profiles', 'agents/engineers/sops', '.ai/harness/sprint', '.claude/templates', 'tasks/contracts', 'tasks/reviews', 'tasks/evidence']) mkdirSync(join(f.root, directory), { recursive: true });
  cpSync(join(import.meta.dir, '../../assets/templates/contract.template.md'), join(f.root, '.claude/templates/contract.template.md'));
  writeFileSync(join(f.root, 'agents/engineers/profiles/fixture.json'), JSON.stringify(profile));
  writeFileSync(join(f.root, profile.sop_ref), '# Fixture Engineer');
  writeFileSync(join(f.root, '.ai/harness/sprint/active-sprint'), sprint);
  writeFileSync(join(f.home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [{ id: f.intent.repository_id, path: f.root, accessMode: 'read_write', source: 'manual', registeredAt: '2026-09-05T00:00:00Z', lastSeenAt: '2026-09-05T00:00:00Z' }] }));
  if (twoEngineers) {
    writeFileSync(join(f.root, 'agents/engineers/profiles/second.json'), JSON.stringify({ ...profile, engineer_id: `engineer:${otherCapability}`, capability_id: otherCapability }));
  }
  git(f.root, ['add', '.']); git(f.root, ['commit', '-qm', 'execution fixture']);
  const resolved = loadEngineerProfile(f.root, profile.engineer_id);
  bindEngineer(f.root, { engineer_id: profile.engineer_id, idempotency_key: 'bind', provider: 'codex', provider_thread_id: 'worker-thread', host_id: 'local', engineer_contract_revision: resolved.engineer_contract_revision,
    expected_current_digest: null, expected_binding_generation: 0, expected_binding_id: null, expected_engineer_contract_revision: resolved.engineer_contract_revision });
  const binding = readEngineerBindingStatus(f.root, profile.engineer_id, resolved.engineer_contract_revision).binding!;
  const authorization = '22222222-2222-4222-8222-222222222222';
  enrollEngineerPrincipal({ repository_id: f.intent.repository_id, authorization_id: authorization, binding, created_at: '2026-09-05T00:00:00Z', env: f.env });
  const secondAuthorization = '33333333-3333-4333-8333-333333333333';
  if (twoEngineers) {
    const second = loadEngineerProfile(f.root, `engineer:${otherCapability}`);
    bindEngineer(f.root, { engineer_id: second.profile.engineer_id, idempotency_key: 'bind-second', provider: 'codex', provider_thread_id: 'second-worker-thread', host_id: 'local', engineer_contract_revision: second.engineer_contract_revision,
      expected_current_digest: null, expected_binding_generation: 0, expected_binding_id: null, expected_engineer_contract_revision: second.engineer_contract_revision });
    const secondBinding = readEngineerBindingStatus(f.root, second.profile.engineer_id, second.engineer_contract_revision).binding!;
    enrollEngineerPrincipal({ repository_id: f.intent.repository_id, authorization_id: secondAuthorization, binding: secondBinding, created_at: '2026-09-05T00:00:00Z', env: f.env });
  }

  const input = { repo_root: f.root, campaign_id: f.intent.campaign_id, group_number: 1, intent_sha256: f.intent.intent_sha256, host: 'codex' as const, session_id: 'parent', authorization_id: authorization, idempotency_key: 'execute', env: f.env };
  const deps = { preflight: runCampaignPlanningPreflight, refresh: () => {
    const observations = snapshot.observations.map(o => writeProviderIssueObservation(f.root, o));
    writeExternalSourceRefreshReceipt(f.root, snapshot.receipt);
    return { receipt: snapshot.receipt, projection: buildExternalSourceProjection({ registered_repository_id: f.intent.repository_id, observations, receipts: [snapshot.receipt] }) };
  } };
  deps.refresh();
  const authority = requireCampaignPlanningAuthority(f.root, f.intent, f.env);
  const tasks = projectCanonicalTasks({ repoIdentity: resolveRepoIdentity(f.root), sprintPath: sprint, sprintText: readFileSync(join(f.root, sprint), 'utf8') });
  persistPlanningRecord(f.root, f.intent, 'parent', { host: input.host, session_id: input.session_id });
  for (let index = 0; index < 2; index++) {
    const slot = authority.manifest.slots[index]!;
    const task = tasks.find(t => t.task_id === slot.task_id)!;
    const issue = authority.manifest.receipt.issues.find(i => i.slot === slot.slot)!;
    const observation = snapshot.observations.find(o => o.observation_sha256 === issue.source_observation_sha256)!;
    const job = buildPlanningJob({ campaign_id: f.intent.campaign_id, group_number: f.intent.group_number, intent_sha256: f.intent.intent_sha256,
      publication_sha: publication.materialized_commit, protection_sha256: planningProtectionDigest(f.root, authority.target), task_id: task.task_id, task_revision: task.task_revision,
      sprint_path: sprint, source_ref: `sprint:${sprint}#${task.row.task}`, source_revision: observation.source_revision, observation_sha256: observation.observation_sha256,
      host: input.host, session_id: input.session_id, issue_kind: issue.issue_kind });
    persistPlanningRecord(f.root, f.intent, task.task_id, job);
    if (planningOnly) continue;
    if (nonReproducible) {
      const result = validatePlanningResult({ job_sha256: job.job_sha256, outcome: 'not_reproducible', explanation: 'Local observation contradicts the Issue claim.', surfaces: null, characterization: null });
      persistPlanningRecord(f.root, f.intent, planningResultKey(task.task_id), { job, result, proof: null, binding_id: null, evidence: [] });
      continue;
    }
    const plan = `plans/plan-repair-${index}.md`; const contract = `tasks/contracts/repair-${index}.contract.md`;
    const review = requiredReview ? 'tasks/reviews/required-review.md' : `tasks/reviews/repair-${index}.review.md`;
    writeFileSync(join(f.root, review), '# Authored review\n');
    const source = twoEngineers && index === 1 ? 'src/second/index.ts' : 'src/index.ts';
    const guard = `tests/guard-${index}.test.ts`; const evidence = `tasks/evidence/pre-${index}.txt`;
    writeFileSync(join(f.root, guard), 'import { expect, test } from "bun:test";\ntest("guard", () => expect(true).toBe(true));\n'); writeFileSync(join(f.root, evidence), `${guard}\nPRE_FIX_EXIT=1\n`);
    writeFileSync(join(f.root, plan), ['# Plan: repair', '> **Status**: Approved', `> **Source Ref**: ${job.source_ref}`, '> **Artifact Level**: work-package', '> **Promotion Reason**: verification_boundary', '> **Verification Boundary**: exact local plan proof', '> **Rollback Surface**: revert repair', `> **Task Contract**: ${contract}`, '', '## Promotion Gate', ...['Merge/PR unit','Rollback surface','Verification boundary','Review/acceptance boundary','High-risk surface','Why not checklist row'].map(k => `- **${k}**: exact repair boundary`), '', '## Evidence Contract', ...['State/progress path','Verification evidence','Evaluator rubric','Stop condition','Rollback surface'].map(k => `- **${k}**: bounded repair fixture`)].join('\n'));
    writeFileSync(join(f.root, contract), `# Contract\n> **Plan**: ${plan}\n> **Task Profile**: bugfix\n> **Review File**: ${review}\n\n## Goal\nRepair the observed empty-input behavior.\n\n## Why\nMissing validation lets the defect recur.\n\n## Scope\n- In scope: local empty-input guard.\n- Out of scope: other behavior.\n\n## Allowed Paths\n\n\`\`\`yaml\nallowed_paths:\n  - ${source}\n  - ${guard}\n\`\`\`\n\n## Evidence Requirements\n\`\`\`yaml\nevidence_requirements:\n  benchmark: not_applicable\n\`\`\`\n\n## Root Cause Evidence\n- root_cause: src/index.ts:1 accepts empty input.\n- repro: bun test ${guard}\n- regression_guard: ${guard}\n- pre_fix_failure_artifact: ${evidence}\n\n## Exit Criteria\n\`\`\`yaml\nexit_criteria:\n  files_exist:\n    - ${guard}\n\`\`\`\n\n## Verification Plan\n\`\`\`json\n{"protocol":1,"checks":[{"id":"guard-${index}","kind":"package_test","path":"${guard}","cwd":".","phase":"verification","cost":"normal","evidence_policy":"current_exact","necessity":"Covers the root cause guard.","inputs":{"env":[]}}]}\n\`\`\`\n`);
    const proof = readCanonicalTaskPlanProof(f.root, { sprintPath: sprint, taskCell: task.row.task });
    if (!proof.ok) throw new Error(proof.error);
    const preflight = deps.preflight(f.root, proof.proof.contract_path);
    if (!preflight.ok) throw new Error('historical fixture preflight failed');
    const result = validatePlanningResult({ job_sha256: job.job_sha256, outcome: 'plan_ready', explanation: 'Synthetic historical admission.', surfaces: { paths: [source, guard], cli_commands: [], mcp_tools: [], public_exports: [], protocol_kinds: [], capability_nodes: [] }, characterization: null });
    const binding = bindExternalSource({ registered_repository_id: f.intent.repository_id, source_revision: job.source_revision, sprint_path: sprint, task_id: task.task_id, target_ref: f.intent.target_ref, env: f.env });
    const admission = { job, result, proof: proof.proof, binding_id: binding.binding_id, evidence: [...preflight.evidence] };
    validateAdmissionEvidence(f.root, admission);
    persistPlanningRecord(f.root, f.intent, planningResultKey(task.task_id), admission);
  }
  if (!nonReproducible && !planningOnly) { git(f.root, ['add', '.']); git(f.root, ['commit', '-qm', 'ready plans']); }
  return { ...f, executeInput: input, secondAuthorization };
}

/** Synthetic historical state, never evidence that current active admission succeeds. */
export function installHistoricalAdoption(f: Awaited<ReturnType<typeof createAdoptionRepository>>, snapshot = makeSnapshot(f.intent, undefined, { primary_capability: 'capability.runtime-harness.fixture' }), capabilities = ['capability.runtime-harness.fixture']) {
  const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env }).budget;
  const binding = { repo_root: f.root, automation_run_id: budget.automation_run_id, expected_budget_sha256: budget.budget_sha256, campaign_id: f.intent.campaign_id,
    group_number: f.intent.group_number as 1 | 2 | 3, intent_sha256: f.intent.intent_sha256, env: f.env };
  const terminal = withIssueBatchSealSources(f.root, f.intent, { source_revisions: snapshot.observations.map(o => o.source_revision).sort() },
    () => readCampaignAuthoringReadonlyContinuation(binding)?.terminal ?? null, () => sealCampaignAuthoringBudget({ ...binding, reason: 'authoring_completed' }));
  const continuation = verifyCampaignAuthoringReadonlyContinuation({ ...binding, terminal });
  const session = listIssueAuthoringSessions(f.root, f.intent.campaign_id, f.intent.group_number, f.intent.intent_sha256).find(s => s.operation === 'initial')!;
  const source = execFileSync('git', ['show', `${f.intent.base_main_sha}:src/index.ts`], { cwd: f.root });
  const challenge = buildConnectorChallenge({ intent_sha256: f.intent.intent_sha256, base_main_sha: f.intent.base_main_sha, source_session_ref: session.session_ref, source_provider_session_ref: session.browser_evidence!.provider_session_ref,
    targets: [{kind:'directory_entries',path:'src',line:null,expected:git(f.root,['ls-tree','--name-only',`${f.intent.base_main_sha}:src`])},
      {kind:'text_line',path:'src/index.ts',line:1,expected:source.toString().split('\n')[0]!},
      {kind:'file_sha256',path:'src/index.ts',line:null,expected:createHash('sha256').update(source).digest('hex')}] });
  const input = { intent: f.intent, session, terminal, authorization_sha256: f.authorization.authorization_sha256,
    snapshot: { snapshot_receipt: snapshot.receipt, observations: snapshot.observations }, capability_ids: capabilities, challenge,
    challenge_response: JSON.stringify({base_main_sha:f.intent.base_main_sha,answers:challenge.targets.map(t=>t.expected)}), response_session_ref:'historical-challenge',response_session_evidence:campaignSessionEvidence('historical-challenge', session.session_ref, session.browser_evidence!.repo_root, session.browser_evidence!.profile_dir, session.browser_evidence!.profile_directory) };
  const adopted = buildIssueBatchAdoption(input);
  const policy = JSON.parse(readFileSync(join(f.root, f.input.publication_policy_path), 'utf8'));
  persistIssueBatchAdoptionArtifact(f.root,f.intent,'adoption',{input,sprint_path:sprint,publication_policy:policy,readonly_continuation:continuation});
  return publishIssueBatch({repo_root:f.root,intent:f.intent,receipt:adopted.receipt,sprint_path:sprint,policy,
    evidence:{terminal_sha256:terminal.terminal_sha256,challenge_receipt_sha256:adopted.challenge_receipt.receipt_sha256}});
}

/** Construct a pre-existing bound Claim, never call a current admission API. */
export function installHistoricalBoundDispatch(f: Pick<Awaited<ReturnType<typeof historicalPlanningFixture>>, 'root' | 'home' | 'env' | 'intent' | 'authorization' | 'executeInput' | 'secondAuthorization'>, index = 0) {
  const tasks = projectCanonicalTasks({ repoIdentity: resolveRepoIdentity(f.root), sprintPath: sprint, sprintText: readFileSync(join(f.root, sprint), 'utf8') });
  const graph = projectWorkGraph(validateWorkGraph(JSON.parse(readFileSync(join(f.root, 'plans/sprints/repair.work-graph.v1.json'), 'utf8'))),
    tasks.map((t,i)=>({task_id:t.task_id,task_revision:t.task_revision,task_ref:t.row.task,status:t.row.status,row_order:i+1})));
  const item = graph.work_packages[index]!;
  const task = tasks.find(t=>t.task_id===item.task_id)!;
  const proof = readCanonicalTaskPlanProof(f.root,{sprintPath:sprint,taskCell:task.row.task});
  if(!proof.ok) throw new Error(proof.error);
  const authorization = index === 1 && item.primary_capability.endsWith('.second') ? f.secondAuthorization : f.executeInput.authorization_id;
  const principal = resolveEngineerPrincipal({repo_root:f.root,authorization_id:authorization,env:f.env});
  const profile = loadEngineerProfile(f.root,principal.engineer_id);
  const binding = readEngineerBindingStatus(f.root,principal.engineer_id,profile.engineer_contract_revision);
  const revision = canonicalMessageDigest({historical:task.task_id});
  const candidate = buildEngineerOfferCandidate({graph,work_package:item,
    engineer:{engineer_id:principal.engineer_id,capability_id:profile.profile.capability_id,engineer_contract_revision:profile.engineer_contract_revision,max_active_claims:profile.profile.max_active_claims},
    binding:{state:'active',binding_id:binding.current.current_binding_id,binding_generation:binding.current.binding_generation},
    fleet_offer:{execution_readiness:'execution_ready',snapshot_consistency:'stable',task_id:task.task_id,task_revision:task.task_revision,offer_revision:revision,authorization_revision:1},
    dependencies:[],concurrency_available:true,concurrency_revision:revision,active_claims:0,
    retry:observeRetryEligibility({policy:item.retry_policy,current:null,work_package_revision:item.work_package_revision,observed_at:new Date().toISOString()})});
  if(!candidate.eligible) throw new Error(JSON.stringify(candidate.exclusion));
  const claim = randomUUID(); const branch = `codex/historical-${claim}`; const worktree = join(f.home,`execution-${claim}`);
  git(f.root,['worktree','add','-q','-b',branch,worktree]);
  const owner = buildLeaseOwnerRecord({claimId:claim,taskId:task.task_id,taskRevision:task.task_revision,sprintPath:sprint,targetRef:"main",generation:1,sessionId:f.executeInput.session_id,sourceWorktree:f.root});
  createLeaseDirectory(f.root,task.task_id);writeLeaseOwnerDurably(f.root,task.task_id,owner);
  const bound = bindSprintCommand({claimId:claim,worktree,branch,unitRef:proof.proof.plan_path},processSprintDependencies(f.root));
  if(bound.exitCode!==0) throw new Error(bound.stderr||bound.stdout);
  const token = writeClaimTokenForBoundLease(f.root,{task_id:task.task_id,claim_id:claim,worktree,sprint,task:task.row.task,unit_ref:proof.proof.plan_path});
  const envelope: WorkEnvelopeV1 = {protocol:1,kind:'repo-harness-work-envelope',repo_id:f.intent.repository_id,task_id:task.task_id,task_revision:task.task_revision,sprint_path:sprint,
    claim_id:claim,generation:1,worktree_path:worktree,branch,unit_ref:proof.proof.plan_path,authorization_revision:1,offer_revision:revision,
    canonical_target:{ref:f.intent.target_ref,oid:git(f.root,['rev-parse',f.intent.target_ref])},plan:proof.proof,claim_token:token};
  validateFleetWorkEnvelope(f.root,envelope,f.env);
  const receipt=publishClaimActorReceipt(f.root,buildClaimActorReceipt({envelope,principal,session_id:f.executeInput.session_id,bound_at:new Date().toISOString()}));
  validateClaimActorReceiptLive(f.root,receipt,envelope);
  const acquired={ok:true as const,offer:candidate.offer,envelope,receipt};
  const dispatch=canonicalMessageDigest({operation:'campaign-worker',intent:f.intent.intent_sha256,claim,generation:1});
  const selector={repo_root:f.root,campaign_id:f.intent.campaign_id,group_number:1,intent_sha256:f.intent.intent_sha256,dispatch_id:dispatch};
  const handoff={selector,host:f.executeInput.host,session_id:f.executeInput.session_id,authorization_id:authorization,acquired};
  persistPlanningRecord(f.root,f.intent,canonicalMessageDigest({dispatch,part:'handoff'}).slice(7),handoff);
  const policy=f.authorization.campaign!.liveness_policy;
  if(policy) renewLeaseLiveness({repo_root:f.root,owner:readLease(f.root,task.task_id).record!,policy,owner_id:dispatch,observed_at:new Date().toISOString(),requested_ttl_ms:policy.maximum_ttl_ms,
    binding_generation:candidate.offer.binding_generation,runtime_effect_id:canonicalMessageDigest({dispatch_id:dispatch,role:'worker'}),expected_current_sha256:null});
  return {action:'dispatch' as const,envelope,receipt,worker_handoff:selector,acquired,handoff,instructions:[]};
}

export function installHistoricalAttempt(f: Pick<Awaited<ReturnType<typeof historicalPlanningFixture>>, 'root' | 'intent' | 'authorization' | 'env'>, d: ReturnType<typeof installHistoricalBoundDispatch>, provider: 'codex-exec' | null = 'codex-exec') {
  const {offer,envelope:work}=d.acquired; const selector=d.worker_handoff;
  const budget=ensureCampaignAuthoringBudget({repo_root:f.root,authorization:f.authorization,env:f.env}).budget;
  const request={dispatch_id:selector.dispatch_id,contract_sha256:d.envelope.plan.contract_sha256.slice(7),worker_command:provider?'codex-exec:worker':'worker',verifier_command:provider?'codex-exec:verifier':'verifier',...(provider?{provider}:{})};
  const started_at=new Date().toISOString();
  const reservation=reserveAutomationBudget({repo_root:f.root,automation_run_id:budget.automation_run_id,expected_budget_sha256:budget.budget_sha256,
    idempotency_key:canonicalMessageDigest({dispatch:selector.dispatch_id,part:'attempt'}).slice(7),operation:'dispatch_attempt',unit_kind:'execute',unit_id:offer.work_package_id,attempt:1,provider:provider?'codex':null,env:f.env});
  persistPlanningRecord(f.root,f.intent,canonicalMessageDigest({dispatch:selector.dispatch_id,part:'launch'}).slice(7),{request,started_at});
  recordTaskAutomationAttemptStart({repo_root:f.root,repository_id:offer.repository_id,sprint_path:offer.sprint_path,task_id:work.task_id,task_revision:work.task_revision,
    work_package_id:offer.work_package_id,work_package_revision:offer.work_package_revision,engineer_id:offer.engineer_id,binding_generation:offer.binding_generation,
    claim_id:work.claim_id,lease_generation:work.generation,controller_run_id:`sha256:${budget.automation_run_id}`,dispatch_id:selector.dispatch_id,budget_revision:`sha256:${budget.budget_sha256}`,
    policy:offer.retry_policy,first_eligible_at:offer.eligible_since,started_at});
  return {reservation,request};
}

/** Modeled protected host facts for lifecycle unit tests; never production admission or Docker acceptance. */
export async function prepareHistoricalCodexInvocation(input: Parameters<typeof import('../../src/effects/automation/campaign-runtime').prepareCampaignCodexInvocation>[0]): Promise<CampaignCodexInvocation> {
  const worktree = realpathSync(input.worktree), common = resolveGitCommonDirectory(worktree);
  const profile_ref = `.codex/agents/${input.identity.role === 'worker' ? 'fast-worker' : 'gatekeeper'}.toml`;
  const bytes = readFileSync(join(input.repo_root, profile_ref)); const profile = Bun.TOML.parse(bytes.toString()) as Record<string, unknown>;
  const prompt = readFileSync(join(worktree, input.prompt_path));
  const sha = (v: string | Buffer) => `sha256:${createHash('sha256').update(v).digest('hex')}`;
  const argv = ['exec', '--json', '--ephemeral', '--ignore-user-config', '--strict-config', '--sandbox', 'danger-full-access', '--model', String(profile.model), '-c', 'model_reasoning_effort="high"', '-c', 'developer_instructions="Fixture role"', prompt.toString()];
  const image = 'sha256:' + 'c'.repeat(64);
  const make = (probe: boolean): CampaignContainer => {
    const directory = join(campaignContainerJournalRoot(), randomUUID()); mkdirSync(directory, { recursive: true });
    const expected = buildContainmentSpec({ image, image_env: [], worktree, common, argv: ['/usr/local/bin/codex', ...(probe ? ['--version'] : argv)],
      deadline: input.deadline_ms, uid: 1000, gid: 1000, writable: !probe && input.identity.role === 'worker', probe });
    const request = { identity: probe ? { ...input.identity, phase: 'version' } : input.identity, deadline_ms: input.deadline_ms, expected, endpoint: 'unix:///modeled-fixture.sock', daemon_id: 'modeled-fixture' };
    const request_sha256 = canonicalMessageDigest(request);
    const handle: CampaignContainer = { protocol: 1, directory, endpoint: request.endpoint, daemon_id: request.daemon_id, image, container_id: sha(directory).slice(7), request_sha256, configuration_sha256: sha('modeled configuration') };
    writeFileSync(join(directory, 'request.json'), JSON.stringify({ ...request, request_sha256 }));
    writeFileSync(join(directory, 'created.json'), JSON.stringify(handle)); return handle;
  };
  const container = make(false), probeContainer = make(true);
  const stdout = 'codex-cli 1.0.0\n';
  const receipt_sha256 = modeledContainerTerminal(probeContainer, stdout, '', { exit_code: 0, output_complete: true, termination_cause: 'completed', started: true });
  const body = { protocol: 2 as const, kind: 'repo-harness-campaign-codex-invocation' as const, identity: input.identity, executable: '/usr/local/bin/codex', executable_version: stdout.trim(),
    container, probe: { container: probeContainer, receipt_sha256, stdout, stderr: '' }, deadline_ms: input.deadline_ms,
    profile_ref, profile_sha256: sha(bytes), prompt_sha256: sha(prompt), model: String(profile.model), sandbox: 'danger-full-access' as const,
    workspace_access: input.identity.role === 'worker' ? 'read-write' as const : 'read-only' as const, argv };
  return { ...body, invocation_sha256: canonicalMessageDigest(body) };
}
export function modeledContainerTerminal(handle: CampaignContainer, stdout: string, stderr: string, observation: { exit_code: number | null; output_complete?: boolean; termination_cause?: string; started?: boolean }): string {
  const body = { protocol: 1, handle, started: observation.started !== false, termination_cause: observation.termination_cause ?? 'completed', exit_code: observation.exit_code,
    daemon_state: { Running: false, Pid: 0, Dead: false, Restarting: false, Status: 'exited' }, restart_count: 0, inactive: true,
    output_complete: observation.output_complete === true, stdout_sha256: canonicalMessageDigest({ bytes: stdout }), stderr_sha256: canonicalMessageDigest({ bytes: stderr }) };
  const receipt_sha256 = canonicalMessageDigest(body); writeFileSync(join(handle.directory, 'terminal.json'), JSON.stringify({ ...body, receipt_sha256 })); return receipt_sha256;
}

export function installHistoricalChild(f: Pick<Awaited<ReturnType<typeof historicalPlanningFixture>>, 'root' | 'intent' | 'authorization' | 'env'>, d: ReturnType<typeof installHistoricalBoundDispatch>, invocation: CampaignCodexInvocation, observation: CampaignWorkerChildObservation) {
  const dispatch=d.worker_handoff.dispatch_id; const role=observation.role;
  if(invocation.identity.dispatch_id!==dispatch || invocation.identity.claim_id!==d.envelope.claim_id || invocation.identity.role!==role) throw new Error('historical child identity differs');
  const output = readFileSync(join(d.envelope.worktree_path, observation.stdout_path), 'utf8');
  // The detached-host negative fixture deliberately has no container evidence.
  if (!output.includes('command_execution')) observation = { ...observation, container_receipt_sha256: modeledContainerTerminal(invocation.container, output,
    readFileSync(join(d.envelope.worktree_path, observation.stderr_path), 'utf8'), observation) };
  const terminal=observeCampaignCodexTerminal({invocation,worktree:d.envelope.worktree_path,...observation});
  persistPlanningRecord(f.root,f.intent,campaignRuntimeRecordKey(dispatch,role,'intent'),invocation);
  persistPlanningRecord(f.root,f.intent,campaignRuntimeRecordKey(dispatch,role,'started'),{invocation_sha256:invocation.invocation_sha256,identity:invocation.identity});
  persistPlanningRecord(f.root,f.intent,campaignRuntimeRecordKey(dispatch,role,'terminal'),terminal);
  persistPlanningRecord(f.root,f.intent,canonicalMessageDigest({dispatch,part:`child-${role}`}).slice(7),{observation,stdout_sha256:createHash('sha256').update(readFileSync(join(d.envelope.worktree_path,observation.stdout_path))).digest('hex'),stderr_sha256:createHash('sha256').update(readFileSync(join(d.envelope.worktree_path,observation.stderr_path))).digest('hex')});
  return terminal;
}

export function installHistoricalFinal(f: Pick<Awaited<ReturnType<typeof historicalPlanningFixture>>, 'root' | 'intent' | 'authorization' | 'env'>, d: ReturnType<typeof installHistoricalBoundDispatch>, attempt: ReturnType<typeof installHistoricalAttempt>, resultPath='final.json', settle=true, contract_run: CampaignWorkerFinal['contract_run'] = {status:'pass',failure_class:null}) {
  const dispatch=d.worker_handoff.dispatch_id; const worktree=d.envelope.worktree_path;
  const bytes=readFileSync(join(worktree,resultPath)); const result=JSON.parse(bytes.toString()) as {outcome:CampaignWorkerFinal['outcome'];evidence_paths:string[]};
  const evidence=result.evidence_paths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(join(worktree,path))).digest('hex')}));
  const result_sha256=createHash('sha256').update(bytes).digest('hex');
  const child=(role:string)=>readPlanningRecord<{observation:CampaignWorkerChildObservation}>(f.root,f.intent,canonicalMessageDigest({dispatch,part:`child-${role}`}).slice(7));
  const worker=child('worker'),verifier=child('verifier');
  const final:CampaignWorkerFinal={reservation:attempt.reservation,contract_run,outcome:campaignAttemptOutcome(result.outcome,contract_run),ended_at:new Date().toISOString(),result_sha256,evidence,
    runtime_effect_id:canonicalMessageDigest({request:attempt.request,contract_run,worker,verifier,result_sha256}),
    evidence_refs:[canonicalMessageDigest({result_sha256,evidence}),...[worker,verifier].filter(x=>x!==null).map(x=>canonicalMessageDigest({...x.observation}))]};
  persistPlanningRecord(f.root,f.intent,canonicalMessageDigest({dispatch,part:'final'}).slice(7),final);
  if(settle) bindCampaignWorker({selector:d.worker_handoff,worktree,contract:d.envelope.plan.contract_path,worker_command:attempt.request.worker_command,verifier_command:attempt.request.verifier_command,...('provider' in attempt.request?{provider:attempt.request.provider}:{}),env:f.env});
  return final;
}
