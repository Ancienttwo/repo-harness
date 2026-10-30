import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DOC_SESSION_PATCH_MAX_BYTES, docSessionDiffDigestInput, docSessionLossDigestInput } from '../../src/core/operator/doc-session-changes';
import type { DocCitationV1 } from '../../src/core/operator/doc-citation';
import {
  docSessionDiffSha256, docSessionGitRunner, docSessionLossSha256, observeDocSessionChanges, observeDocSessionLoss, resolveDocSession,
  readDocSessionDiff, readDocSessionLoss,
} from '../../src/effects/operator/doc-session-changes';
import { docSessionCreateRoute } from '../../src/effects/operator/doc-session';
import { appendDocSessionEvents } from '../../src/effects/operator/doc-session-events';
import { DocsReader } from '../../src/effects/operator/docs-reader';
import { startOperatorServer } from '../../src/effects/operator/server';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';

const GUIDE = '# Guide\n\nThe operator reads docs.\nIt never writes main.\n';
const CLI = resolve(import.meta.dir, '../../src/cli/index.ts');

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function git(args: string[], cwd: string): string {
  const result = run('git', args, cwd);
  expect(result.status).toBe(0);
  return result.stdout;
}

const hex = (text: string) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

interface Session {
  readonly sid: string;
  readonly base: string;
  readonly repo: string;
  readonly worktree: string;
  readonly roots: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly get: (path: string) => Promise<{ status: number; body: Record<string, any>; text: string }>;
  readonly cli: (...args: string[]) => ReturnType<typeof spawnSync>;
}

/**
 * A doc session created through the create route, served by a server with
 * the production route inventory, so the reads run in the
 * bounded task-read child as in `operator serve`.
 */
async function session(prepare?: (repo: string) => void, gitBin?: string): Promise<Session> {
  const repo = tmpWorkspace('doc-session-reads-repo'); initGitRepo(repo);
  mkdirSync(join(repo, 'docs'));
  writeFileSync(join(repo, 'docs', 'guide.md'), GUIDE);
  writeFileSync(join(repo, 'docs', 'old.md'), 'old\n');
  writeFileSync(join(repo, '.gitignore'), '*.log\n');
  if (prepare) {
    prepare(repo);
    git(['add', '.'], repo);
    // Large unchanged-tree fixtures must not overflow the setup command's
    // stdout buffer with Git's per-file commit summary.
    git(['commit', '--quiet', '-m', 'docs'], repo);
  } else commitAll(repo, 'docs');
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD'], repo);
  const home = tmpWorkspace('doc-session-reads-home');
  const worktrees = realpathSync(tmpWorkspace('doc-session-reads-worktrees'));
  const userHome = tmpWorkspace('doc-session-reads-user');
  const staticRoot = tmpWorkspace('doc-session-reads-ui');
  writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
  const repositoryId = repoHarnessRepoIdFor(repo);
  const at = new Date().toISOString();
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [{
    id: repositoryId, path: repo, accessMode: 'read_only', source: 'manual', registeredAt: at, lastSeenAt: at,
  }] }));
  mkdirSync(join(userHome, '.repo-harness'), { recursive: true });
  writeFileSync(join(userHome, '.repo-harness', 'config.json'), JSON.stringify({ agents: { enabled: ['codex'], uses: { docs: ['codex'], review: [] }, default_docs: null } }));
  const env = { ...process.env, HOME: userHome, REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: worktrees,
    ...(gitBin === undefined ? {} : { REPO_HARNESS_GIT_BIN: gitBin }) };
  const reader = new DocsReader({ root: repo, ref: 'refs/remotes/origin/main', env });
  reader.start();
  await reader.refresh();
  const route = docSessionCreateRoute({ env, docs_reader: id => (id === repositoryId ? reader : null), platform: 'darwin' });
  const server = await startOperatorServer({ port: 0, static_root: staticRoot, env, write_routes: [route] });
  const roots = [repo, home, userHome, worktrees, staticRoot];
  cleanups.push(async () => {
    await server.close();
    reader.close();
    for (const dir of roots) rmSync(dir, { recursive: true, force: true });
  });
  const cookie = ((await fetch(`${server.url}/`)).headers.get('set-cookie') ?? '').split(';')[0]!;
  const base = git(['rev-parse', 'HEAD'], repo).trim();
  const citation: DocCitationV1 = { path: 'docs/guide.md', start_line: 1, end_line: 1, range_sha256: hex('# Guide\n'), file_sha256: hex(GUIDE), commit: base };
  const created = await fetch(`${server.url}/api/v1/sessions`, {
    method: 'POST',
    headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ request_id: randomUUID(), kind: 'docs', runtime: 'codex', repository_id: repositoryId, citations: [citation], instruction: 'Tighten the intro.' }),
  });
  const body = await created.json() as Record<string, any>;
  expect(created.status).toBe(201);
  return {
    sid: body.session_id, base, repo, worktree: join(worktrees, body.worktree), roots, env,
    get: async (path) => {
      const response = await fetch(`${server.url}${path}`);
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) as Record<string, any> : {}, text };
    },
    cli: (...args) => spawnSync(process.execPath, [CLI, 'operator', 'doc-sessions', ...args], { cwd: repo, env, encoding: 'utf8', timeout: 60_000 }),
  };
}

const diffOf = (s: Session) => s.get(`/api/v1/sessions/${s.sid}/diff`);
const lossOf = (s: Session) => s.get(`/api/v1/sessions/${s.sid}/loss`);

/** No absolute location of the fixture leaves the server. */
function expectNoPrivatePath(s: Session, text: string): void {
  for (const root of s.roots) expect(text).not.toContain(root);
  expect(text).not.toContain(s.worktree);
}

test('the diff lists every change against the base with a relative patch, the CLI prints the same body, and the digest is the shared one', async () => {
  const s = await session();
  writeFileSync(join(s.worktree, 'docs', 'guide.md'), GUIDE.replace('reads docs', 'reads and edits docs'));
  rmSync(join(s.worktree, 'docs', 'old.md'));
  writeFileSync(join(s.worktree, 'docs', 'new.md'), 'A new page.\n');
  writeFileSync(join(s.worktree, 'docs', 'image.bin'), Buffer.from([0, 1, 2, 3, 0, 255]));
  writeFileSync(join(s.worktree, 'docs', 'debug.log'), 'ignored\n');

  const answer = await diffOf(s);
  expect(answer.status).toBe(200);
  const { observed_at, diff_sha256, patch, ...rest } = answer.body;
  expect(rest).toEqual({
    protocol: 1, kind: 'operator_docs_session_diff', session_id: s.sid, base_commit: s.base, head_commit: s.base, turn: 'idle',
    files: [
      { path: 'docs/guide.md', status: 'modified', tracked: true, binary: false },
      { path: 'docs/image.bin', status: 'added', tracked: false, binary: true },
      { path: 'docs/new.md', status: 'added', tracked: false, binary: false },
      { path: 'docs/old.md', status: 'deleted', tracked: true, binary: false },
    ],
  });
  expect(patch).toContain('--- a/docs/guide.md\n+++ b/docs/guide.md\n');
  expect(patch).toContain('+The operator reads and edits docs.\n');
  expect(patch).toContain('+++ b/docs/new.md\n@@ -0,0 +1 @@\n+A new page.\n');
  expect(patch).toContain('deleted file mode 100644');
  expect(patch).not.toContain('debug.log');
  expectNoPrivatePath(s, answer.text);

  const runner = docSessionGitRunner(s.env);
  const { worktree } = resolveDocSession(s.env, s.sid);
  expect(diff_sha256).toBe(docSessionDiffSha256(s.base, observeDocSessionChanges(runner, worktree, s.base)));
  expect(diff_sha256).toBe(createHash('sha256').update(docSessionDiffDigestInput(s.base, observeDocSessionChanges(runner, worktree, s.base))).digest('hex'));

  const cli = s.cli('diff', s.sid, '--json');
  expect(cli.status).toBe(0);
  const printed = JSON.parse(cli.stdout as string);
  expect({ ...printed, observed_at }).toEqual(answer.body);
  const plain = s.cli('diff', s.sid);
  expect(plain.stdout).toContain(`diff_sha256 ${diff_sha256}`);
  expect(plain.stdout).toContain('modified\ttracked\ttext\tdocs/guide.md');
});

test('the diff digest binds content and modes: a stat change or a display option keeps it, a byte, a new file or the exec bit changes it', async () => {
  const s = await session();
  writeFileSync(join(s.worktree, 'docs', 'guide.md'), `${GUIDE}More.\n`);
  const first = (await diffOf(s)).body;
  expect((await diffOf(s)).body.diff_sha256).toBe(first.diff_sha256);

  // A changed mtime on an unchanged file, and diff settings of the user's git, do not change what a commit stores.
  // Without the index refresh, git lists the touched file as modified; the read drops it because its content is the same.
  utimesSync(join(s.worktree, 'docs', 'old.md'), new Date(2001, 1, 1), new Date(2001, 1, 1));
  for (const [key, value] of [['diff.noprefix', 'true'], ['diff.algorithm', 'patience'], ['color.ui', 'always'], ['diff.mnemonicPrefix', 'true'], ['diff.autoRefreshIndex', 'false']]) git(['config', key, value], s.repo);
  const displayed = (await diffOf(s)).body;
  expect(displayed.files).toEqual(first.files);
  expect(displayed.diff_sha256).toBe(first.diff_sha256);
  expect(displayed.patch).toContain('--- a/docs/guide.md\n+++ b/docs/guide.md\n');
  expect(displayed.patch).not.toContain('\u001b[');

  const digests = new Set([first.diff_sha256]);
  writeFileSync(join(s.worktree, 'docs', 'guide.md'), `${GUIDE}More!\n`);
  digests.add((await diffOf(s)).body.diff_sha256);
  writeFileSync(join(s.worktree, 'docs', 'extra.md'), 'x\n');
  digests.add((await diffOf(s)).body.diff_sha256);
  chmodSync(join(s.worktree, 'docs', 'extra.md'), 0o755);
  digests.add((await diffOf(s)).body.diff_sha256);
  expect(digests.size).toBe(4);
});

test('the loss list covers uncommitted, untracked and ignored files, commits no remote holds and a pushed branch, and its digest moves with each', async () => {
  const s = await session();
  writeFileSync(join(s.worktree, 'docs', 'guide.md'), `${GUIDE}Committed.\n`);
  commitAll(s.worktree, 'session edit');
  const commit = git(['rev-parse', 'HEAD'], s.worktree).trim();
  writeFileSync(join(s.worktree, 'docs', 'draft.md'), 'draft\n');
  writeFileSync(join(s.worktree, 'docs', 'build.log'), 'ignored\n');

  const answer = await lossOf(s);
  expect(answer.status).toBe(200);
  const { observed_at, loss_sha256, ...rest } = answer.body;
  expect(rest).toEqual({
    protocol: 1, kind: 'operator_docs_session_loss', session_id: s.sid, head_commit: commit, turn: 'idle',
    files: [{ path: 'docs/draft.md', status: 'added', tracked: false }],
    ignored: ['docs/build.log'], commits: [commit], pushed: false,
  });
  expectNoPrivatePath(s, answer.text);
  const runner = docSessionGitRunner(s.env);
  const resolved = resolveDocSession(s.env, s.sid);
  const observed = observeDocSessionLoss(runner, resolved.record, resolved.worktree);
  expect(loss_sha256).toBe(docSessionLossSha256(observed));
  expect(loss_sha256).toBe(createHash('sha256').update(docSessionLossDigestInput(observed)).digest('hex'));

  const cli = s.cli('loss', s.sid, '--json');
  expect(cli.status).toBe(0);
  expect({ ...JSON.parse(cli.stdout as string), observed_at }).toEqual(answer.body);

  const digests = new Set([loss_sha256]);
  writeFileSync(join(s.worktree, 'docs', 'more.log'), 'ignored\n');
  digests.add((await lossOf(s)).body.loss_sha256);
  git(['update-ref', `refs/remotes/origin/docs/${s.sid.slice(0, 12)}`, commit], s.repo);
  const pushed = (await lossOf(s)).body;
  expect(pushed.pushed).toBe(true);
  // The remote ref holds the commit, so a discard no longer loses it.
  expect(pushed.commits).toEqual([]);
  digests.add(pushed.loss_sha256);
  expect(digests.size).toBe(3);
});

test('the reads report a running turn from the session events', async () => {
  const s = await session();
  appendDocSessionEvents(s.env, s.sid, [{ type: 'turn', boundary: 'started', epoch: 1, seq: 0, at: new Date().toISOString() }]);
  expect((await diffOf(s)).body.turn).toBe('running');
  expect((await lossOf(s)).body.turn).toBe('running');
});

test('an unknown session, a query, a missing worktree and a worktree on another branch are refused with codes only', async () => {
  const s = await session();
  const unknown = 'f'.repeat(32);
  for (const path of [`/api/v1/sessions/${unknown}/diff`, `/api/v1/sessions/${unknown}/loss`]) {
    const answer = await s.get(path);
    expect(answer.status).toBe(404);
    expect(answer.body).toEqual({ code: 'session_not_found' });
  }
  expect((await s.get(`/api/v1/sessions/${s.sid}/diff?all=1`)).status).toBe(400);
  expect(s.cli('diff', 'not-a-session').status).toBe(2);
  const missing = s.cli('loss', unknown, '--json');
  expect(missing.status).toBe(2);
  expect(JSON.parse(missing.stderr as string)).toEqual({ error: { code: 'session_not_found' } });

  git(['checkout', '-q', '-b', 'elsewhere'], s.worktree);
  const changed = await diffOf(s);
  expect(changed.status).toBe(409);
  expect(changed.body).toEqual({ code: 'worktree_changed' });
  git(['worktree', 'remove', '--force', s.worktree], s.repo);
  const gone = await lossOf(s);
  expect(gone.status).toBe(409);
  expect(gone.body).toEqual({ code: 'worktree_missing' });
  expectNoPrivatePath(s, gone.text);
});

test('a filter driver is refused only when a candidate path uses it, so an installed git-lfs does not block the reads', async () => {
  const s = await session();
  // The git-lfs install writes these drivers to the global config of many machines, including the CI runners.
  git(['config', 'filter.lfs.clean', 'git-lfs clean -- %f'], s.repo);
  git(['config', 'filter.lfs.process', 'git-lfs filter-process'], s.repo);
  writeFileSync(join(s.worktree, 'docs', 'new.md'), 'A new page.\n');
  expect((await diffOf(s)).status).toBe(200);
  expect((await lossOf(s)).status).toBe(200);

  // The agent can write docs/.gitattributes; a changed path that names a driver would run it in the server.
  writeFileSync(join(s.worktree, 'docs', '.gitattributes'), 'new.md filter=lfs\n');
  expect(await diffOf(s)).toMatchObject({ status: 422, body: { code: 'filters_unsupported' } });
  expect(await lossOf(s)).toMatchObject({ status: 422, body: { code: 'filters_unsupported' } });
});

test.each(['changed', 'stat-only', 'racy'])('filter admission precedes every content comparison for a tracked %s file', async state => {
  const s = await session();
  const path = join(s.worktree, 'docs', 'guide.md');
  const stat = statSync(path);
  const marker = join(s.worktree, 'filter-marker.log');
  git(['config', 'filter.marker.clean', 'printf x >> filter-marker.log; cat'], s.repo);
  git(['config', 'diff.autoRefreshIndex', 'false'], s.repo);
  writeFileSync(join(s.worktree, 'docs', '.gitattributes'), 'guide.md filter=marker\n');
  if (state === 'changed') writeFileSync(path, GUIDE.replace('reads', 'edits'));
  else if (state === 'stat-only') utimesSync(path, new Date(2001, 1, 1), new Date(2001, 1, 1));
  else {
    writeFileSync(path, GUIDE.replace('reads', 'edits'));
    utimesSync(path, stat.atime, stat.mtime);
  }
  const executions: number[] = [];
  for (const effect of [readDocSessionDiff, readDocSessionLoss]) {
    writeFileSync(marker, '');
    expect(() => effect(s.env, s.sid)).toThrow('filters_unsupported');
    executions.push(readFileSync(marker).length);
  }
  for (const route of [diffOf, lossOf]) {
    writeFileSync(marker, '');
    expect(await route(s)).toMatchObject({ status: 422, body: { code: 'filters_unsupported' } });
    executions.push(readFileSync(marker).length);
  }
  expect(executions).toEqual([0, 0, 0, 0]);
});

test.each(['staged', 'committed'])('a %s populated gitlink is refused before its nested clean filter can run', async state => {
  const s = await session();
  // The fixture owner installs this state, including both indexes and the
  // nested config. The docs host cannot create .git entries or edit an index.
  const nested = join(s.worktree, 'docs', 'nested');
  mkdirSync(nested);
  initGitRepo(nested);
  writeFileSync(join(nested, 'guide.md'), 'before\n');
  writeFileSync(join(nested, '.gitignore'), '*.log\n');
  writeFileSync(join(nested, '.gitattributes'), 'guide.md filter=marker\n');
  commitAll(nested, 'nested docs');
  const oid = git(['rev-parse', 'HEAD'], nested).trim();
  git(['update-index', '--add', '--cacheinfo', `160000,${oid},docs/nested`], s.worktree);
  if (state === 'committed') git(['commit', '-m', 'nested gitlink'], s.worktree);
  git(['config', 'filter.marker.clean', 'printf x >> filter-marker.log; cat'], nested);
  // Keep the size: status must compare the bytes, not just detect a size change.
  writeFileSync(join(nested, 'guide.md'), 'after!\n');
  const marker = join(nested, 'filter-marker.log');
  const executions: number[] = [];
  for (const effect of [readDocSessionDiff, readDocSessionLoss]) {
    writeFileSync(marker, '');
    expect(() => effect(s.env, s.sid)).toThrow('path_unsupported');
    executions.push(readFileSync(marker).length);
  }
  for (const route of [diffOf, lossOf]) {
    writeFileSync(marker, '');
    expect(await route(s)).toMatchObject({ status: 422, body: { code: 'path_unsupported' } });
    executions.push(readFileSync(marker).length);
  }
  expect(executions).toEqual([0, 0, 0, 0]);
});

test('filter admission handles bounded path lists whose attribute replies exceed the single-command buffer', async () => {
  const pathAt = (index: number) => `capacity/${String(index).padStart(5, '0')}-${'x'.repeat(35)}.md`;
  const pathBytes = Buffer.byteLength(`${pathAt(0)}\0`);
  const replyBytes = pathBytes + Buffer.byteLength('filter\0unspecified\0');
  const count = Math.floor(DOC_SESSION_PATCH_MAX_BYTES / replyBytes) + 1;
  expect(count * pathBytes).toBeLessThan(DOC_SESSION_PATCH_MAX_BYTES);
  expect(count * replyBytes).toBeGreaterThan(DOC_SESSION_PATCH_MAX_BYTES);
  const s = await session(repo => {
    // Unchanged repository paths outside docs also participate in admission.
    // Keep the independent DocsReader tree cap out of this fixture.
    mkdirSync(join(repo, 'capacity'));
    for (let index = 0; index < count; index += 1) writeFileSync(join(repo, pathAt(index)), 'same\n');
  });
  const beforeDiff = await diffOf(s);
  const beforeLoss = await lossOf(s);
  expect(beforeDiff.status).toBe(200);
  expect(beforeLoss.status).toBe(200);
  git(['config', 'filter.marker.clean', 'printf x >> filter-marker.log; cat'], s.repo);
  const marker = join(s.worktree, 'filter-marker.log');
  // An unused installed driver must not change either observation or digest.
  const afterDiff = await diffOf(s);
  const afterLoss = await lossOf(s);
  expect(afterDiff.status).toBe(200);
  expect(afterLoss.status).toBe(200);
  expect(afterDiff.body.diff_sha256).toBe(beforeDiff.body.diff_sha256);
  expect(afterLoss.body.loss_sha256).toBe(beforeLoss.body.loss_sha256);

  // Matching paths near the end of the tracked list, and then the untracked
  // list, must still be checked. Neither refusal may run the configured filter.
  for (const path of [pathAt(count - 1), 'docs/zz-untracked.md']) {
    writeFileSync(join(s.worktree, path), 'changed\n');
    writeFileSync(join(s.worktree, '.gitattributes'), `${path} filter=marker\n`);
    writeFileSync(marker, '');
    expect(await diffOf(s)).toMatchObject({ status: 422, body: { code: 'filters_unsupported' } });
    expect(await lossOf(s)).toMatchObject({ status: 422, body: { code: 'filters_unsupported' } });
    expect(readFileSync(marker).length).toBe(0);
  }
});

test('index admission preserves the name-list capacity for unchanged short paths', async () => {
  // 75,000 mode records would exceed 512 KiB, while the existing name and
  // hidden-entry lists fit. Avoid case aliases and Windows reserved names.
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789!#$%&()+,-;=@[]^_{}~';
  const names: string[] = [];
  for (const a of alphabet) for (const b of alphabet) for (const c of alphabet) {
    const name = `${a}${b}${c}`;
    if (names.length < 75_000 && !['aux', 'con', 'nul', 'prn'].includes(name)) names.push(name);
  }
  expect(names.length * 7).toBeGreaterThan(DOC_SESSION_PATCH_MAX_BYTES);
  expect(names.length * 6).toBeLessThan(DOC_SESSION_PATCH_MAX_BYTES);
  const s = await session(repo => {
    for (const name of names) writeFileSync(join(repo, name), '');
  });
  expect(await diffOf(s)).toMatchObject({ status: 200, body: { files: [], patch: '' } });
});

test('session reads use the portable staged-index interface without ls-files format fields', async () => {
  // This is an option-surface constraint around real Git, not an old Git
  // emulator. Every accepted command executes Git against the actual fixture.
  const realGit = Bun.which('git');
  expect(realGit).not.toBeNull();
  const root = tmpWorkspace('doc-session-portable-git');
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const wrapper = join(root, 'git');
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const observed = join(root, 'stage-reads');
  writeFileSync(observed, '');
  writeFileSync(wrapper, [
    '#!/bin/sh',
    'is_ls_files=0',
    'for arg do if [ "$arg" = ls-files ]; then is_ls_files=1; fi; done',
    'if [ "$is_ls_files" = 1 ]; then',
    '  for arg do',
    '    case "$arg" in',
    '      --format*) echo "unsupported ls-files format" >&2; exit 129 ;;',
    `      --stage) printf x >> ${quote(observed)} ;;`,
    '    esac',
    '  done',
    'fi',
    `exec ${quote(realGit!)} "$@"`,
    '',
  ].join('\n'), { mode: 0o755 });
  const s = await session(undefined, wrapper);
  writeFileSync(join(s.worktree, 'docs', 'guide.md'), `${GUIDE}Changed.\n`);
  expect(await diffOf(s)).toMatchObject({ status: 200, body: { files: [{ path: 'docs/guide.md', status: 'modified' }] } });
  expect(await lossOf(s)).toMatchObject({ status: 200, body: { files: [{ path: 'docs/guide.md', status: 'modified' }] } });
  expect(readFileSync(observed).length).toBeGreaterThan(0);
});

test.each(['edit', 'add', 'mode'])('the loss digest binds ignored leaves when they %s inside an existing directory', async action => {
  const s = await session();
  writeFileSync(join(s.worktree, '.gitignore'), '*.log\ndocs/cache/\n');
  mkdirSync(join(s.worktree, 'docs', 'cache'));
  const leaf = join(s.worktree, 'docs', 'cache', 'one.md');
  writeFileSync(leaf, 'one\n');
  const before = await lossOf(s);
  expect(before.status).toBe(200);
  expect(before.body.ignored).toContain('docs/cache/');
  if (action === 'edit') writeFileSync(leaf, 'changed\n');
  else if (action === 'add') writeFileSync(join(s.worktree, 'docs', 'cache', 'two.md'), 'two\n');
  else chmodSync(leaf, 0o755);
  const after = await lossOf(s);
  expect(after.status).toBe(200);
  expect(after.body.ignored).toEqual(before.body.ignored);
  expect(after.body.loss_sha256).not.toBe(before.body.loss_sha256);
});

test('ignored leaves count toward the loss cap and ignored symlinks are never followed', async () => {
  const s = await session();
  writeFileSync(join(s.worktree, '.gitignore'), '*.log\ndocs/cache/\n');
  mkdirSync(join(s.worktree, 'docs', 'cache'));
  symlinkSync('/etc/hosts', join(s.worktree, 'docs', 'cache', 'link'));
  expect(await lossOf(s)).toMatchObject({ status: 422, body: { code: 'path_unsupported' } });
  rmSync(join(s.worktree, 'docs', 'cache', 'link'));
  for (let index = 0; index < 1000; index += 1) writeFileSync(join(s.worktree, 'docs', 'cache', `${index}.md`), 'x\n');
  // The changed .gitignore plus 1000 leaves exceeds the existing loss limit.
  expect(await lossOf(s)).toMatchObject({ status: 413, body: { code: 'too_large' } });
});

test('empty ignored directories at the loss cap remain readable; exceeding it refuses too_large through HTTP and CLI', async () => {
  const s = await session();
  for (let index = 0; index < 1000; index += 1) mkdirSync(join(s.worktree, 'docs', `${index}.log`));
  const atLimit = await lossOf(s);
  expect(atLimit.status).toBe(200);
  expect(atLimit.body.ignored).toHaveLength(1000);
  expect(atLimit.body.files).toEqual([]);

  mkdirSync(join(s.worktree, 'docs', 'overflow.log'));
  const overLimit = await lossOf(s);
  expect(overLimit).toMatchObject({ status: 413, body: { code: 'too_large' } });
  expectNoPrivatePath(s, overLimit.text);
  const cli = s.cli('loss', s.sid, '--json');
  expect(cli.status).toBe(2);
  expect(cli.stdout).toBe('');
  expect(JSON.parse(cli.stderr as string)).toEqual({ error: { code: 'too_large' } });
});

test.each(['modified', 'added', 'deleted'])('staged-only %s data changes the loss digest and public list', async status => {
  const s = await session();
  const beforeLoss = await lossOf(s);
  const beforeDiff = await diffOf(s);
  const path = status === 'added' ? 'docs/staged.md' : 'docs/guide.md';
  if (status === 'deleted') git(['rm', path], s.worktree);
  else {
    writeFileSync(join(s.worktree, path), 'staged only\n');
    git(['add', path], s.worktree);
  }
  if (status === 'added') rmSync(join(s.worktree, path));
  else writeFileSync(join(s.worktree, path), GUIDE);
  const after = await lossOf(s);
  expect(after.status).toBe(200);
  expect(after.body.loss_sha256).not.toBe(beforeLoss.body.loss_sha256);
  expect(after.body.files).toContainEqual({ path, status, tracked: true });
  if (status !== 'deleted') {
    expect((await diffOf(s)).body.diff_sha256).toBe(beforeDiff.body.diff_sha256);
    writeFileSync(join(s.worktree, path), 'another staged version\n');
    git(['add', path], s.worktree);
    if (status === 'added') rmSync(join(s.worktree, path));
    else writeFileSync(join(s.worktree, path), GUIDE);
    const next = await lossOf(s);
    expect(next.status).toBe(200);
    expect(next.body.files).toEqual(after.body.files);
    expect(next.body.loss_sha256).not.toBe(after.body.loss_sha256);
    expect((await diffOf(s)).body.diff_sha256).toBe(beforeDiff.body.diff_sha256);
  }
});

test('invalid UTF-8 text refuses the diff instead of replacing the reviewed bytes', async () => {
  const s = await session();
  writeFileSync(join(s.worktree, 'docs', 'guide.md'), Buffer.from([0x23, 0x20, 0xff, 0x0a]));
  expect(() => readDocSessionDiff(s.env, s.sid)).toThrow('encoding_unsupported');
  const answer = await diffOf(s);
  expect(answer).toMatchObject({ status: 422, body: { code: 'encoding_unsupported' } });
  expect(answer.text).not.toContain('\ufffd');
});

test('an unexpected internal read exception exits 1 and exposes only the public unavailable code', async () => {
  const s = await session();
  const core = resolve(import.meta.dir, '../../src/core/operator/doc-session-changes.ts');
  // Inject an internal fault inside the real reader, before its error wrapper.
  // The child isolates the module replacement from all other tests.
  const script = `
    import { mock } from 'bun:test';
    const core = await import(${JSON.stringify(core)});
    mock.module(${JSON.stringify(core)}, () => ({ ...core, docSessionDiffDigestInput() { throw new Error('private internal fault'); } }));
    const { runCli } = await import(${JSON.stringify(CLI)});
    await runCli(['bun', 'repo-harness', 'operator', 'doc-sessions', 'diff', ${JSON.stringify(s.sid)}, '--json']);
  `;
  const result = spawnSync(process.execPath, ['-e', script], { cwd: s.repo, env: s.env, encoding: 'utf8', timeout: 60_000 });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(JSON.parse(result.stderr)).toEqual({ error: { code: 'unavailable' } });
});

test('a symlink, a hidden index entry and more changes than the cap are refused, never shown in part', async () => {
  const s = await session();
  symlinkSync('/etc/hosts', join(s.worktree, 'docs', 'link.md'));
  expect(await diffOf(s)).toMatchObject({ status: 422, body: { code: 'path_unsupported' } });
  rmSync(join(s.worktree, 'docs', 'link.md'));

  git(['update-index', '--assume-unchanged', 'docs/old.md'], s.worktree);
  expect(await lossOf(s)).toMatchObject({ status: 422, body: { code: 'index_unsupported' } });
  git(['update-index', '--no-assume-unchanged', 'docs/old.md'], s.worktree);

  mkdirSync(join(s.worktree, 'docs', 'many'));
  for (let index = 0; index <= 1000; index += 1) writeFileSync(join(s.worktree, 'docs', 'many', `${index}.md`), `${index}\n`);
  expect(await diffOf(s)).toMatchObject({ status: 413, body: { code: 'too_large' } });
});
