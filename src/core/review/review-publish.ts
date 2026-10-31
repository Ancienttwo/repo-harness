import { isReviewRuntimeId, type ReviewRuntimeId } from './review-runtimes';
import type { ModelRelation } from './acceptance-receipt';

/**
 * Input document for `review publish`.
 *
 * This is not the acceptance receipt. The acceptance receipt (protocol 4)
 * records the verified subject and verdict, and stays the publication
 * authority. It carries neither a review round nor a risk tier, and its
 * findings have no file location. The publish receipt adds exactly those
 * fields that one review round needs to become a GitHub review:
 *
 * - P0/P1/P2 findings carry a path, a line, evidence and a bounded fix, so
 *   each one becomes exactly one inline review thread.
 * - P3 findings are NITs. They carry no location, so they can appear only in
 *   the review body.
 *
 * The only way to build one is to pass the closed validator below. Published
 * text is rendered from this document alone; caller arguments never change it.
 */
export type ReviewRiskTier = 'low' | 'medium' | 'high';
export type ReviewPublishSeverity = 'P0' | 'P1' | 'P2' | 'P3';

export interface ReviewPublishBlockingFinding {
  readonly id: string;
  readonly severity: 'P0' | 'P1' | 'P2';
  readonly path: string;
  readonly line: number;
  readonly evidence: string;
  readonly fix: string;
}

export interface ReviewPublishNit {
  readonly id: string;
  readonly severity: 'P3';
  readonly message: string;
}

export type ReviewPublishFinding = ReviewPublishBlockingFinding | ReviewPublishNit;

export interface ReviewPublishReceipt {
  readonly protocol: 1;
  readonly kind: 'repo-harness-review-publish-receipt';
  readonly round: number;
  readonly subject_sha: string;
  readonly risk_tier: ReviewRiskTier;
  readonly reviewer: {
    readonly harness: ReviewRuntimeId;
    /** Null when the host did not observe the reviewer model. */
    readonly actual_model: string | null;
  };
  readonly verdict: 'PASS' | 'FAIL';
  readonly model_relation: ModelRelation;
  readonly summary: string;
  readonly findings: readonly ReviewPublishFinding[];
}

export interface ReviewInlineComment {
  readonly path: string;
  readonly line: number;
  readonly side: 'RIGHT';
  readonly body: string;
}

const TOP_FIELDS = ['protocol', 'kind', 'round', 'subject_sha', 'risk_tier', 'reviewer', 'verdict', 'model_relation', 'summary', 'findings'] as const;
const MAX_TEXT = 20_000;
const MAX_PATH = 1_024;

function invalid(message: string): never {
  throw new Error('review publish receipt is invalid: ' + message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactFields(value: Record<string, unknown>, fields: readonly string[], label: string): void {
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) invalid(label + ' fields are invalid');
}

function text(value: unknown, field: string, max = MAX_TEXT): string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0') || value.length > max) invalid(field + ' must be a non-empty string');
  return value;
}

function optionalModel(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0') || value.length > 512) invalid('reviewer.actual_model must be null or a non-empty string');
  return value;
}

function gitSha(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)) invalid('subject_sha must be a lowercase hexadecimal Git object id');
  return value;
}

function reviewPath(value: unknown): string {
  const path = text(value, 'finding.path', MAX_PATH);
  if (path.startsWith('/') || path.includes('\\') || path.includes('://')
    || path.split('/').some((part) => part === '' || part === '.' || part === '..')) invalid('finding.path must be a repository-relative path');
  return path;
}

function lineNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 1_000_000) invalid('finding.line must be a positive integer');
  return value;
}

function finding(value: unknown, index: number): ReviewPublishFinding {
  if (!isRecord(value)) invalid('finding ' + index + ' must be an object');
  if (!['P0', 'P1', 'P2', 'P3'].includes(String(value.severity))) invalid('finding ' + index + ' severity is invalid');
  const severity = value.severity as ReviewPublishSeverity;
  const id = text(value.id, 'finding.id', 256);
  if (severity === 'P3') {
    exactFields(value, ['id', 'severity', 'message'], 'NIT finding');
    return Object.freeze({ id, severity: 'P3', message: text(value.message, 'finding.message') });
  }
  exactFields(value, ['id', 'severity', 'path', 'line', 'evidence', 'fix'], 'blocking finding');
  return Object.freeze({
    id,
    severity,
    path: reviewPath(value.path),
    line: lineNumber(value.line),
    evidence: text(value.evidence, 'finding.evidence'),
    fix: text(value.fix, 'finding.fix'),
  });
}

export function validateReviewPublishReceipt(value: unknown): ReviewPublishReceipt {
  if (!isRecord(value)) invalid('document must be an object');
  exactFields(value, TOP_FIELDS, 'receipt');
  if (value.protocol !== 1) invalid('protocol must be 1');
  if (value.kind !== 'repo-harness-review-publish-receipt') invalid('kind is invalid');
  if (typeof value.round !== 'number' || !Number.isSafeInteger(value.round) || value.round < 1 || value.round > 3) invalid('round must be an integer from 1 to 3');
  if (!['low', 'medium', 'high'].includes(String(value.risk_tier))) invalid('risk_tier is invalid');
  if (!['PASS', 'FAIL'].includes(String(value.verdict))) invalid('verdict is invalid');
  if (!['different-family', 'same-family', 'unknown'].includes(String(value.model_relation))) invalid('model_relation is invalid');
  if (!isRecord(value.reviewer)) invalid('reviewer must be an object');
  exactFields(value.reviewer, ['harness', 'actual_model'], 'reviewer');
  if (typeof value.reviewer.harness !== 'string' || !isReviewRuntimeId(value.reviewer.harness)) invalid('reviewer.harness is invalid');
  if (!Array.isArray(value.findings)) invalid('findings must be an array');
  const findings = value.findings.map((entry, index) => finding(entry, index));
  const ids = new Set<string>();
  for (const entry of findings) {
    if (ids.has(entry.id)) invalid('finding ids must be unique');
    ids.add(entry.id);
  }
  const blocking = findings.filter((entry) => entry.severity !== 'P3');
  if (value.verdict === 'PASS' && blocking.length > 0) invalid('PASS cannot carry an unresolved P0/P1/P2 finding');
  if (value.verdict === 'FAIL' && blocking.length === 0) invalid('FAIL requires at least one P0/P1/P2 finding');
  return Object.freeze({
    protocol: 1,
    kind: 'repo-harness-review-publish-receipt',
    round: value.round,
    subject_sha: gitSha(value.subject_sha),
    risk_tier: value.risk_tier as ReviewRiskTier,
    reviewer: Object.freeze({ harness: value.reviewer.harness as ReviewRuntimeId, actual_model: optionalModel(value.reviewer.actual_model) }),
    verdict: value.verdict as 'PASS' | 'FAIL',
    model_relation: value.model_relation as ModelRelation,
    summary: text(value.summary, 'summary'),
    findings: Object.freeze(findings),
  });
}

export function reviewerIdentity(receipt: ReviewPublishReceipt): string {
  return receipt.reviewer.harness + ' (' + (receipt.reviewer.actual_model ?? 'unobserved') + ')';
}

export function blockingFindings(receipt: ReviewPublishReceipt): readonly ReviewPublishBlockingFinding[] {
  return receipt.findings.filter((entry): entry is ReviewPublishBlockingFinding => entry.severity !== 'P3');
}

export function nitFindings(receipt: ReviewPublishReceipt): readonly ReviewPublishNit[] {
  return receipt.findings.filter((entry): entry is ReviewPublishNit => entry.severity === 'P3');
}

function severityCounts(receipt: ReviewPublishReceipt): string {
  const order: readonly ReviewPublishSeverity[] = ['P0', 'P1', 'P2', 'P3'];
  const counts = order.map((severity) => [severity, receipt.findings.filter((entry) => entry.severity === severity).length] as const)
    .filter(([, count]) => count > 0);
  return counts.length ? counts.map(([severity, count]) => count + ' ' + severity).join(', ') : 'none';
}

function findingSummary(finding: ReviewPublishFinding): string {
  if (finding.severity === 'P3') return 'P3 ' + finding.id + ': ' + finding.message;
  return finding.severity + ' ' + finding.id + ' at ' + finding.path + ':' + finding.line + ': ' + finding.evidence + ' -> ' + finding.fix;
}

export function renderAcceptanceClaim(receipt: ReviewPublishReceipt): string {
  return [
    'repo-harness acceptance claim',
    'Seat: acceptor',
    'Round: ' + receipt.round,
    'Subject: ' + receipt.subject_sha,
    'Tier: ' + receipt.risk_tier,
    'Agent: ' + reviewerIdentity(receipt) + ', read-only',
    '',
  ].join('\n');
}

export function renderAcceptanceReview(receipt: ReviewPublishReceipt): string {
  const nits = nitFindings(receipt);
  return [
    'repo-harness acceptance review',
    'Round: ' + receipt.round,
    'Subject: ' + receipt.subject_sha,
    'Tier: ' + receipt.risk_tier,
    'Verdict: ' + receipt.verdict,
    'Reviewer: ' + reviewerIdentity(receipt),
    'Model relation: ' + receipt.model_relation,
    '',
    receipt.summary,
    '',
    '## NITs',
    '',
    ...(nits.length ? nits.map((entry) => '- ' + entry.id + ': ' + entry.message) : ['None.']),
    '',
  ].join('\n');
}

export function renderAcceptanceRecord(receipt: ReviewPublishReceipt, claimUrl: string): string {
  const verdict = receipt.verdict + ': ' + severityCounts(receipt);
  return [
    'repo-harness acceptance record',
    'Claim: ' + claimUrl,
    '',
    '| Round | Seat | Subject | Verdict |',
    '|---|---|---|---|',
    '| ' + receipt.round + ' | ' + reviewerIdentity(receipt) + ', read-only | `' + receipt.subject_sha + '` | ' + verdict + ' |',
    '',
    'Model relation: ' + receipt.model_relation,
    '',
    'Findings:',
    '',
    ...(receipt.findings.length ? receipt.findings.map((entry) => '- ' + findingSummary(entry)) : ['- none']),
    '',
  ].join('\n');
}

export function renderInlineComment(finding: ReviewPublishBlockingFinding): ReviewInlineComment {
  return Object.freeze({
    path: finding.path,
    line: finding.line,
    side: 'RIGHT' as const,
    body: '**' + finding.severity + ' ' + finding.id + '**\n\n' + finding.evidence + '\n\n**Fix**: ' + finding.fix,
  });
}

/** Review API payload fields that come from the receipt. The caller adds the commit id. */
export function reviewPayloadFromReceipt(receipt: ReviewPublishReceipt): {
  readonly event: 'COMMENT';
  readonly body: string;
  readonly comments: readonly ReviewInlineComment[];
} {
  return Object.freeze({
    event: 'COMMENT' as const,
    body: renderAcceptanceReview(receipt),
    comments: Object.freeze(blockingFindings(receipt).map(renderInlineComment)),
  });
}
