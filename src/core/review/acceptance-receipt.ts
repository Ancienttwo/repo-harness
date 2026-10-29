import type { ReviewAdmission, ReviewAuthorityContext } from './authority-context';
import { createHash } from 'crypto';
import { isReviewRuntimeId, type ReviewRuntimeId } from './review-runtimes';

export type AcceptanceDisposition = 'external_pass' | 'user_waiver' | 'reject';

export type AcceptancePolicyV1 = {
  protocol: 1;
  reviewer: 'Claude' | 'Codex';
  user_waiver: 'allowed' | 'forbidden';
};

export type AcceptancePolicyV2 = {
  protocol: 2;
  reviewer: 'Codex';
  source: 'generic-review';
  user_waiver: 'allowed' | 'forbidden';
};

export type AcceptancePolicy = AcceptancePolicyV1 | AcceptancePolicyV2;

export type AcceptanceFinding = {
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  message: string;
};

export type ModelRelation = 'different-family' | 'same-family' | 'unknown';

export type AcceptanceReceipt = {
  protocol: 4;
  kind: 'repo-harness-acceptance-receipt';
  repository_root: string;
  campaign_sha256: string;
  admission_sha256: string;
  grant_sha256: string;
  goal_sha256: string;
  verification_file: string;
  verification_evidence_sha256: string;
  benchmark_evidence_sha256: string;
  subject_sha256: string;
  subject_scope: 'normalized-final-content';
  target_ref: string;
  target_revision: string;
  reviewed_paths: string[];
  disposition: AcceptanceDisposition;
  expected_reviewer: 'Claude' | 'Codex';
  reviewer: 'Claude' | 'Codex' | 'Pi' | 'User';
  source: 'generic-review' | 'user-waiver';
  request_id: string | null;
  context_sha256: string | null;
  result_sha256: string | null;
  actual_harness: ReviewRuntimeId | null;
  actual_role: string | null;
  actual_model: string | null;
  /** Canonical digest of the bound author task binding; null without one. */
  author_session_binding_sha256: string | null;
  /** Sorted unique OAR models of the author's ended turns; null is unknown. */
  author_actual_models: string[] | null;
  /** Record-time verdict of `modelRelation`; null only for `user_waiver`. */
  model_relation: ModelRelation | null;
  actor: string | null;
  summary: string;
  findings: AcceptanceFinding[];
  waiver_grant_sha256: string | null;
  issued_at: string;
};

/** Closed model-family table: the single family authority. A routing provider
 * prefix (`magpie/`, `cursor/`) is a gateway label, so only the last `/`
 * segment is matched. An unmatched model has no family. */
const MODEL_FAMILY_PREFIXES: readonly (readonly [string, string])[] = [
  ['claude-', 'anthropic'], ['opus', 'anthropic'], ['sonnet', 'anthropic'], ['haiku', 'anthropic'],
  ['gpt-', 'openai'], ['o3', 'openai'], ['o4', 'openai'],
  ['deepseek-', 'deepseek'],
  ['gemini-', 'google'],
  ['grok-', 'xai'],
  ['kimi-', 'moonshot'],
  ['qwen', 'alibaba'],
];

export function modelFamily(model: string): string | null {
  const name = model.slice(model.lastIndexOf('/') + 1).toLowerCase();
  return MODEL_FAMILY_PREFIXES.find(([prefix]) => name.startsWith(prefix))?.[1] ?? null;
}

/** One known shared family denies a cross-model claim. Only a complete set of
 * known author families that all differ from a known reviewer family grants it. */
export function modelRelation(authorModels: readonly string[] | null, reviewerModel: string | null): ModelRelation {
  if (!authorModels?.length || reviewerModel === null) return 'unknown';
  const reviewer = modelFamily(reviewerModel);
  if (reviewer === null) return 'unknown';
  const authors = authorModels.map(modelFamily);
  if (authors.includes(reviewer)) return 'same-family';
  return authors.every(family => family !== null) ? 'different-family' : 'unknown';
}

/** Closed review-domain role approved by the product contract, not runtime fleet configuration.
 * This is its single validity definition; fleet owns model/effort for this named role.
 */
export const GENERIC_REVIEW_ROLE = 'deep-reasoner' as const;

export interface AcceptanceReviewResult {
  request_id: string;
  context_sha256: string;
  subject_sha256: string;
  actual_harness: ReviewRuntimeId;
  actual_role: string;
  /** Null when the host did not observe the reviewer model. */
  actual_model: string | null;
  verdict: 'PASS' | 'FAIL';
  summary: string;
  findings: AcceptanceFinding[];
}

export function acceptanceReviewContextDigest(context: { authorityContext: ReviewAuthorityContext }): string {
  return context.authorityContext.context_sha256;
}

export function validateDomainReview(value: unknown): AcceptanceReviewResult {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== ['request_id','context_sha256','subject_sha256','actual_harness','actual_role','actual_model','verdict','summary','findings'].sort().join(',')) fail('generic-review result schema is invalid');
  if (typeof value.request_id !== 'string' || !value.request_id.trim()
    || !/^sha256:[0-9a-f]{64}$/.test(String(value.context_sha256)) || !/^sha256:[0-9a-f]{64}$/.test(String(value.subject_sha256))
    || typeof value.actual_harness !== 'string' || !isReviewRuntimeId(value.actual_harness) || value.actual_role !== GENERIC_REVIEW_ROLE
    || !optionalModel(value.actual_model)
    || !['PASS','FAIL'].includes(String(value.verdict)) || typeof value.summary !== 'string' || !value.summary.trim()) fail('generic-review result identity/verdict is invalid');
  return { ...value, findings: validateFindings(value.findings) } as unknown as AcceptanceReviewResult;
}

function optionalModel(value: unknown): value is string | null {
  return value === null || typeof value === 'string' && value.trim() !== '';
}

export function assertReviewFields(receipt: AcceptanceReceipt): void {
  const fields = ['request_id','context_sha256','result_sha256','actual_harness','actual_role','actual_model',
    'author_session_binding_sha256','author_actual_models','model_relation'] as const;
  if (receipt.disposition === 'user_waiver') {
    if (fields.some(field => receipt[field] !== null)) fail('AcceptanceReceipt user waiver has review binding');
    return;
  }
  if (typeof receipt.request_id !== 'string' || !receipt.request_id.trim()) fail('AcceptanceReceipt generic-review request_id is invalid');
  if (!/^sha256:[0-9a-f]{64}$/.test(String(receipt.context_sha256))) fail('AcceptanceReceipt generic-review context_sha256 is invalid');
  if (!/^sha256:[0-9a-f]{64}$/.test(String(receipt.result_sha256))) fail('AcceptanceReceipt generic-review result_sha256 is invalid');
  if (receipt.actual_harness !== receipt.reviewer.toLowerCase()) fail('AcceptanceReceipt generic-review actual_harness mismatch');
  if (receipt.actual_role !== GENERIC_REVIEW_ROLE) fail('AcceptanceReceipt generic-review actual_role mismatch');
  if (!optionalModel(receipt.actual_model)) fail('AcceptanceReceipt generic-review actual_model is invalid');
  assertModelRelationFields(receipt);
}

function assertModelRelationFields(receipt: AcceptanceReceipt): void {
  const binding = receipt.author_session_binding_sha256, models = receipt.author_actual_models;
  if (binding !== null && !/^sha256:[0-9a-f]{64}$/.test(String(binding))) fail('AcceptanceReceipt author_session_binding_sha256 is invalid');
  if (models !== null && (!Array.isArray(models) || models.length === 0
    || models.some((model, index) => typeof model !== 'string' || !model.trim() || index > 0 && models[index - 1]! >= model))) {
    fail('AcceptanceReceipt author_actual_models must be sorted unique model strings');
  }
  if (models !== null && binding === null) fail('AcceptanceReceipt author_actual_models requires an author session binding');
  if (!['different-family', 'same-family', 'unknown'].includes(String(receipt.model_relation))) fail('AcceptanceReceipt model_relation is invalid');
  if ((models === null || receipt.actual_model === null) && receipt.model_relation !== 'unknown') {
    fail('AcceptanceReceipt model_relation must be unknown without both models');
  }
}

/** Already-authorized upstream waiver action. References and actor strings are
 * trace data; the trusted Bot must obtain the user's separate waiver decision.
 */
export interface UserWaiverAuthorizationSubject {
  repository_root: string;
  repository_id: string;
  issue_id: string;
  campaign_id: string;
  campaign_sha256: string;
  admission_sha256: string;
  grant_sha256: string;
  goal_sha256: string;
  actor: string;
  summary: string;
}
export interface UserWaiverAuthorization extends UserWaiverAuthorizationSubject {
  protocol: 1;
  kind: 'repo-harness-upstream-waiver-authorization';
  action: 'human-approved-user-waiver';
  authorization_ref: string;
  bot_id: string;
  /** Epoch milliseconds; expiry is exclusive. */
  expires_at: number;
}

export function validateUserWaiverAuthorization(
  value: unknown, expected: UserWaiverAuthorizationSubject, now: number,
): Readonly<UserWaiverAuthorization> {
  function invalid(reason: string): never { return fail(`UserWaiverGrant upstream authorization ${reason}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('is required');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid('prototype is invalid');
  const fields = ['protocol', 'kind', 'action', 'authorization_ref', 'bot_id', 'expires_at',
    'repository_root', 'repository_id', 'issue_id', 'campaign_id', 'campaign_sha256', 'admission_sha256',
    'grant_sha256', 'goal_sha256', 'actor', 'summary'];
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== fields.length || fields.some(field => !Object.hasOwn(descriptors, field))) invalid('fields are invalid');
  const detached: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = descriptors[field]!;
    if (!descriptor.enumerable || !('value' in descriptor)) invalid('fields must be plain data');
    detached[field] = descriptor.value;
    if (field !== 'protocol' && field !== 'expires_at'
      && (typeof descriptor.value !== 'string' || !descriptor.value.trim() || descriptor.value.includes('\0'))) invalid(`${field} is invalid`);
  }
  if (detached.protocol !== 1 || detached.kind !== 'repo-harness-upstream-waiver-authorization'
    || detached.action !== 'human-approved-user-waiver') invalid('action is invalid');
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(detached.expires_at)
    || typeof detached.expires_at !== 'number' || detached.expires_at <= now) invalid('is expired');
  if (detached.bot_id === expected.actor) invalid('Bot cannot be the execution actor');
  for (const field of ['campaign_sha256', 'admission_sha256', 'grant_sha256', 'goal_sha256']) {
    if (!/^sha256:[0-9a-f]{64}$/.test(detached[field] as string)) invalid(`${field} is invalid`);
  }
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (detached[field] !== expectedValue) invalid(`${field} is stale`);
  }
  return Object.freeze(detached as unknown as UserWaiverAuthorization);
}

export type UserWaiverGrant = {
  protocol: 3;
  kind: 'repo-harness-user-waiver-grant';
  repository_root: string;
  campaign_sha256: string;
  admission_sha256: string;
  grant_sha256: string;
  goal_sha256: string;
  actor: string;
  scope: 'admission-authority';
  summary: string;
  issued_at: string;
  authorization: Readonly<UserWaiverAuthorization>;
};

/** Structural metadata check. Upstream authorization is validated separately
 * against the freshly observed admission and current time before consumption. */
export function assertUserWaiverGrant(value: unknown): asserts value is UserWaiverGrant {
  if (!isRecord(value) || value.protocol !== 3 || value.kind !== 'repo-harness-user-waiver-grant') fail('UserWaiverGrant kind/protocol is invalid');
  const fields = ['protocol', 'kind', 'repository_root', 'campaign_sha256', 'admission_sha256', 'grant_sha256',
    'goal_sha256', 'actor', 'scope', 'summary', 'issued_at', 'authorization'];
  if (Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))
    || !isRecord(value.authorization)) fail('UserWaiverGrant fields are invalid');
  for (const field of ['repository_root', 'campaign_sha256', 'admission_sha256', 'grant_sha256', 'goal_sha256', 'actor', 'scope', 'summary', 'issued_at']) {
    if (typeof value[field] !== 'string' || !value[field].trim()) fail(`UserWaiverGrant ${field} is required`);
  }
  if (value.scope !== 'admission-authority') fail('UserWaiverGrant scope is invalid');
  for (const field of ['campaign_sha256', 'admission_sha256', 'grant_sha256', 'goal_sha256']) {
    if (!/^sha256:[0-9a-f]{64}$/.test(value[field] as string)) fail(`UserWaiverGrant ${field} is invalid`);
  }
}

export type ReviewSubject = {
  status: 'ok' | 'unknown';
  scope: 'normalized-final-content';
  target_ref: string;
  target_rev: string;
  paths: readonly string[];
  target_overlap_count: number;
  head_rev: string;
  review_subject_sha256: string;
};

export function fail(message: string, code = 1): never {
  const error = new Error(message) as Error & { exitCode?: number };
  error.exitCode = code;
  throw error;
}

export function sha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

type ArchiveProjectionKind = 'plan' | 'contract' | 'review' | 'notes';

type ArchiveProjectionEntry = {
  source: string;
  destination: string;
  kind: ArchiveProjectionKind;
};

type ParsedArchiveProjection = {
  body: string;
  entries: ArchiveProjectionEntry[];
  lifecycle: ArchiveProjectionKind;
  relatedPlan: string;
  manifestSha256: string;
};

function archiveProjectionKind(path: string, archived: boolean): ArchiveProjectionKind | null {
  const patterns: Array<[ArchiveProjectionKind, RegExp]> = archived
    ? [
        ['plan', /^plans\/archive\/plan-[^`\r\n]+\.md$/],
        ['contract', /^tasks\/archive\/contract-[^`\r\n]+\.md$/],
        ['review', /^tasks\/archive\/review-[^`\r\n]+\.md$/],
        ['notes', /^tasks\/archive\/notes-[^`\r\n]+\.md$/],
      ]
    : [
        ['plan', /^plans\/plan-[^`\r\n]+\.md$/],
        ['contract', /^tasks\/contracts\/[^`\r\n]+\.contract\.md$/],
        ['review', /^tasks\/reviews\/[^`\r\n]+\.review\.md$/],
        ['notes', /^tasks\/notes\/[^`\r\n]+\.notes\.md$/],
      ];
  return patterns.find(([, pattern]) => pattern.test(path))?.[0] ?? null;
}

function parseArchiveProjection(content: string): ParsedArchiveProjection | null {
  const projectionMarker = '> **Archive Projection V1**:';
  const archiveEnvelope = /^(?<envelope>> \*\*Archived\*\*: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\r?\n> \*\*Related Plan\*\*: (?<relatedPlan>plans\/archive\/[^\r\n]+)\r?\n> \*\*Outcome\*\*: (?:Completed|Abandoned|Superseded)\r?\n> \*\*Lifecycle\*\*: (?<lifecycle>plan|contract|review|notes)\r?\n> \*\*Parent Run ID\*\*: [^\s\r\n]+\r?\n(?<projection>(?:> \*\*Archive Projection V1\*\*: `[^`\r\n]+` => `[^`\r\n]+`\r?\n)*)\r?\n)/;
  const envelope = archiveEnvelope.exec(content);
  if (!envelope) {
    if (content.includes(projectionMarker)) fail('archive projection envelope is malformed');
    return null;
  }

  const projectionText = envelope.groups?.projection ?? '';
  if (projectionText === '') return null;

  const entries: ArchiveProjectionEntry[] = [];
  const linePattern = /^> \*\*Archive Projection V1\*\*: `([^`\r\n]+)` => `([^`\r\n]+)`\r?$/gm;
  for (const match of projectionText.matchAll(linePattern)) {
    const source = match[1];
    const destination = match[2];
    const sourceKind = archiveProjectionKind(source, false);
    const destinationKind = archiveProjectionKind(destination, true);
    if (sourceKind === null || destinationKind === null || sourceKind !== destinationKind) {
      fail('archive projection entry crosses an unsupported workflow family');
    }
    entries.push({ source, destination, kind: sourceKind });
  }
  if (entries.length === 0 || entries.length !== projectionText.trimEnd().split(/\r?\n/).length) {
    fail('archive projection entries are malformed');
  }
  if (new Set(entries.map((entry) => entry.source)).size !== entries.length
    || new Set(entries.map((entry) => entry.destination)).size !== entries.length) {
    fail('archive projection entries must be one-to-one');
  }
  const planEntry = entries.find((entry) => entry.kind === 'plan');
  if (!planEntry || planEntry.destination !== envelope.groups?.relatedPlan) {
    fail('archive projection related plan is inconsistent');
  }
  const lifecycle = envelope.groups?.lifecycle as ArchiveProjectionKind;
  if (!entries.some((entry) => entry.kind === lifecycle)) {
    fail('archive projection does not contain its lifecycle artifact');
  }

  let normalized = content.slice(envelope[0].length);
  for (const entry of [...entries].sort((left, right) => right.destination.length - left.destination.length)) {
    normalized = normalized.replaceAll(entry.destination, entry.source);
  }
  const canonicalEntries = [...entries].sort((left, right) => left.source.localeCompare(right.source));
  return {
    body: normalized,
    entries,
    lifecycle,
    relatedPlan: envelope.groups?.relatedPlan ?? '',
    manifestSha256: sha256(stableJson({ protocol: 1, entries: canonicalEntries })),
  };
}

function normalizeArchiveProjection(content: string): string {
  const parsed = parseArchiveProjection(content);
  if (parsed) return parsed.body;
  const legacyEnvelope = /^> \*\*Archived\*\*: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\r?\n> \*\*Related Plan\*\*: plans\/archive\/[^\r\n]+\r?\n> \*\*Outcome\*\*: (?:Completed|Abandoned|Superseded)\r?\n> \*\*Lifecycle\*\*: (?:contract|review|notes)\r?\n> \*\*Parent Run ID\*\*: [^\s\r\n]+\r?\n\r?\n/;
  return content.replace(legacyEnvelope, '');
}

export function authorityFingerprint(content: string): string {
  const normalized = normalizeArchiveProjection(content)
    .replace(/^> \*\*Status\*\*:[ \t]*.+$/m, '> **Status**: <lifecycle>')
    .replace(/^> \*\*Last Updated\*\*:[ \t]*.+$/m, '> **Last Updated**: <lifecycle>');
  return sha256(normalized);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function acceptanceContractField(markdown: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^> \\*\\*${escaped}\\*\\*:[ \\t]*(.+?)[ \\t]*$`, 'm'));
  return match?.[1]?.replace(/^`|`$/g, '').trim() ?? '';
}

export function parseAcceptancePolicy(contractText: string): AcceptancePolicy {
  const section = contractText.match(/^## Acceptance Policy[ \t]*\r?\n+```json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/m);
  if (!section) fail('contract Acceptance Policy JSON block is missing');
  let value: unknown;
  try {
    value = JSON.parse(section[1]);
  } catch (error) {
    fail(`contract Acceptance Policy is invalid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(value) || (value.protocol !== 1 && value.protocol !== 2)) fail('acceptance policy protocol must be 1 or 2');
  if (value.user_waiver !== 'allowed' && value.user_waiver !== 'forbidden') {
    fail('acceptance policy user_waiver must be allowed or forbidden');
  }
  const keys = Object.keys(value).sort();
  if (value.protocol === 1) {
    if (value.reviewer !== 'Claude' && value.reviewer !== 'Codex') fail('acceptance policy reviewer must be Claude or Codex');
    if (JSON.stringify(keys) !== JSON.stringify(['protocol', 'reviewer', 'user_waiver'])) {
      fail('acceptance policy protocol 1 contains unknown fields');
    }
    return value as AcceptancePolicyV1;
  }
  if (value.reviewer !== 'Codex') fail('acceptance policy protocol 2 reviewer must be Codex');
  if (value.source !== 'generic-review') {
    fail('acceptance policy protocol 2 source must be generic-review');
  }
  if (JSON.stringify(keys) !== JSON.stringify(['protocol', 'reviewer', 'source', 'user_waiver'])) {
    fail('acceptance policy protocol 2 contains unknown fields');
  }
  return value as AcceptancePolicyV2;
}

export function acceptancePolicySource(): 'generic-review' {
  return 'generic-review';
}

/** The contract owns benchmark applicability. Missing or ambiguous declarations refuse. */
export function acceptanceBenchmarkRequirement(contractContent: string): 'required' | 'not_applicable' {
  const blocks = [...contractContent.matchAll(/^\x60\x60\x60yaml[ \t]*\r?\n([\s\S]*?)\r?\n\x60\x60\x60[ \t]*$/gm)];
  const declarations: unknown[] = [];
  for (const block of blocks) {
    const text = block[1]!;
    // Admit the existing canonical key spelling and reject duplicate data before YAML can overwrite it.
    if (/^\s*["'](?:evidence_requirements|benchmark)["']\s*:|^\s*(?:evidence_requirements|benchmark)\s+:/m.test(text)
      || /^\s*(?:---|\.\.\.)\s*$/m.test(text)) fail('contract evidence requirements use an unsupported key or document form');
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*evidence_requirements:/.test(line) && !/^\s*evidence_requirements:[ \t]*(?:#[^\n]*)?$/.test(line)) fail('contract evidence requirements must use a canonical block mapping');
      if (/^\s*benchmark:/.test(line) && !/^\s*benchmark:[ \t]*(["']?)(required|not_applicable)\1[ \t]*(?:#[^\n]*)?$/.test(line)) fail('contract benchmark requirement must use a canonical scalar');
    }
    const keys = [...text.matchAll(/^\s*(evidence_requirements|benchmark):/gm)].map(match => match[1]);
    if (keys.filter(key => key === 'evidence_requirements').length > 1 || keys.filter(key => key === 'benchmark').length > 1) fail('contract evidence requirements are ambiguous');
    let parsed: unknown;
    try { parsed = Bun.YAML.parse(text); }
    catch (error) { fail('contract evidence requirements are invalid: ' + (error as Error).message); }
    if (isRecord(parsed) && Object.hasOwn(parsed, 'evidence_requirements')) declarations.push(parsed.evidence_requirements);
  }
  if (declarations.length !== 1 || !isRecord(declarations[0])) fail('contract evidence requirements are missing or ambiguous');
  const requirement = declarations[0].benchmark;
  if (requirement !== 'required' && requirement !== 'not_applicable') fail('contract benchmark requirement must be required or not_applicable');
  return requirement;
}

export interface AcceptanceEvidence {
  readonly fingerprint: string;
  readonly benchmark: string;
}


export const ACCEPTANCE_VERIFICATION_OBSERVATION_PROTOCOL = 2 as const;
export const ACCEPTANCE_VERIFICATION_OBSERVATION_KIND = 'repo-harness-acceptance-verification-observation' as const;

/**
 * The acceptance authority's own record-time observation of one verified
 * acceptance. It exists so a reader that needs an acceptance verdict does not
 * re-derive one: everything the asynchronous `verifyAcceptance` proved at
 * record time (live normalized subject and verification evidence fingerprint)
 * is frozen here by the authority that proved it.
 * Readers verify identity and bytes; they never recompute the verdict.
 */
export type AcceptanceVerificationObservationV1 = {
  protocol: typeof ACCEPTANCE_VERIFICATION_OBSERVATION_PROTOCOL;
  kind: typeof ACCEPTANCE_VERIFICATION_OBSERVATION_KIND;
  observation_id: string;
  repository_root: string;
  acceptance_receipt_sha256: string;
  campaign_sha256: string;
  admission_sha256: string;
  grant_sha256: string;
  goal_sha256: string;
  target_ref: string;
  target_revision: string;
  subject_sha256: string;
  verification_evidence_sha256: string;
  disposition: AcceptanceDisposition;
  /** Historical reader field. Current acceptance writers always store null. */
  archive_projection_sha256: string | null;
  verified_at: string;
};

type AcceptanceVerificationObservationBasis = Omit<AcceptanceVerificationObservationV1, 'protocol' | 'kind' | 'observation_id'>;

/**
 * Subject key, not content address: one contract subject has exactly one
 * current observation, so re-recording the same subject overwrites its file
 * and a changed contract lands under a different key.
 */
export function acceptanceVerificationObservationSubjectKey(campaignSha256: string, admissionSha256: string): string {
  return sha256(stableJson({ campaign_sha256: campaignSha256, admission_sha256: admissionSha256 }));
}

function acceptanceVerificationObservationId(basis: AcceptanceVerificationObservationBasis): string {
  return sha256(stableJson([
    ACCEPTANCE_VERIFICATION_OBSERVATION_PROTOCOL,
    ACCEPTANCE_VERIFICATION_OBSERVATION_KIND,
    basis.repository_root,
    basis.acceptance_receipt_sha256,
    basis.campaign_sha256,
    basis.admission_sha256,
    basis.grant_sha256,
    basis.goal_sha256,
    basis.target_ref,
    basis.target_revision,
    basis.subject_sha256,
    basis.verification_evidence_sha256,
    basis.disposition,
    basis.archive_projection_sha256,
    basis.verified_at,
  ]));
}

export function buildAcceptanceVerificationObservation(basis: AcceptanceVerificationObservationBasis): AcceptanceVerificationObservationV1 {
  return {
    protocol: ACCEPTANCE_VERIFICATION_OBSERVATION_PROTOCOL,
    kind: ACCEPTANCE_VERIFICATION_OBSERVATION_KIND,
    observation_id: acceptanceVerificationObservationId(basis),
    ...basis,
  };
}

export function contractCarriesArchiveProjection(content: string): boolean {
  return parseArchiveProjection(content) !== null;
}

export function waiverGrantFingerprint(grant: UserWaiverGrant): string {
  return sha256(stableJson(grant));
}

export function validateFindings(value: unknown): AcceptanceFinding[] {
  if (!Array.isArray(value)) fail('findings must be an array');
  return value.map((entry, index) => {
    if (!isRecord(entry)) fail(`finding ${index} must be an object`);
    if (!['P0', 'P1', 'P2', 'P3'].includes(String(entry.severity))) fail(`finding ${index} severity is invalid`);
    if (typeof entry.message !== 'string' || entry.message.trim() === '') fail(`finding ${index} message is required`);
    return { severity: entry.severity, message: entry.message } as AcceptanceFinding;
  });
}

export function validateDisposition(
  policy: AcceptancePolicy,
  owner: string,
  disposition: AcceptanceDisposition,
  reviewer: string,
  source: string,
  actor: string | null,
  findings: AcceptanceFinding[],
): void {
  if (disposition === 'external_pass') {
    // The frozen preferred reviewer stays in expected_reviewer. The actual
    // independent harness may differ under explicit selection/preflight fallback.
    // Its identity is joined to the owner-held domain Result, never an alias.
    const expectedSource = acceptancePolicySource();
    if (!['Claude', 'Codex', 'Pi'].includes(reviewer) || source !== expectedSource || actor !== null) {
      fail('external_pass reviewer/source must match the approved reviewer policy');
    }
    if (findings.some((finding) => finding.severity === 'P0' || finding.severity === 'P1')) {
      fail('external_pass cannot carry P0 or P1 findings');
    }
    return;
  }
  if (disposition === 'user_waiver') {
    if (policy.user_waiver !== 'allowed') fail('admission forbids user waiver');
    if (reviewer !== 'User' || source !== 'user-waiver' || actor !== owner) {
      fail('user_waiver actor must equal the approved actor');
    }
    return;
  }
  if (!['Claude', 'Codex', 'Pi'].includes(reviewer) || source !== acceptancePolicySource()) {
    fail('reject reviewer/source must match the approved reviewer policy');
  }
  if (findings.length === 0) fail('reject requires at least one finding');
}

/**
 * Stable identifiers for every rule the shared synchronous validator applies.
 * They exist so a second reader can enumerate the rule set and declare, per
 * rule, how it is covered on its own path.
 */
export type AcceptanceValidatorRuleId =
  | 'receipt_protocol_kind'
  | 'repository_root'
  | 'campaign_identity'
  | 'admission_binding'
  | 'reviewer_policy'
  | 'grant_digest_shape'
  | 'goal_fingerprint'
  | 'verification_file_shape'
  | 'verification_evidence_shape'
  | 'benchmark_evidence_present'
  | 'subject_sha256_shape'
  | 'subject_scope'
  | 'target_ref_present'
  | 'target_revision_shape'
  | 'reviewed_paths_shape'
  | 'summary_present'
  | 'issued_at_shape'
  | 'disposition_not_reject'
  | 'waiver_grant_present'
  | 'waiver_policy_allowed'
  | 'waiver_grant_repository'
  | 'waiver_grant_admission'
  | 'waiver_grant_goal'
  | 'waiver_grant_owner'
  | 'waiver_grant_fingerprint'
  | 'waiver_binding_symmetry'
  | 'disposition_policy'
  | 'validator_threw';

export const ACCEPTANCE_VALIDATOR_RULE_IDS: readonly AcceptanceValidatorRuleId[] = [
  'receipt_protocol_kind', 'repository_root', 'campaign_identity', 'admission_binding',
  'reviewer_policy', 'grant_digest_shape', 'goal_fingerprint', 'verification_file_shape',
  'verification_evidence_shape', 'benchmark_evidence_present', 'subject_sha256_shape',
  'subject_scope', 'target_ref_present', 'target_revision_shape', 'reviewed_paths_shape',
  'summary_present', 'issued_at_shape', 'disposition_not_reject', 'waiver_grant_present',
  'waiver_policy_allowed', 'waiver_grant_repository', 'waiver_grant_admission',
  'waiver_grant_goal', 'waiver_grant_owner', 'waiver_grant_fingerprint',
  'waiver_binding_symmetry', 'disposition_policy', 'validator_threw',
];

export type AcceptanceReceiptPolicyVerdict =
  | { ok: true }
  | { ok: false; rule: AcceptanceValidatorRuleId; reason: string };

export type AcceptanceReceiptPolicyInput = {
  receipt: AcceptanceReceipt;
  repositoryRoot: string;
  admission: ReviewAdmission;
  grantSha256: string;
  waiverGrant: UserWaiverGrant | null;
};

/**
 * Every AcceptanceReceipt key the shared synchronous validator below consumes.
 * A test asserts against this list so a key added to the receipt without a
 * rule, or a rule silently dropped, fails rather than quietly widening what
 * this gate counts as accepted.
 */
export const CONSUMED_RECEIPT_KEYS: readonly (keyof AcceptanceReceipt)[] = [
  'protocol', 'kind', 'repository_root', 'campaign_sha256', 'admission_sha256',
  'grant_sha256', 'goal_sha256', 'verification_file', 'verification_evidence_sha256',
  'benchmark_evidence_sha256', 'subject_sha256', 'subject_scope', 'target_ref',
  'target_revision', 'reviewed_paths', 'disposition', 'expected_reviewer',
  'reviewer', 'source', 'actor', 'summary', 'findings', 'waiver_grant_sha256',
  'issued_at', 'request_id', 'context_sha256', 'result_sha256', 'actual_harness', 'actual_role', 'actual_model',
  'author_session_binding_sha256', 'author_actual_models', 'model_relation',
];

/** Human-readable projection only; archived source text grants no receipt validity. */
export function renderAcceptanceProjection(receipt: Pick<AcceptanceReceipt,
  'disposition' | 'reviewer' | 'actor' | 'subject_sha256' | 'subject_scope' | 'target_revision'
  | 'verification_evidence_sha256' | 'issued_at' | 'summary' | 'findings' | 'model_relation'> & { source: string }): string {
  return [
    '## Acceptance Receipt Projection',
    '',
    `> **Disposition**: ${receipt.disposition}`,
    `> **Reviewer**: ${receipt.reviewer}`,
    `> **Source**: ${receipt.source}`,
    `> **Actor**: ${receipt.actor ?? 'not-applicable'}`,
    `> **Reviewed Subject SHA256**: ${receipt.subject_sha256}`,
    `> **Reviewed Subject Scope**: ${receipt.subject_scope}`,
    `> **Reviewed Target Revision**: ${receipt.target_revision}`,
    `> **Verification Evidence SHA256**: ${receipt.verification_evidence_sha256}`,
    `> **Model Relation**: ${receipt.model_relation ?? 'not-applicable'}`,
    `> **Issued At**: ${receipt.issued_at}`,
    '',
    `- Summary: ${receipt.summary}`,
    `- Findings: ${receipt.findings.length === 0 ? 'none' : receipt.findings.map((item) => `${item.severity}: ${item.message}`).join('; ')}`,
  ].join('\n');
}
