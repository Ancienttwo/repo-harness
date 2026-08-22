/** Durable, task-locked publication review lifecycle effects. */
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { readFileSync, realpathSync } from 'fs';
import { dirname, join } from 'path';

import {
  canonicalPublicationJournalEvidenceBytes,
  canonicalPublicationReceiptBytes,
  decodePublicationMarker,
  publicationReceiptDigest,
  validatePublicationJournalEvidence,
  type PublicationJournalEvidenceV1,
  type PublicationReceiptV1,
} from '../../core/publication/publication-receipt';
import {
  PublicationLifecycleError,
  buildPublicationIntegrationObservation,
  canonicalPublicationIntegrationObservationBytes,
  canonicalPublicationLineageBytes,
  publicationLineageFromPointer,
  publicationPointerFromReceipt,
  type PublicationLifecycleErrorCode,
  type PublicationIntegrationObservationV1,
  type PublicationIntegrationState,
  type PublicationLineageV1,
} from '../../core/publication/publication-lifecycle';
import {
  abandonPublicationLeaseRecord,
  COMPLETED_ROW_STATUS_PATTERN,
  enterReviewingLeaseRecord,
  lookupCanonicalTask,
  reopenPublicationLeaseRecord,
  takeoverPublicationLeaseRecord,
  type CurrentPublicationPointerV1,
  type LeaseOwnerRecord,
} from '../../core/state/coordination-identity';
import { createFileExclusiveDurably } from '../evidence/atomic-append';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { readWorktreeTopology } from '../git/worktree-topology';
import {
  observeProviderPullRequestIntegration,
  observeProviderPullRequestState,
  readPublicationReceiptCache,
  rebuildPublicationReceipt,
  writePublicationReceiptCache,
  PublicationReceiptError,
  type ProviderPullRequestIntegrationV1,
} from './publication-receipt';
import { readCanonicalSprint, resolveRepoIdentity } from '../state/coordination-canonical-source';
import { readLease, removeLease, withTaskLock, writeLeaseOwnerDurably } from '../state/coordination-lease-store';

const LINEAGE_RELATIVE_PATH = 'repo-harness/publications/v1/lineage';
const INTEGRATION_RELATIVE_PATH = 'repo-harness/publications/v1/integration';
const SHIP_TRANSACTIONS_RELATIVE_PATH = 'repo-harness/transactions/ship';

function failure(
  code: PublicationLifecycleErrorCode,
  message: string,
  cause?: unknown,
  details?: Readonly<Record<string, string>>,
): PublicationLifecycleError {
  return new PublicationLifecycleError(code, message, cause, details);
}

function asLifecycleError(error: unknown, fallback: string): PublicationLifecycleError {
  if (error instanceof PublicationLifecycleError) return error;
  if (error instanceof PublicationReceiptError) return failure(error.code, error.message, error);
  return failure('publication_incomplete', fallback, error);
}

type ShipJournalStatus = 'in_progress' | 'complete';

interface ShipJournalProof {
  readonly evidence: PublicationJournalEvidenceV1;
  readonly worktree: string;
  readonly branch: string;
  readonly target_branch: string;
  readonly base_ref: string;
  readonly base_sha: string;
  readonly gate_sealed_head: string;
  readonly pushed_head: string;
  readonly pr_observed_head: string;
}

function recordObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw failure('publication_incomplete', `${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw failure('publication_incomplete', `${label} is required`);
  }
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw failure('publication_incomplete', `${label} is invalid`);
  return value;
}

function sameRealpath(left: string, right: string): boolean {
  try { return realpathSync(left) === realpathSync(right); } catch { return false; }
}

/**
 * The caller-controlled path is only a carrier. The immutable key determines
 * the sole ship journal accepted under this clone's git-common directory.
 */
function exactShipJournalPath(repoRoot: string, expectedKey: string, suppliedStatusPath: string, gitBin?: string): string {
  const expected = join(resolveGitCommonDirectory(repoRoot, gitBin), SHIP_TRANSACTIONS_RELATIVE_PATH, expectedKey, 'status.json');
  if (!sameRealpath(expected, suppliedStatusPath)) {
    throw failure('publication_incomplete', 'ship journal path is not the key-derived common-directory ship journal');
  }
  return expected;
}

function deriveShipJournalKey(repoRoot: string, meta: Record<string, unknown>, gitBin?: string): string {
  const fields = [
    `repo=${requiredString(meta.repo, 'ship journal metadata repo')}`,
    `worktree=${requiredString(meta.worktree, 'ship journal metadata worktree')}`,
    'operation=ship',
    `plan=${stringValue(meta.plan, 'ship journal metadata plan')}`,
    `contract=${stringValue(meta.contract, 'ship journal metadata contract')}`,
    `original_head=${requiredString(meta.original_head, 'ship journal metadata original_head')}`,
    `target_branch=${requiredString(meta.target_branch, 'ship journal metadata target_branch')}`,
    `base_sha=${requiredString(meta.base_sha, 'ship journal metadata base_sha')}`,
  ];
  try {
    return execFileSync(gitBin ?? 'git', ['hash-object', '--stdin'], {
      cwd: repoRoot,
      input: `${fields.join('\n')}\n`,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw failure('publication_incomplete', 'cannot derive ship journal key from metadata', error);
  }
}

function phaseRecords(status: Record<string, unknown>, name: string): Record<string, unknown>[] {
  if (!Array.isArray(status.phases)) throw failure('publication_incomplete', 'ship journal has no phases');
  return status.phases.filter((phase): phase is Record<string, unknown> => (
    Boolean(phase) && typeof phase === 'object' && !Array.isArray(phase)
      && (phase as Record<string, unknown>).phase === name
  ));
}

function exactlyOnePhase(status: Record<string, unknown>, name: string): Record<string, unknown> {
  const phases = phaseRecords(status, name);
  if (phases.length !== 1) throw failure('publication_incomplete', `ship journal must contain exactly one ${name} phase`);
  return phases[0]!;
}

function readShipJournalProof(
  repoRoot: string,
  suppliedStatusPath: string,
  expectedKey: string,
  expectedStatus: ShipJournalStatus,
  gitBin?: string,
): ShipJournalProof {
  const statusPath = exactShipJournalPath(repoRoot, expectedKey, suppliedStatusPath, gitBin);
  let status: Record<string, unknown>;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(statusPath, 'utf-8'));
  } catch (error) {
    throw failure('publication_incomplete', `ship journal is unreadable: ${statusPath}`, error);
  }
  status = recordObject(value, 'ship journal');
  if (status.status !== expectedStatus || status.operation !== 'ship' || status.key !== expectedKey) {
    throw failure('publication_incomplete', `ship journal is not the required ${expectedStatus} ship transaction`);
  }
  let metadata: unknown;
  try {
    metadata = JSON.parse(readFileSync(join(dirname(statusPath), 'meta.json'), 'utf-8'));
  } catch (error) {
    throw failure('publication_incomplete', 'ship journal metadata is unreadable', error);
  }
  const meta = recordObject(metadata, 'ship journal metadata');
  if (meta.key !== expectedKey || meta.operation !== 'ship') {
    throw failure('publication_incomplete', 'ship journal metadata key or operation does not match review entry');
  }
  if (deriveShipJournalKey(repoRoot, meta, gitBin) !== expectedKey) {
    throw failure('publication_incomplete', 'ship journal key does not match its metadata derivation');
  }
  const commonDir = resolveGitCommonDirectory(repoRoot, gitBin);
  if (!sameRealpath(requiredString(meta.repo, 'ship journal metadata repo'), join(commonDir, 'repo-harness/transactions'))) {
    throw failure('publication_incomplete', 'ship journal metadata repo is not this clone transaction root');
  }
  const gate = exactlyOnePhase(status, 'gate_sealed');
  const pushed = exactlyOnePhase(status, 'pushed');
  const observed = exactlyOnePhase(status, 'pr_observed');
  const complete = phaseRecords(status, 'complete');
  if (expectedStatus === 'in_progress' && complete.length !== 0) {
    throw failure('publication_incomplete', 'review entry requires ship complete to be absent');
  }
  if (expectedStatus === 'complete' && complete.length !== 1) {
    throw failure('publication_incomplete', 'legacy proof requires exactly one ship complete phase');
  }
  try {
    return {
      evidence: validatePublicationJournalEvidence(observed.publication),
      worktree: requiredString(meta.worktree, 'ship journal metadata worktree'),
      branch: requiredString(meta.branch, 'ship journal metadata branch'),
      target_branch: requiredString(meta.target_branch, 'ship journal metadata target_branch'),
      base_ref: requiredString(meta.base_ref, 'ship journal metadata base_ref'),
      base_sha: requiredString(meta.base_sha, 'ship journal metadata base_sha'),
      gate_sealed_head: requiredString(gate.ref, 'ship journal gate_sealed ref'),
      pushed_head: requiredString(pushed.ref, 'ship journal pushed ref'),
      pr_observed_head: requiredString(observed.ref, 'ship journal pr_observed ref'),
    };
  } catch (error) {
    throw failure('publication_incomplete', 'ship journal pr_observed publication evidence is invalid', error);
  }
}

function assertReceiptMatchesEvidence(receipt: PublicationReceiptV1, evidence: PublicationJournalEvidenceV1): void {
  if (
    receipt.provider_repo_id !== evidence.provider_repo_id
    || receipt.pr_number !== evidence.provider_pr_number
    || receipt.publication_id !== evidence.publication_id
    || publicationReceiptDigest(receipt) !== evidence.receipt_digest
  ) {
    throw failure('publication_claim_mismatch', 'ship journal pr_observed evidence does not match the marker-backed receipt');
  }
}

function assertShipJournalContext(proof: ShipJournalProof, record: LeaseOwnerRecord, receipt: PublicationReceiptV1): void {
  if (!sameRealpath(proof.worktree, record.execution_worktree ?? '')) {
    throw failure('publication_claim_mismatch', 'ship journal worktree does not match lease execution worktree');
  }
  if (proof.branch !== receipt.branch || proof.branch !== record.branch
    || proof.target_branch !== receipt.target_ref || proof.base_sha !== receipt.base_sha
    || !proof.base_ref.startsWith('refs/remotes/')
    || !proof.base_ref.endsWith(`/${receipt.target_ref}`)) {
    throw failure('publication_claim_mismatch', 'ship journal metadata does not match receipt and lease');
  }
  if (proof.gate_sealed_head !== receipt.head_sha
    || proof.pushed_head !== receipt.head_sha
    || proof.pr_observed_head !== receipt.head_sha) {
    throw failure('publication_pointer_mismatch', 'ship journal phases do not name the receipt head');
  }
  assertReceiptMatchesEvidence(receipt, proof.evidence);
}

function assertLeaseMatchesReceipt(
  record: LeaseOwnerRecord,
  receipt: PublicationReceiptV1,
  pointer?: CurrentPublicationPointerV1,
): void {
  if (
    record.task_id !== receipt.task_id
    || record.claim_id !== receipt.claim_id
    || record.generation !== receipt.generation
    || record.task_revision !== receipt.task_revision
    || record.target_ref !== receipt.target_ref
    || record.branch !== receipt.branch
  ) {
    throw failure('publication_claim_mismatch', 'lease owner does not match publication receipt');
  }
  if (pointer !== undefined && (
    pointer.publication_id !== receipt.publication_id
    || pointer.receipt_sha256 !== publicationReceiptDigest(receipt)
    || pointer.head_sha !== receipt.head_sha
  )) {
    throw failure('publication_pointer_mismatch', 'lease current_publication does not match receipt');
  }
}

function assertReopenTopology(repoRoot: string, record: LeaseOwnerRecord, receipt: PublicationReceiptV1, gitBin?: string): void {
  const worktree = record.execution_worktree;
  let topology;
  try { topology = readWorktreeTopology(repoRoot, gitBin ?? 'git'); } catch (error) {
    throw failure('worktree_missing', 'cannot read git worktree topology', error);
  }
  const entry = worktree === null ? undefined : topology.worktrees.find((candidate) => sameRealpath(candidate.path, worktree));
  if (entry === undefined) {
    throw failure('worktree_missing', `reviewing worktree is absent from git topology: ${worktree ?? '(none)'}`);
  }
  if (entry.branch !== `refs/heads/${record.branch}` || record.branch !== receipt.branch) {
    throw failure('publication_pointer_mismatch', 'reviewing worktree branch does not match receipt');
  }
  if (entry.head !== receipt.head_sha) throw failure('head_moved', `reviewing worktree head moved from ${receipt.head_sha} to ${entry.head ?? '(missing)'}`);
}

function receiptForPointer(repoRoot: string, pointer: CurrentPublicationPointerV1): PublicationReceiptV1 {
  const receipt = readPublicationReceiptCache(repoRoot, pointer.publication_id);
  if (receipt === null) throw failure('publication_incomplete', `receipt cache is missing for ${pointer.publication_id}`);
  if (publicationReceiptDigest(receipt) !== pointer.receipt_sha256) {
    throw failure('publication_pointer_mismatch', 'receipt digest does not match current publication pointer');
  }
  return receipt;
}

interface PublicationValidationEnvironment {
  readonly gh_bin?: string;
  readonly git_bin?: string;
  readonly merge_seal_path?: string;
  readonly checks_path?: string;
}

function rebuildReceiptForPointer(
  repoRoot: string,
  pointer: CurrentPublicationPointerV1,
  environment: PublicationValidationEnvironment,
): PublicationReceiptV1 {
  const cached = receiptForPointer(repoRoot, pointer);
  const rebuilt = rebuildPublicationReceipt({
    repo_root: repoRoot,
    pr_number: cached.pr_number,
    gh_bin: environment.gh_bin,
    git_bin: environment.git_bin,
    merge_seal_path: environment.merge_seal_path,
    checks_path: environment.checks_path,
  });
  if (rebuilt.receipt.publication_id !== pointer.publication_id) {
    throw failure('publication_pointer_mismatch', 'live rebuilt receipt does not match current publication pointer');
  }
  return rebuilt.receipt;
}

function currentReviewingRecord(repoRoot: string, taskId: string): LeaseOwnerRecord & { readonly current_publication: CurrentPublicationPointerV1 } {
  const read = readLease(repoRoot, taskId);
  const record = read.record;
  if (record === null || record.state !== 'reviewing' || !('current_publication' in record) || record.current_publication === null) {
    throw failure('publication_pointer_mismatch', `task ${taskId} has no reviewing current publication`);
  }
  return record as LeaseOwnerRecord & { readonly current_publication: CurrentPublicationPointerV1 };
}

export interface EnterReviewingInput extends PublicationValidationEnvironment {
  readonly repo_root: string;
  readonly task_id: string;
  readonly claim_id: string;
  readonly ship_transaction_key: string;
  readonly ship_journal_path: string;
}

function enterPublicationReviewingWithProof(
  input: EnterReviewingInput,
  expectedJournalStatus: ShipJournalStatus,
): CurrentPublicationPointerV1 {
  try {
    return withTaskLock(input.repo_root, input.task_id, () => {
      const record = readLease(input.repo_root, input.task_id).record;
      if (record === null) throw failure('publication_claim_mismatch', 'lease is unavailable while entering reviewing');
      const proof = readShipJournalProof(
        input.repo_root,
        input.ship_journal_path,
        input.ship_transaction_key,
        expectedJournalStatus,
        input.git_bin,
      );
      const rebuilt = rebuildPublicationReceipt({
        repo_root: input.repo_root,
        pr_number: proof.evidence.provider_pr_number,
        gh_bin: input.gh_bin,
        git_bin: input.git_bin,
        merge_seal_path: input.merge_seal_path,
        checks_path: input.checks_path,
      });
      assertShipJournalContext(proof, record, rebuilt.receipt);
      const pointer = publicationPointerFromReceipt(rebuilt.receipt, input.ship_transaction_key);
      assertLeaseMatchesReceipt(record, rebuilt.receipt);
      if (record.state === 'reviewing' && 'current_publication' in record && record.current_publication !== null) {
        assertLeaseMatchesReceipt(record, rebuilt.receipt, record.current_publication);
        if (record.current_publication.ship_transaction_key !== input.ship_transaction_key) {
          throw failure('publication_pointer_mismatch', 'reviewing pointer belongs to a different ship transaction');
        }
        return record.current_publication;
      }
      if (record.finish_transaction_key !== null && record.finish_transaction_key === input.ship_transaction_key) {
        throw failure('publication_incomplete', 'ship transaction key must not reuse finish transaction key');
      }
      const transition = enterReviewingLeaseRecord(record, { claimId: input.claim_id, publication: pointer });
      if (!transition.ok) throw failure('publication_claim_mismatch', transition.error);
      writeLeaseOwnerDurably(input.repo_root, input.task_id, transition.record);
      return pointer;
    });
  } catch (error) {
    throw asLifecycleError(error, 'cannot enter publication reviewing');
  }
}

/** Rebuilds the marker-backed receipt, then writes reviewing before ship complete. */
export function enterPublicationReviewing(input: EnterReviewingInput): CurrentPublicationPointerV1 {
  return enterPublicationReviewingWithProof(input, 'in_progress');
}

/** Explicit migration of one fully attributable completed legacy ship journal. */
export function migrateLegacyPublication(input: EnterReviewingInput): CurrentPublicationPointerV1 {
  return enterPublicationReviewingWithProof(input, 'complete');
}

export interface ReopenPublicationInput extends PublicationValidationEnvironment {
  readonly repo_root: string;
  readonly task_id: string;
  readonly claim_id: string;
  readonly expected_generation: number;
  readonly publication_id: string;
  readonly expected_head_sha: string;
}

export function reopenPublication(input: ReopenPublicationInput): LeaseOwnerRecord {
  try {
    return withTaskLock(input.repo_root, input.task_id, () => {
      const record = currentReviewingRecord(input.repo_root, input.task_id);
      const receipt = rebuildReceiptForPointer(input.repo_root, record.current_publication, input);
      assertLeaseMatchesReceipt(record, receipt, record.current_publication);
      assertReopenTopology(input.repo_root, record, receipt, input.git_bin);
      const transition = reopenPublicationLeaseRecord(record, {
        claimId: input.claim_id,
        expectedGeneration: input.expected_generation,
        expectedPublicationId: input.publication_id,
        expectedHeadSha: input.expected_head_sha,
      });
      if (!transition.ok) throw failure(transition.error === 'publication_pointer_mismatch' ? 'publication_pointer_mismatch' : 'publication_claim_mismatch', transition.error);
      writeLeaseOwnerDurably(input.repo_root, input.task_id, transition.record);
      return transition.record;
    });
  } catch (error) {
    throw asLifecycleError(error, 'cannot reopen publication');
  }
}

function assertCanonicalPending(repoRoot: string, record: LeaseOwnerRecord): void {
  const canonical = readCanonicalSprint(repoRoot, { targetRef: record.target_ref, sprintPath: record.sprint_path });
  if (!canonical.ok) throw failure('publication_incomplete', canonical.error);
  const lookup = lookupCanonicalTask({
    repoIdentity: resolveRepoIdentity(repoRoot),
    sprintPath: record.sprint_path,
    sprintText: canonical.text,
  }, record.task_id);
  if (!lookup.ok) throw failure('publication_incomplete', lookup.error);
  if (lookup.task.task_revision !== record.task_revision) {
    throw failure('task_revision_mismatch', `canonical task revision is ${lookup.task.task_revision}, lease holds ${record.task_revision}`);
  }
  if (lookup.task.row.status !== '[ ]') {
    throw failure('publication_incomplete', `canonical task is not pending: ${lookup.task.row.status || '(empty)'}`);
  }
}

export interface TakeoverPublicationInput extends PublicationValidationEnvironment {
  readonly repo_root: string;
  readonly task_id: string;
  readonly expected_claim_id: string;
  readonly expected_generation: number;
  readonly publication_id: string;
  readonly expected_head_sha: string;
  readonly reason: string;
  readonly session_id: string;
  readonly new_claim_id: string;
  readonly source_worktree: string;
}

export function takeoverPublication(input: TakeoverPublicationInput): LeaseOwnerRecord {
  try {
    return withTaskLock(input.repo_root, input.task_id, () => {
      const record = currentReviewingRecord(input.repo_root, input.task_id);
      const receipt = rebuildReceiptForPointer(input.repo_root, record.current_publication, input);
      assertLeaseMatchesReceipt(record, receipt, record.current_publication);
      assertCanonicalPending(input.repo_root, record);
      const transition = takeoverPublicationLeaseRecord(record, {
        expectedClaimId: input.expected_claim_id,
        expectedGeneration: input.expected_generation,
        expectedPublicationId: input.publication_id,
        expectedHeadSha: input.expected_head_sha,
        reason: input.reason,
        newClaimId: input.new_claim_id,
        sessionId: input.session_id,
        sourceWorktree: input.source_worktree,
      });
      if (!transition.ok) {
        const code = transition.error.includes('claim') ? 'publication_claim_mismatch' : 'publication_pointer_mismatch';
        throw failure(code, transition.error);
      }
      writeLeaseOwnerDurably(input.repo_root, input.task_id, transition.record);
      return transition.record;
    });
  } catch (error) {
    throw asLifecycleError(error, 'cannot take over publication');
  }
}

function lineagePath(repoRoot: string, publicationId: string): string {
  return join(resolveGitCommonDirectory(repoRoot), LINEAGE_RELATIVE_PATH, `${publicationId.slice('sha256:'.length)}.json`);
}

function persistLineage(repoRoot: string, lineage: PublicationLineageV1): void {
  const path = lineagePath(repoRoot, lineage.publication_id);
  const bytes = `${canonicalPublicationLineageBytes(lineage)}\n`;
  try {
    createFileExclusiveDurably(path, Buffer.from(bytes));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') throw failure('publication_incomplete', 'cannot persist publication lineage', error);
    let current: string;
    try { current = readFileSync(path, 'utf-8'); } catch (readError) { throw failure('publication_incomplete', 'existing publication lineage is unreadable', readError); }
    if (current !== bytes) throw failure('publication_pointer_mismatch', 'existing publication lineage conflicts with abandon request');
  }
}

export interface AbandonPublicationInput extends PublicationValidationEnvironment {
  readonly repo_root: string;
  readonly task_id: string;
  readonly expected_claim_id: string;
  readonly expected_generation: number;
  readonly publication_id: string;
  readonly expected_head_sha: string;
  readonly reason: string;
}

export function abandonPublication(input: AbandonPublicationInput): PublicationLineageV1 {
  try {
    return withTaskLock(input.repo_root, input.task_id, () => {
      const record = currentReviewingRecord(input.repo_root, input.task_id);
      const receipt = rebuildReceiptForPointer(input.repo_root, record.current_publication, input);
      assertLeaseMatchesReceipt(record, receipt, record.current_publication);
      assertCanonicalPending(input.repo_root, record);
      const provider = observeProviderPullRequestState(input.repo_root, receipt.pr_number, input.gh_bin);
      if (provider.state !== 'CLOSED' || provider.merged_at !== null) {
        throw failure('publication_incomplete', 'publication abandon requires a provider CLOSED and unmerged pull request');
      }
      const transition = abandonPublicationLeaseRecord(record, {
        expectedClaimId: input.expected_claim_id,
        expectedGeneration: input.expected_generation,
        expectedPublicationId: input.publication_id,
        expectedHeadSha: input.expected_head_sha,
      });
      if (!transition.ok) throw failure(transition.error.includes('claim') ? 'publication_claim_mismatch' : 'publication_pointer_mismatch', transition.error);
      const lineage = publicationLineageFromPointer(receipt, record.current_publication, input.reason);
      // Audit durability precedes any lease removal: a failed lineage write has
      // no authority effect and retry sees the unchanged reviewing pointer.
      persistLineage(input.repo_root, lineage);
      writeLeaseOwnerDurably(input.repo_root, input.task_id, transition.record);
      removeLease(input.repo_root, input.task_id, transition.record.claim_id);
      return lineage;
    });
  } catch (error) {
    throw asLifecycleError(error, 'cannot abandon publication');
  }
}

type PublicationMergeMode = 'ancestor' | 'absorbed' | 'unmerged';

export interface ReconcilePublicationInput extends PublicationValidationEnvironment {
  readonly repo_root: string;
  readonly task_id: string;
  readonly expected_claim_id: string;
  readonly expected_generation: number;
  readonly publication_id: string;
  readonly expected_head_sha: string;
  readonly remote: string;
}

export interface ReconcilePublicationResult {
  readonly classification: 'integrated';
  readonly integration_state: PublicationIntegrationState;
  readonly attention: 'superseded_attention' | null;
  readonly fetched_target_oid: string;
  readonly observation_ref: string;
  readonly evidence: PublicationIntegrationObservationV1;
}

function integrationJournalProof(
  repoRoot: string,
  pointer: CurrentPublicationPointerV1,
  gitBin?: string,
): ShipJournalProof {
  const statusPath = join(
    resolveGitCommonDirectory(repoRoot, gitBin),
    SHIP_TRANSACTIONS_RELATIVE_PATH,
    pointer.ship_transaction_key,
    'status.json',
  );
  return readShipJournalProof(repoRoot, statusPath, pointer.ship_transaction_key, 'complete', gitBin);
}

function assertProviderReceiptIdentity(
  provider: ProviderPullRequestIntegrationV1,
  receipt: PublicationReceiptV1,
): void {
  let marker: PublicationReceiptV1 | null;
  try { marker = decodePublicationMarker(provider.body); } catch (error) {
    throw failure('publication_pointer_mismatch', 'provider publication marker is invalid', error);
  }
  if (marker === null || canonicalPublicationReceiptBytes(marker) !== canonicalPublicationReceiptBytes(receipt)) {
    throw failure('publication_pointer_mismatch', 'provider publication marker does not match the current receipt');
  }
  if (
    provider.provider_repo_id !== receipt.provider_repo_id
    || provider.pr_number !== receipt.pr_number
    || provider.pr_url !== receipt.pr_url
    || provider.head_sha !== receipt.head_sha
    || provider.head_ref !== receipt.branch
    || provider.base_ref !== receipt.target_ref
    || provider.created_at !== receipt.created_at
  ) {
    throw failure('publication_claim_mismatch', 'live provider identity does not match the current receipt');
  }
  if (!['OPEN', 'CLOSED', 'MERGED'].includes(provider.state)) {
    throw failure('provider_unavailable', `unsupported provider PR state: ${provider.state}`);
  }
}

function integrationReceiptAndProvider(
  repoRoot: string,
  pointer: CurrentPublicationPointerV1,
  environment: PublicationValidationEnvironment,
): { readonly receipt: PublicationReceiptV1; readonly provider: ProviderPullRequestIntegrationV1 } {
  let receipt = readPublicationReceiptCache(repoRoot, pointer.publication_id, environment.git_bin ?? 'git');
  const proof = receipt === null ? integrationJournalProof(repoRoot, pointer, environment.git_bin) : null;
  const prNumber = receipt?.pr_number ?? proof!.evidence.provider_pr_number;
  const provider = observeProviderPullRequestIntegration(repoRoot, prNumber, environment.gh_bin);
  if (receipt === null) {
    let marker: PublicationReceiptV1 | null;
    try { marker = decodePublicationMarker(provider.body); } catch (error) {
      throw failure('publication_pointer_mismatch', 'provider publication marker is invalid', error);
    }
    if (marker === null) throw failure('publication_incomplete', 'provider publication marker is missing');
    assertReceiptMatchesEvidence(marker, proof!.evidence);
    writePublicationReceiptCache(repoRoot, marker, environment.git_bin ?? 'git');
    receipt = marker;
  }
  if (publicationReceiptDigest(receipt) !== pointer.receipt_sha256 || receipt.publication_id !== pointer.publication_id) {
    throw failure('publication_pointer_mismatch', 'receipt does not match the current publication pointer');
  }
  assertProviderReceiptIdentity(provider, receipt);
  return { receipt, provider };
}

function gitOutput(repoRoot: string, gitBin: string, args: readonly string[], message: string): string {
  try {
    return execFileSync(gitBin, [...args], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch (error) {
    throw failure('provider_unavailable', message, error);
  }
}

function fetchProviderTarget(
  repoRoot: string,
  remote: string,
  targetRef: string,
  publicationId: string,
  gitBin = 'git',
): { readonly fetchedOid: string; readonly observationRef: string } {
  if (remote.trim() === '' || remote.startsWith('-') || /[\0\r\n]/u.test(remote)) {
    throw failure('publication_incomplete', 'remote is unsafe');
  }
  try {
    execFileSync(gitBin, ['check-ref-format', '--branch', targetRef], { cwd: repoRoot, stdio: 'ignore' });
  } catch (error) {
    throw failure('publication_incomplete', `target ref is unsafe: ${targetRef}`, error);
  }
  const publicationKey = publicationId.slice('sha256:'.length);
  const temporaryRef = `refs/repo-harness/observations/tmp/${publicationKey}/${randomUUID()}`;
  gitOutput(
    repoRoot,
    gitBin,
    ['fetch', '--no-tags', '--no-write-fetch-head', remote, `+refs/heads/${targetRef}:${temporaryRef}`],
    `cannot fetch provider target ${remote}/${targetRef}`,
  );
  const fetchedOid = gitOutput(
    repoRoot,
    gitBin,
    ['rev-parse', '--verify', '--end-of-options', `${temporaryRef}^{commit}`],
    'fetched provider target does not resolve to a commit',
  );
  if (!/^[0-9a-f]{40,64}$/u.test(fetchedOid)) {
    throw failure('provider_unavailable', `fetched provider target resolved to an invalid OID: ${fetchedOid}`);
  }
  const observationRef = `refs/repo-harness/observations/publication/${publicationKey}/${fetchedOid}`;
  try {
    execFileSync(gitBin, ['update-ref', observationRef, fetchedOid, ''], { cwd: repoRoot, stdio: 'ignore' });
  } catch {
    const existing = gitOutput(repoRoot, gitBin, ['rev-parse', '--verify', '--end-of-options', observationRef], 'observation ref collision');
    if (existing !== fetchedOid) throw failure('provider_unavailable', `observation ref collision: ${observationRef}`);
  }
  try {
    execFileSync(gitBin, ['update-ref', '-d', temporaryRef, fetchedOid], { cwd: repoRoot, stdio: 'ignore' });
  } catch (error) {
    throw failure('provider_unavailable', `cannot retire temporary observation ref ${temporaryRef}`, error);
  }
  return { fetchedOid, observationRef };
}

function classifyPublicationMerge(
  repoRoot: string,
  headSha: string,
  targetOid: string,
): PublicationMergeMode {
  try {
    execFileSync('git', ['cat-file', '-e', `${headSha}^{commit}`], { cwd: repoRoot, stdio: 'ignore' });
  } catch (error) {
    throw failure('publication_head_unavailable', `publication head object is unavailable: ${headSha}`, error);
  }
  let output: string;
  try {
    output = execFileSync('/bin/bash', [join(repoRoot, 'scripts/worktree-merge-lib.sh'), '--target', targetOid, headSha], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw failure('integration_unproven', 'worktree merge classification failed', error);
  }
  const expectedPrefix = `${headSha}\t`;
  if (!output.startsWith(expectedPrefix)) throw failure('integration_unproven', 'worktree merge classification returned invalid output');
  const mode = output.slice(expectedPrefix.length);
  if (mode !== 'ancestor' && mode !== 'absorbed' && mode !== 'unmerged') {
    throw failure('integration_unproven', `worktree merge classification returned invalid mode: ${mode}`);
  }
  return mode;
}

function assertCanonicalCompletedAt(repoRoot: string, record: LeaseOwnerRecord, fetchedOid: string): void {
  const canonical = readCanonicalSprint(repoRoot, { targetRef: fetchedOid, sprintPath: record.sprint_path });
  if (!canonical.ok) throw failure('canonical_row_incomplete', canonical.error, undefined, { fetched_target_oid: fetchedOid });
  const lookup = lookupCanonicalTask({
    repoIdentity: resolveRepoIdentity(repoRoot),
    sprintPath: record.sprint_path,
    sprintText: canonical.text,
  }, record.task_id);
  if (!lookup.ok) throw failure('canonical_row_incomplete', lookup.error, undefined, { fetched_target_oid: fetchedOid });
  if (lookup.task.task_revision !== record.task_revision) {
    throw failure('task_revision_mismatch', `canonical task revision is ${lookup.task.task_revision}, lease holds ${record.task_revision}`, undefined, { fetched_target_oid: fetchedOid });
  }
  if (!COMPLETED_ROW_STATUS_PATTERN.test(lookup.task.row.status)) {
    throw failure('canonical_row_incomplete', `canonical task is not completed at ${fetchedOid}: ${lookup.task.row.status || '(empty)'}`, undefined, { fetched_target_oid: fetchedOid });
  }
}

function integrationObservationPath(repoRoot: string, observation: PublicationIntegrationObservationV1): string {
  return join(
    resolveGitCommonDirectory(repoRoot),
    INTEGRATION_RELATIVE_PATH,
    observation.publication_id.slice('sha256:'.length),
    `${observation.observation_id.slice('sha256:'.length)}.json`,
  );
}

function persistIntegrationObservation(repoRoot: string, observation: PublicationIntegrationObservationV1): void {
  const path = integrationObservationPath(repoRoot, observation);
  const bytes = `${canonicalPublicationIntegrationObservationBytes(observation)}\n`;
  try {
    createFileExclusiveDurably(path, Buffer.from(bytes));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw failure('publication_incomplete', 'cannot persist integration observation', error);
    }
    let current: string;
    try { current = readFileSync(path, 'utf-8'); } catch (readError) {
      throw failure('publication_incomplete', 'existing integration observation is unreadable', readError);
    }
    if (current !== bytes) throw failure('publication_pointer_mismatch', 'existing integration observation conflicts with reconcile');
  }
}

/** Provider-OID-fenced closeout for one exact reviewing publication. */
export function reconcilePublication(input: ReconcilePublicationInput): ReconcilePublicationResult {
  try {
    const initial = currentReviewingRecord(input.repo_root, input.task_id);
    const initialPointer = initial.current_publication;
    const initialLive = integrationReceiptAndProvider(input.repo_root, initialPointer, input);
    assertLeaseMatchesReceipt(initial, initialLive.receipt, initialPointer);
    if (
      initial.claim_id !== input.expected_claim_id
      || initial.generation !== input.expected_generation
      || initialPointer.publication_id !== input.publication_id
      || initialPointer.head_sha !== input.expected_head_sha
    ) {
      throw failure('publication_claim_mismatch', 'reconcile input does not match the current reviewing publication');
    }
    const fetched = fetchProviderTarget(
      input.repo_root,
      input.remote,
      initialLive.receipt.target_ref,
      initialLive.receipt.publication_id,
      input.git_bin ?? 'git',
    );
    const mergeMode = classifyPublicationMerge(input.repo_root, initialLive.receipt.head_sha, fetched.fetchedOid);

    return withTaskLock(input.repo_root, input.task_id, () => {
      const record = currentReviewingRecord(input.repo_root, input.task_id);
      const pointer = record.current_publication;
      const live = integrationReceiptAndProvider(input.repo_root, pointer, input);
      assertLeaseMatchesReceipt(record, live.receipt, pointer);
      if (
        record.claim_id !== input.expected_claim_id
        || record.generation !== input.expected_generation
        || pointer.publication_id !== input.publication_id
        || pointer.head_sha !== input.expected_head_sha
        || record.task_revision !== initial.task_revision
        || pointer.receipt_sha256 !== initialPointer.receipt_sha256
        || pointer.ship_transaction_key !== initialPointer.ship_transaction_key
      ) {
        throw failure('publication_claim_mismatch', 'reviewing publication changed before reconcile mutation');
      }
      if (live.provider.base_sha !== fetched.fetchedOid) {
        throw failure('provider_unavailable', `provider target moved after fetch: observed ${live.provider.base_sha}, fetched ${fetched.fetchedOid}`, undefined, { fetched_target_oid: fetched.fetchedOid });
      }
      assertCanonicalCompletedAt(input.repo_root, record, fetched.fetchedOid);
      if (mergeMode === 'unmerged') {
        if (live.provider.state === 'CLOSED' && live.provider.merged_at === null) {
          throw failure('closed_unmerged', 'provider PR is closed without integration proof; retain reviewing and use publication abandon or reopen', undefined, { fetched_target_oid: fetched.fetchedOid });
        }
        throw failure('integration_unproven', 'publication head is not integrated into the fetched provider target', undefined, { fetched_target_oid: fetched.fetchedOid });
      }
      const integrationState: PublicationIntegrationState = (
        live.provider.state === 'MERGED' || live.provider.merged_at !== null
      ) ? 'merged' : mergeMode;
      const evidence = buildPublicationIntegrationObservation({
        publication_id: live.receipt.publication_id,
        receipt_sha256: pointer.receipt_sha256,
        task_id: live.receipt.task_id,
        task_revision: live.receipt.task_revision,
        claim_id: live.receipt.claim_id,
        generation: live.receipt.generation,
        head_sha: live.receipt.head_sha,
        target_ref: live.receipt.target_ref,
        fetched_target_oid: fetched.fetchedOid,
        observation_ref: fetched.observationRef,
        provider_pr_number: live.receipt.pr_number,
        provider_state: live.provider.state,
        provider_merged_at: live.provider.merged_at,
        integration_state: integrationState,
      });
      persistIntegrationObservation(input.repo_root, evidence);
      removeLease(input.repo_root, input.task_id, input.expected_claim_id);
      return Object.freeze({
        classification: 'integrated' as const,
        integration_state: integrationState,
        attention: live.provider.state === 'OPEN' && mergeMode === 'absorbed' ? 'superseded_attention' as const : null,
        fetched_target_oid: fetched.fetchedOid,
        observation_ref: fetched.observationRef,
        evidence,
      });
    });
  } catch (error) {
    throw asLifecycleError(error, 'cannot reconcile publication integration');
  }
}

export interface LegacyInspectInput extends Omit<EnterReviewingInput, 'claim_id' | 'ship_transaction_key'> {
  readonly expected_claim_id: string;
  readonly ship_transaction_key: string;
}

export type LegacyInspection =
  | { readonly classification: 'migratable'; readonly receipt: PublicationReceiptV1 }
  | { readonly classification: 'legacy_unattributable'; readonly reason: string };

/** Marker-backed reconstruction is required; no legacy PR is adopted by inference. */
export function inspectLegacyPublication(input: LegacyInspectInput): LegacyInspection {
  try {
    const proof = readShipJournalProof(
      input.repo_root,
      input.ship_journal_path,
      input.ship_transaction_key,
      'complete',
      input.git_bin,
    );
    const rebuilt = rebuildPublicationReceipt({
      repo_root: input.repo_root,
      pr_number: proof.evidence.provider_pr_number,
      gh_bin: input.gh_bin,
      git_bin: input.git_bin,
      merge_seal_path: input.merge_seal_path,
      checks_path: input.checks_path,
    });
    const record = readLease(input.repo_root, input.task_id).record;
    if (record === null || record.state !== 'completing' || record.claim_id !== input.expected_claim_id) {
      return { classification: 'legacy_unattributable', reason: 'legacy lease does not exactly match completing claim evidence' };
    }
    assertShipJournalContext(proof, record, rebuilt.receipt);
    assertLeaseMatchesReceipt(record, rebuilt.receipt);
    return { classification: 'migratable', receipt: rebuilt.receipt };
  } catch (error) {
    const lifecycle = asLifecycleError(error, 'legacy publication cannot be attributed');
    return { classification: 'legacy_unattributable', reason: lifecycle.message };
  }
}
