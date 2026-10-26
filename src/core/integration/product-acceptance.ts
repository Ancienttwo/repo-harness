import {
  publicationSha256,
  stablePublicationJson,
} from '../publication/publication-receipt';

export const INTEGRATION_CONTRACT_PROTOCOL = 2 as const;
export const INTEGRATION_CONTRACT_KIND = 'repo-harness-integration-contract' as const;
export const INTEGRATION_ENVELOPE_KIND = 'repo-harness-integration-envelope' as const;
export const ACCEPTANCE_MATRIX_KIND = 'repo-harness-acceptance-matrix' as const;
export const PRODUCT_ACCEPTANCE_PROJECTION_KIND = 'repo-harness-product-acceptance-projection' as const;

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GIT_OID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const CONSTRAINT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/;

export interface IntegrationRequirementV2 {
  readonly approved_prd_ref: string;
  readonly approved_prd_sha256: string;
  readonly source_spec_ref: string;
  readonly source_spec_sha256: string;
}

export interface RequiredPullRequestV2 {
  /** Canonical GitHub REST numeric id, serialized as decimal text. */
  readonly provider_repository_id: string;
  readonly repository: string;
  readonly issue_id: string;
  readonly issue_number: number;
  readonly pr_number: number;
  readonly expected_head_sha: string;
  readonly expected_base_sha: string;
}

export interface IntegrationContractV2 {
  readonly protocol: typeof INTEGRATION_CONTRACT_PROTOCOL;
  readonly kind: typeof INTEGRATION_CONTRACT_KIND;
  readonly requirement: IntegrationRequirementV2;
  readonly repository_id: string;
  readonly integration_group: string;
  readonly required_pull_requests: readonly RequiredPullRequestV2[];
  readonly required_constraints: readonly string[];
  readonly contract_sha256: string;
}

export interface SelectedPullRequestV2 extends RequiredPullRequestV2 {
  readonly merge_commit_sha: string;
  readonly merge_tree_sha: string;
}

export interface IntegrationEnvelopeV2 {
  readonly protocol: typeof INTEGRATION_CONTRACT_PROTOCOL;
  readonly kind: typeof INTEGRATION_ENVELOPE_KIND;
  readonly integration_contract_sha256: string;
  readonly selected_pull_requests: readonly SelectedPullRequestV2[];
  readonly base_sha: string;
  readonly final_head_sha: string;
  readonly final_tree_sha: string;
  readonly combined_candidate_sha256: string;
  readonly envelope_sha256: string;
}

export type AcceptanceMatrixResult = 'pass' | 'fail' | 'blocked';

export interface AcceptanceMatrixRowV2 {
  readonly constraint_id: string;
  readonly evidence_ref: string;
  readonly evidence_sha256: string;
  readonly result: AcceptanceMatrixResult;
}

export interface AcceptanceMatrixV2 {
  readonly protocol: typeof INTEGRATION_CONTRACT_PROTOCOL;
  readonly kind: typeof ACCEPTANCE_MATRIX_KIND;
  readonly envelope_sha256: string;
  readonly rows: readonly AcceptanceMatrixRowV2[];
  readonly verifier_receipt_ref: string;
  readonly verifier_receipt_sha256: string;
  readonly matrix_sha256: string;
}

export type ProductAcceptanceDisposition = 'external_pass' | 'user_waiver';

export interface ProductAcceptanceProjectionV2 {
  readonly protocol: typeof INTEGRATION_CONTRACT_PROTOCOL;
  readonly kind: typeof PRODUCT_ACCEPTANCE_PROJECTION_KIND;
  readonly envelope_sha256: string;
  readonly matrix_sha256: string;
  readonly acceptance_receipt_sha256: string;
  readonly acceptance_subject_sha256: string;
  readonly acceptance_target_revision: string;
  readonly acceptance_disposition: ProductAcceptanceDisposition;
  readonly projection_sha256: string;
}

type IntegrationContractInput = Omit<IntegrationContractV2, 'protocol' | 'kind' | 'contract_sha256'>;
type IntegrationEnvelopeInput = Omit<IntegrationEnvelopeV2, 'protocol' | 'kind' | 'combined_candidate_sha256' | 'envelope_sha256'>;
type AcceptanceMatrixInput = Omit<AcceptanceMatrixV2, 'protocol' | 'kind' | 'matrix_sha256'>;
type ProductAcceptanceProjectionInput = Omit<ProductAcceptanceProjectionV2, 'protocol' | 'kind' | 'projection_sha256'>;

function requiredString(value: unknown, label: string, maxBytes = 4096): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  if (Buffer.byteLength(value, 'utf-8') > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`);
  return value;
}

function requireSha256(value: unknown, label: string): string {
  const result = requiredString(value, label, 71);
  if (!SHA256_PATTERN.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function requireGitOid(value: unknown, label: string): string {
  const result = requiredString(value, label, 64);
  if (!GIT_OID_PATTERN.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function requireConstraintId(value: unknown, label: string): string {
  const result = requiredString(value, label, 128);
  if (!CONSTRAINT_ID_PATTERN.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function requireExactKeys(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const canonical = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    throw new Error(`${label} fields are invalid: expected ${canonical.join(', ')}`);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function sortedUnique<T>(values: readonly T[], key: (value: T) => string, label: string): readonly T[] {
  const sorted = [...values].sort((left, right) => byteCompare(key(left), key(right)));
  for (let index = 1; index < sorted.length; index += 1) {
    if (key(sorted[index - 1]!) === key(sorted[index]!)) throw new Error(`${label} contains duplicate ${key(sorted[index]!)}`);
  }
  return Object.freeze(sorted);
}

function requirementFrom(value: IntegrationRequirementV2): IntegrationRequirementV2 {
  return Object.freeze({
    approved_prd_ref: requiredString(value.approved_prd_ref, 'requirement.approved_prd_ref'),
    approved_prd_sha256: requireSha256(value.approved_prd_sha256, 'requirement.approved_prd_sha256'),
    source_spec_ref: requiredString(value.source_spec_ref, 'requirement.source_spec_ref'),
    source_spec_sha256: requireSha256(value.source_spec_sha256, 'requirement.source_spec_sha256'),
  });
}

const PULL_REQUEST_KEYS = ['provider_repository_id', 'repository', 'issue_id', 'issue_number', 'pr_number', 'expected_head_sha', 'expected_base_sha'] as const;

export function validateRequiredPullRequest(value: unknown): RequiredPullRequestV2 {
  const record = asRecord(value, 'required pull request');
  requireExactKeys(record, PULL_REQUEST_KEYS, 'required pull request');
  for (const key of ['provider_repository_id', 'issue_id'] as const) {
    if (typeof record[key] !== 'string' || !/^[1-9][0-9]*$/.test(record[key])) throw new Error(`${key} must be a canonical REST id`);
  }
  const repository = requiredString(record.repository, 'repository', 256);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('repository must be owner/name');
  for (const key of ['issue_number', 'pr_number'] as const) {
    if (!Number.isSafeInteger(record[key]) || Number(record[key]) < 1) throw new Error(`${key} must be positive`);
  }
  return Object.freeze({
    provider_repository_id: requiredString(record.provider_repository_id, 'provider_repository_id', 256), repository,
    issue_id: requiredString(record.issue_id, 'issue_id', 256), issue_number: Number(record.issue_number), pr_number: Number(record.pr_number),
    expected_head_sha: requireGitOid(record.expected_head_sha, 'expected_head_sha'),
    expected_base_sha: requireGitOid(record.expected_base_sha, 'expected_base_sha'),
  });
}

function pullRequestKey(value: RequiredPullRequestV2): string {
  return `${value.provider_repository_id}:${value.pr_number}`;
}

function contractBasis(input: IntegrationContractInput): Omit<IntegrationContractV2, 'contract_sha256'> {
  if (!Array.isArray(input.required_pull_requests) || input.required_pull_requests.length === 0) {
    throw new Error('required_pull_requests must be non-empty');
  }
  if (!Array.isArray(input.required_constraints) || input.required_constraints.length === 0) {
    throw new Error('required_constraints must be non-empty');
  }
  const pullRequests = sortedUnique(input.required_pull_requests.map(validateRequiredPullRequest), pullRequestKey, 'required_pull_requests');
  const constraints = sortedUnique(input.required_constraints.map((item) => requireConstraintId(item, 'constraint_id')), (item) => item, 'required_constraints');
  return Object.freeze({
    protocol: INTEGRATION_CONTRACT_PROTOCOL,
    kind: INTEGRATION_CONTRACT_KIND,
    requirement: requirementFrom(input.requirement),
    repository_id: requireSha256(input.repository_id, 'repository_id'),
    integration_group: requiredString(input.integration_group, 'integration_group', 256),
    required_pull_requests: pullRequests,
    required_constraints: constraints,
  });
}

export function buildIntegrationContract(input: IntegrationContractInput): IntegrationContractV2 {
  const basis = contractBasis(input);
  return Object.freeze({ ...basis, contract_sha256: publicationSha256(stablePublicationJson(basis)) });
}

export function validateIntegrationContract(value: unknown): IntegrationContractV2 {
  const record = asRecord(value, 'integration contract');
  requireExactKeys(record, ['protocol', 'kind', 'requirement', 'repository_id', 'integration_group', 'required_pull_requests', 'required_constraints', 'contract_sha256'], 'integration contract');
  if (record.protocol !== INTEGRATION_CONTRACT_PROTOCOL || record.kind !== INTEGRATION_CONTRACT_KIND) throw new Error('integration contract protocol or kind is invalid');
  const requirement = asRecord(record.requirement, 'requirement');
  requireExactKeys(requirement, ['approved_prd_ref', 'approved_prd_sha256', 'source_spec_ref', 'source_spec_sha256'], 'requirement');
  if (!Array.isArray(record.required_pull_requests) || !Array.isArray(record.required_constraints)) throw new Error('integration contract arrays are invalid');
  const contract = buildIntegrationContract({
    requirement: requirement as unknown as IntegrationRequirementV2,
    repository_id: record.repository_id as string,
    integration_group: record.integration_group as string,
    required_pull_requests: record.required_pull_requests.map(validateRequiredPullRequest),
    required_constraints: record.required_constraints as string[],
  });
  if (record.contract_sha256 !== contract.contract_sha256 || stablePublicationJson(record) !== canonicalIntegrationContractBytes(contract)) {
    throw new Error('integration contract digest or canonical order is stale');
  }
  return contract;
}

export function canonicalIntegrationContractBytes(value: IntegrationContractV2): string {
  return stablePublicationJson(value);
}

function selectedPullRequestFrom(value: SelectedPullRequestV2): SelectedPullRequestV2 {
  const record = asRecord(value, 'selected pull request');
  requireExactKeys(record, [...PULL_REQUEST_KEYS, 'merge_commit_sha', 'merge_tree_sha'], 'selected pull request');
  const { merge_commit_sha, merge_tree_sha, ...selection } = record;
  return Object.freeze({ ...validateRequiredPullRequest(selection),
    merge_commit_sha: requireGitOid(merge_commit_sha, 'merge_commit_sha'),
    merge_tree_sha: requireGitOid(merge_tree_sha, 'merge_tree_sha'),
  });
}

function envelopeBasis(input: IntegrationEnvelopeInput): Omit<IntegrationEnvelopeV2, 'combined_candidate_sha256' | 'envelope_sha256'> {
  if (!Array.isArray(input.selected_pull_requests) || input.selected_pull_requests.length === 0) throw new Error('selected_pull_requests must be non-empty');
  return Object.freeze({
    protocol: INTEGRATION_CONTRACT_PROTOCOL,
    kind: INTEGRATION_ENVELOPE_KIND,
    integration_contract_sha256: requireSha256(input.integration_contract_sha256, 'integration_contract_sha256'),
    selected_pull_requests: sortedUnique(input.selected_pull_requests.map(selectedPullRequestFrom), pullRequestKey, 'selected_pull_requests'),
    base_sha: requireGitOid(input.base_sha, 'base_sha'),
    final_head_sha: requireGitOid(input.final_head_sha, 'final_head_sha'),
    final_tree_sha: requireGitOid(input.final_tree_sha, 'final_tree_sha'),
  });
}

export function buildIntegrationEnvelope(input: IntegrationEnvelopeInput): IntegrationEnvelopeV2 {
  const basis = envelopeBasis(input);
  const combinedCandidateSha256 = publicationSha256(stablePublicationJson([
    basis.integration_contract_sha256,
    basis.selected_pull_requests,
    basis.base_sha,
    basis.final_head_sha,
    basis.final_tree_sha,
  ]));
  const withCandidate = Object.freeze({ ...basis, combined_candidate_sha256: combinedCandidateSha256 });
  return Object.freeze({ ...withCandidate, envelope_sha256: publicationSha256(stablePublicationJson(withCandidate)) });
}

export function validateIntegrationEnvelope(value: unknown): IntegrationEnvelopeV2 {
  const record = asRecord(value, 'integration envelope');
  requireExactKeys(record, ['protocol', 'kind', 'integration_contract_sha256', 'selected_pull_requests', 'base_sha', 'final_head_sha', 'final_tree_sha', 'combined_candidate_sha256', 'envelope_sha256'], 'integration envelope');
  if (record.protocol !== INTEGRATION_CONTRACT_PROTOCOL || record.kind !== INTEGRATION_ENVELOPE_KIND) throw new Error('integration envelope protocol or kind is invalid');
  if (!Array.isArray(record.selected_pull_requests)) throw new Error('selected_pull_requests must be an array');
  const envelope = buildIntegrationEnvelope({
    integration_contract_sha256: record.integration_contract_sha256 as string,
    selected_pull_requests: record.selected_pull_requests.map(item => selectedPullRequestFrom(item as SelectedPullRequestV2)),
    base_sha: record.base_sha as string,
    final_head_sha: record.final_head_sha as string,
    final_tree_sha: record.final_tree_sha as string,
  });
  if (record.combined_candidate_sha256 !== envelope.combined_candidate_sha256 || record.envelope_sha256 !== envelope.envelope_sha256 || stablePublicationJson(record) !== canonicalIntegrationEnvelopeBytes(envelope)) {
    throw new Error('integration envelope digest or canonical order is stale');
  }
  return envelope;
}

export function canonicalIntegrationEnvelopeBytes(value: IntegrationEnvelopeV2): string {
  return stablePublicationJson(value);
}

function matrixRowFrom(value: AcceptanceMatrixRowV2): AcceptanceMatrixRowV2 {
  if (value.result !== 'pass' && value.result !== 'fail' && value.result !== 'blocked') throw new Error('matrix row result is invalid');
  return Object.freeze({
    constraint_id: requireConstraintId(value.constraint_id, 'matrix constraint_id'),
    evidence_ref: requiredString(value.evidence_ref, 'matrix evidence_ref'),
    evidence_sha256: requireSha256(value.evidence_sha256, 'matrix evidence_sha256'),
    result: value.result,
  });
}

export function buildAcceptanceMatrix(input: AcceptanceMatrixInput): AcceptanceMatrixV2 {
  if (!Array.isArray(input.rows) || input.rows.length === 0) throw new Error('matrix rows must be non-empty');
  const basis = Object.freeze({
    protocol: INTEGRATION_CONTRACT_PROTOCOL,
    kind: ACCEPTANCE_MATRIX_KIND,
    envelope_sha256: requireSha256(input.envelope_sha256, 'envelope_sha256'),
    rows: sortedUnique(input.rows.map(matrixRowFrom), (item) => item.constraint_id, 'matrix rows'),
    verifier_receipt_ref: requiredString(input.verifier_receipt_ref, 'verifier_receipt_ref'),
    verifier_receipt_sha256: requireSha256(input.verifier_receipt_sha256, 'verifier_receipt_sha256'),
  });
  return Object.freeze({ ...basis, matrix_sha256: publicationSha256(stablePublicationJson(basis)) });
}

export function validateAcceptanceMatrix(value: unknown): AcceptanceMatrixV2 {
  const record = asRecord(value, 'acceptance matrix');
  requireExactKeys(record, ['protocol', 'kind', 'envelope_sha256', 'rows', 'verifier_receipt_ref', 'verifier_receipt_sha256', 'matrix_sha256'], 'acceptance matrix');
  if (record.protocol !== INTEGRATION_CONTRACT_PROTOCOL || record.kind !== ACCEPTANCE_MATRIX_KIND) throw new Error('acceptance matrix protocol or kind is invalid');
  if (!Array.isArray(record.rows)) throw new Error('matrix rows must be an array');
  const matrix = buildAcceptanceMatrix({
    envelope_sha256: record.envelope_sha256 as string,
    rows: record.rows.map((item) => {
      const row = asRecord(item, 'matrix row');
      requireExactKeys(row, ['constraint_id', 'evidence_ref', 'evidence_sha256', 'result'], 'matrix row');
      return row as unknown as AcceptanceMatrixRowV2;
    }),
    verifier_receipt_ref: record.verifier_receipt_ref as string,
    verifier_receipt_sha256: record.verifier_receipt_sha256 as string,
  });
  if (record.matrix_sha256 !== matrix.matrix_sha256 || stablePublicationJson(record) !== canonicalAcceptanceMatrixBytes(matrix)) throw new Error('acceptance matrix digest or canonical order is stale');
  return matrix;
}

export function canonicalAcceptanceMatrixBytes(value: AcceptanceMatrixV2): string {
  return stablePublicationJson(value);
}

export function assertCompletePassingMatrix(contract: IntegrationContractV2, envelope: IntegrationEnvelopeV2, matrix: AcceptanceMatrixV2): void {
  if (envelope.integration_contract_sha256 !== contract.contract_sha256) throw new Error('envelope does not match integration contract');
  if (matrix.envelope_sha256 !== envelope.envelope_sha256) throw new Error('matrix does not match integration envelope');
  if (stablePublicationJson(matrix.rows.map((row) => row.constraint_id)) !== stablePublicationJson(contract.required_constraints)) {
    throw new Error('acceptance matrix constraints do not exactly match the contract');
  }
  if (matrix.rows.some((row) => row.result !== 'pass')) throw new Error('acceptance matrix is not fully passing');
}

export function buildProductAcceptanceProjection(input: ProductAcceptanceProjectionInput): ProductAcceptanceProjectionV2 {
  if (input.acceptance_disposition !== 'external_pass' && input.acceptance_disposition !== 'user_waiver') throw new Error('acceptance disposition cannot be projected');
  const basis = Object.freeze({
    protocol: INTEGRATION_CONTRACT_PROTOCOL,
    kind: PRODUCT_ACCEPTANCE_PROJECTION_KIND,
    envelope_sha256: requireSha256(input.envelope_sha256, 'envelope_sha256'),
    matrix_sha256: requireSha256(input.matrix_sha256, 'matrix_sha256'),
    acceptance_receipt_sha256: requireSha256(input.acceptance_receipt_sha256, 'acceptance_receipt_sha256'),
    acceptance_subject_sha256: requireSha256(input.acceptance_subject_sha256, 'acceptance_subject_sha256'),
    acceptance_target_revision: requireGitOid(input.acceptance_target_revision, 'acceptance_target_revision'),
    acceptance_disposition: input.acceptance_disposition,
  });
  return Object.freeze({ ...basis, projection_sha256: publicationSha256(stablePublicationJson(basis)) });
}

export function validateProductAcceptanceProjection(value: unknown): ProductAcceptanceProjectionV2 {
  const record = asRecord(value, 'product acceptance projection');
  requireExactKeys(record, ['protocol', 'kind', 'envelope_sha256', 'matrix_sha256', 'acceptance_receipt_sha256', 'acceptance_subject_sha256', 'acceptance_target_revision', 'acceptance_disposition', 'projection_sha256'], 'product acceptance projection');
  if (record.protocol !== INTEGRATION_CONTRACT_PROTOCOL || record.kind !== PRODUCT_ACCEPTANCE_PROJECTION_KIND) throw new Error('product acceptance projection protocol or kind is invalid');
  const projection = buildProductAcceptanceProjection(record as unknown as ProductAcceptanceProjectionInput);
  if (record.projection_sha256 !== projection.projection_sha256 || stablePublicationJson(record) !== canonicalProductAcceptanceProjectionBytes(projection)) throw new Error('product acceptance projection digest is stale');
  return projection;
}

export function canonicalProductAcceptanceProjectionBytes(value: ProductAcceptanceProjectionV2): string {
  return stablePublicationJson(value);
}
