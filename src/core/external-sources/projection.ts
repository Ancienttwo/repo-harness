import type {
  ExternalSourceRefreshReceiptV1,
  ProviderIssueObservationV1,
} from './issue-observation';

export interface ExternalSourceProjectionIssueV1 {
  readonly provider_repository_id: string;
  readonly provider_issue_id: string;
  readonly latest_observation: ProviderIssueObservationV1;
  readonly source_drift: boolean;
}

export interface ExternalSourceProjectionV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-external-source-projection';
  readonly registered_repository_id: string;
  readonly latest_attempt: ExternalSourceRefreshReceiptV1 | null;
  readonly latest_complete_refresh: ExternalSourceRefreshReceiptV1 | null;
  readonly issues: readonly ExternalSourceProjectionIssueV1[];
}

function newest<T extends { readonly completed_at: string; readonly receipt_sha256: string }>(values: readonly T[]): T | null {
  return values.slice().sort((left, right) => right.completed_at.localeCompare(left.completed_at) || right.receipt_sha256.localeCompare(left.receipt_sha256))[0] ?? null;
}

function issueKey(observation: ProviderIssueObservationV1): string {
  return `${observation.provider_repository_id}\u0000${observation.provider_issue_id}`;
}

export function buildExternalSourceProjection(input: {
  readonly registered_repository_id: string;
  readonly observations: readonly ProviderIssueObservationV1[];
  readonly receipts: readonly ExternalSourceRefreshReceiptV1[];
}): ExternalSourceProjectionV1 {
  const observations = input.observations.filter((observation) => observation.registered_repository_id === input.registered_repository_id);
  const receipts = input.receipts.filter((receipt) => receipt.registered_repository_id === input.registered_repository_id);
  const history = new Map<string, ProviderIssueObservationV1[]>();
  for (const observation of observations) {
    const key = issueKey(observation);
    const records = history.get(key) ?? [];
    records.push(observation);
    history.set(key, records);
  }
  const issues = Array.from(history.values()).map((records): ExternalSourceProjectionIssueV1 => {
    const ordered = records.slice().sort((left, right) => right.observed_at.localeCompare(left.observed_at) || right.source_revision.localeCompare(left.source_revision));
    return Object.freeze({
      provider_repository_id: ordered[0].provider_repository_id,
      provider_issue_id: ordered[0].provider_issue_id,
      latest_observation: ordered[0],
      source_drift: new Set(records.map((record) => record.source_revision)).size > 1,
    });
  }).sort((left, right) => left.provider_repository_id.localeCompare(right.provider_repository_id) || left.provider_issue_id.localeCompare(right.provider_issue_id));
  return Object.freeze({
    protocol: 1,
    kind: 'repo-harness-external-source-projection',
    registered_repository_id: input.registered_repository_id,
    latest_attempt: newest(receipts),
    latest_complete_refresh: newest(receipts.filter((receipt) => receipt.outcome === 'complete')),
    issues: Object.freeze(issues),
  });
}
