import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ARCHCTX_REQUIRED_VERSION } from '../../core/architecture/projection';
import {
  capabilityPathResolutionFromArchcontextOwners,
  normalizeCapabilityPath,
  type ArchcontextPathOwner,
  type CapabilityPathResolution,
  type CapabilityRegistry,
  type CapabilityRegistryDiagnostic,
} from '../../core/capabilities/registry';
import { runPackageLocalArchctxJson, type ArchctxProviderOptions } from '../architecture/archctx-provider';

const RESOLVE_TIMEOUT_MS = 30_000;

type ArchctxResolveResult = Omit<ArchcontextPathOwner, 'path'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isDirectory(repoRoot: string, path: string): boolean {
  try { return statSync(resolve(repoRoot, path)).isDirectory(); } catch { return false; }
}

function readOwners(value: unknown, queries: readonly string[]): ArchctxResolveResult[] {
  if (!isRecord(value) || value.schemaVersion !== 'archcontext.envelope/v1') throw new Error('archctx resolve returned an invalid envelope');
  if (value.ok !== true) {
    const error = isRecord(value.error) ? `${String(value.error.code)}: ${String(value.error.message)}` : 'unknown error';
    throw new Error(`archctx resolve failed: ${error}`);
  }
  const results = isRecord(value.data) ? value.data.results : undefined;
  if (!Array.isArray(results) || results.length !== queries.length) throw new Error('archctx resolve returned a result count that does not match the request');
  return results.map((result, index) => {
    if (!isRecord(result) || result.path !== queries[index] || typeof result.matched !== 'boolean' || typeof result.ambiguous !== 'boolean'
      || (result.owningCapabilityId !== null && typeof result.owningCapabilityId !== 'string')) {
      throw new Error(`archctx resolve returned an invalid result for ${queries[index]}`);
    }
    return { matched: result.matched, ambiguous: result.ambiguous, owningCapabilityId: result.owningCapabilityId as string | null };
  });
}

/**
 * Resolves path owners through the package-local `archctx resolve --paths-from`,
 * the only ownership authority under `capability_source: archcontext`. One
 * process serves the whole batch. The path list goes through a private temp file
 * outside the repository, so a hook never writes into the worktree. An existing
 * directory is sent as `dir/`, which asks ArchContext who owns its contents.
 * Any archctx failure throws; callers fail closed.
 */
export function resolveArchcontextCapabilityPaths(
  repoRoot: string,
  registry: CapabilityRegistry,
  inputPaths: readonly string[],
  options: ArchctxProviderOptions = {},
): CapabilityPathResolution {
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
  const queries = paths.map((path) => (isDirectory(repoRoot, path) ? `${path}/` : path));
  let results: ArchctxResolveResult[] = [];
  if (queries.length > 0) {
    const dir = mkdtempSync(join(tmpdir(), 'repo-harness-archctx-resolve-'));
    try {
      const listPath = join(dir, 'paths.txt');
      writeFileSync(listPath, `${queries.join('\n')}\n`, { mode: 0o600 });
      // Exit 2 means at least one ambiguous path; the envelope still carries every result.
      const { value } = runPackageLocalArchctxJson(repoRoot, ARCHCTX_REQUIRED_VERSION, ['resolve', '--paths-from', listPath, '--json'], options, RESOLVE_TIMEOUT_MS, true);
      results = readOwners(value, queries);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const resolution = capabilityPathResolutionFromArchcontextOwners(registry, results.map((result, index) => ({ ...result, path: paths[index] })));
  if (diagnostics.length === 0) return resolution;
  return { ...resolution, status: 'invalid', diagnostics: [...diagnostics, ...resolution.diagnostics] };
}
