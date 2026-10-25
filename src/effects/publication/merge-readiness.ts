import { spawn, spawnSync } from 'child_process';
import {
  projectPullRequestMergeReadiness,
  type MergeReadinessObservation,
  type PullRequestReadinessV2,
  type PullRequestSelectionV2,
  type ProviderMergeReadinessFactsV1,
} from '../../core/publication/merge-readiness';
export type MergeReadinessErrorCode =
  | 'provider_unavailable'
  | 'provider_data_incomplete';

export class MergeReadinessError extends Error {
  constructor(readonly code: MergeReadinessErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'MergeReadinessError';
  }
}

export interface PublicationReadinessInput {
  readonly repo_root: string;
  readonly repository?: string;
  readonly gh_bin?: string;
  readonly git_bin?: string;
  /** Internal effect/test seam; HTTP callers never choose an authority store. */
  readonly authority_home?: string;
  readonly now_ms?: number;
  /** Internal effect/test seam for caller-owned provider execution, such as a protected helper environment. */
  readonly gh_runner?: (args: readonly string[]) => { readonly status: number; readonly stdout: string; readonly stderr?: string };
}

export interface AbortablePublicationReadinessInput extends Omit<PublicationReadinessInput, 'gh_runner'> {
  /** Abort propagates to every live provider child; no caller receives a partial provider payload. */
  readonly signal?: AbortSignal;
  /** Async test seam. Production uses the configured gh binary. */
  readonly gh_runner_async?: (args: readonly string[], signal: AbortSignal | undefined) => Promise<{
    readonly status: number | null;
    readonly stdout: string;
    readonly stderr?: string;
    readonly error?: Error;
  }>;
}

export interface ProviderIdentity {
  readonly provider_repo_id: string;
  readonly repo_name_with_owner: string;
  readonly pr_number: number;
  readonly pr_url: string;
  readonly state: string;
  readonly is_draft: boolean;
  readonly head_sha: string;
  readonly head_ref: string;
  readonly base_sha: string;
  readonly base_ref: string;
  readonly body: string;
  readonly review_decision: string | null;
  readonly mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
}

const PROVIDER_TERMINATION_GRACE_MS = 500;
const PROVIDER_SYNCHRONOUS_TIMEOUT_MS = 30_000;

/**
 * Fleet owns process-tree termination at the collector boundary. This helper
 * therefore addresses only its direct provider child; on Windows the parent
 * Job controller is the sole tree owner, so no PID-based tree fallback exists.
 */
function waitForProviderChildExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener('close', onClose);
      resolve(false);
    }, timeoutMs);
    const onClose = (): void => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('close', onClose);
  });
}

async function terminateProviderChild(child: ReturnType<typeof spawn>): Promise<void> {
  try { child.kill('SIGTERM'); } catch { /* the direct provider child already exited */ }
  if (await waitForProviderChildExit(child, PROVIDER_TERMINATION_GRACE_MS)) return;
  try { child.kill('SIGKILL'); } catch { /* the direct provider child already exited */ }
  if (!await waitForProviderChildExit(child, PROVIDER_SYNCHRONOUS_TIMEOUT_MS)) {
    throw new Error('provider child did not exit after forced termination');
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MergeReadinessError('provider_data_incomplete', `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new MergeReadinessError('provider_data_incomplete', `${label} is required`);
  }
  return value;
}

function githubArguments(input: PublicationReadinessInput, args: readonly string[]): readonly string[] {
  if (args[0] === 'api') return [...args, '--hostname', 'github.com'];
  if (input.repository) {
    const repository = `github.com/${input.repository}`;
    if (args[0] === 'repo' && args[1] === 'view') return [...args.slice(0, 2), repository, ...args.slice(2)];
    if (args[0] === 'pr') return [...args, '--repo', repository];
  }
  return args;
}

function gh(input: PublicationReadinessInput, args: readonly string[], accepted = [0]): unknown {
  args = githubArguments(input, args);
  const injected = input.gh_runner?.(args);
  const result = injected ?? spawnSync(input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh', [...args], {
    cwd: input.repo_root,
    env: { ...process.env, GH_HOST: 'github.com' },
    encoding: 'utf-8',
    timeout: PROVIDER_SYNCHRONOUS_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  if (('error' in result && result.error) || result.status === null || !accepted.includes(result.status)) {
    const cause = 'error' in result ? result.error : undefined;
    throw new MergeReadinessError(
      'provider_unavailable',
      `provider observation failed: gh ${args.join(' ')}: ${(result.stderr || cause?.message || `exit ${result.status}`).trim()}`,
      cause,
    );
  }
  try {
    const value = JSON.parse(result.stdout);
    if (args[0] === 'api' && accepted.includes(1)) {
      if (result.status !== 0 && value?.status !== '404') {
        throw new MergeReadinessError('provider_unavailable', 'rollback reporter activation unavailable');
      }
      if (result.status === 0 && value?.status === '404') {
        throw new MergeReadinessError('provider_data_incomplete', 'rollback reporter activation HTTP status is inconsistent');
      }
    }
    return value;
  } catch (error) {
    if (error instanceof MergeReadinessError) throw error;
    throw new MergeReadinessError('provider_data_incomplete', `provider returned invalid JSON: gh ${args.join(' ')}`, error);
  }
}

async function ghAbortable(
  input: AbortablePublicationReadinessInput,
  args: readonly string[],
  accepted = [0],
): Promise<unknown> {
  args = githubArguments(input, args);
  if (input.signal?.aborted) {
    throw new MergeReadinessError('provider_unavailable', `provider observation aborted: gh ${args.join(' ')}`);
  }
  const result = input.gh_runner_async
    ? await input.gh_runner_async(args, input.signal)
    : await new Promise<{ status: number | null; stdout: string; stderr: string; error?: Error }>((resolve) => {
      const child = spawn(input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh', [...args], {
        cwd: input.repo_root,
        env: { ...process.env, GH_HOST: 'github.com' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      let abortRequested = false;
      let completion: { status: number | null; stdout: string; stderr: string; error?: Error } | null = null;
      const finish = (result: { status: number | null; stdout: string; stderr: string; error?: Error }) => {
        if (settled) return;
        settled = true;
        input.signal?.removeEventListener('abort', abort);
        resolve(result);
      };
      const maybeFinish = () => {
        if (completion !== null && !abortRequested) finish(completion);
      };
      const abort = () => {
        if (abortRequested || settled) return;
        abortRequested = true;
        void terminateProviderChild(child)
          .then(() => {
            finish(completion ?? {
              status: null,
              stdout,
              stderr,
              error: new Error('provider process did not exit after process-tree termination'),
            });
          })
          .catch((error) => {
            finish({
              status: null,
              stdout,
              stderr,
              error: error instanceof Error ? error : new Error(String(error)),
            });
          });
      };
      input.signal?.addEventListener('abort', abort, { once: true });
      child.stdout.setEncoding('utf-8');
      child.stderr.setEncoding('utf-8');
      child.stdout.on('data', (chunk: string) => { stdout += chunk; });
      child.stderr.on('data', (chunk: string) => { stderr += chunk; });
      child.once('error', (error) => {
        completion = { status: null, stdout, stderr, error };
        maybeFinish();
      });
      child.once('close', (status) => {
        completion = { status, stdout, stderr };
        maybeFinish();
      });
      if (input.signal?.aborted) abort();
    });
  if (input.signal?.aborted || result.error || result.status === null || !accepted.includes(result.status)) {
    const detail = input.signal?.aborted ? 'aborted' : (result.stderr || result.error?.message || `exit ${result.status}`).trim();
    throw new MergeReadinessError('provider_unavailable', `provider observation failed: gh ${args.join(' ')}: ${detail}`, result.error);
  }
  try {
    const value = JSON.parse(result.stdout);
    if (args[0] === 'api' && accepted.includes(1)) {
      if (result.status !== 0 && value?.status !== '404') {
        throw new MergeReadinessError('provider_unavailable', 'rollback reporter activation unavailable');
      }
      if (result.status === 0 && value?.status === '404') {
        throw new MergeReadinessError('provider_data_incomplete', 'rollback reporter activation HTTP status is inconsistent');
      }
    }
    return value;
  } catch (error) {
    if (error instanceof MergeReadinessError) throw error;
    throw new MergeReadinessError('provider_data_incomplete', `provider returned invalid JSON: gh ${args.join(' ')}`, error);
  }
}

function identityBytes(identity: ProviderIdentity): string {
  const { body: _body, ...fences } = identity;
  return JSON.stringify(fences);
}

function parseProviderPullRequestIdentity(prNumber: number, repoValue: unknown, prValue: unknown): ProviderIdentity {
  const repo = object(repoValue, 'provider repository');
  const pr = object(prValue, 'provider PR');
  const number = pr.number;
  if (!Number.isInteger(number) || number !== prNumber) {
    throw new MergeReadinessError('provider_data_incomplete', 'provider PR number does not match the requested PR');
  }
  if (typeof pr.isDraft !== 'boolean') throw new MergeReadinessError('provider_data_incomplete', 'provider PR isDraft is invalid');
  if (!['OPEN', 'CLOSED', 'MERGED'].includes(String(pr.state))) {
    throw new MergeReadinessError('provider_data_incomplete', 'provider PR state is unknown');
  }
  // gh pr view serializes an absent GraphQL review decision as an empty string.
  const reviewDecision = pr.reviewDecision === '' ? null : pr.reviewDecision;
  if (reviewDecision !== null && (typeof reviewDecision !== 'string'
    || !['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'].includes(reviewDecision))) {
    throw new MergeReadinessError('provider_data_incomplete', 'provider PR reviewDecision is unknown');
  }
  if (pr.mergeable !== 'MERGEABLE' && pr.mergeable !== 'CONFLICTING'
    && !(pr.state === 'MERGED' && pr.mergeable === 'UNKNOWN')) {
    throw new MergeReadinessError('provider_data_incomplete', 'provider PR mergeable is unknown');
  }
  const identity: ProviderIdentity = Object.freeze({
    provider_repo_id: string(repo.id, 'provider repository id'),
    repo_name_with_owner: string(repo.nameWithOwner, 'provider repository nameWithOwner'),
    pr_number: number as number,
    pr_url: string(pr.url, 'provider PR URL'),
    state: string(pr.state, 'provider PR state'),
    is_draft: pr.isDraft,
    head_sha: string(pr.headRefOid, 'provider PR head OID'),
    head_ref: string(pr.headRefName, 'provider PR head ref'),
    base_sha: string(pr.baseRefOid, 'provider PR base OID'),
    base_ref: string(pr.baseRefName, 'provider PR base ref'),
    body: typeof pr.body === 'string' ? pr.body : '',
    review_decision: reviewDecision,
    mergeable: pr.mergeable,
  });
  return identity;
}

function parseProviderReadinessFacts(
  identity: ProviderIdentity,
  checksValue: unknown,
  rollbackBoundary: ProviderMergeReadinessFactsV1['rollback_boundary'],
  graphValue: unknown,
): ProviderMergeReadinessFactsV1 {
  if (!Array.isArray(checksValue)) throw new MergeReadinessError('provider_data_incomplete', 'provider required checks must be an array');
  const checks = checksValue.map((entry) => {
    const check = object(entry, 'provider required check');
    if (!['pass', 'fail', 'pending', 'skipping', 'cancel'].includes(String(check.bucket))) {
      throw new MergeReadinessError('provider_data_incomplete', 'provider required check bucket is unknown');
    }
    return Object.freeze({ name: string(check.name, 'provider required check name'), bucket: check.bucket as 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel' });
  });
  const graph = object(graphValue, 'provider GraphQL result');
  if (graph.errors !== undefined && (!Array.isArray(graph.errors) || graph.errors.length > 0)) {
    throw new MergeReadinessError('provider_data_incomplete', 'provider review query has errors');
  }
  const node = object(object(graph.data, 'provider GraphQL data').node, 'provider repository node');
  const pr = object(node.pullRequest, 'provider review PR');
  if (node.id !== identity.provider_repo_id || pr.number !== identity.pr_number
    || pr.headRefOid !== identity.head_sha || pr.baseRefOid !== identity.base_sha) {
    throw new MergeReadinessError('provider_data_incomplete', 'provider reviews do not bind this PR/head/base');
  }
  if (pr.reviewDecision !== identity.review_decision) {
    throw new MergeReadinessError('provider_data_incomplete', 'provider review decision changed during read');
  }
  const threads = object(pr.reviewThreads, 'provider review threads');
  const reviews = object(pr.latestOpinionatedReviews, 'provider latest opinionated reviews');
  for (const connection of [threads, reviews]) {
    if (object(connection.pageInfo, 'provider review pageInfo').hasNextPage !== false || !Array.isArray(connection.nodes)) {
      throw new MergeReadinessError('provider_data_incomplete', 'provider reviews and threads were not exhaustively observed');
    }
  }
  let unresolved = 0;
  for (const entry of threads.nodes as unknown[]) {
    const thread = object(entry, 'provider review thread');
    if (typeof thread.isResolved !== 'boolean') throw new MergeReadinessError('provider_data_incomplete', 'provider review thread isResolved is invalid');
    if (!thread.isResolved) unresolved++;
  }
  let changesRequested = pr.reviewDecision === 'CHANGES_REQUESTED';
  for (const entry of reviews.nodes as unknown[]) {
    const review = object(entry, 'provider review');
    if (!['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING'].includes(String(review.state))) {
      throw new MergeReadinessError('provider_data_incomplete', 'provider review state is unknown');
    }
    if (review.state === 'CHANGES_REQUESTED') changesRequested = true;
  }
  return Object.freeze({
    state: identity.state,
    is_draft: identity.is_draft,
    head_sha: identity.head_sha,
    base_sha: identity.base_sha,
    review_decision: changesRequested ? 'CHANGES_REQUESTED' : identity.review_decision,
    unresolved_thread_count: unresolved,
    rollback_boundary: rollbackBoundary,
    checks: Object.freeze(checks),
    mergeable: identity.mergeable,
  });
}

function providerReviewArgs(identity: ProviderIdentity): string[] {
  // Latest opinionated reviews preserve a change request across later comment-only reviews.
  const query = 'query($repoId:ID!,$number:Int!){node(id:$repoId){id ... on Repository{pullRequest(number:$number){number headRefOid baseRefOid reviewDecision latestOpinionatedReviews(first:100){pageInfo{hasNextPage}nodes{state}} reviewThreads(first:100){pageInfo{hasNextPage}nodes{isResolved}}}}}}';
  return ['api', 'graphql', '-f', `query=${query}`, '-F', `repoId=${identity.provider_repo_id}`, '-F', `number=${identity.pr_number}`];
}

function requiredCIRunPath(identity: ProviderIdentity, checksValue: unknown): string {
  if (!Array.isArray(checksValue)) throw new MergeReadinessError('provider_data_incomplete', 'required CI checks unavailable');
  const required = checksValue.filter(check => check?.name === 'Required / CI');
  if (required.length !== 1) throw new MergeReadinessError('provider_data_incomplete', 'exactly one Required / CI check is required');
  let url: URL;
  try { url = new URL(required[0].link); } catch { throw new MergeReadinessError('provider_data_incomplete', 'required CI check URL unavailable'); }
  const segments = url.pathname.split('/').filter(Boolean);
  const [owner, repo] = identity.repo_name_with_owner.split('/');
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || segments.length !== 7
    || segments[0] !== owner || segments[1] !== repo || segments[2] !== 'actions'
    || segments[3] !== 'runs' || segments[5] !== 'job' || !/^\d+$/.test(segments[4]!) || !/^\d+$/.test(segments[6]!)) {
    throw new MergeReadinessError('provider_data_incomplete', 'required CI is not a repository Actions check');
  }
  return `repos/${identity.repo_name_with_owner}/actions/runs/${segments[4]}`;
}
function validateRequiredCIRun(identity: ProviderIdentity, value: unknown, checks: unknown): void {
  const run = object(value, 'required CI run');
  if (run.path !== '.github/workflows/ci.yml' || run.event !== 'pull_request' || run.head_sha !== identity.head_sha
    || !Array.isArray(run.pull_requests) || !run.pull_requests.some(pr => pr?.number === identity.pr_number
      && pr.head?.sha === identity.head_sha && pr.base?.sha === identity.base_sha)) {
    throw new MergeReadinessError('provider_data_incomplete', 'required CI does not bind this PR/head/base');
  }
  const required = (checks as { name: string; bucket: string }[]).find(check => check.name === 'Required / CI')!;
  if (required.bucket === 'pass' && (run.status !== 'completed' || run.conclusion !== 'success')) {
    throw new MergeReadinessError('provider_data_incomplete', 'green required check has no successful trusted CI run');
  }
}

/** One read protocol for synchronous and abortable consumers; reads only the current commit boundary. */
function* rollbackBoundary(identity: ProviderIdentity): Generator<string, ProviderMergeReadinessFactsV1['rollback_boundary'], unknown> {
  const validSha = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) && value !== '0'.repeat(40);
  if (!validSha(identity.base_sha)) throw new MergeReadinessError('provider_data_incomplete', 'rollback base SHA is invalid');
  const root = `repos/${identity.repo_name_with_owner}`;
  const activation = object(yield `${root}/contents/.github/workflows/ci-report.yml?ref=${identity.base_sha}`, 'rollback reporter activation');
  if (activation.status === '404') return Object.freeze({ status: 'not_active' });
  if (activation.status || activation.type !== 'file' || activation.path !== '.github/workflows/ci-report.yml' || !validSha(activation.sha)) {
    throw new MergeReadinessError('provider_data_incomplete', 'rollback reporter activation unavailable');
  }
  const associations = yield `${root}/commits/${identity.base_sha}/pulls?per_page=100`;
  if (!Array.isArray(associations) || associations.length >= 100) throw new MergeReadinessError('provider_data_incomplete', 'parent PR associations incomplete');
  const merged = associations.map(entry => {
    const pr = object(entry, 'parent PR association');
    const base = object(pr.base, 'parent PR base');
    if (typeof base.ref !== 'string' || (pr.merged_at !== null && (typeof pr.merged_at !== 'string' || pr.merged_at.trim() === ''))
      || (pr.merge_commit_sha !== null && !validSha(pr.merge_commit_sha))) {
      throw new MergeReadinessError('provider_data_incomplete', 'parent PR association is incomplete');
    }
    return pr;
  }).filter(pr => pr.merged_at !== null && (pr.base as Record<string, unknown>).ref === 'main' && pr.merge_commit_sha === identity.base_sha);
  const prNumber = merged[0]?.number;
  if (merged.length !== 1 || typeof prNumber !== 'number' || !Number.isSafeInteger(prNumber) || prNumber < 1) {
    throw new MergeReadinessError('provider_data_incomplete', 'activated reporter parent is not an exact single merged PR');
  }
  const commit = object(yield `${root}/git/commits/${identity.base_sha}`, 'main parent commit');
  if (commit.sha !== identity.base_sha || !Array.isArray(commit.parents) || commit.parents.length !== 1
    || !validSha(commit.parents[0]?.sha) || commit.parents[0].sha === identity.base_sha) {
    throw new MergeReadinessError('provider_data_incomplete', 'rollback parent is not a single commit boundary');
  }
  const detail = object(yield `${root}/pulls/${prNumber}`, 'merged parent PR detail');
  if (detail.number !== prNumber || detail.merged !== true || detail.merge_commit_sha !== identity.base_sha
    || object(detail.base, 'merged parent PR detail base').ref !== 'main') {
    throw new MergeReadinessError('provider_data_incomplete', 'merged parent PR detail does not match the rollback boundary');
  }
  const parentAssociations = yield `${root}/commits/${commit.parents[0].sha}/pulls?per_page=100`;
  if (!Array.isArray(parentAssociations) || parentAssociations.length >= 100) {
    throw new MergeReadinessError('provider_data_incomplete', 'rollback parent PR associations incomplete');
  }
  const parentPRs = parentAssociations.map(entry => {
    const pr = object(entry, 'rollback parent PR association');
    if (typeof pr.number !== 'number' || !Number.isSafeInteger(pr.number) || pr.number < 1) {
      throw new MergeReadinessError('provider_data_incomplete', 'rollback parent PR number unavailable');
    }
    return pr.number;
  });
  if (parentPRs.includes(prNumber)) {
    throw new MergeReadinessError('provider_data_incomplete', `Automatic rollback cannot revert only the last commit of multi-commit rebase PR #${prNumber}`);
  }
  return Object.freeze({ status: 'ready', pr_number: prNumber, before_sha: commit.parents[0].sha, after_sha: identity.base_sha });
}

export function observeProviderReadinessFacts(identity: ProviderIdentity, receipt: Pick<PullRequestSelectionV2, 'pr_number'>, input: PublicationReadinessInput): ProviderMergeReadinessFactsV1 {
  const checks = gh(input, [
    'pr', 'checks', String(receipt.pr_number), '--required', '--json', 'name,bucket,link',
  ], [0, 1, 8]);
  validateRequiredCIRun(identity, gh(input, ['api', requiredCIRunPath(identity, checks)]), checks);
  const boundary = rollbackBoundary(identity);
  let request = boundary.next();
  while (!request.done) request = boundary.next(gh(input, ['api', request.value], request.value.includes('/contents/') ? [0, 1] : [0]));
  return parseProviderReadinessFacts(identity, checks, request.value, gh(input, providerReviewArgs(identity)));
}

export async function observeProviderReadinessFactsAbortable(
  identity: ProviderIdentity,
  receipt: Pick<PullRequestSelectionV2, 'pr_number'>,
  input: AbortablePublicationReadinessInput,
): Promise<ProviderMergeReadinessFactsV1> {
  const checks = await ghAbortable(input, [
    'pr', 'checks', String(receipt.pr_number), '--required', '--json', 'name,bucket,link',
  ], [0, 1, 8]);
  validateRequiredCIRun(identity, await ghAbortable(input, ['api', requiredCIRunPath(identity, checks)]), checks);
  const boundary = rollbackBoundary(identity);
  let request = boundary.next();
  while (!request.done) request = boundary.next(await ghAbortable(input, ['api', request.value], request.value.includes('/contents/') ? [0, 1] : [0]));
  return parseProviderReadinessFacts(identity, checks, request.value, await ghAbortable(input, providerReviewArgs(identity)));
}

export interface PullRequestReadinessInput extends PublicationReadinessInput {
  readonly repository: string;
  readonly provider_repository_id: string;
  readonly pr_number: number;
  readonly expected_head_sha: string;
  readonly expected_base_sha: string;
}

export function validatePullRequestSelection(value: unknown): PullRequestSelectionV2 {
  const selection = object(value, 'PR selection');
  if (Object.keys(selection).sort().join(',') !== ['provider_repository_id','repository','pr_number','expected_head_sha','expected_base_sha'].sort().join(',')) throw new MergeReadinessError('provider_data_incomplete', 'PR selection fields are invalid');
  if (typeof selection.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(selection.repository)
    || typeof selection.provider_repository_id !== 'string' || !/^[1-9][0-9]*$/.test(selection.provider_repository_id)
    || !Number.isSafeInteger(selection.pr_number) || Number(selection.pr_number) < 1
    || ![selection.expected_head_sha,selection.expected_base_sha].every(sha => typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha) && sha !== '0'.repeat(40))) throw new MergeReadinessError('provider_data_incomplete', 'explicit PR identity and expected head/base are required');
  return Object.freeze({ provider_repository_id: selection.provider_repository_id, repository: selection.repository,
    pr_number: Number(selection.pr_number), expected_head_sha: selection.expected_head_sha as string, expected_base_sha: selection.expected_base_sha as string });
}

function selectionOf(input: PullRequestReadinessInput): PullRequestSelectionV2 {
  if ('publication_id' in input) throw new MergeReadinessError('provider_data_incomplete', 'publication_id is not a provider selection');
  return validatePullRequestSelection({ provider_repository_id: input.provider_repository_id, repository: input.repository,
    pr_number: input.pr_number, expected_head_sha: input.expected_head_sha, expected_base_sha: input.expected_base_sha });
}

function confirmRepository(input: PullRequestReadinessInput, identity: ProviderIdentity, rest: unknown): ProviderIdentity {
  const repository = object(rest, 'REST repository');
  if (!Number.isSafeInteger(repository.id) || Number(repository.id) < 1 || String(repository.id) !== input.provider_repository_id
    || repository.node_id !== identity.provider_repo_id || repository.full_name !== input.repository
    || identity.repo_name_with_owner !== input.repository || identity.base_ref !== 'main') throw new MergeReadinessError('provider_data_incomplete', 'provider repository or main target does not match selection');
  return identity;
}

const PR_IDENTITY_FIELDS = 'number,url,state,isDraft,headRefOid,headRefName,baseRefOid,baseRefName,body,reviewDecision,mergeable';
export function observeProviderReadinessIdentity(input: PullRequestReadinessInput): ProviderIdentity {
  selectionOf(input);
  const identity = parseProviderPullRequestIdentity(input.pr_number,
    gh(input, ['repo', 'view', '--json', 'id,nameWithOwner']),
    gh(input, ['pr', 'view', String(input.pr_number), '--json', PR_IDENTITY_FIELDS]));
  return confirmRepository(input, identity, gh(input, ['api', `repos/${input.repository}`]));
}

export interface AbortablePullRequestReadinessInput extends Omit<AbortablePublicationReadinessInput, 'repository'>, PullRequestSelectionV2 {}
export async function observeProviderReadinessIdentityAbortable(input: AbortablePullRequestReadinessInput): Promise<ProviderIdentity> {
  selectionOf(input);
  const repo = await ghAbortable(input, ['repo', 'view', '--json', 'id,nameWithOwner']);
  const pr = await ghAbortable(input, ['pr', 'view', String(input.pr_number), '--json', PR_IDENTITY_FIELDS]);
  return confirmRepository(input, parseProviderPullRequestIdentity(input.pr_number, repo, pr), await ghAbortable(input, ['api', `repos/${input.repository}`]));
}

function readinessProjection(input: PullRequestReadinessInput, provider: ProviderMergeReadinessFactsV1 | null, observation: MergeReadinessObservation): PullRequestReadinessV2 {
  return Object.freeze({ protocol: 2, kind: 'repo-harness-pull-request-readiness', ...selectionOf(input),
    ...projectPullRequestMergeReadiness({ expected_head_sha: input.expected_head_sha, expected_base_sha: input.expected_base_sha,
      integration_mode: provider?.state === 'MERGED' ? 'ancestor' : 'unmerged', observation, provider }) });
}

/** One observation loop for both open-PR readiness and exact merged-PR evidence. */
function stablePullRequestRound<T>(input: PullRequestReadinessInput, observeExtra: (identity: ProviderIdentity) => T) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = observeProviderReadinessIdentity(input);
    const extra = observeExtra(before);
    const facts = observeProviderReadinessFacts(before, input, input);
    const after = observeProviderReadinessIdentity(input);
    const extraAfter = observeExtra(after);
    if (identityBytes(before) === identityBytes(after) && JSON.stringify(extra) === JSON.stringify(extraAfter)) {
      return { identity: after, facts, extra };
    }
  }
  return null;
}

/** Ordinary main PRs consume the shared provider decoder without a receipt or Lease. */
export function collectPullRequestMergeReadiness(input: PullRequestReadinessInput): PullRequestReadinessV2 {
  selectionOf(input);
  try {
    const round = stablePullRequestRound(input, () => null);
    return round ? readinessProjection(input, round.facts, 'stable') : readinessProjection(input, null, 'changed_during_read');
  } catch (error) {
    if (!(error instanceof MergeReadinessError)) throw error;
    return readinessProjection(input, null, error.code);
  }
}

export async function collectPullRequestMergeReadinessAbortable(input: AbortablePullRequestReadinessInput): Promise<PullRequestReadinessV2> {
  selectionOf(input);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = await observeProviderReadinessIdentityAbortable(input);
      const facts = await observeProviderReadinessFactsAbortable(before, input, input);
      const after = await observeProviderReadinessIdentityAbortable(input);
      if (identityBytes(before) === identityBytes(after)) return readinessProjection(input, facts, 'stable');
    }
    return readinessProjection(input, null, 'changed_during_read');
  } catch (error) {
    if (!(error instanceof MergeReadinessError)) throw error;
    return readinessProjection(input, null, error.code);
  }
}


export interface PullRequestIntegrationInput extends PullRequestReadinessInput {
  readonly issue_id: string;
  readonly issue_number: number;
}

/** Provider proof only. The integration consumer must also prove exact local tree and ancestry. */
export function collectPullRequestIntegration(input: PullRequestIntegrationInput): { readonly merge_commit_sha: string; readonly merge_tree_sha: string } {
  if (!Number.isSafeInteger(input.issue_number) || input.issue_number < 1 || !input.issue_id?.trim()) {
    throw new MergeReadinessError('provider_data_incomplete', 'explicit issue identity is required');
  }
  const round = stablePullRequestRound(input, identity => {
    const root = `repos/${input.repository}`;
    const issue = object(gh(input, ['api', `${root}/issues/${input.issue_number}`]), 'selected issue');
    if (!Number.isSafeInteger(issue.id) || Number(issue.id) < 1 || String(issue.id) !== input.issue_id || issue.number !== input.issue_number || 'pull_request' in issue) {
      throw new MergeReadinessError('provider_data_incomplete', 'selected issue identity changed');
    }
    const detail = object(gh(input, ['api', `${root}/pulls/${input.pr_number}`]), 'merged PR');
    const base = object(detail.base, 'merged PR base');
    const head = object(detail.head, 'merged PR head');
    const validSha = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) && value !== '0'.repeat(40);
    if (identity.state !== 'MERGED' || detail.merged !== true || detail.number !== input.pr_number
      || String(object(base.repo, 'merged PR repository').id) !== input.provider_repository_id
      || object(base.repo, 'merged PR repository').node_id !== identity.provider_repo_id
      || base.ref !== 'main' || base.sha !== input.expected_base_sha || head.sha !== input.expected_head_sha
      || !validSha(detail.merge_commit_sha)) throw new MergeReadinessError('provider_data_incomplete', 'exact merged PR identity is unavailable');
    const commit = object(gh(input, ['api', `${root}/git/commits/${detail.merge_commit_sha}`]), 'provider merge commit');
    const tree = object(commit.tree, 'provider merge tree');
    if (commit.sha !== detail.merge_commit_sha || !validSha(tree.sha) || !Array.isArray(commit.parents)
      || commit.parents.length === 0 || !commit.parents.every(parent => validSha(object(parent, 'merge parent').sha))) {
      throw new MergeReadinessError('provider_data_incomplete', 'merge commit/tree or parents are unavailable');
    }
    return { issue_id: String(issue.id), issue_number: issue.number, merge_commit_sha: detail.merge_commit_sha, merge_tree_sha: tree.sha };
  });
  if (!round) throw new MergeReadinessError('provider_data_incomplete', 'integration selection changed during read');
  const verdict = projectPullRequestMergeReadiness({ expected_head_sha: input.expected_head_sha,
    expected_base_sha: input.expected_base_sha, integration_mode: 'ancestor', observation: 'stable', provider: round.facts });
  // These three blockers describe merge lifecycle, not CI/review acceptance of an already merged PR.
  const blockers = verdict.blockers.filter(blocker => !['already_integrated', 'pr_not_open', 'not_mergeable'].includes(blocker.code));
  if (blockers.length) throw new MergeReadinessError('provider_data_incomplete', `integrated PR evidence refused: ${blockers.map(blocker => blocker.code).join(', ')}`);
  return Object.freeze({ merge_commit_sha: round.extra.merge_commit_sha, merge_tree_sha: round.extra.merge_tree_sha });
}

export interface FleetReadinessV2 {
  readonly protocol: 2;
  readonly kind: 'repo-harness-fleet-readiness';
  readonly pull_requests: readonly PullRequestReadinessV2[];
}

/** Explicit PRs preserve caller order. No local task/publication store selects authority. */
export function resolveFleetReadiness(input: PublicationReadinessInput & { readonly pull_requests: readonly PullRequestSelectionV2[] }): FleetReadinessV2 {
  if (!Array.isArray(input.pull_requests) || input.pull_requests.length === 0) throw new MergeReadinessError('provider_data_incomplete', 'explicit pull_requests are required');
  const selected = input.pull_requests.map(validatePullRequestSelection);
  return Object.freeze({ protocol: 2, kind: 'repo-harness-fleet-readiness',
    pull_requests: Object.freeze(selected.map(selection => collectPullRequestMergeReadiness({ ...input, ...selection }))) });
}
