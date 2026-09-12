import { afterEach, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, realpathSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync, spawn, type ChildProcess } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { acquireExclusiveDirectoryLock } from '../src/effects/locking/exclusive-directory-lock';
import { buildReviewSubject } from '../src/effects/review/diff-fingerprint';
import { assessChange, buildReviewSelectionPacket } from '../src/core/review/change-assessment';
import { claudeReviewStatus, closeClaudeReview, reviewSessionLocation, runClaudeReviewRound, startReviewServer, herdr, type ReviewSession } from '../src/effects/review/claude-review-session';
import { herdrCommand, herdrEnvironment, herdrResult } from '../src/effects/terminal/herdr';
import { verifyAcceptance } from '../scripts/acceptance-receipt';
import { emptyVerificationEvaluation, withEmptyVerificationPlan } from './helpers/verification-plan-fixture';
import { reviewContextDigest, validateClaudeReviewResult, type ClaudeReviewRequest } from '../src/core/review/claude-review';

// Every case in this file drives the real pinned `herdr` binary (sentinel
// servers, `Bun.which('herdr')` session metadata) plus a spawned fake provider
// child, so the whole file belongs to the release lane (`scripts/check-ci.sh`
// with no lane argument). Same gate variable as
// tests/harness-benchmark-matrix.test.ts.
const releaseLaneOnly = test.skipIf(!process.env.REPO_HARNESS_TEST_EXPENSIVE);
if (!process.env.REPO_HARNESS_TEST_EXPENSIVE) {
  console.log('[gate] REPO_HARNESS_TEST_EXPENSIVE unset: skipping the real herdr review session cases (release lane only, not a failure).');
}
const fixtures: { root: string; home: string }[] = [];
const sentinels: {name:string; process:ChildProcess; root:string; configPath:string}[] = [];
async function sentinelServer() {
  const root=mkdtempSync(join(tmpdir(),'rh-herdr-sentinel-'));
  const name='sentinel-'+randomUUID();
  const configPath=join(root,'herdr.toml');
  writeFileSync(configPath,'onboarding = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[update]\nversion_check = false\nmanifest_check = false\n');
  const endpoint={session:name,configPath};
  const child=spawn('herdr',['--session',name,'server'],{env:herdrEnvironment(endpoint),stdio:'ignore'});
  sentinels.push({name,process:child,root,configPath});
  const call=(args:string[])=>herdrResult(herdrCommand(endpoint,args));
  for(let i=0;;i++) { try{call(['workspace','list']);break;}catch(e){if(i===50)throw e;await Bun.sleep(100);} }
  const pane=call(['workspace','create','--cwd',root,'--no-focus']).root_pane.pane_id;
  const identity=()=>call(['pane','process-info','--pane',pane]).process_info;
  return {call,pane,identity,endpoint};
}
const contract = 'tasks/contracts/review.contract.md';
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    try { await closeClaudeReview({ repoRoot: fixture.root, contract, authorityHome: fixture.home }, true); } catch { /* A session may never have started. */ }
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(fixture.home, { recursive: true, force: true });
  }
  for (const item of sentinels.splice(0)) { herdrCommand({session:item.name,configPath:item.configPath},['server','stop']); await new Promise<void>(resolve => item.process.exitCode !== null ? resolve() : item.process.once('exit',()=>resolve())); rmSync(item.root,{recursive:true,force:true}); }
});

function git(root: string, ...args: string[]) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function canonical(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function prepare(root: string) {
  const subject = buildReviewSubject(root, { targetRef: 'main' });
  const assessment = assessChange({ subject, workflowProfile: 'lite', strictCategories: [], patternNoveltyPaths: [], declaredOracles: [] });
  if (assessment.status !== 'ready') throw new Error('fixture assessment unavailable');
  const basis = { schema: 'repo-harness-change-assessment-evidence.v1', status: 'pass', assessment, selection_packet: buildReviewSelectionPacket(assessment) };
  writeFileSync(join(root, '.ai/harness/checks/latest.json'), JSON.stringify({
    source: 'verify-sprint', status: 'pass', exit_code: 0, active_plan: 'plans/plan-review.md', review_subject_sha256: subject.review_subject_sha256,
    benchmark_evidence: { status: 'not_applicable', report_sha256: 'not-applicable' },
    commands: [{ name: 'fixture-unit-check', status: 'pass', exit_code: 0 }],
    guards: ['contract', 'review', 'allowed_paths', 'change_assessment'].map(name => ({ name, status: 'pass' })),
    contract: { file: contract, execution_evaluation: emptyVerificationEvaluation(root, contract) }, review: { file: 'tasks/reviews/review.review.md' },
    change_assessment: { ...basis, evidence_sha256: 'sha256:' + createHash('sha256').update(canonical(basis)).digest('hex') },
  }));
}

function fixture(mode = 'normal') {
  const root = mkdtempSync(join(tmpdir(), 'rh-claude-session-'));
  const home = mkdtempSync(join(tmpdir(), 'rh-claude-authority-'));
  fixtures.push({ root, home });
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Review Test'); git(root, 'config', 'user.email', 'review@test.invalid');
  for (const dir of ['.ai/harness/checks', 'tasks/contracts', 'tasks/reviews', 'plans']) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, '.gitignore'), '.ai/harness/checks/\n.ai/harness/runs/\nprovider\n');
  writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({ worktree_strategy: { review_base: 'main' }, merge_gate: { enabled: true, rule: 'fixture' } }));
  writeFileSync(join(root, 'source.ts'), 'export const value = 0;\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'base'); git(root, 'checkout', '-b', 'codex/review');
  writeFileSync(join(root, 'source.ts'), 'export const value = 1;\n');
  writeFileSync(join(root, contract), withEmptyVerificationPlan('# Review contract\n\n> **Status**: Active\n> **Owner**: Codex\n> **Plan**: plans/plan-review.md\n> **Review File**: tasks/reviews/review.review.md\n\n## Acceptance Policy\n\n```json\n{"protocol":1,"reviewer":"Claude","user_waiver":"forbidden"}\n```\n\n## Change Assessment\n\n```json\n{"protocol":1,"oracles":[]}\n```\n'));
  writeFileSync(join(root, 'plans/plan-review.md'), '# Review test\n\n> **Status**: Executing\n');
  writeFileSync(join(root, 'tasks/reviews/review.review.md'), '# Review\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'candidate');
  const provider = join(root, 'provider');
  writeFileSync(provider, `#!${process.execPath}\nimport {createInterface} from 'readline';\nimport {writeFileSync} from 'fs';\nlet count=0;\nconst mode=${JSON.stringify(mode)};\nconst reader=createInterface({input:process.stdin});\nreader.on('line',async line=>{\n const message=JSON.parse(line); count++;\n const identity=JSON.parse(message.message.content.match(/Echo this exact identity: (.+)/)[1]);\n if(mode==='hang') return;\n if(mode==='crash') process.exit(2);\n if(mode==='slow') await Bun.sleep(800);\n if(mode==='stale') writeFileSync('source.ts','export const value = 999;\\n');\n const pass=count>1;\n const output={...identity,verdict:pass?'PASS':'FAIL',summary:pass?'Corrected fixture':'Fixture requires repair',findings:[{id:'F1',severity:'P1',status:pass?'resolved':'new',message:'Concrete fixture evidence'}]};\n if(mode==='wrong-session') output.session_id='wrong';
 if(mode==='omit-finding' && pass) output.findings=[];
 if(mode==='wrong-subject') output.subject_sha256='sha256:wrong';
 if(mode==='conflicting-pass') output.verdict='PASS';\n console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,session_id:message.session_id,structured_output:output}));\n});\nreader.on('close',()=>process.exit(0));\n`);
  chmodSync(provider, 0o700);
  prepare(root);
  let admissions = 0;
  return { root, home, options: { repoRoot: root, contract, authorityHome: home, providerCommand: provider,
    timeoutMs: 5000, admitSession: () => { admissions++; } }, admissions: () => admissions };
}

releaseLaneOnly('same child/session performs two rounds, records real receipt, rejects stale/duplicate subjects and closes precisely', async () => {
  const f = fixture();
  const sentinel = await sentinelServer();
  const before = sentinel.identity();
  const first = await runClaudeReviewRound(f.options);
  expect(first.status).toBe('rejected');
  await expect(closeClaudeReview(f.options)).rejects.toThrow();
  await expect(runClaudeReviewRound(f.options)).rejects.toThrow('duplicate_subject');
  writeFileSync(join(f.root, 'source.ts'), 'export const value = 2;\n'); prepare(f.root);
  const second = await runClaudeReviewRound(f.options);
  expect(second.status).toBe('accepted');
  expect(second.child_pid).toBe(first.child_pid); expect(second.session_id).toBe(first.session_id);
  expect(f.admissions()).toBe(1);
  expect((await verifyAcceptance({ root: f.root, authorityHome: f.home, contract })).subject_sha256).toBe(second.receipt.subject_sha256);
  writeFileSync(join(f.root, 'source.ts'), 'export const value = 3;\n');
  await expect(closeClaudeReview(f.options)).rejects.toThrow('stale');
  writeFileSync(join(f.root, 'source.ts'), 'export const value = 2;\n');
  await closeClaudeReview(f.options);
  for (let i = 0; i < 30; i++) { try { process.kill(second.child_pid, 0); await Bun.sleep(100); } catch { break; } }
  expect(() => process.kill(second.child_pid, 0)).toThrow();
  expect(claudeReviewStatus(f.root, contract).status).toBe('closed');
  expect(sentinel.identity()).toEqual(before);
}, 30_000);

releaseLaneOnly('stale source while reviewer runs cannot write an acceptance receipt or trigger replay', async () => {
  const f = fixture('stale');
  await expect(runClaudeReviewRound(f.options)).rejects.toThrow('stale');
  prepare(f.root);
  await expect(runClaudeReviewRound(f.options)).rejects.toThrow('ambiguous_round');
  expect(f.admissions()).toBe(1);
  const dir = reviewSessionLocation(f.root, contract).dir;
  expect(existsSync(join(dir, 'accepted-1.json'))).toBe(false);
}, 20_000);

releaseLaneOnly('explicit cancel cleans the exact detached provider after its host dies', async () => {
  const f = fixture();
  const first = await runClaudeReviewRound(f.options);
  const status = claudeReviewStatus(f.root, contract) as { processes: { host: string } };
  const hostPid = Number(status.processes.host.trim().split(/\s+/)[0]);
  process.kill(hostPid, 'SIGKILL');
  await Bun.sleep(200);
  await closeClaudeReview(f.options, true);
  expect(() => process.kill(first.child_pid, 0)).toThrow();
  expect(claudeReviewStatus(f.root, contract).status).toBe('closed');
}, 20_000);

releaseLaneOnly.each(['wrong-session', 'wrong-subject', 'conflicting-pass', 'crash', 'hang'])('%s fails closed; explicit cancel remains available', async mode => {
  const f = fixture(mode);
  f.options.timeoutMs = 400;
  await expect(runClaudeReviewRound(f.options)).rejects.toThrow();
  expect(claudeReviewStatus(f.root, contract).status).toBe('interrupted');
  const dir = reviewSessionLocation(f.root, contract).dir;
  expect(existsSync(join(dir, 'accepted-1.json'))).toBe(false);
  await closeClaudeReview(f.options, true);
  expect(claudeReviewStatus(f.root, contract).status).toBe('closed');
}, 20_000);

releaseLaneOnly('concurrent submission is refused without sending a second provider turn', async () => {
  const f = fixture('slow');
  const running = runClaudeReviewRound(f.options);
  await Bun.sleep(50);
  await expect(runClaudeReviewRound(f.options)).rejects.toThrow('exclusive lock');
  await running;
  const dir = reviewSessionLocation(f.root, contract).dir;
  expect(existsSync(join(dir, 'request-2.json'))).toBe(false);
  expect(JSON.parse(readFileSync(join(dir, 'result-1.json'), 'utf8')).structured_output.verdict).toBe('FAIL');
}, 20_000);


releaseLaneOnly('a continuation must account for prior findings and cannot be replayed after omission', async () => {
  const f = fixture('omit-finding');
  await runClaudeReviewRound(f.options);
  writeFileSync(join(f.root, 'source.ts'), 'export const value = 2;\n'); prepare(f.root);
  await expect(runClaudeReviewRound(f.options)).rejects.toThrow('previous_finding_unaddressed');
  await expect(runClaudeReviewRound(f.options)).rejects.toThrow('ambiguous_round');
  expect(existsSync(join(reviewSessionLocation(f.root, contract).dir, 'accepted-2.json'))).toBe(false);
}, 20_000);

releaseLaneOnly('three rounds share one admission and a fourth changed subject is refused', async () => {
  const f = fixture();
  const first = await runClaudeReviewRound(f.options);
  for (let round = 2; round <= 3; round++) {
    writeFileSync(join(f.root, 'source.ts'), `export const value = ${round};\n`); prepare(f.root);
    const result = await runClaudeReviewRound(f.options);
    expect(result.child_pid).toBe(first.child_pid);
    expect(result.round).toBe(round);
  }
  writeFileSync(join(f.root, 'source.ts'), 'export const value = 4;\n'); prepare(f.root);
  await expect(runClaudeReviewRound(f.options)).rejects.toThrow('round_budget_exhausted');
  expect(f.admissions()).toBe(1);
  expect(existsSync(join(reviewSessionLocation(f.root, contract).dir, 'request-4.json'))).toBe(false);
}, 20_000);


releaseLaneOnly('schema enums reject array coercion instead of accepting malformed provider data', () => {
  const context = { contract_file: contract, contract_sha256: 'contract', goal_sha256: 'goal', subject_sha256: 'subject', verification_evidence_sha256: 'evidence', target_revision: 'target' };
  const request: ClaudeReviewRequest = { round: 1, round_id: 'round', session_id: 'session', context, context_sha256: reviewContextDigest(context), prompt: '', timeout_ms: 1 };
  const output = { round_id: request.round_id, session_id: request.session_id, subject_sha256: context.subject_sha256, context_sha256: request.context_sha256, verdict: 'FAIL', summary: 'Review', findings: [{ id: 'F1', severity: 'P1', status: 'new', message: 'Evidence' }] };
  const event = { type: 'result', subtype: 'success', is_error: false, session_id: request.session_id, structured_output: output };
  expect(validateClaudeReviewResult(event, request).verdict).toBe('FAIL');
  for (const mutate of [
    (value: any) => { value.structured_output.verdict = ['FAIL']; },
    (value: any) => { value.structured_output.findings[0].severity = ['P1']; },
    (value: any) => { value.structured_output.findings[0].status = ['new']; },
  ]) {
    const malformed = structuredClone(event); mutate(malformed);
    expect(() => validateClaudeReviewResult(malformed, request)).toThrow('malformed');
  }
});

releaseLaneOnly('startup spawn failure can be cancelled without process metadata or acceptance', async () => {
  const f = fixture();
  chmodSync(f.options.providerCommand, 0o600);
  await expect(runClaudeReviewRound(f.options)).rejects.toThrow();
  const dir = reviewSessionLocation(f.root, contract).dir;
  expect(existsSync(join(dir, 'processes.json'))).toBe(false);
  expect(existsSync(join(dir, 'failure.json'))).toBe(true);
  await expect(closeClaudeReview(f.options)).rejects.toThrow();
  const result = await closeClaudeReview(f.options, true) as { cancelled: boolean };
  expect(result.cancelled).toBe(true);
  expect(claudeReviewStatus(f.root, contract).status).toBe('closed');
  expect(existsSync(join(dir, 'accepted-1.json'))).toBe(false);
  await expect(runClaudeReviewRound(f.options)).rejects.toThrow();
}, 20_000);

function unstartedSession() {
  const f = fixture();
  const location = reviewSessionLocation(f.root, contract);
  const id = randomUUID();
  const session: ReviewSession = { protocol: 2, startup_protocol: 1, repo_root: location.root, contract_file: contract,
    contract_sha256: 'contract', goal_sha256: 'goal', session_id: id, herdr_session: `review-${id}`,
    herdr_bin: Bun.which('herdr')!, herdr_config: join(location.dir, 'herdr.toml'), provider_bin: realpathSync(f.options.providerCommand) };
  writeFileSync(join(location.dir, 'session.json'), JSON.stringify(session));
  return { ...f, ...location, session };
}

releaseLaneOnly('pre-spawn cancel fences a delayed host under real herdr and preserves a sentinel', async () => {
  const f = unstartedSession();
  const sentinel = await sentinelServer();
  const before = sentinel.identity();
  const lock = acquireExclusiveDirectoryLock(f.root, join('.ai/harness/runs/claude-review', f.dir.split('/').at(-1)!, 'startup.lock'));
  try { await expect(closeClaudeReview(f.options, true)).rejects.toThrow('exclusive lock'); }
  finally { lock.release(); }
  expect(existsSync(join(f.dir, 'closed.json'))).toBe(false);
  await closeClaudeReview(f.options, true);
  const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
  const host = fileURLToPath(new URL('../src/effects/review/claude-review-host.ts', import.meta.url));
  const delayed=await sentinelServer();
  const marker=join(f.root,'delayed-host-returned');
  const submitted=herdrCommand(delayed.endpoint,['pane','run',delayed.pane,[process.execPath,host,f.dir].map(quote).join(' ')+'; printf done > '+quote(marker)]);
  expect(submitted.status).toBe(0);
  for(let i=0;i<50&&!existsSync(marker);i++)await Bun.sleep(100);
  expect(existsSync(marker)).toBe(true);
  expect(existsSync(join(f.dir, 'spawn-intent.json'))).toBe(false);
  expect(existsSync(join(f.dir, 'processes.json'))).toBe(false);
  expect(existsSync(join(f.dir, 'accepted-1.json'))).toBe(false);
  expect(sentinel.identity()).toEqual(before);
}, 10_000);

releaseLaneOnly('failed server metadata publication reaps its owned herdr child', async () => {
  const f = unstartedSession();
  // A dangling entry survives existsSync but refuses immutable publication.
  symlinkSync(join(f.dir, 'absent-target'), join(f.dir, 'server.json'));
  await expect(startReviewServer(f.session, f.dir)).rejects.toThrow();
  expect(existsSync(join(f.dir, 'server-start-intent.json'))).toBe(true);
  expect(JSON.parse(readFileSync(join(f.dir, 'server-closed.json'), 'utf8')).session_id).toBe(f.session.session_id);
  expect(herdrCommand({ session: f.session.herdr_session }, ['workspace', 'list']).status).not.toBe(0);
  await closeClaudeReview(f.options, true);
  expect(claudeReviewStatus(f.root, contract).status).toBe('closed');
});

releaseLaneOnly('ambiguous server startup cannot report successful closure', async () => {
  const f = unstartedSession();
  writeFileSync(join(f.dir, 'server-start-intent.json'), JSON.stringify({ session_id: f.session.session_id }));
  await expect(closeClaudeReview(f.options, true)).rejects.toThrow('server_startup_ownership_unknown');
  expect(existsSync(join(f.dir, 'closed.json'))).toBe(false);
  expect(claudeReviewStatus(f.root, contract).status).toBe('cleanup_pending');
  writeFileSync(join(f.dir, 'closed.json'), JSON.stringify({ session_id: f.session.session_id, cancelled: true }));
  await expect(closeClaudeReview(f.options, true)).rejects.toThrow('server_startup_ownership_unknown');
  expect(claudeReviewStatus(f.root, contract).status).toBe('cleanup_pending');
});

releaseLaneOnly('pre-metadata cancel refuses ambiguous spawn intent and mismatched no-child proof', async () => {
  const f = unstartedSession();
  writeFileSync(join(f.dir, 'spawn-intent.json'), JSON.stringify({ session_id: f.session.session_id }));
  await expect(closeClaudeReview(f.options, true)).rejects.toThrow('startup_ownership_unknown');
  expect(existsSync(join(f.dir, 'closed.json'))).toBe(false);
  writeFileSync(join(f.dir, 'startup-no-child.json'), JSON.stringify({ session_id: randomUUID() }));
  await expect(closeClaudeReview(f.options, true)).rejects.toThrow('startup_ownership_unknown');
  expect(existsSync(join(f.dir, 'closed.json'))).toBe(false);
});


releaseLaneOnly('pre-metadata cancel refuses sessions without recorded startup serialization', async () => {
  const f = unstartedSession();
  const { startup_protocol, ...unrecorded } = f.session;
  writeFileSync(join(f.dir, 'session.json'), JSON.stringify(unrecorded));
  await expect(closeClaudeReview(f.options, true)).rejects.toThrow('startup_ownership_unknown');
  expect(existsSync(join(f.dir, 'closed.json'))).toBe(false);
});

releaseLaneOnly('server identity mismatch cannot submit another round or signal a replacement server', async () => {
  const f = fixture();
  await runClaudeReviewRound(f.options);
  const dir = reviewSessionLocation(f.root, contract).dir;
  const path = join(dir, 'server.json');
  const original = readFileSync(path, 'utf8');
  const server = JSON.parse(original);
  writeFileSync(path, JSON.stringify({ ...server, identity: server.identity + ' changed' }));
  try {
    writeFileSync(join(f.root, 'source.ts'), 'export const value = 2;\n'); prepare(f.root);
    await expect(runClaudeReviewRound(f.options)).rejects.toThrow('server_identity_lost');
    expect(existsSync(join(dir, 'request-2.json'))).toBe(false);
    await expect(closeClaudeReview(f.options, true)).rejects.toThrow('server_identity_lost');
    expect(() => process.kill(server.pid, 0)).not.toThrow();
    expect(claudeReviewStatus(f.root, contract).status).toBe('interrupted');
  } finally { writeFileSync(path, original); }
}, 20_000);

releaseLaneOnly('old tmux session metadata is rejected without translation or cleanup', async () => {
  const f = unstartedSession();
  const path = join(f.dir, 'session.json');
  const original = readFileSync(path, 'utf8');
  writeFileSync(path, JSON.stringify({ ...f.session, protocol: 1, tmux_session: f.session.herdr_session }));
  try {
    expect(() => claudeReviewStatus(f.root, contract)).toThrow('session_identity_mismatch');
    await expect(closeClaudeReview(f.options, true)).rejects.toThrow('session_identity_mismatch');
    expect(existsSync(join(f.dir, 'closed.json'))).toBe(false);
  } finally { writeFileSync(path, original); }
});
