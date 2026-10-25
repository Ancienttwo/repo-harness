import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARCHCTX_REQUIRED_VERSION } from '../../core/architecture/projection';
import { gitExecFileSync } from '../git/runner';
import type { ArchcontextResolveCache, ArchctxResolveResult } from './archcontext-owners';

const MODEL_NODES_DIR = '.archcontext/model/nodes';
const MANIFEST_PATH = '.archcontext/manifest.yaml';
const CACHE_FILE = 'repo-harness/archctx-resolve-cache.json';

interface CacheFile { key: string; answers: Record<string, ArchctxResolveResult> }

/** The model inputs that archctx resolve reads; any byte change moves the digest. */
function modelDigest(repoRoot: string): string {
  const hash = createHash('sha256');
  const files = [MANIFEST_PATH, ...readdirSync(join(repoRoot, MODEL_NODES_DIR)).sort().map((name) => `${MODEL_NODES_DIR}/${name}`)];
  for (const file of files) hash.update(`${file}\0`).update(readFileSync(join(repoRoot, file))).update('\0');
  return hash.digest('hex');
}

function readCache(path: string, key: string): Record<string, ArchctxResolveResult> {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as CacheFile;
    return parsed.key === key && parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : {};
  } catch {
    return {};
  }
}

/**
 * Each hook event is its own process, so the answers persist in the
 * worktree's private git directory, never in the worktree itself. They are
 * valid only for one archctx version, HEAD and model digest; a key change
 * starts a new set. The binding is read on first use, so a batch that needs
 * no archctx query pays nothing. A missing HEAD or model disables the cache.
 */
export function archcontextResolveFileCache(repoRoot: string): ArchcontextResolveCache {
  let bound: { key: string; path: string } | null | undefined;
  const binding = () => {
    if (bound !== undefined) return bound;
    try {
      const [gitDir, head] = gitExecFileSync(['-C', repoRoot, 'rev-parse', '--absolute-git-dir', 'HEAD'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000,
      }).trim().split('\n');
      bound = gitDir && head ? {
        key: createHash('sha256').update(JSON.stringify([ARCHCTX_REQUIRED_VERSION, realpathSync(repoRoot), head, modelDigest(repoRoot)])).digest('hex'),
        path: join(gitDir, CACHE_FILE),
      } : null;
    } catch {
      bound = null;
    }
    return bound;
  };
  return {
    lookup(queries) {
      const cache = queries.length > 0 ? binding() : null;
      if (!cache) return new Map();
      const answers = readCache(cache.path, cache.key);
      return new Map(queries.filter((query) => Object.hasOwn(answers, query)).map((query) => [query, answers[query]!]));
    },
    store(answers) {
      const cache = binding();
      if (!cache) return;
      const { key, path } = cache;
      try {
        const merged: CacheFile = { key, answers: { ...readCache(path, key), ...Object.fromEntries(answers) } };
        mkdirSync(join(path, '..'), { recursive: true });
        const temporary = `${path}.${process.pid}.tmp`;
        writeFileSync(temporary, `${JSON.stringify(merged)}\n`, { mode: 0o600 });
        renameSync(temporary, path);
      } catch {
        // The cache only saves work; after a failed write the next event asks archctx again.
      }
    },
  };
}
