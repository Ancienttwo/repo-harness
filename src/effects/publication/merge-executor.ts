/**
 * The only automated merge path to the default branch.
 *
 * Every step before the mutation reads; a refusal at any step sends no merge
 * request. The mutation is sent once. After it is sent, any result other than
 * an explicit GraphQL rejection or a proven single-parent squash commit is an
 * unknown outcome, and the executor never retries it.
 */

import { spawnSync } from 'child_process';
import {
  parsePublicationPolicy,
  publicationPolicyChanged,
  type PolicyFileAtRef,
  type PublicationPolicy,
} from '../../core/publication/acceptance-merge-policy';
import { checkClosingReferences, type ClosingIssueReference } from '../../core/publication/closing-references';
import type { MergeReadinessBlockerV1 } from '../../core/publication/merge-readiness';
import {
  MergeReadinessError,
  collectPullRequestMergeReadiness,
  validatePullRequestSelection,
  type PullRequestReadinessInput,
} from './merge-readiness';

export const PUBLICATION_POLICY_PATH = '.ai/harness/policy.json';

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
  | 'closing_references_mismatch';

export type PublicationMergeErrorCode =
  | 'acceptance_merge_off'
  | PublicationMergeRefusalCode
  | 'merge_outcome_unknown'
  | 'provider_rejected';

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
  readonly parent_sha: string;
  readonly policy_ref: string;
  readonly revert: string;
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
    readonly code: Exclude<PublicationMergeErrorCode, 'merge_outcome_unknown' | 'provider_rejected'>,
    message: string,
    readonly blockers?: readonly MergeReadinessBlockerV1[],
  ) {
    super(message);
    this.name = 'PublicationMergeRefusal';
  }
}

class UnknownOutcome extends Error {}

const PROVIDER_TIMEOUT_MS = 30_000;
const SHA = /^[0-9a-f]{40}$/u;

interface ProviderResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly failure?: string;
}

/** Every call names github.com and the repository; nothing depends on the current directory's remote. */
function runGh(input: PullRequestReadinessInput, args: readonly string[]): ProviderResult {
  const full = args[0] === 'api' ? [...args, '--hostname', 'github.com'] : [...args];
  const injected = input.gh_runner?.(full);
  if (injected) return { status: injected.status, stdout: injected.stdout, stderr: injected.stderr ?? '' };
  const result = spawnSync(input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh', full, {
    cwd: input.repo_root,
    env: { ...process.env, GH_HOST: 'github.com' },
    encoding: 'utf-8',
    timeout: PROVIDER_TIMEOUT_MS,
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
  readonly auto_merge_enabled: boolean;
  readonly head_sha: string;
  readonly base_sha: string;
  readonly base_ref: string;
  readonly closing_references: readonly ClosingIssueReference[];
  readonly closing_has_next_page: boolean;
}

const TARGET_QUERY = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){nameWithOwner pullRequest(number:$number){id number title body state isCrossRepository headRefOid baseRefOid baseRefName autoMergeRequest{enabledAt} closingIssuesReferences(first:100){pageInfo{hasNextPage} nodes{number repository{nameWithOwner}}}}}}';

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
    || typeof pr.headRefOid !== 'string' || typeof pr.baseRefOid !== 'string'
    || typeof pr.baseRefName !== 'string' || pr.baseRefName === ''
    || (pr.autoMergeRequest !== null && !isObject(pr.autoMergeRequest))
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
    auto_merge_enabled: pr.autoMergeRequest !== null,
    head_sha: pr.headRefOid,
    base_sha: pr.baseRefOid,
    base_ref: pr.baseRefName,
    closing_references: references,
    closing_has_next_page: pageInfo.hasNextPage,
  };
}

function assertSameRepositoryTarget(target: MergeTarget): void {
  if (target.is_cross_repository) throw new Refusal('cross_repository_pr', 'the executor merges only same-repository PRs');
  if (target.auto_merge_enabled) throw new Refusal('auto_merge_enabled', 'the PR has an auto-merge request');
}

function readPolicyAt(input: PullRequestReadinessInput, ref: string): PolicyFileAtRef {
  const value = read(input, ['api', `repos/${input.repository}/contents/${PUBLICATION_POLICY_PATH}?ref=${ref}`], true);
  if (value === null) return { status: 'missing' };
  const file = field(value, 'policy file');
  if (file.type !== 'file' || file.path !== PUBLICATION_POLICY_PATH || file.encoding !== 'base64' || typeof file.content !== 'string') {
    throw new Refusal('publication_policy_invalid', `${PUBLICATION_POLICY_PATH} at ${ref} is not a readable file`);
  }
  return { status: 'present', text: Buffer.from(file.content, 'base64').toString('utf-8') };
}

function readDefaultBranch(input: PullRequestReadinessInput): string {
  const repository = field(read(input, ['api', `repos/${input.repository}`]), 'REST repository');
  if (String(repository.id) !== input.provider_repository_id || repository.full_name !== input.repository
    || typeof repository.default_branch !== 'string' || repository.default_branch === '') {
    throw new Refusal('provider_data_incomplete', 'provider repository does not match the selection');
  }
  return repository.default_branch;
}

/** D7: GitHub pins only the head. Strict status checks turn a moved base into a provider-side rejection. */
function assertBaseProtection(input: PullRequestReadinessInput, branch: string): void {
  const root = `repos/${input.repository}/branches/${encodeURIComponent(branch)}`;
  const value = read(input, ['api', `${root}/protection`], true);
  if (value === null) throw new Refusal('base_protection_insufficient', `${branch} has no branch protection`);
  const protection = field(value, 'branch protection');
  const checks = protection.required_status_checks;
  const admins = protection.enforce_admins;
  if (!isObject(checks) || checks.strict !== true || !isObject(admins) || admins.enabled !== true) {
    throw new Refusal('base_protection_insufficient', `${branch} protection must require strict status checks and enforce_admins`);
  }
  const rules = read(input, ['api', `repos/${input.repository}/rules/branches/${encodeURIComponent(branch)}?per_page=100`]);
  if (!Array.isArray(rules) || rules.length >= 100) throw new Refusal('provider_data_incomplete', 'branch rules were not exhaustively observed');
  if (rules.some((rule) => !isObject(rule) || typeof rule.type !== 'string')) {
    throw new Refusal('provider_data_incomplete', 'branch rule is incomplete');
  }
  if (rules.some((rule) => (rule as Record<string, unknown>).type === 'merge_queue')) {
    throw new Refusal('base_protection_insufficient', `${branch} requires a merge queue`);
  }
}

function readPolicy(input: PullRequestReadinessInput): PublicationPolicy & { readonly ok: true } {
  const base = parsePublicationPolicy(readPolicyAt(input, input.expected_base_sha));
  if (!base.ok) throw new Refusal('publication_policy_invalid', `${PUBLICATION_POLICY_PATH} at ${input.expected_base_sha}: ${base.message}`);
  if (base.acceptance_merge === 'off') {
    throw new Refusal('acceptance_merge_off', `publication.acceptance_merge is off at base ${input.expected_base_sha}`);
  }
  if (publicationPolicyChanged(base, readPolicyAt(input, input.expected_head_sha))) {
    throw new Refusal('publication_policy_changed_in_pr', 'the PR changes the publication policy subtree');
  }
  return base;
}

const MERGE_MUTATION = 'mutation($pullRequestId:ID!,$expectedHeadOid:GitObjectID!,$commitHeadline:String!,$commitBody:String!){mergePullRequest(input:{pullRequestId:$pullRequestId,expectedHeadOid:$expectedHeadOid,mergeMethod:SQUASH,commitHeadline:$commitHeadline,commitBody:$commitBody}){pullRequest{number state mergeCommit{oid}}}}';

type MutationOutcome = { readonly merged: string } | { readonly rejected: string };

/** Sent once. Only an explicit GraphQL error with no merge payload counts as a rejection. */
function sendMerge(input: PullRequestReadinessInput, target: MergeTarget, headline: string): MutationOutcome {
  // -f keeps every value a raw string; -F would read a body that starts with "@" as a file.
  const args = ['api', 'graphql', '-f', `query=${MERGE_MUTATION}`, '-f', `pullRequestId=${target.id}`,
    '-f', `expectedHeadOid=${input.expected_head_sha}`, '-f', `commitHeadline=${headline}`, '-f', `commitBody=${target.body}`];
  const result = runGh(input, args);
  if (result.failure || result.status === null) throw new UnknownOutcome(`merge request did not complete: ${describeCall(args, result)}`);
  const value = parseJson(result.stdout);
  if (!isObject(value)) throw new UnknownOutcome(`merge response is not a JSON object: ${describeCall(args, result)}`);
  const payload = isObject(value.data) ? value.data.mergePullRequest : undefined;
  if (Array.isArray(value.errors) && value.errors.length > 0) {
    if (payload === null || payload === undefined) return { rejected: JSON.stringify(value.errors) };
    throw new UnknownOutcome(`merge response has errors and a payload: ${JSON.stringify(value.errors)}`);
  }
  if (result.status !== 0) throw new UnknownOutcome(`merge request failed: ${describeCall(args, result)}`);
  const pr = isObject(payload) ? payload.pullRequest : undefined;
  const commit = isObject(pr) ? pr.mergeCommit : undefined;
  if (!isObject(pr) || pr.state !== 'MERGED' || pr.number !== input.pr_number || !isObject(commit)
    || typeof commit.oid !== 'string' || !SHA.test(commit.oid)) {
    throw new UnknownOutcome('merge response is incomplete');
  }
  return { merged: commit.oid };
}

/** Readback: the PR is merged by exactly one commit whose only parent is the expected base. */
function proveMerge(input: PullRequestReadinessInput, mergeCommitSha: string, baseRef: string): void {
  const readback = (args: readonly string[]): Record<string, unknown> => {
    const result = runGh(input, args);
    const value = result.failure || result.status !== 0 ? undefined : parseJson(result.stdout);
    if (!isObject(value)) throw new UnknownOutcome(`merge readback failed: ${describeCall(args, result)}`);
    return value;
  };
  const pr = readback(['api', `repos/${input.repository}/pulls/${input.pr_number}`]);
  const head = isObject(pr.head) ? pr.head.sha : undefined;
  const base = isObject(pr.base) ? pr.base.ref : undefined;
  if (pr.merged !== true || pr.merge_commit_sha !== mergeCommitSha || head !== input.expected_head_sha || base !== baseRef) {
    throw new UnknownOutcome('merged PR readback does not match the merge response');
  }
  const commit = readback(['api', `repos/${input.repository}/git/commits/${mergeCommitSha}`]);
  const parents = commit.parents;
  if (commit.sha !== mergeCommitSha || !Array.isArray(parents) || parents.length !== 1
    || !isObject(parents[0]) || parents[0].sha !== input.expected_base_sha) {
    throw new UnknownOutcome(`merge commit ${mergeCommitSha} does not have exactly one parent equal to ${input.expected_base_sha}`);
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
}

/** Steps 1-6. Each refusal throws before any mutation. */
function prepareMerge(input: PullRequestReadinessInput): PreparedMerge {
  try {
    validatePullRequestSelection({ provider_repository_id: input.provider_repository_id, repository: input.repository,
      pr_number: input.pr_number, expected_head_sha: input.expected_head_sha, expected_base_sha: input.expected_base_sha });
  } catch (error) {
    throw new Refusal('invalid_selection', error instanceof Error ? error.message : String(error));
  }
  assertSameRepositoryTarget(readMergeTarget(input));
  readPolicy(input);
  const defaultBranch = readDefaultBranch(input);
  assertBaseProtection(input, defaultBranch);
  const verdict = collectPullRequestMergeReadiness(input);
  if (!verdict.ready) {
    throw new Refusal('merge_readiness_blocked', `readiness blockers: ${verdict.blockers.map((blocker) => blocker.code).join(', ')}`, verdict.blockers);
  }
  // Message text and closing links come from one read bound to the expected head and base.
  const target = readMergeTarget(input);
  assertSameRepositoryTarget(target);
  if (target.state !== 'OPEN' || target.head_sha !== input.expected_head_sha
    || target.base_sha !== input.expected_base_sha || target.base_ref !== defaultBranch) {
    throw new Refusal('pr_changed_after_readiness', 'the PR state, head or base changed after the readiness verdict');
  }
  const headline = `${target.title} (#${input.pr_number})`;
  const closing = checkClosingReferences({ repository: input.repository, commit_headline: headline, commit_body: target.body,
    linked: { references: target.closing_references, has_next_page: target.closing_has_next_page } });
  if (!closing.ok) throw new Refusal(closing.code, closing.message);
  return { target, headline, base_ref: defaultBranch };
}

export function executePublicationMerge(input: PullRequestReadinessInput): PublicationMergeResult {
  let prepared: PreparedMerge;
  try {
    prepared = prepareMerge(input);
  } catch (error) {
    if (error instanceof Refusal) return failure(error.code === 'acceptance_merge_off' ? 3 : 4, error.code, error.message, error.blockers);
    const code = error instanceof MergeReadinessError ? error.code : 'provider_data_incomplete';
    return failure(4, code, error instanceof Error ? error.message : String(error));
  }
  let mergeCommitSha: string;
  try {
    const outcome = sendMerge(input, prepared.target, prepared.headline);
    if ('rejected' in outcome) return failure(6, 'provider_rejected', `GitHub rejected mergePullRequest: ${outcome.rejected}`);
    mergeCommitSha = outcome.merged;
    proveMerge(input, mergeCommitSha, prepared.base_ref);
  } catch (error) {
    // The request may have reached GitHub. The owner checks the PR; the executor does not retry.
    return failure(5, 'merge_outcome_unknown', error instanceof Error ? error.message : String(error));
  }
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
      parent_sha: input.expected_base_sha,
      policy_ref: input.expected_base_sha,
      revert: `git revert ${mergeCommitSha}`,
    },
  };
}
