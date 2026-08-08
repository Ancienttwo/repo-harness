import {
  PROJECTION_REQUEST_VERSION,
  type ProjectionRequestV1,
  type ProjectionResultV1,
} from '../../core/architecture/projection';
import {
  architectureProjectionOwnedPaths,
  captureArchitectureProjectionSnapshot,
  loadArchitectureProjectionPolicy,
  runArchitectureProjection,
  type ArchctxProviderOptions,
} from './archctx-provider';
import {
  architectureProjectionQueueState,
  architectureProjectionJobId,
  architectureProjectionJobState,
  claimNextArchitectureProjectionJob,
  completeArchitectureProjectionJob,
  enqueueArchitectureProjectionJob,
  failArchitectureProjectionJob,
  recoverAbandonedArchitectureProjectionJobs,
  type ArchitectureProjectionQueueStateV1,
  type ProjectionJobFailureKind,
} from './projection-jobs';
import {
  consumeArchitectureRefreshSignals,
  type RunArchitectureRefreshActions,
} from './refresh-consumer';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ArchitectureProjectionSourceEvent {
  readonly event_id: string;
  readonly changed_paths: readonly string[];
}

export interface ArchitectureProjectionDrainResultV1 {
  schemaVersion: 'repo-harness.architecture-projection-drain/v1';
  status: 'disabled' | 'idle' | 'succeeded' | 'retry-pending' | 'dead-letter';
  jobId: string | null;
  sourceEventIds: string[];
  resultStatus: ProjectionResultV1['status'] | null;
  error: string | null;
  acknowledgeSourceEvents: boolean;
  queue: ArchitectureProjectionQueueStateV1;
}

export interface ArchitectureProjectionOrchestratorOptions extends ArchctxProviderOptions {
  now?: () => Date;
  runRefreshActions?: RunArchitectureRefreshActions;
  sourceEvents?: readonly ArchitectureProjectionSourceEvent[];
}

export function drainArchitectureProjectionJobs(
  repoRoot: string,
  options: ArchitectureProjectionOrchestratorOptions = {},
): ArchitectureProjectionDrainResultV1 {
  const policy = options.policy ?? loadArchitectureProjectionPolicy(repoRoot);
  if (policy.provider === 'disabled') return outcome(repoRoot, 'disabled', null, [], null, null, true);
  const root = realpathSync(resolve(repoRoot));
  const now = options.now?.() ?? new Date();
  recoverAbandonedArchitectureProjectionJobs(root, now);
  const events = options.sourceEvents ?? [];
  const owned = architectureProjectionOwnedPaths(root);
  const eligible = events.flatMap((event) => event.changed_paths).filter((path) => !isOwned(path, owned));
  if (events.length > 0 && eligible.length === 0) {
    return outcome(root, 'idle', null, events.map((event) => event.event_id), null, null, true);
  }
  const aggregateId = architectureProjectionJobId(events.map((event) => event.event_id), eligible);
  const aggregateState = architectureProjectionJobState(root, aggregateId);
  if (aggregateState === 'running') return outcome(root, 'idle', aggregateId, events.map((event) => event.event_id), null, null, false);
  if (aggregateState === 'dead-letter') return outcome(root, 'dead-letter', aggregateId, events.map((event) => event.event_id), null, 'job already dead-lettered', false);
  if (aggregateState === 'receipt') return outcome(root, 'idle', aggregateId, events.map((event) => event.event_id), null, null, true);
  enqueueArchitectureProjectionJob(root, events.map((event) => event.event_id), eligible, now);
  const job = claimNextArchitectureProjectionJob(root, now);
  if (!job) return outcome(root, 'idle', null, [], null, null, true);
  try {
    const request: ProjectionRequestV1 = {
      schemaVersion: PROJECTION_REQUEST_VERSION,
      requestId: `repo-harness.projection.${job.jobId}`,
      profile: 'repo-harness/v1',
      mode: policy.applyMode === 'automatic' ? 'apply' : 'plan',
      targets: ['agent-context', 'architecture-docs'],
      changedPaths: job.changedPaths,
      expected: captureArchitectureProjectionSnapshot(root),
    };
    const result = runArchitectureProjection(request, root, { ...options, policy });
    if (result.status === 'retryable-failure') throw new ClassifiedProjectionError('process', 'archctx returned retryable-failure');
    if (result.status === 'permanent-failure' || result.status === 'blocked') {
      throw new ClassifiedProjectionError('permanent', `archctx returned ${result.status}`);
    }
    const refreshReceipts = consumeArchitectureRefreshSignals(root, result.refreshSignals, job.changedPaths, {
      env: options.env,
      run: options.runRefreshActions,
      now,
    });
    completeArchitectureProjectionJob(root, job, result, refreshReceipts.map((entry) => entry.receiptDigest), now);
    return outcome(root, 'succeeded', job.jobId, job.sourceEventIds, result.status, null, true);
  } catch (error) {
    const classified = classify(error);
    const transition = failArchitectureProjectionJob(root, job, classified, now);
    return outcome(
      root,
      transition.state === 'dead-letter' ? 'dead-letter' : 'retry-pending',
      job.jobId,
      job.sourceEventIds,
      null,
      classified.message,
      false,
    );
  }
}

function isOwned(path: string, roots: readonly string[]): boolean {
  return roots.some((root) => path === root || path.startsWith(`${root}/`));
}

class ClassifiedProjectionError extends Error {
  constructor(readonly kind: ProjectionJobFailureKind, message: string) { super(message); }
}

function classify(error: unknown): { kind: ProjectionJobFailureKind; message: string } {
  if (error instanceof ClassifiedProjectionError) return { kind: error.kind, message: error.message };
  const message = error instanceof Error ? error.message : String(error);
  if (/refresh|architecture request|context-contract|capability-context/i.test(message)) return { kind: 'refresh', message };
  if (/snapshot mismatch|stale/i.test(message)) return { kind: 'stale-snapshot', message };
  if (/timeout|timed out|ETIMEDOUT|signal SIGTERM/i.test(message)) return { kind: 'timeout', message };
  if (/corrupt JSON|invalid envelope|result .*invalid|receipt/i.test(message)) return { kind: 'invalid-result', message };
  return { kind: 'process', message };
}

function outcome(
  repoRoot: string,
  status: ArchitectureProjectionDrainResultV1['status'],
  jobId: string | null,
  sourceEventIds: string[],
  resultStatus: ProjectionResultV1['status'] | null,
  error: string | null,
  acknowledgeSourceEvents: boolean,
): ArchitectureProjectionDrainResultV1 {
  return {
    schemaVersion: 'repo-harness.architecture-projection-drain/v1',
    status,
    jobId,
    sourceEventIds: [...sourceEventIds].sort(),
    resultStatus,
    error,
    acknowledgeSourceEvents,
    queue: architectureProjectionQueueState(repoRoot),
  };
}
