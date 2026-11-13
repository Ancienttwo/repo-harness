// The typed architecture reads for consumers outside ArchContext Closure. Each
// read runs the package-local archctx through the closure client; no write
// command passes through this module.

import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NATIVE_CONTEXT_PROFILE, architectureDocsProjectionManifestIssues, decodeArchitectureHistory, type ArchContextError, type ArchitectureDocsProjectionManifestV4, type ArchitectureHistory, type NativeContextExportV1 } from 'archctx-contracts';
import { isRecord } from '../../core/evidence/is-record';
import { capabilityRegistryFromNativeContext, type ArchcontextPathOwner } from '../../core/capabilities/registry';
import { ARCHCTX_REQUIRED_VERSION, ARCHCONTEXT_MANIFEST, ArchctxClientError, decodeArchitectureHandEdits, decodeNativeContextExport, firstRenderChangeCommit, type DifferingRenderTarget, type NativeContextSource } from '../../core/architecture/projection';
import type { ArchctxProviderOptions } from '../../core/architecture/contracts';
import { gitExecFileSync } from '../git/runner';
import { ArchctxClient } from './archctx-provider';
import { loadArchitectureProjectionPolicy } from './projection-config';

/** A cold `archctx history` derives every model revision (10.9 s for 50 milestones), so it has its own limit. */
export const ARCHITECTURE_HISTORY_TIMEOUT_MS = 120_000;

/** The limit of one operator view read and of one resolve batch of the architecture map. */
export const ARCHITECTURE_VIEW_TIMEOUT_MS = 60_000;

const nativeContextRefs = new Map<string, NativeContextExportV1>();
const NATIVE_CONTEXT_REF_LIMIT = 4;

function freezeNativeContext(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) freezeNativeContext(child);
  Object.freeze(value);
}

/** Worktree reads stay fresh. Immutable commit reads share a four-entry LRU. */
export function readArchitectureNativeContext(
  repoRoot: string,
  source: NativeContextSource,
  options: ArchctxProviderOptions = {},
): NativeContextExportV1 {
  if (source.kind === 'ref' && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(source.commit)) {
    throw new ArchctxClientError({ code: 'RH_ARCHCTX_NATIVE_CONTEXT_INVALID', action: 'update-repo-harness', message: 'native context ref must be a full commit SHA' });
  }
  const key = source.kind === 'ref' ? `${realpathSync(repoRoot)}\0${source.commit}` : null;
  if (key !== null) {
    const cached = nativeContextRefs.get(key);
    if (cached) {
      nativeContextRefs.delete(key);
      nativeContextRefs.set(key, cached);
      return cached;
    }
  }
  const args = ['export', 'native', ...(source.kind === 'worktree' ? ['--worktree'] : ['--ref', source.commit]), '--profile', NATIVE_CONTEXT_PROFILE, '--json'];
  const context = decodeNativeContextExport(new ArchctxClient(repoRoot, ARCHCTX_REQUIRED_VERSION, options).data(args, 30_000), source);
  if (key !== null) {
    freezeNativeContext(context);
    nativeContextRefs.set(key, context);
    if (nativeContextRefs.size > NATIVE_CONTEXT_REF_LIMIT) nativeContextRefs.delete(nativeContextRefs.keys().next().value!);
  }
  return context;
}

// Only these export failures say the model itself is absent or invalid.
const MODEL_NOT_READY_CODES: ReadonlySet<string> = new Set(['AC_MODEL_ADOPTION_REQUIRED', 'AC_SCHEMA_INVALID']);

/**
 * A complete native model with an active capability is ready for projection.
 * Any other export failure (timeout, package, contract drift) is not a model
 * fault, so it reaches the readiness error state with its own reason.
 */
export function architectureModelReady(repoRoot: string, options: ArchctxProviderOptions): boolean {
  if (!existsSync(join(repoRoot, ARCHCONTEXT_MANIFEST)) || !existsSync(join(repoRoot, '.archcontext', 'product.yaml'))) return false;
  try {
    const context = readArchitectureNativeContext(repoRoot, { kind: 'worktree' }, options);
    const authority = capabilityRegistryFromNativeContext(context, { repoRoot });
    return authority.status === 'valid' && authority.registry.capabilities.length > 0;
  } catch (error) {
    if (error instanceof ArchctxClientError && MODEL_NOT_READY_CODES.has(error.code)) return false;
    throw error;
  }
}

export function readArchitectureHandEdits(repoRoot: string, options: ArchctxProviderOptions = {}) {
  const policy = options.policy ?? loadArchitectureProjectionPolicy(options.env);
  if (policy.provider === 'disabled') throw new Error('architecture projection provider is disabled');
  const client = new ArchctxClient(repoRoot, policy.requiredVersion, options);
  return decodeArchitectureHandEdits(client.data(['docs', 'drift', '--profile', 'repo-harness/v1', '--json'], policy.timeoutMs));
}

export interface ArchitectureHistoryPage { readonly offset: number; readonly limit: number; readonly ref: string | null }

/** archctx owns the milestone and delta rules; this checks only that the page answers the request. */
export function decodeArchitectureHistoryPage(value: unknown, page: ArchitectureHistoryPage): ArchitectureHistory {
  const history = decodeArchitectureHistory(value);
  if (history === undefined || history.offset !== page.offset || history.limit !== page.limit
    || (page.ref !== null && history.head !== page.ref)) throw new Error('architecture_history_invalid');
  return history;
}

/**
 * Runs the read-only `archctx history` for one page. Like the map collector, it does not
 * read the projection policy: that policy controls projection writes, not reads.
 */
export function readArchitectureHistory(repoRoot: string, page: ArchitectureHistoryPage, options: ArchctxProviderOptions = {}): ArchitectureHistory {
  const client = new ArchctxClient(repoRoot, ARCHCTX_REQUIRED_VERSION, options);
  const args = ['history', ...(page.ref === null ? [] : ['--ref', page.ref]), '--offset', String(page.offset), '--limit', String(page.limit), '--json'];
  return decodeArchitectureHistoryPage(client.data(args, ARCHITECTURE_HISTORY_TIMEOUT_MS), page);
}

/** The result of one path in `archctx resolve`; `stableId` is the deepest owning node of an unambiguous match. */
export type ArchitecturePathOwner = Omit<ArchcontextPathOwner, 'path'> & { readonly stableId: string | null };

function decodeArchitecturePathOwners(value: unknown, queries: readonly string[]): ArchitecturePathOwner[] {
  if (!isRecord(value) || value.schemaVersion !== 'archcontext.envelope/v1' || value.ok !== true) throw new Error('archctx resolve returned an invalid envelope');
  const results = isRecord(value.data) ? value.data.results : undefined;
  if (!Array.isArray(results) || results.length !== queries.length) throw new Error('archctx resolve returned a result count that does not match the request');
  return results.map((result, index) => {
    if (!isRecord(result) || result.path !== queries[index] || typeof result.matched !== 'boolean' || typeof result.ambiguous !== 'boolean'
      || (result.owningCapabilityId !== null && typeof result.owningCapabilityId !== 'string')
      || (result.candidates !== undefined && (!Array.isArray(result.candidates) || result.candidates.some((entry) => typeof entry !== 'string')))
      || (result.matched && !result.ambiguous && typeof result.stableId !== 'string')) {
      throw new Error(`archctx resolve returned an invalid result for ${queries[index]}`);
    }
    return {
      matched: result.matched,
      ambiguous: result.ambiguous,
      owningCapabilityId: result.owningCapabilityId as string | null,
      candidates: (result.candidates ?? []) as string[],
      stableId: result.matched && !result.ambiguous ? result.stableId as string : null,
    };
  });
}

/**
 * Resolves one batch of query lines through `archctx resolve --paths-from`, one
 * result per query in request order. The list goes through a private temp file
 * outside the repository. An archctx error envelope (the model is rejected) is
 * `ok: false`; a process, version or contract failure throws.
 */
export function resolveArchitecturePaths(
  repoRoot: string,
  queries: readonly string[],
  options: ArchctxProviderOptions,
  maximumMs: number,
): { readonly ok: true; readonly owners: ArchitecturePathOwner[] } | { readonly ok: false; readonly error: ArchContextError } {
  const dir = mkdtempSync(join(tmpdir(), 'repo-harness-archctx-resolve-'));
  try {
    const listPath = join(dir, 'paths.txt');
    writeFileSync(listPath, `${queries.join('\n')}\n`, { mode: 0o600 });
    // Exit 2 means at least one ambiguous path; the envelope still carries every result.
    const value = new ArchctxClient(repoRoot, ARCHCTX_REQUIRED_VERSION, options).json(['resolve', '--paths-from', listPath, '--json'], maximumMs, true);
    if (isRecord(value) && value.ok === false) return { ok: false, error: value.error as ArchContextError };
    return { ok: true, owners: decodeArchitecturePathOwners(value, queries) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const COMMITTED_PROJECTION_MANIFEST = 'docs/architecture/.projection-manifest.json';

/**
 * The commit that starts the daily lag clock (`firstRenderChangeCommit`) for the differing targets of
 * `render-check`. The input authority is archctx at HEAD: the committed manifest rows, the model's
 * capability nodes and `archctx resolve` for the changed paths. Any read or contract failure throws.
 */
export function readRenderClockStart(repoRoot: string, targets: readonly DifferingRenderTarget[], manifestCommit: string, shas: readonly string[]): string {
  if (targets.length === 0) return manifestCommit;
  const git = (args: string[]) => gitExecFileSync(['-C', repoRoot, ...args], { encoding: 'utf8' });
  const archctxAt = (rev: string) => JSON.parse(git(['show', `${rev}:package.json`])).dependencies?.archctx;
  const commits = shas.map(sha => {
    const paths = git(['diff', '--name-only', '--no-renames', '-z', `${sha}^`, sha, '--']).split('\0').filter(Boolean);
    return { sha, paths, rendererChanged: paths.includes('package.json') && archctxAt(`${sha}^`) !== archctxAt(sha) };
  });
  const manifest: unknown = JSON.parse(readFileSync(join(repoRoot, COMMITTED_PROJECTION_MANIFEST), 'utf8'));
  const issues = architectureDocsProjectionManifestIssues(manifest);
  if (issues.length > 0) throw new Error(`${COMMITTED_PROJECTION_MANIFEST} is invalid: ${issues.join('; ')}`);
  const capabilityNodeIds = new Set(readArchitectureNativeContext(repoRoot, { kind: 'worktree' }).model.nodes
    .filter(node => node.kind === 'capability').map(node => node.id as string));
  const paths = [...new Set(commits.flatMap(commit => commit.paths))].filter(path => !path.startsWith('.archcontext/'));
  const owners = new Map<string, ArchitecturePathOwner>();
  if (paths.length > 0) {
    const read = resolveArchitecturePaths(repoRoot, paths, {}, ARCHITECTURE_VIEW_TIMEOUT_MS);
    if (!read.ok) throw new Error(`archctx resolve rejected the model: ${read.error.code}: ${read.error.message}`);
    read.owners.forEach((owner, index) => owners.set(paths[index]!, owner));
  }
  return firstRenderChangeCommit(manifestCommit, commits, targets, {
    committedRows: (manifest as ArchitectureDocsProjectionManifestV4).targets,
    capabilityNodeIds,
    ownerOf: path => {
      const owner = owners.get(path);
      return owner && (owner.matched || owner.ambiguous) ? owner.owningCapabilityId : undefined;
    },
  });
}

/** The read commands of the operator architecture views. No write command is in this union. */
export type ArchitectureViewArgs =
  | readonly ['debt', '--json']
  | readonly ['flows', 'check', '--no-sync', '--json']
  | readonly ['docs', 'anchors', '--json']
  | readonly ['deps', '--json']
  | readonly ['constraints', 'check', '--json']
  | readonly ['impact', '--base', string, '--head', string, '--json']
  | readonly ['impact', '--paths-from', string, '--json'];

/** One view read: its data, or its error envelope's fields. `error: null`: the run failed or gave no envelope. */
export function readArchitectureView(
  repoRoot: string,
  args: ArchitectureViewArgs,
  options: ArchctxProviderOptions = {},
): { readonly ok: true; readonly data: Record<string, unknown> } | { readonly ok: false; readonly error: Record<string, unknown> | null } {
  let value: unknown;
  try { value = new ArchctxClient(repoRoot, ARCHCTX_REQUIRED_VERSION, options).json(args, ARCHITECTURE_VIEW_TIMEOUT_MS, true); }
  catch { return { ok: false, error: null }; }
  if (isRecord(value) && value.ok === true && isRecord(value.data)) return { ok: true, data: value.data };
  return { ok: false, error: isRecord(value) && value.ok === false && isRecord(value.error) ? value.error : null };
}
