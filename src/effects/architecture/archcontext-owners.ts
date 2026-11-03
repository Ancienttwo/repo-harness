import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ArchctxClientError } from '../../core/architecture/projection';
import {
  ARCHCONTEXT_IDENTITY_OWNERS,
  type ArchcontextCapabilityContext,
  type ArchcontextOwnerLookup,
  type ArchcontextResolveCache,
  type ArchctxProviderOptions,
  type ArchitecturePathOwnersRead,
} from '../../core/architecture/contracts';
import {
  capabilityPathResolutionFromArchcontextOwners,
  capabilityIdentityFromNodeId,
  capabilityRegistryFromNativeContext,
  normalizeCapabilityPath,
  type ArchcontextCapabilityResolution,
  type Capability,
  type CapabilityPathResolution,
  type CapabilityRegistryDiagnostic,
} from '../../core/capabilities/registry';
import { CapabilitySourceError } from '../../core/capabilities/resolver';
import { readArchitectureNativeContext, resolveArchitecturePaths } from './architecture-read';
import { currentReadonlyObservation } from '../readonly-observation';

const CAPABILITY_NODES_DIR = '.archcontext/model/nodes';

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

/** The authority and the summary of each capability node, from one worktree export. */
export function readArchcontextCapabilityContext(repoRoot: string): ArchcontextCapabilityContext {
  try {
    const context = readArchitectureNativeContext(repoRoot, { kind: 'worktree' });
    const authority = capabilityRegistryFromNativeContext(context, { repoRoot });
    if (authority.status !== 'valid') throw new CapabilitySourceError(authority.diagnostics.map((item) => item.message).join('; '));
    const summaries = new Map<string, string>();
    for (const node of context.model.nodes) {
      if (node.kind !== 'capability' || typeof node.id !== 'string' || typeof node.summary !== 'string') continue;
      const identity = capabilityIdentityFromNodeId(node.id);
      if (identity) summaries.set(identity.id, node.summary);
    }
    return { registry: authority.registry, owners: authority.owners, summaries };
  } catch (error) {
    if (error instanceof CapabilitySourceError) throw error;
    throw new CapabilitySourceError(formatArchcontextCapabilityError(error));
  }
}

// Notice callers can supply a shorter deadline through ArchctxProviderOptions.
const RESOLVE_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isDirectory(repoRoot: string, path: string): boolean {
  try { return statSync(resolve(repoRoot, path)).isDirectory(); } catch { return false; }
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
 * With a cache, archctx receives only the queries the cache cannot answer.
 */
export function resolveArchcontextCapabilityPaths<C extends { readonly id: string } = Capability>(
  repoRoot: string,
  owners: ArchcontextOwnerLookup<C>,
  inputPaths: readonly string[],
  options: ArchctxProviderOptions = {},
  cache?: ArchcontextResolveCache,
): CapabilityPathResolution<C> {
  const { diagnostics, paths, queries } = prepareQueries(repoRoot, inputPaths);
  const answers = new Map(cache?.lookup(queries) ?? []);
  const misses = queries.filter((query) => !answers.has(query));
  if (misses.length > 0 && currentReadonlyObservation()) {
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
  if (misses.length > 0) {
    const read = resolveArchitecturePaths(repoRoot, misses, options, RESOLVE_TIMEOUT_MS);
    if (!read.ok) {
      // archctx ran and rejected the model: the model needs repair. This is a registry fault, not an unavailable runtime.
      const rejected: CapabilityRegistryDiagnostic = { code: 'ARCHCONTEXT_MODEL_REJECTED', path: '.archcontext/model/nodes', message: `archctx resolve rejected the model: ${read.error.code}: ${read.error.message}` };
      return { status: 'invalid', capabilityIds: [], matches: [], unmappedPaths: [], diagnostics: [...diagnostics, rejected] };
    }
    const resolved = new Map(read.owners.map(({ matched, ambiguous, owningCapabilityId, candidates }, index) => [misses[index]!, { matched, ambiguous, owningCapabilityId, candidates }]));
    cache?.store(resolved);
    for (const [query, result] of resolved) answers.set(query, result);
  }
  const resolution = capabilityPathResolutionFromArchcontextOwners(owners, queries.map((query, index) => ({ ...answers.get(query)!, path: paths[index]! })));
  if (diagnostics.length === 0) return resolution;
  return { ...resolution, status: 'invalid', diagnostics: [...diagnostics, ...resolution.diagnostics] };
}

/**
 * A model rejection never reaches this mapping: archctx answers it with an
 * error envelope, which the resolve returns as ARCHCONTEXT_MODEL_REJECTED.
 */
export function archcontextResolveFailure(error: unknown): CapabilityRegistryDiagnostic {
  const archctxErrorCode = error instanceof ArchctxClientError ? error.code : undefined;
  if (archctxErrorCode === 'RH_ARCHCTX_TIMEOUT') {
    return { code: 'ARCHCONTEXT_RESOLVE_TIMEOUT', path: CAPABILITY_NODES_DIR, message: 'archctx resolve timed out; the architecture notice is skipped for this turn' };
  }
  return {
    code: 'ARCHCONTEXT_RESOLVE_FAILED',
    path: CAPABILITY_NODES_DIR,
    message: (error as Error).message,
    ...(archctxErrorCode ? { archctxErrorCode } : {}),
  };
}

/** The board's path owners: one resolve batch with no policy branch. A typed archctx failure names its code. */
export function readArchcontextPathOwners(repoRoot: string, paths: readonly string[], options?: ArchctxProviderOptions): ArchitecturePathOwnersRead {
  try {
    return { status: 'resolved', resolution: resolveArchcontextCapabilityPaths(repoRoot, ARCHCONTEXT_IDENTITY_OWNERS, paths, options) };
  } catch (error) {
    if (!(error instanceof ArchctxClientError)) throw error;
    return { status: 'failed', code: error.code };
  }
}
