import { Command } from 'commander';
import { AutomationBudgetStoreError } from '../../effects/automation/budget-store';
import { adoptIssueBatch } from '../../effects/automation/issue-batch-adoption';
import { IssueBatchAdoptionError } from '../../core/automation/issue-batch-adoption';
import { ConnectorChallengeError } from '../../core/automation/connector-challenge';
import { readBrowserBinding } from '../chatgpt-browser/binding';
import { runBrowserConsult, runBrowserFollowup, readSession } from '../chatgpt-browser/engine';
import { readFileSync } from 'fs';

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
    : error instanceof DevelopmentCampaignStoreError || error instanceof DevelopmentCampaignPolicyError
      || error instanceof GptProIssueAuthoringError || error instanceof IssueBatchStoreError || error instanceof IssueBatchProtocolError
      || error instanceof AutomationBudgetStoreError || error instanceof IssueBatchAdoptionError || error instanceof ConnectorChallengeError || error instanceof CampaignStepError || error instanceof IssueBatchObserverError || error instanceof IssueBatchReconcileError ? error.code
      : 'campaign_unavailable';
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message: error instanceof Error ? error.message : String(error) })}\n`);
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
  const repo = raw.repo?.trim() || process.cwd();
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
  output(appendDevelopmentCampaignEvent({ ...request, repo_root: raw.repo?.trim() || process.cwd() }));
}

export function runCampaignStatus(raw: { readonly repo?: string; readonly campaignId?: string }): void {
  output(readDevelopmentCampaignStatus(raw.repo?.trim() || process.cwd(), required(raw.campaignId, '--campaign-id')));
}

function groupNumber(value: string | undefined): number {
  const parsed = Number(required(value, '--group-number'));
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 3) throw new CampaignArgumentError('--group-number must be 1, 2, or 3');
  return parsed;
}

export async function runCampaignAuthor(raw: { readonly repo?: string; readonly campaignId?: string; readonly groupNumber?: string; readonly dryRun?: boolean; readonly gitleaksBin?: string }): Promise<void> {
  output(await startIssueBatchAuthoring({
    repo_root: raw.repo?.trim() || process.cwd(), campaign_id: required(raw.campaignId, '--campaign-id'),
    group_number: groupNumber(raw.groupNumber), dry_run: raw.dryRun === true, gitleaks_bin: raw.gitleaksBin?.trim(),
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
    repo_root: raw.repo?.trim() || process.cwd(), campaign_id: requestString(request.campaign_id, 'request.campaign_id'),
    group_number: groupNumber(typeof request.group_number === 'number' ? String(request.group_number) : undefined), intent_sha256: requestString(request.intent_sha256, 'request.intent_sha256'),
    source_session_ref: requestString(request.source_session_ref, 'request.source_session_ref'), operation,
    requested_slots: request.requested_slots as IssueBatchSlot[], provider_issue_id: operation === 'edit_issue' ? requestString(request.provider_issue_id, 'request.provider_issue_id') : undefined,
    provider_issue_url: operation === 'edit_issue' ? requestString(request.provider_issue_url, 'request.provider_issue_url') : undefined,
    dry_run: raw.dryRun === true, gitleaks_bin: raw.gitleaksBin?.trim(),
  }, { readBinding: readBrowserBinding, followup: runBrowserFollowup }));
}

export async function runCampaignHeartbeatStep(raw: { readonly repo?: string; readonly campaignId?: string; readonly groupNumber?: string; readonly intentSha256?: string; readonly idempotencyKey?: string }): Promise<void> {
  output(await runCampaignStep({
    repo_root: raw.repo?.trim() || process.cwd(),
    campaign_id: required(raw.campaignId, '--campaign-id'),
    group_number: groupNumber(raw.groupNumber),
    intent_sha256: required(raw.intentSha256, '--intent-sha256'),
    idempotency_key: required(raw.idempotencyKey, '--idempotency-key'),
  }, { readBinding: readBrowserBinding, followup: runBrowserFollowup }));
}

export async function runCampaignAdopt(raw: { readonly repo?: string; readonly campaignId?: string; readonly groupNumber?: string; readonly intentSha256?: string; readonly sprintPath?: string; readonly publicationPolicy?: string; readonly dryRun?: boolean; readonly gitleaksBin?: string }): Promise<void> {
  output(await adoptIssueBatch({ repo_root: raw.repo?.trim() || process.cwd(), campaign_id: required(raw.campaignId, '--campaign-id'),
    group_number: groupNumber(raw.groupNumber), intent_sha256: required(raw.intentSha256, '--intent-sha256'), sprint_path: required(raw.sprintPath, '--sprint-path'),
    publication_policy_path: required(raw.publicationPolicy, '--publication-policy'), dry_run: raw.dryRun === true, gitleaks_bin: raw.gitleaksBin?.trim(),
  }, { readBinding: readBrowserBinding, followup: runBrowserFollowup, readSession }));
}

export function buildCampaignCommand(): Command {
  const command = new Command('campaign').description('Operate the authorized development campaign state machine');
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
  command.command('author')
    .description('Persist an IssueBatchIntentV1, then open the GPT Pro authoring lane')
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
    .description('Observe an in-flight Issue batch and perform at most one reserved external mutation')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--campaign-id <id>', 'Development campaign id')
    .requiredOption('--group-number <number>', 'Authorized group number')
    .requiredOption('--intent-sha256 <digest>', 'Persisted IssueBatchIntentV1 digest')
    .requiredOption('--idempotency-key <key>', 'Stable step identity for crash-safe replay')
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
