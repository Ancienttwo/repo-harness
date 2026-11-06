import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CleanupPlanItem } from '../../src/core/operator/worktree-cleanup-plan';
import type { WorktreeView } from '../../src/core/public-projections/worktrees';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { worktreeId } from '../../src/effects/git/worktree-record';
import type { GithubCommandRunner } from '../../src/effects/github/issues';
import { createGithubDraftPrPublisher } from '../../src/effects/operator/doc-session-finalize-github';
import { observeCleanupLoss } from '../../src/effects/operator/worktree-cleanup-observation';
import { cleanupPlanSelectionDigest, createCleanupPlan, executeCleanupPlan, type CleanupExecutionPorts } from '../../src/effects/operator/worktree-cleanup-plan';
import { CLEANUP_ARCHIVE_BRANCH, createCleanupArchivePorts } from '../../src/effects/operator/worktree-cleanup-publish';
import { pushCommitToNewRemoteRef } from '../../src/effects/publication/new-remote-ref-push';
import { inspectWorktree } from '../../src/effects/state/coordination-worktree-topology';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';

const sid = 'a'.repeat(32), repoId = `repo_${'b'.repeat(16)}`, archivePath = 'docs/archive/2026-11-04-feature', branch = 'docs/archive-feature';

/** A GitHub stand-in for the `gh api` calls of the Draft PR publisher. It reads the pushed head from the local bare remote. */
const FAKE_GH = `
const fs = require('node:fs'), { execFileSync } = require('node:child_process');
const file = process.env.FAKE_GH_STATE, state = JSON.parse(fs.readFileSync(file, 'utf8')), args = process.argv.slice(2);
const method = args[args.indexOf('--method') + 1], endpoint = args.find(arg => arg.startsWith('repos/'));
const fields = Object.fromEntries(args.flatMap((arg, i) => arg === '--raw-field' || arg === '--field' ? [args[i + 1].split(/=(.*)/su).slice(0, 2)] : []));
const save = () => fs.writeFileSync(file, JSON.stringify(state));
const repository = { id: 42, full_name: 'Fixture/Archive' };
state.calls.push(method + ' ' + endpoint.split('?')[0]);
let out;
if (method === 'GET' && endpoint === 'repos/Fixture/Archive') {
  out = { ...repository, html_url: 'https://github.com/Fixture/Archive', archived: false, disabled: false, default_branch: 'main', permissions: { push: true } };
} else if (method === 'GET' && endpoint.startsWith('repos/Fixture/Archive/pulls?')) {
  const query = new URLSearchParams(endpoint.split('?')[1]);
  out = query.get('page') === '1' ? state.pulls.filter(pr => 'Fixture:' + pr.head.ref === query.get('head')) : [];
} else if (method === 'POST' && endpoint === 'repos/Fixture/Archive/pulls') {
  const sha = execFileSync(process.env.FAKE_GH_GIT, ['--git-dir', process.env.FAKE_GH_REMOTE, 'rev-parse', 'refs/heads/' + fields.head], { encoding: 'utf8' }).trim();
  const number = state.pulls.length + 1;
  out = { number, html_url: 'https://github.com/Fixture/Archive/pull/' + number, state: 'open', draft: fields.draft === 'true', merged_at: null,
    title: fields.title, body: fields.body, head: { ref: fields.head, sha, repo: repository }, base: { ref: fields.base, repo: repository } };
  state.pulls.push(out);
  if (state.lose_create_response) { state.lose_create_response = false; save(); process.stderr.write('connection reset\\n'); process.exit(1); }
} else { process.stderr.write('unexpected gh call\\n'); process.exit(2); }
save(); process.stdout.write(JSON.stringify(out));
`;

function fixture(push: 'url' | 'pushurl' = 'url') {
  const parent = tmpWorkspace('cleanup-publish'), repo = join(parent, 'repo'), tree = join(parent, 'repo-wt-feature');
  const home = join(parent, 'home'), staging = join(parent, 'staging'), remote = join(parent, 'remote.git'), bin = join(parent, 'bin');
  for (const path of [repo, home, staging, bin]) mkdirSync(path, { mode: 0o700 });
  const git = (cwd: string, ...args: string[]) => { const r = run('git', args, cwd); expect(r.status).toBe(0); return r.stdout.trim(); };
  initGitRepo(repo); mkdirSync(join(repo, 'docs'));
  writeFileSync(join(repo, 'docs/guide.md'), 'base\n'); writeFileSync(join(repo, '.gitignore'), '.env\n'); commitAll(repo, 'base');
  git(parent, 'init', '--bare', '-q', remote);
  git(repo, 'remote', 'add', 'origin', remote); git(repo, 'push', '-q', 'origin', 'main'); git(repo, 'fetch', '-q', 'origin');
  if (push === 'pushurl') git(repo, 'remote', 'set-url', '--push', 'origin', `file://${remote}`);
  git(repo, 'worktree', 'add', '-b', 'feature', tree);
  writeFileSync(join(tree, 'docs/guide.md'), 'working\n'); writeFileSync(join(tree, '.env'), 'SYNTHETIC=fixture\n');
  const env = { ...process.env, REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: parent };
  const target = { repository: repo, worktree: tree, id: worktreeId(resolveGitCommonDirectory(repo), tree), kind: 'registered' as const };
  const observe = () => {
    const worktree: WorktreeView = { id: target.id, repository_id: repoId, directory: 'repo-wt-feature', branch: 'feature', source: 'manual',
      size_bytes: null, size_observed_at: null, record: null, ...inspectWorktree(repo, tree, repo, { env, processes: [] }) };
    return { worktree, loss: observeCleanupLoss(target, { env, deadline: Date.now() + 20_000 }) };
  };
  const plan = createCleanupPlan(sid, [{ observation: observe(), advice: {
    recommendation: 'archive_then_delete', reason: 'Keep the reviewed changes.', evidence: ['Fixture content reviewed.'],
    archive: { git: { directory: archivePath, branch, paths: ['docs/guide.md'], include_commits: false }, private: { directory: repoId, paths: ['.env'] } },
  } }]);
  const item = plan.items[0]!;

  const stateFile = join(parent, 'gh-state.json'), gh = join(bin, 'gh');
  writeFileSync(stateFile, JSON.stringify({ calls: [], pulls: [], lose_create_response: false }));
  writeFileSync(gh, `#!${process.execPath}\n${FAKE_GH}`); chmodSync(gh, 0o755);
  const ghEnv = { PATH: bin, FAKE_GH_STATE: stateFile, FAKE_GH_REMOTE: remote, FAKE_GH_GIT: Bun.which('git')! };
  const runner: GithubCommandRunner = (args, limits) => ({
    stdout: execFileSync('gh', [...args], { env: ghEnv, encoding: 'utf8', timeout: limits.timeout_ms, maxBuffer: limits.max_buffer, stdio: ['ignore', 'pipe', 'pipe'] }),
  });
  const state = () => JSON.parse(readFileSync(stateFile, 'utf8')) as { calls: string[]; pulls: Array<Record<string, any>>; lose_create_response: boolean };
  // The remote URL is a local bare path, so the test supplies the target that GitHub remote selection returns for a github.com remote.
  const github = { ...createGithubDraftPrPublisher(env, CLEANUP_ARCHIVE_BRANCH, runner),
    publication_target: async (checkout: string) => { expect(checkout).toBe(repo); return { remote: 'origin', repository: 'Fixture/Archive', base_branch: 'main' }; } };
  const archive = createCleanupArchivePorts(sid, { env, staging_root: staging, stage_timeout_ms: 20_000, github,
    target: id => { expect(id).toBe(target.id); return target; } });

  const ref = `refs/heads/${branch}`;
  const local = () => run('git', ['rev-parse', '--verify', '-q', ref], repo).stdout.trim() || null;
  const pushed = () => git(repo, 'ls-remote', '--refs', remote, ref).split('\t')[0] || null;
  const calls: string[] = [];
  const ports: CleanupExecutionPorts = {
    loadPlan: async () => plan, reconcile: async () => ({ state: 'absent' }), observe: async () => observe(),
    archiveCommit: async (key: string, value: CleanupPlanItem) => { calls.push('commit'); await archive.archiveCommit(key, value); },
    archivePush: async (key: string, value: CleanupPlanItem) => { calls.push('push'); await archive.archivePush(key, value); },
    archivePr: async (key: string, value: CleanupPlanItem) => { calls.push('pr'); return archive.archivePr(key, value); },
    // A stand-in for the deletion adapter: it records what is published when removal would start.
    remove: async (_key, _item, verify) => { await verify(); calls.push(`remove local=${local()} remote=${pushed()} drafts=${state().pulls.filter(pr => pr.draft).length}`); },
  };
  const request = { session_id: sid, ids: [item.worktree.id], expected_digest: cleanupPlanSelectionDigest(plan, [item.worktree.id]),
    approvals: [{ id: item.worktree.id, plan_sha256: item.plan_sha256, loss_sha256: item.loss_sha256! }] };
  const operation = createHash('sha256').update(`${sid}:${item.worktree.id}:${item.plan_sha256}`).digest('hex');
  return { parent, repo, tree, home, remote, git, ports, request, calls, state, local, pushed, ref, operation,
    loseCreateResponse: () => writeFileSync(stateFile, JSON.stringify({ ...state(), lose_create_response: true })),
    cleanup: () => rmSync(parent, { recursive: true, force: true }) };
}
type Fixture = ReturnType<typeof fixture>;

function publishTest(name: string, body: (f: Fixture) => Promise<void>, push: 'url' | 'pushurl' = 'url') {
  test(name, async () => {
    const f = fixture(push);
    try { await body(f); } finally { f.cleanup(); }
  }, 60_000);
}

// Sibling push targets: the remote's url and its pushurl. Neither may write a tracking ref that the bound loss covers.
for (const push of ['url', 'pushurl'] as const) publishTest(`the archive commit, push and Draft PR are read back before removal, and a credential file stays private (${push})`, async f => {
  const tracking = () => f.git(f.repo, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/remotes/'), before = tracking();
  expect((await executeCleanupPlan(f.request, f.ports)).items[0]).toMatchObject({ outcome: 'removed', reason: null, archive_pr: 'https://github.com/Fixture/Archive/pull/1' });
  const head = f.local()!;
  expect(f.calls).toEqual(['commit', 'push', 'pr', `remove local=${head} remote=${head} drafts=1`]);
  expect(f.state().pulls[0]).toMatchObject({ draft: true, base: { ref: 'main' }, head: { ref: branch, sha: head } });
  const remoteGit = (...args: string[]) => f.git(f.parent, '--git-dir', f.remote, ...args);
  expect(remoteGit('rev-parse', `${head}^`)).toBe(f.git(f.repo, 'rev-parse', 'refs/remotes/origin/main'));
  expect(remoteGit('ls-tree', '-r', '--name-only', head).split('\n').sort()).toEqual(['.gitignore', `${archivePath}/.cleanup/index/0/docs/guide.md`, `${archivePath}/SOURCE.md`, `${archivePath}/docs/guide.md`, 'docs/guide.md']);
  expect(remoteGit('show', `${head}:${archivePath}/docs/guide.md`)).toBe('working');
  expect(readFileSync(join(f.home, 'archive', repoId, f.operation, '.env'), 'utf8')).toBe('SYNTHETIC=fixture\n');
  expect(readFileSync(join(f.tree, '.env'), 'utf8')).toBe('SYNTHETIC=fixture\n');
  expect(tracking()).toBe(before);
}, push);

// Sibling outcomes: a landed push, a replay, a taken ref, no push, a lost reply and a ref created after the preflight.
publishTest('the new remote ref push proves each result and never reports an uncertain push as not sent', async f => {
  const main = f.git(f.repo, 'rev-parse', 'main'), commit = f.git(f.repo, 'commit-tree', 'main^{tree}', '-p', main, '-m', 'archive');
  const remoteGit = (...args: string[]) => f.git(f.parent, '--git-dir', f.remote, ...args), shim = join(f.parent, 'git-shim');
  writeFileSync(shim, `#!/bin/sh\ncase " $* " in *" push "*)\n  [ "$SHIM" = race ] && "$REAL" --git-dir "${f.remote}" update-ref "${f.ref}" ${main}\n  "$REAL" "$@"; code=$?\n  [ "$SHIM" = lost ] && exit 1; exit $code;;\nesac\nexec "$REAL" "$@"\n`);
  chmodSync(shim, 0o755);
  const tracking = () => f.git(f.repo, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/remotes/'), before = tracking();
  const cases: Array<[Record<string, string>, string, string | null, string, string | null]> = [
    [{}, f.remote, null, 'pushed', commit],
    [{}, f.remote, commit, 'pushed', commit],
    [{}, f.remote, main, 'refused', main],
    [{}, join(f.parent, 'missing.git'), null, 'not_pushed', null],
    [{ SHIM: 'lost' }, f.remote, null, 'unknown', commit],
    [{ SHIM: 'race' }, f.remote, null, 'unknown', main],
  ];
  for (const [shimEnv, remote_url, existing, state, after] of cases) {
    if (f.pushed() !== null) remoteGit('update-ref', '-d', f.ref);
    if (existing !== null) remoteGit('update-ref', f.ref, existing);
    const env = { ...process.env, REPO_HARNESS_GIT_BIN: shim, REAL: Bun.which('git')!, ...shimEnv };
    expect(pushCommitToNewRemoteRef(env, { checkout: f.repo, remote_url, ref: f.ref, commit })).toEqual({ state } as never);
    expect(f.pushed()).toBe(after);
  }
  expect(tracking()).toBe(before);
});

publishTest('a retry after a lost Draft PR create reconciles the key and creates no second branch, commit or PR', async f => {
  f.loseCreateResponse();
  expect((await executeCleanupPlan(f.request, f.ports)).items[0]).toMatchObject({ outcome: 'reconcile_required', reason: 'archive_failed', stage: 'archive_pr' });
  expect(f.calls.some(call => call.startsWith('remove'))).toBe(false);
  const head = f.local()!;
  expect((await executeCleanupPlan(f.request, f.ports)).items[0]).toMatchObject({ outcome: 'removed', archive_pr: 'https://github.com/Fixture/Archive/pull/1' });
  expect(f.local()).toBe(head); expect(f.pushed()).toBe(head);
  expect(f.git(f.repo, 'for-each-ref', '--format=%(refname)', 'refs/heads/docs/')).toBe(f.ref);
  expect(f.git(f.repo, 'rev-list', '--count', `refs/remotes/origin/main..${head}`)).toBe('1');
  expect(f.state().pulls).toHaveLength(1); expect(f.state().calls.filter(call => call.startsWith('POST'))).toHaveLength(1);
});

for (const owner of ['local', 'remote'] as const) {
  publishTest(`a ${owner} archive branch of another commit is never moved and gets no Draft PR`, async f => {
    const main = f.git(f.repo, 'rev-parse', 'main');
    if (owner === 'local') f.git(f.repo, 'branch', branch, main); else f.git(f.parent, '--git-dir', f.remote, 'update-ref', f.ref, main);
    expect((await executeCleanupPlan(f.request, f.ports)).items[0]).toMatchObject({ outcome: 'reconcile_required', reason: 'archive_failed', stage: owner === 'local' ? 'archive_commit' : 'archive_push' });
    expect(owner === 'local' ? f.local() : f.pushed()).toBe(main);
    expect(f.calls.some(call => call.startsWith('remove'))).toBe(false); expect(f.state().pulls).toEqual([]);
  });
}
