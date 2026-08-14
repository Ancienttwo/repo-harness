import { createHash } from 'crypto';

import type { StrictRiskCategory, WorkflowProfile } from '../workflow/profile';

export const CHANGE_ASSESSMENT_PROTOCOL = 1 as const;
export const REVIEW_SELECTION_PACKET_PROTOCOL = 1 as const;

export const CHANGE_ASSESSMENT_REASON_CODES = [
  'authority_change',
  'irreversible_effect',
  'pattern_novelty',
  'reviewer_disagreement',
  'oracle_gap',
] as const;

export type ChangeAssessmentReasonCode = (typeof CHANGE_ASSESSMENT_REASON_CODES)[number];

export const REVIEW_ORACLE_KINDS = [
  'deterministic_test',
  'runtime_readback',
  'manual_acceptance',
] as const;

export type ReviewOracleKind = (typeof REVIEW_ORACLE_KINDS)[number];

export interface AssessmentSubject {
  readonly status: 'ok' | 'unknown';
  readonly target_ref: string;
  readonly target_rev: string;
  readonly head_rev: string;
  readonly paths: readonly string[];
  readonly review_subject_sha256: string;
  readonly reason?: string;
}

export interface DeclaredReviewOracle {
  readonly id: string;
  readonly kind: ReviewOracleKind;
  /** Literal reviewed paths, or `*` when the oracle applies to the whole subject. */
  readonly paths: readonly string[];
}

export interface ChangeAssessmentReason {
  readonly code: ChangeAssessmentReasonCode;
  readonly paths: readonly string[];
  readonly required_oracle_kinds: readonly ReviewOracleKind[];
  readonly evidence: string;
}

export interface ChangeAssessment {
  readonly protocol: typeof CHANGE_ASSESSMENT_PROTOCOL;
  readonly kind: 'repo-harness-change-assessment';
  readonly status: 'ready' | 'blocked';
  readonly review_subject_sha256: string;
  readonly target_ref: string;
  readonly target_revision: string;
  readonly subject_paths: readonly string[];
  readonly workflow_profile: WorkflowProfile;
  readonly strict_categories: readonly StrictRiskCategory[];
  readonly selected_paths: readonly string[];
  readonly required_oracles: readonly DeclaredReviewOracle[];
  readonly reasons: readonly ChangeAssessmentReason[];
  readonly assessment_sha256: string;
}

export interface ChangeAssessmentFailure {
  readonly protocol: typeof CHANGE_ASSESSMENT_PROTOCOL;
  readonly kind: 'repo-harness-change-assessment-failure';
  readonly status: 'degraded';
  readonly code: 'subject_unavailable' | 'invalid_input';
  readonly message: string;
}

export type ChangeAssessmentResult = ChangeAssessment | ChangeAssessmentFailure;

export interface ReviewSelectionPacket {
  readonly protocol: typeof REVIEW_SELECTION_PACKET_PROTOCOL;
  readonly kind: 'repo-harness-review-selection-packet';
  readonly status: 'ready' | 'blocked';
  readonly assessment_sha256: string;
  readonly review_subject_sha256: string;
  readonly target_ref: string;
  readonly target_revision: string;
  readonly subject_paths: readonly string[];
  readonly selected_paths: readonly string[];
  readonly required_oracles: readonly DeclaredReviewOracle[];
  readonly reasons: readonly ChangeAssessmentReason[];
  readonly packet_sha256: string;
}

export interface ReviewerDisagreementInput {
  readonly review_subject_sha256: string;
  readonly target_revision: string;
  readonly paths: readonly string[];
  readonly summary: string;
}

export interface ChangeAssessmentInput {
  readonly subject: AssessmentSubject;
  readonly workflowProfile: WorkflowProfile;
  readonly strictCategories: readonly StrictRiskCategory[];
  readonly patternNoveltyPaths: readonly string[];
  readonly declaredOracles: readonly DeclaredReviewOracle[];
}

const AUTHORITY_CATEGORIES = new Set<StrictRiskCategory>([
  'auth', 'payment', 'security', 'schema', 'public-api',
]);
const IRREVERSIBLE_CATEGORIES = new Set<StrictRiskCategory>([
  'migration', 'deploy', 'release', 'destructive',
]);
const STRICT_RISK_CATEGORIES = new Set<StrictRiskCategory>([
  'auth', 'payment', 'security', 'schema', 'migration', 'deploy', 'release', 'public-api', 'destructive',
]);

function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(byteCompare);
}

function isStringArray(value: readonly unknown[]): value is readonly string[] {
  return value.every((entry) => typeof entry === 'string');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(byteCompare).map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function validSubject(subject: AssessmentSubject): boolean {
  return subject.status === 'ok'
    && /^sha256:[0-9a-f]{64}$/.test(subject.review_subject_sha256)
    && subject.target_ref.trim() !== ''
    && /^[0-9a-f]{40,64}$/.test(subject.target_rev)
    && /^[0-9a-f]{40,64}$/.test(subject.head_rev);
}

function normalizeOracle(oracle: unknown): DeclaredReviewOracle | null {
  if (!oracle || typeof oracle !== 'object' || Array.isArray(oracle)) return null;
  const record = oracle as Record<string, unknown>;
  if (typeof record.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(record.id)) return null;
  if (!REVIEW_ORACLE_KINDS.includes(record.kind as ReviewOracleKind)) return null;
  if (!Array.isArray(record.paths) || !isStringArray(record.paths)) return null;
  const paths = uniqueSorted(record.paths);
  if (paths.length === 0 || paths.some((path) => path !== '*' && (path.startsWith('/') || path.includes('..') || path.includes('\\')))) {
    return null;
  }
  return Object.freeze({ id: record.id, kind: record.kind as ReviewOracleKind, paths });
}

function normalizedOracles(oracles: readonly unknown[]): DeclaredReviewOracle[] | null {
  const values: DeclaredReviewOracle[] = [];
  const ids = new Set<string>();
  for (const oracle of oracles) {
    const normalized = normalizeOracle(oracle);
    if (!normalized || ids.has(normalized.id)) return null;
    ids.add(normalized.id);
    values.push(normalized);
  }
  return values.sort((left, right) => byteCompare(left.id, right.id));
}

function subjectPaths(paths: readonly string[]): string[] | null {
  const normalized = uniqueSorted(paths);
  if (normalized.some((path) => path.startsWith('/') || path.includes('..') || path.includes('\\') || path === '*')) return null;
  return normalized;
}

function reason(
  code: ChangeAssessmentReasonCode,
  paths: readonly string[],
  requiredOracleKinds: readonly ReviewOracleKind[],
  evidence: string,
): ChangeAssessmentReason {
  return Object.freeze({
    code,
    paths: uniqueSorted(paths),
    required_oracle_kinds: [...new Set(requiredOracleKinds)],
    evidence,
  });
}

function oracleCovers(oracle: DeclaredReviewOracle, paths: readonly string[], kinds: readonly ReviewOracleKind[]): boolean {
  if (!kinds.includes(oracle.kind)) return false;
  return oracle.paths.includes('*') || paths.every((path) => oracle.paths.includes(path));
}

function canonicalAssessment(value: Omit<ChangeAssessment, 'assessment_sha256'>): Omit<ChangeAssessment, 'assessment_sha256'> {
  return value;
}

function assessmentFingerprint(value: Omit<ChangeAssessment, 'assessment_sha256'>): string {
  return sha256(canonicalAssessment(value));
}

function canonicalPacket(value: Omit<ReviewSelectionPacket, 'packet_sha256'>): Omit<ReviewSelectionPacket, 'packet_sha256'> {
  return value;
}

function packetFingerprint(value: Omit<ReviewSelectionPacket, 'packet_sha256'>): string {
  return sha256(canonicalPacket(value));
}

function selectedPaths(reasons: readonly ChangeAssessmentReason[]): string[] {
  return uniqueSorted(reasons.flatMap((entry) => entry.paths));
}

function orderReasons(reasons: readonly ChangeAssessmentReason[]): ChangeAssessmentReason[] {
  const byCode = new Map(reasons.map((entry) => [entry.code, entry]));
  return CHANGE_ASSESSMENT_REASON_CODES.flatMap((code) => {
    const entry = byCode.get(code);
    return entry ? [entry] : [];
  });
}

/**
 * Pure final-subject assessment. It deliberately accepts already-observed
 * inputs only: no Hook event, wall clock, model output, or git command can
 * influence this result. That makes the packet stable across edit order and
 * allows verify-sprint to recompute it at the authoritative boundary.
 */
export function assessChange(input: ChangeAssessmentInput): ChangeAssessmentResult {
  if (!validSubject(input.subject)) {
    return Object.freeze({
      protocol: CHANGE_ASSESSMENT_PROTOCOL,
      kind: 'repo-harness-change-assessment-failure',
      status: 'degraded',
      code: 'subject_unavailable',
      message: input.subject.reason ?? 'final review subject is unavailable',
    });
  }
  const paths = subjectPaths(input.subject.paths);
  const oracles = normalizedOracles(input.declaredOracles);
  if (!paths || !oracles) {
    return Object.freeze({
      protocol: CHANGE_ASSESSMENT_PROTOCOL,
      kind: 'repo-harness-change-assessment-failure',
      status: 'degraded',
      code: 'invalid_input',
      message: 'assessment paths or declared oracles are invalid',
    });
  }

  const strictCategories = [...new Set(input.strictCategories)].sort(byteCompare);
  const patternNoveltyPaths = uniqueSorted(input.patternNoveltyPaths).filter((path) => paths.includes(path));
  const reasons: ChangeAssessmentReason[] = [];
  const authorityCategories = strictCategories.filter((category) => AUTHORITY_CATEGORIES.has(category));
  if (authorityCategories.length > 0) {
    reasons.push(reason(
      'authority_change',
      paths,
      ['deterministic_test'],
      `strict workflow categories: ${authorityCategories.join(', ')}`,
    ));
  }
  const irreversibleCategories = strictCategories.filter((category) => IRREVERSIBLE_CATEGORIES.has(category));
  if (irreversibleCategories.length > 0) {
    reasons.push(reason(
      'irreversible_effect',
      paths,
      ['runtime_readback'],
      `irreversible workflow categories: ${irreversibleCategories.join(', ')}`,
    ));
  }
  if (patternNoveltyPaths.length > 0) {
    reasons.push(reason(
      'pattern_novelty',
      patternNoveltyPaths,
      ['deterministic_test'],
      'final content contains a deterministic new-abstraction signal',
    ));
  }

  // An oracle is a path-level claim: a two-path risk cannot become ready
  // merely because its declaration covers one of the two paths. Derive the
  // gap per path so a later packet can show exactly which final-subject
  // surface is still without an executable oracle.
  const missingOraclePaths = uniqueSorted(reasons.flatMap((entry) => entry.paths.filter((path) => (
    entry.required_oracle_kinds.length > 0
      && !oracles.some((oracle) => oracleCovers(oracle, [path], entry.required_oracle_kinds))
  ))));
  if (missingOraclePaths.length > 0) {
    reasons.push(reason(
      'oracle_gap',
      missingOraclePaths,
      ['deterministic_test', 'runtime_readback'],
      'a selected risk surface has no declared executable oracle with the required kind',
    ));
  }

  const orderedReasons = orderReasons(reasons);
  const usedOracles = oracles.filter((oracle) => orderedReasons.some((entry) => oracleCovers(oracle, entry.paths, entry.required_oracle_kinds)));
  const basis: Omit<ChangeAssessment, 'assessment_sha256'> = {
    protocol: CHANGE_ASSESSMENT_PROTOCOL,
    kind: 'repo-harness-change-assessment',
    status: missingOraclePaths.length > 0 ? 'blocked' : 'ready',
    review_subject_sha256: input.subject.review_subject_sha256,
    target_ref: input.subject.target_ref,
    target_revision: input.subject.target_rev,
    subject_paths: paths,
    workflow_profile: input.workflowProfile,
    strict_categories: strictCategories,
    selected_paths: selectedPaths(orderedReasons),
    required_oracles: usedOracles,
    reasons: orderedReasons,
  };
  return Object.freeze({ ...basis, assessment_sha256: assessmentFingerprint(basis) });
}

export function buildReviewSelectionPacket(assessment: ChangeAssessment): ReviewSelectionPacket {
  const basis: Omit<ReviewSelectionPacket, 'packet_sha256'> = {
    protocol: REVIEW_SELECTION_PACKET_PROTOCOL,
    kind: 'repo-harness-review-selection-packet',
    status: assessment.status,
    assessment_sha256: assessment.assessment_sha256,
    review_subject_sha256: assessment.review_subject_sha256,
    target_ref: assessment.target_ref,
    target_revision: assessment.target_revision,
    subject_paths: assessment.subject_paths,
    selected_paths: assessment.selected_paths,
    required_oracles: assessment.required_oracles,
    reasons: assessment.reasons,
  };
  return Object.freeze({ ...basis, packet_sha256: packetFingerprint(basis) });
}

function parseReasons(value: unknown, subject: readonly string[], label: string): ChangeAssessmentReason[] {
  if (!Array.isArray(value)) throw new Error(`${label} reasons are invalid`);
  const reasons = value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${label} reason is invalid`);
    const record = entry as Record<string, unknown>;
    if (!CHANGE_ASSESSMENT_REASON_CODES.includes(record.code as ChangeAssessmentReasonCode)) {
      throw new Error(`${label} reason code is invalid`);
    }
    if (!Array.isArray(record.paths) || !Array.isArray(record.required_oracle_kinds) || typeof record.evidence !== 'string') {
      throw new Error(`${label} reason fields are invalid`);
    }
    if (!isStringArray(record.paths)) throw new Error(`${label} reason paths must be strings`);
    const paths = uniqueSorted(record.paths);
    if (paths.length === 0 || paths.some((path) => !subject.includes(path))) {
      throw new Error(`${label} reason path escapes subject`);
    }
    const kinds = record.required_oracle_kinds as ReviewOracleKind[];
    if (kinds.some((kind) => !REVIEW_ORACLE_KINDS.includes(kind))) {
      throw new Error(`${label} reason oracle kind is invalid`);
    }
    if (record.evidence.trim() === '') throw new Error(`${label} reason evidence is required`);
    return reason(record.code as ChangeAssessmentReasonCode, paths, kinds, record.evidence);
  });
  const ordered = orderReasons(reasons);
  if (stableJson(ordered) !== stableJson(reasons)) throw new Error(`${label} reasons are not closed-order canonical`);
  return ordered;
}

/**
 * Strictly validates the serialised base assessment before any subject-bound
 * caller compares it with a fresh recomputation. A fingerprint alone only
 * proves that a record hashes itself; this rejects malformed, non-canonical,
 * or reviewer-authored assessment shapes before that comparison.
 */
export function validateChangeAssessment(value: unknown): ChangeAssessment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('change assessment must be an object');
  const assessment = value as Record<string, unknown>;
  const expectedKeys = [
    'assessment_sha256', 'kind', 'protocol', 'reasons', 'required_oracles',
    'review_subject_sha256', 'selected_paths', 'status', 'strict_categories', 'subject_paths',
    'target_ref', 'target_revision', 'workflow_profile',
  ];
  if (stableJson(Object.keys(assessment).sort(byteCompare)) !== stableJson(expectedKeys)) {
    throw new Error('change assessment contains unknown fields');
  }
  if (assessment.protocol !== CHANGE_ASSESSMENT_PROTOCOL || assessment.kind !== 'repo-harness-change-assessment') {
    throw new Error('change assessment kind/protocol is invalid');
  }
  if (assessment.status !== 'ready' && assessment.status !== 'blocked') throw new Error('change assessment status is invalid');
  for (const key of ['assessment_sha256', 'review_subject_sha256'] as const) {
    if (typeof assessment[key] !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(assessment[key] as string)) {
      throw new Error(`change assessment ${key} is invalid`);
    }
  }
  if (typeof assessment.target_ref !== 'string' || assessment.target_ref.trim() === '') {
    throw new Error('change assessment target_ref is invalid');
  }
  if (typeof assessment.target_revision !== 'string' || !/^[0-9a-f]{40,64}$/.test(assessment.target_revision)) {
    throw new Error('change assessment target_revision is invalid');
  }
  if (!['lite', 'standard', 'strict'].includes(String(assessment.workflow_profile))) {
    throw new Error('change assessment workflow_profile is invalid');
  }
  if (!Array.isArray(assessment.subject_paths) || !Array.isArray(assessment.selected_paths) || !isStringArray(assessment.subject_paths) || !isStringArray(assessment.selected_paths)) {
    throw new Error('change assessment paths are invalid');
  }
  const paths = subjectPaths(assessment.subject_paths);
  if (!paths || stableJson(paths) !== stableJson(assessment.subject_paths)) throw new Error('change assessment subject paths are not canonical');
  const selected = uniqueSorted(assessment.selected_paths);
  if (stableJson(selected) !== stableJson(assessment.selected_paths) || selected.some((path) => !paths.includes(path))) {
    throw new Error('change assessment selected paths are invalid');
  }
  if (!Array.isArray(assessment.strict_categories) || !isStringArray(assessment.strict_categories)) {
    throw new Error('change assessment strict categories are invalid');
  }
  const categories = [...new Set(assessment.strict_categories as StrictRiskCategory[])].sort(byteCompare);
  if (categories.some((category) => !STRICT_RISK_CATEGORIES.has(category)) || stableJson(categories) !== stableJson(assessment.strict_categories)) {
    throw new Error('change assessment strict categories are not canonical');
  }
  if (!Array.isArray(assessment.required_oracles)) throw new Error('change assessment required oracles are invalid');
  const oracles = normalizedOracles(assessment.required_oracles);
  if (!oracles || stableJson(oracles) !== stableJson(assessment.required_oracles)) {
    throw new Error('change assessment required oracles are not canonical');
  }
  const reasons = parseReasons(assessment.reasons, paths, 'change assessment');
  if (reasons.some((entry) => entry.code === 'reviewer_disagreement')) {
    throw new Error('change assessment may not contain reviewer disagreement');
  }
  if (stableJson(selectedPaths(reasons)) !== stableJson(selected)) {
    throw new Error('change assessment selected paths do not match reasons');
  }
  const basis: Omit<ChangeAssessment, 'assessment_sha256'> = {
    protocol: CHANGE_ASSESSMENT_PROTOCOL,
    kind: 'repo-harness-change-assessment',
    status: assessment.status,
    review_subject_sha256: assessment.review_subject_sha256 as string,
    target_ref: assessment.target_ref,
    target_revision: assessment.target_revision as string,
    subject_paths: paths,
    workflow_profile: assessment.workflow_profile as WorkflowProfile,
    strict_categories: categories,
    selected_paths: selected,
    required_oracles: oracles,
    reasons,
  };
  if (assessmentFingerprint(basis) !== assessment.assessment_sha256) throw new Error('change assessment fingerprint is stale');
  return Object.freeze({ ...basis, assessment_sha256: assessment.assessment_sha256 as string });
}

/**
 * A reviewer disagreement is an append-only escalation. It can add one
 * closed-vocabulary reason and paths from the already-bound subject; it cannot
 * remove selection, alter the target, downgrade status, or replace oracles.
 */
export function applyReviewerDisagreement(
  packet: ReviewSelectionPacket,
  input: ReviewerDisagreementInput,
): ReviewSelectionPacket {
  if (packet.review_subject_sha256 !== input.review_subject_sha256 || packet.target_revision !== input.target_revision) {
    throw new Error('reviewer disagreement does not bind the selection packet subject');
  }
  if (input.summary.trim() === '') throw new Error('reviewer disagreement summary is required');
  const paths = uniqueSorted(input.paths);
  if (paths.length === 0 || paths.some((path) => !packet.subject_paths.includes(path))) {
    throw new Error('reviewer disagreement paths must be non-empty selected subject paths');
  }
  const existing = packet.reasons.find((entry) => entry.code === 'reviewer_disagreement');
  const disagreement = reason(
    'reviewer_disagreement',
    existing ? [...existing.paths, ...paths] : paths,
    [],
    input.summary.trim(),
  );
  const reasons = orderReasons([
    ...packet.reasons.filter((entry) => entry.code !== 'reviewer_disagreement'),
    disagreement,
  ]);
  const { packet_sha256: _packetSha256, ...boundPacket } = packet;
  const basis: Omit<ReviewSelectionPacket, 'packet_sha256'> = {
    ...boundPacket,
    selected_paths: uniqueSorted([...packet.selected_paths, ...paths]),
    reasons,
  };
  return Object.freeze({ ...basis, packet_sha256: packetFingerprint(basis) });
}

export function validateReviewSelectionPacket(value: unknown): ReviewSelectionPacket {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('review selection packet must be an object');
  const packet = value as Record<string, unknown>;
  if (packet.protocol !== REVIEW_SELECTION_PACKET_PROTOCOL || packet.kind !== 'repo-harness-review-selection-packet') {
    throw new Error('review selection packet kind/protocol is invalid');
  }
  if (packet.status !== 'ready' && packet.status !== 'blocked') throw new Error('review selection packet status is invalid');
  for (const key of ['assessment_sha256', 'review_subject_sha256', 'packet_sha256'] as const) {
    if (typeof packet[key] !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(packet[key] as string)) {
      throw new Error(`review selection packet ${key} is invalid`);
    }
  }
  for (const key of ['target_ref', 'target_revision'] as const) {
    if (typeof packet[key] !== 'string' || (packet[key] as string).trim() === '') throw new Error(`review selection packet ${key} is invalid`);
  }
  if (!Array.isArray(packet.subject_paths) || !Array.isArray(packet.selected_paths) || !Array.isArray(packet.reasons) || !Array.isArray(packet.required_oracles)) {
    throw new Error('review selection packet arrays are invalid');
  }
  if (!isStringArray(packet.subject_paths) || !isStringArray(packet.selected_paths)) {
    throw new Error('review selection packet paths must be strings');
  }
  const normalizedSubjectPaths = subjectPaths(packet.subject_paths);
  if (!normalizedSubjectPaths) throw new Error('review selection packet subject paths are invalid');
  const selected = uniqueSorted(packet.selected_paths);
  if (selected.some((path) => !normalizedSubjectPaths.includes(path))) throw new Error('review selection packet selected paths escape subject');
  const oracles = normalizedOracles(packet.required_oracles as DeclaredReviewOracle[]);
  if (!oracles) throw new Error('review selection packet required oracles are invalid');
  const orderedReasons = parseReasons(packet.reasons, normalizedSubjectPaths, 'review selection packet');
  const basis: Omit<ReviewSelectionPacket, 'packet_sha256'> = {
    protocol: REVIEW_SELECTION_PACKET_PROTOCOL,
    kind: 'repo-harness-review-selection-packet',
    status: packet.status as 'ready' | 'blocked',
    assessment_sha256: packet.assessment_sha256 as string,
    review_subject_sha256: packet.review_subject_sha256 as string,
    target_ref: packet.target_ref as string,
    target_revision: packet.target_revision as string,
    subject_paths: normalizedSubjectPaths,
    selected_paths: selected,
    required_oracles: oracles,
    reasons: orderedReasons,
  };
  if (packetFingerprint(basis) !== packet.packet_sha256) throw new Error('review selection packet fingerprint is stale');
  return Object.freeze({ ...basis, packet_sha256: packet.packet_sha256 as string });
}

/**
 * Packets are projections of a freshly recomputed base assessment. The one
 * permitted post-assessment mutation is an append-only reviewer disagreement;
 * all other fields remain byte-for-byte bound to the base projection.
 */
export function validateReviewSelectionPacketAgainstAssessment(value: unknown, assessmentValue: unknown): ReviewSelectionPacket {
  const assessment = validateChangeAssessment(assessmentValue);
  const packet = validateReviewSelectionPacket(value);
  const base = buildReviewSelectionPacket(assessment);
  if (
    packet.status !== base.status
    || packet.assessment_sha256 !== base.assessment_sha256
    || packet.review_subject_sha256 !== base.review_subject_sha256
    || packet.target_ref !== base.target_ref
    || packet.target_revision !== base.target_revision
    || stableJson(packet.subject_paths) !== stableJson(base.subject_paths)
    || stableJson(packet.required_oracles) !== stableJson(base.required_oracles)
  ) {
    throw new Error('review selection packet does not bind the base assessment');
  }
  const baseReasons = base.reasons;
  const disagreement = packet.reasons.find((entry) => entry.code === 'reviewer_disagreement');
  const nonDisagreement = packet.reasons.filter((entry) => entry.code !== 'reviewer_disagreement');
  if (stableJson(nonDisagreement) !== stableJson(baseReasons)) {
    throw new Error('review selection packet alters base assessment reasons');
  }
  if (!disagreement) {
    if (stableJson(packet.selected_paths) !== stableJson(base.selected_paths) || stableJson(packet.reasons) !== stableJson(base.reasons)) {
      throw new Error('review selection packet alters the base assessment');
    }
    return packet;
  }
  if (disagreement.required_oracle_kinds.length !== 0 || disagreement.paths.length === 0 || disagreement.evidence.trim() === '') {
    throw new Error('reviewer disagreement overlay is invalid');
  }
  const expectedSelected = uniqueSorted([...base.selected_paths, ...disagreement.paths]);
  if (stableJson(packet.selected_paths) !== stableJson(expectedSelected)) {
    throw new Error('reviewer disagreement overlay is not monotonic');
  }
  return packet;
}
