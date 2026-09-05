import { canonicalMessageBytes, canonicalMessageDigest, messageSha256 } from '../../core/messages/mechanics';
import { buildPlanningJob, CampaignPlanningError, rejectPlannedFeatures, validatePlanningResult, type CampaignPlanningJob, type CampaignPlanningResultInput, type PlanningArtifact } from '../../core/automation/campaign-planning';
import type { IssueBatchAdoptionInput } from '../../core/automation/issue-batch-adoption';
import { renderExternalSourceUntrustedContext } from '../../core/external-sources/binding';
import { projectCanonicalTasks } from '../../core/state/coordination-identity';
import { readCanonicalSprint, readCanonicalTaskPlanProof, resolveRepoIdentity } from '../state/coordination-canonical-source';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { collectRepoTaskOffers } from '../fleet/acquire';
import { bindExternalSource, externalSourceContext } from '../external-sources/binding';
import { refreshExternalSource } from '../external-sources/refresh';
import { readCampaignExternalSourcesPolicyAtRevision } from './development-campaign-policy';
import { readIssueBatchIntent, readIssueBatchAdoptionArtifact } from './issue-batch-store';
import { readPlanningRecord, persistPlanningRecord, withCampaignPlanningLock } from './campaign-planning-store';
import { planningProtectionDigest, planningArtifactBytes, planningResultKey, requireCampaignPlanningAuthority, rejectProtectedPlanning, validateAdmissionEvidence, type PlanningAdmission } from './campaign-planning-proof';

export interface CampaignPlanningStepInput {
  readonly repo_root: string;
  readonly campaign_id: string;
  readonly group_number: number;
  readonly intent_sha256: string;
  readonly host: 'claude' | 'codex';
  readonly session_id: string;
  readonly idempotency_key: string;
  readonly result?: unknown;
  readonly env?: NodeJS.ProcessEnv;
}
export interface CampaignPlanningDependencies {
  /** The CLI invokes the installed read-only contract preflight; the controller never plans. */
  readonly preflight: (root: string, contractPath: string) => { readonly ok: boolean; readonly task_profile: string; readonly evidence: readonly PlanningArtifact[] };
  readonly refresh?: typeof refreshExternalSource;
}
export function runCampaignPlanningStep(input: CampaignPlanningStepInput, deps: CampaignPlanningDependencies) {
  const root = input.repo_root; const env = input.env ?? process.env;
  const intent = readIssueBatchIntent(root, input.campaign_id, input.group_number, input.intent_sha256);
  const authority = requireCampaignPlanningAuthority(root, intent, env);
  if (input.host !== authority.grant.campaign!.local_parent_host || typeof input.session_id !== 'string' || !input.session_id.trim() || input.session_id.length > 256) throw new CampaignPlanningError('human_attention_required', 'planning requires the authorized local parent host and exact session');
  const parent = { host: input.host, session_id: input.session_id };
  const existingParent = readPlanningRecord<typeof parent>(root, intent, 'parent');
  if (existingParent && canonicalMessageBytes(existingParent) !== canonicalMessageBytes(parent)) throw new CampaignPlanningError('human_attention_required', 'another local parent session owns this group');
  const adoption = readIssueBatchAdoptionArtifact(root, intent, 'adoption')!;
  const sprintPath = adoption.sprint_path;
  if (typeof sprintPath !== 'string') throw new CampaignPlanningError('planning_failed', 'adoption lacks its Sprint path');
  const canonical = readCanonicalSprint(root, { sprintPath, targetRef: intent.target_ref });
  if (!canonical.ok || canonical.commit !== authority.target) throw new CampaignPlanningError('source_stale', 'canonical Sprint changed during planning');
  const tasks = projectCanonicalTasks({ repoIdentity: resolveRepoIdentity(root), sprintPath, sprintText: canonical.text });
  const registry = readRepoHarnessRegistryStrictSnapshot({ env });
  const repo = registry.repos.find(r => r.id === intent.repository_id && r.accessMode === 'read_write');
  if (!repo || resolveRepoIdentity(repo.path) !== resolveRepoIdentity(root)) throw new CampaignPlanningError('human_attention_required', 'planning repository is not write-authorized');
  if (typeof input.idempotency_key !== 'string' || !input.idempotency_key.trim() || input.idempotency_key.length > 256) throw new CampaignPlanningError('planning_failed', 'planning requires a bounded idempotency key');
  const shadow = authority.policy.mode === 'shadow';
  if (shadow && input.result !== undefined) throw new CampaignPlanningError('human_attention_required', 'shadow cannot persist planning outcomes');
  const submitted = input.result === undefined ? null : validatePlanningResult(input.result);
  const execute = () => {
    // Closing an issued job cannot authorize execution and must remain possible after source drift.
    if (submitted && submitted.outcome !== 'plan_ready') {
      for (const slot of authority.manifest.slots) {
        const oldJob = readPlanningRecord<CampaignPlanningJob>(root, intent, slot.task_id);
        if (!oldJob || oldJob.job_sha256 !== submitted.job_sha256) continue;
        if (oldJob.host !== input.host || oldJob.session_id !== input.session_id) throw new CampaignPlanningError('human_attention_required', 'planning job belongs to another local parent');
        persistPlanningRecord(root, intent, planningResultKey(slot.task_id), { job: oldJob, result: submitted, proof: null, binding_id: null, evidence: [] });
        return { outcome: submitted.outcome, task_id: slot.task_id, explanation: submitted.explanation };
      }
      throw new CampaignPlanningError('planning_failed', 'terminal result has no persisted planning job');
    }
    // Shadow renders immutable adoption input only; it performs no refresh/store mutation.
    const refreshed = shadow ? null : (deps.refresh ?? refreshExternalSource)({ repo_root: root, registered_repository_id: intent.repository_id, policy: readCampaignExternalSourcesPolicyAtRevision(root, intent.base_main_sha) });
    if (refreshed && refreshed.receipt.outcome !== 'complete') throw new CampaignPlanningError('source_stale', 'planning requires a complete provider observation');
    const fresh = requireCampaignPlanningAuthority(root, intent, env);
    if (fresh.target !== authority.target || fresh.policy.mode !== authority.policy.mode) throw new CampaignPlanningError('source_stale', 'planning authority changed before handoff');
    for (const slot of authority.manifest.slots) {
      const task = tasks.find(t => t.task_id === slot.task_id);
      const issue = authority.manifest.receipt.issues.find(i => i.slot === slot.slot);
      if (!task || !issue) throw new CampaignPlanningError('source_stale', 'adopted task is missing');
      if (task.row.status !== '[ ]') continue;
      const resultRecord = readPlanningRecord<PlanningAdmission>(root, intent, planningResultKey(task.task_id));
      if (resultRecord && resultRecord.result.outcome !== 'plan_ready' && (!submitted || submitted.job_sha256 !== resultRecord.job.job_sha256)) continue;
      rejectProtectedPlanning(root, authority.target, issue.primary_capability, issue.suspected_paths);
      const adoptedObservation = (adoption.input as IssueBatchAdoptionInput).snapshot.observations.find(o => o.observation_sha256 === issue.source_observation_sha256);
      if (!adoptedObservation) throw new CampaignPlanningError('source_stale', 'adoption observation is unavailable');
      const observation = shadow ? adoptedObservation : refreshed?.projection.issues.find(i => i.latest_observation.provider_issue_id === issue.provider_issue_id)?.latest_observation;
      const oldJob = readPlanningRecord<CampaignPlanningJob>(root, intent, task.task_id);
      const job = oldJob ?? buildPlanningJob({ campaign_id: intent.campaign_id, group_number: intent.group_number, intent_sha256: intent.intent_sha256,
        publication_sha: authority.publication.materialized_commit, protection_sha256: planningProtectionDigest(root, authority.target), task_id: task.task_id, task_revision: task.task_revision, sprint_path: sprintPath,
        source_ref: `sprint:${sprintPath}#${task.row.task}`, source_revision: adoptedObservation.source_revision, observation_sha256: issue.source_observation_sha256,
        host: input.host, session_id: input.session_id, issue_kind: issue.issue_kind });
      if (job.protection_sha256 !== planningProtectionDigest(root, authority.target)) throw new CampaignPlanningError('source_stale', 'planning protection snapshot changed');
      if (job.task_revision !== task.task_revision || job.host !== input.host || job.session_id !== input.session_id) throw new CampaignPlanningError('source_stale', 'planning job Task revision or owner changed');
      if (!shadow && (!observation || observation.observation_sha256 !== issue.source_observation_sha256 || !observation.eligible || observation.state !== 'open' || !refreshed!.receipt.source_revisions.includes(observation.source_revision))) {
        // Preserve the adopted identity so the parent can explicitly close a stale slot.
        if (!submitted && !oldJob) persistPlanningRecord(root, intent, task.task_id, job);
        return { outcome: 'source_stale' as const, task_id: task.task_id, error: 'source_stale', job,
          instructions: ['The adopted Issue is stale. Submit a source_stale planning result for this job to close the slot explicitly; do not plan or execute it.'] };
      }
      if (submitted && submitted.job_sha256 !== job.job_sha256) continue;
      if (submitted && resultRecord && canonicalMessageBytes({ result: resultRecord.result }) !== canonicalMessageBytes({ result: submitted })) throw new CampaignPlanningError('human_attention_required', 'planning job already has a different result');
      if (submitted && !oldJob) throw new CampaignPlanningError('planning_failed', 'host result has no persisted planning job');
      if (submitted && !resultRecord) {
        const record = admit(input, deps, intent.repository_id, intent.target_ref, job, submitted, issue.primary_capability, issue.suspected_paths, authority.target);
        persistPlanningRecord(root, intent, planningResultKey(task.task_id), record);
      }
      // A result is never used to assert readiness; use the real offer projection.
      const offer = collectRepoTaskOffers(repo, registry, { env })?.offers.find(o => o.task_id === task.task_id);
      if (offer?.execution_readiness === 'execution_ready') {
        if (submitted) return { outcome: 'plan_ready' as const, task_id: task.task_id, offer };
        continue;
      }
      const outcome = readPlanningRecord<PlanningAdmission>(root, intent, planningResultKey(task.task_id));
      if (outcome) {
        // The offer retains validated admission proof even when a claim blocks execution.
        if (!submitted && outcome.result.outcome === 'plan_ready' && offer?.plan
          && offer.blockers.length === 1 && offer.blockers[0]!.code === 'lease_unavailable') continue;
        if (submitted || outcome.result.outcome === 'plan_ready') return { outcome: outcome.result.outcome === 'plan_ready' ? 'source_stale' as const : outcome.result.outcome, task_id: task.task_id, explanation: outcome.result.explanation };
        continue;
      }
      if (!shadow) persistPlanningRecord(root, intent, task.task_id, job);
      return { action: 'planning_required' as const, dry_run: shadow, job, untrusted_context: shadow ? renderExternalSourceUntrustedContext({ observation: adoptedObservation }) : externalSourceContext(root, intent.repository_id, job.source_revision), instructions: [
        `Use the existing ${issue.issue_kind === 'bugfix' ? '/hunt flow: reproduce/refute, root cause, Root Cause Evidence and regression guard' : 'characterization flow: current behavior, old-test gap and mutation/old-implementation falsifier'} in this local parent session.`,
        `Capture the plan with repo-harness run capture-plan --source waza-think and exact Source Ref ${job.source_ref}; create its projectable contract before submitting evidence.`,
        'Submit one closed planning outcome with explicit planned surfaces. New feature or protected surfaces require human routing. Do not claim or execute the Task.',
      ] };
    }
    if (submitted) throw new CampaignPlanningError('source_stale', 'submitted planning job is not a pending canonical task');
    return { action: 'idle' as const, reason: 'no adopted task requires planning' };
  };
  if (shadow) return execute();
  return withCampaignPlanningLock(root, intent, () => {
    persistPlanningRecord(root, intent, 'parent', parent);
    const requestKey = canonicalMessageDigest({ record: 'step-request', key: input.idempotency_key }).slice(7);
    const responseKey = canonicalMessageDigest({ record: 'step-response', key: input.idempotency_key }).slice(7);
    const request = { ...parent, result: submitted };
    const prior = readPlanningRecord<typeof request>(root, intent, requestKey);
    type StoredResponse = { response: Record<string, unknown> } | { error: { code: CampaignPlanningError['code']; message: string } };
    if (prior) {
      if (canonicalMessageBytes(prior) !== canonicalMessageBytes(request)) throw new CampaignPlanningError('human_attention_required', 'step key already binds a different request');
      const completed = readPlanningRecord<StoredResponse>(root, intent, responseKey);
      if (!completed) throw new CampaignPlanningError('human_attention_required', 'planning step was interrupted; inspect its evidence before using a new step key');
      if ('error' in completed) throw new CampaignPlanningError(completed.error.code, completed.error.message);
      return { ...completed.response, replayed: true };
    }
    persistPlanningRecord(root, intent, requestKey, request);
    try {
      const response = execute();
      persistPlanningRecord(root, intent, responseKey, { response });
      return { ...response, replayed: false };
    } catch (error) {
      const failure = error instanceof CampaignPlanningError ? error : new CampaignPlanningError('planning_failed', error instanceof Error ? error.message : String(error));
      persistPlanningRecord(root, intent, responseKey, { error: { code: failure.code, message: failure.message } });
      throw failure;
    }
  });
}
function admit(input: CampaignPlanningStepInput, deps: CampaignPlanningDependencies, repositoryId: string, targetRef: string, job: CampaignPlanningJob, result: CampaignPlanningResultInput, capability: string, suspected: readonly string[], target: string): PlanningAdmission {
  const root = input.repo_root;
  if (result.outcome !== 'plan_ready') return { job, result, proof: null, binding_id: null, evidence: [] };
  rejectPlannedFeatures(result.surfaces!);
  rejectProtectedPlanning(root, target, capability, [...suspected, ...result.surfaces!.paths]);
  const taskCell = job.source_ref.slice(`sprint:${job.sprint_path}#`.length);
  const proof = readCanonicalTaskPlanProof(root, { sprintPath: job.sprint_path, taskCell });
  if (!proof.ok) throw new CampaignPlanningError('planning_failed', proof.error);
  const preflight = deps.preflight(root, proof.proof.contract_path);
  if (!preflight.ok || job.issue_kind === 'bugfix' && (preflight.task_profile !== 'bugfix' || preflight.evidence.length !== 2)) throw new CampaignPlanningError('planning_failed', 'existing contract preflight did not prove required Root Cause Evidence');
  const evidence = [...preflight.evidence];
  if (job.issue_kind === 'test_gap') {
    const c = result.characterization;
    if (!c) throw new CampaignPlanningError('planning_failed', 'test_gap requires old-test gap evidence');
    const artifact = planningArtifactBytes(root, c.artifact.path);
    if (messageSha256(artifact) !== c.artifact.sha256 || !artifact.includes(c.old_tests_command) || !artifact.includes(c.falsifier_command) || !artifact.includes(c.regression_guard)
      || !/^OLD_TESTS_EXIT=0$/mu.test(artifact) || !artifact.split(/\r?\n/u).includes(`FALSIFIER_EXIT=${c.falsifier_exit}`)) throw new CampaignPlanningError('planning_failed', 'test_gap artifact does not substantiate old-test/falsifier result');
    evidence.push(c.artifact, { path: c.regression_guard, sha256: messageSha256(planningArtifactBytes(root, c.regression_guard)) });
  }
  const provisional: PlanningAdmission = { job, result, proof: proof.proof, evidence, binding_id: 'pre-persistence' };
  validateAdmissionEvidence(root, provisional);
  const binding = bindExternalSource({ registered_repository_id: repositoryId, source_revision: job.source_revision, sprint_path: job.sprint_path, task_id: job.task_id, target_ref: targetRef, env: input.env });
  if (binding.observation_sha256 !== job.observation_sha256 || binding.task_revision !== job.task_revision || binding.plan_sha256 !== proof.proof.plan_sha256 || binding.contract_sha256 !== proof.proof.contract_sha256) throw new CampaignPlanningError('source_stale', 'binding authority changed before admission');
  return { ...provisional, binding_id: binding.binding_id };
}
