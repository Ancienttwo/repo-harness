import {
  assertMessageExactKeys,
  assertMessageInteger,
  assertMessageSha256,
  assertMessageTimestamp,
  canonicalMessageBytes,
  canonicalMessageDigest,
  messageRequiredString,
} from '../messages/mechanics';

export const DEVELOPMENT_CAMPAIGN_SCHEMA_VERSION = 'repo-harness.development-campaign/v1' as const;
export const DEVELOPMENT_CAMPAIGN_EVENT_SCHEMA_VERSION = 'repo-harness.development-campaign-event/v1' as const;
export const DEVELOPMENT_CAMPAIGN_CURRENT_SCHEMA_VERSION = 'repo-harness.development-campaign-current/v1' as const;

export const DEVELOPMENT_CAMPAIGN_STATES = Object.freeze([
  'authorized', 'group_preparing', 'group_running', 'group_auditing', 'group_accepted', 'completed',
  'stopped', 'budget_exhausted', 'human_attention_required', 'reconciliation_required', 'authorization_expired',
] as const);
export type DevelopmentCampaignState = (typeof DEVELOPMENT_CAMPAIGN_STATES)[number];

export const DEVELOPMENT_CAMPAIGN_OPERATIONS = Object.freeze([
  'authorize', 'prepare_group', 'start_group', 'begin_group_audit', 'accept_group', 'complete',
  'stop', 'exhaust_budget', 'require_human_attention', 'require_reconciliation', 'expire_authorization',
] as const);
export type DevelopmentCampaignOperation = (typeof DEVELOPMENT_CAMPAIGN_OPERATIONS)[number];

export interface DevelopmentCampaignDefinitionV1 {
  readonly schemaVersion: typeof DEVELOPMENT_CAMPAIGN_SCHEMA_VERSION;
  readonly campaign_id: string;
  readonly authorization_id: string;
  readonly authorization_sha256: string;
  readonly repository_id: string;
  readonly target_ref: string;
  readonly target_revision: string;
  readonly created_at: string;
  readonly campaign_sha256: string;
}

export interface DevelopmentCampaignEventV1 {
  readonly schemaVersion: typeof DEVELOPMENT_CAMPAIGN_EVENT_SCHEMA_VERSION;
  readonly campaign_id: string;
  readonly revision: number;
  readonly idempotency_key: string;
  readonly operation: DevelopmentCampaignOperation;
  readonly previous_state: DevelopmentCampaignState | null;
  readonly next_state: DevelopmentCampaignState;
  readonly evidence_refs: readonly string[];
  readonly observed_at: string;
  readonly previous_event_sha256: string | null;
  readonly event_sha256: string;
}

export interface DevelopmentCampaignCurrentV1 {
  readonly schemaVersion: typeof DEVELOPMENT_CAMPAIGN_CURRENT_SCHEMA_VERSION;
  readonly campaign_id: string;
  readonly campaign_sha256: string;
  readonly revision: number;
  readonly state: DevelopmentCampaignState;
  readonly current_event_sha256: string;
  readonly current_sha256: string;
}

export class DevelopmentCampaignProtocolError extends Error {
  constructor(readonly code: 'campaign_protocol_invalid' | 'campaign_transition_invalid', message: string) {
    super(message);
    this.name = 'DevelopmentCampaignProtocolError';
  }
}

function invalid(message: string): never { throw new DevelopmentCampaignProtocolError('campaign_protocol_invalid', message); }
function transitionInvalid(message: string): never { throw new DevelopmentCampaignProtocolError('campaign_transition_invalid', message); }
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function opaque(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(result)) invalid(`${field} is invalid`);
  return result;
}
function gitRef(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid);
  if (!/^refs\/[A-Za-z0-9][A-Za-z0-9._/-]{0,158}$/u.test(result) || result.includes('..') || result.endsWith('/')) invalid(`${field} is invalid`);
  return result;
}
function gitObjectId(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(result)) invalid(`${field} is invalid`);
  return result;
}
function authorityDigest(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid);
  if (!/^[0-9a-f]{64}$/u.test(result)) invalid(`${field} is invalid`);
  return result;
}
function sha(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid);
  assertMessageSha256(result, field, invalid);
  return result;
}
function state(value: unknown, field: string): DevelopmentCampaignState {
  if (!DEVELOPMENT_CAMPAIGN_STATES.includes(value as DevelopmentCampaignState)) invalid(`${field} is invalid`);
  return value as DevelopmentCampaignState;
}

const TERMINAL = new Set<DevelopmentCampaignState>(['completed', 'stopped', 'budget_exhausted', 'authorization_expired']);
const NON_TERMINAL = DEVELOPMENT_CAMPAIGN_STATES.filter((value) => !TERMINAL.has(value));
const TRANSITIONS: Readonly<Record<DevelopmentCampaignOperation, readonly (DevelopmentCampaignState | null)[]>> = Object.freeze({
  authorize: [null],
  prepare_group: ['authorized', 'group_accepted'],
  start_group: ['group_preparing'],
  begin_group_audit: ['group_running'],
  accept_group: ['group_auditing'],
  complete: ['group_accepted'],
  stop: NON_TERMINAL,
  exhaust_budget: NON_TERMINAL,
  require_human_attention: NON_TERMINAL,
  require_reconciliation: NON_TERMINAL,
  expire_authorization: NON_TERMINAL,
});
const NEXT: Readonly<Record<DevelopmentCampaignOperation, DevelopmentCampaignState>> = Object.freeze({
  authorize: 'authorized', prepare_group: 'group_preparing', start_group: 'group_running', begin_group_audit: 'group_auditing',
  accept_group: 'group_accepted', complete: 'completed', stop: 'stopped', exhaust_budget: 'budget_exhausted',
  require_human_attention: 'human_attention_required', require_reconciliation: 'reconciliation_required', expire_authorization: 'authorization_expired',
});

export function buildDevelopmentCampaignDefinition(input: Omit<DevelopmentCampaignDefinitionV1, 'schemaVersion' | 'campaign_sha256'>): DevelopmentCampaignDefinitionV1 {
  const basis = {
    schemaVersion: DEVELOPMENT_CAMPAIGN_SCHEMA_VERSION,
    campaign_id: opaque(input.campaign_id, 'campaign_id'),
    authorization_id: opaque(input.authorization_id, 'authorization_id'),
    authorization_sha256: authorityDigest(input.authorization_sha256, 'authorization_sha256'),
    repository_id: opaque(input.repository_id, 'repository_id'),
    target_ref: gitRef(input.target_ref, 'target_ref'),
    target_revision: gitObjectId(input.target_revision, 'target_revision'),
    created_at: input.created_at,
  } as const;
  assertMessageTimestamp(basis.created_at, 'created_at', invalid);
  return Object.freeze({ ...basis, campaign_sha256: canonicalMessageDigest(basis) });
}

export function validateDevelopmentCampaignDefinition(value: unknown): DevelopmentCampaignDefinitionV1 {
  const input = record(value, 'development campaign');
  assertMessageExactKeys(input, ['schemaVersion', 'campaign_id', 'authorization_id', 'authorization_sha256', 'repository_id', 'target_ref', 'target_revision', 'created_at', 'campaign_sha256'], 'development campaign', invalid);
  if (input.schemaVersion !== DEVELOPMENT_CAMPAIGN_SCHEMA_VERSION) invalid('development campaign schemaVersion is unsupported');
  const built = buildDevelopmentCampaignDefinition(input as unknown as Omit<DevelopmentCampaignDefinitionV1, 'schemaVersion' | 'campaign_sha256'>);
  if (input.campaign_sha256 !== built.campaign_sha256) invalid('development campaign digest is stale');
  return built;
}

export function buildDevelopmentCampaignEvent(input: Omit<DevelopmentCampaignEventV1, 'schemaVersion' | 'next_state' | 'event_sha256'>): DevelopmentCampaignEventV1 {
  if (!DEVELOPMENT_CAMPAIGN_OPERATIONS.includes(input.operation)) invalid('operation is invalid');
  const previous = input.previous_state === null ? null : state(input.previous_state, 'previous_state');
  if (!TRANSITIONS[input.operation].includes(previous)) transitionInvalid(`${input.operation} cannot follow ${previous ?? 'empty'}`);
  assertMessageInteger(input.revision, 'revision', 1, invalid);
  assertMessageTimestamp(input.observed_at, 'observed_at', invalid);
  const evidence = [...input.evidence_refs].map((entry, index) => opaque(entry, `evidence_refs[${index}]`));
  const basis = {
    schemaVersion: DEVELOPMENT_CAMPAIGN_EVENT_SCHEMA_VERSION,
    campaign_id: opaque(input.campaign_id, 'campaign_id'), revision: input.revision,
    idempotency_key: opaque(input.idempotency_key, 'idempotency_key'), operation: input.operation,
    previous_state: previous, next_state: NEXT[input.operation], evidence_refs: evidence,
    observed_at: input.observed_at,
    previous_event_sha256: input.previous_event_sha256 === null ? null : sha(input.previous_event_sha256, 'previous_event_sha256'),
  } as const;
  return Object.freeze({ ...basis, evidence_refs: Object.freeze(evidence), event_sha256: canonicalMessageDigest(basis) });
}

export function validateDevelopmentCampaignEvent(value: unknown): DevelopmentCampaignEventV1 {
  const input = record(value, 'development campaign event');
  assertMessageExactKeys(input, ['schemaVersion', 'campaign_id', 'revision', 'idempotency_key', 'operation', 'previous_state', 'next_state', 'evidence_refs', 'observed_at', 'previous_event_sha256', 'event_sha256'], 'development campaign event', invalid);
  if (input.schemaVersion !== DEVELOPMENT_CAMPAIGN_EVENT_SCHEMA_VERSION || !Array.isArray(input.evidence_refs)) invalid('development campaign event shape is invalid');
  const built = buildDevelopmentCampaignEvent(input as unknown as Omit<DevelopmentCampaignEventV1, 'schemaVersion' | 'next_state' | 'event_sha256'>);
  if (input.next_state !== built.next_state || input.event_sha256 !== built.event_sha256) invalid('development campaign event derived fields are stale');
  return built;
}

export function foldDevelopmentCampaignCurrent(campaign: DevelopmentCampaignDefinitionV1, events: readonly DevelopmentCampaignEventV1[]): DevelopmentCampaignCurrentV1 {
  let previous: DevelopmentCampaignEventV1 | null = null;
  for (const event of events) {
    if (event.campaign_id !== campaign.campaign_id || event.revision !== (previous?.revision ?? 0) + 1
      || event.previous_event_sha256 !== (previous?.event_sha256 ?? null)
      || event.previous_state !== (previous?.next_state ?? null)) transitionInvalid('development campaign event chain is not contiguous');
    if (previous && Date.parse(event.observed_at) < Date.parse(previous.observed_at)) transitionInvalid('development campaign event time moved backwards');
    previous = event;
  }
  if (!previous) transitionInvalid('development campaign has no events');
  const basis = { schemaVersion: DEVELOPMENT_CAMPAIGN_CURRENT_SCHEMA_VERSION, campaign_id: campaign.campaign_id, campaign_sha256: campaign.campaign_sha256, revision: previous.revision, state: previous.next_state, current_event_sha256: previous.event_sha256 } as const;
  return Object.freeze({ ...basis, current_sha256: canonicalMessageDigest(basis) });
}

export function validateDevelopmentCampaignCurrent(value: unknown): DevelopmentCampaignCurrentV1 {
  const input = record(value, 'development campaign current');
  assertMessageExactKeys(input, ['schemaVersion', 'campaign_id', 'campaign_sha256', 'revision', 'state', 'current_event_sha256', 'current_sha256'], 'development campaign current', invalid);
  if (input.schemaVersion !== DEVELOPMENT_CAMPAIGN_CURRENT_SCHEMA_VERSION) invalid('development campaign current schemaVersion is unsupported');
  assertMessageInteger(input.revision, 'revision', 1, invalid);
  const basis = {
    schemaVersion: DEVELOPMENT_CAMPAIGN_CURRENT_SCHEMA_VERSION,
    campaign_id: opaque(input.campaign_id, 'campaign_id'), campaign_sha256: sha(input.campaign_sha256, 'campaign_sha256'),
    revision: input.revision as number, state: state(input.state, 'state'), current_event_sha256: sha(input.current_event_sha256, 'current_event_sha256'),
  } as const;
  const current = Object.freeze({ ...basis, current_sha256: canonicalMessageDigest(basis) });
  if (input.current_sha256 !== current.current_sha256) invalid('development campaign current digest is stale');
  return current;
}

export const canonicalDevelopmentCampaignDefinitionBytes = (value: DevelopmentCampaignDefinitionV1): string => canonicalMessageBytes(validateDevelopmentCampaignDefinition(value) as unknown as Record<string, unknown>);
export const canonicalDevelopmentCampaignEventBytes = (value: DevelopmentCampaignEventV1): string => canonicalMessageBytes(validateDevelopmentCampaignEvent(value) as unknown as Record<string, unknown>);
export const canonicalDevelopmentCampaignCurrentBytes = (value: DevelopmentCampaignCurrentV1): string => canonicalMessageBytes(validateDevelopmentCampaignCurrent(value) as unknown as Record<string, unknown>);
