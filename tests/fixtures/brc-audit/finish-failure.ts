// Process-isolated finalization regression: admission and container producer facts
// are synthetic. Locking, terminal consumer, claims and budget stores are production code.
import { mock, expect } from 'bun:test';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'fs';
import { execFileSync, spawnSync } from 'child_process';
mock.module('../../../src/effects/automation/campaign-revision-admission', () => ({ requireCampaignActiveAdmission() {} }));
const { installHistoricalBoundDispatch, prepareHistoricalCodexInvocation, modeledContainerTerminal } = await import('../../helpers/historical-campaign-lifecycle');
const runtime = await import('../../../src/effects/automation/campaign-runtime');
mock.module('../../../src/effects/automation/campaign-runtime', () => ({ ...runtime, prepareCampaignCodexInvocation: prepareHistoricalCodexInvocation }));
const { bindCampaignWorker } = await import('../../../src/effects/automation/campaign-worker');
const { readAutomationBudgetStatus } = await import('../../../src/effects/automation/budget-store');
const { readTaskAutomationAttemptCurrent } = await import('../../../src/effects/engineers/automation-attempt-store');
const f: Parameters<typeof installHistoricalBoundDispatch>[0] = JSON.parse(readFileSync(0, 'utf8'));
const acquired = installHistoricalBoundDispatch(f); const worktree = acquired.envelope.worktree_path;
try {
  const profiles = join(f.root, '.codex/agents'); mkdirSync(profiles, { recursive: true });
  for (const [name, sandbox] of [['fast-worker', 'workspace-write'], ['gatekeeper', 'read-only']]) writeFileSync(join(profiles, `${name}.toml`), `model="fixture"\nsandbox_mode="${sandbox}"\nmodel_reasoning_effort="high"\ndeveloper_instructions="fixture"\n`);
  execFileSync('git', ['add', '.codex/agents'], { cwd: f.root });
  const bin = join(f.home, 'bin'); mkdirSync(bin);
  const codex = join(bin, 'codex'); writeFileSync(codex, '#!/bin/sh\necho codex-cli 1.0.0\n'); chmodSync(codex, 0o700);
  const env = { ...f.env, PATH: `${bin}:${process.env.PATH}` };
  const input = { selector: acquired.worker_handoff, worktree, contract: acquired.envelope.plan.contract_path,
    worker_command: 'codex-exec:worker', verifier_command: 'codex-exec:verifier', provider: 'codex-exec' as const, env };
  const worker = bindCampaignWorker(input);
  const failure = process.argv[2];
  for (const role of ['worker', 'verifier'] as const) {
    writeFileSync(join(worktree, `${role}.prompt`), 'fixture');
    const invocation = await worker.prepareChild(role, `${role}.prompt`, Date.now() + 10000);
    worker.beforeChild(role, input[role === 'worker' ? 'worker_command' : 'verifier_command']);
    const nonzero = failure === 'worker_nonzero' && role === 'worker';
    const text = role === 'verifier' ? JSON.stringify({ verdict: 'fail', review: 'fixture' }) : 'done';
    const events = [{ type: 'thread.started', thread_id: 'fixture' }, { type: 'item.completed', item: { id: 'message', type: 'agent_message', text } }, { type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }];
    const child = spawnSync(process.execPath, [join(import.meta.dir, '../../../scripts/run-bounded-verifier-command.ts'), '--deadline-ms', String(Date.now() + 10000),
      '--log', join(worktree, `${role}.out`), '--stderr-log', join(worktree, `${role}.err`), '--result', join(worktree, `${role}.result`), '--', process.execPath, '-e',
      nonzero ? 'process.exit(7)' : `console.log(${JSON.stringify(events.map(e => JSON.stringify(e)).join('\n'))})`], { cwd: worktree });
    expect(child.status).toBe(nonzero ? 7 : 0);
    const observation = JSON.parse(readFileSync(join(worktree, `${role}.result`), 'utf8'));
    const container_receipt_sha256 = modeledContainerTerminal(invocation!.container, readFileSync(join(worktree, `${role}.out`), 'utf8'), readFileSync(join(worktree, `${role}.err`), 'utf8'), observation);
    worker.afterChild({ container_receipt_sha256, ...JSON.parse(readFileSync(join(worktree, `${role}.result`), 'utf8')), role, command: input[role === 'worker' ? 'worker_command' : 'verifier_command'], stdout_path: `${role}.out`, stderr_path: `${role}.err` });
    if (nonzero) break;
  }
  if (failure !== 'verifier_without_result') writeFileSync(join(worktree, 'final.json'), JSON.stringify({ outcome: 'completed', evidence_paths: ['src/index.ts'] }));
  const final = worker.finish('final.json', { status: 'fail', failure_class: failure });
  expect(final.contract_run.status).toBe('fail'); expect(final.outcome).toBe('permanent_failure');
  const budget = readAutomationBudgetStatus(f.root, final.reservation.automation_run_id, env).current;
  expect(budget.open_reservation_sha256s).toHaveLength(0);
  expect(bindCampaignWorker(input).replay).toEqual(final);
  expect(readAutomationBudgetStatus(f.root, final.reservation.automation_run_id, env).current).toEqual(budget);
  expect(readTaskAutomationAttemptCurrent(f.root, acquired.acquired.offer.work_package_id, acquired.acquired.offer.work_package_revision)?.last_outcome).toBe('permanent_failure');
  console.log('actual finish(fail) settled and replayed');
} finally { for (const root of [worktree, f.root, f.home]) rmSync(root, { recursive: true, force: true }); }
