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
  ARCHITECTURE_DEBT_KINDS,
  architectureModelDelta,
  isArchitectureRepoPath,
  projectArchitectureMap,
  type ArchitectureChangesInput,
  type ArchitectureDebtItemV1,
  type ArchitectureMapDependencyInput,
  type ArchitectureMapDependencyReason,
  type ArchitectureMapImportV1,
  type ArchitectureMapLayersInput,
  type ArchitectureMapNodeV1,
  type ArchitectureMapRelationV1,
  type ArchitectureMapSizeInput,
  type ArchitectureMapV1,
  type ArchitectureViolationReason,
  type ArchitectureViolationsLayerV1,
} from '../../core/operator/architecture-map';
import { publicDevActivityText } from '../../core/operator/public-text';
import { readCommittedNativeContext } from '../architecture/model-reader';
import { readArchitectureNativeContext, runPackageLocalArchctxJson } from '../architecture/archctx-provider';
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
const strings = (value: unknown): string[] | null => (Array.isArray(value) && value.every(entry => typeof entry === 'string') ? value : null);
const whole = (value: unknown): number | null => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null);

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
 * What archctx reads besides the commit. `archctx resolve`, `deps`, `debt` and
 * `docs anchors` read the worktree model, and the CodeGraph
 * index covers the working tree, so their answers describe the commit only while
 * HEAD names it and the model, or the whole tree, is clean. null: git could not answer.
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

/** Why a source that reads the worktree model cannot describe `commit`; null when it can. */
function modelGate(commit: string, checkout: CheckoutState): 'git_read_failed' | 'checkout_changed' | 'model_worktree_dirty' | null {
  if (checkout.head === null || checkout.modelClean === null) return 'git_read_failed';
  if (checkout.head !== commit) return 'checkout_changed';
  return checkout.modelClean ? null : 'model_worktree_dirty';
}

/** As `modelGate`, for a source that also reads the CodeGraph index: the whole tree must be clean. */
function treeGate(commit: string, checkout: CheckoutState): 'unreadable' | 'checkout_changed' | 'model_worktree_dirty' | 'code_facts_worktree_dirty' | null {
  if (checkout.treeClean === null) return 'unreadable';
  const model = modelGate(commit, checkout);
  if (model !== null) return model === 'git_read_failed' ? 'unreadable' : model;
  return checkout.treeClean ? null : 'code_facts_worktree_dirty';
}

/** The violation checks this collector runs; flow proofs and layer direction have no read-only source. */
type CollectedViolations = ArchitectureMapLayersInput['violations'];

const CHECKOUT_CHANGED = { state: 'unavailable', reason: 'checkout_changed' } as const;
const keepIf = <Section extends { readonly state: string }>(section: Section, still: boolean): Section | typeof CHECKOUT_CHANGED =>
  section.state === 'ok' && !still ? CHECKOUT_CHANGED : section;

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
  return {
    sizes: keepIf(read.sizes, !moved && after.modelClean === true),
    dependencies: keepIf(read.dependencies, !moved && after.treeClean === true),
  };
}

/** The same end-of-cycle check for the layers: today's changes read the model, each violation check the whole tree. */
export function recheckLayers(
  commit: string,
  before: CheckoutState,
  after: CheckoutState,
  read: { readonly changes: ArchitectureChangesInput; readonly violations: CollectedViolations },
): { readonly changes: ArchitectureChangesInput; readonly violations: CollectedViolations } {
  const moved = before.head !== commit || after.head !== commit;
  const tree = !moved && after.treeClean === true;
  const { debt, anchors, dependencies } = read.violations;
  return {
    changes: keepIf(read.changes, !moved && after.modelClean === true),
    violations: { debt: keepIf(debt, tree), anchors: keepIf(anchors, tree), dependencies: keepIf(dependencies, tree) },
  };
}

/** The deepest owning node of each path. An unmatched or contested path has no owner. */
function resolveOwners(root: string, paths: readonly string[]): ReadonlyMap<string, string | null> {
  const owners = new Map<string, string | null>();
  if (paths.length === 0) return owners;
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
  const gate = modelGate(commit, checkout);
  if (gate !== null) return { state: 'unavailable', reason: gate };
  const lines = readCommitLineCounts(root, commit);
  if (lines === null) return { state: 'unavailable', reason: 'git_read_failed' };
  try {
    return { state: 'ok', lines, owners: resolveOwners(root, [...lines.keys()]) };
  } catch {
    return { state: 'unavailable', reason: 'ownership_unavailable' };
  }
}

const lineList = (stdout: Buffer): string[] => stdout.toString('utf8').split('\n').filter(line => line !== '');

/**
 * Commits on the first-parent chain of `commit` since `since`, the files they
 * changed with `git diff --numstat`, their owners from `archctx resolve`, and
 * the model entities that differ from the base commit's `export native`.
 */
function readChanges(
  root: string,
  commit: string,
  checkout: CheckoutState,
  since: string,
  head: { readonly nodes: readonly unknown[]; readonly relations: readonly unknown[] },
): ArchitectureChangesInput {
  const gate = modelGate(commit, checkout);
  if (gate !== null) return { state: 'unavailable', reason: gate };
  const today = git(root, ['rev-list', '--first-parent', `--since=${since}`, commit]);
  if (today.status !== 0) return { state: 'unavailable', reason: 'git_read_failed' };
  const commits = lineList(today.stdout).length;
  // `--since` filters by committer date; the base is the next commit on the chain, so the window must be the chain's head.
  const chain = git(root, ['rev-list', '--first-parent', `--max-count=${commits + 1}`, commit]);
  if (chain.status !== 0 || lineList(chain.stdout).slice(0, commits).join('\n') !== lineList(today.stdout).join('\n')) return { state: 'unavailable', reason: 'git_read_failed' };
  const base = lineList(chain.stdout)[commits];
  if (base === undefined) return { state: 'unavailable', reason: 'history_starts_today' };
  const diff = git(root, ['diff', '--numstat', '-z', '--no-renames', '--no-ext-diff', base, commit, '--']);
  if (diff.status !== 0) return { state: 'unavailable', reason: 'git_read_failed' };
  const files = new Map<string, { added: number; deleted: number }>();
  for (const record of diff.stdout.toString('utf8').split('\0')) {
    if (record === '') continue;
    const match = /^(\d+|-)\t(\d+|-)\t(.+)$/su.exec(record);
    if (match === null) return { state: 'unavailable', reason: 'git_read_failed' };
    // A binary file shows `-`: it changed, with no line count.
    files.set(match[3]!, { added: match[1] === '-' ? 0 : Number(match[1]), deleted: match[2] === '-' ? 0 : Number(match[2]) });
  }
  let owners;
  try { owners = resolveOwners(root, [...files.keys()]); }
  catch { return { state: 'unavailable', reason: 'ownership_unavailable' }; }
  let model: Extract<ArchitectureChangesInput, { state: 'ok' }>['model'];
  try { model = { state: 'ok', ...architectureModelDelta(readArchitectureNativeContext(root, { kind: 'ref', commit: base }).model, head) }; }
  catch { model = { state: 'unavailable', reason: 'model_base_unavailable' }; }
  return { state: 'ok', since, base, commits, files, owners, model };
}

type Violation<Fields> = ({ readonly state: 'ok' } & Fields) | { readonly state: 'unavailable'; readonly reason: ArchitectureViolationReason };

/** One archctx JSON command. An error envelope or a failed run is a reason, never a partial answer. */
function archctxData(root: string, args: readonly string[]): Record_ | ArchitectureViolationReason {
  let value: unknown;
  try { value = runPackageLocalArchctxJson(root, ARCHCTX_REQUIRED_VERSION, args, {}, ARCHCTX_TIMEOUT_MS, true).value; }
  catch { return 'archctx_failed'; }
  if (!isRecord(value)) return 'archctx_failed';
  if (value.ok !== true) return isRecord(value.error) && value.error.code === 'AC_CODE_FACTS_UNAVAILABLE' ? 'code_facts_unavailable' : 'archctx_failed';
  return isRecord(value.data) ? value.data : 'archctx_failed';
}

/** `archctx debt` items. Its ownership and anchor checks must both be complete; it defers the others. */
function readDebt(root: string, known: ReadonlySet<string>): ArchitectureViolationsLayerV1['debt'] {
  const data = archctxData(root, ['debt', '--json']);
  if (typeof data === 'string') return { state: 'unavailable', reason: data };
  const checks = Array.isArray(data.checks) ? data.checks.filter(isRecord) : [];
  for (const name of ['ownership', 'anchors']) {
    const check = checks.find(entry => entry.check === name);
    if (check === undefined) return { state: 'unavailable', reason: 'archctx_failed' };
    if (check.coverage !== 'complete') {
      return { state: 'unavailable', reason: strings(check.reasonCodes)?.includes('codegraph-unavailable') ? 'code_facts_unavailable' : 'code_facts_incomplete' };
    }
  }
  if (!Array.isArray(data.items)) return { state: 'unavailable', reason: 'archctx_failed' };
  const items: ArchitectureDebtItemV1[] = [];
  for (const item of data.items) {
    const kind = isRecord(item) ? ARCHITECTURE_DEBT_KINDS.find(entry => entry === item.kind) : undefined;
    const nodes = isRecord(item) ? strings(item.nodeIds) : null;
    const paths = isRecord(item) ? strings(item.paths) : null;
    if (kind === undefined || nodes === null || paths === null || !nodes.every(id => known.has(id)) || !paths.every(isArchitectureRepoPath)
      || new Set(nodes).size !== nodes.length || new Set(paths).size !== paths.length) {
      return { state: 'unavailable', reason: 'archctx_failed' };
    }
    items.push({ kind, nodes, paths });
  }
  return { state: 'ok', items };
}

/** `archctx docs anchors`: a citation it could not check makes the answer incomplete. */
function readAnchors(root: string, known: ReadonlySet<string>): ArchitectureViolationsLayerV1['anchors'] {
  const data = archctxData(root, ['docs', 'anchors', '--json']);
  if (typeof data === 'string') return { state: 'unavailable', reason: data };
  if (!isRecord(data.codeGraph) || data.codeGraph.availability !== 'ready') return { state: 'unavailable', reason: 'code_facts_unavailable' };
  const citations = isRecord(data.summary) ? whole(data.summary.citations) : null;
  const unchecked = isRecord(data.summary) ? whole(data.summary.unchecked) : null;
  if (citations === null || unchecked === null || !Array.isArray(data.nodes)) return { state: 'unavailable', reason: 'archctx_failed' };
  if (unchecked > 0) return { state: 'unavailable', reason: 'code_facts_incomplete' };
  const nodes = [];
  for (const node of data.nodes) {
    const id = isRecord(node) ? string(node.nodeId) : null;
    if (id === null || !known.has(id) || !isRecord(node) || !Array.isArray(node.findings)) return { state: 'unavailable', reason: 'archctx_failed' };
    if (node.findings.length > 0) nodes.push({ id, findings: node.findings.length });
  }
  return { state: 'ok', citations, nodes };
}

/**
 * One `archctx deps` run: capability import counts, and the rows archctx marks
 * undeclared. Counts come from the CodeGraph index that the user built; this
 * collector builds no index. `worktree.headSha` names HEAD, not what the index
 * read, so only a clean tree ties the index to the commit.
 */
function readDependencies(root: string, commit: string, checkout: CheckoutState, capabilities: ReadonlySet<string>): {
  readonly dependencies: ArchitectureMapDependencyInput;
  readonly undeclared: Violation<{ readonly edges: readonly ArchitectureMapImportV1[] }>;
} {
  const gap = (reason: ArchitectureMapDependencyReason) => ({ dependencies: { state: 'unavailable', reason }, undeclared: { state: 'unavailable', reason } } as const);
  const gate = treeGate(commit, checkout);
  if (gate !== null) return gap(gate === 'unreadable' ? 'dependencies_unavailable' : gate);
  const data = archctxData(root, ['deps', '--json']);
  if (typeof data === 'string') return gap(data === 'code_facts_unavailable' ? data : 'dependencies_unavailable');
  const head = isRecord(data.worktree) ? data.worktree.headSha : null;
  if (head !== commit) return gap('code_facts_other_commit');
  if (!isRecord(data.imports) || data.imports.coverage !== 'complete') return gap('code_facts_incomplete');
  if (!Array.isArray(data.matrix)) return gap('dependencies_unavailable');
  const matrix = [];
  const undeclared: ArchitectureMapImportV1[] = [];
  for (const entry of data.matrix) {
    if (!isRecord(entry) || typeof entry.from !== 'string' || typeof entry.to !== 'string' || whole(entry.imports) === null) return gap('dependencies_unavailable');
    matrix.push({ from: entry.from, to: entry.to, imports: entry.imports as number });
    if (entry.declared === false && entry.from !== entry.to && (entry.imports as number) > 0) undeclared.push({ source: entry.from, target: entry.to, imports: entry.imports as number });
  }
  const typed = data.matrix.every(entry => isRecord(entry) && typeof entry.declared === 'boolean');
  return {
    dependencies: { state: 'ok', matrix },
    undeclared: typed && undeclared.every(edge => capabilities.has(edge.source) && capabilities.has(edge.target))
      ? { state: 'ok', edges: undeclared } : { state: 'unavailable', reason: 'archctx_failed' },
  };
}

/**
 * The violation checks that read the CodeGraph index; each runs only on a clean tree at the commit.
 * `archctx flows check` is not one of them: it runs `codegraph sync` on an existing index.
 */
function readViolations(root: string, commit: string, checkout: CheckoutState, known: ReadonlySet<string>): Omit<CollectedViolations, 'dependencies'> {
  const gate = treeGate(commit, checkout);
  if (gate !== null) {
    const gap = { state: 'unavailable', reason: gate === 'unreadable' ? 'archctx_failed' : gate } as const;
    return { debt: gap, anchors: gap };
  }
  return { debt: readDebt(root, known), anchors: readAnchors(root, known) };
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

/**
 * One repository's map. `since` starts today's window. This process has no
 * tests cache: the collector reads the tests layer from it in the server.
 */
export function collectArchitectureMap(repositoryId: string, path: string, collectedAt: string, since: string): ArchitectureMapWorkerResult {
  const before = readCheckoutState(path);
  let committed;
  try { committed = readCommittedNativeContext(path); }
  catch { return { id: repositoryId, ok: false, reason: 'model_unavailable' }; }
  const { commit, context } = committed;
  const { nodes, relations } = modelEntities(context, realpathSync(path));
  const known = new Set(nodes.map(node => node.id));
  const capabilities = new Set(nodes.filter(node => node.kind === 'capability').map(node => node.id));
  const deps = readDependencies(path, commit, before, capabilities);
  const read = { sizes: readSizes(path, commit, before), dependencies: deps.dependencies };
  const layers = {
    changes: readChanges(path, commit, before, since, context.model),
    violations: { ...readViolations(path, commit, before, known), dependencies: deps.undeclared },
  };
  const after = readCheckoutState(path);
  const snapshot = projectArchitectureMap({
    repository_id: repositoryId, commit, collected_at: collectedAt, nodes, relations,
    ...recheckCheckout(commit, before, after, read),
    layers: { ...recheckLayers(commit, before, after, layers), tests: { state: 'unavailable', reason: 'tests_pending' } },
  });
  return { id: repositoryId, ok: true, snapshot };
}

/** Local midnight of the collector host: today's changes start there. */
export function localMidnight(now: Date): string {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return midnight.toISOString();
}

if (import.meta.main) {
  const id = process.argv[2] ?? '';
  const repo = readRepoHarnessRegistryStrictSnapshot({ env: process.env }).repos.find(entry => entry.id === id);
  let result: ArchitectureMapWorkerResult = { id, ok: false, reason: 'model_unavailable' };
  // A failure is one result; its cause (a path, an archctx error) stays in this process.
  if (repo) {
    const now = new Date();
    try { result = collectArchitectureMap(repo.id, repo.path, now.toISOString(), localMidnight(now)); }
    catch { /* model_unavailable */ }
  }
  // Exit once the line is flushed so a handle left open cannot hold the child past its output.
  process.stdout.write(`${JSON.stringify(result)}\n`, () => process.exit(0));
}
