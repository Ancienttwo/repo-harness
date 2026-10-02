import { afterEach, expect, test } from 'bun:test';
import { readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { REVIEW_MAX_ROUNDS, validateReviewOutput } from '../src/core/review/generic-review';
import { reviewSessionOptions } from '../src/effects/review/generic-review';
import { ensureSessionDirectory, nextSessionRound, writeSessionArtifact } from '../src/effects/terminal/task-session';
import { tmpWorkspace, run } from './helpers/repo-fixture';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const identity = { request_id: 'r', context_sha256: 'domain-context', subject_sha256: 'subject', actual_harness: 'claude' as const, actual_role: 'deep-reasoner', actual_model: 'fixture-model' };
const finding = { id: 'f', severity: 'P1' as const, status: 'new' as const, message: '[fixture opinion] fix the fence' };
const fail = { ...identity, verdict: 'FAIL', summary: '[fixture opinion] revise', findings: [finding] };
test('generic review validates exact domain binding, verdict, stable findings and no launch fields', () => {
  expect(validateReviewOutput(fail, identity).verdict).toBe('FAIL');
  for (const field of Object.keys(identity)) expect(() => validateReviewOutput({ ...fail, [field]: 'different' }, identity)).toThrow(`review_${field}_mismatch`);
  expect(() => validateReviewOutput({ ...fail, session_id: 'launcher' }, identity)).toThrow('review_malformed_result');
  expect(() => validateReviewOutput({ ...fail, verdict: 'PASS' }, identity)).toThrow('review_conflicting_verdict');
  expect(() => validateReviewOutput({ ...fail, findings: [finding, finding] }, identity)).toThrow('review_malformed_finding');
  expect(() => validateReviewOutput(fail, identity, [finding])).toThrow('review_previous_finding_unaddressed');
  expect(() => validateReviewOutput({ ...fail, findings: [] }, identity, [finding])).toThrow('review_previous_finding_unaddressed');
  const resolved = { ...finding, status: 'resolved' as const };
  expect(validateReviewOutput({ ...fail, verdict: 'PASS', findings: [resolved] }, identity, [finding]).findings).toEqual([resolved]);
});
test('three-round accounting survives reopen; pending and duplicate subjects cannot replay', () => {
  const root = tmpWorkspace('generic-review-budget'); roots.push(root); const dir = join(root, 'rounds'); ensureSessionDirectory(root, dir);
  const subject = (value: { subject: string }) => value.subject;
  expect(nextSessionRound(dir, REVIEW_MAX_ROUNDS, 'a', subject)).toBe(1);
  writeSessionArtifact(join(dir, 'request-1.json'), { subject: 'a' });
  expect(() => nextSessionRound(dir, REVIEW_MAX_ROUNDS, 'b', subject)).toThrow('task_agent_ambiguous_round');
  writeSessionArtifact(join(dir, 'accepted-1.json'), {});
  expect(() => nextSessionRound(dir, REVIEW_MAX_ROUNDS, 'a', subject)).toThrow('task_agent_duplicate_subject');
  for (let round = 2; round <= 3; round++) {
    expect(nextSessionRound(dir, REVIEW_MAX_ROUNDS, String(round), subject)).toBe(round);
    writeSessionArtifact(join(dir, `request-${round}.json`), { subject: String(round) });
    writeSessionArtifact(join(dir, `accepted-${round}.json`), {});
  }
  expect(() => nextSessionRound(dir, REVIEW_MAX_ROUNDS, 'fourth', subject)).toThrow('task_agent_round_budget_exhausted');
});
test('OAR SessionOptions reuse fleet and authorize only file communication, without vendor argv', () => {
  const root = tmpWorkspace('generic-review-options'); roots.push(root);
  const claude = reviewSessionOptions('claude', root), codex = reviewSessionOptions('codex', root);
  expect(claude.cwd).toBe(root); expect(codex.cwd).toBe(root);
  expect(claude.model).toBe('opus'); expect(codex.model).toBe('gpt-6-astra');
  expect(codex.effort).toBe('high');
  for (const options of [claude, codex]) {
    expect(options.appendSystemPrompt).toContain('RECOMMENDATION:');
    expect(options.appendSystemPrompt).toContain('exact result_ref');
    expect(Object.keys(options).sort()).toEqual(['appendSystemPrompt','cwd','effort','model']);
  }
});
test('retired CLI rejects with upgrade-required rather than routing to generic review', () => {
  const root = tmpWorkspace('generic-review-old-cli'); roots.push(root);
  const result = run(process.execPath, [join(import.meta.dir, '../src/cli/index.ts'), 'claude-review', 'round', '--contract', 'x', '--json'], root);
  expect(result.status).toBe(1); expect(result.stderr?.toString()).toContain('UPGRADE_REQUIRED');
  expect(result.stderr?.toString()).toContain('use repo-harness review');
});

// Mandatory B first proof. Dummy Node processes only; no OAR/vendor Session.
test.skipIf(process.platform !== 'darwin')('OAR isolation: Seatbelt denies paired host and descendant writes with output-only allowance', async () => {
  const { mkdirSync, writeFileSync, symlinkSync, realpathSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { reviewIsolationPolicy, reviewHostTemporaryDirectory, codexNativeStatePaths } = await import('../src/effects/review/review-isolation');
  const root = tmpWorkspace('oar-isolation'); roots.push(root);
  const subject = join(root, 'subject'), primary = join(root, 'primary'), owner = join(root, 'owner-record'), journal = join(root, 'journal'), git = join(root, 'git-common'), output = join(root, 'output');
  for (const dir of [subject, primary, owner, journal, git, output]) mkdirSync(dir);
  const protectedPaths = [subject, primary, owner, journal, git].map(dir => join(dir, 'protected.txt'));
  for (const path of protectedPaths) writeFileSync(path, 'KEEP');
  symlinkSync(protectedPaths[0]!, join(output, 'escape-link'));
  const forbidden = ['CLAUDE.md','AGENTS.md','settings.local.json','auth.json','.credentials.json','config.toml','agents/definition.md','skills/definition.md','rules/definition.md','plugins/definition.json','hooks/handler.sh'].map(path => join(output, path));
  for (const path of forbidden) { const { dirname } = await import('node:path'); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, 'KEEP'); }
  const nativeHome = join(root, 'native-home'); mkdirSync(join(nativeHome, '.codex', 'tmp'), { recursive: true });
  const grants = codexNativeStatePaths(nativeHome);
  expect(grants.nativeStateFiles).toHaveLength(16);
  const allowedNative = [...grants.nativeStateFiles!, join(grants.nativeStateDirectories![0]!, 'probe.txt')];
  const deniedNative = ['goals_2.sqlite','memories_2.sqlite','queue_2.sqlite','installation_id-other','config.toml','auth.json','AGENTS.md','rules/rule.md','skills/skill.md','other-state.json'].map(path => join(nativeHome, '.codex', path));
  for (const path of [...allowedNative, ...deniedNative]) { const { dirname } = await import('node:path'); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, 'KEEP'); }
  const targets = [...protectedPaths, join(output, 'escape-link'), join(output, '../subject/protected.txt'), ...forbidden, ...deniedNative];
  const policy = reviewIsolationPolicy({ subject, primary, ownerRecord: owner, journal, gitCommonDir: git, output, ...grants });
  expect(policy).not.toContain(`(subpath ${JSON.stringify(join(nativeHome, '.codex'))})`);
  for (const file of grants.nativeStateFiles!) expect(policy).toContain(`(literal ${JSON.stringify(file)})`);
  const profile = join(root, 'profile.sb'); writeFileSync(profile, policy);
  const worker = join(root, 'worker.cjs');
  writeFileSync(worker, `
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),os=require('node:os');
const spec=JSON.parse(process.argv[2]);
const results=spec.targets.map(path=>{try{fs.writeFileSync(path,'CHANGED');return {path,denied:false}}catch(e){return {path,denied:true,code:e.code,message:e.message}}});
const capture=r=>({status:r.status,error:r.error?.code,message:r.error?.message,stdout:r.stdout,stderr:r.stderr});
const stdioIgnore=capture(cp.spawnSync('/usr/bin/true',[],{stdio:'ignore'}));
const devNull=capture(cp.spawnSync('/bin/sh',['-c','echo hi > /dev/null'],{encoding:'utf8'}));
let temporary;try{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oar-zero-'));fs.writeFileSync(path.join(dir,'check.txt'),'TMP');temporary={ok:true,dir}}catch(e){temporary={ok:false,code:e.code,message:e.message}};
const nested=capture(cp.spawnSync('/usr/bin/sandbox-exec',['-p','(version 1)(allow default)','/usr/bin/true'],{encoding:'utf8'}));
const nativeWrites=spec.allowedNative.map(path=>{try{fs.writeFileSync(path,'NATIVE');return {path,allowed:true}}catch(e){return {path,allowed:false,code:e.code,message:e.message}}});
const operations={stdioIgnore,devNull,temporary,nested,nativeWrites};
fs.writeFileSync(spec.allowed,'ALLOWED');
if(spec.child){const r=cp.spawnSync(process.execPath,[__filename,JSON.stringify({...spec,child:false,allowed:spec.childAllowed})],{encoding:'utf8'});console.log(JSON.stringify({results,operations,child:{status:r.status,stdout:r.stdout,stderr:r.stderr}}))}
else console.log(JSON.stringify({results,operations}));
`);
  const node = realpathSync('/opt/homebrew/opt/node@24/bin/node');
  const spec = { targets, allowedNative, allowed: join(output, 'host.txt'), childAllowed: join(output, 'child.txt'), child: true };
  const temporary = reviewHostTemporaryDirectory(output);
  const result = spawnSync('/usr/bin/sandbox-exec', ['-f', profile, node, worker, JSON.stringify(spec)], { encoding: 'utf8', timeout: 15000, env: { ...process.env, TMPDIR: temporary } });
  console.log(JSON.stringify({ diagnostic: 'zero-model Seatbelt fixture', status: result.status, error: result.error?.message, stdout: result.stdout, stderr: result.stderr }));
  expect(result.status, result.stderr).toBe(0);
  const observed = JSON.parse(result.stdout);
  expect(observed.results).toHaveLength(targets.length);
  expect(Number(observed.child.status), String(observed.child.stderr)).toBe(0);
  const child = JSON.parse(observed.child.stdout);
  for (const row of [...observed.results, ...child.results]) {
    expect(Boolean(row.denied), String(row.path)).toBe(true);
    expect(['EPERM', 'EACCES'], row.path).toContain(row.code);
  }
  for (const evidence of [observed, child]) {
    for (const result of evidence.operations.nativeWrites) expect(Boolean(result.allowed), String(result.path)).toBe(true);
    expect(evidence.operations.stdioIgnore.status).toBe(0);
    expect(evidence.operations.devNull.status).toBe(0);
    expect(evidence.operations.temporary.ok).toBe(true);
    expect(String(evidence.operations.temporary.dir).startsWith(temporary + '/')).toBe(true);
    // Nested Seatbelt remains unusable; OAR defaults avoid nesting. Not a
    // native Codex exec proof or an instruction to weaken the outer policy.
    expect(evidence.operations.nested.status).toBe(71);
    expect(String(evidence.operations.nested.stderr)).toContain('sandbox_apply: Operation not permitted');
  }
  for (const path of [...protectedPaths, ...forbidden, ...deniedNative]) expect(readFileSync(path, 'utf8')).toBe('KEEP');
  expect(readFileSync(join(output, 'host.txt'), 'utf8')).toBe('ALLOWED');
  expect(readFileSync(join(output, 'child.txt'), 'utf8')).toBe('ALLOWED');
});

test('OAR isolation: reject authority overlap and symlink output roots before execution', async () => {
  const { mkdirSync, symlinkSync } = await import('node:fs');
  const { reviewIsolationPolicy } = await import('../src/effects/review/review-isolation');
  const root = tmpWorkspace('oar-isolation-admission'); roots.push(root);
  const subject = join(root, 'subject'), primary = join(root, 'primary'), output = join(root, 'output');
  for (const path of [subject, primary, output]) mkdirSync(path);
  const spec = { subject, primary, ownerRecord: primary, journal: primary, gitCommonDir: primary, output };
  expect(() => reviewIsolationPolicy({ ...spec, output: primary })).toThrow('OVERLAPS_AUTHORITY');
  const link = join(root, 'link'); symlinkSync(output, link);
  expect(() => reviewIsolationPolicy({ ...spec, output: link })).toThrow('OUTPUT_UNSAFE');
  expect(() => reviewIsolationPolicy(spec, 'win32')).toThrow('UNSUPPORTED_PLATFORM');
  expect(() => reviewIsolationPolicy({ ...spec, nativeStateDirectories: [primary] })).toThrow('NATIVE_STATE_OVERLAPS_AUTHORITY');
  expect(() => reviewIsolationPolicy({ ...spec, nativeStateDirectories: [root] })).toThrow('NATIVE_STATE_OVERLAPS_AUTHORITY');
  expect(() => reviewIsolationPolicy({ ...spec, nativeStateDirectories: [output] })).toThrow('NATIVE_STATE_OVERLAPS_AUTHORITY');
});

async function runOarNodeFixture(label: string, body: string, confined = true) {
  const { mkdirSync, writeFileSync, realpathSync } = await import('node:fs');
  const { pathToFileURL } = await import('node:url');
  const { spawnSync } = await import('node:child_process');
  const { reviewIsolationPolicy, reviewHostTemporaryDirectory } = await import('../src/effects/review/review-isolation');
  const root = tmpWorkspace(label); roots.push(root);
  const subject = join(root, 'subject'), output = join(root, 'output'); mkdirSync(subject); mkdirSync(output);
  const paths = { subject, primary: subject, ownerRecord: subject, journal: subject, gitCommonDir: subject, output };
  const policyFile = join(root, 'profile.sb'); writeFileSync(policyFile, reviewIsolationPolicy(paths), { mode: 0o600 });
  const temporary = reviewHostTemporaryDirectory(output), worker = join(root, 'fixture.mjs');
  const entry = pathToFileURL(realpathSync(join(import.meta.dir, '../dist/oar-review-host.js'))).href;
  writeFileSync(worker, `import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openScriptedReviewHost,runHostFileRequest,reviewRuntime,assertOarHostNode} from ${JSON.stringify(entry)};
const output=${JSON.stringify(output)},isolation=${JSON.stringify({paths,policyFile})};
${body}`);
  const node = realpathSync('/opt/homebrew/opt/node@24/bin/node');
  const result = confined ? spawnSync('/usr/bin/sandbox-exec', ['-f', policyFile, node, worker], { encoding: 'utf8', timeout: 15000, env: { ...process.env, TMPDIR: temporary } })
    : spawnSync(node, [worker], { encoding: 'utf8', timeout: 15000 });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as { calls: number; passed: boolean; model: string | null };
}

test.skipIf(process.platform !== 'darwin')('OAR scripted host: Node Session budget, default sandbox knob and disposal under admission', async () => {
  const result = await runOarNodeFixture('oar-scripted-node', `
let calls=0;const events=[];process.env.OAR_CODEX_SANDBOX='workspace-write';
const host=await openScriptedReviewHost({cwd:output},v=>events.push(v),async({say})=>{assert.equal(process.env.OAR_CODEX_SANDBOX,undefined);calls++;say('RECOMMENDATION: fixture observation only — confidence: HIGH')},isolation);
try{const id=host.sessionId;for(const input of ['one','two','three']){assert.equal((await host.prompt(input)).kind,'ended');assert.equal(host.sessionId,id)}
assert.equal(calls,3);assert.ok(events.length>0);await assert.rejects(host.prompt('fourth'),/BUDGET_EXHAUSTED/);
await host.dispose();await assert.rejects(host.prompt('after-dispose'),/HOST_DISPOSED/);
assert.equal(reviewRuntime('claude').id,'claude');assert.equal(reviewRuntime('codex').id,'codex');assert.throws(()=>reviewRuntime('grok'),/UNSUPPORTED/);assert.throws(()=>assertOarHostNode('22.22.0'),/NODE_24_REQUIRED/);
console.log(JSON.stringify({calls,passed:true}));}finally{await host.dispose()}`);
  expect(result.calls).toBe(3); expect(result.passed).toBe(true);
});

test.skipIf(process.platform !== 'darwin')('OAR file delivery: Node reviewer writes Results, recommendation text is observation', async () => {
  const result = await runOarNodeFixture('oar-file-node', String.raw`
const spec={mode:'review',kind:'codex',installation:{kind:'available',via:'bundled'},options:{cwd:output},requestDirectory:output,output,timeoutMs:1000,isolation};let calls=0;
const host=await openScriptedReviewHost(spec.options,()=>{},async({input,say})=>{calls++;const request=JSON.parse(input.split('\n')[0].slice('TASK REQUEST: '.length));say('RECOMMENDATION: fixture file communication — confidence: HIGH');writeFileSync(request.result_ref,JSON.stringify({request_id:request.request_id,context_sha256:request.context_sha256,value:{fixture:true,verdict:'FAIL',summary:'[fixture opinion] revise'}}))},isolation);
try{const id=host.sessionId;for(let round=1;round<=3;round++){const content='Domain-shaped fixture '+round;const request={protocol:2,task:'fixture',role:'deep-reasoner',round,request_id:'fixture-'+round,context_ref:join(output,'context-'+round+'.txt'),source_ref:'fixture',result_ref:join(output,'result-'+round+'.json'),context_sha256:'sha256:'+createHash('sha256').update(content).digest('hex'),result_contract:{required_fields:['request_id','context_sha256','value'],atomic_write:'temp_rename',submission:{command:'fixture',repo:output,task:'fixture',role:'deep-reasoner',round}}};writeFileSync(request.context_ref,content);const observed=await runHostFileRequest(host,spec,request);assert.equal(observed.kind,'ended');assert.equal(observed.actual_model,'fixture-oar');assert.equal(host.sessionId,id);assert.equal(JSON.parse(readFileSync(request.result_ref,'utf8')).value.summary,'[fixture opinion] revise')}
assert.equal(calls,3);await assert.rejects(host.prompt('fourth'),/BUDGET_EXHAUSTED/);assert.equal(host.model('claude'),null);console.log(JSON.stringify({calls,passed:true,model:host.model('claude')}));}finally{await host.dispose()}`);
  expect(result.calls).toBe(3); expect(result.model).toBeNull();
});

test.skipIf(process.platform !== 'darwin')('OAR Session refuses unconfined or changed owner profiles before opening', async () => {
  const result = await runOarNodeFixture('oar-unconfined', `
let calls=0;await assert.rejects(openScriptedReviewHost({cwd:output},()=>{},async()=>{calls++},isolation),/SEATBELT_REQUIRED/);assert.equal(calls,0);writeFileSync(isolation.policyFile,'(version 1)(allow default)');await assert.rejects(openScriptedReviewHost({cwd:output},()=>{},async()=>{calls++},isolation),/PROFILE_NOT_ADMITTED/);assert.equal(calls,0);console.log(JSON.stringify({calls,passed:true}))`, false);
  expect(result.calls).toBe(0); expect(result.passed).toBe(true);
});

test('OAR installation is probed by the fixed Node host, never the Bun controller', async () => {
  const { mkdirSync, writeFileSync, realpathSync, chmodSync } = await import('node:fs');
  const { probeReviewInstallation } = await import('../src/effects/review/generic-review');
  const root = tmpWorkspace('oar-node-installation'); roots.push(root);
  const trace = join(root, 'parent.txt'), executable = join(root, 'fake-codex');
  writeFileSync(executable, `#!/bin/sh\n/bin/ps -p "$PPID" -o command= >> '${trace}'\nprintf '0.0.0\\n'\n`); chmodSync(executable, 0o700);
  const priorNode = process.env.REPO_HARNESS_NODE_BIN, priorBin = process.env.OAR_CODEX_BIN;
  try {
    process.env.REPO_HARNESS_NODE_BIN = realpathSync('/opt/homebrew/opt/node@24/bin/node');
    process.env.OAR_CODEX_BIN = executable;
    const observed = await probeReviewInstallation('codex');
    expect(observed.kind).toBe('available');
    if (observed.kind !== 'available' || observed.via !== 'executable') throw new Error('fixture installation not observed');
    expect(observed.command).toBe(executable);
    expect(readFileSync(trace, 'utf8')).toContain(process.env.REPO_HARNESS_NODE_BIN);
    expect(readFileSync(trace, 'utf8')).toContain('oar-review-host.js --installation codex');
    expect(readFileSync(trace, 'utf8')).not.toContain('bun ');
    const source = readFileSync(join(import.meta.dir, '../src/effects/review/generic-review.ts'), 'utf8');
    expect(source).not.toContain('reviewRuntime');
    expect(source).toContain('import type { ReviewHostSpec, HostRoundObservation }');
  } finally {
    if (priorNode === undefined) delete process.env.REPO_HARNESS_NODE_BIN; else process.env.REPO_HARNESS_NODE_BIN = priorNode;
    if (priorBin === undefined) delete process.env.OAR_CODEX_BIN; else process.env.OAR_CODEX_BIN = priorBin;
  }
});

test('Codex exact state admission refuses root/tmp/file symlinks and literal overlap', async () => {
  const { mkdirSync, writeFileSync, symlinkSync, unlinkSync } = await import('node:fs');
  const { codexNativeStatePaths, reviewIsolationPolicy } = await import('../src/effects/review/review-isolation');
  const root = tmpWorkspace('codex-state-links'); roots.push(root);
  const home = join(root, 'home'), other = join(root, 'other'); mkdirSync(home); mkdirSync(other);
  symlinkSync(other, join(home, '.codex'));
  expect(() => codexNativeStatePaths(home)).toThrow('CODEX_HOME_UNSAFE'); unlinkSync(join(home, '.codex'));
  mkdirSync(join(home, '.codex')); symlinkSync(other, join(home, '.codex', 'tmp'));
  expect(() => codexNativeStatePaths(home)).toThrow('NATIVE_STATE_UNSAFE'); unlinkSync(join(home, '.codex', 'tmp'));
  mkdirSync(join(home, '.codex', 'tmp')); writeFileSync(join(other, 'authority.txt'), 'KEEP');
  for (const name of [...['state_5.sqlite','logs_2.sqlite','goals_1.sqlite','memories_1.sqlite','queue_1.sqlite'].flatMap(file => ['', '-wal', '-shm'].map(suffix => file + suffix)), 'installation_id']) {
    symlinkSync(join(other, 'authority.txt'), join(home, '.codex', name));
    expect(() => codexNativeStatePaths(home)).toThrow('NATIVE_STATE_UNSAFE'); unlinkSync(join(home, '.codex', name));
  }
  const output = join(root,'output'); mkdirSync(output);
  const paths = { subject:other,primary:other,ownerRecord:other,journal:other,gitCommonDir:other,output };
  expect(() => reviewIsolationPolicy({...paths,nativeStateFiles:[join(other,'authority.txt')]})).toThrow('NATIVE_STATE_OVERLAPS_AUTHORITY');
});
