/**
 * The only automated merge path to the default branch.
 *
 * Every step before the mutation reads; a refusal at any step sends no merge
 * request. The mutation is one squash, sent once. After it is sent, the result
 * is a rejection only when an error response is followed by a readback of the
 * PR still open at the expected head, and a merge only when the merge commit
 * has one parent that is the expected base or a descendant of it. Everything
 * else is an unknown outcome. The executor never resends the merge request;
 * only the provider readback repeats, inside a bounded window, because a merge
 * response can arrive before the read model shows the merge.
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
import { gitSpawnSync, withoutRepositorySelectingGitEnv } from '../git/runner';
import type { MergeReadinessBlockerV1 } from '../../core/publication/merge-readiness';
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
  /** The one parent of the squash: the expected base, or a descendant of it when the base moved before the squash. */
  readonly parent_sha: string;
  /** The live tip of the base branch where the gating policy was read. */
  readonly policy_ref: string;
  readonly revert: string;
  /** GraphQL errors that came with a merge the readback proved. */
  readonly provider_errors?: string;
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

type PublicationMergeInput = PullRequestReadinessInput & {
  // The executor's own test seam; the CLI and MCP never set it.
  readonly readback_wait?: (milliseconds: number) => void;
  readonly readback_now?: () => number;
  readonly readback_timeout?: (milliseconds: number) => void;
};

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
    || typeof pr.headRefOid !== 'string'
    || typeof pr.baseRefOid !== 'string' || typeof pr.baseRefName !== 'string' || pr.baseRefName === ''
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
  const file = policyFileFromContents(field(value, 'policy file'));
  if (file === null) throw new Refusal('publication_policy_invalid', `${PUBLICATION_POLICY_PATH} at ${ref} is not a readable file`);
  return file;
}

function readDefaultBranch(input: PullRequestReadinessInput): string {
  const repository = field(read(input, ['api', `repos/${input.repository}`]), 'REST repository');
  if (String(repository.id) !== input.provider_repository_id || repository.full_name !== input.repository
    || typeof repository.default_branch !== 'string' || repository.default_branch === '') {
    throw new Refusal('provider_data_incomplete', 'provider repository does not match the selection');
  }
  return repository.default_branch;
}

/**
 * D7: GitHub pins only the head, so a squash can land on a base that moved after
 * the PR's checks ran. Strict status checks are not required: the merge proof
 * names the parent and binds the merge commit to the reviewed head on it
 * (`proveSquashContent`). Returns the status checks read from the protection.
 */
function assertBaseProtection(input: PublicationMergeInput, branch: string): Record<string, unknown> {
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
  return checks;
}

interface GatingPolicy {
  /** The live tip of the base branch: the gating policy is read there, not at the PR's recorded base. */
  readonly ref: string;
  readonly policy: PublicationPolicy & { readonly ok: true };
  /** The file itself, so readiness reuses this read when the live tip is the expected base. */
  readonly file: PolicyFileAtRef;
}

function readLiveTip(input: PullRequestReadinessInput, branch: string): string {
  const value = field(read(input, ['api', `repos/${input.repository}/branches/${encodeURIComponent(branch)}`]), 'base branch');
  const sha = isObject(value.commit) ? value.commit.sha : undefined;
  if (value.name !== branch || typeof sha !== 'string' || !SHA.test(sha)) {
    throw new Refusal('provider_data_incomplete', `the live tip of ${branch} is unreadable`);
  }
  return sha;
}

/**
 * The PR's recorded base can be older than the branch, so a switch turned off
 * on the branch after the PR's last push must still stop it.
 */
function readGatingPolicy(input: PullRequestReadinessInput, branch: string): GatingPolicy {
  const ref = readLiveTip(input, branch);
  const file = readPolicyAt(input, ref);
  const policy = parsePublicationPolicy(file);
  if (!policy.ok) throw new Refusal('publication_policy_invalid', `${PUBLICATION_POLICY_PATH} at ${ref}: ${policy.message}`);
  if (policy.acceptance_merge === 'off') {
    throw new Refusal('acceptance_merge_off', `publication.acceptance_merge is off at the live tip ${ref} of ${branch}`);
  }
  return { ref, policy, file };
}

/** The head holds the live tip: `compare` reports it ahead of or identical to the tip. */
function headContains(input: PullRequestReadinessInput, tip: string): boolean {
  const compare = field(read(input, ['api', `repos/${input.repository}/compare/${tip}...${input.expected_head_sha}`,
    '--jq', '{status, behind_by}']), 'provider compare');
  if ((compare.status === 'ahead' || compare.status === 'identical') && compare.behind_by === 0) return true;
  if ((compare.status === 'behind' || compare.status === 'diverged') && Number.isSafeInteger(compare.behind_by) && Number(compare.behind_by) > 0) return false;
  throw new Refusal('provider_data_incomplete', `provider compare of ${tip}...${input.expected_head_sha} is incomplete`);
}

/** The policy file in a clean or conflicted `git merge-tree` of the live tip and the head. */
function mergedPolicyFile(input: PublicationMergeInput, tip: string, baseRef: string): PolicyFileAtRef {
  const missing = missingCommits(input, baseRef, [tip, input.expected_head_sha], 'the live tip and the reviewed head');
  if (missing !== null) throw new Refusal('provider_unavailable', `${missing}; the merge result policy is not proven`);
  // Exit 1 is a conflicted merge: the tree line, then one conflicted path per line.
  const merged = runGit(input, ['-c', 'core.quotePath=false', 'merge-tree', '--write-tree', '--name-only', '--no-messages',
    tip, input.expected_head_sha], [0, 1]);
  const [tree = '', ...conflicts] = merged.ok ? merged.stdout.split('\n').filter((line) => line !== '') : [];
  if (!merged.ok || !SHA.test(tree)) {
    throw new Refusal('provider_unavailable', `git merge-tree of ${tip} and ${input.expected_head_sha} failed (${merged.ok ? 'printed no tree' : merged.reason})`);
  }
  if (conflicts.includes(PUBLICATION_POLICY_PATH)) {
    throw new Refusal('publication_policy_changed_in_pr', `the merge of the PR head into the live tip ${tip} conflicts in ${PUBLICATION_POLICY_PATH}`);
  }
  const entry = runGit(input, ['ls-tree', tree, '--', PUBLICATION_POLICY_PATH]);
  if (!entry.ok) throw new Refusal('provider_unavailable', `git ls-tree of the merge tree failed (${entry.reason})`);
  if (entry.stdout.trim() === '') return { status: 'missing' };
  const blob = /^100(?:644|755) blob ([0-9a-f]{40})\t/u.exec(entry.stdout)?.[1];
  if (blob === undefined) throw new Refusal('publication_policy_invalid', `${PUBLICATION_POLICY_PATH} in the merge result is not a readable file`);
  const text = runGit(input, ['cat-file', 'blob', blob]);
  if (!text.ok) throw new Refusal('provider_unavailable', `git cat-file of the merged ${PUBLICATION_POLICY_PATH} failed (${text.reason})`);
  return { status: 'present', text: text.stdout };
}

/**
 * The merge result must keep the publication subtree of the live tip. When the
 * head holds the tip, the three-way merge takes every path from the head, so
 * the head file is the merge result. Otherwise git computes the merge.
 */
function assertMergeKeepsPolicy(input: PublicationMergeInput, gating: GatingPolicy, baseRef: string): void {
  const merged = headContains(input, gating.ref)
    ? readPolicyAt(input, input.expected_head_sha)
    : mergedPolicyFile(input, gating.ref, baseRef);
  if (publicationPolicyChanged(gating.policy, merged)) {
    throw new Refusal('publication_policy_changed_in_pr', `the merge of the PR head into the live tip ${gating.ref} changes the publication policy subtree`);
  }
}

/** The tip can move between the read and the merge, so the parent the merge landed on must also allow it. */
function assertParentAllowedMerge(input: PublicationMergeInput, gating: GatingPolicy, parentSha: string, mergeCommitSha: string): void {
  if (parentSha === gating.ref) return;
  const parent = parsePublicationPolicy(readPolicyAt(input, parentSha));
  if (parent.ok && parent.acceptance_merge === 'on') return;
  throw new UnknownOutcome(`the PR merged at ${mergeCommitSha}, but publication.acceptance_merge is not on at its parent ${parentSha}`
    + `${parent.ok ? '' : ` (${parent.message})`}; the owner decides on git revert ${mergeCommitSha}`);
}

const MERGE_MUTATION = 'mutation($pullRequestId:ID!,$expectedHeadOid:GitObjectID!,$commitHeadline:String!,$commitBody:String!){mergePullRequest(input:{pullRequestId:$pullRequestId,expectedHeadOid:$expectedHeadOid,mergeMethod:SQUASH,commitHeadline:$commitHeadline,commitBody:$commitBody}){pullRequest{number state mergeCommit{oid}}}}';

type MutationOutcome = { readonly merged: string } | { readonly provider_errors: string };

/** Sent once. An error response is not proof of a rejection; the caller reads the PR back. */
function sendMerge(input: PublicationMergeInput, target: MergeTarget, headline: string): MutationOutcome {
  // -f keeps every value a raw string; -F would read a body that starts with "@" as a file.
  const args = ['api', 'graphql', '-f', `query=${MERGE_MUTATION}`, '-f', `pullRequestId=${target.id}`,
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

/** A squash has one parent: the base it landed on, which is the expected base or a descendant of it. */
function squashParentProof(input: PublicationMergeInput, commit: Record<string, unknown>, remaining: () => number, pr: string): ProofAttempt & { readonly parent?: string } {
  const parents = commit.parents;
  const parent = Array.isArray(parents) && parents.length === 1 && isObject(parents[0]) ? parents[0].sha : undefined;
  if (typeof parent !== 'string' || !SHA.test(parent)) {
    return { kind: 'contradiction', evidence: `squash commit ${String(commit.sha)} does not have exactly one parent` };
  }
  if (parent === input.expected_base_sha) return { kind: 'proven', parent };
  const timeout = remaining();
  if (timeout <= 0) return { kind: 'pending', evidence: pr, pr };
  input.readback_timeout?.(timeout);
  const compare = readbackValue(input, ['api', `repos/${input.repository}/compare/${input.expected_base_sha}...${parent}`,
    '--jq', '{status, behind_by}'], timeout);
  if (!compare.ok) return { kind: 'pending', evidence: compare.failure };
  if (compare.value.status === 'ahead' && compare.value.behind_by === 0) return { kind: 'proven', parent };
  return { kind: 'contradiction', evidence: `squash parent ${parent} does not descend from the expected base ${input.expected_base_sha} (compare status ${String(compare.value.status)})` };
}

/** One readback attempt: the PR is merged at the response SHA by one commit with the expected parent. */
function attemptMergeProof(input: PublicationMergeInput, mergeCommitSha: string, baseRef: string, deadline: number): ProofAttempt & { readonly parent?: string } {
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
  if (commit.sha !== mergeCommitSha) return { kind: 'contradiction', evidence: `commit readback returned ${String(commit.sha)} for ${mergeCommitSha}` };
  return squashParentProof(input, commit, remaining, evidence);
}

const GIT_TIMEOUT_MS = 120_000;

/** Exit status only: git stderr can carry transport and credential diagnostics, and the result document is printed. */
type GitRun = { readonly ok: true; readonly stdout: string } | { readonly ok: false; readonly reason: string };

function runGit(input: PublicationMergeInput, args: readonly string[], okStatuses: readonly number[] = [0]): GitRun {
  // The checkout is the cwd, and GIT_DIR-style variables cannot select another repository.
  const result = gitSpawnSync(args, {
    cwd: input.repo_root, env: { ...withoutRepositorySelectingGitEnv(), GIT_TERMINAL_PROMPT: '0' }, encoding: 'utf-8', timeout: GIT_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
  if (result.error || result.signal) return { ok: false, reason: result.signal ? `terminated by ${result.signal}` : 'did not start' };
  return result.status !== null && okStatuses.includes(result.status) ? { ok: true, stdout: result.stdout ?? '' } : { ok: false, reason: `exit ${result.status}` };
}

/**
 * The executor fetches from the checkout's
 * `origin` with the operator's own git setup and sets no credential helper.
 * Commits fetched from any remote match the expected SHAs or fail. Returns
 * null when every commit is present, otherwise the reason.
 */
function missingCommits(input: PublicationMergeInput, baseRef: string, commits: readonly string[], label: string): string | null {
  const present = () => commits.every((sha) => runGit(input, ['cat-file', '-e', `${sha}^{commit}`]).ok);
  if (present()) return null;
  // `--refmap=` drops the configured `remote.origin.fetch` mapping and the refspecs name no destination, so the fetch writes objects only.
  const fetched = runGit(input, ['fetch', '--no-tags', '--quiet', '--refmap=', '--no-write-fetch-head', 'origin',
    `refs/pull/${input.pr_number}/head`, `refs/heads/${baseRef}`]);
  if (!fetched.ok) return `git fetch from origin failed (${fetched.reason})`;
  return present() ? null : `origin does not have ${label}`;
}

/**
 * A squash onto a parent that readiness did not read must hold exactly the
 * reviewed head merged onto that parent. It compares the merge commit's tree
 * with a clean `git merge-tree` of the parent and the expected head.
 */
function proveSquashContent(input: PublicationMergeInput, mergeCommitSha: string, parentSha: string, baseRef: string): void {
  const missing = missingCommits(input, baseRef, [parentSha, input.expected_head_sha, mergeCommitSha],
    'the squash parent, the reviewed head and the merge commit');
  if (missing !== null) throw new UnknownOutcome(`${missing}; the squash content is not proven`);
  const merged = runGit(input, ['merge-tree', '--write-tree', '--no-messages', parentSha, input.expected_head_sha]);
  const tree = merged.ok ? merged.stdout.trim().split('\n')[0] ?? '' : '';
  if (!SHA.test(tree)) {
    throw new UnknownOutcome(`the reviewed head ${input.expected_head_sha} does not merge cleanly onto the squash parent ${parentSha} (git merge-tree ${merged.ok ? 'printed no tree' : merged.reason})`);
  }
  const actual = runGit(input, ['rev-parse', '--verify', `${mergeCommitSha}^{tree}`]);
  if (!actual.ok) throw new UnknownOutcome(`git rev-parse of the squash commit tree failed (${actual.reason})`);
  if (actual.stdout.trim() !== tree) {
    throw new UnknownOutcome(`squash commit ${mergeCommitSha} has tree ${actual.stdout.trim()}; a merge of ${input.expected_head_sha} onto ${parentSha} has tree ${tree}`);
  }
}

/** Bounded retry: the merge request is sent once; only these readback attempts repeat. */
function proveMerge(input: PublicationMergeInput, mergeCommitSha: string, baseRef: string): string {
  const now = input.readback_now ?? Date.now;
  const deadline = now() + READBACK_WINDOW_MS;
  let lastPrEvidence: string | undefined;
  for (let attempt = 0; ; attempt++) {
    if (now() >= deadline) {
      throw new UnknownOutcome(`merge readback did not confirm the merge within ${READBACK_WINDOW_MS} ms: readback window exhausted${lastPrEvidence !== undefined ? `; last PR readback: ${lastPrEvidence}` : ''}`);
    }
    const proof = attemptMergeProof(input, mergeCommitSha, baseRef, deadline);
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
  readonly gating: GatingPolicy;
}

/** Steps 1-6. Each refusal throws before any mutation. */
function prepareMerge(input: PublicationMergeInput): PreparedMerge {
  try {
    validatePullRequestSelection({ provider_repository_id: input.provider_repository_id, repository: input.repository,
      pr_number: input.pr_number, expected_head_sha: input.expected_head_sha, expected_base_sha: input.expected_base_sha });
  } catch (error) {
    throw new Refusal('invalid_selection', error instanceof Error ? error.message : String(error));
  }
  assertSameRepositoryTarget(readMergeTarget(input));
  const defaultBranch = readDefaultBranch(input);
  const gating = readGatingPolicy(input, defaultBranch);
  assertMergeKeepsPolicy(input, gating, defaultBranch);
  const requiredStatusChecks = assertBaseProtection(input, defaultBranch);
  // Reuse the protection read, and the policy read when the live tip is the base that readiness reads.
  const verdict = collectPullRequestMergeReadiness({ ...input,
    ...(gating.ref === input.expected_base_sha ? { policy_file_at_base: gating.file } : {}),
    required_status_checks_at_base: requiredStatusChecks });
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
  return { target, headline, base_ref: defaultBranch, gating };
}

/** The response or the error readback names the merge commit. Returns null for a proven rejection. */
function sendMergeOnce(input: PublicationMergeInput, prepared: PreparedMerge, errors: { value?: string }): string | null {
  const outcome = sendMerge(input, prepared.target, prepared.headline);
  if (!('provider_errors' in outcome)) return outcome.merged;
  errors.value = outcome.provider_errors;
  const readback = readBackAfterError(input);
  return readback.state === 'open' ? null : readback.merge_commit_sha;
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
  try {
    const merged = sendMergeOnce(input, prepared, errors);
    if (merged === null) return failure(6, 'provider_rejected', `GitHub rejected mergePullRequest: ${errors.value}`);
    mergeCommitSha = merged;
    parentSha = proveMerge(input, mergeCommitSha, prepared.base_ref);
    assertParentAllowedMerge(input, prepared.gating, parentSha, mergeCommitSha);
    // On the expected base, the provider squash of the pinned head is the diff that readiness read.
    if (parentSha !== input.expected_base_sha) proveSquashContent(input, mergeCommitSha, parentSha, prepared.base_ref);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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
      policy_ref: prepared.gating.ref,
      revert: `git revert ${mergeCommitSha}`,
      ...(providerErrors ? { provider_errors: providerErrors } : {}),
    },
  };
}
