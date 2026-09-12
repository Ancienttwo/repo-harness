import { readTaskAutomationAttemptCurrent } from '../../src/effects/engineers/automation-attempt-store';
import { afterAll, afterEach, expect, test } from 'bun:test';
import { existsSync, rmSync, writeFileSync, readFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { readPlanningRecord } from '../../src/effects/automation/campaign-planning-store';
import { campaignRuntimeRecordKey } from '../../src/core/automation/campaign-runtime';
import { historicalPlanningFixture, installHistoricalBoundDispatch, installHistoricalAttempt, installHistoricalChild, installHistoricalFinal } from '../helpers/historical-campaign-lifecycle';
import { prepareHistoricalCodexInvocation } from '../helpers/historical-campaign-lifecycle';
import { fixtureTemplate } from '../helpers/repo-fixture';
import { persistPlanningRecord } from '../../src/effects/automation/campaign-planning-store';
import { bindCampaignWorker, readCompletedCampaignWorker } from '../../src/effects/automation/campaign-worker';
import { retireCampaignDispatch, observeCampaignReclaimEligibility, recoverCampaignDispatch } from '../../src/effects/automation/campaign-recovery';
import { ensureCampaignAuthoringBudget, readAutomationBudgetStatus } from '../../src/effects/automation/budget-store';
import { readLease } from '../../src/effects/state/coordination-lease-store';
import { readLeaseLiveness } from '../../src/effects/state/coordination-lease-liveness-store';
import { readClaimTokenForTask } from '../../src/effects/state/coordination-claim-token';
import { readClaimActorReceipt } from '../../src/effects/engineers/claim-actor-store';

const roots: string[] = [];
const templates = fixtureTemplate(historicalPlanningFixture);
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
afterAll(() => templates.dispose());
async function acquired() {
  const f = await templates.materialize(); roots.push(f.root, f.home);
  const result = installHistoricalBoundDispatch(f);
  if (!('worker_handoff' in result) || !result.worker_handoff || !result.envelope) throw new Error(JSON.stringify(result));
  roots.push(result.envelope.worktree_path);
  const input = { selector: result.worker_handoff, host: f.executeInput.host, session_id: f.executeInput.session_id, env: f.env };
  return { ...f, historical: result, envelope: result.envelope, input };
}

test('historical liveness remains observable but a no-final recovery cannot mint a generation', async () => {
  const f = await acquired();
  const before = readLease(f.root, f.envelope.task_id);
  expect(readLeaseLiveness(f.root, f.envelope.task_id).current.lease_generation).toBe(f.envelope.generation);
  expect(() => bindCampaignWorker({ selector: f.input.selector, worktree: f.envelope.worktree_path,
    contract: f.envelope.plan.contract_path, worker_command: 'true', verifier_command: 'true', env: f.env })).toThrow('trusted exact revision readback');
  expect(() => recoverCampaignDispatch(f.input)).toThrow('without a persisted final');
  expect(readLease(f.root, f.envelope.task_id)).toEqual(before);
  retireCampaignDispatch(f.input);
  const receipt = observeCampaignReclaimEligibility({ ...f.input, now: () => new Date(Date.now() + 60_000) });
  expect(receipt.classification).toBe('reclaimable');
  expect(receipt.evidence.controller_terminal).toBe(true);
  expect(receipt.evidence.runtime_effect_inactive).toBe(true);
  expect(() => recoverCampaignDispatch(f.input)).toThrow('without a persisted final');
  expect(readLease(f.root, f.envelope.task_id)).toEqual(before);
}, 60_000);

test('recovery resumes every persisted boundary without a new worktree or second generation', async () => {
  const f = await acquired();
  const env = installProviderFixture(f);
  await runHistoricalProvider(f, env, 'pass', false);
  const instant = new Date(Date.now() + 60_000); const now = () => instant;
  const source = join(f.envelope.worktree_path, 'src/index.ts');
  writeFileSync(source, 'preserved dirty work\n');
  const boundaries = ['after_intent', 'after_lease_write', 'after_bind', 'after_token', 'after_actor', 'after_recovered'] as const;
  let newClaim: string | undefined;
  for (const boundary of boundaries) {
    expect(() => recoverCampaignDispatch({ ...f.input, now, crash_hook: point => { if (point === boundary) throw new Error(`crash:${point}`); } })).toThrow(`crash:${boundary}`);
    const owner = readLease(f.root, f.envelope.task_id).record!;
    if (boundary !== 'after_intent') {
      newClaim ??= owner.claim_id;
      expect(owner.claim_id).toBe(newClaim!);
      expect(owner.generation).toBe(f.envelope.generation + 1);
    }
    expect(readFileSync(source, 'utf8')).toBe('preserved dirty work\n');
  }
  const resumed = recoverCampaignDispatch({ ...f.input, now });
  expect(resumed.envelope.claim_id).toBe(newClaim!);
  expect(resumed.envelope.worktree_path).toBe(f.envelope.worktree_path);
  expect(resumed.envelope.branch).toBe(f.envelope.branch);
  expect(readClaimTokenForTask(f.envelope.worktree_path, f.envelope.task_id)).toMatchObject({ outcome: 'found', token: { claim_id: newClaim } });
  expect(readClaimActorReceipt(f.root, f.envelope.task_id, newClaim!)).toEqual(resumed.receipt);
}, 60_000);

test('a raw command launch never becomes provider-terminal evidence after retirement', async () => {
  const f = await acquired();
  installHistoricalAttempt(f, f.historical, null);
  retireCampaignDispatch(f.input);
  const instant = new Date(Date.now() + 60_000); const now = () => instant;
  expect(observeCampaignReclaimEligibility({ ...f.input, now }).evidence.runtime_effect_inactive).toBeNull();
  expect(() => recoverCampaignDispatch({ ...f.input, now })).toThrow('without a persisted final');
  expect(readLease(f.root, f.envelope.task_id).record!.generation).toBe(f.envelope.generation);
}, 60_000);

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

test('detached command effects remain ineligible for reclaim after provider completion', async () => {
  const f = await acquired();
  const env = installProviderFixture(f, 'pass', true);
  writeFileSync(join(f.envelope.worktree_path, 'selector.json'), JSON.stringify(f.input.selector));
  try {
    await runHistoricalProvider(f, env, 'pass', true);
    expect(readCompletedCampaignWorker(f.input.selector, env).writable_inactive).toBe(false);
    const terminal = readPlanningRecord<any>(f.root, f.intent, campaignRuntimeRecordKey(f.input.selector.dispatch_id, 'worker', 'terminal'));
    expect(terminal.state).toBe('unknown');
    expect(terminal.supervision_proven).toBe(false);
    const path = join(f.envelope.worktree_path, 'detached-writes.txt');
    const before = readFileSync(path, 'utf8').length;
    await Bun.sleep(100);
    expect(readFileSync(path, 'utf8').length).toBeGreaterThan(before);
    retireCampaignDispatch({ ...f.input, env });
    const instant = new Date(Date.now() + 60_000); const now = () => instant;
    expect(observeCampaignReclaimEligibility({ ...f.input, env, now }).evidence.runtime_effect_inactive).toBeNull();
    expect(() => recoverCampaignDispatch({ ...f.input, env, now })).toThrow('not reclaimable');
    expect(readLease(f.root, f.envelope.task_id).record!.generation).toBe(f.envelope.generation);
  } finally {
    try { process.kill(Number(readFileSync(join(f.envelope.worktree_path, 'detached.pid'), 'utf8')), 'SIGKILL'); } catch { /* Fixture descendant may already have exited. */ }
  }
}, 60_000);

for (const verdict of ['pass', 'fail'] as const) test(`typed Codex process binds invocation evidence and consumes the explicit ${verdict} verdict`, async () => {
  const f = await acquired();
  const env = installProviderFixture(f, verdict);
  writeFileSync(join(f.envelope.worktree_path, 'selector.json'), JSON.stringify(f.input.selector));
  await runHistoricalProvider(f, env, verdict, true);
  for (const role of ['worker', 'verifier'] as const) {
    const intent = readPlanningRecord<any>(f.root, f.intent, campaignRuntimeRecordKey(f.input.selector.dispatch_id, role, 'intent'));
    const started = readPlanningRecord<any>(f.root, f.intent, campaignRuntimeRecordKey(f.input.selector.dispatch_id, role, 'started'));
    const terminal = readPlanningRecord<any>(f.root, f.intent, campaignRuntimeRecordKey(f.input.selector.dispatch_id, role, 'terminal'));
    expect(started.invocation_sha256).toBe(intent.invocation_sha256);
    expect(terminal.invocation_sha256).toBe(intent.invocation_sha256);
    expect(terminal.provider_thread_id).toBe(`fixture-${role}`);
    expect(terminal.state).toBe('terminal');
    expect(intent.sandbox).toBe('danger-full-access');
    expect(intent.workspace_access).toBe(role === 'worker' ? 'read-write' : 'read-only');
  }
  retireCampaignDispatch(f.input);
  const instant = new Date(Date.now() + 60_000); const now = () => instant;
  expect(observeCampaignReclaimEligibility({ ...f.input, now }).classification).toBe('reclaimable');
  const output = join(f.envelope.worktree_path, 'worker.stdout');
  const originalBytes = readFileSync(output);
  writeFileSync(output, Buffer.concat([originalBytes, Buffer.from('\n')]));
  expect(observeCampaignReclaimEligibility({ ...f.input, now }).evidence.runtime_effect_inactive).toBeNull();
  writeFileSync(output, originalBytes);
  const recovered = recoverCampaignDispatch({ ...f.input, now });
  expect(recovered.disposition).toBe('settled_final');
  expect(recovered.final!.contract_run.status).toBe(verdict);
  expect(readTaskAutomationAttemptCurrent(f.root, f.historical.acquired.offer.work_package_id, f.historical.acquired.offer.work_package_revision)?.last_outcome).toBe(verdict === 'fail' ? 'permanent_failure' : 'completed');
  expect(recoverCampaignDispatch({ ...f.input, now }).envelope.claim_id).toBe(recovered.envelope.claim_id);
}, 60_000);

test('a started typed invocation without its terminal refuses reclaim and keeps its generation', async () => {
  const f = await acquired(); const env = installProviderFixture(f);
  installHistoricalAttempt(f, f.historical);
  writeFileSync(join(f.envelope.worktree_path, 'prompt.md'), 'Fixture prompt');
  const invocation = await prepareHistoricalCodexInvocation({ deadline_ms: Date.now() + 10000,  repo_root: f.root, worktree: f.envelope.worktree_path, prompt_path: 'prompt.md', env,
    identity: { dispatch_id: f.input.selector.dispatch_id, claim_id: f.envelope.claim_id, lease_generation: f.envelope.generation,
      task_id: f.envelope.task_id, task_revision: f.envelope.task_revision, binding_generation: f.historical.acquired.offer.binding_generation, role: 'worker' } });
  persistPlanningRecord(f.root, f.intent, campaignRuntimeRecordKey(f.input.selector.dispatch_id, 'worker', 'intent'), invocation);
  persistPlanningRecord(f.root, f.intent, campaignRuntimeRecordKey(f.input.selector.dispatch_id, 'worker', 'started'), { invocation_sha256: invocation.invocation_sha256, identity: invocation.identity });
  retireCampaignDispatch(f.input);
  const instant = new Date(Date.now() + 60_000); const now = () => instant;
  expect(observeCampaignReclaimEligibility({ ...f.input, now }).evidence.runtime_effect_inactive).toBeNull();
  expect(() => recoverCampaignDispatch({ ...f.input, now })).toThrow('without a persisted final');
  expect(readLease(f.root, f.envelope.task_id).record!.generation).toBe(f.envelope.generation);
}, 60_000);

test('two OS recovery callers without a final cannot mint any next generation', async () => {
  const f = await acquired();
  writeFileSync(join(f.envelope.worktree_path, 'selector.json'), JSON.stringify(f.input.selector));
  const args = [process.execPath, join(import.meta.dir, '../../scripts/contract-run.ts'), 'recover', '--repo', f.envelope.worktree_path,
    '--campaign-handoff', 'selector.json', '--campaign-parent-host', f.input.host, '--campaign-parent-session', f.input.session_id, '--json'];
  const invoke = async () => {
    const child = Bun.spawn(args, { cwd: f.envelope.worktree_path, env: f.env, stdout: 'pipe', stderr: 'pipe' });
    const output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { exit: await child.exited, output: (await output).join('\n') };
  };
  for (const result of await Promise.all([invoke(), invoke()])) {
    expect(result.exit).not.toBe(0); expect(result.output).toContain('without a persisted final');
  }
  expect(readLease(f.root, f.envelope.task_id).record!.generation).toBe(f.envelope.generation);
}, 60_000);

test('a durable final interrupted before settlement is charged once after exact rebind', async () => {
  const f = await acquired(); const env = installProviderFixture(f);
  const worktree = f.envelope.worktree_path;
  await runHistoricalProvider(f, env, 'pass', false);
  const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env }).budget;
  expect(readAutomationBudgetStatus(f.root, budget.automation_run_id, f.env).current.open_reservation_sha256s).toHaveLength(1);
  const instant = new Date(Date.now() + 60_000); const now = () => instant;
  expect(recoverCampaignDispatch({ ...f.input, now }).disposition).toBe('settled_final');
  const settled = readAutomationBudgetStatus(f.root, budget.automation_run_id, f.env).current;
  expect(settled.open_reservation_sha256s).toHaveLength(0);
  recoverCampaignDispatch({ ...f.input, now });
  expect(readAutomationBudgetStatus(f.root, budget.automation_run_id, f.env).current).toEqual(settled);
}, 60_000);

/** Run model-free provider processes, then install their observed historical journal facts. */
async function runHistoricalProvider(f: Awaited<ReturnType<typeof acquired>>, env: NodeJS.ProcessEnv, verdict: 'pass' | 'fail', settle: boolean) {
  const attempt = installHistoricalAttempt(f, f.historical);
  const worktree = f.envelope.worktree_path;
  for (const role of ['worker', 'verifier'] as const) {
    writeFileSync(join(worktree, `${role}.prompt.md`), 'Fixture prompt');
    const invocation = await prepareHistoricalCodexInvocation({ deadline_ms: Date.now() + 10000,  repo_root: f.root, worktree, prompt_path: `${role}.prompt.md`, env,
      identity: { dispatch_id: f.input.selector.dispatch_id, claim_id: f.envelope.claim_id, lease_generation: f.envelope.generation,
        task_id: f.envelope.task_id, task_revision: f.envelope.task_revision, binding_generation: f.historical.acquired.offer.binding_generation, role } });
    const child = spawnSync(process.execPath, [join(import.meta.dir, '../../scripts/run-bounded-verifier-command.ts'), '--deadline-ms', String(Date.now() + 10_000),
      '--log', join(worktree, `${role}.stdout`), '--stderr-log', join(worktree, `${role}.stderr`), '--result', join(worktree, `${role}.result`),
      '--', join(env.PATH!.split(':')[0]!, 'codex'), ...invocation.argv], { cwd: worktree, env: { ...env, CONTRACT_RUN_ROLE: role, CONTRACT_RUN_ATTEMPT_RESULT: 'final.json' }, encoding: 'utf8' });
    expect(child.status, child.stderr).toBe(0);
    installHistoricalChild(f, f.historical, invocation, { ...JSON.parse(readFileSync(join(worktree, `${role}.result`), 'utf8')), role,
      command: `codex-exec:${role}`, stdout_path: `${role}.stdout`, stderr_path: `${role}.stderr` });
  }
  return installHistoricalFinal(f, f.historical, attempt, 'final.json', settle, { status: verdict, failure_class: verdict === 'pass' ? null : 'contract_failed' });
}

test('two OS callers settle the historical final under one recovered generation', async () => {
  const f = await acquired(); const env = installProviderFixture(f);
  await runHistoricalProvider(f, env, 'pass', false);
  const instant = new Date(Date.now() + 60_000).toISOString();
  const entry = join(import.meta.dir, '../../src/effects/automation/campaign-recovery.ts');
  const invoke = async () => {
    const child = Bun.spawn([process.execPath, '-e', `
      import { recoverCampaignDispatch } from ${JSON.stringify(entry)};
      console.log(JSON.stringify(recoverCampaignDispatch({ ...${JSON.stringify(f.input)}, now: () => new Date(${JSON.stringify(instant)}) })));
    `], { cwd: f.root, env: { ...f.env, REPO_HARNESS_HOME: process.env.REPO_HARNESS_HOME }, stdout: 'pipe', stderr: 'pipe' });
    const output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { exit: await child.exited, output: await output };
  };
  const results = await Promise.all([invoke(), invoke()]);
  for (const result of results) expect(result.exit, result.output.join('\n')).toBe(0);
  const recovered = results.map(result => JSON.parse(result.output[0]!));
  const owner = readLease(f.root, f.envelope.task_id).record!;
  expect(owner.generation).toBe(f.envelope.generation + 1);
  expect(new Set(recovered.map(result => result.envelope.claim_id))).toEqual(new Set([owner.claim_id]));
  for (const result of recovered) expect(result.disposition).toBe('settled_final');
}, 60_000);

test.each([false, true])('known failed child settles once without writable rebind, expired=%s', async expired => {
  const f = await acquired(); const env = installProviderFixture(f);
  const attempt = installHistoricalAttempt(f, f.historical);
  const worktree = f.envelope.worktree_path;
  writeFileSync(join(worktree, 'failed.prompt'), 'fixture');
  const invocation = await prepareHistoricalCodexInvocation({ repo_root: f.root, worktree, prompt_path: 'failed.prompt', env, deadline_ms: Date.now() + 10000,
    identity: { dispatch_id: f.input.selector.dispatch_id, role: 'worker', task_id: f.envelope.task_id, task_revision: f.envelope.task_revision,
      claim_id: f.envelope.claim_id, lease_generation: f.envelope.generation, binding_generation: f.historical.acquired.offer.binding_generation } });
  const result = spawnSync(process.execPath, [join(import.meta.dir, '../../scripts/run-bounded-verifier-command.ts'), '--deadline-ms', expired ? '1' : String(Date.now() + 3000),
    '--log', join(worktree, 'failed.out'), '--stderr-log', join(worktree, 'failed.err'), '--result', join(worktree, 'failed.result'), '--', '/bin/sh', '-c', 'exit 7']);
  expect(result.status).toBe(expired ? 124 : 7);
  installHistoricalChild(f, f.historical, invocation, { ...JSON.parse(readFileSync(join(worktree, 'failed.result'), 'utf8')), role: 'worker', command: 'codex-exec:worker', stdout_path: 'failed.out', stderr_path: 'failed.err' });
  const before = readLease(f.root, f.envelope.task_id).record!;
  const recovered = recoverCampaignDispatch(f.input);
  expect(recovered.disposition).toBe('settled_failure_runtime_unresolved');
  writeFileSync(join(worktree, 'failure-selector.json'), JSON.stringify(f.input.selector));
  const cli = spawnSync(process.execPath, [join(import.meta.dir, '../../scripts/contract-run.ts'), 'recover', '--repo', worktree,
    '--campaign-handoff', 'failure-selector.json', '--campaign-parent-host', f.input.host, '--campaign-parent-session', f.input.session_id, '--json'], { env: f.env, encoding: 'utf8' });
  expect(cli.status).toBe(1); expect(JSON.parse(cli.stdout).disposition).toBe('settled_failure_runtime_unresolved');
  expect(recovered.final?.outcome).toBe('permanent_failure');
  expect(readLease(f.root, f.envelope.task_id).record).toEqual(before);
  const budget = readAutomationBudgetStatus(f.root, attempt.reservation.automation_run_id, f.env).current;
  expect(budget.open_reservation_sha256s).toHaveLength(0);
  recoverCampaignDispatch(f.input);
  expect(readAutomationBudgetStatus(f.root, attempt.reservation.automation_run_id, f.env).current).toEqual(budget);
}, 60000);


test.skipIf(!process.env.BRC_TEST_CONTAINER_IMAGE)('expired Docker handoff reconciles one charge without a terminal or a new owner', async () => {
  const { prepareCampaignCodexInvocation } = await import('../../src/effects/automation/campaign-runtime');
  const { reconcileAndRecoverCampaignDispatch } = await import('../../src/effects/automation/campaign-recovery');
  const f = await acquired(); const env = { ...installProviderFixture(f), BRC_CAMPAIGN_IMAGE: process.env.BRC_TEST_CONTAINER_IMAGE! };
  const attempt = installHistoricalAttempt(f, f.historical); const worktree = f.envelope.worktree_path;
  writeFileSync(join(worktree, 'lost.prompt'), 'fixture never started');
  const invocation = await prepareCampaignCodexInvocation({ repo_root: f.root, worktree, prompt_path: 'lost.prompt', env, deadline_ms: Date.now() + 10000,
    identity: { dispatch_id: f.input.selector.dispatch_id, role: 'worker', task_id: f.envelope.task_id, task_revision: f.envelope.task_revision,
      claim_id: f.envelope.claim_id, lease_generation: f.envelope.generation, binding_generation: f.historical.acquired.offer.binding_generation } });
  try {
    persistPlanningRecord(f.root, f.intent, campaignRuntimeRecordKey(f.input.selector.dispatch_id, 'worker', 'intent'), invocation);
    persistPlanningRecord(f.root, f.intent, campaignRuntimeRecordKey(f.input.selector.dispatch_id, 'worker', 'started'), { invocation_sha256: invocation.invocation_sha256, identity: invocation.identity });
    await expect(reconcileAndRecoverCampaignDispatch({ ...f.input, env })).rejects.toThrow('expired invocation');
    const owner = readLease(f.root, f.envelope.task_id).record;
    while (Date.now() < invocation.deadline_ms + 100) await Bun.sleep(20);
    const result = await reconcileAndRecoverCampaignDispatch({ ...f.input, env });
    expect(result.disposition).toBe('controller_interrupted_reconciliation_required');
    expect(result.final!.outcome).toBe('reconciliation_required');
    expect(result.final!.contract_run.status).toBe('fail');
    expect(readLease(f.root, f.envelope.task_id).record).toEqual(owner);
    const budget = readAutomationBudgetStatus(f.root, attempt.reservation.automation_run_id, f.env).current;
    expect(budget.open_reservation_sha256s).toHaveLength(0);
    expect(await reconcileAndRecoverCampaignDispatch({ ...f.input, env })).toEqual(result);
    expect(readAutomationBudgetStatus(f.root, attempt.reservation.automation_run_id, f.env).current).toEqual(budget);
    expect(readLease(f.root, f.envelope.task_id).record).toEqual(owner);
    const observation = JSON.parse(readFileSync(join(invocation.container.directory, 'interrupted.json'), 'utf8'));
    expect(observation.output_complete).toBe(false);
    expect(existsSync(join(invocation.container.directory, 'start.json'))).toBe(false);
    expect(existsSync(join(invocation.container.directory, 'terminal.json'))).toBe(false);
  } finally {
    for (const handle of [invocation.container, invocation.probe.container]) {
      expect(Bun.spawnSync(['docker', '--host', handle.endpoint, 'rm', '-f', handle.container_id], { timeout: 5000 }).exitCode).toBe(0);
    }
  }
}, 40000);

test('preparation without protected inactivity never authorizes reclaim', async () => {
  const f = await acquired();
  const work = f.envelope;
  persistPlanningRecord(f.root, f.intent, campaignRuntimeRecordKey(f.input.selector.dispatch_id, 'worker', 'preparation'), {
    deadline_ms: Date.now() + 10000,
    identity: { dispatch_id: f.input.selector.dispatch_id, role: 'worker', task_id: work.task_id,
      task_revision: work.task_revision, claim_id: work.claim_id, lease_generation: work.generation,
      binding_generation: f.historical.acquired.offer.binding_generation },
  });
  retireCampaignDispatch(f.input);
  const receipt = observeCampaignReclaimEligibility({ ...f.input, now: () => new Date(Date.now() + 60000) });
  expect(receipt.classification).not.toBe('reclaimable');
  expect(readLease(f.root, work.task_id).record?.claim_id).toBe(work.claim_id);
});

for (const createdCount of [1, 2]) test.skipIf(!process.env.BRC_TEST_CONTAINER_IMAGE)(`prepareChild controller death after container ${createdCount} recovers original preparation without charge`, async () => {
  const { reconcileAndRecoverCampaignDispatch } = await import('../../src/effects/automation/campaign-recovery');
  const { campaignContainerDirectory } = await import('../../src/effects/automation/campaign-container');
  const f = await acquired(); const env = { ...installProviderFixture(f), BRC_CAMPAIGN_IMAGE: process.env.BRC_TEST_CONTAINER_IMAGE! };
  const worktree = f.envelope.worktree_path; writeFileSync(join(worktree, 'lost.prompt'), 'no model launch');
  const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env }).budget;
  const before = readAutomationBudgetStatus(f.root, budget.automation_run_id, env).current;
  const owner = readLease(f.root, f.envelope.task_id).record;
  const input = { selector: f.input.selector, worktree, contract: f.envelope.plan.contract_path,
    worker_command: 'codex-exec:worker', verifier_command: 'codex-exec:verifier', provider: 'codex-exec', env };
  const deadline = Date.now() + 10000;
  const identity = { dispatch_id: f.input.selector.dispatch_id, role: 'worker', task_id: f.envelope.task_id,
    task_revision: f.envelope.task_revision, claim_id: f.envelope.claim_id, lease_generation: f.envelope.generation,
    binding_generation: f.historical.acquired.offer.binding_generation };
  const directories = [{ ...identity, phase: 'version' }, identity].map(i => campaignContainerDirectory(join(f.root, '.git'), i));
  // A disposable historical fixture bypasses admission only in this subprocess;
  // the actual runtime, journal publication and consumer remain unmocked.
  const code = `import * as fs from 'fs'; import { mock } from 'bun:test';
    const link=fs.linkSync;let created=0;
    mock.module('fs',()=>({...fs,linkSync(from,to){link(from,to);if(String(to).endsWith('/created.json')&&++created===${createdCount})process.kill(process.pid,'SIGKILL')}}));
    mock.module(${JSON.stringify(join(import.meta.dir, '../../src/effects/automation/campaign-revision-admission'))},()=>({requireCampaignActiveAdmission(){}}));
    const {bindCampaignWorker}=await import(${JSON.stringify(join(import.meta.dir, '../../src/effects/automation/campaign-worker'))});
    await bindCampaignWorker(${JSON.stringify(input)}).prepareChild('worker','lost.prompt',${deadline});`;
  const child = Bun.spawn([process.execPath, '-e', code], { env: { ...process.env }, stdout: 'ignore', stderr: 'pipe' });
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
  try {
    expect(await child.exited, await new Response(child.stderr).text()).toBe(137);
    clearTimeout(timer);
    expect(readPlanningRecord(f.root, f.intent, campaignRuntimeRecordKey(f.input.selector.dispatch_id, 'worker', 'preparation'))).not.toBeNull();
    expect(readPlanningRecord(f.root, f.intent, campaignRuntimeRecordKey(f.input.selector.dispatch_id, 'worker', 'intent'))).toBeNull();
    await expect(reconcileAndRecoverCampaignDispatch({ ...f.input, env })).rejects.toThrow('expired');
    while (Date.now() <= deadline) await Bun.sleep(20);
    const result = await reconcileAndRecoverCampaignDispatch({ ...f.input, env });
    expect(result.disposition).toBe('preparation_interrupted_reconciliation_required');
    expect(result.final).toBeNull();
    expect(readAutomationBudgetStatus(f.root, budget.automation_run_id, env).current).toEqual(before);
    expect(readLease(f.root, f.envelope.task_id).record).toEqual(owner);
    expect(await reconcileAndRecoverCampaignDispatch({ ...f.input, env })).toEqual(result);
    expect(readAutomationBudgetStatus(f.root, budget.automation_run_id, env).current).toEqual(before);
  } finally {
    clearTimeout(timer); child.kill('SIGKILL'); await child.exited;
    for (const directory of directories) {
      if (existsSync(join(directory, 'request.json'))) {
        const request = JSON.parse(readFileSync(join(directory, 'request.json'), 'utf8'));
        expect(Bun.spawnSync(['docker', '--host', request.endpoint, 'rm', '-f', request.name], { timeout: 5000 }).exitCode).toBe(0);
      }
      rmSync(directory, { recursive: true, force: true });
    }
  }
}, 30000);

test.skipIf(!process.env.BRC_TEST_CONTAINER_IMAGE)('verifier preparation interruption settles the existing attempt once', async () => {
  const { prepareCampaignCodexInvocation } = await import('../../src/effects/automation/campaign-runtime');
  const { reconcileAndRecoverCampaignDispatch } = await import('../../src/effects/automation/campaign-recovery');
  const f = await acquired(); const env = { ...installProviderFixture(f), BRC_CAMPAIGN_IMAGE: process.env.BRC_TEST_CONTAINER_IMAGE! };
  const attempt = installHistoricalAttempt(f, f.historical); const worktree = f.envelope.worktree_path;
  writeFileSync(join(worktree, 'lost.prompt'), 'fixture never started');
  const invocation = await prepareCampaignCodexInvocation({ repo_root: f.root, worktree, prompt_path: 'lost.prompt', env, deadline_ms: Date.now() + 10000,
    identity: { dispatch_id: f.input.selector.dispatch_id, role: 'worker', task_id: f.envelope.task_id, task_revision: f.envelope.task_revision,
      claim_id: f.envelope.claim_id, lease_generation: f.envelope.generation, binding_generation: f.historical.acquired.offer.binding_generation } });
  const verifier = await prepareCampaignCodexInvocation({ repo_root: f.root, worktree, prompt_path: 'lost.prompt', env,
    deadline_ms: invocation.deadline_ms, identity: { ...invocation.identity, role: 'verifier' } });
  persistPlanningRecord(f.root, f.intent, campaignRuntimeRecordKey(f.input.selector.dispatch_id, 'verifier', 'preparation'), {
    identity: verifier.identity, deadline_ms: verifier.deadline_ms,
  });
  try {
    persistPlanningRecord(f.root, f.intent, campaignRuntimeRecordKey(f.input.selector.dispatch_id, 'worker', 'intent'), invocation);
    persistPlanningRecord(f.root, f.intent, campaignRuntimeRecordKey(f.input.selector.dispatch_id, 'worker', 'started'), { invocation_sha256: invocation.invocation_sha256, identity: invocation.identity });
    await expect(reconcileAndRecoverCampaignDispatch({ ...f.input, env })).rejects.toThrow('expired invocation');
    const owner = readLease(f.root, f.envelope.task_id).record;
    while (Date.now() < invocation.deadline_ms + 100) await Bun.sleep(20);
    const result = await reconcileAndRecoverCampaignDispatch({ ...f.input, env });
    expect(result.disposition).toBe('controller_interrupted_reconciliation_required');
    expect(result.final!.outcome).toBe('reconciliation_required');
    expect(result.final!.contract_run.status).toBe('fail');
    expect(readLease(f.root, f.envelope.task_id).record).toEqual(owner);
    const budget = readAutomationBudgetStatus(f.root, attempt.reservation.automation_run_id, f.env).current;
    expect(budget.open_reservation_sha256s).toHaveLength(0);
    expect(await reconcileAndRecoverCampaignDispatch({ ...f.input, env })).toEqual(result);
    expect(readAutomationBudgetStatus(f.root, attempt.reservation.automation_run_id, f.env).current).toEqual(budget);
    expect(readLease(f.root, f.envelope.task_id).record).toEqual(owner);
    const observation = JSON.parse(readFileSync(join(invocation.container.directory, 'interrupted.json'), 'utf8'));
    expect(observation.output_complete).toBe(false);
    expect(existsSync(join(invocation.container.directory, 'start.json'))).toBe(false);
    expect(existsSync(join(invocation.container.directory, 'terminal.json'))).toBe(false);
  } finally {
    for (const handle of [invocation.container, invocation.probe.container, verifier.container, verifier.probe.container]) {
      expect(Bun.spawnSync(['docker', '--host', handle.endpoint, 'rm', '-f', handle.container_id], { timeout: 5000 }).exitCode).toBe(0);
    }
  }
}, 40000);
