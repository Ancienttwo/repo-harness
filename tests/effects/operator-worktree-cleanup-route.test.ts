import { expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLEANUP_INVESTIGATION_MANIFEST, cleanupSelection, decodeAuthorizedCleanupRequest, WORKTREE_CLEANUP_INVESTIGATION_MAX_ITEMS,
  type CleanupAdvice, type CleanupArchivePlan, type CleanupPlan,
} from '../../src/core/operator/worktree-cleanup-plan';
import type { TaskRequest } from '../../src/core/review/runner-port';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { worktreeId } from '../../src/effects/git/worktree-record';
import type { WorktreeProcess } from '../../src/effects/git/worktree-processes';
import type { GithubCommandRunner } from '../../src/effects/github/issues';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { runSetupProcess } from '../../src/effects/setup/collector';
import { startOperatorServer } from '../../src/effects/operator/server';
import { cleanupPlanSelectionDigest, createCleanupPlan } from '../../src/effects/operator/worktree-cleanup-plan';
import {
  CleanupInvestigationError, prepareCleanupInvestigation, readCleanupInvestigationStatus, runCleanupInvestigation, startCleanupInvestigation,
  worktreeCleanupInvestigationWriteRoute, type CleanupInvestigator,
} from '../../src/effects/operator/worktree-cleanup-investigation';
import { prepareReviewLauncher } from '../../src/effects/review/review-isolation';
import { CLEANUP_ARCHIVE_BRANCH, createGithubDraftPrPublisher } from '../../src/effects/operator/worktree-cleanup-publish';
import {
  chooseCleanupSessionPlan, createCleanupSessionPlan, runAuthorizedCleanup, worktreeCleanupExecuteWriteRoute, worktreeCleanupPlanWriteRoute,
} from '../../src/effects/operator/worktree-cleanup-route';
import { loadCleanupInvestigation, loadCleanupSession, saveCleanupInvestigation, saveCleanupSession } from '../../src/effects/operator/worktree-cleanup-store';
import { pluginSelectionEnv } from '../helpers/install-ownership';
import { controlledWorktreeProcessPreload } from '../helpers/controlled-worktree-processes';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';

/** The `gh api` calls of the Draft PR publisher. A POST reads the pushed head from the local bare remote; `fail_create` refuses it. */
const FAKE_GH = `
const fs = require('node:fs'), { execFileSync } = require('node:child_process');
const file = process.env.FAKE_GH_STATE, state = JSON.parse(fs.readFileSync(file, 'utf8')), args = process.argv.slice(2);
const method = args[args.indexOf('--method') + 1], endpoint = args.find(arg => arg.startsWith('repos/'));
const fields = Object.fromEntries(args.flatMap((arg, i) => arg === '--raw-field' || arg === '--field' ? [args[i + 1].split(/=(.*)/su).slice(0, 2)] : []));
const repository = { id: 42, full_name: 'Fixture/Archive' };
state.calls.push(method + ' ' + endpoint.split('?')[0]);
let out;
if (method === 'GET' && endpoint === 'repos/Fixture/Archive') {
  out = { ...repository, html_url: 'https://github.com/Fixture/Archive', archived: false, disabled: false, default_branch: 'main', permissions: { push: true } };
} else if (method === 'GET' && endpoint.startsWith('repos/Fixture/Archive/pulls?')) {
  const query = new URLSearchParams(endpoint.split('?')[1]);
  out = query.get('page') === '1' ? state.pulls.filter(pr => 'Fixture:' + pr.head.ref === query.get('head')) : [];
} else if (method === 'POST' && endpoint === 'repos/Fixture/Archive/pulls' && !state.fail_create) {
  const sha = execFileSync(process.env.FAKE_GH_GIT, ['--git-dir', process.env.FAKE_GH_REMOTE, 'rev-parse', 'refs/heads/' + fields.head], { encoding: 'utf8' }).trim();
  out = { number: state.pulls.length + 1, html_url: 'https://github.com/Fixture/Archive/pull/' + (state.pulls.length + 1), state: 'open', draft: fields.draft === 'true',
    merged_at: null, head: { ref: fields.head, sha, repo: repository }, base: { ref: fields.base, repo: repository } };
  state.pulls.push(out);
} else { fs.writeFileSync(file, JSON.stringify(state)); process.stderr.write('refused\\n'); process.exit(1); }
fs.writeFileSync(file, JSON.stringify(state)); process.stdout.write(JSON.stringify(out));
`;
const none: CleanupArchivePlan = { git: null, private: null };

function fixture() {
  const parent = tmpWorkspace('cleanup-route'), repo = join(parent, 'repo'), tree = join(parent, 'repo-wt-feature');
  const home = join(parent, 'home'), remote = join(parent, 'remote.git'), bin = join(parent, 'bin');
  for (const path of [repo, home, bin]) mkdirSync(path, { mode: 0o700 });
  const git = (cwd: string, ...args: string[]) => { const r = run('git', args, cwd); expect(r.status).toBe(0); return r.stdout.trim(); };
  initGitRepo(repo); writeFileSync(join(repo, 'tracked.txt'), 'base\n'); writeFileSync(join(repo, '.gitignore'), '.env\n'); commitAll(repo, 'base');
  git(parent, 'init', '--bare', '-q', remote); git(repo, 'remote', 'add', 'origin', remote); git(repo, 'push', '-q', '-u', 'origin', 'main');
  git(repo, 'worktree', 'add', '-q', '-b', 'feature', tree);
  writeFileSync(join(tree, 'tracked.txt'), 'reviewed change\n'); writeFileSync(join(tree, '.env'), 'SYNTHETIC=fixture\n');
  const repoId = repoHarnessRepoIdFor(repo);
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [
    { id: repoId, path: repo, accessMode: 'read_only', source: 'adopt', registeredAt: '2026-11-04T00:00:00.000Z', lastSeenAt: '2026-11-04T00:00:00.000Z' }] }));
  const env = { ...pluginSelectionEnv(['operator', 'peer-runtime']), REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: parent };
  const id = worktreeId(resolveGitCommonDirectory(repo), realpathSync(tree));

  const stateFile = join(parent, 'gh-state.json'), gh = join(bin, 'gh');
  writeFileSync(stateFile, JSON.stringify({ calls: [], pulls: [], fail_create: false }));
  writeFileSync(gh, `#!${process.execPath}\n${FAKE_GH}`); chmodSync(gh, 0o755);
  const ghEnv = { PATH: bin, FAKE_GH_STATE: stateFile, FAKE_GH_REMOTE: remote, FAKE_GH_GIT: Bun.which('git')! };
  const runner: GithubCommandRunner = (args, limits) => ({
    stdout: execFileSync('gh', [...args], { env: ghEnv, encoding: 'utf8', timeout: limits.timeout_ms, maxBuffer: limits.max_buffer, stdio: ['ignore', 'pipe', 'pipe'] }),
  });
  // The remote is a local bare path, so the test supplies the target that remote selection returns for a github.com remote.
  const github = { ...createGithubDraftPrPublisher(env, CLEANUP_ARCHIVE_BRANCH, runner),
    publication_target: async () => ({ remote: 'origin', repository: 'Fixture/Archive', base_branch: 'main' }) };
  let processes: WorktreeProcess[] = [];
  const options = () => ({ env, caller_cwd: repo, deadline: Date.now() + 50_000, processes: () => processes, github });
  const plan = (choice: { recommendation: 'delete' | 'archive_then_delete'; archive: CleanupArchivePlan } = { recommendation: 'delete', archive: none }) => {
    const first = createCleanupSessionPlan([id], options());
    return chooseCleanupSessionPlan(first.session_id, [{ id, ...choice }], options());
  };
  const authorize = (value: CleanupPlan, change: (approval: { id: string; plan_sha256: string; loss_sha256: string }) => object = approval => approval) =>
    decodeAuthorizedCleanupRequest({ session_id: value.session_id, ids: [id], expected_digest: cleanupPlanSelectionDigest(value, [id]),
      approvals: [change({ id, plan_sha256: value.items[0]!.plan_sha256, loss_sha256: value.items[0]!.loss_sha256! })] });
  const execute = async (value: CleanupPlan, change?: Parameters<typeof authorize>[1]) => (await runAuthorizedCleanup(authorize(value, change), options())).items[0]!;
  const ghState = () => JSON.parse(readFileSync(stateFile, 'utf8')) as { calls: string[]; pulls: unknown[]; fail_create: boolean };
  return { parent, repo, tree, home, remote, env, id, repoId, git, options, plan, authorize, execute, ghState,
    failCreate: () => writeFileSync(stateFile, JSON.stringify({ ...ghState(), fail_create: true })),
    setProcesses: (value: WorktreeProcess[]) => { processes = value; },
    cleanup: () => rmSync(parent, { recursive: true, force: true }) };
}
type Fixture = ReturnType<typeof fixture>;
function routeTest(name: string, body: (f: Fixture) => Promise<void>) {
  test.skipIf(process.platform === 'win32')(name, async () => {
    const f = fixture();
    try { await body(f); } finally { f.cleanup(); }
  }, 90_000);
}

routeTest('pass 1 keeps each non-green worktree with server text in a private plan, and pass 2 binds the user choice', async f => {
  const first = createCleanupSessionPlan([f.id], f.options());
  expect(first.items[0]!.worktree.judgment).toBe('yellow');
  expect(first.items[0]!.advice).toMatchObject({ recommendation: 'keep', reason: 'The server observed a yellow worktree.', archive: none });
  expect(first.items[0]!.advice.evidence).toEqual(expect.arrayContaining(['Worktree reason: dirty.', 'Changed paths: 1.', 'Ignored entries: 1.', 'Unpublished commits: 0.']));
  const directory = join(f.home, 'operator/worktree-cleanup', first.session_id);
  expect(statSync(directory).mode & 0o777).toBe(0o700); expect(statSync(join(directory, 'plan.json')).mode & 0o777).toBe(0o600);
  expect(loadCleanupSession(f.env, first.session_id).plan).toEqual(first);

  const second = chooseCleanupSessionPlan(first.session_id, [{ id: f.id, recommendation: 'archive_then_delete', archive: { git: null, private: { directory: f.repoId, paths: ['.env'] } } }], f.options());
  expect(second.session_id).toBe(first.session_id); expect(second.items[0]!.plan_sha256).not.toBe(first.items[0]!.plan_sha256);
  expect(second.items[0]!.loss_sha256).toBe(first.items[0]!.loss_sha256);
  expect(second.items[0]!.advice).toMatchObject({ recommendation: 'archive_then_delete', reason: first.items[0]!.advice.reason, evidence: first.items[0]!.advice.evidence });
  expect(loadCleanupSession(f.env, first.session_id).plan).toEqual(second);

  // Refusals change nothing: a choice set that misses an item, a path that is not archivable, a missing session and a green worktree.
  const refusal = async (action: () => unknown) => { try { await action(); } catch (error) { return (error as { code?: string }).code; } return 'accepted'; };
  expect(await refusal(() => chooseCleanupSessionPlan(first.session_id, [{ id: `wt_${'0'.repeat(64)}`, recommendation: 'delete', archive: none }], f.options()))).toBe('choices_changed');
  expect(await refusal(() => chooseCleanupSessionPlan(first.session_id, [{ id: f.id, recommendation: 'archive_then_delete', archive: { git: null, private: { directory: f.repoId, paths: ['.gitignore'] } } }], f.options()))).toBe('choice_invalid');
  expect(await refusal(() => chooseCleanupSessionPlan('c'.repeat(32), [{ id: f.id, recommendation: 'delete', archive: none }], f.options()))).toBe('session_not_found');
  expect(existsSync(join(f.home, 'operator/worktree-cleanup', 'c'.repeat(32)))).toBe(false);
  expect(loadCleanupSession(f.env, first.session_id).plan).toEqual(second);
  f.git(f.tree, 'checkout', '--', 'tracked.txt'); rmSync(join(f.tree, '.env'));
  writeFileSync(join(f.tree, 'feature.txt'), 'feature\n'); commitAll(f.tree, 'feature'); f.git(f.tree, 'push', '-q', 'origin', 'feature:main'); f.git(f.repo, 'fetch', '-q', 'origin');
  expect(await refusal(() => createCleanupSessionPlan([f.id], f.options()))).toBe('green_worktree');
});

// Sibling inputs of "not authorized for this exact plan and loss": each one is skipped before any mutation, and the worktree stays.
routeTest('the execute route refuses an unauthorized, changed or in-use worktree and removes an approved one', async f => {
  const cases: Array<[string, string, (value: CleanupPlan) => Promise<unknown>]> = [
    ['no approval', 'not_approved', async value => (await runAuthorizedCleanup(decodeAuthorizedCleanupRequest({ session_id: value.session_id, ids: [f.id],
      expected_digest: cleanupPlanSelectionDigest(value, [f.id]), approvals: [] }), f.options())).items[0]],
    ['plan digest', 'plan_changed', value => f.execute(value, approval => ({ ...approval, plan_sha256: 'f'.repeat(64) }))],
    ['loss digest', 'loss_changed', value => f.execute(value, approval => ({ ...approval, loss_sha256: 'f'.repeat(64) }))],
    ['changed content', 'loss_changed', async value => { writeFileSync(join(f.tree, 'tracked.txt'), 'changed after approval\n'); try { return await f.execute(value); } finally { writeFileSync(join(f.tree, 'tracked.txt'), 'reviewed change\n'); } }],
    ['process in the worktree', 'in_use', async value => { f.setProcesses([{ pid: 2_147_000_000, cwd: f.tree }]); try { return await f.execute(value); } finally { f.setProcesses([]); } }],
  ];
  for (const [name, reason, attempt] of cases) {
    const run = await attempt(f.plan());
    expect([name, run]).toEqual([name, expect.objectContaining({ outcome: 'skipped', reason })]);
    expect(existsSync(f.tree)).toBe(true);
  }
  const value = f.plan();
  expect(await f.execute(value)).toEqual({ id: f.id, outcome: 'removed', reason: null, stage: 'remove', archive_pr: null });
  expect(existsSync(f.tree)).toBe(false); expect(f.git(f.repo, 'branch', '--list', 'feature')).toBe('');
  expect(await f.execute(value)).toMatchObject({ outcome: 'removed', stage: 'reconcile' });
});

routeTest('an archive item is deleted only after the push and Draft PR read back, and the archive record binds both', async f => {
  f.git(f.repo, 'fetch', '-q', 'origin');
  const archive: CleanupArchivePlan = { git: { directory: 'docs/archive/2026-11-04-feature', branch: 'docs/archive-feature', paths: ['tracked.txt'], include_commits: false },
    private: { directory: f.repoId, paths: ['.env'] } };
  f.failCreate();
  const refused = f.plan({ recommendation: 'archive_then_delete', archive });
  expect(await f.execute(refused)).toMatchObject({ outcome: 'reconcile_required', reason: 'archive_failed', stage: 'archive_pr' });
  expect(existsSync(f.tree)).toBe(true);
  expect(f.git(f.parent, '--git-dir', f.remote, 'for-each-ref', '--format=%(refname)', 'refs/heads/docs/')).toBe('refs/heads/docs/archive-feature');
  expect(readdirSync(join(f.home, 'operator/worktree-cleanup', refused.session_id)).filter(name => name.startsWith('archive-'))).toEqual([]);

  writeFileSync(join(f.parent, 'gh-state.json'), JSON.stringify({ ...f.ghState(), fail_create: false }));
  const value = f.plan({ recommendation: 'archive_then_delete', archive: { ...archive, git: { ...archive.git!, branch: 'docs/archive-feature-2', directory: 'docs/archive/2026-11-04-feature-2' } } });
  expect(await f.execute(value)).toEqual({ id: f.id, outcome: 'removed', reason: null, stage: 'remove', archive_pr: 'https://github.com/Fixture/Archive/pull/1' });
  expect(existsSync(f.tree)).toBe(false);
  const record = join(f.home, 'operator/worktree-cleanup', value.session_id, `archive-${f.id}-${value.items[0]!.plan_sha256}.json`);
  expect(statSync(record).mode & 0o777).toBe(0o600);
  expect(JSON.parse(readFileSync(record, 'utf8'))).toMatchObject({ pr: 'https://github.com/Fixture/Archive/pull/1' });
  expect(await f.execute(value)).toMatchObject({ outcome: 'removed', stage: 'reconcile', archive_pr: 'https://github.com/Fixture/Archive/pull/1' });
});

// Sibling inputs: a stale tracking ref alone, and a stale tracking ref with a local replacement that grafts the branch under the advertised main.
for (const replacement of [false, true]) routeTest(`a stale tracking ref does not prove that the remote keeps the branch commits${replacement ? ', even with a replacement graft' : ''}`, async f => {
  f.git(f.tree, 'checkout', '--', 'tracked.txt'); writeFileSync(join(f.tree, 'own.txt'), 'own\n'); commitAll(f.tree, 'own');
  f.git(f.tree, 'push', '-q', 'origin', 'feature'); f.git(f.repo, 'fetch', '-q', 'origin');
  // The plan is made after both changes, so its own observation agrees with them.
  f.git(f.parent, '--git-dir', f.remote, 'update-ref', '-d', 'refs/heads/feature');
  if (replacement) f.git(f.repo, 'replace', '--graft', f.git(f.repo, 'rev-parse', 'refs/remotes/origin/main'), f.git(f.tree, 'rev-parse', 'HEAD'));
  const value = f.plan();
  expect(value.items[0]!.loss!.commits).toEqual([]);
  expect(await f.execute(value)).toMatchObject({ outcome: 'reconcile_required', reason: 'removal_unproven', stage: 'remove' });
  expect(existsSync(f.tree)).toBe(true); expect(f.git(f.repo, 'branch', '--list', 'feature')).toContain('feature');
});

routeTest('the plan and execute routes run in the supervised child and write the audit record', async f => {
  const ui = join(f.parent, 'ui'); mkdirSync(ui); writeFileSync(join(ui, 'index.html'), '<!doctype html><title>fixture</title>');
  const childEnv = { REPO_HARNESS_HOME: f.home, REPO_HARNESS_WORKTREE_ROOT: f.parent };
  const run_process: typeof runSetupProcess = (argv, options) => runSetupProcess(['--preload', controlledWorktreeProcessPreload, ...argv], { ...options, cwd: f.repo });
  const server = await startOperatorServer({ port: 0, static_root: ui, env: childEnv,
    write_routes: [worktreeCleanupPlanWriteRoute({ env: childEnv, run_process }), worktreeCleanupExecuteWriteRoute({ env: childEnv, run_process })] });
  try {
    const cookie = ((await fetch(`${server.url}/`)).headers.get('set-cookie') ?? '').split(';')[0]!;
    const post = async (path: string, body: object) => {
      const response = await fetch(`${server.url}/api/v1/worktrees/cleanup/${path}`, { method: 'POST', body: JSON.stringify({ request_id: crypto.randomUUID(), ...body }),
        headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', Cookie: cookie } });
      return { status: response.status, body: await response.json() };
    };
    const first = await post('plan', { ids: [f.id] });
    expect(first.status).toBe(200);
    const second = await post('plan', { session_id: first.body.session_id, choices: [{ id: f.id, recommendation: 'delete', archive: none }] });
    expect(second.status).toBe(200);
    const executed = await post('execute', { ...f.authorize(second.body as CleanupPlan) });
    expect(executed).toEqual({ status: 200, body: { protocol: 1, kind: 'operator_authorized_worktree_cleanup', session_id: first.body.session_id,
      items: [{ id: f.id, outcome: 'removed', reason: null, stage: 'remove', archive_pr: null }] } });
    expect(existsSync(f.tree)).toBe(false);
    const audit = readFileSync(join(f.home, 'operator/audit.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    expect(audit.map(record => [record.phase, record.operation ?? record.status])).toEqual([
      ['intent', 'worktrees_cleanup_plan'], ['result', 200], ['intent', 'worktrees_cleanup_plan'], ['result', 200], ['intent', 'worktrees_cleanup_execute'], ['result', 200]]);
    expect(audit.find(record => record.operation === 'worktrees_cleanup_execute').target).toBe('worktrees');
  } finally { await server.close(); }
});

const quota = (state: string) => async () => ({ protocol: 'repo-harness.quota.v1', read_at: '2026-11-04T00:00:00.000Z', accounts: [
  { account: 'chatgpt', source: 'codex_app_server', observed_at: '2026-11-04T00:00:00.000Z', state, reason: state === 'unknown' ? 'no reading' : null, windows: [] }] });
const refusalCode = async (action: () => unknown) => { try { await action(); } catch (error) { return (error as { code?: string }).code; } return 'accepted'; };

// Sibling inputs of "no codex turn may start": each quota state that M60 refuses, a report that fails its decoder, a missing session and a plan above the cap.
routeTest('the investigation start refuses an exhausted or unknown chatgpt quota and a plan above the item cap, and changes nothing', async f => {
  const first = createCleanupSessionPlan([f.id], f.options());
  const unread = async () => ({ protocol: 'repo-harness.quota.v1', accounts: 'not a list' });
  for (const [name, read, code] of [['exhausted', quota('exhausted'), 'quota_exhausted'], ['unknown', quota('unknown'), 'quota_unknown'], ['unreadable report', unread, 'quota_unknown']] as const) {
    expect([name, await refusalCode(() => startCleanupInvestigation(first.session_id, { env: f.env, read_quota: read }))]).toEqual([name, code]);
  }
  expect(await refusalCode(() => startCleanupInvestigation('c'.repeat(32), { env: f.env, read_quota: quota('normal') }))).toBe('session_not_found');
  // A session above the cap: the same real item under distinct ids, with no loss evidence.
  const row = first.items[0]!.worktree, keep: CleanupAdvice = { recommendation: 'keep', reason: 'fixture', evidence: ['fixture'], archive: none };
  const ids = Array.from({ length: WORKTREE_CLEANUP_INVESTIGATION_MAX_ITEMS + 1 }, (_, index) => `wt_${index.toString(16).padStart(64, '0')}`);
  const large = createCleanupPlan('b'.repeat(32), ids.map(id => ({ observation: { worktree: { ...row, id }, loss: null }, advice: keep })));
  saveCleanupSession(f.env, { plan: large, items: Object.fromEntries(ids.map(id => [id, { target: { repository: f.repo, worktree: f.tree, id, kind: 'registered' as const }, loss: null }])) });
  expect(await refusalCode(() => startCleanupInvestigation(large.session_id, { env: f.env, read_quota: quota('normal') }))).toBe('investigation_too_large');
  for (const session of [first.session_id, large.session_id]) expect(loadCleanupInvestigation(f.env, session)).toBeNull();
  expect(loadCleanupSession(f.env, first.session_id).plan).toEqual(first);
});

routeTest('the investigation routes start one job, refuse a second while it runs, and record a failure when the child stops before its own record', async f => {
  const ui = join(f.parent, 'ui'); mkdirSync(ui); writeFileSync(join(ui, 'index.html'), '<!doctype html><title>fixture</title>');
  const childEnv = { ...f.env, REPO_HARNESS_HOME: f.home, REPO_HARNESS_WORKTREE_ROOT: f.parent };
  let stop: (code: 'timeout' | 'failed') => void = () => {};
  const run_process: typeof runSetupProcess = () => new Promise(resolve => { stop = code => resolve({ ok: false, code }); });
  const server = await startOperatorServer({ port: 0, static_root: ui, env: childEnv,
    write_routes: [worktreeCleanupInvestigationWriteRoute({ env: childEnv, read_quota: quota('normal'), run_process })] });
  try {
    const first = createCleanupSessionPlan([f.id], f.options());
    const cookie = ((await fetch(`${server.url}/`)).headers.get('set-cookie') ?? '').split(';')[0]!;
    const start = async () => {
      const response = await fetch(`${server.url}/api/v1/worktrees/cleanup/investigation`, { method: 'POST', body: JSON.stringify({ request_id: crypto.randomUUID(), session_id: first.session_id }),
        headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', Cookie: cookie } });
      return { status: response.status, body: await response.json() };
    };
    const status = async () => { const response = await fetch(`${server.url}/api/v1/worktrees/cleanup/investigation/${first.session_id}`); return { status: response.status, body: await response.json() }; };
    expect((await status()).status).toBe(404);
    const started = await start();
    expect(started).toMatchObject({ status: 202, body: { session_id: first.session_id, state: 'running', failure: null } });
    expect(await status()).toEqual({ status: 200, body: { ...started.body, plan: null } });
    expect(await start()).toMatchObject({ status: 409, body: { error: { code: 'investigation_running' } } });
    for (const [code, failure] of [['timeout', 'timeout'], ['failed', 'host_failed']] as const) {
      if (code === 'failed') { saveCleanupInvestigation(f.env, { ...started.body, state: 'failed', failure: 'timeout' }); expect((await start()).status).toBe(202); }
      stop(code);
      await Bun.sleep(50);
      expect((await status()).body).toMatchObject({ state: 'failed', failure, plan: null });
    }
    expect(loadCleanupSession(f.env, first.session_id).plan).toEqual(first);
    // A running record past its deadline has no parent left, so it reads as interrupted.
    const record = loadCleanupInvestigation(f.env, first.session_id)!;
    saveCleanupInvestigation(f.env, { ...record, state: 'running', failure: null, deadline_at: '2026-11-04T00:00:00.000Z' });
    expect(readCleanupInvestigationStatus(f.env, first.session_id)).toMatchObject({ state: 'failed', failure: 'interrupted' });
    // The real job child is the hidden CLI subcommand. Without codex credentials (macOS) or Seatbelt (other hosts) it records its own typed failure.
    const real = await startCleanupInvestigation(first.session_id, { env: childEnv, read_quota: quota('normal') });
    for (let turn = 0; turn < 600 && loadCleanupInvestigation(f.env, first.session_id)?.state === 'running'; turn++) await Bun.sleep(100);
    expect(loadCleanupInvestigation(f.env, first.session_id)).toMatchObject({ job_id: real.job_id, state: 'failed', failure: process.platform === 'darwin' ? 'host_failed' : 'isolation_unproven' });
    if (process.platform === 'darwin') expect(readFileSync(join(f.home, 'operator/worktree-cleanup-investigation', `${real.job_id}-error.txt`), 'utf8')).toContain('review_auth');
    expect(loadCleanupSession(f.env, first.session_id).plan).toEqual(first);
    const audit = readFileSync(join(f.home, 'operator/audit.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    expect(audit.filter(entry => entry.phase === 'intent').map(entry => [entry.operation, entry.target])).toEqual([
      ['worktrees_cleanup_investigation', `worktree_cleanup_session:${first.session_id}`], ['worktrees_cleanup_investigation', `worktree_cleanup_session:${first.session_id}`],
      ['worktrees_cleanup_investigation', `worktree_cleanup_session:${first.session_id}`]]);
  } finally { await server.close(); }
});

const darwinRouteTest = (name: string, body: (f: Fixture) => Promise<void>) => process.platform === 'darwin' ? routeTest(name, body) : test.skip(name, () => {});
const answer = (request: TaskRequest, items: unknown) => ({ request_id: request.request_id, context_sha256: request.context_sha256, value: { items } });
const writer = (result: (request: TaskRequest, id: string) => unknown): CleanupInvestigator => async (run, request) => {
  const manifest = JSON.parse(readFileSync(join(run.output, CLEANUP_INVESTIGATION_MANIFEST), 'utf8'));
  writeFileSync(request.result_ref, JSON.stringify(result(request, manifest.items[0].id)));
};

darwinRouteTest('decoded advice becomes a new plan version with nothing authorized, and each malformed answer fails the job with no plan change', async f => {
  const deleteAdvice = (id: string) => ({ id, advice: { recommendation: 'delete' as const, reason: 'The change is a review note.', evidence: ['Changed paths: 1.'], archive: none } });
  // Sibling inputs of "the agent answer is not advice for exactly this plan".
  const malformed: Array<[string, CleanupInvestigator]> = [
    ['no result file', async () => {}],
    ['not JSON', async (_run, request) => writeFileSync(request.result_ref, '{')],
    ['a link to another file', async (run, request) => symlinkSync(join(run.output, CLEANUP_INVESTIGATION_MANIFEST), request.result_ref)],
    ['another request', writer((request, id) => ({ ...answer(request, [deleteAdvice(id)]), request_id: crypto.randomUUID() }))],
    ['an unknown item', writer(request => answer(request, [deleteAdvice(`wt_${'0'.repeat(64)}`)]))],
    ['a missing item', writer(request => answer(request, []))],
    ['an extra field', writer((request, id) => answer(request, [{ ...deleteAdvice(id), authorized: true }]))],
    ['a path that is not archivable', writer((request, id) => answer(request, [{ id, advice: { ...deleteAdvice(id).advice, recommendation: 'archive_then_delete',
      archive: { git: null, private: { directory: f.repoId, paths: ['.gitignore'] } } } }]))],
  ];
  for (const [name, investigate] of malformed) {
    const first = createCleanupSessionPlan([f.id], f.options());
    const outcome = await runCleanupInvestigation(first.session_id, crypto.randomUUID().replaceAll('-', ''), { env: f.env, deadline: Date.now() + 30_000, investigate })
      .then(() => 'accepted', error => error instanceof CleanupInvestigationError ? error.failure : String(error));
    expect([name, outcome]).toEqual([name, 'advice_invalid']);
    expect(loadCleanupSession(f.env, first.session_id).plan).toEqual(first);
  }
  // A user choice saved during the turn wins over the agent answer.
  const raced = createCleanupSessionPlan([f.id], f.options());
  const chosen = await runCleanupInvestigation(raced.session_id, 'a'.repeat(32), { env: f.env, deadline: Date.now() + 30_000, investigate: async (run, request) => {
    await writer((value, id) => answer(value, [deleteAdvice(id)]))(run, request, '', 0);
    chooseCleanupSessionPlan(raced.session_id, [{ id: f.id, recommendation: 'delete', archive: none }], f.options());
  } }).then(() => 'accepted', error => (error as CleanupInvestigationError).failure);
  expect(chosen).toBe('plan_changed');
  expect(loadCleanupSession(f.env, raced.session_id).plan.items[0]!.advice.reason).toBe(raced.items[0]!.advice.reason);

  const first = createCleanupSessionPlan([f.id], f.options());
  let manifest: { items: { id: string; evidence: unknown; loss: unknown }[] } | null = null;
  const plan = await runCleanupInvestigation(first.session_id, 'b'.repeat(32), { env: f.env, deadline: Date.now() + 30_000, investigate: async (run, request, context) => {
    manifest = JSON.parse(readFileSync(join(run.output, CLEANUP_INVESTIGATION_MANIFEST), 'utf8'));
    expect(context).toContain(`Read ${CLEANUP_INVESTIGATION_MANIFEST} in your working directory.`);
    await writer((value, id) => answer(value, [deleteAdvice(id)]))(run, request, context, 0);
  } });
  // The manifest is the server observation: the public loss summary and the private evidence, with no host path.
  expect(manifest!.items.map(item => item.id)).toEqual([f.id]);
  expect(manifest!.items[0]!.loss).toEqual(first.items[0]!.loss);
  expect(manifest!.items[0]!.evidence).toEqual(loadCleanupSession(f.env, first.session_id).items[f.id]!.loss);
  expect(JSON.stringify(manifest)).not.toContain(f.parent);
  expect(plan.items[0]!.advice).toEqual(deleteAdvice(f.id).advice);
  expect(plan.items[0]!.loss_sha256).toBe(first.items[0]!.loss_sha256);
  expect(loadCleanupSession(f.env, first.session_id).plan).toEqual(plan);
  // Advice is not authorization: the item is selectable only by the user, and execution without an approval removes nothing.
  expect(cleanupSelection(plan.items[0]!)).toEqual({ selectable: true, selected_by_default: false });
  expect((await runAuthorizedCleanup(decodeAuthorizedCleanupRequest({ session_id: plan.session_id, ids: [f.id],
    expected_digest: cleanupPlanSelectionDigest(plan, [f.id]), approvals: [] }), f.options())).items[0]).toMatchObject({ outcome: 'skipped', reason: 'not_approved' });
  expect(existsSync(f.tree)).toBe(true);
});

darwinRouteTest('zero-model probes through the launcher: the fake codex cannot read or write a target worktree, write the primary checkout or connect to localhost, and writes only its output', async f => {
  const first = createCleanupSessionPlan([f.id], f.options());
  const session = loadCleanupSession(f.env, first.session_id);
  const run = prepareCleanupInvestigation(f.env, first.session_id, 'c'.repeat(32), [session.items[f.id]!.target]);
  const common = realpathSync(join(f.repo, '.git'));
  expect(run.paths.cleanup?.readDenied).toEqual([common, join(common, 'worktrees/repo-wt-feature'), realpathSync(f.tree)].sort());
  const bin = join(f.parent, 'fake-codex-bin'); mkdirSync(bin);
  const outside = join(f.parent, 'outside.txt');
  // Listeners make a refused connect come from the profile, not from a closed port.
  const v4 = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
  const v6 = Bun.listen({ hostname: '::1', port: 0, socket: { data() {} } });
  for (const [host, port] of [['127.0.0.1', v4.port], ['::1', v6.port], ['::ffff:127.0.0.1', v4.port]] as const) {
    expect(spawnSync('/usr/bin/nc', ['-z', '-G', '2', host, String(port)]).status).toBe(0);
  }
  // Each line names one access and whether the OS allowed it.
  writeFileSync(join(bin, 'codex'), `#!/bin/sh
probe() { name="$1"; shift; if "$@" >/dev/null 2>&1; then echo "$name allowed"; else echo "$name denied"; fi; }
probe read-target-file /bin/cat '${f.tree}/tracked.txt'
probe list-target /bin/ls '${f.tree}'
probe read-target-git-dir /bin/ls '${common}/worktrees'
probe read-common-git-dir /bin/cat '${common}/HEAD'
probe write-target /bin/sh -c "echo changed > '${f.tree}/tracked.txt'"
probe write-primary /bin/sh -c "echo changed > '${f.repo}/tracked.txt'"
probe write-outside /bin/sh -c "echo changed > '${outside}'"
probe write-output /bin/sh -c "echo written > '${run.output}/probe.txt'"
probe read-manifest-dir /bin/ls '${run.output}'
probe connect-localhost-v4 /usr/bin/nc -z -G 2 127.0.0.1 ${v4.port}
probe connect-localhost-v6 /usr/bin/nc -z -G 2 ::1 ${v6.port}
probe connect-mapped-v4 /usr/bin/nc -z -G 2 ::ffff:127.0.0.1 ${v4.port}
# A TEST-NET address has no listener and may have no route; only the profile answers EPERM.
if /usr/bin/nc -v -z -G 1 192.0.2.1 9 2>&1 | /usr/bin/grep -q 'Operation not permitted'; then echo 'connect-remote-v4 denied'; else echo 'connect-remote-v4 not-denied'; fi
`);
  chmodSync(join(bin, 'codex'), 0o755);
  const vendor = Bun.which('codex', { PATH: bin })!;
  expect(vendor).toBe(join(bin, 'codex'));
  const launcher = prepareReviewLauncher(run.control, run.policyFile, vendor);
  const probed = runLauncher(launcher, bin);
  v4.stop(true); v6.stop(true);
  expect(probed).toEqual(['read-target-file denied', 'list-target denied', 'read-target-git-dir denied', 'read-common-git-dir denied', 'write-target denied',
    'write-primary denied', 'write-outside denied', 'write-output allowed', 'read-manifest-dir allowed',
    'connect-localhost-v4 denied', 'connect-localhost-v6 denied', 'connect-mapped-v4 denied', 'connect-remote-v4 not-denied']);
  expect(readFileSync(join(f.tree, 'tracked.txt'), 'utf8')).toBe('reviewed change\n');
  expect(readFileSync(join(f.repo, 'tracked.txt'), 'utf8')).toBe('base\n');
  expect(existsSync(outside)).toBe(false);
  expect(readFileSync(join(run.output, 'probe.txt'), 'utf8')).toBe('written\n');
});

function runLauncher(launcher: string, bin: string): string[] {
  const result = execFileSync(launcher, [], { encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin` }, timeout: 15_000 });
  return result.trim().split('\n');
}

