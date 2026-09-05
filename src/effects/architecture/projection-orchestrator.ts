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
  type ArchitectureProjectionProviderDiagnostic,
  type ArchctxProviderOptions,
} from './archctx-provider';
import {
  architectureProjectionQueueState,
  architectureProjectionDeadLetterForSourceKeys,
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
import type { AcceptedArchitectureChangeReferenceV1 } from 'archctx-contracts';
import { recordArchitectureProjectionAcceptanceCandidates } from './projection-acceptance';

export interface ArchitectureProjectionSourceEvent {
  readonly source_key: string;
  readonly event_id: string;
  readonly changed_paths: readonly string[];
}

export interface ArchitectureProjectionDrainResultV1 {
  schemaVersion: 'repo-harness.architecture-projection-drain/v1';
  status: 'disabled' | 'idle' | 'succeeded' | 'reconcile-pending' | 'retry-pending' | 'dead-letter';
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
  acceptedChange?: AcceptedArchitectureChangeReferenceV1;
}

export function drainArchitectureProjectionJobs(
  repoRoot: string,
  options: ArchitectureProjectionOrchestratorOptions = {},
): ArchitectureProjectionDrainResultV1 {
  const root = realpathSync(resolve(repoRoot));
  const now = options.now?.() ?? new Date();
  const events = options.sourceEvents ?? [];
  const eventIds = events.map((event) => event.event_id);
  const sourceKeys = events.map((event) => event.source_key);
  const observedPaths = events.flatMap((event) => event.changed_paths);
  let policy: ArchitectureProjectionPolicy;
  try {
    policy = options.policy ?? loadArchitectureProjectionPolicy(root);
  } catch (error) {
    return failPreflight(root, events, observedPaths, now, error, options.acceptedChange);
  }
  if (policy.provider === 'disabled' || policy.applyMode !== 'automatic') return outcome(root, 'disabled', null, eventIds, null, null, true);
  const clock = options.nowMs ?? Date.now;
  const deadlineMs = Math.min(options.deadlineMs ?? Infinity, clock() + policy.timeoutMs);
  recoverAbandonedArchitectureProjectionJobs(root, now);
  const blocked = architectureProjectionDeadLetterForSourceKeys(root, sourceKeys);
  if (blocked) return outcome(root, 'dead-letter', blocked.job.jobId, blocked.job.sourceEventIds, null, blocked.failure.message, false);
  let owned: string[];
  try {
    owned = architectureProjectionOwnedPaths(root);
  } catch (error) {
    return failPreflight(root, events, observedPaths, now, error, options.acceptedChange);
  }
  const eligible = events.flatMap((event) => event.changed_paths).filter((path) => !isOwned(path, owned));
  if (events.length > 0 && eligible.length === 0) {
    return outcome(root, 'idle', null, events.map((event) => event.event_id), null, null, true);
  }
  const aggregateId = architectureProjectionJobId(events.map((event) => event.event_id), eligible, options.acceptedChange);
  const aggregateState = architectureProjectionJobState(root, aggregateId);
  if (aggregateState === 'running') return outcome(root, 'idle', aggregateId, events.map((event) => event.event_id), null, null, false);
  if (aggregateState === 'dead-letter') return outcome(root, 'dead-letter', aggregateId, events.map((event) => event.event_id), null, 'job already dead-lettered', false);
  if (aggregateState === 'receipt') return outcome(root, 'idle', aggregateId, events.map((event) => event.event_id), null, null, true);
  enqueueArchitectureProjectionJob(root, eventIds, sourceKeys, eligible, now, options.acceptedChange);
  const job = claimNextArchitectureProjectionJob(root, now);
  if (!job) return outcome(root, 'idle', null, events.map((event) => event.event_id), null, null, false);
  let completedResultStatus: ProjectionResultV1['status'] | null = null;
  try {
    const request: ProjectionRequestV1 = {
      schemaVersion: PROJECTION_REQUEST_VERSION,
      requestId: `repo-harness.projection.${job.jobId}`,
      profile: 'repo-harness/v1',
      mode: 'apply',
      targets: ['agent-context', 'architecture-docs'],
      changedPaths: job.changedPaths,
      expected: captureArchitectureProjectionSnapshot(root),
      ...(job.acceptedChange ? { acceptedChange: job.acceptedChange } : {}),
    };
    const diagnostics: ArchitectureProjectionProviderDiagnostic[] = [];
    const result = runArchitectureProjection(request, root, {
      ...options,
      policy,
      deadlineMs,
      nowMs: clock,
      onDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
        options.onDiagnostic?.(diagnostic);
      },
    });
    recordArchitectureProjectionAcceptanceCandidates(root, request, result, { jobId: job.jobId });
    if (result.status === 'applied-reconcile-required') {
      const diagnostic = diagnostics.find((entry) => entry.code === 'post-apply-reconciliation-required');
      if (!diagnostic) throw new ClassifiedProjectionError('invalid-result', 'archctx returned applied-reconcile-required without provider reconciliation evidence');
      const transition = failArchitectureProjectionJob(root, job, { kind: 'reconciliation', message: diagnostic.message }, now);
      if (transition.state !== 'pending') throw new Error('architecture projection reconciliation unexpectedly dead-lettered');
      return outcome(root, 'reconcile-pending', job.jobId, job.sourceEventIds, result.status, diagnostic.message, false);
    }
    if (result.status === 'retryable-failure') throw new ClassifiedProjectionError('process', 'archctx returned retryable-failure');
    if (result.status === 'blocked') throw new ClassifiedProjectionError('process', summarizeNonTerminal(result));
    if (result.status !== 'applied' && result.status !== 'noop') {
      throw new ClassifiedProjectionError('permanent', summarizeNonTerminal(result));
    }
    const unresolvedMajor = result.refreshSignals.find((signal) => signal.mode === 'human-action-required');
    if (unresolvedMajor) {
      throw new ClassifiedProjectionError(
        'permanent',
        `archctx returned unresolved major change ${unresolvedMajor.signalId}: ${unresolvedMajor.reasonCodes.join(',')} [${unresolvedMajor.affectedNodeIds.join(',')}]`,
      );
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
    completedResultStatus = result.status;
  } catch (error) {
    // A host yielding its shorter time slice is not a failed business attempt.
    const classified = options.deadlineMs !== undefined && clock() >= options.deadlineMs
      ? { kind: 'host-budget' as const, message: 'host architecture projection budget exhausted; job retained for an explicit drain' }
      : classify(error);
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
  return outcome(root, 'succeeded', job.jobId, job.sourceEventIds, completedResultStatus, null, true);
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
  acceptedChange?: AcceptedArchitectureChangeReferenceV1,
): ArchitectureProjectionDrainResultV1 {
  const eventIds = events.map((event) => event.event_id);
  const sourceKeys = events.map((event) => event.source_key);
  if (eventIds.length === 0 || changedPaths.length === 0) throw error;
  const message = error instanceof Error ? error.message : String(error);
  const blocked = architectureProjectionDeadLetterForSourceKeys(repoRoot, sourceKeys);
  if (blocked) return outcome(repoRoot, 'dead-letter', blocked.job.jobId, blocked.job.sourceEventIds, null, blocked.failure.message, false);
  const expectedJobId = architectureProjectionJobId(eventIds, changedPaths, acceptedChange);
  const queued = enqueueArchitectureProjectionJob(repoRoot, eventIds, sourceKeys, changedPaths, now, acceptedChange);
  if (!queued || queued.jobId !== expectedJobId) {
    return outcome(repoRoot, 'retry-pending', queued?.jobId ?? null, eventIds, null, message, false);
  }
  const job = claimNextArchitectureProjectionJob(repoRoot, now);
  if (!job) return outcome(repoRoot, 'retry-pending', queued.jobId, eventIds, null, message, false);
  const transition = failArchitectureProjectionJob(repoRoot, job, { kind: 'preflight', message }, now);
  return outcome(
    repoRoot,
    transition.state === 'dead-letter' ? 'dead-letter' : 'retry-pending',
    job.jobId,
    job.sourceEventIds,
    null,
    message,
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
