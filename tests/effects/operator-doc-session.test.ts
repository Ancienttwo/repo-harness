import { afterEach, expect, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { checkDocCitation, type DocCitationV1 } from '../../src/core/operator/doc-citation';
import { isManagedWorktreePath } from '../../src/effects/git/managed-worktree';
import { docSessionCreateRoute, OPERATOR_SESSIONS_ROUTE } from '../../src/effects/operator/doc-session';
import { DocsReader, type DocsFile } from '../../src/effects/operator/docs-reader';
import { OPERATOR_ROUTES, startOperatorServer, type OperatorRouteV1 } from '../../src/effects/operator/server';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';

/** The inventory entry that binds the session route in tests; production OPERATOR_ROUTES has none. */
const SESSIONS_INVENTORY: OperatorRouteV1 = { id: 'sessions_create', method: 'POST', pattern: OPERATOR_SESSIONS_ROUTE.source, write: true };
const GUIDE = '# Guide\n\nThe operator reads docs.\nIt never writes main.\n\n## Next\n\nMore text.\n';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

/** Stdout of a git command that must succeed. */
function git(args: string[], cwd: string): string {
  const result = run('git', args, cwd);
  expect(result.status).toBe(0);
  return result.stdout;
}

const hex = (text: string) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
const linesOf = (text: string) => text.match(/[^\n]*\n|[^\n]+$/gu) ?? [];

/** A citation built the way the browser builds it: the raw bytes of whole lines, with their line ends. */
function cite(text: string, path: string, start: number, end: number, commit: string): DocCitationV1 {
  return { path, start_line: start, end_line: end, range_sha256: hex(linesOf(text).slice(start - 1, end).join('')), file_sha256: hex(text), commit };
}

interface Harness {
  readonly repo: string;
  readonly repositoryId: string;
  readonly worktrees: string;
  readonly home: string;
  readonly url: string;
  head: () => string;
  commit: (text: string) => Promise<void>;
  post: (body: Record<string, unknown>) => Promise<{ status: number; body: Record<string, any>; text: string }>;
  branches: () => string[];
}

interface HarnessOptions {
  readonly session_id?: () => string;
  readonly platform?: NodeJS.Platform;
  /** Runs around each citation read of the route, so a test can hold or change the docs view mid-request. */
  readonly around_file?: (path: string, read: () => Promise<DocsFile>) => Promise<DocsFile>;
}

async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const repo = tmpWorkspace('operator-doc-session-repo'); initGitRepo(repo);
  mkdirSync(join(repo, 'docs'));
  writeFileSync(join(repo, 'docs', 'guide.md'), GUIDE);
  commitAll(repo, 'docs');
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD'], repo);
  const home = tmpWorkspace('operator-doc-session-home');
  const worktrees = realpathSync(tmpWorkspace('operator-doc-session-worktrees'));
  const staticRoot = tmpWorkspace('operator-doc-session-ui');
  writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
  const repositoryId = repoHarnessRepoIdFor(repo);
  const at = new Date().toISOString();
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [{
    id: repositoryId, path: repo, accessMode: 'read_only', source: 'manual', registeredAt: at, lastSeenAt: at,
  }] }));
  const env = { ...process.env, REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: worktrees };
  const reader = new DocsReader({ root: repo, ref: 'refs/remotes/origin/main', env });
  reader.start();
  await reader.refresh();
  const route = docSessionCreateRoute({
    env, docs_reader: (id) => {
      if (id !== repositoryId) return null;
      const around = options.around_file;
      return around ? { file: (path: string) => around(path, () => reader.file(path)) } as unknown as DocsReader : reader;
    },
    ...(options.session_id ? { new_session_id: options.session_id } : {}),
    // Doc sessions are macOS only; the CI runner's own platform must not decide these tests.
    platform: options.platform ?? 'darwin',
  });
  const server = await startOperatorServer({ port: 0, static_root: staticRoot, env, route_inventory: [...OPERATOR_ROUTES, SESSIONS_INVENTORY], write_routes: [route] });
  const cookie = ((await fetch(`${server.url}/`)).headers.get('set-cookie') ?? '').split(';')[0]!;
  cleanups.push(async () => {
    await server.close();
    reader.close();
    for (const dir of [repo, home, worktrees, staticRoot]) rmSync(dir, { recursive: true, force: true });
  });
  return {
    repo, repositoryId, worktrees, home, url: server.url,
    head: () => git(['rev-parse', 'refs/remotes/origin/main'], repo).trim(),
    commit: async (text) => {
      writeFileSync(join(repo, 'docs', 'guide.md'), text);
      commitAll(repo, 'edit docs');
      git(['update-ref', 'refs/remotes/origin/main', 'HEAD'], repo);
      await reader.refresh();
    },
    post: async (body) => {
      const response = await fetch(`${server.url}/api/v1/sessions`, {
        method: 'POST',
        headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, body: JSON.parse(text) as Record<string, any>, text };
    },
    branches: () => git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/docs/'], repo).split('\n').filter(Boolean),
  };
}

function request(h: Harness, citations: readonly DocCitationV1[], extra: Record<string, unknown> = {}) {
  return { request_id: randomUUID(), kind: 'docs', runtime: 'codex', repository_id: h.repositoryId, citations, instruction: 'Tighten the intro.', ...extra };
}

function sessionsDir(h: Harness): string { return join(h.home, 'operator', 'sessions'); }

test('a citation whose cited lines changed and whose text is gone is refused with 409 citation_stale, and nothing is created', async () => {
  const h = await harness();
  const citation = cite(GUIDE, 'docs/guide.md', 3, 4, h.head());
  await h.commit(GUIDE.replace('The operator reads docs.\nIt never writes main.\n', 'The operator reads and edits docs.\n'));
  const answer = await h.post(request(h, [citation]));
  expect(answer.status).toBe(409);
  expect(answer.body.error.code).toBe('citation_stale');
  expect(readdirSync(h.worktrees)).toEqual([]);
  expect(h.branches()).toEqual([]);
  expect(existsSync(sessionsDir(h))).toBe(false);
});

test('a citation of a file that left the docs tree is stale too', async () => {
  const h = await harness();
  const citation = cite(GUIDE, 'docs/old.md', 1, 1, h.head());
  const answer = await h.post(request(h, [citation]));
  expect(answer.status).toBe(409);
  expect(answer.body.error.code).toBe('citation_stale');
  expect(readdirSync(h.worktrees)).toEqual([]);
});

test('the session worktree is a direct child of the managed root on a docs branch at the cited commit, and the response names no path', async () => {
  const h = await harness();
  const base = h.head();
  const answer = await h.post(request(h, [cite(GUIDE, 'docs/guide.md', 3, 4, base)]));
  expect(answer.status).toBe(201);
  const { session_id, branch, worktree } = answer.body;
  expect(answer.body).toEqual({ protocol: 1, kind: 'operator_docs_session', session_id, state: 'created', repository_id: h.repositoryId, runtime: 'codex',
    branch, worktree, base_commit: base, citations: [{ path: 'docs/guide.md', start_line: 3, end_line: 4, relocated: false }] });
  expect(branch).toMatch(/^docs\/[0-9a-f]{12}$/u);
  expect(worktree).toBe(`${basename(h.repo)}-wt-docs-${branch.slice('docs/'.length)}`);
  const path = join(h.worktrees, worktree);
  expect(lstatSync(path).isSymbolicLink()).toBe(false);
  expect(isManagedWorktreePath(realpathSync(path), h.worktrees, basename(h.repo))).toBe(true);
  expect(readdirSync(h.worktrees)).toEqual([worktree]);
  expect(git(['worktree', 'list', '--porcelain'], h.repo)).toContain(`worktree ${realpathSync(path)}\n`);
  expect(git(['rev-parse', 'HEAD'], path).trim()).toBe(base);
  expect(git(['symbolic-ref', 'HEAD'], path).trim()).toBe(`refs/heads/${branch}`);
  for (const hidden of [h.repo, h.home, h.worktrees, '/tmp', '/private']) expect(answer.text).not.toContain(hidden);
  const record = join(sessionsDir(h), session_id, 'session.json');
  expect(statSync(record).mode & 0o777).toBe(0o600);
  expect(JSON.parse(readFileSync(record, 'utf8'))).toMatchObject({ protocol: 1, kind: 'docs_session', session_id, state: 'created', branch,
    worktree: realpathSync(path), base_commit: base, instruction: 'Tighten the intro.' });
});

test('a planned worktree path that already exists, even as a symlink out of the root, is refused and nothing is written there', async () => {
  const sessionId = 'a'.repeat(32);
  const h = await harness({ session_id: () => sessionId });
  const outside = tmpWorkspace('operator-doc-session-outside');
  cleanups.push(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, join(h.worktrees, `${basename(h.repo)}-wt-docs-${sessionId.slice(0, 12)}`));
  const answer = await h.post(request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())]));
  expect(answer.status).toBe(409);
  expect(answer.body.error.code).toBe('worktree_exists');
  expect(readdirSync(outside)).toEqual([]);
  expect(h.branches()).toEqual([]);
  expect(existsSync(sessionsDir(h))).toBe(false);
});

test('a git failure after the claim removes only the empty claim, and leaves no docs branch and no session record', async () => {
  const h = await harness();
  // A branch named `docs` makes every `docs/<slug>` ref impossible, so `git worktree add -b` fails after the claim.
  git(['branch', 'docs'], h.repo);
  const answer = await h.post(request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())]));
  expect(answer.status).toBe(409);
  expect(answer.body.error.code).toBe('reconcile_required');
  expect(readdirSync(h.worktrees)).toEqual([]);
  expect(h.branches()).toEqual([]);
  expect(git(['worktree', 'list', '--porcelain'], h.repo).match(/^worktree /gmu)).toHaveLength(1);
  expect(existsSync(sessionsDir(h))).toBe(false);
});

test('an existing docs/<slug> branch is refused before the claim', async () => {
  const sessionId = 'b'.repeat(32);
  const h = await harness({ session_id: () => sessionId });
  git(['branch', `docs/${sessionId.slice(0, 12)}`], h.repo);
  const answer = await h.post(request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())]));
  expect(answer.status).toBe(409);
  expect(answer.body.error.code).toBe('worktree_exists');
  expect(readdirSync(h.worktrees)).toEqual([]);
  expect(existsSync(sessionsDir(h))).toBe(false);
});

test('the request cannot choose a location: an unknown field, a path outside docs/ or a bad line range is refused before anything runs', async () => {
  const h = await harness();
  const good = cite(GUIDE, 'docs/guide.md', 1, 1, h.head());
  for (const body of [
    request(h, [good], { worktree: '/tmp/elsewhere' }),
    request(h, [good], { kind: 'worktree_cleanup' }),
    request(h, [{ ...good, path: 'src/index.ts' }]),
    request(h, [{ ...good, path: 'docs/../.git/config' }]),
    request(h, [{ ...good, start_line: 3, end_line: 2 }]),
    request(h, [{ ...good, extra: true } as DocCitationV1]),
    request(h, []),
    request(h, [good], { runtime: 'claude' }),
  ]) {
    const answer = await h.post(body);
    expect(answer.status).toBe(400);
    expect(answer.body.error.code).toBe('invalid_body');
  }
  expect(readdirSync(h.worktrees)).toEqual([]);
});

test('cited text that moved to other lines is accepted at its new lines', async () => {
  const h = await harness();
  const citation = cite(GUIDE, 'docs/guide.md', 3, 4, h.head());
  await h.commit(`Intro line.\n\n${GUIDE}`);
  const answer = await h.post(request(h, [citation]));
  expect(answer.status).toBe(201);
  expect(answer.body.citations).toEqual([{ path: 'docs/guide.md', start_line: 5, end_line: 6, relocated: true }]);
  expect(answer.body.base_commit).toBe(h.head());
});

test('the same request_id returns the stored session and creates one worktree', async () => {
  const h = await harness();
  const body = request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())]);
  const first = await h.post(body);
  const second = await h.post(body);
  expect(first.status).toBe(201);
  expect(second).toEqual(first);
  expect(readdirSync(h.worktrees)).toHaveLength(1);
  expect(h.branches()).toHaveLength(1);
});

test('doc sessions are macOS only for now', async () => {
  const h = await harness({ platform: 'linux' });
  const answer = await h.post(request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())]));
  expect(answer.status).toBe(501);
  expect(answer.body.error.code).toBe('platform_unsupported');
  expect(readdirSync(h.worktrees)).toEqual([]);
});

test('production routes still admit no write, so no session can be created through operator serve', () => {
  expect(OPERATOR_ROUTES.some(route => route.write || route.id === 'sessions_create')).toBe(false);
});

test('a citation check finds the cited lines, a unique move, or nothing', () => {
  const at = (start: number, end: number) => cite(GUIDE, 'docs/guide.md', start, end, 'c'.repeat(40));
  expect(checkDocCitation(at(3, 4), GUIDE)).toEqual({ state: 'current', start_line: 3, end_line: 4 });
  expect(checkDocCitation(at(3, 4), `x\n${GUIDE}`)).toEqual({ state: 'relocated', start_line: 4, end_line: 5 });
  // Two copies of the cited text: no unique place, so the user must cite again.
  const twice = `${GUIDE}The operator reads docs.\nIt never writes main.\n`;
  expect(checkDocCitation(at(3, 4), `x\n${twice}`)).toEqual({ state: 'stale' });
  // Lines past the end of the file.
  expect(checkDocCitation({ ...at(1, 1), start_line: 40, end_line: 41 }, GUIDE)).toEqual({ state: 'stale' });
  // The last line has no line end; its bytes are still a whole line.
  expect(checkDocCitation(cite('a\nb', 'docs/x.md', 2, 2, 'c'.repeat(40)), 'a\nb')).toEqual({ state: 'current', start_line: 2, end_line: 2 });
});

test('two concurrent creations for one repository give one 201 and one 503 busy, and leave one worktree and one branch', async () => {
  let entered!: () => void;
  const inside = new Promise<void>((resolve) => { entered = resolve; });
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let first = true;
  // The first request waits inside its citation read, so the second one arrives while it holds the repository.
  const h = await harness({ around_file: async (_path, read) => {
    if (first) { first = false; entered(); await hold; }
    return read();
  } });
  const citation = cite(GUIDE, 'docs/guide.md', 1, 1, h.head());
  const pending = h.post(request(h, [citation]));
  await inside;
  const second = await h.post(request(h, [citation]));
  release();
  const answer = await pending;
  expect(answer.status).toBe(201);
  expect(second.status).toBe(503);
  expect(second.body.error.code).toBe('busy');
  expect(readdirSync(h.worktrees)).toEqual([answer.body.worktree]);
  expect(h.branches()).toEqual([answer.body.branch]);
});

test('a citation may span 500 lines, and a citation of 501 lines is refused before anything runs', async () => {
  const h = await harness();
  const answer = await h.post(request(h, [{ ...cite(GUIDE, 'docs/guide.md', 1, 1, h.head()), start_line: 1, end_line: 501 }]));
  expect(answer.status).toBe(400);
  expect(answer.body.error.code).toBe('invalid_body');
  expect(readdirSync(h.worktrees)).toEqual([]);
  expect(h.branches()).toEqual([]);
  expect(existsSync(sessionsDir(h))).toBe(false);
  const long = Array.from({ length: 500 }, (_, index) => `line ${index + 1}\n`).join('');
  await h.commit(long);
  const accepted = await h.post(request(h, [cite(long, 'docs/guide.md', 1, 500, h.head())]));
  expect(accepted.status).toBe(201);
  expect(accepted.body.citations).toEqual([{ path: 'docs/guide.md', start_line: 1, end_line: 500, relocated: false }]);
});

test('a claim that git filled before it failed is kept, and the result is reconcile_required', async () => {
  const h = await harness();
  // The hook runs after the checkout is written, and its failure fails `git worktree add`.
  writeFileSync(join(h.repo, '.git', 'hooks', 'post-checkout'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const answer = await h.post(request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())]));
  expect(answer.status).toBe(409);
  expect(answer.body.error.code).toBe('reconcile_required');
  const kept = readdirSync(h.worktrees);
  expect(kept).toHaveLength(1);
  expect(readdirSync(join(h.worktrees, kept[0]!)).length).toBeGreaterThan(0);
  expect(existsSync(sessionsDir(h))).toBe(false);
});

test('a docs view refresh between two citations of one request refuses it, and nothing is created', async () => {
  let reads = 0;
  let h!: Harness;
  h = await harness({ around_file: async (_path, read) => {
    const file = await read();
    if (++reads === 1) await h.commit(`${GUIDE}Added later.\n`);
    return file;
  } });
  const base = h.head();
  const answer = await h.post(request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, base), cite(GUIDE, 'docs/guide.md', 3, 4, base)]));
  expect(reads).toBe(2);
  expect(answer.status).toBe(503);
  expect(answer.body.error.code).toBe('docs_unavailable');
  expect(readdirSync(h.worktrees)).toEqual([]);
  expect(h.branches()).toEqual([]);
  expect(existsSync(sessionsDir(h))).toBe(false);
});

