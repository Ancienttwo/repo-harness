import { globMatch } from '../state/artifact-parsers';
import { createHash } from 'node:crypto';
import { canonicalize } from '../evidence/canonical-json';
import type { JsonValue } from '../evidence/types';
import { normalizeDeclaredReviewOracles, type DeclaredReviewOracle } from './change-assessment';
import { validateVerificationPlan, hashVerificationPlan, type VerificationPlan } from '../evidence/verification-plan';

/** An explicit input snapshot, not an authorization grant. Effects must verify
 * grant_sha256 against protected authority before constructing or consuming it.
 * Neither issue text, a PR author nor a matching digest grants permission.
 */
export interface ReviewAuthorityInput {
  repository_id: string;
  issue_id: string;
  campaign_id: string;
  goal: { revision: string; content: string };
  authorization: { actor_id: string; grant_sha256: string };
  policy: { reviewer: 'Claude' | 'Codex'; user_waiver: 'allowed' | 'forbidden'; policy_sha256: string };
  allowed_paths: string[];
  benchmark: 'required' | 'not_required';
  verification: { plan_sha256: string; source_sha256: string; evidence_sha256: string; tree_sha256: string };
  subject: {
    status: 'ok'; scope: 'normalized-final-content'; target_ref: string;
    target_rev: string; head_rev: string; review_subject_sha256: string;
  };
}
type Frozen<T> = T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T;
export type ReviewAuthorityContext = Frozen<ReviewAuthorityInput & {
  protocol: 1;
  kind: 'repo-harness-review-authority-context';
  campaign_sha256: string;
  context_sha256: string;
}>;

const HASH = /^sha256:[0-9a-f]{64}$/;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
function fail(message: string): never { throw new Error(`review_context_invalid: ${message}`); }
function record(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(label);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) fail(label);
}
function hash(value: unknown, label: string): void { if (typeof value !== 'string' || !HASH.test(value)) fail(label); }
function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalize(value as JsonValue)).digest('hex')}`;
}
function freeze<T>(value: T): Frozen<T> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as Frozen<T>;
}

/** Stable across rounds and goal/subject revisions. Budget and prior findings
 * belong to this campaign, not to a head SHA or a mutable input file path. */
export function reviewCampaignKey(input: Pick<ReviewAuthorityInput, 'repository_id' | 'issue_id' | 'campaign_id'>): string {
  for (const key of ['repository_id', 'issue_id', 'campaign_id'] as const) text(input[key], key);
  return digest({ purpose: 'review-campaign', repository_id: input.repository_id, issue_id: input.issue_id, campaign_id: input.campaign_id });
}

type ReviewScope = Pick<ReviewAuthorityInput, 'repository_id' | 'issue_id' | 'campaign_id' | 'goal' | 'policy' | 'allowed_paths' | 'benchmark'>;

function validateScope(input: ReviewScope): void {
  reviewCampaignKey(input);
  const goal = record(input.goal, ['revision', 'content'], 'goal');
  text(goal.revision, 'goal revision'); text(goal.content, 'goal content');
  const policy = record(input.policy, ['reviewer', 'user_waiver', 'policy_sha256'], 'policy');
  if ((policy.reviewer !== 'Claude' && policy.reviewer !== 'Codex')
    || (policy.user_waiver !== 'allowed' && policy.user_waiver !== 'forbidden')) fail('policy values');
  hash(policy.policy_sha256, 'policy digest');
  if (!Array.isArray(input.allowed_paths) || !input.allowed_paths.length) fail('allowed paths');
  for (const path of input.allowed_paths) {
    text(path, 'allowed path');
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.includes('\\')
      || (path.endsWith('/') ? path.slice(0, -1) : path).split('/').some(part => part === '..' || part === '.' || part === '')) fail('unsafe allowed path');
  }
  if (new Set(input.allowed_paths).size !== input.allowed_paths.length) fail('duplicate allowed path');
  if (input.benchmark !== 'required' && input.benchmark !== 'not_required') fail('benchmark requirement');
}

export function createReviewAuthorityContext(input: ReviewAuthorityInput): ReviewAuthorityContext {
  const root = record(input, ['repository_id', 'issue_id', 'campaign_id', 'goal', 'authorization', 'policy', 'allowed_paths', 'benchmark', 'verification', 'subject'], 'input fields');
  const campaign = reviewCampaignKey(input);
  validateScope(input);
  const authorization = record(root.authorization, ['actor_id', 'grant_sha256'], 'authorization');
  text(authorization.actor_id, 'actor'); hash(authorization.grant_sha256, 'admission grant');
  const verification = record(root.verification, ['plan_sha256', 'source_sha256', 'evidence_sha256', 'tree_sha256'], 'verification');
  for (const key of ['plan_sha256', 'source_sha256', 'evidence_sha256', 'tree_sha256']) hash(verification[key], key);
  const subject = record(root.subject, ['status', 'scope', 'target_ref', 'target_rev', 'head_rev', 'review_subject_sha256'], 'subject');
  if (subject.status !== 'ok' || subject.scope !== 'normalized-final-content') fail('subject unavailable');
  text(subject.target_ref, 'target ref');
  for (const key of ['target_rev', 'head_rev']) if (typeof subject[key] !== 'string' || !OID.test(subject[key])) fail(key);
  hash(subject.review_subject_sha256, 'subject content');
  // Copy only named validated values. Do not invoke input serialization hooks.
  // Allowed-path order is not policy; canonicalize it before binding the snapshot.
  const snapshot: ReviewAuthorityInput = {
    repository_id: input.repository_id, issue_id: input.issue_id, campaign_id: input.campaign_id,
    goal: { revision: input.goal.revision, content: input.goal.content },
    authorization: { actor_id: input.authorization.actor_id, grant_sha256: input.authorization.grant_sha256 },
    policy: { reviewer: input.policy.reviewer, user_waiver: input.policy.user_waiver, policy_sha256: input.policy.policy_sha256 },
    allowed_paths: [...input.allowed_paths].sort(), benchmark: input.benchmark,
    verification: {
      plan_sha256: input.verification.plan_sha256, source_sha256: input.verification.source_sha256,
      evidence_sha256: input.verification.evidence_sha256, tree_sha256: input.verification.tree_sha256,
    },
    subject: {
      status: input.subject.status, scope: input.subject.scope, target_ref: input.subject.target_ref,
      target_rev: input.subject.target_rev, head_rev: input.subject.head_rev,
      review_subject_sha256: input.subject.review_subject_sha256,
    },
  };
  const basis = { protocol: 1 as const, kind: 'repo-harness-review-authority-context' as const, ...snapshot, campaign_sha256: campaign };
  // HEAD records commit provenance. Final content, the target and all approved
  // inputs own acceptance identity, including content not yet committed.
  const { head_rev: _headProvenance, ...semanticSubject } = basis.subject;
  return freeze({ ...basis, context_sha256: digest({ ...basis, subject: semanticSubject }) });
}

/** Compare with freshly observed AND authorized inputs, not a self-reported
 * context. A stored digest alone is insufficient to accept a result. */
export function assertReviewAuthorityContext(value: unknown, current: ReviewAuthorityInput): asserts value is ReviewAuthorityContext {
  const expected = createReviewAuthorityContext(current);
  if (!value || typeof value !== 'object' || canonicalize(value as JsonValue) !== canonicalize(expected as unknown as JsonValue)) {
    throw new Error('review_context_changed');
  }
}


/** Approved policy carrier for one campaign. No execution state or receipt is
 * stored here. Its digest is an approval subject, not proof that approval occurred.
 */
export interface ReviewAdmissionInput extends ReviewScope {
  actor_id: string;
  verification_plan: VerificationPlan;
  oracles: readonly DeclaredReviewOracle[];
}
export type ReviewAdmission = Frozen<ReviewAdmissionInput & {
  protocol: 1;
  kind: 'repo-harness-review-admission';
  campaign_sha256: string;
  admission_sha256: string;
}>;

export function createReviewAdmission(input: ReviewAdmissionInput): ReviewAdmission {
  record(input, ['repository_id', 'issue_id', 'campaign_id', 'goal', 'policy', 'allowed_paths', 'benchmark', 'actor_id', 'verification_plan', 'oracles'], 'admission fields');
  validateScope(input); text(input.actor_id, 'actor');
  const plan = validateVerificationPlan(input.verification_plan);
  if (!plan.checks.length) fail('empty verification plan');
  if (!Array.isArray(input.oracles)) fail('oracle declarations');
  for (const oracle of input.oracles) record(oracle, ['id', 'kind', 'paths'], 'oracle declarations');
  const oracles = normalizeDeclaredReviewOracles(input.oracles);
  if (oracles === null) fail('oracle declarations');
  // The plan validator owns syntax. Reparse its canonical JSON to detach nested
  // arrays without invoking input-defined serialization methods.
  const detachedPlan: VerificationPlan = JSON.parse(canonicalize(plan as unknown as JsonValue));
  const basis = {
    protocol: 1 as const, kind: 'repo-harness-review-admission' as const,
    repository_id: input.repository_id, issue_id: input.issue_id, campaign_id: input.campaign_id,
    goal: { revision: input.goal.revision, content: input.goal.content },
    policy: { reviewer: input.policy.reviewer, user_waiver: input.policy.user_waiver, policy_sha256: input.policy.policy_sha256 },
    allowed_paths: [...input.allowed_paths].sort(), benchmark: input.benchmark,
    actor_id: input.actor_id, verification_plan: detachedPlan, oracles, campaign_sha256: reviewCampaignKey(input),
  };
  return freeze({ ...basis, admission_sha256: digest(basis) });
}

/** Validate stored metadata and return the detached canonical frozen value. */
export function validateReviewAdmission(admission: ReviewAdmission): ReviewAdmission {
  const { protocol, kind, campaign_sha256, admission_sha256, ...input } = admission;
  const rebuilt = createReviewAdmission(input as ReviewAdmissionInput);
  if (protocol !== 1 || kind !== rebuilt.kind || campaign_sha256 !== rebuilt.campaign_sha256
    || admission_sha256 !== rebuilt.admission_sha256) fail('admission digest');
  return rebuilt;
}

/** Effects first authenticate a current protected admission and then call this
 * binding check. It does not read a self-reported grant from the candidate. */
export function bindReviewAdmission(admission: ReviewAdmission, round: Pick<ReviewAuthorityInput, 'subject' | 'verification'>, verifiedGrantSha256: string): ReviewAuthorityContext {
  hash(verifiedGrantSha256, 'protected grant');
  const rebuilt = validateReviewAdmission(admission);
  if (round.verification.plan_sha256 !== hashVerificationPlan(rebuilt.verification_plan)) fail('verification plan changed');
  return createReviewAuthorityContext({
    repository_id: rebuilt.repository_id, issue_id: rebuilt.issue_id, campaign_id: rebuilt.campaign_id,
    goal: { ...rebuilt.goal }, policy: { ...rebuilt.policy }, allowed_paths: [...rebuilt.allowed_paths], benchmark: rebuilt.benchmark,
    authorization: { actor_id: rebuilt.actor_id, grant_sha256: verifiedGrantSha256 },
    subject: round.subject, verification: round.verification,
  });
}

/** Preserve existing explicit scope semantics, without implicit contract-file access. */
export function reviewAdmissionAllowsPath(allowedPaths: readonly string[], path: string): boolean {
  if (!path || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.includes('\\') || path.includes('\0')
    || path.split('/').some(part => part === '.' || part === '..' || part === '')) return false;
  return allowedPaths.some(pattern => pattern.endsWith('/') ? path.startsWith(pattern) : globMatch(path, pattern));
}
