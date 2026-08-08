import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import type { ProjectionResultV1 } from '../../core/architecture/projection';

export const ARCHITECTURE_PROJECTION_RUNTIME_ROOT = '.ai/harness/architecture-projection';
const LOCK_PATH = `${ARCHITECTURE_PROJECTION_RUNTIME_ROOT}/locks/store`;
const MAX_ATTEMPTS = 3;

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

export function architectureProjectionJobId(sourceEventIds: readonly string[], changedPaths: readonly string[]): string {
  const digest = createHash('sha256').update(JSON.stringify({ sourceEventIds: [...sourceEventIds].sort(), changedPaths: [...changedPaths].sort() })).digest('hex');
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

export function enqueueArchitectureProjectionJob(
  repoRoot: string,
  sourceEventIds: readonly string[],
  changedPaths: readonly string[],
  now = new Date(),
): ArchitectureProjectionJobV1 | null {
  const events = [...new Set(sourceEventIds)].sort();
  const paths = [...new Set(changedPaths)].sort();
  if (events.length === 0 || paths.length === 0) return null;
  return withExclusiveDirectoryLock(repoRoot, LOCK_PATH, () => {
    const existingName = names(repoRoot, 'pending')[0];
    if (existingName) return readJson<ArchitectureProjectionJobV1>(join(repoRoot, directory('pending'), existingName));
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
      if (job.ownerPid && processIsAlive(job.ownerPid)) continue;
      const pending = { ...job, status: 'pending' as const, updatedAt: now.toISOString(), ownerPid: undefined };
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
    const name = names(repoRoot, 'pending')[0];
    if (!name) return null;
    const pendingPath = join(repoRoot, directory('pending'), name);
    const pending = readJson<ArchitectureProjectionJobV1>(pendingPath);
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

export function architectureProjectionQueueState(repoRoot: string): ArchitectureProjectionQueueStateV1 {
  const pendingNames = names(repoRoot, 'pending');
  return {
    schemaVersion: 'repo-harness.architecture-projection-queue-state/v1',
    pending: pendingNames.length,
    running: names(repoRoot, 'running').length,
    receipts: names(repoRoot, 'receipts').length,
    deadLetters: names(repoRoot, 'dead-letter').length,
    oldestPendingJobId: pendingNames[0]?.replace(/\.json$/, '') ?? null,
  };
}
