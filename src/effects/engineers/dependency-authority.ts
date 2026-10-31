import { validateProviderIntegrationDependencyReference, validateModuleAcceptanceReference } from '../../core/engineers/scheduling';
import { observeActiveReviewAdmission } from '../admission/issue-goal';
import { readExternalSourcesPolicy, requireManualGithubPolicy } from '../github/policy';
import { fetchGithubIssues } from '../github/issues';
import { currentReadonlyObservation, rejectObservation } from '../readonly-observation';
/**
 * The single read-only dependency-authority resolver for Engineer scheduling.
 *
 * Every `ProviderDependencyState` is answered by the one authority that
 * already owns that verdict: the current GitHub issue, the exact-subject
 * AcceptanceReceipt, exact provider merge evidence and local commit/tree proof,
 * and the selected ME-4C product acceptance projection. This module reads
 * those authorities; it never records, completes, publishes or accepts, and it
 * never reconstructs a verdict from prose, filenames, branch names, Git
 * names or cached publication state.
 *
 * Status contract:
 * - `satisfied`            the authority was readable and proves the state;
 * - `unsatisfied`          the authority was readable and does not prove it;
 * - `authority_unavailable` the authority is missing, unreadable, unauthorized
 *                          or unsupported for this dependency.
 *
 * There is deliberately no "unknown means ready" path.
 */
import { lstatSync, realpathSync } from 'fs';

import {
  canonicalEngineerJson,
  engineerSha256,
} from '../../core/engineers/profile-binding';
import type {
  ProjectedProviderWorkGraph,
  ProjectedProviderWorkPackage,
  WorkPackageDependencyAuthorityRefV1,
  ProviderDependencyObservation,
  ProviderDependencyState,
  ProviderWorkPackageDependency,
} from '../../core/engineers/scheduling';
import { assertCompletePassingMatrix } from '../../core/integration/product-acceptance';
import type {
  IntegrationContractV2,
  IntegrationEnvelopeV2,
  SelectedPullRequestV2,
} from '../../core/integration/product-acceptance';
import { publicationSha256 } from '../../core/publication/publication-receipt';
import { readAcceptanceMatrix, readProductAcceptanceProjection, readIntegrationContract, readIntegrationEnvelope,
  observeSelectedPullRequest, observeSelectedPullRequestState } from '../integration/product-acceptance';
import { gitExecFileSync } from '../git/runner';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { readCanonicalTargetRef } from '../state/canonical-target';
import type { RepoHarnessRegisteredRepo, RepoHarnessRegistrySnapshot } from '../repo-registry';
import { osAccountHome } from '../runtime/os-account-home';
import {
  userWaiverGrantPath, readAcceptanceReceiptRecord, readUserWaiverGrantFile, validateAcceptanceReceiptAgainstPolicy,
  readAcceptanceVerificationObservation,
  type AcceptanceDisposition,
  type AcceptanceValidatorRuleId,
  type AcceptanceVerificationObservationV1,
} from '../review/acceptance-receipt';

export const DEPENDENCY_AUTHORITY_PROTOCOL = 1 as const;
export const DEPENDENCY_AUTHORITY_KIND = 'repo-harness-dependency-authority-observation' as const;

export type DependencyAuthorityStatus = 'satisfied' | 'unsatisfied' | 'authority_unavailable';

export interface DependencyAuthorityResolutionV1 {
  readonly status: DependencyAuthorityStatus;
  readonly authority_revision: string | null;
  readonly evidence_refs: readonly { readonly ref: string; readonly sha256: string }[];
}

/**
 * One registered repository plus the exact canonical commit its Work Graph was
 * projected from. Cross-repository dependencies resolve only through entries of
 * the current adopted registry snapshot; a repository path is never taken from
 * Work Graph text.
 */
export interface DependencyAuthorityRepositoryRead {
  readonly repo: RepoHarnessRegisteredRepo;
  readonly commit: string | null;
  readonly graph: ProjectedProviderWorkGraph | null;
}

export interface DependencyAuthorityReaders {
  readonly readIssuePolicy: typeof readExternalSourcesPolicy;
  readonly observeProviderIssues: (repoRoot: string) => ReturnType<typeof fetchGithubIssues>;
  readonly observeReviewAdmission: typeof observeActiveReviewAdmission;
  readonly readCanonicalTargetRef: (repoRoot: string) => string;
  readonly readAcceptanceObservation: (
    repoRoot: string,
    authorityHome: string,
    campaignSha256: string,
    admissionSha256: string,
  ) => AcceptanceVerificationObservationV1 | null;
  readonly readAcceptanceMatrix: typeof readAcceptanceMatrix;
  readonly observeIntegrationState: typeof observeSelectedPullRequestState;
  readonly observeIntegration: typeof observeSelectedPullRequest;
  readonly readProductAcceptanceProjection: typeof readProductAcceptanceProjection;
  readonly readIntegrationEnvelope: (repoRoot: string, digest: string) => IntegrationEnvelopeV2;
  readonly readIntegrationContract: (repoRoot: string, digest: string) => IntegrationContractV2;
  readonly repositoryIdentity: (repoRoot: string) => string;
  readonly resolveAuthorityHome: () => string;
}

export interface DependencyAuthorityInput {
  readonly dependency: ProviderWorkPackageDependency;
  readonly target: ProjectedProviderWorkPackage;
  readonly reads: readonly DependencyAuthorityRepositoryRead[];
  readonly registry: RepoHarnessRegistrySnapshot;
  /**
   * The same-commit tracked file reader the Work Graph projection already uses.
   * It is required rather than defaulted so no caller can silently resolve a
   * declared authority subject against working-tree bytes.
   */
  readonly readFileAtCommit: (repoRoot: string, commit: string, path: string) => string | null;
  readonly readers?: Partial<DependencyAuthorityReaders>;
}

// Gate receipts root at the OS account home, the anchor merge-gate uses; the
// launch environment must not move it.
function defaultAuthorityHome(): string {
  return realpathSync(osAccountHome());
}

export function defaultDependencyAuthorityReaders(): DependencyAuthorityReaders {
  const value: DependencyAuthorityReaders = {
    readIssuePolicy: readExternalSourcesPolicy,
    observeProviderIssues: repoRoot => {
      if (currentReadonlyObservation()) rejectObservation('Live provider dependency requires an external observation');
      return fetchGithubIssues(requireManualGithubPolicy(readExternalSourcesPolicy(repoRoot)));
    },
    observeReviewAdmission: input => {
      if (currentReadonlyObservation()) rejectObservation('Live dependency admission requires an external observation');
      return observeActiveReviewAdmission(input);
    },
    readCanonicalTargetRef,
    readAcceptanceObservation: readAcceptanceVerificationObservation,
    readAcceptanceMatrix,
    observeIntegrationState: (...args) => {
      if (currentReadonlyObservation()) rejectObservation('Live provider integration requires an external observation');
      return observeSelectedPullRequestState(...args);
    },
    observeIntegration: (...args) => {
      if (currentReadonlyObservation()) rejectObservation('Live provider integration requires an external observation');
      return observeSelectedPullRequest(...args);
    },
    readProductAcceptanceProjection,
    readIntegrationEnvelope: (repoRoot, digest) => readIntegrationEnvelope(repoRoot, digest),
    readIntegrationContract: (repoRoot, digest) => readIntegrationContract(repoRoot, digest),
    repositoryIdentity: (repoRoot) => publicationSha256(realpathSync(resolveGitCommonDirectory(repoRoot))),
    resolveAuthorityHome: defaultAuthorityHome,
  };
  return Object.freeze(value);
}

function readers(overrides: Partial<DependencyAuthorityReaders> = {}): DependencyAuthorityReaders {
  return { ...defaultDependencyAuthorityReaders(), ...overrides };
}

function evidence(ref: string, sha256: string): DependencyAuthorityResolutionV1['evidence_refs'][number] {
  return Object.freeze({ ref, sha256 });
}

function sortedEvidence(refs: readonly DependencyAuthorityResolutionV1['evidence_refs'][number][]): readonly DependencyAuthorityResolutionV1['evidence_refs'][number][] {
  return Object.freeze([...refs].sort((left, right) => (
    `${left.ref}\n${left.sha256}`.localeCompare(`${right.ref}\n${right.sha256}`)
  )));
}

interface AdapterVerdict {
  readonly status: DependencyAuthorityStatus;
  readonly evidence_refs: readonly DependencyAuthorityResolutionV1['evidence_refs'][number][];
}

const UNAVAILABLE: AdapterVerdict = Object.freeze({ status: 'authority_unavailable', evidence_refs: Object.freeze([]) });

function verdict(status: 'satisfied' | 'unsatisfied', refs: readonly DependencyAuthorityResolutionV1['evidence_refs'][number][]): AdapterVerdict {
  return Object.freeze({ status, evidence_refs: sortedEvidence(refs) });
}

/**
 * The canonical validated evidence projection. `authority_revision` is its
 * digest, so any registry authorization, target identity or evidence movement
 * changes the revision and stales the Engineer offer that asserted it.
 */
function authorityRevision(
  input: DependencyAuthorityInput,
  repo: RepoHarnessRegisteredRepo | null,
  commit: string | null,
  result: AdapterVerdict,
): string {
  return engineerSha256(canonicalEngineerJson({
    protocol: DEPENDENCY_AUTHORITY_PROTOCOL,
    kind: DEPENDENCY_AUTHORITY_KIND,
    dependency: {
      repository_id: input.dependency.repository_id,
      work_package_id: input.dependency.work_package_id,
      required_state: input.dependency.required_state,
      acceptance_authority: input.dependency.acceptance_authority,
    },
    registry: {
      authorization_revision: input.registry.authorizationRevision,
      access_mode: repo === null ? null : repo.accessMode,
      registered: repo !== null,
    },
    canonical_commit: commit,
    target: {
      repository_id: input.target.repository_id,

      work_package_id: input.target.work_package_id,
      work_package_revision: input.target.work_package_revision,
      task: input.target.task,
      issue: input.target.issue,
    },
    status: result.status,
    evidence_refs: result.evidence_refs,
  }));
}

function resolution(
  input: DependencyAuthorityInput,
  repo: RepoHarnessRegisteredRepo | null,
  result: AdapterVerdict,
): DependencyAuthorityResolutionV1 {
  return Object.freeze({
    status: result.status,
    authority_revision: result.status === 'authority_unavailable'
      ? null
      : authorityRevision(input, repo, input.reads.find((entry) => entry.repo.id === input.dependency.repository_id)?.commit ?? null, result),
    evidence_refs: result.evidence_refs,
  });
}

/**
 * The dependency target repository must be an exact member of the current
 * adopted registry snapshot with read-write authorization. A revoked or absent
 * authorization is `authority_unavailable`, never `satisfied`.
 */
function authorizedRead(input: DependencyAuthorityInput): DependencyAuthorityRepositoryRead | null {
  const registered = input.registry.repos.find((entry) => entry.id === input.dependency.repository_id
    && entry.accessMode === 'read_write') ?? null;
  if (registered === null) return null;
  const read = input.reads.find((entry) => entry.repo.id === input.dependency.repository_id) ?? null;
  if (read === null || read.commit === null || read.graph === null) return null;
  if (read.repo.path !== registered.path || read.repo.accessMode !== registered.accessMode) return null;
  return read;
}

/**
 * Reads the declared authority subject from the target repository at the same
 * canonical commit the target Work Graph was projected from, and proves the
 * declared revision. Returns null when the subject cannot be proven.
 */
function subjectBytesAtCommit(
  input: DependencyAuthorityInput,
  read: DependencyAuthorityRepositoryRead,
  reference: WorkPackageDependencyAuthorityRefV1,
): string | null {
  if (read.commit === null) return null;
  let bytes: string | null;
  try {
    bytes = input.readFileAtCommit(read.repo.path, read.commit, reference.subject_ref);
  } catch {
    return null;
  }
  if (bytes === null || engineerSha256(bytes) !== reference.subject_revision) return null;
  return bytes;
}

function providerClosed(input: DependencyAuthorityInput, read: DependencyAuthorityRepositoryRead, reader: DependencyAuthorityReaders): AdapterVerdict {
  try {
    const before = reader.observeProviderIssues(read.repo.path), after = reader.observeProviderIssues(read.repo.path);
    if (canonicalEngineerJson(before) !== canonicalEngineerJson(after)
      || after.repository.provider_repository_id !== input.target.task.provider_repository_id) return UNAVAILABLE;
    const issues = after.issues.filter(issue => issue.provider_issue_id === input.target.task.issue_id);
    if (issues.length !== 1) return UNAVAILABLE;
    return verdict(issues[0]!.state === 'closed' ? 'satisfied' : 'unsatisfied', [evidence(
      `github-issue:${input.target.task.provider_repository_id}:${input.target.task.issue_id}`, engineerSha256(canonicalEngineerJson(issues[0])),
    )]);
  } catch { return UNAVAILABLE; }
}

/**
 * How each rule of the acceptance authority's synchronous validator is covered
 * on the observation path this module reads.
 *
 * - `record_time`: both record paths call the shared validator through
 *   `assertRecordedReceiptPolicy` before `writeAcceptanceWithArchiveProjection`,
 *   so an observation existing at all implies the rule held.
 * - `subject_key`: bound by the observation's subject key, which this module
 *   derives from the edge's committed selector and fresh protected approval.
 * - `resolver`: this module checks the observation field itself.
 *
 * A rule with no mechanism is a bug, not a gap: `disposition_not_reject` is
 * `resolver` precisely because `recordAcceptance` will happily record — and
 * therefore observe — a `reject`.
 */
export const OBSERVATION_PATH_RULE_COVERAGE: Readonly<Record<AcceptanceValidatorRuleId, 'record_time' | 'subject_key' | 'resolver'>> = Object.freeze({
  receipt_protocol_kind: 'record_time',
  // The record path validates the failure array before writing the receipt.
  check_failure_evidence: 'record_time',
  // The observation reader requires repository_root === realpath(repo path).
  repository_root: 'resolver',
  campaign_identity: 'subject_key',
  admission_binding: 'resolver',
  reviewer_policy: 'record_time',
  // The observation reader validates the protected grant digest.
  grant_digest_shape: 'resolver',
  // The resolver compares the fresh provider goal against protected approval.
  goal_fingerprint: 'resolver',
  // The record path's own readRegular only rejects escaping paths; this rule
  // is what rejects a `-`-prefixed or backslash verification file.
  verification_file_shape: 'record_time',
  verification_evidence_shape: 'record_time',
  benchmark_evidence_present: 'record_time',
  subject_sha256_shape: 'record_time',
  subject_scope: 'record_time',
  // Also compared against the target repository's canonical target ref.
  target_ref_present: 'resolver',
  target_revision_shape: 'record_time',
  // The diff can genuinely produce a `-`-prefixed path.
  reviewed_paths_shape: 'record_time',
  summary_present: 'record_time',
  issued_at_shape: 'record_time',
  // The one rule assertRecordedReceiptPolicy skips: recording a rejection is
  // legitimate, so only the passing-disposition whitelist below keeps a
  // recorded rejection out of scheduling.
  disposition_not_reject: 'resolver',
  waiver_grant_present: 'resolver',
  waiver_policy_allowed: 'resolver',
  waiver_grant_repository: 'resolver',
  waiver_grant_admission: 'resolver',
  waiver_grant_goal: 'resolver',
  waiver_grant_owner: 'resolver',
  waiver_grant_fingerprint: 'resolver',
  waiver_binding_symmetry: 'resolver',
  disposition_policy: 'record_time',
  // A thrown rule propagates as a fail() from assertRecordedReceiptPolicy, so
  // no receipt and no observation are written.
  validator_threw: 'record_time',
});

const PASSING_ACCEPTANCE_DISPOSITIONS: readonly AcceptanceDisposition[] = Object.freeze(['external_pass', 'user_waiver']);

/**
 * The module acceptance verdict is the acceptance authority's own record-time
 * observation. Provider integrations use live provider proof; products read
 * the exact selected ME-4C projection. The acceptance authority proves the review subject and execution
 * evidence at record time. This reader additionally authenticates the pinned
 * approval against the current issue goal before using that observation.
 * Waivers additionally require the current local grant and its live expiry.
 */
function observeSelectedAdmission(reader: DependencyAuthorityReaders, repoRoot: string, authorityHome: string,
  selector: ReturnType<typeof validateModuleAcceptanceReference>) {
  const active = reader.observeReviewAdmission({ repoRoot, authorityHome,
    repository_id: selector.provider_repository_id, issue_id: selector.issue_id, campaign_id: selector.campaign_id,
    expectedGrantSha256: selector.grant_sha256, expectedPolicySha256: selector.policy_sha256, expectedActor: selector.actor_id,
    issuePolicy: reader.readIssuePolicy(repoRoot) });
  if (active.admission.admission_sha256 !== selector.admission_sha256 || active.grant_sha256 !== selector.grant_sha256) throw new Error('review approval changed');
  return active;
}

function moduleAccepted(
  input: DependencyAuthorityInput,
  read: DependencyAuthorityRepositoryRead,
  reader: DependencyAuthorityReaders,
): AdapterVerdict {
  const reference = input.dependency.acceptance_authority;
  if (reference === null || reference.authority_kind !== 'module_acceptance') return UNAVAILABLE;
  const subject = subjectBytesAtCommit(input, read, reference);
  if (subject === null) return UNAVAILABLE;

  const selected = evidence(`acceptance-subject:${reference.subject_ref}`, reference.subject_revision);
  let selector: ReturnType<typeof validateModuleAcceptanceReference>;
  let active: ReturnType<typeof observeActiveReviewAdmission>;
  let observation: AcceptanceVerificationObservationV1 | null;
  let targetRef: string;
  let authorityHome: string;
  try {
    selector = validateModuleAcceptanceReference(JSON.parse(subject));
    authorityHome = reader.resolveAuthorityHome();
    targetRef = reader.readCanonicalTargetRef(read.repo.path);
    // Repository path and policy location come only from the adopted registry.
    // The committed selector cannot supply a filesystem or provider endpoint.
    // A readable selector for another task does not cover this target.
    if (selector.provider_repository_id !== input.target.task.provider_repository_id || selector.issue_id !== input.target.task.issue_id) return verdict('unsatisfied', [selected]);
    active = observeSelectedAdmission(reader, read.repo.path, authorityHome, selector);
    observation = reader.readAcceptanceObservation(read.repo.path, authorityHome,
      active.admission.campaign_sha256, active.admission.admission_sha256);
  } catch {
    return UNAVAILABLE;
  }
  const admitted = [
    selected,
    evidence(`acceptance-goal:${selector.provider_repository_id}:${selector.issue_id}`, active.admission.goal.revision),
    evidence(`acceptance-grant:${active.grant_sha256}`, active.grant_sha256),
  ];
  // The admission is current but its authority has recorded no acceptance yet.
  if (observation === null) return verdict('unsatisfied', admitted);
  if (observation.archive_projection_sha256 !== null) return UNAVAILABLE;
  if (PASSING_ACCEPTANCE_DISPOSITIONS.includes(observation.disposition)) {
    try {
      // The observation pins its receipt by digest; a later review replaces only the latest file.
      // The record parser admits only the current Receipt protocol, so a pre-upgrade record is unavailable.
      const { receipt } = readAcceptanceReceiptRecord(read.repo.path, authorityHome, observation.acceptance_receipt_sha256);
      if (observation.disposition === 'user_waiver') {
        const grantPath = userWaiverGrantPath(read.repo.path, authorityHome);
        // A local protected authority file, never a new provider read.
        const stat = lstatSync(grantPath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) return UNAVAILABLE;
        const grant = readUserWaiverGrantFile(grantPath);
        if (!validateAcceptanceReceiptAgainstPolicy({ receipt, repositoryRoot: realpathSync(read.repo.path),
          admission: active.admission, grantSha256: active.grant_sha256, waiverGrant: grant }).ok) return UNAVAILABLE;
      }
    } catch { return UNAVAILABLE; }
  }

  const refs = [
    ...admitted,
    evidence(`acceptance-observation:${observation.observation_id}`, observation.observation_id),
    evidence(`acceptance-disposition:${observation.disposition}`, engineerSha256(observation.disposition)),
    evidence(`acceptance-target:${observation.target_ref}`, engineerSha256(observation.target_revision)),
  ];
  // A readable observation with stale bindings is negative. Missing or revoked
  // protected authority is unavailable, even if an old observation remains.
  const matches = observation.campaign_sha256 === active.admission.campaign_sha256
    && observation.admission_sha256 === active.admission.admission_sha256
    && observation.grant_sha256 === active.grant_sha256
    && observation.goal_sha256 === active.admission.goal.revision
    && observation.target_ref === targetRef;
  return verdict(matches && PASSING_ACCEPTANCE_DISPOSITIONS.includes(observation.disposition) ? 'satisfied' : 'unsatisfied', refs);
}

function integrationSelection(input: DependencyAuthorityInput, read: DependencyAuthorityRepositoryRead) {
  const reference = input.dependency.acceptance_authority;
  if (!reference) throw new Error('explicit integration selector is required');
  const bytes = subjectBytesAtCommit(input, read, reference);
  if (bytes === null) throw new Error('committed integration selector unavailable');
  return { reference, selection: validateProviderIntegrationDependencyReference(JSON.parse(bytes)) };
}

type IntegrationObservation =
  | { readonly kind: 'unmet'; readonly verdict: AdapterVerdict }
  | {
    readonly kind: 'integrated';
    readonly selection: ReturnType<typeof validateProviderIntegrationDependencyReference>;
    readonly observed: readonly SelectedPullRequestV2[];
    readonly refs: readonly DependencyAuthorityResolutionV1['evidence_refs'][number][];
  };

/**
 * Reads the committed selection, then the provider state of every selected
 * PR. A selection for another task and a selected PR that is still unmerged at
 * its exact head are readable negatives. An unreadable, malformed or moved
 * authority throws, and the adapters map that to `authority_unavailable`.
 */
function observeIntegrationSelection(
  input: DependencyAuthorityInput,
  read: DependencyAuthorityRepositoryRead,
  reader: DependencyAuthorityReaders,
  product: boolean,
): IntegrationObservation {
  const { reference, selection } = integrationSelection(input, read);
  if ((selection.product !== null) !== product) throw new Error('integration selector kind does not match the dependency state');
  const selected = evidence(`integration-selection:${reference.subject_ref}`, reference.subject_revision);
  if (selection.provider_repository_id !== input.target.task.provider_repository_id || selection.issue_id !== input.target.task.issue_id) {
    return { kind: 'unmet', verdict: verdict('unsatisfied', [selected]) };
  }
  const environment = { repo_root: read.repo.path };
  const states = () => selection.required_pull_requests.map(pr => ({
    repository: pr.repository, pr_number: pr.pr_number, state: reader.observeIntegrationState(environment, pr),
  }));
  const pending = states();
  if (canonicalEngineerJson(pending) !== canonicalEngineerJson(states())) throw new Error('provider PR state moved');
  if (pending.some(entry => entry.state !== 'MERGED')) {
    return { kind: 'unmet', verdict: verdict('unsatisfied', [selected,
      evidence(`provider-pull-requests:${reference.subject_ref}`, engineerSha256(canonicalEngineerJson(pending)))]) };
  }
  const tree = gitExecFileSync(['rev-parse', `${selection.final_head_sha}^{tree}`], { cwd: read.repo.path, encoding: 'utf8' }).trim();
  if (tree !== selection.final_tree_sha) throw new Error('integration candidate tree changed');
  const observe = () => selection.required_pull_requests.map(pr => reader.observeIntegration(
    environment, read.repo.path, 'git', pr, selection.final_head_sha));
  const observed = observe();
  if (canonicalEngineerJson(observed) !== canonicalEngineerJson(observe())) throw new Error('provider integration moved');
  return { kind: 'integrated', selection, observed, refs: [selected,
    evidence(`provider-integration:${selection.final_head_sha}`, engineerSha256(canonicalEngineerJson({ selection, observed })))] };
}

function publicationIntegrated(input: DependencyAuthorityInput, read: DependencyAuthorityRepositoryRead, reader: DependencyAuthorityReaders): AdapterVerdict {
  if (input.dependency.acceptance_authority?.authority_kind !== 'provider_integration') return UNAVAILABLE;
  try {
    const integration = observeIntegrationSelection(input, read, reader, false);
    return integration.kind === 'unmet' ? integration.verdict : verdict('satisfied', integration.refs);
  } catch { return UNAVAILABLE; }
}

function productAccepted(input: DependencyAuthorityInput, read: DependencyAuthorityRepositoryRead, reader: DependencyAuthorityReaders): AdapterVerdict {
  if (input.dependency.acceptance_authority?.authority_kind !== 'product_acceptance') return UNAVAILABLE;
  try {
    const integration = observeIntegrationSelection(input, read, reader, true);
    if (integration.kind === 'unmet') return integration.verdict;
    const { selection, observed, refs } = integration;
    const product = selection.product!;
    const prd = input.readFileAtCommit(read.repo.path, read.commit!, product.approved_prd_ref);
    if (prd === null || engineerSha256(prd) !== product.approved_prd_sha256) return UNAVAILABLE;
    // The selector can only name a digest that was already persisted, so an
    // absent projection is lost local evidence and throws to unavailable.
    const projection = reader.readProductAcceptanceProjection(read.repo.path, product.projection_sha256);
    const envelope = reader.readIntegrationEnvelope(read.repo.path, projection.envelope_sha256);
    const contract = reader.readIntegrationContract(read.repo.path, envelope.integration_contract_sha256);
    const matrix = reader.readAcceptanceMatrix(read.repo.path, projection.matrix_sha256);
    assertCompletePassingMatrix(contract, envelope, matrix);
    if (contract.repository_id !== reader.repositoryIdentity(read.repo.path)) return UNAVAILABLE;
    const projected = [...refs, evidence(`product-acceptance-projection:${projection.projection_sha256}`, projection.projection_sha256)];
    const sort = (values: readonly { provider_repository_id: string; pr_number: number }[]) => [...values].sort((a,b) => `${a.provider_repository_id}:${a.pr_number}`.localeCompare(`${b.provider_repository_id}:${b.pr_number}`));
    // A valid projection for another requirement, PR set or candidate is readable and does not prove this selection.
    if (contract.requirement.approved_prd_ref !== product.approved_prd_ref || contract.requirement.approved_prd_sha256 !== product.approved_prd_sha256
      || canonicalEngineerJson(sort(contract.required_pull_requests)) !== canonicalEngineerJson(sort(selection.required_pull_requests))
      || envelope.final_head_sha !== selection.final_head_sha || envelope.final_tree_sha !== selection.final_tree_sha
      || canonicalEngineerJson(sort(envelope.selected_pull_requests)) !== canonicalEngineerJson(sort(observed))) return verdict('unsatisfied', projected);
    const authorityHome = reader.resolveAuthorityHome();
    if (product.review_authority.provider_repository_id !== input.target.task.provider_repository_id || product.review_authority.issue_id !== input.target.task.issue_id) return UNAVAILABLE;
    const active = observeSelectedAdmission(reader, read.repo.path, authorityHome, product.review_authority);
    // The projection pins its receipt by digest; a later review replaces only the latest file.
    const { receipt } = readAcceptanceReceiptRecord(read.repo.path, authorityHome, projection.acceptance_receipt_sha256);
    if (receipt.subject_sha256 !== projection.acceptance_subject_sha256
      || receipt.target_revision !== projection.acceptance_target_revision || receipt.target_revision !== envelope.base_sha
      || receipt.disposition !== projection.acceptance_disposition) return UNAVAILABLE;
    let waiverGrant = null;
    if (receipt.disposition === 'user_waiver') {
      const path = userWaiverGrantPath(read.repo.path, authorityHome);
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) return UNAVAILABLE;
      waiverGrant = readUserWaiverGrantFile(path);
    }
    if (!validateAcceptanceReceiptAgainstPolicy({ receipt, repositoryRoot: realpathSync(read.repo.path),
      admission: active.admission, grantSha256: active.grant_sha256, waiverGrant }).ok) return UNAVAILABLE;
    return verdict('satisfied', [
      ...projected,
      evidence(`product-requirement:${product.approved_prd_ref}`, product.approved_prd_sha256),
      evidence(`integration-envelope:${envelope.envelope_sha256}`, envelope.envelope_sha256),
      evidence(`integration-contract:${contract.contract_sha256}`, contract.contract_sha256),
      evidence(`acceptance-receipt:${projection.acceptance_receipt_sha256}`, projection.acceptance_receipt_sha256),
    ]);
  } catch { return UNAVAILABLE; }
}


type DependencyTargetMismatch = 'repository_mismatch' | 'work_package_mismatch' | 'not_a_graph_member';

function pairingRefusal(input: DependencyAuthorityInput, reason: DependencyTargetMismatch): AdapterVerdict {
  return Object.freeze({
    status: 'authority_unavailable',
    evidence_refs: Object.freeze([evidence(
      `dependency-target-mismatch:${input.dependency.repository_id}:${input.dependency.work_package_id}`,
      engineerSha256(canonicalEngineerJson({
        reason,
        declared: {
          repository_id: input.dependency.repository_id,
          work_package_id: input.dependency.work_package_id,
          required_state: input.dependency.required_state,
        },
        observed: {
          repository_id: input.target.repository_id,
          work_package_id: input.target.work_package_id,
          work_package_revision: input.target.work_package_revision,
          task: input.target.task,
        },
      })),
    )]),
  });
}

/**
 * The declared edge and the observed target arrive as two separate inputs, and
 * every adapter reads the target rather than the edge: `canonicalDone` decides
 * from `target.issue.state` alone. This module is the closed authority for the
 * verdict and is injectable, so the pairing is proven here instead of being
 * trusted from the caller. An unpaired or stale target is
 * `authority_unavailable`, never a verdict about some other Work Package.
 */
function targetPairingRefusal(
  input: DependencyAuthorityInput,
  read: DependencyAuthorityRepositoryRead,
): AdapterVerdict | null {
  if (input.target.repository_id !== input.dependency.repository_id) return pairingRefusal(input, 'repository_mismatch');
  if (input.target.work_package_id !== input.dependency.work_package_id) return pairingRefusal(input, 'work_package_mismatch');
  const member = (read.graph?.work_packages ?? []).find((candidate) => (
    candidate.repository_id === input.dependency.repository_id
    && candidate.work_package_id === input.dependency.work_package_id
  )) ?? null;
  // Exact membership at the canonical commit: identity, Work Package revision,
  // canonical task identity and row status must all be the projected member's.
  if (member === null || canonicalEngineerJson(member) !== canonicalEngineerJson(input.target)) {
    return pairingRefusal(input, 'not_a_graph_member');
  }
  return null;
}

function unreachableDependencyState(state: never): never {
  throw new Error(`unsupported dependency state has no authority adapter: ${String(state)}`);
}

export function resolveDependencyAuthority(input: DependencyAuthorityInput): DependencyAuthorityResolutionV1 {
  const reader = readers(input.readers);
  const read = authorizedRead(input);
  const repo = read?.repo ?? null;
  if (read === null) return resolution(input, repo, UNAVAILABLE);
  const unpaired = targetPairingRefusal(input, read);
  if (unpaired !== null) return resolution(input, repo, unpaired);
  const state: ProviderDependencyState = input.dependency.required_state;
  switch (state) {
    case 'provider_closed':
      return resolution(input, repo, input.dependency.acceptance_authority === null ? providerClosed(input, read, reader) : UNAVAILABLE);
    case 'module_accepted':
      return resolution(input, repo, moduleAccepted(input, read, reader));
    case 'publication_integrated':
      return resolution(input, repo, publicationIntegrated(input, read, reader));
    case 'product_accepted':
      return resolution(input, repo, productAccepted(input, read, reader));
    default:
      return unreachableDependencyState(state);
  }
}

/** The scheduling-facing projection: one observation per declared edge. */
export function resolveDependencyObservation(input: DependencyAuthorityInput): ProviderDependencyObservation {
  const resolved = resolveDependencyAuthority(input);
  return Object.freeze({
    ...input.dependency,
    status: resolved.status,
    authority_revision: resolved.authority_revision,
  });
}
