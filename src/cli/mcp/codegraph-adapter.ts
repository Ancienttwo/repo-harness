import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';

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
  searchText?(repoRoot: string, query: string, opts: { mode: 'literal' | 'regex'; paths: string[]; maxResults: number }): CodeGraphTextSearchResult;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_STDOUT_BYTES = 10 * 1024 * 1024;

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

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

function codegraphBin(repoRoot: string, env: NodeJS.ProcessEnv): string {
  if (env.REPO_HARNESS_CODEGRAPH_BIN) return env.REPO_HARNESS_CODEGRAPH_BIN;
  const repoLocal = join(repoRoot, 'node_modules', '.bin', 'codegraph');
  if (existsSync(repoLocal)) return repoLocal;
  const cwdLocal = join(process.cwd(), 'node_modules', '.bin', 'codegraph');
  if (existsSync(cwdLocal)) return cwdLocal;
  return 'codegraph';
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
  return `index_${sha256(JSON.stringify(stable)).slice(0, 16)}`;
}

export function createCodeGraphCliAdapter(opts: {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
} = {}): GeneralRepoCodeGraphAdapter {
  const env = opts.env ?? process.env;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    discoverRepo(repoRoot: string): CodeGraphRepoSnapshot {
      const start = Date.now();
      if (!existsSync(join(repoRoot, '.codegraph'))) {
        return unavailable('CodeGraph index is not initialized for this repo', 0, false);
      }

      const bin = codegraphBin(repoRoot, env);
      const result = spawnSync(bin, ['files', '--path', repoRoot, '--format', 'flat', '--json'], {
        cwd: repoRoot,
        env,
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
    },
  };
}
