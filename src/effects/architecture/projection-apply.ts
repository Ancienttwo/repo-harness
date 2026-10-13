import { digestJson, type Json, type ProjectionResultV2, type ProjectionRequestV1 } from 'archctx-contracts';
import { lstatSync, readFileSync, realpathSync, type Stats } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
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

/** archctx observes and accepts at one snapshot under its writer lock. */
export function applyArchitectureProjection(repoRoot: string, options: ArchitectureProjectionApplyOptions = {}): ProjectionResultV2 {
  const request = architectureProjectionRequest(options.mode ?? 'apply', repoRoot, options);
  let result: ProjectionResultV2;
  try {
    result = (options.runProjection ?? ((input, root) => runArchitectureProjection(input, root, options)))(request, repoRoot);
  } catch (error) {
    if (!(error instanceof ArchctxClientError) || error.code !== 'AC_PROJECTION_APPLY_COMMITTED' || error.action !== 'readback-committed-projection-apply') throw error;
    const readbackRequest = error.details?.readbackRequest;
    if (!readbackRequest || typeof readbackRequest !== 'object' || Array.isArray(readbackRequest)) throw new Error('committed apply has no typed readbackRequest; cannot prove its result');
    // archctx validates this exact producer-owned request and the current outputs.
    result = (options.runReadback ?? readArchitectureProjectionApply)(readbackRequest as unknown as ProjectionRequestV1, repoRoot, options).receipt.result;
    // A readback proves the earlier apply. It cannot accept a different request.
    if (error.reasonCode !== 'projection-accepted-change-committed') throw error;
  }
  if (result.status === 'applied') verifyArchitectureProjectionOutputs(result, repoRoot);
  return result;
}

/** Read back each provider-owned output, including the absence proof for deletes. */
export function verifyArchitectureProjectionOutputs(result: ProjectionResultV2, repoRoot: string): void {
  const root = realpathSync(repoRoot);
  for (const file of result.files) {
    const path = resolve(root, file.path);
    if (isAbsolute(file.path) || !path.startsWith(`${root}${sep}`)) throw new Error(`projection output path escapes repository: ${file.path}`);
    let entry: Stats | null;
    try { entry = lstatSync(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; entry = null; }
    if (entry && !realpathSync(path).startsWith(`${root}${sep}`)) throw new Error(`projection output symlink escapes repository: ${file.path}`);
    const actual = entry ? digestJson({ path: file.path, body: readFileSync(path, 'utf8') } as Json) : null;
    if (actual !== file.outputDigest) throw new ArchctxClientError({ code: 'RH_ARCHCTX_OUTPUT_MISMATCH', action: 'check-projection-outputs', message: `${result.replayed ? 'a replayed receipt did not write' : 'applied receipt does not match'} ${file.path}; run architecture-projection check --json; a different request needs a new --request-id. archctx 0.7.2 cannot restore reverted outputs by receipt replay (arch-context#325)` });
  }
}
