import { readOperatorAdmittedTaskActivity } from '../../src/effects/operator/admitted-task-activity';
import { buildTaskMessageEvent, canonicalTaskMessageEventBytes } from '../../src/core/fleet/admitted-task-message';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canonicalize } from '../../src/core/evidence/canonical-json';
import { decodeOperatorTaskDiff, TASK_DIFF_MAX_BYTES } from '../../src/core/operator/task-diff';
import { readOperatorTaskDiff } from '../../src/effects/operator/task-diff';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { taskRepository } from '../../src/effects/terminal/task-worktree';
import { observeTaskSessionAdmission, ensureSessionDirectory, taskSessionDirectory, writeSessionArtifact, type HerdrTaskBinding } from '../../src/effects/terminal/task-session';
import { readReviewAdmissionSource } from '../../src/effects/review/admission-source';
import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';

const cleanup: string[] = [];
let originalGitGlobal: string | undefined;
let originalGitSystem: string | undefined;
beforeEach(() => {
  originalGitGlobal = process.env.GIT_CONFIG_GLOBAL;
  originalGitSystem = process.env.GIT_CONFIG_NOSYSTEM;
  const configHome = mkdtempSync(join(tmpdir(), 'operator-diff-config-')); cleanup.push(configHome);
  const config = join(configHome, 'gitconfig'); writeFileSync(config, '');
  process.env.GIT_CONFIG_GLOBAL = config;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
});
afterEach(() => {
  if (originalGitGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL;
  else process.env.GIT_CONFIG_GLOBAL = originalGitGlobal;
  if (originalGitSystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
  else process.env.GIT_CONFIG_NOSYSTEM = originalGitSystem;
});
afterEach(() => { for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true }); });
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const digest = (value: unknown) => 'sha256:' + createHash('sha256').update(canonicalize(JSON.parse(JSON.stringify(value)))).digest('hex');
function fixture(linkedOwner = false, task = 'review-diff') {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'operator-diff-'))); cleanup.push(parent);
  const root = join(parent, 'repo'), worktree = join(parent, 'worktree'), home = join(parent, 'home');
  mkdirSync(root); mkdirSync(home, { mode: 0o700 });
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.invalid');
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), '.ai/\n');
  writeFileSync(join(root, 'file.txt'), 'base\n'); git(root, 'add', '.'); git(root, 'commit', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'worktree', 'add', '-b', 'codex/diff', worktree);
  const repositoryId = repoHarnessRepoIdFor(root), now = new Date().toISOString();
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [{ id: repositoryId, path: root, accessMode: 'read_only', source: 'adopt', registeredAt: now, lastSeenAt: now }] }));
  const sourceRoot = linkedOwner ? join(parent, 'owner') : root;
  if (linkedOwner) { git(root, 'worktree', 'add', '-b', 'owner', sourceRoot); mkdirSync(join(sourceRoot, '.ai/harness'), { recursive: true }); }
  const approved = seedReviewAdmissionFixture(sourceRoot, home);
  const { policy_revision: _, ...external_sources } = approved.policy;
  writeFileSync(join(sourceRoot, '.ai/harness/policy.json'), JSON.stringify({ external_sources, worktree_strategy: { review_base: 'main' } }));
  const claim = { reference: 'https://github.com/acme/widgets/issues/903#issuecomment-1', revision: 'sha256:' + 'c'.repeat(64) };
  const spec = { task, role: 'deep-reasoner', harness_kind: 'codex' };
  // Read-only transport fixture, not a live process or operator approval proof.
  const binding: HerdrTaskBinding = { protocol: 2, ...spec, runtime: 'herdr', repository_id: taskRepository(root).repository_id,
    execution_root: worktree, max_requests: 3, endpoint: { session: 'fixture' }, pane_id: 'pane', terminal_id: 'terminal', workspace_id: 'workspace',
    agent_name: 'fixture', ownership: { disposition: 'attached' }, provider: { pid: 123, identity: 'fixture', ownership: { disposition: 'attached' } },
    shell: { pid: 122, identity: 'fixture-shell' }, task_admission: observeTaskSessionAdmission(worktree, spec, 'herdr', { source: approved.source, claim }) };
  const dir = taskSessionDirectory(root, spec.task, spec.role); ensureSessionDirectory(root, dir);
  writeSessionArtifact(join(dir, 'binding.json'), binding);
  const selector = { repository_id: repositoryId, provider_repository_id: approved.admission.repository_id, issue_id: approved.admission.issue_id,
    campaign_id: approved.admission.campaign_id, task: spec.task, role: spec.role, claim_ref: claim.reference, claim_revision: claim.revision,
    grant_sha256: approved.grant, policy_sha256: approved.admission.policy.policy_sha256, actor_id: approved.admission.actor_id, session_binding_sha256: digest(binding) };
  const input = { ...selector, env: { REPO_HARNESS_HOME: home } };
  const effects = { admissionSource: ((repo, values) => ({ ...readReviewAdmissionSource(repo, values), authorityHome: home, runner: approved.source.runner })) as typeof readReviewAdmissionSource };
  const read = (request = input) => readOperatorTaskDiff(request, effects);
  const query = new URLSearchParams(Object.fromEntries(Object.entries(selector).filter(([key]) => key !== 'repository_id')));
  const path = `/api/v1/fleet/task-sessions/${repositoryId}/diff?${query}`;
  return { root, sourceRoot, worktree, home, base, input, selector, binding, dir, effects, read, path, approved };
}

test('read-only registry: explicit target/head, committed and dirty tracked changes, separate untracked paths', () => {
  const f = fixture();
  writeFileSync(join(f.worktree, 'committed.txt'), 'commit\n'); git(f.worktree, 'add', '.'); git(f.worktree, 'commit', '-m', 'work');
  writeFileSync(join(f.worktree, 'file.txt'), 'staged\n'); git(f.worktree, 'add', 'file.txt'); writeFileSync(join(f.worktree, 'file.txt'), '<script>dirty</script>\n');
  writeFileSync(join(f.worktree, 'untracked space.txt'), 'not loaded');
  const result = f.read();
  expect(result.base_sha).toBe(f.base); expect(result.head_sha).toBe(git(f.worktree, 'rev-parse', 'HEAD'));
  expect(result.patch).toContain('+commit'); expect(result.patch).toContain('+<script>dirty</script>');
  expect(result.untracked_paths).toEqual(['untracked space.txt']); expect(result.patch).not.toContain('not loaded');
  expect(JSON.stringify(result)).not.toContain(f.root); expect(decodeOperatorTaskDiff(result, f.selector)).toEqual(result);
  expect(() => decodeOperatorTaskDiff({ ...result, task: 'other-task' }, f.selector)).toThrow();
  expect(() => decodeOperatorTaskDiff({ ...result, worktree: f.worktree }, f.selector)).toThrow();
});

test('untracked-only is distinct from empty and policy target commit is resolved freshly', () => {
  const f = fixture();
  expect(f.read().patch).toBe('');
  writeFileSync(join(f.worktree, 'new.txt'), 'new');
  expect(f.read().untracked_paths).toEqual(['new.txt']);
  writeFileSync(join(f.root, 'target.txt'), 'target'); git(f.root, 'add', 'target.txt'); git(f.root, 'commit', '-m', 'target moved');
  const result = f.read();
  expect(result.base_sha).toBe(git(f.root, 'rev-parse', 'HEAD')); expect(result.base_sha).not.toBe(f.base);
});

test('stale fence, foreign worktree and missing binding fail closed', () => {
  const f = fixture();
  expect(() => f.read({ ...f.input, session_binding_sha256: 'sha256:' + '0'.repeat(64) })).toThrow('stale');
  expect(() => f.read({ ...f.input, claim_revision: 'sha256:' + '0'.repeat(64) })).toThrow('stale');
  const foreign = fixture();
  writeSessionArtifact(join(f.dir, 'binding.json'), { ...f.binding, execution_root: foreign.worktree }, false);
  expect(() => f.read()).toThrow('unavailable');
  writeSessionArtifact(join(f.dir, 'binding.json'), { ...f.binding, execution_root: join(f.root, 'absent') }, false);
  expect(() => f.read()).toThrow('unavailable');
});

test('external diff/textconv are disabled and oversized patches are refused', () => {
  const f = fixture();
  git(f.worktree, 'config', 'diff.external', 'false');
  git(f.worktree, 'config', 'diff.custom.textconv', 'false');
  writeFileSync(join(f.worktree, '.gitattributes'), 'file.txt diff=custom\n');
  writeFileSync(join(f.worktree, 'file.txt'), 'changed\n');
  expect(f.read().patch).toContain('+changed');
  writeFileSync(join(f.worktree, 'file.txt'), 'x'.repeat(TASK_DIFF_MAX_BYTES + 100));
  expect(() => f.read()).toThrow('too_large');
});

test('HTTP reader with explicit synthetic approval returns the same fenced read without machine paths', async () => {
  const f = fixture();
  const { startOperatorServer } = await import('../../src/effects/operator/server');
  const server = await startOperatorServer({ port: 0, static_root: f.root, env: f.input.env, read_task_diff: async request => { const { signal: _, ...selector } = request; return readOperatorTaskDiff({ ...selector, env: f.input.env }, f.effects); } });
  try {
    writeFileSync(join(f.worktree, 'file.txt'), 'via worker\n');
    const response = await fetch(server.url + f.path);
    expect(response.status).toBe(200);
    const value = decodeOperatorTaskDiff(await response.json(), f.selector);
    expect(value.patch).toContain('+via worker'); expect(JSON.stringify(value)).not.toContain(f.root);
  } finally { await server.close(); }
});

test('binary changes remain a Git summary and detached execution trees are refused', () => {
  const f = fixture();
  writeFileSync(join(f.worktree, 'file.txt'), Buffer.from([0, 1, 2, 3]));
  expect(f.read().patch).toContain('Binary files');
  git(f.worktree, 'checkout', '--detach');
  expect(() => f.read()).toThrow('unavailable');
});

test('decoder refuses malformed and oversized payloads instead of displaying partial output', () => {
  const f = fixture(); const value = f.read();
  for (const change of [
    { patch: 'x'.repeat(TASK_DIFF_MAX_BYTES + 1) },
    { untracked_paths: ['/Users/someone/private'] },
    { untracked_paths: ['../foreign'] },
    { base_sha: 'main' }, { actor_id: '' }, { protocol: 1 },
  ]) expect(() => decodeOperatorTaskDiff({ ...value, ...change }, f.selector)).toThrow();
});

test('GET diff refuses configured clean/process commands and never executes fsmonitor', () => {
  const f = fixture();
  const marker = join(f.worktree, 'filter-ran');
  git(f.worktree, 'config', 'filter.probe.clean', 'echo ran > filter-ran; cat');
  writeFileSync(join(f.worktree, '.gitattributes'), 'file.txt filter=probe\n');
  writeFileSync(join(f.worktree, 'file.txt'), 'new content\n');
  expect(() => f.read()).toThrow('filters_unsupported');
  expect(existsSync(marker)).toBe(false);
  git(f.worktree, 'config', '--unset', 'filter.probe.clean');
  git(f.worktree, 'config', 'filter.probe.process', 'echo ran > filter-ran');
  expect(() => f.read()).toThrow('filters_unsupported');
  expect(existsSync(marker)).toBe(false);
  git(f.worktree, 'config', '--unset', 'filter.probe.process');
  git(f.worktree, 'config', 'core.fsmonitor', 'echo ran > fsmonitor-ran; false');
  expect(f.read().patch).toContain('+new content');
  expect(existsSync(join(f.worktree, 'fsmonitor-ran'))).toBe(false);
});

test('a different prunable worktree does not hide a valid task binding', () => {
  const f = fixture();
  const missing = join(f.root, '..', 'aaa-prunable');
  git(f.root, 'worktree', 'add', '-b', 'obsolete', missing);
  rmSync(missing, { recursive: true, force: true });
  expect(git(f.root, 'worktree', 'list', '--porcelain')).toContain('prunable');
  expect(f.read().base_sha).toBe(f.base);
});

test('assume-unchanged tracked entries cannot produce an empty observation', () => {
  const f = fixture();
  git(f.worktree, 'update-index', '--assume-unchanged', 'file.txt');
  writeFileSync(join(f.worktree, 'file.txt'), 'hidden edit\n');
  expect(() => f.read()).toThrow('index_unsupported');
});

test('skip-worktree tracked entries cannot produce an empty observation and stay untouched', async () => {
  const f = fixture();
  git(f.worktree, 'update-index', '--skip-worktree', 'file.txt');
  writeFileSync(join(f.worktree, 'file.txt'), 'hidden edit\n');
  expect(git(f.worktree, 'diff', f.base, '--')).toBe('');
  expect(() => f.read()).toThrow('index_unsupported');
  const { startOperatorServer } = await import('../../src/effects/operator/server');
  const server = await startOperatorServer({ port: 0, static_root: f.root, env: f.input.env, read_task_diff: async request => { const { signal: _, ...selector } = request; return readOperatorTaskDiff({ ...selector, env: f.input.env }, f.effects); } });
  try {
    const response = await fetch(server.url + f.path);
    expect(response.status).not.toBe(200);
    expect(JSON.stringify(await response.json())).toContain('index_unsupported');
  } finally { await server.close(); }
  expect(git(f.worktree, 'ls-files', '-v', 'file.txt')).toBe('S file.txt');
  expect(readFileSync(join(f.worktree, 'file.txt'), 'utf8')).toBe('hidden edit\n');
});

test('missing promisor blobs fail without fetching or writing objects', () => {
  const f = fixture();
  const blob = git(f.root, 'rev-parse', 'HEAD:file.txt');
  const object = join(f.root, '.git', 'objects', blob.slice(0, 2), blob.slice(2));
  git(f.root, 'config', 'remote.origin.promisor', 'true');
  git(f.root, 'config', 'remote.origin.url', f.root);
  const marker = join(f.root, 'fetch-ran');
  git(f.root, 'config', 'remote.origin.uploadpack', 'echo ran > fetch-ran; false');
  rmSync(object);
  writeFileSync(join(f.worktree, 'file.txt'), 'needs base blob\n');
  expect(() => f.read()).toThrow('unavailable');
  expect(existsSync(marker)).toBe(false);
  expect(existsSync(join(f.worktree, 'fetch-ran'))).toBe(false);
  expect(existsSync(object)).toBe(false);
});

test('HTTP reader refuses missing policy target objects without fetching', async () => {
  const f = fixture();
  const blob = git(f.root, 'rev-parse', 'HEAD^{commit}');
  const object = join(f.root, '.git', 'objects', blob.slice(0, 2), blob.slice(2));
  git(f.root, 'config', 'remote.origin.promisor', 'true');
  git(f.root, 'config', 'remote.origin.url', f.root);
  git(f.root, 'config', 'remote.origin.uploadpack', 'echo ran > fetch-ran; false');
  rmSync(object);
  const { startOperatorServer } = await import('../../src/effects/operator/server');
  const server = await startOperatorServer({ port: 0, static_root: f.root, env: f.input.env, read_task_diff: async request => { const { signal: _, ...selector } = request; return readOperatorTaskDiff({ ...selector, env: f.input.env }, f.effects); } });
  try {
    const response = await fetch(server.url + f.path);
    expect(response.status).not.toBe(200);
    expect(existsSync(join(f.root, 'fetch-ran'))).toBe(false);
    expect(existsSync(object)).toBe(false);
  } finally { await server.close(); }
});

test('current approval is reobserved, while same-campaign reapproval and empty commits preserve session selection', () => {
  const f = fixture();
  git(f.worktree, 'commit', '--allow-empty', '-m', 'provenance');
  expect(f.read().head_sha).toBe(git(f.worktree, 'rev-parse', 'HEAD'));
  const next = seedReviewAdmissionFixture(f.root, f.home);
  expect(() => f.read()).toThrow('unavailable');
  expect(f.read({ ...f.input, grant_sha256: next.grant }).session_binding_sha256).toBe(f.input.session_binding_sha256);
  next.issue.body = 'changed provider goal';
  const effects = { admissionSource: ((root, values) => ({ ...readReviewAdmissionSource(root, values), authorityHome: f.home, runner: next.source.runner })) as typeof readReviewAdmissionSource };
  expect(() => readOperatorTaskDiff({ ...f.input, grant_sha256: next.grant }, effects)).toThrow('unavailable');
});

test('policy comparison base is required and reobserved, never replaced with HEAD', () => {
  const f = fixture(), policyPath = join(f.root, '.ai/harness/policy.json');
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  writeFileSync(policyPath, JSON.stringify({ ...policy, worktree_strategy: {} }));
  expect(() => f.read()).toThrow('unavailable');
  writeFileSync(policyPath, JSON.stringify(policy));
  git(f.root, 'branch', 'other-base');
  let reads = 0;
  expect(() => readOperatorTaskDiff(f.input, { admissionSource: (root, values) => {
    if (++reads === 2) writeFileSync(policyPath, JSON.stringify({ ...policy, worktree_strategy: { review_base: 'other-base' } }));
    return f.effects.admissionSource(root, values);
  } })).toThrow('stale');
  expect(reads).toBe(2);
});

test('production worker refuses absent selected sessions without accepting fixture authority over HTTP', async () => {
  const f = fixture();
  rmSync(join(f.dir, 'binding.json'));
  const { startOperatorServer } = await import('../../src/effects/operator/server');
  const server = await startOperatorServer({ port: 0, static_root: f.root, env: f.input.env });
  try {
    const response = await fetch(server.url + f.path);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'unavailable' });
    expect((await fetch(server.url + f.path + '&authorityHome=' + encodeURIComponent(f.home))).status).toBe(400);
  } finally { await server.close(); }
});


test('closed selected session is unavailable rather than a new implicit selection', () => {
  const f = fixture();
  writeSessionArtifact(join(f.dir, 'closed.json'), { fixture: true });
  expect(() => f.read()).toThrow('unavailable');
});


test('registered primary resolves the immutable linked owner policy separately from execution checkout', () => {
  const f = fixture(true);
  expect(f.binding.task_admission!.identity.source_root).toBe(f.sourceRoot);
  expect(f.sourceRoot).not.toBe(f.root);
  expect(f.sourceRoot).not.toBe(f.worktree);
  expect(existsSync(join(f.root, '.ai/harness/policy.json'))).toBe(false);
  expect(f.read().base_sha).toBe(f.base);
  const { source_root: _, ...oldIdentity } = f.binding.task_admission!.identity;
  writeSessionArtifact(join(f.dir, 'binding.json'), { ...f.binding,
    task_admission: { ...f.binding.task_admission, identity: oldIdentity } }, false);
  expect(() => f.read()).toThrow('stale');
});


test('a bound owner root replaced by a symlink is unavailable', () => {
  const f = fixture(true);
  renameSync(f.sourceRoot, f.sourceRoot + '-moved');
  symlinkSync(f.sourceRoot + '-moved', f.sourceRoot, 'dir');
  expect(() => f.read()).toThrow('unavailable');
});

test('discovery returns current protected selection, requires explicit sessions, and distinguishes failure from empty', async () => {
  const { readOperatorTaskSessions } = await import('../../src/effects/operator/task-sessions');
  const { readCurrentReviewAdmissionSource } = await import('../../src/effects/review/admission-source');
  const f = fixture(true);
  const currentSource: typeof readCurrentReviewAdmissionSource = input => readCurrentReviewAdmissionSource(input, { authorityHome: f.home, runner: f.approved.source.runner });
  const discover = () => readOperatorTaskSessions({ repository_id: f.selector.repository_id, env: f.input.env }, { currentSource });
  const first = discover();
  expect(first.sessions).toHaveLength(1);
  expect(first.sessions[0]!.selector).toEqual(f.selector);
  expect(first.sessions[0]!.admission_sha256).toBe(f.approved.admission.admission_sha256);
  expect(first.sessions[0]!.profile_selection).toEqual({ state: 'unassigned' });
  expect(JSON.stringify(first)).not.toContain(f.sourceRoot);
  const next = seedReviewAdmissionFixture(f.sourceRoot, f.home);
  const renewed = discover().sessions[0]!;
  expect(renewed.selector.grant_sha256).toBe(next.grant);
  expect(renewed.selector.session_binding_sha256).toBe(first.sessions[0]!.selector.session_binding_sha256);
  f.approved.issue.body = 'provider changed';
  expect(discover).toThrow('unavailable');
  f.approved.issue.body = 'Migrate review authority.';
  writeFileSync(join(next.directory, 'active.json'), JSON.stringify({ protocol: 1, revision: 3, grant_sha256: null }), { mode: 0o600 });
  expect(discover().sessions).toEqual([]);
});

test('discovery refuses directory overflow instead of presenting a partial list', async () => {
  const { readOperatorTaskSessions } = await import('../../src/effects/operator/task-sessions');
  const f = fixture();
  for (let index = 0; index < 201; index++) mkdirSync(join(f.dir, '..', index.toString(16).padStart(64, '0')));
  expect(() => readOperatorTaskSessions({ repository_id: f.selector.repository_id, env: f.input.env })).toThrow('too_large');
});


test('active activity observes protected session approval around modern history and rejects stale selected grants', () => {
  const f = fixture(false, 'a'.repeat(64));
  const request = { selector:f.selector,limit:50,after:null,message_id:null,env:f.input.env };
  const event = buildTaskMessageEvent({ message_id:'123e4567-e89b-42d3-a456-000000000001', task_id:f.selector.task,
    task_identity:{repository_id:f.selector.provider_repository_id,issue_id:f.selector.issue_id,campaign_id:f.selector.campaign_id},
    admission_sha256:f.approved.admission.admission_sha256,scope:'task',target_claim:null,sender_kind:'operator',sender_id:'operator',sender_trust:'local_operator',audience:'owner',
    body:'<script>stored evidence</script>',created_at:'2026-10-25T00:00:00Z',in_reply_to:null });
  const directory = join(f.root,'.git/repo-harness/task-inbox/v2',f.selector.task,'admitted/events');
  mkdirSync(directory,{recursive:true}); writeFileSync(join(directory,`${event.message_id}.json`),canonicalTaskMessageEventBytes(event)+'\n');
  const value = readOperatorAdmittedTaskActivity(request,f.effects);
  expect(value.entries[0]?.event).toEqual(event); expect(value.admission_sha256).toBe(f.approved.admission.admission_sha256);
  expect(JSON.stringify(value)).not.toContain(f.root);
  expect(() => readOperatorAdmittedTaskActivity({...request,selector:{...f.selector,grant_sha256:'sha256:'+'0'.repeat(64)}},f.effects)).toThrow('stale');
  let observations = 0;
  const changing = { admissionSource: ((...args: Parameters<typeof readReviewAdmissionSource>) => {
    const source = f.effects.admissionSource(...args);
    if (++observations === 2) seedReviewAdmissionFixture(f.sourceRoot,f.home);
    return source;
  }) as typeof readReviewAdmissionSource };
  expect(() => readOperatorAdmittedTaskActivity(request,changing)).toThrow();
  expect(observations).toBe(2);
});

test('active activity HTTP requires exact admitted selection and has no historical route fallback', async () => {
  const f=fixture(false,'a'.repeat(64));
  const {startOperatorServer}=await import('../../src/effects/operator/server');
  const server=await startOperatorServer({port:0,static_root:f.root,env:f.input.env,read_admitted_task_activity:async ({signal:_,...request})=>readOperatorAdmittedTaskActivity({...request,env:f.input.env},f.effects)});
  try {
    const query=new URLSearchParams(Object.entries(f.selector).filter(([key])=>key!=='repository_id'));
    const path=`/api/v1/fleet/task-sessions/${f.selector.repository_id}/activity`;
    expect((await fetch(server.url+path)).status).toBe(400);
    const missing=await fetch(server.url+path+'?'+query);
    expect(missing.status).toBe(404);expect(await missing.json()).toEqual({code:'history_unavailable'});
    query.append('grant_sha256',f.selector.grant_sha256);
    expect((await fetch(server.url+path+'?'+query)).status).toBe(400);
    expect((await fetch(`${server.url}/api/v1/fleet/tasks/${f.selector.repository_id}/${f.selector.task}/activity`)).status).toBe(404);
  } finally {await server.close();}
});
