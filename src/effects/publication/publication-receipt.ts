import { execFileSync, spawnSync } from 'child_process';
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createHash, randomUUID } from 'crypto';

import {
  buildPublicationCreateIntent,
  buildPublicationPrepareEnvelope,
  buildPublicationReceipt,
  canonicalPublicationCreateIntentBytes,
  canonicalPublicationJournalEvidenceBytes,
  canonicalPublicationReceiptBytes,
  decodePublicationMarker,
  publicationReceiptDigest,
  publicationSha256,
  replacePublicationMarker,
  validatePublicationCreateIntent,
  validatePublicationJournalEvidence,
  validatePublicationPrepareEnvelope,
  validatePublicationReceipt,
  type PublicationCreateIntentV1,
  type PublicationJournalEvidenceV1,
  type PublicationPrepareEnvelopeV1,
  type PublicationReceiptV1,
} from '../../core/publication/publication-receipt';
import { readLease, withTaskLock } from '../state/coordination-lease-store';
import { resolveGitCommonDirectory } from '../git/common-directory';

export const PUBLICATION_RECEIPTS_RELATIVE_PATH = 'repo-harness/publications/v1';

export type PublicationErrorCode = 'publication_incomplete' | 'publication_claim_mismatch';

export class PublicationReceiptError extends Error {
  constructor(readonly code: PublicationErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'PublicationReceiptError';
  }
}

export interface ProviderPullRequestV1 {
  readonly provider_repo_id: string;
  readonly pr_number: number;
  readonly pr_url: string;
  readonly head_sha: string;
  readonly head_ref: string;
  readonly base_ref: string;
  readonly base_sha: string;
  readonly body: string;
  readonly created_at: string;
}

/** A live provider state observation used only by explicit close-out verbs. */
export interface ProviderPullRequestStateV1 {
  readonly pr_number: number;
  readonly state: string;
  readonly merged_at: string | null;
}

/**
 * One live provider read joining immutable PR identity fields and dynamic
 * closure facts. Reconcile uses this instead of rebuilding receipt evidence:
 * a post-merge base advance is normal and must not invalidate publication
 * identity.
 */
export interface ProviderPullRequestIntegrationV1 extends ProviderPullRequestV1, ProviderPullRequestStateV1 {}

export interface MergeSealEvidenceV1 {
  readonly path: string;
  readonly sha256: string;
  readonly base_sha: string;
  readonly head_sha: string;
  readonly review_subject_sha256: string;
}

export interface PublicationReceiptEnsureInput {
  readonly repo_root: string;
  readonly task_id: string;
  readonly claim_id: string;
  readonly branch: string;
  readonly target_branch: string;
  /** Only a pre-create journal intent may authorize a missing first marker. */
  readonly create_intent?: PublicationCreateIntentV1;
  /** Closeout status.json carrying the durable pre-create intent. */
  readonly create_intent_journal_path?: string;
  readonly gh_bin?: string;
  readonly git_bin?: string;
  readonly merge_seal_path?: string;
  readonly checks_path?: string;
}

export type PublicationReceiptPrepareInput = Omit<PublicationReceiptEnsureInput, 'create_intent'>;

export interface PublicationReceiptRebuildInput {
  readonly repo_root: string;
  readonly pr_number: number;
  readonly gh_bin?: string;
  readonly git_bin?: string;
  readonly merge_seal_path?: string;
  readonly checks_path?: string;
}

export interface PublicationReceiptResult {
  readonly receipt: PublicationReceiptV1;
  readonly cache_path: string;
  readonly marker_changed: boolean;
}

function incomplete(message: string, cause?: unknown): PublicationReceiptError {
  return new PublicationReceiptError('publication_incomplete', message, cause);
}

function mismatch(message: string, cause?: unknown): PublicationReceiptError {
  return new PublicationReceiptError('publication_claim_mismatch', message, cause);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw incomplete(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw incomplete(`${label} is required`);
  return value;
}

function gitText(repoRoot: string, gitBin: string, args: readonly string[]): string {
  try {
    return execFileSync(gitBin, [...args], { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    throw incomplete(`git ${args.join(' ')} failed`, error);
  }
}

function ghJson(repoRoot: string, ghBin: string, args: readonly string[]): unknown {
  const result = spawnSync(ghBin, [...args], { cwd: repoRoot, encoding: 'utf-8' });
  if (result.error || result.status !== 0) {
    throw incomplete(`provider observation failed: gh ${args.join(' ')}: ${(result.stderr || result.error?.message || 'unknown error').trim()}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw incomplete(`provider observation returned invalid JSON: gh ${args.join(' ')}`, error);
  }
}

function observeProviderRepoId(repoRoot: string, ghBin: string): string {
  const repo = asRecord(ghJson(repoRoot, ghBin, ['repo', 'view', '--json', 'id']), 'provider repository');
  return requiredString(repo.id, 'provider repository id');
}

function providerPrFromJson(providerRepoId: string, value: unknown, expectedNumber?: number): ProviderPullRequestV1 {
  const pr = asRecord(value, 'provider PR');
  const number = pr.number;
  if (!Number.isInteger(number) || (number as number) < 1) throw incomplete('provider PR number is invalid');
  if (expectedNumber !== undefined && number !== expectedNumber) throw incomplete('provider PR number changed during observation');
  return Object.freeze({
    provider_repo_id: providerRepoId,
    pr_number: number as number,
    pr_url: requiredString(pr.url, 'provider PR URL'),
    head_sha: requiredString(pr.headRefOid, 'provider PR head'),
    head_ref: requiredString(pr.headRefName, 'provider PR head ref'),
    base_ref: requiredString(pr.baseRefName, 'provider PR base ref'),
    base_sha: requiredString(pr.baseRefOid, 'provider PR base'),
    body: typeof pr.body === 'string' ? pr.body : '',
    created_at: requiredString(pr.createdAt, 'provider PR createdAt'),
  });
}

function observeProviderPrOrNull(repoRoot: string, ghBin: string, branch: string, targetBranch: string): ProviderPullRequestV1 | null {
  const providerRepoId = observeProviderRepoId(repoRoot, ghBin);
  const listed = ghJson(repoRoot, ghBin, [
    // Do not filter by base: a retargeted PR must be observed and rejected as
    // a mismatch, never mistaken for a missing PR eligible for a new intent.
    'pr', 'list', '--head', branch,
    '--json', 'number,url,headRefOid,headRefName,baseRefName,baseRefOid,body,createdAt',
  ]);
  if (!Array.isArray(listed)) throw incomplete(`provider PR list is invalid for ${branch} -> ${targetBranch}`);
  if (listed.length === 0) return null;
  if (listed.length !== 1) {
    throw incomplete(`expected at most one provider PR for ${branch} -> ${targetBranch}`);
  }
  return providerPrFromJson(providerRepoId, listed[0]);
}

function observeProviderPr(repoRoot: string, ghBin: string, branch: string, targetBranch: string): ProviderPullRequestV1 {
  const observed = observeProviderPrOrNull(repoRoot, ghBin, branch, targetBranch);
  if (observed === null) throw incomplete(`expected exactly one provider PR for ${branch} -> ${targetBranch}`);
  return observed;
}

function observeProviderPrByNumber(repoRoot: string, ghBin: string, number: number): ProviderPullRequestV1 {
  if (!Number.isInteger(number) || number < 1) throw incomplete('PR number is invalid');
  const providerRepoId = observeProviderRepoId(repoRoot, ghBin);
  return providerPrFromJson(
    providerRepoId,
    ghJson(repoRoot, ghBin, ['pr', 'view', String(number), '--json', 'number,url,headRefOid,headRefName,baseRefName,baseRefOid,body,createdAt']),
    number,
  );
}

/**
 * Read the provider's current closure state independently of immutable receipt
 * facts. A receipt describes publication identity; it is never evidence that
 * a PR remains closed and unmerged now.
 */
export function observeProviderPullRequestState(
  repoRoot: string,
  prNumber: number,
  ghBin = process.env.REPO_HARNESS_GH_BIN ?? 'gh',
): ProviderPullRequestStateV1 {
  try {
    if (!Number.isInteger(prNumber) || prNumber < 1) throw incomplete('PR number is invalid');
    const value = asRecord(
      ghJson(repoRoot, ghBin, ['pr', 'view', String(prNumber), '--json', 'number,state,mergedAt']),
      'provider PR state',
    );
    if (value.number !== prNumber) throw incomplete('provider PR number changed during state observation');
    const state = requiredString(value.state, 'provider PR state');
    if (value.mergedAt !== null && typeof value.mergedAt !== 'string') {
      throw incomplete('provider PR mergedAt is invalid');
    }
    return Object.freeze({ pr_number: prNumber, state, merged_at: value.mergedAt as string | null });
  } catch (error) {
    if (error instanceof PublicationReceiptError) throw error;
    throw incomplete('provider PR state observation failed', error);
  }
}

export function observeProviderPullRequestIntegration(
  repoRoot: string,
  prNumber: number,
  ghBin = process.env.REPO_HARNESS_GH_BIN ?? 'gh',
): ProviderPullRequestIntegrationV1 {
  try {
    if (!Number.isInteger(prNumber) || prNumber < 1) throw incomplete('PR number is invalid');
    const providerRepoId = observeProviderRepoId(repoRoot, ghBin);
    const value = ghJson(repoRoot, ghBin, [
      'pr', 'view', String(prNumber),
      '--json', 'number,url,headRefOid,headRefName,baseRefName,baseRefOid,body,createdAt,state,mergedAt',
    ]);
    const immutable = providerPrFromJson(providerRepoId, value, prNumber);
    const record = asRecord(value, 'provider PR integration state');
    const state = requiredString(record.state, 'provider PR state');
    if (record.mergedAt !== null && typeof record.mergedAt !== 'string') {
      throw incomplete('provider PR mergedAt is invalid');
    }
    return Object.freeze({ ...immutable, state, merged_at: record.mergedAt as string | null });
  } catch (error) {
    if (error instanceof PublicationReceiptError) throw error;
    throw incomplete('provider PR integration observation failed', error);
  }
}

function updateProviderBody(repoRoot: string, ghBin: string, number: number, body: string): void {
  const result = spawnSync(ghBin, ['pr', 'edit', String(number), '--body', body], { cwd: repoRoot, encoding: 'utf-8' });
  if (result.error || result.status !== 0) {
    throw incomplete(`provider marker update failed for PR ${number}: ${(result.stderr || result.error?.message || 'unknown error').trim()}`);
  }
}

function gitHeadAndTree(repoRoot: string, gitBin: string): { head_sha: string; tree_sha: string } {
  const headSha = gitText(repoRoot, gitBin, ['rev-parse', 'HEAD^{commit}']);
  return Object.freeze({ head_sha: headSha, tree_sha: gitText(repoRoot, gitBin, ['rev-parse', `${headSha}^{tree}`]) });
}

function gitTreeForHead(repoRoot: string, gitBin: string, headSha: string): string {
  const resolved = gitText(repoRoot, gitBin, ['rev-parse', `${headSha}^{commit}`]);
  if (resolved !== headSha) throw incomplete(`local evidence does not contain the provider head ${headSha}`);
  return gitText(repoRoot, gitBin, ['rev-parse', `${headSha}^{tree}`]);
}

function defaultMergeSealPath(repoRoot: string): string {
  const repositoryId = createHash('sha256').update(realpathSync(repoRoot)).digest('hex');
  return join(homedir(), '.repo-harness', 'gates', repositoryId, 'merge-seal.latest.json');
}

function readRegular(path: string, label: string): Buffer {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw incomplete(`${label} is unavailable: ${path}`, error);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw incomplete(`${label} must be a regular file: ${path}`);
  try {
    return readFileSync(path);
  } catch (error) {
    throw incomplete(`${label} is unreadable: ${path}`, error);
  }
}

function readMergeSeal(repoRoot: string, requestedPath?: string): MergeSealEvidenceV1 {
  const path = requestedPath ?? defaultMergeSealPath(repoRoot);
  const raw = readRegular(path, 'merge seal');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf-8'));
  } catch (error) {
    throw incomplete(`merge seal is invalid JSON: ${path}`, error);
  }
  const value = asRecord(parsed, 'merge seal');
  if (value.protocol !== 1 || value.kind !== 'repo-harness-merge-seal') throw incomplete('merge seal protocol or kind is invalid');
  return Object.freeze({
    path,
    sha256: publicationSha256(raw),
    base_sha: requiredString(value.base_sha, 'merge seal base_sha'),
    head_sha: requiredString(value.head_sha, 'merge seal head_sha'),
    review_subject_sha256: requiredString(value.acceptance_subject_sha256, 'merge seal acceptance_subject_sha256'),
  });
}

function verificationEvidenceDigest(repoRoot: string, requestedPath?: string): string {
  return publicationSha256(readRegular(requestedPath ?? join(repoRoot, '.ai/harness/checks/latest.json'), 'verification evidence'));
}

function assertLiveEvidence(receipt: PublicationReceiptV1, provider: ProviderPullRequestV1, repoRoot: string, gitBin: string, mergeSealPath?: string, checksPath?: string): void {
  if (provider.provider_repo_id !== receipt.provider_repo_id
    || provider.pr_number !== receipt.pr_number
    || provider.pr_url !== receipt.pr_url
    || provider.base_ref !== receipt.target_ref
    || provider.base_sha !== receipt.base_sha
    || provider.head_ref !== receipt.branch
    || provider.head_sha !== receipt.head_sha
    || provider.created_at !== receipt.created_at) {
    throw mismatch(`provider facts no longer match publication ${receipt.publication_id}`);
  }
  if (repositoryIdentity(repoRoot, gitBin) !== receipt.repo_id) {
    throw mismatch(`local repository identity no longer matches publication ${receipt.publication_id}`);
  }
  if (gitTreeForHead(repoRoot, gitBin, receipt.head_sha) !== receipt.tree_sha) {
    throw mismatch(`local tree no longer matches publication head ${receipt.head_sha}`);
  }
  if (verificationEvidenceDigest(repoRoot, checksPath) !== receipt.verification_evidence_sha256) {
    throw mismatch(`verification evidence no longer matches publication ${receipt.publication_id}`);
  }
  const seal = readMergeSeal(repoRoot, mergeSealPath);
  if (seal.sha256 !== receipt.merge_seal_sha256
    || seal.base_sha !== receipt.base_sha
    || seal.head_sha !== receipt.head_sha
    || seal.review_subject_sha256 !== receipt.review_subject_sha256) {
    throw mismatch(`merge seal no longer matches publication ${receipt.publication_id}`);
  }
}

interface PublicationOwnerV1 {
  readonly task_revision: string;
  readonly generation: number;
  readonly target_ref: string;
}

function assertOwner(repoRoot: string, gitBin: string, taskId: string, claimId: string, branch: string): PublicationOwnerV1 {
  const lease = readLease(repoRoot, taskId);
  if (lease.record === null) throw mismatch(`lease owner record is unavailable for task ${taskId}`);
  if (lease.record.claim_id !== claimId) throw mismatch(`lease claim ${lease.record.claim_id} does not match receipt claim ${claimId}`);
  if (lease.record.state !== 'completing') throw incomplete(`lease ${taskId} must be completing before publication, got ${lease.record.state}`);
  let currentWorktree: string;
  let ownerWorktree: string;
  try {
    currentWorktree = realpathSync(repoRoot);
    ownerWorktree = lease.record.execution_worktree === null ? '' : realpathSync(lease.record.execution_worktree);
  } catch (error) {
    throw mismatch(`lease execution worktree cannot be resolved for task ${taskId}`, error);
  }
  if (ownerWorktree !== currentWorktree) {
    throw mismatch(`lease execution worktree ${lease.record.execution_worktree ?? '(none)'} does not own ${currentWorktree}`);
  }
  const currentBranch = gitText(repoRoot, gitBin, ['branch', '--show-current']);
  if (currentBranch !== branch || lease.record.branch !== branch) {
    throw mismatch(`lease branch ${lease.record.branch ?? '(none)'} and current branch ${currentBranch || '(detached)'} must both match ${branch}`);
  }
  return Object.freeze({
    task_revision: lease.record.task_revision,
    generation: lease.record.generation,
    target_ref: lease.record.target_ref,
  });
}

function receiptDirectory(repoRoot: string, gitBin: string): string {
  return join(resolveGitCommonDirectory(repoRoot, gitBin), PUBLICATION_RECEIPTS_RELATIVE_PATH);
}

/** The cache needs the real common directory; the immutable receipt must not disclose it. */
function repositoryIdentity(repoRoot: string, gitBin: string): string {
  return publicationSha256(realpathSync(resolveGitCommonDirectory(repoRoot, gitBin)));
}

export function publicationReceiptPath(repoRoot: string, publicationId: string, gitBin = 'git'): string {
  if (!/^sha256:[0-9a-f]{64}$/.test(publicationId)) throw incomplete('publication id is invalid');
  return join(receiptDirectory(repoRoot, gitBin), `${publicationId.slice('sha256:'.length)}.json`);
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writeAll(fd: number, content: Buffer): void {
  let offset = 0;
  while (offset < content.length) offset += writeSync(fd, content, offset, content.length - offset);
}

function assertCacheEquivalent(target: string, expected: PublicationReceiptV1): void {
  const current = readRegular(target, 'publication receipt cache');
  let cached: PublicationReceiptV1;
  try {
    cached = validatePublicationReceipt(JSON.parse(current.toString('utf-8')));
  } catch (error) {
    throw mismatch(`cached publication receipt is invalid: ${target}`, error);
  }
  if (canonicalPublicationReceiptBytes(cached) !== canonicalPublicationReceiptBytes(expected)) {
    throw mismatch(`cached publication receipt conflicts with ${expected.publication_id}`);
  }
}

/** Atomically write a receipt cache; a same-id different payload is never overwritten. */
export function writePublicationReceiptCache(repoRoot: string, receipt: PublicationReceiptV1, gitBin = 'git'): string {
  const valid = validatePublicationReceipt(receipt);
  const directory = receiptDirectory(repoRoot, gitBin);
  const target = publicationReceiptPath(repoRoot, valid.publication_id, gitBin);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const directoryStat = lstatSync(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) throw incomplete(`publication receipt directory is unsafe: ${directory}`);
  const bytes = Buffer.from(`${canonicalPublicationReceiptBytes(valid)}\n`, 'utf-8');
  if (existsSync(target)) {
    assertCacheEquivalent(target, valid);
    return target;
  }
  const temporary = join(directory, `.${valid.publication_id.slice('sha256:'.length)}.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    writeAll(fd, bytes);
    fsyncSync(fd);
  } finally {
    if (fd !== null) closeSync(fd);
  }
  try {
    // link(2) publishes the already fsynced inode without replacing an
    // incumbent. A concurrent writer therefore gets EEXIST and must prove
    // byte-equivalence instead of silently overwriting a receipt.
    linkSync(temporary, target);
    fsyncDirectory(directory);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') {
      try {
        assertCacheEquivalent(target, valid);
      } catch (cacheError) {
        throw cacheError;
      }
    } else {
      throw incomplete(`cannot persist publication receipt cache: ${target}`, error);
    }
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw incomplete(`cannot clean temporary publication receipt cache: ${temporary}`, error);
      }
    }
  }
  return target;
}

export function readPublicationReceiptCache(repoRoot: string, publicationId: string, gitBin = 'git'): PublicationReceiptV1 | null {
  const path = publicationReceiptPath(repoRoot, publicationId, gitBin);
  if (!existsSync(path)) return null;
  try {
    return validatePublicationReceipt(JSON.parse(readRegular(path, 'publication receipt cache').toString('utf-8')));
  } catch (error) {
    throw mismatch(`cached publication receipt is invalid: ${path}`, error);
  }
}

function expectedReceipt(input: PublicationReceiptEnsureInput, provider: ProviderPullRequestV1): PublicationReceiptV1 {
  const gitBin = input.git_bin ?? 'git';
  const owner = assertOwner(input.repo_root, gitBin, input.task_id, input.claim_id, input.branch);
  if (owner.target_ref !== input.target_branch) {
    throw mismatch(`lease target ${owner.target_ref} does not match provider target ${input.target_branch}`);
  }
  const head = gitHeadAndTree(input.repo_root, gitBin);
  if (provider.base_ref !== owner.target_ref || provider.base_sha === '') {
    throw mismatch(`provider target ${provider.base_ref} does not match receipt target ${owner.target_ref}`);
  }
  if (provider.head_ref !== input.branch) throw mismatch(`provider head ref ${provider.head_ref} does not match receipt branch ${input.branch}`);
  if (provider.head_sha !== head.head_sha) throw mismatch(`provider head ${provider.head_sha} does not match local head ${head.head_sha}`);
  const seal = readMergeSeal(input.repo_root, input.merge_seal_path);
  if (seal.head_sha !== head.head_sha || seal.base_sha === '' || provider.base_sha !== seal.base_sha) {
    throw mismatch(`merge seal does not bind local publication head ${head.head_sha}`);
  }
  return buildPublicationReceipt({
    repo_id: repositoryIdentity(input.repo_root, gitBin),
    task_id: input.task_id,
    task_revision: owner.task_revision,
    claim_id: input.claim_id,
    generation: owner.generation,
    target_ref: owner.target_ref,
    base_sha: seal.base_sha,
    branch: input.branch,
    head_sha: head.head_sha,
    tree_sha: head.tree_sha,
    review_subject_sha256: seal.review_subject_sha256,
    verification_evidence_sha256: verificationEvidenceDigest(input.repo_root, input.checks_path),
    merge_seal_sha256: seal.sha256,
    provider: 'github',
    provider_repo_id: provider.provider_repo_id,
    pr_number: provider.pr_number,
    pr_url: provider.pr_url,
    created_at: provider.created_at,
  });
}

function assertCreateIntentAgreement(expected: PublicationReceiptV1, intent: PublicationCreateIntentV1): void {
  const valid = validatePublicationCreateIntent(intent);
  if (valid.publication_id !== expected.publication_id
    || valid.provider_repo_id !== expected.provider_repo_id
    || valid.task_id !== expected.task_id
    || valid.claim_id !== expected.claim_id
    || valid.generation !== expected.generation
    || valid.head_sha !== expected.head_sha) {
    throw mismatch(`publication create intent does not match publication ${expected.publication_id}`);
  }
}

function assertDurableCreateIntent(path: string | undefined, expected: PublicationCreateIntentV1): void {
  if (path === undefined) throw mismatch('markerless provider PR has no durable publication create intent journal');
  const raw = readRegular(path, 'publication create intent journal');
  let value: unknown;
  try {
    value = JSON.parse(raw.toString('utf-8'));
  } catch (error) {
    throw mismatch('publication create intent journal is invalid JSON', error);
  }
  const journal = asRecord(value, 'publication create intent journal');
  if (!Array.isArray(journal.phases)) throw mismatch('publication create intent journal has no phases');
  const phases = journal.phases.filter((phase): phase is Record<string, unknown> => (
    phase !== null
    && typeof phase === 'object'
    && !Array.isArray(phase)
    && (phase as Record<string, unknown>).phase === 'publication_create_intent'
  ));
  if (phases.length !== 1) throw mismatch('publication create intent journal must contain exactly one create intent phase');
  let envelope;
  try {
    envelope = validatePublicationPrepareEnvelope(phases[0]!.publication);
  } catch (error) {
    throw mismatch('publication create intent journal phase is invalid', error);
  }
  if (envelope.action !== 'create' || envelope.create_intent === null
    || canonicalPublicationCreateIntentBytes(envelope.create_intent) !== canonicalPublicationCreateIntentBytes(expected)) {
    throw mismatch('publication create intent journal does not match markerless provider PR');
  }
}

function assertMarkerAgreement(
  expected: PublicationReceiptV1,
  provider: ProviderPullRequestV1,
  createIntent?: PublicationCreateIntentV1,
  createIntentJournalPath?: string,
): void {
  let marker: PublicationReceiptV1 | null;
  try {
    marker = decodePublicationMarker(provider.body);
  } catch (error) {
    throw mismatch('provider publication marker is invalid', error);
  }
  if (marker === null) {
    if (createIntent === undefined) throw mismatch(`provider PR ${provider.pr_number} has no publication marker and no matching create intent`);
    assertCreateIntentAgreement(expected, createIntent);
    assertDurableCreateIntent(createIntentJournalPath, createIntent);
    return;
  }
  if (canonicalPublicationReceiptBytes(marker) !== canonicalPublicationReceiptBytes(expected)) {
    throw mismatch(`provider marker conflicts with publication ${expected.publication_id}`);
  }
}

/**
 * Observe before PR creation. A markerless PR is never retroactively assigned
 * to the current claim: only this durable, pre-create intent opens the first
 * marker write window.
 */
export function preparePublicationReceipt(input: PublicationReceiptPrepareInput): PublicationPrepareEnvelopeV1 {
  try {
    const ghBin = input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh';
    const gitBin = input.git_bin ?? 'git';
    const owner = assertOwner(input.repo_root, gitBin, input.task_id, input.claim_id, input.branch);
    if (owner.target_ref !== input.target_branch) {
      throw mismatch(`lease target ${owner.target_ref} does not match provider target ${input.target_branch}`);
    }
    const provider = observeProviderPrOrNull(input.repo_root, ghBin, input.branch, input.target_branch);
    if (provider !== null) {
      const expected = expectedReceipt(input, provider);
      assertMarkerAgreement(expected, provider);
      return buildPublicationPrepareEnvelope(null);
    }
    const head = gitHeadAndTree(input.repo_root, gitBin);
    const intent = buildPublicationCreateIntent({
      provider_repo_id: observeProviderRepoId(input.repo_root, ghBin),
      task_id: input.task_id,
      claim_id: input.claim_id,
      generation: owner.generation,
      head_sha: head.head_sha,
    });
    return buildPublicationPrepareEnvelope(intent);
  } catch (error) {
    if (error instanceof PublicationReceiptError) throw error;
    throw incomplete('publication receipt create preparation failed', error);
  }
}

export function ensurePublicationReceipt(input: PublicationReceiptEnsureInput): PublicationReceiptResult {
  try {
    const ghBin = input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh';
    const provider = observeProviderPr(input.repo_root, ghBin, input.branch, input.target_branch);
    const receipt = expectedReceipt(input, provider);
    const createIntent = input.create_intent === undefined ? undefined : validatePublicationCreateIntent(input.create_intent);
    assertMarkerAgreement(receipt, provider, createIntent, input.create_intent_journal_path);
    const cachePath = writePublicationReceiptCache(input.repo_root, receipt, input.git_bin ?? 'git');
    const updatedBody = replacePublicationMarker(provider.body, receipt);
    const markerChanged = updatedBody !== provider.body;
    if (markerChanged) {
      // The marker is an external carrier, so take the task lock only for the
      // adjacent re-read and provider write. This proves the completing owner
      // did not move between fencing and the external carrier mutation; the
      // callback intentionally performs no lease mutation.
      withTaskLock(input.repo_root, input.task_id, () => {
        assertOwner(input.repo_root, input.git_bin ?? 'git', input.task_id, input.claim_id, input.branch);
        updateProviderBody(input.repo_root, ghBin, provider.pr_number, updatedBody);
      });
    }
    return Object.freeze({ receipt, cache_path: cachePath, marker_changed: markerChanged });
  } catch (error) {
    if (error instanceof PublicationReceiptError) throw error;
    throw incomplete('publication receipt persistence failed', error);
  }
}

export function rebuildPublicationReceipt(input: PublicationReceiptRebuildInput): PublicationReceiptResult {
  try {
    const ghBin = input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh';
    const gitBin = input.git_bin ?? 'git';
    const provider = observeProviderPrByNumber(input.repo_root, ghBin, input.pr_number);
    let receipt: PublicationReceiptV1 | null;
    try {
      receipt = decodePublicationMarker(provider.body);
    } catch (error) {
      throw mismatch('provider publication marker is invalid', error);
    }
    if (receipt === null) throw incomplete(`provider PR ${input.pr_number} has no publication receipt marker`);
    assertLiveEvidence(receipt, provider, input.repo_root, gitBin, input.merge_seal_path, input.checks_path);
    const cachePath = writePublicationReceiptCache(input.repo_root, receipt, gitBin);
    return Object.freeze({ receipt, cache_path: cachePath, marker_changed: false });
  } catch (error) {
    if (error instanceof PublicationReceiptError) throw error;
    throw incomplete('publication receipt rebuild failed', error);
  }
}

export function publicationJournalEvidence(receipt: PublicationReceiptV1): PublicationJournalEvidenceV1 {
  return validatePublicationJournalEvidence({
    provider_repo_id: receipt.provider_repo_id,
    provider_pr_number: receipt.pr_number,
    publication_id: receipt.publication_id,
    receipt_digest: publicationReceiptDigest(receipt),
  });
}

export function canonicalPublicationJournalEvidence(receipt: PublicationReceiptV1): string {
  return canonicalPublicationJournalEvidenceBytes(publicationJournalEvidence(receipt));
}
