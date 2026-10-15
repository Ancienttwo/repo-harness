import type { ProjectionResultV2, ProjectionRequestV1 } from 'archctx-contracts';
import {
  ArchctxClientError,
  architectureProjectionRequest,
  readArchitectureProjectionApply,
  runArchitectureProjection,
  type ArchitectureProjectionRequestOptions,
  type ArchctxProviderOptions,
} from './archctx-provider';

export interface ArchitectureProjectionApplyOptions extends ArchctxProviderOptions, ArchitectureProjectionRequestOptions {
  readonly mode?: 'apply' | 'adopt';
  readonly runProjection?: (request: ProjectionRequestV1, repoRoot: string) => ProjectionResultV2;
  readonly runReadback?: typeof readArchitectureProjectionApply;
}

/**
 * archctx observes and accepts at one snapshot under its writer lock. It also
 * proves the committed outputs before a replay and restores reverted outputs,
 * so this caller does not read the outputs again.
 */
export function applyArchitectureProjection(repoRoot: string, options: ArchitectureProjectionApplyOptions = {}): ProjectionResultV2 {
  const request = architectureProjectionRequest(options.mode ?? 'apply', repoRoot, options);
  try {
    return (options.runProjection ?? ((input, root) => runArchitectureProjection(input, root, options)))(request, repoRoot);
  } catch (error) {
    if (!(error instanceof ArchctxClientError) || error.code !== 'AC_PROJECTION_APPLY_COMMITTED' || error.action !== 'readback-committed-projection-apply') throw error;
    const readbackRequest = error.details?.readbackRequest;
    if (!readbackRequest || typeof readbackRequest !== 'object' || Array.isArray(readbackRequest)) throw new Error('committed apply has no typed readbackRequest; cannot prove its result');
    // archctx validates this exact producer-owned request and the current outputs.
    const result = (options.runReadback ?? readArchitectureProjectionApply)(readbackRequest as unknown as ProjectionRequestV1, repoRoot, options).receipt.result;
    // A readback proves the earlier apply. It cannot accept a different request.
    if (error.reasonCode !== 'projection-accepted-change-committed') throw error;
    return result;
  }
}
