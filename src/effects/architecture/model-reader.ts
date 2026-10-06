import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { validateJsonSchema, type Json } from 'archctx-contracts';
import nodeSchema from 'archctx-contracts/schemas/repo/architecture-node.schema.json';
import relationSchema from 'archctx-contracts/schemas/repo/architecture-relation.schema.json';
import flowSchema from 'archctx-contracts/schemas/repo/architecture-flow.schema.json';
import { capabilityRegistryFromArchcontextNodes, architectureModulePathFor, archcontextIncludeToPrefix } from '../../core/capabilities/registry';
import { moduleDetail, section3FromMarkdown, type ModelNode, type ModelRelation, type ModelFlow, type ModuleIndexV1, type ModuleDetailV1, type LinkedModuleDoc } from '../../core/architecture/module-view';
import { buildModuleReviewPrompt, ModuleReadError, sha256, type ModuleReviewPromptV1, type PromptSource } from '../../core/review/module-review-prompt';
import { canonicalize } from '../../core/evidence/canonical-json';
import { markdownHeader } from '../../core/state/artifact-parsers';
import { repoHarnessRepoIdFor } from '../repo-registry';
import { version as PACKAGE_VERSION } from '../../../package.json';

const MODEL_ROOT = '.archcontext/model';
const MANIFEST = '.archcontext/manifest.yaml';
type ModelFile<T> = { path: string; bytes: Buffer; value: T };
type TreeEntry = { mode: string; type: string; name: string };

/** Decode Git's C-quoted path bytes. This is transport decoding, not path authority. */
function gitPath(value: string): string {
  if (!value.startsWith('"')) return value;
  if (!value.endsWith('"')) throw new ModuleReadError('git_path_encoding_invalid');
  const bytes: number[] = [];
  const escapes: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };
  for (let index = 1; index < value.length - 1; index++) {
    if (value[index] !== '\\') { bytes.push(...Buffer.from(value[index])); continue; }
    const escaped = value[++index];
    if (/[0-7]/.test(escaped)) {
      const octal = value.slice(index, index + 3);
      if (!/^[0-7]{3}$/.test(octal)) throw new ModuleReadError('git_path_encoding_invalid');
      bytes.push(parseInt(octal, 8)); index += 2;
    } else {
      if (escapes[escaped] === undefined) throw new ModuleReadError('git_path_encoding_invalid');
      bytes.push(escapes[escaped]);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

/** One immutable HEAD snapshot. It reads no authority from the worktree. */
export class ArchitectureModelReader {
  readonly root: string;
  readonly commit: string;
  private readonly byteCache = new Map<string, Buffer>();
  private readonly treeCache = new Map<string, TreeEntry[]>();
  private readonly nodes: ModelFile<ModelNode>[];
  private readonly relations: ModelFile<ModelRelation>[];
  private readonly flows: ModelFile<ModelFlow>[];
  private readonly docs: { path: string; kind: 'contract' | 'plan'; bytes: Buffer; capability: string | null; status: string | null }[];
  private readonly budget: number;
  private readonly invalidFlows: { path: string; capability: string | null }[] = [];

  constructor(cwd: string) {
    this.root = realpathSync(this.gitAt(cwd, ['rev-parse', '--show-toplevel']).toString('utf8').trim());
    this.commit = this.resolveCommit('HEAD');
    const manifest = this.yaml(MANIFEST) as { runtime?: { contextBudgetBytes?: unknown } };
    const budget = manifest?.runtime?.contextBudgetBytes;
    if (typeof budget !== 'number' || !Number.isSafeInteger(budget) || budget <= 0) throw new ModuleReadError('context_budget_invalid', MANIFEST);
    this.budget = budget;
    this.nodes = this.modelFiles<ModelNode>('nodes', nodeSchema);
    this.relations = this.modelFiles<ModelRelation>('relations', relationSchema);
    // The package's validator type omits contains/minContains from its own flow schema.
    this.flows = this.modelFiles<ModelFlow>('flows', flowSchema as unknown as Parameters<typeof validateJsonSchema>[0], true);
    const registry = capabilityRegistryFromArchcontextNodes(this.nodes.map(file => ({ path: file.path, value: file.value })), {
      repoRoot: this.root, isExistingDirectory: path => this.entry(path)?.type === 'tree',
    });
    if (registry.status !== 'valid') throw new ModuleReadError('model_invalid', registry.diagnostics[0]?.path);
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
      for (const include of node.source?.include ?? []) {
        const translation = archcontextIncludeToPrefix(include, { isExistingDirectory: path => this.entry(path)?.type === 'tree' });
        if (translation.status !== 'prefix') throw new ModuleReadError('source_include_invalid', file.path);
        this.safePath(translation.prefix);
        this.assertCommittedPath(translation.prefix);
      }
      for (const entry of node.source?.entrypoints ?? []) {
        this.safePath(entry.path); this.assertCommittedPath(entry.path);
        for (const symbol of entry.symbols) for (const sink of symbol.sinks) {
          this.safePath(sink.path); this.assertCommittedPath(sink.path);
        }
      }
    }
    // Only active plan and contract directories belong to this phase's index.
    this.docs = [ ['plans', 'plan'], ['tasks/contracts', 'contract'] ].flatMap(([dir, kind]) =>
      this.tree(dir, true).filter(entry => entry.type === 'blob' && entry.name.endsWith('.md')).map(entry => {
        const path = `${dir}/${entry.name}`, bytes = this.read(path)!;
        const text = bytes.toString('utf8');
        return { path, bytes, kind: kind as 'contract' | 'plan', capability: markdownHeader(text, 'Capability ID'), status: markdownHeader(text, 'Status') };
      }));
  }

  private gitAt(cwd: string, args: string[]): Buffer {
    try {
      return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'diff.submodule=short', ...args], {
        cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000, maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, GIT_LITERAL_PATHSPECS: '1', GIT_NO_LAZY_FETCH: '1' },
      });
    } catch { throw new ModuleReadError('git_read_failed'); }
  }
  private git(args: string[]): Buffer { return this.gitAt(this.root, args); }

  resolveCommit(rev: string): string {
    if (!rev || rev.startsWith('-') || /[\x00-\x20]/.test(rev)) throw new ModuleReadError('revision_invalid');
    const sha = this.git(['rev-parse', '--verify', '--quiet', '--end-of-options', `${rev}^{commit}`]).toString('utf8').trim();
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sha)) throw new ModuleReadError('revision_invalid');
    return sha;
  }

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

  private tree(path: string, optional = false): TreeEntry[] {
    if (this.treeCache.has(path)) return this.treeCache.get(path)!;
    if (path && !this.entry(path)) {
      if (optional) return [];
      throw new ModuleReadError('model_missing', path);
    }
    this.safePath(path || '.git-placeholder');
    const raw = this.git(['cat-file', '-p', `${this.commit}:${path}`]).toString('utf8');
    const entries = raw.trimEnd() ? raw.trimEnd().split('\n').map(line => {
      const match = /^(\d+) (blob|tree|commit) [0-9a-f]+\t([^\x00-\x1f]+)$/.exec(line);
      if (!match) throw new ModuleReadError('tree_path_invalid', path);
      return { mode: match[1], type: match[2], name: gitPath(match[3]) };
    }) : [];
    this.treeCache.set(path, entries);
    return entries;
  }
  private entry(path: string): TreeEntry | undefined {
    const parts = path.split('/');
    let dir = '';
    for (const [index, part] of parts.entries()) {
      const entry = this.tree(dir).find(item => item.name === part);
      if (!entry) return undefined;
      if (entry.mode === '120000' || entry.type === 'commit') throw new ModuleReadError('path_escape', path);
      if (index === parts.length - 1) return entry;
      if (entry.type !== 'tree') throw new ModuleReadError('path_invalid', path);
      dir = dir ? `${dir}/${part}` : part;
    }
    return undefined;
  }
  private assertCommittedPath(path: string): void { this.entry(path); }
  private read(path: string, optional = false): Buffer | null {
    this.safePath(path);
    const entry = this.entry(path);
    if (!entry && optional) return null;
    if (!entry || entry.type !== 'blob') throw new ModuleReadError('source_missing', path);
    if (!this.byteCache.has(path)) this.byteCache.set(path, this.git(['cat-file', '-p', `${this.commit}:${path}`]));
    return this.byteCache.get(path)!;
  }
  private yaml(path: string): unknown {
    try { return Bun.YAML.parse(this.read(path)!.toString('utf8')); }
    catch (error) { if (error instanceof ModuleReadError) throw error; throw new ModuleReadError('yaml_invalid', path); }
  }
  private modelFiles<T>(kind: string, schema: Parameters<typeof validateJsonSchema>[0], reportInvalid = false): ModelFile<T>[] {
    const dir = `${MODEL_ROOT}/${kind}`;
    return this.tree(dir).filter(entry => /\.ya?ml$/.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
      const path = `${dir}/${entry.name}`, bytes = this.read(path)!, value = this.yaml(path);
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
    if (!node) throw new ModuleReadError('capability_not_found');
    return node;
  }
  private docPath(id: string): string { const [, domain, name] = id.split('.'); return architectureModulePathFor(domain, name); }

  detail(id: string): ModuleDetailV1 {
    const node = this.capability(id);
    const invalid = this.invalidFlows.find(file => file.capability === null || file.capability === id);
    if (invalid) throw new ModuleReadError('model_invalid', invalid.path);
    const doc = this.read(this.docPath(id), true);
    const linked: LinkedModuleDoc[] = this.docs.filter(item => item.capability === id).map(({ path, kind, status }) => ({ path, kind, status }));
    const flows: ModelFlow[] = this.flows.map(({ value }) => {
      const identity = { id: value.id, capabilityId: value.capabilityId, name: value.name };
      return value.applicability === 'not-applicable'
        ? { ...identity, applicability: value.applicability, rationale: value.rationale }
        : { ...identity, applicability: value.applicability,
          participants: value.participants.map(({ id, nodeId }) => ({ id, nodeId })), steps: value.steps, outcomes: value.outcomes };
    });
    return moduleDetail(this.commit, node, this.nodes.map(file => file.value), this.relations.map(file => file.value),
      flows, section3FromMarkdown(doc?.toString('utf8') ?? null), linked, 'valid');
  }
  list(): ModuleIndexV1 {
    return { schema_version: 'repo-harness.architecture-modules.v1', commit: this.commit,
      modules: this.nodes.filter(file => file.value.kind === 'capability').map(({ value }) => {
        const section3 = section3FromMarkdown(this.read(this.docPath(value.id), true)?.toString('utf8') ?? null);
        const invalid = this.invalidFlows.some(file => file.capability === null || file.capability === value.id);
        return { id: value.id, domain: value.id.split('.')[1], name: value.name, status: value.status,
          components: this.nodes.filter(file => file.value.parent === value.id).length,
          state: { model_valid: invalid ? 'invalid' as const : 'valid' as const, generated_summary: 'unknown' as const, section3: section3 ? 'present' as const : 'pending' as const } };
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

  reviewPrompt(id: string, options: { shard?: number; base?: string; head?: string } = {}): ModuleReviewPromptV1 {
    if ((options.base === undefined) !== (options.head === undefined)) throw new ModuleReadError('diff_refs_required');
    const node = this.capability(id), detail = this.detail(id), docPath = this.docPath(id), doc = this.read(docPath, true);
    const prefixes = (node.source?.include ?? []).map(include => {
      const translated = archcontextIncludeToPrefix(include, { isExistingDirectory: path => this.entry(path)?.type === 'tree' });
      if (translated.status !== 'prefix') throw new ModuleReadError('source_include_invalid');
      this.safePath(translated.prefix); return translated.prefix;
    });
    const base = options.base === undefined ? null : this.resolveCommit(options.base);
    const head = options.head === undefined ? null : this.resolveCommit(options.head);
    const diff = base && head ? this.git(['diff', '--no-ext-diff', '--no-textconv', base, head, '--', ...prefixes]).toString('utf8') : null;
    const local = new Set(this.nodes.filter(file => file.value.id === id || file.value.parent === id).map(file => file.value.id));
    const relations = this.relations.filter(file => local.has(file.value.source) || local.has(file.value.target));
    const neighborhood = new Set([...local, ...relations.flatMap(file => [file.value.source, file.value.target])]);
    const model = [...this.nodes.filter(file => neighborhood.has(file.value.id)), ...relations,
      ...this.flows.filter(file => detail.flows.some(flow => flow.id === file.value.id))].sort((a, b) => a.path.localeCompare(b.path, 'en'));
    const linked = this.docs.filter(item => item.capability === id);
    const sources: PromptSource[] = [
      { path: MANIFEST, bytes: this.read(MANIFEST)!.length, sha256: sha256(this.read(MANIFEST)!), class: 'required' as const, disposition: 'included' as const },
      ...model.map(file => ({ path: file.path, bytes: file.bytes.length, sha256: sha256(file.bytes), class: file.path.includes('/flows/') ? 'optional' as const : 'required' as const, disposition: 'included' as const })),
      ...(doc ? [{ path: docPath, bytes: doc.length, sha256: sha256(doc), class: 'optional' as const, disposition: 'included' as const }] : []),
      ...linked.map(file => ({ path: file.path, bytes: file.bytes.length, sha256: sha256(file.bytes), class: 'optional' as const, disposition: 'included' as const })),
      ...(diff === null ? [] : [{ path: 'diff', bytes: Buffer.byteLength(diff), sha256: sha256(diff), class: 'required' as const, disposition: 'included' as const }]),
    ].sort((a, b) => a.path.localeCompare(b.path, 'en'));
    const sourceSections: Record<string, string[]> = { [MANIFEST]: ['identity'], [docPath]: ['section3'], diff: ['diff'] };
    for (const file of model) sourceSections[file.path] = file.path.includes('/flows/') ? ['flows'] : file.path.includes('/relations/') ? ['relations'] : ['model', 'relations'];
    for (const file of linked) sourceSections[file.path] = ['linked_docs'];
    const scope = [...new Set([...prefixes, MANIFEST, ...model.map(file => file.path), docPath, ...linked.map(file => file.path)])].sort();
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = this.dirty(scope);
      const packet = buildModuleReviewPrompt({ detail, package_version: PACKAGE_VERSION, repository_id: repoHarnessRepoIdFor(this.root), input_cap_bytes: this.budget,
        worktree_dirty_paths: before.paths, dirty_content_sha256: before.digest,
        model_sha256: sha256(canonicalize(model.map(file => ({ path: file.path, sha256: sha256(file.bytes) })))),
        doc_sha256: doc ? sha256(doc) : null, sources, source_sections: sourceSections, module_doc_path: docPath, base, head, diff }, options.shard);
      const after = this.dirty(scope);
      if (before.digest === after.digest) return packet;
    }
    throw new ModuleReadError('worktree_changed_during_read');
  }
}
