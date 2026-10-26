// Background docs collector (PRD G7). It runs only in the `operator serve`
// process on a timer. For each registered repository it owns one DocsReader:
// it starts and restarts the resident `git cat-file` process, reads the
// remote-tracking ref of the default branch, and builds and hashes the docs
// listing. A GET reads `read()` and, for a file, sends one object request to
// the reader this cache holds; it never starts or restarts a process.
//
// The default branch comes from the Dev Activity cache, and only when GitHub
// named it. The ref is `refs/remotes/<remote>/<branch>`, where <remote> is the
// one remote whose URL is that GitHub repository. The collector reads local
// refs only: it never fetches and never writes to the repository.

import { realpathSync } from 'node:fs';

import { decodeDocsTree, githubRemoteRepository, OPERATOR_DOCS_TREE_KIND, type DocsTreeV1, type DocsUnavailableReason } from '../../core/operator/docs';
import type { DevActivitySnapshotV2 } from '../../core/dev-activity/types';
import { REPOSITORY_SELECTING_GIT_ENV, spawnGit } from '../git/runner';
import { readRepoHarnessRegistryStrictSnapshot, type RepoHarnessRegisteredRepo } from '../repo-registry';
import { DocsReadError, DocsReader, validDocsRef } from './docs-reader';

export const DOCS_COLLECT_INTERVAL_MS = 60_000;
const REMOTE_TIMEOUT_MS = 5_000;
const REMOTE_STDOUT_LIMIT = 64 * 1024;

export type DocsRepositoryCache =
  | { readonly state: 'ready'; readonly tree: DocsTreeV1; readonly reader: DocsReader }
  | { readonly state: 'unavailable'; readonly reason: DocsUnavailableReason };

export interface DocsCollectorOptions {
  readonly env?: NodeJS.ProcessEnv;
  /** The Dev Activity cache: the only source of each repository's default branch. */
  readonly read_dev_activity: () => DevActivitySnapshotV2;
  readonly interval_ms?: number;
  /** Deadline of one object request to a resident process. */
  readonly timeout_ms?: number;
  readonly git_bin?: string;
  readonly now?: () => Date;
}

export interface DocsCollectorHandle {
  /** Cache read only; never starts work. */
  readonly read: (repositoryId: string) => DocsRepositoryCache;
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}

function gitEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env, GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' };
  for (const key of REPOSITORY_SELECTING_GIT_ENV) delete next[key];
  return next;
}

/** Remote name -> URL from the repository's own config. Null when git fails. */
function remoteUrls(root: string, env: NodeJS.ProcessEnv, gitBin: string | undefined): Promise<Map<string, string> | null> {
  return new Promise(settle => {
    // stderr is discarded: it can hold absolute paths.
    const child = spawnGit(['config', '--local', '--get-regexp', '^remote\\..*\\.url$'], {
      cwd: root, env: gitEnv(env), gitBin, stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), REMOTE_TIMEOUT_MS);
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > REMOTE_STDOUT_LIMIT) child.kill('SIGKILL');
    });
    child.on('error', () => { clearTimeout(timer); settle(null); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      // Exit 1 means no remote URL is configured.
      if (signal !== null || (code !== 0 && code !== 1) || stdout.length > REMOTE_STDOUT_LIMIT) { settle(null); return; }
      const urls = new Map<string, string>();
      for (const line of stdout.split('\n')) {
        const match = /^remote\.(.+)\.url (.+)$/u.exec(line);
        if (match) urls.set(match[1]!, match[2]!);
      }
      settle(urls);
    });
  });
}

function readFailure(error: unknown): DocsUnavailableReason {
  if (error instanceof DocsReadError) {
    if (error.code === 'branch_missing') return 'branch_missing';
    if (error.code === 'too_large') return 'docs_too_large';
  }
  return 'docs_reader_unavailable';
}

/** Collect at start, then every interval after the previous cycle settles. Cycles never overlap. */
export function startDocsCollector(options: DocsCollectorOptions): DocsCollectorHandle {
  const env = options.env ?? process.env;
  const readers = new Map<string, DocsReader>();
  let states = new Map<string, DocsRepositoryCache>();
  let registryFailed = false;
  let started = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;

  const retire = (id: string) => { readers.get(id)?.close(); readers.delete(id); };

  const collectRepository = async (repo: RepoHarnessRegisteredRepo, activity: DevActivitySnapshotV2): Promise<DocsRepositoryCache> => {
    const unavailable = (reason: DocsUnavailableReason): DocsRepositoryCache => { retire(repo.id); return { state: 'unavailable', reason }; };
    // Dev Activity has not finished its first cycle: the branch is not known yet.
    if (activity.collected_at === null) return unavailable('docs_pending');
    const source = activity.repositories.find(entry => entry.repository_id === repo.id);
    // Only GitHub names the default branch; Dev Activity's local fallback is not used.
    if (!source?.github || !source.default_branch) return unavailable('default_branch_unknown');
    const urls = await remoteUrls(repo.path, env, options.git_bin);
    if (urls === null) return unavailable('docs_reader_unavailable');
    const github = source.github.toLowerCase();
    const remotes = [...urls].filter(([, url]) => githubRemoteRepository(url) === github).map(([name]) => name);
    if (remotes.length === 0) return unavailable('github_remote_missing');
    if (remotes.length > 1) return unavailable('github_remote_ambiguous');
    const ref = `refs/remotes/${remotes[0]}/${source.default_branch}`;
    if (!validDocsRef(ref)) return unavailable('branch_missing');
    let reader = readers.get(repo.id);
    if (reader && (reader.ref !== ref || reader.root !== safeRealpath(repo.path))) { retire(repo.id); reader = undefined; }
    if (!reader) {
      try { reader = new DocsReader({ root: repo.path, ref, env, gitBin: options.git_bin, timeoutMs: options.timeout_ms }); }
      catch { return unavailable('docs_reader_unavailable'); }
      readers.set(repo.id, reader);
    }
    reader.start();
    try {
      const tree = await reader.refresh();
      const collected_at = (options.now ?? (() => new Date()))().toISOString();
      return { state: 'ready', reader, tree: decodeDocsTree({ protocol: 1, kind: OPERATOR_DOCS_TREE_KIND, repository_id: repo.id, ref, commit: tree.commit, collected_at, files: tree.files }) };
    } catch (error) {
      // The reader stays: a dead process is restarted by the next cycle.
      return { state: 'unavailable', reason: readFailure(error) };
    }
  };

  const cycle = (): Promise<void> => {
    inflight = (async () => {
      let repos: readonly RepoHarnessRegisteredRepo[];
      try { repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos; }
      catch { registryFailed = true; return; }
      const activity = options.read_dev_activity();
      const next = new Map<string, DocsRepositoryCache>();
      await Promise.all(repos.map(async repo => { next.set(repo.id, await collectRepository(repo, activity)); }));
      for (const id of [...readers.keys()]) if (closed || !next.has(id)) retire(id);
      if (closed) return;
      states = next;
      registryFailed = false;
      started = true;
    })().catch(() => { /* every repository failure is a state; keep the last cache */ }).finally(() => {
      inflight = null;
      if (closed) return;
      timer = setTimeout(() => { void cycle(); }, options.interval_ms ?? DOCS_COLLECT_INTERVAL_MS);
      timer.unref?.();
    });
    return inflight;
  };
  void cycle();

  return Object.freeze({
    read: (repositoryId: string): DocsRepositoryCache => {
      if (registryFailed) return { state: 'unavailable', reason: 'registry_unavailable' };
      if (!started) return { state: 'unavailable', reason: 'docs_pending' };
      return states.get(repositoryId) ?? { state: 'unavailable', reason: 'repository_not_found' };
    },
    settled: () => inflight ?? Promise.resolve(),
    close: async () => {
      closed = true;
      clearTimeout(timer);
      // Closing the readers fails their pending requests, so a long first listing does not hold shutdown.
      for (const id of [...readers.keys()]) retire(id);
      await inflight;
    },
  });
}

function safeRealpath(path: string): string | null {
  try { return realpathSync(path); } catch { return null; }
}
