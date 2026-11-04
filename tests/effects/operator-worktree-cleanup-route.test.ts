import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeAuthorizedCleanupRequest, type CleanupArchivePlan, type CleanupPlan } from '../../src/core/operator/worktree-cleanup-plan';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { worktreeId } from '../../src/effects/git/worktree-record';
import type { WorktreeProcess } from '../../src/effects/git/worktree-processes';
import type { GithubCommandRunner } from '../../src/effects/github/issues';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { runSetupProcess } from '../../src/effects/setup/collector';
import { createGithubDraftPrPublisher } from '../../src/effects/operator/doc-session-finalize-github';
import { startOperatorServer } from '../../src/effects/operator/server';
import { cleanupPlanSelectionDigest } from '../../src/effects/operator/worktree-cleanup-plan';
import { CLEANUP_ARCHIVE_BRANCH } from '../../src/effects/operator/worktree-cleanup-publish';
import {
  chooseCleanupSessionPlan, createCleanupSessionPlan, runAuthorizedCleanup, worktreeCleanupExecuteWriteRoute, worktreeCleanupPlanWriteRoute,
} from '../../src/effects/operator/worktree-cleanup-route';
import { loadCleanupSession } from '../../src/effects/operator/worktree-cleanup-store';
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
  const env = { ...process.env, REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: parent };
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

routeTest('a stale tracking ref does not prove that the remote keeps the branch commits', async f => {
  f.git(f.tree, 'checkout', '--', 'tracked.txt'); writeFileSync(join(f.tree, 'own.txt'), 'own\n'); commitAll(f.tree, 'own');
  f.git(f.tree, 'push', '-q', 'origin', 'feature'); f.git(f.repo, 'fetch', '-q', 'origin');
  const value = f.plan();
  expect(value.items[0]!.loss!.commits).toEqual([]);
  f.git(f.parent, '--git-dir', f.remote, 'update-ref', '-d', 'refs/heads/feature');
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
