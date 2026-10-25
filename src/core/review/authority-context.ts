import { createHash } from 'node:crypto';
import { canonicalize } from '../evidence/canonical-json';
import type { JsonValue } from '../evidence/types';

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
    || Object.keys(value).sort().join(',') !== [...fields].sort().join(',')) fail(label);
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

export function createReviewAuthorityContext(input: ReviewAuthorityInput): ReviewAuthorityContext {
  const root = record(input, ['repository_id', 'issue_id', 'campaign_id', 'goal', 'authorization', 'policy', 'allowed_paths', 'benchmark', 'verification', 'subject'], 'input fields');
  const campaign = reviewCampaignKey(input);
  const goal = record(root.goal, ['revision', 'content'], 'goal');
  text(goal.revision, 'goal revision'); text(goal.content, 'goal content');
  const authorization = record(root.authorization, ['actor_id', 'grant_sha256'], 'authorization');
  text(authorization.actor_id, 'actor'); hash(authorization.grant_sha256, 'admission grant');
  const policy = record(root.policy, ['reviewer', 'user_waiver', 'policy_sha256'], 'policy');
  if (!['Claude', 'Codex'].includes(String(policy.reviewer)) || !['allowed', 'forbidden'].includes(String(policy.user_waiver))) fail('policy values');
  hash(policy.policy_sha256, 'policy digest');
  if (!Array.isArray(root.allowed_paths) || !root.allowed_paths.length) fail('allowed paths');
  for (const path of root.allowed_paths) {
    text(path, 'allowed path');
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.includes('\\')
      || path.split('/').some(part => part === '..' || part === '.' || part === '')) fail('unsafe allowed path');
  }
  if (new Set(root.allowed_paths).size !== root.allowed_paths.length) fail('duplicate allowed path');
  if (root.benchmark !== 'required' && root.benchmark !== 'not_required') fail('benchmark requirement');
  const verification = record(root.verification, ['plan_sha256', 'source_sha256', 'evidence_sha256', 'tree_sha256'], 'verification');
  for (const [key, value] of Object.entries(verification)) hash(value, key);
  const subject = record(root.subject, ['status', 'scope', 'target_ref', 'target_rev', 'head_rev', 'review_subject_sha256'], 'subject');
  if (subject.status !== 'ok' || subject.scope !== 'normalized-final-content') fail('subject unavailable');
  text(subject.target_ref, 'target ref');
  for (const key of ['target_rev', 'head_rev']) if (typeof subject[key] !== 'string' || !OID.test(subject[key])) fail(key);
  hash(subject.review_subject_sha256, 'subject content');
  // JSON cloning after validation prevents mutable aliases. Allowed-path order is
  // not policy; canonicalize it before binding the snapshot.
  const snapshot: ReviewAuthorityInput = JSON.parse(JSON.stringify(input));
  snapshot.allowed_paths.sort();
  const basis = { protocol: 1 as const, kind: 'repo-harness-review-authority-context' as const, ...snapshot, campaign_sha256: campaign };
  return freeze({ ...basis, context_sha256: digest(basis) });
}

/** Compare with freshly observed AND authorized inputs, not a self-reported
 * context. A stored digest alone is insufficient to accept a result. */
export function assertReviewAuthorityContext(value: unknown, current: ReviewAuthorityInput): asserts value is ReviewAuthorityContext {
  const expected = createReviewAuthorityContext(current);
  if (!value || typeof value !== 'object' || canonicalize(value as JsonValue) !== canonicalize(expected as unknown as JsonValue)) {
    throw new Error('review_context_changed');
  }
}
