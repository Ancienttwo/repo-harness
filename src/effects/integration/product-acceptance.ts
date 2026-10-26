import { captureGitVirtualTreeSnapshot } from '../evidence/verification-execution';
import { osAccountHome } from '../runtime/os-account-home';
import type { ReviewAdmissionSource } from '../admission/admission-source';
import { gitExecFileSync, gitSpawnSync } from '../git/runner';
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
  readdirSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import { randomUUID } from 'crypto';

import {
  assertCompletePassingMatrix,
  buildAcceptanceMatrix,
  buildIntegrationContract,
  buildIntegrationEnvelope,
  buildProductAcceptanceProjection,
  canonicalAcceptanceMatrixBytes,
  canonicalIntegrationContractBytes,
  canonicalIntegrationEnvelopeBytes,
  canonicalProductAcceptanceProjectionBytes,
  validateAcceptanceMatrix,
  validateIntegrationContract,
  validateIntegrationEnvelope,
  validateProductAcceptanceProjection,
  type AcceptanceMatrixResult,
  type AcceptanceMatrixV2,
  type IntegrationContractV2,
  type IntegrationEnvelopeV2,
  type ProductAcceptanceProjectionV2,
  type RequiredPullRequestV2,
  type SelectedPullRequestV2,
} from '../../core/integration/product-acceptance';
import {
  publicationSha256,
  stablePublicationJson,
} from '../../core/publication/publication-receipt';
import { collectPullRequestIntegration, observeProviderReadinessIdentity, type PublicationReadinessInput } from '../publication/merge-readiness';
import { resolveGitCommonDirectory } from '../git/common-directory';
import {
  acceptanceReceiptPath,
  readAcceptanceReceiptRecord,
  verifyAcceptance,
  type AcceptanceReceipt,
} from '../review/acceptance-receipt';

export const INTEGRATION_EVIDENCE_ROOT_RELATIVE_PATH = 'repo-harness/integration/v2';

export type IntegrationAcceptanceErrorCode =
  | 'requirement_invalid'
  | 'repository_mismatch'
  | 'publication_stale'
  | 'candidate_stale'
  | 'matrix_invalid'
  | 'acceptance_unavailable'
  | 'evidence_conflict';

export class IntegrationAcceptanceError extends Error {
  constructor(
    readonly code: IntegrationAcceptanceErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'IntegrationAcceptanceError';
  }
}

export interface CreateIntegrationContractInput {
  readonly approved_prd_ref: string;
  readonly source_spec_ref: string;
  readonly integration_group: string;
  readonly required_pull_requests: readonly RequiredPullRequestV2[];
  readonly required_constraints: readonly string[];
}

export interface CreateIntegrationEnvelopeInput {
  readonly contract_sha256: string;
  readonly base_sha: string;
  readonly final_head_sha: string;
  readonly final_tree_sha: string;
}

export interface CreateAcceptanceMatrixRowInput {
  readonly constraint_id: string;
  readonly evidence_ref: string;
  readonly result: AcceptanceMatrixResult;
}

export interface CreateAcceptanceMatrixInput {
  readonly contract_sha256: string;
  readonly envelope_sha256: string;
  readonly rows: readonly CreateAcceptanceMatrixRowInput[];
  readonly verifier_receipt_ref: string;
}

export interface CreateProductAcceptanceInput {
  readonly contract_sha256: string;
  readonly envelope_sha256: string;
  readonly matrix_sha256: string;
  readonly review_authority: ReviewAdmissionSource;
  readonly verification_ref?: string;
}

export interface IntegrationAcceptanceEnvironment {
  readonly repo_root: string;
  readonly git_bin?: string;
  readonly gh_bin?: string;
  /** Trusted in-process provider seam, never populated from candidate JSON. */
  readonly gh_runner?: PublicationReadinessInput['gh_runner'];
  readonly authority_home?: string;
}

export interface ProductAcceptanceDependencies {
  readonly verify_acceptance?: (args: {
    root: string;
    authorityHome: string;
    authority: ReviewAdmissionSource;
    verification?: string;
  }) => Promise<AcceptanceReceipt>;
  readonly read_acceptance_receipt_bytes?: (root: string, authorityHome: string) => Buffer;
}

type EvidenceKind = 'contracts' | 'envelopes' | 'matrices' | 'products';

function fail(code: IntegrationAcceptanceErrorCode, message: string, cause?: unknown): IntegrationAcceptanceError {
  return new IntegrationAcceptanceError(code, message, cause);
}

function pathInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function readRegular(path: string, label: string): Buffer {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw fail('evidence_conflict', `${label} is unavailable: ${path}`, error);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw fail('evidence_conflict', `${label} must be a regular file: ${path}`);
  try {
    return readFileSync(path);
  } catch (error) {
    throw fail('evidence_conflict', `${label} is unreadable: ${path}`, error);
  }
}

function resolveRepoFile(repoRoot: string, ref: string, label: string): string {
  if (isAbsolute(ref)) throw fail('evidence_conflict', `${label} must be repository-relative`);
  const lexical = resolve(repoRoot, ref);
  if (!pathInside(repoRoot, lexical)) throw fail('evidence_conflict', `${label} escapes the repository`);
  let lexicalStat: ReturnType<typeof lstatSync>;
  try {
    lexicalStat = lstatSync(lexical);
  } catch (error) {
    throw fail('evidence_conflict', `${label} is unavailable: ${ref}`, error);
  }
  if (lexicalStat.isSymbolicLink() || !lexicalStat.isFile()) {
    throw fail('evidence_conflict', `${label} must be a repository-owned regular file: ${ref}`);
  }
  let actual: string;
  try {
    actual = realpathSync(lexical);
  } catch (error) {
    throw fail('evidence_conflict', `${label} cannot be resolved: ${ref}`, error);
  }
  if (!pathInside(repoRoot, actual)) throw fail('evidence_conflict', `${label} resolves outside the repository`);
  return actual;
}

function readRepoEvidence(repoRoot: string, ref: string, label: string): Buffer {
  return readRegular(resolveRepoFile(repoRoot, ref, label), label);
}

function repositoryId(repoRoot: string, gitBin: string): string {
  return publicationSha256(realpathSync(resolveGitCommonDirectory(repoRoot, gitBin)));
}

function gitText(repoRoot: string, gitBin: string, args: readonly string[]): string {
  try {
    return gitExecFileSync([...args], { cwd: repoRoot, gitBin, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    throw fail('candidate_stale', `git ${args.join(' ')} failed`, error);
  }
}

function resolveCommit(repoRoot: string, gitBin: string, oid: string, label: string): string {
  const resolved = gitText(repoRoot, gitBin, ['rev-parse', `${oid}^{commit}`]);
  if (resolved !== oid) throw fail('candidate_stale', `${label} is not an exact local commit: ${oid}`);
  return resolved;
}

function treeForCommit(repoRoot: string, gitBin: string, oid: string): string {
  return gitText(repoRoot, gitBin, ['rev-parse', `${oid}^{tree}`]);
}

function assertAncestor(repoRoot: string, gitBin: string, ancestor: string, descendant: string, label: string): void {
  const result = gitSpawnSync(['merge-base', '--is-ancestor', ancestor, descendant], { cwd: repoRoot, gitBin, encoding: 'utf-8' });
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    throw fail('candidate_stale', `cannot prove ${label} ancestry`, result.error ?? result.stderr);
  }
  if (result.status !== 0) throw fail('candidate_stale', `${label} ${ancestor} is not contained in ${descendant}`);
}

function integrationEvidenceDirectory(repoRoot: string, gitBin: string, kind: EvidenceKind, create: boolean): string {
  let current = resolveGitCommonDirectory(repoRoot, gitBin);
  for (const component of [...INTEGRATION_EVIDENCE_ROOT_RELATIVE_PATH.split('/'), kind]) {
    current = join(current, component);
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !create) {
        throw fail('evidence_conflict', `${kind} store is unavailable`, error);
      }
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw fail('evidence_conflict', `${kind} store cannot be created`, mkdirError);
        }
      }
      try {
        stat = lstatSync(current);
      } catch (statError) {
        throw fail('evidence_conflict', `${kind} store cannot be verified`, statError);
      }
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw fail('evidence_conflict', `${kind} store ancestor is unsafe`);
    }
  }
  return current;
}

function evidencePath(repoRoot: string, gitBin: string, kind: EvidenceKind, digest: string, createDirectory = false): string {
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw fail('evidence_conflict', `${kind} digest is invalid`);
  return join(integrationEvidenceDirectory(repoRoot, gitBin, kind, createDirectory), `${digest.slice('sha256:'.length)}.json`);
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

function persistImmutable(repoRoot: string, gitBin: string, kind: EvidenceKind, digest: string, canonical: string): string {
  const target = evidencePath(repoRoot, gitBin, kind, digest, true);
  const directory = dirname(target);
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw fail('evidence_conflict', `${kind} store is unsafe`);
  const bytes = Buffer.from(`${canonical}\n`, 'utf-8');
  if (existsSync(target)) {
    if (!readRegular(target, `${kind} evidence`).equals(bytes)) throw fail('evidence_conflict', `${kind} digest conflicts with existing bytes`);
    return target;
  }
  const temporary = join(directory, `.${digest.slice('sha256:'.length)}.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    writeAll(fd, bytes);
    fsyncSync(fd);
  } finally {
    if (fd !== null) closeSync(fd);
  }
  try {
    linkSync(temporary, target);
    fsyncDirectory(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw fail('evidence_conflict', `cannot persist ${kind} evidence`, error);
    if (!readRegular(target, `${kind} evidence`).equals(bytes)) throw fail('evidence_conflict', `${kind} digest conflicts with concurrent bytes`);
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return target;
}

function readStored<T>(
  repoRoot: string,
  gitBin: string,
  kind: EvidenceKind,
  digest: string,
  validate: (value: unknown) => T,
  canonical: (value: T) => string,
): T {
  const raw = readRegular(evidencePath(repoRoot, gitBin, kind, digest), `${kind} evidence`);
  let value: unknown;
  try {
    value = JSON.parse(raw.toString('utf-8'));
  } catch (error) {
    throw fail('evidence_conflict', `${kind} evidence is invalid JSON`, error);
  }
  let result: T;
  try {
    result = validate(value);
  } catch (error) {
    throw fail('evidence_conflict', `${kind} evidence is invalid`, error);
  }
  if (!raw.equals(Buffer.from(`${canonical(result)}\n`, 'utf-8'))) throw fail('evidence_conflict', `${kind} evidence is not canonical`);
  return result;
}

export function readIntegrationContract(repoRoot: string, digest: string, gitBin = 'git'): IntegrationContractV2 {
  return readStored(repoRoot, gitBin, 'contracts', digest, validateIntegrationContract, canonicalIntegrationContractBytes);
}

export function readIntegrationEnvelope(repoRoot: string, digest: string, gitBin = 'git'): IntegrationEnvelopeV2 {
  return readStored(repoRoot, gitBin, 'envelopes', digest, validateIntegrationEnvelope, canonicalIntegrationEnvelopeBytes);
}

export function readAcceptanceMatrix(repoRoot: string, digest: string, gitBin = 'git'): AcceptanceMatrixV2 {
  return readStored(repoRoot, gitBin, 'matrices', digest, validateAcceptanceMatrix, canonicalAcceptanceMatrixBytes);
}

export function readProductAcceptanceProjection(repoRoot: string, digest: string, gitBin = 'git'): ProductAcceptanceProjectionV2 {
  return readStored(repoRoot, gitBin, 'products', digest, validateProductAcceptanceProjection, canonicalProductAcceptanceProjectionBytes);
}

function absentEvidence(error: unknown): boolean {
  return error instanceof IntegrationAcceptanceError && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

/**
 * Null means no product acceptance was persisted under this digest yet. Every
 * other store failure, including invalid or non-canonical bytes, still throws.
 */
export function findProductAcceptanceProjection(repoRoot: string, digest: string, gitBin = 'git'): ProductAcceptanceProjectionV2 | null {
  try {
    return readProductAcceptanceProjection(repoRoot, digest, gitBin);
  } catch (error) {
    if (absentEvidence(error)) return null;
    throw error;
  }
}

/**
 * Read-only projection of the immutable product acceptance store. The store is
 * content-addressed by projection digest, so a reader that must answer "is this
 * work package product-accepted" reads the projections this module persisted
 * rather than reconstructing a second product verdict.
 */
export function listProductAcceptanceProjections(repoRoot: string, gitBin = 'git'): readonly ProductAcceptanceProjectionV2[] {
  let directory: string;
  try {
    directory = integrationEvidenceDirectory(repoRoot, gitBin, 'products', false);
  } catch (error) {
    if (absentEvidence(error)) return Object.freeze([]);
    throw error;
  }
  const digests = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^[0-9a-f]{64}\.json$/.test(entry.name))
    .map((entry) => `sha256:${entry.name.slice(0, -'.json'.length)}`)
    .sort();
  return Object.freeze(digests.map((digest) => readProductAcceptanceProjection(repoRoot, digest, gitBin)));
}

function assertApprovedRequirement(repoRoot: string, contract: IntegrationContractV2): void {
  const prd = readRepoEvidence(repoRoot, contract.requirement.approved_prd_ref, 'approved PRD');
  const spec = readRepoEvidence(repoRoot, contract.requirement.source_spec_ref, 'source spec');
  if (publicationSha256(prd) !== contract.requirement.approved_prd_sha256 || publicationSha256(spec) !== contract.requirement.source_spec_sha256) {
    throw fail('requirement_invalid', 'approved requirement bytes changed after contract freeze');
  }
  if (!/^> \*\*Status\*\*: Approved\s*$/m.test(prd.toString('utf-8'))) {
    throw fail('requirement_invalid', 'requirement PRD is not Approved');
  }
}

export function createIntegrationContract(
  environment: IntegrationAcceptanceEnvironment,
  input: CreateIntegrationContractInput,
): IntegrationContractV2 {
  const repoRoot = realpathSync(environment.repo_root);
  const gitBin = environment.git_bin ?? 'git';
  const prd = readRepoEvidence(repoRoot, input.approved_prd_ref, 'approved PRD');
  const spec = readRepoEvidence(repoRoot, input.source_spec_ref, 'source spec');
  if (!/^> \*\*Status\*\*: Approved\s*$/m.test(prd.toString('utf-8'))) throw fail('requirement_invalid', 'requirement PRD is not Approved');
  const contract = buildIntegrationContract({
    requirement: {
      approved_prd_ref: input.approved_prd_ref,
      approved_prd_sha256: publicationSha256(prd),
      source_spec_ref: input.source_spec_ref,
      source_spec_sha256: publicationSha256(spec),
    },
    repository_id: repositoryId(repoRoot, gitBin),
    integration_group: input.integration_group,
    required_pull_requests: input.required_pull_requests,
    required_constraints: input.required_constraints,
  });
  persistImmutable(repoRoot, gitBin, 'contracts', contract.contract_sha256, canonicalIntegrationContractBytes(contract));
  return contract;
}

export function observeSelectedPullRequest(
  environment: IntegrationAcceptanceEnvironment,
  repoRoot: string,
  gitBin: string,
  selection: RequiredPullRequestV2,
  finalHead: string,
): SelectedPullRequestV2 {
  let integrated: ReturnType<typeof collectPullRequestIntegration>;
  try {
    integrated = collectPullRequestIntegration({ ...selection, repo_root: repoRoot,
      gh_bin: environment.gh_bin, gh_runner: environment.gh_runner });
  } catch (error) {
    throw fail('publication_stale', `PR ${selection.repository}#${selection.pr_number} integration evidence is unavailable`, error);
  }
  const mergeCommit = resolveCommit(repoRoot, gitBin, integrated.merge_commit_sha, 'provider merge commit');
  if (treeForCommit(repoRoot, gitBin, mergeCommit) !== integrated.merge_tree_sha) {
    throw fail('publication_stale', 'provider merge tree does not match the exact local commit');
  }
  resolveCommit(repoRoot, gitBin, selection.expected_base_sha, 'selected PR base');
  assertAncestor(repoRoot, gitBin, selection.expected_base_sha, mergeCommit, 'selected PR base');
  // Squash creates a new commit: prove the provider's actual merge commit,
  // not the unmerged feature head, is contained in the final candidate.
  assertAncestor(repoRoot, gitBin, mergeCommit, finalHead, 'provider merge commit');
  return Object.freeze({ ...selection, ...integrated });
}

/**
 * The provider state (`OPEN`, `CLOSED` or `MERGED`) of one selected PR at its
 * exact selected head. It lets a reader tell a readable unmerged selection
 * from unavailable merge evidence before it asks for merge proof.
 */
export function observeSelectedPullRequestState(
  environment: IntegrationAcceptanceEnvironment,
  selection: RequiredPullRequestV2,
): string {
  let identity: ReturnType<typeof observeProviderReadinessIdentity>;
  try {
    identity = observeProviderReadinessIdentity({ repo_root: environment.repo_root, gh_bin: environment.gh_bin,
      gh_runner: environment.gh_runner, repository: selection.repository, provider_repository_id: selection.provider_repository_id,
      pr_number: selection.pr_number, expected_head_sha: selection.expected_head_sha, expected_base_sha: selection.expected_base_sha });
  } catch (error) {
    throw fail('publication_stale', `PR ${selection.repository}#${selection.pr_number} state is unavailable`, error);
  }
  if (identity.head_sha !== selection.expected_head_sha) {
    throw fail('publication_stale', `PR ${selection.repository}#${selection.pr_number} head moved from the selection`);
  }
  return identity.state;
}

function buildCurrentEnvelope(
  environment: IntegrationAcceptanceEnvironment,
  repoRoot: string,
  gitBin: string,
  contract: IntegrationContractV2,
  baseSha: string,
  finalHeadSha: string,
  finalTreeSha: string,
): IntegrationEnvelopeV2 {
  const currentRepositoryId = repositoryId(repoRoot, gitBin);
  if (contract.repository_id !== currentRepositoryId) throw fail('repository_mismatch', 'integration contract belongs to another repository');
  assertApprovedRequirement(repoRoot, contract);
  const base = resolveCommit(repoRoot, gitBin, baseSha, 'candidate base');
  const finalHead = resolveCommit(repoRoot, gitBin, finalHeadSha, 'candidate head');
  const currentHead = gitText(repoRoot, gitBin, ['rev-parse', 'HEAD^{commit}']);
  if (currentHead !== finalHead) throw fail('candidate_stale', `current HEAD ${currentHead} does not match candidate ${finalHead}`);
  assertAncestor(repoRoot, gitBin, base, finalHead, 'candidate base');
  if (treeForCommit(repoRoot, gitBin, finalHead) !== finalTreeSha) throw fail('candidate_stale', 'candidate tree does not match the exact selected tree');
  const selected = contract.required_pull_requests.map(selection => observeSelectedPullRequest(environment, repoRoot, gitBin, selection, finalHead));
  const confirmed = contract.required_pull_requests.map(selection => observeSelectedPullRequest(environment, repoRoot, gitBin, selection, finalHead));
  if (stablePublicationJson(selected) !== stablePublicationJson(confirmed)) throw fail('publication_stale', 'selected PR integrations changed during envelope observation');
  assertApprovedRequirement(repoRoot, contract);
  if (gitText(repoRoot, gitBin, ['rev-parse', 'HEAD^{commit}']) !== finalHead) throw fail('candidate_stale', 'current HEAD changed during envelope observation');
  return buildIntegrationEnvelope({
    integration_contract_sha256: contract.contract_sha256,
    selected_pull_requests: selected,
    base_sha: base,
    final_head_sha: finalHead,
    final_tree_sha: finalTreeSha,
  });
}

export function createIntegrationEnvelope(
  environment: IntegrationAcceptanceEnvironment,
  input: CreateIntegrationEnvelopeInput,
): IntegrationEnvelopeV2 {
  const repoRoot = realpathSync(environment.repo_root);
  const gitBin = environment.git_bin ?? 'git';
  const contract = readIntegrationContract(repoRoot, input.contract_sha256, gitBin);
  const envelope = buildCurrentEnvelope(environment, repoRoot, gitBin, contract, input.base_sha, input.final_head_sha, input.final_tree_sha);
  persistImmutable(repoRoot, gitBin, 'envelopes', envelope.envelope_sha256, canonicalIntegrationEnvelopeBytes(envelope));
  return envelope;
}

function assertEnvelopeCurrent(environment: IntegrationAcceptanceEnvironment, repoRoot: string, gitBin: string, contract: IntegrationContractV2, envelope: IntegrationEnvelopeV2): void {
  const current = buildCurrentEnvelope(environment, repoRoot, gitBin, contract, envelope.base_sha, envelope.final_head_sha, envelope.final_tree_sha);
  if (canonicalIntegrationEnvelopeBytes(current) !== canonicalIntegrationEnvelopeBytes(envelope)) throw fail('publication_stale', 'integration envelope no longer matches current authority bytes');
}

function assertMatrixEvidenceCurrent(repoRoot: string, matrix: AcceptanceMatrixV2): void {
  for (const row of matrix.rows) {
    if (publicationSha256(readRepoEvidence(repoRoot, row.evidence_ref, `matrix evidence ${row.constraint_id}`)) !== row.evidence_sha256) {
      throw fail('matrix_invalid', `matrix evidence changed for ${row.constraint_id}`);
    }
  }
  if (publicationSha256(readRepoEvidence(repoRoot, matrix.verifier_receipt_ref, 'verifier receipt')) !== matrix.verifier_receipt_sha256) {
    throw fail('matrix_invalid', 'verifier receipt bytes changed');
  }
}

export function createAcceptanceMatrix(
  environment: IntegrationAcceptanceEnvironment,
  input: CreateAcceptanceMatrixInput,
): AcceptanceMatrixV2 {
  const repoRoot = realpathSync(environment.repo_root);
  const gitBin = environment.git_bin ?? 'git';
  const contract = readIntegrationContract(repoRoot, input.contract_sha256, gitBin);
  const envelope = readIntegrationEnvelope(repoRoot, input.envelope_sha256, gitBin);
  assertEnvelopeCurrent(environment, repoRoot, gitBin, contract, envelope);
  const matrix = buildAcceptanceMatrix({
    envelope_sha256: envelope.envelope_sha256,
    rows: input.rows.map((row) => ({
      constraint_id: row.constraint_id,
      evidence_ref: row.evidence_ref,
      evidence_sha256: publicationSha256(readRepoEvidence(repoRoot, row.evidence_ref, `matrix evidence ${row.constraint_id}`)),
      result: row.result,
    })),
    verifier_receipt_ref: input.verifier_receipt_ref,
    verifier_receipt_sha256: publicationSha256(readRepoEvidence(repoRoot, input.verifier_receipt_ref, 'verifier receipt')),
  });
  try {
    assertCompletePassingMatrix(contract, envelope, matrix);
  } catch (error) {
    throw fail('matrix_invalid', 'acceptance matrix does not satisfy the integration contract', error);
  }
  persistImmutable(repoRoot, gitBin, 'matrices', matrix.matrix_sha256, canonicalAcceptanceMatrixBytes(matrix));
  return matrix;
}

/**
 * The projection pins the digest of the latest receipt. A dependency reader
 * resolves that digest from the immutable receipt record after later reviews
 * replace the latest file, so a receipt without its record is refused here.
 */
export function defaultReadAcceptanceReceiptBytes(root: string, authorityHome: string): Buffer {
  const latest = readRegular(acceptanceReceiptPath(root, authorityHome), 'AcceptanceReceipt');
  try {
    readAcceptanceReceiptRecord(root, authorityHome, publicationSha256(latest));
  } catch (error) {
    throw fail('acceptance_unavailable', 'AcceptanceReceipt has no immutable receipt record', error);
  }
  return latest;
}

export async function createProductAcceptanceProjection(
  environment: IntegrationAcceptanceEnvironment,
  input: CreateProductAcceptanceInput,
  dependencies: ProductAcceptanceDependencies = {},
): Promise<ProductAcceptanceProjectionV2> {
  const repoRoot = realpathSync(environment.repo_root);
  const gitBin = environment.git_bin ?? 'git';
  const authorityHome = realpathSync(environment.authority_home ?? osAccountHome());
  const contract = readIntegrationContract(repoRoot, input.contract_sha256, gitBin);
  const envelope = readIntegrationEnvelope(repoRoot, input.envelope_sha256, gitBin);
  const matrix = readAcceptanceMatrix(repoRoot, input.matrix_sha256, gitBin);
  assertEnvelopeCurrent(environment, repoRoot, gitBin, contract, envelope);
  try {
    assertCompletePassingMatrix(contract, envelope, matrix);
    assertMatrixEvidenceCurrent(repoRoot, matrix);
  } catch (error) {
    if (error instanceof IntegrationAcceptanceError) throw error;
    throw fail('matrix_invalid', 'acceptance matrix is stale or incomplete', error);
  }
  // Acceptance validates the complete Git-visible source, not HEAD provenance.
  const assertAcceptedTree = () => {
    if (captureGitVirtualTreeSnapshot(repoRoot).tree_hash !== envelope.final_tree_sha) {
      throw fail('candidate_stale', 'Acceptance source tree differs from the final integration tree');
    }
  };
  assertAcceptedTree();
  const verifier = dependencies.verify_acceptance ?? verifyAcceptance;
  let receipt: AcceptanceReceipt;
  try {
    receipt = await verifier({
      root: repoRoot,
      authorityHome,
      authority: input.review_authority,
      verification: input.verification_ref,
    });
  } catch (error) {
    throw fail('acceptance_unavailable', 'existing AcceptanceReceipt verification failed', error);
  }
  if (receipt.disposition !== 'external_pass' && receipt.disposition !== 'user_waiver') throw fail('acceptance_unavailable', 'existing AcceptanceReceipt does not carry a passing disposition');
  if (receipt.target_revision !== envelope.base_sha) throw fail('acceptance_unavailable', 'AcceptanceReceipt target revision does not match the integration candidate base');
  const receiptBytes = (dependencies.read_acceptance_receipt_bytes ?? defaultReadAcceptanceReceiptBytes)(repoRoot, authorityHome);
  let observedReceipt: unknown;
  try {
    observedReceipt = JSON.parse(receiptBytes.toString('utf-8'));
  } catch (error) {
    throw fail('acceptance_unavailable', 'AcceptanceReceipt bytes changed after verification', error);
  }
  if (stablePublicationJson(observedReceipt) !== stablePublicationJson(receipt)) {
    throw fail('acceptance_unavailable', 'AcceptanceReceipt bytes changed after verification');
  }
  assertAcceptedTree();
  const projection = buildProductAcceptanceProjection({
    envelope_sha256: envelope.envelope_sha256,
    matrix_sha256: matrix.matrix_sha256,
    acceptance_receipt_sha256: publicationSha256(receiptBytes),
    acceptance_subject_sha256: receipt.subject_sha256,
    acceptance_target_revision: receipt.target_revision,
    acceptance_disposition: receipt.disposition,
  });
  assertEnvelopeCurrent(environment, repoRoot, gitBin, contract, envelope);
  assertMatrixEvidenceCurrent(repoRoot, matrix);
  persistImmutable(repoRoot, gitBin, 'products', projection.projection_sha256, canonicalProductAcceptanceProjectionBytes(projection));
  return projection;
}
