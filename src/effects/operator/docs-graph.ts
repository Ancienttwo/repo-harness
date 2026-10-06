import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { devNull } from 'node:os';
import { performance } from 'node:perf_hooks';
import {
  buildDocsGraph, DOCS_GRAPH_MAX_NODES, docsDocumentKind, docsStaleThresholds, docsTimestamp, isArchivedDoc, isDocsCapabilityId,
  type DocsCapability, type DocsCommit, type DocsDocument, type DocsGraphScope, type DocsGraphV1, type DocsStaleThresholds,
} from '../../core/docs/docs-graph';

export type DocsGraphReadFailure = 'unavailable' | 'invalid_request' | 'too_large' | 'timeout' | 'snapshot_changed' | 'invalid_capability';
export class DocsGraphReadError extends Error {
  constructor(readonly code: DocsGraphReadFailure) { super(code); }
}
export interface DocsGraphReadInput {
  /** The caller resolves and authorizes this repository root. Never accept a URL path here. */
  repositoryRoot: string;
  scope?: DocsGraphScope;
  now?: string;
  thresholds?: Partial<DocsStaleThresholds>;
  max_nodes?: number;
}
export interface DocsGraphReadOptions { deadline_ms?: number }
interface TreeEntry { mode: string; oid: string; path: string }
const ROOTS = ['plans', 'tasks/contracts', 'tasks/reviews', 'tasks/notes', 'tasks/archive', 'docs/spec.md', 'docs/specs', '.archcontext/model/nodes'];
const MAX_BLOB_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const MAX_FILES = 5000;
const CAPABILITY_PATH = /^\.archcontext\/model\/nodes\/capability\.[a-zA-Z0-9._-]+\.ya?ml$/u;
const fail = (code: DocsGraphReadFailure): never => { throw new DocsGraphReadError(code); };
const regular = (entry: TreeEntry): boolean => entry.mode === '100644' || entry.mode === '100755';
const oid = (value: string): boolean => /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value);

/** Commit-local history only. No disk cache, global file collector, network probe, or working-tree content read. */
export function createDocsGraphReader() {
  const historyCache = new Map<string, ReadonlyMap<string, DocsCommit>>();
  return function readDocsGraph(input: DocsGraphReadInput, options: DocsGraphReadOptions = {}): DocsGraphV1 {
    try {
      const now = input.now ?? new Date().toISOString();
      if (!docsTimestamp(now) || input.scope !== undefined && input.scope !== 'active' && input.scope !== 'all'
        || input.max_nodes !== undefined && (!Number.isSafeInteger(input.max_nodes) || input.max_nodes < 1 || input.max_nodes > DOCS_GRAPH_MAX_NODES)) return fail('invalid_request');
      try { docsStaleThresholds(input.thresholds); } catch { return fail('invalid_request'); }
      const root = realpathSync(input.repositoryRoot);
      const deadline = options.deadline_ms ?? 15_000;
      if (!Number.isFinite(deadline) || deadline <= 0 || deadline > 60_000) return fail('invalid_request');
      const started = performance.now();
      let totalBytes = 0;
      // Caller and process Git overrides must not redirect reads to another repository.
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
      Object.assign(env, { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull });
      const git = (args: string[], limit = MAX_METADATA_BYTES): string => {
        const remaining = deadline - (performance.now() - started);
        if (remaining <= 0) return fail('timeout');
        try {
          const bytes = execFileSync('git', ['--no-pager', '--no-optional-locks', '--no-replace-objects', '-c', 'core.fsmonitor=false', ...args], {
            cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: Math.max(1, Math.ceil(remaining)),
            maxBuffer: Math.min(limit, MAX_TOTAL_BYTES - totalBytes),
          });
          totalBytes += bytes.length;
          if (totalBytes >= MAX_TOTAL_BYTES) return fail('too_large');
          if (performance.now() - started > deadline) return fail('timeout');
          return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch (error) {
          if (error instanceof DocsGraphReadError) throw error;
          const code = (error as NodeJS.ErrnoException).code;
          return fail(code === 'ETIMEDOUT' ? 'timeout' : code === 'ENOBUFS' ? 'too_large' : 'unavailable');
        }
      };
      if (realpathSync(git(['rev-parse', '--show-toplevel']).trim()) !== root) return fail('invalid_request');
      const head = (): string => {
        const commit = git(['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}']).trim();
        return oid(commit) ? commit : fail('unavailable');
      };
      const commit = head();
      const rawTree = git(['ls-tree', '-rz', '--full-tree', commit, '--', ...ROOTS]);
      if (rawTree && !rawTree.endsWith('\0')) return fail('unavailable');
      const entries: TreeEntry[] = [];
      for (const record of rawTree.split('\0').filter(Boolean)) {
        const match = /^(\d{6}) (blob|commit) ([0-9a-f]{40}|[0-9a-f]{64})\t([\s\S]+)$/u.exec(record);
        if (!match) return fail('unavailable');
        const path = match[4]!;
        if (docsDocumentKind(path) || CAPABILITY_PATH.test(path)) entries.push({ mode: match[1]!, oid: match[3]!, path });
      }
      entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      if (entries.length > MAX_FILES) return fail('too_large');
      const cacheKey = JSON.stringify([root, commit]);
      let history = historyCache.get(cacheKey);
      if (!history) {
        // NUL records preserve exact paths. The marker separates commit headers from path records.
        const log = git(['log', '--name-only', '-z', '--format=%x00COMMIT%x00%H%x00%cI', commit, '--', ...ROOTS]);
        const parsed = new Map<string, DocsCommit>();
        const tokens = log.split('\0');
        let current: DocsCommit | null = null;
        for (let index = 0; index < tokens.length; index++) {
          const token = tokens[index]!;
          if (token === 'COMMIT') {
            const hash = tokens[++index], time = tokens[++index];
            const timestamp = docsTimestamp(time ?? null);
            if (!hash || !oid(hash) || !timestamp) return fail('unavailable');
            current = { commit: hash, time: timestamp };
          } else {
            // Git puts one LF between a commit header and its first pathname.
            const path = token.startsWith('\n') ? token.slice(1) : token;
            if (current && (docsDocumentKind(path) || CAPABILITY_PATH.test(path)) && !parsed.has(path)) parsed.set(path, current);
          }
        }
        history = parsed;
        if (historyCache.size >= 4) historyCache.delete(historyCache.keys().next().value!);
        historyCache.set(cacheKey, history);
      }
      const documents: DocsDocument[] = [], capabilities: DocsCapability[] = [];
      for (const entry of entries) {
        const lastCommit = history.get(entry.path);
        const source = { path: entry.path, blob_oid: entry.oid, last_commit: lastCommit ? { ...lastCommit } : null };
        if (CAPABILITY_PATH.test(entry.path)) {
          if (!regular(entry)) return fail('invalid_capability');
          let value: unknown;
          try { value = Bun.YAML.parse(git(['cat-file', 'blob', entry.oid], MAX_BLOB_BYTES)); }
          catch (error) { if (error instanceof DocsGraphReadError) throw error; return fail('invalid_capability'); }
          if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('invalid_capability');
          const node = value as Record<string, unknown>;
          if (node.schemaVersion !== 'archcontext.node/v2' || node.kind !== 'capability' || typeof node.id !== 'string' || !isDocsCapabilityId(node.id)) return fail('invalid_capability');
          capabilities.push({ ...source, id: node.id });
        } else {
          // Hidden archives still contribute existence and counts. Their bodies are not loaded.
          const hidden = input.scope !== 'all' && isArchivedDoc(entry.path);
          documents.push({ ...source, content: regular(entry) ? hidden ? '' : git(['cat-file', 'blob', entry.oid], MAX_BLOB_BYTES) : null,
            ...regular(entry) ? {} : { error: 'unsupported_file_mode' as const } });
        }
      }
      if (new Set(capabilities.map(capability => capability.id)).size !== capabilities.length) return fail('invalid_capability');
      const graph = buildDocsGraph({ ...input, commit, now, documents, capabilities });
      if (head() !== commit) return fail('snapshot_changed');
      return graph;
    } catch (error) {
      if (error instanceof DocsGraphReadError) throw error;
      return fail('unavailable');
    }
  };
}
export const readDocsGraph = createDocsGraphReader();
