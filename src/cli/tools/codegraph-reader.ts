import { spawnSync } from 'child_process';
import { sha256Hex } from '../../core/evidence/sha256';
import { existsSync, realpathSync } from 'fs';
import { delimiter, isAbsolute, join, relative, resolve } from 'path';

export interface CodeGraphIndexedFile {
  path: string;
  language?: string;
  nodeCount?: number;
  size?: number;
}

export interface CodeGraphRepoSnapshot {
  available: boolean;
  integrated: boolean;
  source: 'codegraph-cli' | 'unavailable' | 'test-double';
  indexRevision: string | 0;
  files: CodeGraphIndexedFile[];
  latencyMs: number;
  error?: {
    code: 'INDEX_UNAVAILABLE' | 'INTERNAL_ADAPTER_ERROR';
    message: string;
    retryable: boolean;
  };
}

export interface CodeGraphRefreshResult {
  available: boolean;
  refreshed: boolean;
  integrated: boolean;
  source: CodeGraphRepoSnapshot['source'];
  indexRevision: string | 0;
  latencyMs: number;
  strategy: 'repo-sync' | 'path-sync' | 'unsupported';
  requestedPaths: string[];
  pathRefreshSupported: boolean;
  files: number;
  error?: CodeGraphRepoSnapshot['error'];
}

export interface CodeGraphTextSearchMatch {
  path: string;
  line?: number;
  column?: number;
  snippet?: string;
  score?: number;
}

export interface CodeGraphTextSearchResult {
  available: boolean;
  matches: CodeGraphTextSearchMatch[];
  latencyMs: number;
  error?: CodeGraphRepoSnapshot['error'];
}

export interface GeneralRepoCodeGraphAdapter {
  discoverRepo(repoRoot: string): CodeGraphRepoSnapshot;
  refreshRepo?(repoRoot: string, opts?: { paths?: string[] }): CodeGraphRefreshResult;
  searchText?(repoRoot: string, query: string, opts: { mode: 'literal' | 'regex'; paths: string[]; maxResults: number }): CodeGraphTextSearchResult;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_STDOUT_BYTES = 10 * 1024 * 1024;

function unavailable(message: string, latencyMs = 0, retryable = true): CodeGraphRepoSnapshot {
  return {
    available: false,
    integrated: false,
    source: 'unavailable',
    indexRevision: 0,
    files: [],
    latencyMs,
    error: { code: 'INDEX_UNAVAILABLE', message, retryable },
  };
}

function isPathInside(root: string, candidate: string): boolean {
  const relationship = relative(root, candidate);
  return relationship === '' || (!isAbsolute(relationship) && relationship !== '..' && !relationship.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
}

function canonicalIfPresent(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

// The spawned path is the lexical one, so a symlink inside the repo is repo-controlled even when
// its target is outside. Check both the lexical and the canonical form against both root forms.
function isInsideRepo(repoRoot: string, candidate: string): boolean {
  const roots = [resolve(repoRoot), canonicalIfPresent(repoRoot)];
  const candidates = [resolve(candidate), canonicalIfPresent(candidate)];
  return roots.some((root) => candidates.some((path) => isPathInside(root, path)));
}

// The inspected repo is untrusted input: never run a CodeGraph binary found inside it.
function codegraphExecutionEnv(repoRoot: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const safePath = (env.PATH ?? '')
    .split(delimiter)
    .filter((entry) => entry && isAbsolute(entry) && !isInsideRepo(repoRoot, entry))
    .join(delimiter);
  return { ...env, PATH: safePath };
}

function codegraphBin(repoRoot: string, env: NodeJS.ProcessEnv): string {
  const explicit = env.REPO_HARNESS_CODEGRAPH_BIN;
  if (!explicit) return 'codegraph';
  // A bare name resolves through the filtered PATH. A path with a separator is resolved against
  // repoRoot, because the child runs with cwd=repoRoot and would reach a repo-local binary.
  if (!/[\\/]/.test(explicit)) return explicit;
  const resolved = resolve(repoRoot, explicit);
  return isInsideRepo(repoRoot, resolved) ? 'codegraph' : resolved;
}

function normalizeIndexedFile(value: unknown): CodeGraphIndexedFile | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const path = typeof raw.path === 'string' ? raw.path : '';
  if (!path) return null;
  return {
    path,
    language: typeof raw.language === 'string' ? raw.language : undefined,
    nodeCount: typeof raw.nodeCount === 'number' ? raw.nodeCount : undefined,
    size: typeof raw.size === 'number' ? raw.size : undefined,
  };
}

function revisionFor(files: CodeGraphIndexedFile[]): string {
  const stable = files
    .map((file) => ({
      path: file.path,
      language: file.language ?? '',
      nodeCount: file.nodeCount ?? 0,
      size: file.size ?? 0,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return `index_${sha256Hex(JSON.stringify(stable)).slice(0, 16)}`;
}

function discoverCodeGraphRepo(repoRoot: string, env: NodeJS.ProcessEnv, timeoutMs: number): CodeGraphRepoSnapshot {
  const start = Date.now();
  if (!existsSync(join(repoRoot, '.codegraph'))) {
    return unavailable('CodeGraph index is not initialized for this repo', 0, false);
  }

  const executionEnv = codegraphExecutionEnv(repoRoot, env);
  const bin = codegraphBin(repoRoot, executionEnv);
  const result = spawnSync(bin, ['files', '--path', repoRoot, '--format', 'flat', '--json'], {
    cwd: repoRoot,
    env: executionEnv,
    encoding: 'utf-8',
    timeout: timeoutMs,
    maxBuffer: MAX_STDOUT_BYTES,
  });
  const latencyMs = Date.now() - start;

  if (result.error) {
    const code = result.error.message.includes('ETIMEDOUT') ? 'INDEX_UNAVAILABLE' : 'INTERNAL_ADAPTER_ERROR';
    return {
      available: false,
      integrated: false,
      source: 'unavailable',
      indexRevision: 0,
      files: [],
      latencyMs,
      error: { code, message: result.error.message, retryable: code === 'INDEX_UNAVAILABLE' },
    };
  }
  if (result.status !== 0) {
    return {
      available: false,
      integrated: false,
      source: 'unavailable',
      indexRevision: 0,
      files: [],
      latencyMs,
      error: {
        code: 'INDEX_UNAVAILABLE',
        message: (result.stderr || result.stdout || `codegraph exited with ${result.status}`).trim(),
        retryable: true,
      },
    };
  }

  try {
    const parsed = JSON.parse(result.stdout);
    const files = Array.isArray(parsed)
      ? parsed.map(normalizeIndexedFile).filter((file): file is CodeGraphIndexedFile => file !== null)
      : [];
    return {
      available: true,
      integrated: true,
      source: 'codegraph-cli',
      indexRevision: revisionFor(files),
      files,
      latencyMs,
    };
  } catch (error) {
    return {
      available: false,
      integrated: false,
      source: 'unavailable',
      indexRevision: 0,
      files: [],
      latencyMs,
      error: {
        code: 'INTERNAL_ADAPTER_ERROR',
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
      },
    };
  }
}

/**
 * The adapter of an MCP server without the architecture plugin in the
 * recorded selection: it runs no CodeGraph binary, and each read reports why.
 */
export function createCodeGraphNotSelectedAdapter(message: string): GeneralRepoCodeGraphAdapter {
  return {
    discoverRepo: () => unavailable(message, 0, false),
    refreshRepo: (_repoRoot, opts) => ({
      available: false,
      refreshed: false,
      integrated: false,
      source: 'unavailable',
      indexRevision: 0,
      latencyMs: 0,
      strategy: 'unsupported',
      requestedPaths: opts?.paths ?? [],
      pathRefreshSupported: false,
      files: 0,
      error: { code: 'INDEX_UNAVAILABLE', message, retryable: false },
    }),
  };
}

export function createCodeGraphCliAdapter(opts: {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
} = {}): GeneralRepoCodeGraphAdapter {
  const env = opts.env ?? process.env;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    discoverRepo(repoRoot: string): CodeGraphRepoSnapshot {
      return discoverCodeGraphRepo(repoRoot, env, timeoutMs);
    },
    refreshRepo(repoRoot: string, opts: { paths?: string[] } = {}): CodeGraphRefreshResult {
      const start = Date.now();
      if (!existsSync(join(repoRoot, '.codegraph'))) {
        const snapshot = unavailable('CodeGraph index is not initialized for this repo', 0, false);
        return {
          available: false,
          refreshed: false,
          integrated: false,
          source: snapshot.source,
          indexRevision: snapshot.indexRevision,
          latencyMs: snapshot.latencyMs,
          strategy: 'unsupported',
          requestedPaths: opts.paths ?? [],
          pathRefreshSupported: false,
          files: 0,
          error: snapshot.error,
        };
      }

      const executionEnv = codegraphExecutionEnv(repoRoot, env);
      const bin = codegraphBin(repoRoot, executionEnv);
      const result = spawnSync(bin, ['sync', repoRoot], {
        cwd: repoRoot,
        env: executionEnv,
        encoding: 'utf-8',
        timeout: Math.max(timeoutMs, 30_000),
        maxBuffer: MAX_STDOUT_BYTES,
      });
      const syncLatencyMs = Date.now() - start;

      if (result.error) {
        const code = result.error.message.includes('ETIMEDOUT') ? 'INDEX_UNAVAILABLE' : 'INTERNAL_ADAPTER_ERROR';
        return {
          available: false,
          refreshed: false,
          integrated: false,
          source: 'unavailable',
          indexRevision: 0,
          latencyMs: syncLatencyMs,
          strategy: 'repo-sync',
          requestedPaths: opts.paths ?? [],
          pathRefreshSupported: false,
          files: 0,
          error: { code, message: result.error.message, retryable: code === 'INDEX_UNAVAILABLE' },
        };
      }
      if (result.status !== 0) {
        return {
          available: false,
          refreshed: false,
          integrated: false,
          source: 'unavailable',
          indexRevision: 0,
          latencyMs: syncLatencyMs,
          strategy: 'repo-sync',
          requestedPaths: opts.paths ?? [],
          pathRefreshSupported: false,
          files: 0,
          error: {
            code: 'INDEX_UNAVAILABLE',
            message: (result.stderr || result.stdout || `codegraph exited with ${result.status}`).trim(),
            retryable: true,
          },
        };
      }

      const snapshot = discoverCodeGraphRepo(repoRoot, env, timeoutMs);
      return {
        available: snapshot.available,
        refreshed: snapshot.available,
        integrated: snapshot.integrated,
        source: snapshot.source,
        indexRevision: snapshot.indexRevision,
        latencyMs: syncLatencyMs + snapshot.latencyMs,
        strategy: 'repo-sync',
        requestedPaths: opts.paths ?? [],
        pathRefreshSupported: false,
        files: snapshot.files.length,
        error: snapshot.error,
      };
    },
  };
}
