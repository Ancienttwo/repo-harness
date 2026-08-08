import {
  PROJECTION_REQUEST_VERSION,
  type ArchitectureProjectionPolicy,
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
  architectureProjectionDeadLetterForSourceEvents,
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
  const root = realpathSync(resolve(repoRoot));
  const now = options.now?.() ?? new Date();
  const events = options.sourceEvents ?? [];
  const eventIds = events.map((event) => event.event_id);
  const observedPaths = events.flatMap((event) => event.changed_paths);
  let policy: ArchitectureProjectionPolicy;
  try {
    policy = options.policy ?? loadArchitectureProjectionPolicy(root);
  } catch (error) {
    return failPreflight(root, events, observedPaths, now, error);
  }
  if (policy.provider === 'disabled' || policy.applyMode !== 'automatic') return outcome(root, 'disabled', null, eventIds, null, null, true);
  const clock = options.nowMs ?? Date.now;
  const deadlineMs = clock() + policy.timeoutMs;
  recoverAbandonedArchitectureProjectionJobs(root, now);
  const blocked = architectureProjectionDeadLetterForSourceEvents(root, eventIds);
  if (blocked) return outcome(root, 'dead-letter', blocked.job.jobId, blocked.job.sourceEventIds, null, blocked.failure.message, false);
  let owned: string[];
  try {
    owned = architectureProjectionOwnedPaths(root);
  } catch (error) {
    return failPreflight(root, events, observedPaths, now, error);
  }
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
  if (!job) return outcome(root, 'idle', null, events.map((event) => event.event_id), null, null, false);
  try {
    const request: ProjectionRequestV1 = {
      schemaVersion: PROJECTION_REQUEST_VERSION,
      requestId: `repo-harness.projection.${job.jobId}`,
      profile: 'repo-harness/v1',
      mode: 'apply',
      targets: ['agent-context', 'architecture-docs'],
      changedPaths: job.changedPaths,
      expected: captureArchitectureProjectionSnapshot(root),
    };
    const result = runArchitectureProjection(request, root, { ...options, policy, deadlineMs, nowMs: clock });
    if (result.status === 'retryable-failure') throw new ClassifiedProjectionError('process', 'archctx returned retryable-failure');
    if (result.status === 'blocked') throw new ClassifiedProjectionError('process', summarizeNonTerminal(result));
    if (result.status !== 'applied' && result.status !== 'noop') {
      throw new ClassifiedProjectionError('permanent', summarizeNonTerminal(result));
    }
    const refreshReceipts = consumeArchitectureRefreshSignals(root, result.refreshSignals, job.changedPaths, {
      env: options.env,
      run: options.runRefreshActions,
      now,
      deadlineMs,
      nowMs: clock,
    });
    if (clock() >= deadlineMs) throw new ClassifiedProjectionError('timeout', 'architecture projection drain exceeded its total deadline');
    completeArchitectureProjectionJob(root, job, result, refreshReceipts.map((entry) => entry.receiptDigest), now);
    return outcome(root, 'succeeded', job.jobId, job.sourceEventIds, result.status, null, true);
  } catch (error) {
    const classified = classify(error);
    let transition: ReturnType<typeof failArchitectureProjectionJob>;
    try {
      transition = failArchitectureProjectionJob(root, job, classified, now);
    } catch (transitionError) {
      const transitionMessage = transitionError instanceof Error ? transitionError.message : String(transitionError);
      throw new Error(`${classified.message}; architecture projection failure transition failed: ${transitionMessage}`, { cause: error });
    }
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

function summarizeNonTerminal(result: ProjectionResultV1): string {
  const actions = result.humanActions
    .map((action) => `${action.reasonCode} [${action.affectedNodeIds.join(',') || 'repository'}] payload=${action.requestPayloadDigest}`)
    .join('; ')
    .slice(0, 600);
  return `archctx returned ${result.status}${actions ? `; human actions: ${actions}` : ''}`;
}

function failPreflight(
  repoRoot: string,
  events: readonly ArchitectureProjectionSourceEvent[],
  changedPaths: readonly string[],
  now: Date,
  error: unknown,
): ArchitectureProjectionDrainResultV1 {
  const eventIds = events.map((event) => event.event_id);
  if (eventIds.length === 0 || changedPaths.length === 0) throw error;
  const blocked = architectureProjectionDeadLetterForSourceEvents(repoRoot, eventIds);
  if (blocked) return outcome(repoRoot, 'dead-letter', blocked.job.jobId, blocked.job.sourceEventIds, null, blocked.failure.message, false);
  const expectedJobId = architectureProjectionJobId(eventIds, changedPaths);
  const queued = enqueueArchitectureProjectionJob(repoRoot, eventIds, changedPaths, now);
  if (!queued || queued.jobId !== expectedJobId) return outcome(repoRoot, 'idle', null, eventIds, null, null, false);
  const job = claimNextArchitectureProjectionJob(repoRoot, now);
  if (!job) return outcome(repoRoot, 'idle', null, eventIds, null, null, false);
  const classified = classify(error);
  const transition = failArchitectureProjectionJob(repoRoot, job, classified, now);
  return outcome(
    repoRoot,
    transition.state === 'dead-letter' ? 'dead-letter' : 'retry-pending',
    job.jobId,
    job.sourceEventIds,
    null,
    classified.message,
    false,
  );
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
