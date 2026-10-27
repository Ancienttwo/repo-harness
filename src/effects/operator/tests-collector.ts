// Background tests collector (PRD G20, G21). It runs only in the `operator
// serve` process on a timer; a GET reads `read()` and starts no work.
//
// For each registered repository whose default branch GitHub named (the Dev
// Activity cache; no local fallback) it reads, with `gh`:
//  - the newest completed `schedule` run of `.github/workflows/ci.yml` on that branch;
//  - that run's `junit-daily-<attempt>` and `test-projection-<attempt>` artifacts of the highest attempt;
//  - the open CI repair issues, by the markers `scripts/report-ci.ts` writes.
// Artifacts are downloaded only when a newer run appears, into a cache
// directory under the repo-harness home (never the user's repository). They are
// parsed into memory, and the download of the older run is deleted.

import { lstat, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { DevActivitySnapshotV2 } from '../../core/dev-activity/types';
import {
  decodeTestsSnapshot,
  isCiRepairIssueBody,
  OPERATOR_TESTS_KIND,
  parseJUnitReport,
  parseTestProjection,
  publicTestText,
  TESTS_CHANNEL,
  TESTS_ISO_TIME,
  type TestFileResultV1,
  type TestsSnapshotV1,
  type TestsUnavailableReason,
} from '../../core/operator/tests';
import { runDevActivityProcess, type DevActivityProcessRunner } from '../dev-activity/collector';
import { readRepoHarnessRegistryStrictSnapshot, type RepoHarnessRegisteredRepo } from '../repo-registry';
import { repoHarnessHome } from '../repo-harness-home';

export const TESTS_COLLECT_INTERVAL_MS = 15 * 60_000;
const TESTS_PENDING_RETRY_MS = 5_000;
const GH_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
/** Zipped size, from the artifact listing. */
const ARTIFACT_MAX_BYTES = 64 * 1024 * 1024;
const REPORT_MAX_BYTES = 8 * 1024 * 1024;
const PROJECTION_MAX_BYTES = 32 * 1024 * 1024;
const REPORT_MAX_FILES = 5_000;
/** Extracted bytes of one artifact, from lstat sizes, checked before any file is read. */
const EXTRACTED_MAX_BYTES = 256 * 1024 * 1024;
const GITHUB_REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u;
const BRANCH = /^[A-Za-z0-9._/-]{1,255}$/u;

export type TestsRepositoryCache =
  | { readonly state: 'ready'; readonly snapshot: TestsSnapshotV1 }
  | { readonly state: 'unavailable'; readonly reason: TestsUnavailableReason };

export interface TestsCollectorOptions {
  readonly env?: NodeJS.ProcessEnv;
  /** The Dev Activity cache: the only source of each repository's GitHub name and default branch. */
  readonly read_dev_activity: () => DevActivitySnapshotV2;
  readonly interval_ms?: number;
  readonly run_process?: DevActivityProcessRunner;
  readonly now?: () => Date;
}

export interface TestsCollectorHandle {
  /** Cache read only; never starts work. */
  readonly read: (repositoryId: string) => TestsRepositoryCache;
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/** The cache directory of one repository's downloads. */
export function testsArtifactRoot(env: NodeJS.ProcessEnv, repositoryId: string): string {
  return join(repoHarnessHome(env), 'operator', 'test-artifacts', repositoryId);
}

type Run = TestsSnapshotV1['run'];
type Parsed = { readonly projection: TestsSnapshotV1['projection']; readonly results: TestsSnapshotV1['results'] };
class Unavailable extends Error {
  constructor(readonly reason: TestsUnavailableReason) { super(reason); }
}

function ghEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', GH_SPINNER_DISABLED: '1', NO_COLOR: '1' };
}

function json(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

/** Regular files under `dir`, depth first, within the count and total size caps. A symlink is skipped, never followed. */
async function regularFiles(dir: string, limit: number): Promise<string[]> {
  const out: string[] = [];
  let bytes = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const name of (await readdir(current)).sort()) {
      const path = join(current, name);
      const stat = await lstat(path);
      if (stat.isDirectory()) stack.push(path);
      else if (stat.isFile()) {
        bytes += stat.size;
        if (out.length >= limit || bytes > EXTRACTED_MAX_BYTES) throw new Unavailable('artifact_too_large');
        out.push(path);
      }
    }
  }
  return out;
}

async function readCapped(path: string, max: number): Promise<string> {
  if ((await lstat(path)).size > max) throw new Unavailable('artifact_too_large');
  return readFile(path, 'utf8');
}

/** Collect at start, then every interval after the previous cycle settles. Cycles never overlap. */
export function startTestsCollector(options: TestsCollectorOptions): TestsCollectorHandle {
  const env = ghEnv(options.env ?? process.env);
  const run = options.run_process ?? runDevActivityProcess;
  const abort = new AbortController();
  const now = () => (options.now ?? (() => new Date()))();
  /** Parsed artifacts of the newest run per repository, kept across cycles. */
  const downloads = new Map<string, { readonly key: string; readonly run: Run; readonly parsed: Parsed }>();
  let states = new Map<string, TestsRepositoryCache>();
  let registryFailed = false;
  let started = false;
  let activityPending = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;

  const gh = async (argv: readonly string[], cwd: string, timeout_ms = GH_TIMEOUT_MS): Promise<string> => {
    const result = await run('gh', argv, { cwd, env, timeout_ms, signal: abort.signal });
    if (!result.ok) throw new Unavailable('github_unavailable');
    return result.stdout;
  };

  const newestRun = async (github: string, branch: string, cwd: string): Promise<Run> => {
    const query = `repos/${github}/actions/workflows/ci.yml/runs?event=schedule&status=completed&per_page=1&branch=${encodeURIComponent(branch)}`;
    const body = json(await gh(['api', query], cwd)) as { workflow_runs?: unknown } | null;
    if (!body || !Array.isArray(body.workflow_runs)) throw new Unavailable('github_unavailable');
    const raw = body.workflow_runs[0] as Record<string, unknown> | undefined;
    if (raw === undefined) throw new Unavailable('no_daily_run');
    // The response must be the run the query asked for; anything else is not this collector's authority.
    if (raw.event !== 'schedule' || raw.head_branch !== branch || raw.path !== '.github/workflows/ci.yml' || raw.status !== 'completed') {
      throw new Unavailable('github_unavailable');
    }
    const value = {
      id: raw.id, attempt: raw.run_attempt, head_sha: raw.head_sha,
      created_at: typeof raw.created_at === 'string' && TESTS_ISO_TIME.test(raw.created_at) ? raw.created_at : null, conclusion: raw.conclusion ?? null, channel: TESTS_CHANNEL,
    };
    if (!Number.isSafeInteger(value.id) || !Number.isSafeInteger(value.attempt) || (value.attempt as number) < 1
      || typeof value.head_sha !== 'string' || !/^[0-9a-f]{40}$/u.test(value.head_sha) || value.created_at === null
      || (value.conclusion !== null && (typeof value.conclusion !== 'string' || !/^[a-z_]{1,32}$/u.test(value.conclusion)))) {
      throw new Unavailable('github_unavailable');
    }
    return value as Run;
  };

  const download = async (github: string, run_: Run, name: string, dir: string): Promise<void> => {
    await mkdir(dir, { recursive: true });
    await gh(['run', 'download', String(run_.id), '-R', github, '-n', name, '-D', dir], dir, DOWNLOAD_TIMEOUT_MS)
      .catch(() => { throw new Unavailable('artifact_download_failed'); });
  };

  const readResults = async (dir: string): Promise<TestFileResultV1[]> => {
    const files = (await regularFiles(dir, REPORT_MAX_FILES)).filter(path => path.endsWith('.xml'));
    const byFile = new Map<string, TestFileResultV1>();
    for (const path of files) {
      const report = parseJUnitReport(await readCapped(path, REPORT_MAX_BYTES));
      // One report per test file; a second one for the same file is not a Bun JUnit artifact.
      if (byFile.has(report.file)) throw new Error('junit invalid: duplicate file');
      byFile.set(report.file, report);
    }
    return [...byFile.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  };

  /** Lists, downloads and parses the artifacts of one run. */
  const fetchArtifacts = async (repo: RepoHarnessRegisteredRepo, github: string, run_: Run): Promise<Parsed> => {
    const root = testsArtifactRoot(env, repo.id);
    const listing = json(await gh(['api', `repos/${github}/actions/runs/${run_.id}/artifacts?per_page=100`], repoHarnessHome(env))) as { artifacts?: unknown } | null;
    if (!listing || !Array.isArray(listing.artifacts)) throw new Unavailable('github_unavailable');
    const named = (name: string) => (listing.artifacts as Record<string, unknown>[]).find(entry => entry?.name === name) ?? null;
    const junit = named(`junit-daily-${run_.attempt}`);
    const projection = named(`test-projection-${run_.attempt}`);
    if (junit === null && projection === null) throw new Unavailable('artifacts_missing');
    const present = [junit, projection].filter((entry): entry is Record<string, unknown> => entry !== null);
    if (present.every(entry => entry.expired === true)) throw new Unavailable('artifacts_expired');
    for (const entry of present) {
      if (typeof entry.size_in_bytes !== 'number' || entry.size_in_bytes > ARTIFACT_MAX_BYTES) throw new Unavailable('artifact_too_large');
    }
    const dir = join(root, `${run_.id}-${run_.attempt}`);
    await rm(dir, { recursive: true, force: true });
    let results: Parsed['results'] = { state: 'unavailable', reason: 'junit_missing' };
    if (junit !== null && junit.expired !== true) {
      await download(github, run_, junit.name as string, join(dir, 'junit'));
      try { results = { state: 'ok', files: await readResults(join(dir, 'junit')) }; }
      catch (error) { if (error instanceof Unavailable) throw error; results = { state: 'unavailable', reason: 'junit_invalid' }; }
    }
    let projected: Parsed['projection'] = { state: 'unavailable', reason: 'projection_missing' };
    if (projection !== null && projection.expired !== true) {
      await download(github, run_, projection.name as string, join(dir, 'projection'));
      try {
        const files = await regularFiles(join(dir, 'projection'), REPORT_MAX_FILES);
        // The artifact holds exactly one JSON file; anything else is not the projection.
        if (files.length !== 1) throw new Error('test projection invalid: file count');
        const file = files[0]!;
        projected = { state: 'ok', files: parseTestProjection(JSON.parse(await readCapped(file, PROJECTION_MAX_BYTES))) };
      } catch (error) { if (error instanceof Unavailable) throw error; projected = { state: 'unavailable', reason: 'projection_invalid' }; }
    }
    // The parsed result stays in memory; only the newest run's download is kept on disk.
    for (const name of await readdir(root)) if (name !== `${run_.id}-${run_.attempt}`) await rm(join(root, name), { recursive: true, force: true });
    return { projection: projected, results };
  };

  const readRepairs = async (github: string, cwd: string): Promise<TestsSnapshotV1['repairs']> => {
    // jq only drops unused fields; the repair rule is isCiRepairIssueBody, the same markers report-ci.ts writes.
    const fields = '.[] | {number, title, html_url, body, is_pull_request: (.pull_request != null)}';
    try {
      const stdout = await gh(['api', '--paginate', `repos/${github}/issues?state=open&per_page=100`, '--jq', fields], cwd);
      const issues = stdout.split('\n').filter(line => line.trim() !== '').flatMap(line => {
        const issue = json(line) as { number?: unknown; title?: unknown; html_url?: unknown; body?: unknown; is_pull_request?: unknown } | null;
        if (!issue || typeof issue.is_pull_request !== 'boolean') throw new Error('repair issue invalid');
        if (issue.is_pull_request || typeof issue.body !== 'string' || !isCiRepairIssueBody(issue.body)) return [];
        if (!Number.isSafeInteger(issue.number) || typeof issue.title !== 'string' || issue.html_url !== `https://github.com/${github}/issues/${issue.number}`) {
          throw new Error('repair issue invalid');
        }
        return [{ number: issue.number as number, title: publicTestText(issue.title) || `#${issue.number}`, url: issue.html_url as string }];
      });
      return { state: 'ok', issues: issues.sort((a, b) => a.number - b.number) };
    } catch {
      return { state: 'unavailable', reason: 'repairs_unavailable' };
    }
  };

  const collectRepository = async (repo: RepoHarnessRegisteredRepo, activity: DevActivitySnapshotV2): Promise<TestsRepositoryCache> => {
    if (activity.collected_at === null) return { state: 'unavailable', reason: 'tests_pending' };
    const source = activity.repositories.find(entry => entry.repository_id === repo.id);
    // Only GitHub names the default branch; Dev Activity's local fallback is not used.
    if (!source?.github || !source.default_branch || !GITHUB_REPO.test(source.github) || !BRANCH.test(source.default_branch)) {
      return { state: 'unavailable', reason: 'default_branch_unknown' };
    }
    const github = source.github;
    try {
      // gh runs in the repo-harness home, never in the user's repository.
      const cwd = repoHarnessHome(env);
      const newest = await newestRun(github, source.default_branch, cwd);
      const key = `${github}#${newest.id}-${newest.attempt}`;
      let held = downloads.get(repo.id);
      if (held?.key !== key) {
        held = { key, run: newest, parsed: await fetchArtifacts(repo, github, newest) };
        downloads.set(repo.id, held);
      }
      const repairs = await readRepairs(github, cwd);
      let snapshot: TestsSnapshotV1;
      try {
        snapshot = decodeTestsSnapshot({
        protocol: 1, kind: OPERATOR_TESTS_KIND, repository_id: repo.id, collected_at: now().toISOString(),
          run: newest, projection: held.parsed.projection, results: held.parsed.results, repairs,
        });
      } catch {
        return { state: 'unavailable', reason: 'tests_invalid' };
      }
      return { state: 'ready', snapshot };
    } catch (error) {
      // Only a failure this module classified has a reason; any other one is a local download or file error.
      return { state: 'unavailable', reason: error instanceof Unavailable ? error.reason : 'artifact_download_failed' };
    }
  };

  const cycle = (): Promise<void> => {
    inflight = (async () => {
      let repos: readonly RepoHarnessRegisteredRepo[];
      try { repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos; }
      catch { registryFailed = true; return; }
      const activity = options.read_dev_activity();
      activityPending = activity.collected_at === null;
      const next = new Map<string, TestsRepositoryCache>();
      // One repository at a time: a daily artifact changes once a day, and each download can be large.
      for (const repo of repos) {
        if (closed) return;
        next.set(repo.id, await collectRepository(repo, activity));
      }
      // A repository that left the registry keeps no parsed result and no download.
      for (const id of [...downloads.keys()]) {
        if (next.has(id)) continue;
        downloads.delete(id);
        await rm(testsArtifactRoot(env, id), { recursive: true, force: true });
      }
      if (closed) return;
      states = next;
      registryFailed = false;
      started = true;
    })().catch(() => { /* every repository failure is a state; keep the last cache */ }).finally(() => {
      inflight = null;
      if (closed) return;
      const interval = options.interval_ms ?? TESTS_COLLECT_INTERVAL_MS;
      timer = setTimeout(() => { void cycle(); }, activityPending ? Math.min(interval, TESTS_PENDING_RETRY_MS) : interval);
      timer.unref?.();
    });
    return inflight;
  };
  void cycle();

  return Object.freeze({
    read: (repositoryId: string): TestsRepositoryCache => {
      if (registryFailed) return { state: 'unavailable', reason: 'registry_unavailable' };
      if (!started) return { state: 'unavailable', reason: 'tests_pending' };
      return states.get(repositoryId) ?? { state: 'unavailable', reason: 'repository_not_found' };
    },
    settled: () => inflight ?? Promise.resolve(),
    close: async () => {
      closed = true;
      clearTimeout(timer);
      // Aborting kills a running gh, so a long download does not hold shutdown.
      abort.abort();
      await inflight;
    },
  });
}
