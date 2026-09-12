import { prepareHistoricalCodexInvocation } from '../helpers/historical-campaign-lifecycle';
import { runCampaignNotPlanned } from '../../src/effects/automation/campaign-not-planned';
import { automationDigest } from '../../src/core/automation/budget';
import { listProviderIssueObservations } from '../../src/effects/external-sources/store';
import { planningResultKey, requireCampaignPlanningAuthority, type PlanningAdmission } from '../../src/effects/automation/campaign-planning-proof';
import { runCampaignCloseout } from '../../src/effects/automation/campaign-closeout';
import { readLease, createLeaseDirectory, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { buildLeaseOwnerRecord, beginLeaseCompletionRecord, enterReviewingLeaseRecord } from '../../src/core/state/coordination-identity';
import { buildPublicationReceipt, publicationSha256, replacePublicationMarker } from '../../src/core/publication/publication-receipt';
import { publicationPointerFromReceipt } from '../../src/core/publication/publication-lifecycle';
import { writePublicationReceiptCache } from '../../src/effects/publication/publication-receipt';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { readDevelopmentCampaignStatus, appendDevelopmentCampaignEvent } from '../../src/effects/automation/development-campaign-store';
import { afterAll, afterEach, expect, test } from 'bun:test';
import { rmSync, realpathSync, mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { cleanupExactWorktree, assertWorktreeBinding } from '../../src/effects/state/coordination-worktree-topology';
import { canonicalMessageDigest, messageSha256 } from '../../src/core/messages/mechanics';
import { historicalPlanningFixture, installHistoricalBoundDispatch, installHistoricalAttempt, installHistoricalChild, installHistoricalFinal } from '../helpers/historical-campaign-lifecycle';
import { fixtureTemplate } from '../helpers/repo-fixture';
import { ensureCampaignAuthoringBudget, beginCampaignBudgetStep, readCampaignBudgetLedger } from '../../src/effects/automation/budget-store';
import { readPlanningRecord, persistPlanningRecord, withCampaignPlanningLock } from '../../src/effects/automation/campaign-planning-store';
import { runCampaignCloseoutProviderAttempt } from '../../src/effects/automation/campaign-closeout-provider';

const roots: string[] = [];
const templates = fixtureTemplate(historicalPlanningFixture);
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
afterAll(() => templates.dispose());
async function fixture(recoveryBudget = false) {
  const f = await templates.materialize(false, false, undefined, true, recoveryBudget ? { max_provider_failures: 10 } : {}); roots.push(f.root, f.home);
  const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env }).budget;
  const step = { repo_root: f.root, automation_run_id: budget.automation_run_id, expected_budget_sha256: budget.budget_sha256,
    campaign_id: f.intent.campaign_id, group_number: 1 as const, intent_sha256: f.intent.intent_sha256, idempotency_key: 'closeout-fixture', env: f.env };
  const admission = beginCampaignBudgetStep(step).admission;
  const closeout_key = canonicalMessageDigest({ fixture: 'closeout' }).slice(7);
  withCampaignPlanningLock(f.root, f.intent, () => persistPlanningRecord(f.root, f.intent, closeout_key, {
    kind: 'repo-harness-campaign-closeout-intent', provider_requests: { comment: { protocol: 1, operation: 'github_comment_attempt',
      repository: f.intent.provider_repository, issue_number: 1, body: 'Exact fixture closure marker' } },
  }));
  return { ...f, provider: { root: f.root, intent: f.intent, closeout_key, request_key: 'comment', step, step_admission_sha256: admission.event_sha256 },
    ledger: () => readCampaignBudgetLedger(f.root, budget.automation_run_id, f.env) };
}

test('unknown mutation consumes only its pre-reserved readback and never sends again', async () => {
  const f = await fixture(); const before = f.ledger().provider_calls; const calls: string[] = [];
  const github_runner = (args: readonly string[]) => {
    calls.push(args[2]!);
    expect(f.ledger().reserved_provider_calls).toBe(2);
    if (args[2] === 'POST') throw new Error('response lost after server accepted comment');
    return { stdout: JSON.stringify([{ id: 123, body: 'Exact fixture closure marker' }]) };
  };
  const receipt = runCampaignCloseoutProviderAttempt({ ...f.provider, github_runner });
  expect(receipt.mutation_returned).toBe(false);
  expect(calls).toEqual(['POST', 'GET']);
  expect(f.ledger()).toMatchObject({ provider_calls: before + 2, reserved_provider_calls: 0 });
  expect(runCampaignCloseoutProviderAttempt({ ...f.provider, github_runner })).toEqual(receipt);
  expect(calls).toEqual(['POST', 'GET']);
}, 60_000);

test('receipt-before-settlement crash replays the original two-call charge', async () => {
  const f = await fixture(); const before = f.ledger().provider_calls; let calls = 0;
  const github_runner = (args: readonly string[]) => {
    calls++;
    return { stdout: JSON.stringify(args[2] === 'POST' ? { id: 123 } : { id: 123, body: 'Exact fixture closure marker' }) };
  };
  expect(() => runCampaignCloseoutProviderAttempt({ ...f.provider, github_runner, crash_hook: phase => {
    if (phase === 'after_receipt') throw new Error('receipt crash');
  } })).toThrow('receipt crash');
  expect(f.ledger().reserved_provider_calls).toBe(2);
  const receipt = runCampaignCloseoutProviderAttempt({ ...f.provider, github_runner });
  expect(receipt.mutation_returned).toBe(true);
  expect(calls).toBe(2);
  expect(f.ledger()).toMatchObject({ provider_calls: before + 2, reserved_provider_calls: 0 });
}, 60_000);

test('exact cleanup refuses dirty work and deletes only the expected merged topology', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'brc13-topology-'))); roots.push(root);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  writeFileSync(join(root, 'file'), 'base'); git('add', 'file'); git('commit', '-qm', 'base');
  const worktree = `${root}-execution`; roots.push(worktree);
  git('worktree', 'add', '-q', '-b', 'codex/exact', worktree);
  const oid = git('rev-parse', 'HEAD');
  const expected = { worktree, branch: 'codex/exact', head_sha: oid, target_ref: 'main', target_oid: oid, merge_commit_sha: oid };
  const actuator = () => {
    const result = execFileSync('/bin/bash', [join(import.meta.dir, '../../scripts/contract-worktree.sh'), 'cleanup', '--slug', 'exact', '--target', 'main',
      '--expected-worktree', worktree, '--expected-head', oid, '--expected-target', oid, '--expected-merge', oid], {
      cwd: root, encoding: 'utf8', env: { ...process.env, REPO_HARNESS_TARGET_REPO_ROOT: root, REPO_HARNESS_BUN_BIN: '' },
    });
    return JSON.parse(result.trim().split('\n').at(-1)!);
  };
  writeFileSync(join(worktree, 'untracked'), 'preserve');
  expect(() => cleanupExactWorktree(root, expected, actuator)).toThrow('cleanup_blocked_dirty_worktree');
  expect(readFileSync(join(worktree, 'untracked'), 'utf8')).toBe('preserve');
  rmSync(join(worktree, 'untracked'));
  const receipt = cleanupExactWorktree(root, expected, actuator);
  expect(receipt).toMatchObject({ kind: 'repo-harness-exact-local-cleanup', worktree_removed: true, branch_deleted: true });
  expect(existsSync(worktree)).toBe(false);
  expect(() => assertWorktreeBinding(root, worktree, 'codex/exact')).toThrow();
  expect(cleanupExactWorktree(root, expected, actuator)).toEqual(receipt);
});

test('shared lifecycle refuses audit while published Tasks lack cleanup receipts', async () => {
  const f = await fixture();
  const before = readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env);
  expect(() => appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: f.intent.campaign_id,
    expected_current_sha256: before.current.current_sha256, idempotency_key: 'premature-audit', operation: 'begin_group_audit',
    observed_at: new Date().toISOString(), env: f.env })).toThrow('cleanup_pending');
  expect(readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env).current).toEqual(before.current);
}, 60_000);

async function acquired(recoveryBudget = false) {
  const f = await templates.materialize(false, false, undefined, true, { max_agent_turns: 40, max_runner_invocations: 40, ...(recoveryBudget ? { max_provider_failures: 10 } : {}) }); roots.push(f.root, f.home);
  const result = installHistoricalBoundDispatch(f);
  if (!('worker_handoff' in result) || !result.worker_handoff || !result.envelope) throw new Error(JSON.stringify(result));
  roots.push(result.envelope.worktree_path);
  const input = { selector: result.worker_handoff, host: f.executeInput.host, session_id: f.executeInput.session_id, env: f.env };
  return { ...f, envelope: result.envelope, input, historical: result };
}

function installProviderFixture(f: Awaited<ReturnType<typeof acquired>>, finalVerdict: 'pass' | 'fail' = 'pass', detachedCommand = false) {
  const profiles = join(f.root, '.codex/agents'); mkdirSync(profiles, { recursive: true });
  for (const [name, sandbox] of [['fast-worker', 'workspace-write'], ['gatekeeper', 'read-only']]) {
    writeFileSync(join(profiles, `${name}.toml`), `model = "fixture-model"\nsandbox_mode = "${sandbox}"\nmodel_reasoning_effort = "high"\ndeveloper_instructions = "Fixture role"\n`);
  }
  execFileSync('git', ['add', '--', '.codex/agents/fast-worker.toml', '.codex/agents/gatekeeper.toml'], { cwd: f.root });
  const bin = join(f.home, 'fixture-bin'); mkdirSync(bin);
  const executable = join(bin, 'codex');
  writeFileSync(executable, `#!${process.execPath}
import { writeFileSync } from 'fs';
import { spawn } from 'child_process';
if (process.argv.includes('--version')) { console.log('codex-cli 1.0.0'); process.exit(0); }
const role = process.env.CONTRACT_RUN_ROLE;
if (${detachedCommand} && role === 'worker') {
  const child = spawn(process.execPath, ['-e', "const fs = require('fs'); const timer = setInterval(() => fs.appendFileSync('detached-writes.txt', 'x'), 20); setTimeout(() => { clearInterval(timer); }, 30000);"], { detached: true, stdio: 'ignore' });
  writeFileSync('detached.pid', String(child.pid)); child.unref();
}
if (role === 'worker') writeFileSync(process.env.CONTRACT_RUN_ATTEMPT_RESULT, JSON.stringify({ outcome:'completed', evidence_paths:['src/index.ts'] }));
const text = role === 'verifier' ? JSON.stringify({ verdict:${JSON.stringify(finalVerdict)}, review:'Fixture review' }) : 'Worker finished';
console.error('fixture diagnostic');
for (const event of [{type:'thread.started',thread_id:'fixture-'+role}, ...(${detachedCommand} && role === 'worker' ? [{type:'item.completed',item:{id:'command',type:'command_execution',status:'completed',exit_code:0}}] : []), {type:'item.completed',item:{id:'message',type:'agent_message',text}}, {type:'turn.completed',usage:{input_tokens:10,cached_input_tokens:0,output_tokens:2}}]) console.log(JSON.stringify(event));
`);
  chmodSync(executable, 0o700);
  return { ...f.env, PATH: `${bin}:${process.env.PATH}` };
}


test.each(['normal', 'source-drift', 'release-crash', 'cleanup-crash', 'target-advance', 'open-recovery', 'read-recovery', 'cleanup-fetch-crash'])('worker publication closeout mode=%s', async (mode) => {
  const sourceDrift = mode === 'source-drift';
  const f = await acquired(mode === 'read-recovery'); const env = installProviderFixture(f); const worktree = f.envelope.worktree_path;
  const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const attempt = installHistoricalAttempt(f, f.historical);
  for (const role of ['worker', 'verifier'] as const) {
    writeFileSync(join(worktree, `${role}.prompt.md`), 'Fixture prompt');
    const invocation = await prepareHistoricalCodexInvocation({ deadline_ms: Date.now() + 10000, repo_root:f.root,worktree,prompt_path:`${role}.prompt.md`,env,
      identity:{dispatch_id:f.input.selector.dispatch_id,role,task_id:f.envelope.task_id,task_revision:f.envelope.task_revision,claim_id:f.envelope.claim_id,lease_generation:f.envelope.generation,binding_generation:f.historical.acquired.offer.binding_generation}});
    const child = spawnSync(process.execPath, [join(import.meta.dir, '../../scripts/run-bounded-verifier-command.ts'), '--deadline-ms', String(Date.now() + 10_000),
      '--log', join(worktree, `${role}.stdout`), '--stderr-log', join(worktree, `${role}.stderr`), '--result', join(worktree, `${role}.result`),
      '--', join(env.PATH!.split(':')[0]!, 'codex'), ...invocation.argv], { cwd: worktree, env: { ...env, CONTRACT_RUN_ROLE: role, CONTRACT_RUN_ATTEMPT_RESULT: 'final.json' }, encoding: 'utf8' });
    expect(child.status, child.stderr).toBe(0);
    installHistoricalChild(f, f.historical, invocation, { ...JSON.parse(readFileSync(join(worktree, `${role}.result`), 'utf8')), role, command: `codex-exec:${role}`, stdout_path: `${role}.stdout`, stderr_path: `${role}.stderr` });
  }
  installHistoricalFinal(f, f.historical, attempt);
  git(f.root, 'commit', '-qm', 'fixture provider profiles');
  const sprint = join(worktree, f.envelope.sprint_path);
  writeFileSync(sprint, readFileSync(sprint, 'utf8').split('\n').map(line => line.includes(f.envelope.task_id) ? line.replace('[ ]', '[x]') : line).join('\n'));
  git(worktree, 'add', '.'); git(worktree, 'commit', '-qm', 'fixture publication');
  const head = git(worktree, 'rev-parse', 'HEAD'); const base = git(f.root, 'rev-parse', 'main');
  const receipt = buildPublicationReceipt({ repo_id: publicationSha256(resolveGitCommonDirectory(f.root)), task_id: f.envelope.task_id,
    task_revision: f.envelope.task_revision, claim_id: f.envelope.claim_id, generation: f.envelope.generation, target_ref: 'main', base_sha: base,
    branch: f.envelope.branch, head_sha: head, tree_sha: git(worktree, 'rev-parse', 'HEAD^{tree}'),
    review_subject_sha256: `sha256:${'3'.repeat(64)}`, verification_evidence_sha256: `sha256:${'4'.repeat(64)}`, merge_seal_sha256: `sha256:${'5'.repeat(64)}`,
    provider: 'github', provider_repo_id: 'R_fixture', pr_number: 1, pr_url: 'https://example.invalid/pr/1', created_at: new Date().toISOString() });
  writePublicationReceiptCache(f.root, receipt);
  const completing = beginLeaseCompletionRecord(readLease(f.root, f.envelope.task_id).record!, { claimId: f.envelope.claim_id, executionWorktree: worktree, finishTransactionKey: 'fixture-finish' });
  if (!completing.ok) throw new Error(completing.error);
  const reviewing = enterReviewingLeaseRecord(completing.record, { claimId: f.envelope.claim_id, publication: publicationPointerFromReceipt(receipt, 'fixture-ship') });
  if (!reviewing.ok) throw new Error(reviewing.error);
  writeLeaseOwnerDurably(f.root, f.envelope.task_id, reviewing.record);
  const remote = join(f.home, 'remote.git'); git(f.root, 'init', '--bare', remote); git(f.root, 'remote', 'add', 'origin', remote);
  git(f.root, 'merge', '--no-ff', f.envelope.branch, '-m', 'fixture human merge');
  git(f.root, 'push', 'origin', 'main', f.envelope.branch); const merge = git(f.root, 'rev-parse', 'main');
  const manifest = requireCampaignPlanningAuthority(f.root, f.intent, env).manifest;
  const slot = manifest.slots.find(value => value.task_id === f.envelope.task_id)!;
  const adopted = manifest.receipt.issues.find(value => value.slot === slot.slot)!;
  const observation = listProviderIssueObservations(f.root).find(value => value.observation_sha256 === adopted.source_observation_sha256)!;
  let comment = ''; let closed = false; let recovered = false; const calls: string[] = [];
  const github_runner = (args: readonly string[]) => {
    calls.push(args.join(' '));
    if (args[1] === 'graphql' && mode === 'read-recovery' && !recovered) throw new Error('integration read interrupted');
    if (args[1] === 'graphql') return { stdout: JSON.stringify({ data: { repository: { id: 'R_fixture', pullRequest: {
      number: 1, url: receipt.pr_url, headRefOid: head, headRefName: f.envelope.branch, baseRefName: 'main', baseRefOid: merge,
      body: replacePublicationMarker('Fixture PR', receipt), createdAt: receipt.created_at, state: mode === 'open-recovery' && !recovered ? 'OPEN' : 'MERGED', mergedAt: mode === 'open-recovery' && !recovered ? null : new Date().toISOString(), mergeCommit: mode === 'open-recovery' && !recovered ? null : { oid: merge },
    } } } }) };
    if (args[2] === 'POST') { comment = args.find(arg => arg.startsWith('body='))!.slice(5); return { stdout: '{"id":1}' }; }
    if (args[2] === 'PATCH') { closed = true; return { stdout: '{}' }; }
    if (args[3]!.includes('/comments')) return { stdout: JSON.stringify(args[3]!.includes('/issues/comments/') ? { id: 1, body: comment } : [{ id: 1, body: comment }]) };
    return { stdout: JSON.stringify({ id: adopted.provider_issue_id, number: adopted.issue_number, title: sourceDrift ? 'Changed source title' : observation.title, body: observation.body, state: closed ? 'closed' : 'open', state_reason: closed ? 'completed' : null }) };
  };
  const input = { ...f.input, remote: 'origin', env, github_runner, cleanup: (root: string, expected: import('../../src/effects/state/coordination-worktree-topology').ExactWorktreeCleanup) => {
    return execFileSync('/bin/bash', [join(import.meta.dir, '../../scripts/contract-worktree.sh'), 'cleanup', '--slug', expected.branch, '--target', 'main',
      '--expected-worktree', expected.worktree, '--expected-head', expected.head_sha, '--expected-target', expected.target_oid, '--expected-merge', expected.merge_commit_sha],
      { cwd: root, env: { ...env, REPO_HARNESS_TARGET_REPO_ROOT: root, REPO_HARNESS_BUN_BIN: '' }, encoding: 'utf8' });
  } };
  if (mode === 'open-recovery' || mode === 'read-recovery') {
    expect(() => runCampaignCloseout(input)).toThrow();
    expect(closed).toBe(false); expect(existsSync(worktree)).toBe(true);
    recovered = true;
  }
  if (sourceDrift) {
    expect(() => runCampaignCloseout(input)).toThrow('Issue source changed');
    expect(closed).toBe(false); expect(existsSync(worktree)).toBe(true);
    expect(calls.some(call => call.includes('--method POST') || call.includes('--method PATCH'))).toBe(false);
    return;
  }
  if (mode === 'release-crash') {
    expect(() => runCampaignCloseout({ ...input, crash_hook: () => { throw new Error('merge proof crash'); } } as Parameters<typeof runCampaignCloseout>[0])).toThrow();
    const remaining = readLease(f.root, f.envelope.task_id).record!;
    expect(remaining.state).toBe('reviewing');
    writeLeaseOwnerDurably(f.root, f.envelope.task_id, { ...remaining, generation: remaining.generation + 1 });
    expect(() => runCampaignCloseout(input)).toThrow('lease owner does not match publication receipt');
    expect(readLease(f.root, f.envelope.task_id).record?.generation).toBe(remaining.generation + 1);
    writeLeaseOwnerDurably(f.root, f.envelope.task_id, remaining);
  }
  if (mode === 'cleanup-fetch-crash') {
    expect(() => runCampaignCloseout({ ...input, crash_hook: phase => { if (phase === 'after_cleanup_fetch') throw new Error('cleanup fetch crash'); } })).toThrow('cleanup fetch crash');
    expect(existsSync(worktree)).toBe(true);
  }
  if (mode === 'cleanup-crash') {
    expect(() => runCampaignCloseout({ ...input, cleanup: (root, topology) => { input.cleanup(root, topology); throw new Error('after deletion crash'); } })).toThrow('after deletion crash');
    expect(existsSync(worktree)).toBe(false);
  }
  if (mode === 'target-advance') {
    expect(() => runCampaignCloseout({ ...input, cleanup: () => { throw new Error('before deletion crash'); } })).toThrow('before deletion crash');
    git(f.root, 'commit', '--allow-empty', '-qm', 'legitimate later main');
    git(f.root, 'push', 'origin', 'main');
  }
  expect(runCampaignCloseout(input).disposition).toBe('complete');
  expect(closed).toBe(true); expect(existsSync(worktree)).toBe(false);
  const count = calls.length; expect(runCampaignCloseout(input).disposition).toBe('complete'); expect(calls).toHaveLength(count);
}, 60_000);

test('a bind arriving during cleanup cannot claim the removed worktree', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'brc13-bind-race-'))); roots.push(root);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  writeFileSync(join(root, 'file'), 'base'); git('add', 'file'); git('commit', '-qm', 'base');
  const worktree = `${root}-execution`; roots.push(worktree); git('worktree', 'add', '-q', '-b', 'codex/race', worktree);
  const oid = git('rev-parse', 'HEAD'); const task = 'a'.repeat(64);
  const owner = buildLeaseOwnerRecord({ claimId: 'race-claim', taskId: task, taskRevision: 'b'.repeat(64), sprintPath: 'plans/sprints/race.md',
    targetRef: 'main', generation: 1, sessionId: 'race-session', sourceWorktree: root });
  expect(createLeaseDirectory(root, task)).toBe(true); writeLeaseOwnerDurably(root, task, owner);
  const ready = join(root, '.bind-ready');
  let child: ReturnType<typeof Bun.spawn> | undefined;
  cleanupExactWorktree(root, { worktree, branch: 'codex/race', head_sha: oid, target_ref: 'main', target_oid: oid, merge_commit_sha: oid }, () => {
    child = Bun.spawn([process.execPath, '-e', `
      const { writeFileSync } = await import('fs');
      const { bindSprintCommand, processSprintDependencies } = await import(process.env.BIND_MODULE);
      writeFileSync(process.env.READY, 'ready');
      const result = bindSprintCommand({ claimId:'race-claim', worktree:process.env.WORKTREE, branch:'codex/race', unitRef:'plans/plan-race.md' }, processSprintDependencies(process.env.REPO));
      console.log(JSON.stringify(result)); process.exit(result.exitCode);
    `], { env: { ...process.env, BIND_MODULE: join(import.meta.dir, '../../src/effects/state/coordination-sprint.ts'), READY: ready, WORKTREE: worktree, REPO: root }, stdout: 'pipe', stderr: 'pipe' });
    const deadline = Date.now() + 3000;
    while (!existsSync(ready) && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    expect(existsSync(ready)).toBe(true);
    git('worktree', 'remove', worktree); git('update-ref', '-d', 'refs/heads/codex/race', oid);
  });
  expect(await child!.exited).toBe(1);
  expect(readLease(root, task).record?.state).toBe('reserving');
  expect(readLease(root, task).record?.execution_worktree).toBeNull();
}, 15_000);

test('lost close response uses the exact reserved read and never resends PATCH', async () => {
  const f = await fixture(); const closeout_key = canonicalMessageDigest({ fixture: 'close' }).slice(7);
  withCampaignPlanningLock(f.root, f.intent, () => persistPlanningRecord(f.root, f.intent, closeout_key, {
    kind: 'repo-harness-campaign-closeout-intent', provider_requests: { close: { protocol: 1, operation: 'github_close_attempt',
      repository: f.intent.provider_repository, issue_number: 1, disposition: 'completed' } },
  }));
  const calls: string[] = [];
  const github_runner = (args: readonly string[]) => {
    calls.push(args[2]!);
    if (args[2] === 'PATCH') throw new Error('lost close response');
    return { stdout: '{"number":1,"state":"closed","state_reason":"completed"}' };
  };
  const input = { ...f.provider, closeout_key, request_key: 'close', github_runner };
  expect(runCampaignCloseoutProviderAttempt(input).mutation_returned).toBe(false);
  runCampaignCloseoutProviderAttempt(input);
  expect(calls).toEqual(['PATCH', 'GET']);
}, 60_000);

test('unknown readback is retried under a new reservation without resending mutation', async () => {
  const f = await fixture(true); let calls = 0;
  const input = { ...f.provider, github_runner: () => { calls++; throw new Error('transport unavailable'); } };
  expect(() => runCampaignCloseoutProviderAttempt(input)).toThrow('readback is unknown');
  expect(() => runCampaignCloseoutProviderAttempt(input)).toThrow('readback is unknown');
  expect(calls).toBe(3); expect(f.ledger().reserved_provider_calls).toBe(0);
}, 60_000);

test('a moved remote ref is preserved by compare-and-delete and leaves reconciliation pending', async () => {
  const f = await fixture(); const remote = join(f.home, 'remote.git');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: f.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--bare', remote); git('remote', 'add', 'origin', remote); git('push', 'origin', 'HEAD:refs/heads/delete-me');
  const actual = git('rev-parse', 'HEAD'); const closeout_key = canonicalMessageDigest({ fixture: 'moved-ref' }).slice(7);
  withCampaignPlanningLock(f.root, f.intent, () => persistPlanningRecord(f.root, f.intent, closeout_key, {
    kind: 'repo-harness-campaign-closeout-intent', provider_requests: { delete: { protocol: 1, operation: 'git_ref_delete_attempt',
      remote: 'origin', ref: 'refs/heads/delete-me', expected_oid: 'f'.repeat(40), remote_url_sha256: automationDigest(remote) } },
  }));
  expect(() => runCampaignCloseoutProviderAttempt({ ...f.provider, closeout_key, request_key: 'delete' })).toThrow('does not confirm');
  expect(git('ls-remote', '--refs', 'origin', 'refs/heads/delete-me').split('\t')[0]).toBe(actual);
  expect(f.ledger().reserved_provider_calls).toBe(2);
}, 60_000);

test('not_planned requires reviewed typed falsifier and all non-executing planning outcomes', async () => {
  const f = await historicalPlanningFixture(false, false, undefined, true, { max_agent_turns: 40, max_runner_invocations: 40 }, true); roots.push(f.root, f.home);
  const authority = requireCampaignPlanningAuthority(f.root, f.intent, f.env); const issue = authority.manifest.receipt.issues[0]!;
  const slot = authority.manifest.slots.find(value => value.slot === issue.slot)!;
  const planning = readPlanningRecord<PlanningAdmission>(f.root, f.intent, planningResultKey(slot.task_id))!;
  const artifact = 'tasks/evidence/not-planned.json'; const evidence = 'tasks/evidence/falsifier.txt'; const contract = 'tasks/contracts/not-planned.contract.md';
  const proof = 'Observed empty input is rejected; alleged acceptance did not occur.\n';
  writeFileSync(join(f.root, evidence), proof);
  writeFileSync(join(f.root, artifact), JSON.stringify({ protocol: 1, kind: 'repo-harness-campaign-not-planned-decision', campaign_id: f.intent.campaign_id,
    group_number: 1, intent_sha256: f.intent.intent_sha256, provider_issue_id: issue.provider_issue_id, source_observation_sha256: issue.source_observation_sha256,
    disposition: 'not_planned', tasks: [{ task_id: slot.task_id, task_revision: planning.job.task_revision, slot: slot.slot }],
    falsifier: { command: 'fixture empty-input probe', exit_code: 0, observation: 'Expected rejection was observed', artifact_path: evidence, artifact_sha256: messageSha256(proof) } }));
  writeFileSync(join(f.root, contract), `# Contract\n## Allowed Paths\n\n\`\`\`yaml\nallowed_paths:\n  - ${artifact}\n  - ${evidence}\n\`\`\`\n`);
  execFileSync('git', ['add', artifact, evidence, contract], { cwd: f.root }); execFileSync('git', ['commit', '-qm', 'accepted local decision fixture'], { cwd: f.root });
  const observed = listProviderIssueObservations(f.root).find(value => value.observation_sha256 === issue.source_observation_sha256)!;
  let comment = ''; let closed = false; let calls = 0;
  const github_runner = (args: readonly string[]) => {
    calls++;
    if (args[2] === 'POST') { comment = args.find(value => value.startsWith('body='))!.slice(5); return { stdout: '{"id":1}' }; }
    if (args[2] === 'PATCH') { expect(args).toContain('state_reason=not_planned'); closed = true; return { stdout: '{}' }; }
    if (args[3]!.includes('/comments')) return { stdout: JSON.stringify(args[3]!.includes('/issues/comments/') ? { id: 1, body: comment } : [{ id: 1, body: comment }]) };
    return { stdout: JSON.stringify({ id: issue.provider_issue_id, number: issue.issue_number, title: observed.title, body: observed.body,
      state: closed ? 'closed' : 'open', state_reason: closed ? 'not_planned' : null }) };
  };
  const acceptance = { protocol: 2, kind: 'repo-harness-acceptance-receipt', repository_root: f.root, contract_file: contract,
    subject_sha256: `sha256:${'a'.repeat(64)}`, disposition: 'external_pass', reviewed_paths: [artifact, evidence] };
  const input = { root: f.root, artifact_path: artifact, contract_path: contract, host: 'codex' as const, session_id: 'parent', env: f.env, github_runner,
    verify_acceptance: () => acceptance };
  expect(() => runCampaignNotPlanned({ ...input, verify_acceptance: () => ({ ...acceptance, reviewed_paths: [artifact] }) })).toThrow('both evidence artifacts');
  expect(calls).toBe(0);
  for (const disposition of ['pass', 'reject']) {
    expect(() => runCampaignNotPlanned({ ...input, verify_acceptance: () => ({ ...acceptance, disposition }) })).toThrow('both evidence artifacts');
    expect(calls).toBe(0);
  }
  expect(runCampaignNotPlanned(input).disposition).toBe('complete'); expect(closed).toBe(true);
  const count = calls; expect(runCampaignNotPlanned(input).disposition).toBe('complete'); expect(calls).toBe(count);
  expect(comment).toContain('Disposition: not_planned'); expect(comment).toContain(issue.source_observation_sha256);
  expect(readLease(f.root, slot.task_id).classification).toBe('available');
}, 60_000);


test('a separate push destination cannot receive closeout deletion', async () => {
  const f = await fixture();
  const git = (...args: string[]) => execFileSync('git', args, { cwd: f.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const fetch = join(f.home, 'fetch.git'); const push = join(f.home, 'push.git');
  git('init', '--bare', fetch); git('init', '--bare', push);
  git('remote', 'add', 'origin', fetch); git('push', push, 'HEAD:refs/heads/delete-me');
  git('remote', 'set-url', '--push', 'origin', push);
  const oid = git('rev-parse', 'HEAD'); const closeout_key = canonicalMessageDigest({ fixture: 'push-destination' }).slice(7);
  withCampaignPlanningLock(f.root, f.intent, () => persistPlanningRecord(f.root, f.intent, closeout_key, {
    kind: 'repo-harness-campaign-closeout-intent', provider_requests: { delete: { protocol: 1, operation: 'git_ref_delete_attempt',
      remote: 'origin', ref: 'refs/heads/delete-me', expected_oid: oid, remote_url_sha256: automationDigest(fetch) } },
  }));
  expect(() => runCampaignCloseoutProviderAttempt({ ...f.provider, closeout_key, request_key: 'delete' })).toThrow();
  expect(git('ls-remote', '--refs', push, 'refs/heads/delete-me').split('\t')[0]).toBe(oid);
}, 60_000);


test('a known comment is read back by exact id beyond the first hundred', async () => {
  const f = await fixture(); const paths: string[] = [];
  runCampaignCloseoutProviderAttempt({ ...f.provider, github_runner: args => {
    paths.push(args[3]!);
    if (args[2] === 'POST') return { stdout: JSON.stringify({ id: 501 }) };
    if (args[3]!.endsWith('/issues/comments/501')) return { stdout: JSON.stringify({ id: 501, body: 'Exact fixture closure marker' }) };
    return { stdout: JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ id: i + 1, body: 'old comment' }))) };
  } });
  expect(paths[1]).toBe(`repos/${f.intent.provider_repository}/issues/comments/501`);
}, 60_000);

for (const interrupted of [false, true]) test(`readback recovery confirms mutation once after interruption=${interrupted}`, async () => {
  const f = await fixture(true); const calls: string[] = []; let failRead = true;
  const input = { ...f.provider, github_runner: (args: readonly string[]) => {
    calls.push(args[2]!);
    if (args[2] === 'POST') return { stdout: '{"id":123}' };
    if (failRead) throw new Error('network unavailable');
    return { stdout: '{"id":123,"body":"Exact fixture closure marker"}' };
  } };
  expect(() => runCampaignCloseoutProviderAttempt({ ...input, crash_hook: phase => {
    if (interrupted && phase === 'after_readback_started') throw new Error('read started crash');
  } })).toThrow();
  failRead = false;
  const receipt = runCampaignCloseoutProviderAttempt(input);
  expect(receipt.readback_stdout).toContain('Exact fixture closure marker');
  expect(calls.filter(x => x === 'POST')).toHaveLength(1);
  expect(calls.filter(x => x === 'GET')).toHaveLength(interrupted ? 1 : 2);
  const ledger = f.ledger();
  expect(ledger.reserved_provider_calls).toBe(0);
  expect(runCampaignCloseoutProviderAttempt(input)).toEqual(receipt);
  expect(f.ledger()).toEqual(ledger);
}, 60000);

test('read recovery stops at the original upper-bound budget and never repeats mutation', async () => {
  const f = await fixture(); let calls = 0;
  const input = { ...f.provider, github_runner: () => { calls++; throw new Error('unavailable'); } };
  expect(() => runCampaignCloseoutProviderAttempt(input)).toThrow('readback is unknown');
  expect(() => runCampaignCloseoutProviderAttempt(input)).toThrow('budget_exhausted');
  expect(calls).toBe(2);
  expect(f.ledger().reserved_provider_calls).toBe(0);
}, 60000);

test('interrupted recovery read is charged once and advances only the read generation', async () => {
  const f = await fixture(true); let calls = 0; let available = false;
  const input = { ...f.provider, github_runner: (args: readonly string[]) => {
    calls++;
    if (args[2] === 'POST') return { stdout: '{"id":123}' };
    if (!available) throw new Error('unavailable');
    return { stdout: '{"id":123,"body":"Exact fixture closure marker"}' };
  } };
  expect(() => runCampaignCloseoutProviderAttempt(input)).toThrow('readback is unknown');
  expect(() => runCampaignCloseoutProviderAttempt({ ...input, crash_hook: phase => { if (phase === 'after_recovery_read_started') throw new Error('recovery crash'); } })).toThrow('recovery crash');
  available = true;
  const result = runCampaignCloseoutProviderAttempt(input);
  expect(result.readback_generation).toBe(2);
  expect(calls).toBe(3);
  const ledger = f.ledger();
  runCampaignCloseoutProviderAttempt(input);
  expect(f.ledger()).toEqual(ledger);
}, 60000);
