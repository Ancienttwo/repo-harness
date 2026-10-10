import { expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { execFileSync, spawn, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { buildTaskAgentCommand } from '../../src/cli/commands/task-agent';
import { assertCreated, collectTaskResult, harnessCapabilities, processIdentity, processProofAlive, startTaskAgent, taskSessionDirectory } from '../../src/effects/terminal/task-session';
import { validateHerdrEndpoint } from '../../src/effects/terminal/herdr';
import { reconcileTaskRequest } from '../../src/effects/terminal/task-request-readback';
import { canonicalize } from '../../src/core/evidence/canonical-json';

test('public task-agent command has only task participant operations, never server stop', () => {
  expect(buildTaskAgentCommand().commands.map(command => command.name())).toEqual(['start', 'send', 'result', 'collect', 'status', 'history', 'read', 'reconcile', 'close', 'cancel']);
  expect(buildTaskAgentCommand().commands.some(command => command.name().includes('server'))).toBe(false);
});

function withReadbackFixture(run: (fixture: ReturnType<typeof readbackFixture>) => void) {
  const root = realpathSync(mkdtempSync('/tmp/rb-'));
  try { run(readbackFixture(root)); } finally { rmSync(root, { recursive: true, force: true }); }
}

// Saved collaboration artifacts are synthetic. No live Herdr or model is claimed.
function readbackFixture(root: string) {
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git(['init', '-q', '-b', 'main']);
  const commit = () => git(['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--allow-empty', '-qm', 'fixture']);
  commit();
  const sha = git(['rev-parse', 'HEAD']), task = 'readback-task', role = 'deep-worker';
  const dir = taskSessionDirectory(root, task, role); mkdirSync(dir, { recursive: true });
  const outbox = join(root, '.ai/harness/runs/task-agent-outbox', basename(dir)); mkdirSync(outbox, { recursive: true });
  const identity = { pid: process.pid, identity: processIdentity(process.pid) };
  const binding = { protocol: 2, repository_id: realpathSync(join(root, '.git')), execution_root: root, runtime: 'herdr', task, role,
    harness_kind: 'fixture', endpoint: { session: 'fixture-unreachable', home: root }, capabilities: harnessCapabilities('fixture', 'fixture-proof'),
    max_requests: 2, pane_id: 'fixture-pane', terminal_id: 'fixture-terminal', workspace_id: 'fixture-workspace', shell: identity,
    agent_name: 'fixture-worker', provider: { ...identity, ownership: { disposition: 'attached' } }, host: null, ownership: { disposition: 'attached' } };
  const save = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value));
  save(join(dir, 'binding.json'), binding);
  const request = { protocol: 2, task, role, round: 1, request_id: 'stable-operation',
    context_sha256: 'sha256:' + createHash('sha256').update('context').digest('hex'),
    context_ref: join(outbox, 'context-1.txt'), source_ref: join(root, 'context.txt'), result_ref: join(outbox, 'result-1.json'),
    result_contract: { required_fields: ['request_id', 'context_sha256', 'value'], atomic_write: 'temp_rename',
      submission: { command: 'repo-harness task-agent result', repo: root, task, role, round: 1 } } };
  save(join(dir, 'request-1.json'), request); writeFileSync(request.context_ref, 'context');
  save(join(dir, 'delivery-1.json'), { request_id: request.request_id, state: 'unknown', error: 'lost ACK' });
  const read = () => reconcileTaskRequest(root, task, role, request.request_id, sha);
  return { root, dir, binding, request, sha, task, role, git, commit, save, read };
}

test('request readback keeps unknown delivery and never creates a new round or collected result', () => withReadbackFixture(f => {
  const before = readFileSync(join(f.dir, 'request-1.json'));
  const first = f.read();
  expect(first).toMatchObject({ request_id: 'stable-operation', round: 1, delivery: 'unknown', provider: 'alive',
    result_status: 'pending', result: null, acceptance_authorized: false, result_head_binding: 'unverified' });
  expect(f.read()).toEqual(first);
  expect(readFileSync(join(f.dir, 'request-1.json'))).toEqual(before);
  expect(existsSync(join(f.dir, 'request-2.json'))).toBe(false);
  expect(existsSync(join(f.dir, 'collected-1.json'))).toBe(false);
  const result = { request_id: f.request.request_id, context_sha256: f.request.context_sha256, value: { checks: 'fixture only' } };
  f.save(f.request.result_ref, result);
  expect(f.read().result).toEqual(result);
  const evidence = f.read().evidence.result!;
  expect(evidence.ref).toBe(f.request.result_ref);
  expect(evidence.sha256).toBe('sha256:' + createHash('sha256').update(canonicalize(JSON.parse(readFileSync(evidence.ref, 'utf8')))).digest('hex'));
  expect(existsSync(join(f.dir, 'collected-1.json'))).toBe(false);
}));

test('readback CLI returns the real saved request projection', () => withReadbackFixture(f => {
  const result = spawnSync(process.execPath, [new URL('../../src/cli/index.ts', import.meta.url).pathname,
    'task-agent', 'reconcile', '--repo', f.root, '--task', f.task, '--role', f.role,
    '--request-id', f.request.request_id, '--expected-head', f.sha], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(f.read());
}));

test('readback refuses unknown and duplicate request IDs', () => withReadbackFixture(f => {
  expect(() => reconcileTaskRequest(f.root, f.task, f.role, 'missing', f.sha)).toThrow('request_not_found');
  f.save(join(f.dir, 'request-2.json'), { ...f.request, round: 2,
    context_ref: join(f.root, '.ai/harness/runs/task-agent-outbox', basename(f.dir), 'context-2.txt'),
    result_ref: join(f.root, '.ai/harness/runs/task-agent-outbox', basename(f.dir), 'result-2.json') });
  expect(f.read).toThrow('request_id_conflict');
}));

test('HEAD drift refuses an old query fence and does not assert result candidate provenance', () => withReadbackFixture(f => {
  // Make a distinct commit without relying on clock granularity.
  f.git(['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--allow-empty', '-qm', 'changed candidate']);
  expect(f.read).toThrow('head_stale');
  const current = f.git(['rev-parse', 'HEAD']);
  expect(reconcileTaskRequest(f.root, f.task, f.role, f.request.request_id, current).result_head_binding).toBe('unverified');
  writeFileSync(f.request.context_ref, 'changed context');
  expect(() => reconcileTaskRequest(f.root, f.task, f.role, f.request.request_id, current)).toThrow('context_identity_mismatch');
}));

test('forged result and delivery identity fail closed; host results stay protected', () => withReadbackFixture(f => {
  f.save(f.request.result_ref, { request_id: 'forged', context_sha256: f.request.context_sha256, value: 'PASS' });
  expect(f.read).toThrow('result_identity_mismatch');
  f.save(join(f.dir, 'binding.json'), { ...f.binding, host: f.binding.provider });
  expect(f.read()).toMatchObject({ result_status: 'host_authority', result: null, evidence: { result: null } });
  f.save(join(f.dir, 'delivery-1.json'), { request_id: 'forged', state: 'accepted' });
  expect(f.read).toThrow('delivery_identity_mismatch');
}));

test('provider identity loss is an interrupted observation, never success', () => withReadbackFixture(f => {
  f.save(join(f.dir, 'binding.json'), { ...f.binding, provider: { ...f.binding.provider, identity: 'replaced process' } });
  expect(f.read()).toMatchObject({ provider: 'identity_unavailable', result_status: 'pending', acceptance_authorized: false });
}));

// This deterministic observation seam changes only disposable fixture state.
// Real ps liveness remains covered by the original and readback lifecycle tests.
test.each(['context', 'head'] as const)('readback refuses %s changed during provider observation', change => withReadbackFixture(f => {
  const bin = join(f.root, 'bin'); mkdirSync(bin);
  const previousPath = process.env.PATH;
  const mutation = change === 'context'
    ? `require('fs').writeFileSync(${JSON.stringify(f.request.context_ref)}, 'changed during read');`
    : `require('child_process').execFileSync('git', ['-c','user.name=fixture','-c','user.email=fixture@localhost','commit','--allow-empty','-qm','candidate changed during read'], {cwd:${JSON.stringify(f.root)}});`;
  const columns = f.binding.provider.identity.split(/\s+/).slice(0, 7).join(' ');
  writeFileSync(join(bin, 'ps'), `#!${process.execPath}\n${mutation}\nprocess.stdout.write(process.argv.at(-1).endsWith('stat=') ? ${JSON.stringify(columns + ' S\n')} : ${JSON.stringify(f.binding.provider.identity + '\n')});\n`);
  chmodSync(join(bin, 'ps'), 0o700);
  try {
    process.env.PATH = bin + ':' + previousPath;
    expect(f.read).toThrow(change === 'context' ? 'readback_changed' : 'head_stale');
  } finally { process.env.PATH = previousPath; }
}));

test('missing delivery stays unknown and malformed query inputs fail before lookup', () => withReadbackFixture(f => {
  unlinkSync(join(f.dir, 'delivery-1.json'));
  expect(f.read()).toMatchObject({ delivery: 'unknown', evidence: { delivery: null } });
  for (const requestId of ['', '../request', 'x'.repeat(129)]) {
    expect(() => reconcileTaskRequest(f.root, f.task, f.role, requestId, f.sha)).toThrow('request_id_invalid');
  }
  for (const sha of ['', 'main', f.sha.slice(1)]) {
    expect(() => reconcileTaskRequest(f.root, f.task, f.role, f.request.request_id, sha)).toThrow('expected_head_invalid');
  }
  for (const max of [0, 101, 1.5]) {
    f.save(join(f.dir, 'binding.json'), { ...f.binding, max_requests: max });
    expect(f.read).toThrow('binding_invalid');
  }
  f.save(join(f.dir, 'binding.json'), { ...f.binding, max_requests: 100 });
  expect(f.read().request_id).toBe(f.request.request_id);
}));

test('an exited provider leaves a pending request pending', async () => {
  const root = realpathSync(mkdtempSync('/tmp/rb-exit-'));
  const child = spawn(process.execPath, ['-e', 'console.log("ready");setInterval(()=>{},1000)'], { stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    await new Promise<void>((resolve, reject) => { child.once('error', reject); child.stdout!.once('data', () => resolve()); });
    const proof = { pid: child.pid!, identity: processIdentity(child.pid!) };
    const f = readbackFixture(root);
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    child.kill('SIGTERM'); await exited;
    f.save(join(f.dir, 'binding.json'), { ...f.binding, provider: { ...f.binding.provider, ...proof } });
    expect(f.read()).toMatchObject({ provider: 'exited', result_status: 'pending', result: null, acceptance_authorized: false });
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    rmSync(root, { recursive: true, force: true });
  }
});
test('attached ownership cannot be signalled and real harness evidence stays unverified', () => {
  expect(() => assertCreated({ disposition: 'attached' })).toThrow('attached_object_not_closeable');
  for (const kind of ['codex', 'claude', 'opencode', 'pi']) {
    expect(harnessCapabilities(kind).read_only).toEqual({ status: 'unverified', evidence_ref: null });
    expect(() => harnessCapabilities(kind, 'fixture-evidence.json')).toThrow('real_harness_unverified');
  }
  expect(harnessCapabilities('fixture', 'fixture-evidence.json').resume).toEqual({ status: 'verified', evidence_ref: 'fixture-evidence.json' });
});
test('both socket endpoints are validated before directory or intent creation', async () => {
  const root = mkdtempSync('/tmp/ep-');
  try {
    const home = '/tmp/' + 'x'.repeat(120);
    expect(() => validateHerdrEndpoint({ session: 'owned', home })).toThrow('endpoint_path_too_long');
    await expect(startTaskAgent(root, { task: 'task', role: 'advisor', harness_kind: 'codex', endpoint: { session: 'owned', home }, parent_pane: 'unused', args: [], max_requests: 1 })).rejects.toThrow('endpoint_path_too_long');
    expect(existsSync(join(root, '.ai'))).toBe(false);
    // This API socket fits; its longer client socket does not. No server is started.
    const session = 's';
    const capacity = process.platform === 'darwin' ? 103 : 107;
    const shortBase = '/tmp/' + 'x'.repeat(capacity - '/tmp/'.length - '/.config/herdr/sessions/s/herdr.sock'.length);
    expect(() => validateHerdrEndpoint({ session, home: shortBase })).toThrow('endpoint_path_too_long');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('public start rejects caller-supplied argv before allocating task state', async () => {
  const root = mkdtempSync('/tmp/av-');
  try {
    for (const args of [['--dangerously-skip-permissions'], ['--model', 'caller-selected']]) {
      writeFileSync(join(root, 'spec.json'), JSON.stringify({ task: 'task', role: 'advisor', harness_kind: 'codex',
        endpoint: { session: 'unused', home: root }, parent_pane: 'unused', args, max_requests: 1 }));
      await expect(buildTaskAgentCommand().parseAsync(['start', '--repo', root, '--input', 'spec.json'], { from: 'user' })).rejects.toThrow('arguments_require_role_profile');
      expect(existsSync(join(root, '.ai'))).toBe(false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});


// Host domain results must never be supplied through the collaboration outbox.
test.each(['file','cli'])('workspace writer cannot publish a host gatekeeper result via %s', async channel => {
  const root=realpathSync(mkdtempSync('/tmp/ha-'));
  try {
    execFileSync('git',['init','-q','-b','main'],{cwd:root});
    const execution=root,task='authority-task',role='gatekeeper';
    const dir=taskSessionDirectory(root,task,role);mkdirSync(dir,{recursive:true});
    const outbox=join(root,'.ai/harness/runs/task-agent-outbox',basename(dir));mkdirSync(outbox,{recursive:true});
    const identity={pid:process.pid,identity:processIdentity(process.pid)};
    const binding={protocol:2,repository_id:realpathSync(join(root,'.git')),execution_root:execution,runtime:'herdr',task,role,harness_kind:'fixture',
      endpoint:{session:'fixture-unreachable',home:root},capabilities:harnessCapabilities('fixture','fixture-proof'),max_requests:1,
      pane_id:'fixture-pane',terminal_id:'fixture-terminal',workspace_id:'fixture-workspace',shell:identity,agent_name:'fixture-gate',provider:{...identity,ownership:{disposition:'attached'}},host:identity,ownership:{disposition:'attached'}};
    writeFileSync(join(dir,'binding.json'),JSON.stringify(binding));
    const digest='sha256:'+createHash('sha256').update('context').digest('hex');
    const request={protocol:2,task,role,round:1,request_id:'fixture-request',context_sha256:digest,context_ref:join(outbox,'context-1.txt'),source_ref:join(root,'context.txt'),result_ref:join(outbox,'result-1.json'),result_contract:{required_fields:['request_id','context_sha256','value'],atomic_write:'temp_rename',submission:{command:'repo-harness task-agent result',repo:root,task,role,round:1}}};
    writeFileSync(join(dir,'request-1.json'),JSON.stringify(request));writeFileSync(request.context_ref,'context');
    const forged={request_id:request.request_id,context_sha256:digest,value:'forged gatekeeper PASS'};
    writeFileSync(join(root,'forged.json'),JSON.stringify(forged));
    if(channel==='file')execFileSync(process.execPath,['-e',`require('fs').writeFileSync(process.argv[1],process.argv[2])`,request.result_ref,JSON.stringify(forged)],{cwd:root});
    else {
      const result=spawnSync(process.execPath,[new URL('../../src/cli/index.ts',import.meta.url).pathname,'task-agent','result','--repo',root,'--task',task,'--role',role,'--round','1','--input','forged.json'],{cwd:root,env:process.env,encoding:'utf8'});
      expect(result.status).not.toBe(0);expect(result.stderr).toContain('host_authority');
    }
    expect(await collectTaskResult(root,task,role,1)).toBeNull();
    expect(existsSync(join(dir,'collected-1.json'))).toBe(false);
  } finally {rmSync(root,{recursive:true,force:true});}
});

// A real parent retains its dead child until the caller explicitly asks it to reap.
// No Herdr/provider/model is involved; Python's Popen only waits after stdin.
test.skipIf(process.platform === 'win32' || !Bun.which('python3'))('unreaped owned child is exited while forged PID and birth identities still fail closed', async () => {
  const parent = spawn(Bun.which('python3')!, ['-u', '-c', `
import json, subprocess, sys
child = subprocess.Popen([sys.argv[1], '60'], start_new_session=True)
print(json.dumps({'pid':child.pid}), flush=True)
try:
    sys.stdin.readline()
finally:
    if child.poll() is None:
        child.kill()
    child.wait(timeout=10)
`, Bun.which('sleep')!], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  try {
    const pid = await new Promise<number>((resolve, reject) => {
      parent.once('error', reject);
      parent.stdout!.on('data', chunk => { output += chunk; if (output.includes('\n')) resolve(JSON.parse(output.split('\n')[0]!).pid); });
    });
    const proof = { pid, identity: processIdentity(pid) };
    expect(processProofAlive(proof)).toBe(true);
    expect(() => processProofAlive({ ...proof, identity: proof.identity + '-changed' })).toThrow('identity_lost');
    process.kill(pid, 'SIGTERM');
    const deadline = Date.now() + 5000;
    let stat = '';
    while (Date.now() < deadline) {
      stat = execFileSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' }).trim();
      if (stat.startsWith('Z')) break;
      await Bun.sleep(10);
    }
    expect(stat.startsWith('Z')).toBe(true);
    expect(() => process.kill(pid, 0)).not.toThrow(); // Not yet reaped, independent OS oracle.
    expect(processProofAlive(proof)).toBe(false);
    const pieces = proof.identity.split(/\s+/);
    const differentBirth = [...pieces]; differentBirth[6] = '1900';
    expect(() => processProofAlive({ pid, identity: differentBirth.join(' ') })).toThrow('identity_lost');
    expect(() => processProofAlive({ pid: process.pid, identity: proof.identity })).toThrow('identity_lost');
  } finally {
    parent.stdin!.end('reap\n');
    await new Promise<void>(resolve => { if (parent.exitCode !== null || parent.signalCode !== null) resolve(); else parent.once('exit', () => resolve()); });
  }
}, 15_000);

test.skipIf(process.platform === 'win32')('process proof rejects birth changes between identity and live-state snapshots', () => {
  const proof = { pid: process.pid, identity: processIdentity(process.pid) };
  const root = mkdtempSync('/tmp/ps-'); const savedPath = process.env.PATH;
  try {
    const columns = proof.identity.split(/\s+/).slice(0, 7); columns[6] = '1900';
    const altered = columns.join(' ') + ' S';
    const reply = (identity: string, state: string) => {
      writeFileSync(join(root, 'ps'), `#!${process.execPath}\nprocess.stdout.write(process.argv.at(-1).endsWith('stat=') ? ${JSON.stringify(state + '\n')} : ${JSON.stringify(identity + '\n')});\n`);
      chmodSync(join(root, 'ps'), 0o700);
    };
    reply(proof.identity, altered); process.env.PATH = root + ':' + savedPath;
    expect(() => processProofAlive(proof)).toThrow('identity_lost');
    if (process.platform === 'darwin') {
      const prefix = proof.identity.split(/\s+/).slice(0, 7).join(' ');
      const codexProof = { pid: proof.pid, identity: prefix + ' codex' };
      reply(prefix + ' (codex)', prefix + ' ?E+');
      expect(processProofAlive(codexProof)).toBe(false);
      reply(prefix + ' (codex)', prefix + ' S+');
      expect(() => processProofAlive(codexProof)).toThrow('identity_lost');
    }
  } finally { process.env.PATH = savedPath; rmSync(root, { recursive: true, force: true }); }
});
