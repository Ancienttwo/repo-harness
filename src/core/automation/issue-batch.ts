import {
  assertMessageExactKeys,
  assertMessageInteger,
  assertMessageSha256,
  assertMessageTimestamp,
  canonicalMessageBytes,
  canonicalMessageDigest,
  messageRequiredString,
} from '../messages/mechanics';

export const ISSUE_BATCH_INTENT_KIND = 'repo-harness-issue-batch-intent' as const;
export const ISSUE_AUTHORING_SESSION_KIND = 'repo-harness-issue-authoring-session' as const;
export const REPAIR_CAMPAIGN_ISSUE_KINDS = Object.freeze(['bugfix', 'test_gap'] as const);
export type RepairCampaignIssueKind = (typeof REPAIR_CAMPAIGN_ISSUE_KINDS)[number];
export type IssueBatchSlot = `${0 | 1}${number}`;
export type IssueAuthoringOperation = 'initial' | 'fill_missing' | 'edit_issue';

export interface IssueBatchIntentV1 {
  readonly protocol: 1;
  readonly kind: typeof ISSUE_BATCH_INTENT_KIND;
  readonly campaign_id: string;
  readonly group_number: number;
  readonly repository_id: string;
  readonly provider_repository: string;
  readonly target_ref: string;
  readonly base_main_sha: string;
  readonly slots: readonly IssueBatchSlot[];
  readonly allowed_issue_kinds: readonly RepairCampaignIssueKind[];
  readonly prompt_sha256: string;
  readonly authoring_policy_sha256: string;
  readonly authoring_parent: 'claude' | 'codex';
  readonly gpt_pro_transport: 'oracle_browser';
  readonly browser_transport: 'copy_profile';
  readonly chrome_profile_directory: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly intent_sha256: string;
}

export interface IssueAuthoringSessionV1 {
  readonly protocol: 1;
  readonly kind: typeof ISSUE_AUTHORING_SESSION_KIND;
  readonly intent_sha256: string;
  readonly operation: IssueAuthoringOperation;
  readonly requested_slots: readonly IssueBatchSlot[];
  readonly provider_issue_id: string | null;
  readonly session_ref: string;
  readonly source_session_ref: string | null;
  readonly browser_status: 'completed' | 'running' | 'recoverable' | 'incomplete_capture' | 'failed' | 'cancelled' | 'dry_run';
  readonly verification: 'verified' | 'unverified';
  readonly created_at: string;
  readonly session_sha256: string;
}

export interface IssueBatchMarkerV1 {
  readonly campaign_id: string;
  readonly group_number: number;
  readonly slot: string;
}

export class IssueBatchProtocolError extends Error {
  constructor(readonly code: 'issue_batch_invalid' | 'issue_authoring_session_unverified', message: string) {
    super(message);
    this.name = 'IssueBatchProtocolError';
  }
}

function invalid(message: string): never { throw new IssueBatchProtocolError('issue_batch_invalid', message); }
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function opaque(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(result)) invalid(`${field} is invalid`);
  return result;
}
function digest(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid);
  assertMessageSha256(result, field, invalid);
  return result;
}
function gitObjectId(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(result)) invalid(`${field} is invalid`);
  return result;
}
function gitRef(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid);
  if (!/^refs\/[A-Za-z0-9][A-Za-z0-9._/-]{0,158}$/u.test(result) || result.includes('..') || result.endsWith('/')) invalid(`${field} is invalid`);
  return result;
}
function providerRepository(value: unknown): string {
  const result = messageRequiredString(value, 'provider_repository', invalid);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(result)) invalid('provider_repository is invalid');
  return result;
}
function chromeProfileDirectory(value: unknown): string {
  const result = messageRequiredString(value, 'chrome_profile_directory', invalid);
  if (result.trim() !== result || result.length > 128 || result.includes('/') || result.includes('\\')) invalid('chrome_profile_directory is invalid');
  return result;
}
function slots(value: unknown): readonly IssueBatchSlot[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) invalid('slots must contain from 1 to 10 entries');
  const expected = Array.from({ length: value.length }, (_, index) => String(index + 1).padStart(2, '0'));
  if (JSON.stringify(value) !== JSON.stringify(expected)) invalid('slots must be the contiguous prefix 01..10');
  return Object.freeze([...value]) as readonly IssueBatchSlot[];
}
function requestedSlots(value: unknown): readonly IssueBatchSlot[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10 || value.some((entry) => typeof entry !== 'string' || !/^(?:0[1-9]|10)$/u.test(entry))) {
    invalid('requested_slots must contain from 1 to 10 valid slots');
  }
  if (new Set(value).size !== value.length || JSON.stringify(value) !== JSON.stringify([...value].sort())) invalid('requested_slots must be sorted and unique');
  return Object.freeze([...value]) as readonly IssueBatchSlot[];
}
function issueKinds(value: unknown): readonly RepairCampaignIssueKind[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => !REPAIR_CAMPAIGN_ISSUE_KINDS.includes(entry as RepairCampaignIssueKind))) {
    invalid('allowed_issue_kinds is invalid');
  }
  if (new Set(value).size !== value.length || JSON.stringify(value) !== JSON.stringify([...value].sort())) invalid('allowed_issue_kinds must be sorted and unique');
  return Object.freeze([...value]) as readonly RepairCampaignIssueKind[];
}

export function buildIssueBatchIntent(input: Omit<IssueBatchIntentV1, 'protocol' | 'kind' | 'intent_sha256'>): IssueBatchIntentV1 {
  assertMessageInteger(input.group_number, 'group_number', 1, invalid);
  assertMessageTimestamp(input.created_at, 'created_at', invalid);
  assertMessageTimestamp(input.expires_at, 'expires_at', invalid);
  if (Date.parse(input.expires_at) <= Date.parse(input.created_at)) invalid('expires_at must be after created_at');
  if (input.authoring_parent !== 'claude' && input.authoring_parent !== 'codex') invalid('authoring_parent is invalid');
  if (input.gpt_pro_transport !== 'oracle_browser' || input.browser_transport !== 'copy_profile') invalid('authoring transport is invalid');
  const basis = {
    protocol: 1 as const,
    kind: ISSUE_BATCH_INTENT_KIND,
    campaign_id: opaque(input.campaign_id, 'campaign_id'),
    group_number: input.group_number,
    repository_id: opaque(input.repository_id, 'repository_id'),
    provider_repository: providerRepository(input.provider_repository),
    target_ref: gitRef(input.target_ref, 'target_ref'),
    base_main_sha: gitObjectId(input.base_main_sha, 'base_main_sha'),
    slots: slots(input.slots),
    allowed_issue_kinds: issueKinds(input.allowed_issue_kinds),
    prompt_sha256: digest(input.prompt_sha256, 'prompt_sha256'),
    authoring_policy_sha256: digest(input.authoring_policy_sha256, 'authoring_policy_sha256'),
    authoring_parent: input.authoring_parent,
    gpt_pro_transport: input.gpt_pro_transport,
    browser_transport: input.browser_transport,
    chrome_profile_directory: chromeProfileDirectory(input.chrome_profile_directory),
    created_at: input.created_at,
    expires_at: input.expires_at,
  } as const;
  return Object.freeze({ ...basis, intent_sha256: canonicalMessageDigest(basis) });
}

export function validateIssueBatchIntent(value: unknown): IssueBatchIntentV1 {
  const input = record(value, 'issue batch intent');
  assertMessageExactKeys(input, ['protocol', 'kind', 'campaign_id', 'group_number', 'repository_id', 'provider_repository', 'target_ref', 'base_main_sha', 'slots', 'allowed_issue_kinds', 'prompt_sha256', 'authoring_policy_sha256', 'authoring_parent', 'gpt_pro_transport', 'browser_transport', 'chrome_profile_directory', 'created_at', 'expires_at', 'intent_sha256'], 'issue batch intent', invalid);
  if (input.protocol !== 1 || input.kind !== ISSUE_BATCH_INTENT_KIND) invalid('issue batch intent protocol is unsupported');
  const built = buildIssueBatchIntent(input as unknown as Omit<IssueBatchIntentV1, 'protocol' | 'kind' | 'intent_sha256'>);
  if (input.intent_sha256 !== built.intent_sha256) invalid('issue batch intent digest is stale');
  return built;
}

export function buildIssueAuthoringSession(input: Omit<IssueAuthoringSessionV1, 'protocol' | 'kind' | 'session_sha256'>): IssueAuthoringSessionV1 {
  if (!['initial', 'fill_missing', 'edit_issue'].includes(input.operation)) invalid('authoring operation is invalid');
  const requested = requestedSlots(input.requested_slots);
  const providerIssueId = input.provider_issue_id === null ? null : opaque(input.provider_issue_id, 'provider_issue_id');
  if ((input.operation === 'edit_issue') !== (providerIssueId !== null)) invalid('edit_issue requires provider_issue_id and other operations forbid it');
  if (input.operation === 'edit_issue' && requested.length !== 1) invalid('edit_issue requires exactly one slot');
  if (!['completed', 'running', 'recoverable', 'incomplete_capture', 'failed', 'cancelled', 'dry_run'].includes(input.browser_status)) invalid('browser_status is invalid');
  if (input.verification !== 'verified' && input.verification !== 'unverified') invalid('verification is invalid');
  assertMessageTimestamp(input.created_at, 'created_at', invalid);
  const basis = {
    protocol: 1 as const, kind: ISSUE_AUTHORING_SESSION_KIND,
    intent_sha256: digest(input.intent_sha256, 'intent_sha256'), operation: input.operation,
    requested_slots: requested, provider_issue_id: providerIssueId,
    session_ref: opaque(input.session_ref, 'session_ref'),
    source_session_ref: input.source_session_ref === null ? null : opaque(input.source_session_ref, 'source_session_ref'),
    browser_status: input.browser_status, verification: input.verification, created_at: input.created_at,
  } as const;
  return Object.freeze({ ...basis, session_sha256: canonicalMessageDigest(basis) });
}

export function validateIssueAuthoringSession(value: unknown): IssueAuthoringSessionV1 {
  const input = record(value, 'issue authoring session');
  assertMessageExactKeys(input, ['protocol', 'kind', 'intent_sha256', 'operation', 'requested_slots', 'provider_issue_id', 'session_ref', 'source_session_ref', 'browser_status', 'verification', 'created_at', 'session_sha256'], 'issue authoring session', invalid);
  if (input.protocol !== 1 || input.kind !== ISSUE_AUTHORING_SESSION_KIND) invalid('issue authoring session protocol is unsupported');
  const built = buildIssueAuthoringSession(input as unknown as Omit<IssueAuthoringSessionV1, 'protocol' | 'kind' | 'session_sha256'>);
  if (input.session_sha256 !== built.session_sha256) invalid('issue authoring session digest is stale');
  return built;
}

export function renderIssueBatchMarker(campaignId: string, groupNumber: number, slot: string): string {
  const campaign = opaque(campaignId, 'campaign_id');
  assertMessageInteger(groupNumber, 'group_number', 1, invalid);
  if (!/^\d{2}$/u.test(slot)) invalid('slot is invalid');
  return `<!-- repo-harness-campaign:v1\ncampaign_id=${campaign}\ngroup=${groupNumber}\nslot=${slot}\n-->`;
}

export function parseIssueBatchMarker(body: string): IssueBatchMarkerV1 | null {
  if (body.split('<!-- repo-harness-campaign:v1').length !== 2) return null;
  const matches = [...body.matchAll(/<!-- repo-harness-campaign:v1\ncampaign_id=([A-Za-z0-9][A-Za-z0-9._:/-]{0,255})\ngroup=([1-9]\d*)\nslot=(\d{2})\n-->/gu)];
  if (matches.length !== 1) return null;
  return Object.freeze({ campaign_id: matches[0]![1]!, group_number: Number(matches[0]![2]!), slot: matches[0]![3]! });
}

export function declaredIssueBatchSlot(intent: IssueBatchIntentV1, body: string): IssueBatchSlot | null {
  const marker = parseIssueBatchMarker(body);
  if (!marker || marker.campaign_id !== intent.campaign_id || marker.group_number !== intent.group_number || !intent.slots.includes(marker.slot as IssueBatchSlot)) return null;
  return marker.slot as IssueBatchSlot;
}

export function requireVerifiedIssueAuthoringSession(session: IssueAuthoringSessionV1): void {
  if (session.verification !== 'verified') throw new IssueBatchProtocolError('issue_authoring_session_unverified', 'issue authoring session is unverified and cannot be adopted');
}

export const canonicalIssueBatchIntentBytes = (value: IssueBatchIntentV1): string => canonicalMessageBytes(validateIssueBatchIntent(value) as unknown as Record<string, unknown>);
export const canonicalIssueAuthoringSessionBytes = (value: IssueAuthoringSessionV1): string => canonicalMessageBytes(validateIssueAuthoringSession(value) as unknown as Record<string, unknown>);
