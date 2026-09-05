import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { capabilityRegistryFromArchcontextNodes } from '../../core/capabilities/registry';
import { automationDigest } from '../../core/automation/budget';
import { buildIssueBatchAdoption, IssueBatchAdoptionError, type IssueBatchAdoptionInput } from '../../core/automation/issue-batch-adoption';
import { buildConnectorChallenge, renderConnectorChallenge, validateConnectorChallenge, verifyConnectorChallenge, type ConnectorChallengeV1 } from '../../core/automation/connector-challenge';
import { parseIssueBatchMetadata, reconcileIssueBatchSlots } from '../../core/automation/issue-batch-reconcile';
import { requireVerifiedIssueAuthoringSession, type IssueBatchIntentV1 } from '../../core/automation/issue-batch';
import { canonicalMessageBytes, canonicalMessageDigest, messageSha256 } from '../../core/messages/mechanics';
import { ensureCampaignAuthoringBudget, reserveCampaignAuthoringBudget, appendAutomationUsage, sealCampaignAuthoringBudget, readCampaignAuthoringBudgetTerminal, verifyCampaignAuthoringBudgetTerminal } from './budget-store';
import { readStoredProgramAuthorization } from './grant-store';
import { assertAuthorityBinding, readDevelopmentCampaignStatus } from './development-campaign-store';
import { readDevelopmentCampaignPolicyAtRevision } from './development-campaign-policy';
import { observeIssueBatch, requireIssueBatchAuthority, type IssueBatchObservationSnapshotV1 } from './issue-batch-observer';
import { listIssueBatchJournalRecords, listIssueAuthoringSessions, readIssueBatchIntent, readIssueBatchAdoptionArtifact, persistIssueBatchAdoptionArtifact, withIssueBatchSealSources } from './issue-batch-store';
import type { IssueAuthoringBrowserInput, IssueAuthoringBrowserResult, IssueAuthoringDependencies } from './gpt-pro-issue-authoring';
import { listProviderIssueObservations } from '../external-sources/store';
import type { CampaignStepReceiptV1, CampaignMutationReservationV1, CampaignMutationResultV1 } from './campaign-step';
import { publishIssueBatch, type CampaignPublicationPolicy } from './issue-batch-publication';

export interface AdoptIssueBatchInput {
  readonly repo_root: string;
  readonly campaign_id: string;
  readonly group_number: number;
  readonly intent_sha256: string;
  readonly sprint_path: string;
  readonly publication_policy_path: string;
  readonly dry_run?: boolean;
  readonly gitleaks_bin?: string;
  readonly env?: NodeJS.ProcessEnv;
}
export interface AdoptionBrowserResult extends IssueAuthoringBrowserResult { readonly output?: string }
export interface IssueBatchAdoptionDependencies {
  readonly readBinding: IssueAuthoringDependencies<AdoptionBrowserResult>['readBinding'];
  readonly followup: (input: IssueAuthoringBrowserInput & { readonly sessionId: string }) => Promise<AdoptionBrowserResult>;
  readonly readSession: (repoRoot: string, sessionId: string) => { readonly output: string; readonly meta: {
    readonly sessionId: string; readonly sourceSessionId?: string; readonly repo: string; readonly status: IssueAuthoringBrowserResult['status'];
    readonly model: { readonly verified: boolean }; readonly browser: { readonly profileDirectory?: string };
  } };
  readonly observe?: typeof observeIssueBatch;
  readonly now?: () => Date;
}
function fail(message: string): never { throw new IssueBatchAdoptionError('issue_adoption_reconciliation_required', message); }
function git(root: string, args: string[]): string { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function readAt(root: string, sha: string, path: string): string { return git(root, ['show', `${sha}:${path}`]); }
function challengeAt(root: string, intent: IssueBatchIntentV1, session: string): ConnectorChallengeV1 {
  const entries = git(root, ['ls-tree', '-rz', '--full-tree', intent.base_main_sha]).split('\0').filter(Boolean).map(row => {
    const separator = row.indexOf('\t'); return { mode: row.slice(0, 6), path: row.slice(separator + 1) };
  }).filter(row => row.mode === '100644' && !row.path.startsWith('.') && row.path.includes('/')).sort((a, b) => a.path.localeCompare(b.path));
  const file = entries.find(row => /\.(ts|js|md|json)$/u.test(row.path));
  if (!file) fail('exact commit has no eligible challenge text file');
  const content = readAt(root, intent.base_main_sha, file.path);
  if (content.includes('\0') || !content.length) fail('challenge text target is not readable UTF-8 text');
  const directory = file.path.slice(0, file.path.lastIndexOf('/'));
  const listing = git(root, ['ls-tree', '-z', '--name-only', `${intent.base_main_sha}:${directory}`]).split('\0').filter(Boolean).sort().join('\n');
  return buildConnectorChallenge({ intent_sha256: intent.intent_sha256, base_main_sha: intent.base_main_sha, source_session_ref: session, targets: [
    { kind: 'directory_entries', path: directory, line: null, expected: listing },
    { kind: 'text_line', path: file.path, line: 1, expected: content.split('\n')[0]! },
    { kind: 'file_sha256', path: file.path, line: null, expected: createHash('sha256').update(content).digest('hex') },
  ] });
}
function capabilityIds(root: string, intent: IssueBatchIntentV1): readonly string[] {
  const paths = git(root, ['ls-tree', '-r', '--name-only', intent.base_main_sha, '.archcontext/model/nodes']).trim().split('\n').filter(p => p.endsWith('.yaml'));
  const resolution = capabilityRegistryFromArchcontextNodes(paths.map(path => ({ path, value: Bun.YAML.parse(readAt(root, intent.base_main_sha, path)) })), {
    repoRoot: root, isExistingDirectory: path => { try { return git(root, ['cat-file', '-t', `${intent.base_main_sha}:${path}`]).trim() === 'tree'; } catch { return false; } },
  });
  if (resolution.status !== 'valid') fail('exact main capability registry is unavailable');
  return resolution.registry.capabilities.map(c => `capability.${c.domain}.${c.name}`);
}
/** Consume the latest BRC5 reconciliation projection; never count its events as budget usage. */
function priorReconciliation(root: string, intent: IssueBatchIntentV1) {
  const reservations = listIssueBatchJournalRecords(root, intent.campaign_id, intent.group_number, 'reservations') as readonly CampaignMutationReservationV1[];
  const results = listIssueBatchJournalRecords(root, intent.campaign_id, intent.group_number, 'results') as readonly CampaignMutationResultV1[];
  if (reservations.some(r => r.intent_sha256 !== intent.intent_sha256 || !results.some(result => result.reservation_sha256 === r.reservation_sha256))) fail('BRC5 mutation requires reconciliation before adoption');
  const receipts = listIssueBatchJournalRecords(root, intent.campaign_id, intent.group_number, 'receipts') as readonly CampaignStepReceiptV1[];
  const latest = receipts.filter(r => r.intent_sha256 === intent.intent_sha256 && r.reconciliation !== null).sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0];
  if (!latest) {
    if (results.length) fail('BRC5 must observe its completed mutation before adoption');
    return { prior_observations: [], repair_exhausted_slots: [] };
  }
  if (results.some(r => r.completed_at > latest.observed_at)) fail('BRC5 must refresh its observation after the latest mutation');
  const reconciliation = latest.reconciliation!;
  const { reconciliation_sha256: digest, ...basis } = reconciliation;
  if (canonicalMessageDigest(basis) !== digest) fail('BRC5 reconciliation projection digest differs');
  const observations = listProviderIssueObservations(root);
  const prior = reconciliation.observation_sha256s.map(hash => {
    const observation = observations.find(o => o.observation_sha256 === hash);
    if (!observation) fail('BRC5 source observation evidence is missing');
    return observation;
  });
  return { prior_observations: prior, repair_exhausted_slots: reconciliation.unfilled_slots };
}

function publicationPolicyAt(root: string, intent: IssueBatchIntentV1, path: string): CampaignPublicationPolicy {
  function safe(value: string): void {
    if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\') || value.split('/').some(part => !part || part === '.' || part === '..')) fail('publication policy path must be repository-relative');
    if (git(root, ['ls-tree', intent.base_main_sha, '--', value]).slice(0, 6) !== '100644') fail('publication policy must name an exact-main regular file');
  }
  safe(path);
  const policy = JSON.parse(readAt(root, intent.base_main_sha, path));
  if (!policy || typeof policy !== 'object' || Object.keys(policy).sort().join(',') !== 'required_acceptance,retry_policy,rollback_boundary'
    || !Array.isArray(policy.required_acceptance) || !policy.required_acceptance.length || !policy.rollback_boundary) fail('publication policy has invalid fields');
  for (const acceptance of policy.required_acceptance) {
    safe(acceptance.policy_ref);
    if (messageSha256(readAt(root, intent.base_main_sha, acceptance.policy_ref)) !== acceptance.policy_revision) fail('acceptance policy revision differs from exact main');
  }
  safe(policy.rollback_boundary.boundary_ref);
  if (messageSha256(readAt(root, intent.base_main_sha, policy.rollback_boundary.boundary_ref)) !== policy.rollback_boundary.boundary_revision) fail('rollback boundary revision differs from exact main');
  return policy as CampaignPublicationPolicy;
}

interface ResponseEvidence { readonly response: string; readonly response_session_ref: string; readonly model_verified: boolean; readonly status: IssueAuthoringBrowserResult['status']; readonly reservation: Parameters<typeof appendAutomationUsage>[0]['reservation'] }

export async function adoptIssueBatch(input: AdoptIssueBatchInput, deps: IssueBatchAdoptionDependencies) {
  const now = deps.now ?? (() => new Date());
  const intent = readIssueBatchIntent(input.repo_root, input.campaign_id, input.group_number, input.intent_sha256);
  const publicationPolicy = publicationPolicyAt(input.repo_root, intent, input.publication_policy_path);
  const status = readDevelopmentCampaignStatus(input.repo_root, intent.campaign_id, input.env);
  const mode = readDevelopmentCampaignPolicyAtRevision(input.repo_root, intent.base_main_sha).mode;
  if (mode === 'off' || (mode === 'shadow' && !input.dry_run)) fail('campaign mode forbids materialization');
  const existing = readIssueBatchAdoptionArtifact(input.repo_root, intent, 'adoption');
  if (existing) {
    const stored = existing as unknown as { input: IssueBatchAdoptionInput; sprint_path: string; publication_policy: CampaignPublicationPolicy };
    if (stored.sprint_path !== input.sprint_path || canonicalMessageBytes({ ...stored.publication_policy }) !== canonicalMessageBytes({ ...publicationPolicy })) fail('replay target differs from stored adoption');
    const authorization = readStoredProgramAuthorization(input.repo_root, status.campaign.authorization_sha256, input.env);
    if (stored.input.authorization_sha256 !== authorization.authorization_sha256 || canonicalMessageBytes({ ...stored.input.intent }) !== canonicalMessageBytes({ ...intent })) fail('replay authority differs');
    verifyCampaignAuthoringBudgetTerminal({ repo_root: input.repo_root, automation_run_id: stored.input.terminal.automation_run_id,
      expected_budget_sha256: stored.input.terminal.budget_sha256, campaign_id: intent.campaign_id, group_number: intent.group_number as 1 | 2 | 3,
      intent_sha256: intent.intent_sha256, env: input.env, terminal: stored.input.terminal });
    const adopted = buildIssueBatchAdoption(stored.input);
    const publication = readIssueBatchAdoptionArtifact(input.repo_root, intent, 'publication');
    let visible = false;
    if (publication && typeof publication.candidate_ref === 'string') {
      try { visible = git(input.repo_root, ['rev-parse', '--verify', publication.candidate_ref]).trim() === publication.materialized_commit; } catch { /* Not published yet. */ }
      if (!visible && typeof publication.materialized_commit === 'string') {
        try { git(input.repo_root, ['merge-base', '--is-ancestor', publication.materialized_commit, intent.target_ref]); visible = true; } catch { /* Candidate is not canonical. */ }
      }
    }
    if (!input.dry_run && !visible) {
      const fresh = (deps.observe ?? observeIssueBatch)({ repo_root: input.repo_root, intent, env: input.env, now });
      reconcileIssueBatchSlots({ intent, snapshot_receipt: fresh.receipt, observations: fresh.observations,
        prior_observations: stored.input.snapshot.observations, repair_exhausted_slots: stored.input.snapshot.repair_exhausted_slots, current_main_sha: intent.base_main_sha });
      const expected = stored.input.snapshot.observations.map(o => o.source_revision).sort();
      if (JSON.stringify(fresh.observations.map(o => o.source_revision).sort()) !== JSON.stringify(expected)) fail('provider sources changed before publication recovery');
    }
    return { ...adopted, publication: input.dry_run ? null : publishIssueBatch({ ...input, intent, receipt: adopted.receipt, policy: publicationPolicy,
      evidence: { terminal_sha256: stored.input.terminal.terminal_sha256, challenge_receipt_sha256: adopted.challenge_receipt.receipt_sha256 } }) };
  }
  const authorization = assertAuthorityBinding(input.repo_root, status.campaign, input.env ?? process.env);
  const budget = ensureCampaignAuthoringBudget({ repo_root: input.repo_root, authorization, env: input.env });
  const binding = { repo_root: input.repo_root, automation_run_id: budget.budget.automation_run_id, expected_budget_sha256: budget.budget.budget_sha256,
    campaign_id: intent.campaign_id, group_number: intent.group_number as 1 | 2 | 3, intent_sha256: intent.intent_sha256, env: input.env };
  requireIssueBatchAuthority({ repo_root: input.repo_root, intent, env: input.env, now: now() });
  const sessions = listIssueAuthoringSessions(input.repo_root, intent.campaign_id, intent.group_number, intent.intent_sha256);
  const session = sessions.find(s => s.operation === 'initial');
  if (!session || session.browser_status !== 'completed') fail('completed initial authoring session is required');
  requireVerifiedIssueAuthoringSession(session);
  const storedChallenge = readIssueBatchAdoptionArtifact(input.repo_root, intent, 'challenge');
  const challenge = storedChallenge ? validateConnectorChallenge(storedChallenge as unknown as ConnectorChallengeV1) : challengeAt(input.repo_root, intent, session.session_ref);
  if (challenge.source_session_ref !== session.session_ref) fail('challenge session differs from source session');
  persistIssueBatchAdoptionArtifact(input.repo_root, intent, 'challenge', { ...challenge });
  const browser = deps.readBinding(input.repo_root);
  if (browser.error || !browser.binding?.profileDir || browser.binding.profileDirectory !== intent.chrome_profile_directory) fail('browser profile binding differs from authorization');
  let response = readIssueBatchAdoptionArtifact(input.repo_root, intent, 'response') as unknown as ResponseEvidence | null;
  if (!response) {
    const admission = reserveCampaignAuthoringBudget({ ...binding, operation: 'challenge', idempotency_key: challenge.challenge_sha256 });
    if (admission.disposition === 'replayed') fail('challenge reservation already exists; reconcile its exact result before continuing');
    const result = await deps.followup({ repoRoot: input.repo_root, sessionId: session.session_ref, title: `Campaign ${intent.campaign_id} readback`, prompt: renderConnectorChallenge(challenge, intent.provider_repository),
      provider: 'oracle', model: 'gpt-5.5-pro', requireSecretScan: true, gitleaksBin: input.gitleaks_bin, profileDir: browser.binding.profileDir, profileDirectory: browser.binding.profileDirectory!, dryRun: false });
    response = { response: result.output ?? '', response_session_ref: result.sessionId, model_verified: result.meta.model.verified === true, status: result.status, reservation: admission.reservation };
    persistIssueBatchAdoptionArtifact(input.repo_root, intent, 'response', { ...response });
  }
  const completed = readIssueBatchAdoptionArtifact(input.repo_root, intent, 'completed-response') as unknown as ResponseEvidence | null;
  if (completed) {
    if (completed.reservation.reservation_sha256 !== response.reservation.reservation_sha256 || completed.response_session_ref !== response.response_session_ref) fail('completed challenge response binding differs');
    response = completed;
  } else {
    if (response.status !== 'completed') {
      let recovered: ReturnType<IssueBatchAdoptionDependencies['readSession']>;
      try { recovered = deps.readSession(input.repo_root, response.response_session_ref); }
      catch { return fail('challenge response is still unresolved; reservation remains open'); }
      if (recovered.meta.status !== 'completed' || recovered.meta.sessionId !== response.response_session_ref || recovered.meta.sourceSessionId !== session.session_ref
        || recovered.meta.repo !== input.repo_root || recovered.meta.browser.profileDirectory !== intent.chrome_profile_directory) fail('challenge response is still unresolved or its session binding differs');
      response = { ...response, status: 'completed', response: recovered.output, model_verified: recovered.meta.model.verified };
    }
    persistIssueBatchAdoptionArtifact(input.repo_root, intent, 'completed-response', { ...response });
  }
  appendAutomationUsage({ repo_root: input.repo_root, reservation: response.reservation, env: input.env, outcome: 'progress', evidence_refs: [{ ref: `provider-run:${response.response_session_ref}`, sha256: automationDigest(response) }] });
  verifyConnectorChallenge({ challenge, response: response.response, response_session_ref: response.response_session_ref, model_verified: response.model_verified });
  requireIssueBatchAuthority({ repo_root: input.repo_root, intent, env: input.env, now: now() });
  const prior = priorReconciliation(input.repo_root, intent);
  const snapshot: IssueBatchObservationSnapshotV1 = (deps.observe ?? observeIssueBatch)({ repo_root: input.repo_root, intent, env: input.env, now });
  const reconciliation = reconcileIssueBatchSlots({ intent, snapshot_receipt: snapshot.receipt, observations: snapshot.observations, ...prior, current_main_sha: intent.base_main_sha });
  if (reconciliation.invalid_slots.length || reconciliation.unexpected_issue_ids.length) fail('invalid or unexpected slots require BRC5 reconciliation before adoption');
  const capabilities = capabilityIds(input.repo_root, intent);
  for (const slot of reconciliation.slots.filter(s => s.state === 'complete')) {
    const observation = snapshot.observations.find(o => o.observation_sha256 === slot.observation_sha256)!;
    const metadata = parseIssueBatchMetadata(observation.body);
    if (!metadata || !capabilities.includes(metadata.primary_capability)) fail('adoption metadata references an unavailable capability');
  }
  const sealSources = { source_revisions: snapshot.observations.map(o => o.source_revision).sort() };
  const terminal = withIssueBatchSealSources(input.repo_root, intent, sealSources, () => readCampaignAuthoringBudgetTerminal(binding),
    () => sealCampaignAuthoringBudget({ ...binding, reason: reconciliation.outcome === 'complete' ? 'authoring_completed' : 'authoring_exhausted' }));
  verifyCampaignAuthoringBudgetTerminal({ ...binding, terminal });
  const finalSnapshot = (deps.observe ?? observeIssueBatch)({ repo_root: input.repo_root, intent, env: input.env, now });
  reconcileIssueBatchSlots({ intent, snapshot_receipt: finalSnapshot.receipt, observations: finalSnapshot.observations, prior_observations: snapshot.observations, repair_exhausted_slots: prior.repair_exhausted_slots, current_main_sha: intent.base_main_sha });
  if (JSON.stringify(finalSnapshot.observations.map(o => o.source_revision).sort()) !== JSON.stringify(sealSources.source_revisions)) fail('provider sources changed after authoring seal');
  const adoptionInput: IssueBatchAdoptionInput = { intent, session, snapshot: { snapshot_receipt: finalSnapshot.receipt, observations: finalSnapshot.observations, prior_observations: snapshot.observations, repair_exhausted_slots: prior.repair_exhausted_slots }, capability_ids: capabilities,
    authorization_sha256: authorization.authorization_sha256, terminal, challenge, challenge_response: response.response, response_session_ref: response.response_session_ref, model_verified: response.model_verified };
  const adopted = buildIssueBatchAdoption(adoptionInput);
  persistIssueBatchAdoptionArtifact(input.repo_root, intent, 'adoption', { input: adoptionInput, sprint_path: input.sprint_path, publication_policy: publicationPolicy });
  return { ...adopted, publication: input.dry_run ? null : publishIssueBatch({ ...input, intent, receipt: adopted.receipt, policy: publicationPolicy,
    evidence: { terminal_sha256: terminal.terminal_sha256, challenge_receipt_sha256: adopted.challenge_receipt.receipt_sha256 } }) };
}
