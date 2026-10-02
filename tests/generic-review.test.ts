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
  const { reviewIsolationPolicy, reviewHostTemporaryDirectory } = await import('../src/effects/review/review-isolation');
  const root = tmpWorkspace('oar-isolation'); roots.push(root);
  const subject = join(root, 'subject'), primary = join(root, 'primary'), owner = join(root, 'owner-record'), journal = join(root, 'journal'), git = join(root, 'git-common'), output = join(root, 'output');
  for (const dir of [subject, primary, owner, journal, git, output]) mkdirSync(dir);
  const protectedPaths = [subject, primary, owner, journal, git].map(dir => join(dir, 'protected.txt'));
  for (const path of protectedPaths) writeFileSync(path, 'KEEP');
  symlinkSync(protectedPaths[0]!, join(output, 'escape-link'));
  const targets = [...protectedPaths, join(output, 'escape-link'), join(output, '../subject/protected.txt')];
  const policy = reviewIsolationPolicy({ subject, primary, ownerRecord: owner, journal, gitCommonDir: git, output });
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
const operations={stdioIgnore,devNull,temporary,nested};
fs.writeFileSync(spec.allowed,'ALLOWED');
if(spec.child){const r=cp.spawnSync(process.execPath,[__filename,JSON.stringify({...spec,child:false,allowed:spec.childAllowed})],{encoding:'utf8'});console.log(JSON.stringify({results,operations,child:{status:r.status,stdout:r.stdout,stderr:r.stderr}}))}
else console.log(JSON.stringify({results,operations}));
`);
  const node = realpathSync('/opt/homebrew/opt/node@24/bin/node');
  const spec = { targets, allowed: join(output, 'host.txt'), childAllowed: join(output, 'child.txt'), child: true };
  const temporary = reviewHostTemporaryDirectory(output);
  const result = spawnSync('/usr/bin/sandbox-exec', ['-f', profile, node, worker, JSON.stringify(spec)], { encoding: 'utf8', timeout: 15000, env: { ...process.env, TMPDIR: temporary } });
  console.log(JSON.stringify({ diagnostic: 'zero-model Seatbelt fixture', status: result.status, error: result.error?.message, stdout: result.stdout, stderr: result.stderr }));
  expect(result.status, result.stderr).toBe(0);
  const observed = JSON.parse(result.stdout);
  expect(observed.results).toHaveLength(7);
  expect(Number(observed.child.status), String(observed.child.stderr)).toBe(0);
  const child = JSON.parse(observed.child.stdout);
  for (const row of [...observed.results, ...child.results]) {
    expect(Boolean(row.denied), String(row.path)).toBe(true);
    expect(['EPERM', 'EACCES'], row.path).toContain(row.code);
  }
  for (const evidence of [observed, child]) {
    expect(evidence.operations.stdioIgnore.status).toBe(0);
    expect(evidence.operations.devNull.status).toBe(0);
    expect(evidence.operations.temporary.ok).toBe(true);
    expect(String(evidence.operations.temporary.dir).startsWith(temporary + '/')).toBe(true);
    // D2 HOLD: nested Seatbelt remains unusable; this is not a supported
    // native Codex exec proof or an instruction to weaken the outer policy.
    expect(evidence.operations.nested.status).toBe(71);
    expect(String(evidence.operations.nested.stderr)).toContain('sandbox_apply: Operation not permitted');
  }
  for (const path of protectedPaths) expect(readFileSync(path, 'utf8')).toBe('KEEP');
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
});

test('OAR scripted host: one Session, three prompts, typed view printing and dispose; reviewer file delivery preserves observation', async () => {
  const { openScriptedReviewHost, reviewRuntime, assertOarHostNode } = await import('../src/effects/review/oar-review-host');
  const root = tmpWorkspace('oar-scripted-host'); roots.push(root);
  const views: unknown[] = [], inputs: string[] = [];
  const prior = process.env.OAR_CODEX_SANDBOX;
  let host: Awaited<ReturnType<typeof openScriptedReviewHost>> | undefined;
  try {
    process.env.OAR_CODEX_SANDBOX = 'danger-full-access';
    host = await openScriptedReviewHost({ cwd: root }, view => views.push(view), async ({ input, say }) => {
      expect(process.env.OAR_CODEX_SANDBOX).toBe('workspace-write'); inputs.push(input);
      say('RECOMMENDATION: fixture observation only — confidence: HIGH');
    });
    const id = host.sessionId;
    for (const input of ['one', 'two', 'three']) {
      const run = await host.prompt(input); expect(run.kind).toBe('ended');
      expect(host.sessionId).toBe(id);
    }
    expect(inputs).toEqual(['one', 'two', 'three']); expect(views.length).toBeGreaterThan(0);
    await expect(host.prompt('four')).rejects.toThrow('BUDGET_EXHAUSTED');
    expect(inputs).toHaveLength(3);
    await host.dispose(); await expect(host.prompt('after-dispose')).rejects.toThrow('HOST_DISPOSED');
    expect(reviewRuntime('claude').id).toBe('claude'); expect(() => reviewRuntime('grok')).toThrow('UNSUPPORTED');
    expect(reviewRuntime('codex').id).toBe('codex'); // no Session created
    expect(() => assertOarHostNode('22.22.0')).toThrow('NODE_24_REQUIRED');
  } finally {
    await host?.dispose();
    if (prior === undefined) delete process.env.OAR_CODEX_SANDBOX; else process.env.OAR_CODEX_SANDBOX = prior;
  }
});

test('OAR file delivery: reviewer writes three Results; recommendation text never becomes a Result', async () => {
  const { mkdirSync } = await import('node:fs');
  const { openScriptedReviewHost, runHostFileRequest } = await import('../src/effects/review/oar-review-host');
  const { readSessionArtifact, writeSessionArtifact } = await import('../src/effects/terminal/task-session');
  const { createHash } = await import('node:crypto');
  const root = tmpWorkspace('oar-file-results'); roots.push(root);
  const output = join(root, 'output'); mkdirSync(output);
  const spec = { mode: 'review' as const, kind: 'codex' as const, installation: { kind: 'available' as const, via: 'bundled' as const },
    options: { cwd: output }, requestDirectory: root, output, timeoutMs: 1000 };
  let calls = 0;
  const host = await openScriptedReviewHost(spec.options, () => {}, async ({ input, say }) => {
    calls++;
    const request = JSON.parse(input.split('\n')[0]!.slice('TASK REQUEST: '.length)); // fixture application input
    say('RECOMMENDATION: fixture file communication — confidence: HIGH');
    writeSessionArtifact(request.result_ref, { request_id: request.request_id, context_sha256: request.context_sha256,
      value: { fixture: true, verdict: 'FAIL', summary: '[fixture opinion] revise' } });
  });
  const id = host.sessionId;
  try {
    for (let round = 1; round <= 3; round++) {
      const content = `Domain-shaped fixture review ${round}`;
      const request = { protocol: 2 as const, task: 'fixture', role: 'deep-reasoner', round, request_id: `fixture-${round}`,
        context_ref: join(output, `context-${round}.txt`), source_ref: 'fixture', result_ref: join(output, `result-${round}.json`),
        context_sha256: `sha256:${createHash('sha256').update(content).digest('hex')}`,
        result_contract: { required_fields: ['request_id', 'context_sha256', 'value'], atomic_write: 'temp_rename' as const,
          submission: { command: 'fixture', repo: root, task: 'fixture', role: 'deep-reasoner', round } } };
      const { writeFileSync } = await import('node:fs'); writeFileSync(request.context_ref, content);
      const observed = await runHostFileRequest(host, spec, request);
      expect(observed.kind).toBe('ended'); expect(observed.actual_model).toBe('fixture-oar');
      expect(host.sessionId).toBe(id);
      expect(readSessionArtifact<any>(request.result_ref).value.summary).toBe('[fixture opinion] revise');
    }
    expect(calls).toBe(3);
    await expect(host.prompt('fourth')).rejects.toThrow('BUDGET_EXHAUSTED');
    expect(host.model('claude')).toBeNull(); // never certify requested/init alias
  } finally { await host.dispose(); }
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
