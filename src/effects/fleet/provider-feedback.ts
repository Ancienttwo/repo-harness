import { type TaskMessageClaim } from '../../core/messages/task-message-claim';
/** Manual GitHub feedback observation and durable intake. */
import { spawnSync } from 'child_process';

import { buildFeedbackDeliveryReceipt, buildFeedbackEvent, canonicalFeedbackDeliveryReceiptBytes, canonicalFeedbackEventBytes, canonicalReactionAttemptReceiptBytes, deriveFeedbackRevision, deriveReactionToken, projectRepairOffer, transitionFeedbackDeliveryReceipt, type FeedbackDeliveryTransitionInput, type FeedbackCheckConclusion, type FeedbackEventV1, type FeedbackFailingCheckV1, type FeedbackMergeability, type RepairOfferProjection } from '../../core/publication/feedback';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { withTaskLock } from '../locking/task-lock';
import { FeedbackStoreError, readFeedbackDeliveryReceipt, readFeedbackDeliveryReceipts, readFeedbackEvent, readFeedbackEvents, readReactionAttemptReceipts, writeFeedbackDeliveryReceipt, writeFeedbackEvent } from '../publication/feedback-store';
import { publicationSha256, stablePublicationJson } from '../../core/publication/publication-receipt';
import { MergeReadinessError, observeProviderReadinessIdentity, validatePullRequestSelection } from '../publication/merge-readiness';
import type { PullRequestSelectionV2 } from '../../core/publication/merge-readiness';
import { observeTaskInboxContext, type TaskInboxSessionSource } from './task-inbox';
import { readTaskAgent } from '../terminal/task-session';
import { observeActiveReviewAdmission } from '../admission/issue-goal';
import { readActiveReviewAdmission } from '../admission/admission-store';

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
  readonly selection: PullRequestSelectionV2;
  readonly source: TaskInboxSessionSource;
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

export interface FleetFeedbackProjection {
  readonly pending_count: number;
  readonly no_progress: boolean;
  readonly repair_actions: readonly never[];
  /** Event-set authority consumed by repair offers. */
  readonly feedback_revision: string;
  /** Digest of the publication, events, deliveries, and reaction attempts observed together. */
  readonly store_revision: string;
  readonly snapshot_consistency: 'stable' | 'changed_during_read';
}

export interface FleetFeedbackProjectionDependencies {
  readonly read_events: typeof readFeedbackEvents;
  readonly read_deliveries: typeof readFeedbackDeliveryReceipts;
  readonly read_reactions: typeof readReactionAttemptReceipts;
}

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

/** Explicit observed provider subject. This is not a publication receipt or authority. */
export interface FeedbackSubject {
  readonly publication_id: string;
  readonly selection: PullRequestSelectionV2;
  readonly task_id: string;
  readonly repository_id: string;
  readonly issue_id: string;
  readonly campaign_id: string;
  readonly claim: TaskMessageClaim;
  readonly admission_sha256: string;
  readonly head_sha: string;
  readonly base_sha: string;
  readonly pr_number: number;
}
interface CurrentPublicationSnapshot {
  readonly receipt: FeedbackSubject;
  readonly session_bytes: string;
  readonly assertCurrent: () => void;
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

function observeIdentity(receipt: FeedbackSubject, input: FeedbackObservationInput): ProviderIdentity {
  let selected: ReturnType<typeof observeProviderReadinessIdentity>;
  try { selected = observeProviderReadinessIdentity({ ...receipt.selection, repo_root: input.repo_root,
    gh_bin: input.gh_bin, gh_runner: input.gh_runner ? args => {
      const result = input.gh_runner!(args);
      if (result.error || result.status === null) throw providerFailure('provider identity observation failed', result.error);
      return { status: result.status, stdout: result.stdout, stderr: result.stderr };
    } : undefined });
  } catch (error) {
    if (!(error instanceof MergeReadinessError)) throw error;
    if (error.code === 'provider_unavailable') throw providerFailure(error.message, error);
    throw providerShape(error.message);
  }
  if (selected.state !== 'OPEN' && selected.state !== 'CLOSED' && selected.state !== 'MERGED') throw providerShape('provider PR state is unknown');
  const identity: ProviderIdentity = Object.freeze({ provider_repo_id: selected.provider_repo_id,
    pr_number: selected.pr_number, provider_url: selected.pr_url, state: selected.state, is_draft: selected.is_draft,
    head_sha: selected.head_sha, head_ref: selected.head_ref, base_sha: selected.base_sha, base_ref: selected.base_ref,
    mergeability: requiredMergeability(selected.mergeable) });
  return identity;
}

function requiredMergeability(value: unknown): FeedbackMergeability {
  if (value !== 'MERGEABLE' && value !== 'CONFLICTING') {
    throw providerShape('provider PR mergeStateStatus is unknown or unavailable');
  }
  return value;
}

function assertStableIdentity(identity: ProviderIdentity, receipt: FeedbackSubject): void {
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

function checkSuiteIds(identity: ProviderIdentity, receipt: FeedbackSubject, input: FeedbackObservationInput): readonly string[] {
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

function failedCheckEvents(identity: ProviderIdentity, receipt: FeedbackSubject, input: FeedbackObservationInput): readonly FeedbackEventV1[] {
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

function unresolvedReviewEvents(identity: ProviderIdentity, receipt: FeedbackSubject, input: FeedbackObservationInput): readonly FeedbackEventV1[] {
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
function changesRequestedReviewEvents(identity: ProviderIdentity, receipt: FeedbackSubject, input: FeedbackObservationInput): readonly FeedbackEventV1[] {
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
export function observeGitHubFeedback(receipt: FeedbackSubject, input: FeedbackObservationInput): readonly FeedbackEventV1[] {
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

export interface ShowGitHubFeedbackInput extends FeedbackIntakeInput {
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
 * feedback, delivery, reaction, or session surface.
 */
export function showGitHubFeedback(input: ShowGitHubFeedbackInput): ShowGitHubFeedbackResult {
  const gitBin = input.git_bin ?? 'git';
  const before = currentPublication(input);
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
  const after = currentPublication(input);
  if (stablePublicationJson(before.receipt) !== stablePublicationJson(after.receipt)
    || before.session_bytes !== after.session_bytes) {
    throw new FeedbackError('feedback_provider_incomplete', 'publication changed during provider feedback display observation');
  }
  return Object.freeze({
    provider_event_id: event.provider_event_id,
    provider_url: event.provider_url,
    body,
    untrusted: true as const,
  });
}

/** Read-only request preparation. References bind already-authorized inputs; they do not authenticate an actor. */
export function prepareFeedbackSubject(input: Omit<FeedbackIntakeInput, 'publication_id'>): FeedbackSubject {
  const selection = validatePullRequestSelection(input.selection);
  const session = observeTaskInboxContext({ repo_root: input.repo_root, source: input.source, task_id: input.source.session.task });
  if (selection.provider_repository_id !== session.identity.repository_id) throw new FeedbackError('publication_claim_mismatch', 'selected PR repository differs from admitted issue repository');
  if (selection.expected_head_sha !== session.head_revision) throw new FeedbackError('head_moved', 'selected PR head differs from current execution HEAD');
  const basis = { protocol: 2, kind: 'repo-harness-admitted-feedback-subject', selection,
    task_id: session.identity.task, repository_id: session.identity.repository_id, issue_id: session.identity.issue_id,
    campaign_id: session.identity.campaign_id, claim: session.identity.claim,
    admission_sha256: session.approval.admission_sha256 };
  return Object.freeze({ publication_id: publicationSha256(stablePublicationJson(basis)), selection,
    task_id: basis.task_id, repository_id: basis.repository_id, issue_id: basis.issue_id, campaign_id: basis.campaign_id,
    claim: basis.claim, admission_sha256: basis.admission_sha256,
    head_sha: selection.expected_head_sha, base_sha: selection.expected_base_sha, pr_number: selection.pr_number });
}

function currentPublication(input: FeedbackIntakeInput): CurrentPublicationSnapshot {
  const receipt = prepareFeedbackSubject(input);
  if (receipt.publication_id !== input.publication_id) throw new FeedbackError('publication_claim_mismatch', 'feedback subject differs from the explicit current admission and PR selection');
  assertStableIdentity(observeIdentity(receipt, input), receipt);
  const active = observeActiveReviewAdmission(input.source.authority.source);
  if (active.admission.admission_sha256 !== receipt.admission_sha256) throw new TornReadError('admission changed during feedback observation');
  const binding = readTaskAgent(input.repo_root, input.source.session.task, input.source.session.role);
  const sessionBytes = stablePublicationJson({ binding: binding.binding, grant_sha256: active.grant_sha256 });
  const assertCurrent = () => {
    const current = readActiveReviewAdmission({ ...input.source.authority.source, expectedGoal: active.admission.goal });
    const latest = readTaskAgent(input.repo_root, input.source.session.task, input.source.session.role);
    const head = spawnSync(input.git_bin ?? 'git', ['rev-parse', 'HEAD'], { cwd: latest.binding.execution_root, encoding: 'utf8' });
    if (head.status !== 0 || head.stdout.trim() !== receipt.head_sha) throw new TornReadError('execution HEAD changed during feedback observation');
    if (current.grant_sha256 !== active.grant_sha256 || current.admission.admission_sha256 !== receipt.admission_sha256
      || existsSync(join(latest.dir, 'closed.json')) || stablePublicationJson({ binding: latest.binding, grant_sha256: current.grant_sha256 }) !== sessionBytes) throw new TornReadError('admitted feedback session changed');
  };
  assertCurrent();
  return { receipt, session_bytes: sessionBytes, assertCurrent };
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
 * admitted session state before and after provider observation,
 * retries exactly once for either local or provider torn reads, and never
 * mutates session admission.
 */
export function intakeGitHubFeedback(input: FeedbackIntakeInput): FeedbackIntakeResult {
  let lastTorn: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let before: CurrentPublicationSnapshot;
    let events: readonly FeedbackEventV1[];
    try {
      before = currentPublication(input);
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
        before.assertCurrent();
        const persisted = persistObservedEvents(input, before, events);
        before.assertCurrent();
        return persisted;
      });
      return result;
    } catch (error) {
      if (error instanceof TornReadError) { lastTorn = error; continue; }
      if (error instanceof FeedbackError) throw error;
      throw new FeedbackError('feedback_incomplete', 'feedback intake failed', error);
    }
  }
  throw new FeedbackError('feedback_provider_incomplete', 'provider or local publication changed during both feedback observations', lastTorn);
}

/**
 * Project a repair offer entirely from durable feedback facts. This path reads
 * current admission and writes neither deliveries nor reactions.
 */
export function projectPendingFeedbackOffer(
  input: FeedbackIntakeInput,
): PendingFeedbackOffer {
  const gitBin = input.git_bin ?? 'git';
  let lastTorn: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return observeFeedbackProjection(input, gitBin, productionFleetFeedbackProjectionDependencies).projection;
    } catch (error) {
      if (error instanceof TornReadError) {
        lastTorn = error;
        continue;
      }
      if (error instanceof FeedbackError) throw error;
      if (error instanceof FeedbackStoreError) throw new FeedbackError(error.code, error.message, error);
      throw new FeedbackError('feedback_incomplete', 'feedback offer projection failed', error);
    }
  }
  throw new FeedbackError('feedback_incomplete', 'publication changed during both feedback offer projections', lastTorn);
}

interface FeedbackProjectionObservation {
  readonly projection: PendingFeedbackOffer;
  readonly pending_count: number;
  readonly feedback_revision: string;
  readonly store_revision: string;
}

const productionFleetFeedbackProjectionDependencies: FleetFeedbackProjectionDependencies = Object.freeze({
  read_events: readFeedbackEvents,
  read_deliveries: readFeedbackDeliveryReceipts,
  read_reactions: readReactionAttemptReceipts,
});

function observeFeedbackProjection(
  input: FeedbackIntakeInput,
  gitBin: string,
  dependencies: FleetFeedbackProjectionDependencies,
): FeedbackProjectionObservation {
  const before = currentPublication(input);
  const publicationId = before.receipt.publication_id;
  const events = dependencies.read_events(input.repo_root, publicationId, gitBin);
  const deliveries = dependencies.read_deliveries(input.repo_root, publicationId, gitBin);
  const reactions = dependencies.read_reactions(input.repo_root, publicationId, gitBin);
  const after = currentPublication(input);
  if (stablePublicationJson(before.receipt) !== stablePublicationJson(after.receipt)
    || before.session_bytes !== after.session_bytes) {
    throw new TornReadError('current publication changed during feedback projection');
  }

  const eventIds = new Set<string>();
  for (const event of events) {
    if (event.publication_id !== publicationId || event.head_sha !== before.receipt.head_sha) {
      throw new FeedbackError('feedback_unreadable', 'feedback event does not match the current publication head');
    }
    eventIds.add(event.provider_event_id);
  }
  const deliveryIds = new Set<string>();
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

  const feedbackRevision = deriveFeedbackRevision(events);
  let projection: PendingFeedbackOffer;
  if (events.length === 0) {
    projection = Object.freeze({ state: 'none', publication_id: publicationId });
  } else {
    const actionable = actionableFeedbackFacts(events);
    projection = projectRepairOffer({
      task_id: before.receipt.task_id,
      publication_id: publicationId,
      expected_claim: before.receipt.claim,
      admission_sha256: before.receipt.admission_sha256,
      expected_head_sha: before.receipt.head_sha,
      feedback_revision: feedbackRevision,
      reaction_token: deriveReactionToken({
        publication_id: publicationId,
        head_sha: before.receipt.head_sha,
        failing_checks: actionable.failing_checks,
        unresolved_review_thread_ids: actionable.unresolved_review_thread_ids,
        mergeability: actionable.mergeability,
      }),
      reaction_attempts: reactions,
    });
  }
  const storeRevision = publicationSha256(stablePublicationJson({
    publication_receipt: stablePublicationJson(before.receipt),
    admitted_session: before.session_bytes,
    events: events.map(canonicalFeedbackEventBytes),
    deliveries: deliveries.map(canonicalFeedbackDeliveryReceiptBytes),
    reactions: reactions.map(canonicalReactionAttemptReceiptBytes),
  }));
  return Object.freeze({ projection, pending_count: events.length, feedback_revision: feedbackRevision, store_revision: storeRevision });
}

function fleetFeedbackProjection(
  observation: FeedbackProjectionObservation,
  snapshotConsistency: FleetFeedbackProjection['snapshot_consistency'],
): FleetFeedbackProjection {
  const projection = observation.projection;
  return Object.freeze({
    pending_count: observation.pending_count,
    no_progress: projection.state === 'no_progress',
    repair_actions: Object.freeze(projection.state === 'offered' ? [...projection.offer.allowed_actions] : []),
    feedback_revision: observation.feedback_revision,
    store_revision: observation.store_revision,
    snapshot_consistency: snapshotConsistency,
  });
}

/**
 * Observe every Fleet feedback field from one store revision. Each attempt
 * compares two complete observations; one changed attempt is retried, and a
 * second change is published only as explicitly torn input.
 */
export function projectFleetFeedback(
  input: FeedbackIntakeInput,
  dependencyOverrides: Partial<FleetFeedbackProjectionDependencies> = {},
): FleetFeedbackProjection {
  const gitBin = input.git_bin ?? 'git';
  const dependencies = { ...productionFleetFeedbackProjectionDependencies, ...dependencyOverrides };
  let latest: FeedbackProjectionObservation | null = null;
  let lastTorn: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const before = observeFeedbackProjection(input, gitBin, dependencies);
      const after = observeFeedbackProjection(input, gitBin, dependencies);
      latest = after;
      if (before.store_revision === after.store_revision) return fleetFeedbackProjection(after, 'stable');
      lastTorn = new TornReadError('feedback store changed during Fleet projection');
    } catch (error) {
      if (error instanceof TornReadError || (error instanceof FeedbackError && error.code === 'feedback_incomplete' && attempt === 0)) {
        lastTorn = error;
        continue;
      }
      if (error instanceof FeedbackError) throw error;
      if (error instanceof FeedbackStoreError) throw new FeedbackError(error.code, error.message, error);
      throw new FeedbackError('feedback_incomplete', 'Fleet feedback projection failed', error);
    }
  }
  if (latest !== null) return fleetFeedbackProjection(latest, 'changed_during_read');
  throw new FeedbackError('feedback_incomplete', 'feedback store changed during both Fleet projections', lastTorn);
}

/**
 * Advance one delivery receipt under the publication task lock. Delivery is
 * notification evidence only; it cannot authorize a repair or change session admission.
 */
export function transitionFeedbackDelivery(
  input: FeedbackIntakeInput & {
    readonly provider_event_id: string;
    readonly transition: FeedbackDeliveryTransitionInput;
  },
) {
  const gitBin = input.git_bin ?? 'git';
  const snapshot = currentPublication(input);
  try {
    return withTaskLock(input.repo_root, snapshot.receipt.task_id, () => {
      snapshot.assertCurrent();
      const current = snapshot;
      const receipt = readFeedbackDeliveryReceipt(input.repo_root, current.receipt.publication_id, input.provider_event_id, gitBin);
      if (receipt === null) throw new FeedbackError('feedback_unreadable', 'feedback delivery receipt is unavailable');
      const next = transitionFeedbackDeliveryReceipt(receipt, input.transition);
      writeFeedbackDeliveryReceipt(input.repo_root, current.receipt.publication_id, next, gitBin);
      snapshot.assertCurrent();
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
