import { afterEach, describe, expect, mock, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { sealProgramAuthorization, validateAutomationReservation, type ProgramBudgetLimitV1 } from '../../src/core/automation/budget';
import { buildDevelopmentCampaignDefinition } from '../../src/core/automation/development-campaign';
import { buildIssueBatchIntent, renderIssueBatchMarker, type IssueBatchIntentV1 } from '../../src/core/automation/issue-batch';
import { buildExternalSourceRefreshReceipt, buildProviderIssueObservation } from '../../src/core/external-sources/issue-observation';
import { readBrowserBinding } from '../../src/cli/chatgpt-browser/binding';
import type { BrowserConsultInput, BrowserConsultResult } from '../../src/cli/chatgpt-browser/types';
import { AUTOMATION_BUDGET_STORE_RELATIVE_ROOT, reconcileAutomationReservation } from '../../src/effects/automation/budget-store';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';
import { appendDevelopmentCampaignEvent, createDevelopmentCampaign, readDevelopmentCampaignStatus } from '../../src/effects/automation/development-campaign-store';
import { startIssueBatchAuthoring } from '../../src/effects/automation/gpt-pro-issue-authoring';
import { CampaignStepError, runCampaignStep as runCampaignStepEffect, type CampaignStepDependencies } from '../../src/effects/automation/campaign-step';
import * as issueBatchStore from '../../src/effects/automation/issue-batch-store';
import { issueBatchGroupStoreRoot, listIssueBatchJournalRecords, persistIssueBatchIntent } from '../../src/effects/automation/issue-batch-store';
import type { IssueBatchObservationSnapshotV1 } from '../../src/effects/automation/issue-batch-observer';
import { writeProviderIssueObservation } from '../../src/effects/external-sources/store';

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

const realIssueBatchStore = { ...issueBatchStore };
let refuseJournalReservationAtRoot: string | null = null;
let hiddenJournalReads: { readonly root: string; reservations: number; results: number } | null = null;
mock.module('../../src/effects/automation/issue-batch-store', () => ({
  ...realIssueBatchStore,
  persistIssueBatchJournalRecord: (...args: Parameters<typeof issueBatchStore.persistIssueBatchJournalRecord>) => {
    if (args[0] === refuseJournalReservationAtRoot && args[3] === 'reservations') {
      refuseJournalReservationAtRoot = null;
      throw new Error('injected journal reservation refusal before persistence');
    }
    return realIssueBatchStore.persistIssueBatchJournalRecord(...args);
  },
  listIssueBatchJournalRecords: (...args: Parameters<typeof issueBatchStore.listIssueBatchJournalRecords>) => {
    const [root, , , category] = args;
    if (hiddenJournalReads?.root === root && category === 'reservations' && hiddenJournalReads.reservations > 0) {
      hiddenJournalReads.reservations -= 1;
      return Object.freeze([]);
    }
    if (hiddenJournalReads?.root === root && category === 'results' && hiddenJournalReads.results > 0) {
      hiddenJournalReads.results -= 1;
      return Object.freeze([]);
    }
    return realIssueBatchStore.listIssueBatchJournalRecords(...args);
  },
}));
afterEach(() => { hiddenJournalReads = null; refuseJournalReservationAtRoot = null; });
const at = '2026-09-05T00:00:00.000Z';
const later = '2026-09-05T00:10:00.000Z';
const browserDependencies = { readBinding: readBrowserBinding };
const defaultFollowup: CampaignStepDependencies['followup'] = async () => { throw new Error('test follow-up must be injected for an authoring action'); };

function runCampaignStep(input: Parameters<typeof runCampaignStepEffect>[0], deps: Partial<CampaignStepDependencies> = {}) {
  return runCampaignStepEffect(input, { ...browserDependencies, followup: defaultFollowup, ...deps });
}
const hex = (seed: string): string => new Bun.CryptoHasher('sha256').update(seed).digest('hex');
const limits: ProgramBudgetLimitV1 = { max_agent_turns: 10, max_successful_acquisitions: 2, max_runner_invocations: 10, max_provider_failures: 2, max_consecutive_no_progress_steps: 2, max_repair_cycles: 2, max_wall_clock_seconds: 3600, max_input_tokens: null, max_output_tokens: null, max_cost_micros: null };

function browserResult(input: BrowserConsultInput, sessionId: string, status: BrowserConsultResult['status'], verified = true): BrowserConsultResult {
  return {
    sessionId, status,
    paths: { sessionDir: sessionId, prompt: 'prompt.md', transcript: 'transcript.md', output: 'output.md', events: 'events.jsonl', artifactsDir: 'artifacts' },
    meta: { version: 1, sessionId, engine: 'chatgpt-browser', provider: 'oracle', status, repo: input.repoRoot, createdAt: at, updatedAt: at, model: { requested: input.model, verified }, browser: { mode: 'manual-login', transport: 'copy_profile', chatgptUrl: 'https://chatgpt.com/', profileDir: input.profileDir, profileDirectory: input.profileDirectory }, input: { promptPath: 'prompt.md', files: [], followups: 0 }, output: { outputPath: 'output.md', transcriptPath: 'transcript.md', artifactsDir: 'artifacts', artifacts: [] }, diagnostics: { dryRun: false, reattachable: true, lastCaptureAt: at } },
  };
}

async function fixture(status: BrowserConsultResult['status'] = 'completed') {
  const root = mkdtempSync(join(tmpdir(), 'campaign-step-'));
  const home = mkdtempSync(join(tmpdir(), 'campaign-step-home-'));
  const profile = mkdtempSync(join(tmpdir(), 'campaign-step-profile-'));
  roots.push(root, home, profile);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  mkdirSync(join(root, '.ai', 'harness'), { recursive: true });
  writeFileSync(join(root, '.ai', 'harness', 'policy.json'), `${JSON.stringify({
    development_campaign: { version: 1, mode: 'shadow', limits: { maximum_group_count: 1, maximum_issues_per_group: 2, maximum_parallel_tasks: 2 } },
    external_sources: { version: 1, mode: 'manual', github: { enabled: true, repository: 'acme/widgets', selection: { kind: 'labels', labels_all: ['campaign'], assignees_any: [] }, limits: { max_pages: 2, max_issues: 20, max_body_bytes: 8192, max_total_bytes: 65536, deadline_ms: 1000 } } },
  })}\n`);
  mkdirSync(join(root, '.repo-harness'), { recursive: true });
  writeFileSync(join(root, '.repo-harness', 'chatgpt-browser.local.json'), `${JSON.stringify({ version: 1, product: 'chatgpt', profileDir: profile, profileDirectory: 'Profile 1', selectedProfilePath: join(profile, 'Profile 1'), browserChannel: 'chrome', chatgptUrl: 'https://chatgpt.com/', updatedAt: at })}\n`);
  execFileSync('git', ['add', '.ai'], { cwd: root }); execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: root });
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const authorization = sealProgramAuthorization({ authorization_id: 'auth-1', repository_id: 'repo-1', target_ref: 'refs/heads/main', target_revision: revision, work_graph_revision: hex('work'), allowed_work_package_ids: ['campaign-1'], allowed_risk_tiers: ['low'], merge_mode: 'manual', allowed_merge_method: 'squash', max_repair_cycles: 2, budget: limits, contract_scope: 'contract_less', contract_path: null, campaign: { campaign_id: 'campaign-1', group_count: 1, issues_per_group: 2, allowed_issue_kinds: ['bugfix', 'test_gap'], max_parallel_tasks: 2, issue_author: 'gpt_pro', local_parent_host: 'codex', chrome_profile_directory: 'Profile 1', max_authoring_rounds_per_group: 5, require_fresh_main_audit: true }, issued_by: 'owner', issued_at: at, expires_at: '2027-09-05T00:00:00.000Z' });
  const env = { ...process.env, REPO_HARNESS_HOME: home };
  mintProgramAuthorization({ repo_root: root, authorization, env });
  const campaign = buildDevelopmentCampaignDefinition({ campaign_id: 'campaign-1', authorization_id: authorization.authorization_id, authorization_sha256: authorization.authorization_sha256, repository_id: authorization.repository_id, target_ref: authorization.target_ref, target_revision: authorization.target_revision, created_at: at });
  const created = createDevelopmentCampaign({ repo_root: root, campaign, idempotency_key: 'start', env });
  appendDevelopmentCampaignEvent({ repo_root: root, campaign_id: 'campaign-1', expected_current_sha256: created.current.current_sha256, idempotency_key: 'prepare', operation: 'prepare_group', observed_at: at, env });
  const started = await startIssueBatchAuthoring({ repo_root: root, campaign_id: 'campaign-1', group_number: 1, env }, { ...browserDependencies, now: () => at, consult: async (input) => browserResult(input, 'session-initial', status) });
  return { root, env, intent: started.intent };
}

function body(intent: IssueBatchIntentV1, slot: string, valid = true): string {
  const metadata = valid ? '\n```json\n{"protocol":1,"kind":"repo-harness-campaign-issue-metadata","issue_kind":"bugfix","primary_capability":"capability","priority":1,"depends_on_slots":[],"suspected_paths":["src/index.ts"]}\n```' : '';
  return `${renderIssueBatchMarker(intent.campaign_id, intent.group_number, slot)}${metadata}`;
}

function snapshot(intent: IssueBatchIntentV1, entries: readonly { id: string; number: number; slot: string; state?: 'open' | 'closed'; valid?: boolean; body_override?: string; display_ref_override?: string; url_override?: string }[], observedAt = later): IssueBatchObservationSnapshotV1 {
  const observations = entries.map((entry) => buildProviderIssueObservation({
    registered_repository_id: intent.repository_id, provider: 'github', provider_host: 'github.com', provider_repository_id: '100',
    provider_issue_id: entry.id, display_ref: entry.display_ref_override ?? `acme/widgets#${entry.number}`, url: entry.url_override ?? `https://github.com/acme/widgets/issues/${entry.number}`,
    observed_at: observedAt, provider_created_at: null, provider_updated_at: null, state: entry.state ?? 'open', title: 'repair', body: entry.body_override ?? body(intent, entry.slot, entry.valid ?? true),
    labels: ['campaign'], assignees: [], comments_policy: 'omitted', policy_revision: intent.authoring_policy_sha256, eligible: true, eligibility_reasons: [],
  }));
  const receipt = buildExternalSourceRefreshReceipt({
    receipt_id: `receipt-${hex(JSON.stringify([entries, observedAt])).slice(0, 12)}`, registered_repository_id: intent.repository_id, provider: 'github', provider_host: 'github.com',
    provider_repository_id: '100', provider_display_ref: intent.provider_repository, policy_revision: intent.authoring_policy_sha256,
    started_at: observedAt, completed_at: observedAt, outcome: 'complete', pages_fetched: 1, issues_seen: observations.length,
    observations_written: observations.length, limits: { max_pages: 2, max_issues: 20, max_body_bytes: 8192, max_total_bytes: 65536, deadline_ms: 1000 },
    source_revisions: observations.map((entry) => entry.source_revision).sort(), failure: null,
  });
  return Object.freeze({ receipt, observations: Object.freeze(observations) });
}

function input(f: Awaited<ReturnType<typeof fixture>>, key: string) {
  return { repo_root: f.root, campaign_id: 'campaign-1', group_number: 1, intent_sha256: f.intent.intent_sha256, idempotency_key: key, env: f.env };
}

describe('durable campaign heartbeat step', () => {
  test('retries the same authoring request after a pre-invocation journal refusal is reconciled not started', async () => {
    const f = await fixture(); let calls = 0;
    const deps = {
      now: () => new Date(later), observe: () => snapshot(f.intent, []),
      followup: async (request: BrowserConsultInput) => { calls += 1; return browserResult(request, 'replacement-session', 'completed'); },
    };
    refuseJournalReservationAtRoot = f.root;
    await expect(runCampaignStep(input(f, 'journal-refused'), deps)).rejects.toThrow('injected journal reservation refusal');
    expect(calls).toBe(0);
    expect(listIssueBatchJournalRecords(f.root, 'campaign-1', 1, 'reservations')).toHaveLength(0);
    const runs = join(f.root, '.git', AUTOMATION_BUDGET_STORE_RELATIVE_ROOT, 'runs');
    const reservationDir = join(runs, readdirSync(runs)[0]!, 'reservations');
    const records = readdirSync(reservationDir).filter((name) => name.endsWith('.json')).map((name) => validateAutomationReservation(JSON.parse(readFileSync(join(reservationDir, name), 'utf8'))));
    const held = records.find((record) => 'campaign_context' in record && record.campaign_context?.operation === 'fill_missing')!;
    expect(held).toBeDefined();
    await expect(runCampaignStep(input(f, 'journal-refused'), deps)).rejects.toThrow();
    expect(calls).toBe(0);
    reconcileAutomationReservation({ repo_root: f.root, reservation: held, resolution: 'reconciled_not_started', outcome: 'no_progress',
      reason: 'journal reservation refused before execute; provider invocation count is zero',
      evidence_refs: [{ ref: 'provider-run:journal-refused', sha256: hex('no-provider-invocation') }], env: f.env });
    const retried = await runCampaignStep(input(f, 'journal-refused'), deps);
    expect(retried.step_receipt).toMatchObject({ action: 'fill_missing', outcome: 'progress' });
    expect(calls).toBe(1);
    await runCampaignStep(input(f, 'journal-refused'), deps);
    expect(calls).toBe(1);
  });

  test('returns idle without a provider read for cancelled authoring', async () => {
    const f = await fixture('cancelled'); let observations = 0;
    const result = await runCampaignStep(input(f, 'idle-1'), { now: () => new Date(later), observe: () => { observations += 1; return snapshot(f.intent, []); } });
    expect(result.step_receipt).toMatchObject({ action: 'idle', outcome: 'idle', snapshot_receipt_sha256: null });
    expect(result.step_receipt.next_check_at).toBe('2026-09-05T00:11:00.000Z');
    expect(observations).toBe(0);
  });

  test('maps an expired intent to campaign_no_progress before expired authorization validation', async () => {
    const f = await fixture(); let observations = 0;
    const result = await runCampaignStep(input(f, 'expired-1'), { now: () => new Date('2028-09-05T00:00:00.000Z'), observe: () => { observations += 1; return snapshot(f.intent, []); } });
    expect(result.step_receipt).toMatchObject({ action: 'campaign_no_progress', outcome: 'no_progress' });
    expect(observations).toBe(0);
  });

  test('returns idle without provider access when an intent has no durable authoring session', async () => {
    const f = await fixture();
    rmSync(join(issueBatchGroupStoreRoot(f.root, 'campaign-1', 1), 'authoring-sessions'), { recursive: true, force: true });
    let observations = 0;
    const result = await runCampaignStep(input(f, 'no-session'), { now: () => new Date(later), observe: () => { observations += 1; return snapshot(f.intent, []); } });
    expect(result.step_receipt.action).toBe('idle');
    expect(observations).toBe(0);
  });

  test('reports source_main_stale before campaign authorization masks the moved ref', async () => {
    const f = await fixture();
    writeFileSync(join(f.root, 'moved.txt'), 'moved\n');
    execFileSync('git', ['add', 'moved.txt'], { cwd: f.root }); execFileSync('git', ['commit', '-qm', 'move main'], { cwd: f.root });
    await expect(runCampaignStep(input(f, 'stale-main'), { now: () => new Date(later), observe: () => snapshot(f.intent, []) })).rejects.toMatchObject({ code: 'source_main_stale' });
  });

  test('rejects an intent persisted under a group beyond the sealed grant before observation or mutation', async () => {
    const f = await fixture();
    const { protocol: _protocol, kind: _kind, intent_sha256: _digest, ...draft } = f.intent;
    const forged = buildIssueBatchIntent({ ...draft, group_number: 2 });
    persistIssueBatchIntent(f.root, forged);
    let observations = 0; let mutations = 0;
    await expect(runCampaignStep({ ...input(f, 'over-group'), group_number: 2, intent_sha256: forged.intent_sha256 }, {
      now: () => new Date(later), observe: () => { observations += 1; return snapshot(forged, []); }, mutate_issue: () => { mutations += 1; return { stdout: '{}' }; },
    })).rejects.toMatchObject({ code: 'campaign_step_invalid' });
    expect({ observations, mutations }).toEqual({ observations: 0, mutations: 0 });
  });

  test('persists before each missing-slot follow-up and replays an idempotency key without repeating its effect', async () => {
    const f = await fixture(); let followups = 0;
    const observed = snapshot(f.intent, [{ id: '201', number: 1, slot: '01' }]);
    const deps = { ...browserDependencies, now: () => new Date(later), observe: () => observed, followup: async (browserInput: Omit<BrowserConsultInput, 'sourceSessionId'> & { sessionId: string }) => { followups += 1; return browserResult(browserInput, 'session-fill', 'completed'); } };
    const first = await runCampaignStep(input(f, 'fill-1'), deps);
    expect(first.step_receipt).toMatchObject({ action: 'fill_missing', outcome: 'progress' });
    expect(first.reconciliation?.missing_slots).toEqual(['02']);
    expect(followups).toBe(1);
    expect(listIssueBatchJournalRecords(f.root, 'campaign-1', 1, 'reservations')).toHaveLength(1);
    expect(listIssueBatchJournalRecords(f.root, 'campaign-1', 1, 'results')).toHaveLength(1);
    await runCampaignStep(input(f, 'fill-1'), deps);
    expect(followups).toBe(1);
    const second = await runCampaignStep(input(f, 'fill-2'), deps);
    expect(second.step_receipt.action).toBe('fill_missing');
    expect(second.reconciliation?.missing_slots).toEqual(['02']);
    expect(followups).toBe(2);
  });

  test('comments and closes an unexpected issue across separate one-mutation steps', async () => {
    const f = await fixture();
    const observed = snapshot(f.intent, [{ id: '201', number: 1, slot: '01' }, { id: '202', number: 2, slot: '02' }, { id: '299', number: 99, slot: '99' }]);
    const calls: Array<{ action: string; issue_number: number; body: string | null }> = [];
    const deps = { now: () => new Date(later), observe: () => observed, mutate_issue: async (mutation: { repository: string; issue_number: number; action: 'comment' | 'close'; body: string | null }) => { calls.push(mutation); return { stdout: '{}' }; } };
    const commented = await runCampaignStep(input(f, 'orphan-comment'), deps);
    expect(commented.step_receipt.action).toBe('comment_unexpected');
    expect(calls).toEqual([expect.objectContaining({ action: 'comment', issue_number: 99 })]);
    const closed = await runCampaignStep(input(f, 'orphan-close'), deps);
    expect(closed.step_receipt.action).toBe('close_unexpected');
    expect(calls.map((entry) => entry.action)).toEqual(['comment', 'close']);
  });

  test('uses bounded default GitHub mutations and confirms not_planned before recording close', async () => {
    const f = await fixture();
    const observed = snapshot(f.intent, [{ id: '201', number: 1, slot: '01' }, { id: '202', number: 2, slot: '02' }, { id: '299', number: 99, slot: '99' }]);
    const calls: Array<{ args: readonly string[]; options: { timeout_ms: number; max_buffer: number } }> = [];
    const provider_command = (args: readonly string[], options: { timeout_ms: number; max_buffer: number }) => {
      calls.push({ args, options });
      return calls.length === 1
        ? { stdout: JSON.stringify({ id: 700, html_url: 'https://github.com/acme/widgets/issues/99#issuecomment-700' }) }
        : { stdout: JSON.stringify({ id: 299, number: 99, html_url: 'https://github.com/acme/widgets/issues/99', state: 'closed', state_reason: 'not_planned' }) };
    };
    await runCampaignStep(input(f, 'default-comment'), { now: () => new Date(later), observe: () => observed, provider_command });
    await runCampaignStep(input(f, 'default-close'), { now: () => new Date(later), observe: () => observed, provider_command });
    expect(calls[0]!.args).toEqual(['api', '--method', 'POST', 'repos/acme/widgets/issues/99/comments', '-f', expect.stringContaining('body=repo-harness campaign')]);
    expect(calls[1]!.args).toEqual(['api', '--method', 'PATCH', 'repos/acme/widgets/issues/99', '-f', 'state=closed', '-f', 'state_reason=not_planned']);
    expect(calls.every((entry) => entry.options.timeout_ms === 1000 && entry.options.max_buffer === 65537)).toBe(true);
  });

  test('a failed one-shot metadata edit becomes unfilled and is not retried', async () => {
    const f = await fixture(); let followups = 0;
    const observed = snapshot(f.intent, [{ id: '201', number: 1, slot: '01', valid: false }, { id: '202', number: 2, slot: '02' }]);
    const deps = { ...browserDependencies, now: () => new Date(later), observe: () => observed, followup: async (browserInput: Omit<BrowserConsultInput, 'sourceSessionId'> & { sessionId: string }) => { followups += 1; return browserResult(browserInput, 'session-edit-unverified', 'completed', false); } };
    const edited = await runCampaignStep(input(f, 'edit-invalid'), deps);
    expect(edited.step_receipt).toMatchObject({ action: 'edit_issue', outcome: 'no_progress' });
    const checked = await runCampaignStep(input(f, 'after-edit-failed'), deps);
    expect(checked.step_receipt.action).toBe('observe');
    expect(checked.reconciliation?.unfilled_slots).toEqual(['01']);
    expect(followups).toBe(1);
    expect(checked.step_receipt.next_check_at).toBeNull();
    const idle = await runCampaignStep(input(f, 'after-unfilled-settled'), { ...deps, observe: () => { throw new Error('settled repair must not re-observe'); } });
    expect(idle.step_receipt.action).toBe('idle');
  });

  test('does not repeat a completed failed edit that appears between decision reads and the journal fingerprint', async () => {
    const f = await fixture(); let followups = 0;
    const observed = snapshot(f.intent, [{ id: '201', number: 1, slot: '01', valid: false }, { id: '202', number: 2, slot: '02' }]);
    const deps = {
      ...browserDependencies, now: () => new Date(later), observe: () => observed,
      followup: async (browserInput: Omit<BrowserConsultInput, 'sourceSessionId'> & { sessionId: string }) => {
        followups += 1;
        return browserResult(browserInput, `session-edit-${followups}`, 'completed', false);
      },
    };
    await runCampaignStep(input(f, 'first-failed-edit'), deps);
    hiddenJournalReads = { root: f.root, reservations: 1, results: 1 };

    await expect(runCampaignStep(input(f, 'stale-edit-decision'), deps)).rejects.toMatchObject({ code: 'campaign_reconciliation_required' });
    expect(followups).toBe(1);
    expect(listIssueBatchJournalRecords(f.root, 'campaign-1', 1, 'reservations')).toHaveLength(1);
    expect(listIssueBatchJournalRecords(f.root, 'campaign-1', 1, 'results')).toHaveLength(1);
  });

  test('freezes the first post-repair observation and rejects later body changes', async () => {
    const f = await fixture();
    const before = snapshot(f.intent, [{ id: '201', number: 1, slot: '01', valid: false }]);
    before.observations.forEach((entry) => writeProviderIssueObservation(f.root, entry));
    await runCampaignStep(input(f, 'repair-baseline-edit'), { ...browserDependencies, now: () => new Date(later), observe: () => before, followup: async (browserInput: Omit<BrowserConsultInput, 'sourceSessionId'> & { sessionId: string }) => browserResult(browserInput, 'session-edit-unverified', 'completed', false) });
    const repairedInvalid = snapshot(f.intent, [{ id: '201', number: 1, slot: '01', body_override: `${renderIssueBatchMarker(f.intent.campaign_id, 1, '01')}\nstill invalid` }], '2026-09-05T00:11:00.000Z');
    repairedInvalid.observations.forEach((entry) => writeProviderIssueObservation(f.root, entry));
    const baseline = await runCampaignStep(input(f, 'repair-baseline-observe'), { ...browserDependencies, now: () => new Date('2026-09-05T00:11:00.000Z'), observe: () => repairedInvalid, followup: async (browserInput: Omit<BrowserConsultInput, 'sourceSessionId'> & { sessionId: string }) => browserResult(browserInput, 'session-fill-after-repair', 'completed') });
    expect(baseline.reconciliation?.unfilled_slots).toEqual(['01']);
    const laterChanged = snapshot(f.intent, [{ id: '201', number: 1, slot: '01', valid: true }], '2026-09-05T00:12:00.000Z');
    laterChanged.observations.forEach((entry) => writeProviderIssueObservation(f.root, entry));
    await expect(runCampaignStep(input(f, 'repair-later-change'), { now: () => new Date('2026-09-05T00:12:00.000Z'), observe: () => laterChanged })).rejects.toMatchObject({ code: 'issue_source_drift' });
  });

  test('recovers a completed result whose final step receipt was interrupted without repeating the mutation', async () => {
    const f = await fixture(); let followups = 0;
    const observed = snapshot(f.intent, [{ id: '201', number: 1, slot: '01' }]);
    const deps = { ...browserDependencies, now: () => new Date(later), observe: () => observed, followup: async (browserInput: Omit<BrowserConsultInput, 'sourceSessionId'> & { sessionId: string }) => { followups += 1; return browserResult(browserInput, 'session-fill-complete', 'completed'); } };
    await runCampaignStep(input(f, 'receipt-crash'), deps);
    const receiptDirectory = join(issueBatchGroupStoreRoot(f.root, 'campaign-1', 1), 'heartbeat', 'receipts');
    for (const name of readdirSync(receiptDirectory)) rmSync(join(receiptDirectory, name));
    const recovered = await runCampaignStep(input(f, 'receipt-crash'), { ...deps, observe: () => { throw new Error('provider must not be read during receipt recovery'); } });
    expect(recovered.step_receipt.action).toBe('fill_missing');
    expect(followups).toBe(1);
  });

  test('leaves an unknown mutation reserved and blocks any blind retry or new provider read', async () => {
    const f = await fixture();
    const observed = snapshot(f.intent, [{ id: '201', number: 1, slot: '01' }]);
    await expect(runCampaignStep(input(f, 'unknown-fill'), { ...browserDependencies, now: () => new Date(later), observe: () => observed, followup: async () => { throw new Error('browser transport disconnected'); } })).rejects.toMatchObject({ code: 'campaign_step_mutation_failed' });
    let observations = 0;
    try {
      await runCampaignStep(input(f, 'after-unknown'), { now: () => new Date(later), observe: () => { observations += 1; return observed; } });
      throw new Error('expected reconciliation requirement');
    } catch (error) {
      expect(error).toBeInstanceOf(CampaignStepError);
      expect((error as CampaignStepError).code).toBe('campaign_reconciliation_required');
      expect((error as CampaignStepError).receipt?.action).toBe('reconciliation_required');
    }
    expect(observations).toBe(0);
  });

  test('an unresolved mutation outranks a later intent expiry', async () => {
    const f = await fixture();
    const observed = snapshot(f.intent, [{ id: '201', number: 1, slot: '01' }]);
    await expect(runCampaignStep(input(f, 'unknown-before-expiry'), { ...browserDependencies, now: () => new Date(later), observe: () => observed, followup: async () => { throw new Error('unknown result'); } })).rejects.toMatchObject({ code: 'campaign_step_mutation_failed' });
    let observations = 0;
    await expect(runCampaignStep(input(f, 'expired-after-unknown'), { now: () => new Date('2028-09-05T00:00:00.000Z'), observe: () => { observations += 1; return observed; } })).rejects.toMatchObject({ code: 'campaign_reconciliation_required' });
    expect(observations).toBe(0);
  });

  test('CAS rejects a stale provider decision when another step advances the group journal', async () => {
    const f = await fixture(); let followups = 0;
    const missing = snapshot(f.intent, [{ id: '201', number: 1, slot: '01' }]);
    const complete = snapshot(f.intent, [{ id: '201', number: 1, slot: '01' }, { id: '202', number: 2, slot: '02' }]);
    let raced = false;
    try {
      await runCampaignStep(input(f, 'stale-observer'), {
        ...browserDependencies,
        now: () => new Date(later),
        observe: () => {
          if (!raced) {
            raced = true;
            void runCampaignStep(input(f, 'winning-observer'), { now: () => new Date(later), observe: () => complete });
          }
          return missing;
        },
        followup: async (browserInput: Omit<BrowserConsultInput, 'sourceSessionId'> & { sessionId: string }) => { followups += 1; return browserResult(browserInput, 'must-not-run', 'completed'); },
      });
      throw new Error('expected stale decision failure');
    } catch (error) {
      expect(error).toBeInstanceOf(CampaignStepError);
      expect((error as CampaignStepError).code).toBe('campaign_reconciliation_required');
    }
    expect(followups).toBe(0);
    expect(listIssueBatchJournalRecords(f.root, 'campaign-1', 1, 'reservations')).toHaveLength(0);
  });

  test('concurrent observation receipts with one idempotency key converge on the persisted receipt', async () => {
    const f = await fixture();
    const firstSnapshot = snapshot(f.intent, [{ id: '201', number: 1, slot: '01' }, { id: '202', number: 2, slot: '02' }], '2026-09-05T00:10:00.000Z');
    const secondSnapshot = snapshot(f.intent, [{ id: '301', number: 3, slot: '01' }, { id: '302', number: 4, slot: '02' }], '2026-09-05T00:10:01.000Z');
    let raced = false;
    const outer = await runCampaignStep(input(f, 'same-observation-key'), {
      now: () => new Date(later),
      observe: () => {
        if (!raced) {
          raced = true;
          void runCampaignStep(input(f, 'same-observation-key'), { now: () => new Date(later), observe: () => firstSnapshot });
        }
        return secondSnapshot;
      },
    });
    const stored = listIssueBatchJournalRecords(f.root, 'campaign-1', 1, 'receipts') as readonly { idempotency_key: string; step_receipt_sha256: string; reconciliation: { snapshot_receipt_sha256: string } | null }[];
    expect(stored.filter((entry) => entry.idempotency_key === 'same-observation-key')).toHaveLength(1);
    expect(outer.step_receipt.step_receipt_sha256).toBe(stored[0]!.step_receipt_sha256);
    expect(outer.reconciliation?.snapshot_receipt_sha256).toBe(firstSnapshot.receipt.receipt_sha256);
  });

  test('a no-mutation receipt cannot outrun an unresolved same-key reservation', async () => {
    const f = await fixture();
    const complete = snapshot(f.intent, [{ id: '201', number: 1, slot: '01' }, { id: '202', number: 2, slot: '02' }]);
    const unexpected = snapshot(f.intent, [{ id: '201', number: 1, slot: '01' }, { id: '202', number: 2, slot: '02' }, { id: '299', number: 99, slot: '99' }]);
    let raced = false;
    await expect(runCampaignStep(input(f, 'same-key-reservation'), {
      now: () => new Date(later),
      observe: () => {
        if (!raced) {
          raced = true;
          void runCampaignStep(input(f, 'same-key-reservation'), {
            now: () => new Date(later), observe: () => unexpected,
            mutate_issue: () => Promise.reject(new Error('provider result unknown')),
          }).catch(() => undefined);
        }
        return complete;
      },
    })).rejects.toMatchObject({ code: 'campaign_reconciliation_required' });
    expect(listIssueBatchJournalRecords(f.root, 'campaign-1', 1, 'reservations').filter((entry) => (entry as { idempotency_key: string }).idempotency_key === 'same-key-reservation')).toHaveLength(1);
    expect(listIssueBatchJournalRecords(f.root, 'campaign-1', 1, 'receipts').filter((entry) => (entry as { idempotency_key: string }).idempotency_key === 'same-key-reservation')).toHaveLength(0);
  });

  test('rejects an edit target whose URL number conflicts with its provider display ref before reservation or follow-up', async () => {
    const f = await fixture(); let followups = 0;
    const observed = snapshot(f.intent, [{ id: '201', number: 7, slot: '01', valid: false, display_ref_override: 'acme/widgets#8' }, { id: '202', number: 2, slot: '02' }]);
    await expect(runCampaignStep(input(f, 'reject-conflicting-edit-target'), {
      ...browserDependencies, now: () => new Date(later), observe: () => observed,
      followup: async (browserInput: Omit<BrowserConsultInput, 'sourceSessionId'> & { sessionId: string }) => { followups += 1; return browserResult(browserInput, 'must-not-run', 'completed'); },
    })).rejects.toMatchObject({ code: 'campaign_step_invalid' });
    expect(followups).toBe(0);
    expect(listIssueBatchJournalRecords(f.root, 'campaign-1', 1, 'reservations')).toHaveLength(0);
  });

  test('revalidates campaign state under the reservation lock after observation', async () => {
    const f = await fixture(); let followups = 0;
    const missing = snapshot(f.intent, [{ id: '201', number: 1, slot: '01' }]);
    await expect(runCampaignStep(input(f, 'stop-during-observe'), {
      ...browserDependencies,
      now: () => new Date(later),
      observe: () => {
        const status = readDevelopmentCampaignStatus(f.root, 'campaign-1', f.env);
        appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: 'campaign-1', expected_current_sha256: status.current.current_sha256, idempotency_key: 'stop-during-observe-event', operation: 'stop', observed_at: later, env: f.env });
        return missing;
      },
      followup: async (browserInput: Omit<BrowserConsultInput, 'sourceSessionId'> & { sessionId: string }) => { followups += 1; return browserResult(browserInput, 'must-not-run-after-stop', 'completed'); },
    })).rejects.toMatchObject({ code: 'campaign_step_invalid' });
    expect(followups).toBe(0);
    expect(listIssueBatchJournalRecords(f.root, 'campaign-1', 1, 'reservations')).toHaveLength(0);
  });
});
