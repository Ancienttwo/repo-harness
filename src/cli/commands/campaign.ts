import { validateSelectedEngineerTaskChoice } from '../../effects/engineers/scheduling-acquire-next';
import { runCampaignRevisionObservation } from '../../effects/automation/campaign-revision-observation';
import { CampaignFreshAuditError } from '../../core/automation/campaign-fresh-audit';
import { runCampaignFreshAudit } from '../../effects/automation/campaign-fresh-audit';
import { runCampaignNotPlanned } from '../../effects/automation/campaign-not-planned';
import { runCampaignCloseout } from '../../effects/automation/campaign-closeout';
import { Command } from 'commander';
import { canonicalRepoPath } from '../../effects/repo-registry';
import { AutomationBudgetStoreError } from '../../effects/automation/budget-store';
import { adoptIssueBatch } from '../../effects/automation/issue-batch-adoption';
import { IssueBatchAdoptionError } from '../../core/automation/issue-batch-adoption';
import { ConnectorChallengeError } from '../../core/automation/connector-challenge';
import { readBrowserBinding } from '../chatgpt-browser/binding';
import { runBrowserConsult, runBrowserFollowup, readSession } from '../chatgpt-browser/engine';
import { readFileSync, writeFileSync } from 'fs';
import { runHelper } from '../../effects/runtime/helper-runner';
import { runCampaignAcquisition } from '../../effects/automation/campaign-acquisition';
import { runCampaignPlanningStep } from '../../effects/automation/campaign-planning';
import { CampaignPlanningError } from '../../core/automation/campaign-planning';
import { readIssueBatchIntent, readIssueBatchAdoptionArtifact } from '../../effects/automation/issue-batch-store';
import { assertStoppedAdoptedResumeEligible, assertReplaceableStoppedSuccessor, readAdoptedResumeSource, resolveEffectiveContinuation, validateAdoptedResumeSource } from '../../effects/automation/campaign-authoring-resume';
import { readAutomationBudgetStatus } from '../../effects/automation/budget-store';
import { campaignAutomationRunId } from '../../core/automation/campaign-authoring-budget';

import { buildDevelopmentCampaignDefinition } from '../../core/automation/development-campaign';
import { readStoredProgramAuthorization } from '../../effects/automation/grant-store';
import {
  appendDevelopmentCampaignEvent,
  createDevelopmentCampaign,
  readDevelopmentCampaignStatus,
  DevelopmentCampaignStoreError,
  type AppendDevelopmentCampaignEventInput,
} from '../../effects/automation/development-campaign-store';
import { DevelopmentCampaignPolicyError } from '../../effects/automation/development-campaign-policy';
import { continueIssueBatchAuthoring, startIssueBatchAuthoring, GptProIssueAuthoringError } from '../../effects/automation/gpt-pro-issue-authoring';
import { IssueBatchStoreError } from '../../effects/automation/issue-batch-store';
import { IssueBatchProtocolError, type IssueBatchSlot } from '../../core/automation/issue-batch';
import { runCampaignStep, CampaignStepError } from '../../effects/automation/campaign-step';
import { IssueBatchObserverError } from '../../effects/automation/issue-batch-observer';
import { IssueBatchReconcileError } from '../../core/automation/issue-batch-reconcile';

class CampaignArgumentError extends Error {
  readonly code = 'invalid_argument' as const;
}

function required(value: string | undefined, name: string): string {
  const result = value?.trim();
  if (!result) throw new CampaignArgumentError(`${name} is required`);
  return result;
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function outputError(error: unknown): void {
  const code = error instanceof CampaignArgumentError ? error.code
    : error instanceof CampaignFreshAuditError || error instanceof CampaignPlanningError || error instanceof DevelopmentCampaignStoreError || error instanceof DevelopmentCampaignPolicyError
      || error instanceof GptProIssueAuthoringError || error instanceof IssueBatchStoreError || error instanceof IssueBatchProtocolError
      || error instanceof AutomationBudgetStoreError || error instanceof IssueBatchAdoptionError || error instanceof ConnectorChallengeError || error instanceof CampaignStepError || error instanceof IssueBatchObserverError || error instanceof IssueBatchReconcileError ? error.code
      : 'campaign_unavailable';
  process.stderr.write(`${JSON.stringify({ ok: false, ...(error instanceof CampaignPlanningError ? { outcome: code === 'feature_surface_detected' ? 'feature_route_required' : code === 'protected_surface_detected' ? 'human_attention_required' : code } : {}), error: code, message: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = error instanceof CampaignArgumentError ? 2 : 1;
}

function requestJson(pathInput: string | undefined): Record<string, unknown> {
  const path = required(pathInput, '--request');
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new CampaignArgumentError(`cannot read --request: ${error instanceof Error ? error.message : String(error)}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new CampaignArgumentError('--request must contain one JSON object');
  return parsed as Record<string, unknown>;
}

function requestString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new CampaignArgumentError(`${name} is required`);
  return required(value, name);
}

export function runCampaignStart(raw: { readonly repo?: string; readonly authorizationSha256?: string; readonly idempotencyKey?: string; readonly observedAt?: string }): void {
  const repo = canonicalRepoPath(raw.repo?.trim() || process.cwd());
  const authorization = readStoredProgramAuthorization(repo, required(raw.authorizationSha256, '--authorization-sha256'));
  if (authorization.campaign === null) throw new CampaignArgumentError('the stored ProgramAuthorizationV1 has no campaign payload');
  const observedAt = raw.observedAt?.trim();
  const createdAt = observedAt || new Date().toISOString();
  const campaign = buildDevelopmentCampaignDefinition({
    campaign_id: authorization.campaign.campaign_id,
    authorization_id: authorization.authorization_id,
    authorization_sha256: authorization.authorization_sha256,
    repository_id: authorization.repository_id,
    target_ref: authorization.target_ref,
    target_revision: authorization.target_revision,
    created_at: createdAt,
  });
  output(createDevelopmentCampaign({
    repo_root: repo,
    campaign,
    idempotency_key: required(raw.idempotencyKey, '--idempotency-key'),
    reuse_existing_definition: !observedAt,
  }));
}

export function runCampaignTransition(raw: { readonly repo?: string; readonly request?: string }): void {
  const request = requestJson(raw.request) as unknown as Omit<AppendDevelopmentCampaignEventInput, 'repo_root'>;
  output(appendDevelopmentCampaignEvent({ ...request, repo_root: canonicalRepoPath(raw.repo?.trim() || process.cwd()) }));
}

export function runCampaignStatus(raw: { readonly repo?: string; readonly campaignId?: string }): void {
  output(readDevelopmentCampaignStatus(canonicalRepoPath(raw.repo?.trim() || process.cwd()), required(raw.campaignId, '--campaign-id')));
}

function groupNumber(value: string | undefined): number {
  const parsed = Number(required(value, '--group-number'));
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 3) throw new CampaignArgumentError('--group-number must be 1, 2, or 3');
  return parsed;
}

export async function runCampaignAuthor(raw: { readonly repo?: string; readonly campaignId?: string; readonly groupNumber?: string; readonly dryRun?: boolean; readonly gitleaksBin?: string; readonly resumeFrom?: string }): Promise<void> {
  output(await startIssueBatchAuthoring({
    repo_root: canonicalRepoPath(raw.repo?.trim() || process.cwd()), campaign_id: required(raw.campaignId, '--campaign-id'),
    group_number: groupNumber(raw.groupNumber), dry_run: raw.dryRun === true, gitleaks_bin: raw.gitleaksBin?.trim(),
    ...(raw.resumeFrom ? { resume_from: requestJson(raw.resumeFrom) } : {}),
  }, { readBinding: readBrowserBinding, consult: runBrowserConsult }));
}

export async function runCampaignAuthorFollowup(raw: { readonly repo?: string; readonly request?: string; readonly dryRun?: boolean; readonly gitleaksBin?: string }): Promise<void> {
  const request = requestJson(raw.request);
  const operation = request.operation;
  if (operation !== 'fill_missing' && operation !== 'edit_issue') throw new CampaignArgumentError('author follow-up operation must be fill_missing or edit_issue');
  const expected = operation === 'edit_issue'
    ? ['campaign_id', 'group_number', 'intent_sha256', 'operation', 'provider_issue_id', 'provider_issue_url', 'requested_slots', 'source_session_ref']
    : ['campaign_id', 'group_number', 'intent_sha256', 'operation', 'requested_slots', 'source_session_ref'];
  if (JSON.stringify(Object.keys(request).sort()) !== JSON.stringify(expected)) throw new CampaignArgumentError('author follow-up request fields are invalid');
  if (!Array.isArray(request.requested_slots) || !request.requested_slots.every((entry) => typeof entry === 'string')) throw new CampaignArgumentError('author follow-up requested_slots must be an array of strings');
  output(await continueIssueBatchAuthoring({
    repo_root: canonicalRepoPath(raw.repo?.trim() || process.cwd()), campaign_id: requestString(request.campaign_id, 'request.campaign_id'),
    group_number: groupNumber(typeof request.group_number === 'number' ? String(request.group_number) : undefined), intent_sha256: requestString(request.intent_sha256, 'request.intent_sha256'),
    source_session_ref: requestString(request.source_session_ref, 'request.source_session_ref'), operation,
    requested_slots: request.requested_slots as IssueBatchSlot[], provider_issue_id: operation === 'edit_issue' ? requestString(request.provider_issue_id, 'request.provider_issue_id') : undefined,
    provider_issue_url: operation === 'edit_issue' ? requestString(request.provider_issue_url, 'request.provider_issue_url') : undefined,
    dry_run: raw.dryRun === true, gitleaks_bin: raw.gitleaksBin?.trim(),
  }, { readBinding: readBrowserBinding, followup: runBrowserFollowup }));
}

export interface CampaignPrepareResumeOptions {
  readonly repo?: string;
  readonly sourceCampaignId?: string;
  readonly sourceGroupNumber?: string;
  readonly sourceIntentSha256?: string;
  readonly targetRevision?: string;
  readonly supersededCampaignId?: string;
  readonly supersededGroupNumber?: string;
  readonly supersededIntentSha256?: string;
  readonly out?: string;
}

/**
 * Zero-provider preflight. Every field of the emitted request is projected from canonical stores,
 * and admission re-derives all of it: this file is a request, never an authority.
 */
export function runCampaignPrepareResume(raw: CampaignPrepareResumeOptions): void {
  const root = canonicalRepoPath(raw.repo?.trim() || process.cwd());
  const source = readIssueBatchIntent(root, required(raw.sourceCampaignId, '--source-campaign-id'),
    groupNumber(raw.sourceGroupNumber), required(raw.sourceIntentSha256, '--source-intent-sha256'));
  const resumeSource = readAdoptedResumeSource(root, source);
  validateAdoptedResumeSource(root, resumeSource, required(raw.targetRevision, '--target-revision'));
  assertStoppedAdoptedResumeEligible(root, source);
  const superseded = raw.supersededCampaignId === undefined ? null
    : readIssueBatchIntent(root, required(raw.supersededCampaignId, '--superseded-campaign-id'),
      groupNumber(raw.supersededGroupNumber), required(raw.supersededIntentSha256, '--superseded-intent-sha256'));
  const basis = superseded === null ? null : assertReplaceableStoppedSuccessor(root, superseded);
  const chain = resolveEffectiveContinuation(root, source);
  const status = readDevelopmentCampaignStatus(root, source.campaign_id);
  const request = {
    campaign_id: source.campaign_id, group_number: source.group_number, intent_sha256: source.intent_sha256,
    source_session_ref: resumeSource.source_session_ref, issues: resumeSource.issues,
    ...(basis ? { supersedes: { campaign_id: basis.superseded.campaign_id, group_number: basis.superseded.group_number, intent_sha256: basis.superseded.intent_sha256 } } : {}),
  };
  const out = required(raw.out, '--out');
  const chainCampaigns = [source.campaign_id, ...chain.superseded.map((entry) => entry.campaign_id), ...(basis ? [basis.superseded.campaign_id] : [])]
    .filter((id, index, all) => all.indexOf(id) === index);
  const chainConsumption = chainCampaigns.map((campaignId) => {
    const runId = campaignAutomationRunId({ repository_id: source.repository_id, campaign_id: campaignId });
    const budget = readAutomationBudgetStatus(root, runId);
    return { campaign_id: campaignId, automation_run_id: runId, state: budget.current.state, drift: budget.drift,
      consumed: budget.current.consumed, open_reservations: budget.current.open_reservation_sha256s.length };
  });
  // The request file is the last side effect: every projection above can still fail closed without
  // leaving a partial exclusive file behind.
  writeFileSync(out, `${JSON.stringify(request, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  output({
    protocol: 1,
    kind: 'repo-harness-campaign-resume-preflight',
    request_path: out,
    source: { campaign_id: source.campaign_id, group_number: source.group_number, intent_sha256: source.intent_sha256, campaign_state: status.current.state },
    effective_continuation: chain.effective,
    superseded_chain: chain.superseded,
    supersedes: basis?.superseded ?? null,
    chain_consumption: chainConsumption,
    verdict: basis ? 'replacement_eligible' : 'resume_eligible',
    request,
  });
}

export function runCampaignPlanningPreflight(repo: string, contract: string) {
  const root = canonicalRepoPath(repo);
  const metadata = runHelper({ helper: 'verify-contract', args: ['--contract', contract, '--preflight'], cwd: root, trustedPackage: true, stdio: 'pipe' });
  if (metadata.exitCode !== 0) throw new CampaignPlanningError('planning_failed', metadata.stderr || metadata.stdout || 'contract metadata preflight failed');
  const result = runHelper({ helper: 'contract-run', args: ['preflight', '--repo', root, '--contract', contract, '--json'], cwd: root, trustedPackage: true, stdio: 'pipe' });
  if (result.exitCode !== 0) throw new CampaignPlanningError('planning_failed', result.stderr || result.stdout || 'contract preflight failed');
  const parsed = JSON.parse(result.stdout || '{}');
  if (parsed.status !== 'preflight_pass' || parsed.brief_preflight?.ok !== true || !Array.isArray(parsed.brief_preflight.evidence)) throw new CampaignPlanningError('planning_failed', 'contract preflight evidence is unavailable');
  return parsed.brief_preflight;

}

export async function runCampaignHeartbeatStep(raw: { readonly repo?: string; readonly campaignId?: string; readonly groupNumber?: string; readonly intentSha256?: string; readonly idempotencyKey?: string; readonly host?: string; readonly sessionId?: string; readonly planningResult?: string; readonly authorizationId?: string; readonly selected?: boolean; readonly observationRef?: string; readonly assertionFile?: string }): Promise<void> {
  if(!raw.selected && (raw.observationRef!==undefined || raw.assertionFile!==undefined)) throw new CampaignArgumentError('selected-only fields require --selected');
  if(raw.selected && (!raw.authorizationId || !raw.observationRef || !raw.assertionFile || raw.planningResult!==undefined)) throw new CampaignArgumentError('--selected requires authorization-id, observation-ref and assertion-file; planning-result is not allowed');
  const selected=raw.selected?validateSelectedEngineerTaskChoice({observation_ref:raw.observationRef,assertion:requestJson(raw.assertionFile!)}):null;
  const root = canonicalRepoPath(raw.repo?.trim() || process.cwd());
  if (raw.authorizationId !== undefined && raw.planningResult !== undefined) throw new CampaignArgumentError('--authorization-id and --planning-result are mutually exclusive');
  const intent = readIssueBatchIntent(root, required(raw.campaignId, '--campaign-id'), groupNumber(raw.groupNumber), required(raw.intentSha256, '--intent-sha256'));
  if (readIssueBatchAdoptionArtifact(root, intent, 'publication')) {
    if (raw.host !== 'claude' && raw.host !== 'codex') throw new CampaignArgumentError('post-adoption step requires --host claude|codex');
    if (raw.authorizationId !== undefined) {
      const acquired = runCampaignAcquisition({ repo_root: root, campaign_id: intent.campaign_id, group_number: intent.group_number, intent_sha256: intent.intent_sha256,
        host: raw.host, session_id: required(raw.sessionId, '--session-id'), idempotency_key: required(raw.idempotencyKey, '--idempotency-key'), authorization_id: required(raw.authorizationId, '--authorization-id'),...(selected?{selected}:{}) });
      output(acquired);
      if ('ok' in acquired && !acquired.ok) process.exitCode = 1;
      return;
    }
    output(runCampaignPlanningStep({ repo_root: root, campaign_id: intent.campaign_id, group_number: intent.group_number, intent_sha256: intent.intent_sha256,
      host: raw.host, session_id: required(raw.sessionId, '--session-id'), idempotency_key: required(raw.idempotencyKey, '--idempotency-key'), ...(raw.planningResult ? { result: requestJson(raw.planningResult) } : {}),
    }, { preflight: runCampaignPlanningPreflight }));
    return;
  }
  if (raw.authorizationId !== undefined) throw new CampaignArgumentError('execution requires canonical campaign adoption');
  output(await runCampaignStep({
    repo_root: canonicalRepoPath(raw.repo?.trim() || process.cwd()),
    campaign_id: required(raw.campaignId, '--campaign-id'),
    group_number: groupNumber(raw.groupNumber),
    intent_sha256: required(raw.intentSha256, '--intent-sha256'),
    idempotency_key: required(raw.idempotencyKey, '--idempotency-key'),
  }, { readBinding: readBrowserBinding, followup: runBrowserFollowup }));
}

export async function runCampaignAdopt(raw: { readonly repo?: string; readonly campaignId?: string; readonly groupNumber?: string; readonly intentSha256?: string; readonly sprintPath?: string; readonly publicationPolicy?: string; readonly dryRun?: boolean; readonly gitleaksBin?: string }): Promise<void> {
  output(await adoptIssueBatch({ repo_root: canonicalRepoPath(raw.repo?.trim() || process.cwd()), campaign_id: required(raw.campaignId, '--campaign-id'),
    group_number: groupNumber(raw.groupNumber), intent_sha256: required(raw.intentSha256, '--intent-sha256'), sprint_path: required(raw.sprintPath, '--sprint-path'),
    publication_policy_path: required(raw.publicationPolicy, '--publication-policy'), dry_run: raw.dryRun === true, gitleaks_bin: raw.gitleaksBin?.trim(),
  }, { readBinding: readBrowserBinding, followup: runBrowserFollowup, readSession }));
}

export function buildCampaignCommand(): Command {
  const command = new Command('campaign').description('Operate the authorized development campaign state machine');
  command.command('close-not-planned')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--artifact <path>', 'Committed typed not_planned decision')
    .requiredOption('--contract <path>', 'Acceptance contract covering decision and falsifier')
    .requiredOption('--host <host>', 'Authorized local parent host')
    .requiredOption('--session-id <id>', 'Authorized local parent session')
    .action(raw => {
      try {
        if (raw.host !== 'codex' && raw.host !== 'claude') throw new CampaignArgumentError('--host must be codex or claude');
        output(runCampaignNotPlanned({ root: canonicalRepoPath(raw.repo), artifact_path: required(raw.artifact, '--artifact'), contract_path: required(raw.contract, '--contract'),
          host: raw.host, session_id: required(raw.sessionId, '--session-id'), verify_acceptance: (root, contract) => {
            const result = runHelper({ helper: 'acceptance-receipt', args: ['verify', '--contract', contract, '--format', 'json'],
              cwd: root, trustedPackage: true, stdio: 'pipe' });
            if (result.exitCode !== 0) throw new Error(result.stderr || 'not_planned local acceptance verification failed');
            return JSON.parse(result.stdout ?? '');
          } }));
      } catch (error) { outputError(error); }
    });
  command.command('closeout')
    .requiredOption('--request <path>', 'Stored Campaign worker selector JSON')
    .requiredOption('--host <host>', 'Authorized local parent host')
    .requiredOption('--session-id <id>', 'Authorized local parent session')
    .option('--remote <name>', 'Publication remote', 'origin')
    .action(raw => {
      try {
        if (raw.host !== 'codex' && raw.host !== 'claude') throw new CampaignArgumentError('--host must be codex or claude');
        const result = runCampaignCloseout({ selector: requestJson(raw.request), host: raw.host, session_id: required(raw.sessionId, '--session-id'),
          remote: required(raw.remote, '--remote'), cleanup: (root, expected) => {
            const result = runHelper({ helper: 'contract-worktree', cwd: root, trustedPackage: true, stdio: 'pipe', args: ['cleanup',
              '--slug', expected.branch, '--target', expected.target_ref, '--expected-worktree', expected.worktree,
              '--expected-head', expected.head_sha, '--expected-target', expected.target_oid, '--expected-merge', expected.merge_commit_sha] });
            if (result.exitCode !== 0) throw new Error(result.stderr || 'exact cleanup actuator failed');
            const receipt = JSON.parse((result.stdout ?? '').trim().split('\n').at(-1)!);
            if (receipt.kind !== 'repo-harness-exact-local-cleanup' || receipt.worktree !== expected.worktree || receipt.branch !== expected.branch
              || receipt.head_sha !== expected.head_sha || receipt.target_oid !== expected.target_oid || receipt.merge_commit_sha !== expected.merge_commit_sha
              || receipt.worktree_removed !== true || receipt.branch_deleted !== true) throw new Error('exact cleanup actuator receipt differs');
            return receipt;
          } });
        output(result);
        if (result.disposition !== 'complete') process.exitCode = 1;
      } catch (error) { outputError(error); }
    });
  command.command('start')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--authorization-sha256 <digest>', 'Stored ProgramAuthorizationV1 digest')
    .requiredOption('--idempotency-key <key>', 'Stable creation key')
    .option('--observed-at <timestamp>', 'RFC3339 creation time')
    .action((options) => { try { runCampaignStart(options); } catch (error) { outputError(error); } });
  command.command('transition')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--request <path>', 'Exact campaign transition request JSON')
    .action((options) => { try { runCampaignTransition(options); } catch (error) { outputError(error); } });
  command.command('status')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--campaign-id <id>', 'Development campaign id')
    .action((options) => { try { runCampaignStatus(options); } catch (error) { outputError(error); } });
  command.command('observe-revision')
    .description('Collect a budgeted pre-active revision observation without authoring or group acceptance')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--authorization-sha256 <digest>', 'Exact stored campaign authorization')
    .option('--gitleaks-bin <path>', 'Mandatory prompt scanner')
    .action(async raw => {
      try {
        const result = await runCampaignRevisionObservation({ repo_root: canonicalRepoPath(raw.repo), authorization_sha256: required(raw.authorizationSha256, '--authorization-sha256'), gitleaks_bin: raw.gitleaksBin }, { readBinding: readBrowserBinding, consult: runBrowserConsult });
        output(result);
        process.exitCode = result.revision_evidence === 'verified' ? 0 : 1;
      } catch (error) { outputError(error); }
    });
  command.command('audit')
    .description('Run a budgeted fresh read-only group audit; unavailable revision proof remains unverified')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--campaign-id <id>', 'Development campaign id')
    .requiredOption('--group-number <number>', 'Current lifecycle group')
    .requiredOption('--intent-sha256 <digest>', 'Exact group intent')
    .requiredOption('--idempotency-key <key>', 'Fresh audit attempt key')
    .option('--gitleaks-bin <path>', 'Mandatory prompt scanner')
    .action(async raw => {
      try { const result = await runCampaignFreshAudit({repo_root:canonicalRepoPath(raw.repo),campaign_id:required(raw.campaignId,'--campaign-id'),group_number:groupNumber(raw.groupNumber),
        intent_sha256:required(raw.intentSha256,'--intent-sha256'),idempotency_key:required(raw.idempotencyKey,'--idempotency-key'),gitleaks_bin:raw.gitleaksBin},
        {readBinding:readBrowserBinding,consult:runBrowserConsult}); output(result); if(result.observation.disposition==='unverified')process.exitCode=1; }
      catch(error){outputError(error);}
    });
  command.command('prepare-resume')
    .description('Emit a zero-provider resume request and its preflight from stored adoption, continuation and budget evidence')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--source-campaign-id <id>', 'Adopted source campaign id')
    .requiredOption('--source-group-number <number>', 'Adopted source group number')
    .requiredOption('--source-intent-sha256 <digest>', 'Adopted source issue batch intent digest')
    .requiredOption('--target-revision <sha>', 'Exact revision the successor campaign is authorized at')
    .option('--superseded-campaign-id <id>', 'Stopped never-adopted successor to replace')
    .option('--superseded-group-number <number>', 'Superseded successor group number')
    .option('--superseded-intent-sha256 <digest>', 'Superseded successor issue batch intent digest')
    .requiredOption('--out <path>', 'New file receiving the emitted resume request JSON')
    .action(options => { try { runCampaignPrepareResume(options); } catch (error) { outputError(error); } });
  command.command('author')
    .description('Persist an IssueBatchIntentV1, then open the GPT Pro authoring lane')
    .option('--resume-from <path>', 'Explicit stopped-campaign source and exact existing Issue identities')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--campaign-id <id>', 'Development campaign id')
    .requiredOption('--group-number <number>', 'Authorized group number')
    .option('--gitleaks-bin <path>', 'Exact gitleaks binary used for mandatory prompt scanning')
    .option('--dry-run', 'Persist intent and render the scanned Oracle command without opening a browser')
    .action(async (options) => { try { await runCampaignAuthor(options); } catch (error) { outputError(error); } });
  command.command('author-followup')
    .description('Reuse an authoring session for missing slots or one explicit Issue edit')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--request <path>', 'Exact fill_missing or edit_issue request JSON')
    .option('--gitleaks-bin <path>', 'Exact gitleaks binary used for mandatory prompt scanning')
    .option('--dry-run', 'Render the scanned follow-up without opening a browser')
    .action(async (options) => { try { await runCampaignAuthorFollowup(options); } catch (error) { outputError(error); } });
  command.command('step')
    .description('Observe authoring or hand one canonical adopted task to its local planning session')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--campaign-id <id>', 'Development campaign id')
    .requiredOption('--group-number <number>', 'Authorized group number')
    .requiredOption('--intent-sha256 <digest>', 'Persisted IssueBatchIntentV1 digest')
    .requiredOption('--idempotency-key <key>', 'Stable step identity for crash-safe replay')
    .option('--host <host>', 'Authorized local planning host: claude or codex')
    .option('--session-id <id>', 'Exact local parent session owning adopted group planning')
    .option('--planning-result <path>', 'Closed local planning outcome and evidence JSON')
    .option('--authorization-id <id>', 'Issued Engineer authorization for one acquired worker handoff')
    .option('--selected', 'Use a caller-selected campaign Task observation; no auto fallback')
    .option('--observation-ref <digest>', 'Server-produced reference required with --selected')
    .option('--assertion-file <path>', 'Complete13-field assertion JSON required with --selected')
    .action(async (options) => { try { await runCampaignHeartbeatStep(options); } catch (error) { outputError(error); } });
  command.command('adopt')
    .description('Verify exact-SHA readback, seal authoring and publish an atomic repair batch candidate')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--campaign-id <id>', 'Development campaign id')
    .requiredOption('--group-number <number>', 'Authorized group number')
    .requiredOption('--intent-sha256 <digest>', 'Persisted issue intent digest')
    .requiredOption('--sprint-path <path>', 'Exact-main Sprint path')
    .requiredOption('--publication-policy <path>', 'Exact-main JSON acceptance, rollback and retry policy')
    .option('--gitleaks-bin <path>', 'Mandatory prompt scanner binary')
    .option('--dry-run', 'Verify adoption without publishing Task, WorkGraph, manifest or refs')
    .action(async options => { try { await runCampaignAdopt(options); } catch (error) { outputError(error); } });
  return command;
}
