import { execFileSync } from 'child_process';
import { lstatSync, readFileSync, realpathSync } from 'fs';
import { join, relative } from 'path';
import { canonicalMessageBytes, canonicalMessageDigest, messageSha256 } from '../../core/messages/mechanics';
import { capabilityRegistryFromArchcontextNodes, matchCapabilityPath } from '../../core/capabilities/registry';
import { CampaignPlanningError, planningPath, rejectPlannedFeatures, validatePlanningResult, type CampaignPlanningJob, type CampaignPlanningResultInput, type PlanningArtifact } from '../../core/automation/campaign-planning';
import { buildIssueBatchAdoption, type IssueBatchAdoptionInput, type CampaignIssueBatchAdoptionReceiptV1 } from '../../core/automation/issue-batch-adoption';
import type { IssueBatchIntentV1 } from '../../core/automation/issue-batch';
import { markdownHeader, parseAllowedPaths } from '../../core/state/artifact-parsers';
import { readIssueBatchAdoptionArtifact, readIssueBatchIntent } from './issue-batch-store';
import type { CampaignPublicationV1 } from './issue-batch-publication';
import { readDevelopmentCampaignPolicyAtRevision, readCampaignExternalSourcesPolicyAtRevision } from './development-campaign-policy';
import { readStoredProgramAuthorization } from './grant-store';
import { readDevelopmentCampaignStatus } from './development-campaign-store';
import { readPlanningRecord, storedPlanningIntents } from './campaign-planning-store';
import { listExternalSourceBindings } from '../external-sources/binding';
import { listExternalSourceProjection } from '../external-sources/refresh';
import { listProviderIssueObservations } from '../external-sources/store';
import { repoHarnessRepoIdFor } from '../repo-registry';
import type { CanonicalTaskPlanProof, CanonicalTaskPlanProofResult } from '../state/coordination-canonical-source';

export interface PlanningAdmission {
  readonly job: CampaignPlanningJob;
  readonly result: CampaignPlanningResultInput;
  readonly binding_id: string | null;
  readonly proof: CanonicalTaskPlanProof | null;
  readonly evidence: readonly PlanningArtifact[];
}
export function planningResultKey(task: string): string { return canonicalMessageDigest({ task, record: 'planning-result' }).slice(7); }
export function planningGit(root: string, args: string[]): string { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function at(root: string, commit: string, path: string): string { return execFileSync('git', ['show', `${commit}:${path}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
export function planningArtifactBytes(root: string, path: string): string {
  planningPath(path); const file = join(root, path); const real = relative(realpathSync(root), realpathSync(file));
  if (real.startsWith('../') || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()) throw new CampaignPlanningError('planning_failed', 'planning evidence must be a regular repository file');
  return readFileSync(file, 'utf8');
}
export function requireCampaignPlanningAuthority(root: string, intent: IssueBatchIntentV1, env: NodeJS.ProcessEnv = process.env) {
  const { campaign, current } = readDevelopmentCampaignStatus(root, intent.campaign_id, env);
  if (!['authorized', 'group_preparing', 'group_running', 'group_auditing', 'group_accepted'].includes(current.state)) throw new CampaignPlanningError('human_attention_required', `campaign lifecycle does not permit planning: ${current.state}`);
  const grant = readStoredProgramAuthorization(root, campaign.authorization_sha256, env);
  const p = readIssueBatchAdoptionArtifact(root, intent, 'publication') as unknown as CampaignPublicationV1 | null;
  if (!p) throw new CampaignPlanningError('human_attention_required', 'campaign materialization has not been published');
  const target = planningGit(root, ['rev-parse', '--verify', `${intent.target_ref}^{commit}`]);
  try { planningGit(root, ['merge-base', '--is-ancestor', p.materialized_commit, target]); }
  catch { throw new CampaignPlanningError('human_attention_required', 'campaign materialization is not canonical'); }
  if (p.base_main_sha !== intent.base_main_sha || repoHarnessRepoIdFor(root) !== intent.repository_id || grant.repository_id !== intent.repository_id || grant.target_ref !== intent.target_ref || grant.target_revision !== intent.base_main_sha || grant.merge_mode !== 'manual' || !grant.campaign || grant.campaign.campaign_id !== intent.campaign_id || intent.group_number > grant.campaign.group_count || Date.parse(grant.expires_at) <= Date.now()) throw new CampaignPlanningError('human_attention_required', 'campaign planning authorization is stale');
  const original = at(root, p.materialized_commit, p.manifest_path);
  if (at(root, target, p.manifest_path) !== original) throw new CampaignPlanningError('source_stale', 'canonical adoption manifest differs');
  const manifest = JSON.parse(original) as { protocol: number; kind: string; projection_sha256: string; receipt: CampaignIssueBatchAdoptionReceiptV1; slots: { slot: string; task_id: string; work_package_id: string }[]; evidence: unknown; publication_policy: unknown };
  const stored = readIssueBatchAdoptionArtifact(root, intent, 'adoption');
  const { receipt_sha256: receiptDigest, ...receiptBasis } = manifest.receipt;
  if (manifest.protocol !== 1 || manifest.kind !== 'repo-harness-campaign-issue-manifest' || manifest.projection_sha256 !== p.projection_sha256 || manifest.receipt.issue_batch_intent_sha256 !== intent.intent_sha256 || canonicalMessageDigest(receiptBasis) !== receiptDigest || !stored || canonicalMessageBytes({ ...buildIssueBatchAdoption(stored.input as IssueBatchAdoptionInput).receipt }) !== canonicalMessageBytes({ ...manifest.receipt }) || JSON.stringify(manifest.slots.map(s => s.task_id)) !== JSON.stringify(p.task_ids)) throw new CampaignPlanningError('source_stale', 'adoption publication proof differs');
  const currentIntake = readCampaignExternalSourcesPolicyAtRevision(root, target);
  if (currentIntake.mode === 'off' || currentIntake.policy_revision !== intent.authoring_policy_sha256) throw new CampaignPlanningError('human_attention_required', 'campaign intake policy changed from its authorization');
  const policy = readDevelopmentCampaignPolicyAtRevision(root, target);
  if (policy.mode === 'off') throw new CampaignPlanningError('human_attention_required', 'campaign planning is disabled');
  if (intent.group_number > policy.limits.maximum_group_count || manifest.slots.length > policy.limits.maximum_issues_per_group) throw new CampaignPlanningError('human_attention_required', 'campaign exceeds current policy');
  return { grant, publication: p, manifest, target, policy };
}
export function planningProtectionDigest(root: string, target: string): string {
  return canonicalMessageDigest({
    inventory: planningGit(root, ['rev-parse', `${target}:tests/fixtures/repair-campaign/protected-capabilities.json`]),
    registry: planningGit(root, ['rev-parse', `${target}:.archcontext/model/nodes`]),
  });
}
export function rejectProtectedPlanning(root: string, target: string, capability: string, paths: readonly string[]): void {
  const inventoryPath = 'tests/fixtures/repair-campaign/protected-capabilities.json';
  const inventory = JSON.parse(at(root, target, inventoryPath));
  if (inventory.protocol !== 1 || !Array.isArray(inventory.capabilities) || !Array.isArray(inventory.unmapped_surfaces) || !Array.isArray(inventory.unmapped_closure?.roots) || !Array.isArray(inventory.unmapped_closure?.exempt_paths)) throw new CampaignPlanningError('planning_failed', 'frozen protection inventory is unavailable');
  const protectedIds = inventory.capabilities.map((c: { capability_id: string }) => c.capability_id);
  if (protectedIds.includes(capability)) throw new CampaignPlanningError('protected_surface_detected', `protected capability: ${capability}`);
  const nodePaths = planningGit(root, ['ls-tree', '-r', '--name-only', target, '.archcontext/model/nodes']).split('\n').filter(p => p.endsWith('.yaml'));
  const registry = capabilityRegistryFromArchcontextNodes(nodePaths.map(path => ({ path, value: Bun.YAML.parse(at(root, target, path)) })), { repoRoot: root, isExistingDirectory: path => { try { return planningGit(root, ['cat-file', '-t', `${target}:${path}`]) === 'tree'; } catch { return false; } } });
  if (registry.status !== 'valid') throw new CampaignPlanningError('planning_failed', 'canonical capability registry is unavailable');
  if (!registry.registry.capabilities.some(c => `capability.${c.domain}.${c.name}` === capability)) throw new CampaignPlanningError('source_stale', 'primary capability is no longer registered');
  const authorityInputs = new Set([inventoryPath, ...nodePaths]);
  for (const raw of paths) {
    const path = planningPath(raw);
    let type: string | null = null;
    try { type = planningGit(root, ['cat-file', '-t', `${target}:${path}`]); } catch { /* New concrete files have no canonical object yet. */ }
    if (type === 'tree') throw new CampaignPlanningError('planning_failed', 'planning requires concrete files, not directory scope');
    if (authorityInputs.has(path)) throw new CampaignPlanningError('protected_surface_detected', `protected guard authority input: ${path}`);
    const explicit = inventory.unmapped_surfaces.some((s: { paths: string[] }) => s.paths.includes(path));
    const closure = inventory.unmapped_closure.roots.some((p: string) => path === p || path.startsWith(`${p}/`)) && !inventory.unmapped_closure.exempt_paths.includes(path);
    const matched = matchCapabilityPath(registry.registry, path, { repoRoot: root });
    if (matched.status === 'invalid') throw new CampaignPlanningError('planning_failed', 'planned path has ambiguous capability ownership');
    const owner = matched.status === 'matched' ? `capability.${matched.match.capability.domain}.${matched.match.capability.name}` : null;
    if (explicit || closure || owner && protectedIds.includes(owner)) throw new CampaignPlanningError('protected_surface_detected', `protected planned path: ${path}`);
  }
}
export function validateAdmissionEvidence(root: string, admission: PlanningAdmission): void {
  const { job_sha256: digest, ...basis } = admission.job;
  if (canonicalMessageDigest(basis) !== digest || admission.result.job_sha256 !== digest) throw new CampaignPlanningError('planning_failed', 'planning job digest differs');
  const result = validatePlanningResult(admission.result);
  if (result.outcome !== 'plan_ready' || !result.surfaces || !admission.proof || !admission.binding_id || !admission.evidence.length) throw new CampaignPlanningError('planning_failed', 'planning admission is incomplete');
  if (new Set(admission.evidence.map(a => a.path)).size !== admission.evidence.length) throw new CampaignPlanningError('planning_failed', 'regression guard and evidence must be distinct files');
  rejectPlannedFeatures(result.surfaces);
  const contract = planningArtifactBytes(root, admission.proof.contract_path);
  const paths = parseAllowedPaths(contract).map(planningPath).sort();
  if (JSON.stringify(paths) !== JSON.stringify([...result.surfaces.paths].sort())) throw new CampaignPlanningError('planning_failed', 'declared planned paths differ from contract Allowed Paths');
  if (admission.job.issue_kind === 'bugfix' && markdownHeader(contract, 'Task Profile') !== 'bugfix') throw new CampaignPlanningError('planning_failed', 'bugfix requires the existing Root Cause Evidence preflight');
  if (admission.job.issue_kind === 'test_gap' && !result.characterization) throw new CampaignPlanningError('planning_failed', 'test_gap requires characterization and old-test falsifier evidence');
  for (const artifact of admission.evidence) if (messageSha256(planningArtifactBytes(root, artifact.path)) !== artifact.sha256) throw new CampaignPlanningError('source_stale', 'planning evidence bytes changed');
}
/** Campaign-only admission gate; existing TaskOffer remains the readiness authority. */
export function campaignTaskPlanProof(root: string, taskId: string, taskRevision: string, proof: CanonicalTaskPlanProofResult, env: NodeJS.ProcessEnv = process.env, targetRef = 'main'): CanonicalTaskPlanProofResult {
  const intents = storedPlanningIntents(root);
  for (const intent of intents) {
    const publication = readIssueBatchAdoptionArtifact(root, intent, 'publication') as unknown as CampaignPublicationV1 | null;
    if (!publication?.task_ids.includes(taskId)) continue;
    try {
      const authority = requireCampaignPlanningAuthority(root, intent, env);
      if (planningGit(root, ['rev-parse', '--symbolic-full-name', targetRef]) !== planningGit(root, ['rev-parse', '--symbolic-full-name', intent.target_ref]) || planningGit(root, ['rev-parse', `${targetRef}^{commit}`]) !== authority.target) throw new CampaignPlanningError('source_stale', 'offer target differs from campaign authority');
      if (authority.policy.mode !== 'active') throw new CampaignPlanningError('human_attention_required', 'shadow planning cannot authorize execution');
      const admission = readPlanningRecord<PlanningAdmission>(root, intent, planningResultKey(taskId));
      if (!proof.ok || !admission || !admission.proof || canonicalMessageBytes({ ...admission.proof }) !== canonicalMessageBytes({ ...proof.proof }) || admission.job.task_revision !== taskRevision || admission.job.protection_sha256 !== planningProtectionDigest(root, authority.target)) throw new CampaignPlanningError('planning_failed', 'campaign plan has no current admission');
      validateAdmissionEvidence(root, admission);
      const slot = authority.manifest.slots.find(s => s.task_id === taskId);
      const issue = authority.manifest.receipt.issues.find(i => i.slot === slot?.slot);
      if (!issue) throw new CampaignPlanningError('source_stale', 'campaign task is absent from adoption');
      rejectProtectedPlanning(root, authority.target, issue.primary_capability, [...issue.suspected_paths, ...admission.result.surfaces!.paths]);
      const binding = listExternalSourceBindings(intent.repository_id, env).bindings.find(b => b.receipt.binding_id === admission.binding_id);
      if (!binding || binding.receipt.canonical_target_ref !== intent.target_ref || binding.attention !== 'none' || binding.receipt.observation_sha256 !== admission.job.observation_sha256 || binding.receipt.task_id !== taskId || binding.receipt.task_revision !== taskRevision || binding.receipt.source_revision !== admission.job.source_revision) throw new CampaignPlanningError('source_stale', 'campaign source/task binding is stale');
      planningGit(root, ['merge-base', '--is-ancestor', binding.receipt.canonical_target_commit, authority.target]);
      const refresh = listExternalSourceProjection(root, intent.repository_id).latest_attempt;
      if (!refresh || refresh.outcome !== 'complete' || !refresh.source_revisions.includes(admission.job.source_revision)) throw new CampaignPlanningError('source_stale', 'latest provider readback does not contain the admitted source');
      const observation = listProviderIssueObservations(root).find(o => o.observation_sha256 === admission.job.observation_sha256);
      if (!observation || observation.observation_sha256 !== issue.source_observation_sha256) throw new CampaignPlanningError('source_stale', 'planning source differs from adopted Issue');
      return proof;
    } catch (error) {
      return { ok: false, code: 'plan_not_projectable', error: error instanceof Error ? error.message : String(error), candidates: proof.ok ? [proof.proof.plan_path] : [] };
    }
  }
  // A canonical manifest without the local immutable authority must also fail closed.
  const manifests = planningGit(root, ['ls-tree', '-r', '--name-only', targetRef, 'tasks/campaigns']).split('\n').filter(p => p.endsWith('.issues.json'));
  for (const path of manifests) {
    const manifest = JSON.parse(at(root, targetRef, path));
    if (manifest.slots?.some((s: { task_id: string }) => s.task_id === taskId)) return { ok: false, code: 'plan_not_projectable', error: 'campaign intent authority is unavailable', candidates: [] };
  }
  return proof;
}
