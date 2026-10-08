import { afterEach, expect, test } from 'bun:test';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { PM_OPERATION_SCHEMAS, parsePmRequest, type PmRequest, type PmTaskScope } from '../../src/core/pm/protocol';
import { buildPmCommand, runPmJson } from '../../src/cli/commands/pm';
import { executePmRequest, withPmTaskAuthority } from '../../src/effects/pm/operations';
import { readPmHostConfiguration } from '../../src/effects/pm/host';
import { repoHarnessRepoIdFor, setRepoHarnessAccessMode } from '../../src/effects/repo-registry';
import { deriveTaskRevision } from '../../src/core/state/coordination-identity';
import { bindSprintCommand, claimSprintCommand, processSprintDependencies } from '../../src/effects/state/coordination-sprint';
import { writeClaimTokenForBoundLease } from '../../src/effects/state/coordination-claim-token';
import { processIdentity, taskSessionDirectory, writeSessionArtifact, type TaskPaneBinding, type TaskRequest } from '../../src/effects/terminal/task-session';
import { taskRepository } from '../../src/effects/terminal/task-worktree';
import { readLease, taskLockRelativePath } from '../../src/effects/state/coordination-lease-store';
import { acquireExclusiveDirectoryLock, withExclusiveDirectoryLockAsync } from '../../src/effects/locking/exclusive-directory-lock';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const taskId = 'a'.repeat(64);
const task = 'Implement one bounded task';
const acceptance = 'Return request-bound evidence';
const sprint = 'plans/sprints/pm.sprint.md';
const plan = 'plans/plan-20261009-pm-test.md';
const contract = 'tasks/contracts/pm.contract.md';
const taskRevision = deriveTaskRevision({ taskId, taskCell: task, modeCell: 'contract', acceptanceCell: acceptance });
const scope: PmTaskScope = { repo_id: 'repo_' + 'a'.repeat(16), task_id: taskId, task_revision: taskRevision,
  authorization_revision: 7, claim_id: 'claim-fixture', generation: 1 };

function fixture(bound = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rh-pm-'))); roots.push(root);
  const repo = join(root, 'primary'), execution = join(root, 'execution'), home = join(root, 'host');
  mkdirSync(repo); mkdirSync(home, { mode: 0o700 });
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (path: string, text: string) => { mkdirSync(dirname(join(repo, path)), { recursive: true }); writeFileSync(join(repo, path), text); };
  git(['init', '-q', '-b', 'main']);
  write('.ai/harness/policy.json', JSON.stringify({ worktree_strategy: { merge_back: { target: 'main' } } }));
  write('.ai/harness/sprint/active-sprint', sprint + '\n');
  write('.gitignore', '.ai/harness/runs/\n.ai/harness/sprint/claims/\n');
  write(sprint, `# PM fixture\n> **Status**: Executing\n> **Backlog Schema**: 2\n\n## Backlog\n\n| # | ID | Status | Task | Mode | Acceptance | Plan |\n| --- | --- | --- | --- | --- | --- | --- |\n| 1 | ${taskId} | [ ] | ${task} | contract | ${acceptance} | (pending) |\n`);
  write(plan, [
    '# PM fixture', '> **Status**: Approved', `> **Source Ref**: sprint:${sprint}#${task}`,
    '> **Artifact Level**: work-package', '> **Promotion Reason**: verification_boundary',
    '> **Verification Boundary**: PM tests', '> **Rollback Surface**: revert change', `> **Task Contract**: ${contract}`,
    '## Promotion Gate', '- **Merge/PR unit**: one task', '- **Rollback surface**: revert change',
    '- **Verification boundary**: PM tests', '- **Review/acceptance boundary**: independent review',
    '- **High-risk surface**: permission boundary', '- **Why not checklist row**: separate verification',
    '## Evidence Contract', '- **State/progress path**: canonical task', '- **Verification evidence**: PM tests',
    '- **Evaluator rubric**: request identity', '- **Stop condition**: evidence collected', '- **Rollback surface**: revert change', '',
  ].join('\n'));
  write(contract, `# PM contract\n> **Plan**: ${plan}\n\n## Allowed Paths\n\`\`\`yaml\nallowed_paths:\n  - src/task.ts\n\`\`\`\n`);
  git(['add', '.']); git(['-c', 'user.name=PM fixture', '-c', 'user.email=pm@example.invalid', 'commit', '-qm', 'PM fixture']);
  git(['worktree', 'add', '-q', '-b', 'codex/pm-fixture', execution]);
  const repoId = repoHarnessRepoIdFor(repo);
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 7,
    repos: [{ id: repoId, path: repo, accessMode: 'read_write', source: 'manual', registeredAt: '2026-10-09', lastSeenAt: '2026-10-09' }] }));
  let claimId = 'claim-fixture';
  if (bound) {
    const claimed = claimSprintCommand({ taskId, expectedTaskRevision: taskRevision, targetRef: 'main', sprintPath: sprint, sessionId: 'operator-fixture' }, processSprintDependencies(repo));
    expect(claimed.exitCode, claimed.stderr).toBe(0); claimId = JSON.parse(claimed.stdout).claim_id;
    const binding = bindSprintCommand({ claimId, worktree: execution, branch: 'codex/pm-fixture', unitRef: plan }, processSprintDependencies(repo));
    expect(binding.exitCode, binding.stderr).toBe(0);
    writeClaimTokenForBoundLease(repo, { task_id: taskId, claim_id: claimId, worktree: execution, sprint, task, unit_ref: plan });
  }
  return { root, repo, execution, home, env: { ...process.env, REPO_HARNESS_HOME: home },
    scope: { ...scope, repo_id: repoId, claim_id: claimId } };
}

function requestFixture(f: ReturnType<typeof fixture>) {
  const dir = taskSessionDirectory(f.repo, taskId, 'deep-worker'); mkdirSync(dir, { recursive: true });
  const outbox = join(f.execution, '.ai/harness/runs/task-agent-outbox', basename(dir)); mkdirSync(outbox, { recursive: true });
  const proof = { pid: process.pid, identity: processIdentity(process.pid) };
  const binding: TaskPaneBinding = { protocol: 2, repository_id: taskRepository(f.repo).repository_id, execution_root: f.execution,
    runtime: 'herdr', task: taskId, role: 'deep-worker', harness_kind: 'fixture', endpoint: { session: 'unused' },
    pane_id: 'pane-fixture', terminal_id: 'terminal-fixture', workspace_id: 'workspace-fixture', shell: proof,
    agent_name: 'fixture', ownership: { disposition: 'attached' }, provider: { ...proof, ownership: { disposition: 'attached' } },
    host: null, capabilities: { read_only: { status: 'unverified', evidence_ref: null }, resume: { status: 'unverified', evidence_ref: null } }, max_requests: 3 };
  writeSessionArtifact(join(dir, 'binding.json'), binding);
  const request: TaskRequest = { protocol: 2, task: taskId, role: 'deep-worker', round: 1, request_id: 'request-fixture',
    context_ref: join(outbox, 'context-1.txt'), source_ref: join(f.execution, plan), context_sha256: 'sha256:' + 'b'.repeat(64), result_ref: join(outbox, 'result-1.json'),
    result_contract: { required_fields: ['request_id', 'context_sha256', 'value'], atomic_write: 'temp_rename',
      submission: { command: 'repo-harness task-agent result', repo: f.execution, task: taskId, role: 'deep-worker', round: 1 } } };
  writeSessionArtifact(join(dir, 'request-1.json'), request);
  return { dir, request, binding };
}

test('PM inventory is closed and has no command, result submission, or permission operation', () => {
  expect(buildPmCommand().commands.map(command => command.name())).toEqual(['request']);
  expect(Object.keys(PM_OPERATION_SCHEMAS)).toEqual(['capabilities', 'status', 'dispatch', 'follow-up', 'collect']);
  const requests: PmRequest[] = [
    { protocol: 1, operation: 'capabilities' }, { protocol: 1, operation: 'status', repo_id: scope.repo_id },
    { protocol: 1, operation: 'dispatch', ...scope, offer_revision: 'sha256:' + 'c'.repeat(64) },
    { protocol: 1, operation: 'follow-up', ...scope, round: 1, request_id: 'request-fixture', message: 'Continue the same task.' },
    { protocol: 1, operation: 'collect', ...scope, round: 1, request_id: 'request-fixture' },
  ];
  for (const request of requests) {
    expect(parsePmRequest(request)).toEqual(request);
    for (const key of ['command', 'exec', 'env', 'path', 'endpoint', 'runtime', 'permission', 'value']) {
      expect(() => parsePmRequest({ ...request, [key]: 'caller-input' })).toThrow('pm_request_fields_invalid');
    }
  }
  for (const operation of ['exec', 'result', 'approve', 'prepare']) expect(() => parsePmRequest({ protocol: 1, operation })).toThrow('pm_operation_unsupported');
  for (const task_id of ['../escape', '/tmp/task', 'a'.repeat(63)]) expect(() => parsePmRequest({ ...requests[2], task_id })).toThrow('Invalid task_id');
});

test('CLI returns structured rejection and capability schema without host setup', async () => {
  const f = fixture();
  const capability = await runPmJson('{"protocol":1,"operation":"capabilities"}', f.env);
  expect(capability.ok).toBe(true);
  if (capability.ok) expect(capability.data).toMatchObject({ runtime: { available: false }, acquisition: 'unavailable' });
  expect(await runPmJson('{', f.env)).toMatchObject({ ok: false, error: { code: 'pm_json_invalid' } });
  const subprocess = spawnSync(process.execPath, [join(import.meta.dir, '../../src/cli/index.ts'), 'pm', 'request'], {
    env: f.env, encoding: 'utf8', input: '{"protocol":1,"operation":"capabilities"}', timeout: 10000,
  });
  expect(subprocess.status, subprocess.stderr).toBe(0);
  expect(JSON.parse(subprocess.stdout)).toMatchObject({ protocol: 1, kind: 'repo-harness-pm-response', ok: true });
  expect(existsSync(join(f.repo, '.ai/harness/runs'))).toBe(false);
});

test('real canonical task status works without admission; acquisition, stale scopes, and missing host fail before launch', async () => {
  for (const bound of [false, true]) {
    const f = fixture(bound);
    const status = await executePmRequest({ protocol: 1, operation: 'status', repo_id: f.scope.repo_id }, f.env) as any;
    expect(status.tasks).toHaveLength(1);
    const offer = status.tasks[0].offer;
    expect(offer.task_revision).toBe(taskRevision);
    const dispatch = { protocol: 1, operation: 'dispatch', ...f.scope, offer_revision: offer.offer_revision };
    await expect(executePmRequest(dispatch, f.env)).rejects.toThrow('Use the existing fleet acquire');
    await expect(executePmRequest({ ...dispatch, authorization_revision: 6 }, f.env)).rejects.toThrow('pm_authorization_stale');
    await expect(executePmRequest({ ...dispatch, task_revision: 'f'.repeat(64) }, f.env)).rejects.toThrow('pm_task_stale');
    await expect(executePmRequest({ ...dispatch, offer_revision: 'sha256:' + 'e'.repeat(64) }, f.env)).rejects.toThrow('pm_task_stale');
    if (bound) await expect(executePmRequest({ ...dispatch, claim_id: 'forged-claim' }, f.env)).rejects.toThrow('pm_claim_stale');
    // The real bind writes its attempt ledger before the PM request.
    expect(existsSync(taskSessionDirectory(f.repo, taskId, 'deep-worker'))).toBe(false);
    expect(existsSync(join(f.execution, '.ai/harness/runs/pm-input'))).toBe(false);
  }
});

test('collection needs registry write access and canonical identities, but no coding admission', async () => {
  const f = fixture(true); const { dir, request } = requestFixture(f);
  const input = { protocol: 1, operation: 'collect', ...f.scope, round: 1, request_id: request.request_id };
  expect(await executePmRequest(input, f.env)).toMatchObject({ status: 'pending', result: null });
  await expect(executePmRequest({ ...input, request_id: 'forged-request' }, f.env)).rejects.toThrow('pm_request_stale');
  writeSessionArtifact(request.result_ref, { request_id: 'forged-request', context_sha256: request.context_sha256, value: 'done' });
  await expect(executePmRequest(input, f.env)).rejects.toThrow('task_agent_result_identity_mismatch');
  expect(existsSync(join(dir, 'collected-1.json'))).toBe(false);
  const result = { request_id: request.request_id, context_sha256: request.context_sha256, value: { evidence: 'fixture-only' } };
  writeSessionArtifact(request.result_ref, result, false);
  expect(await executePmRequest(input, f.env)).toMatchObject({ status: 'collected', result });
  const saved = readFileSync(join(dir, 'collected-1.json'), 'utf8');
  expect(await executePmRequest(input, f.env)).toMatchObject({ status: 'collected', result });
  expect(readFileSync(join(dir, 'collected-1.json'), 'utf8')).toBe(saved);
  expect(existsSync(join(f.home, 'pm-host.json'))).toBe(false);
  const access = setRepoHarnessAccessMode(f.repo, 'read_only', { env: f.env });
  await expect(executePmRequest({ ...input, authorization_revision: access.authorizationRevision }, f.env)).rejects.toThrow('pm_scope_not_approved');
  expect(readFileSync(join(dir, 'collected-1.json'), 'utf8')).toBe(saved);
  const status = await executePmRequest({ protocol: 1, operation: 'status', repo_id: f.scope.repo_id }, f.env) as any;
  expect(status.tasks[0].worker.requests[0].result_saved).toBe(true);
});

test('operator host setup rejects writable files and symlinks', () => {
  const f = fixture(); const path = join(f.home, 'pm-host.json');
  writeFileSync(path, '{}', { mode: 0o666 }); chmodSync(path, 0o666);
  expect(() => readPmHostConfiguration(f.env)).toThrow('pm_host_configuration_unsafe');
  rmSync(path); writeFileSync(join(f.root, 'outside.json'), '{}'); symlinkSync(join(f.root, 'outside.json'), path);
  expect(() => readPmHostConfiguration(f.env)).toThrow('pm_host_configuration_unsafe');
});

test('bounded authority effect holds the real lease and registry locks through await and releases on failure', async () => {
  const f = fixture(true);
  const stateModule = new URL('../../src/effects/state/coordination-sprint.ts', import.meta.url).pathname;
  const registryModule = new URL('../../src/effects/repo-registry.ts', import.meta.url).pathname;
  const program = join(f.root, 'contender.ts');
  writeFileSync(program, `import {releaseSprintCommand,processSprintDependencies} from ${JSON.stringify(stateModule)};
import {setRepoHarnessAccessMode} from ${JSON.stringify(registryModule)};
console.log('attempting');
const result=process.argv[2]==='lease'?releaseSprintCommand({claimId:process.argv[4]},processSprintDependencies(process.argv[3]!)):setRepoHarnessAccessMode(process.argv[3]!,'read_only',{env:process.env});
console.log(JSON.stringify(result));`);
  const children: ReturnType<typeof spawn>[] = [];
  const exits: Promise<number | null>[] = [];
  const output: string[] = [];
  try {
    await expect(withPmTaskAuthority(f.scope, f.env, true, async () => {
      for (const [index, kind] of ['lease', 'registry'].entries()) {
        const child = spawn(process.execPath, [program, kind, f.repo, f.scope.claim_id], { env: f.env, stdio: ['ignore', 'pipe', 'pipe'] });
        children.push(child); output[index] = '';
        exits.push(new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }));
        await new Promise<void>((resolve, reject) => {
          child.once('error', reject);
          child.stdout!.on('data', chunk => { output[index] += chunk.toString(); if (output[index]!.includes('attempting\n')) resolve(); });
        });
      }
      expect(await Promise.race([Promise.all(exits).then(() => 'exited'), Bun.sleep(100).then(() => 'held')])).toBe('held');
      expect(readLease(f.repo, taskId).record?.claim_id).toBe(f.scope.claim_id);
      expect(JSON.parse(readFileSync(join(f.home, 'registered-repos.json'), 'utf8')).authorizationRevision).toBe(7);
      throw new Error('fixture_delivery_timeout');
    })).rejects.toThrow('fixture_delivery_timeout');
    expect(await Promise.all(exits)).toEqual([0, 0]);
    expect(readLease(f.repo, taskId).classification).toBe('available');
    expect(JSON.parse(readFileSync(join(f.home, 'registered-repos.json'), 'utf8'))).toMatchObject({ authorizationRevision: 8, repos: [{ accessMode: 'read_only' }] });
    expect(output[0]).toContain('"exitCode":0');
    const common = taskRepository(f.repo).repository_id;
    expect(existsSync(join(common, taskLockRelativePath(taskId)))).toBe(false);
    expect(existsSync(join(f.home, 'registered-repos.json.lock'))).toBe(false);
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
    await Promise.allSettled(exits);
  }
}, 15000);

test('async lock wait timeout does not release the other owner and a thrown callback releases its own lock', async () => {
  const f = fixture(); const common = taskRepository(f.repo).repository_id;
  const path = 'repo-harness/test-async.lock';
  const owner = acquireExclusiveDirectoryLock(common, path);
  try {
    await expect(withExclusiveDirectoryLockAsync(common, path, async () => { throw new Error('must-not-run'); }, { waitTimeoutMs: 25 })).rejects.toThrow('timed out');
    owner.assertOwned();
  } finally { owner.release(); }
  await expect(withExclusiveDirectoryLockAsync(common, path, async () => { await Promise.resolve(); throw new Error('fixture_failure'); })).rejects.toThrow('fixture_failure');
  expect(existsSync(join(common, path))).toBe(false);
});

test.skipIf(process.platform !== 'darwin')('same-task follow-up recovers an unknown canonical request after restart without another delivery', async () => {
  const f = fixture(true); const { dir, binding, request } = requestFixture(f);
  binding.harness_kind = 'codex'; writeSessionArtifact(join(dir, 'binding.json'), binding, false);
  const admission = { version: 1, runtime: 'codex', execution_root: f.execution, node: realpathSync(process.execPath), executable: '/bin/sh',
    model: 'fixture-no-provider', effort: 'high', approval_policy: 'never', filesystem: 'worktree-only', authorization_ref: 'fixture-no-live-grant' };
  writeFileSync(join(f.home, 'pm-host.json'), JSON.stringify({ protocol: 1, endpoint: { session: 'unused' }, parent_pane: 'w1:p1', admission, max_requests: 3 }), { mode: 0o600 });
  const control = join(dir, 'coding-host'); mkdirSync(control);
  writeSessionArtifact(join(control, 'spec.json'), { admission, task: taskId, role: 'deep-worker', primary_root: f.repo,
    request_directory: dir, control_directory: control, max_requests: 3 });
  writeSessionArtifact(join(control, 'ready.json'), { pid: process.pid, session_id: 'fixture-session' });
  const followup = { protocol: 1, operation: 'follow-up', ...f.scope, round: 1, request_id: request.request_id, message: 'Continue the same task.' };
  // These are persisted transport artifacts, not a provider execution receipt.
  const projected = { operation: 'follow-up', task_id: taskId, claim_id: f.scope.claim_id, task_revision: taskRevision,
    previous_request_id: request.request_id, previous_round: request.round, message: followup.message };
  const bytes = JSON.stringify(projected, null, 2) + '\n';
  const digest = createHash('sha256').update(bytes).digest('hex');
  const successor = { ...request, round: 2, request_id: 'request-successor', context_ref: join(dirname(request.context_ref), 'context-2.txt'),
    result_ref: join(dirname(request.result_ref), 'result-2.json'), source_ref: join(f.execution, `.ai/harness/runs/pm-input/${digest}.json`), context_sha256: `sha256:${digest}` };
  writeSessionArtifact(join(dir, 'request-2.json'), successor);
  writeSessionArtifact(join(dir, 'delivery-2.json'), { request_id: successor.request_id, state: 'unknown' });
  expect(await executePmRequest(followup, f.env)).toEqual({ request: successor, delivery: 'unknown' });
  expect(await executePmRequest(followup, f.env)).toEqual({ request: successor, delivery: 'unknown' });
  expect(existsSync(join(dir, 'request-3.json'))).toBe(false);
  expect(existsSync(join(f.execution, '.ai/harness/runs/pm-input'))).toBe(false);
  await expect(executePmRequest({ ...followup, message: 'Another follow-up.' }, f.env)).rejects.toThrow('pm_request_stale');
  // An ancestor symlink cannot hide operator policy inside writable source.
  const nested = join(f.execution, '.pm-host-root/nested'); mkdirSync(nested, { recursive: true, mode: 0o700 });
  writeFileSync(join(nested, 'pm-host.json'), readFileSync(join(f.home, 'pm-host.json')), { mode: 0o600 });
  const alias = join(f.root, 'host-alias'); symlinkSync(dirname(nested), alias);
  expect(() => readPmHostConfiguration({ ...f.env, REPO_HARNESS_HOME: join(alias, 'nested') })).toThrow('pm_host_configuration_unsafe');
});
