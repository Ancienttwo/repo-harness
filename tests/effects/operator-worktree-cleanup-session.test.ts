import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodeCleanupSessionCreate } from '../../src/core/operator/worktree-cleanup-session';
import { prepareCleanupSession } from '../../src/effects/operator/worktree-cleanup-session';
import { beginCleanupPlan, readCleanupObservation, readCleanupPlanPreview, saveCleanupAdvice, saveCleanupObservation } from '../../src/effects/operator/worktree-cleanup-session-store';
import { writeSessionRecord } from '../../src/effects/operator/doc-session';
import { createCleanupPlan } from '../../src/effects/operator/worktree-cleanup-plan';
import { startOperatorServer } from '../../src/effects/operator/server';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { worktreeId } from '../../src/effects/git/worktree-record';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const CLI = resolve(import.meta.dir, '../../src/cli/index.ts');
const keep = { recommendation: 'keep', reason: 'Human review is required.', evidence: ['No removal is authorized.'], archive: { git: null, private: null } } as const;
function fixture() {
  const root = tmpWorkspace('cleanup-session'), repo = join(root, 'repo'), home = join(root, 'home'), state = join(root, 'state'), trees = join(root, 'trees'), tree = join(trees, 'feature');
  for (const path of [repo, home, state, trees]) mkdirSync(path);
  initGitRepo(repo); writeFileSync(join(repo, 'tracked.txt'), 'base\n'); commitAll(repo, 'base');
  const git = (...args: string[]) => { const r = run('git', args, repo); expect(r.status).toBe(0); return r.stdout.trim(); };
  git('update-ref', 'refs/remotes/origin/main', 'HEAD'); git('worktree', 'add', '-b', 'feature', tree);
  writeFileSync(join(tree, 'tracked.txt'), 'edited\n');
  const id = worktreeId(resolveGitCommonDirectory(repo), tree), repoId = repoHarnessRepoIdFor(repo), at = new Date().toISOString();
  writeFileSync(join(state, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [{ id: repoId, path: repo, accessMode: 'read_only', source: 'manual', registeredAt: at, lastSeenAt: at }] }));
  mkdirSync(join(home, '.repo-harness'));
  writeFileSync(join(home, '.repo-harness/config.json'), JSON.stringify({ agents: { enabled: ['codex'], uses: { docs: ['codex'], review: [] }, default_docs: 'codex' } }));
  const env = { ...process.env, HOME: home, REPO_HARNESS_HOME: state, REPO_HARNESS_WORKTREE_ROOT: trees };
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const create = () => prepareCleanupSession({ kind: 'worktree_cleanup', runtime: 'codex', ids: [id] }, env, 'darwin');
  const directory = (sid: string) => join(state, 'operator/sessions', sid);
  const advice = (sid: string, value: unknown = keep) => saveCleanupAdvice(env, sid, JSON.stringify({ items: [{ id, advice: value }] }));
  return { root, repo, home, tree, state, env, id, repoId, git, create, directory, advice };
}

test('cleanup creation accepts only bounded server IDs and no paths or execution grants', () => {
  expect(decodeCleanupSessionCreate({ kind: 'worktree_cleanup', runtime: 'codex' })).toEqual({ kind: 'worktree_cleanup', runtime: 'codex' });
  for (const extra of [{ paths: ['/tmp/a'] }, { authorization: true }, { ids: [] }, { ids: ['../tree'] }, { ids: Array(17).fill('wt_' + 'a'.repeat(64)) }]) {
    expect(() => decodeCleanupSessionCreate({ kind: 'worktree_cleanup', runtime: 'codex', ...extra })).toThrow();
  }
});

test('preparation persists complete private observations without creating or changing a Git worktree', () => {
  const f = fixture(), before = f.git('worktree', 'list', '--porcelain'), refs = f.git('show-ref');
  const sid = f.create(), saved = readCleanupObservation(f.env, sid);
  expect(f.git('worktree', 'list', '--porcelain')).toBe(before); expect(f.git('show-ref')).toBe(refs);
  expect(readFileSync(join(f.tree, 'tracked.txt'), 'utf8')).toBe('edited\n');
  expect(saved.items).toHaveLength(1); expect(saved.items[0]!.target).toMatchObject({ id: f.id, repository: f.repo, worktree: f.tree });
  expect(saved.items[0]!.observation.loss?.files.some(file => file.path === 'tracked.txt')).toBe(true);
  for (const name of ['session.json', 'cleanup-observation.json']) expect(statSync(join(f.directory(sid), name)).mode & 0o777).toBe(0o600);
  expect(existsSync(join(f.directory(sid), 'agent.json'))).toBe(false);
  expect(readCleanupPlanPreview(f.env, { session_id: sid })).toMatchObject({ state: 'investigating', plan: null, agent: null, execution: { enabled: false } });
  expect(() => prepareCleanupSession({ kind: 'worktree_cleanup', runtime: 'codex', ids: ['wt_' + '0'.repeat(64)] }, f.env, 'darwin')).toThrow();
  expect(readdirSync(join(f.state, 'operator/sessions'))).toEqual([sid]);
});

test('advice binds to saved observations and invalid, partial or unsafe suggestions never produce a ready plan', () => {
  const f = fixture(), sid = f.create(); f.advice(sid);
  const saved = readCleanupObservation(f.env, sid), good = readCleanupPlanPreview(f.env, { session_id: sid });
  expect(good.state).toBe('ready');
  expect(good.plan).toEqual(createCleanupPlan(sid, saved.items.map(item => ({ observation: item.observation, advice: keep }))));
  expect(JSON.stringify(good)).not.toContain(f.root);
  for (const text of ['not json', '{"items":[]}', JSON.stringify({ items: [{ id: f.id, advice: keep }, { id: f.id, advice: keep }] }), JSON.stringify({ items: [{ id: 'wt_' + '0'.repeat(64), advice: keep }] })]) {
    saveCleanupAdvice(f.env, sid, text); expect(readCleanupPlanPreview(f.env, { session_id: sid })).toMatchObject({ state: 'unavailable', plan: null });
  }
  f.advice(sid, { ...keep, recommendation: 'archive_then_delete', archive: { git: null, private: { directory: 'wrong-repository', paths: ['tracked.txt'] } } });
  expect(readCleanupPlanPreview(f.env, { session_id: sid }).state).toBe('unavailable');
  f.advice(sid); const planPath = join(f.directory(sid), 'cleanup-plan.json');
  const raw = JSON.parse(readFileSync(planPath, 'utf8')); raw.plan.items[0].loss_sha256 = '0'.repeat(64); writeFileSync(planPath, JSON.stringify(raw));
  expect(() => readCleanupPlanPreview(f.env, { session_id: sid })).toThrow('cleanup_plan_observation_mismatch');
  beginCleanupPlan(f.env, sid); expect(readCleanupPlanPreview(f.env, { session_id: sid }).plan).toBeNull();
});

test('production plan HTTP and CLI return the same safe plan; corrupt storage is unavailable and creation cannot bypass Linux admission', async () => {
  const f = fixture(), sid = f.create(); f.advice(sid);
  const ui = join(f.root, 'ui'); mkdirSync(ui); writeFileSync(join(ui, 'index.html'), '<main>fixture</main>');
  let launched = 0;
  const server = await startOperatorServer({ port: 0, static_root: ui, env: f.env, docs_agent_launcher: () => { launched++; return 'starting'; } });
  cleanups.push(() => server.close());
  const cookie = ((await fetch(`${server.url}/`)).headers.get('set-cookie') ?? '').split(';')[0]!;
  const planUrl = `${server.url}/api/v1/sessions/${sid}/plan`;
  const answer = await fetch(planUrl); expect(answer.status).toBe(200); const body = await answer.json();
  expect(body).toEqual(readCleanupPlanPreview(f.env, { session_id: sid })); expect(JSON.stringify(body)).not.toContain(f.root);
  const cli = spawnSync(process.execPath, [CLI, 'operator', 'doc-sessions', 'plan', sid, '--json'], { env: f.env, cwd: f.repo, encoding: 'utf8', timeout: 60_000 });
  expect(cli.status, cli.stderr).toBe(0); expect(JSON.parse(cli.stdout)).toEqual(body);
  expect((await fetch(planUrl + '?path=/tmp/secret')).status).toBe(400);
  expect((await fetch(`${server.url}/api/v1/sessions/${'0'.repeat(32)}/plan`)).status).toBe(404);
  const list = await (await fetch(`${server.url}/api/v1/sessions`)).json() as any;
  expect(list.kinds).toEqual(['docs', 'worktree_cleanup']); expect(list.sessions).toEqual([]);
  chmodSync(join(f.directory(sid), 'cleanup-plan.json'), 0o644);
  expect((await fetch(planUrl)).status).toBe(503); expect(launched).toBe(0);
  if (process.platform !== 'darwin') {
    const requestId = randomUUID();
    const post = () => fetch(`${server.url}/api/v1/sessions`, { method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin', Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestId, kind: 'worktree_cleanup', runtime: 'codex' }) });
    const first = await post(); expect(first.status).toBe(501); expect((await first.json() as any).error.code).toBe('platform_unsupported');
    expect((await post()).status).toBe(501); expect(launched).toBe(0);
    const createCli = spawnSync(process.execPath, [CLI, 'operator', 'doc-sessions', 'cleanup', '--runtime', 'codex', '--json'], { env: f.env, cwd: f.repo, encoding: 'utf8', timeout: 60_000 });
    expect(createCli.status).toBe(2); expect(JSON.parse(createCli.stderr).error.code).toBe('platform_unsupported');
  }
}, 60_000);


test('the private observation size guard rejects the actual persisted format before writing an unreadable artifact', () => {
  const f = fixture(), seed = f.create(), saved = readCleanupObservation(f.env, seed), base = saved.items[0]!;
  // Valid evidence dimensions below the observer's 20,000-entry per-target bound.
  // Expand the real observed fixture shape; this exercises the real validator,
  // artifact writer and reader, not 80,000 live files or provider acceptance.
  const loss = base.observation.loss!;
  const files = Array.from({ length: 8000 }, (_, i) => ({ path: `file-${String(i).padStart(5, '0')}.txt`, kind: 'file' as const, mode: 420, size: 1, sha256: 'a'.repeat(64), git_oid: 'b'.repeat(40) }));
  const index = files.map(file => ({ path: file.path, mode: '100644', oid: file.git_oid, stage: 0 }));
  const sid = randomUUID().replaceAll('-', '');
  const observed = { ...saved, session_id: sid, items: Array.from({ length: 10 }, (_, i) => {
    const id = 'wt_' + String(i).padStart(64, '0');
    return { target: { ...base.target!, id }, observation: { worktree: { ...base.observation.worktree, id }, loss: { ...loss,
      files: [...files, { path: 'directory', kind: 'directory' as const, mode: 493, size: 0, sha256: null, git_oid: null }], index, changed_paths: [], ignored: [], commits: [] } } };
  }) };
  const compact = Buffer.byteLength(JSON.stringify(observed)), persisted = Buffer.byteLength(JSON.stringify(observed, null, 2) + '\n');
  expect(compact).toBeLessThan(32 * 1024 * 1024); expect(persisted).toBeGreaterThan(32 * 1024 * 1024);
  const record = JSON.parse(readFileSync(join(f.directory(seed), 'session.json'), 'utf8'));
  writeSessionRecord(f.env, sid, { ...record, session_id: sid });
  const path = join(f.directory(sid), 'cleanup-observation.json');
  let refusal: unknown;
  try { saveCleanupObservation(f.directory(sid), observed); } catch (error) { refusal = error; }
  if (refusal === undefined) {
    const actual = statSync(path).size;
    let readFailure = 'none';
    try { readCleanupObservation(f.env, sid); } catch (error) { readFailure = (error as Error).message; }
    throw new Error(`accepted an unreadable observation: compact=${compact}, persisted=${persisted}, actual=${actual}, read=${readFailure}`);
  }
  expect((refusal as Error).message).toBe('cleanup_observation_too_large');
  expect(existsSync(path)).toBe(false);
  // The same format below the bound remains readable through the production reader.
  const admitted = { ...observed, items: observed.items.slice(0, 8) };
  const admittedBytes = Buffer.byteLength(JSON.stringify(admitted, null, 2) + '\n');
  expect(admittedBytes).toBeLessThanOrEqual(32 * 1024 * 1024);
  saveCleanupObservation(f.directory(sid), admitted);
  expect(statSync(path).size).toBe(admittedBytes);
  expect(readCleanupObservation(f.env, sid).items).toHaveLength(8);
}, 60_000);
