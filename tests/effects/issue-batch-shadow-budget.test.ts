import { fixtureTemplate } from '../helpers/repo-fixture';
import { AUTOMATION_TEST_CLOCK_SEAM_ENV, __resetAutomationClockForTests, __setAutomationClockForTests } from '../../src/effects/automation/budget-store.internal';
import { afterAll, afterEach, expect, spyOn, test } from 'bun:test';
import * as fs from 'fs';
import { rmSync } from 'fs';
import { createAdoptionRepository } from '../helpers/campaign-adoption-repository';
import { makeSnapshot } from '../helpers/issue-batch-adoption-fixture';
import { adoptIssueBatch } from '../../src/effects/automation/issue-batch-adoption';
import { observeIssueBatch } from '../../src/effects/automation/issue-batch-observer';
import {
  appendAutomationUsage, ensureCampaignAuthoringBudget, readAutomationBudgetStatus, readCampaignAuthoringBudgetTerminal,
  readCampaignBudgetLedger, reserveCampaignAuthoringBudget,
  beginCampaignBudgetStep, completeCampaignBudgetStep, reserveCampaignProviderBudget, recordCampaignProviderOutcome,
} from '../../src/effects/automation/budget-store';
import { GithubAdapterError, type GithubCommandRunner } from '../../src/effects/external-sources/github';
const roots: string[] = [];
const templates = fixtureTemplate(createAdoptionRepository);
afterAll(() => templates.dispose());
let resetClock: (() => void) | undefined;
afterEach(() => {
  resetClock?.(); resetClock = undefined;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
async function fixture(rounds = 1, cap = 100, firstReadDelayMs = 0) {
  const f = await templates.materialize('shadow', rounds, undefined, {}, {}, { max_provider_calls: cap, github_deadline_ms: 20000 });
  f.resetCalls();
  roots.push(f.root, f.home);
  let clockMs = Date.now();
  if (firstReadDelayMs) {
    const previous = process.env[AUTOMATION_TEST_CLOCK_SEAM_ENV];
    process.env[AUTOMATION_TEST_CLOCK_SEAM_ENV] = '1';
    __setAutomationClockForTests(() => new Date(clockMs));
    resetClock = () => {
      __resetAutomationClockForTests();
      if (previous === undefined) delete process.env[AUTOMATION_TEST_CLOCK_SEAM_ENV];
      else process.env[AUTOMATION_TEST_CLOCK_SEAM_ENV] = previous;
    };
  }
  const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env }).budget;
  const binding = { repo_root: f.root, automation_run_id: budget.automation_run_id, expected_budget_sha256: budget.budget_sha256,
    campaign_id: f.intent.campaign_id, group_number: 1 as const, intent_sha256: f.intent.intent_sha256, env: f.env };
  const status = () => readAutomationBudgetStatus(f.root, budget.automation_run_id, f.env);
  let calls = 0; let slots = f.intent.slots as readonly string[];
  let failure: Error | null = null; let changeTitle = false;
  const runner: GithubCommandRunner = args => {
    expect(status().current.open_reservation_sha256s).toHaveLength(1);
    calls++;
    if (calls === 1) clockMs += firstReadDelayMs;
    if (failure) throw failure;
    if (args.includes('repos/acme/widgets')) return { stdout: JSON.stringify({ id: 100, full_name: 'acme/widgets', html_url: 'https://github.com/acme/widgets' }) };
    return { stdout: JSON.stringify(makeSnapshot(f.intent, slots).observations.map((o, i) => ({ id: i + 1, number: i + 1, html_url: o.url,
      state: o.state, title: changeTitle && calls > 2 ? 'changed title' : o.title, body: o.body, labels: [{ name: 'campaign' }], assignees: [] }))) };
  };
  const deps = { ...f.deps, runner, observe: observeIssueBatch,
    ...(firstReadDelayMs ? { now: () => new Date(clockMs) } : {}) };
  return { ...f, binding, status, ledger: () => readCampaignBudgetLedger(f.root, budget.automation_run_id, f.env),
    run: () => adoptIssueBatch({ ...f.input, dry_run: true }, deps), terminal: () => readCampaignAuthoringBudgetTerminal(binding),
    githubCalls: () => calls, setSlots: (value: readonly string[]) => { slots = value; },
    setFailure: (value: Error | null) => { failure = value; }, drift: () => { changeTitle = true; } };
}
test('shadow real observer reserves every identity/page call and seals the final full ledger', async () => {
  const f = await fixture(); const result = await f.run();
  expect(result.publication).toBeNull(); expect(f.githubCalls()).toBe(4);
  expect(f.ledger()).toMatchObject({ provider_calls: 6, active_step: null, controller_steps: 1 });
  expect(f.terminal()?.ledger_sha256).toBe(f.status().current.ledger_sha256);
  const before = f.status().current.ledger_sha256;
  expect(await f.run()).toEqual(result); expect(f.githubCalls()).toBe(4); expect(f.status().current.ledger_sha256).toBe(before);
}, 20000);
test('shadow rejects its old terminal after a completed same-group GitHub read', async () => {
  // This ledger assertion must survive a modeled read beyond the old one-second fixture window.
  const f = await fixture(1, 100, 1100);
  await f.run();
  const terminal = f.terminal()!;
  const binding = { repo_root: f.root, automation_run_id: terminal.automation_run_id, expected_budget_sha256: terminal.budget_sha256,
    campaign_id: f.intent.campaign_id, group_number: 1 as const, intent_sha256: f.intent.intent_sha256, env: f.env };
  const admission = beginCampaignBudgetStep({ ...binding, idempotency_key: 'later-read' }).admission;
  const leaf = reserveCampaignProviderBudget({ ...binding, idempotency_key: 'later-read-leaf', operation: 'github_read',
    step_admission_sha256: admission.event_sha256, request_sha256: 'a'.repeat(64) }).reservation;
  recordCampaignProviderOutcome({ repo_root: f.root, reservation: leaf, outcome: 'returned', result_sha256: 'b'.repeat(64), env: f.env });
  completeCampaignBudgetStep({ repo_root: f.root, admission, outcome: 'progress', evidence_refs: [{ ref: 'fixture:later-read', sha256: 'b'.repeat(64) }], env: f.env });
  expect(() => f.terminal()).toThrow('stale automation ledger');
  await expect(f.run()).rejects.toThrow('stale automation ledger');
  expect(f.githubCalls()).toBe(4);
}, 20000);
test('provider cap refuses a page before I/O and retry does not spend again', async () => {
  const f = await fixture(1, 3);
  await expect(f.run()).rejects.toThrow('provider_calls');
  expect(f.githubCalls()).toBe(1); expect(f.ledger().provider_calls).toBe(3); expect(f.terminal()).toBeNull();
  await expect(f.run()).rejects.toThrow('provider_calls'); expect(f.githubCalls()).toBe(1);
}, 20000);
test('typed read failure settles its leaf but unknown outcome stays open across retry', async () => {
  for (const known of [true, false]) {
    const f = await fixture(); f.setFailure(known ? new GithubAdapterError('network', 'typed read failure') : new Error('unknown runtime failure'));
    await expect(f.run()).rejects.toThrow();
    expect(f.status().current.open_reservation_sha256s).toHaveLength(known ? 0 : 1);
    expect(f.ledger().active_step === null).toBe(known);
    await expect(f.run()).rejects.toThrow(); expect(f.githubCalls()).toBe(1); expect(f.terminal()).toBeNull();
  }
}, 20000);
test('partial snapshot can retry only after a real authoring ledger change', async () => {
  const f = await fixture(3); f.setSlots(['01']);
  await expect(f.run()).rejects.toThrow('exhausted'); expect(f.ledger().active_step).toBeNull();
  await expect(f.run()).rejects.toThrow('exhausted'); expect(f.githubCalls()).toBe(2);
  const fill = reserveCampaignAuthoringBudget({ ...f.binding, operation: 'fill_missing', idempotency_key: 'fill' });
  appendAutomationUsage({ repo_root: f.root, reservation: fill.reservation, env: f.env, outcome: 'progress', evidence_refs: [{ ref: 'provider-run:fill', sha256: 'a'.repeat(64) }] });
  f.setSlots(f.intent.slots);
  expect((await f.run()).receipt.issues).toHaveLength(2); expect(f.githubCalls()).toBe(6); expect(f.calls()).toBe(1);
  expect(f.terminal()?.completed_authoring_rounds).toBe(2);
}, 20000);
test('title drift between snapshots fails without sealing and replay is zero-I/O', async () => {
  const f = await fixture(); f.drift();
  await expect(f.run()).rejects.toThrow('changed'); expect(f.terminal()).toBeNull();
  await expect(f.run()).rejects.toThrow('changed'); expect(f.githubCalls()).toBe(4);
}, 20000);
test('crash after durable completion resumes terminal creation without a provider call', async () => {
  const f = await fixture(); const link = fs.linkSync;
  const fault = spyOn(fs, 'linkSync').mockImplementation((from, to) => {
    if (String(to).includes('/campaign-terminals/')) throw new Error('injected terminal persistence failure');
    return link(from, to);
  });
  try { await expect(f.run()).rejects.toThrow('cannot persist campaign authoring terminal'); }
  finally { fault.mockRestore(); }
  expect(f.githubCalls()).toBe(4); expect(f.ledger().active_step).toBeNull(); expect(f.terminal()).toBeNull();
  expect((await f.run()).receipt.issues).toHaveLength(2); expect(f.githubCalls()).toBe(4);
  expect(f.terminal()?.ledger_sha256).toBe(f.status().current.ledger_sha256);
}, 20000);
