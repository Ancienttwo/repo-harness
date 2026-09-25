import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ProjectionApplyReadbackV1 } from 'archctx-contracts';
import {
  PROJECTION_REQUEST_VERSION,
  assertProjectionApplyAbsence,
  assertProjectionApplyReadbackResult,
  assertProjectionResult,
  digestProjectionJson,
  projectionRequestIssues,
  projectionResultIssues,
  sameAcceptedArchitectureChange,
  type ArchitectureRefreshSignalV1,
  type ProjectionExpectedSnapshotV1,
  type ProjectionRequestV1,
  type ProjectionResultV1,
  type Sha256Digest,
} from '../../core/architecture/projection';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { captureArchitectureProjectionSnapshot, readArchitectureProjectionApply, runArchitectureProjection, type ArchctxProviderOptions } from './archctx-provider';
import {
  ARCHITECTURE_PROJECTION_RUNTIME_ROOT,
  architectureProjectionJobState,
  completeArchitectureProjectionDeadLetterAcceptance,
  completeArchitectureProjectionDeadLetterReconciliation,
} from './projection-jobs';
import { architectureRefreshEvidenceDigest, consumeArchitectureRefreshSignals, type RunArchitectureRefreshActions } from './refresh-consumer';

const CANDIDATE_VERSION = 'repo-harness.architecture-projection-acceptance-candidate/v1' as const;
const RECEIPT_VERSION = 'repo-harness.architecture-projection-acceptance-receipt/v1' as const;
const PENDING_VERSION = 'repo-harness.architecture-projection-acceptance-pending/v1' as const;
const RECONCILIATION_RECEIPT_VERSION = 'repo-harness.architecture-projection-reconciliation-receipt/v1' as const;
const STALE_RETIREMENT_RECEIPT_VERSION = 'repo-harness.architecture-projection-stale-retirement-receipt/v1' as const;
const STATE_VERSION = 'repo-harness.architecture-projection-acceptance-state/v1' as const;
const CANDIDATES = `${ARCHITECTURE_PROJECTION_RUNTIME_ROOT}/acceptance-candidates`;
const RECEIPTS = `${ARCHITECTURE_PROJECTION_RUNTIME_ROOT}/acceptance-receipts`;
const PENDING = `${ARCHITECTURE_PROJECTION_RUNTIME_ROOT}/acceptance-pending`;
const RECONCILIATION_RECEIPTS = `${ARCHITECTURE_PROJECTION_RUNTIME_ROOT}/reconciliation-receipts`;
const STALE_RETIREMENT_RECEIPTS = `${ARCHITECTURE_PROJECTION_RUNTIME_ROOT}/stale-retirement-receipts`;
const LOCK_PATH = `${ARCHITECTURE_PROJECTION_RUNTIME_ROOT}/locks/acceptance`;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const APPROVAL_REFERENCE = /^[a-zA-Z0-9_.:-]+$/;

export interface ArchitectureProjectionAcceptanceCandidateV1 {
  readonly schemaVersion: typeof CANDIDATE_VERSION;
  readonly signalId: Sha256Digest;
  readonly jobId: string | null;
  readonly request: ProjectionRequestV1;
  readonly result: ProjectionResultV1;
  readonly candidateDigest: Sha256Digest;
}

export interface ArchitectureProjectionAcceptanceReceiptV1 {
  readonly schemaVersion: typeof RECEIPT_VERSION;
  readonly signalId: Sha256Digest;
  readonly approvalReference: string;
  readonly acceptedChange: NonNullable<ProjectionRequestV1['acceptedChange']>;
  readonly candidateDigest: Sha256Digest;
  readonly request: ProjectionRequestV1;
  readonly result: ProjectionResultV1;
  readonly refreshReceiptDigests: readonly Sha256Digest[];
  readonly receiptDigest: Sha256Digest;
}

interface ArchitectureProjectionAcceptancePendingV1 {
  readonly schemaVersion: typeof PENDING_VERSION;
  readonly signalId: Sha256Digest;
  readonly approvalReference: string;
  readonly candidateDigest: Sha256Digest;
  readonly request: ProjectionRequestV1;
  readonly result?: ProjectionResultV1;
  /** Snapshot observed right after the latest durable refresh checkpoint of this result. */
  readonly refreshCheckpoint?: ArchitectureProjectionRefreshCheckpointV1;
  readonly pendingDigest: Sha256Digest;
}

interface ArchitectureProjectionRefreshCheckpointV1 {
  readonly snapshot: ProjectionExpectedSnapshotV1;
  readonly evidenceDigest: Sha256Digest;
}

export interface ArchitectureProjectionReconciliationReceiptV1 {
  readonly schemaVersion: typeof RECONCILIATION_RECEIPT_VERSION;
  readonly signalId: Sha256Digest;
  readonly candidateDigest: Sha256Digest;
  readonly request: ProjectionRequestV1;
  readonly result: ProjectionResultV1;
  readonly receiptDigest: Sha256Digest;
}

export interface ArchitectureProjectionStaleRetirementReceiptV1 {
  readonly schemaVersion: typeof STALE_RETIREMENT_RECEIPT_VERSION;
  readonly signalId: Sha256Digest;
  readonly approvalReference: string;
  readonly candidateDigest: Sha256Digest;
  readonly staleHeadSha: string;
  readonly request: ProjectionRequestV1;
  readonly result: ProjectionResultV1;
  readonly receiptDigest: Sha256Digest;
}

export interface ArchitectureProjectionAcceptanceStateV1 {
  readonly schemaVersion: typeof STATE_VERSION;
  readonly candidates: number;
  readonly receipts: number;
  readonly reconciliationReceipts: number;
  readonly staleRetirementReceipts: number;
  readonly unresolvedCandidates: number;
  readonly invalidArtifacts: number;
}

export interface ArchitectureProjectionAcceptanceOptions extends ArchctxProviderOptions {
  readonly adoptionPlanId?: string;
  readonly recover?: boolean;
  readonly captureSnapshot?: (repoRoot: string) => ProjectionExpectedSnapshotV1;
  readonly runProjection?: (request: ProjectionRequestV1, repoRoot: string) => ProjectionResultV1;
  readonly runReadback?: (request: ProjectionRequestV1, repoRoot: string) => ProjectionApplyReadbackV1;
  readonly runRefreshActions?: RunArchitectureRefreshActions;
  readonly now?: Date;
}

export function recordArchitectureProjectionAcceptanceCandidates(
  repoRoot: string,
  request: ProjectionRequestV1,
  result: ProjectionResultV1,
  options: { jobId?: string } = {},
): ArchitectureProjectionAcceptanceCandidateV1[] {
  const root = realpathSync(resolve(repoRoot));
  const signals = result.refreshSignals.filter(isUnresolvedMajorCandidate);
  return withExclusiveDirectoryLock(root, LOCK_PATH, () => signals.map((signal) => {
    const body = { schemaVersion: CANDIDATE_VERSION, signalId: signal.signalId, jobId: options.jobId ?? null, request, result };
    const candidate: ArchitectureProjectionAcceptanceCandidateV1 = {
      ...body,
      candidateDigest: digestProjectionJson(body),
    };
    assertCandidate(candidate);
    const path = artifactPath(root, CANDIDATES, signal.signalId);
    if (existsSync(path)) {
      const existing = readCandidateFile(path);
      if (existing.candidateDigest !== candidate.candidateDigest) {
        throw new Error(`architecture acceptance candidate identity conflict: ${signal.signalId}`);
      }
      return existing;
    }
    atomicJson(path, candidate);
    return candidate;
  }));
}

export function acceptArchitectureProjectionCandidate(
  repoRoot: string,
  signalId: string,
  approvalReference: string,
  options: ArchitectureProjectionAcceptanceOptions = {},
): ArchitectureProjectionAcceptanceReceiptV1 {
  assertSignalId(signalId);
  if (!APPROVAL_REFERENCE.test(approvalReference)) {
    throw new Error('architecture acceptance approval reference must be a non-empty event identity containing only letters, digits, . _ : or -');
  }
  const root = realpathSync(resolve(repoRoot));
  return withExclusiveDirectoryLock(root, LOCK_PATH, () => {
    const candidate = readCandidate(root, signalId);
    const existingPath = artifactPath(root, RECEIPTS, signalId);
    const reconciliationPath = artifactPath(root, RECONCILIATION_RECEIPTS, signalId);
    const retirementPath = artifactPath(root, STALE_RETIREMENT_RECEIPTS, signalId);
    const pendingPath = artifactPath(root, PENDING, signalId);
    if (existsSync(reconciliationPath)) {
      readReconciliationReceiptFile(reconciliationPath, candidate);
      throw new Error(`architecture projection candidate is already resolved by reconciliation: ${signalId}`);
    }
    if (existsSync(retirementPath)) {
      readStaleRetirementReceiptFile(retirementPath, candidate, root);
      throw new Error(`architecture projection candidate is already resolved by stale retirement: ${signalId}`);
    }
    if (existsSync(existingPath)) {
      const existing = readReceiptFile(existingPath, candidate);
      if (existing.approvalReference !== approvalReference) {
        throw new Error(`architecture acceptance already recorded with a different approval reference: ${signalId}`);
      }
      projectAcceptedDeadLetter(root, candidate, existing, options.now);
      return existing;
    }

    const signal = candidateSignal(candidate);
    const capture = options.captureSnapshot ?? captureArchitectureProjectionSnapshot;
    const current = capture(root);
    const acceptedChange = acceptedChangeFor(signal, approvalReference);
    const completeAcceptance = (request: ProjectionRequestV1, result: ProjectionResultV1): ArchitectureProjectionAcceptanceReceiptV1 => {
      const refreshReceipts = consumeArchitectureRefreshSignals(root, result.refreshSignals, request.changedPaths, {
        env: options.env,
        run: options.runRefreshActions,
        now: options.now,
        deadlineMs: options.deadlineMs,
        nowMs: options.nowMs,
        onCheckpoint: request.mode === 'apply'
          ? () => atomicJson(pendingPath, pendingFor(candidate, approvalReference, request, result, {
              snapshot: capture(root),
              evidenceDigest: architectureRefreshEvidenceDigest(root, result.refreshSignals),
            }))
          : undefined,
      });
      const body = {
        schemaVersion: RECEIPT_VERSION,
        signalId: signal.signalId,
        approvalReference,
        acceptedChange,
        candidateDigest: candidate.candidateDigest,
        request,
        result,
        refreshReceiptDigests: refreshReceipts.map((entry) => entry.receiptDigest).sort(),
      };
      const receipt: ArchitectureProjectionAcceptanceReceiptV1 = { ...body, receiptDigest: digestProjectionJson(body) };
      assertReceipt(receipt, candidate);
      atomicJson(existingPath, receipt);
      projectAcceptedDeadLetter(root, candidate, receipt, options.now);
      return receipt;
    };
    if (!options.adoptionPlanId && existsSync(pendingPath)) {
      const resumed = refreshOwnedResume(root, readPendingFile(pendingPath, candidate), candidate, signal, approvalReference, current);
      if (resumed) return completeAcceptance(resumed.request, resumed.result);
    }
    assertFreshSignal(signal, candidate.request.expected, current);
    const acceptanceRequest = (adoptionPlanId?: string): ProjectionRequestV1 => ({
      schemaVersion: PROJECTION_REQUEST_VERSION,
      requestId: `repo-harness.accept.${signal.signalId.slice('sha256:'.length, 'sha256:'.length + 24)}`,
      profile: candidate.request.profile,
      mode: adoptionPlanId ? 'adopt' : 'apply',
      targets: [...candidate.request.targets],
      changedPaths: [...candidate.request.changedPaths],
      expected: current,
      acceptedChange,
      ...(adoptionPlanId ? { adoptionPlanId } : {}),
    });
    const request = acceptanceRequest(options.adoptionPlanId);
    const issues = projectionRequestIssues(request);
    if (issues.length > 0) throw new Error(`architecture acceptance request invalid: ${issues.join('; ')}`);
    const hadPending = existsSync(pendingPath);
    const readCommittedApply = (applyRequest: ProjectionRequestV1): ProjectionApplyReadbackV1 => {
      const readback = options.runReadback
        ? options.runReadback(applyRequest, root)
        : readArchitectureProjectionApply(applyRequest, root, options);
      const afterReadback = (options.captureSnapshot ?? captureArchitectureProjectionSnapshot)(root);
      if (digestProjectionJson(afterReadback) !== digestProjectionJson(current)) {
        throw new Error('architecture acceptance local snapshot changed during readback');
      }
      return readback;
    };
    let result: ProjectionResultV1;
    if (request.mode === 'adopt') {
      if (options.recover) {
        throw new Error('architecture acceptance recovery does not support adoption; a provider readback contract for adopt is required');
      }
      if (hadPending) {
        // An apply intent without a recorded result may switch to an approved
        // adoption only when the provider proves that exact apply never committed.
        const pending = readPendingFile(pendingPath, candidate);
        if (pending.approvalReference !== approvalReference) {
          throw new Error(`architecture acceptance pending with a different approval reference: ${signalId}`);
        }
        const committedApply = 'architecture acceptance cannot switch to adoption after a committed apply; resume without an adoption plan';
        if (pending.result) throw new Error(committedApply);
        if (digestProjectionJson(pending.request) !== digestProjectionJson(acceptanceRequest())) {
          throw new Error('architecture acceptance pending request differs from current candidate and snapshot');
        }
        const readback = readCommittedApply(pending.request);
        if (readback.schemaVersion !== 'archcontext.projection-apply-absence/v1') throw new Error(committedApply);
        assertProjectionApplyAbsence(readback, pending.request);
        if (!sameExpected(current, readback.current, readback.current.repositoryId)) {
          throw new Error('architecture acceptance absence/current snapshot identity mismatch');
        }
      }
      result = options.runProjection
        ? options.runProjection(request, root)
        : runArchitectureProjection(request, root, options);
      assertAcceptedResult(result, request, acceptedChange);
    } else {
      let pending: ArchitectureProjectionAcceptancePendingV1 | undefined;
      if (hadPending) {
        pending = readPendingFile(pendingPath, candidate);
        if (pending.approvalReference !== approvalReference) {
          throw new Error(`architecture acceptance pending with a different approval reference: ${signalId}`);
        }
        if (digestProjectionJson(pending.request) !== digestProjectionJson(request)) {
          throw new Error('architecture acceptance pending request differs from current candidate and snapshot');
        }
      } else if (!options.recover) {
        pending = pendingFor(candidate, approvalReference, request);
        atomicJson(pendingPath, pending);
      }

      if (hadPending || options.recover) {
        const readback = readCommittedApply(request);
        if (readback.schemaVersion === 'archcontext.projection-apply-absence/v1') {
          assertProjectionApplyAbsence(readback, request);
          if (!sameExpected(current, readback.current, readback.current.repositoryId)) {
            throw new Error('architecture acceptance absence/current snapshot identity mismatch');
          }
          if (pending?.result) throw new Error('architecture acceptance provider absence contradicts persisted result');
          if (options.recover) throw new Error('architecture acceptance explicit recovery found no committed provider apply');
          result = options.runProjection
            ? options.runProjection(request, root)
            : runArchitectureProjection(request, root, options);
          assertAcceptedResult(result, request, acceptedChange);
          pending = pendingFor(candidate, approvalReference, request, result);
          atomicJson(pendingPath, pending);
        } else {
          assertProjectionApplyReadbackResult(readback, request);
          if (!sameExpected(current, readback.current.snapshot, readback.current.snapshot.repositoryId)) {
            throw new Error('architecture acceptance readback/current snapshot identity mismatch');
          }
          result = assertProjectionResult(readback.receipt.result, request.requestId);
          assertAcceptedResult(result, request, acceptedChange);
          if (pending?.result && digestProjectionJson(pending.result) !== digestProjectionJson(result)) {
            throw new Error('architecture acceptance pending result differs from committed provider receipt');
          }
          if (!pending?.result) {
            pending = pendingFor(candidate, approvalReference, request, result);
            atomicJson(pendingPath, pending);
          }
        }
      } else {
        result = options.runProjection
          ? options.runProjection(request, root)
          : runArchitectureProjection(request, root, options);
        assertAcceptedResult(result, request, acceptedChange);
        pending = pendingFor(candidate, approvalReference, request, result);
        atomicJson(pendingPath, pending);
      }
    }
    return completeAcceptance(request, result);
  });
}

/**
 * A committed apply whose refresh stopped after checkpointed actions changed the
 * local snapshot resumes from its persisted provider result without readback,
 * but only when the current snapshot and refresh evidence are exactly those
 * recorded at the latest checkpoint. Any other change fails closed.
 */
function refreshOwnedResume(
  root: string,
  pending: ArchitectureProjectionAcceptancePendingV1,
  candidate: ArchitectureProjectionAcceptanceCandidateV1,
  signal: ArchitectureRefreshSignalV1,
  approvalReference: string,
  current: ProjectionExpectedSnapshotV1,
): { request: ProjectionRequestV1; result: ProjectionResultV1 } | undefined {
  if (!pending.result || !pending.refreshCheckpoint
    || digestProjectionJson(current) === digestProjectionJson(pending.request.expected)) {
    return undefined;
  }
  if (pending.approvalReference !== approvalReference) {
    throw new Error(`architecture acceptance pending with a different approval reference: ${candidate.signalId}`);
  }
  assertFreshSignal(signal, candidate.request.expected, pending.request.expected);
  if (digestProjectionJson(current) !== digestProjectionJson(pending.refreshCheckpoint.snapshot)
    || architectureRefreshEvidenceDigest(root, pending.result.refreshSignals) !== pending.refreshCheckpoint.evidenceDigest) {
    throw new Error('architecture acceptance snapshot changed outside the checkpointed refresh of this candidate');
  }
  return { request: pending.request, result: pending.result };
}

export function reconcileArchitectureProjectionCandidate(
  repoRoot: string,
  signalId: string,
  options: ArchitectureProjectionAcceptanceOptions = {},
): ArchitectureProjectionReconciliationReceiptV1 {
  assertSignalId(signalId);
  const root = realpathSync(resolve(repoRoot));
  return withExclusiveDirectoryLock(root, LOCK_PATH, () => {
    const candidate = readCandidate(root, signalId);
    const acceptancePath = artifactPath(root, RECEIPTS, signalId);
    const reconciliationPath = artifactPath(root, RECONCILIATION_RECEIPTS, signalId);
    const retirementPath = artifactPath(root, STALE_RETIREMENT_RECEIPTS, signalId);
    if (existsSync(acceptancePath)) {
      readReceiptFile(acceptancePath, candidate);
      throw new Error(`architecture projection candidate is already resolved by acceptance: ${signalId}`);
    }
    if (existsSync(retirementPath)) {
      readStaleRetirementReceiptFile(retirementPath, candidate, root);
      throw new Error(`architecture projection candidate is already resolved by stale retirement: ${signalId}`);
    }
    if (existsSync(reconciliationPath)) {
      const existing = readReconciliationReceiptFile(reconciliationPath, candidate);
      projectReconciledDeadLetter(root, candidate, existing, options.now);
      return existing;
    }

    assertProofOnlyCandidate(candidate);
    const current = (options.captureSnapshot ?? captureArchitectureProjectionSnapshot)(root);
    const request: ProjectionRequestV1 = {
      schemaVersion: PROJECTION_REQUEST_VERSION,
      requestId: `repo-harness.reconcile.${signalId.slice('sha256:'.length, 'sha256:'.length + 24)}`,
      profile: candidate.request.profile,
      mode: 'check',
      targets: [...candidate.request.targets],
      changedPaths: [...candidate.request.changedPaths],
      expected: current,
    };
    const issues = projectionRequestIssues(request);
    if (issues.length > 0) throw new Error(`architecture reconciliation request invalid: ${issues.join('; ')}`);
    const result = options.runProjection
      ? options.runProjection(request, root)
      : runArchitectureProjection(request, root, options);
    assertCleanCurrentProof(request, result);
    const body = {
      schemaVersion: RECONCILIATION_RECEIPT_VERSION,
      signalId: candidate.signalId,
      candidateDigest: candidate.candidateDigest,
      request,
      result,
    };
    const receipt: ArchitectureProjectionReconciliationReceiptV1 = {
      ...body,
      receiptDigest: digestProjectionJson(body),
    };
    assertReconciliationReceipt(receipt, candidate);
    atomicJson(reconciliationPath, receipt);
    projectReconciledDeadLetter(root, candidate, receipt, options.now);
    return receipt;
  });
}

export function retireStaleArchitectureProjectionCandidate(
  repoRoot: string,
  signalId: string,
  approvalReference: string,
  options: ArchitectureProjectionAcceptanceOptions = {},
): ArchitectureProjectionStaleRetirementReceiptV1 {
  assertSignalId(signalId);
  assertApprovalReference(approvalReference, 'stale retirement');
  const root = realpathSync(resolve(repoRoot));
  return withExclusiveDirectoryLock(root, LOCK_PATH, () => {
    const candidate = readCandidate(root, signalId);
    const acceptancePath = artifactPath(root, RECEIPTS, signalId);
    const reconciliationPath = artifactPath(root, RECONCILIATION_RECEIPTS, signalId);
    const retirementPath = artifactPath(root, STALE_RETIREMENT_RECEIPTS, signalId);
    if (existsSync(acceptancePath)) {
      readReceiptFile(acceptancePath, candidate);
      throw new Error(`architecture projection candidate is already resolved by acceptance: ${signalId}`);
    }
    if (existsSync(reconciliationPath)) {
      readReconciliationReceiptFile(reconciliationPath, candidate);
      throw new Error(`architecture projection candidate is already resolved by reconciliation: ${signalId}`);
    }
    if (existsSync(retirementPath)) {
      const existing = readStaleRetirementReceiptFile(retirementPath, candidate, root);
      if (existing.approvalReference !== approvalReference) {
        throw new Error(`architecture stale retirement already recorded with a different approval reference: ${signalId}`);
      }
      return existing;
    }

    assertSemanticCandidate(candidate);
    if (candidate.jobId && architectureProjectionJobState(root, candidate.jobId) !== 'receipt') {
      throw new Error(`architecture stale retirement requires a terminal job receipt: ${candidate.jobId}`);
    }
    const current = (options.captureSnapshot ?? captureArchitectureProjectionSnapshot)(root);
    const staleHeadSha = candidate.request.expected.headSha;
    assertStrictAncestor(root, staleHeadSha, current.headSha);
    const request: ProjectionRequestV1 = {
      schemaVersion: PROJECTION_REQUEST_VERSION,
      requestId: `repo-harness.retire-stale.${signalId.slice('sha256:'.length, 'sha256:'.length + 24)}`,
      profile: candidate.request.profile,
      mode: 'check',
      targets: [...candidate.request.targets],
      changedPaths: [...candidate.request.changedPaths],
      expected: current,
    };
    const issues = projectionRequestIssues(request);
    if (issues.length > 0) throw new Error(`architecture stale retirement request invalid: ${issues.join('; ')}`);
    const result = options.runProjection
      ? options.runProjection(request, root)
      : runArchitectureProjection(request, root, options);
    assertCleanCurrentProof(request, result);
    const body = {
      schemaVersion: STALE_RETIREMENT_RECEIPT_VERSION,
      signalId: candidate.signalId,
      approvalReference,
      candidateDigest: candidate.candidateDigest,
      staleHeadSha,
      request,
      result,
    };
    const receipt: ArchitectureProjectionStaleRetirementReceiptV1 = {
      ...body,
      receiptDigest: digestProjectionJson(body),
    };
    assertStaleRetirementReceipt(receipt, candidate, root);
    atomicJson(retirementPath, receipt);
    return receipt;
  });
}

export function inspectArchitectureProjectionAcceptanceState(repoRoot: string): ArchitectureProjectionAcceptanceStateV1 {
  const root = realpathSync(resolve(repoRoot));
  return withExclusiveDirectoryLock(root, LOCK_PATH, () => {
    const candidateNames = jsonNames(root, CANDIDATES);
    const receiptNames = jsonNames(root, RECEIPTS);
    const reconciliationNames = jsonNames(root, RECONCILIATION_RECEIPTS);
    const retirementNames = jsonNames(root, STALE_RETIREMENT_RECEIPTS);
    const receiptSet = new Set(receiptNames);
    const reconciliationSet = new Set(reconciliationNames);
    const retirementSet = new Set(retirementNames);
    let unresolvedCandidates = 0;
    let invalidArtifacts = 0;
    for (const name of candidateNames) {
      try {
        const candidate = readCandidateFile(join(root, CANDIDATES, name));
        const receiptName = `${candidate.signalId.slice('sha256:'.length)}.json`;
        const hasAcceptance = receiptSet.has(receiptName);
        const hasReconciliation = reconciliationSet.has(receiptName);
        const hasRetirement = retirementSet.has(receiptName);
        if (!hasAcceptance && !hasReconciliation && !hasRetirement) {
          unresolvedCandidates += 1;
          continue;
        }
        if (hasAcceptance) receiptSet.delete(receiptName);
        if (hasReconciliation) reconciliationSet.delete(receiptName);
        if (hasRetirement) retirementSet.delete(receiptName);
        if (Number(hasAcceptance) + Number(hasReconciliation) + Number(hasRetirement) !== 1) {
          throw new Error('architecture projection candidate has conflicting resolution receipts');
        }
        if (hasAcceptance) {
          readReceiptFile(join(root, RECEIPTS, receiptName), candidate);
        } else if (hasReconciliation) {
          readReconciliationReceiptFile(join(root, RECONCILIATION_RECEIPTS, receiptName), candidate);
        } else {
          readStaleRetirementReceiptFile(join(root, STALE_RETIREMENT_RECEIPTS, receiptName), candidate, root);
        }
      } catch {
        invalidArtifacts += 1;
        unresolvedCandidates += 1;
      }
    }
    invalidArtifacts += receiptSet.size + reconciliationSet.size + retirementSet.size;
    return {
      schemaVersion: STATE_VERSION,
      candidates: candidateNames.length,
      receipts: receiptNames.length,
      reconciliationReceipts: reconciliationNames.length,
      staleRetirementReceipts: retirementNames.length,
      unresolvedCandidates,
      invalidArtifacts,
    };
  });
}

export function readArchitectureProjectionAcceptanceReceipt(
  repoRoot: string,
  signalId: string,
): ArchitectureProjectionAcceptanceReceiptV1 {
  assertSignalId(signalId);
  const root = realpathSync(resolve(repoRoot));
  return withExclusiveDirectoryLock(root, LOCK_PATH, () => {
    const candidate = readCandidate(root, signalId);
    const path = artifactPath(root, RECEIPTS, signalId);
    if (!existsSync(path)) throw new Error(`architecture acceptance receipt is missing: ${signalId}`);
    return readReceiptFile(path, candidate);
  });
}

function readCandidate(root: string, signalId: string): ArchitectureProjectionAcceptanceCandidateV1 {
  const path = artifactPath(root, CANDIDATES, signalId);
  if (!existsSync(path)) throw new Error(`architecture acceptance candidate is missing: ${signalId}`);
  return readCandidateFile(path);
}

function pendingFor(
  candidate: ArchitectureProjectionAcceptanceCandidateV1,
  approvalReference: string,
  request: ProjectionRequestV1,
  result?: ProjectionResultV1,
  refreshCheckpoint?: ArchitectureProjectionRefreshCheckpointV1,
): ArchitectureProjectionAcceptancePendingV1 {
  const body = {
    schemaVersion: PENDING_VERSION,
    signalId: candidate.signalId,
    approvalReference,
    candidateDigest: candidate.candidateDigest,
    request,
    ...(result ? { result } : {}),
    ...(result && refreshCheckpoint ? { refreshCheckpoint } : {}),
  };
  return { ...body, pendingDigest: digestProjectionJson(body) };
}

function readPendingFile(path: string, candidate: ArchitectureProjectionAcceptanceCandidateV1): ArchitectureProjectionAcceptancePendingV1 {
  const pending = JSON.parse(readFileSync(path, 'utf8')) as ArchitectureProjectionAcceptancePendingV1;
  if (pending.schemaVersion !== PENDING_VERSION || pending.signalId !== candidate.signalId
    || pending.candidateDigest !== candidate.candidateDigest || !APPROVAL_REFERENCE.test(pending.approvalReference)) {
    throw new Error('architecture acceptance pending candidate/approval identity mismatch');
  }
  if (!pending.request || projectionRequestIssues(pending.request).length > 0 || !pending.request.acceptedChange
    || !sameAcceptedArchitectureChange(pending.request.acceptedChange, acceptedChangeFor(candidateSignal(candidate), pending.approvalReference))) {
    throw new Error('architecture acceptance pending request invalid');
  }
  const { pendingDigest: _digest, ...body } = pending;
  if (digestProjectionJson(body) !== pending.pendingDigest) throw new Error('architecture acceptance pending digest mismatch');
  if (pending.result) assertAcceptedResult(pending.result, pending.request, pending.request.acceptedChange);
  if (pending.refreshCheckpoint !== undefined) {
    const checkpoint = pending.refreshCheckpoint;
    if (!pending.result || !checkpoint || !DIGEST.test(checkpoint.evidenceDigest) || !checkpoint.snapshot
      || checkpoint.snapshot.repositoryId !== pending.request.expected.repositoryId
      || checkpoint.snapshot.workspaceId !== pending.request.expected.workspaceId
      || !/^[a-f0-9]{40}$/.test(checkpoint.snapshot.headSha) || !DIGEST.test(checkpoint.snapshot.worktreeDigest)
      || Object.keys(checkpoint.snapshot).length !== 4 || Object.keys(checkpoint).length !== 2) {
      throw new Error('architecture acceptance pending refresh checkpoint invalid');
    }
  }
  return pending;
}

function assertAcceptedResult(
  value: ProjectionResultV1,
  request: ProjectionRequestV1,
  acceptedChange: NonNullable<ProjectionRequestV1['acceptedChange']>,
): void {
  const result = assertProjectionResult(value, request.requestId);
  if (result.status !== 'applied' && !(request.mode === 'adopt' && result.status === 'noop')) {
    throw new Error(`architecture acceptance apply did not complete: ${result.status}`);
  }
  if (!result.applyReceipt || !sameAcceptedArchitectureChange(result.applyReceipt.acceptedChange, acceptedChange)
    || result.applyReceipt.repositoryId !== request.expected.repositoryId
    || result.applyReceipt.workspaceId !== request.expected.workspaceId) {
    throw new Error('architecture acceptance apply receipt does not bind the accepted change and workspace');
  }
  if (!sameExpected(request.expected, result.inputSnapshot, result.inputSnapshot.repositoryId)
    || !sameExpected(request.expected, result.outputSnapshot, result.outputSnapshot.repositoryId)) {
    throw new Error('architecture acceptance apply result snapshot mismatch');
  }
  if (result.refreshSignals.some((entry) => entry.mode === 'human-action-required')) {
    throw new Error('architecture acceptance apply returned another unresolved major change');
  }
}

function readCandidateFile(path: string): ArchitectureProjectionAcceptanceCandidateV1 {
  const candidate = JSON.parse(readFileSync(path, 'utf8')) as ArchitectureProjectionAcceptanceCandidateV1;
  assertCandidate(candidate);
  return candidate;
}

function readReceiptFile(path: string, candidate: ArchitectureProjectionAcceptanceCandidateV1): ArchitectureProjectionAcceptanceReceiptV1 {
  const receipt = JSON.parse(readFileSync(path, 'utf8')) as ArchitectureProjectionAcceptanceReceiptV1;
  assertReceipt(receipt, candidate);
  return receipt;
}

function readReconciliationReceiptFile(
  path: string,
  candidate: ArchitectureProjectionAcceptanceCandidateV1,
): ArchitectureProjectionReconciliationReceiptV1 {
  const receipt = JSON.parse(readFileSync(path, 'utf8')) as ArchitectureProjectionReconciliationReceiptV1;
  assertReconciliationReceipt(receipt, candidate);
  return receipt;
}

function readStaleRetirementReceiptFile(
  path: string,
  candidate: ArchitectureProjectionAcceptanceCandidateV1,
  repoRoot: string,
): ArchitectureProjectionStaleRetirementReceiptV1 {
  const receipt = JSON.parse(readFileSync(path, 'utf8')) as ArchitectureProjectionStaleRetirementReceiptV1;
  assertStaleRetirementReceipt(receipt, candidate, repoRoot);
  return receipt;
}

function assertCandidate(candidate: ArchitectureProjectionAcceptanceCandidateV1): void {
  if (candidate.schemaVersion !== CANDIDATE_VERSION) throw new Error('architecture acceptance candidate schema mismatch');
  assertSignalId(candidate.signalId);
  if (candidate.jobId !== null && !/^job-[a-f0-9]{24}$/.test(candidate.jobId)) throw new Error('architecture acceptance candidate job id invalid');
  const requestIssues = projectionRequestIssues(candidate.request);
  const resultIssues = projectionResultIssues(candidate.result);
  if (requestIssues.length > 0 || resultIssues.length > 0) {
    throw new Error(`architecture acceptance candidate invalid: ${[...requestIssues, ...resultIssues].join('; ')}`);
  }
  const signal = candidateSignal(candidate);
  if (candidate.request.acceptedChange) throw new Error('architecture acceptance candidate request must not already contain an accepted change');
  if (candidate.jobId && candidate.request.requestId !== `repo-harness.projection.${candidate.jobId}`) {
    throw new Error('architecture acceptance candidate request/job identity mismatch');
  }
  if (!sameExpected(candidate.request.expected, signal.worktree, signal.repository.repositoryId)) {
    throw new Error('architecture acceptance candidate request/signal identity mismatch');
  }
  if (!sameExpected(candidate.request.expected, candidate.result.inputSnapshot, candidate.result.inputSnapshot.repositoryId)) {
    throw new Error('architecture acceptance candidate request/result identity mismatch');
  }
  if (candidate.result.requestId !== candidate.request.requestId) {
    throw new Error('architecture acceptance candidate request/result id mismatch');
  }
  const { candidateDigest: _digest, ...body } = candidate;
  if (digestProjectionJson(body) !== candidate.candidateDigest) throw new Error('architecture acceptance candidate digest mismatch');
}

function assertReceipt(receipt: ArchitectureProjectionAcceptanceReceiptV1, candidate: ArchitectureProjectionAcceptanceCandidateV1): void {
  if (receipt.schemaVersion !== RECEIPT_VERSION) throw new Error('architecture acceptance receipt schema mismatch');
  if (receipt.signalId !== candidate.signalId || receipt.candidateDigest !== candidate.candidateDigest) {
    throw new Error('architecture acceptance receipt candidate binding mismatch');
  }
  if (!APPROVAL_REFERENCE.test(receipt.approvalReference) || receipt.acceptedChange.eventId !== receipt.approvalReference) {
    throw new Error('architecture acceptance receipt approval identity mismatch');
  }
  const expected = acceptedChangeFor(candidateSignal(candidate), receipt.approvalReference);
  if (!sameAcceptedArchitectureChange(receipt.acceptedChange, expected)
    || !receipt.request.acceptedChange
    || !sameAcceptedArchitectureChange(receipt.request.acceptedChange, expected)
    || !receipt.result.applyReceipt
    || !sameAcceptedArchitectureChange(receipt.result.applyReceipt.acceptedChange, expected)) {
    throw new Error('architecture acceptance receipt accepted-change binding mismatch');
  }
  if (projectionRequestIssues(receipt.request).length > 0 || projectionResultIssues(receipt.result).length > 0) {
    throw new Error('architecture acceptance receipt request/result invalid');
  }
  if ((receipt.request.mode !== 'apply' && receipt.request.mode !== 'adopt')
    || receipt.request.profile !== candidate.request.profile
    || receipt.request.targets.join('\0') !== candidate.request.targets.join('\0')
    || receipt.request.changedPaths.join('\0') !== candidate.request.changedPaths.join('\0')
    || receipt.result.requestId !== receipt.request.requestId
    || !sameExpected(receipt.request.expected, receipt.result.inputSnapshot, receipt.result.inputSnapshot.repositoryId)) {
    throw new Error('architecture acceptance receipt request surface mismatch');
  }
  if (receipt.result.status !== 'applied' && receipt.result.status !== 'noop') throw new Error('architecture acceptance receipt result is not complete');
  if (receipt.result.refreshSignals.some((signal) => signal.mode === 'human-action-required')) throw new Error('architecture acceptance receipt preserves an unresolved signal');
  if (!sortedUniqueDigests(receipt.refreshReceiptDigests)) throw new Error('architecture acceptance receipt refresh digests invalid');
  const { receiptDigest: _digest, ...body } = receipt;
  if (digestProjectionJson(body) !== receipt.receiptDigest) throw new Error('architecture acceptance receipt digest mismatch');
}

function assertReconciliationReceipt(
  receipt: ArchitectureProjectionReconciliationReceiptV1,
  candidate: ArchitectureProjectionAcceptanceCandidateV1,
): void {
  if (receipt.schemaVersion !== RECONCILIATION_RECEIPT_VERSION) {
    throw new Error('architecture reconciliation receipt schema mismatch');
  }
  if (receipt.signalId !== candidate.signalId || receipt.candidateDigest !== candidate.candidateDigest) {
    throw new Error('architecture reconciliation receipt candidate binding mismatch');
  }
  assertProofOnlyCandidate(candidate);
  if (projectionRequestIssues(receipt.request).length > 0
    || receipt.request.profile !== candidate.request.profile
    || receipt.request.targets.join('\0') !== candidate.request.targets.join('\0')
    || receipt.request.changedPaths.join('\0') !== candidate.request.changedPaths.join('\0')) {
    throw new Error('architecture reconciliation receipt request surface mismatch');
  }
  assertCleanCurrentProof(receipt.request, receipt.result);
  const { receiptDigest: _digest, ...body } = receipt;
  if (digestProjectionJson(body) !== receipt.receiptDigest) {
    throw new Error('architecture reconciliation receipt digest mismatch');
  }
}

function assertStaleRetirementReceipt(
  receipt: ArchitectureProjectionStaleRetirementReceiptV1,
  candidate: ArchitectureProjectionAcceptanceCandidateV1,
  repoRoot: string,
): void {
  if (receipt.schemaVersion !== STALE_RETIREMENT_RECEIPT_VERSION) {
    throw new Error('architecture stale retirement receipt schema mismatch');
  }
  if (receipt.signalId !== candidate.signalId || receipt.candidateDigest !== candidate.candidateDigest) {
    throw new Error('architecture stale retirement receipt candidate binding mismatch');
  }
  assertApprovalReference(receipt.approvalReference, 'stale retirement receipt');
  assertSemanticCandidate(candidate);
  if (receipt.staleHeadSha !== candidate.request.expected.headSha
    || projectionRequestIssues(receipt.request).length > 0
    || receipt.request.profile !== candidate.request.profile
    || receipt.request.targets.join('\0') !== candidate.request.targets.join('\0')
    || receipt.request.changedPaths.join('\0') !== candidate.request.changedPaths.join('\0')) {
    throw new Error('architecture stale retirement receipt request surface mismatch');
  }
  assertStrictAncestor(repoRoot, receipt.staleHeadSha, receipt.request.expected.headSha);
  assertCleanCurrentProof(receipt.request, receipt.result);
  const { receiptDigest: _digest, ...body } = receipt;
  if (digestProjectionJson(body) !== receipt.receiptDigest) {
    throw new Error('architecture stale retirement receipt digest mismatch');
  }
}

function assertProofOnlyCandidate(candidate: ArchitectureProjectionAcceptanceCandidateV1): void {
  const reasons = candidateSignal(candidate).reasonCodes;
  if (reasons.length !== 1 || reasons[0] !== 'verified-flow-proof-changed') {
    throw new Error('architecture reconciliation requires an exact verified-flow-proof-changed candidate');
  }
}

function assertSemanticCandidate(candidate: ArchitectureProjectionAcceptanceCandidateV1): void {
  const reasons = candidateSignal(candidate).reasonCodes;
  if (reasons.length === 1 && reasons[0] === 'verified-flow-proof-changed') {
    throw new Error('architecture stale retirement requires a semantic candidate; use reconciliation for proof-only candidates');
  }
}

function assertStrictAncestor(repoRoot: string, staleHeadSha: string, currentHeadSha: string): void {
  if (staleHeadSha === currentHeadSha) throw new Error('architecture stale retirement candidate head is current');
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', staleHeadSha, currentHeadSha], { cwd: repoRoot, stdio: 'ignore' });
  } catch {
    throw new Error('architecture stale retirement candidate head is not an ancestor of current HEAD');
  }
}

function assertApprovalReference(approvalReference: string, label: string): void {
  if (!APPROVAL_REFERENCE.test(approvalReference)) {
    throw new Error(`architecture ${label} approval reference must be a non-empty event identity containing only letters, digits, . _ : or -`);
  }
}

function assertCleanCurrentProof(request: ProjectionRequestV1, result: ProjectionResultV1): void {
  const issues = projectionResultIssues(result);
  if (issues.length > 0) throw new Error(`architecture reconciliation result invalid: ${issues.join('; ')}`);
  if (request.mode !== 'check' || request.acceptedChange || result.applyReceipt) {
    throw new Error('architecture reconciliation must not execute an accepted provider apply');
  }
  if (result.requestId !== request.requestId
    || !sameExpected(request.expected, result.inputSnapshot, result.inputSnapshot.repositoryId)
    || !sameExpected(request.expected, result.outputSnapshot, result.outputSnapshot.repositoryId)) {
    throw new Error('architecture reconciliation request/result identity mismatch');
  }
  if (result.inputSnapshot.generatedFrom.codeGraphStatus !== 'ready'
    || result.outputSnapshot.generatedFrom.codeGraphStatus !== 'ready') {
    throw new Error('architecture reconciliation requires ready CodeGraph proof');
  }
  if (digestProjectionJson(result.inputSnapshot) !== digestProjectionJson(result.outputSnapshot)) {
    throw new Error('architecture reconciliation proof snapshot changed during verification');
  }
  if (result.status !== 'noop'
    || result.affectedNodeIds.length > 0
    || result.files.length > 0
    || (result.priorCommittedApplies?.length ?? 0) > 0
    || result.humanActions.length > 0
    || result.refreshSignals.length > 0) {
    throw new Error('architecture reconciliation requires an empty noop with no unresolved evidence');
  }
}

function candidateSignal(candidate: ArchitectureProjectionAcceptanceCandidateV1): ArchitectureRefreshSignalV1 {
  const matches = candidate.result.refreshSignals.filter((signal) => signal.signalId === candidate.signalId && isUnresolvedMajorCandidate(signal));
  if (matches.length !== 1) throw new Error('architecture acceptance candidate must bind exactly one unresolved-major signal');
  return matches[0]!;
}

function isUnresolvedMajorCandidate(signal: ArchitectureRefreshSignalV1): boolean {
  return signal.mode === 'human-action-required' && signal.cause === 'unresolved-major-candidate';
}

function acceptedChangeFor(signal: ArchitectureRefreshSignalV1, approvalReference: string): NonNullable<ProjectionRequestV1['acceptedChange']> {
  const projectionDigest = signal.resultingDigests.projectionDigest;
  if (!DIGEST.test(projectionDigest)) throw new Error('architecture acceptance signal resulting projection digest is invalid');
  return {
    changeSetId: `changeset.docs-projection-${projectionDigest.slice('sha256:'.length, 'sha256:'.length + 16)}`,
    eventId: approvalReference,
    reasonCodes: [...signal.reasonCodes] as NonNullable<ProjectionRequestV1['acceptedChange']>['reasonCodes'],
    affectedNodeIds: [...signal.affectedNodeIds],
  };
}

function assertFreshSignal(
  signal: ArchitectureRefreshSignalV1,
  expected: ProjectionExpectedSnapshotV1,
  current: ProjectionExpectedSnapshotV1,
): void {
  if (!sameExpected(expected, signal.worktree, signal.repository.repositoryId)) {
    throw new Error('architecture acceptance candidate request/signal identity mismatch');
  }
  if (!sameExpected(current, signal.worktree, signal.repository.repositoryId)) {
    throw new Error(`architecture acceptance refresh signal is stale: ${signal.signalId}`);
  }
}

function sameExpected(
  expected: ProjectionExpectedSnapshotV1,
  worktree: ArchitectureRefreshSignalV1['worktree'],
  repositoryId: string,
): boolean {
  return expected.repositoryId === repositoryId
    && expected.workspaceId === worktree.workspaceId
    && expected.headSha === worktree.headSha
    && expected.worktreeDigest === worktree.worktreeDigest;
}

function assertSignalId(signalId: string): asserts signalId is Sha256Digest {
  if (!DIGEST.test(signalId)) throw new Error('architecture acceptance signal id must be a sha256 digest');
}

function artifactPath(root: string, directory: string, signalId: string): string {
  assertSignalId(signalId);
  return join(root, directory, `${signalId.slice('sha256:'.length)}.json`);
}

function jsonNames(root: string, directory: string): string[] {
  try { return readdirSync(join(root, directory)).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).sort(); }
  catch { return []; }
}

function sortedUniqueDigests(values: readonly string[]): values is readonly Sha256Digest[] {
  return values.every((value, index) => DIGEST.test(value) && (index === 0 || values[index - 1]! < value));
}

function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temp, path);
}

function projectAcceptedDeadLetter(
  repoRoot: string,
  candidate: ArchitectureProjectionAcceptanceCandidateV1,
  receipt: ArchitectureProjectionAcceptanceReceiptV1,
  now?: Date,
): void {
  if (!candidate.jobId) return;
  completeArchitectureProjectionDeadLetterAcceptance(
    repoRoot,
    candidate.jobId,
    candidate.request.changedPaths,
    receipt.acceptedChange,
    receipt.result,
    receipt.refreshReceiptDigests,
    now,
  );
}

function projectReconciledDeadLetter(
  repoRoot: string,
  candidate: ArchitectureProjectionAcceptanceCandidateV1,
  receipt: ArchitectureProjectionReconciliationReceiptV1,
  now?: Date,
): void {
  if (!candidate.jobId) return;
  completeArchitectureProjectionDeadLetterReconciliation(
    repoRoot,
    candidate.jobId,
    candidate.request.changedPaths,
    receipt.result,
    now,
  );
}
