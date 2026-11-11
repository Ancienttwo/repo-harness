/** Draft PR publication through the bounded GitHub command transport. No credential reader or alternate HTTP client. */
import {
  validPublicationBranchRef,
  validPublicationCommit,
  type DraftPullRequest,
  type DraftPullRequestDraft,
  type DraftPullRequestHead,
  type DraftPullRequestResult,
  type PublicationRepository,
} from '../../core/publication/publication-writes';
import { isRecord } from '../../core/evidence/is-record';
import { runGithubCommand, type GithubCommandRunner } from '../github/issues';

const DEADLINE_MS = 15_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PAGES = 5;
const REPOSITORY = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/u;
const fail = (): never => { throw new Error('GitHub publication observation unavailable or incompatible'); };
const object = (value: unknown): Record<string, any> => {
  if (!isRecord(value)) return fail();
  return value;
};
function headCheck(head: DraftPullRequestHead): void {
  if (!REPOSITORY.test(head.repository) || !validPublicationBranchRef(`refs/heads/${head.base_branch}`)
    || !validPublicationBranchRef(`refs/heads/${head.head_branch}`) || !validPublicationCommit(head.commit)) fail();
}

/** One call budget includes every page and preflight. Never accept truncated lists. */
function api(runner: GithubCommandRunner, now: () => number) {
  const deadline = now() + DEADLINE_MS;
  let remainingBytes = MAX_BYTES;
  return (method: 'GET' | 'POST', endpoint: string, fields: readonly string[] = []): unknown => {
    const remaining = deadline - now();
    if (remaining <= 0 || remainingBytes <= 0) return fail();
    const result = runner(['api', '--hostname', 'github.com', '--method', method,
      '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28', endpoint, ...fields],
    { timeout_ms: remaining, max_buffer: remainingBytes });
    remainingBytes -= Buffer.byteLength(result.stdout, 'utf8');
    if (remainingBytes < 0 || now() > deadline) return fail();
    try { return JSON.parse(result.stdout); } catch { return fail(); }
  };
}
type Api = ReturnType<typeof api>;
interface Repository { id: number; name: string; base: string }
function repository(read: Api, name: string): Repository {
  if (!REPOSITORY.test(name)) return fail();
  const row = object(read('GET', `repos/${name}`));
  const canonical = row.full_name;
  if (!Number.isSafeInteger(row.id) || row.id < 1 || typeof canonical !== 'string' || canonical.toLowerCase() !== name.toLowerCase()
    || row.html_url !== `https://github.com/${canonical}` || row.archived !== false || row.disabled !== false
    || object(row.permissions).push !== true || typeof row.default_branch !== 'string' || !validPublicationBranchRef(`refs/heads/${row.default_branch}`)) return fail();
  return { id: row.id, name: canonical, base: row.default_branch };
}
function exactPr(value: unknown, repo: Repository, head: DraftPullRequestHead): DraftPullRequest {
  const row = object(value), rowHead = object(row.head), base = object(row.base);
  const headRepo = object(rowHead.repo), baseRepo = object(base.repo);
  if (!Number.isSafeInteger(row.number) || row.number < 1 || row.html_url !== `https://github.com/${repo.name}/pull/${row.number}`
    || row.state !== 'open' || row.draft !== true || row.merged_at !== null
    || rowHead.ref !== head.head_branch || rowHead.sha !== head.commit || base.ref !== head.base_branch
    || headRepo.id !== repo.id || baseRepo.id !== repo.id || headRepo.full_name !== repo.name || baseRepo.full_name !== repo.name) return fail();
  return { number: row.number, url: row.html_url };
}
function find(read: Api, head: DraftPullRequestHead, repo: Repository): DraftPullRequest | null {
  // Search the head across all bases. A PR whose base was changed must block a
  // new create instead of disappearing behind a base filter.
  const query = new URLSearchParams({ state: 'all', head: `${repo.name.split('/')[0]}:${head.head_branch}`, per_page: '100' });
  let found: DraftPullRequest | null = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const rows = read('GET', `repos/${repo.name}/pulls?${query}&page=${page}`);
    if (!Array.isArray(rows) || rows.length > 100) return fail();
    for (const row of rows) {
      const pr = exactPr(row, repo, head);
      if (found !== null) return fail(); // Duplicate or multiple historical PRs are ambiguous.
      found = pr;
    }
    if (rows.length < 100) return found;
  }
  return fail();
}
function headRepository(read: Api, head: DraftPullRequestHead): Repository {
  const repo = repository(read, head.repository);
  if (repo.name !== head.repository || repo.base !== head.base_branch) return fail();
  return repo;
}

/** The canonical name and default branch of a repository that accepts a push. */
export function readPublicationRepository(
  name: string,
  runner: GithubCommandRunner = runGithubCommand,
  now: () => number = Date.now,
): PublicationRepository {
  const repo = repository(api(runner, now), name);
  return { repository: repo.name, base_branch: repo.base };
}

/** The one Draft PR of this exact head, or null. Any other observation throws and never means absent. */
export function findDraftPullRequest(
  head: DraftPullRequestHead,
  runner: GithubCommandRunner = runGithubCommand,
  now: () => number = Date.now,
): DraftPullRequest | null {
  headCheck(head);
  const read = api(runner, now);
  return find(read, head, headRepository(read, head));
}

/** Reuse the Draft PR of this exact head, or POST one. This operation never retries a POST. */
export function findOrCreateDraftPullRequest(
  draft: DraftPullRequestDraft,
  runner: GithubCommandRunner = runGithubCommand,
  now: () => number = Date.now,
): DraftPullRequestResult {
  headCheck(draft);
  if (!draft.title.trim() || draft.title.length > 256 || !draft.body.trim() || draft.body.length > 8000 || draft.body.includes('\0')) return fail();
  const read = api(runner, now);
  let repo: Repository;
  try {
    repo = headRepository(read, draft);
    const existing = find(read, draft, repo);
    if (existing) return { state: 'created', pr: existing };
  } catch {
    // This call has not attempted a POST. A retry must run lookup again.
    return { state: 'not_created' };
  }
  try {
    // --raw-field keeps @, braces, newlines and JSON-looking text literal.
    // This is the only mutation; the caller owns intent/result audit and replay.
    const raw = read('POST', `repos/${repo.name}/pulls`, [
      '--raw-field', `title=${draft.title}`, '--raw-field', `body=${draft.body}`,
      '--raw-field', `head=${draft.head_branch}`, '--raw-field', `base=${draft.base_branch}`, '--field', 'draft=true',
    ]);
    return { state: 'created', pr: exactPr(raw, repo, draft) };
  } catch {
    // Nonzero gh, timeout, permissions failure or bad response after POST
    // cannot establish that GitHub did not create the PR.
    return { state: 'unknown' };
  }
}
