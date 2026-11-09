/**
 * The only automated merge path to the default branch.
 *
 * Every step before the mutation reads; a refusal at any step sends no merge
 * request. The mutation is sent once. When the base requires a merge queue,
 * the mutation enqueues the PR instead, and the executor waits for the queue
 * to merge or remove it. After it is sent, the result is a
 * rejection only when an error response is followed by a readback of the PR
 * still open at the expected head, and a merge only when the merge commit has
 * the expected parents: the expected base for a squash, the expected base and
 * head for a batch merge commit, and for a queue squash one parent that is the
 * expected base or a descendant of it. A queue removal is a rejection. Everything else is an unknown outcome. The executor
 * never resends the merge request; only the provider readback repeats, inside
 * a bounded window, because a merge response can arrive before the read model
 * shows the merge.
 */

import { spawnSync } from 'child_process';
import {
  PUBLICATION_POLICY_PATH,
  parsePublicationPolicy,
  policyFileFromContents,
  publicationPolicyChanged,
  type PolicyFileAtRef,
  type PublicationPolicy,
} from '../../core/publication/acceptance-merge-policy';
import { checkClosingReferences, type ClosingIssueReference } from '../../core/publication/closing-references';
import { BATCH_COMMIT_LIMIT, BATCH_REF, batchMemberMerges, type MergeReadinessBlockerV1 } from '../../core/publication/merge-readiness';
import {
  MergeReadinessError,
  collectPullRequestMergeReadiness,
  validatePullRequestSelection,
  type PullRequestReadinessInput,
} from './merge-readiness';

export { PUBLICATION_POLICY_PATH };

export type PublicationMergeRefusalCode =
  | 'invalid_selection'
  | 'provider_unavailable'
  | 'provider_data_incomplete'
  | 'cross_repository_pr'
  | 'auto_merge_enabled'
  | 'publication_policy_invalid'
  | 'publication_policy_changed_in_pr'
  | 'base_protection_insufficient'
  | 'merge_readiness_blocked'
  | 'pr_changed_after_readiness'
  | 'closing_references_incomplete'
  | 'closing_references_mismatch'
  | 'batch_ref_invalid'
  | 'batch_has_own_commit'
  | 'merge_queue_entry_exists';

export type PublicationMergeErrorCode =
  | 'acceptance_merge_off'
  | PublicationMergeRefusalCode
  | 'merge_outcome_unknown'
  | 'provider_rejected'
  | 'merge_queue_removed';

export interface PublicationMergeDocument {
  readonly protocol: 1;
  readonly kind: 'repo-harness-publication-merge';
  readonly repository: string;
  readonly provider_repository_id: string;
  readonly pr: number;
  readonly head_sha: string;
  readonly base_ref: string;
  readonly base_sha: string;
  readonly merge_commit_sha: string;
  /** The first parent: the mainline that `git revert -m 1` keeps. The expected base, or a descendant of it after a merge queue. */
  readonly parent_sha: string;
  /** Batch only: both proven parents, `[expected base, expected head]`. */
  readonly parent_shas?: readonly [string, string];
  readonly policy_ref: string;
  readonly revert: string;
  /** GraphQL errors that came with a merge the readback proved. */
  readonly provider_errors?: string;
  /** Present when the merge went through the base branch's merge queue. */
  readonly merge_queue_entry?: string;
}

export interface PublicationMergeFailure {
  readonly ok: false;
  readonly exit_code: 3 | 4 | 5 | 6;
  readonly error: PublicationMergeErrorCode;
  readonly blockers?: readonly MergeReadinessBlockerV1[];
  readonly message: string;
}

export type PublicationMergeResult =
  | { readonly exit_code: 0; readonly document: PublicationMergeDocument }
  | { readonly exit_code: 3 | 4 | 5 | 6; readonly document: PublicationMergeFailure };

class Refusal extends Error {
  constructor(
    readonly code: Exclude<PublicationMergeErrorCode, 'merge_outcome_unknown' | 'provider_rejected' | 'merge_queue_removed'>,
    message: string,
    readonly blockers?: readonly MergeReadinessBlockerV1[],
  ) {
    super(message);
    this.name = 'PublicationMergeRefusal';
  }
}

class UnknownOutcome extends Error {}

/** The queue dropped the PR without a merge: a failed queue check, a conflict or a manual removal. */
class QueueRemoved extends Error {}

const PROVIDER_TIMEOUT_MS = 30_000;
const SHA = /^[0-9a-f]{40}$/u;
/** Post-merge readback window. It reuses the provider-call bound; a read model can lag the merge response. */
const READBACK_WINDOW_MS = PROVIDER_TIMEOUT_MS;
const READBACK_FIRST_DELAY_MS = 250;
const READBACK_MAX_DELAY_MS = 4_000;

/** Deterministic backoff: the delays sum to the bounded window, with no wall-clock dependence. */
function readbackDelays(windowMs: number): readonly number[] {
  const delays: number[] = [];
  let remaining = windowMs;
  let delay = READBACK_FIRST_DELAY_MS;
  while (remaining > 0) {
    const next = Math.min(delay, remaining);
    delays.push(next);
    remaining -= next;
    delay = Math.min(delay * 2, READBACK_MAX_DELAY_MS);
  }
  return delays;
}
const READBACK_DELAYS_MS = readbackDelays(READBACK_WINDOW_MS);
/** A queue entry waits for the full Required / CI run of its group; the CI test job alone may take 60 minutes. */
const QUEUE_WINDOW_MS = 90 * 60_000;
const QUEUE_POLL_MS = 30_000;
const QUEUE_CONFIRM_MS = 5_000;

type PublicationMergeInput = PullRequestReadinessInput & {
  /** `--batch`: merge an `integration/<parent>-batch-<n>` PR with a two-parent merge commit instead of a squash. */
  readonly batch?: boolean;
  // The executor's own test seam; the CLI and MCP never set it.
  readonly readback_wait?: (milliseconds: number) => void;
  readonly readback_now?: () => number;
  readonly readback_timeout?: (milliseconds: number) => void;
  /** Called once when the PR is in the merge queue, before the wait for its merge. */
  readonly on_queued?: (entry: MergeQueueEntry) => void;
};

export interface MergeQueueEntry {
  readonly id: string;
  readonly state: string;
  readonly position: number | null;
}

function waitForReadback(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

interface ProviderResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly failure?: string;
}

/** Every call names github.com and the repository; nothing depends on the current directory's remote. */
function runGh(input: PullRequestReadinessInput, args: readonly string[], timeoutMs = PROVIDER_TIMEOUT_MS): ProviderResult {
  const full = args[0] === 'api' ? [...args, '--hostname', 'github.com'] : [...args];
  const injected = input.gh_runner?.(full);
  if (injected) return { status: injected.status, stdout: injected.stdout, stderr: injected.stderr ?? '' };
  const result = spawnSync(input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh', full, {
    cwd: input.repo_root,
    env: { ...process.env, GH_HOST: 'github.com' },
    encoding: 'utf-8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  });
  const failure = result.error?.message ?? (result.signal ? `terminated by ${result.signal}` : undefined);
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', ...(failure ? { failure } : {}) };
}

function describeCall(args: readonly string[], result: ProviderResult): string {
  const detail = (result.failure ?? result.stderr ?? '').trim() || `exit ${result.status}`;
  return `gh ${args[0]} ${args[0] === 'api' && args[1] === 'graphql' ? 'graphql' : args[1]}: ${detail}`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A read before the mutation. `notFound` lets a caller handle a provider 404. */
function read(input: PullRequestReadinessInput, args: readonly string[]): unknown;
function read(input: PullRequestReadinessInput, args: readonly string[], notFound: true): unknown | null;
function read(input: PullRequestReadinessInput, args: readonly string[], notFound = false): unknown {
  const result = runGh(input, args);
  if (result.failure || result.status === null) throw new Refusal('provider_unavailable', describeCall(args, result));
  const value = parseJson(result.stdout);
  if (result.status !== 0) {
    if (notFound && result.status === 1 && isObject(value) && value.status === '404') return null;
    throw new Refusal('provider_unavailable', describeCall(args, result));
  }
  if (value === undefined) throw new Refusal('provider_data_incomplete', `provider returned invalid JSON: ${describeCall(args, result)}`);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function field(value: unknown, label: string): Record<string, unknown> {
  if (!isObject(value)) throw new Refusal('provider_data_incomplete', `${label} must be an object`);
  return value;
}

interface MergeTarget {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly state: string;
  readonly is_cross_repository: boolean;
  /** null when the provider omits the field; that fails closed like an enabled queue. */
  readonly merge_queue_enabled: boolean | null;
  readonly auto_merge_enabled: boolean;
  readonly in_merge_queue: boolean;
  readonly head_sha: string;
  readonly head_ref: string;
  readonly base_sha: string;
  readonly base_ref: string;
  readonly closing_references: readonly ClosingIssueReference[];
  readonly closing_has_next_page: boolean;
}

const TARGET_QUERY = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){nameWithOwner pullRequest(number:$number){id number title body state isCrossRepository headRefOid headRefName baseRefOid baseRefName isMergeQueueEnabled mergeQueueEntry{id} autoMergeRequest{enabledAt} closingIssuesReferences(first:100){pageInfo{hasNextPage} nodes{number repository{nameWithOwner}}}}}}';

/** One read of the PR fields the executor owns: fork, auto-merge, message text and closing links. */
function readMergeTarget(input: PullRequestReadinessInput): MergeTarget {
  const [owner, name] = input.repository.split('/');
  const graph = field(read(input, ['api', 'graphql', '-f', `query=${TARGET_QUERY}`,
    '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${input.pr_number}`]), 'provider GraphQL result');
  if (graph.errors !== undefined) throw new Refusal('provider_data_incomplete', 'provider PR query has errors');
  const repository = field(field(graph.data, 'provider GraphQL data').repository, 'provider repository');
  const pr = field(repository.pullRequest, 'provider PR');
  const closing = field(pr.closingIssuesReferences, 'provider closingIssuesReferences');
  const pageInfo = field(closing.pageInfo, 'provider closingIssuesReferences pageInfo');
  if (repository.nameWithOwner !== input.repository || pr.number !== input.pr_number
    || typeof pr.id !== 'string' || pr.id === '' || typeof pr.title !== 'string' || typeof pr.body !== 'string'
    || !['OPEN', 'CLOSED', 'MERGED'].includes(String(pr.state)) || typeof pr.isCrossRepository !== 'boolean'
    || typeof pr.headRefOid !== 'string' || typeof pr.headRefName !== 'string' || pr.headRefName === ''
    || typeof pr.baseRefOid !== 'string' || typeof pr.baseRefName !== 'string' || pr.baseRefName === ''
    || (pr.autoMergeRequest !== null && !isObject(pr.autoMergeRequest))
    || (pr.mergeQueueEntry !== null && !isObject(pr.mergeQueueEntry))
    || typeof pageInfo.hasNextPage !== 'boolean' || !Array.isArray(closing.nodes)) {
    throw new Refusal('provider_data_incomplete', 'provider PR identity is incomplete');
  }
  const references = closing.nodes.map((entry) => {
    const node = field(entry, 'provider closing reference');
    const nameWithOwner = field(node.repository, 'provider closing reference repository').nameWithOwner;
    if (!Number.isSafeInteger(node.number) || Number(node.number) < 1 || typeof nameWithOwner !== 'string' || nameWithOwner === '') {
      throw new Refusal('provider_data_incomplete', 'provider closing reference is incomplete');
    }
    return { repository: nameWithOwner, number: Number(node.number) };
  });
  return {
    id: pr.id,
    title: pr.title,
    body: pr.body,
    state: String(pr.state),
    is_cross_repository: pr.isCrossRepository,
    merge_queue_enabled: typeof pr.isMergeQueueEnabled === 'boolean' ? pr.isMergeQueueEnabled : null,
    auto_merge_enabled: pr.autoMergeRequest !== null,
    in_merge_queue: pr.mergeQueueEntry !== null,
    head_sha: pr.headRefOid,
    head_ref: pr.headRefName,
    base_sha: pr.baseRefOid,
    base_ref: pr.baseRefName,
    closing_references: references,
    closing_has_next_page: pageInfo.hasNextPage,
  };
}

function assertSameRepositoryTarget(target: MergeTarget): void {
  if (target.is_cross_repository) throw new Refusal('cross_repository_pr', 'the executor merges only same-repository PRs');
  if (target.auto_merge_enabled) throw new Refusal('auto_merge_enabled', 'the PR has an auto-merge request');
  if (target.in_merge_queue) throw new Refusal('merge_queue_entry_exists', 'the PR is already in the merge queue; the executor did not enqueue it');
}

/**
 * The compare response also carries file patches, which grow with the diff and
 * overflow the spawn buffer. gh applies this filter, so stdout holds only the
 * commit list and its parents.
 */
const BATCH_COMPARE_JQ = '{total_commits, commits: [.commits[] | {sha, parents: [.parents[] | {sha}]}]}';

function assertBatchRef(target: MergeTarget): void {
  if (!BATCH_REF.test(target.head_ref)) {
    throw new Refusal('batch_ref_invalid', `--batch needs a head ref integration/<parent>-batch-<n>; the PR head ref is ${target.head_ref}`);
  }
}

/** Every commit in expected base..expected head, keyed by SHA, with its parent SHAs. */
function readBatchCommits(input: PullRequestReadinessInput): ReadonlyMap<string, readonly string[]> {
  const compare = field(read(input, ['api',
    `repos/${input.repository}/compare/${input.expected_base_sha}...${input.expected_head_sha}?per_page=${BATCH_COMMIT_LIMIT}`,
    '--jq', BATCH_COMPARE_JQ]), 'provider compare');
  const commits = compare.commits;
  if (!Array.isArray(commits) || !Number.isSafeInteger(compare.total_commits) || commits.length !== compare.total_commits) {
    throw new Refusal('provider_data_incomplete',
      `provider compare did not list every commit in base..head (at most ${BATCH_COMMIT_LIMIT} are read)`);
  }
  const graph = new Map<string, readonly string[]>();
  for (const entry of commits) {
    const commit = field(entry, 'provider compare commit');
    const parents = Array.isArray(commit.parents) ? commit.parents.map((parent) => isObject(parent) ? parent.sha : undefined) : [];
    if (typeof commit.sha !== 'string' || !SHA.test(commit.sha) || parents.length === 0
      || !parents.every((sha): sha is string => typeof sha === 'string' && SHA.test(sha))) {
      throw new Refusal('provider_data_incomplete', 'provider compare commit is incomplete');
    }
    graph.set(commit.sha, parents);
  }
  return graph;
}

/** The batch adds no commit of its own (`batchMemberMerges`). */
function assertBatchHasNoOwnCommit(input: PullRequestReadinessInput): void {
  const chain = batchMemberMerges(input.expected_base_sha, input.expected_head_sha, readBatchCommits(input));
  if (chain.status === 'leaves_range') {
    throw new Refusal('batch_has_own_commit',
      `the batch first-parent chain leaves base..head at ${chain.sha} instead of reaching the expected base ${input.expected_base_sha}`);
  }
  if (chain.status === 'not_member_merge') {
    throw new Refusal('batch_has_own_commit',
      `commit ${chain.sha} on the batch first-parent chain is not a two-parent member merge (parents: ${chain.parent_count})`);
  }
  if (chain.status === 'cycle') throw new Refusal('provider_data_incomplete', 'provider compare commits form a cycle');
}

function readPolicyAt(input: PullRequestReadinessInput, ref: string): PolicyFileAtRef {
  const value = read(input, ['api', `repos/${input.repository}/contents/${PUBLICATION_POLICY_PATH}?ref=${ref}`], true);
  if (value === null) return { status: 'missing' };
  const file = policyFileFromContents(field(value, 'policy file'));
  if (file === null) throw new Refusal('publication_policy_invalid', `${PUBLICATION_POLICY_PATH} at ${ref} is not a readable file`);
  return file;
}

interface RepositorySettings {
  readonly default_branch: string;
  /** The queue composes its squash message from these settings; the executor sends no message to it. */
  readonly squash_title: unknown;
  readonly squash_message: unknown;
}

function readRepository(input: PullRequestReadinessInput): RepositorySettings {
  const repository = field(read(input, ['api', `repos/${input.repository}`]), 'REST repository');
  if (String(repository.id) !== input.provider_repository_id || repository.full_name !== input.repository
    || typeof repository.default_branch !== 'string' || repository.default_branch === '') {
    throw new Refusal('provider_data_incomplete', 'provider repository does not match the selection');
  }
  return { default_branch: repository.default_branch,
    squash_title: repository.squash_merge_commit_title, squash_message: repository.squash_merge_commit_message };
}

/**
 * The ruleset and the PR field must agree. A queue that no readable ruleset sets
 * has an unknown merge method, so it is refused like an unreported one.
 */
function assertQueueState(target: MergeTarget, queueRule: boolean): void {
  if (target.merge_queue_enabled === null) {
    throw new Refusal('base_protection_insufficient', 'the provider did not report whether the base branch requires a merge queue');
  }
  if (target.merge_queue_enabled !== queueRule) {
    throw new Refusal('base_protection_insufficient', queueRule
      ? 'the branch rules require a merge queue, but the PR does not report one'
      : 'the base branch requires a merge queue that no readable ruleset sets');
  }
}

/**
 * The queue squashes with the repository's default message. Only the PR title and
 * body make that message the one the closing-reference check reads.
 */
function assertQueueMessage(settings: RepositorySettings): void {
  if (settings.squash_title !== 'PR_TITLE' || settings.squash_message !== 'PR_BODY') {
    throw new Refusal('base_protection_insufficient',
      'a merge queue squash needs the repository default squash message PR_TITLE and PR_BODY');
  }
}

/**
 * D7: GitHub pins only the head. Without a queue, strict status checks turn a moved
 * base into a provider-side rejection. With a squash merge queue, the queue tests
 * the PR on the current base, so strict checks are not needed. Returns whether the
 * base requires the queue.
 */
function assertBaseProtection(input: PublicationMergeInput, branch: string, target: MergeTarget): boolean {
  const root = `repos/${input.repository}/branches/${encodeURIComponent(branch)}`;
  const value = read(input, ['api', `${root}/protection`], true);
  if (value === null) {
    throw new Refusal('base_protection_insufficient',
      `the protection endpoint for ${branch} returned 404: protection is absent or the token cannot read it (needs Administration read)`);
  }
  const protection = field(value, 'branch protection');
  const checks = protection.required_status_checks;
  const admins = protection.enforce_admins;
  if (!isObject(checks) || !isObject(admins) || admins.enabled !== true) {
    throw new Refusal('base_protection_insufficient', `${branch} protection must require status checks and enforce_admins`);
  }
  const rules = read(input, ['api', `repos/${input.repository}/rules/branches/${encodeURIComponent(branch)}?per_page=100`]);
  if (!Array.isArray(rules) || rules.length >= 100) throw new Refusal('provider_data_incomplete', 'branch rules were not exhaustively observed');
  if (rules.some((rule) => !isObject(rule) || typeof rule.type !== 'string')) {
    throw new Refusal('provider_data_incomplete', 'branch rule is incomplete');
  }
  const queueRules = (rules as Record<string, unknown>[]).filter((rule) => rule.type === 'merge_queue');
  if (queueRules.length > 1) throw new Refusal('base_protection_insufficient', `${branch} has more than one merge queue rule`);
  const queue = queueRules.length === 1;
  assertQueueState(target, queue);
  if (!queue) {
    if (checks.strict !== true) throw new Refusal('base_protection_insufficient', `${branch} protection must require strict status checks`);
    return false;
  }
  const parameters = queueRules[0]!.parameters;
  if (!isObject(parameters) || parameters.merge_method !== 'SQUASH') {
    throw new Refusal('base_protection_insufficient', `the ${branch} merge queue must merge with the SQUASH method`);
  }
  // ALLGREEN gives each entry its own merge_group run on the commit that becomes its merge commit.
  if (parameters.grouping_strategy !== 'ALLGREEN') {
    throw new Refusal('base_protection_insufficient', `the ${branch} merge queue must use the ALLGREEN grouping strategy`);
  }
  if (input.batch) {
    throw new Refusal('base_protection_insufficient', `--batch needs a two-parent merge commit; the ${branch} merge queue squashes`);
  }
  return true;
}

interface BasePolicy {
  readonly policy: PublicationPolicy & { readonly ok: true };
  /** The base file itself, so readiness reuses this read instead of a second one. */
  readonly file: PolicyFileAtRef;
}

function readPolicy(input: PullRequestReadinessInput): BasePolicy {
  const file = readPolicyAt(input, input.expected_base_sha);
  const base = parsePublicationPolicy(file);
  if (!base.ok) throw new Refusal('publication_policy_invalid', `${PUBLICATION_POLICY_PATH} at ${input.expected_base_sha}: ${base.message}`);
  if (base.acceptance_merge === 'off') {
    throw new Refusal('acceptance_merge_off', `publication.acceptance_merge is off at base ${input.expected_base_sha}`);
  }
  if (publicationPolicyChanged(base, readPolicyAt(input, input.expected_head_sha))) {
    throw new Refusal('publication_policy_changed_in_pr', 'the PR changes the publication policy subtree');
  }
  return { policy: base, file };
}

const mergeMutation = (method: 'SQUASH' | 'MERGE') => `mutation($pullRequestId:ID!,$expectedHeadOid:GitObjectID!,$commitHeadline:String!,$commitBody:String!){mergePullRequest(input:{pullRequestId:$pullRequestId,expectedHeadOid:$expectedHeadOid,mergeMethod:${method},commitHeadline:$commitHeadline,commitBody:$commitBody}){pullRequest{number state mergeCommit{oid}}}}`;

type MutationOutcome = { readonly merged: string } | { readonly provider_errors: string };

/** Sent once. An error response is not proof of a rejection; the caller reads the PR back. */
function sendMerge(input: PublicationMergeInput, target: MergeTarget, headline: string): MutationOutcome {
  // -f keeps every value a raw string; -F would read a body that starts with "@" as a file.
  const args = ['api', 'graphql', '-f', `query=${mergeMutation(input.batch ? 'MERGE' : 'SQUASH')}`, '-f', `pullRequestId=${target.id}`,
    '-f', `expectedHeadOid=${input.expected_head_sha}`, '-f', `commitHeadline=${headline}`, '-f', `commitBody=${target.body}`];
  const result = runGh(input, args);
  if (result.failure || result.status === null) throw new UnknownOutcome(`merge request did not complete: ${describeCall(args, result)}`);
  const value = parseJson(result.stdout);
  if (!isObject(value)) throw new UnknownOutcome(`merge response is not a JSON object: ${describeCall(args, result)}`);
  if (value.errors !== undefined && !(Array.isArray(value.errors) && value.errors.length === 0)) {
    return { provider_errors: JSON.stringify(value.errors) };
  }
  const payload = isObject(value.data) ? value.data.mergePullRequest : undefined;
  if (result.status !== 0) throw new UnknownOutcome(`merge request failed: ${describeCall(args, result)}`);
  const pr = isObject(payload) ? payload.pullRequest : undefined;
  const commit = isObject(pr) ? pr.mergeCommit : undefined;
  if (!isObject(pr) || pr.state !== 'MERGED' || pr.number !== input.pr_number || !isObject(commit)
    || typeof commit.oid !== 'string' || !SHA.test(commit.oid)) {
    throw new UnknownOutcome('merge response is incomplete');
  }
  return { merged: commit.oid };
}

const ENQUEUE_MUTATION = 'mutation($pullRequestId:ID!,$expectedHeadOid:GitObjectID!){enqueuePullRequest(input:{pullRequestId:$pullRequestId,expectedHeadOid:$expectedHeadOid}){mergeQueueEntry{id state position}}}';

function queueEntry(value: unknown): MergeQueueEntry | null {
  if (!isObject(value) || typeof value.id !== 'string' || value.id === '' || typeof value.state !== 'string'
    || (value.position !== null && !Number.isSafeInteger(value.position))) return null;
  return { id: value.id, state: value.state, position: value.position as number | null };
}

/** Sent once, like the merge. An error response is not proof of a rejection; the caller reads the PR back. */
function sendEnqueue(input: PublicationMergeInput, target: MergeTarget): { readonly queued: MergeQueueEntry } | { readonly provider_errors: string } {
  const args = ['api', 'graphql', '-f', `query=${ENQUEUE_MUTATION}`, '-f', `pullRequestId=${target.id}`,
    '-f', `expectedHeadOid=${input.expected_head_sha}`];
  const result = runGh(input, args);
  if (result.failure || result.status === null) throw new UnknownOutcome(`enqueue request did not complete: ${describeCall(args, result)}`);
  const value = parseJson(result.stdout);
  if (!isObject(value)) throw new UnknownOutcome(`enqueue response is not a JSON object: ${describeCall(args, result)}`);
  if (value.errors !== undefined && !(Array.isArray(value.errors) && value.errors.length === 0)) {
    return { provider_errors: JSON.stringify(value.errors) };
  }
  if (result.status !== 0) throw new UnknownOutcome(`enqueue request failed: ${describeCall(args, result)}`);
  const payload = isObject(value.data) ? value.data.enqueuePullRequest : undefined;
  const entry = queueEntry(isObject(payload) ? payload.mergeQueueEntry : undefined);
  if (entry === null) throw new UnknownOutcome('enqueue response is incomplete');
  return { queued: entry };
}

const QUEUE_READBACK_QUERY = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number state headRefOid mergeCommit{oid} mergeQueueEntry{id state position}}}}';

type QueueObservation =
  | { readonly state: 'queued'; readonly entry: MergeQueueEntry }
  | { readonly state: 'removed' }
  | { readonly state: 'merged'; readonly merge_commit_sha: string }
  | { readonly state: 'unreadable'; readonly evidence: string };

/** One queue read. A PR that moved its head or closed is an unknown outcome: the queue drops a pushed PR. */
function observeQueue(input: PublicationMergeInput, timeoutMs: number): QueueObservation {
  const [owner, name] = input.repository.split('/');
  const args = ['api', 'graphql', '-f', `query=${QUEUE_READBACK_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${input.pr_number}`];
  const read = readbackValue(input, args, timeoutMs);
  if (!read.ok) return { state: 'unreadable', evidence: read.failure };
  const repository = isObject(read.value.data) ? read.value.data.repository : undefined;
  const pr = isObject(repository) ? repository.pullRequest : undefined;
  if (!isObject(pr) || pr.number !== input.pr_number) return { state: 'unreadable', evidence: 'queue readback has no PR' };
  const evidence = `queue readback: state=${String(pr.state)} head=${String(pr.headRefOid)}`;
  if (pr.state === 'MERGED') {
    const commit = isObject(pr.mergeCommit) ? pr.mergeCommit.oid : undefined;
    if (typeof commit === 'string' && SHA.test(commit)) return { state: 'merged', merge_commit_sha: commit };
    return { state: 'unreadable', evidence };
  }
  if (pr.state !== 'OPEN' || pr.headRefOid !== input.expected_head_sha) throw new UnknownOutcome(`the PR left the queue without a merge: ${evidence}`);
  if (pr.mergeQueueEntry === null) return { state: 'removed' };
  const entry = queueEntry(pr.mergeQueueEntry);
  return entry === null ? { state: 'unreadable', evidence } : { state: 'queued', entry };
}

/**
 * Polls until the queue merges or ends the acknowledged entry. A missing entry or
 * an entry with another id ends this operation: a merge after a re-enqueue is
 * not this executor's merge. One confirming read follows, because the provider
 * can clear the entry before it shows the merge. Only reads repeat; nothing is
 * re-enqueued.
 */
function awaitQueue(input: PublicationMergeInput, entryId: string): string {
  const now = input.readback_now ?? Date.now;
  const wait = input.readback_wait ?? waitForReadback;
  const deadline = now() + QUEUE_WINDOW_MS;
  let last = 'no queue readback';
  /** Set by a read that showed no entry; the next read confirms the removal. */
  let removed = false;
  for (;;) {
    const remaining = deadline - now();
    if (remaining <= 0) throw new UnknownOutcome(`the merge queue did not merge or remove the PR within ${QUEUE_WINDOW_MS} ms; last ${last}`);
    const observation = observeQueue(input, Math.min(remaining, PROVIDER_TIMEOUT_MS));
    if (observation.state === 'merged') return observation.merge_commit_sha;
    if (observation.state === 'unreadable') {
      last = observation.evidence;
    } else if (observation.state === 'queued' && observation.entry.id === entryId) {
      last = `queue entry ${entryId}: ${observation.entry.state}`;
      removed = false;
    } else if (observation.state === 'queued') {
      throw new QueueRemoved(`queue entry ${observation.entry.id} replaced queue entry ${entryId}`);
    } else {
      if (removed) throw new QueueRemoved(`queue entry ${entryId} was removed without a merge`);
      last = `queue entry ${entryId} removed`;
      removed = true;
    }
    wait(Math.min(removed ? QUEUE_CONFIRM_MS : QUEUE_POLL_MS, Math.max(deadline - now(), 0)));
  }
}

type ErrorReadback = { readonly state: 'open' } | { readonly state: 'merged'; readonly merge_commit_sha: string };

/** After an error response: OPEN at the expected head proves no merge; MERGED needs the normal proof. */
function readBackAfterError(input: PullRequestReadinessInput): ErrorReadback {
  const args = ['api', `repos/${input.repository}/pulls/${input.pr_number}`];
  const result = runGh(input, args);
  const pr = result.failure || result.status !== 0 ? undefined : parseJson(result.stdout);
  if (!isObject(pr)) throw new UnknownOutcome(`PR readback after the error response failed: ${describeCall(args, result)}`);
  const head = isObject(pr.head) ? pr.head.sha : undefined;
  if (pr.number === input.pr_number && pr.state === 'open' && pr.merged === false && head === input.expected_head_sha) return { state: 'open' };
  if (pr.number === input.pr_number && pr.merged === true && typeof pr.merge_commit_sha === 'string' && SHA.test(pr.merge_commit_sha)) {
    return { state: 'merged', merge_commit_sha: pr.merge_commit_sha };
  }
  throw new UnknownOutcome(`PR readback after the error response is neither open at the expected head nor merged: ${prReadbackEvidence(pr)}`);
}

function prReadbackEvidence(pr: Record<string, unknown>): string {
  const head = isObject(pr.head) ? pr.head.sha : undefined;
  const base = isObject(pr.base) ? pr.base.ref : undefined;
  return `PR readback: state=${String(pr.state)} merged=${String(pr.merged)} merge_commit_sha=${String(pr.merge_commit_sha)} head=${String(head)} base=${String(base)}`;
}

type ProofAttempt =
  | { readonly kind: 'proven' }
  /** The read model is behind; the same proof can succeed on a later read. */
  | { readonly kind: 'pending'; readonly evidence: string; readonly pr?: string }
  /** A provider answer that a later read cannot turn into the expected proof. */
  | { readonly kind: 'contradiction'; readonly evidence: string };

type ReadbackValue =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly failure: string };

function readbackValue(input: PublicationMergeInput, args: readonly string[], timeoutMs: number): ReadbackValue {
  const result = runGh(input, args, timeoutMs);
  const value = result.failure || result.status !== 0 ? undefined : parseJson(result.stdout);
  return isObject(value) ? { ok: true, value } : { ok: false, failure: `readback failed: ${describeCall(args, result)}` };
}

/** A squash has the expected base as its only parent; a batch merge commit has the expected base, then the expected head. */
function expectedParents(input: PublicationMergeInput): readonly string[] {
  return input.batch ? [input.expected_base_sha, input.expected_head_sha] : [input.expected_base_sha];
}

/** A queue squash has one parent: the queue's base, which is the expected base or a descendant of it. */
function queueParentProof(input: PublicationMergeInput, commit: Record<string, unknown>, timeoutMs: number): ProofAttempt & { readonly parent?: string } {
  const parents = commit.parents;
  const parent = Array.isArray(parents) && parents.length === 1 && isObject(parents[0]) ? parents[0].sha : undefined;
  if (typeof parent !== 'string' || !SHA.test(parent)) {
    return { kind: 'contradiction', evidence: `queue commit ${String(commit.sha)} does not have exactly one parent` };
  }
  if (parent === input.expected_base_sha) return { kind: 'proven', parent };
  const compare = readbackValue(input, ['api', `repos/${input.repository}/compare/${input.expected_base_sha}...${parent}`,
    '--jq', '{status, behind_by}'], timeoutMs);
  if (!compare.ok) return { kind: 'pending', evidence: compare.failure };
  if (compare.value.status === 'ahead' && compare.value.behind_by === 0) return { kind: 'proven', parent };
  return { kind: 'contradiction', evidence: `queue parent ${parent} does not descend from the expected base ${input.expected_base_sha} (compare status ${String(compare.value.status)})` };
}

/** One readback attempt: the PR is merged at the response SHA by one commit with exactly the expected parents. */
function attemptMergeProof(input: PublicationMergeInput, mergeCommitSha: string, baseRef: string, deadline: number, queue: boolean): ProofAttempt & { readonly parent?: string } {
  const now = input.readback_now ?? Date.now;
  const remaining = () => deadline - now();
  const prTimeout = remaining();
  if (prTimeout <= 0) return { kind: 'pending', evidence: 'readback window exhausted' };
  input.readback_timeout?.(prTimeout);
  const prRead = readbackValue(input, ['api', `repos/${input.repository}/pulls/${input.pr_number}`], prTimeout);
  if (!prRead.ok) return { kind: 'pending', evidence: prRead.failure };
  const pr = prRead.value;
  if (pr.merged === true && typeof pr.merge_commit_sha === 'string' && SHA.test(pr.merge_commit_sha) && pr.merge_commit_sha !== mergeCommitSha) {
    return { kind: 'contradiction', evidence: `PR readback shows merged at ${pr.merge_commit_sha}, but the merge response reported ${mergeCommitSha}` };
  }
  const head = isObject(pr.head) ? pr.head.sha : undefined;
  const base = isObject(pr.base) ? pr.base.ref : undefined;
  const evidence = prReadbackEvidence(pr);
  if (pr.merged !== true || pr.merge_commit_sha !== mergeCommitSha || head !== input.expected_head_sha || base !== baseRef) {
    return { kind: 'pending', evidence, pr: evidence };
  }
  const commitTimeout = remaining();
  if (commitTimeout <= 0) return { kind: 'pending', evidence, pr: evidence };
  input.readback_timeout?.(commitTimeout);
  const commitRead = readbackValue(input, ['api', `repos/${input.repository}/git/commits/${mergeCommitSha}`], commitTimeout);
  if (!commitRead.ok) return { kind: 'pending', evidence: commitRead.failure, pr: evidence };
  const commit = commitRead.value;
  if (queue) {
    if (commit.sha !== mergeCommitSha) return { kind: 'contradiction', evidence: `commit readback returned ${String(commit.sha)} for ${mergeCommitSha}` };
    const compareTimeout = remaining();
    if (compareTimeout <= 0) return { kind: 'pending', evidence, pr: evidence };
    input.readback_timeout?.(compareTimeout);
    return queueParentProof(input, commit, compareTimeout);
  }
  const parents = commit.parents;
  const expected = expectedParents(input);
  if (commit.sha !== mergeCommitSha || !Array.isArray(parents) || parents.length !== expected.length
    || !expected.every((sha, index) => isObject(parents[index]) && parents[index].sha === sha)) {
    const observed = Array.isArray(parents) ? `[${parents.map((parent) => isObject(parent) ? String(parent.sha) : '?').join(', ')}]` : String(parents);
    return { kind: 'contradiction', evidence: `commit ${String(commit.sha)} has parents ${observed}; expected exactly [${expected.join(', ')}]` };
  }
  return { kind: 'proven', parent: input.expected_base_sha };
}

const GIT_TIMEOUT_MS = 120_000;

function runGit(input: PublicationMergeInput, args: readonly string[]): ProviderResult {
  const result = spawnSync('git', ['-C', input.repo_root, ...args], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, encoding: 'utf-8', timeout: GIT_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
  const failure = result.error?.message ?? (result.signal ? `terminated by ${result.signal}` : undefined);
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', ...(failure ? { failure } : {}) };
}

function gitOutput(input: PublicationMergeInput, args: readonly string[]): string {
  const result = runGit(input, args);
  if (result.failure || result.status !== 0) {
    throw new UnknownOutcome(`git ${args.find((arg) => !arg.startsWith('-') && !arg.includes('='))}: ${(result.failure ?? result.stderr).trim() || `exit ${result.status}`}`);
  }
  return result.stdout.trim();
}

/**
 * The queue squash must hold exactly the reviewed head merged onto its parent.
 * The executor fetches the three commits from github.com with gh credentials,
 * so no local remote name matters, and compares the merge commit's tree with a
 * clean `git merge-tree` of the parent and the expected head.
 */
function proveQueueContent(input: PublicationMergeInput, mergeCommitSha: string, parentSha: string): void {
  const gh = (input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh').replace(/'/gu, `'\\''`);
  gitOutput(input, ['-c', 'credential.helper=', '-c', `credential.helper=!'${gh}' auth git-credential`,
    'fetch', '--quiet', '--no-tags', '--no-write-fetch-head', `https://github.com/${input.repository}.git`,
    parentSha, input.expected_head_sha, mergeCommitSha]);
  const merged = runGit(input, ['merge-tree', '--write-tree', '--no-messages', parentSha, input.expected_head_sha]);
  const tree = merged.stdout.trim().split('\n')[0] ?? '';
  if (merged.failure || merged.status !== 0 || !SHA.test(tree)) {
    throw new UnknownOutcome(`the reviewed head ${input.expected_head_sha} does not merge cleanly onto the queue parent ${parentSha}: ${(merged.failure ?? merged.stderr).trim() || `exit ${merged.status}`}`);
  }
  const actual = gitOutput(input, ['rev-parse', '--verify', `${mergeCommitSha}^{tree}`]);
  if (actual !== tree) {
    throw new UnknownOutcome(`queue commit ${mergeCommitSha} has tree ${actual}; a merge of ${input.expected_head_sha} onto ${parentSha} has tree ${tree}`);
  }
}

/** The merge commit is the head of its own ALLGREEN merge_group, so its own CI run is the queue's Required / CI. */
function proveQueueRun(input: PublicationMergeInput, mergeCommitSha: string): void {
  const args = ['api', `repos/${input.repository}/actions/runs?head_sha=${mergeCommitSha}&event=merge_group&per_page=100`,
    '--jq', '[.workflow_runs[] | {path, head_sha, status, conclusion}]'];
  const read = runGh(input, args);
  const runs = read.failure || read.status !== 0 ? undefined : parseJson(read.stdout);
  if (!Array.isArray(runs)) throw new UnknownOutcome(`merge_group CI readback failed: ${describeCall(args, read)}`);
  const ci = runs.filter((run) => isObject(run) && run.path === '.github/workflows/ci.yml' && run.head_sha === mergeCommitSha);
  if (!ci.some((run) => run.status === 'completed' && run.conclusion === 'success')) {
    throw new UnknownOutcome(`queue commit ${mergeCommitSha} has no successful merge_group CI run (${ci.length} CI runs read)`);
  }
}

/** Bounded retry: the merge request is sent once; only these readback attempts repeat. */
function proveMerge(input: PublicationMergeInput, mergeCommitSha: string, baseRef: string, queue: boolean): string {
  const now = input.readback_now ?? Date.now;
  const deadline = now() + READBACK_WINDOW_MS;
  let lastPrEvidence: string | undefined;
  for (let attempt = 0; ; attempt++) {
    if (now() >= deadline) {
      throw new UnknownOutcome(`merge readback did not confirm the merge within ${READBACK_WINDOW_MS} ms: readback window exhausted${lastPrEvidence !== undefined ? `; last PR readback: ${lastPrEvidence}` : ''}`);
    }
    const proof = attemptMergeProof(input, mergeCommitSha, baseRef, deadline, queue);
    if (proof.kind === 'proven') return proof.parent!;
    if (proof.kind === 'contradiction') {
      throw new UnknownOutcome(`merge readback contradicts the merge response: ${proof.evidence}`);
    }
    if (proof.pr !== undefined) lastPrEvidence = proof.pr;
    const remaining = deadline - now();
    if (attempt >= READBACK_DELAYS_MS.length || remaining <= 0) {
      const context = lastPrEvidence !== undefined && lastPrEvidence !== proof.evidence ? `; last PR readback: ${lastPrEvidence}` : '';
      throw new UnknownOutcome(`merge readback did not confirm the merge within ${READBACK_WINDOW_MS} ms: ${proof.evidence}${context}`);
    }
    (input.readback_wait ?? waitForReadback)(Math.min(READBACK_DELAYS_MS[attempt]!, remaining));
  }
}

function failure(exitCode: 3 | 4 | 5 | 6, error: PublicationMergeErrorCode, message: string, blockers?: readonly MergeReadinessBlockerV1[]): PublicationMergeResult {
  return {
    exit_code: exitCode,
    document: { ok: false, exit_code: exitCode, error, ...(blockers ? { blockers } : {}), message },
  };
}

interface PreparedMerge {
  readonly target: MergeTarget;
  readonly headline: string;
  readonly base_ref: string;
  /** The base requires a merge queue: the executor enqueues instead of merging. */
  readonly queue: boolean;
}

/** Steps 1-6. Each refusal throws before any mutation. */
function prepareMerge(input: PublicationMergeInput): PreparedMerge {
  try {
    validatePullRequestSelection({ provider_repository_id: input.provider_repository_id, repository: input.repository,
      pr_number: input.pr_number, expected_head_sha: input.expected_head_sha, expected_base_sha: input.expected_base_sha });
  } catch (error) {
    throw new Refusal('invalid_selection', error instanceof Error ? error.message : String(error));
  }
  const initial = readMergeTarget(input);
  assertSameRepositoryTarget(initial);
  if (input.batch) {
    assertBatchRef(initial);
    assertBatchHasNoOwnCommit(input);
  }
  const policy = readPolicy(input);
  const repository = readRepository(input);
  const defaultBranch = repository.default_branch;
  const queue = assertBaseProtection(input, defaultBranch, initial);
  if (queue) assertQueueMessage(repository);
  // Readiness reuses the base policy file this executor already read.
  const verdict = collectPullRequestMergeReadiness({ ...input, policy_file_at_base: policy.file });
  if (!verdict.ready) {
    throw new Refusal('merge_readiness_blocked', `readiness blockers: ${verdict.blockers.map((blocker) => blocker.code).join(', ')}`, verdict.blockers);
  }
  // Message text and closing links come from one read bound to the expected head and base.
  const target = readMergeTarget(input);
  assertSameRepositoryTarget(target);
  assertQueueState(target, queue);
  if (target.state !== 'OPEN' || target.head_sha !== input.expected_head_sha
    || target.base_sha !== input.expected_base_sha || target.base_ref !== defaultBranch) {
    throw new Refusal('pr_changed_after_readiness', 'the PR state, head or base changed after the readiness verdict');
  }
  const headline = `${target.title} (#${input.pr_number})`;
  const closing = checkClosingReferences({ repository: input.repository, commit_headline: headline, commit_body: target.body,
    linked: { references: target.closing_references, has_next_page: target.closing_has_next_page } });
  if (!closing.ok) throw new Refusal(closing.code, closing.message);
  return { target, headline, base_ref: defaultBranch, queue };
}

/** Direct merge: the response or the error readback names the merge commit. Returns null for a proven rejection. */
function mergeDirectly(input: PublicationMergeInput, prepared: PreparedMerge, errors: { value?: string }): string | null {
  const outcome = sendMerge(input, prepared.target, prepared.headline);
  if (!('provider_errors' in outcome)) return outcome.merged;
  errors.value = outcome.provider_errors;
  const readback = readBackAfterError(input);
  return readback.state === 'open' ? null : readback.merge_commit_sha;
}

/** Queue merge: enqueue once, then wait for the queue. Returns null for a proven rejection. */
function mergeThroughQueue(input: PublicationMergeInput, prepared: PreparedMerge, errors: { value?: string }, entry: { value?: MergeQueueEntry }): string | null {
  const outcome = sendEnqueue(input, prepared.target);
  if ('provider_errors' in outcome) {
    errors.value = outcome.provider_errors;
    const observation = observeQueue(input, PROVIDER_TIMEOUT_MS);
    if (observation.state === 'removed') return null;
    if (observation.state === 'merged') return observation.merge_commit_sha;
    if (observation.state === 'unreadable') throw new UnknownOutcome(`queue readback after the error response failed: ${observation.evidence}`);
    entry.value = observation.entry;
  } else {
    entry.value = outcome.queued;
  }
  input.on_queued?.(entry.value);
  return awaitQueue(input, entry.value.id);
}

export function executePublicationMerge(input: PublicationMergeInput): PublicationMergeResult {
  let prepared: PreparedMerge;
  try {
    prepared = prepareMerge(input);
  } catch (error) {
    if (error instanceof Refusal) return failure(error.code === 'acceptance_merge_off' ? 3 : 4, error.code, error.message, error.blockers);
    const code = error instanceof MergeReadinessError ? error.code : 'provider_data_incomplete';
    return failure(4, code, error instanceof Error ? error.message : String(error));
  }
  let mergeCommitSha: string;
  let parentSha: string;
  const errors: { value?: string } = {};
  const entry: { value?: MergeQueueEntry } = {};
  try {
    const merged = prepared.queue ? mergeThroughQueue(input, prepared, errors, entry) : mergeDirectly(input, prepared, errors);
    if (merged === null) {
      return failure(6, 'provider_rejected', `GitHub rejected ${prepared.queue ? 'enqueuePullRequest' : 'mergePullRequest'}: ${errors.value}`);
    }
    mergeCommitSha = merged;
    parentSha = proveMerge(input, mergeCommitSha, prepared.base_ref, prepared.queue);
    if (prepared.queue) {
      proveQueueContent(input, mergeCommitSha, parentSha);
      proveQueueRun(input, mergeCommitSha);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof QueueRemoved) return failure(6, 'merge_queue_removed', `${message}; queue entry ${entry.value?.id}`);
    // The request may have reached GitHub. The owner checks the PR; the executor does not retry.
    return failure(5, 'merge_outcome_unknown', errors.value ? `${message}; provider errors: ${errors.value}` : message);
  }
  const providerErrors = errors.value;
  return {
    exit_code: 0,
    document: {
      protocol: 1,
      kind: 'repo-harness-publication-merge',
      repository: input.repository,
      provider_repository_id: input.provider_repository_id,
      pr: input.pr_number,
      head_sha: input.expected_head_sha,
      base_ref: prepared.base_ref,
      base_sha: input.expected_base_sha,
      merge_commit_sha: mergeCommitSha,
      parent_sha: parentSha,
      ...(input.batch ? { parent_shas: [input.expected_base_sha, input.expected_head_sha] as const } : {}),
      policy_ref: input.expected_base_sha,
      revert: input.batch ? `git revert -m 1 ${mergeCommitSha}` : `git revert ${mergeCommitSha}`,
      ...(providerErrors ? { provider_errors: providerErrors } : {}),
      ...(entry.value ? { merge_queue_entry: entry.value.id } : {}),
    },
  };
}
