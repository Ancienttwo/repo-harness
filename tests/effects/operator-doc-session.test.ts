import { afterEach, expect, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync, writeSync } from 'node:fs';
import { basename, join } from 'node:path';
import { checkDocCitation, DOC_CITATION_BUDGET_CHARS, DOC_CITATION_BUDGET_HASHES, docCitationBudget, type DocCitationV1 } from '../../src/core/operator/doc-citation';
import { DOC_SESSION_EVENT_TEXT_MAX_BYTES, DOC_SESSION_EVENTS_PAGE, DOC_SESSION_POLL_MS, type DocSessionEventInput } from '../../src/core/operator/doc-session-events';
import { OPERATOR_DOCS_TREE_KIND, type DocsTreeV1 } from '../../src/core/operator/docs';
import { isManagedWorktreePath } from '../../src/effects/git/managed-worktree';
import { GIT_KILL_GRACE_MS, gitExecFile, GitExecError } from '../../src/effects/git/runner';
import { docSessionCreateRoute } from '../../src/effects/operator/doc-session';
import { appendDocSessionEvents, OPERATOR_SESSION_EVENTS_ROUTE } from '../../src/effects/operator/doc-session-events';
import { DocsReader, type DocsFile } from '../../src/effects/operator/docs-reader';
import { OPERATOR_ROUTES, startOperatorServer } from '../../src/effects/operator/server';
import { withWorktreeTopologyLockAsync } from '../../src/effects/state/coordination-worktree-topology';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';

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
  readonly env: NodeJS.ProcessEnv;
  /** Session ids whose agent the route started, in order. */
  readonly launches: string[];
  head: () => string;
  commit: (text: string) => Promise<void>;
  post: (body: Record<string, unknown>) => Promise<{ status: number; body: Record<string, any>; text: string }>;
  branches: () => string[];
}

interface HarnessOptions {
  readonly session_id?: () => string;
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  /** Serve only the production GET inventory, without the test session events entry. */
  /** Runs around each citation read of the route, so a test can hold or change the docs view mid-request. */
  readonly around_file?: (path: string, read: () => Promise<DocsFile>) => Promise<DocsFile>;
  /** The runtimes with the docs use in the agent settings; codex by default. */
  readonly docs_runtimes?: readonly string[];
}

/** The agent settings live under HOME; each harness gives HOME its own temporary root. */
function writeAgentsSettings(home: string, docs: readonly string[]): void {
  mkdirSync(join(home, '.repo-harness'), { recursive: true });
  writeFileSync(join(home, '.repo-harness', 'config.json'), JSON.stringify({ agents: { enabled: [...docs], uses: { docs: [...docs], review: [] }, default_docs: null } }));
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
  const userHome = tmpWorkspace('operator-doc-session-user');
  writeAgentsSettings(userHome, options.docs_runtimes ?? ['codex']);
  const env = { ...process.env, ...options.env, HOME: userHome, REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: worktrees };
  const reader = new DocsReader({ root: repo, ref: 'refs/remotes/origin/main', env });
  reader.start();
  await reader.refresh();
  const launches: string[] = [];
  const route = docSessionCreateRoute({
    // The route test records the launch; tests/doc-session-agent.test.ts runs the real docs host.
    launch_agent: (sessionId) => { launches.push(sessionId); return 'starting'; },
    env, docs_reader: (id) => {
      if (id !== repositoryId) return null;
      const around = options.around_file;
      return around ? { file: (path: string) => around(path, () => reader.file(path)) } as unknown as DocsReader : reader;
    },
    ...(options.session_id ? { new_session_id: options.session_id } : {}),
    // Doc sessions are macOS only; the CI runner's own platform must not decide these tests.
    platform: options.platform ?? 'darwin',
  });
  const server = await startOperatorServer({ port: 0, static_root: staticRoot, env, write_routes: [route] });
  const cookie = ((await fetch(`${server.url}/`)).headers.get('set-cookie') ?? '').split(';')[0]!;
  cleanups.push(async () => {
    await server.close();
    reader.close();
    for (const dir of [repo, home, userHome, worktrees, staticRoot]) rmSync(dir, { recursive: true, force: true });
  });
  return {
    repo, repositoryId, worktrees, home, url: server.url, env, launches,
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
    branch, worktree, base_commit: base, citations: [{ path: 'docs/guide.md', start_line: 3, end_line: 4, relocated: false }], agent: 'starting' });
  // The agent starts once, after the session record exists.
  expect(h.launches).toEqual([session_id]);
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
    request(h, [good], { runtime: 'Not A Runtime' }),
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
  const record = JSON.parse(readFileSync(join(sessionsDir(h), answer.body.session_id, 'session.json'), 'utf8'));
  expect(record.citations[0]).toMatchObject(citation);
  const resolved = record.citations[0].resolved;
  expect(resolved).toEqual(cite(`Intro line.\n\n${GUIDE}`, citation.path, 5, 6, h.head()));
  const savedText = git(['show', `${resolved.commit}:${resolved.path}`], h.repo);
  expect(hex(savedText)).toBe(resolved.file_sha256);
  expect(hex(linesOf(savedText).slice(resolved.start_line - 1, resolved.end_line).join(''))).toBe(resolved.range_sha256);
});

test('an unchanged citation range retains its source and records the new file revision', async () => {
  const h = await harness();
  const citation = cite(GUIDE, 'docs/guide.md', 3, 4, h.head());
  const updated = `${GUIDE}An added conclusion.\n`;
  await h.commit(updated);
  const answer = await h.post(request(h, [citation]));
  expect(answer.status).toBe(201);
  expect(answer.body.citations).toEqual([{ path: citation.path, start_line: 3, end_line: 4, relocated: false }]);
  const record = JSON.parse(readFileSync(join(sessionsDir(h), answer.body.session_id, 'session.json'), 'utf8'));
  expect(record.citations[0]).toMatchObject(citation);
  expect(record.citations[0].resolved).toEqual(cite(updated, citation.path, 3, 4, h.head()));
});

test('the same request_id returns the stored session and creates one worktree', async () => {
  const h = await harness();
  const body = request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())]);
  const first = await h.post(body);
  const second = await h.post(body);
  expect(first.status).toBe(201);
  expect(second).toEqual(first);
  expect(h.launches).toHaveLength(1);
  expect(readdirSync(h.worktrees)).toHaveLength(1);
  expect(h.branches()).toHaveLength(1);
});

test('a runtime without verified docs isolation or without the docs use is refused with 422 before any worktree', async () => {
  const unverified = await harness({ docs_runtimes: ['claude', 'codex'] });
  const refused = await unverified.post(request(unverified, [cite(GUIDE, 'docs/guide.md', 1, 1, unverified.head())], { runtime: 'claude' }));
  expect([refused.status, refused.body.error.code]).toEqual([422, 'docs_isolation_unverified']);
  expect(unverified.launches).toEqual([]);
  expect(readdirSync(unverified.worktrees)).toEqual([]);
  expect(existsSync(sessionsDir(unverified))).toBe(false);

  const off = await harness({ docs_runtimes: [] });
  const notEnabled = await off.post(request(off, [cite(GUIDE, 'docs/guide.md', 1, 1, off.head())]));
  expect([notEnabled.status, notEnabled.body.error.code]).toEqual([422, 'runtime_not_enabled']);
  expect(readdirSync(off.worktrees)).toEqual([]);
  expect(off.branches()).toEqual([]);
  expect(existsSync(sessionsDir(off))).toBe(false);
});

test('doc sessions are macOS only for now', async () => {
  const h = await harness({ platform: 'linux' });
  const answer = await h.post(request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())]));
  expect(answer.status).toBe(501);
  expect(answer.body.error.code).toBe('platform_unsupported');
  expect(readdirSync(h.worktrees)).toEqual([]);
});

test('production routes admit exactly the settings, worktree cleanup, session create, message and stop writes', () => {
  expect(OPERATOR_ROUTES.filter(route => route.write).map(route => route.id)).toEqual(['worktrees_cleanup', 'settings_agents_write', 'sessions_create', 'sessions_messages', 'sessions_stop']);
});

test('a citation check finds the cited lines, a unique move, or nothing', () => {
  const at = (start: number, end: number) => cite(GUIDE, 'docs/guide.md', start, end, 'c'.repeat(40));
  expect(checkDocCitation(at(3, 4), GUIDE, docCitationBudget())).toEqual({ state: 'current', start_line: 3, end_line: 4 });
  expect(checkDocCitation(at(3, 4), `x\n${GUIDE}`, docCitationBudget())).toEqual({ state: 'relocated', start_line: 4, end_line: 5 });
  // Two copies of the cited text: no unique place, so the user must cite again.
  const twice = `${GUIDE}The operator reads docs.\nIt never writes main.\n`;
  expect(checkDocCitation(at(3, 4), `x\n${twice}`, docCitationBudget())).toEqual({ state: 'stale' });
  // Lines past the end of the file.
  expect(checkDocCitation({ ...at(1, 1), start_line: 40, end_line: 41 }, GUIDE, docCitationBudget())).toEqual({ state: 'stale' });
  // The last line has no line end; its bytes are still a whole line.
  expect(checkDocCitation(cite('a\nb', 'docs/x.md', 2, 2, 'c'.repeat(40)), 'a\nb', docCitationBudget())).toEqual({ state: 'current', start_line: 2, end_line: 2 });
});

test('a relocation that needs more hashes or more hashed text than the request budget stops as over_budget', () => {
  // One cited line moved past more candidate lines than the hash count allows.
  const filler = 'x\n'.repeat(DOC_CITATION_BUDGET_HASHES);
  const moved = cite('target\n', 'docs/x.md', 1, 1, 'c'.repeat(40));
  expect(checkDocCitation(moved, `${filler}target\n`, docCitationBudget())).toEqual({ state: 'over_budget' });
  // The same move below the cap is found.
  expect(checkDocCitation(moved, `${'x\n'.repeat(1_000)}target\n`, docCitationBudget())).toEqual({ state: 'relocated', start_line: 1_001, end_line: 1_001 });
  // A 500-line range moved down: each candidate hashes the whole range, so the text cap ends the check first.
  const block = Array.from({ length: 500 }, (_, index) => `${String(index).padStart(4, '0')} ${'b'.repeat(100)}\n`).join('');
  const range = cite(block, 'docs/x.md', 1, 500, 'c'.repeat(40));
  // Filler lines as long as the cited ones, so every candidate range is as long as the citation.
  const shifted = `${`${'y'.repeat(105)}\n`.repeat(400)}${block}`;
  expect(400 * block.length).toBeGreaterThan(DOC_CITATION_BUDGET_CHARS);
  expect(checkDocCitation(range, shifted, docCitationBudget())).toEqual({ state: 'over_budget' });
  // Only the budget refuses it: a larger one finds the unique move.
  expect(checkDocCitation(range, shifted, { hashes: 1_000, chars: 1_000 * block.length })).toEqual({ state: 'relocated', start_line: 401, end_line: 900 });
  // The checks of one request share the budget: a spent budget refuses even a current citation.
  expect(checkDocCitation(range, block, { hashes: 0, chars: DOC_CITATION_BUDGET_CHARS })).toEqual({ state: 'over_budget' });
  expect(checkDocCitation(range, block, { hashes: 1, chars: block.length })).toEqual({ state: 'current', start_line: 1, end_line: 500 });
});

test('a citation whose relocation exceeds the request hash budget is refused with 409 citation_stale before any git work, and nothing is created', async () => {
  const h = await harness();
  const block = Array.from({ length: 500 }, (_, index) => `${String(index).padStart(4, '0')} ${'b'.repeat(100)}\n`).join('');
  await h.commit(block);
  const citation = cite(block, 'docs/guide.md', 1, 500, h.head());
  await h.commit(`${`${'y'.repeat(105)}\n`.repeat(400)}${block}`);
  const answer = await h.post(request(h, [citation]));
  expect(answer.status).toBe(409);
  expect(answer.body.error.code).toBe('citation_stale');
  expect(readdirSync(h.worktrees)).toEqual([]);
  expect(h.branches()).toEqual([]);
  expect(existsSync(sessionsDir(h))).toBe(false);
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

test('git variables that select another repository do not move the branch or the worktree there', async () => {
  const other = tmpWorkspace('operator-doc-session-other'); initGitRepo(other);
  writeFileSync(join(other, 'README.md'), 'other');
  commitAll(other, 'other');
  cleanups.push(() => rmSync(other, { recursive: true, force: true }));
  const h = await harness({ env: { GIT_DIR: join(other, '.git'), GIT_COMMON_DIR: join(other, '.git'), GIT_WORK_TREE: other } });
  const answer = await h.post(request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())]));
  expect(answer.status).toBe(201);
  expect(h.branches()).toEqual([answer.body.branch]);
  expect(git(['worktree', 'list', '--porcelain'], h.repo)).toContain(`worktree ${realpathSync(join(h.worktrees, answer.body.worktree))}\n`);
  expect(git(['for-each-ref', '--format=%(refname)', 'refs/heads/docs/'], other)).toBe('');
  expect(git(['worktree', 'list', '--porcelain'], other).match(/^worktree /gmu)).toHaveLength(1);
});

/** An executable that runs `body` and then the real git with the same arguments. */
function gitWrapper(prefix: string, body: (gate: string) => string[]): { readonly gate: string; readonly wrapper: string } {
  const realGit = Bun.which('git');
  expect(realGit).not.toBeNull();
  const gate = tmpWorkspace(prefix);
  cleanups.push(() => rmSync(gate, { recursive: true, force: true }));
  const wrapper = join(gate, 'git');
  writeFileSync(wrapper, ['#!/bin/sh', ...body(gate), `exec '${realGit}' "$@"`, ''].join('\n'), { mode: 0o755 });
  return { gate, wrapper };
}

test('a held `git rev-parse --git-common-dir` or `git worktree add` keeps the server answering: a health read completes while the creation waits', async () => {
  // Once armed, the wrapper holds each named call until the test releases it.
  const hold = (gate: string, name: string, test: string) => [
    `if [ -e '${gate}/armed' ] && ${test}; then`,
    `  : > '${gate}/started-${name}'`,
    `  while [ ! -e '${gate}/release-${name}' ]; do sleep 0.02; done`,
    'fi',
  ];
  const { gate, wrapper } = gitWrapper('operator-doc-session-git-gate', (dir) => [
    ...hold(dir, 'common', '[ "$1" = rev-parse ] && [ "$2" = --git-common-dir ]'),
    ...hold(dir, 'checkout', '[ "$1" = worktree ] && [ "$2" = add ]'),
  ]);
  const h = await harness({ env: { REPO_HARNESS_GIT_BIN: wrapper } });
  const topologyLock = join(h.repo, '.git', 'repo-harness', 'coordination', 'locks', 'worktree-topology.lock');
  writeFileSync(join(gate, 'armed'), '');
  let settled = false;
  const creation = h.post(request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())])).finally(() => { settled = true; });

  // The common directory lookup runs before the topology lock is taken.
  while (!existsSync(join(gate, 'started-common'))) await Bun.sleep(10);
  expect((await fetch(`${h.url}/healthz`)).status).toBe(200);
  expect(settled).toBe(false);
  expect(existsSync(join(gate, 'started-checkout'))).toBe(false);
  writeFileSync(join(gate, 'release-common'), '');

  while (!existsSync(join(gate, 'started-checkout'))) await Bun.sleep(10);
  expect((await fetch(`${h.url}/healthz`)).status).toBe(200);
  expect(settled).toBe(false);
  // The topology lock stays held across the awaited checkout.
  expect(existsSync(topologyLock)).toBe(true);
  writeFileSync(join(gate, 'release-checkout'), '');

  const answer = await creation;
  expect(answer.status).toBe(201);
  expect(h.branches()).toEqual([answer.body.branch]);
  expect(readdirSync(h.worktrees)).toEqual([answer.body.worktree]);
  expect(existsSync(topologyLock)).toBe(false);
});

test('a git call that ignores SIGTERM is killed after the grace period, the call rejects after the child is gone, and the topology lock is released', async () => {
  const { gate, wrapper } = gitWrapper('operator-doc-session-git-hang', (dir) => [
    'if [ "$1" = hang ]; then',
    "  trap '' TERM",
    `  echo $$ > '${dir}/pid'`,
    '  exec sleep 30',
    'fi',
  ]);
  const repo = tmpWorkspace('operator-doc-session-hang-repo'); initGitRepo(repo);
  cleanups.push(() => rmSync(repo, { recursive: true, force: true }));
  const topologyLock = join(repo, '.git', 'repo-harness', 'coordination', 'locks', 'worktree-topology.lock');
  const timeout = 200;
  let lockHeld = false;
  const began = Date.now();
  const failure = await withWorktreeTopologyLockAsync(repo, () => {
    lockHeld = existsSync(topologyLock);
    return gitExecFile(['hang'], { cwd: repo, gitBin: wrapper, timeout });
  }, { gitBin: wrapper }).then(() => null, (error: unknown) => error);
  const elapsed = Date.now() - began;

  expect(lockHeld).toBe(true);
  expect(failure).toBeInstanceOf(GitExecError);
  expect((failure as GitExecError).timedOut).toBe(true);
  // SIGTERM is ignored, so only the SIGKILL after the grace period ends the child.
  expect(elapsed).toBeGreaterThanOrEqual(timeout + GIT_KILL_GRACE_MS);
  expect(elapsed).toBeLessThan(timeout + GIT_KILL_GRACE_MS + 5_000);
  const pid = Number(readFileSync(join(gate, 'pid'), 'utf8'));
  expect(() => process.kill(pid, 0)).toThrow();
  expect(existsSync(topologyLock)).toBe(false);
});

test('a `show-ref` probe that fails other than with exit 1 ends the creation before the claim, and nothing is created', async () => {
  const { wrapper } = gitWrapper('operator-doc-session-git-show-ref', () => ['if [ "$1" = show-ref ]; then exit 128; fi']);
  const h = await harness({ env: { REPO_HARNESS_GIT_BIN: wrapper } });
  const answer = await h.post(request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())]));
  expect(answer.status).toBe(409);
  expect(answer.body.error.code).toBe('reconcile_required');
  expect(readdirSync(h.worktrees)).toEqual([]);
  expect(h.branches()).toEqual([]);
  expect(existsSync(sessionsDir(h))).toBe(false);
});

const AT = '2026-10-27T12:00:00.000Z';
const message = (epoch: number, seq: number, text: string): DocSessionEventInput => ({ epoch, seq, at: AT, type: 'message', role: 'agent', text });
const turn = (epoch: number, seq: number, boundary: 'started' | 'ended'): DocSessionEventInput => ({ epoch, seq, at: AT, type: 'turn', boundary });
const tool = (epoch: number, seq: number, paths: string[]): DocSessionEventInput => ({ epoch, seq, at: AT, type: 'tool', category: 'read', status: 'succeeded', paths });
const eventsFile = (h: Harness, sid: string) => join(sessionsDir(h), sid, 'events.jsonl');

async function createdSession(h: Harness): Promise<string> {
  const answer = await h.post(request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())]));
  expect(answer.status).toBe(201);
  return answer.body.session_id;
}

async function readEvents(h: Harness, sid: string, after?: string) {
  const query = after === undefined ? '' : `?after=${encodeURIComponent(after)}`;
  const response = await fetch(`${h.url}/api/v1/sessions/${sid}/events${query}`);
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text) as Record<string, any>, text };
}

// Built at run time, so no literal credential sits in the repository.
const SECRET_SAMPLES = {
  openai: `sk-${'a1B2'.repeat(8)}`,
  github: `ghp_${'Z9y8'.repeat(9)}`,
  aws: `AKIA${'Q7'.repeat(8)}`,
  bearer: `t0k${'e'.repeat(24)}`,
  jwt: `eyJ${'h'.repeat(12)}.${'p'.repeat(12)}.${'s'.repeat(12)}`,
  key: `MIIB${'x'.repeat(24)}`,
  password: `p4ss${'w'.repeat(8)}`,
  assignment: `hunter2-${'v'.repeat(8)}`,
};

test('the host writer redacts events before they reach events.jsonl, and no secret sample reaches the file or a response', async () => {
  const h = await harness();
  const sid = await createdSession(h);
  const s = SECRET_SAMPLES;
  appendDocSessionEvents(h.env, sid, [
    message(1, 0, [
      `Read ${s.openai} and ${s.github} from /Users/someone/private/notes.md.`,
      `Authorization: Bearer ${s.bearer}`,
      s.jwt,
      `-----BEGIN PRIVATE KEY-----\n${s.key}\n-----END PRIVATE KEY-----`,
      `Push to https://user:${s.password}@example.com/repo.git`,
    ].join('\n')),
    message(1, 1, `DATABASE_PASSWORD=${s.assignment}`),
    tool(1, 2, [`docs/${s.aws}.md`, 'docs/guide.md', 'app/[slug]/page.tsx', 'src/app/(group)/page.tsx']),
  ]);
  const raw = readFileSync(eventsFile(h, sid), 'utf8');
  expect(statSync(eventsFile(h, sid)).mode & 0o777).toBe(0o600);
  const page = await readEvents(h, sid);
  expect(page.status).toBe(200);
  for (const sample of [...Object.values(s), '/Users/someone']) {
    expect(raw).not.toContain(sample);
    expect(page.text).not.toContain(sample);
  }
  for (const hidden of [h.repo, h.home, h.worktrees]) expect(page.text).not.toContain(hidden);
  const [first, second, third] = page.body.events;
  expect(first.text).toContain('sk-[REDACTED]');
  expect(first.text).toContain('[private path]');
  // A secret that no replacement rule removes withholds the whole text.
  expect(second.text).not.toContain('DATABASE_PASSWORD');
  expect(third.paths).toEqual(['docs/AKIA[REDACTED].md', 'docs/guide.md', 'app/[slug]/page.tsx', 'src/app/(group)/page.tsx']);
});

test('an event field outside the schema, such as raw tool arguments, a command, terminal output or the environment, is refused and nothing is written', async () => {
  const h = await harness();
  const sid = await createdSession(h);
  const extras = [{ arguments: { path: 'docs/guide.md' } }, { command: 'cat docs/guide.md' }, { output: 'stdout text' }, { env: { HOME: '/Users/someone' } }];
  for (const extra of extras) {
    expect(() => appendDocSessionEvents(h.env, sid, [{ ...tool(1, 0, ['docs/guide.md']), ...extra } as DocSessionEventInput])).toThrow();
  }
  for (const path of ['/etc/passwd', '../outside.md', 'docs/../../x', 'docs\\guide.md', 'C:/x.md', '~/.ssh/id_rsa', '']) {
    expect(() => appendDocSessionEvents(h.env, sid, [tool(1, 0, [path])])).toThrow();
  }
  // `at` is a strict UTC timestamp, so it cannot carry free text that a date parser skips.
  for (const at of [`(${SECRET_SAMPLES.github}) 2020`, '(/Users/someone/.ssh/id_rsa) 2020', '2026-10-27', '2026-10-27T12:00:00Z', '2026-02-30T12:00:00.000Z']) {
    expect(() => appendDocSessionEvents(h.env, sid, [{ ...message(1, 0, 'ok'), at }])).toThrow();
  }
  // One bad event refuses the whole batch.
  expect(() => appendDocSessionEvents(h.env, sid, [message(1, 0, 'ok'), { ...message(1, 1, 'ok'), command: 'ls' } as unknown as DocSessionEventInput])).toThrow();
  expect(existsSync(eventsFile(h, sid))).toBe(false);
  expect((await readEvents(h, sid)).body.events).toEqual([]);
});

test('the epoch.seq cursor orders events across host restarts, and an event that does not move the cursor forward is refused', async () => {
  const h = await harness();
  const sid = await createdSession(h);
  appendDocSessionEvents(h.env, sid, [message(1, 0, 'a'), message(1, 1, 'b'), message(1, 2, 'c')]);
  // The host restarted: OAR counts seq from 0 again, in a new epoch.
  appendDocSessionEvents(h.env, sid, [message(2, 0, 'd'), message(2, 1, 'e')]);
  const all = await readEvents(h, sid);
  expect(all.body.events.map((e: { text: string }) => e.text)).toEqual(['a', 'b', 'c', 'd', 'e']);
  expect(all.body).toMatchObject({ after: null, next_cursor: '2.1', complete: true });
  const tail = await readEvents(h, sid, '1.1');
  expect(tail.body.events.map((e: { epoch: number; seq: number }) => `${e.epoch}.${e.seq}`)).toEqual(['1.2', '2.0', '2.1']);
  expect((await readEvents(h, sid, '2.1')).body).toMatchObject({ events: [], after: '2.1', next_cursor: '2.1', complete: true });
  const before = readFileSync(eventsFile(h, sid), 'utf8');
  for (const stale of [[message(1, 5, 'late')], [message(2, 1, 'again')], [message(2, 3, 'x'), message(2, 2, 'y')]]) {
    expect(() => appendDocSessionEvents(h.env, sid, stale)).toThrow();
  }
  expect(readFileSync(eventsFile(h, sid), 'utf8')).toBe(before);
});

test('the session is running between turn boundaries and idle otherwise, which picks the 1 s or the 30 s poll', async () => {
  const h = await harness();
  const sid = await createdSession(h);
  expect(DOC_SESSION_POLL_MS).toEqual({ running: 1_000, idle: 30_000 });
  expect((await readEvents(h, sid)).body.activity).toBe('idle');
  appendDocSessionEvents(h.env, sid, [turn(1, 0, 'started'), message(1, 1, 'working')]);
  // Activity covers the whole log, not only the page after the cursor.
  expect((await readEvents(h, sid, '1.1')).body).toMatchObject({ events: [], activity: 'running' });
  appendDocSessionEvents(h.env, sid, [turn(1, 2, 'ended')]);
  expect((await readEvents(h, sid)).body.activity).toBe('idle');
});

test('a page holds at most DOC_SESSION_EVENTS_PAGE events, and its next_cursor reads the rest', async () => {
  const h = await harness();
  const sid = await createdSession(h);
  appendDocSessionEvents(h.env, sid, Array.from({ length: DOC_SESSION_EVENTS_PAGE + 50 }, (_, seq) => message(1, seq, `m${seq}`)));
  const first = await readEvents(h, sid);
  expect(first.body.events).toHaveLength(DOC_SESSION_EVENTS_PAGE);
  expect(first.body).toMatchObject({ complete: false, next_cursor: `1.${DOC_SESSION_EVENTS_PAGE - 1}` });
  const second = await readEvents(h, sid, first.body.next_cursor);
  expect(second.body.events).toHaveLength(50);
  expect(second.body).toMatchObject({ complete: true, next_cursor: `1.${DOC_SESSION_EVENTS_PAGE + 49}` });
});

test('message text over the byte limit is cut after redaction and marked truncated', async () => {
  const h = await harness();
  const sid = await createdSession(h);
  // The secret sits across the cut, so redaction must run on the whole text first.
  const text = `${'x'.repeat(DOC_SESSION_EVENT_TEXT_MAX_BYTES - 15)}${SECRET_SAMPLES.openai} ${'y'.repeat(100)}`;
  appendDocSessionEvents(h.env, sid, [message(1, 0, text)]);
  const [event] = (await readEvents(h, sid)).body.events;
  expect(event.truncated).toBe(true);
  expect(Buffer.byteLength(event.text)).toBeLessThanOrEqual(DOC_SESSION_EVENT_TEXT_MAX_BYTES);
  expect(readFileSync(eventsFile(h, sid), 'utf8')).not.toContain(SECRET_SAMPLES.openai.slice(0, 12));
  // A cut inside a replacement leaves text that matches its rule again; the cut text is withheld, not refused.
  const bearer = `${'x'.repeat(DOC_SESSION_EVENT_TEXT_MAX_BYTES - 'Authorization: Bearer [RE'.length)}Authorization: Bearer ${SECRET_SAMPLES.bearer}`;
  appendDocSessionEvents(h.env, sid, [message(1, 1, bearer)]);
  const cut = (await readEvents(h, sid, '1.0')).body.events[0];
  expect(cut).toMatchObject({ truncated: true });
  expect(cut.text).not.toContain('Bearer');
  expect(readFileSync(eventsFile(h, sid), 'utf8')).not.toContain(SECRET_SAMPLES.bearer);
});

test('a last line without its newline is skipped by the reader and refused by the writer, and a symlinked log is refused', async () => {
  const h = await harness();
  const sid = await createdSession(h);
  appendDocSessionEvents(h.env, sid, [message(1, 0, 'kept')]);
  const torn = `${readFileSync(eventsFile(h, sid), 'utf8')}{"protocol":1,"epoch":1,"seq":1`;
  writeFileSync(eventsFile(h, sid), torn, { mode: 0o600 });
  const page = await readEvents(h, sid);
  expect(page.status).toBe(200);
  expect(page.body.events.map((e: { text: string }) => e.text)).toEqual(['kept']);
  expect(() => appendDocSessionEvents(h.env, sid, [message(1, 2, 'next')])).toThrow();
  expect(readFileSync(eventsFile(h, sid), 'utf8')).toBe(torn);

  const other = await createdSession(h);
  const outside = join(h.home, 'outside.jsonl');
  writeFileSync(outside, `${JSON.stringify({ protocol: 1, epoch: 1, seq: 0, at: AT, type: 'message', role: 'agent', text: 'outside', truncated: false })}\n`, { mode: 0o600 });
  symlinkSync(outside, eventsFile(h, other));
  const linked = await readEvents(h, other);
  expect(linked.status).toBe(503);
  expect(linked.text).not.toContain('outside');
  expect(() => appendDocSessionEvents(h.env, other, [message(1, 1, 'x')])).toThrow();
  expect(readFileSync(outside, 'utf8')).not.toContain('"x"');
});

test('a sessions directory or a session directory that is a symlink is refused for the session record and for events', async () => {
  const h = await harness();
  const sid = await createdSession(h);
  // `operator/sessions` now points at a directory outside that holds <sid>/session.json.
  const elsewhere = join(h.home, 'elsewhere');
  renameSync(sessionsDir(h), elsewhere);
  symlinkSync(elsewhere, sessionsDir(h));
  const read = await readEvents(h, sid);
  expect(read.status).toBe(503);
  expect(read.body.code).toBe('events_unavailable');
  expect(() => appendDocSessionEvents(h.env, sid, [message(1, 0, 'x')])).toThrow();
  expect(existsSync(join(elsewhere, sid, 'events.jsonl'))).toBe(false);
  const created = await h.post(request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())]));
  expect(created.status).toBe(409);
  expect(created.body.error.code).toBe('reconcile_required');
  expect(readdirSync(elsewhere)).toEqual([sid]);

  // A real sessions directory whose <sid> entry is a symlink to another session directory.
  rmSync(sessionsDir(h));
  mkdirSync(sessionsDir(h), { mode: 0o700 });
  symlinkSync(join(elsewhere, sid), join(sessionsDir(h), sid));
  expect((await readEvents(h, sid)).status).not.toBe(200);
  expect(() => appendDocSessionEvents(h.env, sid, [message(1, 0, 'x')])).toThrow();
  expect(existsSync(join(elsewhere, sid, 'events.jsonl'))).toBe(false);
});

test('a write that fails part way through a batch leaves the log at its old length, and a later append succeeds', async () => {
  const h = await harness();
  const sid = await createdSession(h);
  appendDocSessionEvents(h.env, sid, [message(1, 0, 'a')]);
  const before = readFileSync(eventsFile(h, sid), 'utf8');
  let calls = 0;
  const write = (fd: number, data: Buffer, offset: number, length: number): number => {
    calls += 1;
    if (calls === 1) return writeSync(fd, data, offset, Math.floor(length / 2));
    throw Object.assign(new Error('no space left'), { code: 'ENOSPC' });
  };
  let failure: unknown;
  try { appendDocSessionEvents(h.env, sid, [message(1, 1, 'b'), message(1, 2, 'c')], { write }); } catch (error) { failure = error; }
  expect(calls).toBe(2);
  expect((failure as { code?: string }).code).toBe('events_unavailable');
  expect(readFileSync(eventsFile(h, sid), 'utf8')).toBe(before);
  appendDocSessionEvents(h.env, sid, [message(1, 1, 'b')]);
  expect((await readEvents(h, sid)).body.events.map((e: { text: string }) => e.text)).toEqual(['a', 'b']);
});

test('the events read refuses an unknown query key and a repeated cursor', async () => {
  const h = await harness();
  const sid = await createdSession(h);
  for (const query of ['?limit=5', '?after=1.0&after=1.1', '?after=1.0&x=1']) {
    const response = await fetch(`${h.url}/api/v1/sessions/${sid}/events${query}`);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe('invalid_cursor');
  }
});

test('the events read refuses a bad cursor, an unknown session and a corrupt log without echoing the log', async () => {
  const h = await harness();
  const sid = await createdSession(h);
  for (const after of ['1', '1.', 'x.1', '-1.0', '1.01', '1.2.3']) {
    const answer = await readEvents(h, sid, after);
    expect(answer.status).toBe(400);
    expect(answer.body.code).toBe('invalid_cursor');
  }
  const unknown = await readEvents(h, 'f'.repeat(32));
  expect(unknown.status).toBe(404);
  expect(unknown.body.code).toBe('session_not_found');
  expect(() => appendDocSessionEvents(h.env, 'f'.repeat(32), [message(1, 0, 'x')])).toThrow();
  expect(existsSync(join(sessionsDir(h), 'f'.repeat(32)))).toBe(false);
  const leaked = `${JSON.stringify({ protocol: 1, epoch: 1, seq: 0, at: AT, type: 'tool', category: 'command', status: 'succeeded', paths: [], command: `curl -H "token ${SECRET_SAMPLES.github}"` })}\n`;
  writeFileSync(eventsFile(h, sid), leaked, { mode: 0o600 });
  const corrupt = await readEvents(h, sid);
  expect(corrupt.status).toBe(503);
  expect(corrupt.body.code).toBe('events_unavailable');
  expect(corrupt.text).not.toContain(SECRET_SAMPLES.github);
  expect(() => appendDocSessionEvents(h.env, sid, [message(1, 1, 'x')])).toThrow();
});

test('production routes admit the redacted session events read', async () => {
  expect(OPERATOR_ROUTES.some(route => route.id === 'session_events' && route.pattern === OPERATOR_SESSION_EVENTS_ROUTE.source)).toBe(true);
  const h = await harness();
  const sid = await createdSession(h);
  appendDocSessionEvents(h.env, sid, [message(1, 0, 'visible')]);
  const answer = await readEvents(h, sid);
  expect(answer.status).toBe(200);
  expect(answer.body.events[0].text).toBe('visible');
});

test('the production inventory binds POST /api/v1/sessions to the server-built route over the injected docs cache', async () => {
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
  const userHome = tmpWorkspace('operator-doc-session-user');
  writeAgentsSettings(userHome, ['codex']);
  const env = { ...process.env, HOME: userHome, REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: worktrees };
  const reader = new DocsReader({ root: repo, ref: 'refs/remotes/origin/main', env });
  reader.start();
  await reader.refresh();
  const tree: DocsTreeV1 = {
    protocol: 1, kind: OPERATOR_DOCS_TREE_KIND, repository_id: repositoryId, ref: 'refs/remotes/origin/main',
    commit: git(['rev-parse', 'refs/remotes/origin/main'], repo).trim(), collected_at: at,
    files: [{ path: 'docs/guide.md', size: Buffer.byteLength(GUIDE), sha256: hex(GUIDE) }],
  };
  // No write_routes injection: the production OPERATOR_ROUTES entry binds the server-built handler.
  const launches: string[] = [];
  const server = await startOperatorServer({
    port: 0, static_root: staticRoot, env, docs_session_platform: 'darwin',
    docs_agent_launcher: (sessionId) => { launches.push(sessionId); return 'starting'; },
    read_docs: () => ({ state: 'ready', tree, reader }),
  });
  const cookie = ((await fetch(`${server.url}/`)).headers.get('set-cookie') ?? '').split(';')[0]!;
  cleanups.push(async () => {
    await server.close();
    reader.close();
    for (const dir of [repo, home, userHome, worktrees, staticRoot]) rmSync(dir, { recursive: true, force: true });
  });
  const post = async (citations: readonly DocCitationV1[]) => {
    const response = await fetch(`${server.url}/api/v1/sessions`, {
      method: 'POST',
      headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ request_id: randomUUID(), kind: 'docs', runtime: 'codex', repository_id: repositoryId, citations, instruction: 'Tighten the intro.' }),
    });
    return { status: response.status, body: JSON.parse(await response.text()) as Record<string, any> };
  };

  const stale = await post([cite(GUIDE.replace('The operator reads docs.', 'The operator reads nothing.'), 'docs/guide.md', 3, 4, tree.commit)]);
  expect(stale.status).toBe(409);
  expect(stale.body.error.code).toBe('citation_stale');
  expect(readdirSync(worktrees)).toEqual([]);

  const answer = await post([cite(GUIDE, 'docs/guide.md', 3, 4, tree.commit)]);
  expect(answer.status).toBe(201);
  expect(answer.body.kind).toBe('operator_docs_session');
  const sid = answer.body.session_id as string;
  expect(answer.body.branch).toBe(`docs/${sid.slice(0, 12)}`);
  expect(readdirSync(worktrees)).toEqual([`${basename(repo)}-wt-docs-${sid.slice(0, 12)}`]);
  expect(readFileSync(join(home, 'operator', 'sessions', sid, 'session.json'), 'utf8')).toContain('"docs_session"');
  expect([answer.body.agent, launches]).toEqual(['starting', [sid]]);
});

