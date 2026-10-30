/** Provider adapters for the #1023 finalization core. No credential reader or
 * alternate HTTP client: use the existing bounded GitHub command transport. */
import type { DocSessionPublicationTarget, DocSessionDraftPr, DocSessionPrCreateResult } from '../../core/operator/doc-session-finalize';
import { githubRemoteRepository } from '../../core/operator/docs';
import type { DocSessionRecordV1 } from '../../core/operator/doc-session-record';
import { runGithubCommand, type GithubCommandRunner } from '../github/issues';
import { docSessionGitRunner } from './doc-session-changes';
import { validDocsRef } from './docs-reader';
import type { DocSessionFinalizeDependencies } from './doc-session-finalize';

type Adapters = Pick<DocSessionFinalizeDependencies, 'publication_target' | 'find_draft_pr' | 'create_draft_pr'>;
const DEADLINE_MS = 15_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PAGES = 5;
const REPOSITORY = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/u;
const fail = (): never => { throw new Error('doc session GitHub observation unavailable or incompatible'); };
const object = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, any>;
};
function targetCheck(target: DocSessionPublicationTarget, branch?: string, commit?: string): void {
  if (!REPOSITORY.test(target.repository) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(target.remote)
    || !validDocsRef(`refs/heads/${target.base_branch}`)
    || (branch !== undefined && !/^docs\/[0-9a-f]{12}$/u.test(branch))
    || (commit !== undefined && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(commit))) fail();
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
    || object(row.permissions).push !== true || typeof row.default_branch !== 'string' || !validDocsRef(`refs/heads/${row.default_branch}`)) return fail();
  return { id: row.id, name: canonical, base: row.default_branch };
}
function exactPr(value: unknown, repo: Repository, target: DocSessionPublicationTarget, branch: string, commit: string): DocSessionDraftPr {
  const row = object(value), head = object(row.head), base = object(row.base);
  const headRepo = object(head.repo), baseRepo = object(base.repo);
  if (!Number.isSafeInteger(row.number) || row.number < 1 || row.html_url !== `https://github.com/${repo.name}/pull/${row.number}`
    || row.state !== 'open' || row.draft !== true || row.merged_at !== null
    || head.ref !== branch || head.sha !== commit || base.ref !== target.base_branch
    || headRepo.id !== repo.id || baseRepo.id !== repo.id || headRepo.full_name !== repo.name || baseRepo.full_name !== repo.name) return fail();
  // Core validates this URL against the persisted canonical repository name.
  if (target.repository !== repo.name) return fail();
  return { number: row.number, url: row.html_url };
}
function find(read: Api, target: DocSessionPublicationTarget, branch: string, commit: string, repo: Repository): DocSessionDraftPr | null {
  // Search the head across all bases. A PR whose base was changed must block a
  // new create instead of disappearing behind a base filter.
  const query = new URLSearchParams({ state: 'all', head: `${repo.name.split('/')[0]}:${branch}`, per_page: '100' });
  let found: DocSessionDraftPr | null = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const rows = read('GET', `repos/${repo.name}/pulls?${query}&page=${page}`);
    if (!Array.isArray(rows) || rows.length > 100) return fail();
    for (const row of rows) {
      const pr = exactPr(row, repo, target, branch, commit);
      if (found !== null) return fail(); // Duplicate or multiple historical PRs are ambiguous.
      found = pr;
    }
    if (rows.length < 100) return found;
  }
  return fail();
}
function targetRepository(read: Api, target: DocSessionPublicationTarget): Repository {
  const repo = repository(read, target.repository);
  if (repo.name !== target.repository || repo.base !== target.base_branch) return fail();
  return repo;
}

export function createDocSessionGithubAdapters(
  env: NodeJS.ProcessEnv,
  runner: GithubCommandRunner = runGithubCommand,
  now: () => number = Date.now,
): Adapters {
  return {
    publication_target: async (session: DocSessionRecordV1) => {
      const git = docSessionGitRunner(env).text;
      const names = git(session.worktree, ['remote']).trim().split('\n').filter(Boolean);
      if (names.length > 32) return fail();
      const candidates: Array<{ remote: string; repository: string }> = [];
      for (const remote of names) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(remote)) return fail();
        const fetchUrls = git(session.worktree, ['remote', 'get-url', '--all', remote]).trim().split('\n');
        const pushUrls = git(session.worktree, ['remote', 'get-url', '--push', '--all', remote]).trim().split('\n');
        const githubs = [...fetchUrls, ...pushUrls].map(githubRemoteRepository);
        if (githubs.every(name => name === null)) continue;
        if (fetchUrls.length !== 1 || pushUrls.length !== 1 || githubs[0] === null || githubs[0] !== githubs[1]) return fail();
        candidates.push({ remote, repository: githubs[0]! });
      }
      if (candidates.length !== 1) return fail();
      const selected = candidates[0]!;
      const repo = repository(api(runner, now), selected.repository);
      return { remote: selected.remote, repository: repo.name, base_branch: repo.base };
    },
    find_draft_pr: async (target, branch, commit) => {
      targetCheck(target, branch, commit);
      const read = api(runner, now);
      return find(read, target, branch, commit, targetRepository(read, target));
    },
    create_draft_pr: async (target, branch, commit, message): Promise<DocSessionPrCreateResult> => {
      targetCheck(target, branch, commit);
      if (!message.trim() || message.length > 8000 || message.includes('\0')) return fail();
      const read = api(runner, now);
      let repo: Repository;
      try {
        repo = targetRepository(read, target);
        const existing = find(read, target, branch, commit, repo);
        if (existing) return { state: 'created', pr: existing };
      } catch {
        // This call has not attempted a POST. A retry must run lookup again.
        return { state: 'not_created' };
      }
      try {
        const title = message.split(/\r?\n/u)[0]!.trim().slice(0, 256) || 'Doc session changes';
        // --raw-field keeps @, braces, newlines and JSON-looking text literal.
        // This is the only mutation; the core owns intent/result audit and replay.
        const raw = read('POST', `repos/${repo.name}/pulls`, [
          '--raw-field', `title=${title}`, '--raw-field', `body=${message}`,
          '--raw-field', `head=${branch}`, '--raw-field', `base=${target.base_branch}`, '--field', 'draft=true',
        ]);
        return { state: 'created', pr: exactPr(raw, repo, target, branch, commit) };
      } catch {
        // Nonzero gh, timeout, permissions failure or bad response after POST
        // cannot establish that GitHub did not create the PR.
        return { state: 'unknown' };
      }
    },
  };
}
