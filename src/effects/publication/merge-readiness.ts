import { gitExecFileSync } from '../git/runner';
import { spawn, spawnSync } from 'child_process';
import {
  assessRequiredCheckFailure,
  type RequiredCheckAttemptObservationV1,
  type RequiredCheckChildObservationV1,
  type RequiredCheckFailureEvidenceV1,
} from '../../core/evidence/required-check-evidence';
import type { RequiredCheckTestExecutionV1 } from '../../core/evidence/test-execution-evidence';
import {
  parseWorkflowJobs,
  resolveWorkflowJob,
  workflowJobMatchesName,
  type WorkflowJobV1,
} from '../../core/evidence/workflow-needs';
import {
  readTestExecutionEvidence,
  readTestExecutionEvidenceAbortable,
} from './test-execution-evidence';
import {
  projectPullRequestMergeReadiness,
  unobservedStackDetail,
  type MergeReadinessObservation,
  type MergeReadinessStackDetailV1,
  type MergeReadinessStackEntryV1,
  type PullRequestReadinessV2,
  type PullRequestSelectionV2,
  type ProviderMergeReadinessFactsV1,
  type RequiredCheckBucketV1,
  type RequiredCheckCoverageFactsV1,
} from '../../core/publication/merge-readiness';
import {
  PUBLICATION_POLICY_PATH,
  policyFileFromContents,
  requiredCheckCoveragePolicyAtRef,
  type PolicyFileAtRef,
  type RequiredCheckCoveragePolicyAtRef,
} from '../../core/publication/acceptance-merge-policy';
export type MergeReadinessErrorCode =
  | 'provider_unavailable'
  | 'provider_data_incomplete';

export class MergeReadinessError extends Error {
  constructor(readonly code: MergeReadinessErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'MergeReadinessError';
  }
}

/** Registry-bound adapters must bind local PR authority before querying the provider.
 * Independent explicit PR CLI observations do not use this registry restriction. */
export function assertLocalPullRequestRepository(repoRoot: string, repository: string): void {
  let remote: string;
  try {
    remote = gitExecFileSync(['remote', 'get-url', 'origin'], {
      cwd: repoRoot, encoding: 'utf8', timeout: 5_000, maxBuffer: 16_384,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw new MergeReadinessError('provider_data_incomplete', 'local GitHub origin is unavailable', error);
  }
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/u.exec(remote);
  if (!match || match[1]!.toLowerCase() !== repository.toLowerCase()) {
    throw new MergeReadinessError('provider_data_incomplete', 'selected PR repository does not match local GitHub origin');
  }
}

/** One attempt whose test-level execution results the transport must answer. */
export interface TestExecutionReadRequest {
  readonly repository: string;
  readonly run_id: number;
  readonly attempt: number;
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
  /** Internal effect/test seam for the rerun attempt's test-level execution source. */
  readonly test_execution_reader?: (request: TestExecutionReadRequest) => RequiredCheckTestExecutionV1;
  /**
   * Internal effect seam: the publication executor already read this file at
   * the base SHA for the acceptance-merge switch. Readiness reuses it instead
   * of a second contents read. The ref must be the expected base.
   */
  readonly policy_file_at_base?: PolicyFileAtRef;
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
  /** Async test seam for the rerun attempt's test-level execution source. */
  readonly test_execution_reader_async?: (request: TestExecutionReadRequest, signal: AbortSignal | undefined) => Promise<RequiredCheckTestExecutionV1>;
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
  /** The provider's changed-file count for this head; drives the exact page count. */
  readonly changed_files: number;
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

function validSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) && value !== '0'.repeat(40);
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

interface GhObservation {
  readonly status: number;
  readonly value: unknown;
}

function ghObserve(input: PublicationReadinessInput, args: readonly string[], accepted: readonly number[]): GhObservation {
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
    return { status: result.status, value: JSON.parse(result.stdout) };
  } catch (error) {
    throw new MergeReadinessError('provider_data_incomplete', `provider returned invalid JSON: gh ${args.join(' ')}`, error);
  }
}

function gh(input: PublicationReadinessInput, args: readonly string[], accepted = [0]): unknown {
  const observed = ghObserve(input, args, accepted);
  if (args[0] === 'api' && accepted.includes(1)) {
    if (observed.status !== 0 && (observed.value as { status?: unknown } | null)?.status !== '404') {
      throw new MergeReadinessError('provider_unavailable', 'rollback reporter activation unavailable');
    }
    if (observed.status === 0 && (observed.value as { status?: unknown } | null)?.status === '404') {
      throw new MergeReadinessError('provider_data_incomplete', 'rollback reporter activation HTTP status is inconsistent');
    }
  }
  return observed.value;
}

/** A provider read where 404 is a real answer: a missing policy file, not a provider outage. */
function ghOptional(input: PublicationReadinessInput, args: readonly string[]): unknown | null {
  const observed = ghObserve(input, args, [0, 1]);
  if (observed.status === 0) {
    if ((observed.value as { status?: unknown } | null)?.status === '404') {
      throw new MergeReadinessError('provider_data_incomplete', 'provider returned a 404 with a success status');
    }
    return observed.value;
  }
  if ((observed.value as { status?: unknown } | null)?.status === '404') return null;
  throw new MergeReadinessError('provider_unavailable', `provider observation failed: gh ${args.join(' ')}: HTTP ${observed.status}`);
}

async function ghAbortableObserve(
  input: AbortablePublicationReadinessInput,
  args: readonly string[],
  accepted: readonly number[],
): Promise<GhObservation> {
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
    return { status: result.status, value: JSON.parse(result.stdout) };
  } catch (error) {
    throw new MergeReadinessError('provider_data_incomplete', `provider returned invalid JSON: gh ${args.join(' ')}`, error);
  }
}

async function ghAbortable(
  input: AbortablePublicationReadinessInput,
  args: readonly string[],
  accepted = [0],
): Promise<unknown> {
  const observed = await ghAbortableObserve(input, args, accepted);
  if (args[0] === 'api' && accepted.includes(1)) {
    if (observed.status !== 0 && (observed.value as { status?: unknown } | null)?.status !== '404') {
      throw new MergeReadinessError('provider_unavailable', 'rollback reporter activation unavailable');
    }
    if (observed.status === 0 && (observed.value as { status?: unknown } | null)?.status === '404') {
      throw new MergeReadinessError('provider_data_incomplete', 'rollback reporter activation HTTP status is inconsistent');
    }
  }
  return observed.value;
}

/** A provider read where 404 is a real answer: a missing policy file, not a provider outage. */
async function ghAbortableOptional(
  input: AbortablePublicationReadinessInput,
  args: readonly string[],
): Promise<unknown | null> {
  const observed = await ghAbortableObserve(input, args, [0, 1]);
  if (observed.status === 0) {
    if ((observed.value as { status?: unknown } | null)?.status === '404') {
      throw new MergeReadinessError('provider_data_incomplete', 'provider returned a 404 with a success status');
    }
    return observed.value;
  }
  if ((observed.value as { status?: unknown } | null)?.status === '404') return null;
  throw new MergeReadinessError('provider_unavailable', `provider observation failed: gh ${args.join(' ')}: HTTP ${observed.status}`);
}

function identityBytes(identity: ProviderIdentity): string {
  const { body: _body, ...fences } = identity;
  return JSON.stringify(fences);
}

/** The provider's changed-file count; it must be present, because it sets the exact page count. */
function changedFiles(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new MergeReadinessError('provider_data_incomplete', 'provider PR changedFiles is invalid');
  }
  return Number(value);
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
    changed_files: changedFiles(pr.changedFiles),
    mergeable: pr.mergeable,
  });
  return identity;
}

function parseProviderReadinessFacts(
  identity: ProviderIdentity,
  checksValue: unknown,
  rollbackBoundary: ProviderMergeReadinessFactsV1['rollback_boundary'],
  graphValue: unknown,
  checkFailures: readonly RequiredCheckFailureEvidenceV1[],
  coverage: RequiredCheckCoverageFactsV1,
): ProviderMergeReadinessFactsV1 {
  if (!Array.isArray(checksValue)) throw new MergeReadinessError('provider_data_incomplete', 'provider required checks must be an array');
  const checks = checksValue.map(providerCheck).map(({ name, bucket }) => Object.freeze({ name, bucket }));
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
    check_failures: Object.freeze([...checkFailures]),
    required_check_coverage: coverage,
    mergeable: identity.mergeable,
  });
}

function providerReviewArgs(identity: ProviderIdentity): string[] {
  // Latest opinionated reviews preserve a change request across later comment-only reviews.
  const query = 'query($repoId:ID!,$number:Int!){node(id:$repoId){id ... on Repository{pullRequest(number:$number){number headRefOid baseRefOid reviewDecision latestOpinionatedReviews(first:100){pageInfo{hasNextPage}nodes{state}} reviewThreads(first:100){pageInfo{hasNextPage}nodes{isResolved}}}}}}';
  return ['api', 'graphql', '-f', `query=${query}`, '-F', `repoId=${identity.provider_repo_id}`, '-F', `number=${identity.pr_number}`];
}

type ProviderCheckBucket = RequiredCheckBucketV1;

interface ProviderCheck {
  readonly name: string;
  readonly bucket: ProviderCheckBucket;
  readonly link: string;
}

function providerCheck(value: unknown): ProviderCheck {
  const check = object(value, 'provider required check');
  if (typeof check.bucket !== 'string'
    || !['pass', 'fail', 'pending', 'skipping', 'cancel'].includes(check.bucket)) {
    throw new MergeReadinessError('provider_data_incomplete', 'provider required check bucket is unknown');
  }
  return Object.freeze({
    name: string(check.name, 'provider required check name'),
    bucket: check.bucket as ProviderCheckBucket,
    // A required check can be external and have no Actions link; only
    // Required / CI is required to link one.
    link: typeof check.link === 'string' ? check.link : '',
  });
}

function checkArray(value: unknown): ProviderCheck[] {
  if (!Array.isArray(value)) throw new MergeReadinessError('provider_data_incomplete', 'provider required checks must be an array');
  return value.map(providerCheck);
}

function requiredCIRunPath(identity: ProviderIdentity, checks: readonly ProviderCheck[]): string {
  const required = checks.filter(check => check.name === 'Required / CI');
  if (required.length !== 1) throw new MergeReadinessError('provider_data_incomplete', 'exactly one Required / CI check is required');
  return checkLink(identity, required[0]!).run_api_path;
}

interface RequiredCheckLink {
  readonly run_id: number;
  readonly job_id: number;
  readonly run_api_path: string;
  readonly job_url: string;
}

function checkLink(identity: ProviderIdentity, check: ProviderCheck): RequiredCheckLink {
  let url: URL;
  try { url = new URL(check.link); } catch { throw new MergeReadinessError('provider_data_incomplete', 'required CI check URL unavailable'); }
  const segments = url.pathname.split('/').filter(Boolean);
  const [owner, repo] = identity.repo_name_with_owner.split('/');
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || segments.length !== 7
    || segments[0] !== owner || segments[1] !== repo || segments[2] !== 'actions'
    || segments[3] !== 'runs' || segments[5] !== 'job' || !/^\d+$/.test(segments[4]!) || !/^\d+$/.test(segments[6]!)) {
    throw new MergeReadinessError('provider_data_incomplete', 'required CI is not a repository Actions check');
  }
  return Object.freeze({
    run_id: Number(segments[4]),
    job_id: Number(segments[6]),
    run_api_path: `repos/${identity.repo_name_with_owner}/actions/runs/${segments[4]}`,
    job_url: check.link,
  });
}

interface RequiredCheckRunFacts {
  readonly path: string;
  readonly head_sha: string;
  readonly run_attempt: number;
  readonly workflow_id: number | null;
}

function requiredCheckRunFacts(identity: ProviderIdentity, value: unknown, label: string): RequiredCheckRunFacts {
  const run = object(value, label);
  if (typeof run.path !== 'string' || run.path.trim() === '' || typeof run.event !== 'string'
    || run.head_sha !== identity.head_sha
    || !Array.isArray(run.pull_requests) || !run.pull_requests.some(pr => pr?.number === identity.pr_number
      && pr.head?.sha === identity.head_sha && pr.base?.sha === identity.base_sha)) {
    throw new MergeReadinessError('provider_data_incomplete', `${label} does not bind this PR/head/base`);
  }
  const attempt = run.run_attempt === undefined ? 1 : run.run_attempt;
  if (!Number.isSafeInteger(attempt) || Number(attempt) < 1) {
    throw new MergeReadinessError('provider_data_incomplete', `${label} attempt is invalid`);
  }
  return Object.freeze({
    path: run.path,
    head_sha: run.head_sha,
    run_attempt: Number(attempt),
    workflow_id: Number.isSafeInteger(run.workflow_id) && Number(run.workflow_id) > 0 ? Number(run.workflow_id) : null,
  });
}

function validateRequiredCIRun(identity: ProviderIdentity, value: unknown, checks: readonly ProviderCheck[]): RequiredCheckRunFacts {
  const run = object(value, 'required CI run');
  if (run.path !== '.github/workflows/ci.yml' || run.event !== 'pull_request') {
    throw new MergeReadinessError('provider_data_incomplete', 'required CI does not bind this PR/head/base');
  }
  const facts = requiredCheckRunFacts(identity, value, 'required CI run');
  const required = checks.find(check => check.name === 'Required / CI')!;
  if (required.bucket === 'pass' && (run.status !== 'completed' || run.conclusion !== 'success')) {
    throw new MergeReadinessError('provider_data_incomplete', 'green required check has no successful trusted CI run');
  }
  return facts;
}

type AttemptConclusion = 'success' | 'failure' | 'timed_out' | 'cancelled' | 'skipped' | 'unknown';

function attemptConclusion(value: unknown): AttemptConclusion {
  return ['success', 'failure', 'timed_out', 'cancelled', 'skipped'].includes(String(value))
    ? value as AttemptConclusion : 'unknown';
}

interface AttemptJob {
  readonly id: number;
  readonly name: string;
  readonly conclusion: AttemptConclusion;
  readonly check_run_id: number | null;
  readonly steps: readonly { readonly name: string; readonly conclusion: AttemptConclusion }[];
}

function attemptJob(value: unknown): AttemptJob {
  const job = object(value, 'required check attempt job');
  if (!Number.isSafeInteger(job.id) || Number(job.id) < 1 || typeof job.name !== 'string' || job.name.trim() === '') {
    throw new MergeReadinessError('provider_data_incomplete', 'required check attempt job identity is incomplete');
  }
  if (!Array.isArray(job.steps)) throw new MergeReadinessError('provider_data_incomplete', 'required check attempt steps are unavailable');
  const steps = job.steps.map(entry => {
    const step = object(entry, 'required check attempt step');
    return Object.freeze({ name: string(step.name, 'required check attempt step name'), conclusion: attemptConclusion(step.conclusion) });
  });
  const checkRun = typeof job.check_run_url === 'string'
    ? /^https:\/\/api\.github\.com\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/check-runs\/(\d+)$/u.exec(job.check_run_url)
    : null;
  return Object.freeze({ id: Number(job.id), name: job.name, conclusion: attemptConclusion(job.conclusion),
    check_run_id: checkRun ? Number(checkRun[1]) : null, steps: Object.freeze(steps) });
}

function attemptJobs(value: unknown): AttemptJob[] {
  const page = object(value, 'required check attempt jobs');
  if (!Array.isArray(page.jobs) || !Number.isSafeInteger(page.total_count) || Number(page.total_count) < 1
    || Number(page.total_count) >= 100) {
    throw new MergeReadinessError('provider_data_incomplete', 'required check attempt jobs were not exhaustively observed');
  }
  const jobs = page.jobs.map(attemptJob);
  if (jobs.length !== page.total_count) throw new MergeReadinessError('provider_data_incomplete', 'required check attempt jobs were not exhaustively observed');
  return jobs;
}

interface ProviderRequest {
  /** Provider read arguments. Exactly one of args and test_execution is set. */
  readonly args?: readonly string[];
  /** Best-effort evidence: a missing annotation feed is not a provider outage. */
  readonly optional?: boolean;
  /** Read test-level execution evidence for one attempt; the transport answers it. */
  readonly test_execution?: TestExecutionReadRequest;
}

interface AnnotationEvidence {
  readonly excerpt: string | null;
  readonly tests: readonly string[];
}

/** A test reporter names the failed child in the annotation title or first message line. */
const TEST_IDENTIFIER = /(?:[^\s]+\.(?:test|spec)\.[cm]?[jt]sx?(?::\d+)?|\S+\s+>\s+\S+)/u;

function annotationEvidence(value: unknown): AnnotationEvidence {
  if (!Array.isArray(value)) return Object.freeze({ excerpt: null, tests: Object.freeze([]) });
  const messages: string[] = [];
  const tests: string[] = [];
  for (const entry of value) {
    const annotation = object(entry, 'job annotation');
    if (typeof annotation.title === 'string') {
      const title = annotation.title.trim();
      if (title !== '' && TEST_IDENTIFIER.test(title)) tests.push(title);
    }
    if (typeof annotation.message !== 'string') continue;
    const message = annotation.message.trim();
    if (message === '') continue;
    messages.push(message);
    const firstLine = message.split(/\r?\n/u)[0]!.trim();
    if (TEST_IDENTIFIER.test(firstLine)) tests.push(firstLine);
  }
  const joined = messages.slice(0, 3).join('\n');
  return Object.freeze({
    excerpt: joined === '' ? null : joined.length > 4_000 ? `${joined.slice(0, 4_000)}…` : joined,
    tests: Object.freeze([...new Set(tests)]),
  });
}

const FAILED_ATTEMPT_CONCLUSIONS: ReadonlySet<AttemptConclusion> = new Set(['failure', 'timed_out', 'cancelled']);

const WORKFLOW_PATH = /^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/u;

/** The workflow file content at the run revision; null when it is unavailable or unreadable. */
function workflowDefinitionText(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const file = value as Record<string, unknown>;
  if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') return null;
  try {
    const text = Buffer.from(file.content.replace(/\s/gu, ''), 'base64').toString('utf8');
    return text.trim() === '' ? null : text;
  } catch {
    return null;
  }
}

function attemptObservation(
  job: AttemptJob,
  attempt: number,
  runUrl: string,
  link: RequiredCheckLink,
  annotation: AnnotationEvidence | undefined,
): RequiredCheckAttemptObservationV1 {
  const skipped = job.steps.filter(step => step.conclusion === 'skipped').map(step => step.name);
  const executed = [job.name, ...job.steps.filter(step => step.conclusion !== 'skipped').map(step => step.name)];
  return Object.freeze({
    run_id: link.run_id,
    attempt,
    job_id: job.id,
    job_name: job.name,
    run_url: runUrl,
    job_url: job.id === link.job_id ? link.job_url : `${runUrl}/job/${job.id}`,
    conclusion: job.conclusion,
    steps: Object.freeze(job.steps.filter(step => FAILED_ATTEMPT_CONCLUSIONS.has(step.conclusion)).map(step => step.name)),
    failed_tests: annotation?.tests ?? Object.freeze([]),
    logs_available: false,
    failure_excerpt: annotation?.excerpt ?? null,
    platform_evidence: Object.freeze([]),
    scope: Object.freeze({ executed: Object.freeze(executed), skipped: Object.freeze(skipped) }),
    test_execution: null,
  });
}

/**
 * Reads the attempt history of one required check. A rerun keeps one run id
 * and increments the attempt; this collector follows that link. The linked job
 * is the check itself. When other jobs failed in the same attempt, the
 * collector reads the workflow revision's declared needs and preserves the
 * proven failed children. Without proof the association stays unknown and the
 * summary job keeps the reported failure point.
 */
function* checkEvidence(
  identity: ProviderIdentity,
  check: ProviderCheck,
  run: RequiredCheckRunFacts,
  link: RequiredCheckLink,
): Generator<ProviderRequest, RequiredCheckFailureEvidenceV1 | null, unknown> {
  // A first-attempt green or pending check has no failure history to record.
  if (run.run_attempt === 1 && (check.bucket === 'pass' || check.bucket === 'pending')) return null;
  const pages: AttemptJob[][] = [];
  for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
    pages.push(attemptJobs(yield { args: ['api', `${link.run_api_path}/attempts/${attempt}/jobs?per_page=100`] }));
  }
  const linked = pages.flat().find(job => job.id === link.job_id);
  if (!linked) throw new MergeReadinessError('provider_data_incomplete', 'required check job link does not resolve');
  const linkedJobs = pages.map((page, index) => page.find(job => job.name === linked.name)
    ?? (index + 1 === run.run_attempt ? linked : undefined));
  if (linkedJobs.some(job => job === undefined)) {
    throw new MergeReadinessError('provider_data_incomplete', 'required check rerun did not preserve the failed job');
  }
  const attemptsJobs = linkedJobs as AttemptJob[];
  const otherFailed = pages.flatMap((page, index) =>
    page.filter(job => job.id !== attemptsJobs[index]!.id && FAILED_ATTEMPT_CONCLUSIONS.has(job.conclusion)));

  let association: 'direct' | 'declared_needs' | 'unknown' = 'direct';
  const childAssociations = new Map<string, 'declared_needs' | 'unknown'>();
  if (otherFailed.length > 0) {
    const contentsPath = WORKFLOW_PATH.test(run.path) ? run.path : null;
    const definition = contentsPath === null ? null
      : workflowDefinitionText(yield {
        args: ['api', `repos/${identity.repo_name_with_owner}/contents/${contentsPath}?ref=${run.head_sha}`],
        optional: true,
      });
    const workflow = definition === null ? null : parseWorkflowJobs(definition);
    const entry = workflow === null ? null : resolveWorkflowJob(workflow, linked.name);
    if (entry !== null && entry.needs.length === 0) {
      association = 'direct';
    } else if (workflow !== null && entry !== null) {
      const needJobs = entry.needs
        .map(id => workflow.jobs.find(job => job.id === id))
        .filter((job): job is WorkflowJobV1 => job !== undefined);
      const proven = needJobs.length === entry.needs.length
        ? otherFailed.filter(job => needJobs.some(need => workflowJobMatchesName(need, job.name)))
        : [];
      if (proven.length > 0) {
        association = 'declared_needs';
        for (const job of proven) childAssociations.set(job.name, 'declared_needs');
      } else {
        association = 'unknown';
        for (const job of otherFailed) childAssociations.set(job.name, 'unknown');
      }
    } else {
      association = 'unknown';
      for (const job of otherFailed) childAssociations.set(job.name, 'unknown');
    }
  }

  // Annotations are read once per failed job identity, never invented.
  const annotationJobs = new Map<number, AttemptJob>();
  const noteAnnotations = (job: AttemptJob | undefined): void => {
    if (job === undefined || !FAILED_ATTEMPT_CONCLUSIONS.has(job.conclusion) || job.check_run_id === null) return;
    annotationJobs.set(job.id, job);
  };
  for (const job of attemptsJobs) noteAnnotations(job);
  for (const name of childAssociations.keys()) {
    for (const page of pages) noteAnnotations(page.find(job => job.name === name));
  }
  const annotations = new Map<number, AnnotationEvidence>();
  for (const job of annotationJobs.values()) {
    annotations.set(job.id, annotationEvidence(yield {
      args: ['api', `repos/${identity.repo_name_with_owner}/check-runs/${job.check_run_id}/annotations?per_page=100`],
      optional: true,
    }));
  }

  const runUrl = `https://github.com/${identity.repo_name_with_owner}/actions/runs/${link.run_id}`;
  const latestJob = attemptsJobs[attemptsJobs.length - 1]!;
  let latestTestExecution: RequiredCheckTestExecutionV1 | null = null;
  if (attemptsJobs.length > 1 && latestJob.conclusion === 'success') {
    latestTestExecution = (yield { test_execution: {
      repository: identity.repo_name_with_owner,
      run_id: link.run_id,
      attempt: run.run_attempt,
    } }) as RequiredCheckTestExecutionV1;
  }
  const attempts = attemptsJobs.map((job, index) => attemptObservation(
    job, index + 1, runUrl, link, annotations.get(job.id),
  ));
  if (latestTestExecution !== null) {
    const last = attempts[attempts.length - 1]!;
    attempts[attempts.length - 1] = Object.freeze({ ...last, test_execution: latestTestExecution });
  }
  const children: RequiredCheckChildObservationV1[] = [...childAssociations.entries()].map(([name, childAssociation]) => ({
    job_name: name,
    association: childAssociation,
    attempts: pages.flatMap((page, index) => {
      const job = page.find(entry => entry.name === name);
      return job === undefined ? [] : [attemptObservation(job, index + 1, runUrl, link, annotations.get(job.id))];
    }),
  }));
  const hasFailure = attempts.some(attempt => FAILED_ATTEMPT_CONCLUSIONS.has(attempt.conclusion) || attempt.steps.length > 0)
    || children.some(child => child.attempts.some(attempt =>
      FAILED_ATTEMPT_CONCLUSIONS.has(attempt.conclusion) || attempt.steps.length > 0));
  if (!hasFailure) return null;
  return assessRequiredCheckFailure({
    check_name: check.name,
    head_sha: identity.head_sha,
    base_sha: identity.base_sha,
    merge_tree_sha: null,
    workflow: Object.freeze({ path: run.path, id: run.workflow_id, revision: run.head_sha }),
    attempts: Object.freeze(attempts),
    association,
    children: Object.freeze(children),
    declared_cause: null,
  });
}

/** Shared read protocol; the sync and abortable drivers only differ in transport. */
function* requiredCheckFailures(
  identity: ProviderIdentity,
  checks: readonly ProviderCheck[],
  firstRun: RequiredCheckRunFacts,
): Generator<ProviderRequest, RequiredCheckFailureEvidenceV1[], unknown> {
  const evidence: RequiredCheckFailureEvidenceV1[] = [];
  for (const check of checks) {
    let link: RequiredCheckLink;
    try {
      link = checkLink(identity, check);
    } catch (error) {
      // Only Required / CI must be a repository Actions check. Other required
      // checks keep their bucket and blocker without invented evidence.
      if (check.name === 'Required / CI') throw error;
      continue;
    }
    const run = check.name === 'Required / CI' ? firstRun
      : requiredCheckRunFacts(identity, yield { args: ['api', link.run_api_path] }, 'required check run');
    const failure = yield* checkEvidence(identity, check, run, link);
    if (failure) evidence.push(failure);
  }
  return evidence;
}

function readTestExecutionSync(input: PublicationReadinessInput, request: TestExecutionReadRequest): RequiredCheckTestExecutionV1 {
  try {
    if (input.test_execution_reader !== undefined) return input.test_execution_reader(request);
    return readTestExecutionEvidence({
      repository: request.repository,
      run_id: request.run_id,
      attempt: request.attempt,
      repo_root: input.repo_root,
      gh_bin: input.gh_bin,
    });
  } catch {
    // Test-level evidence is best effort: a failed read is unavailable, never a pass.
    return Object.freeze({ status: 'unavailable' });
  }
}

/** The one read driver: a protocol yields requests, the transport answers them. */
function driveRequestsSync<T>(protocol: Generator<ProviderRequest, T, unknown>, input: PublicationReadinessInput): T {
  let request = protocol.next();
  while (!request.done) {
    let value: unknown = null;
    try {
      value = request.value.test_execution !== undefined
        ? readTestExecutionSync(input, request.value.test_execution)
        : gh(input, request.value.args!);
    } catch (error) {
      if (!request.value.optional) throw error;
    }
    request = protocol.next(value);
  }
  return request.value;
}

async function readTestExecutionAbortable(
  input: AbortablePublicationReadinessInput,
  request: TestExecutionReadRequest,
): Promise<RequiredCheckTestExecutionV1> {
  try {
    if (input.test_execution_reader_async !== undefined) {
      return await input.test_execution_reader_async(request, input.signal);
    }
    return await readTestExecutionEvidenceAbortable({
      repository: request.repository,
      run_id: request.run_id,
      attempt: request.attempt,
      repo_root: input.repo_root,
      gh_bin: input.gh_bin,
    }, input.signal);
  } catch {
    return Object.freeze({ status: 'unavailable' });
  }
}

async function driveRequestsAbortable<T>(
  protocol: Generator<ProviderRequest, T, unknown>,
  input: AbortablePublicationReadinessInput,
): Promise<T> {
  let request = protocol.next();
  while (!request.done) {
    let value: unknown = null;
    try {
      value = request.value.test_execution !== undefined
        ? await readTestExecutionAbortable(input, request.value.test_execution)
        : await ghAbortable(input, request.value.args!);
    } catch (error) {
      if (!request.value.optional) throw error;
    }
    request = protocol.next(value);
  }
  return request.value;
}

const CHANGED_FILE_PAGE_SIZE = 100;
/** GitHub caps the PR file list at 3000 entries; a longer list fails closed instead of looping. */
const CHANGED_FILE_LIMIT = 3000;

interface ChangedFilePage {
  readonly files: readonly { readonly filename: string; readonly previous_filename?: string }[];
}

/**
 * One page of the REST pull-request files view. It is the only provider view
 * that reports a rename source (`previous_filename`), so a protected path
 * cannot be lost by a rename.
 *
 * The page cannot carry a head/base SHA. The enclosing identity fence binds it:
 * readiness reads the PR identity before and after the facts, and a head or
 * base move during the read discards the round as `changed_during_read`.
 */
function changedFilePage(value: unknown): ChangedFilePage {
  if (!Array.isArray(value)) throw new MergeReadinessError('provider_data_incomplete', 'changed files must be an array');
  const files = value.map((entry) => {
    const file = object(entry, 'changed file');
    return Object.freeze({
      filename: string(file.filename, 'changed file name'),
      ...(file.previous_filename === undefined || file.previous_filename === null
        ? {} : { previous_filename: string(file.previous_filename, 'changed file previous name') }),
    });
  });
  return Object.freeze({ files: Object.freeze(files) });
}

/**
 * Every changed path of the PR head, including rename sources. Read only when
 * the coverage block is active. The page count comes from the provider's
 * changed-file count in the identity read, so it is exactly
 * ceil(changed_files / 100): 0 files cost no page and 3000 files cost 30.
 */
function* changedPaths(identity: ProviderIdentity): Generator<ProviderRequest, string[], unknown> {
  if (identity.changed_files > CHANGED_FILE_LIMIT) {
    throw new MergeReadinessError('provider_data_incomplete',
      `the PR reports ${identity.changed_files} changed files; the provider lists at most ${CHANGED_FILE_LIMIT}`);
  }
  const pages = Math.ceil(identity.changed_files / CHANGED_FILE_PAGE_SIZE);
  const files: { readonly filename: string; readonly previous_filename?: string }[] = [];
  for (let page = 1; page <= pages; page++) {
    const parsed = changedFilePage(yield {
      args: ['api', `repos/${identity.repo_name_with_owner}/pulls/${identity.pr_number}/files?per_page=${CHANGED_FILE_PAGE_SIZE}&page=${page}`],
    });
    files.push(...parsed.files);
  }
  if (files.length !== identity.changed_files) {
    throw new MergeReadinessError('provider_data_incomplete',
      `the PR reported ${identity.changed_files} changed files but the provider listed ${files.length}`);
  }
  const paths = files.flatMap((file) => file.previous_filename === undefined ? [file.filename] : [file.filename, file.previous_filename]);
  return [...new Set(paths)].sort();
}

function policyAtRef(contents: unknown, ref: string): PolicyFileAtRef {
  const file = policyFileFromContents(contents);
  if (file === null) throw new MergeReadinessError('provider_data_incomplete', `${PUBLICATION_POLICY_PATH} at ${ref} is not a readable file`);
  return file;
}

function reusedPolicyFile(input: PublicationReadinessInput, ref: string): PolicyFileAtRef | null {
  if (input.policy_file_at_base === undefined) return null;
  const expectedBase = 'expected_base_sha' in input ? (input as { readonly expected_base_sha?: unknown }).expected_base_sha : undefined;
  // The executor read this file at the expected base. A moved base is a cache
  // miss, not a refusal: the normal read reports base_moved_since_verification.
  return expectedBase === ref ? input.policy_file_at_base : null;
}

function coveragePolicy(input: PublicationReadinessInput, ref: string): RequiredCheckCoveragePolicyAtRef {
  const reused = reusedPolicyFile(input, ref);
  if (reused !== null) return requiredCheckCoveragePolicyAtRef(reused);
  const contents = ghOptional(input, ['api', `repos/${input.repository}/contents/${PUBLICATION_POLICY_PATH}?ref=${ref}`]);
  return contents === null ? { status: 'absent' } : requiredCheckCoveragePolicyAtRef(policyAtRef(contents, ref));
}

async function coveragePolicyAbortable(
  input: AbortablePublicationReadinessInput,
  ref: string,
): Promise<RequiredCheckCoveragePolicyAtRef> {
  const reused = reusedPolicyFile(input, ref);
  if (reused !== null) return requiredCheckCoveragePolicyAtRef(reused);
  const contents = await ghAbortableOptional(input, ['api', `repos/${input.repository}/contents/${PUBLICATION_POLICY_PATH}?ref=${ref}`]);
  return contents === null ? { status: 'absent' } : requiredCheckCoveragePolicyAtRef(policyAtRef(contents, ref));
}

/**
 * The all-checks read is the only view that shows a declared check which branch
 * protection does not require. A declared matrix job is usually such a check:
 * it appears in the PR rollup as skipped, and the required list never names it.
 *
 * Read budget for one readiness round:
 * - inactive block: zero extra reads when the executor passes
 *   `policy_file_at_base`, otherwise one policy contents read;
 * - active block: that policy read, exactly ceil(changed_files / 100) REST file
 *   pages from the provider's changed-file count (0 files cost no page, 100
 *   files cost one, 3000 files cost 30) and one all-checks read.
 * So an active PR costs two extra reads with one file page and three with two
 * pages on the executor path, plus the policy read on the standalone path.
 */
function observedCheckFacts(checks: readonly ProviderCheck[]): readonly { readonly name: string; readonly bucket: RequiredCheckBucketV1 }[] {
  return Object.freeze(checks.map(({ name, bucket }) => Object.freeze({ name, bucket })));
}

const ALL_CHECKS_ARGS = (identity: ProviderIdentity): string[] =>
  ['pr', 'checks', String(identity.pr_number), '--json', 'name,bucket,link'];

function coverageFacts(identity: ProviderIdentity, input: PublicationReadinessInput): RequiredCheckCoverageFactsV1 {
  const policy = coveragePolicy(input, identity.base_sha);
  if (policy.status !== 'active') return policy;
  const changed = driveRequestsSync(changedPaths(identity), input);
  const observed = observedCheckFacts(checkArray(gh(input, ALL_CHECKS_ARGS(identity), [0, 1, 8])));
  return Object.freeze({ status: 'active', policy: policy.policy, changed_paths: Object.freeze(changed), observed_checks: observed });
}

async function coverageFactsAbortable(
  identity: ProviderIdentity,
  input: AbortablePublicationReadinessInput,
): Promise<RequiredCheckCoverageFactsV1> {
  const policy = await coveragePolicyAbortable(input, identity.base_sha);
  if (policy.status !== 'active') return policy;
  const changed = await driveRequestsAbortable(changedPaths(identity), input);
  const observed = observedCheckFacts(checkArray(await ghAbortable(input, ALL_CHECKS_ARGS(identity), [0, 1, 8])));
  return Object.freeze({ status: 'active', policy: policy.policy, changed_paths: Object.freeze(changed), observed_checks: observed });
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
  }).filter(pr => pr.merged_at !== null && (pr.base as Record<string, unknown>).ref === identity.base_ref && pr.merge_commit_sha === identity.base_sha);
  const prNumber = merged[0]?.number;
  if (merged.length !== 1 || typeof prNumber !== 'number' || !Number.isSafeInteger(prNumber) || prNumber < 1) {
    throw new MergeReadinessError('provider_data_incomplete', 'activated reporter parent is not an exact single merged PR');
  }
  const commit = object(yield `${root}/git/commits/${identity.base_sha}`, 'base parent commit');
  if (commit.sha !== identity.base_sha || !Array.isArray(commit.parents) || commit.parents.length !== 1
    || !validSha(commit.parents[0]?.sha) || commit.parents[0].sha === identity.base_sha) {
    throw new MergeReadinessError('provider_data_incomplete', 'rollback parent is not a single commit boundary');
  }
  const detail = object(yield `${root}/pulls/${prNumber}`, 'merged parent PR detail');
  if (detail.number !== prNumber || detail.merged !== true || detail.merge_commit_sha !== identity.base_sha
    || object(detail.base, 'merged parent PR detail base').ref !== identity.base_ref) {    throw new MergeReadinessError('provider_data_incomplete', 'merged parent PR detail does not match the rollback boundary');
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
  const providers = checkArray(checks);
  const firstRun = validateRequiredCIRun(identity, gh(input, ['api', requiredCIRunPath(identity, providers)]), providers);
  const checkFailures = driveRequestsSync(requiredCheckFailures(identity, providers, firstRun), input);
  const coverage = coverageFacts(identity, input);
  const boundary = rollbackBoundary(identity);
  let request = boundary.next();
  while (!request.done) request = boundary.next(gh(input, ['api', request.value], request.value.includes('/contents/') ? [0, 1] : [0]));
  return parseProviderReadinessFacts(identity, checks, request.value, gh(input, providerReviewArgs(identity)), checkFailures, coverage);
}

export async function observeProviderReadinessFactsAbortable(
  identity: ProviderIdentity,
  receipt: Pick<PullRequestSelectionV2, 'pr_number'>,
  input: AbortablePublicationReadinessInput,
): Promise<ProviderMergeReadinessFactsV1> {
  const checks = await ghAbortable(input, [
    'pr', 'checks', String(receipt.pr_number), '--required', '--json', 'name,bucket,link',
  ], [0, 1, 8]);
  const providers = checkArray(checks);
  const firstRun = validateRequiredCIRun(identity, await ghAbortable(input, ['api', requiredCIRunPath(identity, providers)]), providers);
  const checkFailures = await driveRequestsAbortable(requiredCheckFailures(identity, providers, firstRun), input);
  const coverage = await coverageFactsAbortable(identity, input);
  const boundary = rollbackBoundary(identity);
  let request = boundary.next();
  while (!request.done) request = boundary.next(await ghAbortable(input, ['api', request.value], request.value.includes('/contents/') ? [0, 1] : [0]));
  return parseProviderReadinessFacts(identity, checks, request.value, await ghAbortable(input, providerReviewArgs(identity)), checkFailures, coverage);
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

interface ProviderReadinessTarget {
  readonly identity: ProviderIdentity;
  readonly default_branch: string;
}

function confirmRepositoryIdentity(input: PullRequestReadinessInput, identity: ProviderIdentity, rest: unknown): string {
  const repository = object(rest, 'REST repository');
  const defaultBranch = string(repository.default_branch, 'REST repository default_branch');
  if (!Number.isSafeInteger(repository.id) || Number(repository.id) < 1 || String(repository.id) !== input.provider_repository_id
    || repository.node_id !== identity.provider_repo_id || repository.full_name !== input.repository
    || identity.repo_name_with_owner !== input.repository) throw new MergeReadinessError('provider_data_incomplete', 'provider repository or default-branch target does not match selection');
  return defaultBranch;
}

/**
 * The one PR identity read. Readiness, fleet feedback and product acceptance
 * all observe their identity through it, so every field here must be answered
 * by any provider stand-in: `changedFiles` sets the exact coverage page count.
 */
const PR_IDENTITY_FIELDS = 'number,url,state,isDraft,headRefOid,headRefName,baseRefOid,baseRefName,body,reviewDecision,changedFiles,mergeable';

/**
 * The readiness target keeps the repository default branch. Stack detection
 * needs it to decide membership; the strict identity adapter below rejects a
 * non-default base for every other consumer.
 */
function observeProviderReadinessTarget(input: PullRequestReadinessInput): ProviderReadinessTarget {
  selectionOf(input);
  const identity = parseProviderPullRequestIdentity(input.pr_number,
    gh(input, ['repo', 'view', '--json', 'id,nameWithOwner']),
    gh(input, ['pr', 'view', String(input.pr_number), '--json', PR_IDENTITY_FIELDS]));
  return { identity, default_branch: confirmRepositoryIdentity(input, identity, gh(input, ['api', `repos/${input.repository}`])) };
}

export function observeProviderReadinessIdentity(input: PullRequestReadinessInput): ProviderIdentity {
  const target = observeProviderReadinessTarget(input);
  if (target.identity.base_ref !== target.default_branch) throw new MergeReadinessError('provider_data_incomplete', 'provider repository or default-branch target does not match selection');
  return target.identity;
}

export interface AbortablePullRequestReadinessInput extends Omit<AbortablePublicationReadinessInput, 'repository'>, PullRequestSelectionV2 {}

async function observeProviderReadinessTargetAbortable(input: AbortablePullRequestReadinessInput): Promise<ProviderReadinessTarget> {
  selectionOf(input);
  const repo = await ghAbortable(input, ['repo', 'view', '--json', 'id,nameWithOwner']);
  const pr = await ghAbortable(input, ['pr', 'view', String(input.pr_number), '--json', PR_IDENTITY_FIELDS]);
  const identity = parseProviderPullRequestIdentity(input.pr_number, repo, pr);
  return { identity, default_branch: confirmRepositoryIdentity(input, identity, await ghAbortable(input, ['api', `repos/${input.repository}`])) };
}

export async function observeProviderReadinessIdentityAbortable(input: AbortablePullRequestReadinessInput): Promise<ProviderIdentity> {
  const target = await observeProviderReadinessTargetAbortable(input);
  if (target.identity.base_ref !== target.default_branch) throw new MergeReadinessError('provider_data_incomplete', 'provider repository or default-branch target does not match selection');
  return target.identity;
}

const STACK_DEPTH_LIMIT = 20;
/** GitHub returns at most 100 PRs for one list request; a full page is not exhaustive. */
const STACK_PR_LIST_LIMIT = 100;
const STACK_PR_FIELDS = 'number,state,headRefOid,headRefName,baseRefOid,baseRefName,isCrossRepository';

interface ProviderStackPullRequest {
  readonly pr_number: number;
  readonly state: 'OPEN' | 'CLOSED' | 'MERGED';
  readonly head_ref: string;
  readonly head_sha: string;
  readonly base_ref: string;
  readonly base_sha: string;
  readonly cross_repository: boolean;
}

function providerStackPullRequest(value: unknown): ProviderStackPullRequest {
  const pr = object(value, 'provider stack pull request');
  if (!Number.isSafeInteger(pr.number) || Number(pr.number) < 1
    || !['OPEN', 'CLOSED', 'MERGED'].includes(String(pr.state))
    || typeof pr.headRefName !== 'string' || pr.headRefName.trim() === ''
    || typeof pr.baseRefName !== 'string' || pr.baseRefName.trim() === ''
    || !validSha(pr.headRefOid) || !validSha(pr.baseRefOid)
    || typeof pr.isCrossRepository !== 'boolean') {
    throw new MergeReadinessError('provider_data_incomplete', 'provider stack pull request is incomplete');
  }
  return Object.freeze({
    pr_number: Number(pr.number), state: String(pr.state) as ProviderStackPullRequest['state'],
    head_ref: pr.headRefName, head_sha: pr.headRefOid, base_ref: pr.baseRefName, base_sha: pr.baseRefOid,
    cross_repository: pr.isCrossRepository,
  });
}

function providerStackList(value: unknown): readonly ProviderStackPullRequest[] {
  if (!Array.isArray(value)) throw new MergeReadinessError('provider_data_incomplete', 'provider stack pull request list is invalid');
  if (value.length >= STACK_PR_LIST_LIMIT) throw new MergeReadinessError('provider_data_incomplete', 'provider stack pull request list is not exhaustive');
  return Object.freeze(value.map(providerStackPullRequest));
}

function stackFailure(status: MergeReadinessStackDetailV1['status'], chain: readonly MergeReadinessStackEntryV1[]): MergeReadinessStackDetailV1 {
  return Object.freeze({ member: true, depth: chain.length - 1, chain: Object.freeze([...chain]), final_base_sha: null, status });
}

/**
 * Follow the baseRefName chain from the observed PR to the default branch.
 * Every request names the branch observed on the previous link. The loop stops
 * on a repeated PR number or branch, a missing or closed base PR, a foreign PR,
 * or the depth bound; none of these returns a complete chain.
 */
function* stackProtocol(
  identity: ProviderIdentity,
  defaultBranch: string,
): Generator<string, MergeReadinessStackDetailV1, readonly ProviderStackPullRequest[]> {
  if (identity.base_ref === defaultBranch) {
    return Object.freeze({ member: false, depth: 0, chain: Object.freeze([]), final_base_sha: null, status: 'not_member' as const });
  }
  const member: MergeReadinessStackEntryV1 = Object.freeze({
    pr_number: identity.pr_number, head_ref: identity.head_ref, head_sha: identity.head_sha,
    base_ref: identity.base_ref, base_sha: identity.base_sha,
  });
  const chain: MergeReadinessStackEntryV1[] = [member];
  const seenNumbers = new Set<number>([identity.pr_number]);
  // Only branches used as a lookup key form the chain; a head ref is not a cycle
  // by itself, and a PR from the default branch is still a member.
  const seenRefs = new Set<string>([identity.base_ref]);
  let baseRef = identity.base_ref;
  for (;;) {
    if (baseRef === defaultBranch) {
      return Object.freeze({
        member: true, depth: chain.length - 1, chain: Object.freeze([...chain]),
        final_base_sha: chain[chain.length - 1]!.base_sha, status: 'complete' as const,
      });
    }
    if (chain.length - 1 >= STACK_DEPTH_LIMIT) return stackFailure('depth_exceeded', chain);
    const matching = (yield baseRef).filter(pr => pr.head_ref === baseRef);
    const open = matching.filter(pr => pr.state === 'OPEN');
    if (open.length === 0) return stackFailure(matching.length === 0 ? 'base_pr_missing' : 'base_pr_not_open', chain);
    if (open.length > 1) {
      throw new MergeReadinessError('provider_data_incomplete', `provider returned ${open.length} open pull requests for stack base ${baseRef}`);
    }
    const base = open[0]!;
    if (base.cross_repository) return stackFailure('foreign_pr', chain);
    if (seenNumbers.has(base.pr_number) || seenRefs.has(base.base_ref)) return stackFailure('cycle', chain);
    const entry: MergeReadinessStackEntryV1 = Object.freeze({
      pr_number: base.pr_number, head_ref: base.head_ref, head_sha: base.head_sha,
      base_ref: base.base_ref, base_sha: base.base_sha,
    });
    chain.push(entry);
    seenNumbers.add(entry.pr_number);
    seenRefs.add(entry.base_ref);
    baseRef = entry.base_ref;
  }
}

function observeStack(target: ProviderReadinessTarget, input: PublicationReadinessInput): MergeReadinessStackDetailV1 {
  const protocol = stackProtocol(target.identity, target.default_branch);
  let request = protocol.next();
  while (!request.done) {
    const list = gh(input, ['pr', 'list', '--head', request.value, '--state', 'all', '--json', STACK_PR_FIELDS, '--limit', String(STACK_PR_LIST_LIMIT)]);
    request = protocol.next(providerStackList(list));
  }
  return request.value;
}

async function observeStackAbortable(target: ProviderReadinessTarget, input: AbortablePublicationReadinessInput): Promise<MergeReadinessStackDetailV1> {
  const protocol = stackProtocol(target.identity, target.default_branch);
  let request = protocol.next();
  while (!request.done) {
    const list = await ghAbortable(input, ['pr', 'list', '--head', request.value, '--state', 'all', '--json', STACK_PR_FIELDS, '--limit', String(STACK_PR_LIST_LIMIT)]);
    request = protocol.next(providerStackList(list));
  }
  return request.value;
}

function readinessProjection(input: PullRequestReadinessInput, provider: ProviderMergeReadinessFactsV1 | null, observation: MergeReadinessObservation, stack: MergeReadinessStackDetailV1): PullRequestReadinessV2 {
  return Object.freeze({ protocol: 2, kind: 'repo-harness-pull-request-readiness', ...selectionOf(input),
    ...projectPullRequestMergeReadiness({ expected_head_sha: input.expected_head_sha, expected_base_sha: input.expected_base_sha,
      integration_mode: provider?.state === 'MERGED' ? 'ancestor' : 'unmerged', observation, provider, stack }) });
}

/** One observation loop for exact merged-PR evidence. The stack is fenced with the identity. */
function stablePullRequestRound<T>(input: PullRequestReadinessInput, observeExtra: (identity: ProviderIdentity) => T) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = observeProviderReadinessTarget(input);
    const extra = observeExtra(before.identity);
    const stack = observeStack(before, input);
    const facts = observeProviderReadinessFacts(before.identity, input, input);
    const after = observeProviderReadinessTarget(input);
    const extraAfter = observeExtra(after.identity);
    const stackAfter = observeStack(after, input);
    if (identityBytes(before.identity) === identityBytes(after.identity)
      && JSON.stringify(extra) === JSON.stringify(extraAfter)
      && JSON.stringify(stack) === JSON.stringify(stackAfter)) {
      return { identity: after.identity, facts, extra, stack: stackAfter };
    }
  }
  return null;
}

interface ReadinessRound {
  readonly facts: ProviderMergeReadinessFactsV1 | null;
  readonly stack: MergeReadinessStackDetailV1;
}

/**
 * Readiness observes only the identity and the chain for a stack member. Own-base
 * checks, reviews and coverage are not read: that evidence proves the PR only
 * against its feature base, not against the default branch.
 */
function stableReadinessRound(input: PullRequestReadinessInput): ReadinessRound | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = observeProviderReadinessTarget(input);
    const stack = observeStack(before, input);
    if (stack.member) {
      const after = observeProviderReadinessTarget(input);
      const stackAfter = observeStack(after, input);
      if (identityBytes(before.identity) === identityBytes(after.identity)
        && JSON.stringify(stack) === JSON.stringify(stackAfter)) return { facts: null, stack: stackAfter };
      continue;
    }
    const facts = observeProviderReadinessFacts(before.identity, input, input);
    const after = observeProviderReadinessTarget(input);
    const stackAfter = observeStack(after, input);
    if (identityBytes(before.identity) === identityBytes(after.identity)
      && JSON.stringify(stack) === JSON.stringify(stackAfter)) return { facts, stack: stackAfter };
  }
  return null;
}

async function stableReadinessRoundAbortable(input: AbortablePullRequestReadinessInput): Promise<ReadinessRound | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await observeProviderReadinessTargetAbortable(input);
    const stack = await observeStackAbortable(before, input);
    if (stack.member) {
      const after = await observeProviderReadinessTargetAbortable(input);
      const stackAfter = await observeStackAbortable(after, input);
      if (identityBytes(before.identity) === identityBytes(after.identity)
        && JSON.stringify(stack) === JSON.stringify(stackAfter)) return { facts: null, stack: stackAfter };
      continue;
    }
    const facts = await observeProviderReadinessFactsAbortable(before.identity, input, input);
    const after = await observeProviderReadinessTargetAbortable(input);
    const stackAfter = await observeStackAbortable(after, input);
    if (identityBytes(before.identity) === identityBytes(after.identity)
      && JSON.stringify(stack) === JSON.stringify(stackAfter)) return { facts, stack: stackAfter };
  }
  return null;
}

/** Ordinary default-branch PRs consume the shared provider decoder without a receipt or Lease. */
export function collectPullRequestMergeReadiness(input: PullRequestReadinessInput): PullRequestReadinessV2 {
  selectionOf(input);
  try {
    const round = stableReadinessRound(input);
    return round ? readinessProjection(input, round.facts, 'stable', round.stack)
      : readinessProjection(input, null, 'changed_during_read', unobservedStackDetail());
  } catch (error) {
    if (!(error instanceof MergeReadinessError)) throw error;
    return readinessProjection(input, null, error.code, unobservedStackDetail());
  }
}

export async function collectPullRequestMergeReadinessAbortable(input: AbortablePullRequestReadinessInput): Promise<PullRequestReadinessV2> {
  selectionOf(input);
  try {
    const round = await stableReadinessRoundAbortable(input);
    return round ? readinessProjection(input, round.facts, 'stable', round.stack)
      : readinessProjection(input, null, 'changed_during_read', unobservedStackDetail());
  } catch (error) {
    if (!(error instanceof MergeReadinessError)) throw error;
    return readinessProjection(input, null, error.code, unobservedStackDetail());
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
      || base.ref !== identity.base_ref || base.sha !== input.expected_base_sha || head.sha !== input.expected_head_sha
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
    expected_base_sha: input.expected_base_sha, integration_mode: 'ancestor', observation: 'stable', provider: round.facts,
    stack: round.stack });
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
