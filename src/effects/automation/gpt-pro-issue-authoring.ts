import { resolve } from 'path';

import { messageSha256 } from '../../core/messages/mechanics';
import {
  buildIssueAuthoringSession,
  buildIssueBatchIntent,
  renderIssueBatchMarker,
  type IssueAuthoringOperation,
  type IssueAuthoringSessionV1,
  type IssueBatchIntentV1,
  type IssueBatchSlot,
} from '../../core/automation/issue-batch';
import { readStoredProgramAuthorization } from './grant-store';
import { readDevelopmentCampaignStatus } from './development-campaign-store';
import { readCampaignExternalSourcesPolicyAtRevision } from './development-campaign-policy';
import { requireManualGithubPolicy } from '../external-sources/policy';
import { readBrowserBinding } from '../../cli/chatgpt-browser/binding';
import { runBrowserConsult, runBrowserFollowup } from '../../cli/chatgpt-browser/engine';
import type { BrowserConsultInput, BrowserConsultResult } from '../../cli/chatgpt-browser/types';
import { persistIssueAuthoringSession, persistIssueBatchIntent, readIssueBatchIntent } from './issue-batch-store';

const GPT_PRO_MODEL = 'gpt-5.5-pro';

export class GptProIssueAuthoringError extends Error {
  constructor(readonly code: 'issue_authoring_invalid' | 'issue_authoring_state_invalid' | 'issue_authoring_profile_mismatch', message: string) {
    super(message);
    this.name = 'GptProIssueAuthoringError';
  }
}

export interface IssueAuthoringDependencies {
  readonly consult?: (input: BrowserConsultInput) => Promise<BrowserConsultResult>;
  readonly followup?: (input: Omit<BrowserConsultInput, 'sourceSessionId'> & { sessionId: string }) => Promise<BrowserConsultResult>;
  readonly now?: () => string;
}

export interface StartIssueBatchAuthoringInput {
  readonly repo_root: string;
  readonly campaign_id: string;
  readonly group_number: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly dry_run?: boolean;
  readonly gitleaks_bin?: string;
}

export interface ContinueIssueBatchAuthoringInput extends StartIssueBatchAuthoringInput {
  readonly intent_sha256: string;
  readonly source_session_ref: string;
  readonly operation: 'fill_missing' | 'edit_issue';
  readonly requested_slots: readonly IssueBatchSlot[];
  readonly provider_issue_id?: string;
}

function fail(code: GptProIssueAuthoringError['code'], message: string): never { throw new GptProIssueAuthoringError(code, message); }
function exactSlots(value: readonly IssueBatchSlot[], intent: IssueBatchIntentV1): readonly IssueBatchSlot[] {
  if (value.length === 0 || value.length > intent.slots.length || new Set(value).size !== value.length || JSON.stringify(value) !== JSON.stringify([...value].sort())
    || value.some((slot) => !intent.slots.includes(slot))) fail('issue_authoring_invalid', 'requested slots must be a sorted unique subset of the intent');
  return Object.freeze([...value]);
}

function markerExamples(intent: Pick<IssueBatchIntentV1, 'campaign_id' | 'group_number'>, slots: readonly IssueBatchSlot[]): string {
  return slots.map((slot) => `Slot ${slot}:\n${renderIssueBatchMarker(intent.campaign_id, intent.group_number, slot)}`).join('\n\n');
}

export function buildIssueAuthoringPrompt(intent: Omit<IssueBatchIntentV1, 'prompt_sha256' | 'intent_sha256'>, operation: IssueAuthoringOperation, requestedSlots: readonly IssueBatchSlot[], providerIssueId: string | null): string {
  const action = operation === 'initial'
    ? `Create exactly one GitHub Issue for each listed slot: ${requestedSlots.join(', ')}.`
    : operation === 'fill_missing'
      ? `In the existing authoring conversation, create Issues only for these missing slots: ${requestedSlots.join(', ')}. Do not edit or duplicate any other slot.`
      : `Edit existing GitHub Issue ${providerIssueId} so its body has the exact marker for slot ${requestedSlots[0]}. Do not create a new Issue.`;
  return [
    'You are the GPT Pro Issue Author for a bounded repo-harness repair campaign.',
    `Target GitHub repository: ${intent.provider_repository}`,
    `Registered repository id: ${intent.repository_id}`,
    `Read exact ref ${intent.target_ref} at commit ${intent.base_main_sha}. Do not read or act on another revision.`,
    action,
    `Allowed issue kinds: ${intent.allowed_issue_kinds.join(', ')}.`,
    'You may read that exact commit and create the requested Issues, or edit only the explicitly named Issue. Do not change code, branches, PRs, labels, milestones, assignees, or close Issues.',
    'The title prefix is display-only. The body marker below is the sole slot authority. Copy it exactly; do not add hashes, digests, or extra keys inside the marker.',
    markerExamples(intent, requestedSlots),
    'Each Issue body must also state the audit baseline and contain strict JSON metadata with protocol=1, kind=repo-harness-campaign-issue-metadata, issue_kind, primary_capability, priority, depends_on_slots, and suspected_paths.',
    'Do not claim success for an Issue you did not observe GitHub create or update. Return a concise action log; the local controller will independently read GitHub.',
  ].join('\n\n');
}

function context(input: StartIssueBatchAuthoringInput) {
  const repoRoot = resolve(input.repo_root);
  const status = readDevelopmentCampaignStatus(repoRoot, input.campaign_id, input.env);
  if (status.current.state !== 'group_preparing') fail('issue_authoring_state_invalid', 'issue authoring requires campaign state group_preparing');
  const authorization = readStoredProgramAuthorization(repoRoot, status.campaign.authorization_sha256, input.env);
  if (authorization.campaign === null) fail('issue_authoring_invalid', 'campaign authorization payload is missing');
  if (input.group_number < 1 || input.group_number > authorization.campaign.group_count) fail('issue_authoring_invalid', 'group_number exceeds campaign authorization');
  const externalPolicy = requireManualGithubPolicy(readCampaignExternalSourcesPolicyAtRevision(repoRoot, status.campaign.target_revision));
  const bindingResult = readBrowserBinding(repoRoot);
  if (bindingResult.error || !bindingResult.binding?.profileDir || !bindingResult.binding.profileDirectory) fail('issue_authoring_profile_mismatch', `ChatGPT browser binding is unavailable: ${bindingResult.error ?? bindingResult.path}`);
  if (bindingResult.binding.profileDirectory !== authorization.campaign.chrome_profile_directory) fail('issue_authoring_profile_mismatch', 'ChatGPT browser profile does not match the campaign authorization');
  return { repoRoot, status, authorization, externalPolicy, binding: bindingResult.binding };
}

function browserInput(repoRoot: string, prompt: string, profileDir: string, profileDirectory: string, input: StartIssueBatchAuthoringInput): BrowserConsultInput {
  return {
    repoRoot, title: `${input.campaign_id} group ${input.group_number} issue authoring`, prompt,
    provider: 'oracle', model: GPT_PRO_MODEL, requireSecretScan: true, gitleaksBin: input.gitleaks_bin,
    profileDir, profileDirectory, dryRun: input.dry_run === true,
  };
}

function persistSession(repoRoot: string, intent: IssueBatchIntentV1, operation: IssueAuthoringOperation, requestedSlots: readonly IssueBatchSlot[], providerIssueId: string | null, sourceSessionRef: string | null, result: BrowserConsultResult, createdAt: string): IssueAuthoringSessionV1 {
  return persistIssueAuthoringSession(repoRoot, intent.campaign_id, intent.group_number, buildIssueAuthoringSession({
    intent_sha256: intent.intent_sha256, operation, requested_slots: requestedSlots, provider_issue_id: providerIssueId,
    session_ref: result.sessionId, source_session_ref: sourceSessionRef, browser_status: result.status,
    verification: result.meta.model.verified === true ? 'verified' : 'unverified', created_at: createdAt,
  }));
}

export async function startIssueBatchAuthoring(input: StartIssueBatchAuthoringInput, deps: IssueAuthoringDependencies = {}) {
  const value = context(input);
  const createdAt = (deps.now ?? (() => new Date().toISOString()))();
  const slots = Object.freeze(Array.from({ length: value.authorization.campaign!.issues_per_group }, (_, index) => String(index + 1).padStart(2, '0') as IssueBatchSlot));
  const draft = {
    campaign_id: input.campaign_id, group_number: input.group_number,
    repository_id: value.status.campaign.repository_id, provider_repository: value.externalPolicy.github.repository,
    target_ref: value.status.campaign.target_ref, base_main_sha: value.status.campaign.target_revision,
    slots, allowed_issue_kinds: value.authorization.campaign!.allowed_issue_kinds,
    authoring_policy_sha256: value.externalPolicy.policy_revision,
    authoring_parent: value.authorization.campaign!.local_parent_host,
    gpt_pro_transport: 'oracle_browser' as const, browser_transport: 'copy_profile' as const,
    chrome_profile_directory: value.authorization.campaign!.chrome_profile_directory,
    created_at: createdAt, expires_at: value.authorization.expires_at,
  };
  const prompt = buildIssueAuthoringPrompt({ ...draft, protocol: 1, kind: 'repo-harness-issue-batch-intent' }, 'initial', slots, null);
  const intent = buildIssueBatchIntent({ ...draft, prompt_sha256: messageSha256(prompt) });
  persistIssueBatchIntent(value.repoRoot, intent);
  const result = await (deps.consult ?? runBrowserConsult)(browserInput(value.repoRoot, prompt, value.binding.profileDir, value.binding.profileDirectory!, input));
  const session = persistSession(value.repoRoot, intent, 'initial', slots, null, null, result, createdAt);
  return Object.freeze({ intent, session, browser: result });
}

export async function continueIssueBatchAuthoring(input: ContinueIssueBatchAuthoringInput, deps: IssueAuthoringDependencies = {}) {
  const value = context(input);
  const intent = readIssueBatchIntent(value.repoRoot, input.campaign_id, input.group_number, input.intent_sha256);
  if (intent.repository_id !== value.status.campaign.repository_id || intent.provider_repository !== value.externalPolicy.github.repository
    || intent.target_ref !== value.status.campaign.target_ref || intent.base_main_sha !== value.status.campaign.target_revision
    || intent.chrome_profile_directory !== value.authorization.campaign!.chrome_profile_directory) fail('issue_authoring_invalid', 'issue batch intent binding is stale');
  const requested = exactSlots(input.requested_slots, intent);
  const providerIssueId = input.operation === 'edit_issue' ? input.provider_issue_id?.trim() || null : null;
  if (input.operation === 'edit_issue' && (requested.length !== 1 || providerIssueId === null)) fail('issue_authoring_invalid', 'edit_issue requires one slot and provider_issue_id');
  if (input.operation === 'fill_missing' && input.provider_issue_id !== undefined) fail('issue_authoring_invalid', 'fill_missing forbids provider_issue_id');
  const prompt = buildIssueAuthoringPrompt(intent, input.operation, requested, providerIssueId);
  const result = await (deps.followup ?? runBrowserFollowup)({
    ...browserInput(value.repoRoot, prompt, value.binding.profileDir, value.binding.profileDirectory!, input),
    sessionId: input.source_session_ref,
  });
  const createdAt = (deps.now ?? (() => new Date().toISOString()))();
  const session = persistSession(value.repoRoot, intent, input.operation, requested, providerIssueId, input.source_session_ref, result, createdAt);
  return Object.freeze({ intent, session, browser: result });
}
