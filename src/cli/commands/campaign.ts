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
    : error instanceof DevelopmentCampaignStoreError || error instanceof DevelopmentCampaignPolicyError ? error.code
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
  return command;
}
