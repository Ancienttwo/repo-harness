import { buildProviderIssueObservation, buildExternalSourceRefreshReceipt } from '../../src/core/external-sources/issue-observation';
import { describe, expect, test } from 'bun:test';
import { buildIssueBatchAdoption } from '../../src/core/automation/issue-batch-adoption';
import { sealCampaignAuthoringTerminal } from '../../src/core/automation/campaign-authoring-budget';
import { makeAdoptionInput, makeIntent, makeSnapshot } from '../helpers/issue-batch-adoption-fixture';
describe('BRC6 adoption authority', () => {
  test('adopts 7 of 10 only with exhausted terminal; empty batch has no invented task', () => {
    const intent = makeIntent({}, 10); const f = makeAdoptionInput(intent, intent.slots.slice(0, 7));
    const receipt = buildIssueBatchAdoption(f).receipt; expect(receipt.issues).toHaveLength(7); expect(receipt.unfilled_slots).toEqual(['08', '09', '10']);
    expect(buildIssueBatchAdoption(makeAdoptionInput(intent, [])).receipt.issues).toEqual([]);
    const { protocol: _p, kind: _k, terminal_sha256: _d, ...terminal } = f.terminal;
    expect(() => buildIssueBatchAdoption({ ...f, terminal: sealCampaignAuthoringTerminal({ ...terminal, reason: 'authoring_completed' }) })).toThrow('partial adoption');
  });
  test('rejects stale terminal, model status and cross-session challenge', () => {
    const f = makeAdoptionInput();
    expect(() => buildIssueBatchAdoption({ ...f, authorization_sha256: 'f'.repeat(64) })).toThrow('terminal');
    expect(() => buildIssueBatchAdoption({ ...f, model_verified: false })).toThrow();
    expect(() => buildIssueBatchAdoption({ ...f, challenge: { ...f.challenge, source_session_ref: 'other' } })).toThrow('challenge source');
  });
  test.each(['unsupported-kind', 'unknown-capability', 'cycle', 'missing-dependency', 'incomplete-snapshot'])('rejects %s', kind => {
    const f = makeAdoptionInput();
    const overrides = kind === 'unsupported-kind' ? { issue_kind: 'feature' } : kind === 'unknown-capability' ? { primary_capability: 'unknown' } : kind === 'cycle' ? { depends_on_slots: ['01'] } : kind === 'missing-dependency' ? { depends_on_slots: ['10'] } : {};
    const snap = makeSnapshot(f.intent, f.intent.slots, overrides);
    expect(() => buildIssueBatchAdoption({ ...f, snapshot: { snapshot_receipt: snap.receipt, observations: kind === 'incomplete-snapshot' ? snap.observations.slice(1) : snap.observations } })).toThrow();
  });
});

test('consumes BRC5 repair-exhausted unfilled slots without adopting invalid metadata', () => {
  const f = makeAdoptionInput(); const good = makeSnapshot(f.intent, ['01']); const invalid = makeSnapshot(f.intent, ['02'], { issue_kind: 'feature' });
  // Keep provider identities unique while combining two independent provider observations.
  const bad = { ...invalid.observations[0]!, provider_issue_id: '2', url: 'https://github.com/acme/widgets/issues/2' };
  const { protocol: _op, kind: _ok, source_revision: _source, observation_sha256: _observation, ...rawBad } = bad;
  const rebuilt = buildProviderIssueObservation(rawBad);
  const observations = [...good.observations, rebuilt];
  const { protocol: _rp, kind: _rk, receipt_sha256: _rd, ...rawReceipt } = good.receipt;
  const snapshot_receipt = buildExternalSourceRefreshReceipt({ ...rawReceipt, source_revisions: observations.map(o => o.source_revision).sort(), observations_written: 2, issues_seen: 2 });
  const { protocol: _p, kind: _k, terminal_sha256: _d, ...terminal } = f.terminal;
  const result = buildIssueBatchAdoption({ ...f, terminal: sealCampaignAuthoringTerminal({ ...terminal, reason: 'authoring_exhausted' }), snapshot: { snapshot_receipt, observations, repair_exhausted_slots: ['02'] } });
  expect(result.receipt.issues.map(i => i.slot)).toEqual(['01']); expect(result.receipt.unfilled_slots).toEqual(['02']);
});
