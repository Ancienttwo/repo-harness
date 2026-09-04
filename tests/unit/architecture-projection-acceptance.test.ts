import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PROJECTION_REQUEST_VERSION,
  digestProjectionJson,
  projectionResultReceiptDigest,
  type ProjectionExpectedSnapshotV1,
  type ProjectionRequestV1,
  type ProjectionResultV1,
} from '../../src/core/architecture/projection';
import {
  acceptArchitectureProjectionCandidate,
  inspectArchitectureProjectionAcceptanceState,
  reconcileArchitectureProjectionCandidate,
  recordArchitectureProjectionAcceptanceCandidates,
  retireStaleArchitectureProjectionCandidate,
} from '../../src/effects/architecture/projection-acceptance';
import {
  architectureProjectionJobId,
  architectureProjectionQueueState,
  architectureProjectionJobState,
  claimNextArchitectureProjectionJob,
  enqueueArchitectureProjectionJob,
  failArchitectureProjectionJob,
} from '../../src/effects/architecture/projection-jobs';

const roots: string[] = [];
const digest = (token: string) => `sha256:${token.repeat(64).slice(0, 64)}` as const;

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(jobId?: string, reasonCodes = ['node-added', 'ownership-changed']) {
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-architecture-acceptance-')));
  roots.push(repoRoot);
  mkdirSync(join(repoRoot, '.ai', 'harness'), { recursive: true });
  writeFileSync(join(repoRoot, 'tracked.txt'), 'fixture\n');
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'acceptance@example.com'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.name', 'Architecture Acceptance'], { cwd: repoRoot });
  execFileSync('git', ['add', '.'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repoRoot, stdio: 'ignore' });
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  const expected: ProjectionExpectedSnapshotV1 = {
    repositoryId: 'repo.acceptance-test',
    workspaceId: 'workspace.acceptance-test',
    headSha,
    worktreeDigest: digest('a'),
  };
  const request: ProjectionRequestV1 = {
    schemaVersion: PROJECTION_REQUEST_VERSION,
    requestId: jobId ? `repo-harness.projection.${jobId}` : 'repo-harness.apply.candidate',
    profile: 'repo-harness/v1',
    mode: 'apply',
    targets: ['agent-context', 'architecture-docs'],
    changedPaths: ['src/core/architecture.ts'],
    expected,
  };
  const result = unresolvedResult(request, reasonCodes);
  const [candidate] = recordArchitectureProjectionAcceptanceCandidates(repoRoot, request, result, { jobId });
  if (!candidate) throw new Error('fixture did not record a candidate');
  return { repoRoot, expected, request, result, candidate };
}

function snapshot(expected: ProjectionExpectedSnapshotV1) {
  return {
    ...expected,
    baseHeadSha: expected.headSha,
    sourceTreeDigest: digest('1'),
    modelDigest: digest('2'),
    codeGraphDigest: digest('3'),
    indexedWorktreeDigest: expected.worktreeDigest,
    projectionInputDigest: digest('5'),
    rendererVersion: 'archcontext.docs-renderer/v4' as const,
    layoutVersion: 'archcontext.docs-layout/v1' as const,
    generatedFrom: {
      codeGraphPackage: '@colbymchenry/codegraph' as const,
      codeGraphVersion: '1.5.0' as const,
      codeGraphBinaryDigest: digest('6'),
      codeGraphStatus: 'ready' as const,
    },
  };
}

function unresolvedResult(request: ProjectionRequestV1, reasonCodes: string[]): ProjectionResultV1 {
  const projected = snapshot(request.expected);
  const signal = {
    schemaVersion: 'archcontext.architecture-refresh-signal/v1' as const,
    signalId: digest('a'),
    idempotencyKey: digest('b'),
    mode: 'human-action-required' as const,
    repository: { repositoryId: request.expected.repositoryId },
    worktree: {
      workspaceId: request.expected.workspaceId,
      headSha: request.expected.headSha,
      worktreeDigest: request.expected.worktreeDigest,
    },
    cause: 'unresolved-major-candidate' as const,
    reasonCodes,
    affectedNodeIds: ['capability.runtime-harness.acceptance', 'capability.runtime-harness.architecture'],
    refreshTargets: ['architecture-readiness', 'capability-index'],
    baseDigests: { modelDigest: digest('7'), sourceTreeDigest: digest('8'), flowProofDigest: digest('9'), projectionDigest: digest('c') },
    resultingDigests: { modelDigest: digest('d'), sourceTreeDigest: digest('e'), flowProofDigest: digest('f'), projectionDigest: digest('1') },
    projectionReceiptDigest: digest('0'),
  };
  const body: Omit<ProjectionResultV1, 'receiptDigest'> = {
    schemaVersion: 'archcontext.projection-result/v2',
    requestId: request.requestId,
    status: 'human-action-required',
    inputSnapshot: projected,
    outputSnapshot: projected,
    affectedNodeIds: [...signal.affectedNodeIds],
    files: [],
    humanActions: [{ reasonCode: 'unresolved-major-change', affectedNodeIds: [...signal.affectedNodeIds], requestPayloadDigest: digest('2') }],
    refreshSignals: [signal],
  };
  const receiptDigest = projectionResultReceiptDigest(body);
  return { ...body, refreshSignals: [{ ...signal, projectionReceiptDigest: receiptDigest }], receiptDigest };
}

function noopProofResult(
  request: ProjectionRequestV1,
  indexedWorktreeDigest: ProjectionExpectedSnapshotV1['worktreeDigest'] | null = request.expected.worktreeDigest,
): ProjectionResultV1 {
  const projected = {
    ...snapshot(request.expected),
    indexedWorktreeDigest,
    generatedFrom: {
      ...snapshot(request.expected).generatedFrom,
      codeGraphStatus: indexedWorktreeDigest === null ? 'unavailable' as const : 'ready' as const,
    },
  };
  const body: Omit<ProjectionResultV1, 'receiptDigest'> = {
    schemaVersion: 'archcontext.projection-result/v2',
    requestId: request.requestId,
    status: 'noop',
    inputSnapshot: projected,
    outputSnapshot: projected,
    affectedNodeIds: [],
    files: [],
    humanActions: [],
    refreshSignals: [],
  };
  return { ...body, receiptDigest: projectionResultReceiptDigest(body) };
}

function acceptedResult(request: ProjectionRequestV1): ProjectionResultV1 {
  if (!request.acceptedChange) throw new Error('accepted result requires acceptedChange');
  const projected = snapshot(request.expected);
  const body: Omit<ProjectionResultV1, 'receiptDigest'> = {
    schemaVersion: 'archcontext.projection-result/v2',
    requestId: request.requestId,
    status: 'applied',
    inputSnapshot: projected,
    outputSnapshot: projected,
    affectedNodeIds: [...request.acceptedChange.affectedNodeIds],
    files: [],
    humanActions: [],
    refreshSignals: [],
    applyReceipt: {
      schemaVersion: 'archcontext.projection-apply-identity/v1',
      applyId: digest('3'),
      lookupKey: digest('4'),
      repositoryId: request.expected.repositoryId,
      workspaceId: request.expected.workspaceId,
      acceptedChange: request.acceptedChange,
      semanticCommit: { changeSetId: request.acceptedChange.changeSetId, idempotencyKey: 'idem.acceptance-test' },
      ownedFilesDigest: digest('5'),
      refreshSignalsDigest: digest('6'),
    },
  };
  return { ...body, receiptDigest: projectionResultReceiptDigest(body) };
}

describe('architecture projection acceptance', () => {
  test('preserves approval-reference identity and binds exact signal reasons and nodes', () => {
    const f = fixture();
    const observed: ProjectionRequestV1[] = [];
    const receipt = acceptArchitectureProjectionCandidate(
      f.repoRoot,
      f.candidate.signalId,
      'event.review-20260830-architecture-approval',
      {
        captureSnapshot: () => f.expected,
        runProjection: (request) => {
          observed.push(request);
          return acceptedResult(request);
        },
      },
    );

    expect(observed[0]?.acceptedChange).toEqual({
      changeSetId: 'changeset.docs-projection-1111111111111111',
      eventId: 'event.review-20260830-architecture-approval',
      reasonCodes: ['node-added', 'ownership-changed'],
      affectedNodeIds: ['capability.runtime-harness.acceptance', 'capability.runtime-harness.architecture'],
    });
    expect(receipt.approvalReference).toBe('event.review-20260830-architecture-approval');
    expect(receipt.acceptedChange).toEqual(observed[0]!.acceptedChange!);
    expect(inspectArchitectureProjectionAcceptanceState(f.repoRoot)).toEqual({
      schemaVersion: 'repo-harness.architecture-projection-acceptance-state/v1',
      candidates: 1,
      receipts: 1,
      reconciliationReceipts: 0,
      staleRetirementReceipts: 0,
      unresolvedCandidates: 0,
      invalidArtifacts: 0,
    });
  });

  test('composes an explicit adoption plan with the exact accepted change', () => {
    const f = fixture();
    const observed: ProjectionRequestV1[] = [];
    const receipt = acceptArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, 'event.review-adoption-approval', {
      adoptionPlanId: 'adopt-plan-0123456789abcdef',
      captureSnapshot: () => f.expected,
      runProjection: (request) => { observed.push(request); return acceptedResult(request); },
    });
    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({
      mode: 'adopt',
      adoptionPlanId: 'adopt-plan-0123456789abcdef',
      acceptedChange: { eventId: 'event.review-adoption-approval', reasonCodes: ['node-added', 'ownership-changed'] },
    });
    expect(receipt.request).toEqual(observed[0]!);
    expect(receipt.result.applyReceipt?.acceptedChange).toEqual(receipt.acceptedChange);
  });

  test('refuses a stale refresh signal before invoking the provider', () => {
    const f = fixture();
    let providerCalls = 0;
    expect(() => acceptArchitectureProjectionCandidate(
      f.repoRoot,
      f.candidate.signalId,
      'event.review-stale-refusal',
      {
        captureSnapshot: () => ({ ...f.expected, worktreeDigest: digest('b') }),
        runProjection: (request) => { providerCalls += 1; return acceptedResult(request); },
      },
    )).toThrow('refresh signal is stale');
    expect(providerCalls).toBe(0);
    expect(inspectArchitectureProjectionAcceptanceState(f.repoRoot).unresolvedCandidates).toBe(1);
  });

  test('returns byte-identical receipt evidence on an identical retry and rejects another approval identity', () => {
    const f = fixture();
    let providerCalls = 0;
    const options = {
      captureSnapshot: () => f.expected,
      runProjection: (request: ProjectionRequestV1) => { providerCalls += 1; return acceptedResult(request); },
    };
    const first = acceptArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, 'event.review-reproducible', options);
    const receiptPath = join(f.repoRoot, '.ai/harness/architecture-projection/acceptance-receipts', `${f.candidate.signalId.slice(7)}.json`);
    const firstBytes = readFileSync(receiptPath, 'utf8');
    const second = acceptArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, 'event.review-reproducible', options);
    const secondBytes = readFileSync(receiptPath, 'utf8');

    expect(second).toEqual(first);
    expect(secondBytes).toBe(firstBytes);
    expect(providerCalls).toBe(1);
    expect(() => acceptArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, 'event.review-different', options))
      .toThrow('different approval reference');
  });

  test('projects accepted evidence into the durable job receipt and clears its dead letter', () => {
    const changedPaths = ['src/core/architecture.ts'];
    const jobId = architectureProjectionJobId(['event-1'], changedPaths);
    const f = fixture(jobId);
    enqueueArchitectureProjectionJob(f.repoRoot, ['event-1'], ['source-1'], changedPaths, new Date('2026-08-30T00:00:00.000Z'));
    const claimed = claimNextArchitectureProjectionJob(f.repoRoot, new Date('2026-08-30T00:00:01.000Z'));
    if (!claimed) throw new Error('fixture did not claim the durable projection job');
    failArchitectureProjectionJob(f.repoRoot, claimed, { kind: 'permanent', message: 'unresolved major change' }, new Date('2026-08-30T00:00:02.000Z'));
    expect(architectureProjectionJobState(f.repoRoot, jobId)).toBe('dead-letter');
    const deadLetterPath = join(f.repoRoot, '.ai/harness/architecture-projection/dead-letter', `${jobId}.json`);
    const deadLetterBytes = readFileSync(deadLetterPath, 'utf8');

    const options = {
      captureSnapshot: () => f.expected,
      runProjection: (request: ProjectionRequestV1) => acceptedResult(request),
      now: new Date('2026-08-30T00:00:03.000Z'),
    };
    acceptArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, 'event.review-durable-gate', options);

    expect(architectureProjectionJobState(f.repoRoot, jobId)).toBe('receipt');
    writeFileSync(deadLetterPath, deadLetterBytes);
    acceptArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, 'event.review-durable-gate', options);
    expect(architectureProjectionQueueState(f.repoRoot).deadLetters).toBe(0);
  });

  test('reconciles an exact proof-only candidate through a check-mode noop without acceptance', () => {
    const f = fixture(undefined, ['verified-flow-proof-changed']);
    const observed: ProjectionRequestV1[] = [];
    const receipt = reconcileArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, {
      captureSnapshot: () => f.expected,
      runProjection: (request) => {
        observed.push(request);
        return noopProofResult(request);
      },
    });

    expect(observed).toHaveLength(1);
    expect(observed[0]?.mode).toBe('check');
    expect(observed[0]?.acceptedChange).toBeUndefined();
    expect(receipt.result.status).toBe('noop');
    expect(receipt.result.applyReceipt).toBeUndefined();
    expect(inspectArchitectureProjectionAcceptanceState(f.repoRoot)).toEqual({
      schemaVersion: 'repo-harness.architecture-projection-acceptance-state/v1',
      candidates: 1,
      receipts: 0,
      reconciliationReceipts: 1,
      staleRetirementReceipts: 0,
      unresolvedCandidates: 0,
      invalidArtifacts: 0,
    });
  });

  test('refuses reconciliation for semantic candidates before invoking the provider', () => {
    const f = fixture();
    let providerCalls = 0;
    expect(() => reconcileArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, {
      captureSnapshot: () => f.expected,
      runProjection: (request) => { providerCalls += 1; return noopProofResult(request); },
    })).toThrow('requires an exact verified-flow-proof-changed candidate');
    expect(providerCalls).toBe(0);
    expect(inspectArchitectureProjectionAcceptanceState(f.repoRoot).unresolvedCandidates).toBe(1);
  });

  test('refuses unavailable current CodeGraph proof', () => {
    const f = fixture(undefined, ['verified-flow-proof-changed']);
    expect(() => reconcileArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, {
      captureSnapshot: () => f.expected,
      runProjection: (request) => noopProofResult(request, null),
    })).toThrow('requires ready CodeGraph proof');
    expect(inspectArchitectureProjectionAcceptanceState(f.repoRoot).unresolvedCandidates).toBe(1);
  });

  test('returns byte-identical reconciliation evidence without a second provider call', () => {
    const f = fixture(undefined, ['verified-flow-proof-changed']);
    let providerCalls = 0;
    const options = {
      captureSnapshot: () => f.expected,
      runProjection: (request: ProjectionRequestV1) => { providerCalls += 1; return noopProofResult(request); },
    };
    const first = reconcileArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, options);
    const receiptPath = join(f.repoRoot, '.ai/harness/architecture-projection/reconciliation-receipts', `${f.candidate.signalId.slice(7)}.json`);
    const firstBytes = readFileSync(receiptPath, 'utf8');
    const second = reconcileArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, options);

    expect(second).toEqual(first);
    expect(readFileSync(receiptPath, 'utf8')).toBe(firstBytes);
    expect(providerCalls).toBe(1);
  });

  test('refuses acceptance after reconciliation before invoking the provider', () => {
    const f = fixture(undefined, ['verified-flow-proof-changed']);
    reconcileArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, {
      captureSnapshot: () => f.expected,
      runProjection: (request) => noopProofResult(request),
    });
    let providerCalls = 0;
    expect(() => acceptArchitectureProjectionCandidate(
      f.repoRoot,
      f.candidate.signalId,
      'event.review-must-not-override-proof',
      {
        captureSnapshot: () => f.expected,
        runProjection: (request) => { providerCalls += 1; return acceptedResult(request); },
      },
    )).toThrow('already resolved by reconciliation');
    expect(providerCalls).toBe(0);
    expect(inspectArchitectureProjectionAcceptanceState(f.repoRoot).unresolvedCandidates).toBe(0);
  });

  test('projects proof reconciliation into a durable terminal job receipt', () => {
    const changedPaths = ['src/core/architecture.ts'];
    const jobId = architectureProjectionJobId(['event-proof'], changedPaths);
    const f = fixture(jobId, ['verified-flow-proof-changed']);
    enqueueArchitectureProjectionJob(f.repoRoot, ['event-proof'], ['source-proof'], changedPaths, new Date('2026-08-30T00:00:00.000Z'));
    const claimed = claimNextArchitectureProjectionJob(f.repoRoot, new Date('2026-08-30T00:00:01.000Z'));
    if (!claimed) throw new Error('fixture did not claim a proof-only projection job');
    failArchitectureProjectionJob(f.repoRoot, claimed, { kind: 'permanent', message: 'proof unavailable' }, new Date('2026-08-30T00:00:02.000Z'));
    expect(architectureProjectionJobState(f.repoRoot, jobId)).toBe('dead-letter');
    const deadLetterPath = join(f.repoRoot, '.ai/harness/architecture-projection/dead-letter', `${jobId}.json`);
    const deadLetterBytes = readFileSync(deadLetterPath, 'utf8');

    const options = {
      captureSnapshot: () => f.expected,
      runProjection: (request: ProjectionRequestV1) => noopProofResult(request),
      now: new Date('2026-08-30T00:00:03.000Z'),
    };
    reconcileArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, options);

    expect(architectureProjectionJobState(f.repoRoot, jobId)).toBe('receipt');
    expect(architectureProjectionQueueState(f.repoRoot).deadLetters).toBe(0);
    writeFileSync(deadLetterPath, deadLetterBytes);
    reconcileArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, options);
    expect(architectureProjectionQueueState(f.repoRoot).deadLetters).toBe(0);
  });

  test('retries terminal job projection from an already durable reconciliation receipt', () => {
    const changedPaths = ['src/core/architecture.ts'];
    const jobId = architectureProjectionJobId(['event-proof-retry'], changedPaths);
    const f = fixture(jobId, ['verified-flow-proof-changed']);
    let providerCalls = 0;
    const options = {
      captureSnapshot: () => f.expected,
      runProjection: (request: ProjectionRequestV1) => { providerCalls += 1; return noopProofResult(request); },
      now: new Date('2026-08-30T00:00:03.000Z'),
    };
    expect(() => reconcileArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, options))
      .toThrow('reconciliation dead letter is missing');
    expect(providerCalls).toBe(1);

    enqueueArchitectureProjectionJob(f.repoRoot, ['event-proof-retry'], ['source-proof-retry'], changedPaths, new Date('2026-08-30T00:00:00.000Z'));
    const claimed = claimNextArchitectureProjectionJob(f.repoRoot, new Date('2026-08-30T00:00:01.000Z'));
    if (!claimed) throw new Error('fixture did not claim a retryable proof-only projection job');
    failArchitectureProjectionJob(f.repoRoot, claimed, { kind: 'permanent', message: 'proof unavailable' }, new Date('2026-08-30T00:00:02.000Z'));

    reconcileArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, options);
    expect(providerCalls).toBe(1);
    expect(architectureProjectionJobState(f.repoRoot, jobId)).toBe('receipt');
  });

  test('marks a re-digested reconciliation receipt with another request surface invalid', () => {
    const f = fixture(undefined, ['verified-flow-proof-changed']);
    reconcileArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, {
      captureSnapshot: () => f.expected,
      runProjection: (request) => noopProofResult(request),
    });
    const receiptPath = join(f.repoRoot, '.ai/harness/architecture-projection/reconciliation-receipts', `${f.candidate.signalId.slice(7)}.json`);
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as Record<string, any>;
    receipt.request.changedPaths = ['src/other.ts'];
    const { receiptDigest: _digest, ...body } = receipt;
    receipt.receiptDigest = digestProjectionJson(body);
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    expect(inspectArchitectureProjectionAcceptanceState(f.repoRoot)).toMatchObject({
      unresolvedCandidates: 1,
      invalidArtifacts: 1,
    });
  });

  test('retires a stale semantic candidate with explicit approval and current noop proof', () => {
    const f = fixture();
    writeFileSync(join(f.repoRoot, 'tracked.txt'), 'new head\n');
    execFileSync('git', ['add', '.'], { cwd: f.repoRoot });
    execFileSync('git', ['commit', '-m', 'advance'], { cwd: f.repoRoot, stdio: 'ignore' });
    const current = {
      ...f.expected,
      headSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.repoRoot, encoding: 'utf8' }).trim(),
      worktreeDigest: digest('b'),
    };
    const observed: ProjectionRequestV1[] = [];
    const receipt = retireStaleArchitectureProjectionCandidate(
      f.repoRoot,
      f.candidate.signalId,
      'user-approval-20260904-stale-candidate-retirement',
      {
        captureSnapshot: () => current,
        runProjection: (request) => {
          observed.push(request);
          return noopProofResult(request);
        },
      },
    );

    expect(observed).toHaveLength(1);
    expect(observed[0]?.mode).toBe('check');
    expect(observed[0]?.acceptedChange).toBeUndefined();
    expect(receipt.staleHeadSha).toBe(f.expected.headSha);
    expect(receipt.approvalReference).toBe('user-approval-20260904-stale-candidate-retirement');
    expect(inspectArchitectureProjectionAcceptanceState(f.repoRoot)).toEqual({
      schemaVersion: 'repo-harness.architecture-projection-acceptance-state/v1',
      candidates: 1,
      receipts: 0,
      reconciliationReceipts: 0,
      staleRetirementReceipts: 1,
      unresolvedCandidates: 0,
      invalidArtifacts: 0,
    });
  });

  test('makes stale retirement idempotent for one approval identity', () => {
    const f = fixture();
    writeFileSync(join(f.repoRoot, 'tracked.txt'), 'new head\n');
    execFileSync('git', ['add', '.'], { cwd: f.repoRoot });
    execFileSync('git', ['commit', '-m', 'advance'], { cwd: f.repoRoot, stdio: 'ignore' });
    const current = {
      ...f.expected,
      headSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.repoRoot, encoding: 'utf8' }).trim(),
      worktreeDigest: digest('b'),
    };
    let providerCalls = 0;
    const options = {
      captureSnapshot: () => current,
      runProjection: (request: ProjectionRequestV1) => { providerCalls += 1; return noopProofResult(request); },
    };
    const first = retireStaleArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, 'event.review-retire', options);
    const second = retireStaleArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, 'event.review-retire', options);

    expect(second).toEqual(first);
    expect(providerCalls).toBe(1);
    expect(() => retireStaleArchitectureProjectionCandidate(f.repoRoot, f.candidate.signalId, 'event.review-other', options))
      .toThrow('different approval reference');
  });

  test('refuses stale retirement for a current, proof-only, or unterminated job candidate', () => {
    const current = fixture();
    expect(() => retireStaleArchitectureProjectionCandidate(
      current.repoRoot,
      current.candidate.signalId,
      'event.review-current',
      { captureSnapshot: () => current.expected },
    )).toThrow('candidate head is current');

    const proofOnly = fixture(undefined, ['verified-flow-proof-changed']);
    expect(() => retireStaleArchitectureProjectionCandidate(
      proofOnly.repoRoot,
      proofOnly.candidate.signalId,
      'event.review-proof-only',
    )).toThrow('use reconciliation for proof-only candidates');

    const jobId = architectureProjectionJobId(['event-stale'], ['src/core/architecture.ts']);
    const jobBound = fixture(jobId);
    expect(() => retireStaleArchitectureProjectionCandidate(
      jobBound.repoRoot,
      jobBound.candidate.signalId,
      'event.review-job-not-terminal',
    )).toThrow('requires a terminal job receipt');
  });
});
