import { Command } from 'commander';
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
      || error instanceof GptProIssueAuthoringError || error instanceof IssueBatchStoreError || error instanceof IssueBatchProtocolError ? error.code
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
  const createdAt = raw.observedAt?.trim() || new Date().toISOString();
  const campaign = buildDevelopmentCampaignDefinition({
    campaign_id: authorization.campaign.campaign_id,
    authorization_id: authorization.authorization_id,
    authorization_sha256: authorization.authorization_sha256,
    repository_id: authorization.repository_id,
    target_ref: authorization.target_ref,
    target_revision: authorization.target_revision,
    created_at: createdAt,
  });
  output(createDevelopmentCampaign({ repo_root: repo, campaign, idempotency_key: required(raw.idempotencyKey, '--idempotency-key') }));
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
  }));
}

export async function runCampaignAuthorFollowup(raw: { readonly repo?: string; readonly request?: string; readonly dryRun?: boolean; readonly gitleaksBin?: string }): Promise<void> {
  const request = requestJson(raw.request);
  const operation = request.operation;
  if (operation !== 'fill_missing' && operation !== 'edit_issue') throw new CampaignArgumentError('author follow-up operation must be fill_missing or edit_issue');
  const expected = operation === 'edit_issue'
    ? ['campaign_id', 'group_number', 'intent_sha256', 'operation', 'provider_issue_id', 'requested_slots', 'source_session_ref']
    : ['campaign_id', 'group_number', 'intent_sha256', 'operation', 'requested_slots', 'source_session_ref'];
  if (JSON.stringify(Object.keys(request).sort()) !== JSON.stringify(expected)) throw new CampaignArgumentError('author follow-up request fields are invalid');
  if (!Array.isArray(request.requested_slots) || !request.requested_slots.every((entry) => typeof entry === 'string')) throw new CampaignArgumentError('author follow-up requested_slots must be an array of strings');
  output(await continueIssueBatchAuthoring({
    repo_root: raw.repo?.trim() || process.cwd(), campaign_id: requestString(request.campaign_id, 'request.campaign_id'),
    group_number: groupNumber(typeof request.group_number === 'number' ? String(request.group_number) : undefined), intent_sha256: requestString(request.intent_sha256, 'request.intent_sha256'),
    source_session_ref: requestString(request.source_session_ref, 'request.source_session_ref'), operation,
    requested_slots: request.requested_slots as IssueBatchSlot[], provider_issue_id: operation === 'edit_issue' ? requestString(request.provider_issue_id, 'request.provider_issue_id') : undefined,
    dry_run: raw.dryRun === true, gitleaks_bin: raw.gitleaksBin?.trim(),
  }));
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
  return command;
}
