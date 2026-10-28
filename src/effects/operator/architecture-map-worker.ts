// Child process of the architecture map collector. The model export, git and
// archctx run synchronously, so they run here, in a process group that the
// collector kills at its deadline or on close. It takes one repository id and
// the file that holds the repository's open PRs from the Dev Activity cache,
// reads the repository registry with the environment it got and writes one
// JSON line: the result for that repository.

import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DependencyConstraintEvaluationV1, NativeContextExportV1, RefImpactV1 } from 'archctx-contracts';
import {
  ARCHCTX_REQUIRED_VERSION,
  decodeArchitectureDebtReport,
  decodeConstraintEvaluation,
  decodeDocsAnchorsReport,
  decodeFlowSelectorCheck,
  decodeRefImpact,
  type RefImpactSource,
} from '../../core/architecture/projection';
import {
  ARCHITECTURE_DEBT_KINDS,
  archctxRefusal,
  architectureImpact,
  decodeArchitecturePullRequestsSource,
  projectArchitectureMap,
  type ArchctxRefusalV1,
  type ArchitectureChangesLayerV1,
  type ArchitectureDebtItemV1,
  type ArchitectureDecisionsLayerV1,
  type ArchitectureLayerViolationV1,
  type ArchitectureMapDependencyInput,
  type ArchitectureMapDependencyReason,
  type ArchitectureMapImportV1,
  type ArchitectureMapLayersInput,
  type ArchitectureMapNodeV1,
  type ArchitectureMapRelationV1,
  type ArchitectureMapSizeInput,
  type ArchitectureMapV1,
  type ArchitectureModelChangeV1,
  type ArchitecturePullRequestImpactV1,
  type ArchitecturePullRequestSourceV1,
  type ArchitecturePullRequestsLayerV1,
  type ArchitecturePullRequestsSource,
  type ArchitectureViolationReason,
  type ArchitectureViolationsLayerV1,
} from '../../core/operator/architecture-map';
import { isPublicRepoPath, publicDevActivityText } from '../../core/operator/public-text';
import { readCommittedNativeContext } from '../architecture/model-reader';
import { runPackageLocalArchctxJson } from '../architecture/archctx-provider';
import { gitSpawnSync } from '../git/runner';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { publicValue } from './architecture';

export type ArchitectureMapWorkerResult =
  | { readonly id: string; readonly ok: true; readonly snapshot: ArchitectureMapV1 }
  | { readonly id: string; readonly ok: false; readonly reason: 'model_unavailable' };

const MODEL_ROOT = '.archcontext/model';
const CONSTRAINT_ROOT = `${MODEL_ROOT}/constraints`;
/** `archctx resolve` echoes each node's footprint per path; this many paths stay well under its 8 MiB output cap. */
const RESOLVE_BATCH = 2_000;
const ARCHCTX_TIMEOUT_MS = 60_000;
/** All PR impact reads share this budget, including runtime selection. */
export const ARCHITECTURE_MAP_PR_BUDGET_MS = 20_000;
const GIT_TIMEOUT_MS = 30_000;

type Record_ = Record<string, unknown>;
const isRecord = (value: unknown): value is Record_ => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): string | null => (typeof value === 'string' ? value : null);
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
 * What archctx reads besides the commit. `archctx resolve`, `impact
 * --paths-from`, `deps`, `debt`, `docs anchors`, `flows check` and `constraints check` read the
 * worktree model, and the CodeGraph index covers the working tree, so their
 * answers describe the commit only while HEAD names it and the model, or the
 * whole tree, is clean. null: git could not answer.
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

/**
 * The same end-of-cycle check for the layers: PR impact reads the worktree
 * model, each violation check the whole tree. Today's changed paths, owners,
 * dependents and model delta read only commits. Its flow steps use the worktree
 * CodeGraph index; archctx binds those facts to the commit or reports unknown.
 */
export function recheckLayers(
  commit: string,
  before: CheckoutState,
  after: CheckoutState,
  read: { readonly pull_requests: ArchitecturePullRequestsLayerV1; readonly violations: CollectedViolations },
): { readonly pull_requests: ArchitecturePullRequestsLayerV1; readonly violations: CollectedViolations } {
  const moved = before.head !== commit || after.head !== commit;
  const model = !moved && after.modelClean === true;
  const tree = !moved && after.treeClean === true;
  const { debt, flows, anchors, dependencies, layer_direction: layerDirection } = read.violations;
  return {
    pull_requests: keepIf(read.pull_requests, model),
    violations: {
      debt: keepIf(debt, tree), flows: keepIf(flows, tree), anchors: keepIf(anchors, tree), dependencies: keepIf(dependencies, tree), layer_direction: keepIf(layerDirection, tree),
    },
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

type Violation<Fields> = ({ readonly state: 'ok' } & Fields) | { readonly state: 'unavailable'; readonly reason: ArchitectureViolationReason };

/** One archctx JSON command: its data, or its error envelope's codes. null: the run failed or gave no envelope. */
function runArchctx(root: string, args: readonly string[], deadlineMs?: number): { readonly ok: true; readonly data: Record_ } | { readonly ok: false; readonly error: Record_ | null } {
  let value: unknown;
  try { value = runPackageLocalArchctxJson(root, ARCHCTX_REQUIRED_VERSION, args, { deadlineMs }, ARCHCTX_TIMEOUT_MS, true).value; }
  catch { return { ok: false, error: null }; }
  if (isRecord(value) && value.ok === true && isRecord(value.data)) return { ok: true, data: value.data };
  return { ok: false, error: isRecord(value) && value.ok === false && isRecord(value.error) ? value.error : null };
}

/** An error envelope or a failed run is a reason, never a partial answer. */
function archctxData(root: string, args: readonly string[]): Record_ | ArchitectureViolationReason {
  const read = runArchctx(root, args);
  if (read.ok) return read.data;
  return read.error?.code === 'AC_CODE_FACTS_UNAVAILABLE' ? 'code_facts_unavailable' : 'archctx_failed';
}

const ARCHCTX_FAILED = { state: 'unavailable', reason: 'archctx_failed' } as const;

/**
 * A check that reads the CodeGraph index: missing or stale code facts keep
 * their own reason, any other error envelope keeps archctx's codes, and a
 * failed run is `archctx_failed`.
 */
function archctxGap(error: Record_ | null): { readonly state: 'unavailable'; readonly reason: 'code_facts_unavailable' } | typeof ARCHCTX_FAILED | ArchctxRefusalV1 {
  if (error === null) return ARCHCTX_FAILED;
  if (error.code === 'AC_CODE_FACTS_UNAVAILABLE') return { state: 'unavailable', reason: 'code_facts_unavailable' };
  return archctxRefusal(error.code, error.reasonCode) ?? ARCHCTX_FAILED;
}

/** A report that its ArchContext decoder refuses is a failed run. */
function decoded<Report>(decode: (value: unknown) => Report, value: unknown): Report | null {
  try { return decode(value); } catch { return null; }
}

const lineList = (stdout: Buffer): string[] => stdout.toString('utf8').split('\n').filter(line => line !== '');

/**
 * One `archctx impact` answer, bound to the snapshot it asked for. Any archctx
 * error keeps its codes; a failed run or an answer that breaks the published
 * contract is `archctx_failed`. There is no local fallback.
 */
function readImpact(root: string, args: readonly string[], source: RefImpactSource, deadlineMs?: number): { readonly ok: true; readonly report: RefImpactV1 } | { readonly ok: false; readonly gap: typeof ARCHCTX_FAILED | ArchctxRefusalV1 } {
  const read = runArchctx(root, ['impact', ...args, '--json'], deadlineMs);
  if (!read.ok) return { ok: false, gap: (read.error && archctxRefusal(read.error.code, read.error.reasonCode)) ?? ARCHCTX_FAILED };
  const report = decoded(value => decodeRefImpact(value, source), read.data);
  return report === null ? { ok: false, gap: ARCHCTX_FAILED } : { ok: true, report };
}

/**
 * Commits on the first-parent chain of `commit` since `since`, and `archctx
 * impact` from the next older commit to `commit`: changed paths with their
 * owners, dependents and model changes from commits. Flow steps use the worktree
 * CodeGraph index; archctx binds those facts to the commit or reports unknown.
 */
function readChanges(root: string, commit: string, since: string): ArchitectureChangesLayerV1 {
  const today = git(root, ['rev-list', '--first-parent', `--since=${since}`, commit]);
  if (today.status !== 0) return { state: 'unavailable', reason: 'git_read_failed' };
  const commits = lineList(today.stdout).length;
  // `--since` filters by committer date; the base is the next commit on the chain, so the window must be the chain's head.
  const chain = git(root, ['rev-list', '--first-parent', `--max-count=${commits + 1}`, commit]);
  if (chain.status !== 0 || lineList(chain.stdout).slice(0, commits).join('\n') !== lineList(today.stdout).join('\n')) return { state: 'unavailable', reason: 'git_read_failed' };
  const base = lineList(chain.stdout)[commits];
  if (base === undefined) return { state: 'unavailable', reason: 'history_starts_today' };
  const impact = readImpact(root, ['--base', base, '--head', commit], { kind: 'refs', base, head: commit });
  if (!impact.ok) return impact.gap;
  const { modelDelta } = impact.report;
  // Two refs always give a known model delta; `unknown` belongs to a path list.
  if (modelDelta.status !== 'known') return ARCHCTX_FAILED;
  // The published schema limits `kind` and `change` to the map's values.
  return { state: 'ok', since, base, commits, model: modelDelta.changes as ArchitectureModelChangeV1[], ...architectureImpact(impact.report) };
}

/** `archctx impact --paths-from` for one open PR's changed files, against the map commit's worktree model. */
function readPullRequestImpact(root: string, commit: string, dir: string, pr: ArchitecturePullRequestSourceV1, deadlineMs: number): ArchitecturePullRequestImpactV1['impact'] {
  if (pr.head_sha === null) return { state: 'unavailable', reason: 'head_missing' };
  if (pr.changed_files.state === 'unavailable') return pr.changed_files;
  // A spent budget must not start another child or write another path list.
  if (Date.now() >= deadlineMs) return ARCHCTX_FAILED;
  try {
    const file = join(dir, `pull-request-${pr.number}.txt`);
    writeFileSync(file, pr.changed_files.paths.map(path => `${path}\n`).join(''), { mode: 0o600 });
    const impact = readImpact(root, ['--paths-from', file], { kind: 'paths', head: commit }, deadlineMs);
    return impact.ok ? { state: 'ok', ...architectureImpact(impact.report) } : impact.gap;
  } catch { return ARCHCTX_FAILED; }
}

/** The open PRs' impact. The files come from the PR heads; owners and dependents come from the map commit's model. */
function readPullRequests(root: string, commit: string, checkout: CheckoutState, source: ArchitecturePullRequestsSource, budgetMs: number): ArchitecturePullRequestsLayerV1 {
  if (source.state === 'unavailable') return source;
  const gate = modelGate(commit, checkout);
  if (gate !== null) return { state: 'unavailable', reason: gate };
  const deadlineMs = Date.now() + budgetMs;
  const dir = mkdtempSync(join(tmpdir(), 'repo-harness-architecture-map-'));
  try {
    return {
      state: 'ok', observed_at: source.observed_at,
      pull_requests: source.pull_requests.map(pr => ({ number: pr.number, title: pr.title, url: pr.url, head_sha: pr.head_sha, impact: readPullRequestImpact(root, commit, dir, pr, deadlineMs) })),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** `archctx debt` items. Its ownership and anchor checks must both be complete; it defers the others. */
function readDebt(root: string, known: ReadonlySet<string>): ArchitectureViolationsLayerV1['debt'] {
  const data = archctxData(root, ['debt', '--json']);
  if (typeof data === 'string') return { state: 'unavailable', reason: data };
  const report = decoded(decodeArchitectureDebtReport, data);
  if (report === null) return { state: 'unavailable', reason: 'archctx_failed' };
  for (const name of ['ownership', 'anchors'] as const) {
    const check = report.checks.find(entry => entry.check === name);
    if (check === undefined) return { state: 'unavailable', reason: 'archctx_failed' };
    if (check.coverage !== 'complete') {
      return { state: 'unavailable', reason: check.reasonCodes.includes('codegraph-unavailable') ? 'code_facts_unavailable' : 'code_facts_incomplete' };
    }
  }
  const items: ArchitectureDebtItemV1[] = [];
  for (const item of report.items) {
    // The map shows only the kinds of the two complete checks; the map decoder also needs known ids and unique repository paths.
    const kind = ARCHITECTURE_DEBT_KINDS.find(entry => entry === item.kind);
    if (kind === undefined || !item.nodeIds.every(id => known.has(id)) || !item.paths.every(isPublicRepoPath)
      || new Set(item.nodeIds).size !== item.nodeIds.length || new Set(item.paths).size !== item.paths.length) {
      return { state: 'unavailable', reason: 'archctx_failed' };
    }
    items.push({ kind, nodes: item.nodeIds, paths: item.paths });
  }
  return { state: 'ok', items };
}

/** `archctx docs anchors`: a citation it could not check makes the answer incomplete. */
function readAnchors(root: string, known: ReadonlySet<string>): ArchitectureViolationsLayerV1['anchors'] {
  const data = archctxData(root, ['docs', 'anchors', '--json']);
  if (typeof data === 'string') return { state: 'unavailable', reason: data };
  const report = decoded(decodeDocsAnchorsReport, data);
  if (report === null) return { state: 'unavailable', reason: 'archctx_failed' };
  if (report.codeGraph.availability !== 'ready') return { state: 'unavailable', reason: 'code_facts_unavailable' };
  if (report.summary.unchecked > 0) return { state: 'unavailable', reason: 'code_facts_incomplete' };
  if (!report.nodes.every(node => known.has(node.nodeId))) return { state: 'unavailable', reason: 'archctx_failed' };
  const nodes = report.nodes.filter(node => node.findings.length > 0).map(node => ({ id: node.nodeId, findings: node.findings.length }));
  return { state: 'ok', citations: report.summary.citations, nodes };
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
 * `archctx flows check --no-sync`: it reads the existing CodeGraph index from a
 * private snapshot and writes no index. A missing, stale or unsupported index is
 * `AC_CODE_FACTS_UNAVAILABLE`.
 */
function readFlows(root: string, capabilities: ReadonlySet<string>): ArchitectureViolationsLayerV1['flows'] {
  const read = runArchctx(root, ['flows', 'check', '--no-sync', '--json']);
  if (!read.ok) return archctxGap(read.error);
  const report = decoded(decodeFlowSelectorCheck, read.data);
  if (report === null) return { state: 'unavailable', reason: 'archctx_failed' };
  if (report.codeGraph.availability !== 'ready') return { state: 'unavailable', reason: 'code_facts_unavailable' };
  const unprovable = report.capabilities.filter(entry => entry.p2Status === 'unprovable');
  if (!unprovable.every(entry => capabilities.has(entry.capabilityId))) return { state: 'unavailable', reason: 'archctx_failed' };
  const { selectors, proven, unproven, usedUnproven } = report.summary;
  return {
    state: 'ok', selectors, proven, unproven, used_unproven: usedUnproven,
    unprovable: unprovable.map(entry => ({ id: entry.capabilityId, diagnostics: entry.diagnostics.length })),
  };
}

/**
 * Ids of the commit's `layer-direction` constraints. `constraints check` lists
 * the ids it evaluated but not their rule, so the committed constraint files
 * tell a layer-direction pass from a model with no such constraint. null: git
 * could not read them.
 */
function layerDirectionConstraints(root: string, commit: string): ReadonlySet<string> | null {
  const listed = git(root, ['ls-tree', '-z', '--name-only', commit, '--', `${CONSTRAINT_ROOT}/`]);
  if (listed.status !== 0) return null;
  const ids = new Set<string>();
  for (const path of listed.stdout.toString('utf8').split('\0').filter(name => name.endsWith('.yaml') || name.endsWith('.yml'))) {
    const blob = git(root, ['cat-file', 'blob', `${commit}:${path}`]);
    if (blob.status !== 0) return null;
    let constraint: unknown;
    try { constraint = Bun.YAML.parse(blob.stdout.toString('utf8')); } catch { return null; }
    if (isRecord(constraint) && isRecord(constraint.rule) && constraint.rule.type === 'layer-direction' && typeof constraint.id === 'string') ids.add(constraint.id);
  }
  return ids;
}

/**
 * `archctx constraints check` for the commit's `layer-direction` constraints:
 * file imports against `model.layers`, counted per owner pair. An endpoint that
 * no layered node owns, or incomplete code facts, make the answer undetermined.
 */
function readLayerDirection(root: string, commit: string, checkout: CheckoutState, layers: readonly string[] | undefined, known: ReadonlySet<string>): ArchitectureViolationsLayerV1['layer_direction'] {
  if (layers === undefined) return { state: 'unavailable', reason: 'model_layers_undeclared' };
  const gate = treeGate(commit, checkout);
  if (gate !== null) return { state: 'unavailable', reason: gate === 'unreadable' ? 'archctx_failed' : gate };
  const constraints = layerDirectionConstraints(root, commit);
  if (constraints === null) return ARCHCTX_FAILED;
  if (constraints.size === 0) return { state: 'unavailable', reason: 'layer_direction_undeclared' };
  const read = runArchctx(root, ['constraints', 'check', '--json']);
  if (!read.ok) return archctxGap(read.error);
  const report = decoded(decodeConstraintEvaluation, read.data);
  return report === null ? ARCHCTX_FAILED : layerDirectionSection(report, constraints, known);
}

/**
 * The map's form of a `constraints check` report for the given layer-direction
 * constraints. Violations of other constraints are left out. A constraint that
 * archctx did not evaluate, or a violation without layers or with a node the
 * map lacks, is `archctx_failed`.
 */
export function layerDirectionSection(report: DependencyConstraintEvaluationV1, constraints: ReadonlySet<string>, known: ReadonlySet<string>): ArchitectureViolationsLayerV1['layer_direction'] {
  if (![...constraints].every(constraint => report.constraintIds.includes(constraint))) return ARCHCTX_FAILED;
  if (report.status === 'undetermined' || report.coverage !== 'complete') {
    const reason = report.reasonCodes.includes('layer-endpoint-unclassified') ? 'layer_endpoint_unclassified'
      : report.reasonCodes.some(code => code === 'code-facts-unavailable' || code === 'code-facts-stale') ? 'code_facts_unavailable' : 'code_facts_incomplete';
    return { state: 'unavailable', reason };
  }
  const edges = new Map<string, ArchitectureLayerViolationV1>();
  for (const violation of report.violations.filter(entry => constraints.has(entry.constraintId))) {
    const { fromNode: source, toNode: target, fromLayer, toLayer } = violation;
    if (fromLayer === undefined || toLayer === undefined || !known.has(source) || !known.has(target)) return ARCHCTX_FAILED;
    const key = `${source}\0${target}`;
    edges.set(key, { source, target, source_layer: fromLayer, target_layer: toLayer, imports: (edges.get(key)?.imports ?? 0) + 1 });
  }
  return { state: 'ok', imports: report.importEdgeCount, edges: [...edges.values()] };
}

/** The violation checks that read the CodeGraph index; each runs only on a clean tree at the commit. */
function readViolations(root: string, commit: string, checkout: CheckoutState, known: ReadonlySet<string>, capabilities: ReadonlySet<string>): Pick<CollectedViolations, 'debt' | 'flows' | 'anchors'> {
  const gate = treeGate(commit, checkout);
  if (gate !== null) {
    const gap = { state: 'unavailable', reason: gate === 'unreadable' ? 'archctx_failed' : gate } as const;
    return { debt: gap, flows: gap, anchors: gap };
  }
  return { debt: readDebt(root, known), flows: readFlows(root, capabilities), anchors: readAnchors(root, known) };
}

/** The public node, relation and decision fields of the committed model, redacted before projection. */
function modelEntities(context: Pick<NativeContextExportV1, 'model' | 'decisions'>, root: string): {
  readonly nodes: ArchitectureMapNodeV1[];
  readonly relations: ArchitectureMapRelationV1[];
  readonly decisions: ArchitectureDecisionsLayerV1;
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
  const decisions = {
    state: 'ok',
    items: context.decisions.map(decision => ({
      id: prose(decision.id), title: prose(decision.title), status: decision.status === null ? null : prose(decision.status),
      decided_at: decision.decidedAt === null ? null : prose(decision.decidedAt), applies_to: decision.appliesTo,
      supersedes: decision.supersedes.map(prose), path: decision.path,
    })),
  };
  return publicValue({ nodes, relations, decisions }, root) as { nodes: ArchitectureMapNodeV1[]; relations: ArchitectureMapRelationV1[]; decisions: ArchitectureDecisionsLayerV1 };
}

/**
 * One repository's map. `since` starts today's window. This process has no
 * tests cache: the collector reads the tests layer from it in the server.
 */
export function collectArchitectureMap(
  repositoryId: string,
  path: string,
  collectedAt: string,
  since: string,
  pullRequests: ArchitecturePullRequestsSource,
  pullRequestBudgetMs = ARCHITECTURE_MAP_PR_BUDGET_MS,
): ArchitectureMapWorkerResult {
  const before = readCheckoutState(path);
  let committed;
  try { committed = readCommittedNativeContext(path); }
  catch { return { id: repositoryId, ok: false, reason: 'model_unavailable' }; }
  const { commit, context } = committed;
  const { nodes, relations, decisions } = modelEntities(context, realpathSync(path));
  const known = new Set(nodes.map(node => node.id));
  const capabilities = new Set(nodes.filter(node => node.kind === 'capability').map(node => node.id));
  const deps = readDependencies(path, commit, before, capabilities);
  const read = { sizes: readSizes(path, commit, before), dependencies: deps.dependencies };
  const changes = readChanges(path, commit, since);
  const layers = {
    pull_requests: readPullRequests(path, commit, before, pullRequests, pullRequestBudgetMs),
    violations: {
      ...readViolations(path, commit, before, known, capabilities), dependencies: deps.undeclared,
      layer_direction: readLayerDirection(path, commit, before, context.model.layers, known),
    },
  } as const;
  const after = readCheckoutState(path);
  const snapshot = projectArchitectureMap({
    repository_id: repositoryId, commit, collected_at: collectedAt, nodes, relations,
    layer_order: context.model.layers === undefined ? { state: 'unavailable', reason: 'model_layers_undeclared' } : { state: 'ok', layers: [...context.model.layers] },
    ...recheckCheckout(commit, before, after, read),
    layers: { changes, ...recheckLayers(commit, before, after, layers), tests: { state: 'unavailable', reason: 'tests_pending' }, decisions },
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
  // The collector wrote this file from its own cache; a file it cannot read leaves only the PR layer without data.
  let pullRequests: ArchitecturePullRequestsSource = { state: 'unavailable', reason: 'dev_activity_unavailable' };
  try { pullRequests = decodeArchitecturePullRequestsSource(JSON.parse(readFileSync(process.argv[3] ?? '', 'utf8'))); }
  catch { /* dev_activity_unavailable */ }
  const repo = readRepoHarnessRegistryStrictSnapshot({ env: process.env }).repos.find(entry => entry.id === id);
  let result: ArchitectureMapWorkerResult = { id, ok: false, reason: 'model_unavailable' };
  // A failure is one result; its cause (a path, an archctx error) stays in this process.
  if (repo) {
    const now = new Date();
    try { result = collectArchitectureMap(repo.id, repo.path, now.toISOString(), localMidnight(now), pullRequests); }
    catch { /* model_unavailable */ }
  }
  // Exit once the line is flushed so a handle left open cannot hold the child past its output.
  process.stdout.write(`${JSON.stringify(result)}\n`, () => process.exit(0));
}
