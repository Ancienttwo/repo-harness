// Background Dev Activity collector (plan §3.1, invariant N1). It runs only in
// the `operator serve` process on a timer, never on a request path. Every
// subprocess argv is a code constant (the PR search date comes from the
// collector clock); the only other variable inputs are the working
// directory (a validated registry root, or a worktree path that Git itself
// reported) and the environment. stderr is discarded and stdout is parsed into
// typed facts, so no subprocess free text reaches the snapshot.

import { spawn } from 'node:child_process';
import { spawnGit } from '../git/runner';
import { lstatSync, realpathSync } from 'node:fs';
import { basename, isAbsolute, sep } from 'node:path';

import { spawnRegisteredProcessGroup } from '../process-group-registry';
import { terminateProcessGroup } from '../process-group-termination';

import { DEV_ACTIVITY_SHIPPED_WINDOW_MS, DEV_ACTIVITY_TRUNCATED_REASON_PREFIX, type DevActivityPrFiles, type DevActivitySnapshotV2, type DevActivitySourceHealth } from '../../core/dev-activity/types';
import { isPublicRepoPath } from '../../core/operator/public-text';
import { unavailableDevActivitySnapshot } from '../../core/dev-activity/decode';
import {
  projectDevActivity,
  reviewStateOf,
  runtimeSourceHealth,
  summarizeCiRollup,
  type DevActivityRawPullRequest,
  type DevActivityRawRepository,
  type DevActivityRawWorktree,
} from '../../core/dev-activity/projection';
import type { RuntimeOverlay } from '../../core/operator/runtime-status';
import { parseWorktreeTopology } from '../git/worktree-topology';
import {
  readRepoHarnessRegistryStrictSnapshot,
  type RepoHarnessRegisteredRepo,
} from '../repo-registry';

export const DEV_ACTIVITY_INTERVAL_MS = 60_000;
export const DEV_ACTIVITY_SUBPROCESS_TIMEOUT_MS = 15_000;
export const DEV_ACTIVITY_REPOSITORY_CONCURRENCY = 4;
const DEV_ACTIVITY_STDOUT_LIMIT = 8 * 1024 * 1024;
const DEV_ACTIVITY_TERMINATION_GRACE_MS = 1000;

export const DEV_ACTIVITY_GIT_WORKTREE_LIST_ARGV = Object.freeze(['--no-optional-locks', 'worktree', 'list', '--porcelain'] as const);
export const DEV_ACTIVITY_GIT_STATUS_ARGV = Object.freeze(['--no-optional-locks', 'status', '--porcelain=v2', '--branch'] as const);
export const DEV_ACTIVITY_GIT_REMOTE_ARGV = Object.freeze(['--no-optional-locks', 'remote', '-v'] as const);
export const DEV_ACTIVITY_GIT_ORIGIN_HEAD_ARGV = Object.freeze(['--no-optional-locks', 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'] as const);
export const DEV_ACTIVITY_GH_REPO_VIEW_ARGV = Object.freeze(['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef'] as const);
const DEV_ACTIVITY_GH_PR_BASE_FIELDS = 'number,title,state,isDraft,headRefName,baseRefName,url,createdAt,updatedAt,mergedAt,closedAt,mergeStateStatus,reviewDecision';
export const DEV_ACTIVITY_GH_OPEN_PR_FIELDS = `${DEV_ACTIVITY_GH_PR_BASE_FIELDS},statusCheckRollup,headRefOid,changedFiles,files`;
export const DEV_ACTIVITY_GH_CLOSED_PR_FIELDS = DEV_ACTIVITY_GH_PR_BASE_FIELDS;
/**
 * PR authority rule: only PRs authored by the authenticated gh user
 * (`--author @me`) are collected, so third-party PRs in upstream clones never
 * become cards. Local worktree branches are always items, with or without a PR.
 *
 * Fetch only what the board and the architecture map's PR impact display. Open
 * PRs carry CI (statusCheckRollup), the head commit and the changed files;
 * merged and closed-unmerged PRs are bounded to the shipped window by a GitHub
 * search date and carry no CI. The day-granular date is a superset bound; the
 * projection applies the exact window.
 *
 * Each category (open, merged, closed) is one query of at most
 * DEV_ACTIVITY_GH_PR_LIMIT rows; one extra row is requested to detect
 * truncation. A merged or closed window query that is truncated is replaced by
 * one query per UTC day, so a busy week still fits. A category that is still
 * truncated (open, or one day) is dropped whole, because a partial PR set
 * misplaces cards, and it marks the GitHub source unavailable with a reason
 * that names the category. The other categories stay in the snapshot.
 * The only variable argv element is the window date, computed from the
 * collector clock.
 */
/** Rows each PR query may return. One extra row is requested to detect truncation. */
export const DEV_ACTIVITY_GH_PR_LIMIT = 200;

export type DevActivityPrCategory = 'open' | 'merged' | 'closed';

const prListArgv = (state: DevActivityPrCategory, search: string | null, fields: string): readonly string[] =>
  Object.freeze(['pr', 'list', '--state', state, '--author', '@me', '--limit', String(DEV_ACTIVITY_GH_PR_LIMIT + 1),
    ...(search === null ? [] : ['--search', search]), '--json', fields]);

// `--state closed` alone also matches merged PRs; `is:unmerged` keeps the closed query to closed-unmerged.
const closedOrMergedSearch = (category: 'merged' | 'closed', date: string): string =>
  category === 'merged' ? `merged:${date}` : `closed:${date} is:unmerged`;

export function devActivityGhPrListArgv(nowMs: number): readonly (readonly string[])[] {
  const since = new Date(nowMs - DEV_ACTIVITY_SHIPPED_WINDOW_MS).toISOString().slice(0, 10);
  return Object.freeze([
    prListArgv('open', null, DEV_ACTIVITY_GH_OPEN_PR_FIELDS),
    prListArgv('merged', closedOrMergedSearch('merged', `>=${since}`), DEV_ACTIVITY_GH_CLOSED_PR_FIELDS),
    prListArgv('closed', closedOrMergedSearch('closed', `>=${since}`), DEV_ACTIVITY_GH_CLOSED_PR_FIELDS),
  ]);
}

/** One query per UTC day from the window start day through today, for a truncated window query. */
export function devActivityGhPrDayArgvs(category: 'merged' | 'closed', nowMs: number): readonly (readonly string[])[] {
  const argvs: (readonly string[])[] = [];
  const start = Date.parse(new Date(nowMs - DEV_ACTIVITY_SHIPPED_WINDOW_MS).toISOString().slice(0, 10));
  for (let day = start; day <= nowMs; day += 24 * 60 * 60 * 1000) {
    argvs.push(prListArgv(category, closedOrMergedSearch(category, new Date(day).toISOString().slice(0, 10)), DEV_ACTIVITY_GH_CLOSED_PR_FIELDS));
  }
  return Object.freeze(argvs);
}

export type DevActivityProcessFailure = 'timeout' | 'not_found' | 'failed' | 'aborted';
export type DevActivityProcessResult = { readonly ok: true; readonly stdout: string } | { readonly ok: false; readonly code: DevActivityProcessFailure };
export type DevActivityProcessRunner = (
  command: 'git' | 'gh',
  argv: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly timeout_ms: number; readonly signal: AbortSignal },
) => Promise<DevActivityProcessResult>;

/**
 * Spawn with no shell, no stdin and no stderr capture. On POSIX the child leads
 * its own registered process group; a deadline, abort or oversized stdout
 * terminates that group (Windows: the `taskkill /T` tree) before settling.
 */
export const runDevActivityProcess: DevActivityProcessRunner = (command, argv, options) => new Promise((settle) => {
  if (options.signal.aborted) { settle({ ok: false, code: 'aborted' }); return; }
  let child: ReturnType<typeof spawn>;
  try {
    const spawnOptions = {
      cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'], detached: process.platform !== 'win32', windowsHide: true,
    };
    child = spawnRegisteredProcessGroup('dev-activity-collector', () => (
      command === 'git' ? spawnGit(argv, spawnOptions) : spawn(command, [...argv], spawnOptions)
    ));
  } catch {
    settle({ ok: false, code: 'failed' });
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let settled = false;
  let failure: DevActivityProcessResult | null = null;
  const finish = (result: DevActivityProcessResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    options.signal.removeEventListener('abort', onAbort);
    if (!result.ok) child.stdout!.destroy();
    settle(result);
  };
  const terminate = (code: DevActivityProcessFailure) => {
    if (settled || failure !== null) return;
    failure = { ok: false, code };
    const result = failure;
    clearTimeout(timer);
    if (child.pid === undefined) { finish(result); return; }
    // Reap the whole group before the next collection cycle. A grandchild
    // must not outlive the deadline or hold its inherited stdout open.
    void terminateProcessGroup(child.pid, DEV_ACTIVITY_TERMINATION_GRACE_MS)
      .catch(() => { /* already exited */ })
      .then(() => finish(result));
  };
  const onAbort = () => terminate('aborted');
  const timer = setTimeout(() => terminate('timeout'), options.timeout_ms);
  options.signal.addEventListener('abort', onAbort, { once: true });
  child.stdout!.on('data', (chunk: Buffer) => {
    if (failure !== null) return;
    size += chunk.length;
    if (size > DEV_ACTIVITY_STDOUT_LIMIT) { terminate('failed'); return; }
    chunks.push(chunk);
  });
  child.once('error', (error: NodeJS.ErrnoException) => finish(failure ?? { ok: false, code: error.code === 'ENOENT' ? 'not_found' : 'failed' }));
  child.once('close', (code) => {
    if (failure !== null) return;
    finish(code === 0 ? { ok: true, stdout: Buffer.concat(chunks).toString('utf8') } : { ok: false, code: 'failed' });
  });
});

export interface DevActivityCollectorOptions {
  readonly env?: NodeJS.ProcessEnv;
  /** Runtime overlay cache reader; null or absent means no runtime source is configured. */
  readonly read_runtime?: (() => RuntimeOverlay) | null;
  readonly interval_ms?: number;
  readonly timeout_ms?: number;
  readonly max_concurrency?: number;
  readonly run_process?: DevActivityProcessRunner;
  readonly now?: () => number;
}

interface CollectionContext {
  readonly env: NodeJS.ProcessEnv;
  readonly timeout_ms: number;
  readonly signal: AbortSignal;
  readonly run: DevActivityProcessRunner;
  readonly now: () => number;
}

function subprocessEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', GH_SPINNER_DISABLED: '1', NO_COLOR: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
}

const failureReason = (prefix: string, code: DevActivityProcessFailure): string =>
  `${prefix}_${code === 'not_found' ? 'not_installed' : code}`;

/** The registry entry must name a real directory, not a symlink (same rule as Fleet). */
function readableAuthority(repo: RepoHarnessRegisteredRepo): boolean {
  let path = repo.path;
  while (path.length > 1 && (path.endsWith(sep) || path.endsWith('/'))) path = path.slice(0, -1);
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
    realpathSync(path);
    return true;
  } catch {
    return false;
  }
}

async function boundedMap<T, U>(values: readonly T[], limit: number, map: (value: T) => Promise<U>): Promise<U[]> {
  const output = new Array<U>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await map(values[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

/** `git status --porcelain=v2 --branch`: any entry line means dirty; `# branch.ab` exists only with an upstream. */
export function parseGitStatus(stdout: string): { dirty: boolean; ahead: number | null; behind: number | null } {
  let ahead: number | null = null;
  let behind: number | null = null;
  let dirty = false;
  for (const line of stdout.split('\n')) {
    if (line === '') continue;
    if (line.startsWith('# ')) {
      const ab = /^# branch\.ab \+(\d+) -(\d+)$/u.exec(line);
      if (ab) { ahead = Number(ab[1]); behind = Number(ab[2]); }
      continue;
    }
    dirty = true;
  }
  return { dirty, ahead, behind };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('gh_output_invalid');
  return value as Record<string, unknown>;
}
const str = (value: unknown): string => { if (typeof value !== 'string' || value.length === 0) throw new Error('gh_output_invalid'); return value; };
const isoTime = (value: unknown): string => { const s = str(value); if (!Number.isFinite(Date.parse(s))) throw new Error('gh_output_invalid'); return s; };
/** gh reports an unset time as the zero time or null; both mean "no fact". */
const optionalTime = (value: unknown): string | null =>
  (value === null || value === undefined || value === '' || value === '0001-01-01T00:00:00Z' ? null : isoTime(value));

export function parseGhRepoView(stdout: string): { github: string; default_branch: string | null } {
  const view = record(JSON.parse(stdout));
  const github = str(view.nameWithOwner);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(github)) throw new Error('gh_output_invalid');
  const ref = view.defaultBranchRef === null ? null : record(view.defaultBranchRef);
  return { github, default_branch: ref === null || ref.name === '' ? null : str(ref.name) };
}

/**
 * An open PR's changed files. gh lists at most 100; a shorter list than
 * `changedFiles` is truncated, never complete. A bad file field marks only this
 * PR, so the board keeps the rest of the query.
 */
function changedFilesOf(pr: Record<string, unknown>): DevActivityPrFiles {
  if (!Array.isArray(pr.files) || !Number.isSafeInteger(pr.changedFiles)) return { state: 'unavailable', reason: 'files_missing' };
  const paths = pr.files.map(file => (file !== null && typeof file === 'object' && typeof (file as Record<string, unknown>).path === 'string' ? (file as Record<string, string>).path : null));
  if (paths.some(path => path === null || !isPublicRepoPath(path)) || new Set(paths).size !== paths.length || paths.length > (pr.changedFiles as number)) {
    return { state: 'unavailable', reason: 'files_invalid' };
  }
  if (paths.length < (pr.changedFiles as number)) return { state: 'unavailable', reason: 'files_truncated' };
  return { state: 'ok', paths: (paths as string[]).sort() };
}

/** `open` is true only for the open query, the only one that requests CI, the head commit and the changed files. */
export function parseGhPullRequests(stdout: string, open: boolean): DevActivityRawPullRequest[] {
  const list = JSON.parse(stdout);
  if (!Array.isArray(list)) throw new Error('gh_output_invalid');
  return list.map((raw): DevActivityRawPullRequest => {
    const pr = record(raw);
    const state = pr.state === 'OPEN' ? 'open' : pr.state === 'MERGED' ? 'merged' : pr.state === 'CLOSED' ? 'closed' : null;
    if (state === null || !Number.isSafeInteger(pr.number) || (pr.number as number) < 1 || typeof pr.isDraft !== 'boolean' || typeof pr.title !== 'string') throw new Error('gh_output_invalid');
    const url = str(pr.url);
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+$/u.test(url)) throw new Error('gh_output_invalid');
    const mergeState = str(pr.mergeStateStatus);
    if (!/^[A-Z_]{1,32}$/u.test(mergeState)) throw new Error('gh_output_invalid');
    const mergedAt = optionalTime(pr.mergedAt);
    if ((state === 'merged') !== (mergedAt !== null)) throw new Error('gh_output_invalid');
    return {
      number: pr.number as number, title: pr.title, url, state, is_draft: pr.isDraft,
      head_branch: str(pr.headRefName), base_branch: str(pr.baseRefName), merge_state: mergeState,
      ci: open ? summarizeCiRollup(pr.statusCheckRollup ?? null) : null, review: reviewStateOf(pr.reviewDecision),
      created_at: isoTime(pr.createdAt), updated_at: isoTime(pr.updatedAt), merged_at: mergedAt, closed_at: optionalTime(pr.closedAt),
      head_sha: open && typeof pr.headRefOid === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(pr.headRefOid) ? pr.headRefOid : null,
      changed_files: open ? changedFilesOf(pr) : null,
    };
  });
}

async function collectGit(repo: RepoHarnessRegisteredRepo, defaultBranch: string | null, ctx: CollectionContext):
Promise<{ health: DevActivitySourceHealth; worktrees: DevActivityRawWorktree[] }> {
  const run = (argv: readonly string[], cwd: string) => ctx.run('git', argv, { cwd, env: ctx.env, timeout_ms: ctx.timeout_ms, signal: ctx.signal });
  const list = await run(DEV_ACTIVITY_GIT_WORKTREE_LIST_ARGV, repo.path);
  const observedAt = new Date(ctx.now()).toISOString();
  if (!list.ok) return { health: { kind: 'git', status: 'unavailable', reason: failureReason('git', list.code), observed_at: observedAt }, worktrees: [] };
  const worktrees: DevActivityRawWorktree[] = [];
  let failure: string | null = null;
  for (const entry of parseWorktreeTopology(list.stdout).worktrees) {
    if (entry.prunable || entry.head === null || !isAbsolute(entry.path) || entry.branch === null || !entry.branch.startsWith('refs/heads/')) continue;
    const branch = entry.branch.slice('refs/heads/'.length);
    if (branch === defaultBranch) continue;
    const status = await run(DEV_ACTIVITY_GIT_STATUS_ARGV, entry.path);
    if (!status.ok) { failure ??= failureReason('git_status', status.code); continue; }
    worktrees.push({ directory: basename(entry.path), branch, head_sha: entry.head, ...parseGitStatus(status.stdout) });
  }
  return {
    health: failure === null
      ? { kind: 'git', status: 'ok', reason: null, observed_at: observedAt }
      : { kind: 'git', status: 'unavailable', reason: failure, observed_at: observedAt },
    worktrees,
  };
}

async function collectGitHub(repo: RepoHarnessRegisteredRepo, ctx: CollectionContext):
Promise<{ health: DevActivitySourceHealth; github: string | null; default_branch: string | null; pull_requests: DevActivityRawPullRequest[] }> {
  const options = { cwd: repo.path, env: ctx.env, timeout_ms: ctx.timeout_ms, signal: ctx.signal };
  const at = () => new Date(ctx.now()).toISOString();
  const unavailable = (reason: string, status: DevActivitySourceHealth['status'] = 'unavailable') =>
    ({ health: { kind: 'github' as const, status, reason, observed_at: at() }, github: null, default_branch: null, pull_requests: [] });
  const remotes = await ctx.run('git', DEV_ACTIVITY_GIT_REMOTE_ARGV, options);
  if (!remotes.ok) return unavailable(failureReason('git_remote', remotes.code));
  if (!/github\.com[:/]/u.test(remotes.stdout)) return unavailable('no_github_remote', 'not_configured');
  const view = await ctx.run('gh', DEV_ACTIVITY_GH_REPO_VIEW_ARGV, options);
  if (!view.ok) return unavailable(failureReason('gh', view.code));
  const [openArgv, mergedArgv, closedArgv] = devActivityGhPrListArgv(ctx.now()) as [readonly string[], readonly string[], readonly string[]];
  const truncated: DevActivityPrCategory[] = [];
  // A list is null when the category exceeds the query limit.
  const list = async (argv: readonly string[], open: boolean): Promise<DevActivityRawPullRequest[] | null> => {
    const prs = await ctx.run('gh', argv, options);
    if (!prs.ok) throw Object.assign(new Error('gh_failed'), { code: prs.code });
    const rows = parseGhPullRequests(prs.stdout, open);
    return rows.length > DEV_ACTIVITY_GH_PR_LIMIT ? null : rows;
  };
  const category = async (name: DevActivityPrCategory, argv: readonly string[]): Promise<DevActivityRawPullRequest[]> => {
    let rows = await list(argv, name === 'open');
    if (rows === null && name !== 'open') {
      rows = [];
      for (const day of devActivityGhPrDayArgvs(name, ctx.now())) {
        const dayRows = await list(day, false);
        if (dayRows === null) { rows = null; break; }
        rows.push(...dayRows);
      }
    }
    if (rows === null) truncated.push(name);
    return rows ?? [];
  };
  try {
    const repository = parseGhRepoView(view.stdout);
    const byNumber = new Map<number, DevActivityRawPullRequest>();
    for (const [name, argv] of [['open', openArgv], ['merged', mergedArgv], ['closed', closedArgv]] as const) {
      for (const pr of await category(name, argv)) if (!byNumber.has(pr.number)) byNumber.set(pr.number, pr);
    }
    const health: DevActivitySourceHealth = truncated.length === 0
      ? { kind: 'github', status: 'ok', reason: null, observed_at: at() }
      : { kind: 'github', status: 'unavailable', reason: `${DEV_ACTIVITY_TRUNCATED_REASON_PREFIX}${truncated.join('_')}`, observed_at: at() };
    return { health, ...repository, pull_requests: [...byNumber.values()] };
  } catch (error) {
    const code = (error as { code?: DevActivityProcessFailure }).code;
    return unavailable(code === undefined ? 'gh_output_invalid' : failureReason('gh', code));
  }
}

/** git's own origin/HEAD, used only when GitHub cannot name the default branch. */
async function gitDefaultBranch(repo: RepoHarnessRegisteredRepo, ctx: CollectionContext): Promise<string | null> {
  const head = await ctx.run('git', DEV_ACTIVITY_GIT_ORIGIN_HEAD_ARGV, { cwd: repo.path, env: ctx.env, timeout_ms: ctx.timeout_ms, signal: ctx.signal });
  if (!head.ok) return null;
  const value = head.stdout.trim();
  return value.startsWith('origin/') && value.length > 'origin/'.length ? value.slice('origin/'.length) : null;
}

async function collectRepository(repo: RepoHarnessRegisteredRepo, runtime: DevActivitySourceHealth,
  ctx: CollectionContext): Promise<DevActivityRawRepository> {
  const github = await collectGitHub(repo, ctx);
  const defaultBranch = github.github !== null ? github.default_branch : await gitDefaultBranch(repo, ctx);
  const git = await collectGit(repo, defaultBranch, ctx);
  return {
    repository_id: repo.id,
    display_name: basename(repo.path),
    github: github.github,
    default_branch: defaultBranch,
    sources: [git.health, github.health, runtime],
    worktrees: git.worktrees,
    pull_requests: github.pull_requests,
  };
}

/** One full collection cycle. Registry failure yields an unavailable snapshot. */
export async function collectDevActivity(options: DevActivityCollectorOptions & { readonly signal?: AbortSignal } = {}):
Promise<DevActivitySnapshotV2> {
  const now = options.now ?? Date.now;
  const env = options.env ?? process.env;
  const ctx: CollectionContext = {
    env: subprocessEnv(env),
    timeout_ms: options.timeout_ms ?? DEV_ACTIVITY_SUBPROCESS_TIMEOUT_MS,
    signal: options.signal ?? new AbortController().signal,
    run: options.run_process ?? runDevActivityProcess,
    now,
  };
  let repos: readonly RepoHarnessRegisteredRepo[];
  try {
    repos = readRepoHarnessRegistryStrictSnapshot({ env, adoptedOnly: false }).repos;
  } catch {
    return { ...unavailableDevActivitySnapshot(), collected_at: new Date(now()).toISOString() };
  }
  const readable = repos.filter(readableAuthority);
  let runtime: DevActivitySourceHealth;
  if (!options.read_runtime) runtime = runtimeSourceHealth(null, now());
  else {
    try { runtime = runtimeSourceHealth(options.read_runtime(), now()); }
    catch { runtime = { kind: 'runtime', status: 'unavailable', reason: 'runtime_unavailable', observed_at: null }; }
  }
  const repositories = await boundedMap(readable, options.max_concurrency ?? DEV_ACTIVITY_REPOSITORY_CONCURRENCY,
    repo => collectRepository(repo, runtime, ctx));
  return projectDevActivity({
    collected_at: new Date(now()).toISOString(),
    now_ms: now(),
    unreadable_registrations: repos.length - readable.length,
    repositories,
  });
}

export interface DevActivityCollectorHandle {
  /** Cache read only; never starts work. */
  readonly read: () => DevActivitySnapshotV2;
  /** Resolves when the cycle in flight, if any, has settled. */
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/** Collect at startup, then every interval after the previous cycle settles. Cycles never overlap. */
export function startDevActivityCollector(options: DevActivityCollectorOptions = {}): DevActivityCollectorHandle {
  const controller = new AbortController();
  let cache: DevActivitySnapshotV2 = unavailableDevActivitySnapshot();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;
  const cycle = (): Promise<void> => {
    inflight = collectDevActivity({ ...options, signal: controller.signal })
      .then(next => { if (!closed) cache = next; }, () => {
        // Keep the last cache; its collected_at shows its age. A failed first cycle still ends the pending state.
        if (!closed && cache.collected_at === null) cache = { ...unavailableDevActivitySnapshot(), collected_at: new Date((options.now ?? Date.now)()).toISOString() };
      })
      .finally(() => {
        inflight = null;
        if (closed) return;
        timer = setTimeout(cycle, options.interval_ms ?? DEV_ACTIVITY_INTERVAL_MS);
        timer.unref?.();
      });
    return inflight;
  };
  void cycle();
  return Object.freeze({
    read: () => cache,
    settled: () => inflight ?? Promise.resolve(),
    close: async () => {
      closed = true;
      clearTimeout(timer);
      controller.abort();
      await inflight;
    },
  });
}

