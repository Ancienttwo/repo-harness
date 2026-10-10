import {
  PROJECTION_REQUEST_VERSION,
  assertProjectionApplyReadbackResult,
  assertProjectionResult,
  type ArchitectureRefreshSignalV1,
  type ProjectionRequestV1,
  type ProjectionResultV1,
} from '../../core/architecture/projection';
import {
  captureArchitectureProjectionSnapshot,
  readArchitectureProjectionApply,
  runArchitectureProjection,
  type ArchctxProviderOptions,
} from './archctx-provider';

type AcceptedChange = NonNullable<ProjectionRequestV1['acceptedChange']>;

export interface ArchitectureProjectionApplyOptions extends ArchctxProviderOptions {
  readonly mode?: 'apply' | 'adopt';
  readonly adoptionPlanId?: string;
  readonly changedPaths?: readonly string[];
  readonly requestId?: string;
  readonly runProjection?: (request: ProjectionRequestV1, repoRoot: string) => ProjectionResultV1;
  readonly runReadback?: typeof readArchitectureProjectionApply;
}

/**
 * Apply the projection for the current worktree. The Agent that runs apply owns
 * the architecture decision, and the pull request review is the human gate. So a
 * major change that ArchContext reports is accepted from its own signal, in the
 * same call. A lost provider response for a committed accepted apply is read back
 * instead of applied twice.
 */
export function applyArchitectureProjection(repoRoot: string, options: ArchitectureProjectionApplyOptions = {}): ProjectionResultV1 {
  const run = options.runProjection ?? ((request, root) => runArchitectureProjection(request, root, options));
  const mode = options.mode ?? 'apply';
  const request = (acceptedChange?: AcceptedChange): ProjectionRequestV1 => ({
    schemaVersion: PROJECTION_REQUEST_VERSION,
    requestId: `${options.requestId ?? `repo-harness.${mode}`}${acceptedChange ? '.accepted' : ''}`,
    profile: 'repo-harness/v1',
    mode,
    targets: ['architecture-docs'],
    changedPaths: [...new Set(options.changedPaths ?? [])].sort(),
    expected: captureArchitectureProjectionSnapshot(repoRoot),
    ...(mode === 'adopt' ? { adoptionPlanId: options.adoptionPlanId } : {}),
    ...(acceptedChange ? { acceptedChange } : {}),
  });

  const first = run(request(), repoRoot);
  const signal = first.refreshSignals.find(isUnresolvedMajor);
  if (!signal) return first;

  const accepted = request(acceptedChangeFor(signal));
  try {
    return run(accepted, repoRoot);
  } catch (error) {
    if (mode !== 'apply' || !/committed projection receipt/i.test(error instanceof Error ? error.message : String(error))) throw error;
    const readback = assertProjectionApplyReadbackResult((options.runReadback ?? readArchitectureProjectionApply)(accepted, repoRoot, options), accepted);
    return assertProjectionResult(readback.receipt.result, accepted.requestId);
  }
}

function isUnresolvedMajor(signal: ArchitectureRefreshSignalV1): boolean {
  return signal.mode === 'human-action-required' && signal.cause === 'unresolved-major-candidate';
}

function acceptedChangeFor(signal: ArchitectureRefreshSignalV1): AcceptedChange {
  const id = signal.signalId.slice('sha256:'.length, 'sha256:'.length + 16);
  return {
    changeSetId: `changeset.docs-projection-${signal.resultingDigests.projectionDigest.slice('sha256:'.length, 'sha256:'.length + 16)}`,
    eventId: `repo-harness.apply.${id}`,
    reasonCodes: [...signal.reasonCodes] as AcceptedChange['reasonCodes'],
    affectedNodeIds: [...signal.affectedNodeIds],
  };
}
