import {
  automationDigest,
  type AutomationEvidenceRefV1,
  type CampaignAutomationReservationContextV1,
  type ProgramAuthorizationV1,
} from './budget';

export const CAMPAIGN_AUTHORING_TERMINAL_PROTOCOL = 1 as const;
export const CAMPAIGN_AUTHORING_TERMINAL_KIND = 'repo-harness-campaign-authoring-terminal' as const;

export type CampaignAuthoringTerminalReason = 'authoring_completed' | 'authoring_exhausted';

export interface CampaignAuthoringBudgetTerminalV1 {
  readonly protocol: typeof CAMPAIGN_AUTHORING_TERMINAL_PROTOCOL;
  readonly kind: typeof CAMPAIGN_AUTHORING_TERMINAL_KIND;
  readonly automation_run_id: string;
  readonly repository_id: string;
  readonly campaign_id: string;
  readonly group_number: 1 | 2 | 3;
  readonly intent_sha256: string;
  readonly authorization_sha256: string;
  readonly budget_sha256: string;
  readonly budget_revision: number;
  readonly max_authoring_rounds: number;
  readonly completed_authoring_rounds: number;
  readonly reason: CampaignAuthoringTerminalReason;
  readonly reservation_refs: readonly AutomationEvidenceRefV1[];
  readonly event_refs: readonly AutomationEvidenceRefV1[];
  readonly ledger_sha256: string;
  readonly sealed_at: string;
  readonly terminal_sha256: string;
}

const DIGEST = /^[0-9a-f]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;

function invalid(message: string): never {
  throw new Error(message);
}

function digest(value: unknown, label: string): string {
  return typeof value === 'string' && DIGEST.test(value) ? value : invalid(`${label} must be a sha256 digest`);
}

function messageDigest(value: unknown, label: string): string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value)
    ? value
    : invalid(`${label} must be a canonical message digest`);
}

function identifier(value: unknown, label: string): string {
  return typeof value === 'string' && IDENTIFIER.test(value) ? value : invalid(`${label} is invalid`);
}

function count(value: unknown, label: string, minimum = 0): number {
  return Number.isSafeInteger(value) && (value as number) >= minimum ? value as number : invalid(`${label} must be an integer >= ${minimum}`);
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) invalid(`${label} must be an ISO timestamp`);
  return value;
}

function evidenceRefs(value: unknown, label: string): readonly AutomationEvidenceRefV1[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  const refs = value.map((entry, index) => {
    if (entry === null || typeof entry !== 'object') invalid(`${label}[${index}] must be an object`);
    const record = entry as Record<string, unknown>;
    if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(['ref', 'sha256'])) invalid(`${label}[${index}] fields are invalid`);
    return Object.freeze({ ref: identifier(record.ref, `${label}[${index}].ref`), sha256: digest(record.sha256, `${label}[${index}].sha256`) });
  });
  for (let index = 1; index < refs.length; index += 1) {
    if (refs[index - 1]!.ref >= refs[index]!.ref) invalid(`${label} must be sorted and unique by ref`);
  }
  return Object.freeze(refs);
}

export function campaignAutomationRunId(input: { readonly repository_id: string; readonly campaign_id: string }): string {
  return automationDigest({
    kind: 'repo-harness-campaign-automation-run',
    repository_id: identifier(input.repository_id, 'repository_id'),
    campaign_id: identifier(input.campaign_id, 'campaign_id'),
  });
}

export function assertCampaignAuthorizationForRun(
  authorization: ProgramAuthorizationV1,
  automationRunId: string,
): NonNullable<ProgramAuthorizationV1['campaign']> {
  const campaign = authorization.campaign;
  if (campaign === null) invalid('campaign authoring requires a campaign authorization');
  if (authorization.contract_scope !== 'contract_less') invalid('campaign authoring requires an explicit contract_less authorization');
  const expected = campaignAutomationRunId({ repository_id: authorization.repository_id, campaign_id: campaign.campaign_id });
  if (automationRunId !== expected) invalid('campaign authorization is bound to a different deterministic automation run');
  return campaign;
}

export function campaignAuthoringContextKey(
  context: Pick<CampaignAutomationReservationContextV1, 'campaign_id' | 'group_number'>,
): string {
  return automationDigest({ campaign_id: context.campaign_id, group_number: context.group_number });
}

export function sealCampaignAuthoringTerminal(
  input: Omit<CampaignAuthoringBudgetTerminalV1, 'protocol' | 'kind' | 'terminal_sha256'>,
): CampaignAuthoringBudgetTerminalV1 {
  const draft = {
    ...input,
    protocol: CAMPAIGN_AUTHORING_TERMINAL_PROTOCOL,
    kind: CAMPAIGN_AUTHORING_TERMINAL_KIND,
    reservation_refs: [...input.reservation_refs].sort((left, right) => left.ref.localeCompare(right.ref)),
    event_refs: [...input.event_refs].sort((left, right) => left.ref.localeCompare(right.ref)),
  };
  return validateCampaignAuthoringTerminal({ ...draft, terminal_sha256: automationDigest(draft) } as CampaignAuthoringBudgetTerminalV1);
}

export function validateCampaignAuthoringTerminal(value: CampaignAuthoringBudgetTerminalV1): CampaignAuthoringBudgetTerminalV1 {
  if (value === null || typeof value !== 'object') invalid('campaign authoring terminal must be an object');
  const expected = [
    'authorization_sha256', 'automation_run_id', 'budget_revision', 'budget_sha256', 'campaign_id',
    'completed_authoring_rounds', 'event_refs', 'group_number', 'intent_sha256', 'kind', 'ledger_sha256',
    'max_authoring_rounds', 'protocol', 'reason', 'repository_id', 'reservation_refs', 'sealed_at', 'terminal_sha256',
  ];
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected)) invalid('campaign authoring terminal fields are invalid');
  if (value.protocol !== CAMPAIGN_AUTHORING_TERMINAL_PROTOCOL || value.kind !== CAMPAIGN_AUTHORING_TERMINAL_KIND) {
    invalid('campaign authoring terminal protocol or kind is unsupported');
  }
  if (value.reason !== 'authoring_completed' && value.reason !== 'authoring_exhausted') invalid('campaign authoring terminal reason is unsupported');
  const terminal: CampaignAuthoringBudgetTerminalV1 = Object.freeze({
    protocol: CAMPAIGN_AUTHORING_TERMINAL_PROTOCOL,
    kind: CAMPAIGN_AUTHORING_TERMINAL_KIND,
    automation_run_id: digest(value.automation_run_id, 'automation_run_id'),
    repository_id: identifier(value.repository_id, 'repository_id'),
    campaign_id: identifier(value.campaign_id, 'campaign_id'),
    group_number: [1, 2, 3].includes(value.group_number) ? value.group_number : invalid('group_number must be 1, 2, or 3'),
    intent_sha256: messageDigest(value.intent_sha256, 'intent_sha256'),
    authorization_sha256: digest(value.authorization_sha256, 'authorization_sha256'),
    budget_sha256: digest(value.budget_sha256, 'budget_sha256'),
    budget_revision: count(value.budget_revision, 'budget_revision', 1),
    max_authoring_rounds: count(value.max_authoring_rounds, 'max_authoring_rounds', 1),
    completed_authoring_rounds: count(value.completed_authoring_rounds, 'completed_authoring_rounds'),
    reason: value.reason,
    reservation_refs: evidenceRefs(value.reservation_refs, 'reservation_refs'),
    event_refs: evidenceRefs(value.event_refs, 'event_refs'),
    ledger_sha256: digest(value.ledger_sha256, 'ledger_sha256'),
    sealed_at: timestamp(value.sealed_at, 'sealed_at'),
    terminal_sha256: digest(value.terminal_sha256, 'terminal_sha256'),
  });
  if (terminal.completed_authoring_rounds > terminal.max_authoring_rounds) invalid('completed authoring rounds exceed the bound');
  const unsigned = { ...terminal } as Record<string, unknown>;
  delete unsigned.terminal_sha256;
  if (automationDigest(unsigned) !== terminal.terminal_sha256) invalid('campaign authoring terminal digest does not bind its content');
  return terminal;
}
