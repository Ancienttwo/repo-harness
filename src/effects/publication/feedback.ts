/** Manual GitHub feedback observation and durable intake. */
import { spawnSync } from 'child_process';

import {
  buildFeedbackDeliveryReceipt,
  buildFeedbackEvent,
  buildRepairDispatchProof,
  buildReactionAttemptReceipt,
  deriveCompletionId,
  deriveFeedbackRevision,
  deriveReactionToken,
  projectRepairOffer,
  transitionFeedbackDeliveryReceipt,
  type FeedbackDeliveryTransitionInput,
  type FeedbackCheckConclusion,
  type FeedbackEventV1,
  type FeedbackFailingCheckV1,
  type FeedbackMergeability,
  type ReactionAttemptReceiptV1,
  type RepairDispatchProofV1,
  type RepairOfferV1,
  type RepairOfferProjection,
  validateRepairOffer,
} from '../../core/publication/feedback';
import {
  lookupCanonicalTask,
  type LeaseOwnerRecord,
} from '../../core/state/coordination-identity';
import { readCanonicalSprint, resolveRepoIdentity } from '../state/coordination-canonical-source';
import { readLease, withTaskLock } from '../state/coordination-lease-store';
import {
  FeedbackStoreError,
  appendReactionAttemptReceipt,
  readFeedbackDeliveryReceipt,
  readFeedbackDeliveryReceipts,
  readFeedbackEvent,
  readFeedbackEvents,
  readRepairDispatchProof,
  readRepairDispatchProofs,
  readReactionAttemptReceipts,
  transitionRepairDispatchProof,
  writeFeedbackDeliveryReceipt,
  writeFeedbackEvent,
  writeRepairDispatchProof,
} from './feedback-store';
import {
  reopenPublication,
  takeoverPublication,
  verifyPublicationShipJournalComplete,
} from './publication-lifecycle';
import { PublicationLifecycleError } from '../../core/publication/publication-lifecycle';
import {
  PublicationReceiptError,
  readPublicationReceiptCache,
} from './publication-receipt';
import {
  canonicalPublicationReceiptBytes,
  publicationReceiptDigest,
  type PublicationReceiptV1,
} from '../../core/publication/publication-receipt';

export type FeedbackErrorCode =
  | 'feedback_provider_failed'
  | 'feedback_provider_incomplete'
  | 'feedback_provider_shape_invalid'
  | 'feedback_event_id_missing'
  | 'feedback_incomplete'
  | 'feedback_unreadable'
  | 'provider_event_conflict'
  | 'reaction_receipt_conflict'
  | 'publication_not_found'
  | 'publication_claim_mismatch'
  | 'head_moved'
  | 'feedback_revision_mismatch'
  | 'repair_offer_stale'
  | 'repair_dispatch_conflict'
  | 'repair_not_dispatched'
  | 'repair_completion_unverified'
  | 'repair_completion_not_distinct'
  | 'no_progress';

export class FeedbackError extends Error {
  constructor(readonly code: FeedbackErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'FeedbackError';
  }
}

export interface GhRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr?: string;
  readonly error?: Error;
}

export interface FeedbackObservationInput {
  readonly repo_root: string;
  readonly gh_bin?: string;
  /** Test seam. Production invokes the configured gh binary. */
  readonly gh_runner?: (args: readonly string[]) => GhRunResult;
}

export interface FeedbackIntakeInput extends FeedbackObservationInput {
  readonly publication_id: string;
  readonly git_bin?: string;
}

export interface FeedbackIntakeResult {
  readonly publication_id: string;
  readonly event_count: number;
  readonly events: readonly FeedbackEventV1[];
}

export type PendingFeedbackOffer =
  | { readonly state: 'none'; readonly publication_id: string }
  | RepairOfferProjection;

interface ProviderIdentity {
  readonly provider_repo_id: string;
  readonly pr_number: number;
  readonly provider_url: string;
  readonly state: 'OPEN' | 'CLOSED' | 'MERGED';
  readonly is_draft: boolean;
  readonly head_sha: string;
  readonly head_ref: string;
  readonly base_sha: string;
  readonly base_ref: string;
  readonly mergeability: FeedbackMergeability;
}

interface CurrentPublicationSnapshot {
  readonly receipt: PublicationReceiptV1;
  readonly lease_raw: string;
  readonly record: LeaseOwnerRecord;
}

class TornReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TornReadError';
  }
}

const CHECK_SUITE_QUERY = [
  'query($repoId:ID!,$number:Int!,$after:String){',
  'node(id:$repoId){... on Repository{pullRequest(number:$number){commits(last:1){nodes{commit{oid checkSuites(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{id}}}}}}}}}',
].join('');

const CHECK_RUN_QUERY = [
  'query($suiteId:ID!,$after:String){',
  'node(id:$suiteId){... on CheckSuite{checkRuns(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{id status conclusion completedAt}}}}}',
].join('');

const REVIEW_THREAD_QUERY = [
  'query($repoId:ID!,$number:Int!,$after:String){',
  'node(id:$repoId){... on Repository{pullRequest(number:$number){reviewThreads(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{id isResolved updatedAt}}}}}}',
].join('');

const REVIEW_QUERY = [
  'query($repoId:ID!,$number:Int!,$after:String){',
  'node(id:$repoId){... on Repository{pullRequest(number:$number){reviews(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{id state submittedAt}}}}}}',
].join('');

const SHOW_CHECK_RUN_QUERY = [
  'query($id:ID!){',
  'node(id:$id){... on CheckRun{id name detailsUrl status conclusion output{title summary text}}}',
  '}',
].join('');

const SHOW_REVIEW_THREAD_QUERY = [
  'query($id:ID!,$after:String){',
  'node(id:$id){... on PullRequestReviewThread{id isResolved comments(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{id body url}}}}',
  '}',
].join('');

const SHOW_REVIEW_QUERY = [
  'query($id:ID!){',
  'node(id:$id){... on PullRequestReview{id state body url submittedAt}}',
  '}',
].join('');

/** A provider connection must converge within a bounded, non-cyclic read. */
const MAX_PROVIDER_PAGES = 100;
const CHECK_RUN_STATUSES = new Set(['QUEUED', 'IN_PROGRESS', 'COMPLETED', 'WAITING', 'PENDING', 'REQUESTED']);
const CHECK_RUN_CONCLUSIONS = new Set([
  'ACTION_REQUIRED', 'CANCELLED', 'FAILURE', 'NEUTRAL', 'SKIPPED',
  'STALE', 'STARTUP_FAILURE', 'SUCCESS', 'TIMED_OUT',
]);

function providerFailure(message: string, cause?: unknown): FeedbackError {
  return new FeedbackError('feedback_provider_failed', message, cause);
}

function providerIncomplete(message: string, cause?: unknown): FeedbackError {
  return new FeedbackError('feedback_provider_incomplete', message, cause);
}

function providerShape(message: string, cause?: unknown): FeedbackError {
  return new FeedbackError('feedback_provider_shape_invalid', message, cause);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw providerShape(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, id = false): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FeedbackError(id ? 'feedback_event_id_missing' : 'feedback_provider_shape_invalid', `${label} is required`);
  }
  return value;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw providerShape(`${label} must be a boolean`);
  return value;
}

function ghJson(input: FeedbackObservationInput, args: readonly string[]): unknown {
  const result = input.gh_runner?.(args) ?? spawnSync(input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh', [...args], {
    cwd: input.repo_root,
    encoding: 'utf-8',
  });
  if (result.error || result.status !== 0) {
    throw providerFailure(
      `provider observation failed: gh ${args.join(' ')}: ${(result.stderr || result.error?.message || `exit ${result.status}`).trim()}`,
      result.error,
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw providerIncomplete(`provider returned invalid JSON: gh ${args.join(' ')}`, error);
  }
}

function identityBytes(identity: ProviderIdentity): string {
  return JSON.stringify(identity);
}

function observeIdentity(receipt: PublicationReceiptV1, input: FeedbackObservationInput): ProviderIdentity {
  const repo = asObject(ghJson(input, ['repo', 'view', '--json', 'id']), 'provider repository');
  const pr = asObject(ghJson(input, [
    'pr', 'view', String(receipt.pr_number), '--json',
    'number,url,state,isDraft,headRefOid,headRefName,baseRefOid,baseRefName,mergeStateStatus',
  ]), 'provider PR');
  if (pr.number !== receipt.pr_number) throw providerShape('provider PR number does not match the publication receipt');
  const state = requiredString(pr.state, 'provider PR state');
  if (state !== 'OPEN' && state !== 'CLOSED' && state !== 'MERGED') throw providerShape('provider PR state is unknown');
  const identity: ProviderIdentity = Object.freeze({
    provider_repo_id: requiredString(repo.id, 'provider repository id'),
    pr_number: receipt.pr_number,
    provider_url: requiredString(pr.url, 'provider PR URL'),
    state,
    is_draft: requiredBoolean(pr.isDraft, 'provider PR isDraft'),
    head_sha: requiredString(pr.headRefOid, 'provider PR head OID'),
    head_ref: requiredString(pr.headRefName, 'provider PR head ref'),
    base_sha: requiredString(pr.baseRefOid, 'provider PR base OID'),
    base_ref: requiredString(pr.baseRefName, 'provider PR base ref'),
    mergeability: requiredMergeability(pr.mergeStateStatus),
  });
  if (identity.provider_repo_id !== receipt.provider_repo_id
    || identity.provider_url !== receipt.pr_url
    || identity.head_ref !== receipt.branch
    || identity.base_ref !== receipt.target_ref) {
    throw new FeedbackError('publication_claim_mismatch', 'provider identity does not match the publication receipt');
  }
  return identity;
}

function requiredMergeability(value: unknown): FeedbackMergeability {
  if (value !== 'MERGEABLE' && value !== 'CONFLICTING') {
    throw providerShape('provider PR mergeStateStatus is unknown or unavailable');
  }
  return value;
}

function assertStableIdentity(identity: ProviderIdentity, receipt: PublicationReceiptV1): void {
  if (identity.head_sha !== receipt.head_sha) {
    throw new FeedbackError('head_moved', 'provider PR head does not match the publication receipt');
  }
  if (identity.base_sha !== receipt.base_sha) {
    throw new FeedbackError('publication_claim_mismatch', 'provider PR base does not match the publication receipt');
  }
  if (identity.state !== 'OPEN' || identity.is_draft) {
    throw providerShape('provider PR is not an open non-draft publication');
  }
}

function graphValue(
  input: FeedbackObservationInput,
  query: string,
  scalars: readonly [string, string][],
  after: string | null,
): Record<string, unknown> {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [name, value] of scalars) args.push('-F', `${name}=${value}`);
  if (after !== null) args.push('-F', `after=${after}`);
  const graph = asObject(ghJson(input, args), 'provider GraphQL result');
  if (Object.hasOwn(graph, 'errors')) {
    if (!Array.isArray(graph.errors)) throw providerShape('provider GraphQL errors must be an array');
    if (graph.errors.length > 0) throw providerIncomplete('provider GraphQL response contains errors');
  }
  return graph;
}

function page(value: unknown, label: string): { readonly has_next_page: boolean; readonly end_cursor: string | null; readonly nodes: readonly unknown[] } {
  const connection = asObject(value, label);
  const info = asObject(connection.pageInfo, `${label}.pageInfo`);
  const hasNextPage = requiredBoolean(info.hasNextPage, `${label}.pageInfo.hasNextPage`);
  const endCursor = info.endCursor;
  if (endCursor !== null && (typeof endCursor !== 'string' || endCursor.length === 0)) {
    throw providerShape(`${label}.pageInfo.endCursor is invalid`);
  }
  if (hasNextPage && endCursor === null) throw providerIncomplete(`${label} pagination is incomplete`);
  if (!Array.isArray(connection.nodes)) throw providerShape(`${label}.nodes must be an array`);
  return Object.freeze({ has_next_page: hasNextPage, end_cursor: endCursor as string | null, nodes: connection.nodes });
}

function nextPageCursor(
  value: ReturnType<typeof page>,
  label: string,
  seenCursors: Set<string>,
): string | null {
  if (!value.has_next_page) return null;
  const cursor = value.end_cursor;
  if (cursor === null) throw providerIncomplete(`${label} pagination is incomplete`);
  if (seenCursors.has(cursor)) throw providerIncomplete(`${label} pagination cursor repeated`);
  seenCursors.add(cursor);
  return cursor;
}

function checkRunState(run: Record<string, unknown>): { readonly status: string; readonly conclusion: string | null } {
  const status = requiredString(run.status, 'provider check run status');
  if (!CHECK_RUN_STATUSES.has(status)) throw providerShape(`provider check run status is unknown: ${status}`);
  const conclusion = run.conclusion;
  if (conclusion !== null && typeof conclusion !== 'string') throw providerShape('provider check run conclusion is invalid');
  if (typeof conclusion === 'string' && !CHECK_RUN_CONCLUSIONS.has(conclusion)) {
    throw providerShape(`provider check run conclusion is unknown: ${conclusion}`);
  }
  if (status === 'COMPLETED' && conclusion === null) {
    throw providerShape('completed provider check run has no conclusion');
  }
  if (status !== 'COMPLETED' && conclusion !== null) {
    throw providerShape('incomplete provider check run has a conclusion');
  }
  return Object.freeze({ status, conclusion });
}

function checkSuiteIds(identity: ProviderIdentity, receipt: PublicationReceiptV1, input: FeedbackObservationInput): readonly string[] {
  const ids: string[] = [];
  let after: string | null = null;
  let pageCount = 0;
  const seenCursors = new Set<string>();
  do {
    if (pageCount >= MAX_PROVIDER_PAGES) throw providerIncomplete(`provider check suites pagination exceeds ${MAX_PROVIDER_PAGES} pages`);
    pageCount += 1;
    const graph = graphValue(input, CHECK_SUITE_QUERY, [['repoId', identity.provider_repo_id], ['number', String(receipt.pr_number)]], after);
    const data = asObject(graph.data, 'provider GraphQL data');
    const repository = asObject(data.node, 'provider repository node');
    const pr = asObject(repository.pullRequest, 'provider pull request node');
    const commits = asObject(pr.commits, 'provider PR commits');
    const commitNodes = commits.nodes;
    if (!Array.isArray(commitNodes) || commitNodes.length !== 1) throw providerIncomplete('provider PR head commit observation is incomplete');
    const commit = asObject(asObject(commitNodes[0], 'provider PR commit node').commit, 'provider check commit');
    if (requiredString(commit.oid, 'provider check commit OID') !== receipt.head_sha) throw new TornReadError('provider check observation moved to a different head');
    const suites = page(commit.checkSuites, 'provider check suites');
    for (const entry of suites.nodes) ids.push(requiredString(asObject(entry, 'provider check suite').id, 'provider check suite id', true));
    after = nextPageCursor(suites, 'provider check suites', seenCursors);
  } while (after !== null);
  return ids;
}

function failedCheckEvents(identity: ProviderIdentity, receipt: PublicationReceiptV1, input: FeedbackObservationInput): readonly FeedbackEventV1[] {
  const events: FeedbackEventV1[] = [];
  for (const suiteId of checkSuiteIds(identity, receipt, input)) {
    let after: string | null = null;
    let pageCount = 0;
    const seenCursors = new Set<string>();
    do {
      if (pageCount >= MAX_PROVIDER_PAGES) throw providerIncomplete(`provider check runs pagination exceeds ${MAX_PROVIDER_PAGES} pages`);
      pageCount += 1;
      const graph = graphValue(input, CHECK_RUN_QUERY, [['suiteId', suiteId]], after);
      const data = asObject(graph.data, 'provider GraphQL data');
      const suite = asObject(data.node, 'provider check suite node');
      const runs = page(suite.checkRuns, 'provider check runs');
      for (const entry of runs.nodes) {
        const run = asObject(entry, 'provider check run');
        const id = requiredString(run.id, 'provider check run id', true);
        const { status, conclusion } = checkRunState(run);
        if (status !== 'COMPLETED') continue;
        if (conclusion === null) throw providerShape('completed provider check run has no conclusion');
        if (conclusion === 'SUCCESS' || conclusion === 'SKIPPED' || conclusion === 'NEUTRAL') continue;
        const observedAt = requiredString(run.completedAt, 'provider check run completedAt');
        events.push(buildFeedbackEvent({
          provider: 'github',
          provider_event_id: id,
          publication_id: receipt.publication_id,
          head_sha: receipt.head_sha,
          failing_check_ids: [id],
          failing_checks: [{ id, conclusion: conclusion as FeedbackCheckConclusion }],
          unresolved_review_thread_ids: [],
          changes_requested_review_ids: [],
          mergeability: identity.mergeability,
          summary: `GitHub check run ${id} concluded ${conclusion}`,
          provider_url: identity.provider_url,
          observed_at: observedAt,
        }));
      }
      after = nextPageCursor(runs, 'provider check runs', seenCursors);
    } while (after !== null);
  }
  return events;
}

function unresolvedReviewEvents(identity: ProviderIdentity, receipt: PublicationReceiptV1, input: FeedbackObservationInput): readonly FeedbackEventV1[] {
  const events: FeedbackEventV1[] = [];
  let after: string | null = null;
  let pageCount = 0;
  const seenCursors = new Set<string>();
  do {
    if (pageCount >= MAX_PROVIDER_PAGES) throw providerIncomplete(`provider review threads pagination exceeds ${MAX_PROVIDER_PAGES} pages`);
    pageCount += 1;
    const graph = graphValue(input, REVIEW_THREAD_QUERY, [['repoId', identity.provider_repo_id], ['number', String(receipt.pr_number)]], after);
    const data = asObject(graph.data, 'provider GraphQL data');
    const repository = asObject(data.node, 'provider repository node');
    const pr = asObject(repository.pullRequest, 'provider pull request node');
    const threads = page(pr.reviewThreads, 'provider review threads');
    for (const entry of threads.nodes) {
      const thread = asObject(entry, 'provider review thread');
      const id = requiredString(thread.id, 'provider review thread id', true);
      if (requiredBoolean(thread.isResolved, 'provider review thread isResolved')) continue;
      events.push(buildFeedbackEvent({
        provider: 'github',
        provider_event_id: id,
        publication_id: receipt.publication_id,
        head_sha: receipt.head_sha,
        failing_check_ids: [],
        failing_checks: [],
        unresolved_review_thread_ids: [id],
        changes_requested_review_ids: [],
        mergeability: identity.mergeability,
        summary: `GitHub review thread ${id} remains unresolved`,
        provider_url: identity.provider_url,
        observed_at: requiredString(thread.updatedAt, 'provider review thread updatedAt'),
      }));
    }
    after = nextPageCursor(threads, 'provider review threads', seenCursors);
  } while (after !== null);
  return events;
}

/**
 * Review decision alone is not a durable provider event ID.  Query the review
 * connection itself so each CHANGES_REQUESTED decision is keyed by GitHub's
 * stable review object ID and pagination cannot silently hide another review.
 */
function changesRequestedReviewEvents(identity: ProviderIdentity, receipt: PublicationReceiptV1, input: FeedbackObservationInput): readonly FeedbackEventV1[] {
  const events: FeedbackEventV1[] = [];
  let after: string | null = null;
  let pageCount = 0;
  const seenCursors = new Set<string>();
  do {
    if (pageCount >= MAX_PROVIDER_PAGES) throw providerIncomplete(`provider reviews pagination exceeds ${MAX_PROVIDER_PAGES} pages`);
    pageCount += 1;
    const graph = graphValue(input, REVIEW_QUERY, [['repoId', identity.provider_repo_id], ['number', String(receipt.pr_number)]], after);
    const data = asObject(graph.data, 'provider GraphQL data');
    const repository = asObject(data.node, 'provider repository node');
    const pr = asObject(repository.pullRequest, 'provider pull request node');
    const reviews = page(pr.reviews, 'provider reviews');
    for (const entry of reviews.nodes) {
      const review = asObject(entry, 'provider review');
      const state = requiredString(review.state, 'provider review state');
      if (!['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING'].includes(state)) {
        throw providerShape(`provider review state is unknown: ${state}`);
      }
      if (state !== 'CHANGES_REQUESTED') continue;
      const id = requiredString(review.id, 'provider review id', true);
      events.push(buildFeedbackEvent({
        provider: 'github',
        provider_event_id: id,
        publication_id: receipt.publication_id,
        head_sha: receipt.head_sha,
        failing_check_ids: [],
        failing_checks: [],
        unresolved_review_thread_ids: [],
        changes_requested_review_ids: [id],
        mergeability: identity.mergeability,
        summary: `GitHub review ${id} requested changes`,
        provider_url: identity.provider_url,
        observed_at: requiredString(review.submittedAt, 'provider review submittedAt'),
      }));
    }
    after = nextPageCursor(reviews, 'provider reviews', seenCursors);
  } while (after !== null);
  return events;
}

/**
 * Build immutable events from a complete provider snapshot.  The surrounding
 * intake operation repeats this entire observation once when either provider
 * identity read changes; partial pages and unknown enums are never accepted.
 */
export function observeGitHubFeedback(receipt: PublicationReceiptV1, input: FeedbackObservationInput): readonly FeedbackEventV1[] {
  const before = observeIdentity(receipt, input);
  const events = [
    ...failedCheckEvents(before, receipt, input),
    ...unresolvedReviewEvents(before, receipt, input),
    ...changesRequestedReviewEvents(before, receipt, input),
  ];
  const after = observeIdentity(receipt, input);
  if (identityBytes(before) !== identityBytes(after)) throw new TornReadError('provider identity changed during feedback observation');
  assertStableIdentity(after, receipt);
  const ids = new Set<string>();
  for (const event of events) {
    if (ids.has(event.provider_event_id)) throw providerShape(`provider event ID is ambiguous: ${event.provider_event_id}`);
    ids.add(event.provider_event_id);
  }
  return Object.freeze(events);
}

export interface ShowGitHubFeedbackInput extends FeedbackObservationInput {
  readonly publication_id: string;
  readonly provider_event_id: string;
  readonly git_bin?: string;
}

export interface ShowGitHubFeedbackResult {
  readonly provider_event_id: string;
  readonly provider_url: string;
  readonly body: string;
  readonly untrusted: true;
}

function showGraphNode(
  input: FeedbackObservationInput,
  query: string,
  id: string,
  after: string | null = null,
): Record<string, unknown> {
  const graph = graphValue(input, query, [['id', id]], after);
  if (Array.isArray(graph.errors) && graph.errors.length > 0) {
    throw providerIncomplete('provider GraphQL response contains errors');
  }
  const data = asObject(graph.data, 'provider GraphQL data');
  const node = asObject(data.node, 'provider feedback node');
  if (requiredString(node.id, 'provider feedback node id', true) !== id) {
    throw providerShape('provider feedback node does not match the requested provider event id');
  }
  return node;
}

function optionalDisplayText(value: unknown, label: string): string {
  if (value === null) return '';
  if (typeof value !== 'string') throw providerShape(`${label} is invalid`);
  return value;
}

function checkRunBody(input: FeedbackObservationInput, providerEventId: string): string {
  const node = showGraphNode(input, SHOW_CHECK_RUN_QUERY, providerEventId);
  const { status, conclusion } = checkRunState(node);
  const output = node.output === null ? null : asObject(node.output, 'provider check run output');
  const title = output === null ? '' : optionalDisplayText(output.title, 'provider check run output title');
  const summary = output === null ? '' : optionalDisplayText(output.summary, 'provider check run output summary');
  const text = output === null ? '' : optionalDisplayText(output.text, 'provider check run output text');
  return [
    `name: ${requiredString(node.name, 'provider check run name')}`,
    `status: ${status}`,
    `conclusion: ${conclusion ?? ''}`,
    `details_url: ${optionalDisplayText(node.detailsUrl, 'provider check run detailsUrl')}`,
    `title: ${title}`,
    `summary: ${summary}`,
    `text: ${text}`,
  ].join('\n');
}

function reviewThreadBody(input: FeedbackObservationInput, providerEventId: string): string {
  const bodies: string[] = [];
  let after: string | null = null;
  let pageCount = 0;
  const seenCursors = new Set<string>();
  do {
    if (pageCount >= MAX_PROVIDER_PAGES) throw providerIncomplete(`provider review thread comments pagination exceeds ${MAX_PROVIDER_PAGES} pages`);
    pageCount += 1;
    const node = showGraphNode(input, SHOW_REVIEW_THREAD_QUERY, providerEventId, after);
    const comments = page(node.comments, 'provider review thread comments');
    for (const entry of comments.nodes) {
      const comment = asObject(entry, 'provider review thread comment');
      requiredString(comment.id, 'provider review thread comment id', true);
      const url = requiredString(comment.url, 'provider review thread comment URL');
      const body = optionalDisplayText(comment.body, 'provider review thread comment body');
      bodies.push(`${url}\n${body}`);
    }
    after = nextPageCursor(comments, 'provider review thread comments', seenCursors);
  } while (after !== null);
  return bodies.join('\n\n');
}

function reviewBody(input: FeedbackObservationInput, providerEventId: string): string {
  const node = showGraphNode(input, SHOW_REVIEW_QUERY, providerEventId);
  const state = requiredString(node.state, 'provider review state');
  if (state !== 'CHANGES_REQUESTED') {
    throw providerShape(`provider review is no longer CHANGES_REQUESTED: ${state}`);
  }
  return [
    `url: ${requiredString(node.url, 'provider review URL')}`,
    `submitted_at: ${requiredString(node.submittedAt, 'provider review submittedAt')}`,
    optionalDisplayText(node.body, 'provider review body'),
  ].join('\n');
}

/**
 * Fetch a full provider body only when an operator explicitly asks for it.
 * The stored event is used solely to identify the immutable provider object;
 * returned text is untrusted display data and is never written back to any
 * feedback, delivery, reaction, or lease surface.
 */
export function showGitHubFeedback(input: ShowGitHubFeedbackInput): ShowGitHubFeedbackResult {
  const gitBin = input.git_bin ?? 'git';
  const before = currentPublication(input.repo_root, input.publication_id, gitBin);
  let event: FeedbackEventV1 | null;
  try {
    event = readFeedbackEvent(input.repo_root, before.receipt.publication_id, input.provider_event_id, gitBin);
  } catch (error) {
    mapStoreError(error);
  }
  if (event === null) throw new FeedbackError('feedback_unreadable', 'provider feedback event is unavailable');
  if (event.publication_id !== before.receipt.publication_id || event.head_sha !== before.receipt.head_sha) {
    throw new FeedbackError('head_moved', 'provider feedback event does not match the current publication head');
  }
  const isCheck = event.failing_checks.length === 1 && event.failing_checks[0]?.id === event.provider_event_id
    && event.failing_check_ids.length === 1 && event.failing_check_ids[0] === event.provider_event_id
    && event.unresolved_review_thread_ids.length === 0 && event.changes_requested_review_ids.length === 0;
  const isThread = event.failing_checks.length === 0 && event.failing_check_ids.length === 0
    && event.unresolved_review_thread_ids.length === 1 && event.unresolved_review_thread_ids[0] === event.provider_event_id
    && event.changes_requested_review_ids.length === 0;
  const isReview = event.failing_checks.length === 0 && event.failing_check_ids.length === 0
    && event.unresolved_review_thread_ids.length === 0
    && event.changes_requested_review_ids.length === 1
    && event.changes_requested_review_ids[0] === event.provider_event_id;
  if ([isCheck, isThread, isReview].filter(Boolean).length !== 1) {
    throw new FeedbackError('feedback_unreadable', 'provider feedback event cannot be mapped to one provider object type');
  }
  let body: string;
  try {
    body = isCheck
      ? checkRunBody(input, event.provider_event_id)
      : isThread
        ? reviewThreadBody(input, event.provider_event_id)
        : reviewBody(input, event.provider_event_id);
  } catch (error) {
    if (error instanceof FeedbackError) throw error;
    throw new FeedbackError('feedback_provider_incomplete', 'cannot fetch the requested provider feedback body', error);
  }
  const after = currentPublication(input.repo_root, input.publication_id, gitBin);
  if (canonicalPublicationReceiptBytes(before.receipt) !== canonicalPublicationReceiptBytes(after.receipt)
    || before.lease_raw !== after.lease_raw) {
    throw new FeedbackError('feedback_provider_incomplete', 'publication changed during provider feedback display observation');
  }
  return Object.freeze({
    provider_event_id: event.provider_event_id,
    provider_url: event.provider_url,
    body,
    untrusted: true as const,
  });
}

function cachedPublicationReceipt(repoRoot: string, publicationId: string, gitBin: string): PublicationReceiptV1 {
  let receipt: PublicationReceiptV1 | null;
  try {
    receipt = readPublicationReceiptCache(repoRoot, publicationId, gitBin);
  } catch (error) {
    if (error instanceof PublicationReceiptError) throw new FeedbackError('publication_claim_mismatch', error.message, error);
    throw new FeedbackError('publication_not_found', `publication receipt is unreadable: ${publicationId}`, error);
  }
  if (receipt === null) throw new FeedbackError('publication_not_found', `publication receipt is unavailable: ${publicationId}`);
  return receipt;
}

function currentReviewingPublication(repoRoot: string, taskId: string, gitBin: string): CurrentPublicationSnapshot {
  const lease = readLease(repoRoot, taskId);
  const record = lease.record;
  if (record === null || lease.raw === null || record.state !== 'reviewing' || !('current_publication' in record) || record.current_publication === null) {
    throw new FeedbackError('repair_completion_unverified', `task ${taskId} is not reviewing a publication`);
  }
  const pointer = record.current_publication;
  const receipt = cachedPublicationReceipt(repoRoot, pointer.publication_id, gitBin);
  if (pointer.publication_id !== receipt.publication_id || pointer.receipt_sha256 !== publicationReceiptDigest(receipt)) {
    throw new FeedbackError('publication_claim_mismatch', 'current publication pointer does not match the immutable receipt');
  }
  if (pointer.head_sha !== receipt.head_sha) throw new FeedbackError('head_moved', 'current publication pointer head does not match the immutable receipt');
  if (record.claim_id !== receipt.claim_id || record.generation !== receipt.generation || record.task_revision !== receipt.task_revision) {
    throw new FeedbackError('publication_claim_mismatch', 'reviewing lease does not match the immutable receipt');
  }
  assertCanonicalPending(repoRoot, record);
  return Object.freeze({ receipt, lease_raw: lease.raw, record });
}

function currentPublication(repoRoot: string, publicationId: string, gitBin: string): CurrentPublicationSnapshot {
  const receipt = cachedPublicationReceipt(repoRoot, publicationId, gitBin);
  const snapshot = currentReviewingPublication(repoRoot, receipt.task_id, gitBin);
  if (snapshot.receipt.publication_id !== publicationId) {
    throw new FeedbackError('publication_not_found', `publication ${publicationId} is not the current reviewing publication`);
  }
  return snapshot;
}

function assertCanonicalPending(repoRoot: string, record: LeaseOwnerRecord): void {
  const canonical = readCanonicalSprint(repoRoot, { targetRef: record.target_ref, sprintPath: record.sprint_path });
  if (!canonical.ok) throw new FeedbackError('feedback_incomplete', canonical.error);
  const lookup = lookupCanonicalTask({
    repoIdentity: resolveRepoIdentity(repoRoot),
    sprintPath: record.sprint_path,
    sprintText: canonical.text,
  }, record.task_id);
  if (!lookup.ok || lookup.task.task_revision !== record.task_revision || lookup.task.row.status !== '[ ]') {
    throw new FeedbackError('publication_claim_mismatch', 'canonical task no longer matches the reviewing publication');
  }
}

function mapStoreError(error: unknown): never {
  if (error instanceof FeedbackError) throw error;
  if (error instanceof FeedbackStoreError) {
    throw new FeedbackError(error.code, error.message, error);
  }
  throw new FeedbackError('feedback_incomplete', 'feedback persistence failed', error);
}

function persistObservedEvents(input: FeedbackIntakeInput, snapshot: CurrentPublicationSnapshot, events: readonly FeedbackEventV1[]): FeedbackIntakeResult {
  try {
    for (const event of events) {
      writeFeedbackEvent(input.repo_root, event, input.git_bin ?? 'git');
      try {
        const delivery = buildFeedbackDeliveryReceipt({
          provider_event_id: event.provider_event_id,
          delivery_state: 'pending',
          delivery_channel: 'none',
          delivered_at: null,
          acknowledged_at: null,
          superseded_at: null,
        });
        // An existing delivery record is mutable notification evidence.  Initial
        // intake only creates pending state and never downgrades an acknowledgement.
        if (readFeedbackDeliveryReceipt(input.repo_root, snapshot.receipt.publication_id, event.provider_event_id, input.git_bin ?? 'git') === null) {
          writeFeedbackDeliveryReceipt(input.repo_root, snapshot.receipt.publication_id, delivery, input.git_bin ?? 'git');
        }
      } catch (error) {
        // The event is already durable.  A retry must repair its missing
        // delivery record, but the caller must be told that this intake was
        // only partially persisted rather than treating it as a clean success.
        throw new FeedbackError('feedback_incomplete', `feedback event ${event.provider_event_id} persisted without a delivery receipt`, error);
      }
    }
  } catch (error) {
    mapStoreError(error);
  }
  return Object.freeze({ publication_id: snapshot.receipt.publication_id, event_count: events.length, events: Object.freeze([...events]) });
}

/**
 * Intake is intentionally the only observer write path. It fences local
 * reviewing-pointer/canonical state before and after provider observation,
 * retries exactly once for either local or provider torn reads, and never
 * mutates lease bytes.
 */
export function intakeGitHubFeedback(input: FeedbackIntakeInput): FeedbackIntakeResult {
  const gitBin = input.git_bin ?? 'git';
  let lastTorn: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let before: CurrentPublicationSnapshot;
    let events: readonly FeedbackEventV1[];
    try {
      before = currentPublication(input.repo_root, input.publication_id, gitBin);
      events = observeGitHubFeedback(before.receipt, input);
    } catch (error) {
      if (error instanceof TornReadError) {
        lastTorn = error;
        continue;
      }
      if (error instanceof FeedbackError) throw error;
      throw new FeedbackError('feedback_incomplete', 'feedback observation failed', error);
    }
    try {
      const result = withTaskLock(input.repo_root, before.receipt.task_id, () => {
        const after = currentPublication(input.repo_root, input.publication_id, gitBin);
        if (canonicalPublicationReceiptBytes(after.receipt) !== canonicalPublicationReceiptBytes(before.receipt)
          || after.lease_raw !== before.lease_raw) {
          return null;
        }
        return persistObservedEvents(input, after, events);
      });
      if (result !== null) return result;
      lastTorn = new TornReadError('current publication changed during provider feedback observation');
    } catch (error) {
      if (error instanceof FeedbackError) throw error;
      throw new FeedbackError('feedback_incomplete', 'feedback intake failed', error);
    }
  }
  throw new FeedbackError('feedback_provider_incomplete', 'provider or local publication changed during both feedback observations', lastTorn);
}

/**
 * Project a repair offer entirely from durable feedback facts. This path reads
 * no provider and writes neither deliveries, reactions, nor the lease.
 */
export function projectPendingFeedbackOffer(
  input: Pick<FeedbackIntakeInput, 'repo_root' | 'publication_id' | 'git_bin'>,
): PendingFeedbackOffer {
  const gitBin = input.git_bin ?? 'git';
  let lastTorn: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const before = currentPublication(input.repo_root, input.publication_id, gitBin);
      const events = readFeedbackEvents(input.repo_root, before.receipt.publication_id, gitBin);
      const deliveries = readFeedbackDeliveryReceipts(input.repo_root, before.receipt.publication_id, gitBin);
      const reactions = readReactionAttemptReceipts(input.repo_root, before.receipt.publication_id, gitBin);
      const ids = new Set(events.map((event) => event.provider_event_id));
      const deliveryIds = new Set<string>();
      for (const delivery of deliveries) {
        if (!ids.has(delivery.provider_event_id)) {
          throw new FeedbackError('feedback_unreadable', 'feedback delivery receipt has no immutable event');
        }
        deliveryIds.add(delivery.provider_event_id);
      }
      for (const event of events) {
        if (!deliveryIds.has(event.provider_event_id)) {
          throw new FeedbackError('feedback_incomplete', `feedback event ${event.provider_event_id} has no delivery receipt`);
        }
      }
      const after = currentPublication(input.repo_root, input.publication_id, gitBin);
      if (canonicalPublicationReceiptBytes(before.receipt) !== canonicalPublicationReceiptBytes(after.receipt)
        || before.lease_raw !== after.lease_raw) {
        lastTorn = new TornReadError('current publication changed during feedback offer projection');
        continue;
      }
      if (events.length === 0) return Object.freeze({ state: 'none', publication_id: before.receipt.publication_id });
      const actionable = actionableFeedbackFacts(events);
      return projectRepairOffer({
        task_id: before.receipt.task_id,
        publication_id: before.receipt.publication_id,
        expected_claim_id: before.receipt.claim_id,
        expected_generation: before.receipt.generation,
        expected_head_sha: before.receipt.head_sha,
        feedback_revision: deriveFeedbackRevision(events),
        reaction_token: deriveReactionToken({
          publication_id: before.receipt.publication_id,
          head_sha: before.receipt.head_sha,
          failing_checks: actionable.failing_checks,
          unresolved_review_thread_ids: actionable.unresolved_review_thread_ids,
          mergeability: actionable.mergeability,
        }),
        reaction_attempts: reactions,
      });
    } catch (error) {
      if (error instanceof FeedbackError) throw error;
      if (error instanceof FeedbackStoreError) throw new FeedbackError(error.code, error.message, error);
      throw new FeedbackError('feedback_incomplete', 'feedback offer projection failed', error);
    }
  }
  throw new FeedbackError('feedback_incomplete', 'publication changed during both feedback offer projections', lastTorn);
}

/**
 * Advance one delivery receipt under the publication task lock. Delivery is
 * notification evidence only; it cannot authorize a repair or change a lease.
 */
export function transitionFeedbackDelivery(
  input: Pick<FeedbackIntakeInput, 'repo_root' | 'publication_id' | 'git_bin'> & {
    readonly provider_event_id: string;
    readonly transition: FeedbackDeliveryTransitionInput;
  },
) {
  const gitBin = input.git_bin ?? 'git';
  const snapshot = currentPublication(input.repo_root, input.publication_id, gitBin);
  try {
    return withTaskLock(input.repo_root, snapshot.receipt.task_id, () => {
      const current = currentPublication(input.repo_root, input.publication_id, gitBin);
      if (canonicalPublicationReceiptBytes(snapshot.receipt) !== canonicalPublicationReceiptBytes(current.receipt)
        || snapshot.lease_raw !== current.lease_raw) {
        throw new FeedbackError('feedback_incomplete', 'publication changed before feedback delivery transition');
      }
      const receipt = readFeedbackDeliveryReceipt(input.repo_root, current.receipt.publication_id, input.provider_event_id, gitBin);
      if (receipt === null) throw new FeedbackError('feedback_unreadable', 'feedback delivery receipt is unavailable');
      const next = transitionFeedbackDeliveryReceipt(receipt, input.transition);
      writeFeedbackDeliveryReceipt(input.repo_root, current.receipt.publication_id, next, gitBin);
      return next;
    });
  } catch (error) {
    if (error instanceof FeedbackError) throw error;
    if (error instanceof FeedbackStoreError) throw new FeedbackError(error.code, error.message, error);
    throw new FeedbackError('feedback_incomplete', 'feedback delivery transition failed', error);
  }
}

/**
 * The repair envelope is ephemeral transport data.  It deliberately repeats
 * the frozen offer fences and only carries provider object identifiers; full
 * provider comment bodies never leave the feedback store through this path.
 */
export interface FeedbackRepairEnvelopeV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-feedback-repair-envelope';
  /** Locator for the durable dispatch proof; never an authority itself. */
  readonly repair_id: string;
  readonly action: 'reopened' | 'taken_over';
  readonly task_id: string;
  readonly publication_id: string;
  readonly claim_id: string;
  readonly generation: number;
  readonly expected_head_sha: string;
  readonly feedback_revision: string;
  readonly reaction_token: string;
  readonly feedback: {
    readonly event_count: number;
    readonly failing_check_ids: readonly string[];
    readonly unresolved_review_thread_ids: readonly string[];
    readonly truncated: boolean;
  };
}

export interface FeedbackRepairEnvironment {
  readonly repo_root: string;
  readonly gh_bin?: string;
  readonly git_bin?: string;
  readonly merge_seal_path?: string;
  readonly checks_path?: string;
}

export interface ReopenFeedbackRepairInput extends FeedbackRepairEnvironment {
  readonly offer: RepairOfferV1;
  /** Injected by the caller so the durable delivery transition is auditable. */
  readonly delivered_at: string;
}

export interface TakeoverFeedbackRepairInput extends FeedbackRepairEnvironment {
  readonly offer: RepairOfferV1;
  readonly reason: string;
  readonly session_id: string;
  readonly new_claim_id: string;
  readonly source_worktree: string;
  readonly delivered_at: string;
}

export interface CompletedFeedbackRepairInput extends FeedbackRepairEnvironment {
  /** Source publication that owns the immutable feedback and dispatch proof. */
  readonly publication_id: string;
  /** Internally derived repair proof locator returned by repair dispatch. */
  readonly repair_id: string;
  readonly recorded_at: string;
}

export interface FeedbackRepairDispatchResult {
  readonly lease: LeaseOwnerRecord;
  readonly envelope: FeedbackRepairEnvelopeV1;
}

interface FeedbackMaterial {
  readonly events: readonly FeedbackEventV1[];
  readonly feedback_revision: string;
  readonly reaction_token: string;
  readonly failing_checks: readonly FeedbackFailingCheckV1[];
  readonly failing_check_ids: readonly string[];
  readonly unresolved_review_thread_ids: readonly string[];
  readonly changes_requested_review_ids: readonly string[];
  readonly mergeability: FeedbackMergeability;
}

const REPAIR_ENVELOPE_MAX_IDENTIFIERS = 100;

function mapLifecycleError(error: unknown, fallback: string): never {
  if (error instanceof FeedbackError) throw error;
  if (error instanceof PublicationLifecycleError) {
    if (error.code === 'head_moved') throw new FeedbackError('head_moved', error.message, error);
    if (error.code === 'publication_claim_mismatch' || error.code === 'publication_pointer_mismatch' || error.code === 'task_revision_mismatch') {
      throw new FeedbackError('repair_offer_stale', error.message, error);
    }
    throw new FeedbackError('feedback_incomplete', error.message, error);
  }
  if (error instanceof FeedbackStoreError) throw new FeedbackError(error.code, error.message, error);
  throw new FeedbackError('feedback_incomplete', fallback, error);
}

function actionableFeedbackFacts(events: readonly FeedbackEventV1[]): {
  readonly failing_checks: readonly FeedbackFailingCheckV1[];
  readonly failing_check_ids: readonly string[];
  readonly unresolved_review_thread_ids: readonly string[];
  readonly changes_requested_review_ids: readonly string[];
  readonly mergeability: FeedbackMergeability;
} {
  const checks = new Map<string, FeedbackFailingCheckV1>();
  const unresolved = new Set<string>();
  const changesRequested = new Set<string>();
  const mergeabilities = new Set<FeedbackMergeability>();
  for (const event of events) {
    mergeabilities.add(event.mergeability);
    for (const check of event.failing_checks) {
      const existing = checks.get(check.id);
      if (existing !== undefined && existing.conclusion !== check.conclusion) {
        throw new FeedbackError('feedback_unreadable', `failing check ${check.id} has conflicting conclusions`);
      }
      checks.set(check.id, check);
    }
    for (const id of event.unresolved_review_thread_ids) unresolved.add(id);
    for (const id of event.changes_requested_review_ids) changesRequested.add(id);
  }
  if (mergeabilities.size !== 1) {
    throw new FeedbackError('feedback_unreadable', 'feedback material does not carry one canonical mergeability');
  }
  const failingChecks = [...checks.values()].sort((left, right) => Buffer.compare(Buffer.from(left.id), Buffer.from(right.id)));
  const failingCheckIds = failingChecks.map((check) => check.id);
  return Object.freeze({
    failing_checks: Object.freeze(failingChecks),
    failing_check_ids: Object.freeze(failingCheckIds),
    unresolved_review_thread_ids: Object.freeze([...unresolved].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))),
    changes_requested_review_ids: Object.freeze([...changesRequested].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))),
    mergeability: [...mergeabilities][0]!,
  });
}

function materialForPublication(
  repoRoot: string,
  receipt: PublicationReceiptV1,
  gitBin: string,
): FeedbackMaterial {
  const events = readFeedbackEvents(repoRoot, receipt.publication_id, gitBin);
  const deliveries = readFeedbackDeliveryReceipts(repoRoot, receipt.publication_id, gitBin);
  const eventIds = new Set<string>();
  const deliveryIds = new Set<string>();
  for (const event of events) {
    if (event.publication_id !== receipt.publication_id || event.head_sha !== receipt.head_sha) {
      throw new FeedbackError('feedback_unreadable', 'feedback event does not match the current publication head');
    }
    eventIds.add(event.provider_event_id);
  }
  for (const delivery of deliveries) {
    if (!eventIds.has(delivery.provider_event_id)) {
      throw new FeedbackError('feedback_unreadable', 'feedback delivery receipt has no immutable event');
    }
    deliveryIds.add(delivery.provider_event_id);
  }
  for (const event of events) {
    if (!deliveryIds.has(event.provider_event_id)) {
      throw new FeedbackError('feedback_incomplete', `feedback event ${event.provider_event_id} has no delivery receipt`);
    }
  }
  const actionable = actionableFeedbackFacts(events);
  return Object.freeze({
    events,
    feedback_revision: deriveFeedbackRevision(events),
    reaction_token: deriveReactionToken({
      publication_id: receipt.publication_id,
      head_sha: receipt.head_sha,
      failing_checks: actionable.failing_checks,
      unresolved_review_thread_ids: actionable.unresolved_review_thread_ids,
      mergeability: actionable.mergeability,
    }),
    ...actionable,
  });
}

function assertOfferSnapshot(
  repoRoot: string,
  offerValue: RepairOfferV1,
  gitBin: string,
): { readonly offer: RepairOfferV1; readonly snapshot: CurrentPublicationSnapshot; readonly material: FeedbackMaterial } {
  let offer: RepairOfferV1;
  try {
    offer = validateRepairOffer(offerValue);
  } catch (error) {
    throw new FeedbackError('repair_offer_stale', 'repair offer is malformed', error);
  }
  const snapshot = currentPublication(repoRoot, offer.publication_id, gitBin);
  const receipt = snapshot.receipt;
  if (
    offer.task_id !== receipt.task_id
    || offer.expected_claim_id !== receipt.claim_id
    || offer.expected_generation !== receipt.generation
    || offer.expected_head_sha !== receipt.head_sha
  ) {
    throw new FeedbackError('repair_offer_stale', 'repair offer no longer matches the current reviewing publication');
  }
  const material = materialForPublication(repoRoot, receipt, gitBin);
  if (material.events.length === 0 || material.feedback_revision !== offer.feedback_revision) {
    throw new FeedbackError('feedback_revision_mismatch', 'repair offer feedback revision is stale');
  }
  return Object.freeze({ offer, snapshot, material });
}

function assertPostLifecycleRecord(
  repoRoot: string,
  expected: Pick<CurrentPublicationSnapshot, 'receipt'>,
  action: 'reopened' | 'taken_over',
): LeaseOwnerRecord {
  const read = readLease(repoRoot, expected.receipt.task_id);
  const record = read.record;
  if (record === null || read.raw === null || record.task_id !== expected.receipt.task_id || record.task_revision !== expected.receipt.task_revision) {
    throw new FeedbackError('repair_offer_stale', 'repair lease is unavailable after lifecycle transition');
  }
  const expectedState = action === 'reopened' ? 'bound' : 'reserving';
  if (record.state !== expectedState || !('current_publication' in record) || record.current_publication !== null) {
    throw new FeedbackError('repair_offer_stale', `repair lifecycle did not end in ${expectedState}`);
  }
  if (action === 'reopened') {
    if (record.claim_id !== expected.receipt.claim_id || record.generation !== expected.receipt.generation) {
      throw new FeedbackError('repair_offer_stale', 'same-owner repair claim changed unexpectedly');
    }
  } else if (record.generation !== expected.receipt.generation + 1 || record.claim_id === expected.receipt.claim_id) {
    throw new FeedbackError('repair_offer_stale', 'takeover repair claim or generation is invalid');
  }
  return record;
}

function sourcePointer(snapshot: CurrentPublicationSnapshot) {
  const record = snapshot.record;
  if (!('current_publication' in record) || record.current_publication === null) {
    throw new FeedbackError('repair_dispatch_conflict', 'repair source no longer has a reviewing publication pointer');
  }
  return record.current_publication;
}

function proofForSnapshot(
  prepared: { readonly offer: RepairOfferV1; readonly snapshot: CurrentPublicationSnapshot; readonly material: FeedbackMaterial },
  action: 'resume_same_owner' | 'explicit_takeover',
): RepairDispatchProofV1 {
  const pointer = sourcePointer(prepared.snapshot);
  return buildRepairDispatchProof({
    publication_id: prepared.snapshot.receipt.publication_id,
    receipt_sha256: pointer.receipt_sha256,
    task_id: prepared.snapshot.receipt.task_id,
    task_revision: prepared.snapshot.receipt.task_revision,
    claim_id: prepared.snapshot.receipt.claim_id,
    generation: prepared.snapshot.receipt.generation,
    head_sha: prepared.snapshot.receipt.head_sha,
    ship_transaction_key: pointer.ship_transaction_key,
    feedback_revision: prepared.material.feedback_revision,
    before_reaction_token: prepared.material.reaction_token,
    action,
    phase: 'prepared',
    successor_claim_id: null,
    successor_generation: null,
    successor_state: null,
  });
}

function samePreparedProof(left: RepairDispatchProofV1, right: RepairDispatchProofV1): boolean {
  return left.repair_id === right.repair_id
    && left.phase === 'prepared'
    && right.phase === 'prepared'
    && left.publication_id === right.publication_id
    && left.receipt_sha256 === right.receipt_sha256
    && left.task_id === right.task_id
    && left.task_revision === right.task_revision
    && left.claim_id === right.claim_id
    && left.generation === right.generation
    && left.head_sha === right.head_sha
    && left.ship_transaction_key === right.ship_transaction_key
    && left.feedback_revision === right.feedback_revision
    && left.before_reaction_token === right.before_reaction_token
    && left.action === right.action;
}

interface PreparedRepairDispatch {
  readonly source: { readonly offer: RepairOfferV1; readonly receipt: PublicationReceiptV1; readonly material: FeedbackMaterial };
  readonly proof: RepairDispatchProofV1;
  readonly recover_successor: boolean;
}

function recoverPreparedProof(
  repoRoot: string,
  offerValue: RepairOfferV1,
  action: 'resume_same_owner' | 'explicit_takeover',
  gitBin: string,
): PreparedRepairDispatch {
  let offer: RepairOfferV1;
  try {
    offer = validateRepairOffer(offerValue);
  } catch (error) {
    throw new FeedbackError('repair_offer_stale', 'repair offer is malformed', error);
  }
  const receipt = cachedPublicationReceipt(repoRoot, offer.publication_id, gitBin);
  if (offer.task_id !== receipt.task_id) {
    throw new FeedbackError('repair_offer_stale', 'recovery offer task does not match the source publication');
  }
  const material = materialForPublication(repoRoot, receipt, gitBin);
  const matches = readRepairDispatchProofs(repoRoot, receipt.publication_id, gitBin).filter((proof) => (
    proof.receipt_sha256 === publicationReceiptDigest(receipt)
    && proof.task_id === receipt.task_id
    && proof.task_revision === receipt.task_revision
    && proof.claim_id === offer.expected_claim_id
    && proof.generation === offer.expected_generation
    && proof.head_sha === offer.expected_head_sha
    && proof.feedback_revision === offer.feedback_revision
    && proof.before_reaction_token === material.reaction_token
    && proof.action === action
  ));
  if (matches.length === 0) throw new FeedbackError('repair_not_dispatched', 'no matching prepared repair dispatch proof is available');
  if (matches.length !== 1) throw new FeedbackError('repair_dispatch_conflict', 'prepared repair dispatch proof selection is ambiguous');
  if (matches[0]!.phase !== 'prepared') {
    throw new FeedbackError('repair_dispatch_conflict', 'repair dispatch has already reached dispatched evidence');
  }
  return Object.freeze({
    source: Object.freeze({ offer, receipt, material }),
    proof: matches[0]!,
    recover_successor: true,
  });
}

/** Transition only pending delivery facts; acknowledgements and superseded
 * receipts are historical facts and must never be downgraded by a repair. */
function deliverPendingFeedback(
  repoRoot: string,
  publicationId: string,
  events: readonly FeedbackEventV1[],
  deliveredAt: string,
  gitBin: string,
): void {
  for (const event of events) {
    const receipt = readFeedbackDeliveryReceipt(repoRoot, publicationId, event.provider_event_id, gitBin);
    if (receipt === null) {
      throw new FeedbackError('feedback_incomplete', `feedback event ${event.provider_event_id} has no delivery receipt`);
    }
    if (receipt.delivery_state !== 'pending') continue;
    const delivered = transitionFeedbackDeliveryReceipt(receipt, {
      delivery_state: 'delivered',
      delivery_channel: 'manual',
      transitioned_at: deliveredAt,
    });
    writeFeedbackDeliveryReceipt(repoRoot, publicationId, delivered, gitBin);
  }
}

function repairEnvelope(
  action: 'reopened' | 'taken_over',
  record: LeaseOwnerRecord,
  source: Pick<CurrentPublicationSnapshot, 'receipt'>,
  material: FeedbackMaterial,
  repairId: string,
): FeedbackRepairEnvelopeV1 {
  const all = material.failing_check_ids.length + material.unresolved_review_thread_ids.length;
  return Object.freeze({
    protocol: 1,
    kind: 'repo-harness-feedback-repair-envelope',
    repair_id: repairId,
    action,
    task_id: source.receipt.task_id,
    publication_id: source.receipt.publication_id,
    claim_id: record.claim_id,
    generation: record.generation,
    expected_head_sha: source.receipt.head_sha,
    feedback_revision: material.feedback_revision,
    reaction_token: material.reaction_token,
    feedback: Object.freeze({
      event_count: material.events.length,
      failing_check_ids: Object.freeze(material.failing_check_ids.slice(0, REPAIR_ENVELOPE_MAX_IDENTIFIERS)),
      unresolved_review_thread_ids: Object.freeze(material.unresolved_review_thread_ids.slice(0, REPAIR_ENVELOPE_MAX_IDENTIFIERS)),
      truncated: all > REPAIR_ENVELOPE_MAX_IDENTIFIERS * 2,
    }),
  });
}

function recoverableSourceNotCurrent(error: unknown): boolean {
  return error instanceof FeedbackError
    && (error.code === 'publication_not_found' || error.code === 'repair_completion_unverified');
}

/**
 * The repair offer selects a source publication, but its task id is caller
 * input.  Resolve the immutable receipt before taking any task lock so a
 * forged offer cannot create or contend on an unrelated task's lock.
 */
function trustedSourceReceiptForOffer(
  repoRoot: string,
  offer: RepairOfferV1,
  gitBin: string,
): PublicationReceiptV1 {
  const receipt = cachedPublicationReceipt(repoRoot, offer.publication_id, gitBin);
  if (offer.task_id !== receipt.task_id) {
    throw new FeedbackError('repair_offer_stale', 'repair offer task does not match the immutable source publication');
  }
  return receipt;
}

/**
 * Re-resolve the receipt after acquiring its trusted task lock.  The second
 * read prevents a locator/read race from turning a lock for one task into
 * mutation of another task's publication evidence.
 */
function withTrustedSourceTaskLock<T>(
  repoRoot: string,
  offer: RepairOfferV1,
  gitBin: string,
  run: (receipt: PublicationReceiptV1) => T,
): T {
  const located = trustedSourceReceiptForOffer(repoRoot, offer, gitBin);
  return withTaskLock(repoRoot, located.task_id, () => {
    const receipt = trustedSourceReceiptForOffer(repoRoot, offer, gitBin);
    if (receipt.task_id !== located.task_id) {
      throw new FeedbackError('repair_offer_stale', 'source publication task changed during repair lock acquisition');
    }
    return run(receipt);
  });
}

function prepareRepairDispatch(
  repoRoot: string,
  offerValue: RepairOfferV1,
  action: 'resume_same_owner' | 'explicit_takeover',
  gitBin: string,
): PreparedRepairDispatch {
  let offer: RepairOfferV1;
  try {
    offer = validateRepairOffer(offerValue);
  } catch (error) {
    throw new FeedbackError('repair_offer_stale', 'repair offer is malformed', error);
  }
  try {
    return withTrustedSourceTaskLock(repoRoot, offer, gitBin, () => {
      const prepared = assertOfferSnapshot(repoRoot, offer, gitBin);
      const expected = proofForSnapshot(prepared, action);
      const existing = readRepairDispatchProof(repoRoot, expected.publication_id, expected.repair_id, gitBin);
      if (existing === null) {
        writeRepairDispatchProof(repoRoot, expected.publication_id, expected, gitBin);
      } else if (!samePreparedProof(existing, expected)) {
        throw new FeedbackError('repair_dispatch_conflict', 'existing repair dispatch proof conflicts with the current repair fences');
      }
      return Object.freeze({
        source: Object.freeze({ offer: prepared.offer, receipt: prepared.snapshot.receipt, material: prepared.material }),
        proof: existing ?? expected,
        recover_successor: false,
      });
    });
  } catch (error) {
    if (!recoverableSourceNotCurrent(error)) throw error;
    return withTrustedSourceTaskLock(repoRoot, offer, gitBin, () => recoverPreparedProof(repoRoot, offer, action, gitBin));
  }
}

function successorForDispatch(
  repoRoot: string,
  source: Pick<CurrentPublicationSnapshot, 'receipt'>,
  action: 'reopened' | 'taken_over',
  expectedTakeoverClaim: string | null,
): LeaseOwnerRecord {
  const record = assertPostLifecycleRecord(repoRoot, source, action);
  if (action === 'taken_over' && expectedTakeoverClaim !== null && record.claim_id !== expectedTakeoverClaim) {
    throw new FeedbackError('repair_offer_stale', 'takeover lifecycle returned an unexpected claim id');
  }
  return record;
}

function finalizeRepairDispatch(
  input: FeedbackRepairEnvironment & { readonly delivered_at: string },
  dispatch: PreparedRepairDispatch,
  action: 'reopened' | 'taken_over',
  expectedTakeoverClaim: string | null,
): FeedbackRepairDispatchResult {
  const gitBin = input.git_bin ?? 'git';
  try {
    return withTaskLock(input.repo_root, dispatch.source.receipt.task_id, () => {
      const record = successorForDispatch(input.repo_root, dispatch.source, action, expectedTakeoverClaim);
      const material = materialForPublication(input.repo_root, dispatch.source.receipt, gitBin);
      if (
        material.feedback_revision !== dispatch.proof.feedback_revision
        || material.reaction_token !== dispatch.proof.before_reaction_token
      ) {
        throw new FeedbackError('feedback_revision_mismatch', 'source feedback changed after repair dispatch was prepared');
      }
      deliverPendingFeedback(input.repo_root, dispatch.source.receipt.publication_id, material.events, input.delivered_at, gitBin);
      transitionRepairDispatchProof(input.repo_root, dispatch.source.receipt.publication_id, dispatch.proof.repair_id, {
        successor_claim_id: record.claim_id,
        successor_generation: record.generation,
        successor_state: record.state === 'bound' ? 'bound' : 'reserving',
      }, gitBin);
      return Object.freeze({
        lease: record,
        envelope: repairEnvelope(action, record, dispatch.source, material, dispatch.proof.repair_id),
      });
    });
  } catch (error) {
    return mapLifecycleError(error, 'feedback dispatch finalization failed');
  }
}

/**
 * Persist preparation before calling the existing same-owner lifecycle.  A
 * crash after the lifecycle write is recovered only by observing the exact
 * bound successor and then promoting this evidence to dispatched.
 */
export function reopenFeedbackRepair(input: ReopenFeedbackRepairInput): FeedbackRepairDispatchResult {
  const gitBin = input.git_bin ?? 'git';
  const dispatch = prepareRepairDispatch(input.repo_root, input.offer, 'resume_same_owner', gitBin);
  if (!dispatch.recover_successor) {
    try {
      reopenPublication({
        repo_root: input.repo_root,
        task_id: dispatch.source.receipt.task_id,
        claim_id: dispatch.source.receipt.claim_id,
        expected_generation: dispatch.source.receipt.generation,
        publication_id: dispatch.source.receipt.publication_id,
        expected_head_sha: dispatch.source.receipt.head_sha,
        gh_bin: input.gh_bin,
        git_bin: input.git_bin,
        merge_seal_path: input.merge_seal_path,
        checks_path: input.checks_path,
      });
    } catch (error) {
      return mapLifecycleError(error, 'cannot reopen feedback repair');
    }
  }
  return finalizeRepairDispatch(input, dispatch, 'reopened', null);
}

/**
 * Persist preparation before using the existing takeover lifecycle.  The
 * successor remains reserving; this effect never writes bound fields.
 */
export function takeoverFeedbackRepair(input: TakeoverFeedbackRepairInput): FeedbackRepairDispatchResult {
  const gitBin = input.git_bin ?? 'git';
  const dispatch = prepareRepairDispatch(input.repo_root, input.offer, 'explicit_takeover', gitBin);
  if (!dispatch.recover_successor) {
    try {
      takeoverPublication({
        repo_root: input.repo_root,
        task_id: dispatch.source.receipt.task_id,
        expected_claim_id: dispatch.source.receipt.claim_id,
        expected_generation: dispatch.source.receipt.generation,
        publication_id: dispatch.source.receipt.publication_id,
        expected_head_sha: dispatch.source.receipt.head_sha,
        reason: input.reason,
        session_id: input.session_id,
        new_claim_id: input.new_claim_id,
        source_worktree: input.source_worktree,
        gh_bin: input.gh_bin,
        git_bin: input.git_bin,
        merge_seal_path: input.merge_seal_path,
        checks_path: input.checks_path,
      });
    } catch (error) {
      return mapLifecycleError(error, 'cannot take over feedback repair');
    }
  }
  // A retry can carry a freshly generated CLI claim id after the existing
  // takeover already committed.  Recovery proves the successor from the
  // durable prepared proof and live reserving lease, never from that retry.
  return finalizeRepairDispatch(input, dispatch, 'taken_over', dispatch.recover_successor ? null : input.new_claim_id);
}

function dispatchedProofForCompletion(
  repoRoot: string,
  publicationId: string,
  repairId: string,
  gitBin: string,
): RepairDispatchProofV1 {
  const proof = readRepairDispatchProof(repoRoot, publicationId, repairId, gitBin);
  if (proof === null || proof.phase !== 'dispatched') {
    throw new FeedbackError('repair_not_dispatched', 'completed repair requires a dispatched repair proof');
  }
  return proof;
}

function assertCompletionSource(
  repoRoot: string,
  proof: RepairDispatchProofV1,
  gitBin: string,
): void {
  const source = cachedPublicationReceipt(repoRoot, proof.publication_id, gitBin);
  const material = materialForPublication(repoRoot, source, gitBin);
  if (
    publicationReceiptDigest(source) !== proof.receipt_sha256
    || source.task_id !== proof.task_id
    || source.task_revision !== proof.task_revision
    || source.claim_id !== proof.claim_id
    || source.generation !== proof.generation
    || source.head_sha !== proof.head_sha
    || material.feedback_revision !== proof.feedback_revision
    || material.reaction_token !== proof.before_reaction_token
  ) {
    throw new FeedbackError('repair_completion_unverified', 'source publication or feedback no longer matches the dispatched repair proof');
  }
}

function sameCompletionFacts(existing: ReactionAttemptReceiptV1, candidate: ReactionAttemptReceiptV1): boolean {
  return existing.publication_id === candidate.publication_id
    && existing.repair_id === candidate.repair_id
    && existing.completion_id === candidate.completion_id
    && existing.successor_claim_id === candidate.successor_claim_id
    && existing.successor_generation === candidate.successor_generation
    && existing.completion_publication_id === candidate.completion_publication_id
    && existing.completion_receipt_sha256 === candidate.completion_receipt_sha256
    && existing.completion_head_sha === candidate.completion_head_sha
    && existing.completion_ship_transaction_key === candidate.completion_ship_transaction_key
    && existing.before_reaction_token === candidate.before_reaction_token
    && existing.after_reaction_token === candidate.after_reaction_token
    && existing.outcome === candidate.outcome;
}

/**
 * The sole reaction-ledger write boundary.  It reads a dispatched proof and
 * an independently completed successor ship; caller-provided token and
 * attempt data have no role in this proof.
 */
export function recordCompletedFeedbackRepair(input: CompletedFeedbackRepairInput): ReactionAttemptReceiptV1 {
  const gitBin = input.git_bin ?? 'git';
  let initial: RepairDispatchProofV1;
  try {
    initial = dispatchedProofForCompletion(input.repo_root, input.publication_id, input.repair_id, gitBin);
  } catch (error) {
    return mapLifecycleError(error, 'cannot locate completed feedback repair dispatch proof');
  }
  try {
    return withTaskLock(input.repo_root, initial.task_id, () => {
      const proof = dispatchedProofForCompletion(input.repo_root, input.publication_id, input.repair_id, gitBin);
      assertCompletionSource(input.repo_root, proof, gitBin);
      if (
        proof.successor_claim_id === null
        || proof.successor_generation === null
        || proof.successor_state === null
      ) {
        throw new FeedbackError('repair_not_dispatched', 'dispatched repair proof has no successor');
      }
      const completion = currentReviewingPublication(input.repo_root, proof.task_id, gitBin);
      const pointer = sourcePointer(completion);
      if (
        completion.receipt.task_id !== proof.task_id
        || completion.receipt.task_revision !== proof.task_revision
        || completion.receipt.claim_id !== proof.successor_claim_id
        || completion.receipt.generation !== proof.successor_generation
        || completion.record.claim_id !== proof.successor_claim_id
        || completion.record.generation !== proof.successor_generation
      ) {
        throw new FeedbackError('repair_completion_unverified', 'current reviewing publication does not belong to the dispatched repair successor');
      }
      if (pointer.ship_transaction_key === proof.ship_transaction_key) {
        throw new FeedbackError('repair_completion_not_distinct', 'repair completion cannot reuse the source ship transaction');
      }
      try {
        verifyPublicationShipJournalComplete({
          repo_root: input.repo_root,
          receipt: completion.receipt,
          reviewing_record: completion.record,
          current_publication: pointer,
          git_bin: gitBin,
        });
      } catch (error) {
        throw new FeedbackError('repair_completion_unverified', 'repair completion ship journal is not verified complete', error);
      }
      const material = materialForPublication(input.repo_root, completion.receipt, gitBin);
      const completionId = deriveCompletionId({
        repair_id: proof.repair_id,
        successor_claim_id: proof.successor_claim_id,
        successor_generation: proof.successor_generation,
        completion_publication_id: completion.receipt.publication_id,
        completion_receipt_sha256: pointer.receipt_sha256,
        completion_head_sha: completion.receipt.head_sha,
        completion_ship_transaction_key: pointer.ship_transaction_key,
      });
      const candidate = buildReactionAttemptReceipt({
        publication_id: proof.publication_id,
        repair_id: proof.repair_id,
        successor_claim_id: proof.successor_claim_id,
        successor_generation: proof.successor_generation,
        completion_publication_id: completion.receipt.publication_id,
        completion_receipt_sha256: pointer.receipt_sha256,
        completion_head_sha: completion.receipt.head_sha,
        completion_ship_transaction_key: pointer.ship_transaction_key,
        before_reaction_token: proof.before_reaction_token,
        after_reaction_token: material.reaction_token,
        outcome: 'completed',
        recorded_at: input.recorded_at,
      });
      if (candidate.completion_id !== completionId) {
        throw new FeedbackError('repair_completion_unverified', 'completion receipt identity does not match its verified facts');
      }
      const existing = readReactionAttemptReceipts(input.repo_root, proof.publication_id, gitBin)
        .find((receipt) => receipt.completion_id === completionId);
      if (existing !== undefined) {
        if (!sameCompletionFacts(existing, candidate)) {
          throw new FeedbackError('reaction_receipt_conflict', 'existing completion receipt conflicts with verified completion facts');
        }
        return existing;
      }
      appendReactionAttemptReceipt(input.repo_root, proof.publication_id, candidate, gitBin);
      return candidate;
    });
  } catch (error) {
    return mapLifecycleError(error, 'cannot record completed feedback repair');
  }
}
