import { join } from 'path';
import { spawn, spawnSync } from 'child_process';

import {
  projectMergeReadiness,
  projectPullRequestMergeReadiness,
  type MergeReadinessIntegrationMode,
  type MergeReadinessObservation,
  type MergeReadinessV1,
  type ProviderMergeReadinessFactsV1,
} from '../../core/publication/merge-readiness';
import {
  decodePublicationMarker,
  publicationReceiptDigest,
  type PublicationReceiptV1,
} from '../../core/publication/publication-receipt';
import { readActiveSprintPath, readCanonicalTargetRef } from '../state/collect-board-inputs';
import { resolveBoard } from '../state/resolve-board';
import { PublicationReceiptError, readPublicationReceiptCache } from './publication-receipt';

export type MergeReadinessErrorCode =
  | 'receipt_unavailable'
  | 'publication_claim_mismatch'
  | 'publication_pointer_mismatch'
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
  readonly publication_id?: string;
  readonly pr_number?: number;
  readonly gh_bin?: string;
  readonly git_bin?: string;
  readonly checks_path?: string;
  readonly merge_seal_path?: string;
  /** Internal effect/test seam; HTTP callers never choose an authority store. */
  readonly authority_home?: string;
  readonly now_ms?: number;
  /** Test/effect seam; production leaves this unset and invokes the configured gh binary. */
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
  readonly mergeable: 'MERGEABLE' | 'CONFLICTING';
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

export interface MergeReadinessRound {
  readonly identity_before: ProviderIdentity;
  readonly facts: ProviderMergeReadinessFactsV1;
  readonly integration_mode: MergeReadinessIntegrationMode;
  readonly identity_after: ProviderIdentity;
}

export interface MergeReadinessCollector {
  readonly resolve_receipt: (input: PublicationReadinessInput) => PublicationReceiptV1;
  readonly observe_identity: (receipt: PublicationReceiptV1, input: PublicationReadinessInput) => ProviderIdentity;
  readonly observe_facts: (identity: ProviderIdentity, receipt: PublicationReceiptV1, input: PublicationReadinessInput) => ProviderMergeReadinessFactsV1;
  readonly classify_integration: (identity: ProviderIdentity, receipt: PublicationReceiptV1, input: PublicationReadinessInput) => MergeReadinessIntegrationMode;
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

function gh(input: PublicationReadinessInput, args: readonly string[], accepted = [0]): unknown {
  const injected = input.gh_runner?.(args);
  const result = injected ?? spawnSync(input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh', [...args], {
    cwd: input.repo_root,
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
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new MergeReadinessError('provider_data_incomplete', `provider returned invalid JSON: gh ${args.join(' ')}`, error);
  }
}

async function ghAbortable(
  input: AbortablePublicationReadinessInput,
  args: readonly string[],
  accepted = [0],
): Promise<unknown> {
  if (input.signal?.aborted) {
    throw new MergeReadinessError('provider_unavailable', `provider observation aborted: gh ${args.join(' ')}`);
  }
  const result = input.gh_runner_async
    ? await input.gh_runner_async(args, input.signal)
    : await new Promise<{ status: number | null; stdout: string; stderr: string; error?: Error }>((resolve) => {
      const child = spawn(input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh', [...args], {
        cwd: input.repo_root,
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
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new MergeReadinessError('provider_data_incomplete', `provider returned invalid JSON: gh ${args.join(' ')}`, error);
  }
}

function identityBytes(identity: ProviderIdentity): string {
  const { body: _body, review_decision: _reviewDecision, ...fences } = identity;
  return JSON.stringify(fences);
}

function parseProviderPullRequestIdentity(prNumber: number, repoValue: unknown, prValue: unknown): ProviderIdentity {
  const repo = object(repoValue, 'provider repository');
  const pr = object(prValue, 'provider PR');
  const number = pr.number;
  if (!Number.isInteger(number) || number !== prNumber) {
    throw new MergeReadinessError('publication_claim_mismatch', 'provider PR number does not match the requested PR');
  }
  if (typeof pr.isDraft !== 'boolean') throw new MergeReadinessError('provider_data_incomplete', 'provider PR isDraft is invalid');
  if (!['OPEN', 'CLOSED', 'MERGED'].includes(String(pr.state))) {
    throw new MergeReadinessError('provider_data_incomplete', 'provider PR state is unknown');
  }
  if (pr.reviewDecision !== null && !['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'].includes(String(pr.reviewDecision))) {
    throw new MergeReadinessError('provider_data_incomplete', 'provider PR reviewDecision is unknown');
  }
  if (pr.mergeable !== 'MERGEABLE' && pr.mergeable !== 'CONFLICTING') {
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
    review_decision: pr.reviewDecision as string | null,
    mergeable: pr.mergeable,
  });
  return identity;
}

function parseProviderReadinessIdentity(receipt: PublicationReceiptV1, repoValue: unknown, prValue: unknown): ProviderIdentity {
  const identity = parseProviderPullRequestIdentity(receipt.pr_number, repoValue, prValue);
  if (identity.provider_repo_id !== receipt.provider_repo_id
    || identity.pr_url !== receipt.pr_url
    || identity.head_ref !== receipt.branch
    || identity.base_ref !== receipt.target_ref) {
    throw new MergeReadinessError('publication_claim_mismatch', 'provider identity does not match the publication receipt');
  }
  let marker: PublicationReceiptV1 | null;
  try { marker = decodePublicationMarker(identity.body); } catch (error) {
    throw new MergeReadinessError('publication_claim_mismatch', 'provider publication marker is invalid', error);
  }
  if (marker === null || publicationReceiptDigest(marker) !== publicationReceiptDigest(receipt)) {
    throw new MergeReadinessError('publication_claim_mismatch', 'provider publication marker does not match the publication receipt');
  }
  return identity;
}

export function observeProviderReadinessIdentity(receipt: PublicationReceiptV1, input: PublicationReadinessInput): ProviderIdentity {
  return parseProviderReadinessIdentity(
    receipt,
    gh(input, ['repo', 'view', '--json', 'id,nameWithOwner']),
    gh(input, [
      'pr', 'view', String(receipt.pr_number), '--json',
      'number,url,state,isDraft,headRefOid,headRefName,baseRefOid,baseRefName,body,reviewDecision,mergeable',
    ]),
  );
}

export async function observeProviderReadinessIdentityAbortable(
  receipt: PublicationReceiptV1,
  input: AbortablePublicationReadinessInput,
): Promise<ProviderIdentity> {
  const repo = await ghAbortable(input, ['repo', 'view', '--json', 'id,nameWithOwner']);
  const pr = await ghAbortable(input, [
    'pr', 'view', String(receipt.pr_number), '--json',
    'number,url,state,isDraft,headRefOid,headRefName,baseRefOid,baseRefName,body,reviewDecision,mergeable',
  ]);
  return parseProviderReadinessIdentity(receipt, repo, pr);
}

function parseProviderReadinessFacts(
  identity: ProviderIdentity,
  checksValue: unknown,
  rollbackTags: ProviderMergeReadinessFactsV1['rollback_tags'],
): ProviderMergeReadinessFactsV1 {
  if (!Array.isArray(checksValue)) throw new MergeReadinessError('provider_data_incomplete', 'provider required checks must be an array');
  const checks = checksValue.map((entry) => {
    const check = object(entry, 'provider required check');
    if (!['pass', 'fail', 'pending', 'skipping', 'cancel'].includes(String(check.bucket))) {
      throw new MergeReadinessError('provider_data_incomplete', 'provider required check bucket is unknown');
    }
    return Object.freeze({ name: string(check.name, 'provider required check name'), bucket: check.bucket as 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel' });
  });
  return Object.freeze({
    state: identity.state,
    is_draft: identity.is_draft,
    head_sha: identity.head_sha,
    base_sha: identity.base_sha,
    review_decision: identity.review_decision,
    unresolved_thread_count: null,
    rollback_tags: rollbackTags,
    checks: Object.freeze(checks),
    mergeable: identity.mergeable,
  });
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

/** One read protocol for synchronous and abortable consumers; no history scan or tag write. */
function* rollbackTagBoundary(identity: ProviderIdentity): Generator<string, ProviderMergeReadinessFactsV1['rollback_tags'], unknown> {
  const root = `repos/${identity.repo_name_with_owner}`;
  const activation = object(yield `${root}/contents/.github/workflows/ci-report.yml?ref=${identity.base_sha}`, 'rollback reporter activation');
  if (activation.status === '404') return 'not_active';
  if (activation.type !== 'file' || activation.path !== '.github/workflows/ci-report.yml' || !/^[0-9a-f]{40}$/.test(String(activation.sha))) {
    throw new MergeReadinessError('provider_data_incomplete', 'rollback reporter activation unavailable');
  }
  const associations = yield `${root}/commits/${identity.base_sha}/pulls?per_page=100`;
  if (!Array.isArray(associations) || associations.length >= 100) throw new MergeReadinessError('provider_data_incomplete', 'parent PR associations incomplete');
  const merged = associations.filter(pr => pr?.merged_at && pr.base?.ref === 'main' && pr.merge_commit_sha === identity.base_sha);
  if (merged.length !== 1 || !Number.isInteger(merged[0].number) || merged[0].number < 1) {
    throw new MergeReadinessError('provider_data_incomplete', 'activated reporter parent is not an exact single merged PR');
  }
  const commit = object(yield `${root}/git/commits/${identity.base_sha}`, 'main parent commit');
  if (commit.sha !== identity.base_sha || !Array.isArray(commit.parents) || commit.parents.length !== 1 || !/^[0-9a-f]{40}$/.test(String(commit.parents[0]?.sha))) {
    throw new MergeReadinessError('provider_data_incomplete', 'rollback parent is not a single squash boundary');
  }
  for (const [phase, sha] of [['before', commit.parents[0].sha], ['after', identity.base_sha]]) {
    const name = `gate-cutover-pr-${merged[0].number}-${phase}`;
    const ref = object(yield `${root}/git/ref/tags/${name}`, 'rollback tag ref');
    if (ref.status === '404') return 'pending';
    if (ref.status) throw new MergeReadinessError('provider_unavailable', `rollback tag ref HTTP ${ref.status}`);
    const tagObject = object(ref.object, 'rollback tag object');
    if (typeof tagObject.type !== 'string' || typeof tagObject.sha !== 'string' || !/^[0-9a-f]{40}$/.test(tagObject.sha)) throw new MergeReadinessError('provider_data_incomplete', 'rollback tag ref incomplete');
    if (tagObject.type !== 'tag') return 'pending';
    const annotation = object(yield `${root}/git/tags/${tagObject.sha}`, 'rollback tag annotation');
    if (annotation.status === '404') return 'pending';
    if (annotation.status) throw new MergeReadinessError('provider_unavailable', `rollback tag annotation HTTP ${annotation.status}`);
    const target = object(annotation.object, 'rollback tag target');
    if (typeof annotation.tag !== 'string' || typeof target.type !== 'string' || typeof target.sha !== 'string' || !/^[0-9a-f]{40}$/.test(target.sha)) throw new MergeReadinessError('provider_data_incomplete', 'rollback tag annotation incomplete');
    if (annotation.tag !== name || target.type !== 'commit' || target.sha !== sha) return 'pending';
  }
  return 'ready';
}

export function observeProviderReadinessFacts(identity: ProviderIdentity, receipt: Pick<PublicationReceiptV1, 'pr_number'>, input: PublicationReadinessInput): ProviderMergeReadinessFactsV1 {
  const checks = gh(input, [
    'pr', 'checks', String(receipt.pr_number), '--required', '--json', 'name,bucket,link',
  ], [0, 1, 8]);
  validateRequiredCIRun(identity, gh(input, ['api', requiredCIRunPath(identity, checks)]), checks);
  const boundary = rollbackTagBoundary(identity);
  let request = boundary.next();
  while (!request.done) request = boundary.next(gh(input, ['api', request.value], [0, 1]));
  return parseProviderReadinessFacts(identity, checks, request.value);
}

export async function observeProviderReadinessFactsAbortable(
  identity: ProviderIdentity,
  receipt: Pick<PublicationReceiptV1, 'pr_number'>,
  input: AbortablePublicationReadinessInput,
): Promise<ProviderMergeReadinessFactsV1> {
  const checks = await ghAbortable(input, [
    'pr', 'checks', String(receipt.pr_number), '--required', '--json', 'name,bucket,link',
  ], [0, 1, 8]);
  validateRequiredCIRun(identity, await ghAbortable(input, ['api', requiredCIRunPath(identity, checks)]), checks);
  const boundary = rollbackTagBoundary(identity);
  let request = boundary.next();
  while (!request.done) request = boundary.next(await ghAbortable(input, ['api', request.value], [0, 1]));
  return parseProviderReadinessFacts(identity, checks, request.value);
}

/** Ordinary main PRs consume the same provider/check decoder as fleet publications, without a receipt or Lease. */
export function collectPullRequestMergeReadiness(
  input: PublicationReadinessInput & { readonly pr_number: number; readonly expected_head_sha: string; readonly expected_base_sha: string },
): ReturnType<typeof projectPullRequestMergeReadiness> {
  if (!Number.isInteger(input.pr_number) || input.pr_number < 1) throw new MergeReadinessError('provider_data_incomplete', 'pr_number must be positive');
  const observe = () => parseProviderPullRequestIdentity(input.pr_number,
    gh(input, ['repo', 'view', '--json', 'id,nameWithOwner']),
    gh(input, ['pr', 'view', String(input.pr_number), '--json', 'number,url,state,isDraft,headRefOid,headRefName,baseRefOid,baseRefName,body,reviewDecision,mergeable']));
  const project = (provider: ProviderMergeReadinessFactsV1 | null, observation: MergeReadinessObservation) => projectPullRequestMergeReadiness({
    expected_head_sha: input.expected_head_sha, expected_base_sha: input.expected_base_sha,
    integration_mode: provider?.state === 'MERGED' ? 'ancestor' : 'unmerged', observation, provider,
  });
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = observe();
      if (before.base_ref !== 'main') throw new MergeReadinessError('provider_data_incomplete', 'automatic code merge target must be main');
      const facts = observeProviderReadinessFacts(before, input, input);
      const after = observe();
      if (identityBytes(before) === identityBytes(after)) return project(facts, 'stable');
    }
    return project(null, 'changed_during_read');
  } catch (error) {
    if (!(error instanceof MergeReadinessError) || !['provider_unavailable', 'provider_data_incomplete'].includes(error.code)) throw error;
    return project(null, error.code as 'provider_unavailable' | 'provider_data_incomplete');
  }
}

function classifyIntegration(identity: ProviderIdentity, receipt: PublicationReceiptV1, input: PublicationReadinessInput): MergeReadinessIntegrationMode {
  const gitBin = input.git_bin ?? process.env.REPO_HARNESS_GIT_BIN ?? 'git';
  for (const oid of [identity.base_sha, receipt.head_sha]) {
    const objectCheck = spawnSync(gitBin, ['cat-file', '-e', `${oid}^{commit}`], { cwd: input.repo_root, encoding: 'utf-8' });
    if (objectCheck.error || objectCheck.status !== 0) return 'unavailable';
  }
  const script = join(input.repo_root, 'scripts/worktree-merge-lib.sh');
  const result = spawnSync('/bin/bash', [script, '--target', identity.base_sha, '--', receipt.head_sha], {
    cwd: input.repo_root,
    encoding: 'utf-8',
  });
  if (result.error || result.status !== 0) return 'unavailable';
  const line = result.stdout.trim();
  const prefix = `${receipt.head_sha}\t`;
  if (!line.startsWith(prefix)) return 'unavailable';
  const mode = line.slice(prefix.length);
  return mode === 'ancestor' || mode === 'absorbed' || mode === 'unmerged' ? mode : 'unavailable';
}

function resolveReceipt(input: PublicationReadinessInput): PublicationReceiptV1 {
  if ((input.publication_id === undefined) === (input.pr_number === undefined)) {
    throw new MergeReadinessError('receipt_unavailable', 'exactly one of publication_id or pr_number is required');
  }
  if (input.publication_id) {
    let receipt: PublicationReceiptV1 | null;
    try {
      receipt = readPublicationReceiptCache(input.repo_root, input.publication_id, input.git_bin ?? 'git');
    } catch (error) {
      if (error instanceof PublicationReceiptError && error.code === 'publication_claim_mismatch') {
        throw new MergeReadinessError('publication_claim_mismatch', error.message, error);
      }
      throw new MergeReadinessError('receipt_unavailable', `publication receipt is unreadable: ${input.publication_id}`, error);
    }
    if (!receipt) throw new MergeReadinessError('receipt_unavailable', `publication receipt is unavailable: ${input.publication_id}`);
    return receipt;
  }
  if (!Number.isInteger(input.pr_number) || input.pr_number! < 1) throw new MergeReadinessError('receipt_unavailable', 'pr_number must be positive');
  const repo = object(gh(input, ['repo', 'view', '--json', 'id']), 'provider repository');
  const pr = object(gh(input, ['pr', 'view', String(input.pr_number), '--json', 'number,body']), 'provider PR');
  if (pr.number !== input.pr_number) throw new MergeReadinessError('publication_claim_mismatch', 'provider PR number changed');
  let receipt: PublicationReceiptV1 | null;
  try { receipt = decodePublicationMarker(typeof pr.body === 'string' ? pr.body : ''); } catch (error) {
    throw new MergeReadinessError('receipt_unavailable', 'provider publication marker is invalid', error);
  }
  if (!receipt) throw new MergeReadinessError('receipt_unavailable', 'provider publication marker is missing');
  if (receipt.provider_repo_id !== string(repo.id, 'provider repository id') || receipt.pr_number !== input.pr_number) {
    throw new MergeReadinessError('publication_claim_mismatch', 'provider marker identity does not match the selected PR');
  }
  return receipt;
}

export const productionMergeReadinessCollector: MergeReadinessCollector = Object.freeze({
  resolve_receipt: resolveReceipt,
  observe_identity: observeProviderReadinessIdentity,
  observe_facts: observeProviderReadinessFacts,
  classify_integration: classifyIntegration,
});

function projectRound(receipt: PublicationReceiptV1, round: MergeReadinessRound, observation: MergeReadinessObservation): MergeReadinessV1 {
  return projectMergeReadiness({
    receipt,
    integration_mode: round.integration_mode,
    observation,
    provider: observation === 'stable' ? round.facts : null,
  });
}

function collectRound(receipt: PublicationReceiptV1, input: PublicationReadinessInput, collector: MergeReadinessCollector): MergeReadinessRound {
  let identityBefore: ProviderIdentity;
  let facts: ProviderMergeReadinessFactsV1;
  let identityAfter: ProviderIdentity;
  try {
    identityBefore = collector.observe_identity(receipt, input);
    facts = collector.observe_facts(identityBefore, receipt, input);
  } catch (error) {
    if (error instanceof MergeReadinessError) throw error;
    throw new MergeReadinessError('provider_unavailable', 'provider readiness observation failed', error);
  }
  const integrationMode = collector.classify_integration(identityBefore, receipt, input);
  try {
    identityAfter = collector.observe_identity(receipt, input);
  } catch (error) {
    if (error instanceof MergeReadinessError) throw error;
    throw new MergeReadinessError('provider_unavailable', 'provider readiness identity confirmation failed', error);
  }
  return Object.freeze({
    identity_before: identityBefore,
    facts,
    integration_mode: integrationMode,
    identity_after: identityAfter,
  });
}

function roundStable(round: MergeReadinessRound): boolean {
  return identityBytes(round.identity_before) === identityBytes(round.identity_after);
}

function unavailableReadiness(
  receipt: PublicationReceiptV1,
  observation: Extract<MergeReadinessObservation, 'provider_unavailable' | 'provider_data_incomplete'>,
): MergeReadinessV1 {
  const identity: ProviderIdentity = {
    provider_repo_id: receipt.provider_repo_id, repo_name_with_owner: 'unavailable', pr_number: receipt.pr_number,
    pr_url: receipt.pr_url, state: 'UNKNOWN', is_draft: false, head_sha: receipt.head_sha,
    head_ref: receipt.branch, base_sha: receipt.base_sha, base_ref: receipt.target_ref, body: '',
    review_decision: null, mergeable: 'CONFLICTING',
  };
  return projectRound(receipt, {
    identity_before: identity,
    identity_after: identity,
    facts: { state: 'UNKNOWN', is_draft: false, head_sha: receipt.head_sha, base_sha: receipt.base_sha,
      review_decision: null, unresolved_thread_count: null, rollback_tags: 'pending', checks: [], mergeable: 'CONFLICTING' },
    integration_mode: 'unavailable',
  }, observation);
}

export function resolvePublicationReadiness(
  input: PublicationReadinessInput,
  collector: MergeReadinessCollector = productionMergeReadinessCollector,
): MergeReadinessV1 {
  const receipt = collector.resolve_receipt(input);
  let latest: MergeReadinessRound | null = null;
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      latest = collectRound(receipt, input, collector);
      if (roundStable(latest)) return projectRound(receipt, latest, 'stable');
    }
    return projectRound(receipt, latest!, 'changed_during_read');
  } catch (error) {
    if (!(error instanceof MergeReadinessError)
      || (error.code !== 'provider_unavailable' && error.code !== 'provider_data_incomplete')) throw error;
    return unavailableReadiness(receipt, error.code);
  }
}

async function collectAbortableRound(
  receipt: PublicationReceiptV1,
  input: AbortablePublicationReadinessInput,
): Promise<MergeReadinessRound> {
  const identityBefore = await observeProviderReadinessIdentityAbortable(receipt, input);
  const facts = await observeProviderReadinessFactsAbortable(identityBefore, receipt, input);
  const integrationMode = classifyIntegration(identityBefore, receipt, input);
  const identityAfter = await observeProviderReadinessIdentityAbortable(receipt, input);
  return Object.freeze({
    identity_before: identityBefore,
    facts,
    integration_mode: integrationMode,
    identity_after: identityAfter,
  });
}

/**
 * Cancellable counterpart of resolvePublicationReadiness. Provider parsing and
 * validation are shared with the synchronous path; only child lifetime is
 * different. Aborted children become the existing typed unavailable verdict.
 */
export async function resolvePublicationReadinessAbortable(
  input: AbortablePublicationReadinessInput,
): Promise<MergeReadinessV1> {
  if (input.publication_id === undefined) {
    throw new MergeReadinessError('receipt_unavailable', 'abortable readiness requires publication_id');
  }
  const receipt = resolveReceipt(input);
  let latest: MergeReadinessRound | null = null;
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      latest = await collectAbortableRound(receipt, input);
      if (roundStable(latest)) return projectRound(receipt, latest, 'stable');
    }
    return projectRound(receipt, latest!, 'changed_during_read');
  } catch (error) {
    if (!(error instanceof MergeReadinessError)
      || (error.code !== 'provider_unavailable' && error.code !== 'provider_data_incomplete')) throw error;
    return unavailableReadiness(receipt, error.code);
  }
}

export interface FleetReadinessV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-fleet-readiness';
  readonly sprint_path: string;
  readonly snapshot_consistency: 'stable' | 'changed_during_read';
  readonly publications: readonly ({ readonly publication_id: string; readonly verdict?: MergeReadinessV1; readonly error?: MergeReadinessErrorCode; readonly message?: string })[];
}

export interface FleetReadinessIndexV1 {
  readonly sprint_path: string;
  readonly snapshot_consistency: 'stable' | 'changed_during_read';
  readonly publication_ids: readonly string[];
}

export interface FleetReadinessCollector {
  readonly collect_index: (input: Omit<PublicationReadinessInput, 'publication_id' | 'pr_number'>) => FleetReadinessIndexV1;
  readonly resolve_publication: (input: PublicationReadinessInput) => MergeReadinessV1;
}

function collectFleetReadinessIndex(input: Omit<PublicationReadinessInput, 'publication_id' | 'pr_number'>): FleetReadinessIndexV1 {
  const sprintPath = readActiveSprintPath(input.repo_root);
  if (sprintPath === null) throw new MergeReadinessError('receipt_unavailable', 'active sprint is unavailable');
  const targetRef = readCanonicalTargetRef(input.repo_root);
  const board = resolveBoard(input.repo_root, { sprintPath, targetRef, nowMs: input.now_ms ?? Date.now() });
  return Object.freeze({
    sprint_path: sprintPath,
    snapshot_consistency: board.snapshot_consistency,
    publication_ids: Object.freeze(board.cards.flatMap((card) => {
      const pointer = card.claim?.current_publication;
      return card.lease_state === 'reviewing' && pointer ? [pointer.publication_id] : [];
    })),
  });
}

export const productionFleetReadinessCollector: FleetReadinessCollector = Object.freeze({
  collect_index: collectFleetReadinessIndex,
  resolve_publication: resolvePublicationReadiness,
});

export function resolveFleetReadiness(
  input: Omit<PublicationReadinessInput, 'publication_id' | 'pr_number'>,
  collector: FleetReadinessCollector = productionFleetReadinessCollector,
): FleetReadinessV1 {
  const index = collector.collect_index(input);
  const publications: Array<{ publication_id: string; verdict?: MergeReadinessV1; error?: MergeReadinessErrorCode; message?: string }> = [];
  for (const publicationId of index.publication_ids) {
    try {
      publications.push({ publication_id: publicationId, verdict: collector.resolve_publication({ ...input, publication_id: publicationId }) });
    } catch (error) {
      if (error instanceof MergeReadinessError) {
        publications.push({ publication_id: publicationId, error: error.code, message: error.message });
        continue;
      }
      publications.push({
        publication_id: publicationId,
        error: 'receipt_unavailable',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return Object.freeze({
    protocol: 1,
    kind: 'repo-harness-fleet-readiness',
    sprint_path: index.sprint_path,
    snapshot_consistency: index.snapshot_consistency,
    publications: Object.freeze(publications),
  });
}
