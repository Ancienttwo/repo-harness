import { afterEach, expect, test } from 'bun:test';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
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
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createPmMcpServer, createPmMcpBinding, inspectPmMcpConnection } from '../../src/cli/mcp/pm-server';
import { createRepoHarnessMcpServer } from '../../src/cli/mcp/server';
import { startMcpHttp } from '../../src/cli/mcp/transports/http';
import { McpOAuthTokenStore, createMcpOAuthProvider } from '../../src/cli/mcp/oauth';
import { createServer } from 'node:net';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { McpSessionStore } from '../../src/cli/mcp/session-store';

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

function requestFixture(f: ReturnType<typeof fixture>, fixtureProof?: { pid: number; identity: string }) {
  const dir = taskSessionDirectory(f.repo, taskId, 'deep-worker'); mkdirSync(dir, { recursive: true });
  const outbox = join(f.execution, '.ai/harness/runs/task-agent-outbox', basename(dir)); mkdirSync(outbox, { recursive: true });
  const proof = fixtureProof ?? { pid: process.pid, identity: processIdentity(process.pid) };
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

function mcpScope(f: ReturnType<typeof fixture>, allowed_operations = Object.keys(PM_OPERATION_SCHEMAS)) {
  const path = join(f.home, 'pm-mcp.json');
  writeFileSync(path, JSON.stringify({ protocol: 1, repo_id: f.scope.repo_id,
    authorization_revision: f.scope.authorization_revision, allowed_operations }), { mode: 0o600 });
  return path;
}

async function pmClient(f: ReturnType<typeof fixture>) {
  const client = new Client({ name: 'dot-contract-test', version: '0' }, { capabilities: {} });
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [join(import.meta.dir, '../../src/cli/index.ts'), 'mcp', 'serve', '--profile', 'pm'],
    env: f.env, stderr: 'pipe' }));
  return client;
}
function pmPayload(result: Awaited<ReturnType<Client['callTool']>>) {
  return JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
}

test('PM MCP projects the closed schema and reads and collects the same canonical request over real stdio', async () => {
  const f = fixture(true); const { request, dir } = requestFixture(f); mcpScope(f);
  const client = await pmClient(f);
  try {
    expect(client.getServerVersion()?.name).toBe('repo-harness-pm-mcp');
    const listed = await client.listTools();
    expect(listed.tools.map(tool => tool.name)).toEqual(['pm_capabilities', 'pm_status', 'pm_dispatch', 'pm_follow_up', 'pm_collect']);
    for (const tool of listed.tools) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      for (const field of ['repo_id', 'authorization_revision', 'command', 'env', 'permission']) expect(tool.inputSchema.properties).not.toHaveProperty(field);
    }
    expect(pmPayload(await client.callTool({ name: 'pm_capabilities', arguments: {} }))).toMatchObject({ ok: true, data: { runtime: { available: false } } });
    const status = pmPayload(await client.callTool({ name: 'pm_status', arguments: {} }));
    expect(status.ok).toBe(true); expect(status.data.tasks[0].offer.task_id).toBe(taskId);
    const { repo_id, authorization_revision, ...taskScope } = f.scope;
    const collect = { ...taskScope, round: 1, request_id: request.request_id };
    expect(pmPayload(await client.callTool({ name: 'pm_collect', arguments: collect }))).toMatchObject({ ok: true, data: { status: 'pending', request: { request_id: request.request_id } } });
    const result = { request_id: request.request_id, context_sha256: request.context_sha256, value: { evidence: 'fixture-only' } };
    writeSessionArtifact(request.result_ref, result);
    // Discard the first response. Retrying the same stable ID reads one canonical receipt.
    await client.callTool({ name: 'pm_collect', arguments: collect });
    expect(pmPayload(await client.callTool({ name: 'pm_collect', arguments: collect }))).toMatchObject({ ok: true, data: { status: 'collected', result } });
    expect(JSON.parse(readFileSync(join(dir, 'collected-1.json'), 'utf8'))).toBeDefined();
    for (const field of ['repo_id', 'authorization_revision', 'command', 'env', 'authorization_ref', 'user_name']) {
      expect(pmPayload(await client.callTool({ name: 'pm_collect', arguments: { ...collect, [field]: 'forged' } }))).toMatchObject({ ok: false, error: { code: 'pm_request_fields_invalid' } });
    }
    expect(pmPayload(await client.callTool({ name: 'exec_command', arguments: { command: 'true' } }))).toMatchObject({ ok: false, error: { code: 'pm_mcp_operation_denied' } });
    const dispatch = { ...taskScope, offer_revision: status.data.tasks[0].offer.offer_revision };
    expect(pmPayload(await client.callTool({ name: 'pm_dispatch', arguments: dispatch }))).toMatchObject({ ok: false, error: { code: 'pm_acquisition_not_admitted' } });
    expect(pmPayload(await client.callTool({ name: 'pm_collect', arguments: { ...collect, generation: 2 } }))).toMatchObject({ ok: false, error: { code: 'pm_claim_stale' } });
    expect(pmPayload(await client.callTool({ name: 'pm_collect', arguments: { ...collect, task_revision: 'f'.repeat(64) } }))).toMatchObject({ ok: false, error: { code: 'pm_task_stale' } });
    expect(pmPayload(await client.callTool({ name: 'pm_collect', arguments: { ...collect, request_id: 'other' } }))).toMatchObject({ ok: false, error: { code: 'pm_request_stale' } });
  } finally { await client.close(); }
});

test('PM MCP denies scope changes and operation escalation without a restart or authority write', async () => {
  const f = fixture(); const path = mcpScope(f, ['capabilities', 'status']); const client = await pmClient(f);
  try {
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['pm_capabilities', 'pm_status']);
    expect(pmPayload(await client.callTool({ name: 'pm_capabilities', arguments: {} }))).toMatchObject({ ok: true, data: { runtime: { available: false } } });
    const first = pmPayload(await client.callTool({ name: 'pm_status', arguments: {} }));
    expect(first).toMatchObject({ ok: true, data: { authorization_revision: 7 } });
    expect(first.data.tasks[0].offer.task_id).toBe(taskId);
    expect(pmPayload(await client.callTool({ name: 'pm_status', arguments: {} }))).toEqual(first);
    expect(pmPayload(await client.callTool({ name: 'pm_dispatch', arguments: {} }))).toMatchObject({ ok: false, error: { code: 'pm_mcp_operation_denied' } });
    writeFileSync(path, JSON.stringify({ protocol: 1, repo_id: f.scope.repo_id, authorization_revision: 7, allowed_operations: ['status'] }));
    expect(pmPayload(await client.callTool({ name: 'pm_status', arguments: {} }))).toMatchObject({ ok: false, error: { code: 'pm_mcp_configuration_changed' } });
  } finally { await client.close(); }
  mcpScope(f); const current = await pmClient(f);
  try {
    setRepoHarnessAccessMode(f.repo, 'read_only', { env: f.env });
    expect(pmPayload(await current.callTool({ name: 'pm_status', arguments: {} }))).toMatchObject({ ok: false, error: { code: 'pm_authorization_stale' } });
  } finally { await current.close(); }
  expect(existsSync(join(f.repo, '.ai/harness/runs'))).toBe(false);
});

test('PM MCP refuses unsafe operator files, extra configuration, and disabled HTTP or general tool activation', async () => {
  const f = fixture(); const path = mcpScope(f);
  chmodSync(path, 0o666); expect(() => createPmMcpServer(f.env)).toThrow('pm_mcp_configuration_unsafe');
  chmodSync(path, 0o600); writeFileSync(path, JSON.stringify({ protocol: 1, repo_id: f.scope.repo_id, authorization_revision: 7,
    allowed_operations: ['status'], user_name: 'Human' }));
  expect(() => createPmMcpServer(f.env)).toThrow('pm_mcp_configuration_invalid');
  mcpScope(f); const alias = join(f.home, 'scope-alias'); writeFileSync(alias, readFileSync(path)); rmSync(path); symlinkSync(alias, path);
  expect(() => createPmMcpServer(f.env)).toThrow('pm_mcp_configuration_unsafe');
  for (const override of [{ enableReader: true }, { enableDevRunner: true }, { allowedRoots: [f.repo] }, { enableChatgptBrowser: true }]) {
    expect(() => createRepoHarnessMcpServer({ profile: 'pm', ...override })).toThrow('does not permit');
  }
  const previousHome = process.env.REPO_HARNESS_HOME;
  process.env.REPO_HARNESS_HOME = f.home;
  try {
    await expect(startMcpHttp({ repo: f.repo, profile: 'pm' })).rejects.toThrow('pm profile requires enabled v3 setup');
  } finally {
    if (previousHome === undefined) delete process.env.REPO_HARNESS_HOME;
    else process.env.REPO_HARNESS_HOME = previousHome;
  }
});

test('PM OAuth pins profile, required scope, authorization identity and current revision', async () => {
  const f = fixture(); let revision = 7;
  const store = new McpOAuthTokenStore(join(f.home, 'fixture-oauth.json'));
  const provider = createMcpOAuthProvider(store, { profile: 'pm', authorizationRevision: () => revision, pmScopeFingerprint: () => 'c'.repeat(64) });
  const record = { token: 'fixture', clientId: 'fixture-client', scopes: ['repo-harness', 'repo-harness.pm'],
    profile: 'pm', authorizationRevision: 7, authorizationId: 'fixture-owner', pmScopeFingerprint: 'c'.repeat(64) };
  store.setAccessToken('good', { ...record, token: 'good' });
  expect(provider.verifyAccessTokenCurrent('good')).toMatchObject({ authorizationId: 'fixture-owner' });
  for (const [token, changed] of Object.entries({ planner: { profile: 'planner' }, no_scope: { scopes: ['repo-harness'] }, no_owner: { authorizationId: '' }, no_binding: { pmScopeFingerprint: undefined } })) {
    store.setAccessToken(token, { ...record, ...changed, token });
    expect(() => provider.verifyAccessTokenCurrent(token)).toThrow();
  }
  revision = 8; expect(() => provider.verifyAccessTokenCurrent('good')).toThrow('stale or missing');
  expect(store.getAccessToken('good')).toBeUndefined();
});

test('PM authenticated handlers revalidate token profile, owner, revision and revocation without network', async () => {
  const f = fixture(); mcpScope(f, ['capabilities', 'status']); let revision = 7;
  const store = new McpOAuthTokenStore(join(f.home, 'fixture-handlers-oauth.json'));
  const provider = createMcpOAuthProvider(store, { profile: 'pm', authorizationRevision: () => revision, pmScopeFingerprint: () => 'c'.repeat(64) });
  const record = { clientId: 'fixture-client', scopes: ['repo-harness', 'repo-harness.pm'],
    profile: 'pm', authorizationRevision: 7, authorizationId: 'owner-one', pmScopeFingerprint: 'c'.repeat(64) };
  for (const [token, change] of Object.entries({ good: {}, other: { authorizationId: 'owner-two' }, planner: { profile: 'planner' } })) {
    store.setAccessToken(token, { ...record, ...change, token });
  }
  const server = createPmMcpServer(f.env, { authorization: { authorizationId: 'owner-one', verify: (token, owner) => {
    const current = provider.verifyAccessTokenCurrent(token) as AuthInfo & { authorizationId?: string };
    if (current.authorizationId !== owner) throw new Error('authorization identity changed');
  } } });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  let authInfo: AuthInfo | undefined = provider.verifyAccessTokenCurrent('good');
  const send = clientTransport.send.bind(clientTransport);
  clientTransport.send = (message, options) => send(message, { ...options, authInfo });
  const client = new Client({ name: 'pm-auth-handler-fixture', version: '0' }, { capabilities: {} });
  await server.connect(serverTransport); await client.connect(clientTransport);
  try {
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['pm_capabilities', 'pm_status']);
    expect(pmPayload(await client.callTool({ name: 'pm_status', arguments: {} }))).toMatchObject({ ok: true, data: { authorization_revision: 7 } });
    for (const token of ['other', 'planner']) {
      authInfo = { ...record, token };
      await expect(client.listTools()).rejects.toThrow();
      expect(pmPayload(await client.callTool({ name: 'pm_status', arguments: {} }))).toMatchObject({ ok: false });
    }
    authInfo = undefined;
    await expect(client.listTools()).rejects.toThrow('pm_mcp_authentication_required');
    expect(pmPayload(await client.callTool({ name: 'pm_status', arguments: {} }))).toMatchObject({ error: { code: 'pm_mcp_authentication_required' } });
    authInfo = provider.verifyAccessTokenCurrent('good');
    revision = 8;
    await expect(client.listTools()).rejects.toThrow('stale or missing');
    expect(pmPayload(await client.callTool({ name: 'pm_status', arguments: {} }))).toMatchObject({ ok: false });
    revision = 7; store.setAccessToken('good', { ...record, token: 'good' });
    expect((await client.listTools()).tools).toHaveLength(2);
    store.deleteAccessToken('good');
    await expect(client.listTools()).rejects.toThrow('Token not found');
    expect(pmPayload(await client.callTool({ name: 'pm_status', arguments: {} }))).toMatchObject({ ok: false });
  } finally { await client.close(); await server.close(); }
  expect(existsSync(join(f.repo, '.ai/harness/runs'))).toBe(false);
});

test('PM revocation closes only the existing session records for that authorization', async () => {
  const f = fixture(); const closed: string[] = [];
  const sessions = new McpSessionStore<{ authorizationId: string; close(): Promise<void> }>({ ttlMs: 60_000, maxSessions: 4 });
  for (const [id, owner] of [['one', 'owner-one'], ['one-second', 'owner-one'], ['two', 'owner-two']]) {
    sessions.set(id!, { authorizationId: owner!, close: async () => { closed.push(id!); } });
  }
  const store = new McpOAuthTokenStore(join(f.home, 'fixture-revocation-oauth.json'));
  const client = store.registerClient({ redirect_uris: ['http://localhost/fixture'], token_endpoint_auth_method: 'none' });
  const provider = createMcpOAuthProvider(store, { profile: 'pm', authorizationRevision: () => 7, pmScopeFingerprint: () => 'c'.repeat(64),
    onAuthorizationRevoked: owner => sessions.closeMatching(transport => transport.authorizationId === owner) });
  store.setAccessToken('one', { token: 'one', clientId: client.client_id, scopes: ['repo-harness', 'repo-harness.pm'],
    profile: 'pm', authorizationRevision: 7, authorizationId: 'owner-one', pmScopeFingerprint: 'c'.repeat(64) });
  await provider.revokeToken!(client, { token: 'one' });
  await Promise.resolve();
  expect(closed.sort()).toEqual(['one', 'one-second']);
  expect(sessions.get('one')).toBeUndefined(); expect(sessions.get('one-second')).toBeUndefined();
  expect(sessions.get('two')).toBeDefined(); expect(sessions.metrics.closed).toBe(2);
  expect(() => provider.verifyAccessTokenCurrent('one')).toThrow('Token not found');
  await sessions.closeAll();
});

for (const operation of ['dispatch', 'collect'] as const) for (const change of ['token', 'action'] as const) for (const lock of ['topology', 'task'] as const) {
  test(`PM queued ${operation} checks ${change} revocation after the ${lock} lock before effects`, async () => {
    await queuedPmRevocation(operation, change, lock);
  });
}
for (const change of ['token', 'action'] as const) {
  test(`PM queued collect checks ${change} revocation after the session lock before ingestion`, async () => {
    await queuedPmRevocation('collect', change, 'session');
  });
}

async function queuedPmRevocation(operation: 'dispatch' | 'collect', change: 'token' | 'action', lock: 'topology' | 'task' | 'session') {
  const f = fixture(true);
  // Collection reads canonical fixture artifacts. This is no live process proof.
  const { request, dir } = requestFixture(f, { pid: process.pid, identity: 'synthetic-unused-process-proof' });
  const result = { request_id: request.request_id, context_sha256: request.context_sha256, value: 'fixture-only' };
  writeSessionArtifact(request.result_ref, result);
  const path = mcpScope(f), bytes = readFileSync(path, 'utf8');
  const binding = createPmMcpBinding(f.env);
  const store = new McpOAuthTokenStore(join(f.home, 'queued-fixture-oauth.json'));
  const provider = createMcpOAuthProvider(store, { profile: 'pm', authorizationRevision: () => 7, pmScopeFingerprint: binding.fingerprint });
  const token = { token: 'queued-token', clientId: 'fixture-client', scopes: ['repo-harness', 'repo-harness.pm'],
    profile: 'pm', authorizationRevision: 7, authorizationId: 'queued-owner', pmScopeFingerprint: binding.fingerprint() };
  store.setAccessToken(token.token, token);
  let started!: () => void;
  const startedRequest = new Promise<void>(resolve => { started = resolve; });
  const server = createPmMcpServer(f.env, { binding, authorization: { authorizationId: token.authorizationId, verify: (accessToken, owner) => {
    const info = provider.verifyAccessTokenCurrent(accessToken) as AuthInfo & { authorizationId?: string };
    if (info.authorizationId !== owner) throw new Error('owner changed');
    started();
  } } });
  const [transport, peer] = InMemoryTransport.createLinkedPair();
  const send = transport.send.bind(transport);
  transport.send = (message, options) => send(message, { ...options, authInfo: token });
  const client = new Client({ name: 'queued-pm-fixture', version: '0' }, { capabilities: {} });
  await server.connect(peer); await client.connect(transport);
  const held = lock === 'task'
    ? acquireExclusiveDirectoryLock(join(f.repo, '.git'), taskLockRelativePath(taskId))
    : lock === 'topology' ? acquireExclusiveDirectoryLock(join(f.repo, '.git'), 'repo-harness/coordination/locks/worktree-topology.lock')
    : acquireExclusiveDirectoryLock(f.repo, relative(f.repo, join(dir, 'caller.lock')));
  try {
    const { repo_id, authorization_revision, ...taskScope } = f.scope;
    const status = await executePmRequest({ protocol: 1, operation: 'status', repo_id }, f.env) as any;
    const args = operation === 'collect' ? { ...taskScope, round: 1, request_id: request.request_id }
      : { ...taskScope, offer_revision: status.tasks[0].offer.offer_revision };
    let settled = false;
    const pending = client.callTool({ name: `pm_${operation}`, arguments: args }).then(value => { settled = true; return value; });
    await startedRequest; expect(settled).toBe(false);
    if (change === 'token') store.deleteAccessToken(token.token);
    else mcpScope(f, ['status']);
    held.release();
    const denied = pmPayload(await pending);
    expect(denied).toMatchObject({ ok: false, error: change === 'token'
      ? { message: 'Token not found' } : { code: 'pm_mcp_configuration_changed' } });
    expect(existsSync(join(dir, 'collected-1.json'))).toBe(false);
    expect(existsSync(join(dir, 'coding-host'))).toBe(false);
    expect(existsSync(join(f.execution, '.ai/harness/runs/pm-input'))).toBe(false);
    expect(readFileSync(request.result_ref, 'utf8')).toContain('fixture-only');
    // The same collect fixture is valid: after restoring authority, a NEW call
    // ingests it. The rejected queued request is never resumed or replayed.
    if (operation === 'collect') {
      writeFileSync(path, bytes); store.setAccessToken(token.token, token);
      expect(pmPayload(await client.callTool({ name: 'pm_collect', arguments: args }))).toMatchObject({ ok: true, data: { status: 'collected', result } });
      expect(existsSync(join(dir, 'collected-1.json'))).toBe(true);
    }
  } finally { held.release(); await client.close(); await server.close(); }
}

for (const change of ['token', 'action'] as const) test(`PM effect guard rejects queued dispatch ${change} revocation before native admission is read`, async () => {
  const f = fixture(true); mcpScope(f, ['dispatch']);
  const binding = createPmMcpBinding(f.env);
  const store = new McpOAuthTokenStore(join(f.home, 'dispatch-fence-oauth.json'));
  const provider = createMcpOAuthProvider(store, { profile: 'pm', authorizationRevision: () => 7, pmScopeFingerprint: binding.fingerprint });
  store.setAccessToken('dispatch-token', { token: 'dispatch-token', clientId: 'fixture', scopes: ['repo-harness', 'repo-harness.pm'],
    profile: 'pm', authorizationRevision: 7, authorizationId: 'dispatch-owner', pmScopeFingerprint: binding.fingerprint() });
  const status = await executePmRequest({ protocol: 1, operation: 'status', repo_id: f.scope.repo_id }, f.env) as any;
  const input = JSON.stringify({ protocol: 1, operation: 'dispatch', ...f.scope, offer_revision: status.tasks[0].offer.offer_revision });
  let entered!: () => void; const entering = new Promise<void>(resolve => { entered = resolve; });
  const held = acquireExclusiveDirectoryLock(join(f.repo, '.git'), taskLockRelativePath(taskId));
  try {
    const pending = runPmJson(input, f.env, () => {
      provider.verifyAccessTokenCurrent('dispatch-token'); binding.check(); entered();
    });
    await entering;
    if (change === 'token') store.deleteAccessToken('dispatch-token'); else mcpScope(f, ['status']);
    held.release();
    expect(await pending).toMatchObject({ operation: 'dispatch', ok: false, error: change === 'token'
      ? { code: 'pm_operation_failed', message: 'Token not found' } : { code: 'pm_mcp_configuration_changed' } });
    // Missing native admission would return a different error. This assertion
    // proves rejection inside the queued effect, rather than the MCP return fence.
    expect(existsSync(join(f.repo, '.ai/harness/runs/task-agents'))).toBe(false);
    expect(existsSync(join(f.execution, '.ai/harness/runs/pm-input'))).toBe(false);
  } finally { held.release(); }
});

for (const change of ['repo', 'action'] as const) test(`PM scope fingerprint fences persisted grants across restart after ${change} changes at the same registry revision`, async () => {
  const a = fixture(); const b = fixture(); mcpScope(a, ['status']);
  const registry = JSON.parse(readFileSync(join(a.home, 'registered-repos.json'), 'utf8'));
  registry.repos.push(JSON.parse(readFileSync(join(b.home, 'registered-repos.json'), 'utf8')).repos[0]);
  writeFileSync(join(a.home, 'registered-repos.json'), JSON.stringify(registry));
  const path = join(a.home, 'restart-oauth.json'), store = new McpOAuthTokenStore(path);
  const client = store.registerClient({ redirect_uris: ['http://localhost/fixture'], token_endpoint_auth_method: 'none' });
  const firstBinding = createPmMcpBinding(a.env);
  const first = createMcpOAuthProvider(store, { profile: 'pm', authorizationRevision: () => 7, pmScopeFingerprint: firstBinding.fingerprint });
  const consent = async (provider: typeof first) => {
    let url = '';
    await provider.authorize(client, { scopes: ['repo-harness', 'repo-harness.pm', 'offline_access'], redirectUri: client.redirect_uris[0]!, codeChallenge: 'fixture-challenge' },
      { redirect: (_status: number, value: string) => { url = value; } } as never);
    return new URL(url).searchParams.get('code')!;
  };
  const old = await first.exchangeAuthorizationCode(client, await consent(first), 'fixture-verifier', client.redirect_uris[0]);
  const oldFingerprint = firstBinding.fingerprint();
  expect(first.verifyAccessTokenCurrent(old.access_token)).toMatchObject({ pmScopeFingerprint: oldFingerprint });
  writeFileSync(join(a.home, 'pm-mcp.json'), JSON.stringify({ protocol: 1, repo_id: change === 'repo' ? b.scope.repo_id : a.scope.repo_id, authorization_revision: 7, allowed_operations: change === 'action' ? ['dispatch'] : ['status'] }));
  const secondBinding = createPmMcpBinding(a.env);
  expect(secondBinding.fingerprint()).not.toBe(oldFingerprint);
  const current = createMcpOAuthProvider(store, { profile: 'pm', authorizationRevision: () => 7, pmScopeFingerprint: secondBinding.fingerprint });
  // A consent code also cannot acquire the new scope before token issuance.
  const live = createPmMcpBinding(a.env); let fingerprint = oldFingerprint;
  const consentProvider = createMcpOAuthProvider(store, { profile: 'pm', authorizationRevision: () => 7, pmScopeFingerprint: () => fingerprint });
  const pending = await consent(consentProvider); fingerprint = live.fingerprint();
  await expect(consentProvider.exchangeAuthorizationCode(client, pending, 'fixture-verifier', client.redirect_uris[0])).rejects.toThrow('different PM scope');
  // Fresh provider plus reloaded persisted token store models a real restart.
  const restartedStore = new McpOAuthTokenStore(path); restartedStore.load();
  const restarted = createMcpOAuthProvider(restartedStore, { profile: 'pm', authorizationRevision: () => 7, pmScopeFingerprint: secondBinding.fingerprint });
  await expect(restarted.exchangeRefreshToken(client, old.refresh_token!)).rejects.toThrow('stale');
  expect(() => current.verifyAccessTokenCurrent(old.access_token)).toThrow('stale or missing');
  expect(() => restarted.verifyAccessTokenCurrent(old.access_token)).toThrow();
  const fresh = await current.exchangeAuthorizationCode(client, await consent(current), 'fixture-verifier', client.redirect_uris[0]);
  expect(current.verifyAccessTokenCurrent(fresh.access_token)).toMatchObject({ pmScopeFingerprint: secondBinding.fingerprint(), profile: 'pm' });
  const rotated = await current.exchangeRefreshToken(client, fresh.refresh_token!);
  expect(current.verifyAccessTokenCurrent(rotated.access_token)).toMatchObject({ pmScopeFingerprint: secondBinding.fingerprint() });
  expect(JSON.parse(readFileSync(join(a.home, 'registered-repos.json'), 'utf8')).authorizationRevision).toBe(7);
  expect(() => first.verifyAccessTokenCurrent(old.access_token)).toThrow();
});

async function pmHttpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return server.close(() => reject(new Error('fixture port missing')));
      server.close(() => resolve(address.port));
    });
  });
}
function pmHttpPayload(text: string): any {
  const data = text.split(/\r?\n/).filter(line => line.startsWith('data:')).at(-1)?.slice(5).trim();
  return JSON.parse(data ?? text);
}

test('PM HTTP enforces profile and session owner on list, calls, streams and deletion; revocation stops access', async () => {
  const f = fixture(true); mcpScope(f, ['capabilities', 'status']);
  const config = { version: 3, profile: 'pm', authorizationRevision: 7, pm: { enabled: true } };
  writeFileSync(join(f.home, 'mcp.local.json'), JSON.stringify(config), { mode: 0o600 });
  const store = new McpOAuthTokenStore(join(f.home, 'mcp.oauth-tokens.json'));
  const oauthClient = store.registerClient({ redirect_uris: ['http://localhost/fixture'], token_endpoint_auth_method: 'none' });
  for (const [token, owner, profile] of [['fixture-one', 'owner-one', 'pm'], ['fixture-two', 'owner-two', 'pm'], ['fixture-old-planner', 'owner-old', 'planner']]) {
    store.setAccessToken(token!, { token: token!, clientId: oauthClient.client_id, authorizationId: owner,
      profile, authorizationRevision: 7, pmScopeFingerprint: createPmMcpBinding(f.env).fingerprint(), scopes: ['repo-harness', 'repo-harness.pm'], expiresAt: Math.floor(Date.now() / 1000) + 600 });
  }
  const port = await pmHttpPort(), base = `http://127.0.0.1:${port}`;
  const proc = Bun.spawn([process.execPath, join(import.meta.dir, '../../src/cli/index.ts'), 'mcp', 'serve', '--repo', f.repo,
    '--profile', 'pm', '--transport', 'http', '--port', String(port)], { env: f.env, stdout: 'ignore', stderr: 'pipe' });
  const diagnostic = new Response(proc.stderr).text();
  const headers = (token: string, session?: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json',
    accept: 'application/json, text/event-stream', ...(session ? { 'mcp-session-id': session } : {}) });
  const post = (token: string, session: string | undefined, body: unknown) => fetch(base + '/mcp', { method: 'POST', headers: headers(token, session), body: JSON.stringify(body) });
  const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'fixture', version: '0' } } };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { const r = await fetch(base + '/health'); if (r.ok) { ready = true; expect(await r.json()).toMatchObject({ profile: 'pm', capabilities: { workspaceReader: false, workspaceCoder: false, workflowExecutor: false, agentRunner: false } }); break; } } catch {}
      if (proc.exitCode !== null) throw new Error('PM fixture server exited: ' + await diagnostic);
      await Bun.sleep(50);
    }
    expect(ready).toBe(true);
    expect((await post('fixture-old-planner', undefined, init)).status).toBe(401);
    const first = await post('fixture-one', undefined, init); expect(first.status).toBe(200); await first.text();
    const session = first.headers.get('mcp-session-id')!; expect(session).toBeTruthy();
    await post('fixture-one', session, { jsonrpc: '2.0', method: 'notifications/initialized' });
    const second = await post('fixture-two', undefined, init); expect(second.status).toBe(200); await second.text();
    const ownSession = second.headers.get('mcp-session-id')!;
    await post('fixture-two', ownSession, { jsonrpc: '2.0', method: 'notifications/initialized' });
    const rpc = (id: number, method: string, params?: unknown) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
    const listed = await post('fixture-one', session, rpc(2, 'tools/list')); expect(listed.status).toBe(200);
    expect(pmHttpPayload(await listed.text()).result.tools.map((tool: any) => tool.name)).toEqual(['pm_capabilities', 'pm_status']);
    const queried = await post('fixture-one', session, rpc(3, 'tools/call', { name: 'pm_status', arguments: {} }));
    expect(JSON.parse(pmHttpPayload(await queried.text()).result.content[0].text)).toMatchObject({ ok: true, data: { authorization_revision: 7 } });
    const denied = await post('fixture-one', session, rpc(4, 'tools/call', { name: 'pm_dispatch', arguments: {} }));
    expect(JSON.parse(pmHttpPayload(await denied.text()).result.content[0].text)).toMatchObject({ ok: false, error: { code: 'pm_mcp_operation_denied' } });
    for (const method of ['tools/list', 'tools/call']) expect((await post('fixture-two', session, rpc(5, method, method === 'tools/call' ? { name: 'pm_status', arguments: {} } : undefined))).status).toBe(404);
    for (const method of ['GET', 'DELETE']) expect((await fetch(base + '/mcp', { method, headers: headers('fixture-two', session) })).status).toBe(404);
    const revoked = await fetch(base + '/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: 'fixture-one', client_id: oauthClient.client_id }) });
    expect(revoked.status).toBe(200);
    expect((await post('fixture-one', session, rpc(6, 'tools/list'))).status).toBe(401);
    expect((await post('fixture-two', ownSession, rpc(7, 'tools/list'))).status).toBe(200);
    writeFileSync(join(f.home, 'mcp.local.json'), JSON.stringify({ ...config, profile: 'planner' }));
    expect((await post('fixture-two', ownSession, rpc(8, 'tools/list'))).status).toBe(503);
    writeFileSync(join(f.home, 'mcp.local.json'), JSON.stringify(config));
    mcpScope(f, ['status']);
    expect((await post('fixture-two', undefined, init)).status).toBe(503);
  } finally { proc.kill('SIGTERM'); await proc.exited; await diagnostic; }
});


test('PM preflight reads bounded configuration without creating credentials or claiming a connection', () => {
  const f = fixture(); mcpScope(f, ['status', 'collect']);
  const configPath = join(f.home, 'mcp.local.json');
  const config = { version: 3, profile: 'pm', authorizationRevision: 7, pm: { enabled: true }, auth: { mode: 'oauth' } };
  writeFileSync(configPath, JSON.stringify(config));
  const before = readdirSync(f.home).sort().map(name => [name, readFileSync(join(f.home, name), 'utf8')]);
  expect(inspectPmMcpConnection(f.env)).toEqual({
    protocol: 1, kind: 'repo-harness-pm-connection-check',
    scope: { repo_id: f.scope.repo_id, authorization_revision: 7, allowed_operations: ['status', 'collect'] },
    http_configuration_valid: true, host_configuration_valid: false,
    blockers: ['pm_acquisition_not_admitted'], runtime_acceptance: 'unverified', connector_invocation: 'unverified', event_wake: 'unverified',
  });
  const cli = spawnSync(process.execPath, [join(import.meta.dir, '../../src/cli/index.ts'), 'mcp', 'pm-preflight', '--json'],
    { env: f.env, encoding: 'utf8' });
  expect(cli.status, cli.stderr).toBe(0);
  expect(JSON.parse(cli.stdout)).toEqual(inspectPmMcpConnection(f.env));
  expect(readdirSync(f.home).sort().map(name => [name, readFileSync(join(f.home, name), 'utf8')])).toEqual(before);
  for (const delta of [{ version: 2 }, { profile: 'planner' }, { authorizationRevision: 8 }, { pm: { enabled: false } }, { auth: { mode: 'bearer' } }]) {
    writeFileSync(configPath, JSON.stringify({ ...config, ...delta }));
    expect(inspectPmMcpConnection(f.env)).toMatchObject({ http_configuration_valid: false, blockers: ['pm_http_configuration_invalid', 'pm_acquisition_not_admitted'] });
  }
  writeFileSync(configPath, 'not-json secret-fixture-value');
  const invalid = JSON.stringify(inspectPmMcpConnection(f.env));
  expect(invalid).toContain('pm_connection_configuration_invalid');
  expect(invalid).not.toContain('secret-fixture-value'); expect(invalid).not.toContain(f.home);
  const registryPath = join(f.home, 'registered-repos.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  writeFileSync(configPath, JSON.stringify(config));
  registry.repos[0].accessMode = 'read_only'; writeFileSync(registryPath, JSON.stringify(registry));
  expect(inspectPmMcpConnection(f.env).blockers).toContain('pm_scope_not_approved');
  registry.authorizationRevision = 8; writeFileSync(registryPath, JSON.stringify(registry));
  expect(inspectPmMcpConnection(f.env)).toMatchObject({ scope: null, http_configuration_valid: false, blockers: ['pm_authorization_stale', 'pm_acquisition_not_admitted'] });
  chmodSync(join(f.home, 'pm-mcp.json'), 0o666);
  expect(inspectPmMcpConnection(f.env).blockers).toContain('pm_mcp_configuration_unsafe');
  expect(readdirSync(f.home).sort()).toEqual(before.map(([name]) => name));
});
