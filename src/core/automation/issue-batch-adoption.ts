import { canonicalMessageDigest, messageSha256 } from '../messages/mechanics';
import { validateCampaignAuthoringTerminal, type CampaignAuthoringBudgetTerminalV1 } from './campaign-authoring-budget';
import { parseIssueBatchMetadata, reconcileIssueBatchSlots, type ReconcileIssueBatchSlotsInput } from './issue-batch-reconcile';
import { requireVerifiedIssueAuthoringSession, validateIssueAuthoringSession, validateIssueBatchIntent, type IssueAuthoringSessionV1, type IssueBatchIntentV1 } from './issue-batch';
import { verifyConnectorChallenge, type ConnectorChallengeV1, type ConnectorChallengeReceiptV1 } from './connector-challenge';

export const ISSUE_BATCH_ADOPTION_PROTOCOL = 1 as const;

export class IssueBatchAdoptionError extends Error {
  constructor(readonly code: 'issue_adoption_invalid' | 'issue_adoption_budget_unsealed' | 'issue_adoption_dependency_invalid' | 'issue_kind_unsupported' | 'issue_adoption_reconciliation_required' | 'issue_adoption_conflict', message: string) { super(message); this.name = 'IssueBatchAdoptionError'; }
}
export interface CampaignIssueAdoptionV1 {
  readonly slot: string;
  readonly provider_issue_id: string;
  readonly issue_number: number;
  readonly source_observation_sha256: string;
  readonly title_sha256: string;
  readonly body_sha256: string;
  readonly issue_kind: 'bugfix' | 'test_gap';
  readonly primary_capability: string;
  readonly priority: number;
  readonly depends_on_slots: readonly string[];
  readonly suspected_paths: readonly string[];
}
export interface CampaignIssueBatchAdoptionReceiptV1 {
  readonly protocol: typeof ISSUE_BATCH_ADOPTION_PROTOCOL;
  readonly kind: 'repo-harness-campaign-issue-batch-adoption';
  readonly campaign_id: string;
  readonly group_number: number;
  readonly base_main_sha: string;
  readonly issue_batch_intent_sha256: string;
  readonly authorization_sha256: string;
  readonly authoring_session_ref: string;
  readonly connector_evidence: 'challenge_verified';
  readonly issues: readonly CampaignIssueAdoptionV1[];
  readonly unfilled_slots: readonly string[];
  readonly dependency_graph_sha256: string;
  readonly receipt_sha256: string;
}
export interface IssueBatchAdoptionInput {
  readonly intent: IssueBatchIntentV1;
  readonly session: IssueAuthoringSessionV1;
  readonly snapshot: Pick<ReconcileIssueBatchSlotsInput, 'snapshot_receipt' | 'observations' | 'prior_observations' | 'repaired_issue_ids' | 'repair_exhausted_slots'>;
  readonly capability_ids: readonly string[];
  readonly authorization_sha256: string;
  readonly terminal: CampaignAuthoringBudgetTerminalV1;
  readonly challenge: ConnectorChallengeV1;
  readonly challenge_response: string;
  readonly response_session_ref: string;
  readonly model_verified: boolean;
}
function fail(code: IssueBatchAdoptionError['code'], message: string): never { throw new IssueBatchAdoptionError(code, message); }

/** Projection only: effects must re-read the terminal ledger authority before calling. */
export function buildIssueBatchAdoption(input: IssueBatchAdoptionInput): { receipt: CampaignIssueBatchAdoptionReceiptV1; challenge_receipt: ConnectorChallengeReceiptV1 } {
  const intent = validateIssueBatchIntent(input.intent);
  const session = validateIssueAuthoringSession(input.session);
  requireVerifiedIssueAuthoringSession(session);
  if (session.intent_sha256 !== intent.intent_sha256 || session.browser_status !== 'completed') fail('issue_adoption_invalid', 'a completed source session for the exact intent is required');
  const terminal = validateCampaignAuthoringTerminal(input.terminal);
  if (terminal.campaign_id !== intent.campaign_id || terminal.repository_id !== intent.repository_id || terminal.group_number !== intent.group_number
    || terminal.intent_sha256 !== intent.intent_sha256 || terminal.authorization_sha256 !== input.authorization_sha256) fail('issue_adoption_budget_unsealed', 'terminal does not bind this adoption');
  const challenge = input.challenge;
  if (challenge.intent_sha256 !== intent.intent_sha256 || challenge.base_main_sha !== intent.base_main_sha || challenge.source_session_ref !== session.session_ref) fail('issue_adoption_invalid', 'challenge source binding differs');
  const challengeReceipt = verifyConnectorChallenge({ challenge, response: input.challenge_response, response_session_ref: input.response_session_ref, model_verified: input.model_verified });
  const reconciliation = reconcileIssueBatchSlots({ intent, ...input.snapshot, current_main_sha: intent.base_main_sha });
  if (reconciliation.unexpected_issue_ids.length) fail('issue_adoption_reconciliation_required', 'unexpected issues must be reconciled before adoption');
  if (reconciliation.invalid_slots.length) fail('issue_kind_unsupported', 'slots without supported strict issue metadata cannot be adopted');
  const issues: CampaignIssueAdoptionV1[] = [];
  for (const slot of reconciliation.slots) {
    if (slot.state !== 'complete') continue;
    const observation = input.snapshot.observations.find(o => o.observation_sha256 === slot.observation_sha256)!;
    const metadata = parseIssueBatchMetadata(observation.body);
    if (!metadata || !intent.allowed_issue_kinds.includes(metadata.issue_kind)) fail('issue_kind_unsupported', 'issue kind is unsupported');
    if (!observation.eligible || observation.state !== 'open') fail('issue_adoption_invalid', 'adopted issue must be open and provider-eligible');
    if (!input.capability_ids.includes(metadata.primary_capability)) fail('issue_adoption_invalid', 'primary_capability is not a registered capability');
    const url = new URL(observation.url);
    const expectedPrefix = `/${intent.provider_repository}/issues/`;
    const numberText = url.pathname.startsWith(expectedPrefix) ? url.pathname.slice(expectedPrefix.length) : '';
    if (url.origin !== 'https://github.com' || url.search || url.hash || !/^[1-9][0-9]*$/u.test(numberText) || !Number.isSafeInteger(Number(numberText))) fail('issue_adoption_invalid', 'provider issue URL does not identify an issue in the intent repository');
    issues.push(Object.freeze({ slot: slot.slot, provider_issue_id: observation.provider_issue_id, issue_number: Number(numberText), source_observation_sha256: observation.observation_sha256,
      title_sha256: messageSha256(observation.title), body_sha256: messageSha256(observation.body), ...metadataFields(metadata) }));
  }
  const unfilled = intent.slots.filter(slot => !issues.some(issue => issue.slot === slot));
  if (unfilled.length && terminal.reason !== 'authoring_exhausted') fail('issue_adoption_budget_unsealed', 'partial adoption requires authoring_exhausted');
  const bySlot = new Map(issues.map(issue => [issue.slot, issue]));
  const visiting = new Set<string>(); const visited = new Set<string>();
  function visit(slot: string): void {
    if (visiting.has(slot)) fail('issue_adoption_dependency_invalid', 'dependency cycle');
    if (visited.has(slot)) return;
    const issue = bySlot.get(slot);
    if (!issue) fail('issue_adoption_dependency_invalid', 'dependency must reference an adopted slot in this group');
    visiting.add(slot); for (const dependency of issue.depends_on_slots) visit(dependency);
    visiting.delete(slot); visited.add(slot);
  }
  for (const issue of issues) visit(issue.slot);
  const basis = { protocol: ISSUE_BATCH_ADOPTION_PROTOCOL, kind: 'repo-harness-campaign-issue-batch-adoption' as const, campaign_id: intent.campaign_id, group_number: intent.group_number,
    base_main_sha: intent.base_main_sha, issue_batch_intent_sha256: intent.intent_sha256, authorization_sha256: input.authorization_sha256,
    authoring_session_ref: session.session_ref, connector_evidence: 'challenge_verified' as const, issues: Object.freeze(issues), unfilled_slots: Object.freeze(unfilled),
    dependency_graph_sha256: canonicalMessageDigest({ edges: issues.map(issue => ({ slot: issue.slot, depends_on_slots: issue.depends_on_slots })) }) };
  return Object.freeze({ receipt: Object.freeze({ ...basis, receipt_sha256: canonicalMessageDigest(basis) }), challenge_receipt: challengeReceipt });
}
function metadataFields(m: NonNullable<ReturnType<typeof parseIssueBatchMetadata>>) {
  return { issue_kind: m.issue_kind, primary_capability: m.primary_capability, priority: m.priority, depends_on_slots: m.depends_on_slots, suspected_paths: m.suspected_paths };
}
