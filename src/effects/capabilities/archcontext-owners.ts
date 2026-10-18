import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ARCHCTX_REQUIRED_VERSION } from '../../core/architecture/projection';
import {
  capabilityPathResolutionFromArchcontextOwners,
  capabilityIdentityFromNodeId,
  capabilityRegistryFromNativeContext,
  normalizeCapabilityPath,
  type ArchcontextCapabilityResolution,
  type Capability,
  type CapabilityIdentity,
  type ArchcontextPathOwner,
  type CapabilityPathResolution,
  type CapabilityRegistryDiagnostic,
} from '../../core/capabilities/registry';
import { ArchctxClientError, readArchitectureNativeContext, runPackageLocalArchctxJson, type ArchctxProviderOptions } from '../architecture/archctx-provider';
import { currentReadonlyObservation } from '../state/readonly-observation';

export interface ArchcontextOwnerLookup<C> {
  get(nodeId: string): C | undefined;
}

export const ARCHCONTEXT_IDENTITY_OWNERS: ArchcontextOwnerLookup<CapabilityIdentity> = {
  get: (nodeId) => capabilityIdentityFromNodeId(nodeId) ?? undefined,
};

/** Keep native model diagnostics useful without printing the whole issue list. */
export function formatArchcontextCapabilityError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!(error instanceof ArchctxClientError) || !Array.isArray(error.details?.issues)) return message;
  const nativeIssues: readonly unknown[] = error.details.issues;
  const issues = nativeIssues.filter(isRecord);
  const details = issues.slice(0, 5).map((issue) => [issue.entityId, issue.field, issue.invariant]
    .filter((field) => typeof field === 'string').join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (issues.length > 5) details.push(`+${issues.length - 5} more`);
  return details.length > 0 ? `${message}; ${details.join('; ')}` : message;
}

/** Cold readers get the complete model from one worktree export. */
export function readArchcontextCapabilityAuthority(
  repoRoot: string,
  options: ArchctxProviderOptions = {},
): ArchcontextCapabilityResolution {
  try {
    return capabilityRegistryFromNativeContext(readArchitectureNativeContext(repoRoot, { kind: 'worktree' }, options), { repoRoot });
  } catch (error) {
    if (!(error instanceof ArchctxClientError)) throw error;
    return {
      status: 'invalid', registry: null, owners: null,
      diagnostics: [{ code: 'ARCHCONTEXT_MODEL_REJECTED', path: '.archcontext/model/nodes', message: formatArchcontextCapabilityError(error) }],
    };
  }
}

// Ownership also runs in notice hooks. Each archctx call has a 3 s ceiling.
const RESOLVE_TIMEOUT_MS = 3_000;

type ArchctxResolveResult = Omit<ArchcontextPathOwner, 'path'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isDirectory(repoRoot: string, path: string): boolean {
  try { return statSync(resolve(repoRoot, path)).isDirectory(); } catch { return false; }
}

/**
 * archctx ran and answered with an error envelope: it rejected the model, so
 * the model needs repair. This is a registry fault, not an unavailable runtime.
 */
function rejectedModel(value: unknown): CapabilityRegistryDiagnostic | null {
  if (!isRecord(value) || value.schemaVersion !== 'archcontext.envelope/v1' || value.ok !== false) return null;
  const error = isRecord(value.error) ? `${String(value.error.code)}: ${String(value.error.message)}` : 'unknown error';
  return { code: 'ARCHCONTEXT_MODEL_REJECTED', path: '.archcontext/model/nodes', message: `archctx resolve rejected the model: ${error}` };
}

function readOwners(value: unknown, queries: readonly string[]): ArchctxResolveResult[] {
  if (!isRecord(value) || value.schemaVersion !== 'archcontext.envelope/v1' || value.ok !== true) throw new Error('archctx resolve returned an invalid envelope');
  const results = isRecord(value.data) ? value.data.results : undefined;
  if (!Array.isArray(results) || results.length !== queries.length) throw new Error('archctx resolve returned a result count that does not match the request');
  return results.map((result, index) => {
    if (!isRecord(result) || result.path !== queries[index] || typeof result.matched !== 'boolean' || typeof result.ambiguous !== 'boolean'
      || (result.owningCapabilityId !== null && typeof result.owningCapabilityId !== 'string')
      || (result.candidates !== undefined && (!Array.isArray(result.candidates) || result.candidates.some((entry) => typeof entry !== 'string')))) {
      throw new Error(`archctx resolve returned an invalid result for ${queries[index]}`);
    }
    return {
      matched: result.matched,
      ambiguous: result.ambiguous,
      owningCapabilityId: result.owningCapabilityId as string | null,
      candidates: (result.candidates ?? []) as string[],
    };
  });
}

function prepareQueries(repoRoot: string, inputPaths: readonly string[]) {
  const diagnostics: CapabilityRegistryDiagnostic[] = [];
  const paths: string[] = [];
  for (const inputPath of inputPaths) {
    try {
      const path = normalizeCapabilityPath(inputPath, repoRoot);
      if (!paths.includes(path)) paths.push(path);
    } catch (error) {
      diagnostics.push({ code: 'INVALID_PATH', path: 'path', message: (error as Error).message });
    }
  }
  return { diagnostics, paths, queries: paths.map((path) => (isDirectory(repoRoot, path) ? `${path}/` : path)) };
}

/** The exact query lines archctx receives; a directory becomes `dir/`. Callers key caches on them. */
export function archcontextResolveQueries(repoRoot: string, inputPaths: readonly string[]): string[] {
  return prepareQueries(repoRoot, inputPaths).queries;
}

/**
 * Resolves path owners through the package-local `archctx resolve --paths-from`,
 * the only ownership authority under `capability_source: archcontext`. One
 * process serves the whole batch. The path list goes through a private temp file
 * outside the repository, so a hook never writes into the worktree. An existing
 * directory is sent as `dir/`, which asks ArchContext who owns its contents.
 * A process, version or runtime failure throws; callers fail closed. An archctx
 * error envelope is an `invalid` result with `ARCHCONTEXT_MODEL_REJECTED`. Inside a read-only
 * observation archctx never starts: the result is `unavailable` instead.
 */
export function resolveArchcontextCapabilityPaths<C extends { readonly id: string } = Capability>(
  repoRoot: string,
  owners: ArchcontextOwnerLookup<C>,
  inputPaths: readonly string[],
  options: ArchctxProviderOptions = {},
): CapabilityPathResolution<C> {
  const { diagnostics, paths, queries } = prepareQueries(repoRoot, inputPaths);
  let results: ArchctxResolveResult[] = [];
  if (queries.length > 0 && currentReadonlyObservation()) {
    return {
      status: 'unavailable',
      capabilityIds: [],
      matches: [],
      unmappedPaths: [],
      diagnostics: [{
        code: 'ARCHCONTEXT_RESOLVE_UNAVAILABLE',
        path: '.archcontext/model/nodes',
        message: 'path ownership needs archctx resolve, which a read-only observation does not start',
      }],
    };
  }
  if (queries.length > 0) {
    const dir = mkdtempSync(join(tmpdir(), 'repo-harness-archctx-resolve-'));
    try {
      const listPath = join(dir, 'paths.txt');
      writeFileSync(listPath, `${queries.join('\n')}\n`, { mode: 0o600 });
      // Exit 2 means at least one ambiguous path; the envelope still carries every result.
      const { value } = runPackageLocalArchctxJson(repoRoot, ARCHCTX_REQUIRED_VERSION, ['resolve', '--paths-from', listPath, '--json'], options, RESOLVE_TIMEOUT_MS, true);
      const rejected = rejectedModel(value);
      if (rejected) {
        return { status: 'invalid', capabilityIds: [], matches: [], unmappedPaths: [], diagnostics: [...diagnostics, rejected] };
      }
      results = readOwners(value, queries);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const resolution = capabilityPathResolutionFromArchcontextOwners(owners, results.map((result, index) => ({ ...result, path: paths[index] })));
  if (diagnostics.length === 0) return resolution;
  return { ...resolution, status: 'invalid', diagnostics: [...diagnostics, ...resolution.diagnostics] };
}
