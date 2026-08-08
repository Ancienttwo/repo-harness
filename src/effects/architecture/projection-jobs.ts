import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import type { ProjectionResultV1 } from '../../core/architecture/projection';

export const ARCHITECTURE_PROJECTION_RUNTIME_ROOT = '.ai/harness/architecture-projection';
const LOCK_PATH = `${ARCHITECTURE_PROJECTION_RUNTIME_ROOT}/locks/store`;
const MAX_ATTEMPTS = 3;
const RUNNING_STALE_MS = 15 * 60 * 1000;

export type ProjectionJobFailureKind = 'process' | 'timeout' | 'stale-snapshot' | 'invalid-result' | 'refresh' | 'permanent';

export interface ArchitectureProjectionJobV1 {
  schemaVersion: 'repo-harness.architecture-projection-job/v1';
  jobId: string;
  status: 'pending' | 'running';
  sourceEventIds: string[];
  changedPaths: string[];
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
  changedPaths: string[];
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

export function architectureProjectionJobId(sourceEventIds: readonly string[], changedPaths: readonly string[]): string {
  const { events, paths } = normalizedIdentity(sourceEventIds, changedPaths);
  const digest = createHash('sha256').update(JSON.stringify({ sourceEventIds: events, changedPaths: paths })).digest('hex');
  return `job-${digest.slice(0, 24)}`;
}

export function architectureProjectionJobState(
  repoRoot: string,
  jobId: string,
): 'missing' | 'pending' | 'running' | 'receipt' | 'dead-letter' {
  for (const [kind, state] of [
    ['pending', 'pending'], ['running', 'running'], ['receipts', 'receipt'], ['dead-letter', 'dead-letter'],
  ] as const) if (existsSync(pathFor(repoRoot, kind, jobId))) return state;
  return 'missing';
}

export function architectureProjectionDeadLetterForSourceEvents(
  repoRoot: string,
  sourceEventIds: readonly string[],
): ArchitectureProjectionDeadLetterV1 | null {
  const requested = new Set(sourceEventIds);
  if (requested.size === 0) return null;
  return deadLettersByFailedAt(repoRoot).find((entry) => entry.job.sourceEventIds.some((eventId) => requested.has(eventId))) ?? null;
}

export function enqueueArchitectureProjectionJob(
  repoRoot: string,
  sourceEventIds: readonly string[],
  changedPaths: readonly string[],
  now = new Date(),
): ArchitectureProjectionJobV1 | null {
  const { events, paths } = normalizedIdentity(sourceEventIds, changedPaths);
  if (events.length === 0 || paths.length === 0) return null;
  return withExclusiveDirectoryLock(repoRoot, LOCK_PATH, () => {
    if (names(repoRoot, 'running').length > 0) return null;
    const existing = jobsByCreatedAt(repoRoot, 'pending')[0];
    if (existing) return existing;
    const id = architectureProjectionJobId(events, paths);
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
      changedPaths: paths,
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
      const updatedAtMs = Date.parse(job.updatedAt);
      const stale = !Number.isFinite(updatedAtMs) || now.getTime() - updatedAtMs >= RUNNING_STALE_MS;
      if (!stale && job.ownerPid && processIsAlive(job.ownerPid)) continue;
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

function processIsAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
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
      changedPaths: job.changedPaths,
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
      ownerPid: undefined,
      updatedAt: now.toISOString(),
      lastFailure: { ...failure, at: now.toISOString() },
    };
    if (failure.kind === 'permanent' || failed.attempt >= MAX_ATTEMPTS) {
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
  const pending = jobsByCreatedAt(repoRoot, 'pending');
  const deadLetters = deadLettersByFailedAt(repoRoot);
  return {
    schemaVersion: 'repo-harness.architecture-projection-queue-state/v1',
    pending: pending.length,
    running: names(repoRoot, 'running').length,
    receipts: names(repoRoot, 'receipts').length,
    deadLetters: deadLetters.length,
    oldestPendingJobId: pending[0]?.jobId ?? null,
    oldestDeadLetterJobId: deadLetters[0]?.job.jobId ?? null,
  };
}
