import {
  canonicalMessageBytes,
  canonicalMessageDigest,
} from '../messages/mechanics';
import {
  declaredIssueBatchSlot,
  parseIssueBatchMarker,
  validateIssueBatchIntent,
  type IssueBatchIntentV1,
  type IssueBatchSlot,
  type RepairCampaignIssueKind,
} from './issue-batch';
import {
  validateExternalSourceRefreshReceipt,
  validateProviderIssueObservation,
  type ExternalSourceRefreshReceiptV1,
  type ProviderIssueObservationV1,
} from '../external-sources/issue-observation';

export const ISSUE_BATCH_METADATA_KIND = 'repo-harness-campaign-issue-metadata' as const;
export const ISSUE_BATCH_RECONCILIATION_KIND = 'repo-harness-issue-batch-reconciliation' as const;

export interface IssueBatchMetadataV1 {
  readonly protocol: 1;
  readonly kind: typeof ISSUE_BATCH_METADATA_KIND;
  readonly issue_kind: RepairCampaignIssueKind;
  readonly primary_capability: string;
  readonly priority: number;
  readonly depends_on_slots: readonly string[];
  readonly suspected_paths: readonly string[];
}

export type IssueBatchSlotState = 'complete' | 'missing' | 'unfilled' | 'slot_invalid';

export interface IssueBatchReconciledSlotV1 {
  readonly slot: IssueBatchSlot;
  readonly state: IssueBatchSlotState;
  readonly provider_issue_id: string | null;
  readonly observation_sha256: string | null;
  readonly source_revision: string | null;
}

export interface IssueBatchReconciliationV1 {
  readonly protocol: 1;
  readonly kind: typeof ISSUE_BATCH_RECONCILIATION_KIND;
  readonly intent_sha256: string;
  readonly snapshot_receipt_sha256: string;
  readonly observation_sha256s: readonly string[];
  readonly outcome: 'complete' | 'incomplete';
  readonly slots: readonly IssueBatchReconciledSlotV1[];
  readonly missing_slots: readonly IssueBatchSlot[];
  readonly unfilled_slots: readonly IssueBatchSlot[];
  readonly invalid_slots: readonly IssueBatchSlot[];
  readonly unexpected_issue_ids: readonly string[];
  readonly reconciliation_sha256: string;
}

export interface ReconcileIssueBatchSlotsInput {
  readonly intent: IssueBatchIntentV1;
  readonly snapshot_receipt: ExternalSourceRefreshReceiptV1;
  readonly observations: readonly ProviderIssueObservationV1[];
  readonly prior_observations?: readonly ProviderIssueObservationV1[];
  /** A parent-owned mutation journal may name the one issue whose invalid metadata was repaired. */
  readonly repaired_issue_ids?: readonly string[];
  readonly repair_exhausted_slots?: readonly IssueBatchSlot[];
  readonly current_main_sha?: string;
}

export class IssueBatchReconcileError extends Error {
  constructor(readonly code:
    | 'issue_batch_ambiguous'
    | 'issue_source_drift'
    | 'issue_provider_unavailable'
    | 'issue_provider_snapshot_incomplete'
    | 'source_main_stale', message: string) {
    super(message);
    this.name = 'IssueBatchReconcileError';
  }
}

function fail(code: IssueBatchReconcileError['code'], message: string): never {
  throw new IssueBatchReconcileError(code, message);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function exact(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...fields].sort());
}

function sortedUniqueStrings(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.trim() !== '')) return null;
  if (new Set(value).size !== value.length || JSON.stringify(value) !== JSON.stringify([...value].sort())) return null;
  return Object.freeze([...value]);
}

/** The metadata fence is a closed protocol. Text outside it is deliberately untrusted and ignored. */
export function parseIssueBatchMetadata(body: string): IssueBatchMetadataV1 | null {
  const fences = [...body.matchAll(/```json\n([\s\S]*?)\n```/gu)];
  if (fences.length !== 1) return null;
  let candidate: unknown;
  try { candidate = JSON.parse(fences[0]![1]!); } catch { return null; }
  const value = record(candidate);
  if (!value || !exact(value, ['protocol', 'kind', 'issue_kind', 'primary_capability', 'priority', 'depends_on_slots', 'suspected_paths'])) return null;
  if (value.protocol !== 1 || value.kind !== ISSUE_BATCH_METADATA_KIND) return null;
  if (value.issue_kind !== 'bugfix' && value.issue_kind !== 'test_gap') return null;
  if (typeof value.primary_capability !== 'string' || value.primary_capability.trim() === '') return null;
  const priority = value.priority;
  if (typeof priority !== 'number' || !Number.isSafeInteger(priority) || priority < 0 || priority > 100) return null;
  const depends = sortedUniqueStrings(value.depends_on_slots);
  const paths = sortedUniqueStrings(value.suspected_paths);
  if (!depends || !paths) return null;
  return Object.freeze({
    protocol: 1,
    kind: ISSUE_BATCH_METADATA_KIND,
    issue_kind: value.issue_kind,
    primary_capability: value.primary_capability,
    priority,
    depends_on_slots: depends,
    suspected_paths: paths,
  });
}

function assertCompleteSnapshot(intent: IssueBatchIntentV1, input: ReconcileIssueBatchSlotsInput): readonly ProviderIssueObservationV1[] {
  const receipt = validateExternalSourceRefreshReceipt(input.snapshot_receipt);
  if (input.current_main_sha !== undefined && input.current_main_sha !== intent.base_main_sha) fail('source_main_stale', 'campaign main revision differs from the issue batch intent');
  if (receipt.registered_repository_id !== intent.repository_id || receipt.policy_revision !== intent.authoring_policy_sha256
    || receipt.provider_display_ref !== intent.provider_repository || receipt.provider_repository_id === null) {
    fail('issue_provider_snapshot_incomplete', 'provider receipt is not bound to the issue batch intent');
  }
  if (receipt.outcome === 'unavailable') fail('issue_provider_unavailable', 'provider snapshot is unavailable');
  if (receipt.outcome !== 'complete') fail('issue_provider_snapshot_incomplete', 'provider snapshot is incomplete');
  const observations = input.observations.map((value) => validateProviderIssueObservation(value));
  if (observations.some((value) => value.registered_repository_id !== intent.repository_id || value.policy_revision !== intent.authoring_policy_sha256
    || value.provider_repository_id !== receipt.provider_repository_id)) {
    fail('issue_provider_snapshot_incomplete', 'provider observation is not bound to the issue batch intent');
  }
  const revisions = observations.map((value) => value.source_revision).sort();
  if (new Set(revisions).size !== revisions.length || JSON.stringify(revisions) !== JSON.stringify(receipt.source_revisions)
    || observations.length !== receipt.observations_written || receipt.issues_seen < receipt.observations_written) {
    fail('issue_provider_snapshot_incomplete', 'provider snapshot receipt does not exactly name its observations');
  }
  return observations;
}

function sameSlot(intent: IssueBatchIntentV1, observation: ProviderIssueObservationV1): IssueBatchSlot | null {
  return declaredIssueBatchSlot(intent, observation.body);
}

function priorForIssue(observations: readonly ProviderIssueObservationV1[], current: ProviderIssueObservationV1): readonly ProviderIssueObservationV1[] {
  return observations.filter((value) => value.registered_repository_id === current.registered_repository_id
    && value.provider_repository_id === current.provider_repository_id && value.provider_issue_id === current.provider_issue_id);
}

function hasValidMetadata(intent: IssueBatchIntentV1, body: string): boolean {
  const metadata = parseIssueBatchMetadata(body);
  return metadata !== null && intent.allowed_issue_kinds.includes(metadata.issue_kind);
}

function assertNoSourceDrift(
  intent: IssueBatchIntentV1,
  current: ProviderIssueObservationV1,
  prior: readonly ProviderIssueObservationV1[],
  repairedIssueIds: ReadonlySet<string>,
): void {
  for (const previous of priorForIssue(prior, current)) {
    const previousSlot = sameSlot(intent, previous);
    if (previousSlot === null || previous.body === current.body) continue;
    const priorValid = hasValidMetadata(intent, previous.body);
    const currentSlot = sameSlot(intent, current);
    const repairedInvalidMetadata = !priorValid && currentSlot === previousSlot
      && repairedIssueIds.has(current.provider_issue_id);
    if (!repairedInvalidMetadata) {
      fail('issue_source_drift', `provider issue ${current.provider_issue_id} body changed after observation`);
    }
  }
}

function finalizedSlots(intent: IssueBatchIntentV1, candidates: ReadonlyMap<IssueBatchSlot, ProviderIssueObservationV1>, invalid: ReadonlySet<IssueBatchSlot>, exhausted: ReadonlySet<IssueBatchSlot>): readonly IssueBatchReconciledSlotV1[] {
  return Object.freeze(intent.slots.map((slot) => {
    const observation = candidates.get(slot) ?? null;
    const state: IssueBatchSlotState = observation === null
      ? (exhausted.has(slot) ? 'unfilled' : 'missing')
      : (invalid.has(slot) ? (exhausted.has(slot) ? 'unfilled' : 'slot_invalid') : 'complete');
    return Object.freeze({ slot, state, provider_issue_id: observation?.provider_issue_id ?? null, observation_sha256: observation?.observation_sha256 ?? null, source_revision: observation?.source_revision ?? null });
  }));
}

export function reconcileIssueBatchSlots(input: ReconcileIssueBatchSlotsInput): IssueBatchReconciliationV1 {
  const intent = validateIssueBatchIntent(input.intent);
  const observations = assertCompleteSnapshot(intent, input);
  const prior = (input.prior_observations ?? []).map((value) => validateProviderIssueObservation(value));
  const repaired = new Set(input.repaired_issue_ids ?? []);
  const exhausted = new Set(input.repair_exhausted_slots ?? []);
  if ([...exhausted].some((slot) => !intent.slots.includes(slot))) fail('issue_batch_ambiguous', 'repair exhaustion names an undeclared slot');
  const bySlot = new Map<IssueBatchSlot, ProviderIssueObservationV1>();
  const invalid = new Set<IssueBatchSlot>();
  const unexpected = new Set<string>();
  for (const observation of observations) {
    assertNoSourceDrift(intent, observation, prior, repaired);
    const marker = parseIssueBatchMarker(observation.body);
    if (!marker || marker.campaign_id !== intent.campaign_id || marker.group_number !== intent.group_number) continue;
    const slot = sameSlot(intent, observation);
    if (slot === null) { if (observation.state !== 'closed') unexpected.add(observation.provider_issue_id); continue; }
    if (bySlot.has(slot)) fail('issue_batch_ambiguous', `provider snapshot contains duplicate slot ${slot}`);
    bySlot.set(slot, observation);
    if (!hasValidMetadata(intent, observation.body)) invalid.add(slot);
  }
  const slots = finalizedSlots(intent, bySlot, invalid, exhausted);
  const missingSlots = Object.freeze(slots.filter((value) => value.state === 'missing').map((value) => value.slot));
  const unfilledSlots = Object.freeze(slots.filter((value) => value.state === 'unfilled').map((value) => value.slot));
  const invalidSlots = Object.freeze(slots.filter((value) => value.state === 'slot_invalid').map((value) => value.slot));
  const basis = {
    protocol: 1 as const,
    kind: ISSUE_BATCH_RECONCILIATION_KIND,
    intent_sha256: intent.intent_sha256,
    snapshot_receipt_sha256: input.snapshot_receipt.receipt_sha256,
    observation_sha256s: Object.freeze(observations.map((value) => value.observation_sha256).sort()),
    outcome: (missingSlots.length === 0 && unfilledSlots.length === 0 && invalidSlots.length === 0 && unexpected.size === 0) ? 'complete' as const : 'incomplete' as const,
    slots,
    missing_slots: missingSlots,
    unfilled_slots: unfilledSlots,
    invalid_slots: invalidSlots,
    unexpected_issue_ids: Object.freeze([...unexpected].sort()),
  } as const;
  return Object.freeze({ ...basis, reconciliation_sha256: canonicalMessageDigest(basis as unknown as Record<string, unknown>) });
}

export const canonicalIssueBatchReconciliationBytes = (value: IssueBatchReconciliationV1): string =>
  canonicalMessageBytes(value as unknown as Record<string, unknown>);
