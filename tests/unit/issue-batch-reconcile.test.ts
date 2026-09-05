import { describe, expect, test } from 'bun:test';

import { messageSha256 } from '../../src/core/messages/mechanics';
import { buildIssueBatchIntent, renderIssueBatchMarker, type IssueBatchSlot } from '../../src/core/automation/issue-batch';
import {
  IssueBatchReconcileError,
  parseIssueBatchMetadata,
  reconcileIssueBatchSlots,
} from '../../src/core/automation/issue-batch-reconcile';
import {
  buildExternalSourceRefreshReceipt,
  buildProviderIssueObservation,
} from '../../src/core/external-sources/issue-observation';

const BASE = 'a'.repeat(40);
const POLICY = messageSha256('policy');

function intent(slotCount = 2) {
  return buildIssueBatchIntent({
    campaign_id: 'campaign-1', group_number: 1, repository_id: 'repo-1', provider_repository: 'acme/widgets',
    target_ref: 'refs/heads/main', base_main_sha: BASE, slots: Array.from({ length: slotCount }, (_, index) => String(index + 1).padStart(2, '0')) as IssueBatchSlot[], allowed_issue_kinds: ['bugfix', 'test_gap'],
    prompt_sha256: messageSha256('prompt'), authoring_policy_sha256: POLICY, authoring_parent: 'codex', gpt_pro_transport: 'oracle_browser',
    browser_transport: 'copy_profile', chrome_profile_directory: 'Profile-13', created_at: '2026-09-05T00:00:00.000Z', expires_at: '2026-09-06T00:00:00.000Z',
  });
}

function body(slot: string, metadata = true): string {
  const marker = renderIssueBatchMarker('campaign-1', 1, slot);
  return metadata ? `${marker}\n\n\`\`\`json\n{"protocol":1,"kind":"repo-harness-campaign-issue-metadata","issue_kind":"bugfix","primary_capability":"runtime.harness","priority":50,"depends_on_slots":[],"suspected_paths":["src/core"]}\n\`\`\`` : marker;
}

function observation(id: string, issueBody: string, overrides: Record<string, unknown> = {}) {
  return buildProviderIssueObservation({
    registered_repository_id: 'repo-1', provider: 'github', provider_host: 'github.com', provider_repository_id: '101', provider_issue_id: id,
    display_ref: `#${id}`, url: `https://github.com/acme/widgets/issues/${id}`, observed_at: '2026-09-05T01:00:00.000Z',
    provider_created_at: '2026-09-05T00:00:00.000Z', provider_updated_at: '2026-09-05T01:00:00.000Z', state: 'open', title: 'display only', body: issueBody,
    labels: [], assignees: [], comments_policy: 'omitted', policy_revision: POLICY, eligible: true, eligibility_reasons: [], ...overrides,
  });
}

function receipt(observations: readonly ReturnType<typeof observation>[], outcome: 'complete' | 'incomplete' | 'unavailable' = 'complete', issuesSeen = observations.length, providerDisplayRef = 'acme/widgets') {
  return buildExternalSourceRefreshReceipt({
    receipt_id: 'receipt-1', registered_repository_id: 'repo-1', provider: 'github', provider_host: 'github.com', provider_repository_id: '101',
    provider_display_ref: providerDisplayRef, policy_revision: POLICY, started_at: '2026-09-05T01:00:00.000Z', completed_at: '2026-09-05T01:00:01.000Z',
    outcome, pages_fetched: outcome === 'complete' ? 1 : 0, issues_seen: issuesSeen, observations_written: observations.length,
    limits: { max_pages: 10, max_issues: 100, max_body_bytes: 100_000, max_total_bytes: 1_000_000, deadline_ms: 1_000 },
    source_revisions: observations.map((entry) => entry.source_revision).sort(), failure: outcome === 'complete' ? null : { class: 'network', message: 'provider unavailable' },
  });
}

describe('BRC5 issue batch reconciliation', () => {
  test('accepts only one exact strict metadata fence', () => {
    expect(parseIssueBatchMetadata(body('01'))).toMatchObject({ issue_kind: 'bugfix', priority: 50 });
    expect(parseIssueBatchMetadata(`${body('01')}\n\`\`\`json\n{}\n\`\`\``)).toBeNull();
    expect(parseIssueBatchMetadata(`${renderIssueBatchMarker('campaign-1', 1, '01')}\n\`\`\`json\n{"protocol":1,"kind":"repo-harness-campaign-issue-metadata","issue_kind":"bugfix","primary_capability":"runtime","priority":50,"depends_on_slots":[],"suspected_paths":[],"extra":true}\n\`\`\``)).toBeNull();
  });

  test('projects deterministic complete, missing, unfilled and invalid slots with immutable digests', () => {
    const first = observation('1', body('01'));
    const second = observation('2', body('02', false));
    const result = reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([first, second]), observations: [second, first], repair_exhausted_slots: ['02'], current_main_sha: BASE });
    expect(result.slots).toEqual([
      expect.objectContaining({ slot: '01', state: 'complete', provider_issue_id: '1' }),
      expect.objectContaining({ slot: '02', state: 'unfilled', provider_issue_id: '2' }),
    ]);
    expect(result.unfilled_slots).toEqual(['02']);
    expect(result.outcome).toBe('incomplete');
    expect(result.observation_sha256s).toEqual([first.observation_sha256, second.observation_sha256].sort());
    expect(result.reconciliation_sha256).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  test('accepts a complete snapshot whose provider listing saw pull requests that cannot produce observations', () => {
    const first = observation('1', body('01'));
    const result = reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([first], 'complete', 2), observations: [first] });
    expect(result.missing_slots).toEqual(['02']);
  });

  test('distinguishes a ten-slot complete batch from the missing 08..10 tail', () => {
    const ten = Array.from({ length: 10 }, (_, index) => observation(String(index + 1), body(String(index + 1).padStart(2, '0'))));
    expect(reconcileIssueBatchSlots({ intent: intent(10), snapshot_receipt: receipt(ten), observations: ten }).outcome).toBe('complete');
    const seven = ten.slice(0, 7);
    expect(reconcileIssueBatchSlots({ intent: intent(10), snapshot_receipt: receipt(seven), observations: seven }).missing_slots).toEqual(['08', '09', '10']);
  });

  test('fails closed for duplicate slots, provider availability, incomplete pages and stale main', () => {
    const first = observation('1', body('01'));
    const duplicate = observation('2', body('01'));
    expect(() => reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([first, duplicate]), observations: [first, duplicate] })).toThrow(IssueBatchReconcileError);
    expect(() => reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([], 'unavailable'), observations: [] })).toThrow('provider snapshot is unavailable');
    expect(() => reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([], 'incomplete'), observations: [] })).toThrow('provider snapshot is incomplete');
    expect(() => reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([first]), observations: [first], current_main_sha: 'b'.repeat(40) })).toThrow('main revision differs');
  });

  test('records undeclared same-group markers and treats valid prior body changes as source drift', () => {
    const current = observation('1', body('01'));
    const prior = observation('1', `${body('01')}\nprior content`, { observed_at: '2026-09-05T00:30:00.000Z', provider_updated_at: '2026-09-05T00:30:00.000Z' });
    const unexpected = observation('3', body('03'));
    expect(() => reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([current]), observations: [current], prior_observations: [prior] })).toThrow('body changed after observation');
    const result = reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([unexpected]), observations: [unexpected] });
    expect(result.unexpected_issue_ids).toEqual(['3']);
    expect(result.missing_slots).toEqual(['01', '02']);
  });

  test('ignores malformed and wrong campaign/group bodies, and ignores a closed unexpected orphan', () => {
    const malformed = observation('1', '<!-- repo-harness-campaign:v1\ncampaign_id=campaign-1\ngroup=1\nslot=01\nextra=x\n-->');
    const foreignCampaign = observation('2', body('01').replace('campaign-1', 'campaign-2'));
    const foreignGroup = observation('3', body('01').replace('group=1', 'group=2'));
    const closedUnexpected = observation('4', body('03'), { state: 'closed' });
    const result = reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([malformed, foreignCampaign, foreignGroup, closedUnexpected]), observations: [malformed, foreignCampaign, foreignGroup, closedUnexpected] });
    expect(result.missing_slots).toEqual(['01', '02']);
    expect(result.unexpected_issue_ids).toEqual([]);
  });

  test('allows only the parent-journalled repair of prior invalid metadata', () => {
    const current = observation('1', body('01'));
    const prior = observation('1', body('01', false), { observed_at: '2026-09-05T00:30:00.000Z', provider_updated_at: '2026-09-05T00:30:00.000Z' });
    expect(() => reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([current]), observations: [current], prior_observations: [prior] })).toThrow('body changed after observation');
    expect(reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([current]), observations: [current], prior_observations: [prior], repaired_issue_ids: ['1'] }).slots[0]).toMatchObject({ state: 'complete' });
  });

  test('accepts an authorized repair from a forbidden issue kind and still rejects unjournalled drift', () => {
    const restricted = buildIssueBatchIntent({ ...intent(1), allowed_issue_kinds: ['bugfix'] });
    const prior = observation('1', body('01').replace('"issue_kind":"bugfix"', '"issue_kind":"test_gap"'));
    expect(reconcileIssueBatchSlots({ intent: restricted, snapshot_receipt: receipt([prior]), observations: [prior] }).invalid_slots).toEqual(['01']);
    const repaired = observation('1', body('01'));
    const input = { intent: restricted, snapshot_receipt: receipt([repaired]), observations: [repaired], prior_observations: [prior] };
    expect(() => reconcileIssueBatchSlots(input)).toThrow('body changed after observation');
    expect(reconcileIssueBatchSlots({ ...input, repaired_issue_ids: ['1'] }).slots[0]).toMatchObject({ state: 'complete' });
    const stillInvalid = observation('1', `${prior.body}\nUnsuccessful repair`);
    expect(reconcileIssueBatchSlots({
      ...input, observations: [stillInvalid], snapshot_receipt: receipt([stillInvalid]),
      repaired_issue_ids: ['1'], repair_exhausted_slots: ['01'],
    }).slots[0]).toMatchObject({ state: 'unfilled' });
  });

  test('marks a designated repair unfilled when its edited metadata remains invalid', () => {
    const prior = observation('1', body('01', false));
    const failed = observation('1', `${body('01', false)}\nStill missing strict metadata`);
    const reconciled = reconcileIssueBatchSlots({
      intent: intent(), snapshot_receipt: receipt([failed]), observations: [failed],
      prior_observations: [prior], repaired_issue_ids: ['1'], repair_exhausted_slots: ['01'],
    });
    expect(reconciled.slots[0]).toMatchObject({ state: 'unfilled', provider_issue_id: '1' });
  });

  test('fails source drift for a marker change and a second edit after a repaired valid body', () => {
    const priorValid = observation('1', body('01'), { observed_at: '2026-09-05T00:30:00.000Z', provider_updated_at: '2026-09-05T00:30:00.000Z' });
    const movedMarker = observation('1', body('02'));
    expect(() => reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([movedMarker]), observations: [movedMarker], prior_observations: [priorValid] })).toThrow('body changed after observation');
    const repairedValid = observation('1', body('01'));
    const editedAgain = observation('1', `${body('01')}\nsecond edit`);
    expect(() => reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([editedAgain]), observations: [editedAgain], prior_observations: [repairedValid], repaired_issue_ids: ['1'] })).toThrow('body changed after observation');
  });

  test('rejects a provider receipt or issue observation with a foreign repository identity', () => {
    const first = observation('1', body('01'));
    expect(() => reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([first], 'complete', 1, 'other/widgets'), observations: [first] })).toThrow('not bound');
    const foreignRepository = observation('1', body('01'), { provider_repository_id: 'other' });
    expect(() => reconcileIssueBatchSlots({ intent: intent(), snapshot_receipt: receipt([foreignRepository]), observations: [foreignRepository] })).toThrow('not bound');
  });
});
