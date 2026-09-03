/**
 * The single read-only dependency-authority resolver for Engineer scheduling.
 *
 * Every `WorkPackageDependencyState` is answered by the one authority that
 * already owns that verdict: the canonical Sprint row, the exact-subject
 * AcceptanceReceipt, the immutable Publication receipt plus its integration
 * observation, and the ME-4C product acceptance projection. This module reads
 * those authorities; it never records, completes, publishes or accepts, and it
 * never reconstructs a verdict from prose, filenames, branch names, Git
 * topology or provider state.
 *
 * Status contract:
 * - `satisfied`            the authority was readable and proves the state;
 * - `unsatisfied`          the authority was readable and does not prove it;
 * - `authority_unavailable` the authority is missing, unreadable, unauthorized
 *                          or unsupported for this dependency.
 *
 * There is deliberately no "unknown means ready" path.
 */
import { realpathSync } from 'fs';
import { userInfo } from 'os';

import {
  canonicalEngineerJson,
  engineerSha256,
} from '../../core/engineers/profile-binding';
import type {
  ProjectedWorkGraphV1,
  ProjectedWorkPackageV1,
  WorkPackageDependencyAuthorityRefV1,
  WorkPackageDependencyObservationV1,
  WorkPackageDependencyState,
  WorkPackageDependencyV1,
} from '../../core/engineers/scheduling';
import type { VerifiedEvidenceRefV1 } from '../../core/engineers/verified-context';
import type {
  IntegrationContractV1,
  IntegrationEnvelopeV1,
  ProductAcceptanceProjectionV1,
} from '../../core/integration/product-acceptance';
import type { PublicationIntegrationObservationV1 } from '../../core/publication/publication-lifecycle';
import {
  publicationReceiptDigest,
  publicationSha256,
  type PublicationReceiptV1,
} from '../../core/publication/publication-receipt';
import {
  listProductAcceptanceProjections,
  readIntegrationContract,
  readIntegrationEnvelope,
} from '../integration/product-acceptance';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { readPublicationIntegrationObservations } from '../publication/publication-lifecycle';
import { readPublicationReceiptCache } from '../publication/publication-receipt';
import { readCanonicalTargetRef } from '../state/collect-board-inputs';
import { readLease, type LeaseRead } from '../state/coordination-lease-store';
import { COMPLETED_ROW_STATUS_PATTERN } from '../../core/state/coordination-identity';
import type { RepoHarnessRegisteredRepo, RepoHarnessRegistrySnapshot } from '../repo-registry';
import {
  authorityFingerprint,
  contractCarriesArchiveProjection,
  readAcceptanceVerificationObservation,
  type AcceptanceDisposition,
  type AcceptanceValidatorRuleId,
  type AcceptanceVerificationObservationV1,
} from '../../../scripts/acceptance-receipt';

export const DEPENDENCY_AUTHORITY_PROTOCOL = 1 as const;
export const DEPENDENCY_AUTHORITY_KIND = 'repo-harness-dependency-authority-observation' as const;

export type DependencyAuthorityStatus = 'satisfied' | 'unsatisfied' | 'authority_unavailable';

export interface DependencyAuthorityResolutionV1 {
  readonly status: DependencyAuthorityStatus;
  readonly authority_revision: string | null;
  readonly evidence_refs: readonly VerifiedEvidenceRefV1[];
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
  readonly graph: ProjectedWorkGraphV1 | null;
}

export interface DependencyAuthorityReaders {
  readonly readCanonicalTargetRef: (repoRoot: string) => string;
  readonly readAcceptanceObservation: (
    repoRoot: string,
    authorityHome: string,
    contractFile: string,
    contractSha256: string,
  ) => AcceptanceVerificationObservationV1 | null;
  readonly readLease: (repoRoot: string, taskId: string) => LeaseRead;
  readonly readIntegrationObservations: (
    repoRoot: string,
    taskId: string,
    taskRevision: string,
  ) => readonly PublicationIntegrationObservationV1[];
  readonly readPublicationReceipt: (repoRoot: string, publicationId: string) => PublicationReceiptV1 | null;
  readonly readProductAcceptanceProjections: (repoRoot: string) => readonly ProductAcceptanceProjectionV1[];
  readonly readIntegrationEnvelope: (repoRoot: string, digest: string) => IntegrationEnvelopeV1;
  readonly readIntegrationContract: (repoRoot: string, digest: string) => IntegrationContractV1;
  readonly repositoryIdentity: (repoRoot: string) => string;
  readonly resolveAuthorityHome: (env: NodeJS.ProcessEnv | undefined) => string;
}

export interface DependencyAuthorityInput {
  readonly dependency: WorkPackageDependencyV1;
  readonly target: ProjectedWorkPackageV1;
  readonly reads: readonly DependencyAuthorityRepositoryRead[];
  readonly registry: RepoHarnessRegistrySnapshot;
  readonly env?: NodeJS.ProcessEnv;
  /**
   * The same-commit tracked file reader the Work Graph projection already uses.
   * It is required rather than defaulted so no caller can silently resolve a
   * declared authority subject against working-tree bytes.
   */
  readonly readFileAtCommit: (repoRoot: string, commit: string, path: string) => string | null;
  readonly readers?: Partial<DependencyAuthorityReaders>;
}

function defaultAuthorityHome(env: NodeJS.ProcessEnv | undefined): string {
  const home = env?.REPO_HARNESS_HOME ?? env?.HOME ?? userInfo().homedir;
  return realpathSync(home);
}

export function defaultDependencyAuthorityReaders(): DependencyAuthorityReaders {
  const value: DependencyAuthorityReaders = {
    readCanonicalTargetRef,
    readAcceptanceObservation: readAcceptanceVerificationObservation,
    readLease,
    readIntegrationObservations: readPublicationIntegrationObservations,
    readPublicationReceipt: (repoRoot, publicationId) => readPublicationReceiptCache(repoRoot, publicationId),
    readProductAcceptanceProjections: (repoRoot) => listProductAcceptanceProjections(repoRoot),
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

function evidence(ref: string, sha256: string): VerifiedEvidenceRefV1 {
  return Object.freeze({ ref, sha256 });
}

function sortedEvidence(refs: readonly VerifiedEvidenceRefV1[]): readonly VerifiedEvidenceRefV1[] {
  return Object.freeze([...refs].sort((left, right) => (
    `${left.ref}\n${left.sha256}`.localeCompare(`${right.ref}\n${right.sha256}`)
  )));
}

interface AdapterVerdict {
  readonly status: DependencyAuthorityStatus;
  readonly evidence_refs: readonly VerifiedEvidenceRefV1[];
}

const UNAVAILABLE: AdapterVerdict = Object.freeze({ status: 'authority_unavailable', evidence_refs: Object.freeze([]) });

function verdict(status: 'satisfied' | 'unsatisfied', refs: readonly VerifiedEvidenceRefV1[]): AdapterVerdict {
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
      sprint_path: input.target.sprint_path,
      work_package_id: input.target.work_package_id,
      work_package_revision: input.target.work_package_revision,
      task_id: input.target.task_id,
      task_revision: input.target.task_revision,
      task_status: input.target.task_status,
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

function canonicalDone(input: DependencyAuthorityInput): AdapterVerdict {
  const satisfied = COMPLETED_ROW_STATUS_PATTERN.test(input.target.task_status);
  return verdict(satisfied ? 'satisfied' : 'unsatisfied', [
    evidence(
      `canonical-task:${input.target.repository_id}:${input.target.task_id}`,
      engineerSha256(canonicalEngineerJson({
        task_revision: input.target.task_revision,
        task_status: input.target.task_status,
      })),
    ),
  ]);
}

/**
 * How each rule of the acceptance authority's synchronous validator is covered
 * on the observation path this module reads.
 *
 * - `record_time`: both record paths call the shared validator through
 *   `assertRecordedReceiptPolicy` before `writeAcceptanceWithArchiveProjection`,
 *   so an observation existing at all implies the rule held.
 * - `subject_key`: bound by the observation's subject key, which this module
 *   derives from the edge's declared contract bytes at the canonical commit.
 * - `resolver`: this module checks the observation field itself.
 *
 * A rule with no mechanism is a bug, not a gap: `disposition_not_reject` is
 * `resolver` precisely because `recordAcceptance` will happily record — and
 * therefore observe — a `reject`.
 */
export const OBSERVATION_PATH_RULE_COVERAGE: Readonly<Record<AcceptanceValidatorRuleId, 'record_time' | 'subject_key' | 'resolver'>> = Object.freeze({
  receipt_protocol_kind: 'record_time',
  // The observation reader requires repository_root === realpath(repo path).
  repository_root: 'resolver',
  contract_file: 'subject_key',
  contract_fingerprint: 'subject_key',
  reviewer_policy: 'record_time',
  // The observation reader rejects an unsafe goal_file.
  goal_file_shape: 'resolver',
  // The resolver re-fingerprints the goal at the target's canonical commit.
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
  waiver_grant_present: 'record_time',
  waiver_policy_allowed: 'record_time',
  waiver_grant_repository: 'record_time',
  waiver_grant_contract: 'record_time',
  waiver_grant_goal: 'record_time',
  waiver_grant_owner: 'record_time',
  waiver_grant_fingerprint: 'record_time',
  waiver_binding_symmetry: 'record_time',
  disposition_policy: 'record_time',
  // A thrown rule propagates as a fail() from assertRecordedReceiptPolicy, so
  // no receipt and no observation are written.
  validator_threw: 'record_time',
});

const PASSING_ACCEPTANCE_DISPOSITIONS: readonly AcceptanceDisposition[] = Object.freeze(['external_pass', 'user_waiver']);

/**
 * The module acceptance verdict is the acceptance authority's own record-time
 * observation, read the same way `publicationIntegrated` reads the publication
 * authority's integration observation and `productAccepted` reads the ME-4C
 * projection. Nothing about acceptance is re-derived here: the live review
 * subject, the verification evidence fingerprint and the archive-projection
 * seal were all proven by `verifyAcceptance` at record time and frozen into the
 * observation by the authority that proved them.
 */
function moduleAccepted(
  input: DependencyAuthorityInput,
  read: DependencyAuthorityRepositoryRead,
  reader: DependencyAuthorityReaders,
): AdapterVerdict {
  const reference = input.dependency.acceptance_authority;
  if (reference === null || reference.authority_kind !== 'module_acceptance') return UNAVAILABLE;
  const subject = subjectBytesAtCommit(input, read, reference);
  if (subject === null) return UNAVAILABLE;

  // An archive envelope normalizes away inside the acceptance fingerprint, so
  // archive-projected subject bytes could otherwise borrow an accepted
  // contract's digest. A dependency edge cannot name an archived contract.
  let archived: boolean;
  let subjectFingerprint: string;
  try {
    archived = contractCarriesArchiveProjection(subject);
    subjectFingerprint = authorityFingerprint(subject);
  } catch {
    return UNAVAILABLE;
  }
  if (archived) return UNAVAILABLE;

  let authorityHome: string;
  let targetRef: string;
  try {
    authorityHome = reader.resolveAuthorityHome(input.env);
    targetRef = reader.readCanonicalTargetRef(read.repo.path);
  } catch {
    return UNAVAILABLE;
  }

  let observation: AcceptanceVerificationObservationV1 | null;
  try {
    observation = reader.readAcceptanceObservation(
      read.repo.path,
      authorityHome,
      reference.subject_ref,
      subjectFingerprint,
    );
  } catch {
    return UNAVAILABLE;
  }
  // Absent is not negative: the authority has published no verdict for this
  // exact subject, which is an unavailable authority, never "not accepted".
  if (observation === null) return UNAVAILABLE;
  if (observation.archive_projection_sha256 !== null) return UNAVAILABLE;

  const refs = [
    evidence(`acceptance-observation:${observation.observation_id}`, observation.observation_id),
    evidence(`acceptance-subject:${reference.subject_ref}`, reference.subject_revision),
    evidence(`acceptance-disposition:${observation.disposition}`, engineerSha256(observation.disposition)),
    evidence(`acceptance-target:${observation.target_ref}`, engineerSha256(observation.target_revision)),
  ];
  // A whitelist, not a `reject` test: a disposition this resolver does not
  // know is a readable negative, so a future disposition fails closed until
  // someone decides what it means for scheduling.
  if (!PASSING_ACCEPTANCE_DISPOSITIONS.includes(observation.disposition)) return verdict('unsatisfied', refs);
  if (observation.target_ref !== targetRef) return verdict('unsatisfied', refs);

  let goal: string | null;
  try {
    goal = read.commit === null ? null : input.readFileAtCommit(read.repo.path, read.commit, observation.goal_file);
  } catch {
    return UNAVAILABLE;
  }
  if (goal === null) return UNAVAILABLE;
  refs.push(evidence(`acceptance-goal:${observation.goal_file}`, engineerSha256(goal)));

  let goalFingerprint: string;
  try {
    goalFingerprint = authorityFingerprint(goal);
  } catch {
    return UNAVAILABLE;
  }
  return verdict(goalFingerprint === observation.goal_sha256 ? 'satisfied' : 'unsatisfied', refs);
}

function publicationIntegrated(
  input: DependencyAuthorityInput,
  read: DependencyAuthorityRepositoryRead,
  reader: DependencyAuthorityReaders,
): AdapterVerdict {
  if (input.dependency.acceptance_authority !== null) return UNAVAILABLE;

  let repositoryIdentity: string;
  let lease: LeaseRead;
  let observations: readonly PublicationIntegrationObservationV1[];
  try {
    repositoryIdentity = reader.repositoryIdentity(read.repo.path);
    lease = reader.readLease(read.repo.path, input.target.task_id);
    observations = reader.readIntegrationObservations(read.repo.path, input.target.task_id, input.target.task_revision);
  } catch {
    return UNAVAILABLE;
  }
  if (lease.classification === 'unknown') return UNAVAILABLE;

  const leaseEvidence = evidence(
    `publication-lease:${input.target.task_id}`,
    engineerSha256(canonicalEngineerJson({
      classification: lease.classification,
      publication_id: lease.record !== null && 'current_publication' in lease.record && lease.record.current_publication !== null
        ? lease.record.current_publication.publication_id
        : null,
    })),
  );

  // A live reviewing publication is a readable negative: the publication
  // exists and is not integrated yet. Integration is proven only by the
  // immutable observation this repository's publication authority persisted.
  for (const observation of observations) {
    let receipt: PublicationReceiptV1 | null;
    try {
      receipt = reader.readPublicationReceipt(read.repo.path, observation.publication_id);
    } catch {
      return UNAVAILABLE;
    }
    if (receipt === null) continue;
    if (receipt.repo_id !== repositoryIdentity
      || receipt.task_id !== input.target.task_id
      || receipt.task_revision !== input.target.task_revision
      || receipt.publication_id !== observation.publication_id
      || receipt.head_sha !== observation.head_sha
      || publicationReceiptDigest(receipt) !== observation.receipt_sha256) continue;
    return verdict('satisfied', [
      leaseEvidence,
      evidence(`publication-integration-observation:${observation.observation_id}`, observation.observation_id),
      evidence(`publication-receipt:${observation.publication_id}`, observation.receipt_sha256),
    ]);
  }
  return verdict('unsatisfied', [leaseEvidence]);
}

function productAccepted(
  input: DependencyAuthorityInput,
  read: DependencyAuthorityRepositoryRead,
  reader: DependencyAuthorityReaders,
): AdapterVerdict {
  const reference = input.dependency.acceptance_authority;
  if (reference === null || reference.authority_kind !== 'product_acceptance') return UNAVAILABLE;
  if (subjectBytesAtCommit(input, read, reference) === null) return UNAVAILABLE;

  let repositoryIdentity: string;
  let projections: readonly ProductAcceptanceProjectionV1[];
  try {
    repositoryIdentity = reader.repositoryIdentity(read.repo.path);
    projections = reader.readProductAcceptanceProjections(read.repo.path);
  } catch {
    return UNAVAILABLE;
  }

  const requirement = evidence(`product-requirement:${reference.subject_ref}`, reference.subject_revision);
  for (const projection of projections) {
    let envelope: IntegrationEnvelopeV1;
    let contract: IntegrationContractV1;
    try {
      envelope = reader.readIntegrationEnvelope(read.repo.path, projection.envelope_sha256);
      contract = reader.readIntegrationContract(read.repo.path, envelope.integration_contract_sha256);
    } catch {
      return UNAVAILABLE;
    }
    if (contract.repository_id !== repositoryIdentity) continue;
    if (contract.requirement.approved_prd_ref !== reference.subject_ref
      || contract.requirement.approved_prd_sha256 !== reference.subject_revision) continue;
    const selected = envelope.selected_publications.find((entry) => entry.work_package_id === input.target.task_id
      && entry.work_package_revision === input.target.task_revision) ?? null;
    if (selected === null) continue;
    let receipt: PublicationReceiptV1 | null;
    try {
      receipt = reader.readPublicationReceipt(read.repo.path, selected.publication_id);
    } catch {
      return UNAVAILABLE;
    }
    if (receipt === null
      || receipt.repo_id !== repositoryIdentity
      || receipt.task_id !== input.target.task_id
      || receipt.task_revision !== input.target.task_revision
      || receipt.head_sha !== selected.head_sha
      || receipt.tree_sha !== selected.tree_sha
      || publicationReceiptDigest(receipt) !== selected.receipt_sha256) continue;
    return verdict('satisfied', [
      requirement,
      evidence(`product-acceptance-projection:${projection.projection_sha256}`, projection.projection_sha256),
      evidence(`integration-envelope:${envelope.envelope_sha256}`, envelope.envelope_sha256),
      evidence(`integration-contract:${contract.contract_sha256}`, contract.contract_sha256),
      evidence(`publication-receipt:${selected.publication_id}`, selected.receipt_sha256),
    ]);
  }
  return verdict('unsatisfied', [
    requirement,
    evidence(
      `product-acceptance-store:${repositoryIdentity}`,
      engineerSha256(canonicalEngineerJson(projections.map((entry) => entry.projection_sha256))),
    ),
  ]);
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
          task_id: input.target.task_id,
          task_revision: input.target.task_revision,
        },
      })),
    )]),
  });
}

/**
 * The declared edge and the observed target arrive as two separate inputs, and
 * every adapter reads the target rather than the edge: `canonicalDone` decides
 * from `target.task_status` alone. This module is the closed authority for the
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
  const state: WorkPackageDependencyState = input.dependency.required_state;
  switch (state) {
    case 'canonical_done':
      return resolution(input, repo, input.dependency.acceptance_authority === null ? canonicalDone(input) : UNAVAILABLE);
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
export function resolveDependencyObservation(input: DependencyAuthorityInput): WorkPackageDependencyObservationV1 {
  const resolved = resolveDependencyAuthority(input);
  return Object.freeze({
    ...input.dependency,
    status: resolved.status,
    authority_revision: resolved.authority_revision,
  });
}
