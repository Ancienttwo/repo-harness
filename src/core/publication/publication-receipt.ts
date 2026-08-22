import { createHash } from 'crypto';

import { TASK_DIGEST_PATTERN } from '../state/coordination-identity';

/** This schema is deliberately independent from COORDINATION_PROTOCOL. */
export const PUBLICATION_RECEIPT_PROTOCOL = 1 as const;
export const PUBLICATION_RECEIPT_KIND = 'repo-harness-publication-receipt' as const;
export const PUBLICATION_CREATE_INTENT_KIND = 'repo-harness-publication-create-intent' as const;
export const PUBLICATION_PREPARE_KIND = 'repo-harness-publication-prepare' as const;
export const PUBLICATION_MARKER_PREFIX = '<!-- repo-harness-publication-receipt:v1:';
export const PUBLICATION_MARKER_SUFFIX = ' -->';
export const PUBLICATION_MARKER_MAX_BYTES = 32 * 1024;

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GIT_OID_PATTERN = /^[0-9a-f]{40,64}$/;
const MARKER_PATTERN = /<!-- repo-harness-publication-receipt:v1:([A-Za-z0-9_-]+) -->/g;

export interface PublicationReceiptV1 {
  readonly protocol: typeof PUBLICATION_RECEIPT_PROTOCOL;
  readonly kind: typeof PUBLICATION_RECEIPT_KIND;
  readonly publication_id: string;
  readonly repo_id: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly claim_id: string;
  readonly generation: number;
  readonly target_ref: string;
  readonly base_sha: string;
  readonly branch: string;
  readonly head_sha: string;
  readonly tree_sha: string;
  readonly review_subject_sha256: string;
  readonly verification_evidence_sha256: string;
  readonly merge_seal_sha256: string;
  readonly provider: 'github';
  readonly provider_repo_id: string;
  readonly pr_number: number;
  readonly pr_url: string;
  readonly created_at: string;
}

/**
 * Durable authority for the narrow create -> first-marker crash window.  It
 * contains only the immutable identity preimage available before a PR exists.
 */
export interface PublicationCreateIntentV1 {
  readonly protocol: typeof PUBLICATION_RECEIPT_PROTOCOL;
  readonly kind: typeof PUBLICATION_CREATE_INTENT_KIND;
  readonly publication_id: string;
  readonly provider_repo_id: string;
  readonly task_id: string;
  readonly claim_id: string;
  readonly generation: number;
  readonly head_sha: string;
}

/** Canonical shell hand-off. `existing` deliberately carries no create authority. */
export interface PublicationPrepareEnvelopeV1 {
  readonly protocol: typeof PUBLICATION_RECEIPT_PROTOCOL;
  readonly kind: typeof PUBLICATION_PREPARE_KIND;
  readonly action: 'create' | 'existing';
  readonly create_intent: PublicationCreateIntentV1 | null;
}

export interface PublicationJournalEvidenceV1 {
  readonly provider_repo_id: string;
  readonly provider_pr_number: number;
  readonly publication_id: string;
  readonly receipt_digest: string;
}

export type PublicationReceiptInput = Omit<PublicationReceiptV1, 'protocol' | 'kind' | 'publication_id'>;

function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

/** Stable JSON is the single byte contract for cache, marker, and journal digests. */
export function stablePublicationJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stablePublicationJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(byteCompare).map((key) => `${JSON.stringify(key)}:${stablePublicationJson(record[key])}`).join(',')}}`;
}

export function publicationSha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function derivePublicationId(input: Pick<PublicationReceiptInput, 'provider_repo_id' | 'task_id' | 'claim_id' | 'generation' | 'head_sha'>): string {
  return publicationSha256(stablePublicationJson([
    PUBLICATION_RECEIPT_PROTOCOL,
    input.provider_repo_id,
    input.task_id,
    input.claim_id,
    input.generation,
    input.head_sha,
  ]));
}

function validateCreateIntentInput(input: Omit<PublicationCreateIntentV1, 'protocol' | 'kind' | 'publication_id'>): Omit<PublicationCreateIntentV1, 'protocol' | 'kind' | 'publication_id'> {
  const intent = {
    provider_repo_id: requiredString(input.provider_repo_id, 'provider_repo_id'),
    task_id: requiredString(input.task_id, 'task_id'),
    claim_id: requiredString(input.claim_id, 'claim_id'),
    generation: input.generation,
    head_sha: requiredString(input.head_sha, 'head_sha'),
  };
  if (!TASK_DIGEST_PATTERN.test(intent.task_id)) throw new Error('publication create intent task_id is invalid');
  if (!Number.isInteger(intent.generation) || intent.generation < 1) throw new Error('publication create intent generation is invalid');
  if (!GIT_OID_PATTERN.test(intent.head_sha)) throw new Error('publication create intent head_sha is invalid');
  return Object.freeze(intent);
}

export function buildPublicationCreateIntent(input: Omit<PublicationCreateIntentV1, 'protocol' | 'kind' | 'publication_id'>): PublicationCreateIntentV1 {
  const valid = validateCreateIntentInput(input);
  return Object.freeze({
    protocol: PUBLICATION_RECEIPT_PROTOCOL,
    kind: PUBLICATION_CREATE_INTENT_KIND,
    publication_id: derivePublicationId(valid),
    ...valid,
  });
}

export function validatePublicationCreateIntent(value: unknown): PublicationCreateIntentV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('publication create intent must be an object');
  const record = value as Record<string, unknown>;
  requireExactKeys(record, ['protocol', 'kind', 'publication_id', 'provider_repo_id', 'task_id', 'claim_id', 'generation', 'head_sha']);
  if (record.protocol !== PUBLICATION_RECEIPT_PROTOCOL || record.kind !== PUBLICATION_CREATE_INTENT_KIND) {
    throw new Error('publication create intent protocol or kind is invalid');
  }
  const intent = buildPublicationCreateIntent({
    provider_repo_id: record.provider_repo_id as string,
    task_id: record.task_id as string,
    claim_id: record.claim_id as string,
    generation: record.generation as number,
    head_sha: record.head_sha as string,
  });
  if (record.publication_id !== intent.publication_id) throw new Error('publication create intent publication_id is stale');
  return intent;
}

export function canonicalPublicationCreateIntentBytes(intent: PublicationCreateIntentV1): string {
  return stablePublicationJson(validatePublicationCreateIntent(intent));
}

export function buildPublicationPrepareEnvelope(intent: PublicationCreateIntentV1 | null): PublicationPrepareEnvelopeV1 {
  return Object.freeze({
    protocol: PUBLICATION_RECEIPT_PROTOCOL,
    kind: PUBLICATION_PREPARE_KIND,
    action: intent === null ? 'existing' : 'create',
    create_intent: intent === null ? null : validatePublicationCreateIntent(intent),
  });
}

export function validatePublicationPrepareEnvelope(value: unknown): PublicationPrepareEnvelopeV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('publication prepare envelope must be an object');
  const record = value as Record<string, unknown>;
  requireExactKeys(record, ['protocol', 'kind', 'action', 'create_intent']);
  if (record.protocol !== PUBLICATION_RECEIPT_PROTOCOL || record.kind !== PUBLICATION_PREPARE_KIND) {
    throw new Error('publication prepare envelope protocol or kind is invalid');
  }
  if (record.action !== 'create' && record.action !== 'existing') throw new Error('publication prepare envelope action is invalid');
  const intent = record.create_intent === null ? null : validatePublicationCreateIntent(record.create_intent);
  if ((record.action === 'create') !== (intent !== null)) throw new Error('publication prepare envelope action does not match create intent');
  return buildPublicationPrepareEnvelope(intent);
}

export function canonicalPublicationPrepareEnvelopeBytes(envelope: PublicationPrepareEnvelopeV1): string {
  return stablePublicationJson(validatePublicationPrepareEnvelope(envelope));
}

export function validatePublicationJournalEvidence(value: unknown): PublicationJournalEvidenceV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('publication journal evidence must be an object');
  const record = value as Record<string, unknown>;
  requireExactKeys(record, ['provider_repo_id', 'provider_pr_number', 'publication_id', 'receipt_digest']);
  const evidence = {
    provider_repo_id: requiredString(record.provider_repo_id, 'provider_repo_id'),
    provider_pr_number: record.provider_pr_number,
    publication_id: requiredString(record.publication_id, 'publication_id'),
    receipt_digest: requiredString(record.receipt_digest, 'receipt_digest'),
  };
  if (!Number.isInteger(evidence.provider_pr_number) || (evidence.provider_pr_number as number) < 1) {
    throw new Error('publication journal evidence provider_pr_number is invalid');
  }
  if (!SHA256_PATTERN.test(evidence.publication_id) || !SHA256_PATTERN.test(evidence.receipt_digest)) {
    throw new Error('publication journal evidence digest is invalid');
  }
  return Object.freeze(evidence as PublicationJournalEvidenceV1);
}

export function canonicalPublicationJournalEvidenceBytes(evidence: PublicationJournalEvidenceV1): string {
  return stablePublicationJson(validatePublicationJournalEvidence(evidence));
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`publication receipt ${field} is required`);
  return value;
}

function requireExactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort(byteCompare);
  const sortedExpected = [...expected].sort(byteCompare);
  if (stablePublicationJson(actual) !== stablePublicationJson(sortedExpected)) {
    throw new Error(`publication receipt fields are invalid: expected ${sortedExpected.join(', ')}`);
  }
}

function validateInput(input: PublicationReceiptInput): PublicationReceiptInput {
  const receipt: PublicationReceiptInput = {
    repo_id: requiredString(input.repo_id, 'repo_id'),
    task_id: requiredString(input.task_id, 'task_id'),
    task_revision: requiredString(input.task_revision, 'task_revision'),
    claim_id: requiredString(input.claim_id, 'claim_id'),
    generation: input.generation,
    target_ref: requiredString(input.target_ref, 'target_ref'),
    base_sha: requiredString(input.base_sha, 'base_sha'),
    branch: requiredString(input.branch, 'branch'),
    head_sha: requiredString(input.head_sha, 'head_sha'),
    tree_sha: requiredString(input.tree_sha, 'tree_sha'),
    review_subject_sha256: requiredString(input.review_subject_sha256, 'review_subject_sha256'),
    verification_evidence_sha256: requiredString(input.verification_evidence_sha256, 'verification_evidence_sha256'),
    merge_seal_sha256: requiredString(input.merge_seal_sha256, 'merge_seal_sha256'),
    provider: input.provider,
    provider_repo_id: requiredString(input.provider_repo_id, 'provider_repo_id'),
    pr_number: input.pr_number,
    pr_url: requiredString(input.pr_url, 'pr_url'),
    created_at: requiredString(input.created_at, 'created_at'),
  };
  if (!TASK_DIGEST_PATTERN.test(receipt.task_id)) throw new Error('publication receipt task_id is invalid');
  if (!TASK_DIGEST_PATTERN.test(receipt.task_revision)) throw new Error('publication receipt task_revision is invalid');
  if (receipt.provider !== 'github') throw new Error('publication receipt provider is invalid');
  if (!Number.isInteger(receipt.pr_number) || receipt.pr_number < 1) {
    throw new Error('publication receipt pr_number is invalid');
  }
  if (!Number.isInteger(receipt.generation) || receipt.generation < 1) throw new Error('publication receipt generation is invalid');
  for (const field of ['base_sha', 'head_sha', 'tree_sha'] as const) {
    if (!GIT_OID_PATTERN.test(receipt[field])) throw new Error(`publication receipt ${field} is invalid`);
  }
  for (const field of ['review_subject_sha256', 'verification_evidence_sha256', 'merge_seal_sha256'] as const) {
    if (!SHA256_PATTERN.test(receipt[field])) throw new Error(`publication receipt ${field} is invalid`);
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(receipt.created_at)
    || Number.isNaN(Date.parse(receipt.created_at))) throw new Error('publication receipt created_at is invalid');
  return Object.freeze(receipt);
}

function receiptBasis(input: PublicationReceiptInput): PublicationReceiptV1 {
  const valid = validateInput(input);
  return Object.freeze({
    protocol: PUBLICATION_RECEIPT_PROTOCOL,
    kind: PUBLICATION_RECEIPT_KIND,
    publication_id: derivePublicationId(valid),
    ...valid,
  });
}

export function canonicalPublicationReceiptBytes(receipt: PublicationReceiptV1): string {
  return stablePublicationJson(receipt);
}

export function publicationReceiptDigest(receipt: PublicationReceiptV1): string {
  return publicationSha256(canonicalPublicationReceiptBytes(validatePublicationReceipt(receipt)));
}

export function buildPublicationReceipt(input: PublicationReceiptInput): PublicationReceiptV1 {
  const basis = receiptBasis(input);
  return Object.freeze(basis);
}

export function validatePublicationReceipt(value: unknown): PublicationReceiptV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('publication receipt must be an object');
  const record = value as Record<string, unknown>;
  const expected = [
    'protocol', 'kind', 'publication_id', 'repo_id', 'task_id', 'task_revision', 'claim_id', 'generation',
    'target_ref', 'base_sha', 'branch', 'head_sha', 'tree_sha', 'review_subject_sha256',
    'verification_evidence_sha256', 'merge_seal_sha256', 'provider', 'provider_repo_id', 'pr_number',
    'pr_url', 'created_at',
  ];
  requireExactKeys(record, expected);
  if (record.protocol !== PUBLICATION_RECEIPT_PROTOCOL || record.kind !== PUBLICATION_RECEIPT_KIND) {
    throw new Error('publication receipt protocol or kind is invalid');
  }
  const receipt = buildPublicationReceipt({
    repo_id: record.repo_id as string,
    task_id: record.task_id as string,
    task_revision: record.task_revision as string,
    claim_id: record.claim_id as string,
    generation: record.generation as number,
    target_ref: record.target_ref as string,
    base_sha: record.base_sha as string,
    branch: record.branch as string,
    head_sha: record.head_sha as string,
    tree_sha: record.tree_sha as string,
    review_subject_sha256: record.review_subject_sha256 as string,
    verification_evidence_sha256: record.verification_evidence_sha256 as string,
    merge_seal_sha256: record.merge_seal_sha256 as string,
    provider: record.provider as 'github',
    provider_repo_id: record.provider_repo_id as string,
    pr_number: record.pr_number as number,
    pr_url: record.pr_url as string,
    created_at: record.created_at as string,
  });
  if (record.publication_id !== receipt.publication_id) throw new Error('publication receipt publication_id is stale');
  return receipt;
}

export function encodePublicationMarker(receipt: PublicationReceiptV1): string {
  const canonical = canonicalPublicationReceiptBytes(validatePublicationReceipt(receipt));
  const encoded = Buffer.from(canonical, 'utf-8').toString('base64url');
  const marker = `${PUBLICATION_MARKER_PREFIX}${encoded}${PUBLICATION_MARKER_SUFFIX}`;
  if (Buffer.byteLength(marker, 'utf-8') > PUBLICATION_MARKER_MAX_BYTES) throw new Error('publication receipt marker exceeds its bounded size');
  return marker;
}

function markerMatches(body: string): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  MARKER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKER_PATTERN.exec(body)) !== null) matches.push(match);
  return matches;
}

export function decodePublicationMarker(body: string): PublicationReceiptV1 | null {
  const matches = markerMatches(body);
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw new Error('publication receipt marker is ambiguous');
  const encoded = matches[0]![1]!;
  if (encoded.length > PUBLICATION_MARKER_MAX_BYTES * 2) throw new Error('publication receipt marker exceeds its bounded size');
  let canonical: string;
  let value: unknown;
  try {
    canonical = Buffer.from(encoded, 'base64url').toString('utf-8');
    value = JSON.parse(canonical);
  } catch {
    throw new Error('publication receipt marker is malformed');
  }
  if (Buffer.byteLength(canonical, 'utf-8') > PUBLICATION_MARKER_MAX_BYTES) throw new Error('publication receipt marker exceeds its bounded size');
  const receipt = validatePublicationReceipt(value);
  if (canonical !== canonicalPublicationReceiptBytes(receipt)) throw new Error('publication receipt marker is not canonical');
  return receipt;
}

/** Replace the only marker, or append the first marker without changing human PR text. */
export function replacePublicationMarker(body: string, receipt: PublicationReceiptV1): string {
  const marker = encodePublicationMarker(receipt);
  const matches = markerMatches(body);
  if (matches.length > 1) throw new Error('publication receipt marker is ambiguous');
  if (matches.length === 1) {
    const match = matches[0]!;
    return `${body.slice(0, match.index)}${marker}${body.slice(match.index + match[0].length)}`;
  }
  return body.trimEnd() === '' ? marker : `${body.trimEnd()}\n\n${marker}`;
}
