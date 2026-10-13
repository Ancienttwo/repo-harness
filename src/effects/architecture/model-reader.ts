import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { validateJsonSchema, type DocsAnchorsReportV1, type Json } from 'archctx-contracts';
import nodeSchema from 'archctx-contracts/schemas/repo/architecture-node.schema.json';
import relationSchema from 'archctx-contracts/schemas/repo/architecture-relation.schema.json';
import flowSchema from 'archctx-contracts/schemas/repo/architecture-flow.schema.json';
import { capabilityRegistryFromArchcontextNodes, architectureModulePathFor, archcontextIncludeAnchor, archcontextNodeId, type ArchcontextCapabilityOwners, type ArchcontextNodeFile } from '../../core/capabilities/registry';
import { backlogFromMarkdown, generatedSummaryState, moduleDetail, section3FromMarkdown, type GeneratedSummaryFreshness, type ModelNode, type ModelRelation, type ModelFlow, type ModuleIndexV1, type ModuleDetailV1, type LinkedModuleDoc } from '../../core/architecture/module-view';
import { buildModuleReviewPrompt, moduleStaleCitations, ModuleReadError, sha256, type ModuleReviewPromptV1, type PromptSource } from '../../core/review/module-review-prompt';
import { canonicalize } from '../../core/evidence/canonical-json';
import { markdownHeader } from '../../core/state/artifact-parsers';
import { repoHarnessRepoIdFor } from '../repo-registry';
import { resolveArchcontextCapabilityPaths } from '../capabilities/archcontext-owners';
import type { ArchctxProviderOptions } from './archctx-provider';
import { version as PACKAGE_VERSION } from '../../../package.json';

const MODEL_ROOT = '.archcontext/model';
const MANIFEST = '.archcontext/manifest.yaml';
const MODULE_DOC = /^docs\/architecture\/modules\/[^/]+\/[^/]+\.md$/;
const DOC_INDEX = [['plans', 'plan'], ['tasks/contracts', 'contract']] as const;
const REGULAR_FILE = new Set(['100644', '100755']);
const SNAPSHOT_CACHE_SIZE = 4;
type ModelFile<T> = { path: string; bytes: Buffer; value: T };
type SnapshotEntry = { mode: string; type: 'blob' | 'tree' | 'commit'; oid: string };

function runGit(cwd: string, args: string[], input?: Buffer): Buffer {
  try {
    return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'diff.submodule=short', ...args], {
      cwd, input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], timeout: 10_000, maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, GIT_LITERAL_PATHSPECS: '1', GIT_NO_LAZY_FETCH: '1' },
    });
  } catch { throw new ModuleReadError('git_read_failed'); }
}

/**
 * One commit tree. One `git ls-tree` lists every path; blobs are read in one
 * `git cat-file --batch` per `load` call. Every reader of the same commit in
 * this process shares one snapshot.
 */
class CommitSnapshot {
  private readonly entries = new Map<string, SnapshotEntry>();
  private readonly blobs = new Map<string, Buffer>();
  private nodes: ArchcontextNodeFile[] | null = null;

  constructor(readonly root: string, readonly commit: string) {
    // -z prints raw path bytes, so no C-quote decoding is needed.
    const raw = runGit(root, ['ls-tree', '-r', '-t', '-z', '--full-tree', commit]);
    let start = 0;
    while (start < raw.length) {
      const end = raw.indexOf(0, start);
      if (end < 0) throw new ModuleReadError('tree_path_invalid');
      const record = raw.subarray(start, end);
      start = end + 1;
      const tab = record.indexOf(9);
      const meta = tab < 0 ? null : /^(\d{6}) (blob|tree|commit) ([0-9a-f]{40}|[0-9a-f]{64})$/.exec(record.subarray(0, tab).toString('latin1'));
      if (!meta) throw new ModuleReadError('tree_path_invalid');
      const bytes = record.subarray(tab + 1);
      const path = bytes.toString('utf8');
      // A name that is not UTF-8 cannot be a model, document or source path that a reader asks for.
      if (!Buffer.from(path, 'utf8').equals(bytes)) continue;
      this.entries.set(path, { mode: meta[1], type: meta[2] as SnapshotEntry['type'], oid: meta[3] });
    }
  }

  /** The entry at `path`. A symlink or submodule on the path escapes the snapshot. */
  entry(path: string): SnapshotEntry | undefined {
    const parts = path.split('/');
    for (let index = 1; index <= parts.length; index++) {
      const entry = this.entries.get(parts.slice(0, index).join('/'));
      if (!entry) return undefined;
      if (entry.mode === '120000' || entry.type === 'commit') throw new ModuleReadError('path_escape', path);
      if (index === parts.length) return entry;
      if (entry.type !== 'tree') throw new ModuleReadError('path_invalid', path);
    }
    return undefined;
  }
  /** Direct child names of a tree, in tree order. */
  children(dir: string): string[] {
    const prefix = `${dir}/`;
    return [...this.entries.keys()].filter(path => path.startsWith(prefix) && !path.includes('/', prefix.length)).map(path => path.slice(prefix.length));
  }
  /** Paths that hold regular files, for an index that skips other entry kinds. */
  regularFiles(filter: (path: string) => boolean): string[] {
    return [...this.entries].filter(([path, entry]) => entry.type === 'blob' && REGULAR_FILE.has(entry.mode) && filter(path)).map(([path]) => path);
  }
  private blob(path: string): SnapshotEntry {
    const entry = this.entry(path);
    if (!entry || entry.type !== 'blob') throw new ModuleReadError('source_missing', path);
    return entry;
  }
  /** Reads every blob that is not cached yet with one `git cat-file --batch`. */
  load(paths: readonly string[]): void {
    const oids = [...new Set(paths.map(path => this.blob(path).oid))].filter(oid => !this.blobs.has(oid));
    if (oids.length === 0) return;
    const out = runGit(this.root, ['cat-file', '--batch'], Buffer.from(oids.map(oid => `${oid}\n`).join('')));
    let offset = 0;
    for (const oid of oids) {
      const newline = out.indexOf(10, offset);
      const header = newline < 0 ? null : /^([0-9a-f]{40}|[0-9a-f]{64}) blob (\d+)$/.exec(out.subarray(offset, newline).toString('latin1'));
      if (!header || header[1] !== oid) throw new ModuleReadError('git_read_failed');
      const begin = newline + 1, size = Number(header[2]);
      if (out.length < begin + size + 1 || out[begin + size] !== 10) throw new ModuleReadError('git_read_failed');
      this.blobs.set(oid, Buffer.from(out.subarray(begin, begin + size)));
      offset = begin + size + 1;
    }
    if (offset !== out.length) throw new ModuleReadError('git_read_failed');
  }
  /** Bytes of a blob that an earlier `load` read. */
  bytes(path: string): Buffer {
    const bytes = this.blobs.get(this.blob(path).oid);
    if (!bytes) throw new ModuleReadError('git_read_failed', path);
    return bytes;
  }
  /** Parsed node files under `.archcontext/model/nodes`, in name order. */
  nodeFiles(): ArchcontextNodeFile[] {
    if (this.nodes) return this.nodes;
    const paths = modelPaths(this, 'nodes');
    this.load(paths);
    this.nodes = paths.map(path => ({ path, value: parseYaml(this, path) }));
    return this.nodes;
  }
}

const snapshots = new Map<string, CommitSnapshot>();
function commitSnapshot(root: string, commit: string): CommitSnapshot {
  const key = `${root}\0${commit}`;
  const cached = snapshots.get(key);
  if (cached) { snapshots.delete(key); snapshots.set(key, cached); return cached; }
  const snapshot = new CommitSnapshot(root, commit);
  snapshots.set(key, snapshot);
  if (snapshots.size > SNAPSHOT_CACHE_SIZE) snapshots.delete(snapshots.keys().next().value!);
  return snapshot;
}

function resolveRevision(root: string, rev: string): string {
  if (!rev || rev.startsWith('-') || /[\x00-\x20]/.test(rev)) throw new ModuleReadError('revision_invalid');
  const sha = runGit(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${rev}^{commit}`]).toString('utf8').trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sha)) throw new ModuleReadError('revision_invalid');
  return sha;
}
function repositoryRoot(cwd: string): string {
  return realpathSync(runGit(cwd, ['rev-parse', '--show-toplevel']).toString('utf8').trim());
}
function modelPaths(snapshot: CommitSnapshot, kind: string): string[] {
  const dir = `${MODEL_ROOT}/${kind}`;
  const entry = snapshot.entry(dir);
  if (!entry || entry.type !== 'tree') throw new ModuleReadError('model_missing', dir);
  return snapshot.children(dir).filter(name => /\.ya?ml$/.test(name)).sort((a, b) => a.localeCompare(b, 'en')).map(name => `${dir}/${name}`);
}
function parseYaml(snapshot: CommitSnapshot, path: string): unknown {
  try { return Bun.YAML.parse(snapshot.bytes(path).toString('utf8')); }
  catch (error) { if (error instanceof ModuleReadError) throw error; throw new ModuleReadError('yaml_invalid', path); }
}

/**
 * Node files of the HEAD snapshot. This is the same snapshot that
 * ArchitectureModelReader reads, so Engineer contract revisions and module
 * views agree on one commit.
 */
export function readCommittedArchcontextNodes(cwd: string): { commit: string; nodes: readonly ArchcontextNodeFile[] } {
  const root = repositoryRoot(cwd);
  const commit = resolveRevision(root, 'HEAD');
  return { commit, nodes: commitSnapshot(root, commit).nodeFiles() };
}

export interface ModuleReadOptions {
  /** A decoded `architecture-projection check` result for this commit. */
  freshness?: GeneratedSummaryFreshness;
}
export interface ModuleReviewOptions extends ModuleReadOptions {
  shard?: number;
  base?: string;
  head?: string;
  /** A decoded `architecture-projection anchors` report. */
  anchors?: DocsAnchorsReportV1;
  /** Process options for `archctx resolve` in diff mode. */
  archctx?: ArchctxProviderOptions;
}

/** One immutable HEAD snapshot. It reads no authority from the worktree. */
export class ArchitectureModelReader {
  readonly root: string;
  readonly commit: string;
  private readonly snapshot: CommitSnapshot;
  private readonly owners: ArchcontextCapabilityOwners;
  private readonly nodes: ModelFile<ModelNode>[];
  private readonly relations: ModelFile<ModelRelation>[];
  private readonly flows: ModelFile<ModelFlow>[];
  private readonly docs: { path: string; kind: 'contract' | 'plan'; bytes: Buffer; capability: string | null; status: string | null }[];
  private readonly budget: number;
  private readonly invalidFlows: { path: string; capability: string | null }[] = [];

  constructor(cwd: string) {
    this.root = repositoryRoot(cwd);
    this.commit = this.resolveCommit('HEAD');
    this.snapshot = commitSnapshot(this.root, this.commit);
    const model = { nodes: modelPaths(this.snapshot, 'nodes'), relations: modelPaths(this.snapshot, 'relations'), flows: modelPaths(this.snapshot, 'flows') };
    const docIndex = DOC_INDEX.flatMap(([dir, kind]) => this.snapshot.regularFiles(path => path.startsWith(`${dir}/`) && !path.includes('/', dir.length + 1) && path.endsWith('.md'))
      .sort((a, b) => a.localeCompare(b, 'en')).map(path => ({ path, kind })));
    // One batch holds every blob any read of this snapshot uses.
    this.snapshot.load([MANIFEST, ...model.nodes, ...model.relations, ...model.flows,
      ...this.snapshot.regularFiles(path => MODULE_DOC.test(path)), ...docIndex.map(doc => doc.path)]);
    this.safePath(MANIFEST);
    const manifest = parseYaml(this.snapshot, MANIFEST) as { runtime?: { contextBudgetBytes?: unknown } };
    const budget = manifest?.runtime?.contextBudgetBytes;
    if (typeof budget !== 'number' || !Number.isSafeInteger(budget) || budget <= 0) throw new ModuleReadError('context_budget_invalid', MANIFEST);
    this.budget = budget;
    this.nodes = this.modelFiles<ModelNode>(model.nodes, nodeSchema);
    this.relations = this.modelFiles<ModelRelation>(model.relations, relationSchema);
    // The package's validator type omits contains/minContains from its own flow schema.
    this.flows = this.modelFiles<ModelFlow>(model.flows, flowSchema as unknown as Parameters<typeof validateJsonSchema>[0], true);
    const registry = capabilityRegistryFromArchcontextNodes(this.nodes.map(file => ({ path: file.path, value: file.value })), { repoRoot: this.root });
    if (registry.status !== 'valid') throw new ModuleReadError('model_invalid', registry.diagnostics[0]?.path);
    this.owners = registry.owners;
    const ids = new Set<string>();
    for (const file of [...this.nodes, ...this.relations, ...this.flows]) {
      if (ids.has(file.value.id)) throw new ModuleReadError('model_duplicate_id', file.path);
      ids.add(file.value.id);
    }
    const nodeIds = new Set(this.nodes.map(file => file.value.id));
    for (const file of this.invalidFlows) if (file.capability && !nodeIds.has(file.capability)) file.capability = null;
    for (const file of this.relations) {
      if (!nodeIds.has(file.value.source) || !nodeIds.has(file.value.target)) throw new ModuleReadError('model_relation_target_invalid', file.path);
    }
    for (const file of this.flows) {
      if (!nodeIds.has(file.value.capabilityId) || (file.value.applicability === 'required' && file.value.participants.some(participant => !nodeIds.has(participant.nodeId)))) throw new ModuleReadError('model_flow_target_invalid', file.path);
    }
    for (const file of this.nodes) {
      const node = file.value;
      if (node.parent && !nodeIds.has(node.parent)) throw new ModuleReadError('model_parent_invalid', file.path);
      // Include shapes belong to ArchContext validation; only literal anchors become paths here.
      // An anchorless glob is valid, so an escaping pattern is refused on its own.
      for (const pattern of [...node.source?.include ?? [], ...node.source?.exclude ?? []]) {
        if (isAbsolute(pattern) || pattern.split('/').includes('..')) throw new ModuleReadError('path_escape', file.path);
      }
      for (const anchor of this.anchors(node)) { this.safePath(anchor); this.snapshot.entry(anchor); }
      for (const entry of node.source?.entrypoints ?? []) {
        this.safePath(entry.path); this.snapshot.entry(entry.path);
        for (const symbol of entry.symbols) for (const sink of symbol.sinks) {
          this.safePath(sink.path); this.snapshot.entry(sink.path);
        }
      }
    }
    // Only active plan and contract directories belong to this index. Their names
    // come from the Git tree and are checked only when a module links them.
    this.docs = docIndex.map(({ path, kind }) => {
      const bytes = this.snapshot.bytes(path), text = bytes.toString('utf8');
      return { path, bytes, kind, capability: markdownHeader(text, 'Capability ID'), status: markdownHeader(text, 'Status') };
    });
  }

  private git(args: string[]): Buffer { return runGit(this.root, args); }

  resolveCommit(rev: string): string { return resolveRevision(this.root, rev); }

  private safePath(path: string): string {
    if (!path || isAbsolute(path) || path.split('/').some(part => part === '..' || part === '.' || !part) || /[\\\x00-\x1f\x7f]/.test(path)) throw new ModuleReadError('path_escape');
    let current = this.root;
    for (const part of path.split('/')) {
      current = resolve(current, part);
      if (!existsSync(current)) {
        // A dangling symlink is not a missing worktree file.
        try { if (lstatSync(current).isSymbolicLink()) throw new ModuleReadError('path_escape', path); }
        catch (error) { if (error instanceof ModuleReadError) throw error; }
        break;
      }
      if (lstatSync(current).isSymbolicLink()) throw new ModuleReadError('path_escape', path);
      const scoped = relative(this.root, realpathSync(current));
      if (scoped === '..' || scoped.startsWith(`..${sep}`) || isAbsolute(scoped)) throw new ModuleReadError('path_escape', path);
    }
    return resolve(this.root, path);
  }

  private read(path: string): Buffer | null {
    this.safePath(path);
    const entry = this.snapshot.entry(path);
    if (!entry) return null;
    return this.snapshot.bytes(path);
  }
  private modelFiles<T>(paths: string[], schema: Parameters<typeof validateJsonSchema>[0], reportInvalid = false): ModelFile<T>[] {
    return paths.flatMap(path => {
      this.safePath(path);
      const bytes = this.snapshot.bytes(path), value = parseYaml(this.snapshot, path);
      let valid;
      try { valid = validateJsonSchema(schema, value as Json).valid; }
      catch { throw new ModuleReadError('model_validation_unavailable', path); }
      if (!valid) {
        if (!reportInvalid) throw new ModuleReadError('model_invalid', path);
        const capability = value !== null && typeof value === 'object' && 'capabilityId' in value && typeof value.capabilityId === 'string' ? value.capabilityId : null;
        this.invalidFlows.push({ path, capability });
        return [];
      }
      // T is the local projection type for this schema. Rejected bytes never reach this cast.
      return [{ path, bytes, value: value as T }];
    });
  }

  private capability(id: string): ModelNode {
    const node = this.nodes.find(file => file.value.id === id && file.value.kind === 'capability')?.value;
    if (node) return node;
    throw new ModuleReadError(this.worktreeDeclaresCapability(id) ? 'capability_uncommitted' : 'capability_not_found');
  }
  /** Tells an uncommitted capability apart from an unknown one. Worktree bytes never become read output. */
  private worktreeDeclaresCapability(id: string): boolean {
    const dir = join(this.root, MODEL_ROOT, 'nodes');
    if (!existsSync(dir) || !lstatSync(dir).isDirectory()) return false;
    return readdirSync(dir).filter(name => /\.ya?ml$/.test(name) && lstatSync(join(dir, name)).isFile()).some(name => {
      let value: unknown;
      try { value = Bun.YAML.parse(readFileSync(join(dir, name), 'utf8')); } catch { return false; }
      return value !== null && typeof value === 'object' && (value as Record<string, unknown>).id === id && (value as Record<string, unknown>).kind === 'capability';
    });
  }
  private anchors(node: ModelNode): string[] {
    return [...new Set((node.source?.include ?? []).map(archcontextIncludeAnchor).filter((anchor): anchor is string => anchor !== null))];
  }
  private docPath(id: string): string { const [, domain, name] = id.split('.'); return architectureModulePathFor(domain, name); }
  private freshness(options: ModuleReadOptions): GeneratedSummaryFreshness | null {
    if (options.freshness === undefined) return null;
    if (options.freshness.commit !== this.commit) throw new ModuleReadError('projection_check_commit_mismatch');
    return options.freshness;
  }
  private linkedDocs(id: string) {
    const linked = this.docs.filter(item => item.capability === id);
    for (const doc of linked) if (/[\\\x00-\x1f\x7f]/.test(doc.path)) throw new ModuleReadError('path_invalid', doc.path);
    return linked;
  }

  detail(id: string, options: ModuleReadOptions = {}): ModuleDetailV1 {
    const node = this.capability(id);
    const invalid = this.invalidFlows.find(file => file.capability === null || file.capability === id);
    if (invalid) throw new ModuleReadError('model_invalid', invalid.path);
    const doc = this.read(this.docPath(id));
    const linked: LinkedModuleDoc[] = this.linkedDocs(id).map(({ path, kind, status }) => ({ path, kind, status }));
    const flows: ModelFlow[] = this.flows.map(({ value }) => {
      const identity = { id: value.id, capabilityId: value.capabilityId, name: value.name };
      return value.applicability === 'not-applicable'
        ? { ...identity, applicability: value.applicability, rationale: value.rationale }
        : { ...identity, applicability: value.applicability,
          participants: value.participants.map(({ id, nodeId }) => ({ id, nodeId })), steps: value.steps, outcomes: value.outcomes };
    });
    return moduleDetail(this.commit, node, this.nodes.map(file => file.value), this.relations.map(file => file.value),
      flows, section3FromMarkdown(doc?.toString('utf8') ?? null), linked,
      { model_valid: 'valid', generated_summary: generatedSummaryState(this.freshness(options), id) });
  }
  list(options: ModuleReadOptions = {}): ModuleIndexV1 {
    const freshness = this.freshness(options);
    return { schema_version: 'repo-harness.architecture-modules.v1', commit: this.commit,
      modules: this.nodes.filter(file => file.value.kind === 'capability').map(({ value }) => {
        const section3 = section3FromMarkdown(this.read(this.docPath(value.id))?.toString('utf8') ?? null);
        const invalid = this.invalidFlows.some(file => file.capability === null || file.capability === value.id);
        return { id: value.id, domain: value.id.split('.')[1], name: value.name, status: value.status,
          components: this.nodes.filter(file => file.value.parent === value.id).length,
          state: { model_valid: invalid ? 'invalid' as const : 'valid' as const, generated_summary: generatedSummaryState(freshness, value.id), section3: section3 ? 'present' as const : 'pending' as const } };
      }) };
  }

  private dirty(scope: string[]): { paths: string[]; digest: string | null } {
    // Porcelain v2 binds index modes and object IDs (including conflict stages).
    // NUL records preserve rename pairs and literal spaces, arrows and quotes.
    const bytes = this.git(['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=dirty', '--', ...scope]);
    let raw: string;
    try { raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new ModuleReadError('git_path_encoding_invalid'); }
    const entries = raw.split('\0');
    if (entries.pop() !== '') throw new ModuleReadError('dirty_path_invalid');
    const paths = new Set<string>();
    for (let index = 0; index < entries.length; index++) {
      const record = entries[index];
      const match = /^(?:1 (?:\S+ ){7}|2 (?:\S+ ){8}|u (?:\S+ ){9}|\? )(.+)$/s.exec(record);
      if (!match) throw new ModuleReadError('dirty_path_invalid');
      const names = record.startsWith('2 ') ? [match[1], entries[++index]] : [match[1]];
      for (const path of names) {
        if (!path || path.endsWith('/')) throw new ModuleReadError('dirty_path_invalid');
        this.safePath(path); paths.add(path);
      }
    }
    const sorted = [...paths].sort();
    const records = sorted.map(path => {
      const absolute = this.safePath(path);
      if (!existsSync(absolute)) return { path, sha256: null };
      if (!lstatSync(absolute).isFile()) throw new ModuleReadError('dirty_path_invalid', path);
      return { path, sha256: sha256(readFileSync(absolute)) };
    });
    return { paths: sorted, digest: sorted.length ? sha256(canonicalize({ status: raw, files: records })) : null };
  }

  /**
   * The diff of the changed paths that ArchContext assigns to this capability.
   * `archctx resolve` owns the include, exclude and component glob rules.
   */
  private moduleDiff(id: string, base: string, head: string, options: ArchctxProviderOptions): string {
    const raw = this.git(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', base, head]);
    let names: string[];
    try { names = new TextDecoder('utf-8', { fatal: true }).decode(raw).split('\0').filter(Boolean); }
    catch { throw new ModuleReadError('git_path_encoding_invalid'); }
    if (names.length === 0) return '';
    let resolution;
    try { resolution = resolveArchcontextCapabilityPaths(this.root, this.owners, names, options); }
    catch { throw new ModuleReadError('diff_owner_resolution_failed'); }
    // Unavailable ownership, a model that archctx rejected (ARCHCONTEXT_MODEL_REJECTED) and an
    // ambiguous or invalid path can each hide a path of this module.
    // An owner that is no capability node at HEAD (for example an uncommitted one) is never this module.
    if (resolution.status === 'unavailable' || resolution.diagnostics.some(item => item.code !== 'ARCHCONTEXT_OWNER_UNKNOWN')) {
      throw new ModuleReadError('diff_owner_resolution_failed');
    }
    const owned = resolution.matches.filter(match => archcontextNodeId(match.capability) === id).map(match => match.filePath);
    return owned.length ? this.git(['diff', '--no-ext-diff', '--no-textconv', base, head, '--', ...owned]).toString('utf8') : '';
  }

  reviewPrompt(id: string, options: ModuleReviewOptions = {}): ModuleReviewPromptV1 {
    if ((options.base === undefined) !== (options.head === undefined)) throw new ModuleReadError('diff_refs_required');
    const node = this.capability(id), detail = this.detail(id, options), docPath = this.docPath(id), doc = this.read(docPath);
    const base = options.base === undefined ? null : this.resolveCommit(options.base);
    const head = options.head === undefined ? null : this.resolveCommit(options.head);
    const diff = base && head ? this.moduleDiff(id, base, head, options.archctx ?? {}) : null;
    const local = new Set(this.nodes.filter(file => file.value.id === id || file.value.parent === id).map(file => file.value.id));
    const relations = this.relations.filter(file => local.has(file.value.source) || local.has(file.value.target));
    const neighborhood = new Set([...local, ...relations.flatMap(file => [file.value.source, file.value.target])]);
    const model = [...this.nodes.filter(file => neighborhood.has(file.value.id)), ...relations,
      ...this.flows.filter(file => detail.flows.some(flow => flow.id === file.value.id))].sort((a, b) => a.path.localeCompare(b.path, 'en'));
    const linked = this.linkedDocs(id);
    const staleCitations = options.anchors === undefined ? null : moduleStaleCitations(options.anchors, local);
    const anchorsText = staleCitations === null ? null : canonicalize(staleCitations as unknown as Parameters<typeof canonicalize>[0]);
    const sources: PromptSource[] = [
      { path: MANIFEST, bytes: this.snapshot.bytes(MANIFEST).length, sha256: sha256(this.snapshot.bytes(MANIFEST)), class: 'required' as const, disposition: 'included' as const },
      ...model.map(file => ({ path: file.path, bytes: file.bytes.length, sha256: sha256(file.bytes), class: file.path.includes('/flows/') ? 'optional' as const : 'required' as const, disposition: 'included' as const })),
      ...(doc ? [{ path: docPath, bytes: doc.length, sha256: sha256(doc), class: 'optional' as const, disposition: 'included' as const }] : []),
      ...linked.map(file => ({ path: file.path, bytes: file.bytes.length, sha256: sha256(file.bytes), class: 'optional' as const, disposition: 'included' as const })),
      ...(diff === null ? [] : [{ path: 'diff', bytes: Buffer.byteLength(diff), sha256: sha256(diff), class: 'required' as const, disposition: 'included' as const }]),
      ...(anchorsText === null ? [] : [{ path: 'anchors', bytes: Buffer.byteLength(anchorsText), sha256: sha256(anchorsText), class: 'optional' as const, disposition: 'included' as const }]),
    ].sort((a, b) => a.path.localeCompare(b.path, 'en'));
    const sourceSections: Record<string, string[]> = { [MANIFEST]: ['identity'], [docPath]: ['section3', 'backlog'], diff: ['diff'], anchors: ['stale_citations'] };
    for (const file of model) sourceSections[file.path] = file.path.includes('/flows/') ? ['flows'] : file.path.includes('/relations/') ? ['relations'] : ['model', 'relations'];
    for (const file of linked) sourceSections[file.path] = ['linked_docs'];
    // The whole model directory is in scope, so new and deleted model files show as dirty too.
    const scope = [...new Set([...this.anchors(node), MANIFEST, MODEL_ROOT, docPath, ...linked.map(file => file.path)])].sort();
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = this.dirty(scope);
      const packet = buildModuleReviewPrompt({ detail, package_version: PACKAGE_VERSION, repository_id: repoHarnessRepoIdFor(this.root), input_cap_bytes: this.budget,
        worktree_dirty_paths: before.paths, dirty_content_sha256: before.digest,
        model_sha256: sha256(canonicalize(model.map(file => ({ path: file.path, sha256: sha256(file.bytes) })))),
        doc_sha256: doc ? sha256(doc) : null, sources, source_sections: sourceSections, module_doc_path: docPath, base, head, diff,
        backlog: backlogFromMarkdown(doc?.toString('utf8') ?? null), stale_citations: staleCitations }, options.shard);
      const after = this.dirty(scope);
      if (before.digest === after.digest) return packet;
    }
    throw new ModuleReadError('worktree_changed_during_read');
  }
}
