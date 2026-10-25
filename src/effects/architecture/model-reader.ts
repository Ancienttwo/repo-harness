import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { DocsAnchorsReportV1, NativeContextExportV1 } from 'archctx-contracts';
import { capabilityRegistryFromNativeContext, archcontextNodeId, type ArchcontextCapabilityOwners } from '../../core/capabilities/registry';
import { generatedSummaryState, moduleDetail, type GeneratedSummaryFreshness, type ModelNode, type ModelRelation, type ModelFlow, type ModuleIndexV1, type ModuleDetailV1, type LinkedModuleDoc } from '../../core/architecture/module-view';
import { buildModuleReviewPrompt, moduleStaleCitations, ModuleReadError, sha256, type ModuleReviewPromptV1, type PromptSource } from '../../core/review/module-review-prompt';
import { canonicalize } from '../../core/evidence/canonical-json';
import { markdownHeader } from '../../core/state/artifact-parsers';
import { repoHarnessRepoIdFor } from '../repo-registry';
import { resolveArchcontextCapabilityPaths } from './archcontext-owners';
import { ARCHCONTEXT_MANIFEST, ArchctxClientError, readArchitectureNativeContext, type ArchctxProviderOptions } from './archctx-provider';
import { version as PACKAGE_VERSION } from '../../../package.json';

const MODEL_ROOT = '.archcontext/model';
const DOC_INDEX = [['plans', 'plan'], ['tasks/contracts', 'contract']] as const;
const REGULAR_FILE = new Set(['100644', '100755']);
const SNAPSHOT_CACHE_SIZE = 4;
type ModelFile<T> = { path: string; value: T };
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
/** The decoded HEAD model shared by module and Engineer readers. */
export function readCommittedNativeContext(cwd: string): { commit: string; context: NativeContextExportV1 } {
  const root = repositoryRoot(cwd);
  const commit = resolveRevision(root, 'HEAD');
  return { commit, context: readArchitectureNativeContext(root, { kind: 'ref', commit }) };
}

function modelReadFailure(error: unknown): ModuleReadError {
  const code = error instanceof ArchctxClientError ? error.code : null;
  const path = error instanceof ArchctxClientError && typeof error.details?.path === 'string' ? error.details.path : undefined;
  switch (code) {
    case 'AC_MODEL_ADOPTION_REQUIRED': return new ModuleReadError('model_missing', path);
    case 'AC_SCHEMA_INVALID': return new ModuleReadError('model_invalid', path);
    case 'AC_PATH_DENIED': return new ModuleReadError('path_escape', path);
    case 'AC_PRECONDITION_FAILED':
    case 'AC_REPO_NOT_FOUND': return new ModuleReadError('git_read_failed', path);
    case 'RH_ARCHCTX_TIMEOUT': return new ModuleReadError('timeout', path);
    default: return new ModuleReadError('unavailable', path);
  }
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
  private readonly context: NativeContextExportV1;
  private readonly nodes: ModelFile<ModelNode>[];
  private readonly relations: ModelFile<ModelRelation>[];
  private readonly flows: ModelFile<ModelFlow>[];
  private readonly docs: { path: string; kind: 'contract' | 'plan'; bytes: Buffer; capability: string | null; status: string | null }[];
  private readonly budget: number;

  constructor(cwd: string, options: ArchctxProviderOptions = {}) {
    this.root = repositoryRoot(cwd);
    this.commit = this.resolveCommit('HEAD');
    this.snapshot = commitSnapshot(this.root, this.commit);
    try { this.context = readArchitectureNativeContext(this.root, { kind: 'ref', commit: this.commit }, options); }
    catch (error) { throw modelReadFailure(error); }
    const docIndex = DOC_INDEX.flatMap(([dir, kind]) => this.snapshot.regularFiles(path => path.startsWith(`${dir}/`) && !path.includes('/', dir.length + 1) && path.endsWith('.md'))
      .sort((a, b) => a.localeCompare(b, 'en')).map(path => ({ path, kind })));
    this.snapshot.load(docIndex.map(doc => doc.path));
    this.safePath(ARCHCONTEXT_MANIFEST);
    this.budget = this.context.contextBudgetBytes;
    const { model } = this.context;
    // The native decoder validates every record against the published model schemas.
    this.nodes = model.nodes.map(value => ({ path: model.sourcePaths.nodes[value.id as string], value: value as unknown as ModelNode }));
    this.relations = model.relations.map(value => ({ path: model.sourcePaths.relations[value.id as string], value: value as unknown as ModelRelation }));
    this.flows = model.flows.map(value => ({ path: model.sourcePaths.flows[value.id as string], value: value as unknown as ModelFlow }));
    const registry = capabilityRegistryFromNativeContext(this.context, { repoRoot: this.root });
    if (registry.status !== 'valid') throw new ModuleReadError('model_invalid', registry.diagnostics[0]?.path);
    this.owners = registry.owners;
    for (const profile of this.context.capabilityProfiles) {
      for (const anchor of profile.includeAnchors) { this.safePath(anchor); this.snapshot.entry(anchor); }
    }
    for (const file of this.nodes) {
      const node = file.value;
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

  private capability(id: string): ModelNode {
    const node = this.nodes.find(file => file.value.id === id && file.value.kind === 'capability')?.value;
    if (node) return node;
    throw new ModuleReadError(this.worktreeDeclaresCapability(id) ? 'capability_uncommitted' : 'capability_not_found');
  }
  /** Tells an uncommitted capability apart from an unknown one. Worktree bytes never become read output. */
  private worktreeDeclaresCapability(id: string): boolean {
    try {
      return readArchitectureNativeContext(this.root, { kind: 'worktree' }).model.nodes
        .some(node => node.id === id && node.kind === 'capability');
    } catch { return false; }
  }
  private anchors(node: ModelNode): string[] {
    return this.context.capabilityProfiles.find(profile => profile.nodeId === node.id)?.includeAnchors ?? [];
  }
  private docPath(id: string): string {
    const profile = this.context.capabilityProfiles.find(profile => profile.nodeId === id);
    if (!profile) throw new ModuleReadError('model_invalid');
    return profile.modulePath;
  }
  private section(path: string, name: 'section3' | 'backlog'): string | null {
    this.safePath(path); this.snapshot.entry(path);
    const section = this.context.documents.find(document => document.path === path)?.[name];
    return section?.state === 'present' ? section.body!.trim() : null;
  }
  private input(path: string): { path: string; bytes: number; sha256: string } | null {
    this.safePath(path); this.snapshot.entry(path);
    const input = this.context.inputs.find(input => input.path === path);
    if (!input || input.presence === 'missing') return null;
    return { path, bytes: input.byteLength!, sha256: input.contentDigest!.slice('sha256:'.length) };
  }
  private requiredInput(path: string): { path: string; bytes: number; sha256: string } {
    const input = this.input(path);
    if (!input) throw new ModuleReadError('source_missing', path);
    return input;
  }
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
    const section3 = this.section(this.docPath(id), 'section3');
    const linked: LinkedModuleDoc[] = this.linkedDocs(id).map(({ path, kind, status }) => ({ path, kind, status }));
    const flows: ModelFlow[] = this.flows.map(({ value }) => {
      const identity = { id: value.id, capabilityId: value.capabilityId, name: value.name };
      return value.applicability === 'not-applicable'
        ? { ...identity, applicability: value.applicability, rationale: value.rationale }
        : { ...identity, applicability: value.applicability,
          participants: value.participants.map(({ id, nodeId }) => ({ id, nodeId })), steps: value.steps, outcomes: value.outcomes };
    });
    return moduleDetail(this.commit, node, this.nodes.map(file => file.value), this.relations.map(file => file.value),
      flows, section3, linked,
      { model_valid: 'valid', generated_summary: generatedSummaryState(this.freshness(options), id) });
  }
  list(options: ModuleReadOptions = {}): ModuleIndexV1 {
    const freshness = this.freshness(options);
    return { schema_version: 'repo-harness.architecture-modules.v1', commit: this.commit,
      modules: this.nodes.filter(file => file.value.kind === 'capability').map(({ value }) => {
        const section3 = this.section(this.docPath(value.id), 'section3');
        return { id: value.id, domain: value.id.split('.')[1], name: value.name, status: value.status,
          components: this.nodes.filter(file => file.value.parent === value.id).length,
          state: { model_valid: 'valid' as const, generated_summary: generatedSummaryState(freshness, value.id), section3: section3 ? 'present' as const : 'pending' as const } };
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
    const node = this.capability(id), detail = this.detail(id, options), docPath = this.docPath(id), doc = this.input(docPath);
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
      { ...this.requiredInput(ARCHCONTEXT_MANIFEST), class: 'required' as const, disposition: 'included' as const },
      ...model.map(file => ({ ...this.requiredInput(file.path), class: file.path.includes('/flows/') ? 'optional' as const : 'required' as const, disposition: 'included' as const })),
      ...(doc ? [{ ...doc, class: 'optional' as const, disposition: 'included' as const }] : []),
      ...linked.map(file => ({ path: file.path, bytes: file.bytes.length, sha256: sha256(file.bytes), class: 'optional' as const, disposition: 'included' as const })),
      ...(diff === null ? [] : [{ path: 'diff', bytes: Buffer.byteLength(diff), sha256: sha256(diff), class: 'required' as const, disposition: 'included' as const }]),
      ...(anchorsText === null ? [] : [{ path: 'anchors', bytes: Buffer.byteLength(anchorsText), sha256: sha256(anchorsText), class: 'optional' as const, disposition: 'included' as const }]),
    ].sort((a, b) => a.path.localeCompare(b.path, 'en'));
    const sourceSections: Record<string, string[]> = { [ARCHCONTEXT_MANIFEST]: ['identity'], [docPath]: ['section3', 'backlog'], diff: ['diff'], anchors: ['stale_citations'] };
    for (const file of model) sourceSections[file.path] = file.path.includes('/flows/') ? ['flows'] : file.path.includes('/relations/') ? ['relations'] : ['model', 'relations'];
    for (const file of linked) sourceSections[file.path] = ['linked_docs'];
    // The whole model directory is in scope, so new and deleted model files show as dirty too.
    const scope = [...new Set([...this.anchors(node), ARCHCONTEXT_MANIFEST, MODEL_ROOT, docPath, ...linked.map(file => file.path)])].sort();
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = this.dirty(scope);
      const packet = buildModuleReviewPrompt({ detail, package_version: PACKAGE_VERSION, repository_id: repoHarnessRepoIdFor(this.root), input_cap_bytes: this.budget,
        worktree_dirty_paths: before.paths, dirty_content_sha256: before.digest,
        model_sha256: sha256(canonicalize(model.map(file => ({ path: file.path, sha256: this.requiredInput(file.path).sha256 })))),
        doc_sha256: doc?.sha256 ?? null, sources, source_sections: sourceSections, module_doc_path: docPath, base, head, diff,
        backlog: this.section(docPath, 'backlog'), stale_citations: staleCitations }, options.shard);
      const after = this.dirty(scope);
      if (before.digest === after.digest) return packet;
    }
    throw new ModuleReadError('worktree_changed_during_read');
  }
}
