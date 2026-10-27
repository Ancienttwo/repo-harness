// Child process of the architecture map collector. The model export, git and
// archctx run synchronously, so they run here, in a process group that the
// collector kills at its deadline or on close. It takes one repository id,
// reads the repository registry with the environment it got and writes one
// JSON line: the result for that repository.

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ARCHCTX_REQUIRED_VERSION } from '../../core/architecture/projection';
import {
  projectArchitectureMap,
  type ArchitectureMapDependencyInput,
  type ArchitectureMapNodeV1,
  type ArchitectureMapRelationV1,
  type ArchitectureMapSizeInput,
  type ArchitectureMapV1,
} from '../../core/operator/architecture-map';
import { publicDevActivityText } from '../../core/operator/public-text';
import { readCommittedNativeContext } from '../architecture/model-reader';
import { runPackageLocalArchctxJson } from '../architecture/archctx-provider';
import { gitSpawnSync } from '../git/runner';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { publicValue } from './architecture';

export type ArchitectureMapWorkerResult =
  | { readonly id: string; readonly ok: true; readonly snapshot: ArchitectureMapV1 }
  | { readonly id: string; readonly ok: false; readonly reason: 'model_unavailable' };

const MODEL_ROOT = '.archcontext/model';
/** `archctx resolve` echoes each node's footprint per path; this many paths stay well under its 8 MiB output cap. */
const RESOLVE_BATCH = 2_000;
const ARCHCTX_TIMEOUT_MS = 60_000;
const GIT_TIMEOUT_MS = 30_000;

type Record_ = Record<string, unknown>;
const isRecord = (value: unknown): value is Record_ => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function git(root: string, args: readonly string[]): { status: number | null; stdout: Buffer } {
  const result = gitSpawnSync(['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args], {
    cwd: root, timeout: GIT_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_LITERAL_PATHSPECS: '1', GIT_NO_LAZY_FETCH: '1' },
  });
  if (result.error || result.signal) return { status: null, stdout: Buffer.alloc(0) };
  return { status: result.status, stdout: result.stdout };
}

/** Lines of every tracked text file of `commit`. `git grep -I` skips binary files; a file with no line is absent. */
export function readCommitLineCounts(root: string, commit: string): ReadonlyMap<string, number> | null {
  const result = git(root, ['grep', '--no-color', '-z', '-I', '-c', '-e', '', commit, '--']);
  // Exit 1 is "no line matched": a commit with no text file.
  if (result.status === 1) return new Map();
  if (result.status !== 0) return null;
  const lines = new Map<string, number>();
  const prefix = `${commit}:`;
  for (const record of result.stdout.toString('utf8').split('\n')) {
    if (record === '') continue;
    const separator = record.lastIndexOf('\0');
    const name = separator < 0 ? '' : record.slice(0, separator);
    const total = Number(record.slice(separator + 1));
    if (!name.startsWith(prefix) || !Number.isSafeInteger(total) || total < 0) return null;
    lines.set(name.slice(prefix.length), total);
  }
  return lines;
}

/**
 * What archctx reads besides the commit. `archctx resolve` and `archctx deps`
 * read the worktree model, and the CodeGraph index covers the working tree, so
 * their answers describe the commit only while HEAD names it and the model,
 * or the whole tree, is clean. null: git could not answer.
 */
export interface CheckoutState {
  readonly head: string | null;
  readonly modelClean: boolean | null;
  readonly treeClean: boolean | null;
}

function clean(root: string, pathspec: readonly string[]): boolean | null {
  const result = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...pathspec]);
  return result.status === 0 ? result.stdout.length === 0 : null;
}

function readCheckoutState(root: string): CheckoutState {
  const head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
  return {
    head: head.status === 0 ? head.stdout.toString('utf8').trim() : null,
    modelClean: clean(root, [MODEL_ROOT]),
    treeClean: clean(root, []),
  };
}

/**
 * A cycle reads the commit, then archctx reads the worktree. A checkout or an
 * edit between the two checks pairs facts of two trees, so the cycle drops the
 * counts that the change can reach. No lock: the next cycle reads again.
 */
export function recheckCheckout(
  commit: string,
  before: CheckoutState,
  after: CheckoutState,
  read: { readonly sizes: ArchitectureMapSizeInput; readonly dependencies: ArchitectureMapDependencyInput },
): { readonly sizes: ArchitectureMapSizeInput; readonly dependencies: ArchitectureMapDependencyInput } {
  const moved = before.head !== commit || after.head !== commit;
  const changed = { state: 'unavailable', reason: 'checkout_changed' } as const;
  return {
    sizes: read.sizes.state === 'ok' && (moved || after.modelClean !== true) ? changed : read.sizes,
    dependencies: read.dependencies.state === 'ok' && (moved || after.treeClean !== true) ? changed : read.dependencies,
  };
}

/** The deepest owning node of each path. An unmatched or contested path has no owner. */
function resolveOwners(root: string, paths: readonly string[]): ReadonlyMap<string, string | null> {
  const owners = new Map<string, string | null>();
  const dir = mkdtempSync(join(tmpdir(), 'repo-harness-architecture-map-'));
  try {
    for (let start = 0; start < paths.length; start += RESOLVE_BATCH) {
      const batch = paths.slice(start, start + RESOLVE_BATCH);
      const file = join(dir, 'paths.txt');
      writeFileSync(file, `${batch.join('\n')}\n`, { mode: 0o600 });
      // Exit 2 means at least one ambiguous path; the envelope still carries every result.
      const { value } = runPackageLocalArchctxJson(root, ARCHCTX_REQUIRED_VERSION, ['resolve', '--paths-from', file, '--json'], {}, ARCHCTX_TIMEOUT_MS, true);
      const results = isRecord(value) && value.ok === true && isRecord(value.data) ? value.data.results : null;
      if (!Array.isArray(results) || results.length !== batch.length) throw new Error('archctx resolve result count');
      results.forEach((result, index) => {
        if (!isRecord(result) || result.path !== batch[index] || typeof result.matched !== 'boolean' || typeof result.ambiguous !== 'boolean') {
          throw new Error('archctx resolve result');
        }
        owners.set(batch[index]!, result.matched && !result.ambiguous ? string(result.stableId) : null);
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return owners;
}

function readSizes(root: string, commit: string, checkout: CheckoutState): ArchitectureMapSizeInput {
  if (checkout.head === null || checkout.modelClean === null) return { state: 'unavailable', reason: 'git_read_failed' };
  if (checkout.head !== commit) return { state: 'unavailable', reason: 'checkout_changed' };
  if (!checkout.modelClean) return { state: 'unavailable', reason: 'model_worktree_dirty' };
  const lines = readCommitLineCounts(root, commit);
  if (lines === null) return { state: 'unavailable', reason: 'git_read_failed' };
  try {
    return { state: 'ok', lines, owners: resolveOwners(root, [...lines.keys()]) };
  } catch {
    return { state: 'unavailable', reason: 'ownership_unavailable' };
  }
}

/**
 * Capability import counts from the CodeGraph index that the user built. This collector builds no index.
 * `worktree.headSha` names HEAD, not what the index read, so only a clean tree ties the index to the commit.
 */
function readDependencies(root: string, commit: string, checkout: CheckoutState): ArchitectureMapDependencyInput {
  if (checkout.head === null || checkout.modelClean === null || checkout.treeClean === null) return { state: 'unavailable', reason: 'dependencies_unavailable' };
  if (checkout.head !== commit) return { state: 'unavailable', reason: 'checkout_changed' };
  if (!checkout.modelClean) return { state: 'unavailable', reason: 'model_worktree_dirty' };
  if (!checkout.treeClean) return { state: 'unavailable', reason: 'code_facts_worktree_dirty' };
  let value: unknown;
  try { value = runPackageLocalArchctxJson(root, ARCHCTX_REQUIRED_VERSION, ['deps', '--json'], {}, ARCHCTX_TIMEOUT_MS, true).value; }
  catch { return { state: 'unavailable', reason: 'dependencies_unavailable' }; }
  if (!isRecord(value)) return { state: 'unavailable', reason: 'dependencies_unavailable' };
  if (value.ok !== true) {
    const code = isRecord(value.error) ? value.error.code : null;
    return { state: 'unavailable', reason: code === 'AC_CODE_FACTS_UNAVAILABLE' ? 'code_facts_unavailable' : 'dependencies_unavailable' };
  }
  const data = isRecord(value.data) ? value.data : null;
  const head = data && isRecord(data.worktree) ? data.worktree.headSha : null;
  if (head !== commit) return { state: 'unavailable', reason: 'code_facts_other_commit' };
  if (!data || !isRecord(data.imports) || data.imports.coverage !== 'complete') return { state: 'unavailable', reason: 'code_facts_incomplete' };
  if (!Array.isArray(data.matrix)) return { state: 'unavailable', reason: 'dependencies_unavailable' };
  const matrix = [];
  for (const entry of data.matrix) {
    if (!isRecord(entry) || typeof entry.from !== 'string' || typeof entry.to !== 'string'
      || typeof entry.imports !== 'number' || !Number.isSafeInteger(entry.imports) || entry.imports < 0) {
      return { state: 'unavailable', reason: 'dependencies_unavailable' };
    }
    matrix.push({ from: entry.from, to: entry.to, imports: entry.imports });
  }
  return { state: 'ok', matrix };
}

/** The public node and relation fields of the committed model, redacted before projection. */
function modelEntities(context: { readonly model: { readonly nodes: readonly unknown[]; readonly relations: readonly unknown[] } }, root: string): {
  readonly nodes: ArchitectureMapNodeV1[];
  readonly relations: ArchitectureMapRelationV1[];
} {
  // `publicValue` knows this repository's root; the shared guard masks any other absolute path in model prose.
  const prose = (value: unknown) => publicDevActivityText(string(value) ?? '');
  const nodes = context.model.nodes.filter(isRecord).map(node => ({
    id: string(node.id) ?? '', kind: string(node.kind) ?? '', name: prose(node.name), status: string(node.status) ?? '',
    layer: string(node.layer), parent: string(node.parent), summary: prose(node.summary),
  }));
  const relations = context.model.relations.filter(isRecord).map(relation => ({
    id: string(relation.id) ?? '', kind: string(relation.kind) ?? '', source: string(relation.source) ?? '',
    target: string(relation.target) ?? '', intent: prose(relation.intent),
  }));
  return publicValue({ nodes, relations }, root) as { nodes: ArchitectureMapNodeV1[]; relations: ArchitectureMapRelationV1[] };
}

export function collectArchitectureMap(repositoryId: string, path: string, collectedAt: string): ArchitectureMapWorkerResult {
  const before = readCheckoutState(path);
  let committed;
  try { committed = readCommittedNativeContext(path); }
  catch { return { id: repositoryId, ok: false, reason: 'model_unavailable' }; }
  const { nodes, relations } = modelEntities(committed.context, realpathSync(path));
  const read = { sizes: readSizes(path, committed.commit, before), dependencies: readDependencies(path, committed.commit, before) };
  const snapshot = projectArchitectureMap({
    repository_id: repositoryId, commit: committed.commit, collected_at: collectedAt, nodes, relations,
    ...recheckCheckout(committed.commit, before, readCheckoutState(path), read),
  });
  return { id: repositoryId, ok: true, snapshot };
}

if (import.meta.main) {
  const id = process.argv[2] ?? '';
  const repo = readRepoHarnessRegistryStrictSnapshot({ env: process.env }).repos.find(entry => entry.id === id);
  let result: ArchitectureMapWorkerResult = { id, ok: false, reason: 'model_unavailable' };
  // A failure is one result; its cause (a path, an archctx error) stays in this process.
  if (repo) {
    try { result = collectArchitectureMap(repo.id, repo.path, new Date().toISOString()); }
    catch { /* model_unavailable */ }
  }
  // Exit once the line is flushed so a handle left open cannot hold the child past its output.
  process.stdout.write(`${JSON.stringify(result)}\n`, () => process.exit(0));
}
