// Background Dev Activity collector (plan §3.1, invariant N1). It runs only in
// the `operator serve` process on a timer, never on a request path. Every
// subprocess argv is a code constant (the PR search date comes from the
// collector clock); the only other variable inputs are the working
// directory (a validated registry root, or a worktree path that Git itself
// reported) and the environment. stderr is discarded and stdout is parsed into
// typed facts, so no subprocess free text reaches the snapshot.

import { spawn } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { basename, isAbsolute, join, resolve, sep } from 'node:path';

import { DEV_ACTIVITY_SHIPPED_WINDOW_MS, type DevActivitySnapshotV1, type DevActivitySourceHealth } from '../../core/dev-activity/types';
import { unavailableDevActivitySnapshot } from '../../core/dev-activity/decode';
import {
  projectDevActivity,
  reviewStateOf,
  runtimeSourceHealth,
  summarizeCiRollup,
  type DevActivityRawHumanRequest,
  type DevActivityRawLedgerRecord,
  type DevActivityRawPullRequest,
  type DevActivityRawRepository,
  type DevActivityRawWorktree,
} from '../../core/dev-activity/projection';
import type { RuntimeOverlay } from '../../core/operator/runtime-status';
import { decodeRecord, digest, type PipelineRecord } from '../../core/pipeline/types';
import { projectedRuns, type LogObservation } from '../../core/pipeline/projection';
import { openSnapshot, snapshotPointerPath, storePath } from '../pipeline/store';
import { parseWorktreeTopology } from '../git/worktree-topology';
import { readOpenDecisionInventory, VERIFIED_CONTEXT_STORE_RELATIVE_ROOT } from '../engineers/verified-context-store';
import {
  canonicalRepoPath,
  readRepoHarnessRegistryStrictSnapshot,
  repoHarnessRepoIdFor,
  type RepoHarnessRegisteredRepo,
} from '../repo-registry';

export const DEV_ACTIVITY_INTERVAL_MS = 60_000;
export const DEV_ACTIVITY_SUBPROCESS_TIMEOUT_MS = 15_000;
export const DEV_ACTIVITY_REPOSITORY_CONCURRENCY = 4;
const DEV_ACTIVITY_STDOUT_LIMIT = 8 * 1024 * 1024;

export const DEV_ACTIVITY_GIT_WORKTREE_LIST_ARGV = Object.freeze(['--no-optional-locks', 'worktree', 'list', '--porcelain'] as const);
export const DEV_ACTIVITY_GIT_STATUS_ARGV = Object.freeze(['--no-optional-locks', 'status', '--porcelain=v2', '--branch'] as const);
export const DEV_ACTIVITY_GIT_REMOTE_ARGV = Object.freeze(['--no-optional-locks', 'remote', '-v'] as const);
export const DEV_ACTIVITY_GIT_ORIGIN_HEAD_ARGV = Object.freeze(['--no-optional-locks', 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'] as const);
export const DEV_ACTIVITY_GIT_COMMON_DIR_ARGV = Object.freeze(['--no-optional-locks', 'rev-parse', '--git-common-dir'] as const);
export const DEV_ACTIVITY_GH_REPO_VIEW_ARGV = Object.freeze(['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef'] as const);
const DEV_ACTIVITY_GH_PR_BASE_FIELDS = 'number,title,state,isDraft,headRefName,baseRefName,url,createdAt,updatedAt,mergedAt,closedAt,mergeStateStatus,reviewDecision';
export const DEV_ACTIVITY_GH_OPEN_PR_FIELDS = `${DEV_ACTIVITY_GH_PR_BASE_FIELDS},statusCheckRollup`;
export const DEV_ACTIVITY_GH_CLOSED_PR_FIELDS = DEV_ACTIVITY_GH_PR_BASE_FIELDS;
/**
 * PR authority rule: only PRs authored by the authenticated gh user
 * (`--author @me`) are collected, so third-party PRs in upstream clones never
 * become cards. Local worktree branches are always items, with or without a PR.
 *
 * Fetch only what the board displays. Open PRs carry CI (statusCheckRollup);
 * merged and closed-unmerged PRs are bounded to the shipped window by a GitHub
 * search date and carry no CI. The day-granular date is a superset bound; the
 * projection applies the exact window. There is no retry or fallback query.
 * The only variable argv element is the window date, computed from the
 * collector clock.
 */
export function devActivityGhPrListArgv(nowMs: number): readonly (readonly string[])[] {
  const since = new Date(nowMs - DEV_ACTIVITY_SHIPPED_WINDOW_MS).toISOString().slice(0, 10);
  return Object.freeze([
    Object.freeze(['pr', 'list', '--state', 'open', '--author', '@me', '--limit', '50', '--json', DEV_ACTIVITY_GH_OPEN_PR_FIELDS]),
    Object.freeze(['pr', 'list', '--state', 'merged', '--author', '@me', '--limit', '50', '--search', `merged:>=${since}`, '--json', DEV_ACTIVITY_GH_CLOSED_PR_FIELDS]),
    // `--state closed` alone also matches merged PRs; `is:unmerged` keeps this query to closed-unmerged.
    Object.freeze(['pr', 'list', '--state', 'closed', '--author', '@me', '--limit', '50', '--search', `closed:>=${since} is:unmerged`, '--json', DEV_ACTIVITY_GH_CLOSED_PR_FIELDS]),
  ]);
}

export type DevActivityProcessFailure = 'timeout' | 'not_found' | 'failed' | 'aborted';
export type DevActivityProcessResult = { readonly ok: true; readonly stdout: string } | { readonly ok: false; readonly code: DevActivityProcessFailure };
export type DevActivityProcessRunner = (
  command: 'git' | 'gh',
  argv: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly timeout_ms: number; readonly signal: AbortSignal },
) => Promise<DevActivityProcessResult>;

/** Spawn with no shell, no stdin and no stderr capture. The deadline kills the child. */
export const runDevActivityProcess: DevActivityProcessRunner = (command, argv, options) => new Promise((settle) => {
  if (options.signal.aborted) { settle({ ok: false, code: 'aborted' }); return; }
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(command, [...argv], { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  } catch {
    settle({ ok: false, code: 'failed' });
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let settled = false;
  const kill = () => { try { child.kill('SIGKILL'); } catch { /* already exited */ } };
  const finish = (result: DevActivityProcessResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    options.signal.removeEventListener('abort', onAbort);
    settle(result);
  };
  const onAbort = () => { kill(); finish({ ok: false, code: 'aborted' }); };
  const timer = setTimeout(() => { kill(); finish({ ok: false, code: 'timeout' }); }, options.timeout_ms);
  options.signal.addEventListener('abort', onAbort, { once: true });
  child.stdout!.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > DEV_ACTIVITY_STDOUT_LIMIT) { kill(); finish({ ok: false, code: 'failed' }); return; }
    chunks.push(chunk);
  });
  child.once('error', (error: NodeJS.ErrnoException) => finish({ ok: false, code: error.code === 'ENOENT' ? 'not_found' : 'failed' }));
  child.once('close', (code) => finish(code === 0 ? { ok: true, stdout: Buffer.concat(chunks).toString('utf8') } : { ok: false, code: 'failed' }));
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
  /** First observation time per open Decision, kept across cycles (see types.ts). */
  readonly first_seen: Map<string, string>;
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

/** `withCi` is true only for the open query, the only one that requests statusCheckRollup. */
export function parseGhPullRequests(stdout: string, withCi: boolean): DevActivityRawPullRequest[] {
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
      ci: withCi ? summarizeCiRollup(pr.statusCheckRollup ?? null) : null, review: reviewStateOf(pr.reviewDecision),
      created_at: isoTime(pr.createdAt), updated_at: isoTime(pr.updatedAt), merged_at: mergedAt, closed_at: optionalTime(pr.closedAt),
    };
  });
}

interface LedgerRead { health: Omit<DevActivitySourceHealth, 'kind'>; byRepository: Map<string, DevActivityRawLedgerRecord[]> }

/** Read the published immutable ledger generation once per cycle. Records map to a Fleet repository only through `repo.root`. */
function readLedger(env: NodeJS.ProcessEnv, observedAt: string): LedgerRead {
  const byRepository = new Map<string, DevActivityRawLedgerRecord[]>();
  const pointer = snapshotPointerPath(storePath(env));
  try {
    lstatSync(pointer);
  } catch {
    return { health: { status: 'not_configured', reason: 'ledger_not_configured', observed_at: observedAt }, byRepository };
  }
  let opened: ReturnType<typeof openSnapshot>;
  try {
    opened = openSnapshot(pointer);
  } catch {
    return { health: { status: 'unavailable', reason: 'ledger_unavailable', observed_at: observedAt }, byRepository };
  }
  try {
    const records = (opened.db.query('SELECT record FROM pipelines ORDER BY source_host,repository_id,task').all() as { record: string }[])
      .map(row => decodeRecord(JSON.parse(row.record)));
    const logs = opened.db.query('SELECT * FROM observations ORDER BY seq').all()
      .map((row: any) => ({ ...row, payload: JSON.parse(row.payload) })) as LogObservation[];
    for (const ledger of records) {
      const repositoryId = ledgerRepositoryId(ledger);
      if (repositoryId === null) continue;
      const rows = byRepository.get(repositoryId) ?? [];
      rows.push(rawLedgerRecord(ledger, logs));
      byRepository.set(repositoryId, rows);
    }
    return { health: { status: 'ok', reason: null, observed_at: observedAt }, byRepository };
  } catch {
    return { health: { status: 'unavailable', reason: 'ledger_unavailable', observed_at: observedAt }, byRepository: new Map() };
  } finally {
    opened.db.close();
  }
}

function ledgerRepositoryId(ledger: PipelineRecord): string | null {
  const root = ledger.repo.root;
  return root !== null && isAbsolute(root) ? repoHarnessRepoIdFor(canonicalRepoPath(root)) : null;
}

function rawLedgerRecord(ledger: PipelineRecord, logs: LogObservation[]): DevActivityRawLedgerRecord {
  return {
    record_id: ledger.id, source_host: ledger.source_host, runtime_repository_id: digest(ledger.repository_id),
    task: ledger.task.value, state_version: ledger.state_version, branch: ledger.resources.branch, title: ledger.task.title,
    phase: ledger.phase, phase_since: ledger.phase_since, blocked_return_to: ledger.blocked?.return_to ?? null,
    owner_bot: ledger.owner_bot, blocked: ledger.blocked ? { reason: ledger.blocked.reason, since: ledger.blocked.since } : null,
    waiting_owner: ledger.phase === 'merge-ask' || ledger.flags_attested.includes('waiting_owner'),
    updated_at: ledger.updated_at,
    runs: projectedRuns(ledger, structuredClone(logs)).map(run => ({ role: run.role, round: run.round })),
  };
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
  const outputs: string[] = [];
  for (const argv of devActivityGhPrListArgv(ctx.now())) {
    const prs = await ctx.run('gh', argv, options);
    if (!prs.ok) return unavailable(failureReason('gh', prs.code));
    outputs.push(prs.stdout);
  }
  try {
    const repository = parseGhRepoView(view.stdout);
    const byNumber = new Map<number, DevActivityRawPullRequest>();
    outputs.forEach((stdout, index) => {
      for (const pr of parseGhPullRequests(stdout, index === 0)) if (!byNumber.has(pr.number)) byNumber.set(pr.number, pr);
    });
    return { health: { kind: 'github', status: 'ok', reason: null, observed_at: at() }, ...repository, pull_requests: [...byNumber.values()] };
  } catch {
    return unavailable('gh_output_invalid');
  }
}

/** git's own origin/HEAD, used only when GitHub cannot name the default branch. */
async function gitDefaultBranch(repo: RepoHarnessRegisteredRepo, ctx: CollectionContext): Promise<string | null> {
  const head = await ctx.run('git', DEV_ACTIVITY_GIT_ORIGIN_HEAD_ARGV, { cwd: repo.path, env: ctx.env, timeout_ms: ctx.timeout_ms, signal: ctx.signal });
  if (!head.ok) return null;
  const value = head.stdout.trim();
  return value.startsWith('origin/') && value.length > 'origin/'.length ? value.slice('origin/'.length) : null;
}

async function collectDecisions(repo: RepoHarnessRegisteredRepo, ctx: CollectionContext):
Promise<{ health: DevActivitySourceHealth; requests: DevActivityRawHumanRequest[] }> {
  const observedAt = new Date(ctx.now()).toISOString();
  const common = await ctx.run('git', DEV_ACTIVITY_GIT_COMMON_DIR_ARGV, { cwd: repo.path, env: ctx.env, timeout_ms: ctx.timeout_ms, signal: ctx.signal });
  if (!common.ok) return { health: { kind: 'decisions', status: 'unavailable', reason: failureReason('git', common.code), observed_at: observedAt }, requests: [] };
  const directory = join(resolve(repo.path, common.stdout.trim()), VERIFIED_CONTEXT_STORE_RELATIVE_ROOT, 'decisions');
  try {
    lstatSync(directory);
  } catch {
    return { health: { kind: 'decisions', status: 'ok', reason: null, observed_at: observedAt }, requests: [] };
  }
  try {
    const inventory = readOpenDecisionInventory(repo.path, { after: null, limit: 100 });
    const requests = inventory.entries.map(({ request }) => {
      const key = `${repo.id}:${request.decision_id}`;
      const first = ctx.first_seen.get(key) ?? observedAt;
      ctx.first_seen.set(key, first);
      return { decision_id: request.decision_id, question: request.question, first_observed_at: first };
    });
    return {
      health: inventory.coverage.complete
        ? { kind: 'decisions', status: 'ok', reason: null, observed_at: observedAt }
        : { kind: 'decisions', status: 'unavailable', reason: 'decisions_incomplete', observed_at: observedAt },
      requests,
    };
  } catch {
    return { health: { kind: 'decisions', status: 'unavailable', reason: 'decisions_unavailable', observed_at: observedAt }, requests: [] };
  }
}

async function collectRepository(repo: RepoHarnessRegisteredRepo, ledger: LedgerRead, runtime: DevActivitySourceHealth,
  ctx: CollectionContext): Promise<DevActivityRawRepository> {
  const github = await collectGitHub(repo, ctx);
  const defaultBranch = github.health.status === 'ok' ? github.default_branch : await gitDefaultBranch(repo, ctx);
  const git = await collectGit(repo, defaultBranch, ctx);
  const decisions = await collectDecisions(repo, ctx);
  return {
    repository_id: repo.id,
    display_name: basename(repo.path),
    github: github.github,
    default_branch: defaultBranch,
    sources: [git.health, github.health, { kind: 'ledger', ...ledger.health }, runtime, decisions.health],
    worktrees: git.worktrees,
    pull_requests: github.pull_requests,
    ledger: ledger.byRepository.get(repo.id) ?? [],
    human_requests: decisions.requests,
  };
}

/** One full collection cycle. Registry failure yields an unavailable snapshot. */
export async function collectDevActivity(options: DevActivityCollectorOptions & { readonly signal?: AbortSignal; readonly first_seen?: Map<string, string> } = {}):
Promise<DevActivitySnapshotV1> {
  const now = options.now ?? Date.now;
  const env = options.env ?? process.env;
  const ctx: CollectionContext = {
    env: subprocessEnv(env),
    timeout_ms: options.timeout_ms ?? DEV_ACTIVITY_SUBPROCESS_TIMEOUT_MS,
    signal: options.signal ?? new AbortController().signal,
    run: options.run_process ?? runDevActivityProcess,
    now,
    first_seen: options.first_seen ?? new Map(),
  };
  let repos: readonly RepoHarnessRegisteredRepo[];
  try {
    repos = readRepoHarnessRegistryStrictSnapshot({ env, adoptedOnly: false }).repos;
  } catch {
    return { ...unavailableDevActivitySnapshot(), collected_at: new Date(now()).toISOString() };
  }
  const readable = repos.filter(readableAuthority);
  const startedAt = new Date(now()).toISOString();
  const ledger = readLedger(env, startedAt);
  let runtimeOverlay: RuntimeOverlay | null = null;
  let runtime: DevActivitySourceHealth;
  if (!options.read_runtime) runtime = runtimeSourceHealth(null, now());
  else {
    try { runtimeOverlay = options.read_runtime(); runtime = runtimeSourceHealth(runtimeOverlay, now()); }
    catch { runtimeOverlay = null; runtime = { kind: 'runtime', status: 'unavailable', reason: 'runtime_unavailable', observed_at: null }; }
  }
  const repositories = await boundedMap(readable, options.max_concurrency ?? DEV_ACTIVITY_REPOSITORY_CONCURRENCY,
    repo => collectRepository(repo, ledger, runtime, ctx));
  const seen = new Set(repositories.flatMap(repo => repo.human_requests.map(request => `${repo.repository_id}:${request.decision_id}`)));
  for (const key of [...ctx.first_seen.keys()]) if (!seen.has(key)) ctx.first_seen.delete(key);
  return projectDevActivity({
    collected_at: new Date(now()).toISOString(),
    now_ms: now(),
    unreadable_registrations: repos.length - readable.length,
    repositories,
    runtime: runtime.status === 'not_configured' ? null : runtimeOverlay,
  });
}

export interface DevActivityCollectorHandle {
  /** Cache read only; never starts work. */
  readonly read: () => DevActivitySnapshotV1;
  /** Resolves when the cycle in flight, if any, has settled. */
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/** Collect at startup, then every interval after the previous cycle settles. Cycles never overlap. */
export function startDevActivityCollector(options: DevActivityCollectorOptions = {}): DevActivityCollectorHandle {
  const controller = new AbortController();
  const firstSeen = new Map<string, string>();
  let cache: DevActivitySnapshotV1 = unavailableDevActivitySnapshot();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;
  const cycle = (): Promise<void> => {
    inflight = collectDevActivity({ ...options, signal: controller.signal, first_seen: firstSeen })
      .then(next => { if (!closed) cache = next; }, () => { /* keep the last cache; its collected_at shows its age */ })
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

