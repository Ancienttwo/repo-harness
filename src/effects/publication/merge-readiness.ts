import { createHash } from 'crypto';
import { existsSync, readFileSync, realpathSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

import {
  projectMergeReadiness,
  type MergeReadinessAcceptance,
  type MergeReadinessIntegrationMode,
  type MergeReadinessObservation,
  type MergeReadinessV1,
  type ProviderMergeReadinessFactsV1,
} from '../../core/publication/merge-readiness';
import {
  decodePublicationMarker,
  publicationReceiptDigest,
  publicationSha256,
  type PublicationReceiptV1,
} from '../../core/publication/publication-receipt';
import type { LeaseOwnerRecord } from '../../core/state/coordination-identity';
import { readActiveSprintPath, readCanonicalTargetRef } from '../state/collect-board-inputs';
import { readLease } from '../state/coordination-lease-store';
import { resolveBoard } from '../state/resolve-board';
import { resolveEffectiveStateReadOnly } from '../state/resolve-effective-state';
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
  readonly now_ms?: number;
  /** Test/effect seam; production leaves this unset and invokes the configured gh binary. */
  readonly gh_runner?: (args: readonly string[]) => { readonly status: number; readonly stdout: string; readonly stderr?: string };
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

interface LocalReadinessSnapshot {
  readonly token: string;
  readonly lease: LeaseOwnerRecord | null;
  readonly lease_is_reviewing: boolean;
  readonly pointer_matches_receipt: boolean;
  readonly lease_matches_receipt: boolean;
  readonly canonical_task_matches_receipt: boolean;
  readonly local_proof_head_matches_receipt: boolean;
  readonly review_subject_matches_receipt: boolean;
  readonly verification_evidence_matches_receipt: boolean;
  readonly local_evidence_fresh: boolean;
  readonly acceptance: MergeReadinessAcceptance;
}

export interface MergeReadinessRound {
  readonly local_before: LocalReadinessSnapshot;
  readonly identity_before: ProviderIdentity;
  readonly facts: ProviderMergeReadinessFactsV1;
  readonly integration_mode: MergeReadinessIntegrationMode;
  readonly identity_after: ProviderIdentity;
  readonly local_after: LocalReadinessSnapshot;
}

export interface MergeReadinessCollector {
  readonly resolve_receipt: (input: PublicationReadinessInput) => PublicationReceiptV1;
  readonly collect_local: (receipt: PublicationReceiptV1, input: PublicationReadinessInput) => LocalReadinessSnapshot;
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

function identityBytes(identity: ProviderIdentity): string {
  return JSON.stringify(identity);
}

export function observeProviderReadinessIdentity(receipt: PublicationReceiptV1, input: PublicationReadinessInput): ProviderIdentity {
  const repo = object(gh(input, ['repo', 'view', '--json', 'id,nameWithOwner']), 'provider repository');
  const pr = object(gh(input, [
    'pr', 'view', String(receipt.pr_number), '--json',
    'number,url,state,isDraft,headRefOid,headRefName,baseRefOid,baseRefName,body,reviewDecision,mergeable',
  ]), 'provider PR');
  const number = pr.number;
  if (!Number.isInteger(number) || number !== receipt.pr_number) {
    throw new MergeReadinessError('publication_claim_mismatch', 'provider PR number does not match the publication receipt');
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

export function observeProviderReadinessFacts(identity: ProviderIdentity, receipt: PublicationReceiptV1, input: PublicationReadinessInput): ProviderMergeReadinessFactsV1 {
  const checksValue = gh(input, [
    'pr', 'checks', String(receipt.pr_number), '--required', '--json', 'bucket',
  ], [0, 1, 8]);
  if (!Array.isArray(checksValue)) throw new MergeReadinessError('provider_data_incomplete', 'provider required checks must be an array');
  const checks = checksValue.map((entry) => {
    const check = object(entry, 'provider required check');
    if (!['pass', 'fail', 'pending', 'skipping', 'cancel'].includes(String(check.bucket))) {
      throw new MergeReadinessError('provider_data_incomplete', 'provider required check bucket is unknown');
    }
    return Object.freeze({ bucket: check.bucket as 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel' });
  });
  const query = 'query($repoId:ID!,$number:Int!){node(id:$repoId){... on Repository{pullRequest(number:$number){reviewThreads(first:100){pageInfo{hasNextPage}nodes{isResolved}}}}}}';
  const graph = object(gh(input, [
    'api', 'graphql', '-f', `query=${query}`, '-F', `repoId=${identity.provider_repo_id}`, '-F', `number=${receipt.pr_number}`,
  ]), 'provider GraphQL result');
  const data = object(graph.data, 'provider GraphQL data');
  const node = object(data.node, 'provider repository node');
  const pr = object(node.pullRequest, 'provider pull request node');
  const threads = object(pr.reviewThreads, 'provider review threads');
  const pageInfo = object(threads.pageInfo, 'provider review thread pageInfo');
  if (pageInfo.hasNextPage !== false || !Array.isArray(threads.nodes)) {
    throw new MergeReadinessError('provider_data_incomplete', 'provider review threads were not exhaustively observed');
  }
  let unresolved = 0;
  for (const entry of threads.nodes) {
    const thread = object(entry, 'provider review thread');
    if (typeof thread.isResolved !== 'boolean') throw new MergeReadinessError('provider_data_incomplete', 'provider review thread isResolved is invalid');
    if (!thread.isResolved) unresolved += 1;
  }
  return Object.freeze({
    state: identity.state,
    is_draft: identity.is_draft,
    head_sha: identity.head_sha,
    base_sha: identity.base_sha,
    review_decision: identity.review_decision,
    unresolved_thread_count: unresolved,
    checks: Object.freeze(checks),
    mergeable: identity.mergeable,
  });
}

function mergeSealPath(worktree: string, requested?: string): string {
  if (requested) return requested;
  const repositoryId = createHash('sha256').update(realpathSync(worktree)).digest('hex');
  return join(homedir(), '.repo-harness', 'gates', repositoryId, 'merge-seal.latest.json');
}

function readOptional(path: string): Buffer | null {
  try { return readFileSync(path); } catch { return null; }
}

function acceptanceFromEffective(effective: ReturnType<typeof resolveEffectiveStateReadOnly>): MergeReadinessAcceptance {
  if (effective.external_acceptance.freshness === 'not_applicable') return 'not_required';
  if (effective.external_acceptance.freshness !== 'fresh') return 'missing';
  if (effective.external_acceptance.status === 'user_waiver') return 'waived';
  if (effective.external_acceptance.status === 'external_pass') return 'pass';
  return 'missing';
}

function collectLocal(receipt: PublicationReceiptV1, input: PublicationReadinessInput): LocalReadinessSnapshot {
  const lease = readLease(input.repo_root, receipt.task_id);
  const record = lease.record;
  const reviewing = record !== null && record.state === 'reviewing' && 'current_publication' in record;
  const pointer = reviewing ? record.current_publication : null;
  const worktree = record?.execution_worktree && existsSync(record.execution_worktree)
    ? record.execution_worktree
    : null;
  let effective: ReturnType<typeof resolveEffectiveStateReadOnly> | null = null;
  if (worktree !== null) {
    try { effective = resolveEffectiveStateReadOnly(worktree, input.now_ms ?? Date.now()); } catch { effective = null; }
  }
  const checksPath = worktree === null ? null : input.checks_path ?? join(worktree, '.ai/harness/checks/latest.json');
  const checksRaw = checksPath === null ? null : readOptional(checksPath);
  const sealPath = worktree === null ? null : mergeSealPath(worktree, input.merge_seal_path ?? process.env.REPO_HARNESS_PUBLICATION_SEAL_PATH);
  const sealRaw = sealPath === null ? null : readOptional(sealPath);
  let seal: Record<string, unknown> | null = null;
  try { seal = sealRaw ? object(JSON.parse(sealRaw.toString('utf-8')), 'merge seal') : null; } catch { seal = null; }
  let canonicalMatches = false;
  let boardRevision = '';
  if (record) {
    try {
      const board = resolveBoard(input.repo_root, {
        sprintPath: record.sprint_path,
        targetRef: record.target_ref,
        nowMs: input.now_ms ?? Date.now(),
      });
      const card = board.cards.find((candidate) => candidate.task_id === receipt.task_id);
      canonicalMatches = board.snapshot_consistency === 'stable' && card?.task_revision === receipt.task_revision;
      boardRevision = board.revisions.board;
    } catch { canonicalMatches = false; }
  }
  const sourceHashes = effective ? effective.source_hashes : {};
  return Object.freeze({
    token: publicationSha256(Buffer.from(JSON.stringify({
      lease: lease.raw,
      checks: checksRaw?.toString('base64') ?? null,
      seal: sealRaw?.toString('base64') ?? null,
      sourceHashes,
      boardRevision,
    }))),
    lease: record,
    lease_is_reviewing: reviewing,
    pointer_matches_receipt: pointer !== null
      && pointer.publication_id === receipt.publication_id
      && pointer.receipt_sha256 === publicationReceiptDigest(receipt)
      && pointer.head_sha === receipt.head_sha,
    lease_matches_receipt: record !== null
      && record.claim_id === receipt.claim_id
      && record.generation === receipt.generation
      && record.task_revision === receipt.task_revision,
    canonical_task_matches_receipt: canonicalMatches,
    local_proof_head_matches_receipt: sealRaw !== null
      && publicationSha256(sealRaw) === receipt.merge_seal_sha256
      && seal?.head_sha === receipt.head_sha
      && seal?.base_sha === receipt.base_sha,
    review_subject_matches_receipt: effective?.review.recorded_subject_sha256 === receipt.review_subject_sha256,
    verification_evidence_matches_receipt: checksRaw !== null && publicationSha256(checksRaw) === receipt.verification_evidence_sha256,
    local_evidence_fresh: effective !== null
      && effective.review.freshness === 'fresh'
      && effective.checks.freshness === 'fresh'
      && effective.checks.status === 'pass',
    acceptance: effective ? acceptanceFromEffective(effective) : 'missing',
  });
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
  collect_local: collectLocal,
  observe_identity: observeProviderReadinessIdentity,
  observe_facts: observeProviderReadinessFacts,
  classify_integration: classifyIntegration,
});

function projectRound(receipt: PublicationReceiptV1, round: MergeReadinessRound, observation: MergeReadinessObservation): MergeReadinessV1 {
  const local = round.local_before;
  return projectMergeReadiness({
    receipt,
    lease_is_reviewing: local.lease_is_reviewing,
    pointer_matches_receipt: local.pointer_matches_receipt,
    lease_matches_receipt: local.lease_matches_receipt,
    canonical_task_matches_receipt: local.canonical_task_matches_receipt,
    local_proof_head_matches_receipt: local.local_proof_head_matches_receipt,
    review_subject_matches_receipt: local.review_subject_matches_receipt,
    verification_evidence_matches_receipt: local.verification_evidence_matches_receipt,
    local_evidence_fresh: local.local_evidence_fresh,
    acceptance: local.acceptance,
    integration_mode: round.integration_mode,
    observation,
    provider: observation === 'stable' ? round.facts : null,
  });
}

function collectRound(receipt: PublicationReceiptV1, input: PublicationReadinessInput, collector: MergeReadinessCollector): MergeReadinessRound {
  const localBefore = collector.collect_local(receipt, input);
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
  const localAfter = collector.collect_local(receipt, input);
  return Object.freeze({
    local_before: localBefore,
    identity_before: identityBefore,
    facts,
    integration_mode: integrationMode,
    identity_after: identityAfter,
    local_after: localAfter,
  });
}

function roundStable(round: MergeReadinessRound): boolean {
  return round.local_before.token === round.local_after.token
    && identityBytes(round.identity_before) === identityBytes(round.identity_after);
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
    const local = latest?.local_before ?? collector.collect_local(receipt, input);
    const emptyIdentity: ProviderIdentity = {
      provider_repo_id: receipt.provider_repo_id, repo_name_with_owner: 'unavailable', pr_number: receipt.pr_number,
      pr_url: receipt.pr_url, state: 'UNKNOWN', is_draft: false, head_sha: receipt.head_sha,
      head_ref: receipt.branch, base_sha: receipt.base_sha, base_ref: receipt.target_ref, body: '',
      review_decision: null, mergeable: 'CONFLICTING',
    };
    const round: MergeReadinessRound = {
      local_before: local, local_after: local, identity_before: emptyIdentity, identity_after: emptyIdentity,
      facts: { state: 'UNKNOWN', is_draft: false, head_sha: receipt.head_sha, base_sha: receipt.base_sha,
        review_decision: null, unresolved_thread_count: 0, checks: [], mergeable: 'CONFLICTING' },
      integration_mode: 'unavailable',
    };
    return projectRound(receipt, round, error.code);
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
