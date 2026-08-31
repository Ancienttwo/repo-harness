import { createHash, randomUUID } from 'crypto';

export type ExternalSourceProvider = 'github';
export type ExternalSourceOutcome = 'complete' | 'incomplete' | 'unavailable';
export type ExternalSourceFailureClass =
  | 'authentication'
  | 'rate_limit'
  | 'network'
  | 'invalid_response'
  | 'pagination_limit'
  | 'issue_limit'
  | 'body_limit'
  | 'payload_limit'
  | 'deadline'
  | 'repository_identity'
  | 'policy'
  | 'persistence';

export interface ProviderIssueObservationV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-provider-issue-observation';
  readonly registered_repository_id: string;
  readonly provider: ExternalSourceProvider;
  readonly provider_host: 'github.com';
  readonly provider_repository_id: string;
  readonly provider_issue_id: string;
  readonly display_ref: string;
  readonly url: string;
  readonly observed_at: string;
  readonly provider_created_at: string | null;
  readonly provider_updated_at: string | null;
  readonly state: 'open' | 'closed';
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
  readonly comments_policy: 'omitted';
  readonly policy_revision: string;
  readonly eligible: boolean;
  readonly eligibility_reasons: readonly string[];
  readonly source_revision: string;
  readonly observation_sha256: string;
}

export interface ExternalSourceRefreshReceiptV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-external-source-refresh-receipt';
  readonly receipt_id: string;
  readonly registered_repository_id: string;
  readonly provider: ExternalSourceProvider;
  readonly provider_host: 'github.com';
  readonly provider_repository_id: string | null;
  readonly provider_display_ref: string;
  readonly policy_revision: string;
  readonly started_at: string;
  readonly completed_at: string;
  readonly outcome: ExternalSourceOutcome;
  readonly pages_fetched: number;
  readonly issues_seen: number;
  readonly observations_written: number;
  readonly limits: ExternalSourceFetchLimitsV1;
  readonly source_revisions: readonly string[];
  readonly failure: { readonly class: ExternalSourceFailureClass; readonly message: string } | null;
  readonly receipt_sha256: string;
}

export interface ExternalSourceFetchLimitsV1 {
  readonly max_pages: number;
  readonly max_issues: number;
  readonly max_body_bytes: number;
  readonly max_total_bytes: number;
  readonly deadline_ms: number;
}

export class ExternalSourceProtocolError extends Error {
  constructor(readonly code: 'external_source_invalid', message: string) {
    super(message);
    this.name = 'ExternalSourceProtocolError';
  }
}

function fail(message: string): never {
  throw new ExternalSourceProtocolError('external_source_invalid', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`${label} fields are invalid`);
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return string(value, label);
}

function timestamp(value: unknown, label: string): string {
  const text = string(value, label);
  if (Number.isNaN(Date.parse(text))) fail(`${label} must be an ISO timestamp`);
  return text;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function normalizedStrings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.trim() !== '')) fail(`${label} must be an array of non-empty strings`);
  const normalized = value.map((entry) => entry.trim());
  if (JSON.stringify(normalized) !== JSON.stringify([...normalized].sort()) || new Set(normalized).size !== normalized.length) {
    fail(`${label} must be sorted and unique`);
  }
  return Object.freeze(normalized);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(`${label} must be a positive integer`);
  return value as number;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalExternalSourceBytes(value: unknown): string {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

export function canonicalProviderIssueObservationBytes(value: ProviderIssueObservationV1): string {
  return canonicalExternalSourceBytes(value);
}

export function canonicalExternalSourceRefreshReceiptBytes(value: ExternalSourceRefreshReceiptV1): string {
  return canonicalExternalSourceBytes(value);
}

/** `observed_at` is local receipt metadata, not provider snapshot content. */
type ObservationSubject = Omit<ProviderIssueObservationV1, 'protocol' | 'kind' | 'observed_at' | 'source_revision' | 'observation_sha256'>;

function observationSubject(input: ObservationSubject): ObservationSubject {
  const { observed_at: _observedAt, ...subject } = input as ProviderIssueObservationV1;
  return subject;
}

export function sourceRevisionForObservation(input: ObservationSubject): string {
  return sha256(canonicalExternalSourceBytes(observationSubject(input)));
}

export function buildProviderIssueObservation(input: Omit<ProviderIssueObservationV1, 'protocol' | 'kind' | 'source_revision' | 'observation_sha256'>): ProviderIssueObservationV1 {
  const source = sourceRevisionForObservation(input);
  const base = Object.freeze({ protocol: 1 as const, kind: 'repo-harness-provider-issue-observation' as const, ...input, source_revision: source });
  return Object.freeze({ ...base, observation_sha256: sha256(canonicalExternalSourceBytes(base)) });
}

export function validateExternalSourceFetchLimits(value: unknown): ExternalSourceFetchLimitsV1 {
  if (!isRecord(value)) fail('limits must be an object');
  exactKeys(value, ['deadline_ms', 'max_body_bytes', 'max_issues', 'max_pages', 'max_total_bytes'], 'limits');
  return Object.freeze({
    max_pages: positiveInteger(value.max_pages, 'limits.max_pages'),
    max_issues: positiveInteger(value.max_issues, 'limits.max_issues'),
    max_body_bytes: positiveInteger(value.max_body_bytes, 'limits.max_body_bytes'),
    max_total_bytes: positiveInteger(value.max_total_bytes, 'limits.max_total_bytes'),
    deadline_ms: positiveInteger(value.deadline_ms, 'limits.deadline_ms'),
  });
}

export function validateProviderIssueObservation(value: unknown): ProviderIssueObservationV1 {
  if (!isRecord(value)) fail('observation must be an object');
  exactKeys(value, [
    'assignees', 'body', 'comments_policy', 'display_ref', 'eligible', 'eligibility_reasons', 'kind', 'labels', 'observation_sha256',
    'observed_at', 'policy_revision', 'protocol', 'provider', 'provider_created_at', 'provider_host', 'provider_issue_id',
    'provider_repository_id', 'provider_updated_at', 'registered_repository_id', 'source_revision', 'state', 'title', 'url',
  ], 'observation');
  if (value.protocol !== 1 || value.kind !== 'repo-harness-provider-issue-observation') fail('observation protocol is invalid');
  if (value.provider !== 'github' || value.provider_host !== 'github.com') fail('observation provider is invalid');
  if (value.state !== 'open' && value.state !== 'closed') fail('observation state is invalid');
  if (value.comments_policy !== 'omitted') fail('observation comments policy is invalid');
  if (typeof value.eligible !== 'boolean') fail('observation eligible is invalid');
  const parsed: ProviderIssueObservationV1 = Object.freeze({
    protocol: 1,
    kind: 'repo-harness-provider-issue-observation',
    registered_repository_id: string(value.registered_repository_id, 'observation.registered_repository_id'),
    provider: 'github',
    provider_host: 'github.com',
    provider_repository_id: string(value.provider_repository_id, 'observation.provider_repository_id'),
    provider_issue_id: string(value.provider_issue_id, 'observation.provider_issue_id'),
    display_ref: string(value.display_ref, 'observation.display_ref'),
    url: string(value.url, 'observation.url'),
    observed_at: timestamp(value.observed_at, 'observation.observed_at'),
    provider_created_at: nullableString(value.provider_created_at, 'observation.provider_created_at'),
    provider_updated_at: nullableString(value.provider_updated_at, 'observation.provider_updated_at'),
    state: value.state,
    title: string(value.title, 'observation.title'),
    body: typeof value.body === 'string' ? value.body : fail('observation.body must be a string'),
    labels: normalizedStrings(value.labels, 'observation.labels'),
    assignees: normalizedStrings(value.assignees, 'observation.assignees'),
    comments_policy: 'omitted',
    policy_revision: string(value.policy_revision, 'observation.policy_revision'),
    eligible: value.eligible,
    eligibility_reasons: normalizedStrings(value.eligibility_reasons, 'observation.eligibility_reasons'),
    source_revision: string(value.source_revision, 'observation.source_revision'),
    observation_sha256: string(value.observation_sha256, 'observation.observation_sha256'),
  });
  const sourceInput = (({ source_revision: _source, observation_sha256: _digest, protocol: _protocol, kind: _kind, observed_at: _observed, ...rest }) => rest)(parsed);
  if (parsed.source_revision !== sourceRevisionForObservation(sourceInput)) fail('observation source revision is invalid');
  const digestInput = (({ observation_sha256: _digest, ...rest }) => rest)(parsed);
  if (parsed.observation_sha256 !== sha256(canonicalExternalSourceBytes(digestInput))) fail('observation digest is invalid');
  return parsed;
}

export function buildExternalSourceRefreshReceipt(input: Omit<ExternalSourceRefreshReceiptV1, 'protocol' | 'kind' | 'receipt_id' | 'receipt_sha256'> & { readonly receipt_id?: string }): ExternalSourceRefreshReceiptV1 {
  const base = Object.freeze({
    protocol: 1 as const,
    kind: 'repo-harness-external-source-refresh-receipt' as const,
    receipt_id: input.receipt_id ?? randomUUID(),
    registered_repository_id: input.registered_repository_id,
    provider: input.provider,
    provider_host: input.provider_host,
    provider_repository_id: input.provider_repository_id,
    provider_display_ref: input.provider_display_ref,
    policy_revision: input.policy_revision,
    started_at: input.started_at,
    completed_at: input.completed_at,
    outcome: input.outcome,
    pages_fetched: input.pages_fetched,
    issues_seen: input.issues_seen,
    observations_written: input.observations_written,
    limits: input.limits,
    source_revisions: input.source_revisions,
    failure: input.failure,
  });
  return Object.freeze({ ...base, receipt_sha256: sha256(canonicalExternalSourceBytes(base)) });
}

export function validateExternalSourceRefreshReceipt(value: unknown): ExternalSourceRefreshReceiptV1 {
  if (!isRecord(value)) fail('receipt must be an object');
  exactKeys(value, [
    'completed_at', 'failure', 'issues_seen', 'kind', 'limits', 'observations_written', 'outcome', 'pages_fetched', 'policy_revision',
    'protocol', 'provider', 'provider_display_ref', 'provider_host', 'provider_repository_id', 'receipt_id', 'receipt_sha256',
    'registered_repository_id', 'source_revisions', 'started_at',
  ], 'receipt');
  if (value.protocol !== 1 || value.kind !== 'repo-harness-external-source-refresh-receipt') fail('receipt protocol is invalid');
  if (value.provider !== 'github' || value.provider_host !== 'github.com') fail('receipt provider is invalid');
  if (value.outcome !== 'complete' && value.outcome !== 'incomplete' && value.outcome !== 'unavailable') fail('receipt outcome is invalid');
  const failure = value.failure === null ? null : (() => {
    if (!isRecord(value.failure)) fail('receipt failure is invalid');
    exactKeys(value.failure, ['class', 'message'], 'receipt failure');
    const classes: readonly ExternalSourceFailureClass[] = ['authentication', 'rate_limit', 'network', 'invalid_response', 'pagination_limit', 'issue_limit', 'body_limit', 'payload_limit', 'deadline', 'repository_identity', 'policy', 'persistence'];
    if (!classes.includes(value.failure.class as ExternalSourceFailureClass)) fail('receipt failure class is invalid');
    return Object.freeze({ class: value.failure.class as ExternalSourceFailureClass, message: string(value.failure.message, 'receipt failure.message') });
  })();
  if ((value.outcome === 'complete') !== (failure === null)) fail('receipt outcome and failure disagree');
  const nonnegative = (candidate: unknown, label: string): number => {
    if (!Number.isSafeInteger(candidate) || (candidate as number) < 0) fail(`${label} must be a non-negative integer`);
    return candidate as number;
  };
  const parsed = Object.freeze({
    protocol: 1 as const,
    kind: 'repo-harness-external-source-refresh-receipt' as const,
    receipt_id: string(value.receipt_id, 'receipt.receipt_id'),
    registered_repository_id: string(value.registered_repository_id, 'receipt.registered_repository_id'),
    provider: 'github' as const,
    provider_host: 'github.com' as const,
    provider_repository_id: value.provider_repository_id === null ? null : string(value.provider_repository_id, 'receipt.provider_repository_id'),
    provider_display_ref: string(value.provider_display_ref, 'receipt.provider_display_ref'),
    policy_revision: string(value.policy_revision, 'receipt.policy_revision'),
    started_at: timestamp(value.started_at, 'receipt.started_at'),
    completed_at: timestamp(value.completed_at, 'receipt.completed_at'),
    outcome: value.outcome as ExternalSourceOutcome,
    pages_fetched: nonnegative(value.pages_fetched, 'receipt.pages_fetched'),
    issues_seen: nonnegative(value.issues_seen, 'receipt.issues_seen'),
    observations_written: nonnegative(value.observations_written, 'receipt.observations_written'),
    limits: validateExternalSourceFetchLimits(value.limits),
    source_revisions: normalizedStrings(value.source_revisions, 'receipt.source_revisions'),
    failure,
    receipt_sha256: string(value.receipt_sha256, 'receipt.receipt_sha256'),
  });
  const digestInput = (({ receipt_sha256: _digest, ...rest }) => rest)(parsed);
  if (parsed.receipt_sha256 !== sha256(canonicalExternalSourceBytes(digestInput))) fail('receipt digest is invalid');
  return parsed;
}

export function externalSourceDigest(value: unknown): string {
  return sha256(canonicalExternalSourceBytes(value));
}
