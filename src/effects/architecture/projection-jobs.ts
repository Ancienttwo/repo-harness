import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { sameAcceptedArchitectureChange, type ProjectionResultV1 } from '../../core/architecture/projection';
import type { AcceptedArchitectureChangeReferenceV1 } from 'archctx-contracts';

export const ARCHITECTURE_PROJECTION_RUNTIME_ROOT = '.ai/harness/architecture-projection';
const LOCK_PATH = `${ARCHITECTURE_PROJECTION_RUNTIME_ROOT}/locks/store`;
const MAX_ATTEMPTS = 3;
/** Longer than the configured 120 second provider bound. A dead Stop owner
 * cannot be reclaimed while its orphaned provider may still be running. */
const RUNNING_STALE_MS = 150_000;

export type ProjectionJobFailureKind = 'preflight' | 'reconciliation' | 'host-budget' | 'process' | 'timeout' | 'stale-snapshot' | 'invalid-result' | 'refresh' | 'permanent';

export interface ArchitectureProjectionJobV1 {
  schemaVersion: 'repo-harness.architecture-projection-job/v1';
  jobId: string;
  status: 'pending' | 'running';
  sourceEventIds: string[];
  sourceKeys: string[];
  changedPaths: string[];
  acceptedChange?: AcceptedArchitectureChangeReferenceV1;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  ownerPid?: number;
  lastFailure?: { kind: ProjectionJobFailureKind; message: string; at: string };
}

export interface ArchitectureProjectionReceiptV1 {
  schemaVersion: 'repo-harness.architecture-projection-receipt/v1';
  jobId: string;
  sourceEventIds: string[];
  sourceKeys: string[];
  changedPaths: string[];
  acceptedChange?: AcceptedArchitectureChangeReferenceV1;
  attempt: number;
  completedAt: string;
  result: ProjectionResultV1;
  refreshReceiptDigests: string[];
}

export interface ArchitectureProjectionDeadLetterV1 {
  schemaVersion: 'repo-harness.architecture-projection-dead-letter/v1';
  job: ArchitectureProjectionJobV1;
  failedAt: string;
  failure: { kind: ProjectionJobFailureKind; message: string };
}

export interface ArchitectureProjectionQueueStateV1 {
  schemaVersion: 'repo-harness.architecture-projection-queue-state/v1';
  pending: number;
  running: number;
  receipts: number;
  deadLetters: number;
  oldestPendingJobId: string | null;
  oldestDeadLetterJobId: string | null;
}

function directory(kind: 'pending' | 'running' | 'receipts' | 'dead-letter'): string {
  return `${ARCHITECTURE_PROJECTION_RUNTIME_ROOT}/${kind}`;
}

function pathFor(repoRoot: string, kind: 'pending' | 'running' | 'receipts' | 'dead-letter', jobId: string): string {
  return join(repoRoot, directory(kind), `${jobId}.json`);
}

function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temp, path);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function names(repoRoot: string, kind: 'pending' | 'running' | 'receipts' | 'dead-letter'): string[] {
  try { return readdirSync(join(repoRoot, directory(kind))).filter((name) => name.endsWith('.json')).sort(); }
  catch { return []; }
}

function jobsByCreatedAt(repoRoot: string, kind: 'pending' | 'running'): ArchitectureProjectionJobV1[] {
  return names(repoRoot, kind)
    .map((name) => readJson<ArchitectureProjectionJobV1>(join(repoRoot, directory(kind), name)))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.jobId.localeCompare(right.jobId));
}

function deadLettersByFailedAt(repoRoot: string): ArchitectureProjectionDeadLetterV1[] {
  return names(repoRoot, 'dead-letter')
    .map((name) => readJson<ArchitectureProjectionDeadLetterV1>(join(repoRoot, directory('dead-letter'), name)))
    .sort((left, right) => left.failedAt.localeCompare(right.failedAt) || left.job.jobId.localeCompare(right.job.jobId));
}

function normalizedIdentity(sourceEventIds: readonly string[], changedPaths: readonly string[]): { events: string[]; paths: string[] } {
  return {
    events: [...new Set(sourceEventIds)].sort(),
    paths: [...new Set(changedPaths)].sort(),
  };
}

export function architectureProjectionJobId(sourceEventIds: readonly string[], changedPaths: readonly string[], acceptedChange?: AcceptedArchitectureChangeReferenceV1): string {
  const { events, paths } = normalizedIdentity(sourceEventIds, changedPaths);
  const digest = createHash('sha256').update(JSON.stringify({ sourceEventIds: events, changedPaths: paths, ...(acceptedChange ? { acceptedChange } : {}) })).digest('hex');
  return `job-${digest.slice(0, 24)}`;
}

export function architectureProjectionJobState(
  repoRoot: string,
  jobId: string,
): 'missing' | 'pending' | 'running' | 'receipt' | 'dead-letter' {
  const root = realpathSync(repoRoot);
  return withExclusiveDirectoryLock(root, LOCK_PATH, () => {
    for (const [kind, state] of [
      ['pending', 'pending'], ['receipts', 'receipt'], ['running', 'running'], ['dead-letter', 'dead-letter'],
    ] as const) if (existsSync(pathFor(root, kind, jobId))) return state;
    return 'missing';
  });
}

export function readArchitectureProjectionReceipt(
  repoRoot: string,
  jobId: string,
): ArchitectureProjectionReceiptV1 | null {
  if (!/^job-[a-f0-9]{24}$/.test(jobId)) return null;
  const root = realpathSync(repoRoot);
  return withExclusiveDirectoryLock(root, LOCK_PATH, () => {
    const path = pathFor(root, 'receipts', jobId);
    return existsSync(path) ? readJson<ArchitectureProjectionReceiptV1>(path) : null;
  });
}

/** Newest durable receipt by completion time; the manual publication entry's provider authority. */
export function latestArchitectureProjectionReceipt(repoRoot: string): ArchitectureProjectionReceiptV1 | null {
  const root = realpathSync(repoRoot);
  return withExclusiveDirectoryLock(root, LOCK_PATH, () =>
    names(root, 'receipts')
      .map((name) => readJson<ArchitectureProjectionReceiptV1>(join(root, directory('receipts'), name)))
      .sort((left, right) => left.completedAt.localeCompare(right.completedAt) || left.jobId.localeCompare(right.jobId))
      .at(-1) ?? null,
  );
}

export function architectureProjectionDeadLetterForSourceKeys(
  repoRoot: string,
  sourceKeys: readonly string[],
): ArchitectureProjectionDeadLetterV1 | null {
  const requested = new Set(sourceKeys);
  if (requested.size === 0) return null;
  const root = realpathSync(repoRoot);
  return withExclusiveDirectoryLock(root, LOCK_PATH, () =>
    deadLettersByFailedAt(root).find((entry) => entry.job.sourceKeys.some((sourceKey) => requested.has(sourceKey))) ?? null,
  );
}

export function enqueueArchitectureProjectionJob(
  repoRoot: string,
  sourceEventIds: readonly string[],
  sourceKeys: readonly string[],
  changedPaths: readonly string[],
  now = new Date(),
  acceptedChange?: AcceptedArchitectureChangeReferenceV1,
): ArchitectureProjectionJobV1 | null {
  if (sourceEventIds.length !== sourceKeys.length) {
    throw new Error('architecture projection source event ids and keys must have equal length');
  }
  const deliveryBySource = new Map<string, string>();
  for (let index = 0; index < sourceKeys.length; index += 1) {
    const key = sourceKeys[index]!;
    const eventId = sourceEventIds[index]!;
    const prior = deliveryBySource.get(key);
    if (prior && prior !== eventId) throw new Error(`architecture projection source key has multiple delivery ids: ${key}`);
    deliveryBySource.set(key, eventId);
  }
  const { events, paths } = normalizedIdentity(sourceEventIds, changedPaths);
  const keys = [...new Set(sourceKeys)].sort();
  if (events.length === 0 || keys.length === 0 || paths.length === 0) return null;
  return withExclusiveDirectoryLock(repoRoot, LOCK_PATH, () => {
    if (names(repoRoot, 'running').length > 0) return null;
    const existing = jobsByCreatedAt(repoRoot, 'pending')[0];
    if (existing) {
      if (JSON.stringify(existing.acceptedChange ?? null) !== JSON.stringify(acceptedChange ?? null)) {
        throw new Error('architecture projection pending job accepted change mismatch');
      }
      const currentDeliveries = existing.sourceKeys.map((key) => deliveryBySource.get(key));
      if (currentDeliveries.every((eventId): eventId is string => eventId !== undefined)) {
        const refreshedIds = [...new Set(currentDeliveries)].sort();
        if (JSON.stringify(refreshedIds) !== JSON.stringify(existing.sourceEventIds)) {
          const refreshed = { ...existing, sourceEventIds: refreshedIds, updatedAt: now.toISOString() };
          atomicJson(pathFor(repoRoot, 'pending', existing.jobId), refreshed);
          return refreshed;
        }
      }
      return existing;
    }
    const id = architectureProjectionJobId(events, paths, acceptedChange);
    for (const kind of ['running', 'receipts', 'dead-letter'] as const) {
      const path = pathFor(repoRoot, kind, id);
      if (existsSync(path)) return kind === 'running' ? readJson<ArchitectureProjectionJobV1>(path) : null;
    }
    const timestamp = now.toISOString();
    const job: ArchitectureProjectionJobV1 = {
      schemaVersion: 'repo-harness.architecture-projection-job/v1',
      jobId: id,
      status: 'pending',
      sourceEventIds: events,
      sourceKeys: keys,
      changedPaths: paths,
      ...(acceptedChange ? { acceptedChange } : {}),
      attempt: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    atomicJson(pathFor(repoRoot, 'pending', id), job);
    return job;
  });
}

export function recoverAbandonedArchitectureProjectionJobs(repoRoot: string, now = new Date()): number {
  return withExclusiveDirectoryLock(repoRoot, LOCK_PATH, () => {
    let recovered = 0;
    for (const name of names(repoRoot, 'running')) {
      const runningPath = join(repoRoot, directory('running'), name);
      const job = readJson<ArchitectureProjectionJobV1>(runningPath);
      if (existsSync(pathFor(repoRoot, 'receipts', job.jobId))) {
        unlinkSync(runningPath);
        recovered += 1;
        continue;
      }
      const updatedAtMs = Date.parse(job.updatedAt);
      const stale = !Number.isFinite(updatedAtMs) || now.getTime() - updatedAtMs >= RUNNING_STALE_MS;
      if (!stale) continue;
      if (job.attempt >= MAX_ATTEMPTS) {
        const failure = { kind: 'timeout' as const, message: `running job was abandoned after attempt ${job.attempt}` };
        atomicJson(pathFor(repoRoot, 'dead-letter', job.jobId), {
          schemaVersion: 'repo-harness.architecture-projection-dead-letter/v1',
          job: { ...job, status: 'pending', ownerPid: undefined, updatedAt: now.toISOString(), lastFailure: { ...failure, at: now.toISOString() } },
          failedAt: now.toISOString(),
          failure,
        } satisfies ArchitectureProjectionDeadLetterV1);
        unlinkSync(runningPath);
        recovered += 1;
        continue;
      }
      const pending = {
        ...job,
        status: 'pending' as const,
        updatedAt: now.toISOString(),
        ownerPid: undefined,
        lastFailure: { kind: 'timeout' as const, message: `running job was abandoned after attempt ${job.attempt}`, at: now.toISOString() },
      };
      atomicJson(pathFor(repoRoot, 'pending', job.jobId), pending);
      unlinkSync(runningPath);
      recovered += 1;
    }
    return recovered;
  });
}

export function claimNextArchitectureProjectionJob(repoRoot: string, now = new Date()): ArchitectureProjectionJobV1 | null {
  return withExclusiveDirectoryLock(repoRoot, LOCK_PATH, () => {
    if (names(repoRoot, 'running').length > 0) return null;
    const pending = jobsByCreatedAt(repoRoot, 'pending')[0];
    if (!pending) return null;
    const pendingPath = pathFor(repoRoot, 'pending', pending.jobId);
    const running: ArchitectureProjectionJobV1 = {
      ...pending,
      status: 'running',
      attempt: pending.attempt + 1,
      ownerPid: process.pid,
      updatedAt: now.toISOString(),
    };
    atomicJson(pathFor(repoRoot, 'running', running.jobId), running);
    unlinkSync(pendingPath);
    return running;
  });
}

export function retryArchitectureProjectionDeadLetter(
  repoRoot: string,
  jobId: string,
  now = new Date(),
): ArchitectureProjectionJobV1 {
  if (!/^job-[a-f0-9]{24}$/.test(jobId)) throw new Error('architecture projection job id is invalid');
  return withExclusiveDirectoryLock(repoRoot, LOCK_PATH, () => {
    if (names(repoRoot, 'running').length > 0 || names(repoRoot, 'pending').length > 0) {
      throw new Error('architecture projection retry requires an empty pending/running queue');
    }
    const deadLetterPath = pathFor(repoRoot, 'dead-letter', jobId);
    if (!existsSync(deadLetterPath)) throw new Error(`architecture projection dead letter is missing: ${jobId}`);
    const deadLetter = readJson<ArchitectureProjectionDeadLetterV1>(deadLetterPath);
    const pending: ArchitectureProjectionJobV1 = {
      ...deadLetter.job,
      status: 'pending',
      attempt: 0,
      ownerPid: undefined,
      updatedAt: now.toISOString(),
      lastFailure: undefined,
    };
    atomicJson(pathFor(repoRoot, 'pending', jobId), pending);
    unlinkSync(deadLetterPath);
    return pending;
  });
}

export function completeArchitectureProjectionJob(
  repoRoot: string,
  job: ArchitectureProjectionJobV1,
  result: ProjectionResultV1,
  refreshReceiptDigests: readonly string[],
  now = new Date(),
): ArchitectureProjectionReceiptV1 {
  return withExclusiveDirectoryLock(repoRoot, LOCK_PATH, () => {
    const runningPath = pathFor(repoRoot, 'running', job.jobId);
    if (!existsSync(runningPath)) throw new Error(`architecture projection running job is missing: ${job.jobId}`);
    assertClaimOwner(readJson<ArchitectureProjectionJobV1>(runningPath), job);
    const receipt: ArchitectureProjectionReceiptV1 = {
      schemaVersion: 'repo-harness.architecture-projection-receipt/v1',
      jobId: job.jobId,
      sourceEventIds: job.sourceEventIds,
      sourceKeys: job.sourceKeys,
      changedPaths: job.changedPaths,
      ...(job.acceptedChange ? { acceptedChange: job.acceptedChange } : {}),
      attempt: job.attempt,
      completedAt: now.toISOString(),
      result,
      refreshReceiptDigests: [...new Set(refreshReceiptDigests)].sort(),
    };
    atomicJson(pathFor(repoRoot, 'receipts', job.jobId), receipt);
    unlinkSync(runningPath);
    return receipt;
  });
}

export function completeArchitectureProjectionDeadLetterAcceptance(
  repoRoot: string,
  jobId: string,
  expectedChangedPaths: readonly string[],
  acceptedChange: AcceptedArchitectureChangeReferenceV1,
  result: ProjectionResultV1,
  refreshReceiptDigests: readonly string[],
  now = new Date(),
): ArchitectureProjectionReceiptV1 {
  if (!/^job-[a-f0-9]{24}$/.test(jobId)) throw new Error('architecture projection acceptance job id is invalid');
  return withExclusiveDirectoryLock(repoRoot, LOCK_PATH, () => {
    const receiptPath = pathFor(repoRoot, 'receipts', jobId);
    if (existsSync(receiptPath)) {
      const existing = readJson<ArchitectureProjectionReceiptV1>(receiptPath);
      if (!existing.acceptedChange || !sameAcceptedArchitectureChange(existing.acceptedChange, acceptedChange)
        || existing.changedPaths.join('\0') !== expectedChangedPaths.join('\0')
        || existing.result.receiptDigest !== result.receiptDigest) {
        throw new Error(`architecture projection acceptance receipt conflicts with completed job: ${jobId}`);
      }
      const residualDeadLetterPath = pathFor(repoRoot, 'dead-letter', jobId);
      if (existsSync(residualDeadLetterPath)) {
        const residual = readJson<ArchitectureProjectionDeadLetterV1>(residualDeadLetterPath);
        if (residual.job.jobId !== jobId
          || residual.job.changedPaths.join('\0') !== expectedChangedPaths.join('\0')) {
          throw new Error(`architecture projection acceptance residual dead letter identity mismatch: ${jobId}`);
        }
        unlinkSync(residualDeadLetterPath);
      }
      return existing;
    }
    const deadLetterPath = pathFor(repoRoot, 'dead-letter', jobId);
    if (!existsSync(deadLetterPath)) throw new Error(`architecture projection acceptance dead letter is missing: ${jobId}`);
    const deadLetter = readJson<ArchitectureProjectionDeadLetterV1>(deadLetterPath);
    if (deadLetter.job.changedPaths.join('\0') !== expectedChangedPaths.join('\0')) {
      throw new Error(`architecture projection acceptance dead letter changed paths mismatch: ${jobId}`);
    }
    const receipt: ArchitectureProjectionReceiptV1 = {
      schemaVersion: 'repo-harness.architecture-projection-receipt/v1',
      jobId,
      sourceEventIds: deadLetter.job.sourceEventIds,
      sourceKeys: deadLetter.job.sourceKeys,
      changedPaths: deadLetter.job.changedPaths,
      acceptedChange,
      attempt: deadLetter.job.attempt,
      completedAt: now.toISOString(),
      result,
      refreshReceiptDigests: [...new Set(refreshReceiptDigests)].sort(),
    };
    atomicJson(receiptPath, receipt);
    unlinkSync(deadLetterPath);
    return receipt;
  });
}

export function completeArchitectureProjectionDeadLetterReconciliation(
  repoRoot: string,
  jobId: string,
  expectedChangedPaths: readonly string[],
  result: ProjectionResultV1,
  now = new Date(),
): ArchitectureProjectionReceiptV1 {
  if (!/^job-[a-f0-9]{24}$/.test(jobId)) throw new Error('architecture projection reconciliation job id is invalid');
  return withExclusiveDirectoryLock(repoRoot, LOCK_PATH, () => {
    const receiptPath = pathFor(repoRoot, 'receipts', jobId);
    if (existsSync(receiptPath)) {
      const existing = readJson<ArchitectureProjectionReceiptV1>(receiptPath);
      if (existing.acceptedChange
        || existing.changedPaths.join('\0') !== expectedChangedPaths.join('\0')
        || existing.result.receiptDigest !== result.receiptDigest) {
        throw new Error(`architecture projection reconciliation receipt conflicts with completed job: ${jobId}`);
      }
      const residualDeadLetterPath = pathFor(repoRoot, 'dead-letter', jobId);
      if (existsSync(residualDeadLetterPath)) {
        const residual = readJson<ArchitectureProjectionDeadLetterV1>(residualDeadLetterPath);
        if (residual.job.jobId !== jobId
          || residual.job.acceptedChange
          || residual.job.changedPaths.join('\0') !== expectedChangedPaths.join('\0')) {
          throw new Error(`architecture projection reconciliation residual dead letter identity mismatch: ${jobId}`);
        }
        unlinkSync(residualDeadLetterPath);
      }
      return existing;
    }
    const deadLetterPath = pathFor(repoRoot, 'dead-letter', jobId);
    if (!existsSync(deadLetterPath)) throw new Error(`architecture projection reconciliation dead letter is missing: ${jobId}`);
    const deadLetter = readJson<ArchitectureProjectionDeadLetterV1>(deadLetterPath);
    if (deadLetter.job.acceptedChange
      || deadLetter.job.changedPaths.join('\0') !== expectedChangedPaths.join('\0')) {
      throw new Error(`architecture projection reconciliation dead letter identity mismatch: ${jobId}`);
    }
    const receipt: ArchitectureProjectionReceiptV1 = {
      schemaVersion: 'repo-harness.architecture-projection-receipt/v1',
      jobId,
      sourceEventIds: deadLetter.job.sourceEventIds,
      sourceKeys: deadLetter.job.sourceKeys,
      changedPaths: deadLetter.job.changedPaths,
      attempt: deadLetter.job.attempt,
      completedAt: now.toISOString(),
      result,
      refreshReceiptDigests: [],
    };
    atomicJson(receiptPath, receipt);
    unlinkSync(deadLetterPath);
    return receipt;
  });
}

export function failArchitectureProjectionJob(
  repoRoot: string,
  job: ArchitectureProjectionJobV1,
  failure: { kind: ProjectionJobFailureKind; message: string },
  now = new Date(),
): { state: 'pending' | 'dead-letter'; job: ArchitectureProjectionJobV1 } {
  return withExclusiveDirectoryLock(repoRoot, LOCK_PATH, () => {
    const runningPath = pathFor(repoRoot, 'running', job.jobId);
    if (!existsSync(runningPath)) throw new Error(`architecture projection running job is missing: ${job.jobId}`);
    assertClaimOwner(readJson<ArchitectureProjectionJobV1>(runningPath), job);
    const failed: ArchitectureProjectionJobV1 = {
      ...job,
      status: 'pending',
      attempt: failure.kind === 'preflight' || failure.kind === 'reconciliation' || failure.kind === 'host-budget' ? Math.max(0, job.attempt - 1) : job.attempt,
      ownerPid: undefined,
      updatedAt: now.toISOString(),
      lastFailure: { ...failure, at: now.toISOString() },
    };
    if (failure.kind !== 'preflight' && failure.kind !== 'reconciliation' && failure.kind !== 'host-budget' && (failure.kind === 'permanent' || failed.attempt >= MAX_ATTEMPTS)) {
      const deadLetter: ArchitectureProjectionDeadLetterV1 = {
        schemaVersion: 'repo-harness.architecture-projection-dead-letter/v1',
        job: failed,
        failedAt: now.toISOString(),
        failure,
      };
      atomicJson(pathFor(repoRoot, 'dead-letter', job.jobId), deadLetter);
      unlinkSync(runningPath);
      return { state: 'dead-letter', job: failed };
    }
    atomicJson(pathFor(repoRoot, 'pending', job.jobId), failed);
    unlinkSync(runningPath);
    return { state: 'pending', job: failed };
  });
}

function assertClaimOwner(persisted: ArchitectureProjectionJobV1, claimed: ArchitectureProjectionJobV1): void {
  if (
    persisted.status !== 'running'
    || persisted.jobId !== claimed.jobId
    || persisted.attempt !== claimed.attempt
    || persisted.ownerPid !== claimed.ownerPid
  ) {
    throw new Error(`architecture projection running claim no longer belongs to this process: ${claimed.jobId}`);
  }
}

export function architectureProjectionQueueState(repoRoot: string): ArchitectureProjectionQueueStateV1 {
  const root = realpathSync(repoRoot);
  return withExclusiveDirectoryLock(root, LOCK_PATH, () => {
    const pending = jobsByCreatedAt(root, 'pending');
    const deadLetters = deadLettersByFailedAt(root);
    return {
      schemaVersion: 'repo-harness.architecture-projection-queue-state/v1',
      pending: pending.length,
      running: names(root, 'running').length,
      receipts: names(root, 'receipts').length,
      deadLetters: deadLetters.length,
      oldestPendingJobId: pending[0]?.jobId ?? null,
      oldestDeadLetterJobId: deadLetters[0]?.job.jobId ?? null,
    };
  });
}
