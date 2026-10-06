import { afterEach, expect, test } from 'bun:test';
import { existsSync, lstatSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { join } from 'path';
import { REVIEW_MAX_ROUNDS, validateReviewOutput } from '../src/core/review/generic-review';
import { composeReviewPacket, type ReviewPacketInput } from '../src/core/review/review-packet';
import { reviewLocation, reviewSessionOptions, runReviewRound, type ReviewEffects } from '../src/effects/review/generic-review';
import { acceptanceReceiptPath } from '../scripts/acceptance-receipt';
import { seedAcceptanceFixture } from './helpers/verification-plan-fixture';
import { canonicalize } from '../src/core/evidence/canonical-json';
import type { JsonValue } from '../src/core/evidence/types';
import { prepareChangeAssessment } from '../src/effects/review/change-assessment';
import { executeVerificationContract } from '../src/effects/evidence/verification-execution';
import { ensureSessionDirectory, nextSessionRound, writeSessionArtifact } from '../src/effects/terminal/task-session';
import { tmpWorkspace, tmpWorkspaceIn, run } from './helpers/repo-fixture';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function resolveNode24(): string {
  const executable = Bun.which('node', { PATH: process.env.PATH ?? '' });
  if (!executable) throw new Error('OAR fixture requires Node 24 on PATH');
  const node = realpathSync(executable);
  const runtime = JSON.parse(execFileSync(node, ['-p', 'JSON.stringify({ node: process.versions.node, bun: process.versions.bun, executable: process.execPath })'], {
    encoding: 'utf8', timeout: 10_000,
  })) as { node?: string; bun?: string; executable: string };
  if (!/^24\./.test(runtime.node ?? '') || runtime.bun !== undefined || realpathSync(runtime.executable) !== node) {
    throw new Error('OAR fixture requires the resolved PATH executable to be Node 24');
  }
  return node;
}

test('generic review refuses empty and missing plans before any provider starts on every platform', async () => {
  for (const reason of ['empty_plan', 'missing_plan']) {
    const { root, home, contract, verification } = seedAcceptanceFixture('gp');
    roots.push(root, home);
    const reviewerRepo = join(home, 'reviewer');
    execFileSync('git', ['-C', root, 'worktree', 'add', '-qb', 'incomplete-plan-reviewer', reviewerRepo]);
    const file = join(root, contract), source = readFileSync(file, 'utf8');
    const beforePlan = source.slice(0, source.indexOf('## Verification Plan'));
    const fence = String.fromCharCode(96).repeat(3);
    writeFileSync(file, reason === 'empty_plan' ? beforePlan + `## Verification Plan\n\n${fence}json\n{"protocol":1,"checks":[]}\n${fence}\n` : beforePlan);
    const calls: string[] = [];
    const effects: ReviewEffects = {
      owner: () => { calls.push('owner'); throw new Error('provider lookup must not run'); },
      installation: async () => { calls.push('installation'); throw new Error('provider probe must not run'); },
      start: async () => { calls.push('start'); throw new Error('provider start must not run'); },
    };
    await expect(runReviewRound({ repoRoot: root, contract, verification, reviewerRepo, authorityHome: home,
      endpoint: { session: 'private-gp', home }, parentPane: 'fixture-owner-pane',
      admitSession: () => { calls.push('admit'); } }, effects)).rejects.toThrow(reason);
    expect(calls).toEqual([]);
    expect(existsSync(acceptanceReceiptPath(root, home))).toBe(false);
  }
}, 60_000);
const identity = { request_id: 'r', context_sha256: 'domain-context', subject_sha256: 'subject', actual_harness: 'claude' as const, actual_role: 'deep-reasoner', actual_model: 'fixture-model' };
const finding = { id: 'f', severity: 'P1' as const, status: 'new' as const, message: '[fixture opinion] fix the fence' };
const fail = { ...identity, verdict: 'FAIL', summary: '[fixture opinion] revise', findings: [finding] };
const packetInput: ReviewPacketInput = Object.freeze({ context_sha256: 'domain-context', subject_sha256: 'subject',
  actual_harness: 'claude', actual_role: 'deep-reasoner', prior_findings: Object.freeze([Object.freeze(finding)]),
  contract: 'contract\n', goal: 'goal\n', verification: 'verification\n', source: 'source\n' });
test('review packet preserves the exact transport text, domain identity and prior findings', () => {
  // Frozen pre-extraction bytes. Do not derive this expectation from the builder or shared rule.
  const expected = [
    'Review the complete current subject against its goal, contract and prepared verification evidence. Do not edit production code or invoke other reviewers. Only author one final JSON file to the exact request.result_ref; no temp/rename or alternate submission. Terminal output and idle are observation only.',
    'Outer transport JSON is {request_id: request.request_id, context_sha256: request.context_sha256, value: domain output}. Provider value has EXACTLY request_id, context_sha256, subject_sha256, verdict, summary, findings. Domain request_id is request.request_id; domain context_sha256 is the prepared domain hash below (distinct from transport packet hash). The owner adds actual harness/role/model from the bound task-agent and OAR Session observation, not your self-description.',
    'PASS requires no unresolved P0/P1. FAIL requires at least one unresolved finding. Each finding has EXACTLY id, severity:P0|P1|P2|P3, status:new|open|resolved, message. Keep stable IDs: every prior finding must remain resolved/open with current evidence. A previous verdict is not evidence for current code.',
    'DOMAIN IDENTITY: {"context_sha256":"domain-context","subject_sha256":"subject","actual_harness":"claude","actual_role":"deep-reasoner"}',
    'PRIOR FINDINGS: [{"id":"f","severity":"P1","status":"new","message":"[fixture opinion] fix the fence"}]',
    'CONTRACT:\ncontract\n', 'GOAL:\ngoal\n', 'PREPARED VERIFICATION:\nverification\n', 'CURRENT SOURCE:\nsource\n',
  ].join('\n\n');
  expect(Buffer.from(composeReviewPacket(packetInput))).toEqual(Buffer.from(expected));
  expect(composeReviewPacket(packetInput)).toBe(composeReviewPacket(packetInput));
  const codex = composeReviewPacket({ ...packetInput, actual_harness: 'codex', prior_findings: [] });
  expect(codex).toContain('"actual_harness":"codex","actual_role":"deep-reasoner"');
  expect(codex).toContain('PRIOR FINDINGS: []');
});

test('review packet enforces the existing 10 MiB limit in UTF-8 bytes without truncation', () => {
  const input = { ...packetInput, source: '' };
  const remaining = 10 * 1024 * 1024 - Buffer.byteLength(composeReviewPacket(input));
  const source = 'é'.repeat(Math.floor(remaining / 2)) + 'x'.repeat(remaining % 2);
  const packet = composeReviewPacket({ ...input, source });
  expect(Buffer.byteLength(packet)).toBe(10 * 1024 * 1024);
  expect(packet.endsWith(source)).toBe(true);
  expect(() => composeReviewPacket({ ...input, source: source + 'x' })).toThrow('review_context_too_large');
});

function packetRoundFixture() {
  const fixture = seedAcceptanceFixture('review-packet');
  roots.push(fixture.root, fixture.home);
  // Match the acceptance fixture's short, private endpoint HOME. TMPDIR can be
  // long on macOS; Herdr also needs room for the longer client socket name.
  const endpointHome = tmpWorkspaceIn('/tmp', 'rp');
  roots.push(endpointHome);
  const endpoint = { session: 'packet-fixture', home: endpointHome };
  for (const socket of ['herdr.sock', 'herdr-client.sock']) {
    const path = join(endpoint.home, '.config/herdr/sessions', endpoint.session, socket);
    expect(Buffer.byteLength(path, 'utf8')).toBeLessThanOrEqual(103);
  }
  const reviewerRepo = join(fixture.home, 'reviewer');
  execFileSync('git', ['-C', fixture.root, 'worktree', 'add', '-qb', 'packet-reviewer', reviewerRepo]);
  const location = reviewLocation(fixture.root, fixture.contract);
  const packetPath = (round = 1) => join(reviewerRepo, '.ai/harness/runs/generic-review-input', location.key, `packet-${round}.txt`);
  const calls: string[] = [];
  const effects: ReviewEffects = {
    installation: async (_kind, executable) => { calls.push('installation'); return { kind: 'available', via: 'executable', command: executable ?? '/usr/bin/true' }; },
    start: async () => {
      calls.push('start');
      expect(readFileSync(packetPath(), 'utf8')).toContain('CURRENT SOURCE:');
      expect(lstatSync(packetPath()).mode & 0o777).toBe(0o600);
      throw new Error('fixture_start_failure');
    },
    send: async () => { calls.push('send'); throw new Error('must not send'); },
  };
  const refresh = () => {
    const report = executeVerificationContract({ repoRoot: fixture.root, contractPath: fixture.contract, reportFile: fixture.verification });
    expect(report.passed).toBe(true);
    const prepared = prepareChangeAssessment({ repoRoot: fixture.root, contractPath: fixture.contract });
    const basis = { schema: 'repo-harness-change-assessment-evidence.v1', status: 'pass', assessment: prepared.assessment, selection_packet: prepared.packet };
    writeFileSync(join(fixture.root, '.ai/harness/checks/change-assessment.latest.json'), JSON.stringify({ ...basis,
      evidence_sha256: 'sha256:' + createHash('sha256').update(canonicalize(basis as unknown as JsonValue)).digest('hex'),
    }, null, 2) + '\n');
  };
  const options = { repoRoot: fixture.root, contract: fixture.contract, verification: fixture.verification, reviewerRepo,
    authorityHome: fixture.home, endpoint, parentPane: 'fixture-owner-pane',
    harness: 'claude' as const, admitSession: () => { calls.push('admit'); } };
  return { ...fixture, ...location, options, effects, calls, packetPath, refresh };
}

test('packet composition failure starts no pane and saves no packet or request', async () => {
  const f = packetRoundFixture();
  writeSessionArtifact(join(f.dir, 'request-1.json'), { subject_sha256: 'previous-subject' });
  writeSessionArtifact(join(f.dir, 'accepted-1.json'), { output: { findings: [{ ...finding, message: 'x'.repeat(10 * 1024 * 1024) }] } });
  await expect(runReviewRound(f.options, f.effects)).rejects.toThrow('review_context_too_large');
  expect(f.calls).toEqual(['installation', 'admit']);
  expect(existsSync(f.packetPath(2))).toBe(false);
  expect(existsSync(join(f.dir, 'request-2.json'))).toBe(false);
  expect(existsSync(acceptanceReceiptPath(f.root, f.home))).toBe(false);
}, 60_000);

test('packet survives launch failure; same input retries and changed subject fails before launch', async () => {
  const f = packetRoundFixture();
  // Linux keeps the real isolation refusal. Darwin reaches the injected start
  // failure. Neither case starts a real pane or a provider process.
  const launchError = process.platform === 'darwin' ? 'fixture_start_failure' : 'OAR_REVIEW_ISOLATION_UNSUPPORTED_PLATFORM';
  await expect(runReviewRound(f.options, f.effects)).rejects.toThrow(launchError);
  const packet = readFileSync(f.packetPath(), 'utf8');
  const modifiedAt = lstatSync(f.packetPath()).mtimeMs;
  expect(packet).toContain('CURRENT SOURCE:');
  expect(packet).toContain('+candidate');
  expect(lstatSync(f.packetPath()).mode & 0o777).toBe(0o600);
  await expect(runReviewRound(f.options, f.effects)).rejects.toThrow(launchError);
  expect(readFileSync(f.packetPath(), 'utf8')).toBe(packet);
  expect(lstatSync(f.packetPath()).mtimeMs).toBe(modifiedAt);
  expect(f.calls.filter(call => call === 'start')).toHaveLength(process.platform === 'darwin' ? 2 : 0);
  const beforeChangedRetry = [...f.calls];
  writeFileSync(join(f.root, 'feature.txt'), 'candidate\n\n');
  f.refresh();
  await expect(runReviewRound(f.options, f.effects)).rejects.toThrow('review_packet_changed_before_send; packet for round 1 is preserved. Inspect with repo-harness review status');
  expect(f.calls).toEqual(beforeChangedRetry);
  expect(readFileSync(f.packetPath(), 'utf8')).toBe(packet);
  expect(existsSync(join(f.dir, 'request-1.json'))).toBe(false);
  expect(existsSync(f.packetPath(2))).toBe(false);
  expect(f.calls).not.toContain('send');
  expect(existsSync(acceptanceReceiptPath(f.root, f.home))).toBe(false);
}, 60_000);

test('packet fixtures keep valid socket paths with a long UTF-8 temporary root', () => {
  const temp = tmpWorkspaceIn('/tmp', 'packet-' + 'é'.repeat(52)); roots.push(temp);
  expect(temp.length).toBeLessThan(103);
  expect(Buffer.byteLength(temp, 'utf8')).toBeGreaterThan(107);
  // Set startup variables only in the child. Keep the real isolation preload
  // and run the original assertions, including the Darwin launch failure.
  const result = spawnSync(process.execPath, ['--no-env-file', 'test', import.meta.path,
    '--test-name-pattern', '^packet (composition failure|survives launch failure)',
    '--timeout', '60000', '--max-concurrency', '1'], {
    cwd: join(import.meta.dir, '..'),
    env: { ...process.env, TMPDIR: temp, TEMP: temp, TMP: temp, NO_COLOR: '1' },
    encoding: 'utf8', timeout: 50_000,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  expect(result.error, output).toBeUndefined();
  expect(result.signal, output).toBeNull();
  expect(result.status, output).toBe(0);
  expect(output).toContain('(pass) packet composition failure starts no pane and saves no packet or request');
  expect(output).toContain('(pass) packet survives launch failure; same input retries and changed subject fails before launch');
}, 60_000);

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
  const { reviewIsolationPolicy, reviewHostTemporaryDirectory, prepareCodexHome } = await import('../src/effects/review/review-isolation');
  const root = tmpWorkspace('oar-isolation'); roots.push(root);
  const subject = join(root, 'subject'), primary = join(root, 'primary'), owner = join(root, 'owner-record'), journal = join(root, 'journal'), git = join(root, 'git-common'), output = join(root, 'output');
  for (const dir of [subject, primary, owner, journal, git, output]) mkdirSync(dir);
  const protectedPaths = [subject, primary, owner, journal, git].map(dir => join(dir, 'protected.txt'));
  for (const path of protectedPaths) writeFileSync(path, 'KEEP');
  symlinkSync(protectedPaths[0]!, join(output, 'escape-link'));
  const forbidden = ['CLAUDE.md','AGENTS.md','settings.local.json','auth.json','.credentials.json','config.toml','agents/definition.md','skills/definition.md','rules/definition.md','plugins/definition.json','hooks/handler.sh'].map(path => join(output, path));
  for (const path of forbidden) { const { dirname } = await import('node:path'); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, 'KEEP'); }
  const nativeHome = join(root, 'native-home'); mkdirSync(join(nativeHome, '.codex', 'tmp'), { recursive: true }); mkdirSync(join(nativeHome, '.codex', 'thread-writer-locks'));
  const isolated = join(output, '.codex-home'); mkdirSync(isolated, { mode: 0o700 });
  const allowedNative = [join(isolated,'state_5.sqlite'),join(isolated,'cache.txt')];
  const deniedNative = ['state_5.sqlite','state_5.sqlite-wal','state_5.sqlite-shm','logs_2.sqlite','logs_2.sqlite-wal','logs_2.sqlite-shm','goals_1.sqlite','memories_1.sqlite','queue_1.sqlite','installation_id','tmp/state','thread-writer-locks/lock','config.toml','auth.json','AGENTS.md','rules/rule.md','skills/skill.md','other-state.json'].map(path => join(nativeHome, '.codex', path));
  const isolatedDenied = [join(isolated,'auth.json'),join(isolated,'config.toml')];
  for (const path of [...allowedNative, ...deniedNative, ...isolatedDenied]) { const { dirname } = await import('node:path'); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, 'KEEP'); }
  const targets = [...protectedPaths, join(output, 'escape-link'), join(output, '../subject/protected.txt'), ...forbidden, ...deniedNative, ...isolatedDenied];
  const policy = reviewIsolationPolicy({ subject, primary, ownerRecord: owner, journal, gitCommonDir: git, output });
  expect(policy).not.toContain(nativeHome);
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
  const node = resolveNode24();
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
  for (const path of [...protectedPaths, ...forbidden, ...deniedNative, ...isolatedDenied]) expect(readFileSync(path, 'utf8')).toBe('KEEP');
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
import {existsSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openScriptedReviewHost,runHostFileRequest,serveHostFileRequests,reviewRuntime,assertOarHostNode} from ${JSON.stringify(entry)};
const output=${JSON.stringify(output)},isolation=${JSON.stringify({paths,policyFile})};
${body}`);
  const node = resolveNode24();
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
const spec={mode:'review',kind:'codex',installation:{kind:'available',via:'bundled'},options:{cwd:output},requestDirectory:output,output,controlDirectory:output,timeoutMs:1000,isolation};let calls=0;
const host=await openScriptedReviewHost(spec.options,()=>{},async({input,say})=>{calls++;const request=JSON.parse(input.split('\n')[0].slice('TASK REQUEST: '.length));say('RECOMMENDATION: fixture file communication — confidence: HIGH');writeFileSync(request.result_ref,JSON.stringify({request_id:request.request_id,context_sha256:request.context_sha256,value:{fixture:true,verdict:'FAIL',summary:'[fixture opinion] revise'}}))},isolation);
try{const id=host.sessionId;for(let round=1;round<=3;round++){const content='Domain-shaped fixture '+round;const request={protocol:2,task:'fixture',role:'deep-reasoner',round,request_id:'fixture-'+round,context_ref:join(output,'context-'+round+'.txt'),source_ref:'fixture',result_ref:join(output,'result-'+round+'.json'),context_sha256:'sha256:'+createHash('sha256').update(content).digest('hex'),result_contract:{required_fields:['request_id','context_sha256','value'],atomic_write:'temp_rename',submission:{command:'fixture',repo:output,task:'fixture',role:'deep-reasoner',round}}};writeFileSync(request.context_ref,content);const observed=await runHostFileRequest(host,spec,request);assert.equal(observed.kind,'ended');assert.equal(observed.actual_model,'fixture-oar');assert.equal(host.sessionId,id);assert.equal(JSON.parse(readFileSync(request.result_ref,'utf8')).value.summary,'[fixture opinion] revise')}
assert.equal(calls,3);await assert.rejects(host.prompt('fourth'),/BUDGET_EXHAUSTED/);assert.equal(host.model('claude'),null);console.log(JSON.stringify({calls,passed:true,model:host.model('claude')}));}finally{await host.dispose()}`);
  expect(result.calls).toBe(3); expect(result.model).toBeNull();
});

test.skipIf(process.platform !== 'darwin')('OAR host: a close request during a pending turn aborts that turn and disposes the Session', async () => {
  const result = await runOarNodeFixture('oar-cancel-pending', String.raw`
const spec={mode:'review',kind:'codex',installation:{kind:'available',via:'bundled'},options:{cwd:output},requestDirectory:output,output,controlDirectory:output,timeoutMs:10000,isolation};let calls=0;
// The turn never ends by itself; only Session disposal can settle it.
const host=await openScriptedReviewHost(spec.options,()=>{},async({signal})=>{calls++;writeFileSync(join(output,'turn-started'),'1');await new Promise(resolve=>signal.addEventListener('abort',resolve))},isolation);
let closing;const close=()=>closing??=host.dispose();
try{const content='pending turn';writeFileSync(join(output,'context-1.txt'),content);
const request={protocol:2,task:'fixture',role:'deep-reasoner',round:1,request_id:'fixture-1',context_ref:join(output,'context-1.txt'),source_ref:'fixture',result_ref:join(output,'result-1.json'),context_sha256:'sha256:'+createHash('sha256').update(content).digest('hex'),result_contract:{required_fields:['request_id','context_sha256','value'],atomic_write:'temp_rename',submission:{command:'fixture',repo:output,task:'fixture',role:'deep-reasoner',round:1}}};
writeFileSync(join(output,'request-1.json'),JSON.stringify(request));
const served=serveHostFileRequests(host,spec,close,()=>closing!==undefined);
while(!existsSync(join(output,'turn-started')))await new Promise(resolve=>setTimeout(resolve,10));
writeFileSync(join(output,'close.request'),JSON.stringify({close:true}));
await served;await close();
assert.equal(JSON.parse(readFileSync(join(output,'observed-1.json'),'utf8')).outcome,'aborted');assert.equal(existsSync(request.result_ref),false);
await assert.rejects(host.prompt('after-cancel'),/HOST_DISPOSED/);
console.log(JSON.stringify({calls,passed:true,model:null}));}finally{await close()}`);
  expect(result.calls).toBe(1); expect(result.passed).toBe(true);
});

test.skipIf(process.platform !== 'darwin')('OAR Session refuses unconfined or changed owner profiles before opening', async () => {
  const result = await runOarNodeFixture('oar-unconfined', `
let calls=0;await assert.rejects(openScriptedReviewHost({cwd:output},()=>{},async()=>{calls++},isolation),/SEATBELT_REQUIRED/);assert.equal(calls,0);writeFileSync(isolation.policyFile,'(version 1)(allow default)');await assert.rejects(openScriptedReviewHost({cwd:output},()=>{},async()=>{calls++},isolation),/PROFILE_NOT_ADMITTED/);assert.equal(calls,0);console.log(JSON.stringify({calls,passed:true}))`, false);
  expect(result.calls).toBe(0); expect(result.passed).toBe(true);
});

test.skipIf(process.platform !== 'darwin')('OAR installation is probed by the fixed Node host, never the Bun controller', async () => {
  const { mkdirSync, writeFileSync, realpathSync, chmodSync } = await import('node:fs');
  const { probeReviewInstallation } = await import('../src/effects/review/generic-review');
  const root = tmpWorkspace('oar-node-installation'); roots.push(root);
  const trace = join(root, 'parent.txt'), executable = join(root, 'fake-codex');
  writeFileSync(executable, `#!/bin/sh\n/bin/ps -p "$PPID" -o command= >> '${trace}'\nprintf '0.0.0\\n'\n`); chmodSync(executable, 0o700);
  const priorNode = process.env.REPO_HARNESS_NODE_BIN, priorBin = process.env.OAR_CODEX_BIN;
  try {
    process.env.REPO_HARNESS_NODE_BIN = resolveNode24();
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

test('Codex isolated home: exp-only preflight, exclusive no-follow copy, modes and cleanup', async () => {
  const { mkdirSync, writeFileSync, symlinkSync, unlinkSync, lstatSync, existsSync } = await import('node:fs');
  const { prepareCodexHome, removeCopiedAuth } = await import('../src/effects/review/review-isolation');
  const root = tmpWorkspace('codex-isolated-auth'); roots.push(root);
  const source = join(root,'source'), output = join(root,'output'); mkdirSync(join(source,'.codex'),{recursive:true});mkdirSync(output);
  const payload = (exp:number) => Buffer.from(JSON.stringify({exp})).toString('base64url');
  const fixture = (exp:number) => JSON.stringify({tokens:{access_token:`fixture.${payload(exp)}.fixture`}});
  const file = join(source,'.codex','auth.json');
  writeFileSync(file,fixture(Math.floor(Date.now()/1000)+30),{mode:0o600});
  expect(() => prepareCodexHome(output,source,60000)).toThrow('expires_within_run');
  expect(existsSync(join(output,'.codex-home','auth.json'))).toBe(false);
  writeFileSync(file,fixture(Math.floor(Date.now()/1000)+86400));
  const prepared = prepareCodexHome(output,source,60000);
  expect(prepared.auth_copied).toBe(true);expect(prepared.mode).toBe('0600');
  expect(lstatSync(prepared.home).mode & 0o777).toBe(0o700);expect(lstatSync(join(prepared.home,'auth.json')).mode & 0o777).toBe(0o600);
  expect(existsSync(join(prepared.home,'config.toml'))).toBe(false);
  expect(() => prepareCodexHome(output,source,60000)).toThrow('copy_failed');
  expect(prepareCodexHome(output,source,60000,true).auth_copied).toBe(true);
  expect(removeCopiedAuth(output).status).toBe('removed');expect(removeCopiedAuth(output).status).toBe('absent');
  unlinkSync(file);symlinkSync(join(root,'missing'),file);
  expect(() => prepareCodexHome(output,source,60000)).toThrow('source_unavailable');unlinkSync(file);mkdirSync(file);
  expect(() => prepareCodexHome(output,source,60000)).toThrow('source_unsafe');
  mkdirSync(join(prepared.home,'auth.json'));
  expect(removeCopiedAuth(output).status).toBe('cleanup_pending');
});

test.skipIf(process.platform !== 'darwin')('OAR native child cannot forge owner control evidence or signal/connect to the trusted host', async () => {
  const { mkdirSync, writeFileSync, realpathSync, chmodSync, existsSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { pathToFileURL } = await import('node:url');
  const { reviewIsolationPolicy, prepareReviewLauncher } = await import('../src/effects/review/review-isolation');
  const root = tmpWorkspace('oar-native-owner-evidence'); roots.push(root);
  const owner = join(root, 'owner'), output = join(root, 'output'); mkdirSync(owner); mkdirSync(output);
  const paths = { subject: owner, primary: owner, ownerRecord: owner, journal: owner, gitCommonDir: owner, output };
  const policyFile = join(owner, 'profile.sb'); writeFileSync(policyFile, reviewIsolationPolicy(paths), { mode: 0o600 });
  const node = resolveNode24();
  const fixture = join(root, 'fixture-codex.cjs');
  writeFileSync(fixture, `#!${node}\n` + String.raw`
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),readline=require('node:readline');
if(process.argv.includes('--help'))process.exit(0);
if(process.argv.includes('--version')){console.log('fixture-codex 0.0.0');process.exit(0)}
const reply=(id,result)=>process.stdout.write(JSON.stringify({id,result})+'\n');
const notify=(method,params)=>process.stdout.write(JSON.stringify({method,params})+'\n');
readline.createInterface({input:process.stdin}).on('line',async line=>{
 const m=JSON.parse(line);if(m.id===undefined)return;
 if(m.method==='initialize'){reply(m.id,{});return}
 if(m.method==='thread/start'){reply(m.id,{thread:{id:'fixture-thread'},model:'fixture-host-model'});return}
 if(m.method==='turn/start'){
  const input=m.params.input.find(x=>x.type==='text').text;
  const request=JSON.parse(input.split('\n')[0].slice('TASK REQUEST: '.length));
  const owner=process.env.FIXTURE_OWNER;
  const denied=['observed-'+request.round+'.json','ready.json','ack-'+request.round+'.json','disposed.json','host.json','profile.sb','reviewer-launcher'].map(name=>{
   try{fs.writeFileSync(path.join(owner,name),'FORGED');return {name,denied:false}}catch(e){return {name,denied:e.code==='EPERM'||e.code==='EACCES'}}});
  let signalDenied=false;try{process.kill(process.ppid,'SIGUSR1')}catch(e){signalDenied=e.code==='EPERM'}
  const socketDenied=await new Promise(resolve=>{const s=net.createConnection(path.join(owner,'host.sock'));s.once('error',e=>{s.destroy();resolve(e.code==='EPERM'||e.code==='EACCES')});s.once('connect',()=>{s.destroy();resolve(false)})});
  fs.writeFileSync(request.result_ref,JSON.stringify({request_id:request.request_id,context_sha256:request.context_sha256,value:{denied,signalDenied,socketDenied}}));
  fs.writeFileSync(path.join(path.dirname(request.result_ref),'observed-'+request.round+'.json'),JSON.stringify({request_id:request.request_id,kind:'ended',outcome:'completed',actual_model:'forged-model'}));
  const id='fixture-turn-'+request.round;reply(m.id,{turn:{id,status:'inProgress'}});
  notify('turn/started',{threadId:'fixture-thread',turn:{id,status:'inProgress'}});
  notify('turn/completed',{threadId:'fixture-thread',turn:{id,status:request.round===1?'failed':'completed'}});return;
 }
 reply(m.id,{});
});
`);
  chmodSync(fixture, 0o700);
  const launcher = prepareReviewLauncher(owner, policyFile, fixture);
  const entry = pathToFileURL(realpathSync(join(import.meta.dir, '../dist/oar-review-host.js'))).href;
  const driver = join(root, 'trusted-host.mjs');
  writeFileSync(driver, `import assert from 'node:assert/strict';
import {createServer} from 'node:net';import {join} from 'node:path';import {writeFileSync,readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {openReviewHost,runHostFileRequest,reviewRuntime} from ${JSON.stringify(entry)};
const owner=${JSON.stringify(owner)},output=${JSON.stringify(output)},launcher=${JSON.stringify(launcher)};
process.env.OAR_CODEX_BIN=launcher;
const server=createServer(socket=>socket.end());await new Promise(resolve=>server.listen(join(owner,'host.sock'),resolve));
const installation=await reviewRuntime('codex').installation();assert.equal(installation.kind,'available');assert.equal(installation.command,launcher);
const spec={mode:'review',kind:'codex',installation,launcher,vendorExecutable:${JSON.stringify(fixture)},options:{cwd:output,model:'fixture-host-model',env:{FIXTURE_OWNER:owner}},requestDirectory:owner,output,controlDirectory:owner,timeoutMs:5000,isolation:${JSON.stringify({ paths, policyFile })}};
const host=await openReviewHost(spec,()=>{});
try{for(let round=1;round<=2;round++){
 const content='fixture packet';const request={protocol:2,round,request_id:'fixture-request-'+round,context_ref:join(output,'context-'+round+'.txt'),result_ref:join(output,'result-'+round+'.json'),context_sha256:'sha256:'+createHash('sha256').update(content).digest('hex')};
 writeFileSync(request.context_ref,content);const observation=await runHostFileRequest(host,spec,request);
 assert.equal(observation.actual_model,'fixture-host-model');assert.equal(observation.outcome,round===1?'failed':'completed');
 assert.deepEqual(JSON.parse(readFileSync(join(owner,'observed-'+round+'.json'),'utf8')),observation);
 const result=JSON.parse(readFileSync(request.result_ref,'utf8')).value;assert.equal(result.denied.length,7);assert.ok(result.denied.every(x=>x.denied));assert.equal(result.signalDenied,true);assert.equal(result.socketDenied,true);
 assert.equal(JSON.parse(readFileSync(join(output,'observed-'+round+'.json'),'utf8')).actual_model,'forged-model');
}console.log(JSON.stringify({rounds:2,passed:true}));}finally{await host.dispose();await new Promise(resolve=>server.close(resolve))}`);
  const result = spawnSync(node, ['--disable-sigusr1', driver], { encoding: 'utf8', timeout: 15000 });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ rounds: 2, passed: true });
  expect(existsSync(join(owner, 'disposed.json'))).toBe(false);
  expect(readFileSync(policyFile, 'utf8')).toBe(reviewIsolationPolicy(paths));
  expect(prepareReviewLauncher(owner, policyFile, fixture)).toBe(launcher);
});
