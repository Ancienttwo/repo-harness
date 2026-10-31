import { afterEach, expect, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync, writeSync } from 'node:fs';
import { basename, join } from 'node:path';
import { checkDocCitation, DOC_CITATION_BUDGET_CHARS, DOC_CITATION_BUDGET_HASHES, docCitationBudget, type DocCitationV1 } from '../../src/core/operator/doc-citation';
import { DOC_SESSION_EVENT_TEXT_MAX_BYTES, DOC_SESSION_EVENTS_PAGE, DOC_SESSION_POLL_MS, type DocSessionEventInput } from '../../src/core/operator/doc-session-events';
import { GIT_KILL_GRACE_MS, gitExecFile, GitExecError } from '../../src/effects/git/runner';
import { docSessionCreateRoute } from '../../src/effects/operator/doc-session';
import { appendDocSessionEvents, OPERATOR_SESSION_EVENTS_ROUTE } from '../../src/effects/operator/doc-session-events';
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
  head: () => string;
  post: (body: Record<string, unknown>) => Promise<{ status: number; body: Record<string, any>; text: string }>;
  branches: () => string[];
}

interface HarnessOptions {
  readonly platform?: NodeJS.Platform;
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
  const env = { ...process.env, HOME: userHome, REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: worktrees };
  const route = docSessionCreateRoute({
    env,
    // No docs view is served: the refusal comes before any citation read.
    docs_reader: () => null,
    // Doc sessions are macOS only; the CI runner's own platform must not decide these tests.
    platform: options.platform ?? 'darwin',
  });
  const server = await startOperatorServer({ port: 0, static_root: staticRoot, env, write_routes: [route] });
  const cookie = ((await fetch(`${server.url}/`)).headers.get('set-cookie') ?? '').split(';')[0]!;
  cleanups.push(async () => {
    await server.close();
    for (const dir of [repo, home, userHome, worktrees, staticRoot]) rmSync(dir, { recursive: true, force: true });
  });
  return {
    repo, repositoryId, worktrees, home, url: server.url, env,
    head: () => git(['rev-parse', 'refs/remotes/origin/main'], repo).trim(),
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

test('every docs session is refused with 501 docs_host_disabled before any worktree or record', async () => {
  const h = await harness();
  const citation = cite(GUIDE, 'docs/guide.md', 1, 1, h.head());
  for (const runtime of ['codex', 'claude', 'pi']) {
    const answer = await h.post(request(h, [citation], { runtime }));
    expect([answer.status, answer.body.error.code]).toEqual([501, 'docs_host_disabled']);
    expect(answer.text).not.toContain(h.repo);
  }
  expect(readdirSync(h.worktrees)).toEqual([]);
  expect(h.branches()).toEqual([]);
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
    request(h, [{ ...good, start_line: 1, end_line: 501 }]),
    request(h, []),
    request(h, [good], { runtime: 'Not A Runtime' }),
  ]) {
    const answer = await h.post(body);
    expect(answer.status).toBe(400);
    expect(answer.body.error.code).toBe('invalid_body');
  }
  expect(readdirSync(h.worktrees)).toEqual([]);
});

test('doc sessions are macOS only for now', async () => {
  const h = await harness({ platform: 'linux' });
  const answer = await h.post(request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())]));
  expect(answer.status).toBe(501);
  expect(answer.body.error.code).toBe('platform_unsupported');
  expect(readdirSync(h.worktrees)).toEqual([]);
});

test('production routes admit exactly the settings, worktree cleanup and session create writes', () => {
  expect(OPERATOR_ROUTES.filter(route => route.write).map(route => route.id)).toEqual(['worktrees_cleanup', 'settings_agents_write', 'sessions_create']);
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

const AT = '2026-10-27T12:00:00.000Z';
const message = (epoch: number, seq: number, text: string): DocSessionEventInput => ({ epoch, seq, at: AT, type: 'message', role: 'agent', text });
const turn = (epoch: number, seq: number, boundary: 'started' | 'ended'): DocSessionEventInput => ({ epoch, seq, at: AT, type: 'turn', boundary });
const tool = (epoch: number, seq: number, paths: string[]): DocSessionEventInput => ({ epoch, seq, at: AT, type: 'tool', category: 'read', status: 'succeeded', paths });
const eventsFile = (h: Harness, sid: string) => join(sessionsDir(h), sid, 'events.jsonl');

/** A session record and its `docs/<slug>` worktree, as a verified docs host wrote them before #1149 closed. */
function seedSession(h: Harness): string {
  const sid = randomUUID().replaceAll('-', '');
  const branch = `docs/${sid.slice(0, 12)}`;
  const worktree = join(h.worktrees, `${basename(h.repo)}-wt-docs-${sid.slice(0, 12)}`);
  const base = h.head();
  git(['worktree', 'add', '-q', '-b', branch, worktree, base], h.repo);
  const citation = cite(GUIDE, 'docs/guide.md', 1, 1, base);
  const directory = join(sessionsDir(h), sid);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(join(directory, 'session.json'), JSON.stringify({
    protocol: 1, kind: 'docs_session', session_id: sid, state: 'created', created_at: new Date().toISOString(),
    repository_id: h.repositoryId, runtime: 'codex', branch, worktree, base_commit: base,
    citations: [{ ...citation, resolved: citation, relocated: false }], instruction: 'Tighten the intro.',
  }));
  return sid;
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
  const sid = seedSession(h);
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
  const sid = seedSession(h);
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
  const sid = seedSession(h);
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
  const sid = seedSession(h);
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
  const sid = seedSession(h);
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
  const sid = seedSession(h);
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
  const sid = seedSession(h);
  appendDocSessionEvents(h.env, sid, [message(1, 0, 'kept')]);
  const torn = `${readFileSync(eventsFile(h, sid), 'utf8')}{"protocol":1,"epoch":1,"seq":1`;
  writeFileSync(eventsFile(h, sid), torn, { mode: 0o600 });
  const page = await readEvents(h, sid);
  expect(page.status).toBe(200);
  expect(page.body.events.map((e: { text: string }) => e.text)).toEqual(['kept']);
  expect(() => appendDocSessionEvents(h.env, sid, [message(1, 2, 'next')])).toThrow();
  expect(readFileSync(eventsFile(h, sid), 'utf8')).toBe(torn);

  const other = seedSession(h);
  const outside = join(h.home, 'outside.jsonl');
  writeFileSync(outside, `${JSON.stringify({ protocol: 1, epoch: 1, seq: 0, at: AT, type: 'message', role: 'agent', text: 'outside', truncated: false })}\n`, { mode: 0o600 });
  symlinkSync(outside, eventsFile(h, other));
  const linked = await readEvents(h, other);
  expect(linked.status).toBe(503);
  expect(linked.text).not.toContain('outside');
  expect(() => appendDocSessionEvents(h.env, other, [message(1, 1, 'x')])).toThrow();
  expect(readFileSync(outside, 'utf8')).not.toContain('"x"');
});

test('a sessions directory or a session directory that is a symlink is refused for events and for a session record', async () => {
  const h = await harness();
  const sid = seedSession(h);
  // `operator/sessions` now points at a directory outside that holds <sid>/session.json.
  const elsewhere = join(h.home, 'elsewhere');
  renameSync(sessionsDir(h), elsewhere);
  symlinkSync(elsewhere, sessionsDir(h));
  const read = await readEvents(h, sid);
  expect(read.status).toBe(503);
  expect(read.body.code).toBe('events_unavailable');
  expect(() => appendDocSessionEvents(h.env, sid, [message(1, 0, 'x')])).toThrow();
  expect(existsSync(join(elsewhere, sid, 'events.jsonl'))).toBe(false);
  // Creation refuses before any record write, so the symlinked directory stays as it was.
  const created = await h.post(request(h, [cite(GUIDE, 'docs/guide.md', 1, 1, h.head())]));
  expect([created.status, created.body.error.code]).toEqual([501, 'docs_host_disabled']);
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
  const sid = seedSession(h);
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
  const sid = seedSession(h);
  for (const query of ['?limit=5', '?after=1.0&after=1.1', '?after=1.0&x=1']) {
    const response = await fetch(`${h.url}/api/v1/sessions/${sid}/events${query}`);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe('invalid_cursor');
  }
});

test('the events read refuses a bad cursor, an unknown session and a corrupt log without echoing the log', async () => {
  const h = await harness();
  const sid = seedSession(h);
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
  const sid = seedSession(h);
  appendDocSessionEvents(h.env, sid, [message(1, 0, 'visible')]);
  const answer = await readEvents(h, sid);
  expect(answer.status).toBe(200);
  expect(answer.body.events[0].text).toBe('visible');
});

test('the production inventory binds POST /api/v1/sessions to the server-built route, which refuses and writes nothing', async () => {
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
  const env = { ...process.env, HOME: userHome, REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: worktrees };
  const base = git(['rev-parse', 'refs/remotes/origin/main'], repo).trim();
  // No write_routes injection: the production OPERATOR_ROUTES entry binds the server-built handler.
  const server = await startOperatorServer({ port: 0, static_root: staticRoot, env, docs_session_platform: 'darwin' });
  const cookie = ((await fetch(`${server.url}/`)).headers.get('set-cookie') ?? '').split(';')[0]!;
  cleanups.push(async () => {
    await server.close();
    for (const dir of [repo, home, userHome, worktrees, staticRoot]) rmSync(dir, { recursive: true, force: true });
  });
  const response = await fetch(`${server.url}/api/v1/sessions`, {
    method: 'POST',
    headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ request_id: randomUUID(), kind: 'docs', runtime: 'codex', repository_id: repositoryId,
      citations: [cite(GUIDE, 'docs/guide.md', 1, 1, base)], instruction: 'Tighten the intro.' }),
  });
  expect([response.status, ((await response.json()) as Record<string, any>).error.code]).toEqual([501, 'docs_host_disabled']);
  expect(readdirSync(worktrees)).toEqual([]);
  expect(existsSync(join(home, 'operator', 'sessions'))).toBe(false);
});

